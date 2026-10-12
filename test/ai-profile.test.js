import test from 'node:test';
import assert from 'node:assert/strict';
import {aiProfile} from '../public/ai-profile.js';
import {createBookGame,createIslandGame} from '../public/party-core.js';
import {createCookieGame,stepCookieGame} from '../public/cookie.js';
import {createSurvivalGame} from '../public/survival.js';
import {createSprintGame,stepSprintGame} from '../public/sprint.js';
test('AI decision styles are seeded, shuffled and span novice through expert without speed changes',()=>{
 for(const seed of [4,15,27]){
 const profiles=Array.from({length:6},(_,i)=>aiProfile(seed,i,6));assert.deepEqual(profiles,Array.from({length:6},(_,i)=>aiProfile(seed,i,6)));assert.ok(Math.max(...profiles.map(p=>p.skill))>.8);assert.ok(Math.min(...profiles.map(p=>p.skill))<.3);
 const book=createBookGame(seed,6);assert.equal(new Set(book.speeds).size,1);assert.ok(Math.max(...book.agents.map(a=>a.ready))-Math.min(...book.agents.map(a=>a.ready))>200);
 const fire=createSurvivalGame(seed,6,'fire');assert.equal(new Set(fire.speeds).size,1);assert.ok(new Set(fire.agents.map(a=>a.profile.reaction)).size===6);
 }
 assert.notDeepEqual(Array.from({length:6},(_,i)=>aiProfile(4,i,6)),Array.from({length:6},(_,i)=>aiProfile(5,i,6)));
});
test('new AI decisions survive state clone and produce actual differing cookie scores and climb finishes',()=>{
 for(const mode of ['cookie','climb']){let s=mode==='cookie'?createCookieGame(37,6):createSprintGame(37,6,'climb');const step=mode==='cookie'?stepCookieGame:x=>stepSprintGame(x,{},true);for(let i=0;i<80;i++)step(s);const resumed=structuredClone(s);for(let i=0;i<20;i++){step(s);step(resumed);}assert.deepEqual(resumed,s);while(mode==='cookie'?!s.finished:!s.settled)step(s);assert.ok(new Set(mode==='cookie'?s.scores:s.finishTimes).size>1);}
 const island=createIslandGame(42,6);assert.ok(new Set(island.jumps.map(j=>JSON.stringify(j))).size===6);
});
