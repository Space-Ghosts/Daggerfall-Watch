import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile), file=new URL('./private/session.json',import.meta.url), next=new URL('./private/session.next.json',import.meta.url);
const csrf=randomBytes(32).toString('hex'), origin='http://127.0.0.1:18791';let busy=false,finished=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=body=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Observer vendor access</title><body><main><h1>Enable vendor-directory access</h1>${body}</main></body></html>`;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
 if(req.headers.host!=='127.0.0.1:18791'){res.writeHead(403);return res.end('Forbidden');}
 if(req.method==='GET'&&req.url==='/')return res.end(page(finished?'<p>Observer account upgraded. You can close this page.</p>':`<p>The game allows registered accounts to browse player vendors. This upgrades the dedicated Event Watcher guest; your main game account is not used.</p><p>Choose a unique username and password for the observer. The password is sent over HTTPS to DFO Online and is not stored on Homesec. Its session stays in the observer’s private directory.</p><form method="post" action="/register"><input type="hidden" name="csrf" value="${csrf}"><p><label>Observer username <input name="handle" autocomplete="username" maxlength="32" required></label></p><p><label>Password <input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="256" required></label></p><p><label>Confirm password <input type="password" name="confirm" autocomplete="new-password" minlength="8" maxlength="256" required></label></p><p><label><input type="checkbox" name="terms" value="yes" required> I agree to DFO Online’s <a href="https://daggerfalljs.dev/terms/" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="https://daggerfalljs.dev/privacy/" target="_blank" rel="noopener noreferrer">Privacy Policy</a> (17 October 2026).</label></p><button>Upgrade observer account</button></form>`));
 if(req.method!=='POST'||req.url!=='/register'){res.writeHead(404);return res.end('Not found');}
 if(req.headers.origin!==origin||busy||finished){console.log('Setup request declined:',JSON.stringify({origin:req.headers.origin??null,busy,finished}));res.writeHead(403);return res.end('Unavailable');}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){res.writeHead(413);return res.end('Too large');}}
 const f=new URLSearchParams(body);body='';if(f.get('csrf')!==csrf||f.get('terms')!=='yes'){res.writeHead(403);return res.end('Agreement required');}
 if(!f.get('handle')||!f.get('password')||f.get('password')!==f.get('confirm')){res.writeHead(400);return res.end(page('<p>Username and matching passwords are required. Return to the form and try again.</p>'));}
 busy=true;
 try{
  const session=JSON.parse(await readFile(file,'utf8'));
  if(session.kind==='linked')throw Error('already-linked');
  const response=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/auth/register',{method:'POST',headers:{Authorization:`Bearer ${session.secret}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({handle:f.get('handle'),password:f.get('password'),terms:'2026-10-17',privacy:'2026-10-17',set:true}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok||data.error){const known=new Set(['handle-taken','handle','password','password-short','terms-stale','rate','account-linked']);res.writeHead(400);return res.end(page(`<p>The game refused registration (${esc(known.has(data.error)?data.error:'request refused')}). Return to the form to check your username, password and agreement.</p>`));}
  // Register upgrades the existing account; it returns recovery codes and handle,
  // while the existing session secret and character remain valid.
  if(typeof data.handle!=='string')throw Error('unexpected-registration');
  await writeFile(next,JSON.stringify({...session,name:data.handle,kind:'linked'}),{mode:0o600});await chmod(next,0o600);await rename(next,file);finished=true;
  await run('systemctl',['--user','restart','dfotimer-observer.service']);
  const codes=Array.isArray(data.recoveryCodes)?data.recoveryCodes:typeof data.recoveryCode==='string'?[data.recoveryCode]:[];
  res.end(page('<p>Observer account upgraded. The vendor scanner can now use this account.</p>'+(codes.length?'<h2>Save your recovery codes privately</h2><p>They are shown only in this response. Do not paste them into chat.</p><ul>'+codes.map(c=>'<li><code>'+esc(c)+'</code></li>').join('')+'</ul>':'')+'<p>You can close this tab after saving your recovery information.</p>'));
  setTimeout(()=>server.close(),1000).unref();
 }catch{res.writeHead(502);res.end(page('<p>Setup could not finish. Your password was not saved. Check the observer status before retrying.</p>'));}finally{f.delete('password');f.delete('confirm');busy=false;}
});
server.listen(18791,'127.0.0.1',()=>console.log('Private vendor setup ready'));
