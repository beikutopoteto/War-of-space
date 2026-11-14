/* 新演習の実ステップと1600×900の写真。node tools/npc-lift-check.cjs [seed ...] */
const fs=require('node:fs'),path=require('node:path');
const {openGame}=require('./browser.cjs');
function setupLiftCheck(seed){
  const visualRandom=Math.random;let rng=seed>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const source=WOS_DATA.operations.find(o=>o.id==='groundLiftExercise');
  WOS.start({op:source.id});op.npcSeed=seed;if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();
  npcGroundReset();npcGroundInit();
  window.liftMeasure={seed,start:gameSec,events:[],samples:[],seen:new Set(),giving:new Map(),carriedKm:0,deck:new Set(),crossed:new Set(),positions:new Map(fleets.map(f=>[f.id,f.pos.clone()]))};
  window.liftGameRandom=Math.random;Math.random=visualRandom;menuOpen=true;
  for(const name of ['groundBridgeCommand','groundBoardCommand','groundLandCommand','groundUnloadCommand','groundSupplyCommand']){
    const original=window[name];window[name]=(...args)=>{
      const result=original(...args);
      if(result)liftMeasure.events.push({time:+gameSec.toFixed(2),action:name,units:args[0].map(f=>f.name),target:args[1]?.name||null});
      return result;
    };
  }
}
function advanceLiftCheck(seconds){
  const m=liftMeasure,visualRandom=Math.random;Math.random=liftGameRandom;
  while(!over&&gameSec<m.start+seconds-1e-8){
    const before=new Map(fleets.map(f=>[f.id,{embarked:f.embarked?.id,given:f.groundSupplyGiven||0,pos:f.pos.clone()}]));
    step(.05/groundRuleSet().movement.timeScale);
    for(const b of groundBridges)if(b.complete&&!m.seen.has(b)){
      m.seen.add(b);m.events.push({time:+gameSec.toFixed(2),action:'bridgeComplete',at:[b.x,b.y],river:b.river});
    }
    for(const f of fleets){
      if(f.team!==1)continue;
      if(groundLandingShip(f)&&groundPassengers(f).length)m.carriedKm+=f.pos.distanceTo(before.get(f.id).pos)/GROUND_SCALE;
      const old=before.get(f.id);
      if(old?.embarked&&!f.embarked&&f.alive&&f.hpPool>0)m.events.push({time:+gameSec.toFixed(2),action:'disembarked',unit:f.name,carrier:fleets.find(c=>c.id===old.embarked)?.name,carrierKind:fleets.find(c=>c.id===old.embarked)?.groundKind,at:[groundMapX(f.pos.x),groundMapY(f.pos.z)]});
      if(f.embarked&&!old?.embarked)m.events.push({time:+gameSec.toFixed(2),action:'boarded',unit:f.name,carrier:f.embarked.name,carrierKind:f.embarked.groundKind});
      if((f.groundSupplyGiven||0)>(old?.given||0)){if(m.giving.get(f.id)!==f.groundGiving?.id)m.events.push({time:+gameSec.toFixed(2),action:'supplyGiven',unit:f.name,target:f.groundGiving?.name});m.giving.set(f.id,f.groundGiving?.id);}else m.giving.delete(f.id);
      for(const b of groundBridges.filter(b=>b.complete)){
        const start=m.positions.get(f.id),key=f.id+':'+b.x+':'+b.y;if(!start||f.embarked||m.crossed.has(key))continue;
        const side=p=>-(groundMapX(p.x)-b.x)*b.ty+(groundMapY(p.z)-b.y)*b.tx;
        const along=(groundMapX(f.pos.x)-b.x)*b.tx+(groundMapY(f.pos.z)-b.y)*b.ty;
        if(Math.abs(along)<=b.laneHalfKm+1e-8&&Math.abs(side(f.pos))<=b.halfSpanKm+1e-8)m.deck.add(key);
        if(m.deck.has(key)&&side(start)*side(f.pos)<0&&Math.abs(side(f.pos))>=b.halfSpanKm*.8&&Math.hypot(groundMapX(f.pos.x)-b.x,groundMapY(f.pos.z)-b.y)<b.halfSpanKm*2){
          m.crossed.add(key);m.events.push({time:+gameSec.toFixed(2),action:'bridgeCrossed',unit:f.name,at:[b.x,b.y]});
        }
      }
    }
  }
  m.samples.push({time:+gameSec.toFixed(2),plan:npcDebug()[1]?.plan,units:fleets.filter(f=>f.team===1).map(f=>({id:f.id,name:f.name,alive:f.alive,hp:f.hpPool,morale:f.groundMorale,at:[groundMapX(f.pos.x),groundMapY(f.pos.z)],order:f.order?.type,busy:!!f.embarked,supply:f.groundSupply}))});
  Math.random=visualRandom;return over||gameSec>=m.start+600-1e-8;
}
async function run(seed,{shots=true,seconds=600}={}){
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await page.evaluate(setupLiftCheck,seed);
    const links=await page.evaluate(()=>npcGroundLiftLinks().map(l=>({a:l.a,b:l.b,way:l.way,len:l.len,open:l.open,at:l.bridge?[l.bridge.x,l.bridge.y]:null})));
    await page.evaluate('window.advanceLiftCheck='+advanceLiftCheck.toString());
    let done=false;for(let sec=5;sec<=seconds&&!done;sec+=5){done=await page.evaluate(advanceLiftCheck,sec);
      if(shots&&[60,120,240].includes(sec)){await page.evaluate(()=>{menuOpen=false;camAnim=null;const v=op.view;controls.target.copy(groundPoint(...v.targetKm));camera.position.copy(controls.target).add(new THREE.Vector3(0,v.dist,v.dist));camera.lookAt(controls.target);controls.update();groundDraw();return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await page.screenshot({path:path.join(__dirname,'../.shots/npc-lift-'+seed+'-'+sec+'.png')});await page.evaluate(()=>{menuOpen=true;});}
    }
    if(errors.length)throw new Error(errors.join('\n'));
    const result=await page.evaluate(()=>({seed:liftMeasure.seed,seconds:gameSec,winner:over?(outcome?0:1):null,carriedKm:liftMeasure.carriedKm,events:liftMeasure.events,samples:liftMeasure.samples,log:npcDebug()[1]?.log}));
    return {links,...result};
  }finally{await browser.close();}
}
module.exports={setupLiftCheck,advanceLiftCheck,run};
if(require.main===module)(async()=>{
  fs.mkdirSync(path.join(__dirname,'../.shots'),{recursive:true});fs.mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});
  for(const seed of process.argv.slice(2).length?process.argv.slice(2).map(Number):[1,2,3]){
    const r=await run(seed,{seconds:Number(process.env.LIFT_SECONDS||600),shots:process.env.SHOTS!=='0'&&seed===1});fs.writeFileSync(path.join(__dirname,'../test-results/npc-lift-'+seed+'.json'),JSON.stringify(r,null,2)+'\n');
    const times=action=>r.events.filter(e=>e.action===action).map(e=>e.time);const lands=[...new Set(r.events.filter(e=>e.action==='disembarked'&&e.carrierKind==='sea').map(e=>e.time))];
    console.log(JSON.stringify({seed,seconds:r.seconds,winner:r.winner,bridge:times('bridgeComplete'),crossings:times('bridgeCrossed'),landings:lands,carriedKm:r.carriedKm,trucks:r.events.filter(e=>e.action==='boarded'&&e.carrierKind==='apc').map(e=>e.time),supply:times('supplyGiven')}));
    if(Number(process.env.LIFT_SECONDS||600)===600&&(!times('bridgeComplete').length||!times('bridgeCrossed').length||!lands.length||r.carriedKm<1))process.exitCode=1;
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
