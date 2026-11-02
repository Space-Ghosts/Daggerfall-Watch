import {guildRows,sortedGuilds} from './guild-model.js';
const root=document.getElementById('guilds');
const $=s=>root.querySelector(s),make=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e;};
const fmt=n=>Number(n).toLocaleString(),when=v=>v?new Date(v).toLocaleString(): 'Not yet checked';
const svgNS='http://www.w3.org/2000/svg',svg=(tag,attrs={})=>{const e=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
let data=null,geometry=null,selected=new URL(location.href).searchParams.get('guild'),mapSeats=[],mapBox=null,busy=false;
const href=id=>{const u=new URL('../',import.meta.url);u.searchParams.set('guild',id);u.hash='guilds';return u.pathname+u.search+u.hash;};
function guildLink(g){const a=make('a','guild-link',g.name||g.tag||'Unnamed guild');a.href=href(g.id);a.append(make('small','guild-tag',`[${g.tag}]`));return a;}
function metric(value,label,cls='total'){const e=make('div',cls);e.append(make('strong','',value),make('span','',label));return e;}
function coverage(){
 const c=data.coverage,el=$('#coverage');el.replaceChildren();
 const age=c.oldestCheckedAt?(Date.now()-Date.parse(c.oldestCheckedAt))/3600000:0;
 const state=c.complete?'All confirmed seats covered':'Partial coverage · provisional rankings';
 el.append(make('strong','',state));
 el.append(make('span','',`${fmt(c.seatsChecked)} / ${fmt(c.seatsExpected)} confirmed seats checked this game week. ${c.disputed?c.disputed+' disputed seat(s) excluded. ':''}${c.failed?c.failed+' reads failed. ':''}${c.error?'The scan stopped; the next scheduled run will retry.':!c.scanComplete?'The background scan is working through the territory list.':'Scan finished.'}${age>3?' Some standings are more than three hours old.':''} Guilds without territorial activity may be absent.${data.turningAt?' Week turns '+when(data.turningAt*1000)+'.':''}`));
 $('#updated').textContent=`Snapshot updated ${when(data.updatedAt)}`;
}
function render(){
 if(!data)return;coverage();const region=$('#region').value,rows=sortedGuilds(guildRows(data,region),$('#guild-sort').value),seats=new Map(data.seats.map(s=>[s.key,s]));
 const g=selected?data.guilds.find(g=>g.id===selected):null;
 $('#directory').hidden=!!selected;$('#profile').hidden=!selected;
 if(selected){renderProfile(g,seats);return;}
 if(!root.hidden)document.title='Guild Directory · Daggerfall Watch';$('#page-title').textContent='The guild register.';$('#page-intro').textContent='Follow the guilds shaping Tamriel. Compare influence, explore their holdings, and find the next contested town.';
 $('#totals').replaceChildren(metric(fmt(rows.length),'Guilds discovered'),metric(fmt(rows.reduce((n,g)=>n+g.territories.length,0)),'Seats held'),metric(`${fmt(data.coverage.seatsChecked)} / ${fmt(data.coverage.seatsExpected)}`,'Standings coverage'));
 const query=$('#query').value.trim().toLocaleLowerCase();
 const visible=rows.filter(g=>[g.name,g.tag,...g.contests.map(c=>seats.get(c.key)?.name),...g.territories.flatMap(k=>[seats.get(k)?.name,seats.get(k)?.region])].join(' ').toLocaleLowerCase().includes(query));
 $('#results').textContent=`${visible.length} guild${visible.length===1?'':'s'}${data.coverage.complete?'':' · provisional'}`;$('#guild-empty').hidden=visible.length>0;
 const tbody=$('#guild-rows');tbody.replaceChildren();let rank=0,previous=null;
 for(let i=0;i<rows.length;i++){
  const g=rows[i],sort=$('#guild-sort').value,score=sort==='territories'?g.territories.length:sort==='current'?g.currentInfluence:g.influence;if(score!==previous){rank=i+1;previous=score;}
  if(!visible.includes(g))continue;const tr=make('tr');tr.append(make('td','rank',sort==='name'?'—':!g.measured&&sort!=='territories'?'—':String(rank)));
  const name=make('td');name.append(guildLink(g));tr.append(name);
  for(const v of [g.measured?fmt(g.currentInfluence):'Pending',g.measured?fmt(g.influence):'Pending',g.measured?fmt(g.legacy):'—',fmt(g.territories.length),fmt(g.contests.filter(c=>!c.holder).length)])tr.append(make('td','',v));tbody.append(tr);
 }
 const ids=new Set(visible.map(g=>g.id));mapSeats=data.seats.filter(s=>s.holder&&ids.has(s.holder.id)&&(!region||s.region===region));
 $('#map-title').textContent='Territory map';$('#seats-title').textContent='Held towns';renderSeats(mapSeats,null);fitMap();
}
function renderProfile(g,seats){
 const panel=$('#profile');panel.replaceChildren();const back=make('a','guild-back-link', '← All guilds & rankings');back.href=new URL('../#guilds',import.meta.url).pathname+'#guilds';panel.append(back);
 if(!g){$('#page-title').textContent='Guild not found';$('#page-intro').textContent='This guild is not in the current territorial snapshot. It may not have been scanned yet, or may no longer participate in a seat.';mapSeats=[];renderSeats([],null);fitMap();return;}
 if(!root.hidden)document.title=`${g.name} [${g.tag}] · Daggerfall Watch`;$('#page-title').textContent=g.name;$('#page-intro').textContent=`[${g.tag}] · Public guild profile · Territorial standings`;
 const head=make('div','profile-head'),herald=make('div','profile-crest');
 herald.textContent=g.heraldry?`Heraldry: ${g.heraldry.device} · ${g.heraldry.field} field · ${g.heraldry.border} border`:'Heraldry not reported';
 const actions=make('div','profile-actions'),copy=make('button','', 'Copy guild link'),status=make('span','','');status.id='share-status';status.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(new URL(href(g.id),location.origin).href);status.textContent='Link copied';}catch{status.textContent='Copy this page’s address from your browser.';}};
 actions.append(copy,status);head.append(herald,actions);panel.append(head);
 const facts=make('div','profile-facts');facts.append(metric(g.contests.length?fmt(g.influence):'Pending','Influence incl. legacy','profile-stat'),metric(g.contests.length?fmt(g.currentInfluence):'Pending','This week, adjusted · excludes legacy','profile-stat'),metric(fmt(g.territories.length),'Seats held','profile-stat'));panel.append(facts);
 panel.append(make('p','profile-note',`Legacy: ${fmt(g.legacy)} · ${g.contests.filter(c=>!c.holder).length} seats competing · Member count is not publicly available. ${g.checkedAt?'Oldest guild reading: '+when(g.checkedAt):'Influence has not been read yet.'}`));
 const keys=new Set([...g.territories,...g.contests.map(c=>c.key)]);mapSeats=[...keys].map(k=>seats.get(k)).filter(Boolean);
 $('#map-title').textContent='Holdings & campaigns';$('#seats-title').textContent='Town-by-town standings';renderSeats(mapSeats,g);fitMap();
}
function renderSeats(seats,g){
 const wrap=$('#seat-cards');wrap.replaceChildren();
 if(!seats.length){wrap.append(make('p','','No holdings or campaigns are available in this selection.'));return;}
 for(const s of seats){const card=make('article','seat-card');card.id='seat-'+s.key;card.append(make('p','eyebrow',`${s.tier} · ${s.region}`),make('h3','',s.name));
  if(s.holder){const p=make('p','','Held by ');p.append(guildLink(s.holder));card.append(p);}else card.append(make('span','pill','Unheld seat'));
  if(g){const c=g.contests.find(c=>c.key===s.key);if(c){card.append(make('p','',`Influence: ${fmt(c.influence)} · Legacy: ${fmt(c.legacy)}`),make('p','',`${fmt(c.contributors)} contributing accounts at this seat`),make('time','',`Checked ${when(c.checkedAt)}`));}else card.append(make('p','','Influence pending a successful seat read.'));}
  else if(s.holder){const current=data.guilds.find(x=>x.id===s.holder.id)?.contests.find(c=>c.key===s.key);card.append(make('p','',current?`Holder influence: ${fmt(current.influence)}`:'Holder influence pending'));}
  if(s.standing!==null)card.append(make('p','',`Holding standing: ${s.standing} · Tithe: ${s.tithe}%`));
  if(s.battle)card.append(make('p','',`${s.battle.kind} · ${s.battle.state||'Scheduled'}${s.battle.startsAt?' · '+when(s.battle.startsAt*1000):''}`));
  if(s.pixel)card.append(make('p','',`World-map tile ${s.pixel[0]}, ${s.pixel[1]}`));wrap.append(card);
 }
}
function fitMap(){
 const pts=mapSeats.filter(s=>s.pixel).map(s=>s.pixel);if(!pts.length){mapBox=[-589,-883.5,4960,3100];drawMap();return;}
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const width=Math.max(80,(x1-x0)*1.35,(y1-y0)*2.6),height=width*.55;mapBox=[(x0+x1)/2-width/2,(y0+y1)/2-height/2,width,height];drawMap();
}
function drawMap(){
 const box=$('#territory-map');box.replaceChildren();if(!mapBox)return;
 const root=svg('svg',{viewBox:mapBox.join(' '),role:'group','aria-label':`${mapSeats.length} guild territories and campaigns`});
 if(geometry)for(const [key,cls]of [['coast','map-coast'],['borders','map-border']]){
  const p=svg('path',{class:cls,d:geometry[key].map(c=>c.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ')).join(' ')});root.append(p);
 }
 const unit=mapBox[2]/850,shown=mapSeats.filter(s=>s.pixel),labels=[];
 for(const s of shown){const [x,y]=s.pixel,p=svg('a',{href:'#seat-'+s.key,'aria-label':`${s.name}, ${s.region}${s.holder?' · '+s.holder.name:''}`});const title=svg('title');title.textContent=`${s.name} · ${s.region}`;p.append(title,svg('circle',{cx:x+.5,cy:y+.5,r:6*unit,class:'map-pin'+(selected&&s.holder?.id!==selected?' contender':'')}));
  if(!labels.some(q=>Math.abs(q[0]-x)<130*unit&&Math.abs(q[1]-y)<22*unit)){const t=svg('text',{x:x+11*unit,y:y-10*unit,'font-size':13*unit,class:'map-label'});t.textContent=s.name;p.append(t);labels.push([x,y]);}root.append(p);
 }
 box.append(root);$('#map-note').textContent=`${shown.length} mapped seats · Coastlines and tile locations; roads and buildings are not shown.${geometry?'':' Map outline unavailable; markers remain at their reported coordinates.'}`;
}
async function load(){if(busy)return;busy=true;$('#refresh').disabled=true;
 try{const r=await fetch(new URL('data.json',import.meta.url),{cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(next.version!==1||!Array.isArray(next.guilds)||!Array.isArray(next.seats)||!next.coverage)throw Error();data=next;
  const selection=$('#region').value;$('#region').replaceChildren(new Option('All regions',''));for(const name of [...new Set(data.seats.map(s=>s.region))].sort())$('#region').append(new Option(name,name));$('#region').value=selection;render();
 }catch{const e=$('#coverage');e.replaceChildren(make('strong','','Guild snapshot unavailable'),make('span','',data?'Showing the last snapshot loaded in this browser. Retry shortly.':'The first scan may still be starting. Please try Refresh snapshot shortly.'));}finally{busy=false;$('#refresh').disabled=false;}
}
$('#query').addEventListener('input',render);$('#region').addEventListener('change',render);$('#guild-sort').addEventListener('change',render);$('#refresh').onclick=load;$('#fit').onclick=fitMap;$('#world').onclick=()=>{mapBox=[-589,-883.5,4960,3100];drawMap();};
for(const[id,factor]of [['#zoom-in',.65],['#zoom-out',1.5]])$(id).onclick=()=>{if(!mapBox)return;const[x,y,w,h]=mapBox,nw=Math.max(12,Math.min(8000,w*factor)),nh=nw*h/w;mapBox=[x+(w-nw)/2,y+(h-nh)/2,nw,nh];drawMap();};
await load();fetch(new URL('../dragon-vector-map.json',import.meta.url)).then(r=>r.ok?r.json():null).then(d=>{if(d?.version===1&&Array.isArray(d.coast)&&Array.isArray(d.borders)){geometry=d;drawMap();}}).catch(()=>{});
setInterval(()=>{if(!document.hidden && !root.hidden)load();},60000);


// GUILD_NATIVE_TAB_V1: handle profile navigation without leaving Event Watch.
function routeGuildFromLocation(){
 selected=new URL(location.href).searchParams.get('guild');
 render();
}
function navigateGuild(href){
 const url=new URL(href,location.href);
 if(url.origin!==location.origin)return;
 history.pushState(null,'',url.pathname+url.search+url.hash);
 routeGuildFromLocation();
 root.scrollIntoView({block:'start',behavior:'instant'});
}
root.addEventListener('click',e=>{
 const node=e.target;
 if(!(node instanceof Element))return;
 const link=node.closest('a.guild-link, a.guild-back-link');
 if(link){
  if(e.button!==0||e.ctrlKey||e.shiftKey||e.metaKey||e.altKey)return;
  e.preventDefault();navigateGuild(link.href);return;
 }
 const mapLink=node.closest('#territory-map a[href^="#seat-"]');
 if(mapLink){
  e.preventDefault();
  const key=mapLink.getAttribute('href').slice(1);
  const target=root.querySelector('[id="'+key+'"]');
  if(target){
   root.querySelectorAll('.guild-seat-highlight').forEach(el=>el.classList.remove('guild-seat-highlight'));
   target.classList.add('guild-seat-highlight');target.scrollIntoView({block:'center',behavior:'smooth'});
  }
 }
});
window.addEventListener('popstate',routeGuildFromLocation);
export function activateGuildTab(){routeGuildFromLocation();}
