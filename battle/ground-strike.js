/* 地上の地点攻撃。発射時に狙点・散布・威力を確定し、直接射撃の視界・遮蔽から切り離す。 */
let groundStrikes=[], groundImpacts=[], groundStrikeAiming=false, groundStrikeMessage='', groundFlightPreview=null;
function groundStrikeRules(){ return WOS_TERRAIN[op.ground].strike; }
function groundStrikeWeapon(f){
  if(!op.ground||groundTrainingEnemy(f)||!f.alive||f.embarked||f.locked||!groundCommandAllowed(f,'strike')) return null;
  const capable=f.groundKind==='sea'&&f.band==='sea'||['artillery','guidedRocket','was','vehicle'].includes(f.groundKind)&&f.band==='ground'||f.groundKind==='supportAircraft'&&f.band==='high';
  return capable?(groundStrikeRules()[f.groundKind]||(['guidedRocket','was'].includes(f.groundKind)?groundStrikeRules().artillery:null)):null;
}
// 地点攻撃も操作用の武器射程を使用。戦車は直射、航空は暫定対地、その他は間接。
function groundStrikeRange(f){
  const r=groundFireRanges(f);
  if(f.groundKind==='vehicle')return {min:0,max:r.direct||0,direct:true};
  if(f.groundKind==='supportAircraft')return {min:0,max:r.ground||0};
  return r.indirect||{min:0,max:0};
}
function groundStrikeInRange(f,p){
  if(!groundStrikeWeapon(f)||!Number.isFinite(p.x)||!Number.isFinite(p.z))return false;
  const r=groundStrikeRange(f),distance=groundDistanceTo(f,{pos:p});
  return r.max>0&&distance>=r.min&&distance<=r.max&&groundPass(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,'air')&&(f.groundKind!=='sea'||!groundInside(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,WOS_TERRAIN[op.ground].water.sea))&&(!r.direct||distance<=groundSightRange(f)&&groundClearLine(groundEye(f),{x:p.x,z:p.z,y:groundSightHeight(p.x,p.z)+groundSightRules().eyeHeight}))&&(f.groundKind==='supportAircraft'||groundBallisticPoint(f,p).clear);
}
function groundStrikeCanLaunch(f,p){return groundStrikeInRange(f,p)&&(f.groundStrikeCooldown||0)<=0;}
function groundStrikeLaunch(f,p,impactOverride=null,area=null){
  if(!groundStrikeCanLaunch(f,p))return null;
  const w=groundStrikeWeapon(f),observed=groundPointSeenBy(f.team,p),distanceScatter=['artillery','guidedRocket'].includes(f.groundKind),spread=distanceScatter?groundScatterRadius(f,p):w.spread*(observed?1:groundStrikeRules().unseenSpread);
  const angle=Math.random()*Math.PI*2,offset=Math.sqrt(Math.random())*spread,aim=p.clone(),impact=p.clone();
  aim.y=groundHeight(aim.x,aim.z);impact.x+=Math.cos(angle)*offset;impact.z+=Math.sin(angle)*offset;impact.y=groundHeight(impact.x,impact.z);
  if(impactOverride)impact.copy(impactOverride);
  const flight=f.groundKind==='supportAircraft'?null:groundBallisticPoint(f,impact,{ignoreRange:true});
  if(flight&&(!flight.origin||!flight.impact||!Number.isFinite(flight.duration)||flight.duration<=0))return null;
  if(flight?.impact)impact.copy(flight.impact);
  const duration=flight?(flight.hitTime??flight.duration):w.delay;
  const strike={area,areaDirected:!!impactOverride,source:f,team:f.team,kind:f.groundKind,aim,impact,observed,spread,radius:w.radius,dmg:f.dmg*groundSupplyAttackFactor(f),distanceScatter,flight,duration,left:duration,resolving:false,visual:null};
  if(f.groundKind==='vehicle')shoot(f.pos,impact,TEAM_COL[f.team],.25);
  groundStrikes.push(strike);f.groundStrikeCooldown=w.reload;groundSupplyShot(f,true);
  if(op.groundDrill)groundDrillEvent('strike',f,strike);
  return strike;
}
// damage の入口もここを通す。友軍、霧の中、発射後に射手が移動・撃破された弾も着弾する。
function groundStrikeHits(s,t,src){
  return !groundTrainingEnemy(src)&&s.resolving&&s.source===src&&t.alive&&!t.embarked&&t.band==='ground'&&groundDistanceTo(t,{pos:s.impact})<=s.radius;
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
        damage(t,s.dmg*falloff*(s.kind==='guidedRocket'?groundMatchup(s.source,t):1),s.source,s);
      }
      groundBridgeHit(s);
    }finally{s.resolving=false;}
    groundStrikeDropVisual(s);
    // 散布先そのものに地表の輪を残す。停止撮影でも着弾を確認できる。
    groundImpacts.push({...s,left:groundStrikeRules().effectSec,visual:null});
    burst(s.impact,TEAM_COL[s.team],24,9,groundStrikeRules().effectSec);
    return false;
  });
  if(typeof groundAreaSalvoStep==='function')groundAreaSalvoStep();
}
function groundStrikeAI(f){
  if(groundStaticTarget(f)||!groundStrikeWeapon(f)||(f.groundStrikeCooldown||0)>0)return;
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
    fired++;groundCancelWork(f);groundClearOrders(f);
  }
  groundStrikeMessage=fired?`${fired}隊 発射（味方にも命中）`:'発射不可：射程・高度・再装填を確認';
  if(fired){const message=groundStrikeMessage;groundClearAiming();groundStrikeMessage=message;}
  groundHud();return fired;
}
function groundStrikeToggle(){
  if(over||!op.ground)return;
  if(!orderTargets().some(f=>groundStrikeWeapon(f)))return;
  const aiming=!groundStrikeAiming;groundClearAiming();groundStrikeAiming=aiming;if(aiming&&typeof groundAreaStart==='function')groundAreaStart();groundHud();
}
function groundStrikeHud(list){
  const eligible=list.filter(f=>groundStrikeWeapon(f)),button=document.getElementById('groundStrike');
  if(groundStrikeAiming&&!eligible.length)groundClearAiming();
  button.title=eligible.length&&eligible.every(f=>f.groundKind==='vehicle')?'直射による範囲射撃（射手自身の視界・見通しが必要）':'範囲砲撃：中心・半径、または中心線・幅';
  button.disabled=!eligible.length;button.setAttribute('aria-pressed',String(groundStrikeAiming));
  const reload=Math.max(0,...eligible.map(f=>f.groundStrikeCooldown||0));
  const count=document.getElementById('groundSalvoCount');if(count)count.disabled=!eligible.length;
  const salvo=Math.max(0,...eligible.map(f=>f.groundAreaSalvo?.remaining||0));
  document.getElementById('groundStrikeStatus').textContent=groundStrikeAiming?(typeof groundAreaHint==='function'&&groundAreaHint()||'地図をクリック（Escで取消）'):salvo?'砲撃 残り最大'+salvo+'回 / 再装填 '+reload.toFixed(1)+'秒':reload>0?`再装填 ${reload.toFixed(1)}秒`:groundStrikeMessage;
}
function groundStrikeDropVisual(s){
  if(!s.visual)return;
  const {ring,el,arc,projectile}=s.visual;
  for(const object of [arc,projectile])if(object){object.parent?.remove(object);object.geometry.dispose();object.material.dispose();}
  if(ring.parent)ring.parent.remove(ring);
  ring.geometry.dispose();ring.material.dispose();el.remove();s.visual=null;
}
function groundStrikeReset(){
  groundBallisticReset();
  groundFlightPreviewDrop();
  if(typeof groundAreaReset==='function')groundAreaReset();
  [...groundStrikes,...groundImpacts].forEach(groundStrikeDropVisual);
  groundStrikes=[];groundImpacts=[];groundStrikeAiming=false;groundStrikeMessage='';
}
function groundStrikeDraw(){
  if(!groundVisuals)return;
  groundFlightPreviewDraw();
  for(const s of [...groundStrikes,...groundImpacts]){
    const pending=groundStrikes.includes(s),p=pending?s.aim:s.impact;
    if(!s.visual){
      const points=[];
      for(let i=0;i<96;i++){const a=i/96*Math.PI*2,x=p.x+Math.cos(a)*s.radius,z=p.z+Math.sin(a)*s.radius;points.push(new THREE.Vector3(x,groundHeight(x,z)+.3,z));}
      const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:TEAM_COL[s.team],transparent:true,opacity:.85,depthWrite:false}));
      groundVisuals.add(ring);
      const el=document.createElement('div');el.className='ground-strike-label';el.style.color='#'+TEAM_COL[s.team].getHexString();labelsEl.appendChild(el);s.visual={ring,el};
      if(s.flight){
        const path=[];for(let i=0;i<=48;i++)path.push(groundBallisticAt(s.flight,s.duration*i/48));
        const arc=new THREE.Line(new THREE.BufferGeometry().setFromPoints(path),new THREE.LineDashedMaterial({color:TEAM_COL[s.team],transparent:true,opacity:.65,depthWrite:false,dashSize:.5,gapSize:.4}));arc.computeLineDistances();groundVisuals.add(arc);
        const projectile=new THREE.Mesh(new THREE.SphereGeometry(.16,6,4),new THREE.MeshBasicMaterial({color:0xe2c58a}));groundVisuals.add(projectile);s.visual.arc=arc;s.visual.projectile=projectile;
      }
    }
    const at=proj(p.clone().add(new THREE.Vector3(0,1,0))),{ring,el}=s.visual;
    const visible=s.team===0||groundPointSeenBy(0,p);ring.visible=visible;el.hidden=!visible||at.z>1;
    if(s.visual.arc){s.visual.arc.visible=visible&&pending&&(s.team===0||s.source.seen);s.visual.projectile.visible=visible&&pending&&(s.team===0||groundPointSeenBy(0,groundBallisticAt(s.flight,Math.max(0,s.duration-s.left))));if(pending)s.visual.projectile.position.copy(groundBallisticAt(s.flight,Math.max(0,s.duration-s.left)));}
    el.textContent=pending?`${s.kind==='sea'?'艦砲':WOS_TERRAIN[op.ground].unitTypes[s.kind].name} ${s.left.toFixed(1)}秒${s.observed?'':s.areaDirected||s.distanceScatter?' / 未観測':' / 未観測・散布×'+groundStrikeRules().unseenSpread}`:'着弾';
    el.style.transform=`translate(${at.x}px,${at.y-26}px) translate(-50%,-100%)`;
    ring.material.opacity=pending?.85:s.left/groundStrikeRules().effectSec;
  }
}

