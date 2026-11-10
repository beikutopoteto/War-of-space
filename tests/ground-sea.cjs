/* node tests/ground-sea.cjs: ブラウザ不要。実際の生成・命令・経路・damage で⑨aを確認。
   npm test では同じ場面に加えてクリック・モデル・予告円・再初期化を確認する。 */
const fs=require('fs'),path=require('path'),vm=require('vm');
function seaCases(){
  const saved={op,fleets,groundSites,groundForests,groundBuildings,groundFog,groundStrikes,groundImpacts,over,end,shoot,burst,groundHud,stage:op.stage};
  const results=[],check=(name,ok)=>results.push({name,ok}),made=[];
  const unit=(kind,team,x,y,type='dd')=>{
    const pos=groundPoint(x,y),f=makeFleet(team,{name:kind,groundKind:kind,type:kind==='sea'?type:'cv',n:1,scale:.3,pos:[pos.x,pos.z]});
    f.band=groundBands(f)[0];f.bandLeft=0;f.pos.y=groundUnitHeight(f);f.stance='evade';made.push(f);return f;
  };
  const tick=sec=>{for(let i=0;i<Math.round(sec/.05);i++)groundStep(.05);};
  try{
    // 戦闘規則の固定場面では本営とデバッグ専用の固定敵指定を外す。補給はground-supply、固定敵はground-fixesで確認。
    op={...op,groundHQ:null,groundStaticEnemies:false};
    groundSites=[];groundForests=[];groundBuildings=[];groundFog=null;groundStrikes=[];groundImpacts=[];over=false;end=shoot=burst=groundHud=()=>{};
    for(const type of ['dd','cl']){
      op.stage=0;const a=unit('sea',0,12,5,type);op.stage=1;const b=unit('sea',1,14,5,type),base=WOS_DATA.ships.find(s=>s.id===groundNavalModel(a));
      check(type+'：両軍・研究段階によらず固定の元性能',a.hp===6+base.def*5&&a.dmg===.4+base.atk*.45&&a.range===10+base.rng*1.6&&a.speed===2+base.spd&&['hp','dmg','range','speed','eva','scale'].every(k=>a[k]===b[k]));
    }
    const ship=unit('sea',0,12,5),land=groundPoint(12,10),dest=groundPoint(17,4);fleets=[ship];
    check('艦は海面のみ・地上と航空への高度変更不可',groundBands(ship).join()==='sea'&&groundMoveKind(ship)==='sea'&&!groundSetBand([ship],'ground')&&!groundSetBand([ship],'low')&&!groundSetBand([ship],'high'));
    check('海のみ通行、川・池・陸・盤外へ入れない',groundPass(12,5,'sea')&&[[12,10],[23.47,26],[9,11],[-1,0]].every(p=>!groundPass(...p,'sea')));
    check('歩兵・戦車・W.A.S.は海へ入れない',['infantry','vehicle','was'].every(k=>!groundPass(12,5,k)));
    order(ship,{type:'move',dest:land});check('陸への移動命令は経路を作らない',!ship.order&&!groundPath(ship.pos,land,'sea'));
    order(ship,{type:'move',dest});let safe=true,frames=0;
    while(ship.order&&frames++<2000){groundStep(.05);safe&&=groundPass(ship.pos.x/4+24,18-ship.pos.z/4,'sea')&&ship.pos.y===0;}
    check('実際の海上移動は水面固定で目的地へ到着',safe&&!ship.order&&ship.pos.distanceTo(dest)<1e-6);
    check('海岸線を横切る線分を拒否',!groundSeaLeg(groundPoint(14,7.6),groundPoint(17,7.6)));
    ship.pos.copy(groundPoint(12,5));const start=ship.pos.clone(),enemyLand=unit('infantry',1,12,10);fleets=[ship,enemyLand];
    order(ship,{type:'attack',target:enemyLand});tick(.05);
    const landShots=groundStrikes.filter(s=>s.source===ship);
    check('陸上への攻撃命令は遅延弾1発・即時打撃なし・陸へ追跡しない',enemyLand.hpPool===enemyLand.hp&&ship.pos.equals(start)&&!ship.order.path&&ship.fireTarget===enemyLand&&landShots.length===1&&landShots[0].left>0&&landShots[0].aim.x===enemyLand.pos.x&&landShots[0].aim.z===enemyLand.pos.z);
    if(landShots.length===1){groundStrikeStep(landShots[0].left);check('命じた陸上目標には遅延弾の着弾で打撃',enemyLand.hpPool<enemyLand.hp);}
    groundStrikeReset();ship.groundStrikeCooldown=0;
    for(const band of ['low','high','sea']){
      const target=unit(band==='sea'?'sea':'fighter',1,13,5);target.band=band;target.pos.y=groundUnitHeight(target);fleets=[ship,target];ship.order=null;ship.stance='engage';ship.groundShotT=ship.groundAATimer=0;
      const hp=target.hpPool;groundStep(.05);check('艦が '+band+' を通常射撃または独立した自動対空で攻撃',target.hpPool<hp&&(band==='sea'?ship.fireTarget===target:ship.groundAATarget===target&&!ship.fireTarget));
    }
    ship.stance='evade';ship.order=null;const plane=unit('attack',1,13,5);plane.band='low';fleets=[ship,plane];order(plane,{type:'attack',target:ship});let hp=ship.hpPool;groundStep(.05);
    check('低空の攻撃機が艦を実際に射撃',ship.hpPool<hp&&plane.fireTarget===ship);
    plane.band='high';plane.groundShotT=0;hp=ship.hpPool;groundStep(.05);check('高空の攻撃機は艦を撃てない',ship.hpPool===hp&&!plane.fireTarget);
    ship.pos.copy(groundPoint(12,5));ship.groundStrikeCooldown=0;
    const target=unit('infantry',1,12,8.6),friend=unit('infantry',0,12,8.8),seaTarget=unit('sea',1,12,6.5),air=unit('fighter',1,12,8.6);air.band='low';
    fleets=[ship,target,friend,seaTarget,air];groundUpdateSight();
    const seaShot=groundStrikeLaunch(ship,groundPoint(13,5));check('艦砲は海の地点にも間接照準できる',!!seaShot&&seaShot.kind==='sea');groundStrikeReset();ship.groundStrikeCooldown=0;
    const random=Math.random;let s;try{Math.random=()=>0;s=groundStrikeLaunch(ship,target.pos);}finally{op=saved.op;Math.random=random;}
    check('艦砲は弾道から求めた飛翔時間・半径10',s&&s.left>0&&s.left===groundBallisticSolution(ship,target.pos).duration&&s.radius===10&&s.kind==='sea');
    check('艦砲は再装填中に連射不可',!groundStrikeLaunch(ship,target.pos));
    // 本営ありでは打撃が先に士気へ入る。士気を持たない艦・航空も同じ尺度で確認する。
    const remaining=f=>f.hpPool+(f.groundMorale??0);
    // 地形滞在による士気消費などを混ぜず、艦砲の着弾処理だけを進める。
    const before=[target,friend,seaTarget,air].map(remaining),flight=s.left;groundStrikeStep(flight-.01);
    check('計算した着弾時刻の直前には艦砲の損害なし',remaining(target)===before[0]&&remaining(friend)===before[1]&&groundStrikes.length===1);
    groundStrikeStep(.01);check('計算した飛翔時間で着弾し陸上の敵味方に損害',remaining(target)<before[0]&&remaining(friend)<before[1]&&!groundStrikes.length&&groundImpacts.length===1);
    check('艦砲は海面目標にも命中し航空には当たらない',remaining(seaTarget)<before[2]&&remaining(air)===before[3]);
    ship.groundStrikeCooldown=0;const p=groundPoint(23.47,26),was=unit('was',0,23.47,26),infantry=unit('infantry',0,23.47,26);
    const travel=f=>{f.speed=1;f.order={path:{points:[p.clone(),p.clone().add(new THREE.Vector3(.5,0,0))],atIndex:1,s:0}};groundFollow(f,.01);return f.pos.x-p.x;};
    const w=travel(was),i=travel(infantry);
    check('W.A.S.の渡河0.5、通常歩兵は0.2のまま',groundMoveKind(was)==='was'&&groundRiverFactor(23.47,26,'was')===.5&&groundRiverFactor(23.47,26,'infantry')===.2&&Math.abs(w/i-2.5)<1e-6);
    check('W.A.S.の低・高高度は河川の影響なし',['low','high'].every(b=>{was.band=b;return groundMoveKind(was)==='air'&&groundFactor(p.x,p.z,groundMoveKind(was))===1;}));
  }finally{
    groundStrikes.forEach(groundStrikeDropVisual);groundImpacts.forEach(groundStrikeDropVisual);made.forEach(f=>f.el.remove());
    ({fleets,groundSites,groundForests,groundBuildings,groundFog,groundStrikes,groundImpacts,over,end,shoot,burst,groundHud}=saved);op.stage=saved.stage;
  }
  return results;
}
async function checkGroundSea(page,check){
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);endDeploy();});
  for(const c of await page.evaluate(seaCases))check(c.ok,'海の艦: '+c.name);
  const initial=await page.evaluate(()=>{
    reset({op:'groundExercise2'});setSpeed(0);endDeploy();
    const ships=fleets.filter(f=>f.groundKind==='sea');
    return ships.length===5&&ships.filter(f=>!groundLandingShip(f)).length===4&&ships.filter(f=>f.team===0).length===3&&ships.every(f=>f.band==='sea'&&f.pos.y===0&&groundPass(f.pos.x/4+24,18-f.pos.z/4,'sea')&&f.groundModel.children[0].geometry.attributes.position.count===shipMeshes[f.team][f.type].geometry.attributes.position.count)&&groundSites.filter(s=>!(op.groundSupportSites||[]).includes(s.id)).length===3;
  });check(initial,'海の艦: 双方2隻と揚陸艦1隻・既存の艦種別モデル・海面配置・3拠点を維持');
  await page.evaluate(()=>{
    fleets.forEach((f,i)=>{f.stance='evade';f.order=null;f.pos.copy(groundPoint(4+i*2,31));});
    const ship=fleets.find(f=>f.team===0&&f.groundKind==='sea');ship.pos.copy(groundPoint(12,5));
    camAnim=null;controls.target.copy(ship.pos);camera.position.copy(ship.pos).add(new THREE.Vector3(0,65,.01));camera.lookAt(controls.target);controls.update();groundUpdateSight();groundDraw();
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const pos=await page.evaluate(()=>{
    const f=fleets.find(f=>f.team===0&&f.groundKind==='sea'),p=proj(f.pos),hit=document.elementFromPoint(p.x,p.y);
    if(pick(p.x,p.y).best!==f||!(hit===renderer.domElement||f.el.contains(hit)))throw new Error('艦のクリック位置にほかの名札が重なっている');return p;
  });
  await page.mouse.click(pos.x,pos.y);
  check(await page.evaluate(()=>selected?.groundKind==='sea'&&document.getElementById('groundBandStatus').textContent==='海面'&&[...document.querySelectorAll('#groundCommand button')].every(b=>b.disabled)&&!document.getElementById('groundStrike').disabled),'海の艦: 実クリックで選択・海面表示・艦砲ボタン');
  await page.keyboard.press('b');
  for(const point of [[12,8.6],[12.5,8.6]]){const aim=await page.evaluate(p=>proj(groundPoint(...p)),point);await page.mouse.click(aim.x,aim.y);}
  check(await page.evaluate(()=>groundAreaAim?.stage==='width'&&!groundStrikes.length),'海の艦: 始点と終点だけでは発射しない');
  const width=await page.evaluate(()=>proj(groundPoint(12.25,9.1)));await page.mouse.click(width.x,width.y);
  const display=await page.evaluate(()=>{groundDraw();const s=groundStrikes[0];return s?.kind==='sea'&&s.visual.ring.parent===groundVisuals&&s.visual.el.textContent.includes('艦砲 '+s.left.toFixed(1)+'秒');});
  check(display,'海の艦: Bと始点・終点・幅の3クリックで予告円・計算した残り秒');
  const clean=await page.evaluate(()=>{reset({op:'groundExercise2'});const clean=!groundStrikes.length&&!groundImpacts.length&&!document.querySelector('.ground-strike-label');reset({op:'charybdis'});return clean&&fleets.every(f=>f.groundKind!=='sea')&&!groundVisuals;});
  check(clean,'海の艦: 再初期化で予告を消し宇宙戦へ復帰');
}
function nodeChecks(){
  const label=()=>({style:{},remove(){},classList:{add(){}},querySelector:()=>({addEventListener(){}}),matches:()=>false,insertAdjacentHTML(){}});
  const ctx=vm.createContext({THREE:require('three'),window:{},document:{getElementById:()=>({addEventListener(){}}),querySelectorAll:()=>[]},op:{ground:'exercise2'},fleets:[],gameSec:0,over:false,TEAM_COL:['blue','red'],fid:1,HP_K:7,SPEED_K:9,CARRIERS:new Set(),makeHangars:()=>[],mkUnitLabel:label,dropArrow:()=>{},makeArrow:()=>null,speedOf:f=>f.speed,orderTargets:()=>[],end:()=>{},shoot:()=>{},burst:()=>{},tutorialProtected:()=>false,tutorialDamage:()=>{},patrolHunting:()=>false,umbrellaPack:()=>false,engaged:new Map(),fortress:{defend:false},phaseName:'交戦',logEvent:()=>{},destroyFleet:t=>t.alive=false});
  ctx.WOS_DATA=ctx.window.WOS_DATA={};
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),run=s=>vm.runInContext(s,ctx);
  for(const file of ['data/ships.js','data/operations.js','data/terrain/exercise2.js','battle/shapes.js','battle/terrain.js','battle/ground-sight.js','battle/ground-ballistics.js','battle/ground-scatter.js','battle/ground-aa.js','battle/ground-strike.js','battle/ground-transport.js','battle/ground-supply.js','battle/ground-naval.js','battle/ground.js','battle/ground-volley.js']){run(read(file));ctx.WOS_TERRAIN=ctx.window.WOS_TERRAIN;}
  const state=read('battle/state.js'),hud=read('battle/hud.js'),sim=read('battle/sim.js');
  run(state.slice(state.indexOf('function makeFleet('),state.indexOf('/* carriers: craft sortie')));
  run(hud.slice(hud.indexOf('function order('),hud.indexOf('const ray=')));
  run(sim.slice(sim.indexOf('function damage('),sim.indexOf('function destroyFleet(')));
  run(sim.slice(sim.indexOf('function nextOrder('),sim.indexOf('function followPath(')));
  ctx.followPath=(f,dt)=>run('groundFollow')(f,dt);
  const results=run(`(${seaCases.toString()})()`);
  // ブラウザと同じ本営ありの作戦でも実行し、士気で吸収される着弾を確認する。
  run("op=WOS_DATA.operations.find(o=>o.id==='groundExercise2')");
  results.push(...run(`(${seaCases.toString()})()`).map(c=>({...c,name:'本営あり：'+c.name})));
  ctx.TEAM_COL=['blue','red'].map(c=>new ctx.THREE.Color(c));
  Object.assign(ctx,{labelsEl:{appendChild(){}},proj:p=>({x:p.x,y:p.z,z:0}),SHIP_SIZE:Object.fromEntries(ctx.WOS_DATA.ships.map(s=>[s.id,s.scale*1.2]))});
  ctx.document.createElement=()=>({style:{},remove(){this.removed=true;}});
  results.push(...run(`(()=>{
    const results=[],check=(name,ok)=>results.push({name,ok});
    groundHud=groundCaptureInit=groundSightInit=()=>{};groundBoard=new THREE.Group();
    const mat=new THREE.MeshStandardMaterial({transparent:true}),shipMeshes=[0,1].map(()=>Object.fromEntries(['cv','dd','cl'].map(t=>[t,new THREE.Mesh(shapeGeo(t),mat)])));
    // groundInit の実装が参照する外側の共有名へ渡す。
    globalThis.shipMeshes=shipMeshes;
    const spec=WOS_DATA.operations.find(o=>o.id==='groundExercise2');op=spec;
    fleets=[makeFleet(0,spec.quick[0]),...spec.groundSea.map(s=>makeFleet(s.team,s))];
    const org={companies:[{id:'test',name:'中隊',kind:'vehicle'}],battalions:[],brigades:[]},before=JSON.stringify(org);
    groundInitOrg(org);groundInit();
    const ships=fleets.filter(f=>f.groundKind==='sea');
    check('艦は固定配備、編成の保存データは変えず独立選択できる',JSON.stringify(org)===before&&groundOrg.companies.length===4&&groundMembers('companies',ships[0].companyId)[0]===ships[0]);
    check('海の5隻とも実モデルの頂点と大きさを流用',ships.length===5&&ships.every(f=>{const mesh=f.groundModel.children[0],src=shipMeshes[f.team][groundNavalModel(f)||f.type];return mesh.geometry!==src.geometry&&mesh.geometry.attributes.position.count===src.geometry.attributes.position.count&&[...mesh.geometry.attributes.position.array].every(Number.isFinite)&&mesh.scale.x===SHIP_SIZE[groundNavalModel(f)||f.type]&&f.pos.y===0;}));
    groundView='high';groundDraw();check('海面表示も高度ビューの濃淡に従い論理的な段は維持',ships.filter(f=>f.team===0).every(f=>f.band==='sea'&&f.groundModel.position.y===0&&+f.el.style.opacity===groundRules().dimOpacity));
    groundView='all';const f=ships[0],target=groundPoint(12,8.6),s=groundStrikeLaunch(f,target);groundDraw();
    check('艦砲の円・計算した残り秒を実描画',s&&s.visual.ring.parent===groundVisuals&&[...s.visual.ring.geometry.attributes.position.array].every(Number.isFinite)&&s.visual.el.textContent.includes('艦砲 '+s.left.toFixed(1)+'秒'));
    groundStrikeStep(s.left);groundDraw();check('着弾の円へ切り替わる',!s.visual&&groundImpacts.length===1&&groundImpacts[0].visual.el.textContent==='着弾');
    groundStrikeReset();check('予告と着弾の表示をリセットで破棄',!groundStrikes.length&&!groundImpacts.length);
    return results;
  })()`));
  const failed=results.filter(c=>!c.ok);
  console.log(`| 海の艦・艦砲（ブラウザ不要・実生成/経路/damage） | ${results.length-failed.length}/${results.length} 成功 |`);
  if(failed.length){console.error(failed);process.exitCode=1;}
}
module.exports={checkGroundSea,seaCases};
if(require.main===module)nodeChecks();
