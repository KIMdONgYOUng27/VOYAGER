import {useEffect,useState} from 'react';
import {Crosshair,Diamond,Plus,Trash2,Users,MapPin,Route,X} from 'lucide-react';
import {useStudio,notice} from './store';
import {colors,positionsAt,samplePositionKeys,stagePositionAt,stagePositionPresets,formationNames,preset,naturalizeFormations,type Vec3,type Ease,type PositionKey} from './model';
import {putMemberPosition,putClipPosition,putStagePosition,putFormation} from './spatial';

type Seek=(time:number)=>void;
const format=(t:number)=>`${t<0?'-':''}${String(Math.floor(Math.abs(t)/60)).padStart(2,'0')}:${(Math.abs(t)%60).toFixed(2).padStart(5,'0')}`;
const easeOptions=<><option value="smoother">자연스럽게 · 부드러운 출발/도착</option><option value="smooth">부드럽게</option><option value="linear">일정 속도</option></>;
function VecFields({value,onChange,label='위치'}:{value:Vec3;onChange:(v:Vec3)=>void;label?:string}){
 return <div className="three-fields">{['X','Y','Z'].map((axis,index)=><label className="number-field" key={axis}><span>{axis}</span><input aria-label={`${label} ${axis}`} type="number" min={-30} max={30} step={.1} value={Math.round(value[index]*1000)/1000} onChange={e=>{if(!Number.isFinite(e.target.valueAsNumber))return;const next=[...value] as Vec3;next[index]=Math.max(-30,Math.min(30,e.target.valueAsNumber));onChange(next);}}/></label>)}</div>;
}
export function MemberPositionEditor({seek}:{seek:Seek}){
 const p=useStudio(s=>s.project),member=useStudio(s=>s.selected),clipId=useStudio(s=>s.clip),time=useStudio(s=>s.time);
 const clip=p.clips.find(c=>c.id===clipId&&c.member===member);
 const [scope,setScope]=useState<'member'|'clip'>('member'),[method,setMethod]=useState<Ease>('smoother'),[chosen,setChosen]=useState('');
 useEffect(()=>{setScope(clip?'clip':'member');setChosen('');},[clip?.id,member]);
 const local=scope==='clip'&&clip;
 const keys:PositionKey[]=local?clip.positionKeys??[]:p.memberPositionKeys?.filter(k=>k.member===member)??[];
 const selected=keys.find(k=>k.id===chosen);
 const world=positionsAt(p,time)[member];
 const value=local?samplePositionKeys(clip.positionKeys,time-clip.start):world;
 const visible=keys.filter(k=>!local||k.time>=-.00001&&k.time<=clip.duration+.00001);
 const put=(next:Vec3)=>{try{useStudio.getState().edit(d=>{if(local)putClipPosition(d,clip.id,time,next,method);else putMemberPosition(d,member,time,next,method);});}catch(e){notice((e as Error).message);}};
 return <>
  <div className="member-color-field"><label>캐릭터 색상<input aria-label="캐릭터 색상" type="color" value={p.members[member].color} onChange={e=>useStudio.getState().edit(d=>{d.members[member].color=e.target.value;})}/></label><div className="color-swatches">{colors.map(color=><button key={color} title={`색상 ${color}`} aria-label={`색상 ${color}`} style={{background:color}} onClick={()=>useStudio.getState().edit(d=>{d.members[member].color=color;})}/>)}</div></div>
  <label className="field-label">위치 프레임 대상<select aria-label="위치 프레임 대상" value={scope} onChange={e=>{setScope(e.target.value as 'member'|'clip');setChosen('');}}><option value="member">이 멤버 · 전체 타임라인</option><option value="clip" disabled={!clip}>선택한 클립 · 클립 안에서만</option></select></label>
  <div className="spatial-caption">{local?'클립 이동 오프셋 · m':'무대 위 멤버 위치 · m'}<span>{local?format(time-clip.start):format(time)}</span></div>
  <VecFields value={value} label={local?'클립 위치':'멤버 위치'} onChange={put}/>
  <label className="field-label">위치 키 보간<select aria-label="위치 키 보간" value={selected?.ease??method} onChange={e=>{const ease=e.target.value as Ease;setMethod(ease);if(selected)useStudio.getState().edit(d=>{const target=local?d.clips.find(c=>c.id===clip.id)?.positionKeys:d.memberPositionKeys;const k=target?.find(k=>k.id===selected.id);if(k)k.ease=ease;});}}>{easeOptions}</select></label>
  <button className="full-button" onClick={()=>put(value)}><Plus size={13}/>현재 시간에 위치 키 추가</button>
  <p className="field-note">{local?'클립 이동은 대형에 더해집니다. 클립을 옮기거나 자르면 위치 키도 함께 이동합니다.':'한 멤버의 이동만 편집합니다. 전체 무대 이동과 대형은 무대 & 카메라에서 설정하세요.'}</p>
  <div className="key-list position-key-list">{[...visible].sort((a,b)=>a.time-b.time).map(k=><div className={chosen===k.id?'selected':''} key={k.id}><button onClick={()=>{setChosen(k.id);seek(k.time+(local?clip.start:0));}}><Diamond size={9}/>{format(k.time)}<span>{local?'클립 위치':'멤버 위치'}</span></button><button title="위치 키 삭제" aria-label="위치 키 삭제" onClick={()=>useStudio.getState().edit(d=>{if(local){const c=d.clips.find(c=>c.id===clip.id)!;c.positionKeys=c.positionKeys?.filter(x=>x.id!==k.id);}else d.memberPositionKeys=d.memberPositionKeys?.filter(x=>x.id!==k.id);})}><X size={12}/></button></div>)}</div>
  {keys.length>visible.length&&<p className="field-note">트림 밖에 보존된 위치 키 {keys.length-visible.length}개 · 클립을 늘리면 다시 보입니다.</p>}
 </>;
}

