/* 既存命令の上に保持する爆撃進入。狙点と発射済み台帳はUndo・帰投でも共有する。 */
const GROUND_BOMB_APPROACH=Object.freeze({tolerance:.5,alignment:.15,maxVerticalSpeedMps:1}); // 仮: 125m、約8.6度。
function groundBombPlan(f,p){
 if(groundAirSquad(f))return groundSupportBombPlan(f,p);
 const state=groundBombState(f);if(!state)return null;
 const radius=Math.max(1,state.speedWorld/GROUND_AIR_CONTROL.turnRate),inside=p=>groundPass(groundMapX(p.x),groundMapY(p.z),'air');
 const valid=plan=>plan&&inside(plan.releasePos)&&inside(plan.releasePos.clone().addScaledVector(plan.heading,-radius*6));
 const first=groundBombRelease(f,p);if(valid(first))return first;
 // 盤端でも盤内から進入できる方向を探す。これは計画だけで、実投下を操舵しない。
 for(let i=0;i<8;i++){
  const angle=Math.atan2(p.z,p.x)+i*Math.PI/4,heading=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)),meters=new THREE.Vector3((p.x-heading.x)*state.scene.m,state.originMeters.y,(p.z-heading.z)*state.scene.m);
  const plan=groundBombRelease({...f,pos:groundBallisticWorld(state.scene,meters)},p);if(valid(plan))return plan;
 }
 return null;
}
function groundBombPose(f,p){
 const plan=groundBombRelease(f,p),state=groundBombState(f);if(!plan||!state||Math.abs(state.velocityMeters.y)>GROUND_BOMB_APPROACH.maxVerticalSpeedMps)return false;
 if(groundAirForward(f).dot(plan.heading)<Math.cos(GROUND_BOMB_APPROACH.alignment))return false;
 const end=groundFreeFall(state.originMeters,state.velocityMeters,plan.physicalFallSeconds);
 return Math.hypot(end.x/state.scene.m-p.x,end.z/state.scene.m-p.z)<=GROUND_BOMB_APPROACH.tolerance;
}
function groundCopyBombRun(run){return run?.ledger?{ledger:run.ledger,phase:run.phase,plan:run.plan}:null;}
function groundRestoreBombRun(f,saved){return saved?.ledger?.source===f&&(!saved.ledger.issued||f.groundVolley)&&f.alive?{ledger:saved.ledger,phase:saved.ledger.issued?'run':'align',plan:saved.ledger.issued?saved.plan:null}:null;}
function groundBombCancel(f){
 f.groundBombRun=null;f.groundAirTask=null;f.groundAirTarget=null;f.groundLoiterCenter=null;
 const track=f.groundAirSquad;
 if(f.groundKind==='supportAircraft'&&track){track.supportPass=null;track.supportPatrol=null;}
}
function groundBombPrepare(f,target){
 if(f.groundKind!=='supportAircraft'||!groundStrikeWeapon(f)||f.groundBombRun)return false;
 const shot=target.area?groundAreaShot(f,target.area):target.point?{aim:target.point.clone(),impact:null}:null;
 if(!shot||!groundAirInside(shot.aim))return false;
 if(groundAirSquad(f)){
  const plan=groundSupportBombPlan(f,shot.aim);if(!plan)return false;
  const releaseAim=plan.target.clone();
  const ledger={source:f,area:target.area||null,shot,releaseAim,altitudeMeters:plan.altitudeMeters,issued:false};
  f.groundBombRun={ledger,plan,route:plan.route,phase:'align'};return true;
 }
 const centerPlan=groundBombPlan(f,shot.aim);if(!centerPlan)return false;
 // 仮の投下列: 進入の向きに爆風の半径ずつ。真ん中の1発（6発なら3発目）を指定点に落とす（列の真ん中を指定点にすると、偶数では指定点に1発も落ちない）。
 // 最初の投下へ進入し、機速で間隔を作る。
 const weapon=groundStrikeWeapon(f),state=groundBombState(f),releaseAim=shot.aim.clone().addScaledVector(centerPlan.heading,-Math.floor((weapon.bombsPerPass-1)/2)*weapon.radius);
 // 最初の投下点から方向を選び直すと、真下を指定した場合に方向が反転し、列の中央もずれる。
 // 中央へ進入する方向を保ったまま、最初の投下点の水平投下解を求める（groundBombPlanと同じ物理解）。
 const probe=new THREE.Vector3((releaseAim.x-centerPlan.heading.x)*state.scene.m,state.originMeters.y,(releaseAim.z-centerPlan.heading.z)*state.scene.m);
 const plan=groundBombRelease({...f,pos:groundBallisticWorld(state.scene,probe)},releaseAim),radius=Math.max(1,state.speedWorld/GROUND_AIR_CONTROL.turnRate);
 if(!plan||![plan.releasePos,plan.releasePos.clone().addScaledVector(plan.heading,-radius*6)].every(p=>groundPass(groundMapX(p.x),groundMapY(p.z),'air')))return false;
 const ledger={source:f,area:target.area||null,shot:{aim:shot.aim.clone(),impact:shot.impact?.clone()||null},releaseAim,altitudeMeters:state.originMeters.y,issued:false};
 const delta=f.pos.clone().sub(plan.releasePos),along=delta.dot(plan.heading),cross=delta.clone().addScaledVector(plan.heading,-along).length();
 f.groundBombRun={ledger,plan,phase:along<0&&cross<.5&&groundAirForward(f).dot(plan.heading)>.98?'run':'align'};return true;
}
function groundBombApproach(f,dt){
 const run=f.groundBombRun;if(!run)return false;
 const aim=run.ledger.releaseAim,plan=run.plan||groundBombPlan(f,aim);if(!plan){groundBombCancel(f);groundAirLoiter(f,dt);return true;}run.plan=plan;
 if(run.ledger.issued){groundAirTurnMove(f,f.pos.clone().addScaledVector(plan.heading,Math.max(1,speedOf(f))),dt);return true;}
 const radius=Math.max(1,speedOf(f)/GROUND_AIR_CONTROL.turnRate),pre=plan.releasePos.clone().addScaledVector(plan.heading,-radius*6),stage=plan.releasePos.clone().addScaledVector(plan.heading,-radius*3);
 // 上流の二つの点を順に通り、逆向きからの接近でも旋回距離を残す。
 if(run.phase==='align'&&groundDistanceTo(f,{pos:pre})<radius*.5)run.phase='entry';
 if(run.phase==='entry'&&groundDistanceTo(f,{pos:stage})<radius*.5)run.phase='run';
 const delta=f.pos.clone().sub(plan.releasePos),along=delta.dot(plan.heading);
 const line=plan.releasePos.clone().addScaledVector(plan.heading,along+radius);
 groundAirTurnMove(f,run.phase==='align'?pre:run.phase==='entry'?stage:line,dt);
 if(run.phase==='run'&&along>radius*2)run.phase='align';
 return true;
}
function groundBombStep(){
 for(const f of fleets){const run=f.groundBombRun;if(!run||f.groundAirState)continue;
  if(!f.alive){groundBombCancel(f);continue;}
  if(run.ledger.issued){if(!f.groundVolley){f.groundBombRun=null;if(!f.groundAreaSalvo&&!f.order)nextOrder(f);}continue;}
  if(!groundStrikeWeapon(f)){f.groundBombRun=null;continue;}
  if(!groundAirSquad(f))groundBombReleaseReady(f,run);
 }
}
function groundBombReleaseReady(f,run){
 const ledger=run.ledger,salvo=f.groundAreaSalvo;
 if(!groundStrikeCanLaunch(f,ledger.releaseAim))return;
 const shift=ledger.releaseAim.clone().sub(ledger.shot.aim),shot={aim:ledger.releaseAim,impact:ledger.shot.impact?.clone().add(shift)||null};
 if(!groundVolleyStart(f,{...(ledger.area?{area:ledger.area}:{point:ledger.releaseAim}),shot}))return;
 ledger.issued=true;
 if(ledger.area){ledger.area.sent.set(f,(ledger.area.sent.get(f)||0)+1);if(salvo?.area===ledger.area){salvo.remaining--;if(salvo.remaining<=0)f.groundAreaSalvo=null;}}
}

