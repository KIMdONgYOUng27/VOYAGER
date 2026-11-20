import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {initialProject,validateProject,type Clip} from '../src/model.ts';
import {prepareProject} from '../src/project.ts';
import {insertClip,moveClips,normalizeTracks,overlaps,selectionInRect,trimWithoutOverlap} from '../src/timelineEditing.ts';
import {activeCamera,addCamera,cameraPoseAt,removeCamera,setCameraPose,cameraFileName} from '../src/cameras.ts';
import {configureRenderCamera} from '../src/cameraRendering.ts';
import {deleteKey,moveKey} from '../src/animation.ts';
import {useStudio} from '../src/store.ts';
const noOverlap=(clips:Clip[])=>{for(const a of clips)for(const b of clips)if(a!==b)assert.equal(overlaps(a,b),false,`${a.id}/${b.id}`);};

test('default performers use Korean names and every track starts with adjacent clips',()=>{
 const p=initialProject();assert.deepEqual(p.members.map(m=>m.name),['은유','지겸','서우','이혁','도경']);noOverlap(p.clips);for(let member=0;member<5;member++){const track=p.clips.filter(c=>c.member===member);assert.equal(track[1].start,track[0].start+track[0].duration);assert.equal(track[2].start,track[1].start+track[1].duration);}
});
test('legacy overlapping projects retain source offsets and get independent camera data without mutating input',()=>{
 const old=initialProject();old.members[0].name='EUNO';old.members[1].name='JIGYEOM';old.clips[1].start=7.7;old.cameraBase={position:[1,2,3],target:[0,1,0]};old.cameras=[{id:'old-key',time:0,position:[1,2,3],target:[0,1,0]}];const copy=prepareProject(old);noOverlap(copy.clips);assert.equal(old.clips[1].start,7.7);assert.equal(copy.members[0].name,'은유');assert.equal(copy.members[1].name,'지겸');assert.equal(copy.clips[1].offset,old.clips[1].offset);assert.equal(activeCamera(copy)!.keys[0].id,'old-key');activeCamera(copy)!.keys[0].position[0]=9;assert.equal(old.cameras[0].position[0],1);
});
test('insertion appends to occupied clips without replacing them and stops at project end',()=>{
 const p=initialProject();p.clips=[];const first=insertClip(p,'demo-groove',0,0)!;const second=insertClip(p,'demo-hit',0,2)!;assert.equal(p.clips.find(c=>c.id===second)!.start,4);assert.equal(p.clips.find(c=>c.id===first)!.duration,4);while(insertClip(p,'demo-groove',0,0)){}assert.equal(p.clips.length,6);noOverlap(p.clips);
});
test('moving a selection uses one common delta and cannot cross neighbours or project boundaries',()=>{
 const p=initialProject();p.clips=p.clips.filter(c=>c.start===0);p.clips.forEach(c=>{c.duration=2;c.start=2;});const ids=p.clips.slice(0,3).map(c=>c.id);p.clips.push({...p.clips[0],id:'obstacle',start:7,duration:3});const delta=moveClips(p,ids,9);assert.equal(delta,3);p.clips.filter(c=>ids.includes(c.id)).forEach(c=>assert.equal(c.start,5));noOverlap(p.clips);assert.equal(moveClips(p,ids,-100),-5);noOverlap(p.clips);
});
test('trimming into neighbours is clamped and retains source phase on left trim',()=>{
 const p=initialProject(),c=p.clips[1];trimWithoutOverlap(p,c.id,'left',0);assert.equal(c.start,8);trimWithoutOverlap(p,c.id,'right',24);assert.equal(c.duration,8);trimWithoutOverlap(p,c.id,'left',10);assert.equal(c.start,10);assert.equal(c.offset,2);noOverlap(p.clips);
});
test('marquee selection intersects clips across tracks without selecting unrelated rows',()=>{
 const p=initialProject();const rows=[0,1,2,3,4].map(member=>({member,top:member*32,bottom:member*32+32}));const ids=selectionInRect(p,{left:1,right:7*42,top:2,bottom:63},42,rows);assert.deepEqual(ids.sort(),p.clips.filter(c=>c.start===0&&c.member<2).map(c=>c.id).sort());
});
test('multi-delete is one undo operation and preserves unselected members',()=>{
 useStudio.getState().replace(initialProject());const before=useStudio.getState().project,ids=before.clips.slice(0,4).map(c=>c.id);useStudio.setState({clips:ids,clip:ids[0]});useStudio.getState().deleteSelectedClip();assert.equal(useStudio.getState().project.clips.length,before.clips.length-4);assert.equal(useStudio.getState().history.length,1);assert.deepEqual(useStudio.getState().project.clips,before.clips.filter(c=>!ids.includes(c.id)));useStudio.getState().undo();assert.deepEqual(useStudio.getState().project.clips,before.clips);
});
test('cameras own their keys, ranges and stable file numbers through edits, deletion and save',()=>{
 const p=prepareProject(initialProject()),first=activeCamera(p)!;setCameraPose(p,{...first.base,position:[0,2,10]},0,true);setCameraPose(p,{...first.base,position:[4,2,10]},4,true);const second=addCamera(p,{...first.base,position:[8,3,0]}),cam2=activeCamera(p)!;cam2.recordStart=2;cam2.recordEnd=6;setCameraPose(p,{...cam2.base,position:[9,3,0]},0,true);assert.equal(first.keys.length,2);assert.equal(cam2.keys.length,1);assert.equal(cameraPoseAt(p,2,first.id).position[0],2);assert.equal(cameraPoseAt(p,2,second).position[0],9);moveKey(p,{kind:'camera',id:cam2.keys[0].id,camera:second},3);assert.equal(first.keys[0].time,0);assert.equal(cam2.keys[0].time,3);deleteKey(p,{kind:'camera',id:cam2.keys[0].id,camera:second});assert.equal(first.keys.length,2);const saved=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(saved.sceneCameras![1].recordStart,2);assert.equal(saved.sceneCameras![1].recordEnd,6);removeCamera(p,first.id);assert.equal(activeCamera(p)!.number,2);assert.ok(cameraFileName(p,activeCamera(p)!).endsWith('_CAM02.mp4'));removeCamera(p,second);assert.equal(p.sceneCameras!.length,1);
});
test('rendering a camera never changes the editor camera or another camera pose',()=>{
 const editor=new T.PerspectiveCamera(38);editor.position.set(8,6,11);editor.lookAt(0,1,0);const pos=editor.position.clone(),q=editor.quaternion.clone(),pose={position:[0,2,10] as [number,number,number],target:[0,1,0] as [number,number,number],fov:55,zoom:1};const output=configureRenderCamera(undefined,pose,16/9);assert.equal((output as T.PerspectiveCamera).fov,55);assert.equal((output as T.PerspectiveCamera).aspect,16/9);assert.ok(editor.position.equals(pos));assert.ok(editor.quaternion.equals(q));const next=configureRenderCamera(output,{...pose,projection:'orthographic'},9/16);assert.ok(next instanceof T.OrthographicCamera);assert.ok(editor.position.equals(pos));
});
