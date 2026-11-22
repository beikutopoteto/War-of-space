/* 作業票 #490: node tools/ground-plan-queue-shots.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');

async function mapPoint(page,x,y){
  return page.evaluate(([x,y])=>{
    const point=groundPoint(x,y);point.y=0;
    const q=proj(point),el=document.elementFromPoint(q.x,q.y);
    if(el!==renderer.domElement)throw Error('地図のクリックを遮る要素: '+el?.outerHTML.slice(0,120));
    return {x:q.x,y:q.y};
  },[x,y]);
}
async function tap(page,x,y){
  const q=await mapPoint(page,x,y);await page.mouse.click(q.x,q.y);
}

(async()=>{
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const capture=async name=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(out,'plan-queue-'+name+'.png')});
    console.log(name);
  };
  try{
    await page.evaluate(()=>{
      const companies=['infantry','vehicle','heavyInfantry','infantry'].map((kind,i)=>({
        id:'queue'+i,name:'第'+(i+1)+' 中隊',kind
      }));
      window.WOS_NO_NPC=true;
      WOS.start({op:'groundExercise2',groundOrg:{companies,battalions:[],brigades:[]}});
      if(talking)endTalk();if(deploying)endDeploy();
      setSpeed(0);hideHint();
      const units=fleets.filter(f=>f.team===0&&companies.some(c=>c.name===f.name));
      if(units.length!==4)throw Error('撮影用の4隊を置けませんでした');
      const line=[groundPoint(8,27),groundPoint(15,27)],forward=groundPoint(11,29);
      for(const {f,dest} of groundPlanSlots(units,line,groundPlanSide(line,forward))){
        f.pos.copy(dest);f.pos.y=groundUnitHeight(f);f.post.copy(f.pos);f.stance='evade';
      }
      setSel(units);groundPlanToggle('deploy');groundPlanTap(line[0]);groundPlanTap(line[1]);groundPlanTap(forward);
      for(let i=0;i<30&&units.some(f=>f.order);i++)step(.05);
      window.queueDemo=units[0].groundFrontOf;
      const brief=document.querySelector('[data-tab="brief"]');
      if(brief.getAttribute('aria-expanded')==='true')brief.click();
      const center=groundPoint(11.5,29.6);
      camAnim=null;controls.target.copy(center);
      camera.position.set(center.x,center.y+41,center.z+20);camera.lookAt(center);controls.update();groundDraw();
    });
    await page.locator('#groundPlan').click();
    await tap(page,8.5,30.5);await tap(page,14.5,30.5);
    const side=await mapPoint(page,11.5,29.4);
    await page.mouse.move(side.x,side.y);
    await page.waitForFunction(()=>groundLinePts&&groundPlanInputSide(groundLinePts,groundLinePointer)&&!window.queueDemo.plan);
    await capture('choose-side');

    await page.mouse.click(side.x,side.y);
    await page.locator('#groundPlan').click();
    await tap(page,8.5,32.5);await tap(page,14.5,32.5);await tap(page,11.5,33.5);
    assert.deepEqual(await page.evaluate(()=>{
      const front=window.queueDemo;
      return [front.nextPlans.length,groundPlanArrows(front).length,!!front.advance];
    }),[1,4,false]);
    await capture('next');

    await page.locator('#groundExecute').click();
    const detour=await page.evaluate(()=>{
      const front=window.queueDemo,origin=front.members[0].pos.clone();
      for(let i=0;i<400&&groundPlanDistance(origin,front.members[0].pos)<.85*GROUND_SCALE;i++)step(.05);
      groundDraw();
      return {units:front.advance?.detouring.size,moving:groundPlanVisual.meshes.moving.visible,
        arrows:groundPlanArrows(front).length,moved:groundPlanDistance(origin,front.members[0].pos)/GROUND_SCALE};
    });
    assert.equal(detour.units,4);assert.equal(detour.moving,false);assert.equal(detour.arrows,4);assert(detour.moved>=.85);
    await capture('detour');
    console.log(JSON.stringify(detour));
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
