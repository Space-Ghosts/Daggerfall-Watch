import {readFile,writeFile} from 'node:fs/promises';
const session=JSON.parse(await readFile('/home/ryan/dfotimer-observer/private/session.json','utf8'));
const r=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/seats/list',{method:'POST',headers:{Authorization:`Bearer ${session.secret}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000),redirect:'error'});
const d=await r.json();console.log(JSON.stringify({status:r.status,error:typeof d.error==='string'?d.error:null,keys:Object.keys(d),seats:Array.isArray(d.seats)?d.seats.length:null,firstSeatKeys:Object.keys(d.seats?.[0]||{})}));
if(r.ok&&!d.error)await writeFile('/home/ryan/dfotimer-release/guild-seat-list.json',JSON.stringify({seats:d.seats}),{mode:0o600});
