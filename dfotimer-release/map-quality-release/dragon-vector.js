// Screen-resolution drawing over the same world coordinates as the game atlas.
// Geometry is derived privately from the game's map law; no terrain is invented.
export function createVectorMap(canvas, data, map, selectedTown, target) {
  const ctx = canvas.getContext('2d');
  const prepare = chains => chains.map(points => ({points,
    minX:Math.min(...points.map(p=>p[0])), maxX:Math.max(...points.map(p=>p[0])),
    minY:Math.min(...points.map(p=>p[1])), maxY:Math.max(...points.map(p=>p[1]))}));
  const coast=prepare(data.coast), borders=prepare(data.borders);
  return ({w,h,offsetX,offsetY,zoom,pxPerTile}) => {
    const dpr=Math.min(window.devicePixelRatio||1,3), scale=zoom*pxPerTile;
    const width=Math.round(w*dpr),height=Math.round(h*dpr);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#f0e3c3';ctx.fillRect(0,0,w,h);
    const x=v=>offsetX+(v-map.x0)*scale, y=v=>offsetY+(v-map.y0)*scale;
    const x0=map.x0-offsetX/scale, y0=map.y0-offsetY/scale, x1=x0+w/scale,y1=y0+h/scale;
    // A subtle navigation grid: each fine cell is one 819.2 m game tile.
    const step=scale>=18?1:scale>=4?5:scale>=.8?25:100;
    ctx.lineWidth=1;ctx.strokeStyle='#80694724';ctx.beginPath();
    for(let a=Math.ceil(x0/step)*step;a<=x1;a+=step){ctx.moveTo(x(a),0);ctx.lineTo(x(a),h);}
    for(let b=Math.ceil(y0/step)*step;b<=y1;b+=step){ctx.moveTo(0,y(b));ctx.lineTo(w,y(b));}
    ctx.stroke();
    const stroke=(chains,color,lineWidth,dash=[])=>{
      ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.setLineDash(dash);ctx.beginPath();
      for(const c of chains){
        if(c.maxX<x0||c.minX>x1||c.maxY<y0||c.minY>y1)continue;
        c.points.forEach((p,i)=>i?ctx.lineTo(x(p[0]),y(p[1])):ctx.moveTo(x(p[0]),y(p[1])));
      }
      ctx.stroke();ctx.setLineDash([]);
    };
    stroke(coast,'#829f9c55',7);stroke(coast,'#466e73',1.8);
    stroke(borders,'#8b6f50',1.4,[7,5]);
    const blocked=[];
    for(const p of [selectedTown,target])if(p)blocked.push([x(p.px+.5)-16,y(p.py+.5)-24,x(p.px+.5)+220,y(p.py+.5)+30]);
    const towns=data.towns.filter(t=>t.px>=x0&&t.px<=x1&&t.py>=y0&&t.py<=y1);
    ctx.font='600 13px system-ui, sans-serif';ctx.textBaseline='middle';
    let labels=0;const dots=new Set();
    for(const town of towns){
      if(town.px===selectedTown?.px&&town.py===selectedTown?.py)continue;
      const a=x(town.px+.5),b=y(town.py+.5);
      const cell=`${Math.floor(a/8)},${Math.floor(b/8)}`;if(dots.has(cell))continue;dots.add(cell);
      ctx.fillStyle='#7a5735';ctx.fillRect(a-2,b-2,4,4);
      if(scale<.4||labels>=50)continue;
      const width=ctx.measureText(town.name).width, box=[a+7,b-11,a+width+13,b+11];
      if(box[2]>w-8||box[0]<8||box[1]<8||box[3]>h-8||blocked.some(r=>box[0]<r[2]&&box[2]>r[0]&&box[1]<r[3]&&box[3]>r[1]))continue;
      blocked.push(box);labels++;
      ctx.lineWidth=4;ctx.strokeStyle='#f0e3c3';ctx.strokeText(town.name,a+10,b);
      ctx.fillStyle='#4b3623';ctx.fillText(town.name,a+10,b);
    }
    ctx.fillStyle='#fff7e5ee';ctx.fillRect(10,10,122,48);
    ctx.fillStyle='#483421';ctx.font='700 14px system-ui, sans-serif';ctx.fillText('↑ N',20,26);
    ctx.font='12px system-ui, sans-serif';ctx.fillText(`Grid: ${step===1?'819 m':(step*.8192).toFixed(1)+' km'}`,20,45);
  };
}
