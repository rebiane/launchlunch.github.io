import {CART_DISTANCE,CART_SPEEDS,CART_STEER_SPEED} from '../public/game-rules.js';
import test from 'node:test';import assert from 'node:assert/strict';import {sprintPlan,sprintPose,SPRINT_MODES,createSprintGame,stepSprintGame} from '../public/sprint.js';
test('races decide their winner on the finish line; slides only follow bee collisions',()=>{
 let bees=0,trips=0,jumps=0,drops=0;
 for(const mode of SPRINT_MODES)for(let count=2;count<=12;count++)for(let s=0;s<15;s++){
  const p=sprintPlan(s*9973,count,mode,Array.from({length:count},(_,i)=>i%6));const leaders=p.finishTimes.map((t,i)=>Math.abs(t-p.finish)<.00001?i:-1).filter(i=>i>=0);assert.equal(p.winner,leaders.length===1?leaders[0]:null);if(leaders.length>1)assert.equal(p.draw,true);assert.equal(p.finish,Math.min(...p.finishTimes));assert.ok(p.finish>12000&&p.finish<50000);
  for(let i=0;i<count;i++){let prev=0;for(let f=0;f<p.frames.length;f++){const v=p.frames[f][i];assert.ok(v<=p.distance);if(v<prev){assert.equal(mode,'climb');assert.ok(p.events[i].some(e=>e.type==='bee'&&e.drop>0&&f*40>e.time&&f*40<=e.time+400));}prev=v;}
   assert.equal(sprintPose(p,i,p.finishTimes[i]+1).distance,p.distance);
   for(const e of p.events[i]){if(e.type==='bee'){bees++;if(e.drop)drops++;}if(e.type==='trip'){trips++;assert.ok(p.rocks.some(r=>r.lane===i&&r.distance===e.rock));assert.equal(sprintPose(p,i,e.time+400).resting,true);}if(e.type==='jump')jumps++;}
  }
  for(const leader of leaders)assert.ok(sprintPose(p,leader,p.finish-50).distance<p.distance);
 }
 assert.ok(bees>10&&drops>0&&drops<bees);assert.equal(jumps,0,'river and climbing do not jump');
});

test('bees distribute targets across all lanes rather than attacking edge lanes first',()=>{for(let count=2;count<=12;count++)for(let seed=0;seed<15;seed++){const p=sprintPlan(seed*7919,count,'climb');for(let start=0;start+count<=p.bees.length;start+=count)assert.equal(new Set(p.bees.slice(start,start+count).map(b=>b.lane)).size,count);assert.ok(p.bees.some(b=>b.depth===1)&&p.bees.some(b=>b.depth===-1));}});


