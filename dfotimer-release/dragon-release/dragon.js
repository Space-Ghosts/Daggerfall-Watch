// DFO dragonLaw.js / gateHash, MIT, Lattymoy; source 50417cc24a5634682f64b8bdc3bd2b587a98381f.
// Predicted encounters, not a report that a dragon is alive.
import {EVENT_REGIONS} from './event-regions.js?v=tamriel-20261028';
export const DRAGON_WATCH_MS=3600000,DRAGON_LAND_AT_MS=900000,DRAGON_STAY_MS=2400000,DRAGON_CLIMB_MS=15000;
export function dragonRoll(w,k){let h=0x811c9dc5;for(const n of [0xd7a6,w,k]){h^=n>>>0;h=Math.imul(h,0x01000193);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;}return h>>>0;}
export const isDragonWatch=w=>Number.isSafeInteger(w)&&w>=0&&dragonRoll(w,0)%3===0;
export const dragonLaneOf=w=>dragonRoll(w,2)%9;
export const dragonShinyOf=w=>dragonRoll(w,1)%20===0;
export function dragonAt(now){let w=Math.floor(now/DRAGON_WATCH_MS);if(!isDragonWatch(w)||now>=w*DRAGON_WATCH_MS+DRAGON_LAND_AT_MS+DRAGON_STAY_MS+DRAGON_CLIMB_MS){for(let k=0;k<256&&!isDragonWatch(++w);)k++;}const landAt=w*DRAGON_WATCH_MS+DRAGON_LAND_AT_MS;return {w,landAt,leaveAt:landAt+DRAGON_STAY_MS,lane:dragonLaneOf(w),shiny:dragonShinyOf(w)};}
export function dragonState(now=Date.now()){
 const d=dragonAt(now),where=EVENT_REGIONS[d.lane],variant=d.shiny?'Aetherbright':'Dwarven Dragon';
 if(now<d.landAt)return {kind:'next',label:'PREDICTED LANDING',target:d.landAt,sub:`${variant} · ${where} · ${new Date(d.landAt).toLocaleString()}`};
 if(now<d.leaveAt)return {kind:'window',label:'PREDICTED ENCOUNTER WINDOW',target:d.leaveAt,sub:`${variant} · ${where} · may already be defeated`};
 return {kind:'window',label:'PREDICTED DEPARTURE',target:d.leaveAt+DRAGON_CLIMB_MS,sub:`${where} · climbing away if still alive`};
}
export function dragonLocation(catalog,now=Date.now()){
 const d=dragonAt(now),s=catalog?.version===1?catalog.sites?.[d.w]:null;
 if(!s||s.w!==d.w||s.lane!==d.lane||!Number.isInteger(s.px)||!Number.isInteger(s.py))return {d,text:`${EVENT_REGIONS[d.lane]} · exact site unavailable`,detail:'Province predicted from game rules. No verified local landmark is available for this encounter.'};
 const town=s.town;let route='';
 if(town&&Number.isInteger(town.px)&&Number.isInteger(town.py)){
  const dx=s.px-town.px,dy=s.py-town.py;
  const bearing=['north','northeast','east','southeast','south','southwest','west','northwest'][(Math.round(Math.atan2(dx,-dy)/(Math.PI/4))+8)%8];
  const steps=[dx?`${Math.abs(dx)} map tile${Math.abs(dx)===1?'':'s'} ${dx<0?'west':'east'}`:'',dy?`${Math.abs(dy)} map tile${Math.abs(dy)===1?'':'s'} ${dy<0?'north':'south'}`:''].filter(Boolean);
  route=steps.length?`From ${town.name}, travel ${bearing}: ${steps.join(' and ')} (about ${(Math.hypot(dx,dy)*.8192).toFixed(1)} km from the town’s map-tile centre). `:`Search the map tile containing ${town.name}. `;
 }
 return {d,site:s,text:`${s.place||s.near||EVENT_REGIONS[d.lane]} · tile ${s.px}, ${s.py}`,detail:route+`Predicted site at world-map tile (${s.px}, ${s.py}), near its centre. Look for the dragon circling overhead. This is a source-derived prediction, not a confirmed sighting or a live position.`};
}
