import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinate,distanceMeters,DEFAULT_CENTER,nearbyRestaurants} from '../src/places.js';
test('NAVER integer coordinates convert to degrees and distance is measured from the building',()=>{
  assert.deepEqual(coordinate('1269780000','375665000'),{lng:126.978,lat:37.5665});
  assert.equal(distanceMeters(DEFAULT_CENTER,DEFAULT_CENTER),0);
  assert.ok(distanceMeters(DEFAULT_CENTER,{lat:37.6,lng:127.0})>2000);
  assert.equal(coordinate('bad',12),null);
});
test('restaurant keywords stay separate; far and non-restaurant results are removed',async t=>{
  const queries=[];
  t.mock.method(globalThis,'fetch',async url=>{
    queries.push(new URL(url).searchParams.get('query'));
    return Response.json({items:[
      {title:'가까운 돈까스',category:'음식점>일식',roadAddress:'검증 주소',mapx:'1269780000',mapy:'375665000'},
      {title:'먼 돈까스',category:'음식점>일식',roadAddress:'먼 주소',mapx:'1270000000',mapy:'376000000'},
      {title:'식당이 아닌 가게',category:'생활,편의>편의점',mapx:'1269780000',mapy:'375665000'}]});
  });
  const result=await nearbyRestaurants({NAVER_CLIENT_ID:'test',NAVER_CLIENT_SECRET:'test'},{center:{lat:37.5665,lng:126.978,neighborhood:'서울 중구 태평로1가',road:'서울 중구 세종대로'},keyword:'돈까스',radiusMeters:800});
  assert.deepEqual(result.items.map(r=>r.name),['가까운 돈까스']);
  assert.ok(queries.every(q=>q.endsWith(' 돈까스')&&!q.includes('예시 건물')&&!q.includes('공개 예시 건물')));
  await assert.rejects(()=>nearbyRestaurants({}, {center:null}),/출발지/);
});

test('address selection resolves only an exact chosen building, never a similarly named nearby place',async()=>{
 const {resolveAddress}=await import('../src/places.js'),before=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({items:[{title:'wrong',roadAddress:'서울특별시 중구 세종대로 1200',address:'서울 중구 태평로1가 123',mapx:1269785000,mapy:375669000},{title:'right',roadAddress:'서울특별시 중구 세종대로 120 1층',address:'서울 중구 태평로1가 832',mapx:1269785000,mapy:375669000}]});
  const found=await resolveAddress({NAVER_CLIENT_ID:'test',NAVER_CLIENT_SECRET:'test'},{roadAddress:'서울 중구 세종대로 120',sido:'서울',sigungu:'중구',bname:'태평로1가'});assert.equal(found.length,1);assert.equal(found[0].name,'서울 중구 세종대로 120');assert.equal(found[0].lng,126.9785);
  globalThis.fetch=async()=>Response.json({items:[]});assert.deepEqual(await resolveAddress({NAVER_CLIENT_ID:'test',NAVER_CLIENT_SECRET:'test'},{roadAddress:'서울 중구 없는길 777'}),[]);
 }finally{globalThis.fetch=before;}
});
