// DFO FRONTS 2026-10-29, mirrored from src/net/frontLaw.js and the WORLD5 clock.
// Source: Lattymoy/daggerfall-js-source. Scheduled predictions, NOT live spawn confirmation.
export const GAME_DAY_MS = 7_200_000;
export const EPOCH_MS = Date.UTC(2026, 8, 14, 0, 0, 0);
export const EPOCH_DAY = 363;
// The online epoch was 13:30 on game day 363; 1 classic minute = 5 real seconds.
export const EPOCH_MINUTE_MS = (13*60+30)*5000;
export const FRONT_PROVINCES = Object.freeze([1,2,3,4,5,6,7,8]);
const PER_DAY=2, CYCLE_DAYS=4, SALT=0x46524f4e;
export const gameDayAt = ms => EPOCH_DAY + Math.floor((ms-EPOCH_MS+EPOCH_MINUTE_MS)/GAME_DAY_MS);
export const gameDayStart = day => EPOCH_MS+(day-EPOCH_DAY)*GAME_DAY_MS-EPOCH_MINUTE_MS;
function drawnOrder(c){
  const out=[...FRONT_PROVINCES];let a=(Math.imul(c,0x9E3779B1)^SALT)>>>0;
  const random=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
function cycleOrder(c){
  const out=drawnOrder(c);if(c<=0)return out;
  const last=drawnOrder(c-1).slice(-PER_DAY);
  for(let p=0;p<PER_DAY;p++){
    if(!last.includes(out[p]))continue;
    const q=out.findIndex((v,i)=>i>=PER_DAY&&i<out.length-PER_DAY&&!last.includes(v));
    [out[p],out[q]]=[out[q],out[p]];
  }
  return out;
}
const orders=new Map();
export function frontLanes(day){
  if(!Number.isSafeInteger(day)||day<0)return [];
  const c=Math.floor(day/CYCLE_DAYS);
  if(!orders.has(c)){
    if(orders.size>=8)orders.delete(orders.keys().next().value);
    orders.set(c,cycleOrder(c));
  }
  const i=(day%CYCLE_DAYS)*PER_DAY;
  return orders.get(c).slice(i,i+PER_DAY).sort((a,b)=>a-b);
}
export const frontStands=(day,lane)=>!FRONT_PROVINCES.includes(lane)||frontLanes(day).includes(lane);
export function nextFrontAt(now,lane){
  if(!FRONT_PROVINCES.includes(lane))return now;
  const day=gameDayAt(now);
  for(let d=day;d<day+8;d++)if(frontStands(d,lane))return d===day?now:gameDayStart(d);
  return null;
}
// DFO gateLaw: day 363 gate opened Sep 14, 2026 at 00:32:30Z,
// each lane later by 12 minutes. Crucially, FRONTS checks the day the gate OPENS.
export const gateOpenAt=(day,lane)=>EPOCH_MS+(day-EPOCH_DAY)*GAME_DAY_MS+1_950_000+lane*720_000;
export function nextGateWindow(now,lane){
  const day=gameDayAt(now);
  let next=null;
  for(let d=day-3;d<=day+12;d++){
    if(d<0)continue;
    const open=gateOpenAt(d,lane);
    if(!frontStands(gameDayAt(open),lane))continue;
    if(now>=open&&now<open+1_200_000)return {open,end:open+1_200_000,next:null,active:true};
    if(open>now&&(next===null||open<next))next=open;
  }
  return next===null?null:{open:next,end:next+1_200_000,next,active:false};
}
