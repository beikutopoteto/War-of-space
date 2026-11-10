/* 占拠の固定場面。node tests/ground-capture.cjs はブラウザなしで判定を確認。
   npm test では同じ場面を実画面の関数で実行し、勝敗画面・再初期化も確認する。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
function captureCases() {
  const saved={fleets,groundSites,over,end}, results=[];
  const check=(name,ok)=>results.push({name,ok});
  const unit=(team,kind='infantry',x=0,band='ground')=>({team,groundKind:kind,band,alive:true,hpPool:40,pos:{x,z:0}});
  const site=()=>({pos:{x:0,z:0},captureRadius:8,captureSec:30,owner:null,progress:[0,0],contested:false});
  let outcome=null;
  try {
    end=win=>{over=true;outcome=win;}; over=false;
    const s=site(), blue=unit(0), red=unit(1);groundSites=[s,site()];groundSites[1].pos.x=200;fleets=[blue,red];
    groundCaptureStep(10);check('両軍の占拠部隊で停止',s.contested&&s.progress.every(x=>x===0));
    red.pos.x=50;groundCaptureStep(12);check('単独の歩兵で12秒進む',!s.contested&&s.progress[0]===12);
    blue.pos.x=50;groundCaptureStep(20);check('離脱後も12秒保持',s.progress[0]===12);
    red.pos.x=0;groundCaptureStep(7);check('敵軍の進捗を別に保持',s.progress[0]===12&&s.progress[1]===7);
    blue.pos.x=0;groundCaptureStep(10);check('進捗がある競合でも停止',s.contested&&s.progress[0]===12&&s.progress[1]===7);
    red.alive=false;groundCaptureStep(18);check('死亡した敵は阻止せず占領',s.owner===0&&s.progress.every(x=>x===0)&&!over);
    blue.pos.x=50;red.alive=true;red.pos.x=0;groundCaptureStep(30);check('敵軍も再占領できる',s.owner===1);
    for(const kind of ['vehicle','heavyInfantry','scout','fighter','attack']){
      s.owner=null;s.progress=[0,0];fleets=[unit(0,kind)];groundCaptureStep(40);check(`${kind} は占拠しない`,s.owner===null&&s.progress[0]===0);
    }
    fleets=[unit(0,'was',0,'low')];groundCaptureStep(40);check('低空 W.A.S. は占拠しない',s.owner===null);
    fleets[0].band='ground';fleets[0].bandTo='low';groundCaptureStep(30);check('地上 W.A.S. は遷移中も元の段で占領',s.owner===0);
    s.owner=null;s.progress=[0,0];fleets=[unit(0),unit(1,'vehicle')];groundCaptureStep(30);check('敵戦車は歩兵の占拠を止めない',s.owner===0&&!s.contested);
    s.owner=null;s.progress=[0,0];fleets=[unit(0,'infantry',8.01)];groundCaptureStep(40);check('円の外は進まない',s.progress[0]===0);
    fleets[0].pos.x=8;groundCaptureStep(30);check('円周上は占拠できる',s.owner===0);
    groundSites[1].owner=0;groundCaptureStep(.05);check('3拠点に限らず全拠点で勝利',over&&outcome===true);
    over=false;outcome=null;fleets[0].alive=false;groundCaptureStep(.05);check('全滅で敗北（全占領と同時なら敗北）',over&&outcome===false);
    over=true;s.owner=null;groundCaptureStep(50);check('終了後は占拠しない',s.owner===null);
  } finally {fleets=saved.fleets;groundSites=saved.groundSites;over=saved.over;end=saved.end;}
  return results;
}
async function checkGroundCapture(page, check) {
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);endDeploy();});
  const cases=await page.evaluate(captureCases);
  for(const c of cases)check(c.ok,'地上占拠: '+c.name);
  const integration=await page.evaluate(()=>{
    reset({op:'groundExercise2'});setSpeed(0);endDeploy();
    const units=fleets.filter(f=>f.team===0), d=WOS_TERRAIN[op.ground];
    const stats=units.filter(f=>f.groundKind!=='sea').every(f=>f.hp===d.unitTypes[f.groundKind].hp&&f.speed===d.unitTypes[f.groundKind].speed&&f.range===d.unitTypes[f.groundKind].range);
    const heavy=units.find(f=>f.groundKind==='heavyInfantry'), tank=units.find(f=>f.groundKind==='vehicle'), infantry=units.find(f=>f.groundKind==='infantry');
    const savedFleets=fleets, target=fleets.find(f=>f.team===1&&f.groundKind==='vehicle');
    fleets=[heavy,target];heavy.stance=target.stance='evade';heavy.pos.copy(target.pos);heavy.order={type:'attack',target};
    let hp=target.hpPool+target.groundMorale;groundStep(.05);const heavyHit=hp-target.hpPool-target.groundMorale===heavy.dmg*d.combat.heavyTank;
    const enemyInfantry=savedFleets.find(f=>f.team===1&&f.groundKind==='infantry');
    fleets=[tank,enemyInfantry];tank.stance=enemyInfantry.stance='evade';tank.pos.copy(enemyInfantry.pos);tank.order={type:'attack',target:enemyInfantry};
    // 兵科相性の確認にも、その場所の歩兵の遮蔽軽減を含める。
    hp=enemyInfantry.hpPool+enemyInfantry.groundMorale;const expectedTankHit=tank.dmg*d.combat.tankInfantry*groundDamageFactor(enemyInfantry);groundStep(.05);const tankHit=Math.abs(hp-enemyInfantry.hpPool-enemyInfantry.groundMorale-expectedTankHit)<1e-7;
    fleets=savedFleets;heavy.order=tank.order=null;
    const matchup=heavyHit&&tankHit&&groundMoveKind(heavy)==='infantry';
    infantry.pos.copy(enemyInfantry.pos);groundCaptureStep(.05);groundDraw();
    const contestedSite=groundSites.find(s=>s.contested), raw=groundTerritory.canvas.getContext('2d').getImageData(0,0,480,360).data;
    const hatch=!!contestedSite&&contestedSite.owner===1&&contestedSite.el.textContent.includes('競合中')&&raw.some((n,i)=>i%4===3&&n===190);
    for(const f of fleets){f.stance='evade';if(f.team===1)f.alive=false;}
    // 敵全滅だけでは勝たず、3拠点を1つずつ実際に占領する。
    step(.05);const noWipeWin=!over;
    for(const s of groundSites){infantry.pos.copy(s.pos);for(let i=0;i<600&&!over;i++)step(.05);}
    const victory=over&&outcome===true&&document.getElementById('rh').textContent==='勝利'&&groundSites.every(s=>s.owner===0);
    groundDraw();const gauge=document.querySelectorAll('.ground-site .capture-track').length===op.groundSites.length;
    const road=groundTerritory.sections.length>0, alpha=new Set();
    const pixels=groundTerritory.canvas.getContext('2d').getImageData(0,0,480,360).data;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i])alpha.add(pixels[i]);
    const union=alpha.size===1&&alpha.has(102);
    return {stats,matchup,hatch,noWipeWin,victory,gauge,road,union};
  });
  // 結果表示の既存タイマーを待ってから次の作戦へ。後続の宇宙テストに残さない。
  await page.waitForSelector('#result:not([hidden])');
  const defeat=await page.evaluate(()=>{
    reset({op:'groundExercise2'});setSpeed(0);endDeploy();fleets.filter(f=>f.team===0).forEach(f=>f.alive=false);step(.05);return over&&outcome===false;
  });
  await page.waitForSelector('#result:not([hidden])');
  const restored=await page.evaluate(()=>{
    reset({op:'groundExercise2'});setSpeed(0);endDeploy();const clean=groundSites.every(s=>!s.contested&&s.progress.every(n=>n===0))&&document.querySelectorAll('.ground-site').length===op.groundSites.length;
    reset({op:'charybdis'});const space=groundSites.length===0&&!groundTerritory&&!document.querySelector('.ground-site');
    return {clean,space};
  });
  for(const [name,ok] of Object.entries({...integration,defeat,...restored}))check(ok,'地上演習の統合: '+name);
}
module.exports={checkGroundCapture};
if(require.main===module){
  const context=vm.createContext({window:{},document:{querySelectorAll:()=>[],getElementById:()=>({addEventListener(){}})},fleets:[],op:{ground:'exercise2'},over:false,end:()=>{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../data/terrain/exercise2.js'),'utf8'),context);
  context.WOS_TERRAIN=context.window.WOS_TERRAIN;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../battle/ground-supply.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../battle/ground.js'),'utf8'),context);
  const results=vm.runInContext(`(${captureCases.toString()})()`,context), failed=results.filter(r=>!r.ok);
  console.log(`| 占拠の固定場面（ブラウザ不要） | ${results.length-failed.length}/${results.length} 成功 |`);
  if(failed.length){console.error(failed);process.exitCode=1;}
}
