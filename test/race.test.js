import test from 'node:test';
import assert from 'node:assert/strict';
import {gamePlan} from '../public/game.js';
import {pickSpeed,runnerPosition,spinnerAngle,jumpHeight,cleanRestaurant,safeLink} from '../public/race.js';
import {bookPose,insideHole,BOOK_CHARACTER_RADIUS} from '../public/book-motion.js';
test('both simulations end with the actual last survivor, deterministic for all party sizes',()=>{
 for(const mode of ['island','race'])for(let count=2;count<=12;count++)for(let seed=0;seed<25;seed++){
  const entries=Array.from({length:count},(_,i)=>({picks:i%6})),p=gamePlan(seed,mode,entries);
  if(p.draw){assert.equal(p.winner,null);assert.notEqual(p.falls.filter(t=>t===Infinity).length,1);}else{assert.notEqual(p.winner,null);assert.equal(p.falls.filter(t=>t===Infinity).length,1);assert.equal(p.winner,p.falls.indexOf(Infinity));}assert.ok(p.finish>=Math.max(...p.falls.filter(Number.isFinite)));if(mode==='race')assert.equal(p.finish,p.rounds.at(-1).hit);assert.ok(p.duration>p.finish);assert.deepEqual(gamePlan(seed,mode,entries).falls,p.falls);
  for(let i=0;i<count;i++)if(Number.isFinite(p.falls[i])){
   const t=p.falls[i];
   if(mode==='island'){
    const pos=runnerPosition(seed,i,count,t,pickSpeed(entries[i].picks)),step=Math.PI*2/3,phase=spinnerAngle(seed,t)-pos.angle,delta=((phase+Math.PI/3)%step+step)%step-Math.PI/3;
    assert.ok(Math.abs(Math.sin(delta))*pos.radius<.57);assert.ok(jumpHeight(seed,i,count,t,Infinity,entries.map(e=>e.picks))<.65);
   }else{
    const pos=bookPose(p,i,t),round=p.rounds.find(r=>t<=r.hit);
    assert.ok(!round.holes.some(h=>insideHole(h,pos.x,pos.z,BOOK_CHARACTER_RADIUS)));assert.equal(bookPose(p,i,t+500).x,pos.x);assert.equal(bookPose(p,i,t+500).z,pos.z);
   }
  }
 }
});
test('picks give a capped speed bonus without guaranteeing the most-picked winner',()=>{
 assert.equal(pickSpeed(0),1);assert.equal(pickSpeed(1),1.02);assert.equal(pickSpeed(2),1.04);assert.equal(pickSpeed(24),1.1);
 for(const mode of ['island','race']){const winners=new Set();for(let seed=0;seed<30;seed++)winners.add(gamePlan(seed,mode,[{picks:24},{picks:0},{picks:0}]).winner);assert.ok(winners.size>1);assert.ok([...winners].some(i=>i!==0));}
});
test('jump party starts clear of bars and runners travel in all four directions',()=>{
 for(let count=2;count<=12;count++)for(let seed=0;seed<10;seed++)for(let i=0;i<count;i++){
  const p=runnerPosition(seed,i,count,0),step=Math.PI*2/3,delta=((spinnerAngle(seed,0)-p.angle+Math.PI/3)%step+step)%step-Math.PI/3;
  assert.ok(Math.abs(Math.sin(delta))*p.radius>1.1);
  const signs=new Set();let previous=p;
  for(let t=100;t<=10000;t+=100){const next=runnerPosition(seed,i,count,t);signs.add('x'+Math.sign(next.x-previous.x));signs.add('z'+Math.sign(next.z-previous.z));previous=next;}
  for(const sign of ['x1','x-1','z1','z-1'])assert.ok(signs.has(sign));
 }
});
test('manual restaurants need only a name and links reject unsafe schemes',()=>{
 assert.deepEqual(cleanRestaurant({name:' 식당 '}),{name:'식당',address:'',mapUrl:'',placeId:'',rating:null,reviews:null,walkMinutes:null,source:'manual'});
 assert.throws(()=>cleanRestaurant({name:'식당',mapUrl:'javascript:alert(1)'}));assert.equal(safeLink('data:text/html,test'),'');
});
