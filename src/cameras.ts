import {cameraAt,cameraRotation,uid,type CameraPose,type CameraKey,type Project,type SceneCamera} from './model.ts';
export const defaultCameraPose=():CameraPose=>({position:[0,3.2,10],target:[0,.9,0],projection:'perspective',fov:38,zoom:1,up:[0,1,0]});
export function ensureCameras(p:Project){
 if(!p.sceneCameras?.length)p.sceneCameras=[{id:uid(),number:1,name:'카메라 1',base:structuredClone(p.cameraBase??defaultCameraPose()),keys:structuredClone(p.cameras??[]),recordStart:p.output.start,recordEnd:p.output.end,enabled:true}];
 if(!p.sceneCameras.some(c=>c.id===p.activeCameraId))p.activeCameraId=p.sceneCameras[0].id;
 return p.sceneCameras;
}
export function activeCamera(p:Project):SceneCamera|undefined{return p.sceneCameras?.find(c=>c.id===p.activeCameraId)??p.sceneCameras?.[0];}
export function cameraPoseAt(p:Project,time:number,id?:string):CameraPose{
 const c=id?p.sceneCameras?.find(c=>c.id===id):activeCamera(p);
 return c?(cameraAt(c.keys,time)??c.base):(cameraAt(p.cameras,time)??p.cameraBase??defaultCameraPose());
}
export function addCamera(p:Project,pose:CameraPose=defaultCameraPose()){
 const cameras=ensureCameras(p),number=Math.max(0,...cameras.map(c=>c.number))+1;
 const camera:SceneCamera={id:uid(),number,name:`카메라 ${number}`,base:{...structuredClone(pose),rotation:cameraRotation(pose)},keys:[],recordStart:p.output.start,recordEnd:p.output.end,enabled:true};
 cameras.push(camera);p.activeCameraId=camera.id;return camera.id;
}
export function removeCamera(p:Project,id:string){if((p.sceneCameras?.length??0)<=1)return;p.sceneCameras=p.sceneCameras!.filter(c=>c.id!==id);if(p.activeCameraId===id)p.activeCameraId=p.sceneCameras[0].id;}
export function setCameraPose(p:Project,pose:CameraPose,time:number,auto:boolean){
 ensureCameras(p);const camera=activeCamera(p)!;
 const existing=camera.keys.find(k=>Math.abs(k.time-time)<.5/p.output.fps);
 if(auto||existing){const t=Math.max(0,Math.min(p.duration,Math.round(time*p.output.fps)/p.output.fps));if(!camera.keys.length&&t>0)camera.keys.push({...structuredClone(camera.base),id:uid(),time:0});camera.keys=camera.keys.filter(k=>k!==existing);camera.keys.push({...structuredClone(pose),rotation:cameraRotation(pose),id:existing?.id??uid(),time:t});}
 else camera.base=structuredClone(pose);
 // Legacy fields remain a readable mirror for older saved projects.
 p.cameras=camera.keys;p.cameraBase=camera.base;
}
export function cameraFileName(p:Project,camera:SceneCamera){const name=p.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');return `${name}_CAM${String(camera.number).padStart(2,'0')}.mp4`;}
