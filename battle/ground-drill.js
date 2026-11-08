/* 地上の演習だけの判定。案内・輪・通信は第一章と同じ tutorial を使う。 */
function groundDrillActive(){return !!(op.groundDrill&&tutorialActive());}
function groundDrillRow(){return groundDrillActive()?op.tutorial[tutorial.step]:null;}
function groundDrillUnit(name){return fleets.find(f=>f.name===name);}
function groundDrillEnter(){
  tutorial.ground={};tutorial.startedAt=gameSec;
  const row=groundDrillRow();groundSupplyDrillEnter(row);
  const f=groundDrillUnit(row.actor),m=row.marks[0];
  tutorial.ground.initialSupply=f?.groundSupply;
  const at=m?new THREE.Vector3(m.pos[0],groundHeight(...m.pos),m.pos[1]):f.pos.clone();
  if(f&&m)at.add(f.pos).multiplyScalar(.5);
  // 次の訓練区画と操作対象を同時に映す。選択はプレイヤーが行う。
  flyTo(at,new THREE.Vector3(0,1,.65),Math.max(85,f?f.pos.distanceTo(at)*2+65:85));
  logEvent('リコ軍曹',row.text);
}
function groundDrillEvent(kind,f,value){
  const row=groundDrillRow();
  if(!row||over||!f||f.team!==0||f.name!==row.actor)return;
  const g=tutorial.ground;
  if(kind==='supplyPlace'&&row.condition==='groundSupplyDeploy'){g.placed=true;return;}
  if(kind==='move'&&['groundMove','groundCapture','groundSight','groundSupplyRoad','groundSupplyRecapture','groundSupplyHalf','groundSupplyRout','groundSupplyRally'].includes(row.condition)){
    const m=row.marks[0];if(m&&Math.hypot(value.x-m.pos[0],value.z-m.pos[1])<=6)g.issued=true;
  }else if(kind==='attack'&&row.condition==='groundAttack'&&value.name===row.target)g.issued=true;
  else if(kind==='hit'&&row.condition==='groundAttack'&&g.issued&&value.name===row.target)g.hit=true;
  else if(kind==='band'&&row.condition==='groundBand'&&value===row.band)g.issued=true;
  else if(kind==='strike'&&row.condition==='groundStrike'){
    const m=row.marks[0];if(Math.hypot(value.aim.x-m.pos[0],value.aim.z-m.pos[1])<=6)g.strike=value;
  }else if(kind==='board'&&row.condition==='groundBoard'&&value.name===row.target)g.issued=true;
  else if(kind==='unload'&&row.condition==='groundUnload'&&!value.embarked)g.unloaded=value;
  else if(kind==='bridge'&&row.condition==='groundBridge'){
    const m=row.marks[0];if(Math.hypot(value.pos.x-m.pos[0],value.pos.z-m.pos[1])<=6)g.bridge=value;
  }else if(kind==='land'&&row.condition==='groundLand')g.passengers=value.slice();
}
function groundDrillTick(){
  const row=groundDrillRow();if(!row||over)return;
  const f=groundDrillUnit(row.actor),g=tutorial.ground,m=row.marks[0];
  const near=m&&f&&Math.hypot(f.pos.x-m.pos[0],f.pos.z-m.pos[1])<=6;
  let done=groundSupplyDrillTick(row,f,g);
  if(row.condition==='groundSelect')done=orderTargets().length===1&&orderTargets()[0]===f;
  else if(row.condition==='groundMove')done=g.issued&&near&&!f.order&&(!row.coast||groundCoastCells(f).length>0);
  else if(row.condition==='groundCapture')done=g.issued&&groundSites.find(s=>s.id===row.site)?.owner===0;
  else if(row.condition==='groundAttack')done=g.hit&&!groundDrillUnit(row.target)?.alive;
  else if(row.condition==='groundSight')done=g.issued&&near&&!f.order&&groundCanSee(f,groundDrillUnit(row.target));
  else if(row.condition==='groundBand')done=g.issued&&f.band===row.band&&!f.bandTo;
  else if(row.condition==='groundStrike')done=g.strike&&g.strike.left<=1e-8;
  else if(row.condition==='groundBoard')done=g.issued&&f.embarked===groundDrillUnit(row.target);
  else if(row.condition==='groundUnload')done=!!g.unloaded;
  else if(row.condition==='groundBridge')done=g.bridge&&g.bridge.complete;
  else if(row.condition==='groundLand')done=g.passengers?.length&&g.passengers.every(p=>p.alive&&!p.embarked)&&!f.groundUnloading;
  if(!done)return;
  tutorial.times.push({step:tutorial.step,section:row.section,name:row.name,seconds:gameSec-tutorial.startedAt});
  if(tutorial.step===op.tutorial.length-1){tutorial.complete=true;end(true);tutorialRender();}
  else tutorialAdvance();
}
// 補給区画だけの明示的な訓練配置。実戦の補給・占領・被弾処理をそのまま使う。
function groundSupplyDrillSetup(skipped=false){
  if(groundSites.some(s=>s.id==='B'))return;
  const old=groundSites.map(s=>({id:s.id,owner:s.owner,progress:s.progress.slice()}));
  op={...op,groundSites:[...op.groundSites,{site:'B',owner:0},{site:'C',owner:0},{site:'F',owner:1}]};groundCaptureInit();
  for(const state of old){const s=groundSites.find(s=>s.id===state.id);s.owner=state.owner;s.progress=state.progress;}
  groundSupplyBuild();
  if(skipped)return;
  const add=(team,name,kind,x,y)=>{
    const p=groundPoint(x,y),f=makeFleet(team,{name,groundKind:kind,type:'cv',n:1,scale:.3,pos:[p.x,p.z],stance:'evade'});fleets.push(f);f.band='ground';f.groundMaxHp=f.hpPool;f.pos.y=groundUnitHeight(f);groundSupplyInitUnit(f);
    const src=shipMeshes[team].cv,mat=src.material.clone();mat.transparent=true;mat.userData.baseOpacity=1;f.groundModel=new THREE.Group();f.groundModel.add(new THREE.Mesh(src.geometry.clone(),mat));f.groundModel.children[0].scale.setScalar(SHIP_SIZE.cv);groundVisuals.add(f.groundModel);
    if(team===0&&groundOrg){f.companyId='supplyDrill'+f.id;groundOrg.companies.push({id:f.companyId,name,kind});}
    return f;
  };
  add(0,'第11 補給訓練歩兵中隊','infantry',23,29.5).groundSupply=40;
  add(0,'第12 補給中隊','supply',24.5,28.5);
  add(1,'補給訓練 道路占領班','infantry',16,32);
  add(1,'補給訓練 射撃班','infantry',15,25);
  if(groundOrg)buildRoster();
}
function groundSupplyDrillEnter(row){
  if(row.section!==10)return;
  groundSupplyDrillSetup();const f=groundDrillUnit('第11 補給訓練歩兵中隊'),truck=groundDrillUnit('第12 補給中隊'),red=groundDrillUnit('補給訓練 道路占領班'),shooter=groundDrillUnit('補給訓練 射撃班');
  // 道路占領班と射撃班は各場面以外で発砲しない。
  for(const t of [red,shooter]){groundClearOrders(t);t.stance='evade';}
  red.pos.copy(groundPoint(16,32));shooter.pos.copy(groundPoint(15,25));
  if(row.condition==='groundSupplyDeploy')groundSupplyStartDeploy([f,truck]);
  if(row.condition==='groundSupplyRecapture'){
    red.pos.copy(groundPoint(16,29.857));groundSupplyRoadCapture(groundRoadCaptureSeconds());red.pos.copy(groundPoint(16,32));groundSupplyRefresh();
  }
  if(row.condition==='groundSupplyHalf'){
    red.pos.copy(groundPoint(18.5,29.5));f.groundSupply=40;
  }
  if(row.condition==='groundSupplyGive'){
    const panel=document.getElementById('groundSupply')?.parentElement;if(panel)panel.open=true;
    f.pos.copy(groundPoint(16,26));truck.pos.copy(groundPoint(16.6,26));groundClearOrders(f);groundClearOrders(truck);f.groundSupply=40;truck.groundSupply=100;truck.groundSupplyGiven=0;f.groundSupplyReceived=0;
  }
  if(row.condition==='groundSupplyRout'){
    f.groundMorale=20;truck.pos.copy(groundPoint(17,26));groundClearOrders(f);groundClearOrders(truck);
  }
  if(row.condition==='groundSupplyRally'){
    // 競合班は離脱済み。演習で自軍が色を持つ道を回復先にする。
    groundClearOrders(shooter);
  }
}
function groundSupplyDrillTick(row,f,g,dt){
  if(row.section!==10)return false;
  const actor=groundDrillUnit('第11 補給訓練歩兵中隊');
  if(row.condition==='groundSupplyDeploy')return !deploying&&g.placed;
  if(row.condition==='groundSupplyRoad')return g.issued&&actor.groundSupply>g.initialSupply+2&&groundSupplyAt(actor).rate===1;
  if(row.condition==='groundSupplyRecapture')return g.issued&&groundSupplyAt(actor).rate>0&&groundRoadAt(16,29.857)?.owner===0;
  if(row.condition==='groundSupplyHalf'){
    const at=groundSupplyAt(actor),down=groundSupplyAt({team:0,pos:groundPoint(16.5,29.786)});
    return g.issued&&at.rate===.5&&down.rate===.5&&actor.groundSupply>g.initialSupply+1;
  }
  if(row.condition==='groundSupplyGive')return groundDrillUnit('第12 補給中隊').groundSupplyGiven>=5&&actor.groundSupplyReceived>=5;
  if(row.condition==='groundSupplyRout'){
    const shooter=groundDrillUnit('補給訓練 射撃班');
    // 敵の発砲や耐久の変更を使わず、既存の士気・敗走処理を体験する。
    const m=row.marks[0];
    if(g.issued&&!g.routed&&!actor.groundRout&&Math.hypot(actor.pos.x-m.pos[0],actor.pos.z-m.pos[1])<=6)groundSupplyHit(actor,actor.groundMorale);
    if(actor.groundRout==='routing'){g.routed=true;groundClearOrders(shooter);}
    return g.routed&&actor.groundRout==='regroup';
  }
  if(row.condition==='groundSupplyRally')return g.issued&&!actor.groundRout&&actor.groundMorale>=groundSupplyRules().rally;
  return false;
}
