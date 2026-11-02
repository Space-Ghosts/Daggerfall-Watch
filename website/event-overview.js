import {EVENT_REGIONS,KETCH_STATIONS} from './event-regions.js?v=tamriel-20261028';
import {eventState} from './timers.js?v=dragon-private-20261030';
import {liveState} from './live.js?v=fronts-20261030';

export function timerTone(phase,target,now){
 if(phase==='now')return 'active';
 if(phase==='soon'&&Number.isFinite(target)&&target>now)return target-now<=1800000?'soon':'later';
 return 'unknown';
}

export function eventRows(event,{region='all',now=Date.now(),feed=null,catalog=null}={}){
 const provincial=['gate','abyss','starfall','raids'].includes(event.id);
 let lanes=provincial?[0,1,2,3,4,5,6,7,8]:event.id==='sky-ketch'?KETCH_STATIONS.map(s=>s.lane):[null];
 if(region!=='all'){
  const wanted=Number(region);
  lanes=lanes.filter(l=>l===null||l===(event.id==='sky-ketch'&&wanted===1?0:wanted));
 }
 return lanes.map(lane=>{
  const scoped={...event,lane:lane??0},scheduled=eventState(scoped,now),state=liveState(scoped,scheduled,feed,now);
  // A clear report is history, never proof of an active event. A server cooldown is upcoming.
  const confirmedOpen=event.id==='abyss'&&state.kind==='live'&&/^ABYSS (FOUND|RISEN)/.test(state.label);
  const active=state.kind==='window'||confirmedOpen;
  const phase=active?'now':state.target&&state.label!=='BOSS DEFEATED · COLLAPSES IN'?'soon':'reports';
  const badge=confirmedOpen?'Confirmed open':state.kind==='live'?(state.label==='SERVER COOLDOWN'?'Server cooldown':event.id==='raids'?'Clear reports':'Confirmed defeat'):state.target?'Predicted':'Timing unavailable';
  const station=KETCH_STATIONS.find(s=>s.lane===lane);
  const place=event.id==='sky-ketch'?`${station.city} · ${EVENT_REGIONS[lane]}`:lane===null?(event.id==='elite'?'Your company':'Across the sea regions'):EVENT_REGIONS[lane];
  return {key:`${event.id}:${lane??'global'}`,lane,place,phase,badge,state,tone:timerTone(phase,state.target,now)};
 }).sort((a,b)=>({now:0,soon:1,reports:2}[a.phase]-{now:0,soon:1,reports:2}[b.phase])||((a.state.target??Infinity)-(b.state.target??Infinity))||a.place.localeCompare(b.place));
}

export function overview(events,options={}){
 return events.map(event=>{
  const rows=eventRows(event,options);
  const bucket=rows.some(r=>r.phase==='now')?'now':rows.some(r=>r.phase==='soon')?'soon':'reports';
  return {event,rows,bucket,target:Math.min(...rows.map(r=>r.state.target??Infinity))};
 }).filter(group=>group.rows.length);
}
