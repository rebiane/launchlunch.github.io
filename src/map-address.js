// Resolve only the address selected by the user, from a normal map page load.
const aliases=[['서울특별시','서울'],['부산광역시','부산'],['대구광역시','대구'],['인천광역시','인천'],['광주광역시','광주'],['대전광역시','대전'],['울산광역시','울산'],['세종특별자치시','세종'],['경기도','경기'],['강원특별자치도','강원'],['강원도','강원'],['충청북도','충북'],['충청남도','충남'],['전북특별자치도','전북'],['전라북도','전북'],['전라남도','전남'],['경상북도','경북'],['경상남도','경남'],['제주특별자치도','제주'],['제주도','제주']];
export function normalizeMapAddress(value){let text=String(value||'').normalize('NFKC').trim();for(const [full,short] of aliases)if(text.startsWith(full+' ')){text=short+text.slice(full.length);break;}return text.replace(/\s+/g,'');}
function selectedAddress(input){return Object.fromEntries(['roadAddress','jibunAddress','buildingName','sido','sigungu','bname'].map(k=>[k,String(input?.[k]||'').trim().slice(0,160)]));}
export function addressRowsToLocations(result,input){
 const selected=selectedAddress(input),requested=[selected.roadAddress,selected.jibunAddress].filter(Boolean).map(normalizeMapAddress);if(!requested.length)return [];
 const groups=[result?.address?.roadAddress,result?.address?.jibunsAddress],matches=new Map();
 for(const row of groups.flatMap(g=>Array.isArray(g?.list)?g.list:[])){
  const e=row?.addressElements||{};
  const elementsAddress=[e.sido||e.sidoShort,e.sigugun,row.isJibunAddress?e.dongmyun:e.roadName,row.isJibunAddress?e.ri:'',row.isJibunAddress?e.jibun:e.buildNumber].filter(Boolean).join(' ');
  if(![row.fullAddress,row.koreanAddress,elementsAddress].filter(Boolean).some(a=>requested.includes(normalizeMapAddress(a))))continue;
  if(row.x==null||row.y==null||String(row.x).trim()===''||String(row.y).trim()==='')continue;
  const lng=Number(row.x),lat=Number(row.y);if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng<124||lng>132||lat<33||lat>39)continue;
  const address=selected.roadAddress||selected.jibunAddress;
  matches.set(`${lng.toFixed(6)},${lat.toFixed(6)}`,{lng,lat,address,name:selected.buildingName||row.buildName||address,neighborhood:[selected.sido||e.sido,selected.sigungu||e.sigugun,selected.bname||e.dongmyun,e.ri].filter(Boolean).join(' '),road:selected.roadAddress?selected.roadAddress.replace(/\s+\d+(?:-\d+)?$/,''):[e.sido,e.sigugun,e.roadName].filter(Boolean).join(' ')});
 }
 // A similarly named place or two different coordinates must never pick the first hit.
 return matches.size===1?[...matches.values()]:[];
}
export async function scrapeAddress(browser,input){
 const selected=selectedAddress(input),query=selected.roadAddress||selected.jibunAddress;if(!query)throw new Error('주소 검색에서 정확한 주소를 선택해 주세요.');
 const page=await browser.newPage({viewport:{width:1024,height:768}});let timer,settled=false;
 let resolveResult,rejectResult;const responseResult=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});
 // Attach a rejection handler immediately while navigation is pending.
 responseResult.catch(()=>{});
 const onResponse=async response=>{
  if(settled)return;
  try{
   const url=new URL(response.url());if(url.origin!=='https://map.naver.com'||url.pathname!=='/p/api/search/allSearch'||normalizeMapAddress(url.searchParams.get('query'))!==normalizeMapAddress(query)||!response.ok())return;
   const data=await response.json();if(!data?.result?.address)return;
   const searched=data.result.metaInfo?.searchedQuery;if(typeof searched==='string'&&normalizeMapAddress(searched)!==normalizeMapAddress(query))return;
   const items=addressRowsToLocations(data.result,selected);settled=true;resolveResult({items,source:'naver-map'});
  }catch{/* Ignore unrelated or incomplete map responses. */}
 };
 try{
  await page.route('**/*',route=>['image','font','media'].includes(route.request().resourceType())?route.abort():route.continue());
  page.on('response',onResponse);
  timer=setTimeout(()=>{settled=true;rejectResult(new Error('주소 좌표 확인이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'));void page.close().catch(()=>{});},18000);
  const response=await page.goto('https://map.naver.com/p/search/'+encodeURIComponent(query),{waitUntil:'domcontentloaded',timeout:18000});
  if(response&&response.status()>=400)throw new Error('지도에서 주소를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  return await responseResult;
 }finally{settled=true;clearTimeout(timer);page.off('response',onResponse);await page.close().catch(()=>{});}
}
