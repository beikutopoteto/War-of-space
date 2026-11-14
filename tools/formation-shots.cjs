/* node tools/formation-shots.cjs: exercise2 terrain, four ground states, flight4 and combat, mobile. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openGame,ROOT}=require('./browser.cjs');
const {formationScene,formationTick}=require('../tests/ground-formations.cjs');
function shotFrame(){
 const visible=fleets.filter(f=>f.alive&&f.team===0&&!f.embarked);
 camAnim=null;const box=new THREE.Box3();
 for(const f of visible)box.union(new THREE.Box3().setFromObject(f.groundModel));
 const target=box.getCenter(new THREE.Vector3()),direction=new THREE.Vector3(.2,1,1.1).normalize();
 const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
 const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;let dist=12;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
  const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(direction);
  dist=Math.max(dist,Math.abs(p.dot(right))/(tanX*.6)+depth,Math.abs(p.dot(up))/(tanY*.55)+depth);
 }
 controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,dist);camera.lookAt(target);controls.update();camera.updateMatrixWorld(true);
 groundDraw();groundFogDraw(true);scene.updateMatrixWorld(true);
}
async function main(){
 fs.mkdirSync(path.join(ROOT,'test-results'),{recursive:true});
 const {browser,page,errors}=await openGame({width:1600,height:900});
 const mobileOnly=process.argv.includes('--mobile-only');
 try{
  await page.evaluate(`window.formationScene=${formationScene};window.formationTick=${formationTick};window.shotFrame=${shotFrame}`);
  async function shot(p,name){
   await p.evaluate(()=>{if(menuOpen||!document.getElementById('menu').hidden)throw Error('メニューが開いたまま');shotFrame();frame(performance.now());});
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const file=path.join(ROOT,'test-results','formations-'+name+'.png');await p.screenshot({path:file,timeout:120000});console.log(file);
   assert.deepEqual(errors,[],'ページ例外');
  }
  if(!mobileOnly){
  await page.evaluate(()=>{WOS.start({op:'groundExercise2'});formationScene();formationTick(2);});await shot(page,'idle');
  await page.evaluate(()=>{document.getElementById('groundHold').click();formationTick(2);});await shot(page,'defend');
  await page.evaluate(()=>{
   groundPlanToggle('plan');groundPlanTap(groundPoint(8,32));groundPlanTap(groundPoint(14,32));groundPlanExecute();formationTick(1.2,true);
   if(!orderTargets().every(f=>groundFormationState(f)==='advance'))throw Error('侵攻になっていない');
  });await shot(page,'advance');
  await page.evaluate(()=>{
   for(const f of orderTargets())order(f,{type:'move',dest:f.pos.clone().add(new THREE.Vector3(0,0,-10))});formationTick(1.2,true);
   if(!orderTargets().every(f=>groundFormationState(f)==='move'))throw Error('移動になっていない');
  });await shot(page,'move');
  await page.evaluate(()=>{
   formationScene();for(const f of fleets)f.alive=false;
   for(const [i,kind] of ['fighter','attack'].entries()){
    const f=makeFleet(0,groundUnitSpec({name:kind==='fighter'?'戦闘機':'攻撃機',kind,at:[9+i*4,27]}));fleets.push(f);groundInitUnit(f);f.heading.set(0,0,1);
   }
   setSel(fleets.filter(f=>f.alive));formationTick(2);
  });await shot(page,'air-formation');
  await page.evaluate(()=>{
   const t=makeFleet(1,groundUnitSpec({name:'航空標的',kind:'fighter',at:[12,27]}));fleets.push(t);groundInitUnit(t);
   for(const f of fleets.filter(f=>f.alive&&f.team===0))order(f,{type:'attack',target:t});
  });
  for(let i=1;i<=3;i++){await page.evaluate(()=>formationTick(1));await shot(page,'air-combat-'+i);}
  }
  await page.close();
  const mobile=await browser.newPage({viewport:{width:390,height:780},deviceScaleFactor:3,isMobile:true});
  mobile.on('pageerror',e=>errors.push(e.message));
  const three=path.dirname(require.resolve('three/package.json'));
  await mobile.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/,r=>{const u=r.request().url(),rel=u.includes('cdnjs')?'build/three.min.js':u.split('three@0.128.0/')[1];return r.fulfill({path:path.join(three,rel),contentType:'application/javascript'});});
  await mobile.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({body:''}));
  await mobile.goto('file://'+path.join(ROOT,'index.html'),{waitUntil:'domcontentloaded',timeout:60000});await mobile.waitForFunction(()=>window.WOS,{timeout:60000});
  await mobile.evaluate(`window.formationScene=${formationScene};window.formationTick=${formationTick};window.shotFrame=${shotFrame}`);
  await mobile.evaluate(()=>{WOS.start({op:'groundExercise2'});formationScene();for(const f of orderTargets())order(f,{type:'move',dest:f.pos.clone().add(new THREE.Vector3(0,0,-10))});formationTick(1.2,true);});
  await shot(mobile,'mobile');await mobile.close();
 }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={shotFrame};
