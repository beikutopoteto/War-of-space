/* 地上作戦の共有命令。線はクリック2回の直線か、長押ししてから引く曲線（ユーザーの指示 2026-11-20）。保存形式は変えず作戦中だけ保持。
   線は点の並び（pts）で持つ。直線は [始点, 終点] の2点。side は前の側（線の向きの左の法線 (-tz,tx) の側なら +1、反対なら -1） */
let groundLineStart=null,groundLinePts=null,groundLinePointer=null,groundLineStroke=null,groundPlanMessage='',groundPlanVisual=null;
let groundFronts=[],groundFrontNextId=1,groundFrontCheckAt=0,groundFrontEditing=null;
function groundFrontAvailable(f){
  return f.alive&&f.team===0&&!f.locked&&!f.embarked&&!f.groundRout&&groundCommandAllowed(f,'move');
}
function groundPlanUnits(list=orderTargets()){return list.filter(groundFrontAvailable);}
function groundPlanCancelInput(){
  groundLineStart=groundLinePts=groundLinePointer=groundLineStroke=groundFrontEditing=null;
  groundPlanMessage='';
}
function groundPlanReset(){
  groundPlanCancelInput();
  for(const front of groundFronts)for(const f of front.members)groundFrontClearMember(f);
  groundFronts=[];groundFrontNextId=1;groundFrontCheckAt=0;
  if(groundPlanVisual){
    for(const m of Object.values(groundPlanVisual.meshes)){m.parent?.remove(m);m.geometry.dispose();m.material.dispose();}
    groundPlanVisual=null;
  }
}
function groundPlanToggle(mode){
  if(!op.ground||over||deploying||!groundPlanUnits().length)return;
  const next=groundWorkAiming===mode?null:mode;groundClearAiming();groundWorkAiming=next;groundHud();
}
/* 線の形: 点の並びと、始点からの長さの累計。重なった点は除く */
function groundPlanLine(pts){
  const P=[],cum=[];
  for(const p of pts){if(P.length&&Math.hypot(p.x-P[P.length-1].x,p.z-P[P.length-1].z)<1e-6)continue;cum.push(P.length?cum[cum.length-1]+Math.hypot(p.x-P[P.length-1].x,p.z-P[P.length-1].z):0);P.push(p);}
  return {pts:P,cum,len:cum[cum.length-1]||0};
}
// 始点から s の長さの点
function groundPlanAt(L,s){
  if(L.pts.length<2)return {x:L.pts[0]?.x||0,y:L.pts[0]?.y||0,z:L.pts[0]?.z||0};
  s=Math.max(0,Math.min(L.len,s));let i=1;while(i<L.pts.length-1&&L.cum[i]<s)i++;
  const a=L.pts[i-1],b=L.pts[i],t=(s-L.cum[i-1])/(L.cum[i]-L.cum[i-1]);
  return {x:a.x+(b.x-a.x)*t,y:(a.y||0)+((b.y||0)-(a.y||0))*t,z:a.z+(b.z-a.z)*t};
}
// s での線の向き（前後 w の幅でならす。直線なら線の向きそのもの）
function groundPlanDir(L,s,w){
  const a=groundPlanAt(L,Math.max(0,s-w)),b=groundPlanAt(L,Math.min(L.len,s+w)),d=Math.hypot(b.x-a.x,b.z-a.z);
  if(d>1e-9)return {x:(b.x-a.x)/d,z:(b.z-a.z)/d};
  const p=L.pts[0],q=L.pts[L.pts.length-1],e=Math.hypot(q.x-p.x,q.z-p.z)||1;return {x:(q.x-p.x)/e,z:(q.z-p.z)/e};
}
// p にいちばん近い線の上の点: 始点からの長さ s と、p のある側（+1/-1。線の上なら 0）
function groundPlanNearest(L,p){
  let best={d:Infinity,s:0,side:0};
  for(let i=1;i<L.pts.length;i++){
    const a=L.pts[i-1],b=L.pts[i],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=l2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l2)):0;
    const d=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
    if(d<best.d-1e-9){const c=-dz*(p.x-a.x)+dx*(p.z-a.z);best={d,s:L.cum[i-1]+Math.sqrt(l2)*t,side:Math.abs(c)<1e-9?0:Math.sign(c)};}
  }
  return best;
}
// 前の側: 線のどちら側に p があるか。線の上なら null（自軍の隊の反対側に任せる）
function groundPlanSide(pts,p){const L=groundPlanLine(pts);if(L.len<1e-6||!p)return null;return groundPlanNearest(L,p).side||null;}
const GROUND_PLAN_FRONT=new Set(['infantry','heavyInfantry','commando','vehicle','was','mechanicalAssault','scout']);
const GROUND_PLAN_ROW_KM=1,GROUND_FRONT_SINGLE_KM=1,GROUND_FRONT_BREACH_KM=3,GROUND_FRONT_LOST_SEC=30;
const GROUND_FRONT_CHECK_SEC=.5,GROUND_FRONT_SAMPLES=64;
const groundPlanDistance=(p,q)=>Math.hypot(p.x-q.x,p.z-q.z);
function groundFrontPresent(front){return front.members.filter(f=>!f.groundFrontAway&&!groundFrontBusy(f,front));}
function groundFrontSort(list,L){
  const a=L.pts[0],b=L.pts[L.pts.length-1];
  return list.map(f=>({f,s:groundPlanNearest(L,f.pos).s,along:(f.pos.x-a.x)*(b.x-a.x)+(f.pos.z-a.z)*(b.z-a.z)}))
    .sort((a,b)=>a.s-b.s||a.along-b.along||a.f.id-b.f.id).map(({f})=>f);
}
function groundPlanFace(L,s,side){
  const d=groundPlanDir(L,s,.5*GROUND_SCALE);
  return {x:-d.z*side,z:d.x*side};
}
function groundPlanSlots(list,pts,side){
  const L=groundPlanLine(pts),slots=[];
  const front=list.filter(f=>GROUND_PLAN_FRONT.has(f.groundKind)),back=list.filter(f=>!GROUND_PLAN_FRONT.has(f.groundKind));
  for(const [row,offset] of [[front,0],[back,GROUND_PLAN_ROW_KM*GROUND_SCALE]]){
    for(const [i,f] of row.entries()){
      const fraction=(i+.5)/row.length,s=L.len*fraction,q=groundPlanAt(L,s),face=groundPlanFace(L,s,side);
      const dest=new THREE.Vector3(q.x-face.x*offset,q.y,q.z-face.z*offset);
      slots.push({f,dest,fraction,offset,line:{width:L.len/row.length,face}});
    }
  }
  return slots;
}
function groundFrontDefaultSide(L,list){
  const c=list.reduce((v,f)=>v.add(f.pos),new THREE.Vector3()).divideScalar(list.length||1);
  return groundPlanNearest(L,c).side>=0?-1:1;
}
function groundFrontFromUnits(list,planLine){
  const row=list.filter(f=>GROUND_PLAN_FRONT.has(f.groundKind));
  const members=groundFrontSort(row.length?row:list,planLine),L=groundPlanLine(members.map(f=>f.pos));
  let pts;
  if(L.len<1e-6){
    const p=members[0].pos,d=groundPlanDir(planLine,groundPlanNearest(planLine,p).s,.5*GROUND_SCALE);
    const v=new THREE.Vector3(d.x,0,d.z).multiplyScalar(GROUND_FRONT_SINGLE_KM*GROUND_SCALE/2);
    pts=[p.clone().sub(v),p.clone().add(v)];
  }else{
    pts=L.pts.map(p=>p.clone());
    const last=pts.length-1;
    pts[0].lerp(pts[1],-.5);pts[last].lerp(L.pts[last-1],-.5);
  }
  const line=groundPlanLine(pts),mid=groundPlanAt(planLine,planLine.len/2);
  return {pts,side:groundPlanNearest(line,mid).side||-groundFrontDefaultSide(line,list)};
}
function groundFrontAlign(pts,side,start){
  const reverse=groundPlanDistance(start,pts[pts.length-1])<groundPlanDistance(start,pts[0]);
  return {pts:reverse?[...pts].reverse():pts,side:reverse?-side:side};
}
function groundFrontPlan(front,pts){
  const L=groundPlanLine(pts),from=groundPlanLine(front.advance?groundFrontPosition(front,groundFrontProgress(front)):front.pts);
  const center=groundPlanAt(from,from.len/2);
  const side=-groundPlanNearest(L,center).side||groundFrontDefaultSide(L,front.members);
  return groundFrontAlign(pts,side,from.pts[0]);
}
function groundFrontCreate(line,list){
  const front={id:groundFrontNextId++,pts:line.pts,side:line.side,members:groundFrontSort(list,groundPlanLine(line.pts)),
    plan:null,advance:null,via:new Map(),passed:new Map(),slots:[],retryRevision:null};
  groundFronts.push(front);
  for(const f of front.members){groundFrontClearMember(f);f.groundFrontOf=front;}
  return front;
}
function groundFrontClearMember(f){
  f.groundFrontOf=null;f.groundFrontAway=false;f.groundFrontEngagement=null;
}
function groundFrontOwnOrder(f,front){return f.order?.groundFrontId===front.id;}
function groundFrontStopOrder(f){
  f.order=null;dropArrow(f.arrow);f.arrow=null;f.strike=null;
}
function groundFrontRemoveMembers(list){
  const affected=new Set();
  for(const f of list){
    const front=f.groundFrontOf;if(!front)continue;
    affected.add(front);groundFrontClearMember(f);
    front.members=front.members.filter(u=>u!==f);front.via.delete(f);front.passed.delete(f);
    if(groundFrontOwnOrder(f,front))groundFrontStopOrder(f);
  }
  for(const front of affected){
    if(front.members.length)groundFrontRefresh(front);
    else{
      front.plan=front.advance=null;front.slots=[];
      groundFronts=groundFronts.filter(other=>other!==front);
    }
  }
}
function groundFrontBusy(f,front){
  return !groundFrontAvailable(f)||f.order&&!groundFrontOwnOrder(f,front)||f.queue?.length||f.pending||
    f.groundAirTask||f.groundBuilding||f.groundUnloading||f.groundGiving||f.bandTo||
    f.groundAreaSalvo||f.groundBombRun||(f.groundVolley&&!f.groundVolley.ledger?.target);
}
// 航空機は旋回中にも距離を積算するので、通過した経由地は飛行側の到達位置で数える。
function groundFrontAirWaypoints(o){return o.path.pts.slice(o.path.atIndex-1);}
function groundFrontViaIndex(front,f){
  const passed=front.passed.get(f)||0,o=f.order;
  if(!front.advance||o?.groundAdvance!==front.advance.group||!o.path)return passed;
  const remaining=groundFlyingAircraft(f)?groundFrontAirWaypoints(o).length:
    o.path.at.filter(s=>s>o.path.s+1e-8).length;
  return Math.max(passed,(front.via.get(f)?.length||0)-Math.max(0,remaining-1));
}
function groundFrontRememberVia(f){
  const front=f.groundFrontOf;
  if(front?.advance&&f.order?.groundAdvance===front.advance.group&&front.via.has(f))
    front.passed.set(f,groundFrontViaIndex(front,f));
}
function groundFrontRoutes(front,slots,advance){
  return slots.map(s=>{
    const via=advance?(front.via.get(s.f)||[]).slice(groundFrontViaIndex(front,s.f)):[];
    return {...s,path:groundMovePath(s.f.pos,[...via,s.dest],groundMoveKind(s.f))};
  });
}
function groundFrontIssue(front,{f,dest,path,line}){
  f.queue=[];
  order(f,{type:'move',dest,groundPreparedPath:path,groundFrontId:front.id,groundLine:line,
    ...(front.advance?{groundAdvance:front.advance.group}:{groundDeploy:true})});
}
function groundFrontRefresh(front,force=false){
  const line=front.advance?front.plan:front;
  const slots=groundPlanSlots(groundFrontPresent(front),line.pts,line.side);
  const previous=new Map(front.slots.map(s=>[s.f,s]));
  const changed=slots.filter(s=>{
    const old=previous.get(s.f);
    return force||!old||old.dest.distanceToSquared(s.dest)>1e-12||old.line.width!==s.line.width||
      old.line.face.x!==s.line.face.x||old.line.face.z!==s.line.face.z;
  });
  for(const {f} of changed)groundFrontRememberVia(f);
  const routes=groundFrontRoutes(front,changed,!!front.advance);
  front.slots=slots.filter(s=>!routes.some(r=>r.f===s.f&&!r.path));
  front.retryRevision=front.slots.length===slots.length?null:groundBridgeRevision;
  for(const r of routes){
    if(r.path)groundFrontIssue(front,r);
    else if(groundFrontOwnOrder(r.f,front))groundFrontStopOrder(r.f);
  }
}
function groundFrontSample(pts){
  const L=groundPlanLine(pts);
  return Array.from({length:GROUND_FRONT_SAMPLES},(_,i)=>groundPlanAt(L,L.len*i/(GROUND_FRONT_SAMPLES-1)));
}
function groundFrontStart(front,routes,from=front.pts){
  front.advance={from:groundFrontSample(from),to:groundFrontSample(front.plan.pts),
    lengthFrom:groundPlanLine(from),group:{units:front.members},t:0};
  front.slots=routes.map(({f,dest,fraction,offset,line})=>({f,dest,fraction,offset,line}));
  front.retryRevision=null;
  for(const route of routes)groundFrontIssue(front,route);
}
function groundFrontProgress(front){
  const a=front.advance,slots=front.slots.filter(({f})=>!f.groundFrontAway&&!groundFrontBusy(f,front));
  const row=slots.filter(s=>!s.offset),sample=row.length?row:slots;
  if(!sample.length)return a.t;
  return sample.reduce((sum,{f,fraction,offset,dest})=>{
    const s=a.lengthFrom.len*fraction,p=groundPlanAt(a.lengthFrom,s),face=groundPlanFace(a.lengthFrom,s,front.side);
    const from={x:p.x-face.x*offset,z:p.z-face.z*offset},length=groundPlanDistance(from,dest);
    return sum+(length<1e-6?1:Math.max(0,Math.min(1,1-groundPlanDistance(f.pos,dest)/length)));
  },0)/sample.length;
}
function groundFrontPosition(front,t=front.advance?.t){
  if(!front.advance)return front.pts;
  const {from,to}=front.advance;
  return from.map((p,i)=>new THREE.Vector3(p.x,p.y,p.z).lerp(to[i],t));
}
function groundFrontStop(front){
  if(!front.advance)return;
  for(const f of front.members)groundFrontRememberVia(f);
  front.pts=groundFrontPosition(front,groundFrontProgress(front));
  front.advance=null;groundFrontRefresh(front,true);
}
function groundFrontArrive(front){
  front.pts=front.plan.pts;front.side=front.plan.side;front.plan=front.advance=null;front.via.clear();front.passed.clear();
}
function groundFrontDefend(f){
  groundCancelWork(f);groundClearOrders(f);f.groundDeployed=true;f.post.copy(f.pos);f.stance='engage';
}
function groundFrontEndEngagement(f,front){
  f.groundFrontEngagement=null;
  if(groundFrontOwnOrder(f,front)&&f.order.groundFrontEngage)groundFrontStopOrder(f);
}
function groundFrontTrack(front){
  let changed=false;
  for(const f of front.members){
    const engagement=f.groundFrontEngagement;
    if(engagement){
      const {target}=engagement;
      const ended=!groundFrontOwnOrder(f,front)||!f.order.groundFrontEngage||!target.alive||target.groundRout||groundAbsent(target)||target.embarked;
      if(!ended&&groundSeenBy(0,target))engagement.lastSeen=gameSec;
      if(ended||gameSec-engagement.lastSeen>=GROUND_FRONT_LOST_SEC)groundFrontEndEngagement(f,front);
    }
    groundFrontRememberVia(f);
    const away=!!(f.groundFrontEngagement||groundFrontBusy(f,front));
    if(away!==f.groundFrontAway){f.groundFrontAway=away;changed=true;}
  }
  return changed;
}
function groundFrontBreach(front,enemies){
  const present=groundFrontPresent(front),L=groundPlanLine(groundFrontPosition(front));
  const engaged=new Set(front.members.map(f=>f.order?.type==='attack'?f.order.target:null));let changed=false;
  for(const target of enemies){
    if(engaged.has(target))continue;
    const {d,s,side}=groundPlanNearest(L,target.pos);
    if(side!==-front.side||d>GROUND_FRONT_BREACH_KM*GROUND_SCALE||s<=1e-6||s>=L.len-1e-6)continue;
    let chosen=null,closest=Infinity;
    for(const f of present){
      const distance=groundPlanDistance(f.pos,target.pos);
      if(!f.groundFrontAway&&distance<closest&&groundManualTargetAllowed(f,target)){chosen=f;closest=distance;}
    }
    if(!chosen)continue;
    order(chosen,{type:'attack',target,groundFrontId:front.id,groundFrontEngage:true});
    chosen.groundFrontEngagement={target,lastSeen:gameSec};chosen.groundFrontAway=true;changed=true;
  }
  return changed;
}
function groundFrontKeepPlayer(){
  if(!groundFronts.length||typeof autoMode==='undefined'||!autoMode||op.groundDrill)return;
  const players=npcAutoState()?.auto?.players;
  const unclaimed=[];
  for(const front of groundFronts)for(const f of front.members){
    const player=players?.get(f.id);
    if(player)player.idle=null;
    else if(f.alive)unclaimed.push(f);
  }
  if(unclaimed.length)npcAutoPlayer(unclaimed);
}
function groundFrontStep(){
  if(!groundFronts.length||gameSec+1e-8<groundFrontCheckAt)return;
  groundFrontCheckAt=gameSec+GROUND_FRONT_CHECK_SEC;
  const lost=groundFronts.flatMap(front=>front.members.filter(f=>!f.alive||f.team!==0||f.groundExited));
  groundFrontRemoveMembers(lost);
  const enemies=fleets.filter(f=>f.team===1&&f.alive&&!f.embarked&&!groundAbsent(f)&&!f.groundRout&&
    (f.band||'ground')==='ground'&&f.groundKind!=='sea'&&!groundFlyingAircraft(f)&&groundSeenBy(0,f));
  let completed=false;
  for(const front of groundFronts){
    const changed=groundFrontTrack(front);
    if(front.advance)front.advance.t=groundFrontProgress(front);
    const breached=groundFrontBreach(front,enemies);
    if(changed||breached||front.slots.some(({f})=>!f.alive||f.team!==0||f.groundExited)||
      front.retryRevision!==null&&front.retryRevision!==groundBridgeRevision)groundFrontRefresh(front);
    if(front.advance&&front.retryRevision===null&&front.slots.length&&front.slots.every(({f})=>!f.order)){
      groundFrontArrive(front);completed=true;
    }
  }
  if(completed){if(['進撃を開始','進撃中の行き先を変更'].includes(groundPlanMessage))groundPlanMessage='';groundHud();}
}
/* 引いた線をならす: 0.1km ごとに取り直し、前後の点と3回ならし（両端は動かさない）、0.25km ごとの点にする */
function groundPlanSmooth(raw){
  const L0=groundPlanLine(raw),step=.1*GROUND_SCALE,n=Math.max(1,Math.round(L0.len/step));
  let P=[];for(let i=0;i<=n;i++)P.push(groundPlanAt(L0,L0.len*i/n));
  for(let pass=0;pass<3;pass++)P=P.map((p,i)=>i===0||i===P.length-1?p:{x:(P[i-1].x+2*p.x+P[i+1].x)/4,z:(P[i-1].z+2*p.z+P[i+1].z)/4});
  const L=groundPlanLine(P),m=Math.max(1,Math.round(L.len/(.25*GROUND_SCALE))),out=[];
  for(let i=0;i<=m;i++){const q=groundPlanAt(L,L.len*i/m);out.push(new THREE.Vector3(q.x,0,q.z));}
  return out;
}
function groundPlanTap(p){
  if(!op.ground||!['deploy','plan'].includes(groundWorkAiming))return;
  if(groundLinePts){groundPlanFinish(groundLinePts,p);return;}   // 前線の3回目: 前の側
  if(!groundLineStart){groundLineStart=p.clone();groundLinePointer=p.clone();groundHud();return;}
  if(Math.hypot(p.x-groundLineStart.x,p.z-groundLineStart.z)<1e-6){groundPlanMessage='始点から離れた場所を終点に指定してください';groundHud();return;}
  groundPlanLineDone([groundLineStart.clone(),p.clone()],p);
}
// 線ができた: 前線は前の側を待つ（ユーザーの指示 2026-11-20「前線は前となる向きを決めれるように」）。進撃計画はすぐ決める
function groundPlanLineDone(pts,pointer){
  groundLineStart=null;
  if(groundWorkAiming==='deploy'){groundLinePts=pts;groundLinePointer=pointer?.clone()||null;groundPlanMessage='';groundHud();return;}
  groundPlanFinish(pts,null);
}
function groundPlanFinish(pts,frontAt){
  const mode=groundWorkAiming,editing=groundFrontEditing;
  const list=editing?groundFrontPresent(editing):groundPlanUnits();
  if(editing&&!groundFronts.includes(editing)||!editing&&!list.length){groundClearAiming();groundHud();return;}
  const L=groundPlanLine(pts);
  if(L.len<1e-6){groundPlanReport('始点から離れた場所を終点に指定してください');return;}
  let front=editing,routes,plan,sorted;
  let line={pts,side:groundPlanSide(pts,frontAt)||groundFrontDefaultSide(L,list)};
  if(mode==='deploy'){
    if(front?.plan)line=groundFrontAlign(pts,line.side,front.plan.pts[0]);
    sorted=groundFrontSort(editing?editing.members:list,groundPlanLine(line.pts));
    routes=groundFrontRoutes(null,groundPlanSlots(sorted.filter(f=>list.includes(f)),line.pts,line.side),false);
  }else{
    const current=list[0]?.groundFrontOf;
    front=editing||(current&&list.every(f=>f.groundFrontOf===current)&&groundFrontPresent(current).every(f=>list.includes(f))?current:null);
    if(!front)line=groundFrontFromUnits(list,L);
    plan=groundFrontPlan(front||{...line,members:list},pts);
    const members=front?groundFrontPresent(front):groundFrontSort(list,groundPlanLine(line.pts));
    // 引き直した計画を実行中なら、現在地から新しい線までの全経路を確かめる。
    const routeFront=front||{via:new Map(),passed:new Map()};
    routes=groundFrontRoutes(routeFront,groundPlanSlots(members,plan.pts,plan.side),true);
  }
  const blocked=routes.find(r=>!r.path);
  if(blocked){groundPlanReport(blocked.f.name+'：指定位置まで通れる経路がありません');return;}
  saveUndo(editing?editing.members:list);
  npcAutoPlayer(editing?editing.members:list);
  if(!front){groundFrontRemoveMembers(list);front=groundFrontCreate(line,list);
    if(mode==='plan')groundFrontTrack(front);}
  if(mode==='deploy'){
    front.pts=line.pts;front.side=line.side;front.members=sorted;front.advance=null;front.retryRevision=null;
    front.slots=routes.map(({path,...slot})=>slot);
    for(const route of routes)groundFrontIssue(front,route);
  }else{
    const from=front.advance&&groundFrontPosition(front,groundFrontProgress(front));
    if(from)for(const f of front.members)groundFrontRememberVia(f);
    front.plan=plan;
    if(from)groundFrontStart(front,routes,from);
  }
  groundClearAiming();
  groundPlanReport(mode==='plan'?(front.advance?'進撃中の行き先を変更':list.length+'隊の進撃計画を準備（実行で開始）'):list.length+'隊が前線へ移動を開始');
}
function groundPlanReport(message){groundPlanMessage=message;groundHud();}
/* 曲線（ユーザーの指示 2026-11-20「右クリック長押しで、ひいて行く」）: 前線・進撃計画の入力中に、ボタン（右でも左でも）か指を
   GROUND_PLAN_HOLD_MS のあいだ動かさずに押し続けると線を引き始め、離すと決まる。すぐ動かせば今までどおりカメラが動く */
