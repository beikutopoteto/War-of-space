/* node tools/ground-tempo-perf.cjs [--browser] [--baseline=/absolute/terrain-before.js]
   baselineは変更前のbattle/terrain.js。VMとChromiumの計測は別の値として出す。 */
const fs=require('node:fs');
const samples=[[[10,56],[27,49]],[[27,49],[47,39]],[[27,49],[49,60]],[[10,56],[69,44]],[[45,60],[53,60]],[[27,49],[30,47]],[[27,49],[28,50]]];
const baselineArg=process.argv.find(a=>a.startsWith('--baseline='));
let baseline;
if(baselineArg){const s=fs.readFileSync(baselineArg.slice('--baseline='.length),'utf8');baseline=s.slice(s.indexOf('function groundPath('),s.indexOf('// 地形の迂回点とユーザー'));if(!baseline.startsWith('function groundPath('))throw new Error('baseline must contain groundPath');}
function measure(samples){
 const rows=[];for(let round=0;round<3;round++)for(const [a,b] of samples){const start=performance.now(),p=groundPath(groundPoint(...a),groundPoint(...b),'vehicle');rows.push({round,a,b,ms:performance.now()-start,cost:p?.cost});}
 const times=rows.map(r=>r.ms).sort((a,b)=>a-b);return {meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[Math.ceil(times.length*.95)-1],rows};
}
(async()=>{
 if(process.argv.includes('--browser')){
  const {openGame}=require('./browser.cjs'),{browser,page,errors}=await openGame({width:1600,height:900});
  try{
   await page.evaluate(()=>{WOS.start({op:'baikonur'});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();});
   console.log(JSON.stringify({runtime:'Chromium',version:'current',...await page.evaluate(({samples,source})=>eval('('+source+')')(samples),{samples,source:measure.toString()})}));
   if(baseline){await page.evaluate(source=>(0,eval)(source),baseline);console.log(JSON.stringify({runtime:'Chromium',version:'baseline',...await page.evaluate(({samples,source})=>eval('('+source+')')(samples),{samples,source:measure.toString()})}));}
   if(errors.length)throw new Error(errors.join('\n'));
  }finally{await browser.close();}
 }else for(const version of baseline?['baseline','current']:['current']){
  const c=require('../tests/ground-landing.cjs').createGroundContext();c.run("op={ground:'baikonur2'};groundTerrainId=null;");if(version==='baseline')c.run(baseline);
  console.log(JSON.stringify({runtime:'Node VM',version,...c.run('('+measure.toString()+')('+JSON.stringify(samples)+')')}));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
