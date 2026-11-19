import {useCallback,useEffect,useRef,type PointerEvent as ReactPointerEvent} from 'react';

type DragOptions={
  move:(event:PointerEvent)=>void;
  finish?:(cancelled:boolean)=>void;
  cursor?:string;
};

/** One pointer session, including release outside the element and window blur. */
export function usePointerDrag(){
  const cleanupRef=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>cleanupRef.current?.(),[]);
  return useCallback((event:ReactPointerEvent<HTMLElement>,options:DragOptions)=>{
    if(event.button!==0||!event.isPrimary)return;
    event.preventDefault();
    event.stopPropagation();
    cleanupRef.current?.();
    const target=event.currentTarget,pointerId=event.pointerId;
    const oldCursor=document.body.style.cursor,oldSelect=document.body.style.userSelect;
    document.body.style.cursor=options.cursor??'ew-resize';
    document.body.style.userSelect='none';
    target.setPointerCapture(pointerId);
    const cleanup=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',cancel);
      window.removeEventListener('blur',blur);
      window.removeEventListener('keydown',escape);
      if(target.hasPointerCapture(pointerId))target.releasePointerCapture(pointerId);
      document.body.style.cursor=oldCursor;
      document.body.style.userSelect=oldSelect;
      cleanupRef.current=null;
    };
    const finish=(cancelled:boolean)=>{cleanup();options.finish?.(cancelled);};
    const move=(next:PointerEvent)=>{if(next.pointerId===pointerId)options.move(next);};
    const up=(next:PointerEvent)=>{if(next.pointerId===pointerId){options.move(next);finish(false);}};
    const cancel=(next:PointerEvent)=>{if(next.pointerId===pointerId)finish(true);};
    const blur=()=>finish(true);
    const escape=(key:KeyboardEvent)=>{if(key.key==='Escape'){key.preventDefault();key.stopPropagation();finish(true);}};
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',cancel);
    window.addEventListener('blur',blur);
    window.addEventListener('keydown',escape);
    cleanupRef.current=cleanup;
  },[]);
}
