// DFO Update 0.0.455: theatre indices are distinct from market region indices.
export const EVENT_REGIONS = ['Iliac Bay', 'High Rock (beyond the Bay)', 'Hammerfell (beyond the Bay)', 'Skyrim', 'Morrowind', 'Sumurset Isle', 'Valenwood', 'Elsweyr', 'Black Marsh', 'Cyrodiil'];
export const KETCH_STATIONS = [
  {lane:0,city:'Daggerfall'}, {lane:2,city:'Sentinel'}, {lane:3,city:'Solitude'},
  {lane:4,city:'Mournhold'}, {lane:5,city:'Alinor'}, {lane:6,city:'Falinesti'},
  {lane:7,city:'Torval'}, {lane:8,city:'Helstrom'},
];
export const eventLane = value => Number.isInteger(value) && value >= 0 && value < EVENT_REGIONS.length ? value : 0;
export const ketchStation = lane => KETCH_STATIONS.find(s=>s.lane===(lane===1?0:lane));
export const regionLane = region => Number.isInteger(region) && region >= 0 && region <= 70 ? (region < 62 ? 0 : region-61) : -1;
export const raidLane = row => regionLane(Number(row?.key?.split(':')[0]));
export function eventLocation(event,lane=0){
  if(event.id==='sky-ketch')return ketchStation(lane)?`Mzunthar · Fields outside ${ketchStation(lane).city}`:'No Sky-Ketch station in Cyrodiil';
  if(['gate','abyss','starfall','raids'].includes(event.id))return lane===9?'No event in the Cyrodiil PvP zone':`${event.boss||event.name} · ${EVENT_REGIONS[lane]}`;
  return event.location;
}
