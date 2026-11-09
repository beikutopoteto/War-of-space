/* node tests/ground-landing.cjs：ブラウザ不要。実生成・命令・経路・damage・沈没・占拠。
   npm test では同じ判定と、乗艦クリック・上陸ボタン・ゲージ・再初期化を確認する。 */
const fs=require('fs'),path=require('path'),vm=require('vm');
function landingCases(){
  const saved={op,op,fleets,groundSites,groundForests,groundBuildings,groundFog,groundStrikes,groundImpacts,groundHud,over,end,shoot,burst};
  const results=[],check=(name,ok)=>results.push({name,ok}),made=[];
  const unit=(kind,x,y,team=0)=>{
    const p=groundPoint(x,y),f=makeFleet(team,{name:kind+' '+made.length,groundKind:kind,type:kind==='sea'?'dd':'cv',groundLanding:kind==='sea',n:1,scale:.3,pos:[p.x,p.z]});
    f.band=groundBands(f)[0];f.pos.y=groundUnitHeight(f);f.groundMaxHp=f.hpPool;f.stance='evade';made.push(f);return f;
  };
  const tick=sec=>{for(let i=0;i<Math.round(sec/.05);i++)groundStep(.05);};
  const near=(a,b)=>Math.abs(a-b)<1e-7;
  try{
    // 兵科・視線・輸送の固定場面には本営を置かない。補給との組合せはground-supplyで確認。
    op={...op,groundHQ:null};
    op={...op,wipeLose:false};fleets=[];groundSites=[];groundForests=[];groundBuildings=[];groundFog=null;groundStrikes=[];groundImpacts=[];over=false;end=shoot=burst=groundHud=()=>{};
    const ship=unit('sea',12,5),inf=unit('infantry',12,9),tank=unit('vehicle',13,9),heavy=unit('heavyInfantry',11,9),plane=unit('fighter',12,9),red=unit('infantry',12,9,1);
    fleets=[ship,inf,tank,heavy,plane,red];
    check('沖では乗艦を理由付きで拒否',!groundBoardCommand([inf],ship)&&groundTransportMessage.includes('岸に接していない'));
    ship.pos.copy(groundPoint(12.2,7.4));
    check('海岸は通れる陸に接する海のセル',groundCoastCells(ship).length>=2&&groundPass(12.2,7.4,'sea'));
    check('陸・川・池・盤外は海岸扱いにしない',[[12,10],[23.47,26],[9,11],[-1,0]].every(([x,y])=>!groundCoastCells({...ship,pos:groundPoint(x,y)}).length));
    check('歩兵と戦車の2中隊を予約できる',groundBoardCommand([inf],ship)&&groundBoardCommand([tank],ship));
    check('予約を含め3中隊目は拒否',!groundBoardCommand([heavy],ship)&&groundTransportMessage.includes('上限2'));
    check('敵と航空は乗艦できない',!groundBoardCommand([red],ship)&&!groundBoardCommand([plane],ship));
    order(tank,{type:'move',dest:tank.pos.clone()});
    check('別命令で乗艦の予約を解放',ship.groundBoarders.length===1&&groundBoardCommand([tank],ship));
    tick(20);
    check('浜へ実移動して2中隊が乗艦',inf.embarked===ship&&tank.embarked===ship&&groundPassengers(ship).length===2&&!ship.groundBoarders.length);
    check('2中隊の名前を艦の名札に表示',groundTransportLabel(ship).includes(inf.name)&&groundTransportLabel(ship).includes(tank.name));
    check('輸送車用の降車で上陸の時計を迂回できない',!groundUnload(ship)&&!groundUnloadCommand([inf]));
    order(ship,{type:'move',dest:groundPoint(12,5)});tick(10);
    check('搭載して海面を移動し中隊が追従',!ship.order&&ship.pos.y===0&&inf.pos.equals(ship.pos)&&tank.pos.equals(ship.pos));
    check('海岸以外で上陸を理由付きで拒否',!groundLandCommand([ship])&&groundTransportMessage.includes('海岸ではない'));
    order(inf,{type:'move',dest:groundPoint(12,9)});groundUpdateSight();
    check('搭載中は移動・索敵・射撃・占拠をしない',!inf.order&&!groundCanSee(inf,red)&&!groundSeenBy(0,inf)&&!groundCanFire(inf,red)&&!groundCanCapture(inf));
    ship.pos.copy(groundPoint(12.2,7.4));groundTransportSync();
    const enemy=unit('sea',13,6.5,1);enemy.groundLanding=false;fleets.push(enemy);groundUpdateSight();
    const hit=()=>{const hp=ship.hpPool;damage(ship,1,enemy);return hp-ship.hpPool;},normal=hit();
    check('海岸で上陸を開始',groundLandCommand([ship])===1&&!!ship.groundUnloading);
    check('上陸中の実damageは通常の1.3倍',normal>0&&near(hit()/normal,1.3));
    tick(5);const progress=ship.groundUnloading.progress;
    check('上陸ボタンを連打しても時計を戻さない',!groundLandCommand([ship])&&ship.groundUnloading.progress===progress);
    check('上陸中は乗艦を受け付けない',!groundBoardCommand([heavy],ship)&&groundTransportMessage.includes('上陸中'));
    tick(4.95);check('9.95秒ではまだ2中隊とも搭載中',near(ship.groundUnloading.progress,9.95)&&inf.embarked===ship&&tank.embarked===ship);
    tick(.05);check('10秒で2中隊が別の通れる浜へ降りる',!ship.groundUnloading&&!inf.embarked&&!tank.embarked&&!groundPassengers(ship).length&&!inf.pos.equals(tank.pos)&&[inf,tank].every(f=>groundPass(f.pos.x/4+24,18-f.pos.z/4,groundMoveKind(f))));
    check('上陸完了後は被弾倍率が通常へ戻る',near(hit(),normal));
    order(inf,{type:'move',dest:groundPoint(10.2,9.5)});order(tank,{type:'move',dest:groundPoint(15.2,9.5)});tick(15);
    check('写真cの2中隊は浜で離れた位置へ実移動できる',!inf.order&&!tank.order&&groundDistanceTo(inf,tank)>15);
    const siteData=WOS_TERRAIN[op.ground].sites.find(s=>s.id==='A'),site={pos:groundPoint(siteData.x,siteData.y),captureRadius:8,captureSec:30,owner:null,progress:[0,0]};
    groundSites=[site,{...site,pos:groundPoint(41,27),progress:[0,0]}];
    order(inf,{type:'move',dest:site.pos});const path=inf.order?.path;
    check('上陸歩兵が既存拠点まで陸上の経路を作る',!!path);
    if(path)tick(Math.ceil(path.cost/inf.speed)+60);
    check('上陸した歩兵が実移動して既存拠点を占拠',site.owner===0&&!inf.order&&groundCanCapture(inf));groundSites=[];
    check('上陸した戦車は占拠しない',!groundCanCapture(tank));
    check('降りた中隊は岸の艦へ再乗艦できる',groundBoardCommand([tank],ship));
    tick(Math.ceil(tank.order.path.cost*WOS_TERRAIN[op.ground].meta.cellKm*GROUND_SCALE/tank.speed)+5);
    check('実際の速度と経路に見合う時間で再乗艦が完了',tank.embarked===ship);
    check('別命令で上陸を中止し搭載を保つ',groundLandCommand([ship])===1&&(tick(2),order(ship,{type:'move',dest:groundPoint(12,5)}),!ship.groundUnloading&&tank.embarked===ship&&groundDamageFactor(ship)===1));
    tick(10);ship.pos.copy(groundPoint(12.2,7.4));groundTransportSync();
    inf.pos.copy(groundPoint(12.2,8.2));groundBoardCommand([inf],ship);tick(5);
    check('沈没の確認前に2中隊を再搭載',groundPassengers(ship).length===2);
    groundLandCommand([ship]);tick(2);enemy.pos.copy(groundPoint(12.2,7));groundUpdateSight();
    damage(ship,10000,enemy);
    check('本物のdamageで揚陸艦が沈没',!ship.alive);
    check('上陸中の沈没でも搭載2中隊は全滅し救出しない',[inf,tank].every(f=>!f.alive&&!f.embarked&&f.hpPool===0&&!f.ships.length&&!f.order)&&!groundPassengers(ship).length&&!ship.groundUnloading&&!ship.groundLandingVisual);
    const ordinary=unit('sea',12.2,7.4);ordinary.groundLanding=false;const survivor=unit('infantry',12,9);fleets.push(ordinary,survivor);
    check('普通の海の艦は乗艦・上陸に使えない',!groundBoardCommand([survivor],ordinary)&&!groundLandCommand([ordinary]));
    const next=unit('sea',12.2,7.4);fleets.push(next);next.groundPassengers=[survivor];survivor.embarked=next;
    check('上陸開始で乗艦待ちの予約を片付ける',groundBoardCommand([heavy],next)&&groundLandCommand([next])===1&&!heavy.order&&!next.groundBoarders.length);
    next.pos.copy(groundPoint(12,5));tick(.05);
    check('海岸を離れた場合も上陸を中止して部隊を艦内に保つ',!next.groundUnloading&&survivor.embarked===next&&groundTransportMessage.includes('上陸中止'));
  }finally{op=saved.op;
    made.forEach(f=>{groundLandingDropVisual(f);f.el.remove();});
    ({op,fleets,groundSites,groundForests,groundBuildings,groundFog,groundStrikes,groundImpacts,groundHud,over,end,shoot,burst}=saved);
  }
  return results;
}
// 撮影と実画面テスト共通。浜の2中隊は離し、他の名札を海岸から遠ざける。
function setupLandingScene(){
  reset({op:'groundExercise2'});setSpeed(0);endDeploy();
  const ship=fleets.find(groundLandingShip);
  fleets.forEach((f,i)=>{f.stance='evade';groundClearOrders(f);if(f!==ship&&!f.embarked)f.pos.copy(groundPoint(30+(i%6)*2,33+Math.floor(i/12)));});
  ship.pos.copy(groundPoint(12,5));groundTransportSync();select(ship);
  return ship.name;
}
async function checkGroundLanding(page,check){
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);endDeploy();});
  for(const c of await page.evaluate(landingCases))check(c.ok,'海からの上陸: '+c.name);
  await page.evaluate(setupLandingScene);
  check(await page.evaluate(()=>{
    const c=selected;groundDraw();updateFleetLabel(c,false,'');
    return groundPassengers(c).length===2&&groundPassengers(c).every(f=>f.embarked===c&&!f.groundModel.visible)&&c.el.textContent.includes('第7 上陸歩兵中隊')&&c.el.textContent.includes('第8 上陸戦車中隊');
  }),'上陸の実画面: opで初期搭載・名札・搭載中隊を隠す');
  await page.click('#groundLand');
  check(await page.evaluate(()=>!selected.groundUnloading&&document.getElementById('groundTransportStatus').textContent.includes('海岸ではない')),'上陸の実画面: 沖では理由を表示');
  await page.evaluate(()=>{selected.pos.copy(groundPoint(12.2,7.4));groundTransportSync();});
  await page.click('#groundLand');
  const gauge=await page.evaluate(()=>{
    for(let i=0;i<100;i++)step(.05);groundDraw();
    const c=selected,el=c.groundLandingVisual;
    return c.groundUnloading&&el?.textContent.includes('1.3倍')&&Math.abs(parseFloat(el.querySelector('i').style.width)-50)<1e-6;
  });check(gauge,'上陸の実画面: ボタンで開始し5秒で50%ゲージ');
  await page.evaluate(()=>{for(let i=0;i<100;i++)step(.05);groundDraw();});
  check(await page.evaluate(()=>!selected.groundUnloading&&!selected.groundLandingVisual&&fleets.filter(f=>f.groundFixed).every(f=>!f.embarked&&f.groundModel.visible)),'上陸の実画面: 浜へ降りて表示が戻る');
  // 再乗艦を本物のクリックで確認。出発点を離し、速度2で数秒の行程に20秒を取る。
  await page.evaluate(()=>{
    const c=selected,inf=fleets.find(f=>f.groundFixed&&f.groundKind==='infantry'),tank=fleets.find(f=>f.groundFixed&&f.groundKind==='vehicle');
    inf.pos.copy(groundPoint(12.2,9.5));tank.pos.copy(groundPoint(18,12));select(inf);
    camAnim=null;controls.target.copy(c.pos);camera.position.copy(c.pos).add(new THREE.Vector3(0,65,.01));camera.lookAt(c.pos);controls.update();groundDraw();
  });await page.click('#groundBoard');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const p=await page.evaluate(()=>{
    const c=fleets.find(groundLandingShip),p=proj(c.pos),hit=document.elementFromPoint(p.x,p.y);
    if(pick(p.x,p.y).best!==c||!(hit===renderer.domElement||c.el.contains(hit)))throw new Error('乗艦のクリック位置に別の名札が重なっている');return p;
  });await page.mouse.click(p.x,p.y);
  check(await page.evaluate(()=>{const inf=selected,c=fleets.find(groundLandingShip),ordered=inf.order?.target===c;for(let i=0;i<400;i++)step(.05);groundDraw();return ordered&&inf.embarked===c;}),'上陸の実画面: 乗艦ボタンと艦クリックで再乗艦');
  await page.evaluate(()=>{select(fleets.find(groundLandingShip));});await page.click('#groundLand');
  check(await page.evaluate(()=>{
    step(1);groundDraw();const el=selected.groundLandingVisual;reset({op:'groundExercise2'});
    const clean=!el.isConnected&&!document.querySelector('.ground-landing')&&fleets.filter(groundLandingShip).every(f=>!f.groundUnloading&&groundPassengers(f).length===2);
    reset({op:'charybdis'});return clean&&!groundVisuals&&fleets.every(f=>!f.embarked&&!f.groundLanding);
  }),'上陸の実画面: 再初期化でゲージを消して宇宙へ戻る');
}
function createGroundContext(){
  const label=()=>{const children={};return {style:{},remove(){this.removed=true;},classList:{add(){}},querySelector:key=>children[key]||(children[key]={style:{},addEventListener(){}}),matches:()=>false,insertAdjacentHTML(){}};};
  const ctx=vm.createContext({THREE:require('three'),window:{},document:{getElementById:id=>['groundMove','groundHold','groundCommandExpand','groundDeploy','groundPlan','groundExecute'].includes(id)?{addEventListener(){}}:null,querySelectorAll:()=>[],createElement:label},op:{ground:'exercise2'},fleets:[],gameSec:0,over:false,TEAM_COL:['blue','red'],TEAM_NAME:['連合','共和国'],fid:1,HP_K:7,CARRIERS:new Set(),makeHangars:()=>[],mkUnitLabel:label,dropArrow:()=>{},makeArrow:()=>null,speedOf:f=>f.speed,orderTargets:()=>[],end:()=>{},shoot:()=>{},burst:()=>{},tutorialProtected:()=>false,tutorialDamage:()=>{},patrolHunting:()=>false,umbrellaPack:()=>false,engaged:new Map(),fortress:{defend:false},phaseName:'交戦',logEvent:()=>{},unselect:()=>{},colOf:f=>f.team,portCarrier:null,opCarrier:null,updateRoster:()=>{},rescue:null});
  ctx.WOS_DATA=ctx.window.WOS_DATA={};
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),run=s=>vm.runInContext(s,ctx);
  for(const file of ['data/ships.js','data/operations.js','data/terrain/exercise2.js','battle/shapes.js','battle/terrain.js','battle/ground-sight.js','battle/ground-strike.js','battle/ground-transport.js','battle/ground-supply.js','battle/ground.js','battle/ground-plan.js']){run(read(file));ctx.WOS_TERRAIN=ctx.window.WOS_TERRAIN;}
  const state=read('battle/state.js'),hud=read('battle/hud.js'),sim=read('battle/sim.js');
  run(state.slice(state.indexOf('function makeFleet('),state.indexOf('/* carriers: craft sortie')));
  run(hud.slice(hud.indexOf('function order('),hud.indexOf('const ray=')));
  run(sim.slice(sim.indexOf('function damage('),sim.indexOf('let outcome=')));
  run(sim.slice(sim.indexOf('function nextOrder('),sim.indexOf('function followPath(')));
  run(sim.split('\n').find(line=>line.startsWith('function speedOf(')));
  ctx.followPath=(f,dt)=>run('groundFollow')(f,dt);
  return {ctx,read,run};
}
function nodeChecks(){
  const {ctx,read,run}=createGroundContext();
  // 初回 reset は fleets の生成前に groundSetup → groundConfigure を呼ぶ（宇宙でも地上でも）。
  ctx.document.getElementById=()=>({classList:{toggle(){}},hidden:false});
  const results=run(`[false,true].map(active=>{
    fleets=undefined;groundConfigure(active);
    return {name:(active?'地上':'宇宙')+'の初回初期化は部隊生成前でも例外なし',ok:fleets===undefined&&groundVisuals===null};
  })`);
  run('fleets=[]');
  results.push(...run(`(${landingCases.toString()})()`));
  Object.assign(ctx,{labelsEl:{appendChild(){}},proj:p=>({x:p.x,y:p.z,z:0}),SHIP_SIZE:Object.fromEntries(ctx.WOS_DATA.ships.map(s=>[s.id,s.scale*1.2]))});
  ctx.TEAM_COL=['blue','red'].map(c=>new ctx.THREE.Color(c));
  results.push(...run(`(()=>{
    const results=[],check=(name,ok)=>results.push({name,ok});
    op=WOS_DATA.operations.find(o=>o.id==='groundExercise2');fleets=[makeFleet(0,op.quick[0])];groundSeaDeploy();
    groundHud=groundCaptureInit=groundSightInit=()=>{};groundBoard=new THREE.Group();
    globalThis.shipMeshes=[0,1].map(()=>Object.fromEntries(['cv','dd','cl'].map(t=>[t,new THREE.Mesh(shapeGeo(t),new THREE.MeshStandardMaterial())])));
    const org={companies:[{id:'test',name:'test',kind:'vehicle'}],battalions:[],brigades:[]},before=JSON.stringify(org);
    groundInitOrg(org);groundInit();const c=fleets.find(groundLandingShip),cargo=groundPassengers(c);
    check('opの初期搭載を実生成し編成の保存データは変えない',cargo.length===2&&JSON.stringify(org)===before&&cargo.every(f=>f.embarked===c&&!f.groundModel.visible&&groundMembers('companies',f.companyId)[0]===f));
    check('揚陸艦は研究・共通倍率を使わず駆逐艦の固定性能',c.hp===groundSeaStats('dd').hp&&c.speed===groundSeaStats('dd').speed&&c.band==='sea');
    c.pos.copy(groundPoint(12.2,7.4));groundTransportSync();groundLandCommand([c]);groundStep(5);groundDraw();const el=c.groundLandingVisual;
    check('既存ゲージの形で上陸5秒と被弾倍率を描く',el&&el.querySelector('small').textContent==='5.0 / 10秒・被弾1.3倍'&&parseFloat(el.querySelector('i').style.width)===50);
    groundTransportReset();check('再初期化で上陸ゲージと時計を破棄',el.removed&&!c.groundUnloading&&!c.groundLandingVisual);
    return results;
  })()`));
  const failed=results.filter(c=>!c.ok);
  console.log(`| 海からの上陸（ブラウザ不要・実生成/経路/damage/占拠） | ${results.length-failed.length}/${results.length} 成功 |`);
  if(failed.length){console.error(failed);process.exitCode=1;}
}
module.exports={landingCases,setupLandingScene,checkGroundLanding,createGroundContext};
if(require.main===module)nodeChecks();
