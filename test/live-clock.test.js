import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveClock} from '../public/live-clock.js';
test('input and render timeline ignores later packet latency and wall clock changes',()=>{
 const clock=createLiveClock(),race={id:'a',startAt:10000};
 assert.equal(clock(race,100,9000),-1000);
 assert.equal(clock(race,1100,9500),0);
 assert.equal(clock(race,1116,30000),16);
 assert.equal(clock(race,1132,8000),32);
});
test('ready countdown reschedules and new races get a new anchor',()=>{
 const clock=createLiveClock();
 clock({id:'a',startAt:20000},100,10000);
 assert.equal(clock({id:'a',startAt:15100},1000,12000),-3100);
 assert.equal(clock({id:'a',startAt:15100},4100,12000),0);
 assert.equal(clock({id:'b',startAt:20000},5100,20000),0);
});
