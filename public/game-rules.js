// Shared physical tuning for automatic play, direct controls, and client prediction.
export const moveSpeed=mode=>({race:6.2,island:3.6,cookie:3.6,fire:5.2,climb:3.8}[mode]??4.4);
export const sprintSpeed=mode=>mode==='climb'?1.75:5.5;
export const canJump=mode=>mode==='island';
export const jumpDuration=mode=>mode==='island'?640:mode==='tricycle'?760:700;
export const jumpCooldown=mode=>jumpDuration(mode)+100;
// A scheduled AI takeoff may be replaced only while it is still in the future
// at the authoritative snapshot, never relative to an old replayed input.
export function canStartJump(mode,p,time,referenceTime=time){return canJump(mode)&&time>=p.stunUntil&&(time-p.jumpAt>jumpCooldown(mode)||(p.jumpAt>referenceTime&&!(p.y>0)));}
export function jumpHeight(mode,age){if(!canJump(mode))return 0;const u=age/jumpDuration(mode);if(u<0||u>1)return 0;return mode==='island'?1.55*4*u*(1-u):Math.sin(u*Math.PI)*(mode==='tricycle'?1.35:1.5);}
export function arenaBounds(mode,count=2){if(mode==='island')return {x:7.2,z:7.2,radius:7.2};if(mode==='tricycle')return {x:(count-1)*2.4+1.3,z:Infinity};if(mode==='climb')return {x:count*.825,z:Infinity};return mode==='cookie'?{x:5.85,z:4.1}:mode==='race'?{x:6.7,z:4.4}:mode==='boulder'?{x:6.65,z:8}:mode==='crush'?{x:7.5,z:7.5}:{x:5.8,z:5};}
export const cookieValue=(rng,gold=false)=>gold?5:rng()<.18?3:1;
export const goldenCookieCount=(count,available,cap)=>Math.min(2,Math.ceil(count/3),Math.max(0,cap-available));
export function boulderImpulse(h,p,hp){const nx=p.x-hp.x,nz=Math.max(.4,p.z-hp.z),len=Math.hypot(nx,nz)||1,impulse=1+Math.max(0,h.vz-3.7)*.32;return {x:nx/len*12*impulse,z:nz/len*11*impulse};}
export const cartRecovery=(radius,height)=>480+radius*160+(1-height/.65)*100;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const CART_DISTANCE=420,CART_LANE_SPACING=4.8,CART_STEER_LIMIT=1.3,CART_STEER_SPEED=5.4;
export const CART_SPEEDS=Object.freeze([3,4.4,6.3,8.8,15,27]);
// Closed-form damped acceleration toward a gear's speed in the gentle current.
// Position and velocity are continuous at shifts and independent of frame size.
function cartAdvance(progress,velocity,base,seconds){
 const tau=.32,k=.1/CART_DISTANCE,root=Math.sqrt(1+4*tau*base*k),fast=(-1-root)/(2*tau),slow=2*base*k/(1+root),x=progress+1/k,A=(velocity-fast*x)/(slow-fast),B=x-A,ea=Math.expm1(slow*seconds),eb=Math.expm1(fast*seconds);
 return {progress:progress+A*ea+B*eb,velocity:velocity+A*slow*ea+B*fast*eb};
}
export function stepCartMotion(p,input,time,milliseconds,boost=1){
 const before=p.progress||0,beforeSteer=p.steerX||0,throttle=Number(input.z)<0;
 p.speedLevel=clamp(p.speedLevel||1,1,6);
 if(p.throttle!==throttle){p.gearElapsed=0;p.throttle=throttle;}
 const activeMs=Math.max(0,time-Math.max(time-milliseconds,p.spinUntil||0)),dt=activeMs/1000,interval=throttle?600:450;
 if(activeMs<milliseconds-1e-7)p.gearElapsed=0;
 let remaining=activeMs,crossingTime=null;p.gearElapsed=p.gearElapsed||0;
 while(remaining>1e-9){
  const span=Math.min(remaining,interval-p.gearElapsed),base=CART_SPEEDS[p.speedLevel-1]*boost,startProgress=p.progress||0,startVelocity=p.velocity??CART_SPEEDS[0]*boost,next=cartAdvance(startProgress,startVelocity,base,span/1000);
  if(crossingTime===null&&startProgress<CART_DISTANCE&&next.progress>=CART_DISTANCE){let lo=0,hi=span;for(let j=0;j<36;j++){const mid=(lo+hi)/2;if(cartAdvance(startProgress,startVelocity,base,mid/1000).progress>=CART_DISTANCE)hi=mid;else lo=mid;}crossingTime=time-activeMs+(activeMs-remaining)+hi;}
  p.progress=Math.min(CART_DISTANCE,next.progress);p.velocity=next.velocity;
  p.gearElapsed+=span;remaining-=span;
  if(p.gearElapsed>=interval-1e-8){p.speedLevel=clamp(p.speedLevel+(throttle?1:-1),1,6);p.gearElapsed=0;}
 }
 if(time<(p.spinUntil||0))p.velocity=0;
 p.steerX=clamp(beforeSteer+clamp(Number(input.x)||0,-1,1)*CART_STEER_SPEED*dt,-CART_STEER_LIMIT,CART_STEER_LIMIT);
 return {before,advance:(p.progress||0)-before,beforeSteer,activeStart:time-activeMs,activeMs,crossingTime};
}

