export const SHAKE_STEP=20;
export const SHAKE_PIECES=12;
export const SHAKE_GEOMETRY=Object.freeze({halfWidth:1.2,bottom:-1.6,shoulder:1.1,neckY:1.65,neckHalf:.26,mouth:2.1,radius:.22,count:12});
export const BREAD_RADII=Object.freeze([.18,.245,.29]);
export const BREAD_SHAPES=Object.freeze([{shape:'round',halfWidth:.18,halfHeight:.18},{shape:'roll',halfWidth:.245,halfHeight:.17},{shape:'loaf',halfWidth:.29,halfHeight:.135}].map(Object.freeze));
export function breadSupport(p,nx,ny){if(!p.halfWidth||!p.halfHeight)return radius(p);const a=p.rotation||0,c=Math.cos(a),s=Math.sin(a),x=nx*c+ny*s,y=-nx*s+ny*c;return Math.hypot(p.halfWidth*x,p.halfHeight*y);}
const radius=p=>p.radius??SHAKE_GEOMETRY.radius;
const G=SHAKE_GEOMETRY,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const vertices=[[-1.2,-1.6],[1.2,-1.6],[1.2,1.1],[.26,1.65],[.26,2.35],[-.26,2.35],[-.26,1.65],[-1.2,1.1]];
const random=state=>{let t=state.rng=(state.rng+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
function wall(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],u=clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy),0,1),x=a[0]+u*dx,y=a[1]+u*dy,vx=p.x-x,vy=p.y-y,d=Math.hypot(vx,vy),nx=d?vx/d:-dy/Math.hypot(dx,dy),ny=d?vy/d:dx/Math.hypot(dx,dy),r=breadSupport(p,nx,ny);if(d>=r)return;
 p.x+=nx*(r-d);p.y+=ny*(r-d);const normal=p.vx*nx+p.vy*ny;
 if(normal<0){const impulse=-normal*1.08;p.vx+=impulse*nx;p.vy+=impulse*ny;const tangent=-p.vx*ny+p.vy*nx,friction=clamp(tangent,-impulse*.85,impulse*.85);p.vx+=friction*ny;p.vy-=friction*nx;
  if(p.halfWidth!==p.halfHeight){const a=p.rotation||0,c=Math.cos(a),s=Math.sin(a),ux=nx*c+ny*s,uy=-nx*s+ny*c,torque=(p.halfWidth**2-p.halfHeight**2)*ux*uy/(r||1);p.angularVelocity=clamp((p.angularVelocity||0)+torque*impulse*8,-8,8);}
 }
}
function contacts(jar){
 const pieces=jar.pieces.filter(p=>p.escapedAt===null);
 for(let pass=0;pass<4;pass++){
  for(const p of pieces){for(let i=0;i<vertices.length;i++){if(i===4&&jar.open)continue;wall(p,vertices[i],vertices[(i+1)%vertices.length]);}if(!jar.open)wall(p,[-.26,2.1],[.26,2.1]);}
  for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){const a=pieces[i],b=pieces[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),contact=breadSupport(a,d?dx/d:1,d?dy/d:0)+breadSupport(b,d?dx/d:1,d?dy/d:0);if(d>=contact)continue;const nx=d?dx/d:1,ny=d?dy/d:0,push=(contact-d)/2;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(relative<0){const impulse=-relative*.55;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;}}
 }
}
// One jar's identical physical step is used by both the server and short local
// prediction. Gravity, solid shoulders, narrow neck and other boxes determine exits.
export function stepShakeJar(jar,input={},time,milliseconds=SHAKE_STEP){
 if(jar.finishedAt!==null)return jar;
 if(!jar.open&&time>=0){jar.open=true;jar.lidAt=0;}
 const action=input.action===true&&!jar.actionDown;jar.actionDown=input.action===true;
 if(action&&time-jar.shakeAt>=220){jar.shakeAt=time;jar.pulses++;for(const p of jar.pieces)if(p.escapedAt===null){p.vx+=(jar.pulses%2?1:-1)*1.7;p.vy+=1.4;p.angularVelocity=(p.angularVelocity||0)+(jar.pulses%2?1:-1)*(2.3+(p.id%3)*.55);}}
 const x=clamp(Number(input.x)||0,-1,1),z=clamp(Number(input.z)||0,-1,1),delta=z-jar.lastZ;jar.lastZ=z;
 for(const p of jar.pieces)if(p.escapedAt===null){p.vx+=delta*.35;p.vy-=delta*1.25;}
 if(milliseconds<=0)return jar;
 const substeps=Math.max(1,Math.ceil(milliseconds/10)),dt=milliseconds/substeps/1000;
 for(let step=0;step<substeps;step++){
  jar.angle-=x*2.15*dt;
  const gx=-Math.sin(jar.angle)*4.8,gy=-Math.cos(jar.angle)*4.8,damping=Math.pow(.962,dt/.01);
  for(const p of jar.pieces)if(p.escapedAt===null){p.vx=clamp((p.vx+gx*dt)*damping,-12,12);p.vy=clamp((p.vy+gy*dt)*damping,-12,12);p.x+=p.vx*dt;p.y+=p.vy*dt;p.angularVelocity=(p.angularVelocity||0)*Math.exp(-2.4*dt);p.rotation+=(p.angularVelocity+p.vx*.3)*dt;}
  contacts(jar);
  const at=time-milliseconds+(step+1)*dt*1000;
  for(const p of jar.pieces)if(p.escapedAt===null){if(p.y<G.neckY)p.outletEntered=false;else if(Math.abs(p.x)<=G.neckHalf-breadSupport(p,1,0)+.005)p.outletEntered=true;}
  for(const p of jar.pieces)if(p.escapedAt===null&&jar.open&&p.y>=G.mouth+breadSupport(p,0,1)&&p.outletEntered){p.escapedAt=at;p.escapeAngle=jar.angle;p.escapeAngularVelocity=-x*2.15;jar.score++;}
  if(jar.score===G.count){jar.finishedAt=at;break;}
 }
 return jar;
}
export function createShakeGame(seed,count){
 if(count<2||count>12)throw new Error('Shake supports 2–12 restaurants');
 const s={seed,mode:'shake',rng:seed|0,time:0,jars:[],positions:[],scores:Array(count).fill(0),finished:false,finish:0,winner:null,draw:false};
 // Equal load, orientation and geometry for everyone in a race. A new race
 // starts with a different visible arrangement, so one memorized tap rhythm
 // is not an invariant solution.
 const rotations=Array.from({length:G.count},()=>random(s)*.08-.04);
 for(let i=0;i<count;i++){const pieces=Array.from({length:G.count},(_,id)=>({id,...BREAD_SHAPES[id%3],radius:BREAD_RADII[id%3],angularVelocity:0,x:(id%3-1)*.52,y:-1.3+Math.floor(id/3)*.50,vx:0,vy:0,rotation:rotations[id],escapedAt:null,escapeAngle:null}));s.jars.push({angle:0,open:false,lidAt:null,shakeAt:-10000,pulses:0,lastZ:0,actionDown:false,score:0,finishedAt:null,pieces,ai:{skill:random(s),phase:random(s)*Math.PI*2,openAt:220+random(s)*500,period:680+random(s)*400,nextAction:0}});s.positions.push({x:(i-(count-1)/2)*3.4,z:0});}
 return s;
}
function autoInput(jar,time){const a=jar.ai,expert=(a.skill??.5)>.7;if(time<(expert?80+(a.openAt%40):a.openAt))return{};if(a.lastScore!==jar.score){a.lastScore=jar.score;a.progressAt=time;}
 if(time>=(a.observeAt||0)){
  const inside=jar.pieces.filter(p=>p.escapedAt===null),front=inside.reduce((best,p)=>!best||p.y>best.y?p:best,null);
  // React only to the visible pile. A slightly changing tilt feeds the neck;
  // shaking breaks real contact jams rather than awarding progress directly.
  a.target=expert&&(jar.score===0||time-(a.progressAt||0)<6000)?Math.PI+((a.skill??.5)-.5)*.025:2.55+clamp(-(front?.x||0)*.3,-.2,.2)+Math.sin(time/(a.period+450)+a.phase)*.6;
  a.observeAt=time+130+(a.period-680)*.45;
 }
 if(expert&&a.nextAction===0)a.nextAction=340;const x=clamp((jar.angle-a.target)*2,-1,1),action=time>=a.nextAction;
 if(action)a.nextAction=time+(expert?340:500+(Math.sin(time/1300+a.phase)+1)*170);
 return{x,z:0,action};}
