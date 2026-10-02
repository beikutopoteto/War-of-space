/* War of Space battle: game state, fleet specs, fleets and hangars, roster, reset.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- game state ---------- */
let fleets, fortress, gameSec, speed=1, over, selected, engaged, phaseName, events, fortressMarks, fid;
/* the operation being fought (data/operations.js) */
const OPS=WOS_DATA.operations;
/* opEvents: reinforcements and timed events of the operation, in order; convoy: the transports of an escort operation */
let op=OPS[0], opEvents=[], nextEvent=0, convoy=null;

function makeFleet(team,o){
  const f={...o,team,kind:'fleet',id:fid++,pos:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),post:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),
    heading:new THREE.Vector3(0,0,team?1:-1),ships:[],hpPool:o.n*o.hp,alive:true,order:null,arrow:null,fireTarget:null,retarget:Math.random()*.4,radius:0,seen:false,everSeen:false,revealT:0,lastPos:null,lostAt:-1e9,
    watchPos:o.watch?new THREE.Vector3(o.watch.pos[0],o.watch.alt||0,o.watch.pos[1]):null, stance:o.stance||'engage', queue:[]};
  /* ships stand in a loose disc; offsets are in the fleet's own frame (+Z ahead) and turn with its heading (loop.js).
     In a fleet that mixes carriers with other classes, the carriers keep to the rear */
  const types=shipClasses(o), nc=types.filter(t=>CARRIERS.has(t)).length, mixed=nc>0&&nc<o.n;
  const R=Math.sqrt(mixed?o.n-nc:o.n)*1.35*o.scale, Rc=Math.sqrt(nc)*1.35*o.scale;
  for(let i=0;i<o.n;i++){ const rear=mixed&&CARRIERS.has(types[i]), rr=rear?Rc:R, a=Math.random()*Math.PI*2, r=rr*Math.sqrt(Math.random());
    const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*2.4*o.scale,Math.sin(a)*r-(rear?R+Rc+2*o.scale:0));
    f.ships.push({off,pos:f.pos.clone().add(off),wob:Math.random()*6,type:types[i]});}
  f.hangars=makeHangars(o.hangar);
  f.launchR=f.hangars.reduce((m,h)=>Math.max(m,WING[h.type].launchR),0);
  f.launchMin=f.hangars.reduce((m,h)=>Math.min(m,WING[h.type].launchR),Infinity);
  f.carrierOnly=f.hangars.length>0&&nc===o.n;
  f.el=mkUnitLabel(team,o.name,'');
  return f;
}
/* the class of each ship, from comp ({class: count}) or type; shuffled so losses fall on every class */
function shipClasses(o){
  let list=[];
  if(o.comp){ const tot=Object.values(o.comp).reduce((a,b)=>a+b,0)||1;
    Object.entries(o.comp).forEach(([t,c])=>{ for(let i=0;i<Math.round(c*o.n/tot);i++) list.push(t); }); }
  while(list.length<o.n) list.push(o.type||(list[0]??'gen')); list.length=o.n;
  for(let i=list.length-1;i>0;i--){ const j=Math.random()*(i+1)|0; [list[i],list[j]]=[list[j],list[i]]; }
  return list.map(t=>SHAPES[t]?t:'gen');
}
/* carriers: craft sortie in squadrons. Each hangar fills up to maxOut squadrons, the rest waits aboard as reserve */
const WING=WOS_DATA.crafts;
/* ship classes that carry craft (a hangar in data/ships.js) */
const CARRIERS=new Set(WOS_DATA.ships.filter(c=>c.hangar).map(c=>c.id));
function makeHangars(hg){
  if(!hg) return [];
  return Object.entries(hg).filter(([t,c])=>WING[t]&&c>0).map(([type,cap])=>{
    const W=WING[type], squads=[]; let left=Math.round(cap);
    while(squads.length<W.maxOut&&left>0){ const n=Math.min(W.squad,left); squads.push({n,state:'docked',ready:0,wing:null}); left-=n; }
    return {type,reserve:left,squads,next:0,announced:false};
  });
}
function hangarText(f){
  return f.hangars.map(h=>{ const W=WING[h.type], out=h.squads.filter(q=>q.state==='out');
    const total=h.reserve+h.squads.reduce((s,q)=>s+(q.state==='out'?q.wing.n:q.n),0);
    return `${W.name}${total}　出撃${out.length}/${h.squads.length}隊　予備${h.reserve}`; }).join('　');
}
function altStr(y){ y=Math.round(y); return y===0?'±0':(y>0?'+':'−')+Math.abs(y); }
function subText(f){ return `${f.sub}　<span class="num">×${f.ships.length}　高度${altStr(f.pos.y)}</span>${f.hangars.length?`<br>${hangarText(f)}`:''}`; }

