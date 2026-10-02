/* War of Space battle: HUD text, selection and orders, altitude bar, camera, input.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- HUD ---------- */
/* the operation clock starts at op.start and runs CLOCK_RATE minutes per game second */
const CLOCK_RATE=5;   // 戦闘の1秒で作戦の時計が5分進む（ユーザー決定 2026-10-02: 前の10倍）
/* the operation clock at `min` minutes after the start (now, by default) */
function clockStr(min=gameSec*CLOCK_RATE){ const [h0,m0]=(op.start||'08:00').split(':').map(Number), m=h0*60+m0+Math.floor(min); return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function setPhase(p){ phaseName=p; document.getElementById('phase').textContent=p; }
function showBrief(t,h,p){ document.getElementById('bt').textContent=t; document.getElementById('bh').textContent=h; document.getElementById('bp').textContent=p; }
function logEvent(title,desc){
  const t=clockStr();
  const prev=document.getElementById('bh').textContent, prevT=document.getElementById('bt').textContent;
  if(prevT!=='作戦概要'){ const li=document.createElement('li'); li.innerHTML=`<b>${prevT}</b>`; li.append(prev); const log=document.getElementById('log'); log.prepend(li); while(log.children.length>3) log.lastChild.remove(); }
  showBrief(t,title,desc); flashBrief();
}

/* ---------- selection & orders ---------- */
function select(f){ selected=f; selGroupMode=false; if(!f) hideGhost(); if(typeof closePick==='function') closePick(); fleets.forEach(x=>x.el.classList.toggle('sel',x===f));
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
    if(f.order&&f.order.type==='move'){ const via=pathLeft(f.order), d=via.pop().clone(); d.y+=selAlt-cy; order(f,{type:'move',via,dest:d}); }
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
  dropArrow(f.arrow); f.arrow=null; f.order=o; if(o.type==='attack') f.strike=o.target; /* a carrier's craft keep this target until it falls or another attack is ordered (sim.js) */
  if(o.type==='move') o.path=makePath(f.pos,[...(o.via||[]),o.dest]);
  if(f.team===1&&!f.seen) return;
  if(o.type==='move') f.arrow=makeArrow(f.pos,o.dest,TEAM_COL[f.team],{curve:o.path.curve});
  else if(f.team===1) makeArrow(f.pos,o.target.pos,TEAM_COL[1],{life:3.5}); /* own fleets: a chase arrow that follows the target (loop.js) */
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
  if(e.pointerType==='mouse'&&!e.buttons) renderer.domElement.style.cursor=clickable(e.clientX,e.clientY)?'pointer':'';
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

/* camera views: oblique / top-down / side-on, plus F to center on the selected fleet.
   A view only sets the vertical angle (degrees above the plane); the horizontal angle stays where the player turned it */
const VIEWS=[{name:'斜め',el:24},{name:'真上',el:88},{name:'真横',el:3}];
let viewIdx=0, camAnim=null;
function flyTo(target,dir,dist){
  dist=dist??camera.position.distanceTo(controls.target);
  camAnim={t:0,fT:controls.target.clone(),tT:target.clone(),fP:camera.position.clone(),tP:target.clone().add(dir.clone().normalize().multiplyScalar(dist))};
  camAnim.fD=camAnim.fP.distanceTo(camAnim.fT); camAnim.tD=dist;
}
function setView(i){ viewIdx=i; const a=getAngles();
  flyTo(controls.target,new THREE.Vector3().setFromSphericalCoords(1,THREE.MathUtils.degToRad(90-VIEWS[i].el),THREE.MathUtils.degToRad(a.az)));
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
  _off.subVectors(camera.position,controls.target); if(_off.lengthSq()>1e-6) camera.position.copy(controls.target).add(_off.setLength(camAnim.fD+(camAnim.tD-camAnim.fD)*k));
  if(camAnim.t>=1) camAnim=null;
}
document.querySelectorAll('#camView button').forEach(b=>b.addEventListener('click',()=>setView(+b.dataset.v)));
addEventListener('keydown',e=>{ if(e.code==='KeyV') cycleView(); if(e.code==='KeyF') focusSelected(); });

/* what is under the pointer: the nearest visible fleet, and whether the fortress is there */
function pick(x,y){
  let best=null,bd=34;
  for(const f of fleets){ if(!f.alive||!shown(f)||f.convoy) continue; const s=proj(f.pos); const d=Math.hypot(s.x-x,s.y-y); if(d<bd){bd=d;best=f;} }
  const fs=proj(fortress.pos.clone().setY(7));
  return {best, fort:fortress.alive&&Math.hypot(fs.x-x,fs.y-y)<46};
}
function clickable(x,y){ if(over) return false; const {best,fort}=pick(x,y);
  return !!best&&best.team===0||!!(selected&&selected.alive&&(best||fort)); }
/* left click (or tap) selects an own fleet or gives the selected fleet an order; right click only gives orders.
   With Shift, a click on open space queues a waypoint after the ones already set */
function tap(x,y,cmdOnly=false,queue=false){
  if(over) return;
  const {best,fort}=pick(x,y);
  if(best&&best.team===0){ if(!cmdOnly) select(best===selected?null:best); return; }
  if(selected&&selected.alive){
    const hit=groundAt(x,y);
    /* on an enemy or the fortress, a small choice: attack it, or move to this point */
    if(best&&best.team===1||fort){ openPick(x,y,best&&best.team===1?best:fortress,hit,queue); return; }
    if(hit){ groupOrder({type:'move',dest:hit,queue}); hideHint(); }
  }
}
/* the point under the screen position, at the altitude set on the altitude bar */
function groundAt(x,y){
  ray.setFromCamera({x:x/W*2-1,y:-(y/H)*2+1},camera); const hit=new THREE.Vector3(); plane.constant=-selAlt;
  return ray.ray.intersectPlane(plane,hit)&&Math.hypot(hit.x,hit.z)<200?hit:null;
}
const pickEl=document.getElementById('pick'); let pickCtx=null;
function openPick(x,y,target,dest,queue){
  pickCtx={target,dest,queue};
  pickEl.querySelector('[data-pk="attack"]').textContent=queue?`攻撃を予約：${target.name}`:`攻撃：${target.name}`;
  pickEl.querySelector('[data-pk="move"]').textContent=queue?'ここを経由地に予約':'ここへ移動';
  pickEl.querySelector('[data-pk="move"]').disabled=!dest;
  pickEl.hidden=false;
  const r=pickEl.getBoundingClientRect();
  pickEl.style.transform=`translate(${Math.min(x+12,W-r.width-8)}px,${Math.min(y+8,H-r.height-8)}px)`;
}
function closePick(){ pickCtx=null; pickEl.hidden=true; }
pickEl.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  const c=pickCtx; closePick(); if(!c||over||!selected||!selected.alive) return;
  if(b.dataset.pk==='attack'){ if(c.target.alive) groupOrder({type:'attack',target:c.target,queue:c.queue}); }
  else if(c.dest){ groupOrder({type:'move',dest:c.dest,queue:c.queue}); hideHint(); }
}));
let down=null;
/* a click that only closes the choice does not also give an order */
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:performance.now(),b:e.button,closing:!!pickCtx}; closePick();});
renderer.domElement.addEventListener('pointerup',e=>{ if(down&&!down.closing&&down.b===e.button&&(e.button===0||e.button===2)&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<8&&performance.now()-down.t<450) tap(e.clientX,e.clientY,e.button===2,e.shiftKey); down=null; });
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
const hintEl=document.getElementById('hint'); let hintGone=false;
function hideHint(){ if(hintGone) return; hintGone=true; hintEl.classList.add('gone'); setTimeout(()=>hintEl.hidden=true,800); }
/* the hint closes on its own after a few seconds, or as soon as the player touches anything */
hintEl.addEventListener('click',hideHint);
addEventListener('pointerdown',hideHint,{capture:true});

