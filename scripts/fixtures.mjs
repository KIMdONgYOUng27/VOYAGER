import {mkdir,writeFile} from 'node:fs/promises';
// Optional integration-test asset, downloaded directly from the official Three.js tag.
const url='https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/fbx/Samba%20Dancing.fbx';
const response=await fetch(url);
if(!response.ok)throw Error(`Fixture download failed: HTTP ${response.status}`);
const directory=new URL('../tests/fixtures/',import.meta.url);
await mkdir(directory,{recursive:true});
await writeFile(new URL('Samba Dancing.fbx',directory),new Uint8Array(await response.arrayBuffer()));
console.log('Downloaded official Three.js r180 FBX integration-test fixture.');
