/* War of Space battle: game state, fleet specs, fleets and hangars, roster, reset.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- game state ---------- */
let fleets, fortress, gameSec, speed=1, over, selected, engaged, phaseName, events, fortressMarks, fid;
/* the operation being fought (data/operations.js) */
const OPS=WOS_DATA.operations;
/* opEvents: reinforcements and timed events of the operation, in order; convoy: the transports of an escort operation */
let op=OPS[0], opEvents=[], nextEvent=0, convoy=null;
/* the field: its centre (fieldC) and radius. It stays at the origin, or moves with the convoy (op.field:'convoy').
   op.fieldR (第5節, 2026-10-16: one field over the whole base) makes it larger; REACH is how far from the centre a move order may be clicked (op.reach) */
let FIELD_R=215, REACH=200; const fieldC=new THREE.Vector3();
let fieldMoves=false;
/* clouds: plasma clouds {c, r, mat}; lastSpot: where the enemy last saw one of ours {pos, t};
   rescue: the optional distress call (op.rescue) {ship, prog, done, lost}; rescued: it was answered */
let clouds=[], lastSpot=null, spotNow=false, spotLogT=-1e9, rescue=null, rescued=false;
/* a defence operation (op.win.type 'defend'): evac is how far the evacuation has got (operation minutes, need: op.win.need),
   evacRate how fast it goes now (the station's damage slows it), evacShips how many background ships have left */
let evac=0, evacRate=1, evacShips=0;
/* chase: after the fortress falls, its guard runs for the exit (op.chase) {fleet, exit, from, escaped}; perfect: the battle ended in a complete victory */
let chase=null, perfect=false;
/* 第4節 (op.body / op.civil / op.debris / op.carrier):
   blocks: the habitat blocks of the body {name, pos, radius, alive, seen, ships}; only raiders shoot them (sim.js)
   casualties: civilians lost in the blocks (op.civil.cap loses the operation); civMarks: the warnings already given
   debris: the mining debris clouds {c (centre, Vector3), r}; opCarrier: the carrier given for this operation (op.carrier.fleet), state in opCarrier.cs
   {landed, landMin, board (minutes boarded), done, exit}; loseWhy: why the battle was lost ('carrier', 'civil', 'garrison', 'time', or null) */
/* the hit points multiplier (user decision 2026-10-13: both sides twice as hard): WOS_DATA.balance.hp, set in reset(), the same in every
   operation (user decision 2026-10-20: no multiplier per operation). Every fleet, craft, fortress and station gets it when the battle is built;
   the data and the fleet editor keep the base values */
let HP_K=1;
/* timeWarned: the time-up warning was said (sim.js stepTimeUp); gunLostSaid: the first lost gun on the base was told (第5節) */
let timeWarned=false, gunLostSaid=false;
let blocks=[], casualties=0, civMarks=new Set(), civFirst=false, debris=[], opCarrier=null, loseWhy=null, shieldSaid=false;
/* unit names 第N 役割 規模 (data/ships.js unitNames; user decision 2026-10-04). level: 'group' | 'army' | 'bg'.
   N starts at the main class's number and moves on past the numbers in used (a Set); with no class, there is no role */
const UNAMES=WOS_DATA.unitNames, ULEVEL={group:0, army:1, bg:2};
const unitNo=name=>+((/^第(\d+)/.exec(name||'')||[])[1]||0);
function unitName(level,type,used,side='earth'){ const T=UNAMES[side], row=T[type]; let [n,role]=row?row[ULEVEL[level]]:[1,''];
  while(used.has(n)) n++; return `第${n} ${role?role+' ':''}${T.word[level]}`; }
/* the main class of a unit ({class: count}): the highest class in it, whatever the numbers (user decision 2026-10-04:
   one cruiser among four destroyers names the unit after the cruiser). NAME_RANK runs from the lowest up */
const NAME_RANK=['cv','ff','dd','mas','cl','bb','cvb','masc'];
function mainType(by){ let best=null; Object.keys(by).forEach(t=>{ if(by[t]>0&&(!best||NAME_RANK.indexOf(t)>NAME_RANK.indexOf(best))) best=t; }); return best; }

/* a point [x, z] given relative to the field centre */
function relPos(p){ return [fieldC.x+p[0],fieldC.z+p[1]]; }

const AA=window.WOS_DATA.aa;
/* the two sides' tech (user decision 2026-10-20, data/ships.js WOS_DATA.sides): a fighting fleet with no hp in the data takes its values
   from its side's class tables at the operation's stage (op.stage), by the same formulas as the player's own fleets (prep.js armyToFleet).
   A mixed fleet averages its classes by numbers and goes at its slowest class's speed. A class the Republic has no table for (the battleship)
   is a captured Earth ship, at the Earth's rate; side:'earth' puts a whole enemy fleet on the Earth's tables.
   The speed is the table's final form whatever the stage (user decision 2026-10-20: the ships keep about their old speeds) */