const GROUND_PLAN_HOLD_MS=300,GROUND_PLAN_STROKE_MIN_KM=.3;
function groundPlanStrokeStart(p){
  if(!op.ground||!['deploy','plan'].includes(groundWorkAiming)||!p)return false;
  groundLineStroke=[p.clone()];groundLinePointer=p.clone();groundHud();return true;
}
function groundPlanStrokeMove(p){
  if(!groundLineStroke||!p)return;groundLinePointer=p.clone();
  const q=groundLineStroke[groundLineStroke.length-1];if(Math.hypot(p.x-q.x,p.z-q.z)>=.04*GROUND_SCALE)groundLineStroke.push(p.clone());
}
// 短すぎる線は引かなかったことにする（そのまま離したときのクリックは、ふつうのクリックとして効く）
function groundPlanStrokeEnd(){
  const raw=groundLineStroke;groundLineStroke=null;if(!raw)return;
  if(groundPlanLine(raw).len<GROUND_PLAN_STROKE_MIN_KM*GROUND_SCALE){groundHud();return;}
  groundPlanLineDone(groundPlanSmooth(raw),raw[raw.length-1]);
}
let groundPlanPress=null;
if(typeof renderer!=='undefined'&&renderer?.domElement){
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(groundPlanPress){clearTimeout(groundPlanPress.timer);if(groundPlanPress.drawing)groundLineStroke=null;groundPlanPress=null;groundHud();return;}   // 2本目の指: つまむ・回すに任せる
    if(!op.ground||deploying||!['deploy','plan'].includes(groundWorkAiming))return;
    const press={id:e.pointerId,x:e.clientX,y:e.clientY,drawing:false};
    press.timer=setTimeout(()=>{if(groundPlanPress===press)press.drawing=groundPlanStrokeStart(groundAt(press.x,press.y));},GROUND_PLAN_HOLD_MS);
    groundPlanPress=press;
  });
  // 引いているあいだは、カメラ（OrbitControls）へ動きを渡さない
  addEventListener('pointermove',e=>{
    const press=groundPlanPress;if(!press||e.pointerId!==press.id)return;
    if(press.drawing){e.stopPropagation();groundPlanStrokeMove(groundAt(e.clientX,e.clientY));return;}
    if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>=8){clearTimeout(press.timer);groundPlanPress=null;}
  },{capture:true});
  addEventListener('touchmove',e=>{if(groundPlanPress?.drawing){e.stopPropagation();e.preventDefault();}},{capture:true,passive:false});
  const release=e=>{const press=groundPlanPress;if(!press||e.pointerId!==press.id)return;clearTimeout(press.timer);groundPlanPress=null;if(press.drawing)groundPlanStrokeEnd();};
  addEventListener('pointerup',release,{capture:true});addEventListener('pointercancel',release,{capture:true});
}
function groundPlanSelected(list){
  return [...new Set(groundPlanUnits(list).map(f=>f.groundFrontOf).filter(front=>front?.plan))];
}
function groundPlanExecute(){
  if(!op.ground||over||deploying)return;
  const fronts=groundPlanSelected(orderTargets()),moving=fronts.filter(front=>front.advance);
  if(!fronts.length)return;
  if(moving.length){
    saveUndo(moving.flatMap(front=>front.members));
    for(const front of moving)groundFrontStop(front);
    groundClearAiming();groundPlanReport('進撃を停止');return;
  }
  const prepared=fronts.map(front=>[front,groundFrontRoutes(front,
    groundPlanSlots(groundFrontPresent(front),front.plan.pts,front.plan.side),true)]);
  const blocked=prepared.flatMap(([,routes])=>routes).find(r=>!r.path);
  if(blocked){groundPlanReport(blocked.f.name+'：経路が変わったため実行できません');return;}
  const active=prepared.filter(([,routes])=>routes.length);
  if(!active.length)return;
  const members=active.flatMap(([front])=>front.members);
  saveUndo(members);npcAutoPlayer(members);
  for(const [front,routes] of active)groundFrontStart(front,routes);
  groundClearAiming();groundPlanReport('進撃を開始');
}
function groundPlanHud(list){
  const ready=op.ground&&!over&&!deploying&&groundPlanUnits(list).length>0;
  for(const [id,mode] of [['groundDeploy','deploy'],['groundPlan','plan']]){
    const b=document.getElementById(id);b.disabled=!ready;b.setAttribute('aria-pressed',String(groundWorkAiming===mode));
  }
  const fronts=ready?groundPlanSelected(list):[],moving=fronts.some(front=>front.advance);
  const button=document.getElementById('groundExecute');
  button.disabled=!fronts.some(front=>front.advance||groundFrontPresent(front).length);
  button.setAttribute('aria-label',moving?'停止':'実行');
  button.title=moving?'選択部隊の前線の進撃を停止':'選択部隊の進撃計画を実行';
  const mode=groundWorkAiming,label=mode==='deploy'?'前線':mode==='plan'?'進撃計画':null;
  const step=groundLineStroke?'線を引いています（離すと決定）':groundLinePts?'前の側をクリック':groundLineStart?'終点をクリック':'始点をクリック、または長押しして線を引く';
  document.getElementById('groundPlanStatus').textContent=label?label+'：'+step+'（Escで取消）'+(groundPlanMessage?'　'+groundPlanMessage:''):
    groundPlanMessage||(moving?'進撃中（停止で現在地を前線にする）':fronts.length?'進撃計画あり（実行で開始）':'');
}
function groundFrontEdit(front,mode){
  if(!op.ground||over||deploying||!groundFronts.includes(front))return false;
  groundClearAiming();groundFrontEditing=front;groundWorkAiming=mode;groundHud();return true;
}
function groundFrontRedraw(front){return groundFrontEdit(front,'deploy');}
function groundPlanRedraw(front){return !!front?.plan&&groundFrontEdit(front,'plan');}
function groundPlanDelete(front){
  if(!front?.plan||!groundFronts.includes(front))return false;
  saveUndo(front.members);groundFrontStop(front);front.plan=null;front.via.clear();front.passed.clear();
  groundClearAiming();groundHud();return true;
}
function groundFrontDelete(front){
  if(!groundFronts.includes(front))return false;
  const members=front.members;
  saveUndo(members);groundFrontRemoveMembers(members);
  for(const f of members)if(groundFrontAvailable(f))groundFrontDefend(f);
  groundClearAiming();groundHud();return true;
}
function groundPlanArrows(front){
  if(!front.plan)return [];
  const slots=front.advance?front.slots:groundPlanSlots(groundFrontPresent(front),front.plan.pts,front.plan.side);
  return slots.filter(s=>groundFrontAvailable(s.f)&&!s.f.groundFrontAway).flatMap(({f,dest})=>{
    if(front.advance&&f.order?.groundAdvance!==front.advance.group)return [];
    const via=(front.via.get(f)||[]).slice(groundFrontViaIndex(front,f));
    return [{f,pts:[f.pos,...via,dest]}];
  });
}
function groundPlanSetVia(front,f,via){
  const moving=!!front.advance,slot=groundPlanSlots(groundFrontPresent(front),front.plan.pts,front.plan.side).find(s=>s.f===f);
  if(!slot&&via.length)return false;
  const passed=via.length?groundFrontViaIndex(front,f):0;
  const path=slot&&groundMovePath(f.pos,[...via.slice(passed),slot.dest],groundMoveKind(f));
  if(slot&&!path){groundPlanReport(f.name+'：中継地点を通れる経路がありません');return false;}
  saveUndo([f]);
  if(via.length)front.via.set(f,via);else front.via.delete(f);
  front.passed.set(f,passed);
  if(moving&&slot&&f.order?.groundAdvance===front.advance.group)groundFrontIssue(front,{...slot,path});
  return true;
}
function groundPlanViaAdd(f,p){
  const front=f.groundFrontOf,arrow=front&&groundPlanArrows(front).find(a=>a.f===f);
  if(!arrow)return false;
  const via=[...(front.via.get(f)||[])];
  let i=0,distance=Infinity;
  for(let j=0;j<arrow.pts.length-1;j++){
    const d=groundPlanNearest(groundPlanLine(arrow.pts.slice(j,j+2)),p).d;
    if(d<distance){distance=d;i=j;}
  }
  via.splice(groundFrontViaIndex(front,f)+i,0,p.clone());
  return groundPlanSetVia(front,f,via);
}
function groundPlanViaClear(f){
  const front=f.groundFrontOf;
  return !!front?.via.has(f)&&groundPlanSetVia(front,f,[]);
}
function groundPlanPickAt(p,radius){
  let best=null,distance=radius;
  const pick=(pts,hit)=>{
    const {d}=groundPlanNearest(groundPlanLine(pts),p);
    if(d<=radius&&(!best||d<distance)){best=hit;distance=d;}
  };
  for(const front of groundFronts){
    pick(front.advance?groundFrontPosition(front,groundFrontProgress(front)):front.pts,{kind:'front',front});
    if(front.plan)pick(front.plan.pts,{kind:'plan',front});
    for(const {f,pts} of groundPlanArrows(front))pick(pts,{kind:'arrow',front,f});
  }
  return best;
}
// Undo は、選んだ隊の命令と、並び直しで動く前線の残りの隊を一緒に保存する。
function groundFrontSnapshot(list){
  const fronts=[...new Set(list.map(f=>f.groundFrontOf).filter(Boolean))];
  const units=[...new Set([...list,...fronts.flatMap(front=>front.members)])];
  return {units,fronts:fronts.map(front=>({front,state:{...front,via:new Map(front.via),passed:new Map(front.passed),
    advance:front.advance?{...front.advance}:null}}))};
}
function groundFrontRestore(snapshot,units){
  const affected=new Set(snapshot.units.map(f=>f.groundFrontOf).filter(Boolean));
  for(const {front} of snapshot.fronts)affected.add(front);
  groundFronts=groundFronts.filter(front=>!affected.has(front));
  for(const f of snapshot.units)groundFrontClearMember(f);
  for(const {front,state} of snapshot.fronts){
    Object.assign(front,state);
    front.members=front.members.filter(f=>f.alive&&f.team===0&&!f.groundExited);
    if(front.members.length)groundFronts.push(front);
    for(const f of front.members)f.groundFrontOf=front;
  }
  for(const s of units){
    if(!s.f.groundFrontOf)continue;
    s.f.groundFrontAway=s.groundFrontAway;
    s.f.groundFrontEngagement=s.groundFrontEngagement;
  }
}
function groundPlanHover(p){if(['deploy','plan'].includes(groundWorkAiming)&&!groundLineStroke)groundLinePointer=p?.clone()||null;}
/* 前線・進撃計画の絵（ユーザーの指示 2026-11-20。見本の段階）:
   ・陣地の線: 太い線の前の側に四角い歯（凸）を並べる。前線・進撃計画の線と、前線して守っている線（f.groundFront）
   ・進撃の矢印: 隊から行き先への太い矢印。計画のうちは点かない。進撃中は点滅し、隊が進むにつれて短くなる（隊から伸びるため）
   太さはカメラの距離に合わせて段で変える（遠くでも細くなりすぎない）。色・太さ・歯の間は仮 */
