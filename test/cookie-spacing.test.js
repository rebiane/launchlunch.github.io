import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieGame,stepCookieGame,COOKIE_SPAWN_GAP,COOKIE_FIRST_WARNING} from '../public/cookie.js';
test('cookie waves preserve supply and separate all overlapping landing/collectible lifetimes',()=>{
 for(const count of [2,4,8,12])for(let seed=0;seed<20;seed++){
  const game=createCookieGame(seed*7919,count);
  assert.equal(game.cookies.length,0);
  while(game.time<COOKIE_FIRST_WARNING)stepCookieGame(game);
  assert.equal(game.cookies.length,game.supply.cap);
  while(!game.finished)stepCookieGame(game);
  assert.ok(game.cookies.some(c=>c.warning>0),'later waves still replenish');
  for(let i=0;i<game.cookies.length;i++)for(let j=i+1;j<game.cookies.length;j++){
   const a=game.cookies[i],b=game.cookies[j];
   if(a.taken<=b.warning)continue;
   assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=COOKIE_SPAWN_GAP-1e-9,`count ${count} seed ${seed} overlapping spawns ${i}/${j}`);
  }
 }
});
test('uncollected cookies and telegraphs stay separated without exceeding the player supply cap',()=>{
 const game=createCookieGame(42,12),neutral=Object.fromEntries(game.positions.map((_,i)=>[i,{x:0,z:0}]));
 while(game.time<25000)stepCookieGame(game,neutral);
 assert.equal(game.cookies.length,game.supply.cap);
 for(const a of game.cookies)for(const b of game.cookies)if(a!==b)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=COOKIE_SPAWN_GAP);
});


test('bots notice each cookie only after its visible cue and their reaction delay',()=>{
 for(let seed=0;seed<12;seed++){
  const game=createCookieGame(seed*7919,6);
  assert.ok(game.noticeDelays.every(delay=>delay>=200&&delay<=750));
  while(!game.finished){
   stepCookieGame(game);
   for(let i=0;i<game.count;i++){
    const target=game.cookies[game.targets[i]];
    if(target)assert.ok(game.time>=target.warning+game.noticeDelays[i],'bot used a fresh cookie before noticing its visible cue');
   }
  }
 }
});
test('manual players can pursue and collect a new cookie before bot perception delay',()=>{
 const game=createCookieGame(42,2);game.cookies=[{x:game.positions[0].x,z:game.positions[0].z,value:1,warning:0,start:0,taken:Infinity,owner:null}];
 stepCookieGame(game,{0:{x:0,z:0}});
 assert.equal(game.scores[0],1);assert.equal(game.targets[1],-1);
});


test('an in-progress room saved before reaction tuning can resume safely',()=>{
 const game=createCookieGame(42,6);delete game.noticeDelays;
 assert.doesNotThrow(()=>stepCookieGame(game));
 assert.ok(game.targets.every(id=>id===-1));
});


test('cookie arena starts empty and the first wave warns before any pickup is possible',()=>{
 for(const count of [2,6,12]){
  const s=createCookieGame(42,count),neutral=Object.fromEntries(s.positions.map((_,i)=>[i,{x:0,z:0}]));
  assert.deepEqual(s.cookies,[]);
  while(s.time<COOKIE_FIRST_WARNING-40){stepCookieGame(s,neutral);assert.equal(s.cookies.length,0);}
  stepCookieGame(s,neutral);assert.equal(s.cookies.length,s.supply.cap);
  assert.ok(s.cookies.every(c=>c.warning===COOKIE_FIRST_WARNING&&c.start===COOKIE_FIRST_WARNING+700));
  s.positions[0]={x:s.cookies[0].x,z:s.cookies[0].z};
  while(s.time<s.cookies[0].start-40){stepCookieGame(s,neutral);assert.equal(s.scores[0],0);}
  stepCookieGame(s,neutral);assert.ok(s.scores[0]>0);
 }
});
