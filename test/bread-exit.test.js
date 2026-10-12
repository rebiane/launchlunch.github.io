import test from 'node:test';
import assert from 'node:assert/strict';
import {breadExitPose,breadExitPoses,breadSupport,BREAD_TRAY as T,SHAKE_GEOMETRY as G,createShakeGame,stepShakeGame} from '../public/shake.js';
const exit=(extra={})=>({id:0,x:.02,y:2.33,vx:.3,vy:1.1,rotation:.2,escapedAt:100,escapeAngle:Math.PI,escapeAngularVelocity:.4,...extra});
test('bread begins at its exact transformed mouth position and inherits linear and angular velocity',()=>{
 const p=exit(),a=breadExitPose(p,100),c=Math.cos(p.escapeAngle),s=Math.sin(p.escapeAngle);assert.ok(Math.abs(a.x-(p.x*c-p.y*s))<1e-10);assert.ok(Math.abs(a.y-(T.pivotY+p.x*s+p.y*c))<1e-10);assert.equal(a.z,-.07);assert.equal(a.rotation,p.rotation+p.escapeAngle);
 assert.ok(Math.abs(a.vx-((p.vx-p.escapeAngularVelocity*p.y)*c-(p.vy+p.escapeAngularVelocity*p.x)*s))<1e-10);
 const b=breadExitPose(p,110);assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<.1);assert.ok(b.y<a.y);
});
test('tray walls and floor rebound without teleporting bread toward a chosen slot',()=>{
 const p=exit({id:1,escapeAngle:-Math.PI/2,vx:0,vy:4,escapeAngularVelocity:0}),first=breadExitPose(p,100);let prev=first,rebounded=false;
 for(let t=110;t<3000;t+=10){const pose=breadExitPose(p,t);assert.ok(Math.abs(pose.x-prev.x)<.2);assert.ok(Math.abs(pose.x)<=T.halfWidth-G.radius+1e-8);assert.ok(pose.y>=T.floor+G.radius-1e-8);if(pose.vx<0)rebounded=true;prev=pose;}assert.ok(rebounded);
});
test('twelve physically escaped breads settle into a pile without overlapping or changing the game result',()=>{
 const game=createShakeGame(42,2);while(!game.finished)stepShakeGame(game);const winner=game.winner,finish=game.finish,pieces=game.jars[winner].pieces,before=JSON.stringify(pieces);
 const poses=breadExitPoses(pieces,finish+4000);assert.ok(poses.every(Boolean));for(let i=0;i<poses.length;i++){assert.ok(poses[i].y>=T.floor+breadSupport(poses[i],0,1)-.002);for(let j=i+1;j<poses.length;j++){const a=poses[i],b=poses[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);assert.ok(Math.hypot(dx,dy,a.z-b.z)>=breadSupport(a,dx/d,dy/d)+breadSupport(b,dx/d,dy/d)-.002);}}
 assert.ok(poses.every(p=>p.y>=T.floor+breadSupport(p,0,1)-.002));assert.equal(JSON.stringify(pieces),before);assert.equal(game.winner,winner);assert.equal(game.finish,finish);
 // Seeking the preview backwards rebuilds the same deterministic trajectory.
 breadExitPoses(pieces,finish);assert.deepEqual(breadExitPoses(pieces,finish+4000),poses);
});
test('unescaped bread has no tray pose and detached depth matches the jar interior',()=>{
 const pieces=[exit(),exit({id:1,escapedAt:null})];const pose=breadExitPoses(pieces,100);assert.equal(pose[1],null);assert.equal(pose[0].z,-.07);assert.equal(breadExitPose(exit(),90),null);
});
