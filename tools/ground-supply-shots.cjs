/* Claude用: node tools/ground-supply-shots.cjs。1600×900、補給-a～i.png。
   --sim はブラウザ不要の固定場面。写真では実関数・実UIを使い、ページ例外は失敗。
   (a) 本営と網の接続/切断/半速 (b) 一覧（士気・補給のみ） (c) 敗走
   (d) 補給切れの航空帰投 (e) 補給部隊の分配 (f) 地図の名札の棒
   (g) 名札のマウス (h) 一覧の通常表示 (i) 一覧タイルのマウス。カメラ後は描画2回待つ。 */
const fs=require('fs'),path=require('path');
if(process.argv.includes('--sim')){
  const rows=require('../tests/ground-supply.cjs').nodeChecks(),bad=rows.filter(r=>!r.ok);
  console.log(`| 地上補給の固定場面 | ${rows.length-bad.length}/${rows.length} 成功 |`);
  if(bad.length)throw new Error(bad.map(r=>r.name).join('\n'));
}else (async()=>{
  const {openGame,ROOT}=require('./browser.cjs'),{browser,page,errors}=await openGame({width:1600,height:900});
  const fail=()=>{if(errors.length)throw new Error(errors.join('\n'));};
  const draw=async(x,y,dist)=>{
    await page.evaluate(({x,y,dist})=>{camAnim=null;const at=groundPoint(x,y);controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(0,dist,dist*.35));camera.lookAt(at);controls.update();groundUpdateSight();groundDraw();groundFogDraw(true);updateRoster();updateGoal();},{x,y,dist});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));fail();
  };
  const shot=async c=>{fail();await page.screenshot({path:path.join(ROOT,'.shots',`補給-${c}.png`)});fail();};
  const fresh=async()=>page.evaluate(()=>{
    reset({op:'groundExercise2'});setSpeed(0);endDeploy();
    fleets.forEach((f,i)=>{f.stance='evade';groundClearOrders(f);if(!f.embarked)f.pos.copy(groundPoint(5+i%8*2,33));});
    for(const s of groundSites)s.owner=s.id==='F'?1:0;
    groundSupplyBuild();for(const e of groundSupplyNet.edges)if(!e.circle)e.owner=0;
    groundSupplyRefresh();document.getElementById('groundSupply').parentElement.open=true;
  });
  try{
    fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
    await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS&&groundSupplyNet);fail();
    // a: 北の道路を競合、南西の支線を占領状態にする。色と接続表示はゲーム本体が描く。
    await fresh();await page.evaluate(()=>{
      const blue=fleets.find(f=>f.team===0&&f.groundKind==='infantry'),red=fleets.find(f=>f.team===1&&f.groundKind==='infantry');
      blue.pos.copy(groundPoint(17,29.714));red.pos.copy(blue.pos);groundSupplyRoadCapture(0);
      for(const e of groundSupplyNet.edges)if(e.x<12&&e.y>18&&e.y<20)e.owner=1;
      groundSupplyRefresh();select(blue);
      if(!groundSupplyNet.edges.some(e=>e.rates[0]===.5)||!groundSupplyNet.edges.some(e=>e.owner===0&&e.rates[0]===0))throw new Error('半速と切断の固定場面が成立しない');
    });await draw(22,23,200);await shot('a');
    // b: 実一覧。個数は×、耐久棒なし。航空には補給のみ。
    await fresh();await page.evaluate(()=>{
      for(const f of fleets){if(Number.isFinite(f.groundSupply))f.groundSupply=58;if(Number.isFinite(f.groundMorale))f.groundMorale=72;}
      updateRoster();const row=fleets.find(f=>f.team===0&&f.groundKind==='infantry').btn,air=fleets.find(f=>f.team===0&&f.groundKind==='fighter').btn;
      if(row.querySelectorAll('.ground-track').length!==2||row.textContent.includes('%')||row.querySelector('.bar')||air.querySelector('[data-meter="groundMorale"]')||air.querySelectorAll('.ground-track').length!==1)throw new Error('一覧の項目が違う');
    });await draw(23.5,29,110);await shot('b');
    // c: 敗走の実命令と実移動。味方を1kmより遠くに置いて逃走を撮る。
    await fresh();await page.evaluate(()=>{
      const f=fleets.find(f=>f.team===0&&f.groundKind==='infantry'),ally=fleets.find(f=>f.team===0&&f.groundKind==='vehicle');
      f.pos.copy(groundPoint(14,25));ally.pos.copy(groundPoint(18,25));f.groundMorale=0;groundRoutStart(f);groundRoutStep(f,.05);select(f);
      const dest=f.order?.dest.clone();groupOrder({type:'move',dest:groundPoint(10,25)});
      if(f.groundRout!=='routing'||!dest||!f.order.dest.equals(dest))throw new Error('敗走または命令拒否を確認できない');
      step(.25);groundDraw();
    });await draw(16,25,65);await shot('c');
    // d: 補給0の航空は自動で基地へ。帰投中を写し、その後基地滞在と復帰も検証。
    await fresh();await page.evaluate(()=>{
      const f=fleets.find(f=>f.team===0&&f.groundKind==='fighter');f.pos.copy(groundPoint(14,26));f.groundSupply=0;select(f);step(.05);
      if(f.groundAirState!=='out'||!f.order?.path)throw new Error('航空が帰投しない');
    });await draw(18,28,95);await shot('d');
    await page.evaluate(()=>{
      const f=selected,path=f.order.path,limit=path.L/(f.speed*.7)+30;for(let t=0;t<limit&&f.groundAirState!=='base';t+=.05)step(.05);
      if(f.groundAirState!=='base')throw new Error('航空が基地に着かない');
      for(let t=0;t<20.1;t+=.05)step(.05);if(f.groundSupply<99||f.groundAirState==='base')throw new Error('航空が補給して戻らない');
    });
    // e: 補給ボタンと味方の実クリック。札が重ならないよう対象外の部隊を遠くへ。
    await fresh();await page.evaluate(()=>{
      const spec={...op.quick[0],name:'第13 補給中隊',groundKind:'supply'},f=makeFleet(0,spec);fleets.push(f);f.band='ground';f.pos.copy(groundPoint(15.7,26));f.pos.y=groundUnitHeight(f);groundSupplyInitUnit(f);
      const src=shipMeshes[0].cv,mat=src.material.clone();mat.userData.baseOpacity=1;f.groundModel=new THREE.Group();const body=new THREE.Mesh(src.geometry.clone(),mat);body.scale.setScalar(SHIP_SIZE.cv);f.groundModel.add(body);groundVisuals.add(f.groundModel);
      f.companyId='shotSupply';groundOrg.companies.push({id:f.companyId,name:f.name,kind:'supply'});buildRoster();
      const t=fleets.find(t=>t.team===0&&t.groundKind==='infantry');t.pos.copy(groundPoint(15,26));t.groundSupply=25;select(f);
    });await draw(15.3,26,25);await page.click('#groundSupply');
    const p=await page.evaluate(()=>{
      const t=fleets.find(t=>t.team===0&&t.groundKind==='infantry'),p=proj(t.pos),el=document.elementFromPoint(p.x,p.y);
      if(pick(p.x,p.y).best!==t||!(el===renderer.domElement||t.el.contains(el)))throw new Error('補給先のクリック位置に別の名札が重なっている');return p;
    });await page.mouse.click(p.x,p.y);
    await page.evaluate(()=>{
      const f=selected,t=f.groundGiving;if(!t)throw new Error('補給先をクリックできない');const a=f.groundSupply,b=t.groundSupply;
      for(let i=0;i<40;i++)step(.05);if(!(f.groundSupply<a&&t.groundSupply>b&&Math.abs(a-f.groundSupply-(t.groundSupply-b))<1e-6))throw new Error('分配の収支が一致しない');
    });await draw(15.3,26,25);await shot('e');
    // f～i: テストと同じ部隊・残量で、通常の棒とマウス時の数値を撮る。
    await page.mouse.move(5,450);
    const ids=await page.evaluate(require('../tests/ground-supply.cjs').setupSupplyUIScene);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await shot('f');
    const tag=await page.evaluate(id=>{const r=fleets.find(f=>f.id===id).el.querySelector('.mk2').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};},ids.land);
    await page.mouse.move(tag.x,tag.y);
    if(!await page.evaluate(id=>{const nm=fleets.find(f=>f.id===id).el.querySelector('.nm');return getComputedStyle(nm).display!=='none'&&nm.textContent.includes('士気 72%　補給 24%');},ids.land))throw new Error('名札のマウスで数値が出ない');
    await shot('g');
    await page.mouse.move(5,450);await shot('h');
    await page.hover('#'+ids.tile);
    if(!await page.evaluate(()=>!rosterTip.hidden&&rosterTip.textContent.includes('士気 72%　補給 24%')))throw new Error('タイルのマウスで数値が出ない');
    await shot('i');
    console.log('| 写真 | .shots/補給-a.png ～ 補給-i.png（9枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
