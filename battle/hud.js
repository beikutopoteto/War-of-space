/* War of Space battle: HUD text, selection and orders, altitude bar, camera, input.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- HUD ---------- */
/* the operation clock starts at op.start and runs CLOCK_RATE minutes per game second */
const CLOCK_RATE=.5;
function clockStr(){ const [h0,m0]=(op.start||'08:00').split(':').map(Number), m=h0*60+m0+Math.floor(gameSec*CLOCK_RATE); return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function setPhase(p){ phaseName=p; document.getElementById('phase').textContent=p; }
function showBrief(t,h,p){ document.getElementById('bt').textContent=t; document.getElementById('bh').textContent=h; document.getElementById('bp').textContent=p; }
function logEvent(title,desc){
  const t=clockStr();
  const prev=document.getElementById('bh').textContent, prevT=document.getElementById('bt').textContent;
  if(prevT!=='作戦概要'){ const li=document.createElement('li'); li.innerHTML=`<b>${prevT}</b>`; li.append(prev); const log=document.getElementById('log'); log.prepend(li); while(log.children.length>3) log.lastChild.remove(); }
  showBrief(t,title,desc); flashBrief();
}

/* ---------- selection & orders ---------- */
function select(f){ selected=f; selGroupMode=false; if(!f) hideGhost(); fleets.forEach(x=>x.el.classList.toggle('sel',x===f));
  if(f){ setAlt(f.order&&f.order.type==='move'?f.order.dest.y:f.pos.y,false); }
  document.getElementById('alt').hidden=!f; updateRoster(); }
/* altitude control: sets the height of the selected fleet's destination */
let selAlt=0; const ALT_MAX=60;
const altTrack=document.getElementById('altTrack'), altKnob=document.getElementById('altKnob'), altVal=document.getElementById('altVal');
function setAlt(v,apply=true){
  selAlt=Math.max(-ALT_MAX,Math.min(ALT_MAX,Math.round(v)));
  altKnob.style.top=(50-50*selAlt/ALT_MAX)+'%'; altVal.textContent=altStr(selAlt); altTrack.setAttribute('aria-valuenow',selAlt);
  if(!apply||!selected||!selected.alive) return;
  const t=orderTargets(); if(!t.length) return;
  const cy=t.reduce((s,f)=>s+(f.order&&f.order.type==='move'?f.order.dest.y:f.pos.y),0)/t.length;
  t.forEach(f=>{
    if(f.order&&f.order.type==='move'){ const d=f.order.dest.clone(); d.y+=selAlt-cy; order(f,{type:'move',dest:d}); }
    else if(!f.order){ order(f,{type:'move',dest:new THREE.Vector3(f.pos.x,f.pos.y+selAlt-cy,f.pos.z)}); }
  });
}
function altFromPointer(e){ const r=altTrack.getBoundingClientRect(); setAlt(ALT_MAX*(1-2*(e.clientY-r.top)/r.height)); }
altTrack.addEventListener('pointerdown',e=>{ altTrack.setPointerCapture(e.pointerId); altFromPointer(e); });
altTrack.addEventListener('pointermove',e=>{ if(altTrack.hasPointerCapture(e.pointerId)) altFromPointer(e); });
altTrack.addEventListener('keydown',e=>{ if(e.key==='ArrowUp'){setAlt(selAlt+5);e.preventDefault();} if(e.key==='ArrowDown'){setAlt(selAlt-5);e.preventDefault();} });
document.getElementById('altUp').addEventListener('click',()=>setAlt(selAlt+5));
document.getElementById('altDn').addEventListener('click',()=>setAlt(selAlt-5));
/* WASD pans the camera across the battle plane, relative to where it is looking; Shift doubles the speed */
const panKeys=new Set();
addEventListener('keydown',e=>{ if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code)) panKeys.add(e.code); });
addEventListener('keyup',e=>panKeys.delete(e.code));
addEventListener('blur',()=>panKeys.clear());
const _fw=new THREE.Vector3(), _rt=new THREE.Vector3(), _mv=new THREE.Vector3();
function panCamera(dt){
  if(!panKeys.size) return;
  camera.getWorldDirection(_fw); _fw.y=0; if(_fw.lengthSq()<1e-6) _fw.set(0,0,-1); _fw.normalize();
  _rt.crossVectors(_fw,camera.up).normalize();
  _mv.set(0,0,0);
  if(panKeys.has('KeyW')) _mv.add(_fw); if(panKeys.has('KeyS')) _mv.sub(_fw);
  if(panKeys.has('KeyD')) _mv.add(_rt); if(panKeys.has('KeyA')) _mv.sub(_rt);
  if(_mv.lengthSq()===0) return;
  const fast=panKeys.has('ShiftLeft')||panKeys.has('ShiftRight')?2:1;
  _mv.normalize().multiplyScalar(camera.position.distanceTo(controls.target)*.45*fast*dt);
  if(Math.hypot(controls.target.x+_mv.x,controls.target.z+_mv.z)>220) return;
  controls.target.add(_mv); camera.position.add(_mv);
}
addEventListener('keydown',e=>{ if(!selected||e.target===altTrack) return; if(e.key==='q'||e.key==='Q') setAlt(selAlt+5); if(e.key==='e'||e.key==='E') setAlt(selAlt-5); });
function order(f,o){
  dropArrow(f.arrow); f.arrow=null; f.order=o;
  if(f.team===1&&!f.seen) return;
  if(o.type==='move') f.arrow=makeArrow(f.pos,o.dest,TEAM_COL[f.team]);
  else { const ar=makeArrow(f.pos,o.target.pos,TEAM_COL[f.team],{life:3.5}); if(f.team===0) f.arrow=ar; }
}

