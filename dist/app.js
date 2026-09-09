// Navigation polarity: use 1 normally or -1 to invert an axis.
const NAVIGATION_X_FACTOR = 1;
const NAVIGATION_Y_FACTOR = -1;
const MIN_FOV_DEGREES = 15;
const MAX_FOV_DEGREES = 75;
const ROUTE_HEADING_OFFSET_DEGREES = 0;
const ROUTE_SOL_WINDOW = 100;
const ROUTE_LABEL_MIN_PX = 13;
const ROUTE_LABEL_MAX_PX = 22;
let EDR_M_VERTICAL_OFFSET_DEGREES = 0;
const SHOW_DEBUG_LOG = true;
const $=s=>document.querySelector(s),t=window.localeDictionary,D=Math.PI/180,cv=$('#panoramaCanvas'),cx=cv.getContext('2d'),wrap=$('#panoramaWrap');
const rovers={curiosity:{name:'Curiosity',source:'msl',latest:5009},perseverance:{name:'Perseverance',source:'later',latest:1974},spirit:{name:'Spirit',source:'later',latest:2208},opportunity:{name:'Opportunity',source:'later',latest:5111}};
const fallback=[{imageid:'NLB_800890885EDR_F1160576CCAM04543M_',instrument:'NAV_LEFT_B',sol:4544,site:116,drive:576,date_taken:'2025-05-19T02:46:59Z',camera_model_type:'CAHVOR',camera_model_component_list:'(1.01824,0.66274,-1.84565);(-0.001607,0.68842,0.725299);(-1225.54,347.088,366.335);(-0.293737,-542.331,1207.8)',camera_vector:'(-0.005995,0.68287,0.730515)',extended:{mast_az:'90.47',mast_el:'-46.91'},https_url:'https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04544/opgs/edr/ncam/NLB_800890885EDR_F1160576CCAM04543M_.JPG'}];
const s={rover:'curiosity',images:[],yaw:0,pitch:0,fov:MAX_FOV_DEGREES*D,pointer:null,drag:false,x:0,y:0,sy:0,sp:0,ready:0};
const vec=x=>{let a=String(x||'').match(/-?\d*\.?\d+(?:e[+-]?\d+)?/ig);return a&&a.map(Number)},dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{let n=Math.hypot(...a)||1;return a.map(x=>x/n)};
function model(i){let p=String(i.camera_model_component_list||i.camera?.camera_model_component_list||'').split(';').map(vec),A=p[1]||vec(i.camera_vector||i.camera?.camera_vector);return A?{A:norm(A),H:p[2],V:p[3],C:p[0],type:i.camera_model_type||i.camera?.camera_model_type||'vector'}:null}
function url(i){return i.https_url||i.url||i.image_files?.full_res||i.image_files?.medium} function date(x){return x?new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(x)):'—'}function stat(k,v={}){$('#statusText').textContent=(t[k]||k).replace(/\{(\w+)\}/g,(_,q)=>v[q]??'')}
function bounds(i,img){let b=vec(i.subframe_rect||i.extended?.subframeRect)||[1,1,img?.naturalWidth||1024,img?.naturalHeight||1024];return{l:b[0],top:b[1],w:b[2],h:b[3]}}
function ray(i,x,y){let m=i.model;if(!m)return null;if(!m.H||!m.V)return m.A;let r=norm(cross(m.H.map((z,j)=>z-x*m.A[j]),m.V.map((z,j)=>z-y*m.A[j])));if(dot(r,m.A)<0)r=r.map(x=>-x);if(/EDR_M\d+/i.test(imageIdentity(i))&&EDR_M_VERTICAL_OFFSET_DEGREES){let axis=norm(cross(m.V,m.A)),angle=EDR_M_VERTICAL_OFFSET_DEGREES*D,co=Math.cos(angle),si=Math.sin(angle),c=cross(axis,r),d=dot(axis,r);r=norm(r.map((v,n)=>v*co+c[n]*si+axis[n]*d*(1-co)))}return r}
function basis(){let f=[Math.cos(s.pitch)*Math.cos(s.yaw),Math.cos(s.pitch)*Math.sin(s.yaw),Math.sin(s.pitch)],r=[-Math.sin(s.yaw),Math.cos(s.yaw),0];return{f,r,u:norm(cross(r,f))}}
function project(a){let b=basis(),z=dot(a,b.f);if(z<=-.08)return null;let k=2/(1+z),sc=cv.height/(4*Math.tan(s.fov/4));return{x:cv.width/2+dot(a,b.r)*k*sc,y:cv.height/2-dot(a,b.u)*k*sc}}
function unproject(x,y){let sc=cv.height/(4*Math.tan(s.fov/4)),qx=(x-cv.width/2)/sc,qy=-(y-cv.height/2)/sc,q=qx*qx+qy*qy,L=[qx/(1+q/4),qy/(1+q/4),(1-q/4)/(1+q/4)],b=basis();return norm([b.r[0]*L[0]+b.u[0]*L[1]+b.f[0]*L[2],b.r[1]*L[0]+b.u[1]*L[1]+b.f[1]*L[2],b.r[2]*L[0]+b.u[2]*L[1]+b.f[2]*L[2]])}
function tri(im,a,b,c,A,B,C){let d=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);if(!d)return;let z=(q,r,u)=>[(q*(b.y-c.y)+r*(c.y-a.y)+u*(a.y-b.y))/d,(q*(c.x-b.x)+r*(a.x-c.x)+u*(b.x-a.x))/d,(q*(b.x*c.y-c.x*b.y)+r*(c.x*a.y-a.x*c.y)+u*(a.x*b.y-b.x*a.y))/d],X=z(A.x,B.x,C.x),Y=z(A.y,B.y,C.y);cx.save();cx.beginPath();cx.moveTo(A.x,A.y);cx.lineTo(B.x,B.y);cx.lineTo(C.x,C.y);cx.closePath();cx.clip();cx.setTransform(X[0],Y[0],X[1],Y[1],X[2],Y[2]);cx.drawImage(im,0,0);cx.restore()}
function warp(i,hi){let im=i.element;if(!im?.naturalWidth)return;let b=bounds(i,im),n=5,c=[];for(let y=0;y<=n;y++){c[y]=[];for(let x=0;x<=n;x++){let R=ray(i,b.l+x/n*b.w,b.top+y/n*b.h);c[y][x]={p:{x:x/n*im.naturalWidth,y:y/n*im.naturalHeight},d:R&&project(R)}}}for(let y=0;y<n;y++)for(let x=0;x<n;x++){let a=c[y][x],b=c[y][x+1],d=c[y+1][x],e=c[y+1][x+1];if(a.d&&b.d&&d.d)tri(im,a.p,b.p,d.p,a.d,b.d,d.d);if(b.d&&e.d&&d.d)tri(im,b.p,e.p,d.p,b.d,e.d,d.d)}if(hi){let q=project(ray(i,b.l+b.w/2,b.top+b.h/2));if(q){cx.strokeStyle='#91f3ff';cx.lineWidth=3;cx.beginPath();cx.arc(q.x,q.y,13,0,7);cx.stroke()}}}
function hit(p){let R=unproject(p.x,p.y),a=s.images.filter(i=>{let m=i.model;if(!m?.H||!m?.V)return m&&Math.acos(Math.min(1,dot(R,m.A)))<25*D;let q=dot(m.A,R);if(q<=0)return false;let x=dot(m.H,R)/q,y=dot(m.V,R)/q,b=bounds(i,i.element);return x>=b.l&&x<=b.l+b.w&&y>=b.top&&y<=b.top+b.h});return a.length?(p.altKey&&a.length>1?a[0]:a.at(-1)):null}
function render(){let g=cx.createLinearGradient(0,0,0,cv.height);g.addColorStop(0,'#101e36');g.addColorStop(.48,'#9c624b');g.addColorStop(.51,'#5d3b31');g.addColorStop(1,'#161721');cx.fillStyle=g;cx.fillRect(0,0,cv.width,cv.height);let h=s.pointer?.altKey&&hit(s.pointer),a=[...s.images];if(h)a.push(a.splice(a.indexOf(h),1)[0]);a.forEach(i=>warp(i,i===h))}
function point(e){let r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)*cv.width/r.width,y:(e.clientY-r.top)*cv.height/r.height,altKey:e.altKey}}
function api(sol,page){return`https://mars.nasa.gov/api/v1/raw_image_items?order=sol%20asc%2Cdate_taken%20asc&per_page=100&page=${page}&condition_1=msl%3Amission&condition_2=${sol}%3Asol%3Agte&condition_3=${sol}%3Asol%3Alte&search=&extended=`}async function every(sol){let all=[],p=0,more=true;while(more){let r=await fetch(api(sol,p)),d=await r.json();if(!r.ok)throw Error();all.push(...(d.items||[]));more=!!d.more;if(++p>200)throw Error()}return all}
function connect(i){let im=new Image;i.element=im;im.onload=()=>{s.ready++;$('#imageCount').textContent=(t.imageProgress||'').replace('{loaded}',s.ready).replace('{total}',s.images.length);render()};im.onerror=()=>i.failed=true;im.src=url(i)}
function sols(max,sel=max){let el=$('#solSelect');el.innerHTML='';for(let q=max;q>=0;q--){let o=document.createElement('option');o.value=q;o.textContent=`Sol ${q}`;o.selected=q===sel;el.append(o)}}
async function latest(){try{let r=await fetch('https://mars.nasa.gov/api/v1/raw_image_items?order=sol%20desc&per_page=1&page=0&condition_1=msl%3Amission&search=&extended='),d=await r.json(),q=d.items?.[0]?.sol;if(q){rovers.curiosity.latest=q;sols(q)}}catch{}}
async function load(){let R=rovers[s.rover],sol=+$(' #solSelect'.trim()).value;stat('loadingStatus');s.images=[];s.ready=0;try{if(R.source!=='msl')throw Error();let all=await every(sol),good=all.filter(i=>model(i)&&!/(?:^|_)EDR_T/.test(i.imageid||''));if(!good.length)throw Error();s.images=good.sort((a,b)=>new Date(a.date_taken)-new Date(b.date_taken)).map(i=>({...i,model:model(i)}));$('#earthDate').textContent=date(s.images[0]?.date_taken);stat('loadedStatus',{count:s.images.length,total:all.length})}catch{s.images=fallback.map(i=>({...i,model:model(i)}));$('#earthDate').textContent=date(fallback[0].date_taken);stat(R.source==='msl'?'fallbackStatus':'comingSoon')}finally{s.images.forEach(connect);$('#imageCount').textContent=(t.imageProgress||'').replace('{loaded}',0).replace('{total}',s.images.length);render()}}
function panel(i){if(!i){$('#imagePanel').hidden=true;return}let m=t.metadata,A=i.model?.A?.map(x=>x.toFixed(6)).join(', '),rows=[[m.rover,rovers[s.rover].name],[m.camera,i.instrument||i.camera?.instrument],[m.sol,i.sol],[m.earthDate,date(i.date_taken||i.date_taken_utc)],[m.captured,i.date_taken||i.date_taken_utc],[m.siteDrive,`${i.site??'—'} / ${i.drive??'—'}`],[m.cameraModel,i.model?.type],[m.cameraAxis,A],[m.cameraPosition,i.camera_position||i.camera?.camera_position||'—'],[m.mastAngles,`${i.extended?.mast_az??i.extended?.mastAz??'—'}° / ${i.extended?.mast_el??i.extended?.mastEl??'—'}°`]];$('#imageTitle').textContent=i.imageid;$('#panelImage').src=url(i);$('#metadataList').innerHTML=rows.map(x=>`<div><dt>${x[0]}</dt><dd>${x[1]||'—'}</dd></div>`).join('');$('#sourceLink').href=url(i);$('#imagePanel').hidden=false}
function init(){document.documentElement.dataset.theme=localStorage.getItem('mars360-theme')||'dark';$('#themeToggle').textContent=document.documentElement.dataset.theme==='dark'?'☾':'☼';document.querySelectorAll('[data-i18n]').forEach(n=>t[n.dataset.i18n]&&(n.innerHTML=t[n.dataset.i18n]));$('#languageSelect').innerHTML=`<option>${t.name}</option>`;$('#roverSelect').innerHTML=Object.entries(rovers).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('');sols(rovers.curiosity.latest);$('#roverSelect').onchange=e=>{s.rover=e.target.value;sols(rovers[s.rover].latest)};$('#loadButton').onclick=load;$('#closePanel').onclick=()=>panel(null);$('#themeToggle').onclick=()=>{let n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;$('#themeToggle').textContent=n==='dark'?'☾':'☼';localStorage.setItem('mars360-theme',n);scheduleShareUrl()};$('#fullscreenButton').onclick=()=>document.fullscreenElement?document.exitFullscreen():wrap.requestFullscreen();wrap.onpointerdown=e=>{e.preventDefault();s.drag=false;s.x=e.clientX;s.y=e.clientY;s.sy=s.yaw;s.sp=s.pitch;wrap.setPointerCapture(e.pointerId)};wrap.onpointermove=e=>{s.pointer=point(e);if(wrap.hasPointerCapture(e.pointerId)){let x=e.clientX-s.x,y=e.clientY-s.y;s.drag=Math.abs(x)+Math.abs(y)>3;s.yaw=s.sy-x/wrap.clientWidth*s.fov;s.pitch=Math.max(-89*D,Math.min(89*D,s.sp+y/wrap.clientHeight*s.fov))}render()};wrap.onpointerup=e=>{if(!s.drag)panel(hit(point(e)));wrap.releasePointerCapture?.(e.pointerId);s.drag=false;render()};wrap.onpointerleave=()=>{if(!s.drag){s.pointer=null;render()}};wrap.addEventListener('wheel',e=>{e.preventDefault();s.fov=Math.max(MIN_FOV_DEGREES*D,Math.min(MAX_FOV_DEGREES*D,s.fov*(e.deltaY<0?.88:1.14)));s.pointer=point(e);render()},{passive:false});window.onkeydown=e=>{if(e.key==='Alt'&&s.pointer){s.pointer.altKey=true;render()}};window.onkeyup=e=>{if(e.key==='Alt'&&s.pointer){s.pointer.altKey=false;render()}};latest().finally(load)}
init();

