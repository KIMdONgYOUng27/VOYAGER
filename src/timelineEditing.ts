import {trimClip,uid,type Clip,type Project} from './model.ts';
const epsilon=1e-7;
export const overlaps=(a:Clip,b:Clip)=>a.member===b.member&&a.start<b.start+b.duration-epsilon&&b.start<a.start+a.duration-epsilon;

/** Keep a whole selection together, stopping at its first neighbour or boundary. */
export function moveClips(p:Project,ids:string[],requested:number){
 const selected=p.clips.filter(c=>ids.includes(c.id)),others=p.clips.filter(c=>!ids.includes(c.id));
 let low=-Infinity,high=Infinity;
 for(const c of selected){
  low=Math.max(low,-c.start);high=Math.min(high,p.duration-c.start-c.duration);
  for(const other of others.filter(o=>o.member===c.member)){
   if(other.start+other.duration<=c.start+epsilon)low=Math.max(low,other.start+other.duration-c.start);
   if(other.start>=c.start+c.duration-epsilon)high=Math.min(high,other.start-c.start-c.duration);
  }
 }
 const delta=Math.max(low,Math.min(high,requested));
 if(!Number.isFinite(delta))return 0;
 for(const c of selected)c.start+=delta;
 return delta;
}
export function trimWithoutOverlap(p:Project,id:string,edge:'left'|'right',time:number){
 const c=p.clips.find(c=>c.id===id);if(!c)return;
 const neighbours=p.clips.filter(o=>o.id!==id&&o.member===c.member);
 const low=Math.max(0,...neighbours.filter(o=>o.start<c.start).map(o=>o.start+o.duration));
 const high=Math.min(p.duration,...neighbours.filter(o=>o.start>=c.start+c.duration-epsilon).map(o=>o.start));
 const asset=p.assets.find(a=>a.id===c.asset);if(!asset)return;
 Object.assign(c,trimClip(c,edge,Math.max(low,Math.min(high,time)),asset.duration,p.duration,p.output.fps));
}
/** Find the first available space at or after the requested time. Never overwrite a clip. */
export function insertClip(p:Project,asset:string,member:number,time:number):string|null{
 const a=p.assets.find(a=>a.id===asset&&a.kind!=='audio');if(!a||p.baseRig&&a.kind==='demo')return null;
 const track=p.clips.filter(c=>c.member===member).sort((a,b)=>a.start-b.start);
 const frame=1/p.output.fps;let start=Math.max(0,Math.round(time*p.output.fps)/p.output.fps);
 for(const c of track){if(c.start+c.duration<=start+epsilon)continue;if(c.start-start>=Math.min(a.duration,p.duration-start)-epsilon)break;start=c.start+c.duration;}
 const next=track.find(c=>c.start>=start-epsilon),duration=Math.min(a.duration,p.duration-start,(next?.start??p.duration)-start);
 if(duration<frame-epsilon)return null;
 const id=uid();p.clips.push({id,member,asset,start,duration,offset:0,speed:1,loop:true,fade:0});return id;
}
/** Old overlapping projects are laid out in source order, preserving source phase. */
export function normalizeTracks(p:Project){
 const normalized:Clip[]=[];
 for(let member=0;member<5;member++){
  let end=0;
  for(const original of p.clips.filter(c=>c.member===member).sort((a,b)=>a.start-b.start)){
   const c={...original,start:Math.max(end,original.start)};
   c.duration=Math.min(c.duration,p.duration-c.start);
   if(c.duration<1/p.output.fps-epsilon)continue;
   normalized.push(c);end=c.start+c.duration;
  }
 }
 p.clips=normalized;
}
export function selectionInRect(p:Project,rect:{left:number;right:number;top:number;bottom:number},px:number,rows:{member:number;top:number;bottom:number}[]){
 return p.clips.filter(c=>{const row=rows.find(r=>r.member===c.member);return row&&row.top<rect.bottom&&row.bottom>rect.top&&c.start*px<rect.right&&(c.start+c.duration)*px>rect.left;}).map(c=>c.id);
}
