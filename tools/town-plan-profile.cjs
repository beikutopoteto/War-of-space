/* Diagnose a setup-time threshold failure without modifying the game. */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const {openGame,ROOT}=require('./browser.cjs');
const source=execFileSync('git',['show','HEAD:battle/terrain.js'],{cwd:ROOT,encoding:'utf8'}),beforeSetup=source.slice(source.indexOf('function groundSetup(id){'),source.indexOf('// 8方向'));
(async()=>{const {browser,page,errors}=await openGame();try{
 await page.evaluate(()=>{reset({op:'baikonur'});setSpeed(0);});
 const session=await page.context().newCDPSession(page),rows=[];await session.send('Profiler.enable');
 for(const phase of ['before','after']){
  await session.send('Profiler.start');
  const elapsedMs=await page.evaluate(({phase,beforeSetup})=>{const setup=phase==='before'?new Function('return ('+beforeSetup+')')():groundSetup,start=performance.now();setup('baikonur2');return performance.now()-start;},{phase,beforeSetup});
  const {profile}=await session.send('Profiler.stop');fs.writeFileSync(path.join(ROOT,'test-results/town-plan',phase+'.cpuprofile'),JSON.stringify(profile));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();for(const n of profile.nodes)for(const child of n.children||[])parents.set(child,n.id);
  const inSetup=id=>{for(let n=nodes.get(id);n;n=nodes.get(parents.get(n.id)))if(n.callFrame.functionName==='groundSetup')return true;return false;};
  const sums=new Map();let setupSampleMs=0;
  for(let i=0;i<profile.samples.length;i++){const id=profile.samples[i],ms=profile.timeDeltas[i]/1000;if(!inSetup(id))continue;setupSampleMs+=ms;const n=nodes.get(id),name=n.callFrame.functionName||'(anonymous) '+n.callFrame.url.split('/').at(-1)+':'+(n.callFrame.lineNumber+1);sums.set(name,(sums.get(name)||0)+ms);}
  const top=[...sums].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([name,selfMs])=>({name,selfMs:Math.round(selfMs*10)/10}));rows.push({phase,elapsedMs,setupSampleMs,top});console.log(JSON.stringify(rows.at(-1)));
 }
 if(errors.length)throw new Error(errors.join('\n'));
 fs.writeFileSync(path.join(ROOT,'test-results/town-plan/profile.json'),JSON.stringify(rows,null,2)+'\n');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
