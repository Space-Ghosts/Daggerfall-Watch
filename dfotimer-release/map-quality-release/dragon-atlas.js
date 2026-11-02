// Daggerfall Watch — source-calibrated DFO world map, navigation viewer v3.
// Uses actual image pixel dimensions and the world extent of the DFO capture.
// The image and marker never use different coordinate systems.
import {createVectorMap} from './dragon-vector.js?v=vector-20261030';
import { dragonLocation } from './dragon.js?v=dragon-20261029';

const byId = id => document.getElementById(id);
const node = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const finite = Number.isFinite;
const M_PER_TILE = 819.2;  // DFO source: 32768 world units / 40 units per metre
const KM_PER_TILE = M_PER_TILE / 1000;
const validSite = v => v && Number.isInteger(v.px) && Number.isInteger(v.py);
const compass = (dx, dy) => ['N','NE','E','SE','S','SW','W','NW'][(Math.round(Math.atan2(dx,-dy)/(Math.PI/4))+8)%8];
const nice = km => km < 1 ? `${Math.round(km*1000)} m` : `${km.toFixed(km<10?1:0)} km`;

let catalogPromise = null;
async function getData() {
  if (!catalogPromise) catalogPromise = Promise.all([
    fetch('atlas/DFO-Actual-Map.json', {cache:'no-store'}).then(r => { if (!r.ok) throw Error('Map calibration unavailable'); return r.json(); }),
    fetch('dragon-locations.json', {cache:'no-store'}).then(r => { if (!r.ok) throw Error('Dragon location catalog unavailable'); return r.json(); })
  ]).then(([map, catalog]) => {
    if (map.version !== 1 || map.northUp !== true || ![map.x0,map.y0,map.w,map.h].every(finite) || map.w <= 1000 || map.h <= 500 || catalog.version !== 1 || !catalog.sites)
      throw Error('Unsupported map calibration or location data');
    return {map,catalog};
  }).catch(e => {catalogPromise=null;throw e;});
  return catalogPromise;
}

