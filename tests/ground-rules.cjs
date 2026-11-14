/* 地上規則の重ね方・再構築・入力の独立性を実データと実入口で確認する。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
function nodeChecks(){
  const ctx=vm.createContext({op:{ground:'exercise2'}});ctx.window=ctx;
  const run=s=>vm.runInContext(s,ctx),rows=[];
  for(const file of ['data/ground-rules.js','data/terrain/exercise2.js','data/terrain/baikonur2.js','data/terrain/wide-fields.js','data/ground-org.js'])run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  const check=(name,fn)=>{try{fn();rows.push({name,ok:true});}catch(error){rows.push({name,ok:false,error:error.message});}};
  check('全地形から12規則を除き基本表の値を使う',()=>{
    for(const id of ['exercise2','baikonur2','field150','field300']){
      run(`op={ground:'${id}'};rebuildGroundRuleSet();`);
      assert.equal(run(`Object.keys(WOS_GROUND_RULES).length===12&&Object.keys(WOS_GROUND_RULES).every(k=>!Object.hasOwn(WOS_TERRAIN[op.ground],k))`),true);
      assert.equal(run('groundRuleSet().engineering.seconds'),20);
      assert.equal(run('groundRuleSet().unitTypes.vehicle.hp'),100);
    }
  });
  check('基本→地形→作戦→試合中の順に深く重ね配列とnullは置換',()=>{
    run(`WOS_TERRAIN.fixture={overrides:{sight:{basic:41,eyeHeight:2},movement:{river:{vehicle:.1}},supply:{terrainIdle:['平地']}}};
      op={ground:'fixture',groundRuleOverrides:{sight:{basic:42},movement:{river:{vehicle:.2}},supply:{terrainIdle:['森林']}}};
      rebuildGroundRuleSet({sight:{basic:43},movement:{river:{vehicle:.3}},supply:{terrainIdle:['河川']},strike:{vehicle:null}});`);
    assert.equal(run(`groundRuleSet().sight.basic===43&&groundRuleSet().sight.eyeHeight===2&&groundRuleSet().sight.scout===60&&groundRuleSet().movement.river.vehicle===.3&&groundRuleSet().movement.river.infantry===.2&&groundRuleSet().supply.terrainIdle.join()==='河川'&&groundRuleSet().strike.vehicle===null`),true);
  });
  check('繰り返し読む間は同じ結果で入力を読み直さない',()=>{
    run(`var reads=0;Object.defineProperty(op.groundRuleOverrides.sight,'basic',{enumerable:true,get(){reads++;return 42;}});var first=rebuildGroundRuleSet({sight:{basic:43}}),readOnce=reads;`);
    assert.equal(run('Array.from({length:100},()=>groundRuleSet()).every(r=>r===first)&&reads===readOnce'),true);
  });
  check('結果の変更が基本・地形・作戦・試合中の入力に漏れない',()=>{
    run(`var changes={movement:{river:{vehicle:.3}},supply:{terrainIdle:['河川']}};rebuildGroundRuleSet(changes);
      groundRuleSet().movement.river.vehicle=.9;groundRuleSet().supply.terrainIdle.push('山岳');groundRuleSet().unitTypes.vehicle.hp=999;`);
    assert.equal(run(`WOS_GROUND_RULES.unitTypes.vehicle.hp===100&&WOS_TERRAIN.fixture.overrides.movement.river.vehicle===.1&&op.groundRuleOverrides.movement.river.vehicle===.2&&changes.movement.river.vehicle===.3&&changes.supply.terrainIdle.join()==='河川'`),true);
  });
  check('再構築で変化を反映し引数なしのやり直しで試合中の変更を消す',()=>{
    run('var previous=groundRuleSet();rebuildGroundRuleSet({sight:{basic:44}});');
    assert.equal(run('previous!==groundRuleSet()&&groundRuleSet().sight.basic===44'),true);
    run('rebuildGroundRuleSet();');
    assert.equal(run('groundRuleSet().sight.basic===42&&groundRuleSet().unitTypes.vehicle.hp===100'),true);
  });
  check('広域のfogStep上書きを維持し地形切替で結果を分ける',()=>{
    run("op={ground:'field150'};var field=groundRuleSet();");
    assert.equal(run('field.sight.fogStep'),3.125);
    run("op={ground:'field300'};");assert.equal(run('groundRuleSet().sight.fogStep'),6.25);
    assert.equal(run('field!==groundRuleSet()&&field.sight.fogStep===3.125'),true);
    run("op={ground:'exercise2'};");assert.equal(run('groundRuleSet().sight.fogStep'),2);
  });
  check('既定6中隊と出撃を作戦・地形なしでも作る',()=>{
    run('delete WOS_TERRAIN;var defaults=WOS_GROUND_ORG.defaults(),sortie=WOS_GROUND_ORG.sortie(defaults);');
    assert.deepEqual(Array.from(run('defaults.companies'),c=>[c.name,c.kind]),[
      ['第1 戦車中隊','vehicle'],['第2 強化歩兵中隊','infantry'],['第3 重強化歩兵中隊','heavyInfantry'],
      ['第4 戦闘航空隊','fighter'],['第5 攻撃航空隊','attack'],['第6 陸戦型 W.A.S. 試験隊','was']]);
    assert.equal(run(`sortie.fleets.length===6&&sortie.fleets[0].name===defaults.companies[0].name&&sortie.fleets[0].groundKind==='vehicle'&&sortie.fleets[5].groundKind==='was'&&sortie.fleets.every(f=>!f.pos&&!f.at)&&WOS_GROUND_ORG.types().vehicle.hp===100`),true);
  });
  return rows;
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'✓ ':'✗ ')+r.name+(r.error?' '+r.error:''));assert(rows.every(r=>r.ok));}
