/* 地上・海上の自動対空。通常scriptの関数だけを定義し、globalsは実行時に読む。
   航空機の通常対空は対象外。空中W.A.S.もこの独立した迎撃処理を使う。
   silentを尊重。groundHoldFire/groundAAEnabledは設定用フックで、新しい禁止UIではない。 */
function groundAutoAASource(f){return !!f?.groundKind&&!['fighter','attack','supportAircraft'].includes(f.groundKind);}
function groundAARange(f,t){
  if(!groundAutoAASource(f))return 0;
  const r=groundFireRanges(f),range=f.groundKind==='was'&&['low','high'].includes(f.band)?r.air:r.aa;
  if(!Number.isFinite(range)||range<=0)return 0;
  return f.groundKind==='sea'&&t?.groundKind==='drone'?Math.min(range,groundRuleSet().combat.drone.seaAAKm*GROUND_SCALE):range;
}
function groundAutoAAReady(f){
  return typeof op!=='undefined'&&!!op.ground&&groundAutoAASource(f)&&f.alive&&!f.embarked&&!groundAbsent(f)&&
    !(typeof groundScriptDescending==='function'&&groundScriptDescending(f))&&!f.groundBuilding&&!f.groundRout&&f.groundMorale!==0&&!f.groundAirState&&!f.locked&&
    !f.silent&&!f.groundHoldFire&&f.groundAAEnabled!==false&&!groundTrainingEnemy(f)&&!groundStaticTarget(f);
}
function groundAASolution(f,t){
  if(!groundAutoAAReady(f)||!t?.alive||f.team===t.team||t.embarked||groundAbsent(t)||!groundAATargetable(t))return false;
  if(typeof groundDrillAATargetAvailable==='function'&&!groundDrillAATargetAvailable(t))return false;
  if(!f.pos||!t.pos||![f.pos.x,f.pos.y,f.pos.z,t.pos.x,t.pos.y,t.pos.z].every(Number.isFinite))return false;
  const range=groundAARange(f,t);
  if(!(range>0&&groundFireFactor(f,t,true)>0&&groundSeenBy(f.team,t)))return false;
  if(groundShotInRange(f,t,range))return true;
  // 最寄りの飛行機体が遮蔽物の裏でも、別の機体に射線が通ることがある。
  return f.groundKind==='mobileAA'&&!!f.bodies&&groundWasBodyFlight(t)&&groundWasWithinReach(f,t,range)&&
    t.bodies.some((b,j)=>b.alive&&f.bodies.some((gun,i)=>gun.alive&&groundBodyShot(f,i,t,j,range)));
}
// damage側の専用入口。通常射撃の許可や残ったfireTargetからは迎撃を偽装できない。
function groundAutoAAHit(f,t){return !!f&&f.groundAAResolving===t&&groundAASolution(f,t);}
function groundAutoAAReset(){
  if(typeof fleets==='undefined'||!Array.isArray(fleets))return;
  for(const f of fleets)if(f){f.groundAATimer=0;f.groundAATarget=null;f.groundAAResolving=null;}
}
function groundAAPriority(f,a,b){return f.groundKind==='mobileAA'?Number(b.groundKind==='drone')-Number(a.groundKind==='drone'):0;}
function groundAACompanyFire(f,candidates){
  const aims=[];
  for(const {t} of candidates){
    if(!groundAASolution(f,t))continue;
    const range=groundAARange(f,t),positions=groundBodyPositions(t).positions;
    for(const [j,body] of (t.bodies||[null]).entries()){
      if(body&&!body.alive)continue;
      const p=positions[j]||positions[0];
      const distance=Math.hypot(f.pos.x-p.x,f.pos.z-p.z);
      const damage=body?.max>0?1-body.hp/body.max:0;
      aims.push({t,j,body,range,distance,damage});
    }
  }
  aims.sort((a,b)=>groundAAPriority(f,a.t,b.t)||b.damage-a.damage||a.distance-b.distance);
  // 中隊で1機を共有。射線のない車両は待ち、撃墜すれば同じ更新内でも次の機体へ切り替える。
  let aim=null;
  for(const [i,gun] of f.bodies.entries()){
    if(!gun.alive||gun.aaT>0)continue;
    if(!aim||!aim.t.alive||aim.body&&!aim.body.alive){
      aim=aims.find(candidate=>{
        if(!candidate.t.alive||candidate.body&&!candidate.body.alive)return false;
        candidate.hits??=f.bodies.map((b,k)=>b.alive?groundBodyShot(f,k,candidate.t,candidate.j,candidate.range):null);
        return candidate.hits.some(Boolean);
      });
      if(!aim)break;
    }
    f.groundAATarget=aim.t;
    const hit=aim.hits[i];if(!hit)continue;
    const weapon=groundDirectWeapon(f,aim.t,true,gun,hit);
    gun.aaT=groundWeaponInterval(weapon);
    f.groundAAResolving=aim.t;
    try{groundBodyDirectShot(f,i,aim.t,hit,true,weapon);}finally{f.groundAAResolving=null;}
  }
}
function groundAutoAAStep(dt){
  if(typeof op==='undefined'||!op.ground||typeof fleets==='undefined'||!Array.isArray(fleets)||!Number.isFinite(dt)||dt<0)return;
  const air=fleets.filter(t=>t?.alive&&groundAATargetable(t));
  for(const f of fleets){
    if(!f)continue;
    f.groundAATimer=Math.max(0,(Number.isFinite(f.groundAATimer)?f.groundAATimer:0)-dt);
    const previous=f.groundAATarget;f.groundAATarget=null;
    if(f.bodies)for(const b of f.bodies)b.aaT=Math.max(0,b.aaT-dt);
    if(!groundAutoAAReady(f)||groundAARange(f)<=0){if(f.bodies)groundBodyIdleClock(f,'aaT');continue;}
    const reloading=f.bodies?f.bodies.every(b=>!b.alive||b.aaT>1e-8):f.groundAATimer>1e-8;
    // 装填中は表示の目標を保持し、発射時に射線を確認する。
    if(reloading){
      if(previous?.alive&&previous.team!==f.team&&!previous.embarked&&!groundAbsent(previous)&&groundAATargetable(previous)&&groundSeenBy(f.team,previous)){
        const range=groundAARange(f,previous);
        if(groundWasBodyFlight(f)||groundWasBodyFlight(previous)?groundWasWithinReach(f,previous,range):groundDistanceTo(f,previous)<=range)f.groundAATarget=previous;
      }
      continue;
    }
    const candidates=air.filter(t=>t.team!==f.team&&!t.embarked&&!groundAbsent(t)&&!(groundWasCruising(t)&&f.fireTarget===t)&&groundSeenBy(f.team,t))
      .map(t=>({t,d:groundDistanceTo(f,t)}))
      .filter(({t,d})=>groundWasBodyFlight(f)||groundWasBodyFlight(t)||d<=groundAARange(f,t));
    if(f.groundKind==='mobileAA'&&f.bodies){
      groundAACompanyFire(f,candidates);
      if(!f.groundAATarget)groundBodyIdleClock(f,'aaT');
      continue;
    }
    candidates.sort((a,b)=>groundAAPriority(f,a.t,b.t)||a.d-b.d);
    const target=candidates.find(({t})=>groundAASolution(f,t))?.t;
    f.groundAATarget=target||null;
    if(!target){if(f.bodies)groundBodyIdleClock(f,'aaT');continue;}
    if(f.bodies){
      f.groundAAResolving=target;
      try{groundBodyFire(f,target,0,true);}finally{f.groundAAResolving=null;}
      continue;
    }
    // 対空の時計を先に進め、同期callbackでも同じ迎撃を重複発射しない。
    const hit=groundWasBodyFlight(target)?groundBodyTarget(f,0,target,groundAARange(f,target)):null;
    const weapon=groundDirectWeapon(f,target,true,null,hit);
    f.groundAATimer=groundWeaponInterval(weapon);
    f.groundAAResolving=target;
    try{
      groundVisualDirect(f,0,target,hit?.j??0,hit?.from??f.pos,hit?.pos??target.pos,true,weapon);
      groundFireDirect(f,target,f.groundPlatoons||1,true,hit?.b??null,weapon);
      groundSupplyShot(f);
    }finally{f.groundAAResolving=null;}
  }
}
