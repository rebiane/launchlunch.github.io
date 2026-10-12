import {shakePlan} from './shake.js';
import {cookiePlan} from './cookie.js';
import {sprintPlan,SPRINT_MODES} from './sprint.js';
import {islandSimulation} from './race.js';
import {bookPlan} from './book-motion.js';
import {survivalPlan,SURVIVAL_MODES} from './survival.js';
export const GAME_META={
 race:{title:'쿵! 메뉴북',eyebrow:'MENU BOOK',description:'책장이 덮치기 전에 구멍으로 피하세요',subtitle:'구멍은 줄어들고, 책장은 더 빨리 덮쳐요!'},
 island:{title:'점프 파티',eyebrow:'JUMP PARTY',description:'점프! 회전 바 3개를 피하고 살아남기',subtitle:'초반은 여유롭게, 점점 빨라지는 바를 뛰어넘어요!'},
 fire:{title:'불판 대소동',eyebrow:'SIZZLE SCRAMBLE',description:'빨갛게 달아오르는 타일을 벗어나세요',subtitle:'점화 속도가 매번 달라져요. 불에 닿으면 바로 탈락!'},
 boulder:{title:'와르르 도시락',eyebrow:'ROLLING LUNCH',description:'부딪혀도 버티기! 경사로 밖으로 밀리면 탈락',subtitle:'빠르고 느린 주먹밥 사이에서 균형을 지키세요.'},
 shake:{title:'탈탈 베이커리',eyebrow:'BREAD SHAKE',description:'기울이고 흔들어 걸린 빵을 모두 꺼내세요',subtitle:'기울이고, 흔들고! 통을 먼저 비우면 우승.'},
 climb:{title:'막대 오르기',eyebrow:'POLE CLIMB',description:'벌을 피해 꼭대기로!',subtitle:'벌에 부딪히면 핑그르르! 미끄러져도 다시 올라가요.'},
 tricycle:{title:'호버 보드 레이스',eyebrow:'RIVER RACE',description:'가속하며 좌우로 피해 결승선까지!',subtitle:'누르고 가속, 떼면 감속! 장애물에 부딪히면 1초 회전해요.'},
 cookie:{title:'쿠키 쟁탈전',eyebrow:'COOKIE CLASH',description:'마지막 골든 쿠키를 잡아 역전하세요!',subtitle:'쿠키 1·3점 → 마지막 골든 쿠키 5점. 실제 획득 점수로 승부.'}
};
export function gamePlan(seed,mode,entries){
 const picks=entries.map(e=>e.picks||0);
 if(mode==='shake')return shakePlan(seed,entries.length,picks);
 if(mode==='cookie')return cookiePlan(seed,entries.length,picks);
 if(mode==='race')return bookPlan(seed,entries.length,picks);
 if(mode==='island')return islandSimulation(seed,entries.length,picks);
 if(SPRINT_MODES.includes(mode))return sprintPlan(seed,entries.length,mode,picks);
 if(SURVIVAL_MODES.includes(mode))return survivalPlan(seed,entries.length,mode,picks);
 throw new Error('게임 종류를 확인해 주세요.');
}
