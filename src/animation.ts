import {setCameraPose,activeCamera,cameraPoseAt} from './cameras.ts';
import {Color} from 'three';
import {uid,positionsAt,worldDeltaToLocal,memberTransformAt,stageTransformAt,samplePositionKeys,cameraRotation,type Project,type Vec3,type Property,type PropertyKey,type CameraPose,type Ease} from './model.ts';
import {putMemberPosition,putClipPosition} from './spatial.ts';

export type Target='member'|'stage'|'camera';
export type KeyRef={kind:'memberPosition'|'memberProperty'|'clipPosition'|'stagePosition'|'stageProperty'|'stagePreset'|'formation'|'camera';id:string;member?:number;clip?:string;camera?:string};
export const atFrame=(a:number,b:number,p:Project)=>Math.abs(a-b)<.5/p.output.fps;
const frame=(p:Project,t:number)=>Math.max(0,Math.min(p.duration,Math.round(t*p.output.fps)/p.output.fps));

export function propertyKeys(p:Project,target:'member'|'stage',member:number,property:Property){
 return (target==='member'?p.memberPropertyKeys?.filter(k=>k.member===member):p.stagePropertyKeys)?.filter(k=>k.property===property)??[];
}
export function putPropertyKey(p:Project,target:'member'|'stage',member:number,property:Property,value:Vec3|string|boolean,time:number,ease:Ease='smoother'){
 const t=frame(p,time),current=target==='member'?memberTransformAt(p,member,0):stageTransformAt(p,0);
 let keys:PropertyKey[]=target==='member'?(p.memberPropertyKeys??[]).filter(k=>k.member===member):p.stagePropertyKeys??[];
 const others=target==='member'?(p.memberPropertyKeys??[]).filter(k=>k.member!==member):[];
 if(!keys.some(k=>k.property===property)&&t>0){const fallback=(current as unknown as Record<Property,Vec3|string|boolean>)[property];keys.push({id:uid(),time:0,property,value:structuredClone(fallback),ease} as PropertyKey);}
 const found=keys.find(k=>k.property===property&&atFrame(k.time,t,p));
 keys=[...keys.filter(k=>k!==found),{id:found?.id??uid(),time:t,property,value:structuredClone(value),ease} as PropertyKey];
 if(target==='member')p.memberPropertyKeys=[...others,...keys.map(k=>({...k,member}))];else p.stagePropertyKeys=keys;
}
function adjustValue(property:Property,old:Vec3|string|boolean,next:Vec3|string|boolean,value:Vec3|string|boolean){
 if(property==='visible')return next;
 if(property==='color'){
  const before=new Color(old as string),after=new Color(next as string),color=new Color(value as string);
  color.r=Math.max(0,Math.min(1,color.r+after.r-before.r));color.g=Math.max(0,Math.min(1,color.g+after.g-before.g));color.b=Math.max(0,Math.min(1,color.b+after.b-before.b));return '#'+color.getHexString();
 }
 return (value as Vec3).map((v,i)=>property==='scale'?v*(next as Vec3)[i]/Math.max(.0001,(old as Vec3)[i]):v+(next as Vec3)[i]-(old as Vec3)[i]) as Vec3;
}
/** Without auto-key, edits away from keys adjust the entire animation's basis. */
export function editProperty(p:Project,target:'member'|'stage',member:number,property:Property,value:Vec3|string|boolean,t:number,auto:boolean){
 const keys=propertyKeys(p,target,member,property);
 if(auto||keys.some(k=>atFrame(k.time,t,p))){putPropertyKey(p,target,member,property,value,t);return;}
 const sampled=target==='member'?memberTransformAt(p,member,t):stageTransformAt(p,t);
 const previous=(sampled as unknown as Record<Property,Vec3|string|boolean>)[property];
 if(target==='member'){
  const m=p.members[member];
  if(property==='rotation')m.rotationXYZ=adjustValue(property,previous,value,m.rotationXYZ??[0,m.rotation,0]) as Vec3;
  if(property==='scale')m.scaleXYZ=adjustValue(property,previous,value,m.scaleXYZ??[m.scale,m.scale,m.scale]) as Vec3;
  if(property==='color')m.color=adjustValue(property,previous,value,m.color) as string;
  if(property==='visible')m.visible=value as boolean;
 }else{
  p.stageTransform??={};
  if(property==='rotation')p.stageTransform.rotation=adjustValue(property,previous,value,p.stageTransform.rotation??[0,0,0]) as Vec3;
  if(property==='scale')p.stageTransform.scale=adjustValue(property,previous,value,p.stageTransform.scale??[1,1,1]) as Vec3;
  if(property==='visible')p.stageTransform.visible=value as boolean;
 }
 for(const key of keys)key.value=adjustValue(property,previous,value,key.value) as never;
}
export function editMemberPosition(p:Project,member:number,time:number,world:Vec3,auto:boolean){
 if(auto||p.memberPositionKeys?.some(k=>k.member===member&&atFrame(k.time,time,p))){putMemberPosition(p,member,time,world);return;}
 const current=positionsAt(p,time)[member],delta=worldDeltaToLocal(p,time,world.map((v,i)=>v-current[i]) as Vec3),base=p.members[member].position??[0,0,0];
 p.members[member].position=base.map((v,i)=>v+delta[i]) as Vec3;
}
export function clipPositionAt(p:Project,id:string,t:number):Vec3{
 const c=p.clips.find(c=>c.id===id);if(!c)return [0,0,0];const sampled=samplePositionKeys(c.positionKeys,t-c.start);return sampled.map((v,i)=>v+(c.position?.[i]??0)) as Vec3;
}
export function editClipPosition(p:Project,id:string,t:number,value:Vec3,auto:boolean){
 const c=p.clips.find(c=>c.id===id);if(!c)return;
 if(auto||c.positionKeys?.some(k=>atFrame(k.time,t-c.start,p))){putClipPosition(p,id,t,value);return;}
 const keyed=samplePositionKeys(c.positionKeys,t-c.start);c.position=value.map((v,i)=>v-keyed[i]) as Vec3;
}
export function putStageTransformPosition(p:Project,t:number,position:Vec3){
 const time=frame(p,t),keys=p.stagePositionKeys??[],without=stageTransformAt({...p,stagePositionKeys:[]},time).position;
 if(!keys.length&&time>0)keys.push({id:uid(),time:0,position:[0,0,0],ease:'smoother'});
 const found=keys.find(k=>atFrame(k.time,time,p));
 p.stagePositionKeys=[...keys.filter(k=>k!==found),{id:found?.id??uid(),time,position:position.map((v,i)=>v-without[i]) as Vec3,ease:'smoother'}];
}
export function editStagePosition(p:Project,t:number,position:Vec3,auto:boolean){
 if(auto||p.stagePositionKeys?.some(k=>atFrame(k.time,t,p))){putStageTransformPosition(p,t,position);return;}
 const now=stageTransformAt(p,t).position;p.stageTransform??={};const base=p.stageTransform.position??[0,0,0];p.stageTransform.position=base.map((v,i)=>v+position[i]-now[i]) as Vec3;
}
export function putCameraKey(p:Project,pose:CameraPose,t:number){setCameraPose(p,pose,t,true);}
export function insertTransformKeys(p:Project,target:Target,member:number,t:number,camera?:CameraPose){
 if(target==='camera'){putCameraKey(p,cameraPoseAt(p,t),t);return;}
 const pose=target==='member'?memberTransformAt(p,member,t):stageTransformAt(p,t);
 if(target==='member')putMemberPosition(p,member,t,positionsAt(p,t)[member]);else putStageTransformPosition(p,t,stageTransformAt(p,t).position);
 for(const property of ['rotation','scale','visible'] as Property[])putPropertyKey(p,target,member,property,(pose as unknown as Record<Property,Vec3|boolean>)[property],t);
 if(target==='member')putPropertyKey(p,target,member,'color',memberTransformAt(p,member,t).color,t);
}

