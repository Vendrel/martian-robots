// Navigation polarity: use 1 normally or -1 to invert an axis.
const NAVIGATION_X_FACTOR = 1;
const NAVIGATION_Y_FACTOR = -1;
const MIN_FOV_DEGREES = 15;
const MAX_FOV_DEGREES = 75;
const DOWNLOAD_DELAY_MS = 200;
// Applies to every product whose actual pixel dimensions are not square.
let NON_SQUARE_PRODUCT_VERTICAL_OFFSET_DEGREES = 0;
let EDR_M_VERTICAL_OFFSET_DEGREES = 23;
let SHOW_DEBUG_LOG = false;
const $=s=>document.querySelector(s),t=window.localeDictionary,D=Math.PI/180,cv=$('#panoramaCanvas'),cx=cv.getContext('2d'),wrap=$('#panoramaWrap');
const rovers={curiosity:{name:'Curiosity',source:'msl',latest:5009},perseverance:{name:'Perseverance',source:'later',latest:1974},spirit:{name:'Spirit',source:'later',latest:2208},opportunity:{name:'Opportunity',source:'later',latest:5111}};
const fallback=[{imageid:'NLB_800890885EDR_F1160576CCAM04543M_',instrument:'NAV_LEFT_B',sol:4544,site:116,drive:576,date_taken:'2025-05-19T02:46:59Z',camera_model_type:'CAHVOR',camera_model_component_list:'(1.01824,0.66274,-1.84565);(-0.001607,0.68842,0.725299);(-1225.54,347.088,366.335);(-0.293737,-542.331,1207.8)',camera_vector:'(-0.005995,0.68287,0.730515)',extended:{mast_az:'90.47',mast_el:'-46.91'},https_url:'https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/04544/opgs/edr/ncam/NLB_800890885EDR_F1160576CCAM04543M_.JPG'}];
const s={rover:'curiosity',images:[],yaw:0,pitch:0,fov:MAX_FOV_DEGREES*D,pointer:null,drag:false,x:0,y:0,sy:0,sp:0,ready:0,selection:null,selectionDraft:null,selectionMode:false};
const vec=x=>{let a=String(x||'').match(/-?\d*\.?\d+(?:e[+-]?\d+)?/ig);return a&&a.map(Number)},dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{let n=Math.hypot(...a)||1;return a.map(x=>x/n)};
function model(i){let p=String(i.camera_model_component_list||i.camera?.camera_model_component_list||'').split(';').map(vec),A=p[1]||vec(i.camera_vector||i.camera?.camera_vector);return A?{A:norm(A),H:p[2],V:p[3],C:p[0],type:i.camera_model_type||i.camera?.camera_model_type||'vector'}:null}
function url(i){return i.https_url||i.url||i.image_files?.full_res||i.image_files?.medium} function date(x){return x?new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(x)):'—'}function stat(k,v={}){$('#statusText').textContent=(t[k]||k).replace(/\{(\w+)\}/g,(_,q)=>v[q]??'')}
function bounds(i,img){let b=vec(i.subframe_rect||i.extended?.subframeRect)||[1,1,img?.naturalWidth||1024,img?.naturalHeight||1024];return{l:b[0],top:b[1],w:b[2],h:b[3]}}
function ray(i,x,y){let m=i.model;if(!m)return null;if(!m.H||!m.V)return m.A;let r=norm(cross(m.H.map((z,j)=>z-x*m.A[j]),m.V.map((z,j)=>z-y*m.A[j])));if(dot(r,m.A)<0)r=r.map(x=>-x);let b=bounds(i,i.element),offset=/EDR_M\d+/i.test(imageIdentity(i))?EDR_M_VERTICAL_OFFSET_DEGREES:b.w!==b.h?NON_SQUARE_PRODUCT_VERTICAL_OFFSET_DEGREES:0;if(offset){let axis=norm(cross(m.V,m.A)),angle=offset*D,co=Math.cos(angle),si=Math.sin(angle),c=cross(axis,r),d=dot(axis,r);r=norm(r.map((v,n)=>v*co+c[n]*si+axis[n]*d*(1-co)))}return r}
function basis(){let f=[Math.cos(s.pitch)*Math.cos(s.yaw),Math.cos(s.pitch)*Math.sin(s.yaw),Math.sin(s.pitch)],r=[-Math.sin(s.yaw),Math.cos(s.yaw),0];return{f,r,u:norm(cross(r,f))}}
function project(a){let b=basis(),z=dot(a,b.f);if(z<=-.08)return null;let k=2/(1+z),sc=cv.height/(4*Math.tan(s.fov/4));return{x:cv.width/2+dot(a,b.r)*k*sc,y:cv.height/2-dot(a,b.u)*k*sc}}
function unproject(x,y){let sc=cv.height/(4*Math.tan(s.fov/4)),qx=(x-cv.width/2)/sc,qy=-(y-cv.height/2)/sc,q=qx*qx+qy*qy,L=[qx/(1+q/4),qy/(1+q/4),(1-q/4)/(1+q/4)],b=basis();return norm([b.r[0]*L[0]+b.u[0]*L[1]+b.f[0]*L[2],b.r[1]*L[0]+b.u[1]*L[1]+b.f[1]*L[2],b.r[2]*L[0]+b.u[2]*L[1]+b.f[2]*L[2]])}
function tri(im,a,b,c,A,B,C){let d=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);if(!d)return;let z=(q,r,u)=>[(q*(b.y-c.y)+r*(c.y-a.y)+u*(a.y-b.y))/d,(q*(c.x-b.x)+r*(a.x-c.x)+u*(b.x-a.x))/d,(q*(b.x*c.y-c.x*b.y)+r*(c.x*a.y-a.x*c.y)+u*(a.x*b.y-b.x*a.y))/d],X=z(A.x,B.x,C.x),Y=z(A.y,B.y,C.y);cx.save();cx.beginPath();cx.moveTo(A.x,A.y);cx.lineTo(B.x,B.y);cx.lineTo(C.x,C.y);cx.closePath();cx.clip();cx.setTransform(X[0],Y[0],X[1],Y[1],X[2],Y[2]);cx.drawImage(im,0,0);cx.restore()}
function warp(i,hi){let im=i.element;if(!im?.naturalWidth)return;let b=bounds(i,im),n=5,c=[];for(let y=0;y<=n;y++){c[y]=[];for(let x=0;x<=n;x++){let R=ray(i,b.l+x/n*b.w,b.top+y/n*b.h);c[y][x]={p:{x:x/n*im.naturalWidth,y:y/n*im.naturalHeight},d:R&&project(R)}}}for(let y=0;y<n;y++)for(let x=0;x<n;x++){let a=c[y][x],b=c[y][x+1],d=c[y+1][x],e=c[y+1][x+1];if(a.d&&b.d&&d.d)tri(im,a.p,b.p,d.p,a.d,b.d,d.d);if(b.d&&e.d&&d.d)tri(im,b.p,e.p,d.p,b.d,e.d,d.d)}if(hi){let q=project(ray(i,b.l+b.w/2,b.top+b.h/2));if(q){cx.strokeStyle='#91f3ff';cx.lineWidth=3;cx.beginPath();cx.arc(q.x,q.y,13,0,7);cx.stroke()}}}
function activeImages(){return s.selection?s.images.filter(image=>s.selection.ids.includes(image.imageid)):s.images}
function hit(p){let R=unproject(p.x,p.y),a=activeImages().filter(i=>{let m=i.model;if(!m?.H||!m?.V)return m&&Math.acos(Math.min(1,dot(R,m.A)))<25*D;let q=dot(m.A,R);if(q<=0)return false;let x=dot(m.H,R)/q,y=dot(m.V,R)/q,b=bounds(i,i.element);return x>=b.l&&x<=b.l+b.w&&y>=b.top&&y<=b.top+b.h});return a.length?(p.altKey&&a.length>1?a[0]:a.at(-1)):null}
function render(){let g=cx.createLinearGradient(0,0,0,cv.height);g.addColorStop(0,'#101e36');g.addColorStop(.48,'#9c624b');g.addColorStop(.51,'#5d3b31');g.addColorStop(1,'#161721');cx.fillStyle=g;cx.fillRect(0,0,cv.width,cv.height);let h=s.pointer?.altKey&&hit(s.pointer),a=[...activeImages()];if(h)a.push(a.splice(a.indexOf(h),1)[0]);a.forEach(i=>warp(i,i===h))}
function point(e){let r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)*cv.width/r.width,y:(e.clientY-r.top)*cv.height/r.height,altKey:e.altKey}}
function api(sol,page){return`https://mars.nasa.gov/api/v1/raw_image_items?order=sol%20asc%2Cdate_taken%20asc&per_page=100&page=${page}&condition_1=msl%3Amission&condition_2=${sol}%3Asol%3Agte&condition_3=${sol}%3Asol%3Alte&search=&extended=`}async function every(sol){let all=[],p=0,more=true;while(more){let r=await fetch(api(sol,p)),d=await r.json();if(!r.ok)throw Error();all.push(...(d.items||[]));more=!!d.more;if(++p>200)throw Error()}return all}
function connect(i){let im=new Image;i.element=im;im.onload=()=>{s.ready++;$('#imageCount').textContent=(t.imageProgress||'').replace('{loaded}',s.ready).replace('{total}',s.images.length);render()};im.onerror=()=>i.failed=true;im.src=url(i)}
function sols(max,sel=max){let el=$('#solSelect');el.innerHTML='';for(let q=max;q>=0;q--){let o=document.createElement('option');o.value=q;o.textContent=`Sol ${q}`;o.selected=q===sel;el.append(o)}}
async function latest(){try{let r=await fetch('https://mars.nasa.gov/api/v1/raw_image_items?order=sol%20desc&per_page=1&page=0&condition_1=msl%3Amission&search=&extended='),d=await r.json(),q=d.items?.[0]?.sol;if(q){let selected=+$('#solSelect').value;rovers.curiosity.latest=q;sols(q,Math.max(0,Math.min(selected,q)))}}catch{}}
async function load(){let R=rovers[s.rover],sol=+$(' #solSelect'.trim()).value; s.selection=null;s.selectionDraft=null;s.selectionMode=false;$('#selectionButton')?.classList.remove('is-active');stat('loadingStatus');s.images=[];s.ready=0;try{if(R.source!=='msl')throw Error();let all=await every(sol),good=all.filter(i=>model(i)&&!/(?:^|_)EDR_T/.test(i.imageid||''));if(!good.length)throw Error();s.images=good.sort((a,b)=>new Date(a.date_taken)-new Date(b.date_taken)).map(i=>({...i,model:model(i)}));$('#earthDate').textContent=date(s.images[0]?.date_taken);stat('loadedStatus',{count:s.images.length,total:all.length})}catch{s.images=fallback.map(i=>({...i,model:model(i)}));$('#earthDate').textContent=date(fallback[0].date_taken);stat(R.source==='msl'?'fallbackStatus':'comingSoon')}finally{s.images.forEach(connect);$('#imageCount').textContent=(t.imageProgress||'').replace('{loaded}',0).replace('{total}',s.images.length);render()}}
function panel(i){if(!i){$('#imagePanel').hidden=true;return}let m=t.metadata,A=i.model?.A?.map(x=>x.toFixed(6)).join(', '),rows=[[m.rover,rovers[s.rover].name],[m.camera,i.instrument||i.camera?.instrument],[m.sol,i.sol],[m.earthDate,date(i.date_taken||i.date_taken_utc)],[m.captured,i.date_taken||i.date_taken_utc],[m.siteDrive,`${i.site??'—'} / ${i.drive??'—'}`],[m.cameraModel,i.model?.type],[m.cameraAxis,A],[m.cameraPosition,i.camera_position||i.camera?.camera_position||'—'],[m.mastAngles,`${i.extended?.mast_az??i.extended?.mastAz??'—'}° / ${i.extended?.mast_el??i.extended?.mastEl??'—'}°`]];$('#imageTitle').textContent=i.imageid;$('#panelImage').src=url(i);$('#metadataList').innerHTML=rows.map(x=>`<div><dt>${x[0]}</dt><dd>${x[1]||'—'}</dd></div>`).join('');$('#sourceLink').href=url(i);$('#imagePanel').hidden=false}
function init(){document.documentElement.dataset.theme=localStorage.getItem('mars360-theme')||'dark';$('#themeToggle').textContent=document.documentElement.dataset.theme==='dark'?'☾':'☼';document.querySelectorAll('[data-i18n]').forEach(n=>t[n.dataset.i18n]&&(n.innerHTML=t[n.dataset.i18n]));$('#languageSelect').innerHTML=`<option>${t.name}</option>`;$('#roverSelect').innerHTML=Object.entries(rovers).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('');sols(rovers.curiosity.latest);$('#roverSelect').onchange=e=>{s.rover=e.target.value;sols(rovers[s.rover].latest)};$('#loadButton').onclick=load;$('#closePanel').onclick=()=>panel(null);$('#themeToggle').onclick=()=>{let n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;$('#themeToggle').textContent=n==='dark'?'☾':'☼';localStorage.setItem('mars360-theme',n);scheduleShareUrl()};$('#fullscreenButton').onclick=()=>document.fullscreenElement?document.exitFullscreen():wrap.requestFullscreen();wrap.onpointerdown=e=>{e.preventDefault();s.drag=false;s.x=e.clientX;s.y=e.clientY;s.sy=s.yaw;s.sp=s.pitch;wrap.setPointerCapture(e.pointerId)};wrap.onpointermove=e=>{s.pointer=point(e);if(wrap.hasPointerCapture(e.pointerId)){let x=e.clientX-s.x,y=e.clientY-s.y;s.drag=Math.abs(x)+Math.abs(y)>3;s.yaw=s.sy-x/wrap.clientWidth*s.fov;s.pitch=Math.max(-89*D,Math.min(89*D,s.sp+y/wrap.clientHeight*s.fov))}render()};wrap.onpointerup=e=>{if(!s.drag)panel(hit(point(e)));wrap.releasePointerCapture?.(e.pointerId);s.drag=false;render()};wrap.onpointerleave=()=>{if(!s.drag){s.pointer=null;render()}};wrap.addEventListener('wheel',e=>{e.preventDefault();s.fov=Math.max(MIN_FOV_DEGREES*D,Math.min(MAX_FOV_DEGREES*D,s.fov*(e.deltaY<0?.88:1.14)));s.pointer=point(e);render()},{passive:false});window.onkeydown=e=>{if(e.key==='Alt'&&s.pointer){s.pointer.altKey=true;render()}};window.onkeyup=e=>{if(e.key==='Alt'&&s.pointer){s.pointer.altKey=false;render()}};latest().finally(load)}
init();

