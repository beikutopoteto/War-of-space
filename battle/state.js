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
    watchPos:o.watch?new THREE.Vector3(o.watch.pos[0],o.watch.alt||0,o.watch.pos[1]):null, stance:o.stance||'engage'};
  const R=Math.sqrt(o.n)*1.35*o.scale;
  const types=shipClasses(o);
  for(let i=0;i<o.n;i++){const a=Math.random()*Math.PI*2,r=R*Math.sqrt(Math.random());
    const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*2.4*o.scale,Math.sin(a)*r);
    f.ships.push({off,pos:f.pos.clone().add(off),wob:Math.random()*6,type:types[i]});}
  f.hangars=makeHangars(o.hangar);
  f.launchR=f.hangars.reduce((m,h)=>Math.max(m,WING[h.type].launchR),0);
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
  /* an escort operation lists the convoy first: its state at a glance, and a click brings the camera to it */
  if(convoy){ const c=document.createElement('button'); c.className='convoyRow'; c.id='convoyRow'; c.title='クリックで船団へ視点を移す';
    c.innerHTML='<span></span><span class="n"></span><span class="bar"><i></i></span>';
    c.addEventListener('click',()=>{ if(convoy.alive) flyTo(convoy.pos,camera.position.clone().sub(controls.target),Math.min(camera.position.distanceTo(controls.target),120)); });
    rosterEl.appendChild(c); }
  const mk=(f)=>{ const i=mine.indexOf(f);
    const b=document.createElement('button'); b.id='fl'+i; b.setAttribute('aria-pressed','false'); if(i<9) b.title=`${i+1}キーで選択`;
    b.innerHTML=`<span>${f.name}</span><span class="n"></span><span class="bar"><i></i></span>`;
    b.addEventListener('click',()=>{ if(b._dragged){ b._dragged=false; return; } select(f.alive&&(selected!==f||selGroupMode)?f:null); });
    if(armyGroup) dragSource(b,f);
    f.btn=b; return b; };
  if(!armyGroup){ mine.forEach(f=>rosterEl.appendChild(mk(f))); return; }
  const gz=document.createElement('div'); gz.className='rzone'; gz.dataset.zone='group';
  const gb=document.createElement('button'); gb.className='grpBtn'; gb.id='grpBtn';
  gb.textContent=`${armyGroup.name} 全軍`; gb.title=(armyGroup.sync?'最も遅い艦に速度を合わせて移動':'各軍の速度で移動')+'（Gキー）';
  gb.addEventListener('click',()=>selectGroup());
  gz.appendChild(gb);
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
function selectGroup(){ const m=groupAlive(); if(!m.length) return; if(selGroupMode){ select(null); return; } select(m[0]); selGroupMode=true;
  fleets.forEach(x=>x.el.classList.toggle('sel',m.includes(x))); updateRoster(); }
/* the fleets an order goes to: the whole army group, or just the selected army */
function orderTargets(){ return selGroupMode?groupAlive():(selected&&selected.alive?[selected]:[]); }
function groupOrder(o){
  const t=orderTargets(); if(!t.length) return;
  const sync=selGroupMode&&armyGroup.sync?Math.min(...t.map(f=>f.speed)):null;
  if(o.type==='move'){
    /* o.queue (Shift): the point is added after the waypoints still ahead. Several fleets keep their formation around the point */
    const queued=f=>o.queue&&f.order&&f.order.type==='move'?pathLeft(f.order):[];
    const base=f=>{ const q=queued(f); return q.length?q[q.length-1]:f.pos; };
    const c=new THREE.Vector3(); t.forEach(f=>c.add(base(f))); c.divideScalar(t.length);
    t.forEach(f=>{ const via=queued(f).slice(-(MAX_WAYPOINTS-1)), dest=o.dest.clone().add(base(f).clone().sub(c));
      f.syncSpeed=sync; order(f,{type:'move',via,dest}); });
  } else t.forEach(f=>{ f.syncSpeed=sync; order(f,o); });
}
function updateRoster(){
  const cr=document.getElementById('convoyRow');
  if(cr&&convoy){ const left=convoy.escaped?convoy.ships.length:convoy.alive?convoy.ships.length:0;
    cr.querySelector('span').textContent=`${convoy.name}　${convoy.escaped?'離脱':convoy.alive?convoy.sub:'全滅'}`;
    cr.querySelector('.n').textContent=`${left}/${convoy.n}隻`; cr.querySelector('.bar i').style.width=(100*left/convoy.n)+'%'; }
  fleets.forEach(f=>{ if(!f.btn) return;
    f.btn.querySelector('.n').textContent=(f.stance==='evade'?'回避 ':'')+'×'+f.ships.length; f.btn.classList.toggle('evade',f.stance==='evade');
    f.btn.querySelector('.bar i').style.width=(100*f.ships.length/f.n)+'%';
    f.btn.disabled=!f.alive; f.btn.setAttribute('aria-pressed',String(selGroupMode?armyGroup.members.has(f):selected===f));
  });
  const gb=document.getElementById('grpBtn'); if(gb){ gb.setAttribute('aria-pressed',String(selGroupMode)); gb.disabled=!groupAlive().length; }
  syncStance();
}

let lastCfg=null, armyGroup=null, selGroupMode=false;
function reset(cfg=lastCfg){
  lastCfg=cfg;
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
  armyGroup=cfg&&cfg.group?{name:cfg.group.name,sync:cfg.group.sync,members:new Set(cfg.group.members.map(i=>fleets[i]))}:null;
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
  buildRoster(); updateRoster();
}
