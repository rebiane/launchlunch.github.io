import {CART_DISTANCE,CART_SPEEDS} from '../public/game-rules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveGame,stepLiveGame,liveSnapshot} from '../public/live-game.js';
import {gamePlan} from '../public/game.js';
const modes=['race','island','fire','boulder','crush','climb','tricycle','cookie'];
const entries=n=>Array.from({length:n},(_,i)=>({id:`r${i}`,controllerId:`m${i}`,picks:0}));
const neutral=s=>Object.fromEntries(s.players.map(p=>[p.controllerId,{x:0,z:0,jump:false,at:s.time}]));
test('all eight direct adapters use exactly the automatic core: same path, finish, and winner without input',()=>{
 for(const mode of modes)for(const count of [2,6,12])for(const seed of [1,42]){
  const es=entries(count).map(e=>({...e,controllerId:null})),plan=gamePlan(seed,mode,es),s=createLiveGame(seed,mode,es);
  while(!s.finished){stepLiveGame(s);const frame=Math.floor(s.core.time/(mode==='race'?20:40));
   if(plan.frames&&frame<plan.frames.length){const actual=['climb','tricycle'].includes(mode)?s.players.map(p=>p.progress):s.players.flatMap(p=>[p.x,p.z]);assert.deepEqual(actual,plan.frames[frame],`${mode}/${count}/${seed}/${s.core.time}`);}
  }
  assert.equal(s.winner,plan.winner,mode);assert.equal(s.core.finish,plan.finish,mode);assert.equal(s.draw,plan.winner===null,mode);
 }
});
test('fixed simulation steps normalize controller movement and control only its own character',()=>{
 const s=createLiveGame(1,'cookie',entries(2)),before=structuredClone(s.players);
 stepLiveGame(s,{...neutral(s),m0:{x:1,z:1,at:0,seq:10}});
 assert.ok(Math.abs(Math.hypot(s.players[0].x-before[0].x,s.players[0].z-before[0].z)-3.6*.04)<1e-9);
 assert.equal(s.players[1].x,before[1].x);assert.equal(s.players[1].z,before[1].z);assert.equal(liveSnapshot(s).players[0].inputSeq,10);
});
test('cart runs automatically and awards real crossing, exact simultaneous finish draws',()=>{
 const s=createLiveGame(1,'tricycle',entries(2));s.core.rocks=[];s.core.agents.forEach(a=>a.startAt=0);
 stepLiveGame(s,neutral(s));assert.ok(Math.abs(s.players[0].progress-CART_SPEEDS[0]*.04)<.00001);s.core.progress[1]=(CART_DISTANCE-.1);s.core.positions[1].z=-(CART_DISTANCE-.1);
 stepLiveGame(s,{...neutral(s),m1:{x:0,z:-1,at:s.time}});assert.equal(s.winner,1);
 const tie=createLiveGame(1,'tricycle',entries(2));tie.core.rocks=[];tie.core.agents.forEach(a=>a.startAt=0);tie.core.progress.fill((CART_DISTANCE-.1));tie.core.positions.forEach(p=>p.z=-(CART_DISTANCE-.1));
 stepLiveGame(tie,{m0:{x:0,z:-1,at:0},m1:{x:0,z:-1,at:0}});assert.equal(tie.draw,true);assert.equal(tie.winner,null);
});
test('book only announces the result after full closure and never fabricates a survivor',()=>{
 const s=createLiveGame(1,'race',entries(2));s.core.rounds[0].holes=[];s.core.rounds[0].hit=40;
 stepLiveGame(s,neutral(s));assert.equal(s.book.angle,Math.PI/2);assert.ok(s.players.every(p=>!p.alive));assert.equal(s.draw,true);assert.equal(s.winner,null);
});
test('cookie warning cannot score before landing and actual acquisition determines the result',()=>{
 const s=createLiveGame(1,'cookie',entries(2)),p=s.core.positions[1];s.core.cookies=[{id:0,x:p.x,z:p.z,value:5,warning:0,start:120,taken:Infinity,owner:null}];s.core.nextSpawn=99999;
 stepLiveGame(s,neutral(s));stepLiveGame(s,neutral(s));assert.equal(s.players[1].score,0);stepLiveGame(s,neutral(s));assert.equal(s.players[1].score,5);assert.equal(s.core.cookies[0].owner,1);assert.equal(s.core.cookies[0].taken,120);
 s.time=s.core.time=27960;s.core.goldenWave=2;stepLiveGame(s,neutral(s));assert.equal(s.winner,1);
});
test('seven games without jumping ignore injected jump inputs and preserve movement and scores',()=>{
 for(const mode of ['race','cookie','fire','boulder','crush','climb','tricycle']){const s=createLiveGame(1,mode,entries(2)),baseline=structuredClone(s);
  for(let i=0;i<20&&!s.finished;i++){stepLiveGame(s,{...neutral(s),m0:{x:.3,z:-.4,jump:true,seq:i,at:s.time}});stepLiveGame(baseline,{...neutral(baseline),m0:{x:.3,z:-.4,jump:false,seq:i,at:baseline.time}});}
  assert.deepEqual(liveSnapshot(s),liveSnapshot(baseline),mode);assert.equal(s.players[0].jumpAt,-10000,mode);if(mode==='climb')assert.equal(s.players[0].y,s.players[0].progress);else assert.equal(s.players[0].y,0);
 }
});
test('snapshot hides core state and distant scenery while preserving physical obstacles',()=>{
 const s=createLiveGame(1,'tricycle',entries(12)),count=s.core.rocks.length,snapshot=liveSnapshot(s);
 assert.ok(snapshot.hazards.length<count);assert.ok(snapshot.hazards.every(h=>-h.z<=50));assert.equal(s.core.rocks.length,count);assert.equal(snapshot.core,undefined);assert.equal(snapshot.players[0].target,undefined);
});
test('climbers stay within reach of their own pole when dodging sideways',()=>{
 const s=createLiveGame(1,'climb',entries(2));for(let i=0;i<40;i++)stepLiveGame(s,{...neutral(s),m0:{x:1,z:0,at:s.time}});assert.ok(Math.abs(s.players[0].x+.825)<=.3+1e-9);
});
test('menu book and jump party resume their common core from serialized state without changing play',()=>{
 for(const mode of ['race','island']){let a=createLiveGame(91,mode,entries(6)),b=structuredClone(a);while(!a.finished){stepLiveGame(a);stepLiveGame(b);if(a.time%350===0)b=JSON.parse(JSON.stringify(b));assert.deepEqual(liveSnapshot(a),liveSnapshot(b),`${mode}/${a.time}`);}}
});
test('human river steering and acceleration change only its own boat',()=>{
 const s=createLiveGame(1,'tricycle',entries(2));s.core.rocks=[];const x=s.players[0].x;
 for(let n=0;n<16;n++)stepLiveGame(s,{...neutral(s),m0:{x:1,z:-1,seq:n,at:s.time}});
 assert.equal(s.players[0].speedLevel,2);assert.equal(s.players[1].speedLevel,1);assert.ok(s.players[0].x>x);assert.ok(s.players[0].progress>s.players[1].progress);
 const packet=liveSnapshot(s).players[0];assert.equal(packet.throttle,true);assert.equal(packet.gearElapsed,200);
 for(let n=0;n<12;n++)stepLiveGame(s,{...neutral(s),m0:{x:-1,z:0,seq:n+16,at:s.time}});
 assert.equal(s.players[0].speedLevel,1);assert.equal(s.players[0].y,0);assert.equal(liveSnapshot(s).players[0].throttle,false);
});
test('held island jump repeat after landing, stay airborne without restarting, and stop after release',()=>{
 for(const mode of ['island']){const s=createLiveGame(42,mode,entries(2));if(mode==='tricycle')s.core.rocks=[];let firstJump=null,secondJump=null;
  for(let n=0;n<24&&!s.finished;n++){stepLiveGame(s,{...neutral(s),m0:{x:0,z:0,jump:false,jumpHeld:true,seq:n,at:s.time}});const at=s.players[0].jumpAt;if(firstJump===null&&at>=0)firstJump=at;if(s.time<600)assert.equal(at,firstJump);if(at>firstJump)secondJump=at;}
  assert.ok(secondJump>firstJump,mode);const before=s.players[0].jumpAt;
  for(let n=0;n<20&&!s.finished;n++)stepLiveGame(s,{...neutral(s),m0:{x:0,z:0,jumpHeld:false,at:s.time}});assert.equal(s.players[0].jumpAt,before,mode);
 }
});

