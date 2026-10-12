import {kitchenSet} from './kitchen-set.js';
import {loadFoods,food} from './food-art.js';
import {fitOverview,focusContestant,studio,RoundedBoxGeometry,grainTexture,roundedBox} from './studio.js';
import {chef,COLORS,trophy} from './art.js';
import * as T from './vendor/three.module.js';
import {survivalPlan,survivalPose,hazardPose,wallWarning,boulderPath,touches} from './survival.js';
const PALETTE=COLORS;
export async function createSurvivalRenderer(container){
 await loadFoods(['bottle-ketchup', 'bottle-oil']);
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;container.replaceChildren(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1,.1,120);scene.add(new T.HemisphereLight(0xffffff,0x142e49,1.25));const sun=new T.DirectionalLight(0xfff2d8,2.2);sun.position.set(-7,20,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17});sun.shadow.bias=-.001;scene.add(sun);
 const world=new T.Group();scene.add(world);const finishRender=studio(renderer,scene,camera);let pieces=[],obstacles=[],signature='',plan,mode,w=0,h=0,flameGeometry;
 const material=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.48,...extra});
 function mesh(geo,color,parent=world,x=0,y=0,z=0,extra={}){const obj=new T.Mesh(geo,material(color,extra));obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;}
 const box=(x,y,z,color,parent=world,px=0,py=0,pz=0,extra={})=>mesh(roundedBox(x,y,z),color,parent,px,py,pz,extra);
 const ball=(r,color,parent,x=0,y=0,z=0,extra={})=>mesh(new T.SphereGeometry(r,16,12),color,parent,x,y,z,extra);
 const floorY=z=>mode==='boulder'?.24-z*.06:.24;
 function addHazard(hazard,geo){
   const root=new T.Group();world.add(root);const rx=hazard.rx,rz=hazard.rz;
   if(hazard.kind==='tile'){
    for(let n=0;n<5;n++){
     const flameGroup=new T.Group();root.add(flameGroup);flameGroup.position.set(Math.cos(n*2.4)*.55,0,Math.sin(n*2.4)*.55);
     for(let layer=0;layer<3;layer++){
      const flame=mesh(geo,[0xf65b0d,0xffa921,0xffe88b][layer],flameGroup,layer*.065,.03,layer*.07,{emissive:[0xe63900,0xff7d08,0xffd85c][layer],emissiveIntensity:.75,transparent:layer<2,opacity:layer===0?.55:layer===1?.8:1,depthWrite:layer===2,roughness:.65});flame.scale.setScalar(1-layer*.24);flame.rotation.y=n*.65;flame.renderOrder=3-layer;

     }
    }
    const glow=mesh(new T.PlaneGeometry(rx*2,rz*2),0xff5e12,root,0,.15,0,{emissive:0xff5e12,emissiveIntensity:1,transparent:true,opacity:.6});glow.rotation.x=-Math.PI/2;
    for(let n=0;n<8;n++)ball(.055,0xffd63c,root,Math.sin(n*3)*.8,n*.24,Math.cos(n*3)*.8,{emissive:0xffa000,emissiveIntensity:2});
   }else if(mode==='boulder'){
    const roll=new T.Group();root.add(roll);roll.position.y=rz;const shape=new T.Shape();shape.moveTo(-.8,-.65);shape.quadraticCurveTo(-1,-.5,-.8,-.1);shape.lineTo(-.22,.85);shape.quadraticCurveTo(0,1.18,.25,.85);shape.lineTo(.83,-.1);shape.quadraticCurveTo(1,-.65,.65,-.7);shape.closePath();
    const rice=mesh(new T.ExtrudeGeometry(shape,{depth:.95,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.12,bevelThickness:.12,curveSegments:16}),0xfff1d8,roll,0,0,-.48);roll.scale.set(rx,rz,rz);
    for(const z of [-.62,.62]){const nori=box(.63,.82,.065,0x133f2f,roll,0,-.25,z);for(let n=0;n<9;n++)box(.018,.65,.008,0x28503d,roll,n*.063-.25,-.25,z+(z>0?.04:-.04));for(let n=0;n<7;n++){const sesame=ball(.035,0xc39d60,roll,Math.sin(n*2.3)*.5,.18+Math.cos(n*2.3)*.3,z);sesame.scale.y=1.8;}}
   }else{
    box(1,2.8,16,hazard.side<0?0x197eab:0x195b98,root,0,1.4,0);box(1.03,.23,16.03,0xffcb59,root,0,.45,0);box(1.03,.16,16.03,0xe4edff,root,0,2.4,0);for(const z of [-6,-3,0,3,6]){box(.94,.025,.07,0x0d4562,root,0,2.81,z);for(const x of [-.36,.36]){const bolt=mesh(new T.CylinderGeometry(.07,.07,.04,6),0xbad0ce,root,x,2.82,z+.2);}}
   }
   const warning=new T.Group();world.add(warning);
   let lane;
   if(hazard.kind==='tile')lane=box(rx*2,.03,rz*2,0xff483b,warning,hazard.x,.32,hazard.z,{transparent:true,opacity:.45,depthWrite:false});
   else if(hazard.kind==='wall'){const area=wallWarning(hazard);lane=box(area.rx*2,.03,area.rz*2,0xff3434,warning,area.x,.3,area.z,{transparent:true,opacity:.55,depthWrite:false});for(let v=-7;v<8;v+=1.3){box(area.axis==='x'?area.width:.09,.035,area.axis==='z'?area.width:.09,0xffbc16,warning,area.axis==='x'?area.x:v,.325,area.axis==='z'?area.z:v);}}
   else {const path=boulderPath(hazard);for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z;const strip=box((rx+.33)*2,.025,Math.hypot(dx,dz)+.025,0xffc400,warning,(a.x+b.x)/2,floorY((a.z+b.z)/2)+.09,(a.z+b.z)/2,{transparent:true,opacity:.42,depthWrite:false});strip.rotation.y=Math.atan2(dx,dz);strip.rotation.x=.06;lane=strip;}}
   const ignition=hazard.kind==='tile'?mesh(new T.ConeGeometry(.085,.65,12),0xffbf36,world,hazard.x,floorY(hazard.z)+.34,hazard.z,{emissive:0xff7400,emissiveIntensity:1.5}):null;if(ignition){ignition.castShadow=false;ignition.visible=false;}
   obstacles.push({root,warning,lane,hazard,ignition});
 }
 function build(entries,seed,nextMode,live){
  world.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});world.clear();pieces=[];obstacles=[];mode=nextMode;plan=live?{hazards:[],falls:entries.map(()=>Infinity),causes:entries.map(()=>null),finish:Infinity,winner:null}:survivalPlan(seed,entries.length,mode,entries.map(e=>e.picks||0));
  container.dataset.characterCount=entries.length;container.dataset.mode=mode;renderer.domElement.setAttribute('aria-label',({fire:'불판 대소동',boulder:'와르르 도시락',crush:'압착 주방'})[mode]+' 3D 게임 화면');
  const bg={fire:0x211c30,boulder:0x08636b,crush:0x172943}[mode];scene.background=new T.Color(bg);scene.fog=new T.Fog(bg,45,85);
  if(mode!=='boulder')kitchenSet(world);else box(140,.5,140,bg,world,0,-2.3,0);
  const platform=new T.Group();world.add(platform);if(mode==='boulder')platform.rotation.x=.06;
  const length=mode==='fire'?13:mode==='boulder'?19:15,width=mode==='crush'?19:14;
  box(width,.9,mode==='crush'?19:length,mode==='fire'?0x41425a:mode==='boulder'?0xa67748:0x556894,platform,0,-.4,0);
  box(width-.3,.18,mode==='crush'?18.7:length-.3,mode==='fire'?0x624c43:mode==='boulder'?0xe7b986:0x466178,platform,0,.12,0);
  if(mode==='fire')for(let x=0;x<5;x++)for(let z=0;z<5;z++){box(2.30,.08,2.30,(x+z)%2?0x384352:0x475360,platform,(x-2)*2.4,.22,(z-2)*2.4);for(let k=-1;k<=1;k++)box(.04,.025,2.1,0x1c2635,platform,(x-2)*2.4+k*.55,.27,(z-2)*2.4);}
  if(mode==='boulder')for(let z=-9;z<=9;z++){const plank=box(13.6,.04,.87,z%2?0xfff3dc:0xeedbbd,platform,0,.24,z);plank.material.map=grainTexture();plank.material.map.repeat.set(7,1);}
  if(mode==='crush')for(let z=-6;z<=6;z+=1.5){box(18,.02,.06,0x7f92b7,platform,0,.24,z);for(const x of [-8,8]){const stripe=box(.6,.03,.75,0xffc857,platform,x,.25,z);stripe.rotation.y=.5;}}
  for(const side of [-1,1]){box(.24,.35,length,mode==='boulder'?0xf5daa2:0xffffff,platform,side*width/2,.26,0);for(let z=-length/2+1;z<length/2;z+=2)box(.26,.06,.7,mode==='fire'?0xff895a:mode==='boulder'?0x77b893:0xffc653,platform,side*width/2,.47,z);}
  if(mode==='fire'){
   box(34,.4,28,0x183341,world,0,-1.25,0);for(let x=-16;x<=16;x+=2)for(let z=-12;z<=12;z+=2)box(1.97,.04,1.97,((x+z)/2)%2?0x1c414e:0x244b58,world,x,-1.02,z);
   for(const x of [-10,10])food(x<0?'bottle-ketchup':'bottle-oil',world,3,x,-1,-6);
   for(const x of [-4,0,4]){const dial=mesh(new T.CylinderGeometry(.7,.7,.25,24),0x62617d,world,x,-.25,6.7);dial.rotation.x=Math.PI/2;box(.15,.55,.15,0xff996e,world,x,-.15,6.85);}
   for(const x of [-8.5,8.5]){const handle=mesh(new T.TorusGeometry(1.2,.18,8,32),0x58556f,world,x,.2,0);handle.rotation.x=Math.PI/2;}
  }else if(mode==='boulder'){
   for(const x of [-10,10])for(const z of [-9,1,10]){mesh(new T.CylinderGeometry(.14,.22,2.5,8),0xb28b64,world,x,-.8,z);const tree=mesh(new T.ConeGeometry(1.4,3.3,7),0x07966c,world,x,1.3,z);}
   box(15,1.1,1,0xe4ac79,world,0,.9,-10);
  }else{
   for(const x of [-9.5,9.5]){box(1.2,3.3,17,0x183c59,world,x,1,-.2);for(let z=-6;z<=6;z+=3){const bolt=mesh(new T.CylinderGeometry(.12,.12,.12,6),0xc3d8e5,world,x+(x<0?.67:-.67),2.2,z);bolt.rotation.z=Math.PI/2;}}
   for(const x of [-8,8])for(const z of [-6,0,6]){box(.5,3,.5,0x879ac9,world,x,.7,z);ball(.25,0xffd477,world,x,2.3,z,{emissive:0xffb94f,emissiveIntensity:.35});}
  }
  entries.forEach((entry,i)=>{
   const root=new T.Group(),body=new T.Group();world.add(root);root.add(body);
   const {feet}=chef(body,PALETTE[i]);const crown=trophy(root);
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#10243ff2';ctx.beginPath();ctx.roundRect(0,0,512,120,34);ctx.fill();ctx.fillStyle='#ffffff';ctx.font='800 54px -apple-system,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(entry.name,256,61,480);
   const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;const tag=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:false,toneMapped:false}));tag.position.y=2.38+(i%3)*.14;tag.scale.set(2.55,.6,1);tag.userData.nameLabel=true;root.add(tag);
   const shadow=mesh(new T.CircleGeometry(.48,24),0x435469,root,0,.02,0,{transparent:true,opacity:.16,depthWrite:false});shadow.rotation.x=-Math.PI/2;
   const burst=new T.Group();world.add(burst);burst.visible=false;for(let n=0;n<7;n++)ball(.14,PALETTE[i],burst,0,0,0,{transparent:true});const hearts=[];pieces.push({root,body,feet,tag,burst,hearts,crown});
  });
  const profile=Array.from({length:21},(_,k)=>{const t=k/20;return new T.Vector2(Math.sin(Math.PI*t)*(.48-.2*t),t*1.85);});
  const geo=new T.LatheGeometry(profile,24),vertices=geo.attributes.position;
  for(let k=0;k<vertices.count;k++){const y=vertices.getY(k)/1.85;vertices.setX(k,vertices.getX(k)+Math.sin(y*Math.PI*.85)*y*.35);}
  geo.computeVertexNormals();
  flameGeometry=geo;for(const hazard of plan.hazards)addHazard(hazard,geo);
 }
 return {render({entries,seed=1,elapsed=-1,mode:nextMode,reduced=false,liveSnapshot=null,localMemberId=null}){
 const frameTime=elapsed;
  const key=[!!liveSnapshot,nextMode,seed,...entries.map(e=>e.id+e.name+e.picks)].join(':');if(key!==signature){signature=key;build(entries,seed,nextMode,liveSnapshot);}
  const live=liveSnapshot;if(live){elapsed=live.finished?Math.max(elapsed,live.time):live.time;plan.finish=live.finished?live.time:Infinity;plan.winner=live.winner;for(const hazard of live.hazards)if(!obstacles.some(o=>o.hazard.id===hazard.id))addHazard(hazard,flameGeometry);plan.hazards=obstacles.map(o=>o.hazard);plan.falls=live.players.map(p=>p.fallAt??Infinity);plan.causes=live.players.map((p,i)=>p.alive?null:plan.causes[i]??plan.hazards.find(h=>{const hp=hazardPose(h,p.fallAt);return hp.active&&touches(hp,p);})?.id??null);}
  const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height)return;if(w!==bounds.width||h!==bounds.height){w=bounds.width;h=bounds.height;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const time=elapsed<0?0:Math.min(elapsed,plan.finish),impact=plan.falls.some(f=>elapsed>=f&&elapsed-f<300),shake=impact&&!reduced?Math.sin(elapsed/19)*.12:0;
  pieces.forEach((p,i)=>{const actor=live?.players[i],pose=actor?{...actor,dead:!actor.alive,lives:actor.alive?1:0,hitAge:actor.stunStartedAt!=null?Math.max(0,(elapsed-actor.stunStartedAt)/1000):Infinity,moving:!!p.lastLive&&(Math.abs(actor.x-p.lastLive.x)+Math.abs(actor.z-p.lastLive.z)>.001)}:survivalPose(plan,i,elapsed);p.lastLive=actor?{x:actor.x,z:actor.z}:null;const age=Math.max(0,(elapsed-plan.falls[i])/1000);p.crown.visible=elapsed>plan.finish+650&&i===plan.winner;p.crown.rotation.y=elapsed/800;p.root.position.set(pose.x,floorY(pose.z)+(actor?.y||0),pose.z);p.root.visible=!pose.dead||age<.65;p.body.rotation.set(0,pose.heading,0);p.body.scale.set(1,1,1);p.body.position.y=!reduced&&pose.moving?Math.abs(Math.sin(time/75+i))*.10:0;p.tag.visible=!pose.dead;p.hearts.forEach((heart,k)=>heart.material.color.setHex(k<pose.lives?0xff637c:0x9bacc2));if(pose.hitAge<.5&&!pose.dead&&!reduced)p.body.rotation.z=Math.sin(pose.hitAge*28)*.18;
   p.feet.forEach((foot,j)=>foot.position.z=pose.moving?Math.sin(time/75+j*Math.PI)*.14:0);
   if(pose.dead){if(mode==='crush'){const axis=plan.hazards.find(h=>h.id===plan.causes[i])?.axis||'x';p.body.rotation.y=0;p.body.scale[axis]=Math.max(.04,1-age*7);p.body.scale[axis==='x'?'z':'x']=1+Math.min(.3,age);}else if(mode==='boulder'){p.root.position.y-=age*age*12;p.body.rotation.z=age*5;}else{p.root.position.y+=Math.sin(Math.min(1,age/.65)*Math.PI)*1.1;p.body.rotation.z=age*6;p.body.scale.setScalar(Math.max(.05,1-age/1));}}
   p.burst.visible=pose.dead&&age<.75&&!reduced;p.burst.position.set(pose.x,floorY(pose.z)+.6,pose.z);p.burst.children.forEach((b,n)=>{const a=n/7*Math.PI*2;b.position.set(Math.cos(a)*age*3,Math.sin(age*4)*.6,Math.sin(a)*age*3);b.material.opacity=Math.max(0,1-age/.75);});
  });
  obstacles.forEach(({root,warning,lane,hazard,ignition})=>{const hp=hazardPose(hazard,time);if(ignition)ignition.visible=elapsed>=0&&hp.active&&hp.heat<.25;root.visible=elapsed>=0&&(hp.active||(hazard.kind==='wall'&&hp.warning));warning.visible=elapsed>=0&&(hp.warning||hazard.kind==='tile'&&hp.active&&hp.heat<1);root.position.set(hp.x,floorY(hp.z),hp.z);if(hazard.kind==='wall'){root.rotation.y=hazard.axis==='z'?Math.PI/2:0;root.scale.x=(hazard.axis==='z'?hp.rz:hp.rx)*2;}if(hazard.kind==='tile'){root.scale.x=hp.rx/hazard.rx;root.scale.z=hp.rz/hazard.rz;root.scale.y=.45+.55*(hp.heat||0);root.children.slice(0,5).forEach((o,n)=>{o.scale.y=1+Math.sin(time/75+n)*.18;o.rotation.y=Math.sin(time/220+n)*.4;});root.children.slice(6).forEach((o,n)=>o.position.y=((time/500+n*.24)%2.3));}if(mode==='boulder')root.children[0].rotation.x=(time-hazard.start)/1000*hazard.vz/hazard.rx;if(warning.visible)lane.material.opacity=.3+(reduced?0:Math.sin(time/110)**2*.25);});
  const distance=w/h<1.25?30:mode==='fire'?19:23;const mine=live&&localMemberId?entries.findIndex(e=>e.controllerId===localMemberId):-1,controlled=mine>=0&&live.players[mine]?.alive;camera.position.set(controlled?0:(mode==='fire'?7:mode==='crush'?10:2),distance*(mode==='fire'?.86:.72),distance*(mode==='crush'?.7:.85));camera.lookAt(0,.3,0);focusContestant(scene,pieces,mine>=0&&live.players[mine]?.alive?mine:-1,{local:true,distance:18,y:mine>=0?floorY(live.players[mine].z)+.9:.9});scene.userData.overview=!controlled;if(!controlled)fitOverview(camera,[],[0,.3,0],mode==='fire'?[[-7.1,-.3,-7.1],[7.1,4.5,7.1]]:[[-8,-.3,-9],[8,5,9]]);scene.userData.spectatorFinale=true;scene.userData.finale={finish:plan.finish,root:pieces[plan.winner]?.root};finishRender.render([signature,w,h,elapsed,reduced,liveSnapshot?frameTime:null].join(':'),elapsed,reduced);
 },dispose(){world.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});finishRender.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
