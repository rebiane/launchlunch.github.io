import {scrapeMap,MAP_SEARCH_VERSION} from './map-scrape.js';
import {coordinate,distanceMeters,nearbyRestaurants,resolveAddress,DEFAULT_CENTER,normalizedAddress} from './places.js';
import {scrapeAddress} from './map-address.js';
const FRESH=30*60*1000,ADDRESS_FRESH=7*86400000,BROWSER_TIMEOUT=35000;
export function browserErrorMessage(error){
 const message=String(error?.message||error||'');
 if(/browser time limit exceeded for today/i.test(message))return 'Cloudflare 무료 지도 검색 시간(하루 10분)을 모두 사용했어요. 한국시간 오전 9시에 초기화돼요. 기존 목록을 이용하거나 식당을 직접 추가해 주세요.';
 if(Number(error?.status||error?.statusCode||error?.response?.status)===429||/\b429\b|too many requests|rate limit/i.test(message))return '지금 지도 검색 요청이 많아요. 잠시 후 다시 시도해 주세요.';
 return '지도에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
export class PlaceCatalog{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.inflight=new Map();this.browserQueue=Promise.resolve();}
 once(key,work){if(this.inflight.has(key))return this.inflight.get(key);const pending=Promise.resolve().then(work).finally(()=>this.inflight.delete(key));this.inflight.set(key,pending);return pending;}
 async launchBrowser(){const {launch}=await import('@cloudflare/playwright');return launch(this.env.BROWSER);}
 browse(input){
  const run=async()=>{
   if(this.env.LOCAL_SCRAPER_URL){const r=await fetch(this.env.LOCAL_SCRAPER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(40000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'지도에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');return data;}
   if(!this.env.BROWSER)throw new Error('지도 검색 서버가 아직 연결되지 않았어요.');
   let browser,timer;
   try{browser=await this.launchBrowser();timer=setTimeout(()=>browser.close().catch(()=>{}),BROWSER_TIMEOUT);return input.kind==='address'?await scrapeAddress(browser,input.address):await scrapeMap(browser,input);}
   catch(error){throw new Error(browserErrorMessage(error));}
   finally{clearTimeout(timer);await browser?.close().catch(()=>{});}
  };
  const result=this.browserQueue.then(run,run);this.browserQueue=result.catch(()=>{});return result;
 }
 async refresh(key,input){
  return this.once(key,async()=>{
   let result;
   try{result=await this.browse(input);if(input.kind!=='address'&&result.coverageVersion!==MAP_SEARCH_VERSION)throw new Error('지도 검색을 다시 시도해 주세요.');}
   catch(error){
    if(!this.env.NAVER_CLIENT_ID||!this.env.NAVER_CLIENT_SECRET)throw error;
    result=input.kind==='address'?{items:await resolveAddress(this.env,input.address),source:'naver-search'}:await nearbyRestaurants(this.env,input);
   }
   if(input.kind==='address'&&!result.items?.length)throw new Error('선택한 주소의 정확한 지도 좌표를 찾지 못했어요. 다른 주소를 선택해 주세요.');
   result={...result,fetchedAt:Date.now()};await this.ctx.storage.put(key,result);return result;
  });
 }
 async fetch(request){
  try{
   const b=await request.json();
   if(b.kind==='address'){
    const address=Object.fromEntries(['roadAddress','jibunAddress','buildingName','sido','sigungu','bname'].map(k=>[k,String(b.address?.[k]||'').trim().slice(0,160)]));
    if(!address.roadAddress&&!address.jibunAddress)throw new Error('주소 검색에서 주소를 선택해 주세요.');
    if(normalizedAddress(address.roadAddress||address.jibunAddress)===normalizedAddress(DEFAULT_CENTER.address))return Response.json({items:[{...DEFAULT_CENTER,name:address.buildingName||'대륭포스트타워 8차'}]});
    const key='address-v1:'+normalizedAddress(address.roadAddress||address.jibunAddress);let result=await this.ctx.storage.get(key);
    if(!result||Date.now()-result.fetchedAt>ADDRESS_FRESH)result=await this.refresh(key,{kind:'address',address});
    return Response.json(result);
   }
   if(!coordinate(b.center?.lng,b.center?.lat))throw new Error('검색 중심 위치를 먼저 선택해 주세요.');
   b.center={...b.center,...coordinate(b.center.lng,b.center.lat)};
   const keyword=String(b.keyword||'식당').trim().slice(0,40)||'식당',radius=Math.max(100,Math.min(3000,Number(b.radiusMeters)||800));
   const key=`map-v${MAP_SEARCH_VERSION}:`+b.center.lng.toFixed(3)+':'+b.center.lat.toFixed(3)+':'+keyword,input={center:b.center,keyword,radiusMeters:3000};
   let result=await this.ctx.storage.get(key);const stale=result&&Date.now()-result.fetchedAt>FRESH;
   if(stale)this.ctx.waitUntil(this.refresh(key,input).catch(()=>{}));
   else if(!result)result=await this.refresh(key,input);
   const items=result.items.map(r=>({...r,distanceMeters:Math.round(distanceMeters(b.center,r))})).filter(r=>r.distanceMeters<=radius).sort((a,b)=>a.distanceMeters-b.distanceMeters);
   return Response.json({...result,items,radiusMeters:radius,stale:!!stale});
  }catch(e){return Response.json({error:e.message||'식당 목록을 불러오지 못했어요.'},{status:400});}
 }
}
async function catalogRequest(env,options){const response=await env.PLACES.get(env.PLACES.idFromName('shared-catalog')).fetch(new Request('https://places/search',{method:'POST',body:JSON.stringify(options)}));const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
export async function searchPlaces(env,options){if(!env.PLACES)return nearbyRestaurants(env,options);return catalogRequest(env,options);}
export async function locateAddress(env,address){if(!env.PLACES)return resolveAddress(env,address);return (await catalogRequest(env,{kind:'address',address})).items;}
