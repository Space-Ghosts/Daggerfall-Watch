// Data contract for verified, north-up town geometry. Never infer coordinates from IDs.
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
export function validateVendorMap(raw,mapId,buildingKey){
  if(!raw||raw.version!==1||raw.map!==mapId||raw.orientation!=='north-up'||raw.verified!==true||
     typeof raw.source!=='string'||!raw.source.trim()||raw.source.length>500||
     !Number.isFinite(raw.width)||!Number.isFinite(raw.height)||raw.width<=0||raw.height<=0||raw.width>4096||raw.height>4096||
     !Array.isArray(raw.buildings)||raw.buildings.length>5000)return null;
  const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[0]<=raw.width&&p[1]>=0&&p[1]<=raw.height;
  const polygon=points=>Array.isArray(points)&&points.length>=3&&points.length<=64&&points.every(point);
  const keys=new Set();
  for(const b of raw.buildings){if(!b||!uint(b.key)||keys.has(b.key)||!polygon(b.points))return null;keys.add(b.key);}
  const roads=raw.roads??[];
  if(!Array.isArray(roads)||roads.length>2000||roads.some(r=>!Array.isArray(r)||r.length<2||r.length>128||!r.every(point)))return null;
  const buildings=raw.buildings.map(b=>({key:b.key,points:b.points.map(p=>[...p])}));
  return {map:raw.map,width:raw.width,height:raw.height,source:raw.source,roads:roads.map(r=>r.map(p=>[...p])),buildings,
          selected:uint(buildingKey)?buildings.find(b=>b.key===buildingKey)??null:null};
}

export function buildingBounds(building){
  const xs=building.points.map(p=>p[0]),ys=building.points.map(p=>p[1]);
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
