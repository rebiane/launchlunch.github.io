// Read business rows, never map markers: several businesses can share one coordinate.
import {mapSearchUrl} from '../public/map-search.js';
export const MAP_SEARCH_VERSION=3;
export async function scrapeMap(browser,{center,keyword='식당'}){
 const query=String(keyword||'식당').trim()||'식당';
 const queries=[...new Set([query,center.road?`${center.road} ${query}`:null].filter(Boolean))];
 // Independent searches can load together; images and map tiles are not needed for business rows.
 const batches=await Promise.allSettled(queries.map(async search=>{
  const page=await browser.newPage({viewport:{width:1280,height:850}}),rows=new Map();let partial=false;
  page.setDefaultTimeout(8000);
  try{
   await page.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())?route.abort():route.continue());
   const response=await page.goto(mapSearchUrl(center,search),{waitUntil:'domcontentloaded',timeout:20000});
   if(response&&response.status()>=400)throw new Error('네이버 지도에서 현재 목록을 열 수 없어요.');
   const element=await page.waitForSelector('#searchIframe',{timeout:15000}),frame=await element.contentFrame();
   if(!frame)throw new Error('지도 목록을 찾지 못했어요.');
   await frame.waitForFunction(()=>!!window.__APOLLO_STATE__,null,{timeout:12000});
   for(let pageNumber=1;pageNumber<=3;pageNumber++){
    const items=await frame.evaluate(()=>Object.values(window.__APOLLO_STATE__||{}).filter(v=>v&&v.__typename==='PlaceListBusinessesItem'&&v.id&&v.name&&v.x&&v.y).map(v=>({placeId:String(v.id),name:v.name,address:v.fullAddress||[v.commonAddress,v.roadAddress||v.address].filter(Boolean).join(' '),category:v.category||'',lng:Number(v.x),lat:Number(v.y)})));
    for(const row of items)if(Number.isFinite(row.lng)&&Number.isFinite(row.lat))rows.set(row.placeId,{...row,mapUrl:`https://map.naver.com/p/entry/place/${row.placeId}`});
    if(pageNumber===3)break;
    const next=frame.getByRole('link',{name:String(pageNumber+1),exact:true});if(!await next.count())break;
    // Apollo can return the same businesses on another page/query. Observe its page result,
    // not global deduplication, otherwise legitimate duplicate pages wait seven seconds.
    const before=await frame.evaluate(()=>JSON.stringify(window.__APOLLO_STATE__||{}));
    await next.first().click();
    try{await frame.waitForFunction(state=>JSON.stringify(window.__APOLLO_STATE__||{})!==state,before,{timeout:7000,polling:100});}catch{partial=true;break;}
   }
   return {items:[...rows.values()],partial};
  }catch(error){if(rows.size)return {items:[...rows.values()],partial:true};throw error;}finally{await page.close();}
 }));
 const found=new Map();let partial=false;
 for(const batch of batches){if(batch.status==='rejected'){partial=true;continue;}partial ||= batch.value.partial;for(const row of batch.value.items)found.set(row.placeId,row);}
 if(!found.size)throw new Error('지도가 검색 목록을 제공하지 않았어요. 잠시 후 다시 검색해 주세요.');
 return {items:[...found.values()],fetchedAt:Date.now(),source:'naver-map',coverageVersion:MAP_SEARCH_VERSION,query,queries,partial};
}
