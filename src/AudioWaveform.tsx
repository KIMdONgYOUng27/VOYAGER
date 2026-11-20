import {useEffect,useRef} from 'react';
import {resources} from './assets';
import {useStudio} from './store';
export function AudioWaveform({width}:{width:number}){
 const canvas=useRef<HTMLCanvasElement>(null),p=useStudio(s=>s.project),pixels=Math.min(16384,Math.ceil(width));
 useEffect(()=>{const ctx=canvas.current!.getContext('2d')!;ctx.clearRect(0,0,pixels,24);const buffer=p.audio?resources.get(p.audio)?.buffer:undefined;if(!buffer)return;const data=buffer.getChannelData(0);ctx.fillStyle='#8babab';for(let x=0;x<pixels;x+=2){const from=Math.floor(x/pixels*p.duration*buffer.sampleRate),to=Math.min(data.length,Math.floor((x+2)/pixels*p.duration*buffer.sampleRate));if(from>=data.length)break;let peak=0;for(let i=from;i<to;i+=Math.max(1,Math.floor((to-from)/32)))peak=Math.max(peak,Math.abs(data[i]));const height=Math.max(1,peak*20);ctx.fillRect(x,12-height/2,1,height);}},[p,pixels]);
 return <canvas ref={canvas} width={pixels} height={24} style={{width,height:24,pointerEvents:'none'}} aria-label="음악 파형"/>;
}
