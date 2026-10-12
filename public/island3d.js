import {tropicalSet} from './tropical-set.js';
import {fitOverview,focusContestant,studio,RoundedBoxGeometry,grainTexture,roundedBox,waterNormals} from './studio.js';
import {chef,COLORS,trophy} from './art.js';
import * as T from './vendor/three.module.js';
import {islandSimulation,spinnerAngle,jumpHeight,jumpPose,runnerAngle,runnerPosition,knockbackPosition,knockbackFrom,poseForJump,pickSpeed} from './race.js';
const palette=COLORS;
export function createIslandRenderer(container){
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  container.replaceChildren(renderer.domElement);renderer.domElement.setAttribute('aria-label','점프 파티 3D: 가속하는 회전 바 3개를 음식 캐릭터가 자동 점프로 피합니다. 마지막 생존 식당이 우승합니다.');
  const scene=new T.Scene();scene.background=new T.Color(0x076785);scene.fog=new T.Fog(0x076785,40,80);
  const camera=new T.PerspectiveCamera(36,1,.1,100);scene.add(new T.HemisphereLight(0xffffff,0x142e49,1.25));
  const sun=new T.DirectionalLight(0xfff4dc,2.5);sun.position.set(-9,17,11);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12});sun.shadow.bias=-.001;scene.add(sun);
  const finishRender=studio(renderer,scene,camera);
  const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.48,...extra});
  function mesh(g,m,parent=scene,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  const ball=(r,c,parent,x=0,y=0,z=0)=>mesh(new T.SphereGeometry(r,16,12),mat(c),parent,x,y,z);
  const ripples=[];for(let i=0;i<12;i++){const a=i*2.4;const ring=mesh(new T.TorusGeometry(1.2,.025,6,48),mat(0x42bfc4,{transparent:true,opacity:.35}),scene,Math.sin(a)*(10+i*.6),-2.32,Math.cos(a)*(10+i*.6));ring.rotation.x=Math.PI/2;ripples.push(ring);}
  const water=mesh(new T.PlaneGeometry(150,150),mat(0x007790,{roughness:.55,metalness:0,envMapIntensity:.2,normalMap:waterNormals(),normalScale:new T.Vector2(.09,.09)}),scene,0,-2.4,0);water.rotation.x=-Math.PI/2;
  mesh(new T.CylinderGeometry(7.45,7.15,.85,80),mat(0x264bab),scene,0,-.38,0);
  mesh(new T.CylinderGeometry(7.5,7.5,.13,80),mat(0xffd85a),scene,0,.07,0);
  mesh(new T.CylinderGeometry(6.94,6.94,.16,80),mat(0x218d80,{roughness:.85}),scene,0,.14,0);
  // Segment seams, brass fasteners and padded bumpers make the platform a built object.
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const seam=mesh(new T.BoxGeometry(.025,.014,5.5),mat(0x16695f),scene,Math.sin(a)*3.8,.227,Math.cos(a)*3.8);seam.rotation.y=a;const bolt=mesh(new T.CylinderGeometry(.07,.07,.045,6),mat(0xd6ba71,{metalness:.6,roughness:.28}),scene,Math.sin(a)*6.55,.25,Math.cos(a)*6.55);}
  const ring=mesh(new T.TorusGeometry(6.82,.07,6,100),mat(0xf9ffff),scene,0,.23,0);ring.rotation.x=Math.PI/2;
  for(let i=0;i<36;i++){const a=i/36*Math.PI*2;const p=mesh(new T.BoxGeometry(.37,.027,.25),mat(i%2?0xfff8d8:0xf9a26d),scene,Math.sin(a)*7.22,.15,Math.cos(a)*7.22);p.rotation.y=a;}
  // Three cushioned arms rotate together around a central motor.
  const rotor=new T.Group();scene.add(rotor);
  mesh(new T.CylinderGeometry(.78,.95,.7,32),mat(0x216881,{metalness:.3,roughness:.32}),scene,0,.53,0);
  mesh(new T.CylinderGeometry(.64,.64,.3,32),mat(0xffd857),rotor,0,1.02,0);
  const cap=ball(.6,0xfff4ba,rotor,0,1.24,0);cap.scale.y=.35;
  for(let i=0;i<3;i++){
    const arm=new T.Group();arm.rotation.y=i*Math.PI*2/3;rotor.add(arm);
    const beam=mesh(new T.CylinderGeometry(.2,.2,6.6,12),mat([0xff394f,0x8947ed,0x168eef][i]),arm,0,.72,3.5);beam.rotation.x=Math.PI/2;
    for(let k=0;k<7;k++){const stripe=mesh(new T.CylinderGeometry(.208,.208,.2,12),mat(0xfff1c5),arm,0,.72,.7+k*.92);stripe.rotation.x=Math.PI/2;}
    ball(.29,0xffd44e,arm,0,.72,6.8);
  }
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;mesh(new T.SphereGeometry(.055,12,8),mat(0xffd26c,{emissive:0xff9d22,emissiveIntensity:.45}),rotor,Math.sin(a)*.62,1.17,Math.cos(a)*.62);}
  const clouds=[];for(let i=0;i<7;i++){const g=new T.Group();g.position.set(-16+i*5,3+i%3,-12-(i%2)*2);scene.add(g);for(let j=0;j<3;j++){const b=ball(.8,0xffffff,g,(j-1)*.8,j===1?.2:0,0);b.castShadow=false;}clouds.push(g);}
  tropicalSet(scene);
  const group=new T.Group();scene.add(group);let signature='',pieces=[],falls=[],outcome=null,w=0,h=0,lost=false;
  function disposeGroup(){group.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});group.clear();}
  function label(text){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#10243ff2';ctx.beginPath();ctx.roundRect(3,3,506,122,35);ctx.fill();ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='800 60px -apple-system,sans-serif';ctx.fillText(text.length>9?text.slice(0,8)+'…':text,256,67,470);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,toneMapped:false}));sprite.scale.set(2.65,.66,1);sprite.userData.nameLabel=true;return sprite;}
  function build(entries,seed,direct=false){disposeGroup();pieces=[];container.dataset.characterCount=String(entries.length);outcome=direct?null:islandSimulation(seed,entries.length,entries.map(e=>e.picks||0));falls=outcome?.falls||[];entries.forEach((entry,i)=>{
    const angle=i/entries.length*Math.PI*2,radius=5.25;
    const root=new T.Group();root.position.set(Math.sin(angle)*radius,.23,Math.cos(angle)*radius);group.add(root);
    const body=new T.Group();root.add(body);
    const {hands,feet}=chef(body,palette[i%12]);const crown=trophy(root);
    const tag=label(entry.name);tag.position.set(0,2.45,0);root.add(tag);
    const splash=mesh(new T.TorusGeometry(.4,.045,6,30),mat(0xe6fcff,{transparent:true}),group,root.position.x,-2.33,root.position.z);splash.rotation.x=Math.PI/2;splash.visible=false;
    const spray=new T.Group();group.add(spray);for(let k=0;k<5;k++){const drop=ball(.12,0xe6fcff,spray);drop.material.transparent=true;}spray.visible=false;const localRing=mesh(new T.TorusGeometry(.64,.05,6,32),mat(0xffd13f),root,0,.05,0);localRing.rotation.x=Math.PI/2;localRing.visible=false;pieces.push({root,body,tag,splash,spray,hands,feet,crown,localRing,angle,base:root.position.clone()});
  });}
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;container.dataset.failed='true';});renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;delete container.dataset.failed;});
  return {render({entries,seed=1,elapsed=-1,reduced=false,liveSnapshot=null,localMemberId=null,raceId=null}){
 const frameTime=elapsed;
    if(!reduced&&water.material.normalMap){water.material.normalMap.offset.set(elapsed/180000,elapsed/240000);}
    const key=(liveSnapshot?'live:':'auto:')+seed+':'+raceId+':'+entries.map(e=>e.id+e.name).join('|');if(key!==signature){signature=key;build(entries,seed,Boolean(liveSnapshot));}
    const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height||lost)return;if(w!==bounds.width||h!==bounds.height){w=bounds.width;h=bounds.height;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
    const live=liveSnapshot;if(live){elapsed=live.finished?Math.max(elapsed,live.time):live.time;falls=live.players.map(p=>p.fallAt??Infinity);}
    pieces.forEach((p,i)=>p.localRing.visible=Boolean(live&&live.players[i]?.alive&&entries[i].controllerId===localMemberId&&localMemberId));
    const finish=live?(live.finished?live.time:Infinity):outcome.finish,time=Math.max(0,Math.min(elapsed,finish)),controlled=Boolean(live&&localMemberId&&entries.some((e,i)=>e.controllerId===localMemberId&&live.players[i]?.alive)),orbit=0,yaw=controlled?0:.23,distance=w/h<1.25?30:23;
    camera.position.set(Math.sin(yaw+orbit)*distance,distance*.74,Math.cos(yaw+orbit)*distance);camera.lookAt(0,.1,0);rotor.rotation.y=spinnerAngle(seed,time);
    pieces.forEach((p,i)=>{
      p.crown.visible=elapsed>finish+750&&(i===(live?live.winner:outcome.winner));p.crown.rotation.y=elapsed/800;const fall=Math.max(0,(elapsed-falls[i])/1000),actor=live?.players[i],pos=actor?{...actor,angle:Math.atan2(actor.x,actor.z),radius:Math.hypot(actor.x,actor.z)}:runnerPosition(seed,i,entries.length,Math.min(time,falls[i]),pickSpeed(entries[i].picks)),angle=pos.angle,radius=pos.radius;p.root.position.set(pos.x,.23,pos.z);p.root.visible=fall<1.4;
      p.root.rotation.set(0,0,0);const next=actor||runnerPosition(seed,i,entries.length,Math.min(time+40,falls[i]),pickSpeed(entries[i].picks));p.body.rotation.y=actor?actor.heading:Math.atan2(next.x-pos.x,next.z-pos.z);p.body.rotation.z=reduced?0:Math.sin(time/90+i)*.06;
      if(fall){
        const hit=actor?knockbackFrom(pos,falls[i],elapsed):knockbackPosition(seed,i,entries.length,falls[i],elapsed,pickSpeed(entries[i].picks));
        p.root.position.set(hit.x,hit.y,hit.z);p.body.position.y=0;p.body.scale.set(1,1,1);p.root.visible=hit.waterAge<0;
        p.root.rotation.z=reduced?0:Math.min(1.2,fall*2.8);p.root.rotation.x=reduced?0:Math.sin(angle)*Math.min(.8,fall*2);
        p.tag.material.opacity=Math.max(0,1-fall*2.2);
        const splashAge=hit.waterAge;p.splash.visible=splashAge>=0&&splashAge<.65;
        if(p.splash.visible){p.splash.position.set(hit.x,-2.32,hit.z);p.splash.scale.setScalar(1+splashAge*4.5);p.splash.material.opacity=Math.max(0,1-splashAge/.65);}
        p.spray.visible=splashAge>=0&&splashAge<.5&&!reduced;
        if(p.spray.visible){p.spray.position.set(hit.x,-2.25,hit.z);p.spray.children.forEach((drop,k)=>{const a=k/5*Math.PI*2;drop.position.set(Math.cos(a)*splashAge*2.5,splashAge*4.5-splashAge*splashAge*9,Math.sin(a)*splashAge*2.5);drop.material.opacity=1-splashAge*2;});}
      }else{
        let moving=true;if(actor){const moved=p.lastActor&&Math.hypot(actor.x-p.lastActor.x,actor.z-p.lastActor.z)>.0001;if(moved)p.walkUntil=time+90;moving=!live.finished&&time<(p.walkUntil||0);p.lastActor={x:actor.x,z:actor.z};}const jump=actor?{...poseForJump({start:actor.poseJumpAt??actor.jumpAt},actor.poseTime??time),height:actor.y}:jumpPose(seed,i,entries.length,time,falls[i],entries.map(e=>e.picks||0)),stride=moving?Math.sin(time/100+i):0;
        p.body.position.y=jump.height+(reduced||jump.air?0:Math.abs(stride)*.055);p.body.scale.set(1/Math.sqrt(jump.scaleY),jump.scaleY,1/Math.sqrt(jump.scaleY));p.body.rotation.x=jump.air*.12;p.body.rotation.z=jump.air?0:reduced?0:stride*.06;
        p.hands.forEach((hand,k)=>{hand.position.y=.54+jump.tuck*.35;hand.position.z=.08+(jump.air?-.14:moving?Math.sin(time/100+i+k*Math.PI)*.13:0);});
        p.feet.forEach((foot,k)=>{const step=moving?Math.sin(time/100+i+k*Math.PI):0;foot.position.y=.13+jump.tuck*.24+(jump.air||reduced?0:Math.max(0,step)*.09);foot.position.z=.15-jump.tuck*.17+(jump.air||reduced?0:step*.13);});
        if(elapsed>finish&&i===(live?live.winner:outcome.winner)){p.body.position.y=Math.max(0,jump.height-(elapsed-finish)/250);p.body.scale.set(1,1,1);p.body.rotation.set(0,0,0);p.hands.forEach(h=>h.position.y=.9+Math.sin(elapsed/140)*.15);}p.tag.position.y=2.45+p.body.position.y;
        p.tag.material.opacity=1;p.splash.visible=false;p.spray.visible=false;
      }
    });ripples.forEach((r,i)=>{r.scale.setScalar(1+Math.sin(elapsed/1300+i)*.2);r.material.opacity=.2+Math.sin(elapsed/1300+i)*.1;});const mine=live&&localMemberId?entries.findIndex(e=>e.controllerId===localMemberId):-1;focusContestant(scene,pieces,mine>=0&&live.players[mine]?.alive?mine:-1,{local:true,anchor:[0,.1,0],distance:18,y:1});scene.userData.overview=!controlled;if(!controlled)fitOverview(camera,[],[0,.1,0],Array.from({length:48},(_,i)=>{const a=Math.floor(i/2)/24*Math.PI*2;return[Math.cos(a)*8.2,i%2?4.6:-.3,Math.sin(a)*8.2];}));scene.userData.spectatorFinale=true;scene.userData.finale={finish,root:pieces[live?live.winner:outcome.winner]?.root};finishRender.render([signature,w,h,elapsed,reduced,liveSnapshot?frameTime:null].join(':'),elapsed,reduced);
  },dispose(){disposeGroup();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});finishRender.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