// NASA's "T" EDR products are transfer thumbnails. The identity may be in a
// record field or only in its URL, so inspect both before any Image is created.
function imageIdentity(item) { return String(item.imageid || item.image_id || item.filename || url(item) || ''); }
function isTransferThumbnail(item) { return /EDR_T\d+/i.test(imageIdentity(item)); }
function debug(message, detail = '') { if (!SHOW_DEBUG_LOG) return; let p = document.getElementById('debugLog'); if (!p) { p = document.createElement('pre'); p.id = 'debugLog'; p.style.cssText = 'margin:18px 0 28px;padding:12px;max-height:220px;overflow:auto;white-space:pre-wrap;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--muted);font:12px/1.45 ui-monospace,monospace;'; document.querySelector('.app-shell').append(p); } p.textContent = `${new Date().toISOString().slice(11,19)}  ${message} ${detail}\n${p.textContent}`.slice(0,9000); }
const rawEvery = every;
every = async (sol) => { const records = await rawEvery(sol); const rejected = records.filter(isTransferThumbnail); const kept = records.filter((item) => !isTransferThumbnail(item)); debug('Thumbnail filter', `raw=${records.length}, rejected=${rejected.length}, kept=${kept.length}${rejected.length ? `; samples=${rejected.slice(0, 3).map(imageIdentity).join(', ')}` : ''}`); return kept; };
wrap.onpointermove = (event) => { s.pointer = point(event); if (wrap.hasPointerCapture(event.pointerId)) { const dx = event.clientX-s.x, dy = event.clientY-s.y; s.drag = Math.abs(dx)+Math.abs(dy)>3; s.yaw = s.sy-NAVIGATION_X_FACTOR*dx/wrap.clientWidth*s.fov; s.pitch = Math.max(-89*D,Math.min(89*D,s.sp+NAVIGATION_Y_FACTOR*dy/wrap.clientHeight*s.fov)); } render(); };
wrap.addEventListener('wheel', (event) => { event.preventDefault(); event.stopImmediatePropagation(); s.fov = Math.max(MIN_FOV_DEGREES*D, Math.min(MAX_FOV_DEGREES*D, s.fov*(event.deltaY < 0 ? .88 : 1.14))); s.pointer = point(event); render(); }, {passive:false, capture:true});
wrap.addEventListener('dblclick', (event) => { event.preventDefault(); const target = unproject(point(event).x, point(event).y); const startYaw=s.yaw, startPitch=s.pitch, endYaw=Math.atan2(target[1], target[0]), endPitch=Math.asin(target[2]); const turn=Math.atan2(Math.sin(endYaw-startYaw), Math.cos(endYaw-startYaw)); const began=performance.now(), duration=380; const animate=(now) => { const p=Math.min(1,(now-began)/duration), eased=1-Math.pow(1-p,3); s.yaw=startYaw+turn*eased; s.pitch=startPitch+(endPitch-startPitch)*eased; render(); if(p<1)requestAnimationFrame(animate); }; requestAnimationFrame(animate); });
debug('Debug enabled', `xFactor=${NAVIGATION_X_FACTOR}, yFactor=${NAVIGATION_Y_FACTOR}`);
debug('FOV limits', `min=${MIN_FOV_DEGREES}°, max=${MAX_FOV_DEGREES}°`);
debug('Route layer', 'Loading the PDS PLACES localized rover route…');

