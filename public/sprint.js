import {aiProfile} from './ai-profile.js';
import {canJump,sprintSpeed,CART_DISTANCE,CART_LANE_SPACING,CART_STEER_SPEED,CART_SPEEDS,stepCartMotion,jumpHeight,jumpCooldown,moveSpeed} from './game-rules.js';
import {pickSpeed} from './race.js';
export const SPRINT_MODES=['climb','tricycle'];
const STEP=40,cache=new Map();
export function beePose(bee,time,count){const u=(time-bee.start)/bee.life,targetX=(bee.lane-(count-1)/2)*1.65;return {x:targetX+Math.sin(u*Math.PI*2)*bee.side*1.8,y:bee.y+Math.sin(u*Math.PI*2)*.35,z:.6+bee.depth*5*(2*u-1)**2,active:u>=0&&u<=1};}
export function sprintScenery(rng,count,mode){const bees=[],rocks=[];
 if(mode==='climb'){let bag=[];for(let start=2200;start<50000;start+=1900){if(!bag.length){bag=Array.from({length:count},(_,i)=>i);for(let k=bag.length-1;k>0;k--){const j=Math.floor(rng()*(k+1));[bag[k],bag[j]]=[bag[j],bag[k]];}}bees.push({start,life:3000,side:rng()<.5?-1:1,depth:rng()<.5?-1:1,lane:bag.pop(),y:0,launched:false});}}
 else{let distance=18;for(let k=0;distance<CART_DISTANCE-20;k++){
  const slots=[-1.1,0,1.1],open=Math.floor(rng()*3),quick=distance>90&&k%4===0,side=rng()<.5?-1:1;
  const rows=quick?[{distance,offsets:[0,side*1.1]},{distance:distance+8.5,offsets:[0,-side*1.1]}]:[{distance,offsets:distance>75&&k%3===0?slots.filter((_,j)=>j!==open):[slots[open]]}];
  for(let lane=0;lane<count;lane++)for(let row=0;row<rows.length;row++)for(let part=0;part<rows[row].offsets.length;part++)rocks.push({id:lane*100+k*4+row*2+part,lane,distance:rows[row].distance,offset:rows[row].offsets[part],radius:.4,gate:k*2+row,quick});
  distance+=(quick?8.5+42:29)+rng()*6;
 }}
 return {bees,rocks};}
