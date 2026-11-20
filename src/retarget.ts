import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

const canonical=(name:string)=>name.replace(/^.*[|:]/,'').replace(/^mixamorig\d*/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
function bones(root:T.Object3D){const result=new Map<string,T.Bone>();root.traverse(node=>{if((node as T.Bone).isBone&&!result.has(canonical(node.name)))result.set(canonical(node.name),node as T.Bone);});return result;}
function parentName(bone:T.Bone){let parent=bone.parent;while(parent&&(parent as T.Bone).isBone&&canonical(parent.name)===canonical(bone.name))parent=parent.parent;return parent&&(parent as T.Bone).isBone?canonical(parent.name):'';}
function height(map:Map<string,T.Bone>){const positions=[...map.values()].map(b=>b.getWorldPosition(new T.Vector3()).y);return Math.max(.001,Math.max(...positions)-Math.min(...positions));}

/** Bake world-space motion deltas into the target hierarchy, preserving its limb lengths. */
export function adaptAnimation(source:T.Group,target:T.Group,clip:T.AnimationClip):T.AnimationClip{
 const sourceBones=bones(source),targetBones=bones(target);let changed=false;
 for(const track of clip.tracks){const name=canonical(track.name.slice(0,track.name.lastIndexOf('.'))),a=sourceBones.get(name),b=targetBones.get(name);if(!a||!b)throw Error(`연결할 수 없는 본: ${track.name}. Mixamo 사람형 리그를 사용하세요.`);if(parentName(a)!==parentName(b))throw Error(`본 계층을 연결할 수 없습니다: ${a.name}`);if(a.quaternion.angleTo(b.quaternion)>.001)changed=true;}
 if(!clip.tracks.length)throw Error('애니메이션 트랙이 없습니다.');
 if(source===target)return clip;
 source.updateMatrixWorld(true);target.updateMatrixWorld(true);
 const ratio=height(targetBones)/height(sourceBones);
 if(!changed&&Math.abs(ratio-1)<.001)return clip;
 const working=clone(source) as T.Group,workingBones=bones(working);working.updateMatrixWorld(true);
 const alignment=target.getWorldQuaternion(new T.Quaternion()).multiply(source.getWorldQuaternion(new T.Quaternion()).invert()),inverseAlignment=alignment.clone().invert();
 const animated=new Set(clip.tracks.filter(t=>t.name.endsWith('.quaternion')).map(t=>canonical(t.name.slice(0,t.name.lastIndexOf('.')))));
 const corrections=new Map<string,T.Quaternion>();
 for(const name of animated)corrections.set(name,sourceBones.get(name)!.getWorldQuaternion(new T.Quaternion()).invert().multiply(inverseAlignment).multiply(targetBones.get(name)!.getWorldQuaternion(new T.Quaternion())));
 const nodes:T.Object3D[]=[];target.traverse(node=>nodes.push(node));const names=new Map<T.Object3D,string>();for(const [name,bone] of targetBones)names.set(bone,name);
 const frames=Math.ceil(clip.duration*30),times=new Float32Array(frames+1),rotations=new Map<string,Float32Array>();for(const name of animated)rotations.set(name,new Float32Array((frames+1)*4));
 const hips=workingBones.get('hips'),targetHips=targetBones.get('hips'),sourceHipRest=hips?.position.clone(),hipValues=hips&&targetHips&&clip.tracks.some(t=>t.name.endsWith('.position')&&canonical(t.name.slice(0,t.name.lastIndexOf('.')))==='hips')?new Float32Array((frames+1)*3):null;
 const mixer=new T.AnimationMixer(working),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
 const world=new Map<T.Object3D,T.Quaternion>(),sourceWorld=new T.Quaternion(),parentWorld=new T.Quaternion(),desired=new T.Quaternion();
 const external=target.parent?.getWorldQuaternion(new T.Quaternion())??new T.Quaternion();
 try{for(let frame=0;frame<=frames;frame++){
  const time=Math.min(clip.duration,frame/30);times[frame]=time;mixer.setTime(time);working.updateMatrixWorld(true);
  for(const node of nodes){const name=names.get(node);parentWorld.copy(node===target?external:world.get(node.parent!)!);
   if(name&&animated.has(name)){workingBones.get(name)!.getWorldQuaternion(sourceWorld);desired.copy(alignment).multiply(sourceWorld).multiply(corrections.get(name)!);world.set(node,desired.clone());parentWorld.invert().multiply(desired).normalize().toArray(rotations.get(name)!,frame*4);}
   else world.set(node,parentWorld.multiply(node.quaternion).clone());
  }
  if(hipValues){hipValues[frame*3]=targetHips!.position.x;hipValues[frame*3+1]=targetHips!.position.y+(hips!.position.y-sourceHipRest!.y)*ratio;hipValues[frame*3+2]=targetHips!.position.z;}
 }}finally{mixer.stopAllAction();mixer.uncacheRoot(working);}
 const tracks:T.KeyframeTrack[]=[];for(const [name,values] of rotations)tracks.push(new T.QuaternionKeyframeTrack(targetBones.get(name)!.name+'.quaternion',times,values));if(hipValues)tracks.push(new T.VectorKeyframeTrack(targetHips!.name+'.position',times,hipValues));
 return new T.AnimationClip(clip.name,clip.duration,tracks);
}
