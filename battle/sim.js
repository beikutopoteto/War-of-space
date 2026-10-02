/* War of Space battle: detection, combat, carriers, enemy AI, step.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- simulation ---------- */
let wings=[];
function units(){ return fortress.alive?[...fleets,...wings,fortress]:[...fleets,...wings]; }
function gap(a,b){ return a.pos.distanceTo(b.pos)-(b.radius||0); }
/* detection: a team sees an enemy unit while any of its own units has it within sight.
   sight grows with the observer's 視界, shrinks with the target's 隠蔽性; vision is shared across the team,
   and a unit that opens fire gives itself away for a few seconds. */
const sightOf=u=>60+(u.vis??6)*8, concealOf=u=>1-Math.min(10,u.stl??4)*.04, FIRE_REVEAL=3, LOST_MEMORY=30;
function shown(u){ return u.team===0||u.seen; }
let fogTimer=0;
function updateFog(){
  const all=units();
  for(const t of all){ if(!t.alive) continue;
    let by=null;
    if(t.kind==='fortress'||t.revealT>0) by=t;
    else for(const o of all){ if(!o.alive||o.team===t.team) continue;
      if(o.pos.distanceTo(t.pos)<=sightOf(o)*concealOf(t)){ by=o; break; } }
    const was=t.seen; t.seen=!!by;
    if(was&&!t.seen){ t.lastPos=t.pos.clone(); t.lostAt=gameSec; }
    if(t.seen&&!t.everSeen){ t.everSeen=true;
      if(t.team===1&&gameSec>0&&by!==t) logEvent(`${t.name} 発見`,`${by.name}が${t.name}（${t.ships.length}隻）を捕捉。`); }
  }
}
function nearestFoe(f,maxD){ let best=null,bd=maxD; for(const u of units()){ if(!u.alive||u.team===f.team||!u.seen) continue; const d=gap(f,u); if(d<bd){bd=d;best=u;} } return best; }
function randShip(u){ if(u.kind==='fortress'){ const a=Math.random()*Math.PI*2; return new THREE.Vector3(Math.cos(a)*10,3+Math.random()*4,Math.sin(a)*9); } return u.ships.length?u.ships[(Math.random()*u.ships.length)|0].pos:u.pos; }

