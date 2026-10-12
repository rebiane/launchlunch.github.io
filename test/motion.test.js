import test from 'node:test';
import assert from 'node:assert/strict';
import {bookPlan,bookPose,BOOK_MOVE_SPEED,insideHole,BOOK_CHARACTER_RADIUS} from '../public/book-motion.js';
import {islandPlan,knockbackPosition,runnerPosition,RUNNER_SPEED,jumpPose} from '../public/race.js';
test('book starts centered, changes holes, preserves motion through each page, and freezes eliminations',()=>{
 for(let n=2;n<=12;n++)for(let seed=0;seed<20;seed++){
  const plan=bookPlan(seed,n);assert.equal(plan.spawn.length,n);
  for(let r=0;r<plan.rounds.length;r++){
   const round=plan.rounds[r];if(r)assert.notDeepEqual(round.holes,plan.rounds[r-1].holes);
   for(let i=0;i<n;i++){
    const before=bookPose(plan,i,round.hit-.01),after=bookPose(plan,i,round.hit+.01);
    assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<.001,'teleport at page transition');
    if(round.hit<=plan.finish&&plan.falls[i]>round.hit)assert.ok(round.holes.some(h=>insideHole(h,before.x,before.z,BOOK_CHARACTER_RADIUS)),'survivor misses hole');
    if(plan.falls[i]===round.hit){assert.ok(round.holes.every(h=>Math.hypot(before.x-h.x,before.z-h.z)>h.radius),'eliminated runner is in a safe hole');const later=bookPose(plan,i,round.hit+400);assert.equal(later.x,after.x);assert.equal(later.z,after.z);}
   }
  }
  for(const p of plan.spawn)assert.ok(Math.abs(p.x)<2&&Math.abs(p.z)<2);
 }
});
test('jump elimination crosses rim before dropping below the platform and splashes at water',()=>{
 for(let n=2;n<=12;n++)for(let seed=0;seed<20;seed++){
  islandPlan(seed,n).forEach((fall,i)=>{if(!Number.isFinite(fall))return;let previous;
   for(let age=0;age<1700;age+=10){const p=knockbackPosition(seed,i,n,fall,fall+age);
    if(Math.hypot(p.x,p.z)<7.8)assert.ok(p.y>=.23-1e-8,'falls through platform');
    if(p.waterAge>=0)assert.ok(Math.abs(p.y+2.33)<1e-8,'splash does not meet water');
    if(previous)assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z)<.2,'discontinuous knockback');previous=p;
   }
  });
 }
});


test('book movement has a fixed speed with only an endpoint partial step',()=>{
 for(let n=2;n<=12;n++)for(let seed=0;seed<15;seed++){
  const plan=bookPlan(seed,n,Array(n).fill(2));
  for(let i=0;i<n;i++)for(let f=1;f<plan.frames.length;f++){
   const a=plan.frames[f-1],b=plan.frames[f],d=Math.hypot(b[i*2]-a[i*2],b[i*2+1]-a[i*2+1]),limit=BOOK_MOVE_SPEED*1.04*.02;
   assert.ok(d<=limit+1e-9);
   if(d>1e-8&&d<limit-1e-8&&f+1<plan.frames.length){const c=plan.frames[f+1];assert.ok(Math.hypot(c[i*2]-b[i*2],c[i*2+1]-b[i*2+1])<1e-8,'partial speed occurs away from a destination');}
  }
 }
});
test('book holes decrease from six to one with varied shapes and smaller size',()=>{
 const p=bookPlan(42,12);assert.deepEqual(p.rounds.map(r=>r.holes.length),[6,5,4,3,2,1]);assert.equal(new Set(p.rounds.flatMap(r=>r.holes.map(h=>h.shape))).size,4);
 for(let i=1;i<p.rounds.length;i++)assert.ok(p.rounds[i].holes[0].radius<p.rounds[i-1].holes[0].radius);
 let longest=0;for(let i=0;i<12;i++){const points=p.frames.map(f=>[f[i*2],f[i*2+1]]);longest=Math.max(longest,Math.max(...points.map(v=>v[0]))-Math.min(...points.map(v=>v[0])));}assert.ok(longest>4);
});
test('jump runners maintain travel speed and have anticipation, airborne tuck, and landing compression',()=>{
 for(let i=0;i<6;i++)for(let start=0;start<16000;start+=1000){let traveled=0,prev=runnerPosition(42,i,6,start);for(let t=start+5;t<=start+1000;t+=5){const next=runnerPosition(42,i,6,t);traveled+=Math.hypot(next.x-prev.x,next.z-prev.z);prev=next;}assert.ok(Math.abs(traveled-RUNNER_SPEED)<.015);}
 let air=false,crouch=false,tuck=false,land=false,wasAir=false;
 for(let t=1;t<16000;t+=10){const p=jumpPose(42,0,6,t);if(p.height>1)air=true;if(p.tuck>.8)tuck=true;if(!p.air&&p.scaleY<.95){if(wasAir)land=true;else crouch=true;}if(p.air)wasAir=true;}
 assert.ok(air&&crouch&&tuck&&land);
});

