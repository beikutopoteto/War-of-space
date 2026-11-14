/* 実行: node tools/ground-sea-shots.cjs（npm ci・Playwright Chromium 導入済みのMac）。
   1600×900、出力 .shots/⑨a-a.png ～ ⑨a-d.png。
   (a) 海岸全体と双方の艦 (b) 艦・戦車・歩兵の比較 (c) 陸上の艦砲予告 (d) 攻撃機と艦の相互射撃。
   撮影用の固定配置だけを使い、既存のモデル・発射・damage・予告円をそのまま撮る。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
    await page.waitForFunction(()=>window.WOS&&typeof groundVisuals!=='undefined'&&groundVisuals);
    const fresh=async()=>page.evaluate(()=>{
      reset({op:'groundExercise2'});setSpeed(0);
      fleets.forEach(f=>{f.stance='evade';f.order=null;f.queue=[];f.groundShotT=0;f.groundStrikeCooldown=0;});
    });
    const draw=async(x,y,dist,oblique=false)=>{
      await page.evaluate(({x,y,dist,oblique})=>{
        const at=groundPoint(x,y);camAnim=null;controls.target.copy(at);
        camera.position.copy(at).add(new THREE.Vector3(0,dist*(oblique?.9:1),oblique?dist*.45:.01));camera.lookAt(at);controls.update();
        groundUpdateSight();groundDraw();groundFogDraw(true);updateGoal();
      },{x,y,dist,oblique});
      // カメラを動かしたあとは描画の更新を待つ。
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    const shot=async letter=>page.screenshot({path:path.join(ROOT,'.shots',`⑨a-${letter}.png`)});
    // (a) 海岸全体。撮影では敵艦も味方の視界へ近づけ、双方の4隻を写す。
    await fresh();await page.evaluate(()=>{
      const red=fleets.filter(f=>f.team===1&&f.groundKind==='sea');red[0].pos.copy(groundPoint(21,6));red[1].pos.copy(groundPoint(24,4));
      groundUpdateSight();if(red.some(f=>!groundSeenBy(0,f)))throw new Error('全体写真で敵艦が視界に入っていない');
    });await draw(24,10,205);await shot('a');
    // (b) 比較する3部隊を離し、名札が重ならないようにする。他の部隊は北へ移す。
    await fresh();await page.evaluate(()=>{
      fleets.forEach((f,i)=>f.pos.copy(groundPoint(4+i*2,31)));
      const ship=fleets.find(f=>f.team===0&&f.groundKind==='sea'&&f.type==='cl'),tank=fleets.find(f=>f.team===0&&f.groundKind==='vehicle'),infantry=fleets.find(f=>f.team===0&&f.groundKind==='infantry');
      for(const [f,x,y] of [[ship,12,6.7],[tank,12,9],[infantry,15,9]]){f.pos.copy(groundPoint(x,y));f.pos.y=groundUnitHeight(f);}
      select(ship);
    });await draw(13,8,48,true);await shot('b');
    // (c) 巡洋艦から陸の地点へ発射。観測を共有し、1秒進めた残り7秒の円を撮る。
    await fresh();await page.evaluate(()=>{
      fleets.forEach((f,i)=>f.pos.copy(groundPoint(4+i*2,31)));
      const ship=fleets.find(f=>f.team===0&&f.groundKind==='sea'&&f.type==='cl'),spotter=fleets.find(f=>f.team===0&&f.groundKind==='infantry'),target=fleets.find(f=>f.team===1&&f.groundKind==='infantry');
      ship.pos.copy(groundPoint(17,6));spotter.pos.copy(groundPoint(13,10));target.pos.copy(groundPoint(17,9.3));
      for(const f of [ship,spotter,target])f.pos.y=groundUnitHeight(f);
      select(ship);groundUpdateSight();const old=Math.random;let s;
      try{Math.random=()=>0;s=groundStrikeLaunch(ship,target.pos);}finally{Math.random=old;}
      if(!s||!s.observed||s.left!==8||s.radius!==10)throw new Error('艦砲の8秒・半径10・観測を確認できない');
      for(let i=0;i<20;i++)step(.05);groundDraw();
      if(groundStrikes.length!==1||Math.abs(s.left-7)>1e-6||!s.visual.el.textContent.includes('艦砲'))throw new Error('艦砲の予告表示を確認できない');
    });await draw(17,8.5,70,true);await shot('c');
    // (d) 同じ射撃表・damage を通して、低空の攻撃機と駆逐艦が相互に損害を与える。
    await fresh();await page.evaluate(()=>{
      fleets.forEach((f,i)=>f.pos.copy(groundPoint(4+i*2,31)));
      const ship=fleets.find(f=>f.team===0&&f.groundKind==='sea'&&f.type==='dd'),base=op.quick.map(groundUnitSpec).find(f=>f.groundKind==='attack'),plane=makeFleet(1,{...base,name:'共和国 攻撃航空隊'});
      fleets.push(plane);plane.band='low';plane.bandLeft=0;plane.queue=[];plane.order=null;plane.stance='evade';
      // 地上初期化と同じ既存航空モデルを、この撮影用の増援にも付ける。
      plane.groundModel=new THREE.Group();groundAircraft(plane.groundModel,TEAM_COL[1]);groundVisuals.add(plane.groundModel);
      ship.pos.copy(groundPoint(12,5));plane.pos.copy(groundPoint(14,5.8));
      ship.pos.y=groundUnitHeight(ship);plane.pos.y=groundUnitHeight(plane);
      order(ship,{type:'attack',target:plane});order(plane,{type:'attack',target:ship});
      const hp=[ship.hpPool,plane.hpPool];select(ship);step(.05);
      if(!(ship.hpPool<hp[0]&&plane.hpPool<hp[1]))throw new Error('攻撃機と艦の相互射撃を確認できない');
      // 停止中も弾線を見せるため、実射撃の弾線の描画だけを進める。
      stepTracers(.1);groundDraw();
    });await draw(13,6,65,true);await shot('d');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('| 写真 | .shots/⑨a-a.png ～ ⑨a-d.png（4枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
