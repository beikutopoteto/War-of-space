/* node tools/ground-drone-measure.cjs <main のフォルダ>
   node tools/ground-drone-measure.cjs main=<フォルダ> previous=<フォルダ> current=.
   バイコヌールの通常のクイック配備で両軍をNPC操作。ゲーム時計の300分または作戦終了まで。 */
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');
const {setupNpcSim}=require('./npc-sim.cjs');

function traceDrones(){
  const flights=new Map(),decisions=[],lastDecision=new Map();
  const stamp=()=>+(gameSec-npcMeasure.start).toFixed(2);
  const targetInfo=t=>({id:t.id,kind:t.groundKind,name:t.name});
  const record=(f,type,details={})=>flights.get(f)?.events.push({at:stamp(),type,...details});
  const finish=(frame,end,details={})=>{
    frame.end={at:stamp(),type:end,...details};
  };
  const launch=groundDroneLaunch,orbit=groundDroneOrbit,dive=groundDroneDive,recall=groundDroneRecall;
  const remove=groundDroneRemove,lose=groundDroneLose,receiveShot=groundDroneReceiveShot,diveStep=groundDroneDiveStep;
  const npc=groundDroneNpc;
  let shooter=null,impact=null,inFlightStep=false;
  groundDroneLaunch=(scout,isNpc)=>{
    const f=launch(scout,isNpc);
    if(f){
      const frames=f.bodies.map((_,i)=>({number:i+1,events:[{at:stamp(),type:'launch'}],end:null}));
      flights.set(f,{id:f.id,team:f.team,scout:scout.id,npc:!!isNpc,frames,events:[{at:stamp(),type:'launch'}]});
    }
    return f;
  };
  function mission(f,type,details){
    record(f,type,details);
    flights.get(f)?.frames.filter(frame=>!frame.end).forEach(frame=>frame.events.push({at:stamp(),type,...details}));
  }
  groundDroneOrbit=(f,p)=>{orbit(f,p);mission(f,'orbit');};
  groundDroneDive=(f,t)=>{
    const ok=dive(f,t);
    if(ok)mission(f,'diveOrdered',{target:targetInfo(t)});
    else record(f,'diveRejected',{target:targetInfo(t)});
    return ok;
  };
  groundDroneRecall=(f)=>{
    const d=f.groundDrone,r=groundDroneRules();
    const why=!inFlightStep?'order':d.npc&&(d.damaged??groundAliveBodies(f)<r.airframes)?'damaged':'battery';
    recall(f);
    mission(f,'recall',{reason:why});
  };
  const fly=groundDroneStep;
  groundDroneStep=dt=>{
    inFlightStep=true;
    try{fly(dt);}finally{inFlightStep=false;}
  };
  groundDroneReceiveShot=(f,src,body,weapon)=>{
    shooter={kind:src.groundKind,aa:src.groundKind==='mobileAA'||!!weapon?.air};
    try{receiveShot(f,src,body,weapon);}finally{shooter=null;}
  };
  groundDroneLose=(f,body,shotDown)=>{
    const frame=flights.get(f)?.frames[f.bodies.indexOf(body)];
    if(frame&&body.alive){
      const phase=f.groundDrone.mission?.type??'idle';
      if(shotDown)finish(frame,'shotDown',{phase,diving:f.groundDrone.dive?.body===body,...shooter});
      else if(impact)finish(frame,groundDroneStats[f.team].hits>impact.hits?'hit':'miss',{target:impact.target});
    }
    lose(f,body,shotDown);
  };
  groundDroneDiveStep=(f,m,travel)=>{
    const flight=flights.get(f),before=f.groundDrone.dive;
    impact={hits:groundDroneStats[f.team].hits,target:targetInfo(m.target)};
    try{diveStep(f,m,travel);}finally{impact=null;}
    const after=f.groundDrone.dive;
    if(before===after)return;
    if(before){
      const frame=flight?.frames[f.bodies.indexOf(before.body)];
      if(frame&&!frame.end)frame.events.push({at:stamp(),type:'diveInterrupted',seen:groundSeenBy(f.team,m.target),
        inRange:groundDistanceTo(f.groundDrone.scout,m.target)<=groundDroneRules().rangeKm*GROUND_SCALE});
    }
    if(after)flight?.frames[f.bodies.indexOf(after.body)].events.push({at:stamp(),type:'diveStarted',target:targetInfo(m.target)});
  };
  groundDroneRemove=(f,landed=false)=>{
    const d=f.groundDrone;
    const reason=landed?'recovered':!groundDroneSlotAlive(d.scout,d.slot)||d.scout.embarked?'motherLost':
      gameSec>=d.expires?'batteryOut':groundDistanceTo(f,d.scout)>groundDroneRules().rangeKm*GROUND_SCALE+1e-8?'outOfRange':'removed';
    for(const frame of flights.get(f)?.frames??[])if(!frame.end)finish(frame,reason);
    remove(f,landed);
  };
  groundDroneNpc=(scout,contacts,point)=>{
    const r=groundDroneRules(),range=r.rangeKm*GROUND_SCALE;
    const visible=contacts?.visible??fleets.filter(t=>groundDroneTarget(scout,t));
    const preferred=visible.filter(t=>r.npcTargets.includes(t.groundKind));
    const reachable=preferred.filter(t=>groundDistanceTo(scout,t)<=range);
    const candidates=contacts?reachable.filter(t=>contacts.targets.includes(t)):reachable;
    const decision={scout:scout.id,team:scout.team,moving:!!scout.order,
      visible:preferred.map(targetInfo),reachable:reachable.map(targetInfo),candidates:candidates.map(targetInfo)};
    const key=JSON.stringify(decision);
    if(lastDecision.get(scout)!==key){lastDecision.set(scout,key);decisions.push({at:stamp(),...decision});}
    npc(scout,contacts,point);
  };
  window.droneTraceResult=()=>{
    const sorties=[...flights.values()];
    const outcomes={hit:0,miss:0,shotDown:0,recovered:0,batteryOut:0,motherLost:0,outOfRange:0,removed:0,airborne:0};
    const stages={orbit:0,diveOrdered:0,diveStarted:0,shotDownInOrbit:0,shotDownOnApproach:0,shotDownWhileDiving:0,shotDownOnRecall:0};
    for(const flight of sorties)for(const frame of flight.frames){
      outcomes[frame.end?.type??'airborne']++;
      for(const stage of ['orbit','diveOrdered','diveStarted'])if(frame.events.some(e=>e.type===stage))stages[stage]++;
      if(frame.end?.type==='shotDown'){
        if(frame.end.phase==='dive')stages[frame.end.diving?'shotDownWhileDiving':'shotDownOnApproach']++;
        else if(frame.end.phase==='orbit')stages.shotDownInOrbit++;
        else if(frame.end.phase==='recall')stages.shotDownOnRecall++;
      }
    }
    return {outcomes,stages,sorties,decisions};
  };
}