const rosterEl=document.getElementById('roster');
/* keep the briefing panel above the roster on narrow screens */
try{ new ResizeObserver(()=>document.documentElement.style.setProperty('--rh',rosterEl.offsetHeight+'px')).observe(rosterEl); }catch(e){}
/* roster: with an army group, its armies sit in a group section; drag a button between sections to take an army out or put it back */
function buildRoster(){
  rosterEl.innerHTML='';
  const mine=fleets.filter(f=>f.team===0&&!f.convoy);
  const mk=(f)=>{ const i=mine.indexOf(f);
    const b=document.createElement('button'); b.id='fl'+i; b.setAttribute('aria-pressed','false'); if(i<9) b.title=`${i+1}キーで選択`;
    b.innerHTML=`<span>${f.name}</span><span class="n"></span><span class="bar"><i></i></span>`;
    b.addEventListener('click',()=>{ if(b._dragged){ b._dragged=false; return; } select(f.alive&&(selected!==f||selGroupMode)?f:null); });
    if(armyGroup) dragSource(b,f);
    /* each row has a small 交戦/回避 switch for that fleet */
    const st=document.createElement('button'); st.className='st'; st.title='この艦隊の交戦/回避を切り替える';
    st.addEventListener('click',()=>{ if(f.alive) applyStance([f],f.stance==='evade'?'engage':'evade'); });
    const row=document.createElement('div'); row.className='frow'; row.append(b,st);
    f.btn=b; f.stBtn=st; return row; };
  if(!armyGroup){ mine.forEach(f=>rosterEl.appendChild(mk(f))); return; }
  const gz=document.createElement('div'); gz.className='rzone'; gz.dataset.zone='group';
  const gb=document.createElement('button'); gb.className='grpBtn'; gb.id='grpBtn';
  gb.textContent=`${armyGroup.name} 全軍`; gb.title='軍集団の全軍を選ぶ（Gキー）';
  gb.addEventListener('click',()=>selectGroup());
  /* the army group's own switches: speed sync, and 交戦/回避 for every army in it */
  const gs=document.createElement('button'); gs.className='st'; gs.id='rgSync'; gs.title='移動のとき、最も遅い艦に速度を合わせるか';
  gs.addEventListener('click',toggleSync);
  const gt=document.createElement('button'); gt.className='st'; gt.id='rgStance'; gt.title='軍集団の全軍の交戦/回避をまとめて切り替える';
  gt.addEventListener('click',()=>{ const m=groupAlive(); if(m.length) applyStance(m,m.every(f=>f.stance==='evade')?'engage':'evade',`${armyGroup.name} 全軍`); });
  const gf=document.createElement('button'); gf.className='st'; gf.id='rgForm'; gf.textContent='陣形'; gf.title='旗艦を中心に、決めておいた陣形に組み直す';
  gf.addEventListener('click',reform);
  const gh=document.createElement('div'); gh.className='ghead'; gh.append(gb,gs,gt,gf);
  gz.appendChild(gh);
  const fz=document.createElement('div'); fz.className='rzone'; fz.dataset.zone='free';
  fz.innerHTML='<div class="rhead">独立行動（ここへドラッグで外す）</div>';
  mine.forEach(f=>(armyGroup.members.has(f)?gz:fz).appendChild(mk(f)));
  rosterEl.append(gz,fz);
}
function dragSource(b,f){
  let st=null,ghost=null;
  b.addEventListener('pointerdown',e=>{ st={x:e.clientX,y:e.clientY,id:e.pointerId}; });
  b.addEventListener('pointermove',e=>{ if(!st||e.pointerId!==st.id) return;
    if(!ghost&&Math.hypot(e.clientX-st.x,e.clientY-st.y)>8){ b.setPointerCapture(e.pointerId); ghost=document.createElement('div'); ghost.className='dragGhost'; ghost.textContent=f.name; document.body.appendChild(ghost); b.classList.add('dragging'); }
    if(ghost){ ghost.style.transform=`translate(${e.clientX+10}px,${e.clientY+6}px)`; const z=zoneAt(e); rosterEl.querySelectorAll('.rzone').forEach(x=>x.classList.toggle('drop',x===z)); } });
  const end=e=>{ if(ghost){ const z=zoneAt(e); ghost.remove(); ghost=null; b._dragged=true; b.classList.remove('dragging');
      if(z&&f.alive){ const into=z.dataset.zone==='group'; if(into!==armyGroup.members.has(f)){ into?armyGroup.members.add(f):armyGroup.members.delete(f);
        if(into&&armyGroup.members.size>5){ armyGroup.members.delete(f); logEvent('軍集団は満員です','軍集団に入れられる軍は5個までです。'); }
        else logEvent(into?`${f.name} 軍集団に復帰`:`${f.name} 独立行動へ`, into?`${f.name}が${armyGroup.name}の指揮下に戻った。`:`${f.name}が${armyGroup.name}を離れ、単独で行動する。`);
        f.syncSpeed=null; if(selGroupMode) select(null); buildRoster(); updateRoster(); } } }
    st=null; rosterEl.querySelectorAll('.rzone').forEach(x=>x.classList.remove('drop')); };
  b.addEventListener('pointerup',end); b.addEventListener('pointercancel',end);
}
function zoneAt(e){ const el=document.elementFromPoint(e.clientX,e.clientY); return el&&el.closest?el.closest('.rzone'):null; }
function groupAlive(){ return armyGroup?[...armyGroup.members].filter(f=>f.alive):[]; }
/* the flagship: the one chosen at sortie while it is alive and in the group, otherwise the first army left in the group */
function groupFlag(){ if(!armyGroup) return null; const f=armyGroup.flag; return f&&f.alive&&armyGroup.members.has(f)?f:groupAlive()[0]||null; }
/* where an army stands in the formation, relative to the flagship */
function formationOffset(f){ const fl=groupFlag(), a=armyGroup.off.get(f), b=fl&&armyGroup.off.get(fl);
  return a&&b?a.clone().sub(b):fl?f.pos.clone().sub(fl.pos):new THREE.Vector3(); }
