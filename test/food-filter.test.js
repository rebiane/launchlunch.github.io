import test from 'node:test';import assert from 'node:assert/strict';import {foodClass,filterFoods} from '../public/food-filter.js';
test('food tabs classify categories and preserve source indices when locally filtering',()=>{
 const items=[{name:'시청 국밥',category:'음식점>한식>국밥',address:'서울시청 1층'},{name:'맛있는 라멘',category:'일식>라멘',address:'서울시청 지하'},{name:'카페',category:'카페,디저트',address:'태평로1가'}];
 assert.equal(foodClass(items[0]),'korean');assert.equal(foodClass(items[1]),'japanese');assert.equal(foodClass(items[2]),'cafe');assert.equal(foodClass({category:'알 수 없음'}),'other');
 assert.deepEqual(filterFoods(items,'japanese','시청 라멘').map(r=>r.index),[1]);assert.equal(filterFoods(items,'korean','라멘').length,0);assert.equal(filterFoods(items,'all','').length,3);
});
