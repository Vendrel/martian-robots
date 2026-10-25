// Presentation mouse finder calibration.  The reticle fades in after motion,
// waits while the pointer is still, then fades out without ever capturing input.
// Covered cases: first activation before movement, viewport edges, pointer exit,
// window blur, hidden tabs, touch pointers, and rapid stop/start movement.
const PRESENTATION_MOUSE_TIMING = window.mars360PresentationMouseTiming||{};
const PRESENTATION_MOUSE_FADE_IN_MS = 500;
const PRESENTATION_MOUSE_IDLE_DELAY_MS = PRESENTATION_MOUSE_TIMING.idleDelayMs||900;
const PRESENTATION_MOUSE_FADE_OUT_MS = PRESENTATION_MOUSE_TIMING.fadeOutMs||3000;
const PRESENTATION_MOUSE_EDGE_GUARD_PX = 100;
const PRESENTATION_MOUSE_AGILE = true;

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
let presentationMouseLastPointerSample = null;
let presentationMouseMovementSessionActive = false;
let presentationMouseVelocity = {overall:0,x:0,y:0};
let presentationMouseAgileAngles = {ticks:0,layer3:0,layer4:0};
let presentationMouseAgileDirections = {ticks:1,layer3:1,layer4:1};
const presentationMouseReducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function presentationMouseIsEnabled(){return presentationMouseEnabled||document.fullscreenElement===document.querySelector('#panoramaWrap')}
function presentationMouseInsideSafeArea(){return presentationMouseX>=PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseY>=PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseX<=window.innerWidth-PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseY<=window.innerHeight-PRESENTATION_MOUSE_EDGE_GUARD_PX}
function presentationMouseBeginMovementSession(){if(presentationMouseMovementSessionActive)return;presentationMouseMovementSessionActive=true;presentationMouseAgileDirections={ticks:Math.random()<.5?-1:1,layer3:Math.random()<.5?-1:1,layer4:Math.random()<.5?-1:1}}
function presentationMouseSetPosition(sampleTime=performance.now()){const nextX=Number.isFinite(presentationMouseX)?presentationMouseX:window.innerWidth/2,nextY=Number.isFinite(presentationMouseY)?presentationMouseY:window.innerHeight/2;if(presentationMouseLastPointerSample){const elapsed=Math.max(8,Math.min(120,sampleTime-presentationMouseLastPointerSample.time)),rawX=Math.max(-2.8,Math.min(2.8,(nextX-presentationMouseLastPointerSample.x)/elapsed)),rawY=Math.max(-2.8,Math.min(2.8,(nextY-presentationMouseLastPointerSample.y)/elapsed)),smoothing=1-Math.exp(-elapsed/85);presentationMouseVelocity.x+=(rawX-presentationMouseVelocity.x)*smoothing;presentationMouseVelocity.y+=(rawY-presentationMouseVelocity.y)*smoothing;presentationMouseVelocity.overall+=(Math.hypot(rawX,rawY)-presentationMouseVelocity.overall)*smoothing}presentationMouseLastPointerSample={x:nextX,y:nextY,time:sampleTime};presentationMouse.style.transform=`translate3d(${nextX}px, ${nextY}px, 0) translate(-50%, -50%)`}
function presentationMouseUpdateAgileMotion(elapsed){if(!PRESENTATION_MOUSE_AGILE||presentationMouseReducedMotionQuery.matches)return;const decay=Math.exp(-elapsed/420),seconds=elapsed/1000;presentationMouseVelocity.x*=decay;presentationMouseVelocity.y*=decay;presentationMouseVelocity.overall*=decay;presentationMouseAgileAngles.ticks+=presentationMouseAgileDirections.ticks*(20+presentationMouseVelocity.overall*265)*seconds;presentationMouseAgileAngles.layer3+=presentationMouseAgileDirections.layer3*(28+presentationMouseVelocity.x*215)*seconds;presentationMouseAgileAngles.layer4+=presentationMouseAgileDirections.layer4*(-25+presentationMouseVelocity.y*215)*seconds;presentationMouse.style.setProperty('--pm-ticks-angle',`${presentationMouseAgileAngles.ticks.toFixed(2)}deg`);presentationMouse.style.setProperty('--pm-layer-3-angle',`${presentationMouseAgileAngles.layer3.toFixed(2)}deg`);presentationMouse.style.setProperty('--pm-layer-4-angle',`${presentationMouseAgileAngles.layer4.toFixed(2)}deg`)}
function presentationMouseStop(){if(presentationMouseFrame){cancelAnimationFrame(presentationMouseFrame);presentationMouseFrame=0}presentationMouseOpacity=0;presentationMouse.style.opacity='0';presentationMouse.classList.remove('is-active');presentationMouseMovementSessionActive=false}
function presentationMouseTick(now){const elapsed=Math.max(0,now-presentationMouseLastFrame);presentationMouseLastFrame=now;presentationMouseUpdateAgileMotion(elapsed);const shouldShow=presentationMouseIsEnabled()&&presentationMouseHasPointer&&(presentationMouseVirtual||presentationMouseInsideSafeArea())&&now-presentationMouseLastMove<PRESENTATION_MOUSE_IDLE_DELAY_MS;const duration=shouldShow?PRESENTATION_MOUSE_FADE_IN_MS:PRESENTATION_MOUSE_FADE_OUT_MS;const target=shouldShow?1:0;presentationMouseOpacity+=Math.sign(target-presentationMouseOpacity)*Math.min(Math.abs(target-presentationMouseOpacity),elapsed/duration);presentationMouse.style.opacity=String(presentationMouseOpacity);if(presentationMouseOpacity>0||shouldShow){presentationMouseFrame=requestAnimationFrame(presentationMouseTick)}else{presentationMouseFrame=0;presentationMouse.classList.remove('is-active')}}
function presentationMouseWake(){if(!presentationMouseIsEnabled())return;presentationMouse.classList.add('is-active');if(!presentationMouseFrame){presentationMouseLastFrame=performance.now();presentationMouseFrame=requestAnimationFrame(presentationMouseTick)}}
function presentationMouseMove(event){if(event.pointerType==='touch'||presentationMouseVirtual)return;const now=performance.now();if(!presentationMouseMovementSessionActive||now-presentationMouseLastMove>=PRESENTATION_MOUSE_IDLE_DELAY_MS){presentationMouseMovementSessionActive=false;presentationMouseBeginMovementSession()}presentationMouseHasPointer=true;presentationMouseX=event.clientX;presentationMouseY=event.clientY;presentationMouseLastMove=now;presentationMouseSetPosition(now);if(!presentationMouseInsideSafeArea()){presentationMouseStop();return}presentationMouseWake()}

