/* #448 shooting script: real 1600x900 frames, page exceptions fail the command. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openGame,ROOT}=require('./browser.cjs');
const {fixture}=require('./ground-weapons-measure.cjs');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.evaluate('window.assertMeasure=(ok,message)=>{if(!ok)throw Error(message);};');await page.evaluate('window.fixture='+fixture.toString());await page.evaluate(fixture);
  const rocket=await page.evaluate(()=>{
   const units=Array.from({length:4},(_,i)=>measureUnit('guidedRocket',0,-60,i*4-6)),p=new THREE.Vector3(20,0,0);
   for(const f of units)groundVolleyStart(f,{point:p});
   for(let i=0;i<56;i++){gameSec+=.05;groundStrikeStep(.05);}
   select(units[0]);camAnim=null;controls.target.set(-20,0,0);camera.position.set(-20,65,50);camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);
   groundDraw();frame(performance.now());frame(performance.now());
   return {shots:groundStrikes.length,arcs:groundStrikes.filter(s=>s.visual?.arc).length,labels:document.querySelectorAll('.ground-strike-label:not([hidden])').length};
  });
  assert.deepEqual(rocket,{shots:144,arcs:12,labels:4});
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.shots/ground-weapons-rockets.png')});
  const bomb=await page.evaluate(()=>{
   measureClear();const f=measureUnit('supportAircraft',0,-60,0),p=new THREE.Vector3(0,0,0),all=[],launch=groundStrikeLaunch;
   groundStrikeLaunch=(...args)=>{const s=launch(...args);if(s)all.push(s);return s;};
   try{
    groundBombPrepare(f,{point:p});for(let i=0;i<4000&&(f.groundBombRun||f.groundVolley);i++){gameSec+=.05;groundBombApproach(f,.05);groundBombStep();groundStrikeStep(.05);}
    select(f);camAnim=null;controls.target.set(-5,0,0);camera.position.set(-5,24,18);camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);
    groundDraw();frame(performance.now());frame(performance.now());
    return {shots:all.length,aims:all.map(s=>s.aim.x),spread:all.map(s=>s.spread)};
   }finally{groundStrikeLaunch=launch;}
  });
  assert.equal(bomb.shots,6);assert(bomb.spread.every(n=>n===0));
  await page.screenshot({path:path.join(ROOT,'.shots/ground-weapons-bombs.png')});
  assert.equal(errors.length,0,errors.join('\n'));console.log('| 写真 | ロケット144発・弾道12本・札4つ / 爆弾6発 / 1600×900 / ページ例外0 |');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
