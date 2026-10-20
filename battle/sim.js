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
  const d=o.pos.distanceTo(t.pos); if(debris.length&&d>DEBRIS_NEAR&&debrisBlocks(o.pos,t.pos)) return false;
  if(bodyBlocks(o.pos,t.pos)) return false;
  return d<=sightOf(o)*concealOf(t)*(o.inCloud?CLOUD_SIGHT:1)*(t.inCloud?CLOUD_SIGHT:1); }
/* mining debris (op.debris, 第4節; user decision 2026-10-09): no line of sight passes through a debris cloud, however close the two
   are, unless they are within DEBRIS_NEAR of each other. A fleet inside moves at DEBRIS_SPEED (仮). The test is in space:
   the sight line between the two against each cloud's sphere */
const DEBRIS_NEAR=20, DEBRIS_SPEED=.75;
const _sg=new THREE.Line3(), _sp=new THREE.Vector3();
function debrisBlocks(p,q){ _sg.set(p,q); for(const c of debris){ _sg.closestPointToPoint(c.c,true,_sp); if(_sp.distanceTo(c.c)<c.r) return true; } return false; }
/* the body in the middle (op.body, 第4節 Denali) stops sight and fire (user decision 2026-10-10): the line between the two passes inside
   its surface. An end on the surface (a battery, a habitat block) does not count, only a pass through the rock. The surface is taken
   a little inside (BODY_LOS) so a shot grazing the rough rock is not stopped */
const BODY_LOS=.92, BODY_OUT=1.35;
function bodyBlocks(p,q){ if(!op.body) return false; _sg.set(p,q); const t=_sg.closestPointToPointParameter(bodyC,true);
  if(t<=.02||t>=.98) return false; _sg.at(t,_sp); const d=_sp.distanceTo(bodyC); return d<op.body.r*BODY_OUT&&d<bodySurface(_sp,op.body.r)*BODY_LOS; }
function losBlocked(p,q){ return debris.length&&debrisBlocks(p,q)||bodyBlocks(p,q); }
/* a way round the body (2026-10-10, user decision: for every move, ours included): when the straight way from p to q runs into the rock,
   the nearest of three turning points clear of it — out past the side it passes, over the top, under the bottom — with a little chance
   in it so the AI does not always pick the same (key: a fleet's own fixed lean, for a way worked out again every step). Up to two in a row (detours) */
const BODY_CLEAR=7, _up0=new THREE.Vector3(0,1,0);
function detour(p,q,key){ if(!op.body) return null; _sg.set(p,q); const t=_sg.closestPointToPointParameter(bodyC,true); _sg.at(t,_sp);
  const d=_sp.distanceTo(bodyC); if(d>=op.body.r*BODY_OUT||d>=bodySurface(_sp,op.body.r)+BODY_CLEAR*.4) return null;
  const a=new THREE.Vector3().subVectors(q,p); if(a.lengthSq()<1e-6) return null; a.normalize();
  const up=_up0.clone().addScaledVector(a,-a.y); if(up.lengthSq()<1e-4) up.set(1,0,0); up.normalize();
  const cand=[up,up.clone().negate()]; if(d>1) cand.push(_sp.clone().sub(bodyC).normalize());
  let best=null,bc=1e9; for(const n of cand){ const w=n.clone().multiplyScalar(bodySurface(n.clone().add(bodyC),op.body.r)+BODY_CLEAR).add(bodyC);
    w.y=Math.max(2-ALT_MAX,Math.min(ALT_MAX-2,w.y)); if(w.distanceTo(bodyC)<bodySurface(w,op.body.r)+BODY_CLEAR*.5) continue;   // under a body far larger than the field: no way
    const r=key==null?Math.random():(x=>x-Math.floor(x))(Math.sin((key+1)*12.9898+cand.indexOf(n)*78.233)*43758.5453);
    const c=(p.distanceTo(w)+w.distanceTo(q))*(.95+r*.1); if(c<bc){ bc=c; best=w; } }
  return best; }
function detours(p,q,depth=2){ const w=depth>0&&detour(p,q); return w?[...detours(p,w,depth-1),w,...detours(w,q,depth-1)]:[]; }
function inDebris(u){ for(const c of debris) if(u.pos.distanceTo(c.c)<c.r) return true; return false; }
function inCloud(u){ for(const c of clouds) if(u.pos.distanceTo(c.c)<c.r) return true; return false; }
function shown(u){ return u.team===0||u.seen; }
let fogTimer=0; const FOG_DT=.25;
function updateFog(){
  const all=units();
  if(clouds.length) for(const u of all) u.inCloud=u.alive&&u.kind!=='fortress'&&inCloud(u);
  if(debris.length) for(const u of all) u.inDebris=u.alive&&u.kind==='fleet'&&inDebris(u);
  let spotted=null;
  for(const t of all){ if(!t.alive) continue;
    let by=null;
    /* a unit that opens fire gives itself away, but not through the mining debris or the rock */
    if(t.kind==='fortress'||t.revealT>0&&(!debris.length&&!op.body||all.some(o=>o.alive&&o.team!==t.team&&!losBlocked(o.pos,t.pos)))) by=t;
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
function nearestFoe(f,maxD,ok){ let best=null,bd=maxD; for(const u of units()){ if(!u.alive||u.team===f.team||!u.seen||u.ghost||spares(f,u)||ok&&!ok(u)) continue; const d=gap(f,u); if(d<bd&&!(f.kind!=='wing'&&bodyBlocks(f.pos,u.pos))){bd=d;best=u;} } return best; }
/* a fleet with spare:['carrier'] (and its craft) leaves the carrier of the operation alone (第4節 Alvarez's unit, user decision 2026-10-09) */
function spares(f,t){ const c=f.carrier||f; return !!(c.spare&&t.isCarrier&&c.spare.includes('carrier'))||!!(c.letGone&&t.mode==='leave'); }
/* the civilian zones (op.civil): within r of a habitat block. Our guns hitting an enemy ship in one cost lives, an enemy ship sunk in one
   costs more, and the raiders' fire on a block costs lives too (sim.js damage). Over op.civil.cap the operation is lost */
function inZone(u){ const C=op.civil; if(!C) return false; for(const b of blocks) if(u.pos.distanceTo(b.pos)<C.r) return true; return false; }
function civHit(n,ours){ const C=op.civil; if(!C||over||!(n>0)) return; casualties+=n;
  if(ours&&!civFirst){ civFirst=true; if(C.firstLog) logEvent(...C.firstLog); }
  for(const L of C.logs||[]) if(casualties>=L[0]*C.cap&&!civMarks.has(L[0])){ civMarks.add(L[0]); logEvent(L[1],L[2]); }
  if(casualties>C.cap){ loseWhy='civil'; end(false); } }
function randShip(u){ if(u.troop) return u.dots.length?u.dots[(Math.random()*Math.min(u.n,u.dots.length))|0]||u.pos:u.pos;
  if(u.kind==='fortress'){ const a=Math.random()*Math.PI*2; return new THREE.Vector3(Math.cos(a)*10,3+Math.random()*4,Math.sin(a)*9); } return u.ships.length?u.ships[(Math.random()*u.ships.length)|0].pos:u.pos; }

function damage(t,amt,src){
  if(!t.alive) return;
  /* a habitat block under a raider's guns: the people in it (op.civil.perRaid a point of damage) */
  /* a gate's shield (第5節): no evasion, no lives */
  if(t.kind==='gate'){ gateHit(t,amt); return; }
  /* ship fire on the enemy's infantry on the rock (第5節, 2026-10-19): op.base.troops.hp a man (times the hit points multiplier) */
  if(t.troop){ const T=op.base.troops||{}; t.lost+=amt/((T.hp??10)*HP_K); t.n=Math.max(0,t.n0-Math.floor(t.lost)-t.went); if(t.n<=0) t.alive=false; return; }
  if(t.kind==='block'){ civHit(amt*(op.civil.perRaid||2),false); if(Math.random()<amt*.08) burst(t.pos.clone().add(new THREE.Vector3((Math.random()-.5)*8,(Math.random()-.5)*5,(Math.random()-.5)*8)),HOT,10,6,1); return; }
  if(t.eva) amt*=1-t.eva;
  /* ship and fortress guns against small craft: their anti-air aim (data/ships.js WOS_DATA.aa) */
  if(t.kind==='wing'&&src.kind!=='wing') amt*=AA.per*(src.aa??AA.std);
  /* a gun battery on the rock is no one's home: hitting it costs no lives (user decision 2026-10-10) */
  if(op.civil&&src.team===0&&t.team===1&&t.kind==='fleet'&&!t.fixed&&inZone(t)) civHit(amt*(src.kind==='wing'?op.civil.perCraft:op.civil.perDmg)/HP_K,true);   // twice the hit points take twice the fire: the same lives (2026-10-13)
  t.hpPool-=amt;
  const key=Math.min(src.id,t.id)+'-'+Math.max(src.id,t.id), last=engaged.get(key), wingy=t.kind==='wing'||src.kind==='wing';
  if(last===undefined||gameSec-last>40){
    if(last===undefined){
      const a=src.team===0?src:t, b=src.team===0?t:src;
      if(fortress.defend&&(t===fortress||src===fortress)){
        if(t===fortress&&gameSec-(t.hitLogT??-1e9)>20){ t.hitLogT=gameSec; logEvent(`${t.name} 被弾`,`${src.name}が${t.name}を攻撃している。耐久が減るほど避難が遅れる。`); }
      } else if(t.kind==='fortress'||src.kind==='fortress'){
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
  } else if(t.defend){
    /* the station we defend: its armour slows the evacuation (stepDefend); at 0 it falls and the operation is lost */
    const pct=t.hpPool/t.max;
    for(const m of [.75,.5,.3]) if(pct<m&&!fortressMarks.has(m)){ fortressMarks.add(m); logEvent(`${t.name} 耐久 ${m*100}%`,m===.3?'砲台の半分が沈黙した。これ以上撃たれれば、ステーションが落ちる。':'区画で火災が広がっている。避難が遅れ始めた。'); }
    if(Math.random()<amt*.06) burst(randShip(t),HOT,10,6,1);
    if(t.hpPool<=0){ t.alive=false; t.el.remove(); for(let i=0;i<14;i++) burst(randShip(t),HOT,40,14,1.6); end(false); }
  } else {
    const pct=t.hpPool/t.max;
    for(const m of [.75,.5,.25]) if(pct<m&&!fortressMarks.has(m)){ fortressMarks.add(m); logEvent(`要塞装甲 ${m*100}%`,m===.25?'要塞の外殻が崩れ始めた。もう一押しで陥落する。':'要塞表面で誘爆が続いている。砲火はまだ衰えていない。'); }
    if(Math.random()<amt*.06) burst(randShip(t),TEAM_COL[1],10,6,1);
    if(t.hpPool<=0){ t.alive=false; for(let i=0;i<14;i++) burst(randShip(t),HOT,40,14,1.6); startChase(); }
  }
}
function destroyFleet(f,src){
  f.alive=false; f.el.remove(); dropArrow(f.arrow); f.arrow=null;
  burst(f.pos,TEAM_COL[colOf(f)],40,10,1.3);
  unselect(f);
  if(f.team===1&&op.civil&&inZone(f)) civHit(op.civil.perSink,true);   // the wreck falls on the blocks
  logEvent(`${f.name} 全滅`, f.convoy?'輸送船団が全滅した。':f.rescue?`${src.name}の攻撃で${f.name}が沈んだ。`:f.team===0?`${src.name}の攻撃で${f.name}が失われた。残る艦隊で戦線を立て直せ。`:`${src.name}が${f.name}を撃破。${TEAM_NAME[1]}の防空網に穴が開いた。`);
  if(f.rescue&&rescue){ rescue.lost=true; if(op.rescue.lostLog) logEvent(...op.rescue.lostLog); }
  /* 第5節: the first gun on the base lost to the enemy (the escorts go for them, prey:'battery'): say what it means */
  if(f.fixed&&f.team===0&&op.base&&op.base.gunLostLog&&!gunLostSaid){ gunLostSaid=true; logEvent(...op.base.gunLostLog); }
  if(f===opCarrier&&!over){ loseWhy='carrier'; end(false); }
  /* every fleet of ours lost (the carrier of 第4節 counts as ours: while it lives the operation goes on) */
  if(!fleets.some(x=>x.team===0&&x.alive&&!x.ward)) end(!!chase);   // once the fortress has fallen, the operation is won whatever follows
  updateRoster();
}
let outcome=null;
/* the end of the battle. quit: the player gave up from the in-battle menu; a defeat with no closing scene.
   full: a complete victory (op.chase: the fortress's guard was sunk too) */
function end(win,quit=false,full=false){
  /* 第5節: no defeat while the enemy is already falling back (stepRepel) */
  if(over||!win&&!quit&&repelT!=null) return; over=true; outcome=win; perfect=win&&full; setPhase('戦闘終結');
  const left=fleets.filter(f=>f.team===0&&f.alive).reduce((s,f)=>s+f.ships.length,0);
  document.getElementById('rh').textContent=win?(perfect?'完全勝利':'勝利'):'敗北';
  /* a lost carrier or too many civilian dead (第4節) have their own words */
  const why=!win&&loseWhy==='time'&&op.timeUp?{lose:op.timeUp.lose,loseLog:op.timeUp.loseLog}:!win&&loseWhy==='carrier'&&op.result.loseCarrier?{lose:op.result.loseCarrier,loseLog:op.result.loseCarrierLog}:!win&&loseWhy==='civil'&&op.result.loseCivil?{lose:op.result.loseCivil,loseLog:op.result.loseCivilLog}
    :!win&&loseWhy==='garrison'&&op.result.loseGarrison?{lose:op.result.loseGarrison,loseLog:op.result.loseGarrisonLog}:win&&repelBy==='time'&&op.result.winTime?{win:op.result.winTime,winLog:op.result.winTimeLog||op.result.winLog}:win&&repelBy==='was'&&op.result.winWas?{win:op.result.winWas,winLog:op.result.winWasLog||op.result.winLog}:{};
  const R={...op.result,...why,...(perfect?{win:op.result.perfect,winLog:op.result.perfectLog}:chase&&chase.escaped?{win:op.result.escape}:{})}, tail=fortress.defend?`${fortress.name}の耐久 ${Math.max(0,Math.ceil(100*fortress.hpPool/fortress.max))}%。`:convoy?`輸送船 ${convoy.escaped?convoy.ships.length:0}/${convoy.n}隻が離脱。`:
    op.win&&op.win.type==='repel'?`共和国の主力の${Math.round(mainSunk()*100)}%を沈めた。${gates.length?`塞いだゲート ${gates.filter(g=>g.sealed).length}/${gates.length}。基地守備隊 ${garrison?Math.ceil(100*garrison.hp/garrison.max):0}%。`:''}残存艦 ${left}隻。`:
    opCarrier?`${opCarrier.name}に乗せた住民 ${(opCarrier.cs.boarded||0).toLocaleString()}人。民間の被害 ${Math.round(casualties).toLocaleString()}人。残存艦 ${left-(opCarrier.alive?opCarrier.ships.length:0)}隻。`:`残存艦 ${left}隻。`;
  document.getElementById('rp').textContent=win?`${clockStr()}、${R.win}${tail}`:quit?`${clockStr()}、作戦を中止した。`:`${clockStr()}、${R.lose}`;
  /* the menu records the progress and the reward (prep.js) and tells what was gained */
  if(window.WOS_MENU&&WOS_MENU.onEnd) document.getElementById('rp').textContent+=WOS_MENU.onEnd(op.id,win,{rescued});
  if(quit){ logEvent('作戦中止','指揮官の判断で作戦を中止した。'); document.getElementById('result').hidden=false; return; }
  if(!win&&R.loseBlast) blast(R.loseBlast);
  logEvent(...(win?R.winLog:R.loseLog));
  /* the operation's closing conversation, then the result */
  setTimeout(()=>startTalk(talkFor(op.talk&&(win?op.talk.win:op.talk.lose)),()=>{document.getElementById('result').hidden=false;}),1600);
}

/* small craft (both sides) and a hostile fortress: they never pick the fortress itself on their own, and they keep to the side
   of its guns (its range plus FORT_MARGIN) their carrier is on: a carrier outside sends them only at foes outside, a carrier
   inside only at foes inside. The target their carrier was last ordered to attack overrides this and comes first; it holds
   through later move orders (a carrier shifting its position in range) until it falls or another attack is ordered. */
const FORT_MARGIN=6;
function underGuns(t,team){ return fortress.alive&&!fortress.defend&&fortress.team!==team&&(t===fortress||t.pos.distanceTo(fortress.pos)<=fortress.range+FORT_MARGIN); }
function orderedTarget(u){ const c=u.carrier||u; if(!c.alive) return null; if(c.order&&c.order.type==='attack') return c.order.target; return c.strike&&c.strike.alive?c.strike:null; }
function craftMayHit(u,t){ if(spares(u,t)) return false; if(t===orderedTarget(u)) return true; if(t===fortress) return !!t.defend&&u.team!==t.team&&u.type==='was';   // enemy W.A.S. may go for the station we defend
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
  /* 第5節 (2026-10-17, the enemy's priorities; 数値は仮): Alvarez's W.A.S. (prey:'mine') go for our own army's ships first, the rival;
     every other W.A.S. first for what is firing on its own ship (the assault ships come in with their W.A.S. as their guard) */
  if(u.team===1&&type==='was'&&gates.length){ const c=u.carrier;
    if(c&&c.prey==='mine'){ const m=preyNearest(u,maxD,t=>t.kind==='fleet'&&!t.ally&&!t.fixed&&craftMayHit(u,t)); if(m) return m; }
    if(c&&c.alive){ const a=nearestFoe(u,maxD,t=>t.kind==='fleet'&&t.fireTarget===c&&craftMayHit(u,t)); if(a) return a; } }
  const ec=enemyCraft(u,maxD); if(ec) return ec;
  if(u.team===1&&type==='was'&&convoy&&convoy.alive&&convoy.seen&&gap(u,convoy)<maxD&&craftMayHit(u,convoy)) return convoy;
  /* enemy W.A.S. go for the station we defend when it is within reach (as for the transports) */
  if(u.team===1&&type==='was'&&fortress.alive&&fortress.defend&&gap(u,fortress)<maxD) return fortress;
  /* prey:'ally' (第4節 Alvarez): the allied main fleet's warships first */
  if((u.carrier||u).prey==='ally'){ const a=preyNearest(u,maxD,t=>t.ally&&craftMayHit(u,t)); if(a) return a; }
  /* our craft left to themselves do not go for a ship in a civilian zone (第4節); an attack order still sends them */
  /* 第5節: the enemy's W.A.S. with nothing else in reach go for the nearest gate's shield */
  return preyNearest(u,maxD,t=>craftMayHit(u,t)&&!(u.team===0&&op.civil&&t.kind==='fleet'&&inZone(t)))||(u.team===1&&type==='was'&&gates.length?gateInReach(u,maxD):null);
}
/* the nearest foe for craft, leaving a fleet marked preyLast for when there is nothing else in reach (2026-10-13: as the ships do in pickFoe;
   第5節 the Amazon remnant went down first under the W.A.S.) */
function preyNearest(u,maxD,ok){ return nearestFoe(u,maxD,t=>!t.preyLast&&ok(t))||nearestFoe(u,maxD,ok); }
let enemyWASSeen=false;
/* launch: when a spotted enemy comes within reach, docked squadrons sortie one at a time (cooldown cd), up to maxOut (h.out) at once */
function launchCheck(f){
  for(const h of f.hangars){ const W=WING[h.type], C=f.craft&&f.craft[h.type]||{};   /* C: research of the player's own fleets (prep.js) */
    if(gameSec<h.next) continue;
    const sq=h.squads.find(q=>q.state==='docked'&&q.n>0&&gameSec>=q.ready); if(!sq) continue;
    const tgt=craftTarget(f,h.type,h.launchR); if(!tgt) continue;
    h.next=gameSec+W.cd*h.slow*(f.team===1?.85+Math.random()*.3:1); sq.state='out';   // the enemy's launches drift a little (2026-10-10, 仮)
    const w={kind:'wing',team:f.team,id:fid++,type:h.type,W,launchR:h.launchR,carrier:f,hangar:h,squad:sq,name:`${f.name}${W.name}隊`,
      pos:f.pos.clone(),heading:f.heading.clone(),n:sq.n,launched:sq.n,hp:W.hp*(C.hp??1)*HP_K,hpPool:sq.n*W.hp*(C.hp??1)*HP_K,eva:W.eva*(C.eva??1),dmg:W.dmg*(C.dmg??1),speed:W.speed*(C.speed??1),range:W.range*(C.range??1),
      vis:W.vis,stl:W.stl,fuel:W.fuel,target:tgt,state:'attack',alive:true,seen:f.seen,everSeen:true,revealT:0,retarget:0,fireTarget:null,radius:0,ships:[]};
    const R=Math.sqrt(sq.n)*.55;
    for(let i=0;i<sq.n;i++){ const a=Math.random()*Math.PI*2,r=R*Math.sqrt(Math.random());
      const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*1.6,Math.sin(a)*r); w.ships.push({off,pos:f.pos.clone(),wob:Math.random()*6}); }
    sq.wing=w; wings.push(w);
    if(f.team===1&&h.type==='was'&&!enemyWASSeen&&op.onEnemyWAS){ enemyWASSeen=true; const L=op.onEnemyWAS; (Array.isArray(L[0])?L:[L]).forEach(l=>logEvent(...l)); }   // one line, or several [[who, text], …]
    if(f.team===0&&!h.announced){ h.announced=true;
      logEvent(`${f.name} ${W.name}発進`,`${tgt.name}を捉え、${W.name}${sq.n}機が発進。最大${h.out}隊まで順に出撃し、燃料が尽きると母艦へ戻る。`); }
  }
}
/* back aboard: half of this sortie's losses are made up from the reserve, then the squadron rearms */
function dock(w){
  const h=w.hangar, q=w.squad, rec=Math.min(Math.ceil((w.launched-w.n)/2),h.reserve);
  h.reserve-=rec; q.n=w.n+rec; q.state='docked'; q.ready=gameSec+w.W.rearm*h.slow; q.wing=null; w.alive=false;
}
/* craft pin what they attack: a fleet under fighter or W.A.S. fire moves at 40% speed (SLOW_BY) for a moment (user decision 2026-10-04) */
const SLOW_BY=.4;
/* the carrier slows with the people aboard (op.carrier.slowFull, 第4節; user decision 2026-10-10: down by 70% when full), in proportion */
function loadSlow(f){ const C=op.carrier; return f.isCarrier&&C&&C.slowFull&&f.cs?1-C.slowFull*Math.min(1,(f.cs.boarded||0)/C.people):1; }
function speedOf(f){ return (f.syncSpeed||f.speed)*(f.slowT>0?SLOW_BY:1)*(f.inCloud?CLOUD_SPEED:1)*(f.inDebris?DEBRIS_SPEED:1)*loadSlow(f); }
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
      if(d>stop){ _v.normalize(); w.pos.addScaledVector(_v,Math.min(w.speed*dt,d-stop)); w.heading.lerp(_v,Math.min(1,dt*4)).normalize(); }
    }
    if(w.state!=='attack') continue;
    w.retarget-=dt; if(w.retarget<=0){ w.retarget=.4; const t=w.target; w.fireTarget=t&&t.alive&&t.seen&&gap(w,t)<=w.range?t:nearestFoe(w,w.range); }
    const ft=w.fireTarget;
    if(ft&&ft.alive&&ft.seen&&gap(w,ft)<=w.range*1.08){
      damage(ft,w.n*w.dmg*dt,w); w.revealT=FIRE_REVEAL; if(ft.kind==='fleet') ft.slowT=.5;
      if(Math.random()<Math.min(w.n,10)*1.4*dt) shoot(randShip(w),randShip(ft),TEAM_COL[colOf(w)],.18);
    }
  }
  wings=wings.filter(w=>w.alive);
}

