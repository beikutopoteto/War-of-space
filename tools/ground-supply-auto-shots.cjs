/* node tools/ground-supply-auto-shots.cjs。自動分配・集中・補給切れを撮影し、同じ残量と消費の2大隊を1回比較する。 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');

async function main(){
  const {browser,page,errors}=await openGame({width:1600,height:900});
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const shot=async name=>{
    await settle();
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(out,`ground-supply-auto-${name}.png`)});
  };
  try{
    await page.evaluate(()=>{
      WOS.start({op:'groundExercise2'});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();
      const add=(kind,name)=>{
        const spec=groundUnitSpec({name,kind,at:[15,26],band:'ground'}),f=makeFleet(0,spec);
        fleets.push(f);groundInitUnit(f);
        f.companyId='供給比較'+f.id;groundOrg.companies.push({id:f.companyId,name,kind});
        return f;
      };
      const a=fleets.find(f=>f.team===0&&f.groundKind==='infantry'&&!f.embarked);
      const b=fleets.find(f=>f.team===0&&f.groundKind==='heavyInfantry');
      if(!a||!b)throw new Error('比較用の部隊が揃わない');
      const c=add(a.groundKind,'第11 強化歩兵中隊'),d=add(b.groundKind,'第12 重強化歩兵中隊'),truck=add('supply','第13 補給中隊');
      for(const f of fleets){
        groundClearOrders(f);f.stance='evade';
        if(!f.embarked)f.pos.copy(groundPoint(f.team?40:7,33));
      }
      [[truck,15.7,26.4],[a,14.5,26],[b,17.3,26],[c,14.5,23],[d,17.3,23]].forEach(([f,x,y])=>{
        f.pos.copy(groundPoint(x,y));f.pos.y=groundUnitHeight(f);
        const at=groundSupplyAt(f);
        if(at.site||at.edge)throw new Error('比較地点が拠点か道路に重なっている');
        f.groundSupply=f===truck?groundSupplyUnitMax(f):70;
        f.groundMorale=groundMoraleUnitMax(f);
      });
      groundOrg.battalions=[
        {id:'photoWith',name:'第1 大隊',companies:[a,b,truck].map(f=>f.companyId),open:true},
        {id:'photoWithout',name:'第2 大隊',companies:[c,d].map(f=>f.companyId),open:true}
      ];
      groundOrg.brigades=[];
      buildRoster();select(truck);
      document.getElementById('groundSupplyStatus').parentElement.open=true;
      camAnim=null;const at=groundPoint(16,26);
      controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(0,31,22));
      camera.lookAt(at);controls.update();camera.updateMatrixWorld(true);
      window.supplyPhoto={truck,withStock:[a,b],withoutStock:[c,d]};
      step(.05);groundDraw();groundHud();updateRoster();
      if(truck.groundSupplyCount!==2||![a,b].every(f=>groundSupplyLinks.has(f)))throw new Error('自動分配の2本の線が出ない');
    });
    await shot('distribution');

    const measurement=await page.evaluate(()=>{
      const {truck,withStock,withoutStock}=supplyPhoto,units=[...withStock,...withoutStock];
      const start=gameSec,subHalf=new Map(),dt=.05/groundRuleSet().movement.timeScale;
      for(let i=0;i<800;i++){
        if(i%5===0)for(const f of units)groundSupplyShot(f);
        step(dt);
        for(const f of units)if(f.groundSupply<groundSupplyUnitMax(f)/2&&!subHalf.has(f))subHalf.set(f,gameSec-start);
      }
      const stats=list=>({lastSupply:list.map(f=>+f.groundSupply.toFixed(2)),belowHalfAt:list.map(f=>subHalf.has(f)?+subHalf.get(f).toFixed(2):null)});
      return {seconds:+(gameSec-start).toFixed(2),withStock:stats(withStock),withoutStock:stats(withoutStock),delivered:+truck.groundSupplyGiven.toFixed(2)};
    });
    assert.equal(measurement.seconds,40);
    assert.ok(measurement.withStock.lastSupply.every((v,i)=>v>measurement.withoutStock.lastSupply[i]));
    assert.ok(measurement.withStock.belowHalfAt.every((v,i)=>v>measurement.withoutStock.belowHalfAt[i]||v===null&&measurement.withoutStock.belowHalfAt[i]!==null));
    console.log(JSON.stringify(measurement));

    await page.getByRole('button',{name:'補給',exact:true}).click();
    await page.evaluate(()=>{supplyPhoto.withStock[0].el.dataset.supplyFocusPhoto='true';});
    await page.locator('[data-supply-focus-photo] .mk2').click();
    await page.evaluate(()=>{
      const {truck,withStock}=supplyPhoto;
      if(truck.groundGiving!==withStock[0])throw new Error('補給ボタンから集中先を選べない');
      step(.05);groundDraw();groundHud();
    });
    await shot('focus');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      const {truck}=supplyPhoto;
      if(truck.groundGiving)throw new Error('Escで集中補給が終わらない');
      truck.groundSupply=0;step(.05);groundDraw();groundHud();
      if(truck.groundSupplyTrip?.phase!=='out'||!truck.order?.path)throw new Error('補給切れで拠点へ戻らない');
    });
    await shot('return');
    assert.deepEqual(errors,[]);
  }finally{
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