test('holding throttle changes gears every 600ms and releasing changes them down every 450ms',async()=>{
 const {stepCartMotion}=await import('../public/game-rules.js'),p={progress:0,speedLevel:1,steerX:0};
 for(let t=40;t<=3000;t+=40)stepCartMotion(p,{z:-1},t,40);assert.equal(p.speedLevel,6);
 stepCartMotion(p,{},3449,449);assert.equal(p.speedLevel,6);stepCartMotion(p,{},3450,1);assert.equal(p.speedLevel,5);
 stepCartMotion(p,{},5250,1800);assert.equal(p.speedLevel,1);assert.ok(p.progress>0);
 const same={progress:0,speedLevel:1,steerX:0};for(let t=40;t<=1000;t+=40)stepCartMotion(same,{action:true,gearDelta:1},t,40);assert.equal(same.speedLevel,1);
});
test('each entrant has identical seeded hazards, equal opening motion, and real lateral steering',()=>{
 for(let seed=0;seed<30;seed++){const s=createSprintGame(seed,12,'tricycle');const layout=lane=>s.rocks.filter(r=>r.lane===lane).map(({distance,offset,radius})=>({distance,offset,radius}));for(let lane=1;lane<12;lane++)assert.deepEqual(layout(lane),layout(0));assert.ok(layout(0).length>=10);assert.equal(s.distance,CART_DISTANCE);
  const inputs=Object.fromEntries(s.agents.map((_,i)=>[i,{x:0,z:1,jump:true}]));stepSprintGame(s,inputs);assert.ok(s.progress.every(v=>Math.abs(v-CART_SPEEDS[0]*.04)<1e-5));assert.ok(s.positions.every(p=>p.y===0));const old=s.positions[0].x;stepSprintGame(s,{...inputs,0:{x:1}});assert.ok(s.positions[0].x>old);assert.equal(s.progress[0],s.progress[1]);
 }
});
test('actual swept buoy contact causes one-second spin and returns gear to one',()=>{
 const s=createSprintGame(1,2,'tricycle');s.rocks=[{id:0,lane:0,distance:1,offset:0,radius:.4}];s.agents[0].speedLevel=6;s.agents[0].velocity=CART_SPEEDS[5];stepSprintGame(s,{0:{},1:{}});assert.equal(s.events[0].length,1);const hit=s.events[0][0];assert.equal(hit.type,'spin');assert.equal(hit.recovery,1000);assert.ok(Math.abs(hit.time-250/CART_SPEEDS[5])<.01);assert.equal(s.agents[0].speedLevel,1);assert.equal(s.agents[0].velocity,0);const stopped=s.progress[0];
 while(s.time+40<s.agents[0].spinUntil)stepSprintGame(s,{0:{action:s.time%80===0},1:{}});assert.equal(s.progress[0],stopped);while(s.time<1120)stepSprintGame(s,{0:{},1:{}});assert.ok(s.progress[0]>stopped);assert.equal(s.events[0].length,1);
});
test('steering avoids actual obstacles; jump and brake inputs offer no hidden escape',()=>{
 for(const side of [0,1]){const s=createSprintGame(1,2,'tricycle');s.rocks=[{id:0,lane:0,distance:4,offset:0,radius:.4}];while(s.progress[0]<5)stepSprintGame(s,{0:{x:side,z:1,jump:true},1:{}});assert.equal(s.events[0].length,side?0:1);assert.ok(s.positions[0].y===0);}
});
test('true finish crossing and exact ties determine river results without choosing an index',()=>{
 const s=createSprintGame(1,2,'tricycle');s.rocks=[];s.progress.fill(CART_DISTANCE-.1);s.agents.forEach(a=>{a.speedLevel=6;a.velocity=CART_SPEEDS[5]*1.1;});stepSprintGame(s,{0:{},1:{}});assert.equal(s.finished,true);assert.equal(s.draw,true);assert.equal(s.winner,null);assert.ok(Math.abs(s.finish-100/(CART_SPEEDS[5]*1.1))<.001);
 const solo=createSprintGame(1,2,'tricycle');solo.rocks=[];solo.progress[1]=CART_DISTANCE-.1;stepSprintGame(solo,{0:{},1:{}});assert.equal(solo.winner,1);
});
test('recorded river poses and serialized live core preserve steering, gears and collision outcomes',()=>{
 const s=createSprintGame(42,6,'tricycle');let copy=structuredClone(s);while(!s.finished){stepSprintGame(s);stepSprintGame(copy);if(s.time%280===0)copy=JSON.parse(JSON.stringify(copy));assert.deepEqual(copy,s);}
 const plan=sprintPlan(42,6,'tricycle');assert.equal(plan.finish,s.finish);assert.equal(plan.winner,s.winner);for(let i=0;i<6;i++){const pose=sprintPose(plan,i,1000);assert.ok(pose.speedLevel>=1&&pose.speedLevel<=6);assert.ok(Math.abs(pose.steerX)<=1.3);assert.ok(pose.velocity>=0);}
});

test('finish timestamps exclude the frozen portion and respect gradual recovery after a spin',()=>{
 const s=createSprintGame(1,2,'tricycle');s.rocks=[];s.progress[0]=CART_DISTANCE-.04;s.agents[0].spinUntil=20;s.agents[0].velocity=0;s.agents[0].speedLevel=1;stepSprintGame(s,{0:{},1:{}});assert.equal(s.finishTimes[0],null);assert.ok(s.progress[0]>CART_DISTANCE-.04);while(!s.finished)stepSprintGame(s,{0:{},1:{}});assert.ok(s.finish>20);assert.equal(s.winner,0);
});

