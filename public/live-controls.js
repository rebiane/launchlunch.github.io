import {canJump} from './game-rules.js';
// Inputs are intent only. The room server owns movement, contacts and results.
export function createLiveControls({onInput}){
 const surface=document.querySelector('#arena .track-wrap'),root=document.createElement('div');
 root.id='live-controls';root.className='live-controls';root.hidden=true;
 root.innerHTML='<div class="live-touch-zones" aria-hidden="true"><div class="touch-zone-move"><span>이동<small>드래그</small></span></div><div class="touch-zone-jump"><span>점프<small>누르기 · 길게 누르기</small></span></div></div><p class="live-key-hint">이동 <kbd>W A S D</kbd> / 방향키 · 점프 <kbd>Space</kbd></p><p class="live-touch-hint">드래그 이동 · 탭 점프<span>누른 채 드래그하면 이동하며 연속 점프</span></p><span class="live-gesture-stick" aria-hidden="true"><i></i></span><span class="live-jump-touch" aria-hidden="true">점프</span>';
 surface.append(root);
 const stick=root.querySelector('.live-gesture-stick'),thumb=stick.firstElementChild,jumpCue=root.querySelector('.live-jump-touch'),keys=new Set(),pointers=new Map();
 let active=false,disposed=false,boatControls=false,jumpEnabled=false,controlMode=null,primary=null,touch={x:0,z:0},last={x:0,z:0,jumpHeld:false},timer=0,lastSent=0;
 function transmit(jump=false,force=false,action=false){
  if(!active&&!force)return;
  jump=jump&&jumpEnabled;const jumpHeld=jumpEnabled&&(keys.has('Space')||[...pointers.values()].some(p=>p.jumpHold));
  let x=touch.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),z=touch.z+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);
  if(controlMode==='shake')z=0;if(boatControls){x=Math.max(-1,Math.min(1,x));z=z<-.15||keys.has('Space')?-1:0;}
  const length=Math.hypot(x,z);if(!boatControls&&length>1){x/=length;z/=length;}x=Math.round(x*1000)/1000;z=Math.round(z*1000)/1000;
  action=action&&controlMode==='shake';
  if(!force&&!jump&&!action&&!last.action&&x===last.x&&z===last.z&&jumpHeld===last.jumpHeld)return;
  last={x,z,jumpHeld,action};lastSent=performance.now();onInput({x,z,jump,jumpHeld,action});
 }
 function queueMovement(){if(performance.now()-lastSent>=33)transmit();else if(!timer)timer=setTimeout(()=>{timer=0;transmit();},33);}
 function resetTouch(){touch={x:0,z:0};primary=null;stick.classList.remove('moving');thumb.style.transform='translate(0px,0px)';clearTimeout(timer);timer=0;}
 function release(){const ids=[...pointers.keys()];for(const p of pointers.values())clearTimeout(p.holdTimer);pointers.clear();jumpCue.classList.remove('held');keys.clear();resetTouch();for(const id of ids)if(surface.hasPointerCapture(id))surface.releasePointerCapture(id);transmit(false,true);}
 function updateGesture(event){const point=pointers.get(event.pointerId);if(!point)return;const dx=event.clientX-point.x,dz=event.clientY-point.y,distance=Math.hypot(dx,dz);point.distance=Math.max(point.distance,distance);if(event.pointerId!==primary)return;
  if(!point.dragging&&distance<(boatControls?5:9))return;point.dragging=true;if(!jumpEnabled)root.classList.add('gestured');stick.classList.add('moving');const radius=48,scale=Math.min(1,radius/(distance||1));touch=boatControls?{x:Math.abs(dx)<4?0:Math.max(-1,Math.min(1,dx/32)),z:dz<-10?-1:0}:{x:distance<6?0:dx*scale/radius,z:distance<6?0:dz*scale/radius};thumb.style.transform=`translate(${dx*scale}px,${dz*scale}px)`;queueMovement();
 }
 const controller=new AbortController(),listen=(target,name,fn)=>target.addEventListener(name,fn,{signal:controller.signal,capture:name==='keydown'||name==='keyup'});
 listen(surface,'pointerdown',event=>{
  if(!active||event.button!==0||event.target.closest?.('button,a,input,select,textarea,[contenteditable="true"]'))return;
  event.preventDefault();const bounds=surface.getBoundingClientRect();
  const point={x:event.clientX,y:event.clientY,distance:0,dragging:false,jumpHold:false,holdTimer:null};pointers.set(event.pointerId,point);surface.setPointerCapture(event.pointerId);
  if(primary===null){primary=event.pointerId;stick.style.left=(event.clientX-bounds.left)+'px';stick.style.top=(event.clientY-bounds.top)+'px';}
  if(jumpEnabled)point.holdTimer=setTimeout(()=>{if(!active||!pointers.has(event.pointerId))return;point.jumpHold=true;root.classList.add('gestured');jumpCue.style.left=(point.x-bounds.left)+'px';jumpCue.style.top=(point.y-bounds.top)+'px';jumpCue.classList.add('held');transmit(true);},420);

 });
 listen(surface,'pointermove',event=>{if(active&&pointers.has(event.pointerId)){event.preventDefault();updateGesture(event);}});
 function finishPointer(event,cancelled=false){const point=pointers.get(event.pointerId);if(!point)return;clearTimeout(point.holdTimer);const tapped=!cancelled&&!point.dragging&&!point.jumpHold;pointers.delete(event.pointerId);if(![...pointers.values()].some(p=>p.jumpHold))jumpCue.classList.remove('held');
  if(event.pointerId===primary)resetTouch();if(surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId);transmit(jumpEnabled&&tapped,false,!cancelled&&controlMode==='shake'&&point.distance<9);
 }
 listen(surface,'pointerup',event=>finishPointer(event));listen(surface,'pointercancel',event=>finishPointer(event,true));listen(surface,'lostpointercapture',event=>finishPointer(event,true));
 const movement=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
 listen(window,'keydown',event=>{if(!active||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;if(movement.has(event.code)){event.preventDefault();keys.add(event.code);transmit();}else if(event.code==='Space'){event.preventDefault();if((jumpEnabled||boatControls||controlMode==='shake')&&!event.repeat&&!keys.has('Space')){keys.add('Space');transmit(jumpEnabled,false,controlMode==='shake');}}});
 listen(window,'keyup',event=>{if(!active)return;if(movement.has(event.code)||event.code==='Space')event.preventDefault();if(keys.has(event.code)){event.preventDefault();keys.delete(event.code);transmit();}});
 listen(window,'blur',()=>{if(active)release();});listen(document,'visibilitychange',()=>{if(active&&document.hidden)release();});
 return {setMode(mode){if(mode===controlMode)return;if(active)release();controlMode=mode;boatControls=mode==='tricycle';jumpEnabled=canJump(mode);root.dataset.controlLayout=mode==='shake'?'shake':boatControls?'boat':jumpEnabled?'onehand':'move';root.querySelector('.live-key-hint').innerHTML=mode==='shake'?'기울이기 <kbd>← →</kbd> · 흔들기 <kbd>Space</kbd>':boatControls?'조향 <kbd>← →</kbd> · 가속 <kbd>↑</kbd> 길게 누르기 · 손을 떼면 감속':jumpEnabled?'이동 <kbd>W A S D</kbd> / 방향키 · 점프 <kbd>Space</kbd>':'이동 <kbd>W A S D</kbd> / 방향키';root.querySelector('.touch-zone-jump').innerHTML=boatControls?'<span>위로 가속<small>손을 떼면 감속</small></span>':'<span>점프<small>누르기 · 길게 누르기</small></span>';root.querySelector('.touch-zone-move span').innerHTML=boatControls?'↖ ↑ ↗<small>위로 가속 · 좌우로 조향</small>':mode==='shake'?'흔들기<small>좌우로 기울이고 · 탭해서 흔들어요</small>':jumpEnabled?'드래그 이동 · 탭 점프<small>꾹 누르면 이동하며 연속 점프</small>':'이동<small>드래그</small>';root.querySelector('.live-touch-hint').innerHTML=mode==='shake'?'좌우로 기울이고 · 탭해서 흔들어요':boatControls?'화면 어디서든 위로 드래그해 가속<span>대각선으로 가속 + 조향 · 손을 떼면 감속</span>':jumpEnabled?'드래그 이동 · 탭 점프<span>누른 채 드래그하면 이동하며 연속 점프</span>':'화면을 드래그해 이동';},setActive(value){if(disposed)return;value=!!value;if(active===value)return;if(!value)release();active=value;root.hidden=!active;surface.classList.toggle('live-gesture-active',active);if(active)root.classList.remove('gestured');},dispose(){if(disposed)return;if(active)release();active=false;disposed=true;clearTimeout(timer);controller.abort();surface.classList.remove('live-gesture-active');root.remove();}};
}
