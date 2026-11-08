/* 地上の地点攻撃。発射時に狙点・散布・威力を確定し、直接射撃の視界・遮蔽から切り離す。 */
let groundStrikes=[], groundImpacts=[], groundStrikeAiming=false, groundStrikeMessage='';
function groundStrikeRules(){ return WOS_TERRAIN[op.ground].strike; }
function groundStrikeWeapon(f){
  if(!op.ground||groundStaticTarget(f)||!f.alive||f.embarked||f.locked||!groundCommandAllowed(f,'strike')) return null;
  const capable=f.groundKind==='sea'&&f.band==='sea'||f.groundKind==='artillery'&&f.band==='ground'||f.groundKind==='supportAircraft'&&f.band==='high';
  return capable?groundStrikeRules()[f.groundKind]:null;
}
function groundStrikeCanLaunch(f,p){
  return !!groundStrikeWeapon(f)&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&groundPass(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,'air')&&(f.groundKind!=='sea'||!groundInside(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,WOS_TERRAIN[op.ground].water.sea))&&groundDistanceTo(f,{pos:p})<=f.range&&(f.groundStrikeCooldown||0)<=0;
}
function groundStrikeLaunch(f,p){
  if(!groundStrikeCanLaunch(f,p))return null;
  const w=groundStrikeWeapon(f),observed=groundPointSeenBy(f.team,p),spread=w.spread*(observed?1:groundStrikeRules().unseenSpread);
  const angle=Math.random()*Math.PI*2,offset=Math.sqrt(Math.random())*spread,aim=p.clone(),impact=p.clone();
  aim.y=groundHeight(aim.x,aim.z);impact.x+=Math.cos(angle)*offset;impact.z+=Math.sin(angle)*offset;impact.y=groundHeight(impact.x,impact.z);
  const strike={source:f,team:f.team,kind:f.groundKind,aim,impact,observed,spread,radius:w.radius,dmg:f.dmg*groundSupplyAttackFactor(f),left:w.delay,resolving:false,visual:null};
  groundStrikes.push(strike);f.groundStrikeCooldown=w.reload;groundSupplyShot(f,true);
  if(op.groundDrill)groundDrillEvent('strike',f,strike);
  return strike;
}
// damage の入口もここを通す。友軍、霧の中、発射後に射手が移動・撃破された弾も着弾する。
function groundStrikeHits(s,t,src){
  return s.resolving&&s.source===src&&t.alive&&!t.embarked&&t.band==='ground'&&groundDistanceTo(t,{pos:s.impact})<=s.radius;
}
function groundStrikeStep(dt){
  for(const f of fleets)f.groundStrikeCooldown=Math.max(0,(f.groundStrikeCooldown||0)-dt);
  for(const effect of groundImpacts)effect.left-=dt;
  groundImpacts=groundImpacts.filter(effect=>{if(effect.left>0)return true;groundStrikeDropVisual(effect);return false;});
  groundStrikes=groundStrikes.filter(s=>{
    s.left=Math.max(0,s.left-dt);if(s.left>1e-8)return true;
    s.resolving=true;
    try{
      for(const t of fleets.filter(t=>groundStrikeHits(s,t,s.source))){
        const falloff=1-(1-groundStrikeRules().edgeDamage)*groundDistanceTo(t,{pos:s.impact})/s.radius;
        damage(t,s.dmg*falloff,s.source,s);
      }
      groundBridgeHit(s);
    }finally{s.resolving=false;}
    groundStrikeDropVisual(s);
    // 散布先そのものに地表の輪を残す。停止撮影でも着弾を確認できる。
    groundImpacts.push({...s,left:groundStrikeRules().effectSec,visual:null});
    burst(s.impact,TEAM_COL[s.team],24,9,groundStrikeRules().effectSec);
    return false;
  });
}
function groundStrikeAI(f){
  if(!groundStrikeWeapon(f)||(f.groundStrikeCooldown||0)>0)return;
  const seen=fleets.filter(t=>t.team!==f.team&&t.alive&&!t.embarked&&t.band==='ground'&&groundSeenBy(f.team,t));
  let best=null,count=0;
  for(const t of seen){
    const cluster=seen.filter(u=>groundDistanceTo(t,u)<=groundStrikeWeapon(f).radius),p=new THREE.Vector3();
    cluster.forEach(u=>p.add(u.pos));p.divideScalar(cluster.length);
    if(cluster.length>=groundStrikeRules().aiCluster&&cluster.length>count&&groundStrikeCanLaunch(f,p)&&groundPointSeenBy(f.team,p)){best=p;count=cluster.length;}
  }
  if(best)groundStrikeLaunch(f,best); // 予告円を避ける AI は未決定なので追加しない。
}
function groundStrikeCommand(list,p){
  let fired=0;
  for(const f of list)if(groundStrikeLaunch(f,p)){
    fired++;dropArrow(f.arrow);f.arrow=null;f.order=null;f.queue=[];f.fireTarget=null;
  }
  groundStrikeMessage=fired?`${fired}隊 発射（味方にも命中）`:'発射不可：射程・高度・再装填を確認';
  if(fired)groundStrikeAiming=false;
  groundHud();return fired;
}
function groundStrikeToggle(){
  if(over||!op.ground)return;
  if(!orderTargets().some(f=>groundStrikeWeapon(f)))return;
  groundSupplyAiming=false;groundWorkAiming=null;groundStrikeAiming=!groundStrikeAiming;groundStrikeMessage='';closePick();groundHud();
}
function groundStrikeHud(list){
  const eligible=list.filter(f=>groundStrikeWeapon(f)),button=document.getElementById('groundStrike');
  if(groundStrikeAiming&&!eligible.length)groundStrikeAiming=false;
  button.disabled=!eligible.length;button.setAttribute('aria-pressed',String(groundStrikeAiming));
  const reload=Math.max(0,...eligible.map(f=>f.groundStrikeCooldown||0));
  document.getElementById('groundStrikeStatus').textContent=groundStrikeAiming?'地図をクリック（Escで取消）':reload>0?`再装填 ${reload.toFixed(1)}秒`:groundStrikeMessage;
}
function groundStrikeDropVisual(s){
  if(!s.visual)return;
  const {ring,el}=s.visual;
  if(ring.parent)ring.parent.remove(ring);
  ring.geometry.dispose();ring.material.dispose();el.remove();s.visual=null;
}
function groundStrikeReset(){
  [...groundStrikes,...groundImpacts].forEach(groundStrikeDropVisual);
  groundStrikes=[];groundImpacts=[];groundStrikeAiming=false;groundStrikeMessage='';
}
function groundStrikeDraw(){
  if(!groundVisuals)return;
  for(const s of [...groundStrikes,...groundImpacts]){
    const pending=groundStrikes.includes(s),p=pending?s.aim:s.impact;
    if(!s.visual){
      const points=[];
      for(let i=0;i<96;i++){const a=i/96*Math.PI*2,x=p.x+Math.cos(a)*s.radius,z=p.z+Math.sin(a)*s.radius;points.push(new THREE.Vector3(x,groundHeight(x,z)+.3,z));}
      const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:TEAM_COL[s.team],transparent:true,opacity:.85,depthWrite:false}));
      groundVisuals.add(ring);
      const el=document.createElement('div');el.className='ground-strike-label';el.style.color='#'+TEAM_COL[s.team].getHexString();labelsEl.appendChild(el);s.visual={ring,el};
    }
    const at=proj(p.clone().add(new THREE.Vector3(0,1,0))),{ring,el}=s.visual;
    const visible=s.team===0||groundPointSeenBy(0,p);ring.visible=visible;el.hidden=!visible||at.z>1;
    el.textContent=pending?`${s.kind==='sea'?'艦砲':WOS_TERRAIN[op.ground].unitTypes[s.kind].name} ${s.left.toFixed(1)}秒${s.observed?'':' / 未観測・散布×'+groundStrikeRules().unseenSpread}`:'着弾';
    el.style.transform=`translate(${at.x}px,${at.y}px) translate(-50%,-100%)`;
    ring.material.opacity=pending?.85:s.left/groundStrikeRules().effectSec;
  }
}
