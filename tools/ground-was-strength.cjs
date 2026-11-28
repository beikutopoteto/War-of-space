/* #525: node tools/ground-was-strength.cjs [--baseline|--mobile-aa [--km=<num>]|--aircraft|--was-vs-was]
   通常の step・命令・補給で早送り。--baseline は HEAD の戦闘コードで歩行を比較する。
   --mobile-aa は陸戦型 W.A.S. と自走対空砲の対決を武器別の与ダメージ付きで測る。
   --aircraft は対空砲1小隊と、4 km で射程内にとどまり反撃しない航空1小隊を測る。
   --was-vs-was は相互に攻撃を命じた巡航同士と巡航対歩行を測る。 */
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {openGame,ROOT}=require('./browser.cjs');

function prepareField(){
  window.requestAnimationFrame=()=>0;
  WOS.start({op:'groundfield150',fleets:[]});
  if(talking)endTalk();
  if(deploying)endDeploy();
  setSpeed(0);
  op={...op,npc:null,groundStaticEnemies:false,groundHQ:{}};
  const d=groundData();
  d.terrain.cells.fill('平地');
  d.objects.roads=[];
  groundBuildings=[];groundForests=[];groundSites=[];groundBridges=[];
  groundFog=null;groundTerritory=null;groundSupplyNet=null;
  groundHeight=groundSightHeight=()=>0;groundHeightCacheReset();groundSightReset();
  groundPass=(x,y)=>x>1&&x<149&&y>1&&y<99;
  groundFactor=()=>1;
  groundSeenBy=groundPointSeenBy=()=>true;
}

