/* 実演習で砲撃の予測・飛翔・着弾、射程マスク、再初期化を確認して撮影。 */
const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS);
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});if(talking)endTalk();endDeploy();setSpeed(0);select(fleets.find(f=>f.team===0&&f.groundKind==='artillery'));camAnim=null;
   const p=selected.pos.clone().add(new THREE.Vector3(20,0,0));controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,90,65));camera.lookAt(p);controls.update();camera.updateMatrixWorld(true);frame(performance.now());});
  const center=await page.evaluate(()=>{const p=selected.pos.clone().add(new THREE.Vector3(40,0,0));p.y=groundSurfaceHeight(p.x,p.z);return {world:{x:p.x,y:p.y,z:p.z},screen:proj(p)};});
  await page.click('#groundStrike',{noWaitAfter:true});await page.mouse.click(center.screen.x,center.screen.y);await page.mouse.move(center.screen.x+5,center.screen.y);await page.evaluate(()=>frame(performance.now()));
  assert(await page.evaluate(()=>groundFlightPreview?.el.textContent.includes('予想着弾')));
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.shots','ground-ballistic-preview.png')});
  await page.mouse.click(center.screen.x+5,center.screen.y);
  const shot=await page.evaluate(()=>{const s=groundStrikes[0];if(!s)throw Error('砲撃が発射されませんでした');const initial={duration:s.duration,physical:s.flight.physicalDuration,clear:s.flight.clear,impact:s.impact.toArray()};groundStrikeStep(s.duration/2);frame(performance.now());return {...initial,height:s.visual.projectile.position.y,arc:!!s.visual.arc,remaining:s.left};});
  assert(shot.duration>0&&shot.physical>shot.duration&&shot.arc&&shot.remaining>0);await page.screenshot({path:path.join(ROOT,'.shots','ground-ballistic-flight.png')});
  const landed=await page.evaluate(()=>{const s=groundStrikes[0],point=s.impact.clone();groundStrikeStep(s.left);frame(performance.now());return !groundStrikes.length&&groundImpacts.some(s=>s.impact.distanceTo(point)<1e-6);});assert(landed);
  await page.evaluate(()=>{reset({op:'charybdis'});setSpeed(0);});assert.equal(await page.locator('.ground-range-label,.ground-strike-label').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({shot,landed,spaceClean:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
