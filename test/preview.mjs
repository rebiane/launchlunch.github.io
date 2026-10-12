import assert from 'node:assert/strict';
const {chromium}=await import(process.env.LAUNCHLUNCH_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({headless:true});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LAUNCHLUNCH_URL||'http://127.0.0.1:8787');
 await page.evaluate(()=>{window.previewTime=Date.now();Date.now=()=>window.previewTime;crypto.getRandomValues=a=>{a.fill(42);return a;};});
 await page.locator('#preview-open').click();assert.equal(await page.locator('#arena').isVisible(),false);
 await page.locator('#mode-island').click();assert.equal(await page.locator('#preview-confirm').isVisible(),true);assert.equal(await page.locator('#arena').isVisible(),false);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#preview-confirm').isVisible(),false);
 await page.locator('#mode-island').click();await page.locator('#demo').click();await page.locator('#island-scene canvas').waitFor();
 assert.equal(await page.locator('#leaderboard>span').count(),6);
 const scrollBefore=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,600);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>scrollY),scrollBefore);
 await page.evaluate(()=>window.previewTime+=8000);await page.waitForTimeout(500);
 await page.screenshot({path:'/private/tmp/lunchlaunch-mobile-preview-player.png'});
 for(const size of [{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(size);await page.waitForTimeout(150);const fit=await page.locator('.track-wrap').evaluate(e=>{const r=e.getBoundingClientRect();return r.height>120&&r.top>=0&&r.bottom<=innerHeight});assert.equal(fit,true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.evaluate(()=>window.previewTime+=90000);await page.locator('#preview-finish').waitFor({state:'visible'});await page.screenshot({path:'/private/tmp/lunchlaunch-mobile-preview-finish.png'});
 await page.locator('#preview-restart').click();assert.equal(await page.locator('#preview-finish').isVisible(),false);await page.waitForFunction(()=>document.querySelector('#race-status').textContent==='출발 준비');
 await page.evaluate(()=>window.previewTime+=100000);await page.locator('#preview-other').waitFor({state:'visible'});await page.locator('#preview-other').click();assert.equal(await page.locator('#preview-player').isVisible(),false);assert.equal(await page.locator('#arena').isVisible(),false);
 await page.locator('#mode-race').click();await page.locator('#demo').click();await page.locator('#circuit-scene canvas').waitFor();assert.equal(await page.locator('#circuit-scene').getAttribute('data-character-count'),'6');await page.keyboard.press('Escape');assert.equal(await page.locator('#preview-player').isVisible(),false);await page.waitForFunction(()=>document.querySelector('#mode-race')===document.activeElement);
 assert.deepEqual(errors,[]);console.log('Preview dialog: confirm/cancel, viewport/rotation, scroll lock, six entrants, restart, other game, Escape/focus passed');
}finally{await browser.close();}