/* move orders follow a path: a straight line to one point, or a smooth curve through the waypoints queued with Shift+click.
   The arrow is drawn from the same curve, so the fleet goes exactly where the arrow shows. */
const MAX_WAYPOINTS=8, PATH_DIV=40;
function makePath(from,pts){
  /* the turning points round the body (detours) shape the curve but are not waypoints: pts / at hold only the ones given */
  const all=[from.clone()], ix=[]; for(const p of pts){ all.push(...detours(all[all.length-1],p),p.clone()); ix.push(all.length-1); }
  const curve=all.length>2?new THREE.CatmullRomCurve3(all,false,'centripetal'):new THREE.LineCurve3(all[0],all[1]);
  curve.arcLengthDivisions=(all.length-1)*PATH_DIV;
  const lens=curve.getLengths();
  return {curve, L:Math.max(lens[lens.length-1],1e-3), s:0, pts:ix.map(i=>all[i]), at:ix.map(i=>lens[i*PATH_DIV])};
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
  const inRange=t=>t&&t.alive&&t.seen&&gap(f,t)<=f.range&&!bodyBlocks(f.pos,t.pos)?t:null;
  /* a raider (第4節) shoots the habitat block it came for, unless a ship stands nearer in its way: then that ship (the shield) */
  if(f.ai==='raid'&&f.team===1&&f.raidBlock){ const b=f.raidBlock, db=gap(f,b); return nearestFoe(f,Math.min(f.range,db))||(db<=f.range?b:null); }
  /* one going for the carrier (prey:'carrier') puts about a quarter of its fire on it (one second in four) and the rest on a ship
     standing nearer in its way (the main fleet as the shield) */
  if(f.prey==='carrier'&&f.team===1&&opCarrier&&opCarrier.alive&&opCarrier.seen){ const db=gap(f,opCarrier), at=db<=f.range?opCarrier:null;
    return at&&gameSec%4<1?at:nearestFoe(f,Math.min(f.range,db))||at; }
  /* the batteries on the base (第5節) put their fire on an assault ship in reach before anything else; the guns in their shafts reach
     nothing lower than PIT_EL[0] (pitCan) */
  if(f.fixed&&f.team===0&&op.base){ let b=null,bd=f.range; for(const e of fleets) if(e.alive&&e.team===1&&(e.ai==='land'||e.ai==='drop')&&e.seen&&pitCan(f,e)){ const d=gap(f,e); if(d<=bd&&!bodyBlocks(f.pos,e.pos)){bd=d;b=e;} } if(b) return b; }
  /* allied fleets never fire on a ship inside a civilian zone (ウォン中将's order) */
  const ok=f.pit?(t=>pitCan(f,t)):f.ally&&op.civil?(t=>t.kind==='wing'||t.fixed||!inZone(t)):null;   // the batteries on the rock are fair game
  /* 第5節: an enemy with nothing else in reach fires on the nearest gate's shield */
  if(f.stance!=='evade'){ const o=inRange(orderedTarget(f)); return o&&(!ok||ok(o))?o:nearestFoe(f,f.range,ok)||(f.team===1&&gates.length?gateInReach(f):null)||(f.team===0&&!f.fixed?troopNear(f,f.range):null); }
  return inRange(f.order&&f.order.type==='attack'?f.order.target:null);
}

/* a gun in its shaft (第5節, base.js) reaches only what is at least PIT_EL[0] over the rock's face */
function pitCan(f,t){ const P=f.pit; if(!P||P===true) return true; _gs.subVectors(t.pos,f.pos); const d=_gs.length(); return d<1e-6||_gs.dot(P.up)/d>=Math.sin(PIT_EL[0]); }
/* one heavy shot of a battery (f.every): each gun throws a short, bright, thick bolt (three tracers side by side), a flash at the muzzle and one on the target */
const _gs=new THREE.Vector3();
function gunShot(f,t){ const c=TEAM_COL[0];   // a beam from each barrel that lingers (effects.js beam; user decision 2026-10-18: 見本 B)
  for(const s of f.ships){ const a=s.muzzle?s.muzzle.clone():(s.base||s.pos).clone().addScaledVector(s.up||_up,1.2*(f.scale||1)), b=randShip(t).clone();
    beam(a,b,c); burst(a,c,5,3,.3); burst(b,HOT,6,4,.4); } }
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
  if(op.fieldR&&!fieldMoves&&!op.phases){ for(const f of fleets) if(f.alive&&f.team===0&&!f.ward) keepInField(f); return; }   // a larger field that stays put (第5節)
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

/* after the fortress falls (op.chase): its guard fleet runs for the exit, and the other enemy fleets come at us to cover it.
   Sinking the guard is a complete victory; if it gets away the operation is still won (user decision 2026-10-04).
   An operation without op.chase, or a guard already sunk, ends at once */
