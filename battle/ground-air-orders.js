/* 航空機の連続飛行。編成のある航空隊は各機の座標で進める。 */
const GROUND_AIR_CONTROL=Object.freeze({turnRate:.8,lookAhead:.7,waypoint:.8,fireCone:Math.PI/5});
function groundFlyingAircraft(f){return !!f&&['fighter','attack','supportAircraft'].includes(f.groundKind);}
function groundAirAngleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
function groundAirForward(f){
 const d=f.heading?.clone()||new THREE.Vector3(0,0,1);d.y=0;
 return d.lengthSq()>1e-10?d.normalize():d.set(0,0,1);
}
function groundAirInFront(f,t){
 if(!groundFlyingAircraft(f)||!groundUsesAirRange(f,t))return true;
 const d=t.pos.clone().sub(f.pos);d.y=0;if(d.lengthSq()<1e-10)return true;
 return groundAirForward(f).dot(d.normalize())>=Math.cos(GROUND_AIR_CONTROL.fireCone);
}
// AGL巡航。爆撃進入だけ海面基準の実高度を保持する（障害物回避を優先）。
function groundAirPhysicalY(p){const h=groundSightHeight(p.x,p.z),e=groundData().meta.elevationExaggeration||1;return h/e+p.y-h;}
function groundAirSafeHeight(f,p,from){
 const run=f.groundBombRun,h=groundSightHeight(p.x,p.z),e=groundData().meta.elevationExaggeration||1;
 const y=run?h+(run.ledger.altitudeMeters*GROUND_SCALE/1000-h/e):groundSurfaceHeight(p.x,p.z)+groundUnitHeight({...f,pos:p})-groundHeight(p.x,p.z);
 return Math.max(y,groundAirClearance(from,p,.5));
}
function groundAirClearance(from,p,clearance){
 let y=groundSurfaceHeight(p.x,p.z)+clearance;
 const dx=p.x-from.x,dz=p.z-from.z,g=groundMeshGrid(),gx=(from.x-g.originX)/g.stepX,gz=(from.z-g.originZ)/g.stepZ,vx=dx/g.stepX,vz=dz/g.stepZ;
 const cuts=[...groundBallisticGridCuts(gx,gz,vx,vz),...groundBallisticGridCuts(gx+gz,0,vx+vz,0)];
 for(const u of cuts)y=Math.max(y,groundSurfaceHeight(from.x+dx*u,from.z+dz*u)+clearance);
 const minX=Math.min(from.x,p.x),maxX=Math.max(from.x,p.x),minZ=Math.min(from.z,p.z),maxZ=Math.max(from.z,p.z);
 for(const box of groundBuildings){
  if(box.top+clearance<=y||box.maxX<minX||box.minX>maxX||box.maxZ<minZ||box.minZ>maxZ)continue;
  const interval=[0,1];
  if(groundBallisticSlab(from.x,dx,box.minX,box.maxX,interval)&&groundBallisticSlab(from.z,dz,box.minZ,box.maxZ,interval))y=box.top+clearance;
 }
 return y;
}
function groundAirTurnMove(f,target,dt){
 if(!Number.isFinite(dt)||dt<=0||!target)return;
 const speed=Math.max(0,speedOf(f)),heading=groundAirForward(f),turn=GROUND_AIR_CONTROL.turnRate;
 const desired=target.clone().sub(f.pos);desired.y=0;
 if(desired.lengthSq()<1e-10)desired.copy(heading);
 // 境界を突き抜ける前に盤の中央へ旋回。空域の海陸通行は同じ。
 const look=Math.max(speed*2/turn,speed*dt),future=f.pos.clone().addScaledVector(heading,look);
 const waypoint=f.order?.type==='move'&&f.order.path?.points[f.order.path.atIndex]===target&&desired.length()<look*2;
 // 有効な盤内の移動先は先読み回避で避け続けない。実際の次の位置は下で必ず境界検査する。
 if(waypoint)f.groundAirBoundary=null;
 else if(!groundPass(groundMapX(future.x),groundMapY(future.z),'air')&&!f.groundAirBoundary)f.groundAirBoundary=f.pos.clone();
 if(f.groundAirBoundary){
  if(groundDistanceTo(f,{pos:f.groundAirBoundary})>look*2)f.groundAirBoundary=null;
  else desired.set(-f.pos.x,0,-f.pos.z);
 }
 const a=Math.atan2(heading.x,heading.z),b=Math.atan2(desired.x,desired.z),delta=groundAirAngleDelta(a,b),next=a+Math.max(-turn*dt,Math.min(turn*dt,delta));
 const d=new THREE.Vector3(Math.sin(next),0,Math.cos(next)),p=f.pos.clone().addScaledVector(d,speed*dt);
 if(!groundPass(groundMapX(p.x),groundMapY(p.z),'air')){
  // 境界上からの初期配置も盤外へ置かない。次のフレームも中央への旋回を続ける。
  f.heading.copy(d);f.march.copy(d);f.groundFlightVelocity=new THREE.Vector3();return;
 }
 const before=f.pos.clone();p.y=groundAirSafeHeight(f,p,before);
 f.pos.copy(p);f.heading.copy(d);f.march.copy(d);
 // 表示地形の18倍の斜面速度を爆弾の鉛直慣性へ混ぜない。
 f.groundFlightVelocity=new THREE.Vector3((p.x-before.x)/dt,(groundAirPhysicalY(p)-groundAirPhysicalY(before))/dt,(p.z-before.z)/dt);
 groundSupplyMoved(f,before,f.pos);
}
function groundAirLoiter(f,dt){
 if(!f.groundLoiterCenter)f.groundLoiterCenter=f.pos.clone().addScaledVector(groundAirForward(f),-Math.max(1,speedOf(f)/GROUND_AIR_CONTROL.turnRate));
 const center=f.groundLoiterCenter,r=Math.max(1,speedOf(f)/GROUND_AIR_CONTROL.turnRate),a=Math.atan2(f.pos.z-center.z,f.pos.x-center.x)+GROUND_AIR_CONTROL.lookAhead;
 groundAirTurnMove(f,new THREE.Vector3(center.x+Math.cos(a)*r,f.pos.y,center.z+Math.sin(a)*r),dt);
}
function groundAirMotion(f,dt){
 if(!op.ground||!groundFlyingAircraft(f))return false;
 if(!f.alive){groundBombCancel(f);return true;}
 if(f.embarked||groundAbsent(f)||f.locked||groundTrainingEnemy(f)||groundStaticTarget(f))return true;
 if(groundAirSquad(f))return f.groundKind==='supportAircraft'?groundSupportStep(f,dt):groundAirSquadStep(f,dt);
 if(!f.groundAirState&&f.groundBombRun)return groundBombApproach(f,dt);
 const o=f.order;
 if(o?.type==='move'&&o.path){
  const p=o.path,target=p.points[p.atIndex];
  if(!target){groundFormationArrive(f);f.order=null;dropArrow(f.arrow);f.arrow=null;f.groundLoiterCenter=o.dest?.clone()||f.pos.clone();if(!f.groundAirState)nextOrder(f);return true;}
  const before=groundDistanceTo(f,{pos:target});groundAirTurnMove(f,target,dt);const after=groundDistanceTo(f,{pos:target});
  p.s=Math.min(p.L||Infinity,(p.s||0)+Math.max(0,speedOf(f)*dt));
  o.airClosest=Math.min(o.airClosest??Infinity,after);
  const radius=Math.max(GROUND_AIR_CONTROL.waypoint,speedOf(f)*dt);
  if(after<=radius||(after>before&&o.airClosest<Math.max(radius,speedOf(f)/GROUND_AIR_CONTROL.turnRate*.4))){p.atIndex++;o.airClosest=Infinity;}
  if(p.atIndex>=p.points.length){groundFormationArrive(f);f.order=null;dropArrow(f.arrow);f.arrow=null;f.groundLoiterCenter=o.dest?.clone()||f.pos.clone();if(!f.groundAirState)nextOrder(f);}
  return true;
 }
 if(o?.type==='attack'&&o.target?.alive&&groundSeenBy(f.team,o.target)){
  const t=o.target;
  if(f.groundKind==='supportAircraft'&&['ground','sea'].includes(t.band||'ground')){
   if((f.groundStrikeCooldown||0)<=1e-8&&groundBombPrepare(f,{point:groundStrikeTargetPoint(f,0,t)}))return groundBombApproach(f,dt);
   groundAirLoiter(f,dt);return true;
  }
  if(f.groundKind==='fighter'&&groundUsesAirRange(f,t)){
   const aim=t.pos.clone(),lead=Math.min(1,groundDistanceTo(f,t)/Math.max(1,speedOf(f))*.35);
   if(groundFlyingAircraft(t)&&!groundTrainingEnemy(t))aim.addScaledVector(groundAirForward(t),Math.max(0,speedOf(t))*lead);
   groundAirTurnMove(f,aim,dt);return true;
  }
  // 攻撃機は既存の対地・対空射程を保ち、停止射撃せず通過する。
  if(f.groundKind==='attack'){groundAirTurnMove(f,t.pos,dt);return true;}
 }
 if(f.groundAirState)return true;
 // 自動交戦も観測済みの敵だけを追う。射界外へ旋回中でも接近を続ける。
 if(f.stance!=='evade'&&f.groundKind!=='supportAircraft'&&!f.groundHoldFire&&!f.silent){
  const t=fleets.filter(t=>t.alive&&t.team!==f.team&&!t.embarked&&!groundAbsent(t)&&groundSeenBy(f.team,t)&&groundFireFactor(f,t)>0&&groundTargetRange(f,t)>0).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0];
  if(t){groundAirTurnMove(f,t.pos,dt);return true;}
 }
 groundAirLoiter(f,dt);return true;
}

