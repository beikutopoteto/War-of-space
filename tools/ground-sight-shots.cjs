/* 実行: node tools/ground-sight-shots.cjs（npm ci・Playwright Chromium 導入済みのMac）。
   1600×900、停止した固定場面。山は (c) だけの撮影用地形で、演習場データは変えない。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
    await page.waitForFunction(()=>window.WOS&&typeof groundFog!=='undefined'&&groundFog);
    await page.evaluate(()=>setSpeed(0));
    const view=async(x,y,dist)=>{
      await page.evaluate(({x,y,dist})=>{
        groundUpdateSight();groundDraw();groundFogDraw(true);updateGoal();
        camAnim=null;const at=groundPoint(x,y);controls.target.copy(at);
        camera.position.copy(at).add(new THREE.Vector3(0,dist,.01));camera.lookAt(at);controls.update();
      },{x,y,dist});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    const shoot=async letter=>page.screenshot({path:path.join(ROOT,'.shots',`⑤-${letter}.png`)});
    const reset=async kind=>page.evaluate(kind=>{
      const source=groundUnitSpec(OPS.find(o=>o.id==='groundExercise2').quick[0]);
      reset({op:'groundExercise2',fleets:[{...source,groundKind:kind,name:groundRuleSet().unitTypes[kind].name,band:kind==='supportAircraft'?'high':'ground'}]});
      setSpeed(0);fleets.forEach(f=>{f.stance='evade';f.order=null;});
      const blue=fleets.find(f=>f.team===0);blue.pos.copy(groundPoint(9,27));blue.pos.y=groundUnitHeight(blue);select(blue);
      // 守備隊も最後まで生存。固定位置で射撃・進行を止めて撮る。
      fleets.filter(f=>f.team===1).forEach((f,i)=>{f.pos.copy(groundPoint(34+i*3,24-i*3));f.pos.y=groundUnitHeight(f);});
    },kind);
    // (a) 全体の真上。基本部隊と斥候の視界の和、範囲外の暗さ。
    await page.evaluate(()=>{
      reset({op:'groundExercise2'});setSpeed(0);
      fleets.forEach(f=>{f.stance='evade';f.order=null;});
      const f=fleets.find(f=>f.team===0&&f.groundKind==='vehicle');f.groundKind='scout';f.pos.copy(groundPoint(19,27));f.pos.y=groundUnitHeight(f);select(f);
    });
    await view(24,18,205);await shoot('a');
    // (b) 実際に描いた樹冠から遮蔽地点を選ぶ。基本視界では隠れる距離から、斥候が見つける。
    await reset('scout');
    await page.evaluate(()=>{
      const scout=fleets.find(f=>f.team===0),enemy=fleets.find(f=>f.team===1);
      const forest=groundForests.find(p=>{
        const target={...enemy,pos:new THREE.Vector3(p.x,0,p.z)},observer={...scout,pos:new THREE.Vector3(p.x-24,0,p.z)};
        return groundPass(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,'infantry')&&groundPass((p.x-24)/GROUND_SCALE+24,18-p.z/GROUND_SCALE,'infantry')&&groundCanSee(observer,target);
      });
      if(!forest)throw new Error('森を使う固定場面を配置できない');
      enemy.pos.set(forest.x,groundHeight(forest.x,forest.z),forest.z);enemy.groundKind='infantry';
      scout.pos.set(forest.x-24,groundHeight(forest.x-24,forest.z),forest.z);
      groundUpdateSight();if(!enemy.seen||groundConcealment(enemy)!==groundSightRules().forest)throw new Error('森の敵を斥候が発見できない');
      window.groundShotFocus={x:forest.x/GROUND_SCALE+24-2,y:18-forest.z/GROUND_SCALE};
    });
    const forestAt=await page.evaluate(()=>window.groundShotFocus);await view(forestAt.x,forestAt.y,72);await shoot('b');
    // (c) 山の東で発見してから、観測側を西へ移す。敵の真のモデルは消え、東に最終位置だけが残る。
    await page.evaluate(()=>{
      const hill=WOS_TERRAIN.exercise2.height.observationHill;window.groundShotHill={...hill};
      Object.assign(hill,{x:41,y:27,widthXKm:.7,widthYKm:2,heightM:500});
    });
    try{
      await reset('scout');
      await page.evaluate(()=>{
        const scout=fleets.find(f=>f.team===0),enemy=fleets.find(f=>f.team===1);
        // 他の敵は遠方へ。見えている敵を先に記録する。
        scout.pos.copy(groundPoint(44,27));enemy.pos.copy(groundPoint(42.5,27));groundUpdateSight();
        if(!enemy.seen)throw new Error('山の東での初回発見に失敗');
        scout.pos.copy(groundPoint(39.5,27));groundUpdateSight();
        if(enemy.seen||!enemy.lastPos)throw new Error('山で見失う場面に失敗');
      });
      await view(41,27,82);await shoot('c');
    }finally{
      await page.evaluate(()=>{Object.assign(WOS_TERRAIN.exercise2.height.observationHill,window.groundShotHill);delete window.groundShotHill;});
    }
    // (d) 同じ全体画角で高高度の支援機の視界100を見る。爆撃は次の試作の範囲。
    await reset('supportAircraft');await view(24,18,205);await shoot('d');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('| 写真 | .shots/⑤-a.png ～ ⑤-d.png（4枚） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
