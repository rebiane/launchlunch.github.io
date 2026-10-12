import test from 'node:test';
import assert from 'node:assert/strict';
import {LunchRoom} from '../src/room.js';
async function fixture(){
  const saved=new Map(),sockets=[],alarms=[];
  const ctx={storage:{get:async k=>saved.get(k),put:async(k,v)=>saved.set(k,structuredClone(v)),setAlarm:async time=>{alarms.push(time);},deleteAll:async()=>saved.clear()},blockConcurrencyWhile(fn){this.loaded=fn();},getWebSockets:()=>sockets};
  const room=new LunchRoom(ctx,{});await ctx.loaded;
  const hostToken=crypto.randomUUID();
  await room.fetch(new Request('https://room/create',{method:'POST',body:JSON.stringify({id:'a'.repeat(20),token:hostToken,name:'host'})}));
  async function join(token,name){const ws={a:{},messages:[],serializeAttachment(v){this.a=structuredClone(v);},deserializeAttachment(){return structuredClone(this.a);},send(v){this.messages.push(JSON.parse(v));},close(){this.closed=true;}};sockets.push(ws);await room.webSocketMessage(ws,JSON.stringify({type:'join',token,name}));return ws;}
  const host=await join(hostToken,'host'),guest=await join(crypto.randomUUID(),'guest');
  const send=(ws,type,data={})=>room.webSocketMessage(ws,JSON.stringify({type,...data}));
  return {room,host,guest,send,saved,join,alarms};
}
async function directRoom(t,{skipHost=false,mode='cookie'}={}){
 const f=await fixture(),{room,host,guest,send}=f;t.after(()=>clearInterval(room.liveTimer));
 await send(host,'start');await send(host,'add',{restaurant:{name:'A'}});await send(guest,'add',{restaurant:{name:'B'}});
 await send(host,'start');assert.equal(room.data.phase,'mode');await send(host,'play-mode',{value:'direct'});
 const ids=room.data.restaurants.map(r=>r.id);await send(guest,'draft-choice',{id:ids[0]});
 await send(host,skipHost?'draft-skip':'draft-choice',{id:ids[1]});await send(host,'launch',{mode});clearInterval(room.liveTimer);room.liveTimer=null;
 return f;
}
test('direct duplicate picks are rejected, mode reset restores candidates, skipped members spectate',async t=>{
 const {room,host,guest,send}=await fixture();t.after(()=>clearInterval(room.liveTimer));
 await send(host,'start');for(const name of ['A','B'])await send(guest,'add',{restaurant:{name}});
 await send(host,'start');await send(guest,'play-mode',{value:'direct'});assert.equal(room.data.phase,'mode');await send(host,'play-mode',{value:'direct'});
 const id=room.data.restaurants[0].id;await send(guest,'draft-choice',{id});const cursor=room.data.draft.cursor;await send(host,'draft-choice',{id});assert.equal(room.data.draft.cursor,cursor);assert.equal(host.messages.at(-1).type,'error');
 await send(host,'draft-skip');await send(host,'play-mode-reset');assert.equal(room.data.phase,'mode');assert.equal(room.data.draft,null);
 await send(host,'play-mode',{value:'direct'});await send(guest,'draft-choice',{id});await send(host,'draft-skip');await send(host,'launch',{mode:'cookie'});
 assert.equal(room.data.race.entries.length,2);assert.equal(room.data.race.entries.filter(e=>e.controllerId).length,1);assert.ok(room.data.race.entries.every(e=>e.picks===0));
 const guestId=guest.a.memberId;assert.equal(room.data.race.entries[0].controllerId,guestId);
});
test('only actual pick owner controls, inputs have independent limits and stale sequence is ignored',async t=>{
 const {room,host,guest,send}=await directRoom(t,{skipHost:true}),raceId=room.data.race.id;
 await send(host,'input',{raceId,x:1,z:0,seq:1});assert.equal(host.messages.at(-1).type,'error');assert.equal(room.liveInputs[host.a.memberId],undefined);
 await send(guest,'input',{raceId:'stale',x:1,z:0,seq:1});assert.equal(room.liveInputs[guest.a.memberId],undefined);
 for(let seq=0;seq<40;seq++)await send(guest,'input',{raceId,x:1,z:0,seq});assert.equal(room.liveInputs[guest.a.memberId].seq,39);
 await send(guest,'input',{raceId,x:-1,z:0,seq:38});assert.equal(room.liveInputs[guest.a.memberId].x,1);
 await send(guest,'input',{raceId,x:2,z:0,seq:40});assert.equal(room.liveInputs[guest.a.memberId].seq,39);
 await send(guest,'live-ready',{raceId});assert.equal(room.data.race.preparing,false);
});
test('preparation blocks simulation until controllers load, readiness starts countdown, reconnect snapshot excludes internals',async t=>{
 const {room,host,guest,send}=await directRoom(t),r=room.data.race;assert.equal(r.preparing,true);
 r.startAt=Date.now()-5000;await room.tickLive();assert.equal(r.simulation.time,0);
 await send(host,'live-ready',{raceId:r.id});assert.equal(r.preparing,true);await send(guest,'live-ready',{raceId:r.id});assert.equal(r.preparing,false);assert.ok(r.startAt>Date.now()+2900);
 const snapshot=JSON.parse(JSON.stringify(room.snapshot()));assert.equal(snapshot.tokens,undefined);assert.equal(snapshot.race.simulation,undefined);assert.equal(snapshot.race.live.players.length,2);
 r.startAt=Date.now()-100;await room.tickLive();assert.equal(r.simulation.time,100);assert.ok(guest.messages.some(m=>m.type==='live'));
});
test('readiness timeout starts safely and real score result commits once',async t=>{
 const {room,host}=await directRoom(t),r=room.data.race;r.readyDeadline=Date.now()-1;await room.tickLive();assert.equal(r.preparing,false);assert.ok(r.startAt>Date.now()+2900);assert.equal(r.simulation.time,0);
 const s=r.simulation;s.time=s.core.time=27960;s.core.goldenWave=2;s.core.cookies=[];s.core.scores[1]=9;r.startAt=Date.now()-28050;
 await room.tickLive();assert.equal(room.data.phase,'result');assert.equal(r.winner.id,r.entries[1].id);assert.equal(r.completed,true);assert.equal(room.data.history.length,1);
 await room.tickLive();assert.equal(room.data.history.length,1);assert.equal(host.messages.at(-1).state.race.completed,true);
});
test('reconnected controller can restart input sequence while each socket rejects its own replay',async t=>{
 const {room,guest,send,join}=await directRoom(t,{skipHost:true}),raceId=room.data.race.id;
 await send(guest,'input',{raceId,x:1,z:0,seq:100});
 const token=Object.keys(room.data.tokens).find(k=>room.data.tokens[k]===guest.a.memberId),reconnected=await join(token,'guest');
 await send(reconnected,'input',{raceId,x:-1,z:0,seq:0});assert.equal(room.liveInputs[guest.a.memberId].x,-1);
 await send(reconnected,'input',{raceId,x:1,z:0,seq:0});assert.equal(room.liveInputs[guest.a.memberId].x,-1);
 await send(guest,'input',{raceId,x:1,z:0,seq:99});assert.equal(room.liveInputs[guest.a.memberId].x,-1);
});
test('direct draft immediately skips remaining pick turns when all available restaurants are owned',async t=>{
 const {room,host,guest,send,join}=await fixture();t.after(()=>clearInterval(room.liveTimer));const third=await join(crypto.randomUUID(),'third');
 await send(host,'start');for(const name of ['A','B'])await send(guest,'add',{restaurant:{name}});
 await send(host,'start');await send(host,'play-mode',{value:'direct'});
 const ids=room.data.restaurants.map(r=>r.id);assert.equal(room.data.draft.turns.length,3);
 await send(third,'draft-choice',{id:ids[0]});await send(guest,'draft-choice',{id:ids[1]});
 assert.equal(room.data.phase,'choosing');assert.equal(room.data.draft.done,true);assert.equal(room.data.draft.log.at(-1).memberId,host.a.memberId);assert.equal(room.data.draft.log.at(-1).skipped,true);assert.equal(room.data.draft.log.at(-1).reason,'no-candidates');
});
test('a quick jump press and release is latched until the next physics step and consumed once',async t=>{
 const {room,host,guest,send}=await directRoom(t,{mode:'island'}),r=room.data.race;
 await send(host,'live-ready',{raceId:r.id});await send(guest,'live-ready',{raceId:r.id});
 await send(guest,'input',{raceId:r.id,x:0,z:0,jump:true,seq:0});
 await send(guest,'input',{raceId:r.id,x:0,z:0,jump:false,seq:1});
 assert.equal(room.liveInputs[guest.a.memberId].jump,true);
 r.startAt=Date.now()-100;await room.tickLive();
 const p=r.simulation.players.find(p=>p.controllerId===guest.a.memberId);
 assert.equal(p.jumpAt,10);assert.ok(p.y>0);assert.equal(room.liveInputs[guest.a.memberId].jump,false);
 r.startAt=Date.now()-1050;await room.tickLive();assert.equal(p.jumpAt,10);
});
test('direct cheer allows spectators and eliminated players every 200ms but rejects active controllers',async t=>{
 const {room,host,guest,send}=await directRoom(t,{skipHost:true});
 const cheerCount=()=>host.messages.filter(m=>m.type==='cheer').length;
 await send(guest,'cheer');assert.equal(cheerCount(),0);
 await send(host,'cheer');assert.equal(cheerCount(),1);assert.equal(host.messages.at(-1).memberId,host.a.memberId);assert.equal(host.messages.at(-1).state,undefined);assert.equal(host.messages.at(-1).name,room.data.members.find(m=>m.id===host.a.memberId).name);
 await send(host,'cheer');assert.equal(cheerCount(),1);
 host.a.lastCheer=Date.now()-201;await send(host,'cheer');assert.equal(cheerCount(),2);
 room.data.race.simulation.players.find(p=>p.controllerId===guest.a.memberId).alive=false;
 await send(guest,'cheer');assert.equal(cheerCount(),3);assert.equal(host.messages.at(-1).memberId,guest.a.memberId);
});
test('direct keepalive alarm emits live snapshots without forcing full UI state and preserves one-second checkpoints',async t=>{
 const {room,host,guest,send,saved}=await directRoom(t),r=room.data.race;
 await send(host,'live-ready',{raceId:r.id});await send(guest,'live-ready',{raceId:r.id});
 const before=host.messages.filter(m=>m.type==='state').length;
 r.startAt=Date.now()-1000;await room.alarm();clearInterval(room.liveTimer);room.liveTimer=null;
 assert.equal(host.messages.filter(m=>m.type==='state').length,before);assert.equal(saved.get('room').race.simulation.time,1000);assert.equal(r.simulation.time,1000);
 r.startAt=Date.now()-5000;await room.tickLive();await room.liveCheckpoint;await room.tickLive();await room.liveCheckpoint;
 assert.equal(r.simulation.time,5000);assert.equal(saved.get('room').race.simulation.time,5000);assert.equal(host.messages.filter(m=>m.type==='state').length,before);
});
test('pending storage checkpoint does not hold physics ticks or lose jumping input',async t=>{
 const {room,host,guest,send}=await directRoom(t,{mode:'island'}),r=room.data.race;
 await send(host,'live-ready',{raceId:r.id});await send(guest,'live-ready',{raceId:r.id});
 const put=room.ctx.storage.put;let release;room.ctx.storage.put=(key,value,options)=>{assert.equal(options.allowUnconfirmed,true);return new Promise(resolve=>{release=async()=>{await put(key,value);resolve();};});};
 r.startAt=Date.now()-1000;const start=performance.now();await room.tickLive();assert.ok(performance.now()-start<100);assert.equal(r.simulation.time,1000);assert.ok(room.liveCheckpoint);
 await send(guest,'input',{raceId:r.id,x:0,z:0,jump:true,seq:20});r.startAt=Date.now()-1150;await room.tickLive();assert.equal(r.simulation.time,1150);assert.equal(r.simulation.players.find(p=>p.controllerId===guest.a.memberId).jumpAt,1010);
 await release();await room.liveCheckpoint;room.ctx.storage.put=put;
});
test('live snapshots continue after a delayed catch-up lands on odd 50ms boundaries',async t=>{
 const {room,host,guest,send}=await directRoom(t),r=room.data.race;await send(host,'live-ready',{raceId:r.id});await send(guest,'live-ready',{raceId:r.id});
 r.startAt=Date.now()-150;await room.tickLive();const first=host.messages.filter(m=>m.type==='live').length;
 r.startAt=Date.now()-250;await room.tickLive();assert.equal(host.messages.filter(m=>m.type==='live').length,first+1);
});
test('loading an unfinished legacy live engine ends neutrally and preserves already completed results',async t=>{
 const {room,saved}=await directRoom(t);clearInterval(room.liveTimer);room.liveTimer=null;
 const raceId=room.data.race.id;delete room.data.race.simulation.core;await room.save();
 const restored=new LunchRoom(room.ctx,{});await room.ctx.loaded;t.after(()=>clearInterval(restored.liveTimer));
 assert.equal(restored.data.race.id,raceId);assert.equal(restored.data.race.completed,true);assert.equal(restored.data.race.winner,null);assert.equal(restored.data.race.live.reason,'updated');assert.equal(restored.data.phase,'result');assert.equal(restored.data.history.length,0);
 restored.data.race.winner=restored.data.race.entries[0];restored.data.race.draw=false;await restored.save();
 const done=new LunchRoom(room.ctx,{});await room.ctx.loaded;assert.equal(done.data.race.winner.id,restored.data.race.entries[0].id);
});
test('river input preserves diagonal throttle and strips jump and legacy shift pulses',async t=>{
 const {room,guest,send}=await directRoom(t,{skipHost:true}),race=room.data.race;race.mode='tricycle';
 await send(guest,'input',{raceId:race.id,x:1,z:-1,jump:true,action:true,seq:0});const input=room.liveInputs[guest.a.memberId];assert.equal(input.x,1);assert.equal(input.z,-1);assert.equal(input.jump,false);assert.equal(input.action,false);
});
test('server strips jump for all six non-jumping games even when the API input asks for it',async t=>{
 const {room,guest,send}=await directRoom(t,{skipHost:true});for(const [seq,mode] of ['race','cookie','fire','boulder','crush','climb'].entries()){room.data.race.mode=mode;await send(guest,'input',{raceId:room.data.race.id,x:0,z:0,jump:true,seq});assert.equal(room.liveInputs[guest.a.memberId].jump,false,mode);assert.equal(room.liveInputs[guest.a.memberId].seq,seq);}
});
test('held jump survives server ticks and releases independently of a latched tap',async t=>{
 const {room,host,guest,send}=await directRoom(t,{mode:'island'}),r=room.data.race;r.simulation.core.rocks=[];
 await send(host,'live-ready',{raceId:r.id});await send(guest,'live-ready',{raceId:r.id});
 await send(guest,'input',{raceId:r.id,x:0,z:0,jump:false,jumpHeld:true,seq:0});r.startAt=Date.now()-100;await room.tickLive();
 assert.equal(room.liveInputs[guest.a.memberId].jumpHeld,true);assert.equal(room.liveInputs[guest.a.memberId].jump,false);
 const p=r.simulation.players.find(p=>p.controllerId===guest.a.memberId),first=p.jumpAt;
 for(let seq=1;seq<=10;seq++){r.startAt=Date.now()-(seq*100+100);await send(guest,'input',{raceId:r.id,x:0,z:0,jumpHeld:true,seq});await room.tickLive();}
 assert.ok(p.jumpAt>first);await send(guest,'input',{raceId:r.id,x:0,z:0,jumpHeld:false,seq:20});assert.equal(room.liveInputs[guest.a.memberId].jumpHeld,false);
});
