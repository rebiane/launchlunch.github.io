import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/addons/utils/BufferGeometryUtils.js';
import {roundedBox,waterNormals} from './studio.js';

// Original inflatable rivercraft. The deck is below the existing chef's hands;
// its bow points down -Z and the separate fan can rotate without rebuilding it.
export function createHovercraft(color=0xe95334){
 const root=new T.Group(),parts=[[],[],[]],materials=[new T.MeshPhysicalMaterial({vertexColors:true,roughness:.31,clearcoat:.7,clearcoatRoughness:.24}),new T.MeshStandardMaterial({vertexColors:true,metalness:.68,roughness:.26}),new T.MeshStandardMaterial({vertexColors:true,roughness:.82})];
 function add(geometry,c,category=0,x=0,y=0,z=0,rotation=null,scale=null){const transform=new T.Object3D();transform.position.set(x,y,z);if(rotation)transform.rotation.set(...rotation);if(scale)transform.scale.set(...scale);transform.updateMatrix();const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(transform.matrix);geometry.dispose();const rgb=new T.Color(c),colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3)rgb.toArray(colors,i);g.setAttribute('color',new T.BufferAttribute(colors,3));parts[category].push(g);}
 const box=(w,h,d,c,category,x,y,z,rotation)=>add(roundedBox(w,h,d),c,category,x,y,z,rotation);
 class Ellipse extends T.Curve{constructor(x,z){super();this.x=x;this.z=z;}getPoint(t,target=new T.Vector3()){const a=t*Math.PI*2;return target.set(Math.cos(a)*this.x,0,Math.sin(a)*this.z);}}
 const tube=(x,z,r,c,y,category=0)=>add(new T.TubeGeometry(new Ellipse(x,z),80,r,12,true),c,category,0,y,0);
 // Air cushion, broad rounded tubes and a fine perimeter grab rope.
 tube(.57,.82,.16,0x172a38,.12,2);tube(.60,.85,.19,color,.31);tube(.63,.88,.028,0xf7e9c7,.48);
 add(new T.CylinderGeometry(.59,.52,.18,48),0xebe1c4,0,0,.29,0,null,[1,1,1.48]);
 add(new T.SphereGeometry(.5,28,18),color,0,0,.46,-.65,null,[1.15,.30,.70]);
 // Contrasting fabric patches follow the rounded bow rather than forming a box.
 for(const x of [-.34,.34])box(.11,.025,.32,0xffe8a6,0,x,.58,-.65,[0,0,x<0?-.1:.1]);
 for(const side of [-1,1]){box(.13,.045,.20,0x142e42,2,side*.75,.35,-.2);box(.13,.045,.20,0x142e42,2,side*.75,.35,.48);box(.065,.24,.06,0xd4ddd9,1,side*.29,.72,-.37,[.15,0,0]);}
 // Low seat and a softly rounded handlebar leave the chef silhouette readable.
 box(.52,.12,.42,0x29445a,2,0,.39,.34);box(.57,.27,.12,0x29445a,2,0,.52,.56,[.12,0,0]);
 add(new T.CapsuleGeometry(.045,.59,5,16),0xdce4dd,1,0,.89,-.38,[0,0,Math.PI/2]);
 for(const side of [-1,1])add(new T.CapsuleGeometry(.058,.12,5,12),0x203b4e,2,side*.30,.89,-.38,[0,0,Math.PI/2]);
 // One rear duct with a protective cage and a separate four-bladed rotor.
 add(new T.TorusGeometry(.35,.075,12,48),0x193344,2,0,.83,.79);
 add(new T.TorusGeometry(.355,.025,10,48),0xebbd5d,1,0,.83,.88);
 for(const a of [0,Math.PI/4,Math.PI/2,-Math.PI/4])box(.70,.016,.02,0x768e94,1,0,.83,.91,[0,0,a]);
 for(const side of [-1,1])box(.09,.37,.1,0x546b72,1,side*.27,.51,.79,[0,0,side*.14]);
 add(new T.CylinderGeometry(.105,.105,.22,20),0xefbe56,1,0,.83,.82,[Math.PI/2,0,0]);
 parts.forEach((list,i)=>{const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,materials[i]);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);});
 const fan=new T.Group();fan.position.set(0,.83,.81);const bladeParts=[];for(let i=0;i<4;i++){const g=roundedBox(.095,.29,.025),transform=new T.Object3D();transform.rotation.z=i*Math.PI/2+.28;transform.position.set(Math.sin(-transform.rotation.z)*.16,Math.cos(transform.rotation.z)*.16,0);transform.updateMatrix();g.applyMatrix4(transform.matrix);bladeParts.push(g);}const bladeGeo=mergeGeometries(bladeParts);bladeParts.forEach(g=>g.dispose());fan.add(new T.Mesh(bladeGeo,new T.MeshStandardMaterial({color:0x8fa5aa,metalness:.55,roughness:.3})));root.add(fan);root.userData.fan=fan;return root;
}

export function createRiverWaterMaterial(){
 const normalMap=waterNormals();normalMap.repeat.set(6,76);normalMap.anisotropy=8;
 // Colour comes from the water volume, highlights from the environment and
 // the two-direction normal ripples; no painted straight lines scroll past.
 return new T.MeshPhysicalMaterial({color:0x078fc1,roughness:.28,metalness:.08,normalMap,normalScale:new T.Vector2(.20,.16),clearcoat:.4,clearcoatRoughness:.22,envMapIntensity:1.2});
}

// One transparent surface per boat: soft, broken foam along both wake arms.
export function createRiverWake(){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
 const ctx=canvas.getContext('2d'),image=ctx.createImageData(128,256);
 for(let y=0;y<256;y++)for(let x=0;x<128;x++){
  const v=y/255,u=(x/127-.5)*2,arm=.15+v*.63,width=.065+v*.10;
  const band=Math.exp(-2*((Math.abs(u)-arm)/width)**2);
  const churn=Math.exp(-2*(u/(.16+v*.10))**2)*Math.exp(-v*5)*.32;
  const noise=.48+.24*Math.sin(x*.57+Math.sin(y*.13)*3)*Math.sin(y*.41)+.18*Math.sin(x*1.7+y*1.13);
  const fade=Math.sin(Math.PI*v)**.7*(1-v*.65),i=(y*128+x)*4;
  image.data[i]=220;image.data[i+1]=250;image.data[i+2]=255;image.data[i+3]=Math.round(Math.min(1,(band+churn)*noise*fade)*220);
 }
 ctx.putImageData(image,0,0);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
 const wake=new T.Group(),foam=new T.Mesh(new T.PlaneGeometry(3,4),new T.MeshBasicMaterial({map,transparent:true,opacity:.8,depthWrite:false,side:T.DoubleSide,toneMapped:false}));
 foam.rotation.x=-Math.PI/2;foam.position.z=2;wake.add(foam);return wake;
}
