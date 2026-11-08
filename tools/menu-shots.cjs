/* node tools/menu-shots.cjs（Chromium が起動できる環境）。
   .shots/menu-a.png: 全段を畳んだ一覧、menu-b.png: デナリ破砕後の新規通知。
   実クリック・保存・再読込・キーボード・動きを減らす設定も同じ台本で確認。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
const {seedDrillCampaign}=require('../tests/ground-drill.cjs');
const {openSortieMenu,checkSortieSections}=require('../tests/ground-drill-menu.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  let count=0;
  const fail=()=>{if(errors.length)throw new Error(errors.join('\n'));};
  const check=(ok,name)=>{fail();if(!ok)throw new Error(name);count++;};
  const menu=()=>openSortieMenu(page,{reload:true});
  try{
    await page.evaluate(seedDrillCampaign,false);await menu();
    await checkSortieSections(page,check,menu,async letter=>{
      // 固定した明るさで撮るが、確認後は本来の点滅へ戻す。
      const css=await page.addStyleTag({content:'.ops .op-tab.unseen{animation-play-state:paused;animation-delay:-1.4s}'});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(ROOT,'.shots',`menu-${letter}.png`)});fail();
      await css.evaluate(e=>e.remove());
    });
    check(await page.locator('[data-op="tutorial2"]').isEnabled()&&await page.locator('[data-op="baikonur"]').isDisabled(),'デナリ破砕後も演習は案内付きから');
    console.log(`| メニュー写真・実画面の確認 | ${count}/${count} 成功・.shots/menu-a.png / menu-b.png（1600×900） |`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
