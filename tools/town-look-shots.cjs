/* Capture the existing settlements and forest at 1600 × 900. */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{const {browser,page,errors}=await openGame({width:1600,height:900});try{
 fs.mkdirSync(path.join(ROOT,'test-results/town-look'),{recursive:true});
 await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS&&groundSites.length>0);
 for(const shot of [{op:'groundExercise2',kind:'town',id:'A',file:'exercise2-town.png'},{op:'baikonur',kind:'town',id:'A',file:'baikonur2-hq.png'},{op:'groundExercise2',kind:'forest',file:'forest.png'}]){
  await page.evaluate(opId=>{reset({op:opId});setSpeed(0);},shot.op);
  await page.evaluate(shot=>{let target;if(shot.kind==='town'){const s=groundData().sites.find(s=>s.id===shot.id);target=groundPoint(s.x,s.y);}else{const f=groundForests[Math.floor(groundForests.length/2)];target=new THREE.Vector3(f.x,0,f.z);target.y=groundElevation(f.x/GROUND_SCALE+groundDimensions().widthKm/2,groundDimensions().heightKm/2-f.z/GROUND_SCALE);}
   camAnim=null;controls.minDistance=1;controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(0,7,10));camera.lookAt(target);controls.update();
  },shot);
  await page.waitForTimeout(1000);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:path.join(ROOT,'test-results/town-look',shot.file)});
 }
 if(errors.length)throw new Error(errors.join('\n'));console.log('Saved three town and forest screenshots.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
