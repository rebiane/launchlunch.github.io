import {aiProfile} from './ai-profile.js';
import {random,runnerPosition,spinnerAngle,poseForJump,pickSpeed} from './race.js';
import {bookRound,bookNavigation,headroom,insideHole,BOOK_CHARACTER_HEIGHT,BOOK_CHARACTER_RADIUS,BOOK_MOVE_SPEED} from './book-motion.js';
import {movePlayer,jumpHeight,jumpCooldown} from './game-rules.js';
const navigation=new WeakMap();
const seeded=s=>{let t=s.rngState+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
const blank=(i)=>({id:String(i),controllerId:null,x:0,z:0,y:0,heading:0,alive:true,score:0,progress:0,fallAt:null,jumpAt:-10000,stunUntil:0});
function finish(s){s.finished=true;const alive=s.players.map((p,i)=>p.alive?i:-1).filter(i=>i>=0);s.winner=alive.length===1?alive[0]:null;s.draw=s.winner===null;s.finish=s.time;}
function page(s,index){const round=bookRound(()=>seeded(s),s.seed,index,s.time);s.rounds.push(round);s.round=index;s.agents=s.players.map((_,i)=>({ready:round.reveal+aiProfile(s.seed,i,s.players.length).reaction+seeded(s)*180,target:null,settled:false}));navigation.delete(s);}
export function createBookGame(seed,count,picks=[]){const columns=Math.min(4,count),rows=Math.ceil(count/columns),players=Array.from({length:count},(_,i)=>({...blank(i),x:(i%columns-(columns-1)/2)*1.3,z:(Math.floor(i/columns)-(rows-1)/2)*1.3}));const s={mode:'race',seed,time:0,rngState:seed,players,spawn:players.map(({x,z})=>({x,z})),speeds:players.map((p,i)=>BOOK_MOVE_SPEED*pickSpeed(picks[i])),rounds:[],round:0,finished:false,winner:null,draw:false,finish:0};page(s,0);return s;}
export function stepBookGame(s,inputs={}){
 if(s.finished)return s;const dt=20;s.time+=dt;let r=s.rounds[s.round];if(s.time>r.hit){s.time-=dt;page(s,s.round+1);s.time+=dt;r=s.rounds[s.round];}
 let nav=navigation.get(s);if(!nav){const falls=s.players.map(p=>p.alive?Infinity:p.fallAt);nav={falls,move:bookNavigation(r.holes,s.players,falls,s.agents)};navigation.set(s,nav);}s.players.forEach((p,i)=>nav.falls[i]=p.alive?Infinity:p.fallAt);
 const order=s.players.map((p,i)=>i).sort((a,b)=>((a+s.round)%s.players.length)-((b+s.round)%s.players.length));
 for(const i of order){const p=s.players[i];if(!p.alive||s.time<r.reveal)continue;const before={x:p.x,z:p.z};if(inputs[i])movePlayer(s,p,inputs[i],dt,i);else nav.move(i,s.time,s.speeds[i],dt);const dx=p.x-before.x,dz=p.z-before.z;if(dx||dz)p.heading=Math.atan2(dx,dz);}
 // Every body is tested: genuinely simultaneous contact is a draw in both modes.
 for(const p of s.players)if(p.alive&&headroom(r,s.time,p.z)<=BOOK_CHARACTER_HEIGHT&&!r.holes.some(h=>insideHole(h,p.x,p.z,BOOK_CHARACTER_RADIUS))){p.alive=false;p.fallAt=s.time;}
 if(s.time>=r.hit&&(s.players.filter(p=>p.alive).length<=1||s.round>=5))finish(s);
 return s;
}
function arm(seed,index,count,time,scale){const p=runnerPosition(seed,index,count,time,scale),sector=Math.PI*2/3,phase=spinnerAngle(seed,time)-p.angle,delta=((phase+Math.PI/3)%sector+sector)%sector-Math.PI/3;return delta;}
export function createIslandGame(seed,count,picks=[]){const rng=random(seed),scales=Array.from({length:count},(_,i)=>pickSpeed(picks[i])),jumps=Array.from({length:count},()=>[]);for(let i=0;i<count;i++){const profile=aiProfile(seed,i,count);let previous=arm(seed,i,count,0,scales[i]),lastLand=-1000;for(let t=10;t<=45000;t+=10){const d=arm(seed,i,count,t,scales[i]);if(previous*d<=0&&Math.abs(d-previous)<.5){const crossing=t-10+10*Math.abs(previous)/(Math.abs(previous)+Math.abs(d)||1),delay=t<10000?rng()*25-12:(rng()-.4)*(40+profile.imprecision*180)+(rng()<(t<20000?.025:.05)+(1-profile.skill)*.14?110+profile.imprecision*100:0),start=crossing-310+delay;if(start>lastLand+100){jumps[i].push({start,crossing});lastLand=start+640;}}previous=d;}}
 return {mode:'island',seed,time:0,players:Array.from({length:count},(_,i)=>({...blank(i),...runnerPosition(seed,i,count,0,scales[i])})),scales,jumps,finished:false,winner:null,draw:false,finish:0};
}
export function stepIslandGame(s,inputs={}){
 if(s.finished)return s;s.time+=10;
 for(let i=0;i<s.players.length;i++){const p=s.players[i];if(!p.alive)continue;
  if(inputs[i])movePlayer(s,p,inputs[i],10,i);else{const before={x:p.x,z:p.z};Object.assign(p,runnerPosition(s.seed,i,s.players.length,s.time,s.scales[i]));const jump=s.jumps[i].find(j=>s.time>=j.start-140&&s.time<=j.start+790);p.y=poseForJump(jump,s.time).height;p.jumpAt=jump?.start??-10000;if(before.x!==p.x||before.z!==p.z)p.heading=Math.atan2(p.x-before.x,p.z-before.z);}
  const sector=Math.PI*2/3,phase=spinnerAngle(s.seed,s.time)-Math.atan2(p.x,p.z),delta=((phase+Math.PI/3)%sector+sector)%sector-Math.PI/3;
  if(Math.abs(Math.sin(delta))*Math.hypot(p.x,p.z)<.57&&p.y<.65){p.alive=false;p.fallAt=s.time;}
 }
 if(s.players.filter(p=>p.alive).length<=1||s.time>=45000)finish(s);return s;
}