export const SPRINT_STEP=STEP;
function nextRandom(state){let t=state.rng=(state.rng+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
export function createSprintGame(seed,count,mode,picks=[]){
 if(!SPRINT_MODES.includes(mode)||count<2||count>12)throw new Error('Unsupported sprint game');
 const state={seed,count,mode,time:0,rng:seed|0},rng=()=>nextRandom(state),distance=mode==='climb'?28:CART_DISTANCE;
 const {bees,rocks}=sprintScenery(rng,count,mode),agents=Array.from({length:count},(_,i)=>({profile:aiProfile(seed,i,count),startAt:0,restUntil:0,nextSlip:11000+rng()*7000,boost:pickSpeed(picks[i]),invulnerable:0,checked:[],jumpAt:-10000,velocity:CART_SPEEDS[0],speedLevel:1,gearElapsed:0,throttle:false,steerX:0,spinUntil:0,spinStartedAt:null,lastBoostSeq:-1,actionDown:false,reactionAt:0,nextBoostAt:0,targetX:0,pendingTarget:null,turnAt:0,observedId:null,reaction:200+rng()*150}));
 if(mode==='tricycle')for(const a of agents){a.reaction=180+rng()*380;a.scanMs=240+rng()*450;a.lookAhead=13+rng()*8;a.caution=rng();a.driveAt=200+rng()*400;a.throttleIntent=true;}
 return Object.assign(state,{distance,checkpoints:[{time:0,distance}],progress:Array(count).fill(0),stamina:Array(count).fill(1),finishTimes:Array(count).fill(null),resting:Array(count).fill(false),events:Array.from({length:count},()=>[]),bees,rocks,agents,positions:Array.from({length:count},(_,i)=>({x:(i-(count-1)/2)*(mode==='tricycle'?CART_LANE_SPACING:1.65),z:0,y:0})),jumpHeights:Array(count).fill(0),finished:false,settled:false,finish:0,winner:null,draw:false});
}
// One update path for the recorded race and live input. The recording wrapper
// may keep recording other finishers after the winning contact has occurred.
export function stepSprintGame(state,inputs={},continueAfterFinish=false){
 if(state.settled||state.finished&&!continueAfterFinish)return state;
 const {count,mode,distance,progress,stamina,finishTimes,events,bees,rocks,agents,positions}=state,rng=()=>nextRandom(state),time=state.time+=STEP,resting=[];
 for(const b of bees)if(!b.launched&&time>=b.start){b.launched=true;b.y=Math.min(28.7,progress[b.lane]+1.75*agents[b.lane].boost*b.life/2000+.9);}
 for(let i=0;i<count;i++){
  const a=agents[i],input=inputs[i],manual=!!input;if(finishTimes[i]!==null){resting[i]=false;continue;}
  if(mode==='tricycle'){
   let control=input||{};
   if(!manual){
    if(a.pendingTarget!==null&&time>=a.turnAt){a.targetX=a.pendingTarget;a.pendingTarget=null;}
    if(a.followup&&progress[i]>=a.followup.after){a.targetX=a.followup.x;a.observedId=a.followup.id;a.pendingTarget=null;a.followup=null;}
    if(time>=a.reactionAt){const ahead=rocks.find(r=>r.lane===i&&r.distance>progress[i]-.8&&!a.checked.includes(r.id)&&r.distance-progress[i]<a.lookAhead+22);
     if(ahead&&ahead.id!==a.observedId){const gate=rocks.filter(r=>r.lane===i&&r.distance===ahead.distance),choices=[-1.3,0,1.3].filter(x=>gate.every(r=>Math.abs(x-r.offset)>r.radius+.38));a.pendingTarget=choices.toSorted((x,y)=>Math.abs(x-a.steerX)-Math.abs(y-a.steerX))[0]??0;a.turnAt=time+(ahead.quick?Math.min(a.reaction,350):a.reaction);a.observedId=ahead.id;
      // Read both visibly adjacent gates before entering: the second turn can
      // be planned, but still happens only after physically clearing the first.
      if(ahead.quick&&ahead.gate%2===0){const next=rocks.filter(r=>r.lane===i&&r.gate===ahead.gate+1&&r.distance-progress[i]<a.lookAhead+22),safe=[-1.3,0,1.3].filter(x=>next.length&&next.every(r=>Math.abs(x-r.offset)>r.radius+.38));if(safe.length)a.followup={after:ahead.distance+.12,x:safe[0],id:next[0].id};}
     }
     a.reactionAt=time+(ahead?.quick?Math.min(a.scanMs,180):a.scanMs)*(.85+rng()*.3);
     const desired=ahead&&ahead.distance-progress[i]<(ahead.quick?35:(a.velocity||3)*1.45)?(ahead.quick?(a.caution<.15?6:a.caution<.5?5:4):(a.caution<.25?6:a.caution<.7?5:4)):6;a.throttleIntent=a.speedLevel<desired||a.speedLevel===desired&&a.gearElapsed<220;
    }
    control={x:Math.max(-1,Math.min(1,(a.targetX-a.steerX)/(CART_STEER_SPEED*STEP/1000))),z:time>=a.driveAt&&a.throttleIntent?-1:0};
   }
   const body={progress:progress[i],steerX:a.steerX,velocity:a.velocity,speedLevel:a.speedLevel,gearElapsed:a.gearElapsed,throttle:a.throttle,spinUntil:a.spinUntil,spinStartedAt:a.spinStartedAt,lastBoostSeq:a.lastBoostSeq,actionDown:a.actionDown};
   const motion=stepCartMotion(body,control,time,STEP,a.boost),before=motion.before;
   // Swept circle contacts prevent high gear from tunnelling through a buoy.
   let contact=null;
   if(motion.advance>0)for(const rock of rocks)if(rock.lane===i&&!a.checked.includes(rock.id)){
    const dx=motion.beforeSteer-rock.offset,dz=before-rock.distance,vx=body.steerX-motion.beforeSteer,vz=body.progress-before,radius=rock.radius+.35,A=vx*vx+vz*vz,B=2*(dx*vx+dz*vz),C=dx*dx+dz*dz-radius*radius,disc=B*B-4*A*C;
    const u=C<=0?0:disc>=0?(-B-Math.sqrt(disc))/(2*A):Infinity;if(u>=0&&u<=1&&(!contact||u<contact.u))contact={u,rock};
   }
   if(contact){const at=motion.activeStart+contact.u*motion.activeMs;body.progress=before+(body.progress-before)*contact.u;body.steerX=motion.beforeSteer+(body.steerX-motion.beforeSteer)*contact.u;body.speedLevel=1;body.gearElapsed=0;body.velocity=0;body.spinStartedAt=at;body.spinUntil=at+1000;a.checked.push(contact.rock.id);events[i].push({type:'spin',time:at,recovery:1000,obstacle:contact.rock.id});}
   Object.assign(a,body);progress[i]=body.progress;positions[i].x=(i-(count-1)/2)*CART_LANE_SPACING+body.steerX;positions[i].z=-body.progress;positions[i].y=0;resting[i]=time<a.spinUntil;stamina[i]=(a.speedLevel-1)/5;
   if(progress[i]>=distance)finishTimes[i]=motion.crossingTime??motion.activeStart+motion.activeMs*(distance-before)/(motion.advance||1);
   continue;
  }

  if(mode==='climb'&&time>=a.restUntil&&(stamina[i]<.16||time>=a.nextSlip)){a.restUntil=time+900+rng()*250;a.nextSlip=time+11000+rng()*6500;}
  const rest=time<Math.max(a.restUntil,manual?0:a.startAt);resting[i]=rest;stamina[i]=Math.max(0,Math.min(1,stamina[i]+(rest?.6:mode==='climb'?-.05:-.02)*STEP/1000));
  let avoidBee=false;if(mode==='climb'&&!manual&&!rest){const look=220+(a.profile?.skill??.5)*420;avoidBee=bees.some(b=>{if(!b.launched||b.lane!==i)return false;const q=beePose(b,time+look,count);return q.active&&Math.abs(q.z-.44)<.65&&Math.abs(q.y-(progress[i]+.9+sprintSpeed(mode)*look/1000))<.8;});}const drive=mode==='tricycle'?1:manual?Math.max(-1,Math.min(1,-(Number.isFinite(input.z)?input.z:0))):avoidBee?0:1,speed=sprintSpeed(mode)*a.boost,activeStart=Math.max(time-STEP,a.restUntil,manual?0:a.startAt),activeMs=Math.max(0,time-activeStart),before=progress[i];
  progress[i]=Math.max(0,Math.min(distance,before+speed*drive*activeMs/1000));
  if(manual&&!rest){const side=mode==='tricycle'?0:Math.max(-1,Math.min(1,Number.isFinite(input.x)?input.x:0));positions[i].x+=side*moveSpeed(mode)*activeMs/1000;const pole=(i-(count-1)/2)*1.65;positions[i].x=mode==='tricycle'?pole:Math.max(pole-.3,Math.min(pole+.3,positions[i].x));if(canJump(mode)&&input.jump&&time-a.jumpAt>jumpCooldown(mode)){a.jumpAt=time;events[i].push({type:'jump',time,manual:true});}}
  if(mode==='climb'){
   const hit=bees.find(b=>{const p=beePose(b,time,count);return p.active&&Math.abs(p.z-.44)<.55&&Math.abs(p.x-positions[i].x)<.52&&Math.abs(p.y-(progress[i]+.9+jumpHeight(mode,time-a.jumpAt)*.6))<.64;});
   if(hit&&time>=a.invulnerable){const drop=rng()<.42?.6+rng()*.65:0;events[i].push({type:'bee',time,drop});a.restUntil=time+1000;a.invulnerable=time+2000;}
   const last=events[i].findLast(e=>e.type==='bee');if(last&&time>last.time&&time<=last.time+400)progress[i]=Math.max(0,progress[i]-last.drop*STEP/400);
  }
  if(progress[i]>=distance)finishTimes[i]=activeStart+(distance-before)/(speed*drive||1)*1000;
  const hit=events[i].findLast(e=>e.type!=='jump'&&e.time<=time),jump=events[i].findLast(e=>e.type==='jump'&&e.time<=time);state.jumpHeights[i]=hit&&time-hit.time<(hit.recovery??1000)?0:jumpHeight(mode,time-(jump?.time??-10000));positions[i].z=mode==='tricycle'?-progress[i]:0;positions[i].y=mode==='climb'?progress[i]+state.jumpHeights[i]*.6:state.jumpHeights[i];
 }
 state.resting=resting;state.settled=finishTimes.every(t=>t!==null)||time>=(mode==='tricycle'?60000:75000);
 const finish=Math.min(...finishTimes.map(t=>t===null?Infinity:t));if(Number.isFinite(finish)){state.finished=true;state.finish=finish;const leaders=finishTimes.map((t,i)=>t!==null&&Math.abs(t-finish)<.00001?i:-1).filter(i=>i>=0);state.winner=leaders.length===1?leaders[0]:null;state.draw=leaders.length!==1;}else if(state.settled){state.finished=true;state.finish=time;state.winner=null;state.draw=true;}
 return state;
}
export function sprintPlan(seed,count,mode,picks=[]){
 const key=[mode,seed,count,picks.join(',')].join(':');if(cache.has(key))return cache.get(key);
 const state=createSprintGame(seed,count,mode,picks),frames=[state.progress.slice()],energyFrames=[state.stamina.slice()],restFrames=[state.resting.slice()],steeringFrames=[state.agents.map(a=>a.steerX)],gearFrames=[state.agents.map(a=>a.speedLevel)],velocityFrames=[state.agents.map(a=>a.velocity)];
 while(!state.settled){stepSprintGame(state,{},true);frames.push(state.progress.slice());energyFrames.push(state.stamina.slice());restFrames.push(state.resting.slice());steeringFrames.push(state.agents.map(a=>a.steerX));gearFrames.push(state.agents.map(a=>a.speedLevel));velocityFrames.push(state.agents.map(a=>a.velocity));}
 const {distance,checkpoints,events,bees,rocks,finish,winner}=state,finishTimes=state.finishTimes.map(t=>t===null?Infinity:t);
 const p={mode,...(state.draw?{draw:true}:{}),kind:'race',distance,checkpoints,starts:state.agents.map(a=>a.startAt),frames,energyFrames,restFrames,steeringFrames,gearFrames,velocityFrames,finishTimes,events,bees,rocks,finish,winner,falls:finishTimes.map((_,i)=>i===winner?Infinity:finish),duration:finish+2400};if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,p);return p;
}

export function sprintPose(plan,index,elapsed){
 const t=Math.max(0,elapsed),f=Math.min(plan.frames.length-1,Math.floor(t/STEP)),n=Math.min(plan.frames.length-1,f+1),u=Math.max(0,Math.min(1,(t-f*STEP)/(Math.min((f+1)*STEP,plan.finishTimes[index])-f*STEP||1))),events=plan.events[index],hit=events.findLast(e=>e.type!=='jump'&&e.time<=t),jump=events.findLast(e=>e.type==='jump'&&e.time<=t),hitAge=hit?t-hit.time:Infinity,jumpAge=jump?t-jump.time:Infinity;
 return {steerX:plan.steeringFrames[f][index]+(plan.steeringFrames[n][index]-plan.steeringFrames[f][index])*u,speedLevel:plan.gearFrames[f][index],velocity:plan.velocityFrames[f][index],spinStartedAt:hit?.type==='spin'?hit.time:null,spinUntil:hit?.type==='spin'?hit.time+hit.recovery:0,distance:t>=plan.finishTimes[index]?plan.distance:plan.frames[f][index]+(plan.frames[n][index]-plan.frames[f][index])*u,energy:plan.energyFrames[f][index],resting:plan.restFrames[f][index],finished:t>=plan.finishTimes[index],hitAge,hitType:hit?.type,recovery:hit?.recovery??1000,jump:hitAge<(hit?.recovery??1000)?0:jumpAge<760?Math.sin(jumpAge/760*Math.PI)*1.35:0};
}
