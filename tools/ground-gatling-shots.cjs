/* #504 の連射を実画面で撮る。node tools/ground-gatling-shots.cjs */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');

function gatlingScene({band,mobile}){
  const ownAt=[12,26.4],enemyAt=[12.65,26.4];
  reset({op:'groundExercise2',fleets:[{name:'撮影 W.A.S. 小隊',kind:'was',at:ownAt,band,platoons:1}]});
  if(talking)endTalk();
  if(deploying)endDeploy();
  setSpeed(0);
  for(const f of fleets)if(f.team===1)f.alive=false;
  const source=fleets.find(f=>f.alive),target=makeFleet(1,groundUnitSpec({name:'標的 強化歩兵小隊',kind:'infantry',at:enemyAt,platoons:1}));
  fleets.push(target);
  groundInitUnit(target);
  source.pos.copy(groundPoint(...ownAt));
  source.pos.y=groundUnitHeight(source);
  source.heading.set(0,0,1);
  source.groundTrack=null;
  source.groundDeployed=true;
  // 撮影の配置では、撃つ機体の銃口が僚機に隠れないようにする。
  for(const body of source.bodies.slice(1)){body.hp=0;body.alive=false;}
  groundBodySync(source);
  target.stance='evade';
  source.groundVisible=target.groundVisible=[true,true];
  revealMode=true;
  select(null);
  hideHint();
  if(mobile&&!document.body.classList.contains('noui'))toggleUi();
  if(!document.body.classList.contains('nolabels'))toggleLabels();
  groundDraw();

  const hit=groundBodyTarget(source,0,target,groundTargetRange(source,target));
  if(!hit)throw Error('撮影する W.A.S. の射線が通らない');
  const from=groundVisualBodyPoint(source,0,hit.from),to=groundVisualBodyPoint(target,hit.j,hit.pos);
  const at=from.lerp(to,.43).add(new THREE.Vector3(0,.45,0));
  camAnim=null;
  controls.minDistance=1;
  controls.target.copy(at);
  camera.position.copy(at).add(new THREE.Vector3(.25,1.55,mobile?5.1:3.85));
  camera.lookAt(at);
  controls.update();
  camera.updateMatrixWorld(true);
  groundFogDraw(true);

  source.bodies.forEach((b,i)=>b.shotT=i?1:0);
  groundBodyFire(source,target,0);
  if(!groundGatlingBursts.length)throw Error('撮影する連射が出なかった');
  gameSec+=.106;
  groundDraw();
  if(!groundFxQueues.direct.some(e=>e.life===GFX.gatling.fly&&e.fx))throw Error('撮影時に曳光弾がない');
}

async function shoot(frames,{width,height},scale){
  const {browser,page,errors}=await openGame({width,height},{gpu:process.platform==='darwin',uis:null,scale});
  try{
    await page.evaluate(()=>WOS.start({op:'groundExercise2'}));
    for(const [name,band] of frames){
      await page.evaluate(gatlingScene,{band,mobile:width===390});
      await page.locator('#hint').waitFor({state:'hidden'});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const output=path.join(ROOT,'test-results','ground-gatling-'+name+'.png');
      await page.screenshot({path:output,timeout:120000});
      assert.deepEqual(errors,[],'ページ例外');
      console.log(path.relative(ROOT,output));
    }
  }finally{await browser.close();}
}

async function main(){
  fs.mkdirSync(path.join(ROOT,'test-results'),{recursive:true});
  await shoot([['ground','ground'],['flight','cruise']],{width:1600,height:900},1);
  await shoot([['mobile','ground']],{width:390,height:780},3);
}

main().catch(error=>{console.error(error);process.exitCode=1;});