test('river AI uses limited sight and delayed steering, so actual contacts can occur without scripted hits',()=>{
 let contacts=0;for(let seed=0;seed<30;seed++){const s=createSprintGame(seed,12,'tricycle');while(!s.finished)stepSprintGame(s);contacts+=s.events.reduce((n,list)=>n+list.filter(e=>e.type==='spin').length,0);for(const list of s.events)for(const e of list)assert.ok(s.rocks.some(r=>r.id===e.obstacle));}assert.ok(contacts>0);
 const a=createSprintGame(7,3,'tricycle'),b=structuredClone(a);b.rocks.filter(r=>r.distance>100).forEach(r=>r.offset*=-1);for(let n=0;n<25;n++){stepSprintGame(a);stepSprintGame(b);assert.deepEqual(a.positions,b.positions);assert.deepEqual(a.agents,b.agents);}
});

test('gears differ substantially and the late current raises each level without changing steering fairness',async()=>{
 const {stepCartMotion}=await import('../public/game-rules.js');assert.ok(CART_SPEEDS[5]/CART_SPEEDS[0]>=5);for(let i=1;i<6;i++)assert.ok(CART_SPEEDS[i]/CART_SPEEDS[i-1]>=1.3);
 const early={progress:0,speedLevel:6,steerX:0,velocity:CART_SPEEDS[5]},late={progress:CART_DISTANCE*.9,speedLevel:6,steerX:0,velocity:CART_SPEEDS[5]*1.09};stepCartMotion(early,{},40,40);stepCartMotion(late,{},40,40);assert.ok(late.velocity>early.velocity*1.08);assert.ok(late.velocity<=early.velocity*1.1);
 for(let seed=0;seed<30;seed++){const s=createSprintGame(seed,2,'tricycle'),gates=[...Map.groupBy(s.rocks.filter(r=>r.lane===0),r=>r.distance).values()];assert.ok(gates.some(g=>g.length===2));for(let i=0;i<gates.length;i++){const gate=gates[i],safe=[-1.3,0,1.3].filter(x=>gate.every(r=>Math.abs(r.offset-x)>.75));assert.ok(safe.length);if(i){const gap=gate[0].distance-gates[i-1][0].distance;if(gap<20){assert.ok(gate.every(r=>r.quick));assert.ok((gap-.75)/(CART_SPEEDS[3]*1.1)>2.6/CART_STEER_SPEED+.2);}else assert.ok((gap-.75)/(CART_SPEEDS[5]*1.1)>2.6/CART_STEER_SPEED+.2);}}}
});
test('throttle reversals reset the gear timer and spinning cannot bank acceleration',async()=>{
 const {stepCartMotion}=await import('../public/game-rules.js'),p={progress:0,speedLevel:2,steerX:0};stepCartMotion(p,{z:-1},500,500);assert.equal(p.speedLevel,2);
 stepCartMotion(p,{},600,100);stepCartMotion(p,{z:-1},1199,599);assert.equal(p.speedLevel,2);stepCartMotion(p,{z:-1},1200,1);assert.equal(p.speedLevel,3);
 p.spinUntil=2200;stepCartMotion(p,{z:-1},2200,1000);assert.equal(p.gearElapsed,0);assert.equal(p.speedLevel,3);stepCartMotion(p,{z:-1},2799,599);assert.equal(p.speedLevel,3);stepCartMotion(p,{z:-1},2800,1);assert.equal(p.speedLevel,4);
});
test('display-sized substeps and authoritative ticks integrate throttle and current identically',async()=>{
 const {stepCartMotion}=await import('../public/game-rules.js'),a={progress:0,speedLevel:1,steerX:0},b=structuredClone(a);
 for(let i=1;i<=90;i++)stepCartMotion(a,{z:i<=75?-1:0,x:.2},i*40,40);
 for(let i=1;i<=216;i++)stepCartMotion(b,{z:i<=180?-1:0,x:.2},i*1000/60,1000/60);
 assert.ok(Math.abs(a.progress-b.progress)<1e-8);assert.equal(a.speedLevel,b.speedLevel);assert.ok(Math.abs(a.gearElapsed-b.gearElapsed)<1e-7);assert.equal(a.steerX,b.steerX);
});
test('the same late steering decision is recoverable in first gear but risky in sixth',()=>{
 const hits=[];for(const gear of [1,6]){const s=createSprintGame(1,2,'tricycle');s.rocks=[{id:0,lane:0,distance:4,offset:0,radius:.4}];s.agents[0].speedLevel=gear;s.agents[0].velocity=CART_SPEEDS[gear-1];while(s.progress[0]<5)stepSprintGame(s,{0:{x:s.progress[0]>=2.8?1:0},1:{}});hits.push(s.events[0].length);}assert.deepEqual(hits,[0,1]);
});