async function showMap(panel, map, site, location, token) {
  panel.replaceChildren();
  const image = node('img','atlas-v3-image');
  image.alt = 'Actual Daggerfall Online rendered Tamriel world map';
  image.draggable = false;
  image.decoding = 'async';
  const iw = map.renderWidth, ih = map.renderHeight;
  if (!finite(iw) || !finite(ih) || iw<=0 || ih<=0 || Math.abs(iw/ih-map.w/map.h)>0.004)
    throw Error('Map image and coordinate calibration have different aspect ratios');
  let vectorData=null;
  try {
    const response=await fetch('dragon-vector-map.json?v=vector-20261030');
    if(!response.ok)throw Error('No vector map');
    const data=await response.json();
    if(data.version!==1||!Array.isArray(data.coast)||!Array.isArray(data.towns)||
       Math.abs(data.fit.ox*data.fit.ppu+map.x0)>.01||Math.abs(data.fit.oy*data.fit.ppu+map.y0)>.01||
       Math.abs(data.fit.ppu*320-map.w)>.01)throw Error('Map coordinates differ');
    vectorData=data;
  } catch { /* Keep the calibrated original available if the sharp layer fails. */ }
  if (!panel.isConnected || panel.dataset.atlasToken !== token) return;
  const pxPerTile = iw/map.w;
  const screenPoint = ({px,py}) => ({ x:(px+0.5-map.x0)*iw/map.w, y:(py+0.5-map.y0)*ih/map.h });
  const target = screenPoint(site);
  if (!(target.x>=0 && target.y>=0 && target.x<=iw && target.y<=ih)) throw Error('Predicted dragon is outside the captured map');
  const town = validSite(site.town) ? site.town : null;
  const tp = town ? screenPoint(town) : null;
  const hasTown = tp && tp.x>=0 && tp.y>=0 && tp.x<=iw && tp.y<=ih;
  const dx = hasTown ? site.px-town.px : 0;
  const dy = hasTown ? site.py-town.py : 0;
  const distance = hasTown ? Math.hypot(dx,dy)*KM_PER_TILE : 0;
  const infoLine = node('div','atlas-v3-place',location.text);
  const directions = node('p','atlas-v3-directions',hasTown
    ? `${nice(distance)} straight-line ${compass(dx,dy)} of ${town.name || 'the nearby town'} · Red = predicted dragon · Blue = town centre · Dashed line = direction, not a road`
    : 'Red crosshair marks the exact predicted dragon tile centre.');
  const controls = node('div','atlas-v3-controls');
  const viewport = node('div','atlas-v3-viewport');
  viewport.setAttribute('role','region');
  viewport.setAttribute('aria-label','Daggerfall Online map. Drag to pan. Mouse wheel to zoom.');
  const content = node('div','atlas-v3-content');
  content.style.width = `${iw}px`;
  content.style.height = `${ih}px`;
  image.style.width = `${iw}px`;
  image.style.height = `${ih}px`;
  content.append(image);
  viewport.append(content);
  const canvas=node('canvas','atlas-vector-canvas');
  canvas.setAttribute('aria-hidden','true');viewport.append(canvas);
  const drawVector=vectorData?createVectorMap(canvas,vectorData,map,town,site):null;
  let sharp=!!drawVector;
  const overlays = node('div','atlas-v3-overlays');
  viewport.append(overlays);
  const routeSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  routeSvg.classList.add('atlas-v3-route');
  routeSvg.setAttribute('aria-hidden','true');
  const line = document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('stroke','#514128');
  line.setAttribute('stroke-width','2');
  line.setAttribute('stroke-dasharray','6 5');
  line.setAttribute('opacity','0.9');
  routeSvg.append(line); overlays.append(routeSvg);
  const marker = (kind,label) => {
    const e = node('div',`atlas-v3-marker atlas-v3-${kind}`);
    e.setAttribute('aria-label',label);
    e.title=label;
    // Crosshair and 3px centre dot, NOT a large label obscuring the terrain.
    e.append(node('span','atlas-v3-ring'),node('span','atlas-v3-cross atlas-v3-cross-h'),node('span','atlas-v3-cross atlas-v3-cross-v'),node('span','atlas-v3-centre'));
    const tip = node('span','atlas-v3-marker-tip',label);
    e.append(tip);overlays.append(e);return e;
  };
  const dragonMarker=marker('dragon',`Predicted dragon · ${site.px}, ${site.py}`);
  const townMarker=hasTown?marker('town',town.name || 'Nearby town'):null;
  const ruler=node('div','atlas-v3-ruler');
  const stats=node('div','atlas-v3-stats');
  panel.append(infoLine,directions,controls,viewport,ruler,stats);
  let zoom=1, offsetX=0, offsetY=0, pointer=null, labels=true;
  const dims=()=>({w:viewport.clientWidth||760,h:viewport.clientHeight||500});
  const MAX_ZOOM = Math.max(1,80/pxPerTile); // Limit to 80 screen pixels per world tile.
  const mapToScreen = p=>({x:offsetX+p.x*zoom,y:offsetY+p.y*zoom});
  const clampPan=()=>{
    const {w,h}=dims();
    offsetX=iw*zoom<w?(w-iw*zoom)/2:Math.max(w-iw*zoom-20,Math.min(20,offsetX));
    offsetY=ih*zoom<h?(h-ih*zoom)/2:Math.max(h-ih*zoom-20,Math.min(20,offsetY));
  };
  function renderRuler(){
    const {w}=dims(), pxPerKm=pxPerTile*zoom/KM_PER_TILE;
    const niceSteps=[0.05,.1,.2,.5,1,2,5,10,20,50,100,200,500];
    let selected=niceSteps[0];
    for (const k of niceSteps) if (k*pxPerKm<=Math.max(85,Math.min(240,w*.36))) selected=k;
    ruler.replaceChildren();
    const bar=node('span','atlas-v3-ruler-line');bar.style.width=`${selected*pxPerKm}px`;
    ruler.append(bar,node('span','',`${nice(selected)} — straight-line scale`));
  }
  const render=()=>{
    clampPan();
    canvas.hidden=!sharp;content.hidden=sharp;
    if(!sharp&&!image.getAttribute('src'))image.src=`atlas/DFO-Actual-Map.png?v=atlas-v3`;
    if(sharp)drawVector({...dims(),offsetX,offsetY,zoom,pxPerTile});
    content.style.transform=`translate3d(${offsetX}px,${offsetY}px,0) scale(${zoom})`;
    const a=mapToScreen(target), b=hasTown?mapToScreen(tp):null;
    const {w,h}=dims();
    for (const [el,p] of [[dragonMarker,a],[townMarker,b]]){
      if(!el||!p)continue;
      el.style.transform=`translate3d(${p.x}px,${p.y}px,0)`;
      el.hidden= p.x < -50 || p.x>w+50 || p.y < -50 || p.y>h+50;
      // Crosshair size follows zoom up to a readable cap, but centre always = exact tile centre.
      const sz=Math.max(9,Math.min(24,12+Math.log2(Math.max(1,zoom*pxPerTile))*2));
      el.style.setProperty('--cross-size',`${sz}px`);
      el.classList.toggle('atlas-v3-labels-on',labels);
    }
    dragonMarker.querySelector('.atlas-v3-marker-tip').style.top=b&&Math.hypot(a.x-b.x,a.y-b.y)<70?'18px':'-18px';
    if(b){line.setAttribute('x1',String(a.x));line.setAttribute('y1',String(a.y));line.setAttribute('x2',String(b.x));line.setAttribute('y2',String(b.y));}
    line.style.display = b && Math.hypot(a.x-b.x,a.y-b.y)>25 ? '' : 'none';
    renderRuler();
    const spanWorldWidth=w/(zoom*pxPerTile), spanWorldHeight=h/(zoom*pxPerTile);
    stats.textContent=`Visible area ~${nice(spanWorldWidth*KM_PER_TILE)} × ${nice(spanWorldHeight*KM_PER_TILE)} · ${sharp?'Coastlines & towns · straight-line guide; roads and buildings not shown':'Original game atlas · close zoom is limited by image resolution'}`;
  };
  const at=(x,y,z)=>{const {w,h}=dims();zoom=Math.max(.01,Math.min(MAX_ZOOM,z));offsetX=w/2-x*zoom;offsetY=h/2-y*zoom;render();};
  const fitAll=()=>{const {w,h}=dims();at(iw/2,ih/2,Math.min(w/iw,h/ih)*.95);};
  const viewDragon=()=>{
    const {w,h}=dims();
    // 10-16 world tiles across: readable geographic context and a precise marker.
    const z=Math.min(w/(16*pxPerTile),h/(10*pxPerTile),MAX_ZOOM);
    at(target.x,target.y,z);
  };
  const viewTown=()=>{if(hasTown){const {w,h}=dims();at(tp.x,tp.y,Math.min(w/(18*pxPerTile),h/(12*pxPerTile),MAX_ZOOM));}else viewDragon();};
  const viewBoth=()=>{
    if(!hasTown){viewDragon();return;}
    const {w,h}=dims();
    const sep=Math.hypot(target.x-tp.x,target.y-tp.y);
    const zGoal = (sharp?220:80)/Math.max(1,sep); // Crisp local separation; original atlas keeps wider context.
    const zFit = Math.min((w-135)/Math.max(1,Math.abs(target.x-tp.x)),(h-125)/Math.max(1,Math.abs(target.y-tp.y)));
    const z=Math.min(MAX_ZOOM,zFit,Math.max(0.3,zGoal));
    at((target.x+tp.x)/2,(target.y+tp.y)/2,z);
  };
  const zoomAt=(factor,cx=dims().w/2,cy=dims().h/2)=>{
    const next=Math.max(Math.min(dims().w/iw,dims().h/ih)*.7,Math.min(MAX_ZOOM,zoom*factor));
    const px=(cx-offsetX)/zoom,py=(cy-offsetY)/zoom;
    zoom=next;offsetX=cx-px*next;offsetY=cy-py*next;render();
  };
  const button=(label,action)=>{const b=node('button','atlas-v3-button',label);b.type='button';b.addEventListener('click',action);controls.append(b);return b;};
  button('＋ Zoom',()=>zoomAt(1.5));button('－ Zoom',()=>zoomAt(1/1.5));
  button('Both markers',viewBoth);button('Dragon',viewDragon);
  if(hasTown)button('Town',viewTown);
  button('Full map',fitAll);
  if(drawVector){const mode=button('Original atlas',()=>{sharp=!sharp;mode.textContent=sharp?'Original atlas':'Sharp map';viewBoth();});mode.setAttribute('aria-label','Switch between sharp navigation map and original game atlas');}
  const labelsBtn=button('Hide labels',()=>{labels=!labels;labelsBtn.textContent=labels?'Hide labels':'Show labels';render();});
  viewport.addEventListener('pointerdown',e=>{
    if(e.button!==0) return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:offsetX,startY:offsetY};
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId) return;
    offsetX=pointer.startX+e.clientX-pointer.x;offsetY=pointer.startY+e.clientY-pointer.y;render();
  });
  const end=e=>{if(pointer?.id===e.pointerId)pointer=null;};
  viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
  viewport.addEventListener('wheel',e=>{
    e.preventDefault();const rect=viewport.getBoundingClientRect();zoomAt(e.deltaY<0?1.25:.8,e.clientX-rect.left,e.clientY-rect.top);
  },{passive:false});
  // Responsive resizing without resetting the user's chosen location.
  if('ResizeObserver' in window){const observer=new ResizeObserver(()=>render());observer.observe(viewport);panel._atlasObserver?.disconnect();panel._atlasObserver=observer;}
  requestAnimationFrame(viewBoth);
}

