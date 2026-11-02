import {socketFacetMatches,weaponType as weaponTypeOf,armorPiece as armorPieceOf} from './vendor-facets.js?v=facets-20261031'; // DFO-VENDOR-FACETS-20261031
import {listingSet,searchText} from './vendor-sets.js';
export function filterListings(rows,{query='',region='',rarity='',category='',material='',sockets='',weaponType='',armorPiece='',set='',currency='',maxPrice='',sort='gilded'}={},now=Date.now()){
 const words=searchText(query).split(/\s+/).filter(Boolean);
 const result=rows.filter(r=>{const membership=listingSet(r);return r.expiresAt>now&&(!region||r.region===region)&&(!rarity||r.rarity===rarity)&&(!category||r.category===category)&&(!material||String(r.material||'').toLowerCase()===material.toLowerCase())&&socketFacetMatches(r,sockets)&&(!weaponType||weaponTypeOf(r)===weaponType)&&(!armorPiece||armorPieceOf(r)===armorPiece)&&(!set||membership.setName===set)&&(!currency||r.currency===currency)&&(maxPrice===''||r.price<=Number(maxPrice))&&words.every(word=>searchText([r.name,r.equipmentType,r.template,r.material,r.rarity,r.seller,r.region,r.town,r.category,membership.setName,membership.setId,...(Array.isArray(r.statLines)?r.statLines:[])].join(' ')).includes(word));});
 const rank={gilded:0,aetheric:1,artifact:2,legendary:3,rare:4,magic:5,common:6};
 result.sort((a,b)=>sort==='price'?a.currency.localeCompare(b.currency)||a.price-b.price:sort==='newest'?(b.listedAt??0)-(a.listedAt??0):sort==='name'?a.name.localeCompare(b.name):(rank[a.rarity]??7)-(rank[b.rarity]??7)||a.name.localeCompare(b.name));
 return result;
}
