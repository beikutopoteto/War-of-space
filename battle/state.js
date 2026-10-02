/* War of Space battle: game state, fleet specs, fleets and hangars, roster, reset.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- game state ---------- */
let fleets, fortress, gameSec, speed=1, over, selected, engaged, phaseName, events, reinforced, fortressMarks, fid;
const PLAYER_SPEC=[
  {name:'第1突撃艇隊',sub:'高速・軽装',n:24,hp:10,dmg:1.25,range:15,speed:10,scale:.75,pos:[-24,112],alt:-8,vis:8,stl:7},
  {name:'第2戦隊',sub:'主力巡洋艦',n:10,hp:42,dmg:4.2,range:22,speed:5.5,scale:1.5,pos:[12,118],alt:6,vis:6,stl:4},
  {name:'第3戦隊',sub:'主力巡洋艦',n:10,hp:42,dmg:4.2,range:22,speed:5.5,scale:1.5,pos:[100,64],alt:24,vis:6,stl:4},
  {name:'第7機動部隊',sub:'戦闘母艦',n:3,hp:70,dmg:1.6,range:14,speed:5,scale:1.6,pos:[-108,46],alt:-26,vis:7,stl:3,hangar:{ftr:120}},
];
const ENEMY_SPEC=[
  {name:'防空第1隊',sub:'北宙域守備',n:16,hp:12,dmg:1.3,range:16,speed:7,scale:.8,pos:[0,-52],alt:18,ai:'guard',leash:42,vis:5,stl:5},
  {name:'防空第2隊',sub:'南宙域守備',n:16,hp:12,dmg:1.3,range:16,speed:7,scale:.8,pos:[0,52],alt:-14,ai:'guard',leash:42,vis:5,stl:5},
  {name:'防空第3隊',sub:'東宙域守備',n:16,hp:12,dmg:1.3,range:16,speed:7,scale:.8,pos:[54,0],alt:4,ai:'guard',leash:42,vis:5,stl:5},
  {name:'防空第4隊',sub:'西宙域守備',n:16,hp:12,dmg:1.3,range:16,speed:7,scale:.8,pos:[-54,0],alt:22,ai:'guard',leash:42,vis:5,stl:5},
  {name:'近衛艦隊',sub:'要塞直掩',n:12,hp:36,dmg:3.4,range:20,speed:5,scale:1.4,pos:[-8,-22],alt:-6,ai:'guard',leash:30,vis:6,stl:3},
];

