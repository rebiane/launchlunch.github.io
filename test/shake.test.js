import test from 'node:test';
import assert from 'node:assert/strict';
import {createShakeGame,stepShakeGame,stepShakeJar,shakePlan,shakePose,breadSupport,SHAKE_GEOMETRY as G} from '../public/shake.js';
import {createLiveGame,stepLiveGame,liveSnapshot} from '../public/live-game.js';
test('automatic jars finish through twelve actual exits, with deterministic shared live physics',()=>{
 for(const count of [2,6,12])for(const seed of [1,42,91]){const s=createShakeGame(seed,count),live=createLiveGame(seed,'shake',Array.from({length:count},(_,i)=>({id:String(i)})));while(!s.finished)stepShakeGame(s);while(!live.finished)stepLiveGame(live);assert.deepEqual(live.core,s);assert.ok(s.finish>=8000&&s.finish<35000);assert.equal(s.jars[s.winner].score,12);assert.ok(s.jars[s.winner].pieces.every(p=>p.escapedAt!==null&&p.y>=G.mouth+breadSupport(p,0,1)&&p.outletEntered));}
});
test('lids open automatically but upright action spam cannot empty a jar',()=>{
 for(const spam of [false,true]){const s=createShakeGame(1,2);while(!s.finished)stepShakeGame(s,{0:{action:spam&&s.time%240===0},1:{}});assert.equal(s.draw,true);assert.equal(s.finish,60000);assert.equal(s.jars[1].score,0);assert.ok(s.jars[0].score<12);if(!spam)assert.equal(s.jars[0].score,0);}
});
test('automatic opening needs no button and the first action immediately shakes once',()=>{
 const jar=createShakeGame(1,2).jars[0],original=structuredClone(jar.pieces);stepShakeJar(jar,{},0,0);assert.equal(jar.open,true);assert.equal(jar.lidAt,0);assert.deepEqual(jar.pieces,original);stepShakeJar(jar,{action:true},0,0);assert.equal(jar.pulses,1);for(let t=20;t<=1000;t+=20)stepShakeJar(jar,{action:true},t);assert.equal(jar.pulses,1);stepShakeJar(jar,{},1000,0);stepShakeJar(jar,{action:true},1000,0);assert.equal(jar.pulses,2);
});
test('human motion changes the same physical contents; precise inversion and shaking can win',()=>{
 const s=createShakeGame(1,2);while(!s.finished){const j=s.jars[0];stepShakeGame(s,{0:{x:Math.max(-1,Math.min(1,(j.angle-Math.PI)*2)),action:(s.time+20)%400===0},1:{}});}assert.equal(s.winner,0);assert.equal(s.scores[0],12);assert.ok(s.jars[0].pieces.every(p=>p.escapedAt!==null));
});
test('exact simultaneous final exits draw rather than selecting an index',()=>{
 const s=createShakeGame(1,2);for(const j of s.jars){j.open=true;j.angle=Math.PI;j.score=11;j.pieces.forEach((p,i)=>{p.escapedAt=i<11?0:null;p.x=0;p.rotation=Math.PI/2;p.y=G.mouth+breadSupport(p,0,1)-.005;p.vx=0;p.vy=2;});}stepShakeGame(s,{0:{},1:{}});assert.equal(s.finished,true);assert.equal(s.winner,null);assert.equal(s.draw,true);assert.equal(s.jars[0].finishedAt,s.jars[1].finishedAt);
});
test('JSON restore and snapshot rounding preserve meaningful motion without leaking AI strategy',()=>{
 let s=createShakeGame(42,6),copy=structuredClone(s);for(let n=0;n<350;n++){stepShakeGame(s);stepShakeGame(copy);if(n%7===0)copy=JSON.parse(JSON.stringify(copy));assert.deepEqual(copy,s);}const live=createLiveGame(42,'shake',Array.from({length:12},(_,i)=>({id:String(i)})));for(let n=0;n<100;n++)stepLiveGame(live);const snap=liveSnapshot(live);assert.equal(snap.jars[0].ai,undefined);assert.ok(JSON.stringify(snap).length<45000);assert.ok(snap.jars.every(j=>j.pieces.length===12));
});
test('owned jars stay neutral until a human acts and recorded preview follows shared outcomes',()=>{
 const live=createLiveGame(42,'shake',[{id:'0',controllerId:'human'},{id:'1'}]);for(let n=0;n<50;n++)stepLiveGame(live);assert.equal(live.jars[0].open,true);assert.equal(live.jars[0].pulses,0);assert.equal(live.jars[0].angle,0);assert.equal(live.jars[1].open,true);const plan=shakePlan(42,2),core=createShakeGame(42,2);while(!core.finished)stepShakeGame(core);assert.equal(plan.finish,core.finish);assert.equal(plan.winner,core.winner);assert.equal(shakePose(plan,plan.winner,plan.duration).score,12);assert.ok(plan.frames.length<602);
});

