/* 地上の距離依存精度。読み込み時に作戦・部隊へ触れない通常script。
   確定: 自走砲・W.A.S.・小型艦は10kmで直径25m、10kmごとに直径2倍。
   無誘導ロケットは距離の2%、戦艦は0.4%が直径（2026-11-17）。
   仮: 10km未満は基準値で固定し、中間距離は指数補間する。爆風・視界・散布範囲の指定とは別。
   距離依存の物理精度へ未観測倍率を掛けない。従来兵科の倍率は呼出し側の責務。 */
function groundScatterRule(f){
  if(!f||typeof op==='undefined'||!op.ground||typeof WOS_TERRAIN==='undefined')return null;
  return groundRuleSet()?.strike?.[f.groundKind==='sea'&&f.type==='bb'?'battleship':f.groundKind]||null;
}
function groundScatterBase(f){
  const rule=groundScatterRule(f),base=rule?.minScatterDiameter10KmM||rule?.scatterRatio;
  return Number.isFinite(base)&&base>0?base:0;
}
function groundScatterAtDistance(f,distanceWorld){
  const base=groundScatterBase(f);
  if(!base||!Number.isFinite(distanceWorld)||distanceWorld<0)return 0;
  const rule=groundScatterRule(f);if(rule.scatterRatio)return distanceWorld*rule.scatterRatio/2;
  const km=distanceWorld/GROUND_SCALE,diameterM=base*2**(Math.max(0,km-10)/10);
  return diameterM*GROUND_SCALE/2000;
}
function groundScatterRadius(f,p){
  if(!f?.pos||!p||![f.pos.x,f.pos.z,p.x,p.z].every(Number.isFinite))return 0;
  return groundScatterAtDistance(f,Math.hypot(p.x-f.pos.x,p.z-f.pos.z));
}
// 1回だけの保守的な下限。各線分上の最遠距離は端点にあり、帯・端の半円はradiusを足して包む。
// 現在半径の維持・上限との調停・固定点反復・UI表示は呼出し側が担当する。
function groundAreaRequiredRadius(units,points,radius){
  if(!Array.isArray(units)||!Array.isArray(points)||!points.length||!Number.isFinite(radius)||radius<0||!points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)))return 0;
  let required=0;
  for(const f of units){
    if(!groundScatterBase(f)||!f.pos||![f.pos.x,f.pos.z].every(Number.isFinite))continue;
    let farthest=0;for(const p of points)farthest=Math.max(farthest,Math.hypot(p.x-f.pos.x,p.z-f.pos.z));
    required=Math.max(required,groundScatterAtDistance(f,farthest+radius));
  }
  return required;
}
// 面積一様な円盤。入力を変更せず、乱数以外の状態は参照しない。
function groundScatterOffset(radius){
  if(!Number.isFinite(radius)||radius<=0)return new THREE.Vector3();
  const angle=Math.random()*Math.PI*2,distance=Math.sqrt(Math.random())*radius;
  return new THREE.Vector3(Math.cos(angle)*distance,0,Math.sin(angle)*distance);
}
