/* HEADの橋渡しと現在の橋渡しで既存4作戦を同じ乱数・60ゲーム秒で比較。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {openGame}=require('./browser.cjs');
function sampleLegacy(){
 const out={};
 for(const [id,tutorial] of [['baikonur',false],['baikonur',true],['groundExercise2',false],['groundScriptTest',false]]){
  let rng=1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const source=OPS.find(o=>o.id===id);WOS.start({op:id,fleets:(tutorial?source.groundTutorial:source).quick,tutorial});setSpeed(0);menuOpen=true;if(talking)endTalk();if(deploying)endDeploy();
  for(let i=0;i<1200&&!over;i++)step(.05/groundRuleSet().movement.timeScale);
  const round=n=>typeof n==='number'?+n.toFixed(6):n;
  out[tutorial?'tutorial2':id]={time:round(gameSec),over,outcome,sites:groundSites.map(z=>({id:z.id,owner:z.owner,progress:z.progress.map(round)})),
   units:fleets.map(f=>({name:f.name,team:f.team,kind:f.groundKind,alive:f.alive,hp:round(f.hpPool),pos:[f.pos.x,f.pos.y,f.pos.z].map(round),supply:round(f.groundSupply),morale:round(f.groundMorale),order:f.order?.type||null,target:f.order?.target?.name||null,dest:f.order?.dest?[f.order.dest.x,f.order.dest.z].map(round):null,embarked:f.embarked?.name||null})),
   commanders:Object.fromEntries(Object.entries(npcDebug()).map(([team,d])=>[team,{posture:d.posture,plan:d.plan,log:d.log}]))};
 }
 return out;
}
async function run(){
 const beforeCode=execFileSync('git',['show','HEAD:battle/npc-ground.js'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}),samples={};
 for(const mode of ['before','after']){
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{if(mode==='before'){await page.route('**/battle/npc-ground.js',route=>route.fulfill({body:beforeCode,contentType:'application/javascript'}));await page.reload();}
   samples[mode]=await page.evaluate(sampleLegacy);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 }
 assert.deepEqual(samples.after,samples.before);
 fs.writeFileSync(path.join(__dirname,'../test-results/npc-lift-legacy.json'),JSON.stringify(samples,null,2)+'\n');
 console.log('合格 既存4作戦の60秒後の位置・耐久・命令・補給・士気・拠点・NPC判断がHEADと一致');
}
module.exports={run,sampleLegacy};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