const SIDES=WOS_DATA.sides, CLASS_MAX=Object.fromEntries(WOS_DATA.ships.map(s=>[s.id,s]));
const techRate=(side,p)=>SIDES[side].base+(1-SIDES[side].base)*p;
function techFleet(team,o){
  const side=o.side||(team===1?'mars':'earth'), p=op&&op.stage||0, by=o.comp||{[o.type]:1};
  const tot=Object.values(by).reduce((a,b)=>a+b,0)||1, st={atk:0,def:0,eva:0,rng:0,spd:99};
  Object.entries(by).forEach(([t,c])=>{ const M=side==='mars'&&SIDES.mars.ships[t], s=M||CLASS_MAX[t], r=techRate(M?'mars':'earth',p);
    ['atk','def','eva','rng'].forEach(k=>st[k]+=s[k]*r*c/tot); st.spd=Math.min(st.spd,s.spd); });
  /* the Advanced Equipment Development Bureau's fleets (ace): k times the stage's values, their W.A.S. hitting wasDmg times as hard,
     their ships' hit points hp times (2026-10-23, user decision: harder hulls only) */
  const A=o.ace&&SIDES.mars.ace, k=A?A.ship:1, r=techRate(side,p), craft={};
  /* the W.A.S. a Republic assault ship carries are the class's own (2026-10-21, user decision): a fleet with no hangar in the data loads its count of them */
  let hangar=o.hangar;
  if(!hangar&&side==='mars'){ const w=Object.entries(by).reduce((s,[t,c])=>s+(SIDES.mars.ships[t]&&SIDES.mars.ships[t].was||0)*(o.comp?c:o.n),0); if(w) hangar={was:w}; }
  Object.keys(hangar||{}).forEach(c=>{ const W=WING[c], F={...W,...(side==='mars'&&SIDES.mars.crafts[c]||{})};
    craft[c]={hp:F.hp/W.hp*r*k, dmg:F.dmg/W.dmg*r*(A&&c==='was'?A.wasDmg:k), eva:F.eva/W.eva*r*k, ...(A?{speed:k, range:k}:{})}; });
  return {hp:(6+st.def*5)*(A&&A.hp||k), dmg:(.4+st.atk*.45)*k, eva:Math.min(.4,st.eva*.04)*k, range:(10+st.rng*1.6)*k, speed:(2+st.spd)*k, craft, ...(hangar?{hangar}:{})};
}
/* every warship of both sides goes a little faster (user decision 2026-10-20: WOS_DATA.balance.speed); not the civilian ships nor the guns */
const SPEED_K=WOS_DATA.balance&&WOS_DATA.balance.speed||1;
function makeFleet(team,o){
  if(o.hp==null) o={...o,...techFleet(team,o)};
  if(o.hurt) o={...o,hp:o.hp*o.hurt};   // 第6節 (2026-10-24): an allied unit still hurt from the last battle, every ship at that share of its hit points
  if(o.speed&&o.type!=='tr'&&!o.fixed) o={...o,speed:o.speed*SPEED_K};
  /* march: the way the fleet last moved, level; a formation regrouping around this flagship faces it (reform) */
  const f={...o,team,kind:'fleet',id:fid++,march:new THREE.Vector3(0,0,team?1:-1),pos:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),post:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),home:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),
    heading:new THREE.Vector3(0,0,team?1:-1),ships:[],hp:o.hp*HP_K,hpPool:o.n*o.hp*HP_K,alive:true,order:null,arrow:null,fireTarget:null,retarget:Math.random()*.4,radius:0,seen:false,everSeen:false,revealT:0,lastPos:null,lostAt:-1e9,
    watchPos:o.watch?new THREE.Vector3(o.watch.pos[0],o.watch.alt||0,o.watch.pos[1]):null, stance:o.stance||'engage', queue:[]};
  if(o.postAt) f.post.set(o.postAt[0],o.postAlt??o.alt??0,o.postAt[1]);   // a guard that comes in and holds a post away from where it appears (第5節; postAlt its height)
  /* ships stand in a loose disc; offsets are in the fleet's own frame (+Z ahead) and turn with its heading (loop.js).
     In a fleet that mixes carriers with other classes, the carriers keep to the rear */
  const types=shipClasses(o), nc=types.filter(t=>CARRIERS.has(t)).length, mixed=nc>0&&nc<o.n;
  const R=Math.sqrt(mixed?o.n-nc:o.n)*1.35*o.scale, Rc=Math.sqrt(nc)*1.35*o.scale;
  for(let i=0;i<o.n;i++){ const rear=mixed&&CARRIERS.has(types[i]), rr=rear?Rc:R, a=Math.random()*Math.PI*2, r=rr*Math.sqrt(Math.random());
    const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*2.4*o.scale,Math.sin(a)*r-(rear?R+Rc+2*o.scale:0));
    f.ships.push({off,pos:f.pos.clone().add(off),wob:Math.random()*6,type:types[i]});}
  f.hangars=makeHangars(o.hangar,0,o.craft);
  f.launchR=f.hangars.reduce((m,h)=>Math.max(m,h.launchR),0);
  f.launchMin=f.hangars.reduce((m,h)=>Math.min(m,h.launchR),Infinity);
  f.carrierOnly=f.hangars.length>0&&nc===o.n;
  f.el=mkUnitLabel(o.ally?2:team,o.name,'');
  /* a gun on the base (第5節, pit): a small square with a dot, the turret seen from above (user decision 2026-10-18: 見本 B); its name only when selected.
     The enemy's guns on the rock (第4節・第6節, type aa) are marked the same, in their colour (user decision 2026-10-23) */
  if(o.pit||o.fixed&&o.type==='aa'){ f.el.classList.add('gun'); f.el.querySelector('.emb').innerHTML='<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="7" r="1.8" fill="currentColor"/></svg>'; }
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
/* carriers: craft sortie in squadrons. Each hangar fills up to maxOut squadrons, the rest waits aboard as reserve.
   craft: the research of the player's own fleets (prep.js): out squadrons at once, turn = speed of rearming and launching */
