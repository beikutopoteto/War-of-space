/* Approved town plans in the real game, 1600 × 900, oblique close views. */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{const {browser,page,errors}=await openGame({width:1600,height:900});try{
 const out=path.join(ROOT,'test-results/town-plan');fs.mkdirSync(out,{recursive:true});
 for(const shot of [{op:'baikonur',id:'A',file:'baikonur2-A.png'},{op:'baikonur',id:'B',file:'baikonur2-B.png'},{op:'baikonur',id:'H',file:'baikonur2-H.png'},{op:'baikonur',id:'G',file:'baikonur2-G.png'},{op:'groundExercise2',id:'B',file:'exercise2-B.png'}]){
  await page.evaluate(shot=>{
   WOS.start({op:shot.op,tutorial:false});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();select(null);
   const s=groundData().sites.find(s=>s.id===shot.id),target=groundPoint(s.x,s.y);
   camAnim=null;controls.enableDamping=false;controls.minDistance=1;controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(0,7,10));camera.lookAt(target);controls.update();
   groundUpdateSight();groundDraw();groundFogDraw(true);
   // Terrain review: reveal the target with a real friendly scout so fog cannot hide neutral towns.
   const scout=fleets.find(f=>f.team===0&&f.groundKind==='scout');if(scout){scout.pos.copy(target);groundUpdateSight();groundDraw();groundFogDraw(true);}
  },shot);
  await page.waitForTimeout(1000);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:path.join(out,shot.file)});
 }
 if(errors.length)throw new Error(errors.join('\n'));console.log('Saved five town screenshots (1600 × 900), no page exceptions.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
