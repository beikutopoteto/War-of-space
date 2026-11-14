/* 海上統合の実画面。確認用の固定配備だけを一時変更し、作戦データは戻す。 */
const {openGame,ROOT}=require('./browser.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900}),rows=[],check=(ok,name)=>rows.push({name,ok:!!ok});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS);
  await require('../tests/ground-sea.cjs').checkGroundSea(page,check);
  await require('../tests/ground-landing.cjs').checkGroundLanding(page,check);
  assert.deepEqual(rows.filter(r=>!r.ok),[]);
  const scene=await page.evaluate(()=>{
   window.requestAnimationFrame=()=>0;
   const base=OPS.find(o=>o.id==='baikonur'),old={groundSea:base.groundSea,enemies:base.enemies},spec=(name,type,x,team=0)=>({name,type,kind:'sea',at:[x,22],band:'sea',team,stance:'evade'});
   try{
    base.groundSea=[spec('高速艇 旧cv','cv',34),spec('高速艇 旧ff','ff',38),spec('イージス艦 旧dd','dd',42),spec('イージス艦 旧cl','cl',46),spec('戦艦 射撃確認','bb',51)];base.enemies=[spec('海上観測目標','cl',64,1)];
    const scout={name:'目視観測航空隊',groundKind:'attack',type:'cv',band:'low',n:1,scale:.3,pos:[56,56],stance:'evade'};
    reset({op:'baikonur',fleets:[...base.quick,scout]});
   }finally{Object.assign(base,old);}
   if(talking)endTalk();endDeploy();setSpeed(0);fleets.forEach(f=>{f.stance='evade';f.groundAAEnabled=false;});groundUpdateSight();
   const ships=fleets.filter(f=>f.team===0&&f.groundKind==='sea');select(ships[2]);camAnim=null;controls.target.copy(groundPoint(18,4));camera.position.copy(controls.target).add(new THREE.Vector3(0,86,54));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
   return ships.map(f=>({name:f.name,sub:f.sub,model:groundNavalModel(f),vertices:f.groundModel.children[0].geometry.attributes.position.count,sourceVertices:shipMeshes[f.team][groundNavalModel(f)].geometry.attributes.position.count,scale:f.groundModel.children[0].scale.x,sourceScale:SHIP_SIZE[groundNavalModel(f)]}));
  });
  assert.deepEqual(scene.map(s=>s.model),['ff','ff','cl','cl','bb']);assert(scene.every(s=>s.vertices===s.sourceVertices&&s.scale===s.sourceScale));
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.shots','ground-naval-models.png')});
  const fire=await page.evaluate(()=>{
   const f=fleets.find(f=>f.name==='戦艦 射撃確認'),t=fleets.find(f=>f.name==='海上観測目標');f.pos.copy(groundPoint(10,4));f.pos.y=0;groundUpdateSight();const initialHP=t.hpPool;select(f);groupOrder({type:'attack',target:t});groundStep(.05);
   const s=groundStrikes.find(s=>s.source===f);if(!s)throw Error('戦艦が観測済みの海上目標へ発射しない');
   const before=t.hpPool,result={distanceKm:groundDistanceTo(f,t)/GROUND_SCALE,horizonKm:groundNavalHorizonKm(f,t),mode:groundFireMode(f,t),seen:groundSeenBy(0,t),flight:s.left,instantDamage:before!==initialHP};
   controls.target.copy(groundPoint(25,4));camAnim=null;camera.position.copy(controls.target).add(new THREE.Vector3(0,160,92));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);groundStrikeStep(.25);frame(performance.now());window.navalShotCheck={s,t,before};return result;
  });assert(fire.seen&&fire.mode==='indirect'&&fire.distanceKm>fire.horizonKm&&!fire.instantDamage);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-naval-indirect.png')});
  const hit=await page.evaluate(()=>{const {s,t,before}=window.navalShotCheck;groundStrikeStep(s.left);return {damaged:t.hpPool<before,remaining:t.hpPool};});assert(hit.damaged);
  await page.evaluate(()=>{reset({op:'charybdis'});setSpeed(0);});assert.equal(await page.locator('.ground-range-label').count(),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks:rows.length,scene,fire,hit,spaceClean:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
