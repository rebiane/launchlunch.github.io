import assert from 'node:assert/strict';
const {chromium}=await import(process.env.LAUNCHLUNCH_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log(m.text().slice(0,1500))});page.on('requestfailed',r=>console.log(JSON.stringify({url:r.url().split('?')[0],error:r.failure()})));
 await page.goto('http://127.0.0.1:8787');await page.locator('#create-room').click();await page.locator('#connection.online').waitFor();await page.locator('#settings').click();await page.locator('#locate').click();
 await page.locator('#address-picker iframe').waitFor({timeout:20000});
 await page.waitForTimeout(2500);const frame=page.frames().find(f=>/postcode.*search|postcode.*guide|postcode.*layer/.test(f.url()))||page.frames().find(f=>f.url().includes('postcode'));if(!frame)throw new Error('Address service frame missing: '+page.frames().map(f=>f.url()));
 await frame.locator('#region_name').fill('서울 중구 세종대로 110');await frame.locator('#region_name').press('Enter');await frame.locator('button,a').filter({hasText:'서울 중구 세종대로 110'}).first().click({timeout:15000});
 if(await frame.getByText('지번 주소 선택 안함',{exact:true}).first().isVisible().catch(()=>false))await frame.getByText('지번 주소 선택 안함',{exact:true}).first().click();
 await page.locator('#address-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#location-selection').textContent.includes('선택한 위치: 서울 중구 세종대로 110'),{timeout:15000});await page.locator('#settings-form .full').click();await page.waitForFunction(()=>document.querySelector('#location-address').textContent.includes('세종대로 110'));assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,selected:'서울 중구 세종대로 110',errors}));
 await page.screenshot({path:'/private/tmp/lunchlaunch-address.png'});
}finally{await browser.close()}
