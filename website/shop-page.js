// DFO-VENDOR-CLEAN-FILTERS-20261031: compact filter controls, grouped wearable slots
import {weaponType as weaponTypeOf,armorPiece as armorPieceOf,sortArmorPieces} from './vendor-facets.js?v=clean-filters-20261031'; // DFO-VENDOR-FACETS-20261031
import {selectShop,shopLink} from './vendor-shop.js?v=share-20261027';
import {filterListings} from './vendor-search.js?v=facets-20261031';
import {listingSet} from './vendor-sets.js';
import {equipmentLabel,itemStatLines} from './vendor-details.js?v=facets-20261031';
import {renderVendorMap} from './vendor-map.js?v=share-20261027';
const $=s=>document.querySelector(s),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const identity={map:Number(document.body.dataset.map),vendorId:document.body.dataset.vendor};
const format=n=>Number(n).toLocaleString(),date=n=>n?new Date(n).toLocaleString():'Not available';
let snapshot=null,selected={shop:null,listings:[]},shown=24,loading=false,mapKey='',mapAbort=null;
const query=$('#shop-search'),sort=$('#shop-sort'),rarity=$('#shop-rarity');
const extraFilters={};
const extraSpec={material:'Material',sockets:'Sockets',weaponType:'Weapon type',armorPiece:'Armor piece'};
const extraBox=el('div',null,'shop-extra-filters');
for(const [key,label] of Object.entries(extraSpec)){
  const wrap=el('label',label+' '),sel=el('select');sel.id='shop-'+key;
  sel.append(new Option(key==='sockets'?'Any socket count':'All '+label.toLowerCase()+'s',''));
  if(key==='sockets')for(const [value,name] of [['any','Has sockets'],['empty','Has empty socket'],['0','0 sockets'],['1','1 socket'],['2','2 sockets'],['3+','3+ sockets']])sel.append(new Option(name,value));
  wrap.append(sel);extraBox.append(wrap);extraFilters[key]=sel;
}
rarity.closest('label')?.parentElement?.append(extraBox);
function fillExtraOptions(rows){
 for(const [key,label,fn] of [['material','Material',r=>r.material],['weaponType','Weapon type',weaponTypeOf],['armorPiece','Armor piece',armorPieceOf]]){
  const sel=extraFilters[key],was=sel.value,values=key==='armorPiece'?sortArmorPieces(rows.map(fn).filter(Boolean)):[...new Set(rows.map(fn).filter(Boolean))].sort();
  sel.replaceChildren(new Option('All '+label.toLowerCase()+'s',''),...values.map(v=>new Option(v,v)));
  if(values.includes(was))sel.value=was;
 }
}
const url=shopLink(identity);$('#shop-url').value=url||'';
$('#shop-url').addEventListener('click',e=>e.target.select());
$('#copy-shop-link').addEventListener('click',async()=>{
 try{if(!url)throw Error();await navigator.clipboard.writeText(url);$('#share-status').textContent='Shop link copied — ready to paste into Discord.';}
 catch{$('.share-help').open=true;$('#shop-url').focus();$('#shop-url').select();$('#share-status').textContent='Select and copy the public link below.';}
});
function render(){
 if(!snapshot)return;
 const {shop,listings}=selected,now=Date.now(),available=shop&&shop.status!=='unavailable'&&shop.status!=='not-listed';
 const active=available?listings.filter(row=>row.expiresAt>now):[];
 const checked=shop?.checkedAt,stale=now-(checked||snapshot.updatedAt)>2*60*60*1000;
 $('#shop-count').textContent=available?`${format(active.length)} listings · ${format(active.reduce((sum,r)=>sum+r.quantity,0))} items`:'Stock unavailable';
 $('#shop-checked').textContent=`${stale?'Older snapshot · ':''}Last checked ${date(checked)}`;
 let note='Stock refreshes about hourly and may sell between scans. Prices are per listing; purchase in game. Base armor and damage use default game rules, before character and equipment bonuses.';
 if(stale)note='This inventory is over two hours old. Check availability in game. '+note;
 if(!available)note='This shop could not be verified in the latest public inventory. It may be missing from this scan or no longer public. Previous stock is not shown.';
 $('#shop-notice').textContent=note;
 if(shop){
  $('#shop-title').textContent=`${shop.seller||'Unnamed seller'}’s shop`;
  document.title=`${shop.seller||'Unnamed seller'}’s shop · Daggerfall Watch`;
  $('#shop-place').replaceChildren(el('span',shop.town),el('span',' · '+shop.region));
  $('#location-title').textContent=shop.town;$('#location-region').textContent=shop.region;
  $('#shop-directions').textContent=`In game: Stats → Vendor → ${shop.region} → ${shop.seller||'this seller'} → Set waypoint.`;
  const key=JSON.stringify([shop.map,shop.buildingKey]);
  if(mapKey!==key){mapAbort?.abort();mapAbort=new AbortController();mapKey=key;renderVendorMap(shop,$('#shop-map'),mapAbort.signal);}
 }else{$('#shop-map').replaceChildren(el('p','The current shop location could not be verified.','notice'));}
 const rows=filterListings(active,{query:query.value,sort:sort.value,rarity:rarity.value,...Object.fromEntries(Object.entries(extraFilters).map(([k,v])=>[k,v.value]))},now);
 $('#stock-results').textContent=`${format(rows.length)} ${query.value||rarity.value?'matching ':''}listings`;
 const grid=$('#stock-grid');grid.replaceChildren();
 for(const row of rows.slice(0,shown)){
  const card=el('article',null,'stock-card'+(row.rarity==='gilded'?' stock-gilded':'')),top=el('div',null,'stock-card-top');
  top.append(el('span',row.rarity,'stock-rarity '+row.rarity),el('span','Qty '+format(row.quantity),'stock-quantity'));
  card.append(top,el('h3',row.name),el('p',equipmentLabel(row),'stock-material'));
  const set=listingSet(row);if(set.setName)card.append(el('p','◇ '+set.setName,'stock-set'));
  const stats=el('div',null,'stock-stats');for(const line of itemStatLines(row))stats.append(el('p',line));card.append(stats);
  card.append(el('p',`${format(row.price)} ${row.currency}`,'stock-price'));
  const details=el('details'),summary=el('summary','Item details');details.append(summary,el('p',row.condition==null?'Condition not supplied':`${row.condition}% condition`),el('p','Listed '+date(row.listedAt)),el('p','Expires '+date(row.expiresAt)));card.append(details);grid.append(card);
 }
 if(!rows.length)grid.append(el('p',!available?'No verified stock is available.':active.length?'No items match your search.':'No active listings in the latest snapshot. Check back after the next scan.','shop-empty'));
 $('#shop-more').hidden=shown>=rows.length;
}
async function load(){
 if(loading)return;loading=true;$('#shop-refresh').disabled=true;
 try{
  const response=await fetch(new URL('vendors.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error();const data=await response.json();
  if(data.version!==1||!Array.isArray(data.listings)||!Number.isFinite(data.updatedAt))throw Error();
  snapshot=data;selected=selectShop(data,identity);fillExtraOptions(selected.listings);render();
 }catch{$('#shop-notice').textContent=snapshot?'Could not fetch a newer snapshot. The stock shown is from the previous successful load; check its timestamp.':'Unable to load the current stock. Try Refresh snapshot; the share image is only a saved snapshot.';}
 finally{loading=false;$('#shop-refresh').disabled=false;}
}
for(const control of [query,sort,rarity,...Object.values(extraFilters)])control.addEventListener(control===query?'input':'change',()=>{shown=24;render();});
$('#shop-more').addEventListener('click',()=>{shown+=24;render();});$('#shop-refresh').addEventListener('click',load);
setInterval(()=>{if(!document.hidden)load();},300000);load();