const ray=new THREE.Raycaster(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function proj(v){ const p=v.clone().project(camera); return {x:(p.x+1)/2*W, y:(1-p.y)/2*H, z:p.z}; }
/* hover preview (mouse only): shows where a click would send the selected fleet, at the chosen altitude */
const ghost=new THREE.Group(); ghost.visible=false; scene.add(ghost);
const ghostRing=new THREE.Mesh(new THREE.RingGeometry(2.2,2.7,40),new THREE.MeshBasicMaterial({color:0xbfe4ff,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide}));
ghostRing.rotation.x=-Math.PI/2; ghost.add(ghostRing);
const ghostFoot=new THREE.Mesh(new THREE.RingGeometry(1.2,1.5,32),new THREE.MeshBasicMaterial({color:0x7fc8ff,transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide}));
ghostFoot.rotation.x=-Math.PI/2; scene.add(ghostFoot); ghostFoot.visible=false;
const ghostStalkGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
const ghostStalk=new THREE.Line(ghostStalkGeo,new THREE.LineDashedMaterial({color:0xbfe4ff,dashSize:1.2,gapSize:.8,transparent:true,opacity:.8})); ghostStalk.frustumCulled=false; scene.add(ghostStalk); ghostStalk.visible=false;
const cursorAlt=document.getElementById('cursorAlt');
function hideGhost(){ ghost.visible=ghostFoot.visible=ghostStalk.visible=false; cursorAlt.hidden=true; }
renderer.domElement.addEventListener('pointermove',e=>{
  if(e.pointerType!=='mouse'||!selected||!selected.alive||over||e.buttons){ hideGhost(); return; }
  ray.setFromCamera({x:e.clientX/W*2-1,y:-(e.clientY/H)*2+1},camera); plane.constant=-selAlt;
  const hit=new THREE.Vector3();
  if(!ray.ray.intersectPlane(plane,hit)||Math.hypot(hit.x,hit.z)>200){ hideGhost(); return; }
  ghost.position.copy(hit); ghostFoot.position.set(hit.x,.05,hit.z);
  ghostStalkGeo.setFromPoints([hit,new THREE.Vector3(hit.x,0,hit.z)]); ghostStalk.computeLineDistances();
  ghost.visible=true; ghostFoot.visible=ghostStalk.visible=Math.abs(selAlt)>.5;
  cursorAlt.hidden=false; cursorAlt.textContent='高度'+altStr(selAlt); cursorAlt.style.transform=`translate(${e.clientX+14}px,${e.clientY+10}px)`;
});
renderer.domElement.addEventListener('pointerleave',hideGhost);

/* camera views: oblique / top-down / side-on, plus F to center on the selected fleet */
const VIEWS=[{name:'斜め',dir:()=>new THREE.Vector3(.3,.4,.87)},{name:'真上',dir:()=>new THREE.Vector3(0,1,.002)},
  {name:'真横',dir:()=>{const d=camera.position.clone().sub(controls.target);d.y=0;if(d.lengthSq()<1e-4)d.set(0,0,1);d.normalize();d.y=.06;return d;}}];
let viewIdx=0, camAnim=null;
function flyTo(target,dir,dist){
  dist=dist??camera.position.distanceTo(controls.target);
  camAnim={t:0,fT:controls.target.clone(),tT:target.clone(),fP:camera.position.clone(),tP:target.clone().add(dir.clone().normalize().multiplyScalar(dist))};
}
function setView(i){ viewIdx=i; flyTo(controls.target,VIEWS[i].dir());
  document.querySelectorAll('#camView button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===i))); }
function cycleView(){ setView((viewIdx+1)%VIEWS.length); }
function focusSelected(){ if(!selected||!selected.alive) return; const d=camera.position.clone().sub(controls.target); flyTo(selected.pos,d,Math.min(d.length(),120)); }
/* view angle: horizontal bar turns the camera around the target, vertical bar tilts it from above to below; arrow keys do the same */
const EL_MIN=-80, EL_MAX=88, _sph=new THREE.Spherical(), _off=new THREE.Vector3();
const azTrack=document.getElementById('azTrack'), azKnob=document.getElementById('azKnob'), elTrack=document.getElementById('elTrack'), elKnob=document.getElementById('elKnob');
elTrack.querySelector('.lv').style.top=(100*EL_MAX/(EL_MAX-EL_MIN))+'%';
function getAngles(){ _off.subVectors(camera.position,controls.target); _sph.setFromVector3(_off); return {az:THREE.MathUtils.radToDeg(_sph.theta), el:90-THREE.MathUtils.radToDeg(_sph.phi)}; }
function setAngles(az,el){
  camAnim=null; _off.subVectors(camera.position,controls.target); _sph.setFromVector3(_off);
  if(az!=null) _sph.theta=THREE.MathUtils.degToRad(((az+540)%360)-180);
  if(el!=null) _sph.phi=THREE.MathUtils.degToRad(90-Math.max(EL_MIN,Math.min(EL_MAX,el)));
  _off.setFromSpherical(_sph); camera.position.copy(controls.target).add(_off);
}
function syncCamBars(){ const a=getAngles();
  azKnob.style.left=(50+50*a.az/180)+'%'; elKnob.style.top=(100*(EL_MAX-a.el)/(EL_MAX-EL_MIN))+'%';
  azTrack.setAttribute('aria-valuenow',Math.round(a.az)); elTrack.setAttribute('aria-valuenow',Math.round(a.el)); }
function bindBar(tr,fromEvent){
  tr.addEventListener('pointerdown',e=>{ tr.setPointerCapture(e.pointerId); fromEvent(e); });
  tr.addEventListener('pointermove',e=>{ if(tr.hasPointerCapture(e.pointerId)) fromEvent(e); });
}
bindBar(azTrack,e=>{ const r=azTrack.getBoundingClientRect(); setAngles(360*((e.clientX-r.left)/r.width)-180,null); });
bindBar(elTrack,e=>{ const r=elTrack.getBoundingClientRect(); setAngles(null,EL_MAX-(EL_MAX-EL_MIN)*(e.clientY-r.top)/r.height); });
const rotKeys=new Set();
addEventListener('keydown',e=>{ if(e.target===altTrack) return; if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){ rotKeys.add(e.key); e.preventDefault(); } });
addEventListener('keyup',e=>rotKeys.delete(e.key));
addEventListener('blur',()=>rotKeys.clear());
function rotateByKeys(dt){
  if(!rotKeys.size) return; const a=getAngles();
  const daz=(rotKeys.has('ArrowLeft')?-1:0)+(rotKeys.has('ArrowRight')?1:0), del=(rotKeys.has('ArrowUp')?1:0)+(rotKeys.has('ArrowDown')?-1:0);
  if(daz||del) setAngles(a.az+daz*90*dt, a.el+del*60*dt);
}
function stepCam(dt){
  if(!camAnim) return; camAnim.t=Math.min(1,camAnim.t+dt/.6); const k=camAnim.t*camAnim.t*(3-2*camAnim.t);
  controls.target.lerpVectors(camAnim.fT,camAnim.tT,k); camera.position.lerpVectors(camAnim.fP,camAnim.tP,k);
  if(camAnim.t>=1) camAnim=null;
}
document.querySelectorAll('#camView button').forEach(b=>b.addEventListener('click',()=>setView(+b.dataset.v)));
addEventListener('keydown',e=>{ if(e.code==='KeyV') cycleView(); if(e.code==='KeyF') focusSelected(); });

function tap(x,y){
  if(over) return;
  let best=null,bd=34;
  for(const f of fleets){ if(!f.alive||!shown(f)) continue; const s=proj(f.pos); const d=Math.hypot(s.x-x,s.y-y); if(d<bd){bd=d;best=f;} }
  const fs=proj(fortress.pos.clone().setY(7)); const fd=Math.hypot(fs.x-x,fs.y-y);
  if(best&&best.team===0){ select(best===selected?null:best); return; }
  if(selected&&selected.alive){
    if(best&&best.team===1){ groupOrder({type:'attack',target:best}); return; }
    if(fd<46&&fortress.alive){ groupOrder({type:'attack',target:fortress}); return; }
    ray.setFromCamera({x:x/W*2-1,y:-(y/H)*2+1},camera); const hit=new THREE.Vector3();
    plane.constant=-selAlt;
    if(ray.ray.intersectPlane(plane,hit)&&Math.hypot(hit.x,hit.z)<200){ groupOrder({type:'move',dest:hit}); hideHint(); }
  }
}
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:performance.now()};});
renderer.domElement.addEventListener('pointerup',e=>{ if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<8&&performance.now()-down.t<450) tap(e.clientX,e.clientY); down=null; });
const hintEl=document.getElementById('hint'); let hintGone=false;
function hideHint(){ if(hintGone) return; hintGone=true; hintEl.classList.add('gone'); setTimeout(()=>hintEl.hidden=true,800); }
/* the hint closes on its own after a few seconds, or as soon as the player touches anything */
hintEl.addEventListener('click',hideHint);
addEventListener('pointerdown',hideHint,{capture:true});