// NASA's "T" EDR products are transfer thumbnails. The identity may be in a
// record field or only in its URL, so inspect both before any Image is created.
function imageIdentity(item) { return String(item.imageid || item.image_id || item.filename || url(item) || ''); }
function isTransferThumbnail(item) { return /EDR_T\d+/i.test(imageIdentity(item)); }
function debug(message, detail = '') { if (!SHOW_DEBUG_LOG) return; let p = document.getElementById('debugLog'); if (!p) { p = document.createElement('pre'); p.id = 'debugLog'; p.style.cssText = 'margin:18px 0 28px;padding:12px;max-height:220px;overflow:auto;white-space:pre-wrap;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--muted);font:12px/1.45 ui-monospace;'; document.querySelector('.app-shell').append(p); } p.hidden=false; p.textContent = `${new Date().toISOString().slice(11,19)}  ${message} ${detail}\n${p.textContent}`.slice(0,9000); }
let debugHoldTimer=null;
function toggleDebugLog(){SHOW_DEBUG_LOG=!SHOW_DEBUG_LOG;const panel=$('#debugLog');if(!SHOW_DEBUG_LOG){if(panel)panel.hidden=true;return;}debug('Debug enabled', `xFactor=${NAVIGATION_X_FACTOR}, yFactor=${NAVIGATION_Y_FACTOR}, nonSquareOffset=${NON_SQUARE_PRODUCT_VERTICAL_OFFSET_DEGREES}°`);debug('FOV limits', `min=${MIN_FOV_DEGREES}°, max=${MAX_FOV_DEGREES}°`);}
document.body.addEventListener('pointerdown',(event)=>{if(event.button!==0||event.target!==document.body)return;debugHoldTimer=setTimeout(()=>{debugHoldTimer=null;toggleDebugLog();},3000);});
for(const eventName of ['pointerup','pointercancel','pointerleave'])window.addEventListener(eventName,()=>{if(debugHoldTimer){clearTimeout(debugHoldTimer);debugHoldTimer=null;}});
const rawEvery = every;
every = async (sol) => { const records = await rawEvery(sol); const rejected = records.filter(isTransferThumbnail); const kept = records.filter((item) => !isTransferThumbnail(item)); debug('Thumbnail filter', `raw=${records.length}, rejected=${rejected.length}, kept=${kept.length}${rejected.length ? `; samples=${rejected.slice(0, 3).map(imageIdentity).join(', ')}` : ''}`); return kept; };
wrap.onpointermove = (event) => { s.pointer = point(event); if (wrap.hasPointerCapture(event.pointerId)) { const dx = event.clientX-s.x, dy = event.clientY-s.y; s.drag = Math.abs(dx)+Math.abs(dy)>3; s.yaw = s.sy-NAVIGATION_X_FACTOR*dx/wrap.clientWidth*s.fov; s.pitch = Math.max(-89*D,Math.min(89*D,s.sp+NAVIGATION_Y_FACTOR*dy/wrap.clientHeight*s.fov)); } render(); };
wrap.addEventListener('wheel', (event) => { event.preventDefault(); event.stopImmediatePropagation(); s.fov = Math.max(MIN_FOV_DEGREES*D, Math.min(MAX_FOV_DEGREES*D, s.fov*(event.deltaY < 0 ? .88 : 1.14))); s.pointer = point(event); render(); }, {passive:false, capture:true});
wrap.addEventListener('dblclick', (event) => { event.preventDefault(); const target = unproject(point(event).x, point(event).y); const startYaw=s.yaw, startPitch=s.pitch, endYaw=Math.atan2(target[1], target[0]), endPitch=Math.asin(target[2]); const turn=Math.atan2(Math.sin(endYaw-startYaw), Math.cos(endYaw-startYaw)); const began=performance.now(), duration=380; const animate=(now) => { const p=Math.min(1,(now-began)/duration), eased=1-Math.pow(1-p,3); s.yaw=startYaw+turn*eased; s.pitch=startPitch+(endPitch-startPitch)*eased; render(); if(p<1)requestAnimationFrame(animate); }; requestAnimationFrame(animate); });
debug('Debug enabled', `xFactor=${NAVIGATION_X_FACTOR}, yFactor=${NAVIGATION_Y_FACTOR}`);
debug('FOV limits', `min=${MIN_FOV_DEGREES}°, max=${MAX_FOV_DEGREES}°`);

