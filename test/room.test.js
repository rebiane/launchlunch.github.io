import test from 'node:test';
import assert from 'node:assert/strict';
import {LunchRoom} from '../src/room.js';
import {gamePlan} from '../public/game.js';
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
test('server denies guest settings and starts; never broadcasts identity tokens',async()=>{
  const {room,guest,send,host}=await fixture();const old=room.data.location;
  await send(guest,'settings',{location:'other',maxWalk:10});assert.equal(room.data.location,old);assert.equal(guest.messages.at(-1).type,'error');
  await send(guest,'start');assert.equal(room.data.race,null);assert.equal(guest.messages.at(-1).type,'error');
  assert.equal(Object.hasOwn(host.messages.find(m=>m.type==='state').state,'tokens'),false);
});
test('walking is search-only: manual entries can join and location changes preserve selections',async()=>{
  const {room,host,guest,send}=await fixture();
  await send(host,'start');
  await send(guest,'add',{restaurant:{name:'A'},locationVersion:1});assert.equal(room.data.restaurants[0].selected,true);
  await send(guest,'ready');
  await send(host,'settings',{location:'changed address',maxWalk:5});assert.equal(room.data.restaurants[0].selected,true);assert.equal(room.data.radiusMeters,400);assert.equal(room.data.members[1].ready,true);
  await send(guest,'add',{restaurant:{name:'B'},locationVersion:1});assert.equal(room.data.restaurants.length,2);
  await send(guest,'add',{restaurant:{name:'stale search'},fromSearch:true,locationVersion:1});assert.equal(room.data.restaurants.length,2);
  await send(guest,'select',{id:room.data.restaurants[0].id});await send(guest,'select',{id:room.data.restaurants[0].id});assert.equal(room.data.restaurants[0].selected,true);
});
test('ban-pick enforces turns, locks edits, survives skipped turns, and keeps all unbanned candidates until game choice',async()=>{
  const {room,host,guest,send}=await fixture();
  await send(host,'start');
  for(const name of ['A','B','C','D'])await send(guest,'add',{restaurant:{name}});
  await send(guest,'draft-start');assert.equal(guest.messages.at(-1).type,'error');
  await send(host,'draft-start');await send(host,'play-mode',{value:'auto'});assert.equal(room.data.draft.turns.length,4);
  const ids=room.data.restaurants.map(r=>r.id);
  await send(guest,'draft-choice',{id:ids[0]});assert.equal(room.data.draft.cursor,0);
  await send(host,'add',{restaurant:{name:'E'}});assert.equal(room.data.restaurants.length,4);
  await send(host,'draft-choice',{id:ids[0]});assert.equal(room.data.draft.banned[0],ids[0]);
  await send(host,'draft-skip');assert.equal(room.data.draft.cursor,2);
  await send(guest,'draft-choice',{id:ids[0]});assert.equal(room.data.draft.cursor,2);
  await send(guest,'draft-choice',{id:ids[2]});await send(host,'draft-skip');
  assert.equal(room.data.draft.done,true);assert.equal(room.data.restaurants.filter(r=>r.selected).length,3);
  assert.equal(room.data.race,null);assert.equal(room.data.phase,'choosing');await send(host,'launch',{mode:'island'});assert.equal(room.data.race.entries.length,3);
});
test('game choice is host-only after draft; duplicate picks share a character and add speed',async()=>{
 const {room,host,guest,send}=await fixture();await send(host,'launch',{mode:'race'});assert.equal(room.data.race,null);
 await send(host,'start');for(const name of ['A','B','C','D','E','F'])await send(host,'add',{restaurant:{name}});
 await send(host,'draft-start');await send(host,'play-mode',{value:'auto'});await send(host,'draft-skip');await send(guest,'draft-skip');
 const id=room.data.restaurants[0].id;await send(guest,'draft-choice',{id});await send(host,'draft-choice',{id});assert.equal(room.data.phase,'choosing');
 await send(guest,'launch',{mode:'race'});assert.equal(room.data.race,null);await send(host,'launch',{mode:'race'});
 assert.equal(room.data.race.entries.length,6);assert.equal(room.data.race.entries[0].picks,2);assert.equal(room.data.race.mode,'race');
});
test('two candidates start without ready buttons; alarm commits winner and expires room',async()=>{
  const {room,host,guest,send,saved}=await fixture();await send(host,'start');
  await send(host,'add',{restaurant:{name:'A',walkMinutes:5},locationVersion:1});
  await send(guest,'add',{restaurant:{name:'B',walkMinutes:7},locationVersion:1});
  await send(host,'start');await send(host,'play-mode',{value:'auto'});await send(guest,'draft-skip');await send(host,'draft-skip');await send(host,'launch',{mode:'island'});assert.ok(room.data.race);assert.equal(room.data.phase,'playing');
  const count=room.data.restaurants.length;
  await send(guest,'add',{restaurant:{name:'C',walkMinutes:1},locationVersion:1});assert.equal(room.data.restaurants.length,count);
  const plan=gamePlan(room.data.race.seed,room.data.race.mode,room.data.race.entries),expected=room.data.race.entries[plan.winner]?.id??null;
  room.data.race.startAt=Date.now()-room.data.race.duration-1;await room.alarm();assert.equal(room.data.race.winner?.id??null,expected);assert.equal(room.data.race.draw,plan.winner===null);assert.equal(room.data.history.length,expected?1:0);
  room.data.expiresAt=Date.now()-1;await room.alarm();assert.equal(room.data,null);assert.equal(saved.size,0);assert.equal(host.closed,true);
});

