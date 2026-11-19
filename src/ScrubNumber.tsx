import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {usePointerDrag} from './usePointerDrag';
import {useStudio} from './store';
import {sound} from './assets';

type Props={label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number;step?:number;dragSpeed?:number;ariaLabel?:string;disabled?:boolean};
export function ScrubNumber({label,value,onChange,min=-10000,max=10000,step=.1,dragSpeed=step/5,ariaLabel=label,disabled=false}:Props){
 const [draft,setDraft]=useState(String(Math.round(value*10000)/10000));
 const input=useRef<HTMLInputElement>(null),editing=useRef(false),dragging=useRef(false),initial=useRef(value),drag=usePointerDrag();
 const recording=useStudio(s=>s.recording),locked=disabled||recording;
 const clamp=(n:number)=>Math.max(min,Math.min(max,n));
 useEffect(()=>{if(!editing.current&&!dragging.current)setDraft(String(Math.round(value*10000)/10000));},[value]);
 const begin=()=>{const s=useStudio.getState();if(s.playing){sound.stop();useStudio.setState({playing:false});}s.beginEdit();};
 const start=(e:PointerEvent<HTMLElement>)=>{
  if(locked||e.button!==0||!e.isPrimary||e.currentTarget===input.current&&editing.current)return;
  (document.activeElement as HTMLElement|null)?.blur();
  const startX=e.clientX,before=value;let moved=false,last=value;
  initial.current=value;
  drag(e,{move:next=>{
    const delta=next.clientX-startX;if(!moved&&Math.abs(delta)<3)return;
    if(!moved){moved=true;dragging.current=true;begin();}
    let number=before+delta*dragSpeed*(next.shiftKey ? .1 : 1);
    if(next.ctrlKey||next.metaKey)number=Math.round(number/step)*step;
    number=clamp(Math.round(number*10000)/10000);
    if(number!==last){last=number;setDraft(String(number));onChange(number);}
   },finish:cancelled=>{
    dragging.current=false;
    if(moved){if(cancelled)onChange(before);useStudio.getState().endEdit(cancelled);setDraft(String(cancelled?before:last));}
    else if(!cancelled){input.current?.focus();input.current?.select();}
   }});
 };
 return <label className={`number-field scrub-number ${locked?'locked':''}`}><span onPointerDown={start} title="좌우 드래그로 조절 · Shift: 미세 조절 · Ctrl: 간격 맞춤">{label}</span><input ref={input} type="text" inputMode="decimal" role="spinbutton" aria-label={ariaLabel} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} value={draft} disabled={locked} title="좌우로 드래그 · 클릭 후 숫자 입력 · Esc 취소" onPointerDown={start} onFocus={()=>{if(dragging.current)return;editing.current=true;initial.current=value;begin();}} onBlur={()=>{if(!editing.current)return;editing.current=false;setDraft(String(Math.round(value*10000)/10000));useStudio.getState().endEdit();}} onChange={e=>{const text=e.currentTarget.value;setDraft(text);if(text.trim()!==''&&Number.isFinite(Number(text)))onChange(clamp(Number(text)));}} onKeyDown={e=>{
   if(e.key==='Enter'){e.preventDefault();input.current?.blur();}
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onChange(initial.current);editing.current=false;useStudio.getState().endEdit(true);setDraft(String(initial.current));input.current?.blur();}
   if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();const n=clamp(value+(e.key==='ArrowUp'?step:-step)*(e.shiftKey?10:1));setDraft(String(n));onChange(n);}
  }}/></label>;
}
