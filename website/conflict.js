/* CONF_TAB_V2: native Conflict tab, sharing the Guild Directory snapshot. */
import {conflictRows, conflictSummary, claimMinimum, challengeTarget} from './conflict-model.mjs?v=conflict-v2-20261030';
const root = document.getElementById('conflict');
const $ = id => root.querySelector('#' + id);
const make = (tag, cls = '', txt = undefined) => { const el=document.createElement(tag); if(cls)el.className=cls; if(txt!==undefined)el.textContent=txt; return el; };
const fmt = n => Number(n||0).toLocaleString('en-US');
const when = t => { if(!t)return 'Not reported'; const d=new Date(t);return Number.isFinite(d.getTime())?d.toLocaleString():'Not reported';};
const since = n => { const s=Math.max(0,Math.ceil(n/1000)); if(s>=86400)return `${Math.floor(s/86400)}d ${Math.floor(s%86400/3600)}h`;return `${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`;};
const guildUrl = id => { const u=new URL('./',import.meta.url); u.searchParams.set('guild',String(id));u.hash='guilds';return u.pathname+u.search+u.hash; };
const guildName = g => g?.name ? (g.tag ? `${g.name} [${g.tag}]` : g.name) : 'Unknown guild';
function guildNode(g, cls = '') {
  if(!g)return make('span',cls,'Unclaimed');
  const label=guildName(g);if(!g.id)return make('span',cls,label);
  const a=make('a',cls,label);a.href=guildUrl(g.id);return a;
}
const valueMetric = (n, label) => { const e=make('div','conflict-metric');e.append(make('strong','',fmt(n)),make('span','',label));return e;};
let data=null, loading=false, started=false, lastLoadAt=0;

