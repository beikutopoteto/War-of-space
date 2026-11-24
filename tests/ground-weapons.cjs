/* #448: real squad initialization, volley scheduler, blast damage and bomb approach. */
const assert=require('assert/strict');
function nodeChecks(){
 const {run}=require('./ground-controls.cjs').createControlsContext(),rows=[];
 run(`
 function weaponsFresh(){
  groundVolleyReset();op={ground:'exercise2',groundHQ:null};fleets=[];groundSites=[];groundBridges=[];groundStrikes=[];groundImpacts=[];groundForests=[];groundBuildings=[];groundFog=null;
  groundHeight=groundSightHeight=()=>0;groundHeightCacheReset();groundVisuals=new THREE.Group();gameSec=0;over=false;engaged.clear();
  shoot=burst=groundHud=()=>{};groundSeenBy=groundPointSeenBy=()=>true;
 }
 function weaponsUnit(kind='artillery',team=0,x=-20,z=0,type='cv'){
  const f=makeFleet(team,groundUnitSpec({name:'兵器の確認 '+fid,kind,type,at:[12,18],band:kind==='sea'?'sea':kind==='supportAircraft'?'high':'ground',stance:'evade',platoons:1}));
  fleets.push(f);groundInitUnit(f);f.pos.set(x,kind==='supportAircraft'?groundRules().heights.high:0,z);f.heading.set(1,0,0);f.groundDeployed=true;f.groundVisible=[true,true];f.eva=0;return f;
 }
 function weaponsLayout(f,offsets){f.heading.set(0,0,1);f.groundBodySpec={offsets,size:1};f.groundBodyLayouts=f.groundBodyGeometry=null;}
 function weaponsClose(a,b){return Math.abs(a-b)<1e-7;}
 function weaponsBlast(f,p,radius=1,dmg=1,roll=()=>.99){
  groundStrikes.push({source:f,team:f.team,kind:f.groundKind,impact:p.clone(),radius,dmg,left:0});
  const random=Math.random;Math.random=roll;
  try{groundStrikeStep(0);}finally{Math.random=random;}
 }
 function mobilityChances(group,runningGear,engine,destroy){
  op.groundRuleOverrides={strike:{suppress:{chances:{[group]:{runningGear,engine,destroy}}}}};
 }
 function weaponsFinish(f){const ledger=f.groundVolley.ledger;for(let i=0;i<60&&f.groundVolley;i++){gameSec+=.05;groundStrikeStep(.05);}return ledger;}
 `);
 const check=(name,code)=>{try{run('weaponsFresh()');rows.push({name,ok:!!run('(()=>{'+code+'})()')});}catch(e){rows.push({name,ok:false,error:e.message});}};
 check('最大と初期の爆風・装填・areaRadiusを全兵器が別々に持つ',`const s=groundStrikeRules();return [['vehicle',.4,.2,2,4,6],['was',.4,.2,7,8,12],['artillery',.8,.4,7,8,12],['guidedRocket',1.2,.6,7,30,45],['supportAircraft',2.4,1.2,9,10,15],['battleship',1.2,.6,10,10,15],['sea',.48,.24,10,10,15]].every(([k,r,i,a,t,j])=>s[k].radius===r&&s[k].initial.radius===i&&s[k].areaRadius===a&&s[k].reload===t&&s[k].initial.reload===j)&&groundRules().initial.fireEvery===1.5;`);
 check('装甲倍率の全表と既定値',`const s={radius:10};return [['supply',1.3],['infantry',1],['commando',1],['mechanicalAssault',1],['heavyInfantry',.35],['apc',.35],['scout',.35],['artillery',.35],['mobileAA',.35],['guidedRocket',.35],['engineer',.35],['vehicle',.15],['was',.2],['droneHive',1],['sea',.15],['unknown',1]].every(([groundKind,m])=>weaponsClose(groundStrikeRadius(s,{groundKind}),10*m));`);
 check('トラックは元の爆風外・1.3倍の内で実被弾、外では無傷',`const f=weaponsUnit(),t=weaponsUnit('supply',1,1.2),hp=t.hpPool;weaponsLayout(t,t.bodies.map(()=>[0,0]));weaponsBlast(f,new THREE.Vector3());const loss=hp-t.hpPool;if(!(loss>0))return false;t.pos.x=1.301;weaponsBlast(f,new THREE.Vector3());return weaponsClose(t.hpPool,hp-loss);`);
 check('戦車は0.15倍の外で無傷、内なら実被弾',`const f=weaponsUnit(),t=weaponsUnit('vehicle',1,.151);weaponsLayout(t,[[0,0],[0,0],[0,0],[0,0]]);const hp=t.hpPool;weaponsBlast(f,new THREE.Vector3());if(t.hpPool!==hp)return false;t.pos.x=.149;weaponsBlast(f,new THREE.Vector3());return t.hpPool<hp;`);
 check('芯は満額、芯の外は逆二乗、端は1/9、外は0',`const f=weaponsUnit(),t=weaponsUnit('infantry',1,0);weaponsLayout(t,[[0,0],[1/3,0],[.5,0],[1,0],[1.001,0],[2,0]]);const hp=t.bodies.map(b=>b.hp);weaponsBlast(f,new THREE.Vector3());const scale=2*groundRuleSet().combat.damageScale/t.bodies0;return [1,1,4/9,1/9,0,0].every((m,i)=>weaponsClose(hp[i]-t.bodies[i].hp,scale*m));`);
 check('橋も倍率1・芯と同じ逆二乗で端が1/9',`const f=weaponsUnit();groundBridges=[{complete:true,hp:40,pos:new THREE.Vector3(1,0,0)}];groundBridgeHit({source:f,impact:new THREE.Vector3(),radius:1,dmg:9});return groundBridges[0].hp===39;`);
 check('WASの76mmは専用値・遅延5、戦艦と小型艦を分ける',`const w=weaponsUnit('was'),b=weaponsUnit('sea',0,-20,0,'bb'),s=weaponsUnit('sea',0,-20,0,'ff');return groundStrikeWeapon(w)===groundStrikeRules().was&&groundStrikeWeapon(w)!==groundStrikeRules().artillery&&groundStrikeWeapon(w).delay===5&&groundStrikeWeapon(b)===groundStrikeRules().battleship&&groundStrikeWeapon(s)===groundStrikeRules().sea;`);
 check('ロケット3体は36発、各1発はdmg×2/3で札は最初の1つ',`const f=weaponsUnit('guidedRocket'),p=new THREE.Vector3(60,0,0);if(f.bodies0!==3||!groundVolleyStart(f,{point:p}))return false;const ledger=weaponsFinish(f);return ledger.fired.size===36&&ledger.skipped.size===0&&groundStrikes.length===36&&groundStrikes.every(s=>weaponsClose(s.dmg,f.dmg*2/3))&&groundStrikes.filter(s=>s.label).length===1;`);
 check('開始時に1体撃破なら24発・1発の威力は3で割ったまま',`const f=weaponsUnit('guidedRocket');groundBodyHit(f,f.bodies[0],1e6);if(!groundVolleyStart(f,{point:new THREE.Vector3(60,0,0)}))return false;const ledger=weaponsFinish(f);return ledger.entries.length===24&&ledger.fired.size===24&&groundStrikes.every(s=>weaponsClose(s.dmg,f.dmg*2/3));`);
 check('連射中の1体撃破は残り11発を省略しUndoでも復活しない',`const f=weaponsUnit('guidedRocket');groundVolleyStart(f,{point:new THREE.Vector3(60,0,0)});const saved=groundCopyVolley(f.groundVolley);groundBodyHit(f,f.bodies[0],1e6);const ledger=weaponsFinish(f);return ledger.fired.size===25&&ledger.skipped.size===11&&!groundRestoreVolley(f,saved);`);
 check('弾道の発射点は各体、隊指定は各射手に最も近い生存体',`const f=weaponsUnit(),t=weaponsUnit('infantry',1,20);weaponsLayout(f,[[-1,-2],[1,0],[0,2]]);weaponsLayout(t,[[0,-3],[0,0],[0,3],[2,-3],[2,0],[2,3]]);t.bodies[1].alive=false;const positions=f.bodies.map((b,i)=>groundBodyPosition(f,i));if(!groundVolleyStart(f,{point:t.pos,target:t}))return false;return groundStrikes.length===f.bodies0&&groundStrikes.every((s,i)=>{const candidates=t.bodies.flatMap((b,j)=>b.alive?[groundBodyPosition(t,j)]:[]),distance=p=>Math.hypot(p.x-positions[i].x,p.z-positions[i].z),nearest=candidates.sort((a,b)=>distance(a)-distance(b))[0];return s.aim.equals(nearest)&&weaponsClose(s.flight.origin.x,positions[i].x)&&weaponsClose(s.flight.origin.z,positions[i].z);});`);
 check('隊指定は見失った体の現在位置を追わず連射を中止',`const f=weaponsUnit('guidedRocket'),t=weaponsUnit('infantry',1,20);groundVolleyStart(f,{point:t.pos,target:t});const ledger=f.groundVolley.ledger;groundSeenBy=()=>false;groundStrikeStep(.25);return !f.groundVolley&&ledger.fired.size===3;`);
 check('砲撃AIは1隊でも3体の密集なら撃つ',`const f=weaponsUnit(),t=weaponsUnit('infantry',1,0);weaponsLayout(t,[[0,0],[.1,0],[.2,0],[8,0],[10,0],[12,0]]);groundStrikeAI(f);return groundStrikes.length===f.bodies0&&groundStrikes.every(s=>s.aim.x===0);`);
 check('砲撃AIは2隊でも1点に2体までなら撃たない',`const f=weaponsUnit(),a=weaponsUnit('infantry',1,0),b=weaponsUnit('infantry',1,.1);for(const t of [a,b]){t.bodies.slice(1).forEach(x=>x.alive=false);weaponsLayout(t,t.bodies.map(()=>[0,0]));}groundStrikeAI(f);return groundStrikes.length===0;`);
 check('砲撃AIの体数にも装甲別の半径を適用',`const f=weaponsUnit(),t=weaponsUnit('vehicle',1,0);weaponsLayout(t,[[0,0],[.2,0],[.4,0],[.6,0]]);groundStrikeAI(f);return groundStrikes.length===0;`);
 check('範囲砲撃の幅は従来値、長さだけ生存体数で変わる',`const f=weaponsUnit('guidedRocket'),before=groundAreaLimits([f]);groundBodyHit(f,f.bodies[0],1e6);const after=groundAreaLimits([f]);return before.radius===7&&before.length===42&&after.radius===7&&after.length===28;`);
 check('無誘導ロケットは対戦車・対空の相性なし、航空を射撃できない',`const f=weaponsUnit('guidedRocket'),t=weaponsUnit('vehicle',1,0),a=weaponsUnit('fighter',1,0);return [t,a].every(target=>{const w=groundDirectWeapon(f,target);return w.power===f.dmg&&w.armorFactor===1;})&&!groundTargetRange(f,a)&&!('rocketTank' in groundRuleSet().combat)&&!('rocketAir' in groundRuleSet().combat);`);
 check('76mmと小型艦は25m式、戦艦0.4%、ロケット2%、戦車は20m',`const w=weaponsUnit('was'),s=weaponsUnit('sea',0,-20,0,'ff'),b=weaponsUnit('sea',0,-20,0,'bb'),r=weaponsUnit('guidedRocket');return weaponsClose(groundScatterAtDistance(w,40),.05)&&weaponsClose(groundScatterAtDistance(w,80),.1)&&weaponsClose(groundScatterAtDistance(s,40),.05)&&weaponsClose(groundScatterAtDistance(b,280),.56)&&weaponsClose(groundScatterAtDistance(r,120),1.2)&&groundStrikeRules().vehicle.spread===.08;`);
 check('距離散布は未観測で2倍にせず戦車だけ2倍、爆弾は0',`const f=weaponsUnit('was'),p=new THREE.Vector3(20,0,0);const seen=groundStrikeLaunch(f,p);groundPointSeenBy=()=>false;f.groundStrikeCooldown=0;const blind=groundStrikeLaunch(f,p);const v=weaponsUnit('vehicle',0,-8);const tank=groundStrikeLaunch(v,new THREE.Vector3());return seen&&blind&&seen.spread===blind.spread&&tank.spread===.16;`);
 check('初期値を変えても現在の発射の半径・装填は最大値',`const f=weaponsUnit();groundStrikeRules().artillery.initial={radius:999,reload:999};const s=groundStrikeLaunch(f,new THREE.Vector3());return s.radius===.8&&f.groundStrikeCooldown===8;`);
 check('爆弾は実進入1回で6発、3発目が指定点で2.4ずつ',`const f=weaponsUnit('supportAircraft',0,-50),p=new THREE.Vector3(),shots=[],launch=groundStrikeLaunch;groundStrikeLaunch=(...args)=>{const s=launch(...args);if(s)shots.push(s);return s;};try{if(!groundBombPrepare(f,{point:p}))return false;for(let i=0;i<4000&&(f.groundBombRun||f.groundVolley);i++){gameSec+=.05;groundStep(.05);}const ok=shots.length===6&&shots.every(s=>s.spread===0&&s.dmg===f.dmg)&&shots.every((s,i)=>weaponsClose(s.aim.x,(i-2)*2.4))&&shots.filter(s=>s.label).length===1&&!f.groundBombRun&&!f.groundVolley;if(!ok)throw Error(JSON.stringify({shots:shots.map(s=>({aim:s.aim.toArray(),dmg:s.dmg,spread:s.spread,label:s.label})),run:!!f.groundBombRun,volley:!!f.groundVolley}));return ok;}finally{groundStrikeLaunch=launch;}`);
 check('真下や斜め・盤端の指定でも予定列の3発目は指定点',`const f=weaponsUnit('supportAircraft',0,0);let accepted=0;for(const [x,z] of [[0,0],[-50,20],[80,-50]])for(const [tx,tz] of [[0,0],[-85,0],[80,60]]){f.groundBombRun=null;f.pos.set(x,19.2,z);f.heading.set(1,0,0);f.groundFlightVelocity=null;const p=new THREE.Vector3(tx,0,tz);if(!groundBombPrepare(f,{point:p}))continue;accepted++;const run=f.groundBombRun,c=run.ledger.releaseAim.clone().addScaledVector(run.plan.heading,4.8);if(!weaponsClose(c.x,p.x)||!weaponsClose(c.z,p.z))return false;}return accepted>0;`);
 check('機体の真下を指定しても実進入で3発目が指定点の6発が出る',`const f=weaponsUnit('supportAircraft',0,0),shots=[],launch=groundStrikeLaunch;groundStrikeLaunch=(...args)=>{const s=launch(...args);if(s)shots.push(s);return s;};try{if(!groundBombPrepare(f,{point:new THREE.Vector3()}))return false;for(let i=0;i<4000&&(f.groundBombRun||f.groundVolley);i++){gameSec+=.05;groundStep(.05);}const ok=shots.length===6&&weaponsClose(shots[2].aim.x,0)&&weaponsClose(shots[2].aim.z,0);if(!ok)throw Error(JSON.stringify({aims:shots.map(s=>s.aim.toArray()),pos:f.pos.toArray(),run:f.groundBombRun?.phase,issued:f.groundBombRun?.ledger.issued}));return ok;}finally{groundStrikeLaunch=launch;}`);
 check('爆弾の途中の停止とUndoは未投下分だけを再開し6発で終わる',`const f=weaponsUnit('supportAircraft',0,-50),shots=[],launch=groundStrikeLaunch;groundStrikeLaunch=(...args)=>{const s=launch(...args);if(s)shots.push(s);return s;};try{groundBombPrepare(f,{point:new THREE.Vector3()});for(let i=0;i<4000&&!f.groundVolley;i++){gameSec+=.05;groundStep(.05);}if(shots.length!==1)return false;const ledger=f.groundVolley.ledger;saveUndo([f]);groundClearOrders(f);undo();if(f.groundVolley?.ledger!==ledger||!f.groundBombRun)return false;for(let i=0;i<4000&&(f.groundBombRun||f.groundVolley);i++){gameSec+=.05;groundStep(.05);}return shots.length===6&&ledger.fired.size===6&&!f.groundBombRun&&!f.groundVolley;}finally{groundStrikeLaunch=launch;}`);
 check('間接の砲撃は地点攻撃の弾だけ2倍、戦車の地点攻撃は3倍、爆弾はそのまま、自走砲の直射は6',`const s=groundStrikeRules();if(!['was','artillery','guidedRocket','battleship','sea'].every(k=>s[k].dmgScale===2)||s.vehicle.dmgScale!==3||s.supportAircraft.dmgScale!==undefined)return false;const a=weaponsUnit(),v=weaponsUnit('vehicle',0,-8),b=weaponsUnit('sea',0,-20,0,'bb');const sa=groundStrikeLaunch(a,new THREE.Vector3()),sv=groundStrikeLaunch(v,new THREE.Vector3()),sb=groundStrikeLaunch(b,new THREE.Vector3());return sa&&sv&&sb&&weaponsClose(sa.dmg,a.dmg*2/a.bodies0)&&weaponsClose(sv.dmg,v.dmg*3/v.bodies0)&&weaponsClose(sb.dmg,b.dmg*2)&&groundRuleSet().unitTypes.artillery.dmg===12&&groundDirectWeapon(a,weaponsUnit('infantry',1,0)).power===6;`);
 check('士気満タン・半分・ゼロで実被弾量は50%・75%・100%',`
  op.groundHQ={0:'A',1:'F'};
  const f=weaponsUnit('vehicle',0,-2),scale=groundRuleSet().combat.damageScale;
  return [100,50,0].every((morale,i)=>{
   const t=weaponsUnit('vehicle',1,0);t.groundMorale=morale;
   const hp=t.hpPool;damage(t,10,f);
   return weaponsClose(hp-t.hpPool,10*scale*[.5,.75,1][i])&&weaponsClose(t.groundMorale,Math.max(0,morale-10*scale*200/250));
  });`);
 check('同じ耐久割合の被弾と体の割合の損失なら小隊数で士気の減りが変わらない',`
  op.groundHQ={0:'A',1:'F'};
  return [1,4].every(p=>{
   const t=makeFleet(1,groundUnitSpec({name:'小隊数の確認',kind:'vehicle',at:[12,18],platoons:p}));
   groundInitUnit(t);
   groundMoraleHit(t,t.groundMaxHp*.05,{h:1,m:1},1,false);
   if(!weaponsClose(t.groundMorale,90))return false;
   for(const b of t.bodies.slice(0,p))groundBodyHit(t,b,b.hp);
   return weaponsClose(t.groundMorale,77.5);
  });`);
 check('W.A.S. は地上・飛行の回避と士気の軽減を受け、被弾・体の損失で士気が減る',`
  op.groundHQ={0:'A',1:'F'};
  return [['ground',.7],['cruise',.5]].every(([band,evasionFactor])=>{
   const f=weaponsUnit('vehicle',0,-2),t=weaponsUnit('was',1,0);t.band=band;
   const body=t.bodies[0],raw=10*groundRuleSet().combat.damageScale*evasionFactor;
   const max=groundMoraleMax(t);
   for(const morale of [max,max/2]){
    t.groundMorale=morale;const hp=t.hpPool;damage(t,10,f,null,body);
    if(!weaponsClose(hp-t.hpPool,raw*(1-.5*morale/max))||!weaponsClose(t.groundMorale,morale-raw*200/150))return false;
   }
   const morale=t.groundMorale;groundBodyHit(t,body,body.hp);
   if(!weaponsClose(t.groundMorale,morale-max*.5/t.bodies0))return false;
   t.groundMorale=1;damage(t,10,f);
   return t.alive&&t.groundMorale===0&&t.groundRout==='routing';
  });`);
 check('携帯対戦車弾の実被弾は正面より側面で重く、森の待ち伏せは側面扱い',`
  const f=weaponsUnit('infantry',0,-2),t=weaponsUnit('vehicle',1,0),scale=groundRuleSet().combat.damageScale;
  const hit=()=>{const hp=t.hpPool;groundFireDirect(f,t,1);return hp-t.hpPool;};
  const want=plate=>2.5*scale*(.03+.97/(1+(plate/700)**4));
  t.heading.set(-1,0,0);const front=hit();
  t.heading.set(0,0,1);const side=hit();
  t.heading.set(-1,0,0);groundForests=[{x:f.pos.x,z:f.pos.z,r:.1}];
  return weaponsClose(front,want(2200))&&weaponsClose(side,want(500))&&side>front&&weaponsClose(hit(),side);
 `);
 check('重強化歩兵の上面ミサイルは戦車の向きによらず、装輪装甲車は耐久225・直射3',`
  const f=weaponsUnit('heavyInfantry'),t=weaponsUnit('vehicle',1,0),apc=weaponsUnit('apc');
  t.heading.set(-1,0,0);const front=groundDirectWeapon(f,t);
  t.heading.set(0,0,1);const side=groundDirectWeapon(f,t);
  return front.power===7&&weaponsClose(front.armorFactor,.03+.97/(1+(150/2000)**4))&&front.armorFactor===side.armorFactor&&
   apc.groundMaxHp===225&&groundDirectWeapon(apc,t).power===3;
 `);
 check('爆風の威力表・士気・制圧または衝撃を各兵科の実着弾で確認',`
  op.groundHQ={0:'A',1:'F'};
  const f=weaponsUnit('artillery'),scale=groundRuleSet().combat.damageScale;
  const cases=[
   ['infantry',2,1,.1,10],['supply',2,1,.1,10],['commando',2,1,.1,10],
   ['mechanicalAssault',1.8,1,.1,10],['heavyInfantry',1.5,1,.4,10],
   ...['apc','scout','engineer','artillery','guidedRocket','mobileAA'].map(kind=>[kind,1.25,.7,.7,5]),
   ['vehicle',1,.4,.7,5],['was',1,.7,.7,5]
  ];
  for(const [kind,soft,resist,slow,seconds] of cases){
   gameSec=0;
   const t=weaponsUnit(kind,1,0);fleets=[f,t];weaponsLayout(t,t.bodies.map(()=>[0,0]));
   const raw=scale*soft*(kind==='was'?.7:1)/t.bodies0,max=groundMoraleMax(t),hp=t.hpPool,loss=raw*2.5*resist*200/hp;
   const expected=t.bodies.reduce((sum,b,i)=>sum+raw*(1-.5*(max-i*loss)/max),0);
   weaponsBlast(f,t.pos);
   if(!weaponsClose(hp-t.hpPool,expected)||!weaponsClose(t.groundMorale,max-loss*t.bodies0)||!weaponsClose(groundSupplySpeedFactor(t),slow))return false;
   t.groundHitLeft=2;
   if(!weaponsClose(groundSupplySpeedFactor(t),Math.min(.65,slow)))return false;
   t.groundHitLeft=0;gameSec=seconds-.01;
   if(!weaponsClose(groundSupplySpeedFactor(t),slow))return false;
   gameSec=seconds;if(groundSupplySpeedFactor(t)!==1)return false;
  }
  return ['vehicle','was','sea','bridge','droneHive'].every(kind=>groundStrikeDamageFactor(kind)===1);
 `);
 check('歩兵は再着弾から改めて10秒間0.1倍',`
  const f=weaponsUnit(),t=weaponsUnit('infantry',1,0);
  weaponsLayout(t,t.bodies.map(()=>[0,0]));
  weaponsBlast(f,t.pos);gameSec=9;weaponsBlast(f,t.pos);
  gameSec=18.99;if(!weaponsClose(speedOf(t),t.speed*.1))return false;
  gameSec=19;return groundSupplySpeedFactor(t)===1;
 `);
 check('足回り確率1では最初の当選だけを使い、衝撃5秒と修理30秒が別に切れる',`
  mobilityChances('heavyVehicle',1,1,1);
  const f=weaponsUnit(),t=weaponsUnit('vehicle',1,0);
  weaponsLayout(t,[[0,0],[2,0],[3,0],[4,0]]);
  let rolls=0;
  weaponsBlast(f,t.pos,4,1,()=>{rolls++;return .5;});
  const average=(.4+3)/4;
  if(rolls!==1||!t.bodies.every(b=>b.alive)||!weaponsClose(groundSupplySpeedFactor(t),average*.7))return false;
  gameSec=5;if(!weaponsClose(groundSupplySpeedFactor(t),average))return false;
  gameSec=29.99;if(!weaponsClose(groundSupplySpeedFactor(t),average))return false;
  gameSec=30;return groundSupplySpeedFactor(t)===1;
 `);
 check('エンジン確率1では足回りより遅く、応急修理までの60秒を別に数える',`
  const f=weaponsUnit(),t=weaponsUnit('apc',1,0);
  weaponsLayout(t,t.bodies.map((b,i)=>[i*2,0]));
  mobilityChances('lightVehicle',1,0,0);weaponsBlast(f,t.pos);
  gameSec=1;mobilityChances('lightVehicle',0,1,1);weaponsBlast(f,t.pos);
  const average=(.15+t.bodies0-1)/t.bodies0;
  if(!weaponsClose(groundSupplySpeedFactor(t),average*.7)||!t.bodies[0].alive)return false;
  gameSec=6;if(!weaponsClose(groundSupplySpeedFactor(t),average))return false;
  gameSec=60.99;if(!weaponsClose(groundSupplySpeedFactor(t),average))return false;
  gameSec=61;return groundSupplySpeedFactor(t)===1;
 `);
 check('撃破確率1では被弾した体だけ撃破し、全滅まで通常の耐久・士気処理を通る',`
  op.groundHQ={0:'A',1:'F'};
  const f=weaponsUnit(),t=weaponsUnit('vehicle',1,0);
  weaponsLayout(t,[[0,0],[2,0],[3,0],[4,0]]);
  mobilityChances('heavyVehicle',1,0,0);weaponsBlast(f,t.pos,4);
  const hp=t.hpPool,bodyHp=t.bodies[0].hp,morale=t.groundMorale;
  if(!(groundSupplySpeedFactor(t)<.7))return false;
  mobilityChances('heavyVehicle',0,0,1);
  weaponsBlast(f,t.pos,4);
  if(t.bodies[0].alive||!t.bodies.slice(1).every(b=>b.alive)||!weaponsClose(t.hpPool,hp-bodyHp)||!(t.groundMorale<morale-12.5)||!weaponsClose(groundSupplySpeedFactor(t),.7))return false;
  weaponsLayout(t,t.bodies.map(()=>[0,0]));
  weaponsBlast(f,t.pos,4);
  return !t.alive&&t.hpPool===0&&!t.ships.length&&t.bodies.every(b=>!b.alive);
 `);
 check('地上 W.A.S. の部位損傷は距離減衰で抽選し、飛行中は着弾しない',`
  mobilityChances('heavyVehicle',1,0,0);
  const f=weaponsUnit(),t=weaponsUnit('was',1,0),flying=weaponsUnit('was',1,0);
  flying.band='cruise';
  weaponsLayout(t,t.bodies.map((b,i)=>[i===0?0:i===1?.8:2*i,0]));
  let rolls=0;
  weaponsBlast(f,t.pos,4,1,()=>{rolls++;return .2;});
  return rolls===2&&!!t.bodies[0].groundMobility&&!t.bodies[1].groundMobility&&flying.hpPool===flying.groundMaxHp&&groundSupplySpeedFactor(flying)===1;
 `);
 return rows;
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`| 地上兵器 | ${rows.length-bad.length}/${rows.length} | ${JSON.stringify(bad)} |`);assert.equal(bad.length,0);}
