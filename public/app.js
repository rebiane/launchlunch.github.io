import {createPreviewSession,PREVIEW_PLAYER} from './preview-session.js';
import {canJump} from './game-rules.js';
import {createLiveView} from './live-view.js';
import {createLiveClock} from './live-clock.js';
import {createLocalPrediction} from './live-prediction.js';
import {createLiveControls} from './live-controls.js';
import {bookCountdown} from './book-motion.js';
import {COLORS} from './palette.js';
import {shakePose,SHAKE_PIECES} from './shake.js';
import {cookiePose,cookieSupply,cookiePhase} from './cookie.js';
import {SPRINT_MODES,sprintPose} from './sprint.js';
import {FOOD_TABS,foodClass,filterFoods} from './food-filter.js';
import {pickAddress} from './address-picker.js';
import {mapSearchUrl} from './map-search.js';
import {EMOJI, safeLink, pickSpeed} from './race.js';
import {gamePlan,GAME_META} from './game.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null, myId=null, socket=null, roomId=new URLSearchParams(location.search).get('room'), retry=0, offset=0, retryTimer, demoRace=null, sound=true, audio=null, editing=null, formVersion=1, searchItems=[], searchVersion=1, previousRaceId=null, lastBeep='', searchTimeout;
let addingFromSearch=false,foodTab='all',pendingSearch=null,searchCacheKey='',pendingLocation=null;
let selectedMode='island',previewMode=false,previewGame=null,previewPlayMode='direct',renderedScreen=null;
let token, locationOptions=[], selectedCenter=null, locationTimer;
try {token=localStorage.getItem('launchlunch-token')||crypto.randomUUID();localStorage.setItem('launchlunch-token',token);}catch{token=crypto.randomUUID();}
const roomConnected=()=>!!myId&&socket?.readyState===WebSocket.OPEN;
const isHost=()=>!!state&&myId===state.hostId;
const running=()=>!!state?.race&&!state.race.completed&&!state.race.winner&&!state.race.draw;
const locationText=()=>state?.location||'방에서 검색 위치를 설정해 주세요';
function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000); }
function modal(id) {if(!$(id).open)$(id).showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function send(type,data={}) { if(socket?.readyState!==WebSocket.OPEN||!myId){toast('방에 연결한 뒤 다시 시도해 주세요.');return false;}socket.send(JSON.stringify({type,...data}));return true; }
let joining=false,newRoomLocation=false,autoLocationTicket=null;
function cancelAutoLocation(){autoLocationTicket=null;const note=$('auto-location-status');if(note)note.remove();}
function locateNewRoom(){
 if(!newRoomLocation||!state||!isHost())return;newRoomLocation=false;
 if(!navigator.geolocation||!isSecureContext)return;
 const ticket={room:roomId,version:state.locationVersion};autoLocationTicket=ticket;
 const note=document.createElement('p');note.id='auto-location-status';note.className='small-note';note.setAttribute('role','status');note.textContent='현재 위치를 확인하고 있어요. 기본 위치로 먼저 시작해도 돼요.';$('walk-label').after(note);
 const current=()=>autoLocationTicket===ticket&&roomId===ticket.room&&isHost()&&state.phase==='lobby'&&state.locationVersion===ticket.version;
 navigator.geolocation.getCurrentPosition(position=>{
  if(!current())return;autoLocationTicket=null;const lat=position.coords.latitude,lng=position.coords.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!lat||!lng){note.textContent='현재 위치를 확인하지 못해 기본 위치를 유지해요.';return;}
  if(send('settings',{location:'현재 위치',center:{lat,lng,address:'현재 위치',neighborhood:'',road:''},maxWalk:state.maxWalk})){note.textContent='현재 위치를 기준으로 주변 식당을 찾아요.';}else{note.textContent='기본 위치를 유지했어요. 위치 변경에서 설정할 수 있어요.';}
 },()=>{if(!current())return;autoLocationTicket=null;note.textContent='기본 위치를 유지했어요. 필요하면 위치 변경을 눌러 주세요.';},{enableHighAccuracy:false,timeout:8000,maximumAge:60000});
}
async function openWelcome(){
 if(joining)return;joining=true;$('create-room').disabled=true;
 try{
  if(!roomId){const response=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,gameMode:selectedMode})});const result=await response.json();if(!response.ok)throw new Error(result.error);roomId=result.id;newRoomLocation=true;history.replaceState(null,'',`?room=${roomId}`);}
  connect();
 }catch(error){toast(error.message||'방을 만들지 못했습니다. 다시 시도해 주세요.');}
 finally{joining=false;$('create-room').disabled=false;}
}
function requireRoom(action){if(!state){openWelcome();return;}action();}
function connect(){
  clearTimeout(retryTimer);$('connection').textContent='연결 중…';$('connection').classList.remove('online');
  socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/rooms/${roomId}/ws`);
  socket.onopen=()=>{retry=0;socket.send(JSON.stringify({type:'join',token}));};
  socket.onmessage=e=>{const message=JSON.parse(e.data);
    if(message.type==='cheer'){if(message.memberId!==myId)floatHeart();return;}
    if(message.type==='live'){if(message.raceId===state?.race?.id){liveSnapshot=message.live;}return;}
    if(message.type==='you'){myId=message.id;return;}
    if(message.type==='error'){
      if(message.requestId&&((message.requestType==='search'&&message.requestId!==pendingSearch?.id)||(message.requestType==='locate'&&message.requestId!==pendingLocation?.id)))return;
      if(pendingSearch&&(!message.requestType||message.requestType==='search')&&(!message.requestId||message.requestId===pendingSearch.id)){finishSearchError(message.message);return;}
      if(pendingLocation&&(!message.requestType||message.requestType==='locate')&&(!message.requestId||message.requestId===pendingLocation.id)){setLocationLoading(false);$('location-selection').textContent=message.message;return;}
      toast(message.message);return;
    }
    if(message.type==='state'){
      state=message.state;offset=message.now-Date.now();demoRace=null;if(state.race?.playMode==='direct'&&state.race.live){liveSnapshot=state.race.live;liveClock(state.race,performance.now(),message.now);}if(state.race?.id!==liveRaceId){liveRaceId=state.race?.id;liveSnapshot=state.race?.live||null;liveReadySent=null;liveSoundState=null;}
      if(autoLocationTicket&&(state.phase!=='lobby'||state.locationVersion!==autoLocationTicket.version))cancelAutoLocation();
      if(searchVersion!==state.locationVersion){searchItems=[];searchCacheKey='';renderSearch();}
      if(pendingSearch&&(pendingSearch.version!==state.locationVersion||state.phase!=='collecting')){pendingSearch=null;clearTimeout(searchTimeout);$('search').disabled=false;setSearchStatus('error','검색 기준이나 모집 상태가 바뀌었어요. 다시 검색해 주세요.');}

      $('connection').textContent='실시간 연결됨';$('connection').classList.add('online');
      if(message.cheer&&message.cheerMemberId!==myId)floatHeart();
      if(state.race?.id!==previousRaceId){previousRaceId=state.race?.id;lastBeep='';}
      render();locateNewRoom();return;
    }
    if(message.type==='search'){
      if(!pendingSearch||(message.requestId&&message.requestId!==pendingSearch.id)||message.locationVersion!==pendingSearch.version||(message.keyword||'')!==pendingSearch.keyword)return;
      clearTimeout(searchTimeout);$('search').disabled=false;
      if(message.locationVersion!==state.locationVersion){finishSearchError('기준 주소가 바뀌었어요. 다시 검색해 주세요.');return;}
      searchCacheKey=pendingSearch.key;pendingSearch=null;searchItems=message.items;searchVersion=message.locationVersion;foodTab='all';$('list-search').value='';setSearchStatus('idle');renderSearch();$('search-query').textContent=`중심: ${message.center.address} · 직선 반경 ${message.radiusMeters}m · ${message.keyword||'전체 음식 종류'} · ${message.items.length}곳 · ${message.source==='naver-map'?'네이버 지도 목록':'네이버 검색'}${message.partial?' · 일부 검색 지연':''}`;
    }
    if(message.type==='locations'){
      if(!pendingLocation||(message.requestId&&message.requestId!==pendingLocation.id)||message.query!==pendingLocation.query||message.query!==$('location-input').value.trim())return;
      setLocationLoading(false);
      if(message.addressSearch){selectedCenter=message.items[0]||null;$('location-selection').textContent=selectedCenter?`선택한 위치: ${selectedCenter.address}`:'주소의 지도 좌표를 확인하지 못했어요. 다른 주소를 검색해 주세요.';document.querySelector('#settings-form .full').disabled=!selectedCenter;return;}
      locationOptions=message.items;
      $('location-results').innerHTML=locationOptions.length?locationOptions.map((r,i)=>`<button type="button" class="location-option" data-location-index="${i}"><strong>${esc(r.name)}</strong><span>${esc(r.address)}</span></button>`).join(''):'<p class="small-note">위치를 찾지 못했어요. 도로명 주소 대신 건물명이나 장소명으로 찾아 주세요.</p>';
    }
  };
  socket.onclose=e=>{cancelAutoLocation();if(pendingSearch)finishSearchError('연결이 끊겼어요. 다시 연결된 뒤 재시도해 주세요.');if(pendingLocation){setLocationLoading(false);$('location-selection').textContent='연결이 끊겼어요. 주소 검색을 다시 시도해 주세요.';}myId=null;$('connection').textContent='연결 끊김';$('connection').classList.remove('online');
    $('start').disabled=true;$('ready').disabled=true;render();
    if(e.code===1000){toast(e.reason||'방이 종료되었습니다.');return;}
    if(retry++<5){retryTimer=setTimeout(connect,Math.min(15000,1000*2**retry));}
    else{toast('방이 만료되었거나 연결할 수 없어요. 홈에서 새 방을 만들어 주세요.');}
  };
  socket.onerror=()=>{};
}
function render(){
  renderModes();
  renderDraft();
  const loc=locationText();
  $('location-title').textContent=loc;
  $('location-address').textContent=state?.center?`${state.center.address} · 중심 위치 확인됨`:'설정에서 검색 위치를 선택해 주세요';
  $('walk-label').textContent=`🚶 도보 약 ${state?.maxWalk||10}분권 검색`;
  $('naver-search').href=state?.center?mapSearchUrl(state.center,$('keyword').value.trim()||'식당'):'https://map.naver.com/p/search/'+encodeURIComponent($('keyword').value.trim()||'식당');
  $('google-search').href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((state?.location||'')+' 식당')}`;
  const restaurants=state?.restaurants||[];const selected=restaurants.filter(r=>r.selected);
  $('selected-count').textContent=`${selected.length} / 12`;$('list-count').textContent=`등록된 식당 ${restaurants.length}곳`;
  const sorted=[...restaurants];
  $('restaurants').innerHTML=sorted.length?sorted.map(r=>{
    const idx=restaurants.indexOf(r),votes=state.members.filter(m=>m.vote===r.id).length,voted=state.members.some(m=>m.id===myId&&m.vote===r.id),editable=isHost()||r.addedBy===myId;
    return `<article class="restaurant-card ${r.selected?'selected':''}"><div class="card-top"><span class="food-icon">${EMOJI[idx%12]}</span><div class="card-info"><strong>${esc(r.name)}</strong><p>${esc(r.address||'참여자가 직접 추가한 식당')}</p></div><button class="select-food" data-action="select" data-id="${r.id}" aria-label="${esc(r.name)} 출전 ${r.selected?'해제':'선택'}" aria-pressed="${r.selected}" ${running()||drafting()||!roomConnected()?'disabled':''}>${r.selected?'✓':'+'}</button></div><div class="card-actions"><a href="${esc(mapLink(r))}" aria-label="${esc(r.name)} 지도 새 창에서 보기" target="_blank" rel="noopener noreferrer">지도 ↗</a><button data-action="vote" data-id="${r.id}" aria-label="${esc(r.name)} ${voted?'응원 취소':'응원하기'}" class="${voted?'voted':''}" aria-pressed="${voted}" ${!r.selected||running()||!roomConnected()?'disabled':''}>${voted?'♥':'♡'} 응원 ${votes}</button>${editable?`<button data-action="edit" data-id="${r.id}" aria-label="${esc(r.name)} 수정" ${running()||drafting()||!roomConnected()?'disabled':''}>수정</button><button data-action="remove" data-id="${r.id}" aria-label="${esc(r.name)} 삭제" ${running()||drafting()||!roomConnected()?'disabled':''}>삭제</button>`:''}</div></article>`;
  }).join(''):'<div class="empty-state"><span>🍽️</span><b>아직 출전할 식당이 없어요.</b><br>근처 식당을 검색하거나<br>우리만 아는 맛집을 직접 추가해 보세요.</div>';
  $('members').innerHTML=state?state.members.map((m,i)=>`<span class="member ${m.ready?'ready':''} ${!m.online?'offline':''}"><span class="avatar">${['😋','😎','🐱','🐻','🐸','🐥'][i%6]}</span>${esc(m.name)}${m.id===state.hostId?' ♛':''}${m.id===myId?' (나)':''} <span>${m.online?'':'오프라인'}</span></span>`).join(''):'<span class="muted">링크 하나로 모여요. 회원가입은 필요 없어요.</span>';
  $('member-count').textContent=state?`${state.members.filter(m=>m.online).length} / 24`:'0';
  $('ready').hidden=true;$('ready').disabled=running()||drafting()||!myId;
  const me=state?.members.find(m=>m.id===myId);$('ready').textContent=me?.ready?'✓ 준비 완료 · 취소':'준비 완료';
  $('start').textContent=state?.phase==='collecting'?'모집 마치고 진행방식 선택':isHost()?'후보 모집 시작':'방장이 모집을 시작해요';
  $('start').disabled=!!state&&(!isHost()||running()||drafting());
  $('settings').disabled=!!state&&(!isHost()||running()||drafting());
  $('add').disabled=$('add-bottom').disabled=running()||drafting()||!!state&&!roomConnected();
  syncSearchButtons();

  $('demo').hidden=!previewMode;
  const win=state?.race?.winner,draw=!!state?.race?.draw;
  $('result').hidden=!win&&!draw;
  $('winner-map').hidden=draw;
  $('result').querySelector('.trophy').textContent=draw?'↻':'🏆';
  $('result').querySelector('.eyebrow').textContent=draw?'무승부':'오늘의 점심';
  $('result').querySelector('p').textContent=draw?'같은 후보로 다시 겨뤄요.':'이제 먹으러 가요!';
  $('again').textContent=draw?'다시 겨루기':'한 판 더';
  if(draw)$('winner-name').textContent='이번 판은 승자가 없어요';
  else if(win){$('winner-name').textContent=win.name;$('winner-map').href=mapLink(win);}
  renderFlow();
}
function drafting(){return !!state?.draft&&!state.draft.done;}
function renderFlow(){
  if(state?.phase!=='playing'||state?.race?.playMode!=='direct'||previewMode){liveControls.setActive(false);document.body.classList.remove('direct-playing');}
  const phase=state?.phase||(state?.race?(state.race.winner||state.race.draw?'result':'playing'):'lobby');
  $('home-screen').hidden=!!state||previewMode;$('party-screen').hidden=!state||previewMode;$('preview-screen').hidden=!previewMode;
  $('invite').hidden=!state;
  $('arena').hidden=previewMode?!$('preview-player').open:(!$('game-player').open||!state||!['playing','result'].includes(phase));
  if(previewMode){$('demo').disabled=!previewGame||!!demoRace&&$('demo').disabled;$('demo').textContent='게임 시작';}
  $('lobby-panel').hidden=phase!=='lobby'&&phase!=='collecting';$('lobby-settings').hidden=phase!=='lobby';
  if(state&&phase!=='collecting')for(const id of ['search-dialog','restaurant-dialog'])if($(id).open)$(id).close();
  $('candidate-section').hidden=!state||phase!=='collecting';$('draft-panel').hidden=phase!=='draft';
  $('result').hidden=phase!=='result'||(!state?.race?.winner&&!state?.race?.draw);$('again').disabled=!!state&&!isHost();
  const titles={lobby:['파티를 모아 주세요','초대 링크를 보내고, 모이면 모집을 시작하세요.'],mode:['어떻게 플레이할까요?',isHost()?'진행방식을 고르면 밴픽을 시작해요.':'방장이 진행방식을 고르고 있어요.'],collecting:['오늘 먹고 싶은 곳은?','마감시간까지 후보를 모아요. 식당을 2곳 이상 골라 주세요.'],draft:['취향을 맞출 시간','싫은 곳은 밴, 먹고 싶은 곳은 픽. 끝나면 게임을 선택해요.'],choosing:['어떤 게임으로 정할까요?',isHost()?'게임을 고르면 바로 시작해요.':'방장이 게임을 고르고 있어요.'],playing:['게임 시작!',''],result:[state?.race?.draw?'무승부! 다시 겨뤄요':'오늘의 점심이 정해졌어요','']};
  [$('flow-title').textContent,$('flow-note').textContent]=titles[phase]||titles.lobby;
  const steps=['lobby','collecting','mode','draft','choosing','playing'];document.querySelectorAll('[data-step]').forEach(b=>{b.classList.toggle('current',b.dataset.step===(phase==='result'?'playing':phase));b.classList.toggle('complete',steps.indexOf(b.dataset.step)<steps.indexOf(phase));if(b.classList.contains('current'))b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  $('game-choice-panel').hidden=phase!=='choosing';
  const finalists=state?.restaurants.filter(r=>r.selected)||[];
  $('game-choice-panel').querySelector('h2').textContent='게임을 선택하세요';$('finalist-summary').textContent=`출전 식당 ${finalists.length}곳 보기`;
  $('final-candidates').innerHTML=finalists.map((r,i)=>{const n=(state.draft?.log||[]).filter(v=>v.action==='pick'&&v.id===r.id&&!v.skipped).length;return `<span class="finalist-card" style="--finalist-color:${'#'+COLORS[i%COLORS.length].toString(16).padStart(6,'0')}"><span class="finalist-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><span class="finalist-content"><strong>${esc(r.name)}</strong>${state?.playMode==='direct'?`<span class="finalist-badges"><small>${esc(state.members.find(m=>m.id===(state.draft?.log||[]).find(v=>v.action==='pick'&&v.id===r.id&&!v.skipped)?.memberId)?.name||'자동 플레이')}</small></span>`:n?`<span class="finalist-badges"><small>${n}명 픽</small><small class="finalist-speed">이동 +${Math.round((pickSpeed(n)-1)*100)}%</small></span>`:''}</span></span>`;}).join('');
  const selector=$('game-selector');selector.hidden=!previewMode&&(!state||phase!=='choosing');
  (previewMode?$('preview-game-slot'):$('choice-game-slot')).append(selector);
  $('lobby-note').textContent=phase==='collecting'?'시간이 끝나면 진행방식을 고르고 밴픽을 시작해요.':'마감시간을 정하고 후보 모집을 시작하세요.';
  if(phase==='collecting'&&!state.collectionDeadline)$('flow-note').textContent='모집 시간이 끝났어요. 후보를 2곳 이상 고른 뒤 진행해 주세요.';
  if(state){$('deadline-input').disabled=!isHost()||!roomConnected();document.querySelectorAll('[data-deadline-minutes]').forEach(button=>button.disabled=!isHost()||!roomConnected()||!['lobby','collecting'].includes(phase));const shownDeadline=state.collectionDeadline||state.scheduledDeadline;$('deadline-summary').textContent=shownDeadline?'마감 '+new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}).format(shownDeadline):'마감시간을 선택해 주세요';if(document.activeElement!==$('deadline-input'))$('deadline-input').value=localDateTime(state.collectionDeadline||state.scheduledDeadline||Date.now()+300000);}
  $('play-mode-panel').hidden=phase!=='mode';
  document.querySelectorAll('[data-play-mode]').forEach(button=>button.disabled=!isHost()||!roomConnected());
  $('change-play-mode').hidden=!isHost();$('change-play-mode').disabled=!roomConnected();
  $('play-mode-summary').textContent=state?.playMode==='direct'?'직접 조작 · 한 가게에 한 명':'자동 관전 · 픽 보너스 적용';
  renderMobileFlow(phase);
  syncGamePresentation(phase);
  const screen=previewMode?'preview':state?`${roomId}:${phase}`:'home';
  if(screen!==renderedScreen){renderedScreen=screen;const main=document.querySelector('.app-window>main');if(main)main.scrollTop=0;}
  updateTimer();
}
function renderMobileFlow(phase){
 const active=!!state&&!previewMode;document.body.dataset.roomPhase=active?phase:'';
 const names={lobby:'파티 모으기',collecting:'식당 후보 모으기',mode:'진행방식 선택',draft:'밴픽',choosing:'게임 선택',playing:'게임 중',result:state?.race?.draw?'무승부':'오늘의 점심'};
 const phases=['lobby','collecting','mode','draft','choosing','playing'];
 $('mobile-step').textContent=`${phase==='result'?6:phases.indexOf(phase)+1} / 6`;$('mobile-title').textContent=names[phase]||'';
 $('mobile-actions').hidden=!active||phase==='playing';
 for(const id of ['mobile-add','mobile-search','mobile-primary','mobile-skip'])$(id).hidden=true;
 let note='';
 if(phase==='lobby'){
  note=isHost()?'친구가 모이면 후보 모집을 시작하세요.':'방장이 모집을 시작하면 식당을 담을 수 있어요.';
  $('mobile-primary').hidden=!isHost();$('mobile-primary').textContent='후보 모집 시작';$('mobile-primary').disabled=$('start').disabled;
 }else if(phase==='collecting'){
  const count=state.restaurants.filter(r=>r.selected).length;
  note=`출전 후보 ${count}곳`+(count<2?' · 2곳 이상 담아 주세요':' · 마음에 드는 식당에 응원해요');
  $('mobile-add').hidden=$('mobile-search').hidden=false;$('mobile-add').disabled=$('add').disabled;$('mobile-search').disabled=$('search').disabled;
  $('mobile-primary').hidden=!isHost();$('mobile-primary').textContent='모집 마감';$('mobile-primary').disabled=$('start').disabled||count<2;
 }else if(phase==='draft'){
  const turn=state.draft?.turns[state.draft.cursor],mine=turn?.memberId===myId&&!state.draft?.done;
  note=mine?(turn.action==='ban'?'내 차례 · 밴할 식당을 눌러 주세요':'내 차례 · 먹고 싶은 식당을 픽하세요'):$('draft-turn').textContent;
  $('mobile-actions').classList.toggle('my-turn',!!mine);$('mobile-skip').hidden=!mine;$('mobile-skip').disabled=$('draft-skip').disabled;
 }else if(phase==='mode')note=isHost()?'진행방식을 선택하면 밴픽을 시작해요':'방장이 진행방식을 고르고 있어요';
 else if(phase==='choosing')note=isHost()?'게임 카드를 누르면 시작해요':'방장이 게임을 고르고 있어요';
 else if(phase==='result'){note=state?.race?.draw?'같은 후보로 다시 겨뤄요':'오늘의 점심이 정해졌어요';$('mobile-primary').hidden=!isHost();$('mobile-primary').textContent=$('again').textContent;$('mobile-primary').disabled=$('again').disabled;}
 if(phase!=='draft')$('mobile-actions').classList.remove('my-turn');
 $('mobile-action-note').textContent=active&&!roomConnected()?'연결이 끊겼어요. 연결 상태를 확인해 주세요.':note;
 $('mobile-time').disabled=phase!=='collecting';$('mobile-time').setAttribute('aria-label',phase==='collecting'?'모집 남은 시간 · 눌러서 마감시간 보기':'밴픽 남은 시간');
}
$('mobile-time').onclick=()=>{if(state?.phase!=='collecting')return;$('deadline-input').scrollIntoView({block:'center',behavior:'smooth'});if(isHost())$('deadline-input').focus({preventScroll:true});};
$('mobile-add').onclick=()=>{if(!$('add').disabled)$('add').click();};
$('mobile-search').onclick=()=>{if(!$('search').disabled)$('search').click();};
$('mobile-skip').onclick=()=>{if(!$('draft-skip').disabled)$('draft-skip').click();};
$('mobile-primary').onclick=()=>{const target=state?.phase==='result'?$('again'):$('start');if(!target.disabled)target.click();};
function updateKeyboard(){const viewport=window.visualViewport;document.body.classList.toggle('keyboard-open',!!viewport&&innerHeight-viewport.height>150);document.documentElement.style.setProperty('--available-height',`${Math.round(viewport?.height||innerHeight)}px`);}
window.visualViewport?.addEventListener('resize',updateKeyboard);window.addEventListener('resize',updateKeyboard);
updateKeyboard();
// A browser back gesture dismisses the open sheet before leaving the room.
let unwindingDialogHistory=false;
const openDialogs=()=>[...document.querySelectorAll('dialog[open]')];
const dialogHistoryDepth=()=>Number(history.state?.lunchDialogDepth)||0;
function syncDialogHistory(){
 if(unwindingDialogHistory)return;
 const count=openDialogs().length,depth=dialogHistoryDepth();
 if(count>depth){for(let next=depth+1;next<=count;next++)history.pushState({...history.state,lunchDialogDepth:next},'',location.href);}
 else if(count<depth){unwindingDialogHistory=true;history.go(count-depth);}
}
new MutationObserver(syncDialogHistory).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
addEventListener('popstate',()=>{
 if(unwindingDialogHistory){unwindingDialogHistory=false;syncDialogHistory();return;}
 const open=openDialogs(),depth=dialogHistoryDepth();
 while(open.length>depth)open.pop().close();
 syncDialogHistory();
});
function localDateTime(timestamp){const d=new Date(timestamp),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function updateTimer(){const deadline=state?.phase==='collecting'?state.collectionDeadline:state?.phase==='draft'?state.draft?.deadline:null;$('phase-timer').hidden=!deadline;$('mobile-time').hidden=!deadline;if(deadline){const seconds=Math.max(0,Math.ceil((deadline-Date.now()-offset)/1000));$('phase-timer').textContent=seconds>=60?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:seconds;$('mobile-time').textContent=$('phase-timer').textContent;}}
document.querySelectorAll('[data-deadline-minutes]').forEach(button=>button.onclick=()=>{if(button.disabled)return;const deadline=Math.ceil((Date.now()+offset+Number(button.dataset.deadlineMinutes)*60000)/60000)*60000;send('deadline',{deadline});});
$('deadline-input').onchange=()=>{const deadline=new Date($('deadline-input').value).getTime();if(Number.isFinite(deadline))send('deadline',{deadline});};
setInterval(updateTimer,200);
$('create-room').onclick=openWelcome;$('join-room').onclick=()=>modal('join-dialog');
$('join-form').onsubmit=e=>{e.preventDefault();try{const input=$('join-link').value.trim(),id=/^[a-f0-9]{20}$/i.test(input)?input.toLowerCase():new URL(input,location.origin).searchParams.get('room')?.toLowerCase();if(!/^[a-f0-9]{20}$/.test(id))throw new Error();location.href='?room='+id;}catch{toast('초대코드 또는 링크를 확인해 주세요.');}};
$('preview-open').onclick=()=>{previewMode=true;previewGame=null;demoRace=null;$('demo').disabled=true;render();renderModes();};
$('preview-close').onclick=()=>{previewMode=false;demoRace=null;render();};
$('again').onclick=()=>send(state?.race?.draw?'rematch':'reset');
function renderDraft(){
  const draft=state?.draft,active=!!draft&&!draft.done,turn=active?draft.turns[draft.cursor]:null;
  $('draft-panel').dataset.action=turn?.action||'';$('draft-panel').dataset.myTurn=String(!!turn&&turn.memberId===myId&&roomConnected());
  $('draft-start').hidden=true;
  $('draft-start').disabled=!!state&&(!isHost()||running());
  $('draft-start').textContent=draft?.done?'밴픽 다시 하기':'밴픽 시작';
  $('draft-description').textContent=state?.playMode==='direct'?'조작할 가게를 픽하세요. 한 가게는 한 명만 선택할 수 있어요. 건너뛰면 관전하며 이동속도 보너스는 없어요.':'같은 식당을 여러 명이 픽할 수 있어요. 픽 1표당 이동속도 +2%, 최대 +10%. 밴한 식당만 제외합니다.';
  $('draft-content').hidden=!draft;
  if(!draft)return;
  const turnName=state.members.find(m=>m.id===turn?.memberId)?.name||'';
  $('draft-turn').textContent=active?`${turnName} 님 차례 · ${turn.action==='ban'?'제외할 식당 선택':'가장 먹고 싶은 식당 선택'}`:`밴픽 완료 · ${state.restaurants.filter(r=>r.selected).length}곳 출전`;
  $('draft-progress').textContent=`${draft.cursor} / ${draft.turns.length} 선택 완료`;
  $('draft-skip').hidden=!active;$('draft-cancel').hidden=!active||!isHost();
  $('draft-skip').disabled=!roomConnected()||!isHost()&&turn?.memberId!==myId;
  $('draft-skip').textContent=turn?.action==='pick'?'이번 픽 건너뛰기':'이번 밴 건너뛰기';
  $('draft-candidates').innerHTML=draft.pool.map(id=>{const r=state.restaurants.find(r=>r.id===id);if(!r)return '';const banned=draft.banned.includes(id),picked=draft.picked.includes(id),pickCount=draft.log.filter(v=>v.action==='pick'&&v.id===id&&!v.skipped).length;return `<button class="draft-card ${banned?'banned':picked?'picked':''}" data-draft-id="${id}" ${!active||!roomConnected()||turn.memberId!==myId||banned||(state.playMode==='direct'&&picked)?'disabled':''}><span>${banned?'BAN':picked?'PICK':'후보'}</span><strong>${esc(r.name)}</strong><small>${banned?'출전 제외':picked?(state.playMode==='direct'?'조작자 선택 완료':pickCount+'명 픽'):'선택 가능'}</small></button>`;}).join('');
}
document.querySelectorAll('[data-play-mode]').forEach(button=>button.onclick=()=>send('play-mode',{value:button.dataset.playMode}));
$('change-play-mode').onclick=()=>{if(confirm('진행방식을 바꾸면 밴픽을 다시 진행해요. 변경할까요?'))send('play-mode-reset');};
$('draft-start').onclick=()=>requireRoom(()=>send('draft-start'));
$('draft-skip').onclick=()=>send('draft-skip');
$('draft-cancel').onclick=()=>send('draft-cancel');
$('draft-candidates').onclick=e=>{const b=e.target.closest('[data-draft-id]');if(b)send('draft-choice',{id:b.dataset.draftId});};
function mapLink(r){
  if(/^\d+$/.test(String(r.placeId||'')))return `https://map.naver.com/p/entry/place/${r.placeId}`;
  const link=safeLink(r.mapUrl);if(link){const u=new URL(link);if(u.hostname==='map.naver.com'&&u.pathname.startsWith('/p/search/'))return `https://map.naver.com/p/search/${encodeURIComponent(r.name)}`;return link;}
  return `https://map.naver.com/p/search/${encodeURIComponent(r.name)}`;
}
$('keyword').oninput=()=>{$('naver-search').href=state?.center?mapSearchUrl(state.center,$('keyword').value.trim()||'식당'):'https://map.naver.com/p/search/'+encodeURIComponent($('keyword').value.trim()||'식당');};
$('restaurants').onclick=e=>{const button=e.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;if(action==='edit'){openRestaurant(state.restaurants.find(r=>r.id===id));return;}send(action,{id});};
function openRestaurant(restaurant=null,fromSearch=false){
  requireRoom(()=>{addingFromSearch=fromSearch;editing=fromSearch?null:restaurant?.id;formVersion=fromSearch?searchVersion:state.locationVersion;
    $('restaurant-form').reset();for(const key of ['name','address','mapUrl'])$('restaurant-form').elements[key].value=restaurant?.[key]??'';
    $('restaurant-dialog-title').textContent=editing?'식당 정보 수정하기.':'맛있는 후보, 직접 추가.';
    $('manual-note').textContent='식당 이름만 입력하면 바로 후보가 됩니다. 주소와 지도 링크는 선택이에요.';
    modal('restaurant-dialog');
  });
}
$('add').onclick=$('add-bottom').onclick=()=>openRestaurant();
$('restaurant-form').onsubmit=e=>{e.preventDefault();const restaurant=Object.fromEntries(new FormData(e.target));if(send(editing?'edit':'add',{id:editing,restaurant,fromSearch:addingFromSearch,locationVersion:formVersion}))$('restaurant-dialog').close();};
$('settings').onclick=()=>requireRoom(()=>{cancelAutoLocation();setLocationLoading(false);$('location-input').value=state.location;$('walk-input').value=state.maxWalk;selectedCenter=state.center||null;locationOptions=[];$('location-results').innerHTML='';$('location-selection').textContent=selectedCenter?`선택한 위치: ${selectedCenter.address}`:'주소 검색으로 출발 위치를 선택해 주세요.';document.querySelector('#settings-form .full').disabled=!selectedCenter;modal('settings-dialog');});
$('location-input').oninput=()=>{selectedCenter=null;locationOptions=[];$('location-results').innerHTML='';$('location-selection').textContent='주소가 바뀌었어요. 위치 찾기로 중심 지점을 확인해 주세요.';};
$('locate').onclick=async()=>{
 $('locate').disabled=true;$('address-picker').innerHTML='<p class="address-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span>주소 검색창을 불러오는 중…</p>';modal('address-dialog');
 try{await pickAddress($('address-picker'),address=>{
  $('address-dialog').close();const query=address.roadAddress||address.jibunAddress;$('location-input').value=query;selectedCenter=null;document.querySelector('#settings-form .full').disabled=true;$('location-results').innerHTML='';$('location-selection').textContent='선택한 주소의 지도 위치를 확인하고 있어요…';
  const id=crypto.randomUUID();if(send('locate',{query,address,requestId:id})){pendingLocation={id,query};setLocationLoading(true);locationTimer=setTimeout(()=>{if(pendingLocation)$('location-selection').textContent='지도에서 좌표를 확인하는 중이에요. 잠시만 기다려 주세요…';},12000);}else{$('location-selection').textContent='연결 후 주소 검색을 다시 시도해 주세요.';}
 });}catch(e){$('address-dialog').close();toast(e.message);}finally{if(!pendingLocation)$('locate').disabled=false;}
};
$('location-results').onclick=e=>{const button=e.target.closest('[data-location-index]');if(!button)return;selectedCenter=locationOptions[Number(button.dataset.locationIndex)];$('location-selection').textContent=`선택한 위치: ${selectedCenter.name} · ${selectedCenter.address}`;$('location-results').innerHTML='';};
$('settings-form').onsubmit=e=>{e.preventDefault();if(!selectedCenter){toast('주소 검색으로 위치를 선택해 주세요.');return;}if(send('settings',{location:$('location-input').value,center:selectedCenter,maxWalk:Number($('walk-input').value)}))$('settings-dialog').close();};
$('ready').onclick=()=>send('ready');
$('start').onclick=()=>state?send('start'):openWelcome();
function floatHeart(){const layer=$('cheer-effects');if(!layer||$('arena').hidden)return;const heart=document.createElement('span');heart.className='live-heart';heart.textContent='♥';heart.setAttribute('aria-hidden','true');heart.style.setProperty('--heart-right',`${18+Math.random()*35}px`);heart.style.setProperty('--heart-color',['#ff5480','#ff749e','#ffb43f','#ee69c5'][Math.floor(Math.random()*4)]);heart.style.setProperty('--heart-size',`${24+Math.random()*14}px`);heart.style.setProperty('--heart-drift',`${(Math.random()-.5)*90}px`);heart.style.setProperty('--heart-tilt',`${(Math.random()-.5)*40}deg`);layer.append(heart);while(layer.children.length>24)layer.firstElementChild.remove();heart.addEventListener('animationend',()=>heart.remove(),{once:true});setTimeout(()=>heart.remove(),2000);}
let lastHeartAt=0;
$('cheer').onclick=()=>{if($('cheer').hidden||performance.now()-lastHeartAt<180)return;lastHeartAt=performance.now();if(previewMode||!state){floatHeart();return;}if(send('cheer'))floatHeart();};
function setLocationLoading(loading){clearTimeout(locationTimer);$('locate').disabled=loading;$('locate').textContent=loading?'지도 위치 확인 중…':'주소 검색';$('location-selection').classList.toggle('loading-location',loading);$('location-selection').setAttribute('aria-busy',String(loading));if(!loading)pendingLocation=null;}
function syncSearchButtons(){
 const busy=!!pendingSearch,disabled=busy||!roomConnected()||state?.phase!=='collecting';
 for(const id of ['search','mobile-search']){$(id).disabled=disabled;$(id).setAttribute('aria-busy',String(busy));$(id).textContent=busy?'찾는 중…':id==='search'?'주변 검색':'주변 찾기';}
 $('search-retry').disabled=busy||!roomConnected();
}
function setSearchStatus(kind,text=''){
 syncSearchButtons();
 $('search-status').hidden=kind==='idle';$('search-status').dataset.state=kind;$('search-status-text').textContent=text;$('search-retry').hidden=kind!=='error';$('search-skeleton').hidden=kind!=='loading'||searchItems.length>0;$('search-dialog').classList.toggle('search-empty-loading',kind==='loading'&&!searchItems.length);$('search-results').setAttribute('aria-busy',String(kind==='loading'));
}
function finishSearchError(message){pendingSearch=null;clearTimeout(searchTimeout);$('search').disabled=false;setSearchStatus('error',message||'식당을 불러오지 못했어요. 다시 시도해 주세요.');}
function beginSearch(){requireRoom(()=>{
 modal('search-dialog');
 if(pendingSearch){setSearchStatus('loading',searchItems.length?'최근 검색 결과를 보며 기다려 주세요. 목록을 갱신하고 있어요…':'주변 식당을 불러오는 중…');return;}
 const keyword=$('keyword').value.trim(),version=state.locationVersion,key=roomId+':'+version+':'+keyword,id=crypto.randomUUID();
 if(searchCacheKey!==key){searchItems=[];searchCacheKey='';foodTab='all';$('list-search').value='';$('search-query').textContent='';renderSearch();}
 pendingSearch={id,keyword,version,key};setSearchStatus('loading',searchItems.length?'최근 검색 결과를 보며 기다려 주세요. 목록을 갱신하고 있어요…':'주변 식당을 불러오는 중…');$('search').disabled=true;
 if(!send('search',{keyword,requestId:id})){finishSearchError('방에 연결한 뒤 다시 시도해 주세요.');return;}
 clearTimeout(searchTimeout);searchTimeout=setTimeout(()=>{if(pendingSearch)setSearchStatus('loading','지도에서 식당을 확인하고 있어요. 창을 닫아도 검색은 계속돼요.');},12000);
 });}
$('search').onclick=beginSearch;$('search-retry').onclick=beginSearch;
$('search-dialog').addEventListener('close',()=>{if(pendingSearch)$('search').disabled=false;});
$('keyword').onkeydown=e=>{if(e.key==='Enter')$('search').click();};
function renderSearch(){
 const filtered=filterFoods(searchItems,foodTab,$('list-search').value);
 $('food-tabs').innerHTML=FOOD_TABS.map(([id,label])=>{const count=id==='all'?searchItems.length:searchItems.filter(r=>foodClass(r)===id).length;return `<button type="button" data-food-tab="${id}" aria-pressed="${foodTab===id}">${label}<span>${count}</span></button>`;}).join('');
 $('filtered-count').textContent=`전체 ${searchItems.length}곳 중 ${filtered.length}곳`;
 $('search-results').innerHTML=filtered.length?filtered.map(({restaurant:r,index:i})=>{
  const added=state?.restaurants.some(a=>a.placeId&&a.placeId===r.placeId||a.name===r.name&&a.address===r.address);
  return `<article class="search-result"><h3>${esc(r.name)}</h3><p>${esc(r.category)} · 출발지에서 직선 ${r.distanceMeters}m<br>${esc(r.address)}</p><a class="button small" href="${esc(mapLink(r))}" aria-label="${esc(r.name)} 지도 새 창에서 보기" target="_blank" rel="noopener noreferrer">지도에서 보기 ↗</a><a class="button small" href="https://www.google.com/maps/dir/?api=1&origin=${state.center.lat},${state.center.lng}&destination=${r.lat},${r.lng}&travelmode=walking" target="_blank" rel="noopener noreferrer">도보 경로 ↗</a><button class="button primary small" data-search-index="${i}" ${added?'disabled':''}>${added?'추가됨 ✓':'후보 추가 ＋'}</button></article>`;
 }).join(''):'<div class="filter-empty"><strong>조건에 맞는 식당이 없어요</strong><p>다른 분류를 선택하거나 검색어를 지워 보세요.</p></div>';
}
$('list-search').oninput=()=>renderSearch();
$('food-tabs').onclick=e=>{const button=e.target.closest('[data-food-tab]');if(!button)return;foodTab=button.dataset.foodTab;renderSearch();$('food-tabs').querySelector(`[data-food-tab="${foodTab}"]`).focus();$('search-dialog').querySelector('.search-dialog-body').scrollTop=0;};
$('search-results').onclick=e=>{const b=e.target.closest('[data-search-index]');if(!b)return;const restaurant=searchItems[Number(b.dataset.searchIndex)];if(send('add',{restaurant,fromSearch:true,locationVersion:searchVersion})){b.disabled=true;b.textContent='추가됨 ✓';}};
$('invite').onclick=()=>requireRoom(openShareDialog);
function openShareDialog(){$('share-code').value=state?.id||'';$('share-url').value=location.href;modal('share-dialog');}
$('share-code').onclick=()=> $('share-code').select();
$('copy-code').onclick=async()=>{const b=$('copy-code');b.disabled=true;try{await navigator.clipboard.writeText($('share-code').value);b.textContent='복사 완료 ✓';toast('초대코드를 복사했어요.');setTimeout(()=>{b.textContent='초대코드 복사';},2000);}catch{$('share-code').select();toast('선택된 초대코드를 복사해 주세요.');}finally{b.disabled=false;}};
let copyFeedbackTimer;
$('copy-link').onclick=async()=>{const button=$('copy-link');if(button.disabled)return;clearTimeout(copyFeedbackTimer);button.disabled=true;button.textContent='복사 중…';button.setAttribute('aria-busy','true');try{await navigator.clipboard.writeText($('share-url').value);button.textContent='복사 완료 ✓';toast('초대 링크를 복사했어요.');copyFeedbackTimer=setTimeout(()=>{button.textContent='초대 링크 복사';},2000);}catch{button.textContent='다시 복사';$('share-url').select();toast('선택된 주소를 복사해 주세요.');}finally{button.disabled=false;button.setAttribute('aria-busy','false');}};
try{sound=localStorage.getItem('lunchlaunch-sound')!=='off';}catch{}
function updateSoundButton(){const enabled=sound&&audio?.state==='running';$('sound').textContent=!sound?'♪ 소리 끔':enabled?'♪ 소리 켜짐':'♪ 소리 켜기';$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'게임 소리 끄기':'게임 소리 켜기');}
async function unlockAudio(){if(!sound)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audio??=new Audio();audio.onstatechange=updateSoundButton;if(audio.state!=='running')await audio.resume();}catch{}updateSoundButton();}
// Resume in a real user gesture, before asynchronous room or renderer loading.
addEventListener('pointerdown',e=>{if(sound&&!e.target.closest('#sound'))void unlockAudio();},{capture:true});
addEventListener('keydown',e=>{if(sound&&!e.target.closest('#sound'))void unlockAudio();},{capture:true});
$('sound').onclick=async()=>{sound=!(sound&&audio?.state==='running');try{localStorage.setItem('lunchlaunch-sound',sound?'on':'off');}catch{}if(sound){await unlockAudio();beep(660);}else if(audio?.state==='running')await audio.suspend();updateSoundButton();};
function beep(frequency,duration=.16,delay=0){if(!sound||audio?.state!=='running'||document.hidden)return;const osc=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+delay;osc.type='triangle';osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+duration);osc.connect(gain);gain.connect(audio.destination);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration+.02);}
function chime(notes){notes.forEach((note,i)=>beep(note,.2,i*.13));}
updateSoundButton();
let soundRace=null,soundStarted=false,soundAlive=null,soundScore=0;
const arenaHome=$('arena-home');
let presentedRace=null,gameScrollLock=null;
function focusGame(){if(!$('arena').hidden)$('arena').focus({preventScroll:true});}
function lockGamePage(){
 const open=$('game-player').open||$('preview-player').open;document.body.classList.toggle('game-presenting',open);
 if(open&&!gameScrollLock){const style=document.body.style;gameScrollLock={y:scrollY,position:style.position,top:style.top,width:style.width,overflow:style.overflow};style.position='fixed';style.top=-gameScrollLock.y+'px';style.width='100%';style.overflow='hidden';}
 else if(!open&&gameScrollLock){const saved=gameScrollLock;gameScrollLock=null;for(const key of ['position','top','width','overflow'])document.body.style[key]=saved[key];scrollTo(0,saved.y);}
}
function openGamePlayer(){if(previewMode||!state?.race||!['playing','result'].includes(state.phase))return;const player=$('game-player');$('game-player-slot').append($('arena'));$('arena').hidden=false;$('game-player-title').textContent=(GAME_META[state.race.mode]?.title||'이전 경기');$('game-player-open').hidden=true;if(!player.open)player.showModal();lockGamePage();focusGame();}
function syncGamePresentation(phase){
 if(!previewMode&&phase==='playing'&&state.race?.id!==presentedRace){presentedRace=state.race.id;openGamePlayer();}
 else if(!previewMode&&!['playing','result'].includes(phase)){presentedRace=null;if($('game-player').open)$('game-player').close();}
 if(!previewMode&&phase==='playing'&&!$('game-player').open)$('arena').hidden=true;
 $('game-player-finish').hidden=phase!=='result';$('game-player-open').hidden=previewMode||phase!=='playing'||$('game-player').open;
 $('game-player-close').textContent=phase==='result'?'결과 보기':'접기 ×';
 lockGamePage();
}
$('game-player-open').onclick=openGamePlayer;
$('game-player-close').onclick=$('game-player-result').onclick=()=>$('game-player').close();
$('game-player').addEventListener('close',()=>{liveControls.setActive(false);discardRenderers();activeRendererKind=null;arenaHome.after($('arena'));lockGamePage();render();$('arena').hidden=true;document.body.classList.remove('direct-playing');const main=document.querySelector('.app-window>main');if(main)main.scrollTop=0;$('game-player-open').hidden=state?.phase!=='playing';const target=state?.phase==='playing'?$('game-player-open'):isHost()?$('again'):$('result');target.tabIndex=target.tabIndex<0?-1:target.tabIndex;target.focus({preventScroll:true});});
$('arena').addEventListener('pointerdown',event=>{if(!event.target.closest('button,a,input,select,textarea'))focusGame();});
$('arena').addEventListener('keydown',event=>{if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();});
new MutationObserver(lockGamePage).observe($('preview-player'),{attributes:true,attributeFilter:['open']});
function startPreview(){
 liveControls.setActive(false);liveInput={x:0,z:0,jump:false,jumpHeld:false};
 if(!previewGame)return;
 $('preview-confirm').close();$('preview-arena-slot').append($('arena'));
 $('preview-player-title').textContent=GAME_META[previewGame].title;
 $('preview-finish').hidden=true;
 if(!$('preview-player').open)$('preview-player').showModal();
 const seed=crypto.getRandomValues(new Uint32Array(1))[0];
 demoRace={id:crypto.randomUUID(),mode:previewGame,seed,startAt:null,preparing:true,entries:['국밥','돈까스','초밥','파스타','비빔밥','햄버거'].map((name,i)=>({id:String(i),name,...(previewPlayMode==='direct'&&i===0?{controllerId:PREVIEW_PLAYER}: {})})),winner:null,playMode:previewPlayMode};
 if(previewPlayMode==='direct')demoRace.session=createPreviewSession(seed,previewGame,demoRace.entries);
 liveReadySent=null;liveHudAt=0;liveSoundState=null;lastHud='';
 lastBeep='';$('demo').disabled=true;$('game-loading').hidden=false;render();focusGame();
}
function leavePreviewGame(){if($('preview-player').open)$('preview-player').close();}
document.querySelectorAll('[data-preview-play]').forEach(button=>button.onclick=()=>{previewPlayMode=button.dataset.previewPlay;document.querySelectorAll('[data-preview-play]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('preview-play-note').textContent=previewPlayMode==='direct'?'국밥 캐릭터를 직접 조작해 AI 5명과 겨뤄요.':'메뉴 캐릭터 6명의 경기를 함께 지켜봐요.';});
$('demo').onclick=startPreview;
$('preview-restart').onclick=startPreview;
$('preview-other').onclick=leavePreviewGame;
$('preview-exit').onclick=leavePreviewGame;
$('preview-player').addEventListener('close',()=>{liveControls.setActive(false);document.body.classList.remove('direct-playing');demoRace=null;discardRenderers();activeRendererKind=null;arenaHome.after($('arena'));$('preview-finish').hidden=true;render();document.querySelector(`[data-mode="${previewGame}"]`)?.focus({preventScroll:true});});

let liveSnapshot=null,liveRaceId=null,liveHudAt=0,liveReadySent=null,liveInput={x:0,z:0,jump:false,jumpHeld:false},liveInputSeq=0,liveSoundState=null;
const interpolateLive=createLiveView(),localPrediction=createLocalPrediction(),liveClock=createLiveClock();
const liveTime=(race,now=performance.now())=>race.session?race.session.time:liveClock(race,now,Date.now()+offset);
function smoothLiveSnapshot(snapshot,race,now){const memberId=race.session?PREVIEW_PLAYER:myId;const smooth=interpolateLive(snapshot,race.id,race.session?race.session.time:now),predicted=localPrediction.render(snapshot,race.id,memberId,liveTime(race,now));return {...smooth,...(!snapshot.players.some(p=>p.controllerId===memberId&&p.alive)?{time:smooth.presentationTime}:{}),...(smooth.jars?{jars:smooth.jars.map((jar,i)=>snapshot.players[i]?.controllerId===memberId?predicted.jars?.[i]||jar:jar)}:{}),players:smooth.players.map((p,i)=>p.controllerId===memberId?predicted.players[i]:p)};}
const liveControls=createLiveControls({onInput:input=>{liveInput={...input};sendLiveInput();}});
function sendLiveInput(){if(previewMode&&demoRace?.session&&$('preview-player').open){const intent={...liveInput},seq=demoRace.session.input(intent);localPrediction.input(demoRace.id,demoRace.session.time,intent,seq);liveInput.jump=false;liveInput.action=false;return;}if(!$('game-player').open||liveSnapshot?.finished||state?.phase!=='playing'||state?.race?.playMode!=='direct'||!roomConnected()||!state.race.entries.some(e=>e.controllerId===myId))return;const intent={...liveInput},seq=++liveInputSeq;localPrediction.input(state.race.id,liveTime(state.race),intent,seq);socket.send(JSON.stringify({type:'input',raceId:state.race.id,...intent,seq}));liveInput.jump=false;liveInput.action=false;}
setInterval(()=>{if(!document.hidden)sendLiveInput();},100);
function drawDirect(now,race){
 const practice=!!race.session,memberId=practice?PREVIEW_PLAYER:myId;
 const kind=rendererKindFor(race.mode),sceneId={race:'circuit-scene',island:'island-scene',survival:'survival-scene',sprint:'sprint-scene',cookie:'cookie-scene',shake:'shake-scene'}[kind];
 if(activeRendererKind!==kind){discardRenderers(kind);activeRendererKind=kind;liveHudAt=0;}
 for(const id of ['track','circuit-scene','island-scene','survival-scene','sprint-scene','cookie-scene','shake-scene'])if($(id).hidden!==(id!==sceneId))$(id).hidden=id!==sceneId;
 loadRenderer(kind);const liveRenderer=rendererInstance(kind),liveRenderError=rendererFailed(kind);
 if(practice&&liveRenderer){race.preparing=false;race.live=race.session.advance(now);}
 const snapshot=practice?(race.live||race.session.snapshot):liveSnapshot||race.live,entries=race.entries,finished=!!(race.completed||snapshot?.finished),elapsed=liveTime(race,now),counting=!finished&&elapsed<0;
 const mine=entries.find(e=>e.controllerId===memberId),player=snapshot?.players.find(p=>p.id===mine?.id),canControl=!!mine&&player?.alive!==false&&!finished&&(practice||roomConnected())&&!!liveRenderer&&(practice?$('preview-player').open:$('game-player').open)&&!document.querySelector(practice?'dialog[open]:not(#preview-player)':'dialog[open]:not(#game-player)');
 liveControls.setMode(race.mode);liveControls.setActive(canControl);$('cheer').hidden=!!mine&&player?.alive!==false&&!finished;document.body.classList.toggle('direct-playing',canControl);
 if(liveRenderer&&snapshot){const rendered=renderRenderer(kind,{raceId:race.id,entries,mode:race.mode,seed:race.seed,liveSnapshot:smoothLiveSnapshot(snapshot,race,now),elapsed:race.preparing?-1:elapsed,localMemberId:memberId,reduced:reduced.matches});if(rendered&&liveReadySent!==race.id){liveReadySent=race.id;if(mine){$('arena').tabIndex=-1;$('arena').focus({preventScroll:true});}if(!practice)send('live-ready',{raceId:race.id});}}
 if(now<liveHudAt)return;liveHudAt=now+100;
 $('arena').querySelector('.arena-bottom span').textContent=practice?'싱글플레이 · AI와 연습':'관전 중 · 실시간 경기';
 $('game-loading').hidden=!!liveRenderer&&!!snapshot||liveRenderError;$('game-loading').setAttribute('aria-busy',String(!$('game-loading').hidden));$('game-loading').lastElementChild.textContent=rendererRecovery.has(kind)?'3D 화면을 다시 연결하고 있어요.':'조작할 게임 화면을 준비하고 있어요.';
 $('webgl-error').hidden=!liveRenderError;
 $('countdown').hidden=!counting||!liveRenderer;
 if(counting){const n=Math.max(1,Math.ceil(-elapsed/1000));$('countdown').textContent=n>3?'준비 중':n;if(n<=3&&lastBeep!==String(n)){lastBeep=String(n);beep(380+n*70);}}
 const alive=snapshot?.players.filter(p=>p.alive).length??entries.length;
 $('arena-title').textContent=(GAME_META[race.mode]?.title||'이전 경기');$('game-eyebrow').textContent=practice?'SINGLE PLAY':'DIRECT PLAY';$('mode-description').textContent='직접 조작';$('arena-subtitle').textContent=(GAME_META[race.mode]?.description||'진행 중인 경기');
 $('race-status').textContent=finished?'경기 종료':counting?'함께 준비 중':'직접 조작 경기';$('scene-badge').textContent=mine?`내 가게 · ${mine.name}`:'관전 중';$('stage-chip').textContent=finished?'FINISHED':counting?'READY':mine?'PLAYER':'SPECTATOR';$('race-clock').textContent=`${Math.max(0,(snapshot?.time||0)/1000).toFixed(1)}s`;
 $('signal-lights').className='signal-lights '+(counting?'counting':'go');$('final-tag').hidden=true;
 const book=race.mode==='race'&&!counting&&!finished?snapshot?.book:null;$('book-timer').hidden=!book;
 if(book){const remaining=Math.max(0,book.deadline-420-snapshot.time),total=Math.max(1,book.deadline-420-(book.reveal||0));$('book-timer-label').textContent=book.reopenAt?'책장 펼치는 중':remaining===0?'책이 닫혀요!':`이동 시간 ${(remaining/1000).toFixed(1)}초`;$('book-timer-fill').style.transform=`scaleX(${Math.min(1,remaining/total)})`;$('book-timer').classList.toggle('urgent',remaining<1000);}

 const hudKey=[race.id,finished,alive,...(snapshot?.players||[]).map(p=>`${p.id}:${p.alive}:${p.score}:${Math.floor(p.progress||0)}`)].join('|');
 if(lastHud!==hudKey){lastHud=hudKey;$('leaderboard').innerHTML=entries.map((e,i)=>{const p=snapshot?.players.find(p=>p.id===e.id);return `<span class="${p?.alive===false?'eliminated':''}" style="--entrant-color:#${COLORS[i%COLORS.length].toString(16).padStart(6,'0')}"><i></i>${esc(e.name)}${e.controllerId===memberId?' · 나':''}<small>${race.mode==='shake'?`${p?.score||0} / ${SHAKE_PIECES}`:race.mode==='cookie'?`${p?.score||0}점`:p?.alive===false?'탈락':esc(e.playerName||'자동')}</small></span>`;}).join('');}
 $('race-commentary').textContent=finished?'경기 종료':!mine?'픽을 건너뛰어 관전 중이에요':player?.alive===false?'탈락했어요 · 남은 경기를 함께 지켜봐요':race.mode==='shake'?(matchMedia('(pointer:coarse)').matches?'좌우 드래그로 기울이기 · 탭으로 흔들기':'← → 기울이기 · Space 흔들기'):race.mode==='tricycle'?(matchMedia('(pointer:coarse)').matches?'위로 드래그해 가속 · 대각선으로 방향 조절 · 떼면 감속':'↑ 누르고 가속 · ← → 방향 조절 · 떼면 감속'):matchMedia('(pointer:coarse)').matches?(canJump(race.mode)?'드래그 이동 · 탭 점프 · 길게 누르면 연속 점프':'화면 드래그로 이동'):(canJump(race.mode)?'방향키 / WASD 이동 · 스페이스 점프':'방향키 / WASD로 이동');
 if(snapshot&&!counting&&!finished){const score=snapshot.players.reduce((n,p)=>n+(p.score||0),0);if(!liveSoundState)chime([523,659,784]);else if(alive<liveSoundState.alive)chime([220,147]);else if(score>liveSoundState.score)beep(1047,.12);liveSoundState={alive,score};}
 $('race-cinematic').hidden=!finished;
 if(practice&&finished){$('demo').disabled=false;$('preview-finish').hidden=false;}
 if(finished){const win=race.winner||entries[snapshot?.winner],draw=race.draw||snapshot?.draw;$('cinematic-tag').textContent=draw?'DRAW · 무승부':'WINNER · 오늘의 점심';$('cinematic-title').textContent=draw?'이번 판은 승자가 없어요':win?.name||'결과 확인 중';$('cinematic-subtitle').textContent=draw?(snapshot?.reason==='updated'?'게임이 업데이트됐어요. 같은 후보로 다시 시작해 주세요':snapshot?.reason==='time-limit'?'시간 안에 승부가 나지 않았어요':'같은 후보로 다시 겨뤄요'):'실제 플레이로 정한 오늘의 점심';if(lastBeep!=='finish'){lastBeep='finish';chime(draw?[392,330,262]:[523,659,784,1047]);}}
}

const canvas=$('track'),ctx=canvas.getContext('2d');let width=0,height=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
new ResizeObserver(()=>{const box=document.querySelector('.track-wrap').getBoundingClientRect();width=box.width;height=box.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}).observe(document.querySelector('.track-wrap'));
const preview=['국밥','초밥','파스타','돈까스','비빔밥','햄버거'].map((name,i)=>({name,id:String(i)}));
const colors=['#ffb999','#d8c5ff','#bdf0e6','#fbe8a2','#cce292','#b9d7fa','#ffcde0','#e5d1b5','#9dd9cc','#ffdfa9','#d1d5f7','#ffd7bd'];
let cachedRace=null,cachedPlan=null,island=null,islandLoading=false,islandFailed=false,circuit=null,circuitLoading=false,circuitFailed=false,lastHud='',lastPulse=-1;
let shake=null,shakeFailed=false;
let cookie=null,cookieLoading=false,cookieFailed=false;
let sprint=null,sprintLoading=false,sprintFailed=false;
let survival=null,survivalLoading=false,survivalFailed=false;
const rendererRecovery=new Map(),rendererRecoveryAttempts=new Map(),rendererHealthySince=new Map();
const rendererImports={race:()=>import('./book3d.js'),island:()=>import('./island3d.js'),survival:()=>import('./survival3d.js'),sprint:()=>import('./sprint3d.js'),cookie:()=>import('./cookie3d.js'),shake:()=>import('./shake3d.js')},rendererModules=new Map(),rendererTasks=new Map();
let rendererEpoch=0;
const rendererKindFor=game=>game==='shake'?'shake':game==='cookie'?'cookie':SPRINT_MODES.includes(game)?'sprint':['fire','boulder','crush'].includes(game)?'survival':game==='island'?'island':'race';
function preloadRenderer(game){const kind=rendererKindFor(game);if(!rendererModules.has(kind))rendererModules.set(kind,rendererImports[kind]().catch(error=>{rendererModules.delete(kind);throw error;}));return rendererModules.get(kind);}
function rendererInstance(kind){return {race:circuit,island,survival,sprint,cookie,shake}[kind];}
function rendererFailed(kind){return {race:circuitFailed,island:islandFailed,survival:survivalFailed,sprint:sprintFailed,cookie:cookieFailed,shake:shakeFailed}[kind];}
function setRendererFailed(kind,value){if(kind==='race')circuitFailed=value;else if(kind==='island')islandFailed=value;else if(kind==='survival')survivalFailed=value;else if(kind==='sprint')sprintFailed=value;else if(kind==='shake')shakeFailed=value;else cookieFailed=value;}
function loadRenderer(kind){
 if(rendererRecovery.has(kind)||rendererInstance(kind)||rendererFailed(kind))return Promise.resolve(rendererInstance(kind));if(rendererTasks.has(kind))return rendererTasks.get(kind);
 const epoch=rendererEpoch,game={race:'race',island:'island',survival:'fire',sprint:'climb',cookie:'cookie',shake:'shake'}[kind];
 const task=(async()=>{try{const module=await preloadRenderer(game);if(epoch!==rendererEpoch||activeRendererKind!==kind)return;const factory={race:'createBookRenderer',island:'createIslandRenderer',survival:'createSurvivalRenderer',sprint:'createSprintRenderer',cookie:'createCookieRenderer',shake:'createShakeRenderer'}[kind],scene={race:'circuit',island:'island',survival:'survival',sprint:'sprint',cookie:'cookie',shake:'shake'}[kind];const next=await module[factory]($(scene+'-scene'));if(epoch!==rendererEpoch||activeRendererKind!==kind){next.dispose();return;}if(kind==='race')circuit=next;else if(kind==='island')island=next;else if(kind==='survival')survival=next;else if(kind==='sprint')sprint=next;else if(kind==='shake')shake=next;else cookie=next;return next;}catch{if(epoch===rendererEpoch)setRendererFailed(kind,true);}finally{rendererTasks.delete(kind);}})();rendererTasks.set(kind,task);return task;
}
const loadCookie=()=>loadRenderer('cookie'),loadSprint=()=>loadRenderer('sprint'),loadSurvival=()=>loadRenderer('survival'),loadCircuit=()=>loadRenderer('race'),loadIsland=()=>loadRenderer('island');
function mode(){return previewMode?demoRace?.mode||previewGame:state?.race?.mode||state?.gameMode||selectedMode;}
function renderModes(){document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===(previewMode?previewGame:state?.gameMode||null)));b.disabled=!!state&&(!isHost()||running()||!!state.draft&&!state.draft.done);});}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{preloadRenderer(b.dataset.mode).catch(()=>{});if(state&&!previewMode)send('launch',{mode:b.dataset.mode});else{if(previewMode)previewGame=b.dataset.mode;else selectedMode=b.dataset.mode;demoRace=null;$('demo').disabled=false;render();if(previewMode){$('preview-confirm-title').textContent=GAME_META[previewGame].title;$('preview-confirm-note').textContent=GAME_META[previewGame].description;modal('preview-confirm');}}});
function setRendererInstance(kind,value){if(kind==='race')circuit=value;else if(kind==='island')island=value;else if(kind==='survival')survival=value;else if(kind==='sprint')sprint=value;else if(kind==='shake')shake=value;else cookie=value;}
function recoverRenderer(kind){
 if(kind!==activeRendererKind||rendererRecovery.has(kind))return;
 rendererHealthySince.delete(kind);const previous=rendererInstance(kind);setRendererInstance(kind,null);try{previous?.dispose();}catch{}
 const scene=$({race:'circuit',island:'island',survival:'survival',sprint:'sprint',cookie:'cookie',shake:'shake'}[kind]+'-scene');delete scene.dataset.failed;
 const attempts=rendererRecoveryAttempts.get(kind)||0;
 if(attempts>=2){setRendererFailed(kind,true);return;}
 rendererRecoveryAttempts.set(kind,attempts+1);setRendererFailed(kind,false);
 rendererRecovery.set(kind,setTimeout(()=>{rendererRecovery.delete(kind);if(activeRendererKind===kind)loadRenderer(kind);},250));
}
function renderRenderer(kind,options){const instance=rendererInstance(kind);if(!instance)return false;try{instance.render(options);const since=rendererHealthySince.get(kind);if(since===undefined)rendererHealthySince.set(kind,performance.now());else if(performance.now()-since>10000)rendererRecoveryAttempts.delete(kind);return true;}catch{recoverRenderer(kind);return false;}}
for(const [kind,scene] of Object.entries({race:'circuit',island:'island',survival:'survival',sprint:'sprint',cookie:'cookie',shake:'shake'}))$(scene+'-scene').addEventListener('webglcontextlost',event=>{event.preventDefault();if(rendererInstance(kind))recoverRenderer(kind);},true);
$('retry-3d').onclick=()=>{const kind=rendererKindFor(mode()),timer=rendererRecovery.get(kind);if(timer)clearTimeout(timer);rendererRecovery.delete(kind);rendererRecoveryAttempts.delete(kind);rendererHealthySince.delete(kind);const previous=rendererInstance(kind);setRendererInstance(kind,null);try{previous?.dispose();}catch{}setRendererFailed(kind,false);$('webgl-error').hidden=true;loadRenderer(kind);};
function drawCircuit(){ctx.clearRect(0,0,width,height);ctx.fillStyle='#ddf1fb';ctx.fillRect(0,0,width,height);ctx.fillStyle='#6582a8';ctx.font='600 17px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText(circuitFailed?'3D 화면 복구가 필요해요. 다시 연결을 눌러 주세요.':'게임 화면 불러오는 중…',width/2,height/2);}
let activeRendererKind=null;
function discardRenderers(keep=''){rendererEpoch++;for(const kind of ['race','island','survival','sprint','cookie','shake'])if(kind!==keep){clearTimeout(rendererRecovery.get(kind));rendererRecovery.delete(kind);rendererRecoveryAttempts.delete(kind);rendererHealthySince.delete(kind);const previous=rendererInstance(kind);setRendererInstance(kind,null);try{previous?.dispose();}catch{}}}
addEventListener('pagehide',()=>discardRenderers());
function draw(now){
  requestAnimationFrame(draw);if(!width||document.hidden||$('arena').hidden)return;
  const race=previewMode?demoRace:state?.race,selected=state?.restaurants.filter(r=>r.selected);
  if(race?.playMode==='direct'){drawDirect(now,race);return;}
  $('arena').querySelector('.arena-bottom span').textContent='자동 진행 · 모든 참여자에게 같은 결과';$('cheer').hidden=false;liveControls.setActive(false);
  const entries=race?.entries||(selected?.length?selected:preview),is3d=mode()==='island',isCookie=mode()==='cookie',isShake=mode()==='shake',isSprint=SPRINT_MODES.includes(mode()),isSurvival=['fire','boulder','crush'].includes(mode()),meta=GAME_META[mode()]||GAME_META.race;
  const rendererKind=isShake?'shake':isCookie?'cookie':isSprint?'sprint':isSurvival?'survival':is3d?'island':'race';if(activeRendererKind!==rendererKind){discardRenderers(rendererKind);activeRendererKind=rendererKind;}
  if(race?.id!==cachedRace){cachedRace=race?.id;cachedPlan=race?gamePlan(race.seed,race.mode,entries):null;lastHud='';lastPulse=-1;}
  let elapsed=race&&!race.preparing?Date.now()+(!previewMode&&state?offset:0)-race.startAt:-1;const count=entries.length;
  canvas.hidden=isShake||isCookie||isSprint||isSurvival||is3d||!!circuit;$('circuit-scene').hidden=isShake||isCookie||isSprint||isSurvival||is3d||!circuit;$('island-scene').hidden=!is3d;$('survival-scene').hidden=!isSurvival;$('sprint-scene').hidden=!isSprint;$('cookie-scene').hidden=!isCookie;$('shake-scene').hidden=!isShake;$('webgl-error').hidden=!(isShake?shakeFailed:isCookie?cookieFailed:isSprint?sprintFailed:isSurvival?survivalFailed:is3d?islandFailed:circuitFailed);
  if(isShake){loadRenderer('shake');renderRenderer('shake',{entries,seed:race?.seed||1,elapsed,reduced:reduced.matches});}else if(isCookie){loadCookie();renderRenderer('cookie',{entries,seed:race?.seed||1,elapsed,reduced:reduced.matches});}else if(isSprint){loadSprint();renderRenderer('sprint',{entries,seed:race?.seed||1,elapsed,mode:mode(),reduced:reduced.matches});}else if(isSurvival){loadSurvival();renderRenderer('survival',{entries,seed:race?.seed||1,elapsed,mode:mode(),reduced:reduced.matches});}else if(is3d){loadIsland();renderRenderer('island',{entries,seed:race?.seed||1,elapsed,reduced:reduced.matches});}else{loadCircuit();if(circuit)renderRenderer('race',{entries,seed:race?.seed||1,elapsed,reduced:reduced.matches});else drawCircuit(entries,elapsed,cachedPlan,now);}
  const readyRenderer=rendererInstance(rendererKind),failedRenderer=rendererFailed(rendererKind);
  if(previewMode&&race?.preparing&&readyRenderer){race.preparing=false;race.startAt=Date.now()+3100;elapsed=-3100;lastHud='';}
  $('game-loading').lastElementChild.textContent=previewMode?'준비가 끝나면 카운트다운이 시작돼요.':'참여자들과 같은 경기 화면을 불러와요.';$('game-loading').hidden=!!readyRenderer||failedRenderer;$('game-loading').setAttribute('aria-busy',String(!readyRenderer&&!failedRenderer));
  const winner=cachedPlan?.winner,drawn=!!cachedPlan&&winner==null,falls=cachedPlan?.falls||null,finish=cachedPlan?.finish??Infinity;
  const finished=!!race&&elapsed>=finish+1200,counting=!!race&&!race.preparing&&elapsed<0,final=!!race&&elapsed>=0&&!finished&&(isShake?Math.max(...entries.map((_,i)=>shakePose(cachedPlan,i,elapsed).score))>=SHAKE_PIECES-2:isCookie?elapsed>23000:isSprint?Math.max(...entries.map((_,i)=>sprintPose(cachedPlan,i,elapsed).distance))>cachedPlan.distance*.8:falls?.filter(t=>t>elapsed).length<=3);
  const board=isShake&&cachedPlan?entries.map((e,i)=>({i,...shakePose(cachedPlan,i,elapsed)})).sort((a,b)=>b.score-a.score):isCookie&&cachedPlan?entries.map((e,i)=>({i,...cookiePose(cachedPlan,i,elapsed)})).sort((a,b)=>b.score-a.score):isSprint&&cachedPlan?entries.map((e,i)=>({i,...sprintPose(cachedPlan,i,elapsed)})).sort((a,b)=>b.distance-a.distance||cachedPlan.finishTimes[a.i]-cachedPlan.finishTimes[b.i]):entries.map((e,i)=>({i}));
  const alive=falls?falls.filter(t=>t>elapsed).length:count;
  if(soundRace!==race?.id){soundRace=race?.id;soundStarted=false;soundAlive=count;soundScore=0;}
  if(race&&!race.preparing&&elapsed>=0&&!finished){
    if(!soundStarted){soundStarted=true;chime([523,659,784]);}
    if(soundAlive!==null&&alive<soundAlive)chime([220,147]);
    soundAlive=alive;
    if(isCookie||isShake){const score=board.reduce((sum,p)=>sum+(p.score||0),0);if(score>soundScore)beep(1047,.12);soundScore=score;}
  }
  $('countdown').hidden=!counting;
  if(counting){const n=Math.ceil(-elapsed/1000);$('countdown').textContent=n;if(lastBeep!==String(n)){lastBeep=String(n);beep(380+n*70);}}
  if(final){const pulse=Math.floor(elapsed/700);if(pulse!==lastPulse){lastPulse=pulse;beep(110);}}
  const overtime=isSprint&&cachedPlan&&cachedPlan.checkpoints.filter(c=>c.time<=elapsed).length>1;
  const frameKey=[!!readyRenderer,failedRenderer,overtime,race?.id,mode(),is3d,counting?Math.ceil(-elapsed/1000):'',finished,final,alive,board.map(x=>x.i+':'+(x.score??'')).join(),islandLoading].join(':');
  if(frameKey!==lastHud){lastHud=frameKey;
    $('race-status').textContent=!readyRenderer&&!failedRenderer?'게임 준비 중':counting?'출발 준비':finished?'경기 종료':race?'경기 중':'대기 중';
    $('arena-title').textContent=meta.title;
    $('game-eyebrow').textContent=meta.eyebrow;
    $('mode-description').textContent=meta.description;
    $('arena-subtitle').textContent=meta.subtitle;
    $('scene-badge').textContent=isShake?`${count}팀 · 먼저 ${SHAKE_PIECES}개 비우기`:isCookie?`${count}팀 · 쿠키 최대 ${cookieSupply(count).cap}개`:isSprint?`${count}팀 레이스`:race?`${alive} / ${count} 생존`:`${count}곳 출전`;
    $('stage-chip').textContent=!readyRenderer&&!failedRenderer?'LOADING':counting?'READY':finished?'FINISHED':final?'FINAL ROUND':race?'PLAYING':islandLoading&&is3d?'3D 불러오는 중…':'체험하거나 식당 후보를 골라 주세요';
    $('signal-lights').className='signal-lights '+(counting?'counting':race?'go':'');
    $('leaderboard').innerHTML=isShake?board.map(p=>`<span style="--entrant-color:#${COLORS[p.i].toString(16).padStart(6,'0')}"><i></i>${esc(entries[p.i].name)}<small>${p.score??0} / ${SHAKE_PIECES}</small></span>`).join(''):isCookie?board.map(p=>`<span style="--entrant-color:#${COLORS[p.i].toString(16).padStart(6,'0')}"><i></i>${esc(entries[p.i].name)}<small>${p.score??0}점</small></span>`).join(''):isSprint?board.map((p,rank)=>`<span style="--entrant-color:#${COLORS[p.i].toString(16).padStart(6,'0')}"><i></i>${esc(entries[p.i].name)}<small>${race?`${rank+1}위`:''}</small></span>`).join(''):entries.map((e,i)=>{const out=falls&&falls[i]<=elapsed;return `<span style="--entrant-color:#${COLORS[i].toString(16).padStart(6,'0')}" class="${out?'eliminated':''}"><i></i>${esc(e.name)}${out?'<small>탈락</small>':''}</span>`;}).join('');
    $('race-commentary').textContent=finished?(drawn?'무승부 · 다시 겨뤄요':`${entries[winner].name} 우승${demoRace?' · 체험 경기':''}`):counting?'준비!':race?(isShake?`빵을 모두 꺼내세요 · 선두 ${board[0].score} / ${SHAKE_PIECES}`:isCookie?`${cookiePhase(cachedPlan,elapsed).label} · ${Math.ceil(cookiePhase(cachedPlan,elapsed).remaining/1000)}초`:isSprint?`${overtime?'동시 도착! 연장 레이스 · ':''}선두 ${entries[board[0].i].name}`:`생존 ${alive}곳 / ${count}곳`):'자동 진행 · 식당 후보를 선택하고 시작하세요';
    $('final-tag').hidden=!final;$('final-tag').textContent=isShake?'마지막 빵까지!':isCookie?'쿠키 쟁탈전 막판!':isSprint?'결승선이 눈앞!':`${alive}곳 생존`;
  }
  const bookTimer=mode()==='race'&&race&&!counting&&!finished?bookCountdown(cachedPlan,elapsed):null;
  $('book-timer').hidden=!bookTimer;
  if(bookTimer){$('book-timer-label').textContent=bookTimer.opening?'책장 펼치는 중':bookTimer.closing?'책이 닫혀요!':`이동 시간 ${(bookTimer.remaining/1000).toFixed(1)}초`;$('book-timer-fill').style.transform=`scaleX(${bookTimer.remaining/bookTimer.total})`;$('book-timer').classList.toggle('urgent',bookTimer.remaining<1000);}
  $('race-clock').textContent=is3d&&race?`회전 ×${(1+Math.max(0,Math.min(elapsed,finish))/1000*.06/.55).toFixed(1)}`:race?`${(Math.min(finish/1000,Math.max(0,elapsed)/1000)).toFixed(2)}s`:'00.00s';
  $('race-cinematic').hidden=!finished;
  if(finished){$('cinematic-tag').textContent=drawn?'DRAW · 무승부':'WINNER · 오늘의 점심';$('cinematic-title').textContent=drawn?'이번 판은 승자가 없어요':entries[winner].name;$('cinematic-subtitle').textContent=drawn?(alive===0?'모두 탈락했어요. 다시 겨뤄요!':'승부가 나지 않았어요. 다시 겨뤄요!'):demoRace?'체험 경기 · 실제 식당 정보가 아닙니다':'오늘 점심이 결정됐어요';if(lastBeep!=='finish'){lastBeep='finish';chime(drawn?[392,330,262]:[523,659,784,1047]);if(demoRace){$('demo').disabled=false;$('preview-finish').hidden=false;}}}
}
render();requestAnimationFrame(draw);
if(roomId){if(!/^[a-f0-9]{20}$/.test(roomId)){toast('초대 링크가 올바르지 않습니다.');roomId=null;history.replaceState(null,'','/');}else connect();}
