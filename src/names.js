const adjectives=['신나는','배고픈','든든한','씩씩한','웃는','졸린','빠른','느긋한','용감한','귀여운','행복한','춤추는','반짝이는','수줍은','멋진','통통한'];
const foods=['주먹밥','만두','김밥','우동','초밥','감자','돈까스','푸딩','떡볶이','라면','비빔밥','붕어빵','크루아상','김치찌개','파스타','도시락'];
export function randomNickname(members=[]){
 const used=new Set(members.map(m=>m.name)),available=adjectives.flatMap(a=>foods.map(f=>a+' '+f)).filter(n=>!used.has(n));
 if(!available.length)throw new Error('사용할 수 있는 닉네임이 없습니다.');
 return available[crypto.getRandomValues(new Uint32Array(1))[0]%available.length];
}