/* attack policy of the selected fleets (internally stance): 自動交戦 (engage) fires at anything in range and carriers send craft at the
   nearest foe; 命令優先 (evade) fires only on the target of an attack order, and carriers send craft only there. R toggles */
const stanceEl=document.getElementById('stance');
function setStance(v){ const t=orderTargets(); if(t.length) applyStance(t,v,t.length>1?`${armyGroup.name} 全軍`:null); }
/* set 自動交戦/命令優先 on a list of fleets (from the altitude panel, R, or the switches in the fleet list) */
function applyStance(t,v,label){ t.forEach(f=>f.stance=v); updateRoster();
  const n=label||t.map(f=>f.name).join('・');
  logEvent(v==='evade'?`${n} 命令優先`:`${n} 自動交戦`, v==='evade'?'攻撃を命じた敵だけを撃ち、母艦も命じた敵にだけ小型機を出す。':'射程内に入った敵を撃ち、母艦は近い敵に小型機を出す。'); }
/* speed sync of the army group: on, every army moving under a group order keeps to the slowest one */
function toggleSync(){ if(!armyGroup) return; armyGroup.sync=!armyGroup.sync;
  const m=groupAlive(), slow=m.length?Math.min(...m.map(f=>f.speed)):null;
  m.forEach(f=>{ if(armyGroup.sync){ if(f.order&&f.order.type==='move') f.syncSpeed=slow; } else f.syncSpeed=null; });
  updateRoster();
  logEvent(armyGroup.sync?`${armyGroup.name} 速度同期`:`${armyGroup.name} 個別の速度`, armyGroup.sync?'全軍で移動するとき、最も遅い艦に速度を合わせる。':'全軍で移動するときも、各軍がそれぞれの速度で進む。'); }