function groundFlightPreviewDrop(){
  if(!groundFlightPreview)return;
  groundFlightPreview.line.parent?.remove(groundFlightPreview.line);groundFlightPreview.line.geometry.dispose();groundFlightPreview.line.material.dispose();groundFlightPreview.el.remove();groundFlightPreview=null;
}
function groundFlightPreviewDraw(){
  const area=typeof groundAreaAim==='undefined'?null:groundAreaAim?.preview,f=area&&groundAreaUnits(groundAreaAim.units)[0];
  if(!groundStrikeAiming||!f||f.groundKind==='supportAircraft'){groundFlightPreviewDrop();return;}
  const target=area.points[Math.floor(area.points.length/2)],solution=groundBallisticPoint(f,target);
  if(!solution.origin||!Number.isFinite(solution.duration)||solution.duration<=0){groundFlightPreviewDrop();return;}
  const duration=solution.hitTime??solution.duration;
  if(!groundFlightPreview){const line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xe2c58a,transparent:true,opacity:.55,depthWrite:false,dashSize:.6,gapSize:.4}));groundVisuals.add(line);const el=document.createElement('div');el.className='ground-strike-label';labelsEl.appendChild(el);groundFlightPreview={line,el};}
  const {line,el}=groundFlightPreview;
  if(groundFlightPreview.solution!==solution){const points=[];for(let i=0;i<=32;i++)points.push(groundBallisticAt(solution,duration*i/32));line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(points);line.computeLineDistances();groundFlightPreview.solution=solution;}
  const p=proj((solution.impact||target).clone().add(new THREE.Vector3(0,.6,0)));el.hidden=p.z>1;el.style.transform=`translate(${p.x}px,${p.y-30}px) translate(-50%,-100%)`;el.textContent=solution.clear?'予想着弾 '+duration.toFixed(1)+'秒':'地形・建物で遮断';
}