export function stepShakeGame(s,inputs={}){
 if(s.finished)return s;s.time+=SHAKE_STEP;
 for(let i=0;i<s.jars.length;i++){stepShakeJar(s.jars[i],inputs[i]??autoInput(s.jars[i],s.time),s.time);s.scores[i]=s.jars[i].score;}
 const completed=s.jars.map(j=>j.finishedAt).filter(t=>t!==null);
 if(completed.length){s.finish=Math.min(...completed);const leaders=s.jars.map((j,i)=>j.finishedAt!==null&&Math.abs(j.finishedAt-s.finish)<1e-7?i:-1).filter(i=>i>=0);s.winner=leaders.length===1?leaders[0]:null;s.draw=leaders.length!==1;s.finished=true;}
 else if(s.time>=60000){s.finish=s.time;s.finished=true;s.draw=true;}
 return s;
}
const rounded=v=>typeof v==='number'?Math.round(v*10000)/10000:v;
export function shakeSnapshotJar(jar){const {ai,...state}=jar;return Object.fromEntries(Object.entries(state).map(([k,v])=>[k,k==='pieces'?v.map(p=>Object.fromEntries(Object.entries(p).map(([key,value])=>[key,rounded(value)]))):rounded(v)]));}
function visualJar(j){return{angle:j.angle,open:j.open,lidAt:j.lidAt,shakeAt:j.shakeAt,score:j.score,finishedAt:j.finishedAt,pieces:j.pieces.map(p=>({...p}))};}
const cache=new Map();
export function shakePlan(seed,count){const key=seed+':'+count;if(cache.has(key))return cache.get(key);const s=createShakeGame(seed,count),frames=[{time:0,jars:s.jars.map(visualJar)}];while(!s.finished){stepShakeGame(s);if(s.time%100===0||s.finished)frames.push({time:s.time,jars:s.jars.map(visualJar)});}const result={mode:'shake',seed,frames,finish:s.finish,duration:s.finish+1600,winner:s.winner,draw:s.draw,scores:s.scores,kind:'score',falls:s.jars.map(()=>Infinity)};if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(key,result);return result;}
export function shakePose(plan,index,time){const frame=plan.frames[Math.min(plan.frames.length-1,Math.max(0,Math.floor(time/100)))];const jar=frame.jars[index];return {...jar,remaining:G.count-jar.score};}