async function main(){
  const args=process.argv.slice(2);
  if(!args.length)throw Error('測定する版のフォルダを指定してください');
  const versions=args.length===1&&!args[0].includes('=')?[['main',args[0]],['worktree',ROOT]]:args.map(arg=>{
    const i=arg.indexOf('=');
    if(i<1||i===arg.length-1)throw Error('版名=フォルダ の形で指定してください');
    return [arg.slice(0,i),arg.slice(i+1)];
  });
  const {browser,page,errors}=await openGame();
  const trials=[];
  try{
    for(const [version,root] of versions)for(const seed of [1,2,3]){
      await page.goto(pathToFileURL(path.resolve(root,'index.html')).href);
      await page.evaluate(setupNpcSim,{terrain:'baikonur',seed,doctrines:['earth','mars'],level:'standard',seconds:300,idle:false});
      await page.evaluate(traceDrones);
      const batch=await page.evaluate(()=>{
        const count=predicate=>[0,1].map(team=>fleets.filter(f=>f.team===team&&!f.groundDrone&&predicate(f)).length);
        const scouts=count(f=>f.groundKind==='scout'),initial=count(f=>f.alive);
        const owners=groundSites.map(s=>s.owner);let first=null;
        const origin=gameSec,dt=.05/groundRuleSet().movement.timeScale;
        for(let i=0;i<300/.05&&!over;i++){
          step(dt);
          if(!first){
            const sites=groundSites.filter((s,j)=>s.owner!==null&&s.owner!==owners[j]);
            if(sites.length)first={sec:+(gameSec-origin).toFixed(2),clock:clockStr(),sites:sites.map(s=>[s.id,s.owner])};
          }
        }
        const drones=typeof groundDroneStats==='undefined'?[0,1].map(()=>({launched:0,hits:0,shotDown:0})):groundDroneStats;
        const alive=f=>f.alive&&f.hpPool>0&&!f.groundExited;
        return {scouts,scoutsLeft:count(f=>f.groundKind==='scout'&&alive(f)),initial,first,drones,left:count(alive),elapsed:+(gameSec-origin).toFixed(2),over,...window.droneTraceResult()};
      });
      assert.deepEqual(errors,[],'ページ例外');
      const row={version,seed,...batch};trials.push(row);
      const {sorties,decisions,...summary}=row;
      assert.equal(sorties.length,row.drones.reduce((n,t)=>n+t.launched,0),'発進数と飛行記録の照合');
      for(const [outcome,stat] of [['hit','hits'],['shotDown','shotDown']]){
        assert.equal(row.outcomes[outcome],row.drones.reduce((n,t)=>n+t[stat],0),'機体の終わり方と戦闘統計の照合');
      }
      console.log(JSON.stringify(summary));
    }
    const out=path.join(ROOT,'.shots','ground-drone-trace.json');
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(trials,null,2)+'\n');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