presentationMouseToggle.checked=false;
presentationMouse.classList.toggle('is-agile',PRESENTATION_MOUSE_AGILE);
presentationMouseToggle.addEventListener('change',()=>{presentationMouseEnabled=presentationMouseToggle.checked;if(!presentationMouseIsEnabled()){presentationMouseStop();return}presentationMouseLastMove=performance.now();presentationMouseWake()});
window.addEventListener('pointermove',presentationMouseMove,{passive:true,capture:true});
document.addEventListener('fullscreenchange',()=>{if(!presentationMouseIsEnabled()){presentationMouseStop();return}presentationMouseLastMove=performance.now();presentationMouseWake()});
window.addEventListener('blur',presentationMouseStop);
window.addEventListener('mouseout',event=>{if(!event.relatedTarget)presentationMouseStop()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)presentationMouseStop()});
window.addEventListener('mars360presentationaim',event=>{const detail=event.detail||{},now=performance.now();presentationMouseVirtual=Boolean(detail.active);if(!presentationMouseVirtual)return;if(!presentationMouseMovementSessionActive||now-presentationMouseLastMove>=PRESENTATION_MOUSE_IDLE_DELAY_MS){presentationMouseMovementSessionActive=false;presentationMouseBeginMovementSession()}presentationMouseHasPointer=true;presentationMouseX=Number(detail.x)||window.innerWidth/2;presentationMouseY=Number(detail.y)||window.innerHeight/2;presentationMouseLastMove=now;presentationMouseSetPosition(now);presentationMouseWake()});

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
