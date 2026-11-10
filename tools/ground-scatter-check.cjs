/* 最小散布円を実演習で指定・撮影し、直径表示と実弾を確認。 */
const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});const cases=[];
 const check=(ok,name)=>{cases.push({ok:!!ok,name});if(!ok)console.error(name);};
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS);
  if(!process.env.SHOTS_ONLY){await require('../tests/ground-strike.cjs').checkGroundStrike(page,check);await require('../tests/ground-branches.cjs').checkGroundBranches(page,check);}
  console.log(JSON.stringify({targetedChecks:cases.length,failed:cases.filter(c=>!c.ok)}));
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});if(talking)endTalk();endDeploy();setSpeed(0);select(fleets.find(f=>f.team===0&&f.groundKind==='artillery'));camAnim=null;
   const p=selected.pos.clone().add(new THREE.Vector3(0,0,-40));p.y=groundSurfaceHeight(p.x,p.z);controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,8,6));camera.lookAt(p);controls.update();camera.updateMatrixWorld(true);frame(performance.now());});
  const point=await page.evaluate(()=>proj(controls.target));await page.click('#groundStrike',{noWaitAfter:true});await page.mouse.click(point.x,point.y);await page.mouse.move(point.x,point.y);await page.evaluate(()=>frame(performance.now()));
  const minimum=await page.evaluate(()=>({radius:groundAreaAim.preview.radius,diameterM:groundAreaAim.preview.radius/GROUND_SCALE*2000,text:groundAreaVisuals.get('aim')?.el.textContent,expected:groundScatterRadius(selected,groundAreaAim.points[0])/GROUND_SCALE*2000}));
  assert(minimum.diameterM>=25&&minimum.diameterM<25.2&&minimum.expected>24.9&&minimum.text.includes('散布直径25'));
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.shots','ground-scatter-minimum.png')});
  await page.mouse.click(point.x,point.y);
  const shot=await page.evaluate(()=>{const s=groundStrikes[0];return s&&{radius:s.area.radius,offset:Math.hypot(s.impact.x-s.aim.x,s.impact.z-s.aim.z),minimum:groundScatterRadius(s.source,s.aim),diameter:s.spread/GROUND_SCALE*2000};});assert(shot&&shot.offset<=shot.radius+1e-6&&shot.radius>=shot.minimum&&shot.diameter>=25);
  await page.evaluate(()=>{select(fleets.find(f=>f.team===0&&f.groundKind==='vehicle'));frame(performance.now());});assert.equal(await page.evaluate(()=>groundScatterRadius(selected,selected.pos)),0);
  assert.deepEqual(errors,[]);assert.equal(cases.filter(c=>!c.ok).length,0,JSON.stringify(cases.filter(c=>!c.ok)));
  console.log(JSON.stringify({minimum,shot,checks:cases.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
