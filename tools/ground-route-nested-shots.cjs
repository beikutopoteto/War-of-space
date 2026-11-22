/* 作業票 #493: node tools/ground-route-nested-shots.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');
const {setupGroundRouteEdit,routeEditMapPoints}=require('../tests/ground-plan.cjs');

(async()=>{
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const rendered=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const frame=async()=>{
    await page.evaluate(()=>{
      // 画面上端の任務・時間パネルの下に、外側の曲がり角まで収める。
      camera.position.sub(controls.target).multiplyScalar(1.25).add(controls.target);
      controls.update();
    });
    await rendered();
  };
  const capture=async name=>{
    await rendered();
    const file=path.join(out,'route-nested-'+name+'.png');
    await page.screenshot({path:file});
    assert.deepEqual(errors,[]);
    console.log(file);
  };
  try{
    await setupGroundRouteEdit(page,7);
    await frame();
    assert.equal(await page.evaluate(()=>groundPlanPreview(window.routeEditDemo).filter(r=>r.detourVia).length),7);
    await page.locator('#groundEdit').click();
    await capture('both-7');

    await setupGroundRouteEdit(page);
    await frame();
    const {plan}=await routeEditMapPoints(page);
    await page.mouse.click(plan.x,plan.y);
    await page.locator('#groundEditPick [data-action="detour-left"]').click();
    assert.equal(await page.evaluate(()=>groundPlanPreview(window.routeEditDemo).filter(r=>r.lane?.first&&r.detourVia).length),4);
    await page.locator('#groundEdit').click();
    await capture('left-4');

    await page.locator('#groundEdit').click();
    const {handle,second}=await routeEditMapPoints(page);
    await page.keyboard.down('Shift');
    try{
      for(const p of [handle,second])await page.mouse.click(p.x,p.y);
    }finally{await page.keyboard.up('Shift');}
    await page.mouse.move(800,200);
    assert.equal(await page.evaluate(()=>groundEditSelected.length),2);
    await capture('selected-2');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
