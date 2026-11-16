/* Compare HEAD and working-tree groundSetup under identical live-game conditions. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const {openGame,ROOT}=require('./browser.cjs');
const old=execFileSync('git',['show','HEAD:battle/terrain.js'],{cwd:ROOT,encoding:'utf8'});
const beforeSetup=old.slice(old.indexOf('function groundSetup(id){'),old.indexOf('// 8方向'));
(async()=>{const {browser,page,errors}=await openGame();try{
 const before=[],after=[];
 for(const id of ['exercise2','baikonur2','field150','field300']){
  const row=await page.evaluate(({id,beforeSetup})=>{
   reset({op:id==='baikonur2'?'baikonur':id==='exercise2'?'groundExercise2':'ground'+id});setSpeed(0);
   const setupBefore=new Function('return ('+beforeSetup+')')(),rows={before:{id,times:[]},after:{id,times:[]}};
   for(let i=0;i<3;i++)for(const phase of (i%2?['after','before']:['before','after'])){
    const start=performance.now();(phase==='before'?setupBefore:groundSetup)(id);rows[phase].times.push(performance.now()-start);
    if(i===2){rows[phase].buildings=groundBuildings;rows[phase].forests=groundForests;}
   }
   // Finish with a consistent scene for the live render loop and the next reset.
   return rows;
  },{id,beforeSetup});
  const hash=a=>({count:a.length,sha256:crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex')});
  for(const [phase,list] of [['before',before],['after',after]]){const r=row[phase];list.push({...r,buildings:hash(r.buildings),forests:hash(r.forests)});console.log(JSON.stringify({phase,...list.at(-1)}));}
 }
 if(errors.length)throw new Error(errors.join('\n'));
 for(const [phase,rows] of [['before',before],['after',after]])fs.writeFileSync(path.join(ROOT,'test-results/town-plan',phase+'.json'),JSON.stringify(rows,null,2)+'\n');
 const median=a=>a.slice().sort((a,b)=>a-b)[1];
 const delta=before.map((b,i)=>({id:b.id,beforeMs:median(b.times),afterMs:median(after[i].times),deltaMs:median(after[i].times)-median(b.times)}));
 fs.writeFileSync(path.join(ROOT,'test-results/town-plan/timing.json'),JSON.stringify(delta,null,2)+'\n');console.log(JSON.stringify(delta));
 if(delta.some(r=>r.deltaMs>400))throw new Error('Setup time increase exceeds 400 ms; stop and investigate the measured bottleneck.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
