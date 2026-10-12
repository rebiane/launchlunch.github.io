import {animateChef} from './art.js';
import * as T from './vendor/three.module.js';
import {RoomEnvironment} from './vendor/addons/environments/RoomEnvironment.js';
import {EffectComposer} from './vendor/addons/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/addons/postprocessing/RenderPass.js';
import {SSAOPass} from './vendor/addons/postprocessing/SSAOPass.js';
import {OutputPass} from './vendor/addons/postprocessing/OutputPass.js';
import {RoundedBoxGeometry} from './vendor/addons/geometries/RoundedBoxGeometry.js';
export {RoundedBoxGeometry};
export function studio(renderer,scene,camera){
 renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.type=T.VSMShadowMap;
 const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();scene.environment=environment.texture;scene.environmentIntensity=.32;
 scene.traverse(o=>{if(o.isHemisphereLight)o.intensity=.55;if(o.isDirectionalLight&&!o.castShadow)o.intensity=.4;if(o.isDirectionalLight&&o.castShadow){o.intensity=1.65;o.shadow.radius=3;o.shadow.blurSamples=8;o.shadow.normalBias=.015;o.shadow.bias=-.00015;}});
 const fill=new T.DirectionalLight(0xd9e9ff,.4);fill.position.set(10,8,-10);scene.add(fill);
 const rim=new T.DirectionalLight(0xffe1a1,.7);rim.position.set(-6,10,-8);scene.add(rim);
 const backdrop=document.createElement('canvas');backdrop.width=16;backdrop.height=512;const bg=backdrop.getContext('2d'),base=scene.background?.isColor?scene.background.clone():new T.Color(0x183f4a),gradient=bg.createLinearGradient(0,0,0,512);gradient.addColorStop(0,'#'+base.clone().lerp(new T.Color(0x80b3b0),.25).getHexString());gradient.addColorStop(.65,'#'+base.getHexString());gradient.addColorStop(1,'#'+base.clone().multiplyScalar(.55).getHexString());bg.fillStyle=gradient;bg.fillRect(0,0,16,512);const background=new T.CanvasTexture(backdrop);background.colorSpace=T.SRGBColorSpace;scene.background=background;

 const composer=new EffectComposer(renderer);composer.renderTarget1.samples=4;composer.renderTarget2.samples=4;composer.setPixelRatio(renderer.getPixelRatio());composer.addPass(new RenderPass(scene,camera));const ao=new SSAOPass(scene,camera,512,512,12);ao.kernelRadius=.55;ao.minDistance=.001;ao.maxDistance=.015;
 // Keep the beauty/MSAA buffer at the canvas resolution; only the soft AO
 // pass is downsampled. Resize it once instead of allocating full size first.
 const resizeAO=ao.setSize.bind(ao);ao.setSize=(w,h)=>resizeAO(Math.max(1,Math.round(w*.7)),Math.max(1,Math.round(h*.7)));
 // Screen labels do not participate in the depth/normal buffer.
 const excludedFromAO=[];
 ao._overrideVisibility=()=>{for(const o of excludedFromAO)if(o.visible){o.visible=false;ao._visibilityCache.push(o);}};
 // RenderPass updates the shadow map once; the following SSAO normal pass reuses it.
 renderer.shadowMap.autoUpdate=false;
 // Output goes directly to the screen; swapping here would allocate a second
 // full-resolution HDR/MSAA beauty buffer on the next frame for no benefit.
 composer.addPass(ao);const output=new OutputPass();output.needsSwap=false;composer.addPass(output);const size=new T.Vector2();let width=0,height=0,pixelRatio=renderer.getPixelRatio(),lastFrame=null,followAt=0,followMix=0,followRoot=null;const followPoint=new T.Vector3(),followAnchor=new T.Vector3(),followDirection=new T.Vector3();let followDistance=18;
 return {render(frame,time=0,reduced=false){if(frame===lastFrame)return;lastFrame=frame;renderer.getSize(size);const ratio=renderer.getPixelRatio();if(ratio!==pixelRatio){pixelRatio=ratio;composer.setPixelRatio(pixelRatio);}if(size.x!==width||size.y!==height){width=size.x;height=size.y;composer.setSize(width,height);}// Resolve overlapping nameplates in screen space without moving contestants.
 const focus=scene.userData.follow,now=performance.now(),alpha=1-Math.exp(-Math.min(.05,Math.max(0,(now-followAt)/1000))/.14);followAt=now;
 if(focus?.root?.visible){if(!followRoot||!followRoot.parent)followPoint.copy(focus.point);else followPoint.lerp(focus.point,alpha);followRoot=focus.root;followAnchor.fromArray(focus.anchor);followDistance=focus.distance;followMix+=(1-followMix)*alpha;}else followMix+=(0-followMix)*alpha;
 if(followMix>.001){followDirection.copy(camera.position).sub(followAnchor).normalize();camera.position.lerp(followDirection.multiplyScalar(followDistance).add(followPoint),followMix);camera.lookAt(followAnchor.clone().lerp(followPoint,followMix));}
 // Fitting a portrait overview can move the lens beyond a fixed fog start.
 // Keep atmospheric haze behind the playable stage, never between it and the lens.
 if(scene.fog?.isFog){const reach=camera.position.length();scene.fog.near=reach+18;scene.fog.far=reach+80;if(camera.far<reach+100){camera.far=reach+100;camera.updateProjectionMatrix();}}
 const finale=scene.userData.finale;
 if((!scene.userData.overview||scene.userData.spectatorFinale)&&finale?.root&&time>finale.finish+450){const u=Math.min(1,(time-finale.finish-450)/1100),ease=u*u*(3-2*u),target=finale.root.position.clone().add(new T.Vector3(0,1,0)),direction=new T.Vector3();camera.getWorldDirection(direction);const original=followMix>.001?followAnchor.clone().lerp(followPoint,followMix):camera.position.clone().addScaledVector(direction,camera.position.length());camera.position.lerp(target.clone().add(camera.position.clone().sub(target).multiplyScalar(.48)),ease);camera.lookAt(original.lerp(target,ease));}
 const labels=[];excludedFromAO.length=0;
 // One visit collects per-frame work, including objects added by rebuilt game rounds.
 scene.traverse(o=>{
  if(o.isSprite||o.isPoints||o.isLine||o.isLine2)excludedFromAO.push(o);
  if(o.userData.chefRig&&o.parent?.visible){const victorious=finale?.root===o.parent&&time>finale.finish+900;o.userData.victorious=victorious;if(victorious)o.rotation.y=Math.atan2(camera.position.x-o.parent.position.x,camera.position.z-o.parent.position.z);animateChef(o,time,reduced);}
  if(o.userData.winnerCrown){const winner=finale?.root===o.parent&&time>=finale.finish+500;o.visible=winner;o.rotation.y=0;if(winner){const crown=o.userData.winnerCrown,body=o.parent.children.find(child=>child.userData.chefRig),age=Math.max(0,time-finale.finish-500);crown.position.y=2.04+(body?.position.y||0)+(reduced?0:Math.sin(age/550)*.055);crown.rotation.y=reduced?.2:age/2400;}}
  if(o.isSprite&&o.userData.nameLabel&&o.parent?.visible){if(o.userData.labelY===undefined||o.position.y!==o.userData.lastLabelY)o.userData.labelY=o.position.y;o.position.y=o.userData.labelY;if(finale?.root===o.parent&&time>=finale.finish+500)o.position.y=Math.max(o.position.y,3.18);if(o.visible)labels.push(o);}
 });scene.updateMatrixWorld(true);camera.updateMatrixWorld();const placed=[],point=new T.Vector3();
 for(const label of labels){let rect;for(let pass=0;pass<12;pass++){label.updateWorldMatrix(true,false);label.getWorldPosition(point);const distance=point.distanceTo(camera.position),scale=height/(2*Math.tan(camera.fov*Math.PI/360)*distance);point.project(camera);const x=(point.x+1)*width/2,y=(1-point.y)*height/2;rect={x:x-label.scale.x*scale/2,y:y-label.scale.y*scale/2,w:label.scale.x*scale,h:label.scale.y*scale};if(!placed.some(p=>rect.x<p.x+p.w+3&&rect.x+rect.w+3>p.x&&rect.y<p.y+p.h+3&&rect.y+rect.h+3>p.y))break;label.position.y+=.3;}placed.push(rect);label.userData.lastLabelY=label.position.y;}
 renderer.shadowMap.needsUpdate=true;composer.render();},dispose(){composer.passes.forEach(p=>p.dispose?.());composer.dispose();environment.dispose();background.dispose();}};
}
export function grainTexture(kind='wood'){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=kind==='wood'?'#c9b58e':'#eee7d8';ctx.fillRect(0,0,256,256);let seed=912;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 if(kind==='wood')for(let i=0;i<130;i++){ctx.strokeStyle=`rgba(113,66,29,${.035+rand()*.1})`;ctx.lineWidth=.4+rand();ctx.beginPath();const x=rand()*256;ctx.moveTo(x,0);ctx.bezierCurveTo(x+rand()*20,80,x-rand()*15,170,x,256);ctx.stroke();}
 else for(let i=0;i<5000;i++){const v=rand();ctx.fillStyle=v>.5?'#ffffff24':'#2638520a';ctx.fillRect(rand()*256,rand()*256,1,1);}
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=4;return tex;
}
export function roundedBox(x,y,z){return Math.min(x,y,z)<.1?new T.BoxGeometry(x,y,z):new RoundedBoxGeometry(x,y,z,2,Math.min(x,y,z)*.14);}

