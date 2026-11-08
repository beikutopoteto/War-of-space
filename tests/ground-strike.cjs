/* node tests/ground-strike.cjs: ブラウザ不要。本物の damage と地上ステップで固定場面を確認。
   npm test では同じ場面に加えて操作・描画・再初期化も確認する。 */
const fs=require('fs'),path=require('path'),vm=require('vm');
function strikeCases(){
  const saved={op,fleets,groundHeight,groundForests,groundBuildings,groundSites,over,end,shoot,burst,groundFog,groundStrikes,groundImpacts,random:Math.random};
  const results=[],check=(name,ok)=>results.push({name,ok});
  const unit=(team,kind,x,z=0,band='ground')=>({id:10+team,name:kind,kind:'fleet',team,groundKind:kind,band,alive:true,hp:1000,hpPool:1000,pos:new THREE.Vector3(x,0,z),heading:new THREE.Vector3(),ships:[{}],stance:'evade',range:45,dmg:12,queue:[],order:null});
  const fresh=()=>{groundStrikes=[];groundImpacts=[];groundHeight=()=>0;groundHeightCacheReset();groundForests=[];groundBuildings=[];over=false;groundSites=[];end=()=>{};shoot=burst=()=>{};groundFog=null;Math.random=()=>0;};
  try{
    // 戦闘規則の固定場面では本営とデバッグ専用の固定敵指定を外す。補給はground-supply、固定敵はground-fixesで確認。
    op={...op,groundHQ:null,groundStaticEnemies:false};
    fresh();const gun=unit(0,'artillery',-20),enemy=unit(1,'infantry',0),friend=unit(0,'infantry',3),edge=unit(1,'infantry',7),outside=unit(1,'infantry',7.01),air=unit(1,'fighter',0,0,'low');
    fleets=[gun,enemy,friend,edge,outside,air];const aim=enemy.pos.clone(),s=groundStrikeLaunch(gun,aim);
    check('自走砲は予告5秒・半径7',s&&s.left===5&&s.radius===7);
    check('再装填中は連射できない',groundStrikeLaunch(gun,aim)===null&&groundStrikes.length===1);
    groundStep(4.99);check('予告時間の直前は敵味方とも打撃0',enemy.hpPool===1000&&friend.hpPool===1000&&groundStrikes.length===1);
    groundStep(.01);check('5秒で着弾し敵と味方に損害',enemy.hpPool===988&&friend.hpPool<1000&&groundStrikes.length===0&&groundImpacts.length===1);
    check('中心ほど強く円周にも当たる',1000-enemy.hpPool>1000-friend.hpPool&&1000-friend.hpPool>1000-edge.hpPool&&edge.hpPool<1000);
    check('円外と低高度には当たらない',outside.hpPool===1000&&air.hpPool===1000);
    const hp=friend.hpPool;damage(friend,5,gun,s);check('着弾処理の外から味方へ damage を呼んでも損害0',friend.hpPool===hp);
    fresh();gun.alive=true;gun.groundStrikeCooldown=0;gun.pos.set(-20,0,0);enemy.hpPool=1000;enemy.pos.set(0,0,0);fleets=[gun,enemy];
    const fixed=groundStrikeLaunch(gun,enemy.pos);enemy.pos.x=20;gun.pos.x=-70;gun.alive=false;groundStep(5);
    check('移動目標を追わず指定地点へ着弾',enemy.hpPool===1000&&fixed.impact.x===0&&groundImpacts[0].impact.x===0);
    check('射手が移動・撃破されても発射済み弾は消えない',groundStrikes.length===0&&groundImpacts.length===1);
    fresh();gun.alive=true;gun.pos.set(-20,0,0);gun.groundStrikeCooldown=0;enemy.pos.set(0,0,0);fleets=[gun,enemy];
    const deadShot=groundStrikeLaunch(gun,enemy.pos);gun.alive=false;enemy.hpPool=1000;groundStep(5);
    check('射手撃破後の着弾も実際に損害を与える',enemy.hpPool<1000&&!deadShot.resolving);
    fresh();gun.alive=true;gun.groundStrikeCooldown=0;gun.pos.set(-40,0,0);fleets=[gun,enemy];Math.random=()=>.25;
    const blind=groundStrikeLaunch(gun,new THREE.Vector3());check('未観測地点でも射程内なら発射',blind&&!blind.observed);
    const offset=blind.impact.distanceTo(blind.aim);check('未観測の散布は4、固定乱数でずれ2',blind.spread===4&&Math.abs(offset-2)<1e-8);
    gun.groundStrikeCooldown=0;const scout=unit(0,'scout',0,8);fleets.push(scout);
    const observed=groundStrikeLaunch(gun,new THREE.Vector3());check('斥候の観測を共有し散布2、同じ乱数でずれ1',observed.observed&&observed.spread===2&&Math.abs(observed.impact.distanceTo(observed.aim)*2-offset)<1e-8);
    const snap=blind.impact.clone();scout.pos.x=60;enemy.pos.x=50;groundUpdateSight();check('発射後に観測・目標が変わっても着弾点は固定',blind.impact.equals(snap));
    gun.groundStrikeCooldown=0;groundBuildings=[{minX:-21,maxX:-19,minZ:-2,maxZ:2,bottom:0,top:40}];scout.pos.set(0,0,8);
    const blocked=groundStrikeLaunch(gun,new THREE.Vector3());check('射手の直線が建物で遮られても観測共有で発射',!groundClearLine(groundEye(gun),{x:0,y:.35,z:0})&&blocked&&blocked.observed);
    gun.groundStrikeCooldown=0;scout.alive=false;const unseenWall=groundStrikeLaunch(gun,new THREE.Vector3());check('観測者も遮蔽されたら未観測の散布で発射',unseenWall&&!unseenWall.observed);
    fresh();gun.pos.set(-20,0,0);gun.groundStrikeCooldown=0;fleets=[gun];
    check('射程45の境界は発射できる',!!groundStrikeLaunch(gun,new THREE.Vector3(25,0,0)));
    gun.groundStrikeCooldown=0;const count=groundStrikes.length;check('射程外45.01は撃てず弾も再装填も増えない',!groundStrikeLaunch(gun,new THREE.Vector3(25.01,0,0))&&groundStrikes.length===count&&gun.groundStrikeCooldown===0);
    check('盤外と非有限の地点は撃てない',!groundStrikeLaunch(gun,new THREE.Vector3(NaN,0,0))&&!groundStrikeLaunch(gun,new THREE.Vector3(900,0,0)));
    check('自走砲の通行は戦車と同じ',groundMoveKind(gun)==='vehicle');
    fresh();const plane=unit(0,'supportAircraft',-10,0,'high');plane.range=20;enemy.pos.set(0,0,0);enemy.hpPool=1000;fleets=[plane,enemy];
    const bomb=groundStrikeLaunch(plane,enemy.pos);check('高高度爆撃は予告7秒・半径9',bomb&&bomb.left===7&&bomb.radius===9);
    groundStep(6.99);check('爆撃も7秒直前は打撃0',enemy.hpPool===1000);groundStep(.01);check('爆撃は7秒で実際に着弾',enemy.hpPool<1000);
    plane.groundStrikeCooldown=0;plane.band='low';plane.bandTo='high';check('低から高へ遷移中は爆撃不可',!groundStrikeLaunch(plane,enemy.pos));
    plane.band='high';plane.bandTo='low';check('高から低へ遷移中は元の高高度で爆撃可',!!groundStrikeLaunch(plane,enemy.pos));
    fresh();const red=unit(1,'artillery',-20),a=unit(0,'infantry',0),b=unit(0,'infantry',2),c=unit(0,'infantry',20);red.stance='engage';fleets=[red,a,b,c];groundStep(.05);
    check('敵自走砲は見える2隊の密集中心を砲撃',groundStrikes.length===1&&groundStrikes[0].team===1&&groundStrikes[0].aim.x===1);
    const redAim=groundStrikes[0].aim.clone();a.pos.x=40;b.pos.x=42;groundStep(5);check('敵も発射後は追尾しない',groundImpacts[0].aim.equals(redAim)&&a.hpPool===1000&&b.hpPool===1000);
    red.groundStrikeCooldown=0;groundStrikes=[];groundStep(.05);check('敵は視界外の密集を狙わない',groundStrikes.length===0);
    a.pos.set(0,0,0);b.pos.set(20,0,0);c.pos.set(40,0,0);groundStep(.05);check('敵は孤立部隊を密集と数えない',groundStrikes.length===0);
  }finally{op=saved.op;
    groundStrikes.forEach(groundStrikeDropVisual);groundImpacts.forEach(groundStrikeDropVisual);
    ({fleets,groundHeight,groundForests,groundBuildings,groundSites,over,end,shoot,burst,groundFog,groundStrikes,groundImpacts}=saved);Math.random=saved.random;groundHeightCacheReset();
  }
  return results;
}
async function checkGroundStrike(page,check){
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);endDeploy();});
  for(const c of await page.evaluate(strikeCases))check(c.ok,'地点攻撃: '+c.name);
  await page.evaluate(()=>{
    const base=OPS.find(o=>o.id==='groundExercise2').quick[0];
    reset({op:'groundExercise2',fleets:[{...base,groundKind:'artillery',name:'自走砲'}]});setSpeed(0);endDeploy();
    fleets.forEach(f=>{f.stance='evade';f.order=null;f.pos.copy(groundPoint(f.team?44:9,27));});
    select(fleets.find(f=>f.team===0));camAnim=null;controls.target.copy(selected.pos);camera.position.copy(selected.pos).add(new THREE.Vector3(0,90,.01));camera.lookAt(controls.target);controls.update();
  });
  await page.locator('#groundStrike').click({noWaitAfter:true});
  const button=await page.evaluate(()=>groundStrikeAiming&&document.getElementById('groundStrike').getAttribute('aria-pressed')==='true');
  check(button,'地点攻撃の操作: ボタンで指定開始');
  await page.keyboard.press('Escape');check(await page.evaluate(()=>!groundStrikeAiming&&!paused),'地点攻撃の操作: Escで取消');
  await page.keyboard.press('b');
  const p=await page.evaluate(()=>{const p=proj(selected.pos);return {x:p.x+35,y:p.y+25};});
  await page.mouse.click(p.x,p.y);
  const display=await page.evaluate(()=>{
    groundDraw();const s=groundStrikes[0];if(!s)return false;
    return !groundStrikeAiming&&s.visual.ring.parent===groundVisuals&&s.visual.el.textContent.includes('5.0秒');
  });check(display,'地点攻撃の操作: Bと地図クリックで予告円と残り秒');
  const state=await page.evaluate(()=>{
    const s=groundStrikes[0],p=s.impact.clone(),friend=fleets.find(f=>f.team===0),enemy=fleets.find(f=>f.team===1);
    friend.pos.copy(p);enemy.pos.copy(p);friend.band=enemy.band='ground';const hp=[friend.hpPool+(friend.groundMorale||0),enemy.hpPool+(enemy.groundMorale||0)];
    for(let i=0;i<100;i++)step(.05);groundDraw();
    const hit=friend.hpPool+(friend.groundMorale||0)<hp[0]&&enemy.hpPool+(enemy.groundMorale||0)<hp[1],impact=groundImpacts.length===1&&document.querySelector('.ground-strike-label').textContent==='着弾';
    reset({op:'groundExercise2'});const clean=!groundStrikes.length&&!groundImpacts.length&&!document.querySelector('.ground-strike-label');
    reset({op:'charybdis'});return {hit,impact,clean,space:!groundStrikeAiming&&document.getElementById('groundAlt').hidden};
  });
  for(const [name,ok] of Object.entries(state))check(ok,'地点攻撃の実画面: '+name);
}
module.exports={strikeCases,checkGroundStrike};
function nodeRenderCases(ctx){
  const draw=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})},{get:(t,p)=>p in t?t[p]:()=>{}});
  ctx.document.createElement=()=>({width:0,height:0,style:{},getContext:()=>draw,remove(){this.removed=true;}});
  const THREE=require('three');
  for(const key of ['grid','starField','skyObj','fieldRocks','debrisObj','cloudObj','farPlanet','rim'])ctx[key]=new THREE.Group();
  Object.assign(ctx,{scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),ambient:new THREE.AmbientLight(),renderer:{shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}},labelsEl:{appendChild(){}},proj:p=>({x:p.x,y:p.z,z:0}),TEAM_COL:[new THREE.Color('blue'),new THREE.Color('red')]});
  return vm.runInContext(`(()=>{
    groundConfigure=()=>{groundStrikeReset();groundSightReset();};groundSetup('exercise2');groundVisuals=new THREE.Group();
    const results=[],check=(name,ok)=>results.push({name,ok});
    for(const [kind,blind] of [['artillery',false],['supportAircraft',false],['artillery',true]]){
      groundStrikeReset();
      const f={team:0,groundKind:kind,band:kind==='artillery'?'ground':'high',pos:groundPoint(9,27),alive:true,...WOS_TERRAIN.exercise2.unitTypes[kind]};fleets=[f];
      const s=groundStrikeLaunch(f,groundPoint(blind?19:13,27));
      check('撮影配置 '+kind+(blind?' 未観測':' 観測')+'（生成済みの建物も判定）',!!s&&s.observed!==blind);
      groundStrikeDraw();
      const ring=s.visual.ring,el=s.visual.el;
      check('予告円・秒数の描画 '+kind+(blind?' 未観測':''),ring.parent===groundVisuals&&[...ring.geometry.attributes.position.array].every(Number.isFinite)&&el.textContent.includes(s.left.toFixed(1)+'秒')&&(!blind||el.textContent.includes('散布×2')));
      groundStrikeStep(s.left);groundStrikeDraw();const effect=groundImpacts[0],effectRing=effect.visual.ring;
      check('着弾で予告を片付け、実着弾点に輪を描画',!ring.parent&&el.removed&&effect.visual.el.textContent==='着弾');
      groundStrikeStep(WOS_TERRAIN.exercise2.strike.effectSec);check('着弾表示は期限後に片付ける',!effectRing.parent&&!groundImpacts.length);
    }
    fleets[0].groundStrikeCooldown=0;groundStrikeLaunch(fleets[0],groundPoint(19,27));groundStrikeDraw();
    check('再初期化の前に発射済みの予告がある',groundStrikes.length===1&&groundVisuals.children.length===1);
    groundStrikeReset();
    check('再初期化は予告・着弾・指定モードを消す',!groundStrikes.length&&!groundImpacts.length&&!groundStrikeAiming&&groundVisuals.children.length===0);
    return results;
  })()`,ctx);
}
if(require.main===module){
  const ctx=vm.createContext({THREE:require('three'),TEAM_COL:['blue','red'],window:{},document:{querySelectorAll:()=>[]},fleets:[],op:{ground:'exercise2'},gameSec:0,over:false,end:()=>{},shoot:()=>{},burst:()=>{},dropArrow:()=>{},nextOrder:()=>{},followPath:()=>false,
    tutorialProtected:()=>false,tutorialDamage:()=>{},patrolHunting:()=>false,umbrellaPack:()=>false,engaged:new Map(),fortress:{defend:false},phaseName:'交戦',logEvent:()=>{},destroyFleet:t=>t.alive=false});
  for(const file of ['data/terrain/exercise2.js','battle/terrain.js','battle/ground-sight.js','battle/ground-strike.js','battle/ground-transport.js','battle/ground-supply.js','battle/ground.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);ctx.WOS_TERRAIN=ctx.window.WOS_TERRAIN;
  }
  const sim=fs.readFileSync(path.join(__dirname,'../battle/sim.js'),'utf8');vm.runInContext(sim.slice(sim.indexOf('function damage('),sim.indexOf('function destroyFleet(')),ctx);
  const results=vm.runInContext(`(${strikeCases.toString()})()`,ctx);results.push(...nodeRenderCases(ctx));const failed=results.filter(c=>!c.ok);
  console.log(`| 地点攻撃の固定場面（ブラウザ不要・実 damage） | ${results.length-failed.length}/${results.length} 成功 |`);
  if(failed.length){console.error(failed);process.exitCode=1;}
}
