import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurvivalGame,stepSurvivalGame,crushSafeArea,hazardPose,SURVIVAL_SPEED} from '../public/survival.js';
const groups=s=>[...Map.groupBy(s.hazards,h=>h.wave).values()];
const distanceTo=(p,b)=>Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minZ-p.z,0,p.z-b.maxZ));
test('cross-press waves retain safe space and allow travel after the previous walls fully reopen',()=>{
 for(let seed=0;seed<60;seed++){
  const s=createSurvivalGame(seed,12,'crush');let prior={minX:-2.7,maxX:2.7,minZ:-1.6,maxZ:1.6},end=0;
  for(const [i,walls] of groups(s).entries()){
   assert.equal(walls.length,i<2?2:4);assert.ok(walls.every(h=>h.gap>=3.8));const box=crushSafeArea(walls),h=walls[0];assert.ok(box.maxX>box.minX&&box.maxZ>box.minZ);
   assert.ok(h.start-h.warn>=end+159);
   for(const x of [prior.minX,prior.maxX])for(const z of [prior.minZ,prior.maxZ])assert.ok(distanceTo({x,z},box)/SURVIVAL_SPEED*1000+Math.max(160,560-i*55)-1<=h.warn);
   const p={x:(box.minX+box.maxX)/2,z:(box.minZ+box.maxZ)/2};for(const wall of walls){const hp=hazardPose(wall,h.start+h.closeTime*1000);assert.ok(Math.abs(p.x-hp.x)>=hp.rx+.33||Math.abs(p.z-hp.z)>=hp.rz+.33);}
   prior=box;end=h.start+h.life*1000;
  }
 }
});
test('AI follows the newest complete wall intersection, including while an older wave is visible',()=>{
 const walls=[{wave:0,axis:'x',center:-3,gap:4},{wave:1,axis:'x',center:2,gap:4},{wave:1,axis:'z',center:-2,gap:4}];assert.deepEqual(crushSafeArea(walls),{minX:.55,maxX:3.45,minZ:-3.45,maxZ:-.55});
 for(let seed=0;seed<10;seed++){const s=createSurvivalGame(seed,6,'crush');while(!s.finished){stepSurvivalGame(s);const visible=s.hazards.filter(h=>s.time>=h.start-h.warn&&s.time<=h.start+h.life*1000);if(!visible.length)continue;const box=crushSafeArea(visible);for(let i=0;i<s.count;i++)if(s.falls[i]===null)assert.ok(distanceTo(s.agents[i].target,box)<1e-8);}}
});
test('standing still is not a winning strategy, while precise equal-speed steering can survive every wall',()=>{
 for(const count of [2,6,12])for(let seed=0;seed<15;seed++)for(const policy of ['idle','safe']){
  const s=createSurvivalGame(seed,count,'crush');while(!s.finished){const p=s.positions[0],visible=s.hazards.filter(h=>s.time>=h.start-h.warn&&s.time<=h.start+h.life*1000),b=crushSafeArea(visible),x=policy==='idle'?0:Math.max(b.minX,Math.min(b.maxX,p.x))-p.x,z=policy==='idle'?0:Math.max(b.minZ,Math.min(b.maxZ,p.z))-p.z,length=Math.max(SURVIVAL_SPEED*.04,Math.hypot(x,z));stepSurvivalGame(s,{0:{x:x/length,z:z/length}});}
  assert.equal(s.falls[0]===null,policy==='safe',`${count}/${seed}/${policy}`);assert.ok(s.speeds.every(v=>v===SURVIVAL_SPEED));
 }
});
test('boulders vary speed and spacing without hiding a faster launch behind a shorter warning',()=>{
 for(let seed=0;seed<40;seed++){
  const s=createSurvivalGame(seed,6,'boulder'),speeds=s.hazards.map(h=>h.vz),gaps=s.hazards.slice(1).map((h,i)=>h.start-s.hazards[i].start);
  assert.ok(new Set(speeds.slice(0,5)).size>=4);assert.ok(speeds.some((v,i)=>i&&v<speeds[i-1]));assert.ok(new Set(gaps.map(v=>Math.round(v))).size>5);
  for(const h of s.hazards){assert.ok(h.vz>=2.8&&h.vz<=9);const firstPossibleContact=(4-h.rz-.33)/h.vz*1000;assert.ok(h.warn+firstPossibleContact>1500);const middle=hazardPose(h,h.start+500);assert.ok(Math.abs(middle.z-(h.z+h.vz*.5))<1e-9);}
 }
});
test('fire keeps thirteen safe cells and adds a readable minimum warning before ignition',()=>{
 for(let seed=0;seed<20;seed++){const s=createSurvivalGame(seed,6,'fire');for(const walls of groups(s)){assert.equal(walls.length,12);assert.ok(walls[0].warn>=(walls[0].wave<2?1800:650));}while(s.time<15000&&!s.finished){stepSurvivalGame(s);for(const a of s.agents)if(a.wave>=2){const h=s.hazards.find(h=>h.wave===a.wave);assert.ok(a.reactAt>=h.start-h.warn,'bots cannot react before the visible warning');assert.ok(a.reactAt<=h.start+250,'occasional late decisions stay bounded');}}}
});
