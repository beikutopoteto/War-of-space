/* #498 の操作と写真。node tools/ground-plan-ui-shots.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');

const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));

async function frontPoint(page,name){
  return page.evaluate(name=>{
    const front=window.planDemo[name];
    const line=groundPlanLine(front.pts);
    for(const fraction of [.15,.85,.32,.68,0,1,.05,.95]){
      const q=groundEditProject(groundPlanAt(line,line.len*fraction));
      for(const [dx,dy] of [[0,0],[0,8],[0,-8],[0,12],[0,-12],[8,0],[-8,0]]){
        const x=q.x+dx,y=q.z+dy;
        if(document.elementFromPoint(x,y)!==renderer.domElement)continue;
        const hit=groundEditPick(x,y);
        if(hit?.kind==='front'&&hit.front===front)return {x,y};
      }
    }
    throw Error('前線をクリックできる位置がありません');
  },name);
}

(async()=>{
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  try{
    const capture=async name=>{
      await frame(page);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(out,'plan-ui-'+name+'.png')});
      assert.deepEqual(errors,[]);
      console.log('plan-ui-'+name+'.png');
    };
    await page.evaluate(()=>{
      const companies=['infantry','vehicle','heavyInfantry','artillery','infantry','vehicle'].map((kind,i)=>({
        id:'plan'+i,name:'第'+(i+1)+' 中隊',kind
      }));
      const battalions=[
        {id:'plan-a',name:'第1 混成大隊',companies:companies.slice(0,4).map(c=>c.id)},
        {id:'plan-b',name:'第2 戦車大隊',companies:companies.slice(4).map(c=>c.id)}
      ];
      window.WOS_NO_NPC=true;
      WOS.start({op:'groundExercise2',groundOrg:{companies,battalions,brigades:[]}});
      if(talking)endTalk();
      if(deploying)endDeploy();
      setSpeed(0);hideHint();
      groundPlanSetColor('battalions',groundOrg.battalions[0],'#72d6a3');
      groundPlanSetColor('battalions',groundOrg.battalions[1],'#f08fb6');
      buildRoster();updateRoster();
      const units=companies.map(c=>fleets.find(f=>f.companyId===c.id&&f.team===0));
      for(const f of fleets)if(!units.includes(f)){f.alive=false;f.el.remove();}
      const p=groundPoint;
      const draw=(mode,units,pts,front)=>{
        setSel(units);groundPlanToggle(mode);groundPlanLineDone(pts,null);groundPlanTap(front);
        if(groundWorkAiming)throw Error(groundPlanMessage);
      };
      const place=(units,y)=>{
        const pts=[p(8,y),p(14,y)],ahead=p(11,y+1);
        for(const {f,dest} of groundPlanSlots(units,pts,groundPlanSide(pts,ahead))){
          f.pos.copy(dest);f.pos.y=groundUnitHeight(f);f.post.copy(f.pos);f.stance='evade';
        }
        draw('deploy',units,pts,ahead);
        for(let i=0;i<100&&units.some(f=>f.order);i++)step(.05);
        return units[0].groundFrontOf;
      };
      const received=units.slice(0,4),moved=units.slice(4),target=place(received,28);
      draw('plan',received,[p(8,31),p(14,31)],p(11,32));
      const plan=target.plan;
      draw('plan',received,[p(8,33.5),p(14,33.5)],p(11,34.5));
      const next=target.nextPlans[0];
      if(groundPlanSummaryArrows(target).length!==2)throw Error('計画の矢印が2本ありません');
      window.planDemo={received,moved,target,plan,next,addSource(){
        this.source=place(moved,23);
        draw('plan',moved,[p(8,25),p(14,25)],p(11,26));
        setSel([]);groundDraw();
      }};
      setSel([]);
      const brief=document.querySelector('[data-tab="brief"]');
      if(brief.getAttribute('aria-expanded')==='true')brief.click();
      const center=p(11,28.5);
      camAnim=null;controls.enableDamping=false;controls.target.copy(center);
      camera.position.set(center.x,center.y+67,center.z+24);camera.lookAt(center);controls.update();groundDraw();
    });
    await page.locator('#hint').waitFor({state:'hidden'});
    await page.mouse.move(10,450);
    await capture('arrows');

    const panel=page.locator('#groundEditModes');
    const commandRow=page.locator('#groundCommandBar .command-row');
    assert.equal(await panel.isVisible(),false);
    const commandBounds=await commandRow.boundingBox();
    await page.locator('#groundEdit').click();
    await panel.waitFor({state:'visible'});
    const panelBounds=await panel.boundingBox();
    assert.ok(panelBounds.y+panelBounds.height<commandBounds.y);
    assert.deepEqual(await commandRow.boundingBox(),commandBounds);
    const tabs=panel.locator('button');
    assert.deepEqual(await tabs.allTextContents(),['編集','統合','削除']);
    assert.equal(await tabs.first().getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{
      const {target,received}=window.planDemo;
      const route=groundPlanArrows(target).find(a=>a.f===received[0]);
      const point=route.pts[0].clone().lerp(route.pts.at(-1),.55);
      point.x-=GROUND_SCALE*.45;
      if(!groundPlanViaAdd(received[0],point))throw Error(groundPlanMessage);
    });
    await page.mouse.move(10,450);
    await capture('edit');
    await page.keyboard.press('Escape');
    await panel.waitFor({state:'hidden'});
    await page.locator('#groundEdit').click();
    await panel.waitFor({state:'visible'});
    await page.evaluate(()=>window.planDemo.addSource());
    await page.locator('#groundEdit').click();
    await tabs.nth(1).click();
    await frame(page);
    const source=await frontPoint(page,'source');
    await page.mouse.click(source.x,source.y);
    await page.mouse.move(10,450);
    assert.equal(await page.evaluate(()=>groundEditMergeFrom===window.planDemo.source),true);
    await capture('merge-before');

    const target=await frontPoint(page,'target');
    await page.mouse.click(target.x,target.y);
    const merged=await page.evaluate(()=>{
      const {target,source,plan,next}=window.planDemo;
      const ok=!groundFronts.includes(source)&&target.members.length===6&&target.plan===plan&&target.nextPlans[0]===next;
      if(!ok)return false;
      for(let i=0;i<1500&&target.members.some(f=>f.order);i++)step(.05);
      groundDraw();
      return true;
    });
    assert.equal(merged,true);
    await page.mouse.move(10,450);
    await capture('merge-after');

    await page.evaluate(()=>{
      const {target}=window.planDemo,enemy=fleets.find(f=>f.team===1&&f.groundKind==='infantry');
      enemy.alive=true;enemy.pos.copy(groundPoint(11,27.5));
      if(!groundFrontBreach(target,[enemy]))throw Error('撮影用の前線で追撃命令が出ませんでした');
      const unit=target.members.find(f=>f.groundFrontEngagement);
      window.planDemo.recallUnit=unit;
      window.planDemo.recallHome=unit.groundFrontEngagement.home.dest;
      select(unit);
    });
    await page.getByRole('button',{name:'持ち場へ戻る',exact:true}).click();
    assert.equal(await page.evaluate(()=>{
      const {recallUnit,recallHome}=window.planDemo;
      return recallUnit.order?.groundFrontReturn&&groundPlanDistance(recallUnit.order.dest,recallHome)<1e-6;
    }),true);

    await page.evaluate(()=>{select(null);groundPlanToggle('edit');groundEditSetMode('delete');});
    const tile=page.getByRole('button',{name:/^第5 中隊/});
    await tile.click();
    assert.equal(await page.evaluate(()=>!window.planDemo.moved[0].groundFrontOf&&window.planDemo.target.members.length===5),true);
    const line=await frontPoint(page,'target');
    await page.mouse.click(line.x,line.y);
    assert.equal(await page.evaluate(()=>groundFronts.length===0),true);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
