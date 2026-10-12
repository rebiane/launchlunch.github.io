import * as T from './vendor/three.module.js';
import {roundedBox} from './studio.js';
export function tropicalSet(scene){
 const group=new T.Group();scene.add(group);const mats=new Map();
 const material=c=>{if(!mats.has(c))mats.set(c,new T.MeshStandardMaterial({color:c,roughness:.8}));return mats.get(c);};
 const mesh=(geo,c,x,y,z,parent=group)=>{const m=new T.Mesh(geo,material(c));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 for(const [x,z,scale] of [[-12,-7,1],[12,-10,1.15],[-16,8,.7],[18,5,.8]]){
  const island=new T.Group();group.add(island);island.position.set(x,-2.25,z);island.scale.setScalar(scale);
  const sand=mesh(new T.SphereGeometry(3,48,24),0xe9c786,0,-.3,0,island);sand.scale.set(1,.19,.8);
  const grass=mesh(new T.SphereGeometry(2.2,40,24),0x449b57,-.25,.13,-.15,island);grass.scale.set(1,.15,.85);
  for(const [tx,tz,height,bend] of [[-.9,-.4,4,.7],[1,.2,3.2,-.45]]){
   const curve=new T.QuadraticBezierCurve3(new T.Vector3(tx,.1,tz),new T.Vector3(tx-bend,height*.55,tz),new T.Vector3(tx+bend,height,tz));
   mesh(new T.TubeGeometry(curve,20,.14,12,false),0x9d6e39,0,0,0,island);
   for(let k=1;k<12;k++){const p=curve.getPoint(k/12),ring=mesh(new T.TorusGeometry(.15,.014,5,16),0x6e4c2b,p.x,p.y,p.z,island);ring.rotation.x=Math.PI/2;}
   const top=curve.getPoint(1);
   for(let n=0;n<8;n++){
    const a=n*Math.PI/4,vertices=[],indices=[];
    for(let j=0;j<=16;j++){const u=j/16,r=u*2.25,w=Math.sin(u*Math.PI)*.39,y=Math.sin(u*Math.PI)*.6-u*u*.6;for(const side of [-1,0,1])vertices.push(top.x+Math.cos(a)*r-Math.sin(a)*w*side,top.y+y+(side===0?.06:0),top.z+Math.sin(a)*r+Math.cos(a)*w*side);if(j<16)for(let k=0;k<2;k++){const i=j*3+k;indices.push(i,i+3,i+1,i+1,i+3,i+4);}}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const leaf=mesh(geo,n%2?0x247c45:0x3b9c48,0,0,0,island);leaf.material=leaf.material.clone();leaf.material.side=T.DoubleSide;
   }
   for(let n=0;n<3;n++)mesh(new T.SphereGeometry(.18,16,12),0x81552c,top.x+Math.cos(n*2.1)*.2,top.y-.13,top.z+Math.sin(n*2.1)*.2,island);
  }
  for(let n=0;n<9;n++){const a=n*2.4;const stone=mesh(new T.DodecahedronGeometry(.22+.06*(n%3),1),n%2?0xc0a985:0xd6bc92,Math.cos(a)*2.4,.04,Math.sin(a)*1.8,island);stone.scale.y=.6;}
 }
 // A boardwalk and pennant flags connect the arena to a small seaside festival.
 for(const side of [-1,1]){
  for(let k=0;k<9;k++){const plank=mesh(roundedBox(1.15,.12,3.2),k%2?0xb17d43:0xc29253,side*(9+k*1.16),-.9,12);}
  for(const x of [side*9,side*17]){mesh(new T.CylinderGeometry(.13,.17,4.6,16),0xf2dfae,x,.9,11);mesh(new T.SphereGeometry(.2,20,12),0xf7b930,x,3.3,11);}
  const curve=new T.QuadraticBezierCurve3(new T.Vector3(side*9,3.2,11),new T.Vector3(side*13,2.25,11),new T.Vector3(side*17,3.2,11));mesh(new T.TubeGeometry(curve,24,.025,6,false),0xead4a2,0,0,0);
  for(let i=1;i<9;i++){const p=curve.getPoint(i/9),shape=new T.Shape();shape.moveTo(-.32,0);shape.lineTo(.32,0);shape.lineTo(0,-.65);shape.closePath();const flag=mesh(new T.ShapeGeometry(shape),[0xf24d39,0xffca32,0x258ab0][i%3],p.x,p.y,p.z);flag.material=flag.material.clone();flag.material.side=T.DoubleSide;}
 }
 return group;
}
