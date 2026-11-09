/* 実演習のロケット斉射、停止・戻す、補給、複数車両を確認し撮影。 */
const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS);
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;const quick=OPS.find(o=>o.id==='baikonur').quick.map(f=>f.groundKind==='artillery'?{...f,groundKind:'guidedRocket',name:'ロケット砲中隊'}:f.groundKind==='scout'?{...f,groundKind:'artillery',name:'自走砲中隊',n:2}:f);reset({op:'baikonur',fleets:quick});if(talking)endTalk();endDeploy();setSpeed(0);select(fleets.find(f=>f.team===0&&f.groundKind==='guidedRocket'));camAnim=null;const p=selected.pos.clone().add(new THREE.Vector3(0,0,-20));controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,80,55));camera.lookAt(p);controls.update();camera.updateMatrixWorld(true);frame(performance.now());});
  const points=await page.evaluate(()=>{const p=selected.pos.clone().add(new THREE.Vector3(0,0,-40));p.y=groundSurfaceHeight(p.x,p.z);return [proj(p),proj(p.clone().add(new THREE.Vector3(.8,0,0)))];});
  await page.click('#groundStrike',{noWaitAfter:true});await page.mouse.click(points[0].x,points[0].y);await page.mouse.click(points[1].x,points[1].y);
  const initial=await page.evaluate(()=>({shots:groundStrikes.length,fired:selected.groundVolley?.ledger.fired.size}));assert.equal(initial.shots,1);assert.equal(initial.fired,1);
  const burst=await page.evaluate(()=>{groundStrikeStep(.3);groundHud();frame(performance.now());return {shots:groundStrikes.length,fired:selected.groundVolley?.ledger.fired.size,pending:selected.groundVolley?.ledger.entries.length-selected.groundVolley?.ledger.fired.size,cooldown:selected.groundStrikeCooldown,supply:selected.groundSupply};});assert.equal(burst.fired,2);assert.equal(burst.pending,4);
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.shots','ground-rocket-burst.png')});
  await page.click('#groundHold',{noWaitAfter:true});const stopped=await page.evaluate(()=>{const count=groundStrikes.length;groundStrikeStep(2);return !selected.groundVolley&&groundStrikes.length===count;});assert(stopped);
  await page.keyboard.press('Control+z');const restored=await page.evaluate(()=>selected.groundVolley?.ledger.fired.size===2);assert(restored);
  const complete=await page.evaluate(()=>{groundStrikeStep(.95);groundHud();frame(performance.now());return {shots:groundStrikes.length,active:!!selected.groundVolley,cooldown:selected.groundStrikeCooldown,supply:selected.groundSupply,restart:groundVolleyStart(selected,{point:selected.pos.clone().add(new THREE.Vector3(20,0,0))})};});assert.equal(complete.shots,6);assert(!complete.active&&!complete.restart&&complete.cooldown>=30-1e-6);assert(Math.abs(complete.supply-96)<1e-6);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-rocket-volley.png')});
  const guns=await page.evaluate(()=>{const f=fleets.find(f=>f.team===0&&f.groundKind==='artillery'),p=f.pos.clone().add(new THREE.Vector3(20,0,0));p.y=groundHeight(p.x,p.z);const before=groundStrikes.length,supply=f.groundSupply;const fired=groundVolleyStart(f,{point:p});return {vehicles:f.ships.length,fired,count:groundStrikes.length-before,spent:supply-f.groundSupply};});assert(guns.fired&&guns.vehicles===2&&guns.count===2&&Math.abs(guns.spent-4)<1e-6);
  await page.evaluate(()=>{reset({op:'charybdis'});setSpeed(0);});assert.equal(await page.locator('.ground-strike-label').count(),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({initial,burst,stopped,restored,complete,guns,spaceClean:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
