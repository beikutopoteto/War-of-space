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
    const want=Math.max(0,Math.ceil(t.hpPool/t.hp));
    while(t.ships.length>want){ const s=t.ships.pop(); burst(s.pos,TEAM_COL[t.team],16,7,.9); }
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
  logEvent(`${f.name} 全滅`, f.team===0?`${src.name}の攻撃で${f.name}が失われた。残る艦隊で戦線を立て直せ。`:`${src.name}が${f.name}を撃破。${TEAM_NAME[1]}の防空網に穴が開いた。`);
  if(!fleets.some(x=>x.team===0&&x.alive)) end(false);
  updateRoster();
}
function end(win){
  if(over) return; over=true; setPhase('戦闘終結');
  const left=fleets.filter(f=>f.team===0&&f.alive).reduce((s,f)=>s+f.ships.length,0);
  document.getElementById('rh').textContent=win?'勝利':'敗北';
  const R=op.result;
  document.getElementById('rp').textContent=win?`${clockStr()}、${R.win}残存艦 ${left}隻。`:`${clockStr()}、${R.lose}`;
  logEvent(...(win?R.winLog:R.loseLog));
  setTimeout(()=>{document.getElementById('result').hidden=false;},1600);
}

/* launch: when a spotted enemy comes within reach, docked squadrons sortie one at a time (cooldown cd), up to maxOut at once */
function launchCheck(f){
  for(const h of f.hangars){ const W=WING[h.type];
    if(gameSec<h.next) continue;
    const sq=h.squads.find(q=>q.state==='docked'&&q.n>0&&gameSec>=q.ready); if(!sq) continue;
    const tgt=nearestFoe(f,W.launchR); if(!tgt) continue;
    h.next=gameSec+W.cd; sq.state='out';
    const w={kind:'wing',team:f.team,id:fid++,type:h.type,W,carrier:f,hangar:h,squad:sq,name:`${f.name}${W.name}隊`,
      pos:f.pos.clone(),heading:f.heading.clone(),n:sq.n,launched:sq.n,hp:W.hp,hpPool:sq.n*W.hp,eva:W.eva,dmg:W.dmg,range:W.range,
      vis:W.vis,stl:W.stl,fuel:W.fuel,target:tgt,state:'attack',alive:true,seen:f.seen,everSeen:true,revealT:0,retarget:0,fireTarget:null,radius:0,ships:[]};
    const R=Math.sqrt(sq.n)*.55;
    for(let i=0;i<sq.n;i++){ const a=Math.random()*Math.PI*2,r=R*Math.sqrt(Math.random());
      const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*1.6,Math.sin(a)*r); w.ships.push({off,pos:f.pos.clone(),wob:Math.random()*6}); }
    sq.wing=w; wings.push(w);
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
      if(!w.target||!w.target.alive||!w.target.seen) w.target=nearestFoe(w,w.W.launchR*.6)||(c.alive?nearestFoe(c,w.W.launchR):null);
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
    w.retarget-=dt; if(w.retarget<=0){ w.retarget=.4; w.fireTarget=nearestFoe(w,w.range); }
    const ft=w.fireTarget;
    if(ft&&ft.alive&&ft.seen&&gap(w,ft)<=w.range*1.08){
      damage(ft,w.n*w.dmg*dt,w); w.revealT=FIRE_REVEAL;
      if(Math.random()<Math.min(w.n,10)*1.4*dt) shoot(randShip(w),randShip(ft),TEAM_COL[w.team],.18);
    }
  }
  wings=wings.filter(w=>w.alive);
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
  /* reinforcements arrive in order, `after` minutes into the operation clock */
  const rf=op.reinforcements||[];
  while(nextReinf<rf.length&&gameSec*CLOCK_RATE>=rf[nextReinf].after){ const R=rf[nextReinf++];
    const r=makeFleet(1,{leash:0,...R.fleet}); fleets.push(r);
    if(R.arrow) makeArrow(r.pos,new THREE.Vector3(R.arrow.pos[0],R.arrow.alt||0,R.arrow.pos[1]),TEAM_COL[1],{life:6});
    if(R.log) logEvent(...R.log);
  }
  for(const u of units()) if(u.revealT>0) u.revealT-=dt;
  fogTimer-=dt; if(fogTimer<=0){fogTimer=.25; updateFog();}
  aiTimer-=dt; if(aiTimer<=0){aiTimer=.5; enemyAI();}
  stepWings(dt);
  for(const f of fleets){
    if(!f.alive) continue;
    if(f.hangars.length) launchCheck(f);
    f.retarget-=dt; if(f.retarget<=0){ f.retarget=.4; f.fireTarget=nearestFoe(f,f.range); }
    let goal=null, stop=.6;
    if(f.order){
      if(f.order.type==='move') goal=f.order.dest;
      else { const t=f.order.target; if(!t.alive){ f.order=null; }
        else if(!t.seen){ if(f.team===0&&t.lastPos) order(f,{type:'move',dest:t.lastPos.clone()}); else { f.order=null; dropArrow(f.arrow); f.arrow=null; } if(f.order) goal=f.order.dest; }
        else { goal=t.pos; stop=f.range*.75+(t.radius||0); } }
    }
    if(goal){
      _v.subVectors(goal,f.pos); const d=_v.length();
      if(d>stop){ _v.normalize(); f.pos.addScaledVector(_v,Math.min((f.syncSpeed||f.speed)*dt,d-stop)); f.heading.lerp(_v,Math.min(1,dt*3)).normalize(); }
      else if(f.order.type==='move'){ f.order=null; if(f.arrow){ dropArrow(f.arrow); f.arrow=null; } }
    }
    const ft=f.fireTarget;
    if(ft&&ft.alive&&ft.seen&&gap(f,ft)<=f.range*1.08){
      if(!goal){ _v.subVectors(ft.pos,f.pos).normalize(); f.heading.lerp(_v,Math.min(1,dt*2)).normalize(); }
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
