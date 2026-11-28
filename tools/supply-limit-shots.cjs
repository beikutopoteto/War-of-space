/* node tools/supply-limit-shots.cjs
   出撃・大隊・旅団を1600×900と390×780で .shots/supply-limit-*.png に撮る。 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');
const {seedSupplySortie}=require('../tests/ground-forces.cjs');
const {openSortieMenu}=require('../tests/ground-drill-menu.cjs');

(async()=>{
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const desktop={width:1600,height:900},phone={width:390,height:780};
  const {browser,page,errors}=await openGame(desktop);
  const checkErrors=()=>assert.equal(errors.length,0,errors.join('\n'));
  async function capture(name){
    for(const size of [desktop,phone]){
      await page.setViewportSize(size);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      checkErrors();
      const file=path.join(out,`supply-limit-${name}-${size.width}x${size.height}.png`);
      await page.screenshot({path:file,animations:'disabled'});
      console.log(path.relative(ROOT,file));
    }
    await page.setViewportSize(desktop);
  }
  try{
    await page.evaluate(seedSupplySortie,{oversize:true});
    await openSortieMenu(page,{reload:true});
    await page.click('[data-op="baikonur"]');
    assert.equal(await page.locator('#groundSortieLoad tr.over').count(),2);
    assert.equal(await page.locator('#goBattle').isDisabled(),true);
    await capture('sortie');

    await page.evaluate(()=>WOS.openMenu());
    await page.click('#mainNav [data-go="org"]');
    await page.click('[data-org-force="ground"]');
    assert.match(await page.locator('#orgCap').textContent(),/65小隊・補給値 134/);
    assert.match(await page.locator('#orgDetail .dpanel').textContent(),/大隊の中身.*補給値 57/s);
    await capture('battalion');

    await page.click('[data-ground-tab="brigades"]');
    assert.match(await page.locator('#orgDetail .dpanel').textContent(),/旅団の中身.*補給値 109.*補給中隊 1小隊（限界 \+4）/s);
    await capture('brigade');
    checkErrors();
  }finally{
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
