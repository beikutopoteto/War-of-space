/* 実行: node tools/ground-strike-shots.cjs（npm ci・Playwright Chromium 導入済みのMac）。
   1600×900、停止した固定場面。実際の地点攻撃を発射して step(.05) で着弾させる。
   (d) の「指定地点」札と細い十字だけは、散布を比較するための撮影用注記。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
    await page.waitForFunction(()=>window.WOS&&typeof groundFog!=='undefined'&&groundFog);
    await page.evaluate(()=>setSpeed(0));
    const resetScene=async(kind,blind=false)=>page.evaluate(({kind,blind})=>{
      const base=OPS.find(o=>o.id==='groundExercise2').quick[0],type=WOS_TERRAIN.exercise2.unitTypes[kind];
      reset({op:'groundExercise2',fleets:Array.from({length:blind?3:1},(_,i)=>({...base,groundKind:kind,name:type.name+(blind?' '+(i+1):''),band:kind==='supportAircraft'?'high':'ground'}))});
      setSpeed(0);
      fleets.forEach(f=>{f.stance='evade';f.order=null;f.queue=[];f.groundStrikeCooldown=0;f.pos.copy(groundPoint(f.team?44:9,27));});
      const blue=fleets.filter(f=>f.team===0),target=groundPoint(blind?19:13,27);
      for(const f of blue){f.pos.copy(groundPoint(9,27));f.pos.y=groundUnitHeight(f);}
      const enemy=fleets.find(f=>f.team===1);enemy.pos.copy(target);enemy.pos.y=groundUnitHeight(enemy);
      select(blue[0]);groundUpdateSight();
      if(groundPointSeenBy(0,target)===blind)throw new Error('観測／未観測の固定配置に失敗');
      window.groundStrikeShotTarget=target;window.groundStrikeShotFocus={x:blind?17:12,y:27,dist:blind?88:80};
      // 固定乱数は発射時だけ。未観測の3発は同じ狙点の周りへ別方向に着弾する。
      const old=Math.random;let i=0;const values=blind?[0,.81,1/3,.81,2/3,.81]:[.125,.25];
      try{
        Math.random=()=>values[i++%values.length];
        for(const f of blue)if(!groundStrikeLaunch(f,target))throw new Error('地点攻撃を発射できない');
      }finally{Math.random=old;}
      if(groundStrikes.some(s=>s.observed===blind))throw new Error('散布の判定が場面と合わない');
    },{kind,blind});
    const draw=async()=>{
      await page.evaluate(()=>{
        const {x,y,dist}=window.groundStrikeShotFocus,at=groundPoint(x,y);
        camAnim=null;controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(0,dist,.01));camera.lookAt(at);controls.update();
        groundUpdateSight();groundDraw();groundFogDraw(true);updateGoal();
      });
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    const shot=async letter=>page.screenshot({path:path.join(ROOT,'.shots',`⑥-${letter}.png`)});
    const advance=async seconds=>page.evaluate(seconds=>{
      for(let i=0;i<Math.round(seconds/.05);i++){if(over)throw new Error('撮影前に戦闘が終了');step(.05);}
      // 粒子はゲームを止めて撮るため、発生直後から1コマだけ描画を進める。
      stepParticles(.03);groundDraw();
    },seconds);
    // (a) 自走砲の予告円。1秒進めて残り4秒。
    await resetScene('artillery');await advance(1);await draw();await shot('a');
    // (b) 同じ弾が5秒で着弾した瞬間。
    const hp=await page.evaluate(()=>fleets.find(f=>f.team===1).hpPool);
    await advance(4);await draw();
    if(!await page.evaluate(hp=>groundStrikes.length===0&&groundImpacts.length===1&&fleets.find(f=>f.team===1).hpPool<hp,hp))throw new Error('自走砲の着弾と損害を確認できない');
    await shot('b');
    // (c) 広域戦略支援航空機の高高度爆撃。残り6秒。
    await resetScene('supportAircraft');await advance(1);await draw();await shot('c');
    // (d) 同じ未観測地点に撃った3発。指定地点と着弾中心のずれを示す。
    await resetScene('artillery',true);await advance(5);await draw();
    await page.evaluate(()=>{
      if(groundImpacts.length!==3||groundImpacts.some(s=>s.observed||s.spread!==4||s.impact.distanceTo(s.aim)<3))throw new Error('未観測の散布着弾を確認できない');
      const at=window.groundStrikeShotTarget,points=[new THREE.Vector3(at.x-1,at.y+.4,at.z),new THREE.Vector3(at.x+1,at.y+.4,at.z),new THREE.Vector3(at.x,at.y+.4,at.z-1),new THREE.Vector3(at.x,at.y+.4,at.z+1)];
      groundVisuals.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xcad1c5,transparent:true,opacity:.9,depthWrite:false})));
      const p=proj(at),label=document.createElement('div');label.className='ground-strike-label';label.textContent='指定地点（未観測・散布×2）';label.style.transform=`translate(${p.x}px,${p.y+24}px) translate(-50%,0)`;labelsEl.appendChild(label);
    });
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));await shot('d');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('| 写真 | .shots/⑥-a.png ～ ⑥-d.png（4枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
