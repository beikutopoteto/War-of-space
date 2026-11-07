/* 実行: node tools/ground-branches-shots.cjs（Chromiumが動くMacで）。
   1600×900、.shots/⑧-a.png〜⑧-d.png。利用者の保存とは別の新規ブラウザを使う。
   a: 新5兵科の名札 / b: 編成でロケット兵を選択 / c: 許可した敵だけへ射撃 / d: 自走対空砲の対空射撃。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
const {setupPermissionScene,setupAntiAirScene,NEW_KINDS}=require('../tests/ground-branches.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    const frame=async()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const shoot=async letter=>{await frame();await page.screenshot({path:path.join(ROOT,'.shots',`⑧-${letter}.png`)});};
    await page.evaluate(kinds=>{
      const base=OPS.find(o=>o.id==='groundExercise2').quick[0];
      WOS.start({op:'groundExercise2',fleets:kinds.map(kind=>({...base,name:WOS_TERRAIN.exercise2.unitTypes[kind].name,groundKind:kind,band:kind==='droneHive'?'low':'ground'}))});setSpeed(0);
      const mine=fleets.filter(f=>f.team===0);
      fleets.filter(f=>f.team===1).forEach((f,i)=>{f.stance='evade';f.pos.copy(groundPoint(44,29+i));});
      mine.forEach((f,i)=>{f.stance='evade';f.pos.copy(groundPoint(6+i*7,i%2?27:22));});
      camAnim=null;controls.target.copy(groundPoint(20,24));camera.position.copy(controls.target).add(new THREE.Vector3(0,160,.01));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);groundUpdateSight();groundDraw();updateRoster();
      mine.forEach(f=>updateFleetLabel(f,false,''));
      if(mine.length!==5||!mine.every(f=>f.el.textContent.includes(f.name)))throw new Error('新5兵科の名札が揃わない');
    },NEW_KINDS);await shoot('a');
    await page.evaluate(()=>{WOS.openMenu();document.getElementById('forcesOrg').click();});await page.click('[data-org-force="ground"]');
    await page.locator('[data-ground-pick="companies"]').first().click();await page.selectOption('#groundKind','guidedRocket');
    if(await page.inputValue('#groundKind')!=='guidedRocket'||await page.locator('#groundKind option').count()!==16)throw new Error('編成の新兵科を選べない');
    await shoot('b');
    // 同じ配置を実画面テストでも使う。カメラの描画更新を待ってから座標を取得する。
    await page.evaluate(setupPermissionScene);await frame();
    const p=await page.evaluate(()=>{
      const t=fleets.find(f=>f.name==='許可する目標'),p=proj(t.pos),hit=document.elementFromPoint(p.x,p.y);
      if(pick(p.x,p.y).best!==t||!(hit===renderer.domElement||t.el.contains(hit)))throw new Error('許可目標のクリックを別の名札が遮っている');
      return p;
    });await page.mouse.click(p.x,p.y);await page.click('#pick [data-pk="attack"]');
    await page.evaluate(()=>{
      const f=selected,t=fleets.find(f=>f.name==='許可する目標'),other=fleets.find(f=>f.name==='命じない目標'),hp=t.hpPool,otherHP=other.hpPool;
      if(f.order?.target!==t)throw new Error('クリックで許可が成立しない');
      // 最後のステップで射線を出し、停止中でも撮れるよう発射直後にする。
      for(let i=0;i<20;i++)step(.05);f.groundShotT=0;step(.05);stepTracers(.15);groundDraw();updateRoster();updateGoal();updateFleetLabel(f,false,'');
      if(t.hpPool>=hp||other.hpPool!==otherHP||!f.el.textContent.includes('許可制'))throw new Error('許可した目標だけを撃つ場面にならない');
    });await shoot('c');
    await page.evaluate(setupAntiAirScene);
    await page.evaluate(()=>{
      const gun=selected,target=fleets.find(f=>f.team===1),hp=target.hpPool;
      step(.05);stepTracers(.15);groundDraw();updateRoster();updateGoal();updateFleetLabel(gun,false,'');updateFleetLabel(target,false,'');
      if(target.hpPool>=hp||gun.fireTarget!==target)throw new Error('自走対空砲が高高度の航空機に当てていない');
    });await shoot('d');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('| 写真 | .shots/⑧-a.png ～ ⑧-d.png（4枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
