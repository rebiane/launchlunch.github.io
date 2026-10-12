import * as T from './vendor/three.module.js';
import {roundedBox,grainTexture} from './studio.js';
// Decorative set only: none of these objects participate in game collisions.
export function kitchenSet(parent,{bakery=false}={}){
 const group=new T.Group();parent.add(group);const materials=new Map();
 const mat=c=>{if(!materials.has(c))materials.set(c,new T.MeshStandardMaterial({color:c,roughness:.68}));return materials.get(c);};
 const box=(w,h,d,c,x,y,z)=>{const m=new T.Mesh(roundedBox(w,h,d),mat(c));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
 box(58,.5,46,0xd9d4bc,0,-2.7,-5);
 box(42,12,.5,0xe1dfcc,0,3.2,-19);
 for(let x=-20;x<=20;x+=4)for(let y=0;y<=8;y+=2)box(3.94,1.94,.08,(x/4+y/2)%2?0xd6dfd2:0xece8d8,x,y,-18.7);
 for(const side of [-1,1]){
  const x=side*13.5;
  box(9,4,4.8,0x235c52,x,-.6,-14.7);const top=box(9.5,.35,5.1,0xf3e8cd,x,1.57,-14.7);top.material=new T.MeshStandardMaterial({color:0xf3e8cd,roughness:.45,map:grainTexture('ceramic')});
  for(let j=-1;j<=1;j++){box(2.7,3.4,.12,0x347a66,x+j*2.9,-.5,-12.22);box(.8,.09,.18,0xc1a86c,x+j*2.9,.6,-12.10);}
  box(8,.2,1.7,0xa98651,x,6,-17.5);
  for(let k=0;k<4;k++){const jar=new T.Mesh(new T.CylinderGeometry(.43,.43,1.1,24),mat([0xcf7152,0xe3b541,0x72925a,0xebdfbf][k]));jar.position.set(x-2.4+k*1.6,6.7,-17.5);group.add(jar);jar.castShadow=true;box(.85,.15,.85,0xc0a576,x-2.4+k*1.6,7.3,-17.5);box(.6,.34,.035,0xf6edd6,x-2.4+k*1.6,6.7,-17.04);}
 }
 // A recessed bakery sign, framed in oak, gives the otherwise empty horizon depth.
 box(9,4,.35,0x9d7444,0,5.4,-18.2);box(8.6,3.6,.15,0x244e49,0,5.4,-17.95);
 const c=document.createElement('canvas');c.width=768;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#244e49';ctx.fillRect(0,0,768,256);ctx.textAlign='center';ctx.fillStyle='#f4dba4';ctx.font='800 70px sans-serif';ctx.fillText(bakery?'COOKIE CLUB':'LUNCH CLUB',384,118);ctx.font='22px sans-serif';ctx.fillText(bakery?'FRESHLY BAKED • EVERY DAY':'GOOD FOOD • GOOD COMPANY',384,175);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const sign=new T.Mesh(new T.PlaneGeometry(8.3,2.8),new T.MeshBasicMaterial({map:tex,toneMapped:false}));sign.position.set(0,5.4,-17.84);group.add(sign);
 return group;
}
export function tablecloth(){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#f1ecd9';ctx.fillRect(0,0,256,256);ctx.fillStyle='#7aa49180';ctx.fillRect(0,0,128,256);ctx.fillRect(0,0,256,128);ctx.strokeStyle='#fff8';ctx.lineWidth=2;for(let i=0;i<256;i+=8){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(12,9);tex.anisotropy=8;return tex;}
