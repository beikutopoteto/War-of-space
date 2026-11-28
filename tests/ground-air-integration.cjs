/* 対象Nodeのみ。実命令・地上step・damage・斉射・補給・Undoを同じVMで接続する。 */
const assert=require('assert/strict');
function nodeChecks(){
 const {ctx,run}=require('./ground-controls.cjs').createControlsContext(),rows=[];
 Object.assign(ctx,{chase:null,groundDrillTick:()=>{}});
 run(require('fs').readFileSync(require('path').join(__dirname,'../data/ground-org.js'),'utf8'));
 run(`
 const realAirVisualDirect=groundVisualDirect;
 function airSetup(){
  op={id:'groundExercise2',ground:'exercise2',groundHQ:null,groundStaticEnemies:true};fleets=[];groundSites=[];groundTerritory=null;groundSupplyNet=null;over=false;undoStack=[];
  gameSec=0;groundVisuals=new THREE.Group();groundVisualDirect=realAirVisualDirect;
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
 return rows;
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`航空統合 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad,null,2));}
