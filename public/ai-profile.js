// Round-seeded decision styles. These change perception and choices, never
// movement speed, collision size, obstacle layouts or the eventual winner.
export function aiProfile(seed,index,count=6){
 let n=((seed>>>0)^0x68e31da4)>>>0;const random=()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,n|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
 const order=Array.from({length:count},(_,i)=>i);for(let k=count-1;k>0;k--){const j=Math.floor(random()*(k+1));[order[k],order[j]]=[order[j],order[k]];}
 const skill=.12+.84*(order[index]+random()*.7)/Math.max(1,count-1+.7);
 return {skill,reaction:100+(1-skill)*650,imprecision:.08+(1-skill)*.85};
}
