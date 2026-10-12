// Track coordinates and texture coordinates use opposite axes on the floor's top face.
export const CART_WHEEL_RADIUS=.19;
export const CART_TILE_REPEAT=4;
export function cartTravel(distance,finishAt,time,speed=5.5){
 const age=Math.max(0,Math.min(1,(time-finishAt)/1000));
 return distance+speed*(age-age*age/2);
}
export function cartSceneMotion(distances){
 const cameraDistance=Math.max(...distances);
 return {cameraDistance,floorOffset:cameraDistance/CART_TILE_REPEAT,
  runners:distances.map(distance=>({z:cameraDistance-distance+1,wheelAngle:-distance/CART_WHEEL_RADIUS}))};
}
