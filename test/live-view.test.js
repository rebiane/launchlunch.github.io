import test from 'node:test';import assert from 'node:assert/strict';import {createLiveView} from '../public/live-view.js';
test('live view smooths network steps without changing authoritative state, death or winners',()=>{const view=createLiveView(),a={time:0,players:[{id:'a',alive:true,x:0,z:0,y:0,heading:3.1}]},b={time:100,players:[{id:'a',alive:true,x:1,z:0,y:1,heading:-3.1}]};view(a,'r',0);assert.equal(view(b,'r',100).players[0].x,0);const mid=view(b,'r',150);assert.equal(mid.players[0].x,.5);assert.ok(mid.players[0].heading>3);assert.equal(b.players[0].x,1);assert.equal(view(b,'r',200).players[0].x,1);const end={...b,finished:true,winner:null,draw:true,players:[{...b.players[0],alive:false}]};assert.equal(view(end,'r',210).players[0].alive,false);assert.equal(view(end,'r',500).time,100);assert.equal(view(a,'new',600).players[0].x,0);});

test('river lateral pose and wake velocity interpolate together with track progress',()=>{
 const view=createLiveView(),a={mode:'tricycle',time:0,players:[{id:'a',alive:true,x:-2.4,z:0,y:0,steerX:0,velocity:3,progress:0},{id:'b',alive:true,x:2.4,z:0,y:0,steerX:0,velocity:3,progress:0}]},b={...a,time:100,players:[{...a.players[0],x:-1.4,z:-1,steerX:1,velocity:5,progress:1},a.players[1]]};
 view(a,'river',0);const start=view(b,'river',100).players[0];assert.equal(start.steerX,0);assert.equal(start.velocity,3);
 const mid=view(b,'river',150).players[0];assert.equal(mid.steerX,.5);assert.equal(mid.velocity,4);assert.ok(Math.abs(mid.x+2.4-mid.steerX)<1e-9);assert.equal(b.players[0].steerX,1);
});

const movingSnapshot=time=>({mode:'cookie',time,players:[{id:'a',alive:true,x:time/1000,z:0,y:0,heading:Math.PI/2,progress:0,score:0}]});
function playback(delays=[],missing=new Set()){
 const view=createLiveView(),packets=Array.from({length:21},(_,i)=>({at:i*100+(delays[i%delays.length]||0),state:movingSnapshot(i*100)})).filter((_,i)=>!missing.has(i)).sort((a,b)=>a.at-b.at),frames=[];let current=packets[0].state,next=0;
 for(let frame=0;frame<=120;frame++){const now=frame*1000/60;while(next<packets.length&&packets[next].at<=now+1e-7)current=packets[next++].state;const shown=view(current,'continuous',now);frames.push({now,x:shown.players[0].x,time:shown.presentationTime,authoritative:current.time});}
 return frames;
}
test('100ms packets produce constant 60Hz motion after startup, without an easing pause at packet boundaries',()=>{
 const frames=playback();for(let i=20;i<frames.length;i++){const delta=frames[i].x-frames[i-1].x;assert.ok(Math.abs(delta-1/60)<1e-9,`frame ${i}: ${delta}`);}
});
test('jittered arrivals keep constant motion while within the interpolation buffer',()=>{
 const frames=playback([0,20,40,10,30]);for(let i=20;i<frames.length;i++){assert.ok(frames[i].x>=frames[i-1].x-1e-9,'late packet must not reverse steady travel');assert.ok(Math.abs(frames[i].x-frames[i-1].x-1/60)<1e-8,`jitter step ${i}`);}
});
test('packet loss extrapolates at most 100ms, then settles without unbounded travel',()=>{
 const view=createLiveView();view(movingSnapshot(100),'loss',100);const snapshot=movingSnapshot(200);view(snapshot,'loss',200);
 const early=view(snapshot,'loss',400),late=view(snapshot,'loss',9000);assert.ok(early.presentationTime<=300);assert.ok(late.presentationTime<=300);assert.ok(late.players[0].x<=.3+1e-9);assert.equal(snapshot.players[0].x,.2);
 const recovered=view(movingSnapshot(9000),'loss',9000);assert.ok(Number.isFinite(recovered.players[0].x));
});
test('countdown snapshots and a restarted race cannot inherit an old timeline or movement correction',()=>{
 const view=createLiveView();view(movingSnapshot(700),'old',1000);view(movingSnapshot(800),'old',1100);const waiting=movingSnapshot(0);
 for(const now of [5000,5100,8000]){const result=view(waiting,'new',now);assert.equal(result.presentationTime,0);assert.equal(result.players[0].x,0);}
 const fresh=movingSnapshot(100);view(fresh,'new',8100);const moving=view(fresh,'new',8150);assert.equal(moving.presentationTime,50);assert.ok(moving.players[0].x>=0&&moving.players[0].x<=.1);assert.equal(fresh.players[0].x,.1);
});
test('missed packet recovery preserves ordering and bounds at every rendered frame',()=>{
 const frames=playback([0,20,10],new Set([5,6,12]));for(let i=1;i<frames.length;i++){assert.ok(frames[i].time<=frames[i].authoritative+100+1e-7);assert.ok(frames[i].x>=frames[i-1].x-1e-7);assert.ok(frames[i].x-frames[i-1].x<.12,'recovery cannot teleport a whole lost interval');}
});
test('a late reversal reconciles without a position snap and converges to the new direction',()=>{
 const view=createLiveView(),snapshot=time=>{const s=movingSnapshot(time);s.players[0].x=time<=300?time/1000:.3-(time-300)/1000;s.players[0].heading=time<=300?Math.PI/2:-Math.PI/2;return s;};
 let current=snapshot(0),previous=null,maxStep=0,lastPresentation=0;const points=[];
 for(let frame=0;frame<=72;frame++){const now=frame*1000/60;if(frame===6)current=snapshot(100);if(frame===12)current=snapshot(200);if(frame===18)current=snapshot(300);if(frame===30)current=snapshot(500);if(frame>30&&frame%6===0)current=snapshot(Math.round(now));const result=view(current,'turn',now),p=result.players[0];lastPresentation=result.presentationTime;if(previous!==null)maxStep=Math.max(maxStep,Math.abs(p.x-previous));previous=p.x;points.push(p.x);assert.ok(Number.isFinite(p.heading));}
 assert.ok(maxStep<.05,`late reversal produced a ${maxStep} jump`);assert.ok(points.at(-1)<points.at(-10));assert.ok(Math.abs(points.at(-1)-(.3-(lastPresentation-300)/1000))<.025,'reconciliation must converge instead of retaining positional drift');
});
