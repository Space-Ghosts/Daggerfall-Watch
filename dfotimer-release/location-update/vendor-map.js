import {validateVendorMap,buildingBounds} from './vendor-map-data.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const ns='http://www.w3.org/2000/svg';
const svgNode=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const dialog=el('dialog',null,'vendor-location-dialog'),close=el('button','×','dialog-close'),body=el('div');
dialog.setAttribute('aria-labelledby','vendor-location-title');close.setAttribute('aria-label','Close location');
dialog.append(close,body);document.body.append(dialog);close.addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
let generation=0,abort;
dialog.addEventListener('close',()=>{generation++;abort?.abort();});

function drawMap(map,container){
  const toolbar=el('div',null,'vendor-map-controls');
  const svg=svgNode('svg',{viewBox:`0 0 ${map.width} ${map.height}`,role:'img','aria-label':'North-up town map. The gold building is the selected vendor’s house.'});
  svg.classList.add('vendor-local-map');
  const ground=svgNode('rect',{x:0,y:0,width:map.width,height:map.height,class:'map-ground'});svg.append(ground);
  for(const points of map.roads)svg.append(svgNode('polyline',{points:points.map(p=>p.join(',')).join(' '),class:'map-road'}));
  for(const b of map.buildings){const p=svgNode('polygon',{points:b.points.map(p=>p.join(',')).join(' '),class:b.key===map.selected?.key?'map-building selected':'map-building'});const title=svgNode('title',{});title.textContent=b.key===map.selected?.key?'Vendor’s house':`Building ${b.key}`;p.append(title);svg.append(p);}
  let view={x:0,y:0,w:map.width,h:map.height},drag=null;
  const paint=()=>svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);
  const fit=()=>{view={x:0,y:0,w:map.width,h:map.height};paint();};
  const zoom=factor=>{const w=Math.max(map.width/16,Math.min(map.width,view.w*factor)),h=w*map.height/map.width;view={x:view.x+(view.w-w)/2,y:view.y+(view.h-h)/2,w,h};paint();};
  const focus=()=>{if(!map.selected)return;const b=buildingBounds(map.selected),w=Math.min(map.width,Math.max(b.width*6,b.height*6*map.width/map.height,map.width/8)),h=w*map.height/map.width;view={x:b.x+b.width/2-w/2,y:b.y+b.height/2-h/2,w,h};paint();};
  for(const [label,action] of [['Zoom in',()=>zoom(.65)],['Zoom out',()=>zoom(1/.65)],['Whole town',fit],['Vendor’s house',focus]]){const button=el('button',label);button.type='button';button.addEventListener('click',action);if(label==='Vendor’s house')button.disabled=!map.selected;toolbar.append(button);}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const matrix=svg.getScreenCTM();if(!matrix)return;const at=p.matrixTransform(matrix.inverse());drag={x:at.x,y:at.y,view:{...view},matrix:matrix.inverse()};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const at=p.matrixTransform(drag.matrix);view.x=drag.view.x+drag.x-at.x;view.y=drag.view.y+drag.y-at.y;paint();});
  const end=()=>{drag=null;};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  const north=el('div','↑ N · Gold = vendor’s house · Drag to pan','vendor-map-key');
  container.replaceChildren(toolbar,north,svg,el('p',`Map source: ${map.source}`,'muted'));
  if(!map.selected)container.append(el('p','This town map does not contain a verified position for this building. No marker has been guessed.','notice'));
}

export async function showVendorLocation(row){
  abort?.abort();const controller=new AbortController();abort=controller;const current=++generation;
  const title=el('h2',row.town||'Vendor location');title.id='vendor-location-title';
  const container=el('div',null,'vendor-map-container');container.append(el('p','Loading local-area map…','notice'));
  body.replaceChildren(el('p','VENDOR LOCATION','eyebrow'),title,
    el('p',`${row.seller||'Unnamed seller'} · ${row.region||'Unknown region'}`,'vendor-location-seller'),
    el('p',row.name||'','muted'),container,
    el('p',`Map ${row.map??'unknown'} · Building ${row.buildingKey??'unknown'}`,'vendor-location-ids'),
    el('p','In game: Stats → Vendor, choose the region, find the seller, and select Set waypoint. The marker identifies the house, not the NPC’s position inside it.','dialog-note'));
  if(!dialog.open)dialog.showModal();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    if(!Number.isSafeInteger(row.map)||row.map<=0||row.map>0xffffffff)throw Error();
    const response=await fetch(`maps/${row.map}.json`,{cache:'no-cache',signal:controller.signal});
    if(!response.ok)throw Error();
    let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw Error();chunks.push(chunk);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const map=validateVendorMap(JSON.parse(new TextDecoder().decode(bytes)),row.map,row.buildingKey);
    if(!map)throw Error();if(current!==generation)return;drawMap(map,container);
  }catch{if(current!==generation)return;container.replaceChildren(el('h3','Local-area map unavailable'),el('p','A verified town layout has not been published for this location yet. Use the town and building details below, or Set waypoint in the game.','muted'));}
  finally{clearTimeout(timer);}
}
