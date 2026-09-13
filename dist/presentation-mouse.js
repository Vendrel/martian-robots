// Presentation mouse finder calibration.  The reticle fades in after motion,
// waits while the pointer is still, then fades out without ever capturing input.
// Covered cases: first activation before movement, viewport edges, pointer exit,
// window blur, hidden tabs, touch pointers, and rapid stop/start movement.
const PRESENTATION_MOUSE_FADE_IN_MS = 500;
const PRESENTATION_MOUSE_IDLE_DELAY_MS = 900;
const PRESENTATION_MOUSE_FADE_OUT_MS = 3000;
const PRESENTATION_MOUSE_EDGE_GUARD_PX = 100;

const presentationMouse = document.querySelector('#presentationMouse');
const presentationMouseToggle = document.querySelector('#presentationMouseToggle');
const controllerAimer = document.querySelector('#controllerAimer');
let presentationMouseEnabled = false;
let presentationMouseHasPointer = false;
let presentationMouseX = 0;
let presentationMouseY = 0;
let presentationMouseLastMove = 0;
let presentationMouseOpacity = 0;
let presentationMouseFrame = 0;
let presentationMouseLastFrame = 0;
let presentationMouseVirtual = false;

function presentationMouseIsEnabled(){return presentationMouseEnabled||document.fullscreenElement===document.querySelector('#panoramaWrap')}
function presentationMouseInsideSafeArea(){return presentationMouseX>=PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseY>=PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseX<=window.innerWidth-PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseY<=window.innerHeight-PRESENTATION_MOUSE_EDGE_GUARD_PX}
function presentationMouseSetPosition(){presentationMouse.style.transform=`translate3d(${presentationMouseX}px, ${presentationMouseY}px, 0) translate(-50%, -50%)`}
function presentationMouseStop(){if(presentationMouseFrame){cancelAnimationFrame(presentationMouseFrame);presentationMouseFrame=0}presentationMouseOpacity=0;presentationMouse.style.opacity='0';presentationMouse.classList.remove('is-active')}
function presentationMouseTick(now){const elapsed=Math.max(0,now-presentationMouseLastFrame);presentationMouseLastFrame=now;const shouldShow=presentationMouseIsEnabled()&&presentationMouseHasPointer&&(presentationMouseVirtual||presentationMouseInsideSafeArea())&&now-presentationMouseLastMove<PRESENTATION_MOUSE_IDLE_DELAY_MS;const duration=shouldShow?PRESENTATION_MOUSE_FADE_IN_MS:PRESENTATION_MOUSE_FADE_OUT_MS;const target=shouldShow?1:0;presentationMouseOpacity+=Math.sign(target-presentationMouseOpacity)*Math.min(Math.abs(target-presentationMouseOpacity),elapsed/duration);presentationMouse.style.opacity=String(presentationMouseOpacity);if(presentationMouseOpacity>0||shouldShow){presentationMouseFrame=requestAnimationFrame(presentationMouseTick)}else{presentationMouseFrame=0;presentationMouse.classList.remove('is-active')}}
function presentationMouseWake(){if(!presentationMouseIsEnabled())return;presentationMouse.classList.add('is-active');if(!presentationMouseFrame){presentationMouseLastFrame=performance.now();presentationMouseFrame=requestAnimationFrame(presentationMouseTick)}}
function presentationMouseMove(event){if(event.pointerType==='touch'||presentationMouseVirtual)return;presentationMouseHasPointer=true;presentationMouseX=event.clientX;presentationMouseY=event.clientY;presentationMouseLastMove=performance.now();presentationMouseSetPosition();if(!presentationMouseInsideSafeArea()){presentationMouseStop();return}presentationMouseWake()}

presentationMouseToggle.checked=false;
presentationMouseToggle.addEventListener('change',()=>{presentationMouseEnabled=presentationMouseToggle.checked;if(!presentationMouseIsEnabled()){presentationMouseStop();return}presentationMouseLastMove=performance.now();presentationMouseWake()});
window.addEventListener('pointermove',presentationMouseMove,{passive:true});
document.addEventListener('fullscreenchange',()=>{if(!presentationMouseIsEnabled()){presentationMouseStop();return}presentationMouseLastMove=performance.now();presentationMouseWake()});
window.addEventListener('blur',presentationMouseStop);
window.addEventListener('mouseout',event=>{if(!event.relatedTarget)presentationMouseStop()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)presentationMouseStop()});
window.addEventListener('mars360presentationaim',event=>{const detail=event.detail||{};presentationMouseVirtual=Boolean(detail.active);if(!presentationMouseVirtual)return;presentationMouseHasPointer=true;presentationMouseX=Number(detail.x)||window.innerWidth/2;presentationMouseY=Number(detail.y)||window.innerHeight/2;presentationMouseLastMove=performance.now();presentationMouseSetPosition();presentationMouseWake()});

// The controller aimer is deliberately a second reticle instance. It shares
// the presentation finder's animation language but has no pointer dependency:
// R3 drives a centred aim point in the panorama renderer through this event.
let controllerAimerHeld = false;
let controllerAimerLastActivity = 0;
let controllerAimerOpacity = 0;
let controllerAimerFrame = 0;
let controllerAimerLastFrame = 0;
function controllerAimerStop(){if(controllerAimerFrame){cancelAnimationFrame(controllerAimerFrame);controllerAimerFrame=0}controllerAimerOpacity=0;controllerAimer.style.opacity='0';controllerAimer.classList.remove('is-active')}
function controllerAimerTick(now){const elapsed=Math.max(0,now-controllerAimerLastFrame);controllerAimerLastFrame=now;const shouldShow=controllerAimerHeld||now-controllerAimerLastActivity<PRESENTATION_MOUSE_IDLE_DELAY_MS,target=shouldShow?1:0,duration=shouldShow?PRESENTATION_MOUSE_FADE_IN_MS:PRESENTATION_MOUSE_FADE_OUT_MS;controllerAimerOpacity+=Math.sign(target-controllerAimerOpacity)*Math.min(Math.abs(target-controllerAimerOpacity),elapsed/duration);controllerAimer.style.opacity=String(controllerAimerOpacity);if(controllerAimerOpacity>0||shouldShow)controllerAimerFrame=requestAnimationFrame(controllerAimerTick);else{controllerAimerFrame=0;controllerAimer.classList.remove('is-active')}}
function controllerAimerSetActive(active){if(!controllerAimer)return;controllerAimerHeld=active;controllerAimerLastActivity=performance.now();if(active){controllerAimer.classList.add('is-active');if(!controllerAimerFrame){controllerAimerLastFrame=controllerAimerLastActivity;controllerAimerFrame=requestAnimationFrame(controllerAimerTick)}}else if(controllerAimerOpacity&&!controllerAimerFrame){controllerAimerLastFrame=controllerAimerLastActivity;controllerAimerFrame=requestAnimationFrame(controllerAimerTick)}}
window.addEventListener('mars360controlleraimer',event=>controllerAimerSetActive(Boolean(event.detail?.active)));
window.addEventListener('blur',()=>{controllerAimerHeld=false;controllerAimerStop()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){controllerAimerHeld=false;controllerAimerStop()}});
