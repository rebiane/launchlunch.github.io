import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalPrediction} from '../public/live-prediction.js';
import {CART_DISTANCE,stepCartMotion} from '../public/game-rules.js';
const snapshot=()=>({time:1000,mode:'cookie',players:[{id:'a',controllerId:'me',x:0,z:0,y:0,progress:0,heading:0,alive:true,stunUntil:0,jumpAt:-10000,inputSeq:0},{id:'b',x:4,z:0,alive:true}]});
test('local input moves before a network reply while other players and raw state stay authoritative',()=>{const view=createLocalPrediction(),s=snapshot();view.input('r',1000,{x:1,z:0,jump:false},1);const p=view.render(s,'r','me',1050);assert.ok(p.players[0].x>.1);assert.equal(s.players[0].x,0);assert.equal(p.players[1],s.players[1]);assert.equal(view.render(s,'r','me',2000).players[0].x,view.render(s,'r','me',2100).players[0].x);});
test('prediction replays direction changes, stops on release and preserves contacts and results',()=>{const view=createLocalPrediction(),s=snapshot();view.input('r',1000,{x:1,z:0},1);view.input('r',1050,{x:0,z:0},2);const p=view.render(s,'r','me',1100);assert.ok(Math.abs(p.players[0].x-.18)<1e-6);const wall={...s,players:[s.players[0],{...s.players[1],x:.9}]};assert.ok(view.render(wall,'r','me',1100).players[0].x<.05);assert.equal(view.render({...s,finished:true},'r','me',1100).players[0],s.players[0]);assert.equal(view.render(s,'new','me',1100),s);});
test('jump is immediate, stun and server death cannot be overridden',()=>{const view=createLocalPrediction(),s={...snapshot(),mode:'island'};view.input('r',1000,{x:0,z:0,jump:true},1);assert.ok(view.render(s,'r','me',1050).players[0].y>0);const stunned={...s,players:[{...s.players[0],stunUntil:2000},s.players[1]]};assert.equal(view.render(stunned,'r','me',1050).players[0].y,0);const dead={...s,players:[{...s.players[0],alive:false},s.players[1]]};assert.equal(view.render(dead,'r','me',1050),dead);});

test('games without jump ignore jump prediction',()=>{const view=createLocalPrediction(),s=snapshot();view.input('r',1000,{x:0,z:0,jump:true},1);assert.equal(view.render(s,'r','me',1050).players[0].y,0);});
test('100ms server updates reconcile forward motion without stepping backward or delaying reversal',()=>{
 const view=createLocalPrediction(),first=snapshot();view.input('r',1000,{x:1,z:0},1);
 let previous=view.render(first,'r','me',1080).players[0].x;
 const delayed={...first,time:1080,players:[{...first.players[0],x:.12,inputSeq:1},first.players[1]]};
 for(let time=1100;time<=1180;time+=20){const x=view.render(delayed,'r','me',time).players[0].x;assert.ok(x>=previous-1e-9,`${time}: ${x} moved behind ${previous}`);previous=x;}
 const next={...delayed,time:1180,players:[{...delayed.players[0],x:.48,inputSeq:1},first.players[1]]};
 const atChange=view.render(next,'r','me',1180).players[0].x;assert.ok(atChange>=previous-1e-9);
 view.input('r',1180,{x:-1,z:0},2);assert.ok(view.render(next,'r','me',1200).players[0].x<atChange);
 const dead={...next,players:[{...next.players[0],alive:false},first.players[1]]};assert.equal(view.render(dead,'r','me',1220),dead);
});
test('held jump predicts another hop after landing but never resets an airborne jump',()=>{
 for(const mode of ['island']){const view=createLocalPrediction(),s={...snapshot(),mode,time:1000,players:[{...snapshot().players[0],jumpAt:900},snapshot().players[1]]};view.input('r',1000,{x:0,z:mode==='tricycle'?-1:0,jumpHeld:true},1);const airborne=view.render(s,'r','me',1050);assert.equal(airborne.players[0].jumpAt,900);
 const landed={...s,time:1900,players:[{...s.players[0],jumpAt:900,inputSeq:1},s.players[1]]};view.input('r',1900,{x:0,z:mode==='tricycle'?-1:0,jumpHeld:true},2);assert.ok(view.render(landed,'r','me',1950).players[0].jumpAt>=1900);
 }
});
test('a late packet does not pull a moving character backward while prediction waits at its horizon',()=>{
 const view=createLocalPrediction(),s=snapshot();view.input('r',1000,{x:1,z:0},1);view.render(s,'r','me',1100);
 const reply={...s,time:1080,players:[{...s.players[0],x:.1,inputSeq:1},s.players[1]]};view.render(reply,'r','me',1100);
 const before=view.render(reply,'r','me',1230).players[0].x;assert.ok(view.render(reply,'r','me',1280).players[0].x>before);const capped=view.render(reply,'r','me',1800).players[0].x;assert.equal(view.render(reply,'r','me',1900).players[0].x,capped);
});
test('race prediction respects the actual finish distance instead of overshooting and snapping back',()=>{
 for(const [mode,limit] of [['tricycle',CART_DISTANCE],['climb',28]]){const view=createLocalPrediction(),s={...snapshot(),mode,players:[{...snapshot().players[0],progress:limit-.01,z:mode==='tricycle'?-limit+.01:0,y:mode==='climb'?limit-.01:0},snapshot().players[1]]};view.input('r',1000,{x:0,z:-1},1);const p=view.render(s,'r','me',1150).players[0];assert.equal(p.progress,limit);if(mode==='tricycle')assert.equal(p.z,-limit);}
});

