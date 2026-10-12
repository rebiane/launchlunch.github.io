// Keep input replay and rendering on one monotonic timeline. Room state packets
// may have different transit times and must not rewind an active game's clock.
export function createLiveClock(){
 let key=null,anchor=0,received=0;
 return (race,now,serverNow)=>{
  const next=`${race.id}:${race.startAt}`;
  if(next!==key){key=next;anchor=serverNow-race.startAt;received=now;}
  return anchor+Math.max(0,now-received);
 };
}
