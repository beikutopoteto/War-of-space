/* Issue #445: 1600x900. A tank platoon after one loss, at rest and after movement,
   and two infantry platoons exchanging body-local fire. Page exceptions fail. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');
const {bodyScene}=require('../tests/ground-bodies.cjs');
function bodyShotFrame(){
 camAnim=null;controls.minDistance=3;groundDraw();scene.updateMatrixWorld(true);
 const box=new THREE.Box3();for(const f of fleets)if(f.alive&&!f.embarked)box.union(new THREE.Box3().setFromObject(f.groundModel));
 const target=box.getCenter(new THREE.Vector3()),dir=new THREE.Vector3(.3,1,1.25).normalize();
 const right=new THREE.Vector3().crossVectors(camera.up,dir).normalize(),up=new THREE.Vector3().crossVectors(dir,right);
 const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;let dist=selected?.groundKind==='infantry'?9:12;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(dir);dist=Math.max(dist,Math.abs(p.dot(right))/(tanX*.57)+depth,Math.abs(p.dot(up))/(tanY*.55)+depth);}
 controls.target.copy(target);camera.position.copy(target).addScaledVector(dir,dist);camera.lookAt(target);controls.update();camera.updateMatrixWorld(true);groundDraw();groundFogDraw(true);scene.updateMatrixWorld(true);
}
async function main(){
 const dir=path.join(ROOT,'test-results/ground-bodies');fs.mkdirSync(dir,{recursive:true});
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.evaluate('window.bodyScene='+bodyScene.toString());await page.evaluate('window.bodyShotFrame='+bodyShotFrame.toString());
  async function shot(name){
   await page.evaluate(()=>{bodyShotFrame();stepParticles(2);frame(performance.now());});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const file=path.join(dir,name+'.png');await page.screenshot({path:file,timeout:120000});assert.deepEqual(errors,[],'ページ例外');console.log(file);
  }
  await page.evaluate(()=>{WOS.start({op:'groundExercise2'});bodyScene();const f=selected;groundBodyHit(f,f.bodies[1],f.bodies[1].hp);for(let i=0;i<30;i++){gameSec+=.05;groundDraw();}updateRoster();updateFleetLabel(f,false,'');if(groundAliveBodies(f)!==3||f.groundModel.userData.formation.bodies[1].visible)throw Error('停止中の撃破体が残っている');});
  await shot('tank-stopped');
  await page.evaluate(()=>{const f=selected,before=f.pos.clone();order(f,{type:'move',dest:f.pos.clone().add(new THREE.Vector3(0,0,8))});for(let i=0;i<25;i++){gameSec+=.05;groundStep(.05);groundDraw();}if(f.pos.distanceTo(before)<=0)throw Error('移動していない');document.getElementById('groundHold').click();for(let i=0;i<40;i++){gameSec+=.05;groundStep(.05);groundDraw();}if(f.groundModel.userData.formation.bodies[1].visible)throw Error('移動後の撃破体が復活した');});
  await shot('tank-after-move');
  await page.evaluate(()=>{
   bodyScene('infantry',true);const pair=fleets.filter(f=>f.alive);for(const f of pair)f.dmg=.001;
   let captured=false;
   for(let i=0;i<80;i++){
    gameSec+=.05;groundStep(.05);stepTracers(.05);groundDraw();
    const active=tracers.filter(t=>t&&t.t<t.dur);
    if(pair.every(f=>f.fireTarget&&active.some(t=>f.bodies.some((b,j)=>groundBodyShotPosition(f,groundBodyPosition(f,j)).equals(t.a))))&&active.length>=3){captured=true;break;}
   }
   if(!captured)throw Error('両小隊の体からの撃ち合いがない');
  });
  await shot('infantry-exchange');
 }finally{await browser.close();}
}
module.exports={main,bodyShotFrame};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
