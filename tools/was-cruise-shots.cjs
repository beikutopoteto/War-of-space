/* #496 の見本。node tools/was-cruise-shots.cjs */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');

async function main(){
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  try{
    await page.evaluate(()=>{
      WOS.start({op:'groundExercise2',fleets:[{name:'第6 陸戦型 W.A.S. 試験隊',kind:'was',at:[12,26.4],platoons:1}]});
      if(talking)endTalk();
      if(deploying)endDeploy();
      setSpeed(0);
      const f=window.shotWas=fleets.find(unit=>unit.team===0&&unit.groundKind==='was');
      for(const unit of fleets)if(unit!==f)unit.alive=false;
      f.pos.copy(groundPoint(12,26.4));f.heading.set(0,0,1);f.groundTrack=null;
      f.stance='evade';f.groundDeployed=true;
      select(f);
      window.wasShotDraw=(offset,close=true)=>{
        camAnim=null;controls.minDistance=close?1:GROUND_MIN_VIEW;
        controls.target.copy(f.pos).add(new THREE.Vector3(0,.35,0));
        camera.position.copy(controls.target).add(new THREE.Vector3(...offset));
        camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);
        groundFogDraw(true);groundDraw();
      };
      window.wasShotTick=seconds=>{
        const end=gameSec+seconds;
        while(gameSec<end-1e-8){
          const dt=Math.min(.05,end-gameSec);
          gameSec+=dt;groundStep(dt);
        }
        groundDraw();
      };
      // 通常の最短ズーム。以後の側面見本はモデルの輪郭が見える距離。
      wasShotDraw([6,3.4,3.3],false);
    });
    const shot=async(name,pose)=>{
      await page.evaluate(pose=>{
        return new Promise((resolve,reject)=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
          const model=shotWas.groundModel.userData;
          if(model.pose.stand.some(b=>!b.position.toArray().every(Number.isFinite)))reject(Error('画面上の機体の位置が無効'));
          else if(pose&&model.pose.stand[0].geometry!==model.special.get(pose))reject(Error('姿勢が切り替わっていない '+pose));
          else resolve();
        })));
      },pose);
      await page.screenshot({path:path.join(out,`was-cruise-${name}.png`),timeout:120000});
      assert.deepEqual(errors,[],'ページ例外');
    };
    const button=name=>page.getByRole('button',{name,exact:true});
    await shot('00-overview');
    await page.evaluate(()=>wasShotDraw([2.7,1.15,1.3]));
    await shot('01-walking');
    await button('飛行').click();
    await shot('02-takeoff','wasFlyUp');
    await page.evaluate(()=>wasShotTick(1.2));
    await shot('03-takeoff','wasFlyUp');
    await page.evaluate(()=>wasShotTick(1.3));
    await shot('04-cruise','wasFly');
    await page.evaluate(()=>{
      order(shotWas,{type:'move',dest:shotWas.pos.clone().add(new THREE.Vector3(0,0,3))});
      wasShotTick(.4);wasShotDraw([2.7,1.15,1.3]);
    });
    await shot('05-cruise-moving','wasFlyMarch');
    await page.evaluate(()=>{groundClearOrders(shotWas);wasShotTick(.5);});
    const altitude=page.locator('#groundCommand');
    await altitude.getByRole('button',{name:'低',exact:true}).click();
    await page.evaluate(()=>{wasShotTick(5);wasShotDraw([2.7,1.15,1.3]);});
    await shot('06-low','wasFly');
    await button('着陸').click();
    await page.evaluate(()=>{wasShotTick(4.98);wasShotDraw([2.7,1.15,1.3]);});
    await shot('07-descending','wasFlyDown');
    await page.evaluate(()=>wasShotTick(1));
    await shot('08-landing','wasFlyDown');
    await page.evaluate(()=>wasShotTick(1.1));
    await shot('09-landed');
    console.log('.shots/was-cruise-*.png 10 枚（1600×900）');
  }finally{await browser.close();}
}

main().catch(error=>{console.error(error);process.exitCode=1;});
