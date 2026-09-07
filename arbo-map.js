(async function(){'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'Not recorded').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
if(!window.L)throw new Error('Map library unavailable. Check your internet connection and reload.');
let response=await fetch('arbo-masterlist.json',{cache:'no-store'});if(!response.ok)response=await fetch('data/gis/arbo-masterlist.json',{cache:'no-store'});if(!response.ok)throw new Error('ARBO masterlist file is missing. Upload arbo-masterlist.json beside index.html.');
const data=await response.json(),rows=data.organizations;
const map=L.map('map',{zoomSnap:.25}).setView([16.02,120.35],9);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
L.control.scale({imperial:false}).addTo(map);
const layer=L.layerGroup().addTo(map);let visible=[];
for(const key of ['municipality','status'])for(const value of [...new Set(rows.map(r=>r[key]).filter(Boolean))].sort())$(key).add(new Option(value,value));
const detail=r=>`<strong>${esc(r.name)}</strong><p>${esc(r.barangay)}, ${esc(r.municipality)}</p><p>Status: ${esc(r.status)}<br>Type: ${esc(r.type)}<br>ARC: ${esc(r.arc)}<br>Cluster: ${esc(r.cluster)}<br>Membership: ${esc(r.membership)}<br>ARB members: ${esc(r.arbMembership)}</p><p>${esc(r.locationBasis)}. Source: pangasinan.xlsx, Pangasinan, row ${r.sourceRow}; July 2026.</p>`;
function fit(){const coords=visible.filter(r=>r.coord).map(r=>r.coord);if(coords.length)map.fitBounds(L.latLngBounds(coords),{padding:[35,35],maxZoom:13});else map.setView([16.02,120.35],9);}
function render(){const q=$('search').value.toLowerCase().trim();visible=rows.filter(r=>(!$('municipality').value||r.municipality===$('municipality').value)&&(!$('status').value||r.status===$('status').value)&&(!q||[r.name,r.barangay,r.municipality,r.arc,r.cluster,r.arboId].join(' ').toLowerCase().includes(q)));
layer.clearLayers();$('directory').replaceChildren();const groups=new Map();
for(const r of visible){if(r.coord){const k=r.coord.join(',');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}const b=document.createElement('button');b.className='record';b.innerHTML=`<strong>${esc(r.name)}</strong><small>${esc(r.barangay)}, ${esc(r.municipality)}</small><small>${esc(r.status)}</small><span class="badge">${r.coord?'Approximate barangay location':'Unmapped — address needs review'}</span>`;b.onclick=()=>{if(r.coord){map.setView(r.coord,13);L.popup().setLatLng(r.coord).setContent(detail(r)).openOn(map);}else{b.querySelector('.badge').textContent='No matching barangay boundary. Office coordinates or a confirmed address are needed.';}};$('directory').appendChild(b);}
for(const group of groups.values())L.marker(group[0].coord,{icon:L.divIcon({className:'',html:`<div class="count">${group.length}</div>`,iconSize:[30,30],iconAnchor:[15,15]})}).bindPopup(group.map(detail).join('<hr>')).addTo(layer);
const mapped=visible.filter(r=>r.coord).length;$('stats').textContent=`${visible.length} of ${rows.length} organizations · ${mapped} mapped approximately · ${visible.length-mapped} awaiting location review`;
if(!visible.length)$('directory').textContent='No organizations match these filters.';fit();}
$('search').oninput=render;$('municipality').onchange=render;$('status').onchange=render;$('fit').onclick=fit;render();
}catch(error){$('stats').textContent=error.message;}
})();
