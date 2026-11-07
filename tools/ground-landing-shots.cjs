/* 実行: node tools/ground-landing-shots.cjs（npm ci・Playwright Chromium 導入済みのMac）。
   1600×900、出力 .shots/⑨b-a.png ～ ⑨b-d.png。
   (a) 2中隊を載せて海岸へ航行 (b) 上陸5秒・50%ゲージ
   (c) 浜に降りた歩兵と戦車 (d) 上陸歩兵が既存拠点を占拠中。
   既存の地形・海上経路・上陸時計・陸上経路・占拠を実際に進める。
   カメラの変更後は描画を2回待つ。停止して step(.05) で進め、壁時計の速さには頼らない。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
const {setupLandingScene}=require('../tests/ground-landing.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
    await page.waitForFunction(()=>typeof groundVisuals!=='undefined'&&groundVisuals);
    await page.evaluate(setupLandingScene);
    const draw=async(x,y,dist)=>{
      await page.evaluate(({x,y,dist})=>{
        const at=groundPoint(x,y);camAnim=null;controls.target.copy(at);
        camera.position.copy(at).add(new THREE.Vector3(0,dist,dist*.4));camera.lookAt(at);controls.update();
        groundUpdateSight();groundDraw();groundFogDraw(true);updateGoal();
      },{x,y,dist});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    const shot=async letter=>page.screenshot({path:path.join(ROOT,'.shots',`⑨b-${letter}.png`)});
    // (a) 初期搭載を維持したまま、実際に海岸へ向かう。
    await page.evaluate(()=>{
      const c=selected;order(c,{type:'move',dest:groundPoint(12.2,7.4)});
      if(!c.order||groundPassengers(c).length!==2)throw new Error('2中隊を載せた海岸への経路がない');
      step(.5);groundDraw();updateFleetLabel(c,false,'');
      if(!c.order||!groundPassengers(c).every(f=>f.embarked===c&&f.pos.equals(c.pos)))throw new Error('搭載中隊が航行中の艦に追従していない');
    });await draw(12,7,65);await shot('a');
    // (b) 艦の実際の速度から航行の上限時間を求め、到着時に止める。
    await page.evaluate(()=>{
      const c=selected,limit=Math.ceil(c.order.path.L/c.speed+5)*20;
      for(let i=0;i<limit&&c.order;i++)step(.05);
      if(c.order||!groundCoastCells(c).length)throw new Error('海岸へ到着しなかった');
    });await page.click('#groundLand');
    await page.evaluate(()=>{
      for(let i=0;i<100;i++)step(.05);groundDraw();const c=selected,el=c.groundLandingVisual;
      if(!c.groundUnloading||Math.abs(parseFloat(el.querySelector('i').style.width)-50)>1e-6)throw new Error('上陸5秒・50%のゲージを確認できない');
    });await draw(12.2,8,58);await shot('b');
    // (c) 10秒で降り、名札が重ならない位置へ実移動で広がる。
    await page.evaluate(()=>{
      const c=selected,[inf,tank]=groundPassengers(c);
      for(let i=0;i<100;i++)step(.05);
      if(inf.embarked||tank.embarked||c.groundUnloading)throw new Error('10秒で上陸できていない');
      order(inf,{type:'move',dest:groundPoint(10.2,9.5)});order(tank,{type:'move',dest:groundPoint(15.2,9.5)});
      const limit=Math.ceil(Math.max(...[inf,tank].map(f=>f.order.path.cost*WOS_TERRAIN[op.ground].meta.cellKm*GROUND_SCALE/f.speed))+10)*20;
      for(let i=0;i<limit&&[inf,tank].some(f=>f.order);i++)step(.05);
      if([inf,tank].some(f=>f.order||!groundPass(f.pos.x/4+24,18-f.pos.z/4,groundMoveKind(f))))throw new Error('上陸した中隊が浜で広がれない');
      setSel([inf,tank]);groundDraw();
    });await draw(12.5,9,72);await shot('c');
    // (d) 上陸歩兵を、演習の既存拠点「西方集落」へ実際に歩かせる。
    const site=await page.evaluate(()=>{
      const inf=fleets.find(f=>f.groundFixed&&f.groundKind==='infantry'),s=groundSites.find(s=>s.id==='A');
      select(inf);order(inf,{type:'move',dest:s.pos});if(!inf.order)throw new Error('拠点への歩兵の経路がない');
      const limit=Math.ceil(inf.order.path.cost*WOS_TERRAIN[op.ground].meta.cellKm*GROUND_SCALE/inf.speed+15)*20;
      for(let i=0;i<limit&&inf.order;i++)step(.05);
      if(inf.order)throw new Error('歩兵が拠点へ到着しない');
      const seconds=Math.min(10,s.captureSec-s.progress[0]-.1);
      for(let i=0;i<Math.floor(seconds/.05);i++)step(.05);groundDraw();updateGoal();
      if(inf.embarked||s.owner===0||!(s.progress[0]>0&&s.progress[0]<s.captureSec))throw new Error('上陸歩兵の占拠中の状態を確認できない');
      return {x:s.x,y:s.y};
    });await draw(site.x,site.y,67);await shot('d');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('| 写真 | .shots/⑨b-a.png ～ ⑨b-d.png（4枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
