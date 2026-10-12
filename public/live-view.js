import {blendShakeJar} from './shake-view.js';
import {jumpHeight,arenaBounds,CART_DISTANCE,CART_LANE_SPACING,CART_STEER_LIMIT} from './game-rules.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const coordinates=['x','z','y','progress','steerX','velocity'];
// Remote actors follow one continuous presentation clock, not an easing that
// restarts with every packet. Local controls are predicted separately by app.js.
export function createLiveView(){
 let race=null,source=null,received=0,anchor=0,started=0,frames=[],lastNow=null,lastTime=null,lastRaw=new Map(),corrections=new Map();
 function sample(time){
  if(frames.length<2)return {a:frames[0],b:frames[0],u:0};
  let right=frames.findIndex(s=>s.time>=time);if(right<0)right=frames.length-1;if(right===0)return {a:frames[0],b:frames[0],u:0};
  const a=frames[right-1],b=frames[right];return {a,b,u:clamp((time-a.time)/(b.time-a.time||1),0,1+100/(b.time-a.time||1))};
 }
 function pose(sample,index,time){
  const {a,b,u}=sample,p=b.players[index],old=a.players[index]||p,next={...p,poseTime:time};
  for(const key of coordinates)if(p[key]!==undefined||old[key]!==undefined)next[key]=(old[key]||0)+((p[key]||0)-(old[key]||0))*(key==='velocity'?Math.min(1,u):u);
  if(u>1&&(p.stunUntil>b.time||p.spinUntil>b.time))for(const key of coordinates)next[key]=p[key];
  const delta=Math.atan2(Math.sin((p.heading||0)-(old.heading||0)),Math.cos((p.heading||0)-(old.heading||0)));next.heading=(old.heading||0)+delta*Math.min(1,u);
  if(b.mode==='island')next.y=jumpHeight('island',time-p.jumpAt);
  return next;
 }
 return (snapshot,raceId,now)=>{
  if(!snapshot)return snapshot;
  if(race!==raceId){race=raceId;source=null;frames=[];anchor=snapshot.time;started=now;lastNow=null;lastTime=null;lastRaw.clear();corrections.clear();}
  if(snapshot.time===0){anchor=0;started=now;}
  if(source?.time===0&&snapshot.time>0){anchor=snapshot.time;started=now;}
  const changed=source!==snapshot;
  if(changed){source=snapshot;received=now;if(!frames.length||snapshot.time>frames.at(-1).time)frames.push(snapshot);else if(snapshot.time===frames.at(-1).time)frames[frames.length-1]=snapshot;}
  const time=snapshot.finished?snapshot.time:Math.max(frames[0].time,Math.min(anchor+now-started-100,snapshot.time+100)),pair=sample(time),dt=Math.max(0,now-(lastNow??now)),players=snapshot.players.map((latest,i)=>{
   if(!latest.alive||snapshot.finished){corrections.delete(latest.id);lastRaw.delete(latest.id);return {...latest,poseTime:snapshot.time};}
   const raw=pose(pair,i,time),correction=corrections.get(latest.id)||{x:0,z:0,progress:0};
   for(const key of ['x','z','progress'])correction[key]*=Math.exp(-dt/80);
   // Blend away a short extrapolation error when a late direction change arrives.
   if(changed&&lastTime!==null&&lastRaw.has(latest.id)){const previous=lastRaw.get(latest.id),updated=pose(sample(lastTime),i,lastTime);for(const key of ['x','z','progress'])correction[key]+=(previous[key]||0)-(updated[key]||0);}
   const next={...latest,...raw,alive:latest.alive,score:latest.score};for(const key of ['x','z','progress'])if(raw[key]!==undefined)next[key]+=correction[key];
   const bounds=arenaBounds(snapshot.mode,snapshot.players.length);
   if(snapshot.mode==='tricycle'){const lane=(i-(snapshot.players.length-1)/2)*CART_LANE_SPACING;next.x=clamp(next.x,lane-CART_STEER_LIMIT,lane+CART_STEER_LIMIT);next.steerX=next.x-lane;next.progress=clamp(next.progress||0,0,CART_DISTANCE);next.z=-next.progress;}
   else if(snapshot.mode==='climb'){const lane=(i-(snapshot.players.length-1)/2)*1.65;next.x=clamp(next.x,lane-.3,lane+.3);next.progress=clamp(next.progress||0,0,28);next.y=next.progress;}
   else if(bounds.radius){const length=Math.hypot(next.x,next.z);if(length>bounds.radius){next.x*=bounds.radius/length;next.z*=bounds.radius/length;}}
   else{next.x=clamp(next.x,-bounds.x,bounds.x);next.z=clamp(next.z,-bounds.z,bounds.z);}
   lastRaw.set(latest.id,raw);corrections.set(latest.id,correction);return next;
  });
  const jars=snapshot.jars?.map((jar,i)=>{if(snapshot.finished)return jar;const shown=blendShakeJar(pair.a.jars?.[i],pair.b.jars?.[i]||jar,clamp(pair.u,0,1));return {...shown,score:jar.score,finishedAt:jar.finishedAt,pieces:shown.pieces.map((p,j)=>p.escapedAt!==jar.pieces[j].escapedAt?jar.pieces[j]:p)};});
  lastNow=now;lastTime=time;while(frames.length>3&&frames[1].time<time-250)frames.shift();
  return {...snapshot,...(jars?{jars}:{}),interpolated:true,presentationTime:time,time:snapshot.time+(snapshot.finished?0:Math.min(100,Math.max(0,now-received))),players};
 };
}
