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
 groundClearAiming();op={};groundPlanToggle('plan');check('宇宙では起動しない',!groundWorkAiming);
 return rows;
}
function nodeChecks(){const {run}=require('./ground-controls.cjs').createControlsContext();return run(`(${planCases.toString()})()`);}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`共有命令 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