function delayedMovement(delay){
 const view=createLocalPrediction(),packets=[];
 const motion={progress:0,velocity:3,speedLevel:1,steerX:0};for(let t=0;t<=5000;t+=100){if(t)stepCartMotion(motion,{},t,100);packets.push({arrival:t+delay(t),state:{...snapshot(),mode:'tricycle',time:t,players:[{...snapshot().players[0],...motion,x:0,z:-motion.progress,inputSeq:t/100}]}});}
 let state=null,previous=null,stalls=0,maxVelocity=0,minVelocity=Infinity;
 for(let frame=0;frame<=300;frame++){
  const time=frame*1000/60;
  if(frame%6===0)view.input('r',time,{x:0,z:0,jump:false},frame/6);
  for(const packet of packets)if(packet.arrival<=time&&(!state||packet.state.time>state.time))state=packet.state;
  if(!state)continue;
  const progress=view.render(state,'r','me',time).players[0].progress;
  if(previous!==null&&time>1000){const velocity=(progress-previous)*60;if(velocity<.05)stalls++;maxVelocity=Math.max(maxVelocity,velocity);minVelocity=Math.min(minVelocity,velocity);}
  previous=progress;
 }
 return {stalls,maxVelocity,minVelocity};
}
test('60Hz held movement stays continuous across 100ms packets with 150–250ms latency and jitter',()=>{
 for(const delay of [()=>150,()=>250,t=>150+(t/100%3)*50]){
  const stats=delayedMovement(delay);assert.equal(stats.stalls,0,JSON.stringify(stats));assert.ok(stats.maxVelocity<=3.1,JSON.stringify(stats));assert.ok(stats.minVelocity>=2.99,JSON.stringify(stats));
 }
});
test('network loss stops prediction within 650ms even while local inputs continue',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'island'};
 view.input('r',1000,{x:1,z:0},1);view.render(s,'r','me',1500);
 for(let time=1500;time<=2400;time+=100)view.input('r',time,{x:1,z:0},time);
 const capped=view.render(s,'r','me',1700).players[0];
 assert.equal(capped.poseTime,1650);assert.equal(view.render(s,'r','me',2400).players[0].x,capped.x);
});
test('old held input becomes neutral even when fresh server packets still arrive',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'island'};view.input('r',1000,{x:1,z:0,jumpHeld:true},1);view.render(s,'r','me',1200);
 const fresh={...s,time:1700,players:[{...s.players[0],x:1,jumpAt:1000,inputSeq:1},s.players[1]]};
 const shown=view.render(fresh,'r','me',1900).players[0];
 // Reconciliation can retain an earlier position, but expired input cannot
 // begin another jump or simulate more movement from the new snapshot.
 assert.equal(shown.jumpAt,1000);const later=view.render(fresh,'r','me',2000).players[0];assert.ok(later.x<=shown.x);
});
test('large ordinary corrections stay continuous then converge after release',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'island',players:[{...snapshot().players[0],x:4},snapshot().players[1]]};
 view.input('r',1000,{x:0,z:0},1);const old=view.render(s,'r','me',1100).players[0];
 const corrected={...s,time:1100,players:[{...s.players[0],x:1},s.players[1]]};
 const first=view.render(corrected,'r','me',1100).players[0];assert.equal(first.x,old.x,'server correction must not teleport a living character');
 let previous=first.x;
 for(let time=1116;time<=2200;time+=16){const x=view.render(corrected,'r','me',time).players[0].x;assert.ok(x<=previous&&x>=1);previous=x;}
 assert.ok(Math.abs(previous-1)<.0001,'released control must converge to server position');
});
test('prediction keeps radial bounds and applies authoritative contact immediately',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'island',players:[{...snapshot().players[0],x:7.1,z:0},snapshot().players[1]]};
 view.input('r',1000,{x:1,z:1},1);let p=view.render(s,'r','me',1300).players[0];assert.ok(Math.hypot(p.x,p.z)<=7.200001);
 const hit={...s,time:1300,players:[{...s.players[0],x:5,z:0,stunUntil:2000},s.players[1]]};p=view.render(hit,'r','me',1300).players[0];assert.equal(p.x,5);assert.equal(p.z,0);
});
test('book movement waits for page reveal and does not cross into an unconfirmed next page',()=>{
 const view=createLocalPrediction(),base={...snapshot(),mode:'race',book:{start:1000,reveal:1560,deadline:4620}};
 view.input('r',1000,{x:1,z:0},1);
 for(const time of [1050,1200,1500])assert.equal(view.render(base,'r','me',time).players[0].x,0);
 const opening={...base,time:1500};view.input('r',1500,{x:1,z:0},2);
 assert.equal(view.render(opening,'r','me',1540).players[0].x,0);
 assert.ok(view.render(opening,'r','me',1600).players[0].x>0);
 const closing={...base,time:4600,players:[{...base.players[0],x:1},base.players[1]]};const closingView=createLocalPrediction();closingView.input('r',4600,{x:1,z:0},3);
 const closed=closingView.render(closing,'r','me',4700).players[0].x;
 assert.equal(closingView.render(closing,'r','me',4800).players[0].x,closed);
 const next={...closing,time:4800,book:{start:4620,reveal:5180,deadline:8100}};
 const first=closingView.render(next,'r','me',4800).players[0].x;
 const stationary=closingView.render(next,'r','me',4820).players[0].x;
 assert.ok(stationary<=first,'reopening cannot resume held movement before reveal');
});


