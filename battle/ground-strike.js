/* 地上の地点攻撃。発射時に狙点・散布・威力を確定し、着弾時に爆風の遮蔽を判定する。 */
let groundStrikes=[], groundImpacts=[], groundStrikeAiming=false, groundStrikeMessage='', groundFlightPreview=null;
function groundStrikeRules(){ return groundRuleSet().strike; }
function groundStrikeWeapon(f){
  if(!op.ground||groundTrainingEnemy(f)||!f.alive||f.embarked||f.locked||!groundCommandAllowed(f,'strike')) return null;
  const capable=f.groundKind==='sea'&&f.band==='sea'||['artillery','guidedRocket','was','vehicle'].includes(f.groundKind)&&f.band==='ground'||groundWasCruising(f)||f.groundKind==='supportAircraft'&&f.band==='high';
  return capable?groundStrikeRules()[f.groundKind==='sea'&&f.type==='bb'?'battleship':f.groundKind]||null:null;
}
function groundStrikeArmor(t){const armor=groundStrikeRules().armor;return armor[t.groundKind]??armor.default;}
function groundStrikeRadius(s,t){return s.radius*groundStrikeArmor(t);}
function groundStrikeFalloff(distance,radius){return distance>radius||!(radius>0)?0:distance<=radius/3?1:(radius/3/distance)**2;}
function groundStrikeDamageFactor(kind){const table=groundStrikeRules().softTarget;return table[kind]??table.default;}
function groundStrikeMoraleFactor(s,t,src){
  return (groundStrikeRules().morale[s.kind??src?.groundKind]??1)*(groundRuleSet().unitTypes[t.groundKind]?.blastMorale??1);
}
// 共通の被弾処理から呼ぶ。撃破は通常の体の損失として処理する。
function groundStrikeEffect(t,body,impact,falloff){
  const rules=groundStrikeRules().suppress,profile=rules.profiles[t.groundKind];
  if(!profile)return false;
  const chances=rules.chances[profile],slow=chances?rules.shock:rules[profile];
  t.groundBlastUntil=gameSec+slow.seconds;t.groundBlastSpeed=slow.speed;
  if(!chances||!body?.alive)return false;
  if(falloff===undefined){
    const pos=groundBodyPosition(t,t.bodies.indexOf(body));
    falloff=groundStrikeFalloff(groundDistanceTo({pos},{pos:impact.impact}),groundStrikeRadius(impact,t));
  }
  for(const kind of ['runningGear','engine','destroy']){
    const chance=chances[kind]*falloff;
    if(!(chance>0&&Math.random()<chance))continue;
    if(kind==='destroy')return true;
    const until=gameSec+rules.mobility[kind].seconds;
    (body.groundMobility??={})[kind]=until;
    t.groundMobilityUntil=Math.max(t.groundMobilityUntil??0,until);
    break;
  }
  return false;
}
function groundStrikeSpeedFactor(t){
  const shock=t.groundBlastUntil>gameSec?t.groundBlastSpeed:1;
  if(!(t.groundMobilityUntil>gameSec)||!t.bodies)return shock;
  const {runningGear,engine}=groundStrikeRules().suppress.mobility;
  let sum=0,count=0;
  for(const body of t.bodies)if(body.alive){
    // 各部位は独立して応急修理し、修理途中はその体で遅い方を使う。
    sum+=Math.min(body.groundMobility?.runningGear>gameSec?runningGear.speed:1,body.groundMobility?.engine>gameSec?engine.speed:1);
    count++;
  }
  return count?shock*sum/count:shock;
}
// 隊の視界と射程判定は従来どおり。照準だけは各射手にいちばん近い生存体へ。
function groundStrikeTargetPoint(f,index,t){
  if(!t?.alive||t.embarked||!groundSeenBy(f.team,t))return null;
  const from=f.bodies?groundBodyPosition(f,index):f.pos;
  if(!t.bodies)return t.pos.clone();
  let best=null,distance=Infinity;
  for(const [i,b] of t.bodies.entries())if(b.alive){const p=groundBodyPosition(t,i),d=Math.hypot(p.x-from.x,p.z-from.z);if(d<distance){best=p;distance=d;}}
  return best;
}
// 戦車は直射、航空は現在高度・速度の水平到達（計画許可は別）、その他は間接。
function groundStrikeRange(f){
  const r=groundFireRanges(f);
  if(f.groundKind==='vehicle')return {min:0,max:r.direct||0,direct:true};
  if(f.groundKind==='supportAircraft'){const s=groundBombSolution(f);return {min:0,max:s?groundDistanceTo(f,{pos:s.impact}):0,ballistic:true};}
  return r.indirect||{min:0,max:0};
}
function groundStrikeInRange(f,p){
  if(!groundStrikeWeapon(f)||!Number.isFinite(p.x)||!Number.isFinite(p.z))return false;
  if(f.groundKind==='supportAircraft')return groundAirInside(p)&&!!groundBombPlan(f,p);
  const r=groundStrikeRange(f),distance=groundDistanceTo(f,{pos:p});
  return r.max>0&&distance>=r.min&&distance<=r.max&&groundPass(groundMapX(p.x),groundMapY(p.z),'air')&&(!r.direct||distance<=groundSightRange(f)&&groundClearLine(groundEye(f),{x:p.x,z:p.z,y:groundSightHeight(p.x,p.z)+groundSightRules().eyeHeight}))&&(f.groundKind==='supportAircraft'||groundBallisticPoint(f,p).clear);
}
function groundStrikeCanLaunch(f,p,volley=null){
  const bomb=f.groundKind==='supportAircraft',run=f.groundBombRun;
  // 計画済みの投下列は、各発の時点で新しい進入を要求せず、現在の投下姿勢を使う。
  const planned=bomb&&groundAirSquad(f)&&(run?.ledger.releaseAim.equals(p)||volley?.ledger?.fired.size>0);
  const reachable=planned?!!groundStrikeWeapon(f)&&groundBallisticFinite(p)&&groundAirInside(p):groundStrikeInRange(f,p);
  return reachable&&(!bomb||volley?.ledger?.fired.size>0||groundBombPose(f,p))&&
    (volley?f.groundVolley===volley&&volley.ledger?.source===f&&Array.isArray(volley.ledger.entries)&&volley.ledger.entries.length>0:(f.groundStrikeCooldown||0)<=0);
}
function groundStrikeLaunch(f,p,impactOverride=null,area=null,volley=null,entry=null){
  if(!groundStrikeCanLaunch(f,p,volley))return null;
  const w=groundStrikeWeapon(f),observed=groundPointSeenBy(f.team,p),distanceScatter=groundScatterBase(f)>0,spread=f.groundKind==='supportAircraft'?0:distanceScatter?groundScatterRadius(f,p):w.spread*(observed?1:groundStrikeRules().unseenSpread);
  const angle=Math.random()*Math.PI*2,offset=Math.sqrt(Math.random())*spread,aim=p.clone(),impact=p.clone();
  aim.y=groundHeight(aim.x,aim.z);impact.x+=Math.cos(angle)*offset;impact.z+=Math.sin(angle)*offset;impact.y=groundHeight(impact.x,impact.z);
  if(impactOverride)impact.copy(impactOverride);
  let flight=f.groundKind==='supportAircraft'?groundBombSolution(f):groundBallisticPoint(f,impact,{ignoreRange:true});
  if(f.groundKind==='supportAircraft'&&!flight)return null;
  if(flight&&(!flight.origin||!flight.impact||!Number.isFinite(flight.duration)||flight.duration<=0))return null;
  if(flight?.impact)impact.copy(flight.impact);
  const index=f.bodies?(entry?.index??f.bodies.findIndex(b=>b.alive)):0;
  const origin=f.bodies?groundBodyPosition(f,index):f.pos.clone();
  if(flight&&f.groundKind!=='supportAircraft'){
    // 射程・衝突判定は隊の解を保持し、発射点だけを体へ移す。共有キャッシュは変更しない。
    const offset=origin.clone().sub(f.pos);flight={...flight,origin:flight.origin.clone().add(offset),originMeters:flight.originMeters.clone(),velocityMeters:flight.velocityMeters.clone()};
    flight.originMeters.x+=offset.x*flight.scene.m;flight.originMeters.z+=offset.z*flight.scene.m;
    flight.velocityMeters.x-=offset.x*flight.scene.m/flight.physicalDuration;flight.velocityMeters.z-=offset.z*flight.scene.m/flight.physicalDuration;
  }
  const duration=flight?(flight.hitTime??flight.duration):w.delay;
  const strike={area,areaDirected:!!impactOverride,source:f,team:f.team,kind:f.groundKind,aim,impact,origin,observed,spread,radius:w.radius,dmg:f.dmg*(w.dmgScale??1)*groundSupplyAttackFactor(f)/(f.bodies?groundBodiesPerPlatoon(f):1),distanceScatter,flight,duration,left:duration,resolving:false,visual:null,label:!volley||volley.ledger.fired.size===0,firstRound:!entry||entry.round===0};
  groundVisualLaunch(strike,index);
  groundStrikes.push(strike);if(!volley)f.groundStrikeCooldown=w.reload;groundSupplyShot(f,true,volley?1/volley.ledger.entries.length:1);
  if(op.groundDrill)groundDrillEvent('strike',f,strike);
  return strike;
}
// damage の入口もここを通す。友軍、霧の中、発射後に射手が移動・撃破された弾も着弾する。
function groundStrikeHits(s,t,src){
  const radius=groundStrikeRadius(s,t);
  return !groundTrainingEnemy(src)&&s.resolving&&s.source===src&&t.alive&&!t.groundExited&&!t.embarked&&(t.band==='ground'&&!groundWasFlying(t)||['sea','supportAircraft'].includes(src?.groundKind)&&t.band==='sea')&&(t.bodies?t.bodies.some((b,i)=>b.alive&&groundDistanceTo({pos:groundBodyPosition(t,i)},{pos:s.impact})<=radius):groundDistanceTo(t,{pos:s.impact})<=radius);
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
        const radius=groundStrikeRadius(s,t),bodies=t.bodies?t.bodies.map((b,i)=>({b,pos:groundBodyPosition(t,i)})).filter(x=>x.b.alive&&groundDistanceTo({pos:x.pos},{pos:s.impact})<=radius):[{b:null,pos:t.pos}];
        for(const hit of bodies){
          if(!t.alive)break;const falloff=groundStrikeFalloff(groundDistanceTo({pos:hit.pos},{pos:s.impact}),radius);
          damage(t,s.dmg*falloff/(t.bodies?groundBodiesPerPlatoon(t):1),s.source,s,hit.b,{falloff});
        }
      }
      groundBridgeHit(s);
    }finally{s.resolving=false;}
    groundStrikeDropVisual(s);
    groundImpacts.push({...s,left:groundStrikeRules().effectSec,visual:null});
    groundVisualBlast(s);
    return false;
  });
  groundVolleyStep(dt);
  if(typeof groundAreaSalvoStep==='function')groundAreaSalvoStep();
}
function groundStrikeAI(f){
  if(groundStaticTarget(f)||!groundStrikeWeapon(f)||(f.groundStrikeCooldown||0)>0)return;
  const seen=fleets.filter(t=>t.team!==f.team&&t.alive&&!t.embarked&&(t.band==='ground'&&!groundWasFlying(t)||f.groundKind==='sea'&&t.band==='sea')&&groundSeenBy(f.team,t));
  let best=null,count=0;
  const weapon=groundStrikeWeapon(f),points=seen.flatMap(t=>{
    const radius2=groundStrikeRadius(weapon,t)**2;
    return t.bodies?t.bodies.flatMap((b,i)=>b.alive?[{pos:groundBodyPosition(t,i),radius2}]:[]):[{pos:t.pos,radius2}];
  });
  for(const candidate of points){
    const p=candidate.pos;let cluster=0;
    for(const u of points)if((p.x-u.pos.x)**2+(p.z-u.pos.z)**2<=u.radius2)cluster++;
    if(cluster>=groundStrikeRules().aiBodies&&cluster>count&&groundStrikeCanLaunch(f,p)){best=p;count=cluster;}
  }
  if(best)groundVolleyStart(f,{point:best}); // 予告円を避ける AI は未決定なので追加しない。
}
function groundStrikeCommand(list,p){
  let fired=0;
  for(const f of list)if(f.groundKind==='supportAircraft'?groundStrikeInRange(f,p):groundStrikeCanLaunch(f,p)){
    npcAutoPlayer([f]);groundCancelWork(f);groundClearOrders(f);
    if(f.groundKind==='supportAircraft'?groundBombPrepare(f,{point:p}):groundVolleyStart(f,{point:p}))fired++;
  }
  groundStrikeMessage=fired?`${fired}隊に射撃・投下を指示（味方にも命中）`:'発射不可：射程・高度・再装填を確認';
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
  button.title=eligible.length&&eligible.every(f=>f.groundKind==='vehicle')?'直射による範囲射撃（射手自身の視界・見通しが必要）':eligible.length&&eligible.every(f=>f.groundKind==='supportAircraft')?'爆撃範囲：中心・半径、または中心線・幅を指定すると自動進入':eligible.some(f=>f.groundKind==='supportAircraft')?'砲撃・爆撃範囲：中心・半径、または中心線・幅':'範囲砲撃：中心・半径、または中心線・幅';
  button.disabled=!eligible.length;button.setAttribute('aria-pressed',String(groundStrikeAiming));
  const reload=Math.max(0,...eligible.map(f=>f.groundStrikeCooldown||0));
  const count=document.getElementById('groundSalvoCount');if(count)count.disabled=!eligible.length;
  const salvo=Math.max(0,...eligible.map(f=>f.groundAreaSalvo?.remaining||0)),burst=Math.max(0,...eligible.map(f=>f.groundVolley?f.groundVolley.ledger.entries.length-f.groundVolley.ledger.fired.size-f.groundVolley.ledger.skipped.size:0));
  document.getElementById('groundStrikeStatus').textContent=groundStrikeAiming?(typeof groundAreaHint==='function'&&groundAreaHint()||'地図をクリック（Escで取消）').replace('砲撃：',eligible.length&&eligible.every(f=>f.groundKind==='supportAircraft')?'爆撃範囲：':eligible.some(f=>f.groundKind==='supportAircraft')?'砲撃・爆撃範囲：':'砲撃：'):eligible.some(f=>f.groundBombRun)?'爆撃進入中'+(salvo?' / 斉射残り最大'+salvo+'回':' / 投下待ち'):burst?'連射 残り最大'+burst+'発'+(salvo?' / 斉射残り最大'+salvo+'回':''):salvo?'斉射残り最大'+salvo+'回 / 再装填 '+reload.toFixed(1)+'秒':reload>0?`再装填 ${reload.toFixed(1)}秒`:groundStrikeMessage;
}
function groundStrikeDropVisual(s){
  if(!s.visual)return;
  const {ring,el,arc}=s.visual;
  for(const object of [ring,arc])if(object){object.parent?.remove(object);object.geometry.dispose();object.material.dispose();}
  el?.remove();s.visual=null;
}
function groundStrikeReset(){
  groundFxReset();
  if(Array.isArray(fleets))for(const f of fleets)if(groundFlyingAircraft(f))groundBombCancel(f);
  groundAutoAAReset();
  groundVolleyReset();
  groundBallisticReset();
  groundFlightPreviewDrop();
  if(typeof groundAreaReset==='function')groundAreaReset();
  [...groundStrikes,...groundImpacts].forEach(groundStrikeDropVisual);
  groundStrikes=[];groundImpacts=[];groundStrikeAiming=false;groundStrikeMessage='';
}
function groundStrikeDraw(){
  if(!groundVisuals)return;
  groundFlightPreviewDraw();
  for(const s of groundStrikes)groundStrikeMark(s,true);
  for(const s of groundImpacts)if(s.label!==false)groundStrikeMark(s,false);
}
// 予告円・予告弾道・残り時間は射撃の読み取り用。弾と着弾は GFX で描く。
function groundStrikeMark(s,pending){
    const p=pending?s.aim:s.impact,marked=!(pending&&s.area);
    if(!s.visual){
      const v=s.visual={ring:null,el:null,arc:null};
      if(pending&&marked){
        const points=[];
        for(let i=0;i<96;i++){const a=i/96*Math.PI*2,x=p.x+Math.cos(a)*s.radius,z=p.z+Math.sin(a)*s.radius;points.push(new THREE.Vector3(x,groundHeight(x,z)+.3,z));}
        v.ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:TEAM_COL[s.team],transparent:true,opacity:.85,depthWrite:false}));
        groundVisuals.add(v.ring);
      }
      if(marked&&s.label!==false){
        const el=v.el=document.createElement('div');el.className='ground-strike-label';el.style.color='#'+TEAM_COL[s.team].getHexString();labelsEl.appendChild(el);
      }
      if(s.flight&&pending&&s.firstRound!==false){
        const path=[];for(let i=0;i<=48;i++)path.push(groundBallisticAt(s.flight,s.duration*i/48));
        v.arc=new THREE.Line(new THREE.BufferGeometry().setFromPoints(path),new THREE.LineDashedMaterial({color:TEAM_COL[s.team],transparent:true,opacity:.65,depthWrite:false,dashSize:.5,gapSize:.4}));
        v.arc.computeLineDistances();groundVisuals.add(v.arc);
      }
    }
    const {ring,el,arc}=s.visual;
    if(!ring&&!el&&!arc)return;
    const visible=s.team===0||groundPointSeenBy(0,p);
    if(ring)ring.visible=visible;
    if(arc)arc.visible=visible&&(s.team===0||s.source.seen);
    if(el){
      const at=proj(p.clone().add(new THREE.Vector3(0,1,0)));el.hidden=!visible||at.z>1;
      el.textContent=pending?`${s.kind==='sea'?'艦砲':groundRuleSet().unitTypes[s.kind].name} ${s.left.toFixed(1)}秒${s.observed?'':s.areaDirected||s.distanceScatter||s.kind==='supportAircraft'?' / 未観測':' / 未観測・散布×'+groundStrikeRules().unseenSpread}`:'着弾';
      el.style.transform=`translate(${at.x}px,${at.y-26}px) translate(-50%,-100%)`;
    }
}

