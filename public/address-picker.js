let loading;
export async function pickAddress(container,oncomplete){
 const ready=()=>window.kakao?.Postcode||window.daum?.Postcode;
 if(!ready()){
  if(!loading)loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();reject(new Error('주소 검색 연결이 늦어지고 있어요. 다시 시도해 주세요.'));},15000);
   script.src='https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('주소 검색을 불러오지 못했어요. 다시 시도해 주세요.'));};document.head.append(script);
  }).catch(e=>{loading=null;throw e;});
  await loading;
 }
 const Postcode=ready();if(!Postcode)throw new Error('주소 검색을 불러오지 못했어요.');
 container.replaceChildren();new Postcode({width:'100%',height:'100%',oncomplete:data=>oncomplete({roadAddress:data.roadAddress||data.autoRoadAddress||'',jibunAddress:data.jibunAddress||data.autoJibunAddress||'',buildingName:data.buildingName||'',sido:data.sido||'',sigungu:data.sigungu||'',bname:data.bname||''})}).embed(container);
}
