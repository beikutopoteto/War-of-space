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
 const draw=(mode,units,start,end,at=mode==='deploy'?forward:start)=>{
  setSel(units);groundPlanToggle(mode);groundPlanTap(start);groundPlanTap(end);
  groundPlanTap(at);
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

 groundPlanDelete(front);
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

 // ユーザーの指示 2026-11-21: 速さの違いで先に出た隊の所は、前線が前へ張り出す
 const ahead=units[1];for(let i=0;i<3;i++)groundFollow(ahead,1);tick();
 const prof=groundFrontProfile(front),at64=s=>prof[Math.round(s.fraction*(GROUND_FRONT_SAMPLES-1))];
 const leadSlot=front.slots.find(s=>s.f===ahead),others=front.slots.filter(s=>s.f!==ahead&&!s.offset).map(at64);
 check('先に出た隊の所で前線が前へ張り出し、ほかは元の深さのまま',at64(leadSlot)>Math.max(...others)+.02&&prof.length===GROUND_FRONT_SAMPLES);
 const stopped=groundFrontNow(front);
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
 select(null);groundPlanRedraw(edit);groundPlanTap(p(8,31));groundPlanTap(p(14,31));groundPlanTap(p(11,32));
 check('計画の引き直しで前線を保持',edit.pts===editedLine&&edit.plan!==originalPlan);
 const f=editors[0],v=p(8.9,29),v2=p(9.2,30);
 check('当たり判定は前線と計画線を識別',groundPlanPickAt(p(11,28),.1)?.kind==='front'&&groundPlanPickAt(p(11,31),.1)?.kind==='plan');
 check('当たり判定は部隊別の矢印を返す',groundPlanPickAt(p(8.75,29),.1)?.f===f);
 groundPlanViaAdd(f,v2);groundPlanViaAdd(f,v);
 check('中継地点を近い区間へ挿入し矢印が順に通る',groundPlanArrows(edit).find(a=>a.f===f)?.pts.slice(1,-1).every((p,i)=>p.equals([v,v2][i]))&&edit.custom.get(f)?.points.length===2);
 setSel(editors);groundPlanExecute();
 check('中継地点を実行の経路に入れる',f.order?.path?.pts.length===3&&f.order.path.pts[0].equals(v)&&f.order.path.pts[1].equals(v2));
 const originalS=f.order.path.s;
 f.order.path.s=f.order.path.at[0]+1e-5;
 check('通過済みの中継地点を矢印から外す',groundPlanArrows(edit).find(a=>a.f===f)?.pts[1].equals(v2));
 f.order.path.s=originalS;
 groundPlanResetRoutes(edit,[f]);
 check('進撃中の中継地点の削除は残りの道に反映',!edit.custom.has(f)&&f.order?.path?.pts.length===1);
 undo();
 check('Undoで中継地点・進撃の組・進撃命令を復元',edit.custom.get(f)?.points.length===2&&f.order?.groundAdvance===edit.advance.group);
 for(const u of editors)groundFollow(u,1);tick();
 const instant=groundFrontNow(edit),oldFixedLine=edit.pts;
 groundPlanRedraw(edit);groundPlanTap(p(8,33));groundPlanTap(p(14,33));groundPlanTap(p(11,34));
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

 fresh();select(null);
 groundPlanToggle('edit');groundPlanHud([]);
 check('前線がないと編集・削除は押せない',document.getElementById('groundEdit').disabled&&!groundWorkAiming);
 const own=four(),target=draw('deploy',own,a,b),lead=own[0];
 finish(own);tick();draw('plan',own,c,d);select(null);
 groundPlanToggle('edit');groundPlanHud([]);
 check('部隊選択なしでも編集・削除を開始',groundWorkAiming==='edit'&&!document.getElementById('groundEdit').disabled);
 const click=(hit,id)=>groundEditActions(hit).find(a=>a[0]===id)[2]();
 click({kind:'plan',front:target},'redraw');groundPlanTap(p(8,31));groundPlanTap(p(14,31));groundPlanTap(p(11,32));
 check('計画の編集ボタンで引き直して編集・削除へ戻る',target.plan.pts[0].equals(p(8,31))&&groundWorkAiming==='edit');
 click({kind:'front',front:target},'redraw');groundPlanTap(a);groundPlanTap(b);groundPlanTap(forward);
 check('前線の編集ボタンで向きを指定して編集・削除へ戻る',!!target.plan&&groundWorkAiming==='edit');
 finish(own);tick();
 const viaPoint=p(8.75,29.5);
 const oldProject=groundEditProject;
 groundEditProject=p=>({x:p.x*100,z:p.z*100});
 groundEditTap(viaPoint.x*100,viaPoint.z*100);
 groundEditProject=oldProject;
 const hit=groundPlanPickAt(viaPoint,.01);
 check('矢印の左クリックで○ができ、線より先に当たる',hit?.kind==='via'&&hit.front===target&&hit.f===lead&&hit.i===0);
 const movedVia=p(7,29);
 groundPlanEditHandle(hit,'move',movedVia);
 check('○を動かすと確定前の曲線もその点を通る',
   groundWorkAiming==='edit'&&target.custom.get(lead)?.points[0].equals(movedVia)&&
   groundPlanNearest(groundPlanLine(groundPlanArrows(target).find(a=>a.f===lead).shape),movedVia).d<1e-6);
 const preview=groundPlanPreview(target),shape=groundPlanRouteShape(preview[0].path,0);
 groundPlanArrows(target);
 check('計画の経路と曲線は入力が変わるまで再利用する',groundPlanPreview(target)===preview&&groundPlanRouteShape(preview[0].path,0)===shape);
 setSel(own);groundPlanExecute();
 check('移動した○を実際の進撃経路が通る',groundPlanNearest(groundPlanLine(lead.order.path.points),movedVia).d<1e-6);
 groundPlanToggle('edit');const peerOrders=own.slice(1).map(f=>f.order);
 click(groundPlanPickAt(movedVia,.01),'delete');
 check('○の削除ボタンで進撃から経由地を外し、編集・削除は続く',
   target.custom.get(lead)?.points.length===0&&groundWorkAiming==='edit'&&
   own.slice(1).every((f,i)=>f.order===peerOrders[i])&&groundPlanNearest(groundPlanLine(lead.order.path.points),movedVia).d>GROUND_SCALE);
 const prevPos=lead.pos.clone();groundFollow(lead,1);
 const rest=groundPlanArrows(target).find(a=>a.f===lead).shape;
 check('進撃の矢印は現在地から始まり、通過した道は消える',
   rest[0]===lead.pos&&groundPlanNearest(groundPlanLine(rest),prevPos).d>1e-6);
 undo();
 check('中間点の削除は1回の戻すで取り消せる',target.custom.get(lead)?.points[0].equals(movedVia));
 groundPlanToggle('edit');
 click({kind:'plan',front:target},'delete');
 check('計画の削除ボタンは前線を残して編集・削除を続ける',!target.plan&&groundFronts.includes(target)&&groundWorkAiming==='edit');
 pressEscape();check('Escは編集・削除を解除し、ポーズを開かない',!groundWorkAiming&&!pauseOpened);
 groundPlanToggle('edit');groundPlanToggle('edit');check('編集・削除は同じボタンで解除',!groundWorkAiming);

 const savedOrg={companies:[],brigades:[{id:'g',battalions:['one','two']}],battalions:[
   {id:'one',companies:['c0','c1']},{id:'two',companies:['c2','c3']}],};
 groundOrg=JSON.parse(JSON.stringify(savedOrg));own.forEach((f,i)=>f.companyId='c'+i);
 const [one,two]=groundOrg.battalions,g=groundOrg.brigades[0],green=GROUND_PLAN_COLORS[9],pink=GROUND_PLAN_COLORS[3];
 groundPlanSetColor('battalions',two,pink);groundPlanSetColor('brigades',g,green);
 check('旅団の変更で配下の個別色を解除し、準備の編成には書かない',
   !one.planColor&&!two.planColor&&own.every(f=>groundPlanUnitColor(f)===green)&&!savedOrg.brigades[0].planColor);
 groundPlanSetColor('battalions',two,pink);
 const colors=groundPlanSectionColors(target);
 check('前列の受け持ち順で大隊色を付ける',colors.join()=== [green,green,pink,pink].join()&&groundPlanUnitColor(own[0])===green);
 // 色の切れ目は線の長さの真ん中（進撃を止めた線は隊の進み具合で少し曲がる）
 const targetLine=groundPlanLine(target.pts),mid=groundPlanAt(targetLine,targetLine.len/2);
 const vertices=[],rgb=[];
 groundPlanFront(vertices,target.pts,target.side,1,0,0,1,colors,rgb);
 const expected=[green,pink].map(c=>groundPlanPaints.get(c).toArray());
 check('帯の各半分と全体で等間隔の歯を対応する色で描く',vertices.length===rgb.length&&
   rgb.length>0&&rgb.every((v,i)=>{
     const x=vertices[i-i%3]-mid.x;
     return Math.abs(x)<1e-2||expected[x<0?0:1][i%3]===v;   // 切れ目の点は両方の色を持つ
   }));
 groundPlanToggle('edit');click({kind:'front',front:target},'delete');
 check('前線の削除ボタンで前線を消し、編集・削除は続く',!groundFronts.length&&groundWorkAiming==='edit');
 groundPlanToggle('edit');groundPlanHud([]);
 check('最後の前線を消したあとも同じボタンで解除でき、解除すると押せない',
   !groundWorkAiming&&document.getElementById('groundEdit').disabled);

 fresh();groundBridges=[];
 const data=groundData(),fords=data.objects.fords;
 const north=p(23.5,29),central=p(22.5,21),rivers=data.water.rivers.map(r=>({id:r.id,points:r.points.map(([x,y])=>p(x,y))}));
 const crossing=(path,sites)=>groundFrontCrossed(path,rivers,sites)?.pos;
 // 進撃の道は道路の速さで選ばない（ユーザーの指示 2026-11-21「できるだけ最短ルート（直線ルート）」）
 const roadA=p(10,24),roadB=p(30,24),fastRoad=groundMovePath(roadA,[roadB],'vehicle'),straightRoad=groundMovePath(roadA,[roadB],'vehicle',true);
 check('短い道は道路に寄らず、早く着く道より短く、直線の1.05倍以内',straightRoad.straight&&!fastRoad.straight&&
  straightRoad.L<fastRoad.L&&straightRoad.L<=1.05*groundPlanDistance(roadA,roadB));
 try{
  data.objects.fords=[];
  const sites=groundFrontCrossings(data);
  const tanks=Array.from({length:4},(_,i)=>unit(20,25+i*.35,'vehicle'));
  const slots=tanks.map((f,i)=>({f,dest:p(26,25.5+i*.35)}));
  const count=(routes,at)=>routes.filter(r=>crossing(r.path,sites)?.equals(at)).length;
  const shortest=slots.map(s=>({...s,path:groundMovePath(s.f.pos,[s.dest],'vehicle',true)}));
  const corridor=(lo,hi)=>({
   pts:[p(20,lo),p(20,hi)],plan:{pts:[p(26,lo),p(26,hi)]},custom:new Map(),passed:new Map()
  });
  const one=corridor(20,27),two=corridor(20,30),none=corridor(24,28);
  const single=groundFrontRoutes(one,slots,true),spread=groundFrontRoutes(two,slots,true);
  check('回廊外の北橋が4隊の最短路でも、回廊内の中央橋に全隊を通す',
   count(shortest,north)===4&&count(single,central)===4&&single.every(r=>r.path.straight));
  check('回廊に橋が2つあれば進撃を2隊ずつに分ける',count(spread,north)===2&&count(spread,central)===2);
  const fallback=groundFrontRoutes(none,slots,true);
  check('回廊に橋が無いときは各隊が最短路をそのまま使う',fallback.every(({path},i)=>
   path.points.length===shortest[i].path.points.length&&path.points.every((q,j)=>q.equals(shortest[i].path.points[j]))));
  const estimate=(s,p)=>groundPlanDistance(s.f.pos,p)+groundPlanDistance(p,s.dest);
  const centralGain=slots.map(s=>estimate(s,central)-estimate(s,north)).sort((a,b)=>a-b);
  const best=slots.reduce((sum,s)=>sum+estimate(s,north),0)+centralGain[0]+centralGain[1];
  check('2対2のうち直線見積もりの合計が最短になる組を選ぶ',
   Math.abs(spread.reduce((sum,s)=>sum+estimate(s,s.path.pts[0]),0)-best)<1e-6);
  two.custom.set(tanks[3],{isCustomEdited:true,points:[p(21,21)],dest:null});
  const pinned=groundFrontRoutes(two,slots,true);
  check('中継地点の隊を中央橋の1隊に数え、残りを割り振って2隊ずつ',count(pinned,north)===2&&count(pinned,central)===2&&
   crossing(pinned[3].path,sites)?.equals(central)&&pinned[3].path.pts.length===2);
  one.custom.set(tanks[3],{isCustomEdited:true,points:[north],dest:null});
  const outside=groundFrontRoutes(one,slots,true);
  check('回廊外の中継地点を指定した隊は北橋、他の3隊は中央橋を通る',count(outside,central)===3&&
   crossing(outside[3].path,sites)?.equals(north)&&outside[3].path.pts[0].equals(north));

  const curve=[p(20,19),p(21,23),p(20,27)],planCurve=[p(26,27),p(24,23),p(26,19)];
  const curved=groundFrontCorridor(curve,planCurve);
  check('曲線の全点を保持し、逆から引いた計画も端をねじらず結ぶ',curved.every((q,i)=>q===[...curve,...planCurve][i])&&
   groundFrontInCorridor(central,curved)&&!groundFrontInCorridor(p(20.4,23),curved));
  check('回廊の縁から0.3 km以内を含める',groundFrontInCorridor(p(19.75,23),one.pts.concat([...one.plan.pts].reverse()))&&
   !groundFrontInCorridor(p(19.65,23),one.pts.concat([...one.plan.pts].reverse())));
  const short=[p(15,15),p(15,20)],long=[p(18,21),p(18,32)];
  check('近い端につなぐと交差する場合は、交差しない端へ結ぶ',groundFrontCorridor(short,long)[2]===long[1]);

  const align=[p(26,14),p(26,27)],alignSlots=groundPlanSlots(tanks,align,1);
  const aligned=groundFrontRoutes({pts:align},alignSlots,false);
  check('前線への整列も現在地と前線の凸包に橋が1つなら4隊ともそこを渡る（道は今までどおり早く着く道）',
   count(aligned,central)===4&&aligned.every(r=>!r.path.straight));
  for(const [i,f] of tanks.entries())f.pos.copy(p(21,29+i*.15));
  setSel(tanks);const common=p(26,26);groupOrder({type:'move',dest:common});
  check('通常移動は割り振らず全隊が同じ目的地へ最短路で進む',
   tanks.every(f=>f.order?.dest.equals(common)&&crossing(f.order.path,sites)?.equals(north)&&f.order.path.pts.length===1));
  const bridge={river:'main',pos:p(23,26),hp:1,complete:true};
  groundBridges=[bridge,{...bridge,complete:false},{...bridge,hp:0}];
  check('完成して耐久が残っている工兵の橋だけを渡河候補に含める',groundFrontCrossings(data).filter(c=>c.pos===bridge.pos).length===1);
 }finally{data.objects.fords=fords;groundBridges=[];}

 const curve={tail:[p(11,25),p(13,26),p(14,29),p(18,28)]},visual={arrows:new WeakMap()};
 const arrowFleet={};
 const arrowAt=start=>({f:arrowFleet,arrow:[start,...curve.tail],curve});
 const arrowMesh=item=>groundPlanArrowMesh(visual,item,1,GROUND_PLAN_LOOK.grow,0);
 const matchesWhole=(item,parts)=>{
  const whole=[];
  groundPlanBentArrow(whole,item.arrow,1,GROUND_PLAN_LOOK.grow,0);
  const combined=parts.flatMap(part=>Array.from(part));
  return whole.length===combined.length&&whole.every((x,i)=>Math.abs(x-combined[i])<1e-5);
 };
 const firstArrow=arrowAt(p(9,25)),firstParts=arrowMesh(firstArrow);
 const movedArrow=arrowAt(p(10,25)),movedParts=arrowMesh(movedArrow);
 check('動く矢印は同じ形で描き、始点を動かしても固定部分の頂点を再利用する',
  firstParts.length===2&&firstParts[1]===movedParts[1]&&arrowMesh(movedArrow)===movedParts&&
  matchesWhole(firstArrow,firstParts)&&matchesWhole(movedArrow,movedParts));

 // ユーザーの指示 2026-11-22「侵攻ラインが前線に対して直角やった場合、ちゃんと弧を描いて曲がるか」
 const ax=p(8,28),bx=p(14,28),up=[p(14,28.2),p(14,34.2)];
 const aligned=groundFrontAlign(up,1,[ax,bx]);
 check('直角の計画は両端の近さで向きを合わせ、軸の側の端どうしを結ぶ',groundPlanDistance(aligned.pts[0],up[1])<1e-6&&aligned.side===-1);
 const w=groundFrontWheel([ax,bx],aligned.pts);
 check('右端を軸に90°回る計画は、回転の中心が右端の近くになる',!!w&&Math.abs(Math.abs(w.phi)-Math.PI/2)<.05&&groundPlanDistance(w.O,bx)<.3*GROUND_SCALE);
 const half=groundFrontWheelAt(w,ax,.5);
 check('回る途中も線の長さを保つ（左端は中心から同じ距離）',Math.abs(groundPlanDistance(half,w.O)-groundPlanDistance(ax,w.O))<1e-6);
 check('向きがほとんど変わらない計画は回さず、平行に進む',!groundFrontWheel([ax,bx],[p(8,32),p(14,32.5)]));
 fresh();
 const turn=four();draw('deploy',turn,a,b);finish(turn);tick();
 draw('plan',turn,...up);
 const tf=turn[0].groundFrontOf;setSel(turn);groundPlanExecute();
 const outer=tf.slots.find(s=>s.f===turn[0]),inner=tf.slots.find(s=>s.f===turn[3]);
 check('回る進撃は外側の隊が弧の中継点を通り、内側の隊ほど遅い',!!tf.advance?.wheel&&outer.f.order?.path?.pts.length>2&&
  !(outer.f.order.groundAdvancePace<1)&&inner.f.order?.groundAdvancePace<1&&groundAdvanceSpeed(inner.f)<groundAdvanceSpeed(outer.f));

 fresh();const flank=four(),facing=draw('deploy',flank,a,b);
 finish(flank);tick();
 const flankStart=p(9,30.5),flankEnd=p(14,30.5),faceSource=p(11,29);
 groundPlanToggle('plan');groundPlanTap(flankStart);groundPlanTap(flankEnd);groundPlanHover(faceSource);
 check('計画は前の側を待ち、ポインタの側を歯の側にする',groundWorkAiming==='plan'&&!facing.plan&&
  groundLinePts.length===2&&groundPlanSide(groundLinePts,groundLinePointer)===groundPlanNearest(groundPlanLine([flankStart,flankEnd]),faceSource).side);
 groundPlanTap(faceSource);
 const facingPlan=facing.plan,flankLine=groundPlanLine(facingPlan.pts);
 check('計画の前の側はクリックで確定し、計画線を向いた隊がその側にいる',facingPlan.side===groundPlanSide(facingPlan.pts,faceSource)&&
  flank.every(f=>groundPlanNearest(flankLine,f.pos).side===facingPlan.side));
 const vias=[p(7.5,32),p(15.5,32)];
 const pass=groundPass;
 groundPass=(x,y,...args)=>!(Math.abs(x-7.5)<1e-8&&Math.abs(y-32)<1e-8)&&pass(x,y,...args);
 try{
  const nearby=groundFrontRoutes(facing,groundPlanAdvanceSlots(facing),true)[1].detourVia;
  check('回り込みの中継点に入れない場合は近くの通れる点を使う',nearby&&groundPlanDistance(nearby,vias[0])>1e-6&&
   groundPlanDistance(nearby,vias[0])<groundData().meta.cellKm*2*GROUND_SCALE);
 }finally{groundPass=pass;}
 groundMovePath=(from,waypoints,...args)=>waypoints.length===1?realPath(from,waypoints,...args):null;
 try{
  check('通れる中継点がなければ従来の経路を使う',groundFrontRoutes(facing,groundPlanAdvanceSlots(facing),true).every(r=>r.path&&!r.detourVia));
 }finally{groundMovePath=realPath;}
 groundPlanExecute();
 const paths=flank.map(f=>f.order?.path);
 check('向かい合う計画には各隊が端の外で2点を通り、後ろ側から着く',facing.advance?.detour&&
  paths.every((path,i)=>path?.pts.length===3&&groundPlanDistance(path.pts[1],path.pts[0])>1e-6&&
   groundPlanNearest(flankLine,path.pts[1]).side===-facingPlan.side&&flank[i].order.groundAdvancePace===undefined)&&
  groundPlanDistance(paths[1].pts[1],vias[0])<1e-6&&groundPlanDistance(paths[2].pts[1],vias[1])<1e-6);
 const around=flank[0],aroundPath=around.order.path;
 for(let i=0;i<2000&&aroundPath.s<aroundPath.at[0];i++)groundFollow(around,.25);
 const pastCorner=aroundPath.s;
 const finishedAtCorner=groundFollow(around,.25);
 check('回り込みは中間点で止まらず次の区間へ進む',
  pastCorner>=aroundPath.at[0]&&aroundPath.s>pastCorner&&!finishedAtCorner);
 for(const f of flank)groundFollow(f,2);
 const intruder=unit(10,27,'infantry',1);
 check('回り込み中は前線を越えた敵に迎撃命令を出さない',!groundFrontBreach(facing,[intruder])&&flank.every(f=>!f.groundFrontEngagement));
 groundPlanDraw();
 check('回り込み中は計画線と矢印を描き、動く前線は描かない',groundPlanVisual.meshes.still.visible&&
  groundPlanVisual.meshes.blink.visible&&!groundPlanVisual.meshes.moving.visible);
 const atStop=groundFrontFromUnits(flank,flankLine);
 groundPlanExecute();
 check('回り込みの停止で隊の現在位置から前線を作る',!facing.advance&&facing.plan===facingPlan&&
  facing.side===atStop.side&&facing.pts.every((q,i)=>q.equals(atStop.pts[i])));
 undo();
 groundPlanRedraw(facing);groundPlanTap(flankStart);groundPlanTap(flankEnd);groundPlanTap(faceSource);
 check('回り込み中の引き直しも隊の現在位置から進む',facing.advance?.detour&&
  groundPlanDistance(facing.advance.from[0],atStop.pts[0])<1e-6);
 const destinations=new Map(facing.slots.map(s=>[s.f,s.dest]));
 intruder.alive=false;finish(flank);tick();
 check('回り込みが終わると、各隊が持ち場で停止する',!facing.advance&&!facing.plan&&flank.every(f=>
  !f.order&&f.groundDeployed&&groundPlanDistance(f.pos,destinations.get(f))<1e-6&&
  f.heading.x===f.groundLine.face.x&&f.heading.z===f.groundLine.face.z));

 // 経由地の設計だけでなく、地形探索を経て実際に移動する線分どうしを調べる。
 const segmentsMeet=(a,b,c,d)=>{
  const turn=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x),eps=1e-7;
  const side=(p,q,r)=>Math.abs(turn(p,q,r))<=eps?0:Math.sign(turn(p,q,r));
  const overlap=(lo,hi,min,max)=>Math.max(Math.min(lo,hi),Math.min(min,max))<=Math.min(Math.max(lo,hi),Math.max(min,max))+eps;
  return overlap(a.x,b.x,c.x,d.x)&&overlap(a.z,b.z,c.z,d.z)&&
   side(a,b,c)*side(a,b,d)<=0&&side(c,d,a)*side(c,d,b)<=0;
 };
 const disjoint=paths=>paths.every((a,i)=>paths.slice(0,i).every(b=>
  !a.some((p,j)=>j&&b.some((q,k)=>k&&segmentsMeet(a[j-1],p,b[k-1],q)))));
 for(const count of [4,7])for(const mode of ['both','left','right']){
  fresh();
  const n=count===7?6:4,start=p(10,23),end=p(17,23),target=[p(10,27),p(17,27)],at=p(13.5,25);
  const units=Array.from({length:n},(_,i)=>unit(10+7*(i+.5)/n,23));
  if(count===7)units.push(unit(13.5,22,'artillery'));
  const front=draw('deploy',units,start,end,at);finish(units);tick();
  draw('plan',units,...target,at);
  if(mode!=='both')groundPlanSetDetour(front,0,mode);
  const preview=groundPlanPreview(front),L=groundPlanLine(front.plan.pts);
  groundPlanExecute();
  const label=mode+'・'+count+'隊';
  const actual=units.map(f=>f.order?.path);
  check(label+'の実経路は交差せず、全隊が後ろから着く',
   actual.every(path=>path&&groundPlanNearest(L,path.points.at(-2)).side===-front.plan.side)&&
   disjoint(actual.map(path=>path.points)));
  check(label+'の矢印も交差しない',disjoint(groundPlanArrows(front).map(arrow=>arrow.shape)));
  check(label+'の予告・持ち場・実経路の終点が一致する',front.slots.length===units.length&&front.slots.every(({f,dest})=>
   groundPlanDistance(dest,preview.find(r=>r.f===f).dest)<1e-6&&groundPlanDistance(dest,f.order?.path.points.at(-1))<1e-6));
  const byEnd=first=>preview.filter(r=>r.lane?.first===first);
  const nested=[true,false].every(first=>{
   const group=byEnd(first),edge=first?L.pts[0]:L.pts.at(-1);
   const distance=r=>Math.abs(r.fraction*L.len-(first?0:L.len));
   const nearest=Math.min(...group.map(distance));
   return group.every(r=>{
    const width=(distance(r)-nearest)*.5,corner=r.detourTurn?.at(-1),rear=r.detourVia;
    return rear&&corner&&Math.abs(Math.abs(corner.x-edge.x)-1.5*GROUND_SCALE-width)<1e-6&&
     Math.abs(Math.abs(rear.z-edge.z)-1.5*GROUND_SCALE-width-r.offset)<1e-6&&
     group.filter(q=>q.offset===r.offset&&(first?q.f.pos.x>r.f.pos.x:q.f.pos.x<r.f.pos.x))
      .every(q=>r.lane.width>q.lane.width&&distance(r)>distance(q));
   });
  });
  check(label+'は出発時に端寄りの隊ほど外側へ深く回り、同じ列の内側の持ち場に着く',
   nested&&preview.every(r=>r.lane)&&(mode==='both'||byEnd(mode==='left').length===count));
  if(count===7){
   const [progressing,...others]=units;
   for(let i=0;i<4000&&progressing.order.path.s<=progressing.order.path.at[1];i++)groundFollow(progressing,.25);
   const detached=others[1];detached.alive=false;tick();
   check(label+'の離脱後もfront.slotsと実経路の持ち場が一致する',!front.slots.some(s=>s.f===detached)&&
    front.slots.length===count-1&&front.slots.every(({f,dest})=>f.order?.path&&
     groundPlanDistance(dest,f.order.dest)<1e-6&&groundPlanDistance(dest,f.order.path.points.at(-1))<1e-6));
  }
 }

 fresh();const editGroup=four(),editFront=draw('deploy',editGroup,a,b),[editedUnit,otherUnit]=editGroup;
 finish(editGroup);tick();draw('plan',editGroup,p(8,30.5),p(14,30.5),p(11,29));
 const automatic=groundPlanPreview(editFront),autoArrow=groundPlanArrows(editFront)[0];
 const [autoCorner,autoBack,autoEnd]=autoArrow.markers.map(m=>m.p);
 const autoHit=groundPlanPickAt(autoCorner,.01),newCorner=autoCorner.clone().add(new THREE.Vector3(-1,0,0));
 groundPlanEditHandle(autoHit,'move',newCorner);
 const editedRoute=editFront.custom.get(editedUnit);
 check('自動の○を動かすとその隊だけ手直し済みになり、残りの点と他隊の道を保つ',
  editFront.custom.size===1&&editedRoute?.isCustomEdited&&editedRoute.points[0].equals(newCorner)&&
  editedRoute.points[1].equals(autoBack)&&groundPlanDistance(editedRoute.dest,autoEnd)<1e-6&&
  groundPlanPreview(editFront).slice(1).every((route,i)=>route.path===automatic[i+1].path));
 const endHit=groundPlanPickAt(autoEnd,.01),undoBefore=undoStack.length;
 check('終点の○は削除できず、通行不能な位置への移動では手直しもUndoも変えない',
  !groundEditActions(endHit).some(a=>a[0]==='delete')&&!groundPlanEditHandle(endHit,'move',p(-2,31))&&
  editFront.custom.get(editedUnit)===editedRoute&&undoStack.length===undoBefore&&groundPlanMessage==='通れない場所です');
 groundPlanEditHandle(endHit,'move',p(8.8,33));
 const customEnd=editFront.custom.get(editedUnit);
 setSel(editGroup);groundPlanExecute();
 const independentOrder=editedUnit.order;
 order(otherUnit,{type:'move',dest:p(10,27)});tick();
 groundBridgeRevision++;groundFollow(editedUnit,.25);
 check('ほかの隊が離脱して橋が変わっても、手直しの中間点と線外の終点を保持',
  otherUnit.groundFrontAway&&editFront.custom.get(editedUnit)===customEnd&&
  groundPlanDistance(editedUnit.order.dest,customEnd.dest)<1e-6&&
  editedUnit.order.path.pts.slice(0,-1).every((p,i)=>groundPlanDistance(p,customEnd.points[i])<1e-6));
 finish([otherUnit]);tick();
 check('ほかの隊が復帰しても線外の終点は変わらない',!otherUnit.groundFrontAway&&
  groundPlanDistance(editedUnit.order.dest,customEnd.dest)<1e-6);
 const unchanged=editGroup.slice(1).map(f=>f.order);
 click({kind:'arrow',front:editFront,f:editedUnit},'reset');
 check('進撃中に1隊を自動に戻すとその隊だけが自動の回り込みに戻る',
  !editFront.custom.size&&editedUnit.order.path.pts.length===3&&
  editGroup.slice(1).every((f,i)=>f.order===unchanged[i])&&editedUnit.order!==independentOrder);
 undo();
 check('戻すでリセット前の中間点・終点・進撃が戻る',
  editFront.custom.get(editedUnit)===customEnd&&editedUnit.order.groundAdvance===editFront.advance.group);
 const otherArrow=groundPlanArrows(editFront).find(a=>a.f===otherUnit);
 groundPlanViaAdd(otherUnit,otherArrow.pts[0].clone().lerp(otherArrow.pts[1],.5));
 click({kind:'plan',front:editFront},'reset');
 check('計画線の全隊リセットで2隊とも自動に戻る',!editFront.custom.size);
 undo();
 check('全隊リセットは1回の戻すで復元する',editFront.custom.size===2);
 groundPlanRedraw(editFront);groundPlanTap(c);groundPlanTap(d);groundPlanTap(forward);
 check('計画線の引き直しで全隊の手直しを取り消す',!editFront.custom.size&&!editFront.passed.size);
 undo();
 check('計画線引き直しのUndoで手直しも戻る',editFront.custom.size===2);
 groundFrontRedraw(editFront);groundPlanTap(a);groundPlanTap(b);groundPlanTap(forward);
 check('前線の引き直しでも計画の手直しを取り消す',!editFront.custom.size&&!editFront.passed.size);

 fresh();
 const plans=[unit(10,22),unit(16,22)].map(f=>draw('plan',[f],p(groundMapX(f.pos.x)-1,26),p(groundMapX(f.pos.x)+1,26),p(13,24)));
 const handle=(front,i)=>{
  const {f,markers}=groundPlanArrows(front)[0];
  return {kind:'via',front,plan:front.plan,f,...markers.find(m=>m.i===i)};
 };
 const handles=plans.map(front=>handle(front,0)),undoBeforeBatch=undoStack.length;
 const moveHandles=delta=>groundPlanEditHandles(handles,'move',q=>q.clone().add(delta));
 check('複数の前線の点を移動中、1点だけ盤外なら全経路とUndoを維持',
  !moveHandles(new THREE.Vector3(-11*GROUND_SCALE,0,0))&&plans.every(front=>!front.custom.size)&&
  undoStack.length===undoBeforeBatch&&groundPlanMessage==='通れない場所です');
 const delta=new THREE.Vector3(0,0,GROUND_SCALE*.25);
 check('複数の前線の点を同じ差分で動かし、1回のUndoにまとめる',
  moveHandles(delta)&&handles.every(({front,f,p})=>front.custom.get(f)?.points[0].equals(p.clone().add(delta)))&&
  undoStack.length===undoBeforeBatch+1);
 undo();
 check('1回のUndoで複数の前線の点を復元する',plans.every(front=>!front.custom.size)&&
  handles.every(h=>groundEditSameHandle(h,handle(h.front,0))));
 const selectedForDelete=[...handles,...plans.map(front=>handle(front,null))];
 selectedForDelete.forEach(groundEditSelect);
 click(handles[0],'delete-selected');
 check('選んだ点を削除は複数の前線の中間点だけを消す',plans.every(front=>{
  const {points,dest}=front.custom.get(front.members[0])||{};
  return points?.length===1&&groundPlanDistance(dest,selectedForDelete.find(h=>h.front===front&&h.i===null).p)<1e-6;
 })&&groundEditSelected.length===2&&groundEditSelected.every(h=>h.i===null));
 undo();
 check('選んだ点を削除も1回のUndoで復元する',plans.every(front=>!front.custom.size)&&!groundEditSelected.length);

 fresh();const crossingTank=unit(20,25,'vehicle'),crossingPlan=[p(18,27),p(28,27)];
 const bank={pts:[p(18,31),p(28,31)],plan:{pts:crossingPlan,side:groundPlanSide(crossingPlan,crossingTank.pos)},custom:new Map(),passed:new Map()};
 const crossingSlots=groundPlanDetourSlots(bank,bank.plan,[{f:crossingTank,dest:p(25.5,27),fraction:.75,offset:0}]);
 const crossingRoute=groundFrontRoutes(bank,crossingSlots,true)[0];
 check('回り込みの渡河は端の外の点・後ろの点・渡河点・持ち場の順を保つ',crossingRoute.path?.pts.length===4&&
  crossingRoute.path.pts.every((q,i)=>groundPlanDistance(q,[p(29.5,27),p(29.5,28.5),north,p(25.5,27)][i])<1e-6));

 fresh();const queued=four(),queue=draw('deploy',queued,a,b);
 const firstStart=p(8,31),firstEnd=p(14,31),thirdStart=p(8,33),thirdEnd=p(14,33);
 finish(queued);tick();draw('plan',queued,firstStart,firstEnd);
 const firstPlan=queue.plan;
 check('計画の線の上を選ぶと出発する前線の反対側を使う',firstPlan.side===-groundPlanSide(firstPlan.pts,forward)&&
  groundPlanNearest(groundPlanLine(firstPlan.pts),queued[0].pos).side!==firstPlan.side);
 draw('plan',[queued[0]],d,c,p(11,33));const secondPlan=queue.nextPlans[0];
 check('同じ前線の1隊でも次の計画を追加でき、前の計画と端を揃えて前の側を保つ',queue.plan===firstPlan&&
  secondPlan?.pts[0].equals(c)&&secondPlan.side===groundPlanSide(secondPlan.pts,p(11,33))&&queued.every(f=>!f.order));
 groundPlanExecute();const running=queue.advance,orders=queued.map(f=>f.order);
 draw('plan',queued,thirdStart,thirdEnd,p(11,34));const thirdPlan=queue.nextPlans[1];
 check('実行中も計画を順に追加し、現在の命令や矢印の行き先を保つ',queue.plan===firstPlan&&queue.advance===running&&
  queue.nextPlans.length===2&&queued.every((f,i)=>f.order===orders[i])&&groundPlanArrows(queue).every(a=>a.pts.at(-1).z===firstStart.z));
 const queuedHit=groundPlanPickAt(p(11,33),.1);
 check('待機中の計画線を順番つきで選べる',queuedHit?.kind==='plan'&&queuedHit.index===2&&queuedHit.plan===thirdPlan);
 click(queuedHit,'detour-left');
 check('次の計画にだけ片側指定を保存し、今の進撃は保つ',queue.plan===firstPlan&&queue.plan.detour==='both'&&
  queue.nextPlans[1].detour==='left'&&queued.every((f,i)=>f.order===orders[i]));
 click(groundPlanPickAt(p(11,33),.1),'redraw');groundPlanTap(thirdStart);groundPlanTap(thirdEnd);groundPlanTap(p(11,32));
 const edited=queue.nextPlans[1];
 check('次の計画の引き直しは選んだ1本だけを変える',queue.plan===firstPlan&&queue.nextPlans[0]===secondPlan&&
  edited?.side===-thirdPlan.side&&edited.detour==='left'&&queue.advance===running&&groundWorkAiming==='edit');
 click(groundPlanPickAt(p(11,33),.1),'delete');
 check('次の計画の削除で選んだ1本だけを消す',queue.plan===firstPlan&&queue.nextPlans.length===1&&queue.nextPlans[0]===secondPlan);
 undo();
 check('戻すで削除前の計画の並びと進撃を復元する',queue.nextPlans[0]===secondPlan&&queue.nextPlans[1]===edited&&
  queued.every(f=>f.order?.groundAdvance===queue.advance.group));
 groundPlanDelete(queue);
 check('実行中の計画を削除すると停止し、次の計画を繰り上げる',!queue.advance&&queue.plan===secondPlan&&queue.nextPlans[0]===edited);
 undo();
 check('今の計画の削除を戻すと、繰り上げる前の計画と並びに戻る',queue.plan===firstPlan&&queue.nextPlans[0]===secondPlan&&queue.nextPlans[1]===edited);
 finish(queued);tick();
 check('到着後は前線で止まり、次の計画を表示して実行を待つ',queue.pts===firstPlan.pts&&!queue.advance&&
  queue.plan===secondPlan&&queue.nextPlans[0]===edited&&queued.every(f=>!f.order&&f.groundDeployed)&&
  groundPlanMessage==='計画に到着。実行で次の計画へ');
 groundPlanExecute();
 check('もう一度実行すると繰り上がった計画に向かう',queue.advance&&queued.every(f=>f.order?.dest.z===c.z));
 groundFrontDelete(queue);
 check('前線を削除すると待機中の計画も消える',!groundFronts.includes(queue)&&!queue.nextPlans.length&&!queue.plan);
 undo();
 check('前線の削除を戻すと今の計画と次の計画が戻る',queue.plan===secondPlan&&queue.nextPlans[0]===edited);
 // 地図の端に近い計画（深い後ろの点が通れない）でも、計画の線を突っ切らず、端の外を回って後ろから着く
 {
  fresh();
  const units=Array.from({length:6},(_,i)=>unit(10+7*(i+.5)/6,23));units.push(unit(13.5,22,'artillery'));
  const front=draw('deploy',units,p(10,23),p(17,23),p(13.5,25));finish(units);tick();
  draw('plan',units,p(10,27),p(17,27),p(13.5,25));
  const pass=groundPass,limit=29.6;   // 計画の線の2.6km後ろより先は通れない
  groundPass=(x,y,...args)=>y<limit&&pass(x,y,...args);
  try{groundPlanExecute();}finally{groundPass=pass;}
  const L=groundPlanLine(front.plan.pts),xs=L.pts.map(q=>q.x),lo=Math.min(...xs),hi=Math.max(...xs);
  check('深い後ろの点が通れなくても、全隊が線の端の外を回って後ろから着く',units.every(f=>{
   const path=f.order?.path;
   return path&&groundPlanNearest(L,path.points.at(-2)).side===-front.plan.side&&path.points.some(q=>q.x<lo-1e-6||q.x>hi+1e-6);
  }));
 }
 return rows;
}
function nodeChecks(){
 const {ctx,run}=require('./ground-controls.cjs').createControlsContext();
 ctx.pauseOpened=false;
 return run(`(${planCases.toString()})()`);
}
// 本物のマウスで: 線が決まるまでは左ドラッグですぐ曲線を引き、カメラは回さない（ユーザーの指示 2026-11-21「0.3秒なしで」）
async function checkGroundPlanDrag(page,check){
 const start=await page.evaluate(()=>{
  const exercise=OPS.find(o=>o.id==='groundExercise2');
  WOS.start({op:exercise.id,fleets:exercise.quick});
  if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);hideHint();
  renderer.setPixelRatio(.5);camAnim=null;   // 出撃のカメラの動きを止め、操作で動いたかだけを見る
  window.__planDragView=[camera.position.toArray(),controls.target.toArray()];
  document.getElementById('labels').style.display='none';   // 名札を押すと選択になるので、地図だけを押す
  setSel(groundPlanUnits(fleets).filter(f=>f.team===0&&f.groundKind!=='sea').slice(0,2));
  groundPlanToggle('deploy');
  // 部品に当たらない、地図の上の横の帯を探す
  const r=renderer.domElement.getBoundingClientRect(),cx=r.left+r.width/2;
  const free=(x,y)=>{const hit=pick(x,y);return document.elementFromPoint(x,y)===renderer.domElement&&!!groundAt(x,y)&&!hit.best&&!hit.fort;};
  for(let y=r.top+r.height*.3;y<r.top+r.height*.75;y+=12)
   if([-160,-80,0,80,160].every(dx=>free(cx+dx,y)&&free(cx+dx,y+30)))return {x:cx-160,y};
  return null;
 });
 if(!start){check(false,'前線のドラッグ: 地図の上に空いた帯が見つからない');return;}
 const view=()=>page.evaluate(()=>[...camera.position.toArray(),...controls.target.toArray()].map(v=>+v.toFixed(4)).join(','));
 const state=()=>page.evaluate(()=>({aiming:groundWorkAiming,drawing:!!groundPlanPress?.drawing,stroke:groundLineStroke?.length||0,
  pts:groundLinePts?.length||0,lineStart:!!groundLineStart}));
 const before=await view();
 await page.mouse.move(start.x,start.y);await page.mouse.down();
 await page.mouse.move(start.x+12,start.y+2);
 const early=await state();   // 長押しを待たずに、動かしたところで引き始める
 for(let i=1;i<=8;i++)await page.mouse.move(start.x+40*i,start.y+Math.sin(i/8*Math.PI)*30);
 const mid=await state();
 await page.mouse.up();
 const done=await state(),after=await view();
 check(early.drawing&&mid.stroke>2&&done.pts>2&&done.aiming==='deploy'&&before===after,
  '前線のドラッグ: 左ドラッグはすぐ曲線を引き、カメラは動かさず、前の側を待つ',JSON.stringify({early,mid,done,camera:before===after}));
 // 前の側を待つあいだの左ドラッグは、いつものカメラ
 await page.mouse.move(start.x,start.y+30);await page.mouse.down();
 for(let i=1;i<=4;i++)await page.mouse.move(start.x+30*i,start.y+30);
 await page.mouse.up();
 const side=await state(),rotated=await view();
 check(side.pts===done.pts&&!side.stroke&&rotated!==after,'前線のドラッグ: 前の側を待つあいだの左ドラッグはカメラを回す',JSON.stringify({side,camera:rotated!==after}));
 const fresh=(mode='deploy')=>page.evaluate(mode=>{groundClearAiming();groundPlanToggle(mode);},mode);
 // 回した惰性（減衰）も消してから、初めの視点へ戻す
 const restore=()=>page.evaluate(()=>{controls.enableDamping=false;controls.update();controls.enableDamping=true;
  camera.position.fromArray(window.__planDragView[0]);controls.target.fromArray(window.__planDragView[1]);controls.update();});
 // 動かさないクリックは今までどおり始点
 await restore();await fresh();await page.mouse.click(start.x+160,start.y+30);
 const clicked=await state();
 check(clicked.lineStart&&!clicked.pts,'前線のドラッグ: 動かさないクリックは今までどおり始点',JSON.stringify(clicked));
 // 右のすぐのドラッグはカメラ。押してから動くまでの時刻の差で見るので、ゆっくりした描画に左右されないよう1つの処理で出す
 await restore();await fresh();const beforeRight=await view();
 const right=await page.evaluate(({x,y})=>{
  const el=renderer.domElement,ev=(type,dx,button,buttons)=>new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,
   pointerId:7,pointerType:'mouse',isPrimary:true,button,buttons,clientX:x+dx,clientY:y});
  el.dispatchEvent(ev('pointerdown',0,2,2));
  for(let i=1;i<=4;i++)el.dispatchEvent(ev('pointermove',30*i,-1,2));
  el.dispatchEvent(ev('pointerup',120,2,0));
  return {stroke:groundLineStroke?.length||0,pts:groundLinePts?.length||0};
 },start);
 const afterRight=await view();
 check(!right.stroke&&!right.pts&&afterRight!==beforeRight,'前線のドラッグ: 右のすぐのドラッグはカメラ',JSON.stringify({right,camera:afterRight!==beforeRight}));
 // 右を長押ししてから動かすと引く
 await restore();await fresh();
 await page.mouse.move(start.x,start.y);await page.mouse.down({button:'right'});await page.waitForTimeout(400);
 for(let i=1;i<=8;i++)await page.mouse.move(start.x+40*i,start.y+Math.sin(i/8*Math.PI)*30);
 await page.mouse.up({button:'right'});
 const held=await state();
 check(held.pts>2&&held.aiming==='deploy','前線のドラッグ: 右は長押ししてから動かすと曲線を引く',JSON.stringify(held));
 await restore();await fresh('plan');
 await page.mouse.move(start.x,start.y);await page.mouse.down();
 for(let i=1;i<=8;i++)await page.mouse.move(start.x+40*i,start.y+Math.sin(i/8*Math.PI)*30);
 await page.mouse.up();
 const planDone=await state(),sideAt={x:start.x+160,y:start.y};
 await page.mouse.move(sideAt.x,sideAt.y);
 const preview=await page.evaluate(()=>groundLinePts&&groundPlanSide(groundLinePts,groundLinePointer));
 // ここで見るのは入力（前の側の選び方）だけ。引いた線が画面によって川に掛かり、道が見つからず確定しないことがある（CI）ので、
 // この確かめのあいだは道を空の直線にする
 await page.evaluate(()=>{window.__groundMovePath=groundMovePath;window.groundMovePath=(from,pts,kind,straight)=>window.__groundMovePath(from,pts,'air',straight);});
 await page.mouse.click(sideAt.x,sideAt.y);
 const committed=await page.evaluate(({x,y})=>{
  window.groundMovePath=window.__groundMovePath;
  const plan=groundPlanUnits()[0]?.groundFrontOf?.plan;
  return {chosen:!!plan&&plan.side===groundPlanSide(plan.pts,groundAt(x,y)),message:groundPlanMessage};
 },sideAt);
 check(planDone.aiming==='plan'&&planDone.pts>2&&!!preview&&committed.chosen,
  '進撃計画のドラッグ: 曲線を引いたあと前の側をクリックして確定する',JSON.stringify({planDone,preview,committed}));
 await page.evaluate(()=>{groundClearAiming();document.getElementById('labels').style.display='';});
 await checkGroundRouteEdit(page,check);
}

