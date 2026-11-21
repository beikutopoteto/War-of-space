/* node tools/ground-plan-check.cjs: 前線の操作と到着を確かめ、.shots/ に保存する。 */
const {openGame,ROOT}=require('./browser.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

function shotSetup(mobile){
 WOS.start({op:'groundExercise2',fleets:[
  {name:'第1強化歩兵中隊',kind:'infantry',at:[8.6,27],stance:'evade'},
  {name:'第2強化歩兵中隊',kind:'infantry',at:[10,27],stance:'evade'},
  {name:'戦車中隊',kind:'vehicle',at:[11.6,27],stance:'evade'},
  {name:'重強化歩兵中隊',kind:'heavyInfantry',at:[13.1,27],stance:'evade'}
 ]});
 if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);
 for(const f of fleets)if(f.team!==0||f.groundKind==='sea'||f.embarked)f.alive=false;
 hideHint();
 setSel(fleets.filter(f=>f.team===0&&f.alive));
 groundUpdateSight();
 camAnim=null;
 const center=groundPoint(11,29.5);
 controls.target.copy(center);
 camera.position.copy(center).add(mobile?new THREE.Vector3(0,63,36):new THREE.Vector3(0,48,29));
 camera.lookAt(center);controls.update();camera.updateMatrixWorld(true);
}
function shotTick(until,limit=120){
 for(let n=0;!until()&&n<limit*10;n++){gameSec+=.1;groundStep(.1);}
 if(!until())throw Error('撮影条件まで進まない');
}
const drawFrame=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const frontReady=()=>groundFronts.length===1&&groundFronts[0].members.length===4&&groundFronts[0].members.every(f=>!f.order&&f.groundDeployed);

async function main(){
 fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
 const {browser,page,errors}=await openGame({width:1100,height:760});
 try{
  const functions=`window.shotSetup=${shotSetup};window.shotTick=${shotTick};window.frontReady=${frontReady};`;
  await page.evaluate(functions);
  await page.evaluate(()=>shotSetup(false));await drawFrame(page);
  async function point([x,y]){
   return page.evaluate(([x,y])=>{const p=groundPoint(x,y);p.y=groundSurfaceHeight(p.x,p.z);return proj(p);},[x,y]);
  }
  async function tap(coords){
   const {x,y}=await point(coords);
   await page.mouse.click(x,y);
  }
  async function shot(page,name){
   await page.waitForTimeout(260);
   await drawFrame(page);
   assert.deepEqual(errors,[],'ページ例外');
   const file=path.join(ROOT,'.shots','ground-front-'+name+'.png');
   await page.screenshot({path:file,timeout:120000});
   assert.deepEqual(errors,[],'ページ例外');
   console.log(file);
  }

  await page.click('#groundDeploy');
  const start=await point([8,29]);
  await page.mouse.move(start.x,start.y);
  await page.mouse.down({button:'right'});
  await page.waitForFunction(()=>groundPlanPress?.drawing);
  for(const coords of [[9,29.2],[10.3,29.55],[11.6,29.6],[12.9,29.3],[14,29]]){
   const {x,y}=await point(coords);
   await page.mouse.move(x,y,{steps:5});
  }
  await page.mouse.up({button:'right'});
  assert(await page.evaluate(()=>groundLinePts?.length>2&&groundWorkAiming==='deploy'),'実際の長押しで曲線を引き前の側を待つ');
  await tap([11,31]);await page.evaluate(()=>shotTick(frontReady));
  await shot(page,'01-hold');

  await page.click('#groundPlan');await tap([8,32.5]);await tap([14,32.5]);
  assert(await page.evaluate(()=>groundFronts[0].plan&&frontReady()));
  await page.click('#groundExecute');
  const progress=await page.evaluate(()=>{
   const front=groundFronts[0];
   shotTick(()=>front.advance?.t>.34);
   return {t:front.advance.t,curvePoints:front.pts.length,
    stop:document.getElementById('groundExecute').getAttribute('aria-label')==='停止'&&document.getElementById('groundExecute').title.includes('停止')};
  });
  assert(progress.stop);
  await shot(page,'02-advance');

  const departure=await page.evaluate(()=>{
   const front=groundFronts[0],f=front.members[1];
   const group=f.order?.groundAdvance;select(f);
   if(!group||f.order?.groundAdvance!==group)throw Error('選び直して進撃が途切れた');
   groupOrder({type:'move',dest:groundPoint(10,26)});
   shotTick(()=>f.groundFrontAway&&front.slots.length===3);
   shotTick(()=>f.pos.z>groundPoint(10,28).z);
   return {members:front.members.length,slots:front.slots.map(s=>s.fraction)};
  });
  assert.deepEqual(departure,{members:4,slots:[1/6,3/6,5/6]});
  await shot(page,'03-departure');

  const arrival=await page.evaluate(()=>{
   const front=groundFronts[0],target=front.plan.pts;
   const f=front.members[1];
   shotTick(()=>!front.advance&&!f.groundFrontAway&&frontReady());
   setSel(front.members);
   return {arrived:front.pts===target&&!front.plan&&front.members.every(f=>f.groundDeployed),
    execute:document.getElementById('groundExecute').getAttribute('aria-label')==='実行'};
  });
  assert(arrival.arrived&&arrival.execute);
  await shot(page,'04-arrived');

  const mobile=await browser.newPage({viewport:{width:390,height:780},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  mobile.on('pageerror',e=>errors.push(e.message));
  const three=path.dirname(require.resolve('three/package.json'));
  await mobile.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/,r=>{
   const u=r.request().url(),rel=u.includes('cdnjs')?'build/three.min.js':u.split('three@0.128.0/')[1];
   return r.fulfill({path:path.join(three,rel),contentType:'application/javascript'});
  });
  await mobile.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({body:''}));
  await mobile.goto('file://'+path.join(ROOT,'index.html'));await mobile.waitForFunction(()=>window.WOS);
  await mobile.evaluate(functions);
  await mobile.evaluate(()=>{
   shotSetup(true);
   groundPlanToggle('deploy');
   for(const q of [[8,29],[14,29],[11,31]])groundPlanTap(groundPoint(...q));
   shotTick(frontReady);
   groundPlanToggle('plan');groundPlanTap(groundPoint(8,32.5));groundPlanTap(groundPoint(14,32.5));groundPlanTap(groundPoint(11,33.5));groundPlanExecute();
   shotTick(()=>groundFronts[0].advance?.t>.4);
  });
  await shot(mobile,'05-mobile');
  console.log(JSON.stringify({progress,departure,arrival,pageErrors:errors.length}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
