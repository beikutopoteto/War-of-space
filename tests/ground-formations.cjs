const assert=require('assert/strict');
function nodeChecks(){
 const {run}=require('./ground-controls.cjs').createControlsContext();
 return run(`(()=>{
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok}),f={id:12,name:'中隊',groundKind:'vehicle',groundModel:{userData:{movedAt:9.8}}};
  for(const deployed of [false,true])for(const moving of [false,true])for(const advance of [false,true]){
   f.groundDeployed=deployed;f.groundModel.userData.movedAt=moving?9.8:9;f.order=advance?{type:'move',groundAdvance:1}:null;
   check('状態 '+[deployed,moving,advance].join('/'),groundFormationState(f,10)===(moving?(advance?'advance':'move'):(deployed?'defend':'idle')));
  }
  f.groundModel.userData.movedAt=0;check('0.4秒の境界で停止',groundFormationState(f,.4)==='defend');
  delete f.groundModel;check('モデルなしでも停止判定',groundFormationState(f,10)==='defend');
  f.pos=new THREE.Vector3();f.groundModel=new THREE.Group();groundFormationDraw(f,10);
  check('従来の手組みモデルも描画時計を初期化',f.groundModel.userData.movedAt===-Infinity&&f.groundModel.userData.last.equals(f.pos));
  f.pos.x=1;groundFormationDraw(f,10.1);check('従来モデルも実移動を追跡',groundFormationState(f,10.1)==='advance'&&f.pos.x===1);
  const spec={offsets:GROUND_FORMS.wedge4,size:.5},layout=(kind,state,s=spec)=>groundFormationLayout({...f,groundKind:kind},s,state);
  for(const kind of ['vehicle','apc','artillery','guidedRocket','mobileAA','scout','engineer','supply']){
   const p=layout(kind,'move');check(kind+'は前から一列で最小1.2間隔',p.every((v,i)=>v.x===0&&(!i||p[i-1].z-v.z>=1.2-1e-9)));
  }
  for(const kind of ['infantry','heavyInfantry','commando','mechanicalAssault','was']){
   const p=layout(kind,'move',{offsets:GROUND_FORMS.squad6,size:.32}),width=kind==='was'?.9:.45;
   check(kind+'は2列で前から交互',p.every((v,i)=>v.x===(i%2?width:-width)&&v.z===p[i-i%2].z&&(!i||i%2||p[i-2].z>v.z)));
  }
  check('待機は同じ種で再現',JSON.stringify(layout('vehicle','idle'))===JSON.stringify(layout('vehicle','idle')));
  const idle=layout('vehicle','idle'),radius=Math.max(...spec.offsets.map(([x,z])=>Math.hypot(x,z)))*spec.size*1.3;
  check('待機は円内で向き±60度',idle.every(p=>Math.hypot(p.x,p.z)<=radius&&Math.abs(p.yaw)<=Math.PI/3)&&new Set(idle.map(p=>p.yaw)).size===4);
  check('別中隊は別の待機位置',JSON.stringify(idle)!==JSON.stringify(groundFormationLayout({...f,id:13},spec,'idle')));
  check('防衛と侵攻は元の隊形',JSON.stringify(layout('vehicle','defend'))===JSON.stringify(layout('vehicle','advance'))&&layout('vehicle','defend').every((p,i)=>p.x===spec.offsets[i][0]*spec.size&&p.z===spec.offsets[i][1]*spec.size));
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
 check('防衛は見本の位置',units.every(f=>f.groundModel.userData.formation.bodies.every((p,i)=>{const t=f.groundModel.userData.formation.layouts.defend[i];return Math.hypot(p.position.x-t.x,p.position.z-t.z)<.05;})));
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
