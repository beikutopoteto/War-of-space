/* 地上作戦の共有命令。線はクリック2回の直線か、長押ししてから引く曲線（ユーザーの指示 2026-11-20）。保存形式は変えず作戦中だけ保持。
   線は点の並び（pts）で持つ。直線は [始点, 終点] の2点。side は前の側（線の向きの左の法線 (-tz,tx) の側なら +1、反対なら -1） */
let groundLineStart=null,groundLinePts=null,groundLinePointer=null,groundLineStroke=null,groundPlanMessage='',groundPlanVisual=null;
function groundPlanUnits(list=orderTargets()){
  return list.filter(f=>f.team===0&&f.alive&&!f.locked&&!f.embarked&&groundCommandAllowed(f,'move'));
}
function groundCopyPlan(p){return p?{dest:p.dest.clone(),from:p.from.clone(),line:p.line.map(v=>v.clone()),width:p.width,face:p.face&&{...p.face},side:p.side}:null;}
function groundPlanCancelInput(){groundLineStart=groundLinePts=groundLinePointer=groundLineStroke=null;groundPlanMessage='';}
function groundPlanReset(){
  groundPlanCancelInput();if(groundPlanVisual){for(const m of Object.values(groundPlanVisual.meshes)){m.parent?.remove(m);m.geometry.dispose();m.material.dispose();}groundPlanVisual=null;}
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
/* 布陣・進撃計画の並び（ユーザー決定 2026-11-14「兵科で2列」）: 前列（歩兵・戦車・W.A.S. など前で受ける兵科）は引いた線の上、
   後列（自走砲・対空・補給・輸送車・工兵・航空など）は前の反対側へ GROUND_PLAN_ROW_KM 下げる。片方の列しかなければ線の上に並べる。
   各列の中は、線に近い位置の順で、線の長さを等しく分けて並べる。曲線では、その場所の線の向きに合わせて正面を向く */
const GROUND_PLAN_FRONT=new Set(['infantry','heavyInfantry','commando','vehicle','was','mechanicalAssault','scout']),GROUND_PLAN_ROW_KM=1; // 列の間1kmは仮
function groundPlanSlots(list,pts,sideGiven=null){
  const L=groundPlanLine(pts);
  if(L.len<1e-6)return {error:'始点から離れた場所を終点に指定してください'};
  const front=list.filter(f=>GROUND_PLAN_FRONT.has(f.groundKind)),back=list.filter(f=>!GROUND_PLAN_FRONT.has(f.groundKind));
  // 前の側: 布陣はプレイヤーが決める（3回目のクリック。2026-11-20）。進撃計画は自軍の隊（重心）の反対側
  let side=sideGiven;
  if(!side){const c={x:list.reduce((s,f)=>s+f.pos.x,0)/list.length,z:list.reduce((s,f)=>s+f.pos.z,0)/list.length};side=groundPlanNearest(L,c).side>=0?-1:1;}
  const first=L.pts[0],last=L.pts[L.pts.length-1],cx=last.x-first.x,cz=last.z-first.z,turn=.5*GROUND_SCALE;
  const shift=front.length&&back.length?GROUND_PLAN_ROW_KM*GROUND_SCALE:0,slots=[],line={pts:L.pts.map(p=>p.clone()),side};
  for(const [row,away] of [[front,0],[back,shift]]){
    const key=f=>groundPlanNearest(L,f.pos).s,sorted=[...row].sort((f,g)=>(key(f)-key(g))||((f.pos.x-g.pos.x)*cx+(f.pos.z-g.pos.z)*cz)||f.id-g.id);
    for(let i=0;i<sorted.length;i++){
      // width: その中隊が線の上で使える幅（列の中の中隊の数で線を割る）。face: その場所の正面。中隊の中の小隊の並び（ground.js groundFormationLayout）に使う
      const f=sorted[i],s=sorted.length===1?L.len/2:L.len*i/(sorted.length-1),q=groundPlanAt(L,s),d=groundPlanDir(L,s,turn),face={x:-d.z*side,z:d.x*side};
      const dest=new THREE.Vector3(q.x-face.x*away,q.y,q.z-face.z*away);
      const path=groundMovePath(f.pos,[dest],groundMoveKind(f));
      if(!path)return {error:f.name+'：指定位置まで通れる経路がありません'};
      slots.push({f,dest,path,line:{width:L.len/sorted.length,face,pts:line.pts,side}});
    }
  }
  return {slots,line};
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
  if(groundLinePts){groundPlanFinish(groundLinePts,p);return;}   // 布陣の3回目: 前の側
  if(!groundLineStart){groundLineStart=p.clone();groundLinePointer=p.clone();groundHud();return;}
  if(Math.hypot(p.x-groundLineStart.x,p.z-groundLineStart.z)<1e-6){groundPlanMessage='始点から離れた場所を終点に指定してください';groundHud();return;}
  groundPlanLineDone([groundLineStart.clone(),p.clone()],p);
}
// 線ができた: 布陣は前の側を待つ（ユーザーの指示 2026-11-20「布陣は前となる向きを決めれるように」）。進撃計画はすぐ決める
function groundPlanLineDone(pts,pointer){
  groundLineStart=null;
  if(groundWorkAiming==='deploy'){groundLinePts=pts;groundLinePointer=pointer?.clone()||null;groundPlanMessage='';groundHud();return;}
  groundPlanFinish(pts,null);
}
function groundPlanFinish(pts,frontAt){
  const mode=groundWorkAiming,list=groundPlanUnits();
  if(!list.length){groundClearAiming();groundHud();return;}
  const result=groundPlanSlots(list,pts,mode==='deploy'?groundPlanSide(pts,frontAt):null);
  if(result.error){groundPlanMessage=result.error;groundHud();return;}
  npcAutoPlayer(list);saveUndo(list);
  if(mode==='plan')for(const {f,dest,line} of result.slots)f.groundPlan={from:f.pos.clone(),dest,line:line.pts,width:line.width,face:line.face,side:line.side};
  else for(const {f,dest,path,line} of result.slots) {groundCancelWork(f);f.queue=[];order(f,{type:'move',dest,groundPreparedPath:path,groundDeploy:true,groundLine:line});}
  groundClearAiming();groundPlanMessage=mode==='plan'?list.length+'隊の進撃計画を準備（実行で開始）':list.length+'隊が布陣を開始';groundHud();
}
/* 曲線（ユーザーの指示 2026-11-20「右クリック長押しで、ひいて行く」）: 布陣・進撃計画の入力中に、ボタン（右でも左でも）か指を
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
function groundPlanExecute(){
  if(!op.ground||over||deploying)return;
  const list=groundPlanUnits().filter(f=>f.groundPlan),slots=[];if(!list.length)return;
  // 計画作成後の移動や架橋・破壊を反映して、実行前に全隊の通路を確認。
  for(const f of list){const dest=f.groundPlan.dest.clone(),path=groundMovePath(f.pos,[dest],groundMoveKind(f));if(!path){groundPlanMessage=f.name+'：経路が変わったため実行できません';groundHud();return;}slots.push({f,dest,path,line:Number.isFinite(f.groundPlan.width)?{width:f.groundPlan.width,face:f.groundPlan.face,pts:f.groundPlan.line,side:f.groundPlan.side}:null});}
  npcAutoPlayer(list);saveUndo(list);
  // 進撃（groundAdvance）: 途中で敵が射程に入ったら、自動交戦の隊は止まって撃ち合い、命令優先の隊は撃ちながら進む（ユーザー決定 2026-11-14。ground.js の groundStep）
  // 同じ実行で動き出した隊を1つの組にし、速さはいちばん遅い隊に合わせる（ユーザー決定 2026-11-14「速さはやっぱ最低速度で」。terrain.js の groundAdvanceSpeed）
  const group={units:slots.map(s=>s.f)};
  for(const {f,dest,path,line} of slots){groundCancelWork(f);f.queue=[];order(f,{type:'move',dest,groundPreparedPath:path,groundAdvance:group,...(line?{groundLine:line}:{})});}
  groundClearAiming();groundPlanMessage=list.length+'隊が進撃を開始';groundHud();
}
function groundPlanHud(list){
  const ready=op.ground&&!over&&!deploying&&groundPlanUnits(list).length>0;
  for(const [id,mode] of [['groundDeploy','deploy'],['groundPlan','plan']]){
    const b=document.getElementById(id);b.disabled=!ready;b.setAttribute('aria-pressed',String(groundWorkAiming===mode));
  }
  document.getElementById('groundExecute').disabled=!ready||!groundPlanUnits(list).some(f=>f.groundPlan);
  const mode=groundWorkAiming,label=mode==='deploy'?'布陣':mode==='plan'?'進撃計画':null;
  const step=groundLineStroke?'線を引いています（離すと決定）':groundLinePts?'前の側をクリック':groundLineStart?'終点をクリック':'始点をクリック、または長押しして線を引く';
  document.getElementById('groundPlanStatus').textContent=groundPlanMessage||(label?label+'：'+step+'（Escで取消）':list.some(f=>f.groundPlan)?'進撃計画あり（実行で開始）':'');
}
function groundPlanHover(p){if(['deploy','plan'].includes(groundWorkAiming)&&!groundLineStroke)groundLinePointer=p?.clone()||null;}
/* 布陣・進撃計画の絵（ユーザーの指示 2026-11-20。見本の段階）:
   ・陣地の線: 太い線の前の側に四角い歯（凸）を並べる。布陣・進撃計画の線と、布陣して守っている線（f.groundFront）
   ・進撃の矢印: 隊から行き先への太い矢印。計画のうちは点かない。進撃中は点滅し、隊が進むにつれて短くなる（隊から伸びるため）
   太さはカメラの距離に合わせて段で変える（遠くでも細くなりすぎない）。色・太さ・歯の間は仮 */
const GROUND_PLAN_LOOK={color:0xe3aa2a,edge:0x1a1407,edgeOpacity:.6,grow:.07,line:.42,tooth:.55,toothGap:1.45,arrow:.48,head:1.7,lift:.45,blinkSec:1};
function groundPlanZoom(){
  const d=typeof controls!=='undefined'&&camera?camera.position.distanceTo(controls.target):60;
  return Math.pow(2,Math.round(Math.log2(Math.max(.35,Math.min(4,d/60)))*4)/4);
}
function groundPlanVertex(P,x,z,lift=0){P.push(x,groundSurfaceHeight(x,z)+GROUND_PLAN_LOOK.lift+lift,z);}
function groundPlanQuad(P,q,lift){ // q: 4 点 [x,z]。2つの三角形
  for(const i of [0,1,2,0,2,3])groundPlanVertex(P,q[i][0],q[i][1],lift);
}
// g: 縁取りのぶん太らせる幅（縁取りは同じ形を少し太く、少し下に暗く描く）。曲線は 0.6 ごとに区切り、区切りごとの向きで帯をつなぐ
function groundPlanFront(P,pts,side,k,g=0,lift=0){
  const LOOK=GROUND_PLAN_LOOK,L=groundPlanLine(pts);if(L.len<1e-6)return;
  const w=LOOK.line*k/2,n=Math.max(1,Math.ceil(L.len/.6)),turn=Math.min(.3,L.len/4);
  const frame=s=>{const q=groundPlanAt(L,s),d=groundPlanDir(L,s,turn);return {q,d,nx:-d.z*(side||1),nz:d.x*(side||1)};};
  const at=(F,u,o)=>[F.q.x+F.d.x*u+F.nx*o,F.q.z+F.d.z*u+F.nz*o];
  let A=frame(0);
  for(let i=1;i<=n;i++){const B=frame(L.len*i/n);groundPlanQuad(P,[at(A,i===1?-g:0,-w-g),at(B,i===n?g:0,-w-g),at(B,i===n?g:0,w+g),at(A,i===1?-g:0,w+g)],lift);A=B;}
  if(!side)return;
  const t=LOOK.tooth*k,gap=LOOK.toothGap*k,count=Math.max(1,Math.floor(L.len/gap)),pad=(L.len-(count-1)*gap)/2;
  for(let i=0;i<count;i++){const F=frame(pad+i*gap);groundPlanQuad(P,[at(F,-t/2-g,w*.9),at(F,t/2+g,w*.9),at(F,t/2+g,w+t+g),at(F,-t/2-g,w+t+g)],lift);}
}
function groundPlanArrow(P,from,to,k,g=0,lift=0){
  const L=GROUND_PLAN_LOOK,dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz),head=L.head*k;if(len<head*.6)return;
  const ux=dx/len,uz=dz/len,nx=-uz,nz=ux,w=L.arrow*k/2+g,body=len-head,at=(s,o)=>[from.x+ux*s+nx*o,from.z+uz*s+nz*o];
  const n=Math.max(1,Math.ceil(body/.6));
  for(let i=0;i<n;i++){const s0=body*i/n-(i?0:g),s1=body*(i+1)/n;groundPlanQuad(P,[at(s0,-w),at(s1,-w),at(s1,w),at(s0,w)],lift);}
  const hw=(L.arrow*k/2)*3+g*2.4;for(const q of [at(body-g,-hw),at(body-g,hw),at(len+g*2.4,0)])groundPlanVertex(P,q[0],q[1],lift);
}
function groundPlanMesh(name,color,opacity,order){
  const m=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));
  m.renderOrder=order;m.name=name;groundVisuals.add(m);return m;
}
// 線の見分け（同じ線を何隊も持つので1本だけ描く）。引いたあと変わらない線は覚えておく
const groundPlanKeys=new WeakMap(),groundPlanQ=v=>Math.round(v*8)/8;
function groundPlanKey(pts,fixed=true){
  let k=fixed&&groundPlanKeys.get(pts);if(k)return k;
  k=pts.map(p=>groundPlanQ(p.x)+','+groundPlanQ(p.z)).join(';');if(fixed)groundPlanKeys.set(pts,k);return k;
}
function groundPlanDraw(){
  if(!groundVisuals)return;
  const L=GROUND_PLAN_LOOK;
  if(!groundPlanVisual)groundPlanVisual={meshes:{stillEdge:groundPlanMesh('groundPlanStillEdge',L.edge,L.edgeOpacity,5),still:groundPlanMesh('groundPlanStill',L.color,1,6),
    blinkEdge:groundPlanMesh('groundPlanBlinkEdge',L.edge,L.edgeOpacity,5),blink:groundPlanMesh('groundPlanBlink',L.color,1,6)},key:{}};
  const V=groundPlanVisual,k=groundPlanZoom(),q=groundPlanQ,fronts=new Map(),still=[],blink=[];
  const front=(pts,side,fixed=true)=>{const key=groundPlanKey(pts,fixed)+'|'+side;if(!fronts.has(key))fronts.set(key,{pts,side,key});};
  const arrow=(from,to)=>({from,to,key:q(from.x)+','+q(from.z)+'>'+q(to.x)+','+q(to.z)});
  for(const f of fleets){
    if(f.team!==0||!f.alive||f.embarked||(typeof groundAbsent==='function'&&groundAbsent(f)))continue;
    const o=f.order,moving=o?.type==='move'&&(o.groundAdvance||o.groundDeploy);
    if(f.groundPlan){const plan=f.groundPlan;front(plan.line,plan.side);still.push(arrow(f.pos,plan.dest));}
    if(moving&&o.groundAdvance)blink.push(arrow(f.pos,o.dest));
    if(f.groundFront&&(moving||f.groundDeployed))front(f.groundFront.pts,f.groundFront.side);
  }
  // 入力中の下書き: 引いている線、終点までの線、布陣の3回目（前の側）を待つあいだはポインタの側に歯
  if(groundLineStroke)front(groundLineStroke,null,false);
  else if(groundLinePts)front(groundLinePts,groundPlanSide(groundLinePts,groundLinePointer),false);
  else if(groundLineStart&&groundLinePointer)front([groundLineStart,groundLinePointer],null,false);
  const build=(name,items,g,lift)=>{
    const key=k+'|'+items.map(x=>x.key).join('|');
    const mesh=V.meshes[name];if(V.key[name]===key)return mesh.geometry.attributes.position?.count>0;
    const P=[];for(const it of items)it.from?groundPlanArrow(P,it.from,it.to,k,g*k,lift):groundPlanFront(P,it.pts,it.side,k,g*k,lift);
    mesh.geometry.dispose();mesh.geometry=new THREE.BufferGeometry();mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(P,3));V.key[name]=key;return P.length>0;
  };
  const stills=[...still,...fronts.values()];
  V.meshes.still.visible=build('still',stills,0,.02);V.meshes.stillEdge.visible=build('stillEdge',stills,L.grow,0);
  V.meshes.blink.visible=build('blink',blink,0,.02);V.meshes.blinkEdge.visible=build('blinkEdge',blink,L.grow,0);
  const on=.5+.5*Math.cos(performance.now()/1000/L.blinkSec*Math.PI*2);
  V.meshes.blink.material.opacity=.25+.75*on;V.meshes.blinkEdge.material.opacity=L.edgeOpacity*(.25+.75*on);
}
document.getElementById('groundDeploy').addEventListener('click',()=>groundPlanToggle('deploy'));
document.getElementById('groundPlan').addEventListener('click',()=>groundPlanToggle('plan'));
document.getElementById('groundExecute').addEventListener('click',groundPlanExecute);
