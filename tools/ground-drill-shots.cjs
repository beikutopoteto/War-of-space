/* 実行: node tools/ground-drill-shots.cjs（Chromium を起動できる Mac）。
   1600×900、.shots/⑩a-a.png ～ ⑩a-f.png。ページ例外は即失敗。
   --sim ならブラウザ不要で、同じ操作を実地形・経路・射撃の早送りで測る。
   戦闘時間は step(.05)。カメラ変更後は描画を2回待ってから写真を撮る。 */
const fs=require('fs'),path=require('path');
const {drillAction,drillAdvance,performDrillAction,seedDrillCampaign,runDrill}=require('../tests/ground-drill.cjs');
if(process.argv.includes('--sim')){
  const times=runDrill();
  for(let section=1;section<=9;section++)console.log(`| ${section} | ${times.filter(r=>r.section===section).reduce((s,r)=>s+r.seconds,0).toFixed(2)}秒 |`);
  console.log(`| 全段 | ${times.reduce((s,r)=>s+r.seconds,0).toFixed(2)}秒・勝利 |`);
}else (async()=>{
  const {openGame,ROOT}=require('./browser.cjs');
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  const fail=()=>{if(errors.length)throw new Error(errors.join('\n'));};
  try{
    // 通常の保存を作って第一章クリア状態へ。撮影用ブラウザの保存だけを変える。
    await page.evaluate(seedDrillCampaign,true);
    await page.evaluate(()=>localStorage.setItem('wos.opt',JSON.stringify({...WOS_OPT,story:false})));
    await page.reload();await page.waitForFunction(()=>window.WOS_MENU);
    await page.click('[data-go="mode"]');await page.click('[data-go="sortie"]');await page.click('[data-op="ch2drill"]');
    await page.locator('[data-op="ch2drill"]').scrollIntoViewIfNeeded();
    const shot=async letter=>{fail();await page.screenshot({path:path.join(ROOT,'.shots',`⑩a-${letter}.png`)});fail();};
    const drawn=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));fail();};
    await drawn();await shot('a');
    await page.click('#goBattle');
    await page.evaluate(()=>{setSpeed(0);if(talking)endTalk();});
    await page.evaluate('window.drillAction='+drillAction.toString());await page.evaluate('window.drillAdvance='+drillAdvance.toString());
    const frame=async()=>{
      await page.evaluate(()=>{
        camAnim=null;const row=groundDrillRow(),f=groundDrillUnit(row.actor),m=row.marks[0];
        const at=m?new THREE.Vector3(m.pos[0],groundHeight(...m.pos),m.pos[1]).add(f.pos).multiplyScalar(.5):f.pos.clone();
        controls.target.copy(at);const dist=Math.max(95,f.pos.distanceTo(at)*2+75);
        camera.position.copy(at).add(new THREE.Vector3(0,dist,dist*.4));camera.lookAt(at);controls.update();
        groundUpdateSight();groundDraw();groundFogDraw(true);updateGoal();
      });await drawn();
    };
    await frame();await shot('b');
    for(let i=0;i<19;i++){
      if(i===4){await frame();await shot('c');}
      if(i===10){await frame();await shot('d');}
      if(!await performDrillAction(page))throw new Error('撮影の操作が失敗: '+i);
      if(i===18){
        // 実際の上陸時計の中間。選択や部隊の座標を撮影用に書き換えない。
        await page.evaluate(()=>{for(let n=0;n<100;n++)step(.05);groundDraw();if(!selected.groundUnloading)throw new Error('上陸中の場面にならない');});
        await frame();await shot('e');
      }
      const row=await page.evaluate(()=>drillAdvance());fail();
      console.log(`| ${row.name} | ${row.seconds.toFixed(2)}秒 |`);
    }
    await page.waitForSelector('#result:not([hidden])');await drawn();await shot('f');
    if(!await page.evaluate(()=>over&&outcome===true&&tutorial.complete))throw new Error('全手順で勝利していない');
    console.log('| 写真 | .shots/⑩a-a.png ～ ⑩a-f.png（6枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
