/* CPU-only ground microbenchmark. Run: node tools/ground-perf.cjs [--samples=5] [--budget-ms=120000] [--long] [--only=territory] [--compare-territory]
 * Uses the existing VM loader, never a browser. Only prints JSON lines; writes no results.
 * Parent watchdog includes VM loading and git snapshots in a 120-second wall budget.
 * Canvas is an ImageData allocation shim: native Canvas copying, DOM and GPU are excluded.
 * --compare-territory isolates the retained legacy and current paint functions in one VM.
 * Other modes describe the dirty working tree without a speed-improvement comparison.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const budgetArg=process.argv.find(a=>a.startsWith('--budget-ms='));
const LIMIT=budgetArg?Number(budgetArg.split('=')[1]):120000;
if(!Number.isInteger(LIMIT)||LIMIT<10000||LIMIT>120000)throw new Error('--budget-ms must be 10000..120000');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const emit=value=>console.log(JSON.stringify(value));

if(!process.argv.includes('--worker')){
  const start=performance.now();
  const remaining=()=>Math.max(1,Math.floor(LIMIT-(performance.now()-start)));
  const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:Math.min(3000,remaining())});
  const snapshot=()=>({head:git(['rev-parse','HEAD']).trim(),status:git(['status','--short']),
    numstat:git(['diff','--numstat']),diffSha256:hash(git(['diff','--no-ext-diff','--binary']))});
  let before;
  try{
    before=snapshot();emit({type:'git-before',...before});
    const result=spawnSync(process.execPath,[__filename,'--worker',...process.argv.slice(2)],{
      cwd:ROOT,stdio:['ignore','inherit','inherit'],timeout:Math.max(1,remaining()-7000),killSignal:'SIGKILL'
    });
    emit({type:'worker-exit',status:result.status,signal:result.signal,error:result.error?.code});
    const after=snapshot();emit({type:'git-after',...after,
      changedDuringRun:JSON.stringify(before)!==JSON.stringify(after)});
    emit({type:'total',wallMs:+(performance.now()-start).toFixed(3),limitMs:LIMIT});
    process.exitCode=result.error||result.signal||result.status!==0?1:0;
  }catch(error){emit({type:'error',message:error.message});process.exitCode=1;}
}else{
  const vm=require('node:vm');
  const sampleArg=process.argv.find(a=>a.startsWith('--samples='));
  const samples=sampleArg?Number(sampleArg.split('=')[1]):5;
  if(!Number.isInteger(samples)||samples<1||samples>10)throw new Error('--samples must be 1..10');
  const sources=['tests/ground-landing.cjs','data/ships.js','data/operations.js','data/terrain/exercise2.js',
    'battle/shapes.js','battle/terrain.js','battle/ground-sight.js','battle/ground-strike.js',
    'battle/ground-transport.js','battle/ground-supply.js','battle/ground.js','battle/state.js','battle/hud.js','battle/sim.js'];
  const fingerprints=()=>Object.fromEntries(sources.map(f=>[f,hash(fs.readFileSync(path.join(ROOT,f)))]));
  const beforeLoad=fingerprints(),loadStart=performance.now();
  const {ctx}=require('../tests/ground-landing.cjs').createGroundContext();
  const loadMs=performance.now()-loadStart,afterLoad=fingerprints();
  emit({type:'source',stableDuringLoad:JSON.stringify(beforeLoad)===JSON.stringify(afterLoad),
    hashes:afterLoad,loaderMs:+loadMs.toFixed(3),node:process.version,samples,
    scope:'CPU VM only; no groundSetup/DOM/WebGL; putImageData is a no-op shim'});
  if(JSON.stringify(beforeLoad)!==JSON.stringify(afterLoad))throw new Error('Sources changed during VM load; retry after edits settle');
  ctx.__perfNow=()=>performance.now();
  const run=code=>vm.runInContext(code,ctx,{timeout:20000});
  run(`
    op=WOS_DATA.operations.find(o=>o.id==='baikonur');
    groundSites=op.groundSites.map(spec=>{
      const site=WOS_TERRAIN[op.ground].sites.find(s=>s.id===spec.site);
      return {...site,owner:spec.owner,knownOwner:spec.owner,contested:false,knownContested:false,
        progress:[0,0],pos:groundPoint(site.x,site.y)};
    });
    globalThis.__canvasWrites=0;
    globalThis.__canvasContext={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData:()=>{__canvasWrites++;}};
    groundTerritory={key:null,texture:{},canvas:{width:480,height:360,getContext:()=>__canvasContext},
      sections:groundRoadSections(WOS_TERRAIN[op.ground].objects.roads,groundSites)};
    globalThis.__pathInfo=p=>p?{found:true,points:p.points.length,length:p.L,cost:p.cost}: {found:false};
  `);
  function bench(name,setup,body,iterations=1,options={}){
    const code=`(()=>{${setup};let result;const start=__perfNow();
      for(let i=0;i<${iterations};i++){result=(${body});}
      return {ms:(__perfNow()-start)/${iterations},result};})()`;
    try{
      const warm=options.warmup===false?null:run(code),rows=[],count=options.samples||samples;
      for(let i=0;i<count;i++)rows.push(run(code));
      const times=rows.map(r=>r.ms).sort((a,b)=>a-b),round=n=>+n.toFixed(6);
      emit({type:'timing',name,samples:count,iterationsPerSample:iterations,warmupMs:warm?round(warm.ms):null,
        medianMs:round((times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2),maxMs:round(times.at(-1)),
        sampleMs:rows.map(r=>round(r.ms)),result:rows.at(-1).result});
    }catch(error){
      emit({type:'case-error',name,message:error.message,timeoutMs:error.code==='ERR_SCRIPT_EXECUTION_TIMEOUT'?20000:undefined});
      process.exitCode=1;return false;
    }
    return true;
  }
  if(!process.argv.includes('--only=territory')&&!process.argv.includes('--compare-territory')){
  bench('groundPath.vehicle.short',`globalThis.__a=groundPoint(8,27);globalThis.__b=groundPoint(12,27)`,
    '__pathInfo(groundPath(__a,__b,"vehicle"))');
  bench('groundPath.infantry.river',`__a=groundPoint(21,26);__b=groundPoint(26,26)`,
    '__pathInfo(groundPath(__a,__b,"infantry"))');
  bench('groundPath.vehicle.ford',`__a=groundPoint(21,33);__b=groundPoint(25,33)`,
    '__pathInfo(groundPath(__a,__b,"vehicle"))');
  bench('groundSupplyBuild','',
    '(groundSupplyBuild(),{nodes:groundSupplyNet.nodes.length,edges:groundSupplyNet.edges.length})');
  bench('groundSupplyRefresh.forced','groundSupplyNet.key=null',
    '(groundSupplyRefresh(),{edges:groundSupplyNet.edges.length})');
  bench('groundSupplyRefresh.cached','groundSupplyRefresh()',
    '(groundSupplyRefresh(),groundSupplyNet.edges.length)',1000);
  }
  run('if(!groundSupplyNet)groundSupplyBuild()');
  run(`for(const e of groundSupplyNet.edges){e.knownOwner=e.owner;e.knownContested=e.contested;}`);
  emit({type:'fixture',operation:run('op.id'),sites:run('groundSites.length'),
    nodes:run('groundSupplyNet.nodes.length'),edges:run('groundSupplyNet.edges.length'),
    circleEdges:run('groundSupplyNet.edges.filter(e=>e.circle).length'),
    territoryPixels:480*360,gridCells:run('WOS_TERRAIN.exercise2.terrain.cols*WOS_TERRAIN.exercise2.terrain.rows'),
    units:run('fleets.length'),territoryFunction:'groundPaintTerritory'});
  if(process.argv.includes('--compare-territory')){
    const {legacySource}=require('../tests/ground-territory-cache.cjs');
    emit({type:'comparison',legacySha256:hash(legacySource),
      optimizedSha256:hash(run('groundInfluenceAt.toString()+groundPaintTerritory.toString()')),
      scope:'same loaded VM/fixture; only two functions swapped; CPU Canvas shim; timeout is censored'});
    run('globalThis.__optimizedInfluence=groundInfluenceAt;globalThis.__optimizedPaint=groundPaintTerritory');
    run(legacySource);
    bench('before.groundPaintTerritory.forced','groundTerritory.key=null;__canvasWrites=0',
      '(groundPaintTerritory(),{canvasWrites:__canvasWrites})',1,{warmup:false,samples:1});
    run('groundInfluenceAt=__optimizedInfluence;groundPaintTerritory=__optimizedPaint;groundInfluenceCache=null;groundTerritoryPixels=null');
    bench('after.groundPaintTerritory.firstBuild','groundTerritory.key=null;__canvasWrites=0',
      '(groundPaintTerritory(),{canvasWrites:__canvasWrites})',1,{warmup:false,samples:1});
    bench('after.groundPaintTerritory.forced','groundTerritory.key=null;__canvasWrites=0',
      '(groundPaintTerritory(),{canvasWrites:__canvasWrites})');
    bench('after.groundPaintTerritory.cached','__canvasWrites=0',
      '(groundPaintTerritory(),{canvasWrites:__canvasWrites})',1000);
  }else{
  // Seed the known matching key to isolate the cache-hit branch without requiring a costly paint.
  // This measures early-return cost, not validity of previously rendered pixels.
  run(`groundTerritory.key=groundSites.map(s=>String(s.knownOwner)+':'+s.knownContested).join('|')+'/'+
    groundSupplyNet.edges.map(e=>String(e.knownOwner)+':'+e.knownContested).join('|')`);
  emit({type:'cache-fixture',priming:'matching key seeded; no previously painted pixels assumed'});
  bench('groundPaintTerritory.cached','__canvasWrites=0',
    '(groundPaintTerritory(),{canvasWrites:__canvasWrites})',1000);
  bench('groundPaintTerritory.forced','groundTerritory.key=null;__canvasWrites=0',
    '(groundPaintTerritory(),{canvasWrites:__canvasWrites})');
  }
  if(process.argv.includes('--long'))bench('groundPath.vehicle.long',`__a=groundPoint(7,29);__b=groundPoint(41,27)`,
    '__pathInfo(groundPath(__a,__b,"vehicle"))');
}
