/* 対象の射撃回帰と、実際の演習画面の射程・命令バーを1600×900で撮影。 */
const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});const results=[];
 const check=(ok,name,detail)=>{results.push({name,ok:!!ok,detail});if(!ok)console.error(name,detail);};
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS);
  if(!process.env.SHOTS_ONLY){
   const smoke=fs.readFileSync(path.join(ROOT,'tests/smoke.cjs'),'utf8');
   const altitude=smoke.slice(smoke.indexOf('    const bands = await page.evaluate'),smoke.indexOf('    await checkGroundCapture(page, check);'));
   await new (Object.getPrototypeOf(async function(){}).constructor)('page','check',altitude)(page,check);
   if(process.env.ALTITUDE_ONLY){console.log(JSON.stringify({results,errors}));assert.equal(results.filter(r=>!r.ok).length,0);assert.deepEqual(errors,[]);return;}
   await require('../tests/ground-sight.cjs').checkGroundSight(page,check);
   await require('../tests/ground-strike.cjs').checkGroundStrike(page,check);
   await require('../tests/ground-branches.cjs').checkGroundBranches(page,check);
   await require('../tests/ground-sea.cjs').checkGroundSea(page,check);
  }
  console.log(JSON.stringify({targetedChecks:results.length,failed:results.filter(r=>!r.ok)}));
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});if(talking)endTalk();endDeploy();setSpeed(0);});
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  async function scene(kind,name,offset){
   const state=await page.evaluate(([kind,offset])=>{
    const f=fleets.find(f=>f.team===0&&f.groundKind===kind);if(!f)throw Error(kind+'が演習にいません');if(kind==='attack'){f.band='low';f.bandTo=null;f.pos.y=groundUnitHeight(f);}select(f);camAnim=null;
    controls.target.copy(f.pos);camera.position.copy(f.pos).add(new THREE.Vector3(...offset));camera.lookAt(f.pos);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
    for(let i=0;i<1000&&groundRanges.get(f)?.jobs;i++)groundRangesDraw([f]);frame(performance.now());
    return {label:groundRanges.get(f)?.el.textContent,rings:groundRanges.get(f)?.lines.length,bar:!document.getElementById('groundCommandBar').hidden};
   },[kind,offset]);
   await page.screenshot({path:path.join(ROOT,'.shots',name+'.png')});return state;
  }
  const maskMs=await page.evaluate(()=>{const f=fleets.find(f=>f.team===0&&f.groundKind==='artillery'),e=groundRangeInfo(f).entries.find(e=>e.id==='indirect');groundBallisticReset();const start=performance.now();const points=groundRangeMask(f,e);return {ms:performance.now()-start,vertices:points.length};});
  const gun=await scene('artillery','ground-range-artillery',[0,100,75]);assert(gun.label.includes('直接射撃 2.0km')&&gun.label.includes('間接砲撃 2.0〜30.0km')&&gun.rings===3);
  const tank=await scene('vehicle','ground-range-tank',[0,58,44]);assert(tank.label.includes('直接射撃 3.0km')&&tank.label.includes('対空 1.0km')&&!tank.label.includes('間接'));
  const air=await scene('attack','ground-range-air',[0,95,70]);assert(air.label.includes('対地・対艦 10.0km')&&air.label.includes('対空 15.0km'));
  await page.evaluate(()=>{reset({op:'charybdis'});setSpeed(0);});assert.equal(await page.locator('.ground-range-label').count(),0);
  assert.deepEqual(errors,[]);assert.equal(results.filter(r=>!r.ok).length,0,JSON.stringify(results.filter(r=>!r.ok)));
  console.log(JSON.stringify({checks:results.length,maskMs,gun,tank,air,spaceClean:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