// Horizontal angular coverage is calculated from the actual left and right
// rays of each visible product, then unioned on the 0–360° circle.
function panoramaCoverage() {
  const intervals=[];
  for (const image of activeImages()) {
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
render=()=>{ paintPanorama(); drawSelectionOverlay(); $('#coverageValue').textContent=`${panoramaCoverage()}° / 360°`; scheduleShareUrl(); };

// Keep the native aspect ratio in the information panel.  Only full-frame F
// products may expand beyond the compact preview height.
const renderPanel=panel;
panel=(image)=>{ renderPanel(image); if (!image) return; const full=/EDR_F\d+/i.test(imageIdentity(image)), preview=$('#panelImage'); preview.style.maxHeight=full?'none':'220px'; preview.style.aspectRatio='auto'; preview.style.objectFit='contain'; };

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

window.addEventListener('keydown',(event)=>{if(!SHOW_DEBUG_LOG)return;const key=event.key.toLowerCase();if(key!=='arrowup'&&key!=='arrowdown')return;event.preventDefault();NON_SQUARE_PRODUCT_VERTICAL_OFFSET_DEGREES+=key==='arrowup'?1:-1;debug('Non-square product vertical offset', `${NON_SQUARE_PRODUCT_VERTICAL_OFFSET_DEGREES}°`);render();});

let shareTimer=null,pendingSharedImage=null,restoringShare=false;
function shareParams(){const params=new URLSearchParams();params.set('rover',s.rover);params.set('sol',$('#solSelect').value);params.set('yaw',(s.yaw/D).toFixed(3));params.set('pitch',(s.pitch/D).toFixed(3));params.set('fov',(s.fov/D).toFixed(3));params.set('theme',document.documentElement.dataset.theme);if(!$('#imagePanel').hidden)params.set('image',$('#imageTitle').textContent);return params;}
function scheduleShareUrl(){if(restoringShare)return;clearTimeout(shareTimer);shareTimer=setTimeout(()=>history.replaceState(null,'',`#${shareParams()}`),1000);}
const sharedPanel=panel;
panel=(image)=>{sharedPanel(image);scheduleShareUrl();};
function restoreShareUrl(){const params=new URLSearchParams(location.hash.slice(1));if(!params.size)return;restoringShare=true;const rover=params.get('rover');if(rovers[rover]){s.rover=rover;$('#roverSelect').value=rover;sols(rovers[rover].latest)}const sol=params.get('sol');if(sol&&$('#solSelect').querySelector(`option[value="${sol}"]`))$('#solSelect').value=sol;for(const [key,field]of [['yaw','yaw'],['pitch','pitch'],['fov','fov']]){const value=Number(params.get(key));if(Number.isFinite(value))s[field]=value*D}const theme=params.get('theme');if(theme==='dark'||theme==='light'){document.documentElement.dataset.theme=theme;$('#themeToggle').textContent=theme==='dark'?'☾':'☼'}pendingSharedImage=params.get('image');$('#loadButton').click();let attempts=0;const reveal=setInterval(()=>{const image=s.images.find(item=>item.imageid===pendingSharedImage);if(image){panel(image);pendingSharedImage=null;clearInterval(reveal);restoringShare=false;scheduleShareUrl()}else if(!pendingSharedImage||++attempts>250){pendingSharedImage=null;clearInterval(reveal);restoringShare=false;scheduleShareUrl()}},100);}
window.addEventListener('hashchange',restoreShareUrl);
restoreShareUrl();

// Keep the three Sol controls as one state.  The number field accepts only
// positive integers; it quietly snaps to the nearest selectable Sol when a
// value falls outside the mission range.
const populateSols=sols;
document.querySelectorAll('[data-i18n-tooltip]').forEach(element=>{element.dataset.tooltip=t[element.dataset.i18nTooltip]||element.dataset.tooltip;});
sols=(max,selected=max)=>{populateSols(max,selected);syncSolControls();};
function availableSols(){return [...$('#solSelect').options].map(option=>+option.value).sort((a,b)=>a-b)}
function nearestSol(value){const values=availableSols();return values.reduce((best,sol)=>Math.abs(sol-value)<Math.abs(best-value)?sol:best,values[0]||0)}
function flashSolCorrection(){const control=$('.sol-direct-control');control.classList.remove('corrected');void control.offsetWidth;control.classList.add('corrected');}
function syncSolControls(){const select=$('#solSelect'),input=$('#solInput');if(!select||!input)return;const value=+select.value,values=availableSols(),min=values[0]||0,max=values.at(-1)||0;input.value=value;input.setAttribute('aria-valuemin',min);input.setAttribute('aria-valuemax',max);input.setAttribute('aria-valuenow',value);$('#previousSolButton').disabled=value<=min;$('#nextSolButton').disabled=value>=max;}
function selectSol(value,{loadPanorama=true,corrected=false}={}){const next=nearestSol(value),select=$('#solSelect');if(!Number.isFinite(next))return;const changed=+select.value!==next;select.value=next;syncSolControls();if(corrected)flashSolCorrection();if(changed&&loadPanorama)$('#loadButton').click();else if(!changed)scheduleShareUrl();}
function stepSol(direction){const values=availableSols(),current=+$('#solSelect').value,index=values.indexOf(current);selectSol(values[Math.max(0,Math.min(values.length-1,index+direction))]);}
function commitSolInput(){const input=$('#solInput'),raw=input.value;if(!/^\d+$/.test(raw)||+raw<1){syncSolControls();flashSolCorrection();return;}const requested=+raw,actual=nearestSol(requested);selectSol(actual,{corrected:actual!==requested});}
$('#solSelect').addEventListener('change',()=>{syncSolControls();scheduleShareUrl();});
$('#solInput').addEventListener('input',(event)=>{const clean=event.target.value.replace(/\D/g,'');if(clean!==event.target.value){event.target.value=clean;flashSolCorrection();}});
$('#solInput').addEventListener('change',commitSolInput);
$('#solInput').addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();commitSolInput();event.target.blur();}});
$('#previousSolButton').addEventListener('click',()=>stepSol(-1));
$('#nextSolButton').addEventListener('click',()=>stepSol(1));
$('#roverSelect').onchange=(event)=>{s.rover=event.target.value;sols(rovers[s.rover].latest);scheduleShareUrl();};
syncSolControls();

