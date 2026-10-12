import {createBookGame,stepBookGame} from './party-core.js';
import {moveSpeed} from './game-rules.js';
import {random,pickSpeed} from './race.js';
const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>v*v*(3-2*v);
export const BOOK_MOVE_SPEED=moveSpeed('race');
export const BOOK_CHARACTER_HEIGHT=1.86;
export const BOOK_CHARACTER_RADIUS=.45;
export function holeOutline(h){const {radius:r,shape}=h;if(shape==='square')return [[-r*.85,-r*.85],[r*.85,-r*.85],[r*.85,r*.85],[-r*.85,r*.85]];if(shape==='diamond')return [[0,-r*1.25],[r*1.25,0],[0,r*1.25],[-r*1.25,0]];const n=shape==='hexagon'?6:48,outer=shape==='hexagon'?r*1.15:r;return Array.from({length:n},(_,i)=>[Math.cos(i/n*Math.PI*2)*outer,Math.sin(i/n*Math.PI*2)*outer]);}
const holeEdges=new WeakMap();
export function insideHole(h,x,z,margin=0){let geometry=holeEdges.get(h);if(!geometry||geometry.radius!==h.radius||geometry.shape!==h.shape){const outline=holeOutline(h);geometry={radius:h.radius,shape:h.shape,edges:outline.map(([ax,az],i)=>{const [bx,bz]=outline[(i+1)%outline.length],dx=bx-ax,dz=bz-az;return {ax,az,dx,dz,length:Math.hypot(dx,dz)};})};holeEdges.set(h,geometry);}const px=x-h.x,pz=z-h.z;return geometry.edges.every(({ax,az,dx,dz,length})=>(dx*(pz-az)-dz*(px-ax))/length>=margin);}
export function headroom(round,time,z){const u=clamp((time-round.hit+420)/420),angle=.12+smooth(u)*(Math.PI/2-.12);return .52+(z+5.05)/Math.tan(angle)-.11/Math.sin(angle)-.38;}
const layouts=[[[ -4.5,-2.3],[0,-2.3],[4.5,-2.3],[-4.5,2.3],[0,2.3],[4.5,2.3]],[[-4.4,-2.2],[0,-2.2],[4.4,-2.2],[-2.3,2.3],[2.3,2.3]],[[-3.5,-2.3],[3.5,-2.3],[-3.5,2.3],[3.5,2.3]],[[-4.2,-1.7],[4.2,-1.7],[0,2.3]],[[-3.6,-1.5],[3.6,1.5]],[[0,0]]];
export function bookRound(rng,seed,r,start){r=Math.min(5,r);const reveal=start+(r?560:0),hit=reveal+3200-r*140,radius=1.7-.88*r/5,flip=(r+seed)%2?1:-1;const holes=layouts[r].map(([x,z],i)=>({x:x*flip+(rng()-.5)*.2,z:z*flip+(rng()-.5)*.3,radius,shape:['circle','square','diamond','hexagon'][(r+i+seed%4)%4]}));return {start,reveal,hit,holes};}
export function bookNavigation(holes,positions,falls,agents){const count=positions.length;
 const destinations=holes.flatMap(h=>{const points=[{x:h.x,z:h.z}];for(let radius=.16;radius<h.radius;radius+=.16)for(let n=0;n<32;n++){const x=h.x+Math.cos(n/32*Math.PI*2)*radius,z=h.z+Math.sin(n/32*Math.PI*2)*radius;if(insideHole(h,x,z,BOOK_CHARACTER_RADIUS+.025))points.push({x,z});}return points;});
  const clearance=(i,q)=>{let nearest=Infinity;for(let j=0;j<count;j++)if(j!==i&&!Number.isFinite(falls[j]))nearest=Math.min(nearest,Math.hypot(q.x-positions[j].x,q.z-positions[j].z));return nearest;};
  function hasClearance(i,q,limit){for(let j=0;j<count;j++){if(j===i||Number.isFinite(falls[j]))continue;const dx=q.x-positions[j].x,dz=q.z-positions[j].z;if(Math.abs(dx)>=limit||Math.abs(dz)>=limit)continue;if(Math.hypot(dx,dz)<limit)return false;}return true;}
  function choose(i){const p=positions[i],free=destinations.filter(q=>hasClearance(i,q,BOOK_CHARACTER_RADIUS*2+.025)),options=free.length?free:destinations;let best=null,cost=Infinity;for(const q of options){const value=Math.hypot(q.x-p.x,q.z-p.z)+(free.length?0:Math.max(0,.925-clearance(i,q))*20);if(value<cost){cost=value;best=q;}}agents[i].target=best;}
  function clearPath(i,from,to){return positions.every((p,j)=>{if(j===i||Number.isFinite(falls[j]))return true;const dx=to.x-from.x,dz=to.z-from.z,u=clamp(((p.x-from.x)*dx+(p.z-from.z)*dz)/(dx*dx+dz*dz||1));return Math.hypot(from.x+dx*u-p.x,from.z+dz*u-p.z)>=BOOK_CHARACTER_RADIUS*2+.005;});}
 return (i,time,speed,stepMs)=>{const a=agents[i],p=positions[i];
    // Once fully inside, never leave this hole during the same page.
    if(holes.some(h=>insideHole(h,p.x,p.z,BOOK_CHARACTER_RADIUS))&&hasClearance(i,p,BOOK_CHARACTER_RADIUS*2)){a.settled=true;return;}
    if(a.settled||time<a.ready)return;
    if(!a.target||!hasClearance(i,a.target,BOOK_CHARACTER_RADIUS*2+.005))choose(i);
    const target=a.target;if(!target)return;const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),travel=Math.min(d,speed*stepMs/1000),heading=Math.atan2(dz,dx);let next=null,cost=Infinity;
    for(const offset of [0,.35,-.35,.7,-.7,1.05,-1.05,1.4,-1.4]){const step=offset===0?travel:speed*stepMs/1000,q={x:p.x+Math.cos(heading+offset)*step,z:p.z+Math.sin(heading+offset)*step};if(clearPath(i,p,q)){const value=Math.hypot(q.x-target.x,q.z-target.z);if(value<cost){next=q;cost=value;}}}
    if(next){p.x=next.x;p.z=next.z;}else a.target=null;
 };
}
const cache=new Map(),STEP=20;
export function bookPlan(seed,count,picks=[]){
 const key=seed+':'+count+':'+picks.join(',');if(cache.has(key))return cache.get(key);
 const core=createBookGame(seed,count,picks),frames=[core.players.flatMap(p=>[p.x,p.z])];
 while(!core.finished){stepBookGame(core);frames.push(core.players.flatMap(p=>[p.x,p.z]));}
 const falls=core.players.map(p=>p.fallAt??Infinity),result={falls,contacts:falls,spawn:core.spawn,rounds:core.rounds,frames,speeds:core.speeds,finish:core.finish,winner:core.winner,draw:core.draw,duration:core.finish+1300};
 if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
}
export function bookPose(plan,index,elapsed){
 const time=Math.max(0,elapsed),frame=Math.min(plan.frames.length-1,Math.floor(time/STEP)),next=Math.min(plan.frames.length-1,frame+1),mix=clamp(time/STEP-frame),a=plan.frames[frame],b=plan.frames[next],j=index*2;
 const x=a[j]+(b[j]-a[j])*mix,z=a[j+1]+(b[j+1]-a[j+1])*mix,dead=time>=plan.falls[index],moving=!dead&&Math.hypot(b[j]-a[j],b[j+1]-a[j+1])>.001;
 const deathRound=plan.rounds.find(r=>plan.falls[index]<=r.hit),current=plan.rounds.find(r=>time<=r.hit)||plan.rounds.at(-1),crush=dead?clamp(headroom(deathRound,time,z)/BOOK_CHARACTER_HEIGHT):1;
 const before=plan.frames[Math.max(0,frame-1)],dx=moving?b[j]-a[j]:a[j]-before[j],dz=moving?b[j+1]-a[j+1]:a[j+1]-before[j+1];
 return {x,z,heading:Math.atan2(dx,dz),moving,speed:moving?plan.speeds[index]:0,crushing:dead,crush,dead,deathAge:dead?(time-plan.falls[index])/1000:0,danger:!dead&&time>current.hit-900&&!current.holes.some(h=>insideHole(h,x,z,BOOK_CHARACTER_RADIUS))};
}
export function bookAngle(round,time){if(round.start>0&&time<round.reveal)return Math.PI/2-(Math.PI/2-.12)*smooth(clamp((time-round.start-220)/340));return .12+smooth(clamp((time-(round.hit??round.deadline)+420)/420))*(Math.PI/2-.12);}
export function bookPage(plan,elapsed){const time=Math.max(0,Math.min(elapsed,plan.finish));let active=plan.rounds.findIndex(r=>time<r.hit);if(active<0)active=plan.rounds.length-1;const current=plan.rounds[active],opening=active>0&&time<current.reveal,round=opening?active-1:active,age=time-current.hit,drop=clamp((time-current.hit+420)/420);const angle=bookAngle(current,time);return {round,angle,opening,impact:age>=0&&age<300,impactAge:age/1000,holes:plan.rounds[round].holes};}
export function bookCountdown(plan,elapsed){const round=plan.rounds.find(r=>elapsed<r.hit)||plan.rounds.at(-1);const closesAt=round.hit-420,remaining=Math.max(0,closesAt-Math.max(round.reveal,elapsed));return {remaining,total:closesAt-round.reveal,opening:elapsed<round.reveal,closing:elapsed>=closesAt,round:plan.rounds.indexOf(round)+1};}
