const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
  await page.waitForFunction(()=>window.WOS&&typeof groundSupplyNet!=='undefined',{timeout:60000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});if(talking)endTalk();endDeploy();setSpeed(0);});
  const site=await page.evaluate(()=>{
   const f=fleets.find(f=>f.team===0&&f.groundKind==='infantry'),s=groundSites.find(s=>s.id==='A')||groundSites.find(s=>s.owner===null);
   f.pos.copy(s.pos);f.pos.y=groundUnitHeight(f);s.owner=null;s.progress=[0,0];groundCaptureStep(12);select(f);
   camAnim=null;controls.target.copy(f.pos);camera.position.copy(f.pos).add(new THREE.Vector3(0,48,37));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
   return {text:s.el.textContent,range:groundRanges.get(f)?.el.textContent,lines:groundRanges.size};
  });
  assert(site.text.includes('あと18秒'));assert(site.range.includes('直接射撃'));
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  await page.screenshot({path:path.join(ROOT,'.shots','ground-range-site.png')});
  const road=await page.evaluate(()=>{
   const f=fleets.find(f=>f.team===0&&f.groundKind==='vehicle');
   const edges=groundSupplyNet.edges.filter(e=>!e.circle&&e.x>10&&e.x<20&&e.y>25&&e.y<33);const e=edges.sort((a,b)=>Math.abs(a.x-13)-Math.abs(b.x-13))[0];
   if(!e)throw Error('道路の区間がない');
   f.pos.copy(groundPoint(e.x,e.y));f.pos.y=groundUnitHeight(f);e.owner=null;e.progress=[0,0];select(f);groundSupplyRoadCapture(2);
   controls.target.copy(f.pos);camera.position.copy(f.pos).add(new THREE.Vector3(0,60,45));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
   return {text:groundRoadLabels.filter(el=>!el.hidden).map(el=>el.textContent),progress:e.progress.slice(),owner:e.owner};
  });
  assert(road.text.some(s=>s.includes('あと3秒')));assert.equal(road.owner,null);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-range-road.png')});
  const contest=await page.evaluate(()=>{
   const f=selected,e=groundRoadAt(f.pos.x/GROUND_SCALE+24,18-f.pos.z/GROUND_SCALE),enemy=fleets.find(f=>f.team===1&&f.groundKind==='infantry');
   enemy.pos.copy(f.pos);groundSupplyRoadCapture(1);frame(performance.now());
   return {text:groundRoadLabels.filter(el=>!el.hidden).map(el=>el.textContent),progress:e.progress[0]};
  });
  assert(contest.text.some(s=>s.includes('競合中')));assert.equal(contest.progress,2);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-range-contested.png')});
  await page.evaluate(()=>{reset({op:'charybdis'});setSpeed(0);});
  assert.equal(await page.locator('.ground-range-label,.ground-road-label').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({site,road,contest,spaceClean:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