/* gather the army group into its formation around the flagship, where the flagship is now */
function reform(){ const fl=groupFlag(); if(!fl) return;
  dropArrow(fl.arrow); fl.arrow=null; fl.order=null; fl.queue=[];
  groupAlive().forEach(f=>{ if(f===fl) return; f.queue=[]; f.syncSpeed=null; order(f,{type:'move',dest:fl.pos.clone().add(formationOffset(f))}); });
  logEvent(`${armyGroup.name} 陣形`,`旗艦の${fl.name}を中心に、決めておいた陣形に組み直す。`); }
function selectGroup(){ const m=groupAlive(); if(!m.length) return; if(selGroupMode){ select(null); return; } select(groupFlag()||m[0]); selGroupMode=true;
  fleets.forEach(x=>x.el.classList.toggle('sel',m.includes(x))); updateRoster(); }
/* the fleets an order goes to: the whole army group, or just the selected army */
function orderTargets(){ return selGroupMode?groupAlive():(selected&&selected.alive?[selected]:[]); }
/* o.queue (Shift) adds the order after the ones already given: a point joins the route of the last move (current or queued),
   anything after an attack waits in f.queue until that attack is over. Without Shift the queue is cleared.
   Several fleets keep their formation around a point */
/* undo: every order given from the HUD first saves what the fleets it touches were doing; 戻す (Ctrl+Z / Backspace) restores the last one */
const UNDO_MAX=30; let undoStack=[];
function copyOrder(o){
  if(!o) return null;
  if(o.type!=='move') return {type:o.type,target:o.target};
  const left=o.path?pathLeft(o):[...(o.via||[]),o.dest], pts=left.length?left:[o.dest];   // the points still ahead
  return {type:'move',via:pts.slice(0,-1).map(v=>v.clone()),dest:pts[pts.length-1].clone()};
}
function saveUndo(t){
  undoStack.push(t.map(f=>({f,order:copyOrder(f.order),queue:f.queue.map(copyOrder),strike:f.strike,sync:f.syncSpeed})));
  if(undoStack.length>UNDO_MAX) undoStack.shift(); updateUndo();
}
function undo(){
  const u=undoStack.pop(); updateUndo(); if(!u||over) return;
  for(const s of u){ const f=s.f; if(!f.alive) continue;
    const o=s.order&&(s.order.type!=='attack'||s.order.target.alive)?s.order:null;
    if(o) order(f,o); else { f.order=null; dropArrow(f.arrow); f.arrow=null; }
    f.queue=s.queue.filter(q=>q&&(q.type!=='attack'||q.target.alive)); f.strike=s.strike; f.syncSpeed=s.sync; }
  updateRoster(); logEvent('指示を取り消し',`${u.filter(s=>s.f.alive).map(s=>s.f.name).join('・')}の一つ前の指示を取り消した。`);
}
function updateUndo(){ const b=document.getElementById('undoBtn'); if(b) b.disabled=!undoStack.length; }
function groupOrder(o){
  const t=orderTargets(); if(!t.length) return;
  saveUndo(t);
  const sync=selGroupMode&&armyGroup.sync?Math.min(...t.map(f=>f.speed)):null;
  if(!o.queue) t.forEach(f=>f.queue=[]);
  const tail=f=>o.queue?(f.queue.length?f.queue[f.queue.length-1]:f.order):null;
  if(o.type==='move'){
    /* the whole army group: the flagship goes to the point and the others take their places in the formation around it */
    const formation=selGroupMode&&armyGroup&&groupFlag();
    const base=f=>{ const x=tail(f); if(!x) return f.pos; if(x.type==='move'){ const l=pathLeft(x); return l[l.length-1]; } return x.target.pos; };
    const c=new THREE.Vector3(); t.forEach(f=>c.add(base(f))); c.divideScalar(t.length);
    t.forEach(f=>{ const x=tail(f), dest=o.dest.clone().add(formation?formationOffset(f):base(f).clone().sub(c)); f.syncSpeed=sync;
      if(x&&x.type==='move'&&x===f.order) order(f,{type:'move',via:pathLeft(x).slice(-(MAX_WAYPOINTS-1)),dest});
      else if(x&&x.type==='move'){ x.via=pathLeft(x).slice(-(MAX_WAYPOINTS-1)); x.dest=dest; }
      else if(x) f.queue.push({type:'move',dest});
      else order(f,{type:'move',dest}); });
  } else t.forEach(f=>{ f.syncSpeed=sync; if(tail(f)) f.queue.push({type:o.type,target:o.target}); else order(f,o); });
}
function updateRoster(){
  fleets.forEach(f=>{ if(!f.btn) return;
    f.btn.querySelector('.n').textContent=(f.queue.length?`予約${f.queue.length} `:'')+'×'+f.ships.length;
    f.btn.querySelector('span').textContent=(armyGroup&&f===groupFlag()?'★ ':'')+f.name; f.btn.classList.toggle('evade',f.stance==='evade');
    f.btn.querySelector('.bar i').style.width=(100*f.ships.length/f.n)+'%';
    f.btn.disabled=!f.alive; f.btn.setAttribute('aria-pressed',String(selGroupMode?armyGroup.members.has(f):selected===f));
    if(f.stBtn){ f.stBtn.textContent=f.stance==='evade'?'回避':'交戦'; f.stBtn.dataset.st=f.stance; f.stBtn.disabled=!f.alive; }
  });
  const gb=document.getElementById('grpBtn'); if(gb){ gb.setAttribute('aria-pressed',String(selGroupMode)); gb.disabled=!groupAlive().length; }
  const gs=document.getElementById('rgSync'); if(gs){ gs.textContent=armyGroup.sync?'速度同期':'速度個別'; gs.setAttribute('aria-pressed',String(armyGroup.sync)); }
  const gt=document.getElementById('rgStance'); if(gt){ const m=groupAlive(), ev=m.filter(f=>f.stance==='evade').length;
    gt.textContent='全軍'+(!m.length?'—':ev===m.length?'回避':ev?'混在':'交戦'); gt.dataset.st=ev===m.length&&m.length?'evade':ev?'mixed':'engage'; gt.disabled=!m.length; }
  syncStance();
}

