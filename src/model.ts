import {Color,Euler,Matrix4,Quaternion,Vector3} from 'three';
export type Vec3 = [number,number,number];
export type Ease = 'smooth'|'smoother'|'linear';
export type PositionKey = {id:string;time:number;position:Vec3;ease:Ease};
export type MemberPositionKey = PositionKey & {member:number};
export type StageKey = PositionKey & {name:string;transition:number};
export type Clip = {id:string;member:number;asset:string;start:number;duration:number;offset:number;speed:number;loop:boolean;fade:number;positionKeys?:PositionKey[];position?:Vec3};
export type Formation = {id:string;time:number;transition:number;ease:Ease;name:string;positions:Vec3[]};
export type CameraPose = {position:Vec3;target:Vec3;projection?:'perspective'|'orthographic';zoom?:number;up?:Vec3;rotation?:Vec3;fov?:number};
export type SceneCamera = {id:string;number:number;name:string;base:CameraPose;keys:CameraKey[];recordStart:number;recordEnd:number;enabled:boolean};
export type CameraKey = CameraPose & {id:string;time:number};
export type Property = 'rotation'|'scale'|'color'|'visible';
export type PropertyKey = {id:string;time:number;ease:Ease} & ({property:'rotation'|'scale';value:Vec3}|{property:'color';value:string}|{property:'visible';value:boolean});
export type MemberPropertyKey = PropertyKey & {member:number};
export type TransformBase = {position?:Vec3;rotation?:Vec3;scale?:Vec3;visible?:boolean};
export type AssetInfo = {id:string;name:string;kind:'demo'|'fbx'|'audio';duration:number;size?:number};
export type Project = {version:1;name:string;duration:number;bpm:number;beatOffset:number;rate:number;baseRig:string|null;assets:AssetInfo[];audio:string|null;members:{name:string;color:string;rotation:number;scale:number;position?:Vec3;rotationXYZ?:Vec3;scaleXYZ?:Vec3;visible?:boolean}[];clips:Clip[];formations:Formation[];cameras:CameraKey[];sceneCameras?:SceneCamera[];activeCameraId?:string;cameraBase?:CameraPose;stageKeys?:StageKey[];stagePositionKeys?:PositionKey[];stageTransform?:TransformBase;stagePropertyKeys?:PropertyKey[];memberPositionKeys?:MemberPositionKey[];memberPropertyKeys?:MemberPropertyKey[];output:{aspect:'16:9'|'9:16';height:720|1080;fps:24|30;start:number;end:number;audio:boolean};};
export const uid=()=>crypto.randomUUID();
export const colors=['#719eff','#b994ef','#60c8b3','#eeac71','#e57f9f'];
export const formationNames=['V Formation','Straight Line','Two Rows','Diagonal','Diamond','Inverted V'];
export function preset(name:string):Vec3[]{
 const map:Record<string,Vec3[]>={
 'V Formation':[[-3,0,-1.6],[-1.5,0,-.8],[0,0,0],[1.5,0,-.8],[3,0,-1.6]],
 'Straight Line':[[-3,0,0],[-1.5,0,0],[0,0,0],[1.5,0,0],[3,0,0]],
 'Two Rows':[[-2,0,-1.5],[0,0,-1.5],[2,0,-1.5],[-1,0,.5],[1,0,.5]],
 'Diagonal':[[-2.8,0,-2],[-1.4,0,-1],[0,0,0],[1.4,0,1],[2.8,0,2]],
 'Diamond':[[0,0,-2],[-1.8,0,0],[0,0,0],[1.8,0,0],[0,0,2]],
 'Inverted V':[[-3,0,0],[-1.5,0,-.8],[0,0,-1.6],[1.5,0,-.8],[3,0,0]]};
 return structuredClone(map[name]??map['V Formation']);
}
export function eased(value:number,ease:Ease):number{
 const a=Math.max(0,Math.min(1,value));
 return ease==='smoother'?a*a*a*(a*(a*6-15)+10):ease==='smooth'?a*a*(3-2*a):a;
}
export function formationPositionsAt(p:Pick<Project,'formations'>,t:number):Vec3[]{
 const keys=[...p.formations].sort((a,b)=>a.time-b.time);
 if(!keys.length)return preset('V Formation');
 const sample=(index:number,time:number):Vec3[]=>{
  if(index===0)return structuredClone(keys[0].positions);
  const k=keys[index];if(time<k.time)return sample(index-1,time);
  const from=sample(index-1,k.time);
  const a=k.transition<=0?1:eased((time-k.time)/k.transition,k.ease);
  return from.map((v,j)=>v.map((n,axis)=>n+(k.positions[j][axis]-n)*a) as Vec3);
 };
 return sample(keys.length-1,t);
}
export function samplePositionKeys(keys:PositionKey[]|undefined,t:number):Vec3{
 if(!keys?.length)return [0,0,0];
 const sorted=[...keys].sort((a,b)=>a.time-b.time);
 if(t<=sorted[0].time)return [...sorted[0].position];
 for(let i=1;i<sorted.length;i++){
  const a=sorted[i-1],b=sorted[i];
  if(t<=b.time){const weight=eased((t-a.time)/Math.max(.000001,b.time-a.time),b.ease);return a.position.map((v,axis)=>v+(b.position[axis]-v)*weight) as Vec3;}
 }
 return [...sorted.at(-1)!.position];
}
export function stagePositionAt(p:Pick<Project,'stageKeys'|'stagePositionKeys'|'stageTransform'>,t:number):Vec3{
 const keys=[...(p.stageKeys??[])].sort((a,b)=>a.time-b.time);
 const sample=(index:number,time:number):Vec3=>{
  if(index<0)return [0,0,0];const k=keys[index];if(time<k.time)return sample(index-1,time);
  const from=sample(index-1,k.time);const a=k.transition<=0?1:eased((time-k.time)/k.transition,k.ease);
  return from.map((v,axis)=>v+(k.position[axis]-v)*a) as Vec3;
 };
 const base=p.stageTransform?.position??[0,0,0];return sample(keys.length-1,t).map((v,i)=>v+base[i]+samplePositionKeys(p.stagePositionKeys,t)[i]) as Vec3;
}
export function sampleProperty(keys:PropertyKey[]|undefined,property:Property,t:number,fallback:Vec3|string|boolean):Vec3|string|boolean{
 const sorted=keys?.filter(k=>k.property===property).sort((a,b)=>a.time-b.time)??[];
 if(!sorted.length)return Array.isArray(fallback)?[...fallback] as Vec3:fallback;
 if(t<=sorted[0].time)return structuredClone(sorted[0].value);
 for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i];if(t<=b.time){if(property==='visible')return t<b.time?a.value:b.value;const weight=eased((t-a.time)/Math.max(.000001,b.time-a.time),b.ease);if(property==='color')return '#'+new Color(a.value as string).lerp(new Color(b.value as string),weight).getHexString();return (a.value as Vec3).map((v,axis)=>v+((b.value as Vec3)[axis]-v)*weight) as Vec3;}}
 return structuredClone(sorted.at(-1)!.value);
}
export function memberTransformAt(p:Project,member:number,t:number){
 const m=p.members[member],keys=p.memberPropertyKeys?.filter(k=>k.member===member);
 return {rotation:sampleProperty(keys,'rotation',t,m.rotationXYZ??[0,m.rotation,0]) as Vec3,scale:sampleProperty(keys,'scale',t,m.scaleXYZ??[m.scale,m.scale,m.scale]) as Vec3,color:sampleProperty(keys,'color',t,m.color) as string,visible:sampleProperty(keys,'visible',t,m.visible??true) as boolean};
}
export function stageTransformAt(p:Pick<Project,'stageKeys'|'stagePositionKeys'|'stageTransform'|'stagePropertyKeys'>,t:number){
 const base=p.stageTransform??{};
 return {position:stagePositionAt(p,t),rotation:sampleProperty(p.stagePropertyKeys,'rotation',t,base.rotation??[0,0,0]) as Vec3,scale:sampleProperty(p.stagePropertyKeys,'scale',t,base.scale??[1,1,1]) as Vec3,visible:sampleProperty(p.stagePropertyKeys,'visible',t,base.visible??true) as boolean};
}
type PositionProject=Pick<Project,'formations'> & Partial<Pick<Project,'stageKeys'|'stagePositionKeys'|'stageTransform'|'stagePropertyKeys'|'memberPositionKeys'|'members'|'clips'>>;
export function localPositionsAt(p:PositionProject,t:number):Vec3[]{
 const formation=formationPositionsAt(p,t);
 return formation.map((position,member)=>{
  const own=samplePositionKeys(p.memberPositionKeys?.filter(k=>k.member===member),t);
  const active=p.clips?.filter(c=>c.member===member&&clipWeight(c,t)>0)??[];
  const total=active.reduce((sum,c)=>sum+clipWeight(c,t),0);
  const local:Vec3=[0,0,0];
  for(const c of active){const offset=samplePositionKeys(c.positionKeys,t-c.start),weight=clipWeight(c,t)/Math.max(1,total);for(let axis=0;axis<3;axis++)local[axis]+=(offset[axis]+(c.position?.[axis]??0))*weight;}
  return position.map((v,axis)=>v+(p.members?.[member].position?.[axis]??0)+own[axis]+local[axis]) as Vec3;
 });
}
export function positionsAt(p:PositionProject,t:number):Vec3[]{
 const stage=stageTransformAt(p,t),rotation=new Euler(...stage.rotation.map(v=>v*Math.PI/180) as Vec3,'XYZ');
 return localPositionsAt(p,t).map(v=>new Vector3(...v).multiply(new Vector3(...stage.scale)).applyEuler(rotation).add(new Vector3(...stage.position)).toArray() as Vec3);
}
export function worldDeltaToLocal(p:Project,t:number,delta:Vec3):Vec3{
 const stage=stageTransformAt(p,t),q=new Quaternion().setFromEuler(new Euler(...stage.rotation.map(v=>v*Math.PI/180) as Vec3,'XYZ')).invert();
 return new Vector3(...delta).applyQuaternion(q).divide(new Vector3(...stage.scale)).toArray() as Vec3;
}
export const stagePositionPresets:{name:string;position:Vec3}[]=[
 {name:'Center · 무대 중앙',position:[0,0,0]},
 {name:'Downstage · 무대 앞',position:[0,0,2.5]},
 {name:'Upstage · 무대 뒤',position:[0,0,-2.5]},
 {name:'Stage left · 왼쪽',position:[-2.5,0,0]},
 {name:'Stage right · 오른쪽',position:[2.5,0,0]},
];
export function naturalizeFormations(p:Project,speed=1.2){
 const keys=[...p.formations].sort((a,b)=>a.time-b.time);
 keys.forEach((key,index)=>{
  key.ease='smoother';if(index===0){key.transition=0;return;}
  const before=keys[index-1].positions;
  const distance=Math.max(...key.positions.map((pos,i)=>Math.hypot(...pos.map((v,axis)=>v-before[i][axis]))));
  const available=Math.max(0,(keys[index+1]?.time??p.duration)-key.time);
  key.transition=Math.min(available,Math.max(.4,Math.min(12,distance/Math.max(.1,speed))));
 });
}
/** Trim timeline edges without changing the remaining source pose or motion path. */
export function trimClip(c:Clip,edge:'left'|'right',time:number,assetDuration:number,projectDuration:number,fps:number):Clip{
 const next=structuredClone(c),frame=Math.min(1/fps,Math.max(.000001,edge==='right'?projectDuration-c.start:c.duration)),end=c.start+c.duration;
 if(edge==='right')next.duration=Math.max(frame,Math.min(projectDuration,Math.max(c.start+frame,time))-c.start);
 else{
  const earliest=c.loop?0:Math.max(0,c.start-c.offset/c.speed);
  next.start=Math.min(end-frame,Math.max(earliest,time));next.duration=end-next.start;
  const raw=c.offset+(next.start-c.start)*c.speed;
  next.offset=c.loop?((raw%assetDuration)+assetDuration)%assetDuration:Math.max(0,raw);
 }
 if(c.positionKeys?.length)next.positionKeys=c.positionKeys.map(k=>({...k,position:[...k.position] as Vec3,time:k.time-(next.start-c.start)}));
 next.fade=Math.min(next.fade,next.duration/2);
 return next;
}
export function clipLocal(c:Clip,t:number,assetDuration:number){const raw=c.offset+(t-c.start)*c.speed;return c.loop?((raw%assetDuration)+assetDuration)%assetDuration:Math.min(assetDuration,Math.max(0,raw));}
export function clipWeight(c:Clip,t:number){if(t<c.start||t>=c.start+c.duration)return 0; const f=Math.min(c.fade,c.duration/2); return f>0?Math.min(1,(t-c.start)/f,(c.start+c.duration-t)/f):1;}
export function cameraRotation(pose:CameraPose):Vec3{
 if(pose.rotation)return [...pose.rotation];
 const matrix=new Matrix4().lookAt(new Vector3(...pose.position),new Vector3(...pose.target),new Vector3(...(pose.up??[0,1,0])));
 const euler=new Euler().setFromRotationMatrix(matrix,'YXZ');return [euler.x,euler.y,euler.z].map(v=>v*180/Math.PI) as Vec3;
}
export function cameraAt(keys:CameraKey[],t:number):CameraKey|null{
 if(!keys.length)return null;const sorted=[...keys].sort((a,b)=>a.time-b.time);let a=sorted[0],b=a;
 for(let i=1;i<sorted.length;i++){b=sorted[i];if(t<b.time)break;a=b;}
 const q=a.time===b.time?0:Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time))),f=q*q*(3-2*q);
 const ar=cameraRotation(a),br=cameraRotation(b);
 return {...a,position:a.position.map((n,i)=>n+(b.position[i]-n)*f) as Vec3,target:a.target.map((n,i)=>n+(b.target[i]-n)*f) as Vec3,rotation:ar.map((n,i)=>n+(br[i]-n)*f) as Vec3,zoom:(a.zoom??1)+((b.zoom??1)-(a.zoom??1))*f,fov:(a.fov??38)+((b.fov??38)-(a.fov??38))*f};
}
export const demos:AssetInfo[]=[{id:'demo-groove',name:'Groove / 기본 그루브',kind:'demo',duration:4},{id:'demo-hit',name:'Arm hits / 팔 동작',kind:'demo',duration:4},{id:'demo-step',name:'Side step / 스텝',kind:'demo',duration:4}];
export function initialProject():Project{return {version:1,name:'VOYAGER · First rehearsal',duration:24,bpm:120,beatOffset:0,rate:1,baseRig:null,assets:demos,audio:null,members:['은유','지겸','서우','이혁','도경'].map((name,i)=>({name,color:colors[i],rotation:0,scale:1})),clips:Array.from({length:5},(_,member)=>[{id:uid(),member,asset:'demo-groove',start:0,duration:8,offset:0,speed:1,loop:true,fade:.15},{id:uid(),member,asset:'demo-hit',start:8,duration:8,offset:0,speed:1,loop:true,fade:.3},{id:uid(),member,asset:'demo-step',start:16,duration:8,offset:0,speed:1,loop:true,fade:.3}]).flat(),formations:[{id:uid(),time:0,transition:0,ease:'smoother',name:'V Formation',positions:preset('V Formation')},{id:uid(),time:8,transition:2,ease:'smoother',name:'Straight Line',positions:preset('Straight Line')},{id:uid(),time:16,transition:2,ease:'smoother',name:'Diamond',positions:preset('Diamond')}],cameras:[],memberPositionKeys:[],stageKeys:[{id:uid(),time:0,transition:0,ease:'smoother',name:'Center · 무대 중앙',position:[0,0,0]}],output:{aspect:'16:9',height:720,fps:30,start:0,end:24,audio:true}};}
export function validateProject(value:unknown):Project{
 const p=value as Project;
 const finite=(x:unknown)=>typeof x==='number'&&Number.isFinite(x);
 const vec=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(finite);
 if(!p||p.version!==1||!Array.isArray(p.members)||p.members.length!==5||!p.members.every(m=>typeof m.name==='string'&&finite(m.rotation)&&finite(m.scale)&&m.scale>0)||!finite(p.duration)||p.duration<=0||p.duration>3600||!finite(p.bpm)||p.bpm<20||p.bpm>300||!finite(p.rate)||p.rate<.25||p.rate>2||!finite(p.beatOffset))throw Error('지원하지 않거나 손상된 프로젝트입니다.');
 if(!Array.isArray(p.assets)||!p.assets.every(a=>typeof a.id==='string'&&typeof a.name==='string'&&['demo','fbx','audio'].includes(a.kind)&&finite(a.duration)&&a.duration>0)||!Array.isArray(p.clips)||!p.clips.every(c=>typeof c.id==='string'&&Number.isInteger(c.member)&&c.member>=0&&c.member<5&&p.assets.some(a=>a.id===c.asset&&a.kind!=='audio')&&[c.start,c.duration,c.offset,c.speed,c.fade].every(finite)&&c.start>=0&&c.duration>0&&c.offset>=0&&c.speed>0&&c.fade>=0)||!Array.isArray(p.formations)||!p.formations.every(k=>finite(k.time)&&k.time>=0&&finite(k.transition)&&k.transition>=0&&Array.isArray(k.positions)&&k.positions.length===5&&k.positions.every(vec)&&['smooth','smoother','linear'].includes(k.ease))||!Array.isArray(p.cameras)||!p.cameras.every(k=>finite(k.time)&&vec(k.position)&&vec(k.target)))throw Error('프로젝트 트랙 데이터가 올바르지 않습니다.');
 if(!p.output||!['16:9','9:16'].includes(p.output.aspect)||![720,1080].includes(p.output.height)||![24,30].includes(p.output.fps)||![p.output.start,p.output.end].every(finite)||p.output.start<0||p.output.end<=p.output.start||p.output.end>p.duration)throw Error('출력 구간이나 설정이 올바르지 않습니다.');
 const ease=(v:unknown)=>['smooth','smoother','linear'].includes(v as string);
 const positionKey=(k:PositionKey)=>k&&typeof k.id==='string'&&finite(k.time)&&vec(k.position)&&ease(k.ease);
 if(p.members.some(m=>typeof m.color!=='string'||!/^#[a-f0-9]{6}$/i.test(m.color))||p.clips.some(c=>c.positionKeys!==undefined&&(!Array.isArray(c.positionKeys)||!c.positionKeys.every(positionKey)))||p.memberPositionKeys!==undefined&&(!Array.isArray(p.memberPositionKeys)||!p.memberPositionKeys.every(k=>positionKey(k)&&k.time>=0&&Number.isInteger(k.member)&&k.member>=0&&k.member<5))||p.stageKeys!==undefined&&(!Array.isArray(p.stageKeys)||!p.stageKeys.every(k=>positionKey(k)&&k.time>=0&&finite(k.transition)&&k.transition>=0&&typeof k.name==='string'))||p.cameras.some(k=>k.projection!==undefined&&!['perspective','orthographic'].includes(k.projection)||k.zoom!==undefined&&(!finite(k.zoom)||k.zoom<=0)||k.up!==undefined&&!vec(k.up)))throw Error('캐릭터 색상 또는 위치/카메라 키프레임이 올바르지 않습니다.');
 const propertyKey=(k:PropertyKey)=>k&&typeof k.id==='string'&&finite(k.time)&&k.time>=0&&ease(k.ease)&&(['rotation','scale'].includes(k.property)?vec(k.value)&&(k.property!=='scale'||(k.value as Vec3).every(v=>v>0)):k.property==='color'?typeof k.value==='string'&&/^#[a-f0-9]{6}$/i.test(k.value):k.property==='visible'&&typeof k.value==='boolean');
 const base=(b:TransformBase)=>b&&(!b.position||vec(b.position))&&(!b.rotation||vec(b.rotation))&&(!b.scale||vec(b.scale)&&b.scale.every(v=>v>0))&&(b.visible===undefined||typeof b.visible==='boolean');
 const cameraPose=(c:CameraPose)=>c&&vec(c.position)&&vec(c.target)&&(c.rotation===undefined||vec(c.rotation))&&(c.fov===undefined||finite(c.fov)&&c.fov>=5&&c.fov<=150)&&(c.zoom===undefined||finite(c.zoom)&&c.zoom>0)&&(c.up===undefined||vec(c.up))&&(c.projection===undefined||['perspective','orthographic'].includes(c.projection));
 if(p.stagePositionKeys!==undefined&&(!Array.isArray(p.stagePositionKeys)||!p.stagePositionKeys.every(k=>positionKey(k)&&k.time>=0))||p.members.some(m=>!base({position:m.position,rotation:m.rotationXYZ,scale:m.scaleXYZ,visible:m.visible}))||p.clips.some(c=>c.position!==undefined&&!vec(c.position))||p.memberPropertyKeys!==undefined&&(!Array.isArray(p.memberPropertyKeys)||!p.memberPropertyKeys.every(k=>propertyKey(k)&&Number.isInteger(k.member)&&k.member>=0&&k.member<5))||p.stagePropertyKeys!==undefined&&(!Array.isArray(p.stagePropertyKeys)||!p.stagePropertyKeys.every(propertyKey))||p.stageTransform!==undefined&&!base(p.stageTransform)||p.cameraBase!==undefined&&!cameraPose(p.cameraBase)||p.cameras.some(c=>!cameraPose(c)))throw Error('변환 또는 카메라 키프레임 데이터가 올바르지 않습니다.');
 if(p.sceneCameras!==undefined&&(!Array.isArray(p.sceneCameras)||!p.sceneCameras.length||!p.sceneCameras.every(c=>c&&typeof c.id==='string'&&Number.isInteger(c.number)&&c.number>0&&typeof c.name==='string'&&cameraPose(c.base)&&Array.isArray(c.keys)&&c.keys.every(k=>typeof k.id==='string'&&finite(k.time)&&k.time>=0&&cameraPose(k))&&finite(c.recordStart)&&finite(c.recordEnd)&&c.recordStart>=0&&c.recordEnd>c.recordStart&&c.recordEnd<=p.duration&&typeof c.enabled==='boolean')||new Set(p.sceneCameras.map(c=>c.id)).size!==p.sceneCameras.length||new Set(p.sceneCameras.map(c=>c.number)).size!==p.sceneCameras.length))throw Error('카메라 설정이 올바르지 않습니다.');
 return p;
}
