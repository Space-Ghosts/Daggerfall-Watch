import WebSocket from 'ws';
import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {project,merge} from './projection.mjs';
import {createDragonMonitor} from './dragon-monitor.mjs';
const session=JSON.parse(await readFile(new URL('./private/session.json',import.meta.url),'utf8'));
const output=process.env.DFO_OUTPUT||'/var/www/lastlife-hub/daggerfall/live.json';
const dragonMonitor=createDragonMonitor('/srv/dfo-dragon-private/status.json');
let socket,stopping=false,halted=false,connected=false,lastMessageAt=0,attempt=0,room='chat:world',events={},writeQueue=Promise.resolve();
function publish(){const snapshot=JSON.stringify({version:1,connected,updatedAt:Date.now(),lastMessageAt,events});writeQueue=writeQueue.then(async()=>{await writeFile(output+'.tmp',snapshot,{mode:0o644});await chmod(output+'.tmp',0o644);await rename(output+'.tmp',output)}).catch(()=>console.error('Public status write failed'));}
async function connect(){
 if(stopping||halted)return;
 try{
  const response=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/auth/token',{method:'POST',headers:{Authorization:`Bearer ${session.secret}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(session.character?{character:session.character}:{}),signal:AbortSignal.timeout(15000)});
  if(response.status===401||response.status===403){halted=true;console.error('Guest authentication requires attention');publish();return;}
  const data=await response.json();if(!response.ok||typeof data.token!=='string')throw Error('token');
  socket=new WebSocket(`wss://daggerfall-online.mackcothran.workers.dev/room/${room}`,{maxPayload:1024*1024,handshakeTimeout:15000,perMessageDeflate:false});
  const ws=socket;let hop=false,received=Date.now();
  // A fresh handshake periodically refreshes account activity and event snapshots.
  const renew=setTimeout(()=>ws.close(),6*60*60*1000);
  ws.on('open',()=>ws.send(JSON.stringify({t:'hello',id:session.peerId,secret:session.peerSecret,name:session.name||'Guest',look:{race:'Breton',gender:'male',faceIndex:0,items:[]},pose:null,tok:data.token,hs:1})));
  ws.on('message',raw=>{
   let m;try{m=JSON.parse(raw.toString())}catch{return;}
   received=Date.now();
   if(m.t==='error'){
    const known=['bad look','bad id','bad secret','bad token','token spent','token expired','token claims','token signature','sign in to play online','sign-ins cannot be checked right now','online in another tab, window or device','banned','busy','hello too large'];
    let diagnostic=typeof m.m==='string'?m.m:'unknown';
    for(const privateValue of [data.token,session.secret,session.id,session.name,session.peerId,session.peerSecret])if(privateValue)diagnostic=diagnostic.replaceAll(privateValue,'[redacted]');
    diagnostic=diagnostic.replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,180);
    const reason=known.includes(m.m)?m.m:diagnostic;
    console.error('Server handshake refused:',reason);
   }
   if(m.t==='hub'&&/^chat:world(?:\.(?:[0-9]|1[0-5]))?$/.test(m.key)){room=m.key;hop=true;ws.close();return;}
   if(m.t==='welcome'){connected=true;events={};lastMessageAt=received;attempt=0;console.log('Observer connected');}
   if(connected){lastMessageAt=received;merge(events,project(m));}
   dragonMonitor.onMessage(ws,m);
   if(m.t==='no'||m.t==='freeze'){halted=true;ws.close();console.error('Server refused or paused observer; manual attention required');}
  });
  const ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN){if(Date.now()-received>90000){ws.terminate();return;}dragonMonitor.tick(ws,connected);ws.send('{"t":"ping"}');}publish();},20000);
  ws.on('error',()=>{});
  ws.on('close',code=>{clearInterval(ping);clearTimeout(renew);connected=false;dragonMonitor.disconnect();publish();console.log('Socket closed:',code);if([4000,4002,4003,1008].includes(code))halted=true;if(!stopping&&!halted)setTimeout(connect,hop?1000:Math.min(300000,5000*2**Math.min(attempt++,6))+Math.random()*1000);else console.log('Observer stopped; manual attention may be required');});
 }catch{connected=false;publish();if(!stopping&&!halted)setTimeout(connect,Math.min(300000,5000*2**Math.min(attempt++,6)));}
}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{stopping=true;connected=false;socket?.close();publish();await writeQueue;process.exit(0)});
dragonMonitor.publish();publish();connect();