// Escaped bread is detached at its exact mouth position and velocity. This
// shared tray simulation keeps renderer frames continuous and lets bread pile
// against bread instead of sliding each item into an invented display slot.
export const BREAD_TRAY=Object.freeze({pivotY:3.2,floor:.49,halfWidth:2.65});
const trayCache=new Map();
function breadLaunch(p){
 const a=p.escapeAngle??0,c=Math.cos(a),s=Math.sin(a),omega=p.escapeAngularVelocity||0;
 const vx=p.vx-omega*p.y,vy=p.vy+omega*p.x;
 return{id:p.id,shape:p.shape,halfWidth:p.halfWidth,halfHeight:p.halfHeight,radius:radius(p),x:p.x*c-p.y*s,y:BREAD_TRAY.pivotY+p.x*s+p.y*c,z:(p.id%3-1)*.07,vx:vx*c-vy*s,vy:vx*s+vy*c,rotation:a+(p.rotation||0),spin:omega,settled:false};
}
function trayStep(bodies,dt){
 for(const p of bodies){p.vy-=9.8*dt;p.vx*=Math.exp(-.12*dt);p.x+=p.vx*dt;p.y+=p.vy*dt;p.rotation+=p.spin*dt;}
 for(let pass=0;pass<5;pass++){
  for(const p of bodies){const r=breadSupport(p,0,1),floor=BREAD_TRAY.floor+r,side=BREAD_TRAY.halfWidth-breadSupport(p,1,0);if(p.y<floor){p.y=floor;if(p.vy<0)p.vy=-p.vy*.25;if(Math.abs(p.vy)<.12)p.vy=0;p.vx*=Math.exp(-3.5*dt);p.spin=-p.vx/r;}
   if(p.x< -side){p.x=-side;if(p.vx<0)p.vx*=-.3;}else if(p.x>side){p.x=side;if(p.vx>0)p.vx*=-.3;}
  }
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dx,dy),contact=Math.sqrt(Math.max(0,(breadSupport(a,d?dx/d:1,d?dy/d:0)+breadSupport(b,d?dx/d:1,d?dy/d:0))**2-dz*dz));if(d>=contact)continue;
   const nx=d>1e-8?dx/d:(a.id<b.id?1:-1),ny=d>1e-8?dy/d:0,push=(contact-d)/2;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
   const speed=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(speed<0){const impulse=-speed*.6;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;}
  }
 }
 for(const p of bodies){p.settled=Math.hypot(p.vx,p.vy)<.14;if(p.settled)p.spin*=Math.exp(-8*dt);}
}
export function breadExitPoses(pieces,time){
 const exits=pieces.filter(p=>p.escapedAt!==null&&p.escapedAt!==undefined).toSorted((a,b)=>a.escapedAt-b.escapedAt||a.id-b.id);
 if(!exits.length)return pieces.map(()=>null);
 const key=exits.map(p=>[p.id,p.escapedAt,p.escapeAngle,p.escapeAngularVelocity||0,radius(p),p.halfWidth||0,p.halfHeight||0,p.x,p.y,p.vx,p.vy,p.rotation||0].join(',')).join(';');
 const end=exits[0].escapedAt+Math.floor((Math.min(time,exits.at(-1).escapedAt+12000)-exits[0].escapedAt)/10)*10;let state=trayCache.get(key);
 if(!state||state.time>end){state={time:exits[0].escapedAt,bodies:[],next:0};if(trayCache.size>=32)trayCache.delete(trayCache.keys().next().value);trayCache.set(key,state);}
 while(state.time<=end){
  while(state.next<exits.length&&exits[state.next].escapedAt<=state.time)state.bodies.push(breadLaunch(exits[state.next++]));
  if(state.time>=end)break;const next=Math.min(end,state.time+10,exits[state.next]?.escapedAt??Infinity);trayStep(state.bodies,(next-state.time)/1000);state.time=next;
 }
 return pieces.map(p=>{const body=state.bodies.find(b=>b.id===p.id);return body?{...body}:null;});
}
export function breadExitPose(piece,time){return breadExitPoses([piece],time)[0];}
