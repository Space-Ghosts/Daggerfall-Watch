import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

// Read-only endpoints, paced across calls AND retries. Never log tokens, response
// bodies, raw errors, or request bodies. A fingerprint identifies a failed shop.
export function createMarketReader({secret,fetchImpl=fetch,wait=sleep,clock=Date.now,log=()=>{},retryBudget=40}={}){
 let requests=0,retries=0;
 const stats={requests:0,retries:0,recovered:0,failed:0,failures:{}};
 const fail=(kind,{status=null,retryable=false,fatal=false}={})=>Object.assign(Error('Market read failed: '+kind),{kind,status,retryable,fatal});
 const classify=e=>e?.kind?e:fail(e?.name==='TimeoutError'||e?.name==='AbortError'?'timeout':e?.name==='SyntaxError'?'invalid-json':e instanceof TypeError?'network':'unexpected',{retryable:['TimeoutError','AbortError','SyntaxError','TypeError'].includes(e?.name)});
 const call=async(path,body)=>{
  if(!['vendors','vendor'].includes(path))throw fail('unsupported-read',{fatal:true});
  const context=path==='vendors'?{region:body.region}:{shop:createHash('sha256').update(JSON.stringify([body.vendor?.map,body.vendor?.id])).digest('hex').slice(0,16)};
  for(let attempt=1;attempt<=3;attempt++){
   if(requests++)await wait(attempt===1?2000:attempt===2?4000:10000);
   const started=clock();let status=null;
   stats.requests++;
   try{
    const response=await fetchImpl(`https://daggerfall-accounts.mackcothran.workers.dev/v1/market/${path}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
    status=response.status;
    if(!response.ok){
     await response.body?.cancel().catch(()=>{});
     throw fail('http',{status,fatal:[401,403,429].includes(status),retryable:status===408||status>=500&&status<=599});
    }
    let size=0;const chunks=[];
    for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw fail('response-too-large');chunks.push(chunk);}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(data?.error){
     if(path==='vendor'&&data.error==='vendor-gone')return data;
     throw fail('game-refused',{fatal:true,status});
    }
    if(!Array.isArray(data?.rows)||path==='vendor'&&(data.vendor?.map!==body.vendor?.map||data.vendor?.id!==body.vendor?.id))throw fail('invalid-response',{status,retryable:true});
    if(attempt>1){stats.recovered++;log({event:'market_read_recovered',endpoint:path,...context,attempt,status,elapsedMs:clock()-started});}
    return data;
   }catch(raw){
    const e=classify(raw),retry=e.retryable&&!e.fatal&&attempt<3&&retries<retryBudget;
    const reason=e.kind+(e.status??status?':'+(e.status??status):'');stats.failures[reason]=(stats.failures[reason]??0)+1;
    log({event:'market_read_failed',endpoint:path,...context,attempt,kind:e.kind,status:e.status??status,elapsedMs:clock()-started,retry,backoffMs:retry?(attempt===1?4000:10000):null,fatal:e.fatal});
    if(!retry){stats.failed++;throw e;}
    retries++;stats.retries++;
   }
  }
 };
 return {call,stats};
}
