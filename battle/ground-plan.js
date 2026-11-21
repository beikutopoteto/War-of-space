/* 地上作戦の共有命令。線はクリック2回の直線か、ドラッグで引く曲線（ユーザーの指示 2026-11-20・11-21）。保存形式は変えず作戦中だけ保持。
   線は点の並び（pts）で持つ。直線は [始点, 終点] の2点。side は前の側（線の向きの左の法線 (-tz,tx) の側なら +1、反対なら -1） */
let groundLineStart=null,groundLinePts=null,groundLinePointer=null,groundLineStroke=null,groundPlanMessage='',groundPlanVisual=null;
let groundFronts=[],groundFrontNextId=1,groundFrontCheckAt=0,groundFrontEditing=null;
let groundEditHover=null,groundEditChoice=null,groundEditWaypoint=null,groundEditReturn=false,groundEditPress=null;
function groundFrontAvailable(f){
  return f.alive&&f.team===0&&!f.locked&&!f.embarked&&!f.groundRout&&groundCommandAllowed(f,'move');
}
function groundPlanUnits(list=orderTargets()){return list.filter(groundFrontAvailable);}
function groundPlanCancelInput(){
  groundLineStart=groundLinePts=groundLinePointer=groundLineStroke=groundFrontEditing=null;
  groundEditHover=groundEditWaypoint=groundEditPress=null;groundEditReturn=false;
  groundEditCloseChoice();
  groundPlanClosePalette();
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
  const active=groundWorkAiming===mode||mode==='edit'&&groundEditReturn;
  if(!op.ground||over||deploying||(mode==='edit'?!active&&!groundFronts.length:!groundPlanUnits().length))return;
  const next=active?null:mode;
  groundClearAiming();groundWorkAiming=next;groundHud();
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
/* ref は元の線の点の並び（両端の近さの合計で合わせる。前線に直角な計画でも隊が入れ違わない）か、始点1つ */
function groundFrontAlign(pts,side,ref){
  const a=Array.isArray(ref)?ref[0]:ref,b=Array.isArray(ref)?ref[ref.length-1]:null,first=pts[0],last=pts[pts.length-1];
  const reverse=b?groundPlanDistance(a,last)+groundPlanDistance(b,first)<groundPlanDistance(a,first)+groundPlanDistance(b,last):
    groundPlanDistance(a,last)<groundPlanDistance(a,first);
  return {pts:reverse?[...pts].reverse():pts,side:reverse?-side:side};
}
function groundFrontPlan(front,pts){
  const L=groundPlanLine(pts),from=groundPlanLine(front.advance?groundFrontNow(front):front.pts);
  const center=groundPlanAt(from,from.len/2);
  const side=-groundPlanNearest(L,center).side||groundFrontDefaultSide(L,front.members);
  return groundFrontAlign(pts,side,from.pts);
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
    f.groundAirTask||f.groundBuilding||f.groundUnloading||f.bandTo||
    (f.groundSupplyTrip?f.groundSupplyTrip.front!==front:!!f.groundGiving)||
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
const GROUND_FRONT_CORRIDOR_MARGIN_KM=.3,GROUND_FRONT_CROSS_NEAR_KM=.9;
const groundFrontTurn=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function groundFrontEdgesCross(a,b,c,d){
  return groundFrontTurn(a,b,c)*groundFrontTurn(a,b,d)<0&&groundFrontTurn(c,d,a)*groundFrontTurn(c,d,b)<0;
}
function groundFrontCorridor(from,to){
  const a=from[0],b=from[from.length-1],c=to[0],d=to[to.length-1];
  // 近い端を先に試す。つなぎが互いに、または曲線の途中で交差するときはもう一方を試す。
  const crosses=(start,end)=>{
    if(groundFrontEdgesCross(b,start,end,a))return true;
    return [from,to].some(line=>line.some((p,i)=>i&&(
      groundFrontEdgesCross(b,start,line[i-1],p)||groundFrontEdgesCross(end,a,line[i-1],p)
    )));
  };
  let reverse=groundPlanDistance(b,d)<=groundPlanDistance(b,c);
  const [start,end]=reverse?[d,c]:[c,d];
  if(crosses(start,end)&&!crosses(end,start))reverse=!reverse;
  return [...from,...(reverse?[...to].reverse():to)];
}
function groundFrontHull(points){
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.z-b.z);
  const chain=list=>{
    const edge=[];
    for(const p of list){
      while(edge.length>=2&&groundFrontTurn(edge[edge.length-2],edge[edge.length-1],p)<=0)edge.pop();
      edge.push(p);
    }
    return edge.slice(0,-1);
  };
  return sorted.length<2?sorted:[...chain(sorted),...chain(sorted.reverse())];
}
function groundFrontInCorridor(p,polygon){
  const margin=(GROUND_FRONT_CORRIDOR_MARGIN_KM*GROUND_SCALE)**2;
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i],dx=b.x-a.x,dz=b.z-a.z,x=p.x-a.x,z=p.z-a.z;
    const l2=dx*dx+dz*dz,t=l2?Math.max(0,Math.min(1,(x*dx+z*dz)/l2)):0;
    if((x-t*dx)**2+(z-t*dz)**2<=margin)return true;
    if((a.z>p.z)!==(b.z>p.z)&&x<dx*z/dz)inside=!inside;
  }
  return inside;
}
function groundFrontCrossings(data){
  const {bridges,fords}=data.objects;
  return [...bridges,...fords,...groundBridges.filter(b=>b.complete&&b.hp>0)]
    .map(b=>({river:b.river,pos:b.pos||groundPoint(b.x,b.y)}));
}
// 最初に横切った川を調べる。橋や浅瀬以外から渡れる隊にも回廊の候補を出す。
function groundFrontFirstCrossing(path,rivers){
  for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],dx=b.x-a.x,dz=b.z-a.z;
    let first=null;
    for(const {id,points} of rivers)for(let j=1;j<points.length;j++){
      const p=points[j-1],q=points[j],ex=q.x-p.x,ez=q.z-p.z,den=dx*ez-dz*ex;
      if(Math.abs(den)<1e-9)continue;
      const x=p.x-a.x,z=p.z-a.z,t=(x*ez-z*ex)/den,u=(x*dz-z*dx)/den;
      if(t>=0&&t<=1&&u>=0&&u<=1&&(!first||t<first.t))first={id,t};
    }
    if(first)return {river:first.id,x:a.x+dx*first.t,z:a.z+dz*first.t};
  }
  return null;
}
function groundFrontCrossed(path,rivers,crossings){
  const at=groundFrontFirstCrossing(path,rivers);
  if(!at)return null;
  let nearest=null,distance=GROUND_FRONT_CROSS_NEAR_KM*GROUND_SCALE;
  for(const c of crossings){
    if(c.river!==at.river)continue;
    const d=groundPlanDistance(at,c.pos);
    if(d<=distance){nearest=c;distance=d;}
  }
  return nearest;
}
// 単位容量の最小費用流。渡河点の使用数の二乗和を先に最小にし、同じ均等さなら道の見積もりの合計を最小にする。
// すでに中継地点で指定された隊も、各渡河点の初期の使用数に含める。
function groundFrontAssignCrossings(candidates,crossings,loads){
  const n=candidates.length,m=crossings.length,sink=n+m+1;
  const graph=Array.from({length:sink+1},()=>[]);
  const add=(from,to,cost)=>{
    const edge={to,cost,cap:1,reverse:graph[to].length};
    graph[to].push({to:from,cost:-cost,cap:0,reverse:graph[from].length});
    graph[from].push(edge);
    return edge;
  };
  const priority=1+candidates.reduce((sum,choices)=>sum+Math.max(...choices.map(c=>c.cost)),0);
  const edges=candidates.map((choices,i)=>{
    add(0,i+1,0);
    return choices.map(({crossing,cost})=>({crossing,edge:add(i+1,n+1+crossings.indexOf(crossing),cost)}));
  });
  crossings.forEach((c,j)=>{
    const initial=loads.get(c)||0;
    for(let i=0;i<n;i++)add(n+1+j,sink,priority*(2*(initial+i)+1));
  });
  for(let flow=0;flow<n;flow++){
    const dist=Array(graph.length).fill(Infinity),prev=[];dist[0]=0;
    for(let pass=1;pass<graph.length;pass++){
      let changed=false;
      graph.forEach((list,from)=>list.forEach(edge=>{
        if(edge.cap&&dist[from]+edge.cost<dist[edge.to]-1e-8){
          dist[edge.to]=dist[from]+edge.cost;prev[edge.to]={from,edge};changed=true;
        }
      }));
      if(!changed)break;
    }
    for(let to=sink;to!==0;){
      const {from,edge}=prev[to];edge.cap=0;graph[to][edge.reverse].cap=1;to=from;
    }
  }
  return edges.map(list=>list.find(({edge})=>!edge.cap).crossing);
}
function groundFrontRoutes(front,slots,advance,fixed=[]){
  const wheel=advance&&front.plan?groundFrontWheel(front.advance?.from||front.pts,front.plan.pts):null;
  const routes=slots.map(s=>{
    const via=advance?(front.via.get(s.f)||[]).slice(groundFrontViaIndex(front,s.f)):[];
    // 進撃は道路に寄らない短い道（ユーザーの指示 2026-11-21「できるだけ最短ルート（直線ルート）」）。前線への整列は今までどおり早く着く道
    const arc=wheel&&!via.length&&groundMoveKind(s.f)!=='air'?groundFrontWheelVia(wheel,s.f,s.dest):[];
    const path=arc.length&&groundMovePath(s.f.pos,[...arc,s.dest],groundMoveKind(s.f),advance)||groundMovePath(s.f.pos,[...via,s.dest],groundMoveKind(s.f),advance);
    return {...s,path};
  });
  if(wheel){
    const length=r=>r.path?groundPolyLength(r.path.points):0,longest=Math.max(0,...routes.map(length));
    for(const r of routes)r.pace=longest>1e-6?Math.max(GROUND_FRONT_WHEEL_MIN_PACE,length(r)/longest):1;
  }
  if(!routes.length)return routes;
  const data=groundData(),crossings=groundFrontCrossings(data);
  if(!crossings.length)return routes;
  const from=front.advance?.from||front.pts;
  const corridor=advance?groundFrontCorridor(from,front.plan.pts):groundFrontHull([
    ...from,...(front.members?groundFrontPresent(front):slots.map(({f})=>f)).map(f=>f.pos)
  ]);
  const eligible=crossings.filter(({pos})=>groundFrontInCorridor(pos,corridor));
  if(!eligible.length)return routes;
  const rivers=data.water.rivers.map(r=>({id:r.id,points:r.points.map(([x,y])=>({x:groundWorldX(x),z:groundWorldZ(y)}))}));
  const loads=new Map(),pending=new Map(),count=c=>loads.set(c,(loads.get(c)||0)+1);
  for(const {f,path} of fixed){
    if(!path||['air','sea'].includes(groundMoveKind(f)))continue;
    const crossed=groundFrontCrossed({points:[f.pos,...path.points.slice(path.atIndex)]},rivers,crossings);
    if(crossed)count(crossed);
  }
  for(const route of routes){
    const {f,dest,path}=route;
    if(!path||['air','sea'].includes(groundMoveKind(f)))continue;
    if(advance&&front.via.has(f)){
      const crossed=groundFrontCrossed(path,rivers,crossings);
      if(crossed)count(crossed);
      continue;
    }
    const crossed=groundFrontFirstCrossing(path,rivers);
    if(!crossed)continue;
    const choices=eligible.filter(c=>c.river===crossed.river)
      .map(crossing=>({crossing,cost:groundPlanDistance(f.pos,crossing.pos)+groundPlanDistance(crossing.pos,dest)}));
    if(!choices.length)continue;
    if(!pending.has(crossed.river))pending.set(crossed.river,[]);
    pending.get(crossed.river).push({route,choices});
  }
  for(const [river,list] of pending){
    const candidates=eligible.filter(c=>c.river===river);
    const assigned=candidates.length===1?list.map(()=>candidates[0]):
      groundFrontAssignCrossings(list.map(r=>r.choices),candidates,loads);
    list.forEach(({route},i)=>{
      route.path=groundMovePath(route.f.pos,[assigned[i].pos,route.dest],groundMoveKind(route.f),advance)||route.path;
    });
  }
  return routes;
}
function groundFrontIssue(front,{f,dest,path,line,pace}){
  f.queue=[];
  order(f,{type:'move',dest,groundPreparedPath:path,groundFrontId:front.id,groundLine:line,
    ...(front.advance?{groundAdvance:front.advance.group,...(pace<1?{groundAdvancePace:pace}:{})}:{groundDeploy:true})});
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
  const fixed=slots.filter(s=>!changed.includes(s)&&groundFrontOwnOrder(s.f,front))
    .map(({f})=>({f,path:f.order.path}));
  const routes=groundFrontRoutes(front,changed,!!front.advance,fixed);
  front.slots=slots.filter(s=>!routes.some(r=>r.f===s.f&&!r.path));
  front.retryRevision=front.slots.length===slots.length?null:groundBridgeRevision;
  for(const r of routes){
    if(r.path)groundFrontIssue(front,r);
    else if(groundFrontOwnOrder(r.f,front))groundFrontStopOrder(r.f);
  }
}
/* 向きを変える進撃（ユーザーの指示 2026-11-22「侵攻ラインが前線に対して直角やった場合、ちゃんと弧を描いて曲がるか」）:
   元の線の両端を計画の線の両端へ移す回転（伸び縮みを含む）の中心 O・角度 phi・倍率 k。
   向きの変わりが GROUND_FRONT_WHEEL_DEG より小さいか、ほぼ裏返し（150°より大きい）なら null で、今までどおり平行に進む */
