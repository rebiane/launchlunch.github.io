export const FOOD_TABS=[['all','전체'],['korean','한식'],['japanese','일식'],['chinese','중식'],['western','양식'],['snack','분식'],['cafe','카페/간식'],['other','기타']];
export function foodClass(r){
 const category=String(r.category||'');
 if(/카페|커피|베이커리|제과|제빵|디저트|아이스크림|과일|빙수|도넛|떡,한과/.test(category))return 'cafe';
 if(/분식|김밥|떡볶이|라면|종합분식/.test(category))return 'snack';
 if(/일식|일본|초밥|스시|돈가스|돈까스|라멘|우동|소바|이자카야|덮밥/.test(category))return 'japanese';
 if(/중식|중국|마라|양꼬치|짜장|짬뽕|딤섬/.test(category))return 'chinese';
 if(/양식|이탈리아|프랑스|파스타|피자|스테이크|햄버거|샌드위치|샐러드|브런치|멕시코/.test(category))return 'western';
 if(/한식|백반|국밥|찌개|전골|한정식|불고기|육류|고기요리|갈비|곱창|해물|생선|치킨|보쌈|족발|냉면|칼국수|국수|순대|도시락|게요리|닭|오리|죽/.test(category))return 'korean';
 return 'other';
}
const normalize=s=>String(s||'').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
export function filterFoods(items,tab='all',query=''){
 const words=String(query).trim().split(/\s+/).filter(Boolean).map(normalize);
 return items.map((restaurant,index)=>({restaurant,index})).filter(({restaurant:r})=>(tab==='all'||foodClass(r)===tab)&&words.every(q=>normalize([r.name,r.address,r.category].join(' ')).includes(q)));
}
