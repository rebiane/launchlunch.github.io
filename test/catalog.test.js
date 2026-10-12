import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaceCatalog,browserErrorMessage} from '../src/catalog.js';
import {MAP_SEARCH_VERSION} from '../src/map-scrape.js';
const center={lng:126.97,lat:37.56,road:'검증로',neighborhood:'검증동'};
const req=input=>new Request('https://catalog/search',{method:'POST',body:JSON.stringify(input)});
function fixture(env={LOCAL_SCRAPER_URL:'http://mock-scraper'}){
 const saved=new Map(),pending=[];
 const ctx={storage:{get:async k=>structuredClone(saved.get(k)),put:async(k,v)=>saved.set(k,structuredClone(v))},waitUntil(p){pending.push(p)}};
 return {catalog:new PlaceCatalog(ctx,env),saved,pending};
}
function result(name='검증 식당'){return {coverageVersion:MAP_SEARCH_VERSION,source:'naver-map',fetchedAt:Date.now(),items:[{name,lng:center.lng,lat:center.lat,placeId:'1001'}]};}
function mockFetch(t,fn){const original=globalThis.fetch;globalThis.fetch=fn;t.after(()=>{globalThis.fetch=original});}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
const tick=()=>new Promise(r=>setImmediate(r));

test('cold identical searches share one scrape and serve later searches from cache',async t=>{
 const f=fixture(),gate=deferred();let calls=0;
 mockFetch(t,async()=>{calls++;await gate.promise;return Response.json(result())});
 const a=f.catalog.fetch(req({center,keyword:'식당',radiusMeters:800})),b=f.catalog.fetch(req({center,keyword:'식당',radiusMeters:1200}));
 await tick();assert.equal(calls,1);gate.resolve();
 const [ra,rb]=await Promise.all([a,b]);assert.equal(ra.status,200);assert.equal(rb.status,200);
 assert.equal((await ra.json()).radiusMeters,800);assert.equal((await rb.json()).radiusMeters,1200);
 assert.equal((await (await f.catalog.fetch(req({center,keyword:'식당'}))).json()).items.length,1);assert.equal(calls,1);assert.equal(f.catalog.inflight.size,0);
});

test('stale restaurants return immediately while waitUntil refreshes shared cache',async t=>{
 const f=fixture(),gate=deferred(),key=`map-v${MAP_SEARCH_VERSION}:126.970:37.560:식당`;let calls=0;
 f.saved.set(key,{...result('이전 식당'),fetchedAt:Date.now()-1800001});
 mockFetch(t,async()=>{calls++;await gate.promise;return Response.json(result('갱신 식당'))});
 const response=await f.catalog.fetch(req({center,keyword:'식당'}));
 const data=await response.json();assert.equal(data.stale,true);assert.equal(data.items[0].name,'이전 식당');assert.equal(f.pending.length,1);
 await tick();assert.equal(calls,1);assert.equal(f.catalog.inflight.size,1);
 gate.resolve();await Promise.all(f.pending);
 const refreshed=await (await f.catalog.fetch(req({center,keyword:'식당'}))).json();assert.equal(refreshed.stale,false);assert.equal(refreshed.items[0].name,'갱신 식당');assert.equal(calls,1);
});

test('address lookup works with no Naver keys and caches its local scraper coordinates',async t=>{
 const f=fixture(),address={roadAddress:'검증시 검증로 10',buildingName:'검증 건물'};let calls=0;
 mockFetch(t,async(_,init)=>{calls++;const input=JSON.parse(init.body);assert.equal(input.kind,'address');assert.equal(input.address.roadAddress,address.roadAddress);return Response.json({items:[{...center,address:address.roadAddress}],source:'naver-map'})});
 for(let i=0;i<2;i++){const r=await f.catalog.fetch(req({kind:'address',address}));assert.equal(r.status,200);assert.equal((await r.json()).items[0].lat,center.lat);}
 assert.equal(calls,1);
});

test('actual Cloudflare errors distinguish daily time exhaustion from temporary 429s without exposing internals',()=>{
 assert.match(browserErrorMessage(new Error('Browser time limit exceeded for today')),/하루 10분.*오전 9시/);
 assert.match(browserErrorMessage(Object.assign(new Error('private endpoint details'),{status:429})),/요청이 많아요/);
 assert.match(browserErrorMessage(new Error('429 Too Many Requests')),/잠시 후/);
 assert.doesNotMatch(browserErrorMessage(new Error('internal credential-like details')),/internal|credential/);
});

test('obsolete eight-run and eight-minute counters never prevent a new Cloudflare search',async()=>{
 const f=fixture({BROWSER:{}}),day=new Date().toISOString().slice(0,10);let launches=0;
 f.saved.set('budget',{day,count:8});f.saved.set('browser-time',{day,usedMs:480000});
 f.catalog.launchBrowser=async()=>{launches++;return {async newPage(){const state={p:{__typename:'PlaceListBusinessesItem',id:'1001',name:'검증 식당',x:center.lng,y:center.lat}};const frame={async evaluate(fn){globalThis.window={__APOLLO_STATE__:state};return fn()},async waitForFunction(){},getByRole(){return {count:async()=>0}}};return {setDefaultTimeout(){},route:async()=>{},goto:async()=>({status:()=>200}),waitForSelector:async()=>({contentFrame:async()=>frame}),close:async()=>{}}},close:async()=>{}}};
 const response=await f.catalog.fetch(req({center,keyword:'식당'}));assert.equal(response.status,200);assert.equal((await response.json()).items.length,1);assert.equal(launches,1);
 assert.equal(f.saved.get('budget').count,8);assert.equal(f.saved.get('browser-time').usedMs,480000);
});

test('Cloudflare launch time exhaustion is returned as the friendly daily-limit message',async()=>{
 const f=fixture({BROWSER:{}});f.catalog.launchBrowser=async()=>{throw new Error('Browser time limit exceeded for today')};
 const r=await f.catalog.fetch(req({center,keyword:'식당'}));assert.equal(r.status,400);assert.match((await r.json()).error,/하루 10분.*오전 9시/);assert.equal(f.catalog.inflight.size,0);
});
