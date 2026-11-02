export const feedFresh=(feed,now=Date.now())=>feed?.version===1&&feed.connected===true&&Number.isFinite(feed.updatedAt)&&Number.isFinite(feed.lastMessageAt)&&now-feed.updatedAt<65000&&now-feed.lastMessageAt<90000&&feed.updatedAt<=now+10000&&feed.lastMessageAt<=now+10000;
const validTime=t=>Number.isSafeInteger(t)&&t>0;
export function liveState(event,scheduled,feed,now=Date.now()){
 if(!feedFresh(feed,now)||!feed.events||typeof feed.events!=='object')return scheduled;
 const data=feed.events;
 if(event.id==='abyss'){
  const a=data.abyss;if(!a||![a.at,a.until,a.next].every(validTime)||!['risen','found','fell','gone'].includes(a.phase))return scheduled;
  const end=validTime(a.fellAt)?a.fellAt+180000:a.until;
  if(a.phase==='gone'||now>=end)return now<a.next?{kind:'live',label:'SERVER COOLDOWN',target:a.next,sub:'Next scheduled rise from the server’s Abyss state'}:{kind:'unknown',label:'AWAITING SERVER UPDATE',text:'Checking next rise',sub:'Cooldown elapsed; opening is not yet confirmed'};
  if(a.phase==='fell')return {kind:'live',label:'BOSS DEFEATED · COLLAPSES IN',target:end,sub:'Confirmed by the game server'};
  return {kind:'live',label:a.phase==='found'?'ABYSS FOUND · EXPIRES IN':'ABYSS RISEN · EXPIRES IN',target:end,sub:`Server confirmed · ${a.phase==='found'?'found by players':'awaiting discovery'} · region ${a.region}`};
 }
 if(event.id==='gate'&&scheduled.kind==='window'&&validTime(data.gate?.at)){
  const start=scheduled.target-1200000;
  if(data.gate.at>=start&&data.gate.at<=now)return {kind:'live',label:'SERVER CONFIRMED',text:'Boss defeated',sub:'Next scheduled start '+new Date(scheduled.next).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})};
 }
 if(event.id==='raids'){
  const raids=recentEvents(data.raids,now);
  return {kind:'live',label:'LIVE RAID REPORTS',text:raids.length?`${raids.length} town${raids.length===1?'':'s'} cleared`:'Listening for clears',sub:raids.length?'Server reports from the last 4 hours · details in dossier':'Clear reports only; active town schedules still need map data'};
 }
 if(event.id==='serpent'||event.id==='starfall'){
  const rows=recentEvents(data[event.id==='serpent'?'serpent':'stars'],now).filter(x=>x.at>=now-(event.id==='serpent'?14400000:3600000));
  if(rows.length)return {...scheduled,sub:`${rows.length} ${event.id==='serpent'?'site defeat report(s) in the last 4 hours':'collected star report(s) in the last hour'} · other sites may remain active`};
 }
 return scheduled;
}
export function recentEvents(rows,now=Date.now()){
 return Array.isArray(rows)?rows.filter(x=>x&&validTime(x.at)&&x.at<=now&&now-x.at<14400000).slice(0,256):[];
}
