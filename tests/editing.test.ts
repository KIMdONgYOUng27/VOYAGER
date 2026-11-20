import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProject} from '../src/model.ts';
import {useStudio} from '../src/store.ts';

test('Delete removes just the selected clip, preserves other tracks, and supports undo/redo',()=>{
  const project=initialProject();
  useStudio.getState().replace(project);
  const selected=project.clips[4];
  useStudio.setState({clip:selected.id,selected:selected.member});
  useStudio.getState().deleteSelectedClip();
  assert.equal(useStudio.getState().clip,null);
  assert.deepEqual(useStudio.getState().project.clips,project.clips.filter(c=>c.id!==selected.id));
  assert.equal(useStudio.getState().history.length,1);
  useStudio.getState().undo();
  assert.deepEqual(useStudio.getState().project.clips,project.clips);
  useStudio.getState().redo();
  assert.equal(useStudio.getState().project.clips.some(c=>c.id===selected.id),false);
});

test('Delete without a selection or during recording makes no edit',()=>{
  useStudio.getState().replace(initialProject());
  const project=useStudio.getState().project;
  useStudio.getState().deleteSelectedClip();
  assert.equal(useStudio.getState().project,project);
  useStudio.setState({clip:project.clips[0].id,recording:true});
  useStudio.getState().deleteSelectedClip();
  assert.equal(useStudio.getState().project,project);
  assert.equal(useStudio.getState().history.length,0);
  useStudio.setState({recording:false});
});