function measure({seed,scenario,enemyKind,platoons=1,walking:walkingOpt,distanceKm,aircraftKind,wasOpponentBand,first,enemyPlatoons}){
  for(const f of fleets){
    groundClearOrders(f);
    f.groundModel?.parent?.remove(f.groundModel);
    f.el.remove();
  }
  fleets=[];fid=1;gameSec=0;over=false;engaged.clear();groundFxReset();
  const savedRandom=Math.random;
  const savedFireDirect=groundFireDirect;
  const savedBodyHit=groundBodyHit;
  const savedReactive=groundWasReactiveArmor;
  Math.random=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
  const breakdown={was:{},enemy:{}};
  const firstShotAt={was:null,enemy:null};
  const round=n=>Number(n.toFixed(2));
  let activeShot=null,reactiveCount=0;
  const weaponName=(f,aa,weapon)=>{
    if(f.groundKind==='was'){
      if(aa)return '対空';
      if(weapon?.fx==='gatling')return '30mmバルカン';
      if(weapon?.fx==='rocket')return '対艦ロケット';
      return '88mm砲';
    }
    if(f.groundKind==='mobileAA')return aa?'対空(aa)':'直射(direct)';
    return aa?'対空':(weapon?.fx||'直射');
  };
  const statFor=(side,name)=>breakdown[side][name]||(breakdown[side][name]={shots:0,applied:0,hp:0,armorFactorSum:0,plateSum:0,pen:null,power:null,minDist:Infinity,maxDist:0});
  if(enemyKind==='mobileAA'){
    groundFireDirect=(f,t,share,aa=false,body=null,weapon=groundDirectWeapon(f,t,aa))=>{
      const side=f.team===0?'was':'enemy';
      firstShotAt[side]??=round(gameSec);
      const entry=statFor(side,weaponName(f,aa,weapon));
      const distKm=groundDistanceTo(f,t)/GROUND_SCALE;
      entry.shots++;
      entry.armorFactorSum+=weapon?.armorFactor??1;
      entry.plateSum+=weapon?.plate??0;
      if(entry.pen===null)entry.pen=weapon?.pen??null;
      if(entry.power===null)entry.power=weapon?.power??null;
      if(distKm<entry.minDist)entry.minDist=distKm;
      if(distKm>entry.maxDist)entry.maxDist=distKm;
      activeShot=entry;
      try{return savedFireDirect(f,t,share,aa,body,weapon);}
      finally{activeShot=null;}
    };
    groundBodyHit=(f,body,amt,showLoss=true)=>{
      const before=body?.alive?body.hp:0;
      const res=savedBodyHit(f,body,amt,showLoss);
      if(activeShot&&amt>0){
        const after=body?.alive?body.hp:0;
        activeShot.applied+=amt;
        activeShot.hp+=Math.max(0,before-after);
      }
      return res;
    };
    groundWasReactiveArmor=(body,weapon)=>{
      const mult=savedReactive(body,weapon);
      if(mult<1)reactiveCount++;
      return mult;
    };
  }
  try{
    const unit=(kind,team,x,z,stance='engage',unitPlatoons=1)=>{
      const f=makeFleet(team,{groundKind:kind,name:groundRuleSet().unitTypes[kind].name,type:'cv',n:1,scale:.3,pos:[x,z],groundPlatoons:unitPlatoons,stance});
      fleets.push(f);groundInitUnit(f);f.groundDeployed=true;
      f.heading.set(team?-1:1,0,0);
      // 元の装填の初期位相の範囲内で、シードごとに発射順を変える。
      for(const body of f.bodies){
        body.shotT=Math.random()*groundRules().fireEvery;
        body.aaT=Math.random()*groundRules().fireEvery;
      }
      return f;
    };
    const dt=.05,cap=180;
    if(wasOpponentBand){
      const sides=[unit('was',0,-3,0,'evade',platoons),unit('was',1,0,0,'evade',platoons)];
      const startBands=['cruise',wasOpponentBand],landedAt=[null,null];
      for(const [i,f] of sides.entries()){
        f.band=startBands[i];f.pos.y=groundUnitHeight(f);
        for(const b of f.bodies)b.parallelT=Math.random()*groundRules().fireEvery;
      }
      for(const [i,f] of sides.entries())order(f,{type:'attack',target:sides[1-i]});
      let dogfightSec=0;
      for(let tick=0;tick<cap/dt&&sides.every(f=>f.alive);tick++){
        step(dt/groundRuleSet().movement.timeScale);
        if(sides.every(f=>f.groundWasFlight?.dogfight))dogfightSec+=dt;
        for(const [i,f] of sides.entries()){
          if(f.alive&&startBands[i]==='cruise'&&f.band==='ground')landedAt[i]??=round(gameSec);
        }
      }
      const [a,b]=sides;
      return {result:a.alive?(b.alive?'時間切れ':'A勝利'):(b.alive?'B勝利':'相打ち'),
        seconds:round(gameSec),dogfightSec:round(dogfightSec),landedAt,
        sides:sides.map(f=>({lost:f.bodies0-groundAliveBodies(f),hp:round(f.hpPool),maxHp:round(f.groundMaxHp)}))};
    }
    if(aircraftKind){
      const aircraft=unit(aircraftKind,0,-4*GROUND_SCALE,0,'evade');
      unit('mobileAA',1,0,0);
      let firstLoss=null;
      for(let tick=0;tick<cap/dt&&aircraft.alive;tick++){
        gameSec+=dt;
        groundAutoAAStep(dt);
        if(firstLoss===null&&groundAliveBodies(aircraft)<aircraft.bodies0)firstLoss=round(gameSec);
      }
      return {firstLoss,destroyedAt:aircraft.alive?null:round(gameSec),remaining:groundAliveBodies(aircraft)};
    }
    if(enemyKind==='mixed'){
      // 戦車と自走対空砲が並ぶ所へ、巡航の W.A.S. が distanceKm から攻める。first の兵科を先に狙い、全滅したら残りを狙う（2026-11-28）
      const was=unit('was',0,-(distanceKm??6)*GROUND_SCALE,0,'evade',platoons);
      const ep=enemyPlatoons??platoons,tank=unit('vehicle',1,0,-.6,'engage',ep),aa=unit('mobileAA',1,0,.6,'engage',ep);
      const order1=first==='mobileAA'?[aa,tank]:[tank,aa];
      was.band='cruise';was.pos.y=groundUnitHeight(was);
      const lostAt=[];let aaDeadAt=null,tankDeadAt=null;
      for(let tick=0;tick<cap/dt&&was.alive&&(tank.alive||aa.alive);tick++){
        const next=order1.find(f=>f.alive);
        if(next&&was.order?.target!==next)order(was,{type:'attack',target:next});
        const before=groundAliveBodies(was);
        step(dt/groundRuleSet().movement.timeScale);
        if(groundAliveBodies(was)<before)lostAt.push(round(gameSec));
        if(!aa.alive)aaDeadAt??=round(gameSec);
        if(!tank.alive)tankDeadAt??=round(gameSec);
      }
      return {result:!tank.alive&&!aa.alive?'W.A.S.勝利':was.alive?'時間切れ':'敵勝利',seconds:round(gameSec),
        wasLost:was.bodies0-groundAliveBodies(was),lostAt,tankDeadAt,aaDeadAt,
        tankLeft:groundAliveBodies(tank),aaLeft:groundAliveBodies(aa),landed:was.band==='ground'};
    }
    const isMobileAA=enemyKind==='mobileAA';
    const walking=walkingOpt!==undefined?walkingOpt:scenario.startsWith('正面の歩行');
    const heavy=scenario==='重強化歩兵';
    const solo=isMobileAA||heavy||scenario==='正面の歩行1対1';
    const startX=distanceKm!=null?-distanceKm*GROUND_SCALE:-3;
    const was=unit('was',0,startX,0,walking?'evade':'engage',platoons);
    const enemies=[unit(isMobileAA?'mobileAA':heavy?'heavyInfantry':'vehicle',1,0,solo?0:-1,'engage',platoons)];
    if(!solo)enemies.push(unit('vehicle',1,0,1,'engage',platoons));
    if(walking)order(was,{type:'attack',target:enemies[0]});
    else if(distanceKm!=null&&distanceKm>3){was.band='cruise';was.pos.y=groundUnitHeight(was);order(was,{type:'attack',target:enemies[0]});}
    const waypoints=Array.from({length:16},(_,i)=>{
      const angle=Math.PI+(i+1)*Math.PI/8;
      return new THREE.Vector3(3*Math.cos(angle),0,3*Math.sin(angle));
    });
    let depleted=null,cruised=false,waypoint=0,wasRoutAt=null,enemyRoutAt=null,landedAt=null,firstLoss=null,enemyFirstLoss=null;
    const remaining=f=>({bodies:groundAliveBodies(f),bodies0:f.bodies0,hp:round(f.hpPool),maxHp:round(f.groundMaxHp),hpRatio:round(f.hpPool/f.groundMaxHp),morale:round(f.groundMorale)});
    for(let tick=0;tick<cap/dt&&was.alive&&enemies.some(f=>f.alive);tick++){
      if(walking&&!was.order){
        const next=enemies.find(f=>f.alive);
        if(next)order(was,{type:'attack',target:next});
      }
      if(scenario==='戦車2・旋回'&&was.band==='cruise'&&!was.order){
        order(was,{type:'move',dest:waypoints[waypoint++%waypoints.length]});
      }
      step(dt/groundRuleSet().movement.timeScale);
      if(firstLoss===null&&groundAliveBodies(was)<was.bodies0)firstLoss=round(gameSec);
      if(isMobileAA&&enemyFirstLoss===null&&groundAliveBodies(enemies[0])<enemies[0].bodies0)enemyFirstLoss=round(gameSec);
      cruised ||= groundWasCruising(was);
      if(cruised&&landedAt===null&&was.band==='ground'&&!was.bandTo)landedAt=round(gameSec);
      if(wasRoutAt===null&&was.groundRout)wasRoutAt=round(gameSec);
      if(enemyRoutAt===null&&enemies.some(f=>f.groundRout))enemyRoutAt=round(gameSec);
      if(depleted===null&&was.groundSupply===0)depleted={seconds:round(gameSec),was:remaining(was),enemies:enemies.map(remaining)};
    }
    const formatBreakdown=map=>Object.fromEntries(Object.entries(map).map(([k,v])=>[k,{
      shots:v.shots,
      hp:round(v.hp),
      applied:round(v.applied),
      avgArmorFactor:v.shots?Number((v.armorFactorSum/v.shots).toFixed(4)):0,
      avgPlate:v.shots?round(v.plateSum/v.shots):0,
      pen:v.pen,
      power:v.power,
      distKm:v.shots?[round(v.minDist),round(v.maxDist)]:null
    }]));
    const base={
      result:enemies.every(f=>!f.alive)?'W.A.S.勝利':was.alive?'時間切れ':'敵勝利',
      seconds:round(gameSec),cruised,depleted,
      was:{...remaining(was),supply:round(was.groundSupply)},
      enemies:enemies.map(remaining)
    };
    if(isMobileAA){
      base.firstLoss=firstLoss;
      base.enemyFirstLoss=enemyFirstLoss;
      base.firstShotAt=firstShotAt;
      base.landedAt=landedAt;
      base.wasRoutAt=wasRoutAt;
      base.enemyRoutAt=enemyRoutAt;
      base.reactiveCount=reactiveCount;
      base.damage={was:formatBreakdown(breakdown.was),enemy:formatBreakdown(breakdown.enemy)};
    }
    return base;
  }finally{
    Math.random=savedRandom;
    groundFireDirect=savedFireDirect;
    groundBodyHit=savedBodyHit;
    groundWasReactiveArmor=savedReactive;
  }
}

