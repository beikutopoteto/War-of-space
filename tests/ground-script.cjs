/* 台本の頭はNodeだけ、適用は実ゲームChromium。既存の作戦データを保存して戻す。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
function nodeChecks(){
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../battle/ground-script.js'),'utf8'),ctx);
  const evalScript=(script,state)=>JSON.parse(JSON.stringify(ctx.groundScriptEval(script,state)));
  const seed=()=>({time:100,sites:[{id:'B',owner:0,heldBy:[0]},{id:'F',owner:1,heldBy:[1]},{id:'C',owner:1,heldBy:[0,1]}],
    teams:[{initial:200,power:120,alive:2,exited:1},{initial:100,power:40,alive:1,exited:0}],
    units:[{team:0,alive:true,at:[2,3]},{team:0,alive:true,at:[3,3]},{team:1,alive:true,at:[20,30]}],flags:{ready:true},done:{first:70}});
  const out=[],test=(name,fn)=>{try{fn();out.push({name,ok:true});}catch(e){out.push({name,ok:false,error:e.message});}};
  const cond=c=>evalScript({win:c},seed()).end==='win';
  for(const [name,yes,no] of [
    ['at',{at:100},{at:100.01}],['site',{site:'B',owner:0},{site:'B',owner:null}],
    ['lost',{lost:'C',team:0},{lost:'F',team:0}],['power',{power:{team:1,below:.5}},{power:{team:1,below:.4}}],
    ['inside',{inside:{team:0,at:[2,3],radiusKm:1,count:2}},{inside:{team:0,at:[2,3],radiusKm:.9,count:2}}],
    ['flag',{flag:'ready'},{flag:'missing'}],['after',{after:{event:'first',sec:30}},{after:{event:'missing',sec:0}}],
    ['hold',{hold:{site:'B',team:0,until:100}},{hold:{site:'F',team:0,until:100}}],
    ['exited',{exited:{team:0,count:1}},{exited:{team:0,count:2}}],
    ['all / any',{all:[{any:[{flag:'missing'},{flag:'ready'}]},{at:100}]},{any:[{all:[{at:101},{flag:'ready'}]},{at:200}]}]
  ])test(name,()=>{assert.equal(cond(yes),true);assert.equal(cond(no),false);});
  test('中立の持ち主、初めから未所有のlost',()=>{const s=seed();s.sites[0].owner=null;assert.equal(evalScript({win:{site:'B',owner:null}},s).end,'win');assert.equal(evalScript({win:{lost:'B',team:0}},s).end,'win');assert.equal(cond({lost:'B',team:1}),false);});
  test('wiped は離脱数も見る',()=>{const s=seed();s.teams[1].alive=0;assert.equal(evalScript({win:{wiped:1}},s).end,'win');s.teams[1].exited=1;assert.equal(evalScript({win:{wiped:1}},s).end,null);});
  test('inside は死亡・離脱・搭乗を数えない',()=>{for(const key of ['exited','embarked','alive']){const s=seed();s.units[0][key]=key==='alive'?false:true;assert.equal(evalScript({win:{inside:{team:0,at:[2,3],radiusKm:1,count:2}}},s).end,null);}});
  test('power 分母0では発火しない',()=>{const s=seed();s.teams[1].initial=0;assert.equal(evalScript({win:{power:{team:1,below:1}}},s).end,null);});
  test('loseをwinより先に毎ステップ判定',()=>{const s=seed();s.eventsDue=false;assert.equal(evalScript({win:{at:0},lose:{at:0}},s).end,'lose');});
  test('結果の一覧は上の最初の理由',()=>{const r=evalScript({win:[{when:{at:101},text:'まだ'},{when:{at:100},text:'防衛',log:['管制','成功']},{when:{at:0},text:'後'}]},seed());assert.equal(r.why.text,'防衛');assert.deepEqual(r.why.log,['管制','成功']);});
  test('once省略・true・falseと出来事の0.5秒ゲート',()=>{const script={events:[{id:'first',when:{at:0},do:[{flag:'a'}]},{id:'again',once:false,when:{at:0},do:[{flag:'b'}]},{id:'third',once:true,when:{at:0},do:[{flag:'c'}]}]},s=seed();s.done.again=0;assert.deepEqual(evalScript(script,s).fired,['again','third']);s.eventsDue=false;assert.deepEqual(evalScript(script,s).actions,[]);});
  test('全部のすることを順番通り返す・入力を変えない',()=>{const actions=[{spawn:{team:1,via:'edge',units:[]}},{spawn:{team:0,via:'sea',units:[]}},{spawn:{team:1,via:'air',warnSec:20,descentSec:10,units:[]}},{say:['管制','通信']},{objective:'守る'},{setWin:{at:300}},{setLose:{wiped:0}},{intent:{team:1,type:'hold',zones:['F'],until:600,style:'firm'}},{owner:{site:'C',team:1}},{flag:'ok'},{mark:{label:'印',at:[1,2],sec:30}},{exit:{id:'west',team:0,at:[1,2],radiusKm:2}},{end:'win'},{end:'lose'}],script={events:[{id:'new',when:{after:{event:'first',sec:30}},do:actions}]},s=seed(),before=JSON.stringify({script,s});const r=evalScript(script,s);assert.deepEqual(r.actions,actions);assert.equal(JSON.stringify({script,s}),before);assert.deepEqual(r.fired,['new']);});
  return out;
}
async function checkGroundScript(page,check,{shot}={}){
  const menu=await page.evaluate(()=>{
    window.scriptTestMenu={open:menuOpen,hidden:document.getElementById('menu').hidden,inmenu:document.body.classList.contains('inmenu')};
    WOS.openMenu();const debugClosed=document.getElementById('dbgB').hidden;if(debugClosed)document.getElementById('dbgT').click();const free=()=>document.querySelector('#dbgB [data-dbg=free]'),saved=free().checked;
    const list=()=>{document.querySelector('#mainNav [data-go=mode]').click();document.querySelector('[data-s=mode] [data-go=sortie]').click();return [...document.querySelectorAll('#opList [data-op]')].map(b=>b.dataset.op);};
    if(free().checked)free().click();const hidden=!list().includes('groundScriptTest');
    free().click();const shown=list(),debug=shown.includes('groundScriptTest')&&!shown.includes('groundExercise2');
    if(free().checked!==saved)free().click();if(debugClosed)document.getElementById('dbgT').click();return {hidden,debug};
  });
  check(menu.hidden&&menu.debug,'地上台本: dbg.freeのときだけ隠し演習を一覧へ');
  await page.evaluate(()=>{
    window.scriptTestOriginal=OPS.find(o=>o.id==='groundScriptTest');window.scriptTestIndex=OPS.indexOf(scriptTestOriginal);
    window.scriptTestStart=(script,withNpc=false)=>{
      OPS[scriptTestIndex]={...scriptTestOriginal,...(!withNpc?{npc:null}:{}),groundScript:script||scriptTestOriginal.groundScript};
      WOS.start({op:'groundScriptTest'});autoMode=false;menuOpen=true;if(talking)endTalk();setSpeed(0);endDeploy();
      for(const f of fleets){groundClearOrders(f);f.stance='evade';}
    };
    window.scriptTestAdvance=to=>{while(gameSec<to-1e-8&&!over){step(Math.min(.05,(to-gameSec)/groundRuleSet().movement.timeScale));for(const f of fleets){groundClearOrders(f);f.stance='evade';}}};
    scriptTestStart();
  });
  try{
    const timeline=await page.evaluate(()=>{
      const initial=fleets.length;scriptTestAdvance(59.99);const before=fleets.length===initial;
      scriptTestAdvance(60);const reinforcement=fleets.length===initial+2&&groundScriptState.done.east===60;
      scriptTestAdvance(100);groundDraw();const warning=groundScriptState.pending.length===1&&groundScriptState.marks.length===2&&document.querySelectorAll('.ground-script-mark').length===2;
      return {initial,before,reinforcement,warning,at:gameSec};
    });
    check(timeline.before&&timeline.reinforcement,'地上台本: 60秒に敵増援2隊',JSON.stringify(timeline));
    check(timeline.warning,'地上台本: 100秒に降下の予告と赤い円');
    if(shot){await page.evaluate(()=>{camAnim=null;controls.target.copy(groundPoint(8,27));camera.position.copy(controls.target).add(new THREE.Vector3(0,90,90));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);groundDraw();renderer.render(scene,camera);});await page.waitForTimeout(250);await shot();}
    const descent=await page.evaluate(()=>{
      scriptTestAdvance(119.99);const before=fleets.length;scriptTestAdvance(120);groundDraw();
      const drops=fleets.filter(f=>f.name.startsWith('降下 ')),f=drops[0],position=f.pos.clone();
      const factor=groundDamageFactor(f);order(f,{type:'move',dest:groundPoint(15,27)});scriptTestAdvance(125);
      const stopped=f.pos.distanceTo(position)<1e-8&&!f.order&&!groundCanFire(f,fleets[0])&&!groundAutoAAReady(f);
      // 同じ遮蔽・回避・士気の条件で、実damageのhp+士気減少量を比較する。
      const source=fleets.find(u=>u.team===0),saved=groundCanFire;source.pos.copy(f.pos);groundUpdateSight();let hits=[];
      try{groundCanFire=()=>true;for(const descending of [true,false]){f.groundDescentUntil=descending?gameSec+5:0;f.hpPool=f.groundMaxHp;f.groundMorale=100;f.eva=0;const value=f.hpPool+f.groundMorale;damage(f,1,source);hits.push(value-f.hpPool-f.groundMorale);}}finally{groundCanFire=saved;f.groundDescentUntil=130;}
      scriptTestAdvance(130);const ready=!groundScriptDescending(f)&&groundCommandAllowed(f,'move');
      return {before,drops:drops.length,pending:groundScriptState.pending.length,marks:groundScriptState.marks.length,factor,stopped,ready,hitRatio:hits[0]/hits[1]};
    });
    check(descent.drops===2&&descent.pending===0&&descent.marks===0,'地上台本: 120秒に歩兵2隊が降下・予告終了',JSON.stringify(descent));
    check(descent.factor===1.5&&descent.stopped&&descent.ready&&Math.abs(descent.hitRatio-1.5)<1e-7,'地上台本: 降下中10秒は行動停止・実被弾1.5倍');
    const win=await page.evaluate(()=>{scriptTestAdvance(299.99);const before=!over;scriptTestAdvance(300);return {before,over,outcome,time:gameSec,text:document.getElementById('rp').textContent};});
    check(win.before&&win.over&&win.outcome&&Math.abs(win.time-300)<1e-7,'地上台本: Bを300秒保持して勝利',JSON.stringify(win));
    await page.waitForSelector('#result:not([hidden])');
    const lose=await page.evaluate(()=>{scriptTestStart();groundSites.find(s=>s.id==='B').owner=1;step(.05);return {over,outcome,time:gameSec};});
    check(lose.over&&lose.outcome===false&&Math.abs(lose.time-.06)<1e-7,'地上台本: Bを失った次のステップで敗北',JSON.stringify(lose));
    await page.waitForSelector('#result:not([hidden])');
    const actions=await page.evaluate(()=>{
      const script={objective:'最初',loseText:'試験の敗北条件',win:{at:99999},lose:{wiped:0},events:[{id:'parts',when:{at:0},do:[
        {spawn:{team:0,via:'edge',units:[{name:'台本 自軍中隊',kind:'infantry',at:[7,27]}]}},
        {spawn:{team:1,via:'sea',units:[{name:'台本 海上隊',kind:'sea',type:'cl',at:[33,4],band:'sea'}]}},
        {say:['演習管制','台本の通信確認']},{objective:'出口へ進め'},{owner:{site:'C',team:0}},{flag:'ready'},
        {intent:{team:1,type:'hold',zones:['F'],until:600,style:'firm'}},{mark:{label:'短い印',at:[8,27],sec:1}},
        {exit:{id:'west',team:0,at:[7,27],radiusKm:.1}},{setWin:{flag:'finish'}},{setLose:{flag:'fail'}}]}]};
      scriptTestStart(script,true);npcGroundInit();const data=JSON.stringify(op),initial=groundScriptState.initial.slice();
      gameSec=.06;groundScriptStep(.06);groundDraw();updateGoal();
      const added=fleets.find(f=>f.name==='台本 自軍中隊'),sea=fleets.find(f=>f.name==='台本 海上隊'),c=npcGroundState.commanders.get(1),sit=npcGroundSituation(c);
      const spawned=!!added.companyId&&groundOrg.companies.some(u=>u.id===added.companyId)&&added.groundExited==='west';
      // いったん出口から離して別の自軍増援も名簿で確認。
      groundScriptApply({spawn:{team:0,via:'edge',units:[{name:'名簿の増援',kind:'infantry',at:[9,27]}]}});
      const roster=[...document.querySelectorAll('#roster button')].some(b=>b.title?.includes('名簿の増援')||b.getAttribute('aria-label')?.includes('名簿の増援')||b.textContent.includes('名簿の増援'));
      const hud=document.getElementById('goalText')?.textContent||document.getElementById('goal').textContent;
      c.nextThink=gameSec;npcGroundStep();
      const result={spawned,roster,decision:c.posture==='defend',sea:sea?.groundKind==='sea',owner:groundSites.find(s=>s.id==='C').owner===0,flag:groundScriptState.flags.ready,
        intent:sit.goal.type==='hold'&&sit.goal.style==='firm'&&sit.units.some(u=>u.id===sea.id),
        objective:hud.includes('出口へ進め'),say:(document.getElementById('bp').textContent+document.getElementById('log').textContent).includes('台本の通信確認'),
        marks:groundScriptState.marks.length===2,overrides:groundScriptCurrent().win.flag==='finish'&&groundScriptCurrent().lose.flag==='fail',unchanged:JSON.stringify(op)===data};
      // 初め＋出した時の耐久を分母に、離脱時の耐久を分子に残す。
      const state=groundScriptSnapshot();result.power=state.teams[0].initial===initial[0]+added.groundMaxHp+fleets.find(f=>f.name==='名簿の増援').groundMaxHp&&state.teams[0].exited===1;
      for(const f of fleets.filter(f=>f.team===0&&!f.groundExited))f.alive=false;
      select(added);result.unselectable=selected!==added&&!orderTargets().includes(added);
      result.noWipe=groundScriptEval({lose:{wiped:0}},groundScriptSnapshot()).end===null&&!shown(added)&&!groundCommandAllowed(added,'move')&&!groundCanFire(fleets.find(f=>f.team===1),added);
      gameSec=1.1;groundScriptStep(.5);groundDraw();result.markExpired=groundScriptState.marks.length===1&&document.querySelectorAll('.ground-script-mark').length===1;
      return result;
    });
    for(const [name,ok] of Object.entries(actions))check(ok,'地上台本: '+name);
    const resetResult=await page.evaluate(()=>{scriptTestStart();return fleets.length===9&&!fleets.some(f=>f.groundExited)&&groundScriptState.spawned.length===0&&groundScriptState.marks.length===0&&groundScriptState.exits.length===0&&Object.keys(groundScriptState.flags).length===0&&Object.keys(groundScriptState.done).length===0&&Object.keys(groundScriptState.intents).length===0&&Object.keys(groundScriptState.overrides).length===0&&!groundScriptState.result&&!document.querySelector('.ground-script-mark');});
    check(resetResult,'地上台本: やり直しで隊・旗・印・出口・上書きを初期化');
    for(const side of ['win','lose']){
      const changed=await page.evaluate(side=>{scriptTestStart({win:{at:999},lose:{at:999},events:[{id:'change',when:{at:0},do:[{[side==='win'?'setWin':'setLose']:{flag:'newEnd'}},{flag:'newEnd'}]}]});step(.05);return over&&outcome===(side==='win');},side);
      check(changed,'地上台本: set'+side+'の条件で即判定');await page.waitForSelector('#result:not([hidden])');
      const result=await page.evaluate(side=>{scriptTestStart({win:{at:999},lose:{at:999},events:[{id:'end',when:{at:0},do:[{end:side}]}]});step(.05);return over&&outcome===(side==='win');},side);
      check(result,'地上台本: end '+side);await page.waitForSelector('#result:not([hidden])');
    }
    for(const side of ['win','lose']){
      const result=await page.evaluate(side=>{const rule=[{when:{at:999},text:'未到達'},{when:{at:0},text:side+'の理由',log:['演習管制',side+'の通信']}];scriptTestStart({win:side==='win'?rule:{at:999},lose:side==='lose'?rule:{at:999}});step(.05);return document.getElementById('rp').textContent.includes(side+'の理由')&&(document.getElementById('bp').textContent+document.getElementById('log').textContent).includes(side+'の通信');},side);
      check(result,'地上台本: 条件ごとの結果と通信 '+side);await page.waitForSelector('#result:not([hidden])');
    }
  }finally{
    await page.evaluate(()=>{OPS[scriptTestIndex]=scriptTestOriginal;reset({op:'groundExercise2'});setSpeed(0);endDeploy();menuOpen=scriptTestMenu.open;document.getElementById('menu').hidden=scriptTestMenu.hidden;document.body.classList.toggle('inmenu',scriptTestMenu.inmenu);delete window.scriptTestMenu;delete window.scriptTestStart;delete window.scriptTestAdvance;delete window.scriptTestOriginal;delete window.scriptTestIndex;});
  }
}
module.exports={nodeChecks,checkGroundScript};
if(require.main===module){const rows=nodeChecks();for(const r of rows.filter(r=>!r.ok))console.error(r);console.log(`地上台本 Node: ${rows.filter(r=>r.ok).length}/${rows.length} 成功`);if(rows.some(r=>!r.ok))process.exitCode=1;}
