/* クイック出撃（バイコヌール演習）をデバッグのオートモードで回し、兵科ごとの与ダメージを数える。
   node tools/ground-damage-sim.cjs [回数=3] [ゲーム秒=600]
   自軍はオートモード（地球の型の指揮官）、敵は作戦の指揮官。種は1から回数まで（ゲームと指揮官の乱数）。
   与ダメージは敵に実際に減らした耐久と士気（damage の前後の差）。味方への誤射は別に数える。 */
const {openGame}=require('./browser.cjs');
function setupDamageSim(seed){
  let rng=seed>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const operation=WOS_DATA.operations.find(o=>o.id==='baikonur');operation.npcSeed=seed;
  document.body.classList.add('dbg-auto');
  WOS.start({op:'baikonur',fleets:operation.quick});if(talking)endTalk();endDeploy();setSpeed(0);
  const label=f=>f.groundKind==='sea'?'艦 '+f.type:groundRuleSet().unitTypes[f.groundKind]?.name||f.groundKind;
  const rows=new Map(),row=f=>{const k=f.team+'|'+label(f);if(!rows.has(k))rows.set(k,{team:f.team,kind:label(f),units:0,total:0,hp:0,morale:0,strike:0,bodies:0,killed:0,friendly:0});return rows.get(k);};
  for(const f of fleets)row(f).units++;
  const live=t=>t.bodies?t.bodies.filter(b=>b.alive).length:(t.alive?1:0),morale=t=>Number.isFinite(t.groundMorale)?t.groundMorale:0;
  const original=damage;
  damage=function(t,amt,src,impact){
    const hp=t.hpPool,mo=morale(t),bodies=live(t),alive=t.alive,result=original.apply(this,arguments);
    if(src){
      const r=row(src),dh=Math.max(0,hp-t.hpPool),dm=Math.max(0,mo-morale(t));
      if(src.team===t.team)r.friendly+=dh+dm;
      else{r.hp+=dh;r.morale+=dm;r.total+=dh+dm;if(impact)r.strike+=dh+dm;r.bodies+=Math.max(0,bodies-live(t));if(alive&&!t.alive)r.killed++;}
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
    rows:[...damageSim.rows.values()].map(r=>({...r,total:round(r.total),hp:round(r.hp),morale:round(r.morale),strike:round(r.strike),friendly:round(r.friendly)}))};
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
(async()=>{
  const runs=Number(process.argv[2]||3),seconds=Number(process.argv[3]||600),sums=new Map();
  for(let seed=1;seed<=runs;seed++){
    const r=await runOnce(seed,seconds);
    console.log(`\n### 種${seed}: ${r.result}（${r.seconds}ゲーム秒）\n\n|陣営|兵科|隊数|与ダメージ（耐久＋士気）|うち耐久|うち士気|うち地点攻撃|撃破した体|撃破した隊|味方への誤射|\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|`);
    for(const x of r.rows.sort((a,b)=>a.team-b.team||b.total-a.total)){
      console.log(`|${x.team?'敵':'自軍'}|${x.kind}|${x.units}|${x.total}|${x.hp}|${x.morale}|${x.strike}|${x.bodies}|${x.killed}|${x.friendly}|`);
      const k=x.team+'|'+x.kind,s=sums.get(k)||{team:x.team,kind:x.kind,units:x.units,total:0,hp:0,morale:0,strike:0,bodies:0,killed:0};
      for(const f of ['total','hp','morale','strike','bodies','killed'])s[f]+=x[f];sums.set(k,s);
    }
  }
  console.log(`\n### ${runs}回の平均\n\n|陣営|兵科|隊数|与ダメージ|うち耐久|うち士気|うち地点攻撃|撃破した体|撃破した隊|\n|---|---|---:|---:|---:|---:|---:|---:|---:|`);
  for(const s of [...sums.values()].sort((a,b)=>a.team-b.team||b.total-a.total))
    console.log(`|${s.team?'敵':'自軍'}|${s.kind}|${s.units}|${(s.total/runs).toFixed(1)}|${(s.hp/runs).toFixed(1)}|${(s.morale/runs).toFixed(1)}|${(s.strike/runs).toFixed(1)}|${(s.bodies/runs).toFixed(1)}|${(s.killed/runs).toFixed(1)}|`);
})().catch(e=>{console.error(e);process.exitCode=1;});