function outcome(r) {
  const b=r.battle;
  if(r.kind==='window')return {label:'BATTLE WINDOW OPEN',type:'open',detail:`Window ends in ${since(r.ends-Date.now())}`};
  if(r.kind==='upcoming')return {label:'UPCOMING '+({siege:'SIEGE',tourney:'TOURNEY',revolt:'REVOLT'}[b.kind]||'BATTLE'),type:'upcoming',detail:`Starts in ${since(r.starts-Date.now())}`};
  if(r.kind==='right')return {label:'RIGHT OF '+(b.kind==='tourney'?'TOURNEY':'SIEGE'),type:'right',detail:'Start time not yet reported'};
  return {label:r.seat.holder?'SEAT CHALLENGED':'UNCLAIMED SEAT',type:'contested',detail:`${fmt(r.outsiders.length)} active guild campaign${r.outsiders.length===1?'':'s'}`};
}
function battleBanner(b) {
  const box=make('div','conflict-versus');
  if(b.kind==='revolt'){
    const defender=make('div','conflict-party'),uprising=make('div','conflict-party');
    defender.append(make('span','conflict-party-role','GARRISON / HOLDER'),guildNode(b.against));
    uprising.append(make('span','conflict-party-role','REVOLT'),make('strong','', 'The uprising'));
    box.append(defender,make('span','conflict-vs','VS'),uprising);
    return box;
  }
  const left=make('div','conflict-party'),right=make('div','conflict-party');
  left.append(make('span','conflict-party-role',b.kind==='tourney'?'CONTENDER':'ATTACKER'),guildNode(b.guild));
  right.append(make('span','conflict-party-role',b.kind==='tourney'?'CONTENDER':'DEFENDER'),guildNode(b.against));
  box.append(left,make('span','conflict-vs','VS'),right);
  return box;
}
function card(r) {
  const s=r.seat,b=r.battle,o=outcome(r),item=make('article','conflict-card'),top=make('div','conflict-card-top');
  const info=make('div');info.append(make('span','conflict-region',`${s.region||'Unknown region'} · ${String(s.tier||'seat').toUpperCase()}`),make('h3','',s.name||'Unnamed seat'));
  const label=make('div','conflict-card-badges');
  label.append(make('span','conflict-participant-count',`${r.competing} competing`));
  label.append(make('span','conflict-pill '+o.type,o.label));
  top.append(info,label);item.append(top);
  const minimum=claimMinimum(s),target=challengeTarget(s),goal=make('div','conflict-goal');
  const head=make('div','conflict-goal-main');
  head.append(make('span','conflict-goal-label',s.holder?'BASE INFLUENCE REQUIRED':'MINIMUM TO CLAIM'),
    make('strong','conflict-goal-amount',minimum===null?'Unknown':`${fmt(minimum)} influence`));
  goal.append(head);
  if(s.holder){
    goal.append(make('p','conflict-goal-note',target===null
      ? 'Includes Legacy. The exact defense target is not present in this snapshot.'
      : `Includes Legacy. Challenge target: ${fmt(target)} influence.`));
  }else{
    goal.append(make('p','conflict-goal-note','Includes carried Legacy. If second place is within 10% at the Turning, it becomes a Tourney.'));
  }
  item.append(goal);
  if(r.kind==='window'||r.kind==='upcoming'||r.kind==='right'){
    if(b) item.append(battleBanner(b));
    item.append(make('div','conflict-date',`${o.detail}${r.starts?' · '+when(r.starts):''}${b?.moved?' · Schedule moved':''}`));
  }else if(s.holder){
    const holder=make('p','conflict-holder','Current holder: ');holder.append(guildNode(s.holder));item.append(holder);
  }
  if(r.outsiders.length){
    const title=make('div','conflict-contender-title',`CAMPAIGNS · ${r.outsiders.length} GUILD${r.outsiders.length===1?'':'S'}`);
    const list=make('div','conflict-contender-list');
    for(const c of r.contenders.slice(0,6)){
      const line=make('div','conflict-contender'),who=make('span'),score=make('span','conflict-score');
      who.append(guildNode(c.guild)); if(s.holder && String(c.guild.id)===String(s.holder.id))who.append(make('small','',' · holder'));
      const total=Math.max(0,c.influence);
      score.textContent=fmt(total);
      line.append(who,score);list.append(line);
    }
    if(r.contenders.length>6)list.append(make('p','conflict-more',`+ ${r.contenders.length-6} more campaigns`));
    item.append(title,list);
  }
  const foot=make('div','conflict-card-foot');
  if(s.standing!=null)foot.append(make('span','',`Standing ${fmt(s.standing)}`));
  if(Array.isArray(s.pixel)&&s.pixel.length===2)foot.append(make('span','',`Map ${s.pixel[0]}, ${s.pixel[1]}`));
  const times=r.contenders.map(c=>Date.parse(c.checkedAt)).filter(Number.isFinite);if(times.length)foot.append(make('span','',`Influence checked ${when(Math.min(...times))}`));
  if(foot.childNodes.length)item.append(foot);
  return item;
}
function refreshView() {
  if(!data)return;
  if(!root.hidden) document.title='Conflict · Daggerfall Watch';
  const now=Date.now(),age=now-Date.parse(data.updatedAt),stale=Number.isFinite(age)&&age>2*3600000;
  const rows=conflictRows(data,now),summary=conflictSummary(rows),c=data.coverage||{},complete=c.complete===true;
  const notice=$('conflict-status');notice.classList.toggle('stale',stale||!complete);
  notice.textContent=`${complete?'Guild snapshot covers all confirmed seats':'PROVISIONAL — guild scan is incomplete'} · Last updated ${when(data.updatedAt)}${stale?' · STALE SNAPSHOT':''}. Battle windows are scheduled times, not proof of combat activity.${Number(c.disputed)>0?` ${c.disputed} disputed seat(s) omitted.`:''}`;
  $('conflict-metrics').replaceChildren(valueMetric(summary.window,'Battle windows open'),valueMetric(summary.upcoming,'Upcoming / awarded fights'),valueMetric(summary.contested,'Influence contests'));
  const region=$('conflict-region').value,query=$('conflict-query').value.trim().toLocaleLowerCase(),type=$('conflict-filter').value;
  const visible=rows.filter(r=>(!region||r.seat.region===region)&&(!type|| (type==='upcoming'?(r.kind==='upcoming'||r.kind==='right'):r.kind===type))&&
    (!query||[r.seat.name,r.seat.region,r.seat.tier,r.battle?.guild?.name,r.battle?.against?.name,r.seat.holder?.name,...r.contenders.map(c=>c.guild.name),...r.contenders.map(c=>c.guild.tag)].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
  $('conflict-results').textContent=`${visible.length} seat${visible.length===1?'':'s'} shown · ${summary.total} conflict${summary.total===1?'':'s'} in snapshot · Sorted by most competing guilds`;
  $('conflict-list').replaceChildren(...visible.map(card));
  $('conflict-empty').hidden=!!visible.length;
  $('conflict-empty').textContent=rows.length?'No conflicts match your filters.':'No active seat contests or upcoming battles reported by this snapshot.'+(complete?'':' Coverage is incomplete, so this is not a definitive zero.');
  $('conflict-next-turning').textContent=data.turningAt?`Next Turning: ${when(data.turningAt*1000)}. Influence contests may lead to battles at the next Turning.`:'Influence contests may lead to battles at the next Turning.';
}
async function load() {
  if(loading)return;
  loading=true;$('conflict-refresh').disabled=true;
  try {
    const response=await fetch(new URL('./guilds/data.json',import.meta.url),{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const next=await response.json();
    if(next.version!==1||!Array.isArray(next.guilds)||!Array.isArray(next.seats)||!next.coverage)throw new Error('Invalid snapshot format');
    data=next; lastLoadAt=Date.now();
    const old=$('conflict-region').value;
    const region=$('conflict-region');region.replaceChildren(new Option('All regions',''),...[...new Set(data.seats.map(s=>s.region).filter(Boolean))].sort().map(n=>new Option(n,n)));
    if([...region.options].some(o=>o.value===old))region.value=old;
    refreshView();
  } catch(e) {
    const status=$('conflict-status');status.classList.add('stale');
    status.textContent=data?'Refresh failed; displaying the last snapshot loaded in this browser.':'Conflict data unavailable. The Guild Directory snapshot could not be loaded.';
    if(!data){$('conflict-empty').hidden=false;$('conflict-empty').textContent='Unable to load conflicts. Use Refresh snapshot to retry.';}
  } finally {loading=false;$('conflict-refresh').disabled=false;}
}
export function activateConflictTab() {
  if(!started){
    started=true;
    $('conflict-query').addEventListener('input',refreshView);
    $('conflict-region').addEventListener('change',refreshView);
    $('conflict-filter').addEventListener('change',refreshView);
    $('conflict-refresh').addEventListener('click',load);
    setInterval(()=>{if(!document.hidden&&!root.hidden){refreshView();if(Date.now()-lastLoadAt>60_000)load();}},15000);
  }
  if(!data||Date.now()-lastLoadAt>60_000)void load();else refreshView();
}
