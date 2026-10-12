import assert from 'node:assert/strict';
const {chromium}=await import(process.env.LAUNCHLUNCH_PLAYWRIGHT||'playwright');
import {scrapeMap} from '../src/map-scrape.js';
import {DEFAULT_CENTER,distanceMeters} from '../src/places.js';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const start=Date.now(),result=await scrapeMap(browser,{center:DEFAULT_CENTER,keyword:'식당'});
 const nearby=result.items.filter(r=>distanceMeters(DEFAULT_CENTER,r)<=800);
 assert.ok(nearby.length>0,'nearby restaurants missing');
 assert.equal(new Set(nearby.map(r=>r.placeId)).size,nearby.length);
 console.log(JSON.stringify({elapsed:Date.now()-start,total:result.items.length,nearby:nearby.length,queries:result.queries,partial:result.partial}));
}finally{await browser.close()}