export function StageFormationEditor({seek}:{seek:Seek}){
 const p=useStudio(s=>s.project),time=useStudio(s=>s.time);
 const [stageName,setStageName]=useState(stagePositionPresets[0].name),[stageTarget,setStageTarget]=useState<Vec3>([0,0,0]),[stageDuration,setStageDuration]=useState(2),[stageId,setStageId]=useState('');
 const [formation,setFormation]=useState('V Formation'),[duration,setDuration]=useState(2),[natural,setNatural]=useState(true),[formationId,setFormationId]=useState('');
 const stageKey=p.stageKeys?.find(k=>k.id===stageId),key=p.formations.find(k=>k.id===formationId);
 const edit=useStudio.getState().edit;
 return <>
  <section className="inspector-section"><div className="section-title"><span>STAGE POSITION · 무대 위치</span><MapPin size={13}/></div>
   <label className="field-label">무대 위치 프리셋<select aria-label="무대 위치 프리셋" value={stageName} onChange={e=>{setStageName(e.target.value);const preset=stagePositionPresets.find(p=>p.name===e.target.value);if(preset)setStageTarget([...preset.position]);}}>{stagePositionPresets.map(p=><option key={p.name}>{p.name}</option>)}<option value="Custom">Custom · 직접 입력</option></select></label>
   <VecFields value={stageTarget} label="무대 프리셋 위치" onChange={v=>{setStageTarget(v);setStageName('Custom');}}/>
   <label className="number-field"><span>전체 이동 시간 · s</span><input aria-label="무대 이동 시간" type="number" min={0} max={30} step={.1} value={stageDuration} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))setStageDuration(Math.max(0,Math.min(30,e.target.valueAsNumber)));}}/></label>
   <button className="full-button accent" onClick={()=>edit(d=>putStagePosition(d,time,stageTarget,stageName,stageDuration))}><Plus size={13}/>현재 시간에 무대 위치 추가</button>
   <p className="field-note">5명 전체를 이동합니다. 대형 모양과 각 멤버의 개별 이동은 유지됩니다.</p>
   <div className="key-list">{[...(p.stageKeys??[])].sort((a,b)=>a.time-b.time).map(k=><div className={stageId===k.id?'selected':''} key={k.id}><button onClick={()=>{setStageId(k.id);setStageTarget([...k.position]);setStageName(stagePositionPresets.some(p=>p.name===k.name)?k.name:'Custom');seek(k.time);}}><i/>{format(k.time)}<span>{k.name}</span></button><button title="무대 위치 키 삭제" aria-label="무대 위치 키 삭제" onClick={()=>edit(d=>{d.stageKeys=d.stageKeys?.filter(x=>x.id!==k.id);})}><X size={12}/></button></div>)}</div>
   {stageKey&&<label className="number-field"><span>선택 키 이동 시간 · s</span><input aria-label="선택 무대 키 이동 시간" type="number" min={0} max={30} step={.1} value={stageKey.transition} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))edit(d=>{d.stageKeys!.find(k=>k.id===stageKey.id)!.transition=Math.max(0,Math.min(30,e.target.valueAsNumber));});}}/></label>}
  </section>
  <section className="inspector-section"><div className="section-title"><span>FORMATION · 군무 대형</span><Users size={13}/></div>
   <label className="field-label">군무 대형 프리셋<select aria-label="군무 대형 프리셋" value={formation} onChange={e=>setFormation(e.target.value)}>{formationNames.map(n=><option key={n}>{n}</option>)}</select></label>
   <div className="formation-map">{preset(formation).map((v,i)=><i key={i} style={{left:`${50+v[0]*11}%`,top:`${53+v[2]*12}%`,background:p.members[i].color}}>{i+1}</i>)}<span>FRONT</span></div>
   <label className="check-field"><input type="checkbox" checked={natural} onChange={e=>setNatural(e.target.checked)}/>거리 기준으로 자연스럽게 연결</label>
   {!natural&&<label className="number-field"><span>대형 이동 시간 · s</span><input aria-label="대형 이동 시간" type="number" min={0} max={30} step={.1} value={duration} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))setDuration(Math.max(0,Math.min(30,e.target.valueAsNumber)));}}/></label>}
   <button className="full-button accent" onClick={()=>edit(d=>putFormation(d,formation,time,duration,natural))}><Plus size={13}/>현재 시간에 대형 추가</button>
   <button className="full-button" onClick={()=>{edit(d=>naturalizeFormations(d));notice('모든 군무 대형을 거리 기반 이동 시간과 부드러운 가감속으로 연결했습니다.');}}><Route size={13}/>기존 대형도 모두 부드럽게 연결</button>
   <p className="field-note">시간은 이동 시작점입니다. 자동 연결은 약 1.2m/s를 기준으로 이동 시간을 정하고 출발·도착을 부드럽게 합니다.</p>
   <div className="key-list">{[...p.formations].sort((a,b)=>a.time-b.time).map(k=><div className={formationId===k.id?'selected':''} key={k.id}><button onClick={()=>{setFormationId(k.id);seek(k.time);}}><i/>{format(k.time)}<span>{k.name}</span></button><button title="대형 키 삭제" aria-label="대형 키 삭제" disabled={p.formations.length===1} onClick={()=>edit(d=>{d.formations=d.formations.filter(x=>x.id!==k.id);})}><X size={12}/></button></div>)}</div>
   {key&&<div className="formation-key-details"><label className="number-field"><span>선택 대형 시작 · s</span><input aria-label="선택 대형 시작 시간" type="number" min={0} max={p.duration} step={1/p.output.fps} value={key.time} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))edit(d=>{d.formations.find(k=>k.id===key.id)!.time=Math.max(0,Math.min(d.duration,e.target.valueAsNumber));});}}/></label><label className="number-field"><span>선택 대형 이동 · s</span><input aria-label="선택 대형 이동 시간" type="number" min={0} max={30} step={.1} value={key.transition} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))edit(d=>{d.formations.find(k=>k.id===key.id)!.transition=Math.max(0,Math.min(30,e.target.valueAsNumber));});}}/></label><label className="field-label">대형 연결 보간<select aria-label="대형 연결 보간" value={key.ease} onChange={e=>edit(d=>{d.formations.find(k=>k.id===key.id)!.ease=e.target.value as Ease;})}>{easeOptions}</select></label></div>}
  </section>
 </>;
}

