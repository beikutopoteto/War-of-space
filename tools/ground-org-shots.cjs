/* 実行: node tools/ground-org-shots.cjs（npm ci・Playwright Chromium 導入済みのMac）。
   1600×900、.shots/④-a.png〜④-d.png。新規ブラウザの既定編成を使い、利用者の保存は変更しない。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await page.evaluate(()=>{WOS.openMenu();document.getElementById('forcesOrg').click();});
    await page.click('[data-org-force="ground"]');
    await page.waitForSelector('[data-ground-pick="companies"]');
    const shoot=async letter=>{
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(ROOT,'.shots',`④-${letter}.png`)});
    };
    // (a) 第1旅団の下に2大隊・6中隊を表示。
    await shoot('a');
    await page.click('[data-org-force="space"]');
    await page.waitForSelector('#orgList [data-army]');await shoot('b');
    // (c) 保存編成から出撃。全階層を開き、敵味方の自動射撃だけ止める。
    await page.evaluate(()=>{
      WOS.start({op:'groundExercise2'});setSpeed(0);
      fleets.forEach(f=>f.stance='evade');
      groundOrg.brigades.forEach(b=>b.open=true);groundOrg.battalions.forEach(b=>b.open=true);buildRoster();updateRoster();
      camAnim=null;controls.target.set(0,0,0);camera.position.set(0,205,.01);camera.lookAt(controls.target);controls.update();groundDraw();
      if(document.querySelectorAll('#roster [data-level="battalions"]').length!==2||document.querySelectorAll('#roster .frow').length!==6)throw new Error('一覧の全階層が開いていない');
    });await shoot('c');
    // (d) 実際の大隊ボタンを押し、既存の一括命令を出して2秒進める。
    await page.click('#roster [data-level="battalions"][data-id="gb1"] .grpBtn');
    await page.evaluate(()=>{
      const t=orderTargets(),before=t.map(f=>f.pos.clone());
      if(t.length!==3)throw new Error('第1大隊の3中隊が選択されていない');
      groupOrder({type:'move',dest:groundPoint(14,29)});
      if(!t.every(f=>f.order?.type==='move'))throw new Error('一括移動の経路を作れない');
      for(let i=0;i<40;i++)step(.05);
      if(!t.every((f,i)=>f.pos.distanceTo(before[i])>.1))throw new Error('所属中隊が移動していない');
      groundDraw();updateGoal();updateRoster();
    });await shoot('d');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('| 写真 | .shots/④-a.png ～ ④-d.png（4枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
