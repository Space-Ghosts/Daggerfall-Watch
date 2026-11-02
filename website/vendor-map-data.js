// Bounded public exterior geometry; never accept markup, URLs, or inferred ID coordinates.
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
export function validateVendorMap(raw,mapId,buildingKey){
  if(!raw||raw.version!==2||raw.map!==mapId||!uint(mapId)||raw.orientation!=='north-up'||
     typeof raw.source!=='string'||!raw.source.trim()||raw.source.length>500||
     typeof raw.layout!=='string'||raw.layout.length>96||!Number.isSafeInteger(raw.layoutCheckedAt)||
     !Number.isInteger(raw.width)||!Number.isInteger(raw.height)||raw.width<1||raw.height<1||raw.width>1024||raw.height>1024||
     !Array.isArray(raw.buildings)||raw.buildings.length>5000||!Array.isArray(raw.rectangles)||raw.rectangles.length>100000)return null;
  const keys=new Set(),inside=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<=raw.width&&y<=raw.height;
  for(const b of raw.buildings){if(!b||!uint(b.key)||keys.has(b.key)||!inside(b.x,b.y)||typeof b.name!=='string'||b.name.length>200)return null;keys.add(b.key);}
  for(const r of raw.rectangles)if(!Array.isArray(r)||r.length!==5||!r.every(Number.isInteger)||r[2]<=0||r[3]<=0||r[4]<0||r[4]>3||!inside(r[0],r[1])||!inside(r[0]+r[2],r[1]+r[3]))return null;
  const buildings=raw.buildings.map(({key,x,y,name})=>({key,x,y,name}));
  return {map:raw.map,width:raw.width,height:raw.height,source:raw.source,layout:raw.layout,layoutCheckedAt:raw.layoutCheckedAt,
    name:typeof raw.name==='string'?raw.name.slice(0,160):'',rectangles:raw.rectangles.map(r=>[...r]),buildings,selected:uint(buildingKey)?buildings.find(b=>b.key===buildingKey)??null:null};
}
export function buildingBounds(b){return {x:b.x-2,y:b.y-2,width:4,height:4};}
