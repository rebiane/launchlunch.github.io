import test from 'node:test';import assert from 'node:assert/strict';
import {createSurvivalGame,stepSurvivalGame,survivalPlan,survivalPose,hazardPose,touches,SURVIVAL_MODES,SURVIVAL_SPEED,FIRE_MOVE_SPEED} from '../public/survival.js';
import {gamePlan} from '../public/game.js';import {islandSimulation} from '../public/race.js';
function assertSurvivalOutcome(p){
 const survivors=p.falls.filter(t=>t===Infinity).length;
 if(p.draw){assert.equal(p.winner,null);assert.notEqual(survivors,1);if(survivors===0){const last=p.falls.toSorted((a,b)=>b-a);assert.ok(Math.abs(last[0]-last[1])<.00001,'draw requires simultaneous final contacts');}else assert.equal(p.finish,{fire:70000,boulder:120000,crush:60000}[p.mode],'survivors draw only at the time limit');}
 else{assert.equal(survivors,1);assert.equal(p.winner,p.falls.indexOf(Infinity));}
}
test('three new games support 2–12 entrants, real contact eliminations and capped fixed speed',()=>{
 for(const mode of SURVIVAL_MODES)for(let count=2;count<=12;count++)for(let n=0;n<12;n++){
  const seed=(n*982451653)>>>0,entries=Array.from({length:count},(_,i)=>({picks:i%7})),p=gamePlan(seed,mode,entries);
  assertSurvivalOutcome(p);assert.ok(p.finish<={fire:70000,boulder:120000,crush:60000}[mode]);
  assert.deepEqual(survivalPlan(seed,count,mode,entries.map(e=>e.picks)).falls,p.falls);
  for(let i=0;i<count;i++){
   const base=mode==='fire'?FIRE_MOVE_SPEED:SURVIVAL_SPEED;assert.ok(p.speeds[i]>=base&&p.speeds[i]<=base*1.1);
   if(Number.isFinite(p.falls[i])){const t=p.falls[i],h=p.hazards.find(h=>h.id===p.causes[i]),hp=hazardPose(h,t),pos=survivalPose(p,i,t);if(mode==='boulder'){assert.ok(Math.abs(pos.x)>6.65||Math.abs(pos.z)>8);const hit=p.damage[i].at(-1);assert.ok(hit.time<=t);assert.ok(touches(hazardPose(h,hit.time),survivalPose(p,i,hit.time)));}else{assert.ok(hp.active&&touches(hp,pos));assert.ok(p.damage[i].length===1);}assert.ok(h.warn>=(mode==='fire'?450:500));assert.ok(t>=(mode==='fire'?4000:8000));assert.equal(survivalPose(p,i,t+300).x,pos.x);}
  }
 }
});
test('jump opening stays playable and still resolves by bar contact',()=>{
 for(let count=2;count<=12;count++)for(let seed=0;seed<10;seed++){const p=islandSimulation(seed*9973,count,Array(count).fill(5));assert.ok(Math.min(...p.falls)>=9000);if(p.draw){assert.equal(p.winner,null);const alive=p.falls.filter(t=>t===Infinity).length;assert.notEqual(alive,1);if(alive===0){const last=p.falls.toSorted((a,b)=>b-a);assert.ok(Math.abs(last[0]-last[1])<.00001);}else assert.equal(p.finish,45000);}else{assert.equal(p.falls.filter(t=>t===Infinity).length,1);assert.equal(p.winner,p.falls.indexOf(Infinity));}assert.ok(p.finish<=45000);}
});

test('crusher eliminates on first contact, allows group eliminations, and never crowns a crushed runner',()=>{

 for(let seed=0;seed<50;seed++){
  const p=survivalPlan(seed*197,12,'crush'),waves=[];assertSurvivalOutcome(p);
  for(let i=0;i<12;i++)if(Number.isFinite(p.falls[i])){assert.equal(p.damage[i].length,1);assert.equal(p.falls[i],p.damage[i][0].time);waves.push(p.hazards.find(h=>h.id===p.causes[i]).wave);}

  if(p.winner!==null)assert.ok(!p.hazards.some(h=>{const hp=hazardPose(h,p.finish);return hp.active&&touches(hp,survivalPose(p,p.winner,p.finish));}),'winner overlaps a closing wall');
 }
 const group=createSurvivalGame(1,3,'crush');group.positions=[{x:-7,z:0},{x:-7,z:0},{x:0,z:0}];group.hazards=[{id:0,kind:'wall',wave:0,axis:'x',side:-1,center:0,gap:4,start:0,warn:1000,life:1.5,closeTime:.8,holdTime:.25}];
 while(!group.finished)stepSurvivalGame(group,{0:{x:0,z:0},1:{x:0,z:0},2:{x:0,z:0}});assert.equal(group.falls[0],group.falls[1]);assert.equal(group.winner,2);assert.equal(group.damage[0].length,1);assert.equal(group.damage[1].length,1);
});

