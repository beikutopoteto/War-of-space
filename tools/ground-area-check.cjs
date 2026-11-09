const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS,{timeout:60000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});if(talking)endTalk();endDeploy();setSpeed(0);select(fleets.find(f=>f.team===0&&f.groundKind==='artillery'));camAnim=null;const p=groundPoint(15,21);controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,60,45));camera.lookAt(p);controls.update();camera.updateMatrixWorld(true);frame(performance.now());});
  async function point(x,y,click=true,shift=false){const p=await page.evaluate(([x,y])=>{const p=groundPoint(x,y);p.y=groundSurfaceHeight(p.x,p.z);return proj(p);},[x,y]);await page.mouse.move(p.x,p.y);if(click){if(shift)await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);if(shift)await page.keyboard.up('Shift');}await page.evaluate(()=>frame(performance.now()));}
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  await page.fill('#groundSalvoCount','3');await page.locator('#groundSalvoCount').blur();await page.click('#groundStrike',{noWaitAfter:true});await point(16,21);await point(16.7,21,false);
  assert.equal(await page.evaluate(()=>groundStrikes.length),0);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-area-circle.png')});
  await point(16.7,21);const circle=await page.evaluate(()=>({shots:groundStrikes.length,left:selected.groundAreaSalvo?.remaining,radius:groundStrikes[0]?.radius}));assert.equal(circle.shots,1);assert.equal(circle.left,2);
  await page.evaluate(()=>{for(let i=0;i<200;i++)groundStrikeStep(.1);frame(performance.now());});assert.equal(await page.evaluate(()=>!!selected.groundAreaSalvo),false);
  await page.evaluate(()=>{const op0=OPS.find(o=>o.id==='baikonur'),gun=op0.quick.find(f=>f.groundKind==='artillery'),list=op0.quick.map(f=>f.groundKind==='scout'?{...gun,name:'第11 自走砲中隊',pos:[gun.pos[0]+4,gun.pos[1]]}:f);reset({op:'baikonur',fleets:list});if(talking)endTalk();endDeploy();setSpeed(0);setSel(fleets.filter(f=>f.team===0&&f.groundKind==='artillery'));camAnim=null;const p=groundPoint(16,21);controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,65,46));camera.lookAt(p);controls.update();camera.updateMatrixWorld(true);frame(performance.now());});
  await page.fill('#groundSalvoCount','5');await page.locator('#groundSalvoCount').blur();await page.click('#groundStrike',{noWaitAfter:true});await point(15,21);await point(17,20,true,true);await point(19,21);await point(17,21.2,false);
  const curve=await page.evaluate(()=>({stage:groundAreaAim?.stage,points:groundAreaAim?.points.length,length:groundAreaAim?.preview.length,limit:groundAreaLimits(groundAreaUnits()).length}));assert.equal(curve.stage,'width');assert.equal(curve.points,3);assert(curve.length<=curve.limit);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-area-curve.png')});
  await point(17,21.2);assert(await page.evaluate(()=>orderTargets().every(f=>f.groundAreaSalvo?.remaining===4)));
  await page.screenshot({path:path.join(ROOT,'.shots','ground-area-firing.png')});
  await page.click('#groundHold',{noWaitAfter:true});assert(await page.evaluate(()=>orderTargets().every(f=>!f.groundAreaSalvo)));
  await page.keyboard.press('Control+z');assert(await page.evaluate(()=>orderTargets().every(f=>f.groundAreaSalvo?.remaining===4)));
  await page.keyboard.press('Control+z');assert(await page.evaluate(()=>orderTargets().every(f=>!f.groundAreaSalvo)));
  await page.evaluate(()=>{select(fleets.find(f=>f.team===0&&f.groundKind==='sea'));groundStrikeToggle();});assert.equal(await page.evaluate(()=>groundAreaAim?.type),'line');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({circle,curve,stop:true,shipDefaultLine:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
