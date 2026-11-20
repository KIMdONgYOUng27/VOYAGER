import * as T from 'three';
import type {CameraPose,Vec3} from './model.ts';
export type RenderCamera=T.PerspectiveCamera|T.OrthographicCamera;
export function configureRenderCamera(previous:RenderCamera|undefined,pose:CameraPose,ratio:number):RenderCamera{
 const ortho=pose.projection==='orthographic';
 const camera=previous&&(ortho?previous instanceof T.OrthographicCamera:previous instanceof T.PerspectiveCamera)?previous:ortho?new T.OrthographicCamera():new T.PerspectiveCamera();
 camera.near=.05;camera.far=150;camera.zoom=pose.zoom??1;
 if(camera instanceof T.PerspectiveCamera){camera.aspect=ratio;camera.fov=pose.fov??38;}
 else{const span=Math.max(6,10/ratio);camera.left=-span*ratio/2;camera.right=span*ratio/2;camera.top=span/2;camera.bottom=-span/2;}
 camera.position.set(...pose.position);
 if(pose.rotation){const q=new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation.map(v=>v*Math.PI/180) as Vec3,'YXZ'));camera.quaternion.copy(q);camera.up.copy(new T.Vector3(0,1,0).applyQuaternion(q));}
 else{camera.up.set(...(pose.up??[0,1,0]));camera.lookAt(...pose.target);}
 camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return camera;
}
