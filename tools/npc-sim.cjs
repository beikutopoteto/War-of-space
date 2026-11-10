/* 実ゲームChromium。node tools/npc-sim.cjs exercise2 mars earth standard 1 600
   node tools/npc-sim.cjs baikonur mars earth standard 1 180 --idle
   seedはゲームの乱数と指揮官の乱数を固定。JSONを先に、短い表を後に出す。 */
const {openGame}=require('./browser.cjs');
function setupNpcSim(cfg){
  let rng=cfg.seed>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const source=WOS_DATA.operations.find(o=>o.id===(['exercise2','baikonur'].includes(cfg.terrain)?'baikonur':'ground'+cfg.terrain));
  source.npc=cfg.idle?{1:{doctrine:cfg.doctrines[0],level:cfg.level}}:{0:{doctrine:cfg.doctrines[0],level:cfg.level},1:{doctrine:cfg.doctrines[1],level:cfg.level}};
  source.npcSeed=cfg.seed;source.groundStaticEnemies=false;
  // 検証場の中立全占領による早期終了を使わず、本営占領／全滅で両軍を測る（道具の実行中だけ）。
  source.win={type:'groundHQ',text:'検証: 敵本営占領または敵全滅'};
  // 広域検証の配備はこの道具の中だけ。作戦のファイルへは追加しない。
  if(cfg.terrain.startsWith('field')){
    const d=WOS_TERRAIN[cfg.terrain],kinds=['infantry','infantry','infantry','infantry','vehicle','vehicle','heavyInfantry','heavyInfantry','artillery','scout','fighter','supply'];
    const force=team=>{const s=d.sites.find(s=>s.id===source.groundHQ[team]);return kinds.map((kind,i)=>({name:(team?'赤':'青')+' 検証第'+(i+1)+'中隊',groundKind:kind,type:'cv',n:1,scale:.3,
      pos:[(s.x+(i%4-1.5)*1.5-d.meta.widthKm/2)*GROUND_SCALE,(d.meta.heightKm/2-s.y-(Math.floor(i/4)-1)*1.5)*GROUND_SCALE],band:kind==='fighter'?'low':'ground',stance:'engage'}));};
    source.quick=force(0);source.enemies=force(1);source.groundSea=[];
  }
  reset({op:source.id,fleets:source.quick});if(talking)endTalk();setSpeed(0);endDeploy();
  window.npcMeasure={cfg,start:gameSec,steps:0,stepMs:0,idle:[0,0],unitTime:[0,0],concentration:[0,0],assaultTime:[0,0],firstContact:null,changes:[0,0],last:[null,null],aborts:[0,0],
    logAt:[0,0],events:[],owners:Object.fromEntries(groundSites.map(s=>[s.id,s.owner])),samples:[]};
  // 中止logは200件のリングを越えても数える。
  const oldLog=npcLog;npcLog=(c,t,what,zone,why)=>{if(what.endsWith(':abort'))npcMeasure.aborts[c.team]++;oldLog(c,t,what,zone,why);};
}
function advanceNpcSim(seconds){
  const m=npcMeasure,end=Math.min(m.cfg.seconds,seconds),dt=.05;
  while(gameSec-m.start<end-1e-8&&!over){
    const before=performance.now();step(dt);m.stepMs+=performance.now()-before;m.steps++;
    for(const team of [0,1]){
      const live=fleets.filter(f=>f.team===team&&f.alive&&f.hpPool>0&&!f.embarked&&!groundAbsent(f)),debug=npcDebug()[team],plan=debug?.plan;
      for(const f of live){m.unitTime[team]+=dt;const engaged=!!(f.fireTarget||f.order?.type==='attack'||f.groundHitLeft>0||fleets.some(t=>groundFireSolution(f,t)));
        if(!f.order&&!engaged)m.idle[team]+=dt;
      }
      if(plan?.main&&m.last[team]&&m.last[team]!==plan.main)m.changes[team]++;
      if(plan?.main)m.last[team]=plan.main;
      const main=plan?.tasks.find(k=>k.type==='seize'&&k.stage==='assault');
      if(main){const assigned=new Set(main.units.map(x=>x.id)),power=live.reduce((s,f)=>s+npcGroundPower(f),0);m.concentration[team]+=live.filter(f=>assigned.has(f.id)).reduce((s,f)=>s+npcGroundPower(f),0)/Math.max(1e-9,power)*dt;m.assaultTime[team]+=dt;}
    }
    if(m.firstContact===null&&fleets.some(f=>f.groundContacts?.[1-f.team]))m.firstContact=gameSec-m.start;
    for(const s of groundSites)if(m.owners[s.id]!==s.owner){m.events.push({time:+(gameSec-m.start).toFixed(2),site:s.id,owner:s.owner});m.owners[s.id]=s.owner;}
    if(m.steps%600===0)m.samples.push({time:+(gameSec-m.start).toFixed(1),units:fleets.filter(f=>f.alive).map(f=>({id:f.id,team:f.team,x:+groundMapX(f.pos.x).toFixed(2),y:+groundMapY(f.pos.z).toFixed(2),order:f.order?.type||null,task:npcGroundState?.commanders.get(f.team)?.unit.get(f.id)?.task||null}))});
    // 道具だけの両軍対称の終端。本体の敗北条件には足さない。
    if(!m.cfg.idle&&groundSites.some(s=>s.id===op.groundHQ?.[0]&&s.owner===1)){m.winner=1;break;}
  }
  return over||m.winner!==undefined||gameSec-m.start>=m.cfg.seconds-1e-8;
}
function npcSimResult(){
  const m=npcMeasure,t=npcGroundState?.timings||{count:0,total:0,max:0},round=x=>+x.toFixed(4),live=team=>fleets.filter(f=>f.team===team&&f.alive&&f.hpPool>0);
  return {config:m.cfg,winner:m.winner??(over?(outcome?0:1):null),seconds:round(gameSec-m.start),remaining:[0,1].map(team=>({units:live(team).length,power:round(live(team).reduce((s,f)=>s+npcGroundPower(f),0))})),
    idle:[0,1].map(team=>round(m.idle[team]/Math.max(1e-9,m.unitTime[team]))),mainConcentration:[0,1].map(team=>m.assaultTime[team]?round(m.concentration[team]/m.assaultTime[team]):null),
    firstContact:m.firstContact===null?null:round(m.firstContact),targetChanges:m.changes,aborts:m.aborts,think:{count:t.count,meanMs:round(t.total/Math.max(1,t.count)),maxMs:round(t.max)},step:{count:m.steps,meanMs:round(m.stepMs/Math.max(1,m.steps))},
    sites:m.owners,captures:m.events,debug:npcDebug(),samples:m.samples};
}
function table(r){
  return ['| 地形 / seed | 勝者 | 秒 | 残存 0/1 | 棒立ち 0/1 | 主攻集中 0/1 | 初接触 | 変更 0/1 | 中止 0/1 | 判断 平均/最大ms | step平均ms |',
    '|---|---|---:|---|---|---|---:|---|---|---|---:|',
    `| ${r.config.terrain} / ${r.config.seed} | ${r.winner??'未決'} | ${r.seconds} | ${r.remaining.map(x=>x.units).join('/')} | ${r.idle.join('/')} | ${r.mainConcentration.map(x=>x??'突入なし').join('/')} | ${r.firstContact??'なし'} | ${r.targetChanges.join('/')} | ${r.aborts.join('/')} | ${r.think.meanMs}/${r.think.maxMs} | ${r.step.meanMs} |`].join('\n');
}
async function run(cfg){
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{await page.evaluate(setupNpcSim,cfg);await page.evaluate('window.advanceNpcSim='+advanceNpcSim.toString());await page.evaluate('window.npcSimResult='+npcSimResult.toString());
  let done=false,elapsed=0;while(!done){elapsed+=5;done=await page.evaluate(sec=>advanceNpcSim(sec),elapsed);}
  if(errors.length)throw new Error(errors.join('\n'));return await page.evaluate(()=>npcSimResult());
 }finally{await browser.close();}
}
module.exports={setupNpcSim,advanceNpcSim,npcSimResult,table,run};
if(require.main===module){
 const [terrain='exercise2',d0='mars',d1='earth',level='standard',seed='1',seconds='600']=process.argv.slice(2),cfg={terrain,doctrines:[d0,d1],level,seed:Number(seed),seconds:Number(seconds),idle:process.argv.includes('--idle')};
 if(!['exercise2','baikonur','field150','field300'].includes(terrain)||![d0,d1].every(x=>['mars','earth'].includes(x))||!['easy','standard','hard'].includes(level)||!Number.isInteger(cfg.seed)||!Number.isFinite(cfg.seconds)||cfg.seconds<=0)throw new Error('引数: exercise2|field150|field300 mars|earth mars|earth easy|standard|hard seed 秒 [--idle]');
 run(cfg).then(r=>{console.log(JSON.stringify(r,null,2));console.log(table(r));}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
