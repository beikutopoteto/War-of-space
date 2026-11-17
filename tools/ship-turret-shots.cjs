/* Issue #442. Run sequentially (never alongside npm test).
   node tools/ship-turret-shots.cjs --measure --baseline=HEAD
   node tools/ship-turret-shots.cjs --shots --baseline=HEAD
   Baseline defaults to the task's unchanged parent (PR #443 has the same models).
   Measurements use the real render loop, seeded starts, dt=.016, 100 frames,
   and the actual postprocessing. renderMs is CPU time inside renderer.render,
   not GPU elapsed time; jsMs is the remainder of the frame. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {openGame,toStage,ROOT}=require('./browser.cjs');
const args=process.argv.slice(2),onlyMeasure=args.includes('--measure'),onlyShots=args.includes('--shots');
const baselineRef=(args.find(x=>x.startsWith('--baseline='))||'--baseline=HEAD').slice(11);
const out=path.join(ROOT,'test-results/ship-turrets');
const sources=Object.fromEntries(['units','loop','sim'].map(k=>[k,execFileSync('git',['show',`${baselineRef}:battle/${k}.js`],{cwd:ROOT,encoding:'utf8'})]));
async function open(before){
  const session=await openGame({width:1600,height:900});
  await session.page.addInitScript(()=>{let n=442;window.shipTestSeed=seed=>{n=seed>>>0;};Math.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};});
  if(before)await session.page.route(/\/battle\/(units|loop|sim)\.js$/,r=>r.fulfill({body:sources[path.basename(new URL(r.request().url()).pathname,'.js')],contentType:'application/javascript'}));
  await session.page.reload();await session.page.waitForFunction(()=>window.WOS);
  await session.page.evaluate(()=>{window.requestAnimationFrame=()=>0;menuOpen=false;document.body.classList.remove('inmenu');document.getElementById('menu').hidden=true;});
  return session;
}
async function start(page,id){
  await page.evaluate(id=>{
    shipTestSeed(442);reset({op:id});if(talking)endTalk();endDeploy();setSpeed(0);autoMode=true;camAnim=null;
    const v=op.view||{target:[0,24],dist:190},dir=new THREE.Vector3(...(v.dir||[.3,.4,.87])).normalize();
    controls.enableDamping=false;controls.target.set(v.target[0],0,v.target[1]);camera.position.copy(controls.target).addScaledVector(dir,v.dist);camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld();
  },id);
  await toStage(page);
}
/* Simulation is fast-forwarded without renderer calls. Ship visual positions are kept
   at their formations; neither targeting rules nor operation data are changed. */
