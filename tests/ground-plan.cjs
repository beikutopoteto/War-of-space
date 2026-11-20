const assert=require('assert/strict');
function planCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok}),p=groundPoint;
 const fresh=()=>{
  groundPlanReset();groundClearAiming();undoStack=[];
  op={ground:'exercise2'};fleets=[];groundSites=[];over=false;deploying=false;gameSec=0;
 };
 const unit=(x,y=27,kind='infantry',team=0)=>{
  const q=p(x,y),f=makeFleet(team,{name:kind+x,groundKind:kind,type:'cv',n:1,scale:.3,pos:[q.x,q.z],stance:'evade'});
  f.band='ground';f.el.classList.toggle=()=>{};fleets.push(f);return f;
 };
 const four=()=>[unit(8.5),unit(10),unit(12),unit(13.5)];
 const a=p(8,28),b=p(14,28),c=p(8,32),d=p(14,32),forward=p(11,30);
 const draw=(mode,units,start,end,at=forward)=>{
  setSel(units);groundPlanToggle(mode);groundPlanTap(start);groundPlanTap(end);
  if(mode==='deploy')groundPlanTap(at);
  return units[0].groundFrontOf;
 };
 const tick=(seconds=.5)=>{gameSec+=seconds;groundFrontStep();};
 const finish=(units)=>{
  for(const f of units)if(f.order?.type==='move'&&groundFollow(f,180)){
   groundFormationArrive(f);f.order=null;nextOrder(f);
  }
 };
 const at=(front,units,fractions,line=a,end=b)=>units.every((f,i)=>{
  const target=front.slots.find(s=>s.f===f)?.dest;
  return target&&groundPlanDistance(target,line.clone().lerp(end,fractions[i]))<1e-6;
 });
 const quarter=[1/8,3/8,5/8,7/8],third=[1/6,3/6,5/6];
 const prepared=front=>groundPlanSlots(groundFrontPresent(front),front.plan.pts,front.plan.side);

 fresh();
 const units=four();
 setSel(units);groundPlanToggle('deploy');groundPlanTap(a);groundPlanTap(b);
 check('前線は終点のあと前の側を待つ',groundWorkAiming==='deploy'&&!!groundLinePts&&units.every(f=>!f.order));
 groundPlanTap(forward);const front=units[0].groundFrontOf;
 check('前線は直ちに命令を出し4隊は1/8・3/8・5/8・7/8',front&&units.every(f=>f.order?.groundDeploy&&f.groundFrontOf===front)&&at(front,units,quarter));
 check('確定後は入力待ちを解除',!groundWorkAiming&&!groundLineStart);
 finish(units);tick();
 draw('plan',units,c,d);
 check('全員で引くと計画は既存前線に付き、実行までは停止',groundFronts.length===1&&front.plan&&units.every(f=>!f.order));
 select(units[0]);
 check('選び直しても前線と確定済みの計画を保持',units[0].groundFrontOf===front&&front.plan);
 const realPath=groundMovePath;groundMovePath=()=>null;groundPlanExecute();groundMovePath=realPath;
 check('通行不能なら全隊の計画を残し一部だけ実行しない',!front.advance&&front.plan&&units.every(f=>!f.order));
 groundBridgeRevision++;groundPlanExecute();
 check('実行は選択した1隊を含む前線全体に同じ進撃の組を出す',front.advance&&units.every(f=>f.order?.groundAdvance===front.advance.group));
 check('実行は現在の橋で経路を確かめ、準備済み経路をそのまま使う',units.every(f=>f.order?.path?.bridgeRevision===groundBridgeRevision&&!f.order.groundPreparedPath));
 undo();
 check('Undoで実行前の前線・計画・命令に戻る',front.plan&&!front.advance&&units.every(f=>f.groundFrontOf===front&&!f.order&&f.groundDeployed));
 groundPlanToggle('plan');groundPlanTap(a);select(units[1]);
 check('選択変更で途中の線だけを取り消す',!groundLineStart&&!groundWorkAiming&&!!front.plan);
 groundPlanToggle('plan');groundPlanTap(a);pressEscape();
 check('Escで線と入力待ちを取り消す',!groundLineStart&&!groundWorkAiming);
 groundPlanToggle('plan');groundPlanTap(a);groundPlanTap(a);
 check('長さゼロの線は確定せず修正可能',!!groundLineStart&&groundPlanMessage.includes('終点'));
 groundClearAiming();

 for(const i of [1,0]){
  const f=units[i],rest=units.filter(u=>u!==f);select(f);
  groupOrder({type:'move',dest:p(11,26)});tick();
  check((i?'中央':'端')+'が別命令で離れると残りは1/6・3/6・5/6',f.groundFrontOf===front&&f.groundFrontAway&&at(front,rest,third));
  finish([f]);tick();
  check((i?'中央':'端')+'の別命令が終わると元の順の4隊へ',!f.groundFrontAway&&f.order?.groundDeploy&&at(front,units,quarter));
  finish(units);
 }

 const split=draw('plan',[units[1]],d,c);
 check('一部で引くと現在位置が中心の1kmの前線を作る',split!==front&&groundFronts.length===2&&
   groundPlanDistance(groundPlanAt(groundPlanLine(split.pts),GROUND_SCALE/2),units[1].pos)<1e-6);
 check('分かれた元の前線は残った順で並び直す',at(front,[units[0],units[2],units[3]],third));
 undo();
 check('Undoで分割を戻して元の前線一覧・所属・並びに戻る',groundFronts.length===1&&units.every(f=>f.groundFrontOf===front)&&at(front,units,quarter));
 const idle=unit(16);
 const mixed=draw('plan',[units[0],idle],c,d);
 check('前線のない隊を含めて引くと両隊の現在位置を結んだ別の前線',mixed!==front&&mixed.members.length===2&&
  Math.abs(groundPlanLine(mixed.pts).len-2*groundPlanDistance(units[0].pos,idle.pos))<1e-6);
 undo();
 select(units[1]);groundHoldCommand();
 check('停止・防衛で前線から抜けて現在地で守る',!units[1].groundFrontOf&&!units[1].order&&units[1].stance==='engage'&&at(front,[units[0],units[2],units[3]],third));
 undo();
 check('停止・防衛のUndoで隊の所属と命令が戻る',units[1].groundFrontOf===front&&units[1].stance==='evade'&&at(front,units,quarter));

 setSel(units);groundPlanExecute();
 const group=front.advance.group;const away=units[1];select(away);
 order(away,{type:'move',dest:p(10,27)});tick();
 check('進撃中も移動命令を受けた隊は離れ、残りは同じ組で再配置',away.groundFrontAway&&at(front,[units[0],units[2],units[3]],third,c,d)&&units[0].order?.groundAdvance===group);
 finish([away]);tick();
 check('離れた隊が進撃中に戻ると同じ組に入り直す',!away.groundFrontAway&&away.order?.groundAdvance===group&&at(front,units,quarter,c,d));
 const from=front.pts,plan=front.plan;
 for(const f of units)groundFollow(f,1);
 tick();const t=front.advance.t;
 check('移動とともに64点の前線の補間率が0より大きくなる',t>0&&t<1&&groundFrontPosition(front).length===64);
 groundVisuals=new THREE.Group();
 const realNow=performance.now;let ms=0;performance.now=()=>ms;
 groundPlanDraw();const mesh=groundPlanVisual.meshes.moving,first=mesh.geometry;
 for(const f of units)groundFollow(f,1);
 ms=249;groundPlanDraw();const deferred=mesh.geometry===first;
 ms=250;groundPlanDraw();
 check('動く前線の絵は実時間で250ms待ってから描き直す',deferred&&mesh.geometry!==first);
 performance.now=realNow;tick();

 const stopped=groundFrontPosition(front,front.advance.t);
 groundPlanExecute();
 check('停止はその瞬間の線を前線にし、計画を残す',!front.advance&&front.plan===plan&&front.pts!==from&&
   front.pts.every((q,i)=>groundPlanDistance(q,stopped[i])<1e-6)&&units.every(f=>f.order?.groundDeploy));
 finish(units);tick();
 groundPlanExecute();
 check('再実行は停止位置から始める',front.advance&&groundPlanDistance(front.advance.from[0],stopped[0])<1e-6);
 finish(units);tick();
 check('全隊到着で計画線と前の側を引き継ぎ、計画を消す',front.pts===plan.pts&&front.side===plan.side&&!front.plan&&!front.advance&&units.every(f=>f.groundDeployed));

 fresh();const tank=unit(9,27,'vehicle'),inf=unit(12),gun=unit(11,27,'artillery');
 const twoRows=draw('plan',[tank,inf,gun],d,c),slots=prepared(twoRows);
 check('逆向きの計画線を前線と同じ並び向きに揃える',groundPlanDistance(twoRows.pts[0],twoRows.plan.pts[0])<groundPlanDistance(twoRows.pts[0],twoRows.plan.pts.at(-1)));
 check('前列は計画線の上、後列は前の反対側へ1km',slots.filter(s=>s.f!==gun).every(s=>Math.abs(s.dest.z-c.z)<1e-6)&&
   slots.some(s=>s.f===gun&&Math.abs(s.dest.z-c.z-GROUND_SCALE)<1e-6));
 groundPlanExecute();tank.speed=4;gun.speed=1.5;
 check('進撃は同じ組のいちばん遅い隊に速さを合わせる',tank.order?.groundAdvance===gun.order?.groundAdvance&&groundAdvanceSpeed(tank)===speedOf(gun));
 gun.alive=false;check('倒れた隊は進撃の速さに数えない',groundAdvanceSpeed(tank)===speedOf(inf));gun.alive=true;
 tank.stance='engage';inf.stance='evade';const foe={alive:true};tank.fireTarget=inf.fireTarget=foe;
 const before=tank.pos.clone(),realFire=groundCanFire;
 groundCanFire=()=>false;
 const realFollow=followPath;let moved=new Set();followPath=(f,dt)=>{moved.add(f);return realFollow(f,dt);};
 groundStep(.05);followPath=realFollow;groundCanFire=realFire;
 check('進撃中、自動交戦の隊は停止、命令優先の隊は続行',tank.order?.groundAdvance&&!moved.has(tank)&&moved.has(inf)&&groundPlanDistance(tank.pos,before)<1e-9);
 tank.fireTarget=null;moved=new Set();followPath=(f,dt)=>{moved.add(f);return realFollow(f,dt);};groundStep(.05);followPath=realFollow;
 check('敵がいなくなれば自動交戦の隊も進撃を続ける',moved.has(tank));

 for(const advancing of [false,true]){
  fresh();const list=four(),front=draw('deploy',list,a,b);
  finish(list);tick();
  if(advancing){draw('plan',list,c,d);groundPlanExecute();for(const f of list)groundFollow(f,1);tick();}
  const target=unit(10.25,27,'infantry',1),outside=unit(7,27,'infantry',1),hidden=unit(12,27,'infantry',1);
  const realSeen=groundSeenBy;let visible=true;groundSeenBy=(team,f)=>f!==hidden&&(f!==target||visible);
  tick();
  const prefix=advancing?'進撃中':'待機中';
  check(prefix+'の前線を越えた見える敵へ最寄りの隊が向かい残りは等間隔',list[1].groundFrontEngagement?.target===target&&list[1].order?.groundFrontEngage&&list[1].groundFrontAway&&
    at(front,[list[0],list[2],list[3]],third,advancing?c:a,advancing?d:b));
  visible=false;tick(20);
  check(prefix+'に敵を一時見失っても迎撃を保持',list[1].groundFrontAway);
  visible=true;target.groundRout='routing';tick();
  check(prefix+'に敵が敗走すると同じ前線へ復帰',!list[1].groundFrontAway&&
    (advancing?list[1].order?.groundAdvance===front.advance.group:list[1].order?.groundDeploy));
  if(advancing){
    target.groundRout=null;tick();visible=false;tick(30);
    check('進撃中に敵を30秒見失うと復帰し、敵を追い続けない',!list[1].groundFrontAway&&!list[1].groundFrontEngagement);
  }
  groundSeenBy=realSeen;outside.alive=false;
 }

 fresh();const editors=four(),edit=draw('deploy',editors,a,b);
 finish(editors);tick();draw('plan',editors,d,c);
 check('逆から引いた計画は前線方向に反転し前の側を保つ',edit.plan.pts[0].equals(c)&&edit.plan.side===edit.side);
 const originalPlan=edit.plan;
 groundFrontRedraw(edit);groundPlanTap(b);groundPlanTap(a);groundPlanTap(p(11,29));
 check('前線の引き直しで計画を保持し、選択に関係なく所属隊を並べ直す',edit.plan===originalPlan&&edit.members.length===4);
 finish(editors);tick();
 const editedLine=edit.pts;
 select(null);groundPlanRedraw(edit);groundPlanTap(p(8,31));groundPlanTap(p(14,31));
 check('計画の引き直しで前線を保持',edit.pts===editedLine&&edit.plan!==originalPlan);
 const f=editors[0],v=p(8.9,29),v2=p(9.2,30);
 check('当たり判定は前線と計画線を識別',groundPlanPickAt(p(11,28),.1)?.kind==='front'&&groundPlanPickAt(p(11,31),.1)?.kind==='plan');
 check('当たり判定は部隊別の矢印を返す',groundPlanPickAt(p(8.75,29),.1)?.f===f);
 groundPlanViaAdd(f,v2);groundPlanViaAdd(f,v);
 check('中継地点を近い区間へ挿入し矢印が順に通る',groundPlanArrows(edit).find(a=>a.f===f)?.pts.slice(1,-1).every((p,i)=>p.equals([v,v2][i]))&&edit.via.get(f)?.length===2);
 setSel(editors);groundPlanExecute();
 check('中継地点を実行の経路に入れる',f.order?.path?.pts.length===3&&f.order.path.pts[0].equals(v)&&f.order.path.pts[1].equals(v2));
 const originalS=f.order.path.s;
 f.order.path.s=f.order.path.at[0]+1e-5;
 check('通過済みの中継地点を矢印から外す',groundPlanArrows(edit).find(a=>a.f===f)?.pts[1].equals(v2));
 f.order.path.s=originalS;
 groundPlanViaClear(f);
 check('進撃中の中継地点の削除は残りの道に反映',!edit.via.has(f)&&f.order?.path?.pts.length===1);
 undo();
 check('Undoで中継地点・進撃の組・進撃命令を復元',edit.via.get(f)?.length===2&&f.order?.groundAdvance===edit.advance.group);
 for(const u of editors)groundFollow(u,1);tick();
 const instant=groundFrontPosition(edit,groundFrontProgress(edit)),oldFixedLine=edit.pts;
 groundPlanRedraw(edit);groundPlanTap(p(8,33));groundPlanTap(p(14,33));
 check('進撃中の計画の引き直しは現在の線から新しい計画へ進む',edit.advance&&edit.pts===oldFixedLine&&
   groundPlanDistance(edit.advance.from[0],instant[0])<1e-6&&editors.every(u=>Math.abs(u.order?.dest.z-p(8,33).z)<1e-6));
 groundPlanDelete(edit);
 check('進撃中の計画を消すと止まって前線を保持',!edit.plan&&!edit.advance&&groundFronts.includes(edit)&&editors.every(f=>f.order?.groundDeploy));
 undo();
 check('計画削除のUndoは確定計画と進撃を戻す',edit.plan&&edit.advance&&editors.every(f=>f.order?.groundAdvance===edit.advance.group));
 groundFrontDelete(edit);
 check('前線の削除で計画ごと消え全隊が現在地で守る',!groundFronts.length&&editors.every(f=>!f.groundFrontOf&&!f.order&&f.post.equals(f.pos)));
 undo();
 check('削除のUndoは前線と進撃を戻す',groundFronts[0]===edit&&editors.every(f=>f.groundFrontOf===edit&&f.order?.groundAdvance===edit.advance.group));
 fresh();const air=unit(11,27,'attack');air.band='low';
 const flight=draw('plan',[air],c,d),flightVia=p(11,29);
 groundPlanViaAdd(air,flightVia);groundPlanExecute();
 air.order.path.s=air.order.path.at[0]+1e-5;
 check('航空隊は旋回の移動距離だけでは経由地を通過扱いにしない',groundPlanArrows(flight)[0].pts[1].equals(flightVia)&&copyOrder(air.order,air).via.length===1);
 air.order.path.atIndex++;
 check('航空隊が実際に経由地に着くと矢印とUndoの経路から外れる',groundPlanArrows(flight)[0].pts.length===2&&!copyOrder(air.order,air).via.length);
 op={};groundPlanToggle('plan');check('宇宙では起動しない',!groundWorkAiming);
 return rows;
}
function nodeChecks(){
 const {run}=require('./ground-controls.cjs').createControlsContext();
 return run(`(${planCases.toString()})()`);
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`共有命令 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
