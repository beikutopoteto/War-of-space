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
    s.owner=1;red.pos.x=50;groundCaptureStep(12);check('単独の歩兵で12秒進む',!s.contested&&s.progress[0]===12);
    blue.pos.x=50;groundCaptureStep(1);check('離れて2秒までは減らない',s.progress[0]===12);groundCaptureStep(4);check('そのあと占領と同じ速さで減る',s.progress[0]===9);
    groundCaptureStep(20);check('誰もいなければ0まで戻る',s.progress[0]===0);
    blue.pos.x=0;groundCaptureStep(12);blue.pos.x=50;red.pos.x=0;groundCaptureStep(.1);check('持ち主が踏むとすぐ戻り、進めない',s.progress[0]===0&&s.progress[1]===0);
    blue.pos.x=0;red.pos.x=50;groundCaptureStep(12);red.pos.x=0;groundCaptureStep(10);check('進捗がある競合では止まり、減らない',s.contested&&s.progress[0]===12&&s.progress[1]===0);
    red.alive=false;groundCaptureStep(18);check('死亡した敵は阻止せず占領',s.owner===0&&s.progress.every(x=>x===0)&&!over);
    blue.pos.x=50;red.alive=true;red.pos.x=0;groundCaptureStep(30);check('敵軍も再占領できる',s.owner===1);
    s.owner=null;s.progress=[0,0];blue.pos.x=0;red.pos.x=50;fleets=[blue,red];
    groundCaptureStep(.49);check('中立拠点は0.5秒直前まで中立',s.owner===null&&Math.abs(s.progress[0]-.49)<1e-8);
    groundCaptureStep(.01);check('中立拠点は0.5秒で占領',s.owner===0&&s.progress[0]===0);
    for(const kind of ['vehicle','heavyInfantry','scout','fighter','attack']){
      s.owner=null;s.progress=[0,0];fleets=[unit(0,kind)];groundCaptureStep(40);check(`${kind} は占拠しない`,s.owner===null&&s.progress[0]===0);
    }
    fleets=[unit(0,'was',0,'low')];groundCaptureStep(40);check('低空 W.A.S. は占拠しない',s.owner===null);
    fleets[0].band='ground';fleets[0].bandTo='low';groundCaptureStep(30);check('地上 W.A.S. は遷移中も元の段で占領',s.owner===0);
    s.owner=null;s.progress=[0,0];fleets=[unit(0),unit(1,'vehicle')];groundCaptureStep(30);check('敵戦車1隊（0.5点）でも競合になり、強化歩兵（1点）が優勢で占領する',s.owner===0&&s.contested);
    const capture=(group,seconds=30)=>{over=false;s.owner=1;s.progress=[0,0];fleets=group;groundCaptureStep(seconds);};
    capture([unit(0,'vehicle')]);check('戦車1隊では進まない',s.owner===1&&s.progress[0]===0);
    capture([unit(0,'vehicle'),unit(0,'vehicle')],12);check('戦車2隊でも敵拠点は12秒だけ進む',s.owner===1&&s.progress[0]===12);
    groundCaptureStep(18);check('戦車2隊で30秒かけて占領する',s.owner===0);
    capture([unit(0,'vehicle'),unit(0,'artillery')]);check('戦車1隊と自走砲1隊で占領する',s.owner===0);
    capture([unit(0,'vehicle'),unit(0)]);check('戦車1隊と強化歩兵1隊は今までどおり占領する',s.owner===0);
    capture([unit(0),unit(1,'vehicle'),unit(1,'vehicle')]);check('1点対1点は拮抗して止まる',s.owner===1&&s.contested&&s.leading===null&&s.progress.every(x=>x===0));
    capture([unit(0,'vehicle'),unit(0,'artillery'),unit(1,'vehicle')],30);check('競合中は半分の速さ（1点対0.5点で30秒→15秒ぶん）',s.owner===1&&s.contested&&s.leading===0&&Math.abs(s.progress[0]-15)<1e-8);
    groundCaptureStep(30);check('競合のまま60秒で占領する',s.owner===0);
    capture([unit(0,'vehicle'),unit(1,'vehicle')]);check('0.5点対0.5点は拮抗',s.contested&&s.leading===null&&s.progress[0]===0);
    check('補給と士気の競合は前の決め方（両軍とも1点以上）: 0.5点対0.5点では競合しない',!s.supplyContested);
    capture([unit(0),unit(1,'vehicle'),unit(1,'vehicle')]);check('1点対1点なら補給と士気も競合',s.supplyContested);
    capture([unit(0),unit(0,'vehicle'),unit(1)],10);check('1.5点対1点は優勢な軍が半分の速さで進む',s.leading===0&&Math.abs(s.progress[0]-5)<1e-8);
    fleets=[unit(0,'vehicle'),unit(1,'vehicle'),unit(1)];s.progress=[6,0];groundCaptureStep(4);check('持ち主が優勢な競合では、相手の進みを半分の速さで押し戻す',s.owner===1&&s.leading===1&&Math.abs(s.progress[0]-4)<1e-8);
    fleets=[unit(0,'vehicle'),unit(1,'scout')];s.progress=[6,0];groundCaptureStep(4);check('拮抗なら押し戻さない',Math.abs(s.progress[0]-6)<1e-8);
    capture([unit(0,'vehicle'),unit(0,'artillery'),unit(1,'vehicle'),unit(1,'heavyInfantry')]);check('両軍の混成2隊（1点対1点）は競合して止まる',s.contested&&s.progress.every(x=>x===0));
    for(const kind of Object.keys(groundRuleSet().unitTypes).filter(k=>!['infantry','was'].includes(k))){
      capture([unit(0,kind),unit(0,kind)]);
      const counts=groundBands(fleets[0]).includes('ground')&&kind!=='sea';
      check(kind+' 2隊の地上占領資格',s.owner===(counts?0:1));
    }
    for(const band of ['cruise','low','high']){
      capture([unit(0,'fighter',0,band),unit(0,'fighter',0,band)]);check(band+'の戦闘機2隊では占領しない',s.owner===1);
      capture([unit(0,'was',0,band),unit(0,'was',0,band)]);check(band+'の W.A.S. 2隊では占領しない',s.owner===1);
    }
    capture([unit(0,'vehicle'),unit(0,'artillery',8.01)]);check('2隊目が円外なら占領しない',s.owner===1);
    for(const flags of [{embarked:true},{alive:false},{hpPool:0},{groundRout:'routing'},{groundExited:true},{groundAirState:'base'},{groundDescentUntil:1e12}]){
      capture([Object.assign(unit(0,'vehicle'),flags),Object.assign(unit(0,'artillery'),flags)]);
      check(JSON.stringify(flags)+' の2隊は数えない',s.owner===1&&s.progress[0]===0);
    }
    over=false;s.owner=null;s.progress=[0,0];fleets=[unit(0,'infantry',8.01)];groundCaptureStep(40);check('円の外は進まない',s.progress[0]===0);
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
    const stats=units.filter(f=>f.groundKind!=='sea').every(f=>f.hp===groundRuleSet().unitTypes[f.groundKind].hp&&f.speed===groundRuleSet().unitTypes[f.groundKind].speed&&f.range===groundRuleSet().unitTypes[f.groundKind].range);
    const heavy=units.find(f=>f.groundKind==='heavyInfantry'), tank=units.find(f=>f.groundKind==='vehicle'), infantry=units.find(f=>f.groundKind==='infantry');
    const savedFleets=fleets, target=fleets.find(f=>f.team===1&&f.groundKind==='vehicle');
    fleets=[heavy,target];heavy.stance=target.stance='evade';heavy.pos.copy(target.pos);heavy.order={type:'attack',target};
    // Check the unchanged matchup on each body shot, including its current supply factor.
    // Give each target enough HP so body overkill cannot hide the multiplier.
    const matchupHit=(source,victim,multiplier)=>{
      for(const b of source.bodies)b.shotT=0;
      for(const b of victim.bodies){b.hp=b.max=1000/victim.bodies0;b.alive=true;}groundBodySync(victim);
      // 士気は小隊ごとに受ける（groundSupplyHit）。耐久と「士気×小隊の数」の合計が損害だけ減る
      const morale=()=>victim.groundMorale*(victim.groundPlatoons||1),before=victim.hpPool+morale(),real=damage;let expected=0,calls=0,valid=true;
      damage=(t,n,src,...rest)=>{if(src===source&&t===victim){calls++;const want=source.dmg*multiplier*groundSupplyAttackFactor(source)/groundBodiesPerPlatoon(source);valid&&=Math.abs(n-want)<1e-7;expected+=want*groundRuleSet().combat.damageScale*groundDamageFactor(victim);}return real(t,n,src,...rest);};
      try{groundStep(.05);}finally{damage=real;}
      return calls>0&&valid&&Math.abs(before-victim.hpPool-morale()-expected)<1e-7;
    };
    const heavyHit=matchupHit(heavy,target,groundRuleSet().combat.heavyTank);
    const enemyInfantry=savedFleets.find(f=>f.team===1&&f.groundKind==='infantry');
    fleets=[tank,enemyInfantry];tank.stance=enemyInfantry.stance='evade';tank.pos.copy(enemyInfantry.pos);tank.order={type:'attack',target:enemyInfantry};
    const tankHit=matchupHit(tank,enemyInfantry,groundRuleSet().combat.tankInfantry);
    fleets=savedFleets;heavy.order=tank.order=null;
    const matchup=heavyHit&&tankHit&&groundMoveKind(heavy)==='infantry';
    infantry.pos.copy(enemyInfantry.pos);groundCaptureStep(.05);groundDraw();
    const contestedSite=groundSites.find(s=>s.contested);
    // 拠点の競合は札の「〇〇優勢・競合／競合・拮抗」で見せ、陣地に黄色の斜線は描かない（2026-11-20。斜線は道路だけ）
    const contestedLabel=!!contestedSite&&contestedSite.owner===1&&contestedSite.el.textContent.includes('競合')&&!contestedSite.el.textContent.includes('秒');
    for(const f of fleets){f.stance='evade';if(f.team===1)f.alive=false;}
    // 敵全滅だけでは勝たず、3拠点を1つずつ実際に占領する。
    step(.05);const noWipeWin=!over;
    for(const s of groundSites){infantry.pos.copy(s.pos);for(let i=0;i<600&&!over;i++)step(.05);}
    const victory=over&&outcome===true&&document.getElementById('rh').textContent==='勝利'&&groundSites.every(s=>s.owner===0);
    groundDraw();const gauge=document.querySelectorAll('.ground-site .capture-track').length===op.groundSites.length;
    // 札は占拠の円より上に置き、円の中の部隊を隠さない。進み具合の％は文字に出さずゲージだけ（2026-11-14）
    const labelAbove=groundSites.every(s=>{const ring=s.ring.geometry.attributes.position;let top=Infinity;
      for(let i=0;i<ring.count;i++){const q=proj(new THREE.Vector3(ring.getX(i),ring.getY(i),ring.getZ(i)));if(q.z<=1)top=Math.min(top,q.y);}
      return s.el.style.visibility==='hidden'||s.el.getBoundingClientRect().bottom<=top+1;})&&!groundSites.some(s=>/青\d+%/.test(s.el.textContent));
    const road=groundTerritory.sections.length>0, alpha=new Set();
    const pixels=groundTerritory.canvas.getContext('2d').getImageData(0,0,480,360).data;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i])alpha.add(pixels[i]);
    const union=alpha.size===1&&alpha.has(102);
    return {stats,matchup,contestedLabel,noWipeWin,victory,gauge,labelAbove,road,union};
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
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../data/ground-rules.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../data/terrain/exercise2.js'),'utf8'),context);
  context.WOS_TERRAIN=context.window.WOS_TERRAIN;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../battle/terrain.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../battle/ground-supply.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../battle/ground.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../battle/ground-script.js'),'utf8'),context);
  const results=vm.runInContext(`(${captureCases.toString()})()`,context), failed=results.filter(r=>!r.ok);
  console.log(`| 占拠の固定場面（ブラウザ不要） | ${results.length-failed.length}/${results.length} 成功 |`);
  if(failed.length){console.error(failed);process.exitCode=1;}
}