async function advance(page,seconds){
  return page.evaluate(seconds=>{
    let reached=0;
    while(gameSec+1e-8<seconds&&!over){step(Math.min(.05,seconds-gameSec));
      for(const f of fleets)if(f.alive)for(const s of f.ships){if(s.base)s.pos.copy(s.base);else s.pos.copy(s.off).applyAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(f.heading.x,f.heading.z)).add(f.pos);}
      for(const w of wings)for(const s of w.ships)s.pos.copy(w.pos).add(s.off);
      reached++;
    }
    camAnim=null;return {seconds:gameSec,over,steps:reached,was:wings.filter(w=>w.alive&&w.type==='was').reduce((n,w)=>n+w.ships.length,0),firing:fleets.filter(f=>f.alive&&f.fireTarget?.alive&&f.fireTarget.seen&&gap(f,f.fireTarget)<=f.range*1.08&&!bodyBlocks(f.pos,f.fireTarget.pos)).length};
  },seconds);
}
async function discover(page){
  const counts=await page.evaluate(()=>{const rows=[];for(const o of OPS.filter(o=>!o.ground&&!o.hidden)){shipTestSeed(442);reset({op:o.id});if(talking)endTalk();endDeploy();rows.push({id:o.id,ships:fleets.reduce((n,f)=>n+f.ships.length,0)});}return rows;});
  const largest=[...counts].sort((a,b)=>b.ships-a.ships)[0].id,ids=[...new Set([largest,'februaria'])],combat={};let wasCase=null;
  for(const id of ids){await start(page,id);for(let t=5;t<=300;t+=5){const state=await advance(page,t);if(!combat[id]&&state.firing>=3)combat[id]=state.seconds;if(state.was&&(wasCase===null||state.was>wasCase.was))wasCase={id,seconds:state.seconds,was:state.was};if(state.over)break;}}
  assert(ids.every(id=>combat[id]),'300秒以内に実際の交戦が始まること');assert(wasCase?.was>0,'W.A.S.の発進がある作戦を確認すること');
  return {counts,ids,combat,wasCase};
}
async function measure(page,id,seconds,view){
  await start(page,id);const snapshot=await advance(page,seconds);assert(!snapshot.over,`${id} ${seconds}s: 作戦継続`);
  await page.evaluate(view=>{
    camAnim=null;
    if(view==='close'){const candidates=fleets.filter(f=>f.alive&&f.ships.some(s=>s.type==='bb')&&shown(f));assertion(candidates.length>0,'戦艦が存在する');
      candidates.sort((a,b)=>b.ships.filter(s=>s.type==='bb').length-a.ships.filter(s=>s.type==='bb').length);
      const f=candidates[0];controls.target.copy(f.pos);camera.position.copy(f.pos).add(new THREE.Vector3(8,12,18));camera.lookAt(f.pos);}
    controls.update();camera.updateMatrixWorld();setSpeed(0);for(let i=0;i<12;i++)frame(last+16);
    function assertion(ok,text){if(!ok)throw Error(text);}
    window.shipRenderMs=0;window.shipOriginalRender=renderer.render;
    renderer.render=function(...args){const t=performance.now();try{return shipOriginalRender.apply(this,args);}finally{shipRenderMs+=performance.now()-t;}};
    renderer.info.autoReset=false;setSpeed(1);
  },view);
  try{
    const samples=[];
    for(let batch=0;batch<10;batch++)samples.push(...await page.evaluate(()=>{
      const rows=[];for(let i=0;i<10;i++){renderer.info.reset();shipRenderMs=0;const t=performance.now();frame(last+16);const elapsed=performance.now()-t;
        rows.push({ms:elapsed,renderMs:shipRenderMs,jsMs:elapsed-shipRenderMs,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,turrets:typeof turretMeshes==='undefined'?0:turretMeshes.reduce((n,m)=>n+[...m.values()].reduce((k,x)=>k+x.count,0),0)});}return rows;
    }));
    return {id,seconds,view,snapshot,...Object.fromEntries(['ms','renderMs','jsMs','calls','triangles','turrets'].map(k=>[k,samples.reduce((n,s)=>n+s[k],0)/samples.length]))};
  }finally{await page.evaluate(()=>{renderer.render=shipOriginalRender;renderer.info.autoReset=true;setSpeed(0);});}
}
async function measurements(){
  let before,after;const report={baseline:baselineRef,frames:100,fixedDt:.016,renderTiming:'CPU submission, including postprocessing; no GPU timer',rows:[]};
  try{
    before=await open(true);report.plan=await discover(before.page);assert.deepEqual(before.errors,[]);
    /* Keep only one browser running at any time. */
    const cases=report.plan.ids.flatMap(id=>[{id,seconds:0,view:'normal',kind:'a',limit:1.05},{id,seconds:report.plan.combat[id],view:'normal',kind:'b',limit:1.25},{id,seconds:report.plan.combat[id],view:'close',kind:'c',limit:null}]);
    cases.push({...report.plan.wasCase,view:'normal',kind:'W.A.S.',limit:1.25});
    for(const spec of cases){const row={...spec,before:await measure(before.page,spec.id,spec.seconds,spec.view)};report.rows.push(row);}
    assert.deepEqual(before.errors,[]);await before.browser.close();before=null;
    after=await open(false);
    for(const row of report.rows){row.after=await measure(after.page,row.id,row.seconds,row.view);row.ratio=row.after.ms/row.before.ms;row.withinLimit=row.limit===null||row.ratio<=row.limit;
      console.log(JSON.stringify(row));fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify(report,null,2));
      if(!row.withinLimit){report.stopped=true;report.cause=row.after.jsMs-row.before.jsMs>row.after.renderMs-row.before.renderMs?'JS':'renderer.render CPU';fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify(report,null,2));throw Error(`負荷の目安を超過: ${row.id} ${row.kind}, ${row.ratio.toFixed(3)}倍、増加の主因 ${report.cause}`);}
    }
    assert.deepEqual(after.errors,[]);fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify(report,null,2));
  }finally{if(before)await before.browser.close();if(after)await after.browser.close();}
}
/* Photos (Claude, 2026-11-17): the real 第5節 battle. A firing fleet with battleships is picked, the battle is held still with its
   target kept, the turrets get 2 s to turn, and six shots leave from muzzles. bb-near: the closest the game's camera goes (36);
   bb-inspect-*: closer than the game allows and without bloom, to see the turrets sit on their bases. W.A.S.: one circling its
   target in 第6節 (wasFlyFire, facing the target). */
