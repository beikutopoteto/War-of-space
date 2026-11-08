/* 実行: node tools/ground-drill-shots.cjs（Chromium を起動できる Mac）。
   1600×900、.shots/⑩b-a.png ～ ⑩b-e.png。ページ例外は失敗。
   --sim はブラウザ不要。同じ案内を実地形・経路・射撃で早送りする。
   待つ上限は経路コストと実速から求める（drillAdvance）。カメラ変更後は描画を2回待つ。 */
const fs=require('fs'),path=require('path');
const {drillAction,drillAdvance,performDrillAction,seedDrillCampaign,checkDrillLabels,runDrill}=require('../tests/ground-drill.cjs');
if(process.argv.includes('--sim')){
  const times=runDrill();
  for(let section=1;section<=9;section++)console.log(`| ${section} | ${times.filter(r=>r.section===section).reduce((s,r)=>s+r.seconds,0).toFixed(2)}秒 |`);
  console.log(`| 全段 | ${times.reduce((s,r)=>s+r.seconds,0).toFixed(2)}秒・勝利 |`);
  console.log(`| 仮想敵の実打撃 | 前半${times.counterfire.early}回・後半${times.counterfire.late}回・損害${times.counterfire.damage} |`);
}else (async()=>{
  const {openGame,ROOT}=require('./browser.cjs');
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  const fail=()=>{if(errors.length)throw new Error(errors.join('\n'));};
  const check=(ok,name)=>{fail();if(!ok)throw new Error(name);};
  const drawn=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));fail();};
  const shot=async letter=>{await drawn();await page.screenshot({path:path.join(ROOT,'.shots',`⑩b-${letter}.png`)});fail();};
  try{
    await page.evaluate(seedDrillCampaign,true);
    await page.evaluate(()=>localStorage.setItem('wos.opt',JSON.stringify({...WOS_OPT,story:false})));
    await page.reload();await page.waitForFunction(()=>window.WOS_MENU);
    await page.click('[data-go="mode"]');await page.click('[data-go="sortie"]');await page.click('[data-op="ch2drill"]');
    await page.locator('[data-op="ch2drill"]').scrollIntoViewIfNeeded();
    check(await page.locator('[data-op="ch2drill"]').evaluate(e=>{let p=e.previousElementSibling;while(p&&!p.classList.contains('grp'))p=p.previousElementSibling;return p?.textContent==='演習'&&e.textContent.includes('バイコヌール演習');}),'演習の欄にない');
    await shot('a');
    const funds=await page.evaluate(()=>JSON.parse(localStorage.getItem('wos.save.v1')).prog.funds);
    await page.click('#goBattle');await page.evaluate(()=>{setSpeed(0);if(talking)endTalk();});
    await page.evaluate('window.drillAction='+drillAction.toString());await page.evaluate('window.drillAdvance='+drillAdvance.toString());
    await checkDrillLabels(page,check,()=>shot('b')); // 未選択の歩兵と選択した戦車の名札・輪。
    const frame=async mode=>{
      await page.evaluate(mode=>{
        camAnim=null;const row=groundDrillRow(),f=groundDrillUnit(row.actor),m=row.marks[0];
        const other=mode==='fire'?groundDrillUnit('仮想敵 航空').pos:m?new THREE.Vector3(m.pos[0],groundHeight(...m.pos),m.pos[1]):f.pos;
        const at=f.pos.clone().add(other).multiplyScalar(.5),dist=Math.max(80,f.pos.distanceTo(other)+60);
        controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(0,dist,dist*.4));camera.lookAt(at);controls.update();
        groundUpdateSight();groundDraw();groundFogDraw(true);updateGoal();
      },mode);await drawn();
    };
    for(let i=0;i<19;i++){
      if(!await performDrillAction(page))throw new Error('撮影の操作が失敗: '+i);
      if(i===2){
        check(await page.evaluate(()=>selected.order.path.points.slice(1).some((q,k)=>{const p=selected.order.path.points[k];return Math.abs(q.x-p.x)>.01&&Math.abs(q.z-p.z)>.01;})),'経路が斜めに進んでいない');
        await frame();await shot('c');
      }
      if(i===7){
        // ⑥の最初の実射撃。速さ0の描画でも弾道を残し、実損害も確かめる。
        check(await page.evaluate(()=>{const f=groundDrillUnit('仮想敵 航空'),target=selected,hp=target.hpPool;step(.05);stepTracers(.125);return f.fireTarget===target&&target.hpPool<hp;}),'⑥で仮想敵航空が撃っていない');
        await frame('fire');await shot('d');
      }
      const row=await page.evaluate(()=>drillAdvance());fail();
      console.log(`| ${row.name} | ${row.seconds.toFixed(2)}秒 |`);
    }
    await page.waitForSelector('#result:not([hidden])');
    check(await page.evaluate(base=>over&&outcome===true&&tutorial.complete&&document.getElementById('result').textContent.includes('資金 +100'),funds),'勝利・初回報酬100が揃わない');
    await shot('e');
    console.log('| 写真 | .shots/⑩b-a.png ～ ⑩b-e.png（5枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
