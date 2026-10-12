import test from 'node:test';
import assert from 'node:assert/strict';
import {jumpHeight,movePlayer} from '../public/game-rules.js';
import {poseForJump} from '../public/race.js';
import {createLocalPrediction} from '../public/live-prediction.js';
import {createLiveView} from '../public/live-view.js';
const player=(overrides={})=>({id:'a',controllerId:'me',alive:true,x:0,z:3,y:0,progress:0,heading:0,stunUntil:0,jumpAt:-10000,inputSeq:0,...overrides});
const packet=(time,p)=>({time,mode:'island',finished:false,players:[p]});
const pose=p=>poseForJump({start:p.poseJumpAt??p.jumpAt},p.poseTime);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('AI and manual jump use the same 640ms flight with an apex at 320ms',()=>{
 for(let age=0;age<=640;age+=10)near(jumpHeight('island',age),poseForJump({start:1000},1000+age).height);
 near(jumpHeight('island',0),0);near(jumpHeight('island',320),1.55);near(jumpHeight('island',640),0);
 assert.ok(poseForJump({start:1000},1715).scaleY<1);near(poseForJump({start:1000},1790).scaleY,1);
});
test('predicted flight cannot use an earlier server clock for feet and squash',()=>{
 const prediction=createLocalPrediction(),raw=packet(1000,player());prediction.input('r',1100,{x:1,z:0,jump:true},1);
 const shown=prediction.render(raw,'r','me',1150).players[0];assert.equal(shown.poseTime,1150);near(shown.y,pose(shown).height);assert.ok(pose(shown).air>0&&pose(shown).tuck>0);
 assert.equal(raw.players[0].jumpAt,-10000);
});
test('remote interpolation keeps height, takeoff and animation on one presentation clock',()=>{
 const view=createLiveView(),a=packet(1000,player({jumpAt:1100})),b=packet(1200,player({jumpAt:1100,y:jumpHeight('island',100)}));view(a,'r',0);view(b,'r',100);
 for(const now of [110,142.5,160,185]){const p=view(b,'r',now).players[0];near(p.y,pose(p).height);if(p.poseTime<1100)assert.equal(p.y,0);}
});
test('acknowledgement does not restart a locally presented jump; landing completes once',()=>{
 const prediction=createLocalPrediction();prediction.input('r',1000,{x:0,z:0,jump:true},1);prediction.render(packet(1000,player()),'r','me',1100);
 for(const time of [1120,1200,1320,1480,1640,1715]){const raw=packet(time-40,player({jumpAt:1070,inputSeq:1,y:jumpHeight('island',time-40-1070)})),p=prediction.render(raw,'r','me',time).players[0];assert.equal(p.jumpAt,1070);assert.equal(p.poseJumpAt,1000);near(p.y,jumpHeight('island',time-1000));near(p.y,pose(p).height);}
 const dead=packet(1720,player({alive:false,jumpAt:1070}));assert.equal(prediction.render(dead,'r','me',1740).players[0].alive,false);
});
test('taking control during an AI preparation accepts a human jump immediately',()=>{
 const p=player({jumpAt:1100}),world={mode:'island',time:1000,players:[p]};movePlayer(world,p,{x:0,z:0,jump:true},10,0);assert.equal(p.jumpAt,1000);
 const prediction=createLocalPrediction(),raw=packet(1000,player({jumpAt:1100}));prediction.input('r',1000,{x:0,z:0,jump:true},1);const shown=prediction.render(raw,'r','me',1020).players[0];assert.equal(shown.poseJumpAt,1000);assert.ok(shown.y>0);near(shown.y,pose(shown).height);
});
test('stale acknowledgement plus rapid taps cannot rewind an active jump then launch again',()=>{
 const prediction=createLocalPrediction();prediction.input('r',500,{x:0,z:0,jump:true},1);prediction.input('r',1245,{x:0,z:0,jump:true},2);
 const source=player({jumpAt:1100,y:jumpHeight('island',150),inputSeq:0}),raw=packet(1250,source),shown=prediction.render(raw,'r','me',1270).players[0];
 assert.equal(shown.jumpAt,1100);assert.equal(shown.poseJumpAt,1100);near(shown.y,jumpHeight('island',170));assert.equal(source.jumpAt,1100);
});
test('server and prediction reject every rapid airborne tap while a held jump repeats only after landing',()=>{
 for(const mode of ['island']){const p=player({jumpAt:1000}),world={mode,time:1000,players:[p]};
  for(let t=1010;t<=1730;t+=10){world.time=t;movePlayer(world,p,{x:0,z:0,jump:true},10,0);assert.equal(p.jumpAt,1000);}
  const repeatAt=mode==='island'?1750:1870;world.time=repeatAt;movePlayer(world,p,{x:0,z:0,jump:true},10,0);assert.equal(p.jumpAt,repeatAt);
 }
});
test('a future timestamp cannot authorize another jump while the body is already airborne',()=>{
 const p=player({jumpAt:1200,y:.8}),world={mode:'island',time:1100,players:[p]};movePlayer(world,p,{x:0,z:0,jump:true},10,0);assert.equal(p.jumpAt,1200);
});