async function mount(){
  const dialog=byId('info-dialog'),body=byId('dialog-content');
  if(!dialog?.open||!body)return;
  const header=body.querySelector('h2');
  if(!header||!/Dwarven Dragon/i.test(header.textContent||''))return;
  let panel=byId('dragon-location-map');
  if(!panel){panel=node('div','atlas-v3-panel');panel.id='dragon-location-map';const anchor=[...body.querySelectorAll('h3')].find(e=>e.textContent?.trim()==='Where to look');if(anchor)anchor.after(panel);else header.after(panel);}
  panel.classList.add('atlas-v3-panel');
  panel._atlasObserver?.disconnect();
  const token=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  panel.dataset.atlasToken=token;
  panel.replaceChildren(node('p','atlas-v3-loading','Loading Daggerfall Online map…'));
  try{
    const {map,catalog}=await getData();
    const location=dragonLocation(catalog,Date.now());
    if(!location.site)throw Error('Exact coordinates are not available for this predicted spawn');
    await showMap(panel,map,location.site,location,token);
  }catch(e){if(panel.isConnected&&panel.dataset.atlasToken===token)panel.replaceChildren(node('p','atlas-v3-error',String(e.message||e)));}
}
const dialog=byId('info-dialog'),body=byId('dialog-content');
if(dialog&&body){
  let timer=null;
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(mount,80);});
  observer.observe(body,{childList:true});
  dialog.addEventListener('close',()=>{clearTimeout(timer);});
  if(dialog.open)mount();
}