const GROUND_PLAN_LOOK={color:0xe3aa2a,edge:0x1a1407,edgeOpacity:.6,grow:.07,line:.42,tooth:.55,toothGap:1.45,arrow:.48,head:1.7,lift:.45,blinkSec:1,planScale:.55};
function groundPlanZoom(){
  const d=typeof controls!=='undefined'&&camera?camera.position.distanceTo(controls.target):60;
  return Math.pow(2,Math.round(Math.log2(Math.max(.35,Math.min(4,d/60)))*4)/4);
}
function groundPlanVertex(P,x,z,lift=0){P.push(x,groundSurfaceHeight(x,z)+GROUND_PLAN_LOOK.lift+lift,z);}
function groundPlanQuad(P,q,lift){ // q: 4 点 [x,z]。2つの三角形
  for(const i of [0,1,2,0,2,3])groundPlanVertex(P,q[i][0],q[i][1],lift);
}
// g: 縁取りのぶん太らせる幅（縁取りは同じ形を少し太く、少し下に暗く描く）。曲線は 0.6 ごとに区切り、区切りごとの向きで帯をつなぐ
function groundPlanFront(P,pts,side,k,g=0,lift=0,scale=1){
  const LOOK=GROUND_PLAN_LOOK,L=groundPlanLine(pts);if(L.len<1e-6)return;
  const w=LOOK.line*k*scale/2,n=Math.max(1,Math.ceil(L.len/.6)),turn=Math.min(.3,L.len/4);
  const frame=s=>{const q=groundPlanAt(L,s),d=groundPlanDir(L,s,turn);return {q,d,nx:-d.z*(side||1),nz:d.x*(side||1)};};
  const at=(F,u,o)=>[F.q.x+F.d.x*u+F.nx*o,F.q.z+F.d.z*u+F.nz*o];
  let A=frame(0);
  for(let i=1;i<=n;i++){const B=frame(L.len*i/n);groundPlanQuad(P,[at(A,i===1?-g:0,-w-g),at(B,i===n?g:0,-w-g),at(B,i===n?g:0,w+g),at(A,i===1?-g:0,w+g)],lift);A=B;}
  if(!side)return;
  const t=LOOK.tooth*k*scale,gap=LOOK.toothGap*k,count=Math.max(1,Math.floor(L.len/gap)),pad=(L.len-(count-1)*gap)/2;
  for(let i=0;i<count;i++){const F=frame(pad+i*gap);groundPlanQuad(P,[at(F,-t/2-g,w*.9),at(F,t/2+g,w*.9),at(F,t/2+g,w+t+g),at(F,-t/2-g,w+t+g)],lift);}
}
function groundPlanArrow(P,from,to,k,g=0,lift=0){
  const L=GROUND_PLAN_LOOK,dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz),head=L.head*k;if(len<head*.6)return;
  const ux=dx/len,uz=dz/len,nx=-uz,nz=ux,w=L.arrow*k/2+g,body=len-head,at=(s,o)=>[from.x+ux*s+nx*o,from.z+uz*s+nz*o];
  const n=Math.max(1,Math.ceil(body/.6));
  for(let i=0;i<n;i++){const s0=body*i/n-(i?0:g),s1=body*(i+1)/n;groundPlanQuad(P,[at(s0,-w),at(s1,-w),at(s1,w),at(s0,w)],lift);}
  const hw=(L.arrow*k/2)*3+g*2.4;for(const q of [at(body-g,-hw),at(body-g,hw),at(len+g*2.4,0)])groundPlanVertex(P,q[0],q[1],lift);
}
function groundPlanBentArrow(P,pts,k,g,lift){
  const L=groundPlanLine(pts),look=GROUND_PLAN_LOOK;
  if(L.len<look.head*k*.6)return;
  const head=Math.min(look.head*k,L.len-L.cum[L.cum.length-2]);
  const end=L.len-head,part=L.cum.filter(s=>s<end);
  if(part.length)part.push(end);
  const frame=s=>{
    const p=groundPlanAt(L,s),d=groundPlanDir(L,s,.01);
    return (along,across)=>[p.x+d.x*along-d.z*across,p.z+d.z*along+d.x*across];
  };
  const w=look.arrow*k/2+g;
  for(let j=1;j<part.length;j++){
    const a=part[j-1],b=part[j],n=Math.ceil((b-a)/.6);
    for(let i=0;i<n;i++){
      const A=frame(a+(b-a)*i/n),B=frame(a+(b-a)*(i+1)/n),grow=j===1&&i===0?-g:0;
      groundPlanQuad(P,[A(grow,-w),B(0,-w),B(0,w),A(grow,w)],lift);
    }
  }
  const A=frame(end),B=frame(L.len),hw=look.arrow*k/2*3+g*2.4;
  for(const [x,z] of [A(-g,-hw),A(-g,hw),B(g*2.4,0)])groundPlanVertex(P,x,z,lift);
}
function groundPlanMesh(name,color,opacity,order){
  const m=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));
  m.renderOrder=order;m.name=name;groundVisuals.add(m);return m;
}
// 固定の線は、点を取り替えるまで描画用のキーを使い回す。
const groundPlanKeys=new WeakMap(),groundPlanQ=v=>Math.round(v*8)/8;
function groundPlanKey(pts,fixed=true){
  let k=fixed&&groundPlanKeys.get(pts);if(k)return k;
  k=pts.map(p=>groundPlanQ(p.x)+','+groundPlanQ(p.z)).join(';');if(fixed)groundPlanKeys.set(pts,k);return k;
}
function groundPlanDraw(){
  if(!groundVisuals)return;
  const L=GROUND_PLAN_LOOK,now=performance.now(),k=groundPlanZoom();
  if(!groundPlanVisual){
    const meshes={};
    for(const [key,name] of [['still','Still'],['blink','Blink'],['moving','Moving']]){
      meshes[key+'Edge']=groundPlanMesh('groundPlan'+name+'Edge',L.edge,L.edgeOpacity,5);
      meshes[key]=groundPlanMesh('groundPlan'+name,L.color,1,6);
    }
    groundPlanVisual={meshes,key:{},movingAt:-Infinity,advances:[]};
  }
  const V=groundPlanVisual,still=[],blink=[],moving=[];
  const lineItem=(pts,side,scale=1,fixed=true)=>({pts,side,scale,key:groundPlanKey(pts,fixed)+'|'+side+'|'+scale});
  for(const front of groundFronts){
    if(front.advance)moving.push(front);
    else still.push(lineItem(front.pts,front.side));
    if(front.plan)still.push(lineItem(front.plan.pts,front.plan.side,L.planScale));
    for(const {pts} of groundPlanArrows(front))(front.advance?blink:still).push({arrow:pts,key:groundPlanKey(pts,false)+'>'});
  }
  const scale=groundWorkAiming==='plan'?L.planScale:1;
  if(groundLineStroke)still.push(lineItem(groundLineStroke,null,scale,false));
  else if(groundLinePts)still.push(lineItem(groundLinePts,groundPlanSide(groundLinePts,groundLinePointer),scale,false));
  else if(groundLineStart&&groundLinePointer)still.push(lineItem([groundLineStart,groundLinePointer],null,scale,false));
  const build=(name,items,g,lift)=>{
    const key=k+'|'+items.map(x=>x.key).join('|'),mesh=V.meshes[name];
    if(V.key[name]===key)return;
    const P=[];
    for(const it of items){
      if(!it.arrow)groundPlanFront(P,it.pts,it.side,k,g*k*it.scale,lift,it.scale);
      else if(it.arrow.length===2)groundPlanArrow(P,...it.arrow,k,g*k,lift);
      else groundPlanBentArrow(P,it.arrow,k,g*k,lift);
    }
    mesh.geometry.dispose();mesh.geometry=new THREE.BufferGeometry();
    mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(P,3));mesh.visible=P.length>0;V.key[name]=key;
  };
  const draw=(name,items)=>{build(name,items,0,.02);build(name+'Edge',items,L.grow,0);};
  draw('still',still);draw('blink',blink);
  // 矢印の点滅と隊の位置は毎フレーム。上がる線は実時間の250msごと。
  if(now-V.movingAt>=250||moving.length!==V.advances.length||moving.some((front,i)=>front.advance!==V.advances[i])){
    draw('moving',moving.map(front=>lineItem(groundFrontPosition(front,groundFrontProgress(front)),front.side)));
    V.advances=moving.map(front=>front.advance);V.movingAt=now;
  }
  const on=.5+.5*Math.cos(now/1000/L.blinkSec*Math.PI*2);
  V.meshes.blink.material.opacity=.25+.75*on;V.meshes.blinkEdge.material.opacity=L.edgeOpacity*(.25+.75*on);
}
document.getElementById('groundDeploy').addEventListener('click',()=>groundPlanToggle('deploy'));
document.getElementById('groundPlan').addEventListener('click',()=>groundPlanToggle('plan'));
document.getElementById('groundExecute').addEventListener('click',groundPlanExecute);
