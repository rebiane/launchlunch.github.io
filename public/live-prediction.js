import {stepShakeJar,breadSupport,SHAKE_GEOMETRY} from './shake.js';
import {CART_DISTANCE,CART_LANE_SPACING,CART_STEER_LIMIT,CART_STEER_SPEED,movePlayer,moveSpeed,sprintSpeed,jumpHeight,canJump,canStartJump,arenaBounds} from './game-rules.js';
import {moveCookiePlayer} from './cookie.js';
import {moveSurvivalControl} from './survival.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// Predict only the local player's short, unconfirmed movement. Contacts, scores,
// eliminations and the result always come from the room's authoritative snapshot.
export function createLocalPrediction(){
 const MAX_PREDICTION_MS=650,INPUT_TIMEOUT_MS=600;
 let horizons=new WeakMap(),arrivalTime=null,arrivalSnapshotTime=null,cadence=100;
 let raceId=null,history=[],previousSnapshot=null,lastFrameTime=null,lastJump=null,jarCorrection=0,correction={x:0,z:0,progress:0};
 function reset(id){if(id!==raceId){raceId=id;history=[];horizons=new WeakMap();arrivalTime=null;arrivalSnapshotTime=null;cadence=100;previousSnapshot=null;lastFrameTime=null;lastJump=null;jarCorrection=0;correction={x:0,z:0,progress:0};}}
 function predict(snapshot,id,memberId,time){
   reset(id);if(!snapshot||snapshot.finished||time<0)return snapshot;
   const index=snapshot.players.findIndex(p=>p.controllerId===memberId);
   if(index<0||!snapshot.players[index].alive||!history.length)return snapshot;
   const source=snapshot.players[index],p={...source},mode=snapshot.mode;
   const end=clamp(time,snapshot.time,snapshot.time+(horizons.get(snapshot)??150)),players=snapshot.players.map((q,i)=>i===index?p:q),world={...snapshot,players};
   const jar=mode==='shake'&&snapshot.jars?.[index]?structuredClone(snapshot.jars[index]):null;
   let input={x:0,z:0,jump:false};
   const relevant=history.filter(e=>e.time<=end);
   for(const e of relevant)if(e.time<=snapshot.time)input=e;
   let cursor=snapshot.time;
   const advance=until=>{
    while(cursor<until){const next=Math.min(until,cursor+1000/60),milliseconds=next-cursor;world.time=next;
     const current=next>(input.time??snapshot.time)+INPUT_TIMEOUT_MS?{x:0,z:0,jump:false,jumpHeld:false}:input;
     if(jar)stepShakeJar(jar,{...current,action:false},next,milliseconds);
     else if(mode==='cookie'){if(next>=p.stunUntil)moveCookiePlayer(players,index,current,milliseconds);if(current.x||current.z)p.heading=Math.atan2(current.x,current.z);}
     else if(['fire','crush','boulder'].includes(mode)){const agent={stunnedUntil:p.stunUntil,knockX:p.knockX||0,knockZ:p.knockZ||0,reactAt:0};moveSurvivalControl({mode,time:next,index:0,positions:[p],agents:[agent],speeds:[p.speed|| (mode==='fire'?5.2:4.4)],input:current,stepMs:milliseconds});p.knockX=agent.knockX;p.knockZ=agent.knockZ;if(current.x||current.z)p.heading=Math.atan2(current.x,current.z);}
     else if(mode!=='race'||(next>=(snapshot.book?.reveal??0)&&next<=(snapshot.book?.deadline??Infinity)))movePlayer(world,p,{...current,...(mode==='tricycle'?{action:false}:{}),jump:canJump(mode)&&current.jumpHeld===true},milliseconds,index);
     cursor=next;
    }
   };
   for(const e of relevant){if(e.time>snapshot.time)advance(e.time);input=e;if(jar&&e.action&&e.seq>(source.inputSeq??-1)){const at=Math.max(snapshot.time,e.time);stepShakeJar(jar,{...e,action:false},at,0);stepShakeJar(jar,{...e,action:true},at,0);}if(e.jump&&e.seq>(source.inputSeq??-1)&&canStartJump(mode,p,e.time,Math.max(snapshot.time,e.time)))p.jumpAt=e.time;}
   advance(end);if(jar){
    const authoritative=snapshot.jars[index];
    jar.score=authoritative.score;jar.finishedAt=authoritative.finishedAt;
    jar.pieces=jar.pieces.map((piece,i)=>{
     const source=authoritative.pieces[i];
     if(source.escapedAt!==null)return source;
     if(piece.escapedAt!==null)return {...piece,y:Math.min(piece.y,SHAKE_GEOMETRY.mouth+breadSupport(piece,0,1)-.001),escapedAt:null,escapeAngle:null};
     return piece;
    });
    return {...snapshot,jars:snapshot.jars.map((j,i)=>i===index?jar:j)};
   }p.poseTime=end;p.y=jumpHeight(mode,end-p.jumpAt);if(mode==='climb')p.y=p.progress+p.y*.6;
   return {...snapshot,players:snapshot.players.map((q,i)=>i===index?p:q)};
 }
 return {
  input(id,time,input,seq){reset(id);history.push({time,...input,seq});while(history.length>1&&history[1].time<time-1000)history.shift();},
  render(snapshot,id,memberId,time){
   reset(id);
   if(snapshot&&!horizons.has(snapshot)){
    // Cover the measured one-way age plus two observed packet intervals. Keep
    // this budget fixed for each packet so a disconnected room cannot drift on.
    if(arrivalTime!==null&&snapshot.time>arrivalSnapshotTime){
     const gap=clamp(time-arrivalTime,0,250);
     cadence=Math.max(100,gap,cadence*.9);
    }
    const age=Math.max(0,time-snapshot.time);
    horizons.set(snapshot,Math.min(MAX_PREDICTION_MS,Math.max(150,age+cadence*2)));
    arrivalTime=time;arrivalSnapshotTime=snapshot.time;
   }
   const result=predict(snapshot,id,memberId,time);if(!snapshot)return result;if(result===snapshot){previousSnapshot=null;correction={x:0,z:0,progress:0};lastFrameTime=time;return result;}
   const index=snapshot.players.findIndex(p=>p.controllerId===memberId),p=result.players[index],source=snapshot.players[index];
   if(index<0||!p||!p.alive||snapshot.finished){previousSnapshot=null;correction={x:0,z:0,progress:0};lastFrameTime=time;return result;}
   const elapsed=Math.max(0,time-(lastFrameTime??time)),mode=snapshot.mode;
   if(mode==='shake'){
    jarCorrection*=Math.exp(-elapsed/100);
    if(previousSnapshot&&previousSnapshot!==snapshot){const old=predict(previousSnapshot,id,memberId,time).jars?.[index];if(old)jarCorrection+=old.angle-result.jars[index].angle;}
    if(Math.abs(jarCorrection)>.6)jarCorrection=0;
    previousSnapshot=snapshot;lastFrameTime=time;
    return {...result,jars:result.jars.map((jar,i)=>i===index?{...jar,angle:jar.angle+jarCorrection}:jar)};
   }

   // Reconcile only an arriving server correction, never delay fresh local input.
   const factor=Math.exp(-elapsed/100),intent=history.findLast(e=>e.time<=time),moving=mode==='tricycle'?Math.abs(p.velocity||0)>.01:Math.hypot(intent?.x||0,intent?.z||0)>.01;
   let decay=moving&&time>=snapshot.time+(horizons.get(snapshot)??150)?0:1-factor;
   if(moving){const speed=mode==='tricycle'?Math.max(1,Math.abs(p.velocity||0)):mode==='climb'?sprintSpeed(mode):moveSpeed(mode),size=Math.max(Math.hypot(correction.x,correction.z),Math.abs(correction.progress));if(size)decay=Math.min(decay,speed*.45*elapsed/1000/size);}
   for(const key of ['x','z','progress']){
    let axisDecay=decay;
    if(mode==='tricycle'&&key==='x'){
     // Forward speed must never pull lateral reconciliation faster than the
     // current steering intent (especially a small or reversed thumb drag).
     axisDecay=moving&&time>=snapshot.time+(horizons.get(snapshot)??150)?0:1-factor;
     const steering=Math.min(1,Math.abs(intent?.x||0));
     if(steering>.01&&Math.abs(correction.x)>0)axisDecay=Math.min(axisDecay,CART_STEER_SPEED*steering*.45*elapsed/1000/Math.abs(correction.x));
    }
    correction[key]*=1-axisDecay;
   }
   const previous=previousSnapshot?.players[index],hardContact=(source.stunUntil>time&&source.stunUntil!==(previous?.stunUntil||0))||(mode==='tricycle'&&source.spinUntil>snapshot.time&&source.spinUntil!==(previous?.spinUntil||0));
   if(previousSnapshot&&previousSnapshot!==snapshot&&!hardContact){const old=predict(previousSnapshot,id,memberId,time).players[index];if(old?.alive)for(const key of ['x','z','progress'])correction[key]+=(old[key]||0)-(p[key]||0);}
   if(hardContact)correction={x:0,z:0,progress:0};
   let poseJumpAt=p.jumpAt;if(mode==='island'){if(lastJump&&lastJump.visualStart<=(lastFrameTime??time)&&Math.abs(p.jumpAt-lastJump.rawStart)<=150&&p.jumpAt>=0)poseJumpAt=lastJump.visualStart;lastJump={rawStart:p.jumpAt,visualStart:poseJumpAt};}
   const shown={...p,poseJumpAt,x:p.x+correction.x,z:p.z+correction.z,progress:(p.progress||0)+correction.progress},bounds=arenaBounds(mode,snapshot.players.length);
   const blocked=['cookie','race','fire'].includes(mode)&&snapshot.players.some((q,j)=>j!==index&&q.alive&&Math.hypot(q.x-shown.x,q.z-shown.z)<.86);
   if(blocked){correction={x:0,z:0,progress:0};Object.assign(shown,p);}else if(bounds.radius){const r=Math.hypot(shown.x,shown.z);if(r>bounds.radius){shown.x*=bounds.radius/r;shown.z*=bounds.radius/r;}}else{shown.x=clamp(shown.x,-bounds.x,bounds.x);if(mode!=='tricycle')shown.z=clamp(shown.z,-bounds.z,bounds.z);}
   if(mode==='island')shown.y=jumpHeight('island',shown.poseTime-shown.poseJumpAt);
   if(mode==='climb'){const pole=(index-(snapshot.players.length-1)/2)*1.65;shown.x=clamp(shown.x,pole-.3,pole+.3);shown.progress=clamp(shown.progress,0,28);shown.y=p.y+shown.progress-p.progress;}else if(mode==='tricycle'){const lane=(index-(snapshot.players.length-1)/2)*CART_LANE_SPACING;shown.x=clamp(shown.x,lane-CART_STEER_LIMIT,lane+CART_STEER_LIMIT);shown.steerX=shown.x-lane;shown.progress=clamp(shown.progress,0,CART_DISTANCE);shown.z=-shown.progress;}
   previousSnapshot=snapshot;lastFrameTime=time;
   return {...result,players:result.players.map((q,i)=>i===index?shown:q)};
  }
 };
}
