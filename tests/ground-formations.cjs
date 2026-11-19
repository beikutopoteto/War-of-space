const assert=require('assert/strict');
function nodeChecks(){
 const {run}=require('./ground-controls.cjs').createControlsContext();
 return run(`(()=>{
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok}),f={id:12,name:'中隊',groundKind:'vehicle',bodies:[],groundMovedAt:9.8,groundModel:{userData:{movedAt:9.8}}};
  for(const deployed of [false,true])for(const moving of [false,true])for(const o of ['none','move','advance']){
   f.groundDeployed=deployed;f.groundMovedAt=moving?9.8:9;f.order=o==='advance'?{type:'move',groundAdvance:1}:o==='move'?{type:'move'}:null;
   check('状態 '+[deployed,moving,o].join('/'),groundFormationState(f,10)===(moving&&o!=='none'?(o==='advance'?'advance':'move'):(deployed?'defend':'idle')));
  }
  // 命令が終わった直後: 列の体が着く途中（groundTrack.arr）だけ列の形のまま。進撃・追撃のあとは列を挟まずすぐ布陣・待機（2026-11-19）
  f.order=null;f.groundMovedAt=9.8;f.groundDeployed=false;f.groundTrack={arr:{}};check('着く途中の列は0.4秒のあいだ列のまま',groundFormationState(f,10)==='move');
  f.groundTrack=null;f.groundDeployed=true;check('進撃が終わった直後は列を挟まず布陣',groundFormationState(f,10)==='defend');
  f.order={type:'move',groundAdvance:1};
  f.groundMovedAt=0;check('0.4秒の境界で停止',groundFormationState(f,.4)==='defend');
  delete f.groundModel;check('モデルなしでも停止判定',groundFormationState(f,10)==='defend');
  f.pos=new THREE.Vector3();f.groundModel=new THREE.Group();groundFormationDraw(f,10);
  check('従来の手組みモデルも描画時計を初期化',f.groundModel.userData.movedAt===-Infinity&&f.groundModel.userData.last.equals(f.pos));
  f.pos.x=1;groundFormationDraw(f,10.1);check('描画だけでは移動状態を変えない',groundFormationState(f,10.1)==='defend'&&f.pos.x===1);f.groundMovedAt=10.1;check('戦闘側の移動時計で侵攻',groundFormationState(f,10.1)==='advance');const legacy={...f};delete legacy.bodies;delete legacy.groundMovedAt;check('体のない従来モデルは描画の移動時計を維持',groundFormationState(legacy,10.1)==='advance');
  const spec={offsets:GROUND_FORMS.wedge4,size:.5},layout=(kind,state,s=spec)=>groundFormationLayout({...f,groundKind:kind},s,state);
  // 動くときの列（2026-11-18）: 車両は左右交互の千鳥の2列、歩兵は2列（ときどき3人）。体は列の先頭からの距離 s の順、小隊の間は少しあく
  const four={...spec,platoon:spec.offsets,platoons:4,offsets:groundPlatoonOffsets({...spec,platoons:4},4)};
  for(const kind of ['vehicle','apc','artillery','guidedRocket','mobileAA','scout','engineer','supply']){
   const p=layout(kind,'move',four),signs=new Set(p.map(v=>Math.sign(v.lat)));
   check(kind+'は千鳥の2列で前から後ろへ',p.march&&p.length===16&&signs.size===2&&!signs.has(0)&&p.every((v,i)=>!i||v.s>p[i-1].s-1e-9||i%4===0)&&p.every((v,i)=>i%4===0||Math.sign(v.lat)!==Math.sign(p[i-1].lat))&&p.L>0);
   check(kind+'は小隊の間があく',p[4].s-p[3].s>p[3].s-p[2].s);
  }
  for(const kind of ['infantry','heavyInfantry','commando','mechanicalAssault','was']){
   const s6={offsets:GROUND_FORMS.squad6,size:.32},p=layout(kind,'move',{...s6,platoon:s6.offsets,platoons:4,offsets:groundPlatoonOffsets({...s6,platoons:4},4)});
   check(kind+'は列で、横のずれは3人ぶんまで',p.march&&p.length===24&&p.every(v=>Math.abs(v.lat)<=1.2)&&p.L>0);
  }
  check('列は同じ種で再現',JSON.stringify(layout('vehicle','move',four))===JSON.stringify(layout('vehicle','move',four)));
  check('待機は同じ種で再現',JSON.stringify(layout('vehicle','idle'))===JSON.stringify(layout('vehicle','idle')));
  const idle=layout('vehicle','idle'),radius=Math.max(...spec.offsets.map(([x,z])=>Math.hypot(x,z)))*spec.size*1.3;
  check('待機は円内で向き±60度',idle.every(p=>Math.hypot(p.x,p.z)<=radius&&Math.abs(p.yaw)<=Math.PI/3)&&new Set(idle.map(p=>p.yaw)).size===4);
  check('別中隊は別の待機位置',JSON.stringify(idle)!==JSON.stringify(groundFormationLayout({...f,id:13},spec,'idle')));
  // 進撃・布陣はずらす（2026-11-19）: 進撃は小隊と体ごとにずれ、布陣は同じずれを GROUND_ADVANCE_RANDOM.defend 倍に縮めた位置。ゆらぎは進撃だけ
  {const R=GROUND_ADVANCE_RANDOM,adv=layout('vehicle','advance'),def=layout('vehicle','defend'),o=spec.offsets.map(([x,z])=>({x:x*spec.size,z:z*spec.size})),lim=(R.platoonX+R.bodyX)*spec.size+1e-9,limZ=(R.platoonZ+R.bodyZ)*spec.size+1e-9;
   check('進撃は元の隊形からずれる（幅の内）',adv.some((p,i)=>Math.abs(p.x-o[i].x)>1e-6||Math.abs(p.z-o[i].z)>1e-6)&&adv.every((p,i)=>Math.abs(p.x-o[i].x)<=lim&&Math.abs(p.z-o[i].z)<=limZ&&Math.abs(p.yaw)<=R.yaw+1e-9&&p.wa>0));
   check('布陣は進撃のずれを縮めた位置で、ゆらがない',def.every((p,i)=>Math.abs((p.x-o[i].x)-(adv[i].x-o[i].x)*R.defend)<1e-9&&Math.abs((p.z-o[i].z)-(adv[i].z-o[i].z)*R.defend)<1e-9&&!p.wa));
   check('同じ中隊は毎回同じずれ、別中隊は別',JSON.stringify(adv)===JSON.stringify(layout('vehicle','advance'))&&JSON.stringify(adv)!==JSON.stringify(groundFormationLayout({...f,id:13,groundKind:'vehicle'},spec,'advance')));}
  check('1体と航空の隊形は固定',layout('droneHive','idle',{offsets:GROUND_FORMS.one,size:.7})[0].x===0&&JSON.stringify(layout('fighter','idle'))===JSON.stringify(layout('fighter','defend')));
  for(const o of [{type:'move'},{type:'attack'}]){f.groundDeployed=true;groundFormationOrder(f,o);check(o.type+'で防衛解除',!f.groundDeployed);}
  for(const flag of ['groundDeploy','groundAdvance']){f.groundDeployed=true;groundFormationOrder(f,{type:'move',[flag]:true});check(flag+'は保持',f.groundDeployed);f.groundDeployed=false;f.order={type:'move',[flag]:true};groundFormationArrive(f);check(flag+'到着で防衛',f.groundDeployed);}
  return rows;
 })()`);
}
// All movement below uses real orders and groundStep; drawing must leave simulation coordinates untouched.
function formationScene(){
 reset({op:'groundExercise2',fleets:['vehicle','infantry','artillery','apc'].map((kind,i)=>({name:['戦車','歩兵','自走砲','輸送車'][i],kind,at:[8+i*2,27],stance:'evade'}))});
 if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);
 for(const f of fleets)if(f.team!==0||!['戦車','歩兵','自走砲','輸送車'].includes(f.name))f.alive=false;
 groundUpdateSight();setSel(fleets.filter(f=>f.team===0&&f.alive));
}
function formationTick(seconds,simulate=false){
 for(let i=0;i<Math.ceil(seconds/.05);i++){gameSec+=.05;if(simulate)groundStep(.05);groundDraw();}
}
function formationCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});formationScene();
 const units=orderTargets(),a=groundPoint(8,29),b=groundPoint(14,29);
 groundPlanToggle('deploy');groundPlanTap(a);groundPlanTap(b);
 check('布陣命令に旗',units.every(f=>f.order?.groundDeploy));
 for(let i=0;i<2000&&units.some(f=>f.order);i++)formationTick(.05,true);
 formationTick(2);check('布陣到着で防衛',units.every(f=>!f.order&&f.groundDeployed&&groundFormationState(f)==='defend'));
 // 体ごとの動き（2026-11-19）: 着いた体から順に、近い空いた位置へ歩いて入る。歩き終えてから、布陣の見本の位置のどれにも体が1つ入っているかを見る
 // （どの体がどの位置かは問わない。止まる位置のそばでは前後だけで合わせるので、ずれは体の長さの0.6倍まで許す）
 formationTick(20,true);
 check('防衛は見本の位置',units.every(f=>{const form=f.groundModel.userData.formation,lay=groundLayouts(f,form.spec).defend,tol=Math.max(.15,groundBodyDims(form.spec).len*.6),used=new Set();
   return lay.every(t=>{let best=-1,bd=Infinity;form.bodies.forEach((p,i)=>{if(used.has(i))return;const d=Math.hypot(p.position.x-t.x,p.position.z-t.z);if(d<bd){bd=d;best=i;}});used.add(best);return bd<tol;});}));
 for(const f of units)order(f,{type:'move',dest:f.pos.clone().add(new THREE.Vector3(0,0,4))});
 formationTick(.15,true);check('通常移動は移動隊形',units.every(f=>groundFormationState(f)==='move'&&!f.groundDeployed));
 for(let i=0;i<2000&&units.some(f=>f.order);i++)formationTick(.05,true);
 formationTick(2);check('通常移動到着後は待機',units.every(f=>!f.order&&groundFormationState(f)==='idle'));
 check('歩く形と立つ形の座標一致',units.filter(f=>f.groundModel.userData.pose).every(f=>{const p=f.groundModel.userData.pose;return p.move.every((m,i)=>m.every(b=>b.position.equals(p.stand[i].position)&&b.rotation.equals(p.stand[i].rotation)));}));
 document.getElementById('groundHold').click();formationTick(.5);check('停止・防衛は防衛',units.every(f=>groundFormationState(f)==='defend'));
 groundPlanToggle('plan');groundPlanTap(groundPoint(8,30));groundPlanTap(groundPoint(14,30));groundPlanExecute();formationTick(.15,true);
 check('計画実行で侵攻',units.every(f=>f.order?.groundAdvance&&groundFormationState(f)==='advance'));
 for(let i=0;i<2000&&units.some(f=>f.order);i++)formationTick(.05,true);formationTick(.5);
 check('侵攻到着も防衛',units.every(f=>f.groundDeployed&&groundFormationState(f)==='defend'));
 const before=units.map(f=>[...f.pos.toArray(),f.hpPool,f.speed,f.range]);formationTick(1);
 check('描画で位置・耐久・速さ・射程不変',JSON.stringify(before)===JSON.stringify(units.map(f=>[...f.pos.toArray(),f.hpPool,f.speed,f.range])));
 for(const kind of ['fighter','attack']){
  const f=makeFleet(0,groundUnitSpec({name:kind,kind,at:[12,27]}));fleets.push(f);groundInitUnit(f);
  const t=makeFleet(1,groundUnitSpec({name:'航空標的',kind:'fighter',at:[12,27],band:'low'}));fleets.push(t);groundInitUnit(t);
  const base=f.groundModel.userData.formation.layouts.defend,snapshot=f.pos.clone();order(f,{type:'attack',target:t});
  t.pos.copy(f.pos).add(new THREE.Vector3(groundTargetRange(f,t)*1.4,0,0));
  check(kind+'は射程1.5倍以内の攻撃目標で戦闘',groundAircraftCombat(f));
  t.pos.x=f.pos.x+groundTargetRange(f,t)*1.6;check(kind+'は遠い攻撃目標で編隊',!groundAircraftCombat(f));
  f.fireTarget=t;formationTick(2);const body=f.groundModel.userData.formation.bodies[0],p=body.position.clone();formationTick(.7);
  check(kind+'は戦闘中に体が周回',p.distanceTo(body.position)>.1&&Math.abs(body.rotation.z)>.1&&f.pos.equals(snapshot));
  f.fireTarget=null;t.alive=false;formationTick(3);
  check(kind+'は敵消滅後に編隊へ戻る',f.groundModel.userData.formation.bodies.every((b,i)=>b.position.distanceTo(new THREE.Vector3(base[i].x,0,base[i].z))<.001&&Math.abs(b.rotation.z)<.001)&&f.pos.equals(snapshot));
 }
 return rows;
}
async function checkGroundFormations(page,check){
 await page.evaluate(`window.formationScene=${formationScene};window.formationTick=${formationTick}`);
 for(const r of await page.evaluate(formationCases))check(r.ok,'隊形: '+r.name);
}
module.exports={nodeChecks,checkGroundFormations,formationScene,formationTick};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`隊形 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
