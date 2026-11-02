// Rebuild the public guild snapshot from already-cached standings.
// No game/API requests, no new scan; keeps backup inside the private directory.
import {readFile,writeFile,rename,copyFile,chmod} from 'node:fs/promises';
import {buildGuildSnapshot} from './guild-core.mjs';
const home='/home/ryan/dfotimer-observer';
const priv=home+'/private/guilds';
const target='/var/www/lastlife-hub/daggerfall/guilds/data.json';
const check=process.argv.includes('--check');
const [rawState,rawSnapshot]=await Promise.all([readFile(priv+'/state.json','utf8'),readFile(target,'utf8')]);
const reads=JSON.parse(rawState),previous=JSON.parse(rawSnapshot);
if(previous?.version!==1||!Array.isArray(previous.seats)||!Array.isArray(previous.guilds)||!Number.isInteger(previous.week)||
   !previous.coverage||!reads||typeof reads!=='object')throw Error('Invalid guild cache; nothing changed');
const holdings=new Set();
let active=0,standings=0,readCount=0;
for(const [key,r] of Object.entries(reads)){
  if(r?.week!==previous.week||!Array.isArray(r?.rows))continue;
  readCount++;standings+=r.rows.length;
  for(const v of r.rows)if(v.holder===true&&v.guild?.id){active++;holdings.add(key);}
}
const before=previous.seats.filter(s=>s.holder).length;
const updated=buildGuildSnapshot({seats:previous.seats,reads,week:previous.week,
  startedAt:previous.scanStartedAt??previous.updatedAt,now:new Date().toISOString(),
  complete:previous.coverage.scanComplete===true,
  failed:previous.coverage.failed??0,error:previous.coverage.error??null});
const after=updated.seats.filter(s=>s.holder).length;
const info={week:previous.week,seatStandingsRead:readCount,standingsRows:standings,
  seatHolderFlags:holdings.size,previousSeatsHeld:before,correctedSeatsHeld:after,
  guilds:updated.guilds.length,scanCoverage:updated.coverage.seatsChecked};
console.log(JSON.stringify(info,null,2));
if(active===0){
 console.log('NO HOLDER FLAGS in cached standings. The game may currently have zero claimed seats; no snapshot overwritten.');
 process.exit(0);
}
if(after<holdings.size)throw Error('Guild holder conversion failed; no snapshot overwritten');
if(check){console.log('CHECK ONLY; nothing changed.');process.exit(0);}
const backup=priv+'/data-before-holder-repair-'+Date.now()+'.json';
await copyFile(target,backup);
await chmod(backup,0o600);
const temporary=target+'.holder-repair-'+process.pid+'.tmp';
await writeFile(temporary,JSON.stringify(updated),{mode:0o644,flag:'wx'});
await chmod(temporary,0o644);
await rename(temporary,target);
console.log('PUBLISHED corrected guild snapshot. Private backup:',backup);