function damage(t,amt,src){
  if(!t.alive) return;
  if(t.eva) amt*=1-t.eva;
  if(t.kind==='wing'&&src.kind!=='wing') amt*=.5; // ship guns track small craft poorly
  t.hpPool-=amt;
  const key=Math.min(src.id,t.id)+'-'+Math.max(src.id,t.id), last=engaged.get(key), wingy=t.kind==='wing'||src.kind==='wing';
  if(last===undefined||gameSec-last>40){
    if(last===undefined){
      const a=src.team===0?src:t, b=src.team===0?t:src;
      if(t.kind==='fortress'||src.kind==='fortress'){
        if(phaseName!=='要塞攻略'){ setPhase('要塞攻略'); logEvent('要塞攻略開始',`${a.name}が要塞の防空砲火圏に突入。要塞の主砲は射程${fortress.range}、近づくほど危険。`); }
      } else { if(phaseName==='布陣') setPhase('交戦'); if(!wingy) logEvent(`${a.name} 対 ${b.name}`,`${a.name}（${a.ships.length}隻）と${b.name}（${b.ships.length}隻）が交戦を開始。`); }
    }
    engaged.set(key,gameSec);
  } else engaged.set(key,gameSec);
  if(t.kind==='wing'){
    const want=Math.max(0,Math.ceil(t.hpPool/t.hp));
    while(t.ships.length>want){ const s=t.ships.pop(); burst(s.pos,TEAM_COL[t.team],5,5,.6); }
    t.n=want; if(want===0){ t.alive=false; t.squad.n=0; t.squad.state='lost'; }
  } else if(t.kind==='fleet'){
    const want=Math.max(0,Math.ceil(t.hpPool/t.hp)), had=t.ships.length;
    while(t.ships.length>want){ const s=t.ships.pop(); burst(s.pos,TEAM_COL[t.team],16,7,.9); }
    if(t.convoy&&want<had&&want>0) logEvent('輸送船 撃沈',`${src.name}の攻撃で輸送船を失った。残り${want}隻。`);
    if(want===0) destroyFleet(t,src);
  } else {
    const pct=t.hpPool/t.max;
    for(const m of [.75,.5,.25]) if(pct<m&&!fortressMarks.has(m)){ fortressMarks.add(m); logEvent(`要塞装甲 ${m*100}%`,m===.25?'要塞の外殻が崩れ始めた。もう一押しで陥落する。':'要塞表面で誘爆が続いている。砲火はまだ衰えていない。'); }
    if(Math.random()<amt*.06) burst(randShip(t),TEAM_COL[1],10,6,1);
    if(t.hpPool<=0){ t.alive=false; for(let i=0;i<14;i++) burst(randShip(t),HOT,40,14,1.6); end(true); }
  }
}
function destroyFleet(f,src){
  f.alive=false; f.el.remove(); dropArrow(f.arrow); f.arrow=null;
  burst(f.pos,TEAM_COL[f.team],40,10,1.3);
  if(selected===f) select(null);
  logEvent(`${f.name} 全滅`, f.convoy?'輸送船団が全滅した。':f.team===0?`${src.name}の攻撃で${f.name}が失われた。残る艦隊で戦線を立て直せ。`:`${src.name}が${f.name}を撃破。${TEAM_NAME[1]}の防空網に穴が開いた。`);
  if(!fleets.some(x=>x.team===0&&x.alive&&!x.convoy)) end(false);
  updateRoster();
}
function end(win){
  if(over) return; over=true; setPhase('戦闘終結');
  const left=fleets.filter(f=>f.team===0&&f.alive).reduce((s,f)=>s+f.ships.length,0);
  document.getElementById('rh').textContent=win?'勝利':'敗北';
  const R=op.result, tail=convoy?`輸送船 ${convoy.escaped?convoy.ships.length:0}/${convoy.n}隻が離脱。`:`残存艦 ${left}隻。`;
  document.getElementById('rp').textContent=win?`${clockStr()}、${R.win}${tail}`:`${clockStr()}、${R.lose}`;
  logEvent(...(win?R.winLog:R.loseLog));
  /* the operation's closing conversation, then the result */
  const talk=op.talk&&(win?op.talk.win:op.talk.lose);
  setTimeout(()=>startTalk(talk,()=>{document.getElementById('result').hidden=false;}),1600);
}

