const {chromium}=await import(process.env.LAUNCHLUNCH_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}});
 const lng=126.978,lat=37.5665,x=lng*20037508.34/180,y=Math.log(Math.tan((90+lat)*Math.PI/360))*20037508.34/Math.PI;
 for(const q of ['식당','서울 중구 세종대로 식당','서울시청 식당']){
  await page.goto('https://map.naver.com/p/search/'+encodeURIComponent(q)+`?c=${x},${y},16,0,0,0,dh&searchCoord=${lng}%3B${lat}`,{waitUntil:'domcontentloaded',timeout:20000});
  const f=await (await page.waitForSelector('#searchIframe')).contentFrame();
  await f.waitForFunction(()=>Object.values(window.__APOLLO_STATE__||{}).some(v=>v?.__typename==='PlaceListBusinessesItem'));
  const rows=await f.evaluate(()=>Object.values(window.__APOLLO_STATE__).filter(v=>v?.__typename==='PlaceListBusinessesItem').map(v=>({name:v.name,id:v.id,address:v.fullAddress,x:v.x,y:v.y})));
  console.log(JSON.stringify({q,url:page.url(),frame:f.url(),count:rows.length,rows:rows.filter(r=>/시청|세종대로 120/.test(JSON.stringify(r))).slice(0,20),sample:rows.slice(0,3)}));
 }
}finally{await browser.close()}
