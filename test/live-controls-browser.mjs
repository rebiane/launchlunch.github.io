import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.LAUNCHLUNCH_PLAYWRIGHT||'playwright');
const base=process.env.LAUNCHLUNCH_URL||'http://127.0.0.1:8787';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await page.route('**/touch-audit',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>.track-wrap{position:relative;width:390px;height:700px;touch-action:none}</style><section id="arena"><div class="track-wrap"></div></section>'}));
 for(const file of ['live-controls.js','game-rules.js'])await page.route('**/'+file,r=>r.fulfill({path:fileURLToPath(new URL('../public/'+file,import.meta.url))}));
 await page.goto(base+'/touch-audit');await page.evaluate(async()=>{window.inputs=[];window.controls=(await import('/live-controls.js')).createLiveControls({onInput:i=>inputs.push(i)});controls.setMode('island');controls.setActive(true)});
 await page.addStyleTag({path:fileURLToPath(new URL('../public/ui.css',import.meta.url))});await page.addStyleTag({path:fileURLToPath(new URL('../public/game-player.css',import.meta.url))});
 await page.addStyleTag({path:fileURLToPath(new URL('../public/live-controls-onehand.css',import.meta.url))});
 assert.equal(await page.locator('.touch-zone-jump').isVisible(),false);
 const last=()=>page.evaluate(()=>inputs.at(-1));
 await page.keyboard.down('Space');assert.equal((await last()).jumpHeld,true);await page.waitForTimeout(950);assert.equal((await last()).jumpHeld,true);await page.keyboard.up('Space');assert.equal((await last()).jumpHeld,false);
 await page.keyboard.down('KeyW');await page.keyboard.down('Space');assert.equal((await last()).z,-1);assert.equal((await last()).jumpHeld,true);await page.keyboard.up('Space');assert.equal((await last()).z,-1);assert.equal((await last()).jumpHeld,false);await page.keyboard.up('KeyW');
 const cdp=await page.context().newCDPSession(page),touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints}),point=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
 // A press never jumps immediately; a quick tap jumps only once on release.
 for(const x of [80,300]){
  await page.evaluate(()=>inputs.length=0);await touch('touchStart',[point(1,x,300)]);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>inputs.some(i=>i.jump||i.jumpHeld)),false);await touch('touchEnd',[]);assert.equal(await page.evaluate(()=>inputs.filter(i=>i.jump).length),1);assert.equal((await last()).jumpHeld,false);
 }
 // One finger steers on either half, then activates continuous jump while held.
 for(const x of [70,280]){
  await page.evaluate(()=>inputs.length=0);await touch('touchStart',[point(1,x,300)]);await touch('touchMove',[point(1,x+60,300)]);await page.waitForTimeout(100);assert.ok((await last()).x>.9);assert.equal((await last()).jumpHeld,false);await page.waitForTimeout(400);assert.equal((await last()).jumpHeld,true);assert.ok((await last()).x>.9);
  await touch('touchMove',[point(1,x-60,280)]);await page.waitForTimeout(50);assert.ok((await last()).x<-.8);assert.equal((await last()).jumpHeld,true);const jumps=await page.evaluate(()=>inputs.filter(i=>i.jump).length);await touch('touchEnd',[]);assert.equal((await last()).jumpHeld,false);assert.equal((await last()).x,0);assert.equal(await page.evaluate(()=>inputs.filter(i=>i.jump).length),jumps);
 }
 // Short drags and cancelled presses never turn into release-jumps.
 await page.evaluate(()=>inputs.length=0);await touch('touchStart',[point(1,100,300)]);await touch('touchMove',[point(1,170,300)]);await page.waitForTimeout(50);await touch('touchEnd',[]);assert.equal(await page.evaluate(()=>inputs.some(i=>i.jump)),false);
 await touch('touchStart',[point(1,100,300)]);await touch('touchCancel',[]);await page.waitForTimeout(480);assert.equal((await last()).jumpHeld,false);assert.equal(await page.evaluate(()=>inputs.some(i=>i.jump)),false);
 // Deactivation cancels the delayed hold before it can leak into another game.
 await touch('touchStart',[point(1,100,300)]);await page.evaluate(()=>controls.setActive(false));await page.waitForTimeout(480);assert.equal((await last()).jumpHeld,false);await touch('touchCancel',[]);await page.evaluate(()=>controls.setActive(true));
 await page.evaluate(()=>{controls.setMode('tricycle');inputs.length=0});
 assert.equal(await page.locator('.touch-zone-jump').isVisible(),false);
 // Diagonal steering must retain full horizontal input while accelerating.
 await page.keyboard.down('ArrowUp');assert.equal((await last()).z,-1);await page.keyboard.down('ArrowLeft');assert.equal((await last()).x,-1);assert.equal((await last()).z,-1);
 await page.keyboard.up('ArrowUp');assert.equal((await last()).z,0);assert.equal((await last()).x,-1);await page.keyboard.up('ArrowLeft');assert.equal((await last()).x,0);
 await page.keyboard.down('Space');assert.equal((await last()).z,-1);assert.equal((await last()).action,false);await page.keyboard.up('Space');assert.equal((await last()).z,0);
 // Either half of the screen is a full floating stick, not a shift button.
 for(const x of [80,300]){
  await touch('touchStart',[point(1,x,340)]);await touch('touchMove',[point(1,x+34,280)]);await page.waitForTimeout(80);
  assert.equal((await last()).x,1);assert.equal((await last()).z,-1);assert.equal((await last()).action,false);
  await touch('touchMove',[point(1,x-34,280)]);await page.waitForTimeout(80);assert.equal((await last()).x,-1);assert.equal((await last()).z,-1);
  await touch('touchMove',[point(1,x-34,340)]);await page.waitForTimeout(80);assert.equal((await last()).x,-1);assert.equal((await last()).z,0);
  await touch('touchCancel',[]);assert.equal((await last()).x,0);assert.equal((await last()).z,0);
 }
 await page.keyboard.down('ArrowUp');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await last()).z,0);await page.keyboard.up('ArrowUp');
 await page.evaluate(()=>controls.setMode('cookie'));assert.equal(await page.locator('.touch-zone-jump').isVisible(),false);await page.keyboard.down('Space');assert.equal((await last()).jumpHeld,false);await page.keyboard.up('Space');
 await page.evaluate(()=>{controls.setMode('shake');inputs.length=0});
 await page.keyboard.down('Space');assert.equal((await last()).action,true);assert.equal((await last()).jump,false);await page.keyboard.down('Space');assert.equal(await page.evaluate(()=>inputs.filter(i=>i.action).length),1);await page.keyboard.up('Space');assert.equal((await last()).action,false);
 await page.keyboard.down('ArrowLeft');assert.equal((await last()).x,-1);await page.keyboard.up('ArrowLeft');
 await touch('touchStart',[point(8,180,300)]);await touch('touchEnd',[]);assert.equal((await last()).action,true);
 await touch('touchStart',[point(9,180,300)]);await touch('touchMove',[point(9,250,300)]);await page.waitForTimeout(80);assert.ok((await last()).x>.9);await touch('touchEnd',[]);assert.equal((await last()).action,false);assert.equal((await last()).x,0);
 await touch('touchStart',[point(10,180,300)]);await touch('touchCancel',[]);assert.equal((await last()).action,false);
 console.log(JSON.stringify({passed:true,checks:['keyboard hold/release','movement + held jump','tap once anywhere', 'one finger movement + delayed jump', 'release/cancel/deactivation cancel timers', 'short drag never jumps','river diagonal throttle, release and full-screen touch','blur resets hold','nonjump mode rejects hold']}));
}finally{await browser.close();}
