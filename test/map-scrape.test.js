import test from 'node:test';import assert from 'node:assert/strict';import {scrapeMap} from '../src/map-scrape.js';
function fixture({failSecond=false}={}){
 let created=0,closed=0,active=0,peak=0;const visits=[],routes=[];
 const browser={async newPage(){const query=created++;active++;peak=Math.max(peak,active);let page=1,state={};
  function load(){state={ROOT_QUERY:{currentPage:page},...Object.fromEntries((query===0?[1,2,3]:[2,2,4]).slice(0,page).map(id=>['Place:'+id,{__typename:'PlaceListBusinessesItem',id:String(id),name:'식당 '+id,x:126.97,y:37.56}]))};}load();
  const frame={async evaluate(fn){globalThis.window={__APOLLO_STATE__:state};return fn();},async waitForFunction(fn,arg){globalThis.window={__APOLLO_STATE__:state};assert.ok(fn(arg),'must detect a duplicate result page without waiting for a new business ID');},getByRole(_,{name}){return {async count(){return Number(name)<=3?1:0},first(){return this},async click(){page=Number(name);visits.push([query,page]);load();}}}};
  return {setDefaultTimeout(){},async route(_,fn){routes.push(fn)},async goto(){await new Promise(r=>setTimeout(r,5));if(query===1&&failSecond)throw new Error('Unavailable');return {status:()=>200}},async waitForSelector(){return {contentFrame:async()=>frame}},async close(){active--;closed++;}};
 }};
 return {browser,stats:()=>({created,closed,peak,visits,routes})};
}
test('map reads all three pages of both searches concurrently, including duplicate pages',async()=>{
 const f=fixture(),result=await scrapeMap(f.browser,{center:{lat:37.56,lng:126.97,road:'테스트로'},keyword:'식당'});
 assert.deepEqual(result.items.map(x=>x.placeId),['1','2','3','4']);assert.equal(result.partial,false);const s=f.stats();assert.equal(s.peak,2);assert.equal(s.closed,2);assert.equal(s.visits.length,4);
 for(const type of ['image','font','media','script','xhr','fetch','stylesheet']){let action;await s.routes[0]({request:()=>({resourceType:()=>type}),abort:()=>action='abort',continue:()=>action='continue'});assert.equal(action,['image','font','media'].includes(type)?'abort':'continue');}
});
test('one failed query preserves complete rows from the other and closes every page',async()=>{const f=fixture({failSecond:true}),r=await scrapeMap(f.browser,{center:{lat:37.56,lng:126.97,road:'테스트로'}});assert.equal(r.items.length,3);assert.equal(r.partial,true);assert.equal(f.stats().closed,2);});