let lastCfg=null, armyGroup=null, selGroupMode=false;
function reset(cfg=lastCfg){
  lastCfg=cfg; undoStack=[]; updateUndo();
  if(fleets) fleets.forEach(f=>{f.el.remove();dropArrow(f.arrow);});
  if(fortress&&fortress.el) fortress.el.remove();
  [...arrows].forEach(dropArrow); wings=[];
  document.getElementById('alt').hidden=true;
  fid=1; gameSec=0; over=false; selected=null; engaged=new Map(); nextEvent=0; fortressMarks=new Set(); events=[];
  op=OPS.find(o=>o.id===(cfg&&cfg.op))||OPS[0];
  enemyWASSeen=false;
  opEvents=[...(op.reinforcements||[]),...(op.events||[])].sort((a,b)=>a.after-b.after);
  const spec=cfg&&cfg.fleets&&cfg.fleets.length?cfg.fleets:op.quick;
  fleets=[...spec.map(o=>makeFleet(0,o)),...op.enemies.map(o=>makeFleet(1,o))];
  selGroupMode=false;
  /* the army group: the one chosen at sortie, or for an operation fought with its own fleets, op.group around all of them */
  const G=cfg&&cfg.group||(op.group&&spec===op.quick?{...op.group,members:op.quick.map((_,i)=>i)}:null);
  armyGroup=G?{name:G.name,sync:G.sync,members:new Set(G.members.map(i=>fleets[i])),flag:fleets[G.flag??G.members[0]],off:new Map()}:null;
  /* each army's place in the formation, relative to the flagship (from the cube at sortie, or from where the armies start) */
  if(armyGroup) G.members.forEach((i,k)=>{ const o=G.offsets&&G.offsets[k];
    armyGroup.off.set(fleets[i],o?new THREE.Vector3(o[0],o[1],o[2]):fleets[i].pos.clone().sub(armyGroup.flag.pos)); });
  /* the transports of an escort operation: own side, but they follow their own route and take no orders */
  convoy=null;
  if(op.convoy){ convoy=makeFleet(0,{dmg:0,range:0,eva:0,...op.convoy.fleet}); convoy.convoy=true; convoy.departed=false; convoy.escaped=false; convoy.sub='乗船中'; fleets.push(convoy); }
  /* the object in the middle of the field: the fortress (a target), or a relay station (scenery) */
  const F=op.fortress;
  fortress=F?{kind:'fortress',team:1,id:0,name:F.name,pos:new THREE.Vector3(0,3,0),hpPool:F.hp,max:F.hp,dps:F.dps,range:F.range,radius:F.radius,alive:true,retarget:0,fireTarget:null,vis:F.vis,seen:true,everSeen:true,revealT:0}
    :{kind:'fortress',team:1,id:0,name:'',pos:new THREE.Vector3(0,3,0),alive:false,el:null};
  if(F){ fortress.el=mkUnitLabel(1,fortress.name,''); fortress.el.classList.add('fort'); fortress.el.querySelector('.emb').style.cssText='width:32px;height:32px'; }
  fortressObj.visible=!!F; zoneLines.visible=!!F; gridMat.uniforms.uZone.value=F?1:0;
  stationObj.visible=op.center==='station';
  exitObj.visible=!!op.exit; if(op.exit) exitObj.position.set(op.exit.pos[0],(op.exit.alt||0)+.2,op.exit.pos[1]);
  setPhase(op.phase||'布陣');
  document.getElementById('result').hidden=true;
  document.getElementById('log').innerHTML='';
  showBrief('作戦概要',op.name,op.brief); flashBrief(8000);
  buildSectors(op.sectors);
  fogTimer=0; updateFog();
  buildRoster(); updateRoster(); if(typeof updateGoal==='function') updateGoal();
}
