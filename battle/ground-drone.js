/* 光ファイバーのドローン。母隊の小隊ごとに発進枠を持つ、戦闘中だけの駒。 */
const groundDroneRules=()=>groundRuleSet().combat.drone;
let groundDroneStats;
function groundDroneFleetStats(){
  const r=groundDroneRules();
  // 耐久は機数そのもの。被弾すると残り機数を1減らす。
  return {name:r.name,hp:r.airframes,speed:r.speedKmPerSecond*GROUND_SCALE,dmg:0,weapons:[r.weapon]};
}
function groundDroneReset(){
  groundDroneStats=[0,1].map(()=>({launched:0,hits:0,shotDown:0}));
}
function groundDroneSlots(scout){
  if(!scout.groundDroneSlots){
    scout.groundDroneSlots=Array.from({length:scout.groundPlatoons||1},(_,i)=>({
      i,stock:groundDroneRules().airframes,ready:0,drone:null
    }));
  }
  return scout.groundDroneSlots;
}
function groundDroneSlotAlive(scout,slot){
  if(!scout.alive||scout.hpPool<=0||groundAbsent(scout))return false;
  if(!scout.bodies)return true;
  const size=groundBodiesPerPlatoon(scout),start=slot.i*size;
  return scout.bodies.slice(start,start+size).some(b=>b.alive);
}
function groundDroneStock(scout){
  const rules=groundDroneRules(),slots=groundDroneSlots(scout).filter(slot=>groundDroneSlotAlive(scout,slot));
  return {slots,max:slots.length,ready:slots.filter(slot=>!slot.drone&&slot.stock===rules.airframes&&gameSec>=slot.ready)};
}
function groundDroneMissing(slot){
  return groundDroneRules().airframes-slot.stock-(slot.drone?groundAliveBodies(slot.drone):0);
}
function groundDroneCanRefill(scout){
  return groundSupplyActive()&&scout.groundSupply>=groundSupplyUnitMax(scout)*groundDroneRules().replenishSupply;
}
function groundDroneStockText(scout){
  const {slots,ready,max}=groundDroneStock(scout),r=groundDroneRules();
  const stock='ドローン '+ready.length+'/'+max;
  const canRefill=groundDroneCanRefill(scout),progress=scout.groundDroneRefill||0;
  let next=Infinity,short=false,queued=0;
  for(const slot of slots){
    const missing=groundDroneMissing(slot);
    // 補充は小隊の順に一機ずつ。飛行中の枠に入る補充も後続の待ち時間に含める。
    queued+=missing;
    if(slot.drone||ready.includes(slot))continue;
    if(missing&&!canRefill){short=true;continue;}
    const refill=missing?queued*r.replenishSec-progress:0;
    next=Math.min(next,Math.max(slot.ready-gameSec,refill));
  }
  // 飛行中の枠は着地時刻が未定なので、表示は地上で待つ枠から選ぶ。
  return stock+(Number.isFinite(next)?'\n次 '+Math.ceil(next)+'秒':short?'\n補給不足':'');
}
function groundDroneControllerReady(scout){
  return scout?.groundKind==='scout'&&scout.alive&&!scout.embarked&&!scout.locked&&
    !groundTrainingEnemy(scout)&&!groundStaticTarget(scout)&&groundCommandAllowed(scout,'launch');
}
function groundDroneLaunch(scout,npc=false){
  if(over||deploying||!groundDroneControllerReady(scout))return null;
  const slot=groundDroneStock(scout).ready[0];if(!slot)return null;
  const r=groundDroneRules(),[x,z]=r.launchOffsetKm,p=scout.pos.clone();
  // 見本の間隔を母隊の向きに合わせる。盤端では母隊の真上に上がる。
  p.x+=GROUND_SCALE*(scout.heading.z*x+scout.heading.x*z);
  p.z+=GROUND_SCALE*(-scout.heading.x*x+scout.heading.z*z);
  if(!groundPass(groundMapX(p.x),groundMapY(p.z),'air'))p.copy(scout.pos);
  const f=makeFleet(scout.team,{groundKind:'drone',name:r.name,pos:[p.x,p.z],n:1,scale:GROUND_MODELS.drone.size,band:'low',
    groundPlatoons:1,stance:'evade',side:scout.side});
  f.groundDrone={scout,slot,npc,expires:gameSec+r.batterySec,mission:null,damaged:false};
  f.heading.copy(scout.heading);
  slot.stock=0;slot.drone=f;fleets.push(f);groundInitUnit(f);
  groundDroneStats[f.team].launched++;
  return f;
}
function groundDroneRemove(f,landed=false){
  const {slot}=f.groundDrone,r=groundDroneRules();
  if(landed)slot.stock+=groundAliveBodies(f);
  // 充電と欠けた機体の補充を同時に進める。
  if(landed)slot.ready=gameSec+r.chargeSec;
  slot.drone=null;
  f.alive=false;f.ships.length=0;f.el.remove();dropArrow(f.arrow);unselect(f);
  f.groundModel?.userData.geometries?.forEach(g=>g.dispose());
  f.groundModel?.userData.material?.dispose();
  for(const obj of [f.groundModel,f.groundSelection,f.groundDrone.fiber]){
    if(!obj)continue;
    obj.parent?.remove(obj);
    if(obj!==f.groundModel)obj.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
  for(const other of fleets)other.groundBodyTargets?.delete(f);
  // 除去はループの末尾。途中で撃墜しても次の隊の処理を飛ばさない。
}
function groundDroneLose(f,body,shotDown){
  if(!body?.alive)return;
  if(shotDown)f.groundDrone.damaged=true;
  groundBodyHit(f,body,body.hp,shotDown);
  if(shotDown)groundDroneStats[f.team].shotDown++;
  if(!groundAliveBodies(f))groundDroneRemove(f);
}
function groundDroneReceiveShot(f,src,body,weapon){
  const r=groundDroneRules(),effective=src.groundKind==='mobileAA'||weapon?.air;
  if(Math.random()<(effective?r.aaHit:r.otherHit))groundDroneLose(f,body||f.bodies.find(b=>b.alive),true);
}
function groundDroneReplenish(scout,dt){
  if(!scout.groundDroneSlots)return;
  const r=groundDroneRules();
  const slot=scout.groundDroneSlots.find(s=>groundDroneMissing(s)>0&&groundDroneSlotAlive(scout,s));
  if(!slot||!groundDroneCanRefill(scout)){scout.groundDroneRefill=0;return;}
  scout.groundDroneRefill=(scout.groundDroneRefill||0)+dt;
  if(scout.groundDroneRefill+1e-8<r.replenishSec)return;
  scout.groundDroneRefill=0;slot.stock++;
  groundSupplySpend(scout,groundSupplyRules().shot);
}
function groundDroneRecall(f){
  groundClearOrders(f);
  f.groundDrone.mission={type:'recall'};
}
function groundDroneTarget(f,t,seen=true){
  return t?.alive&&t.team!==f.team&&!t.embarked&&!groundAbsent(t)&&!groundScriptDescending(t)&&
    (t.band==='ground'||t.band==='sea'||groundWasCruising(t))&&(!seen||groundSeenBy(f.team,t));
}
function groundDroneDive(f,target){
  if(!groundDroneTarget(f,target))return false;
  groundClearOrders(f);
  const r=groundDroneRules(),origin=f.pos.clone(),yaw=Math.atan2(f.heading.x,f.heading.z);
  const frames=f.bodies.filter(body=>body.alive).map((body,i)=>({
    body,at:gameSec+i*r.diveInterval,pos:origin.clone(),yaw,pitch:0,dropping:false
  }));
  f.groundDrone.mission={type:'dive',target,point:target.pos.clone(),origin,frames};
  return true;
}
function groundDroneOrbit(f,point){
  groundClearOrders(f);
  f.groundDrone.mission={type:'orbit',point:point.clone(),angle:null};
}
function groundDroneClamp(scout,p){
  const r=groundDroneRules().rangeKm*GROUND_SCALE,d=groundDistanceTo(scout,{pos:p});
  if(d<=r)return p.clone();
  const q=scout.pos.clone().lerp(p,r/d);q.y=p.y;
  return q;
}
function groundDroneOnBoard(p){return groundPass(groundMapX(p.x),groundMapY(p.z),'air');}
function groundDroneMove(f,point,distance){
  const scout=f.groundDrone.scout,goal=groundDroneClamp(scout,point),start=f.pos.clone();
  const d=groundDistanceTo(f,{pos:goal}),end=d<=distance?goal:start.clone().lerp(goal,distance/d);
  const p=groundDroneClamp(scout,end);
  if(groundDroneOnBoard(p)){
    if(Math.hypot(p.x-start.x,p.z-start.z)>1e-8)f.heading.set(p.x-start.x,0,p.z-start.z).normalize();
    f.pos.copy(p);
  }else if(!groundDroneOnBoard(start)||groundDistanceTo(scout,{pos:start})>groundDroneRules().rangeKm*GROUND_SCALE){
    // 盤の角をまたいで母隊が動いたときは、有効な側へ引き戻す。
    f.pos.copy(scout.pos);
  }
  f.pos.y=groundUnitHeight(f);
  return d<=distance;
}
function groundDroneMoveOrder(f,o){
  const dest=groundDroneClamp(f.groundDrone.scout,o.dest);
  if(!groundDroneOnBoard(dest))return;
  f.groundDrone.npc=false;
  f.groundDrone.mission=null;
  dropArrow(f.arrow);f.arrow=null;
  f.order={type:'move',dest,via:o.via||[],path:null};
}
function groundDroneFlyOrder(f,travel){
  const o=f.order;
  if(!o){groundDroneMove(f,f.pos,0);return;}
  const point=o.via[0]||o.dest;
  if(!groundDroneMove(f,point,travel))return;
  if(o.via.length){o.via=o.via.slice(1);return;}
  f.order=null;nextOrder(f);
}
function groundDroneOrbitStep(f,m,travel){
  const scout=f.groundDrone.scout,r=groundDroneRules(),radius=r.orbitKm*GROUND_SCALE;
  // 円全体が届く範囲に収まるように、端では中心を半径ぶん内側に寄せる。
  const distance=groundDistanceTo(scout,{pos:m.point}),limit=r.rangeKm*GROUND_SCALE-radius;
  const center=distance>limit?scout.pos.clone().lerp(m.point,limit/distance):m.point;
  const angle=m.angle??Math.atan2(f.pos.z-center.z,f.pos.x-center.x);
  const p=center.clone().add(new THREE.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius));
  if(groundDroneMove(f,p,travel))m.angle=angle+travel/radius;
}
// 到着したときは同じステップの残りの移動量を次の区間に渡す。
function groundDroneDiveMove(frame,scout,waypoint,travel){
  const goal=groundDroneClamp(scout,waypoint),distance=frame.pos.distanceTo(goal);
  const next=distance<=travel?goal:frame.pos.clone().lerp(goal,travel/distance);
  const pos=groundDroneClamp(scout,next);
  if(!groundDroneOnBoard(pos))return null;
  pos.y=Math.max(pos.y,groundHeight(pos.x,pos.z));
  const dx=pos.x-frame.pos.x,dz=pos.z-frame.pos.z,dy=pos.y-frame.pos.y,horizontal=Math.hypot(dx,dz);
  if(horizontal>1e-8)frame.yaw=Math.atan2(dx,dz);
  if(horizontal>1e-8||Math.abs(dy)>1e-8)frame.pitch=Math.atan2(-dy,horizontal);
  frame.pos.copy(pos);
  return distance<=travel&&pos.distanceToSquared(waypoint)<1e-12?travel-distance:null;
}
function groundDroneDiveImpact(f,target,body){
  const d=f.groundDrone;
  if(groundDroneTarget(f,target,false)){
    const weapon=groundDirectWeapon(f,target);
    d.impact=target;
    const i=target.bodies?.findIndex(b=>b.alive)??-1;
    const at=i<0?target.pos:groundBodyPosition(target,i);
    try{damage(target,weapon.power,f,null,target.bodies?.[i],weapon);}finally{d.impact=null;}
    groundDroneStats[f.team].hits++;
    groundVisualLoss(target,at);
  }
  groundDroneLose(f,body,false);
}
function groundDroneDiveStep(f,m,dt){
  const r=groundDroneRules(),scout=f.groundDrone.scout,speed=r.speedKmPerSecond*GROUND_SCALE;
  if(groundDroneTarget(f,m.target,false))m.point.copy(m.target.pos);
  const distance=groundDistanceTo({pos:m.origin},{pos:m.point});
  const turn=m.point.clone().lerp(m.origin,Math.min(.5,r.diveOffsetKm*GROUND_SCALE/distance));
  turn.y=Math.max(m.point.y,groundHeight(turn.x,turn.z))+r.diveHeightKm*GROUND_SCALE;
  for(const frame of m.frames){
    if(!frame.body.alive||gameSec<=frame.at)continue;
    let travel=Math.min(dt,gameSec-frame.at)*speed;
    if(!frame.dropping){
      travel=groundDroneDiveMove(frame,scout,turn,travel);
      if(travel===null)continue;
      frame.dropping=true;
    }
    if(groundDroneDiveMove(frame,scout,m.point,travel)!==null){
      f.pos.copy(frame.pos);
      groundDroneDiveImpact(f,m.target,frame.body);
    }
  }
  // 射撃・視界・命令の代表点は先頭の生き残った機体。
  const lead=m.frames.find(frame=>frame.body.alive);
  if(lead){
    f.pos.copy(lead.pos);
    f.heading.set(Math.sin(lead.yaw),0,Math.cos(lead.yaw));
  }
}
function groundDroneStep(dt){
  for(const f of fleets){
    if(!f.alive)continue;
    if(f.groundKind==='scout'){groundDroneReplenish(f,dt);continue;}
    if(!f.groundDrone)continue;
    const d=f.groundDrone,r=groundDroneRules(),scout=d.scout;
    if(!groundDroneSlotAlive(scout,d.slot)||scout.embarked){groundDroneRemove(f);continue;}
    const speed=r.speedKmPerSecond*GROUND_SCALE,travel=speed*dt;
    const distance=groundDistanceTo(f,scout),left=d.expires-gameSec;
    const m=d.mission,diving=m?.type==='dive'&&groundDroneTarget(f,m.target,false);
    const targetDist=diving?groundDistanceTo(f,m.target):Infinity;
    // 自爆の終盤（6km以内・中間点以降・降下中）は被弾・命中後も突入を続け、序盤で撃たれたときは残機を回収する。
    const committed=d.npc&&diving&&(m.frames.some(frame=>frame.dropping)||targetDist<=6*GROUND_SCALE||targetDist<=distance);
    const reserve=d.npc&&!committed?10:0;
    const finishDive=committed&&m.frames.every(frame=>!frame.body.alive||left>
      Math.max(0,frame.at-gameSec)+frame.pos.distanceTo(m.target.pos)/speed+r.diveHeightKm/r.speedKmPerSecond+2*dt);
    if(d.mission?.type!=='recall'&&(!finishDive&&left<=distance/speed+2*dt+reserve||
      d.npc&&d.damaged&&!committed))groundDroneRecall(f);
    if(d.mission?.type==='recall'){
      if(groundDroneMove(f,scout.pos,travel))groundDroneRemove(f,true);
      else if(left<=0)groundDroneRemove(f);
    }else if(d.mission?.type==='orbit')groundDroneOrbitStep(f,d.mission,travel);
    else if(d.mission?.type==='dive')groundDroneDiveStep(f,d.mission,dt);
    else groundDroneFlyOrder(f,travel);
  }
}
function groundDroneCleanup(){
  for(let i=fleets.length-1;i>=0;i--){
    const f=fleets[i],d=f.groundDrone;if(!d)continue;
    if(f.alive&&!groundDroneSlotAlive(d.scout,d.slot))groundDroneRemove(f);
    if(!f.alive)fleets.splice(i,1);
  }
}
function groundDroneNpcThreatRange(f){
  if(f.groundKind==='sea')return 0;
  const ranges=groundFireRanges(f);
  const air=['fighter','attack'].includes(f.groundKind)?ranges.air||0:0;
  const direct=!air&&groundFireFactor(f,{groundKind:'drone',band:'low'},false)>0?ranges.direct||0:0;
  return Math.max(groundAARange(f),air,direct);
}
function groundDroneNpcUnitDefense(f,at,isTarget){
  if(f.groundKind==='sea'||f.groundRout||f.groundMorale===0)return 0;
  const bodies=groundAliveBodies(f),ranges=groundFireRanges(f);
  const aaRange=groundAARange(f),directRange=f.stance==='evade'||groundFireFactor(f,{groundKind:'drone',band:'low'},false)<=0?0:ranges.direct||0;
  const dist=isTarget?0:groundDistanceTo(f,{pos:at});
  const engaged=!!(f.fireTarget?.alive&&!f.fireTarget.groundDrone);
  const hover=isTarget?.5:0;
  // 交戦中の隊も飛行中に手が空くことがあるため、目標本体の直射は一部を見込む。
  const directScale=engaged?(isTarget?.35:0):1;
  const directKm=directRange>dist?((directRange-dist)/GROUND_SCALE+hover)*directScale:0;
  const aaKm=aaRange>dist?(aaRange-dist)/GROUND_SCALE+hover:0;
  const aaWeight=f.groundKind==='mobileAA'||(f.weapons??groundRuleSet().unitTypes[f.groundKind]?.weapons)?.some(w=>w.air)?4:1;
  return bodies*(directKm+aaKm*aaWeight);
}
function groundDroneNpcDefense(t,enemies=[]){
  let score=groundDroneNpcUnitDefense(t,t.pos,true);
  for(const e of enemies)if(e!==t)score+=groundDroneNpcUnitDefense(e,t.pos,false);
  return score;
}
function groundDroneNpcSegmentClear(a,b,hazards){
  const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
  for(const h of hazards){
    if(h.f.pos===b)continue;
    const u=len2>1e-8?Math.max(0,Math.min(1,((h.f.pos.x-a.x)*dx+(h.f.pos.z-a.z)*dz)/len2)):0;
    if(Math.hypot(a.x+dx*u-h.f.pos.x,a.z+dz*u-h.f.pos.z)<=h.range)return false;
  }
  return true;
}
function groundDroneNpcContacts(scout){
  const r=groundDroneRules(),visible=fleets.filter(t=>groundDroneTarget(scout,t));
  const aa=[],fire=[];
  for(const f of fleets){
    if(f.team===scout.team||!f.alive||f.embarked||groundAbsent(f)||!groundSeenBy(scout.team,f))continue;
    const hardAA=f.groundKind==='mobileAA'||f.groundKind==='heavyInfantry'||f.groundKind==='fighter'||
      (f.weapons??groundRuleSet().unitTypes[f.groundKind]?.weapons)?.some(w=>w.air);
    if(hardAA){
      const range=groundAARange(f)||groundFireRanges(f).air;
      if(range>0)aa.push({f,range});
    }
    const threat=f.stance==='evade'?groundAARange(f):groundDroneNpcThreatRange(f);
    if(threat>0&&f.groundKind!=='sea'&&!f.groundRout&&f.groundMorale!==0)fire.push({f,range:threat});
  }
  const safe=(pos,margin=0)=>aa.every(a=>groundDistanceTo({pos},a.f)>a.range+margin);
  const orbitSafe=(pos,margin=0)=>safe(pos,margin)&&fire.every(e=>groundDistanceTo({pos},e.f)>e.range+margin+.15*GROUND_SCALE);
  visible.sort((a,b)=>groundDistanceTo(scout,a)-groundDistanceTo(scout,b));
  const targets=visible.filter(t=>r.npcTargets.includes(t.groundKind)&&safe(t.pos));
  targets.sort((a,b)=>{
    const clearA=groundDroneNpcSegmentClear(scout.pos,a.pos,aa)?(groundDroneNpcSegmentClear(scout.pos,a.pos,fire)?0:1):2;
    const clearB=groundDroneNpcSegmentClear(scout.pos,b.pos,aa)?(groundDroneNpcSegmentClear(scout.pos,b.pos,fire)?0:1):2;
    if(clearA!==clearB)return clearA-clearB;
    const defA=groundDroneNpcDefense(a,visible),defB=groundDroneNpcDefense(b,visible);
    if(defA!==defB)return defA-defB;
    return groundDistanceTo(scout,a)-groundDistanceTo(scout,b);
  });
  return {visible,targets,safe,orbitSafe,aa,fire};
}
function groundDroneNpcOrbitPoint(scout,contacts,point){
  const r=groundDroneRules(),range=r.rangeKm*GROUND_SCALE,orbitR=r.orbitKm*GROUND_SCALE,sightR=r.sightKm*GROUND_SCALE;
  const inRange=pos=>groundDistanceTo(scout,{pos})<=range;
  const ok=pos=>inRange(pos)&&contacts.orbitSafe(pos,orbitR);
  const standoff=(targetPos,fireRange)=>{
    const need=fireRange+orbitR+.2*GROUND_SCALE;
    if(need+orbitR>sightR)return null;
    const dist=groundDistanceTo(scout,{pos:targetPos});
    if(dist<=1e-8)return null;
    const p=targetPos.clone().lerp(scout.pos,Math.min(1,need/dist));
    return ok(p)&&groundDroneOnBoard(p)?p:null;
  };
  for(const t of contacts.visible){
    const fireRange=t.groundRout||t.groundMorale===0?0:t.stance==='evade'?groundAARange(t):groundDroneNpcThreatRange(t);
    const p=fireRange>0?standoff(t.pos,fireRange):(ok(t.pos)?t.pos:null);
    if(p)return p;
  }
  if(point&&ok(point))return point;
  if(point){
    const p=standoff(point,0);
    if(p)return p;
  }
  return null;
}
function groundDroneNpc(scout,contacts,point=null){
  if(!groundDroneControllerReady(scout)||scout.stance==='evade'||npcAutoPlayerUnit(scout))return;
  const r=groundDroneRules(),slots=groundDroneSlots(scout),range=r.rangeKm*GROUND_SCALE;
  const info=contacts??groundDroneNpcContacts(scout),{visible,targets,safe}=info;
  const inRange=pos=>groundDistanceTo(scout,{pos})<=range;
  const stock=groundDroneStock(scout),maxFrames=stock.max*r.airframes;
  // 想定撃墜数が手持ち全機を上回る非交戦の密集戦車などには突入せず、交戦中や孤立した目標を待つ。
  const viable=t=>inRange(t.pos)&&groundDroneNpcDefense(t,visible)*r.otherHit<=Math.max(r.airframes,maxFrames*.55);
  const target=targets.find(viable);
  const sight=groundDroneNpcOrbitPoint(scout,info,point);
  let flying=false;
  const activeDives=[];
  for(const slot of slots){
    const f=slot.drone,d=f?.groundDrone,m=d?.mission;
    if(!d?.npc||m?.type==='recall')continue;
    flying=true;
    if(m?.type==='dive'&&groundDroneTarget(f,m.target,false)&&inRange(m.target.pos)&&safe(m.target.pos)){
      activeDives.push(f);continue;
    }
    if(target){groundDroneDive(f,target);activeDives.push(f);continue;}
    if(!sight){groundDroneRecall(f);continue;}
    if(m?.type!=='orbit'||!info.orbitSafe(m.point,r.orbitKm*GROUND_SCALE)||!inRange(m.point)||
      groundDistanceTo({pos:m.point},{pos:sight})>r.orbitKm*GROUND_SCALE)groundDroneOrbit(f,sight);
  }
  // 偵察は一枠ずつ。自爆は相手の対空・直射火力に応じて複数枠を同時に突入させる。
  if(scout.order)return;
  if(target){
    const defense=groundDroneNpcDefense(target,visible),expectedKills=defense*r.otherHit;
    const need=expectedKills<=0?1:Math.max(1,Math.min(stock.max,Math.ceil((expectedKills+r.airframes+.1)/r.airframes)));
    const ready=stock.ready.length;
    const attacking=activeDives.filter(f=>f.groundDrone.mission?.target===target).length;
    if(need>1&&attacking+ready<need)return;
    const launchCount=attacking?Math.max(0,need-attacking):need;
    for(let i=0;i<launchCount;i++){
      const f=groundDroneLaunch(scout,true);
      if(!f)break;
      groundDroneDive(f,target);
    }
    return;
  }
  if(!sight||flying)return;
  const f=groundDroneLaunch(scout,true);
  if(f)groundDroneOrbit(f,sight);
}
function groundDroneDraw(f,picked){
  const d=f.groundDrone,model=f.groundModel;
  if(!f.alive)return;
  const {spec,bodies}=model.userData.formation;
  bodies.forEach((body,i)=>{
    const [x,z]=spec.offsets[i];body.position.set(x*spec.size,0,z*spec.size);
    body.rotation.set(0,0,0);
  });
  for(const frame of d.mission?.frames??[]){
    const body=bodies[f.bodies.indexOf(frame.body)];
    body.position.copy(frame.pos).sub(f.pos).applyAxisAngle(groundFxUp,-model.rotation.y);
    body.rotation.set(frame.pitch,frame.yaw-model.rotation.y,0,'YXZ');
  }
  const show=model.visible&&(picked.includes(f)||picked.includes(d.scout));
  if(!show){if(d.fiber)d.fiber.visible=false;return;}
  if(!d.fiber){
    d.fiber=new THREE.Group();groundVisuals.add(d.fiber);
    // .45、24分割、.12 のたるみと青の色は承認済みの見本。赤は陣営色を同じ方向へ明るくする（仮の補間率）。
    const color=f.team===0?0x9fc4ff:TEAM_COL[f.team].clone().lerp(new THREE.Color(0xffffff),.25);
    for(const b of f.bodies){
      const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(25*3),3));
      const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.45}));
      line.frustumCulled=false;d.fiber.add(line);
    }
  }
  d.fiber.visible=true;
  const index=d.scout.bodies.findIndex(b=>b.alive),from=groundBodyPosition(d.scout,index);from.y+=.12;
  d.fiber.children.forEach((line,i)=>{
    line.visible=f.bodies[i].alive;if(!line.visible)return;
    const to=bodies[i].position.clone().applyAxisAngle(groundFxUp,model.rotation.y).add(f.pos);
    const position=line.geometry.attributes.position;
    for(let k=0;k<position.count;k++){
      const t=k/(position.count-1),p=from.clone().lerp(to,t);p.y-=Math.sin(Math.PI*t)*.12;
      position.setXYZ(k,p.x,p.y,p.z);
    }
    position.needsUpdate=true;
  });
}
function groundDroneHud(list){
  const f=list.length===1?list[0]:null,scout=f?.groundKind==='scout',drone=!!f?.groundDrone;
  const control=document.getElementById('groundDroneLaunchControl');
  control.hidden=!scout;
  if(scout){
    const stock=groundDroneStock(f),count=document.getElementById('groundDroneCount');
    count.textContent=stock.ready.length+'/'+stock.max;count.classList.toggle('empty',!stock.ready.length);
    document.getElementById('groundDroneLaunch').disabled=over||deploying||!stock.ready.length||!groundDroneControllerReady(f);
  }
  for(const [id,mode] of [['groundDroneRecall','recall'],['groundDroneDive','dive'],['groundDroneOrbit','orbit']]){
    const button=document.getElementById(id);
    button.disabled=!drone||over||deploying||f.groundDrone.mission?.type==='recall';
    if(mode!=='recall')button.setAttribute('aria-pressed',String(groundWorkAiming===mode));
  }
  return {launch:scout,recall:drone,dive:drone,orbit:drone};
}
function groundDroneStatus(f){
  const m=f?.groundDrone?.mission;
  if(m?.type==='orbit')return m.angle===null?'旋回偵察地点へ移動中':'旋回偵察中';
  if(m?.type==='dive')return '自爆目標：'+m.target.name;
  if(m?.type==='recall')return '帰還中';
  return '';
}
function groundDroneTap(point,target){
  const list=orderTargets(),f=list.length===1?list[0]:null;
  const done=f?.groundDrone&&(groundWorkAiming==='dive'?groundDroneDive(f,target):point&&(groundDroneOrbit(f,point),true));
  if(done){f.groundDrone.npc=false;groundClearAiming();groundHud();}
}
document.getElementById('groundDroneLaunch').addEventListener('click',()=>{
  const list=orderTargets();
  if(list.length===1&&groundDroneLaunch(list[0])){groundClearAiming();groundUpdateSight();groundHud();updateRoster();}
});
document.getElementById('groundDroneRecall').addEventListener('click',()=>{
  const f=orderTargets()[0];if(!f?.groundDrone||over||deploying)return;
  f.groundDrone.npc=false;groundDroneRecall(f);groundClearAiming();groundHud();
});
for(const [id,mode] of [['groundDroneDive','dive'],['groundDroneOrbit','orbit']]){
  document.getElementById(id).addEventListener('click',()=>{
    if(over||deploying||!orderTargets()[0]?.groundDrone)return;
    const active=groundWorkAiming===mode;
    groundClearAiming();groundWorkAiming=active?null:mode;groundHud();
  });
}
