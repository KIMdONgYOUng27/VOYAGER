import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import {usePointerDrag} from './usePointerDrag';

type Panel='library'|'inspector'|'timeline';
type Layout=Record<Panel,number>;
const defaults:Layout={library:230,inspector:264,timeline:250};
const storageKey='voyager-panel-layout-v1';

function readLayout():Layout{
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)??'null');
    if(saved&&Object.keys(defaults).every(key=>typeof saved[key]==='number'&&Number.isFinite(saved[key])))
      return {library:Math.max(170,Math.min(460,saved.library)),inspector:Math.max(200,Math.min(460,saved.inspector)),timeline:Math.max(150,Math.min(1200,saved.timeline))};
  }catch{ /* Browser storage can be disabled. */ }
  return {...defaults};
}

export function usePanelLayout(disabled:boolean){
  const rootRef=useRef<HTMLDivElement>(null);
  const [layout,setLayout]=useState<Layout>(readLayout);
  const [resizing,setResizing]=useState<Panel|null>(null);
  const drag=usePointerDrag();

  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(layout));}catch{}},[layout]);
  const clamp=(panel:Panel,value:number,current:Layout):number=>{
    const root=rootRef.current;
    if(!root)return value;
    if(panel==='timeline'){
      const header=parseFloat(getComputedStyle(root).getPropertyValue('--header-height'))||58;
      return Math.max(150,Math.min(value,root.clientHeight-header-28-220));
    }
    const mobile=window.innerWidth<=1000;
    const rail=0;
    const other=panel==='library'?current.inspector:current.library;
    const min=panel==='library'?170:200;
    const max=mobile?Math.min(460,root.clientWidth-64):Math.min(460,root.clientWidth-rail-other-320);
    return Math.max(min,Math.min(value,max));
  };
  // Re-clamp saved dimensions when the app's window becomes smaller.
  useEffect(()=>{
    const observer=new ResizeObserver(()=>setLayout(current=>{
      const next={...current};
      next.inspector=clamp('inspector',next.inspector,next);
      next.library=clamp('library',next.library,next);
      next.timeline=clamp('timeline',next.timeline,next);
      return Object.keys(next).every(k=>next[k as Panel]===current[k as Panel])?current:next;
    }));
    if(rootRef.current)observer.observe(rootRef.current);
    return()=>observer.disconnect();
  },[]);

  const setPanel=(panel:Panel,value:number)=>setLayout(current=>({...current,[panel]:clamp(panel,value,current)}));
  const keys=(event:KeyboardEvent<HTMLDivElement>,panel:Panel)=>{
    if(disabled)return;
    const step=event.shiftKey?40:10;
    const direction:Partial<Record<string,number>>=panel==='timeline'?{ArrowUp:1,ArrowDown:-1}:panel==='inspector'?{ArrowLeft:1,ArrowRight:-1}:{ArrowLeft:-1,ArrowRight:1};
    const delta=direction[event.key];
    if(delta){event.preventDefault();event.stopPropagation();setPanel(panel,layout[panel]+delta*step);}
    if(event.key==='Home'){event.preventDefault();event.stopPropagation();setPanel(panel,defaults[panel]);}
  };
  const labels:Record<Panel,string>={library:'라이브러리 너비 조절',inspector:'인스펙터 너비 조절',timeline:'무대와 타임라인 높이 조절'};
  const handles=(['library','inspector','timeline'] as Panel[]).map(panel=><div
    key={panel}
    className={`panel-resizer ${panel}-resizer ${resizing===panel?'resizing':''}`}
    role="separator"
    aria-label={labels[panel]}
    aria-orientation={panel==='timeline'?'horizontal':'vertical'}
    aria-valuenow={Math.round(layout[panel])}
    aria-valuemin={panel==='timeline'?150:panel==='library'?170:200}
    aria-valuemax={panel==='timeline'?1200:460}
    aria-disabled={disabled}
    tabIndex={disabled?-1:0}
    title="드래그로 크기 조절 · 더블클릭으로 기본 크기 · 방향키로 미세 조절"
    onDoubleClick={()=>{if(!disabled)setPanel(panel,defaults[panel]);}}
    onKeyDown={event=>keys(event,panel)}
    onPointerDown={event=>{
      if(disabled||event.button!==0||!event.isPrimary)return;
      const initial=layout[panel],x=event.clientX,y=event.clientY;
      setResizing(panel);
      drag(event,{
        cursor:panel==='timeline'?'row-resize':'col-resize',
        move:next=>setPanel(panel,initial+(panel==='timeline'?y-next.clientY:panel==='inspector'?x-next.clientX:next.clientX-x)),
        finish:()=>setResizing(null),
      });
    }}
  ><span/></div>);
  const style={
    '--library-width':`${layout.library}px`,
    '--inspector-width':`${layout.inspector}px`,
    '--timeline-height':`${layout.timeline}px`,
  } as CSSProperties;
  return {rootRef,style,handles};
}
