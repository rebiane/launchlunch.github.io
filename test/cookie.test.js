import test from 'node:test';import assert from 'node:assert/strict';import {cookiePlan,cookiePose} from '../public/cookie.js';
test('cookie scores equal actual collected cookies; unique highest score wins',()=>{for(let n=2;n<=12;n++)for(let seed=0;seed<20;seed++){const p=cookiePlan(seed*997,n,Array.from({length:n},(_,i)=>i%4));const scores=Array(n).fill(0);for(const c of p.cookies)if(c.taken<=p.finish){scores[c.owner]+=c.value;const pos=cookiePose(p,c.owner,c.taken);assert.ok(Math.hypot(pos.x-c.x,pos.z-c.z)<.65);}assert.deepEqual(scores,p.scoreFrames.at(-1));assert.equal(scores[p.winner],Math.max(...scores));assert.equal(scores.filter(s=>s===scores[p.winner]).length,1);assert.ok(p.finish>=28000&&p.finish<=45000);}});

test('cookie runners never overlap and remain spread while moving to competing targets',()=>{for(let count=2;count<=12;count++)for(let seed=0;seed<10;seed++){const p=cookiePlan(seed*193,count);let travel=0;for(let f=1;f<p.frames.length;f++){const a=p.frames[f],prev=p.frames[f-1];for(let i=0;i<count;i++){travel+=Math.hypot(a[i*2]-prev[i*2],a[i*2+1]-prev[i*2+1]);for(let j=i+1;j<count;j++)assert.ok(Math.hypot(a[i*2]-a[j*2],a[i*2+1]-a[j*2+1])>=.85999);}}assert.ok(travel/count>12);}});


test('cookie supply scales with teams, has a visible cap and waits between refills',async()=>{
 const {cookieSupply}=await import('../public/cookie.js');
 assert.equal(cookieSupply(2).cap,3);assert.equal(cookieSupply(6).cap,6);assert.equal(cookieSupply(12).cap,11);
 for(const count of [2,4,6,8,12]){const p=cookiePlan(42,count),waves=[...new Set(p.cookies.filter(c=>c.start<28000).map(c=>c.start))];for(let i=1;i<waves.length;i++)assert.ok(waves[i]-waves[i-1]>=p.supply.interval);for(const time of waves)assert.ok(p.cookies.filter(c=>c.start<=time&&c.taken>time).length<=p.supply.cap);}
});

test('cookie waves telegraph drops and finish with scarce five-point cookies without cutting off the chase',async()=>{
 const {cookiePhase}=await import('../public/cookie.js');let comeback=false;
 for(let count=2;count<=12;count++)for(let seed=0;seed<20;seed++){
  const p=cookiePlan(seed*313,count),gold=p.cookies.filter(c=>c.value===5&&c.start<28000);
  assert.ok(gold.length>=2&&gold.length<=4);
  for(const c of p.cookies){assert.ok(c.taken>=c.start);if(c.start>0)assert.equal(c.start-c.warning,700);}
  assert.ok(!p.cookies.some(c=>c.value!==5&&c.warning>=16000));
  for(const start of new Set(gold.map(c=>c.start)))assert.ok(gold.filter(c=>c.start===start).length<=2);
  assert.ok(gold.every(c=>c.taken<=p.finish),'last golden cookie chase must finish');
  const pre=p.scoreFrames[Math.floor(19000/40)],max=Math.max(...pre);comeback ||= pre[p.winner]<max;
  assert.equal(cookiePhase(p,19500).phase,'warning');assert.equal(cookiePhase(p,25000).phase,'final');assert.equal(cookiePhase(p,p.finish).phase,'finished');
 }
 assert.ok(comeback,'golden waves should allow a real collected-score comeback');
});

test('blocked crowds reconsider targets instead of waiting forever on one cookie',()=>{
 const count=11,p=cookiePlan(178550,count,Array.from({length:count},(_,i)=>i%6));
 assert.ok(p.finish<=45000);assert.notEqual(p.winner,null);
 const scores=Array(count).fill(0);for(const c of p.cookies)if(c.taken<=p.finish){assert.ok(c.taken>=c.start);scores[c.owner]+=c.value;}
 assert.equal(scores.filter(s=>s===Math.max(...scores)).length,1);assert.equal(scores[p.winner],Math.max(...scores));
 assert.ok(p.cookies.filter(c=>c.value===5).every(c=>c.taken<=p.finish));
});

test('empty-table intervals keep entrants roaming at fixed speed without overlapping or early pickups',()=>{
 for(const count of [2,6,12])for(let seed=0;seed<5;seed++){
  const picks=Array.from({length:count},(_,i)=>i%6),p=cookiePlan(seed*9973,count,picks);let idleFrames=0,travel=0;
  for(let f=1;f<p.frames.length;f++){
   const time=f*40,empty=!p.cookies.some(c=>c.warning<=time&&c.taken>time-40);
   if(empty)idleFrames++;
   for(let i=0;i<count;i++){const distance=Math.hypot(p.frames[f][i*2]-p.frames[f-1][i*2],p.frames[f][i*2+1]-p.frames[f-1][i*2+1]);assert.ok(distance<=3.6*(1+Math.min(5,picks[i])*.02)*.04+1e-9);if(empty)travel+=distance;}
  }
  assert.ok(idleFrames>30);assert.ok(travel/idleFrames/count>.10,'entrants must keep roaming rather than waiting for the next cookie');
  assert.ok(p.cookies.every(c=>c.taken>=c.start));
 }
});
