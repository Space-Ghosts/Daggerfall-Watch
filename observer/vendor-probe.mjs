import {readFile} from 'node:fs/promises';
const s=JSON.parse(await readFile(new URL('./private/session.json',import.meta.url),'utf8'));
const r=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/market/vendors',{method:'POST',headers:{Authorization:`Bearer ${s.secret}`,'Content-Type':'application/json'},body:JSON.stringify({region:20}),signal:AbortSignal.timeout(15000)});
const d=await r.json();console.log(JSON.stringify({http:r.status,error:['prof-need-account','market-closed','rate'].includes(d.error)?d.error:d.error?'request-refused':null,rows:Array.isArray(d.rows)?d.rows.length:null}));