function makeFleet(team,o){
  const f={...o,team,kind:'fleet',id:fid++,pos:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),post:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),
    heading:new THREE.Vector3(0,0,team?1:-1),ships:[],hpPool:o.n*o.hp,alive:true,order:null,arrow:null,fireTarget:null,retarget:Math.random()*.4,radius:0,seen:false,everSeen:false,revealT:0,lastPos:null,lostAt:-1e9};
  const R=Math.sqrt(o.n)*1.35*o.scale;
  for(let i=0;i<o.n;i++){const a=Math.random()*Math.PI*2,r=R*Math.sqrt(Math.random());
    const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*2.4*o.scale,Math.sin(a)*r);
    f.ships.push({off,pos:f.pos.clone().add(off),wob:Math.random()*6});}
  f.hangars=makeHangars(o.hangar);
  f.launchR=f.hangars.reduce((m,h)=>Math.max(m,WING[h.type].launchR),0);
  f.el=mkUnitLabel(team,o.name,'');
  return f;
}
/* carriers: craft sortie in squadrons. Each hangar fills up to maxOut squadrons, the rest waits aboard as reserve */
const WING={
  ftr:{name:'艦載機',squad:30,maxOut:3,launchR:52,range:9,speed:17,hp:5,eva:.45,dmg:.3,fuel:24,rearm:8,cd:3,vis:5,stl:7},
  was:{name:'W.A.S.',squad:20,maxOut:3,launchR:30,range:5,speed:10,hp:10,eva:.25,dmg:.65,fuel:16,rearm:10,cd:4,vis:4,stl:6},
};
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
  const mine=fleets.filter(f=>f.team===0);
  const mk=(f)=>{ const i=mine.indexOf(f);
    const b=document.createElement('button'); b.id='fl'+i; b.setAttribute('aria-pressed','false');
    b.innerHTML=`<span>${f.name}</span><span class="n"></span><span class="bar"><i></i></span>`;
    b.addEventListener('click',()=>{ if(b._dragged){ b._dragged=false; return; } select(f.alive&&(selected!==f||selGroupMode)?f:null); });
    if(armyGroup) dragSource(b,f);
    f.btn=b; return b; };
  if(!armyGroup){ mine.forEach(f=>rosterEl.appendChild(mk(f))); return; }
  const gz=document.createElement('div'); gz.className='rzone'; gz.dataset.zone='group';
  const gb=document.createElement('button'); gb.className='grpBtn'; gb.id='grpBtn';
  gb.textContent=`${armyGroup.name} 全軍`; gb.title=armyGroup.sync?'最も遅い艦に速度を合わせて移動':'各軍の速度で移動';
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
  if(o.type==='move'&&t.length>1){
    const c=new THREE.Vector3(); t.forEach(f=>c.add(f.pos)); c.divideScalar(t.length);
    t.forEach(f=>{ f.syncSpeed=sync; order(f,{type:'move',dest:o.dest.clone().add(f.pos.clone().sub(c))}); });
  } else t.forEach(f=>{ f.syncSpeed=sync; order(f,o); });
}
function updateRoster(){
  fleets.forEach(f=>{ if(!f.btn) return;
    f.btn.querySelector('.n').textContent='×'+f.ships.length;
    f.btn.querySelector('.bar i').style.width=(100*f.ships.length/f.n)+'%';
    f.btn.disabled=!f.alive; f.btn.setAttribute('aria-pressed',String(selGroupMode?armyGroup.members.has(f):selected===f));
  });
  const gb=document.getElementById('grpBtn'); if(gb){ gb.setAttribute('aria-pressed',String(selGroupMode)); gb.disabled=!groupAlive().length; }
}

let lastCfg=null, armyGroup=null, selGroupMode=false;
function reset(cfg=lastCfg){
  lastCfg=cfg;
  if(fleets) fleets.forEach(f=>{f.el.remove();dropArrow(f.arrow);});
  if(fortress) fortress.el.remove();
  [...arrows].forEach(dropArrow); wings=[];
  document.getElementById('alt').hidden=true;
  fid=1; gameSec=0; over=false; selected=null; engaged=new Map(); reinforced=false; fortressMarks=new Set(); events=[];
  const spec=cfg&&cfg.fleets&&cfg.fleets.length?cfg.fleets:PLAYER_SPEC;
  fleets=[...spec.map(o=>makeFleet(0,o)),...ENEMY_SPEC.map(o=>makeFleet(1,o))];
  selGroupMode=false;
  armyGroup=cfg&&cfg.group?{name:cfg.group.name,sync:cfg.group.sync,members:new Set(cfg.group.members.map(i=>fleets[i]))}:null;
  fortress={kind:'fortress',team:1,id:0,name:'要塞カリュブディス',pos:new THREE.Vector3(0,3,0),hpPool:3200,max:3200,dps:18,range:46,radius:11,alive:true,retarget:0,fireTarget:null,vis:8,seen:true,everSeen:true,revealT:0};
  fortress.el=mkUnitLabel(1,fortress.name,''); fortress.el.classList.add('fort'); fortress.el.querySelector('.emb').style.cssText='width:32px;height:32px';
  setPhase('布陣');
  document.getElementById('result').hidden=true;
  document.getElementById('log').innerHTML='';
  showBrief('作戦概要','要塞カリュブディス攻略戦','二つの小惑星を接合した敵要塞。周囲の防空圏は東西南北の4隊と近衛艦隊が守る。艦隊を分けて防空隊を各個撃破し、要塞の装甲を0にすれば勝利。敵艦隊は味方の視界に入るまで見えない。'); flashBrief(8000);
  fogTimer=0; updateFog();
  buildRoster(); updateRoster();
}
