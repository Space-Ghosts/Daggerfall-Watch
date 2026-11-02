import {readFile,writeFile,rename,mkdir,chmod} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {publicSeat,publicStanding,buildGuildSnapshot} from './guild-core.mjs';
const home='/home/ryan/dfotimer-observer',dir=home+'/private/guilds',out='/var/www/lastlife-hub/daggerfall/guilds/data.json';
await mkdir(dir,{recursive:true,mode:0o700});
const session=JSON.parse(await readFile(home+'/private/session.json','utf8'));
const startedAt=new Date().toISOString();let reads={},seats=[],week=null,failed=0,stopped=null,requests=0,consecutive=0;
try{reads=JSON.parse(await readFile(dir+'/state.json','utf8'));}catch{}
async function call(path,body){
 for(let attempt=0;attempt<2;attempt++){
  if(requests++)await sleep(attempt?6000:1500);
  try{
   const r=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/seats/'+path,{method:'POST',headers:{Authorization:`Bearer ${session.secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});
   if(!r.ok){await r.body?.cancel();throw Object.assign(Error('http-'+r.status),{fatal:[401,403,429].includes(r.status)});}
   const chunks=[];let size=0;for await(const part of r.body){size+=part.length;if(size>12*1024*1024)throw Error('response-too-large');chunks.push(part);}
   const d=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(d.error)throw Object.assign(Error('game-read-refused'),{fatal:true});return d;
  }catch(e){if(e.fatal||attempt)throw e;}
 }
}
async function publish(complete=false){
 const snapshot=buildGuildSnapshot({seats,reads,week,startedAt,now:new Date().toISOString(),complete,failed,error:stopped});
 await writeFile(dir+'/state.next',JSON.stringify(reads),{mode:0o600});await rename(dir+'/state.next',dir+'/state.json');
 await writeFile(out+'.next',JSON.stringify(snapshot),{mode:0o644});await chmod(out+'.next',0o644);await rename(out+'.next',out);
 console.log(JSON.stringify({event:'guild_scan_progress',checked:snapshot.coverage.seatsChecked,expected:snapshot.coverage.seatsExpected,guilds:snapshot.guilds.length,failed,complete,error:stopped}));
}
try{
 const d=await call('list',{});if(!Array.isArray(d.seats)||!d.seats.length)throw Error('invalid-seat-list');
 seats=d.seats.map(publicSeat).filter(Boolean);
 const queue=seats.filter(s=>s.state==='confirmed').sort((a,b)=>Number(!!b.holder)-Number(!!a.holder)||Number(!!reads[b.key]?.rows?.length)-Number(!!reads[a.key]?.rows?.length)||(reads[a.key]?.checkedAt||'').localeCompare(reads[b.key]?.checkedAt||''));
 const allowed=new Set(queue.map(s=>String(s.key)));reads=Object.fromEntries(Object.entries(reads).filter(([k])=>allowed.has(k)));
 for(let i=0;i<queue.length;i++){
  if(Date.now()-Date.parse(startedAt)>44*60*1000){stopped='scan-budget';await publish();break;}
  const seat=queue[i];
  try{
   const r=publicStanding(await call('standings',{key:seat.key}),seat.key,new Date().toISOString());
   if(week!==null&&week!==r.week){stopped='week-changed';throw Object.assign(Error('week-changed'),{fatal:true});}
   week=r.week;reads[seat.key]=r;consecutive=0;
  }catch(e){failed++;consecutive++;delete reads[seat.key];if(e.fatal||consecutive>=5){stopped=e.fatal&&/^http-\d+$/.test(e.message)?e.message:stopped||'reads-unavailable';throw e;}}
  if(i===0||(i+1)%25===0)await publish();
 }
 if(!stopped)await publish(true);
}catch{
 if(seats.length&&week!==null){stopped||='reads-unavailable';await publish();}
 console.log(JSON.stringify({event:'guild_scan_stopped',cause:stopped||'initial-read-unavailable',failed}));process.exitCode=1;
}
