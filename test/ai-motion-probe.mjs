import {createLiveGame,stepLiveGame} from '../public/live-game.js';
import {gamePlan} from '../public/game.js';
import {cookiePose} from '../public/cookie.js';import {survivalPose} from '../public/survival.js';import {sprintPose} from '../public/sprint.js';import {bookPose} from '../public/book-motion.js';
for(const count of [6,12])for(const mode of ['race','island','fire','boulder','climb','tricycle','cookie','shake']){
 const entries=Array.from({length:count},(_,i)=>({id:String(i)})),s=createLiveGame(42,mode,entries),cost=[],short=[],runs=Array(count).fill(0);let movements=0;
 while(!s.finished&&s.time<45000){const prev=s.players.map(p=>({...p})),a=performance.now();stepLiveGame(s,{},40);cost.push(performance.now()-a);s.players.forEach((p,i)=>{const move=Math.hypot(p.x-prev[i].x,p.z-prev[i].z,p.y-prev[i].y)>.0001;if(!move&&p.alive)runs[i]++;else if(runs[i]){if(runs[i]<=3)short.push(runs[i]*40);runs[i]=0;}movements+=move;});}
 cost.sort((a,b)=>a-b);console.log(JSON.stringify({count,mode,mean:cost.reduce((a,b)=>a+b)/cost.length,p99:cost[Math.floor(cost.length*.99)],shortStopRestarts:short.length,steps:cost.length}));
}
