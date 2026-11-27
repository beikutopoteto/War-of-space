/* #511。ゲーム本体を使う固定場面。時計をゲーム秒で進めて小隊・飛行・射撃・補給を確認する。 */
function droneCases(){
  const operation=OPS.find(o=>o.id==='groundExercise2'),savedEnemies=operation.enemies;
  const terrain={height:groundHeight,forests:groundForests,buildings:groundBuildings,random:Math.random};
  const checks=[],check=(name,ok)=>checks.push({name,ok});
  const setPoint=(f,x,y)=>{f.pos.copy(groundPoint(x,y));f.pos.y=groundUnitHeight(f);f.groundTrack=null;};
  const stock=scout=>{const {ready,max}=groundDroneStock(scout);return ready.length+'/'+max;};
  const tick=(n,stepFn=groundDroneStep)=>{const dt=.05;for(let i=0;i<Math.round(n/dt);i++){gameSec+=dt;stepFn(dt);groundDroneCleanup();}};
  const nearby=(a,b)=>Math.abs(a-b)<1e-6;
  const spawn=(kind,team,x,y,platoons=1)=>{
    const f=makeFleet(team,groundUnitSpec({kind,name:kind,at:[x,y],platoons,stance:'evade'}));
    fleets.push(f);groundInitUnit(f);return f;
  };
  const click=id=>document.getElementById(id).click();
  try{
    operation.enemies=[];
    WOS.start({op:operation.id,fleets:[{name:'確認用斥候',kind:'scout',at:[10,18],platoons:3,stance:'engage'}]});
    if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);
    op={...op,npc:null,groundDrill:false,groundStaticEnemies:false,groundHQ:{0:'A',1:'F'}};
    groundSites=[];groundHeight=()=>0;groundHeightCacheReset();groundForests=[];groundBuildings=[];
    fleets=fleets.filter(f=>f.name==='確認用斥候');
    const scout=fleets[0], enemy=spawn('infantry',1,10,18);
    setPoint(scout,10,18);scout.groundSupply=groundSupplyUnitMax(scout);
    check('斥候10 km・歩兵7.5 km',groundSightRange(scout)===40&&groundSightRange(enemy)===30);
    setPoint(enemy,13.75,18);check('野原で0.5倍の境界',groundCanSee(enemy,scout));
    setPoint(enemy,13.76,18);check('野原で0.5倍の外',!groundCanSee(enemy,scout));
    groundForests=[{x:scout.pos.x,z:scout.pos.z,r:1}];
    setPoint(enemy,12.25,18);check('森で0.3倍の境界',groundCanSee(enemy,scout));
    setPoint(enemy,12.26,18);
    select(scout);groundHud();updateRoster();
    check('小隊3つ、ボタンと一覧は3/3',document.getElementById('groundDroneCount').textContent==='3/3'&&scout.btn.textContent.includes('ドローン 3/3'));
    const tile=scout.btn.querySelector('.ground-drone-stock');
    const tileText=()=>{updateRoster();return tile.innerText;};
    const [aSlot,bSlot]=groundDroneSlots(scout),fullSupply=scout.groundSupply,tileHeight=tile.getBoundingClientRect().height;
    aSlot.stock=1;aSlot.ready=gameSec+35;bSlot.ready=gameSec+11.1;scout.groundDroneRefill=18;
    check('札は充電・順番待ちの最短を切り上げ、同じ文字で2行になる',tileText()==='ドローン 1/3\n次 12秒'&&tile.getBoundingClientRect().height===2*tileHeight);
    scout.groundSupply=fullSupply*.5-.01;
    check('補給不足でも充電だけで出せる枠は秒を表示',tileText()==='ドローン 1/3\n次 12秒');
    bSlot.ready=gameSec;
    check('補充しか待っていない枠が止まると補給不足を表示',tileText()==='ドローン 2/3\n補給不足');
    scout.groundSupply=fullSupply;
    check('補充は残りの作業と不足機数を使い、充電と同時進行',tileText()==='ドローン 2/3\n次 42秒');
    bSlot.stock=2;aSlot.ready=gameSec+100;scout.groundSupply=fullSupply*.5;
    check('補給がちょうど半分なら、先の枠の補充を含めて秒を出す',tileText()==='ドローン 1/3\n次 72秒');
    aSlot.stock=bSlot.stock=3;aSlot.ready=bSlot.ready=gameSec;scout.groundSupply=fullSupply;scout.groundDroneRefill=0;
    check('待つ枠がなくなると札は1行に戻る',tileText()==='ドローン 3/3'&&tile.getBoundingClientRect().height===tileHeight);
    click('groundDroneLaunch');const first=scout.groundDroneSlots[0].drone;
    check('3機を近くに打ち上げて待機、2/3',first&&groundAliveBodies(first)===3&&groundDistanceTo(first,scout)<GROUND_SCALE&&!first.order&&!first.groundDrone.mission&&stock(scout)==='2/3');
    check('飛行中の枠だけなら札は1行',tileText()==='ドローン 2/3');
    check('発進後も森で0.3倍',groundConcealment(scout)===.3&&!groundCanSee(enemy,scout));
    click('groundDroneLaunch');click('groundDroneLaunch');click('groundDroneLaunch');
    check('0/3で打ち上げボタン無効',document.getElementById('groundDroneLaunch').disabled&&document.getElementById('groundDroneCount').textContent==='0/3');
    select(first);groundHud();
    check('帰還・自爆・旋回偵察の3ボタン', ['Recall','Dive','Orbit'].every(id=>!document.getElementById('groundDrone'+id).hidden));
    click('groundDroneRecall');tick(1);
    check('降ろしてすぐは充電中',!first.alive&&stock(scout)==='0/3');
    tick(30);check('帰還した3機は30秒充電で再発進可能',stock(scout)==='1/3');

    const second=groundDroneLaunch(scout),launchedAt=gameSec;
    const long=groundPoint(35,18);
    order(second,{type:'move',dest:long});tick(16);
    check('通常移動で15 kmの端まで',nearby(groundDistanceTo(second,scout),60)&&!second.order);
    setPoint(scout,9,18);tick(.05);
    check('斥候の移動後に届く距離を測り直す',nearby(groundDistanceTo(second,scout),60));
    const expires=second.groundDrone.expires;
    tick(expires-gameSec);
    check('電池60秒で距離に応じて自動帰還',nearby(expires-launchedAt,60)&&!second.alive&&scout.groundDroneSlots[1].stock===3);
    const third=groundDroneLaunch(scout);
    check('目は250 mの高さ',nearby(groundEye(third).y,1));
    groundForests=[];setPoint(third,22,18);setPoint(enemy,24,18);groundUpdateSight();
    check('周囲2 kmの敵を陣営で共有',groundCanSee(third,enemy)&&!groundCanSee(scout,enemy)&&groundSeenBy(0,enemy));
    setPoint(enemy,24.01,18);groundUpdateSight();check('2 kmの外は未発見',!groundSeenBy(0,enemy));

    const circle=groundPoint(15,18);groundDroneOrbit(third,circle);tick(9);
    const a=third.pos.clone();tick(.4);
    check('指定地点の上を半径0.5 kmで旋回',nearby(groundDistanceTo(third,{pos:circle}),2)&&a.distanceTo(third.pos)>.1);
    const tank=spawn('vehicle',1,15,18);
    // 自爆と補充を測る場面では、戦車が旋回機を撃墜して別の枠が先に補充されるのを防ぐ。
    tank.groundAAEnabled=false;
    setPoint(enemy,8.75,18);groundUpdateSight();
    const infantryBefore=enemy.hpPool,tankBefore=tank.hpPool;
    for(const b of scout.bodies)b.shotT=0;
    groundStep(.05);
    check('命令なしでドローンは撃たず、斥候は小銃を撃つ',tank.hpPool===tankBefore&&enemy.hpPool<infantryBefore);
    check('戦車の上面150へほぼ減衰なしで当たる',groundDirectWeapon(third,tank).armorFactor>.99);
    check('任意の直接damageで自爆の許可を偽装できない', (damage(tank,10,third), tank.hpPool===tankBefore));
    // 制限時間の近い旋回機とは別の、充電を終えた駒で追尾と3回の命中を測る。
    const attacker=groundDroneLaunch(scout);setPoint(attacker,14,18);
    check('見えている戦車に自爆指示',groundDroneDive(attacker,tank));
    setPoint(tank,16,18);
    const beforeHits=groundDroneStats[0].hits;
    tick(3.5);check('移動した同じ戦車へ順に2機、1機残る',groundDroneStats[0].hits-beforeHits===2&&groundAliveBodies(attacker)===1);
    tick(1);check('残り1機も同じ戦車に当たり駒が消える',groundDroneStats[0].hits-beforeHits===3&&!attacker.alive&&tank.hpPool<tankBefore);
    const slot=attacker.groundDrone.slot;
    scout.groundSupply=groundSupplyUnitMax(scout)*.5-.01;tick(30);
    check('補給が半分未満の間は補充されない',slot.stock===0);
    scout.groundSupply=groundSupplyUnitMax(scout);const beforeSupply=scout.groundSupply;
    tick(30);check('補給が半分以上なら30秒で1機、通常射撃1回分を消費',slot.stock===1&&nearby(scout.groundSupply,beforeSupply-groundSupplyRules().shot));
    tick(60);check('3機そろうまで発進数に含めない',slot.stock===3&&groundDroneStock(scout).ready.includes(slot));

    for(const pair of [['mobileAA',4],['was',6],['infantry',.8]]){
      const [kind,range]=pair,gun=spawn(kind,1,9,18),f=groundDroneLaunch(scout);setPoint(f,9+range-.1,18);groundUpdateSight();
      check(kind+'：地上扱いで適切な射程を使う',kind==='infantry'?groundCanFire(gun,f)&&!groundAASolution(gun,f):groundAASolution(gun,f));
      Math.random=()=>.3;
      if(kind==='mobileAA'){
        const plane=spawn('fighter',0,9.1,18);plane.band='low';plane.pos.y=groundUnitHeight(plane);groundUpdateSight();
        gun.bodies.forEach(b=>b.aaT=0);groundAutoAAStep(0);
        check('近い航空機よりドローンに対空を優先',gun.groundAATarget===f&&plane.hpPool===plane.groundMaxHp);
        plane.alive=false;
      }
      if(f.alive)groundDroneRemove(f);
      groundDroneCleanup();gun.alive=false;f.groundDrone.slot.stock=3;
    }
    const trial=kind=>{
      const shooter=spawn(kind,1,9,18),loss=groundDroneStats[0].shotDown;
      let rng=1;
      Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
      for(let i=0;i<8;i++){
        const f=groundDroneLaunch(scout);setPoint(f,9.25,18);groundUpdateSight();
        const aa=kind==='mobileAA';
        for(let j=0;j<3&&f.alive;j++){
          shooter.bodies.forEach(b=>{b.shotT=b.aaT=Infinity;});
          shooter.bodies[0][aa?'aaT':'shotT']=0;
          if(aa)groundAutoAAStep(0);else groundBodyFire(shooter,f,0);
        }
        if(f.alive)groundDroneRemove(f);
        groundDroneCleanup();f.groundDrone.slot.stock=3;
      }
      shooter.alive=false;
      return groundDroneStats[0].shotDown-loss;
    };
    const aa=trial('mobileAA'),infantry=trial('infantry');
    check('同じ乱数種の複数回で自走対空砲は歩兵より多く撃墜し、1発で機数が減る',aa>infantry&&aa>0&&infantry>0);
    const threshold=(kind,probability)=>{
      const f=groundDroneLaunch(scout);
      Math.random=()=>probability;
      groundDroneReceiveShot(f,{groundKind:kind});
      const at=groundAliveBodies(f);
      Math.random=()=>probability-1e-6;
      groundDroneReceiveShot(f,{groundKind:kind});
      const below=groundAliveBodies(f);
      groundDroneRemove(f);groundDroneCleanup();f.groundDrone.slot.stock=3;
      return at===3&&below===2;
    };
    check('1発で1機を失う確率は対空0.5・その他0.125',threshold('mobileAA',.5)&&threshold('infantry',.125));
    const lost=groundDroneLaunch(scout);
    const i=lost.groundDrone.slot.i*groundBodiesPerPlatoon(scout);
    for(const b of scout.bodies.slice(i,i+groundBodiesPerPlatoon(scout)))groundBodyHit(scout,b,b.hp,false);
    groundDroneCleanup();
    check('小隊全滅で最大数が減り、その枠の駒を失う',groundDroneStock(scout).max===2&&!lost.alive);
    const survivor=groundDroneLaunch(scout);scout.alive=false;groundDroneCleanup();
    check('斥候全滅で残りの駒も失う',survivor&&!survivor.alive&&!groundDroneStock(scout).max);
    check('兵科一覧に旧ハイブもドローンも出ない',!Object.hasOwn(WOS_GROUND_ORG.types(),'droneHive')&&!Object.hasOwn(WOS_GROUND_ORG.types(),'drone'));
  }finally{
    operation.enemies=savedEnemies;Math.random=terrain.random;groundHeight=terrain.height;
    groundForests=terrain.forests;groundBuildings=terrain.buildings;groundHeightCacheReset();
  }
  return checks;
}
function droneNpcCases(){
  const checks=[],check=(name,ok)=>checks.push({name,ok});
  WOS.start({op:'groundExercise2',fleets:[{name:'NPC確認用斥候',kind:'scout',at:[10,18],platoons:3,stance:'engage'}]});
  if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);
  op={...op,groundDrill:false,groundStaticEnemies:false,groundHQ:{0:'A',1:'F'},npc:{0:{doctrine:'earth',level:'standard'}}};
  const saved={forests:groundForests,buildings:groundBuildings};
  try{
    const scout=fleets.find(f=>f.name==='NPC確認用斥候');
    const setPoint=(f,x,y)=>{f.pos.copy(groundPoint(x,y));f.pos.y=groundUnitHeight(f);};
    setPoint(scout,10,18);fleets=[scout];groundClearOrders(scout);
    scout.groundSupply=groundSupplyUnitMax(scout);
    const forest=groundPoint(11,18),otherForest=groundPoint(12,18),village=groundPoint(10.5,18);
    const building={x:village.x,z:village.z,ang:0,w:.5,d:.5,minX:village.x-.25,maxX:village.x+.25,
      minZ:village.z-.25,maxZ:village.z+.25,bottom:0,top:.5,settlement:'test'};
    groundForests=[forest,otherForest].map(p=>({x:p.x,z:p.z,r:.4}));
    groundBuildings=[building];
    npcGroundInit();
    const c=npcGroundState.commanders.get(0),zones=[{id:'A',base:'own',x:10,z:18},{id:'F',base:'foe',x:17,z:18}];
    const sit={units:[{id:scout.id}],contacts:[],zones};
    const plan={tasks:[{key:'recon:F',type:'recon',zone:'F',from:'A',units:[{id:scout.id,as:'main'}]}]};
    npcGroundApply(c,sit,plan);
    check('近い町より、ドローンが届く最寄りの森へ向かう',scout.order?.dest.distanceTo(forest)<.001&&groundDroneStats[0].launched===0);
    for(let i=0;i<500&&scout.order;i++){gameSec+=.05;groundStepMove(scout,.05);}
    npcGroundApply(c,sit,plan);
    const first=groundDroneSlots(scout)[0].drone;
    check('森に着いて停止してから、敵区域へドローンを発進',!scout.order&&groundInForest(scout.pos.x,scout.pos.z)&&first?.groundDrone.mission?.type==='orbit');
    if(first)groundDroneRemove(first);
    groundDroneCleanup();
    groundForests=[];
    setPoint(scout,10,18);
    npcGroundApply(c,sit,plan);
    check('森がなければ建物のある町へ向かう',!!scout.order&&groundInsideTown(scout.order.dest,groundTownZones()[0])&&
      !groundInsideBuilding(scout.order.dest,building)&&groundDistanceTo({pos:scout.order.dest},{pos:groundPoint(17,18)})<=15*GROUND_SCALE);
    const open=npcGroundScoutPost(scout,groundPoint(35,25),scout.pos);
    check('森も町も届かない場面でも、届く距離まで進む',!!open&&groundDistanceTo({pos:open.pos},{pos:groundPoint(35,25)})<=15*GROUND_SCALE);
    groundClearOrders(scout);setPoint(scout,11,18);groundBuildings=[];
    const spawn=(kind,x,y)=>{
      const f=makeFleet(1,groundUnitSpec({kind,name:kind,at:[x,y],stance:'evade'}));
      fleets.push(f);groundInitUnit(f);setPoint(f,x,y);f.groundVisible=[true,true];return f;
    };
    const risky=spawn('vehicle',14,18),aa=spawn('mobileAA',15,18),safe=spawn('artillery',11,25);
    groundDroneNpc(scout);
    const drone=groundDroneSlots(scout).find(s=>s.drone)?.drone;
    check('近い戦車と自走対空を避け、射程内の自走砲を選ぶ',drone?.groundDrone.mission?.target===safe);
    const supply=scout.groundSupply;
    setPoint(drone,15,18);drone.groundDrone.expires=gameSec+12;
    const tick=()=>{gameSec+=.05;groundDroneStep(.05);groundDroneCleanup();};
    tick();
    check('電池が少ないと帰りの余裕を取って早めに帰還する',drone.groundDrone.mission.type==='recall');
    for(let i=0;i<100&&drone.alive;i++)tick();
    check('無傷で回収し、補給を消費しない',!drone.alive&&drone.groundDrone.slot.stock===3&&scout.groundSupply===supply);
    const armed=spawn('was',11,24);
    const launches=groundDroneStats[0].launched;
    groundDroneNpc(scout);
    check('対空武器の隊が残る目標も避け、対空圏しかなければ発進しない',groundDroneStats[0].launched===launches);
    armed.alive=aa.alive=risky.alive=false;
    groundDroneNpc(scout);
    const damaged=groundDroneSlots(scout).find(s=>s.drone)?.drone;
    setPoint(damaged,13,18);groundDroneLose(damaged,damaged.bodies[0],true);
    tick();
    check('機数が減れば電池が十分でも帰還する',damaged.groundDrone.mission.type==='recall');
    for(let i=0;i<100&&damaged.alive;i++)tick();
    check('落とされ残った2機を補給を使わず回収する',!damaged.alive&&damaged.groundDrone.slot.stock===2&&scout.groundSupply===supply);

    const resetSlots=()=>{
      for(const s of groundDroneSlots(scout)){if(s.drone)groundDroneRemove(s.drone);s.stock=3;s.ready=gameSec;}
      groundDroneCleanup();
    };
    resetSlots();
    const hitsBeforeDive=groundDroneStats[0].hits;
    groundDroneNpc(scout);
    const finisher=groundDroneSlots(scout).find(s=>s.drone)?.drone;
    setPoint(finisher,11,23);groundDroneLose(finisher,finisher.bodies[0],true);
    tick();
    check('突入の終盤で撃たれても帰還せず自爆を続ける',finisher?.groundDrone.mission?.type==='dive');
    for(let i=0;i<140&&finisher.alive;i++)tick();
    check('突入終盤の被弾後と1機目命中後も残り全機が命中する',!finisher.alive&&groundDroneStats[0].hits-hitsBeforeDive===2);

    resetSlots();
    safe.alive=false;
    const rifle=spawn('infantry',15,18);rifle.stance='engage';
    groundDroneNpc(scout);
    const watcher=groundDroneSlots(scout).find(s=>s.drone)?.drone;
    const orbitDist=watcher?.groundDrone.mission?.type==='orbit'?groundDistanceTo({pos:watcher.groundDrone.mission.point},rifle):0;
    check('旋回偵察は歩兵の直射圏の外で視界内に置く',orbitDist>(.8+.5)*GROUND_SCALE&&orbitDist<=2*GROUND_SCALE);
    resetSlots();
    rifle.alive=false;
    const gunApc=spawn('apc',15,18);gunApc.stance='engage';
    const launchesBeforeApc=groundDroneStats[0].launched;
    groundDroneNpc(scout);
    check('直射圏の外から見えない敵の上では旋回発進しない',groundDroneStats[0].launched===launchesBeforeApc);
    gunApc.alive=false;

    resetSlots();
    const tank=makeFleet(1,groundUnitSpec({kind:'vehicle',name:'vehicle',at:[14,18],platoons:3,stance:'engage'}));
    fleets.push(tank);groundInitUnit(tank);setPoint(tank,14,18);tank.groundVisible=[true,true];
    const spg=spawn('artillery',11,25);spg.stance='evade';
    groundDroneNpc(scout);
    const chosen=groundDroneSlots(scout).find(s=>s.drone)?.drone;
    check('近い非交戦戦車より、防御の薄い自走砲を優先して狙う',chosen?.groundDrone.mission?.target===spg);
    resetSlots();
    spg.alive=false;
    const idleLaunches=groundDroneStats[0].launched;
    groundDroneNpc(scout);
    check('想定撃墜数が手持ちを上回る非交戦戦車には突入を控える',groundDroneStats[0].launched===idleLaunches);
    const decoy=makeFleet(0,groundUnitSpec({kind:'infantry',name:'友軍歩兵',at:[15,18],stance:'evade'}));
    fleets.push(decoy);groundInitUnit(decoy);setPoint(decoy,15,18);
    tank.fireTarget=decoy;
    groundDroneNpc(scout);
    const wave=groundDroneSlots(scout).filter(s=>s.drone?.groundDrone.mission?.target===tank);
    check('交戦中の戦車には複数枠を同時に突入させる',wave.length>=2);
  }finally{
    groundForests=saved.forests;groundBuildings=saved.buildings;
  }
  return checks;
}
async function checkGroundDrone(page,check){
  for(const cases of [droneCases,droneNpcCases]){
    for(const result of await page.evaluate(cases))check(result.ok,'光ファイバードローン: '+result.name);
  }
}
module.exports={checkGroundDrone};
