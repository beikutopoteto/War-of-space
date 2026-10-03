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
/* plasma clouds: a unit inside one sees half as far, and is seen from half as far (both inside: a quarter).
   D-RAMS ram assist in the dense plasma: a fleet inside moves a little faster (仮) */
const CLOUD_SIGHT=.5, CLOUD_SPEED=1.1;
/* an observer outside the clouds cannot keep its eyes on a unit inside one for long: after CLOUD_HOLD seconds it loses it,
   and for CLOUD_BLIND seconds it cannot pick out anything inside a cloud (仮). So hiding in a cloud shakes off a scout */
const CLOUD_HOLD=6, CLOUD_BLIND=15;
/* whether o can see t now: within its sight (clouds halve it), and not lost in a cloud it has watched too long */
function canSee(o,t){ if(t.inCloud&&!o.inCloud&&o.blindT>gameSec) return false;
  return o.pos.distanceTo(t.pos)<=sightOf(o)*concealOf(t)*(o.inCloud?CLOUD_SIGHT:1)*(t.inCloud?CLOUD_SIGHT:1); }
function inCloud(u){ for(const c of clouds) if(u.pos.distanceTo(c.c)<c.r) return true; return false; }
function shown(u){ return u.team===0||u.seen; }
let fogTimer=0; const FOG_DT=.25;
function updateFog(){
  const all=units();
  if(clouds.length) for(const u of all) u.inCloud=u.alive&&u.kind!=='fortress'&&inCloud(u);
  let spotted=null;
  for(const t of all){ if(!t.alive) continue;
    let by=null;
    if(t.kind==='fortress'||t.revealT>0) by=t;
    else for(const o of all){ if(!o.alive||o.team===t.team||!canSee(o,t)) continue;
      /* every observer watching a unit inside a cloud tires of it (CLOUD_HOLD); one in the open is simply seen */
      if(t.inCloud&&!o.inCloud){ if(gameSec-(o.holdT??-1e9)>1) o.cloudHold=0; o.holdT=gameSec;
        if((o.cloudHold+=FOG_DT)>CLOUD_HOLD){ o.cloudHold=0; o.blindT=gameSec+CLOUD_BLIND; continue; }
        by=by||o; continue; }
      by=o; break; }
    const was=t.seen; t.seen=!!by;
    if(was&&!t.seen){ t.lastPos=t.pos.clone(); t.lostAt=gameSec; }
    if(t.seen&&!t.everSeen){ t.everSeen=true;
      if(t.team===1&&gameSec>0&&by!==t) logEvent(`${t.name} 発見`,`${by.name}が${t.name}（${t.ships.length}隻）を捕捉。`); }
    if(t.team===0&&t.seen&&t.kind==='fleet'&&!t.rescue&&!spotted) spotted=t;
  }
  /* the enemy has eyes on one of ours: its main force heads there (enemyAI). Losing every contact shakes them off */
  if(spotted){ lastSpot={pos:spotted.pos.clone(),t:gameSec,unit:spotted}; spotEarly(); }
  if(!!spotted!==spotNow&&gameSec>0){ spotNow=!!spotted;
    const L=spotNow?op.spotLog:lastSpot&&op.shakeLog; if(L&&gameSec-spotLogT>12){ spotLogT=gameSec; logEvent(...L); } }
}
/* an event with onSpot {min, delay} (minutes) comes early once the enemy has seen one of ours: delay after that, but not before min */
function spotEarly(){
  let moved=false; const now=gameSec*CLOCK_RATE;
  for(let i=nextEvent;i<opEvents.length;i++){ const E=opEvents[i]; if(!E.onSpot||E.early) continue;
    E.early=true; const at=Math.max(E.onSpot.min||0,now+(E.onSpot.delay||0)); if(at<E.after){ E.after=at; moved=true; } }
  if(moved){ const rest=opEvents.splice(nextEvent).sort((a,b)=>a.after-b.after); opEvents.push(...rest); }
}
function nearestFoe(f,maxD,ok){ let best=null,bd=maxD; for(const u of units()){ if(!u.alive||u.team===f.team||!u.seen||ok&&!ok(u)) continue; const d=gap(f,u); if(d<bd){bd=d;best=u;} } return best; }
function randShip(u){ if(u.kind==='fortress'){ const a=Math.random()*Math.PI*2; return new THREE.Vector3(Math.cos(a)*10,3+Math.random()*4,Math.sin(a)*9); } return u.ships.length?u.ships[(Math.random()*u.ships.length)|0].pos:u.pos; }

