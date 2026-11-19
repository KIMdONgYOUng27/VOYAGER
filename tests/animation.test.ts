import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {initialProject,positionsAt,memberTransformAt,stageTransformAt,cameraAt,validateProject,type Vec3,type CameraPose} from '../src/model.ts';
import {insertTransformKeys,editMemberPosition,editProperty,editStagePosition,putCameraKey,moveKey,deleteKey,keyGlobalTime} from '../src/animation.ts';
import {useStudio} from '../src/store.ts';
import {StudioEngine} from '../src/engine.ts';
const close=(a:number[],b:number[])=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6,`${a} != ${b}`));

test('member rotation supports a full spin, scale/color interpolate, visibility steps and reverse seeks match',()=>{
 const p=initialProject();insertTransformKeys(p,'member',2,0);editProperty(p,'member',2,'rotation',[0,360,0],4,true);editProperty(p,'member',2,'scale',[2,2,2],4,true);editProperty(p,'member',2,'color','#ff0000',4,true);editProperty(p,'member',2,'visible',false,4,true);
 const midpoint=memberTransformAt(p,2,2);close(midpoint.rotation,[0,180,0]);close(midpoint.scale,[1.5,1.5,1.5]);assert.equal(midpoint.visible,true);assert.equal(memberTransformAt(p,2,4).visible,false);assert.notEqual(midpoint.color,p.members[2].color);assert.equal(memberTransformAt(p,2,4).color,'#ff0000');memberTransformAt(p,2,3);assert.deepEqual(memberTransformAt(p,2,2),midpoint);close(memberTransformAt(p,1,2).scale,[1,1,1]);
});
test('stage TRS composes with member paths and editing world position inverts the stage transform',()=>{
 const p=initialProject();p.stageTransform={position:[3,1,2],rotation:[0,90,0],scale:[2,2,2]};const local=positionsAt(initialProject(),0)[0];const expected=new T.Vector3(...local).multiplyScalar(2).applyEuler(new T.Euler(0,Math.PI/2,0)).add(new T.Vector3(3,1,2));close(positionsAt(p,0)[0],expected.toArray());
 editMemberPosition(p,0,0,[7,2,4],true);close(positionsAt(p,0)[0],[7,2,4]);const other=positionsAt(p,0)[1];editMemberPosition(p,0,2,[9,2,4],true);close(positionsAt(p,2)[0],[9,2,4]);close(positionsAt(p,0)[1],other);
});
test('stage numeric position keys interpolate between frames while placement presets remain independent',()=>{
 const p=initialProject();insertTransformKeys(p,'stage',0,0);editStagePosition(p,4,[4,0,0],true);close(stageTransformAt(p,2).position,[2,0,0]);close(stageTransformAt(p,4).position,[4,0,0]);assert.equal(p.stageKeys?.length,1);
});
test('auto-key off adjusts the basis without adding keys and edits an existing key in place',()=>{
 const p=initialProject();editMemberPosition(p,1,0,[2,0,0],false);assert.equal(p.memberPositionKeys?.length,0);close(positionsAt(p,0)[1],[2,0,0]);insertTransformKeys(p,'member',1,0);editProperty(p,'member',1,'rotation',[0,90,0],4,true);const count=p.memberPropertyKeys!.length;editProperty(p,'member',1,'rotation',[0,75,0],2,false);assert.equal(p.memberPropertyKeys!.length,count);close(memberTransformAt(p,1,0).rotation,[0,30,0]);editProperty(p,'member',1,'rotation',[0,180,0],4,false);assert.equal(p.memberPropertyKeys!.length,count);close(memberTransformAt(p,1,4).rotation,[0,180,0]);
});
test('camera position, Euler rotation, fov, zoom and projection survive save and deterministic seeks',()=>{
 const p=initialProject(),pose:CameraPose={position:[0,2,10],target:[0,1,0],rotation:[0,0,0],fov:40,zoom:1,projection:'perspective'};putCameraKey(p,pose,0);putCameraKey(p,{...pose,position:[8,4,6],rotation:[0,360,30],fov:80,zoom:2,projection:'orthographic'},4);const c=cameraAt(p.cameras,2)!;close(c.position,[4,3,8]);close(c.rotation!,[0,180,15]);assert.equal(c.fov,60);assert.equal(c.zoom,1.5);assert.deepEqual(cameraAt(validateProject(JSON.parse(JSON.stringify(p))).cameras,2),c);assert.equal(cameraAt(p.cameras,4)!.projection,'orthographic');assert.throws(()=>validateProject({...p,cameraBase:{...pose,fov:NaN}}));
});
test('drag transaction adds one undo entry and Escape cancellation restores the whole baseline',()=>{
 useStudio.getState().replace(initialProject());const baseline=useStudio.getState().project;useStudio.getState().beginEdit();for(let i=0;i<20;i++)useStudio.getState().edit(p=>editMemberPosition(p,0,0,[i,0,0],true));assert.equal(useStudio.getState().history.length,0);useStudio.getState().endEdit();assert.equal(useStudio.getState().history.length,1);useStudio.getState().undo();assert.deepEqual(useStudio.getState().project,baseline);useStudio.getState().redo();const beforeCancel=useStudio.getState().project;useStudio.getState().beginEdit();useStudio.getState().edit(p=>editProperty(p,'member',0,'scale',[3,3,3],0,true));useStudio.getState().endEdit(true);assert.equal(useStudio.getState().project,beforeCancel);assert.equal(useStudio.getState().history.length,1);
});
test('retiming onto an occupied frame replaces only that member and property',()=>{
 const p=initialProject();insertTransformKeys(p,'member',0,0);insertTransformKeys(p,'member',1,0);editProperty(p,'member',0,'rotation',[0,120,0],4,true);const key=p.memberPropertyKeys!.find(k=>k.member===0&&k.property==='rotation'&&k.time===4)!;moveKey(p,{kind:'memberProperty',id:key.id},0);assert.equal(p.memberPropertyKeys!.filter(k=>k.member===0&&k.property==='rotation').length,1);assert.equal(p.memberPropertyKeys!.filter(k=>k.member===1).length,4);close(memberTransformAt(p,0,0).rotation,[0,120,0]);
});
test('key retiming respects clip-local time and Delete only removes the selected channel',()=>{
 const p=initialProject();insertTransformKeys(p,'member',0,0);const rotation=p.memberPropertyKeys!.find(k=>k.property==='rotation')!,ref={kind:'memberProperty' as const,id:rotation.id};moveKey(p,ref,2.018);assert.equal(keyGlobalTime(p,ref),2.033333333333333);deleteKey(p,ref);assert.equal(p.memberPropertyKeys!.some(k=>k.id===rotation.id),false);assert.equal(p.memberPositionKeys!.length,1);const c=p.clips[0];c.start=4;c.positionKeys=[{id:'local',time:1,position:[0,0,0],ease:'linear'}];const local={kind:'clipPosition' as const,id:'local',clip:c.id};moveKey(p,local,100);assert.equal(keyGlobalTime(p,local),c.start+c.duration);
});
test('numpad projection toggle retains framing and orbit/zoom/frame selection commands work',()=>{
 const p=initialProject();useStudio.getState().replace(p);useStudio.setState({selected:2,isolatedMember:null});const engine=Object.create(StudioEngine.prototype) as StudioEngine,target=new T.Vector3(0,.8,0);Object.assign(engine,{camera:new T.PerspectiveCamera(38),baseFov:38,renderer:{getSize:(v:T.Vector2)=>v.set(1280,720)},controls:{target,update(){engine.camera.lookAt(target);}},projection(mode:string,up:Vec3){const pos=engine.camera.position.clone();engine.camera=mode==='orthographic'?new T.OrthographicCamera():new T.PerspectiveCamera(38);engine.camera.position.copy(pos);engine.camera.up.set(...up);},fit(){}});engine.camera.position.set(0,3,12);engine.controls.update();const position=engine.camera.position.clone();engine.numpad('Numpad5');assert.ok(engine.camera instanceof T.OrthographicCamera);close(engine.camera.position.toArray(),position.toArray());engine.numpad('Numpad5');assert.ok(engine.camera instanceof T.PerspectiveCamera);engine.numpad('Numpad4');assert.ok(Math.abs(engine.camera.position.x)>1);engine.numpad('NumpadAdd');assert.ok(engine.camera.zoom>1);engine.numpad('NumpadDecimal');assert.ok(Math.abs(engine.camera.position.distanceTo(target)-5)<1e-6);engine.numpad('NumpadDivide');assert.equal(useStudio.getState().isolatedMember,2);engine.numpad('NumpadDivide');assert.equal(useStudio.getState().isolatedMember,null);
});
