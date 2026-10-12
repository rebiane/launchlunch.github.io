import test from 'node:test';import assert from 'node:assert/strict';
import {cartTravel,cartSceneMotion,CART_WHEEL_RADIUS,CART_TILE_REPEAT} from '../public/cart-motion.js';
test('floor tiles, obstacles and runner coordinates share one forward camera displacement',()=>{
 const before=cartSceneMotion([40,38]),after=cartSceneMotion([45.5,38]);
 const delta=after.cameraDistance-before.cameraDistance;
 assert.equal(delta,5.5);assert.equal(after.runners[0].z,before.runners[0].z);
 assert.equal(after.runners[1].z-before.runners[1].z,delta,'stopped runner moves with the ground relative to camera');
 assert.equal((after.floorOffset-before.floorOffset)*CART_TILE_REPEAT,delta,'top-face UV translates in the same direction as shelves/rocks');
 assert.ok(Math.abs((after.runners[0].wheelAngle-before.runners[0].wheelAngle)*CART_WHEEL_RADIUS+delta)<1e-12);
 assert.equal(after.runners[1].wheelAngle,before.runners[1].wheelAngle);
});
test('finish coasting continues the camera then decelerates without a position jump',()=>{
 const at=cartTravel(110,20000,20000),next=cartTravel(110,20000,20001),end=cartTravel(110,20000,21000);
 assert.equal(at,110);assert.ok(next>at&&next-at<.0055);assert.equal(end,112.75);assert.equal(cartTravel(110,20000,23000),end);
 assert.equal(cartTravel(110,20000,21000,6.05),113.025);
});