export function PositionMarkers({member,px,seek}:{member:number;px:number;seek:Seek}){
 const p=useStudio(s=>s.project),recording=useStudio(s=>s.recording);
 const own=p.memberPositionKeys?.filter(k=>k.member===member)??[];
 const local=p.clips.filter(c=>c.member===member).flatMap(c=>(c.positionKeys??[]).filter(k=>k.time>=0&&k.time<=c.duration).map(k=>({...k,time:k.time+c.start,clip:c.id})));
 return <div className="member-key-row" onDoubleClick={e=>{if(recording)return;const t=Math.max(0,Math.min(p.duration,Math.round((e.clientX-e.currentTarget.getBoundingClientRect().left)/px*p.output.fps)/p.output.fps));useStudio.getState().edit(d=>putMemberPosition(d,member,t,positionsAt(d,t)[member]));useStudio.setState({selected:member,clip:null});seek(t);}}>{[...own,...local].map(k=><button key={('clip' in k?k.clip+':':'member:')+k.id} disabled={recording} style={{left:k.time*px,color:p.members[member].color}} title={`${'clip' in k?'클립':'멤버'} 위치 ${format(k.time)}`} onDoubleClick={e=>e.stopPropagation()} onClick={()=>{useStudio.setState({selected:member,clip:'clip' in k?k.clip:null});seek(k.time);}}><Diamond size={9} fill="currentColor"/></button>)}</div>;
}

export function AxisControls(){
 const mode=useStudio(s=>s.cameraMode),recording=useStudio(s=>s.recording);
 return <div className="axis-view-controls">{['X','Y','Z'].map((axis,i)=><button key={axis} aria-label={`${axis}축 ${['우측','상단','정면'][i]} 보기`} title={`${axis}: ${['우측','상단','정면'][i]} · Shift 클릭: 반대편`} className={mode.includes(axis)?'active':''} disabled={recording} onClick={e=>useStudio.setState({cameraMode:`Axis ${e.shiftKey?'-':'+'}${axis}`,cameraAnimation:false})}>{axis}</button>)}<button aria-label="원근 보기" title="원근 보기 · Numpad 5" disabled={recording} onClick={()=>useStudio.setState({cameraMode:'Perspective',cameraAnimation:false})}>P</button></div>;
}