// Horizontal angular coverage is calculated from the actual left and right
// rays of each visible product, then unioned on the 0–360° circle.
function panoramaCoverage() {
  const intervals=[];
  for (const image of s.images) {
    const b=bounds(image,image.element), mid=b.top+b.h/2, left=ray(image,b.l,mid), right=ray(image,b.l+b.w,mid);
    if (!left || !right) continue;
    let a=Math.atan2(left[1],left[0]), z=Math.atan2(right[1],right[0]), d=Math.atan2(Math.sin(z-a),Math.cos(z-a));
    if (Math.abs(d)>Math.PI*.95) continue;
    let start=a, end=a+d; if (d<0) [start,end]=[end,start];
    start=(start+2*Math.PI)%(2*Math.PI); end=(end+2*Math.PI)%(2*Math.PI);
    if (end<start) intervals.push([start,2*Math.PI],[0,end]); else intervals.push([start,end]);
  }
  intervals.sort((a,b)=>a[0]-b[0]); let total=0, end=-Infinity;
  for (const [start,stop] of intervals) { if (stop>end) { total+=stop-Math.max(start,end); end=stop; } }
  return Math.min(360,Math.max(0,Math.round(total/D)));
}
const paintPanorama=render;
render=()=>{ paintPanorama(); $('#coverageValue').textContent=`${panoramaCoverage()}° / 360°`; drawRouteOverlay(); scheduleShareUrl(); };

