import {filterListings} from './vendor-search.js';
import {listingSet,SET_NAMES} from './vendor-sets.js';
import {showVendorLocation} from './vendor-map.js';
const $=s=>document.querySelector(s),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const controls={query:$('#vendor-query'),region:$('#vendor-region'),rarity:$('#vendor-rarity'),category:$('#vendor-category'),set:$('#vendor-set'),currency:$('#vendor-currency'),maxPrice:$('#vendor-max'),sort:$('#vendor-sort')};
let snapshot=null,page=0,loading=false,loaded=false;const size=40;
const format=n=>Number(n).toLocaleString(),date=n=>n?new Date(n).toLocaleString():'Unknown';
function showTab(name){
 const vendor=name==='vendors';$('#events').hidden=vendor;$('#vendors').hidden=!vendor;
 for(const button of document.querySelectorAll('[data-view]')){const active=button.dataset.view===name;button.classList.toggle('selected',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
 if(vendor&&!loaded)load();
}
for(const button of document.querySelectorAll('[data-view]')){
 button.addEventListener('click',()=>{showTab(button.dataset.view);history.replaceState(null,'',`#${button.dataset.view}`);});
 button.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const name=e.key==='Home'?'events':e.key==='End'?'vendors':button.dataset.view==='events'?'vendors':'events';showTab(name);document.querySelector(`[data-view="${name}"]`).focus();}});
}
document.querySelector('.topbar a[href="#events"]').addEventListener('click',()=>showTab('events'));
$('#watchlist-nav').addEventListener('click',()=>showTab('events'),{capture:true});
window.addEventListener('hashchange',()=>showTab(location.hash==='#vendors'?'vendors':'events'));
function fillOptions(control,values,label){const selected=control.value;control.replaceChildren(new Option(label,''),...[...new Set(values)].sort().map(v=>new Option(v,v)));if(values.includes(selected))control.value=selected;}
function render(){
 if(!snapshot)return;
 const now=Date.now(),c=snapshot.coverage,stale=now-snapshot.updatedAt>2*60*60*1000;
 $('#vendor-health').textContent=`${stale?'STALE SNAPSHOT':'INVENTORY SNAPSHOT'} · ${date(snapshot.updatedAt)}`;$('#vendor-health').classList.toggle('gold',stale);
 $('#vendor-coverage').textContent=`${format(snapshot.listings.filter(r=>r.expiresAt>now).length)} listings · ${c.vendorsChecked}/${c.vendorsDiscovered} public vendors checked · ${c.regionsChecked}/${c.totalRegions} regions`;
 let note='Refreshes about hourly. Stock may sell between scans. Prices are per listing; buy in game at the seller’s house.';
 if(stale)note='This scan is over two hours old; availability needs checking in game. '+note;
 if(!c.complete)note+=' Coverage is incomplete.';
 if(c.cappedRegions?.length)note+=` The game’s directory may be capped in: ${c.cappedRegions.join(', ')}.`;
 if(c.failedRegions?.length)note+=` Regions unavailable: ${c.failedRegions.join(', ')}.`;
 if(c.failedVendorCount)note+=` ${c.failedVendorCount} vendor reads failed.`;
 $('#vendor-notice').textContent=note;
 const filters=Object.fromEntries(Object.entries(controls).map(([k,n])=>[k,n.value]));
 const rows=filterListings(snapshot.listings,filters,now),pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages-1);
 $('#vendor-result-count').textContent=`${format(rows.length)} matching listings`;
 $('#vendor-empty').hidden=rows.length>0;$('#vendor-empty').textContent=snapshot.listings.length?'No items match these filters. Try another item, set, material, seller, or town.':'No public vendor stock was found in the checked regions.';
 $('#vendor-table-wrap').hidden=!rows.length;
 const body=$('#vendor-rows');body.replaceChildren();
 for(const row of rows.slice(page*size,(page+1)*size)){
  const tr=el('tr');if(row.rarity==='gilded')tr.className='vendor-gilded';
  const item=el('td'),details=el('details'),summary=el('summary');
  summary.append(el('span',row.name,'vendor-name'),el('span',`${row.rarity==='gilded'?'✦ ':''}${row.rarity}`,'vendor-rarity '+row.rarity));
  details.append(summary,el('p',`${row.template&&row.template!==row.name?row.template+' · ':''}${row.category} · ${row.condition==null?'Condition not supplied':row.condition+'% condition'}`),el('p',`Listed: ${date(row.listedAt)} · Expires: ${date(row.expiresAt)}`),el('p',`Checked: ${date(row.checkedAt)}`),el('p',`Map ${row.map} · Building ${row.buildingKey??'unknown'}`));
  item.append(details,el('small',[row.material,row.category].filter(Boolean).join(' · '),'vendor-sub'));
  const membership=listingSet(row);if(membership.setName)item.append(el('small','◇ '+membership.setName,'vendor-sub vendor-set-name'));
  const price=el('td');price.append(el('strong',format(row.price)),el('small',row.currency,'vendor-sub'));
  const qty=el('td',format(row.quantity));
  const seller=el('td');seller.append(el('span',row.seller||'Unnamed seller'),el('small',`${row.town} · ${row.region}`,'vendor-sub'));
  const route=el('td');const show=el('button','Show location','vendor-copy');show.setAttribute('aria-label',`Show location of ${row.seller||'this seller'} in ${row.town}`);show.addEventListener('click',()=>showVendorLocation(row));route.append(show);
  tr.append(item,price,qty,seller,route);body.append(tr);
 }
 $('#vendor-page').textContent=`Page ${page+1} of ${pages}`;$('#vendor-prev').disabled=page===0;$('#vendor-next').disabled=page>=pages-1;
}
async function load(){
 if(loading)return;loading=true;$('#vendor-reload').disabled=true;
 try{const response=await fetch('vendors.json',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(data.version!==1||!Array.isArray(data.listings)||!data.coverage||!Number.isFinite(data.updatedAt))throw Error();snapshot=data;loaded=true;
  fillOptions(controls.region,data.listings.map(r=>r.region),'All regions');fillOptions(controls.category,data.listings.map(r=>r.category),'All categories');fillOptions(controls.set,Object.values(SET_NAMES),'All sets');render();
 }catch{$('#vendor-notice').textContent=snapshot?'Could not fetch a newer inventory. Showing the previous snapshot; check its timestamp.':'The first vendor inventory is not available yet. Try Refresh snapshot shortly.';}finally{loading=false;$('#vendor-reload').disabled=false;}
}
for(const control of Object.values(controls))control.addEventListener(control.tagName==='INPUT'?'input':'change',()=>{page=0;render()});
$('#vendor-clear').addEventListener('click',()=>{for(const [key,control] of Object.entries(controls))control.value=key==='sort'?'gilded':'';page=0;render()});
$('#vendor-prev').addEventListener('click',()=>{page--;render()});$('#vendor-next').addEventListener('click',()=>{page++;render()});$('#vendor-reload').addEventListener('click',load);
setInterval(()=>{if(!$('#vendors').hidden)load()},300000);
showTab(location.hash==='#vendors'?'vendors':'events');
