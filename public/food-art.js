import {mergeGeometries} from './vendor/addons/utils/BufferGeometryUtils.js';
import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/addons/loaders/GLTFLoader.js';
const models=new Map(),pending=new Map(),loader=new GLTFLoader();
// All models share one palette image; reuse both completed and in-flight image loads.
T.Cache.enabled=true;
export function loadFoods(names=['apple','banana','bread','carton','bottle-ketchup','bottle-oil','soda-can','broccoli','cookie','rice-ball','loaf-baguette','croissant']){
 return Promise.all(names.map(name=>{
  if(models.has(name))return models.get(name);
  if(!pending.has(name))pending.set(name,loader.loadAsync(new URL('/assets/food/'+name+'.glb',import.meta.url).href).then(gltf=>{models.set(name,gltf.scene);return gltf.scene;}).finally(()=>pending.delete(name)));
  return pending.get(name);
 }));
}
export function food(name,parent,size,x=0,y=0,z=0){const source=models.get(name);if(!source)throw new Error('Food asset unavailable: '+name);const model=source.clone(true);model.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=o.material.clone();if(o.material.map)o.material.map=o.material.map.clone();o.material.roughness=.5;o.castShadow=true;o.receiveShadow=true;}});const bounds=new T.Box3().setFromObject(model),extent=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=size/Math.max(extent.x,extent.y,extent.z);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);model.scale.setScalar(scale);const root=new T.Group();root.add(model);root.position.set(x,y,z);parent.add(root);return root;}
// Bake each moving shelf into a small set of meshes; its contents move together.
export function batchShelf(root){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map(),old=[];
 root.traverse(o=>{if(!o.isMesh)return;const m=o.material,key=[m.color.getHex(),m.roughness,m.metalness,Boolean(m.map)].join(':'),g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));if(!batches.has(key))batches.set(key,{material:m,geometries:[]});batches.get(key).geometries.push(g);old.push(o);});root.clear();const kept=new Set();for(const {material,geometries} of batches.values()){const g=mergeGeometries(geometries);if(!g)throw new Error('Shelf geometry cannot be merged');const mesh=new T.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);kept.add(material);geometries.forEach(g=>g.dispose());}for(const o of old){o.geometry.dispose();if(!kept.has(o.material)){o.material.map?.dispose();o.material.dispose();}}
}