document.querySelectorAll('#speed button').forEach(b=>b.addEventListener('click',()=>{
  speed=+b.dataset.s; document.querySelectorAll('#speed button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
}));
document.getElementById('again').addEventListener('click',()=>reset());
document.getElementById('toMenu').addEventListener('click',()=>{ document.getElementById('result').hidden=true; openMenu(); });
function openMenu(){ menuOpen=true; document.body.classList.add('inmenu'); select(null); if(window.WOS_MENU) window.WOS_MENU.open(); }
/* entry point used by the preparation screens (prep.js) */
window.WOS={ start(cfg){
  menuOpen=false; document.body.classList.remove('inmenu'); document.getElementById('menu').hidden=true;
  reset(cfg||null); speed=1; document.querySelectorAll('#speed button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.s==='1')));
  setView(0); flyTo(new THREE.Vector3(0,0,24),new THREE.Vector3(.3,.4,.87),190);
  hintGone=false; hintEl.hidden=false; hintEl.classList.remove('gone'); setTimeout(hideHint,7000);
}, openMenu };

/* the briefing shows its text briefly on each new event, then folds back to one line; click to pin it open */
const briefEl=document.getElementById('brief'); let briefTimer=0;
function flashBrief(ms=5000){ briefEl.classList.add('fresh'); clearTimeout(briefTimer); briefTimer=setTimeout(()=>briefEl.classList.remove('fresh'),ms); }
briefEl.tabIndex=0;
function toggleBrief(){ briefEl.classList.toggle('open'); briefEl.classList.remove('fresh'); }
briefEl.addEventListener('click',toggleBrief);
briefEl.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleBrief(); } });
/* view toggles: H hides the panels, L hides name flags */
const vUi=document.getElementById('vUi'), vLb=document.getElementById('vLb');
function toggleUi(){ const off=document.body.classList.toggle('noui'); vUi.setAttribute('aria-pressed',String(!off)); }
function toggleLabels(){ const off=document.body.classList.toggle('nolabels'); vLb.setAttribute('aria-pressed',String(!off)); }
vUi.addEventListener('click',toggleUi); vLb.addEventListener('click',toggleLabels);
addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT') return; if(e.key==='h'||e.key==='H') toggleUi(); if(e.key==='l'||e.key==='L') toggleLabels(); });
