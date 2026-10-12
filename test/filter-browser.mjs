import assert from 'node:assert/strict';
const {chromium}=await import(process.env.LAUNCHLUNCH_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LAUNCHLUNCH_URL||'http://127.0.0.1:8787');await page.locator('#create-room').click();await page.locator('#connection.online').waitFor();await page.locator('#start').click();await page.locator('#search').click();await page.locator('#search-dialog[open]').waitFor({timeout:55000});
 const total=await page.locator('.search-result').count();assert.ok(total>0);const name=await page.locator('.search-result h3').first().textContent();await page.locator('#list-search').fill(name);assert.ok(await page.locator('.search-result').count()>=1);
 await page.locator('#list-search').fill('없는가게12345');assert.equal(await page.locator('.search-result').count(),0);await page.locator('#list-search').fill(name);await page.locator('[data-search-index]').first().click();await page.locator('.search-dialog-header [data-close]').click();await page.waitForFunction(name=>[...document.querySelectorAll('.card-info strong')].some(n=>n.textContent===name),name);
 await page.locator('#search').click();await page.locator('#search-dialog[open]').waitFor();await page.locator('.search-dialog-body').evaluate(e=>e.scrollTop=e.scrollHeight);assert.equal(await page.locator('.search-dialog-header [data-close]').isVisible(),true);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log(JSON.stringify({passed:true,total,checks:['list filter','filtered addition','fixed close'],errors}));
}finally{await browser.close();}