export function waterNormals(){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),pixels=ctx.createImageData(256,256);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const u=x/256*Math.PI*2,v=y/256*Math.PI*2,i=(y*256+x)*4;pixels.data[i]=128+Math.cos(u*4+Math.sin(v*3)) *24+Math.cos(u*7-v*5)*10;pixels.data[i+1]=128+Math.cos(v*3+Math.sin(u*2))*22;pixels.data[i+2]=250;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(18,18);return tex;}

export function supermarketTiles(){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#bebcae';ctx.fillRect(0,0,512,512);for(let x=0;x<2;x++)for(let y=0;y<2;y++){ctx.fillStyle=(x+y)%2?'#e7e3d7':'#eeebdf';ctx.fillRect(x*256+2,y*256+2,252,252);}let seed=293;for(let i=0;i<12000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%512;seed=(seed*1664525+1013904223)>>>0;const y=seed%512;ctx.fillStyle=i%2?'#ffffff0c':'#51564b08';ctx.fillRect(x,y,1,1);}const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=8;return texture;}

// Camera-only tracking: contestant and hazard world coordinates are never changed.
export function focusContestant(scene,pieces,index,{local=false,anchor=[0,.3,0],distance=18,y=.9}={}){
 for(let i=0;i<pieces.length;i++){const p=pieces[i];if(p.localRing)p.localRing.visible=local&&i===index&&p.root.visible;}
 const p=pieces[index];if(!local||!p||!p.root.visible){scene.userData.follow=null;return;}
 if(local&&!p.localRing){p.localRing=new T.Mesh(new T.TorusGeometry(.76,.045,8,40),new T.MeshBasicMaterial({color:0xffd13f}));p.localRing.rotation.x=Math.PI/2;p.localRing.position.y=.05;p.root.add(p.localRing);}
 if(p.localRing)p.localRing.visible=local;
 scene.userData.follow={root:p.root,point:new T.Vector3(p.root.position.x,y,p.root.position.z),anchor,distance};
}


// Keep the existing arena angle and include every visible contestant in portrait
// as well as landscape. Overview cameras never chase an individual winner.
export function fitOverview(camera,pieces,anchor=[0,.3,0],bounds=[]){
 const center=new T.Vector3(...anchor),direction=camera.position.clone().sub(center).normalize();
 camera.lookAt(center);camera.updateMatrixWorld();
 const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,1),tan=Math.tan(camera.fov*Math.PI/360);
 let distance=camera.position.distanceTo(center);
 const include=(x,y,z)=>{const point=new T.Vector3(x,y,z).sub(center),depth=point.dot(direction);distance=Math.max(distance,depth+Math.abs(point.dot(right))/(tan*camera.aspect)*1.08,depth+Math.abs(point.dot(up))/tan*1.08);};
 for(const p of pieces)if(p.root.visible&&p.root.position.y>-1.8){const q=p.root.position;for(const x of [-1.15,1.15])for(const y of [-.3,4])for(const z of [-1,1])include(q.x+x,q.y+y,q.z+z);}
 if(bounds.length===2){for(const x of [bounds[0][0],bounds[1][0]])for(const y of [bounds[0][1],bounds[1][1]])for(const z of [bounds[0][2],bounds[1][2]])include(x,y,z);}else for(const b of bounds)include(...b);
 camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
}