/* enemy W.A.S. go for the transports first when they are within reach; everything else takes the nearest foe */
function craftTarget(u,type,maxD){
  if(u.team===1&&type==='was'&&convoy&&convoy.alive&&convoy.seen&&gap(u,convoy)<maxD) return convoy;
  return nearestFoe(u,maxD);
}
let enemyWASSeen=false;
/* launch: when a spotted enemy comes within reach, docked squadrons sortie one at a time (cooldown cd), up to maxOut at once */
function launchCheck(f){
  for(const h of f.hangars){ const W=WING[h.type];
    if(gameSec<h.next) continue;
    const sq=h.squads.find(q=>q.state==='docked'&&q.n>0&&gameSec>=q.ready); if(!sq) continue;
    const tgt=craftTarget(f,h.type,W.launchR); if(!tgt) continue;
    h.next=gameSec+W.cd; sq.state='out';
    const w={kind:'wing',team:f.team,id:fid++,type:h.type,W,carrier:f,hangar:h,squad:sq,name:`${f.name}${W.name}隊`,
      pos:f.pos.clone(),heading:f.heading.clone(),n:sq.n,launched:sq.n,hp:W.hp,hpPool:sq.n*W.hp,eva:W.eva,dmg:W.dmg,range:W.range,
      vis:W.vis,stl:W.stl,fuel:W.fuel,target:tgt,state:'attack',alive:true,seen:f.seen,everSeen:true,revealT:0,retarget:0,fireTarget:null,radius:0,ships:[]};
    const R=Math.sqrt(sq.n)*.55;
    for(let i=0;i<sq.n;i++){ const a=Math.random()*Math.PI*2,r=R*Math.sqrt(Math.random());
      const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*1.6,Math.sin(a)*r); w.ships.push({off,pos:f.pos.clone(),wob:Math.random()*6}); }
    sq.wing=w; wings.push(w);
    if(f.team===1&&h.type==='was'&&!enemyWASSeen&&op.onEnemyWAS){ enemyWASSeen=true; logEvent(...op.onEnemyWAS); }
    if(f.team===0&&!h.announced){ h.announced=true;
      logEvent(`${f.name} ${W.name}発進`,`${tgt.name}を捉え、${W.name}${sq.n}機が発進。最大${W.maxOut}隊まで順に出撃し、燃料が尽きると母艦へ戻る。`); }
  }
}
/* back aboard: half of this sortie's losses are made up from the reserve, then the squadron rearms */
function dock(w){
  const h=w.hangar, q=w.squad, rec=Math.min(Math.ceil((w.launched-w.n)/2),h.reserve);
  h.reserve-=rec; q.n=w.n+rec; q.state='docked'; q.ready=gameSec+w.W.rearm; q.wing=null; w.alive=false;
}
function stepWings(dt){
  for(const w of wings){ if(!w.alive) continue;
    const c=w.carrier;
    if(w.state==='attack'){
      w.fuel-=dt;
      if(!w.target||!w.target.alive||!w.target.seen) w.target=craftTarget(w,w.type,w.W.launchR*.6)||(c.alive?craftTarget(c,w.type,w.W.launchR):null);
      if(w.fuel<=0||!w.target){ w.state='return'; w.target=null; }
    }
    if(w.state==='return'&&!c.alive){ w.fuel-=dt; if(w.fuel<=-w.W.fuel*.5){ w.alive=false; w.squad.n=0; w.squad.state='lost'; continue; } }
    const goal=w.state==='attack'?w.target.pos:(c.alive?c.pos:null);
    if(goal){
      const stop=w.state==='attack'?w.range*.6+(w.target.radius||0):1;
      _v.subVectors(goal,w.pos); const d=_v.length();
      if(w.state==='return'&&d<=stop+.5){ dock(w); continue; }
      if(d>stop){ _v.normalize(); w.pos.addScaledVector(_v,Math.min(w.W.speed*dt,d-stop)); w.heading.lerp(_v,Math.min(1,dt*4)).normalize(); }
    }
    if(w.state!=='attack') continue;
    w.retarget-=dt; if(w.retarget<=0){ w.retarget=.4; const t=w.target; w.fireTarget=t&&t.alive&&t.seen&&gap(w,t)<=w.range?t:nearestFoe(w,w.range); }
    const ft=w.fireTarget;
    if(ft&&ft.alive&&ft.seen&&gap(w,ft)<=w.range*1.08){
      damage(ft,w.n*w.dmg*dt,w); w.revealT=FIRE_REVEAL;
      if(Math.random()<Math.min(w.n,10)*1.4*dt) shoot(randShip(w),randShip(ft),TEAM_COL[w.team],.18);
    }
  }
  wings=wings.filter(w=>w.alive);
}

/* move orders follow a path: a straight line to one point, or a smooth curve through the waypoints queued with Shift+click.
   The arrow is drawn from the same curve, so the fleet goes exactly where the arrow shows. */
