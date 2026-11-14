/* 地上作戦の共有命令。線の両端をクリックして指定する。保存形式は変えず作戦中だけ保持。 */
let groundLineStart=null,groundLinePointer=null,groundPlanMessage='',groundPlanVisual=null;
function groundPlanUnits(list=orderTargets()){
  return list.filter(f=>f.team===0&&f.alive&&!f.locked&&!f.embarked&&groundCommandAllowed(f,'move'));
}
function groundCopyPlan(p){return p?{dest:p.dest.clone(),from:p.from.clone(),line:p.line.map(v=>v.clone())}:null;}
function groundPlanCancelInput(){groundLineStart=groundLinePointer=null;groundPlanMessage='';}
function groundPlanReset(){
  groundPlanCancelInput();if(groundPlanVisual){groundPlanVisual.parent?.remove(groundPlanVisual);groundPlanVisual.geometry.dispose();groundPlanVisual.material.dispose();groundPlanVisual=null;}
}
function groundPlanToggle(mode){
  if(!op.ground||over||deploying||!groundPlanUnits().length)return;
  const next=groundWorkAiming===mode?null:mode;groundClearAiming();groundWorkAiming=next;groundHud();
}
/* 布陣・進撃計画の並び（ユーザー決定 2026-11-14「兵科で2列」）: 前列（歩兵・戦車・W.A.S. など前で受ける兵科）は引いた線の上、
   後列（自走砲・対空・補給・輸送車・工兵・航空など）は自軍の側（選んだ隊の重心のある側）へ GROUND_PLAN_ROW_KM 下げる。
   片方の列しかなければ線の上に並べる。各列の中は今までどおり線に沿った位置の順で等間隔 */
