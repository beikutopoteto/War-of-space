/* 計測器の集計・リングログ・profileの境界を小さな時計で確認。実ゲームの実測ではない。 */
const assert=require('node:assert/strict'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const sim=require('../tools/npc-sim.cjs');
function nodeChecks(){
 const rows=[],test=(name,fn)=>{fn();rows.push({name,ok:true});};
 test('意図の例を読み、フラグの値を位置引数へ混ぜない',()=>{
  const cfg=sim.parseArgs(['--intent1','hold:firm:F,E','exercise2','earth','mars','standard','1','600','--intent0','seize','--brief']);
  assert.equal(cfg.terrain,'exercise2');assert.equal(cfg.seconds,600);assert.deepEqual(cfg.doctrines,['earth','mars']);
  assert.deepEqual(cfg.intents,{0:{type:'seize'},1:{type:'hold',style:'firm',zones:['F','E']}});
  assert.deepEqual(sim.parseIntent('delay:delay:F:300'),{type:'delay',style:'delay',zones:['F'],until:300});
  assert.deepEqual(sim.parseArgs(['--intent1=withdraw:::0']).intents[1],{type:'withdraw',until:0});
  assert.deepEqual(sim.parseArgs([]).intents,{});
 });
 test('不明な意図・型・期限・欠けた引数は実行前に拒否する',()=>{
  for(const value of ['rush','hold:unknown','delay:delay:F:no','delay:delay:F:-1','hold:firm:F,,E','hold:firm:F:1:extra'])assert.throws(()=>sim.parseIntent(value),Error,value);
  for(const args of [['--intent1'],['--intent0','--brief'],['--intent2','seize']])assert.throws(()=>sim.parseArgs(args),Error);
 });
 test('追加4条件は演習場・600秒・seed1、青攻撃／赤4型で保存名も重複しない',()=>{
  const {cases,caseName}=require('../tools/npc-measure.cjs'),extra=cases.filter(c=>c.intents);
  assert.equal(cases.length,11);assert.deepEqual(extra.map(c=>c.intents[1].style),['firm','mobile','delay','depth']);
  for(const c of extra){assert.equal(c.terrain,'exercise2');assert.equal(c.seconds,600);assert.equal(c.seed,1);assert.deepEqual(c.intents[0],{type:'seize'});assert.deepEqual(c.intents[1].zones,['F']);assert.equal(c.intents[1].type,c.intents[1].style==='delay'?'delay':'hold');assert.equal(c.intents[1].until,c.intents[1].style==='delay'?300:undefined);}
  assert.equal(new Set(cases.map(caseName)).size,cases.length);
 });
 const commanders=new Map([0,1].map(team=>[team,{team,plan:{tasks:[{type:team?'seize':'hold',units:[{id:team+1}]}]},unit:new Map([[team+1,{task:team?'seize:B':'hold:A'}]]),log:[]}]));
 const box={performance,console,gameSec:0,over:false,outcome:true,talking:false,
  op:{groundHQ:{0:'A',1:'B'}},WOS_DATA:{operations:[{id:'baikonur',quick:[]}]},
  fleets:[0,1].map(team=>({id:team+1,team,groundKind:team?'vehicle':'infantry',alive:true,hpPool:100,pos:{x:team*10,z:0},groundSupply:team?20:19,groundMorale:100})),
  groundSites:[{id:'A',owner:0},{id:'B',owner:1}],npcGroundState:{commanders,timings:{count:0,total:0,max:0}},
  reset(){},setSpeed(){},endDeploy(){},groundAbsent:()=>false,groundSupplyRules:()=>({max:100}),groundFireSolution:()=>false,
  npcGroundPower:()=>1,npcDebug:()=>Object.fromEntries([...commanders].map(([team,c])=>[team,{plan:c.plan,log:c.log}])),groundMapX:x=>x,groundMapY:y=>y,
  npcLog(c,t,what,zone,why){c.log.push({t,what,zone,why});if(c.log.length>200)c.log.shift();}};
 box.window=box;
 for(const name of ['groundUpdateSight','groundPath','groundMovePath','groundFollow','groundSupplyRoadCapture','groundCaptureStep','groundSupplyRefresh','groundSupplyBefore','groundSupplyAfter','groundPaintTerritory','groundDraw','groundStrikeStep','npcGroundStep','npcThink'])box[name]=()=>{};
 box.groundUpdateSight=()=>box.groundFireSolution();
 box.step=dt=>{box.gameSec+=dt;box.groundUpdateSight();if(box.gameSec>=2)box.groundSites[1].owner=0;if(box.gameSec>=3)box.fleets[0].groundSupply=80;if(box.gameSec>=31)box.over=true;};
 const context=vm.createContext(box),run=code=>vm.runInContext(code,context);
 for(const name of ['setupNpcSim','advanceNpcSim','npcSimResult','installNpcProfile'])run('globalThis.'+name+'='+sim[name].toString());
 box.cfg={terrain:'exercise2',doctrines:['mars','earth'],level:'standard',seed:1,seconds:60,idle:false,intents:{0:{type:'seize'},1:{type:'delay',style:'delay',zones:['B'],until:300}}};
 run('setupNpcSim(cfg);installNpcProfile()');
 test('setupは軍ごとのintentを作戦へ渡し、idleでは赤軍だけに渡す',()=>{
  const source=box.WOS_DATA.operations[0];assert.deepEqual(source.npc[0].intent,box.cfg.intents[0]);assert.deepEqual(source.npc[1].intent,box.cfg.intents[1]);
  // 別の小さな環境で初期化し、集計中の時計・ログは変更しない。
  const idleBox={...box,WOS_DATA:{operations:[{id:'baikonur',quick:[]}]},npcLog(){}};idleBox.window=idleBox;
  const idleContext=vm.createContext(idleBox);vm.runInContext('('+sim.setupNpcSim.toString()+')('+JSON.stringify({...box.cfg,idle:true})+')',idleContext);
  assert.deepEqual(Object.keys(idleBox.WOS_DATA.operations[0].npc),['1']);assert.equal(idleBox.WOS_DATA.operations[0].npc[1].intent.until,300);
 });
 for(let i=0;i<250;i++)box.npcLog(commanders.get(0),i,'task:seize','B','test');
 test('頭の200件リングを越えて対象ログを保持',()=>{assert.equal(box.npcMeasure.logs.length,250);assert.equal(commanders.get(0).log.length,200);});
 test('30秒ごとに任務隊数と兵科・補給・士気を保存',()=>{
  assert.equal(run('advanceNpcSim(30)'),false);const sample=box.npcMeasure.samples[0];assert.equal(sample.time,30);assert.equal(sample.tasks[0].hold,1);assert.equal(sample.tasks[1].seize,1);
  assert.equal(sample.units[0].groundKind,'infantry');assert.equal(sample.units[0].supply,80);assert.equal(sample.units[0].morale,100);
 });
 test('補給20%未満の最大数を、途中の回復と20%ちょうどから区別',()=>{assert.equal(box.npcMeasure.lowSupplyMax[0],1);assert.equal(box.npcMeasure.lowSupplyMax[1],0);});
 test('占領時刻と終端の勝敗を保存',()=>{assert.equal(box.npcMeasure.events.length,1);assert.equal(box.npcMeasure.events[0].site,'B');assert.equal(box.npcMeasure.events[0].time,2);assert.equal(run('advanceNpcSim(60)'),true);assert.equal(run('npcSimResult().winner'),0);});
 test('関数計測はstep内だけを数え、集計用の射撃照会は除外',()=>{
  const p=box.npcProfile.rows;assert.equal(p.step.count,box.npcMeasure.steps);assert.equal(p.groundFireSolution.count,p.step.count);assert(p.step.total>=p.step.self);
  box.groundUpdateSight();assert.equal(p.groundUpdateSight.count,p.step.count);
 });
 test('型の推移は200件リングを越えて保持しbriefにもstyle行を出す',()=>{
  box.npcLog(commanders.get(1),0,'style:firm',null,'hold');box.npcLog(commanders.get(1),300,'style:delay',null,'力の比');
  const r=run('npcSimResult()'),text=sim.brief(r);
  assert.deepEqual(Array.from(r.logs.filter(e=>e.what.startsWith('style:')),e=>e.what),['style:firm','style:delay']);
  assert.match(text,/log 0秒 1軍 style:firm/);assert.match(text,/log 300秒 1軍 style:delay/);
 });
 test('briefは要求された経過だけを出し、最終JSONにも補給を含める',()=>{
  const r=run('npcSimResult()'),text=sim.brief(r);assert.match(text,/占領 2秒 B → 0/);assert.match(text,/任務 30秒 0軍 hold:1 \/ 1軍 seize:1/);assert.match(text,/補給20%未満 最大: 0軍 1隊 \/ 1軍 0隊/);assert(!text.includes('"config"'));assert.equal(r.units[0].supply,80);assert.equal(r.units[0].morale,100);
 });
 return rows;
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks();console.log(`NPC計測器 ${rows.length}/${rows.length}`);}
