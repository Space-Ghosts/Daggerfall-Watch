// Read-only town layout stamps. Never export credentials or home ownership.
import {readFile,writeFile} from 'node:fs/promises';
const session=JSON.parse(await readFile(new URL('./private/session.json',import.meta.url),'utf8'));
const response=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/homes/layouts',{method:'POST',headers:{Authorization:`Bearer ${session.secret}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000),redirect:'error'});
if(!response.ok)throw Error(`Layout read HTTP ${response.status}`);
const data=await response.json();
// Output only shape until the response contract has been confirmed.
console.log(JSON.stringify({keys:Object.keys(data),arrays:Object.fromEntries(Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,{count:v.length,firstKeys:v[0]?Object.keys(v[0]):[]}]))}));
const rows=data.towns;
if(!Array.isArray(rows))throw Error('Unknown layout response');
const towns=rows.map(r=>({mapId:r[0],layout:r[1]??null}));
if(towns.some(r=>!Number.isSafeInteger(r.mapId)))throw Error('Invalid layout identity');
await writeFile('/home/ryan/dfotimer-release/map-layouts.json',JSON.stringify({updatedAt:Date.now(),towns}),{mode:0o600});
