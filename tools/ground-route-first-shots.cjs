/* 作業票 #494: node tools/ground-route-first-shots.cjs */
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
    const file=path.join(out,'route-first-'+name+'.png');
    await page.screenshot({path:file});
    assert.deepEqual(errors,[]);
    console.log(file);
  };
  const groups=()=>page.evaluate(()=>{
    const routes=groundPlanPreview(window.routeEditDemo),byPoint=new Map();
    for(const {detourVia:p,path} of routes){
      if(!p||path?.pts.length!==2)throw Error('中継点が1つの経路を撮影できません');
      const key=[p.x,p.z].join(',');
      byPoint.set(key,(byPoint.get(key)||0)+1);
    }
    return [...byPoint.values()].sort();
  });
  try{
    await setupGroundRouteEdit(page,7);
    await frame();
    assert.deepEqual(await groups(),[3,4]);
    await page.locator('#groundEdit').click();
    await capture('both-7');

    await setupGroundRouteEdit(page);
    await frame();
    const {plan}=await routeEditMapPoints(page);
    await page.mouse.click(plan.x,plan.y);
    await page.locator('#groundEditPick [data-action="detour-left"]').click();
    assert.equal(await page.evaluate(()=>window.routeEditDemo.plan.detour),'left');
    assert.deepEqual(await groups(),[4]);
    await page.locator('#groundEdit').click();
    await capture('left-4');

  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
