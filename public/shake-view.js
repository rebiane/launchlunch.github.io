// Display interpolation only; scores and escaped status always come from server.
export function blendShakeJar(old,next,blend){
 if(!old)return next;
 return {...next,angle:old.angle+(next.angle-old.angle)*blend,pieces:next.pieces.map((p,i)=>{
  const a=old.pieces[i];if(!a||a.escapedAt!==p.escapedAt)return p;
  return {...p,x:a.x+(p.x-a.x)*blend,y:a.y+(p.y-a.y)*blend,rotation:a.rotation+(p.rotation-a.rotation)*blend};
 })};
}