// Export is intentionally a JSON work manifest: it retains the original API
// records and the parsed CAHV vectors beside the downloaded image files.
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function downloadName(image,index){const path=new URL(url(image),location.href).pathname.split('/').pop();return path||`${String(index+1).padStart(3,'0')}-${image.imageid||'mars-image'}.jpg`;}
function saveBlob(blob,name){const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),2000);}
async function saveImage(image,index){const response=await fetch(url(image),{cache:'force-cache',mode:'cors'});if(!response.ok)throw Error(`HTTP ${response.status}`);saveBlob(await response.blob(),downloadName(image,index));}
function exportManifest(images=activeImages()){const strip=({element,...image})=>image;return {format:'mars-rover-360-export/v1',exportedAt:new Date().toISOString(),rover:s.rover,sol:+$('#solSelect').value,view:{yawDegrees:s.yaw/D,pitchDegrees:s.pitch/D,fovDegrees:s.fov/D},images:images.map((image,index)=>({...strip(image),downloadFile:downloadName(image,index),cameraGeometry:image.model?{type:image.model.type,C:image.model.C,A:image.model.A,H:image.model.H,V:image.model.V,subframe:bounds(image,image.element)}:null}))};}
async function tryZipDownload(images){debug('ZIP export started', `${images.length} images`);if(!window.JSZip){debug('ZIP export failed','No same-origin image byte access or ZIP runtime is available.');return false;}try{const zip=new window.JSZip;for(let index=0;index<images.length;index++){const response=await fetch(url(images[index]),{cache:'force-cache',mode:'cors'});if(!response.ok)throw Error(`HTTP ${response.status}`);zip.file(downloadName(images[index],index),await response.blob());}saveBlob(await zip.generateAsync({type:'blob'}),`mars-rover-360-${s.rover}-sol-${$('#solSelect').value}.zip`);debug('ZIP export succeeded', `${images.length} images`);return true;}catch(error){debug('ZIP export failed', error.name||'unknown error');return false;}}
async function copyImageUrls(images){const text=images.map(url).join('\n');try{await navigator.clipboard.writeText(text);return true;}catch{const area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;opacity:0';document.body.append(area);area.select();const copied=document.execCommand('copy');area.remove();return copied;}}
async function downloadAll(){const button=$('#downloadAllButton'),images=[...activeImages()];if(!images.length||button.disabled)return;button.disabled=true;const original=s.selection?(t.downloadSelected||'Download selected'):(t.downloadAll||'Download all');let copied=false,fallbackAttempted=false;try{saveBlob(new Blob([JSON.stringify(exportManifest(images),null,2)],{type:'application/json'}),`mars-rover-360-${s.rover}-sol-${$('#solSelect').value}-manifest.json`);if(await tryZipDownload(images))return;await sleep(DOWNLOAD_DELAY_MS);for(let index=0;index<images.length;index++){button.textContent=(t.downloading||'Downloading {current}/{total}…').replace('{current}',index+1).replace('{total}',images.length);try{await saveImage(images[index],index)}catch(error){debug('Image export blocked', `${downloadName(images[index],index)}: ${error.name||'unknown error'}`);fallbackAttempted=true;copied=await copyImageUrls(images);debug(copied?'Image URL list copied':'Image URL list copy failed', `${images.length} URLs`);break;}if(index<images.length-1)await sleep(DOWNLOAD_DELAY_MS);}}finally{button.disabled=false;button.textContent=copied?(t.imageUrlListCopied||'Image URL List Copied to Clipboard'):fallbackAttempted?(t.clipboardUnavailable||'Image URL List Unavailable'):original;}}
$('#downloadAllButton').addEventListener('click',downloadAll);

const selectionButton=$('#selectionButton');
selectionButton.title=selectionButton.getAttribute('aria-label')=t.selectionToggle||'Select images';
function selectionCap(){const cap=s.selectionDraft||s.selection;if(!cap)return null;const cosine=Math.max(-1,Math.min(1,dot(cap.center,cap.edge||cap.center)));return {...cap,radius:Math.acos(cosine)};}
function capRay(center,radius,angle){const reference=Math.abs(center[2])<.9?[0,0,1]:[1,0,0],u=norm(cross(reference,center)),v=norm(cross(center,u)),co=Math.cos(radius),si=Math.sin(radius);return norm(center.map((value,index)=>value*co+(u[index]*Math.cos(angle)+v[index]*Math.sin(angle))*si));}
function drawSelectionOverlay(){const cap=selectionCap();if(!cap)return;cx.save();cx.strokeStyle='rgba(82,238,255,.96)';cx.lineWidth=4;cx.shadowColor='rgba(0,225,255,.72)';cx.shadowBlur=12;cx.beginPath();let open=false;for(let index=0;index<=96;index++){const projected=project(capRay(cap.center,cap.radius,index/96*Math.PI*2));if(projected){if(open)cx.lineTo(projected.x,projected.y);else{cx.moveTo(projected.x,projected.y);open=true;}}else open=false;}cx.stroke();const center=project(cap.center);if(center){cx.fillStyle='#53e7ff';cx.beginPath();cx.arc(center.x,center.y,4,0,Math.PI*2);cx.fill();}cx.restore();}
function selectedImageIds(cap){return s.images.filter(image=>{const b=bounds(image,image.element),center=ray(image,b.l+b.w/2,b.top+b.h/2);return center&&Math.acos(Math.max(-1,Math.min(1,dot(cap.center,center))))<=cap.radius;}).map(image=>image.imageid)}
function showSelectionPanel(){const count=s.selection?.ids.length||0;$('#imageTitle').textContent=(t.imagesSelected||'{count} IMAGES SELECTED').replace('{count}',count);$('#panelImage').hidden=true;$('#metadataList').hidden=true;$('#sourceLink').hidden=true;$('#downloadAllButton').textContent=t.downloadSelected||'Download selected';$('#imagePanel').hidden=false;}
function clearSelection(){s.selection=null;s.selectionDraft=null;s.selectionMode=false;selectionButton.classList.remove('is-active');$('#panelImage').hidden=false;$('#metadataList').hidden=false;$('#sourceLink').hidden=false;panel(null);render();}
const normalPanel=panel;
panel=(image)=>{if(s.selection){if(!image){$('#imagePanel').hidden=true;return;}showSelectionPanel();scheduleShareUrl();return;}$('#panelImage').hidden=false;$('#metadataList').hidden=false;$('#sourceLink').hidden=false;normalPanel(image);};
selectionButton.addEventListener('click',(event)=>{event.stopPropagation();if(s.selection||s.selectionMode)clearSelection();else{s.selectionMode=true;selectionButton.classList.add('is-active');render();}});
function viewerActionTarget(event){return event.target instanceof Element&&!!event.target.closest('.viewer-actions');}
function beginSelection(event){const current=point(event);s.selectionDraft={center:unproject(current.x,current.y),edge:unproject(current.x,current.y)};wrap.setPointerCapture?.(event.pointerId);render();}
function updateSelection(event){const current=point(event);s.selectionDraft.edge=unproject(current.x,current.y);render();}
function finishSelection(event){const cap=selectionCap();s.selection={center:cap.center,edge:cap.edge,ids:selectedImageIds(cap)};s.selectionDraft=null;wrap.releasePointerCapture?.(event.pointerId);showSelectionPanel();render();}
const navigatePointerDown=wrap.onpointerdown,navigatePointerMove=wrap.onpointermove,navigatePointerUp=wrap.onpointerup;
wrap.onpointerdown=(event)=>{if(s.selectionMode&&!viewerActionTarget(event)&&event.button===0){event.preventDefault();beginSelection(event);return;}navigatePointerDown(event);};
wrap.onpointermove=(event)=>{if(s.selectionDraft){event.preventDefault();updateSelection(event);return;}navigatePointerMove(event);};
wrap.onpointerup=(event)=>{if(s.selectionDraft){event.preventDefault();finishSelection(event);return;}navigatePointerUp(event);};