test('owned island never starts an AI jump before its first input; unowned restaurants remain AI',()=>{
 for(let seed=0;seed<20;seed++){
  const s=createLiveGame(seed,'island',[{id:'human',controllerId:'m0'},{id:'ai',controllerId:null}]),start={...s.players[0]};
  for(let n=0;n<20&&!s.finished;n++){stepLiveGame(s);assert.equal(s.players[0].jumpAt,-10000,`seed ${seed}`);assert.equal(s.players[0].x,start.x);assert.equal(s.players[0].z,start.z);}
 }
 const s=createLiveGame(0,'island',[{id:'human',controllerId:'m0'},{id:'ai',controllerId:null}]);for(let n=0;n<20;n++)stepLiveGame(s);assert.ok(s.players[1].jumpAt>=0);
});
test('stale human input becomes neutral rather than AI and reconnect resumes its control',()=>{
 const s=createLiveGame(42,'cookie',entries(2));stepLiveGame(s,{m0:{x:1,z:0,at:0,seq:1}});
 while(s.time<650)stepLiveGame(s,{m0:{x:1,z:0,at:0,seq:1}});
 const before={...s.players[0]};for(let n=0;n<15;n++)stepLiveGame(s,{m0:{x:1,z:0,at:0,seq:1}});
 assert.equal(s.players[0].x,before.x);assert.equal(s.players[0].z,before.z);
 stepLiveGame(s,{m0:{x:-1,z:0,at:s.time,seq:2}});assert.ok(s.players[0].x<before.x);assert.equal(s.players[0].inputSeq,2);
});
