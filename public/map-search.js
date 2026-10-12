export function mapSearchUrl(center,query){
  const lng=Number(center.lng),lat=Number(center.lat);
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>=85)throw new Error('검색할 중심 위치를 먼저 선택해 주세요.');
  const x=lng*20037508.34/180,y=Math.log(Math.tan((90+lat)*Math.PI/360))*20037508.34/Math.PI;
  return 'https://map.naver.com/p/search/'+encodeURIComponent(query)+`?c=${x},${y},16,0,0,0,dh&searchCoord=${lng}%3B${lat}`;
}
