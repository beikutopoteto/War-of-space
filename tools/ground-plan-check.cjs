const {openGame,ROOT}=require('./browser.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS,{timeout:60000});
  await page.evaluate(()=>{
   window.requestAnimationFrame=()=>0;reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});if(talking)endTalk();endDeploy();setSpeed(0);
   setSel(fleets.filter(f=>f.team===0&&['infantry','vehicle','heavyInfantry'].includes(f.groundKind)&&!f.embarked));
   camAnim=null;const p=groundPoint(12,29);controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,75,50));camera.lookAt(p);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
  });
  async function line(button,coords){
   await page.click(button,{noWaitAfter:true});
   for(const [x,y] of coords){const p=await page.evaluate(([x,y])=>{const p=groundPoint(x,y);p.y=groundSurfaceHeight(p.x,p.z);return proj(p);},[x,y]);await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);}
   await page.evaluate(()=>frame(performance.now()));
  }
  await line('#groundDeploy',[[8,31],[17,31]]);
  const deploy=await page.evaluate(()=>orderTargets().map(f=>({name:f.name,move:f.order?.type==='move'})));
  assert.equal(deploy.length,3);assert(deploy.every(f=>f.move));
  await page.evaluate(()=>{for(const f of orderTargets()){for(let i=0;i<1000&&f.order;i++)if(groundFollow(f,.5)){dropArrow(f.arrow);f.arrow=null;f.order=null;}}frame(performance.now());});
  const formation=await page.evaluate(()=>orderTargets().map(f=>({x:f.pos.x,z:f.pos.z,done:!f.order})));
  assert(formation.every(f=>f.done));assert(Math.max(...formation.map(f=>f.z))-Math.min(...formation.map(f=>f.z))<.1);
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.shots','ground-deploy.png')});
  const before=await page.evaluate(()=>orderTargets().map(f=>[f.pos.x,f.pos.z]));
  await line('#groundPlan',[[8,28],[17,28]]);
  const planned=await page.evaluate(()=>({all:orderTargets().every(f=>f.groundPlan&&!f.order),positions:orderTargets().map(f=>[f.pos.x,f.pos.z]),enabled:!document.getElementById('groundExecute').disabled,preview:groundPlanVisual?.visible}));
  assert(planned.all&&planned.enabled&&planned.preview);assert.deepEqual(planned.positions,before);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-plan-ready.png')});
  await page.click('#groundExecute',{noWaitAfter:true});
  const executing=await page.evaluate(()=>{const valid=orderTargets().every(f=>f.order?.type==='move'&&!f.groundPlan);for(const f of orderTargets())groundFollow(f,1);frame(performance.now());return valid;});assert(executing);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-plan-execute.png')});
  const stances=await page.evaluate(()=>orderTargets().map(f=>f.stance));
  await page.click('#groundHold',{noWaitAfter:true});
  assert(await page.evaluate(()=>orderTargets().every(f=>!f.order&&!f.groundPlan&&f.stance==='engage'&&f.post.equals(f.pos))));
  await page.keyboard.press('Control+z');
  assert(await page.evaluate(expected=>orderTargets().every((f,i)=>f.order?.type==='move'&&f.stance===expected[i]),stances));
  const icons=await page.evaluate(require('../tests/command-icons.cjs').commandIconCases);assert(icons.identical&&icons.shared);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({deploy,formation,planned,executing,hold:true,iconsUnchanged:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