test('gear shifts preserve velocity continuity while held throttle smoothly accelerates and release slows',async()=>{
 const {stepCartMotion}=await import('../public/game-rules.js'),p={progress:0,steerX:0,speedLevel:1,velocity:3};
 stepCartMotion(p,{z:-1},599,599);const before=p.velocity;stepCartMotion(p,{z:-1},600,1);assert.equal(p.speedLevel,2);assert.ok(Math.abs(p.velocity-before)<.002);
 stepCartMotion(p,{z:-1},760,160);assert.ok(p.velocity>before+.4);assert.ok(p.velocity<4.4);
 p.speedLevel=6;p.velocity=16;stepCartMotion(p,{},1209,449);const fast=p.velocity;stepCartMotion(p,{},1210,1);assert.equal(p.speedLevel,5);assert.ok(Math.abs(p.velocity-fast)<.02);stepCartMotion(p,{},1370,160);assert.ok(p.velocity<fast);
});
test('AI shares first-gear start and waits for its own reaction before holding throttle',()=>{
 for(let seed=0;seed<20;seed++){const s=createSprintGame(seed,6,'tricycle');assert.ok(s.agents.every(a=>a.speedLevel===1&&a.velocity===3&&a.driveAt>=200&&a.driveAt<=600));while(s.time<160)stepSprintGame(s,{0:{}});assert.ok(s.agents.every(a=>a.speedLevel===1&&a.gearElapsed<200));assert.ok(Math.max(...s.progress)-Math.min(...s.progress)<1e-9);}
});

test('slowing before visible switchback gates beats permanent sixth gear under identical steering',()=>{
 let fullHits=0,slowHits=0,fullTimes=0,slowTimes=0;
 for(let seed=0;seed<12;seed++)for(const careful of [false,true]){
  const s=createSprintGame(seed,2,'tricycle');
  while(s.finishTimes[0]===null&&!s.settled){const p=s.progress[0],a=s.agents[0],next=s.rocks.find(r=>r.lane===0&&r.distance>p-.1&&!a.checked.includes(r.id)),row=next?s.rocks.filter(r=>r.lane===0&&r.distance===next.distance):[],choices=[-1.3,0,1.3].filter(x=>row.every(r=>Math.abs(x-r.offset)>.78)),target=choices.toSorted((x,y)=>Math.abs(x-a.steerX)-Math.abs(y-a.steerX))[0]??a.steerX,desired=careful&&next?.quick&&next.distance-p<38?4:6;
   stepSprintGame(s,{0:{x:Math.max(-1,Math.min(1,(target-a.steerX)/(.04*CART_STEER_SPEED))),z:!careful||a.speedLevel<desired||a.speedLevel===desired&&a.gearElapsed<180?-1:0}},true);
  }
  assert.notEqual(s.finishTimes[0],null);const hits=s.events[0].length;
  if(careful){slowHits+=hits;slowTimes+=s.finishTimes[0];}else{fullHits+=hits;fullTimes+=s.finishTimes[0];}
 }
 assert.ok(fullHits>=24);assert.equal(slowHits,0);assert.ok(slowTimes<fullTimes*.95);
});

test('river alternates short technical sections with long recovery straights',()=>{
 for(let seed=0;seed<30;seed++){
  const s=createSprintGame(seed,6,'tricycle'),rows=[...Map.groupBy(s.rocks.filter(r=>r.lane===0),r=>r.distance).values()],technical=rows.filter(row=>row[0].quick&&row[0].gate%2===0);
  assert.ok(technical.length>=1&&technical.length<=3,'only a few braking decisions per full course');
  for(let i=0;i<rows.length;i++){if(!rows[i][0].quick||rows[i][0].gate%2===0)continue;const next=rows[i+1];if(next)assert.ok(next[0].distance-rows[i][0].distance>=42,'restore speed after a switchback');}
  assert.ok(rows.filter(row=>!row[0].quick).length>technical.length*2,'straights should dominate the course');
 }
});