// Square S/F products are shown whole in the information panel; other
// subframes retain the compact crop-oriented preview.
const renderPanel=panel;
panel=(image)=>{ renderPanel(image); if (!image) return; const full=/EDR_[SF]\d+/i.test(imageIdentity(image)), preview=$('#panelImage'); preview.style.maxHeight=full?'none':'180px'; preview.style.aspectRatio=full?'1 / 1':'auto'; preview.style.objectFit=full?'contain':'cover'; };

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (wrap.requestFullscreen) { try { await wrap.requestFullscreen({navigationUI:'hide'}); } catch { await wrap.requestFullscreen(); } }
    else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
  } catch (error) { debug('Fullscreen unavailable', error.name || 'unknown browser restriction'); }
}
$('#fullscreenButton').onclick=toggleFullscreen;
$('#fullscreenButton').addEventListener('pointerdown',(event)=>event.stopPropagation());
document.addEventListener('fullscreenchange',()=>{ $('#fullscreenButton').textContent=document.fullscreenElement?'⛶':'⛶'; });

// PDS PLACES is the localization team's public, corrected position table.
const ROUTE_CSV='https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/data_localizations/localized_pos.csv';
const route={points:[],labels:[],box:null,loading:false};
async function loadRoute() {
  if (route.loading || route.points.length) return;
  route.loading=true;
  try {
    const response=await fetch(ROUTE_CSV); if (!response.ok) throw Error(`HTTP ${response.status}`);
    const [header,...rows]=(await response.text()).trim().split(/\r?\n/), keys=header.split(',');
    const index=Object.fromEntries(keys.map((key,n)=>[key,n]));
    const bySol=new Map;
    for (const row of rows) { const field=row.split(','); if (field[index.frame]!=='ROVER') continue; const sol=+field[index.sol], east=+field[index.easting], north=+field[index.northing]; if (sol>=0&&Number.isFinite(east)&&Number.isFinite(north)) bySol.set(sol,{sol,east,north,elevation:+field[index.elevation],yaw:+field[index.yaw],site:+field[index.site],drive:+field[index.drive]}); }
    route.points=[...bySol.values()].sort((a,b)=>a.sol-b.sol);
    debug('Route layer', `loaded ${route.points.length} localized Sol positions from PDS PLACES`);
  } catch (error) { debug('Route layer unavailable', error.message); }
  finally { route.loading=false; render(); }
}
function routeSelect(sol) { const select=$('#solSelect'); if (!select.querySelector(`option[value="${sol}"]`)) return; select.value=sol; $('#loadButton').click(); }
function drawRouteHud() {
  if (s.rover!=='curiosity' || !route.points.length) return;
  const x=26,y=26,w=Math.min(380,cv.width*.28),h=Math.min(230,cv.height*.27), pad=18, current=+$('#solSelect').value;
  const east=route.points.map(p=>p.east), north=route.points.map(p=>p.north), minE=Math.min(...east), maxE=Math.max(...east), minN=Math.min(...north), maxN=Math.max(...north);
  const map=(p)=>({x:x+pad+(p.east-minE)/(maxE-minE||1)*(w-pad*2),y:y+h-pad-(p.north-minN)/(maxN-minN||1)*(h-pad*2)});
  route.box={x,y,w,h,map}; route.labels=[];
  cx.save(); cx.fillStyle='rgba(3,8,17,.76)'; cx.strokeStyle='rgba(145,243,255,.42)'; cx.lineWidth=1; cx.fillRect(x,y,w,h); cx.strokeRect(x,y,w,h);
  cx.fillStyle='#cceefa'; cx.font='600 18px system-ui'; cx.fillText('ROVER ROUTE · PDS PLACES',x+12,y+23);
  cx.beginPath(); route.points.forEach((p,n)=>{const q=map(p); n?cx.lineTo(q.x,q.y):cx.moveTo(q.x,q.y)}); cx.strokeStyle='rgba(145,243,255,.72)'; cx.lineWidth=2; cx.stroke();
  const selected=route.points.reduce((best,p)=>Math.abs(p.sol-current)<Math.abs(best.sol-current)?p:best,route.points[0]);
  const candidates=route.points.filter(p=>p.sol===selected.sol || (Math.abs(p.sol-current)<120&&p.sol%10===0) || p.sol%500===0);
  let lastLabel=null;
  for (const p of candidates) { const q=map(p); if (lastLabel&&Math.hypot(q.x-lastLabel.x,q.y-lastLabel.y)<28&&p.sol!==selected.sol) continue; lastLabel=q; const text=`${p.sol}`, tw=cx.measureText(text).width+10; cx.fillStyle=p.sol===selected.sol?'#91f3ff':'rgba(5,18,29,.88)'; cx.strokeStyle='rgba(145,243,255,.8)'; cx.fillRect(q.x-tw/2,q.y-23,tw,17); cx.strokeRect(q.x-tw/2,q.y-23,tw,17); cx.fillStyle=p.sol===selected.sol?'#04101a':'#dff8ff'; cx.font='600 13px system-ui'; cx.fillText(text,q.x-tw/2+5,q.y-10); route.labels.push({sol:p.sol,x:q.x-tw/2,y:q.y-23,w:tw,h:17}); }
  const marker=map(selected); cx.fillStyle='#ffbf69'; cx.beginPath(); cx.arc(marker.x,marker.y,6,0,Math.PI*2); cx.fill(); cx.restore();
}
wrap.addEventListener('pointerup',(event)=>{ if (s.drag) return; const p=point(event), label=route.labels.find(item=>p.x>=item.x&&p.x<=item.x+item.w&&p.y>=item.y&&p.y<=item.y+item.h); if (!label) return; event.preventDefault(); event.stopImmediatePropagation(); wrap.releasePointerCapture?.(event.pointerId); routeSelect(label.sol); },{capture:true});
loadRoute();

