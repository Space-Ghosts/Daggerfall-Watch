import {facetLabel} from './vendor-facets.js?v=facets-20261031'; // DFO-VENDOR-FACETS-20261031
export function equipmentLabel(row){return [row.material,row.equipmentType||row.template||row.category,facetLabel(row)].filter(Boolean).join(' · ');}
export function itemStatLines(row){
 const lines=Array.isArray(row.statLines)?row.statLines.filter(v=>typeof v==='string'&&v.length<=260).slice(0,32):[];
 if(row.statsStatus==='unidentified')return [...lines,'Unidentified — magical effects hidden'];
 if(row.statsStatus==='unavailable')return [...lines,'Item stats could not be read'];
 if(!row.statsStatus&&['Armor','Weapons','Jewellery'].includes(row.category))return [...lines,'Stats pending the next inventory scan'];
 return lines;
}
