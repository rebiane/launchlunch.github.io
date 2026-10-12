import {createLiveGame,stepLiveGame,liveSnapshot} from './live-game.js';
export const PREVIEW_PLAYER='preview-player';
// Offline practice runs the exact room simulation, without creating a room.
export function createPreviewSession(seed,mode,entries){
 const game=createLiveGame(seed,mode,entries);let time=-3100,last=null,snapshot=liveSnapshot(game),input={x:0,z:0},seq=0;
 return {get time(){return time;},get snapshot(){return snapshot;},input(next){input={...next,action:next.action||input.action,jump:next.jump||input.jump,seq:++seq};return seq;},advance(now){
  if(last===null)last=now;time+=Math.max(0,Math.min(100,now-last));last=now;let changed=false;
  while(!game.finished&&game.time+20<=time){stepLiveGame(game,{[PREVIEW_PLAYER]:{...input,at:game.time}},20);input.action=false;input.jump=false;changed=true;}
  if(changed)snapshot=liveSnapshot(game);return snapshot;
 }};
}
