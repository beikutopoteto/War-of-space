/* 航空機の連続飛行。地上W.A.S.と宇宙側には適用しない。
   旋回率・待機旋回半径はゲーム用の仮値。命令や予約は従来のオブジェクトを使う。 */
const GROUND_AIR_CONTROL=Object.freeze({turnRate:.8,lookAhead:.7,waypoint:.8,fireCone:Math.PI/5});
function groundFlyingAircraft(f){return !!f&&['fighter','attack','supportAircraft'].includes(f.groundKind);}
function groundAirAngleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
function groundAirForward(f){
 const d=f.heading?.clone()||new THREE.Vector3(0,0,1);d.y=0;
 return d.lengthSq()>1e-10?d.normalize():d.set(0,0,1);
}
function groundAirInFront(f,t){
 if(!groundFlyingAircraft(f)||!groundAirTarget(t))return true;
 const d=t.pos.clone().sub(f.pos);d.y=0;if(d.lengthSq()<1e-10)return true;
 return groundAirForward(f).dot(d.normalize())>=Math.cos(GROUND_AIR_CONTROL.fireCone);
}
// AGL巡航。爆撃進入だけ海面基準の実高度を保持する（障害物回避を優先）。
function groundAirPhysicalY(p){const h=groundSightHeight(p.x,p.z),e=groundData().meta.elevationExaggeration||1;return h/e+p.y-h;}
function groundAirSafeHeight(f,p,from){
 const run=f.groundBombRun,h=groundSightHeight(p.x,p.z),e=groundData().meta.elevationExaggeration||1;
 let y=run?h+(run.ledger.altitudeMeters*GROUND_SCALE/1000-h/e):Math.max(groundUnitHeight({...f,pos:p}),groundSurfaceHeight(p.x,p.z)+groundUnitHeight({...f,pos:p})-groundHeight(p.x,p.z));
 const dx=p.x-from.x,dz=p.z-from.z,g=groundMeshGrid(),gx=(from.x-g.originX)/g.stepX,gz=(from.z-g.originZ)/g.stepZ,vx=dx/g.stepX,vz=dz/g.stepZ;
 const cuts=[...groundBallisticGridCuts(gx,gz,vx,vz),...groundBallisticGridCuts(gx+gz,0,vx+vz,0)];
 for(const u of cuts)y=Math.max(y,groundSurfaceHeight(from.x+dx*u,from.z+dz*u)+.5);
 for(const box of groundBuildings){const interval=[0,1];if(groundBallisticSlab(from.x,dx,box.minX,box.maxX,interval)&&groundBallisticSlab(from.z,dz,box.minZ,box.maxZ,interval))y=Math.max(y,box.top+.5);}
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
   if((f.groundStrikeCooldown||0)<=1e-8&&groundBombPrepare(f,{point:t.pos.clone()}))return groundBombApproach(f,dt);
   groundAirLoiter(f,dt);return true;
  }
  if(f.groundKind==='fighter'&&groundAirTarget(t)){
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
