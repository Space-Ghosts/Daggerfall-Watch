import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {scanVendors} from './vendor-core.mjs';
import {createMarketReader} from './market-reader.mjs';
const local=name=>new URL(name,import.meta.url),json=async name=>JSON.parse(await readFile(local(name),'utf8'));
const session=await json('./private/session.json');
const names=Object.fromEntries((await json('./item-names.json')).map(r=>[r.index,r.name])),towns=await json('./town-names.json'),books=await json('./book-names.json');
const output=process.env.DFO_VENDOR_OUTPUT||'/var/www/lastlife-hub/daggerfall/vendors.json';
let lastProgress='';
const reader=createMarketReader({secret:session.secret,log:record=>console.log(JSON.stringify(record))});
try{
 const snapshot=await scanVendors({call:reader.call,names,towns,books,onFailure:record=>console.log(JSON.stringify({event:'scan_read_failed',...record})),progress:p=>{const label=`${p.phase}: ${p.done}/${p.total}`;if(p.done%10===0&&label!==lastProgress){console.log(label);lastProgress=label;}}});
 if(snapshot.coverage.regionsChecked===0)throw Error('No regions available');
 await writeFile(output+'.next',JSON.stringify(snapshot),{mode:0o644});await chmod(output+'.next',0o644);await rename(output+'.next',output);
 console.log(JSON.stringify({listings:snapshot.listings.length,...snapshot.coverage}));
}catch(e){console.error(e.fatal?e.message:'Scan could not finish; previous snapshot retained');process.exitCode=1;}
finally{console.log(JSON.stringify({event:'market_scan_diagnostics',...reader.stats}));}