export function movePlayer(s,p,control,milliseconds,index){const i=index,dt=milliseconds/1000,len=Math.max(1,Math.hypot(control.x||0,control.z||0)),dx=(control.x||0)/len,dz=(control.z||0)/len;
  if(control.jump&&canStartJump(s.mode,p,s.time))p.jumpAt=s.time;
  const jumpAge=s.time-p.jumpAt,jump=jumpHeight(s.mode,jumpAge);p.y=jump;
  if(dx||dz)p.heading=Math.atan2(dx,dz);
  const old={x:p.x,z:p.z,progress:p.progress};
  if(s.time>=p.stunUntil){
   if(s.mode==='climb'){p.x+=dx*moveSpeed(s.mode)*dt;p.progress=Math.max(0,Math.min(28,p.progress-dz*sprintSpeed(s.mode)*dt));p.y=p.progress+jump*.6;p.z=0;}
   else if(s.mode==='tricycle'){stepCartMotion(p,control,s.time,milliseconds);p.x=(i-(s.players.length-1)/2)*CART_LANE_SPACING+p.steerX;p.z=-p.progress;}
   else {const speed=moveSpeed(s.mode);p.x+=dx*speed*dt;p.z+=dz*speed*dt;}
  }else if(s.mode==='climb')p.y=p.progress;
  if(s.mode==='climb'){const poleX=(i-(s.players.length-1)/2)*1.65;p.x=clamp(p.x,poleX-.3,poleX+.3);}else if(s.mode==='tricycle')p.x=(i-(s.players.length-1)/2)*CART_LANE_SPACING+(p.steerX||0);
  else if(s.mode==='island'){const r=Math.hypot(p.x,p.z);if(r>7.2){p.x*=7.2/r;p.z*=7.2/r;}}
  else {const bounds=arenaBounds(s.mode,s.players.length);p.x=clamp(p.x,-bounds.x,bounds.x);p.z=clamp(p.z,-bounds.z,bounds.z);}
  if(s.mode==='boulder'){p.x+=(p.knockX||0)*dt;p.z+=(p.knockZ||0)*dt;const decay=.94**(milliseconds/40);p.knockX=(p.knockX||0)*decay;p.knockZ=(p.knockZ||0)*decay;}
  if(['cookie','race','fire'].includes(s.mode)&&s.players.some((other,j)=>j!==i&&other.alive&&Math.hypot(other.x-p.x,other.z-p.z)<.86)){p.x=old.x;p.z=old.z;}
 return {old,jump};
}
