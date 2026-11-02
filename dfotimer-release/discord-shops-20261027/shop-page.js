import {selectShop,shopLink} from './vendor-shop.js?v=share-20261027';
import {filterListings} from './vendor-search.js';
import {listingSet} from './vendor-sets.js';
import {renderVendorMap} from './vendor-map.js?v=share-20261027';
const $=s=>document.querySelector(s),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const identity={map:Number(document.body.dataset.map),vendorId:document.body.dataset.vendor};
const format=n=>Number(n).toLocaleString(),date=n=>n?new Date(n).toLocaleString():'Not available';
let snapshot=null,selected={shop:null,listings:[]},shown=24,loading=false,mapKey='',mapAbort=null;
const query=$('#shop-search'),sort=$('#shop-sort'),rarity=$('#shop-rarity');
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
 let note='Stock refreshes about hourly and may sell between scans. Prices are per listing; purchase in game.';
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
 const rows=filterListings(active,{query:query.value,sort:sort.value,rarity:rarity.value},now);
 $('#stock-results').textContent=`${format(rows.length)} ${query.value||rarity.value?'matching ':''}listings`;
 const grid=$('#stock-grid');grid.replaceChildren();
 for(const row of rows.slice(0,shown)){
  const card=el('article',null,'stock-card'+(row.rarity==='gilded'?' stock-gilded':'')),top=el('div',null,'stock-card-top');
  top.append(el('span',row.rarity,'stock-rarity '+row.rarity),el('span','Qty '+format(row.quantity),'stock-quantity'));
  card.append(top,el('h3',row.name),el('p',[row.material,row.category].filter(Boolean).join(' · '),'stock-material'));
  const set=listingSet(row);if(set.setName)card.append(el('p','◇ '+set.setName,'stock-set'));
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
  snapshot=data;selected=selectShop(data,identity);render();
 }catch{$('#shop-notice').textContent=snapshot?'Could not fetch a newer snapshot. The stock shown is from the previous successful load; check its timestamp.':'Unable to load the current stock. Try Refresh snapshot; the share image is only a saved snapshot.';}
 finally{loading=false;$('#shop-refresh').disabled=false;}
}
for(const control of [query,sort,rarity])control.addEventListener(control===query?'input':'change',()=>{shown=24;render();});
$('#shop-more').addEventListener('click',()=>{shown+=24;render();});$('#shop-refresh').addEventListener('click',load);
setInterval(()=>{if(!document.hidden)load();},300000);load();