test('rice balls stay normal-sized through the final waves and wins come from real collisions',()=>{
 for(let count=2;count<=12;count++)for(let seed=0;seed<8;seed++){
  const p=survivalPlan(seed*7919,count,'boulder');assertSurvivalOutcome(p);
  assert.ok(p.hazards.every(h=>!h.closing&&h.rx<=1.15&&h.rz<=1.15),'oversized forced finisher');
  const early=p.hazards[0],late=p.hazards.find(h=>h.start>46000);assert.ok(late.vz>early.vz);assert.equal(late.warn,early.warn);
  for(let i=0;i<count;i++)if(Number.isFinite(p.falls[i])){const pos=survivalPose(p,i,p.falls[i]);assert.ok(Math.abs(pos.x)>6.65||Math.abs(pos.z)>8);assert.ok(p.damage[i].length>0);}
 }
});

test('fire keeps 13 safe cells, varies readable patterns and warning timing, and never overlaps waves',()=>{
 for(let seed=0;seed<20;seed++){
  const p=survivalPlan(seed,12,'fire'),waves=[...Map.groupBy(p.hazards,h=>h.wave).values()];
  for(const tiles of waves){assert.equal(tiles.length,12);assert.equal(new Set(tiles.map(h=>h.x+','+h.z)).size,12);assert.ok(tiles[0].warn>=450);}
  assert.ok(new Set(waves.map(w=>w[0].pattern)).size>=3);
  assert.ok(new Set(waves.slice(2).map(w=>w[0].warn)).size>5);
  for(let i=1;i<waves.length;i++)assert.ok(waves[i][0].start-waves[i][0].warn>waves[i-1][0].start+waves[i-1][0].life*1000);
  for(const hits of p.damage)assert.ok(hits.length<=1,'one actual contact eliminates a runner');
 }
});
test('fire entrants spread across safe cells without speed changes or scripted elimination',()=>{
 for(let seed=0;seed<20;seed++){
  const p=survivalPlan(seed,12,'fire'),cells=Array.from({length:12},(_,i)=>{const pos=survivalPose(p,i,3960);return Math.round(pos.x/2.4)+','+Math.round(pos.z/2.4)});
  assert.ok(new Set(cells).size>=8,'opening runners should use different safe cells');assert.equal(p.speeds[0],FIRE_MOVE_SPEED);assert.ok(FIRE_MOVE_SPEED>SURVIVAL_SPEED);
  for(let i=0;i<12;i++)if(Number.isFinite(p.falls[i])){assert.equal(p.damage[i].length,1);assert.equal(p.falls[i],p.damage[i][0].time);}
 }
});
test('fire crowns only untouched survivors and allows simultaneous or time-limit draws',()=>{
 for(let count=2;count<=12;count++)for(let seed=0;seed<20;seed++){
  const picks=Array.from({length:count},(_,i)=>i%6),p=survivalPlan(seed*197,count,'fire',picks);
  if(p.draw){assert.equal(p.winner,null);if(p.falls.every(Number.isFinite)){const last=p.falls.toSorted((a,b)=>b-a);assert.ok(Math.abs(last[0]-last[1])<.00001);}else{assert.equal(p.finish,70000);assert.ok(p.falls.filter(t=>t===Infinity).length>1);}}
  else{assert.notEqual(p.winner,null);assert.equal(p.falls.filter(t=>t===Infinity).length,1);assert.equal(survivalPose(p,p.winner,p.finish).lives,1);assert.equal(p.damage[p.winner].length,0);}
 }
 const simultaneous=createSurvivalGame(1,2,'fire');simultaneous.positions=[{x:0,z:0},{x:0,z:0}];simultaneous.hazards=[{id:0,kind:'tile',wave:0,start:0,warn:1000,life:1,x:0,z:0,vx:0,vz:0,rx:1.17,rz:1.17}];stepSurvivalGame(simultaneous,{0:{x:0,z:0},1:{x:0,z:0}});assert.equal(simultaneous.draw,true);assert.ok(simultaneous.falls.every(Number.isFinite));
 const timeout=createSurvivalGame(1,2,'fire');timeout.hazards=[];timeout.time=69960;stepSurvivalGame(timeout,{0:{x:0,z:0},1:{x:0,z:0}});assert.equal(timeout.draw,true);assert.equal(timeout.finish,70000);assert.equal(timeout.winner,null);assert.equal(timeout.falls.filter(t=>t===null).length,2);
});
