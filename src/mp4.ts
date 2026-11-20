
export async function isMp4(blob:Blob){const bytes=new Uint8Array(await blob.slice(0,12).arrayBuffer());return String.fromCharCode(...bytes.slice(4,8))==='ftyp';}
export async function encodeMp4(options:{canvas:HTMLCanvasElement;start:number;end:number;fps:number;audio?:AudioBuffer;render:(time:number)=>void;onProgress:(n:number)=>void;signal:AbortSignal}){
 const {Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,Quality,canEncodeVideo,canEncodeAudio}=await import('mediabunny');
 const {canvas,start,end,fps,audio,render,onProgress,signal}=options,duration=end-start;
 if(!await canEncodeVideo('avc',{width:canvas.width,height:canvas.height}))throw Error('H.264 MP4 인코딩이 가능한 최신 Chrome 또는 Edge에서 출력하세요.');
 if(audio&&!await canEncodeAudio('aac',{sampleRate:audio.sampleRate,numberOfChannels:Math.min(2,audio.numberOfChannels)}))throw Error('이 브라우저에서 AAC 오디오 인코딩을 사용할 수 없습니다.');
 const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
 const video=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:canvas.height>=1080?8_000_000:5_000_000}),keyFrameInterval:1});output.addVideoTrack(video,{frameRate:fps});
 const audioSource=audio?new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:128_000})}):null;if(audioSource)output.addAudioTrack(audioSource);
 const check=()=>{if(signal.aborted)throw new DOMException('출력 취소','AbortError');};
 const cancel=()=>{void output.cancel();};signal.addEventListener('abort',cancel,{once:true});
 try{
  check();await output.start();const frames=Math.ceil(duration*fps-1e-8);
  for(let frame=0;frame<frames;frame++){
   check();const time=frame/fps;render(start+time);await video.add(time,Math.min(1/fps,duration-time));
   onProgress((frame+1)/frames*.9);
   if(frame%8===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  video.close();
  if(audio&&audioSource){
   for(let offset=0;offset<duration;offset+=1){check();const length=Math.min(duration-offset,1),count=Math.round(length*audio.sampleRate);if(count<=0)continue;const block=new AudioBuffer({length:count,sampleRate:audio.sampleRate,numberOfChannels:Math.min(2,audio.numberOfChannels)}),from=Math.round((start+offset)*audio.sampleRate);for(let channel=0;channel<block.numberOfChannels;channel++){const source=audio.getChannelData(channel);if(from<source.length)block.copyToChannel(source.subarray(from,Math.min(from+count,source.length)),channel);}await audioSource.add(block);onProgress(.9+.08*(offset+length)/duration);}
   audioSource.close();
  }
  check();await output.finalize();if(!output.target.buffer)throw Error('MP4 생성 실패');const result=new Blob([output.target.buffer],{type:'video/mp4'});if(!await isMp4(result))throw Error('MP4 파일 검증 실패');onProgress(1);return result;
 }catch(e){if(!signal.aborted)await output.cancel().catch(()=>{});throw e;}
 finally{signal.removeEventListener('abort',cancel);}
}