function syncStance(){ const t=orderTargets(), v=t.length&&t.every(f=>f.stance==='evade')?'evade':'engage';
  stanceEl.querySelectorAll('button[data-st]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.st===v))); }
stanceEl.querySelectorAll('button[data-st]').forEach(b=>b.addEventListener('click',()=>setStance(b.dataset.st)));
stanceEl.querySelector('.undo').addEventListener('click',()=>undo());
addEventListener('keydown',e=>{ if(e.code!=='KeyR'||e.repeat||e.target.tagName==='INPUT') return; const t=orderTargets(); if(t.length) setStance(t.every(f=>f.stance==='evade')?'engage':'evade'); });
let runSpeed=1;
function setSpeed(s){ speed=s; if(s>0) runSpeed=s; document.querySelectorAll('#speed button').forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.s===s))); }
document.querySelectorAll('#speed button').forEach(b=>b.addEventListener('click',()=>setSpeed(+b.dataset.s)));
/* in-battle menu (Esc or the メニュー button): the battle stands still while it is open.
   続ける closes it, やり直す starts the operation again, やめる gives up (a defeat), 操作の一覧 shows the controls */
const pauseEl=document.getElementById('pause'); let paused=false, pausedSpeed=1;
function openPause(){ if(paused||over||menuOpen) return; paused=true; pausedSpeed=speed; setSpeed(0); closePick(); pauseEl.hidden=false; pauseEl.querySelector('[data-pm="resume"]').focus(); }
function closePause(){ if(!paused) return; paused=false; pauseEl.hidden=true; setSpeed(pausedSpeed); }
pauseEl.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  const a=b.dataset.pm;
  if(a==='resume') closePause();
  if(a==='retry'){ closePause(); talkDone=null; endTalk(); reset(); setSpeed(1); startTalk(op.talk&&op.talk.before); }
  if(a==='quit'){ closePause(); talkDone=null; endTalk(); end(false,true); }
  if(a==='keys'){ const k=document.getElementById('keys'); k.hidden=!k.hidden; b.setAttribute('aria-pressed',String(!k.hidden)); }
}));
pauseEl.addEventListener('pointerdown',e=>{ if(e.target===pauseEl) closePause(); });
document.getElementById('pmBtn').addEventListener('click',()=>paused?closePause():openPause());
document.getElementById('undoBtn').addEventListener('click',()=>undo());
/* while the menu is open, only Esc (to close it) reaches the battle */
addEventListener('keydown',e=>{ if(!paused) return; if(e.code==='Escape'){ e.preventDefault(); closePause(); } if(e.code!=='Tab') e.stopImmediatePropagation(); },true);
/* PC keys: Space pauses, 1–9 pick a fleet in roster order, G picks the whole army group, Esc opens the menu, Ctrl+Z or Backspace undoes the last order */
addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT'||e.repeat) return;
  if(e.code==='Space'){ e.preventDefault(); if(!over) setSpeed(speed>0?0:runSpeed); return; }
  if(e.code==='Escape'){ openPause(); return; }
  if(e.code==='Backspace'||e.code==='KeyZ'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); if(!over) undo(); return; }
  if(e.code==='Enter'&&talking){ e.preventDefault(); nextTalk(); return; }
  if(e.code==='KeyG'){ if(armyGroup&&!selGroupMode) selectGroup(); return; }
  const m=/^Digit([1-9])$/.exec(e.code); if(m){ const f=fleets.filter(x=>x.team===0&&!x.convoy)[+m[1]-1]; if(f&&f.alive) select(f); }
});
document.getElementById('again').addEventListener('click',()=>{ reset(); startTalk(op.talk&&op.talk.before); });
document.getElementById('toMenu').addEventListener('click',()=>{ document.getElementById('result').hidden=true; openMenu(); });
function openMenu(){ talkDone=null; endTalk(); menuOpen=true; document.body.classList.add('inmenu'); select(null); if(window.WOS_MENU) window.WOS_MENU.open(); }
/* entry point used by the preparation screens (prep.js) */
window.WOS={ start(cfg){
  menuOpen=false; document.body.classList.remove('inmenu'); document.getElementById('menu').hidden=true;
  reset(cfg||null); setSpeed(1); startTalk(op.talk&&op.talk.before);
  /* the opening view: op.view {target:[x,z], dist} or the whole field */
  const V=op.view||{target:[0,24],dist:190};
  setView(0); flyTo(new THREE.Vector3(V.target[0],0,V.target[1]),new THREE.Vector3(.3,.4,.87),V.dist);
  hintGone=false; hintEl.hidden=false; hintEl.classList.remove('gone'); setTimeout(hideHint,7000);
}, openMenu };

