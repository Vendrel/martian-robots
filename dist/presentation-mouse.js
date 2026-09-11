// Presentation mouse finder calibration.  The reticle fades in after motion,
// waits while the pointer is still, then fades out without ever capturing input.
// Covered cases: first activation before movement, viewport edges, pointer exit,
// window blur, hidden tabs, touch pointers, and rapid stop/start movement.
const PRESENTATION_MOUSE_FADE_IN_MS = 300;
const PRESENTATION_MOUSE_IDLE_DELAY_MS = 900;
const PRESENTATION_MOUSE_FADE_OUT_MS = 3000;
const PRESENTATION_MOUSE_EDGE_GUARD_PX = 52;

const presentationMouse = document.querySelector('#presentationMouse');
const presentationMouseToggle = document.querySelector('#presentationMouseToggle');
let presentationMouseEnabled = false;
let presentationMouseHasPointer = false;
let presentationMouseX = 0;
let presentationMouseY = 0;
let presentationMouseLastMove = 0;
let presentationMouseOpacity = 0;
let presentationMouseFrame = 0;
let presentationMouseLastFrame = 0;

function presentationMouseInsideSafeArea(){return presentationMouseX>=PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseY>=PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseX<=window.innerWidth-PRESENTATION_MOUSE_EDGE_GUARD_PX&&presentationMouseY<=window.innerHeight-PRESENTATION_MOUSE_EDGE_GUARD_PX}
function presentationMouseSetPosition(){presentationMouse.style.transform=`translate3d(${presentationMouseX}px, ${presentationMouseY}px, 0) translate(-50%, -50%)`}
function presentationMouseStop(){if(presentationMouseFrame){cancelAnimationFrame(presentationMouseFrame);presentationMouseFrame=0}presentationMouseOpacity=0;presentationMouse.style.opacity='0';presentationMouse.classList.remove('is-active')}
function presentationMouseTick(now){const elapsed=Math.max(0,now-presentationMouseLastFrame);presentationMouseLastFrame=now;const shouldShow=presentationMouseEnabled&&presentationMouseHasPointer&&presentationMouseInsideSafeArea()&&now-presentationMouseLastMove<PRESENTATION_MOUSE_IDLE_DELAY_MS;const duration=shouldShow?PRESENTATION_MOUSE_FADE_IN_MS:PRESENTATION_MOUSE_FADE_OUT_MS;const target=shouldShow?1:0;presentationMouseOpacity+=Math.sign(target-presentationMouseOpacity)*Math.min(Math.abs(target-presentationMouseOpacity),elapsed/duration);presentationMouse.style.opacity=String(presentationMouseOpacity);if(presentationMouseOpacity>0||shouldShow){presentationMouseFrame=requestAnimationFrame(presentationMouseTick)}else{presentationMouseFrame=0;presentationMouse.classList.remove('is-active')}}
function presentationMouseWake(){if(!presentationMouseEnabled)return;presentationMouse.classList.add('is-active');if(!presentationMouseFrame){presentationMouseLastFrame=performance.now();presentationMouseFrame=requestAnimationFrame(presentationMouseTick)}}
function presentationMouseMove(event){if(event.pointerType==='touch')return;presentationMouseHasPointer=true;presentationMouseX=event.clientX;presentationMouseY=event.clientY;presentationMouseLastMove=performance.now();presentationMouseSetPosition();if(!presentationMouseInsideSafeArea()){presentationMouseStop();return}presentationMouseWake()}

presentationMouseToggle.checked=false;
presentationMouseToggle.addEventListener('change',()=>{presentationMouseEnabled=presentationMouseToggle.checked;if(!presentationMouseEnabled){presentationMouseStop();return}presentationMouseLastMove=performance.now();presentationMouseWake()});
window.addEventListener('pointermove',presentationMouseMove,{passive:true});
window.addEventListener('blur',presentationMouseStop);
window.addEventListener('mouseout',event=>{if(!event.relatedTarget)presentationMouseStop()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)presentationMouseStop()});