async function setupGroundRouteEdit(page,count=4){
 await page.evaluate(count=>{
  const kinds=count===7?['infantry','vehicle','heavyInfantry','infantry','vehicle','infantry','artillery']:
   ['infantry','vehicle','heavyInfantry','infantry'];
  const companies=kinds.map((kind,i)=>({
   id:'route'+i,name:'第'+(i+1)+' 中隊',kind
  }));
  const previousNpc=window.WOS_NO_NPC;
  window.WOS_NO_NPC=true;
  WOS.start({op:'groundExercise2',groundOrg:{companies,battalions:[],brigades:[]}});
  window.WOS_NO_NPC=previousNpc;
  if(talking)endTalk();if(deploying)endDeploy();
  setSpeed(0);hideHint();
  const units=companies.map(c=>fleets.find(f=>f.team===0&&f.name===c.name));
  if(units.some(f=>!f))throw Error('経路確認用の隊を置けませんでした');
  const line=[groundPoint(10,23),groundPoint(17,23)],forward=groundPoint(13.5,25);
  for(const {f,dest} of groundPlanSlots(units,line,groundPlanSide(line,forward))){
   f.pos.copy(dest);f.pos.y=groundUnitHeight(f);f.post.copy(f.pos);
  }
  setSel(units);groundPlanToggle('deploy');groundPlanTap(line[0]);groundPlanTap(line[1]);groundPlanTap(forward);
  for(let i=0;i<30&&units.some(f=>f.order);i++)step(.05);
  groundPlanToggle('plan');groundPlanTap(groundPoint(10,27));groundPlanTap(groundPoint(17,27));groundPlanTap(forward);
  window.routeEditDemo=units[0].groundFrontOf;
  if(groundPlanArrows(window.routeEditDemo).length!==count)throw Error('経路確認用の矢印を置けませんでした');
  const brief=document.querySelector('[data-tab="brief"]');
  if(brief.getAttribute('aria-expanded')==='true')brief.click();
  const center=groundPoint(13,25.8);
  camAnim=null;controls.enableDamping=false;controls.target.copy(center);
  camera.position.set(center.x,center.y+47,center.z+16);camera.lookAt(center);controls.update();groundDraw();
 },count);
 await page.locator('#groundEdit').click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

async function routeEditMapPoints(page){
 return page.evaluate(()=>{
  const front=window.routeEditDemo,arrows=groundPlanArrows(front),arrow=arrows[0];
  const project=p=>{const q=groundEditProject(p);return {x:q.x,y:q.z};};
  const usable=(q,kind,f)=>document.elementFromPoint(q.x,q.y)===renderer.domElement&&
   (kind==='free'?!groundEditPick(q.x,q.y)&&!!groundAt(q.x,q.y):
    groundEditPick(q.x,q.y)?.kind===kind&&(!f||groundEditPick(q.x,q.y)?.f===f));
  const handle=arrow.markers.filter(m=>m.i!==null).map(m=>project(m.p)).find(q=>usable(q,'via',arrow.f));
  const second=arrows.slice(1).flatMap(a=>a.markers.filter(m=>m.i!==null)
   .map(m=>project(m.p)).filter(q=>usable(q,'via',a.f))).find(q=>!handle||Math.hypot(q.x-handle.x,q.y-handle.y)>28);
  const line=groundPlanLine(front.plan.pts);
  const plan=[.5,.25,.75,.375,.625,.05,.95].map(t=>project(groundPlanAt(line,line.len*t))).find(q=>usable(q,'plan'));
  const arrowPoint=arrow.shape.map(project).find(q=>usable(q,'arrow',arrow.f));
  const free=[.3,.65,.5].flatMap(x=>[.26,.4,.55].map(y=>({x:W*x,y:H*y}))).find(q=>usable(q,'free'));
  if(!handle||!second||!plan||!arrowPoint||!free)throw Error('編集用の座標が見つからない '+JSON.stringify({handle,second,plan,arrowPoint,free}));
  return {handle,second,plan,arrowPoint,free};
 });
}

async function checkGroundRouteEdit(page,check){
 await setupGroundRouteEdit(page);
 const {handle,plan,arrowPoint,free}=await routeEditMapPoints(page);
 const view=()=>page.evaluate(()=>[...camera.position.toArray(),...controls.target.toArray()].join(','));
 const before=await view();
 await page.evaluate(()=>{
  window.routeEditPathCalls=0;window.originalRouteEditPath=groundMovePath;
  window.groundMovePath=(...args)=>{window.routeEditPathCalls++;return window.originalRouteEditPath(...args);};
 });
 await page.mouse.move(handle.x,handle.y);await page.mouse.down();
 await page.mouse.move(handle.x-30,handle.y+20,{steps:3});
 const mid=await page.evaluate(()=>[!!groundEditDrag,window.routeEditDemo.custom.size,window.routeEditPathCalls]);
 await page.mouse.up();
 const after=await view();
 const edited=await page.evaluate(()=>{
  window.groundMovePath=window.originalRouteEditPath;
  return window.routeEditDemo.custom.get(window.routeEditDemo.members[0])?.isCustomEdited;
 });
 check(mid[0]&&mid[1]===0&&mid[2]===0&&edited&&before===after,
  '経路編集: 本物のマウスで○をドラッグしている間は探索せず、カメラは動かない',JSON.stringify({mid,edited,sameView:before===after}));

 const arrow=edited?(await routeEditMapPoints(page)).arrowPoint:arrowPoint;
 await page.mouse.click(arrow.x,arrow.y,{button:'right'});
 await page.locator('#groundEditPick [data-action="reset"]').click();
 await page.mouse.click(arrowPoint.x,arrowPoint.y);
 const added=await page.evaluate(()=>window.routeEditDemo.custom.get(window.routeEditDemo.members[0])?.points.length);
 check(added===3,'経路編集: 矢印の右クリックで自動に戻し、左クリックで点を追加する',String(added));
 await page.mouse.click(plan.x,plan.y);
 const sides=page.locator('#groundEditPick');
 const both=await sides.locator('[data-action="detour-both"]').textContent();
 await sides.locator('[data-action="detour-left"]').click();
 const chosen=await page.evaluate(()=>window.routeEditDemo.plan.detour);
 check(both.startsWith('✓')&&chosen==='left','経路編集: 計画線のメニューで使う側を変更する');
 await page.mouse.move(free.x,free.y);await page.mouse.down();
 await page.mouse.move(free.x+85,free.y+10,{steps:4});await page.mouse.up();
 const editedCount=await page.evaluate(()=>window.routeEditDemo.custom.size);
 check(await view()!==after&&editedCount===1,'経路編集: ○の外をドラッグするとカメラが動き、点は増えない');
 await page.evaluate(()=>{controls.enableDamping=true;groundClearAiming();});

 await setupGroundRouteEdit(page);
 const picks=await routeEditMapPoints(page);
 const countSelected=()=>page.evaluate(()=>groundEditSelected.length);
 const shiftClick=async (point,held=false)=>{
  await page.keyboard.down('Shift');
  try{
   await page.mouse.move(point.x,point.y);await page.mouse.down();
   if(held)await page.waitForTimeout(550);
   await page.mouse.up();
  }finally{await page.keyboard.up('Shift');}
 };
 await shiftClick(picks.handle);await shiftClick(picks.second,true);
 const beforeMove=await page.evaluate(()=>{
  window.routeEditSelected=[...groundEditSelected];
  return {count:groundEditSelected.length,menu:!document.getElementById('groundEditPick').hidden};
 });
 check(beforeMove.count===2&&!beforeMove.menu,'経路編集: 本物のマウスでShift＋クリックとShift＋長押しで別隊の輪を選ぶ');
 const beforeGroupDrag=await view();
 await page.mouse.move(picks.handle.x,picks.handle.y);await page.mouse.down();
 await page.mouse.move(picks.handle.x-28,picks.handle.y+18,{steps:3});await page.mouse.up();
 const groupMove=await page.evaluate(()=>{
  const changes=window.routeEditSelected.map(({front,f,p,i})=>{
   const edit=front.custom.get(f),to=i===null?edit?.dest:edit?.points[i];
   return edit?.isCustomEdited&&to?to.clone().sub(p):null;
  });
  return {moved:changes.length===2&&changes.every(Boolean)&&changes[0].length()>1e-6&&changes[0].distanceTo(changes[1])<1e-6,
   selected:groundEditSelected.length};
 });
 check(groupMove.moved&&groupMove.selected===2&&await view()===beforeGroupDrag,
  '経路編集: 本物のマウスで選んだ輪をドラッグすると2隊の輪が同じだけ動き、両方が手直し済みになる',JSON.stringify(groupMove));
 await page.mouse.click(picks.free.x,picks.free.y);
 check(await countSelected()===0,'経路編集: 地図の空いた場所のクリックで複数選択を解除する');
 await page.evaluate(()=>undo());
 const undone=await page.evaluate(()=>window.routeEditDemo.custom.size===0&&window.routeEditSelected.every(h=>
  groundPlanArrows(h.front).find(a=>a.f===h.f)?.markers.some(m=>m.i===h.i&&groundPlanDistance(m.p,h.p)<1e-6)));
 check(undone,'経路編集: Undoを1回押すと両方の輪が戻る');
 await page.locator('#groundEdit').click();
 const cdp=await page.context().newCDPSession(page);
 const touch=async expected=>{
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:picks.handle.x,y:picks.handle.y}]});
  let during;
  try{
   await page.waitForFunction(n=>groundEditSelected.length===n,expected,{timeout:15000});
   during=await countSelected();
  }finally{
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  return [during,await countSelected()];
 };
 try{
  const first=await touch(1),second=await touch(0);
  check(first.every(n=>n===1)&&second.every(n=>n===0),'経路編集: タッチ長押しで選択と解除が切り替わる',JSON.stringify({first,second}));
 }finally{await cdp.detach();}
 await shiftClick(picks.handle);
 await page.keyboard.press('Escape');
 check(await countSelected()===0&&await page.evaluate(()=>groundWorkAiming===null),'経路編集: Escで選択を解除して編集を終える');
 await page.locator('#groundEdit').click();await shiftClick(picks.handle);
 await page.locator('#groundEdit').click();
 check(await countSelected()===0,'経路編集: 編集・削除ボタンで終えると選択を解除する');
 await page.evaluate(()=>{controls.enableDamping=true;groundClearAiming();});
}
module.exports={nodeChecks,checkGroundPlanDrag,setupGroundRouteEdit,routeEditMapPoints};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`共有命令 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
