/* 実行: node tools/ground-shots.cjs（npm ci・Playwright Chromium 導入済みのMacで）。
   戦闘を止め、固定配置と step(.05) の早送りで5場面を作る。 */
const path = require('path');
const { openGame, ROOT } = require('./browser.cjs');
(async()=>{
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try {
    await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
    await page.waitForFunction(()=>window.WOS&&typeof groundSites!=='undefined'&&groundSites.length===3);
    await page.evaluate(()=>{setSpeed(0);});
    const cameraAt=async(id,dist)=>{
      await page.evaluate(({id,dist})=>{
        camAnim=null; const target=id?groundSites.find(s=>s.id===id).pos.clone():new THREE.Vector3(0,0,0);
        controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(0,dist,.01));camera.lookAt(target);controls.update();
      },{id,dist});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    const shoot=async(letter)=>{await page.screenshot({path:path.join(ROOT,".shots",`③-${letter}.png`)});};
    const advance=async(seconds)=>page.evaluate(seconds=>{for(let i=0;i<Math.round(seconds/.05)&&!over;i++)step(.05);groundDraw();updateGoal();},seconds);
    await cameraAt(null,205);await shoot('a');
    const first=await page.evaluate(()=>{
      const s=groundSites[0];
      // 射撃と移動を止め、占拠部隊だけを置く。敵は生存したまま離す。
      fleets.forEach(f=>{f.stance='evade';f.order=null;f.queue=[];f.pos.copy(groundPoint(f.team?44:4,32));});
      const infantry=fleets.find(f=>f.team===0&&f.groundKind==='infantry');infantry.pos.copy(s.pos);select(infantry);
      return s.id;
    });
    await advance(12);await cameraAt(first,65);await shoot('b');
    await page.evaluate(id=>{fleets.find(f=>f.team===1&&f.groundKind==='infantry').pos.copy(groundSites.find(s=>s.id===id).pos);},first);
    await advance(.05);await shoot('c');
    await page.evaluate(()=>{fleets.filter(f=>f.team===1).forEach(f=>f.pos.copy(groundPoint(44,32)));});
    await advance(18);await cameraAt(null,205);await shoot('d');
    await page.evaluate(()=>{
      // (e) は勝利画面の撮影。占拠の再現は (b)〜(d) で行い、ここでは
      // 撮影用に全拠点を自軍にして、通常の勝利判定・結果表示を通す。
      if(over) throw new Error('勝利場面の準備前に戦闘が終了した');
      for(const s of groundSites){s.owner=0;s.progress=[0,0];s.contested=false;}
      groundCaptureStep(0);groundDraw();updateGoal();
      if(!over||outcome!==true) throw new Error('全拠点を自軍に設定したが勝利判定が成立しない');
    });
    await page.waitForTimeout(2500);await page.evaluate(()=>{const t=document.getElementById('talkSkip');if(t&&!document.getElementById('talk').hidden)t.click();});await page.waitForSelector('#result:not([hidden])',{timeout:15000});await shoot('e');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('| 写真 | .shots/③-a.png ～ ③-e.png（5枚） |');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
