// Exact post-spawn DFO dragon tile. Catalogue must be derived from the game's
// own eligible ground scans, not the obsolete public dragon salt.
// Source: net/gate/gateLaw.js, systems/dragon/dragonSite.js,
// systems/gate/gateSite.js, systems/gate/theatreGateSite.js.
export const CATALOGUE_VERSION = 1;
const SALT = 0x6a7e, LANE_SPAN = 100000000, SIDE = 16384, BOUND = 8192;
function hash(...ns) {
  let h = 0x811c9dc5;
  for (const n of ns) {
    h ^= n >>> 0; h = Math.imul(h, 0x01000193); h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  }
  return h >>> 0;
}
const gateRoll = (n, k) => hash(SALT, n, k);
const bag = (round, count) => {
  const a = Array.from({length:count}, (_,i)=>i);
  for (let i=count-1; i>0; i--) {
    const j=hash(SALT,round,11,i)%(i+1);
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
};
export function selectArea(n, ids) {
  const count=ids?.length??0;
  if (!count) return null;
  const lane=Math.floor(n/LANE_SPAN), gameDay=n%LANE_SPAN;
  const index=Math.floor(gameDay)+lane*14; // GATE_EVERY_DAYS=1
  if (count<=2) return ids[((index%count)+count)%count];
  const round=Math.floor(index/count), at=index-round*count;
  const shuffled=bag(round,count), prev=bag(round-1,count);
  if (shuffled[0]===prev[count-1]) [shuffled[0],shuffled[1]]=[shuffled[1],shuffled[0]];
  return ids[shuffled[at]];
}
function validGroup(g) {
  return g && Number.isSafeInteger(g.id) && Array.isArray(g.pixels) &&
    g.pixels.length>=24 && g.pixels.every(n=>Number.isSafeInteger(n)&&n>=0&&n<270000000) &&
    Array.isArray(g.town) && g.town.length===g.pixels.length;
}
export function validCatalogue(cat) {
  if (!cat || cat.version!==CATALOGUE_VERSION || !cat.lanes || typeof cat.lanes!=='object') return false;
  let seen=0;
  for (const [lane,row] of Object.entries(cat.lanes)) {
    if (!/^[0-8]$/.test(lane) || !row || !Array.isArray(row.groups) || !Array.isArray(row.towns)) return false;
    if (!row.groups.length || row.groups.some(g=>!validGroup(g))) return false;
    const ids=row.groups.map(g=>g.id);
    if(ids.some((id,i)=>i>0 && id<=ids[i-1]))return false;
    seen++;
  }
  return seen>0;
}
export function dragonLocation(d, cat) {
  if (!cat || !d || !Number.isSafeInteger(d.siteDay) || d.siteDay<50000000 || d.siteDay>=100000000 ||
      !Number.isInteger(d.lane) || d.lane<0 || d.lane>8) return null;
  const row=cat.lanes[String(d.lane)];
  if (!row?.groups?.length) return null;
  const n=d.siteDay+d.lane*LANE_SPAN;
  const area=selectArea(n,row.groups.map(g=>g.id));
  const group=row.groups.find(g=>g.id===area);
  if(!group || !group.pixels.length)return null;
  const i=gateRoll(n,2)%group.pixels.length;
  const key=group.pixels[i];
  const px=d.lane===0?key%1000:key%SIDE-BOUND;
  const py=d.lane===0?Math.floor(key/1000):Math.floor(key/SIDE)-BOUND;
  if(!Number.isInteger(px)||!Number.isInteger(py)||Math.abs(px)>=8192||Math.abs(py)>=8192)return null;
  const idx=group.town[i], town=Number.isInteger(idx)&&idx>=0?row.towns[idx]:null;
  return {px,py, sx:(px+.5)*32768,sz:(499-py+.5)*32768, area,
    town:town&&typeof town.name==='string'?{name:town.name,px:town.px,py:town.py}:null};
}
export function townDirection(loc) {
  if(!loc?.town)return null;
  const dx=loc.px-loc.town.px,dy=loc.py-loc.town.py;
  const b=(Math.atan2(dx,-dy)*180/Math.PI+360)%360;
  const dirs=['N','NE','E','SE','S','SW','W','NW'];
  return {distanceKm:Math.hypot(dx,dy)*.8192, bearing:Math.round(b),compass:dirs[Math.round(b/45)%8]};
}