test('simultaneous emptied jars report a tie rather than an expired timer',()=>{
 const s=createLiveGame(1,'shake',[{id:'a',controllerId:'a'},{id:'b',controllerId:'b'}]);
 for(const j of s.core.jars){j.open=true;j.angle=Math.PI;j.score=11;j.pieces.forEach((p,i)=>Object.assign(p,{escapedAt:i<11?0:null,x:0,rotation:Math.PI/2,y:G.mouth+p.halfWidth-.005,vx:0,vy:2}));}
 stepLiveGame(s);assert.equal(s.finished,true);assert.equal(s.draw,true);assert.equal(s.winner,null);assert.equal(s.reason,'tie');
});


test('every contestant receives the same mixed sizes and every bread can fit through the neck',()=>{
 const s=createShakeGame(83,12),radii=s.jars[0].pieces.map(p=>p.radius);assert.equal(new Set(radii).size,3);
 assert.ok(s.jars[0].pieces.every(p=>Math.min(p.halfWidth,p.halfHeight)<G.neckHalf));assert.ok(Math.max(...radii)>G.neckHalf);assert.equal(new Set(s.jars[0].pieces.map(p=>p.shape)).size,3);
 for(const j of s.jars)assert.deepEqual(j.pieces.map(p=>p.radius),radii);
});
test('oval bread must turn to fit; legacy round pieces keep their radius',()=>{
 const loaf=createShakeGame(1,2).jars[0].pieces.find(p=>p.shape==='loaf');assert.ok(breadSupport(loaf,1,0)>G.neckHalf);loaf.rotation=Math.PI/2;assert.ok(breadSupport(loaf,1,0)<G.neckHalf);assert.equal(breadSupport({radius:.21,rotation:2},1,0),.21);
});
test('shaking physically releases contact jams that inversion alone cannot clear',()=>{
 const tilt=createShakeGame(1,2).jars[0],shake=structuredClone(tilt);
 for(let time=20;time<=60000;time+=20)for(const [jar,action] of [[tilt,false],[shake,time%400===0]]){if(jar.finishedAt!==null)continue;stepShakeJar(jar,{x:Math.max(-1,Math.min(1,(jar.angle-Math.PI)*2)),action},time);}
 assert.ok(tilt.score<12);assert.equal(tilt.finishedAt,null);assert.equal(shake.score,12);assert.ok(shake.finishedAt<20000);assert.ok(shake.pieces.every(p=>p.outletEntered&&p.escapedAt!==null));
});
test('skilled constant human shaking has no guaranteed win against the same AI physics',()=>{
 let wins=0,losses=0;
 for(let seed=1;seed<=12;seed++){const s=createShakeGame(seed,6);while(!s.finished){const jar=s.jars[0];stepShakeGame(s,{0:{x:Math.max(-1,Math.min(1,(jar.angle-Math.PI)*2)),action:(s.time+20)%400===0}});}assert.equal(s.draw,false);if(s.winner===0)wins++;else losses++;}
 assert.ok(wins>0&&losses>0,JSON.stringify({wins,losses}));
});