function damage(t,amt,src){
  if(!t.alive) return;
  if(t.eva) amt*=1-t.eva;
  /* ship and fortress guns against small craft: their anti-air aim (data/ships.js WOS_DATA.aa) */
  if(t.kind==='wing'&&src.kind!=='wing') amt*=AA.per*(src.aa??AA.std);
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
  unselect(f);
  logEvent(`${f.name} 全滅`, f.convoy?'輸送船団が全滅した。':f.rescue?`${src.name}の攻撃で${f.name}が沈んだ。`:f.team===0?`${src.name}の攻撃で${f.name}が失われた。残る艦隊で戦線を立て直せ。`:`${src.name}が${f.name}を撃破。${TEAM_NAME[1]}の防空網に穴が開いた。`);
  if(f.rescue&&rescue){ rescue.lost=true; if(op.rescue.lostLog) logEvent(...op.rescue.lostLog); }
  if(!fleets.some(x=>x.team===0&&x.alive&&!x.ward)) end(false);
  updateRoster();
}
let outcome=null;
/* the end of the battle. quit: the player gave up from the in-battle menu; a defeat with no closing scene */
function end(win,quit=false){
  if(over) return; over=true; outcome=win; setPhase('戦闘終結');
  const left=fleets.filter(f=>f.team===0&&f.alive).reduce((s,f)=>s+f.ships.length,0);
  document.getElementById('rh').textContent=win?'勝利':'敗北';
  const R=op.result, tail=convoy?`輸送船 ${convoy.escaped?convoy.ships.length:0}/${convoy.n}隻が離脱。`:`残存艦 ${left}隻。`;
  document.getElementById('rp').textContent=win?`${clockStr()}、${R.win}${tail}`:quit?`${clockStr()}、作戦を中止した。`:`${clockStr()}、${R.lose}`;
  /* the menu records the progress and the reward (prep.js) and tells what was gained */
  if(window.WOS_MENU&&WOS_MENU.onEnd) document.getElementById('rp').textContent+=WOS_MENU.onEnd(op.id,win);
  if(quit){ logEvent('作戦中止','指揮官の判断で作戦を中止した。'); document.getElementById('result').hidden=false; return; }
  if(!win&&R.loseBlast) blast(R.loseBlast);
  logEvent(...(win?R.winLog:R.loseLog));
  /* the operation's closing conversation, then the result */
  /* a line may carry a condition: 'rescued' / '!rescued' (the distress call was answered or not) */
  const talk=op.talk&&(win?op.talk.win:op.talk.lose), flags={rescued};
  const lines=(talk||[]).filter(l=>!l[2]||(l[2][0]==='!'?!flags[l[2].slice(1)]:flags[l[2]]));
  setTimeout(()=>startTalk(lines,()=>{document.getElementById('result').hidden=false;}),1600);
}

/* small craft (both sides) and a hostile fortress: they never pick the fortress itself on their own, and they keep to the side
   of its guns (its range plus FORT_MARGIN) their carrier is on: a carrier outside sends them only at foes outside, a carrier
   inside only at foes inside. The target their carrier was last ordered to attack overrides this and comes first; it holds
   through later move orders (a carrier shifting its position in range) until it falls or another attack is ordered. */
