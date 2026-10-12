import {createIslandGame,stepIslandGame} from './party-core.js';
import {moveSpeed} from './game-rules.js';
export const DEFAULT_LOCATION = '대륭포스트타워 8차';
export const EMOJI = ['🍜','🍛','🍣','🍔','🥟','🍲','🍕','🥗','🍤','🍱','🥪','🍝'];
export function random(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Three arms share one accelerating angular phase across every client.
export const spinnerAngle=(seed,elapsed)=>(seed%360)*Math.PI/180+.55*Math.max(0,elapsed)/1000+.03*(Math.max(0,elapsed)/1000)**2;
function runnerCurve(seed,index,count,elapsed){
  const t=Math.max(0,elapsed)/1000,sector=index%3,slot=Math.floor(index/3),slots=Math.ceil((count-sector)/3);
  const offset=(.3+(slot+.5)/slots*1.45),start=(seed%360)*Math.PI/180+sector*Math.PI*2/3+offset;
  const phase=((seed>>>3)+index*2.31)%6.28;
  const angle=start-.5*t+.10*(Math.sin(t*1.9+phase)-Math.sin(phase));
  const radius=4.75+Math.sin(t*2.6+index*1.7)*.92;
  return {x:Math.sin(angle)*radius,z:Math.cos(angle)*radius,angle,radius};
}
export const RUNNER_SPEED=moveSpeed('island');
const paths=new Map();
export function runnerPosition(seed,index,count,elapsed,speedScale=1){
 const key=seed+':'+count+':'+index;let path=paths.get(key);
 if(!path){path=[{...runnerCurve(seed,index,count,0),distance:0}];for(let t=20;t<=120000;t+=20){const point=runnerCurve(seed,index,count,t),last=path.at(-1);point.distance=last.distance+Math.hypot(point.x-last.x,point.z-last.z);path.push(point);if(point.distance>RUNNER_SPEED*45*1.1)break;}
  if(paths.size>128)paths.delete(paths.keys().next().value);paths.set(key,path);
 }
 const distance=Math.max(0,Math.min(45,elapsed/1000))*RUNNER_SPEED*speedScale;let lo=0,hi=path.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(path[mid].distance<distance)lo=mid;else hi=mid;}
 const a=path[lo],b=path[hi],u=Math.min(1,(distance-a.distance)/(b.distance-a.distance));
 const x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u;return {x,z,angle:Math.atan2(x,z),radius:Math.hypot(x,z)};
}
export const pickSpeed=picks=>1+Math.min(5,Math.max(0,Number(picks)||0))*.02;
export const runnerAngle=(seed,index,count,elapsed,speedScale=1)=>runnerPosition(seed,index,count,elapsed,speedScale).angle;
const clamp=v=>Math.max(0,Math.min(1,v));
function armDistance(seed,index,count,time,scale=1){const p=runnerPosition(seed,index,count,time,scale),step=Math.PI*2/3,phase=spinnerAngle(seed,time)-p.angle,delta=((phase+Math.PI/3)%step+step)%step-Math.PI/3;return {delta,distance:Math.abs(Math.sin(delta))*p.radius};}
export function poseForJump(jump,time){
 const rest={height:0,scaleY:1,tuck:0,air:0};if(!jump)return rest;
 const u=(time-jump.start)/640;
 if(u<0){const v=clamp((time-jump.start+140)/140);return {...rest,scaleY:1-.18*Math.sin(v*Math.PI/2)};}
 if(u<=1){const arc=4*u*(1-u);return {height:1.55*arc,scaleY:u<.14?.82+u/.14*.27:1+.09*Math.sin(Math.PI*u*2),tuck:Math.sin(Math.PI*u),air:arc};}
 return {...rest,scaleY:1-.23*Math.sin(clamp((time-jump.start-640)/150)*Math.PI)};
}
const islandSims=new Map();
export function islandSimulation(seed,count,picks=[]){
 const key=seed+':'+count+':'+picks.join(',');if(islandSims.has(key))return islandSims.get(key);
 const core=createIslandGame(seed,count,picks);while(!core.finished)stepIslandGame(core);
 const result={falls:core.players.map(p=>p.fallAt??Infinity),jumps:core.jumps,scales:core.scales,finish:core.finish,winner:core.winner,draw:core.draw,duration:core.finish+1600};
 if(islandSims.size>=32)islandSims.delete(islandSims.keys().next().value);islandSims.set(key,result);return result;
}
export const islandPlan=(seed,count,picks=[])=>islandSimulation(seed,count,picks).falls;
export function jumpPose(seed,index,count,elapsed,fallAt=Infinity,picks=[]){if(elapsed<=0||elapsed>=fallAt)return {height:0,scaleY:1,tuck:0,air:0};const sim=islandSimulation(seed,count,picks),jump=sim.jumps[index].find(j=>elapsed>=j.start-140&&elapsed<=j.start+790);return poseForJump(jump,elapsed);}
export const jumpHeight=(seed,index,count,elapsed,fallAt,picks=[])=>jumpPose(seed,index,count,elapsed,fallAt,picks).height;
export function safeLink(value) {
  if (!value) return '';
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function cleanRestaurant(input) {
  const name = typeof input.name === 'string' ? input.name.trim().slice(0,60) : '';
  if (!name) throw new Error('식당 이름을 입력해 주세요.');
  function number(value, max, integer = false) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) throw new Error('평점, 리뷰 수, 도보 시간을 확인해 주세요.');
    return n;
  }
  const mapUrl = safeLink(input.mapUrl);
  if (input.mapUrl && !mapUrl) throw new Error('지도 링크는 http 또는 https 주소를 입력해 주세요.');
  return {name, address: String(input.address || '').trim().slice(0,160), mapUrl, placeId:/^\d+$/.test(String(input.placeId||''))?String(input.placeId):'',
    rating: number(input.rating, 5), reviews: number(input.reviews, 10000000, true),
    walkMinutes: number(input.walkMinutes, 180), source: 'manual'};
}

// A hit first carries the runner over the rim, then gravity takes it into the water.
export function knockbackPosition(seed,index,count,fallAt,elapsed,speedScale=1){
 return knockbackFrom(runnerPosition(seed,index,count,fallAt,speedScale),fallAt,elapsed);
}
export function knockbackFrom(point,fallAt,elapsed){
 const origin={...point,radius:point.radius??Math.hypot(point.x,point.z),angle:point.angle??Math.atan2(point.x,point.z)},age=Math.max(0,(elapsed-fallAt)/1000),speed=6.8;
 const rimTime=(7.8-origin.radius)/speed,rimY=.23+1.6*rimTime-.8*rimTime*rimTime,velocity=1.6-1.6*rimTime;
 const flightTime=(velocity+Math.sqrt(velocity*velocity+28*(rimY+2.33)))/14,waterAt=rimTime+flightTime,t=Math.min(age,waterAt);
 const y=t<=rimTime?.23+1.6*t-.8*t*t:rimY+velocity*(t-rimTime)-7*(t-rimTime)**2;
 const radius=origin.radius+speed*t;
 return {x:Math.sin(origin.angle)*radius,z:Math.cos(origin.angle)*radius,y,age,waterAt,waterAge:age-waterAt};
}
