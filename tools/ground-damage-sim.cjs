/* クイック出撃（バイコヌール演習）をデバッグのオートモードで回し、兵科ごとの与ダメージを数える。
   node tools/ground-damage-sim.cjs [回数=3] [ゲーム秒=600]
   自軍はオートモード（地球の型の指揮官）、敵は作戦の指揮官。種は1から回数まで（ゲームと指揮官の乱数）。
   耐久と士気はそれぞれ damage の前後の差を記録する。地点攻撃と味方への誤射も同じ単位で集計。 */
const {openGame}=require('./browser.cjs');
function setupDamageSim(seed){
  let rng=seed>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const operation=WOS_DATA.operations.find(o=>o.id==='baikonur');operation.npcSeed=seed;
  document.body.classList.add('dbg-auto');
  WOS.start({op:'baikonur',fleets:operation.quick});if(talking)endTalk();endDeploy();setSpeed(0);
  const label=f=>f.groundKind==='sea'?'艦 '+f.type:groundRuleSet().unitTypes[f.groundKind]?.name||f.groundKind;
  const rows=new Map(),row=f=>{const k=f.team+'|'+label(f);if(!rows.has(k))rows.set(k,{team:f.team,kind:label(f),units:0,hp:0,morale:0,strikeHp:0,strikeMorale:0,bodies:0,killed:0,friendlyHp:0,friendlyMorale:0});return rows.get(k);};
  for(const f of fleets)row(f).units++;
  const live=t=>t.bodies?t.bodies.filter(b=>b.alive).length:(t.alive?1:0),morale=t=>Number.isFinite(t.groundMorale)?t.groundMorale:0;
  const original=damage;
  damage=function(t,amt,src,impact){
    const hp=t.hpPool,mo=morale(t),bodies=live(t),alive=t.alive,result=original.apply(this,arguments);
    if(src){
      const r=row(src),dh=Math.max(0,hp-t.hpPool),dm=Math.max(0,mo-morale(t));
      if(src.team===t.team){r.friendlyHp+=dh;r.friendlyMorale+=dm;}
      else{r.hp+=dh;r.morale+=dm;if(impact){r.strikeHp+=dh;r.strikeMorale+=dm;}r.bodies+=Math.max(0,bodies-live(t));if(alive&&!t.alive)r.killed++;}
    }
    return result;
  };
  window.damageSim={rows,start:gameSec};
}
function advanceDamageSim(limit){
  const end=Math.min(limit,gameSec-damageSim.start+30);
  while(gameSec-damageSim.start<end-1e-8&&!over)step(.05);
  return over||gameSec-damageSim.start>=limit-1e-8;
}
function damageSimResult(){
  const round=x=>+x.toFixed(1);
  return {seconds:round(gameSec-damageSim.start),result:over?(outcome?'自軍の勝ち':'自軍の負け'):'未決',
    rows:[...damageSim.rows.values()]};
}
async function runOnce(seed,seconds){
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    for(const fn of [advanceDamageSim,damageSimResult])await page.evaluate('window.'+fn.name+'='+fn.toString());
    await page.evaluate(setupDamageSim,seed);
    while(!await page.evaluate(limit=>advanceDamageSim(limit),seconds));
    if(errors.length)throw new Error(errors.join('\n'));
    return await page.evaluate(()=>damageSimResult());
  }finally{await browser.close();}
}
const measures=['hp','morale','strikeHp','strikeMorale','bodies','killed','friendlyHp','friendlyMorale'];
function printRows(title,rows,runs){
  console.log(`\n### ${title}\n\n|陣営|兵科|隊数|耐久打撃|士気打撃|地点攻撃の耐久|地点攻撃の士気|撃破した体|撃破した隊|誤射の耐久|誤射の士気|\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for(const row of rows.sort((a,b)=>a.team-b.team||b.hp-a.hp))
    console.log('|'+[row.team?'敵':'自軍',row.kind,row.units,...measures.map(key=>(row[key]/runs).toFixed(1))].join('|')+'|');
}
(async()=>{
  const runs=Number(process.argv[2]||3),seconds=Number(process.argv[3]||600),sums=new Map();
  for(let seed=1;seed<=runs;seed++){
    const r=await runOnce(seed,seconds);
    printRows(`種${seed} ${r.result}（${r.seconds}ゲーム秒）`,r.rows,1);
    for(const row of r.rows){
      const key=row.team+'|'+row.kind,previous=sums.get(key);
      if(previous)for(const measure of measures)previous[measure]+=row[measure];
      else sums.set(key,{...row});
    }
  }
  printRows(runs+'回の平均',[...sums.values()],runs);
})().catch(e=>{console.error(e);process.exitCode=1;});
