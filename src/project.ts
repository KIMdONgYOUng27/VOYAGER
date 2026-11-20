import {type Project} from './model.ts';
import {normalizeTracks} from './timelineEditing.ts';
import {ensureCameras} from './cameras.ts';
export function prepareProject(original:Project){
 const p=structuredClone(original);
 const names:Record<string,string>={EUNO:'은유',SEOWOO:'서우',JIGYEOM:'지겸',IHYUN:'이혁',IHYUK:'이혁',DOKYEONG:'도경'};
 p.members.forEach(m=>{m.name=names[m.name]??m.name;});
 normalizeTracks(p);ensureCameras(p);return p;
}