test('collection and draft timers advance automatically; too few candidates stay in collection',async()=>{
 const {room,host,send}=await fixture();assert.equal(room.data.phase,'lobby');await send(host,'start');assert.ok(room.data.collectionDeadline>Date.now());
 room.data.collectionDeadline=Date.now()-1;await room.alarm();assert.equal(room.data.phase,'collecting');assert.equal(room.data.collectionDeadline,null);
 for(const name of ['A','B','C','D'])await send(host,'add',{restaurant:{name}});
 room.data.collectionDeadline=Date.now()-1;await room.alarm();assert.equal(room.data.phase,'mode');await send(host,'play-mode',{value:'auto'});assert.equal(room.data.phase,'draft');
 while(room.data.phase==='draft'){room.data.draft.deadline=Date.now()-1;await room.alarm();}
 assert.equal(room.data.phase,'choosing');assert.equal(room.data.race,null);assert.equal(room.data.restaurants.filter(r=>r.selected).length,4);assert.equal(room.data.draft.banned.length,0);
});


test('random nicknames are unique for 24 members and stable on reconnect',async()=>{
 const {room,host,join}=await fixture();assert.notEqual(room.data.members[0].name,'host');
 for(let i=2;i<24;i++)await join(crypto.randomUUID(),'same requested name');
 assert.equal(new Set(room.data.members.map(m=>m.name)).size,24);
 const before=room.data.members[0].name,token=Object.keys(room.data.tokens).find(k=>room.data.tokens[k]===room.data.hostId);await join(token,'another name');assert.equal(room.data.members.length,24);assert.equal(room.data.members[0].name,before);
});
test('only host can set or extend collection deadline; past and expired dates are rejected',async()=>{
 const {room,host,guest,send}=await fixture(),deadline=Date.now()+600000;
 await send(guest,'deadline',{deadline});assert.notEqual(room.data.scheduledDeadline,deadline);
 await send(host,'deadline',{deadline});assert.equal(room.data.scheduledDeadline,deadline);
 await send(host,'start');assert.equal(room.data.collectionDeadline,deadline);
 await send(host,'deadline',{deadline:deadline+600000});assert.equal(room.data.collectionDeadline,deadline+600000);
 await send(host,'deadline',{deadline:Date.now()-1});assert.equal(room.data.collectionDeadline,deadline+600000);
 await send(host,'deadline',{deadline:room.data.expiresAt+1});assert.equal(room.data.collectionDeadline,deadline+600000);
});

test('all six new games launch after draft and commit their simulation winner',async()=>{
 for(const mode of ['fire','boulder','shake','climb','tricycle','cookie']){
  const {room,host,guest,send}=await fixture();await send(host,'start');await send(host,'add',{restaurant:{name:'A'}});await send(guest,'add',{restaurant:{name:'B'}});await send(host,'start');await send(host,'play-mode',{value:'auto'});await send(guest,'draft-skip');await send(host,'draft-skip');await send(host,'launch',{mode});
  assert.equal(room.data.phase,'playing');const race=room.data.race,p=gamePlan(race.seed,mode,race.entries);race.startAt=Date.now()-race.duration-1;await room.alarm();if(p.draw){assert.equal(race.draw,true);assert.equal(race.winner,null);}else assert.equal(race.winner.id,race.entries[p.winner].id);assert.equal(race.completed,true);
 }
});

