// Daggerfall Watch vendor facet helpers (2026-10-31).
// This file is intentionally independent of game/Node imports.
const gear = new Set(['Weapons', 'Armor', 'Jewellery']);
const title = value => typeof value === 'string' ? value.trim() : '';
export function socketCount(row) {
  if (Number.isSafeInteger(row?.socketCount) && row.socketCount >= 0 && row.socketCount <= 32) return row.socketCount;
  if (Array.isArray(row?.sockets)) return row.sockets.length;
  if (typeof row?.socket === 'string' && row.socket) return 1;
  return null; // Old snapshots lack this property; unknown is not zero.
}
export function emptySocketCount(row) {
  if (Number.isSafeInteger(row?.emptySocketCount) && row.emptySocketCount >= 0) return row.emptySocketCount;
  if (Array.isArray(row?.sockets)) return row.sockets.filter(v=>v==='empty').length;
  return row?.socket==='empty' ? 1 : 0;
}
export function socketFacetMatches(row, filter) {
  if (!filter) return true;
  const n = socketCount(row);
  if (n === null) return false;
  if (filter==='any') return n>=1;
  if (filter==='empty') return n>=1 && emptySocketCount(row)>0;
  if (filter==='3+') return n>=3;
  if (/^[012]$/.test(filter)) return n===Number(filter);
  return false;
}

// The vendor scanner already publishes the game's base item template.
// Prefer it over unique item names; unique items often have unrelated names.
export function weaponType(row) {
  if (row?.category!=='Weapons') return '';
  const t=title(row?.template)||title(row?.equipmentType)||title(row?.name);
  return t.replace(/^(?:Iron|Steel|Silver|Elven|Dwarven|Mithril|Adamantium|Ebony|Orcish|Daedric)\s+/i,'') || 'Other weapon';
}
// DFO-VENDOR-CLEAN-FILTERS-20261031: one filter option per wearable slot, not per template variant.
// Official DFO equipSlots (src/characters/equipRules.js). Source snapshots may omit templateIndex,
// so resolve by actual template name first, falling back to the category's clothing slot.
const ARMOR_SLOT_ORDER = Object.freeze(['Head','Shoulders','Chest','Shirt','Hands','Legs','Feet','Cloak','Shield','Other armor']);
export function sortArmorPieces(values) {
  const found=new Set(values.filter(Boolean));
  return [...ARMOR_SLOT_ORDER.filter(x=>found.has(x)),...[...found].filter(x=>!ARMOR_SLOT_ORDER.includes(x)).sort()];
}
export function armorPiece(row) {
  const group=row?.category;
  const armor=group==='Armor',cloth=group==='MensClothing'||group==='WomensClothing'||group==='Clothing';
  if (!armor&&!cloth) return '';
  const id=Number(row?.templateIndex);
  if (Number.isInteger(id)&&id>0) {
    if (armor) {
      const slot={102:'Chest',103:'Hands',104:'Legs',105:'Shoulders',106:'Shoulders',107:'Head',108:'Feet',109:'Shield',110:'Shield',111:'Shield',112:'Shield'}[id];
      if (slot) return slot;
    } else {
      if ([154,155,191,192].includes(id)) return 'Cloak';
      if ((id>=147&&id<=150)||(id>=186&&id<=189)) return 'Feet';
      if ([151,152,153,156,162,174,175,190,193,199,211,212,213].includes(id)) return 'Legs';
      if ((id>=141&&id<=216)) return 'Shirt';
    }
  }
  // Prefer the base template. Named legendaries don't necessarily describe their armor slot.
  const s=(title(row?.template)||title(row?.equipmentType)||title(row?.name)).toLowerCase();
  if (/\b(?:shield|buckler|kite shield|tower shield)\b/.test(s)) return 'Shield';
  if (/\b(?:cloak|cape|mantle)\b/.test(s)) return 'Cloak';
  if (/\b(?:pauldrons?|spaulders?|shoulders?|armguards?|arm plates?|arms?)\b/.test(s)) return 'Shoulders';
  if (/\b(?:helms?|helmets?|hoods?|cowls?|coifs?|caps?|hats?|crowns?|masks?|visors?|head|warhelm)\b/.test(s)) return 'Head';
  if (/\b(?:gauntlets?|gloves?|hands?|grips?|bracers?|vambraces?)\b/.test(s)) return 'Hands';
  if (/\b(?:greaves?|leggings?|leg(?:gings)?|cuisse|cuisses|chausses|tassets?|pants|trousers|breeches|skirts?)\b/.test(s)) return 'Legs';
  if (/\b(?:sollerets?|sabatons?|boots?|shoes?|slippers?|sandals?|feet|foot)\b/.test(s)) return 'Feet';
  if (cloth) return 'Shirt'; // every remaining DFO clothing template equips to ChestClothes.
  if (/\b(?:cuirass(?:es)?|chest|breastplates?|hauberks?|robes?|jerkins?|tunics?|vests?|brigandine|plate|shirt)\b/.test(s)) return 'Chest';
  return 'Other armor';
}
export function facetLabel(row) {
  if (!gear.has(row?.category)) return '';
  const count=socketCount(row);
  if (count===null) return 'Sockets not scanned';
  const empty=emptySocketCount(row);
  return `${count} ${count===1?'socket':'sockets'}${count && empty ? ` (${empty} empty)` : ''}`;
}
