/* node tools/npc-measure.cjs。ブラウザ・写真・npm testと同時に回さない。
   従来の5条件と守り方の4条件を順番に実行。JSONとbriefを.shots/npc/に保存。 */
const fs=require('node:fs'),path=require('node:path'),{run,brief}=require('./npc-sim.cjs');
const cases=[
 ...[['exercise2',1,600,false,false],['exercise2',2,600,false,false],['baikonur',1,300,true,false],['baikonur',1,300,false,false],['baikonur',1,300,false,true],['field150',1,900,false,false],['field150',1,900,false,true]]
  .map(([terrain,seed,seconds,idle,profile])=>({terrain,doctrines:['mars','earth'],level:'standard',seed,seconds,idle,profile})),
 ...['firm','mobile','delay','depth'].map(style=>({terrain:'exercise2',doctrines:['earth','mars'],level:'standard',seed:1,seconds:600,idle:false,profile:false,
  intents:{0:{type:'seize'},1:{type:style==='delay'?'delay':'hold',style,zones:['F'],...(style==='delay'?{until:300}:{})}}})),
 ...[1,2].flatMap(seed=>[true,false].map(npc=>({terrain:'charybdis',doctrines:['mars','earth'],level:'standard',seed,seconds:900,idle:false,profile:false,npc}))),
];
function caseName(cfg){return cfg.terrain+'-seed'+cfg.seed+(cfg.idle?'-idle':'')+(cfg.profile?'-profile':'')+(cfg.intents?'-seize-vs-'+cfg.intents[1].style:'')+(cfg.terrain==='charybdis'?(cfg.npc?'-npc':'-script'):'');}
async function measure(){
 const out=path.resolve(__dirname,'../.shots/npc');fs.mkdirSync(out,{recursive:true});
 for(const cfg of cases){
  const r=await run(cfg),name=caseName(cfg);
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(r,null,2)+'\n');
  fs.writeFileSync(path.join(out,name+'.txt'),brief(r)+'\n');console.log(brief(r));
 }
}
module.exports={cases,caseName,measure};
if(require.main===module)measure().catch(e=>{console.error(e.message);process.exitCode=1;});
