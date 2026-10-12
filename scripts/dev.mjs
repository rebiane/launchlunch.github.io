import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {stat} from 'node:fs/promises';
const scraperUrl=new URL('../src/map-scrape.js',import.meta.url),addressUrl=new URL('../src/map-address.js',import.meta.url);
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const {chromium}=await import(process.env.LAUNCHLUNCH_PLAYWRIGHT||'playwright');
const pending=new Set();let stopping=false;
const server=createServer(async(req,res)=>{
 if(req.method!=='POST'){res.writeHead(405).end();return;}
 if(pending.size){res.writeHead(429).end();return;}
 let browser;
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw new Error('요청 크기 초과');}
  const input=JSON.parse(raw);if(input.kind!=='address'&&(!input.center||Math.abs(Number(input.center.lat))>90||Math.abs(Number(input.center.lng))>180))throw new Error('위치 오류');
  pending.add(req);
  const chrome=process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  browser=await chromium.launch({headless:true,...(chrome?{channel:'chrome'}:{})});
  const timeout=setTimeout(()=>browser.close().catch(()=>{}),35000);
  try{const file=input.kind==='address'?addressUrl:scraperUrl;const {mtimeMs}=await stat(file);const module=await import(`${file.href}?v=${mtimeMs}`);const result=input.kind==='address'?await module.scrapeAddress(browser,input.address):await module.scrapeMap(browser,input);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));}
  finally{clearTimeout(timeout);}
 }catch{res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'지도 수집을 완료하지 못했습니다.'}));}
 finally{pending.delete(req);await browser?.close().catch(()=>{});}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url=`http://127.0.0.1:${server.address().port}`;
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),'dev','--ip','127.0.0.1','--port','8787','--var',`LOCAL_SCRAPER_URL:${url}`],{cwd:root,stdio:'inherit'});
function close(){if(stopping)return;stopping=true;child.kill('SIGTERM');server.close();}
process.on('SIGINT',close);process.on('SIGTERM',close);child.on('exit',code=>{server.close();process.exitCode=code||0;});