const WING=WOS_DATA.crafts;
/* ship classes that carry craft (a hangar in data/ships.js) */
const CARRIERS=new Set(WOS_DATA.ships.filter(c=>c.hangar).map(c=>c.id));
/* launchR: the launch distance, if not the craft's own (a fortress reaches further) */
function makeHangars(hg,launchR,craft){
  if(!hg) return [];
  return Object.entries(hg).filter(([t,c])=>WING[t]&&c>0).map(([type,cap])=>{
    const W=WING[type], C=craft&&craft[type]||{}, out=C.out||W.maxOut, squads=[]; let left=Math.round(cap);
    while(squads.length<out&&left>0){ const n=Math.min(W.squad,left); squads.push({n,state:'docked',ready:0,wing:null}); left-=n; }
    return {type,reserve:left,squads,next:0,announced:false,launchR:launchR||W.launchR,out,slow:1/(C.turn||1)};
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
/* roster: a ＋ button to form an army group from the selected fleets, a section per army group, then the fleets acting alone.
   Drag a button between sections to move an army into another group or take it out */
const GROUP_MAX=5;
function buildRoster(){
  rosterEl.innerHTML='';
  const mine=fleets.filter(f=>f.team===0&&!f.ward);
  const mk=(f)=>{ const i=mine.indexOf(f);
    const b=document.createElement('button'); b.id='fl'+i; b.setAttribute('aria-pressed','false'); b.title=(i<9?`${i+1}キーで選択。`:'')+'Shift+クリックでまとめて選ぶ';
    b.innerHTML=`<span>${f.name}</span><span class="n"></span><span class="bar"><i></i></span>`;
    b.addEventListener('click',e=>{ if(b._dragged){ b._dragged=false; return; } if(!f.alive) return;
      if(e.shiftKey) toggleMulti(f); else { const t=orderTargets(); select(t.length===1&&t[0]===f?null:f); } });
    dragSource(b,f);
    /* each row has a small 自動交戦/命令優先 switch for that fleet */
    const st=document.createElement('button'); st.className='st'; st.title='この艦隊の自動交戦/命令優先を切り替える';
    st.addEventListener('click',()=>{ if(f.alive) applyStance([f],f.stance==='evade'?'engage':'evade'); });
    const row=document.createElement('div'); row.className='frow'; row.append(b,st);
    f.btn=b; f.stBtn=st; return row; };
  const nb=document.createElement('button'); nb.id='newGrp'; nb.title='選んだ艦隊で新しい戦区軍を作る（Shift+クリックでまとめて選ぶ。最大5個の打撃群）';
  nb.innerHTML='<span>＋ 戦区軍を作る</span><span class="n"></span>'; nb.addEventListener('click',newGroup);
  rosterEl.appendChild(nb);
  if(!groups.length){ mine.forEach(f=>rosterEl.appendChild(mk(f))); return; }
  groups.forEach((g,gi)=>{
    const gz=document.createElement('div'); gz.className='rzone'; gz.dataset.zone='group'; gz.dataset.g=gi;
    const gb=document.createElement('button'); gb.className='grpBtn'; gb.textContent=`${g.name} 全軍`; gb.title='この戦区軍の全軍を選ぶ（Gキーで順に）';
    gb.addEventListener('click',()=>selectGroup(g));
    const gx=document.createElement('button'); gx.className='st rgDel'; gx.textContent='解散'; gx.title='この戦区軍を解散し、各打撃群を独立行動にする';
    gx.addEventListener('click',()=>disband(g));
    /* the army group's own switches: speed sync, 自動交戦/命令優先 for every army in it, and formation on/off */
    const gs=document.createElement('button'); gs.className='st rgSync'; gs.title='移動のとき、最も遅い艦に速度を合わせるか';
    gs.addEventListener('click',()=>toggleSync(g));
    const gt=document.createElement('button'); gt.className='st rgStance'; gt.title='戦区軍の全軍の自動交戦/命令優先をまとめて切り替える';
    gt.addEventListener('click',()=>{ const m=groupAlive(g); if(m.length) applyStance(m,m.every(f=>f.stance==='evade')?'engage':'evade',`${g.name} 全軍`); });
    const gf=document.createElement('button'); gf.className='st rgForm'; gf.title='ON: 旗艦を中心に陣形を保って動く。OFF: 指示した一点に全軍が集まる';
    gf.addEventListener('click',()=>toggleForm(g));
    /* with formation on: which formation to keep (the starting one, or one of the shapes); choosing one regroups at once */
    const gk=document.createElement('select'); gk.className='rgShape'; gk.title='陣形を選ぶと、旗艦を中心にすぐ組み直す';
    gk.setAttribute('aria-label',`${g.name}の陣形`);
    gk.innerHTML=(g.baseName?`<option value="base">${g.baseName}</option>`:'')+Object.entries(SHAPES_FORM).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('');
    gk.addEventListener('change',()=>setShape(g,gk.value));
    const gh=document.createElement('div'); gh.className='ghead'; gh.append(gb,gx,gs,gt,gf,gk);
    gz.appendChild(gh); g.ui={gb,gs,gt,gf,gk};
    mine.filter(f=>g.members.has(f)).forEach(f=>gz.appendChild(mk(f)));
    rosterEl.appendChild(gz);
  });
  const fz=document.createElement('div'); fz.className='rzone'; fz.dataset.zone='free';
  fz.innerHTML='<div class="rhead">独立行動（ここへドラッグで外す）</div>';
  mine.filter(f=>!groupOf(f)).forEach(f=>fz.appendChild(mk(f)));
  rosterEl.appendChild(fz);
}
function dragSource(b,f){
  let st=null,ghost=null;
  b.addEventListener('pointerdown',e=>{ st={x:e.clientX,y:e.clientY,id:e.pointerId}; });
  b.addEventListener('pointermove',e=>{ if(!st||e.pointerId!==st.id||!groups.length) return;
    if(!ghost&&Math.hypot(e.clientX-st.x,e.clientY-st.y)>8){ b.setPointerCapture(e.pointerId); ghost=document.createElement('div'); ghost.className='dragGhost'; ghost.textContent=f.name; document.body.appendChild(ghost); b.classList.add('dragging'); }
    if(ghost){ ghost.style.transform=`translate(${e.clientX+10}px,${e.clientY+6}px)`; const z=zoneAt(e); rosterEl.querySelectorAll('.rzone').forEach(x=>x.classList.toggle('drop',x===z)); } });
  const end=e=>{ if(ghost){ const z=zoneAt(e); ghost.remove(); ghost=null; b._dragged=true; b.classList.remove('dragging');
      if(z&&f.alive) moveToGroup(f,z.dataset.zone==='group'?groups[+z.dataset.g]:null); }
    st=null; rosterEl.querySelectorAll('.rzone').forEach(x=>x.classList.remove('drop')); };
  b.addEventListener('pointerup',end); b.addEventListener('pointercancel',end);
}
function zoneAt(e){ const el=document.elementFromPoint(e.clientX,e.clientY); return el&&el.closest?el.closest('.rzone'):null; }
function groupOf(f){ return groups.find(g=>g.members.has(f))||null; }
function groupAlive(g){ return g?[...g.members].filter(f=>f.alive):[]; }
/* the flagship: the one chosen at sortie (or when the group was formed) while it is alive and in the group, otherwise the first army left */
function groupFlag(g){ if(!g) return null; const f=g.flag; return f&&f.alive&&g.members.has(f)?f:groupAlive(g)[0]||null; }
/* where an army stands in the formation, relative to the flagship */
function formationOffset(g,f){ const fl=groupFlag(g);
  if(g.kind!=='base'&&SHAPES_FORM[g.kind]){ if(!fl||f===fl) return new THREE.Vector3();
    const m=shapeSlots(g.kind,fleets.filter(x=>x.alive&&g.members.has(x))), a=m.get(f), b=m.get(fl);
    return a&&b?a.clone().sub(b):f.pos.clone().sub(fl.pos); }
  const a=g.off.get(f), b=fl&&g.off.get(fl);
  return a&&b?a.clone().sub(b):fl?f.pos.clone().sub(fl.pos):new THREE.Vector3(); }
/* the formation shapes, relative to the flagship (-z is ahead). The gap between armies is FORM_GAP (provisional) */
const FORM_GAP=20;
const SHAPES_FORM={line:{name:'横陣'}, column:{name:'縦陣'}, ring:{name:'輪形陣'}};
/* how far back an army belongs: the ship classes in data/ships.js run from the vanguard (top: corvettes) to the rear
   (bottom: carriers). An assault lander stands with the destroyers (ユーザー決定 2026-10-03). A fleet's rank is the mean of its ships' */
const SHIP_ORDER=WOS_DATA.ships.map(c=>c.id);
function shipRank(t){ const i=SHIP_ORDER.indexOf(t==='mas'?'dd':t); return i<0?SHIP_ORDER.indexOf('cl'):i; }
function fleetRank(f){ return f.ships.length?f.ships.reduce((s,x)=>s+shipRank(x.type),0)/f.ships.length:0; }
/* the places of a shape for these armies (ahead is -z): the heavy ones go to the rear and the centre, the light ones ahead and around.
   縦陣: light at the head, heavy at the tail. 横陣: the heaviest in the middle, lighter ones further out and a little ahead.
   輪形陣: the heaviest in the middle (a little back), the others on the ring, the lightest at the front */
function shapeSlots(kind,list){
  const by=[...list].sort((a,b)=>fleetRank(a)-fleetRank(b)), m=new Map(), G=FORM_GAP, V=(x,z)=>new THREE.Vector3(x,0,z);
  if(kind==='column'){ by.forEach((f,i)=>m.set(f,V(0,G*i))); return m; }
  const h=by.pop(); if(!h) return m;
  if(kind==='line'){ m.set(h,V(0,0)); by.reverse().forEach((f,k)=>{ const s=Math.floor(k/2)+1; m.set(f,V((k%2?-1:1)*G*s,-G*.25*s)); }); return m; }
  m.set(h,V(0,G*.2)); const n=by.length, r=G*1.1;
  const slots=by.map((_,k)=>{ const a=Math.PI*2*k/n; return V(Math.sin(a)*r,-Math.cos(a)*r); }).sort((a,b)=>a.z-b.z);
  by.forEach((f,i)=>m.set(f,slots[i])); return m;
}
/* gather the army group into its formation around the flagship, where the flagship is now (the flagship stops) */
function reform(g){ const fl=groupFlag(g); if(!fl) return; const m=groupAlive(g);
  saveUndo(m); dropArrow(fl.arrow); fl.arrow=null; fl.order=null; fl.queue=[];
  m.forEach(f=>{ if(f===fl) return; f.queue=[]; f.syncSpeed=null; order(f,{type:'move',dest:fl.pos.clone().add(turnTo(formationOffset(g,f),fl.march))}); }); }
/* a place in the formation (ahead is -z), turned so that ahead is `dir` (level) */
const _up=new THREE.Vector3(0,1,0);
function turnTo(off,dir){ return off.clone().applyAxisAngle(_up,Math.atan2(-dir.x,-dir.z)); }
function setShape(g,kind){ if(!SHAPES_FORM[kind]&&!(kind==='base'&&g.baseName)) return; g.kind=kind; reform(g); updateRoster();
  const fl=groupFlag(g); logEvent(`${g.name} ${kind==='base'?g.baseName:SHAPES_FORM[kind].name}`,`旗艦の${fl?fl.name:'—'}を基準に組み直す。このあとの移動もこの陣形を保つ。`); }
/* take an army out of its group; a group left with no armies goes away */
function leaveGroup(f){ const g=groupOf(f); if(!g) return; g.members.delete(f); f.syncSpeed=null;
  if(!g.members.size) groups.splice(groups.indexOf(g),1); }
/* drag in the roster: into another group (it takes the place where it stands now, relative to the flagship) or out to act alone */
function moveToGroup(f,g){ const from=groupOf(f); if(g===from) return;
  if(g&&g.members.size>=GROUP_MAX){ logEvent('戦区軍は満員です',`戦区軍に入れられる打撃群は${GROUP_MAX}個までです。`); return; }
  leaveGroup(f);
  if(g){ const fl=groupFlag(g); g.members.add(f); if(fl) g.off.set(f,f.pos.clone().sub(fl.pos).add(g.off.get(fl)||new THREE.Vector3())); }
  logEvent(g?`${f.name} ${g.name}へ`:`${f.name} 独立行動へ`, g?`${f.name}が${g.name}の指揮下に入った。`:`${f.name}が${from.name}を離れ、単独で行動する。`);
  if(selGroup) select(null); buildRoster(); updateRoster(); }
/* a new army group is named after its main class (the highest class among the ships alive in its fleets) */
function newGroupName(t){ const all={}; t.forEach(f=>f.ships.forEach(s=>all[s.type]=(all[s.type]||0)+1));
  return unitName('group',mainType(all),new Set(groups.map(g=>unitNo(g.name)))); }
/* a new army group from the selected fleets (Shift+click to pick several): the first one picked is the flagship,
   and the formation is how they stand now */
function newGroup(){ const t=orderTargets(); if(!t.length||selGroup||over) return;
  if(t.length>GROUP_MAX){ logEvent('戦区軍は5個の打撃群まで',`選んでいる${t.length}隊のうち、${GROUP_MAX}隊までにしてください。`); return; }
  const fl=t.includes(selected)?selected:t[0];
  t.forEach(leaveGroup);
  const g={name:newGroupName(t),sync:true,form:false,kind:'base',baseName:'編成時の並び',members:new Set(t),flag:fl,off:new Map()};
  t.forEach(f=>g.off.set(f,f.pos.clone().sub(fl.pos)));
  groups.push(g); buildRoster(); selectGroup(g);
  logEvent(`${g.name} 編成`,`${t.map(f=>f.name).join('・')}で戦区軍を作った。旗艦は${fl.name}。いまの並びを陣形とする。`); }
function disband(g){ const i=groups.indexOf(g); if(i<0) return; groups.splice(i,1); g.members.forEach(f=>f.syncSpeed=null);
  if(selGroup===g) select(null); buildRoster(); updateRoster();
  logEvent(`${g.name} 解散`,'各打撃群は独立行動に戻った。'); }
/* formation on: a move keeps the formation around the flagship. Off: every army goes to the point itself */
function toggleForm(g){ g.form=!g.form; updateRoster();
  logEvent(g.form?`${g.name} 陣形ON`:`${g.name} 陣形OFF`, g.form?`旗艦の${(groupFlag(g)||{name:'—'}).name}を中心に、陣形を保って動く。`:'移動を命じると、全軍が指示した一点に集まる。'); }
function selectGroup(g){ const m=groupAlive(g); if(!m.length) return; if(selGroup===g){ select(null); return; } setSel(m,g); }
/* G: the group of the selected fleet, then the next group, then nothing */
function cycleGroup(){ const live=groups.filter(g=>groupAlive(g).length); if(!live.length) return;
  const own=!selGroup&&selected&&groupOf(selected);
  if(own&&live.includes(own)){ selectGroup(own); return; }
  const next=live[live.indexOf(selGroup)+1]; if(next) selectGroup(next); else select(null); }
/* Shift+click on an own fleet adds it to the selection or takes it out */
function toggleMulti(f){ const t=orderTargets(); setSel(t.includes(f)?t.filter(x=>x!==f):[...t,f]); }
/* the fleets an order goes to: the whole army group, or the selected armies */
function orderTargets(){ return selGroup?groupAlive(selGroup):selMulti.filter(f=>f.alive); }
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
function updateUndo(){ document.querySelectorAll('.undo').forEach(b=>b.disabled=!undoStack.length); }
function groupOrder(o){
  const t=orderTargets().filter(f=>!f.locked); if(!t.length){ if(opCarrier&&opCarrier.locked&&orderTargets().includes(opCarrier)) logEvent(`${opCarrier.name} 収容中`,'収容が終わるまで動けない。'); return; }
  saveUndo(t);
  const g=selGroup, sync=g&&g.sync?Math.min(...t.map(f=>f.speed)):null;
  if(!o.queue) t.forEach(f=>f.queue=[]);
  const tail=f=>o.queue?(f.queue.length?f.queue[f.queue.length-1]:f.order):null;
  if(o.type==='move'){
    /* the whole army group: with formation on, the flagship goes to the point and the others take their places around it;
       with formation off, every army goes to the point itself. Several fleets picked one by one keep how they stand */
    /* with formation on, every army heads straight for its own place around the point (it does not chase the flagship);
       the formation is turned so that ahead is the way the flagship goes from where it is (or from its last point) */
    const formation=g&&g.form&&groupFlag(g), point=g&&!g.form;
    const base=f=>{ const x=tail(f); if(!x) return f.pos; if(x.type==='move'){ const l=pathLeft(x); return l[l.length-1]; } return x.target.pos; };
    const c=new THREE.Vector3(); t.forEach(f=>c.add(base(f))); c.divideScalar(t.length);
    const dir=formation?o.dest.clone().sub(base(formation)):null; if(dir&&dir.x*dir.x+dir.z*dir.z<1e-4) dir.copy(formation.march);
    t.forEach(f=>{ const x=tail(f), dest=point?o.dest.clone():formation?o.dest.clone().add(turnTo(formationOffset(g,f),dir)):o.dest.clone().add(base(f).clone().sub(c)); f.syncSpeed=sync;
      if(x&&x.type==='move'&&x===f.order) order(f,{type:'move',via:pathLeft(x).slice(-(MAX_WAYPOINTS-1)),dest});
      else if(x&&x.type==='move'){ x.via=pathLeft(x).slice(-(MAX_WAYPOINTS-1)); x.dest=dest; }
      else if(x) f.queue.push({type:'move',dest});
      else order(f,{type:'move',dest}); });
  } else t.forEach(f=>{ f.syncSpeed=sync; if(tail(f)) f.queue.push({type:o.type,target:o.target}); else order(f,o); });
}
function updateRoster(){
  const t=orderTargets();
  fleets.forEach(f=>{ if(!f.btn) return; const g=groupOf(f);
    f.btn.querySelector('.n').textContent=(f.queue.length?`予約${f.queue.length} `:'')+'×'+f.ships.length;
    f.btn.querySelector('span').textContent=(g&&f===groupFlag(g)?'★ ':'')+f.name; f.btn.classList.toggle('evade',f.stance==='evade');
    f.btn.querySelector('.bar i').style.width=(100*f.ships.length/f.n)+'%';
    f.btn.disabled=!f.alive; f.btn.setAttribute('aria-pressed',String(t.includes(f)));
    if(f.stBtn){ f.stBtn.textContent=f.stance==='evade'?'命令':'自動'; f.stBtn.dataset.st=f.stance; f.stBtn.disabled=!f.alive; }
  });
  const nb=document.getElementById('newGrp'); if(nb){ nb.disabled=!t.length||!!selGroup; nb.querySelector('.n').textContent=t.length&&!selGroup?`${t.length}隊`:''; }
  groups.forEach(g=>{ if(!g.ui) return; const {gb,gs,gt,gf}=g.ui, m=groupAlive(g), ev=m.filter(f=>f.stance==='evade').length;
    gb.setAttribute('aria-pressed',String(selGroup===g)); gb.disabled=!m.length;
    gs.textContent=g.sync?'速度同期':'速度個別'; gs.setAttribute('aria-pressed',String(g.sync));
    gt.textContent='全軍'+(!m.length?'—':ev===m.length?'命令':ev?'混在':'自動'); gt.dataset.st=ev===m.length&&m.length?'evade':ev?'mixed':'engage'; gt.disabled=!m.length;
    gf.textContent=g.form?'陣形ON':'陣形OFF'; gf.setAttribute('aria-pressed',String(g.form));
    g.ui.gk.hidden=!g.form; g.ui.gk.value=g.kind; g.ui.gk.disabled=!m.length; });
  syncStance();
}

let lastCfg=null, groups=[], selGroup=null, selMulti=[];
function reset(cfg=lastCfg){
  lastCfg=cfg; undoStack=[]; updateUndo();
  if(fleets) fleets.forEach(f=>{f.el.remove();dropArrow(f.arrow);});
  if(fortress&&fortress.el) fortress.el.remove();
  [...arrows].forEach(dropArrow); wings=[];
  document.getElementById('alt').hidden=true;
  if(fieldC.lengthSq()) shiftView(fieldC.clone().negate());   // a retry brings the view back with the field
  lastSpot=null; spotNow=false; spotLogT=-1e9; rescue=null; rescued=false; chase=null; perfect=false; evac=0; evacRate=1; evacShips=0;
  fid=1; gameSec=0; over=false; selected=null; engaged=new Map(); nextEvent=0; fortressMarks=new Set(); events=[];
  op=OPS.find(o=>o.id===(cfg&&cfg.op))||OPS[0];
  /* the field's centre, radius and reach (op.fieldC:[x,z], op.fieldR, op.reach; 第5節), and how far the view may pull back (op.view.max) */
  fieldC.set(op.fieldC?op.fieldC[0]:0,0,op.fieldC?op.fieldC[1]:0); FIELD_R=op.fieldR||215; REACH=op.reach||200; setAltMax(op.altMax||60); setAlt(0,false);
  controls.maxDistance=op.view&&op.view.max||330; gridMat.uniforms.uR.value=FIELD_R;
  /* the clock: an operation that says how long it runs (op.span, operation minutes) is fitted to its scale's length at 1×
     (user decision 2026-10-12: the clock is slowed, not the ships); otherwise the base rate × op.clockScale */
  const SC=WOS_DATA.scales&&WOS_DATA.scales[op.scale]; CLOCK_RATE=op.span&&SC?op.span/(SC.sec*(op.pace||1)):CLOCK_BASE*(op.clockScale||1);   // op.pace: a shorter (or longer) run at 1× (user decision 2026-10-13)
  HP_K=WOS_DATA.balance&&WOS_DATA.balance.hp||1;
  timeWarned=false; gunLostSaid=false;
  casualties=0; civMarks=new Set(); civFirst=false; loseWhy=null; opCarrier=null; shieldSaid=false;
  /* the body in the middle (op.body), its habitat blocks and civilian zones (op.civil), the mining debris (op.debris) */
  const BD=op.body, CV=op.civil;
  buildBody(BD,CV&&CV.r); buildDebris(op.debris,op.debrisTilt); buildSky(op.sky);
  blocks=(BD&&BD.blocks||[]).map((b,i)=>({kind:'block',team:0,id:-1-i,i,name:b.name,sub:b.sub,pos:new THREE.Vector3(b.pos[0],b.alt||0,b.pos[1]),radius:6,alive:true,seen:true,ships:[],gate:!!b.gate})).filter(b=>!b.gate);   // the gates of the base (第5節) are not habitat blocks
  debris=(op.debris||[]).map(c=>({c:new THREE.Vector3(c.pos[0],c.alt||0,c.pos[1]),r:c.r}));
  enemyWASSeen=false;
  opEvents=[...(op.reinforcements||[]),...(op.events||[])].map(e=>({...e})).sort((a,b)=>a.after-b.after);   // copies: onSpot may move an event's time
  const spec=cfg&&cfg.fleets&&cfg.fleets.length?cfg.fleets:op.quick;
  fleets=[...spec.map(o=>makeFleet(0,o)),...op.enemies.map(o=>makeFleet(1,o))];
  /* the carrier given for this operation (op.carrier, user decision 2026-10-09): it joins at the end of our fleet list, outside any
     army group; it is not one of the player's own fleets, so research does not touch it (no craft rates) */
  if(op.carrier){ const C=op.carrier; opCarrier=makeFleet(0,{...C.fleet,pos:C.at,alt:C.fleet.alt||0}); opCarrier.isCarrier=true;
    opCarrier.cs={landed:false,landMin:0,board:0,done:false,exit:new THREE.Vector3(C.exit.pos[0],C.exit.alt||0,C.exit.pos[1]),logs:new Set()};
    fleets.splice(spec.length,0,opCarrier); }
  /* allied fleets (op.allies): on our side but run by the AI (sim.js allyAI); not in the roster and not ours to select */
  for(const a of op.allies||[]){ const f=makeFleet(0,{ai:'guard',leash:40,...a,ally:true}); f.ward=true; f.home=f.post.clone(); f.mode=a.ai||'guard';
    if(a.retreat) f.fallTo=new THREE.Vector3(a.retreat.to[0],a.retreat.alt||f.post.y,a.retreat.to[1]); fleets.push(f); }
  /* ships lent for this operation (op.given, 第5節: a battleship from the base's yard): ours to command, after our own fleets,
     outside any army group, and untouched by research (like the carrier) */
  fleets.splice(spec.length+(opCarrier?1:0),0,...(op.given||[]).map(o=>makeFleet(0,o)));
  /* 第5節: the base's gates (the body's blocks with gate:true, op.base; sim.js) on the floors of their craters, their shields, the infantry
     round them and the garrison inside; and the enemy's main force to sink (op.win type 'repel'). A gate's ring (where the assault ships
     stop) is `up` over the lid along the rock's face; pos is the lid's middle, what the enemy fires on (radius for the reach) */
  const GB=op.base, looks=GB?buildBase(BD):buildBase(null);
  gates=looks.map((L,i)=>({kind:'gate',team:0,id:-100-i,i,name:L.name,sub:L.sub,look:L,pos:L.at.clone(),up:L.up.clone(),ring:L.at.clone().addScaledVector(L.up,GB.up||10),r:GB.r||10,radius:GB.radius||7,
    hp:GB.shield*HP_K,max:GB.shield*HP_K,alive:true,sealed:false,breached:false,seen:true,everSeen:true,ships:[],marks:new Set(),boomT:0,inf:(GB.infantry&&GB.infantry.n)||18,
    infSrc:{kind:'wing',inf:true,team:0,id:-200-i,name:`${L.name}の強化歩兵`}}));
  garrison=GB&&GB.garrison?{hp:GB.garrison.hp,max:GB.garrison.hp,marks:new Set(),said:false}:null; troops=[]; troopsSaid=null; troopsWent=0;   // the enemy's infantry on the rock (sim.js)
  surged=false; surgeMin=null; rotOut=[]; rotSaid={}; rotDone={}; repelBy=null; repelT=null; detailFocus=null; stageGate=null; initFronts(); initPacks(); massAt={}; breached=null;
  mainTotal=[...op.enemies,...[...(op.events||[]),...(op.reinforcements||[]),...(op.win&&op.win.surge&&op.win.surge.events||[]),...(op.phases||[]).flatMap(S=>S.events||[])].map(e=>e.fleet)].filter(o=>o&&o.main).reduce((s,o)=>s+o.n,0);
  /* an operation in stages (op.phases): the field starts at the first stage's place; the later ones slide it (sim.js stepPhases) */
  stageAt=0; stageText=''; slideTo=null; spotObj.visible=false;
  if(op.phases){ const S=op.phases[0]; fieldC.set(S.centre[0],0,S.centre[1]); stageAt=1; stageText=S.text||''; if(S.events) opEvents.push(...S.events.map(e=>({...e}))); opEvents.sort((a,b)=>a.after-b.after); }
  selGroup=null; selMulti=[];
  /* the army groups: the ones chosen at sortie (several may go out together), or for an operation fought with its own fleets,
     op.group around all of them. More army groups can be formed during the battle (＋ in the roster) */
  const GS=cfg&&(cfg.groups||cfg.group&&[cfg.group])||(op.group&&spec===op.quick?[{...op.group,members:op.quick.map((_,i)=>i)}]:[]);
  groups=GS.map(G=>{ const AG={name:G.name,sync:G.sync,form:false,kind:'base',baseName:'出撃時の陣形',members:new Set(G.members.map(i=>fleets[i])),flag:fleets[G.flag??G.members[0]],off:new Map()};
    /* each army's place in the formation, relative to the flagship (from the cube at sortie, or from where the armies start) */
    G.members.forEach((i,k)=>{ const o=G.offsets&&G.offsets[k]; AG.off.set(fleets[i],o?new THREE.Vector3(o[0],o[1],o[2]):fleets[i].pos.clone().sub(AG.flag.pos)); });
    return AG; });
  /* the transports of an escort operation: own side, but they follow their own route and take no orders */
  convoy=null;
  if(op.convoy){ convoy=makeFleet(0,{dmg:0,range:0,eva:0,...op.convoy.fleet}); convoy.convoy=convoy.ward=true; convoy.departed=false; convoy.escaped=false; convoy.sub='乗船中'; fleets.push(convoy);
    if(!(op.convoy.depart>0)) departConvoy(); }
  /* a field that moves with the convoy: the grid, the camera and the edge go along with it (sim.js stepField) */
  fieldMoves=op.field==='convoy'&&!!convoy;
  gridMat.uniforms.uFrame.value=fieldMoves||op.phases||op.fieldR?1:0;
  clouds=buildClouds(op.clouds);
  /* the object in the middle of the field: the enemy fortress (a target), a relay station we defend (op.station: it has armour and
     batteries, and the enemy shoots at it), or a relay station as scenery. The defended station uses the fortress slot with team 0 */
  const F=op.fortress, S=op.station;
  fortress=F?{kind:'fortress',team:1,id:0,name:F.name,pos:new THREE.Vector3(0,3,0),hpPool:F.hp*HP_K,max:F.hp*HP_K,dps:F.dps,range:F.range,radius:F.radius,alive:true,retarget:0,fireTarget:null,vis:F.vis,seen:true,everSeen:true,revealT:0}
    :S?{kind:'fortress',team:0,defend:true,id:0,name:S.name,pos:new THREE.Vector3(0,0,0),hpPool:S.hp*HP_K,max:S.hp*HP_K,dps:S.dps,range:S.range,radius:S.radius||8,alive:true,retarget:0,fireTarget:null,vis:S.vis??6,seen:true,everSeen:true,revealT:0}
    :{kind:'fortress',team:1,id:0,name:'',pos:new THREE.Vector3(0,3,0),alive:false,el:null};
  if(S){ fortress.el=mkUnitLabel(0,S.name,S.sub||''); fortress.el.classList.add('fort');
    /* the station's own fighters (S.hangar): they go out at enemies coming within S.launchR, like a carrier's */
    fortress.hangars=makeHangars(S.hangar,S.launchR); fortress.heading=new THREE.Vector3(0,0,-1); fortress.launchR=S.launchR||0; }
  if(F){ fortress.hangars=makeHangars(F.hangar,F.launchR); fortress.heading=new THREE.Vector3(0,0,1); fortress.launchR=F.launchR||0;
    fortress.sortie=(F.sortie||[]).map(s=>({...s,started:false,left:null,next:0}));
    fortress.el=mkUnitLabel(1,fortress.name,''); fortress.el.classList.add('fort'); fortress.el.querySelector('.emb').style.cssText='width:32px;height:32px'; }
  fortressObj.visible=!!F; zoneLines.visible=!!F; gridMat.uniforms.uZone.value=F?1:0;
  stationObj.visible=op.center==='station'||!!S;
  exitObj.visible=!!op.exit; if(op.exit) exitObj.position.set(op.exit.pos[0],(op.exit.alt||0)+.2,op.exit.pos[1]);
  /* the enemy names the shield fleets guard (their block); kept for the AI */
  for(const f of fleets) if(f.team===1&&f.block!=null) f.blockAt=blocks[f.block]||null;
  /* fixed units (the batteries) stand on the body's surface, in the direction they are placed */
  if(BD) for(const f of fleets) if(f.fixed){ if(f.pit){ pitBuild(f); continue; }   // 第5節: the base's guns in their holes (base.js)
    const R=bodySurface(f.pos,BD.r)+1.2; f.pos.sub(bodyC).setLength(R).add(bodyC); f.post.copy(f.pos);
    /* each gun sits with its base flat on the rock: where the rock is under it, turned to the rock's face (drawn in loop.js) */
    /* a thruster (第6節, type thr; user decision 2026-10-23): its nozzle points straight out from the body's centre, not along the rock's face */
    f.ships.forEach(s=>{ const h=bodyHit(_w.copy(f.pos).add(s.off),BD.r); s.up=f.type==='thr'?h.point.clone().sub(bodyC).normalize():h.normal; s.base=h.point.clone().addScaledVector(s.up,.34*f.scale); s.pos.copy(s.base); }); }
  setPhase(op.phase||'布陣');
  document.getElementById('result').hidden=true;
  document.getElementById('log').innerHTML='';
  showBrief('作戦概要',op.name,op.brief); flashBrief(8000);
  /* the body and its blocks are named on the plane like the sectors */
  /* a gate's name stands just north of the gate itself (its block's pos is only the way to its crater) */
  const gateLabel=b=>{ const g=gates.find(x=>x.name===b.name); return g?[g.pos.x,g.pos.z-6]:b.pos; };
  buildSectors([...(op.sectors||[]),...(BD?[{name:BD.name,sub:BD.sub,pos:BD.label||[0,0]},...BD.blocks.map(b=>({name:b.name,sub:CV?`${b.sub}　民間区画`:b.sub,pos:b.gate?gateLabel(b):b.pos})),
    ...(BD.port?[{name:BD.port.name,sub:BD.port.sub||'',pos:BD.port.pos}]:[])]:[])]);
  fogTimer=0; updateFog();
  buildRoster(); updateRoster(); if(typeof updateGoal==='function') updateGoal();
}
