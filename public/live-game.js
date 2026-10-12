import {createShakeGame,stepShakeGame,shakeSnapshotJar} from './shake.js';
import {createBookGame,stepBookGame,createIslandGame,stepIslandGame} from './party-core.js';
import {createCookieGame,stepCookieGame} from './cookie.js';
import {createSurvivalGame,stepSurvivalGame} from './survival.js';
import {createSprintGame,stepSprintGame,beePose} from './sprint.js';
import {bookPage} from './book-motion.js';
import {canJump,jumpHeight,jumpCooldown} from './game-rules.js';
export const LIVE_STEP=50;
const survival=mode=>['fire','boulder','crush'].includes(mode);
const sprint=mode=>mode==='climb'||mode==='tricycle';
const interval=mode=>(mode==='race'||mode==='shake')?20:mode==='island'?10:40;
export function createLiveGame(seed,mode,entries){
 const count=entries.length,core=mode==='shake'?createShakeGame(seed,count):mode==='race'?createBookGame(seed,count):mode==='island'?createIslandGame(seed,count):mode==='cookie'?createCookieGame(seed,count):survival(mode)?createSurvivalGame(seed,count,mode):createSprintGame(seed,count,mode);
 const s={seed,mode,time:0,core,players:entries.map(e=>({id:e.id,controllerId:e.controllerId||null,x:0,z:0,y:0,heading:0,alive:true,score:0,progress:0,fallAt:null,jumpAt:-10000,stunUntil:0,inputSeq:-1})),hazards:[],cookies:[],bees:[],book:null,finished:false,winner:null,draw:false};
 syncCore(s);return s;
}
function syncCore(s){
 const c=s.core;
 for(let i=0;i<s.players.length;i++){
  const p=s.players[i],old={x:p.x,z:p.z},identity={id:p.id,controllerId:p.controllerId,inputSeq:p.inputSeq};
  if(c.players)Object.assign(p,c.players[i],identity);
  else {const q=c.positions[i];p.x=q.x;p.z=q.z;p.alive=survival(s.mode)?c.falls[i]===null:true;p.fallAt=survival(s.mode)?c.falls[i]:null;p.score=c.scores?.[i]??0;
   if(sprint(s.mode)){p.progress=c.progress[i];p.velocity=c.agents[i].velocity;p.steerX=c.agents[i].steerX;p.speedLevel=c.agents[i].speedLevel;p.lastBoostSeq=c.agents[i].lastBoostSeq;p.actionDown=c.agents[i].actionDown;p.gearElapsed=c.agents[i].gearElapsed;p.throttle=c.agents[i].throttle;p.spinUntil=c.agents[i].spinUntil;p.spinStartedAt=c.agents[i].spinStartedAt;p.finishedAt=c.finishTimes[i];p.stunUntil=c.agents[i].restUntil||0;const hit=c.events[i].findLast(e=>e.time<=c.time&&e.type!=='jump');p.stunStartedAt=hit?.time??null;}
   else if(survival(s.mode)){p.stunUntil=c.agents[i].stunnedUntil||0;p.stunStartedAt=c.damage[i].at(-1)?.time??null;p.lives=c.lives[i];p.knockX=c.agents[i].knockX;p.knockZ=c.agents[i].knockZ;p.speed=c.speeds[i];}
   if(sprint(s.mode)){p.y=c.positions[i].y;const jumping=c.events[i].findLast(e=>e.type==='jump'&&e.time<=c.time);p.jumpAt=jumping?.time??-10000;}else p.y=jumpHeight(s.mode,c.time-p.jumpAt);
   if(p.x!==old.x||p.z!==old.z)p.heading=Math.atan2(p.x-old.x,p.z-old.z);
  }
 }
 if(survival(s.mode))s.hazards=c.hazards;
 if(s.mode==='tricycle')s.hazards=c.rocks.map((r,id)=>({id,kind:'rock',x:(r.lane-(s.players.length-1)/2)*4.8+r.offset,z:-r.distance,radius:r.radius}));
 if(s.mode==='climb')s.bees=c.bees.map((b,id)=>({id,...beePose(b,c.time,s.players.length)})).filter(b=>b.active);
 if(s.mode==='shake')s.jars=c.jars;
 if(s.mode==='cookie')s.cookies=c.cookies.map((cookie,id)=>({...cookie,id,taken:Number.isFinite(cookie.taken)?cookie.taken:null}));
 if(s.mode==='race'){const page=bookPage({rounds:c.rounds,finish:c.finished?c.finish:Infinity},c.time),round=c.rounds[c.round];s.book={...page,deadline:round.hit,start:round.start,reveal:round.reveal,reopenAt:page.opening?round.reveal:0};}
 if(c.finished){s.finished=true;s.winner=c.winner;s.draw=c.winner===null;s.reason=s.draw?((s.mode==='shake'&&c.jars.some(j=>j.finishedAt!==null))||(sprint(s.mode)&&c.finishTimes.some(t=>t!==null))?'tie':s.players.filter(p=>p.alive).length>1?'time-limit':'tie'):'winner';}
}
export function stepLiveGame(s,inputs={},milliseconds=LIVE_STEP){
 if(s.finished)return s;s.time+=milliseconds;const c=s.core,dt=interval(s.mode);
 while(c.time+dt<=s.time&&!c.finished){
  const controls={};
  s.players.forEach((p,i)=>{
   // Ownership never falls back to AI: a delayed first packet or heartbeat
   // must not move or jump for the human. Stale input safely becomes neutral.
   if(!p.controllerId)return;
   const input=inputs[p.controllerId];
   if(!input||!Number.isFinite(input.at)||s.time-input.at>=700){controls[i]={x:0,z:0,jump:false,jumpHeld:false};return;}
   controls[i]={...input,jump:canJump(s.mode)&&(input.jump===true||input.jumpHeld===true)};p.inputSeq=input.seq??p.inputSeq;if(!c.players&&canJump(s.mode)&&(input.jump||input.jumpHeld)&&c.time>=p.stunUntil&&c.time-p.jumpAt>jumpCooldown(s.mode))p.jumpAt=c.time;});
  if(s.mode==='shake')stepShakeGame(c,controls);else if(s.mode==='race')stepBookGame(c,controls);else if(s.mode==='island')stepIslandGame(c,controls);else if(s.mode==='cookie')stepCookieGame(c,controls);else if(survival(s.mode))stepSurvivalGame(c,controls);else stepSprintGame(c,controls);
 }
 syncCore(s);return s;
}
export function liveSnapshot(s){
 const players=s.players.map(p=>({id:p.id,controllerId:p.controllerId,x:p.x,z:p.z,y:p.y,heading:p.heading,alive:p.alive,score:p.score,progress:p.progress,fallAt:p.fallAt,jumpAt:p.jumpAt,stunUntil:p.stunUntil,stunStartedAt:p.stunStartedAt??null,inputSeq:p.inputSeq??-1,lives:p.lives,knockX:p.knockX,knockZ:p.knockZ,speed:p.speed,finishedAt:p.finishedAt,velocity:p.velocity,steerX:p.steerX,speedLevel:p.speedLevel,lastBoostSeq:p.lastBoostSeq,actionDown:p.actionDown,gearElapsed:p.gearElapsed,throttle:p.throttle,spinUntil:p.spinUntil,spinStartedAt:p.spinStartedAt}));
 const progress=s.mode==='tricycle'?players.map(p=>p.progress):[],near=progress.length?Math.min(...progress)-12:0,far=progress.length?Math.max(...progress)+50:0,time=s.core.time;
 return {seed:s.seed,time,mode:s.mode,players,hazards:s.hazards.filter(h=>h.kind==='rock'?-h.z>=near&&-h.z<=far:time>=h.start-h.warn-1000&&time<=h.start+h.life*1000+500),cookies:s.cookies.filter(c=>c.taken===null||time-c.taken<500),bees:s.bees,book:s.book,...(s.mode==='shake'?{jars:s.jars.map(shakeSnapshotJar)}:{}),finished:s.finished,winner:s.winner,draw:s.draw,reason:s.reason||null};
}
