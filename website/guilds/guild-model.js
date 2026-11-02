export function guildRows(data,region=''){
 const seats=new Map(data.seats.map(s=>[s.key,s]));
 return data.guilds.map(g=>{
  const contests=g.contests.filter(c=>seats.has(c.key)&&(!region||seats.get(c.key).region===region));
  const territories=g.territories.filter(k=>seats.has(k)&&(!region||seats.get(k).region===region));
  const sum=k=>contests.reduce((n,c)=>n+c[k],0),influence=sum('influence'),legacy=sum('legacy');
  return {...g,contests,territories,influence,legacy,currentInfluence:Math.max(0,influence-legacy),measured:contests.length>0};
 }).filter(g=>!region||g.contests.length||g.territories.length);
}
export function sortedGuilds(rows,sort){
 return [...rows].sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='territories'?b.territories.length-a.territories.length||a.name.localeCompare(b.name):Number(b.measured)-Number(a.measured)||(sort==='current'?b.currentInfluence-a.currentInfluence:b.influence-a.influence)||a.name.localeCompare(b.name));
}
