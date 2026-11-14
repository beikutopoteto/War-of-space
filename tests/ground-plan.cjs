const assert=require('assert/strict');
function planCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 op={ground:'exercise2'};fleets=[];groundSites=[];over=false;deploying=false;
 const unit=x=>{const p=groundPoint(x,27),f=makeFleet(0,{name:'歩兵'+x,groundKind:'infantry',type:'cv',n:1,scale:.3,pos:[p.x,p.z]});f.band='ground';f.el.classList.toggle=()=>{};fleets.push(f);return f;};
 const units=[unit(8),unit(10),unit(12)],a=groundPoint(8,29),b=groundPoint(12,29);setSel(units);
 groundPlanToggle('plan');groundPlanTap(a);groundPlanTap(b);
 check('計画作成だけでは部隊を動かさない',units.every(f=>!f.order&&f.groundPlan));
 check('線の両端と中点へ均等に割り当て',units.every((f,i)=>f.groundPlan.dest.distanceTo(a.clone().lerp(b,i/2))<1e-6));
 check('確定後は入力待ちを解除',!groundWorkAiming&&!groundLineStart);
 select(units[0]);check('選び直しても確定済み計画は保持',!!units[0].groundPlan);
 setSel(units);const real=groundMovePath;groundMovePath=()=>null;groundPlanExecute();
 check('通行不能なら全隊の計画を残し一部だけ実行しない',units.every(f=>!f.order&&f.groundPlan));groundMovePath=real;
 groundBridgeRevision++;groundPlanExecute();
 check('実行で全隊が計画先へ移動',units.every(f=>f.order?.type==='move'&&!f.groundPlan));
 check('実行時に現在の橋の状態で経路を確認',units.every(f=>f.order.path.bridgeRevision===groundBridgeRevision));
 check('検証済み経路は注文へ使い一時フィールドを除去',units.every(f=>!f.order.groundPreparedPath));
 undo();check('戻すで実行前の計画を復元',units.every(f=>!f.order&&f.groundPlan));
 groundPlanToggle('deploy');groundPlanTap(a);groundPlanTap(b);
 check('布陣は実行を待たず一列への移動を開始',units.every(f=>f.order?.type==='move'&&!f.groundPlan));
 groundPlanToggle('plan');groundPlanTap(a);select(units[0]);
 check('途中の線は選択変更で取り消す',!groundLineStart&&!groundWorkAiming);
 groundPlanToggle('plan');groundPlanTap(a);pressEscape();check('Escで線と入力待ちを取り消す',!groundLineStart&&!groundWorkAiming);
 groundPlanToggle('plan');groundPlanTap(a);groundPlanTap(a);check('長さゼロの線は確定せず修正可能',!!groundLineStart&&groundPlanMessage.includes('終点'));
 groundClearAiming();
 { // 兵科で2列（ユーザー決定 2026-11-14）: 前列は線の上、後列は自軍の側へ1km。片方だけなら線の上
  const kindUnit=(kind,x)=>{const f=unit(x);f.groundKind=kind;f.name=kind+x;return f;};
  for(const f of units){groundCancelWork(f);f.order=null;f.groundPlan=null;}
  const tank=kindUnit('vehicle',9),gun=kindUnit('artillery',11),mixed=[units[0],tank,gun,units[2]],line=dest=>(dest.z-a.z); // 線は z 一定（y=29）。隊は y=27 側＝z が大きい側
  setSel(mixed);groundPlanToggle('plan');groundPlanTap(a);groundPlanTap(b);
  check('布陣・計画の前列（歩兵・戦車）は線の上に等間隔',[units[0],tank,units[2]].every(f=>Math.abs(line(f.groundPlan.dest))<1e-6)&&Math.abs(tank.groundPlan.dest.x-a.clone().lerp(b,.5).x)<1e-6);
  check('後列（自走砲）は自軍の側へ1km下がる',Math.abs(line(gun.groundPlan.dest)-GROUND_SCALE)<1e-6&&Math.abs(gun.groundPlan.dest.x-a.clone().lerp(b,.5).x)<1e-6);
  for(const f of mixed)f.groundPlan=null;
  setSel([gun]);groundPlanToggle('plan');groundPlanTap(a);groundPlanTap(b);check('後列の兵科だけなら線の上',Math.abs(line(gun.groundPlan.dest))<1e-6);gun.groundPlan=null;
  // 進撃の途中で撃てる敵がいれば、自動交戦の隊は止まり、命令優先の隊は進む
  setSel([units[0],units[2]]);groundPlanToggle('plan');groundPlanTap(groundPoint(8,33));groundPlanTap(groundPoint(12,33));groundPlanExecute();
  units[0].stance='engage';units[2].stance='evade';const foe={alive:true};units[0].fireTarget=units[2].fireTarget=foe;
  const before=[units[0].pos.clone(),units[2].pos.clone()],realFire=groundCanFire;groundCanFire=()=>false;
  // groundStep の終わりで fireTarget を選び直すので、1ステップ目の判断だけを見る
  const realFollow=followPath;let moved=new Set();followPath=(f,dt)=>{moved.add(f);return realFollow(f,dt);};
  groundStep(.05);followPath=realFollow;groundCanFire=realFire;
  check('進撃は groundAdvance を付け、敵がいると自動交戦の隊は止まり命令優先の隊は進む',units[0].order?.groundAdvance&&!moved.has(units[0])&&moved.has(units[2])&&Math.hypot(units[0].pos.x-before[0].x,units[0].pos.z-before[0].z)<1e-9);
  units[0].fireTarget=null;moved=new Set();followPath=(f,dt)=>{moved.add(f);return realFollow(f,dt);};groundStep(.05);followPath=realFollow;
  check('敵がいなくなれば自動交戦の隊も進撃を続ける',moved.has(units[0]));
  // 速さはいちばん遅い隊に合わせる（ユーザー決定 2026-11-14「速さはやっぱ最低速度で」）
  const slowTank=kindUnit('vehicle',13),slowGun=kindUnit('artillery',14);for(const f of [slowTank,slowGun]){f.speed=4;}slowGun.speed=1.5;
  setSel([slowTank,slowGun]);groundPlanToggle('plan');groundPlanTap(groundPoint(13,31));groundPlanTap(groundPoint(15,31));groundPlanExecute();
  check('進撃の組は同じ組を持ち、速さはいちばん遅い隊',slowTank.order?.groundAdvance===slowGun.order?.groundAdvance&&groundAdvanceSpeed(slowTank)===speedOf(slowGun)&&speedOf(slowTank)>speedOf(slowGun));
  slowGun.alive=false;check('遅い隊が倒れたら残りの隊は自分の速さに戻る',groundAdvanceSpeed(slowTank)===speedOf(slowTank));slowGun.alive=true;
  setSel([slowTank]);groundPlanToggle('deploy');groundPlanTap(groundPoint(13,30));groundPlanTap(groundPoint(14,30));check('布陣や通常の移動は自分の速さ',!slowTank.order?.groundAdvance&&groundAdvanceSpeed(slowTank)===speedOf(slowTank));
 }
 op={};groundPlanToggle('plan');check('宇宙では起動しない',!groundWorkAiming);
 return rows;
}
function nodeChecks(){const {run}=require('./ground-controls.cjs').createControlsContext();return run(`(${planCases.toString()})()`);}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`共有命令 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
