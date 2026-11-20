import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {set,get} from 'idb-keyval';
import {useStudio,notice} from './store.ts';
import {validateProject,type Project,type AssetInfo} from './model.ts';
export type Resource={info:AssetInfo;file:File;object?:THREE.Group;clip?:THREE.AnimationClip;buffer?:AudioBuffer};
export const resources=new Map<string,Resource>();
export const canonical=(name:string)=>name.replace(/^.*[|:]/,'').replace(/^mixamorig\d*/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export function bonesOf(root:THREE.Object3D){const bones=new Map<string,THREE.Bone>();root.traverse(o=>{const key=canonical(o.name);if((o as THREE.Bone).isBone&&!bones.has(key))bones.set(key,o as THREE.Bone);});return bones;}
export function hasSkin(root:THREE.Object3D){let yes=false;root.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)yes=true;});return yes;}
function assertCompatible(object:THREE.Group,base:THREE.Group,clip:THREE.AnimationClip){
 const target=bonesOf(base),source=bonesOf(object);let tracks=0;
 for(const tr of clip.tracks){const node=tr.name.slice(0,tr.name.lastIndexOf('.'));if(!target.has(canonical(node)))throw Error(`스켈레톤 불일치: ${node}. 기준 캐릭터와 동일한 Mixamo 캐릭터에서 모션을 다운로드하세요.`);tracks++;}
 if(!tracks)throw Error('이 FBX에는 재생할 애니메이션 트랙이 없습니다.');
 for(const [key,b] of source){const t=target.get(key);if(!t)continue; const parent=canonical(b.parent?.name??''),tp=canonical(t.parent?.name??'');if(b.parent instanceof THREE.Bone&&parent!==tp)throw Error(`본 계층이 다릅니다: ${b.name}. 범용 리타게팅은 지원하지 않습니다.`);
  if(b.quaternion.angleTo(t.quaternion)>.2)throw Error(`기준 포즈가 다른 스켈레톤입니다: ${b.name}. 동일한 캐릭터의 모션을 사용하세요.`);
 }
}
export function disposeObject(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material]){materials.add(mat);for(const v of Object.values(mat))if(v instanceof THREE.Texture)textures.add(v);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
export class Sound{
 context:AudioContext|null=null;source:AudioBufferSourceNode|null=null;destination:MediaStreamAudioDestinationNode|null=null;anchor=0;offset=0;rate=1;running=false;
 async ensure(){if(!this.context){this.context=new AudioContext();this.destination=this.context.createMediaStreamDestination();}if(this.context.state!=='running')await this.context.resume();}
 now(){return this.running&&this.context?this.offset+(this.context.currentTime-this.anchor)*this.rate:this.offset;}
 stop(){this.offset=this.now();this.running=false;if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}}
 async start(t:number,rate:number,audio:string|null,include=true){await this.ensure();this.stop();this.offset=t;this.rate=rate;this.anchor=this.context!.currentTime;this.running=true;const b=audio?resources.get(audio)?.buffer:undefined;if(b&&t<b.duration){const src=this.context!.createBufferSource();src.buffer=b;src.playbackRate.value=rate;src.connect(this.context!.destination);if(include)src.connect(this.destination!);src.start(0,Math.max(0,t));this.source=src;}}
 async decode(file:File){if(!this.context){this.context=new AudioContext();this.destination=this.context.createMediaStreamDestination();}return this.context.decodeAudioData(await file.arrayBuffer());}
}
export const sound=new Sound();
export async function parseResource(file:File,id?:string):Promise<Resource>{
 if(file.size>150*1024*1024)throw Error('파일당 최대 150MB까지 지원합니다.');
 const bytes=await file.arrayBuffer();const key=id??Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(/\.fbx$/i.test(file.name)){
  const object=new FBXLoader().parse(bytes,''); const clip=object.animations[0];
  if(!clip||clip.duration<=0){disposeObject(object);throw Error('애니메이션이 없는 FBX입니다. Mixamo에서 모션을 선택해 다운로드하세요.');}
  if(!bonesOf(object).size){disposeObject(object);throw Error('스켈레톤이 없는 FBX입니다. 리깅된 Mixamo 파일이 필요합니다.');}
  return {info:{id:key,name:file.name.replace(/\.fbx$/i,''),kind:'fbx',duration:clip.duration,size:file.size},file,object,clip};
 }
 if(/\.(mp3|wav)$/i.test(file.name)){const buffer=await sound.decode(file);return {info:{id:key,name:file.name,kind:'audio',duration:buffer.duration,size:file.size},file,buffer};}
 throw Error('FBX, MP3, WAV 파일을 지원합니다.');
}
export async function importFiles(files:File[]){
 if(useStudio.getState().recording)return;
 for(const file of files){let r:Resource|undefined;try{
  notice(`${file.name} 불러오는 중…`);r=await parseResource(file);const p=useStudio.getState().project;
  if(r.object){const base=p.baseRig?resources.get(p.baseRig)?.object:undefined;
   if(!base&&!hasSkin(r.object))throw Error('먼저 With Skin 옵션으로 다운로드한 캐릭터 FBX를 추가하세요. 이후 Without Skin 모션도 사용할 수 있습니다.');
   assertCompatible(r.object,base??r.object,r.clip!);
  }
  const previous=resources.get(r.info.id);resources.set(r.info.id,r);if(previous?.object&&previous.object!==r.object)disposeObject(previous.object);
  useStudio.getState().edit(d=>{if(!d.assets.some(a=>a.id===r!.info.id))d.assets.push(r!.info);if(r!.info.kind==='audio'){d.audio=r!.info.id;d.duration=Math.max(d.duration,r!.info.duration);d.output.end=d.duration;}else if(!d.baseRig){d.baseRig=r!.info.id;const demos=new Set(d.assets.filter(a=>a.kind==='demo').map(a=>a.id));d.clips=d.clips.filter(c=>!demos.has(c.asset));d.assets=d.assets.filter(a=>a.kind!=='demo');}});
  notice(`${file.name} 추가 완료`);
 }catch(e){if(r?.object)disposeObject(r.object);notice(`${file.name}: ${(e as Error).message}`);}}
}
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);}
export async function saveLocal(){const p=useStudio.getState().project;const files=Array.from(resources.values()).filter(r=>p.assets.some(a=>a.id===r.info.id)).map(r=>({id:r.info.id,file:r.file}));await set('voyager-project',{project:p,files});useStudio.setState({savedProject:p});notice('이 브라우저에 프로젝트와 에셋을 저장했습니다.');}
async function activate(p:Project,files:{id:string;file:File}[]){
 const staged=new Map<string,Resource>();
 try{for(const f of files)staged.set(f.id,await parseResource(f.file,f.id));
 const base=p.baseRig?staged.get(p.baseRig)?.object:undefined;
 if(base){if(!hasSkin(base))throw Error('기준 캐릭터에 스킨이 없습니다.');for(const r of staged.values())if(r.object&&r.info.id!==p.baseRig)assertCompatible(r.object,base,r.clip!);}
 }catch(e){staged.forEach(r=>{if(r.object)disposeObject(r.object);});throw e;}
 sound.stop();useStudio.setState({playing:false});resources.forEach(r=>{if(r.object)disposeObject(r.object);});resources.clear();staged.forEach((v,k)=>resources.set(k,v));useStudio.getState().replace(p);
 const missing=p.assets.filter(a=>a.kind!=='demo'&&!resources.has(a.id));notice(missing.length?`프로젝트 열림 · ${missing.length}개 에셋 누락. 원본 파일을 다시 업로드하세요.`:'프로젝트와 에셋을 복원했습니다.');
}
export async function loadLocal(){const saved=await get<{project:Project;files:{id:string;file:File}[]}>('voyager-project');if(!saved)throw Error('이 브라우저에 저장된 프로젝트가 없습니다.');await activate(validateProject(saved.project),saved.files);}
export async function exportProject(bundle:boolean){const p=useStudio.getState().project;if(!bundle){download(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),`${p.name}.json`);notice('JSON 저장 완료 · 원본 FBX/음악은 포함되지 않습니다.');return;}
 const files:Record<string,Uint8Array>={'project.json':strToU8(JSON.stringify(p))};const manifest:{id:string;path:string;name:string}[]=[];
 for(const a of p.assets){const r=resources.get(a.id);if(!r)continue;const path=`assets/${a.id}.${a.kind==='fbx'?'fbx':r.file.name.split('.').at(-1)}`;files[path]=new Uint8Array(await r.file.arrayBuffer());manifest.push({id:a.id,path,name:r.file.name});}
 files['manifest.json']=strToU8(JSON.stringify(manifest));download(new Blob([zipSync(files,{level:0}) as Uint8Array<ArrayBuffer>],{type:'application/zip'}),`${p.name}.voyager.zip`);notice('프로젝트 ZIP 저장 완료 · FBX와 음악 포함');
}
export async function openProject(file:File){if(file.size>350*1024*1024)throw Error('프로젝트는 최대 350MB까지 열 수 있습니다.');if(/\.json$/i.test(file.name)){await activate(validateProject(JSON.parse(await file.text())),[]);return;}
 const zip=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:e=>e.originalSize<160*1024*1024});if(!zip['project.json'])throw Error('VOYAGER 프로젝트 ZIP이 아닙니다.');
 const p=validateProject(JSON.parse(strFromU8(zip['project.json'])));const manifest=JSON.parse(strFromU8(zip['manifest.json']??strToU8('[]'))) as {id:string;path:string;name:string}[];
 if(!Array.isArray(manifest)||manifest.length>100)throw Error('에셋 목록이 올바르지 않습니다.');
 await activate(p,manifest.filter(m=>zip[m.path]).map(m=>({id:m.id,file:new File([zip[m.path] as Uint8Array<ArrayBuffer>],m.name)})));
}
