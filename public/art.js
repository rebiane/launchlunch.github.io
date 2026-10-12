import * as T from './vendor/three.module.js';
import {RoundedBoxGeometry} from './vendor/addons/geometries/RoundedBoxGeometry.js';
import {COLORS} from './palette.js';export {COLORS};
let weave;
function clothTexture(){if(weave)return weave;const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#858585';ctx.fillRect(0,0,64,64);for(let i=0;i<64;i+=4){ctx.fillStyle='#a0a0a0';ctx.fillRect(i,0,1,64);ctx.fillStyle='#707070';ctx.fillRect(0,i,64,1);}weave=new T.CanvasTexture(c);weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.repeat.set(5,5);return weave;}
export function chef(body,color,activity='run'){
 const variant=Math.max(0,COLORS.indexOf(color)),skin=[0xffd0a0,0xe2a574,0xf2bf91,0xb87951][variant%4],hair=[0x4b2920,0x241e24,0x945128,0x6a3825][variant%4];
 const materials=new Map();const material=(c,r=.52)=>{const key=c+':'+r;if(!materials.has(key))materials.set(key,new T.MeshPhysicalMaterial({color:c,roughness:r,clearcoat:r<.5?.25:0,clearcoatRoughness:.3,...(r>=.7?{bumpMap:clothTexture(),bumpScale:.008,sheen:.22,sheenColor:new T.Color(0xffffff),sheenRoughness:.8}:{})}));return materials.get(key);};
 function part(geo,c,x,y,z,r=.52,parent=body){const o=new T.Mesh(geo,material(c,r));o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 const sphere=(radius,c,x,y,z,r=.52,parent=body)=>part(new T.SphereGeometry(radius,32,24),c,x,y,z,r,parent);
 const torso=part(new T.CapsuleGeometry(.33,.28,10,24),color,0,.57,0,.72);torso.scale.z=.84;
 const apron=part(new RoundedBoxGeometry(.44,.44,.085,3,.045),0xfff3d9,0,.54,.275,.88);
 part(new RoundedBoxGeometry(.23,.15,.035,2,.025),color,0,.41,.326,.8);
 for(const x of [-.14,.14])part(new RoundedBoxGeometry(.045,.31,.035,2,.015),0xfff3d9,x,.77,.255,.85).rotation.z=x>0?-.15:.15;
 for(const x of [-.07,.07])sphere(.025,0xd89d32,x,.69,.325,.28);
 // A folded neckerchief and stitched pocket give the silhouette a clear chef identity.
 const scarf=part(new T.ConeGeometry(.13,.23,3),0xfff7e6,0,.79,.305,.8);scarf.rotation.z=Math.PI;scarf.scale.z=.25;
 sphere(.055,color,0,.84,.335,.8);
 for(const x of [-.098,.098])for(let k=0;k<5;k++)part(new RoundedBoxGeometry(.012,.012,.006,1,.002),0xfff4d4,x,.37+k*.019,.348,.8);
 const headGroup=new T.Group();body.add(headGroup);headGroup.position.y=1.055;
 const head=part(new T.SphereGeometry(.395,40,32),skin,0,0,.015,.57,headGroup);head.scale.set(1,.94,.91);
 // Hair is a fitted scalp with a curved fringe, rather than a separate ball.
 const scalp=part(new T.SphereGeometry(.398,40,24,0,Math.PI*2,0,Math.PI*.4),hair,0,.012,-.018,.75,headGroup);scalp.rotation.x=0;part(new T.SphereGeometry(.399,32,20,Math.PI,Math.PI,Math.PI*.35,Math.PI*.38),hair,0,.012,-.018,.75,headGroup);
 for(let n=0;n<4;n++){const curl=sphere(.105,hair,-.23+n*.145,.255,.232,.72,headGroup);curl.scale.set(1.05,.5,.7);curl.rotation.z=(n-1.5)*.22;}
 const eyes=[];
 for(const side of [-1,1]){const x=side*.145,eyeGroup=new T.Group();eyeGroup.position.set(x,.018,.335);headGroup.add(eyeGroup);const white=sphere(.086,0xfffdf3,0,0,0,.25,eyeGroup);white.scale.set(.83,1.2,.40);const iris=sphere(.055,variant%2?0x3d5c60:0x60422d,0,-.005,.03,.22,eyeGroup);iris.scale.set(.83,1.16,.38);const pupil=sphere(.036,0x142331,0,-.003,.048,.13,eyeGroup);pupil.scale.set(.84,1.1,.36);sphere(.016,0xffffff,-.017,.025,.058,.16,eyeGroup);sphere(.008,0xffffff,.018,-.019,.06,.16,eyeGroup);eyes.push(eyeGroup);
 const cheek=sphere(.072,0xf38f7c,side*.25,-.105,.287,.69,headGroup);cheek.scale.set(1,.5,.16);
 const brow=part(new T.CapsuleGeometry(.018,.085,5,12),hair,x,.155,.317,.72,headGroup);brow.rotation.z=side>0?1.39:-1.39;
 const ear=sphere(.065,skin,side*.373,-.022,0,.6,headGroup);ear.scale.set(.65,1,.7);sphere(.028,0xd28a65,side*.402,-.025,.013,.7,headGroup);
 }
 const nose=sphere(.064,skin,0,-.065,.365,.5,headGroup);nose.scale.set(.85,.8,1);
 const smile=part(new T.TorusGeometry(.081,.018,10,24,Math.PI),0x703827,0,-.155,.321,.68,headGroup);smile.rotation.z=Math.PI;smile.scale.y=.58;
 if(variant%4===1){for(const side of [-1,1]){const moustache=sphere(.069,hair,side*.055,-.112,.352,.78,headGroup);moustache.scale.set(1.2,.36,.27);moustache.rotation.z=side*.2;}}
 if(variant%4===2){for(const side of [-1,1])part(new T.TorusGeometry(.096,.012,8,32),0x705327,side*.145,.018,.378,.34,headGroup);part(new T.CapsuleGeometry(.01,.075,4,10),0x705327,0,.025,.382,.34,headGroup).rotation.z=Math.PI/2;}
 // A single sculpted, five-lobed toque with a rolled band and stitched edge.
 part(new T.CylinderGeometry(.348,.355,.13,48),0xfff9e9,0,1.39,0,.84);
 part(new T.CylinderGeometry(.353,.36,.048,48),color,0,1.355,0,.8);
 const profile=[[.32,0],[.365,.035],[.415,.12],[.422,.23],[.365,.33],[.23,.385],[0,.40]].map(([r,y])=>new T.Vector2(r,y));
 const hatGeo=new T.LatheGeometry(profile,64),vertices=hatGeo.attributes.position;
 for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),z=vertices.getZ(i),y=vertices.getY(i),a=Math.atan2(x,z),fold=1+.065*Math.cos(a*5)*Math.sin(y/.4*Math.PI);vertices.setXYZ(i,x*fold,y+.012*Math.cos(a*5)*Math.sin(y/.4*Math.PI),z*fold);}hatGeo.computeVertexNormals();
 const hat=part(hatGeo,0xfffcf2,0,1.44,0,.87);hat.rotation.z=(variant%3-1)*.055;
 const badge=part(new T.SphereGeometry(.046,16,12),color,0,1.4,.354,.6);badge.scale.z=.22;
 const hands=[-1,1].map(side=>{const arm=new T.Group();body.add(arm);arm.position.set(side*.37,.64,.035);part(new T.CapsuleGeometry(.10,.12,8,16),color,0,-.03,0,.7,arm).rotation.z=side*.32;sphere(.105,0xfff3dc,side*.025,-.15,.015,.65,arm);sphere(.113,skin,side*.035,-.21,.035,.43,arm);sphere(.05,skin,-side*.04,-.2,.09,.43,arm);return arm;});
 const feet=[-.17,.17].map(x=>{const leg=new T.Group();body.add(leg);leg.position.set(x,.13,.06);part(new T.CapsuleGeometry(.12,.11,6,16),0x243c55,0,.13,-.02,.8,leg);const boot=part(new RoundedBoxGeometry(.25,.19,.38,4,.09),0x172d44,0,0,.045,.4,leg);part(new RoundedBoxGeometry(.25,.045,.39,3,.02),0xe5e7df,0,-.08,.045,.8,leg);return leg;});
 body.userData.chefRig={hands,feet,eyes,head:headGroup,activity,variant,last:null,phase:variant*.7};
 return {hands,feet};
}
export function trophy(root,{dizzy=false}={}){
 const group=new T.Group();root.add(group);
 const ring=new T.Mesh(new T.TorusGeometry(.68,.045,10,48),new T.MeshBasicMaterial({color:0xffda36}));ring.rotation.x=-Math.PI/2;ring.position.y=.06;group.add(ring);
 if(dizzy){for(let i=0;i<5;i++){const star=new T.Mesh(new T.OctahedronGeometry(.11),new T.MeshBasicMaterial({color:0xffe878}));star.position.set(Math.cos(i*1.256)*.85,2,Math.sin(i*1.256)*.85);group.add(star);}}
 else{
  const crown=new T.Group();crown.position.y=2.04;group.add(crown);group.userData.winnerCrown=crown;
  const gold=new T.MeshStandardMaterial({color:0xffc52f,metalness:.72,roughness:.25,emissive:0x8c4200,emissiveIntensity:.09});
  const band=new T.Mesh(new T.CylinderGeometry(.355,.32,.14,40,1,true),gold);band.position.y=.07;band.castShadow=true;crown.add(band);
  const rim=new T.Mesh(new T.TorusGeometry(.325,.035,12,48),gold);rim.rotation.x=Math.PI/2;crown.add(rim);
  // Five solid triangular points wrap the band; the crown stays open at the top.
  for(let i=0;i<5;i++){
   const a=i*Math.PI*2/5,points=[new T.Vector3(Math.sin(a-.55)*.355,.13,Math.cos(a-.55)*.355),new T.Vector3(Math.sin(a)*.405,.43,Math.cos(a)*.405),new T.Vector3(Math.sin(a+.55)*.355,.13,Math.cos(a+.55)*.355)],positions=[],indices=[];
   for(const radius of [1,.89])for(const p of points)positions.push(p.x*radius,p.y,p.z*radius);
   indices.push(0,2,1,3,4,5,0,3,4,0,4,1,1,4,5,1,5,2,2,5,3,2,3,0);
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const point=new T.Mesh(geometry,gold);point.castShadow=true;crown.add(point);
   const pearl=new T.Mesh(new T.SphereGeometry(.037,16,12),gold);pearl.position.copy(points[1]);crown.add(pearl);
   const jewel=new T.Mesh(new T.OctahedronGeometry(.052),new T.MeshStandardMaterial({color:i%2?0x20b9cc:0xe84037,metalness:.25,roughness:.12}));jewel.position.set(Math.sin(a)*.35,.085,Math.cos(a)*.35);jewel.rotation.y=a;crown.add(jewel);
  }
 }
 group.visible=false;return group;
}

