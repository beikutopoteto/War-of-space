/* npc-sim.cjs の宇宙計測。ページ内で動かす関数なので、外のNode変数は参照しない。 */
function setupSpaceNpcSim(cfg){
  let rng=cfg.seed>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const source=WOS_DATA.operations.find(o=>o.id==='charybdis');
  source.npc=cfg.npc===false?null:{1:{doctrine:cfg.doctrines[0],level:cfg.level,intent:{type:'hold',zones:['fort']}}};
  source.npcSeed=cfg.seed;
  reset({op:source.id,fleets:source.quick});if(talking)endTalk();setSpeed(0);endDeploy();autoMode=true;
  window.npcMeasure={cfg,start:gameSec,steps:0,stepMs:0,idle:[0,0],unitTime:[0,0],logs:[],postures:[],transitions:[],signatures:{},
    concentration:[0,0],assaultTime:[0,0],firstContact:null,changes:[0,0],last:[null,null],aborts:[0,0],events:[],owners:Object.fromEntries((op.npcZones||[]).map(z=>[z.id,z.owner])),
    armor:[{time:0,percent:100}],initialOwners:(op.npcZones||[]).map(z=>({site:z.id,owner:z.owner})),samples:[]};
  const oldLog=npcLog;npcLog=(c,t,what,zone,why)=>{
    const entry={team:c.team,time:+(t-npcMeasure.start).toFixed(2),what,zone:zone??null,why};
    npcMeasure.logs.push(entry);if(what.startsWith('posture:'))npcMeasure.postures.push(entry);if(what.endsWith(':abort'))npcMeasure.aborts[c.team]++;oldLog(c,t,what,zone,why);
  };
}
function advanceSpaceNpcSim(seconds){
  const m=npcMeasure,end=Math.min(m.cfg.seconds,seconds),dt=.05;
  while(gameSec-m.start<end-1e-8&&!over){
    const positions=new Map(fleets.filter(npcSpaceFleet).map(f=>[f.id,f.pos.clone()])),before=performance.now();
    if(window.npcProfile)npcProfile.active=true;
    try{step(dt);}finally{if(window.npcProfile)npcProfile.active=false;}
    m.stepMs+=performance.now()-before;m.steps++;
    for(const team of [0,1])for(const f of fleets.filter(f=>f.team===team&&npcSpaceFleet(f))){
      m.unitTime[team]+=dt;const previous=positions.get(f.id),moving=previous&&f.pos.distanceTo(previous)/dt>=.5;
      if(!moving&&!f.order&&!f.fireTarget)m.idle[team]+=dt;
    }
    for(const [team,c] of npcSpaceState?.commanders||[]){
      const tasks=c.plan?.tasks||[],signature=JSON.stringify([c.posture,c.style,tasks]);
      if(signature!==m.signatures[team]){m.signatures[team]=signature;m.transitions.push({time:+(gameSec-m.start).toFixed(2),team,posture:c.posture,style:c.style,tasks:JSON.parse(JSON.stringify(tasks))});}
      if(c.plan?.main&&m.last[team]&&m.last[team]!==c.plan.main)m.changes[team]++;
      if(c.plan?.main)m.last[team]=c.plan.main;
      const main=tasks.find(k=>k.type==='seize'&&k.stage==='assault');
      if(!chase&&main){const ids=new Set(main.units.map(x=>x.id)),live=fleets.filter(f=>f.team===team&&npcSpaceFleet(f)),power=live.reduce((s,f)=>s+npcSpacePower(f),0);
        m.concentration[team]+=live.filter(f=>ids.has(f.id)).reduce((s,f)=>s+npcSpacePower(f),0)/Math.max(1e-9,power)*dt;m.assaultTime[team]+=dt;}
    }
    if(m.firstContact===null&&fleets.some(f=>npcSpaceFleet(f)&&f.seen))m.firstContact=gameSec-m.start;
    for(const z of npcSpaceState?.zones||[])if(m.owners[z.id]!==z.owner){m.events.push({time:+(gameSec-m.start).toFixed(2),site:z.id,owner:z.owner});m.owners[z.id]=z.owner;}
    if(m.steps%600===0)m.samples.push({time:+(gameSec-m.start).toFixed(1),tasks:[0,1].map(team=>{
      const counts={};for(const f of fleets.filter(f=>f.team===team&&npcSpaceFleet(f))){const type=f.npcTask?.split(':')[0]||'none';counts[type]=(counts[type]||0)+1;}return counts;
    })});
    if(m.steps%100===0||!fortress.alive){
      const sample={time:+(gameSec-m.start).toFixed(2),percent:+(Math.max(0,fortress.hpPool)/fortress.max*100).toFixed(2)};
      if(m.armor[m.armor.length-1].time!==sample.time&&m.armor[m.armor.length-1].percent!==0)m.armor.push(sample);
    }
  }
  return over||gameSec-m.start>=m.cfg.seconds-1e-8;
}
function spaceNpcSimResult(){
  const m=npcMeasure,t=npcSpaceState?.timings||{count:0,total:0,max:0},round=x=>+x.toFixed(4),minutes=opClock();
  const [h,min]=op.start.split(':').map(Number),clock=(h*60+min+Math.floor(minutes))%(24*60);
  return {config:m.cfg,winner:over?(outcome?0:1):null,seconds:round(gameSec-m.start),clock:{minutes:round(minutes),text:String(Math.floor(clock/60)).padStart(2,'0')+':'+String(clock%60).padStart(2,'0')},
    remaining:[0,1].map(team=>{const live=fleets.filter(f=>f.team===team&&npcSpaceFleet(f));return {units:live.length,ships:live.reduce((s,f)=>s+f.ships.length,0),power:round(live.reduce((s,f)=>s+npcSpacePower(f),0))};}),
    idle:[0,1].map(team=>round(m.idle[team]/Math.max(1e-9,m.unitTime[team]))),
    think:{count:t.count,meanMs:round(t.total/Math.max(1,t.count)),maxMs:round(t.max)},step:{count:m.steps,meanMs:round(m.stepMs/Math.max(1,m.steps))},
    profile:window.npcProfile?Object.fromEntries(Object.entries(npcProfile.rows).map(([name,v])=>[name,{count:v.count,totalMs:round(v.total),selfMs:round(v.self),meanMs:round(v.total/Math.max(1,v.count))}])):null,
    armor:[...m.armor,{time:round(gameSec-m.start),percent:round(Math.max(0,fortress.hpPool)/fortress.max*100)}],
    postures:m.postures,logs:m.logs,transitions:m.transitions,samples:m.samples,debug:npcDebug(),
    initialOwners:m.initialOwners,sites:m.owners,captures:m.events,
    units:fleets.map(f=>({id:f.id,name:f.name,team:f.team,alive:f.alive,hp:f.hpPool,ships:f.ships.length,ai:f.ai,task:f.npcTask??null})),
    mainConcentration:[0,1].map(team=>m.assaultTime[team]?round(m.concentration[team]/m.assaultTime[team]):null),
    firstContact:m.firstContact===null?null:round(m.firstContact),targetChanges:m.changes,aborts:m.aborts,lowSupplyMax:[0,0]};
}
module.exports={setupSpaceNpcSim,advanceSpaceNpcSim,spaceNpcSimResult};
