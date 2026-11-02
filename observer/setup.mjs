import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile), root=new URL('./private/',import.meta.url), session=new URL('session.json',root);
const csrf=randomBytes(32).toString('hex'), origin='http://127.0.0.1:18790';
let busy=false;
const page=(body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DFO observer setup</title><body><main><h1>DFO observer guest</h1>${body}</main></body></html>`;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
 if(req.headers.host!=='127.0.0.1:18790'){res.writeHead(403);return res.end('Forbidden');}
 let exists=false;try{await access(session);exists=true}catch{}
 if(req.method==='GET'&&req.url==='/')return res.end(page(exists?'<p>A guest session is saved on Homesec. Setup is complete.</p>':`<p>Create one guest account for the read-only event observer on Homesec. Its session stays private on Homesec; only event status is published.</p><p>This guest will appear as a normal online account. It will not move, fight, send chat, or collect rewards.</p><form method="post" action="/create"><input type="hidden" name="csrf" value="${csrf}"><p><label><input type="checkbox" name="terms" value="yes" required> I agree to the game’s <a href="https://daggerfalljs.dev/terms/" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="https://daggerfalljs.dev/privacy/" target="_blank" rel="noopener noreferrer">Privacy Policy</a> (17 October 2026).</label></p><button>Create observer guest</button></form>`));
 if(req.method!=='POST'||req.url!=='/create'){res.writeHead(404);return res.end('Not found');}
 if(req.headers.origin!==origin||exists||busy){res.writeHead(403);return res.end('Unavailable');}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>1024){res.writeHead(413);return res.end('Too large');}}
 const form=new URLSearchParams(body);if(form.get('csrf')!==csrf||form.get('terms')!=='yes'){res.writeHead(403);return res.end('Agreement required');}
 busy=true;
 try{
  const reply=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/auth/guest',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({label:'DFO Timer observer',terms:'2026-10-17',privacy:'2026-10-17'}),signal:AbortSignal.timeout(15000)});
  const data=await reply.json();if(!reply.ok||typeof data.secret!=='string'||typeof data.id!=='string')throw Error('Guest request was refused. Check the current game terms before retrying.');
  await mkdir(root,{recursive:true,mode:0o700});
  await writeFile(session,JSON.stringify({id:data.id,name:data.name,secret:data.secret,sessionId:data.sessionId,peerId:randomBytes(16).toString('hex'),peerSecret:randomBytes(24).toString('hex')}),{mode:0o600,flag:'wx'});
  await run('systemctl',['--user','start','dfotimer-observer.service']);
  res.end(page('<p>Guest saved securely. The observer is starting on Homesec.</p><p>You can close this setup tab and return to your timer.</p>'));
  setTimeout(()=>server.close(),1000).unref();
 }catch{res.writeHead(502);res.end(page('<p>Setup did not finish. No credentials are displayed here. If a guest was saved, reloading will show that; otherwise try again after checking the game terms.</p>'));}finally{busy=false;}
});
server.listen(18790,'127.0.0.1',()=>console.log('Private setup listening on loopback port 18790'));