const MAX_WAYPOINTS=8, PATH_DIV=40;
function makePath(from,pts){
  const all=[from.clone(),...pts.map(p=>p.clone())];
  const curve=all.length>2?new THREE.CatmullRomCurve3(all,false,'centripetal'):new THREE.LineCurve3(all[0],all[1]);
  curve.arcLengthDivisions=(all.length-1)*PATH_DIV;
  const lens=curve.getLengths();
  return {curve, L:Math.max(lens[lens.length-1],1e-3), s:0, pts:all.slice(1), at:all.slice(1).map((_,i)=>lens[(i+1)*PATH_DIV])};
}
/* when an order is done, the next queued one starts (an attack on a target already gone is skipped) */
function nextOrder(f){ while(f.queue&&f.queue.length){ const o=f.queue.shift(); if(o.type==='attack'&&!o.target.alive) continue; order(f,o); return; } }
/* the waypoints (and destination) still ahead of a move order */
function pathLeft(o){ const p=o.path; return p?p.pts.filter((_,i)=>p.at[i]>p.s+.5):[...(o.via||[]),o.dest]; }
/* advance along the path; true when the end is reached */
function followPath(f,dt){
  const o=f.order; if(!o.path) o.path=makePath(f.pos,[...(o.via||[]),o.dest]);
  const p=o.path; p.s=Math.min(p.L,p.s+(f.syncSpeed||f.speed)*dt);
  const u=p.s/p.L; f.pos.copy(p.curve.getPointAt(u));
  _v.copy(p.curve.getTangentAt(Math.min(u,.999))); if(_v.lengthSq()>1e-6) f.heading.lerp(_v.normalize(),Math.min(1,dt*3)).normalize();
  return p.s>=p.L;
}
/* engagement: a fleet set to 回避 (evade) holds fire and keeps its craft aboard; it only fires on a target it was ordered to attack */
function fireTargetOf(f){
  if(f.stance!=='evade') return nearestFoe(f,f.range);
  const t=f.order&&f.order.type==='attack'?f.order.target:null;
  return t&&t.alive&&t.seen&&gap(f,t)<=f.range?t:null;
}

/* escort operations: the convoy boards until `depart` (operation minutes), then follows its route to the departure point.
   It wins when the convoy gets through with fewer than `lose` transports lost, and loses when that many are gone */
function stepConvoy(){
  if(!convoy||over) return;
  const C=op.convoy;
  if(convoy.alive&&!convoy.departed&&gameSec*CLOCK_RATE>=C.depart){ convoy.departed=true; convoy.sub='離脱点へ航行中';
    const pts=C.route.map(r=>new THREE.Vector3(r.pos[0],r.alt||0,r.pos[1]));
    order(convoy,{type:'move',via:pts.slice(0,-1),dest:pts[pts.length-1]}); }
  if(convoy.alive&&convoy.departed&&!convoy.order){ convoy.escaped=true; convoy.alive=false; convoy.el.remove(); dropArrow(convoy.arrow); convoy.arrow=null;
    logEvent('輸送船団 離脱',`輸送船${convoy.ships.length}隻が離脱点を越えた。`); }
  const lost=convoy.n-(convoy.alive||convoy.escaped?convoy.ships.length:0);
  if(lost>=(op.win&&op.win.lose||convoy.n)) end(false);
  else if(convoy.escaped) end(true);
}

let aiTimer=0;
/* guard fleets answer only foes near their post; hunt fleets chase any foe in sight and otherwise wait at their watch point */
function enemyAI(){
  const foes=fleets.filter(f=>f.team===0&&f.alive&&f.seen);
  for(const f of fleets){
    if(f.team!==1||!f.alive) continue;
    let threat=null,bd=f.ai==='hunt'?1e9:f.leash;
    for(const p of foes){ const d=p.pos.distanceTo(f.post); if(d<bd){bd=d;threat=p;} }
    if(threat){ if(!(f.order&&f.order.target===threat)) order(f,{type:'attack',target:threat}); }
    else if(f.ai==='hunt'){ const w=f.watchPos||f.post; if(f.pos.distanceTo(w)>2&&(!f.order||f.order.type!=='move')) f.order={type:'move',dest:w.clone()}; }
    else if(!f.order||f.order.type!=='move'){ if(f.pos.distanceTo(f.post)>2){ f.order={type:'move',dest:f.post.clone()}; } else f.order=null; }
  }
}