test('fire draw completes once without a false winner and only the host can rematch the same entrants',async t=>{
 const {room,host,guest,send,alarms}=await fixture();
 const entries=[{id:'a',name:'A',selected:true,picks:0},{id:'b',name:'B',selected:true,picks:0}],plan=gamePlan(34,'fire',entries);
 assert.equal(plan.draw,true);assert.equal(plan.winner,null);
 room.data.restaurants=structuredClone(entries);room.data.gameMode='fire';
 t.mock.method(crypto,'getRandomValues',array=>{array.fill(34);return array;});
 room.startRace();assert.equal(room.data.phase,'playing');assert.equal(room.data.race.completed,false);assert.equal(room.data.race.draw,undefined);
 const originalId=room.data.race.id;room.data.race.startAt=Date.now()-plan.duration-1;await room.alarm();
 assert.equal(room.data.phase,'result');assert.equal(room.data.race.completed,true);assert.equal(room.data.race.draw,true);assert.equal(room.data.race.winner,null);assert.equal(room.data.history.length,0);assert.equal(alarms.at(-1),room.data.expiresAt);
 await room.alarm();assert.equal(room.data.history.length,0);assert.equal(alarms.at(-1),room.data.expiresAt);
 await send(guest,'rematch');assert.equal(room.data.phase,'result');assert.equal(guest.messages.at(-1).type,'error');
 const originalEntries=structuredClone(room.data.race.entries);room.data.restaurants=[];
 await send(host,'rematch');assert.equal(room.data.phase,'playing');assert.notEqual(room.data.race.id,originalId);assert.deepEqual(room.data.race.entries,originalEntries);assert.equal(room.data.race.completed,false);assert.equal(room.data.race.draw,undefined);assert.equal(room.data.race.mode,'fire');
});
test('shake action pulses accumulate until simulation tick and never become jump or leak to other games',async()=>{
 const {room,host,send}=await fixture();const id=room.data.members[0].id;
 room.data.race={id:'shake-input',mode:'shake',playMode:'direct',startAt:Date.now(),entries:[{controllerId:id}],simulation:{core:{}}};
 await send(host,'input',{raceId:'shake-input',seq:1,x:.5,z:-1,action:true,jump:true,jumpHeld:true});
 assert.equal(room.liveInputs[id].action,true);assert.equal(room.liveInputs[id].jump,false);assert.equal(room.liveInputs[id].jumpHeld,false);
 await send(host,'input',{raceId:'shake-input',seq:2,x:0,z:0,action:false});assert.equal(room.liveInputs[id].action,true);
 await send(host,'input',{raceId:'shake-input',seq:1,x:1,z:0,action:true});assert.equal(room.liveInputs[id].seq,2);
 room.liveInputs[id].action=false;await send(host,'input',{raceId:'shake-input',seq:3,x:0,z:0,action:'true'});assert.equal(room.liveInputs[id].action,false);
 room.data.race.mode='cookie';await send(host,'input',{raceId:'shake-input',seq:4,x:0,z:0,action:true});assert.equal(room.liveInputs[id].action,false);
});
test('river held throttle and release remain independent of steering and never queue shift pulses',async()=>{
 const {room,host,send}=await fixture(),id=room.data.members[0].id;
 room.data.race={id:'river-input',mode:'tricycle',playMode:'direct',startAt:Date.now(),entries:[{controllerId:id}],simulation:{core:{}}};
 await send(host,'input',{raceId:'river-input',seq:1,x:-1,z:-1,action:true,jump:true,jumpHeld:true});
 assert.equal(room.liveInputs[id].x,-1);assert.equal(room.liveInputs[id].z,-1);assert.equal(room.liveInputs[id].action,false);assert.equal(room.liveInputs[id].jump,false);assert.equal(room.liveInputs[id].jumpHeld,false);
 await send(host,'input',{raceId:'river-input',seq:2,x:1,z:-1});assert.equal(room.liveInputs[id].x,1);assert.equal(room.liveInputs[id].z,-1);
 await send(host,'input',{raceId:'river-input',seq:3,x:1,z:0});assert.equal(room.liveInputs[id].x,1);assert.equal(room.liveInputs[id].z,0);
 await send(host,'input',{raceId:'river-input',seq:2,x:-1,z:-1});assert.equal(room.liveInputs[id].x,1);assert.equal(room.liveInputs[id].z,0);
});