/* mission panel (top right, under the legend): what to do now, with a gauge.
   Escort: boarding % until the convoy sails, then how far along its route it is. Fortress: the armor left. Click to fold it */
const goalEl=document.getElementById('goal'), goalText=document.getElementById('goalText'), goalBar=document.getElementById('goalBar'),
  goalLabel=document.getElementById('goalLabel'), goalSub=document.getElementById('goalSub');
goalEl.addEventListener('click',()=>goalEl.classList.toggle('fold'));
function updateGoal(){
  let text='', p=0, label='', subT='', mode='';
  if(convoy){ const C=op.convoy, lose=op.win&&op.win.lose||convoy.n, left=convoy.alive||convoy.escaped?convoy.ships.length:0;
    if(convoy.escaped){ text='輸送船団は離脱点を越えた'; p=1; label='離脱完了'; mode='done'; }
    else if(!convoy.alive){ text='輸送船団は全滅した'; p=0; label=''; mode='fail'; }
    else if(!convoy.departed){ p=Math.min(1,gameSec*CLOCK_RATE/C.depart); text=C.boardText||'乗船が終わるまで、敵を輸送船団に近づけるな'; label=`乗船 ${Math.floor(p*100)}%　${clockStr(C.depart)} 出港`; mode='board'; }
    else { const pa=convoy.order&&convoy.order.path; p=pa?pa.s/pa.L:1; text=C.escortText||'輸送船団を離脱点まで守れ'; label=`離脱点まで ${Math.floor(p*100)}%`; mode='escort'; }
    subT=`輸送船 ${left}/${convoy.n}隻　${lose}隻失うと失敗`; }
  else if(op.fortress){ p=fortress.alive?Math.max(0,fortress.hpPool/fortress.max):0; text=`${op.fortress.name}の装甲を0にせよ`; label=`装甲 ${Math.ceil(p*100)}%`; mode='fort'; }
  if(over) text=outcome?'任務達成':'任務失敗';
  goalEl.hidden=!text; goalText.textContent=text; goalBar.style.width=(p*100).toFixed(1)+'%'; goalLabel.textContent=label; goalSub.textContent=subT; goalEl.dataset.mode=mode;
}

/* short conversations before and after an operation: one line at a time in a small strip at the bottom; the battle waits while it shows.
   Click or Enter for the next line, Esc or とばす to skip */
const talkEl=document.getElementById('talk'), talkWho=document.getElementById('talkWho'), talkText=document.getElementById('talkText');
let talkQ=[], talkDone=null, talking=false;
function startTalk(lines,done){ talkQ=(lines||[]).slice(); talkDone=done||null; if(!talkQ.length){ endTalk(); return; } talking=true; talkEl.hidden=false; nextTalk(); }
/* a line with no speaker is narration */
function nextTalk(){ const l=talkQ.shift(); if(!l){ endTalk(); return; } talkWho.textContent=l[0]; talkWho.hidden=!l[0]; talkEl.classList.toggle('narr',!l[0]); talkText.textContent=l[1]; }
function endTalk(){ talkEl.hidden=true; talking=false; talkQ=[]; const d=talkDone; talkDone=null; if(d) d(); }
talkEl.addEventListener('click',e=>{ if(e.target.id==='talkSkip') endTalk(); else nextTalk(); });

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
