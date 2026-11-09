/* 地上専用の乗降・工兵の仮設橋。宇宙の揚陸艇・carrier は使わない。 */
let groundBridges=[], groundBridgeRevision=0, groundWorkAiming=null, groundTransportMessage='';
function groundTransportRules(){return WOS_TERRAIN[op.ground].transport;}
function groundEngineeringRules(){return WOS_TERRAIN[op.ground].engineering;}
function groundLandingRules(){return WOS_TERRAIN[op.ground].landing;}
function groundLandingShip(f){return !!f&&f.groundKind==='sea'&&f.groundLanding===true;}
function groundShipBoardable(f){return !!f&&f.alive&&!f.embarked&&!f.locked&&groundCommandAllowed(f,'board')&&f.band==='ground'&&!f.bandTo&&!f.groundPassenger&&f.groundKind!=='sea';}
function groundCanBoardAny(f){return groundBoardable(f)||groundShipBoardable(f);}
function groundPassengers(f){return groundLandingShip(f)?f.groundPassengers||[]:f.groundPassenger?[f.groundPassenger]:[];}
// 固定の搭載中隊は通常の出撃編成に足す。宇宙の carrier / 揚陸艇は参照しない。
function groundSeaDeploy(){
  const ships=(op.groundSea||[]).map(s=>makeFleet(s.team,s)),cargo=[];
  for(const ship of ships)if(groundLandingShip(ship)){
    if((ship.groundCargo||[]).length>groundLandingRules().capacity)throw new Error('揚陸艦の初期搭載数が上限を超えている');
    ship.groundPassengers=[];
    for(const spec of ship.groundCargo||[]){
      const f=makeFleet(ship.team,{...spec,pos:[ship.pos.x,ship.pos.z],groundFixed:true});
      f.band=f.band||'ground';
      if(!groundShipBoardable(f))throw new Error('揚陸艦には地上の中隊だけを初期搭載できる');
      ship.groundPassengers.push(f);cargo.push(f);
    }
  }
  fleets.push(...cargo,...ships);
}
function groundTransportInit(){
  for(const ship of fleets)if(groundLandingShip(ship))for(const f of groundPassengers(ship)){
    groundCancelWork(f);groundClearOrders(f);f.embarked=ship;
  }
  groundTransportSync();
}
// 海面のセルと隣接8セルだけを見る。遠い浜・池・盤外への飛び降りは認めない。
function groundCoastCells(ship,kind='infantry'){
  const cell=WOS_TERRAIN[op.ground].meta.cellKm,x=ship.pos.x/GROUND_SCALE+24,y=18-ship.pos.z/GROUND_SCALE;
  if(!groundPass(x,y,'sea'))return [];
  const col=Math.floor(x/cell),row=Math.floor(y/cell);
  if(!groundPass((col+.5)*cell,(row+.5)*cell,'sea'))return [];
  const points=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
    const xx=(col+dx+.5)*cell,yy=(row+dy+.5)*cell;
    if(groundPass(xx,yy,kind))points.push(groundPoint(xx,yy));
  }
  return points;
}
function groundShipBoardPath(f,ship){
  let best=null;
  for(const p of groundCoastCells(ship,groundMoveKind(f))){
    const path=groundPath(f.pos,p,groundMoveKind(f));
    if(path&&(!best||path.cost<best.cost))best=path;
  }
  return best;
}
function groundLandPlan(ship){
  if(!groundCoastCells(ship).length)return {reason:'海岸ではない（陸に接する海のマスへ移動）'};
  const plans=[];
  for(const f of groundPassengers(ship)){
    const cells=groundCoastCells(ship,groundMoveKind(f)),pos=cells.find(p=>!plans.some(plan=>plan.pos.equals(p)))||cells[0];
    if(!pos)return {reason:'搭載中隊が通れる浜がない'};
    plans.push({f,pos});
  }
  return {plans};
}
function groundLandingDropVisual(f){if(f.groundLandingVisual){f.groundLandingVisual.remove();f.groundLandingVisual=null;}}
function groundLandCommand(list){
  let count=0,reason='搭載部隊のいる揚陸艦を選択';
  for(const ship of new Set(list.map(f=>f.embarked||f))){
    if(!groundLandingShip(ship)||!ship.alive||ship.locked||!groundPassengers(ship).length)continue;
    if(ship.groundUnloading){reason='すでに上陸中';continue;}
    const plan=groundLandPlan(ship);
    if(plan.reason){reason=plan.reason;continue;}
    groundCancelWork(ship);groundClearOrders(ship);
    for(const f of ship.groundBoarders||[])groundClearOrders(f);
    ship.groundBoarders=[];ship.groundUnloading={progress:0};count++;
    if(op.groundDrill)groundDrillEvent('land',ship,groundPassengers(ship));
  }
  if(count)groundClearAiming();
  groundTransportMessage=count?`上陸開始（${groundLandingRules().seconds}秒・被弾${groundLandingRules().damageFactor}倍）`:'上陸不可：'+reason;
  groundHud();return count;
}
function groundLandStep(ship,dt){
  const work=ship.groundUnloading;if(!work)return;
  const plan=groundLandPlan(ship);
  if(plan.reason){groundCancelWork(ship);groundTransportMessage='上陸中止：'+plan.reason;return;}
  work.progress=Math.min(groundLandingRules().seconds,work.progress+dt);
  if(work.progress<groundLandingRules().seconds-1e-8)return;
  for(const {f,pos} of plan.plans){
    f.embarked=null;groundClearOrders(f);f.pos.copy(pos);f.pos.y=groundUnitHeight(f);
    f.post.copy(f.pos);f.home.copy(f.pos);for(const s of f.ships)s.pos.copy(f.pos);
  }
  ship.groundPassengers=[];ship.groundUnloading=null;groundLandingDropVisual(ship);groundTransportMessage='上陸完了';
}
function groundBoardable(f){return !!f&&f.alive&&!f.embarked&&!f.locked&&groundCommandAllowed(f,'board')&&f.band==='ground'&&['infantry','heavyInfantry','commando'].includes(f.groundKind);}
function groundTransportLabel(f){const passengers=groundPassengers(f);return f.name+(passengers.length?' / 搭載：'+passengers.map(p=>p.name).join('・'):'')+(groundPermissionOnly(f)?' / 許可制':'')+(f.groundRout||f.groundAirState||f.groundSupplyGiving?' / '+groundSupplyStatus(f):'');}
function groundClearOrders(f){f.groundPlan=null;dropArrow(f.arrow);f.arrow=null;f.order=null;f.queue=[];f.fireTarget=null;f.strike=null;f.groundGiving=null;}
function groundCancelWork(f){
  if(f.order&&f.order.type==='board'&&f.order.target.groundBoarder===f)f.order.target.groundBoarder=null;
  if(f.order&&f.order.type==='board'&&groundLandingShip(f.order.target))f.order.target.groundBoarders=(f.order.target.groundBoarders||[]).filter(p=>p!==f);
  f.groundUnloading=null;groundLandingDropVisual(f);
  for(const b of groundBridges.filter(b=>b.builder===f&&!b.complete))groundBridgeRemove(b);
  f.groundBuilding=false;
}
function groundBoardCommand(list,carrier){
  const f=list.length===1?list[0]:null;
  if(groundLandingShip(carrier)){
    const reserved=(carrier.groundBoarders||[]).filter(p=>p!==f);
    let reason;
    if(!groundShipBoardable(f)||!carrier.alive||carrier.locked||carrier.team!==f.team)reason='地上の1中隊と味方の揚陸艦を指定';
    else if(carrier.groundUnloading)reason='上陸中';
    else if(groundPassengers(carrier).length+reserved.length>=groundLandingRules().capacity)reason=`搭載上限${groundLandingRules().capacity}中隊（予約を含む）`;
    else if(!groundCoastCells(carrier,groundMoveKind(f)).length)reason='岸に接していないか、この中隊が通れる浜がない';
    const path=reason?null:groundShipBoardPath(f,carrier);
    if(!reason&&!path)reason='浜まで通れる道がない';
    if(reason){groundTransportMessage='乗艦不可：'+reason;groundHud();return false;}
    groundCancelWork(f);groundClearOrders(f);carrier.groundBoarders=[...reserved,f];
    f.order={type:'board',target:carrier,path,repath:groundTransportRules().repathSec};groundClearAiming();groundTransportMessage='乗艦する浜へ移動中';groundHud();return true;
  }
  if(!groundBoardable(f)||!carrier.alive||carrier.locked||carrier.groundKind!=='apc'||carrier.groundRout||carrier.team!==f.team||carrier.groundPassenger||carrier.groundBoarder&&carrier.groundBoarder!==f){
    groundTransportMessage='乗車不可：歩兵1中隊と空の味方輸送車を指定';groundHud();return false;
  }
  const path=groundPath(f.pos,carrier.pos,groundMoveKind(f));
  if(!path){groundTransportMessage='乗車不可：輸送車まで通れる道がない';groundHud();return false;}
  groundCancelWork(f);groundClearOrders(f);carrier.groundBoarder=f;
  f.order={type:'board',target:carrier,path,repath:0};if(op.groundDrill)groundDrillEvent('board',f,carrier);groundClearAiming();groundTransportMessage='輸送車へ移動中';groundHud();return true;
}
function groundExitPoint(f,carrier,emergency=false){
  const km=groundTransportRules().unloadKm,kind=groundMoveKind(f),x=carrier.pos.x/GROUND_SCALE+24,y=18-carrier.pos.z/GROUND_SCALE;
  // 隣接8方向。隣へ向かう辺も検査して海・池を飛び越えない。
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
    const length=Math.hypot(dx,dy),xx=x+dx/length*km,yy=y+dy/length*km;
    if([.25,.5,.75,1].every(t=>groundPass(x+(xx-x)*t,y+(yy-y)*t,kind)))return groundPoint(xx,yy);
  }
  if(!emergency)return null;
  // 撃破位置の周囲が塞がれても、最寄りの通行可能セルへ救出する。
  const d=WOS_TERRAIN[op.ground],cell=d.meta.cellKm;let best=null,distance=Infinity;
  for(let row=0;row<d.terrain.rows;row++)for(let col=0;col<d.terrain.cols;col++){
    const xx=(col+.5)*cell,yy=(row+.5)*cell,dist=Math.hypot(xx-x,yy-y);
    if(dist<distance&&groundPass(xx,yy,kind)){best=groundPoint(xx,yy);distance=dist;}
  }
  return best;
}
function groundUnload(carrier,emergency=false){
  if(groundLandingShip(carrier))return false; // 上陸の時計を迂回させない。
  const f=carrier.groundPassenger;if(!f)return false;
  const pos=groundExitPoint(f,carrier,emergency);if(!pos)return false;
  carrier.groundPassenger=null;f.embarked=null;groundClearOrders(f);f.pos.copy(pos);f.pos.y=groundUnitHeight(f);
  if(f.post)f.post.copy(f.pos);if(f.home)f.home.copy(f.pos);
  if(op.groundDrill&&!emergency)groundDrillEvent('unload',carrier,f);
  return true;
}
function groundUnloadCommand(list){
  let count=0;
  for(const carrier of new Set(list.map(f=>f.embarked||f)))if(carrier.alive&&groundCommandAllowed(carrier,'unload')&&groundUnload(carrier))count++;
  if(count)groundClearAiming();
  groundTransportMessage=count?`${count}中隊 降車`:'降車不可：搭載部隊か通れる隣接地がない';groundHud();return count;
}
function groundTransportDestroyed(f,src){
  groundCancelWork(f);
  if(f.embarked){
    const ship=f.embarked;
    if(groundLandingShip(ship))ship.groundPassengers=groundPassengers(ship).filter(p=>p!==f);
    else if(ship.groundPassenger===f)ship.groundPassenger=null;
    f.embarked=null;
  }
  if(groundLandingShip(f)){
    for(const p of f.groundBoarders||[])groundClearOrders(p);
    f.groundBoarders=[];
    const passengers=groundPassengers(f);f.groundPassengers=[];
    for(const p of passengers){p.embarked=null;groundClearOrders(p);p.hpPool=0;p.ships=[];destroyFleet(p,src);}
    return;
  }
  if(f.groundBoarder){groundClearOrders(f.groundBoarder);f.groundBoarder=null;}
  const passenger=f.groundPassenger;if(!passenger)return;
  groundUnload(f,true);
  passenger.hpPool=Math.max(0,passenger.hpPool-(passenger.groundMaxHp||passenger.n*passenger.hp)*groundTransportRules().wreckLoss);
  const want=Math.max(0,Math.ceil(passenger.hpPool/passenger.hp));
  while(passenger.ships.length>want){const s=passenger.ships.pop();burst(s.pos,TEAM_COL[passenger.team],16,7,.9);}
  if(!want)destroyFleet(passenger,src);
}
function groundTransportSync(){
  for(const f of fleets)if(f.embarked){f.pos.copy(f.embarked.pos);for(const s of f.ships)s.pos.copy(f.pos);}
}
function groundBuiltBridgeAt(x,y,river){
  return groundBridges.some(b=>b.complete&&b.hp>0&&b.river===river&&Math.abs((x-b.x)*b.tx+(y-b.y)*b.ty)<=b.laneHalfKm&&Math.abs(-(x-b.x)*b.ty+(y-b.y)*b.tx)<=b.halfSpanKm);
}
function groundBridgePlan(p){
  const d=WOS_TERRAIN[op.ground],x=p.x/GROUND_SCALE+24,y=18-p.z/GROUND_SCALE;
  if(!Number.isFinite(x)||!Number.isFinite(y)||!groundPass(x,y,'air'))return {reason:'盤の外には架けられない'};
  const rivers=d.water.rivers.map(r=>groundRiverAt(x,y,r)).filter(r=>r.dist<=r.width/2+.12).sort((a,b)=>a.dist-b.dist),r=rivers[0];
  if(!r)return {reason:'川の地点を指定'};
  if(r.width>d.water.engineerBridgeMaxWidthKm+1e-8)return {reason:`川幅 ${r.width.toFixed(2)} km：上限 ${d.water.engineerBridgeMaxWidthKm} km を超えるため架橋不可`};
  if(d.objects.bridges.some(b=>b.river===r.river&&Math.hypot(r.x-b.x,r.y-b.y)<.9)||groundBridges.some(b=>b.river===r.river&&Math.hypot(r.x-b.x,r.y-b.y)<b.laneHalfKm*2))return {reason:'この地点には橋があるか架橋中'};
  const rules=groundEngineeringRules(),halfSpanKm=r.width/2+rules.bankMarginKm+d.meta.cellKm;
  const banks=[-1,1].map(side=>groundPoint(r.x-side*r.ty*halfSpanKm,r.y+side*r.tx*halfSpanKm));
  if(!banks.every(p=>groundPass(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,'vehicle')))return {reason:'両岸に車両が通れる足場がない'};
  return {...r,pos:groundPoint(r.x,r.y),banks,halfSpanKm,laneHalfKm:rules.laneHalfKm};
}
function groundEngineer(f){return f&&f.alive&&!f.embarked&&!f.locked&&groundCommandAllowed(f,'bridge')&&f.groundKind==='engineer'&&f.band==='ground';}
function groundBridgeEnemy(b){return fleets.some(f=>f.alive&&!f.embarked&&f.band==='ground'&&f.team!==b.team&&groundDistanceTo(f,b)<=groundEngineeringRules().workRange);}
function groundBridgeCommand(list,p){
  const f=list.length===1?list[0]:null,plan=groundBridgePlan(p);
  let reason=plan.reason;
  if(!groundEngineer(f))reason='工兵1中隊を選択';
  if(!reason&&groundBridgeEnemy({...plan,team:f.team}))reason='建設位置に敵部隊がいる';
  let path=null;
  if(!reason){
    for(const bank of plan.banks){const candidate=groundPath(f.pos,bank,groundMoveKind(f));if(candidate&&(!path||candidate.cost<path.cost))path=candidate;}
    if(!path)reason='川岸まで通れる道がない';
  }
  if(reason){groundTransportMessage='架橋不可：'+reason;groundHud();return null;}
  groundCancelWork(f);groundClearOrders(f);
  const b={...plan,builder:f,team:f.team,progress:0,complete:false,hp:groundEngineeringRules().hp,visual:null};
  groundBridges.push(b);f.order={type:'bridge',bridge:b,path};groundClearAiming();groundTransportMessage='川岸へ移動中';groundHud();if(op.groundDrill)groundDrillEvent('bridge',f,b);return b;
}
function groundBridgeDropVisual(b){
  if(!b.visual)return;
  const {deck,el}=b.visual;if(deck.parent)deck.parent.remove(deck);deck.geometry.dispose();deck.material.dispose();el.remove();b.visual=null;
}
function groundBridgeRemove(b){
  if(b.builder&&b.builder.order&&b.builder.order.bridge===b){groundClearOrders(b.builder);b.builder.groundBuilding=false;}
  if(b.complete)groundBridgeRevision++;
  groundBridgeDropVisual(b);groundBridges=groundBridges.filter(x=>x!==b);
}
function groundBridgeHit(s){
  for(const b of [...groundBridges])if(b.complete&&groundDistanceTo(b,{pos:s.impact})<=s.radius){
    const falloff=1-(1-groundStrikeRules().edgeDamage)*groundDistanceTo(b,{pos:s.impact})/s.radius;
    b.hp=Math.max(0,b.hp-s.dmg*falloff);if(!b.hp)groundBridgeRemove(b);
  }
}
function groundTransportStep(dt){
  for(const f of fleets){
    if(!f.alive||f.embarked||groundAbsent(f)||f.groundRout==='routing')continue;
    if(f.groundUnloading)groundLandStep(f,dt);
    const o=f.order;if(!o)continue;
    if(o.type==='board'){
      const c=o.target;
      if(groundLandingShip(c)){
        if(!c.alive||c.groundUnloading||!groundShipBoardable(f)||groundPassengers(c).length>=groundLandingRules().capacity||!(c.groundBoarders||[]).includes(f)||!groundCoastCells(c,groundMoveKind(f)).length){groundCancelWork(f);groundClearOrders(f);continue;}
        o.repath-=dt;
        if(o.path&&!groundCoastCells(c,groundMoveKind(f)).some(p=>p.equals(o.path.points[o.path.points.length-1])))o.repath=0;
        if(o.repath<=0){o.path=groundShipBoardPath(f,c);o.repath=groundTransportRules().repathSec;}
        if(!o.path){groundCancelWork(f);groundClearOrders(f);continue;}
        const beach=o.path.points[o.path.points.length-1];
        if(groundDistanceTo(f,{pos:beach})<=groundTransportRules().boardRange){
          groundCancelWork(c);groundClearOrders(c);groundCancelWork(f);groundClearOrders(f);
          (c.groundPassengers||(c.groundPassengers=[])).push(f);f.embarked=c;f.pos.copy(c.pos);
        }else groundFollow(f,dt);
        continue;
      }
      if(!c.alive||c.groundPassenger||c.groundBoarder!==f){groundCancelWork(f);groundClearOrders(f);continue;}
      if(groundDistanceTo(f,c)<=groundTransportRules().boardRange){
        groundCancelWork(c);groundClearOrders(c);groundClearOrders(f);c.groundBoarder=null;c.groundPassenger=f;f.embarked=c;f.pos.copy(c.pos);
      }else{
        o.repath-=dt;if(o.repath<=0){o.path=groundPath(f.pos,c.pos,groundMoveKind(f));o.repath=groundTransportRules().repathSec;}
        if(o.path)groundFollow(f,dt);
      }
    }else if(o.type==='bridge'){
      const b=o.bridge;
      if(!groundBridges.includes(b)) {groundClearOrders(f);continue;}
      if(!f.groundBuilding&&o.path&&groundFollow(f,dt)){f.groundBuilding=true;f.fireTarget=null;}
      else if(f.groundBuilding&&!groundBridgeEnemy(b)){
        b.progress=Math.min(groundEngineeringRules().seconds,b.progress+dt);
        if(b.progress>=groundEngineeringRules().seconds-1e-8){b.complete=true;b.builder=null;f.groundBuilding=false;const queue=f.queue;groundClearOrders(f);f.queue=queue;groundBridgeRevision++;nextOrder(f);groundTransportMessage='仮設橋 完成（両軍通行可）';}
      }
    }
  }
  groundTransportSync();
}
function groundTransportHud(list){
  const board=document.getElementById('groundBoard'),unload=document.getElementById('groundUnload'),bridge=document.getElementById('groundBridge'),land=document.getElementById('groundLand');
  const f=list.length===1?list[0]:null;
  board.disabled=!groundCanBoardAny(f);bridge.disabled=!groundEngineer(f);unload.disabled=!list.some(f=>(f.embarked||f).groundPassenger);
  land.disabled=!list.some(f=>{const c=f.embarked||f;return c.alive&&!c.locked&&groundLandingShip(c)&&groundPassengers(c).length&&!c.groundUnloading;});
  if(groundWorkAiming==='board'&&board.disabled||groundWorkAiming==='bridge'&&bridge.disabled)groundWorkAiming=null;
  board.setAttribute('aria-pressed',String(groundWorkAiming==='board'));bridge.setAttribute('aria-pressed',String(groundWorkAiming==='bridge'));
  const work=f&&(f.embarked||f).groundUnloading;
  document.getElementById('groundTransportStatus').textContent=groundWorkAiming==='board'?'味方輸送車か岸の揚陸艦をクリック（Escで取消）':groundWorkAiming==='bridge'?'川をクリック（Escで取消）':work?`上陸中 ${work.progress.toFixed(1)} / ${groundLandingRules().seconds}秒・被弾${groundLandingRules().damageFactor}倍`:groundTransportMessage||(f&&f.embarked?`搭載中：${f.embarked.name}`:'');
}
function groundWorkToggle(mode){
  if(over||!op.ground)return;
  const list=orderTargets();if(list.length!==1||!(mode==='board'?groundCanBoardAny(list[0]):groundEngineer(list[0])))return;
  const aiming=groundWorkAiming!==mode;groundClearAiming();groundWorkAiming=aiming?mode:null;groundHud();
}
document.querySelectorAll('#groundBoard').forEach(b=>b.addEventListener('click',()=>groundWorkToggle('board')));
document.querySelectorAll('#groundUnload').forEach(b=>b.addEventListener('click',()=>groundUnloadCommand(orderTargets())));
document.querySelectorAll('#groundLand').forEach(b=>b.addEventListener('click',()=>groundLandCommand(orderTargets())));
document.querySelectorAll('#groundBridge').forEach(b=>b.addEventListener('click',()=>groundWorkToggle('bridge')));
function groundTransportReset(){
  // 初回 reset は部隊を作る前にここへ来る。
  for(const f of fleets||[]){f.groundUnloading=null;groundLandingDropVisual(f);}
  groundBridges.forEach(groundBridgeDropVisual);groundBridges=[];groundBridgeRevision=0;groundWorkAiming=null;groundTransportMessage='';
}
function groundTransportDraw(){
  if(!groundVisuals)return;
  for(const f of fleets){
    if(!f.alive||!f.groundUnloading){groundLandingDropVisual(f);continue;}
    if(!f.groundLandingVisual){
      const el=document.createElement('div');el.className='ground-site ground-landing';el.innerHTML='<b>上陸中</b><small></small><span class="capture-track"><i></i></span>';labelsEl.appendChild(el);f.groundLandingVisual=el;
    }
    const el=f.groundLandingVisual,at=proj(f.pos.clone().add(new THREE.Vector3(0,3,0)));
    el.hidden=at.z>1||!(f.team===0||groundSeenBy(0,f));el.style.transform=`translate(${at.x}px,${at.y}px) translate(-50%,-100%)`;
    el.querySelector('small').textContent=`${f.groundUnloading.progress.toFixed(1)} / ${groundLandingRules().seconds}秒・被弾${groundLandingRules().damageFactor}倍`;
    el.querySelector('i').style.width=`${100*f.groundUnloading.progress/groundLandingRules().seconds}%`;
  }
  for(const b of groundBridges){
    if(!b.visual){
      // 道路の既存橋と同じ細い明色の桁。建設中はゲージだけ。
      const deck=new THREE.Mesh(new THREE.BoxBufferGeometry((b.width+2*groundEngineeringRules().bankMarginKm)*GROUND_SCALE,.12,.14*GROUND_SCALE),new THREE.MeshLambertMaterial({color:0xeee7d4,transparent:true,opacity:1}));
      deck.position.copy(b.pos);deck.position.y+=.2;deck.rotation.y=Math.atan2(b.tx,-b.ty);groundVisuals.add(deck);
      const el=document.createElement('div');el.className='ground-site ground-bridge';el.innerHTML='<b></b><small></small><span class="capture-track"><i></i></span>';labelsEl.appendChild(el);b.visual={deck,el};
    }
    const {deck,el}=b.visual,visible=b.team===0||groundPointSeenBy(0,b.pos),at=proj(b.pos.clone().add(new THREE.Vector3(0,1,0)));
    deck.visible=b.complete;el.hidden=!visible||at.z>1;el.style.color=b.team===0?'#8bdfff':'#ff998b';
    el.style.transform=`translate(${at.x}px,${at.y}px) translate(-50%,-100%)`;
    el.querySelector('b').textContent=b.complete?'仮設橋（両軍通行可）':b.builder.groundBuilding?'架橋中':'架橋：川岸へ移動中';
    el.querySelector('small').textContent=b.complete?`耐久 ${Math.ceil(b.hp)} / ${groundEngineeringRules().hp}`:`${b.progress.toFixed(1)} / ${groundEngineeringRules().seconds}秒${groundBridgeEnemy(b)?' / 敵接近・停止':''}`;
    el.querySelector('i').style.width=`${100*(b.complete?b.hp/groundEngineeringRules().hp:b.progress/groundEngineeringRules().seconds)}%`;
  }
}
