/* node tools/ground-hint-shots.cjs: メニューからの通常出撃とreset直呼びを確認。1600×900、.shots/へ保存。 */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openGame}=require('./browser.cjs');
const {openSortieMenu}=require('../tests/ground-drill-menu.cjs');
const {seedDrillCampaign}=require('../tests/ground-drill.cjs');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 const out=path.resolve(__dirname,'../.shots');fs.mkdirSync(out,{recursive:true});
 try{
  const original=await page.evaluate(()=>({hint:spaceHint,keys:spaceKeys}));
  // Save progress only; exercise selection and sortie go through the real menu buttons.
  await page.evaluate(seedDrillCampaign);
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wos.save.v1'));s.prog.tutorialCleared=true;s.prog.cleared=[...new Set([...s.prog.cleared,'denaliBreak','tutorial2'])];localStorage.setItem('wos.save.v1',JSON.stringify(s));});
  await page.reload();await openSortieMenu(page);
  const tab=page.locator('[data-op-section="演習"]');if(await tab.getAttribute('aria-expanded')==='false')await tab.click();
  await page.locator('[data-op="baikonur"]').click();await page.locator('#goBattle').click();
  const state=()=>page.evaluate(()=>({hint:hintEl.textContent,hidden:hintEl.hidden,keys:keysEl.innerHTML,ground:!!op.ground}));
  let s=await state();assert(s.ground&&!s.hidden);assert.doesNotMatch(s.hint+s.keys,/宙域|要塞|艦隊/);
  await page.screenshot({path:path.join(out,'ground-hint-menu.png')});
  await page.waitForFunction(()=>hintEl.hidden,{},{timeout:10000});
  await page.keyboard.press('Escape');await page.locator('[data-pm="keys"]').click();assert(await page.locator('#keys').isVisible());
  await page.screenshot({path:path.join(out,'ground-hint-keys.png')});await page.keyboard.press('Escape');
  await page.evaluate(()=>{const source=OPS.find(o=>o.id==='baikonur');reset({op:'baikonur',fleets:source.quick});});
  s=await state();assert(!s.hidden);assert.doesNotMatch(s.hint+s.keys,/宙域|要塞|艦隊/);
  await page.evaluate(()=>WOS.start({op:'charybdis'}));
  s=await state();assert.equal(s.hint,original.hint);assert.equal(s.keys,original.keys);assert(!s.hidden);
  await page.screenshot({path:path.join(out,'space-hint.png')});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('通常出撃・reset直呼び・地上操作一覧・自動消去・宇宙本文維持: 成功（ページ例外なし）');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
