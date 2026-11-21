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
 const instant=groundFrontNow(edit),oldFixedLine=edit.pts;
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

 fresh();select(null);
 groundPlanToggle('edit');groundPlanHud([]);
 check('前線がないと編集・削除は押せない',document.getElementById('groundEdit').disabled&&!groundWorkAiming);
 const own=four(),target=draw('deploy',own,a,b),lead=own[0];
 finish(own);tick();draw('plan',own,c,d);select(null);
 groundPlanToggle('edit');groundPlanHud([]);
 check('部隊選択なしでも編集・削除を開始',groundWorkAiming==='edit'&&!document.getElementById('groundEdit').disabled);
 const click=(hit,id)=>groundEditActions(hit).find(a=>a[0]===id)[2]();
 click({kind:'plan',front:target},'redraw');groundPlanTap(p(8,31));groundPlanTap(p(14,31));
 check('計画の編集ボタンで引き直して編集・削除へ戻る',target.plan.pts[0].equals(p(8,31))&&groundWorkAiming==='edit');
 click({kind:'front',front:target},'redraw');groundPlanTap(a);groundPlanTap(b);groundPlanTap(forward);
 check('前線の編集ボタンで向きを指定して編集・削除へ戻る',!!target.plan&&groundWorkAiming==='edit');
 finish(own);tick();
 const viaPoint=p(8.5,28);
 click({kind:'arrow',front:target,f:lead},'location');hitPoint=viaPoint;groundEditTap(0,0);
 const hit=groundPlanPickAt(viaPoint,.01);
 check('矢印の追加ボタンで前線上に○ができ、線より先に当たる',hit?.kind==='via'&&hit.front===target&&hit.f===lead&&hit.i===0);
 const movedVia=p(7,29);
 click(hit,'location');hitPoint=movedVia;groundEditTap(0,0);
 check('○の編集ボタンが移動を行い、確定前の曲線も通る',
   groundWorkAiming==='edit'&&target.via.get(lead)[0].equals(movedVia)&&
   groundPlanNearest(groundPlanLine(groundPlanArrows(target).find(a=>a.f===lead).shape),movedVia).d<1e-6);
 const preview=groundPlanPreview(target),shape=groundPlanRouteShape(preview[0].path,0);
 groundPlanArrows(target);
 check('計画の経路と曲線は入力が変わるまで再利用する',groundPlanPreview(target)===preview&&groundPlanRouteShape(preview[0].path,0)===shape);
 setSel(own);groundPlanExecute();
 check('移動した○を実際の進撃経路が通る',groundPlanNearest(groundPlanLine(lead.order.path.points),movedVia).d<1e-6);
 groundPlanToggle('edit');click({kind:'via',front:target,f:lead,i:0},'delete');
 check('○の削除ボタンで進撃から経由地を外し、編集・削除は続く',
   !target.via.has(lead)&&groundWorkAiming==='edit'&&groundPlanNearest(groundPlanLine(lead.order.path.points),movedVia).d>GROUND_SCALE);
 const prevPos=lead.pos.clone();groundFollow(lead,1);
 const rest=groundPlanArrows(target).find(a=>a.f===lead).shape;
 check('進撃の矢印は現在地から始まり、通過した道は消える',
   rest[0]===lead.pos&&groundPlanNearest(groundPlanLine(rest),prevPos).d>1e-6);
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
   pts:[p(20,lo),p(20,hi)],plan:{pts:[p(26,lo),p(26,hi)]},via:new Map(),passed:new Map()
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
  two.via.set(tanks[3],[p(21,21)]);
  const pinned=groundFrontRoutes(two,slots,true);
  check('中継地点の隊を中央橋の1隊に数え、残りを割り振って2隊ずつ',count(pinned,north)===2&&count(pinned,central)===2&&
   crossing(pinned[3].path,sites)?.equals(central)&&pinned[3].path.pts.length===2);
  one.via.set(tanks[3],[north]);
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
 const fresh=()=>page.evaluate(()=>{groundClearAiming();groundPlanToggle('deploy');});
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
 await page.evaluate(()=>{groundClearAiming();document.getElementById('labels').style.display='';});
}
module.exports={nodeChecks,checkGroundPlanDrag};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`共有命令 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
