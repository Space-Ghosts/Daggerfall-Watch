const $=s=>document.querySelector(s),num=n=>Number(n||0).toLocaleString();
const stamp=n=>n?new Date(n).toLocaleString():'Unavailable';
const svgNS='http://www.w3.org/2000/svg';
let loading=false;
function chart(days){
  const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 600 170');svg.setAttribute('preserveAspectRatio','none');
  const max=Math.max(1,...days.map(d=>d.visitors));
  days.forEach((d,i)=>{const bar=document.createElementNS(svgNS,'rect'),h=d.visitors/max*160;for(const [k,v] of Object.entries({x:i*20+3,y:170-h,width:14,height:h,rx:2}))bar.setAttribute(k,String(v));const title=document.createElementNS(svgNS,'title');title.textContent=`${d.date}: ${num(d.visitors)} estimated visitors`;bar.append(title);svg.append(bar);});
  $('#chart').replaceChildren(svg);$('#chart-start').textContent=days[0].date;$('#chart-end').textContent=days.at(-1).date;
}
async function refresh(){
  if(loading)return;loading=true;$('#refresh').disabled=true;
  try{
    const response=await fetch('/api/stats',{cache:'no-store'});if(!response.ok)throw Error();const s=await response.json();
    $('#uniques').textContent=num(s.today.visitors);$('#views').textContent=num(s.today.views);$('#week').textContent=num(s.views7days);$('#recent').textContent=num(s.recentVisitors);
    $('#event-views').textContent=num(s.today.events);$('#vendor-views').textContent=num(s.today.vendors);$('#empty').hidden=s.days.some(d=>d.views);
    const tbody=$('#days');tbody.replaceChildren();for(const d of [...s.days].reverse()){const tr=document.createElement('tr');for(const value of [d.date,num(d.visitors),num(d.views),num(d.events),num(d.vendors)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}tbody.append(tr);}chart(s.days);
    const now=Date.now(),o=s.health.observer,v=s.health.vendors,fresh=o?.connected&&now-o.updatedAt<65000&&now-o.lastMessageAt<90000;
    $('#observer-status').textContent=fresh?'Connected · fresh':o?'Stale or disconnected':'Snapshot unavailable';$('#observer-status').classList.toggle('warn',!fresh);$('#observer-time').textContent=`Last published: ${stamp(o?.updatedAt)}`;
    const inventoryFresh=v&&now-v.updatedAt<7200000;$('#inventory-status').textContent=v?`${num(v.listings)} listings · ${inventoryFresh?'fresh':'stale'}`:'Snapshot unavailable';$('#inventory-status').classList.toggle('warn',!inventoryFresh||!v.complete);$('#inventory-time').textContent=v?`${v.checked}/${v.total} vendors checked · ${v.complete?'complete':'partial'} coverage. Updated ${stamp(v.updatedAt)}`:'';
    $('#status').textContent=`Updated ${stamp(s.updatedAt*1000)} · refreshes every 30 seconds`;
    $('#started').textContent=`Collection started ${stamp(s.startedAt*1000)}. Days before collection began are shown as zero; no historical traffic is inferred.`;
  }catch{$('#status').textContent='Dashboard unavailable. Check the SSH tunnel and Homesec metrics service; any displayed numbers are from the previous refresh.';}
  finally{loading=false;$('#refresh').disabled=false;}
}
$('#refresh').addEventListener('click',refresh);refresh();setInterval(()=>{if(!document.hidden)refresh()},30000);