const FORT_MARGIN=6;
function underGuns(t,team){ return fortress.alive&&fortress.team!==team&&(t===fortress||t.pos.distanceTo(fortress.pos)<=fortress.range+FORT_MARGIN); }
function orderedTarget(u){ const c=u.carrier||u; if(!c.alive) return null; if(c.order&&c.order.type==='attack') return c.order.target; return c.strike&&c.strike.alive?c.strike:null; }
function craftMayHit(u,t){ if(t===orderedTarget(u)) return true; if(t===fortress) return false;
  const c=u.carrier&&u.carrier.alive?u.carrier:u; return underGuns(t,u.team)===underGuns(c,u.team); }
/* craft against craft: the enemy craft within reach that is closest to their own carrier. So the craft meet the enemy's
   in between and fight there (the front line), and when enemy craft press in toward the carrier the line falls back with them */
function enemyCraft(u,maxD){
  const c=u.carrier&&u.carrier.alive?u.carrier:u; let best=null,bd=1e9;
  for(const x of wings){ if(!x.alive||x.team===u.team||!x.seen||gap(u,x)>=maxD||!craftMayHit(u,x)) continue;
    const d=x.pos.distanceTo(c.pos); if(d<bd){bd=d;best=x;} }
  return best;
}
/* the ordered target comes first; a carrier set to 命令優先 sends its craft at nothing else. Then enemy craft; then enemy W.A.S.
   go for the transports when they are within reach; otherwise the nearest foe */
function craftTarget(u,type,maxD){
  const o=orderedTarget(u); if(o&&o.alive&&o.seen&&gap(u,o)<maxD) return o;
  if((u.carrier||u).stance==='evade') return null;
  const ec=enemyCraft(u,maxD); if(ec) return ec;
  if(u.team===1&&type==='was'&&convoy&&convoy.alive&&convoy.seen&&gap(u,convoy)<maxD&&craftMayHit(u,convoy)) return convoy;
  return nearestFoe(u,maxD,t=>craftMayHit(u,t));
}
let enemyWASSeen=false;
/* launch: when a spotted enemy comes within reach, docked squadrons sortie one at a time (cooldown cd), up to maxOut (h.out) at once */
function launchCheck(f){
  for(const h of f.hangars){ const W=WING[h.type], C=f.craft&&f.craft[h.type]||{};   /* C: research of the player's own fleets (prep.js) */
    if(gameSec<h.next) continue;
    const sq=h.squads.find(q=>q.state==='docked'&&q.n>0&&gameSec>=q.ready); if(!sq) continue;
    const tgt=craftTarget(f,h.type,h.launchR); if(!tgt) continue;
    h.next=gameSec+W.cd*h.slow; sq.state='out';
    const w={kind:'wing',team:f.team,id:fid++,type:h.type,W,launchR:h.launchR,carrier:f,hangar:h,squad:sq,name:`${f.name}${W.name}隊`,
      pos:f.pos.clone(),heading:f.heading.clone(),n:sq.n,launched:sq.n,hp:W.hp*(C.hp??1),hpPool:sq.n*W.hp*(C.hp??1),eva:W.eva*(C.eva??1),dmg:W.dmg*(C.dmg??1),range:W.range,
      vis:W.vis,stl:W.stl,fuel:W.fuel,target:tgt,state:'attack',alive:true,seen:f.seen,everSeen:true,revealT:0,retarget:0,fireTarget:null,radius:0,ships:[]};
    const R=Math.sqrt(sq.n)*.55;
    for(let i=0;i<sq.n;i++){ const a=Math.random()*Math.PI*2,r=R*Math.sqrt(Math.random());
      const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*1.6,Math.sin(a)*r); w.ships.push({off,pos:f.pos.clone(),wob:Math.random()*6}); }
    sq.wing=w; wings.push(w);
    if(f.team===1&&h.type==='was'&&!enemyWASSeen&&op.onEnemyWAS){ enemyWASSeen=true; logEvent(...op.onEnemyWAS); }
    if(f.team===0&&!h.announced){ h.announced=true;
      logEvent(`${f.name} ${W.name}発進`,`${tgt.name}を捉え、${W.name}${sq.n}機が発進。最大${h.out}隊まで順に出撃し、燃料が尽きると母艦へ戻る。`); }
  }
}
/* back aboard: half of this sortie's losses are made up from the reserve, then the squadron rearms */
function dock(w){
  const h=w.hangar, q=w.squad, rec=Math.min(Math.ceil((w.launched-w.n)/2),h.reserve);
  h.reserve-=rec; q.n=w.n+rec; q.state='docked'; q.ready=gameSec+w.W.rearm*h.slow; q.wing=null; w.alive=false;
}
/* fighters pin what they attack: a fleet under fighter fire moves at half speed (SLOW_BY) for a moment */
const SLOW_BY=.5, KITE_MARGIN=6;
function speedOf(f){ return (f.syncSpeed||f.speed)*(f.slowT>0?SLOW_BY:1)*(f.inCloud?CLOUD_SPEED:1); }
/* a fleet of carriers only keeps its distance: when a seen enemy fleet comes within its own range plus KITE_MARGIN,
   the carriers back away from it (facing the same way) instead of closing. Returns true while backing away */
