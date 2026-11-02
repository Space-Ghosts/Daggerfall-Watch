// Public shop identities are the game's (map, vendorId) pair, never seller names.
export function shopKey(value){
 if(!value||!Number.isSafeInteger(value.map)||value.map<1||value.map>0xffffffff||typeof value.vendorId!=='string'||!value.vendorId.length||value.vendorId.length>128||/[\u0000-\u001f\u007f]/.test(value.vendorId))return null;
 return `${value.map}:${value.vendorId}`;
}
export function shopHash(value){return shopKey(value)?`#shop/${value.map}/${encodeURIComponent(value.vendorId)}`:null;}
export function parseShopHash(hash){
 const match=/^#shop\/([0-9]{1,10})\/([^/]+)$/.exec(hash);
 if(!match)return null;
 try{const value={map:Number(match[1]),vendorId:decodeURIComponent(match[2])};return shopKey(value)?value:null;}catch{return null;}
}
export function shopPath(value){
 if(!shopKey(value))return null;
 const token=Array.from(new TextEncoder().encode(value.vendorId),byte=>byte.toString(16).padStart(2,'0')).join('');
 return `shops/${value.map}/${token}/`;
}
export function shopLink(value){const path=shopPath(value);return path?`https://dfo.spaceghosts.com/${path}`:null;}
export function selectShop(snapshot,identity){
 const key=shopKey(identity);if(!key)return {shop:null,listings:[]};
 const listings=snapshot.listings.filter(row=>shopKey(row)===key);
 const shop=Array.isArray(snapshot.shops)?snapshot.shops.find(row=>shopKey(row)===key):listings[0];
 // With older feeds, stock itself supplies the public shop metadata.
 return {shop:shop??null,listings:!shop||shop.status==='unavailable'?[]:listings};
}
