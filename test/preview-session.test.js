import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewSession,PREVIEW_PLAYER} from '../public/preview-session.js';
const entries=Array.from({length:6},(_,i)=>({id:String(i),name:String(i),...(i===0?{controllerId:PREVIEW_PLAYER}:{})}));
test('offline preview preserves countdown, six entrants and neutral owned player',()=>{
 const s=createPreviewSession(42,'island',entries);s.advance(0);
 for(let now=100;now<=3000;now+=100)s.advance(now);
 assert.equal(s.snapshot.time,0);assert.equal(s.snapshot.players.length,6);
 for(let now=3100;now<=3400;now+=100)s.advance(now);
 assert.equal(s.snapshot.players[0].jumpAt<0,true);
});
test('preview keyboard intent moves the controlled player, restart is independent',()=>{
 const s=createPreviewSession(42,'cookie',entries);s.advance(0);for(let n=100;n<=3200;n+=100)s.advance(n);
 const before=s.snapshot.players[0].x;s.input({x:1,z:0});for(let n=3300;n<=3600;n+=100)s.advance(n);
 assert.ok(s.snapshot.players[0].x>before);assert.equal(s.snapshot.players[0].inputSeq,1);
 const again=createPreviewSession(42,'cookie',entries);assert.equal(again.time,-3100);assert.equal(again.snapshot.time,0);
});
test('all eight offline previews finish using actual shared core results',()=>{
 for(const mode of ['island','race','fire','boulder','climb','tricycle','cookie','shake']){
 const s=createPreviewSession(42,mode,entries);s.advance(0);for(let n=100;n<=110000&&!s.snapshot.finished;n+=100)s.advance(n);
 assert.equal(s.snapshot.finished,true,mode);assert.ok(s.snapshot.draw||Number.isInteger(s.snapshot.winner),mode);
 }
});
