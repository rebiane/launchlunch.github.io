import {kitchenSet} from './kitchen-set.js';
import {fitOverview,focusContestant,studio,RoundedBoxGeometry,grainTexture,roundedBox} from './studio.js';
import {chef,COLORS,trophy} from './art.js';
import * as T from './vendor/three.module.js';
import {bookPlan,bookPose,bookPage,bookAngle,holeOutline,insideHole,headroom,BOOK_CHARACTER_HEIGHT,BOOK_CHARACTER_RADIUS,BOOK_MOVE_SPEED} from './book-motion.js';
export function createBookRenderer(container){
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 container.replaceChildren(renderer.domElement);renderer.domElement.setAttribute('aria-label','쿵! 메뉴북: 사각형 책 위에서 달려오는 책장의 구멍으로 피하는 서바이벌 게임');
 const scene=new T.Scene();scene.background=new T.Color(0x183e43);scene.fog=new T.Fog(0x183e43,45,90);const camera=new T.PerspectiveCamera(38,1,.1,100);scene.add(new T.HemisphereLight(0xffffff,0x142e49,1.25));const sun=new T.DirectionalLight(0xfff0d7,2.5);sun.position.set(-8,17,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12});sun.shadow.bias=-.001;scene.add(sun);
 const finishRender=studio(renderer,scene,camera);
 const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.48,...extra});
 const mesh=(g,m,parent=scene,x=0,y=0,z=0)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
 const box=(x,y,z,c,parent=scene,px=0,py=0,pz=0)=>mesh(roundedBox(x,y,z),mat(c),parent,px,py,pz);
 const ball=(r,c,parent,x=0,y=0,z=0)=>mesh(new T.SphereGeometry(r,16,12),mat(c),parent,x,y,z);
 const wood=grainTexture('wood'),paperGrain=grainTexture('paper');
 kitchenSet(scene);
 const floor=mesh(new T.PlaneGeometry(120,120),mat(0x183e43),scene,0,-3.1,0);floor.rotation.x=-Math.PI/2;
 const desk=box(30,.7,23,0xf2ebdc,scene,0,-1.3,-1.5);desk.material.map=wood;desk.material.roughness=.76;
 box(16,.5,12,0x164d48,scene,0,-.85,0);box(15.4,.7,11.5,0xffefcb,scene,0,-.27,0);box(15.7,.13,11.8,0x276d60,scene,0,.14,0);
 box(14.7,.14,10.8,0xfff6df,scene,0,.27,0);box(.14,.16,10.8,0xddc799,scene,0,.3,0);
 for(let i=0;i<5;i++)box(15.2,.025,11.4,0xddcba7,scene,0,-.57+i*.12,0);
 const spine=mesh(new T.CylinderGeometry(.55,.55,15.8,24),mat(0xf3a313),scene,0,.18,-5.6);spine.rotation.z=Math.PI/2;
 // Oversized kitchen stationery makes the stage read as a tabletop set.
 const cards=new T.Group();cards.position.set(-10,-.83,-3.5);cards.rotation.y=.2;scene.add(cards);
 for(let i=0;i<4;i++){const card=box(3,.05,4.2,i===3?0xf1d782:0xf5ebd5,cards,i*.07,i*.06,0);card.rotation.y=i*.035;}
 for(let i=0;i<4;i++)box(1.8,.025,.07,0xbca575,cards,-.15,.23,-1.3+i*.45);
 const bowl=new T.Group();bowl.position.set(9,-.8,-6);scene.add(bowl);
 for(let i=0;i<3;i++){const dish=mesh(new T.CylinderGeometry(1.6,1.1,.25,48),mat(0xf1e9d5,{roughness:.22}),bowl,0,i*.2,0);mesh(new T.TorusGeometry(1.52,.07,12,48),mat(0x438177),bowl,0,i*.2+.13,0).rotation.x=Math.PI/2;}
 const pin=new T.Group();pin.position.set(-2,-.45,-8);pin.rotation.z=Math.PI/2;scene.add(pin);mesh(new T.CylinderGeometry(.42,.42,6,32),mat(0xbf864a,{map:wood,roughness:.7}),pin);for(const y of [-3.4,3.4])mesh(new T.CylinderGeometry(.15,.19,.9,20),mat(0x835537),pin,0,y,0);
 const pencil=new T.Group();pencil.position.set(9,-.7,0);pencil.rotation.y=-.18;scene.add(pencil);box(.65,.65,7,0xffc954,pencil);mesh(new T.ConeGeometry(.42,1,6),mat(0xedc59b),pencil,0,0,-4).rotation.x=-Math.PI/2;
 const pageGroup=new T.Group();pageGroup.position.set(0,.52,-5.05);scene.add(pageGroup);let paper,marks=[],pageRound=-1;
 let pieces=[],signature='',plan,w=0,h=0,lost=false;
 const palette=COLORS;
 function buildPage(seed,round,liveHoles=null){
  if(paper){paper.geometry.dispose();paper.material.dispose();pageGroup.remove(paper);}for(const m of marks){m.geometry.dispose();m.material.dispose();scene.remove(m);}marks=[];
  const shape=new T.Shape();shape.moveTo(-7.2,0);shape.lineTo(7.2,0);shape.lineTo(7.2,10.1);shape.lineTo(-7.2,10.1);shape.closePath();
  (liveHoles||plan.rounds[round].holes).forEach((h,i)=>{
   const points=holeOutline(h),hole=new T.Path();points.forEach(([x,z],j)=>j?hole.lineTo(h.x+x,h.z+5.05+z):hole.moveTo(h.x+x,h.z+5.05+z));hole.closePath();shape.holes.push(hole);
   // Printed inlays make every safe opening legible without suggesting assigned seats.
   const footprint=new T.Shape();points.forEach(([x,z],j)=>j?footprint.lineTo(x,z):footprint.moveTo(x,z));footprint.closePath();
   const fill=mesh(new T.ShapeGeometry(footprint),mat(0x8ccab2,{side:T.DoubleSide,roughness:.9,map:paperGrain}),scene,h.x,.385,h.z);fill.rotation.x=-Math.PI/2;fill.castShadow=false;marks.push(fill);
   const outline=footprint.clone(),inside=new T.Path();points.forEach(([x,z],j)=>j?inside.lineTo(x*.92,z*.92):inside.moveTo(x*.92,z*.92));inside.closePath();outline.holes.push(inside);
   const ring=mesh(new T.ShapeGeometry(outline),mat(0x236857,{side:T.DoubleSide,roughness:.85}),scene,h.x,.4,h.z);ring.rotation.x=-Math.PI/2;ring.castShadow=false;marks.push(ring);
  });
  paper=mesh(new T.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:true,bevelSegments:2,bevelSize:.025,bevelThickness:.02,curveSegments:32}),mat([0xefc24c,0x53ad91,0xe98568,0x609fb1][round%4],{side:T.DoubleSide,map:paperGrain,roughness:.83}),pageGroup);
 }
 const group=new T.Group();scene.add(group);
 function build(entries,seed,direct=false){group.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});group.clear();pieces=[];plan=direct?null:bookPlan(seed,entries.length,entries.map(e=>e.picks||0));container.dataset.characterCount=String(entries.length);pageRound=-1;
  entries.forEach((e,i)=>{const root=new T.Group();group.add(root);const body=new T.Group();root.add(body);const {feet}=chef(body,palette[i%12]);const crown=trophy(root);
   const c=document.createElement('canvas');c.width=512;c.height=120;const ctx=c.getContext('2d');ctx.fillStyle='#10243ff2';ctx.beginPath();ctx.roundRect(2,2,508,116,32);ctx.fill();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffffff';ctx.font='800 58px -apple-system,sans-serif';ctx.fillText(e.name.length>8?e.name.slice(0,7)+'…':e.name,256,63,470);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const tag=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:false,toneMapped:false}));tag.position.y=2.4;tag.scale.set(2.5,.59,1);tag.userData.nameLabel=true;root.add(tag);
   const puff=new T.Group();group.add(puff);puff.visible=false;for(let k=0;k<5;k++){const dust=ball(.16,0xfff8dc,puff);dust.material.transparent=true;}const warning=mesh(new T.TorusGeometry(.64,.055,8,28),mat(0xff665c,{transparent:true,opacity:.9}),root,0,.04,0);warning.rotation.x=Math.PI/2;warning.visible=false;
   pieces.push({root,body,tag,puff,warning,feet,crown});
  });
 }
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;container.dataset.failed='true';});renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;delete container.dataset.failed;});
 return {render({entries,seed=1,elapsed=-1,reduced=false,liveSnapshot=null,localMemberId=null,raceId=null}){
 const frameTime=elapsed;
  const key=(liveSnapshot?'live:':'auto:')+seed+':'+raceId+':'+entries.map(e=>e.id+e.name).join('|');if(key!==signature){signature=key;build(entries,seed,Boolean(liveSnapshot));}
  const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height||lost)return;if(w!==bounds.width||h!==bounds.height){w=bounds.width;h=bounds.height;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const live=liveSnapshot;if(live){elapsed=live.finished?Math.max(elapsed,live.time):live.time;plan={finish:live.finished?live.time:Infinity,winner:live.winner};}
  const time=Math.max(0,elapsed),page=live?{...live.book,angle:bookAngle(live.book,Math.min(time,plan.finish)),impact:time>=live.book.deadline&&time-live.book.deadline<300,impactAge:(time-live.book.deadline)/1000}:bookPage(plan,Math.min(elapsed,plan.finish));
  const nextPage=live?JSON.stringify(page.holes):page.round;if(nextPage!==pageRound){pageRound=nextPage;buildPage(seed,page.round,live?page.holes:undefined);}
  pageGroup.rotation.x=elapsed<0?.12:page.angle;
  pieces.forEach((p,i)=>{
   const actor=live?.players[i];let pose;if(actor){const moved=p.lastActor&&Math.hypot(actor.x-p.lastActor.x,actor.z-p.lastActor.z)>.0001;if(moved)p.walkUntil=time+90;const dead=!actor.alive,age=dead?Math.max(0,(time-actor.fallAt)/1000):0;pose={...actor,dead,deathAge:age,moving:!dead&&!live.finished&&time<(p.walkUntil||0),speed:BOOK_MOVE_SPEED,crushing:dead,crush:dead?Math.max(0,Math.min(1,headroom({hit:p.deathDeadline??=page.deadline},time,actor.z)/BOOK_CHARACTER_HEIGHT)):1,danger:!dead&&time>page.deadline-900&&!page.holes.some(h=>insideHole(h,actor.x,actor.z,BOOK_CHARACTER_RADIUS))};p.lastActor={x:actor.x,z:actor.z};}else pose=bookPose(plan,i,elapsed);const age=pose.deathAge;
   p.root.position.set(pose.x,.38,pose.z);p.root.visible=!pose.dead||age<.7;
   const stride=!reduced&&pose.moving?Math.sin(time/65+i):0;
   p.crown.visible=elapsed>plan.finish+500&&i===plan.winner;p.crown.rotation.y=time/800;p.feet.forEach((f,j)=>f.position.z=.1+Math.sin(time/65+j*Math.PI)*(pose.moving?.16:0));p.body.rotation.set(0,pose.heading,stride*.07);p.body.position.y=(actor?.y||0)+Math.abs(stride)*Math.min(.13,pose.speed*.025);
   const squash=Math.max(.035,pose.crush);p.body.scale.set(1+(1-squash)*.25,squash,1+(1-squash)*.25);
   p.warning.material.color.set(0xff665c);p.warning.visible=pose.danger&&!pose.crushing;p.warning.material.opacity=.55+Math.sin(time/75)*.35;
   p.tag.visible=!pose.crushing;p.tag.position.y=2.4+(i%3)*.16+(actor?.y||0);
   p.puff.visible=pose.dead&&age<.65&&!reduced;p.puff.position.set(pose.x,.5,pose.z);
   if(p.puff.visible)p.puff.children.forEach((dust,k)=>{const a=k/5*Math.PI*2;dust.position.set(Math.cos(a)*age*3,Math.sin(age*Math.PI*2)*.25,Math.sin(a)*age*3);dust.scale.setScalar(1+age*1.5);dust.material.opacity=Math.max(0,1-age/.65);});
  });
  const distance=w/h<1.25?34:26,shake=!reduced&&page.impact?Math.sin(page.impactAge*70)*.13*(1-page.impactAge/.18):0;
  const mine=live&&localMemberId?entries.findIndex(e=>e.controllerId===localMemberId):-1,controlled=mine>=0&&live.players[mine]?.alive;camera.position.set(controlled?0:distance*.18,distance*.69,distance*.87);camera.lookAt(0,4.0,0);focusContestant(scene,pieces,mine>=0&&live.players[mine]?.alive?mine:-1,{local:true,anchor:[0,4,0],distance:20,y:1.1});scene.userData.overview=!controlled;if(!controlled)fitOverview(camera,[],[0,4,0],[[-8,-.3,-6],[8,10,6]]);scene.userData.spectatorFinale=true;scene.userData.finale={finish:plan.finish,root:pieces[plan.winner]?.root};finishRender.render([signature,w,h,elapsed,reduced,liveSnapshot?frameTime:null].join(':'),elapsed,reduced);
 },dispose(){scene.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});finishRender.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
