import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {dirname,relative,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),vendor=resolve(root,'public/vendor'),source=resolve(root,'node_modules/three/examples/jsm');
await mkdir(vendor,{recursive:true});
for(const file of ['three.module.js','three.core.js'])await copyFile(resolve(root,'node_modules/three/build',file),resolve(vendor,file));
await copyFile(resolve(root,'node_modules/three/LICENSE'),resolve(vendor,'THREE-LICENSE.txt'));
const visited=new Set();async function addon(name){if(visited.has(name))return;visited.add(name);const src=resolve(source,name),dest=resolve(vendor,'addons',name);let text=await readFile(src,'utf8');const dependencies=[...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]).filter(s=>s.startsWith('.'));for(const dep of dependencies)await addon(relative(source,resolve(dirname(src),dep)));let modulePath=relative(dirname(dest),resolve(vendor,'three.module.js')).replaceAll('\\','/');if(!modulePath.startsWith('.'))modulePath='./'+modulePath;text=text.replace(/from\s+(['"])three\1/g,`from '${modulePath}'`);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,text);}
for(const file of ['geometries/RoundedBoxGeometry.js','environments/RoomEnvironment.js','postprocessing/EffectComposer.js','postprocessing/RenderPass.js','postprocessing/SSAOPass.js','postprocessing/OutputPass.js','loaders/GLTFLoader.js'])await addon(file);
