/* Claude側で node tools/npc-measure.cjs。ブラウザ・写真・npm testと同時に回さない。
   作業票2の4条件と、別のfield150関数計測を順番に実行。JSONとbriefを.shots/npc/に保存。 */
const fs=require('node:fs'),path=require('node:path'),{run,brief}=require('./npc-sim.cjs');
const cases=[['exercise2',1,600,false,false],['exercise2',2,600,false,false],['baikonur',1,300,true,false],['field150',1,900,false,false],['field150',1,900,false,true]];
(async()=>{
 const out=path.resolve(__dirname,'../.shots/npc');fs.mkdirSync(out,{recursive:true});
 for(const [terrain,seed,seconds,idle,profile] of cases){
  const cfg={terrain,doctrines:['mars','earth'],level:'standard',seed,seconds,idle,profile},r=await run(cfg);
  const name=terrain+'-seed'+seed+(idle?'-idle':'')+(profile?'-profile':'');
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(r,null,2)+'\n');
  fs.writeFileSync(path.join(out,name+'.txt'),brief(r)+'\n');console.log(brief(r));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
