/* node tests/ground-transport.cjs：ブラウザ不要。実際の経路・命令・damage・撃破処理を固定場面で確認。
   npm test では同じ場面とボタン／クリック／ゲージ／作戦の再初期化を確認する。 */
const fs=require('fs'),path=require('path'),vm=require('vm');
function transportCases(){
  const saved={op,fleets,groundSites,groundBridges,groundBridgeRevision,groundWorkAiming,groundTransportMessage,groundStrikes,groundImpacts,groundHeight,groundForests,groundBuildings,groundFog,over,end,shoot,burst,groundHud,random:Math.random};
  const results=[],check=(name,ok)=>results.push({name,ok});let id=100;
  const unit=(kind,x,y,team=0)=>{
    const type=WOS_TERRAIN.exercise2.unitTypes[kind],pos=groundPoint(x,y);
    return {...type,id:id++,name:type.name,kind:'fleet',groundKind:kind,team,band:'ground',alive:true,hpPool:type.hp*4,groundMaxHp:type.hp*4,n:4,pos,post:pos.clone(),home:pos.clone(),heading:new THREE.Vector3(1,0,0),march:new THREE.Vector3(1,0,0),ships:Array.from({length:4},()=>({pos:pos.clone()})),queue:[],order:null,stance:'evade',el:{remove(){}}};
  };
  const tick=seconds=>{let left=seconds;while(left>1e-8){const dt=Math.min(.05,left);groundStep(dt);left-=dt;}};
  try{
    // 兵科・視線・輸送の固定場面には本営を置かない。補給との組合せはground-supplyで確認。
    op={...op,groundHQ:null};
    fleets=[];groundSites=[];groundBridges=[];groundBridgeRevision=0;groundStrikes=[];groundImpacts=[];groundForests=[];groundBuildings=[];groundFog=null;over=false;end=()=>{};shoot=burst=groundHud=()=>{};groundHeight=()=>0;groundHeightCacheReset();Math.random=()=>0;
    const carrier=unit('apc',10,27),infantry=unit('infantry',8,27),heavy=unit('heavyInfantry',8,28),tank=unit('vehicle',10,28),enemy=unit('infantry',10,27,1);fleets=[carrier,infantry,heavy,tank,enemy];
    check('輸送車と工兵は独立した兵科データ',carrier.speed===4&&carrier.range===8&&WOS_TERRAIN.exercise2.unitTypes.engineer.hp===40);
    check('乗車命令で離れた歩兵が輸送車へ向かう',groundBoardCommand([infantry],carrier)&&!infantry.embarked&&infantry.order.type==='board');
    check('輸送車1中隊に2中隊は予約できない',!groundBoardCommand([heavy],carrier));
    check('戦車と敵部隊は乗車不可',!groundBoardCommand([tank],carrier)&&!groundBoardCommand([enemy],carrier));
    tick(8);check('接近して1中隊を搭載し両者が停止',infantry.embarked===carrier&&carrier.groundPassenger===infantry&&!infantry.order&&!carrier.order);
    check('搭載名札に歩兵の中隊名',groundTransportLabel(carrier).includes('搭載：'+infantry.name));
    const pos=infantry.pos.clone();order(infantry,{type:'move',dest:groundPoint(15,27)});check('搭載中の独立移動命令を拒否',!infantry.order&&infantry.pos.equals(pos));
    check('搭載中の高度変更を拒否',!groundSetBand([infantry],'ground'));
    groundUpdateSight();check('搭載部隊は索敵・直接射撃・標的から除外',!groundCanFire(infantry,enemy)&&!groundCanFire(enemy,infantry)&&!groundCanSee(infantry,enemy)&&!groundSeenBy(0,infantry));
    const site={pos:carrier.pos.clone(),captureRadius:2,captureSec:30,owner:null,progress:[0,0],contested:false};groundSites=[site];enemy.pos.copy(groundPoint(40,27));tick(3);
    check('搭載した歩兵は占拠しない',site.owner===null&&site.progress[0]===0);
    order(carrier,{type:'move',dest:groundPoint(12,27)});tick(3);check('輸送車の移動に搭載歩兵も追従',infantry.pos.equals(carrier.pos));
    check('降車で通れる隣接地に出て独立する',groundUnload(carrier)&&!infantry.embarked&&!carrier.groundPassenger&&infantry.pos.distanceTo(carrier.pos)>0&&groundPass(infantry.pos.x/4+24,18-infantry.pos.z/4,groundMoveKind(infantry)));
    site.pos.copy(infantry.pos);tick(1);check('降車後は中立拠点を0.5秒で占領',site.owner===0&&site.progress[0]===0);
    groundSites=[];infantry.pos.copy(carrier.pos);check('再乗車できる',groundBoardCommand([infantry],carrier));tick(.05);
    const hp=infantry.hpPool;enemy.pos.copy(carrier.pos);enemy.range=100;groundUpdateSight();damage(carrier,carrier.hpPool,enemy);
    check('本物の damage で輸送車が撃破される',!carrier.alive);
    check('輸送車撃破で歩兵は最大耐久の50%を失い降車',!infantry.embarked&&infantry.alive&&infantry.hpPool===hp-infantry.groundMaxHp*.5&&infantry.ships.length===2);
    const c2=unit('apc',12,27),hurt=unit('heavyInfantry',12,27);hurt.hpPool=60;fleets=[c2,hurt,enemy];groundBoardCommand([hurt],c2);tick(.05);enemy.pos.copy(c2.pos);groundUpdateSight();damage(c2,c2.hpPool,enemy);
    check('損傷した搭載中隊は撃破の損害で全滅する場合がある',!hurt.alive&&!hurt.embarked);
    const c3=unit('apc',9,27),p3=unit('infantry',8,27);fleets=[c3,p3];groundBoardCommand([p3],c3);order(p3,{type:'move',dest:groundPoint(7,27)});
    check('別の移動命令で乗車予約を解放',!c3.groundBoarder&&p3.order.type==='move');
    check('工兵・輸送車は川で0.5倍',groundMoveKind(unit('engineer',9,27))==='engineer'&&WOS_TERRAIN.exercise2.movement.river.apc===.5&&WOS_TERRAIN.exercise2.movement.river.engineer===.5);
    const engineer=unit('engineer',23.8,12),vehicle=unit('vehicle',23.8,12.5);fleets=[engineer,vehicle];
    // 分流 east の第3区間の中点。川の形を変えず、データから狭い地点と両岸を求める。
    const river=WOS_TERRAIN.exercise2.water.rivers.find(r=>r.id==='east'),i=2,a=river.points[i],b=river.points[i+1],center=groundPoint((a[0]+b[0])/2,(a[1]+b[1])/2),plan=groundBridgePlan(center);
    check('狭い分流の川幅と両岸を判定',!plan.reason&&plan.width<=.3&&plan.banks.length===2);
    engineer.pos.copy(plan.banks[0]);vehicle.pos.copy(plan.banks[0]);const dest=plan.banks[1];
    const before=groundPath(vehicle.pos,dest,'vehicle');const ford=WOS_TERRAIN.exercise2.objects.fords.find(f=>f.river===river.id);
    check('架橋前は既存の浅瀬へ迂回し通行不可の川を横切らない',!!before&&before.L>vehicle.pos.distanceTo(dest)*1.1&&before.points.every(p=>groundPass(p.x/4+24,18-p.z/4,'vehicle'))&&before.points.some(p=>Math.hypot(p.x/4+24-ford.x,18-p.z/4-ford.y)<WOS_TERRAIN.exercise2.meta.cellKm));
    check('川幅0.3 kmちょうどは架橋可能',!groundBridgePlan(groundPoint(...river.points[3])).reason);
    check('川幅0.3 kmを少し超えると架橋不可',groundBridgePlan(groundPoint(24.204,10.996)).reason.includes('上限'));
    const bridge=groundBridgeCommand([engineer],center);tick(.05);check('川岸で架橋作業を開始',!!bridge&&engineer.groundBuilding&&!bridge.complete);
    tick(10);check('架橋10秒で半分、未完成の橋は通行不可',Math.abs(bridge.progress-10)<1e-7&&!groundBuiltBridgeAt(bridge.x,bridge.y,bridge.river)&&!groundPass(bridge.x,bridge.y,'vehicle'));
    const red=unit('infantry',bridge.x,bridge.y,1);fleets.push(red);tick(1);check('建設位置に敵が来ると進捗が停止',Math.abs(bridge.progress-10)<1e-7);red.pos.copy(groundPoint(40,27));
    tick(10);check('作業20秒で完成し経路の版を更新',bridge.complete&&groundBridgeRevision===1&&!engineer.order);
    check('完成した橋は地上の全兵科が使える',Object.keys(WOS_TERRAIN.exercise2.movement.river).every(kind=>groundPass(bridge.x,bridge.y,kind)));
    const after=groundPath(vehicle.pos,dest,'vehicle');check('完成後は時間の短い仮設橋を選ぶ',after&&after.cost<before.cost&&after.L<before.L);
    vehicle.order={type:'move',dest:dest.clone(),path:before};let crossed=false,safe=true;
    for(let n=0;n<1000&&vehicle.order;n++){groundStep(.05);crossed ||= groundBuiltBridgeAt(vehicle.pos.x/4+24,18-vehicle.pos.z/4,bridge.river);safe &&= groundPass(vehicle.pos.x/4+24,18-vehicle.pos.z/4,'vehicle');}
    check('既存の移動命令も再計算し戦車が橋を安全に渡る',crossed&&safe&&!vehicle.order&&groundDistanceTo(vehicle,{pos:dest})<1e-6);
    const enemyTank=unit('vehicle',plan.banks[0].x/4+24,18-plan.banks[0].z/4,1);fleets.push(enemyTank);order(enemyTank,{type:'move',dest});tick(6);
    check('敵戦車も同じ仮設橋を渡れる',!enemyTank.order&&groundDistanceTo(enemyTank,{pos:dest})<1e-6);
    const main=WOS_TERRAIN.exercise2.water.rivers.find(r=>r.id==='main'),wide=groundPoint(...main.points[2]),count=groundBridges.length;
    groundWorkAiming='bridge';check('広い本流は理由付きで拒否し指定を続ける',!groundBridgeCommand([engineer],wide)&&groundBridges.length===count&&groundTransportMessage.includes('上限 0.3 km')&&groundWorkAiming==='bridge');
    check('陸地への架橋も理由付きで拒否',!groundBridgeCommand([engineer],groundPoint(9,27))&&groundTransportMessage.includes('川の地点'));
    const gun=unit('artillery',bridge.x-2,bridge.y);gun.dmg=50;fleets.push(gun);const shot=groundStrikeLaunch(gun,bridge.pos);tick(shot.left);
    check('地点攻撃の実着弾で橋が壊れる',!groundBridges.includes(bridge)&&groundBridgeRevision===2&&!groundPass(bridge.x,bridge.y,'vehicle'));
    const detour=groundPath(plan.banks[0],dest,'vehicle');check('破壊後は仮設橋を外して迂回する',detour&&detour.L>after.L);
    const restart=groundBridgeCommand([engineer],center);tick(.05);tick(2);order(engineer,{type:'move',dest:groundPoint(25,14)});
    check('工兵へ別命令を出すと未完成の架橋を中止',!!restart&&!groundBridges.includes(restart)&&!engineer.groundBuilding);
    groundBridgeCommand([engineer],center);
    // 工兵撃破は直接同地点から行う。
    enemyTank.pos.copy(engineer.pos);groundUpdateSight();damage(engineer,engineer.hpPool,enemyTank);
    check('工兵の撃破で未完成の架橋を片付ける',!engineer.alive&&!groundBridges.length);
  }finally{op=saved.op;
    groundBridges.forEach(groundBridgeDropVisual);groundStrikes.forEach(groundStrikeDropVisual);groundImpacts.forEach(groundStrikeDropVisual);
    ({fleets,groundSites,groundBridges,groundBridgeRevision,groundWorkAiming,groundTransportMessage,groundStrikes,groundImpacts,groundHeight,groundForests,groundBuildings,groundFog,over,end,shoot,burst,groundHud}=saved);Math.random=saved.random;groundHeightCacheReset();
  }
  return results;
}
async function checkGroundTransport(page,check){
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);endDeploy();});
  for(const c of await page.evaluate(transportCases))check(c.ok,'輸送・工兵: '+c.name);
  await page.evaluate(()=>{
    const base=OPS.find(o=>o.id==='groundExercise2').quick[0];
    reset({op:'groundExercise2',fleets:['infantry','apc','engineer','vehicle'].map(kind=>({...base,name:WOS_TERRAIN.exercise2.unitTypes[kind].name,groundKind:kind}))});setSpeed(0);endDeploy();
    fleets.forEach(f=>{f.stance='evade';f.order=null;f.queue=[];f.pos.copy(groundPoint(f.team?44:9,27));});
    const infantry=fleets.find(f=>f.groundKind==='infantry'&&f.team===0),carrier=fleets.find(f=>f.groundKind==='apc');
    infantry.pos.copy(groundPoint(5,27));carrier.pos.copy(groundPoint(10,27));fleets.filter(f=>f.team===0&&f!==infantry&&f!==carrier).forEach((f,i)=>f.pos.copy(groundPoint(6+3*i,33)));select(infantry);
    camAnim=null;controls.target.copy(carrier.pos);camera.position.copy(carrier.pos).add(new THREE.Vector3(0,70,.01));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);
  });
  await page.locator('#groundBoard').click();check(await page.evaluate(()=>groundWorkAiming==='board'),'輸送の操作: 乗車ボタン');
  await page.keyboard.press('Escape');check(await page.evaluate(()=>!groundWorkAiming&&!paused),'輸送の操作: Esc取消');
  // 取消後の通常クリックは選択。搭乗先の指定には改めて搭乗ボタンを押す。
  await page.locator('#groundBoard').click({noWaitAfter:true});
  // カメラ・部隊を直接動かしたあとは、描画ループが行列と名札の位置を
  // 更新してから座標を取る。proj() は camera.matrixWorldInverse を使い、
  // controls.update() だけではその行列も DOM の名札も更新されない。
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const p=await page.evaluate(()=>{
    const c=fleets.find(f=>f.groundKind==='apc'),p=proj(c.pos),hit=document.elementFromPoint(p.x,p.y);
    if(pick(p.x,p.y).best!==c||!(hit===renderer.domElement||c.el.contains(hit)))throw new Error('乗車クリックの位置が輸送車に一致しない');
    return p;
  });await page.mouse.click(p.x,p.y);
  const command=await page.evaluate(()=>{
    const c=fleets.find(f=>f.groundKind==='apc'),f=fleets.find(f=>f.team===0&&f.groundKind==='infantry');
    return {ok:c.groundBoarder===f&&f.order?.type==='board'&&f.order.target===c,selected:selected?.name,status:groundTransportMessage};
  });
  check(command.ok,'輸送の操作: クリック直後に乗車命令と予約が成立',JSON.stringify(command));
  if(!command.ok)throw new Error('輸送車クリックで乗車命令が成立しなかった');
  const boarded=await page.evaluate(()=>{for(let i=0;i<800;i++)step(.05);groundDraw();const c=fleets.find(f=>f.groundKind==='apc');updateFleetLabel(c,false,'');return c.groundPassenger&&c.el.textContent.includes('搭載：')&&!c.groundPassenger.groundModel.visible;});
  check(boarded,'輸送の実画面: 輸送車クリックで乗車し搭載名札・歩兵モデル非表示');
  if(!boarded)throw new Error('乗車命令後40秒で搭載・名札・モデル非表示が揃わなかった');
  await page.locator('#groundUnload').click();check(await page.evaluate(()=>!fleets.find(f=>f.groundKind==='apc').groundPassenger),'輸送の操作: 降車ボタン');
  await page.evaluate(()=>select(fleets.find(f=>f.groundKind==='engineer')));await page.locator('#groundBridge').click();
  check(await page.evaluate(()=>groundWorkAiming==='bridge'),'架橋の操作: 架橋ボタン');
  await page.keyboard.press('Escape');
  const point=await page.evaluate(()=>{
    const f=selected,r=WOS_TERRAIN.exercise2.water.rivers.find(r=>r.id==='east'),a=r.points[2],b=r.points[3],p=groundPoint((a[0]+b[0])/2,(a[1]+b[1])/2),plan=groundBridgePlan(p);
    f.pos.copy(plan.banks[0]);camAnim=null;controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,40,.01));camera.lookAt(p);controls.update();camera.updateMatrixWorld(true);return proj(p);
  });
  await page.locator('#groundBridge').click();await page.mouse.click(point.x,point.y);
  const drawn=await page.evaluate(()=>{
    const bridge=groundBridges[0];if(!bridge)return false;
    for(let i=0;i<201;i++)step(.05/WOS_TERRAIN[op.ground].movement.timeScale);groundDraw();
    return !groundWorkAiming&&bridge.visual.el.textContent.includes('架橋中')&&Math.abs(parseFloat(bridge.visual.el.querySelector('i').style.width)-50)<1e-6&&!bridge.visual.deck.visible;
  });check(drawn,'架橋の実画面: 川のクリックで作業中のゲージ');
  const resetState=await page.evaluate(()=>{for(let i=0;i<200;i++)step(.05/WOS_TERRAIN[op.ground].movement.timeScale);groundDraw();const done=groundBridges[0].visual.deck.visible;reset({op:'groundExercise2'});const clean=!groundBridges.length&&!document.querySelector('.ground-bridge');reset({op:'charybdis'});return {done,clean,space:!groundWorkAiming&&document.getElementById('groundAlt').hidden};});
  for(const [key,ok] of Object.entries(resetState))check(ok,'輸送・架橋の実画面: '+key);
}
function nodeTransportScene(ctx){
  const draw=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})},{get:(t,p)=>p in t?t[p]:()=>{}});
  ctx.document.createElement=()=>{
    const children={};return {style:{},getContext:()=>draw,remove(){this.removed=true;},querySelector:key=>children[key]||(children[key]={style:{}})};
  };
  const THREE=require('three');
  for(const key of ['grid','starField','skyObj','fieldRocks','debrisObj','cloudObj','farPlanet','rim'])ctx[key]=new THREE.Group();
  Object.assign(ctx,{scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),ambient:new THREE.AmbientLight(),renderer:{shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}},labelsEl:{appendChild(){}},proj:p=>({x:p.x,y:p.z,z:0}),TEAM_COL:[new THREE.Color('blue'),new THREE.Color('red')]});
  return vm.runInContext(`(()=>{
    groundSetup('exercise2');groundVisuals=new THREE.Group();groundBoard.add(groundVisuals);groundHud=()=>{};
    const results=[],check=(name,ok)=>results.push({name,ok});
    const make=(kind,x,y)=>{
      const type=WOS_TERRAIN.exercise2.unitTypes[kind],pos=groundPoint(x,y);
      return {...type,id:1,kind:'fleet',el:{remove(){}},name:type.name,groundKind:kind,team:0,band:'ground',alive:true,pos,n:4,hpPool:type.hp*4,groundMaxHp:type.hp*4,ships:Array.from({length:4},()=>({pos:pos.clone()})),heading:new THREE.Vector3(),march:new THREE.Vector3(),stance:'evade',queue:[]};
    };
    const infantry=make('infantry',8,27),apc=make('apc',10,27),engineer=make('engineer',4,30),vehicle=make('vehicle',4,30);fleets=[infantry,apc,engineer,vehicle];
    const tick=seconds=>{let left=seconds;while(left>1e-8){const dt=Math.min(.05,left);groundStep(dt);left-=dt;}};
    groundBoardCommand([infantry],apc);tick(8);
    check('写真aの配置：生成済み地形で乗車',infantry.embarked===apc&&groundTransportLabel(apc).includes(infantry.name));
    check('写真bの配置：通れる隣接地へ降車',groundUnload(apc)&&!infantry.embarked&&groundPass(infantry.pos.x/4+24,18-infantry.pos.z/4,'infantry'));
    infantry.pos.copy(groundPoint(4,30));apc.pos.copy(infantry.pos);
    const river=WOS_TERRAIN.exercise2.water.rivers.find(r=>r.id==='east'),a=river.points[2],b=river.points[3],p=groundPoint((a[0]+b[0])/2,(a[1]+b[1])/2),plan=groundBridgePlan(p);
    engineer.pos.copy(plan.banks[0]);vehicle.pos.copy(plan.banks[0]).add(plan.banks[0].clone().sub(plan.pos).setLength(3));
    const bridge=groundBridgeCommand([engineer],p);tick(10.05);groundTransportDraw();
    check('写真cの配置：本物の地形で架橋10秒',engineer.groundBuilding&&Math.abs(bridge.progress-10)<1e-7);
    const {deck,el}=bridge.visual;
    check('架橋中は既存形式の札と50%ゲージ',el.querySelector('b').textContent==='架橋中'&&Math.abs(parseFloat(el.querySelector('i').style.width)-50)<1e-7&&!deck.visible);
    tick(10);groundTransportDraw();
    check('完成すると橋の桁と耐久を表示',deck.visible&&deck.parent===groundVisuals&&el.querySelector('b').textContent.includes('両軍通行可')&&el.querySelector('small').textContent==='耐久 40 / 40');
    check('桁は川の向きに垂直で座標が有限',Math.abs(Math.cos(deck.rotation.y)*bridge.tx+Math.sin(deck.rotation.y)*bridge.ty)<1e-8&&[...deck.geometry.attributes.position.array,deck.position.x,deck.position.y,deck.position.z].every(Number.isFinite));
    order(vehicle,{type:'move',dest:plan.banks[1]});let crossed=false;
    for(let i=0;i<1000&&vehicle.order;i++){
      groundStep(.05);const x=vehicle.pos.x/4+24,y=18-vehicle.pos.z/4;
      if(groundBuiltBridgeAt(x,y,bridge.river)&&Math.abs(-(x-bridge.x)*bridge.ty+(y-bridge.y)*bridge.tx)<bridge.width/2){crossed=true;break;}
    }
    check('写真dの配置：戦車が実経路で橋の川上に到達',crossed);
    const shooter={...make('artillery',bridge.x-2,bridge.y),dmg:100};fleets.push(shooter);
    const shot=groundStrikeLaunch(shooter,bridge.pos);shot.impact.copy(bridge.pos);groundStrikeStep(shot.left);
    check('地点攻撃で壊れた橋の桁と札を破棄',!groundBridges.length&&!deck.parent&&el.removed);
    groundBridgeCommand([engineer],p);groundTransportDraw();const next=groundBridges[0].visual;groundTransportReset();
    check('作戦再初期化で建設中の表示も片付ける',!groundBridges.length&&!next.deck.parent&&next.el.removed&&groundWorkAiming===null&&groundBridgeRevision===0);
    return results;
  })()`,ctx);
}
module.exports={transportCases,checkGroundTransport};
if(require.main===module){
  const element={style:{},remove(){},classList:{add(){},remove(){},toggle(){}},querySelector:()=>({}),querySelectorAll:()=>[],setAttribute(){},addEventListener(){}};
  const ctx=vm.createContext({THREE:require('three'),window:{},document:{querySelectorAll:()=>[],getElementById:()=>element},fleets:[],op:{ground:'exercise2',wipeLose:false},over:false,gameSec:0,TEAM_COL:['blue','red'],dropArrow:()=>{},makeArrow:()=>null,speedOf:f=>f.speed,shoot:()=>{},burst:()=>{},end:()=>{},tutorialProtected:()=>false,tutorialDamage:()=>{},patrolHunting:()=>false,umbrellaPack:()=>false,engaged:new Map(),fortress:{defend:false},phaseName:'交戦',logEvent:()=>{},unselect:()=>{},colOf:f=>f.team,portCarrier:null,opCarrier:null,updateRoster:()=>{},rescue:null});
  for(const file of ['data/terrain/exercise2.js','battle/terrain.js','battle/ground-sight.js','battle/ground-ballistics.js','battle/ground-air.js','battle/ground-air-orders.js','battle/ground-air-missions.js','battle/ground-scatter.js','battle/ground-aa.js','battle/ground-strike.js','battle/ground-transport.js','battle/ground-supply.js','battle/ground-naval.js','battle/ground.js','battle/ground-volley.js']){vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);ctx.WOS_TERRAIN=ctx.window.WOS_TERRAIN;}
  const hud=fs.readFileSync(path.join(__dirname,'../battle/hud.js'),'utf8'),sim=fs.readFileSync(path.join(__dirname,'../battle/sim.js'),'utf8');
  vm.runInContext(hud.slice(hud.indexOf('function order('),hud.indexOf('const ray=')),ctx);
  vm.runInContext(sim.slice(sim.indexOf('function damage('),sim.indexOf('let outcome=')),ctx);
  vm.runInContext(sim.slice(sim.indexOf('function nextOrder('),sim.indexOf('function followPath(')),ctx);
  ctx.followPath=(f,dt)=>vm.runInContext('groundFollow',ctx)(f,dt);
  const results=vm.runInContext(`(${transportCases.toString()})()`,ctx);results.push(...nodeTransportScene(ctx));const failed=results.filter(c=>!c.ok);
  console.log(`| 輸送・工兵の固定場面（ブラウザ不要・実 damage） | ${results.length-failed.length}/${results.length} 成功 |`);
  if(failed.length){console.error(failed);process.exitCode=1;}
}