function currentRoutePoint() {
  const sol=+$('#solSelect').value;
  return route.points.reduce((best,point)=>Math.abs(point.sol-sol)<Math.abs(best.sol-sol)?point:best,route.points[0]);
}
function routeVector(point,origin) {
  // PLACES uses map easting/northing/elevation; CAHV vectors use rover axes
  // (+X forward, +Y right, +Z down). Heading offset is exposed for calibration.
  const heading=(origin.yaw+ROUTE_HEADING_OFFSET_DEGREES)*D, east=point.east-origin.east, north=point.north-origin.north, up=point.elevation-origin.elevation;
  return [east*Math.sin(heading)+north*Math.cos(heading),east*Math.cos(heading)-north*Math.sin(heading),-up];
}
function drawRouteOverlay() {
  if (s.rover!=='curiosity'||!route.points.length||!s.images.length) return;
  const origin=currentRoutePoint(), sol=+$('#solSelect').value, camera=s.images[0].model?.C||[0,0,0];
  const visible=route.points.filter(point=>Math.abs(point.sol-sol)<=ROUTE_SOL_WINDOW);
  const screen=visible.map(point=>{const local=routeVector(point,origin), relative=local.map((value,n)=>value-camera[n]);return {...point,screen:project(norm(relative))}});
  route.labels=[];
  const segments=[]; let active=[];
  for(const point of screen){if(point.screen)active.push(point);else if(active.length){segments.push(active);active=[]}} if(active.length)segments.push(active);
  cx.save(); cx.lineJoin='round'; cx.lineCap='round';
  for(const segment of segments){if(segment.length<2)continue;cx.beginPath();segment.forEach((point,n)=>n?cx.lineTo(point.screen.x,point.screen.y):cx.moveTo(point.screen.x,point.screen.y));cx.strokeStyle='rgba(0,0,0,.72)';cx.lineWidth=8;cx.stroke();cx.strokeStyle='rgba(255,255,255,.94)';cx.lineWidth=3;cx.stroke()}
  const originIndex=route.points.indexOf(origin), labels=[];
  for(let delta=-5;delta<=5;delta++){const point=route.points[originIndex+delta];if(point&&Math.abs(point.sol-sol)<=ROUTE_SOL_WINDOW)labels.push(point)}
  for(const point of labels){const projected=screen.find(candidate=>candidate.sol===point.sol)?.screen;if(!projected)continue;const distance=Math.abs(point.sol-sol), ratio=1-distance/ROUTE_SOL_WINDOW, size=Math.round(ROUTE_LABEL_MIN_PX+(ROUTE_LABEL_MAX_PX-ROUTE_LABEL_MIN_PX)*Math.max(0,ratio));const text=`Sol ${point.sol}`, font=`700 ${size}px system-ui`;cx.font=font;const width=cx.measureText(text).width+12,height=size+9,x=projected.x-width/2,y=projected.y-height-11;cx.fillStyle='rgba(0,0,0,.64)';cx.strokeStyle='rgba(255,255,255,.9)';cx.lineWidth=1;cx.fillRect(x,y,width,height);cx.strokeRect(x,y,width,height);cx.fillStyle='#fff';cx.fillText(text,x+6,y+size+1);route.labels.push({sol:point.sol,x,y,w:width,h:height});}
  const selected=screen.find(point=>point.sol===origin.sol);if(selected?.screen){cx.fillStyle='#fff';cx.strokeStyle='#000';cx.lineWidth=3;cx.beginPath();cx.arc(selected.screen.x,selected.screen.y,6,0,Math.PI*2);cx.fill();cx.stroke()}cx.restore();
}