// 投下列と、旋回を終えて機首をそろえる点をまとめて盤内・作戦空域に収める。
function groundSupportBombPlan(f,aim){
 const rules=groundRuleSet().airCombat,weapon=groundStrikeWeapon(f);
 if(!weapon||!groundBallisticFinite(aim)||!groundAirInside(aim))return null;
 const b=groundAirSquadTrack(f).bodies[0],cruise=rules.cruiseKmSec.supportAircraft*GROUND_SCALE;
 const space=groundAirEngagementSpace(aim,rules.sectorKm),height=groundBandHeight('high');
 const scene=groundBallisticScene();
 if(!scene)return null;
 const margin=rules.boundaryMarginKm*GROUND_SCALE,radius=groundAirRouteRadius(b,cruise,rules);
 const clearance=groundAirClearanceToEdge(b.pos,space);
 const start={...b,engagementSpace:clearance>0?space:null};
 const startMargin=Math.min(margin,Math.max(1e-6,groundAirClearanceToEdge(b.pos,start.engagementSpace)*.5));
 const bearing=groundAirBearing(b.pos,aim),inward=groundAirBearing(aim,space.center);
 const entry=rules.support.entryKm*GROUND_SCALE,exit=rules.support.exitKm*GROUND_SCALE;
 const stream=(weapon.bombsPerPass-1)*weapon.radius,straight=entry+stream+exit;
 let best=null;
 for(const yaw of [bearing,b.yaw,inward,...Array.from({length:12},(_,i)=>bearing+(i+1)*Math.PI/6)]){
  const heading=groundAirDirection(yaw);
  const target=aim.clone().addScaledVector(heading,-Math.floor((weapon.bombsPerPass-1)/2)*weapon.radius);
  const lastAim=target.clone().addScaledVector(heading,stream);
  if(!groundAirInside(target)||!groundAirInside(lastAim))continue;
  const origin=target.clone().addScaledVector(heading,-GROUND_SCALE);
  const pos=groundBallisticWorld(scene,new THREE.Vector3(origin.x*scene.m,height*scene.m,origin.z*scene.m));
  const plan=groundBombRelease({...f,pos,heading,groundFlightVelocity:heading.clone().multiplyScalar(cruise)},target);
  if(!plan)continue;
  const gate=plan.releasePos.clone().addScaledVector(heading,-entry);
  const end=gate.clone().addScaledVector(heading,straight);
  if(groundAirClearanceToEdge(end,space)<radius+margin||
     !groundAirRouteInside({pos:gate,yaw,engagementSpace:space},[{left:straight,curve:0}],margin))continue;
  const route=groundAirRoute(start,gate,yaw,radius,startMargin);
  if(!route||best&&route.length>=best.route.length)continue;
  best={...plan,space,gate,yaw,route};
 }
 if(best){
  best.route.segments.push({left:straight,curve:0,bombRun:true});best.route.length+=straight;
 }
 return best;
}
function groundSupportPatrol(b,space,returnPoint,cruise,rules){
 const radius=groundAirRouteRadius(b,cruise,rules),margin=rules.boundaryMarginKm*GROUND_SCALE;
 const start={...b,engagementSpace:groundAirClearanceToEdge(b.pos,space)>0?space:null};
 const startMargin=Math.min(margin,Math.max(1e-6,groundAirClearanceToEdge(b.pos,start.engagementSpace)*.5));
 const points=[];
 if(returnPoint)points.push(returnPoint);
 const vertices=[.22,.5,.78],{lerp}=THREE.MathUtils;
 const grid=vertices.flatMap(x=>vertices.map(z=>new THREE.Vector3(lerp(space.minX,space.maxX,x),b.pos.y,lerp(space.minZ,space.maxZ,z))));
 points.push(...grid.sort((a,c)=>c.distanceToSquared(b.pos)-a.distanceToSquared(b.pos)));
 for(const point of points){
  const yaw=groundAirBearing(b.pos,point);
  if(groundAirClearanceToEdge(point,space)<radius+margin||Math.hypot(point.x-b.pos.x,point.z-b.pos.z)<2*radius)continue;
  const route=groundAirRoute(start,point,yaw,radius,startMargin);
  if(route)return route;
 }
 return null;
}
function groundSupportThreat(f){
 let nearest=null,distance=Infinity;
 for(const fighter of fleets){
  if(fighter.team===f.team||fighter.groundKind!=='fighter'||!fighter.alive||fighter.embarked||
     fighter.locked||groundAbsent(fighter)||groundTrainingEnemy(fighter)||groundStaticTarget(fighter)||
     groundAirSquadTarget(fighter,fighter.groundAirSquad?.target)!==f||!groundSeenBy(fighter.team,f))continue;
  const d=groundDistanceTo(f,fighter);
  if(d<distance){nearest=fighter;distance=d;}
 }
 return nearest;
}
function groundSupportEvade(b,space,threat,cruise,rules){
 const r=rules.intercept,angle=THREE.MathUtils.degToRad(r.evadeAngleDeg);
 const points=[-angle,angle].map(offset=>b.pos.clone().addScaledVector(groundAirDirection(b.yaw+offset),r.evadeLegKm*GROUND_SCALE));
 const clearance=groundAirRouteRadius(b,cruise,rules)+rules.boundaryMarginKm*GROUND_SCALE;
 const point=points.filter(p=>groundAirClearanceToEdge(p,space)>=clearance)
  .sort((a,c)=>c.distanceToSquared(threat.pos)-a.distanceToSquared(threat.pos))[0];
 return groundSupportPatrol(b,space,point,cruise,rules);
}
function groundSupportStep(f,dt){
 if(!(Number.isFinite(dt)&&dt>0))return true;
 const rules=groundRuleSet().airCombat,cruise=rules.cruiseKmSec.supportAircraft*GROUND_SCALE,track=groundAirSquadTrack(f),b=track.bodies[0];
 if(!f.bodies[0].alive)return true;
 const order=f.order,path=order?.type==='move'?order.path:null,point=path?.points[path.atIndex];
 if(!f.groundAirState&&!f.groundBombRun&&order?.type==='attack'&&groundManualTargetAllowed(f,order.target)&&groundSeenBy(f.team,order.target)&&
    (f.groundStrikeCooldown||0)<=1e-8)groundBombPrepare(f,{point:groundStrikeTargetPoint(f,0,order.target)});
 const run=f.groundBombRun,before=f.pos.clone();
 const threat=!run&&!f.groundVolley&&!f.groundAirState?groundSupportThreat(f):null;
 if(track.supportThreat!==threat){
  track.supportThreat=threat;track.supportPatrol=null;b.nav=null;b.navKey=null;b.turnInward=false;
  if(threat){track.supportPass=null;track.supportSpace=groundAirEngagementSpace(b.pos,rules.sectorKm);}
 }
 const navigating=path&&!threat;
 if(navigating){
  track.supportSpace=null;track.supportPass=null;track.supportPatrol=null;b.engagementSpace=null;
 }else if(run&&track.supportPass!==run){
  track.supportPass=run;track.supportSpace=run.plan?.space;track.supportPatrol=null;
  // 発射後のUndoでは、現在位置から残りの投下時間と離脱を直線でつなぐ。
  if(run.ledger.issued&&!run.route&&f.groundVolley){
   const volley=f.groundVolley,remaining=Math.max(0,volley.ledger.burstDuration-volley.elapsed);
   const length=remaining*cruise+rules.support.exitKm*GROUND_SCALE,segments=[{left:length,curve:0}];
   const start={...b,engagementSpace:track.supportSpace};
   if(groundAirRouteInside(start,segments,rules.boundaryMarginKm*GROUND_SCALE))run.route={length,segments};
  }
 }
 const height=f.band==='high'&&!f.bandTo?groundBandHeight('high'):null;
 const heights=height===null?null:{min:height,max:height};
 for(let left=dt;left>1e-8;){
  const step=Math.min(left,rules.stepSec,GROUND_BOMB_APPROACH.tolerance/cruise);left-=step;track.elapsed+=step;
  if(navigating)groundAirNavigate(f,b,point,point,0,step,cruise,rules,heights);
  else{
   if(run&&!run.ledger.issued&&!run.route?.segments.length&&!track.supportPatrol?.segments.length){
    // 帰投・Undo・通り過ぎたときも、台帳の同じ狙点へ進入し直す。
    run.plan=groundSupportBombPlan(f,run.ledger.shot.aim);
    if(run.plan){run.route=run.plan.route;run.ledger.releaseAim.copy(run.plan.target);track.supportSpace=run.plan.space;run.phase='align';}
   }
   const pass=track.supportPass;
   const space=track.supportSpace??=groundAirEngagementSpace(b.pos,rules.sectorKm);
   b.engagementSpace=groundAirClearanceToEdge(b.pos,space)>=0?space:null;
   let route=pass?.route?.segments.length?pass.route:null;
   if(!route){
    if(!track.supportPatrol?.segments.length){
     track.supportPatrol=threat?groundSupportEvade(b,space,threat,cruise,rules):groundSupportPatrol(b,space,pass?.plan?.gate,cruise,rules);
     if(!run||run.ledger.issued)track.supportPass=null;
    }
    route=track.supportPatrol;
   }
   const pitch=groundAirPitchTo(b,height??groundAirLevelHeight(f,b));
   groundAirFly(b,step,cruise,rules,groundAirInwardYaw(b),pitch,route,heights);
  }
  f.pos.copy(b.pos);f.heading.copy(groundAirDirection(b.yaw));f.march.copy(f.heading);
  f.groundFlightVelocity=b.velocity.clone();track.last.copy(f.pos);track.yaw=b.yaw;f.groundBodyGeometry=null;
  if(run&&!run.ledger.issued&&run.route?.segments[0]?.bombRun){
   run.phase='run';groundBombReleaseReady(f,run);
  }
 }
 groundSupplyMoved(f,before,f.pos);
 if(navigating){
  path.s=Math.min(path.L||Infinity,(path.s||0)+Math.hypot(f.pos.x-before.x,f.pos.z-before.z));
  if(point&&b.nav?.segments.length===0)path.atIndex++;
  if(!point||path.atIndex>=path.points.length){
   groundFormationArrive(f);f.order=null;dropArrow(f.arrow);f.arrow=null;
   if(!f.groundAirState)nextOrder(f);
  }
 }
 return true;
}
function groundAirCopyOrder(o){
 if(!o)return null;if(o.type!=='move')return {type:o.type,target:o.target};
 const points=o.path?.points?.slice(o.path.atIndex)||[...(o.via||[]),o.dest];
 return {type:'move',via:points.slice(0,-1).map(p=>p.clone()),dest:(points[points.length-1]||o.dest).clone()};
}
function groundCopyAirTask(f){return {order:f.order?.groundFrontId?null:groundAirCopyOrder(f.order),queue:(f.queue||[]).map(groundAirCopyOrder),strike:f.strike,
 salvo:f.groundAreaSalvo?{...f.groundAreaSalvo}:null,volley:groundCopyVolley(f.groundVolley),bomb:groundCopyBombRun(f.groundBombRun)};}
function groundRestoreAirTask(f,task){
 if(!task)return;
 if(task.order&&(task.order.type!=='attack'||task.order.target?.alive&&groundSeenBy(f.team,task.order.target)))order(f,groundAirCopyOrder(task.order));
 f.queue=task.queue.filter(o=>o&&(o.type!=='attack'||o.target?.alive)).map(groundAirCopyOrder);f.strike=task.strike;
 f.groundAreaSalvo=groundRestoreSalvo(f,task.salvo);f.groundVolley=groundRestoreVolley(f,task.volley);f.groundBombRun=groundRestoreBombRun(f,task.bomb);
 if(!f.order&&!f.groundAreaSalvo&&!f.groundBombRun)nextOrder(f);
}
