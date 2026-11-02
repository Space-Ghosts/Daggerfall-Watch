import {REGION_NAMES} from './vendor-reference.mjs';
import {itemSet} from './vendor-sets.mjs';
const clean=(v,n=160)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,n):'';
const metals=['Iron','Steel','Silver','Elven','Dwarven','Mithril','Adamantium','Ebony','Orcish','Daedric'];
const rarities=new Set(['common','magic','rare','legendary','aetheric','gilded','artifact']);
export function vendorKey(v){return v&&Number.isInteger(v.map)&&v.map>0&&v.map<=0xffffffff&&typeof v.id==='string'&&v.id.length<=128?`${v.map}:${v.id}`:null;}
export function publicShop(vendor,{towns={},checkedAt=null,status='available'}={}){
 if(!vendorKey(vendor)||vendor.entry!=='public')return null;
 const town=towns[vendor.map]??towns[vendor.map&0xfffff];
 return {map:vendor.map,vendorId:clean(vendor.id,128),seller:clean(vendor.owner,64),region:REGION_NAMES[vendor.region]??'Unknown region',town:town?.name??`Town ${vendor.map}`,buildingKey:Number.isSafeInteger(vendor.buildingKey)?vendor.buildingKey:null,checkedAt,status};
}
export function publicListing(row,vendor,{names={},towns={},books={},now=Date.now()}={}){
 if(!row||row.state!=='open'||!Number.isFinite(row.expiresAt)||row.expiresAt*1000<=now||!Number.isSafeInteger(row.units)||row.units<1||!Number.isSafeInteger(row.price)||row.price<0||!vendorKey(vendor)||vendor.entry!=='public')return null;
 const item=row.item??{},template=names[item.templateIndex]??'',category=clean(item.group||row.kind,50)||'Other';
 const material=category==='Armor'?(item.material===0?'Leather':[256,259].includes(item.material)?'Chain':metals[item.material&255]??''):category==='Weapons'?metals[item.material]??'':clean(row.material,50);
 const enchanted=!!(item.enchantments?.length||item.customEnchantments?.length);
 const rarity=item.artifact?'artifact':rarities.has(item.rarity)?item.rarity:enchanted?'magic':'common';
 let name=clean(item.name||template||row.material||'Unknown item').replaceAll('%it',template);
 if(category==='Books')name=books[item.message]??name;
 if(enchanted&&item.isIdentified!==true)name=template||'Unidentified item';
 name=name.replaceAll('%mat',material);
 const town=towns[vendor.map]??towns[vendor.map&0xfffff];
 const condition=Number.isFinite(item.currentCondition)&&Number.isFinite(item.maxCondition)&&item.maxCondition>0?Math.max(0,Math.min(100,Math.floor(item.currentCondition/item.maxCondition*100))):null;
 return {id:clean(row.id,128),name,template,category,material,rarity,...itemSet(item),condition,quantity:row.units,price:row.price,currency:row.currency==='gold'?'gold':'marks',seller:clean(vendor.owner,64),region:REGION_NAMES[vendor.region]??'Unknown region',town:town?.name??`Town ${vendor.map}`,map:vendor.map,buildingKey:Number.isSafeInteger(vendor.buildingKey)?vendor.buildingKey:null,vendorId:clean(vendor.id,128),listedAt:Number.isFinite(row.at)?row.at*1000:null,expiresAt:row.expiresAt*1000,checkedAt:now};
}
export async function scanVendors({call,names,towns,books,regions=REGION_NAMES.map((_,i)=>i),clock=Date.now,progress=()=>{}}){
 const startedAt=clock(),vendors=new Map(),rows=new Map(),shops=[],failedRegions=[],failedVendors=[],cappedRegions=[];let regionsChecked=0,vendorsChecked=0;
 for(const region of regions){
  try{
   const d=await call('vendors',{region});if(!Array.isArray(d.rows))throw Error('invalid-response');
   regionsChecked++;
   // The board supplements its 300 newest listings with one row per public
   // vendor (also capped at 300). Count distinct public vendors, not listings.
   const publicVendors=new Set(d.rows.filter(r=>r.home?.entry==='public').map(r=>vendorKey(r.vendor)).filter(Boolean));
   if(publicVendors.size>=300)cappedRegions.push(region);
   for(const r of d.rows){if(r.home?.entry!=='public'||!vendorKey(r.vendor))continue;vendors.set(vendorKey(r.vendor),{...r.vendor,entry:'public',owner:r.owner,buildingKey:r.buildingKey,region});}
  }catch(e){if(e.fatal)throw e;failedRegions.push(region);}
  progress({phase:'regions',done:regionsChecked,total:regions.length,vendors:vendors.size});
 }
 for(const [key,vendor] of vendors){
  try{
   const d=await call('vendor',{vendor:{map:vendor.map,id:vendor.id}});
   if(d.error==='vendor-gone'){vendorsChecked++;continue;}
   if(!Array.isArray(d.rows)||vendorKey(d.vendor)!==key)throw Error('invalid-response');
   // Directory access is authoritative. Use only public directory location metadata.
   for(const row of d.rows){const item=publicListing(row,vendor,{names,towns,books,now:clock()});if(item?.id)rows.set(item.id,item);}
   shops.push(publicShop(vendor,{towns,checkedAt:clock()}));
   vendorsChecked++;
  }catch(e){if(e.fatal)throw e;failedVendors.push(key);shops.push(publicShop(vendor,{towns,status:'unavailable'}));}
  progress({phase:'stock',done:vendorsChecked,total:vendors.size});
 }
 const finishedAt=clock();
 return {version:1,startedAt,updatedAt:finishedAt,refreshMinutes:60,coverage:{regionsChecked,totalRegions:regions.length,vendorsDiscovered:vendors.size,vendorsChecked,failedRegions:failedRegions.map(r=>REGION_NAMES[r]),failedVendorCount:failedVendors.length,cappedRegions:cappedRegions.map(r=>REGION_NAMES[r]),complete:!failedRegions.length&&!failedVendors.length&&!cappedRegions.length},shops:shops.filter(Boolean),listings:[...rows.values()].filter(r=>r.expiresAt>finishedAt)};
}