async function photos(){
  const session=await openGame({width:1600,height:900});const {page,errors}=session;
  const clipAt=async key=>{const c=await page.evaluate(key=>{const v=window[key].clone().project(camera);return {x:(v.x+1)/2*innerWidth,y:(1-v.y)/2*innerHeight};},key);
    return {x:Math.max(0,Math.min(1600-640,c.x-320)),y:Math.max(0,Math.min(900-400,c.y-200)),width:640,height:400};};
  try{
    const pick=await page.evaluate(()=>{
      let n=442;Math.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};window.requestAnimationFrame=()=>0;
      WOS.start({op:'februaria',tutorial:false});if(talking)endTalk();if(deploying)endDeploy();camAnim=null;setSpeed(1);controls.enableDamping=false;
      const firing=f=>{const ft=f.fireTarget;return f.alive&&shown(f)&&f.ships.some(s=>s.type==='bb')&&ft&&ft.alive&&ft.seen&&gap(f,ft)<=f.range*1.08&&!bodyBlocks(f.pos,ft.pos);};
      let P=null;for(let i=0;i<6000&&!over&&!P;i++){step(.05);if(i>40)P=fleets.find(firing)||null;}
      if(!P)throw Error('戦艦の撃つ隊が見つからない');
      const FT=P.fireTarget,s0=P.ships.find(s=>s.type==='bb');window.shipRealStep=step;step=dt=>{gameSec+=dt;P.fireTarget=FT;};
      for(let i=0;i<125;i++)frame(last+16);
      for(let k=0;k<6;k++){const a=randomShipMuzzle(P);shoot(a,randShip(FT),TEAM_COL[P.team],.6);burst(a,TEAM_COL[P.team],5,3,.3);}
      for(let i=0;i<4;i++)frame(last+16);
      window.shipPhoto={P,FT,s0};window.shipPhotoAt=s0.pos;
      return {fleet:P.name,target:FT.name,aimed:s0.tur.filter(t=>t.aimed).length+'/'+s0.tur.length};
    });
    console.log(JSON.stringify(pick));assert.ok(+pick.aimed.split('/')[0]>0,'砲塔が的を向く');
    const view=(len,lift,side,bloom)=>page.evaluate(([len,lift,side,bloom])=>{const {P,FT,s0}=shipPhoto,d=FT.pos.clone().sub(P.pos).normalize(),sd=new THREE.Vector3(-d.z,0,d.x);
      if(!bloom){window.shipComposer=window.shipComposer||composer;composer=null;controls.minDistance=1;}
      camera.position.copy(s0.pos).add(d.clone().multiplyScalar(side?0:-1).addScaledVector(sd,side?1:.5).add(new THREE.Vector3(0,lift,0)).setLength(len));
      controls.target.copy(s0.pos);camera.lookAt(s0.pos);controls.update();frame(last+16);},[len,lift,side,bloom]);
    await view(36,.55,false,true);await page.screenshot({path:path.join(out,'bb-near.png'),clip:await clipAt('shipPhotoAt')});
    await view(11,.55,false,false);await page.screenshot({path:path.join(out,'bb-inspect-a.png'),clip:await clipAt('shipPhotoAt')});
    await view(9,.35,true,false);await page.screenshot({path:path.join(out,'bb-inspect-b.png'),clip:await clipAt('shipPhotoAt')});
    const was=await page.evaluate(()=>{
      step=shipRealStep;WOS.start({op:'denaliBreak',tutorial:false});if(talking)endTalk();if(deploying)endDeploy();camAnim=null;setSpeed(1);controls.minDistance=.5;
      let W=null;for(let i=0;i<8000&&!over&&!W;i++){step(.05);W=wings.find(w=>{const t=w.state==='attack'?w.target:null;return w.alive&&w.type==='was'&&shown(w)&&t&&t.alive&&w.pos.distanceTo(t.pos)<=w.range*.6+(t.radius||0)+3;})||null;}
      if(!W)throw Error('輪を回る W.A.S. が見つからない');
      step=dt=>{gameSec+=dt;};for(let i=0;i<90;i++)frame(last+16);
      const s=W.ships[0],look=W.target.pos.clone().sub(s.pos).normalize(),sd=new THREE.Vector3(-look.z,0,look.x).normalize();
      camera.position.copy(s.pos).addScaledVector(sd,1.6).addScaledVector(look,.9).add(new THREE.Vector3(0,.5,0));controls.target.copy(s.pos);camera.lookAt(s.pos);controls.update();
      setSpeed(0);frame(last+16);window.shipPhotoAt=s.pos;return +s.hd.dot(look).toFixed(2);
    });
    console.log('W.A.S. facing',was);assert.ok(was>.9,'W.A.S. が的を向く');
    await page.screenshot({path:path.join(out,'was-fire.png'),clip:await clipAt('shipPhotoAt')});
    assert.deepEqual(errors,[]);
  }finally{await session.browser.close();}
}
(async()=>{fs.mkdirSync(out,{recursive:true});if(!onlyShots)await measurements();if(!onlyMeasure)await photos();})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
