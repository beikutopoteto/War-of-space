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
  return {max:slots.length,ready:slots.filter(slot=>!slot.drone&&slot.stock===rules.airframes&&gameSec>=slot.ready)};
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
  f.groundDrone={scout,slot,npc,expires:gameSec+r.batterySec,mission:null,dive:null};
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
  const slot=scout.groundDroneSlots.find(s=>s.stock+(s.drone?groundAliveBodies(s.drone):0)<r.airframes&&groundDroneSlotAlive(scout,s));
  const enough=groundSupplyActive()&&scout.groundSupply>=groundSupplyUnitMax(scout)*r.replenishSupply;
  if(!slot||!enough){scout.groundDroneRefill=0;return;}
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
  f.groundDrone.mission={type:'dive',target,point:target.pos.clone(),next:gameSec};
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
  f.groundDrone.mission=f.groundDrone.dive=null;
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
function groundDroneDiveStep(f,m,travel){
  const d=f.groundDrone,r=groundDroneRules(),target=m.target,valid=groundDroneTarget(f,target,false);
  if(valid)m.point.copy(target.pos);
  if(!groundDroneMove(f,m.point,travel)||groundDistanceTo(f,{pos:m.point})>1e-8){d.dive=null;return;}
  if(d.dive&&!d.dive.body.alive)d.dive=null;
  if(!d.dive&&gameSec>=m.next){
    d.dive={body:f.bodies.find(b=>b.alive),at:gameSec};
    m.next=gameSec+r.diveInterval;
  }
  if(!d.dive||gameSec-d.dive.at+1e-8<r.heightKm/r.speedKmPerSecond)return;
  const {body}=d.dive;
  if(valid){
    const weapon=groundDirectWeapon(f,target);
    d.impact=target;
    const i=target.bodies?.findIndex(b=>b.alive)??-1;
    const at=i<0?target.pos:groundBodyPosition(target,i);
    try{damage(target,weapon.power,f,null,target.bodies?.[i],weapon);}finally{d.impact=null;}
    groundDroneStats[f.team].hits++;
    groundVisualLoss(target,at);
  }
  d.dive=null;
  groundDroneLose(f,body,false);
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
    if(d.mission?.type!=='recall'&&left<=distance/speed+2*dt)groundDroneRecall(f);
    if(d.mission?.type==='recall'){
      if(groundDroneMove(f,scout.pos,travel))groundDroneRemove(f,true);
      else if(left<=0)groundDroneRemove(f);
    }else if(d.mission?.type==='orbit')groundDroneOrbitStep(f,d.mission,travel);
    else if(d.mission?.type==='dive')groundDroneDiveStep(f,d.mission,travel);
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
function groundDroneNpc(scout){
  if(!groundDroneControllerReady(scout)||scout.stance==='evade'||npcAutoPlayerUnit(scout))return;
  const r=groundDroneRules(),slots=groundDroneSlots(scout);
  const visible=fleets.filter(t=>groundDroneTarget(scout,t));
  const nearest=(list)=>list.reduce((a,b)=>!a||groundDistanceTo(scout,b)<groundDistanceTo(scout,a)?b:a,null);
  const target=nearest(visible.filter(t=>r.npcTargets.includes(t.groundKind)&&groundDistanceTo(scout,t)<=r.rangeKm*GROUND_SCALE));
  const sight=target||nearest(visible);
  if(!sight)return;
  const launched=groundDroneLaunch(scout,true);
  for(const slot of slots){
    const f=slot.drone,m=f?.groundDrone.mission;
    if(!f?.groundDrone.npc||m?.type==='recall'||m?.type==='dive')continue;
    if(target&&f!==launched){groundDroneDive(f,target);continue;}
    if(!m||m.point.distanceToSquared(sight.pos)>(r.orbitKm*GROUND_SCALE)**2)groundDroneOrbit(f,sight.pos);
  }
}
function groundDroneDraw(f,picked){
  const d=f.groundDrone,model=f.groundModel;
  if(!f.alive)return;
  const {spec,bodies}=model.userData.formation;
  bodies.forEach((body,i)=>{
    const [x,z]=spec.offsets[i];body.position.set(x*spec.size,0,z*spec.size);
    body.rotation.set(0,0,0);
  });
  if(d.dive){
    const r=groundDroneRules(),i=f.bodies.indexOf(d.dive.body),body=bodies[i];
    const progress=Math.min(1,(gameSec-d.dive.at)/(r.heightKm/r.speedKmPerSecond));
    const t=d.mission.target,iTarget=t.bodies?.findIndex(b=>b.alive)??-1;
    const at=groundDroneTarget(f,t,false)&&iTarget>=0?groundBodyPosition(t,iTarget):d.mission.point;
    const p=at.clone().sub(f.pos).applyAxisAngle(groundFxUp,-model.rotation.y);
    body.position.lerp(p,progress);
    body.rotation.x=Math.atan2(f.pos.y-d.mission.point.y,Math.hypot(body.position.x-p.x,body.position.z-p.z));
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
