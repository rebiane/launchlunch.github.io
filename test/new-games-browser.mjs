import assert from 'node:assert/strict';
const {chromium}=await import(process.env.LAUNCHLUNCH_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [mode,title] of [['fire','불판 대소동'],['boulder','와르르 도시락'],['crush','압착 주방']]){
  await page.goto('http://127.0.0.1:8787');await page.locator('#preview-open').click();assert.equal(await page.locator('[data-mode]').count(),8);await page.locator('#mode-'+mode).click();await page.locator('#demo').click();await page.locator('#survival-scene canvas').waitFor();await page.waitForFunction(mode=>document.querySelector('#survival-scene').dataset.mode===mode,mode);assert.equal(await page.locator('#arena-title').textContent(),title);assert.equal(await page.locator('#survival-scene').getAttribute('data-character-count'),'6');
  await page.waitForTimeout(13000);await page.locator('#arena').screenshot({path:'/private/tmp/lunchlaunch-'+mode+'.png'});
  await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+60000;});await page.waitForFunction(()=>document.querySelector('#race-status').textContent==='경기 종료');assert.equal(await page.locator('#leaderboard>span:not(.eliminated)').count(),1);console.log(mode+' preview survivor passed');
 }
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,modes:3,errors}));
}finally{await browser.close()}
