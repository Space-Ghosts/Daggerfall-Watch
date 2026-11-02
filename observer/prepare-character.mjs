// One-time normal realm registration for the dedicated observer guest.
// Never uploads saves, invents stats, awards items, or reuses a personal character.
import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
const file=new URL('./private/session.json',import.meta.url), temp=new URL('./private/session.next.json',import.meta.url);
const session=JSON.parse(await readFile(file,'utf8'));
if(session.character){console.log('Observer character already registered');process.exit(0);}
async function call(path,body){
 const response=await fetch('https://daggerfall-accounts.mackcothran.workers.dev'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.secret}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok||data.error)throw Error('Realm request refused (HTTP '+response.status+')');return data;
}
const listed=await call('/v1/realm');
if(!Array.isArray(listed.characters)||listed.characters.length)throw Error('Expected an empty dedicated guest; no character changed');
const created=await call('/v1/realm/create',{name:'Event Watcher',summary:null});
if(typeof created.id!=='string'||typeof created.lease!=='string')throw Error('Unexpected character response; inspect account before retrying');
session.character=created.id;
await writeFile(temp,JSON.stringify(session),{mode:0o600,flag:'wx'});await chmod(temp,0o600);await rename(temp,file);
console.log('Observer character registered through the game realm API');
