/* Claude用: node tools/ground-tempo-shots.cjs。1600×900、ページ例外は失敗。
   実行後 .shots/ground-tempo-auto-{off,on}.png をレビューする。 */
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {openGame,ROOT}=require('./browser.cjs'),{browser,page,errors}=await openGame({width:1600,height:900});
 const fail=()=>{if(errors.length)throw new Error(errors.join('\n'));};
 try{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  await page.goto('file://'+path.join(ROOT,'index.html'));
  await page.waitForFunction(()=>window.WOS&&window.WOS_MENU);
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('wos.debug')||'{}');d.battle=true;d.auto=false;localStorage.setItem('wos.debug',JSON.stringify(d));});await page.reload();
  await page.evaluate(()=>{WOS.start({op:'baikonur'});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();if(autoMode){autoMode=false;WOS_MENU.setAuto(false);}camAnim=null;const p=groundPoint(27,49);controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,90,50));camera.lookAt(p);controls.update();groundUpdateSight();groundDraw();});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));fail();
  await page.keyboard.press('Escape');
  for(const state of ['off','on']){
   if(state==='on')await page.click('#pause [data-pm="auto"]');
   fail();await page.screenshot({path:path.join(ROOT,'.shots',`ground-tempo-auto-${state}.png`)});fail();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