test('crush prediction uses the same full depth as server controls',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'crush',players:[{...snapshot().players[0],z:6},snapshot().players[1]]};
 view.input('r',1000,{x:0,z:1},1);
 const shown=view.render(s,'r','me',1100).players[0];
 assert.ok(shown.z>6&&shown.z<7.5,'legal server position beyond z=5 must not be pulled backward');
});


test('river prediction continues the authoritative gear timer while steering diagonally',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'tricycle',players:[{...snapshot().players[0],x:-2.4,steerX:0,speedLevel:2,velocity:4.4,gearElapsed:550,throttle:true},snapshot().players[1]]};
 view.input('r',1000,{x:1,z:-1},1);
 const p=view.render(s,'r','me',1100).players[0];assert.equal(p.speedLevel,3);assert.ok(p.steerX>.5);assert.ok(Math.abs(p.x+2.4-p.steerX)<1e-9);assert.equal(p.y,0);
 const confirmed={...s,time:1100,players:[{...p,inputSeq:1},s.players[1]]};assert.equal(view.render(confirmed,'r','me',1120).players[0].speedLevel,3);
});
test('river prediction releases throttle and uses the server downshift timer',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'tricycle',players:[{...snapshot().players[0],x:-2.4,steerX:0,speedLevel:4,velocity:8.8,gearElapsed:400,throttle:false},snapshot().players[1]]};
 view.input('r',1000,{x:-1,z:0},1);
 const p=view.render(s,'r','me',1100).players[0];assert.equal(p.speedLevel,3);assert.ok(p.steerX<-.5);
 const confirmed={...s,time:1100,players:[{...p,inputSeq:1},s.players[1]]};assert.equal(view.render(confirmed,'r','me',1120).players[0].speedLevel,3);
});
test('river lateral correction cannot overpower a small reversed steering input at high forward speed',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'tricycle',players:[{...snapshot().players[0],x:-1.8,steerX:.6,speedLevel:6,velocity:16.2},snapshot().players[1]]};
 view.input('r',1000,{x:.25,z:-1},1);view.render(s,'r','me',1050);
 const reply={...s,time:1050,players:[{...s.players[0],x:-3,steerX:-.6,inputSeq:1},s.players[1]]};
 view.input('r',1050,{x:-.25,z:-1},2);let last=view.render(reply,'r','me',1050).players[0];
 for(let time=1066;time<=1178;time+=16){const p=view.render(reply,'r','me',time).players[0];assert.ok(p.x<last.x,'left steering must immediately continue left');assert.ok(Math.abs(p.steerX-(p.x+2.4))<1e-9);assert.ok((last.x-p.x)/.016<2.1,'forward speed cannot create a lateral correction burst');last=p;}
});
test('authoritative river spin clears pre-contact prediction offsets immediately',()=>{
 const view=createLocalPrediction(),s={...snapshot(),mode:'tricycle',players:[{...snapshot().players[0],x:-2.4,steerX:0,velocity:16.2,speedLevel:6},snapshot().players[1]]};
 view.input('r',1000,{x:.5,z:-1},1);view.render(s,'r','me',1200);
 const hit={...s,time:1100,players:[{...s.players[0],progress:.2,z:-.2,spinUntil:2100,spinStartedAt:1100,velocity:0,speedLevel:1,inputSeq:1},s.players[1]]};
 const shown=view.render(hit,'r','me',1200).players[0];assert.equal(shown.progress,.2);assert.equal(shown.velocity,0);assert.equal(shown.x,-2.4);assert.equal(shown.steerX,0);assert.equal(shown.speedLevel,1);
});
test('outer river lane steering stays continuous through delayed snapshots and reversals',()=>{
 const count=12,index=0,lane=(index-(count-1)/2)*4.8,motion={progress:0,velocity:3,speedLevel:1,steerX:0},packets=[],control=time=>({x:Math.floor(time/500)%2?-.25:.25,z:time<2500?-1:0});
 for(let time=0;time<=5000;time+=100){if(time)stepCartMotion(motion,control(time-100),time,100);const players=Array.from({length:count},(_,i)=>({...snapshot().players[0],id:String(i),controllerId:i===index?'me':null,x:(i-(count-1)/2)*4.8,steerX:0}));Object.assign(players[index],motion,{x:lane+motion.steerX,z:-motion.progress,inputSeq:time/100});packets.push({arrival:time+150+(time/100%3)*50,state:{mode:'tricycle',time,players}});}
 const view=createLocalPrediction();let state=null,last=null,maxLateralSpeed=0,stalls=0;
 for(let frame=0;frame<=300;frame++){const time=frame*1000/60;if(frame%6===0)view.input('r',time,control(Math.round(time)),frame/6);for(const p of packets)if(p.arrival<=time&&(!state||p.state.time>state.time))state=p.state;if(!state)continue;const shown=view.render(state,'r','me',time).players[index];assert.ok(Math.abs(shown.x-lane-shown.steerX)<1e-9);assert.ok(Math.abs(shown.steerX)<=1.3);if(last&&time>1000){maxLateralSpeed=Math.max(maxLateralSpeed,Math.abs(shown.x-last.x)*60);if(shown.progress-last.progress<.0001)stalls++;}last=shown;}
 assert.equal(stalls,0);assert.ok(maxLateralSpeed<1.36,`lateral velocity spike ${maxLateralSpeed}`);
});
