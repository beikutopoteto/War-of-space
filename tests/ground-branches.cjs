/* node tests/ground-branches.cjs：ブラウザ不要。本物の命令・射撃・damage・経路で⑧を確認。
   npm test では同じ固定場面と、編成・自動交戦ボタン・標的クリックも確認する。 */
const fs=require('fs'),path=require('path'),vm=require('vm');
const NEW_KINDS=['commando','guidedRocket','droneHive','mechanicalAssault','mobileAA'];
function branchCases(){
  const saved={fleets,groundSites,groundHeight,groundForests,groundBuildings,groundFog,groundStrikes,groundImpacts,over,end,shoot,burst,unselect,logEvent,groundHud};
  const results=[],check=(name,ok)=>results.push({name,ok});let id=100;
  const unit=(kind,team=0,x=8,y=27)=>{
    const type=WOS_TERRAIN.exercise2.unitTypes[kind],pos=groundPoint(x,y);
    return {...type,id:id++,name:type.name,kind:'fleet',groundKind:kind,team,band:groundBands({groundKind:kind})[0],alive:true,n:4,hpPool:type.hp*4,groundMaxHp:type.hp*4,pos,post:pos.clone(),home:pos.clone(),heading:new THREE.Vector3(1,0,0),march:new THREE.Vector3(1,0,0),ships:Array.from({length:4},()=>({pos:pos.clone()})),queue:[],order:null,stance:'evade',el:{remove(){}}};
  };
  const tick=seconds=>{for(let i=0;i<Math.round(seconds/.05);i++)groundStep(.05);};
  const near=(a,b)=>Math.abs(a-b)<1e-7;
  try{
    groundSites=[];groundHeight=()=>0;groundHeightCacheReset();groundForests=[];groundBuildings=[];groundFog=null;groundStrikes=[];groundImpacts=[];over=false;end=shoot=burst=unselect=logEvent=groundHud=()=>{};
    check('16兵科をデータに収録',Object.keys(WOS_TERRAIN.exercise2.unitTypes).length===16);
    for(const kind of ['guidedRocket','droneHive','mechanicalAssault']){
      const f=unit(kind),target=unit('vehicle',1,9,27),other=unit('infantry',1,8,28);fleets=[f,target,other];
      f.stance='engage';f.fireTarget=other;f.strike=other;groundUpdateSight();const hp=other.hpPool;
      damage(other,10,f);tick(1.1);
      check(kind+'：自動交戦・残存目標・直接damageでも未許可の打撃0',other.hpPool===hp&&target.hpPool===target.groundMaxHp&&!f.fireTarget);
      order(f,{type:'attack',target});f.groundShotT=0;const before=target.hpPool;tick(.05);
      check(kind+'：命じた目標へ実際に打撃',target.hpPool<before&&other.hpPool===hp&&f.fireTarget===target);
      f.groundShotT=0;target.pos.copy(groundPoint(17,27));groundUpdateSight();tick(.05);
      check(kind+'：許可目標が射程外でも近い別の敵を撃たない',other.hpPool===hp&&!f.fireTarget);
      target.pos.copy(f.pos);target.band='high';if(kind==='guidedRocket')target.band='sea';f.groundShotT=0;tick(.05);
      check(kind+'：許可目標が撃てない段でも他へ切り替えない',other.hpPool===hp&&!f.fireTarget);
      target.band='ground';target.pos.copy(groundPoint(45,30));f.groundShotT=0;tick(.05);
      check(kind+'：目標を見失うと命令を外し未許可の打撃0',!f.order&&!f.fireTarget&&other.hpPool===hp);
      target.pos.copy(f.pos);target.alive=false;order(f,{type:'attack',target});f.groundShotT=0;tick(.05);
      check(kind+'：許可目標の死亡後も別の敵を撃たない',!f.fireTarget&&other.hpPool===hp);
      target.alive=true;target.hpPool=target.groundMaxHp;order(f,{type:'move',dest:f.pos.clone()});f.groundShotT=0;tick(.05);
      check(kind+'：移動命令で旧許可を使わない',target.hpPool===target.groundMaxHp&&other.hpPool===hp);
      target.alive=false;order(f,{type:'attack',target});f.queue=[{type:'attack',target:other}];f.groundShotT=0;tick(.05);
      check(kind+'：人が予約した次の目標は許可して撃つ',f.order?.target===other&&other.hpPool<hp);
      check(kind+'：名札に許可制',groundTransportLabel(f).includes('許可制'));
      const red=unit(kind,1),blue=unit('vehicle',0,9,27);fleets=[red,blue];red.stance='engage';tick(.05);
      check(kind+'：敵AIも明示した攻撃命令で許可し打撃',red.order?.type==='attack'&&red.order.target===blue&&blue.hpPool<blue.groundMaxHp);
    }
    // 新5兵科×4段。狙いの値でなく本物の damage による耐久差で表を確認。
    for(const [kind,hits] of [['commando',[2,1,0,0]],['guidedRocket',[4,8,8,0]],['droneHive',[2,1,0,0]],['mechanicalAssault',[3,0,0,0]],['mobileAA',[2,8,8,0]]]){
      for(const [i,band] of ['ground','low','high','sea'].entries()){
        const f=unit(kind),t=unit('infantry',1,9,27);t.band=band;fleets=[f,t];order(f,{type:'attack',target:t});const hp=t.hpPool;tick(.05);
        check(kind+'：段別の実打撃 '+band,near(hp-t.hpPool,hits[i]));
      }
    }
    for(const band of ['low','high','ground']){
      const f=unit('mobileAA'),t=unit(band==='ground'?'vehicle':'fighter',1,9,27);t.band=band;fleets=[f,t];order(f,{type:'attack',target:t});const hp=t.hpPool;tick(.05);
      check('自走対空砲：'+band+'へ実打撃',near(hp-t.hpPool,band==='ground'?2:8));
    }
    for(const band of ['ground','low','high']){
      const f=unit('guidedRocket'),t=unit(band==='ground'?'vehicle':'fighter',1,9,27);t.band=band;fleets=[f,t];order(f,{type:'attack',target:t});const hp=t.hpPool;tick(.05);
      check('ロケット：戦車・航空への相性 '+band,near(hp-t.hpPool,band==='ground'?12:8));
    }
    const command=unit('commando'),normal=unit('infantry'),heavy=unit('heavyInfantry',1,9,27);fleets=[command,normal,heavy];groundUpdateSight();
    const hit=f=>{const hp=f.hpPool;damage(f,10,heavy);return hp-f.hpPool;};
    check('開けた場所はコマンドも歩兵も被弾10',near(hit(command),10)&&near(hit(normal),10));
    groundForests=[{x:command.pos.x,z:command.pos.z,r:2}];
    check('森：通常8、コマンド7の実被弾（軽減1.5倍）',near(hit(normal),8)&&near(hit(command),7));
    groundBuildings=[{minX:command.pos.x-.5,maxX:command.pos.x-.2,minZ:command.pos.z-.2,maxZ:command.pos.z+.2,bottom:0,top:2}];
    check('森と市街地が重なっても軽減は重複しない',near(hit(command),7));groundForests=[];
    check('市街地：通常8、コマンド7の実被弾',near(hit(normal),8)&&near(hit(command),7));groundBuildings=[];
    check('コマンドは占拠しない',!groundCanCapture(command));
    const drone=unit('droneHive'),scout=unit('scout');check('ドローンは低空専用・斥候と同視界',groundBands(drone).join()==='low'&&groundMoveKind(drone)==='air'&&groundSightRange(drone)===groundSightRange(scout));
    const machine=unit('mechanicalAssault');fleets=[machine];const hp=machine.hpPool;tick(10);
    check('機械化突撃兵は10秒で最大耐久の1%を消耗',near(machine.hpPool,hp-machine.groundMaxHp*.01));
    machine.hpPool=.001;tick(.05);check('消耗しきると稼働終了し残存数・命令も消える',!machine.alive&&!machine.ships.length&&!machine.order&&machine.hpPool===0);
    // 橋も浅瀬もない本流。新兵科は実経路も渡河表どおり。
    for(const [kind,factor] of [['commando',.2],['guidedRocket',0],['droneHive',1],['mechanicalAssault',.2],['mobileAA',0]]){
      const f=unit(kind),move=groundMoveKind(f),p=groundPoint(23.47,26);
      check(kind+'：川の速度倍率 '+factor,groundRiverFactor(23.47,26,move)===factor&&groundPass(23.47,26,move)===(factor>0));
      const route=groundPath(groundPoint(21,26),groundPoint(26,26),move);
      check(kind+'：対岸への経路を作れる',!!route&&route.points.every(p=>groundPass(p.x/4+24,18-p.z/4,move)));
      if(factor>0)check(kind+'：実移動で渡河の減速',(()=>{f.pos.copy(p);f.speed=1;f.order={type:'move',path:{points:[p.clone(),p.clone().add(new THREE.Vector3(.5,0,0))],atIndex:1,s:0}};groundFollow(f,.01);return near(f.pos.x-p.x,.01*factor);})());
    }
  }finally{({fleets,groundSites,groundHeight,groundForests,groundBuildings,groundFog,groundStrikes,groundImpacts,over,end,shoot,burst,unselect,logEvent,groundHud}=saved);groundHeightCacheReset();}
  return results;
}
// 実画面と写真cで同じ配置を使う。名札の干渉を避けて3隊を三角に離す。
function setupPermissionScene(){
  const base=OPS.find(o=>o.id==='groundExercise2').quick[0];
  WOS.start({op:'groundExercise2',fleets:[{...base,name:'機械化突撃兵',groundKind:'mechanicalAssault'}]});setSpeed(0);
  fleets.forEach((f,i)=>{f.stance='evade';f.order=null;f.queue=[];f.pos.copy(groundPoint(43,29+i));});
  const f=fleets.find(f=>f.team===0),targets=fleets.filter(f=>f.team===1).slice(0,2);
  f.pos.copy(groundPoint(8,25));f.stance='engage';targets[0].pos.copy(groundPoint(10,25));targets[1].pos.copy(groundPoint(8,27));
  targets[0].name='許可する目標';targets[1].name='命じない目標';
  groundUpdateSight();select(f);camAnim=null;controls.target.copy(groundPoint(9,26));camera.position.copy(controls.target).add(new THREE.Vector3(0,50,.01));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);groundDraw();updateRoster();fleets.forEach(f=>updateFleetLabel(f,false,''));
}
function setupAntiAirScene(){
  const operation=OPS.find(o=>o.id==='groundExercise2'),base=operation.quick[0],enemies=operation.enemies;
  // 作戦データは撮影用リセット中だけ差し替え、モデルも通常の groundInit で作る。
  try{
    operation.enemies=[{...base,name:'高高度の航空目標',groundKind:'fighter',band:'high',stance:'evade'}];
    WOS.start({op:operation.id,fleets:[{...base,name:'自走対空砲',groundKind:'mobileAA'}]});setSpeed(0);
  }finally{operation.enemies=enemies;}
  const gun=fleets.find(f=>f.team===0),air=fleets.find(f=>f.team===1);
  gun.pos.copy(groundPoint(8,25));air.pos.copy(groundPoint(12,25));air.pos.y=groundUnitHeight(air);gun.stance='engage';groundUpdateSight();select(gun);
  camAnim=null;controls.target.copy(groundPoint(10,25));camera.position.copy(controls.target).add(new THREE.Vector3(0,70,25));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);
  groundDraw();updateRoster();
}
async function checkGroundBranches(page,check){
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);});
  for(const c of await page.evaluate(branchCases))check(c.ok,'残り兵科: '+c.name);
  const original=await page.evaluate(()=>localStorage.getItem('wos.save.v1'));
  try{
    await page.evaluate(()=>{WOS.openMenu();document.getElementById('forcesOrg').click();});await page.click('[data-org-force="ground"]');
    await page.locator('[data-ground-pick="companies"]').first().click();
    check(await page.locator('#groundKind option').count()===16,'残り兵科: 編成画面に16兵科');
    for(const kind of NEW_KINDS){
      await page.selectOption('#groundKind',kind);
      check(await page.inputValue('#groundKind')===kind&&await page.evaluate(kind=>JSON.parse(localStorage.getItem('wos.save.v1')).groundOrg.companies[0].kind===kind,kind),'残り兵科: 編成選択・保存 '+kind);
    }
    await page.reload();await page.evaluate(()=>{WOS.openMenu();document.getElementById('forcesOrg').click();});await page.click('[data-org-force="ground"]');await page.locator('[data-ground-pick="companies"]').first().click();
    check(await page.inputValue('#groundKind')==='mobileAA','残り兵科: 新兵科の保存を再読込');
    await page.evaluate(setupPermissionScene);
    const policy=await page.evaluate(()=>{const f=selected,s=f.stance;applyStance([f],'evade');return f.stance===s&&f.stBtn.disabled&&f.el.textContent.includes('許可制')&&[...stanceEl.querySelectorAll('[data-st]')].every(b=>b.disabled);});
    check(policy,'残り兵科: 許可制表示・自動交戦の切替無効');
    await page.keyboard.press('r');
    check(await page.evaluate(()=>selected.stance==='engage'),'残り兵科: Rでも許可制の方針を変えない');
    // カメラ更新後、描画を2回待ってからクリック座標を取る。
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const p=await page.evaluate(()=>{const t=fleets.find(f=>f.name==='許可する目標'),p=proj(t.pos),hit=document.elementFromPoint(p.x,p.y);if(pick(p.x,p.y).best!==t||!(hit===renderer.domElement||t.el.contains(hit)))throw new Error('目標のクリック位置に別の名札が重なっている');return p;});
    await page.mouse.click(p.x,p.y);
    await page.click('#pick [data-pk="attack"]');
    check(await page.evaluate(()=>{const t=fleets.find(f=>f.name==='許可する目標'),other=fleets.find(f=>f.name==='命じない目標'),f=selected,hp=t.hpPool,otherHP=other.hpPool;const ordered=f.order?.target===t;for(let i=0;i<22;i++)step(.05);groundDraw();return ordered&&t.hpPool<hp&&other.hpPool===otherHP&&f.fireTarget===t;}),'残り兵科: 実クリックで許可した目標だけを撃つ');
    await page.evaluate(setupAntiAirScene);
    check(await page.evaluate(()=>{const gun=selected,air=fleets.find(f=>f.team===1),hp=air.hpPool;step(.05);groundDraw();return air.hpPool<hp&&gun.fireTarget===air&&air.groundModel.visible&&air.band==='high';}),'残り兵科: 実画面の自走対空砲が高高度の航空機を撃つ');
  }finally{await page.evaluate(s=>{if(s===null)localStorage.removeItem('wos.save.v1');else localStorage.setItem('wos.save.v1',s);},original);await page.reload();}
}
function nodeChecks(){
  const element={style:{},remove(){},classList:{toggle(){}},querySelector:()=>({}),querySelectorAll:()=>[],setAttribute(){}};
  const ctx=vm.createContext({THREE:require('three'),window:{},document:{querySelectorAll:()=>[],getElementById:()=>element},fleets:[],op:{ground:'exercise2',wipeLose:false},over:false,gameSec:0,TEAM_COL:['blue','red'],dropArrow:()=>{},makeArrow:()=>null,speedOf:f=>f.speed,shoot:()=>{},burst:()=>{},end:()=>{},tutorialProtected:()=>false,tutorialDamage:()=>{},patrolHunting:()=>false,umbrellaPack:()=>false,engaged:new Map(),fortress:{defend:false},phaseName:'交戦',logEvent:()=>{},unselect:()=>{},groundHud:()=>{}});
  for(const file of ['data/terrain/exercise2.js','battle/terrain.js','battle/ground-sight.js','battle/ground-strike.js','battle/ground-transport.js','battle/ground.js']){vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);ctx.WOS_TERRAIN=ctx.window.WOS_TERRAIN;}
  const hud=fs.readFileSync(path.join(__dirname,'../battle/hud.js'),'utf8'),sim=fs.readFileSync(path.join(__dirname,'../battle/sim.js'),'utf8');
  vm.runInContext(hud.slice(hud.indexOf('function order('),hud.indexOf('const ray=')),ctx);
  vm.runInContext(sim.slice(sim.indexOf('function damage('),sim.indexOf('function destroyFleet(')),ctx);
  vm.runInContext(sim.slice(sim.indexOf('function nextOrder('),sim.indexOf('function followPath(')),ctx);
  ctx.followPath=(f,dt)=>vm.runInContext('groundFollow',ctx)(f,dt);
  const results=vm.runInContext(`(${branchCases.toString()})()`,ctx),failed=results.filter(c=>!c.ok);
  console.log(`| 残り兵科・射撃許可（ブラウザ不要・実 damage） | ${results.length-failed.length}/${results.length} 成功 |`);
  if(failed.length){console.error(failed);process.exitCode=1;}
}
module.exports={checkGroundBranches,setupPermissionScene,setupAntiAirScene,NEW_KINDS};
if(require.main===module)nodeChecks();
