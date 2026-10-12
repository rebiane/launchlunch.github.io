import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveGame,liveSnapshot} from '../public/live-game.js';
import {createLocalPrediction} from '../public/live-prediction.js';
import {createLiveView} from '../public/live-view.js';
import {GAME_META,gamePlan} from '../public/game.js';
const entries=Array.from({length:12},(_,i)=>({id:String(i),controllerId:i===11?'me':null}));
test('new menu replaces crush with shake and retains a valid recorded game',()=>{
 assert.equal(GAME_META.crush,undefined);assert.ok(GAME_META.shake);
 const p=gamePlan(42,'shake',entries);assert.ok(Number.isFinite(p.finish));assert.equal(p.falls.length,12);
});
test('local tilt and lid open render before acknowledgement without moving the station or editing server state',()=>{
 const s=liveSnapshot(createLiveGame(42,'shake',entries)),view=createLocalPrediction();
 view.input('r',0,{x:1,z:0,action:true},1);
 const shown=view.render(s,'r','me',100);
 assert.ok(shown.jars[11].open);assert.ok(shown.jars[11].angle<-.1);
 assert.equal(s.jars[11].open,false);assert.equal(s.jars[11].angle,0);
 assert.equal(shown.players[11].x,s.players[11].x);
 assert.equal(shown.jars[0],s.jars[0]);assert.equal(shown.finished,false);
});
test('confirmed shake action is not applied again by local replay',()=>{
 const s=liveSnapshot(createLiveGame(42,'shake',entries));s.players[11].inputSeq=3;
 const jar=s.jars[11];jar.open=true;jar.lidAt=0;jar.pulses=2;jar.shakeAt=0;
 const view=createLocalPrediction();view.input('r',0,{x:0,z:0,action:true},3);
 assert.equal(view.render(s,'r','me',100).jars[11].pulses,2);
});
test('remote jars interpolate position and rotation, but preserve actual escape transitions',()=>{
 const s=liveSnapshot(createLiveGame(42,'shake',entries)),view=createLiveView();view(s,'r',0);
 const next=structuredClone(s);next.time=100;next.jars[0].angle=1;next.jars[0].pieces[0].x+=1;
 view(next,'r',100);const half=view(next,'r',150);assert.equal(half.jars[0].angle,.5);assert.equal(half.jars[0].pieces[0].x,s.jars[0].pieces[0].x+.5);
 const out=structuredClone(next);out.time=200;out.jars[0].pieces[0].escapedAt=180;
 assert.equal(view(out,'r',200).jars[0].pieces[0].escapedAt,180);
});

test('local exit prediction never invents a score, completion or detached lunchbox',()=>{
 const s=liveSnapshot(createLiveGame(42,'shake',entries)),jar=s.jars[11];jar.open=true;jar.angle=Math.PI;jar.score=11;
 jar.pieces.forEach((p,i)=>{p.x=0;p.y=2.319;p.vx=0;p.vy=2;p.escapedAt=i===0?null:0;p.escapeAngle=i===0?null:Math.PI;});
 const view=createLocalPrediction();view.input('r',0,{x:0,z:0},1);const shown=view.render(s,'r','me',100).jars[11];
 assert.equal(shown.score,11);assert.equal(shown.finishedAt,null);assert.equal(shown.pieces[0].escapedAt,null);assert.equal(shown.pieces[0].escapeAngle,null);assert.ok(shown.pieces[0].y<2.32);
 assert.deepEqual(shown.pieces[1],jar.pieces[1]);
 const confirmed=structuredClone(s);confirmed.time=100;confirmed.jars[11].score=12;confirmed.jars[11].finishedAt=80;confirmed.jars[11].pieces[0].escapedAt=80;confirmed.jars[11].pieces[0].escapeAngle=Math.PI;
 const final=view.render(confirmed,'r','me',120).jars[11];assert.equal(final.score,12);assert.equal(final.finishedAt,80);assert.equal(final.pieces[0].escapedAt,80);
});
test('jar drag has the same strength across authoritative and display substep sizes',async()=>{
 const {createShakeGame,stepShakeJar}=await import('../public/shake.js');const a=createShakeGame(1,2).jars[0];a.pieces=a.pieces.slice(0,1);Object.assign(a.pieces[0],{x:0,y:0,vx:1,vy:0});const b=structuredClone(a);
 for(let t=20;t<=200;t+=20)stepShakeJar(a,{},t,20);
 for(let n=1;n<=12;n++)stepShakeJar(b,{},n*200/12,200/12);
 assert.ok(Math.abs(a.pieces[0].vx-b.pieces[0].vx)<1e-12);
 assert.ok(Math.abs(a.pieces[0].y-b.pieces[0].y)<.0015);
});
