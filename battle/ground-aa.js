/* 地上・海上の自動対空。通常scriptの関数だけを定義し、globalsは実行時に読む。
   航空機の通常対空は対象外。空中W.A.S.もこの独立した迎撃処理を使う。
   silentを尊重。groundHoldFire/groundAAEnabledは設定用フックで、新しい禁止UIではない。 */
function groundAutoAASource(f){return !!f?.groundKind&&!['fighter','attack','supportAircraft'].includes(f.groundKind);}
function groundAARange(f){
  if(!groundAutoAASource(f))return 0;
  const r=groundFireRanges(f),range=f.groundKind==='was'&&['low','high'].includes(f.band)?r.air:r.aa;
  return Number.isFinite(range)&&range>0?range:0;
}
function groundAutoAAReady(f){
  return typeof op!=='undefined'&&!!op.ground&&groundAutoAASource(f)&&f.alive&&!f.embarked&&!groundAbsent(f)&&
    !f.groundBuilding&&!f.groundRout&&f.groundMorale!==0&&!f.groundAirState&&!f.locked&&
    !f.silent&&!f.groundHoldFire&&f.groundAAEnabled!==false&&!groundTrainingEnemy(f)&&!groundStaticTarget(f);
}
function groundAASolution(f,t){
  if(!groundAutoAAReady(f)||!t?.alive||f.team===t.team||t.embarked||groundAbsent(t)||!['low','high'].includes(t.band))return false;
  if(typeof groundDrillAATargetAvailable==='function'&&!groundDrillAATargetAvailable(t))return false;
  if(!f.pos||!t.pos||![f.pos.x,f.pos.y,f.pos.z,t.pos.x,t.pos.y,t.pos.z].every(Number.isFinite))return false;
  const range=groundAARange(f);
  return range>0&&groundDistanceTo(f,t)<=range&&groundFireFactor(f,t)>0&&groundSeenBy(f.team,t)&&groundLineOfSight(f,t);
}
// damage側の専用入口。通常射撃の許可や残ったfireTargetからは迎撃を偽装できない。
function groundAutoAAHit(f,t){return !!f&&f.groundAAResolving===t&&groundAASolution(f,t);}
function groundAutoAAReset(){
  if(typeof fleets==='undefined'||!Array.isArray(fleets))return;
  for(const f of fleets)if(f){f.groundAATimer=0;f.groundAATarget=null;f.groundAAResolving=null;}
}
function groundAutoAAStep(dt){
  if(typeof op==='undefined'||!op.ground||typeof fleets==='undefined'||!Array.isArray(fleets)||!Number.isFinite(dt)||dt<0)return;
  const air=fleets.filter(t=>t?.alive&&['low','high'].includes(t.band));
  for(const f of fleets){
    if(!f)continue;
    f.groundAATimer=Math.max(0,(Number.isFinite(f.groundAATimer)?f.groundAATimer:0)-dt);
    f.groundAATarget=null;
    if(!groundAutoAAReady(f)||groundAARange(f)<=0)continue;
    let target=null,distance=Infinity;
    for(const t of air){const d=groundDistanceTo(f,t);if(d<distance&&groundAASolution(f,t)){target=t;distance=d;}}
    f.groundAATarget=target;
    if(!target||f.groundAATimer>1e-8)continue;
    // 対空の時計を先に進め、同期callbackでも同じ迎撃を重複発射しない。
    f.groundAATimer=groundRules().fireEvery;
    f.groundAAResolving=target;
    try{
      shoot(f.pos,target.pos,TEAM_COL[f.team],.25);
      damage(target,f.dmg*groundFireFactor(f,target)*groundMatchup(f,target)*groundSupplyAttackFactor(f),f);
      groundSupplyShot(f);
    }finally{f.groundAAResolving=null;}
  }
}