async function main(){
  const args=process.argv.slice(2);
  const mode=args.find(a=>!a.startsWith('--km='));
  const kmArg=args.find(a=>a.startsWith('--km='));
  const distanceKm=kmArg?Number(kmArg.slice(5)):undefined;
  assert([undefined,'--baseline','--mobile-aa','--aircraft','--was-vs-was','--mixed'].includes(mode));
  if(distanceKm!==undefined)assert(Number.isFinite(distanceKm)&&distanceKm>0);
  const {browser,page,errors}=await openGame();
  try{
    if(mode==='--baseline'){
      const files=['data/ground-rules.js','battle/ground-shapes.js','battle/ground.js','battle/ground-supply.js','battle/sim.js'];
      for(const file of files){
        const body=execFileSync('git',['show','HEAD:'+file],{cwd:ROOT,encoding:'utf8'});
        await page.route('**/'+file,route=>route.fulfill({body,contentType:'application/javascript'}));
      }
      await page.reload();
    }
    await page.evaluate(prepareField);
    const seeds=[525,526,527,528,529];
    let cases;
    if(mode==='--mixed'){
      const km=distanceKm??6;
      const specs=[
        {scenario:'1小隊・戦車を先に',enemyKind:'mixed',platoons:1,distanceKm,first:'vehicle'},
        {scenario:'1小隊・対空を先に',enemyKind:'mixed',platoons:1,distanceKm,first:'mobileAA'},
        {scenario:'4小隊・戦車を先に',enemyKind:'mixed',platoons:4,distanceKm,first:'vehicle'},
        {scenario:'4小隊・対空を先に',enemyKind:'mixed',platoons:4,distanceKm,first:'mobileAA'},
        {scenario:'W.A.S.2小隊 対 戦車1・対空1・戦車を先に',enemyKind:'mixed',platoons:2,enemyPlatoons:1,distanceKm,first:'vehicle'},
        {scenario:'W.A.S.2小隊 対 戦車1・対空1・対空を先に',enemyKind:'mixed',platoons:2,enemyPlatoons:1,distanceKm,first:'mobileAA'}
      ].filter(s=>!process.env.MIXED_ONLY||s.scenario.includes(process.env.MIXED_ONLY)).map(s=>({...s,distanceKm:km}));
      cases=specs.flatMap(s=>seeds.map(seed=>({...s,seed})));
    }else if(mode==='--mobile-aa'){
      const specs=[
        {scenario:'1小隊・巡航',enemyKind:'mobileAA',platoons:1,walking:false,distanceKm},
        {scenario:'1小隊・歩く',enemyKind:'mobileAA',platoons:1,walking:true,distanceKm},
        {scenario:'4小隊・巡航',enemyKind:'mobileAA',platoons:4,walking:false,distanceKm},
        {scenario:'4小隊・歩く',enemyKind:'mobileAA',platoons:4,walking:true,distanceKm}
      ];
      cases=specs.flatMap(s=>seeds.map(seed=>({...s,seed})));
    }else if(mode==='--aircraft'){
      cases=['fighter','attack'].flatMap(aircraftKind=>seeds.map(seed=>({aircraftKind,seed})));
    }else if(mode==='--was-vs-was'){
      const specs=[
        {scenario:'巡航4対巡航4',platoons:4,wasOpponentBand:'cruise'},
        {scenario:'巡航4対歩き4',platoons:4,wasOpponentBand:'ground'},
        {scenario:'巡航1対巡航1',platoons:1,wasOpponentBand:'cruise'}
      ];
      cases=specs.flatMap(s=>seeds.map(seed=>({...s,seed})));
    }else{
      const cruise=['戦車2・停止巡航','戦車2・旋回'],walking=['正面の歩行1対1','正面の歩行1対2'];
      const scenarios=mode==='--baseline'?walking:[...cruise,...walking,'重強化歩兵'];
      cases=scenarios.flatMap(scenario=>seeds.map(seed=>({scenario,seed})));
    }
    for(const spec of cases)console.log(JSON.stringify({...spec,...await page.evaluate(measure,spec)}));
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
