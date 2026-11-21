/* 作業票 #480。node tools/ground-front-perf.cjs before|after
   クイック出撃の11隊を同じ位置・視点に置き、各場面の実フレームを別々に測る。 */
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');

function setupFrontPerf(mode){
  let seed=480;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  window.WOS_NO_NPC=true;
  const mission=OPS.find(o=>o.id==='baikonur');
  WOS.start({op:mission.id,fleets:mission.quick});
  if(talking)endTalk();
  if(deploying)endDeploy();
  setSpeed(0);hideHint();
  const units=groundPlanUnits(fleets).filter(f=>f.groundKind!=='sea');
  if(units.length!==11)throw Error('クイック出撃の隊数: '+units.length);
  const line=[groundPoint(30,36),groundPoint(30,47)],plan=[groundPoint(57,36),groundPoint(57,47)];
  for(const {f,dest} of groundPlanSlots(units,line,1)){
    f.pos.copy(dest);f.pos.y=groundUnitHeight(f);f.post.copy(f.pos);f.stance='evade';
  }
  const target=groundPoint(42,42);camAnim=null;controls.target.copy(target);
  camera.position.set(target.x,target.y+111,target.z+70);camera.lookAt(target);controls.update();
  setSel(units);
  const commandMs={};
  if(mode==='move'){
    groupOrder({type:'move',dest:groundPoint(57,42)});
  }else{
    groundPlanToggle('deploy');groundPlanLineDone(line,null);groundPlanFinish(line,groundPoint(36,42));
    const front=units[0].groundFrontOf;
    if(!front||front.members.length!==units.length)throw Error('前線を作れませんでした: '+groundPlanMessage);
    // 直前に同じ枠へ配置済み。各隊の整列の完了をゲーム本体で待つ。
    for(let i=0;i<100&&units.some(f=>f.order);i++)step(.05);
    if(units.some(f=>f.order))throw Error('前線への整列が終わりませんでした');
    groundPlanToggle('plan');
    let t=performance.now();groundPlanLineDone(plan,null);commandMs.plan=performance.now()-t;
    if(!front.plan)throw Error('計画を作れませんでした: '+groundPlanMessage);
    if(mode==='advance'){
      t=performance.now();document.getElementById('groundExecute').click();commandMs.execute=performance.now()-t;
      if(!front.advance)throw Error('実行できませんでした: '+groundPlanMessage);
    }
  }
  setSel([]);
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  window.frontPerfUnits=units;
  return {units:units.length,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,commandMs};
}

function measureFrontFrames(mode){
  const old=frame,drawPlan=groundPlanDraw,render=renderer.render,gl=renderer.getContext();
  const times=[],planTimes=[];
  let frames=0,planMs=0;
  groundPlanDraw=function(){
    const start=performance.now();
    try{return drawPlan();}finally{planMs+=performance.now()-start;}
  };
  renderer.render=function(...args){render.apply(this,args);gl.finish();};
  return new Promise((resolve,reject)=>{
    function restore(){
      frame=old;groundPlanDraw=drawPlan;renderer.render=render;setSpeed(0);
    }
    frame=now=>{
      planMs=0;
      const start=performance.now();
      try{old(now);}catch(error){restore();reject(error);return;}
      if(++frames<=30)return;
      times.push(performance.now()-start);planTimes.push(planMs);
      if(times.length<120)return;
      const live=frontPerfUnits.filter(f=>f.order?.type==='move');
      restore();
      if(mode==='plan'?live.length!==0:live.length!==frontPerfUnits.length||
        mode==='advance'&&live.some(f=>!f.groundFrontOf?.advance)){
        reject(Error('計測終了時に指定の状態と異なります: '+mode+' 移動中 '+live.length));return;
      }
      resolve({frames:times.length,frameMs:times,planDrawMs:planTimes});
    };
    setSpeed(1);
  });
}

function stats(times){
  const sorted=[...times].sort((a,b)=>a-b);
  const round=x=>+x.toFixed(2);
  return {mean:round(times.reduce((a,b)=>a+b,0)/times.length),p95:round(sorted[Math.ceil(times.length*.95)-1])};
}

function profileTop(profile){
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();
  for(const n of profile.nodes)for(const c of n.children||[])parents.set(c,n.id);
  const all=new Map(),plan=new Map();
  for(const [i,id] of profile.samples.entries()){
    const {functionName,url,lineNumber}=nodes.get(id).callFrame;
    if(functionName.startsWith('('))continue;
    const name=functionName||`(anonymous ${url.split('/').pop()}:${lineNumber+1})`;
    const ms=profile.timeDeltas[i]/1000;
    all.set(name,(all.get(name)||0)+ms);
    for(let p=id;p;p=parents.get(p)){
      if(nodes.get(p).callFrame.functionName==='groundPlanDraw'){
        plan.set(name,(plan.get(name)||0)+ms);break;
      }
    }
  }
  const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,ms])=>[name,+ms.toFixed(1)]);
  return {top:top(all),planTop:top(plan)};
}

(async()=>{
  const version=process.argv[2];
  if(!['before','after'].includes(version))throw Error('before または after を指定してください');
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const results={};
  for(const mode of ['move','plan','advance']){
    const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin',scale:2});
    try{
      const setup=await page.evaluate(setupFrontPerf,mode);
      const cdp=await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
      const measured=await page.evaluate(measureFrontFrames,mode);
      const {profile}=await cdp.send('Profiler.stop');
      if(errors.length)throw Error(errors.join('\n'));
      const summary={...setup,frames:measured.frames,frameMs:stats(measured.frameMs),planDrawMs:stats(measured.planDrawMs),...profileTop(profile)};
      results[mode]={summary,measured,profile};
      console.log(mode,JSON.stringify(summary));
    }finally{await browser.close();}
  }
  fs.writeFileSync(path.join(out,`front-480-perf-${version}.json`),JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});
