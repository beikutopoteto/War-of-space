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
    click('groundDroneLaunch');const first=scout.groundDroneSlots[0].drone;
    check('3機を近くに打ち上げて待機、2/3',first&&groundAliveBodies(first)===3&&groundDistanceTo(first,scout)<GROUND_SCALE&&!first.order&&!first.groundDrone.mission&&stock(scout)==='2/3');
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
async function checkGroundDrone(page,check){
  for(const result of await page.evaluate(droneCases))check(result.ok,'光ファイバードローン: '+result.name);
}
module.exports={checkGroundDrone};
