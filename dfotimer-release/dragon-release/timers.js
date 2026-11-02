import {dragonState} from './dragon.js?v=dragon-20261029';
import {eventLane,ketchStation} from './event-regions.js?v=tamriel-20261028';
// UTC schedule derived from DFO wire.js and world-event rules. No server kill-state is inferred.
export const FESTIVAL_START = Date.UTC(2026,9,20);
export const FESTIVAL_END = Date.UTC(2026,10,8);
export const KETCH_EPOCH = Date.UTC(2026,9,25);
export const KETCH_PERIOD = 36000000;
export function periodic(now, period, offset, duration) {
  const start = Math.floor((now-offset)/period)*period+offset;
  return {start,next:start+period,active:now>=start&&now<start+duration,end:start+duration};
}
export function eventState(event, now=Date.now(), observations={}) {
  if(event.id==='dwarven-dragon')return dragonState(now);
  const lane=eventLane(event.lane);
  if(lane===9&&['gate','abyss','raids','starfall','sky-ketch'].includes(event.id))return {kind:'unknown',label:'NOT IN THIS PROVINCE',text:'No event',sub:'Cyrodiil is excluded from these world events'};
  if(event.id==='sky-ketch') {
    const station=ketchStation(lane), epoch=KETCH_EPOCH+[0,2,3,4,5,6,7,8].indexOf(station.lane)*4500000;
    let n=Math.max(0,Math.floor((now-(epoch-3600000))/KETCH_PERIOD));
    let arrival=epoch+n*KETCH_PERIOD;
    if(now>=arrival+27900000){n++;arrival=epoch+n*KETCH_PERIOD;}
    if(now<arrival)return {kind:'next',label:now>=arrival-3600000?'SCHEDULED SIGHTING · ARRIVES IN':'NEXT SCHEDULED ARRIVAL',target:arrival,next:arrival,sub:new Date(arrival).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'})+' · up to 8 players'};
    if(now<arrival+25200000)return {kind:'window',label:'SCHEDULED BOARDING CLOSES IN',target:arrival+25200000,next:arrival+KETCH_PERIOD,sub:`Anchor-lift in ${station.city} · seven-hour boarding window`};
    return {kind:'window',label:'DEPARTURE WINDOW · ENDS IN',target:arrival+27900000,next:arrival+KETCH_PERIOD,sub:'No new boarding · crews aboard have 45 minutes to finish'};
  }
  let p;
  if(event.id==='gate') p=periodic(now,7200000,1950000+lane*720000,1200000);
  if(event.id==='serpent') p=periodic(now,14400000,11850000,1500000);
  if(event.id==='aether-storm') p=periodic(now,7200000,0,3000000);
  if(event.id==='treasure-fleet') p=periodic(now,10800000,3600000,5400000);
  if(p) return {kind:p.active?'window':'next',label:p.active?'SCHEDULED WINDOW':'NEXT SCHEDULED START',target:p.active?p.end:p.next,next:p.next,sub:p.active?(event.id==='aether-storm'?'Scheduled storm end · verify in game':event.id==='treasure-fleet'?'Window end · fleet may already be scattered':'Window end · boss may already be defeated'):new Date(p.next).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'})};
  if(event.id==='starfall') {
    if(now>=FESTIVAL_END) return {kind:'unknown',label:'SEASON ENDED',text:'Awaiting next festival',sub:'Published festival ended 8 Nov 2026 UTC'};
    if(now<FESTIVAL_START) return {kind:'next',label:'FESTIVAL BEGINS',target:FESTIVAL_START,sub:'20 October 2026 UTC'};
    const hour=Math.floor(now/3600000)*3600000;
    const times=[-1,0,1].flatMap(h=>[0,2700000,3150000].map(m=>hour+h*3600000+m)).filter(t=>t>=FESTIVAL_START&&t<FESTIVAL_END).sort((a,b)=>a-b);
    const recent=times.filter(t=>t<=now).at(-1), next=times.find(t=>t>now);
    if(recent!==undefined&&now<recent+900000) return {kind:'window',label:'SCHEDULED STARFALL WINDOW',target:Math.min(recent+900000,FESTIVAL_END),next,sub:'Window end · collection status unavailable'};
    return next?{kind:'next',label:'NEXT SCHEDULED LANDING',target:next,next,sub:':00, :45 and :52:30 each UTC hour'}:{kind:'unknown',label:'FESTIVAL ENDING',text:'No further landings',sub:'Awaiting the next festival'};
  }
  return {kind:'unknown',label:event.id==='abyss'?'SERVER-TIMED EVENT':'IN-GAME TIMING REQUIRED',text:event.id==='abyss'?'Awaiting server':'Check in game',sub:event.timingShort||'No public live status feed is connected'};
}
export function countdown(target,now=Date.now()) { const s=Math.max(0,Math.ceil((target-now)/1000)); const h=Math.floor(s/3600);return `${String(h).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
