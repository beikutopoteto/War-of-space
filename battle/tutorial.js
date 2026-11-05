/* Guided exercise. The text and targets live in the operation data. */
let tutorial=null, tutorialArrow=null;
const trainingEl=document.getElementById('training');
const guideEl=document.createElement('div'); guideEl.id='tutorialGuide'; guideEl.className='hud'; guideEl.hidden=true;
guideEl.innerHTML='<div class="tutorial-head"><b>副官</b> <span></span><button data-skip>とばす</button><button data-fold aria-label="案内をたたむ" aria-expanded="true">▾</button></div><p></p>';
document.body.appendChild(guideEl);
const tutorialFrames=[0,1].map(()=>{ const e=document.createElement('div'); e.className='tutorial-frame hud'; e.hidden=true; document.body.appendChild(e); return e; });
guideEl.querySelector('[data-skip]').addEventListener('click',()=>{ if(tutorial){ tutorial.skipped=true; tutorialRender(); } });
guideEl.querySelector('[data-fold]').addEventListener('click',e=>{ guideEl.classList.toggle('fold'); const folded=guideEl.classList.contains('fold'); e.currentTarget.textContent=folded?'▸':'▾'; e.currentTarget.setAttribute('aria-expanded',String(!folded)); });
function tutorialActive(){ return !!(tutorial&&!tutorial.skipped); }
function tutorialHolding(){ return tutorialActive()&&tutorial.step<10; }
function tutorialProtected(){ return tutorialActive()&&tutorial.step<4; }
function tutorialInit(cfg){
  if(tutorialArrow){ dropArrow(tutorialArrow); tutorialArrow=null; }
  tutorial=cfg&&cfg.tutorial&&op.tutorial?{step:0,skipped:false,queue:0,altChanged:false,attack:null,launched:false,group:null,rotation:0,angles:null}:null;
  guideEl.classList.remove('fold'); guideEl.querySelector('[data-fold]').textContent='▾'; guideEl.querySelector('[data-fold]').setAttribute('aria-expanded','true'); tutorialRender();
}
function tutorialRender(){
  const active=tutorialActive(), row=active&&op.tutorial[tutorial.step];
  guideEl.hidden=!active||over; trainingEl.hidden=!active;
  if(!row){ trainingEl.innerHTML=''; tutorialFrames.forEach(e=>e.hidden=true); if(tutorialArrow){dropArrow(tutorialArrow);tutorialArrow=null;} return; }
  guideEl.querySelector('.tutorial-head span').textContent=`${tutorial.step+1}/11 ${row.name}`;
  guideEl.querySelector('p').textContent=row.text;
  trainingEl.innerHTML=`<div><i>TRAINING</i> 演習 ${tutorial.step+1}/11 ${row.name}</div><div class="training-ticks">${op.tutorial.map((_,i)=>`<span class="${i<tutorial.step?'done':i===tutorial.step?'current':''}"></span>`).join('')}</div>`;
  if(tutorialArrow){dropArrow(tutorialArrow);tutorialArrow=null;}
  if(tutorial.step===3){ const f=fleets.find(x=>x.name==='第14 北方防空 戦闘隊'); if(f) tutorialArrow=makeArrow(f.pos.clone().add(new THREE.Vector3(0,18,28)),f.pos.clone().add(new THREE.Vector3(0,18,0)),new THREE.Color(0xe2c58a)); }
}
function tutorialAdvance(){ if(!tutorialActive()||tutorial.step>=10) return; tutorial.step++; tutorialRender(); }
function tutorialEvent(kind){ if(!tutorialActive()) return; if(op.tutorial[tutorial.step].condition===kind) tutorialAdvance(); }
function tutorialOrder(o,targets){
  if(!tutorialActive()) return;
  const condition=op.tutorial[tutorial.step].condition;
  if(condition==='move'&&o.type==='move') tutorialAdvance();
  else if(condition==='altitude'&&o.type==='move'&&tutorial.altChanged&&selAlt!==0) tutorialAdvance();
  else if(condition==='attack'&&o.type==='attack'&&o.target.kind==='fleet'&&o.target.team===1) tutorial.attack=o.target;
  else if(condition==='queue'&&o.queue){ const count=f=>f.queue.length+f.queue.reduce((n,q)=>n+(q.type==='move'?(q.via||[]).length:0),0)+(f.order&&f.order.type==='move'?Math.max(0,pathLeft(f.order).length-1):0); if(targets.some(f=>count(f)>=2)) tutorialAdvance(); }
  else if(condition==='group'&&o.type==='move'&&selGroup&&selGroup===tutorial.group) tutorialAdvance();
}
function tutorialGroupCreated(g){ if(tutorialActive()&&tutorial.step===9) tutorial.group=g; }
function tutorialDamage(t,amt,src){ if(tutorialActive()&&tutorial.step===4&&amt>0&&t===tutorial.attack&&src&&src.team===0) tutorialAdvance(); }
function tutorialLaunch(f){ if(tutorialActive()&&f.team===0&&f.name==='第4 空母航空 打撃群'){ tutorial.launched=true; if(tutorial.step===6) tutorialAdvance(); } }
function tutorialTick(){ if(!tutorialActive()) return; if(tutorial.step===3&&fleets.some(f=>f.name==='第14 北方防空 戦闘隊'&&f.everSeen)) tutorialAdvance(); else if(tutorial.step===6&&tutorial.launched) tutorialAdvance(); }
function tutorialFrame(){
  if(!tutorialActive()){ tutorialFrames.forEach(e=>e.hidden=true); return; }
  if(tutorial.step===0&&!camAnim){ const a=getAngles(); if(tutorial.angles&&(rotKeys.size||stick.az||stick.el||tutorial.dragging)){ const d=Math.abs(((a.az-tutorial.angles.az+540)%360)-180)+Math.abs(a.el-tutorial.angles.el); tutorial.rotation+=d; if(tutorial.rotation>=45) tutorialAdvance(); } tutorial.angles=a; }
  guideEl.hidden=over;
  const row=op.tutorial[tutorial.step], targets=row.targets.map(s=>document.querySelector(s));
  tutorialFrames.forEach((e,i)=>{ const t=targets[i], r=t&&t.getBoundingClientRect(); e.hidden=!r||!r.width||!r.height||over; if(!e.hidden) Object.assign(e.style,{left:(r.left-4)+'px',top:(r.top-4)+'px',width:(r.width+8)+'px',height:(r.height+8)+'px'}); });
  const r=targets[0]&&targets[0].getBoundingClientRect();
  if(!r||!r.width||!r.height){ guideEl.style.left='50%'; guideEl.style.top='80px'; guideEl.style.transform='translateX(-50%)'; guideEl.dataset.side='top'; }
  /* the guide is zoomed with the HUD (--uis), so its left/top are in zoomed px: place it in screen px, then divide */
  else { const k=+getComputedStyle(document.documentElement).getPropertyValue('--uis')||1, g=guideEl.getBoundingClientRect(), w=g.width, h=g.height, right=r.left<innerWidth/2;
    guideEl.style.transform='none'; guideEl.style.left=Math.max(8,Math.min(innerWidth-w-8,right?r.right+16:r.left-w-16))/k+'px'; guideEl.style.top=Math.max(8,Math.min(innerHeight-h-8,r.top))/k+'px'; guideEl.dataset.side=right?'left':'right'; }
}
renderer.domElement.addEventListener('pointerdown',()=>{if(tutorial) tutorial.dragging=true;});
addEventListener('pointerup',()=>{if(tutorial) tutorial.dragging=false;});
