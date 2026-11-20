import {activeCamera,cameraPoseAt} from './cameras.ts';
import {configureRenderCamera,type RenderCamera} from './cameraRendering.ts';
import {encodeMp4} from './mp4.ts';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {useStudio,notice} from './store.ts';
import {resources,bonesOf,canonical,sound,download} from './assets.ts';
import {localPositionsAt,stageTransformAt,memberTransformAt,cameraRotation,type CameraPose,positionsAt,clipLocal,clipWeight,cameraAt,type Vec3,type Project} from './model.ts';
type Actor={group:T.Group;root:T.Group;mixer:T.AnimationMixer;bones:Map<string,T.Bone>;rest:Map<T.Bone,{p:T.Vector3;q:T.Quaternion;s:T.Vector3}>;actions:Map<string,T.AnimationAction>;ring:T.Mesh;material:T.MeshStandardMaterial;demo:boolean;};
const meshMaterial=new T.MeshStandardMaterial({color:'#b7becb',roughness:.65,metalness:.12});
const capsule=new T.CapsuleGeometry(.075,.27,4,8);
const sphere=new T.SphereGeometry(.13,12,10);
function mannequin(material:T.MeshStandardMaterial){
 const root=new T.Group();const bones:Record<string,T.Bone>={};
 const add=(name:string,parent:T.Object3D,x:number,y:number,z=0)=>{const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);bones[name]=b;return b;};
 const hips=add('Hips',root,0,.94);const spine=add('Spine',hips,0,.16);const chest=add('Spine2',spine,0,.2);const neck=add('Neck',chest,0,.18);const head=add('Head',neck,0,.12);
 for(const side of ['Left','Right']){const sign=side==='Left'?1:-1;const arm=add(`${side}Arm`,chest,sign*.2,.1);const fore=add(`${side}ForeArm`,arm,sign*.3,0);add(`${side}Hand`,fore,sign*.27,0);const leg=add(`${side}UpLeg`,hips,sign*.12,-.03);const shin=add(`${side}Leg`,leg,0,-.43);const foot=add(`${side}Foot`,shin,0,-.42);add(`${side}ToeBase`,foot,0,-.04,.14);}
 const shape=(bone:T.Bone,g:T.BufferGeometry,scale:Vec3,pos:Vec3,rotation=0)=>{const m=new T.Mesh(g,material);m.scale.set(...scale);m.position.set(...pos);m.rotation.z=rotation;m.castShadow=true;bone.add(m);};
 shape(hips,new T.SphereGeometry(1,12,8),[.2,.14,.12],[0,0,0]);shape(spine,new T.CapsuleGeometry(.14,.2,4,10),[1.2,1, .8],[0,.12,0]);shape(head,sphere,[1,1.18,.95],[0,.045,0]);
 for(const side of ['Left','Right']){const sign=side==='Left'?1:-1;shape(bones[`${side}Arm`],capsule,[.78,.8,.78],[sign*.15,0,0],Math.PI/2);shape(bones[`${side}ForeArm`],capsule,[.65,.7,.65],[sign*.135,0,0],Math.PI/2);shape(bones[`${side}Hand`],sphere,[.42,.65,.32],[sign*.025,0,0]);shape(bones[`${side}UpLeg`],capsule,[1.1,1.05,1.1],[0,-.21,0]);shape(bones[`${side}Leg`],capsule,[.83,1,.83],[0,-.21,0]);shape(bones[`${side}Foot`],sphere,[.62,.45,1.12],[0,-.025,.07]);}
 return root;
}
function demoPose(actor:Actor,id:string,t:number,weight:number){
 const phase=t*Math.PI;const s=Math.sin(phase),co=Math.cos(phase);const put=(name:string,x=0,y=0,z=0)=>{const b=actor.bones.get(canonical(name));if(!b)return;const r=actor.rest.get(b)!;const q=r.q.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(x,y,z)));b.quaternion.slerp(q,weight);};
 put('Spine',.07,Math.sin(phase)*.15,co*.09);put('Hips',0,s*.12,0);
 const hip=actor.bones.get('hips');if(hip)hip.position.y+=Math.abs(s)*.055*weight;
 for(const side of ['Left','Right']){const n=side==='Left'?1:-1;
  const hit=id==='demo-hit';const step=id==='demo-step';
  put(`${side}Arm`,hit?co*.65:s*.25,0,n*(hit?(-.5+co*.5):(-1.1+co*.16)));
  put(`${side}ForeArm`,hit?-.8:0,hit?s*.3:0,n*(.3+Math.max(0,s*n)*.6));
  put(`${side}UpLeg`,step?s*n*.3:Math.max(0,s*n)*.16,0,step?s*.12:0);put(`${side}Leg`,Math.max(0,-s*n)*(step?.5:.25));
 }
}
export class StudioEngine{
 renderCamera?:RenderCamera;cameraGizmos=new Map<string,{camera:RenderCamera;helper:T.CameraHelper}>();exportCameraId:string|undefined;renderer:T.WebGLRenderer;scene=new T.Scene();stageRoot=new T.Group();baseFov=38;camera:T.PerspectiveCamera|T.OrthographicCamera=new T.PerspectiveCamera(38,16/9,.05,150);controls!:OrbitControls;actors:Actor[]=[];grid:T.GridHelper;raf=0;unsubscribe:()=>void;resize:ResizeObserver;lastBase='';baseObject:T.Group|undefined;lastTime=0;frames=0;fps=0;fpsStamp=0;recorder:MediaRecorder|null=null;cancelExport:(()=>void)|null=null;exporting=false;exportEnd=0;host:HTMLElement;onStats:(fps:number,warnings:string[])=>void;disposed=false;
 constructor(host:HTMLElement,onStats:(fps:number,warnings:string[])=>void){
 this.host=host;this.onStats=onStats;this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.setClearColor('#303030');host.appendChild(this.renderer.domElement);
 this.scene.fog=new T.Fog('#303030',24,65);this.scene.add(new T.HemisphereLight('#ffffff','#555555',2.7));const key=new T.DirectionalLight('#ffffff',3);key.position.set(4,8,6);this.scene.add(key);const fill=new T.DirectionalLight('#dddddd',1.4);fill.position.set(-5,3,-3);this.scene.add(fill);
 const floor=new T.Mesh(new T.PlaneGeometry(120,120),new T.MeshStandardMaterial({color:'#484848',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.012;this.scene.add(floor);
 this.grid=new T.GridHelper(30,30,'#777777','#555555');this.scene.add(this.grid);
 const front=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-5,.006,3.6),new T.Vector3(5,.006,3.6)]),new T.LineBasicMaterial({color:'#999999',transparent:true,opacity:.5}));this.scene.add(front);
 this.scene.add(this.stageRoot);this.createControls();this.setCamera('45-Degree');
 this.renderer.domElement.addEventListener('pointerdown',this.pick);
 this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(host);this.fit();
 this.unsubscribe=useStudio.subscribe((s,prev)=>{if(s.quality!==prev.quality||s.project.output.aspect!==prev.project.output.aspect)this.fit();if(s.cameraMode!==prev.cameraMode&&s.cameraMode!=='Free Camera')this.setCamera(s.cameraMode);});
 this.animate();
 }
 pick=(e:PointerEvent)=>{if(this.exporting||useStudio.getState().viewMode==='camera')return;const rect=this.renderer.domElement.getBoundingClientRect();const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);const hits=ray.intersectObjects(this.stageRoot.visible?this.actors.filter(a=>a.group.visible).map(a=>a.root):[],true);if(hits.length){let o:T.Object3D|null=hits[0].object;while(o&&o.userData.member===undefined)o=o.parent;if(o)useStudio.setState({selected:o.userData.member,clip:null,selectedKey:null,selectionTarget:'member'});}};
 createControls(){
  const target=this.controls?.target.clone()??new T.Vector3(0,.8,0);
  this.controls?.dispose();this.controls=new OrbitControls(this.camera,this.renderer.domElement);
  this.controls.target.copy(target);this.controls.enableDamping=false;this.controls.minDistance=2;this.controls.maxDistance=50;this.controls.minZoom=.2;this.controls.maxZoom=8;this.controls.maxPolarAngle=Math.PI;this.controls.enabled=!this.exporting;
  this.controls.addEventListener('change',()=>{if(!this.exporting&&!useStudio.getState().playing)useStudio.setState(s=>({viewRevision:s.viewRevision+1}));});
  this.controls.addEventListener('start',()=>{if(!this.exporting)useStudio.setState({viewMode:'editor',cameraAnimation:false,cameraMode:'Free Camera'});});
 }
 frameCamera(width:number,height:number,ratio:number){
  const aspect=width/height;
  if(this.camera instanceof T.PerspectiveCamera){this.camera.aspect=aspect;this.camera.fov=2*Math.atan(Math.tan(this.baseFov*Math.PI/360)*Math.max(1,ratio/aspect))*180/Math.PI;}
  else{const span=Math.max(6,10/ratio)*Math.max(1,ratio/aspect);this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;this.camera.top=span/2;this.camera.bottom=-span/2;}
  this.camera.updateProjectionMatrix();
 }
 projection(mode:'perspective'|'orthographic',up:Vec3=[0,1,0]){
  const changed=mode==='orthographic' ? !(this.camera instanceof T.OrthographicCamera):!(this.camera instanceof T.PerspectiveCamera);
  if(changed){const previous=this.camera;this.camera=mode==='orthographic'?new T.OrthographicCamera(-8,8,5,-5,.05,150):new T.PerspectiveCamera(38,16/9,.05,150);this.camera.position.copy(previous.position);this.camera.zoom=1;}
  const upChanged=!this.camera.up.equals(new T.Vector3(...up));this.camera.up.set(...up);
  if(changed||upChanged){this.createControls();const size=this.renderer.getSize(new T.Vector2());this.frameCamera(size.x,size.y,useStudio.getState().project.output.aspect==='16:9'?16/9:9/16);}
 }
 fit(){if(this.exporting)return;const rect=this.host.getBoundingClientRect();const ratio=useStudio.getState().project.output.aspect==='16:9'?16/9:9/16;const width=Math.max(1,rect.width),height=Math.max(1,rect.height);this.renderer.setPixelRatio(useStudio.getState().quality==='Low'?1:Math.min(window.devicePixelRatio,useStudio.getState().quality==='High'?2:1.4));this.renderer.setSize(width,height);this.frameCamera(width,height,ratio);const guide=this.host.parentElement?.querySelector<HTMLElement>('.safe-guide');if(guide){const w=Math.min(width,height*ratio),h=w/ratio;guide.style.width=w+'px';guide.style.height=h+'px';}}
 setCamera(mode:string){
  const views:Record<string,Vec3>={'Front Wide':[0,3.6,12],'Front Medium':[0,2.7,10],'Side':[12,3,0],'45-Degree':[9,5.5,10],'Top View':[0,16,.01],'Perspective':[9,5.5,10]};
  const axes:Record<string,{position:Vec3;up:Vec3}>={
   'Axis +X':{position:[16,.8,0],up:[0,1,0]},'Axis -X':{position:[-16,.8,0],up:[0,1,0]},
   'Axis +Y':{position:[0,16.8,0],up:[0,0,-1]},'Axis -Y':{position:[0,-15.2,0],up:[0,0,1]},
   'Axis +Z':{position:[0,.8,16],up:[0,1,0]},'Axis -Z':{position:[0,.8,-16],up:[0,1,0]},
  };
  const axis=axes[mode];if(!axis&&!views[mode])return;
  this.projection(axis?'orthographic':'perspective',axis?.up??[0,1,0]);this.camera.zoom=1;this.camera.position.set(...(axis?.position??views[mode]));this.controls.target.set(0,.8,0);this.controls.update();this.fit();useStudio.setState(s=>({viewRevision:s.viewRevision+1}));
 }
 captureCamera():CameraPose{return {rotation:new T.Euler().setFromQuaternion(this.camera.quaternion,'YXZ').toArray().slice(0,3).map(v=>Number(v)*180/Math.PI) as Vec3,fov:this.baseFov,position:this.camera.position.toArray() as Vec3,target:this.controls.target.toArray() as Vec3,projection:this.camera instanceof T.OrthographicCamera?'orthographic' as const:'perspective' as const,zoom:this.camera.zoom,up:this.camera.up.toArray() as Vec3};}

 applyCamera(pose:CameraPose){
  this.baseFov=pose.fov??38;this.projection(pose.projection??'perspective',pose.up??[0,1,0]);this.camera.position.set(...pose.position);this.camera.zoom=pose.zoom??1;
  if(pose.rotation){const q=new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation.map(v=>v*Math.PI/180) as Vec3,'YXZ'));const distance=Math.max(.1,new T.Vector3(...pose.position).distanceTo(new T.Vector3(...pose.target)));this.controls.target.copy(this.camera.position).add(new T.Vector3(0,0,-distance).applyQuaternion(q));this.camera.up.copy(new T.Vector3(0,1,0).applyQuaternion(q));}
  else this.controls.target.set(...pose.target);
  const size=this.renderer.getSize(new T.Vector2());this.frameCamera(size.x,size.y,useStudio.getState().project.output.aspect==='16:9'?16/9:9/16);this.controls.update();
 }
 numpad(code:string,opposite=false){
  if(code==='Numpad0'){const s=useStudio.getState();useStudio.setState({viewMode:s.viewMode==='camera'?'editor':'camera'});return;}
  const s=useStudio.getState();useStudio.setState({cameraAnimation:false,cameraMode:'Free Camera'});
  const axis:Record<string,string>={Numpad1:'Z',Numpad3:'X',Numpad7:'Y'};
  if(axis[code]){this.setCamera('Axis '+(opposite?'-':'+')+axis[code]);useStudio.setState({cameraMode:'Axis '+(opposite?'-':'+')+axis[code]});return;}
  if(code==='Numpad5'){const pose=this.captureCamera(),size=this.renderer.getSize(new T.Vector2()),ratio=s.project.output.aspect==='16:9'?16/9:9/16,span=Math.max(6,10/ratio)*Math.max(1,ratio/(size.x/size.y)),perspectiveSpan=2*this.camera.position.distanceTo(this.controls.target)*Math.tan(this.baseFov*Math.PI/360);const ortho=pose.projection==='orthographic';pose.projection=ortho?'perspective':'orthographic';pose.zoom=(pose.zoom??1)*(ortho?perspectiveSpan/span:span/perspectiveSpan);this.applyCamera(pose);return;}
  if(code==='NumpadDecimal'){const pos=positionsAt(s.project,s.time)[s.selected];const offset=this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(5);this.controls.target.set(pos[0],pos[1]+.9,pos[2]);this.camera.position.copy(this.controls.target).add(offset);this.camera.zoom=1;}
  else if(code==='NumpadAdd'||code==='NumpadSubtract'){this.camera.zoom=T.MathUtils.clamp(this.camera.zoom*(code==='NumpadAdd'?1.2:1/1.2),.2,8);this.camera.updateProjectionMatrix();}
  else if(code==='NumpadDivide'){useStudio.setState({isolatedMember:s.isolatedMember===null?s.selected:null});}
  else{const offset=this.camera.position.clone().sub(this.controls.target),vertical=code==='Numpad2'||code==='Numpad8';const sign=code==='Numpad4'||code==='Numpad8'?1:-1;const right=new T.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);if(opposite&&code!=='Numpad9'){const delta=(vertical?this.camera.up.clone():right).multiplyScalar(sign*.35);this.controls.target.add(delta);this.camera.position.add(delta);}else{offset.applyAxisAngle(vertical?right:new T.Vector3(0,1,0),(code==='Numpad9'?Math.PI:sign*Math.PI/12));this.camera.position.copy(this.controls.target).add(offset);this.camera.up.set(0,1,0);}}
  this.controls.update();useStudio.setState(v=>({viewRevision:v.viewRevision+1}));
 }
 rebuild(p:Project){
 this.clearActors();const source=p.baseRig?resources.get(p.baseRig)?.object:undefined;this.lastBase=p.baseRig??'';this.baseObject=source;
 for(let member=0;member<5;member++){
  const group=new T.Group();group.userData.member=member;const material=meshMaterial.clone();material.color.set(p.members[member].color);const root=source?clone(source) as T.Group:mannequin(material);
  if(source){const bound=new T.Box3().setFromObject(root);const h=bound.max.y-bound.min.y;if(!Number.isFinite(h)||h<=0)throw Error('캐릭터 크기를 계산할 수 없습니다.');const scale=1.8/h;root.scale.multiplyScalar(scale);root.position.multiplyScalar(scale);root.position.y-=bound.min.y*scale;root.traverse(o=>{const mesh=o as T.Mesh;if(mesh.isMesh)mesh.material=material;});}
  root.userData.member=member;group.add(root);const ring=new T.Mesh(new T.RingGeometry(.35,.39,48),new T.MeshBasicMaterial({color:p.members[member].color,side:T.DoubleSide,transparent:true,opacity:.7}));ring.rotation.x=-Math.PI/2;ring.position.y=.01;group.add(ring);this.stageRoot.add(group);
  const bones=bonesOf(root),rest=new Map<T.Bone,{p:T.Vector3;q:T.Quaternion;s:T.Vector3}>();bones.forEach(b=>rest.set(b,{p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  this.actors.push({group,root,mixer:new T.AnimationMixer(root),bones,rest,actions:new Map(),ring,material,demo:!source});
 }
 }
 clearActors(){for(const a of this.actors){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.root);a.material.dispose();a.ring.geometry.dispose();(a.ring.material as T.Material).dispose();a.group.removeFromParent();if(a.demo){a.root.traverse(o=>{const m=o as T.Mesh;if(m.isMesh&&m.geometry!==capsule&&m.geometry!==sphere)m.geometry.dispose();});}}this.actors=[];}
 getAction(a:Actor,id:string,clipId:string){const actionKey=clipId+':'+id;if(a.actions.has(actionKey))return a.actions.get(actionKey)!;const r=resources.get(id);if(!r?.clip)return null;const clip=r.clip.clone();
 clip.tracks=clip.tracks.map(track=>{const tr=track.clone();const dot=tr.name.lastIndexOf('.'),name=canonical(tr.name.slice(0,dot)),bone=a.bones.get(name);if(!bone)throw Error(`호환되지 않는 본: ${name}`);tr.name=bone.name+tr.name.slice(dot);
  if(name==='hips'&&tr.name.endsWith('.position')){const values=tr.values;const ref=a.rest.get(bone)!.p;const y0=values[1];for(let i=0;i<values.length;i+=3){values[i]=ref.x;values[i+1]=ref.y+(values[i+1]-y0);values[i+2]=ref.z;}}
 return tr;});const action=a.mixer.clipAction(clip);action.play();action.setEffectiveTimeScale(0);a.actions.set(actionKey,action);return action;
 }
 evaluate(t:number){const s=useStudio.getState(),p=s.project;const source=p.baseRig?resources.get(p.baseRig)?.object:undefined;if(this.actors.length!==5||this.lastBase!==(p.baseRig??'')||this.baseObject!==source)this.rebuild(p);
 const pos=positionsAt(p,t),local=localPositionsAt(p,t),stage=stageTransformAt(p,t);this.stageRoot.position.set(...stage.position);this.stageRoot.rotation.set(...stage.rotation.map(v=>v*Math.PI/180) as Vec3);this.stageRoot.scale.set(...stage.scale);this.stageRoot.visible=stage.visible;let missing=false;
 for(let i=0;i<5;i++){const a=this.actors[i],m=memberTransformAt(p,i,t);a.material.color.set(m.color);(a.ring.material as T.MeshBasicMaterial).color.set(m.color);a.group.position.set(...local[i]);a.group.rotation.set(...m.rotation.map(v=>v*Math.PI/180) as Vec3);a.group.scale.set(...m.scale);a.group.visible=m.visible&&(this.exporting||s.isolatedMember===null||s.isolatedMember===i);(a.ring.material as T.MeshBasicMaterial).opacity=s.selected===i?1:.3;
  a.rest.forEach((r,b)=>{b.position.copy(r.p);b.quaternion.copy(r.q);b.scale.copy(r.s);});a.actions.forEach(action=>{action.enabled=false;action.weight=0;});
  const active=p.clips.filter(c=>c.member===i&&clipWeight(c,t)>0);const total=active.reduce((n,c)=>n+clipWeight(c,t),0);
  for(const c of active){const asset=p.assets.find(d=>d.id===c.asset);if(!asset)continue;const w=clipWeight(c,t)/Math.max(1,total);if(asset.kind==='demo'){if(a.demo)demoPose(a,c.asset,clipLocal(c,t,asset.duration),w);continue;}
   const action=this.getAction(a,c.asset,c.id);if(!action){missing=true;continue;}action.enabled=true;action.paused=true;action.time=clipLocal(c,t,asset.duration);action.setEffectiveWeight(w);
  }
  if(active.some(c=>resources.get(c.asset)?.clip))a.mixer.update(0);
 }

 this.grid.visible=s.grid&&!this.exporting;const warnings:string[]=[];if(p.baseRig&&!source)warnings.push('기준 FBX 누락');if(missing)warnings.push('모션 에셋 누락');if(source&&p.clips.some(c=>c.asset.startsWith('demo-')&&t>=c.start&&t<c.start+c.duration))warnings.push('샘플 모션은 기본 마네킹 전용');
 for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)if(new T.Vector3(...pos[i]).distanceTo(new T.Vector3(...pos[j]))<.65)warnings.push(`${p.members[i].name} ↔ ${p.members[j].name} 근접`);
 this.drawScene(t);return warnings;
 }
 drawScene(t:number){
  const s=useStudio.getState(),p=s.project;
  if(!this.renderer.getSize){this.renderer.render(this.scene,this.camera);return;}
  const size=this.renderer.getSize(new T.Vector2()),ratio=p.output.aspect==='16:9'?16/9:9/16;
  this.renderCamera=configureRenderCamera(this.renderCamera,cameraPoseAt(p,t,this.exportCameraId),ratio);
  this.controls.enabled=!this.exporting&&s.viewMode==='editor';
  for(const [id,g] of this.cameraGizmos){if(!p.sceneCameras?.some(c=>c.id===id)){g.helper.dispose();g.helper.removeFromParent();this.cameraGizmos.delete(id);}}
  for(const c of p.sceneCameras??[]){let gizmo=this.cameraGizmos.get(c.id);const camera=configureRenderCamera(gizmo?.camera,cameraPoseAt(p,t,c.id),ratio);camera.far=2;camera.updateProjectionMatrix();if(!gizmo||gizmo.camera!==camera){gizmo?.helper.dispose();gizmo?.helper.removeFromParent();const helper=new T.CameraHelper(camera);helper.material=new T.LineBasicMaterial({color:c.id===p.activeCameraId?'#eeeeee':'#777777'});this.scene.add(helper);gizmo={camera,helper};this.cameraGizmos.set(c.id,gizmo);}gizmo.helper.update();gizmo.helper.visible=!this.exporting&&s.viewMode==='editor'&&camera.position.distanceTo(this.camera.position)>.5;(gizmo.helper.material as T.LineBasicMaterial).color.set(c.id===p.activeCameraId?'#eeeeee':'#777777');}
  this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,size.x,size.y);this.renderer.clear();
  if(this.exporting){this.renderer.render(this.scene,this.renderCamera);return;}
  if(s.viewMode==='camera'){
   const w=Math.min(size.x,size.y*ratio),h=w/ratio;this.grid.visible=false;this.actors.forEach(a=>a.ring.visible=false);this.renderer.setViewport((size.x-w)/2,(size.y-h)/2,w,h);this.renderer.render(this.scene,this.renderCamera);this.actors.forEach(a=>a.ring.visible=true);this.renderer.setViewport(0,0,size.x,size.y);return;
  }
  this.renderer.render(this.scene,this.camera);
  if(s.cameraPreview&&size.x>450&&size.y>230){const w=Math.min(230,size.x*.3,size.y*.36*ratio),h=w/ratio,x=size.x-w-12,y=size.y-h-12;const oldGrid=this.grid.visible;this.grid.visible=false;this.cameraGizmos.forEach(g=>g.helper.visible=false);this.actors.forEach(a=>a.ring.visible=false);this.renderer.setScissorTest(true);this.renderer.setScissor(x,y,w,h);this.renderer.setViewport(x,y,w,h);this.renderer.clear();this.renderer.render(this.scene,this.renderCamera);this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,size.x,size.y);this.grid.visible=oldGrid;this.actors.forEach(a=>a.ring.visible=true);}
 }
 animate=()=>{if(this.disposed)return;this.raf=requestAnimationFrame(this.animate);if(this.exporting)return;let s=useStudio.getState();let t=s.time;if(s.playing){t=sound.now();if(this.exporting&&t>=this.exportEnd){if(this.recorder?.state==='recording')this.recorder.stop();sound.stop();useStudio.setState({playing:false});return;}if(t>=s.project.duration){if(s.loop&&!this.exporting){t=0;void sound.start(0,s.project.rate,s.project.audio);}else{t=s.project.duration;sound.stop();useStudio.setState({playing:false});}}useStudio.setState({time:t});}
 try{const warnings=this.evaluate(t);this.frames++;const now=performance.now();if(now-this.fpsStamp>700){this.fps=Math.round(this.frames*1000/(now-this.fpsStamp));this.frames=0;this.fpsStamp=now;this.onStats(this.fps,warnings);}}catch(e){notice((e as Error).message);useStudio.setState({playing:false});sound.stop();}
 };
 async play(){const s=useStudio.getState();if(s.playing){sound.stop();useStudio.setState({playing:false});}else{const t=s.time>=s.project.duration?0:s.time;await sound.start(t,s.project.rate,s.project.audio);useStudio.setState({time:t,playing:true});}}
 async seek(t:number){const s=useStudio.getState();if(s.recording)return;t=Math.max(0,Math.min(s.project.duration,t));if(s.playing)await sound.start(t,s.project.rate,s.project.audio);useStudio.setState({time:t});}
 async exportVideo(onProgress:(n:number)=>void,selection?:{id:string;start:number;end:number}):Promise<Blob|undefined>{
  const s=useStudio.getState(),p=s.project,o=p.output,start=selection?.start??o.start,end=selection?.end??o.end;
  if(this.exporting)return;
  if(!(start>=0&&end>start&&end<=p.duration))throw Error('녹화 구간을 확인하세요.');
  if(p.assets.some(a=>a.kind!=='demo'&&(a.id===p.audio||a.id===p.baseRig||p.clips.some(c=>c.asset===a.id))&&!resources.has(a.id)))throw Error('누락된 FBX/음악을 다시 연결하세요.');
  if(p.baseRig&&p.clips.some(c=>c.asset.startsWith('demo-')&&c.start<end&&c.start+c.duration>start))throw Error('샘플 클립을 FBX 모션으로 교체하세요.');
  const previousTime=s.time;sound.stop();this.exporting=true;this.exportCameraId=selection?.id??activeCamera(p)?.id;useStudio.setState({playing:false,recording:true,time:start});
  const abort=new AbortController();this.cancelExport=()=>abort.abort();
  try{
   this.controls.enabled=false;this.actors.forEach(a=>a.ring.visible=false);this.renderer.setPixelRatio(1);const width=o.aspect==='16:9'?Math.round(o.height*16/9):Math.round(o.height*9/16/2)*2;this.renderer.setSize(width,o.height);
   return await encodeMp4({canvas:this.renderer.domElement,start,end,fps:o.fps,audio:o.audio&&p.audio?resources.get(p.audio)?.buffer:undefined,render:t=>{this.evaluate(t);useStudio.setState({time:t});},onProgress,signal:abort.signal});
  }finally{this.cancelExport=null;this.exporting=false;this.exportCameraId=undefined;this.controls.enabled=s.viewMode==='editor';this.actors.forEach(a=>a.ring.visible=true);useStudio.setState({recording:false,playing:false,time:previousTime});this.fit();}
 }
 dispose(){this.disposed=true;cancelAnimationFrame(this.raf);this.cancelExport?.();this.unsubscribe();this.resize.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('pointerdown',this.pick);this.clearActors();this.scene.traverse(o=>{const m=o as T.Mesh;if(m.geometry)m.geometry.dispose();if(m.material)for(const v of Array.isArray(m.material)?m.material:[m.material])if(v!==meshMaterial)v.dispose();});this.cameraGizmos.forEach(g=>g.helper.dispose());this.renderer.dispose();this.renderer.domElement.remove();}
}