test('book countdown reaches zero when the page starts closing',async()=>{
 const {bookCountdown}=await import('../public/book-motion.js'),p=bookPlan(42,12);
 for(const r of p.rounds){assert.equal(bookCountdown(p,r.start).remaining,r.hit-r.reveal-420);assert.equal(bookCountdown(p,r.hit-421).remaining,1);assert.equal(bookCountdown(p,r.hit-420).remaining,0);assert.equal(bookCountdown(p,r.hit-419).closing,true);}
});

test('book safety uses actual body space: entrants stay inside for the rest of the page without reserved seats',async()=>{
 const {insideHole,BOOK_CHARACTER_RADIUS}=await import('../public/book-motion.js');let shared=false;
 for(let count=2;count<=12;count++)for(let seed=0;seed<8;seed++){
  const p=bookPlan(seed*31,count);
  for(const round of p.rounds){const safe=new Map();
   for(let f=round.start/20;f<p.frames.length&&f*20<=round.hit;f++){
    const frame=p.frames[f];
    for(let i=0;i<count;i++){if(p.falls[i]<=f*20)continue;const pos={x:frame[i*2],z:frame[i*2+1]},hole=round.holes.find(h=>insideHole(h,pos.x,pos.z,BOOK_CHARACTER_RADIUS));
     if(safe.has(i)){assert.ok(insideHole(safe.get(i),pos.x,pos.z,BOOK_CHARACTER_RADIUS),'left a safe hole before the page changed');}else if(hole)safe.set(i,hole);
     for(let j=0;j<i;j++)if(p.falls[j]>f*20){assert.ok(Math.hypot(pos.x-frame[j*2],pos.z-frame[j*2+1])>=BOOK_CHARACTER_RADIUS*2-1e-8,'bodies overlap');if(hole&&insideHole(hole,frame[j*2],frame[j*2+1],BOOK_CHARACTER_RADIUS))shared=true;}
    }
   }
  }
 }
 assert.ok(shared,'multiple entrants should fit in a large hole');
});


test('book reveals new holes only after opening and finishes completely closed with a safe survivor',async()=>{
 const {bookPage}=await import('../public/book-motion.js');
 for(let count=2;count<=12;count++)for(let seed=0;seed<8;seed++){
  const p=bookPlan(seed*37,count),winner=p.winner===null?null:bookPose(p,p.winner,p.finish),last=p.rounds.at(-1);
  assert.equal(p.finish,last.hit);assert.equal(bookPage(p,p.finish+2000).angle,Math.PI/2);
  if(winner)assert.ok(last.holes.some(h=>insideHole(h,winner.x,winner.z,BOOK_CHARACTER_RADIUS)),'winner must fit in the closed page');else assert.equal(p.draw,true);
  for(let r=1;r<p.rounds.length;r++){const round=p.rounds[r];assert.equal(bookPage(p,round.reveal-1).round,r-1);assert.equal(bookPage(p,round.reveal).round,r);assert.equal(bookPage(p,round.reveal).angle,.12);}
 }
});
