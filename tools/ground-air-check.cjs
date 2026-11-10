/* 実演習で航空の追尾・物理投下を確認し、1600×900で撮影する。 */
const {openGame,ROOT}=require('./browser.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS);
  await page.evaluate(()=>{
   window.requestAnimationFrame=()=>0;
   const base=OPS.find(o=>o.id==='groundExercise2'),old={quick:base.quick,enemies:base.enemies,groundSea:base.groundSea},unit=(name,kind,x,y,band='ground')=>({name,groundKind:kind,type:'cv',n:1,scale:.3,pos:[(x-24)*4,(18-y)*4],band,stance:'evade'});
   try{base.quick=[unit('戦闘航空隊','fighter',18,20,'low'),unit('広域戦略支援航空隊','supportAircraft',14,25,'high')];base.enemies=[unit('固定航空目標','fighter',19.5,20,'low'),unit('固定地上目標','infantry',26,25)];base.groundSea=[];reset({op:base.id,fleets:base.quick});}finally{Object.assign(base,old);}
   if(talking)endTalk();endDeploy();setSpeed(0);fleets.forEach(f=>{f.stance='evade';f.groundAAEnabled=false;});op={...op,groundHQ:null,groundStaticEnemies:true};
  });
  const dogfight=await page.evaluate(()=>{
   const f=fleets.find(f=>f.team===0&&f.groundKind==='fighter'),t=fleets.find(f=>f.team===1&&f.groundKind==='fighter');f.heading.set(1,0,0);const at=f.pos.clone(),hp=t.hpPool;select(f);groupOrder({type:'attack',target:t});groundStep(.05);
   camAnim=null;controls.target.copy(f.pos).add(t.pos).multiplyScalar(.5);camera.position.copy(controls.target).add(new THREE.Vector3(0,30,32));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
   return {moved:f.pos.distanceTo(at)>0,hit:t.hpPool<hp,rangeKm:groundTargetRange(f,t)/GROUND_SCALE,order:f.order?.target===t};
  });assert(dogfight.moved&&dogfight.hit&&dogfight.rangeKm===2&&dogfight.order);
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.shots','ground-air-dogfight.png')});
  const bombing=await page.evaluate(()=>{
   const f=fleets.find(f=>f.team===0&&f.groundKind==='supportAircraft'),t=fleets.find(f=>f.groundKind==='infantry');groundClearOrders(fleets.find(f=>f.team===0&&f.groundKind==='fighter'));f.heading.set(1,0,0);select(f);groundSalvoInput.value=2;groundStrikeToggle();groundAreaTap(t.pos.clone());groundAreaTap(t.pos.clone().add(new THREE.Vector3(1.5,0,0)));if(!f.groundBombRun)throw Error('爆撃進入が始まらない');const ledger=f.groundBombRun.ledger,aim=ledger.shot.aim.clone(),before=t.hpPool;
   for(let i=0;i<4000&&!groundStrikes.some(s=>s.source===f);i++)groundStep(.05);
   const s=groundStrikes.find(s=>s.source===f);if(!s)throw Error('爆撃機が進入しても投下しない');
   const impact=s.impact.clone();window.bombBrowserCheck={s,t,before,f};
   camAnim=null;controls.target.copy(f.pos).add(s.impact).multiplyScalar(.5);camera.position.copy(controls.target).add(new THREE.Vector3(0,34,38));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);groundDraw();groundStrikeDraw();frame(performance.now());
   return {keptAim:s.aim.equals(aim),fromActual:s.flight.origin.distanceTo(f.pos)<1e-6,duration:s.duration,physicalSeconds:s.flight.physicalDuration,velocityMps:s.flight.velocityMeters.toArray(),noInstantDamage:t.hpPool===before,remaining:f.groundAreaSalvo?.remaining,issued:ledger.issued,unseen:!s.observed,impact:impact.toArray()};
  });assert(bombing.keptAim&&bombing.fromActual&&bombing.noInstantDamage&&bombing.remaining===1&&bombing.issued&&bombing.duration>0&&Math.abs(bombing.velocityMps[0]-125)<1);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-air-bombing.png')});
  const landing=await page.evaluate(()=>{const {s,t,before,f}=window.bombBrowserCheck,p=s.impact.clone();f.heading.set(0,0,1);groundStrikeStep(s.left);const hit=t.hpPool<before,unchanged=s.impact.equals(p);groundHold([f]);return {hit,unchanged,cancelled:!f.groundAreaSalvo&&!f.groundBombRun};});assert(landing.hit&&landing.unchanged&&landing.cancelled);
  await page.evaluate(()=>{reset({op:'charybdis'});setSpeed(0);});assert.equal(await page.locator('.ground-range-label').count(),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({dogfight,bombing,landing,spaceClean:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
