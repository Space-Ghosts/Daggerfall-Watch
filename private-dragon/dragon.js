import {validCatalogue,dragonLocation,townDirection} from './dragon-site.js';
const $=id=>document.getElementById(id);let snapshot=null,catalogue=null,catalogueIssue='Map catalogue has not been installed yet.',latestLoc=null;
const date=n=>Number.isFinite(n)?new Date(n).toLocaleString(): '—';
const as=n=>Number.isFinite(n)?String(n):'—';
function draw(){
  const s=snapshot,now=Date.now(),d=s?.dragon??s?.previous,up=s?.connected&&now-s.updatedAt<75000;
  const old=!s?.dragon&&!!s?.previous;
  $('connected').textContent=up?'Observer online':'Observer offline or stale';
  $('province').textContent=d?.province??'—';$('variant').textContent=d?.variant??'—';
  $('landing').textContent=date(d?.landAt);$('departure').textContent=date(d?.leaveAt);
  const loc=dragonLocation(d,catalogue);latestLoc=loc;
  $('tile').textContent=loc?`${loc.px}, ${loc.py}`:'—';
  $('native').textContent=loc?`${loc.sx}, ${loc.sz}`:'—';
  $('town').textContent=loc?.town?.name??'—';
  const dir=townDirection(loc);
  $('bearing').textContent=dir?`${dir.compass} · ${dir.bearing}° · ${dir.distanceKm.toFixed(2)} km`:'—';
  $('copy-location').disabled=!loc;
  $('location-status').textContent=loc?(old?'Last detected dragon · source-derived map tile':'Source-derived exact map tile'):
      d?(catalogue?'No matching region in the imported catalogue.':'Coordinates unavailable: '+catalogueIssue):
      (catalogue?'Waiting for a server-confirmed dragon.':'Coordinates require one-time original game-map scan.');
  $('note').textContent=s?.note??'Waiting for status.';
  if(!up){$('status').textContent='No current observer connection';$('message').textContent='Cannot confirm current dragon status.';}
  else if(s?.dragon&&now<s.dragon.leaveAt){$('status').textContent='Spawn confirmed';$('message').textContent=`${d.variant} spawned in ${d.province}. It may already have been defeated.`;}
  else if(d){$('status').textContent='Last detected spawn';$('message').textContent='This spawn may be over. Location is retained for reference.';}
  else if(s.status==='quiet'){$('status').textContent='No dragon this hour';$('message').textContent='The server responded that this watch is quiet.';}
  else{$('status').textContent='Awaiting server omen';$('message').textContent='The relay does not reveal the next dragon before it lands.';}
}
async function poll(){try{const r=await fetch('status.json',{cache:'no-store',signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('status HTTP '+r.status);const s=await r.json();snapshot=s.version===2?s:null;}catch{snapshot=null;}draw();}
async function loadMap(){
  try{const r=await fetch('location-catalog.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('catalogue HTTP '+r.status);
    const c=await r.json();if(!validCatalogue(c))throw Error('catalogue invalid or incomplete');
    catalogue=c;catalogueIssue='';
  }catch(e){catalogue=null;catalogueIssue=String(e?.message||'not loaded');}draw();
}
$('copy-location').addEventListener('click',()=>{
  if(!latestLoc)return;
  const l=latestLoc;
  const text=`DFO Dwarven Dragon · map tile X=${l.px}, Y=${l.py} · native X=${l.sx}, Z=${l.sz}${l.town?' · near '+l.town.name:''}`;
  navigator.clipboard?.writeText(text).then(()=>$('copy-location').textContent='Copied!').catch(()=>{});
  setTimeout(()=>$('copy-location').textContent='Copy coordinates',2000);
});
poll();loadMap();setInterval(poll,15000);setInterval(draw,1000);setInterval(()=>{if(!catalogue)loadMap();},300000);
