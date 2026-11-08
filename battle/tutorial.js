/* Guided exercise. Text and targets live in the operation data. */
let tutorial=null, tutorialArrow=null, tutorialMarks=[];
const trainingEl=document.getElementById('training');
const tutorialFrames=[0,1].map(()=>{ const e=document.createElement('div'); e.className='tutorial-frame hud'; e.hidden=true; document.body.appendChild(e); return e; });
function tutorialActive(){ return !!(tutorial&&!tutorial.skipped); }
function tutorialCondition(){ return tutorialActive()&&op.tutorial[tutorial.step].condition; }
function tutorialBefore(condition){ return tutorialActive()&&tutorial.step<op.tutorial.findIndex(r=>r.condition===condition); }
function tutorialHolding(){ return tutorialBefore('win'); }
function tutorialProtected(){ return tutorialBefore('attack'); }
function tutorialClearMarks(){ tutorialMarks.forEach(m=>{scene.remove(m.group); m.group.traverse(o=>{if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose();}); m.label.remove();}); tutorialMarks=[]; }
function tutorialInit(cfg){
  if(tutorialArrow){ dropArrow(tutorialArrow); tutorialArrow=null; }
  tutorialClearMarks();
  tutorial=(cfg&&cfg.tutorial)&&op.tutorial?{step:0,skipped:false,attack:null,launched:false,group:null,rotation:0,angles:null,passed:null,times:[]}:null;
  if(op.groundDrill&&tutorial)groundDrillEnter();
  tutorialRender();
}
function tutorialTalk(){
  if(talking) return;
  const row=tutorialActive()&&!over&&op.tutorial[tutorial.step];
  talkEl.classList.toggle('tutorial-talk',!!row);
  talkText.hidden=false;
  document.getElementById('talkSkip').textContent='とばす';
  if(!row){talkEl.hidden=true; return;}
  talkEl.hidden=false; talkEl.classList.remove('narr'); talkWho.hidden=false; talkWho.textContent='リコ軍曹'; talkText.textContent=row.text;
  talkEl.querySelector('.ctl span').textContent='演習 '+(tutorial.step+1)+'/'+op.tutorial.length+'　'+row.name;
}
function tutorialRender(){
  const active=tutorialActive(), row=active&&op.tutorial[tutorial.step];
  trainingEl.hidden=!active; tutorialTalk();
  if(tutorialArrow){dropArrow(tutorialArrow);tutorialArrow=null;} tutorialClearMarks();
  if(!row){ trainingEl.innerHTML=''; tutorialFrames.forEach(e=>e.hidden=true); return; }
  trainingEl.innerHTML='<div><i>TRAINING</i> 演習 '+(tutorial.step+1)+'/'+op.tutorial.length+' '+row.name+'</div><div class="training-ticks">'+op.tutorial.map((_,i)=>'<span class="'+(i<tutorial.step?'done':i===tutorial.step?'current':'')+'"></span>').join('')+'</div>';
  if(row.condition==='sight'){ const f=fleets.find(x=>x.name==='第14 北方防空 戦闘隊'); if(f) tutorialArrow=makeArrow(f.pos.clone().add(new THREE.Vector3(0,18,28)),f.pos.clone().add(new THREE.Vector3(0,18,0)),new THREE.Color(0xe2c58a)); }
  for(const spec of row.marks||[]){
    const mark=op.ground?{...spec,alt:groundHeight(...spec.pos)}:spec;
    const group=new THREE.Group(), color=0xffd27a;
    const ring=(inner,outer,opacity,y)=>{const m=new THREE.Mesh(new THREE.RingGeometry(inner,outer,op.ground?96:48,op.ground?26:1),new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false})); if(op.ground){
      m.geometry.rotateX(-Math.PI/2);const p=m.geometry.attributes.position;
      for(let i=0;i<p.count;i++)p.setY(i,groundSurfaceHeight(mark.pos[0]+p.getX(i),mark.pos[1]+p.getZ(i))+.18);
      m.geometry.computeBoundingSphere();m.renderOrder=5;
    }else {m.rotation.x=-Math.PI/2;m.position.y=y;}
    group.add(m);};
    ring(5.5,6.5,1,mark.alt); ring(0,5.5,.12,mark.alt);
    if(mark.alt&&!op.ground){ ring(1.5,2,.8,0); const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,mark.alt,0)]); const line=new THREE.Line(geo,new THREE.LineDashedMaterial({color,dashSize:2,gapSize:1,transparent:true,opacity:.8})); line.computeLineDistances(); group.add(line); }
    group.position.set(mark.pos[0],0,mark.pos[1]); scene.add(group);
    const label=document.createElement('div'); label.className='tutorial-mark-label'; label.textContent='目標 '+mark.label+(mark.alt&&!op.ground?'　高度 '+(mark.alt>0?'+':'')+mark.alt:''); document.getElementById('labels').appendChild(label);
    tutorialMarks.push({mark,group,label});
  }
}
function tutorialAdvance(){ if(!tutorialActive()||tutorial.step>=op.tutorial.length-1) return; tutorial.step++; tutorial.passed=null; if(op.groundDrill)groundDrillEnter(); tutorialRender(); }
function tutorialEvent(kind){ if(tutorialCondition()===kind) tutorialAdvance(); }
function tutorialOrder(o,targets){ if(tutorialCondition()==='attack'&&o.type==='attack'&&o.target.kind==='fleet'&&o.target.team===1) tutorial.attack=o.target; }
function tutorialGroupCreated(g){ if(tutorialCondition()==='group'&&g.members.size>=2) tutorial.group=g; }
function tutorialDamage(t,amt,src){ if(op.groundDrill&&amt>0)groundDrillEvent('hit',src,t); if(tutorialCondition()==='attack'&&amt>0&&t===tutorial.attack&&src&&src.team===0) tutorialAdvance(); }
function tutorialLaunch(f){ if(tutorialActive()&&f.team===0&&f.name==='第4 空母航空 打撃群'){ tutorial.launched=true; if(tutorialCondition()==='launch') tutorialAdvance(); } }
function tutorialTick(){
  if(!tutorialActive()) return;
  if(op.groundDrill){groundDrillTick();return;}
  const row=op.tutorial[tutorial.step], near=(f,m)=>f.alive&&Math.hypot(f.pos.x-m.pos[0],f.pos.z-m.pos[1])<=8&&Math.abs(f.pos.y-m.alt)<=6;
  const allies=fleets.filter(f=>f.team===0);
  if(row.condition==='move'||row.condition==='altitude'){if(allies.some(f=>near(f,row.marks[0]))) tutorialAdvance();}
  else if(row.condition==='queue'){
    if(!tutorial.passed){const f=allies.find(f=>near(f,row.marks[0])); if(f){tutorial.passed=f; const m=tutorialMarks[0]; if(m){m.group.children.forEach(o=>o.material.opacity*=.3); m.label.style.opacity='.3';}}}
    else if(near(tutorial.passed,row.marks[1])) tutorialAdvance();
  } else if(row.condition==='group'){const g=tutorial.group; if(g&&groups.includes(g)&&g.members.size>=2&&groupFlag(g)&&near(groupFlag(g),row.marks[0])) tutorialAdvance();}
  else if(row.condition==='sight'&&fleets.some(f=>f.name==='第14 北方防空 戦闘隊'&&f.everSeen)) tutorialAdvance();
  else if(row.condition==='launch'&&tutorial.launched) tutorialAdvance();
}
function tutorialFrame(){
  if(!tutorialActive()){ tutorialFrames.forEach(e=>e.hidden=true); return; }
  if(tutorialCondition()==='view'&&!camAnim){ const a=getAngles(); if(tutorial.angles&&(rotKeys.size||stick.az||stick.el||tutorial.dragging)){ const d=Math.abs(((a.az-tutorial.angles.az+540)%360)-180)+Math.abs(a.el-tutorial.angles.el); tutorial.rotation+=d; if(tutorial.rotation>=45) tutorialAdvance(); } tutorial.angles=a; }
  if(!talking) talkEl.hidden=over;
  const row=op.tutorial[tutorial.step], targets=row.targets.map(s=>document.querySelector(s));
  tutorialFrames.forEach((e,i)=>{ const t=targets[i], r=t&&t.getBoundingClientRect(); e.hidden=!r||!r.width||!r.height||over; if(!e.hidden) Object.assign(e.style,{left:(r.left-4)+'px',top:(r.top-4)+'px',width:(r.width+8)+'px',height:(r.height+8)+'px'}); });
  tutorialMarks.forEach(m=>{const p=proj(new THREE.Vector3(m.mark.pos[0],m.mark.alt,m.mark.pos[1])); m.label.style.visibility=p.z>1?'hidden':'visible'; m.label.style.left=p.x+'px'; m.label.style.top=(p.y-12)+'px';});
}
renderer.domElement.addEventListener('pointerdown',()=>{if(tutorial) tutorial.dragging=true;});
addEventListener('pointerup',()=>{if(tutorial) tutorial.dragging=false;});

