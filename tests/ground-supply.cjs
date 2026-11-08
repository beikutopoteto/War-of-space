/* node tests/ground-supply.cjs。ブラウザ不要。本物の道路・経路・命令・damageを実行。 */
const assert=require('assert/strict');
const {createGroundContext}=require('./ground-landing.cjs');
function supplyCases(){
  const saved={op,fleets,groundSites,groundTerritory,groundSupplyNet,over,end,groundForests,groundBuildings},d=WOS_TERRAIN.exercise2,oldRoads=d.objects.roads,oldBridges=d.objects.bridges,oldBuilt=groundBridges,oldBridgeRevision=groundBridgeRevision,results=[];
  const check=(name,ok,detail)=>results.push({name,ok:!!ok,detail}),near=(a,b)=>Math.abs(a-b)<1e-6;
  const unit=(team,kind,x,y=29)=>{
    const p=groundPoint(x,y),f=makeFleet(team,{name:kind+team+x,groundKind:kind,type:'cv',n:1,scale:.3,pos:[p.x,p.z],stance:'evade'});f.band=groundBands(f)[0];f.groundMaxHp=f.hpPool;f.pos.y=groundUnitHeight(f);groundSupplyInitUnit(f);return f;
  };
  const site=(id,x,owner)=>({id,x,y:29,radiusKm:1,owner,contested:false,pos:groundPoint(x,29),captureRadius:.2,captureSec:30,progress:[0,0]});
  const setup=()=>{
    op={ground:'exercise2',groundHQ:{0:'A',1:'F'},groundSupportSites:['B','C']};over=false;end=()=>{};groundForests=[];groundBuildings=[];
    d.objects.roads=[{id:'test',points:[[7,29],[41,29]]}];groundSites=[site('A',7,0),site('B',12,0),site('C',18,0),site('F',41,1)];
    groundTerritory={sections:groundRoadSections(d.objects.roads,groundSites)};fleets=[];groundSupplyBuild();
    // Explicit fixed scenario: the blue army already owns this road up to the red headquarters.
    for(const e of groundSupplyNet.edges)if(!e.circle)e.owner=e.x<39?0:1;groundSupplyRefresh();
  };
  try{
    setup();const blue=unit(0,'infantry',15),red=unit(1,'infantry',15);fleets=[blue,red];
    const initial=blue.pos.clone();check('本営の円外への配置は拒否',!groundSupplyPlace([blue],groundPoint(20,25))&&blue.pos.equals(initial));
    check('本営の通れる円内へ消費せず配置',groundSupplyPlace([blue],groundPoint(7,29))&&blue.groundSupply===100&&blue.groundMorale===100);blue.pos.copy(initial);
    check('本営から道路を経て味方拠点につながる',groundSupplyAt({team:0,pos:groundPoint(18,29)}).rate===1);
    groundSupplyRoadCapture(.1);groundSupplyRefresh();
    check('道路競合の地点とその先も半速',groundSupplyAt(blue).rate===.5&&groundSupplyAt({team:0,pos:groundPoint(18,29)}).rate===.5);
    const downstream=unit(0,'vehicle',18);downstream.groundSupply=40;downstream.groundSupplyWait=2;fleets.push(downstream);groundSupplyAfter(2);check('競合の下流で実補充量も毎秒1',near(downstream.groundSupply,42));
    blue.pos.copy(groundPoint(10,27));groundSupplyRoadCapture(30);groundSupplyRefresh();
    check('敵が道路を30秒で占領し補給を切る',groundRoadAt(15,29).owner===1&&groundSupplyAt({team:0,pos:groundPoint(18,29)}).rate===0);
    red.pos.copy(groundPoint(15,27));groundSupplyRoadCapture(1);groundSupplyRefresh();
    check('敵が去っても道路占領と切断が残る',groundRoadAt(15,29).owner===1&&groundSupplyAt({team:0,pos:groundPoint(18,29)}).rate===0);
    blue.pos.copy(groundPoint(15,29));groundSupplyRoadCapture(30);groundSupplyRefresh();
    check('味方が道を再占領すれば再接続',groundRoadAt(15,29).owner===0&&groundSupplyAt({team:0,pos:groundPoint(18,29)}).rate===1);
    groundSites[0].owner=1;groundSupplyRoadCapture(0);groundSupplyRefresh();check('本営喪失で全網停止',groundSupplyAt(blue).rate===0);
    groundSites[0].owner=0;groundSupplyRoadCapture(0);groundSupplyRefresh();check('本営奪還で供給再開',groundSupplyAt(blue).rate===1);
    groundSites[0].contested=true;groundSupplyRoadCapture(0);groundSupplyRefresh();check('本営競合も下流へ半速を通す',groundSupplyAt(blue).rate===.5);
    groundSites[0].contested=false;groundSupplyRoadCapture(0);groundSupplyRefresh();
    // Two contested segments never compound to a quarter.
    const red2=unit(1,'infantry',16.5),blue2=unit(0,'infantry',16.5);red.pos.copy(blue.pos);fleets=[blue,red,blue2,red2];groundSupplyRoadCapture(0);groundSupplyRefresh();
    check('複数の競合でも半速を重ね掛けしない',groundSupplyAt({team:0,pos:groundPoint(18,29)}).rate===.5);
    setup();check('実道路の固定橋を渡って接続',groundSupplyAt({team:0,pos:groundPoint(30,29)}).rate===1);
    d.objects.bridges=[];groundSupplyNet.key=null;groundSupplyRefresh();check('橋のない川は浅瀬や歩兵の渡河能力で補給を通さない',groundSupplyAt({team:0,pos:groundPoint(30,29)}).rate===0);
    groundBridges=[{complete:true,hp:40,river:'main',x:23.55,y:29,tx:0,ty:1,laneHalfKm:1,halfSpanKm:1}];groundBridgeRevision++;groundSupplyRefresh();check('道路に接した完成仮設橋で再接続',groundSupplyAt({team:0,pos:groundPoint(30,29)}).rate===1);
    groundBridges[0].hp=0;groundBridgeRevision++;groundSupplyRefresh();check('仮設橋破壊で同じステップの網を切る',groundSupplyAt({team:0,pos:groundPoint(30,29)}).rate===0);
    d.objects.bridges=oldBridges;groundBridges=oldBuilt;groundBridgeRevision=oldBridgeRevision;
    setup();d.objects.roads.push({id:'cross',points:[[10,25],[10,33]]});groundTerritory.sections=groundRoadSections(d.objects.roads,groundSites);groundSupplyBuild();for(const e of groundSupplyNet.edges)if(!e.circle)e.owner=0;groundSupplyRefresh();
    check('実交点で交差する道路に補給が流れる',groundSupplyAt({team:0,pos:groundPoint(10,32)}).rate===1);
    d.objects.roads=[{id:'main',points:[[7,29],[41,29]]},{id:'near',points:[[10,25],[10,28.9]]}];groundTerritory.sections=groundRoadSections(d.objects.roads,groundSites);groundSupplyBuild();for(const e of groundSupplyNet.edges)if(!e.circle)e.owner=0;groundSupplyRefresh();
    check('近いだけで交差しない道路は接続しない',groundSupplyNet.edges.filter(e=>e.x===10&&e.y<28.9).every(e=>e.rates[0]===0));
    setup();const f=unit(0,'infantry',15);fleets=[f];f.groundSupply=40;
    groundSupplyAfter(2);check('補充開始の2秒待ち',f.groundSupply===40);groundSupplyAfter(1);check('つながった道で毎秒2補充',near(f.groundSupply,42));
    f.pos.copy(groundPoint(15,27));groundSupplyAfter(5);check('円と帯の外では補充しない',near(f.groundSupply,42)&&f.groundSupplyWait===0);
    const a=f.pos.clone(),b=a.clone().add(new THREE.Vector3(4,0,0));groundSupplyMoved(f,a,b);check('実移動1kmで補給2消費',near(f.groundSupply,40));
    groundSupplyShot(f);check('直接射撃の実消費',near(f.groundSupply,39.5));groundSupplyShot(f,true);check('地点攻撃の実消費',near(f.groundSupply,35.5));
    f.groundSupply=0;f.groundMorale=100;check('補給0の攻撃と速度は0.5/0.7',near(groundSupplyAttackFactor(f),.5)&&near(groundSupplySpeedFactor(f),.7));
    f.groundSupply=50;f.groundMorale=50;check('補給と士気の連続倍率を合成',near(groundSupplyAttackFactor(f),.5625)&&near(groundSupplySpeedFactor(f),.85));
    const truck=unit(0,'supply',15.6,27);fleets=[f,truck];truck.groundSupply=20;f.groundSupply=40;f.pos.copy(groundPoint(15,27));
    check('補給命令を指定して分配できる',groundSupplyCommand([truck],f));groundSupplyGive(2,new Map());
    check('分けた4だけ供給側も減る',near(f.groundSupply,44)&&near(truck.groundSupply,16)&&near(truck.groundSupplyGiven,4));
    truck.groundSupply=0;check('補給部隊は残量0でも性能低下を免除',near(groundSupplySpeedFactor(truck),1));
    truck.groundSupply=10;f.groundSupply=90;groundSupplyGive(1,new Map([[f,1]]));check('網の補充と分配を合算せず大きい方を選ぶ',near(f.groundSupply,91)&&near(truck.groundSupply,8));
    check('補給部隊同士の分配は拒否',!groundSupplyCommand([truck],unit(0,'supply',15,27)));
    f.groundMorale=3;const hp=f.hpPool,src=unit(1,'infantry',15,27);fleets.push(src);damage(f,8,src,{source:src,resolving:true,impact:f.pos.clone(),radius:4});
    check('実damageで士気3を先に削り超過5だけ耐久へ',f.groundMorale===0&&near(f.hpPool,hp-5)&&f.groundRout==='routing');
    const original=f.order;order(f,{type:'move',dest:groundPoint(10,29)});check('敗走中は命令を拒否',f.order===original&&!groundCanCapture(f)&&!groundStrikeWeapon(f)&&!groundCanBoardAny(f));
    f.groundSupply=100;f.groundHitLeft=2;check('敗走中は被弾減速なし',near(groundSupplySpeedFactor(f),1)&&near(speedOf(f),f.speed));f.groundRout=null;f.groundMorale=100;check('通常時は被弾で0.65倍',near(groundSupplySpeedFactor(f),.65)&&near(speedOf(f),f.speed*.65));
    f.groundMorale=0;groundRoutStart(f);groundRoutStep(f,.05);check('最寄りの味方へ実経路で自動撤退',f.groundRoutTarget===truck&&f.order?.path&&f.groundRout==='routing');
    const path=f.order?.path;groundSupplyHit(f,1);check('敗走中に撃たれても退路を保持',f.order?.path===path&&f.groundRout==='routing');
    f.pos.copy(truck.pos);groundRoutStep(f,.05);check('到着で再集結し移動と搭乗のみ操作を返す',f.groundRout==='regroup'&&groundCommandAllowed(f,'move')&&groundCommandAllowed(f,'board')&&!groundCommandAllowed(f,'attack'));
    f.groundMorale=0;f.groundRest=0;f.groundMoved=false;groundSupplyAfter(30);check('味方のそばでも色の外では士気回復なし',f.groundMorale===0);
    f.pos.copy(groundPoint(15,29));f.groundMoved=false;f.groundRest=0;groundSupplyAfter(5);check('味方の道でも回復開始は5秒後',f.groundMorale===0);groundSupplyAfter(15);check('味方色の道で士気30回復し戦闘復帰',near(f.groundMorale,30)&&!f.groundRout);
    const block=groundRoadAt(10,29);block.owner=1;groundSupplyRefresh();f.groundMorale=10;f.groundSupply=40;f.groundRest=5;f.groundSupplyWait=0;groundSupplyAfter(1);check('孤立した味方色では士気だけ回復',near(f.groundMorale,12)&&near(f.groundSupply,40));
    f.groundMorale=10;groundRoadAt(15,29).owner=1;groundSupplyAfter(10);check('敵色の道では士気も回復しない',f.groundMorale===10);
    setup();const enemy=unit(1,'infantry',35),enemyFriend=unit(1,'vehicle',34);fleets=[enemy,enemyFriend];
    for(const e of groundSupplyNet.edges)if(!e.circle)e.owner=1;groundSupplyRefresh();enemy.groundSupply=40;enemy.groundSupplyWait=2;groundSupplyAfter(1);
    check('敵も自軍本営の接続道路で同じ速度の補充',near(enemy.groundSupply,42));enemy.groundMorale=0;groundRoutStart(enemy);groundRoutStep(enemy,.05);check('敵も士気0で味方へ敗走',enemy.groundRout==='routing'&&enemy.groundRoutTarget===enemyFriend);
    const plane=unit(0,'attack',12,29),ship=unit(0,'sea',12,5);fleets=[plane,ship];check('航空は補給のみ、船はどちらも持たない',Number.isFinite(plane.groundSupply)&&plane.groundMorale===undefined&&ship.groundSupply===undefined&&ship.groundMorale===undefined);
    const stock=plane.groundSupply;groundAirStep(plane,10);check('飛んでいるだけでも緩やかに消費',near(plane.groundSupply,stock-.5));groundSupplyShot(plane);groundSupplyShot(plane,true);check('航空の戦闘は飛行より多く消費',near(plane.groundSupply,stock-10.5));
    plane.groundSupply=0;groundAirStep(plane,.1);check('航空補給切れで帰投し攻撃・操作不可',plane.groundAirState==='out'&&plane.order?.path&&!groundCommandAllowed(plane,'attack')&&!groundFireSolution(plane,f));
    plane.pos.copy(plane.order.dest);plane.order=null;groundAirStep(plane,.1);check('基地補給中は盤上から外れる',plane.groundAirState==='base'&&groundAbsent(plane)&&!groundCanSee(plane,src)&&!groundCanSee(src,plane));
    groundAirStep(plane,20);check('20秒後に補給100で戦場へ戻る',plane.groundAirState==='return'&&plane.groundSupply===100&&plane.order?.path);
    plane.pos.copy(plane.order.dest);plane.order=null;groundAirStep(plane,.1);check('帰還後に操作を返す',!plane.groundAirState&&groundCommandAllowed(plane,'move'));
    const tile=groundSupplyTile(f),airTile=groundSupplyTile(plane);check('一覧は士気と補給、航空は補給だけ、耐久なし',tile.includes('士気')&&tile.includes('補給')&&!tile.includes('class="bar"')&&!tile.includes('耐久')&&!airTile.includes('士気')&&airTile.includes('補給'));
    op={};check('宇宙では補給と士気の処理が無効',!groundSupplyActive()&&groundSupplyAttackFactor(f)===1&&groundSupplySpeedFactor(f)===1&&groundSupplyHit(f,7)===7);
  }finally{op=saved.op;fleets=saved.fleets;groundSites=saved.groundSites;groundTerritory=saved.groundTerritory;groundSupplyNet=saved.groundSupplyNet;over=saved.over;end=saved.end;groundForests=saved.groundForests;groundBuildings=saved.groundBuildings;d.objects.roads=oldRoads;d.objects.bridges=oldBridges;groundBridges=oldBuilt;groundBridgeRevision=oldBridgeRevision;}
  return results;
}
function nodeChecks(){const {ctx,run}=createGroundContext();return run(`(${supplyCases.toString()})()`);}
async function checkGroundSupply(page,check){
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);});
  for(const c of await page.evaluate(supplyCases))check(c.ok,'地上補給: '+c.name,c.detail||'');
}
module.exports={supplyCases,nodeChecks,checkGroundSupply};
if(require.main===module){const rows=nodeChecks(),failed=rows.filter(r=>!r.ok);for(const r of failed)console.error('| 失敗 | '+r.name+' |');console.log(`| 地上補給 | ${rows.length-failed.length}/${rows.length} 成功 |`);assert.equal(failed.length,0);}