// 世界座標は機体ごとに持つ。中隊の座標は操作・索敵表示のための代表点。
function groundAirSquad(f){return !!f?.bodies&&!!f.groundBodySpec&&groundFlyingAircraft(f);}
function groundAirDirection(yaw){return new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));}
function groundAirBearing(from,to){return Math.atan2(to.x-from.x,to.z-from.z);}
function groundAirInside(p){return groundPass(groundMapX(p.x),groundMapY(p.z),'air');}
const groundAirBoards=new WeakMap();
function groundAirEdgeClearance(p){
 const {widthKm,heightKm,data}=groundDimensions(),x=groundMapX(p.x),y=groundMapY(p.z),board=data.display.board;
 let edges=groundAirBoards.get(board);
 if(!edges){edges=[...board,board[0]];groundAirBoards.set(board,edges);}
 const rectangle=Math.min(x,y,widthKm-x,heightKm-y);
 if(rectangle<0)return rectangle*GROUND_SCALE;
 const edge=groundDistance(x,y,edges);
 return (groundInside(x,y,board)?Math.min(rectangle,edge):-edge)*GROUND_SCALE;
}
function groundAirEngagementSpace(pos,sectorKm){
 const {widthKm,heightKm}=groundDimensions();
 const col=Math.min(Math.floor(groundMapX(pos.x)/sectorKm),Math.ceil(widthKm/sectorKm)-1);
 const row=Math.min(Math.floor(groundMapY(pos.z)/sectorKm),Math.ceil(heightKm/sectorKm)-1);
 const minX=groundWorldX(Math.max(0,col-1)*sectorKm),maxX=groundWorldX(Math.min(widthKm,(col+2)*sectorKm));
 const minZ=groundWorldZ(Math.min(heightKm,(row+2)*sectorKm)),maxZ=groundWorldZ(Math.max(0,row-1)*sectorKm);
 return {minX,maxX,minZ,maxZ,center:new THREE.Vector3((minX+maxX)/2,0,(minZ+maxZ)/2)};
}
function groundAirClearanceToEdge(p,space){
 const board=groundAirEdgeClearance(p);
 if(!space)return board;
 return Math.min(board,p.x-space.minX,space.maxX-p.x,p.z-space.minZ,space.maxZ-p.z);
}
function groundAirInwardYaw(b){
 const center=b.engagementSpace?.center;
 return Math.atan2((center?.x||0)-b.pos.x,(center?.z||0)-b.pos.z);
}
function groundAirSquadTrack(f){
 const rules=groundRuleSet().airCombat,existing=f.groundAirSquad;
 const yaw=Math.atan2(f.heading.x,f.heading.z),support=f.groundKind==='supportAircraft';
 if(!existing){
  const cruise=rules.cruiseKmSec[f.groundKind]*GROUND_SCALE,[minG,maxG]=rules.turnLoadG[f.groundKind];
  const speedVariation=support?0:rules.speedVariation,minTurnRadius=support?rules.support.turnRadiusKm*GROUND_SCALE:0;
  const bodies=f.groundBodySpec.offsets.map(([x,z],i)=>{
   const random=groundBodyRandom(f,i),variation=(2*random()-1)*speedVariation;
   const pos=new THREE.Vector3(x*f.groundBodySpec.size,0,z*f.groundBodySpec.size).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(f.pos);
   const speed=cruise*(1+variation);
   const turnLoadG=minG+(maxG-minG)*random();
   return {pos,yaw,pitch:0,bank:0,speed,variation,turnLoadG,minTurnRadius,velocity:new THREE.Vector3(),phase:null,route:null,entryYaw:null};
  });
  return f.groundAirSquad={bodies,last:f.pos.clone(),yaw,elapsed:0,target:null,aim:null};
 }
 // 配置・台本で駒を移したときだけ追従する。飛行中は各機の座標から駒の位置を出す。
 if(!existing.last.equals(f.pos)||!existing.elapsed&&existing.yaw!==yaw){
  const shift=f.pos.clone().sub(existing.last);
  for(const b of existing.bodies){
   b.pos.add(shift);b.route=null;b.phase=null;b.navKey=null;b.turnInward=false;b.legYaw=null;
   if(!existing.elapsed)b.yaw=yaw;
  }
  if(support){
   existing.supportPatrol=null;
   if(existing.supportPass)existing.supportPass.route=null;
   if(f.groundBombRun)f.groundBombRun.route=null;
  }
  existing.last.copy(f.pos);existing.yaw=yaw;f.groundBodyGeometry=null;
 }
 return existing;
}
function groundAirBodyInFront(body,from,to){
 const dx=to.x-from.x,dy=groundAirPhysicalY(to)-groundAirPhysicalY(from),dz=to.z-from.z;
 const length=Math.hypot(dx,dy,dz);
 const dot=(dx*Math.sin(body.yaw)+dz*Math.cos(body.yaw))*Math.cos(body.pitch)+dy*Math.sin(body.pitch);
 return dot>=length*Math.cos(GROUND_AIR_CONTROL.fireCone);
}
function groundAirTurnLimit(speed,loadG,rules){
 return rules.turnGravityKmSec2*GROUND_SCALE*Math.sqrt(loadG**2-1)/speed;
}
// 指定された向きで進入点へ着く経路。左右の旋回円の接線4通りから最短を選ぶ。
function groundAirRoute(b,point,yaw,radius,margin){
 if(Math.hypot(point.x-b.pos.x,point.z-b.pos.z)<1e-8&&Math.abs(groundAirAngleDelta(b.yaw,yaw))<1e-8)return {length:0,segments:[]};
 let best=null;
 const right=a=>groundAirDirection(a+Math.PI/2);
 const arc=(a,c,sign)=>((sign*(c-a)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)*radius;
 const starts=[-1,1].map(sign=>b.pos.clone().addScaledVector(right(b.yaw),sign*radius));
 const ends=[-1,1].map(sign=>point.clone().addScaledVector(right(yaw),sign*radius));
 for(const [i,a] of starts.entries())for(const [j,c] of ends.entries()){
  const first=i*2-1,last=j*2-1,dx=c.x-a.x,dz=c.z-a.z,distance=Math.hypot(dx,dz),cross=(last-first)*radius;
  if(distance<Math.abs(cross)||distance<1e-9)continue;
  const tangent=Math.atan2(dx,dz)-Math.asin(cross/distance),straight=Math.sqrt(distance**2-cross**2);
  const enter=arc(b.yaw,tangent,first),leave=arc(tangent,yaw,last),length=enter+straight+leave;
  const segments=[{left:enter,curve:first/radius},{left:straight,curve:0},{left:leave,curve:last/radius}];
  if((!best||length<best.length)&&groundAirRouteInside(b,segments,margin))best={length,segments};
 }
 return best;
}
function groundAirRouteInside(b,segments,margin){
 const probe={pos:b.pos.clone(),yaw:b.yaw};
 for(const {left,curve} of segments){
  for(let remaining=left;remaining>1e-8;){
   const clearance=groundAirClearanceToEdge(probe.pos,b.engagementSpace);
   if(clearance<margin)return false;
   // 境界までの距離以内を進め、旋回円の途中も盤外へ出ないことを確かめる。
   const step=Math.min(remaining,Math.max(margin,clearance*.5));
   groundAirAdvance(probe,step,step*curve);remaining-=step;
  }
 }
 return groundAirClearanceToEdge(probe.pos,b.engagementSpace)>=margin;
}
function groundAirRouteRadius(b,cruise,rules){
 const speed=cruise*rules.maxSpeedFactor;
 return Math.max(b.minTurnRadius||0,speed/groundAirTurnLimit(speed,b.turnLoadG,rules));
}
function groundAirAdvance(b,distance,turn){
 const half=turn/2,travel=Math.abs(half)<1e-8?distance:distance*Math.sin(half)/half;
 b.pos.addScaledVector(groundAirDirection(b.yaw+half),travel);
 b.yaw=groundAirAngleDelta(0,b.yaw+turn);
}
function groundAirBoundaryYaw(b,yaw,radius,margin){
 const heading=groundAirDirection(b.yaw),look=b.pos.clone().addScaledVector(heading,2*radius+margin);
 const inward=groundAirInwardYaw(b);
 const clear=groundAirClearanceToEdge(look,b.engagementSpace)>=margin;
 if(!clear)b.turnInward=true;
 if(b.turnInward&&clear&&Math.abs(groundAirAngleDelta(b.yaw,inward))<Math.PI/4)b.turnInward=false;
 return b.turnInward?inward:yaw;
}
function groundAirFly(b,dt,cruise,rules,yaw,pitch,route=null,heights=null,pitchRules=rules,clearanceKm=rules.ground.lowKm){
 const {clamp,degToRad}=THREE.MathUtils,old=b.pos.clone(),oldYaw=b.yaw,oldHeight=groundAirPhysicalY(old);
 const pitchLimit=degToRad(pitchRules.maxPitchDeg),pitchStep=degToRad(pitchRules.pitchRateDeg)*dt;
 b.pitch+=clamp(clamp(pitch,-pitchLimit,pitchLimit)-b.pitch,-pitchStep,pitchStep);
 const goal=cruise*(1+b.variation-rules.pitchSpeedFactor*Math.sin(b.pitch));
 b.speed=clamp(b.speed+(goal-b.speed)*(1-Math.exp(-rules.speedResponse*dt)),cruise*rules.minSpeedFactor,cruise*rules.maxSpeedFactor);
 const horizontal=b.speed*Math.cos(b.pitch);
 let distance=horizontal*dt;
 if(route){
  while(distance>1e-8&&route.segments.length){
   const segment=route.segments[0],step=Math.min(distance,segment.left);
   groundAirAdvance(b,step,step*segment.curve);
   distance-=step;segment.left-=step;if(segment.left<=1e-8)route.segments.shift();
  }
  if(distance>1e-8)groundAirAdvance(b,distance,0);
 }else{
  yaw=groundAirBoundaryYaw(b,yaw,groundAirRouteRadius(b,cruise,rules),rules.boundaryMarginKm*GROUND_SCALE);
  const limit=Math.min(groundAirTurnLimit(horizontal,b.turnLoadG,rules),horizontal/(b.minTurnRadius||0))*dt;
  groundAirAdvance(b,distance,clamp(groundAirAngleDelta(b.yaw,yaw),-limit,limit));
 }
 b.bank=-Math.atan(horizontal*groundAirAngleDelta(oldYaw,b.yaw)/(dt*rules.turnGravityKmSec2*GROUND_SCALE));
 const surface=groundSightHeight(b.pos.x,b.pos.z),exaggeration=groundData().meta.elevationExaggeration||1;
 const height=clamp(oldHeight+b.speed*Math.sin(b.pitch)*dt,heights?.min??-Infinity,heights?.max??Infinity);
 const displayedY=height+surface*(1-1/exaggeration);
 b.pos.y=Math.max(displayedY,groundAirClearance(old,b.pos,clearanceKm*GROUND_SCALE));
 b.velocity.copy(b.pos).sub(old).multiplyScalar(1/dt);
 b.velocity.y=(groundAirPhysicalY(b.pos)-oldHeight)/dt;
}
function groundAirPitchTo(b,height,lookAheadSec=.3){
 return Math.atan2(height-groundAirPhysicalY(b.pos),Math.max(GROUND_SCALE,b.speed*lookAheadSec));
}
function groundAirLevelHeight(f,b){
 const p=b.pos;
 return groundAirPhysicalY(new THREE.Vector3(p.x,groundUnitHeight({...f,pos:p}),p.z));
}
function groundAirGroundEntry(b,aim,i,pairPlan,cruise,rules){
 const {degToRad}=THREE.MathUtils,g=rules.ground,pair=i>>1,wing=i%2;
 const pass=(b.pass||0)+1,shared=pairPlan.pass===pass,wingOffset=degToRad(wing*rules.wingAngleDeg);
 const desired=shared?pairPlan.yaw+wingOffset:b.entryYaw===null?
   groundAirBearing(b.pos,aim)+degToRad((pair?1:-1)*rules.pairAngleDeg)+wingOffset:
   b.entryYaw+degToRad((pair?-1:1)*rules.reentryAngleDeg);
 const radius=groundAirRouteRadius(b,cruise,rules),margin=rules.boundaryMarginKm*GROUND_SCALE;
 const center=b.engagementSpace?.center||new THREE.Vector3();
 const inward=groundAirBearing(aim,center);
 let best=null;
 for(const offset of [0,-30,30,-60,60,-90,90,-120,120,-150,150,180]){
  const yaw=desired+degToRad(offset),dir=groundAirDirection(yaw),gate=aim.clone().addScaledVector(dir,-g.entryKm*GROUND_SCALE);
  const exit=aim.clone().addScaledVector(dir,g.exitKm*GROUND_SCALE);
  if(groundAirClearanceToEdge(gate,b.engagementSpace)<margin||groundAirClearanceToEdge(exit,b.engagementSpace)<radius+margin)continue;
  if(!groundAirRouteInside({pos:gate,yaw,engagementSpace:b.engagementSpace},[{left:(g.entryKm+g.exitKm)*GROUND_SCALE,curve:0}],margin))continue;
  const route=groundAirRoute(b,gate,yaw,radius,margin);
  if(!route)continue;
  const outward=Math.max(0,-Math.cos(yaw-inward))*Math.min(g.exitKm,Math.hypot(aim.x-center.x,aim.z-center.z)/GROUND_SCALE);
  const score=Math.abs(offset)*GROUND_SCALE*.45+route.length*.1+outward*GROUND_SCALE;
  if(!best||score<best.score)best={yaw,dir,route,score};
  if(shared&&offset===0)break;
 }
 if(best){
  if(pass>pairPlan.pass){pairPlan.pass=pass;pairPlan.yaw=best.yaw-wingOffset;}
  b.pass=pass;
  b.entryYaw=best.yaw;b.entryDir=best.dir;b.entryAim=aim.clone();b.route=best.route;b.phase='align';b.turnInward=false;
 }
 return !!best;
}
function groundAirGroundPass(b,aim,i,pair,dt,cruise,rules,pass=null,pitchRules=rules){
 const levelPass=pass?.levelPass;
 const g=rules.ground,angle=THREE.MathUtils.degToRad(g.diveDeg),lowKm=pass?.lowKm??g.lowKm,low=lowKm*GROUND_SCALE;
 const surface=groundAirPhysicalY(new THREE.Vector3(b.pos.x,groundSurfaceHeight(b.pos.x,b.pos.z),b.pos.z));
 const targetSurface=pass?{x:aim.x,y:groundSurfaceHeight(aim.x,aim.z),z:aim.z}:aim;
 const level=surface+low,high=groundAirPhysicalY(targetSurface)+low+g.diveKm*GROUND_SCALE*Math.tan(angle);
 if(!b.phase&&!groundAirGroundEntry(b,aim,i,pair,cruise,rules)){
  groundAirFly(b,dt,cruise,rules,groundAirInwardYaw(b),groundAirPitchTo(b,pass?high:groundAirPhysicalY(aim)+low),null,null,pitchRules,lowKm);
  return;
 }
 const dir=b.entryDir,along=b.pos.clone().sub(b.entryAim).dot(dir)/GROUND_SCALE;
 const targetAlong=levelPass?along:b.pos.clone().sub(aim).dot(dir)/GROUND_SCALE;
 let yaw=b.entryYaw,pitch=groundAirPitchTo(b,level),route=null;
 if(b.phase==='align'){
  route=b.route;
  if(!route.segments.length)b.phase='approach';
 }
 if(b.phase==='approach'&&along>=-g.pullKm)b.phase='pull';
 if(b.phase==='pull'&&along>=-g.diveKm)b.phase='dive';
 if(b.phase==='dive'&&(targetAlong>=0||pass&&along>=g.exitKm*.5))b.phase='exit';
 if(pass&&b.phase==='exit'&&along>=g.exitKm)b.phase='climb';
 const climbHeight=pass&&surface+pass.climbKm*GROUND_SCALE;
 const ready=pass?b.phase==='climb'&&groundAirPhysicalY(b.pos)>=climbHeight*.9+surface*.1:
  b.phase==='exit'&&targetAlong>=g.exitKm;
 if(ready){
  if(groundAirGroundEntry(b,aim,i,pair,cruise,rules))route=b.route;
  else {b.phase=null;yaw=groundAirInwardYaw(b);}
 }
 if(b.phase==='pull'||pass&&['align','approach'].includes(b.phase))pitch=groundAirPitchTo(b,high);
 if(b.phase==='climb')pitch=Math.max(0,groundAirPitchTo(b,climbHeight));
 if(b.phase==='dive'){
  if(!levelPass){
   const ahead=aim.clone().addScaledVector(dir,targetAlong*GROUND_SCALE+Math.max(cruise*.3,GROUND_SCALE));
   yaw=groundAirBearing(b.pos,ahead);
  }
  const run=Math.max(GROUND_SCALE,-targetAlong*GROUND_SCALE);
  pitch=-Math.min(angle,Math.max(0,Math.atan2(groundAirPhysicalY(b.pos)-level,run*.8)));
 }
 groundAirFly(b,dt,cruise,rules,yaw,pitch,route,null,pitchRules,lowKm);
 if(!route&&b.turnInward)b.phase=null;
}
function groundAirAirTarget(t,b,pair){
 const track=groundAirSquad(t)?groundAirSquadTrack(t):null;
 if(!track){
  const heading=groundAirForward(t);
  return {pos:t.pos,velocity:t.groundFlightVelocity||new THREE.Vector3(),yaw:Math.atan2(heading.x,heading.z)};
 }
 if(t.bodies[pair.foe]?.alive)return track.bodies[pair.foe];
 let closest=null,distance=Infinity;
 for(const [i,body] of track.bodies.entries()){
  if(!t.bodies[i].alive)continue;
  const d=body.pos.distanceToSquared(b.pos);
  if(d<distance){closest=body;distance=d;pair.foe=i;}
 }
 return closest;
}
// 直線区間は機ごとに保持し、境界で内側へ向けたら新しい向きのまま抜ける。
function groundAirStraightYaw(b){
 if(b.turnInward)b.legYaw=groundAirInwardYaw(b);
 return b.legYaw??=b.yaw;
}
function groundAttackFighterPass(b,dt,cruise,rules,heights){
 const escapeHeight=rules.air.attack.escapeHeightKm*GROUND_SCALE;
 const surface=groundAirPhysicalY(new THREE.Vector3(b.pos.x,groundSurfaceHeight(b.pos.x,b.pos.z),b.pos.z));
 // 低く抜けながら、進路の前に相手が来たときだけ既存の対空射撃を許す。
 const yaw=groundAirStraightYaw(b),turning=b.turnInward;
 groundAirFly(b,dt,cruise,rules,yaw,groundAirPitchTo(b,surface+escapeHeight),null,heights);
 b.phase=turning||b.turnInward?'exit':'dive';
}
function groundAirAirPass(f,b,t,i,pair,dt,cruise,rules,heights){
 const enemy=groundAirAirTarget(t,b,pair);
 if(!enemy)return;
 const r=rules.air,fighter=f.groundKind==='fighter'?r.fighter:null;
 const mixed=fighter&&t.groundKind==='attack'?r.attack:null;
 const {diveSec}=fighter||r,exitKm=mixed?.fighterExitKm??(fighter||r).exitKm;
 const delta=enemy.pos.clone().sub(b.pos),distance=Math.hypot(delta.x,delta.z);
 const forward=delta.dot(groundAirDirection(b.yaw));
 const direction=groundAirDirection(enemy.yaw),velocity=enemy.velocity,enemyHeight=groundAirPhysicalY(enemy.pos);
 const moving=Math.hypot(velocity.x,velocity.z)>GROUND_SCALE||
   t.order?.type==='move'||t.order?.type==='attack'&&t.order.target===f;
 const closing=moving&&delta.dot(direction)<0;
 const fromBehind=moving&&delta.dot(direction)>distance*.82;
 const sameCourse=Math.abs(groundAirAngleDelta(b.yaw,enemy.yaw))<THREE.MathUtils.degToRad(r.tailAngleDeg);
 const range=groundTargetRange(f,t),diveDistance=cruise*diveSec,entryDistance=Math.max(diveDistance,Math.min(range,diveDistance*1.6));
 // 上を取る高さには上限（互いに上を取り合って昇り続けない。仮 airCombat.air.maxHeightKm）
 const ceiling=heights.max,high=Math.min(enemyHeight+r.heightAdvantageKm*GROUND_SCALE,ceiling);
 if(!b.phase)b.phase='approach';
 if(b.phase==='exit'&&b.phaseDistance>=exitKm*GROUND_SCALE&&(!mixed||!b.turnInward)){
  b.phase='approach';b.legYaw=null;
 }
 if(b.phase==='approach'&&distance<=entryDistance){
  const tail=fromBehind&&sameCourse&&distance<=range;
  const aligned=forward>=distance*.7;
  // 向かってくる相手には、すれ違う前に射撃姿勢を取る。
  if(tail||aligned&&(closing||groundAirPhysicalY(b.pos)>=Math.min(enemyHeight+r.heightAdvantageKm*GROUND_SCALE*.45,ceiling*.95))){
   b.phase=tail?'tail':'dive';b.phaseTime=0;b.phaseDistance=0;
   if(mixed)b.passYaw=b.yaw;
  }
 }
 const passed=forward<-GROUND_SCALE*.3;
 const missed=mixed&&b.phase==='approach'&&forward<distance*.35&&distance<mixed.breakAwayKm*GROUND_SCALE;
 if(b.phase==='tail'&&(!fromBehind||b.phaseTime>=r.tailSec)||
    b.phase==='dive'&&(passed&&b.phaseTime>=(fighter?.passDiveSec||0)||b.phaseDistance>entryDistance*2)||missed){
  const peel=b.phase==='tail'?THREE.MathUtils.degToRad(r.peelDeg)*(i>>1?1:-1):0;
  b.phase='exit';b.phaseDistance=0;
  const course=b.yaw+peel;
  if(mixed)b.legYaw=course;
  else{
   const exit=b.pos.clone().addScaledVector(groundAirDirection(course),exitKm*GROUND_SCALE);
   const clearance=groundAirRouteRadius(b,cruise,rules)+rules.boundaryMarginKm*GROUND_SCALE;
   b.exitYaw=groundAirClearanceToEdge(exit,b.engagementSpace)<clearance?groundAirInwardYaw(b):course;
  }
 }
 let yaw=b.yaw,pitch=groundAirPitchTo(b,high,fighter?.climbLookAheadSec);
 if(b.phase==='exit'){
  yaw=mixed?groundAirStraightYaw(b):b.exitYaw;
  pitch=groundAirPitchTo(b,Math.min(high+GROUND_SCALE,ceiling),fighter?.climbLookAheadSec);
 }else{
  // 正面から来る敵を先読みすると狙点が手前に寄り、横ずらしで旋回を誘う。
  const lead=b.phase==='approach'&&!closing?Math.min(r.leadSec,distance/cruise):0;
  const point=enemy.pos.clone().addScaledVector(velocity,lead);
  if(b.phase==='approach'&&!moving){
   const side=(i>>1?1:-1)*(1+i%2*.1)*Math.min(Math.max(0,distance-entryDistance)*.35,cruise*.45);
   point.addScaledVector(groundAirDirection(groundAirBearing(b.pos,enemy.pos)+Math.PI/2),side);
  }else if(b.phase!=='approach'){
   pitch=Math.atan2(enemyHeight-groundAirPhysicalY(b.pos),Math.max(GROUND_SCALE,distance));
   if(fighter&&b.phase==='dive'){
    // すれ違う直前まで敵を機首近くに置き、通過直後まで降下を続ける。
    pitch-=THREE.MathUtils.degToRad(fighter.divePitchBiasDeg);
    if(passed)pitch=-THREE.MathUtils.degToRad(fighter.maxPitchDeg);
   }
  }
  if(b.phase!=='dive'||!passed)yaw=groundAirBearing(b.pos,groundAirInside(point)?point:enemy.pos);
  if(mixed&&(b.phase==='dive'||b.phase==='tail')){
   const angle=THREE.MathUtils.degToRad(mixed.passTurnDeg);
   yaw=b.passYaw+THREE.MathUtils.clamp(groundAirAngleDelta(b.passYaw,yaw),-angle,angle);
  }
 }
 groundAirFly(b,dt,cruise,rules,yaw,pitch,null,heights,fighter||rules);
 b.phaseTime=(b.phaseTime||0)+dt;
 b.phaseDistance=(b.phaseDistance||0)+(mixed?Math.hypot(b.velocity.x,b.velocity.z):b.speed)*dt;
}
function groundAirInterceptPass(f,b,t,i,pair,dt,cruise,rules){
 const enemy=groundAirAirTarget(t,b,pair);
 if(!enemy)return;
 const r=rules.intercept,pass=rules.air.fighter,range=groundTargetRange(f,t);
 const delta=enemy.pos.clone().sub(b.pos),distance=Math.hypot(delta.x,delta.z);
 const heading=groundAirDirection(b.yaw),course=groundAirDirection(enemy.yaw);
 const enemyHeight=groundAirPhysicalY(enemy.pos),height=groundAirPhysicalY(b.pos);
 const tolerance=r.heightBandKm*GROUND_SCALE,radius=groundAirRouteRadius(b,cruise,rules);
 const margin=rules.boundaryMarginKm*GROUND_SCALE;
 const rear=delta.dot(course)>distance*.45,aligned=delta.dot(heading)>distance*.7;
 if(!b.phase||b.phase==='exit'&&b.phaseDistance>=pass.exitKm*GROUND_SCALE){
  b.phase='approach';b.route=null;
 }
 if(b.phase==='tail'&&(b.interceptFired||!rear||!aligned||b.phaseTime>=rules.air.tailSec)){
  const peel=THREE.MathUtils.degToRad(rules.air.peelDeg)*(i>>1?1:-1);
  const exit=b.pos.clone().addScaledVector(groundAirDirection(b.yaw+peel),pass.exitKm*GROUND_SCALE);
  b.exitYaw=groundAirClearanceToEdge(exit,b.engagementSpace)>=radius+margin?b.yaw+peel:groundAirInwardYaw(b);
  b.phase='exit';b.phaseDistance=0;b.interceptFired=false;
 }
 let yaw=b.yaw,pitch=groundAirPitchTo(b,enemyHeight-r.belowKm*GROUND_SCALE),route=null;
 if(b.phase==='exit'){
  yaw=b.exitYaw;pitch=groundAirPitchTo(b,enemyHeight);
 }else{
  if(b.phase==='approach'&&rear&&aligned&&distance<=range&&Math.abs(height-enemyHeight)<=tolerance){
   b.phase='tail';b.phaseTime=0;b.route=null;
  }
  if(b.phase==='tail'){
   yaw=groundAirBearing(b.pos,enemy.pos);
   pitch=Math.atan2(enemyHeight-height,Math.max(GROUND_SCALE,distance));
  }else{
   const point=enemy.pos.clone().addScaledVector(enemy.velocity,Math.min(rules.air.leadSec,distance/cruise));
   if(!rear||!aligned&&distance<range){
    if(!b.route?.segments.length){
     const side=(i>>1?1:-1)*(1+i%2*.25)*r.sideKm*GROUND_SCALE;
     const gate=point.clone().addScaledVector(course,-r.rearKm*GROUND_SCALE)
      .addScaledVector(groundAirDirection(enemy.yaw+Math.PI/2),side);
     const gateYaw=groundAirBearing(gate,point);
     b.route=groundAirRoute(b,gate,gateYaw,radius,margin);
    }
    route=b.route;
   }else b.route=null;
   yaw=groundAirBearing(b.pos,groundAirClearanceToEdge(point,b.engagementSpace)>0?point:enemy.pos);
  }
 }
 // 低空から来た機体も速度とピッチで高度を上げる。
 const heights={min:Math.min(height,enemyHeight-tolerance),max:Math.max(height,enemyHeight+tolerance)};
 groundAirFly(b,dt,cruise,rules,yaw,pitch,route,heights,pass);
 if(b.phase==='tail')b.phaseTime+=dt;
 if(b.phase==='exit')b.phaseDistance+=Math.hypot(b.velocity.x,b.velocity.z)*dt;
}
function groundAirNavigate(f,b,point,key,i,dt,cruise,rules,heights,arrivalYaw){
 const radius=groundAirRouteRadius(b,cruise,rules),margin=rules.boundaryMarginKm*GROUND_SCALE;
 if(point&&b.navKey!==key){
  const bearing=groundAirBearing(b.pos,point),inward=Math.atan2(-point.x,-point.z);
  const offset=f.groundBodySpec.offsets[i][0]*f.groundBodySpec.size;
  // 盤端の移動先へは、通過後に内側へ飛べる向きで到達する。
  b.nav=null;
  const courses=[bearing,inward,inward-Math.PI/3,inward+Math.PI/3,0,Math.PI/2,Math.PI,-Math.PI/2];
  if(arrivalYaw!==undefined)courses.unshift(arrivalYaw);
  for(const course of courses){
   const dest=point.clone().addScaledVector(groundAirDirection(course+Math.PI/2),offset);
   const ahead=dest.clone().addScaledVector(groundAirDirection(course),radius);
   const clearance=groundAirClearanceToEdge(dest,b.engagementSpace);
   if(clearance<=1e-6||groundAirClearanceToEdge(ahead,b.engagementSpace)<=0)continue;
   b.nav=groundAirRoute(b,dest,course,radius,Math.min(margin,clearance*.5));
   if(b.nav){b.navKey=key;b.turnInward=false;break;}
  }
 }else if(!point){b.nav=null;b.navKey=null;}
 const route=b.nav?.segments.length?b.nav:null;
 const center=f.groundLoiterCenter||f.home;
 let yaw=b.yaw;
 if(point&&arrivalYaw!==undefined){
  // 最終確認位置を通過した後も、見えていた進路をたどる。
  const ahead=point.clone().addScaledVector(groundAirDirection(arrivalYaw),radius);
  yaw=b.nav||Math.hypot(ahead.x-b.pos.x,ahead.z-b.pos.z)<cruise*dt?arrivalYaw:groundAirBearing(b.pos,ahead);
 }else if(point&&!b.nav)yaw=groundAirInwardYaw(b);
 else if(!point&&center){
  const radial=groundAirBearing(center,b.pos),r=radius*1.25;
  yaw=groundAirBearing(b.pos,center.clone().addScaledVector(groundAirDirection(radial+.65),r));
 }
 groundAirFly(b,dt,cruise,rules,yaw,groundAirPitchTo(b,Math.min(groundAirLevelHeight(f,b),heights?.max??Infinity)),route,heights);
}
function groundAirSquadTarget(f,previous){
 if(f.groundAirState||f.order?.type==='move')return null;
 const ready=t=>t?.alive&&t.team!==f.team&&!t.embarked&&!groundAbsent(t)&&groundManualTargetAllowed(f,t);
 if(f.order?.type==='attack')return ready(f.order.target)?f.order.target:null;
 if(f.stance==='evade'||f.groundHoldFire||f.silent)return null;
 if(ready(previous)&&groundSeenBy(f.team,previous))return previous;
 return fleets.filter(t=>ready(t)&&groundSeenBy(f.team,t)).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0]||null;
}
function groundAirLowTarget(t,rules){
 return groundWasCruising(t)||['was','drone'].includes(t.groundKind)&&
  t.pos.y-groundSightHeight(t.pos.x,t.pos.z)<rules.air.minHeightKm*GROUND_SCALE;
}
function groundAirStrafeAim(b,t,fallback){
 const positions=groundBodyPositions(t).positions;
 if(!b.phase||!t.bodies[b.strafeBody]?.alive){
  let distance=Infinity;
  for(const [j,p] of positions.entries()){
   if(!t.bodies[j]?.alive)continue;
   const d=Math.hypot(p.x-b.pos.x,p.z-b.pos.z);
   if(d<distance){distance=d;b.strafeBody=j;}
  }
 }
 return positions[b.strafeBody]??fallback;
}
function groundAirSquadStep(f,dt){
 if(!(Number.isFinite(dt)&&dt>0))return true;
 const track=groundAirSquadTrack(f),rules=groundRuleSet().airCombat,cruise=rules.cruiseKmSec[f.groundKind]*GROUND_SCALE;
 const target=groundAirSquadTarget(f,track.target),visible=target&&groundSeenBy(f.team,target),order=f.order;
 const fighter=f.groundKind==='fighter',limits=fighter?rules.air:rules.air.attack;
 const airRange=!!target&&groundUsesAirRange(f,target),low=!!target&&groundAirLowTarget(target,rules);
 const wasPass=airRange&&!low&&target.groundKind==='was'&&target.band==='low';
 const air=airRange&&!low,strafe=low&&airRange||!!target&&fighter&&!airRange;
 const escape=air&&f.groundKind==='attack'&&target.groundKind==='fighter';
 const pass=wasPass?{lowKm:groundBandHeight('low')/GROUND_SCALE,
  climbKm:groundBandHeight('low')/GROUND_SCALE+rules.wasPass.climbAboveKm,levelPass:true}:strafe?rules.strafe:null;
 const intercept=air&&fighter&&target.groundKind==='supportAircraft'&&target.band==='high';
 if(track.target!==target||track.airTarget!==air||track.strafing!==strafe||track.wasPass!==wasPass||track.intercept!==intercept){
  track.target=target;track.airTarget=air;track.strafing=strafe;track.wasPass=wasPass;track.intercept=intercept;track.aim=null;track.searchContact=null;track.engagementSpace=null;track.elapsed=0;track.pairs=[{pass:0},{pass:0}];
  for(const b of track.bodies){
   b.phase=null;b.route=null;b.entryYaw=null;b.entryDir=null;b.entryAim=null;b.pass=0;b.strafeBody=null;b.engagementSpace=null;b.nav=null;b.navKey=null;b.turnInward=false;b.legYaw=null;b.interceptFired=false;
  }
 }
 const contact=target?.groundContacts?.[f.team];
 const searchContact=fighter&&air&&!visible&&order?.type==='attack'?contact??null:null;
 if((track.searchContact??null)!==searchContact){
  track.searchContact=searchContact;
  for(const b of track.bodies){
   b.phase=null;b.route=null;b.nav=null;b.navKey=null;b.interceptFired=false;
  }
 }
 if(visible||searchContact){
  if(!track.engagementSpace){
   track.engagementSpace=groundAirEngagementSpace(f.pos,rules.sectorKm);
   for(const b of track.bodies){
    b.engagementSpace=track.engagementSpace;b.nav=null;b.navKey=null;b.turnInward=false;
   }
  }
  track.aim=visible?target.pos.clone():searchContact.pos;
 }
 else if(!track.aim&&contact)track.aim=contact.pos.clone();
 const heights=air&&!intercept&&!wasPass&&(!fighter||track.aim)?{min:(limits.minHeightKm??-Infinity)*GROUND_SCALE,max:limits.maxHeightKm*GROUND_SCALE}:null;
 if(fighter)f.band=track.aim&&!intercept?'low':'high';
 const path=order?.type==='move'?order.path:null,point=path?.points[path.atIndex];
 const before=f.pos.clone(),live=track.bodies.filter((b,i)=>f.bodies[i].alive);
 if(!live.length)return true;
 for(let left=dt;left>1e-8;){
  const step=Math.min(left,rules.stepSec);left-=step;track.elapsed+=step;
  for(const [i,b] of track.bodies.entries()){
   if(!f.bodies[i].alive)continue;
   const delay=(i>>1)*rules.pairDelaySec+(i%2)*rules.wingDelaySec;
   if(track.aim&&track.elapsed>=delay){
    if(escape){groundAttackFighterPass(b,step,cruise,rules,heights);continue;}
    if(air&&!visible){groundAirNavigate(f,b,track.aim,searchContact||target,i,step,cruise,rules,heights,searchContact?.yaw);continue;}
    b.nav=null;b.navKey=null;
    const pair=track.pairs[i>>1];
    if(intercept)groundAirInterceptPass(f,b,target,i,pair,step,cruise,rules);
    else if(air&&!wasPass)groundAirAirPass(f,b,target,i,pair,step,cruise,rules,heights);
    else{
     const aim=pass&&visible&&target.bodies?groundAirStrafeAim(b,target,track.aim):track.aim;
     groundAirGroundPass(b,aim,i,pair,step,cruise,rules,pass,fighter&&pass?rules.air.fighter:rules);
    }
   }else if(track.aim){
    groundAirFly(b,step,cruise,rules,b.yaw,groundAirPitchTo(b,Math.min(groundAirLevelHeight(f,b),heights?.max??Infinity)),null,heights);
   }else groundAirNavigate(f,b,point,point,i,step,cruise,rules,heights);
  }
 }
 // 移動命令は先頭の生存機が通過した点を順に消化する。交戦時の札は各機の中央に置く。
 const lead=live[0],heading=groundAirDirection(lead.yaw);
 if(path)f.pos.copy(lead.pos);
 else {f.pos.set(0,0,0);for(const b of live)f.pos.add(b.pos);f.pos.divideScalar(live.length);}
 f.heading.copy(heading);f.march.copy(heading);track.last.copy(f.pos);track.yaw=lead.yaw;
 f.groundFlightVelocity=lead.velocity.clone();f.groundBodyGeometry=null;
 groundSupplyMoved(f,before,f.pos);
 if(path){
  path.s=Math.min(path.L||Infinity,(path.s||0)+Math.hypot(f.pos.x-before.x,f.pos.z-before.z));
  if(point&&lead.nav?.segments.length===0)path.atIndex++;
  if(!point||path.atIndex>=path.points.length){
   groundFormationArrive(f);f.order=null;dropArrow(f.arrow);f.arrow=null;f.groundLoiterCenter=order.dest?.clone()||f.pos.clone();
   if(!f.groundAirState)nextOrder(f);
  }
 }
 return true;
}
