import {aiProfile} from './ai-profile.js';
import {moveSpeed,cookieValue,goldenCookieCount} from './game-rules.js';
import {random,pickSpeed} from './race.js';
const STEP=40,cache=new Map();
export function cookieSupply(count){return {cap:Math.max(3,Math.ceil(count*.9)),batch:Math.max(2,Math.ceil(count*.5)),interval:Math.max(1400,2200-count*50)};}
export function cookieAgentStep({i,time:t,stepMs:STEP,speed,positions,cookies,targets,stalled,reactions,wander,rng,wanderRandom,noticeDelay=400,profile={skill:.5,imprecision:.5,reaction:400}}){const count=positions.length;
   const p=positions[i];if(t>=reactions[i]&&(!cookies[targets[i]]||cookies[targets[i]].taken<=t||stalled[i]>=400)){
    const options=cookies.map((c,id)=>{const noise=rng()*(.2+profile.imprecision*2.2);if(c.warning+noticeDelay>t||c.taken<=t)return null;return {c,id,score:(id===targets[i]&&stalled[i]>=400?8:0)+Math.hypot(c.x-p.x,c.z-p.z)/(c.value>=3?1.65:1)+targets.reduce((n,id2,j)=>n+(j!==i&&id2===id?2.5:0),0)+positions.reduce((n,q,j)=>n+(j!==i?1.2/(1+Math.hypot(c.x-q.x,c.z-q.z)):0),0)+noise};}).filter(Boolean);options.sort((a,b)=>a.score-b.score);targets[i]=options[0]?.id??-1;if(targets[i]>=0)stalled[i]=0;reactions[i]=t+80+profile.reaction*.7+rng()*180;
   }
   const candidate=cookies[targets[i]],c=candidate&&candidate.taken>t?candidate:null;
   if(!c&&(!wander[i]||Math.hypot(wander[i].x-p.x,wander[i].z-p.z)<.5||stalled[i]>=400)){let destination;for(let attempt=0;attempt<30;attempt++){destination={x:(wanderRandom()-.5)*10.6,z:(wanderRandom()-.5)*7.2};if(Math.hypot(destination.x-p.x,destination.z-p.z)>2.5&&positions.every((other,j)=>j===i||Math.hypot(destination.x-other.x,destination.z-other.z)>1.1))break;}wander[i]=destination;stalled[i]=0;}
   const target=c||wander[i];
   const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),step=Math.min(d,speed*STEP/1000),angle=Math.atan2(dz,dx),before={...p},options=[];
   for(const turn of [0,.45,-.45,.9,-.9,1.35,-1.35,1.8,-1.8]){
    const q={x:p.x+Math.cos(angle+turn)*step,z:p.z+Math.sin(angle+turn)*step};if(Math.abs(q.x)>5.85||Math.abs(q.z)>4.1)continue;
    let safe=true,proximity=0;for(let j=0;j<count;j++){if(j===i)continue;const other=positions[j],vx=q.x-p.x,vz=q.z-p.z,u=Math.max(0,Math.min(1,((other.x-p.x)*vx+(other.z-p.z)*vz)/(vx*vx+vz*vz||1))),gap=Math.hypot(p.x+vx*u-other.x,p.z+vz*u-other.z);if(gap<.86){safe=false;break;}proximity+=Math.max(0,1.4-Math.hypot(q.x-other.x,q.z-other.z))**2;}
    if(safe)options.push({q,cost:Math.hypot(target.x-q.x,target.z-q.z)+proximity*.55+Math.abs(turn)*.008});
   }
   options.sort((a,b)=>a.cost-b.cost);if(options.length){p.x=options[0].q.x;p.z=options[0].q.z;}
   stalled[i]=Math.hypot(p.x-before.x,p.z-before.z)<.001?stalled[i]+STEP:0;
 return {c,before};
}
function nextCookieRandom(state,key){let t=state[key]=(state[key]+0x6D2B79F5)>>>0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
export const COOKIE_SPAWN_GAP=1.9;
export const COOKIE_FIRST_WARNING=800;
function spawnCookieWave(s,time,n,gold=false,notice=700){
 const rng=()=>nextCookieRandom(s,'rngState');
 for(let k=0;k<n;k++){
  const active=s.cookies.filter(c=>c.taken===Infinity);let point=null,best=-Infinity;
  const consider=candidate=>{
   const gap=Math.min(5,...active.map(c=>Math.hypot(c.x-candidate.x,c.z-candidate.z)));
   const playerGap=Math.min(...s.positions.map(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)));
   if(gap<COOKIE_SPAWN_GAP||playerGap<.85)return;
   const score=gap+Math.min(playerGap,1.5)*.15;
   if(score>best){best=score;point=candidate;}
  };
  // Choose open space rather than accepting the first random nearby point.
  // Pending landing markers count as occupied, including the rest of this wave.
  for(let attempt=0;attempt<64;attempt++)consider({x:(rng()-.5)*10.6,z:(rng()-.5)*7.6});
  if(!point)for(let x=-5.3;x<=5.3;x+=.5)for(let z=-3.8;z<=3.8;z+=.5)consider({x,z});
  if(!point)break; // Never fall back to an overlapping spawn in a crowded arena.
  s.cookies.push({...point,value:cookieValue(rng,gold),warning:time,start:time+notice,taken:Infinity,owner:null});
 }
}
export function createCookieGame(seed,count,picks=[]){
 const s={seed,count,picks,rngState:seed>>>0,wanderState:(seed^0x735a12c9)>>>0,time:0,wander:Array(count).fill(null),positions:Array.from({length:count},(_,i)=>({x:Math.sin(i/count*Math.PI*2)*4.5,z:Math.cos(i/count*Math.PI*2)*3})),scores:Array(count).fill(0),cookies:[],events:[],targets:Array(count).fill(-1),stalled:Array(count).fill(0),reactions:[],finish:0,winner:null,finished:false,goldenWave:0,supply:cookieSupply(count)};
 s.profiles=Array.from({length:count},(_,i)=>aiProfile(seed,i,count));s.noticeDelays=s.profiles.map(p=>120+p.reaction*.85);s.reactions=Array(count).fill(0);s.nextSpawn=COOKIE_FIRST_WARNING;s.firstWave=true;return s;
}
export function moveCookiePlayer(positions,i,control,milliseconds,speed=moveSpeed('cookie')){
 const p=positions[i],length=Math.max(1,Math.hypot(control.x||0,control.z||0)),dx=(control.x||0)/length*speed*milliseconds/1000,dz=(control.z||0)/length*speed*milliseconds/1000;
 const q={x:Math.max(-5.85,Math.min(5.85,p.x+dx)),z:Math.max(-4.1,Math.min(4.1,p.z+dz))};
 // The same body radius used by automatic pathfinding prevents walking through contestants.
 if(positions.some((other,j)=>{if(j===i)return false;const vx=q.x-p.x,vz=q.z-p.z,u=Math.max(0,Math.min(1,((other.x-p.x)*vx+(other.z-p.z)*vz)/(vx*vx+vz*vz||1)));return Math.hypot(p.x+vx*u-other.x,p.z+vz*u-other.z)<.86;}))return;
 p.x=q.x;p.z=q.z;
}
export function stepCookieGame(s,controls={},milliseconds=STEP){
 if(s.finished)return s;const t=s.time+=milliseconds,{count,positions,scores,cookies,targets,stalled,reactions,wander,supply}=s,rng=()=>nextCookieRandom(s,'rngState'),wanderRandom=()=>nextCookieRandom(s,'wanderState');
 if(t<16000&&t>=s.nextSpawn){const available=cookies.filter(c=>c.taken===Infinity).length;spawnCookieWave(s,t,Math.min(s.firstWave?supply.cap:supply.batch,Math.max(0,supply.cap-available)));s.firstWave=false;s.nextSpawn=t+supply.interval;}
 if(s.goldenWave<2&&t>=[20300,23800][s.goldenWave]){const available=cookies.filter(c=>c.taken===Infinity).length;spawnCookieWave(s,t,goldenCookieCount(count,available,supply.cap),true);s.goldenWave++;}
 const candidates=[];
 for(let i=0;i<count;i++){
  const p=positions[i],speed=moveSpeed('cookie')*pickSpeed(s.picks[i]);let before,eligible;
  if(controls[i]){before={...p};moveCookiePlayer(positions,i,controls[i],milliseconds,speed);eligible=cookies.map((c,id)=>({c,id}));}
  else{const moved=cookieAgentStep({i,time:t,stepMs:milliseconds,speed,positions,cookies,targets,stalled,reactions,wander,rng,wanderRandom,noticeDelay:s.noticeDelays?.[i]??400,profile:s.profiles?.[i]});before=moved.before;eligible=moved.c?[{c:moved.c,id:targets[i]}]:[];}
  for(const {c,id} of eligible)if(c.taken===Infinity&&t>=c.start&&Math.hypot(c.x-p.x,c.z-p.z)<=.62){const vx=p.x-before.x,vz=p.z-before.z,ox=before.x-c.x,oz=before.z-c.z,A=vx*vx+vz*vz,B=2*(ox*vx+oz*vz),C=ox*ox+oz*oz-.62*.62,u=C<=0?0:A>0?Math.max(0,Math.min(1,(-B-Math.sqrt(Math.max(0,B*B-4*A*C)))/(2*A))):1;candidates.push({i,id,arrival:Math.max(c.start,t-milliseconds+u*milliseconds)});}
 }
 candidates.sort((a,b)=>a.arrival-b.arrival);for(const {i,id,arrival} of candidates){const c=cookies[id];if(c.taken===Infinity){c.taken=arrival;c.owner=i;scores[i]+=c.value;s.events.push({time:arrival,index:i,value:c.value,x:c.x,z:c.z});}}
 if(t>=28000){const best=Math.max(...scores),leaders=scores.map((score,i)=>score===best?i:-1).filter(i=>i>=0);if(leaders.length===1&&!cookies.some(c=>c.value===5&&c.taken===Infinity)){s.finish=t;s.winner=leaders[0];s.finished=true;}else if(!cookies.some(c=>c.taken===Infinity))spawnCookieWave(s,t,1,true);}
 if(t>=45000&&!s.finished){s.finish=t;s.finished=true;}
 return s;
}
export function cookiePlan(seed,count,picks=[]){
 const key=[seed,count,picks.join(',')].join(':');if(cache.has(key))return cache.get(key);
 const s=createCookieGame(seed,count,picks),frames=[s.positions.flatMap(p=>[p.x,p.z])],scoreFrames=[s.scores.slice()];
 while(!s.finished){stepCookieGame(s);frames.push(s.positions.flatMap(p=>[p.x,p.z]));scoreFrames.push(s.scores.slice());}
 const {supply,cookies,events,finish,winner,scores}=s;
 const p={mode:'cookie',kind:'score',supply,frames,scoreFrames,cookies,events,finish,winner,...(winner===null?{draw:true}:{}),falls:scores.map((_,i)=>i===winner?Infinity:finish),duration:finish+2200};if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,p);return p;
}
export function cookiePose(plan,i,time){const t=Math.max(0,Math.min(time,plan.finish)),f=Math.min(plan.frames.length-1,Math.floor(t/STEP)),n=Math.min(f+1,plan.frames.length-1),u=t/STEP-f,a=plan.frames[f],b=plan.frames[n],dx=b[i*2]-a[i*2],dz=b[i*2+1]-a[i*2+1];return {x:a[i*2]+dx*u,z:a[i*2+1]+dz*u,heading:Math.atan2(dx,dz),moving:Math.hypot(dx,dz)>.001,score:plan.scoreFrames[f][i]};}

export function cookiePhase(plan,time){const t=Math.max(0,time),phase=t>=plan.finish?'finished':t>=28000?'overtime':t>=24500?'final':t>=21000?'golden':t>=19000?'warning':'regular';return {phase,label:{regular:'쿠키를 모아 점수를 쌓아요',warning:'골든 쿠키가 곧 나와요!',golden:'골든 쿠키 5점 · 역전 찬스',final:'마지막 골든 쿠키!',overtime:'마지막 쿠키까지 · 연장전',finished:'최종 점수 확정'}[phase],remaining:Math.max(0,28000-t),goldValue:5};}
