/* 作業票 #492: node tools/ground-route-edit-shots.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');
const {setupGroundRouteEdit,routeEditMapPoints}=require('../tests/ground-plan.cjs');

(async()=>{
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const capture=async name=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(errors,[]);
    const file=path.join(out,'route-edit-'+name+'.png');
    await page.screenshot({path:file});console.log(file);
  };
  try{
    await setupGroundRouteEdit(page);
    const {plan}=await routeEditMapPoints(page);
    assert.equal(await page.evaluate(()=>window.routeEditDemo.plan.detour),'both');
    await capture('both');

    await page.mouse.click(plan.x,plan.y);
    await page.locator('#groundEditPick [data-action="detour-left"]').click();
    assert.equal(await page.evaluate(()=>window.routeEditDemo.plan.detour),'left');
    await capture('left');

    const {handle}=await routeEditMapPoints(page);
    await page.mouse.move(handle.x,handle.y);await page.mouse.down();
    await page.mouse.move(handle.x-45,handle.y+28,{steps:5});await page.mouse.up();
    const edited=await page.evaluate(()=>{
      const front=window.routeEditDemo,custom=front.custom.get(front.members[0]);
      return {count:front.custom.size,edited:custom?.isCustomEdited,points:custom?.points.length};
    });
    assert.equal(edited.count,1);assert.equal(edited.edited,true);assert(edited.points>0);
    await capture('drag');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
