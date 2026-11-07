/* node tests/ground-drill.cjs: ブラウザ不要で本物の地形・経路・射撃・搭乗・架橋・上陸を早送り。
   npm test では同じ案内順をブラウザでも実行し、キャンペーンの解放と固定編成を確認する。 */
const {createGroundContext}=require('./ground-landing.cjs');
function drillAction(){
  const r=groundDrillRow(),f=groundDrillUnit(r.actor),m=r.marks[0],p=m&&new THREE.Vector3(m.pos[0],groundHeight(...m.pos),m.pos[1]);
  select(f);
  if(r.condition==='groundSelect')return true;
  if(['groundMove','groundCapture','groundSight'].includes(r.condition)){order(f,{type:'move',dest:p});return !!f.order;}
  if(r.condition==='groundAttack'){const t=groundDrillUnit(r.target);if(!shown(t))throw new Error('案内の攻撃対象が未発見: '+r.target);order(f,{type:'attack',target:t});return true;}
  if(r.condition==='groundBand')return groundSetBand([f],r.band);
  if(r.condition==='groundStrike')return groundStrikeCommand([f],p)>0;
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
  for(let i=0;i<Math.ceil(limit/.05)&&!over&&tutorial.step===before;i++)step(.05);
  if(!over&&tutorial.step===before)throw new Error('手順が進まない: '+r.name+' '+JSON.stringify({pos:f.pos,order:f.order?.type,visible:r.target&&shown(groundDrillUnit(r.target)),message:groundTransportMessage}));
  if(over&&outcome!==true)throw new Error('案内どおりの操作で敗北: '+r.name);
  return tutorial.times[tutorial.times.length-1];
}
function createDrillContext(){
  const {ctx,read,run}=createGroundContext(),THREE=ctx.THREE;
  const context2d=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:()=>{}});
  const element=()=>{const children={};return {style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},append(){},remove(){},addEventListener(){},setAttribute(){},getContext:()=>context2d,querySelector:k=>children[k]||(children[k]=element())};};
  Object.assign(ctx,{document:{getElementById:()=>element(),querySelectorAll:()=>[],createElement:element,body:element()},renderer:{domElement:element(),shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}},addEventListener(){},scene:new THREE.Scene(),labelsEl:element(),grid:{},starField:{},skyObj:{},fieldRocks:{},debrisObj:{},cloudObj:{},farPlanet:{},ambient:new THREE.AmbientLight(),sun:new THREE.DirectionalLight(),rim:{},flyTo(){},proj:()=>({x:0,y:0,z:0}),selected:null,orderTargets:()=>ctx.selected?[ctx.selected]:[],select:f=>{ctx.selected=f;},shown:f=>f.team===0||run('groundSeenBy')(0,f),step:dt=>{ctx.gameSec+=dt;run('groundStep')(dt);},end:win=>{ctx.over=true;ctx.outcome=win;}});
  run(read('battle/tutorial.js'));run(read('battle/ground-drill.js'));
  run('tutorialRender=()=>{};groundHud=()=>{};');
  run(`op=WOS_DATA.operations.find(o=>o.id==='ch2drill');groundSetup(op.ground);
    fleets=[...op.quick.map(o=>makeFleet(0,o)),...op.enemies.map(o=>makeFleet(1,o))];groundSeaDeploy();
    globalThis.shipMeshes=[0,1].map(()=>Object.fromEntries(['cv','dd','cl'].map(t=>[t,new THREE.Mesh(shapeGeo(t),new THREE.MeshStandardMaterial())])));
    globalThis.SHIP_SIZE=Object.fromEntries(WOS_DATA.ships.map(s=>[s.id,s.scale*1.2]));
    groundSightInit=groundDraw=()=>{};groundInit();tutorialInit({op:'ch2drill'});`);
  run('globalThis.drillAction='+drillAction.toString()+';globalThis.drillAdvance='+drillAdvance.toString());
  return {ctx,run};
}
async function performDrillAction(page){
  const r=await page.evaluate(()=>{const r=groundDrillRow();return {condition:r.condition,actor:r.actor,band:r.band,selected:orderTargets().length===1&&orderTargets()[0].name===r.actor};});
  if(!r.selected)await page.locator('#roster').getByRole('button',{name:r.actor,exact:true}).click();
  if(r.condition==='groundSelect')return true;
  if(r.condition==='groundBand'){
    await page.click(`#groundCommand [data-band="${r.band}"]`);
    return page.evaluate(()=>!!tutorial.ground.issued);
  }
  if(r.condition==='groundUnload'){
    await page.click('#groundUnload');return page.evaluate(()=>!!tutorial.ground.unloaded);
  }
  if(r.condition==='groundLand'){
    await page.click('#groundLand');return page.evaluate(()=>!!tutorial.ground.passengers?.length);
  }
  if(r.condition==='groundStrike')await page.click('#groundStrike');
  if(r.condition==='groundBridge')await page.click('#groundBridge');
  if(r.condition==='groundBoard')await page.click('#groundBoard');
  // 地図上の指定は実命令関数へ渡す。部隊の名札の重なりや壁時計に頼らない。
  return page.evaluate(()=>drillAction());
}
function seedDrillCampaign(includeLast=true){
  WOS.openMenu();
  const debug=document.getElementById('dbgT');if(debug.getAttribute('aria-expanded')!=='true')debug.click();
  document.querySelector('[data-dbga="skip"]').click(); // 通常の保存処理で初期編成も用意する。
  const s=JSON.parse(localStorage.getItem('wos.save.v1'));
  s.prog.tutorialCleared=true;s.prog.prepDone=true;
  s.prog.cleared=WOS_DATA.operations.filter(o=>o.chapter&&o.id!=='ch2drill'&&(includeLast||o.id!=='denaliBreak')).map(o=>o.id);
  s.groundOrg.companies.push({id:'drill-save-was',name:'保存中の W.A.S.',kind:'was'});
  localStorage.setItem('wos.save.v1',JSON.stringify(s));
}
async function checkGroundDrill(page,check){
  // 既存の保存を戻す。第一章最終節の前後で鍵が変わることを実メニューで確認。
  const campaign=await page.evaluate(()=>{
    const old=localStorage.getItem('wos.save.v1');return old;
  });
  try{
    await page.evaluate(seedDrillCampaign,false);
    await page.goto(page.url().split('?')[0]);await page.waitForFunction(()=>window.WOS_MENU);
    await page.click('[data-go="mode"]');await page.click('[data-go="sortie"]');
    check(await page.locator('[data-op="ch2drill"]').isDisabled(),'第二章演習: 第一章最終節の前は鍵付き');
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wos.save.v1'));s.prog.cleared.push('denaliBreak');s.prog.prepDone=true;localStorage.setItem('wos.save.v1',JSON.stringify(s));});
    await page.reload();await page.waitForFunction(()=>window.WOS_MENU);
    await page.click('[data-go="mode"]');await page.click('[data-go="sortie"]');
    check(await page.locator('[data-op="ch2drill"]').isEnabled(),'第二章演習: 第一章の次に解放');
    await page.click('[data-op="ch2drill"]');await page.click('#goBattle');
    await page.evaluate(()=>{if(talking)endTalk();setSpeed(0);});
    check(await page.evaluate(()=>JSON.parse(localStorage.getItem('wos.save.v1')).groundOrg.companies.some(c=>c.kind==='was')&&op.id==='ch2drill'&&tutorialActive()&&tutorial.step===0&&!fleets.some(f=>f.team===0&&f.groundKind==='was')),'第二章演習: メニューから固定配備・W.A.S. なし');
    // story オフでも案内を表示し、たたむボタンで演習を飛ばさない。
    await page.evaluate(()=>{window.WOS_OPT.story=false;tutorialTalk();});
    check(await page.locator('#talkText').isVisible(),'第二章演習: ストーリーが切でも必須の通信を表示');
    await page.click('#talkSkip');
    check(await page.evaluate(()=>tutorialActive()&&tutorial.folded&&tutorial.step===0),'第二章演習: 案内をたたんでも段取りは保持');
    await page.click('#talkSkip');
    await page.evaluate('window.drillAction='+drillAction.toString());
    await page.evaluate('window.drillAdvance='+drillAdvance.toString());
    const times=[];
    for(let i=0;i<19;i++){
      check(await page.evaluate(()=>{const before=tutorial.step;step(.05);return tutorial.step===before&&!over;}),'第二章演習: 無操作で手順'+(i+1)+'を飛ばさない');
      if(!await performDrillAction(page))throw new Error('案内の操作が失敗: '+i);
      times.push(await page.evaluate(()=>drillAdvance()));
    }
    check(await page.evaluate(()=>over&&outcome===true&&tutorial.complete&&tutorial.times.length===op.tutorial.length),'第二章演習: 19手順を順番に終えて勝利');
    await page.waitForSelector('#result:not([hidden])');
    await page.evaluate(()=>{reset({op:'ch2drill'});fleets.filter(f=>f.team===0).forEach(f=>f.alive=false);step(.05);});
    check(await page.evaluate(()=>over&&outcome===false),'第二章演習: 全滅で敗北');
    await page.waitForSelector('#result:not([hidden])');
    await page.evaluate(()=>{reset({op:'charybdis'});});
    check(await page.evaluate(()=>!tutorialActive()&&!groundSites.length),'第二章演習: 再初期化で宇宙に復帰');
    return times;
  }finally{
    await page.evaluate(old=>{if(old===null)localStorage.removeItem('wos.save.v1');else localStorage.setItem('wos.save.v1',old);},campaign);
  }
}
function runDrill(){
  const {run}=createDrillContext();
  const assert=require('assert/strict');
  const bg=require('fs').readFileSync(require('path').join(__dirname,'../prep-bg.js'),'utf8');
  assert.equal(run(`(()=>{${bg.slice(bg.indexOf('const DEG='),bg.indexOf('const cv='))}${bg.slice(bg.indexOf('function opW('),bg.indexOf('function dayOf('))}return opW({place:{body:'地球'}},0).every(Number.isFinite);})()`),true,'地球の作戦マーカーは有効な座標');
  assert.equal(run("WOS_DATA.operations.filter(o=>o.chapter&&!o.hidden).at(-2).id"),'denaliBreak');
  assert.equal(run('fleets.some(f=>f.team===0&&f.groundKind===\'was\')'),false);
  assert.equal(run('groundBuildings.length>0&&groundForests.length>0'),true);
  assert.equal(run(`(()=>{const s=groundSites[0];s.owner=0;groundCaptureStep(.05);s.owner=null;return !over;})()`),true,'全占拠だけでは勝たない');
  assert.equal(run(`(()=>{const reds=fleets.filter(f=>f.team===1);reds.forEach(f=>f.alive=false);groundCaptureStep(.05);reds.forEach(f=>f.alive=true);return !over;})()`),true,'仮想敵全滅だけでは勝たない');
  assert.equal(run("!shown(groundDrillUnit('仮想敵 斥候'))"),true,'偵察対象は初めは未発見');
  const times=[];
  for(let i=0;i<19;i++){
    assert.equal(run('(()=>{const s=tutorial.step;step(0);return !over&&s===tutorial.step;})()'),true,'無操作で手順を飛ばさない');
    assert.equal(run('drillAction()'),true,'案内の操作を受理');
    const r=run('drillAdvance()');times.push(r);
  }
  assert.equal(run('over&&outcome===true&&tutorial.complete&&tutorial.times.length===19'),true);
  assert.equal(run('fleets.filter(f=>f.team===0&&f.alive).length'),12,'自軍全12隊が残存');
  assert.equal(run('(()=>{over=false;fleets.filter(f=>f.team===0).forEach(f=>f.alive=false);groundCaptureStep(.05);return over&&outcome===false;})()'),true,'全滅で敗北');
  return times;
}
module.exports={createDrillContext,drillAction,drillAdvance,performDrillAction,seedDrillCampaign,checkGroundDrill,runDrill};
if(require.main===module){
  const times=runDrill();for(const r of times)console.log(`| ${r.name} | ${r.seconds.toFixed(2)}秒 |`);
  console.log('| 演習の順序・全段勝利・全滅敗北・W.A.S.なし | 成功 |');
}
