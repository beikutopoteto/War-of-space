/* 対象Nodeのみ。実命令・地上step・damage・斉射・補給・Undoを同じVMで接続する。 */
const assert=require('assert/strict');
function nodeChecks(){
 const {ctx,run}=require('./ground-controls.cjs').createControlsContext(),rows=[];
 const {readFileSync}=require('node:fs');
 run(readFileSync(require.resolve('../battle/loop.js'),'utf8').split('\n').find(line=>line.startsWith('const hash=')));
 Object.assign(ctx,{chase:null,groundDrillTick:()=>{}});
 run(require('fs').readFileSync(require('path').join(__dirname,'../data/ground-org.js'),'utf8'));
 run(`
 const realAirVisualDirect=groundVisualDirect,realGroundFireDirect=groundFireDirect,
  realGroundHeight=groundHeight,realGroundSightHeight=groundSightHeight;
 function airSetup(){
  op={id:'groundExercise2',ground:'exercise2',groundHQ:null,groundStaticEnemies:true};fleets=[];groundSites=[];groundTerritory=null;groundSupplyNet=null;over=false;undoStack=[];
  gameSec=0;revealMode=false;groundVisuals=new THREE.Group();groundVisualDirect=realAirVisualDirect;groundFireDirect=realGroundFireDirect;
  groundHeight=groundSightHeight=()=>0;groundHeightCacheReset();groundForests=[];groundBuildings=[];groundStrikes=[];groundImpacts=[];groundBallisticReset();groundVolleyReset();
 }
 function airUnit(kind='supportAircraft',x=-50,team=0,n=1){
  const f=makeFleet(team,{name:kind,groundKind:kind,type:'cv',n,pos:[x,0],band:kind==='supportAircraft'?'high':'low',stance:'evade'});
  f.band=kind==='supportAircraft'?'high':'low';f.pos.y=groundUnitHeight(f);f.heading.set(1,0,0);f.march.copy(f.heading);f.hpPool=1000;f.hp=1000;f.groundSupply=100;fleets.push(f);return f;
 }
 function airSquad(kind,x,team=0,band='low',platoons=1){
  const f=makeFleet(team,groundUnitSpec({name:kind,kind,at:[groundMapX(x),groundMapY(0)],band,platoons,stance:'evade'}));
  f.heading.set(team?-1:1,0,0);fleets.push(f);groundInitUnit(f);return f;
 }
 function airExercise(){
  op={...WOS_DATA.operations.find(o=>o.id==='groundExercise2'),groundStaticEnemies:false,npc:null};
  revealMode=true;groundHeight=realGroundHeight;groundSightHeight=realGroundSightHeight;
 }
 function airExerciseSpawn(team,kind,at,band='high'){
  const f=makeFleet(team,groundUnitSpec({kind,name:kind,at,band,platoons:1,stance:'engage'}));
  fleets.push(f);groundInitUnit(f);return f;
 }
 function airTick(dt=.05){gameSec+=dt;groundStep(dt);}
 function airUntil(pred,seconds=150){for(let t=0;t<seconds&&!pred();t+=.05)groundStep(.05);return pred();}
 function airArea(f,count=2){const area={...groundAreaShape([new THREE.Vector3()],1,'bomb-test'),sent:new Map()};f.groundAreaSalvo={area,remaining:count,total:count};return area;}
 function airHQ(){op.groundHQ={0:'A',1:'F'};groundSites=[{id:'A',x:4,y:18,radiusKm:1,owner:0,contested:false,pos:new THREE.Vector3(-80,0,0),captureRadius:.2,captureSec:30,progress:[0,0]}];}
 `);
 const check=(name,body)=>{try{run('airSetup();');rows.push({name,ok:!!run(`(()=>{${body}})()`)});}catch(error){rows.push({name,ok:false,error:error.message});}};
 check('遠方の計画は可能だが5km全周即投下はできない',`const f=airUnit(),p=new THREE.Vector3();return groundStrikeInRange(f,p)&&!groundStrikeCanLaunch(f,p)&&!groundStrikeLaunch(f,p)&&groundStrikeCommand([f],p)===1&&f.groundBombRun&&groundStrikes.length===0;`);
 check('航空2機の投下費用は一斉射全体で一回分、姿勢不適合は消費なし',`const f=airUnit('supportAircraft',-50,0,2),p=new THREE.Vector3();airHQ();const before=f.groundSupply;if(groundVolleyStart(f,{point:p})||f.groundSupply!==before)return false;const plan=groundBombRelease(f,p);f.pos.copy(plan.releasePos);f.heading.copy(plan.heading);if(!groundVolleyStart(f,{point:p})||groundStrikes.length!==2||Math.abs(f.groundSupply-(before-groundSupplyRules().airStrike/6))>1e-8)return false;const ledger=f.groundVolley.ledger;for(let i=0;i<100&&f.groundVolley;i++){f.pos.addScaledVector(f.heading,speedOf(f)*.05);groundStrikeStep(.05);}return ledger.fired.size===12&&Math.abs(f.groundSupply-(before-groundSupplyRules().airStrike))<1e-8;`);
 check('投下中の鉛直速度は実運動を使い水平姿勢まで待つ',`const f=airUnit(),p=new THREE.Vector3(),plan=groundBombRelease(f,p);f.pos.copy(plan.releasePos);f.heading.copy(plan.heading);f.groundFlightVelocity=new THREE.Vector3(5,1,0);const s=groundBombSolution(f);return s&&s.velocityMeters.y===25&&groundStrikeInRange(f,p)&&!groundStrikeCanLaunch(f,p);`);
 check('低高度支援機と盤外・非有限の計画を拒否',`const f=airUnit();f.band='low';if(groundStrikeInRange(f,new THREE.Vector3()))return false;f.band='high';return !groundStrikeInRange(f,new THREE.Vector3(999,0,0))&&!groundStrikeInRange(f,new THREE.Vector3(NaN,0,0));`);
 check('自動進入から2機の実投下へ接続し弾道・威力・再装填を維持',`const f=airUnit('supportAircraft',-50,0,2),p=new THREE.Vector3();groundStrikeCommand([f],p);if(!airUntil(()=>groundStrikes.length===2))return false;return groundStrikes.every(s=>s.flight&&s.flight.origin.distanceTo(f.pos)<1e-7&&s.radius===2.4&&s.dmg===16&&s.flight.velocityMeters.x>0&&s.duration!==7)&&Math.abs(f.groundStrikeCooldown-(10+5*2.4/speedOf(f)))<1e-8&&f.groundBombRun.ledger.issued&&f.groundVolley.ledger.fired.size===2;`);
 check('盤端の目標も盤内の進入方向を計画して投下する',`const f=airUnit('supportAircraft',-90),p=new THREE.Vector3(-85,0,0);if(groundBombRelease(f,p).releasePos.x>=-96)return false;if(!groundBombPrepare(f,{point:p}))return false;return airUntil(()=>groundStrikes.length===1,180);`);
 check('逆向きからも瞬時旋回せず進入し直して投下する',`const f=airUnit();f.heading.set(-1,0,0);groundBombPrepare(f,{point:new THREE.Vector3()});groundStep(.05);if(f.heading.x>0)return false;return airUntil(()=>groundStrikes.length===1,180);`);
 check('未観測点でも命令でき視界や敵の存在を投下条件にしない',`const f=airUnit(),p=new THREE.Vector3(70,0,0);if(groundPointSeenBy(0,p))return false;groundStrikeCommand([f],p);const first=f.groundBombRun.ledger.releaseAim.clone();return airUntil(()=>groundStrikes.length===1)&&groundStrikes[0].aim.equals(first);`);
 check('実慣性の着弾を狙点へ強制せず発射後の旋回・撃墜から独立',`const f=airUnit();groundBombPrepare(f,{point:new THREE.Vector3()});if(!airUntil(()=>groundStrikes.length===1))return false;const s=groundStrikes[0],p=s.impact.clone(),mid=groundBallisticAt(s.flight,s.duration/2);f.heading.set(0,0,1);f.pos.set(60,40,50);destroyFleet(f,{name:'test'});groundStep(s.duration);return p.distanceTo(s.aim)>.01&&s.impact.equals(p)&&groundBallisticAt(s.flight,s.duration/2).equals(mid)&&groundImpacts.length===1&&!f.groundBombRun;`);
 check('極薄建物が実投下後の落下を遮れば手前で爆発する',`const f=airUnit(),p=new THREE.Vector3(),plan=groundBombRelease(f,p);f.pos.copy(plan.releasePos);f.heading.copy(plan.heading);groundBuildings=[{minX:-10.000001,maxX:-10,minZ:-1,maxZ:1,bottom:0,top:35}];const s=groundStrikeLaunch(f,p);return s&&s.flight.reason==='building'&&s.impact.x<-9.99&&s.impact.y>0&&s.left<plan.fallSeconds;`);
 check('実着弾まで打撃せず着弾で実damageに接続',`const f=airUnit(),enemy=airUnit('infantry',0,1);enemy.band='ground';enemy.pos.y=0;groundBombPrepare(f,{point:new THREE.Vector3()});if(!airUntil(()=>groundStrikes.length===1))return false;const s=groundStrikes[0];groundVolleyCancel(f);f.groundBombRun=null;enemy.pos.copy(s.impact);const hp=enemy.hpPool;groundStep(s.left-.001);if(enemy.hpPool!==hp)return false;groundStep(.001);return enemy.hpPool<hp&&groundImpacts.length===1;`);
 check('範囲の狙点は進入中に再抽選せず投下時に一斉射1回を消費',`const f=airUnit('supportAircraft',-50,0,2),a=airArea(f,2);groundAreaSalvoStep();const run=f.groundBombRun,p=run.ledger.shot.aim.clone();for(let i=0;i<30;i++)groundStep(.05);if(f.groundBombRun!==run||!run.ledger.shot.aim.equals(p)||f.groundAreaSalvo.remaining!==2||a.sent.size)return false;if(!airUntil(()=>a.sent.get(f)===1))return false;return f.groundAreaSalvo.remaining===1&&groundStrikes.length===2&&run.ledger.issued;`);
 check('通常停止で進入・残回数・予約を解除し未発射弾を消費しない',`const f=airUnit(),a=airArea(f);groundAreaSalvoStep();f.queue=[{type:'move',dest:new THREE.Vector3(20,0,0)}];groundClearOrders(f);for(let i=0;i<500;i++)groundStep(.05);return !f.groundBombRun&&!f.groundAreaSalvo&&!f.queue.length&&!groundStrikes.length&&!groundImpacts.length&&!a.sent.size;`);
 check('別命令は爆撃を解除し通常移動だけ実行する',`const f=airUnit();groundBombPrepare(f,{point:new THREE.Vector3()});const before=f.pos.clone();order(f,{type:'move',dest:new THREE.Vector3(-30,0,20)});groundStep(.05);return !f.groundBombRun&&f.order?.type==='move'&&f.pos.distanceTo(before)>.1&&!groundStrikes.length;`);
 check('Undoは未投下任務だけ復元し消費済み補給を巻き戻さない',`const f=airUnit(),a=airArea(f);groundAreaSalvoStep();const ledger=f.groundBombRun.ledger;saveUndo([f]);groundClearOrders(f);f.groundSupply=47;undo();return f.groundBombRun?.ledger===ledger&&f.groundAreaSalvo.remaining===2&&f.groundSupply===47;`);
 check('発射後のUndoから同じ爆弾を増殖しない',`const f=airUnit();groundBombPrepare(f,{point:new THREE.Vector3()});saveUndo([f]);const ledger=f.groundBombRun.ledger;if(!airUntil(()=>ledger.issued))return false;const cooldown=f.groundStrikeCooldown;undo();return !f.groundBombRun&&groundStrikes.length===1&&f.groundStrikeCooldown===cooldown;`);
 check('範囲Undoも共有sentを参照し残回数を復活させない',`const f=airUnit(),a=airArea(f,2);groundAreaSalvoStep();saveUndo([f]);if(!airUntil(()=>a.sent.get(f)===1))return false;undo();return f.groundAreaSalvo?.remaining===1&&!f.groundBombRun&&groundStrikes.length===1;`);
 check('基地へ実飛行し不在中は停止、未投下任務・残回数・予約を復帰',`const f=airUnit(),a=airArea(f);groundAreaSalvoStep();const ledger=f.groundBombRun.ledger;f.queue=[{type:'move',dest:new THREE.Vector3(20,0,20)}];airHQ();f.groundSupply=0;groundStep(.05);if(f.groundAirState!=='out'||!f.groundAirTask?.bomb||f.groundBombRun||f.queue.length)return false;if(!airUntil(()=>f.groundAirState==='base'))return false;const at=f.pos.clone();groundStep(1);if(!f.pos.equals(at))return false;if(!airUntil(()=>!f.groundAirState,120))return false;return f.groundBombRun?.ledger===ledger&&f.groundAreaSalvo?.remaining===2&&f.queue.length===1&&f.queue[0].dest.x===20&&!a.sent.size;`);
 check('発射済み斉射の帰投復帰は残りだけ維持し装填を巻き戻さない',`const f=airUnit(),a=airArea(f,2);groundAreaSalvoStep();if(!airUntil(()=>a.sent.get(f)===1))return false;if(!airUntil(()=>!f.groundVolley&&!f.groundBombRun))return false;airHQ();f.groundSupply=0;groundStep(.05);if(f.groundAirTask.salvo.remaining!==1||f.groundAirTask.bomb)return false;if(!airUntil(()=>f.groundAirState==='base')||!airUntil(()=>!f.groundAirState,120))return false;return a.sent.get(f)===1&&f.groundAreaSalvo.remaining===1&&!f.groundVolley&&f.groundSupply>90;`);
 check('最終投下の直後だけ予約移動を開始し進入中は消費しない',`const f=airUnit(),a=airArea(f,1);f.queue=[{type:'move',dest:new THREE.Vector3(20,0,20)}];groundAreaSalvoStep();if(!f.queue.length||f.order)return false;if(!airUntil(()=>a.sent.get(f)===1&&!f.groundVolley&&!f.groundBombRun))return false;return !f.queue.length&&f.order?.type==='move'&&!f.groundAreaSalvo&&!f.groundBombRun;`);
 check('支援機への通常の敵攻撃命令も座標を保持して進入・投下する',`const f=airUnit(),t=airUnit('infantry',0,1);t.band='ground';t.pos.y=0;order(f,{type:'attack',target:t});const hp=t.hpPool;if(!airUntil(()=>groundStrikes.length===1))return false;const s=groundStrikes[0];return f.order?.target===t&&s.kind==='supportAircraft'&&Math.abs(s.aim.distanceTo(t.pos)-2*groundStrikeRules().supportAircraft.radius)<1e-7&&t.hpPool===hp&&s.flight;`);
 check('航空中隊は既定・既存編成・作戦指定ともに1小隊4機、耐久40',`
  const org=window.WOS_GROUND_ORG,old=org.normalize({companies:[{id:'old',kind:'attack',platoons:4}]});
  const c=org.addCompany(old,old.battalions[0].id,'fighter');
  org.setPlatoons(old,c.id,4);
  const f=airSquad('fighter',-14,0,'low',4),a=airSquad('attack',0,1,'low',4);
  return [f,a].every(u=>u.groundPlatoons===1&&u.bodies.length===4&&u.hpPool===40)&&c.platoons===1&&old.companies[0].platoons===1&&
    org.defaults().companies.filter(u=>['fighter','attack'].includes(u.kind)).every(u=>u.platoons===1);
 `);
 check('対地の各機は低空接近・引き起こし・降下・離脱と別方向からの再進入を行う',`
  const f=airSquad('attack',-26),t=airUnit('vehicle',0,1),rules=groundRuleSet().airCombat,cruise=rules.cruiseKmSec.attack*GROUND_SCALE;
  t.band='ground';t.pos.y=0;
  const track=groundAirSquadTrack(f),observed=track.bodies.map(()=>({phases:new Set(),dive:[],exit:0,near:Infinity,far:0,climbSpeed:Infinity,diveSpeed:0}));
  const shots=[];groundVisualDirect=(src,i,target,j,from,to)=>{if(src===f)shots.push({i,valid:target===t&&from.equals(groundBodyPosition(f,i))&&groundAirBodyInFront(track.bodies[i],from,{x:to.x,y:.35,z:to.z})&&track.bodies[i].phase==='dive'});};
  order(f,{type:'attack',target:t});
  for(let n=0;n<640;n++){
   const prior=track.bodies.map(b=>({pos:b.pos.clone(),yaw:b.yaw}));airTick();
   for(const [i,b] of track.bodies.entries()){
    const o=observed[i],p=prior[i],horizontal=b.speed*Math.cos(b.pitch);
    const moved=Math.hypot(b.pos.x-p.pos.x,b.pos.z-p.pos.z);
    const limit=groundAirTurnLimit(horizontal,b.turnLoadG,rules)*.05;
    const chordFactor=Math.sin(limit/2)/(limit/2);
    if(b.speed<cruise*rules.minSpeedFactor-1e-8||moved<horizontal*.05*chordFactor-1e-8||
       Math.abs(groundAirAngleDelta(p.yaw,b.yaw))>limit+1e-8||
       1/Math.cos(b.bank)>b.turnLoadG+1e-8)return false;
    o.phases.add(b.phase);
    const radius=Math.hypot(b.pos.x-t.pos.x,b.pos.z-t.pos.z)/GROUND_SCALE;
    o.far=Math.max(o.far,radius);o.near=Math.min(o.near,radius);
    if(b.phase==='pull')o.climbSpeed=Math.min(o.climbSpeed,b.speed);
    if(b.phase==='dive'){
     if(!o.dive.some(p=>p.yaw===b.entryYaw))o.dive.push({yaw:b.entryYaw,at:gameSec});
     if(b.pitch<=-THREE.MathUtils.degToRad(10))o.diveSpeed=Math.max(o.diveSpeed,b.speed);
    }
    if(b.phase==='exit'&&radius>=rules.ground.exitKm-.5&&b.pos.y<=GROUND_SCALE*.7)o.exit++;
   }
  }
  return shots.length>0&&shots.every(s=>s.valid)&&new Set(shots.map(s=>s.i)).size===4&&t.hpPool<1000&&observed.every(o=>
   ['align','approach','pull','dive','exit'].every(p=>o.phases.has(p))&&o.exit>0&&o.near<.75&&o.far>=rules.ground.entryKm-1&&
   o.dive.length>=2&&Math.abs(groundAirAngleDelta(o.dive[0].yaw,o.dive[1].yaw))>.4&&o.diveSpeed>o.climbSpeed)&&
   Math.abs(observed[0].dive[0].at-observed[2].dive[0].at)>.1&&Math.abs(groundAirAngleDelta(observed[0].dive[0].yaw,observed[2].dive[0].yaw))>.15&&
   Math.abs(groundAirAngleDelta(observed[0].dive[0].yaw,observed[1].dive[0].yaw))<.05&&
   Math.abs(groundAirAngleDelta(observed[2].dive[0].yaw,observed[3].dive[0].yaw))<.05;
 `);
 check('機ごとに異なる旋回上限は戦闘機5〜7 G、攻撃機3〜4 G',`
  const rules=groundRuleSet().airCombat;
  if(Math.abs(rules.turnGravityKmSec2-35.28)>1e-8)return false;
  for(const [kind,min,max] of [['fighter',5,7],['attack',3,4]]){
   const f=airSquad(kind,0),bodies=groundAirSquadTrack(f).bodies;
   if(new Set(bodies.map(b=>b.turnLoadG)).size!==4)return false;
   for(const b of bodies){
    const cruise=rules.cruiseKmSec[kind]*GROUND_SCALE;
    groundAirFly(b,.05,cruise,rules,b.yaw+Math.PI,0);
    const load=1/Math.cos(b.bank);
    if(load<min-1e-8||load>max+1e-8||Math.abs(load-b.turnLoadG)>1e-8)return false;
   }
  }
  return true;
 `);
 check('戦闘機は高い位置から2km以内ですれ違いざまに撃って上昇離脱',`
  op.groundRuleOverrides={bands:{heights:{low:1.5*GROUND_SCALE}}};
  const f=airSquad('fighter',-25,0,'high'),t=airSquad('fighter',0,1),track=groundAirSquadTrack(f),shots=[];
  groundVisualDirect=(src,i,target,j,from,to)=>{
   if(src===f)shots.push(target===t&&from.equals(groundBodyPosition(f,i))&&to.equals(groundBodyPosition(t,j))&&
      Math.hypot(from.x-to.x,from.z-to.z)<=8&&track.bodies[i].phase==='dive'&&groundAirBodyInFront(track.bodies[i],from,to));
  };
  order(f,{type:'attack',target:t});
  const start=t.hpPool;let dive=false,climb=false;
  for(let i=0;i<240;i++){
   airTick();
   dive||=track.bodies.some(b=>b.phase==='dive'&&b.velocity.y<0);
   climb||=track.bodies.some(b=>b.phase==='exit'&&b.velocity.y>0);
  }
  return groundTargetRange(f,t)===8&&shots.length>0&&shots.every(Boolean)&&t.hpPool<start&&dive&&climb;
 `);
 check('戦闘機は空戦で低高度の段に移り1.5〜6 kmで双方が撃ち、終了後は高高度に戻る',`
  op.groundStaticEnemies=false;
  const f=airSquad('fighter',-14),t=airSquad('fighter',14,1),squads=[f,t];
  const floor=1.5*GROUND_SCALE,ceiling=6*GROUND_SCALE,passes=new Map();
  const level=(squad,y)=>groundAirSquadTrack(squad).bodies.every(b=>Math.abs(b.pos.y-y)<.01);
  if(squads.some(squad=>squad.band!=='high'||!level(squad,40)))return false;
  airTick();
  if(squads.some(squad=>squad.band!=='high'||!level(squad,40)))return false;
  groundVisualDirect=(src,i,target)=>{
   if((src===f&&target===t||src===t&&target===f)&&!passes.has(src)){
    passes.set(src,{body:groundAirSquadTrack(src).bodies[i],exit:false,reentry:false});
   }
  };
  groundUpdateSight();
  order(f,{type:'attack',target:t});order(t,{type:'attack',target:f});
  for(let step=0;step<200;step++){
   airTick();
   for(const squad of squads){
    if(squad.band!=='low'||groundAirSquadTrack(squad).bodies.some(b=>{
     const height=groundAirPhysicalY(b.pos);
     return height<floor-1e-8||height>ceiling+1e-8;
    }))return false;
    const pass=passes.get(squad);
    if(pass){
     if(pass.body.phase==='exit')pass.exit=true;
     if(pass.exit&&pass.body.phase==='approach')pass.reentry=true;
    }
   }
  }
  if(!squads.every(squad=>passes.get(squad)?.reentry))return false;
  t.alive=false;airTick();
  if(f.band!=='high'||f.order)return false;
  order(f,{type:'move',dest:new THREE.Vector3(40,0,0)});
  return airUntil(()=>level(f,40),10)&&f.band==='high';
 `);
 check('同方向へ飛ぶ相手は後ろから短く追撃し、旋回を始めて離脱する',`
  op.groundStaticEnemies=false;
  const f=airSquad('fighter',-14),t=airSquad('attack',-5,1),track=groundAirSquadTrack(f),lead=track.bodies[0];
  t.heading.set(1,0,0);
  order(t,{type:'move',dest:new THREE.Vector3(72,0,0)});
  order(f,{type:'attack',target:t});
  let shot=false;groundVisualDirect=(src,i)=>{if(src===f&&track.bodies[i].phase==='tail')shot=true;};
  let entered=false;
  for(let i=0;i<28;i++){
   airTick();entered||=lead.phase==='tail';
   if(entered&&lead.phase==='exit')return shot&&Math.abs(lead.bank)>.01&&lead.phaseTime<=groundRuleSet().airCombat.air.tailSec+.1;
  }
  return false;
 `);
 check('地上演習の空戦と対地攻撃で30ゲーム秒、4機ずつ全機が盤内に留まる',`
  for(const kind of ['fighter','attack']){
   airSetup();op.groundStaticEnemies=false;
   const f=airSquad(kind,kind==='fighter'?-14:28),t=kind==='fighter'?airSquad('fighter',14,1):airUnit('vehicle',60,1);
   if(kind==='attack'){t.band='ground';t.pos.y=0;}
   groundUpdateSight();order(f,{type:'attack',target:t});
   if(kind==='fighter')order(t,{type:'attack',target:f});
   if(f.order?.target!==t||kind==='fighter'&&t.order?.target!==f)return false;
   const tracks=(kind==='fighter'?[f,t]:[f]).map(groundAirSquadTrack);
   if(tracks.some(track=>track.bodies.length!==4))return false;
   const inside=()=>tracks.every(track=>track.bodies.every(({pos})=>groundPass(groundMapX(pos.x),groundMapY(pos.z),'air')));
   if(!inside())return false;
   const exited=new Set();
   for(let step=0;step<600;step++){
    airTick();if(!inside())return false;
    for(const track of tracks)if(track.bodies.some(b=>b.phase==='exit'))exited.add(track);
   }
   if(exited.size!==tracks.length)return false;
  }
  return true;
 `);
 check('初認区画の周囲1区画を相手が出ても境界手前で曲がる',`
  op.ground='baikonur2';
  const f=airSquad('fighter',groundWorldX(31)),t=airUnit('fighter',groundWorldX(37),1);
  f.pos.z=t.pos.z=groundWorldZ(29);t.pos.y=1.5*GROUND_SCALE;
  groundUpdateSight();order(f,{type:'attack',target:t});
  const track=groundAirSquadTrack(f);
  airTick();
  const space=track.engagementSpace;
  if(!space||groundMapX(space.minX)!==12||groundMapX(space.maxX)!==48||
     groundMapY(space.maxZ)!==12||groundMapY(space.minZ)!==48)return false;
  let turned=false;
  for(let step=0;step<600;step++){
   t.pos.x=groundWorldX(Math.min(52,37+step*.1));
   airTick();
   if(track.engagementSpace!==space)return false;
   for(const b of track.bodies){
    const x=groundMapX(b.pos.x),y=groundMapY(b.pos.z);
    if(x<12||x>48||y<12||y>48||!groundPass(x,y,'air'))return false;
    turned||=b.turnInward&&Math.abs(b.bank)>.01;
   }
  }
  groundClearOrders(f);airTick();
  return turned&&!track.engagementSpace;
 `);
 check('一撃離脱で戦闘機の各機が30ゲーム秒に1 km以上繰り返し上下する',`
  op.groundRuleOverrides={bands:{heights:{low:1.5*GROUND_SCALE}}};
  const f=airSquad('fighter',-25,0,'high'),t=airUnit('fighter',0,1);
  const bodies=groundAirSquadTrack(f).bodies;
  const heights=bodies.map(()=>({high:0,low:Infinity,dives:0,climbs:0,phase:null,counted:false}));
  order(f,{type:'attack',target:t});
  for(let step=0;step<600;step++){
   airTick();
   for(const [i,b] of bodies.entries()){
    const height=groundAirPhysicalY(b.pos)/GROUND_SCALE,o=heights[i];
    if(height<1.5-1e-8||height>6+1e-8)throw Error(JSON.stringify({step,i,height,band:f.band,alive:t.alive}));
    o.high=Math.max(o.high,height);o.low=Math.min(o.low,height);
    if(o.phase!==b.phase){o.phase=b.phase;o.counted=false;}
    if(!o.counted&&b.phase==='dive'&&b.velocity.y<-.1){o.dives++;o.counted=true;}
    if(!o.counted&&b.phase==='exit'&&b.velocity.y>.1){o.climbs++;o.counted=true;}
   }
  }
  if(!heights.every(o=>o.high-o.low>=1&&o.dives>=2&&o.climbs>=2))throw Error(JSON.stringify(heights));
  return true;
 `);
 check('戦闘機は対地射程0を維持し、許可された場合は攻撃機と同じ進入を使う',`
  const f=airSquad('fighter',-24),t=airUnit('vehicle',0,1);t.band='ground';t.pos.y=0;
  order(f,{type:'attack',target:t});
  if(f.order||groundTargetRange(f,t)!==0)return false;
  op.groundRuleOverrides={unitTypes:{fighter:{fireRangesKm:{ground:10}}}};
  order(f,{type:'attack',target:t});
  groundVisualDirect=()=>{};
  return airUntil(()=>groundAirSquadTrack(f).bodies.some(b=>b.phase==='dive'),16);
 `);
 check('戦闘機・攻撃機は巡航W.A.S.の描画位置を掃射し、最低高度を守って低空離脱・再進入する',`
  for(const kind of ['fighter','attack']){
   airSetup();
   const f=airSquad(kind,-26,0,'high'),t=airSquad('was',0,1,'cruise');
   const track=groundAirSquadTrack(f),rules=groundRuleSet().airCombat,cruise=rules.cruiseKmSec[kind]*GROUND_SCALE;
   const shots=[],dives=new Set();let exited=false,climbed=false;
   groundVisualDirect=(src,i,target,j,from,to,aa)=>{
    if(src===f)shots.push({at:gameSec,valid:!aa&&target===t&&track.bodies[i].phase==='dive'&&
      from.equals(groundBodyPosition(f,i))&&to.equals(groundBodyPosition(t,j))});
   };
   order(f,{type:'attack',target:t});
   for(let step=0;step<280;step++){
    const yaws=track.bodies.map(b=>b.yaw);
    airTick();
    for(const [i,b] of track.bodies.entries()){
     const floor=groundSightHeight(b.pos.x,b.pos.z)+rules.strafe.lowKm*GROUND_SCALE;
     const turn=groundAirTurnLimit(b.speed*Math.cos(b.pitch),b.turnLoadG,rules)*.05;
     if(b.pos.y<floor-1e-8||b.speed<cruise*rules.minSpeedFactor-1e-8||
        Math.abs(groundAirAngleDelta(yaws[i],b.yaw))>turn+1e-8)return false;
     if(i===0&&b.phase==='dive')dives.add(b.entryYaw);
     exited||=b.phase==='exit'&&b.pos.y<1.5*GROUND_SCALE;
     climbed||=b.phase==='climb'&&b.velocity.y>0;
    }
   }
   if(!shots.length||shots[0].at>10||!shots.every(s=>s.valid)||!exited||!climbed||dives.size<2)
    throw Error(JSON.stringify({kind,shots,exited,climbed,dives:[...dives]}));
  }
  return true;
 `);
 check('巡航W.A.S.は航空機が接近すると組の間隔を広げ、通過後に戻りながらバルカンを撃つ',`
  op.groundStaticEnemies=false;
  const f=airSquad('fighter',-26,0,'high'),w=airSquad('was',0,1,'ground'),shots=[];
  w.band='cruise';
  groundVisualDirect=(src,i,target,j,from,to,aa,weapon)=>{
   if(src===w&&target===f)shots.push(aa&&weapon.fx==='gatling'&&groundAAHeightAllows(w,to,f,from)&&
     from.equals(groundBodyPosition(w,i))&&to.equals(groundBodyPosition(f,j)));
  };
  order(f,{type:'attack',target:w});
  const pairGap=bodies=>{
   const [a,b,c,d]=bodies.map(body=>body.pos);
   return Math.hypot((a.x+b.x-c.x-d.x)/2,(a.z+b.z-c.z-d.z)/2)/GROUND_SCALE;
  };
  let start=0,peak=0,returned=false,staggered=false,slide=false,heightSpread=false;
  for(let step=0;step<260&&f.alive;step++){
   airTick();
   const flight=w.groundWasFlight;
   if(!flight?.airEvasion)continue;
   const heights=flight.bodies.map(({pos})=>(pos.y-groundSurfaceHeight(pos.x,pos.z))/GROUND_SCALE);
   if(heights.some(h=>h<.02-1e-8||h>.25+1e-8))return false;
   heightSpread||=Math.max(...heights)-Math.min(...heights)>.06;
   for(const [i,b] of flight.bodies.entries()){
    if(i%2===0&&b.boost>0&&flight.bodies[i+1].boost===0)staggered=true;
    slide||=b.slideBoost>0;
   }
   if(!returned){
    const gap=pairGap(flight.bodies),until=flight.airEvasion.spreadUntil;
    if(!until)start=gap;
    else{
     peak=Math.max(peak,gap);
     if(gameSec>=until) returned=peak-start>.3&&gap<peak-.25;
    }
   }
  }
  if(!(shots.length&&shots.every(Boolean)&&staggered&&slide&&heightSpread&&returned))
   throw Error(JSON.stringify({shots,staggered,slide,heightSpread,start,peak,returned}));
  return true;
 `);
 check('低高度W.A.S.は戦闘機・攻撃機の直線進入を横へ外し、すれ違いからバルカンを撃つ',`
  for(const kind of ['fighter','attack']){
   airSetup();op.groundStaticEnemies=false;
   const f=airSquad(kind,-26,0,'high'),w=airSquad('was',0,1,'low');
   const track=groundAirSquadTrack(f),lead=track.bodies[0],rules=groundRuleSet().airCombat;
   const cruise=rules.cruiseKmSec[kind]*GROUND_SCALE,shots=[];
   groundVisualDirect=(src,i,target,j,from,to,aa,weapon)=>{
    if(src===w&&target===f)shots.push({j,phase:track.bodies[j].phase,valid:aa&&weapon.fx==='gatling'&&
      groundAAHeightAllows(w,to,f,from)&&to.y>1.5*GROUND_SCALE&&
      from.equals(groundBodyPosition(w,i))&&to.equals(groundBodyPosition(f,j))});
   };
   order(f,{type:'attack',target:w});
   let closest=Infinity,side=0,low=Infinity,reentered=false,climbed=false,staggered=false,index=null,previous=null;
   for(let step=0;step<280&&f.alive;step++){
    const yaws=track.bodies.map(b=>b.yaw);airTick();
    for(const [i,b] of track.bodies.entries()){
     const limit=groundAirTurnLimit(b.speed*Math.cos(b.pitch),b.turnLoadG,rules)*.05;
     if(b.speed<cruise*rules.minSpeedFactor-1e-8||Math.abs(groundAirAngleDelta(yaws[i],b.yaw))>limit+1e-8||
        1/Math.cos(b.bank)>b.turnLoadG+1e-8)return false;
    }
    const flight=w.groundWasFlight;
    if(flight?.airEvasion){
     if(flight.bodies.some(b=>b.vel.length()>groundRuleSet().wasFlight.speed.low+1e-8))return false;
     staggered||=flight.bodies.some((b,i)=>i%2===0&&b.slideBoost>0&&flight.bodies[i+1].slideBoost===0);
    }
    if(lead.pass>1){reentered=true;break;}
    if(lead.pass!==1)continue;
    index??=lead.strafeBody;
    if(!['dive','exit','climb'].includes(lead.phase))continue;
    const b=w.groundWasFlight.bodies[index],{x,z}=lead.entryDir;
    const relative=b.pos.clone().sub(lead.pos).setY(0);
    if(previous){
     const delta=relative.clone().sub(previous),u=THREE.MathUtils.clamp(-previous.dot(delta)/(delta.lengthSq()||1),0,1);
     closest=Math.min(closest,previous.clone().addScaledVector(delta,u).length()/GROUND_SCALE);
    }
    previous=relative;
    side=Math.max(side,Math.abs((b.pos.x-lead.entryAim.x)*z-(b.pos.z-lead.entryAim.z)*x)/GROUND_SCALE);
    low=Math.min(low,lead.pos.y/GROUND_SCALE);
    climbed||=lead.phase==='climb'&&lead.velocity.y>0;
   }
   if(!(closest>=.35&&closest<=1.25&&side>=.5&&Math.abs(low-groundBandHeight('low')/GROUND_SCALE)<.55&&reentered&&climbed&&
        staggered&&shots.every(s=>s.valid&&['dive','exit','climb'].includes(s.phase))&&shots.some(s=>s.j===0)))
    throw Error(JSON.stringify({kind,closest,side,low,reentered,climbed,staggered,shots}));
  }
  return true;
 `);
 check('支援機は高高度の直線で全弾を投下し、3×3区画内の大回りと直線で戻る',`
  const f=airSquad('supportAircraft',-40,0,'high'),p=new THREE.Vector3();
  const aa=airSquad('mobileAA',0,1,'ground');
  const track=groundAirSquadTrack(f),b=track.bodies[0],rules=groundRuleSet().airCombat;
  if(f.bodies.length!==1||groundStrikeCommand([f],p)!==1)throw Error('点爆撃の命令が通らない');
  const run=f.groundBombRun,space=run.plan.space,course=run.plan.yaw;
  const allBombs=new Set();let straight=0,returned=0,banked=false,lastYaw=b.yaw;
  for(let step=0;step<480;step++){
   airTick();
   const dyaw=Math.abs(groundAirAngleDelta(lastYaw,b.yaw));lastYaw=b.yaw;
   if(!groundAirInside(b.pos)||groundAirClearanceToEdge(b.pos,space)<0||
      Math.abs(groundAirPhysicalY(b.pos)/GROUND_SCALE-10)>1e-8||
      groundAAHeightAllows(aa,b.pos)||!groundBodyPosition(f,0).equals(b.pos)||
      b.speed<rules.cruiseKmSec.supportAircraft*GROUND_SCALE*rules.minSpeedFactor||
      dyaw>groundAirTurnLimit(b.speed,b.turnLoadG,rules)*.05+1e-8)
    throw Error(JSON.stringify({step,pos:b.pos,space,dyaw,height:groundAirPhysicalY(b.pos),speed:b.speed}));
   if(run.phase==='run'&&dyaw<1e-8&&!run.ledger.issued)straight++;
   for(const s of groundStrikes){
    if(allBombs.has(s))continue;
    const v=s.flight.velocityMeters;
    if(Math.abs(v.y)>1e-8||Math.abs(groundAirAngleDelta(course,Math.atan2(v.x,v.z)))>1e-7)
     throw Error(JSON.stringify({step,course,v}));
    allBombs.add(s);
   }
   if(run.ledger.issued&&Math.abs(b.bank)>.01)banked=true;
   if(banked&&dyaw<1e-8&&Math.cos(b.yaw-course)<-.5)returned++;
  }
  if(!(straight>=3&&allBombs.size===groundStrikeWeapon(f).bombsPerPass&&banked&&returned>40))
   throw Error(JSON.stringify({straight,bombs:allBombs.size,banked,returned}));
  return true;
 `);
 check('支援機の範囲爆撃は各進入で斉射1回を消費し、次の進入でも投下する',`
  const f=airSquad('supportAircraft',-50,0,'high'),area=airArea(f,2);
  groundAreaSalvoStep();const first=f.groundBombRun;
  let entered=false;
  for(let i=0;first&&i<300&&area.sent.get(f)!==1;i++){
   airTick();
   const inside=groundAirClearanceToEdge(f.pos,first.plan.space)>=0;
   if(!groundAirInside(f.pos)||entered&&!inside)return false;
   entered||=inside;
  }
  if(!first||!entered||area.sent.get(f)!==1||f.groundAreaSalvo.remaining!==1)
   throw Error(JSON.stringify({prepared:!!first,sent:area.sent.get(f),phase:first?.phase,pos:f.pos}));
  if(!airUntil(()=>area.sent.get(f)===2&&!f.groundVolley&&!f.groundBombRun,40)||f.groundAreaSalvo)
   throw Error(JSON.stringify({sent:area.sent.get(f),phase:f.groundBombRun?.phase,pos:f.pos}));
  return true;
 `);
 check('支援機の投下途中のUndoは同じ斉射の続きだけを直線で投下する',`
  const f=airSquad('supportAircraft',-40,0,'high'),p=new THREE.Vector3();
  if(groundStrikeCommand([f],p)!==1||!airUntil(()=>f.groundBombRun?.ledger.issued,15))return false;
  const ledger=f.groundVolley.ledger,head=f.heading.clone();
  saveUndo([f]);groundClearOrders(f);undo();
  if(f.groundVolley?.ledger!==ledger||ledger.fired.size!==1)return false;
  let i=0;
  for(;i<100&&f.groundVolley;i++){
   airTick();if(f.heading.distanceTo(head)>1e-7)return false;
  }
  return i>1&&!f.groundBombRun&&ledger.fired.size===groundStrikeWeapon(f).bombsPerPass;
 `);
 check('射程・3D射界・遮蔽は各機の位置で決め、後方や真上には撃たない',`
  const f=airSquad('fighter',-60),t=airSquad('fighter',60,1),a=groundAirSquadTrack(f),b=groundAirSquadTrack(t);
  a.target=t;a.bodies[0].pos.set(-2,9,0);a.bodies[0].yaw=Math.PI/2;a.bodies[0].phase='dive';
  b.bodies[0].pos.set(-3,9,0);b.bodies[1].pos.set(-1,16,0);b.bodies[2].pos.set(3,9,0);b.bodies[3].pos.set(20,9,0);
  t.groundVisible=[true,true];const range=groundTargetRange(f,t);
  const hit=groundBodyTarget(f,0,t,range);
  if(!groundCanFire(f,t)||hit?.j!==2||groundBodyShot(f,0,t,0,range)||groundBodyShot(f,0,t,1,range)||groundBodyTarget(f,0,t,4.99))return false;
  groundBuildings=[{minX:0,maxX:1,minZ:-.5,maxZ:.5,bottom:0,top:12}];
  return !groundCanFire(f,t)&&!groundBodyTarget(f,0,t,range);
 `);
 check('攻撃機10/15kmとWAS5/15km、非航空AAを維持',`const f=airUnit('attack'),t=airUnit('fighter',-45,1),w=airUnit('was');w.band='low';const aa=airUnit('mobileAA');aa.band='ground';return groundTargetRange(f,{band:'ground'})===40&&groundTargetRange(f,t)===60&&groundTargetRange(w,{band:'ground'})===20&&groundTargetRange(w,t)===60&&groundAutoAASource(aa)&&!groundAutoAASource(f);`);
 check('盤端に近い海上の移動先にも到達して飛行を継続する',`const f=airSquad('fighter',-20,0,'high');f.pos.copy(groundPoint(14,22));f.pos.y=groundUnitHeight(f);f.heading.set(0,0,-1);const dest=groundPoint(12,3);order(f,{type:'move',dest});if(!airUntil(()=>!f.order,200))return false;const distance=groundDistanceTo(f,{pos:dest}),at=f.pos.clone();groundStep(.1);return distance<=GROUND_AIR_CONTROL.waypoint+speedOf(f)*.05&&f.pos.distanceTo(at)>0&&groundPass(groundMapX(f.pos.x),groundMapY(f.pos.z),'air');`);
 check('訓練敵・固定敵・基地不在はgroundStepでも移動しない',`const f=airUnit('fighter',-10,1),p=f.pos.clone();groundStep(.05);if(!f.pos.equals(p))return false;op.groundStaticEnemies=false;op.groundDrill=true;groundStep(.05);return f.pos.equals(p);`);
 check('AGL巡航と物理速度は表示18倍の地表移動速度を混ぜない',`const f=airUnit('supportAircraft',0);f.band='low';groundHeight=groundSightHeight=(x,z)=>x*.72;f.pos.y=12.288;groundStep(.05);const h=groundSightHeight(f.pos.x,f.pos.z),expected=(h/18)/.05;return Math.abs(f.pos.y-h-12.288)<1e-7&&Math.abs(f.groundFlightVelocity.y-expected)<1e-6;`);
 check('横切る薄い建物を巡航高度より高くしても機体は上を通る',`const f=airSquad('fighter',0),b=groundAirSquadTrack(f).bodies[0],x=b.pos.x+1;groundBuildings=[{minX:x,maxX:x+.000001,minZ:-1,maxZ:1,bottom:0,top:30}];groundStep(.05);return b.pos.x>x&&b.pos.y>30;`);
 check('高高度40・低高度12.288を格子・高度切替・支援機の投下に使う',`
  const draw=groundDraw,capture=groundCaptureInit,sight=groundSightInit;
  groundBoard=new THREE.Group();groundDraw=groundCaptureInit=groundSightInit=()=>{};
  try{groundInit();}finally{groundDraw=draw;groundCaptureInit=capture;groundSightInit=sight;}
  const vertices=band=>groundGrids[band].geometry.attributes.position;
  if(groundRules().heights.high!==40||groundRules().heights.low!==12.288||
     !vertices('high').count||Math.abs(vertices('high').getY(0)-40.12)>1e-5||
     !vertices('low').count||Math.abs(vertices('low').getY(0)-12.408)>1e-5)return false;
  const f=airUnit();
  if(f.pos.y!==40||groundBombRelease(f,new THREE.Vector3())?.altitudeMeters!==10000)return false;
  if(!groundSetBand([f],'low')||!airUntil(()=>!f.bandTo,6)||f.band!=='low'||f.pos.y!==12.288)return false;
  return groundSetBand([f],'high')&&airUntil(()=>!f.bandTo,6)&&f.band==='high'&&f.pos.y===40;
 `);
 check('戦闘機は高高度の支援機を10ゲーム秒以内に後方から撃ち、離脱・再進入する',`
  op.groundStaticEnemies=false;
  const f=airSquad('fighter',-38),t=airSquad('supportAircraft',-10,1,'high');
  t.heading.set(1,0,0);
  const track=groundAirSquadTrack(f),support=groundAirSquadTrack(t).bodies[0],rules=groundRuleSet().airCombat;
  const prior=track.bodies.map(b=>b.yaw),shots=[];
  groundVisualDirect=(src,i,target,j,from,to)=>{
   if(src!==f)return;
   const rear=to.clone().sub(from);
   shots.push({i,at:gameSec,valid:target===t&&track.bodies[i].phase==='tail'&&
    groundAirDirection(support.yaw).dot(rear)>0&&Math.abs(groundAirPhysicalY(from)-groundAirPhysicalY(to))<=1.5*GROUND_SCALE});
  };
  order(f,{type:'attack',target:t});
  let exited=false,reentered=false;
  for(let n=0;n<200&&t.alive;n++){
   airTick();
   if(f.band!=='high')return false;
   for(const [i,b] of track.bodies.entries()){
    const dyaw=Math.abs(groundAirAngleDelta(prior[i],b.yaw));prior[i]=b.yaw;
    if(Math.abs(groundAirPhysicalY(b.pos)-groundAirPhysicalY(support.pos))>1.5*GROUND_SCALE+1e-8||
       groundAirClearanceToEdge(b.pos,track.engagementSpace)<0||
       b.speed<rules.cruiseKmSec.fighter*GROUND_SCALE*rules.minSpeedFactor||
       dyaw>groundAirTurnLimit(b.speed*Math.cos(b.pitch),b.turnLoadG,rules)*.05+1e-8)return false;
   }
   const first=shots[0]&&track.bodies[shots[0].i];
   if(first?.phase==='exit')exited=true;
   if(exited&&first.phase==='approach')reentered=true;
  }
  if(!(shots.length&&shots[0].at<=10&&shots.every(s=>s.valid)&&exited&&reentered))
   throw Error(JSON.stringify({shots,exited,reentered}));
  t.alive=false;airTick();
  return f.band==='high'&&!f.order&&!track.target;
 `);
 check('地上演習で高高度支援機を目視し10ゲーム秒以内に撃つ',`
  for(const [fighterAt,supportAt] of [[[24,14],[24,20]],[[18,18],[24,18]],[[24,20],[24,14]],[[24,14],[24,25]]]){
   airSetup();airExercise();
   const f=airExerciseSpawn(0,'fighter',fighterAt),s=airExerciseSpawn(1,'supportAircraft',supportAt);
   groundUpdateSight();
   if(f.bodies.length!==4||s.bodies.length!==1||!s.seen)throw Error('初期索敵 '+JSON.stringify({fighterAt,supportAt,seen:s.seen}));
   let shot=false;
   groundVisualDirect=(src,i,target)=>{if(src===f&&target===s)shot=true;};
   order(f,{type:'attack',target:s});
   for(let step=0;step<200&&!shot;step++)airTick();
   if(!shot)throw Error(JSON.stringify({fighterAt,supportAt,seen:s.seen,km:groundDistanceTo(f,s)/GROUND_SCALE}));
  }
  return true;
 `);
 check('見失った支援機は最後の観測進路へ探しに行き、未発見の間は撃たない',`
  airExercise();
  const f=airExerciseSpawn(0,'fighter',[24,14]),s=airExerciseSpawn(1,'supportAircraft',[24,20]);
  s.heading.set(1,0,0);
  groundUpdateSight();order(f,{type:'attack',target:s});
  const last=s.groundContacts[0];
  if(last?.yaw!==Math.PI/2)return false;
  s.pos.copy(groundPoint(1,20));s.pos.y=groundUnitHeight(s);s.heading.set(-1,0,0);
  let shot=false;
  groundVisualDirect=src=>{if(src===f)shot=true;};
  for(let step=0;step<28;step++)airTick();
  return !s.seen&&s.groundContacts[0]===last&&f.order?.target===s&&f.pos.x>last.pos.x+GROUND_SCALE&&f.heading.x>.8&&!shot;
 `);
 check('高高度の支援機は水平20 kmの内側で目視でき、外側では未発見',`
  airExercise();
  airExerciseSpawn(0,'fighter',[12,18]);
  const s=airExerciseSpawn(1,'supportAircraft',[31,18]);
  groundUpdateSight();
  if(!s.seen)return false;
  s.pos.copy(groundPoint(33,18));s.pos.y=groundUnitHeight(s);
  groundUpdateSight();
  return !s.seen;
 `);
 check('支援機は狙われると空域内で進路を変え、攻撃命令を互いに拒否して飛び続ける',`
  op.groundStaticEnemies=false;
  const f=airSquad('supportAircraft',-10,0,'high'),t=airSquad('supportAircraft',25,1,'high');
  const fighter=airSquad('fighter',-65,1),rules=groundRuleSet().airCombat;
  const track=groundAirSquadTrack(f),b=track.bodies[0],other=groundAirSquadTrack(t).bodies[0];
  order(f,{type:'attack',target:t});order(t,{type:'attack',target:f});
  if(f.order||t.order)return false;
  order(fighter,{type:'attack',target:f});
  let shots=0,turned=false,previousYaw=b.yaw;
  groundVisualDirect=src=>{if(src===f||src===t)shots++;};
  for(let n=0;n<40;n++){
   const before=b.pos.clone(),otherBefore=other.pos.clone();airTick();
   const dyaw=Math.abs(groundAirAngleDelta(previousYaw,b.yaw));previousYaw=b.yaw;
   if(track.supportThreat!==fighter||groundAirClearanceToEdge(b.pos,track.supportSpace)<0||
      dyaw>groundAirTurnLimit(b.speed*Math.cos(b.pitch),b.turnLoadG,rules)*.05+1e-8||
      b.pos.distanceTo(before)<.1||other.pos.distanceTo(otherBefore)<.1)return false;
   turned||=Math.abs(groundAirAngleDelta(Math.PI/2,b.yaw))>.2;
  }
  return turned&&shots===0&&!groundStrikes.length&&!f.groundBombRun&&!t.groundBombRun;
 `);
 check('向かい合う相手にも低空から上昇して後方に回り、10ゲーム秒以内に撃つ',`
  op.groundStaticEnemies=false;
  const t=airSquad('supportAircraft',12,1,'high'),f=airSquad('fighter',-12),shots=[];
  const b=groundAirSquadTrack(t).bodies[0],track=groundAirSquadTrack(f);
  for(const aircraft of track.bodies)aircraft.pos.y=groundBandHeight('low');
  groundUpdateSight();
  if(!groundSeenBy(f.team,t))return false;
  groundVisualDirect=(src,i,target,j,from,to)=>{
   if(src===f)shots.push(target===t&&groundAirDirection(b.yaw).dot(to.clone().sub(from))>0&&
    Math.abs(groundAirPhysicalY(from)-groundAirPhysicalY(to))<=1.5*GROUND_SCALE);
  };
  order(f,{type:'attack',target:t});
  for(let i=0;i<200&&!shots.length;i++)airTick();
  return shots.length>0&&shots.every(Boolean)&&f.band==='high';
 `);
 check('戦闘機に狙われても準備済みの爆撃進入と直線投下を続ける',`
  op.groundStaticEnemies=false;
  const f=airSquad('supportAircraft',-40,0,'high'),t=airSquad('fighter',60,1);
  airSquad('supportAircraft',20,1,'high');
  const track=groundAirSquadTrack(f);
  if(!groundStrikeCommand([f],new THREE.Vector3()))return false;
  const run=f.groundBombRun;
  order(t,{type:'attack',target:f});
  groundUpdateSight();
  if(groundSupportThreat(f)!==t)return false;
  for(let i=0;i<260&&!run.ledger.issued;i++){
   airTick();
   if(track.supportThreat||f.groundBombRun!==run)return false;
  }
  return run.ledger.issued&&groundStrikes.length>0;
 `);
 check('6 km離した攻撃機と戦闘機は、全機が低空で離脱を交えながら空戦し続ける',`
  const rules=groundRuleSet().airCombat,scale=GROUND_SCALE,shots=new Set();
  for(const [attackAt,fighterAt] of [[[24,14],[24,20]],[[18,18],[24,18]],[[24,20],[24,14]]]){
   airSetup();airExercise();revealMode=false;
   const a=airExerciseSpawn(0,'attack',attackAt,'low'),f=airExerciseSpawn(1,'fighter',fighterAt);
   // 機動の確認中は撃墜で打ち切らず、8機すべての飛び方を追う。
   groundFireDirect=()=>{};
   groundUpdateSight();
   order(a,{type:'attack',target:f});order(f,{type:'attack',target:a});
   if(a.order?.target!==f||f.order?.target!==a||groundTargetRange(a,f)!==15*scale)return false;
   const tracks=[a,f].map(s=>({s,track:groundAirSquadTrack(s),motion:[]}));
   groundVisualDirect=(src,i,target)=>{if(src===a&&target===f||src===f&&target===a)shots.add(src.groundKind);};
   for(let n=0;n<400;n++){
    for(const {track,motion} of tracks)for(const [i,b] of track.bodies.entries()){
     if(n%200===0)motion[i]={origin:b.pos.clone(),turn:0,span:0,exit:0,low:Infinity,straight:0,longest:0};
     motion[i].yaw=b.yaw;
    }
    airTick();
    for(const {s,track,motion} of tracks){
     if(!track.airTarget||track.strafing||s.band!=='low')return false;
     for(const [i,b] of track.bodies.entries()){
      const m=motion[i],turn=Math.abs(groundAirAngleDelta(m.yaw,b.yaw)),height=groundAirPhysicalY(b.pos);
      const minSpeed=rules.cruiseKmSec[s.groundKind]*scale*rules.minSpeedFactor;
      if(groundAirClearanceToEdge(b.pos,track.engagementSpace)<0||b.speed<minSpeed-1e-8||
         turn>groundAirTurnLimit(b.speed*Math.cos(b.pitch),b.turnLoadG,rules)*.05+1e-8||
         1/Math.cos(b.bank)>b.turnLoadG+1e-8||
         s===f&&(height<1.5*scale-1e-8||height>6*scale+1e-8))return false;
      m.turn+=turn;m.span=Math.max(m.span,Math.hypot(b.pos.x-m.origin.x,b.pos.z-m.origin.z)/scale);
      m.exit+=Number(b.phase==='exit');m.low=Math.min(m.low,(b.pos.y-groundSightHeight(b.pos.x,b.pos.z))/scale);
      m.straight=turn<.03?m.straight+.05:0;m.longest=Math.max(m.longest,m.straight);
     }
    }
    if(n%200===199&&(tracks.some(({motion})=>motion.some(m=>!m.exit||m.turn>=4*Math.PI&&(m.span<12||m.longest<.7)))||
       tracks[0].motion.some(m=>m.low>1.3||m.longest<1)))
     throw Error(JSON.stringify({attackAt,fighterAt,second:gameSec,motion:tracks.map(t=>t.motion)}));
   }
  }
  return shots.has('attack')&&shots.has('fighter');
 `);
 return rows;
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`航空統合 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad,null,2));}
