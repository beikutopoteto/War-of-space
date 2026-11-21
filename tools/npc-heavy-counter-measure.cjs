/* バイコヌール12本。変更前と変更後のツリーで同じ台本を実行する。
   node tools/npc-heavy-counter-measure.cjs
   JSONの各行に勝者（0/1/null）、ゲーム秒、戦車から削った耐久・士気・命中数を出す。 */
const {openGame}=require('./browser.cjs');
const {setupNpcSim,advanceNpcSim,sampleNpcAlly,parseArgs}=require('./npc-sim.cjs');

function observeTankDamage(){
  const tally={hp:0,morale:0,hits:0};
  window.tankDamage=tally;
  const original=damage;
  damage=function(t,amt,src){
    if(src?.groundKind!=='heavyInfantry'||t.groundKind!=='vehicle'||src.team===t.team)return original.apply(this,arguments);
    const hp=Math.max(0,t.hpPool),morale=t.groundMorale??0;
    const result=original.apply(this,arguments);
    const dh=Math.max(0,hp-Math.max(0,t.hpPool)),dm=Math.max(0,morale-(t.groundMorale??0));
    tally.hp+=dh;tally.morale+=dm;
    if(dh+dm>0)tally.hits++;
    return result;
  };
}
async function measure(cfg){
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    for(const fn of [sampleNpcAlly,advanceNpcSim])await page.evaluate('window.'+fn.name+'='+fn.toString());
    await page.evaluate(setupNpcSim,cfg);
    await page.evaluate(observeTankDamage);
    let done=false,elapsed=0;
    while(!done){elapsed+=5;done=await page.evaluate(sec=>advanceNpcSim(sec),elapsed);}
    if(errors.length)throw new Error(errors.join('\n'));
    return await page.evaluate(()=>({
      winner:npcMeasure.winner??(over?(outcome?0:1):null),
      seconds:+(gameSec-npcMeasure.start).toFixed(4),...tankDamage,
    }));
  }finally{await browser.close();}
}
async function main(){
  for(const doctrines of [['mars','earth'],['earth','mars']])for(const seed of [1,2,3])for(const ally of [0,.5]){
    const cfg=parseArgs(['baikonur',...doctrines,'standard',String(seed),'600',...(ally?['--ally','0.5']:[])]);
    console.log(JSON.stringify({doctrines,seed,ally,...await measure(cfg)}));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
