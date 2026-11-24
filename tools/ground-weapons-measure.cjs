/* #448: same fixture/entry points before and after. Browser changes are measurement-only.
   node tools/ground-weapons-measure.cjs before|after
   Flat field150, stationary fully supplied squads, visible targets, 20 seeded volleys.
   No combat rules or damage values are overridden. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {ROOT}=require('./browser.cjs');
const {chromium}=require('playwright');
const BASELINE_REVISION='e28f1702712f833a7d9c36e86cdfbf3cc4927a5a';
// Install baseline routes BEFORE the first navigation. Reloading an initialized
// WebGL page can defer old-context cleanup into a measured render on this host.
async function openMeasureGame(phase){
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.WOS_UIS=1;});
 const threeDir=path.dirname(require.resolve('three/package.json'));
 await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/,route=>{const u=route.request().url(),rel=u.includes('cdnjs')?'build/three.min.js':u.split('three@0.128.0/')[1];return route.fulfill({path:path.join(threeDir,rel),contentType:'application/javascript'});});
 await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({body:''}));
 if(phase==='before'){
  const {execFileSync}=require('child_process'),files=['data/ground-rules.js','battle/ground-air-missions.js','battle/ground-air-orders.js','battle/ground-area.js','battle/ground-scatter.js','battle/ground-strike.js','battle/ground-transport.js','battle/ground-volley.js','battle/ground.js','battle/npc-ground.js','battle/sim.js','battle/ground-supply.js','battle/ground-aa.js'];
  const sources=new Map(files.map(f=>[path.join(ROOT,f),execFileSync('git',['show',BASELINE_REVISION+':'+f],{cwd:ROOT,encoding:'utf8'})]));
  await page.route(/file:.*\/(battle|data)\/.*\.js$/,route=>{const source=sources.get(decodeURIComponent(new URL(route.request().url()).pathname));return source===undefined?route.continue():route.fulfill({body:source,contentType:'application/javascript'});});
 }
 await page.goto('file://'+path.join(ROOT,'index.html'));await page.waitForFunction(()=>window.WOS);
 return {browser,page,errors};
}
function fixture(){
 if(!window.measureAnimationFrame)window.measureAnimationFrame=window.requestAnimationFrame.bind(window);
 window.requestAnimationFrame=()=>0;
 WOS.start({op:'groundfield150',fleets:[]});if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);
 assertMeasure(!menuOpen,'battle must render');
 for(const f of fleets){f.alive=false;f.groundModel&&(f.groundModel.visible=false);f.el.hidden=true;}
 fleets=[];op={...op,npc:null,groundStaticEnemies:false,groundHQ:null};
 // The dimensions/grid are real; only obstacles/height/passability and observation are fixture conditions.
 for(const site of groundSites){site.el.remove();site.ring?.parent?.remove(site.ring);}
 groundBuildings=[];groundForests=[];groundSites=[];groundBridges=[];groundFog=null;groundTerritory=null;groundSupplyNet=null;
 groundHeight=groundSightHeight=()=>0;groundHeightCacheReset();groundSightReset();groundBallisticReset();
 groundPass=(x,y)=>x>1&&x<149&&y>1&&y<99;
 groundPointSeenBy=groundSeenBy=()=>true;
 // Match the flat physical fixture in the rendered scene too. Background terrain/towns
 // would measure thousands of unrelated meshes rather than the four firing squads.
 for(const child of groundBoard.children)if(child!==groundVisuals)child.visible=false;
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,100).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x3a463d}));
 floor.position.y=-.001;groundBoard.add(floor);
 window.measureUnit=(kind,team,x,z,type='cv')=>{
  const f=makeFleet(team,groundUnitSpec({name:'計測 '+kind,kind,type,at:[25,55],band:kind==='sea'?'sea':kind==='supportAircraft'?'high':'ground',stance:'evade'}));
  fleets.push(f);groundInitUnit(f);f.pos.set(x,kind==='supportAircraft'?groundRules().heights.high:0,z);f.heading.set(1,0,0);f.post.copy(f.pos);f.home.copy(f.pos);f.groundDeployed=true;f.groundVisible=[true,true];return f;
 };
 window.measureReset=f=>{
  groundVolleyCancel(f);f.alive=true;f.groundStrikeCooldown=0;f.groundSupply=groundSupplyRules().max;f.groundMorale=100;
  f.groundSpawnAt=gameSec;f.groundMovedAt=-Infinity;f.groundBlastUntil=f.groundMobilityUntil=0;
  for(const b of f.bodies){b.alive=true;b.hp=b.max;delete b.groundMobility;}groundBodySync(f);
 };
 window.measureClear=()=>{
  groundStrikeReset();for(const f of fleets){f.alive=false;f.groundModel.visible=false;f.el.hidden=true;}fleets=[];
 };
}
function measureWeapons(){
 const cases=[['artillery',10],['artillery',20],['artillery',30],['guidedRocket',20],['guidedRocket',35],['guidedRocket',50],['was',6],['was',12],['vehicle',2],['supportAircraft',null],['sea',8,'ff'],['sea',30,'bb'],['sea',70,'bb']],rows=[];
 for(const [kind,km,type] of cases)for(const targetKind of ['infantry','vehicle','was']){
  measureClear();const f=measureUnit(kind,0,-60,0,type),t=measureUnit(targetKind,1,-60+(km||12)*GROUND_SCALE,0);
  let seed=448;const random=Math.random;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const sums={hits:0,loss:0,kills:0,shots:0,period:0};
  try{for(let trial=0;trial<20;trial++){
   groundStrikeReset();measureReset(f);measureReset(t);f.pos.set(-60,kind==='supportAircraft'?groundRules().heights.high:0,0);f.heading.set(1,0,0);f.groundFlightVelocity=null;
   const hp=t.bodies.map(b=>b.hp),max=t.hpPool;
   // Old scheduler ignores target; updated scheduler chooses a nearest living body per shooter.
   if(kind==='supportAircraft')order(f,{type:'attack',target:t});
   else assertMeasure(groundVolleyStart(f,{point:t.pos.clone(),target:t}),'volley '+kind+' '+km);
   let first=f.groundStrikeCooldown,elapsed=0,shots=groundStrikes.length;
   while(!shots||groundStrikes.length||f.groundVolley||f.groundBombRun){
    const before=new Set(groundStrikes);gameSec+=.05;elapsed+=.05;
    if(kind==='supportAircraft'){groundAirMotion(f,.05);groundBombStep();}
    groundStrikeStep(.05);const added=groundStrikes.filter(s=>!before.has(s)).length;shots+=added;if(!first&&added)first=f.groundStrikeCooldown+.05;
    assertMeasure(elapsed<180,'strike timeout');
   }
   sums.hits+=t.bodies.filter((b,i)=>b.hp<hp[i]-1e-10).length;sums.loss+=(max-t.hpPool)/max*100;sums.kills+=t.bodies.filter(b=>!b.alive).length;sums.shots+=shots;
   // reload begins after the last burst group (scheduler's existing semantics).
   sums.period+=first;
  }}finally{Math.random=random;}
  rows.push({weapon:kind+(type?':'+type:''),km,target:targetKind,hits:sums.hits/20,loss:sums.loss/20,kills:sums.kills/20,shots:sums.shots/20,period:sums.period/20,perMinute:sums.loss/sums.period*60});
 }
 return rows;
}
function assertMeasure(ok,message){if(!ok)throw Error(message);}
async function measureLoad(){
 measureClear();const units=Array.from({length:4},(_,i)=>measureUnit('guidedRocket',0,-100,i*3-4.5)),p=new THREE.Vector3(20,0,0);
 const random=Math.random;let seed=448;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 try{
  camAnim=null;controls.target.set(-40,0,0);camera.position.set(-40,120,125);camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);
  for(let i=0;i<30;i++)frame(performance.now());
  // Drain startup work before timing: an earlier full-map render must not be
  // charged to the first weapon frame under software WebGL.
  renderer.getContext().finish();
  units.forEach(f=>assertMeasure(groundVolleyStart(f,{point:p}),'load launch'));
  let maxProjectiles=0,maxArcs=0,maxLabels=0;const times=[];
  for(let i=0;i<600;i++){
   gameSec+=.05;groundStrikeStep(.05);maxProjectiles=Math.max(maxProjectiles,groundStrikes.length);
   // Give Chromium an actual presentation between frames. A synchronous loop
   // of hundreds of renders can fill the GPU command buffer and measure its
   // artificial backpressure rather than the game's frame cost.
   await new Promise(resolve=>measureAnimationFrame(resolve));
   const start=performance.now();frame(start);times.push(performance.now()-start);
   maxArcs=Math.max(maxArcs,groundStrikes.filter(s=>s.visual?.arc).length);
   maxLabels=Math.max(maxLabels,document.querySelectorAll('.ground-strike-label:not([hidden])').length);
  }
  const sorted=times.slice().sort((a,b)=>a-b);
  return {maxProjectiles,maxArcs,maxLabels,frames:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)};
 }finally{Math.random=random;}
}
async function run(phase){
 assert(['before','after'].includes(phase));const {browser,page,errors}=await openMeasureGame(phase);
 try{
  for(const fn of [fixture,measureWeapons,assertMeasure,measureLoad])await page.evaluate('window.'+fn.name+'='+fn.toString());
  // Measure the four-squad scene before the hundreds of damage trials. It must
  // not inherit their transient effects, objects or cache/collection workload.
  await page.evaluate(fixture);const load=await page.evaluate(measureLoad);
  await page.evaluate(fixture);const rows=await page.evaluate(measureWeapons);
  assert.equal(errors.length,0,errors.join('\n'));
  const result={phase,baselineRevision:BASELINE_REVISION,seed:448,trials:20,rows,load};fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});fs.writeFileSync(path.join(ROOT,'.shots',`weapons-${phase}.json`),JSON.stringify(result,null,2)+'\n');
  const report=path.join(ROOT,'docs/reports/2026-11-17-weapons-measure.md');
  const title=phase==='before'?'前':'後',fmt=n=>Number(n.toFixed(5)).toString();
  let section=`\n## ${title}\n\n|兵器|距離 km|的|被弾体/斉射|耐久減少 %/斉射|撃破体/斉射|発数/斉射|周期 秒|耐久減少 %/分|\n|---|---:|---|---:|---:|---:|---:|---:|---:|\n`;
  for(const r of rows)section+='|'+[r.weapon,r.km??'1進入',r.target,...['hits','loss','kills','shots','period','perMinute'].map(k=>fmt(r[k]))].join('|')+'|\n';
  section+=`\nロケット4隊: 最大飛翔 ${load.maxProjectiles} 発、最大弾道 ${load.maxArcs} 本、最大表示札 ${load.maxLabels}、frame 平均 ${fmt(load.meanMs)} ms / p95 ${fmt(load.p95Ms)} ms / 最大 ${fmt(load.maxMs)} ms（${load.frames}フレーム）。\n`;
  const intro='# 地上兵器の前後計測（#448）\n\n計測用の仮場面: field150 の寸法・地形グリッドで、高度0・障害物なし・全域通行可・全目標観測済みにしたブラウザ内だけの平地。表示も静的地形・建物を隠して単純な平面にそろえ、全目標が見える条件なので霧と占領塗りを外して兵器の描画負荷を測る。本営・補給網なしで、補給の攻撃倍率は1、士気による耐久損害の吸収なし。純粋な兵器の耐久損害を比較するための測定条件で、ゲームの規則や性能表は変更しない。通常の体配置・隊の性能・回避・補給倍率・着弾処理を使用。射手は +X 向き、的も +X 向きの停止隊。各組20斉射、種448、毎回両隊の耐久・補給・士気を満タンに戻す。爆弾も隊を指定する既存の攻撃命令を使い、groundAirMotion / groundBombStep で実際に1回進入する。対象へ実際に減った耐久で被弾体数を数える。発射と着弾は既存の groundVolleyStart / groundStrikeStep を使用。前は隊中央、後は隊指定の各射手に最も近い生存体を狙う。\n\n周期は最初の発射から次の斉射まで（最後の連射群後の装填を含む）。ゲーム秒あたりで毎分へ換算。ゲームの実フレーム内のCPU時間（frame、描画送信含む）を測る。GPU完了時間や実画面のFPSではない。負荷場面は30 km先へ4隊同時、0.05ゲーム秒刻み600フレーム。各回はブラウザの実際の描画フレームを待ってから計測し、描画命令を同期ループで溜めない。戦闘画面へ切り替えて30フレームの準備描画後、GPUの初期化待ちを完了してから計測を始める（別の地形の描画待ちを1フレームへ混ぜない）。負荷場面は耐久計測の大量の着弾・一時オブジェクトが蓄積する前の新しい場面で測る。\n\n段0で旧コードの威力を記録した後、負荷計測でメニューを閉じ忘れて描画送信を含めていなかったことが判明。その測りは破棄。静的地形を残した再計測も平地の表示条件に合わず、時間がかかったため中止して採用していない。以下は平地の表示をそろえた確定値。前の再計測は旧リビジョン e28f1702712f833a7d9c36e86cdfbf3cc4927a5a のソースをブラウザへ渡して再現（作業ツリーの巻き戻しなし）。\n';
  if(phase==='before')fs.writeFileSync(report,intro+section);else fs.writeFileSync(report,fs.readFileSync(report,'utf8').split('\n## 後\n')[0]+section);
  for(const r of rows)console.log('|'+[title,r.weapon,r.km??'進入',r.target,fmt(r.hits),fmt(r.loss),fmt(r.kills),fmt(r.perMinute)].join('|')+'|');
  console.log('|'+title+' 負荷|'+JSON.stringify(load)+'|');return result;
 }finally{await browser.close();}
}
module.exports={run,fixture,measureWeapons,measureLoad};
if(require.main===module)run(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