window.addEventListener('keydown',(event)=>{if(!SHOW_DEBUG_LOG)return;if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;event.preventDefault();EDR_M_VERTICAL_OFFSET_DEGREES+=event.key==='ArrowUp'?1:-1;debug('EDR_M vertical offset', `${EDR_M_VERTICAL_OFFSET_DEGREES}°`);render();});

let shareTimer=null,pendingSharedImage=null,restoringShare=false;
function shareParams(){const params=new URLSearchParams();params.set('rover',s.rover);params.set('sol',$('#solSelect').value);params.set('yaw',(s.yaw/D).toFixed(3));params.set('pitch',(s.pitch/D).toFixed(3));params.set('fov',(s.fov/D).toFixed(3));params.set('theme',document.documentElement.dataset.theme);if(!$('#imagePanel').hidden)params.set('image',$('#imageTitle').textContent);return params;}
function scheduleShareUrl(){if(restoringShare)return;clearTimeout(shareTimer);shareTimer=setTimeout(()=>history.replaceState(null,'',`#${shareParams()}`),1000);}
const sharedPanel=panel;
panel=(image)=>{sharedPanel(image);scheduleShareUrl();};
function restoreShareUrl(){const params=new URLSearchParams(location.hash.slice(1));if(!params.size)return;restoringShare=true;const rover=params.get('rover');if(rovers[rover]){s.rover=rover;$('#roverSelect').value=rover;sols(rovers[rover].latest)}const sol=params.get('sol');if(sol&&$('#solSelect').querySelector(`option[value="${sol}"]`))$('#solSelect').value=sol;for(const [key,field]of [['yaw','yaw'],['pitch','pitch'],['fov','fov']]){const value=Number(params.get(key));if(Number.isFinite(value))s[field]=value*D}const theme=params.get('theme');if(theme==='dark'||theme==='light'){document.documentElement.dataset.theme=theme;$('#themeToggle').textContent=theme==='dark'?'☾':'☼'}pendingSharedImage=params.get('image');$('#loadButton').click();let attempts=0;const reveal=setInterval(()=>{const image=s.images.find(item=>item.imageid===pendingSharedImage);if(image){panel(image);pendingSharedImage=null;clearInterval(reveal);restoringShare=false;scheduleShareUrl()}else if(!pendingSharedImage||++attempts>250){pendingSharedImage=null;clearInterval(reveal);restoringShare=false;scheduleShareUrl()}},100);}
window.addEventListener('hashchange',restoreShareUrl);
restoreShareUrl();
