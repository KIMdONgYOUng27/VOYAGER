import type {Project} from './model.ts';
export type KeyChannel='position'|'rotation'|'scale'|'color'|'visible'|'clip';
export const channelLabels:Record<KeyChannel,string>={position:'위치',rotation:'회전',scale:'크기',color:'색상',visible:'표시',clip:'클립 위치'};
export function memberKeyChannels(p:Project,member:number):KeyChannel[]{
 const channels:KeyChannel[]=[];
 if(p.memberPositionKeys?.some(k=>k.member===member))channels.push('position');
 for(const property of ['rotation','scale','color','visible'] as const)if(p.memberPropertyKeys?.some(k=>k.member===member&&k.property===property))channels.push(property);
 if(p.clips.some(c=>c.member===member&&c.positionKeys?.some(k=>k.time>=0&&k.time<=c.duration)))channels.push('clip');
 return channels;
}
export type StageChannel='position'|'preset'|'rotation'|'scale'|'visible';
export function stageKeyChannels(p:Project):StageChannel[]{
 const channels:StageChannel[]=[];
 if(p.stagePositionKeys?.length)channels.push('position');if(p.stageKeys?.length)channels.push('preset');
 for(const property of ['rotation','scale','visible'] as const)if(p.stagePropertyKeys?.some(k=>k.property===property))channels.push(property);
 return channels;
}
