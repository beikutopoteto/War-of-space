/* #495 の固定撮影。node tools/ground-visuals-shots.cjs
   1600×900。各コマは実際の射撃・姿勢を止めたゲーム画面。 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');

function shotScene({kind,enemy='vehicle',band='ground',ownAt=[9,27],enemyAt=[11,27]}){
  reset({op:'groundExercise2',fleets:[{name:'撮影小隊',kind,at:ownAt,platoons:1}]});
  if(talking)endTalk();
  if(deploying)endDeploy();
  setSpeed(0);
  for(const unit of fleets)if(unit.team===1)unit.alive=false;
  const f=window.shotSource=fleets.find(unit=>unit.alive);
  const t=window.shotTarget=makeFleet(1,groundUnitSpec({name:'標的小隊',kind:enemy,at:enemyAt,band,platoons:1}));
  fleets.push(t);
  groundInitUnit(t);
  f.pos.copy(groundPoint(...ownAt));
  f.groundTrack=null;
  f.groundDeployed=true;
  f.heading.set(0,0,1);
  f.stance='engage';
  f.dmg=.001;
  t.stance='evade';
  f.groundVisible=t.groundVisible=[true,true];
  revealMode=true;
  select(null);
  groundDraw();
}
function shotCamera(at,offset){
  camAnim=null;
  controls.minDistance=1;
  controls.target.copy(at);
  camera.position.copy(at).add(new THREE.Vector3(...offset));
  camera.lookAt(at);
  controls.update();
  camera.updateMatrixWorld(true);
  groundFogDraw(true);
}

async function main(){
  const output=path.join(ROOT,'.shots');
  fs.mkdirSync(output,{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  try{
    await page.evaluate(()=>WOS.start({op:'groundExercise2'}));
    for(const fn of [shotScene,shotCamera])await page.evaluate('window.'+fn.name+'='+fn.toString());
    const shot=async name=>{
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(output,'ground-visuals-'+name+'.png'),timeout:120000});
      assert.deepEqual(errors,[],'ページ例外');
    };
    await page.evaluate(()=>{
      shotScene({kind:'vehicle',ownAt:[12,26.4],enemyAt:[13.4,26.4]});
      const f=shotSource,t=shotTarget;
      const p=groundBodyPosition(f,0),target=groundBodyTarget(f,0,t,groundTargetRange(f,t));
      shotCamera(p.clone().lerp(target.pos,.5),[.5,3.7,6.2]);
      f.bodies.forEach((b,i)=>b.shotT=i?1:0);
      groundBodyFire(f,t,0);groundDraw();
      if(!f.bodies[0].look)throw Error('車両が発射しなかった');
      window.shotTime=gameSec;
    });
    for(let i=0;i<8;i++){
      await page.evaluate(t=>{gameSec=shotTime+t;groundDraw();},i*.07);
      await shot('direct-'+String(i).padStart(2,'0'));
    }
    await page.evaluate(()=>{
      const p=groundBodyPosition(shotSource,0);
      shotCamera(p.clone().add(new THREE.Vector3(.25,.26,0)),[1.2,1.25,2.35]);
      groundDraw();
    });
    await shot('tank-muzzle');
    await page.evaluate(()=>{
      shotScene({kind:'artillery',enemy:'infantry',ownAt:[12,26.4],enemyAt:[14.7,26.4]});
      const f=shotSource,t=shotTarget,s=groundStrikeLaunch(f,t.pos,t.pos);
      if(!s)throw Error('自走砲が発射しなかった');
      shotCamera(groundBodyPosition(f,0).add(new THREE.Vector3(.4,.35,0)),[2.2,1.8,3.4]);
      window.shotShell=s;
      groundDraw();
    });
    await shot('artillery');
    await page.evaluate(()=>{
      const s=shotShell;
      shotCamera(s.impact.clone(),[1.7,2.45,3.3]);
      groundStrikeStep(s.left);groundDraw();
      if(!groundFxQueues.blast.some(e=>e.fx))throw Error('着弾の効果がない');
      window.shotTime=gameSec;
    });
    for(let i=0;i<12;i++){
      await page.evaluate(t=>{gameSec=shotTime+t;groundDraw();},i*.095);
      await shot('blast-'+String(i).padStart(2,'0'));
    }
    await page.evaluate(()=>{gameSec=shotTime+1.65;groundDraw();});
    await shot('artillery-smoke');
    await page.evaluate(()=>{
      shotScene({kind:'was',enemy:'fighter',band:'low'});
      const f=shotSource,t=shotTarget;
      f.band='low';f.pos.y=groundUnitHeight(f);
      groundDraw();
      shotCamera(f.pos.clone().add(new THREE.Vector3(.35,.62,0)),[-2.4,1.35,-3.7]);
      f.bodies.forEach((b,i)=>b.aaT=i?1:0);
      groundBodyFire(f,t,0,true);groundDraw();
      if(f.groundModel.userData.pose.stand[0].geometry!==f.groundModel.userData.special.get('wasFlyFire'))throw Error('W.A.S. の空中射撃姿勢がない');
    });
    await shot('was-air-fire');
    for(const guard of [false,true]){
      await page.evaluate(guard=>{
        const f=shotSource;gameSec+=2;
        order(f,{type:'move',dest:f.pos.clone().add(new THREE.Vector3(3,0,0)),groundAdvance:guard});
        f.pos.x+=.06;
        shotCamera(f.pos.clone().add(new THREE.Vector3(0,.5,0)),[1.95,1.05,2.85]);
        groundDraw();
        if(f.groundModel.userData.pose.stand[0].geometry!==f.groundModel.userData.special.get(guard?'wasFlyMove':'wasFlyMarch'))throw Error('W.A.S. の飛行姿勢がない');
      },guard);
      await shot(guard?'was-advance':'was-move');
    }
    await page.evaluate(()=>{
      shotScene({kind:'heavyInfantry',ownAt:[12,26.4],enemyAt:[13.4,26.4]});
      const f=shotSource,t=shotTarget;
      shotCamera(groundBodyPosition(f,0).add(new THREE.Vector3(.25,.37,0)),[1.3,.78,1.6]);
      f.bodies.forEach((b,i)=>b.shotT=i?1:0);
      groundBodyFire(f,t,0);groundDraw();
      if(f.groundModel.userData.pose.stand[0].geometry!==f.groundModel.userData.special.get('hinfMsl'))throw Error('重強化歩兵のミサイル姿勢がない');
    });
    await shot('heavy-missile');
    console.log('.shots/ground-visuals-*.png 27 枚（1600×900）');
  }finally{await browser.close();}
}

main().catch(error=>{console.error(error);process.exitCode=1;});
