/* 巡航巴戦の1フレームを計測。node tools/ground-was-dogfight-perf.cjs [--sw] */
const {openGame}=require('./browser.cjs');

function measureDogfight(companies){
  let seed=1;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const index=WOS_DATA.operations.findIndex(o=>o.id==='groundExercise2');
  const base=WOS_DATA.operations[index];
  const roster=team=>Array.from({length:companies},(_,i)=>({
    name:'計測 '+team+'-'+i,kind:'was',at:[12+team*.65,26.4+i*.65],band:'cruise',platoons:4,stance:'evade'
  }));
  const opSpec={...base,quick:roster(0),enemies:roster(1),groundSea:[],groundHQ:null,groundStaticEnemies:false};
  WOS_DATA.operations[index]=opSpec;
  reset({op:opSpec.id,fleets:opSpec.quick});
  if(talking)endTalk();
  if(deploying)endDeploy();
  setSpeed(0);
  menuOpen=false;document.body.classList.remove('inmenu');document.getElementById('menu').hidden=true;
  const units=[fleets.filter(f=>f.team===0),fleets.filter(f=>f.team===1)];
  const center=new THREE.Vector3();
  units.forEach((side,team)=>side.forEach((f,i)=>{
    f.pos.copy(groundPoint(...(team?opSpec.enemies:opSpec.quick)[i].at));
    f.pos.y=groundUnitHeight(f);f.heading.set(team?-1:1,0,0);f.groundDeployed=true;
    f.groundWasFlight=null;f.groundBodyGeometry=null;
    center.add(f.pos);
  }));
  groundUpdateSight();
  units.forEach((side,team)=>side.forEach((f,i)=>order(f,{type:'attack',target:units[1-team][i]})));
  center.multiplyScalar(1/(companies*2));
  select(null);camAnim=null;controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0,25,16));camera.lookAt(center);
  controls.update();camera.updateMatrixWorld(true);
  const gl=renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
  const gpu=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unknown';
  const totals={};
  const wrap=(name,fn)=>function(...args){
    const start=performance.now();
    try{return fn.apply(this,args);}finally{totals[name]=(totals[name]??0)+performance.now()-start;}
  };
  const originals={groundStep,groundDraw,groundWasFlightStep,groundWasDogfightMove,groundWasSwarmSeparate,
    groundBodyTarget,groundBodyPositions,groundUpdateSight,groundCanSee,groundClearLine,groundWasPlume,
    groundFxDraw,groundVisualDrawGatling,groundFogDraw,groundFormationDraw};
  const render=()=>{renderer.render(scene,camera);gl.finish();};
  const frame=()=>{gameSec+=.05;groundStep(.05);groundDraw();renderFrame();};
  let renderFrame=render;
  let framesInCombat=0;
  try{
    for(let i=0;i<50;i++)frame();
    if(!units.flat().every(f=>f.groundWasFlight?.dogfight))throw Error('計測前に全中隊が巴戦に入っていない');
    groundStep=wrap('groundStep',groundStep);groundDraw=wrap('groundDraw',groundDraw);
    groundWasFlightStep=wrap('groundWasFlightStep',groundWasFlightStep);
    groundWasDogfightMove=wrap('groundWasDogfightMove',groundWasDogfightMove);
    groundWasSwarmSeparate=wrap('groundWasSwarmSeparate',groundWasSwarmSeparate);
    groundBodyTarget=wrap('groundBodyTarget',groundBodyTarget);groundBodyPositions=wrap('groundBodyPositions',groundBodyPositions);
    groundUpdateSight=wrap('groundUpdateSight',groundUpdateSight);groundCanSee=wrap('groundCanSee',groundCanSee);groundClearLine=wrap('groundClearLine',groundClearLine);
    groundWasPlume=wrap('groundWasPlume',groundWasPlume);groundFxDraw=wrap('groundFxDraw',groundFxDraw);
    groundVisualDrawGatling=wrap('groundVisualDrawGatling',groundVisualDrawGatling);
    groundFogDraw=wrap('groundFogDraw',groundFogDraw);groundFormationDraw=wrap('groundFormationDraw',groundFormationDraw);
    renderFrame=wrap('render + gl.finish',render);
    const frames=120,timedFrame=wrap('frame',frame);
    let calls=0;
    for(let i=0;i<frames;i++){
      timedFrame();calls+=renderer.info.render.calls;
      if(units.flat().every(f=>f.groundWasFlight?.dogfight))framesInCombat++;
    }
    return {companies,frames,framesInCombat,gpu,drawCalls:+(calls/frames).toFixed(1),
      ms:Object.fromEntries(Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([k,t])=>[k,+(t/frames).toFixed(3)]))};
  }finally{
    ({groundStep,groundDraw,groundWasFlightStep,groundWasDogfightMove,groundWasSwarmSeparate,
      groundBodyTarget,groundBodyPositions,groundUpdateSight,groundCanSee,groundClearLine,groundWasPlume,
      groundFxDraw,groundVisualDrawGatling,groundFogDraw,groundFormationDraw}=originals);
    WOS_DATA.operations[index]=base;
  }
}

(async()=>{
  for(const companies of [1,2]){
    const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'&&!process.argv.includes('--sw')});
    try{
      const result=await page.evaluate(measureDogfight,companies);
      if(errors.length)throw Error(errors.join('\n'));
      console.log(JSON.stringify(result));
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
