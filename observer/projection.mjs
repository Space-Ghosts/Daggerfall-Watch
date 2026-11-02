const int=(x,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const time=x=>int(x,1,9e15);
export function project(m){
 if(!m||typeof m!=='object'||Array.isArray(m))return null;
 if(m.t==='sd'&&['ev','ln'].includes(m.k)&&int(m.s,0,89999999)&&['risen','found','fell','gone'].includes(m.ph)&&int(m.r,-1,69)&&[m.at,m.until,m.next].every(time)){
  const lane=Math.floor(m.s/10000000);
  if((m.k==='ev')!==(lane===0)||m.s%10000000===0&&m.ph!=='gone'||m.r!==-1&&(lane===0?m.r>61:m.r!==61+lane))return null;
  if(m.ph==='fell'&&!time(m.fellAt))return null;
  return {type:'abyss',lane,s:m.s,phase:m.ph,region:m.r,at:m.at,until:m.until,next:m.next,...(time(m.fellAt)?{fellAt:m.fellAt}:{} )};
 }
 if(m.t==='gate'&&m.k==='fell'&&int(m.d,0,899999999)&&time(m.at))return {type:'gate',lane:Math.floor(m.d/100000000),day:m.d,at:m.at};
 if(m.t==='serpent'&&m.k==='fell'&&int(m.d)&&time(m.at)&&Number.isFinite(m.sx)&&Number.isFinite(m.sz)&&Math.abs(m.sx)<1e9&&Math.abs(m.sz)<1e9)return {type:'serpent',day:m.d,at:m.at,sx:m.sx,sz:m.sz};
 if(m.t==='raid'){
  const rows=m.k==='cls'?m.l:m.k==='cl'?[[m.key,m.at]]:null;
  if(!Array.isArray(rows))return null;
  return {type:'raids',items:rows.slice(0,2048).filter(x=>Array.isArray(x)&&typeof x[0]==='string'&&/^(?:(?:0|[1-5]?\d|6[01]):(?:0|[1-9]\d{0,3})|(?:6[2-9]|70):-[1-9]\d{0,7}):(?:0|[1-9]\d{0,6})$/.test(x[0])&&time(x[1])).map(x=>({key:x[0],at:x[1]}))};
 }
 if(m.t==='star'){
  const rows=m.k==='hds'?m.l:m.k==='hd'?[[m.n,m.s,m.px,m.py,m.at]]:null;
  if(!Array.isArray(rows))return null;
  return {type:'stars',items:rows.slice(0,2048).filter(x=>Array.isArray(x)&&int(x[0])&&int(x[1],0,26)&&int(x[2],-8191,8191)&&int(x[3],-8191,8191)&&time(x[4])).map(x=>({night:x[0],star:x[1],lane:Math.floor(x[1]/3),px:x[2],py:x[3],at:x[4]}))};
 }
 return null;
}
export function merge(state,event){
 if(!event)return;
 if(event.type==='abyss'||event.type==='gate'){
  const name=event.type==='abyss'?'abysses':'gates';
  state[name]??={};state[name][event.lane??0]=event;
  if((event.lane??0)===0)state[event.type]=event; // Existing clients retain Bay-only state.
  return;
 }
 const key=x=>event.type==='raids'?x.key:event.type==='stars'?`${x.night}:${x.star}:${x.px}:${x.py}`:`${x.day}:${x.sx}:${x.sz}`;
 const values=new Map((state[event.type]||[]).map(x=>[key(x),x]));
 for(const x of event.items||[event])values.set(key(x),x);
 state[event.type]=[...values.values()].sort((a,b)=>b.at-a.at).slice(0,256);
}