export function animateChef(body,time,reduced=false){const rig=body.userData.chefRig;if(!rig)return;const root=body.parent,p=root.position,last=rig.last,dt=last?time-last.time:0,speed=last&&dt>0&&dt<250?Math.hypot(p.x-last.x,p.z-last.z)/(dt/1000):0;rig.last={x:p.x,z:p.z,time};const moving=speed>.05,phase=time/95+rig.phase,air=body.position.y>.25,walk=reduced?0:moving?Math.min(1,speed/3):0;
 rig.feet.forEach((foot,k)=>{const stride=Math.sin(phase+k*Math.PI);foot.rotation.x=air?-.35:stride*walk*.45;foot.rotation.z=(k?1:-1)*.025;});
 rig.hands.forEach((hand,k)=>{hand.rotation.x=rig.activity==='tricycle'?-.72:rig.activity==='climb'?-1.25:hand.position.y>.85?-.65:air?-.6:Math.sin(phase+k*Math.PI+Math.PI)*walk*.6;hand.rotation.z=(k?1:-1)*(.12+(air?.3:0));});
 if(body.userData.victorious){rig.hands.forEach((hand,k)=>{hand.position.y=.85;hand.rotation.z=(k?1:-1)*(.8+(reduced?0:Math.sin(time/160+k)*.15));hand.rotation.x=-.35;});}
 rig.head.rotation.z=reduced?0:Math.sin(time/450+rig.variant)*.018;rig.head.rotation.y=reduced?0:Math.sin(time/1700+rig.variant)*.055;
 const blink=(time+rig.variant*317)%3900,closed=!reduced&&blink>3700?Math.max(.09,Math.abs(blink-3800)/100):1;for(const eye of rig.eyes)eye.scale.y=closed;
}
