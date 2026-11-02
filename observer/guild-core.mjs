// Public seat standings only. Never publish reader-specific or member records.
import {REGION_NAMES} from './vendor-reference.mjs';
const text=(v,n=100)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,n):'';
const num=v=>Number.isFinite(v)&&v>=0?v:0;
export function publicGuild(g){
 if(!g||typeof g.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(g.id))return null;
 return {id:g.id,name:text(g.name),tag:text(g.tag,16),heraldry:g.heraldry?{field:text(g.heraldry.field,24),border:text(g.heraldry.border,24),device:text(g.heraldry.device,24)}:null};
}
export function publicSeat(s){
 if(!Number.isSafeInteger(s?.key)||s.key<0)return null;
 return {key:s.key,name:text(s.name),region:REGION_NAMES[s.region]||`Region ${s.region}`,tier:text(s.tier,24),state:text(s.state,24),
 pixel:Array.isArray(s.pixel)&&s.pixel.length===2&&s.pixel.every(Number.isFinite)?s.pixel:null,
 holder:publicGuild(s.holder?.guild),standing:s.holder?num(s.holder.standing):null,tithe:s.holder?num(s.holder.tithe):null,
 battle:s.battle?{kind:text(s.battle.kind,24),state:text(s.battle.state,24),startsAt:num(s.battle.startsAt)||null,endsAt:num(s.battle.endsAt)||null,guild:publicGuild(s.battle.guild),against:publicGuild(s.battle.against)}:null};
}
export function publicStanding(d,key,checkedAt){
 if(d?.seat?.key!==key||!Number.isInteger(d.week)||!Array.isArray(d.standings))throw Error('invalid-standings');
 return {key,week:d.week,checkedAt,turningAt:num(d.turningAt),
  // Ownership and battles come from /seats/standings, NOT /seats/list.
  holder:d.holder?.guild?{guild:publicGuild(d.holder.guild),standing:num(d.holder.standing),tithe:num(d.holder.tithe)}:null,
  battle:d.battle?{kind:text(d.battle.kind,24),state:text(d.battle.state,24),startsAt:num(d.battle.startsAt)||null,endsAt:num(d.battle.endsAt)||null,
    moved:d.battle.moved===true,guild:publicGuild(d.battle.guild),against:publicGuild(d.battle.against)}:null,
  defence:Number.isFinite(d.defence)?d.defence:null,
  rows:d.standings.map(s=>({guild:publicGuild(s.guild),influence:num(s.influence),legacy:num(s.legacy),tribute:num(s.tribute),contributors:num(s.accounts),holder:s.holder===true})).filter(s=>s.guild)};
}
export function buildGuildSnapshot({seats,reads,week,startedAt,now,complete=false,failed=0,error=null}){
 const guilds=new Map(),eligible=seats.filter(s=>s.state==='confirmed');
 // The registry endpoint has no holder field. Enrich its seat rows using the
 // separately saved current-week standings, whose holder flags are authoritative.
 // Older cached standings lack r.holder; each r.rows[].holder is still available.
 for(const seat of eligible){
  const r=reads[seat.key];if(!r||r.week!==week)continue;
  const marked=r.rows.filter(x=>x.holder===true&&x.guild);
  if(r.holder?.guild){seat.holder=r.holder.guild;seat.standing=r.holder.standing;seat.tithe=r.holder.tithe;}
  else if(marked.length===1)seat.holder=marked[0].guild;
  if(Object.prototype.hasOwnProperty.call(r,'battle'))seat.battle=r.battle;
  if(r.defence!==undefined)seat.defence=r.defence;
 }
 const get=g=>{if(!g)return null;if(!guilds.has(g.id))guilds.set(g.id,{...g,influence:0,legacy:0,currentInfluence:0,territories:[],contests:[],checkedAt:null});return guilds.get(g.id);};
 for(const s of seats){if(s.holder)get(s.holder).territories.push(s.key);get(s.battle?.guild);get(s.battle?.against);}
 let checked=0,oldest=null;
 for(const s of eligible){const r=reads[s.key];if(!r||r.week!==week)continue;checked++;oldest=!oldest||r.checkedAt<oldest?r.checkedAt:oldest;
  for(const v of r.rows){const g=get(v.guild);g.influence+=v.influence;g.legacy+=v.legacy;g.currentInfluence+=Math.max(0,v.influence-v.legacy);g.checkedAt=!g.checkedAt||r.checkedAt<g.checkedAt?r.checkedAt:g.checkedAt;g.contests.push({key:s.key,influence:v.influence,legacy:v.legacy,contributors:v.contributors,holder:v.holder,checkedAt:r.checkedAt});}
 }
 const all=[...guilds.values()].sort((a,b)=>b.influence-a.influence||a.name.localeCompare(b.name));
 return {version:1,updatedAt:now,scanStartedAt:startedAt,week,turningAt:Object.values(reads).find(r=>r.week===week)?.turningAt||null,
 coverage:{seatsListed:seats.length,seatsExpected:eligible.length,seatsChecked:checked,disputed:seats.length-eligible.length,failed,scanComplete:complete,complete:checked===eligible.length&&eligible.length>0,oldestCheckedAt:oldest,error},guilds:all,seats};
}
