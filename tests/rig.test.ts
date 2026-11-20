import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {StudioEngine} from '../src/engine.ts';
import {resources} from '../src/assets.ts';
import {useStudio} from '../src/store.ts';
import {initialProject} from '../src/model.ts';
test('real FBX: five independent skeletons and deterministic sampled poses including overlapping same-source clips',{skip:!existsSync(new URL('./fixtures/Samba Dancing.fbx',import.meta.url))?'Run pnpm fixtures to enable the real-FBX integration test':false},()=>{
 const b=readFileSync(new URL('./fixtures/Samba Dancing.fbx',import.meta.url));
 const object=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const id='test-fbx';const clip=object.animations[0];
 resources.set(id,{info:{id,name:'Samba',kind:'fbx',duration:clip.duration},file:new File([b],'Samba Dancing.fbx'),object,clip});
 const p=initialProject();p.baseRig=id;p.assets=[resources.get(id)!.info];p.clips=p.members.flatMap((_,member)=>[{id:'clip-'+member,member,asset:id,start:0,duration:18,offset:member*.1,speed:1,loop:true,fade:0},{id:'overlap-'+member,member,asset:id,start:4,duration:4,offset:8,speed:1,loop:true,fade:1}]);useStudio.setState({project:p});
 const engine=Object.create(StudioEngine.prototype) as StudioEngine;
 Object.assign(engine,{scene:new T.Scene(),stageRoot:new T.Group(),baseFov:38,actors:[],lastBase:'',grid:new T.GridHelper(),renderer:{render:(scene:T.Scene)=>scene.updateMatrixWorld(true)}});
 engine.evaluate(5);assert.equal(engine.actors.length,5);
 engine.actors.forEach((actor,index)=>{
  assert.equal('#'+actor.material.color.getHexString(),p.members[index].color);
  actor.root.traverse(node=>{if(node instanceof T.Mesh)assert.equal(node.material,actor.material);});
 });
 const capture=()=>engine.actors.map(a=>Array.from(a.bones.values()).map(b=>[...b.position.toArray(),...b.quaternion.toArray()]));
 const pose=capture();engine.evaluate(1);assert.notDeepEqual(capture(),pose);engine.evaluate(12);engine.evaluate(5);assert.deepEqual(capture(),pose);
 assert.notEqual(engine.actors[0].bones.get('hips'),engine.actors[1].bones.get('hips'));
 assert.equal(engine.actors[0].actions.size,2);engine.clearActors();resources.delete(id);
});
