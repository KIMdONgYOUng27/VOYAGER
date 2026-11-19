import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {initialProject,positionsAt,formationPositionsAt,stagePositionAt,samplePositionKeys,trimClip,clipLocal,naturalizeFormations,validateProject,eased,type Vec3} from '../src/model.ts';
import {putMemberPosition,putClipPosition,putStagePosition,putFormation} from '../src/spatial.ts';
import {StudioEngine} from '../src/engine.ts';
import {useStudio} from '../src/store.ts';

const close=(a:number[],b:number[],epsilon=1e-8)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<epsilon,`${v} != ${b[i]}`));
test('a member position key moves only that member and remains deterministic on reverse seeks',()=>{
 const p=initialProject(),before=positionsAt(p,4);
 putMemberPosition(p,0,4,[0,0,2]);
 close(positionsAt(p,4)[0],[0,0,2]);
 for(let i=1;i<5;i++)close(positionsAt(p,4)[i],before[i]);
 const middle=positionsAt(p,2);close(middle[0],[-1.5,0,.2]);positionsAt(p,16);assert.deepEqual(positionsAt(p,2),middle);
});
test('clip-local motion keys travel with a clip without affecting other members',()=>{
 const p=initialProject();p.clips=p.clips.filter(c=>c.member!==0);const c={id:'local',member:0,asset:'demo-groove',start:2,duration:8,offset:0,speed:1,loop:true,fade:0};p.clips.push(c);
 putClipPosition(p,c.id,2,[0,0,0]);putClipPosition(p,c.id,10,[2,0,1]);
 const original=positionsAt(p,6)[0];close(original,[-2,0,-1.1]);
 c.start=4;close(positionsAt(p,8)[0],original);close(positionsAt(p,8)[1],formationPositionsAt(p,8)[1]);
 assert.throws(()=>putClipPosition(p,c.id,0,[0,0,0]));
});
test('both clip edges trim independently; left trimming preserves source phase and exact curved movement',()=>{
 const p=initialProject(),c={...p.clips[0],start:2,duration:8,offset:.5,speed:1.5,fade:0,positionKeys:[{id:'a',time:0,position:[0,0,0] as Vec3,ease:'smoother' as const},{id:'b',time:8,position:[4,0,2] as Vec3,ease:'smoother' as const}]};
 const left=trimClip(c,'left',3,4,24,30);assert.equal(left.start,3);assert.equal(left.duration,7);assert.equal(left.positionKeys![0].time,-1);
 for(const t of [3,4,6,9]){assert.equal(clipLocal(left,t,4),clipLocal(c,t,4));close(samplePositionKeys(left.positionKeys,t-left.start),samplePositionKeys(c.positionKeys,t-c.start));}
 const right=trimClip(c,'right',7,4,24,30);assert.equal(right.start,2);assert.equal(right.duration,5);assert.equal(right.offset,c.offset);assert.equal(right.positionKeys!.length,2);
 assert.ok(trimClip(c,'right',-4,4,24,30).duration>=1/30);
 const lastFrame=trimClip({...c,start:23.99,duration:.01},'right',30,4,24,30);assert.ok(lastFrame.start+lastFrame.duration<=24);
 const noLoop=trimClip({...c,loop:false},'left',0,4,24,30);assert.ok(noLoop.offset>=0);assert.ok(noLoop.start>=2-.5/1.5);
});
test('stage anchors move the entire formation together and are independent of member tracks',()=>{
 const p=initialProject();putStagePosition(p,4,[2,0,-2],'Right/back',2);
 close(stagePositionAt(p,5),[1,0,-1]);const base=formationPositionsAt(p,5),at=positionsAt(p,5);
 at.forEach((v,i)=>close(v,base[i].map((n,axis)=>n+[1,0,-1][axis])));
 putMemberPosition(p,2,5,[0,0,0]);close(positionsAt(p,5)[2],[0,0,0]);close(positionsAt(p,5)[0],at[0]);
});
test('natural formation connections are continuous, fit the next key, and ease in/out',()=>{
 const p=initialProject();putFormation(p,'Two Rows',4,2,true);naturalizeFormations(p);
 const keys=[...p.formations].sort((a,b)=>a.time-b.time);
 keys.forEach((k,i)=>{assert.equal(k.ease,'smoother');if(i<keys.length-1)assert.ok(k.time+k.transition<=keys[i+1].time+1e-8);if(i>0){const before=formationPositionsAt({...p,formations:keys.slice(0,i)},k.time);formationPositionsAt(p,k.time).forEach((v,j)=>close(v,before[j]));}});
 assert.ok(eased(.00001,'smoother')<1e-12);assert.ok(1-eased(.99999,'smoother')<1e-12);
});
test('old projects still open and new colors/paths/camera projection survive JSON roundtrip',()=>{
 const p=initialProject();putMemberPosition(p,1,3,[2,0,1]);putClipPosition(p,p.clips[0].id,2,[1,0,0]);putStagePosition(p,4,[0,0,2],'Front',2);
 p.cameras.push({id:'ortho',time:0,position:[16,.8,0],target:[0,.8,0],projection:'orthographic',zoom:1.2,up:[0,1,0]});
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 const old=initialProject();delete old.stageKeys;delete old.memberPositionKeys;assert.deepEqual(validateProject(JSON.parse(JSON.stringify(old))),old);
 assert.throws(()=>validateProject({...p,members:p.members.map(m=>({...m,color:'broken'}))}));
 assert.throws(()=>validateProject({...p,memberPositionKeys:[{id:'bad',time:0,member:8,position:[0,0,0],ease:'smoother'}]}));
});
test('all actors have independent colored body materials and live color changes are isolated',()=>{
 const p=initialProject();useStudio.getState().replace(p);
 const engine=Object.create(StudioEngine.prototype) as StudioEngine;
 Object.assign(engine,{scene:new T.Scene(),stageRoot:new T.Group(),baseFov:38,actors:[],lastBase:'',grid:new T.GridHelper(),renderer:{render:(scene:T.Scene)=>scene.updateMatrixWorld(true)}});
 engine.evaluate(2);assert.equal(new Set(engine.actors.map(a=>a.material)).size,5);
 engine.actors.forEach((a,i)=>assert.equal('#'+a.material.color.getHexString(),p.members[i].color));
 useStudio.getState().edit(d=>{d.members[0].color='#ff0033';});engine.evaluate(2);
 assert.equal(engine.actors[0].material.color.getHexString(),'ff0033');assert.equal('#'+engine.actors[1].material.color.getHexString(),p.members[1].color);
 engine.clearActors();
});
test('X/Y/Z views use correctly aligned orthographic cameras',()=>{
 const engine=Object.create(StudioEngine.prototype) as StudioEngine;
 const target=new T.Vector3(0,.8,0);
 Object.assign(engine,{camera:new T.PerspectiveCamera(),controls:{target,update(){engine.camera.lookAt(target);}},projection(mode:string,up:Vec3){engine.camera=mode==='orthographic'?new T.OrthographicCamera():new T.PerspectiveCamera();engine.camera.up.set(...up);},fit(){engine.frameCamera(1280,720,16/9);}});
 const directions:Record<string,Vec3>={'Axis +X':[-1,0,0],'Axis -X':[1,0,0],'Axis +Y':[0,-1,0],'Axis -Y':[0,1,0],'Axis +Z':[0,0,-1],'Axis -Z':[0,0,1]};
 for(const [mode,expected] of Object.entries(directions)){engine.setCamera(mode);assert.ok(engine.camera instanceof T.OrthographicCamera);close(engine.camera.getWorldDirection(new T.Vector3()).toArray(),expected);}
 engine.setCamera('Perspective');assert.ok(engine.camera instanceof T.PerspectiveCamera);
});
