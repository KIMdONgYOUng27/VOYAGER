import {uid,positionsAt,samplePositionKeys,stagePositionAt,formationPositionsAt,preset,eased,worldDeltaToLocal,type Project,type PositionKey,type Vec3,type Ease} from './model.ts';

const frameTime=(p:Project,t:number)=>Math.round(t*p.output.fps)/p.output.fps;
function upsert<T extends PositionKey>(keys:T[],key:T):T[]{
 const previous=keys.find(k=>Math.abs(k.time-key.time)<.00001);
 return [...keys.filter(k=>k!==previous),{...key,id:previous?.id??key.id}].sort((a,b)=>a.time-b.time);
}
export function putMemberPosition(p:Project,member:number,time:number,world:Vec3,ease:Ease='smoother'){
 const t=frameTime(p,Math.max(0,Math.min(time,p.duration)));
 const others=(p.memberPositionKeys??[]).filter(k=>k.member!==member);
 const own=(p.memberPositionKeys??[]).filter(k=>k.member===member);
 const base=positionsAt({...p,memberPositionKeys:others},t)[member];
 if(!own.length&&t>0)own.push({id:uid(),member,time:0,position:[0,0,0],ease});
 p.memberPositionKeys=[...others,...upsert(own,{id:uid(),member,time:t,position:worldDeltaToLocal(p,t,world.map((v,i)=>v-base[i]) as Vec3),ease})];
}
export function putClipPosition(p:Project,clipId:string,time:number,position:Vec3,ease:Ease='smoother'){
 const clip=p.clips.find(c=>c.id===clipId);if(!clip)throw Error('먼저 모션 클립을 선택하세요.');
 if(time<clip.start-.0001||time>clip.start+clip.duration+.0001)throw Error('재생 헤드를 선택한 클립 안에 놓으세요.');
 const local=Math.max(0,Math.min(clip.duration,frameTime(p,time-clip.start)));
 const keys=clip.positionKeys??[];
 if(!keys.length&&local>0)keys.push({id:uid(),time:0,position:[0,0,0],ease});
 clip.positionKeys=upsert(keys,{id:uid(),time:local,position:position.map((v,i)=>v-(clip.position?.[i]??0)) as Vec3,ease});
}
export function putStagePosition(p:Project,time:number,position:Vec3,name:string,transition:number){
 const t=frameTime(p,time),keys=p.stageKeys??[];
 if(!keys.length&&t>0)keys.push({id:uid(),time:0,position:[0,0,0],name:'Center · 무대 중앙',transition:0,ease:'smoother'});
 const next=keys.filter(k=>k.time>t+.0001).sort((a,b)=>a.time-b.time)[0]?.time??p.duration;
 p.stageKeys=upsert(keys,{id:uid(),time:t,position:position.map((v,i)=>v-(p.stageTransform?.position?.[i]??0)) as Vec3,name,transition:t===0?0:Math.max(0,Math.min(transition,next-t)),ease:'smoother'});
}
export function putFormation(p:Project,name:string,time:number,transition:number,natural:boolean){
 const t=frameTime(p,time),target=preset(name);
 if(natural){const previous=p.formations.filter(k=>k.time<t).sort((a,b)=>b.time-a.time)[0];if(previous&&previous.time+previous.transition>t)previous.transition=t-previous.time;}
 const from=formationPositionsAt(p,t);
 const distance=Math.max(...target.map((v,i)=>Math.hypot(...v.map((n,axis)=>n-from[i][axis]))));
 const next=p.formations.filter(k=>k.time>t+.0001).sort((a,b)=>a.time-b.time)[0]?.time??p.duration;
 const duration=t===0?0:Math.min(next-t,natural?Math.max(.4,Math.min(12,distance/1.2)):transition);
 const previous=p.formations.find(k=>Math.abs(k.time-t)<.00001);
 p.formations=[...p.formations.filter(k=>k!==previous),{id:previous?.id??uid(),time:t,transition:Math.max(0,duration),ease:natural?'smoother':'smooth',name,positions:target}];
}

export function worldPositionWithoutMemberTrack(p:Project,member:number,t:number):Vec3{
 return positionsAt({...p,memberPositionKeys:p.memberPositionKeys?.filter(k=>k.member!==member)},t)[member];
}
