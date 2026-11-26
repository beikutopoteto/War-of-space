/* node tools/ground-drone-measure.cjs <git archive で展開した main のフォルダ>
   バイコヌールの通常のクイック配備で両軍をNPC操作。ゲーム時計の300分または作戦終了まで。 */
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');
const {setupNpcSim}=require('./npc-sim.cjs');

async function main(){
  const baseline=process.argv[2];
  if(!baseline)throw Error('main を展開したフォルダを指定してください');
  const {browser,page,errors}=await openGame();
  const trials=[];
  try{
    for(const [version,root] of [['main',path.resolve(baseline)],['#511',ROOT]])for(const seed of [1,2,3]){
      await page.goto(pathToFileURL(path.join(root,'index.html')).href);
      await page.evaluate(setupNpcSim,{terrain:'baikonur',seed,doctrines:['earth','mars'],level:'standard',seconds:300,idle:false});
      const batch=await page.evaluate(()=>{
        const count=predicate=>[0,1].map(team=>fleets.filter(f=>f.team===team&&!f.groundDrone&&predicate(f)).length);
        const scouts=count(f=>f.groundKind==='scout'),initial=count(f=>f.alive);
        const owners=groundSites.map(s=>s.owner);let first=null;
        const origin=gameSec,dt=.05/groundRuleSet().movement.timeScale;
        for(let i=0;i<300/.05&&!over;i++){
          step(dt);
          if(!first){
            const sites=groundSites.filter((s,j)=>s.owner!==null&&s.owner!==owners[j]);
            if(sites.length)first={sec:+(gameSec-origin).toFixed(2),clock:clockStr(),sites:sites.map(s=>[s.id,s.owner])};
          }
        }
        const drones=typeof groundDroneStats==='undefined'?[0,1].map(()=>({launched:0,hits:0,shotDown:0})):groundDroneStats;
        return {scouts,initial,first,drones,left:count(f=>f.alive&&f.hpPool>0&&!f.groundExited),elapsed:+(gameSec-origin).toFixed(2),over};
      });
      assert.deepEqual(errors,[],'ページ例外');
      const row={version,seed,...batch};trials.push(row);console.log(JSON.stringify(row));
    }
    const out=path.join(ROOT,'.shots','ground-drone-measure.json');
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(trials,null,2)+'\n');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
