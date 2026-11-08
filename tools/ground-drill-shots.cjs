/* node tools/ground-drill-shots.cjs（Chromium が起動できる環境）。
   .shots/tut2-a.png: 演習欄、b: チュートリアル2後半、c: バイコヌール開始。
   --sim はブラウザ不要。ページ例外は失敗。カメラ変更後は描画を2回待つ。 */
const fs=require('fs'),path=require('path');
const {drillAction,drillAdvance,performDrillAction,seedDrillCampaign,runDrill}=require('../tests/ground-drill.cjs');
if(process.argv.includes('--sim')){
  const times=runDrill();
  for(let section=1;section<=10;section++)console.log(`| ${section} | ${times.filter(r=>r.section===section).reduce((s,r)=>s+r.seconds,0).toFixed(2)}秒 |`);
  console.log(`| 全26手順 | ${times.reduce((s,r)=>s+r.seconds,0).toFixed(2)}秒・勝利 |`);
  console.log(`| チュートリアル2の敵打撃 | 前半${times.counterfire.early}回・後半${times.counterfire.late}回・損害${times.counterfire.damage} |`);
  console.log(`| バイコヌール演習 | 案内なし・敵打撃${times.normal.hits}回・${times.normal.seconds.toFixed(2)}秒で勝利 |`);
}else (async()=>{
  const {openGame,ROOT}=require('./browser.cjs');
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  const fail=()=>{if(errors.length)throw new Error(errors.join('\n'));};
  const check=(ok,name)=>{fail();if(!ok)throw new Error(name);};
  const drawn=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));fail();};
  const shot=async letter=>{await drawn();await page.screenshot({path:path.join(ROOT,'.shots',`tut2-${letter}.png`)});fail();};
  try{
    await page.evaluate(seedDrillCampaign,true);
    await page.evaluate(()=>{
      const s=JSON.parse(localStorage.getItem('wos.save.v1'));s.prog.cleared.push('tutorial2');localStorage.setItem('wos.save.v1',JSON.stringify(s));
      localStorage.setItem('wos.opt',JSON.stringify({...WOS_OPT,story:false}));
    });
    await page.reload();await page.waitForFunction(()=>window.WOS_MENU);
    await page.click('[data-go="mode"]');await page.click('[data-go="sortie"]');await page.click('[data-op="tutorial2"]');
    await page.locator('[data-op="baikonur"]').scrollIntoViewIfNeeded();
    for(const id of ['tutorial2','baikonur']){
      check(await page.locator(`[data-op="${id}"]`).evaluate(e=>{const r=e.getBoundingClientRect(),s=document.getElementById('opList').getBoundingClientRect();return e.closest('[data-section]')?.dataset.section==='演習'&&r.top>=s.top&&r.bottom<=s.bottom;}),'演習欄の2作戦が同時に見えない: '+id);
    }
    await shot('a');
    await page.click('#goBattle');await page.evaluate(()=>{setSpeed(0);if(talking)endTalk();
      window.enemyHits=0;const realDamage=damage;damage=(t,n,src,...rest)=>{if(src?.team===1&&n>0)enemyHits++;return realDamage(t,n,src,...rest);};
    });
    await page.evaluate('window.drillAction='+drillAction.toString());await page.evaluate('window.drillAdvance='+drillAdvance.toString());
    for(let i=0;i<(await page.evaluate(()=>op.tutorial.length));i++){
      if(!await performDrillAction(page))throw new Error('撮影の操作が失敗: '+i);
      if(i===7){
        await page.evaluate(()=>{
          step(.05);camAnim=null;const f=selected,t=groundDrillUnit('仮想敵 航空'),at=f.pos.clone().add(t.pos).multiplyScalar(.5);
          controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(0,85,34));camera.lookAt(at);controls.update();groundDraw();updateGoal();
        });await drawn();
        check(await page.evaluate(()=>groundDrillRow().section===6&&enemyHits===0&&fleets.filter(f=>f.team===1).every(f=>!f.fireTarget&&!f.order)),'後半で敵が攻撃している');
        await shot('b');
      }
      await page.evaluate(()=>drillAdvance());fail();
    }
    await page.waitForSelector('#result:not([hidden])');
    check(await page.evaluate(()=>over&&outcome===true&&tutorial.complete&&tutorial.times.length===26&&enemyHits===0),'全26手順の勝利・敵打撃0が揃わない');
    await page.evaluate(()=>WOS.openMenu());await page.click('[data-go="mode"]');await page.click('[data-go="sortie"]');await page.click('[data-op="baikonur"]');
    await page.click('#goQuick');await page.evaluate(()=>{if(talking)endTalk();setSpeed(0);endDeploy();camAnim=null;const v=op.view,at=new THREE.Vector3(v.target[0],0,v.target[1]);controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(...v.dir).normalize().multiplyScalar(v.dist));camera.lookAt(at);controls.update();updateGoal();});
    check(await page.evaluate(()=>op.name==='バイコヌール演習'&&!tutorial&&!op.groundDrill&&!over),'通常演習が案内付きになっている');
    check(await page.locator('#training').isHidden()&&await page.locator('#talkText').isHidden(),'案内が残っている');
    await shot('c');
    console.log('| 写真 | .shots/tut2-a.png ～ tut2-c.png（3枚、1600×900）・全26手順の敵打撃0 |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