function groundFlightPreviewDrop(){
  if(!groundFlightPreview)return;
  groundFlightPreview.line.parent?.remove(groundFlightPreview.line);groundFlightPreview.line.geometry.dispose();groundFlightPreview.line.material.dispose();groundFlightPreview.el.remove();groundFlightPreview=null;
}
function groundFlightPreviewDraw(){
  const area=typeof groundAreaAim==='undefined'?null:groundAreaAim?.preview,f=area&&groundAreaUnits(groundAreaAim.units)[0];
  if(!groundStrikeAiming||!f){groundFlightPreviewDrop();return;}
  const target=area.points[Math.floor(area.points.length/2)],solution=f.groundKind==='supportAircraft'?groundBombSolution(f):groundBallisticPoint(f,target);
  if(!solution?.origin||!Number.isFinite(solution.duration)||solution.duration<=0){groundFlightPreviewDrop();return;}
  const duration=solution.hitTime??solution.duration;
  if(!groundFlightPreview){const line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xe2c58a,transparent:true,opacity:.55,depthWrite:false,dashSize:.6,gapSize:.4}));groundVisuals.add(line);const el=document.createElement('div');el.className='ground-strike-label';labelsEl.appendChild(el);groundFlightPreview={line,el};}
  const {line,el}=groundFlightPreview;
  if(groundFlightPreview.solution!==solution){const points=[];for(let i=0;i<=32;i++)points.push(groundBallisticAt(solution,duration*i/32));line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(points);line.computeLineDistances();groundFlightPreview.solution=solution;}
  const p=proj((solution.impact||target).clone().add(new THREE.Vector3(0,.6,0)));el.hidden=p.z>1;el.style.transform=`translate(${p.x}px,${p.y-30}px) translate(-50%,-100%)`;el.textContent=solution.clear?(f.groundKind==='supportAircraft'?'今投下した場合：着弾まで ':'予想着弾 ')+duration.toFixed(1)+'秒':'地形・建物で遮断';
}