function step(dt){
  gameSec+=dt;
  /* timed events, `after` minutes into the operation clock: an enemy fleet arrives, a message, a change of phase, an explosion */
  while(nextEvent<opEvents.length&&gameSec*CLOCK_RATE>=opEvents[nextEvent].after){ const E=opEvents[nextEvent++];
    if(E.fleet){ const r=makeFleet(1,{leash:0,...E.fleet}); fleets.push(r);
      if(E.arrow) makeArrow(r.pos,new THREE.Vector3(E.arrow.pos[0],E.arrow.alt||0,E.arrow.pos[1]),TEAM_COL[1],{life:6}); }
    if(E.blast){ const p=new THREE.Vector3(E.blast[0],E.blast[2]||0,E.blast[1]); for(let i=0;i<6;i++) burst(p.clone().add(new THREE.Vector3((Math.random()-.5)*8,(Math.random()-.5)*6,(Math.random()-.5)*8)),HOT,30,10,1.4); }
    if(E.phase) setPhase(E.phase);
    if(E.log) logEvent(...E.log);
  }
  stepConvoy();
  for(const u of units()) if(u.revealT>0) u.revealT-=dt;
  fogTimer-=dt; if(fogTimer<=0){fogTimer=.25; updateFog();}
  aiTimer-=dt; if(aiTimer<=0){aiTimer=.5; enemyAI();}
  stepWings(dt);
  for(const f of fleets){
    if(!f.alive) continue;
    if(f.hangars.length&&(f.stance!=='evade'||f.order&&f.order.type==='attack')) launchCheck(f);
    f.retarget-=dt; if(f.retarget<=0){ f.retarget=.4; f.fireTarget=fireTargetOf(f); }
    let goal=null, moving=false;
    if(f.order){
      if(f.order.type==='move'){ moving=true; if(followPath(f,dt)){ f.order=null; if(f.arrow){ dropArrow(f.arrow); f.arrow=null; } nextOrder(f); } }
      else { const t=f.order.target; if(!t.alive){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
        else if(!t.seen){ if(f.team===0&&t.lastPos) order(f,{type:'move',dest:t.lastPos.clone()}); else { f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); } }
        else goal=t; }
    }
    if(goal){ const stop=f.range*.75+(goal.radius||0);
      _v.subVectors(goal.pos,f.pos); const d=_v.length();
      if(d>stop){ _v.normalize(); f.pos.addScaledVector(_v,Math.min((f.syncSpeed||f.speed)*dt,d-stop)); f.heading.lerp(_v,Math.min(1,dt*3)).normalize(); }
    }
    const ft=f.fireTarget;
    if(ft&&ft.alive&&ft.seen&&gap(f,ft)<=f.range*1.08){
      if(!goal&&!moving){ _v.subVectors(ft.pos,f.pos).normalize(); f.heading.lerp(_v,Math.min(1,dt*2)).normalize(); }
      damage(ft,f.ships.length*f.dmg*dt,f); f.revealT=FIRE_REVEAL;
      const rate=Math.min(f.ships.length,12)*1.6;
      if(Math.random()<rate*dt) shoot(randShip(f),randShip(ft).clone().add(new THREE.Vector3((Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2)),TEAM_COL[f.team],.28);
      if(Math.random()<rate*dt*.5) shoot(randShip(f),randShip(ft),TEAM_COL[f.team],.22);
    }
  }
  if(fortress.alive){
    fortress.retarget-=dt; if(fortress.retarget<=0){fortress.retarget=.5; fortress.fireTarget=nearestFoe(fortress,fortress.range);}
    const ft=fortress.fireTarget;
    if(ft&&ft.alive&&ft.seen){ damage(ft,fortress.dps*dt,fortress); if(Math.random()<dt*14) shoot(randShip(fortress),randShip(ft),new THREE.Color(1,.55,.3),.35); }
  }
}
