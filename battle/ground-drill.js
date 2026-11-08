/* 地上の演習だけの判定。案内・輪・通信は第一章と同じ tutorial を使う。 */
function groundDrillActive(){return !!(op.groundDrill&&tutorialActive());}
function groundDrillRow(){return groundDrillActive()?op.tutorial[tutorial.step]:null;}
function groundDrillUnit(name){return fleets.find(f=>f.name===name);}
function groundDrillCounterfire(){
  if(!op.groundDrill)return;
  const live=tutorial?.skipped||groundDrillRow()?.section>=op.groundCounterfireSection;
  for(const f of fleets)if(f.team===1)f.stance=live?'engage':'evade';
}
function groundDrillEnter(){
  groundDrillCounterfire();
  tutorial.ground={};tutorial.startedAt=gameSec;
  const row=groundDrillRow(),f=groundDrillUnit(row.actor),m=row.marks[0];
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
  if(kind==='move'&&['groundMove','groundCapture','groundSight'].includes(row.condition)){
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
  let done=false;
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
