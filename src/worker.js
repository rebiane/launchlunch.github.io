import { PlaceCatalog } from './catalog.js';
export { PlaceCatalog };
import { LunchRoom } from './room.js';
export { LunchRoom };
const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({error:'허용되지 않은 요청입니다.'},403);
    try {
      if (url.pathname === '/api/config') return json({naver:!!(env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET)});
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        if (Number(request.headers.get('Content-Length')) > 4096) return json({error:'요청이 너무 큽니다.'},413);
        const raw = await request.text();
        if (raw.length > 4096) return json({error:'요청이 너무 큽니다.'},413);
        const body = JSON.parse(raw);
        if (!/^[a-f0-9-]{36}$/.test(body.token || '')) return json({error:'참여자 정보가 올바르지 않습니다.'},400);
        const id = crypto.randomUUID().replaceAll('-','').slice(0,20);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(id));
        return stub.fetch(new Request('https://room/create',{method:'POST',body:JSON.stringify({...body,id})}));
      }
      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{20})\/ws$/);
      if (match && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        if (!origin) return json({error:'브라우저에서 참여해 주세요.'},403);
        return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
      }
      return json({error:'요청한 기능을 찾을 수 없습니다.'},404);
    } catch { return json({error:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},400); }
  }
};
