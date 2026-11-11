/* Claude用: node tools/ground-supply-followup-shots.cjs。Chromiumで順次実行。 */
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {openGame,ROOT}=require('./browser.cjs'),{browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html'));
  await page.waitForFunction(()=>window.WOS&&window.WOS_MENU);
  await page.evaluate(()=>{
   WOS.start({op:'groundExercise2'});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();
   const truck=fleets.find(f=>f.team===0&&f.groundKind==='supply'),target=fleets.find(f=>f.team===0&&f.groundKind==='infantry');
   for(const f of fleets){groundClearOrders(f);if(!f.embarked)f.pos.copy(groundPoint(5+f.team*35,33));}
   truck.pos.copy(groundPoint(15.6,27));target.pos.copy(groundPoint(15,27));
   for(const f of [truck,target]){f.pos.y=groundUnitHeight(f);f.groundSupply=100;f.groundMorale=50;f.groundMoved=false;f.groundRest=5;}
   if(!groundSupplyCommand([truck],target))throw new Error('分配命令が失敗');
   groundSupplyAfter(1);
   if(!(truck.groundMorale>50&&target.groundMorale>50&&truck.groundMoraleGiving))throw new Error('自己回復・士気分配が失敗');
   select(truck);groundHud();camAnim=null;const p=groundPoint(15,27);controls.target.copy(p);camera.position.copy(p).add(new THREE.Vector3(0,40,20));camera.lookAt(p);controls.update();groundUpdateSight();groundDraw();
   for(const f of [truck,target])updateFleetLabel(f,false,'');
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(errors.length)throw new Error(errors.join('\n'));
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  await page.screenshot({path:path.join(ROOT,'.shots','ground-supply-followup.png')});
  if(errors.length)throw new Error(errors.join('\n'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