const GROUND_PLAN_FRONT=new Set(['infantry','heavyInfantry','commando','vehicle','was','mechanicalAssault','scout']),GROUND_PLAN_ROW_KM=1; // 列の間1kmは仮
function groundPlanSlots(list,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  if(length<1e-6)return {error:'始点から離れた場所を終点に指定してください'};
  const front=list.filter(f=>GROUND_PLAN_FRONT.has(f.groundKind)),back=list.filter(f=>!GROUND_PLAN_FRONT.has(f.groundKind));
  let nx=-dz/length,nz=dx/length;
  const cx=list.reduce((s,f)=>s+f.pos.x,0)/list.length-(a.x+b.x)/2,cz=list.reduce((s,f)=>s+f.pos.z,0)/list.length-(a.z+b.z)/2;
  if(cx*nx+cz*nz<0){nx=-nx;nz=-nz;}
  const shift=front.length&&back.length?GROUND_PLAN_ROW_KM*GROUND_SCALE:0,slots=[];
  for(const [row,away] of [[front,0],[back,shift]]){
    const sorted=[...row].sort((f,g)=>((f.pos.x-g.pos.x)*dx+(f.pos.z-g.pos.z)*dz)||f.id-g.id);
    for(let i=0;i<sorted.length;i++){
      const f=sorted[i],dest=a.clone().lerp(b,sorted.length===1?.5:i/(sorted.length-1));dest.x+=nx*away;dest.z+=nz*away;
      const path=groundMovePath(f.pos,[dest],groundMoveKind(f));
      if(!path)return {error:f.name+'：指定位置まで通れる経路がありません'};
      slots.push({f,dest,path});
    }
  }
  return {slots};
}
function groundPlanTap(p){
  if(!op.ground||!['deploy','plan'].includes(groundWorkAiming))return;
  if(!groundLineStart){groundLineStart=p.clone();groundLinePointer=p.clone();groundHud();return;}
  const mode=groundWorkAiming,list=groundPlanUnits(),a=groundLineStart.clone(),b=p.clone();
  if(!list.length){groundClearAiming();groundHud();return;}
  const result=groundPlanSlots(list,a,b);
  if(result.error){groundPlanMessage=result.error;groundHud();return;}
  npcAutoPlayer(list);saveUndo(list);
  if(mode==='plan')for(const {f,dest} of result.slots)f.groundPlan={from:f.pos.clone(),dest,line:[a.clone(),b.clone()]};
  else for(const {f,dest,path} of result.slots) {groundCancelWork(f);f.queue=[];order(f,{type:'move',dest,groundPreparedPath:path});}
  groundClearAiming();groundPlanMessage=mode==='plan'?list.length+'隊の進撃計画を準備（実行で開始）':list.length+'隊が布陣を開始';groundHud();
}
function groundPlanExecute(){
  if(!op.ground||over||deploying)return;
  const list=groundPlanUnits().filter(f=>f.groundPlan),slots=[];if(!list.length)return;
  // 計画作成後の移動や架橋・破壊を反映して、実行前に全隊の通路を確認。
  for(const f of list){const dest=f.groundPlan.dest.clone(),path=groundMovePath(f.pos,[dest],groundMoveKind(f));if(!path){groundPlanMessage=f.name+'：経路が変わったため実行できません';groundHud();return;}slots.push({f,dest,path});}
  npcAutoPlayer(list);saveUndo(list);
  // 進撃（groundAdvance）: 途中で敵が射程に入ったら、自動交戦の隊は止まって撃ち合い、命令優先の隊は撃ちながら進む（ユーザー決定 2026-11-14。ground.js の groundStep）
  for(const {f,dest,path} of slots){groundCancelWork(f);f.queue=[];order(f,{type:'move',dest,groundPreparedPath:path,groundAdvance:true});}
  groundClearAiming();groundPlanMessage=list.length+'隊が進撃を開始';groundHud();
}
function groundPlanHud(list){
  const ready=op.ground&&!over&&!deploying&&groundPlanUnits(list).length>0;
  for(const [id,mode] of [['groundDeploy','deploy'],['groundPlan','plan']]){
    const b=document.getElementById(id);b.disabled=!ready;b.setAttribute('aria-pressed',String(groundWorkAiming===mode));
  }
  document.getElementById('groundExecute').disabled=!ready||!groundPlanUnits(list).some(f=>f.groundPlan);
  const mode=groundWorkAiming,label=mode==='deploy'?'布陣':mode==='plan'?'進撃計画':null;
  document.getElementById('groundPlanStatus').textContent=groundPlanMessage||(label?label+'：'+(groundLineStart?'終点':'始点')+'をクリック（Escで取消）':list.some(f=>f.groundPlan)?'進撃計画あり（実行で開始）':'');
}
function groundPlanHover(p){if(['deploy','plan'].includes(groundWorkAiming))groundLinePointer=p?.clone()||null;}
function groundPlanDraw(){
  if(!groundVisuals)return;
  const inputKey=JSON.stringify([groundLineStart,groundLinePointer,orderTargets().map(f=>[f.id,f.alive,!!f.embarked,f.pos.x,f.pos.z,f.groundPlan])]);
  if(groundPlanVisual?.userData.inputKey===inputKey){groundPlanVisual.visible=true;return;}
  const points=[],fronts=new Set();
  const segment=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.8));for(let i=0;i<n;i++)for(const t of [i/n,(i+1)/n]){const p=a.clone().lerp(b,t);p.y=groundSurfaceHeight(p.x,p.z)+.45;points.push(p);}};
  for(const f of orderTargets())if(f.alive&&!f.embarked&&f.groundPlan){const plan=f.groundPlan;segment(f.pos,plan.dest);const key=plan.line.map(p=>p.x+','+p.z).join('/');if(!fronts.has(key)){fronts.add(key);segment(...plan.line);}}
  if(groundLineStart&&groundLinePointer)segment(groundLineStart,groundLinePointer);
  if(!points.length){if(groundPlanVisual)groundPlanVisual.visible=false;return;}
  if(!groundPlanVisual){groundPlanVisual=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xe2c58a,transparent:true,opacity:.85,depthWrite:false,dashSize:.8,gapSize:.5}));groundPlanVisual.renderOrder=6;groundVisuals.add(groundPlanVisual);}
  const key=points.map(p=>`${p.x},${p.y},${p.z}`).join('|');
  if(groundPlanVisual.userData.key!==key){groundPlanVisual.geometry.dispose();groundPlanVisual.geometry=new THREE.BufferGeometry().setFromPoints(points);groundPlanVisual.computeLineDistances();groundPlanVisual.userData.key=key;}
  groundPlanVisual.userData.inputKey=inputKey;groundPlanVisual.visible=true;
}
document.getElementById('groundDeploy').addEventListener('click',()=>groundPlanToggle('deploy'));
document.getElementById('groundPlan').addEventListener('click',()=>groundPlanToggle('plan'));
document.getElementById('groundExecute').addEventListener('click',groundPlanExecute);
