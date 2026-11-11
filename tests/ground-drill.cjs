/* node tests/ground-drill.cjs: ブラウザ不要で本物の地形・経路・射撃・搭乗・架橋・上陸を早送り。
   npm test では同じ案内順をブラウザでも実行し、キャンペーンの解放と固定編成を確認する。 */
const {createGroundContext}=require('./ground-landing.cjs');
function drillAction(){
  const r=groundDrillRow(),f=groundDrillUnit(r.actor),m=r.marks[0],p=m&&new THREE.Vector3(m.pos[0],groundHeight(...m.pos),m.pos[1]);
  select(f);
  if(r.condition==='groundSupplyDeploy'){groundSupplyPlace([f],f.pos.clone());endDeploy();return true;}
  if(r.condition==='groundSupplyGive')return groundSupplyCommand([f],groundDrillUnit(r.target));
  if(r.condition==='groundSelect'||r.condition==='groundAutoAA')return true;
  if(['groundMove','groundCapture','groundSight','groundSupplyRoad','groundSupplyRecapture','groundSupplyHalf','groundSupplyRout','groundSupplyRally'].includes(r.condition)){order(f,{type:'move',dest:p});return !!f.order;}
  if(r.condition==='groundAttack'){const t=groundDrillUnit(r.target);if(!shown(t))throw new Error('案内の攻撃対象が未発見: '+r.target);order(f,{type:'attack',target:t});return true;}
  if(r.condition==='groundBand')return groundSetBand([f],r.band);
  if(r.condition==='groundStrike'){const before=groundStrikes.length;if(!groundStrikeAiming)groundStrikeToggle();groundAreaTap(p);if(groundAreaAim?.stage==='end')groundAreaTap(p);groundAreaTap(p);return groundStrikes.length>before;}
  if(r.condition==='groundBoard')return groundBoardCommand([f],groundDrillUnit(r.target));
  if(r.condition==='groundUnload')return groundUnloadCommand([f])>0;
  if(r.condition==='groundBridge')return !!groundBridgeCommand([f],p);
  if(r.condition==='groundLand')return groundLandCommand([f])>0;
  throw new Error('未対応の案内 '+r.condition);
}
function drillAdvance(){
  const before=tutorial.step,r=groundDrillRow(),f=groundDrillUnit(r.actor);
  // 経路のコストと実速から上限を決める。占拠・架橋・射撃の待ち時間を別に取る。
  const travel=f.order?.path?f.order.path.cost*WOS_TERRAIN[op.ground].meta.cellKm*GROUND_SCALE/f.speed:0;
  const limit=travel+120;
  for(let i=0;i<Math.ceil(limit/.05)&&!over&&tutorial.step===before;i++){
    const positions=fleets.filter(f=>f.team===1).map(f=>[f,f.pos.clone()]);step(.05);
    // 次の手順を準備する明示的な配置替えは除く。各手順の実時間中は一切動かない。
    if(tutorial.step===before)for(const [f,p] of positions)if(!f.pos.equals(p))globalThis.npcTutorialMotion=(globalThis.npcTutorialMotion||0)+1;
  }
  if(!over&&tutorial.step===before)throw new Error('手順が進まない: '+r.name+' '+JSON.stringify({pos:f.pos,order:f.order?.type,visible:r.target&&shown(groundDrillUnit(r.target)),message:groundTransportMessage}));
  if(over&&outcome!==true)throw new Error('案内どおりの操作で敗北: '+r.name);
  return tutorial.times[tutorial.times.length-1];
}
function createDrillContext(guided=true){
  const {ctx,read,run}=createGroundContext(),THREE=ctx.THREE;
  const context2d=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:()=>{}});
  const element=()=>{const children={};return {style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},append(){},remove(){},addEventListener(){},setAttribute(){},getContext:()=>context2d,querySelector:k=>children[k]||(children[k]=element())};};
  Object.assign(ctx,{document:{getElementById:()=>element(),querySelectorAll:()=>[],createElement:element,body:element()},renderer:{domElement:element(),shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}},addEventListener(){},scene:new THREE.Scene(),labelsEl:element(),grid:{},starField:{},skyObj:{},fieldRocks:{},debrisObj:{},cloudObj:{},farPlanet:{},ambient:new THREE.AmbientLight(),sun:new THREE.DirectionalLight(),rim:{},flyTo(){},proj:()=>({x:0,y:0,z:0}),deploying:false,deployZone:{visible:false},deployEl:element(),autoMode:false,endDeploy:()=>{ctx.deploying=false;},selected:null,orderTargets:()=>ctx.selected?[ctx.selected]:[],select:f=>{ctx.selected=f;},shown:f=>f.team===0||run('groundSeenBy')(0,f),end:win=>{ctx.over=true;ctx.outcome=win;}});
  const state=read('battle/state.js'),sim=read('battle/sim.js');
  run(sim.slice(sim.indexOf('function step(dt){'),sim.indexOf('  gameSec+=dt; if(tutorialHolding())'))+'}');
  run(state.slice(state.indexOf('const UNDO_MAX='),state.indexOf('function openSelectedRoster(')));
  run(sim.slice(sim.indexOf('const MAX_WAYPOINTS='),sim.indexOf('/* advance along the path;')));
  run(read('battle/tutorial.js'));run(read('battle/ground-drill.js'));
  run('tutorialRender=()=>{};groundHud=()=>{};');
  run(`op=WOS_DATA.operations.find(o=>o.id==='baikonur');
    if(${guided})op={...op,...op.groundTutorial,enemies:(op.groundTutorial.enemies||op.enemies).map(f=>({...f,stance:'evade'}))};groundSetup(op.ground);
    fleets=[...op.quick.map(o=>makeFleet(0,o)),...op.enemies.map(o=>makeFleet(1,o))];groundSeaDeploy();
    globalThis.shipMeshes=[0,1].map(()=>Object.fromEntries(['cv','dd','cl'].map(t=>[t,new THREE.Mesh(shapeGeo(t),new THREE.MeshStandardMaterial())])));
    globalThis.SHIP_SIZE=Object.fromEntries(WOS_DATA.ships.map(s=>[s.id,s.scale*1.2]));
    groundSightInit=groundDraw=()=>{};groundInit();tutorialInit({tutorial:${guided}});`);
  run('globalThis.drillAction='+drillAction.toString()+';globalThis.drillAdvance='+drillAdvance.toString());
  return {ctx,run};
}
// これらは画面遷移しないボタン。実クリック後は下の状態検証で完了を確かめる。
async function performDrillAction(page){
  const r=await page.evaluate(()=>{const r=groundDrillRow();return {condition:r.condition,actor:r.actor,band:r.band,selected:orderTargets().length===1&&orderTargets()[0].name===r.actor};});
  if(!r.selected)await page.locator('#roster').getByRole('button',{name:new RegExp('^'+r.actor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'( /|$)')}).click({noWaitAfter:true});
  if(r.condition==='groundSupplyDeploy'){await page.evaluate(()=>drillAction());return true;}
  if(r.condition==='groundSupplyGive'){await page.click('#groundSupply',{noWaitAfter:true});return page.evaluate(()=>groundSupplyCommand(orderTargets(),groundDrillUnit(groundDrillRow().target)));}
  if(r.condition==='groundSelect'||r.condition==='groundAutoAA')return true;
  if(r.condition==='groundBand'){
    await page.click(`#groundCommand [data-band="${r.band}"]`,{noWaitAfter:true});
    return page.evaluate(()=>!!tutorial.ground.issued);
  }
  if(r.condition==='groundUnload'){
    await page.click('#groundUnload',{noWaitAfter:true});return page.evaluate(()=>!!tutorial.ground.unloaded);
  }
  if(r.condition==='groundLand'){
    await page.click('#groundLand',{noWaitAfter:true});return page.evaluate(()=>!!tutorial.ground.passengers?.length);
  }
  if(r.condition==='groundStrike')await page.click('#groundStrike',{noWaitAfter:true});
  if(r.condition==='groundBridge')await page.click('#groundBridge',{noWaitAfter:true});
  if(r.condition==='groundBoard')await page.click('#groundBoard',{noWaitAfter:true});
  // 地図上の指定は実命令関数へ渡す。部隊の名札の重なりや壁時計に頼らない。
  return page.evaluate(()=>drillAction());
}
function seedDrillCampaign(includeLast=true){
  WOS.openMenu();
  const debug=document.getElementById('dbgT');if(debug.getAttribute('aria-expanded')!=='true')debug.click();
  document.querySelector('[data-dbga="skip"]').click(); // 通常の保存処理で初期編成も用意する。
  const s=JSON.parse(localStorage.getItem('wos.save.v1'));
  s.prog.tutorialCleared=true;s.prog.prepDone=true;delete s.prog.flags.groundOpen; // デバッグのスキップが開ける鍵は外して、通常の解放順を確かめる
  s.prog.cleared=WOS_DATA.operations.filter(o=>o.chapter&&(includeLast||o.id!=='denaliBreak')).map(o=>o.id);
  s.sortieMenu={closed:{},seen:[]};
  s.groundOrg.companies.push({id:'drill-save-was',name:'保存中の W.A.S.',kind:'was'});
  localStorage.setItem('wos.save.v1',JSON.stringify(s));
}
async function checkDrillLabels(page,check,onSelected=async()=>{}){
  // 実クリックする2隊を離し、他の名札を遠ざける。終了後に元の位置へ戻す。
  await page.evaluate(()=>{
    select(null);camAnim=null;const a=groundDrillUnit(op.tutorial[0].actor),b=groundDrillUnit(op.tutorial.find(r=>r.target==='仮想敵 歩兵').actor);
    window.drillLabelPositions=fleets.map(f=>({f,pos:f.pos.clone()}));
    fleets.forEach((f,i)=>{if(f!==a&&f!==b&&!f.embarked)f.pos.copy(groundPoint(40+i%4,33));});
    b.pos.copy(groundPoint(13,27));
    a.el.dataset.drillLabel='normal';b.el.dataset.drillLabel='pick';
    controls.target.copy(a.pos).add(b.pos).multiplyScalar(.5);camera.position.copy(controls.target).add(new THREE.Vector3(0,80,32));camera.lookAt(controls.target);controls.update();
  });
  const drawn=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const normal=page.locator('[data-drill-label="normal"]'),picked=page.locator('[data-drill-label="pick"]');
  const checkStill=async()=>{
    const result=await page.evaluate(async()=>{
      const marks=[...document.querySelectorAll('[data-drill-label] .mk2')];
      const rects=()=>marks.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
      const before=rects();let moved=0,resized=0;
      for(let i=0;i<8;i++){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        rects().forEach((r,k)=>{if(r[0]!==before[k][0]||r[1]!==before[k][1])moved++;if(r[2]!==before[k][2]||r[3]!==before[k][3])resized++;});
      }
      return {paused:speed===0,moved,resized};
    });
    check(result.paused&&result.moved===0&&result.resized===0,`地上名札: 停止中8フレームで位置・寸法が不変 ${JSON.stringify(result)}`);
  };
  await page.mouse.move(1590,10);await drawn();
  await checkStill();
  check(await normal.locator('.nm').isHidden()&&await picked.locator('.nm').isHidden(),'地上名札: ふだんは名前を隠す');
  check(await normal.locator('.mk2 em').textContent()==='×1','地上名札: ふだんは兵科印と数だけ');
  check(await picked.locator('.mk2').evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit);}),'地上名札: クリック位置に他の名札が重ならない');
  await picked.locator('.mk2').click();await page.mouse.move(1590,10);await drawn();
  await checkStill(); // 選択の輪を出した状態でも静止する。
  check(await picked.locator('.nm').isVisible()&&await normal.locator('.nm').isHidden(),'地上名札: 実クリックで選んだ隊だけ名前を表示');
  check(await page.evaluate(()=>{
    const f=selected,r=f.groundSelection;if(!r?.visible)return false;
    const p=r.geometry.attributes.position;
    return Array.from({length:p.count},(_,i)=>Math.abs(p.getY(i)-groundSurfaceHeight(r.position.x+p.getX(i),r.position.z+p.getZ(i))-.15)<1e-5).every(Boolean)&&fleets.filter(t=>t!==f).every(t=>!t.groundSelection.visible);
  }),'地上選択: 選んだ隊の輪だけ表示し各頂点が地表高に一致');
  await onSelected();
  await page.evaluate(()=>select(null));await normal.locator('.mk2').hover();await drawn();
  check(await normal.locator('.nm').isVisible(),'地上名札: マウスを載せると名前を表示');
  await page.mouse.move(1590,10);await page.evaluate(()=>{const f=fleets.find(f=>f.el.dataset.drillLabel==='normal');f.ace=true;updateFleetLabel(f,false,'');});await drawn();
  check(await normal.locator('.nm').isVisible(),'地上名札: 名前付きの隊は常に表示');
  await page.evaluate(()=>{const f=fleets.find(f=>f.el.dataset.drillLabel==='normal');delete f.ace;updateFleetLabel(f,false,'');select(null);
    for(const {f,pos} of window.drillLabelPositions)f.pos.copy(pos);delete window.drillLabelPositions;groundDraw();
  });await drawn();
}
async function checkGroundDrill(page,check){
  const {runMenuChecks,openSortieMenu,checkSortieSections,checkDebugGroundUnlocks}=require('./ground-drill-menu.cjs');
  runMenuChecks();
  const campaign=await page.evaluate(()=>localStorage.getItem('wos.save.v1'));
  const menu=()=>openSortieMenu(page,{reload:true});
  try{
    await checkDebugGroundUnlocks(page,check);
    await page.evaluate(seedDrillCampaign,false);await menu();
    check(await page.locator('[data-op="tutorial2"]').isDisabled(),'チュートリアル2: 第一章最終節の前は鍵付き');
    check(await page.locator('[data-op="baikonur"]').isDisabled(),'バイコヌール演習: 第一章最終節の前は鍵付き');
    await checkSortieSections(page,check,menu);
    check(await page.locator('[data-op="tutorial2"]').isEnabled()&&await page.locator('[data-op="baikonur"]').isDisabled(),'第一章後はチュートリアル2だけ解放');
    for(const [id,name] of [['tutorial2','チュートリアル2'],['baikonur','バイコヌール演習']]){
      check(await page.locator(`[data-op="${id}"]`).evaluate((e,name)=>e.textContent.includes(name)&&e.closest('[data-section]')?.dataset.section==='演習',name),name+': 演習欄で別々に表示');
    }
    await page.click('[data-op="tutorial2"]');
    const funds=await page.evaluate(()=>JSON.parse(localStorage.getItem('wos.save.v1')).prog.funds);
    await page.click('#goBattle');await page.evaluate(()=>{if(talking)endTalk();setSpeed(0);});
    check(await page.evaluate(()=>op.id==='baikonur'&&op.ground==='exercise2'&&op.name==='チュートリアル2'&&tutorialActive()&&!fleets.some(f=>f.team===0&&f.groundKind==='was')),'チュートリアル2: 基本演習を案内付き・固定配備で開始');
    await page.evaluate(()=>{window.WOS_OPT.story=false;tutorialTalk();});
    check(await page.locator('#talkText').isVisible(),'チュートリアル2: ストーリー切でも案内を表示');
    await checkDrillLabels(page,check);
    await page.evaluate('window.drillAction='+drillAction.toString());await page.evaluate('window.drillAdvance='+drillAdvance.toString());
    await page.evaluate(()=>{window.tut2Hits=0;const realDamage=damage;damage=(t,n,src,...rest)=>{if(src?.team===1&&n>0)tut2Hits++;return realDamage(t,n,src,...rest);};});
    const times=[];
    for(let i=0;i<(await page.evaluate(()=>op.tutorial.length));i++){
      check(await page.evaluate(()=>{const before=tutorial.step;step(.05);return tutorial.step===before&&!over;}),'チュートリアル2: 無操作で手順'+(i+1)+'を飛ばさない');
      if(!await performDrillAction(page))throw new Error('案内の操作が失敗: '+i);
      times.push(await page.evaluate(()=>drillAdvance()));
    }
    check(await page.evaluate(()=>over&&outcome===true&&tutorial.complete&&tut2Hits===0&&tutorial.times.length===26&&!(globalThis.npcTutorialMotion||0)&&Object.keys(npcDebug()).length===0),'チュートリアル2: 全26手順勝利・敵打撃0・敵移動0・NPC無効');
    await page.waitForSelector('#result:not([hidden])');
    check(await page.evaluate(base=>{const s=JSON.parse(localStorage.getItem('wos.save.v1'));return s.prog.funds===base+100&&s.prog.cleared.includes('tutorial2')&&!s.prog.cleared.includes('baikonur')&&document.getElementById('result').textContent.includes('資金 +100');},funds),'チュートリアル2: 初回100・専用クリアを保存');
    await page.evaluate(()=>{reset({op:'baikonur',tutorial:true});if(talking)endTalk();setSpeed(0);});
    await page.click('#talkSkip');
    check(await page.evaluate(()=>!tutorialActive()&&tutorial.skipped&&tutorialMarks.length===0),'チュートリアル2: とばすで案内終了');
    await page.evaluate(()=>{order(fleets[0],{type:'move',dest:groundSites[0].pos.clone()});for(let i=0;i<2400&&!over;i++)step(.05);});
    check(await page.evaluate(()=>over&&outcome===true&&tut2Hits===0),'チュートリアル2: とばした後も敵打撃0・占拠勝利');
    await page.waitForSelector('#result:not([hidden])');
    await openSortieMenu(page);
    check(await page.locator('[data-op="baikonur"]').isEnabled(),'バイコヌール演習: チュートリアル2後に解放');
    await page.click('[data-op="baikonur"]');
    check(await page.locator('#goQuick').isVisible(),'バイコヌール演習: クイック出撃あり');
    const beforeQuick=await page.evaluate(()=>localStorage.getItem('wos.save.v1'));
    await page.click('#goQuick');await page.evaluate(()=>{if(talking)endTalk();setSpeed(0);endDeploy();});
    check(await page.evaluate(()=>!tutorial&&!op.groundDrill&&op.ground==='baikonur2'&&groundSites.length===9&&fleets.filter(f=>f.team===1).length===10&&fleets.some(f=>f.team===0&&f.groundKind==='supply')&&fleets.some(f=>f.name==='第2 主力戦車中隊')),'バイコヌール演習: クイックは既定部隊・案内なし');
    check(await page.locator('#training').isHidden()&&await page.locator('#talkText').isHidden(),'バイコヌール演習: 案内のUIなし');
    await page.evaluate(()=>{
      window.baikonurHits=0;const realDamage=damage;damage=(t,n,src,...rest)=>{if(src?.team===1&&n>0)baikonurHits++;return realDamage(t,n,src,...rest);};
      const red=groundDrillUnit('仮想敵 歩兵'),blue=groundDrillUnit('第2 主力戦車中隊');blue.pos.copy(red.pos).add(new THREE.Vector3(1,0,0));groundUpdateSight();
      for(let i=0;i<60&&!over;i++)step(.05);
      groundSites.find(s=>s.id==='F').owner=0;step(.05);
    });
    check(await page.evaluate(()=>!tutorial&&baikonurHits>0&&over&&outcome===true),'バイコヌール演習: 敵が撃ち敵本営の占領で勝利');
    await page.waitForSelector('#result:not([hidden])');
    check(await page.evaluate(before=>localStorage.getItem('wos.save.v1')===before,beforeQuick),'バイコヌール演習: クイックは報酬・クリアを記録しない');
    // 古い保存は tutorial2 だけに移し、二重報酬を出さない。
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wos.save.v1'));s.prog.cleared=s.prog.cleared.filter(id=>id!=='tutorial2');s.prog.cleared.push('ch2drill');localStorage.setItem('wos.save.v1',JSON.stringify(s));});await menu();
    check(await page.locator('[data-op="tutorial2"] .op-status').textContent()==='クリア済み'&&await page.locator('[data-op="baikonur"]').isEnabled(),'旧 ch2drill 保存を移行して通常演習を解放');
    await page.click('[data-op="baikonur"]');await page.click('#goBattle');
    await page.evaluate(()=>{if(talking)endTalk();setSpeed(0);endDeploy();});
    check(await page.evaluate(()=>!tutorial&&fleets.some(f=>f.groundKind==='was')),'通常出撃は保存中の地上軍を使う');
    await page.evaluate(()=>{const s=groundSites.find(s=>s.id==='F');s.owner=0;step(.05);});
    await page.waitForSelector('#result:not([hidden])');
    check(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wos.save.v1'));return s.prog.cleared.includes('tutorial2')&&s.prog.cleared.includes('baikonur')&&!s.prog.cleared.includes('ch2drill')&&document.getElementById('result').textContent.includes('資金 +300');}),'通常演習: 別クリア・初回300を保存、移行済みidを永続化');
    await page.evaluate(()=>{reset({op:'baikonur',tutorial:true});fleets.filter(f=>f.team===0).forEach(f=>f.alive=false);step(.05);});
    check(await page.evaluate(()=>over&&outcome===false),'チュートリアル2: 全滅で敗北');
    await page.waitForSelector('#result:not([hidden])');
    await page.evaluate(()=>reset({op:'charybdis'}));
    check(await page.evaluate(()=>!tutorialActive()&&!groundSites.length),'再初期化で宇宙に復帰');
    return times;
  }finally{
    await page.evaluate(old=>{if(old===null)localStorage.removeItem('wos.save.v1');else localStorage.setItem('wos.save.v1',old);},campaign);
  }
}
function rallyChecks(){
  const {run}=createDrillContext(),assert=require('assert/strict');
  run(`tutorial.step=op.tutorial.findIndex(r=>r.condition==='groundSupplyRally');groundDrillEnter();
    globalThis.actor=groundDrillUnit('第11 補給訓練歩兵中隊');actor.groundRout=null;actor.groundMorale=80;actor.pos.copy(groundPoint(16,26));`);
  assert.equal(run("groundSupplyDrillTick(groundDrillRow(),actor,{issued:true})"),false,'領域外で回復しただけでは道の案内を完了しない');
  run('actor.pos.copy(groundSites.find(s=>s.owner===0).pos)');
  assert.equal(run("groundSupplyDrillTick(groundDrillRow(),actor,{issued:false})"),false,'移動の操作前に完了しない');
  assert.equal(run("groundSupplyDrillTick(groundDrillRow(),actor,{issued:true})"),true,'味方領域への移動と回復で完了する');
  return 3;
}
function runDrill(){
  const {run}=createDrillContext();
  const assert=require('assert/strict');
  const bg=require('fs').readFileSync(require('path').join(__dirname,'../prep-bg.js'),'utf8');
  assert.equal(run(`(()=>{${bg.slice(bg.indexOf('const DEG='),bg.indexOf('const cv='))}${bg.slice(bg.indexOf('function opW('),bg.indexOf('function dayOf('))}return opW({place:{body:'地球'}},0).every(Number.isFinite);})()`),true,'地球の作戦マーカーは有効な座標');
  assert.equal(run("WOS_DATA.operations.filter(o=>o.chapter&&!o.hidden).at(-1).id"),'denaliBreak');
  assert.equal(run("op.name==='チュートリアル2'&&!op.chapter&&op.requires==='denaliBreak'&&op.reward===100"),true,'チュートリアル2の名前・配置・解放・報酬');
  assert.equal(run("op.ground==='exercise2'&&op.tutorial.length===26&&op.groundHQ[0]==='B'&&op.groundSea[0].pos[0]===(17-24)*4&&op.view.max===350"),true,'案内の地形・本営・艦・カメラ・26手順は従来通り');
  assert.equal(run('fleets.some(f=>f.team===0&&f.groundKind===\'was\')'),false);
  assert.equal(run('groundBuildings.length>0&&groundForests.length>0'),true);
  assert.equal(run(`(()=>{const s=groundSites[0];s.owner=0;groundCaptureStep(.05);s.owner=null;return !over;})()`),true,'全占拠だけでは勝たない');
  assert.equal(run(`(()=>{const reds=fleets.filter(f=>f.team===1);reds.forEach(f=>f.alive=false);groundCaptureStep(.05);reds.forEach(f=>f.alive=true);return !over;})()`),true,'仮想敵全滅だけでは勝たない');
  assert.equal(run("!shown(groundDrillUnit('仮想敵 斥候'))"),true,'偵察対象は初めは未発見');
  assert.equal(run(`(()=>{const a=groundPoint(35,29),b=groundPoint(39,31),p=groundPath(a,b,'scout');return p&&p.L<Math.abs(b.x-a.x)+Math.abs(b.z-a.z)-1&&p.points.slice(1).some((q,i)=>Math.abs(q.x-p.points[i].x)>.01&&Math.abs(q.z-p.points[i].z)>.01);})()`),true,'開けた所は斜めの近道を使う');
  assert.equal(run(`(()=>{const f=fleets[0];groundSelectionDraw(f,true);const r=f.groundSelection,p=r.geometry.attributes.position;const ok=r.visible&&Array.from({length:p.count},(_,i)=>Math.abs(p.getY(i)-groundSurfaceHeight(f.pos.x+p.getX(i),f.pos.z+p.getZ(i))-.15)<1e-5).every(Boolean);groundSelectionDraw(f,false);return ok&&!r.visible;})()`),true,'輪が地表の起伏に沿い選択解除で消える');
  // 実 damage を数える。目標の選択だけでは反撃の証拠にしない。
  run(`globalThis.counterfire={early:0,late:0,damage:0};const realDamage=damage;
    damage=(t,amount,src,...rest)=>{const hp=t.hpPool;realDamage(t,amount,src,...rest);if(src?.team===1&&amount>0){counterfire[groundDrillRow()?.section>=6?'late':'early']++;counterfire.damage+=hp-t.hpPool;}};`);
  const times=[];
  for(let i=0;i<run('op.tutorial.length');i++){
    assert.equal(run('(()=>{const s=tutorial.step;step(0);return !over&&s===tutorial.step;})()'),true,'無操作で手順を飛ばさない');
    assert.equal(run('drillAction()'),true,'案内の操作を受理');
    const r=run('drillAdvance()');times.push(r);
  }
  assert.equal(run('over&&outcome===true&&tutorial.complete&&tutorial.times.length===op.tutorial.length'),true);
  assert.equal(run('!(globalThis.npcTutorialMotion||0)&&Object.keys(npcDebug()).length===0'),true,'全手順で敵移動0・NPC無効');
  assert.equal(run('counterfire.early===0&&counterfire.late===0&&counterfire.damage===0'),true,'全26手順で敵の打撃0');
  assert.equal(run('fleets.filter(f=>f.team===0&&f.alive).length'),14,'専用2隊を含む自軍14隊が残存');
  times.counterfire=run('counterfire');
  assert.equal(run('(()=>{over=false;fleets.filter(f=>f.team===0).forEach(f=>f.alive=false);groundCaptureStep(.05);return over&&outcome===false;})()'),true,'全滅で敗北');
  const skipped=createDrillContext();
  assert.equal(skipped.run(`(()=>{tutorial.skipped=true;tutorialRender();const f=fleets[0];order(f,{type:'move',dest:groundSites[0].pos.clone()});for(let i=0;i<2400&&!over;i++)step(.05);return !tutorialActive()&&over&&outcome===true;})()`),true,'案内をとばしても占拠で勝てる');
  const normal=createDrillContext(false);
  normal.run(`globalThis.enemyHits=0;const originalDamage=damage;damage=(t,n,src,...rest)=>{if(src?.team===1&&n>0)enemyHits++;return originalDamage(t,n,src,...rest);};
    const red=groundDrillUnit('仮想敵 歩兵'),blue=groundDrillUnit('第2 主力戦車中隊');blue.pos.copy(red.pos).add(new THREE.Vector3(1,0,0));groundUpdateSight();
    for(let i=0;i<60&&!over;i++)step(.05);
    groundSites.find(s=>s.id==='F').owner=0;step(.05);`);
  assert.equal(normal.run('!tutorial&&enemyHits>0&&over&&outcome===true'),true,'通常演習は案内なし・敵の実打撃あり・占拠で勝利');
  times.normal=normal.run('({hits:enemyHits,seconds:gameSec})');
  assert.equal(normal.run(`(()=>{over=false;outcome=null;groundSites.find(s=>s.id==='F').owner=1;fleets.filter(f=>f.team===1).forEach(f=>{f.alive=false;f.hpPool=0;});groundCaptureStep(.05);return over&&outcome===true;})()`),true,'敵全戦力撃破でも勝利');
  runPeaceChecks();
  return times;
}
function runPeaceChecks(){
  const assert=require('assert/strict'),peace=createDrillContext();
  peace.run(`globalThis.enemyAttempts=0;const original=damage;damage=(t,n,src,...rest)=>{if(src?.team===1&&n>0)enemyAttempts++;return original(t,n,src,...rest);};`);
  for(const skip of [false,true]){
    assert.equal(peace.run(`(()=>{tutorial.skipped=${skip};const red=fleets.find(f=>f.team===1),blue=fleets[0],at=red.pos.clone();
      blue.pos.copy(red.pos).add(new THREE.Vector3(1,0,0));groundUpdateSight();
      if(!groundSeenBy(1,blue)||groundDistanceTo(red,blue)>red.range||!groundLineOfSight(red,blue))throw new Error('射撃禁止を調べる場面が射程・視界外');
      red.stance='engage';red.fireTarget=blue;order(red,{type:'attack',target:blue});step(.05);
      const gun={...red,groundKind:'artillery',band:'ground',groundStrikeCooldown:0};
      const pending={source:gun,impact:blue.pos.clone(),radius:2,resolving:true};
      return !red.order&&!red.fireTarget&&red.pos.equals(at)&&!groundCanFire(red,blue)&&!groundStrikeLaunch(gun,blue.pos)&&!groundStrikeHits(pending,blue,gun)&&enemyAttempts===0;})()`),true,'射程・視界内でも敵の自発攻撃・明示攻撃・追撃・地点攻撃・残弾を禁止（とばす='+skip+'）');
  }
  return 2;
}
module.exports={rallyChecks,createDrillContext,drillAction,drillAdvance,performDrillAction,seedDrillCampaign,checkDrillLabels,checkGroundDrill,runDrill,runPeaceChecks};
if(require.main===module){
  console.log('再集結の到着条件 '+rallyChecks()+'/3');
  const times=runDrill();for(const r of times)console.log(`| ${r.name} | ${r.seconds.toFixed(2)}秒 |`);
  console.log(`| 仮想敵の実打撃 | 前半${times.counterfire.early}回・後半${times.counterfire.late}回・損害${times.counterfire.damage} |`);
  console.log(`| バイコヌール演習 | 案内なし・敵打撃${times.normal.hits}回・${times.normal.seconds.toFixed(2)}秒で占拠勝利 |`);
  console.log('| 演習の順序・全段勝利・全滅敗北・W.A.S.なし | 成功 |');
}
