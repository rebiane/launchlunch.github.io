import {aiProfile} from './ai-profile.js';
import {moveSpeed,boulderImpulse} from './game-rules.js';
import {pickSpeed} from './race.js';
export const SURVIVAL_MODES=['fire','boulder','crush'];
export const SURVIVAL_SPEED=moveSpeed('boulder');
export const FIRE_MOVE_SPEED=moveSpeed('fire');
const STEP=40,cache=new Map(),clamp=v=>Math.max(0,Math.min(1,v));
export function hazardPose(h,time){
 const age=(time-h.start)/1000,active=age>=0&&age<=h.life,warning=time>=h.start-h.warn&&age<0;
 if(h.kind==='wall'){
  const speed=h.closeTime??.8,hold=h.holdTime??.35,close=age<0?0:age<speed?clamp(age/speed):age<speed+hold?1:1-clamp((age-speed-hold)/.45),edge=h.side<0?-8+(h.center-h.gap/2+8)*close:8-(8-h.center-h.gap/2)*close;
  const axis=h.axis||'x',center=h.side<0?(-9+edge)/2:(9+edge)/2,radius=h.side<0?(edge+9)/2:(9-edge)/2;return {x:axis==='x'?center:0,z:axis==='z'?center:0,rx:axis==='x'?radius:8,rz:axis==='z'?radius:8,active,warning,close};
 }
 let x=h.x+h.vx*Math.max(0,age);if(h.kind==='boulder'){const limit=6.2-h.rx,span=limit*2,wrapped=((x+limit)%(span*2)+span*2)%(span*2);x=wrapped<span?wrapped-limit:3*limit-wrapped;}
 const heat=h.kind==='tile'?clamp(age/.18):0,spread=h.kind==='tile'&&active?heat:1;
 return {x,z:h.z+h.vz*Math.max(0,age),active,warning,rx:h.rx*spread,rz:h.rz*spread,round:h.kind==='boulder',heat};
}
export function touches(h,p,margin=.33){return h.round?((h.x-p.x)/(h.rx+margin))**2+((h.z-p.z)/(h.rz+margin))**2<1:Math.abs(h.x-p.x)<h.rx+margin&&Math.abs(h.z-p.z)<h.rz+margin;}
// Keyboard/touch steering and AI both advance through this movement step.
export function survivalMoveStep({mode,time,index,positions,agents,speeds,target=null,respectReaction=true,stepMs=STEP}){
 const i=index,p=positions[i],a=agents[i];
   const q=target||a.target,dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz),step=time<a.stunnedUntil||(respectReaction&&(mode==='fire'||mode==='crush')&&time<a.reactAt)?0:Math.min(d,speeds[i]*stepMs/1000);if(d){p.x+=dx/d*step;p.z+=dz/d*step;}
   if(mode==='boulder'){p.x+=a.knockX*stepMs/1000;p.z+=a.knockZ*stepMs/1000;const decay=stepMs===STEP?.94:Math.pow(.94,stepMs/STEP);a.knockX*=decay;a.knockZ*=decay;}
 return p;
}
// The live server and local visual prediction share this exact input movement.
export function moveSurvivalControl({mode,time,index,positions,agents,speeds,input,stepMs=STEP}){
 const i=index;
const p=positions[i],x=Number.isFinite(input.x)?input.x:0,z=Number.isFinite(input.z)?input.z:0,length=Math.max(1,Math.hypot(x,z)),distance=speeds[i]*stepMs/1000;
   const target={x:p.x+x/length*distance,z:p.z+z/length*distance};agents[i].target=target;
   survivalMoveStep({mode,time,index:i,positions,agents,speeds,target,respectReaction:false,stepMs});
   // User steering stays on the same playable floor; boulder recoil can leave it.
   if(mode!=='boulder'){p.x=Math.max(mode==='crush'?-7.5:-5.8,Math.min(mode==='crush'?7.5:5.8,p.x));p.z=Math.max(mode==='crush'?-7.5:-5.8,Math.min(mode==='crush'?7.5:5.8,p.z));}

 return positions[i];
}
// Shared navigation policy: automatic simulation and direct-mode bots use the
// same hazard forecasts, safe-cell claims, reaction delays and movement step.
const navigationPoints=Array.from({length:81},(_,i)=>({x:(i%9-4)*1.3,z:(Math.floor(i/9)-4)*1.25}));
// Safe space for the newest visible wall wave, inset by body radius and
// steering tolerance. The renderer uses the same wall geometry and timing.
export function crushSafeArea(walls){
 const wave=Math.max(-1,...walls.map(h=>h.wave)),box={minX:-6.6,maxX:6.6,minZ:-6.6,maxZ:6.6};
 for(const h of walls)if(h.wave===wave){const axis=h.axis||'x',lo=axis==='x'?'minX':'minZ',hi=axis==='x'?'maxX':'maxZ';box[lo]=Math.max(box[lo],h.center-h.gap/2+.55);box[hi]=Math.min(box[hi],h.center+h.gap/2-.55);}
 return box;
}
export function survivalAgentStep({mode,time,index,positions,agents,falls,speeds,visible,rng,stepMs=STEP}){
 const i=index,count=positions.length,a=agents[i],p=positions[i],points=navigationPoints,profile=a.profile||{skill:.5,reaction:400,imprecision:.5};
   const fireWave=mode==='fire'?(visible[0]?.wave??-1):mode==='crush'?Math.max(-1,...visible.map(h=>h.wave)):null;
   if(time>=a.next||(mode==='fire'||mode==='crush')&&fireWave!==a.wave){
    let options;
    if(mode==='fire'){
     const safe=Array.from({length:25},(_,cell)=>({x:(cell%5-2)*2.4,z:(Math.floor(cell/5)-2)*2.4})).filter(q=>!visible.some(h=>Math.abs(h.x-q.x)<.1&&Math.abs(h.z-q.z)<.1));
     options=visible.length?safe.map(center=>{const q={x:center.x+(rng()-.5)*1.1,z:center.z+(rng()-.5)*1.1};const claimed=agents.reduce((n,other,j)=>n+(j!==i&&falls[j]===Infinity&&other.wave===fireWave&&other.target&&Math.abs(other.target.x-center.x)<1.2&&Math.abs(other.target.z-center.z)<1.2?1:0),0);return {q,score:Math.hypot(q.x-p.x,q.z-p.z)+claimed*5.5+rng()*(1+profile.imprecision*4)};}):[{q:{...p},score:0}];
    }else if(mode==='crush'&&visible.length){
     const box=crushSafeArea(visible);
     // Pick a personal refuge when the wave is announced and commit to it.
     // Bots perceive the safe rectangle, not the mathematically shortest
     // escape point that would require frame-perfect continuous replanning.
     const q={x:box.minX+(box.maxX-box.minX)*(.1+rng()*.8),z:box.minZ+(box.maxZ-box.minZ)*(.1+rng()*.8)};
     options=[{q,score:0}];
    }
    else if(mode==='crush')options=[{q:{...p},score:0}];
    else options=points.map(q=>{const distance=Math.hypot(q.x-p.x,q.z-p.z),arrival=time+distance/speeds[i]*1000;let risk=0;
     for(const h of visible)for(const future of [time+450,arrival,Math.max(arrival,h.start+180)]){const hp=hazardPose(h,future);if(hp.active){const dx=Math.max(0,Math.abs(hp.x-q.x)-hp.rx),dz=Math.max(0,Math.abs(hp.z-q.z)-hp.rz);risk+=(mode==='fire'?16:10)/(.25+Math.hypot(dx,dz));}}
     for(let j=0;j<count;j++)if(j!==i&&falls[j]===Infinity)risk+=.7/(.3+Math.hypot(q.x-positions[j].x,q.z-positions[j].z));
     const edgeCost=mode==='boulder'?Math.abs(q.x)*.12+Math.max(0,q.z)*.2:0;
     return {q,score:risk+distance*.3+edgeCost+rng()*(.2+profile.imprecision*2.5)};
    });
    const changedWave=fireWave!==a.wave;options.sort((a,b)=>a.score-b.score);a.target=options[0].q;a.next=(mode==='fire'||mode==='crush')?Infinity:time+100+profile.reaction*.65+rng()*180;a.wave=fireWave;
    if(mode==='fire'){const reaction=fireWave<2?80+rng()*100:profile.reaction+rng()*120,warn=visible[0]?.warn??1600;a.reactAt=time+Math.min(reaction,Math.max(80,warn-250))+(fireWave>=2&&rng()<.06+profile.imprecision*.18?180+rng()*260:0);}
    if(mode==='crush'&&changedWave)a.reactAt=time+(fireWave<2?100+rng()*180:180+rng()*520);
   }
   survivalMoveStep({mode,time,index,positions,agents,speeds,stepMs});
 return p;
}
// Collision resolution is shared by recorded spectators and live players.
// Mutates the supplied per-player state; callers own input and rendering only.
export function survivalCollisionStep({mode,time,stepMs=STEP,hazards,active,positions,previous,agents,falls,lives,damage,causes,alive=falls.filter(f=>f===Infinity).length,finish=0}){
 const count=positions.length;
 if(!active)active=hazards.map(h=>({h,p:hazardPose(h,time)})).filter(o=>o.p.active);
  const hits=[];
  for(let i=0;i<count;i++)if(falls[i]===Infinity){const a=agents[i],p=positions[i];
   if(mode==='boulder'&&(Math.abs(p.x)>6.65||p.z>8||p.z< -8)){hits.push({i,id:a.lastHazard,depth:Math.max(Math.abs(p.x)-6.65,p.z-8,-8-p.z),edge:true});continue;}
   if(time<a.invulnerable)continue;
   for(const {h,p:hp} of active)if(touches(hp,p)){
    let contactTime=time;if(mode==='fire'){const before=previous[i];let lo=Math.max(0,(a.invulnerable-(time-stepMs))/stepMs),hi=1;for(let n=0;n<24;n++){const u=(lo+hi)/2,at=time-stepMs+u*stepMs,hp=hazardPose(h,at),q={x:before.x+(p.x-before.x)*u,z:before.z+(p.z-before.z)*u};if(hp.active&&touches(hp,q))hi=u;else lo=u;}contactTime=time-stepMs+hi*stepMs;}
    damage[i].push({time:contactTime,hazard:h.id});a.lastHazard=h.id;a.invulnerable=contactTime+(mode==='boulder'?1200:1900);
    if(mode==='boulder'){
     const impulse=boulderImpulse(h,p,hp);a.knockX=impulse.x;a.knockZ=impulse.z;a.stunnedUntil=time+400;
    }else{lives[i]--;if(lives[i]<=0)hits.push({i,id:h.id,...(mode==='fire'?{time:contactTime}:{}),depth:Math.min(hp.rx+.33-Math.abs(hp.x-p.x),hp.rz+.33-Math.abs(hp.z-p.z))});}
    break;
   }
  }
  // Resolve wall contacts within the frame, so the match stops at the actual
  // penultimate contact, before the last survivor reaches a wall.
  if(mode==='crush')for(const hit of hits){const h=hazards.find(h=>h.id===hit.id),a=previous[hit.i],b=positions[hit.i];let lo=0,hi=1;for(let n=0;n<24;n++){const u=(lo+hi)/2,p={x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u};if(touches(hazardPose(h,time-stepMs+u*stepMs),p))hi=u;else lo=u;}hit.time=time-stepMs+hi*stepMs;damage[hit.i].at(-1).time=hit.time;}
  hits.sort((a,b)=>(a.time??time)-(b.time??time)||b.depth-a.depth);
  for(let h=0;h<hits.length;h++){const hit=hits[h];if(alive===1){const simultaneous=Math.abs((hit.time??time)-finish)<.00001;if(!simultaneous)break;}falls[hit.i]=hit.time??time;causes[hit.i]=hit.id;alive--;finish=falls[hit.i];}
  if(alive===1&&mode==='fire')for(let i=0;i<count;i++)if(falls[i]===Infinity){damage[i]=damage[i].filter(d=>d.time<=finish);lives[i]=1-damage[i].length;}
  if(alive===1&&mode==='crush'){const winner=falls.indexOf(Infinity);lives[winner]=1;damage[winner]=damage[winner].filter(d=>d.time<=finish);}
 return {alive,finish,hits};
}
export const SURVIVAL_STEP=STEP;
function survivalRandom(state){let t=state.rng=(state.rng+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
// JSON-safe state: null fall time means alive, null next-decision means infinity.
export function createSurvivalGame(seed,count,mode,picks=[]){
 if(!SURVIVAL_MODES.includes(mode)||count<2||count>12)throw new Error('Unsupported survival game');
 const randomState={rng:seed|0},rng=()=>survivalRandom(randomState),hazards=[],falls=Array(count).fill(Infinity),causes=Array(count).fill(null),speeds=Array.from({length:count},(_,i)=>(mode==='fire'?FIRE_MOVE_SPEED:SURVIVAL_SPEED)*pickSpeed(picks[i]));
 const columns=Math.min(count,4),rows=Math.ceil(count/columns),positions=Array.from({length:count},(_,i)=>({x:(i%columns-(columns-1)/2)*1.8,z:(Math.floor(i/columns)-(rows-1)/2)*1.6}));
 if(mode==='fire'){
  let time=4000;
  for(let wave=0;time<68000;wave++){
   const pattern=Math.floor(rng()*4),offset=Math.floor(rng()*5),axis=rng()<.5,flip=rng()<.5;
   const cells=Array.from({length:25},(_,cell)=>{let x=cell%5,z=Math.floor(cell/5);if(axis)[x,z]=[z,x];if(flip)x=4-x;
    const rank=pattern===0?(x+offset)%5:pattern===1?(x+z+offset)%2:pattern===2?Math.min(Math.abs(x-offset),Math.abs(z-(4-offset))):Math.min(Math.hypot(x,z),Math.hypot(4-x,4-z));
    return {cell,rank,jitter:rng()};}).sort((a,b)=>a.rank-b.rank||a.jitter-b.jitter);
   const warn=wave<2?1800+Math.floor(rng()*250):650+Math.floor(rng()*450),life=.65+rng()*.4;
   if(wave)time+=warn+180+Math.floor(rng()*480);
   // Always 13 safe cells: difficulty comes from changing shapes and timing, not less space.
   for(const {cell:c} of cells.slice(0,12))hazards.push({id:wave*25+c,kind:'tile',wave,pattern,start:time,warn,life,x:(c%5-2)*2.4,z:(Math.floor(c/5)-2)*2.4,vx:0,vz:0,rx:1.17,rz:1.17});
   time+=life*1000;
  }
 }else if(mode==='boulder'){
  for(let k=0,time=6000;time<120000;k++){
   const difficulty=Math.min(1,(time-6000)/45000),burst=k%5,base=3.7+difficulty*2.6,speed=Math.min(9,base*(burst===0?.78:burst===3?1.3:.92+rng()*.24)),radius=.95+rng()*.2;
   hazards.push({id:k,kind:'boulder',start:time,warn:1300,life:25/speed,x:(rng()-.5)*10,z:-12,vx:(rng()-.5)*(2.3+difficulty*2),vz:speed,rx:radius,rz:radius});time+=(2200-difficulty*1550)*(burst===2?.78:burst===4?1.24:1);
  }
 }else{
  let previous={minX:-2.7,maxX:2.7,minZ:-1.6,maxZ:1.6},lastEnd=0;
  for(let wave=0,time=5600;time<55000;wave++){
   const gap=Math.max(3.8,7-wave*.55),axes=wave<2?[wave?'z':'x']:['x','z'],centerX=wave? (rng()-.5)*6.2:0,centerZ=wave?(rng()-.5)*6.2:0,closeTime=Math.max(.22,.82-wave*.07),holdTime=.28;
   const safe={minX:-6.6,maxX:6.6,minZ:-6.6,maxZ:6.6};
   for(const axis of axes){const center=axis==='x'?centerX:centerZ;safe[axis==='x'?'minX':'minZ']=center-gap/2+.55;safe[axis==='x'?'maxX':'maxZ']=center+gap/2-.55;}
   const travel=Math.max(...[previous.minX,previous.maxX].flatMap(x=>[previous.minZ,previous.maxZ].map(z=>Math.hypot(Math.max(safe.minX-x,0,x-safe.maxX),Math.max(safe.minZ-z,0,z-safe.maxZ)))));
   const warn=Math.max(850,Math.ceil(travel/SURVIVAL_SPEED*1000)+Math.max(160,560-wave*55));
   time=Math.max(time,lastEnd+warn+160);
   for(const axis of axes)for(const side of [-1,1])hazards.push({id:wave*4+(axis==='z'?2:0)+(side>0?1:0),kind:'wall',wave,axis,side,center:axis==='x'?centerX:centerZ,gap,closeTime,holdTime,start:time,warn,life:closeTime+holdTime+.45,x:axis==='x'?side*8:0,z:axis==='z'?side*8:0,vx:0,vz:0,rx:axis==='x'?.5:8,rz:axis==='z'?.5:8});
   previous=safe;lastEnd=time+(closeTime+holdTime+.45)*1000;time=lastEnd+1200;
  }
 }
 const lives=Array(count).fill(mode==='boulder'?2:1),damage=Array.from({length:count},()=>[]),agents=positions.map((_,i)=>({profile:aiProfile(seed,i,count),next:0,target:null,hesitation:rng()*240,invulnerable:0,knockX:0,knockZ:0,stunnedUntil:0,lastHazard:null}));

 return {seed,mode,count,time:0,rng:randomState.rng,hazards,positions,falls:falls.map(()=>null),causes,speeds,lives,damage,agents,alive:count,finish:0,finished:false,winner:null,draw:false};
}
export function stepSurvivalGame(state,inputs={}){
 if(state.finished)return state;
 const {mode,count,hazards,positions,causes,speeds,lives,damage,agents}=state,falls=state.falls.map(f=>f===null?Infinity:f),rng=()=>survivalRandom(state);
 for(const a of agents)if(a.next===null)a.next=Infinity;
 const time=state.time+=STEP,previous=positions.map(p=>({...p}));
 const visible=hazards.filter(h=>time>=h.start-h.warn&&time<=h.start+h.life*1000),active=visible.map(h=>({h,p:hazardPose(h,time)})).filter(o=>o.p.active);
 for(let i=0;i<count;i++){
  if(Number.isFinite(falls[i]))continue;
  const input=inputs[i];
  if(input)moveSurvivalControl({mode,time,index:i,positions,agents,speeds,input});else survivalAgentStep({mode,time,index:i,positions,agents,falls,speeds,visible,rng});
 }
 const resolution=survivalCollisionStep({mode,time,hazards,active,positions,previous,agents,falls,lives,damage,causes,alive:state.alive,finish:state.finish});
 state.alive=resolution.alive;state.finish=resolution.finish;state.falls=falls.map(f=>Number.isFinite(f)?f:null);for(const a of agents)if(a.next===Infinity)a.next=null;
 const timeout=time>=(mode==='boulder'?120000:mode==='fire'?70000:60000);state.finished=state.alive<=1||timeout;
 if(state.finished){if(timeout&&state.alive>1)state.finish=time;state.winner=state.alive===1?state.falls.indexOf(null):null;state.draw=state.winner===null;}
 return state;
}
export function survivalPlan(seed,count,mode,picks=[]){
 const key=[mode,seed,count,picks.join(',')].join(':');if(cache.has(key))return cache.get(key);
 const state=createSurvivalGame(seed,count,mode,picks),frames=[state.positions.flatMap(p=>[p.x,p.z])],lifeFrames=[state.lives.slice()];
 while(!state.finished){stepSurvivalGame(state);frames.push(state.positions.flatMap(p=>[p.x,p.z]));lifeFrames.push(state.lives.slice());}
 const {causes,damage,hazards,speeds,finish,winner}=state,falls=state.falls.map(f=>f===null?Infinity:f);
 const plan={mode,draw:state.draw,falls,causes,damage,frames,lifeFrames,hazards,speeds,finish,winner,duration:finish+1600};if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,plan);return plan;
}

export function survivalPose(plan,index,elapsed){
 const t=Math.max(0,Math.min(elapsed,plan.finish,plan.falls[index])),f=Math.min(plan.frames.length-1,Math.floor(t/STEP)),n=Math.min(plan.frames.length-1,f+1),u=t/STEP-f,a=plan.frames[f],b=plan.frames[n],j=index*2,dx=b[j]-a[j],dz=b[j+1]-a[j+1];
 const hit=plan.damage[index].findLast(e=>e.time<=elapsed),hitAge=hit?(elapsed-hit.time)/1000:Infinity;
 return {x:a[j]+dx*u,z:a[j+1]+dz*u,heading:Math.atan2(dx,dz),moving:Math.hypot(dx,dz)>.001,dead:elapsed>=plan.falls[index],deathAge:Math.max(0,(elapsed-plan.falls[index])/1000),lives:plan.lifeFrames[f][index],hitAge};
}

export function wallWarning(h){const axis=h.axis||'x',p=hazardPose(h,h.start+((h.closeTime??.8)+.1)*1000),value=p[axis],radius=p[axis==='x'?'rx':'rz'],edge=h.side<0?value+radius+.33:value-radius-.33,center=h.side<0?(-8+edge)/2:(8+edge)/2,width=h.side<0?8+edge:8-edge;return {axis,x:axis==='x'?center:0,z:axis==='z'?center:0,width,rx:axis==='x'?width/2:8,rz:axis==='z'?width/2:8};}
export function boulderPath(h){return Array.from({length:Math.ceil(h.life*20)+1},(_,i)=>hazardPose(h,h.start+Math.min(h.life,i/20)*1000));}
