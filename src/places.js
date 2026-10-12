export const DEFAULT_CENTER={lat:37.4810734,lng:126.8943969,address:'서울특별시 구로구 디지털로26길 43',neighborhood:'서울특별시 구로구 구로동',road:'서울특별시 구로구 디지털로26길'};
export function coordinate(x,y){
  let lng=Number(x),lat=Number(y);
  if(Math.abs(lng)>180)lng/=1e7;
  if(Math.abs(lat)>90)lat/=1e7;
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&lat!==0&&lng!==0?{lat,lng}:null;
}
export function distanceMeters(a,b){
  const rad=v=>v*Math.PI/180,dy=rad(b.lat-a.lat),dx=rad(b.lng-a.lng);
  const h=Math.sin(dy/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dx/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
const decode=s=>String(s||'').replace(/<[^>]*>/g,'').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
export async function localSearch(env,query,sort='random'){
  if(!env.NAVER_CLIENT_ID||!env.NAVER_CLIENT_SECRET)throw new Error('네이버 검색 연결 전입니다. 지도에서 검색하거나 식당을 직접 추가해 주세요.');
  const params=new URLSearchParams({query,display:'5',sort});
  const response=await fetch(`https://openapi.naver.com/v1/search/local.json?${params}`,{headers:{'X-Naver-Client-Id':env.NAVER_CLIENT_ID,'X-Naver-Client-Secret':env.NAVER_CLIENT_SECRET},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('네이버 검색을 사용할 수 없어요. 연결 설정 또는 호출 한도를 확인해 주세요.');
  return (await response.json()).items||[];
}
export function asLocation(item){
  const point=coordinate(item.mapx,item.mapy);if(!point)return null;
  const address=decode(item.roadAddress||item.address);
  return {...point,name:decode(item.title),address,neighborhood:decode(item.address).replace(/\s+\d.*$/,''),road:address.replace(/\s+\d.*$/,'')};
}
export async function resolveLocations(env,query){return (await localSearch(env,query,'random')).map(asLocation).filter(Boolean);}
export const normalizedAddress=value=>decode(value).replace(/서울특별시/g,'서울').replace(/부산광역시/g,'부산').replace(/대구광역시/g,'대구').replace(/인천광역시/g,'인천').replace(/광주광역시/g,'광주').replace(/대전광역시/g,'대전').replace(/울산광역시/g,'울산').replace(/경기도/g,'경기').replace(/\s+/g,' ').trim();
export async function resolveAddress(env,input){
 const a=Object.fromEntries(['roadAddress','jibunAddress','buildingName','sido','sigungu','bname'].map(k=>[k,String(input?.[k]||'').trim().slice(0,160)]));
 const address=a.roadAddress||a.jibunAddress;if(!address)throw new Error('주소 검색에서 도로명 또는 지번 주소를 선택해 주세요.');
 if(normalizedAddress(address)===normalizedAddress(DEFAULT_CENTER.address))return [{...DEFAULT_CENTER,name:a.buildingName||'대륭포스트타워 8차'}];
 const addresses=[a.roadAddress,a.jibunAddress].filter(Boolean).map(normalizedAddress);
 const queries=[...new Set([a.roadAddress,a.jibunAddress,a.buildingName?[a.sido,a.sigungu,a.buildingName].filter(Boolean).join(' '):''].filter(Boolean))];
 const batches=await Promise.allSettled(queries.map(q=>localSearch(env,q)));
 for(const batch of batches)if(batch.status==='fulfilled')for(const item of batch.value){
  const matches=[item.roadAddress,item.address].filter(Boolean).some(value=>addresses.some(a=>{const b=normalizedAddress(value);return b===a||b.startsWith(a+' ')||b.startsWith(a+'(');}));
  const location=asLocation(item);if(matches&&location)return [{...location,name:a.buildingName||address,address,neighborhood:[a.sido,a.sigungu,a.bname].filter(Boolean).join(' ')||location.neighborhood,road:a.roadAddress.replace(/\s+\d.*$/,'')||location.road}];
 }
 return [];
}
export async function nearbyRestaurants(env,{center,keyword='',radiusMeters=800}){
  if(!center||!coordinate(center.lng,center.lat))throw new Error('방 설정에서 출발지 위치를 먼저 확인해 주세요.');
  const scopes=[...new Set([center.neighborhood,center.road].filter(Boolean))];
  if(!scopes.length)throw new Error('방 설정에서 건물명으로 위치를 찾아 선택해 주세요.');
  const keywords=keyword.trim()&&!['식당','음식점','맛집'].includes(keyword.trim())?[keyword.trim()]:['식당','한식','백반','국밥','찌개','고기','일식','초밥','돈까스','중식','마라탕','분식','김밥','떡볶이','면요리','칼국수','베트남음식','양식','파스타','햄버거','샐러드'];
  const queries=scopes.flatMap(scope=>keywords.map(word=>`${scope} ${word}`));
  const responses=[];let cursor=0,failedQueries=0;const started=Date.now();
  await Promise.all(Array.from({length:Math.min(6,queries.length)},async()=>{
    while(cursor<queries.length){if(Date.now()-started>20000){failedQueries+=queries.length-cursor;cursor=queries.length;break;}const query=queries[cursor++];try{responses.push(await localSearch(env,query));}catch{failedQueries++;}}
  }));
  if(!responses.length)throw new Error('네이버 검색에 응답이 없어요. 잠시 후 다시 검색해 주세요.');
  const found=new Map();let missingCoordinates=0;
  for(const items of responses)for(const item of items){
    // Local search can return shops and offices. Only restaurant-category results belong here.
    if(!/(음식점|한식|일식|중식|양식|분식|돈가스|돈까스|국수|육류|고기요리|샤브샤브|뷔페|도시락|샌드위치|햄버거|치킨|피자|해물|생선|아시아음식|베트남음식|인도음식|태국음식|카레|초밥|우동|라면|라멘|족발|보쌈|곱창|찌개|전골|국밥|쌀국수|냉면|닭갈비|순대|백반|정식)/.test(item.category||''))continue;
    const point=coordinate(item.mapx,item.mapy);if(!point){missingCoordinates++;continue;}
    const meters=distanceMeters(center,point);if(meters>radiusMeters)continue;
    const name=decode(item.title),address=decode(item.roadAddress||item.address),id=`${name}|${address}`;
    if(found.has(id))continue;
    found.set(id,{name,address,category:decode(item.category),lat:point.lat,lng:point.lng,distanceMeters:Math.round(meters),mapUrl:`https://map.naver.com/p/search/${encodeURIComponent(name)}`});
  }
  return {items:[...found.values()].sort((a,b)=>a.distanceMeters-b.distanceMeters),radiusMeters,missingCoordinates,partial:failedQueries>0,queryCount:queries.length};
}