export function keyArray(p:Project,ref:KeyRef):{id:string;time:number;ease?:Ease}[]{
 switch(ref.kind){case 'memberPosition':return p.memberPositionKeys??[];case 'memberProperty':return p.memberPropertyKeys??[];case 'clipPosition':return p.clips.find(c=>c.id===ref.clip)?.positionKeys??[];case 'stagePosition':return p.stagePositionKeys??[];case 'stagePreset':return p.stageKeys??[];case 'stageProperty':return p.stagePropertyKeys??[];case 'formation':return p.formations;case 'camera':return (ref.camera?p.sceneCameras?.find(c=>c.id===ref.camera):activeCamera(p))?.keys??p.cameras;}
}
export function keyGlobalTime(p:Project,ref:KeyRef){const key=keyArray(p,ref).find(k=>k.id===ref.id);return (key?.time??0)+(ref.kind==='clipPosition'?(p.clips.find(c=>c.id===ref.clip)?.start??0):0);}
export function deleteKey(p:Project,ref:KeyRef){const keys=keyArray(p,ref),index=keys.findIndex(k=>k.id===ref.id);if(index>=0)keys.splice(index,1);}
export function moveKey(p:Project,ref:KeyRef,time:number){
 const key=keyArray(p,ref).find(k=>k.id===ref.id);if(!key)return;
 const c=ref.kind==='clipPosition'?p.clips.find(c=>c.id===ref.clip):undefined;
 key.time=c?Math.max(0,Math.min(c.duration,frame(p,time)-c.start)):frame(p,time);
 const keys=keyArray(p,ref),channel=key as typeof key & {member?:number;property?:Property};
 for(let i=keys.length-1;i>=0;i--){const other=keys[i] as typeof channel;if(other!==key&&atFrame(other.time,key.time,p)&&other.member===channel.member&&other.property===channel.property)keys.splice(i,1);}
}