const GROUND_FRONT_WHEEL_DEG=20,GROUND_FRONT_WHEEL_STEP_DEG=15,GROUND_FRONT_WHEEL_MIN_PACE=.15; // 仮
function groundFrontWheel(fromPts,toPts){
  const A=fromPts[0],B=fromPts[fromPts.length-1],C=toPts[0],D=toPts[toPts.length-1];
  const ux=B.x-A.x,uz=B.z-A.z,vx=D.x-C.x,vz=D.z-C.z,lu=Math.hypot(ux,uz),lv=Math.hypot(vx,vz);
  if(lu<1e-6||lv<1e-6)return null;
  let phi=Math.atan2(vz,vx)-Math.atan2(uz,ux);phi=Math.atan2(Math.sin(phi),Math.cos(phi));
  if(Math.abs(phi)<GROUND_FRONT_WHEEL_DEG*Math.PI/180||Math.abs(phi)>150*Math.PI/180)return null;
  const k=lv/lu,zr=k*Math.cos(phi),zi=k*Math.sin(phi);
  // C = O + z(A-O) から O = (C - zA)/(1 - z)（複素数で x が実部、z が虚部）
  const nx=C.x-(zr*A.x-zi*A.z),nz=C.z-(zr*A.z+zi*A.x),dr=1-zr,di=-zi,d2=dr*dr+di*di;
  return {O:{x:(nx*dr+nz*di)/d2,z:(nz*dr-nx*di)/d2},phi,k};
}
// p を回転の s（0〜1）だけ回した点
function groundFrontWheelAt(w,p,s){
  const a=w.phi*s,m=Math.pow(w.k,s),c=Math.cos(a)*m,n=Math.sin(a)*m,dx=p.x-w.O.x,dz=p.z-w.O.z;
  return {x:w.O.x+c*dx-n*dz,z:w.O.z+n*dx+c*dz};
}
// p から dest への弧: 回した点に、終わりのずれ（dest と回し切った点の差）を進み具合で足す
function groundFrontWheelPoint(w,p,dest,s){
  const q=groundFrontWheelAt(w,p,s),e=groundFrontWheelAt(w,p,1);
  return {x:q.x+(dest.x-e.x)*s,z:q.z+(dest.z-e.z)*s};
}
// 弧の上の中継点: 今いる所から行き先まで、回転の中心のまわりを回る（15°ごと。通れない点は飛ばす）。
// 途中で道を引き直すときも、今いる所から残りの角度だけ回る
function groundFrontWheelVia(w,f,dest){
  const O=w.O,a0=Math.atan2(f.pos.z-O.z,f.pos.x-O.x),r0=Math.hypot(f.pos.x-O.x,f.pos.z-O.z),r1=Math.hypot(dest.x-O.x,dest.z-O.z);
  let d=Math.atan2(dest.z-O.z,dest.x-O.x)-a0;d=Math.atan2(Math.sin(d),Math.cos(d));
  if(r0<1e-6||Math.sign(d)!==Math.sign(w.phi))return [];
  const n=Math.ceil(Math.abs(d)/(GROUND_FRONT_WHEEL_STEP_DEG*Math.PI/180)),kind=groundMoveKind(f),out=[];
  for(let i=1;i<n;i++){
    const a=a0+d*i/n,r=r0+(r1-r0)*i/n,q=new THREE.Vector3(O.x+Math.cos(a)*r,0,O.z+Math.sin(a)*r);
    if(groundPass(groundMapX(q.x),groundMapY(q.z),kind))out.push(q);
  }
  return out;
}
function groundFrontSample(pts){
  const L=groundPlanLine(pts);
  return Array.from({length:GROUND_FRONT_SAMPLES},(_,i)=>groundPlanAt(L,L.len*i/(GROUND_FRONT_SAMPLES-1)));
}
function groundFrontStart(front,routes,from=front.pts){
  front.advance={from:groundFrontSample(from),to:groundFrontSample(front.plan.pts),
    lengthFrom:groundPlanLine(from),group:{units:front.members},t:0,wheel:groundFrontWheel(from,front.plan.pts)};
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
/* 進撃中の前線の形（ユーザーの指示 2026-11-21「速度の違いでどれかの部隊が突出しても変わらなくないですか形」）:
   隊ごとに、出発の線の受け持ちの点から行き先へ、どこまで進んだか（進む向きへの深さ。0〜1）を測る。
   線の上の受け持ちの位置どうしを直線でつなぎ、ならして丸い張り出しにする。両端は端の隊と同じ。
   交戦などで列を離れた隊は数えない（隣の隊のあいだでつなぐ）。前の列がいなければ後ろの列で測る */
const GROUND_FRONT_BULGE_SMOOTH=4,GROUND_FRONT_BULGE_PASSES=2; // ならしの幅（64点のうち前後の点の数）と回数（仮）
function groundFrontProfile(front){
  const a=front.advance;if(!a)return null;
  const n=GROUND_FRONT_SAMPLES,slots=front.slots.filter(({f})=>!f.groundFrontAway&&!groundFrontBusy(f,front));
  const row=slots.filter(s=>!s.offset),sample=row.length?row:slots;
  if(!sample.length)return Array(n).fill(a.t);
  const marks=sample.map(({f,fraction,offset,dest})=>{
    const s=a.lengthFrom.len*fraction,p=groundPlanAt(a.lengthFrom,s),face=groundPlanFace(a.lengthFrom,s,front.side);
    const x=p.x-face.x*offset,z=p.z-face.z*offset,dx=dest.x-x,dz=dest.z-z,l2=dx*dx+dz*dz,w=a.wheel;
    if(w){ // 回る進撃は、中心から見た角度の進み
      let d=Math.atan2(f.pos.z-w.O.z,f.pos.x-w.O.x)-Math.atan2(z-w.O.z,x-w.O.x);d=Math.atan2(Math.sin(d),Math.cos(d));
      return {u:fraction,t:Math.max(0,Math.min(1,d/w.phi))};
    }
    return {u:fraction,t:l2<1e-12?1:Math.max(0,Math.min(1,((f.pos.x-x)*dx+(f.pos.z-z)*dz)/l2))};
  }).sort((p,q)=>p.u-q.u);
  let T=Array.from({length:n},(_,i)=>{
    const u=i/(n-1);
    if(u<=marks[0].u)return marks[0].t;
    for(let j=1;j<marks.length;j++)if(u<=marks[j].u){
      const p=marks[j-1],q=marks[j];return p.t+(q.t-p.t)*(q.u-p.u>1e-9?(u-p.u)/(q.u-p.u):1);
    }
    return marks[marks.length-1].t;
  });
  const w=GROUND_FRONT_BULGE_SMOOTH;
  for(let pass=0;pass<GROUND_FRONT_BULGE_PASSES;pass++)T=T.map((_,i)=>{
    let sum=0,count=0;for(let j=Math.max(0,i-w);j<=Math.min(n-1,i+w);j++){sum+=T[j];count++;}return sum/count;
  });
  return T;
}
// t は線全体で1つの割合か、64点ごとの割合の並び
function groundFrontPosition(front,t=front.advance?.t){
  if(!front.advance)return front.pts;
  const {from,to,wheel}=front.advance;
  return from.map((p,i)=>{
    const s=Array.isArray(t)?t[i]:t,v=new THREE.Vector3(p.x,p.y,p.z).lerp(to[i],s);
    if(wheel){const q=groundFrontWheelPoint(wheel,p,to[i],s);v.x=q.x;v.z=q.z;}
    return v;
  });
}
// 進撃中は隊の進み具合で曲がった今の前線。止まっていれば前線そのもの
function groundFrontNow(front){return front.advance?groundFrontPosition(front,groundFrontProfile(front)):front.pts;}
function groundFrontStop(front){
  if(!front.advance)return;
  for(const f of front.members)groundFrontRememberVia(f);
  front.pts=groundFrontNow(front);
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
  const present=groundFrontPresent(front),L=groundPlanLine(groundFrontNow(front));
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
  const count=groundFronts.length;
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
  else if(count!==groundFronts.length)groundHud();
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
  const mode=groundWorkAiming,editing=groundFrontEditing,returnToEdit=groundEditReturn;
  const list=editing?groundFrontPresent(editing):groundPlanUnits();
  if(editing&&!groundFronts.includes(editing)||!editing&&!list.length){groundClearAiming();groundHud();return;}
  const L=groundPlanLine(pts);
  if(L.len<1e-6){groundPlanReport('始点から離れた場所を終点に指定してください');return;}
  let front=editing,routes,plan,sorted;
  let line={pts,side:groundPlanSide(pts,frontAt)||groundFrontDefaultSide(L,list)};
  if(mode==='deploy'){
    if(front?.plan)line=groundFrontAlign(pts,line.side,front.plan.pts);
    sorted=groundFrontSort(editing?editing.members:list,groundPlanLine(line.pts));
    routes=groundFrontRoutes(line,groundPlanSlots(sorted.filter(f=>list.includes(f)),line.pts,line.side),false);
  }else{
    const current=list[0]?.groundFrontOf;
    front=editing||(current&&list.every(f=>f.groundFrontOf===current)&&groundFrontPresent(current).every(f=>list.includes(f))?current:null);
    if(!front)line=groundFrontFromUnits(list,L);
    plan=groundFrontPlan(front||{...line,members:list},pts);
    const members=front?groundFrontPresent(front):groundFrontSort(list,groundPlanLine(line.pts));
    // 引き直した計画を実行中なら、現在地から新しい線までの全経路を確かめる。
    const routeFront=front?{...front,plan}:{...line,plan,via:new Map(),passed:new Map()};
    if(front?.advance)routeFront.advance={...front.advance,from:groundFrontNow(front)};
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
    const from=front.advance&&groundFrontNow(front);
    if(from)for(const f of front.members)groundFrontRememberVia(f);
    front.plan=plan;
    if(from)groundFrontStart(front,routes,from);
    else groundPlanRememberPreview(front,routes);
  }
  groundClearAiming();
  if(returnToEdit)groundWorkAiming='edit';
  groundPlanReport(mode==='plan'?(front.advance?'進撃中の行き先を変更':list.length+'隊の進撃計画を準備（実行で開始）'):list.length+'隊が前線へ移動を開始');
}
function groundPlanReport(message){groundPlanMessage=message;groundHud();}
/* 曲線（ユーザーの指示 2026-11-20「右クリック長押しで、ひいて行く」、2026-11-21「0.3秒なしで」→ 左ドラッグを選んだ）:
   前線・進撃計画の線が決まるまでは、左ボタンか1本指で押して GROUND_PLAN_DRAG_PX 動かすと、押した所から線を引き始め、離すと決まる。
   そのあいだ左ドラッグ・1本指ではカメラを回さない（右ドラッグ・ホイール・視点のスティック・2本指で動かす）。
   右ボタンは GROUND_PLAN_HOLD_MS 以上押してから動かしたときだけ線を引き、すぐ動かせば今までどおりカメラが動く */
const GROUND_PLAN_HOLD_MS=300,GROUND_PLAN_STROKE_MIN_KM=.3,GROUND_PLAN_DRAG_PX=8;
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
    if(groundPlanPress){if(groundPlanPress.drawing)groundLineStroke=null;groundPlanPress=null;groundHud();return;}   // 2本目の指: つまむ・回すに任せる
    if(!op.ground||deploying||!['deploy','plan'].includes(groundWorkAiming))return;
    // 左ボタン・1本指・ペンは、線が決まるまでドラッグですぐ引く。前の側を待つあいだの左はカメラ。右は長押ししてから動かすと引く
    const drag=e.button===0&&!groundLinePts;
    if(drag||e.button===2)groundPlanPress={id:e.pointerId,x:e.clientX,y:e.clientY,t:e.timeStamp,drawing:false,drag};
  });
  // 引いているあいだ（左ドラッグは押した時から）は、カメラ（OrbitControls）へ動きを渡さない
  addEventListener('pointermove',e=>{
    const press=groundPlanPress;if(!press||e.pointerId!==press.id)return;
    if(!press.drawing){
      if(press.drag)e.stopPropagation();
      if(Math.hypot(e.clientX-press.x,e.clientY-press.y)<GROUND_PLAN_DRAG_PX)return;
      // 長押しは、押した時刻と動いた時刻の差で見る（重いフレームでタイマーが遅れても、すぐのドラッグを取り違えない）
      if(press.drag||e.timeStamp-press.t>=GROUND_PLAN_HOLD_MS)press.drawing=groundPlanStrokeStart(groundAt(press.x,press.y));
      if(!press.drawing){groundPlanPress=null;return;}   // 右のすぐのドラッグ、地図の外から押したときはカメラへ
    }
    e.stopPropagation();groundPlanStrokeMove(groundAt(e.clientX,e.clientY));
  },{capture:true});
  addEventListener('touchmove',e=>{const press=groundPlanPress;if(press&&(press.drawing||press.drag)){e.stopPropagation();e.preventDefault();}},{capture:true,passive:false});
  const release=e=>{const press=groundPlanPress;if(!press||e.pointerId!==press.id)return;groundPlanPress=null;if(press.drawing)groundPlanStrokeEnd();};
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
  const edit=document.getElementById('groundEdit');
  if(edit){
    const active=mode==='edit'||groundEditReturn;
    edit.disabled=!op.ground||over||deploying||!active&&!groundFronts.length;
    edit.setAttribute('aria-pressed',String(active));
  }
  const step=groundLineStroke?'線を引いています（離すと決定）':groundLinePts?'前の側をクリック':groundLineStart?'終点をクリック':'始点をクリック、またはドラッグして線を引く';
  document.getElementById('groundPlanStatus').textContent=label?label+'：'+step+'（Escで取消）'+(groundPlanMessage?'　'+groundPlanMessage:''):
    mode==='edit'?groundEditStatus():groundPlanMessage||(moving?'進撃中（停止で現在地を前線にする）':fronts.length?'進撃計画あり（実行で開始）':'');
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
const GROUND_PLAN_ROUTE_KM=.25;
function groundPlanSimplify(points,first,last,keep){
  const a=points[first],b=points[last],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
  let far=-1,distance=GROUND_PLAN_ROUTE_KM*GROUND_SCALE;
  for(let i=first+1;i<last;i++){
    const x=points[i].x-a.x,z=points[i].z-a.z,t=l2?Math.max(0,Math.min(1,(x*dx+z*dz)/l2)):0;
    const d=Math.hypot(x-dx*t,z-dz*t);
    if(d>distance){far=i;distance=d;}
  }
  if(far<0)return;
  groundPlanSimplify(points,first,far,keep);keep.push(points[far]);
  groundPlanSimplify(points,far,last,keep);
}
const groundPlanCurves=new WeakMap();
function groundPlanRouteShape(path,index){
  let cached=groundPlanCurves.get(path);
  if(cached?.index===index)return cached;
  // 橋の中心と中継地点を間引かず、曲線も必ずその点を通す。
  const first=Math.min(index,path.points.length-1),last=path.points.length-1,points=path.points;
  const anchors=[first],waypoints=path.pts.slice(0,-1);
  if(waypoints.length)for(let i=first+1;i<last;i++){
    if(waypoints.some(p=>groundPlanDistance(points[i],p)<1e-6))anchors.push(i);
  }
  if(last>first)anchors.push(last);
  const keep=[points[first]];
  for(let i=1;i<anchors.length;i++){
    groundPlanSimplify(points,anchors[i-1],anchors[i],keep);
    keep.push(points[anchors[i]]);
  }
  const flat=groundPlanLine(keep).pts.map(p=>new THREE.Vector3(p.x,0,p.z));
  const tail=flat.length<3?flat:new THREE.CatmullRomCurve3(flat,false,'centripetal').getPoints((flat.length-1)*14);
  cached={index,tail,key:groundPlanKey(tail)};
  groundPlanCurves.set(path,cached);return cached;
}
const groundPlanPreviews=new WeakMap();
function groundPlanPreviewInputs(front,members){
  return members.map(f=>[f,f.order,front.via.get(f),front.passed.get(f)]);
}
function groundPlanRememberPreview(front,routes){
  const members=groundFrontPresent(front);
  if(members.length===routes.length&&routes.every(({f})=>members.includes(f)))
    groundPlanPreviews.set(front,{plan:front.plan,revision:groundBridgeRevision,inputs:groundPlanPreviewInputs(front,members),routes});
}
function groundPlanPreview(front){
  const members=groundFrontPresent(front),old=groundPlanPreviews.get(front);
  const inputs=groundPlanPreviewInputs(front,members);
  if(old?.plan===front.plan&&old.revision===groundBridgeRevision&&inputs.length===old.inputs.length&&
    inputs.every((row,i)=>row.every((v,j)=>v===old.inputs[i][j])))return old.routes;
  const routes=groundFrontRoutes(front,groundPlanSlots(members,front.plan.pts,front.plan.side),true);
  groundPlanPreviews.set(front,{plan:front.plan,revision:groundBridgeRevision,inputs,routes});return routes;
}
function groundPlanArrows(front){
  if(!front.plan)return [];
  const slots=front.advance?front.slots:groundPlanPreview(front);
  return slots.filter(s=>groundFrontAvailable(s.f)&&!s.f.groundFrontAway).flatMap(({f,dest,path:preview})=>{
    if(front.advance&&f.order?.groundAdvance!==front.advance.group)return [];
    const path=front.advance?f.order.path:preview;
    if(!path)return [];
    const passed=groundFrontViaIndex(front,f),via=(front.via.get(f)||[]).slice(passed);
    const final=path.points[path.points.length-1],curve=groundPlanRouteShape(path,front.advance?path.atIndex:0);
    const shape=[f.pos,...(front.advance?curve.tail:curve.tail.slice(1))];
    const markers=via.map((p,i)=>({p:path.pts[path.pts.length-1-via.length+i]||p,i:passed+i}));
    if(front.via.has(f))markers.push({p:final,i:null});
    return [{f,pts:[f.pos,...via,dest],shape,markers,curve,key:curve.key+'|'+groundPlanQ(f.pos.x)+','+groundPlanQ(f.pos.z)}];
  });
}
function groundPlanSetVia(front,f,via,passed=via.length?groundFrontViaIndex(front,f):0){
  if(!front?.plan||!groundFronts.includes(front))return false;
  const slots=front.advance?front.slots.filter(s=>s.f.order?.groundAdvance===front.advance.group):
    groundPlanSlots(groundFrontPresent(front),front.plan.pts,front.plan.side);
  if(!slots.some(s=>s.f===f)&&via.length)return false;
  const pts=front.advance?.from||front.pts;
  const draft={...front,pts,advance:null,via:new Map(front.via),passed:new Map(front.passed)};
  for(const s of slots)draft.passed.set(s.f,groundFrontViaIndex(front,s.f));
  if(via.length)draft.via.set(f,via);else draft.via.delete(f);
  draft.passed.set(f,passed);
  const routes=groundFrontRoutes(draft,slots,true);
  const blocked=routes.find(r=>r.f===f&&!r.path);
  if(blocked){groundPlanReport(blocked.f.name+'：中継地点を通れる経路がありません');return false;}
  saveUndo([f]);
  front.via=draft.via;front.passed=draft.passed;
  if(front.advance)for(const route of routes.filter(r=>r.path))groundFrontIssue(front,route);
  else groundPlanRememberPreview(front,routes);
  return true;
}
function groundPlanViaAdd(f,p){
  const front=f.groundFrontOf,arrow=front&&groundPlanArrows(front).find(a=>a.f===f);
  if(!arrow)return false;
  const via=[...(front.via.get(f)||[])];
  const line=groundPlanLine(arrow.shape),at=groundPlanNearest(line,p).s;
  const passed=groundFrontViaIndex(front,f);
  const before=arrow.markers.filter(m=>m.i!==null&&groundPlanNearest(line,m.p).s<at).length;
  via.splice(passed+before,0,p.clone());
  return groundPlanSetVia(front,f,via);
}
function groundPlanViaMove(f,i,p){
  const front=f.groundFrontOf,via=front?.via.get(f);
  if(!via?.[i]||i<groundFrontViaIndex(front,f))return false;
  const next=[...via];next[i]=p.clone();
  return groundPlanSetVia(front,f,next);
}
function groundPlanViaRemove(f,i){
  const front=f.groundFrontOf,via=front?.via.get(f);
  if(!via?.[i]||i<groundFrontViaIndex(front,f))return false;
  return groundPlanSetVia(front,f,via.filter((_,j)=>j!==i),groundFrontViaIndex(front,f));
}
function groundPlanViaClear(f){
  const front=f.groundFrontOf;
  return !!front?.via.has(f)&&groundPlanSetVia(front,f,[]);
}
function groundPlanPickAt(p,radius,project=q=>q){
  let best=null,distance=radius;
  const arrows=groundFronts.map(front=>[front,groundPlanArrows(front)]);
  for(const [front,items] of arrows)for(const {f,markers} of items)for(const {p:q,i} of markers){
    if(i===null)continue;
    const d=groundPlanDistance(project(q),p);
    if(d<=distance){best={kind:'via',front,f,i};distance=d;}
  }
  if(best)return best;
  const pick=(pts,hit)=>{
    const {d}=groundPlanNearest(groundPlanLine(pts.map(project)),p);
    if(d<=radius&&(!best||d<distance)){best=hit;distance=d;}
  };
  for(const [front,items] of arrows){
    pick(front.advance?groundFrontNow(front):front.pts,{kind:'front',front});
    if(front.plan)pick(front.plan.pts,{kind:'plan',front});
    for(const {f,shape} of items)pick(shape,{kind:'arrow',front,f});
  }
  return best;
}
function groundEditCloseChoice(){
  groundEditChoice=null;
  const menu=document.getElementById('groundEditPick');
  if(menu)menu.hidden=true;
}
function groundEditStatus(){
  const text=groundEditWaypoint?(groundEditWaypoint.kind==='arrow'?'中継地点を足す場所をクリック':'中継地点を動かす場所をクリック'):
    '前線・計画の線、矢印、中継地点の○をクリック';
  return '編集・削除：'+text+'（Escで取消）'+(groundPlanMessage?'　'+groundPlanMessage:'');
}
function groundEditActions(hit){
  const {kind,front,f,i}=hit;
  if(kind==='front'||kind==='plan'){
    const isFront=kind==='front';
    return [
      ['redraw','編集（引き直す）',()=>{
        if((isFront?groundFrontRedraw:groundPlanRedraw)(front)){
          groundEditReturn=true;groundHud();
        }
      }],
      ['delete',isFront?'削除（計画も消える）':'削除',()=>{
        (isFront?groundFrontDelete:groundPlanDelete)(front);groundWorkAiming='edit';groundHud();
      }]
    ];
  }
  const location=()=>{groundEditWaypoint=hit;groundPlanMessage='';groundHud();};
  return kind==='arrow'?[['location','中継地点を足す',location]]:[
    ['location','編集（動かす）',location],['delete','削除',()=>{groundPlanViaRemove(f,i);groundHud();}]
  ];
}
function groundEditPick(x,y){
  return groundPlanPickAt({x,z:y},14,p=>{
    const q=proj(new THREE.Vector3(p.x,groundSurfaceHeight(p.x,p.z)+GROUND_PLAN_LOOK.lift,p.z));
    return {x:q.x,z:q.y};
  });
}
function groundEditTap(x,y){
  if(groundEditWaypoint){
    const p=groundAt(x,y),{kind,f,i}=groundEditWaypoint;
    if(!p)return;
    groundPlanMessage='';
    if((kind==='arrow'?groundPlanViaAdd(f,p):groundPlanViaMove(f,i,p))||!f.groundFrontOf?.plan)groundEditWaypoint=null;
    groundHud();return;
  }
  groundEditCloseChoice();groundPlanMessage='';
  const hit=groundEditPick(x,y);
  groundEditHover=hit;
  if(!hit){groundHud();return;}
  const menu=document.getElementById('groundEditPick');
  groundEditChoice=hit;
  menu.replaceChildren(...groundEditActions(hit).map(([id,label,action])=>{
    const b=document.createElement('button');
    b.type='button';b.textContent=label;b.dataset.action=id;b.setAttribute('role','menuitem');
    b.addEventListener('click',()=>{
      groundEditCloseChoice();groundEditHover=null;
      if(groundWorkAiming==='edit'&&groundFronts.includes(hit.front))action();
    });
    return b;
  }));
  menu.hidden=false;
  const r=menu.getBoundingClientRect();
  menu.style.transform=`translate(${Math.max(0,Math.min(x+12,W-r.width-8))}px,${Math.max(0,Math.min(y+8,H-r.height-8))}px)`;
}
if(typeof renderer!=='undefined'&&renderer?.domElement){
  // 名札・地図より先に編集のタップを受け取る。ドラッグやピンチはいつもの視点操作へ渡す。
  const mapTarget=e=>e.target===renderer.domElement||e.target.closest?.('#labels .mk2');
  const active=()=>op.ground&&!over&&!deploying&&!paused&&!talking&&!menuOpen&&(groundWorkAiming==='edit'||groundEditReturn);
  addEventListener('pointerdown',e=>{
    if(groundEditPress){groundEditPress=null;return;}
    if(active()&&mapTarget(e)&&(e.button===0||e.button===2))
      groundEditPress={id:e.pointerId,x:e.clientX,y:e.clientY,at:performance.now(),mode:groundWorkAiming};
    else if(groundEditChoice&&!e.target.closest?.('#groundEditPick')){groundEditCloseChoice();groundEditHover=null;}
  },true);
  addEventListener('pointermove',e=>{
    if(groundEditPress&&Math.hypot(e.clientX-groundEditPress.x,e.clientY-groundEditPress.y)>=8)groundEditPress=null;
    if(!active()||groundWorkAiming!=='edit'||groundEditChoice||groundEditWaypoint)return;
    groundEditHover=mapTarget(e)&&!e.buttons?groundEditPick(e.clientX,e.clientY):null;
  },true);
  addEventListener('pointercancel',()=>{groundEditPress=null;},true);
  addEventListener('pointerup',e=>{
    if(!active()||!mapTarget(e))return;
    // OrbitControls にも pointerup を渡し、通常命令のクリックだけ消費する。
    down=labelDown=null;
    const press=groundEditPress;
    if(press?.id!==e.pointerId)return;
    groundEditPress=null;
    if(press.mode!==groundWorkAiming||performance.now()-press.at>=450||Math.hypot(e.clientX-press.x,e.clientY-press.y)>=8)return;
    if(groundWorkAiming==='edit')groundEditTap(e.clientX,e.clientY);
    else {const p=groundAt(e.clientX,e.clientY);if(p)groundPlanTap(p);}
  },true);
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
const GROUND_PLAN_COLORS=['#f2c46d','#f59e62','#ee7a74','#f08fb6','#d996e8','#b0a3f5','#8eaaf8','#79c2f7',
  '#7dd9ee','#6fe0cf','#72d6a3','#9fdf7e','#cbe772','#f0e27a','#d8c39b','#e6e9ef'];
let groundPlanPalette=null,groundPlanColorRevision=0;
function groundPlanBattalionColor(b){
  return b?.planColor||groundOrg?.brigades.find(g=>g.battalions.includes(b?.id))?.planColor||GROUND_PLAN_COLORS[0];
}
function groundPlanUnitColor(f){return groundPlanBattalionColor(groundOrg?.battalions.find(b=>b.companies.includes(f.companyId)));}
function groundPlanSetColor(level,item,color){
  if(!GROUND_PLAN_COLORS.includes(color))return;
  item.planColor=color;
  if(level==='brigades')for(const b of groundOrg.battalions)if(item.battalions.includes(b.id))delete b.planColor;
  groundPlanColorRevision++;
}
const groundPlanSections=new WeakMap();
function groundPlanSectionColors(front){
  const members=groundFrontPresent(front).filter(f=>GROUND_PLAN_FRONT.has(f.groundKind)),old=groundPlanSections.get(front);
  if(old?.revision===groundPlanColorRevision&&members.length===old.members.length&&members.every((f,i)=>f===old.members[i]))return old.colors;
  const colors=members.length?members.map(groundPlanUnitColor):[GROUND_PLAN_COLORS[0]];
  groundPlanSections.set(front,{members,colors,revision:groundPlanColorRevision});return colors;
}
function groundPlanClosePalette(){
  if(!groundPlanPalette)return;
  groundPlanPalette.anchor.setAttribute('aria-expanded','false');
  groundPlanPalette.menu.remove();groundPlanPalette=null;
}
function groundPlanRosterSwatch(level,item){
  const color=()=>level==='brigades'?item.planColor||GROUND_PLAN_COLORS[0]:groundPlanBattalionColor(item);
  const b=document.createElement('button');
  b.type='button';b.className='ground-plan-swatch';
  b.style.backgroundColor=color();b.classList.toggle('own',level==='battalions'&&!!item.planColor);
  b.title='侵攻ラインの色';b.setAttribute('aria-label',item.name+'の侵攻ラインの色');
  b.setAttribute('aria-expanded','false');
  b.onclick=()=>{
    if(groundPlanPalette?.anchor===b){groundPlanClosePalette();return;}
    groundPlanClosePalette();hideTip();
    const menu=document.createElement('section'),title=document.createElement('b'),grid=document.createElement('div'),help=document.createElement('small');
    menu.className='ground-plan-palette';menu.setAttribute('aria-label',b.getAttribute('aria-label'));
    title.textContent='侵攻ラインの色：'+item.name;
    help.append('旅団で選ぶと、下の大隊もまとめて変わります。',document.createElement('br'),
      'そのあと大隊で選べば、その大隊だけ別の色になります（●の印）。');
    for(const [i,c] of GROUND_PLAN_COLORS.entries()){
      const choice=document.createElement('button');choice.type='button';choice.style.backgroundColor=c;
      choice.setAttribute('aria-label','色 '+(i+1));choice.setAttribute('aria-pressed',String(c===color()));
      choice.onclick=()=>{
        groundPlanSetColor(level,item,c);groundPlanClosePalette();buildRoster();updateRoster();
      };
      grid.append(choice);
    }
    menu.append(title,grid,help);document.body.append(menu);
    const r=b.getBoundingClientRect();
    menu.style.left=Math.max(8,r.right-menu.offsetWidth)+'px';
    menu.style.top=Math.max(8,r.top-menu.offsetHeight-8)+'px';
    groundPlanPalette={anchor:b,menu};b.setAttribute('aria-expanded','true');
  };
  return b;
}
if(typeof renderer!=='undefined'&&renderer?.domElement){
  addEventListener('pointerdown',e=>{
    if(groundPlanPalette&&!groundPlanPalette.anchor.contains(e.target)&&!groundPlanPalette.menu.contains(e.target))groundPlanClosePalette();
  },true);
  addEventListener('scroll',groundPlanClosePalette,true);
  addEventListener('resize',groundPlanClosePalette);
  addEventListener('keydown',e=>{
    if(e.code==='Escape'&&groundPlanPalette){
      const {anchor}=groundPlanPalette;groundPlanClosePalette();anchor.focus();e.stopImmediatePropagation();
    }
  },true);
}
/* 前線・進撃計画の絵（ユーザーの指示 2026-11-20。見本の段階）:
   ・陣地の線: 太い線の前の側に四角い歯（凸）を並べる。前線・進撃計画の線と、前線して守っている線（f.groundFront）
   ・進撃の矢印: 隊から行き先への太い矢印。計画のうちは点かない。進撃中は点滅し、隊が進むにつれて短くなる（隊から伸びるため）
   太さはカメラの距離に合わせて段で変える（遠くでも細くなりすぎない）。色・太さ・歯の間は仮 */
const GROUND_PLAN_LOOK={edge:0x1a1407,edgeOpacity:.28,fillOpacity:.92,whiteMix:.42,grow:.07,line:.42,tooth:.55,toothGap:1.45,
  arrow:.48,head:1.7,lift:.45,blinkSec:1,planScale:.55,highlight:0xf6f1e4,highlightOpacity:.95,highlightGrow:.2,ringRadius:.95,ringWidth:.17};
const groundPlanPaints=new Map(GROUND_PLAN_COLORS.map(c=>[c,new THREE.Color(c).lerp(new THREE.Color(0xffffff),GROUND_PLAN_LOOK.whiteMix)]));
function groundPlanZoom(){
  const d=typeof controls!=='undefined'&&camera?camera.position.distanceTo(controls.target):60;
  return Math.pow(2,Math.round(Math.log2(Math.max(.35,Math.min(4,d/60)))*4)/4);
}
function groundPlanVertex(P,x,z,lift=0){P.push(x,groundSurfaceHeight(x,z)+GROUND_PLAN_LOOK.lift+lift,z);}
function groundPlanQuad(P,q,lift){ // q: 4 点 [x,z]。2つの三角形
  const start=P.length;
  for(let i=0;i<3;i++)groundPlanVertex(P,q[i][0],q[i][1],lift);
  for(const i of [0,2])P.push(P[start+i*3],P[start+i*3+1],P[start+i*3+2]);
  groundPlanVertex(P,q[3][0],q[3][1],lift);
}
// g: 縁取りのぶん太らせる幅（縁取りは同じ形を少し太く、少し下に暗く描く）。曲線は 0.6 ごとに区切り、区切りごとの向きで帯をつなぐ
function groundPlanFront(P,pts,side,k,g=0,lift=0,scale=1,colors=null,C=null){
  const LOOK=GROUND_PLAN_LOOK,L=groundPlanLine(pts);if(L.len<1e-6)return;
  const w=LOOK.line*k*scale/2,n=Math.max(1,Math.ceil(L.len/.6)),turn=Math.min(.3,L.len/4);
  const frame=s=>{const q=groundPlanAt(L,s),d=groundPlanDir(L,s,turn);return {q,d,nx:-d.z*(side||1),nz:d.x*(side||1)};};
  const at=(F,u,o)=>[F.q.x+F.d.x*u+F.nx*o,F.q.z+F.d.z*u+F.nz*o];
  const cuts=[];
  for(let i=1;colors&&i<colors.length;i++)if(colors[i-1]!==colors[i])cuts.push(L.len*i/colors.length);
  const quad=(q,s)=>{
    groundPlanQuad(P,q,lift);
    if(C)groundPlanVertexColors(C,colors[Math.max(0,Math.min(colors.length-1,Math.floor(s/L.len*colors.length)))],6);
  };
  const ends=[...Array.from({length:n},(_,i)=>L.len*(i+1)/n),...cuts].sort((a,b)=>a-b);
  let start=0,A=frame(0);
  for(const end of ends){
    if(end-start<1e-8)continue;
    const B=frame(end),a=start===0?-g:0,b=end===L.len?g:0;
    quad([at(A,a,-w-g),at(B,b,-w-g),at(B,b,w+g),at(A,a,w+g)],(start+end)/2);
    start=end;A=B;
  }
  if(!side)return;
  const t=LOOK.tooth*k*scale,gap=LOOK.toothGap*k,count=Math.max(1,Math.floor(L.len/gap)),pad=(L.len-(count-1)*gap)/2;
  for(let i=0;i<count;i++){
    const s=pad+i*gap,F=frame(s),left=s-t/2-g,right=s+t/2+g;
    let a=left;
    for(const b of [...cuts.filter(c=>c>left&&c<right),right]){
      quad([at(F,a-s,w*.9),at(F,b-s,w*.9),at(F,b-s,w+t+g),at(F,a-s,w+t+g)],(a+b)/2);a=b;
    }
  }
}
function groundPlanVertexColors(C,color,n){
  const {r,g,b}=groundPlanPaints.get(color);
  for(let i=0;i<n;i++)C.push(r,g,b);
}
function groundPlanArrow(P,from,to,k,g=0,lift=0){
  const L=GROUND_PLAN_LOOK,dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz),head=L.head*k;if(len<head*.6)return;
  const ux=dx/len,uz=dz/len,nx=-uz,nz=ux,w=L.arrow*k/2+g,body=len-head,at=(s,o)=>[from.x+ux*s+nx*o,from.z+uz*s+nz*o];
  const n=Math.max(1,Math.ceil(body/.6));
  for(let i=0;i<n;i++){const s0=body*i/n-(i?0:g),s1=body*(i+1)/n;groundPlanQuad(P,[at(s0,-w),at(s1,-w),at(s1,w),at(s0,w)],lift);}
  const hw=(L.arrow*k/2)*3+g*2.4;for(const q of [at(body-g,-hw),at(body-g,hw),at(len+g*2.4,0)])groundPlanVertex(P,q[0],q[1],lift);
}
const GROUND_PLAN_ARROW_TURN=.15;
function groundPlanBentBody(P,L,part,k,g,lift){
  const w=GROUND_PLAN_LOOK.arrow*k/2+g;
  const edge=(s,along=0)=>{
    const p=groundPlanAt(L,s),d=groundPlanDir(L,s,GROUND_PLAN_ARROW_TURN);
    const x=p.x+d.x*along,z=p.z+d.z*along,points=[];
    groundPlanVertex(points,x+d.z*w,z-d.x*w,lift);
    groundPlanVertex(points,x-d.z*w,z+d.x*w,lift);
    return points;
  };
  let A=edge(part[0],part[0]===0?-g:0);
  for(let j=1;j<part.length;j++){
    const a=part[j-1],b=part[j],n=Math.ceil((b-a)/.6);
    for(let i=0;i<n;i++){
      const B=edge(a+(b-a)*(i+1)/n);
      P.push(A[0],A[1],A[2],...B,A[0],A[1],A[2],B[3],B[4],B[5],A[3],A[4],A[5]);
      A=B;
    }
  }
}
function groundPlanBentHead(P,L,end,k,g,lift){
  const look=GROUND_PLAN_LOOK;
  const a=groundPlanAt(L,end),b=groundPlanAt(L,L.len),length=groundPlanDistance(a,b),hw=look.arrow*k/2*3+g*2.4;
  const d=length>1e-6?{x:(b.x-a.x)/length,z:(b.z-a.z)/length}:groundPlanDir(L,L.len,GROUND_PLAN_ARROW_TURN);
  for(const [p,u,v] of [[a,-g,-hw],[a,-g,hw],[b,g*2.4,0]])groundPlanVertex(P,p.x+u*d.x-v*d.z,p.z+u*d.z+v*d.x,lift);
}
function groundPlanBentArrow(P,pts,k,g,lift){
  const L=groundPlanLine(pts),head=GROUND_PLAN_LOOK.head*k;
  if(L.len<head*.6)return;
  const end=Math.max(0,L.len-head);
  if(end>0)groundPlanBentBody(P,L,[...L.cum.filter(s=>s<end),end],k,g,lift);
  groundPlanBentHead(P,L,end,k,g,lift);
}
function groundPlanBentTail(arrow,k,g,lift){
  const line=groundPlanLine(arrow.slice(1)),end=line.len-GROUND_PLAN_LOOK.head*k;
  const split=line.cum.findIndex(s=>s>=GROUND_PLAN_ARROW_TURN&&s<end);
  if(split<0)return null;
  // この点以降の向きも幅も、動く始点に依存しない。固定部分は地形高度まで一度だけ計算する。
  const P=[];
  groundPlanBentBody(P,line,[...line.cum.slice(split).filter(s=>s<end),end],k,g,lift);
  groundPlanBentHead(P,line,end,k,g,lift);
  return {line,split,P:Float32Array.from(P)};
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
function groundPlanRing(P,p,k,g,lift,disc=false){
  const L=GROUND_PLAN_LOOK,r=L.ringRadius*k,w=(L.ringWidth+g)*k,outer=disc?(L.ringRadius+L.grow+.12)*k:r+w;
  const at=(i,n)=>[p.x+Math.cos(i*Math.PI/10)*n,p.z+Math.sin(i*Math.PI/10)*n];
  for(let i=0;i<20;i++){
    const a=at(i,outer),b=at(i+1,outer);
    if(disc)for(const [x,z] of [[p.x,p.z],a,b])groundPlanVertex(P,x,z,lift);
    else groundPlanQuad(P,[at(i,r-w),a,b,at(i+1,r-w)],lift);
  }
}
const groundPlanLineMeshes=new WeakMap();
function groundPlanLineMesh(item,k,g,lift,fill){
  const {pts,side,scale,colors,fixed}=item,key=[k,g,lift,side,scale,fill&&colors.join(',')].join('|');
  let cache=groundPlanLineMeshes.get(pts);
  if(fixed&&cache?.[lift]?.key===key)return cache[lift];
  const P=[],C=fill?[]:null;
  groundPlanFront(P,pts,side,k,g*k*scale,lift,scale,fill?colors:null,C);
  const mesh={key,P,C};
  if(fixed){if(!cache){cache={};groundPlanLineMeshes.set(pts,cache);}cache[lift]=mesh;}
  return mesh;
}
function groundPlanArrowMesh(V,item,k,g,lift){
  const {f,arrow,curve}=item,{x,z}=arrow[0];
  let styles=V.arrows.get(f);
  if(!styles){styles=new Map();V.arrows.set(f,styles);}
  const old=styles.get(lift);
  const same=old?.curve===curve&&old.k===k&&old.g===g;
  if(same&&old.x===x&&old.z===z)return old.parts;
  const P=[],grow=g*k,tail=same?old.tail:groundPlanBentTail(arrow,k,grow,lift);
  const offset=tail?groundPlanDistance(arrow[0],tail.line.pts[0]):0;
  let suffix=null;
  if(offset>=1e-6){
    const {line,split}=tail,cum=[0,...line.cum.map(s=>s+offset)];
    const L={pts:[arrow[0],...line.pts],cum,len:line.len+offset};
    groundPlanBentBody(P,L,cum.slice(0,split+2),k,grow,lift);
    suffix=tail.P;
  }else{
    if(arrow.length===2)groundPlanArrow(P,...arrow,k,grow,lift);
    else groundPlanBentArrow(P,arrow,k,grow,lift);
  }
  const parts=[Float32Array.from(P)];
  if(suffix)parts.push(suffix);
  styles.set(lift,{curve,k,g,x,z,tail,parts});
  return parts;
}
function groundPlanDraw(){
  if(!groundVisuals)return;
  const L=GROUND_PLAN_LOOK,now=performance.now(),k=groundPlanZoom();
  if(!groundPlanVisual){
    const meshes={};
    for(const [key,name] of [['still','Still'],['blink','Blink'],['moving','Moving']]){
      meshes[key+'Edge']=groundPlanMesh('groundPlan'+name+'Edge',L.edge,L.edgeOpacity,5);
      meshes[key]=groundPlanMesh('groundPlan'+name,0xffffff,L.fillOpacity,6);
      meshes[key].material.vertexColors=true;
    }
    meshes.highlight=groundPlanMesh('groundPlanHighlight',L.highlight,L.highlightOpacity,4);
    meshes.ringEdge=groundPlanMesh('groundPlanRingEdge',L.edge,L.edgeOpacity,7);
    meshes.ring=groundPlanMesh('groundPlanRing',0xffffff,1,8);
    groundPlanVisual={meshes,key:{},movingAt:-Infinity,advances:[],movingColors:[],arrows:new WeakMap()};
  }
  const V=groundPlanVisual,still=[],blink=[],moving=[],rings=[];
  const hover=groundEditChoice||groundEditHover;
  let highlight=null;
  const lineItem=(pts,side,scale=1,fixed=true,colors=[GROUND_PLAN_COLORS[0]])=>(
    {pts,side,scale,fixed,colors,key:[groundPlanKey(pts,fixed),side,scale,colors.join(',')].join('|')});
  for(const front of groundFronts){
    const colors=groundPlanSectionColors(front),selected=hover?.front===front;
    if(front.advance)moving.push({front,colors});
    else{
      const item=lineItem(front.pts,front.side,1,true,colors);still.push(item);
      if(selected&&hover.kind==='front')highlight=item;
    }
    if(front.advance&&selected&&hover.kind==='front')
      highlight=lineItem(groundFrontNow(front),front.side,1,false,colors);
    if(front.plan){
      const item=lineItem(front.plan.pts,front.plan.side,L.planScale,true,colors);still.push(item);
      if(selected&&hover.kind==='plan')highlight=item;
    }
    for(const {f,shape,markers,key,curve} of groundPlanArrows(front)){
      const color=groundPlanUnitColor(f),item={f,arrow:shape,curve,color,key:key+'>'+color};
      (front.advance?blink:still).push(item);
      if(selected&&hover.f===f&&hover.kind==='arrow')highlight=item;
      for(const {p,i} of markers){
        const ring={ring:p,key:groundPlanQ(p.x)+','+groundPlanQ(p.z)};rings.push(ring);
        if(selected&&hover.f===f&&hover.kind==='via'&&hover.i===i)highlight=ring;
      }
    }
  }
  const scale=groundWorkAiming==='plan'?L.planScale:1;
  if(groundLineStroke)still.push(lineItem(groundLineStroke,null,scale,false));
  else if(groundLinePts)still.push(lineItem(groundLinePts,groundPlanSide(groundLinePts,groundLinePointer),scale,false));
  else if(groundLineStart&&groundLinePointer)still.push(lineItem([groundLineStart,groundLinePointer],null,scale,false));
  const build=(name,items,g,lift,fill=false)=>{
    const key=k+'|'+items.map(x=>x.key).join('|'),mesh=V.meshes[name];
    if(V.key[name]===key)return;
    const parts=[];
    for(const it of items){
      if(it.ring){
        const P=[];groundPlanRing(P,it.ring,k,g,lift,name==='ringEdge');parts.push({P});
      }
      else if(it.arrow){
        for(const P of groundPlanArrowMesh(V,it,k,g,lift))parts.push({P,paint:fill?groundPlanPaints.get(it.color):null});
      }else parts.push(groundPlanLineMesh(it,k,g,lift,fill));
    }
    const length=parts.reduce((sum,{P})=>sum+P.length,0);
    const positions=new Float32Array(length),colors=fill?new Float32Array(length):null;
    let offset=0;
    for(const {P,C,paint} of parts){
      positions.set(P,offset);
      if(C)colors.set(C,offset);
      else if(paint){
        for(let i=offset;i<offset+P.length;i+=3){
          colors[i]=paint.r;colors[i+1]=paint.g;colors[i+2]=paint.b;
        }
      }
      offset+=P.length;
    }
    mesh.geometry.dispose();mesh.geometry=new THREE.BufferGeometry();
    mesh.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    if(fill)mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    mesh.visible=length>0;V.key[name]=key;
  };
  const draw=(name,items)=>{build(name,items,0,.02,true);build(name+'Edge',items,L.grow,0);};
  draw('still',still);draw('blink',blink);
  build('highlight',highlight?[highlight]:[],L.highlightGrow,-.01);
  build('ringEdge',rings,0,.03);build('ring',rings,0,.04);
  // 矢印の点滅と隊の位置は毎フレーム。上がる線は実時間の250msごと。
  if(now-V.movingAt>=250||moving.length!==V.advances.length||moving.some(({front,colors},i)=>front.advance!==V.advances[i]||colors!==V.movingColors[i])){
    draw('moving',moving.map(({front,colors})=>lineItem(groundFrontNow(front),front.side,1,false,colors)));
    V.advances=moving.map(({front})=>front.advance);V.movingColors=moving.map(({colors})=>colors);V.movingAt=now;
  }
  const on=.5+.5*Math.cos(now/1000/L.blinkSec*Math.PI*2);
  V.meshes.blink.material.opacity=L.fillOpacity*(.25+.75*on);V.meshes.blinkEdge.material.opacity=L.edgeOpacity*(.25+.75*on);
}
document.getElementById('groundDeploy').addEventListener('click',()=>groundPlanToggle('deploy'));
document.getElementById('groundPlan').addEventListener('click',()=>groundPlanToggle('plan'));
document.getElementById('groundExecute').addEventListener('click',groundPlanExecute);
document.getElementById('groundEdit')?.addEventListener('click',()=>groundPlanToggle('edit'));
