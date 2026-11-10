/* 既存命令の上に保持する爆撃進入。狙点と発射済み台帳はUndo・帰投でも共有する。 */
const GROUND_BOMB_APPROACH=Object.freeze({tolerance:.5,alignment:.15,maxVerticalSpeedMps:1}); // 仮: 125m、約8.6度。
function groundBombPlan(f,p){
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
function groundRestoreBombRun(f,saved){return saved?.ledger?.source===f&&!saved.ledger.issued&&f.alive?{ledger:saved.ledger,phase:'align',plan:null}:null;}
function groundBombCancel(f){f.groundBombRun=null;f.groundAirTask=null;f.groundAirTarget=null;f.groundLoiterCenter=null;}
function groundBombPrepare(f,target){
 if(f.groundKind!=='supportAircraft'||!groundStrikeWeapon(f)||f.groundBombRun)return false;
 const shot=target.area?groundAreaShot(f,target.area):target.point?{aim:target.point.clone(),impact:null}:null;
 if(!shot||!groundStrikeInRange(f,shot.aim))return false;
 const plan=groundBombPlan(f,shot.aim);if(!plan)return false;
 const state=groundBombState(f),ledger={source:f,area:target.area||null,shot:{aim:shot.aim.clone(),impact:shot.impact?.clone()||null},altitudeMeters:state.originMeters.y,issued:false};
 const delta=f.pos.clone().sub(plan.releasePos),along=delta.dot(plan.heading),cross=delta.clone().addScaledVector(plan.heading,-along).length();
 f.groundBombRun={ledger,plan,phase:along<0&&cross<.5&&groundAirForward(f).dot(plan.heading)>.98?'run':'align'};return true;
}
function groundBombApproach(f,dt){
 const run=f.groundBombRun;if(!run||run.ledger.issued)return false;
 const aim=run.ledger.shot.aim,plan=run.plan||groundBombPlan(f,aim);if(!plan){groundBombCancel(f);groundAirLoiter(f,dt);return true;}run.plan=plan;
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
  if(!groundStrikeWeapon(f)){f.groundBombRun=null;continue;}
  if(!groundStrikeCanLaunch(f,run.ledger.shot.aim))continue;
  const ledger=run.ledger,salvo=f.groundAreaSalvo;
  if(!groundVolleyStart(f,{...(ledger.area?{area:ledger.area}:{point:ledger.shot.aim}),shot:ledger.shot}))continue;
  ledger.issued=true;if(f.groundBombRun===run)f.groundBombRun=null;
  if(ledger.area){ledger.area.sent.set(f,(ledger.area.sent.get(f)||0)+1);if(salvo?.area===ledger.area){salvo.remaining--;if(salvo.remaining<=0)f.groundAreaSalvo=null;}}
  if(!f.groundAreaSalvo&&!f.order)nextOrder(f);
 }
}
function groundAirCopyOrder(o){
 if(!o)return null;if(o.type!=='move')return {type:o.type,target:o.target};
 const points=o.path?.points?.slice(o.path.atIndex)||[...(o.via||[]),o.dest];
 return {type:'move',via:points.slice(0,-1).map(p=>p.clone()),dest:(points[points.length-1]||o.dest).clone()};
}
function groundCopyAirTask(f){return {order:groundAirCopyOrder(f.order),queue:(f.queue||[]).map(groundAirCopyOrder),strike:f.strike,
 plan:typeof groundCopyPlan==='function'?groundCopyPlan(f.groundPlan):null,salvo:f.groundAreaSalvo?{...f.groundAreaSalvo}:null,volley:groundCopyVolley(f.groundVolley),bomb:groundCopyBombRun(f.groundBombRun)};}
function groundRestoreAirTask(f,task){
 if(!task)return;
 if(task.order&&(task.order.type!=='attack'||task.order.target?.alive&&groundSeenBy(f.team,task.order.target)))order(f,groundAirCopyOrder(task.order));
 f.queue=task.queue.filter(o=>o&&(o.type!=='attack'||o.target?.alive)).map(groundAirCopyOrder);f.strike=task.strike;
 f.groundPlan=typeof groundCopyPlan==='function'?groundCopyPlan(task.plan):null;f.groundAreaSalvo=groundRestoreSalvo(f,task.salvo);f.groundVolley=groundRestoreVolley(f,task.volley);f.groundBombRun=groundRestoreBombRun(f,task.bomb);
 if(!f.order&&!f.groundAreaSalvo&&!f.groundBombRun)nextOrder(f);
}
