import {canJump} from '../public/game-rules.js';
import { DEFAULT_LOCATION, cleanRestaurant } from '../public/race.js';
import { DEFAULT_CENTER, coordinate, resolveLocations, resolveAddress, nearbyRestaurants } from './places.js';
import {gamePlan,GAME_META} from '../public/game.js';
import {searchPlaces,locateAddress} from './catalog.js';
import {createLiveGame,stepLiveGame,liveSnapshot,LIVE_STEP} from '../public/live-game.js';
import {randomNickname} from './names.js';
const DAY = 86400000;
const raceCompleted=race=>!!(race?.completed||race?.winner||race?.draw);
export class LunchRoom {
  constructor(ctx,env) {
    this.ctx=ctx; this.env=env; this.data=null;
    ctx.blockConcurrencyWhile(async()=>{ this.data=await ctx.storage.get('room') || null;await this.migrateLive();this.resumeLive(); });
  }
  async migrateLive(){const r=this.data?.race;if(!r||r.playMode!=='direct'||raceCompleted(r)||r.simulation?.core)return;r.completed=true;r.draw=true;r.winner=null;r.reason='updated';r.live={...(r.live||{}),finished:true,winner:null,draw:true,reason:'updated'};delete r.simulation;this.data.phase='result';await this.save();await this.schedule();}
  async save() { if(this.liveCheckpoint)await this.liveCheckpoint;await this.ctx.storage.put('room',this.data); }
  checkpointLive(){if(this.liveCheckpoint)return false;const snapshot=structuredClone(this.data);const pending=this.ctx.storage.put('room',snapshot,{allowUnconfirmed:true}).catch(()=>{this.lastLiveCheckpoint=0;}).finally(()=>{if(this.liveCheckpoint===pending)this.liveCheckpoint=null;});this.liveCheckpoint=pending;this.ctx.waitUntil?.(pending);return true;}
  members() {
    const connected = new Set(this.ctx.getWebSockets().map(s=>s.deserializeAttachment()?.memberId).filter(Boolean));
    return this.data.members.map(m=>({id:m.id,name:m.name,ready:m.ready,vote:m.vote,online:connected.has(m.id)}));
  }
  snapshot() { const {tokens,...rest}=this.data;return {...rest,race:rest.race?{...rest.race,simulation:undefined,live:rest.race.simulation?liveSnapshot(rest.race.simulation):rest.race.live}:null,members:this.members()}; }
  send(ws,value) { try { ws.send(JSON.stringify(value)); } catch {} }
  broadcast(extra={}) { const msg={type:'state',state:this.snapshot(),now:Date.now(),...extra}; for(const ws of this.ctx.getWebSockets()) if(ws.deserializeAttachment()?.memberId) this.send(ws,msg); }
  async fetch(request) {
    if (new URL(request.url).pathname === '/create' && !this.data) {
      const b=await request.json(); const memberId=crypto.randomUUID();
      this.data={id:b.id,hostId:memberId,location:DEFAULT_LOCATION,center:structuredClone(DEFAULT_CENTER),radiusMeters:800,maxWalk:10,locationVersion:1,phase:'lobby',playMode:'auto',collectionDeadline:null,scheduledDeadline:Math.ceil((Date.now()+300000)/60000)*60000,
        members:[{id:memberId,name:randomNickname(),ready:false,vote:null}],
        tokens:{[b.token]:memberId},restaurants:[],gameMode:null,race:null,history:[],expiresAt:Date.now()+DAY,lastSearch:0};
      await this.save(); await this.ctx.storage.setAlarm(this.data.expiresAt);
      return Response.json({id:b.id});
    }
    if(!this.data || Date.now()>this.data.expiresAt) return new Response('방이 만료되었습니다. 새 방을 만들어 주세요.',{status:410});
    if(this.ctx.getWebSockets().length>=48) return new Response('방의 접속 인원이 가득 찼습니다.',{status:429});
    const pair=new WebSocketPair(); const [client,server]=Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({memberId:null,lastMessage:0,createdAt:Date.now()});
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message) {
    let b;
    try {
      if(typeof message!=='string'||message.length>8192) throw new Error('요청이 너무 큽니다.');
      if(!this.data || Date.now()>this.data.expiresAt) { ws.close(1008,'방이 만료되었습니다.'); return; }
      const a=ws.deserializeAttachment(); b=JSON.parse(message);
      if(!a.windowStart||Date.now()-a.windowStart>=1000){a.windowStart=Date.now();a.messageCount=0;a.inputCount=0;}
      const countKey=b.type==='input'?'inputCount':'messageCount';a[countKey]=(a[countKey]||0)+1;ws.serializeAttachment(a);
      if(a[countKey]>(b.type==='input'?60:15)) throw new Error('잠시 후 다시 시도해 주세요.');
      if(b.type==='join') {
        if(!/^[a-f0-9-]{36}$/.test(b.token || '')) throw new Error('참여자 정보가 올바르지 않습니다.');
        let id=this.data.tokens[b.token];
        if(!id) {
          if(this.data.members.length>=24) throw new Error('한 방에는 최대 24명까지 참여할 수 있어요.');
          id=crypto.randomUUID(); this.data.tokens[b.token]=id;
          this.data.members.push({id,name:randomNickname(this.data.members),ready:false,vote:null});
        }
        a.memberId=id; ws.serializeAttachment(a); await this.save();
        this.send(ws,{type:'you',id}); this.broadcast(); return;
      }
      const member=this.data.members.find(m=>m.id===a.memberId);
      if(!member) throw new Error('먼저 방에 참여해 주세요.');
      const host=member.id===this.data.hostId;
      const active=this.data.race && !raceCompleted(this.data.race);
      if(b.type==='ping') { this.send(ws,{type:'pong',now:Date.now(),echo:b.echo}); return; }
      if(b.type==='cheer') { const race=this.data.race;if(race?.playMode==='direct'&&!raceCompleted(race)&&race.simulation?.players.some(p=>p.controllerId===member.id&&p.alive))return;if(Date.now()-(a.lastCheer||0)<200)return; a.lastCheer=Date.now();ws.serializeAttachment(a);const packet=JSON.stringify({type:'cheer',memberId:member.id,name:member.name});for(const peer of this.ctx.getWebSockets())if(peer.deserializeAttachment()?.memberId){try{peer.send(packet);}catch{}} return; }
      if(b.type==='live-ready'){
        const r=this.data.race;if(!r||r.id!==b.raceId||r.playMode!=='direct'||raceCompleted(r))return;
        if(!r.entries.some(e=>e.controllerId===member.id))return;r.readyControllers||=[];if(!r.readyControllers.includes(member.id))r.readyControllers.push(member.id);
        if(r.preparing&&r.entries.every(e=>!e.controllerId||r.readyControllers.includes(e.controllerId))){r.preparing=false;r.startAt=Date.now()+3100;await this.save();this.broadcast();await this.schedule();}return;
      }
      if(b.type==='input'){
        const race=this.data.race;if(!race||race.playMode!=='direct'||raceCompleted(race)||b.raceId!==race.id)throw new Error('진행 중인 직접 조작 경기에서만 움직일 수 있어요.');
        if(!race.entries.some(e=>e.controllerId===member.id))throw new Error('픽하지 않은 참여자는 관전 중이에요.');
        if(!Number.isFinite(b.x)||!Number.isFinite(b.z)||Math.abs(b.x)>1||Math.abs(b.z)>1||!Number.isSafeInteger(b.seq)||b.seq<0)throw new Error('조작 입력을 확인해 주세요.');
        this.liveInputs ||= {};if(a.inputRaceId===race.id&&b.seq<=(a.inputSeq??-1))return;
        a.inputRaceId=race.id;a.inputSeq=b.seq;ws.serializeAttachment(a);
        this.liveInputs[member.id]={x:b.x,z:b.z,jump:canJump(race.mode)&&(b.jump===true||this.liveInputs[member.id]?.jump===true),jumpHeld:canJump(race.mode)&&b.jumpHeld===true,action:race.mode==='shake'&&(b.action===true||this.liveInputs[member.id]?.action===true),seq:b.seq,at:Math.max(0,Date.now()-race.startAt)};return;
      }
      if(active) throw new Error('경기가 끝난 뒤 변경할 수 있어요.');
      if(this.data.draft&&!this.data.draft.done&&!['draft-choice','draft-skip','draft-cancel'].includes(b.type))throw new Error('밴픽을 완료하거나 방장이 취소한 뒤 변경해 주세요.');
      if(b.type==='play-mode'){
        if(!host)throw new Error('방장만 플레이 방식을 선택할 수 있어요.');
        if(this.data.phase!=='mode'||!['auto','direct'].includes(b.value))throw new Error('플레이 방식 선택 단계에서 골라 주세요.');
        this.data.playMode=b.value;this.startDraft();
      } else if(b.type==='play-mode-reset'){
        if(!host)throw new Error('방장만 플레이 방식을 변경할 수 있어요.');
        if(this.data.phase!=='choosing')throw new Error('게임 선택 단계에서 변경해 주세요.');
        this.data.restaurants.forEach(r=>r.selected=this.data.draft.pool.includes(r.id));this.data.draft=null;this.finishCollection();
      } else if(b.type==='deadline'){
        if(!host)throw new Error('방장만 마감시간을 변경할 수 있어요.');
        if(!['lobby','collecting'].includes(this.data.phase))throw new Error('모집 중에만 변경할 수 있어요.');
        const deadline=Number(b.deadline);if(!Number.isFinite(deadline)||deadline<Date.now()+30000||deadline>this.data.expiresAt-30000)throw new Error('마감시간은 지금부터 30초 이후, 방 만료 전으로 정해 주세요.');
        this.data.scheduledDeadline=deadline;if(this.data.phase==='collecting')this.data.collectionDeadline=deadline;
      } else if(b.type==='rematch'){
        if(!host)throw new Error('방장만 재경기를 시작할 수 있어요.');
        if(this.data.phase!=='result'||!this.data.race?.draw||!raceCompleted(this.data.race))throw new Error('무승부 경기가 끝난 뒤 다시 시작할 수 있어요.');
        this.data.gameMode=this.data.race.mode;this.startRace(structuredClone(this.data.race.entries));
      } else if(b.type==='reset'){if(!host)throw new Error('방장만 새 라운드를 시작할 수 있어요.');this.data.phase='lobby';this.data.gameMode=null;this.data.race=null;this.data.draft=null;this.data.collectionDeadline=null;this.data.scheduledDeadline=Math.ceil((Date.now()+300000)/60000)*60000;
      } else if(b.type==='draft-start') {
        if(!host)throw new Error('방장만 다음 단계로 진행할 수 있어요.');
        if(this.data.phase!=='collecting')throw new Error('후보 모집을 먼저 시작해 주세요.');
        this.finishCollection();
      } else if(b.type==='draft-choice'||b.type==='draft-skip') {
        const draft=this.data.draft;
        if(!draft||draft.done)throw new Error('진행 중인 밴픽이 없어요.');
        const turn=draft.turns[draft.cursor];
        if(b.type==='draft-skip'?!host&&turn.memberId!==member.id:turn.memberId!==member.id)throw new Error('현재 순서인 참여자만 선택할 수 있어요.');
        const available=draft.pool.filter(id=>!draft.banned.includes(id));
        let id=b.id;
        if(b.type==='draft-skip')id=null;
        if(id&&!available.includes(id)||b.type==='draft-choice'&&!id)throw new Error('남아 있는 식당을 선택해 주세요.');
        if(id&&this.data.playMode==='direct'&&turn.action==='pick'&&draft.picked.includes(id))throw new Error('직접 조작에서는 한 식당을 한 명만 픽할 수 있어요.');
        if(id){const list=turn.action==='ban'?draft.banned:draft.picked;if(!list.includes(id))list.push(id);}
        draft.log.push({...turn,id,skipped:b.type==='draft-skip'});draft.cursor++;
        this.advanceDraft();
      } else if(b.type==='draft-cancel') {
        if(!host)throw new Error('방장만 밴픽을 취소할 수 있어요.');
        this.data.draft=null;this.data.phase='collecting';this.data.collectionDeadline=Math.ceil((Date.now()+300000)/60000)*60000;this.data.scheduledDeadline=this.data.collectionDeadline;this.invalidateReady();
      } else if(b.type==='launch') {
        if(!host)throw new Error('방장만 게임을 선택할 수 있어요.');
        if(this.data.phase!=='choosing')throw new Error('후보 모집과 밴픽을 먼저 마쳐 주세요.');
        if(!Object.hasOwn(GAME_META,b.mode))throw new Error('게임 종류를 확인해 주세요.');
        this.data.gameMode=b.mode;this.startRace();
      } else if(b.type==='settings') {
        if(!host) throw new Error('방장만 기준 주소를 변경할 수 있어요.');
        const location=String(b.location||'').trim(); const maxWalk=Number(b.maxWalk);
        if(location.length<2||location.length>160||!Number.isInteger(maxWalk)||maxWalk<1||maxWalk>30) throw new Error('주소와 도보 시간(1~30분)을 확인해 주세요.');
        const radiusMeters=maxWalk*80;
        if(!Number.isInteger(radiusMeters)||radiusMeters<100||radiusMeters>3000)throw new Error('검색 반경은 100~3000m 사이로 설정해 주세요.');
        let center=this.data.center;
        if(b.center){
          const point=coordinate(b.center.lng,b.center.lat);if(!point)throw new Error('위치 좌표를 확인해 주세요.');
          center={...point,address:String(b.center.address||location).slice(0,160),neighborhood:String(b.center.neighborhood||'').slice(0,100),road:String(b.center.road||'').slice(0,100)};
        }else if(location!==this.data.location){center=null;}
        if(location!==this.data.location||center?.lat!==this.data.center?.lat||center?.lng!==this.data.center?.lng) {
          this.data.locationVersion++;
          this.data.restaurants=this.data.restaurants.map(r=>({...r,walkMinutes:null}));
        }
        this.data.location=location; this.data.center=center;this.data.radiusMeters=radiusMeters;this.data.maxWalk=maxWalk;

      } else if(b.type==='add'||b.type==='edit') {
        if(this.data.phase&&this.data.phase!=='collecting')throw new Error('후보 모집 중에 추가해 주세요.');
        const value=cleanRestaurant(b.restaurant||{});
        if(b.fromSearch&&b.locationVersion!==this.data.locationVersion) throw new Error('검색 기준 위치가 변경됐어요. 식당을 다시 검색해 주세요.');
        if(b.type==='edit') {
          const r=this.data.restaurants.find(r=>r.id===b.id);
          if(!r||(!host&&r.addedBy!==member.id)) throw new Error('추가한 사람 또는 방장만 수정할 수 있어요.');
          Object.assign(r,value);
        } else {
          if(this.data.restaurants.length>=40) throw new Error('식당은 최대 40개까지 추가할 수 있어요.');
          if(this.data.restaurants.some(r=>r.name===value.name&&r.address===value.address)) throw new Error('이미 추가된 식당입니다.');
          this.data.restaurants.push({...value,id:crypto.randomUUID(),addedBy:member.id,selected:this.data.restaurants.filter(r=>r.selected).length<12});
        }
        this.invalidateReady();
      } else if(b.type==='select') {
        if(this.data.phase!=='collecting')throw new Error('후보 모집 중에만 변경할 수 있어요.');
        const r=this.data.restaurants.find(r=>r.id===b.id); if(!r) throw new Error('식당을 찾을 수 없어요.');
        if(!r.selected&&this.data.restaurants.filter(r=>r.selected).length>=12) throw new Error('경기에는 최대 12곳까지 참여할 수 있어요.');
        r.selected=!r.selected; this.invalidateReady();
      } else if(b.type==='remove') {
        if(this.data.phase!=='collecting')throw new Error('후보 모집 중에만 변경할 수 있어요.');
        const r=this.data.restaurants.find(r=>r.id===b.id);
        if(!r||(!host&&r.addedBy!==member.id)) throw new Error('추가한 사람 또는 방장만 삭제할 수 있어요.');
        this.data.restaurants=this.data.restaurants.filter(r=>r.id!==b.id); this.invalidateReady();
      } else if(b.type==='vote') {
        if(!this.data.restaurants.some(r=>r.id===b.id&&r.selected)) throw new Error('출전하는 식당을 골라 주세요.');
        member.vote=member.vote===b.id?null:b.id;
      } else if(b.type==='ready') { member.ready=!member.ready;
      } else if(b.type==='start') {
        if(!host) throw new Error('방장만 경기를 시작할 수 있어요.');
        if(this.data.phase==='collecting')this.finishCollection();
        else {if(this.data.phase!=='lobby')throw new Error('새 라운드를 먼저 시작해 주세요.');const deadline=this.data.scheduledDeadline||Date.now()+300000;if(deadline<Date.now()+5000)throw new Error('마감시간이 지났어요. 새 마감시간을 정해 주세요.');this.data.phase='collecting';this.data.collectionDeadline=deadline;this.data.race=null;this.data.draft=null;this.invalidateReady();}
      } else if(b.type==='locate') {
        if(!host)throw new Error('방장만 출발지 위치를 변경할 수 있어요.');
        if(Date.now()-(this.data.lastLocate||0)<3000)throw new Error('위치 검색은 3초에 한 번 가능해요.');
        const query=String(b.query||'').trim().slice(0,160);if(query.length<2)throw new Error('건물명 또는 장소명을 입력해 주세요.');
        this.data.lastLocate=Date.now();await this.save();
        this.send(ws,{type:'locations',requestId:b.requestId,query,addressSearch:!!b.address,items:b.address?await locateAddress(this.env,b.address):await resolveLocations(this.env,query)});return;
      } else if(b.type==='search') {
        if(this.searching)throw new Error('식당을 검색 중이에요. 잠시만 기다려 주세요.');
        const keyword=String(b.keyword||'').trim().slice(0,40);
        this.searching=true;this.data.lastSearch=Date.now();
        const version=this.data.locationVersion;
        let result;
        try{await this.save();result=await searchPlaces(this.env,{center:this.data.center,keyword,radiusMeters:this.data.radiusMeters||800});}finally{this.searching=false;}
        this.send(ws,{type:'search',requestId:b.requestId,keyword,center:this.data.center,locationVersion:version,...result}); return;
      } else throw new Error('알 수 없는 요청입니다.');
      await this.save();await this.schedule(); this.broadcast();
    } catch(error) { this.send(ws,{type:'error',requestType:b?.type,requestId:b?.requestId,message:error.message||'처리하지 못했습니다.'}); }
  }
  invalidateReady(clearDraft=true) { if(clearDraft)this.data.draft=null;this.data.members.forEach(m=>{m.ready=false;if(!this.data.restaurants.some(r=>r.selected&&r.id===m.vote))m.vote=null;}); }
  async webSocketClose(ws,code,reason) { try{ws.close(code,reason);}catch{} if(this.data)this.broadcast(); }
  async webSocketError(ws) { try{ws.close(1011,'다시 연결해 주세요.');}catch{} if(this.data)this.broadcast(); }
  startRace(rematchEntries=null){
    let entries=rematchEntries||this.data.restaurants.filter(r=>r.selected).map(r=>({...r,picks:(this.data.draft?.log||[]).filter(v=>v.action==='pick'&&v.id===r.id&&!v.skipped).length}));if(entries.length<2)throw new Error('후보를 2곳 이상 골라 주세요.');
    const direct=this.data.playMode==='direct';
    if(direct)entries=entries.map(e=>{const pick=this.data.draft?.log.find(v=>v.action==='pick'&&v.id===e.id&&!v.skipped),controllerId=rematchEntries?e.controllerId:pick?.memberId;return {...e,restaurantId:e.id,picks:0,controllerId:controllerId||null,playerName:this.data.members.find(m=>m.id===controllerId)?.name||'자동 참가'};});
    const race={id:crypto.randomUUID(),mode:this.data.gameMode||'island',playMode:direct?'direct':'auto',seed:crypto.getRandomValues(new Uint32Array(1))[0],startAt:Date.now()+(direct?8000:3500),entries:structuredClone(entries),winner:null,completed:false};
    if(direct){race.preparing=entries.some(e=>e.controllerId);race.readyControllers=[];race.readyDeadline=Date.now()+20000;race.startAt=Date.now()+(race.preparing?23100:3100);race.simulation=createLiveGame(race.seed,race.mode,entries);race.live=liveSnapshot(race.simulation);race.duration=122000;}
    else {const plan=gamePlan(race.seed,race.mode,entries);if((plan.draw!==true&&!entries[plan.winner])||!Number.isFinite(plan.duration)||plan.duration<=0)throw new Error('경기 계산을 완료하지 못했어요. 다시 선택해 주세요.');race.duration=plan.duration;}
    this.data.race=race;this.data.phase='playing';this.data.collectionDeadline=null;this.liveInputs={};this.lastLiveTime=-1;this.lastLiveSent=-100;this.lastLiveCheckpoint=0;if(direct)this.resumeLive();
  }
  resumeLive(){if(this.liveTimer||!this.data?.race||this.data.race.playMode!=='direct'||raceCompleted(this.data.race))return;this.liveTimer=setInterval(()=>this.tickLive().catch(()=>{}),LIVE_STEP);this.liveTimer.unref?.();}
  async tickLive(){
    const r=this.data?.race;if(!r||r.playMode!=='direct'||raceCompleted(r)){clearInterval(this.liveTimer);this.liveTimer=null;return;}if(this.liveTicking)return;this.liveTicking=true;
    try{if(r.preparing){if(Date.now()<r.readyDeadline)return;r.preparing=false;r.startAt=Date.now()+3100;await this.save();this.broadcast();}const target=Math.max(0,Date.now()-r.startAt),sim=r.simulation;let steps=0;while(sim.time+LIVE_STEP<=target&&!sim.finished&&steps++<40){stepLiveGame(sim,this.liveInputs||{});for(const input of Object.values(this.liveInputs||{})){input.jump=false;input.action=false;}}
      if(sim.time===(this.lastLiveTime??-1)&&!sim.finished)return;this.lastLiveTime=sim.time;
      if(sim.time-(this.lastLiveSent??-100)>=100||sim.finished){this.lastLiveSent=sim.time;const packet=JSON.stringify({type:'live',raceId:r.id,now:Date.now(),live:liveSnapshot(sim)});for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.memberId){try{ws.send(packet);}catch{}}}
      if(sim.finished){r.completed=true;r.draw=sim.draw;r.winner=sim.winner===null?null:r.entries[sim.winner];r.live=liveSnapshot(sim);this.data.phase='result';if(r.winner){this.data.history.unshift({name:r.winner.name,at:Date.now()});this.data.history=this.data.history.slice(0,10);}clearInterval(this.liveTimer);this.liveTimer=null;await this.save();this.broadcast();await this.schedule();}
      else if(sim.time-(this.lastLiveCheckpoint||0)>=1000){if(this.checkpointLive())this.lastLiveCheckpoint=sim.time;}
    }finally{this.liveTicking=false;}
  }
  finishCollection(){
    const pool=this.data.restaurants.filter(r=>r.selected).map(r=>r.id);if(pool.length<2)throw new Error('후보를 2곳 이상 골라 주세요.');
    this.data.collectionDeadline=null;this.data.phase='mode';this.data.race=null;this.invalidateReady();
  }
  startDraft(){
    const pool=this.data.restaurants.filter(r=>r.selected).map(r=>r.id);
    let members=this.members().filter(m=>m.online).map(m=>m.id);if(!members.length)members=[this.data.hostId];
    const bans=Math.min(members.length,pool.length-2),picks=members.length;
    const turns=[...Array.from({length:bans},(_,i)=>({memberId:members[i%members.length],action:'ban'})),...Array.from({length:picks},(_,i)=>({memberId:members[members.length-1-i%members.length],action:'pick'}))];
    this.data.phase='draft';this.data.race=null;this.invalidateReady();this.data.draft={pool,turns,cursor:0,banned:[],picked:[],log:[],done:false,deadline:Date.now()+10000};
  }

  advanceDraft(){
    const draft=this.data.draft;
    if(this.data.playMode==='direct'&&!draft.pool.some(id=>!draft.banned.includes(id)&&!draft.picked.includes(id))){while(draft.cursor<draft.turns.length){const turn=draft.turns[draft.cursor++];draft.log.push({...turn,id:null,skipped:true,reason:'no-candidates'});}}
    if(draft.cursor===draft.turns.length){draft.done=true;draft.deadline=null;this.data.restaurants.forEach(r=>r.selected=draft.pool.includes(r.id)&&!draft.banned.includes(r.id));this.data.phase='choosing';this.data.gameMode=null;}
    else draft.deadline=Date.now()+10000;
  }
  async schedule(){
    const times=[this.data.expiresAt];if(this.data.collectionDeadline)times.push(this.data.collectionDeadline);if(this.data.draft&&!this.data.draft.done)times.push(this.data.draft.deadline);if(this.data.race&&!raceCompleted(this.data.race))times.push(this.data.race.playMode==='direct'?Date.now()+5000:this.data.race.startAt+this.data.race.duration);
    await this.ctx.storage.setAlarm(Math.min(...times));
  }
  async alarm(){
    if(!this.data)return;
    if(Date.now()>=this.data.expiresAt){for(const ws of this.ctx.getWebSockets())ws.close(1000,'24시간이 지나 방이 만료되었습니다.');this.data=null;await this.ctx.storage.deleteAll();return;}
    if(this.data.phase==='collecting'&&this.data.collectionDeadline&&Date.now()>=this.data.collectionDeadline){this.data.collectionDeadline=null;try{this.finishCollection();}catch{this.data.phase='collecting';}}
    else if(this.data.phase==='draft'&&this.data.draft?.deadline<=Date.now()){
      const d=this.data.draft,t=d.turns[d.cursor],available=d.pool.filter(id=>!d.banned.includes(id));const id=null;
      if(id)d.picked.push(id);d.log.push({...t,id,skipped:true});d.cursor++;this.advanceDraft();
    }
    const r=this.data.race;
    if(r?.playMode==='direct'&&!raceCompleted(r)){this.resumeLive();await this.tickLive();if(this.data&&!raceCompleted(r))await this.schedule();return;}
    if(r&&r.playMode!=='direct'&&!raceCompleted(r)&&Date.now()>=r.startAt+r.duration){
      const plan=gamePlan(r.seed,r.mode,r.entries);r.draw=plan.draw===true;r.winner=r.draw?null:r.entries[plan.winner];r.completed=true;this.data.phase='result';
      if(r.winner){this.data.history.unshift({name:r.winner.name,at:Date.now()});this.data.history=this.data.history.slice(0,10);}
    }
    await this.save();this.broadcast();await this.schedule();
  }
}