function kite(f,dt){
  _v.set(0,0,0); let n=0;
  for(const e of fleets){ if(e.team===f.team||!e.alive||!e.seen) continue;
    const d=f.pos.distanceTo(e.pos); if(d>e.range+KITE_MARGIN) continue;
    _v.add(_w.subVectors(f.pos,e.pos).multiplyScalar(1/Math.max(d,1))); n++; }
  if(!n||_v.lengthSq()<1e-6) return false;
  _v.normalize(); f.pos.addScaledVector(_v,speedOf(f)*dt);
  keepInField(f);   // stay on the map
  return true;
}
function stepWings(dt){
  for(const w of wings){ if(!w.alive) continue;
    const c=w.carrier;
    if(w.state==='attack'){
      w.fuel-=dt;
      const o=orderedTarget(w); if(o&&o!==w.target&&o.alive&&o.seen&&gap(w,o)<w.launchR) w.target=o;   // a new attack order turns them at once
      else if(!(o&&w.target===o)&&c.stance!=='evade'&&w.target){ const ec=enemyCraft(w,w.launchR);   // enemy craft come first; the one pressing nearest the carrier
        if(ec&&ec!==w.target&&(w.target.kind!=='wing'||ec.pos.distanceTo(c.pos)<w.target.pos.distanceTo(c.pos)-10)) w.target=ec; }
      if(!w.target||!w.target.alive||!w.target.seen||!craftMayHit(w,w.target)) w.target=craftTarget(w,w.type,w.launchR*.6)||(c.alive?craftTarget(c,w.type,w.launchR):null);
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
      damage(ft,w.n*w.dmg*dt,w); w.revealT=FIRE_REVEAL; if(w.type==='ftr'&&ft.kind==='fleet') ft.slowT=.5;
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
  const p=o.path; p.s=Math.min(p.L,p.s+speedOf(f)*dt);
  const u=p.s/p.L; f.pos.copy(p.curve.getPointAt(u));
  _v.copy(p.curve.getTangentAt(Math.min(u,.999))); if(_v.lengthSq()>1e-6){ f.heading.lerp(_v.normalize(),Math.min(1,dt*3)).normalize(); turnMarch(f,_v,dt); }
  return p.s>=p.L;
}
/* the march turns smoothly toward the way the fleet moves (level only, so a formation does not tilt) */
const _mv2=new THREE.Vector3();
function turnMarch(f,dir,dt){ _mv2.set(dir.x,0,dir.z); if(_mv2.lengthSq()<1e-4) return; f.march.lerp(_mv2.normalize(),Math.min(1,dt*1.5)); f.march.y=0; if(f.march.lengthSq()<1e-6) f.march.copy(_mv2); f.march.normalize(); }
/* engagement: the foe a fleet was ordered to attack comes first while it is in range, then the nearest foe.
   A fleet set to 命令優先 (evade) holds fire and keeps its craft aboard; it only fires on the target of its current attack order */
function fireTargetOf(f){
  const inRange=t=>t&&t.alive&&t.seen&&gap(f,t)<=f.range?t:null;
  if(f.stance!=='evade') return inRange(orderedTarget(f))||nearestFoe(f,f.range);
  return inRange(f.order&&f.order.type==='attack'?f.order.target:null);
}

/* a large explosion at [x, z, alt] (operation data) */
function blast(at){ const p=new THREE.Vector3(at[0],at[2]||0,at[1]); for(let i=0;i<6;i++) burst(p.clone().add(new THREE.Vector3((Math.random()-.5)*8,(Math.random()-.5)*6,(Math.random()-.5)*8)),HOT,30,10,1.4); }
/* escort operations: the convoy boards until `depart` (operation minutes), then follows its route to the departure point.
   It wins when the convoy gets through with fewer than `lose` transports lost, and loses when that many are gone */
function stepConvoy(){
  if(!convoy||over) return;
  const C=op.convoy;
  if(convoy.alive&&!convoy.departed&&gameSec*CLOCK_RATE>=C.depart) departConvoy();
  if(convoy.alive&&convoy.departed&&!convoy.order){ convoy.escaped=true; convoy.alive=false; convoy.el.remove(); dropArrow(convoy.arrow); convoy.arrow=null;
    logEvent('輸送船団 離脱',`輸送船${convoy.ships.length}隻が離脱点を越えた。`); }
  const lost=convoy.n-(convoy.alive||convoy.escaped?convoy.ships.length:0);
  if(lost>=(op.win&&op.win.lose||convoy.n)) end(false);
  else if(convoy.escaped) end(true);
}

function departConvoy(){
  const C=op.convoy; convoy.departed=true; convoy.sub=C.sailSub||'離脱点へ航行中';
  const pts=C.route.map(r=>new THREE.Vector3(r.pos[0],r.alt||0,r.pos[1]));
  order(convoy,{type:'move',via:pts.slice(0,-1),dest:pts[pts.length-1]});
}
/* the field moves with the convoy (op.field:'convoy'): its centre follows the transports, the camera goes along,
   and our fleets cannot leave it (one caught by the rear edge is pushed along) */
function keepInField(f){
  const dx=f.pos.x-fieldC.x, dz=f.pos.z-fieldC.z, r=Math.hypot(dx,dz);
  if(r>FIELD_R){ f.pos.x=fieldC.x+dx*FIELD_R/r; f.pos.z=fieldC.z+dz*FIELD_R/r; }
}
const _fd=new THREE.Vector3();
function stepField(){
  if(!fieldMoves||!convoy.alive) return;
  _fd.set(convoy.pos.x-fieldC.x,0,convoy.pos.z-fieldC.z); if(_fd.lengthSq()<1e-8) return;
  fieldC.add(_fd); shiftView(_fd);
  for(const f of fleets) if(f.alive&&f.team===0&&!f.ward) keepInField(f);
}
/* the optional distress call (op.rescue): a disabled ship appears beside the route at `after` minutes. It cannot move;
   one of our fleets staying within `reach` of it for `need` seconds takes its people aboard. It is lost if it is sunk
   or falls behind out of the field */
function stepRescue(dt){
  const R=op.rescue; if(!R||over) return;
  if(!rescue){ if(gameSec*CLOCK_RATE<R.after) return;
    const [x,z]=relPos(R.pos), ship=makeFleet(0,{dmg:0,range:0,eva:0,speed:0,...R.fleet,pos:[x,z]});
    ship.ward=ship.rescue=true; fleets.push(ship); rescue={ship,prog:0,done:false,lost:false};
    if(R.lure){ const s=fleets.find(f=>f.team===1&&f.alive&&f.name===R.lure); if(s) s.lurePos=ship.pos.clone(); }
    if(R.log) logEvent(...R.log); return; }
  const s=rescue.ship; if(rescue.done||rescue.lost||!s.alive) return;
  if(fleets.some(f=>f.alive&&f.team===0&&!f.ward&&gap(f,s)<=R.reach)) rescue.prog+=dt;
  s.sub=`${R.sub||'救難信号'}　救助 ${Math.floor(100*Math.min(1,rescue.prog/R.need))}%`;
  if(rescue.prog>=R.need){ rescue.done=rescued=true; s.alive=false; s.el.remove(); burst(s.pos,TEAM_COL[0],12,5,.8); if(R.doneLog) logEvent(...R.doneLog); }
  else if(Math.hypot(s.pos.x-fieldC.x,s.pos.z-fieldC.z)>FIELD_R+10){ rescue.lost=true; s.alive=false; s.el.remove(); if(R.lostLog) logEvent(...R.lostLog); }
}

/* the fortress sends out its defenders as its armour falls (op.fortress.sortie): those fleets leave their posts and hunt.
   With every, one fleet goes every `every` seconds, the one nearest our fleets first */
function stepSorties(){
  if(!fortress.alive||!fortress.sortie) return;
  const pct=fortress.hpPool/fortress.max;
  for(const s of fortress.sortie){
    if(!s.started){ if(pct>=s.below) continue; s.started=true; s.left=fleets.filter(f=>f.team===1&&f.alive&&s.fleets.includes(f.name)); s.next=gameSec; if(s.log) logEvent(...s.log); }
    while(s.left.length&&gameSec>=s.next){
      const ours=fleets.filter(f=>f.team===0&&f.alive&&!f.convoy), near=f=>Math.min(1e9,...ours.map(o=>o.pos.distanceTo(f.pos)));
      s.left=s.left.filter(f=>f.alive).sort((a,b)=>near(a)-near(b)); const f=s.left.shift(); if(!f) break;
      f.ai='hunt'; f.leash=1e9; f.watchPos=fortress.pos.clone();
      if(s.every){ s.next=gameSec+s.every; logEvent(`${f.name} 迎撃`,`${f.name}が持ち場を離れ、こちらへ向かってくる。`); }
    }
  }
}
let aiTimer=0;
/* guard fleets answer only foes near their post; hunt fleets chase any foe in sight and otherwise wait at their watch point */
const SCOUT_KEEP=.7;
function nearestOf(f,list){ let b=null,bd=1e9; for(const p of list){ const d=p.pos.distanceTo(f.pos); if(d<bd){bd=d;b=p;} } return b; }
function moveTo(f,x,y,z){ if(f.order&&f.order.type==='move'&&f.order.dest.distanceTo(_w.set(x,y,z))<4) return; f.order={type:'move',dest:new THREE.Vector3(x,y,z)}; }
/* scout: never fights. It keeps watch on what it has found from a distance, and otherwise patrols points
   around the moving field (patrol: [[x,z],…] relative to the field centre, at its watch alt), or makes for a lure */
function scoutAI(f,foes){
  const t=nearestOf(f,foes.filter(x=>canSee(f,x)));   // only what it sees itself
  if(t){ const keep=sightOf(f)*concealOf(t)*SCOUT_KEEP*(f.inCloud?CLOUD_SIGHT:1)*(t.inCloud?CLOUD_SIGHT:1);
    _v.subVectors(f.pos,t.pos); if(_v.lengthSq()<1e-6) _v.set(0,0,-1); _v.setLength(keep).add(t.pos);
    moveTo(f,_v.x,_v.y,_v.z); return; }
  if(f.lurePos){ if(f.pos.distanceTo(f.lurePos)>6) moveTo(f,f.lurePos.x,f.lurePos.y,f.lurePos.z); return; }
  const P=f.patrol||[[0,-100]]; f.pi=(f.pi||0)%P.length;
  const [x,z]=relPos(P[f.pi]), y=f.watch&&f.watch.alt||0;
  if(Math.hypot(f.pos.x-x,f.pos.z-z)<8) f.pi++; else moveTo(f,x,y,z);
}
/* pursuer: attacks what the enemy can see; otherwise goes to where one of ours was last seen, then searches the clouds
   ahead along the lane, nearest first */
function pursueAI(f,foes){
  const t=nearestOf(f,foes);
  if(t){ if(!(f.order&&f.order.target===t)) order(f,{type:'attack',target:t}); return; }
  if(lastSpot&&f.spotDone!==lastSpot.t){ const p=lastSpot.pos;
    if(f.pos.distanceTo(p)<8) f.spotDone=lastSpot.t; else { moveTo(f,p.x,p.y,p.z); return; } }
  if(!f.searched) f.searched=new Set();
  let c=null,bd=1e9; for(const k of clouds){ if(f.searched.has(k)||k.c.z<f.pos.z-k.r) continue; const d=k.c.distanceTo(f.pos); if(d<bd){bd=d;c=k;} }
  if(!c){ moveTo(f,fieldC.x,f.pos.y,fieldC.z); return; }
  if(bd<c.r*.5) f.searched.add(c); else moveTo(f,c.c.x,c.c.y,c.c.z);
}
function enemyAI(){
  const foes=fleets.filter(f=>f.team===0&&f.alive&&f.seen);
  for(const f of fleets){
    if(f.team!==1||!f.alive) continue;
    if(f.ai==='scout'){ scoutAI(f,foes); continue; }
    if(f.ai==='pursue'){ pursueAI(f,foes); continue; }
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
    /* rel: the fleet's pos and its arrow are relative to the field centre (a field that moves with the convoy) */
    if(E.fleet){ const r=makeFleet(1,{leash:0,...E.fleet,...(E.rel?{pos:relPos(E.fleet.pos)}:{})}); fleets.push(r);
      if(E.arrow){ const [ax,az]=E.rel?relPos(E.arrow.pos):E.arrow.pos; makeArrow(r.pos,new THREE.Vector3(ax,E.arrow.alt||0,az),TEAM_COL[1],{life:6}); } }
    if(E.blast) blast(E.blast);
    if(E.phase) setPhase(E.phase);
    if(E.log) logEvent(...E.log);
  }
  stepConvoy(); stepRescue(dt);
  for(const u of units()) if(u.revealT>0) u.revealT-=dt;
  fogTimer-=dt; if(fogTimer<=0){fogTimer=FOG_DT; updateFog();}
  aiTimer-=dt; if(aiTimer<=0){aiTimer=.5; enemyAI();}
  stepWings(dt);
  if(fortress.alive&&fortress.hangars&&fortress.hangars.length) launchCheck(fortress);
  stepSorties();
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
    if(f.slowT>0) f.slowT-=dt;
    const kited=f.carrierOnly&&!moving&&kite(f,dt);
    /* an attack closes until the target is well inside the guns (75% of range); a fleet of carriers only stops sooner,
       once the target is inside 80% (1:4 from the edge) of its shortest launch distance */
    if(goal){ const stop=(f.carrierOnly?f.launchMin*.8:f.range*.75)+(goal.radius||0);
      _v.subVectors(goal.pos,f.pos); const d=_v.length();
      if(d>stop&&!kited){ _v.normalize(); f.pos.addScaledVector(_v,Math.min(speedOf(f)*dt,d-stop)); f.heading.lerp(_v,Math.min(1,dt*3)).normalize(); turnMarch(f,_v,dt); }
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
  stepField();   // after the convoy has moved this step
  if(fortress.alive){
    fortress.retarget-=dt; if(fortress.retarget<=0){fortress.retarget=.5; fortress.fireTarget=nearestFoe(fortress,fortress.range);}
    const ft=fortress.fireTarget;
    if(ft&&ft.alive&&ft.seen){ damage(ft,fortress.dps*dt,fortress); if(Math.random()<dt*14) shoot(randShip(fortress),randShip(ft),new THREE.Color(1,.55,.3),.35); }
  }
}