function startChase(){
  const C=op.chase, g=C&&fleets.find(f=>f.team===1&&f.alive&&f.name===C.fleet);
  if(!g){ end(true,false,!!C); return; }
  chase={fleet:g,exit:new THREE.Vector3(C.exit.pos[0],C.exit.alt||0,C.exit.pos[1]),escaped:false};
  chase.from=g.pos.distanceTo(chase.exit);
  g.ai='escape'; g.order=null; g.queue=[];
  for(const f of fleets) if(f.team===1&&f.alive&&f!==g){ f.ai='hunt'; f.leash=1e9; f.cover=true; }
  if(fortress.el) fortress.el.remove(); zoneLines.visible=false; gridMat.uniforms.uZone.value=0;
  exitObj.visible=true; exitObj.position.set(chase.exit.x,chase.exit.y+.2,chase.exit.z);
  makeArrow(g.pos,chase.exit,TEAM_COL[1],{life:6});
  if(C.phase) setPhase(C.phase);
  if(C.log) logEvent(...C.log);
}
function stepChase(){
  if(!chase||over) return; const g=chase.fleet;
  if(!g.alive){ end(true,false,true); return; }
  if(g.pos.distanceTo(chase.exit)<=(op.chase.reach||10)){ chase.escaped=true; g.alive=false; g.el.remove(); unselect(g);
    if(op.chase.escapeLog) logEvent(...op.chase.escapeLog); updateRoster(); end(true); }
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
/* pincer (user decision 2026-10-10): a fleet fired on from directions at least 90 degrees apart (up and down count too) fires back
   weaker: two such directions ×0.8, three or more ×0.7 (仮). Only fleets that are firing on it count (guns on the rock too); small
   craft do not, as they always swarm round their target. Counted every half second (f.pinch, f.pinchN, f.pinchBy: one fleet for each
   direction, for the marks round the emblem in loop.js) */
const PINCH=[1,1,.8,.7];
function pincers(){
  for(const f of fleets){ if(!f.alive) continue; const dirs=[], by=[];
    for(const x of fleets){ if(!x.alive||x.team===f.team||x.fireTarget!==f||gap(x,f)>x.range*1.08||bodyBlocks(x.pos,f.pos)) continue;
      const v=new THREE.Vector3().subVectors(x.pos,f.pos); if(v.lengthSq()<1e-6) continue; v.normalize();
      if(dirs.every(d=>d.dot(v)<=0)){ dirs.push(v); by.push(x); } }
    f.pinchN=dirs.length; f.pinch=PINCH[Math.min(dirs.length,3)]; f.pinchBy=by; }
}
/* how far off an attacker stands: an enemy (2026-10-17 夜: or allied) fleet that outranges its target keeps near the edge of its own
   guns (92%), out of the target's reach, instead of closing to 75% (2026-10-10, 仮) */
function outranges(f,t){ return t.kind==='fleet'&&!!t.range&&!t.fixed&&(f.carrierOnly?f.launchMin*.8>t.range:f.range>t.range*1.05); }
function standOff(f,t){ if(f.carrierOnly) return f.launchMin*.8+(t.radius||0);
  return f.range*((f.team===1||f.ally)&&outranges(f,t)?.92:.75)+(t.radius||0); }
/* falling back (user decision 2026-10-17 夜): a fleet fighting with no order of its own (the player's; for the AI's units, a move of their
   own) that outranges its foe keeps its distance by backing off: it keeps its bow on the foe (it does not turn) and goes back at half
   speed (BACK_SPEED), firing at full strength. One that does not outrange its foe stands its ground (only the sideways part of its move).
   Carriers the same (their launch distance). Fire over the stern (the target more than 90 degrees off the bow) is REAR_FIRE of the fire
   ahead, so a fleet running off at full speed fights at a quarter. 数値は仮 */
const BACK_SPEED=.5, REAR_FIRE=.25, _bk=new THREE.Vector3(), _bt=new THREE.Vector3();
function faceTo(f,t,dt){ _bt.subVectors(t.pos,f.pos); if(_bt.lengthSq()>1e-6) swingTo(f.heading,_bt.normalize(),dt*2); }
/* turn a heading toward dir (unit): from dead astern it swings round sideways, as a lerp alone would never turn it */
function swingTo(h,dir,k){ if(h.dot(dir)<-.98) h.set(h.x-dir.z*.3,h.y,h.z+dir.x*.3); h.lerp(dir,Math.min(1,k)).normalize(); }
/* one step of a fight toward its spot `to` round its foe t: true if it moved */
function stepFight(f,to,t,dt){
  _bk.subVectors(to,f.pos); _bt.subVectors(t.pos,f.pos); const n=_bk.length(); if(n<=1.2) return false;
  const tl=_bt.length(); if(tl<1e-6||_bk.dot(_bt)>=0){ stepToward(f,to,0,dt); return true; }   // ahead or sideways: as before
  _bt.multiplyScalar(1/tl);
  if(outranges(f,t)) _bk.multiplyScalar(Math.min(speedOf(f)*BACK_SPEED*dt,n)/n);
  else { _bk.addScaledVector(_bt,-_bk.dot(_bt)); const m=_bk.length(); if(m<.05) return false; _bk.multiplyScalar(Math.min(speedOf(f)*dt,m)/m); }
  f.pos.add(_bk); faceTo(f,t,dt); return true; }
/* with no order, a fleet in a fight that outranges its foe backs off from inside its stand-off, bow on the foe, at half speed */
function fallBack(f,t,dt){
  if(!t||!t.alive||!outranges(f,t)) return false; const R=(f.carrierOnly?f.launchMin*.8:f.range*.92)+(t.radius||0);
  _bk.subVectors(f.pos,t.pos); const d=_bk.length(); if(d>=R-.3||d<1e-6) return false;
  f.pos.addScaledVector(_bk,Math.min(speedOf(f)*BACK_SPEED*dt,R-d)/d); faceTo(f,t,dt); return true; }
/* the fire on t: a quarter over the stern */
function bowK(f,t){ if(f.fixed||f.pit) return 1; _bt.subVectors(t.pos,f.pos); return f.heading.dot(_bt)<0?REAR_FIRE:1; }
/* the side of its target an enemy fleet takes: the way it came in, turned by 0 / ±105 / 180 degrees for the 1st / 2nd, 3rd / 4th
   unit on the same target, give or take 15, and for the 2nd and 3rd 30 degrees above or below it (one over, one under: a pincer
   from above and below, user decision 2026-10-10). The 2nd and 3rd stand more than 90 degrees off the 1st, so they pin it (pincers).
   Every 25–45 s it shifts 10–25 degrees around and up to 10 up or down, so it does not sit still. A spot the rock hides from the target swings round (approach in step). 数値は仮 */
const SLOT_TURN=[0,105,-105,180,50], SLOT_TILT=[0,30,-30,0,0], SLOT_ALT=()=>ALT_MAX-5;   // within the orders' height limit
function slotOf(f,t,dt){
  if(f.slotOn!==t){ f.slotOn=t; f.slotT=25+Math.random()*20;
    const v=new THREE.Vector3().subVectors(f.pos,t.pos); if(v.lengthSq()<1e-6) v.set(0,0,1);
    f.slotH=v.clone().setY(0); if(f.slotH.lengthSq()<1e-6) f.slotH.set(0,0,1); f.slotH.normalize();
    const k=Math.min(claimsOn(t,f),SLOT_TURN.length-1), flip=Math.random()<.3?-1:1;
    f.slotH.applyAxisAngle(_up,(SLOT_TURN[k]+(Math.random()-.5)*30)*Math.PI/180);
    f.slotP=SLOT_TILT[k]?flip*SLOT_TILT[k]*Math.PI/180:Math.max(-.5,Math.min(.5,Math.asin(v.normalize().y))); }
  else if((f.slotT-=dt)<=0){ f.slotT=25+Math.random()*20; f.slotH.applyAxisAngle(_up,(Math.random()<.5?-1:1)*(10+Math.random()*15)*Math.PI/180);
    f.slotP=Math.max(-.8,Math.min(.8,f.slotP+(Math.random()-.5)*.35)); }
  /* not above or below the field's height limit */
  const R=standOff(f,t); if(Math.abs(t.pos.y+Math.sin(f.slotP)*R)>SLOT_ALT()) f.slotP=-f.slotP;
  if(!f.slot) f.slot=new THREE.Vector3();
  return f.slot.copy(f.slotH).multiplyScalar(Math.cos(f.slotP)).setY(Math.sin(f.slotP));
}
/* the side of its target an allied fleet takes (user decision 2026-10-13: allies pincer too, and use up and down). Allies on one foe
   share one base side (the side facing the post of the first to come; before, each closed straight in from its own post and they
   stood in one heap, then all on their own side of it, under 90 degrees apart). The k-th of them (the lowest place not taken) turns
   from it by ALLY_TURN[k] (give or take 10; which way round is the group's: the 2nd takes the side whose spot is in reach of fewer of
   the other enemies (ALLY_EXPOSED each) and nearer its post (ALLY_POST_W a unit), so it does not go round into the next enemy unit)
   and tilts ALLY_TILT[k] up or down (one over, one under; the first a little either way): the 2nd and
   3rd stand over 105 degrees off the 1st and off each other, so two pin the foe and three pin it from three sides (pincers),
   like the enemy's slotOf. Within ±SLOT_ALT of the field's plane. A spot the rock hides swings round (approach in step). 数値は仮 */
const ALLY_TURN=[0,115,-115,180,55,-55], ALLY_TILT=[0,25,-25,0,-30,30], ALLY_EXPOSED=40, ALLY_POST_W=.3;
function allyBase(f,t,v){ v.subVectors(f.post,t.pos).setY(0); if(v.lengthSq()<1){ v.subVectors(f.pos,t.pos).setY(0); if(v.lengthSq()<1e-6) v.set(0,0,1); } return v.normalize(); }
function allySlot(f,t){
  if(!f.slot) f.slot=new THREE.Vector3();
  if(f.slotOn!==t){ f.slotOn=t;
    const mates=fleets.filter(x=>x!==f&&x.ally&&x.alive&&x.slotOn===t&&x.order&&x.order.target===t), lead=mates.find(x=>x.slotBase);
    f.slotBase=lead?lead.slotBase.clone():allyBase(f,t,new THREE.Vector3());
    f.slotFlip=lead?lead.slotFlip:Math.random()<.5?-1:1;
    const taken=new Set(mates.map(x=>x.slotK)); let k=0; while(taken.has(k)&&k<ALLY_TURN.length-1) k++; f.slotK=k;
    /* which way round: the group's side, chosen by the first to go round (the side less in reach of the other enemies, and nearer its post) */
    let side=(mates.find(x=>x.slotSide)||{}).slotSide;
    if(!side&&ALLY_TURN[k]%180){ const R=standOff(f,t), cost=g=>{ const q=f.slotBase.clone().applyAxisAngle(_up,g*ALLY_TURN[k]*Math.PI/180).multiplyScalar(R).add(t.pos);
        let c=q.distanceTo(f.post)*ALLY_POST_W; for(const e of fleets) if(e.team===1&&e.alive&&e.seen&&e!==t&&q.distanceTo(e.pos)<(e.range||0)+4) c+=ALLY_EXPOSED; return c; };
      side=cost(1)<=cost(-1)?1:-1; mates.forEach(x=>{ x.slotSide=side; }); }
    f.slotSide=side||0;
    f.slotA=((side||1)*ALLY_TURN[k]+(Math.random()-.5)*20)*Math.PI/180;
    f.slotP=(k?f.slotFlip*ALLY_TILT[k]:(Math.random()-.5)*16)*Math.PI/180; }
  const R=standOff(f,t); if(Math.abs(t.pos.y+Math.sin(f.slotP)*R)>SLOT_ALT()) f.slotP=-f.slotP;
  return f.slot.copy(f.slotBase).applyAxisAngle(_up,f.slotA).multiplyScalar(Math.cos(f.slotP)).setY(Math.sin(f.slotP));
}
/* 第4節 hold (user decision 2026-10-13, in place of "stop where it is"): with every enemy down, ships and batteries alike, the allies
   spread out and wait near the habitat blocks, just outside the civilian zone (never inside). Each unit takes the spot that is
   nearest to it, counting each unit already waiting at that block as WAIT_SHARE further, and passing over a block that already has
   its even share of the waiting units (six to three blocks: two each), so they go to different blocks first; the block it is to guard
   later (protect:'block:N') counts WAIT_OWN nearer,
   on the block's outer side (away from the rock, between the people and where an enemy would come from), turned by WAIT_TURN,
   WAIT_GAP outside the zone's edge, raised or lowered by WAIT_ALT, and at least WAIT_SEP from every other unit's spot. 数値は仮 */
const WAIT_GAP=5, WAIT_SHARE=60, WAIT_OWN=30, WAIT_SEP=14, WAIT_TURN=[0,45,-45,90,-90,135,-135], WAIT_ALT=[0,8,-8,6,-6,4,-4];
function waitSpot(f){
  if(f.waitAt) return f.waitAt;
  const others=fleets.filter(x=>x!==f&&x.ally&&x.alive&&x.waitAt), R=op.civil.r; let best=null,bb=null,bs=1e9;
  const cap=Math.ceil(fleets.filter(x=>x.ally&&x.alive&&x.hold&&x.mode==='guard').length/blocks.length);
  for(const b of blocks){ const out=new THREE.Vector3().subVectors(b.pos,bodyC).setY(0); if(out.lengthSq()<1e-6) out.set(0,0,1); out.normalize();
    const on=others.filter(x=>x.waitBlock===b).length, full=on>=cap?1e4:0, own=f.protect==='block:'+b.i?WAIT_OWN:0;
    WAIT_TURN.forEach((a,i)=>{ const p=out.clone().applyAxisAngle(_up,a*Math.PI/180).multiplyScalar(R+WAIT_GAP).add(b.pos); p.y+=WAIT_ALT[i]*(f.id%2?1:-1);
      if(blocks.some(c=>p.distanceTo(c.pos)<R+1)||op.body&&p.distanceTo(bodyC)<bodySurface(p,op.body.r)+4) return;
      if(others.some(x=>x.waitAt.distanceTo(p)<WAIT_SEP)) return;
      const s=p.distanceTo(f.pos)+on*WAIT_SHARE+full-own; if(s<bs){ bs=s; best=p; bb=b; } }); }
  f.waitAt=best; f.waitBlock=bb; return best;
}
/* a help to the above, not the main rule (user decision 2026-10-13: spread the targets first; spacing only helps where all must go
   for one foe, e.g. 第4節 when one garrison unit is all there is). Allied fleets in a fight keep a little room between them: two attacking allies closer than their ship discs plus
   ALLY_GAP push apart (at up to half their speed), and one pressed against another fleet of ours steps aside (ours are not moved).
   Only while attacking: not on the way to a point or waiting at the post, nor for the batteries, the escorts on the way out (leave)
   or the guards beside what they protect (protect: their own spacing). 数値は仮 */
const ALLY_GAP=2, ALLY_PUSH=.5;
const discR=f=>Math.sqrt(f.n)*1.35*(f.scale||1);
function spreadAllies(dt){
  const al=fleets.filter(f=>f.ally&&f.alive&&!f.fixed&&f.mode==='guard'&&f.order&&f.order.type==='attack');
  al.forEach((f,i)=>{ for(const g of fleets){ const j=al.indexOf(g), both=j>=0; if(g===f||both&&j<i||!g.alive||g.team!==0||g.fixed||g.ghost) continue;   // each pair of allies once
    _v.subVectors(f.pos,g.pos); const d=_v.length(), want=discR(f)+discR(g)+ALLY_GAP; if(d>=want) continue;
    if(d<1e-6) _v.set(f.id%2?1:-1,0,0); else _v.multiplyScalar(1/d); _v.y*=.5;
    const m=Math.min((want-d)/(both?2:1),speedOf(f)*ALLY_PUSH*dt);
    f.pos.addScaledVector(_v,m); if(both) g.pos.addScaledVector(_v,-m); } });
}
/* one step toward a point, round the body if it is in the way; it stops `stop` short of the point (detour: a fleet's own fixed lean) */
function stepToward(f,to,stop,dt){
  const d=f.pos.distanceTo(to); if(d<=(stop||1.2)) return;
  const w=detour(f.pos,to,f.id); _v.subVectors(w||to,f.pos); const n=_v.length(); if(n<1e-6) return; _v.multiplyScalar(1/n);
  f.pos.addScaledVector(_v,Math.min(speedOf(f)*dt,w?n:d-stop)); f.heading.lerp(_v,Math.min(1,dt*3)).normalize(); turnMarch(f,_v,dt);
}
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
/* withdraw (第2節: the main force, out of deuterium, turns back; user decision 2026-10-12): it stops fighting (holds its fire, launches
   nothing, calls its craft home), makes north out of the field and leaves the battle once WITHDRAW_OUT beyond the edge. Set by events の ai */
const WITHDRAW_OUT=20;
function withdrawAI(f){
  if(!f.withdrawing){ f.withdrawing=true; f.stance='evade'; f.order=null; f.queue=[]; f.strike=null;
    for(const w of wings) if(w.alive&&w.carrier===f&&w.state==='attack'){ w.state='return'; w.target=null; }
    f.outPos=new THREE.Vector3(f.pos.x,f.pos.y,fieldC.z-FIELD_R-WITHDRAW_OUT*3); }
  if(Math.hypot(f.pos.x-fieldC.x,f.pos.z-fieldC.z)>FIELD_R+WITHDRAW_OUT){ f.alive=false; f.left=true; f.el.remove(); dropArrow(f.arrow); f.arrow=null; unselect(f); updateRoster(); return; }
  if(!f.order){ if(f.pos.distanceTo(f.outPos)<4) f.outPos.z-=FIELD_R; f.order={type:'move',dest:f.outPos.clone()}; }   // still inside (the field came along): further north
}
/* 第4節: shield fleets fall back beside their habitat block once hurt (the people there are their cover); raiders go for a block and
   shoot it (sim.js fireTargetOf: a ship in the way first) */
function shieldAI(f){
  if(f.sheltered||!f.blockAt||f.ships.length>=f.n*(f.below??.5)) return;
  f.sheltered=true; const b=f.blockAt.pos; f.post.copy(b).addScaledVector(_w.copy(b).setY(0).normalize(),5); f.leash=f.range+6; f.order=null;
  if(!shieldSaid&&op.shieldLog){ shieldSaid=true; logEvent(...op.shieldLog); }
}
function raidAI(f){
  const b=f.raidBlock&&f.raidBlock.alive?f.raidBlock:nearestOf(f,blocks); f.raidBlock=b; if(!b) return;
  if(gap(f,b)>f.range*.65){ _w.subVectors(f.pos,b.pos).setY(0); if(_w.lengthSq()<1e-6) _w.set(0,0,1); _w.setLength(b.radius+f.range*.5).add(b.pos); moveTo(f,_w.x,b.pos.y,_w.z); }
  else if(f.order&&f.order.type==='move') f.order=null;
}
/* 第4節: the unit going for the carrier (prey:'carrier') stands off outside the civilian zones within reach of it, so it can be fired on.
   It puts only a third of its fire on the carrier (fireTargetOf; user decision 2026-10-10: Yukon is targeted a little) */
function carrierRaidAI(f){
  /* the nearest of 16 spots around the carrier at 0.8 of its reach that is outside every zone and clear of the rock */
  const c=opCarrier, R=f.range*.8, Z=op.civil.r+2; let best=null,bd=1e9;
  for(let i=0;i<16;i++){ const a=i/16*Math.PI*2; _v.set(c.pos.x+Math.cos(a)*R,c.pos.y+4,c.pos.z+Math.sin(a)*R);
    if(blocks.some(b=>Math.hypot(_v.x-b.pos.x,_v.z-b.pos.z)<Z)||_v.distanceTo(bodyC)<bodySurface(_v,op.body.r)+4) continue;
    const d=_v.distanceTo(f.pos); if(d<bd){bd=d;best=_v.clone();} }
  if(!best) return;
  if(f.pos.distanceTo(best)>2) moveTo(f,best.x,best.y,best.z); else if(f.order&&f.order.type==='move') f.order=null;
}
/* which foe to go for (2026-10-10, so that not every unit goes for the same one): near the fleet itself, weakened, and not already
   taken by two others of its side (a second is welcome: two from both sides pin it, pincers). Each fleet weighs each foe a little differently (jit, 0.85–1.15), and it keeps its target
   unless another is clearly better (PICK_KEEP). A fleet marked preyLast is gone for last (第4節: ウォン中将's own, who lives on in the
   story). Guard fleets still answer only foes within their leash of their post.
   Allied fleets (allyAI) choose the same way, measured from their post (each keeps to its own part of the field), with one rule
   of their own (user decision 2026-10-13, after they all went for the same nearest foe and bunched up: spread the targets): a foe
   that more than ALLY_SHARE_MAX of the allied force is already going for is passed over for another in reach; with no other, that one
   (with several, all over it: the one fewest go for). The enemy's batteries on the rock are foes like the ships and count the same
   (user decision 2026-10-13); what an ally is on its way to (f.aim) counts as well as its attack order.
   The force is counted in units, not ships (2026-10-13: in the runs both gave the same; units is what the player sees).
   op.allySplit (第4節, user decision 2026-10-14: not all of them on one foe; split those who hold their posts from those who attack,
   the same way as the targets are shared out): no fallback, even with one foe; a foe over ALLY_SHARE_MAX is left to those on it, and
   an ally with nothing left to go for holds its post (allyAI). 数値は仮 */
const PICK_MAX=2, PICK_KEEP=.75, ALLY_SHARE_MAX=.3;
function claimsOn(t,f){ let n=0; for(const x of fleets) if(x!==f&&x.team===f.team&&!x.ally===!f.ally&&x.alive&&x.order&&x.order.target===t) n++; return n; }
/* the share of the allied force (alive, able to move, not on its way out) other than f that is going for t */
function allyForce(){ return fleets.filter(x=>x.ally&&x.alive&&!x.fixed&&x.mode!=='leave'); }
function shareOn(t,f,force){ let on=0; for(const x of force) if(x!==f&&(x.aim===t||x.order&&x.order.target===t)) on++; return force.length?on/force.length:0; }
function jitOf(f,t){ if(!f.jit) f.jit=new Map(); let j=f.jit.get(t.id); if(j==null){ j=.85+Math.random()*.3; f.jit.set(t.id,j); } return j; }
function pickFoe(f,foes,hunt){
  const cur=f.ally&&f.aim&&f.aim.alive?f.aim:f.order&&f.order.type==='attack'?f.order.target:null, from=f.ally?f.post:f.pos; let best=null,bs=1e9,cs=1e9;
  if(!hunt) foes=foes.filter(p=>p.pos.distanceTo(f.post)<f.leash);
  /* allies: only foes not over ALLY_SHARE_MAX; if every one is, those with the smallest share (so six on two foes go three and three) */
  if(f.ally&&op.allySplit){ const force=allyForce(); foes=foes.filter(p=>p===cur&&shareOn(p,f,force)<=ALLY_SHARE_MAX+1e-9||shareOn(p,f,force)<ALLY_SHARE_MAX-1e-9); }
  else if(f.ally&&foes.length>1){ const force=allyForce(), sh=new Map(foes.map(p=>[p,shareOn(p,f,force)])), lo=Math.min(...sh.values());
    foes=foes.filter(p=>sh.get(p)<=Math.max(ALLY_SHARE_MAX,lo+1e-9)); }
  for(const p of foes){
    const c=f.ally?0:claimsOn(p,f), hp=p.n?p.ships.length/p.n:1, s=p.pos.distanceTo(from)*(c>=PICK_MAX?3:1+c*.1)*(.7+.3*hp)*(p.preyLast?4:1)*jitOf(f,p);
    if(p===cur) cs=s; if(s<bs){ bs=s; best=p; } }
  return cur&&cs*PICK_KEEP<=bs?cur:best;
}
/* press (第5節, user decision 2026-10-16: the lines push in on the base): a line unit (ai:'guard' with press {goal:[x,z,alt], slow, fast, hold})
   holds its post at the edge and moves it on toward its goal by the gates, `slow` a clock hour (operation minutes) while a gun on the base
   covers the post (within its range + PRESS_COVER), `fast` where none does any more, and not at all while our ships round the post
   (PRESS_R; a gun counts PRESS_GUN) are `hold` times its side's. How far it has come (0 at the edge, 1 at the goal) tells which side of
   the base is pressed (stepFronts). An event's ai (the all-out attack's 'hunt') ends it. 数値は仮 */
const PRESS_R=40, PRESS_COVER=8, PRESS_GUN=2;
function pressPost(f){
  const P=f.press; if(!f.pressGoal){ f.pressGoal=new THREE.Vector3(P.goal[0],P.goal[2]||0,P.goal[1]); f.pressFrom=f.post.clone(); }
  const d=f.post.distanceTo(f.pressGoal); if(d<1) return;
  let ours=0, theirs=f.ships.length;   // itself, even before it is there
  for(const g of fleets){ if(g===f||!g.alive||g.ghost||g.kind!=='fleet'||g.pos.distanceTo(f.post)>PRESS_R) continue;
    if(g.team===1) theirs+=g.ships.length; else ours+=g.fixed?PRESS_GUN:g.ships.length; }
  f.pressHeld=ours>=(P.hold||1.5)*theirs; if(f.pressHeld) return;
  const covered=fleets.some(b=>b.fixed&&b.alive&&b.team===0&&b.pos.distanceTo(f.post)<b.range+PRESS_COVER);
  f.post.lerp(f.pressGoal,Math.min(1,(covered?P.slow??20:P.fast??80)/60*CLOCK_RATE*.5/d));   // enemyAI runs every half second
}
function pressShare(f){ return f.pressGoal?1-f.post.distanceTo(f.pressGoal)/Math.max(1,f.pressFrom.distanceTo(f.pressGoal)):0; }
/* chase (第4節の撤退; user decision 2026-10-17): go after the fleeing carrier, but beat what of ours is within CHASE_NEAR first. 数値は仮 */
const CHASE_NEAR=45;
/* the front line of 第5節: the ships north of this z (the gates are at about 160, our line at about −25 to 60) are on it (仮) */
const FRONT_LINE=100;
function chaseAI(f,foes){
  const C=opCarrier&&opCarrier.alive?opCarrier:null, near=foes.filter(x=>x!==C&&x.pos.distanceTo(f.pos)<CHASE_NEAR);
  const t=near.length?pickFoe(f,near,true):C&&C.seen?C:null;
  if(t){ if(!(f.order&&f.order.target===t)) order(f,{type:'attack',target:t}); }
  else if(C) moveTo(f,C.pos.x,C.pos.y,C.pos.z);
}
function enemyAI(){
  const all=fleets.filter(f=>f.team===0&&f.alive&&f.seen&&!f.ghost);
  let dplan;   // the plan of those breaking us one by one (ai:'detail'), made once a round when one of them asks
  for(const f of fleets){
    if(f.team!==1||!f.alive||f.fixed) continue;
    /* 第5節: a unit hurt below fallBack of its ships pulls back into the clouds (withdraw; user decision 2026-10-14. 数値は仮).
       Ships that leave are not counted as sunk (mainSunk counts only the ships lost) */
    if(f.fallBack&&f.ai!=='withdraw'&&f.ships.length<f.n*f.fallBack){ f.ai='withdraw'; f.fellBack=true; }
    let foes=f.spare?all.filter(x=>!spares(f,x)):all;
    if(f.prey==='ally'){ const al=fleets.filter(x=>x.ally&&x.alive&&x.seen&&!spares(f,x)); if(al.length) foes=al; }   // the allied main fleet first (第4節 Alvarez)
    /* 第5節 (2026-10-18, user decision): one of Alvarez's units (prey:'front') hunts on the front line, the nearest of our ships, allies
       and ours alike, out in front of the gates (north of FRONT_LINE); with none there, the shield of the gate by its watch point */
    if(f.prey==='front'){ foes=foes.filter(x=>!x.fixed&&x.pos.z<FRONT_LINE); if(!foes.length&&gates.length&&gateWatch(f)) continue; }
    /* 第5節: the escorts go for the guns on the base first (2026-10-13). The guns stand where the enemy knows them (not only the ones
       in sight, or they came for the ships in sight first and the guns were never touched): one not in sight yet, it closes on.
       A reserve still held back (ai:'guard') waits in the clouds until it is let go (2026-10-14) */
    if(f.prey==='battery'&&f.ai!=='guard'){ const gs=fleets.filter(x=>x.team===0&&x.alive&&x.fixed&&!x.silent);
      if(gs.length){ const g=pickFoe(f,gs,true); if(g&&!g.seen){ moveTo(f,g.pos.x,g.pos.y,g.pos.z); continue; } foes=gs; } }
    if(f.prey==='carrier'&&opCarrier&&opCarrier.alive&&opCarrier.seen&&op.civil){ carrierRaidAI(f); continue; }   // 第4節: one cruiser unit goes for Yukon
    if(f.ai==='detail'){ if(dplan===undefined) dplan=detailPlan(all); const t=dplan&&dplan.get(f);   // 第4節の後半: 各個撃破
      if(t){ if(!(f.order&&f.order.target===t)) order(f,{type:'attack',target:t}); }
      else { const w=f.watchPos||f.post; if(f.pos.distanceTo(w)>2&&(!f.order||f.order.type!=='move')) f.order={type:'move',dest:w.clone()}; }
      continue; }
    if(f.ai==='land'){ landAI(f); continue; }   // 第5節: the assault ships make for the drop points
    if(f.ai==='drop'){ dropAI(f); continue; }   // 第5節: the landing craft set their infantry down on the rock
    if(f.ai==='chase'){ chaseAI(f,foes); continue; }   // 第4節の撤退
    if(f.ai==='scout'){ scoutAI(f,foes); continue; }
    if(f.ai==='raid'){ raidAI(f); continue; }
    if(f.ai==='shield') shieldAI(f);
    /* siege: makes for the station we defend and shoots it, answering only what blocks the way (fireTargetOf) */
    if(f.ai==='siege'&&fortress.alive&&fortress.defend){ if(!(f.order&&f.order.target===fortress)) order(f,{type:'attack',target:fortress}); continue; }
    if(f.ai==='pursue'){ pursueAI(f,foes); continue; }
    if(f.ai==='withdraw'){ withdrawAI(f); continue; }
    if(f.ai==='escape'){ if(chase) moveTo(f,chase.exit.x,chase.exit.y,chase.exit.z); continue; }
    if(f.press&&f.ai==='guard') pressPost(f);   // 第5節: a line creeping toward the gates
    const threat=pickFoe(f,foes,f.ai==='hunt');
    if(threat){ if(!(f.order&&f.order.target===threat)) order(f,{type:'attack',target:threat}); }
    else if(f.cover&&chase&&chase.fleet.alive){ const p=chase.fleet.pos; if(f.pos.distanceTo(p)>12) moveTo(f,p.x,p.y,p.z); }   // nothing in sight: stay by the guard
    else if(f.ai==='hunt'){ if(gates.length&&gateWatch(f)) continue;   // 第5節: nothing in sight, the shield of the gate by its watch point
      const w=f.watchPos||f.post; if(f.pos.distanceTo(w)>2&&(!f.order||f.order.type!=='move')) f.order={type:'move',dest:w.clone()}; }
    else if(!f.order||f.order.type!=='move'){ if(f.pos.distanceTo(f.post)>2){ f.order={type:'move',dest:f.post.clone()}; } else f.order=null; }
  }
}

/* allied fleets (op.allies): guard their post like an enemy guard fleet does. With retreat {below, to}, a fleet whose ships fall
   under `below` of its strength starts to give ground: the fewer it has left, the closer its post moves to `to`
   (all the way there at half of `below`). It never fights to the last ship there; it falls back instead (user decision 2026-10-03).
   heldLog: said once if the fleet named in heldIf is destroyed while this one still holds its post */
/* 第4節: protect — when the enemy comes back, each allied fleet takes the nearest of the carrier and the habitat blocks and stands
   between it and the nearest enemy, just outside the block's civilian zone (beside the carrier), firing on what comes
   (user decision 2026-10-10: the main fleet guards what is near it; the enemy goes for our ships, not the blocks).
   leave — escort the carrier to the exit (2026-10-10, now that the laden carrier is slow) and leave the field there */
const PROTECT_GAP=6, PROTECT_SIDE=7;
function protectAI(f){
  /* a fixed point to hold (protect:[x,z]), e.g. the way out */
  if(Array.isArray(f.protect)){ moveTo(f,f.protect[0],f.protect[2]||0,f.protect[1]); return true; }
  /* what it guards: given (protect:'carrier' / 'block:N'), or else the nearest of the carrier and the blocks */
  if(!(f.protects&&f.protects.alive)){ const c=[...(opCarrier&&opCarrier.alive?[opCarrier]:[]),...blocks.filter(b=>b.alive)];
    const k=f.protect==='carrier'?opCarrier:/^block:\d+$/.test(f.protect||'')?blocks[+f.protect.slice(6)]:null;
    f.protects=k&&k.alive?k:nearestOf(f,c); }
  const P=f.protects; if(!P) return false;
  /* it faces an enemy going for what it guards (prey:'carrier' / a raid on the block), or else the centre of the enemy within 90 of it
     (or the nearest enemy), turning slowly so it does not swing about */
  const foe=x=>x.team===1&&x.alive&&x.seen&&!x.fixed, after=fleets.filter(x=>foe(x)&&(P===opCarrier?x.prey==='carrier':x.raidBlock===P&&x.ai==='raid'));
  const near=after.length?after:fleets.filter(x=>foe(x)&&x.pos.distanceTo(P.pos)<90);
  if(near.length){ _w.set(0,0,0); near.forEach(x=>_w.add(x.pos)); _w.multiplyScalar(1/near.length).sub(P.pos).setY(0); }
  else { let e=null,bd=1e9; for(const x of fleets) if(x.team===1&&x.alive&&x.seen&&!x.fixed){ const d=x.pos.distanceTo(P.pos); if(d<bd){bd=d;e=x;} }
    if(e) _w.subVectors(e.pos,P.pos).setY(0); else _w.copy(P.pos).setY(0); }
  if(_w.lengthSq()<1e-6) _w.set(0,0,1); _w.normalize();
  if(!f.protectDir) f.protectDir=_w.clone(); else f.protectDir.lerp(_w,.08).normalize(); _w.copy(f.protectDir);
  const mates=fleets.filter(x=>x.ally&&x.alive&&x.mode==='protect'&&x.protects===P), k=mates.indexOf(f);
  const side=_v.set(-_w.z,0,_w.x).multiplyScalar((k%2?-1:1)*Math.ceil(k/2)*PROTECT_SIDE);
  _w.multiplyScalar(P.kind==='block'?op.civil.r+PROTECT_GAP:(P.radius||0)+PROTECT_GAP+4).add(P.pos).add(side);
  /* the spot stays outside every civilian zone, so the enemy that comes for it is outside too and can be fired on */
  for(const b of blocks){ _v.subVectors(_w,b.pos).setY(0); const d=_v.length(), R=op.civil.r+PROTECT_GAP;
    if(d<R){ if(d<1e-6) _v.set(0,0,1); _v.setLength(R); _w.x=b.pos.x+_v.x; _w.z=b.pos.z+_v.z; } }
  /* and clear of the rock, so it does not stand pressed against it */
  _w.y=P.pos.y; if(op.body){ const R=bodySurface(_w,op.body.r)+4; if(_w.distanceTo(bodyC)<R) _w.sub(bodyC).setLength(R).add(bodyC); }
  moveTo(f,_w.x,_w.y,_w.z); return true;
}
function allyAI(){
  /* the foes: enemy ships in sight and outside the civilian zones, and the enemy's guns on the rock (第4節), whose places are known
     (user decision 2026-10-13: the batteries are foes too, and count in the share-out) */
  const foes=fleets.filter(f=>f.team===1&&f.alive&&(f.fixed||f.seen&&!(op.civil&&inZone(f))));
  for(const f of fleets){
    if(!f.ally||!f.alive||f.fixed) continue;   // a battery on the rock (第5節) only shoots
    if(f.mode!=='guard') f.aim=f.waitAt=null;
    if(f.mode==='leave'&&opCarrier){ const x=opCarrier.cs.exit; if(f.pos.distanceTo(x)<(op.carrier.exit.r||12)){ f.alive=false; f.left=true; f.el.remove(); continue; }
      /* the retreat: it escorts the (slow, laden) carrier, a little ahead of it toward the exit and to one side, until the carrier is out */
      if(opCarrier.alive){ const mates=fleets.filter(a=>a.ally&&a.alive&&a.mode==='leave'), k=mates.indexOf(f);
        _w.subVectors(x,opCarrier.pos).setY(0); if(_w.lengthSq()<1e-6) _w.set(0,0,1); _w.normalize(); _v.set(-_w.z,0,_w.x).multiplyScalar((k%2?-1:1)*(6+Math.floor(k/2)*7));
        _w.multiplyScalar(6).add(opCarrier.pos).add(_v); moveTo(f,_w.x,opCarrier.pos.y,_w.z); continue; }
      moveTo(f,x.x,x.y,x.z); continue; }
    /* rear (第4節の撤退; user decision 2026-10-17): it stays and holds the enemy off, going for what is nearest the carrier first
       (shared out like the others: its post is where the carrier is) */
    if(f.mode==='rear'){ if(opCarrier&&opCarrier.alive) f.post.copy(opCarrier.pos);
      const ships=foes.filter(e=>!e.fixed), t=pickFoe(f,ships,true)||ships.slice().sort((a,b)=>a.pos.distanceTo(f.post)-b.pos.distanceTo(f.post))[0]; f.aim=t;   // every foe has its share: the nearest the carrier anyway
      if(t){ if(!(f.order&&f.order.target===t)) order(f,{type:'attack',target:t}); } else if(f.order&&f.order.type==='attack') f.order=null;
      continue; }
    if(f.mode==='protect'&&protectAI(f)) continue;
    const R=f.retreat;
    if(R){ const k=f.ships.length/f.n;
      if(k<R.below){ if(!f.falling){ f.falling=true; if(R.log) logEvent(...R.log); }
        f.post.copy(f.home).lerp(f.fallTo,Math.min(1,(R.below-k)/(R.below/2))); }
      else if(R.heldLog&&!f.heldSaid&&R.heldIf&&fleets.some(e=>e.team===1&&e.name===R.heldIf&&!e.alive)){ f.heldSaid=true; logEvent(...R.heldLog); } }
    /* which foe: shared out among the allies like the enemy does it (pickFoe), within its leash of its post (f.aim: what it goes for,
       counted in the share-out even before it can see it). A battery it cannot see yet: it closes on its known place, and attacks it once seen */
    const threat=pickFoe(f,foes,false); f.aim=threat;
    if(threat) f.waitAt=null;
    if(threat&&!threat.seen){ moveTo(f,threat.pos.x,threat.pos.y,threat.pos.z); continue; }
    if(threat){ if(!(f.order&&f.order.target===threat)) order(f,{type:'attack',target:threat}); }
    /* 第5節 (2026-10-19, user decision): no enemy ship to go for, it closes on the enemy's infantry within its leash of its post */
    else if(troops.length&&(f.aimInf=troopNear(f.post,f.leash??60))){ if(!(f.order&&f.order.target===f.aimInf)) order(f,{type:'attack',target:f.aimInf}); }
    /* hold:true (第4節): with every foe down (ships and batteries), it does not go back to its post (user decision 2026-10-10) but waits
       near a habitat block, outside the civilian zone, spread from the others (waitSpot; user decision 2026-10-13). That spot is its post
       till it fights again. With no blocks, it stops where it is */
    /* op.allySplit (第4節, 2026-10-14): foes in reach but each already has its share of allies: this one holds its post */
    else if(op.allySplit&&foes.some(p=>p.pos.distanceTo(f.post)<f.leash)){ if(f.order&&f.order.type==='attack') f.order=null;
      if(f.pos.distanceTo(f.post)>2){ if(!f.order||f.order.type!=='move'||f.order.dest.distanceTo(f.post)>3) f.order={type:'move',dest:f.post.clone()}; } else f.order=null; }
    else if(f.hold){ if(f.order&&f.order.type==='attack') f.order=null;
      const w=op.civil&&blocks.length?waitSpot(f):null;
      if(w){ f.post.copy(w); if(f.pos.distanceTo(w)>2) moveTo(f,w.x,w.y,w.z); else if(f.order&&f.order.type==='move') f.order=null; }
      else if(!f.order) f.post.copy(f.pos); }
    else if(f.pos.distanceTo(f.post)>2){ if(!f.order||f.order.type!=='move'||f.order.dest.distanceTo(f.post)>3) f.order={type:'move',dest:f.post.clone()}; }
    else f.order=null;
  }
}
/* a defence operation (op.win {type:'defend', need, speed}): the evacuation runs with the clock until `need` minutes have gone by,
   slowed by the station's damage: rate = speed × (1 − (share of armour lost) ÷ 2) (user decision 2026-10-03; speed defaults to 1).
   Done: the operation is won.
   Every tenth of the way a background ship (op.evacShip) leaves southward; it is no one's target. The last one is op.evacLast */
function stepDefend(dt){
  const W=op.win; if(!W||W.type!=='defend'||over) return;
  evacRate=fortress.alive?(W.speed||1)*(1-(1-Math.max(0,fortress.hpPool/fortress.max))/2):0;
  const was=evac; evac=Math.min(W.need,evac+dt*CLOCK_RATE*evacRate);
  for(const L of op.evacLogs||[]) if(was<L[0]*W.need&&evac>=L[0]*W.need) logEvent(L[1],L[2]);
  /* evacEvents [{at, ...an event}]: what happens once the evacuation passes `at` (2026-10-13, 第3節: one more small wave at 90%) */
  const add=(op.evacEvents||[]).filter(E=>was<E.at*W.need&&evac>=E.at*W.need).map(E=>({...E,after:gameSec*CLOCK_RATE}));
  if(add.length){ const rest=opEvents.splice(nextEvent); opEvents.push(...[...rest,...add].sort((a,b)=>a.after-b.after)); }
  const k=Math.floor(10*evac/W.need+1e-9);
  while(evacShips<k){ evacShips++; const last=evacShips>=10, S=last&&op.evacLast||op.evacShip;
    if(S){ const g=makeFleet(0,{dmg:0,range:0,eva:0,hp:1,n:1,speed:6,scale:1.3,alt:-4,vis:2,stl:2,type:'tr',...S,name:last?S.name:`${S.name} 第${evacShips}便`,pos:[(Math.random()-.5)*10,8]});
      g.ward=g.ghost=true; g.el.classList.add('ghost'); g.sub=S.sub||'地球へ'; g.order={type:'move',dest:new THREE.Vector3(g.pos.x,g.pos.y,FIELD_R+20)}; fleets.push(g); } }
  for(const g of fleets) if(g.ghost&&g.alive&&!g.order){ g.alive=false; g.el.remove(); }
  if(evac>=W.need) end(true);
}

/* the body in the middle (op.body) is solid: a fleet that runs into it is put back just outside its surface */
function keepOffBody(f){ const d=f.pos.distanceTo(bodyC); if(d>op.body.r*1.35||d<1e-6) return; const R=bodySurface(f.pos,op.body.r)+2.5; if(d<R) f.pos.sub(bodyC).multiplyScalar(R/d).add(bodyC); }
/* the carrier of the operation (op.carrier, 第4節; user decision 2026-10-09): stopped inside the spaceport ring it lands; the enemy's
   W.A.S. come back (carrier.landEvents, timed from the landing) and the boarding runs `board` minutes, during which it cannot move.
   Then it lifts off and must reach the exit: that wins; losing it loses (destroyFleet) */
function stepCarrier(dt){
  const C=op.carrier; if(!C||!opCarrier||over) return; const S=opCarrier.cs, P=op.body&&op.body.port;
  if(!S.landed){ if(!opCarrier.alive||!P||!portOpen()) return;
    if(opCarrier.pos.distanceTo(_w.set(P.pos[0],P.alt||0,P.pos[1]))<=P.r&&(!opCarrier.order||opCarrier.order.type!=='move')) landCarrier(); return; }
  /* landed: the port is being taken (占領) until the main fleet is pushed back; then the plan changes to taking the people off */
  if(!S.evac){ if(evacDue(C,S)) startEvac(C,S); return; }
  if(!S.done){ S.board+=dt*CLOCK_RATE; S.boarded=Math.min(C.people,Math.floor(C.rate*S.board/60/100)*100);
    stepLastWave(C,S);
    for(const L of C.boardLogs||[]) if(S.boarded>=L[0]&&!S.logs.has(L[0])){ S.logs.add(L[0]); logEvent(L[1],L[2]); }
    const full=S.boarded>=C.people;
    if(full||cutBoarding(C,S)){ S.done=true; opCarrier.locked=false; opCarrier.sub=C.fleet.sub; setPhase('撤退');
      /* the last wave not come yet comes now, and goes after us with the rest (lastWave.atRetreat; 2026-10-17: the enemy was too weak
         when the main fleet's half went first and the biggest wave never came) */
      if(C.lastWave&&C.lastWave.atRetreat&&!S.lastCame) comeLastWave(C.lastWave,S);
      exitObj.visible=true; exitObj.position.set(S.exit.x,S.exit.y+.2,S.exit.z); makeArrow(opCarrier.pos,S.exit,TEAM_COL[0],{life:8});
      /* the allied unit nearest the carrier escorts it; the rest stay and hold the enemy off (rear; user decision 2026-10-17) */
      const al=fleets.filter(f=>f.ally&&f.alive&&!f.fixed), esc=al.length?nearestOf(opCarrier,al):null;
      for(const f of al){ f.mode=f===esc?'leave':'rear'; f.order=null; }
      playScene((full&&C.fullLogs||C.doneLogs).map(l=>[l[0],l[1].replace(/\{escort\}/g,esc?esc.name:'')]));
      /* the waves of the boarding not yet come (wave:true) are dropped; the retreat's own events (doneEvents) follow, timed from now */
      const now=gameSec*CLOCK_RATE, add=(C.doneEvents||[]).map(e=>({...e,after:now+e.after})), rest=opEvents.splice(nextEvent).filter(e=>!e.wave);
      opEvents.push(...[...rest,...add].sort((a,b)=>a.after-b.after));
      /* the ace unit and the units under him (letGo) let us go (第4節: Alvarez does not pursue); they draw back to where they came from
         (the cloud for the returning units, 2026-10-10) and only answer what comes near. Every other unit comes after the carrier,
         beating what of ours is near it first (chase; user decision 2026-10-17), and may fire on the carrier now */
      for(const f of fleets) if(f.team===1&&f.alive&&!f.fixed){
        if(f.ace||f.letGo) letGoOf(f);
        else { f.ai='chase'; f.spare=null; f.order=null; f.strike=null; } }
      callCraftHome(); }
    return; }
  if(opCarrier.alive&&opCarrier.pos.distanceTo(S.exit)<=(C.exit.r||12)){ opCarrier.escaped=true; opCarrier.alive=false; opCarrier.el.remove(); unselect(opCarrier);
    logEvent(`${opCarrier.name} 離脱`,`${opCarrier.name}が離脱点を抜けた。`); updateRoster(); end(true); }
}
/* the share of the main fleet's battle line (op.carrier.line, fleet names) that is sunk (a unit that left at the exit is not) */
function lineLost(){ const L=op.carrier.line||[], line=fleets.filter(f=>f.ally&&L.includes(f.name)), n=line.reduce((s,f)=>s+f.n,0);
  return n?1-line.reduce((s,f)=>s+(f.alive||f.left?f.ships.length:0),0)/n:0; }
/* 第4節: the spaceport takes the carrier only from body.port.openAt (minutes; the port's control is opened by the people inside, 2026-10-12) */
function portOpen(){ const P=op.body&&op.body.port; return !(P&&P.openAt)||gameSec*CLOCK_RATE>=P.openAt; }
/* 第4節: the plan changes from taking the port to taking the people off (op.carrier.evac; user decision 2026-10-10: when the main fleet
   is pushed back): when an allied unit is wiped out, or the battle line has lost `lost` of its ships, or `max` minutes after the landing.
   Never before `min` minutes after the landing (2026-10-12: the port is held a while first) */
function evacDue(C,S){ const E=C.evac; if(!E) return true;
  if(gameSec*CLOCK_RATE-S.landMin<(E.min||0)) return false;
  return fleets.some(f=>f.ally&&!f.alive&&!f.left)||lineLost()>=E.lost||gameSec*CLOCK_RATE-S.landMin>=E.max; }
function startEvac(C,S){
  S.evac=true; S.evacMin=gameSec*CLOCK_RATE; S.board=0; S.boarded=0; setPhase('収容'); opCarrier.sub='戦闘母艦　住民を収容中';
  playScene(C.evacLogs);
  /* the evacuation's own events, timed from now */
  const add=(C.evacEvents||[]).map(e=>({...e,after:S.evacMin+e.after})), rest=opEvents.splice(nextEvent);
  opEvents.push(...[...rest,...add].sort((a,b)=>a.after-b.after));
}
/* the boarding is cut short (op.carrier.cut, 第4節; user decision 2026-10-10): after `min` minutes of it, when the battle line has lost
   `sunk` of its ships or the carrier is down to `carrier` of its armour, and always after `max` minutes of it (2026-10-12).
   The more the main fleet holds, the more people get aboard */
/* allies (2026-10-17, user decision): when the allied units (the main fleet's six) have lost that share of their ships, it is cut short
   (in place of sunk and carrier). 第4節 now has the last wave come then instead (lastWave.allies), and the retreat follows it */
function cutBoarding(C,S){
  const K=C.cut; if(!K||S.board<(K.min||0)) return false;
  if(K.max&&S.board>=K.max) return true;
  if(S.lastCame) return gameSec*CLOCK_RATE-S.lastMin>=(C.lastWave.after||0);   // the last wave came `after` minutes ago (carrier.lastWave)
  if(K.allies!=null) return alliesLost()>=K.allies;
  return lineLost()>=K.sunk||opCarrier.hpPool<=K.carrier*opCarrier.n*opCarrier.hp;
}
/* the last wave (op.carrier.lastWave {of, lost, gap, allies, after, mass, log}; user decision 2026-10-17): while the people board, once the units
   of the wave tagged `of` (mass.tag) have lost `lost` of their ships, and not before `gap` minutes after that wave came, or once the allied
   units have lost `allies` of their ships, the last wave comes (mass, like an event's), and `after` minutes later the retreat begins.
   log: a line, or a list of lines ({units}: the units that came) */
let massAt={};
function stepLastWave(C,S){
  const L=C.lastWave; if(!L||S.lastCame) return;
  if(L.allies!=null&&alliesLost()>=L.allies){ comeLastWave(L,S); return; }
  if(L.gap&&(massAt[L.of]==null||gameSec*CLOCK_RATE-massAt[L.of]<L.gap)) return;
  const U=fleets.filter(f=>f.team===1&&f.tag===L.of), n=U.reduce((s,f)=>s+f.n,0); if(!n) return;
  if(1-U.reduce((s,f)=>s+(f.alive?f.ships.length:0),0)/n<L.lost) return;
  comeLastWave(L,S);
}
function comeLastWave(L,S){ S.lastCame=true; S.lastMin=gameSec*CLOCK_RATE; const k=spawnMass(L.mass);
  for(const l of L.log?Array.isArray(L.log[0])?L.log:[L.log]:[]) logEvent(l[0],l[1].replace('{units}',k));
  /* pullBack (2026-10-17): the ace's units leave the rest to the main force now, as they do at the retreat */
  if(L.pullBack){ for(const f of fleets) if(f.team===1&&f.alive&&!f.fixed&&(f.ace||f.letGo)) letGoOf(f); callCraftHome(); } }
/* the ace unit and the units under him (letGo) draw back to where they came from and only answer what comes near; their craft come home */
function letGoOf(f){ f.ai='guard'; f.post.copy(f.home); f.leash=35; f.order=null; f.strike=null; f.letGone=true; }
function callCraftHome(){ for(const w of wings) if(w.alive&&w.carrier.letGone&&w.state==='attack'){ w.state='return'; w.target=null; } }
/* the share of the allied units' ships (not the guns on a rock) that is sunk (a unit that left at the exit is not) */
function alliesLost(){ const A=fleets.filter(f=>f.ally&&!f.fixed), n=A.reduce((s,f)=>s+f.n,0);
  return n?1-A.reduce((s,f)=>s+(f.alive||f.left?f.ships.length:0),0)/n:0; }
/* a scene of lines: a conversation that pauses the battle (story on), always kept in the log too */
function playScene(lines){ if(!lines||!lines.length) return; lines.forEach(l=>logEvent(...l)); if(storyOn()) startTalk(lines); }
/* keepOut (第4節): the enemy does not hide among the people once the main fleet is here; pushed out to the edge of every civilian zone,
   so the allies, who never fire into a zone, can answer it */
function keepOutOfZones(f){ const R=op.civil.r+.5;
  for(const b of blocks){ _w.subVectors(f.pos,b.pos); const d=_w.length(); if(d>=R) continue; if(d<1e-6) _w.set(0,0,1); f.pos.copy(b.pos).addScaledVector(_w.normalize(),R); } }
function landCarrier(){
  const C=op.carrier, S=opCarrier.cs; S.landed=true; S.landMin=gameSec*CLOCK_RATE; opCarrier.locked=true; opCarrier.order=null; opCarrier.queue=[]; dropArrow(opCarrier.arrow); opCarrier.arrow=null;
  opCarrier.sub=C.landSub||'戦闘母艦　宇宙港を確保中'; if(C.landLog) logEvent(...C.landLog); if(C.landPhase) setPhase(C.landPhase);
  /* the landing's own events, timed from now */
  const add=(C.landEvents||[]).map(e=>({...e,after:S.landMin+e.after})), rest=opEvents.splice(nextEvent);
  opEvents.push(...[...rest,...add].sort((a,b)=>a.after-b.after));
}

/* 第5節: the base's three gates (op.base, the body's blocks with gate:true; user decision 2026-10-16, in place of the drop points of 2026-10-12).
   Each gate is shut under its armour (the shield, op.base.shield). Every enemy can wear it down: each unit goes for what it goes for first
   (our ships, the batteries: prey:'battery', the gate's ring: ai:'land') and, with nothing of that in reach, fires on the nearest gate's
   shield (fireTargetOf, craftTarget); a hunting unit with nothing in sight closes on the gate nearest its watch point (enemyAI).
   A shield worn to nothing: if it is not the last gate, the section behind it is blown and the gate sealed (no more use to either side),
   and both sides draw off from it to the gates left (our allies' posts, the enemy's watch points, the stage's place). The last gate stays
   open: while assault ships (ai:'land') stay by it (within r of its ring), they put their W.A.S. in one by one and each wears the garrison
   inside (op.base.garrison) down; at 0 the operation is lost. The infantry round each gate (op.base.infantry) fire on the W.A.S. and the assault ships
   near it, weakly; fewer of them as the shield goes down, none once it is sealed. 数値は仮 */
let gates=[], garrison=null;
/* GATE_AREA: a post or a watch point within this of a sealed gate moves to the gate left (farther off, like the reserve in the clouds, stays) */
const GATE_AREA=90;
function openGates(){ return gates.filter(g=>!g.sealed); }
function gateNear(p,list=gates){ let b=null,bd=1e9; for(const g of list){ const d=Math.hypot(p.x-g.pos.x,p.z-g.pos.z); if(d<bd){bd=d;b=g;} } return b; }
/* the gate an assault ship makes for: the one named (drop) while it is open, else the nearest open one */
function dropFor(f){ const open=openGates(); if(!open.length) return null;
  if(f.dropAt&&!f.dropAt.sealed) return f.dropAt;
  return f.dropAt=f.drop&&open.find(g=>g.name===f.drop)||nearestOf(f,open); }
const DROP_WEAK_R=60;   // 仮
function weakDrop(names){ const c=names.map(n=>gates.find(g=>g.name===n&&!g.sealed)).filter(Boolean); if(!c.length) return null;
  const held=g=>fleets.reduce((s,f)=>s+(f.alive&&f.team===0&&!f.fixed&&Math.hypot(f.pos.x-g.pos.x,f.pos.z-g.pos.z)<DROP_WEAK_R?f.ships.length:0),0);
  return c.reduce((a,g)=>held(g)<held(a)?g:a); }
function landAI(f){
  const g=dropFor(f);
  if(!g){ moveTo(f,f.pos.x,f.pos.y,-FIELD_R-30); return; }
  const p=landSpot(f,g);
  if(f.pos.distanceTo(p)>2) moveTo(f,p.x,p.y,p.z); else if(f.order&&f.order.type==='move') f.order=null;
}
/* the assault ships by a gate do not all stop on one point (2026-10-18, user decision: spread out a little): the k-th to come to a gate takes
   its own spot in the ring, at the golden angle from the one before, LAND_SPREAD of the ring's radius out and a little over or under it
   (LAND_ALT). Still inside the ring, so each can put its W.A.S. in at the last gate. 数値は仮 */
const LAND_SPREAD=[.4,.85], LAND_ALT=3, _ls1=new THREE.Vector3(), _ls2=new THREE.Vector3();
function landSpot(f,g){
  if(!f.landSpot||f.landSpot.g!==g){ const k=g.landN=(g.landN||0)+1, a=k*2.39996, r=g.r*(LAND_SPREAD[0]+(LAND_SPREAD[1]-LAND_SPREAD[0])*((k*.618034)%1));
    _ls1.set(1,0,0).addScaledVector(g.up,-g.up.x).normalize(); _ls2.crossVectors(g.up,_ls1);
    f.landSpot={g,p:g.ring.clone().addScaledVector(_ls1,Math.cos(a)*r).addScaledVector(_ls2,Math.sin(a)*r).addScaledVector(g.up,((k%3)-1)*LAND_ALT)}; }
  return f.landSpot.p; }
/* the nearest gate whose shield f can fire on now (within R, a clear line) */
/* the group of the enemy's infantry nearest p (a unit, or a point) within R that our guns can see (第5節, 2026-10-19) */
function troopNear(p,R){ const at=p.pos||p; let b=null,bd=R; for(const g of troops){ if(!(g.n>0)) continue; const d=at.distanceTo(g.pos); if(d<bd&&!bodyBlocks(at,g.pos)){ bd=d; b=g; } } return b; }
function gateInReach(f,R=f.range){ let b=null,bd=R; for(const g of gates){ if(!g.alive) continue; const d=gap(f,g); if(d<=bd&&!bodyBlocks(f.pos,g.pos)){ bd=d; b=g; } } return b; }
/* a hunting unit with nothing in sight: it stands off over the open gate nearest its watch point, inside its guns' reach of the shield */
function gateWatch(f){ const list=gates.filter(g=>g.alive); if(!list.length) return false;
  const g=gateNear(f.watchPos||f.post,list); _w.subVectors(f.pos,g.pos).setY(0); if(_w.lengthSq()<1e-6) _w.set(0,0,-1); _w.normalize().multiplyScalar(.6).addScaledVector(g.up,.8).normalize();
  _w.multiplyScalar(f.range*.7+g.radius).add(g.pos); moveTo(f,_w.x,_w.y,_w.z); return true; }
function gateHit(g,amt){ if(!g.alive||over) return; g.hp=Math.max(0,g.hp-amt);
  if(Math.random()<amt*.05) burst(g.pos.clone().add(new THREE.Vector3((Math.random()-.5)*10,Math.random()*2,(Math.random()-.5)*14)),HOT,6,5,.6);
  const k=g.hp/g.max; for(const m of [.5]) if(k<=m&&!g.marks.has(m)){ g.marks.add(m); const L=op.base.halfLog; if(L) logEvent(L[0],L[1].replace('{name}',g.name)); }
  if(g.hp<=0) breachGate(g); }
function breachGate(g){ const B=op.base; g.alive=false;
  if(gates.some(x=>x!==g&&!x.sealed)){ sealGate(g); return; }
  g.breached=true; if(B.lastLog) logEvent(B.lastLog[0],B.lastLog[1].replace('{name}',g.name)); }
/* the section behind the gate blown and the gate shut for good; both sides draw off to the gates left */
function sealGate(g){ const B=op.base; g.sealed=true; g.inf=0; g.boomT=2.2; drawGate(g); if(B.sealLog) logEvent(B.sealLog[0],B.sealLog[1].replace('{name}',g.name));
  for(let i=0;i<8;i++) burst(g.pos.clone().add(new THREE.Vector3((Math.random()-.5)*12,Math.random()*4,(Math.random()-.5)*16)),HOT,40,12,1.5);
  const open=openGates(), to=p=>gateNear(p,open), near=p=>p&&Math.hypot(p.x-g.pos.x,p.z-g.pos.z)<GATE_AREA&&gateNear(p)===g;
  const move=(p,t)=>{ p.x+=t.pos.x-g.pos.x; p.z+=t.pos.z-g.pos.z; };
  for(const f of fleets){ if(!f.alive) continue;
    if(f.team===1){ if(f.dropAt===g) f.dropAt=null; if(f.dropTo&&f.dropTo.gate===g){ f.dropTo=null; f.dropState='in'; } if(near(f.watchPos)){ move(f.watchPos,to(f.watchPos)); if(f.order&&f.order.type==='move') f.order=null; }
      /* a line pressing on this gate (press) or a post by it goes on to the gate left, like ours (it sat at the sealed gate before, 2026-10-17 夜) */
      if(near(f.pressGoal)){ const t=to(f.pressGoal); move(f.pressGoal,t); move(f.post,t); if(f.order&&f.order.type==='move') f.order=null; }
      else if(f.post&&near(f.post)){ move(f.post,to(f.post)); if(f.order&&f.order.type==='move') f.order=null; }
      continue; }
    if(f.ally&&!f.fixed&&near(f.home||f.post)){ const t=to(f.post); move(f.post,t); if(f.home) move(f.home,t); if(f.fallTo) move(f.fallTo,t); f.aim=null; f.order=null; } }
  /* the stage's place on this gate (第5節 in stages): the field slides to the gate left */
  if(stageGate===g){ const t=to(fieldC); slideFrom=fieldC.clone(); slideTo=new THREE.Vector3(fieldC.x+t.pos.x-g.pos.x,0,fieldC.z+t.pos.z-g.pos.z); slideT=0; slideDur=4;
    spotObj.position.set(slideTo.x,.3,slideTo.z); stageText=stageText.split(g.name).join(t.name); stageGate=t;
    const mine=fleets.filter(f=>f.team===0&&f.alive&&!f.ward); if(mine.length){ _w.set(0,0,0); mine.forEach(f=>_w.add(f.pos)); _w.multiplyScalar(1/mine.length).setY(0); makeArrow(_w.clone(),slideTo.clone(),TEAM_COL[0],{life:8}); }
    if(B.moveLog) logEvent(B.moveLog[0],B.moveLog[1].replace('{name}',t.name)); }
}
/* after an ally's post is moved by an event (shift): not onto a sealed gate */
function postOffSealed(f){ const g=gateNear(f.post); if(!g||!g.sealed||Math.hypot(f.post.x-g.pos.x,f.post.z-g.pos.z)>=GATE_AREA) return; const t=gateNear(f.post,openGates()); if(!t) return;
  f.post.x+=t.pos.x-g.pos.x; f.post.z+=t.pos.z-g.pos.z; }
/* an enemy that comes in with its watch point on a sealed gate looks to the gate left */
function watchOffSealed(f){ const p=f.watchPos; if(!p) return; const g=gateNear(p); if(!g||!g.sealed||Math.hypot(p.x-g.pos.x,p.z-g.pos.z)>=GATE_AREA) return; const t=gateNear(p,openGates()); if(!t) return;
  p.x+=t.pos.x-g.pos.x; p.z+=t.pos.z-g.pos.z; }
/* the infantry: the W.A.S. and assault ships within reach of a gate's dots */
const INF_R=28, INF_SHOOTS=e=>e.type==='mas'||e.type==='lc'||!!(e.comp&&e.comp.mas);
function stepBase(dt){
  const B=op.base; if(!B||!gates.length||over) return;
  const I=B.infantry||{}, n0=I.n||36;
  for(const g of gates){
    if(g.boomT>0){ g.boomT-=dt; if(Math.random()<dt*14) burst(g.pos.clone().add(new THREE.Vector3((Math.random()-.5)*10,Math.random()*5,(Math.random()-.5)*14)),HOT,24,9,1.2); }
    if(g.sealed){ g.inf=0; continue; }
    g.inf=Math.max(0,Math.round(n0*Math.max(0,g.hp/g.max))-Math.floor(g.infLost||0)); if(!g.inf||repelT!=null) continue;
    let t=null, bd=INF_R;
    for(const w of wings) if(w.alive&&w.team===1&&w.type==='was'&&w.seen){ const d=w.pos.distanceTo(g.pos); if(d<bd){ bd=d; t=w; } }
    for(const e of fleets) if(e.alive&&e.team===1&&INF_SHOOTS(e)&&e.seen){ const d=gap(e,{pos:g.pos,radius:0}); if(d<bd){ bd=d; t=e; } }
    if(!t) continue;
    const at=randShip(t); damage(t,g.inf*(I.dmg||.03)*dt,g.infSrc); infFire(g.look,g.inf,at,dt,{line:I.line||.35,rocket:I.rocket||.04}); }
  /* the few infantry round each gun on the rock (2026-10-17, data inf): fewer as the gun is worn down, none once it is lost; the same fire */
  for(const f of fleets){ if(!f.pit||f.pit===true) continue;
    f.inf=f.alive?Math.max(0,Math.round(f.infN*Math.max(0,f.hpPool/(f.n*f.hp)))-Math.floor(f.infLost||0)):0; if(!f.inf||repelT!=null) continue;
    let t=null, bd=INF_R;
    for(const w of wings) if(w.alive&&w.team===1&&w.type==='was'&&w.seen){ const d=w.pos.distanceTo(f.pos); if(d<bd){ bd=d; t=w; } }
    for(const e of fleets) if(e.alive&&e.team===1&&INF_SHOOTS(e)&&e.seen){ const d=gap(e,{pos:f.pos,radius:0}); if(d<bd){ bd=d; t=e; } }
    if(!t) continue;
    if(!f.infSrc) f.infSrc={kind:'wing',inf:true,team:0,id:-300-f.id,name:`${f.name}の強化歩兵`};
    const at=randShip(t); damage(t,f.inf*(I.dmg||.03)*dt,f.infSrc); infFire(f.pit,f.inf,at,dt,{line:I.line||.35,rocket:I.rocket||.04}); }
  /* the garrison: once the last gate's shield is gone (not while the enemy falls back), the assault ships by it put their W.A.S. in, one
     from each ship every G.every minutes of the operation clock, out of what they carry (spare craft first, then docked squadrons), and
     only the W.A.S. wear the garrison down, G.was each (user decision 2026-10-17 夜: they storm in and fight it out inside) */
  stepTroops(dt);
  const last=gates.find(g=>g.breached); if(!last||!garrison||repelT!=null) return;
  const G=B.garrison; let put=0;
  for(const f of fleets){ if(!f.alive||f.team!==1||f.ai!=='land'||f.pos.distanceTo(last.ring)>last.r) continue;
    const h=f.hangars.find(x=>x.type==='was'); if(!h) continue;
    f.putAcc=(f.putAcc||0)+f.ships.length*dt*CLOCK_RATE/(G.every||2);
    while(f.putAcc>=1){ const q=h.reserve>0?null:h.squads.find(x=>x.state==='docked'&&x.n>0); if(h.reserve<=0&&!q){ f.putAcc=0; break; }
      if(q) q.n--; else h.reserve--; f.putAcc--; put++; } }
  if(!put) return;
  if(!garrison.said&&G.log){ garrison.said=true; logEvent(G.log[0],G.log[1].replace('{name}',last.name)); }
  garrisonHit(put*(G.was||5));
}
/* the garrison worn down (by the W.A.S. put in, or the enemy's infantry going in): its radio at the marks, lost at 0 */
function garrisonHit(amt){ const B=op.base;
  garrison.hp=Math.max(0,garrison.hp-amt);
  for(const L of B.garrison.logs||[]) if(garrison.hp<=L[0]*garrison.max&&!garrison.marks.has(L[0])){ garrison.marks.add(L[0]); logEvent(L[1],L[2]); }
  if(garrison.hp<=0){ loseWhy='garrison'; end(false); } }

/* 第5節: the landing craft (ai:'drop', type 'lc'; user decision 2026-10-18: a new class that sets the enemy's armoured infantry down).
   Each makes for its side's gate (drop / drops, like the assault ships) and there for a spot on the rock by a gun still standing, the one
   the fewest other craft are bound for, or with none left by the gate itself; it comes in over the spot (DROP_OVER along the rock's
   face), sets down (the ships on their legs on the rock, loop.js) and after troops.unload seconds puts its infantry out (troops a craft),
   then lifts off and leaves north (withdraw). The guns fire on them first, like on the assault ships. 数値は仮 */
const DROP_OVER=14, DROP_GUN=10, DROP_GATE=30, DROP_SIT=2.7, DROP_DOWN=6;
const hxz=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function dropSpot(f){
  const g=dropFor(f); if(!g) return null;
  const D=f.dropTo; if(D&&(D.gun?D.gun.alive:!D.gate.sealed)&&D.gate===g) return D;
  const guns=fleets.filter(x=>x.pit&&x.pit!==true&&x.alive&&hxz(x.pos,g.pos)<GATE_AREA), bound=x=>fleets.filter(y=>y!==f&&y.alive&&y.dropTo&&y.dropTo.gun===x).length;
  const gun=guns.length?guns.reduce((a,b)=>hxz(b.pos,f.pos)*(1+bound(b))<hxz(a.pos,f.pos)*(1+bound(a))?b:a):null, c=gun||g;
  _w.subVectors(f.pos,c.pos).setY(0); if(_w.lengthSq()<1e-6) _w.set(0,0,-1); _w.normalize().multiplyScalar(gun?DROP_GUN:DROP_GATE);
  const F=gateFrame(c.pos.x+_w.x,c.pos.z+_w.z,3);
  f.dropState='in'; f.downAt=null; f.land=null; return f.dropTo={gun, gate:g, p:F.pos.clone(), up:F.up.clone()}; }
function dropAI(f){
  const T=op.base&&op.base.troops||{}, D=dropSpot(f);
  if(!D){ moveTo(f,f.pos.x,f.pos.y,-FIELD_R-30); return; }
  const hi=D.p.clone().addScaledVector(D.up,DROP_OVER), low=D.p.clone().addScaledVector(D.up,DROP_SIT);
  if(f.dropState==='in'){ if(f.pos.distanceTo(hi)>3){ moveTo(f,hi.x,hi.y,hi.z); return; } f.dropState='down'; sitSpots(f,D); }
  /* down: it sets down when it is there, or after DROP_DOWN seconds on the way (the rock it is kept off may stand a little over the spot) */
  if(f.dropState==='down'){ f.downAt??=gameSec; if(f.pos.distanceTo(low)>1.2&&gameSec-f.downAt<DROP_DOWN){ moveTo(f,low.x,low.y,low.z); return; } f.dropState='sit'; f.sitAt=gameSec; f.order=null; }
  if(f.dropState==='sit'&&gameSec-f.sitAt>=(T.unload??4)){ troopsOut(f,D); f.unloaded=true; f.dropState='up'; f.land=null; f.ai='withdraw'; }
}
/* where each craft of the unit sets down: on the rock round the spot, its legs on the rendered surface (loop.js eases it there) */
function sitSpots(f,D){ f.land={up:D.up, p:D.p};
  f.ships.forEach(s=>{ const q=rockAt(D.p.x+s.off.x*1.4,D.p.z+s.off.z*1.4); s.sit=q.addScaledVector(D.up,SHIP_SIZE.lc*.45); }); }

/* the enemy's armoured infantry on the rock (第5節; user decision 2026-10-18): red dots, in fire teams of four round where they stand.
   A group goes for the nearest gun still standing within troops.seek, else the nearest open gate, troops.speed a second over the rock.
   It fights the first of our infantry (round a gun or a gate) it comes within reach of (TROOP_REACH): each side loses troops.kill men a
   second for each man of the other, ours (in cover) troops.cover times less. With none of ours left there, at a gun it wears the gun
   down (troops.gun a man a second, the hit points' scale on it). A gate still shut it closes on only when they round it outnumber our
   infantry there (else they wait just out of reach); it goes in once the gate is the last and its shield is gone, troops.enter men an
   hour of the operation clock, each taking garrison.troop off the garrison. 数値は仮 */
let troops=[], troopId=0, troopsSaid=null, troopsWent=0;   // troopsWent: how many went in, in all
const TROOP_REACH={gun:12, gate:30}, TROOP_AT={gun:4, gate:9};
/* our infantry guard the guns and the gates (2026-10-18, user: whether the enemy is on the move or not, but not going far from where they
   are): ours round a gun or an open gate fire on the nearest group of theirs within DEF_R of it, which fires back (DEF_BACK of its fire,
   the rest on its way); ours go no further than leaning a little toward them (base.js infLean). A gate's waiting place is out of
   that reach (DEF_R.gate + DEF_WAIT). 数値は仮 */
const DEF_R={gun:22, gate:40}, DEF_BACK=.6, DEF_WAIT=4;
function holders(){ const H=[]; for(const f of fleets) if(f.pit&&f.pit!==true&&f.alive&&f.inf>0) H.push(f); for(const x of gates) if(!x.sealed&&x.inf>0) H.push(x); return H; }
/* the men aboard a landing craft unit (troops a craft may be a fraction, 2026-10-19: 14.4; rounded as they step out) */
const troopsIn=f=>Math.round(f.ships.length*(f.troops||0));
function troopsOut(f,D){
  const n=troopsIn(f); if(n<=0) return;
  const g={kind:'wing', inf:true, troop:true, team:1, id:-400-troopId++, name:`${f.name}の強化歩兵`, n, n0:n, lost:0, went:0, pos:D.p.clone(), offs:[], dots:[], goal:null, alive:true, seen:true, ships:[]};
  for(let t=0;t<Math.ceil(n/4);t++){ const a=Math.random()*Math.PI*2, r=1.5+Math.random()*4.5;
    for(let k=0;k<4;k++) g.offs.push([Math.cos(a)*r+(Math.random()-.5)*1.6,Math.sin(a)*r+(Math.random()-.5)*1.6]); }
  g.offs.length=n; troops.push(g); placeTroop(g);
  const L=op.base.troops&&op.base.troops.log; if(L&&gameSec-(troopsSaid??-1e9)>20){ troopsSaid=gameSec; logEvent(L[0],L[1].replace('{gate}',D.gate.name)); } }
function placeTroop(g){ g.dots=g.offs.map(([x,z])=>{ const p=rockAt(g.pos.x+x,g.pos.z+z); p.y+=.3; return p; }); }
/* our infantry the group meets: the nearest gun with some left within its reach, or the gate it goes for (not while it waits) */
function troopFoe(g){ let b=null,bd=1e9;
  for(const f of fleets) if(f.pit&&f.pit!==true&&f.inf>0){ const d=hxz(f.pos,g.pos); if(d<TROOP_REACH.gun&&d<bd){ bd=d; b=f; } }
  for(const x of gates) if(!x.sealed&&x.inf>0&&x===g.goal&&!g.wait){ const d=hxz(x.pos,g.pos); if(d<TROOP_REACH.gate&&d<bd){ bd=d; b=x; } }   // a gate only when they go for it
  return b; }
function troopGoal(g,T){ let b=null,bd=T.seek??90;
  for(const f of fleets) if(f.pit&&f.pit!==true&&f.alive){ const d=hxz(f.pos,g.pos); if(d<bd){ bd=d; b=f; } }
  if(b) return b; const open=openGates(); return open.length?gateNear(g.pos,open):null; }
function stepTroops(dt){
  if(!troops.length||repelT!=null) return;
  const T=op.base.troops||{}, G=op.base.garrison, k=T.kill??.02, I=op.base.infantry||{}, rate={line:I.line||.35, rocket:I.rocket||.04};
  for(const g of troops) g.foe=troopFoe(g);
  /* ours fire on theirs within reach of where they stand, on the move or not; a group already fighting them is left to that fight */
  for(const H of holders()){ H.infAim=null;
    const R=H.kind==='gate'?DEF_R.gate:DEF_R.gun; let g=null, bd=R;
    for(const x of troops){ const d=hxz(x.pos,H.pos); if(x.n>0&&d<bd){ bd=d; g=x; } }
    if(!g) continue; H.infAim=g; if(g.foe===H) continue;
    g.lost+=H.inf*k*dt; g.n=Math.max(0,g.n0-Math.floor(g.lost)-g.went); H.infLost=(H.infLost||0)+g.n*k*dt/(T.cover??1.5)*DEF_BACK;
    const look=H.look||H.pit;
    if(look.inf&&g.dots.length) infFire(look,H.inf,g.dots[(Math.random()*Math.min(g.n,g.dots.length))|0]||g.pos,dt,rate);
    if(g.n>0&&look.inf) infFire({inf:{pts:g.dots}},Math.ceil(g.n*DEF_BACK),look.inf.pts[(Math.random()*H.inf)|0]||H.pos,dt,rate,TROOP_LINE); }
  for(const g of troops){
    const foe=g.n>0?g.foe:null;
    if(foe){   // a fire fight with our infantry there
      const ours=foe.inf; foe.infAim=g;
      g.lost+=ours*k*dt; foe.infLost=(foe.infLost||0)+g.n*k*dt/(T.cover??1.5);
      g.n=Math.max(0,g.n0-Math.floor(g.lost)-g.went);
      const look=foe.look||foe.pit;
      if(g.dots.length&&look.inf) infFire(look,ours,g.dots[(Math.random()*Math.min(g.n,g.dots.length))|0]||g.pos,dt,rate);
      if(g.n>0&&look.inf) infFire({inf:{pts:g.dots}},g.n,look.inf.pts[(Math.random()*ours)|0]||foe.pos,dt,rate,TROOP_LINE);
      continue; }
    const goal=g.goal=troopGoal(g,T); if(!goal) continue;
    /* a gate still shut and held by more of ours than there are of them round it: they wait just out of its infantry's reach */
    const gun=goal.kind==='fleet', d=hxz(goal.pos,g.pos), wait=g.wait=!gun&&!goal.breached&&goal.inf>troops.reduce((s,x)=>s+(hxz(x.pos,goal.pos)<TROOP_REACH.gate+12?x.n:0),0);
    const at=gun?TROOP_AT.gun:wait?DEF_R.gate+DEF_WAIT:TROOP_AT.gate;
    if(d>at+.5){ const m=Math.min(d-at,(T.speed??2)*dt); g.pos.x+=(goal.pos.x-g.pos.x)/d*m; g.pos.z+=(goal.pos.z-g.pos.z)/d*m; continue; }   // the men follow on their own (base.js stepTroopMen)
    /* waiting, but inside the gate's reach (they came from a gun by it): they draw back out of it */
    if(wait){ if(d<at-.5&&d>1e-3){ const m=Math.min(at-d,(T.speed??2)*dt); g.pos.x-=(goal.pos.x-g.pos.x)/d*m; g.pos.z-=(goal.pos.z-g.pos.z)/d*m; } continue; }
    /* the gun: they fire on it (the infantry's streaks and rockets, 2026-10-18: so it is seen that they are at it) and wear it down */
    if(gun){ damage(goal,g.n*(T.gun??.06)*HP_K*dt,g);
      infFire({inf:{pts:g.dots}},g.n,_w.copy(goal.pos).addScaledVector(goal.pit&&goal.pit.up||_up,.6),dt,{line:I.line||.35,rocket:(I.rocket||.04)*2},TROOP_LINE); continue; }
    /* the gate still shut, its infantry gone (2026-10-19, user decision): they wear its shield down as they do a gun */
    if(!goal.breached&&goal.alive){ damage(goal,g.n*(T.gun??.06)*HP_K*dt,g);
      infFire({inf:{pts:g.dots}},g.n,goal.ring||goal.pos,dt,{line:I.line||.35,rocket:(I.rocket||.04)*2},TROOP_LINE); continue; }
    /* the gate: in once it is the last and open */
    if(goal.breached&&garrison){ g.inAcc=(g.inAcc||0)+(T.enter??60)*dt*CLOCK_RATE/60; const k=Math.min(g.n,Math.floor(g.inAcc)); if(k>0){ g.inAcc-=k; g.went+=k; g.n-=k; troopsWent+=k;
      if(!garrison.saidTroop&&T.inLog){ garrison.saidTroop=true; logEvent(T.inLog[0],T.inLog[1].replace('{name}',goal.name)); }
      garrisonHit(k*(G.troop||2)); if(over) return; } }
  }
  troops=troops.filter(g=>g.n>0||(g.alive=false));
}
/* 第5節: the operation in stages (op.phases; user decision 2026-10-12: move to the place given and fight there, the enemy coming
   from many sides, the centre of the field moving each stage). Each stage {at (minutes), name, centre:[x,z], text, slide?, log?, scene?,
   events?, given?} begins at its time: the field's centre slides to its place over `slide` seconds (the view goes along), a ring marks the place,
   an arrow points our fleets there and its events (after: minutes from the stage's start) follow. Our fleets left outside the moved
   field may stay where they are but cannot go further out (keepInFieldSoft) */
/* gate (2026-10-16): the stage's place is by that gate of the base; if it is sealed by then, by the gate left (sealGate also moves it) */
let stageAt=0, stageText='', slideFrom=null, slideTo=null, slideT=0, slideDur=1, stageGate=null;
function startStage(S){
  let C=S.centre; stageText=S.text||''; stageGate=S.gate&&gates.find(g=>g.name===S.gate)||null;
  if(stageGate&&stageGate.sealed){ const t=gateNear(stageGate.pos,openGates()); C=[C[0]+t.pos.x-stageGate.pos.x,C[1]+t.pos.z-stageGate.pos.z]; stageText=stageText.split(stageGate.name).join(t.name); stageGate=t; }
  setPhase(S.name); slideFrom=fieldC.clone(); slideTo=new THREE.Vector3(C[0],0,C[1]); slideT=0; slideDur=S.slide||4;
  spotObj.visible=true; spotObj.position.set(C[0],.3,C[1]);
  const mine=fleets.filter(f=>f.team===0&&f.alive&&!f.ward); if(mine.length){ _w.set(0,0,0); mine.forEach(f=>_w.add(f.pos)); _w.multiplyScalar(1/mine.length).setY(0); makeArrow(_w.clone(),slideTo.clone(),TEAM_COL[0],{life:8}); }
  const now=gameSec*CLOCK_RATE, add=(S.events||[]).map(e=>({...e,after:now+(e.after||0)})), rest=opEvents.splice(nextEvent);
  opEvents.push(...[...rest,...add].sort((a,b)=>a.after-b.after));
  lendShips(S.given);
  if(S.log) logEvent(...S.log); if(S.scene) playScene(S.scene);
}
/* ships lent from a stage or an event on (given, like op.given: ours to command, after our own fleets, outside any army group, no research) */
function lendShips(list){
  if(!list||!list.length) return;
  const mine=fleets.filter(f=>f.team===0&&!f.ward), k=mine.length?fleets.indexOf(mine[mine.length-1])+1:fleets.length;
  fleets.splice(k,0,...list.map(o=>makeFleet(0,o))); buildRoster(); updateRoster();
}
function keepInFieldSoft(f,sliding){
  /* while the field slides away, a fleet left behind is not dragged along: its own edge grows with the distance */
  const r=Math.hypot(f.pos.x-fieldC.x,f.pos.z-fieldC.z); f.outR=sliding?Math.max(f.outR??FIELD_R,r):Math.max(FIELD_R,Math.min(f.outR??r,r));
  if(r>f.outR){ const k=f.outR/r; f.pos.x=fieldC.x+(f.pos.x-fieldC.x)*k; f.pos.z=fieldC.z+(f.pos.z-fieldC.z)*k; }
}
function stepPhases(dt){
  const P=op.phases; if(!P||over||repelT!=null) return;
  while(stageAt<P.length&&gameSec*CLOCK_RATE>=P[stageAt].at) startStage(P[stageAt++]);
  if(slideTo){ slideT=Math.min(slideDur,slideT+dt); const k=slideT/slideDur, e=k*k*(3-2*k);
    _fd.copy(slideFrom).lerp(slideTo,e).sub(fieldC); _fd.y=0; fieldC.add(_fd); shiftView(_fd); if(slideT>=slideDur) slideTo=null; }
  for(const f of fleets) if(f.alive&&f.team===0&&!f.ward) keepInFieldSoft(f,!!slideTo);
}
/* 第5節: which side of the base is pressed (op.fronts; user decision 2026-10-16: the allies hold the three sides, we go where it is
   thin, told by the radio and a small mark). Each front {name, gate, x:[from, to], voice:[speaker, fleet], press, fall} covers the field
   between those x (south of FRONT_N). Every half second from `from` minutes on, its level: 1 pressed (the lines there have come
   FRONT_PROG[0] of their way, or the enemy's ships there are FRONT_RATIO[0] times ours with each live gun counting FRONT_GUN (when they
   are FRONT_MIN or more), or its gate's shield lost FRONT_DROP in the last FRONT_WIN minutes), 2 falling (FRONT_PROG[1], FRONT_RATIO[1],
   the shield down to FRONT_LOW, or every gun there gone). It rises at once and drops a level only after FRONT_CALM seconds below.
   When it rises, the front's commander says press / fall (if that fleet is still there) and `who` (say.press / say.fall, {front},
   {gate}, {cause} from causes) sums it up; back to 0, who says say.ok. Not said while most of our own ships are there already,
   at most once in `gap` seconds over all, and a front again only after `again` minutes (unless it gets worse). A sealed gate closes
   its front. 数値は仮 */
const FRONT_N=-60, FRONT_PROG=[.35,.7], FRONT_RATIO=[1.3,2.2], FRONT_GUN=2, FRONT_MIN=8, FRONT_DROP=.06, FRONT_WIN=20, FRONT_LOW=.35, FRONT_CALM=10;
let fronts=[], frontSaidT=-1e9;
function initFronts(){ fronts=op.fronts?op.fronts.list.map(L=>({...L,level:0,calmT:null,pend:0,said:-1e9,saidLv:0,lastLv:0,cause:'',prog:0,hist:[],closed:false})):[]; frontSaidT=-1e9; }
function stepFronts(){
  const F=op.fronts; if(!F||over||repelT!=null||gameSec*CLOCK_RATE<(F.from||0)) return;
  const now=gameSec*CLOCK_RATE, inZ=(L,p)=>p.z>FRONT_N&&p.x>=L.x[0]&&p.x<L.x[1]&&Math.hypot(p.x-fieldC.x,p.z-fieldC.z)<=FIELD_R;   // in the field only
  const mine=fleets.filter(f=>f.team===0&&f.alive&&!f.ward&&!f.ally&&!f.fixed), mineN=mine.reduce((s,f)=>s+f.ships.length,0);
  for(const L of fronts){ if(L.closed) continue;
    const g=gates.find(x=>x.name===L.gate); if(g&&g.sealed){ L.closed=true; L.level=L.pend=0; continue; }
    let foe=0, ours=0, guns=0, gunsAll=0;
    for(const f of fleets){ if(f.kind!=='fleet'||f.ghost) continue;
      if(f.fixed&&f.team===0){ if(inZ(L,f.home)){ gunsAll++; if(f.alive) guns++; } continue; }
      if(!f.alive||!inZ(L,f.pos)) continue;
      if(f.team===1){ if(f.ai!=='withdraw') foe+=f.ships.length; } else if(!f.convoy) ours+=f.ships.length; }
    const lines=fleets.filter(f=>f.alive&&f.team===1&&f.press&&f.ai==='guard'&&f.pressGoal&&f.pressGoal.x>=L.x[0]&&f.pressGoal.x<L.x[1]);
    const prog=L.prog=lines.length?lines.reduce((s,f)=>s+pressShare(f),0)/lines.length:0;
    const ratio=foe>=FRONT_MIN?foe/Math.max(1,ours+FRONT_GUN*guns):0;
    const sh=g?g.hp/g.max:1; L.hist.push([now,sh]); while(L.hist.length>1&&L.hist[0][0]<now-FRONT_WIN) L.hist.shift();
    const drop=L.hist[0][1]-sh, gunsOut=gunsAll>0&&!guns;
    const lv=prog>=FRONT_PROG[1]||ratio>=FRONT_RATIO[1]||sh<=FRONT_LOW||gunsOut?2:prog>=FRONT_PROG[0]||ratio>=FRONT_RATIO[0]||drop>=FRONT_DROP?1:0;
    if(lv>L.level){ L.level=L.pend=lv; L.calmT=null;
      L.cause=gunsOut?'guns':sh<=FRONT_LOW||drop>=FRONT_DROP?'shield':prog>=FRONT_PROG[0]?'line':'few'; }
    else if(lv<L.level){ if(L.calmT==null) L.calmT=gameSec; else if(gameSec-L.calmT>=FRONT_CALM){ L.level=lv; L.calmT=null; if(L.pend>lv) L.pend=lv; if(!lv&&L.saidLv) L.pend=-1; } }
    else L.calmT=null;
    /* say it, if it is time */
    if(!L.pend||gameSec-frontSaidT<(F.gap||20)) continue;
    const there=mine.reduce((s,f)=>s+(inZ(L,f.pos)?f.ships.length:0),0)>mineN/2;
    const fill=t=>t.replace('{front}',L.name).replace('{gate}',L.gate||'').replace('{cause}',(F.causes&&F.causes[L.cause]||'').replace('{gate}',L.gate||''));
    if(L.pend<0){ logEvent(F.who,fill(F.say.ok)); L.saidLv=0; L.pend=0; frontSaidT=gameSec; continue; }
    if(L.pend<=L.lastLv&&now-L.said<(F.again||40)){ L.pend=0; continue; }   // said not long ago, and no worse
    if(there){ L.pend=0; continue; }   // we are there already
    const V=L.voice, vf=V&&fleets.find(f=>f.name===V[1]&&f.alive), line=L.pend>1?L.fall:L.press;
    if(vf&&line) logEvent(V[0],line);
    logEvent(F.who,fill(L.pend>1?F.say.fall:F.say.press));
    L.said=now; L.saidLv=L.lastLv=L.pend; L.pend=0; frontSaidT=gameSec;
  }
}
/* 第5節: hold the base (op.win {type:'repel', share, until, surge}): won when `share` of the enemy's main force (fleets marked main)
   is sunk, or at `until` minutes. surge {share, at, events}: the all-out attack, when `share` of it is sunk or at `at` minutes,
   whichever comes first; its events (the form of op.events, after: minutes from then) follow. 数値は仮
   retreat {sec, text, log} (user decision 2026-10-14): once `share` is sunk the enemy falls back first: every enemy fleet withdraws
   (no fire, its craft called back, north; an assault ship in a ring puts nothing down), nothing more comes, and after `sec` seconds
   of the battle the result follows. text goes in the goal panel meanwhile */
let mainTotal=0, surged=false, repelBy=null, repelT=null;
function mainSunk(){ let s=0; for(const f of fleets) if(f.team===1&&f.main) s+=f.n-f.ships.length; return mainTotal?s/mainTotal:0; }
function stepRepel(){
  const W=op.win; if(!W||W.type!=='repel'||over) return;
  const k=mainSunk(), now=gameSec*CLOCK_RATE, S=W.surge;
  if(S&&!surged&&(k>=S.share||now>=S.at)){ surged=true;
    const add=(S.events||[]).map(e=>({...e,after:now+(e.after||0)})), rest=opEvents.splice(nextEvent);
    opEvents.push(...[...rest,...add].sort((a,b)=>a.after-b.after)); }
  if(repelT!=null){ if(gameSec-repelT>=W.retreat.sec) end(true); return; }
  const short=W.wasShort&&wasShort();
  if((k>=W.share||short)&&W.retreat){ repelBy=k>=W.share?'sunk':'was'; repelT=gameSec; stageText=W.retreat.text||stageText;
    for(const f of fleets) if(f.team===1&&f.alive&&!f.fixed){ f.ai='withdraw'; f.order=null; }
    if(W.retreat.log) logEvent(...W.retreat.log); return; }
  if(k>=W.share||now>=W.until){ repelBy=k>=W.share?'sunk':'time'; end(true); }
}

/* win.wasShort (第5節, user decision 2026-10-18): the enemy's W.A.S. left, aboard its assault ships (out with their squadrons too) and
   on the ones still to come (events not yet run, the all-out attack's if it has not begun), are fewer than it takes to wear the garrison
   down (garrison.hp / garrison.was): the enemy cannot take the base and falls back */
function wasLeft(){ let n=0;
  /* only the W.A.S. of the ships that land (ai:'land', or a reserve given its gate: drop / drops); the hunter on the front line (prey:'front') never puts any in */
  const lands=f=>f.ai==='land'||!!(f.drop||f.drops), of=f=>lands(f)&&(f.hangar&&f.hangar.was)||0;
  for(const f of fleets) if(f.alive&&f.team===1&&lands(f)) for(const h of f.hangars) if(h.type==='was') n+=h.reserve+h.squads.reduce((s,q)=>s+(q.state==='out'?(q.wing&&q.wing.alive?q.wing.n:0):q.n),0);
  for(let i=nextEvent;i<opEvents.length;i++){ const E=opEvents[i]; if(E.fleet&&!E.fleet.ally) n+=of(E.fleet); }
  const S=op.win&&op.win.surge; if(S&&!surged) for(const E of S.events||[]) if(E.fleet&&!E.fleet.ally) n+=of(E.fleet);
  return n; }
/* the enemy's armoured infantry left: on the rock, aboard the landing craft that have not set them down, and on the ones still to come */
function troopsLeft(){ let n=0; const of=o=>o.ai==='drop'?Math.round((o.troops||0)*o.n):0;
  for(const f of fleets) if(f.alive&&f.team===1&&f.ai==='drop'&&!f.unloaded) n+=troopsIn(f);
  for(const g of troops) n+=g.n;
  for(let i=nextEvent;i<opEvents.length;i++){ const E=opEvents[i]; if(E.fleet&&!E.fleet.ally) n+=of(E.fleet); }
  const S=op.win&&op.win.surge; if(S&&!surged) for(const E of S.events||[]) if(E.fleet&&!E.fleet.ally) n+=of(E.fleet);
  return n; }
/* 2026-10-18 (user decision): the W.A.S. and the armoured infantry left together cannot wear the garrison down: the enemy falls back */
function wasShort(){ const G=op.base&&op.base.garrison; return !!(G&&garrison&&wasLeft()*(G.was||5)+troopsLeft()*(G.troop||0)<garrison.hp); }
/* timeUp {at, until, warn, lose, loseLog} (user decision 2026-10-13: doing nothing must lose): at `at` minutes, if what it waits for
   has not happened (until 'fortress': the fortress destroyed; 'land': the carrier landed), the operation is lost. warn {at, log}: said once before */
function stepTimeUp(){
  const T=op.timeUp; if(!T||over) return;
  if(T.until==='fortress'?!fortress.alive:T.until==='land'?!!(opCarrier&&opCarrier.cs.landed):false) return;
  const now=gameSec*CLOCK_RATE;
  if(T.warn&&!timeWarned&&now>=T.warn.at){ timeWarned=true; logEvent(...T.warn.log); }
  if(now>=T.at){ loseWhy='time'; end(false); }
}

/* debug auto mode (user decision 2026-10-15: a switch in the title's debug panel). Our own fleets fight and do the operation's goal by
   themselves, built on how the fast-forward tools play (tools/*-sim.cjs); the talk and the deploy step go on by themselves (hud.js, loop.js).
   Each fleet goes for the nearest enemy in sight around what it guards (enemies in a civilian zone are left alone), else waits around it:
   escort: the convoy (an enemy far stronger than all of us is not taken on: we keep out of its way), and one fleet goes for the distress
   call; defend: the station; carrier (第4節): first the enemies nearest the spaceport, the carrier goes in once the port is open and
   clear, then the fleets keep round the carrier, which leaves for the exit when the boarding ends; the base's gates (第5節): the assault ship
   nearest the ring of an open gate first, then what comes near the field's centre; fortress: its guard when it runs, else the nearest fleet,
   then the fortress. Distances are 仮 */
let autoMode=false;
const AUTO_R={escort:45, defend:60, port:45, carrier:50, gate:140, near:70}, AUTO_WAIT=12;
function autoAI(){
  if(!autoMode||over) return;
  const mine=fleets.filter(f=>f.team===0&&f.alive&&!f.ward&&!f.ally&&!f.convoy&&!f.isCarrier&&!f.fixed&&!f.rescue);
  const seen=fleets.filter(e=>e.team===1&&e.alive&&e.seen&&!(op.civil&&inZone(e)));
  const ships=seen.filter(e=>!e.fixed), near=(p,R,list=ships)=>list.filter(e=>e.pos.distanceTo(p)<R);
  const by=(f,list,key)=>list.slice().sort((a,b)=>key(a,f)-key(b,f))[0];
  const dist=(a,f)=>a.pos.distanceTo(f.pos), craftFirst=(a,f)=>(a.hangars&&a.hangars.length?0:100)+a.pos.distanceTo(f.pos);
  const attack=(f,e)=>{ if(!(f.order&&f.order.type==='attack'&&f.order.target===e)) order(f,{type:'attack',target:e}); };
  /* wait round p, each fleet on its own spot of a ring */
  const wait=(f,p,i)=>{ const a=i*2.4, d=new THREE.Vector3(p.x+Math.cos(a)*AUTO_WAIT,p.y||0,p.z+Math.sin(a)*AUTO_WAIT);
    if(f.order&&f.order.type==='attack') f.order=null;
    if(f.pos.distanceTo(d)>6&&!(f.order&&f.order.type==='move'&&f.order.dest.distanceTo(d)<4)) order(f,{type:'move',dest:d}); };
  const guard=(p,R,key=dist,list=ships)=>mine.forEach((f,i)=>{ const e=by(f,near(p,R,list),key); if(e) attack(f,e); else wait(f,p,i); });
  /* escort */
  if(op.convoy&&convoy){ if(!convoy.alive) return; const c=convoy.pos, power=u=>u.hpPool*u.dmg, ours=mine.reduce((s,f)=>s+power(f),0);
    const strong=ships.filter(e=>power(e)>ours), tame=ships.filter(e=>!strong.includes(e));
    mine.forEach(f=>{ f.stance=strong.some(e=>e.pos.distanceTo(c)<AUTO_R.escort+30)?'evade':'engage'; });
    let rest=mine;
    if(rescue&&!rescue.done&&!rescue.lost&&rescue.ship.alive&&mine.length>1){ const r=by(rescue.ship,mine,dist); rest=mine.filter(f=>f!==r);
      if(r.pos.distanceTo(rescue.ship.pos)>8&&!(r.order&&r.order.type==='move'&&r.order.dest.distanceTo(rescue.ship.pos)<4)) order(r,{type:'move',dest:rescue.ship.pos.clone()}); }
    rest.forEach((f,i)=>{ const e=by(f,near(c,AUTO_R.escort,tame),craftFirst); if(e) attack(f,e); else wait(f,c,i); }); return; }
  /* defend the station */
  if(op.win&&op.win.type==='defend'&&fortress&&fortress.alive){ guard(fortress.pos,AUTO_R.defend,craftFirst); return; }
  /* 第4節: the carrier */
  if(op.carrier&&opCarrier&&opCarrier.alive){ const S=opCarrier.cs, P=op.body&&op.body.port, port=P&&new THREE.Vector3(P.pos[0],P.alt||0,P.pos[1]);
    if(!S.landed&&port){ const threats=near(port,AUTO_R.port,seen);
      mine.forEach((f,i)=>{ const e=by(f,threats,(a)=>a.pos.distanceTo(port))||by(f,ships,dist); if(e) attack(f,e); else wait(f,port,i); });
      if(portOpen()&&(!threats.length||gameSec*CLOCK_RATE>=(P.openAt||0)+40)&&opCarrier.pos.distanceTo(port)>2&&!(opCarrier.order&&opCarrier.order.type==='move'))
        order(opCarrier,{type:'move',dest:port.clone()});
      return; }
    if(S.done&&!(opCarrier.order&&opCarrier.order.type==='move')) order(opCarrier,{type:'move',dest:S.exit.clone()});
    guard(opCarrier.pos,AUTO_R.carrier,craftFirst); return; }
  /* 第5節: the gates of the base (2026-10-19, user decision: the same moves as the quick response of tools/februaria-sim.cjs, which now runs this):
     the landing ship or craft nearest an open gate's ring (within AUTO_R.gate), then the front the radio calls the hardest pressed,
     then an enemy within AUTO_R.near north of the base; else wait in front of the middle */
  if(op.base&&gates.length){ const open=openGates(), toGate=e=>open.length?Math.min(...open.map(g=>g.ring.distanceTo(e.pos))):1e9, ahead=ships.filter(e=>e.pos.z>-60);
    const landing=ships.filter(e=>(e.ai==='land'||e.ai==='drop'&&!e.unloaded)&&toGate(e)<AUTO_R.gate).sort((a,b)=>toGate(a)-toGate(b));
    const hot=fronts.filter(F=>!F.closed&&F.level>0).sort((a,b)=>b.level-a.level||b.prog-a.prog)[0], inHot=hot?ahead.filter(e=>e.pos.x>=hot.x[0]&&e.pos.x<hot.x[1]):[];
    const inf=troops.filter(g=>g.n>0&&toGate(g)<AUTO_R.gate);   // 2026-10-19: the enemy's infantry by an open gate, when there is nothing else
    mine.forEach((f,i)=>{ const e=landing[0]||by(f,inHot,dist)||by(f,near(f.pos,AUTO_R.near,ahead),dist)||by(f,inf,dist); if(e) attack(f,e); else wait(f,fieldC,i); }); return; }
  /* the exercise: the fortress */
  if(chase&&chase.fleet.alive&&chase.fleet.seen){ mine.forEach(f=>attack(f,chase.fleet)); return; }
  mine.forEach((f,i)=>{ const e=by(f,ships,dist)||(fortress&&fortress.alive&&fortress.team===1?fortress:null); if(e) attack(f,e); else wait(f,fieldC,i); });
}
/* an enemy fleet that comes in (events' fleet). It appears within ±3 of its spot, so no two games are quite alike (2026-10-10, 仮).
   rel: its pos and its arrow are relative to the field centre (a field that moves with the convoy) */
function spawnEnemy(o,arrow,rel){
  const jp=[o.pos[0]+(Math.random()-.5)*6,o.pos[1]+(Math.random()-.5)*6], r=makeFleet(1,{leash:0,...o,pos:rel?relPos(jp):jp}); fleets.push(r);
  if(gates.length) watchOffSealed(r);   // 第5節: not at a gate already sealed
  if(arrow){ const [ax,az]=rel?relPos(arrow.pos):arrow.pos; makeArrow(r.pos,new THREE.Vector3(ax,arrow.alt||0,az),TEAM_COL[1],{life:6}); }
  return r;
}
/* mass (第4節の後半; user decision 2026-10-15): the enemy comes all at once, as many units as ours still in the battle (our own and
   the allies') plus `plus` (1), and they break us one by one (ai:'detail'). own: units that come as they are (they count among them).
   types: [{n, was?, fleet}] the rest by class: n ships (and was W.A.S.) shared out into the units left over, by each class's share of
   the ships, at least one unit a class (so with few of ours left there may be one more). fleet is the template; {n} in its name is
   the unit's number, taken in turn from nums. at: [[x, z, alt], …] where they come in, in turn (a second on the same spot comes
   in 15 aside). The total of ships and W.A.S. stays what the data says. Returns how many units came. 数値は仮 */
function spawnMass(M){
  const ours=fleets.filter(f=>f.team===0&&f.alive&&!f.fixed&&!f.convoy&&!f.ghost&&!f.isCarrier).length;   // our own and the allies' (ward), not the convoy
  const own=M.own||[], types=M.types||[], m=Math.max(types.length,(M.units!=null?M.units:ours+(M.plus==null?1:M.plus))-own.length), tot=types.reduce((s,t)=>s+t.n,0)||1;   // units: a set number of units (2026-10-17)
  /* units a class: largest remainder, at least one each */
  const ideal=types.map(t=>m*t.n/tot), u=ideal.map(x=>Math.max(1,Math.floor(x))), sum=()=>u.reduce((a,b)=>a+b,0);
  while(sum()>m){ const i=u.indexOf(Math.max(...u)); if(u[i]<=1) break; u[i]--; }
  while(sum()<m){ let i=0; ideal.forEach((x,j)=>{ if(x-u[j]>ideal[i]-u[i]) i=j; }); u[i]++; }
  const used=new Map(), spot=k=>{ const a=M.at[k%M.at.length], c=used.get(a)||0; used.set(a,c+1);
    const s=Math.hypot(a[0],a[1])||1, side=c*15*(c%2?1:-1);   // a second and third on one spot stand to either side of it
    return {pos:[a[0]-a[1]/s*side,a[1]+a[0]/s*side],alt:a[2]||0}; };
  const toward=p=>({pos:[p.pos[0]*.4,p.pos[1]*.4],alt:p.alt*.4});   // the arrow points in toward the middle
  let k=0;
  const tag=M.tag?{tag:M.tag}:{};   // tag: the units of this wave, counted by carrier.lastWave (2026-10-17); massAt: when it came (minutes)
  if(M.tag) massAt[M.tag]=gameSec*CLOCK_RATE;
  for(const o of own){ spawnEnemy({...o,...tag},toward({pos:o.pos,alt:o.alt||0})); k++; }
  types.forEach((t,i)=>{ const nu=u[i], nums=t.nums||[]; let c=0;   // c: ships given out so far (the W.A.S. go with the ships)
    for(let j=0;j<nu;j++){ const n=Math.floor(t.n/nu)+(j<t.n%nu?1:0), w=t.was?Math.round(t.was*(c+n)/t.n)-Math.round(t.was*c/t.n):0; c+=n;
      const p=spot(k++), num=nums[j]!=null?nums[j]:90+i*10+j;
      spawnEnemy({...t.fleet,name:t.fleet.name.replace('{n}',num),n,...(t.was?{hangar:{was:w}}:{}),pos:p.pos,alt:p.alt,...tag},toward(p)); } });
  return k;
}
/* ai:'detail' (各個撃破; user decision 2026-10-15, 第4節の後半): the units on it work as one. They go for the one of ours that stands
   most alone (the fewest of our ships within DETAIL_ISO_R of it; then the smaller and the nearer; a preyLast unit last) and hold each
   of the others with one unit apiece, the ones nearest it first (pin), so none can come to its help; all the rest, two at least, go
   for the lone one. As many of theirs as ours plus one makes two on it. When it is gone (or out of sight) they move to the next.
   Each keeps what it was on while that still holds, so they do not swap about. 数値は仮 */
const DETAIL_ISO_R=45;
let detailFocus=null;
function detailPlan(all){
  const G=fleets.filter(f=>f.team===1&&f.alive&&f.ai==='detail'), T=all.filter(x=>!x.isCarrier&&!x.fixed);
  if(!G.length||!T.length){ detailFocus=null; return null; }
  const cx=new THREE.Vector3(); G.forEach(f=>cx.add(f.pos)); cx.multiplyScalar(1/G.length);
  const sup=t=>T.reduce((s,x)=>s+(x!==t&&x.pos.distanceTo(t.pos)<DETAIL_ISO_R?x.ships.length:0),0);
  if(!(detailFocus&&T.includes(detailFocus))){ let bs=1e9; detailFocus=null;
    for(const t of T){ const s=sup(t)+t.ships.length*.5+t.pos.distanceTo(cx)*.05+(t.preyLast?1e3:0); if(s<bs){ bs=s; detailFocus=t; } } }
  const F=detailFocus, near=p=>(a,b)=>a.pos.distanceTo(p.pos)-b.pos.distanceTo(p.pos);
  const others=T.filter(t=>t!==F).sort(near(F)), nF=Math.min(G.length,Math.max(2,G.length-others.length)), plan=new Map();
  for(const f of [...G.filter(f=>f.detailT===F).sort(near(F)),...G.filter(f=>f.detailT!==F).sort(near(F))].slice(0,nF)) plan.set(f,F);
  const free=G.filter(f=>!plan.has(f));
  for(const t of others){ if(!free.length) break; let i=free.findIndex(f=>f.detailT===t); if(i<0){ free.sort(near(t)); i=0; } plan.set(free[i],t); free.splice(i,1); }
  for(const f of free) plan.set(f,F);
  for(const [f,t] of plan) f.detailT=t;
  return plan;
}

function step(dt){
  gameSec+=dt;
  /* timed events, `after` minutes into the operation clock: an enemy fleet arrives, a message, a change of phase, an explosion */
  /* nothing more comes once the enemy falls back (stepRepel) */
  while(repelT==null&&nextEvent<opEvents.length&&gameSec*CLOCK_RATE>=opEvents[nextEvent].after){ const E=opEvents[nextEvent++];
    /* rel: the fleet's pos and its arrow are relative to the field centre (a field that moves with the convoy) */
    /* an enemy that comes in appears within ±3 of its spot, so no two games are quite alike (2026-10-10, 仮) */
    /* fleet.drops (第5節, 2026-10-16): an assault ship picks, as it comes in, the open gate among these held thinnest (weakDrop); {drop} in the log */
    const nf=E.fleet?spawnEnemy(E.fleet,E.arrow,E.rel):null, fd=nf&&E.fleet.drops?weakDrop(E.fleet.drops):null;
    if(fd){ if(nf.ai==='land'||nf.ai==='drop'){ nf.drop=fd.name; nf.dropAt=null; } else nf.watchPos=new THREE.Vector3(fd.pos.x,0,fd.pos.z); }
    const massN=E.mass?spawnMass(E.mass):null;
    if(E.blast) blast(E.blast);
    /* ai: change how the named fleets behave (enemies: f.ai; allies: f.mode) */
    /* shift [dx, dz]: an allied fleet's post moves forward (第5節: ウォン中将 brings the battleships up) */
    /* drops:[名前…] (第5節: the reserve goes where the defence is thinnest): the open gate among these with the fewest of our ships
       and the allies' near it. Assault ships make for it (drop), the others wait there (watch). {drop} in the log is its name */
    const dp=E.ai&&E.ai.drops?weakDrop(E.ai.drops):null;
    if(E.ai&&E.ai.log&&fleets.some(f=>f.alive&&E.ai.fleets.includes(f.name))) logEvent(E.ai.log[0],E.ai.log[1].replace('{drop}',dp?dp.name:''));   // said only if one of them is still there
    if(E.ai) for(const f of fleets) if(f.alive&&E.ai.fleets.includes(f.name)&&!(f.fellBack&&E.ai.ai!=='withdraw')){ if(dp){ if(E.ai.ai==='land'||E.ai.ai==='drop'){ f.drop=dp.name; f.dropAt=null; } else f.watchPos=new THREE.Vector3(dp.pos.x,0,dp.pos.z); }
      if(f.ally){ f.mode=E.ai.ai; if(E.ai.shift){ f.post.x+=E.ai.shift[0]; f.post.z+=E.ai.shift[1]; if(gates.length) postOffSealed(f); } }
      else { f.ai=E.ai.ai; if(E.ai.leash!=null) f.leash=E.ai.leash; if(E.ai.spare) f.spare=E.ai.spare; if(E.ai.keepOut!=null) f.keepOut=E.ai.keepOut; if(gates.length) watchOffSealed(f); } f.order=null; }
    if(E.phase) setPhase(E.phase);
    if(E.text!=null) stageText=E.text;   // the goal panel's line (第5節: an operation without stages)
    lendShips(E.given);
    if(E.log) logEvent(...(massN!=null?[E.log[0],E.log[1].replace('{units}',massN),...E.log.slice(2)]:fd?[E.log[0],E.log[1].replace('{drop}',fd.name),...E.log.slice(2)]:E.log));   // {units}: how many came (mass)
    if(E.scene) playScene(E.scene);   // lines that pause the battle (story on)
  }
  stepConvoy(); stepRescue(dt); stepChase(); stepCarrier(dt);
  for(const u of units()) if(u.revealT>0) u.revealT-=dt;
  fogTimer-=dt; if(fogTimer<=0){fogTimer=FOG_DT; updateFog();}
  aiTimer-=dt; if(aiTimer<=0){aiTimer=.5; enemyAI(); allyAI(); pincers(); autoAI(); stepFronts();}
  stepDefend(dt); stepBase(dt); stepRepel(); stepPhases(dt); stepTimeUp();
  stepWings(dt);
  if(fortress.alive&&fortress.hangars&&fortress.hangars.length) launchCheck(fortress);
  stepSorties();
  for(const f of fleets){
    if(!f.alive) continue;
    if(f.hangars.length&&(f.stance!=='evade'||f.order&&f.order.type==='attack')) launchCheck(f);
    f.retarget-=dt; if(f.retarget<=0){ f.retarget=.4; f.fireTarget=fireTargetOf(f); }
    let goal=null, moving=false;
    if(f.locked&&f.order){ f.order=null; f.queue=[]; dropArrow(f.arrow); f.arrow=null; }   // the carrier on the pad does not move
    if(f.order){
      if(f.order.type==='move'){ moving=true; if(followPath(f,dt)){ f.order=null; if(f.arrow){ dropArrow(f.arrow); f.arrow=null; } nextOrder(f); } }
      else { const t=f.order.target; if(!t.alive){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
        else if(!t.seen){ if(f.team===0&&t.lastPos) order(f,{type:'move',dest:t.lastPos.clone()}); else { f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); } }
        else goal=t; }
    }
    if(f.slowT>0) f.slowT-=dt;
    /* an attack closes until the target is well inside the guns (75% of range); a fleet of carriers only stops sooner,
       once the target is inside 80% (1:4 from the edge) of its shortest launch distance. An enemy fleet going for one of ours
       takes its own side of it (slotOf), so units on the same target close from different sides and do not stack */
    /* the rock in the way of the shot: it keeps closing (round the rock) until it has a clear line */
    f.still=false;
    if(goal){ const stop=standOff(f,goal);
      if(f.team===1&&goal.kind==='fleet'){ const sl=slotOf(f,goal,dt); _w.copy(sl).multiplyScalar(stop).add(goal.pos);
        if(bodyBlocks(_w,goal.pos)||op.body&&_w.distanceTo(bodyC)<bodySurface(_w,op.body.r)+3) f.slotH.applyAxisAngle(_up,dt*.8);   // its spot is behind or in the rock: swing round
        f.still=!stepFight(f,_w,goal,dt); }
      else if(f.ally&&goal.kind==='fleet'&&!goal.fixed){ const sl=allySlot(f,goal); _w.copy(sl).multiplyScalar(stop).add(goal.pos);
        if(bodyBlocks(_w,goal.pos)||op.body&&_w.distanceTo(bodyC)<bodySurface(_w,op.body.r)+3) f.slotA+=dt*.8;
        f.still=!stepFight(f,_w,goal,dt); }
      else stepToward(f,goal.pos,bodyBlocks(f.pos,goal.pos)?0:stop,dt);
    }
    const ft=f.fireTarget;
    /* a gun that fires one heavy shot every `every` seconds (第5節 the batteries on the base, user decision 2026-10-16): the fire of those
       seconds times shotK in one go, then it reloads (loaded, it fires as soon as it has a target). With shot (2026-10-17: one shot sinks
       a corvette), each gun's shot is that, in the data's hit points (before HP_K) */
    if(f.every) f.shotT=Math.max(0,(f.shotT??Math.random()*f.every)-dt);
    if(ft&&ft.alive&&ft.seen&&!f.silent&&gap(f,ft)<=f.range*1.08&&!bodyBlocks(f.pos,ft.pos)){
      if(!goal&&!moving&&!f.fixed&&!f.locked&&!f.convoy&&!f.rescue&&f.stance!=='evade') fallBack(f,ft,dt);
      if(!moving&&(!goal||f.still)){ _v.subVectors(ft.pos,f.pos).normalize(); swingTo(f.heading,_v,dt*2); }
      if(f.every){ if(f.shotT>0) continue; f.shotT=f.every; damage(ft,f.ships.length*(f.shot!=null?f.shot*HP_K:f.dmg*f.every*(f.shotK||1))*(f.pinch||1),f); f.revealT=FIRE_REVEAL; gunShot(f,ft); continue; }
      damage(ft,f.ships.length*f.dmg*dt*(f.pinch||1)*bowK(f,ft),f); f.revealT=FIRE_REVEAL; if(!f.alive) continue;
      const rate=Math.min(f.ships.length,12)*1.6;
      if(Math.random()<rate*dt) shoot(randShip(f),randShip(ft).clone().add(new THREE.Vector3((Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2)),TEAM_COL[f.team],.28);
      if(Math.random()<rate*dt*.5) shoot(randShip(f),randShip(ft),TEAM_COL[f.team],.22);
    }
  }
  spreadAllies(dt);
  if(op.body) for(const f of fleets) if(f.alive&&!f.fixed) keepOffBody(f);
  if(op.civil) for(const f of fleets) if(f.alive&&f.keepOut) keepOutOfZones(f);
  stepField();   // after the convoy has moved this step
  if(fortress.alive){
    fortress.retarget-=dt; if(fortress.retarget<=0){fortress.retarget=.5; fortress.fireTarget=nearestFoe(fortress,fortress.range);}
    const ft=fortress.fireTarget;
    /* the station we defend: its batteries fire at half strength once its armour is under 30% (仮) */
    const dps=fortress.dps*(fortress.defend&&fortress.hpPool/fortress.max<.3?.5:1);
    if(ft&&ft.alive&&ft.seen){ damage(ft,dps*dt,fortress); if(Math.random()<dt*14) shoot(randShip(fortress),randShip(ft),fortress.defend?TEAM_COL[0]:new THREE.Color(1,.55,.3),.35); }
  }
}
