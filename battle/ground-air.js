/* 段階7の独立した投下物理。classic script、globalsは呼出し時だけ参照。
   航空操縦・命令・補給・搭載数・散布・UIは変更しない。目標へ投下後の弾道を曲げない。 */
const GROUND_AIR_BOMB_PROFILE=Object.freeze({maxPhysicalFlightSeconds:120}); // 最大探索時間は仮。高度は実posを使う。
function groundBombState(f){
  if(!f||!groundBallisticFinite(f.pos)||!groundBallisticFinite(f.heading)||f.alive===false||f.embarked||f.groundAirState==='base')return null;
  const scene=groundBallisticScene();if(!scene)return null;
  const speed=typeof speedOf==='function'?speedOf(f):(f.syncSpeed??f.speed),heading=new THREE.Vector3(f.heading.x,f.heading.y,f.heading.z),length=heading.length();
  if(!Number.isFinite(speed)||speed<0||!Number.isFinite(length)||speed>0&&length===0)return null;
  const displayHeight=scene.height(f.pos.x,f.pos.z),terrainM=displayHeight*scene.m/scene.e;
  if(!Number.isFinite(terrainM))return null;
  // 既存の描画変換の逆。地表のみ誇張を戻し、地表から機体までの高さは18で割らない。
  const clearanceM=(f.pos.y-displayHeight)*scene.m;
  if(!(clearanceM>0)||!Number.isFinite(clearanceM))return null;
  const timeScale=GROUND_BALLISTIC_PROFILE.physicalSecondsPerGameSecond;
  const velocityMeters=groundBallisticFinite(f.groundFlightVelocity)?f.groundFlightVelocity.clone().multiplyScalar(scene.m/timeScale):length?heading.multiplyScalar(speed/length*scene.m/timeScale):new THREE.Vector3();
  return {scene,origin:f.pos.clone(),originMeters:new THREE.Vector3(f.pos.x*scene.m,terrainM+clearanceM,f.pos.z*scene.m),
    velocityMeters,timeScale,speedWorld:speed};
}
function groundBombSolution(f){
  const state=groundBombState(f);if(!state)return null;
  const T=GROUND_AIR_BOMB_PROFILE.maxPhysicalFlightSeconds,physicalEnd=groundFreeFall(state.originMeters,state.velocityMeters,T);
  if(!groundBallisticFinite(physicalEnd))return null;
  // 砲弾と同じ三角形・薄い建物AABBの厳密trace。終点を狙わず、探索時間末の自由落下位置を置く。
  const end=groundBallisticWorld(state.scene,physicalEnd),probe={...state,clear:true,reason:'free-fall',mode:'indirect',kind:'bomb',
    target:end,targetMeters:physicalEnd,impact:end.clone(),gravity:GROUND_BALLISTIC_PROFILE.gravity,
    duration:T/state.timeScale,physicalDuration:T,collision:null};
  const hit=groundBallisticTrace(probe);
  if(!hit||hit.reason==='invalid-terrain'||!Number.isFinite(hit.fraction)||hit.fraction<=0||hit.fraction>=1)return null;
  const physicalDuration=T*hit.fraction,duration=physicalDuration/state.timeScale;
  const targetMeters=groundFreeFall(state.originMeters,state.velocityMeters,physicalDuration),impact=groundBallisticWorld(state.scene,targetMeters);
  if(!groundBallisticFinite(impact))return null;
  // clearは「有効な最初の着弾を予測できた」の意味。建物への先行衝突も実際の着弾として返す。
  return {...probe,reason:hit.reason,target:impact.clone(),targetMeters,impact:impact.clone(),duration,physicalDuration,
    hitTime:duration,collision:{point:impact.clone(),time:duration},origin:state.origin.clone(),velocityMeters:state.velocityMeters.clone()};
}
function groundBombRelease(f,p){
  if(!groundBallisticFinite(p))return null;
  const state=groundBombState(f);if(!state)return null;
  const h=state.scene.height(p.x,p.z),targetHeightM=h*state.scene.m/state.scene.e;
  if(!Number.isFinite(targetHeightM))return null;
  const drop=state.originMeters.y-targetHeightM;
  if(!(drop>0))return null;
  // 仮の進入設計: 現在の物理高度を海面基準で一定にし、水平速度を維持して水平投下。
  const physicalFallSeconds=Math.sqrt(2*drop/GROUND_BALLISTIC_PROFILE.gravity);
  if(!Number.isFinite(physicalFallSeconds)||physicalFallSeconds>=GROUND_AIR_BOMB_PROFILE.maxPhysicalFlightSeconds)return null;
  const heading=new THREE.Vector3(p.x-f.pos.x,0,p.z-f.pos.z),length=heading.length(),horizontalSpeed=Math.hypot(state.velocityMeters.x,state.velocityMeters.z);
  if(length>1e-9&&horizontalSpeed===0)return null;
  if(length>0)heading.multiplyScalar(1/length);
  else if(horizontalSpeed>0)heading.set(state.velocityMeters.x/horizontalSpeed,0,state.velocityMeters.z/horizontalSpeed);
  const leadWorld=horizontalSpeed*physicalFallSeconds/state.scene.m;
  const releaseMeters=new THREE.Vector3((p.x-heading.x*leadWorld)*state.scene.m,state.originMeters.y,(p.z-heading.z*leadWorld)*state.scene.m);
  const releasePos=groundBallisticWorld(state.scene,releaseMeters),releaseGround=state.scene.height(releasePos.x,releasePos.z);
  if(!groundBallisticFinite(releasePos)||!Number.isFinite(releaseGround)||releasePos.y<=releaseGround)return null;
  // この解を着弾保証として使わない。投下時は移動後の実際のfでgroundBombSolutionを再計算する。
  return {heading,releasePos,fallSeconds:physicalFallSeconds/state.timeScale,physicalFallSeconds,
    speedWorld:horizontalSpeed*state.timeScale/state.scene.m,altitudeMeters:state.originMeters.y,target:p.clone()};
}
