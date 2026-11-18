/* 地上作戦だけの高度・射撃・表示。宇宙の移動と射撃は sim.js の既存処理を使う。 */
const GROUND_BAND_NAMES={ground:'地上',low:'低',high:'高',sea:'海面'};
let groundView='all', groundVisuals=null, groundGrids={};
let groundOrg=null, groundRosterNodes=[];
function groundInitOrg(org){
  groundOrg=org?JSON.parse(JSON.stringify(org)):{companies:fleets.filter(f=>f.team===0&&f.groundKind!=='sea').map(f=>({id:'unit'+f.id,name:f.name,kind:f.groundKind})),battalions:[],brigades:[]};
  if(org)fleets.filter(f=>f.team===0&&f.groundFixed).forEach(f=>groundOrg.companies.push({id:'unit'+f.id,name:f.name,kind:f.groundKind}));
  // 固定配備の艦は独立部隊として加える。保存中の中隊・大隊には混ぜない。
  fleets.filter(f=>f.team===0&&f.groundKind==='sea').forEach(f=>groundOrg.companies.push({id:'sea'+f.id,name:f.name,kind:'sea'}));
  const mine=fleets.filter(f=>f.team===0);
  mine.forEach((f,i)=>f.companyId=groundOrg.companies[i].id);
  groundRosterNodes=[];
}
function groundMembers(level,id){
  const org=groundOrg, item=org&&org[level].find(x=>x.id===id); if(!item) return [];
  const ids=level==='companies'?[id]:level==='battalions'?item.companies:
    item.battalions.flatMap(id=>org.battalions.find(b=>b.id===id)?.companies||[]);
  return fleets.filter(f=>f.team===0&&!f.ward&&f.alive&&!f.groundExited&&ids.includes(f.companyId));
}
function groundSelectUnit(level,id){ const list=groundMembers(level,id); if(list.length) setSel(list); }
function groundBuildRoster(mk){
  groundRosterNodes=[];fleets.forEach(f=>{f.btn=null;f.stBtn=null;});
  const branch=(level,item,parent)=>{
    const node=document.createElement('div'); node.className='ground-rnode';node.dataset.level=level;node.dataset.id=item.id;
    const head=document.createElement('div');head.className='ground-rhead ghead';
    const fold=document.createElement('button');fold.className='ground-fold';fold.textContent=item.open===false?'＋':'−';fold.setAttribute('aria-expanded',String(item.open!==false));fold.setAttribute('aria-label',item.name+'を開閉');
    fold.onclick=()=>{item.open=item.open===false;buildRoster();updateRoster();};
    const pick=document.createElement('button');pick.className='grpBtn';pick.textContent=item.name;pick.setAttribute('aria-label',item.name+'を一括選択');pick.onclick=()=>groundSelectUnit(level,item.id);
    const meters=document.createElement('small');meters.className='ground-summary';head.append(fold,pick,meters);node.append(head);parent.append(node);groundRosterNodes.push({level,item,pick,meters});
    head.addEventListener('pointerenter',()=>showGroundSummaryTip(level,item,head));head.addEventListener('pointerleave',hideTip);
    if(item.open===false)return;
    const body=document.createElement('div');body.className='ground-rbody';node.append(body);
    if(level==='brigades')item.battalions.forEach(id=>{const b=groundOrg.battalions.find(b=>b.id===id);if(b)branch('battalions',b,body);});
    else companies(item.companies,body);
  };
  const companies=(ids,parent)=>{
    const tiles=document.createElement('div');tiles.className='tiles';parent.append(tiles);
    for(const id of ids){const f=fleets.find(f=>f.team===0&&f.companyId===id);if(f&&!f.groundExited)tiles.append(mk(f));}
  };
  groundOrg.brigades.forEach(b=>branch('brigades',b,rosterEl));
  groundOrg.battalions.filter(b=>!groundOrg.brigades.some(p=>p.battalions.includes(b.id))).forEach(b=>branch('battalions',b,rosterEl));
  const free=groundOrg.companies.filter(c=>!groundOrg.battalions.some(b=>b.companies.includes(c.id)));
  if(free.length){const title=document.createElement('small');title.textContent='独立中隊';rosterEl.append(title);companies(free.map(c=>c.id),rosterEl);}
}
function groundOpenSelected(list){
  if(list.some(f=>f.groundExited)){setSel(list.filter(f=>!f.groundExited));return;}
  let changed=false;
  const open=(items,level)=>items.forEach(item=>{if(item.open===false&&groundMembers(level,item.id).some(f=>list.includes(f))){item.open=true;changed=true;}});
  open(groundOrg.brigades,'brigades');open(groundOrg.battalions,'battalions');if(changed)buildRoster();
}
function groundUpdateRoster(targets){
  for(const {level,item,pick,meters} of groundRosterNodes){const m=groundMembers(level,item.id);groundSupplyUpdateMeters(meters,m);pick.disabled=!m.length;pick.setAttribute('aria-pressed',String(!!m.length&&m.length===targets.length&&m.every(f=>targets.includes(f))));}
}
function groundRules(){ return groundRuleSet().bands; }
// 元の艦種の完成値を通常の換算式で読む。研究・陣営差・編成ボーナス・共通倍率は掛けない。
function groundSeaStats(type,landing=false){
  const model=groundNavalModel({groundKind:'sea',type,groundLanding:landing})||type,s=WOS_DATA.ships.find(s=>s.id===model);
  const name=landing?'揚陸艦':({ff:'高速艇',cl:'イージス艦',bb:'戦艦'}[model]||s.name);
  return {sub:'海の'+name,hp:6+s.def*5,dmg:.4+s.atk*.45,eva:Math.min(.4,s.eva*.04),range:10+s.rng*1.6,speed:2+s.spd,scale:s.scale};
}
// 作戦専用の武器射程（km）を戦闘単位へ変換。索敵・宇宙のrangeとは独立。
function groundFireRanges(f){
  if(!op.ground||!f?.groundKind)return {};
  const data=groundRuleSet(),spec=f.groundKind==='sea'?(groundNavalClass(f)?.rangesKm||data.navalFireRangesKm?.[f.type]):data.unitTypes[f.groundKind]?.fireRangesKm;
  if(!spec)return {};
  const air=f.groundKind==='was'&&['low','high'].includes(f.band),r=air?spec.airborne||{}:spec;
  return {direct:(r.direct||0)*GROUND_SCALE,ground:(r.ground||0)*GROUND_SCALE,air:(r.air||0)*GROUND_SCALE,aa:(r.aa||0)*GROUND_SCALE,
    indirect:r.indirect?{min:(r.indirect.min||0)*GROUND_SCALE,max:r.indirect.max*GROUND_SCALE}:null};
}
function groundAirTarget(t){return ['low','high'].includes(t.band);}
function groundTargetRange(f,t){
  const r=groundFireRanges(f),airborne=['fighter','attack','supportAircraft'].includes(f.groundKind)||f.groundKind==='was'&&['low','high'].includes(f.band);
  const range=groundAirTarget(t)?(airborne?r.air:r.aa)||0:(airborne?r.ground:r.direct)||0;
  return f.groundKind==='sea'&&groundNavalClass(f)&&!groundAirTarget(t)?Math.min(range,(groundNavalHorizonKm(f,t)??0)*GROUND_SCALE):range;
}
function groundManualTargetAllowed(f,t){
  if(!op.ground)return true;
  if(!f?.groundKind||!t)return false;
  // 能力だけを調べる。groundFireMode／発射可否／距離／LOSへ戻らない。
  const r=groundFireRanges(f),band=f.band||'ground',target=t.band||'ground',positive=n=>Number.isFinite(n)&&n>0;
  if(groundAirTarget(t))return !groundAutoAASource(f)&&positive(r.air)&&groundFireFactor(f,t)>0;
  if(!['ground','sea'].includes(target))return false;
  const rules=groundStrikeRules(),weapon=rules[f.groundKind]||(['guidedRocket','was'].includes(f.groundKind)?rules.artillery:null);
  if(f.groundKind==='supportAircraft')return band==='high'&&!!weapon;
  const airborne=['fighter','attack'].includes(f.groundKind)||f.groundKind==='was'&&['low','high'].includes(band);
  if(positive(airborne?r.ground:r.direct)&&groundFireFactor(f,t)>0)return true;
  const indirectTarget=target==='ground'||f.groundKind==='sea'&&target==='sea',indirectSource=f.groundKind==='sea'?band==='sea':['artillery','guidedRocket','was','vehicle'].includes(f.groundKind)&&band==='ground';
  return !!(indirectTarget&&indirectSource&&weapon&&r.indirect&&positive(r.indirect.max)&&Number.isFinite(r.indirect.min)&&r.indirect.min>=0&&r.indirect.min<=r.indirect.max);
}
function groundFireMode(f,t){
  if(!groundManualTargetAllowed(f,t)||!groundAirInFront(f,t))return null;
  const distance=groundDistanceTo(f,t),direct=groundTargetRange(f,t);
  if(groundFireFactor(f,t)>0&&direct>0&&distance<=direct&&groundLineOfSight(f,t))return 'direct';
  const r=groundFireRanges(f).indirect;
  return ((t.band||'ground')==='ground'||f.groundKind==='sea'&&t.band==='sea')&&r&&distance>=r.min&&distance<=r.max&&groundStrikeWeapon(f)&&groundStrikeInRange(f,t.pos)?'indirect':null;
}
function groundEngagementRange(f,t){
  if(!groundManualTargetAllowed(f,t))return 0;
  const direct=groundTargetRange(f,t),indirect=groundFireRanges(f).indirect;
  return Math.max(groundFireFactor(f,t)>0?direct:0,((t.band||'ground')==='ground'||f.groundKind==='sea'&&t.band==='sea')&&groundStrikeWeapon(f)?indirect?.max||0:0);
}
function groundBands(f){ return f.groundKind==='sea'?['sea']:f.groundKind==='droneHive'?['low']:f.groundKind==='was'?['ground','low','high']:['fighter','attack','supportAircraft'].includes(f.groundKind)?['low','high']:['ground']; }
function groundMoveKind(f){ return f.groundKind==='sea'?'sea':(f.band||'ground')==='ground'?(['heavyInfantry','commando','mechanicalAssault'].includes(f.groundKind)?'infantry':['artillery','guidedRocket','mobileAA','supply'].includes(f.groundKind)?'vehicle':f.groundKind):'air'; }
function groundPermissionOnly(f){ return !!groundRuleSet().unitTypes[f.groundKind]?.permissionOnly; }
function groundUnitHeight(f){
  if(f.groundKind==='sea')return 0; // 海面は固定。地表高や高度切り替えから独立。
  const h=groundRules().heights, from=h[f.band||'ground'];
  return groundHeight(f.pos.x,f.pos.z)+(f.bandTo?from+(h[f.bandTo]-from)*(1-f.bandLeft/groundRules().transitionSec):from);
}
// 直接射撃の表（設計案3）。地点攻撃は ground-strike.js で別判定。
function groundFireFactor(f,t){
  const band=f.band||'ground', target=t.band||'ground', weak=groundRules().weakFire;
  const row={heavyInfantry:{ground:1,low:1,high:1},infantry:{ground:1,low:weak},commando:{ground:1,low:weak},guidedRocket:{ground:1},droneHive:{ground:1},mechanicalAssault:{ground:1,low:weak,high:weak},mobileAA:{ground:weak,low:1,high:1},scout:{ground:1},artillery:{ground:1},vehicle:{ground:1,low:weak,high:weak},apc:{ground:1,low:weak,high:weak},engineer:{ground:1},
    sea:{low:1,high:1,sea:1},fighter:{low:1,high:1},attack:band==='low'?{ground:1,low:1,high:1,sea:1}:{low:1,high:1},
    was:{ground:1,low:1,high:1}}[f.groundKind];
  return row&&row[target]||0;
}
function groundDistanceTo(f,t){ return Math.hypot(f.pos.x-t.pos.x,f.pos.z-t.pos.z); }
// チュートリアル2は、とばした後も敵の射撃・追撃を止める。
function groundTrainingEnemy(f){return !!(op.ground&&op.groundDrill&&f?.team===1);}
// デバッグ演習の固定は AI の自発行動だけ。明示した命令や打撃の可否には使わない。
function groundStaticTarget(f){return !!(op.ground&&op.groundStaticEnemies&&f.team===1);}
// 地表の解析高と、描画格子の三角形補間の両方より上に置く。
function groundSurfaceHeight(x,z){return Math.max(groundHeight(x,z),groundSightHeight(x,z));}
function groundCanFire(f,t){ return (!groundPermissionOnly(f)||f.order?.type==='attack'&&f.order.target===t)&&groundFireSolution(f,t); }
// AI の目標指定も、射程・共有視界・遮蔽の同じ規則で候補を調べる。
function groundFireSolution(f,t){ return !groundScriptDescending(f)&&!groundTrainingEnemy(f)&&f.alive&&t.alive&&!groundAbsent(f)&&!groundAbsent(t)&&!f.groundAirState&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0)&&!f.embarked&&!t.embarked&&!f.groundBuilding&&f.team!==t.team&&groundSeenBy(f.team,t)&&!!groundFireMode(f,t); }
function groundLandable(f){ return groundPass(groundMapX(f.pos.x),groundMapY(f.pos.z),'infantry'); }
function groundSetBand(list,band){
  if(!op.ground||!list.length||!list.every(f=>f.alive&&!f.embarked&&groundCommandAllowed(f,'band')&&groundBands(f).includes(band)&&(band!=='ground'||groundLandable(f)))) return false;
  npcAutoPlayer(list);
  for(const f of list){
    if(f.bandTo===band) continue; // 同じ命令の連打では時計を戻さない。
    f.bandTo=band===f.band?null:band; f.bandLeft=f.bandTo?groundRules().transitionSec:0;
    f.pos.y=groundUnitHeight(f);
    if(op.groundDrill)groundDrillEvent('band',f,band);
  }
  groundClearAiming();groundHud(); return true;
}
// 入力待ちだけを解除し、すでに発行した部隊命令は残す。
function groundClearAiming(){
  if(typeof groundPlanCancelInput==='function')groundPlanCancelInput();
  if(typeof groundAreaCancelInput==='function')groundAreaCancelInput();
  groundWorkAiming=null;groundStrikeAiming=false;groundSupplyAiming=false;
  groundTransportMessage=groundStrikeMessage=groundSupplyMessage='';
  if(typeof closePick==='function')closePick();
}
function groundHud(){
  const list=orderTargets(), panel=document.getElementById('alt'); panel.hidden=false;
  groundStrikeHud(list); groundTransportHud(list); groundSupplyHud(list); groundCommandBarHud(list);
  document.getElementById('groundSelected').textContent=list.length===1?list[0].name:list.length?`${list.length}隊`:'部隊を選択';
  document.querySelectorAll('#groundCommand button').forEach(b=>{
    const band=b.dataset.band;
    b.disabled=!list.length||!list.every(f=>!f.embarked&&groundCommandAllowed(f,'band')&&groundBands(f).includes(band)&&(band!=='ground'||groundLandable(f)));
    b.setAttribute('aria-pressed',String(!!list.length&&list.every(f=>(f.bandTo||f.band)===band)));
  });
  document.getElementById('groundBandStatus').textContent=list.map(f=>f.bandTo?`${GROUND_BAND_NAMES[f.band]} → ${GROUND_BAND_NAMES[f.bandTo]}（${Math.ceil(f.bandLeft)}秒）`:GROUND_BAND_NAMES[f.band]).filter((v,i,a)=>a.indexOf(v)===i).join(' / ');
}
function groundSetView(band){
  if(!op.ground||!['all','ground','low','high'].includes(band)) return;
  groundView=band;
  document.querySelectorAll('#groundView button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.band===band)));
  groundDraw();
}
function groundConfigure(active){
  if(typeof camera!=='undefined'&&camera){camera.far=active?Math.max(3000,Math.max(groundDimensions().widthWorld,groundDimensions().heightWorld)*5):3000;camera.updateProjectionMatrix?.();}
  if(typeof groundPlanReset==='function')groundPlanReset();
  groundRangesClear();
  groundBridgeNoGoClear();
  document.getElementById('groundCommandBar').hidden=!active;
  document.getElementById('groundCommandExpand').setAttribute('aria-expanded','false');
  document.getElementById('groundUniqueCommands').classList.remove('expanded');
  groundStrikeReset(); groundTransportReset(); groundSupplyReset();
  if(typeof npcGroundReset==='function')npcGroundReset();
  groundInfluenceCache=null;groundTerritoryPixels=null;
  if(typeof fleets!=='undefined')for(const f of fleets||[])if(groundFlyingAircraft(f)){groundBombCancel(f);f.groundFlightVelocity=null;f.groundAirBoundary=null;}
  groundView='all'; groundVisuals=null; groundGrids={}; groundSightReset();
  groundSites.forEach(s=>s.el.remove()); groundSites=[]; groundTerritory=null;
  document.getElementById('alt').classList.toggle('ground-alt',active);
  document.getElementById('groundAlt').hidden=!active;
  document.querySelectorAll('#groundView button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.band==='all')));
}
document.querySelectorAll('#groundCommand button').forEach(b=>b.addEventListener('click',()=>groundSetBand(orderTargets(),b.dataset.band)));
document.querySelectorAll('#groundView button').forEach(b=>b.addEventListener('click',()=>groundSetView(b.dataset.band)));
document.querySelectorAll('#groundStrike').forEach(b=>b.addEventListener('click',groundStrikeToggle));
// Formation state follows simulation movement, independently of drawing.
function groundFormationState(f,now=gameSec){
  if(now-(f.groundMovedAt??(!f.bodies?f.groundModel?.userData.movedAt:undefined)??-Infinity)<.4)return f.order?.groundAdvance?'advance':'move';
  return f.groundDeployed?'defend':'idle';
}
// groundLine（布陣・進撃計画の線。ground-plan.js）: その中隊が使える幅と正面。着いたら正面を向き、その幅で小隊を並べる（2026-11-18）
function groundFormationOrder(f,o){
  if(['move','attack'].includes(o.type)&&!o.groundDeploy&&!o.groundAdvance)f.groundDeployed=false;
  if(o.groundDeploy||o.groundAdvance)f.groundLine=o.groundLine?{width:o.groundLine.width,face:{...o.groundLine.face}}:null;
}
function groundFormationArrive(f){
  if(!(f.order?.groundDeploy||f.order?.groundAdvance))return;
  f.groundDeployed=true;const face=f.groundLine?.face;if(face&&Math.hypot(face.x,face.z)>1e-6)f.heading.set(face.x,0,face.z).normalize();
}
function groundBodyRandom(f,i){
  let seed=2166136261;
  for(const c of `${f.id}:${f.name}:${i}`)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}
/* 小隊の並び（ユーザー決定 2026-11-18）: 1小隊の並び（spec.platoon。GROUND_FORMS）を小隊の数だけ並べる。布陣・進撃では、布陣の線で
   その中隊が使える幅（f.groundLine.width。ground-plan.js）に横一列に並べ、入りきらない小隊は後ろの列へ。幅の指定がなければ横一列。
   ふつうに止まっているとき（idle）は2列の塊の大きさの中にばらけ、動くとき（move）は全部の体で道筋に沿った列（groundMarchLayout）。小隊の間は1小隊の幅（奥行き）＋
   GROUND_PLATOON_GAP（模型の単位、仮） */
const GROUND_PLATOON_GAP=1.6;
function groundPlatoonOffsets(spec,cols){
  const one=spec.platoon||spec.offsets,p=spec.platoons||1;if(p<=1)return one;
  const xs=one.map(o=>o[0]),zs=one.map(o=>o[1]),w=Math.max(...xs)-Math.min(...xs)+GROUND_PLATOON_GAP,d=Math.max(...zs)-Math.min(...zs)+GROUND_PLATOON_GAP,out=[];
  cols=Math.max(1,Math.min(p,cols));
  for(let k=0;k<p;k++){const r=Math.floor(k/cols),inRow=Math.min(cols,p-r*cols),c=k-r*cols;for(const [x,z] of one)out.push([x+(c-(inRow-1)/2)*w,z-r*d]);}
  return out;
}
// 1小隊の横幅（戦闘の単位）。布陣の幅にいくつ横に並ぶかを決める
function groundPlatoonWidth(spec){const one=spec.platoon||spec.offsets,xs=one.map(o=>o[0]);return (Math.max(...xs)-Math.min(...xs)+GROUND_PLATOON_GAP)*spec.size;}
// 1小隊の体の数。体1つの射撃・地点攻撃の威力は「中隊の火力 ÷ 1小隊の体の数」で、小隊が多いほど撃つ体が増える
function groundBodiesPerPlatoon(f){return Math.max(1,(f.bodies0||1)/(f.groundPlatoons||1));}
// 状態ごとの並び（体の位置の計算と描画で共通）。形と布陣の幅が変わったら作り直す
function groundLayouts(f,spec=f.groundBodySpec){
  const width=f.groundLine?.width??Infinity,c=f.groundBodyLayouts;
  if(c&&c.spec===spec&&c.width===width)return c;
  const out={spec,width};for(const st of ['idle','defend','advance','move'])out[st]=groundFormationLayout(f,spec,st);
  return f.groundBodyLayouts=out;
}
function groundFormationLayout(f,spec,state){
  const p=spec.platoons||1,width=f.groundLine?.width,cols=p<=1?1:state==='idle'?Math.min(2,p):Number.isFinite(width)?Math.floor(width/groundPlatoonWidth(spec)):p;
  const base=groundPlatoonOffsets(spec,cols).map(([x,z])=>({x:x*spec.size,y:0,z:z*spec.size,yaw:0,bank:0})),n=base.length;
  if(n<2)return base;
  const vehicles=['vehicle','apc','artillery','guidedRocket','mobileAA','scout','engineer','supply'],foot=['infantry','heavyInfantry','commando','mechanicalAssault','was'];
  if(!vehicles.includes(f.groundKind)&&!foot.includes(f.groundKind))return base;
  if(state==='move')return groundMarchLayout(f,spec,vehicles.includes(f.groundKind));
  if(state==='idle'){
    const radius=Math.max(...base.map(p=>Math.hypot(p.x,p.z)))*1.3;
    return base.map((p,i)=>{const random=groundBodyRandom(f,i),a=random()*Math.PI*2,r=Math.sqrt(random())*radius;return {...p,x:Math.cos(a)*r,z:Math.sin(a)*r,yaw:(random()*2-1)*Math.PI/3};});
  }
  return base;
}
/* 動くときの列（ユーザー承認 2026-11-18。見本は千鳥の2列・曲線・ずれ）。体ごとに、列の先頭からの道筋の上の距離 s と横のずれ lat を決め、
   描くときと当たり判定のときに、中隊の道筋（groundMarchPositions）の上へ置く。
   - 歩兵: 基本は2列、3割ほどの横並びは3人。車両: 左右交互の千鳥の2列（最大2列）。小隊のあいだは少しあける。
   - どちらも前後左右に少しずらし、動いているあいだはゆっくりゆらぐ（la/lw/lp は横、sa/sw/sp は前後のゆらぎの幅・速さ・位相）。
   - 間隔は体の大きさ（モデルの長さと幅）から決めるので、モデルの大きさを変えると列の長さも変わる。数値はすべて仮 */
const GROUND_MARCH={
  foot:{row:1.7,minRow:.6,lane:1.7,minLane:.36,three:.3,platoonGap:1.3,smooth:1.1},
  vehicle:{step:.62,minStep:.45,lane:.85,minLane:.3,platoonGap:1.4,smooth:1.7}
};
const groundBodyDimsCache=new Map();
function groundBodyDims(spec){
  if(!spec.key)return {len:2*spec.size,wid:spec.size};
  const k=spec.key+':'+spec.size;if(groundBodyDimsCache.has(k))return groundBodyDimsCache.get(k);
  const g=groundShapeGeo(spec.key);g.computeBoundingBox();const b=g.boundingBox,out={len:(b.max.z-b.min.z)*spec.size,wid:(b.max.x-b.min.x)*spec.size};g.dispose();
  groundBodyDimsCache.set(k,out);return out;
}
function groundMarchLayout(f,spec,vehicle){
  const p=spec.platoons||1,n=spec.offsets.length,per=Math.max(1,Math.round(n/p)),{len,wid}=groundBodyDims(spec),out=[];
  let s=0;
  if(!vehicle){
    const M=GROUND_MARCH.foot,row=Math.max(len*M.row,M.minRow),lane=Math.max(wid*M.lane,M.minLane);
    for(let k=0;k<p;k++){
      if(k)s+=row*M.platoonGap;
      for(let j=0;j<per;){
        let w=per-j>=3&&groundBodyRandom(f,5000+k*97+j)()<M.three?3:2;w=Math.min(w,per-j);
        for(let c=0;c<w;c++){
          const i=k*per+j+c,r=groundBodyRandom(f,9000+i);
          out[i]={s:s+(r()-.5)*row*.55,lat:(c-(w-1)/2)*lane+(r()-.5)*lane*.4,la:lane*(.18+r()*.14),lw:2*Math.PI/(5+r()*5),lp:r()*6.3,sa:row*(.18+r()*.14),sw:2*Math.PI/(4+r()*5),sp:r()*6.3,ya:.18};
        }
        j+=w;s+=row;
      }
      s-=row;
    }
    out.smooth=M.smooth;
  }else{
    const M=GROUND_MARCH.vehicle,step=Math.max(len*M.step,M.minStep),lane=Math.max(wid*M.lane,M.minLane);
    for(let k=0;k<p;k++){
      if(k)s+=step*M.platoonGap;
      const first=groundBodyRandom(f,7000+k)()<.5?1:-1;
      for(let j=0;j<per;j++){
        const i=k*per+j,r=groundBodyRandom(f,9000+i);
        out[i]={s:s+(r()-.5)*step*.35,lat:(j%2?-first:first)*lane+(r()-.5)*lane*.35,la:lane*(.12+r()*.12),lw:2*Math.PI/(7+r()*6),lp:r()*6.3,sa:step*(.1+r()*.1),sw:2*Math.PI/(6+r()*6),sp:r()*6.3,ya:.06};
        s+=step;
      }
      s-=step;
    }
    out.smooth=Math.max(GROUND_MARCH.foot.smooth,len*M.smooth);
  }
  for(let i=0;i<n;i++)if(!out[i])out[i]={s,lat:0,la:0,lw:0,lp:0,sa:0,sw:0,sp:0,ya:0};
  out.L=s;out.march=true;
  return out;
}
/* 通った道（f.groundTrail、新しい順、0.2ごと）。動いているあいだだけ残し、止まったら消す（次に動くとき、前の道を逆向きにたどらない） */
const GROUND_TRAIL_STEP=.2;
function groundTrailMark(f){
  if(!f.groundBodySpec||groundFormationState(f)!=='move'){f.groundTrail=null;return;}
  const t=f.groundTrail;
  if(!t){f.groundTrail=[{x:f.pos.x,z:f.pos.z}];return;}
  if(Math.hypot(f.pos.x-t[0].x,f.pos.z-t[0].z)<GROUND_TRAIL_STEP)return;
  t.unshift({x:f.pos.x,z:f.pos.z});
  const lay=f.groundBodyLayouts?.move,need=(lay?.L||0)/2+(lay?.smooth||0)+3;
  let acc=0;for(let i=1;i<t.length;i++){acc+=Math.hypot(t[i].x-t[i-1].x,t[i].z-t[i-1].z);if(acc>need){t.length=i+1;break;}}
}
/* 折れ線を先から順にたどる（d は増える順に渡す）。折れ線の先は最後の向きのまま延ばす（点が1つなら dx,dz の向き） */
function groundPolyWalker(poly){
  let i=1,acc=0;
  return (d,out)=>{
    while(i<poly.length){const a=poly[i-1],b=poly[i],l=Math.hypot(b.x-a.x,b.z-a.z);if(acc+l>=d&&l>1e-9){const k=(d-acc)/l;out.x=a.x+(b.x-a.x)*k;out.z=a.z+(b.z-a.z)*k;return out;}acc+=l;i++;}
    const m=poly.length;
    if(m<2){out.x=poly[0].x+poly[0].dx*(d-acc);out.z=poly[0].z+poly[0].dz*(d-acc);return out;}
    const a=poly[m-2],b=poly[m-1],l=Math.hypot(b.x-a.x,b.z-a.z)||1;out.x=b.x+(b.x-a.x)/l*(d-acc);out.z=b.z+(b.z-a.z)/l*(d-acc);return out;
  };
}
// 折れ線の長さ（limit を超えたらそこで止める）
function groundPolyLength(poly,limit=Infinity){let acc=0;for(let i=1;i<poly.length&&acc<=limit;i++)acc+=Math.hypot(poly[i].x-poly[i-1].x,poly[i].z-poly[i-1].z);return acc;}
/* 道筋: 中隊の位置から前はこれから通る経路、後ろは通った道。細かく取って幅 smooth でならし（角が丸くなる）、体を s の位置へ置く。
   列の真ん中が中隊の位置。目的地が近いと前半を縮める（先頭が目的地で止まり、列が詰まる） */
const GROUND_MARCH_STEP=.15;
function groundMarchPositions(f,lay,now){
  const hx=f.heading.x,hz=f.heading.z,path=f.order?.path,ahead=[{x:f.pos.x,z:f.pos.z,dx:hx,dz:hz}],behind=[{x:f.pos.x,z:f.pos.z,dx:-hx,dz:-hz}];
  if(path?.points&&['move','attack'].includes(f.order.type))for(let i=path.atIndex||0;i<path.points.length;i++)ahead.push({x:path.points[i].x,z:path.points[i].z});
  if(f.groundTrail)for(let i=1;i<f.groundTrail.length;i++)behind.push(f.groundTrail[i]);
  const smooth=lay.smooth||1,half=lay.L/2,avail=ahead.length>1?groundPolyLength(ahead,half):Infinity,squeeze=Math.min(1,avail/Math.max(half,1e-6));
  const H=GROUND_MARCH_STEP,back=Math.ceil((half+1+smooth)/H),lo=-back*H,hi=half*squeeze+1+smooth,K=back+Math.ceil(hi/H)+1,sx=new Float64Array(K+1),sz=new Float64Array(K+1);
  // 後ろの点は中隊の位置から遠ざかる順、前の点は近い順にたどる（u = lo + k·H。k = back が中隊の位置）
  const q={x:0,z:0},walkBack=groundPolyWalker(behind),walkAhead=groundPolyWalker(ahead),xs=new Float64Array(K),zs=new Float64Array(K);
  for(let k=back;k>=0;k--){walkBack((back-k)*H,q);xs[k]=q.x;zs[k]=q.z;}
  for(let k=back+1;k<K;k++){walkAhead((k-back)*H,q);xs[k]=q.x;zs[k]=q.z;}
  for(let k=0;k<K;k++){sx[k+1]=sx[k]+xs[k];sz[k+1]=sz[k]+zs[k];}
  const w=Math.round(smooth/H),sm=k=>{k=Math.max(0,Math.min(K-1,k));const a=Math.max(0,k-w),b=Math.min(K-1,k+w),c=b-a+1;return {x:(sx[b+1]-sx[a])/c,z:(sz[b+1]-sz[a])/c};};
  const at=u=>{const t=(u-lo)/H,k=Math.floor(t),e=t-k,a=sm(k),b=sm(k+1);return {x:a.x+(b.x-a.x)*e,z:a.z+(b.z-a.z)*e};};
  return lay.map(b=>{
    let u=half-(b.s+b.sa*Math.sin(b.sw*now+b.sp));if(u>0)u*=squeeze;
    const p=at(u),q=at(u+.3),r=at(u-.3);let tx=q.x-r.x,tz=q.z-r.z;const tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
    const lat=b.lat+b.la*Math.sin(b.lw*now+b.lp);
    return {x:p.x+tz*lat,z:p.z-tx*lat,yaw:Math.atan2(tx,tz)+b.ya*Math.sin(b.lw*now+b.lp+1.2)};
  });
}
function groundAircraftCombat(f){
  const target=f.order?.type==='attack'?f.order.target:null;
  return !!(f.fireTarget||target?.alive&&groundDistanceTo(f,target)<=groundTargetRange(f,target)*1.5);
}
function groundFormationDraw(f,now){
  const model=f.groundModel,data=model.userData,form=data.formation;
  // Legacy drawing/capture helpers can build a model without groundInitUnit.
  if(!data.last){data.last=f.pos.clone();data.movedAt=-Infinity;data.drawnAt=now;}
  const dt=Math.max(0,now-data.drawnAt);data.drawnAt=now;
  if(data.last.distanceToSquared(f.pos)>1e-10)data.movedAt=now;
  data.last.copy(f.pos);
  if(!form)return;
  const state=groundFormationState(f,now),air=['fighter','attack'].includes(f.groundKind)&&form.spec.form==='flight4';
  const combat=air&&groundAircraftCombat(f),targets=groundLayouts(f,form.spec)[air?'defend':state],k=1-Math.exp(-4*dt);
  /* 地上の体は世界の向きでならす: 隊の向きが経路の角で急に変わっても、体がいっせいに振られない（2026-11-18）。
     a0 は前の描画のモデルの向き、a1 は今の向き。動くときの列は道筋の上の位置（groundBodyPositions）へ寄せる */
  const a1=Math.atan2(f.heading.x,f.heading.z),c1=Math.cos(a1),s1=Math.sin(a1),a0=data.drawYaw??a1,da=a1-a0,cd=Math.cos(da),sd=Math.sin(da);data.drawYaw=a1;
  const march=targets.march&&!air?groundBodyPositions(f):null;
  form.bodies.forEach((body,i)=>{
    let target=targets[i];
    if(combat){
      const flight=form.flights[i],a=flight.phase+now*flight.omega;
      target={x:Math.cos(a)*flight.radius,z:Math.sin(a)*flight.radius,y:.5*Math.sin(now*flight.sway+flight.phase),yaw:Math.atan2(-Math.sin(a)*flight.omega,Math.cos(a)*flight.omega),bank:Math.sign(flight.omega)*.28};
    }
    if(air){
      body.position.x+=(target.x-body.position.x)*k;body.position.y+=(target.y-body.position.y)*k;body.position.z+=(target.z-body.position.z)*k;
      body.rotation.y+=Math.atan2(Math.sin(target.yaw-body.rotation.y),Math.cos(target.yaw-body.rotation.y))*k;
      body.rotation.z+=(target.bank-body.rotation.z)*k;
    }else{
      // 隊の向きが変わった分だけ体を逆に回し、世界では元の所に残す（向きが同じなら何もしない）
      if(da){const x=body.position.x,z=body.position.z;body.position.x=x*cd-z*sd;body.position.z=x*sd+z*cd;body.rotation.y-=da;}
      let tx=target.x,tz=target.z,ty=target.yaw;
      if(march){const p=march.positions[i]||march.positions[0],wx=p.x-f.pos.x,wz=p.z-f.pos.z;tx=wx*c1-wz*s1;tz=wx*s1+wz*c1;ty=(march.yaws?.[i]??a1)-a1;}
      body.position.x+=(tx-body.position.x)*k;body.position.y+=((target.y||0)-body.position.y)*k;body.position.z+=(tz-body.position.z)*k;
      body.rotation.y+=Math.atan2(Math.sin(ty-body.rotation.y),Math.cos(ty-body.rotation.y))*k;
      body.rotation.z+=((target.bank||0)-body.rotation.z)*k;
    }
    for(const moving of data.pose?.move[i]||[]){moving.position.copy(body.position);moving.rotation.copy(body.rotation);}
  });
}
function groundAliveBodies(f){return f.bodies?f.bodies.reduce((n,b)=>n+(b.alive?1:0),0):f.ships.length;}
// Cache only geometry. HP and living-body choices are read afresh after every hit.
function groundBodyPositions(f){
  const state=groundFormationState(f),spec=f.groundBodySpec,c=f.groundBodyGeometry;
  const width=f.groundLine?.width??Infinity;
  if(c&&c.x===f.pos.x&&c.y===f.pos.y&&c.z===f.pos.z&&c.hx===f.heading?.x&&c.hz===f.heading?.z&&c.band===f.band&&c.state===state&&c.spec===spec&&c.width===width&&(state!=='move'||c.t===gameSec))return c;
  const centered=!f.bodies||f.bodies0===1||!spec||['fighter','attack','supportAircraft'].includes(f.groundKind)||f.groundKind==='was'&&f.band!=='ground';
  let positions,yaws=null;
  if(centered)positions=[f.pos.clone()];
  else{
    const lay=groundLayouts(f,spec)[state];
    // 動くときの列は道筋の上（ゆらぎは時計で変わるので、動いているあいだは毎回作り直す）
    if(lay.march){const m=groundMarchPositions(f,lay,gameSec);positions=m.map(p=>new THREE.Vector3(p.x,f.pos.y,p.z));yaws=m.map(p=>p.yaw);}
    else{const a=Math.atan2(f.heading.x,f.heading.z),cos=Math.cos(a),sin=Math.sin(a);positions=lay.map(p=>new THREE.Vector3(f.pos.x+p.x*cos+p.z*sin,f.pos.y,f.pos.z-p.x*sin+p.z*cos));}
  }
  return f.groundBodyGeometry={x:f.pos.x,y:f.pos.y,z:f.pos.z,hx:f.heading?.x,hz:f.heading?.z,band:f.band,state,spec,width,t:gameSec,positions,yaws};
}
function groundBodyPosition(f,i){const positions=groundBodyPositions(f).positions;return (positions[i]||positions[0]).clone();}
function groundBodySync(f){f.hpPool=f.bodies.reduce((n,b)=>n+(b.alive?b.hp:0),0);}
function groundBodyHit(f,body,amt){
  if(!body?.alive||!(amt>0))return;
  body.hp=Math.max(0,body.hp-amt);
  if(body.hp===0){body.alive=false;burst(groundBodyPosition(f,f.bodies.indexOf(body)),TEAM_COL[f.team],16,7,.9);}
  groundBodySync(f);
}
function groundBodiesSpread(f,amt){
  if(!f.bodies){f.hpPool=Math.max(0,f.hpPool-amt);return;}
  const live=groundAliveBodies(f);if(live)for(const b of f.bodies)if(b.alive)groundBodyHit(f,b,amt/live);groundBodySync(f);
}
function groundBodyTarget(f,i,t,range){
  const fromGeometry=groundBodyPositions(f),toGeometry=groundBodyPositions(t),from=fromGeometry.positions[i]||fromGeometry.positions[0];
  const mask=t.bodies?t.bodies.reduce((n,b,j)=>n+(b.alive?2**j:0),0):1;
  // Reuse a ray only within this simulation instant and with identical geometry/live slots.
  // A moving squad, a formation change, or a newly destroyed target invalidates it immediately.
  const cache=f.groundBodyTargets||(f.groundBodyTargets=new Map()),rows=cache.get(t)||[];cache.set(t,rows);
  const old=rows[i];if(old&&old.time===gameSec&&old.from===fromGeometry&&old.to===toGeometry&&old.mask===mask&&old.range===range&&old.buildings===groundBuildings)return old.hit;
  let best=-1,dist=Infinity;
  const count=t.bodies?t.bodies.length:1;
  for(let j=0;j<count;j++){
    if(t.bodies&&!t.bodies[j].alive)continue;
    const p=toGeometry.positions[j]||toGeometry.positions[0],d=Math.hypot(from.x-p.x,from.z-p.z);
    if(d<dist){best=j;dist=d;}
  }
  let hit=null;
  if(best>=0&&dist<=range){
    const pos=toGeometry.positions[best]||toGeometry.positions[0],heights=groundRules().heights,eyeHeight=groundSightRules().eyeHeight;
    const eye=(unit,p)=>({x:p.x,z:p.z,y:groundHeight(p.x,p.z)+(heights[unit.band||'ground']||0)+eyeHeight});
    if(groundClearLine(eye(f,from),eye(t,pos)))hit={from,pos,b:t.bodies?t.bodies[best]:null,j:best};
  }
  rows[i]={time:gameSec,from:fromGeometry,to:toGeometry,mask,range,buildings:groundBuildings,hit};return hit;
}
function groundAnyBodyCanFire(f,t){
  if(!f.bodies)return true;
  const mode=groundFireMode(f,t);if(mode!=='direct')return mode==='indirect';
  const range=groundTargetRange(f,t);return f.bodies.some((b,i)=>b.alive&&groundBodyTarget(f,i,t,range));
}
// Match groundDraw's existing .15 lift; hit tests still use the unshifted body positions.
function groundBodyShotPosition(f,p){const out=p.clone();if(f.band==='ground')out.y+=.15;return out;}
function groundBodyIdleClock(f,timer){
  // Keep the seeded phases while there is no target, rather than making every clock wait at zero.
  for(const b of f.bodies)if(b.alive&&b[timer]<=0)b[timer]=groundRules().fireEvery;
}
function groundBodyFire(f,t,dt,aa=false){
  const timer=aa?'aaT':'shotT',range=aa?groundAARange(f):groundTargetRange(f,t);
  for(const [i,b] of f.bodies.entries()){
    b[timer]=Math.max(0,b[timer]-dt);if(!b.alive||b[timer]>0||!t.alive)continue;
    const hit=groundBodyTarget(f,i,t,range);if(!hit)continue;
    b[timer]=groundRules().fireEvery;shoot(groundBodyShotPosition(f,hit.from),groundBodyShotPosition(t,hit.pos),TEAM_COL[f.team],.25);
    damage(t,f.dmg*groundFireFactor(f,t)*groundMatchup(f,t)*groundSupplyAttackFactor(f)/groundBodiesPerPlatoon(f),f,null,hit.b);
    groundSupplyShot(f,false,1/f.bodies0);
  }
}
/* 小隊の数（docs/spec.md「地上の部隊編成」、2026-11-18）: 1小隊は今の駒1つぶん。中隊の体の数・耐久・火力を小隊の数の倍にする。
   体1つの耐久と、体1つの射撃・地点攻撃の弾の威力は1小隊のときと同じ。海の艦は1のまま。指定のない部隊は1（作戦のデータの部隊は
   terrain.js groundUnitSpec で4） */
function groundPlatoonCount(f){return f.groundKind==='sea'?1:Math.max(1,Math.min(4,Math.round(+f.groundPlatoons)||1));}
function groundInitUnit(f){
  f.groundPlatoons=groundPlatoonCount(f);if(!f.groundPlatoonHp){f.hpPool*=f.groundPlatoons;f.groundPlatoonHp=true;}
  f.groundMaxHp=f.hpPool;
  const one=groundModelFor(f.groundKind==='sea'?'sea:'+(groundNavalModel(f)||f.type):f.groundKind,f.side||(f.team===1?'mars':'earth'));
  const bodySpec=one&&f.groundPlatoons>1?{...one,platoon:one.offsets,platoons:f.groundPlatoons,offsets:groundPlatoonOffsets({...one,platoon:one.offsets,platoons:f.groundPlatoons},f.groundPlatoons)}:one;
  f.groundBodyGeometry=null;f.groundBodyLayouts=null;f.groundBodyTargets=null;
  f.groundBodySpec=bodySpec;f.bodies0=f.groundKind==='sea'?1:(bodySpec?.offsets.length||1);
  f.bodies=Array.from({length:f.bodies0},(_,i)=>({hp:f.groundMaxHp/f.bodies0,max:f.groundMaxHp/f.bodies0,alive:true,shotT:groundBodyRandom(f,i)()*groundRules().fireEvery,aaT:groundBodyRandom(f,i)()*groundRules().fireEvery}));
  groundBodySync(f);f.groundMovedAt=-Infinity;
  f.band=groundBands(f).includes(f.band)?f.band:groundBands(f)[0]; f.bandTo=null; f.bandLeft=0;
  // 兵科変更・追加で元の配置が通れなくなった時は、同じ出発点付近の通行可能なセルへ置く。
  if(!groundPass(groundMapX(f.pos.x),groundMapY(f.pos.z),groundMoveKind(f))){
    const size=WOS_TERRAIN[op.ground].meta.cellKm;let best=null,dist=Infinity;
    for(let y=size/2;y<groundDimensions().heightKm;y+=size)for(let x=size/2;x<groundDimensions().widthKm;x+=size){
      if(!groundPass(x,y,groundMoveKind(f)))continue;const p=groundPoint(x,y),d=p.distanceToSquared(f.pos);if(d<dist){best=p;dist=d;}
    }
    if(best)f.pos.copy(best);
  }
  f.pos.y=groundUnitHeight(f);f.groundLastPos=f.pos.clone(); f.post.copy(f.pos); f.home.copy(f.pos); f.seen=false; f.groundContacts=[null,null];
  for(const s of f.ships){ s.off.set(0,0,0); s.pos.copy(f.pos); }
  groundSelectionInit(f);
  const model=f.groundModel=new THREE.Group(); groundVisuals.add(model);
  Object.assign(model.userData,{last:f.pos.clone(),movedAt:-Infinity,drawnAt:gameSec});
  const spec=bodySpec;
  model.userData.groundShape=!!spec;
  if(spec){
    const team=TEAM_COL[f.team],base=new THREE.MeshStandardMaterial({color:team.clone().multiplyScalar(.5),emissive:team,emissiveIntensity:.22,metalness:.35,roughness:.5,vertexColors:true});
    const mat=base.clone(); base.dispose(); mat.transparent=true; mat.userData.baseOpacity=1;
    const geos=new Map([spec.key,...spec.move].map(key=>[key,null]));
    // y: the table's lift of the shape before scaling (the sea assault carriers' waterline, docs/models.md 15.25)
    for(const key of geos.keys()){ const g=groundShapeGeo(key); if(spec.y)g.translate(0,spec.y,0); geos.set(key,g); }
    const geo=geos.get(spec.key),size=spec.size;
    const form=model.userData.formation={spec,bodies:[],layouts:{},flights:[]};
    form.layouts=groundLayouts(f,spec);
    const radius=Math.max(...spec.offsets.map(([x,z])=>Math.hypot(x,z)))*size;
    if(spec.move.length)model.userData.pose={stand:[],move:[],clocks:[],last:f.pos.clone(),movedAt:-Infinity};
    for(const [i,[x,z]] of spec.offsets.entries()){
      const body=new THREE.Mesh(geo,mat); body.scale.setScalar(size); body.position.set(x*size,0,z*size); model.add(body);
      form.bodies.push(body);
      const flightRandom=groundBodyRandom(f,i);
      form.flights.push({phase:flightRandom()*Math.PI*2,radius:radius*(1+flightRandom()),omega:Math.PI*2/(4+flightRandom()*3)*(flightRandom()<.5?-1:1),sway:1+flightRandom()});
      if(spec.move.length){
        // Stable body-local seed: drawing or rebuilding this fleet must not reshuffle its steps.
        const random=groundBodyRandom(f,i);
        const clock={start:Math.floor(random()*spec.move.length),phase:random(),stepSec:.45*(.8+random()*.45)};
        const moves=spec.move.map(key=>{
          const moving=new THREE.Mesh(geos.get(key),mat); moving.scale.copy(body.scale); moving.position.copy(body.position); moving.visible=false; model.add(moving);return moving;
        });
        model.userData.pose.stand.push(body); model.userData.pose.move.push(moves); model.userData.pose.clocks.push(clock);
      }
    }
  }
  else if(['fighter','attack','supportAircraft'].includes(f.groundKind)) groundAircraft(model,TEAM_COL[f.team]);
  else {
    const src=f.groundKind==='was'?craftMeshes[f.team].was:shipMeshes[f.team][f.groundKind==='sea'?(groundNavalModel(f)||f.type):'cv'];
    const mat=src.material.clone(); mat.transparent=true; mat.userData.baseOpacity=1;
    const geo=f.groundKind==='was'?src.geometry.clone():shapeGeo(f.groundKind==='sea'?(groundNavalModel(f)||f.type):'cv');
    if(mat.vertexColors&&!geo.attributes.color)geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*3).fill(1),3));
    const mesh=new THREE.Mesh(geo,mat); mesh.scale.setScalar(f.groundKind==='was'?1:SHIP_SIZE[f.groundKind==='sea'?(groundNavalModel(f)||f.type):f.type]||f.scale); model.add(mesh);
  }
  groundSupplyInitUnit(f);
}
function groundInit(){
  groundVisuals=new THREE.Group(); groundVisuals.scale.setScalar(1/GROUND_SCALE); groundBoard.add(groundVisuals);
  for(const f of fleets)groundInitUnit(f);
  // 見本と同じ薄い格子。地表の起伏と同じ高さを足し、盤の輪郭内だけに置く。
  const dims=groundDimensions(),span=Math.max(dims.widthWorld,dims.heightWorld),gap=Math.max(groundRules().gridStep,span/48),segment=Math.max(1.6,span/192);
  for(const band of ['ground','low','high']){
    const points=[], height=groundRules().heights[band]+.12;
    const add=(x,z,xx,zz)=>{
      if(!groundPass(groundMapX(x),groundMapY(z),'air')||!groundPass(groundMapX(xx),groundMapY(zz),'air'))return;
      points.push(new THREE.Vector3(x,groundHeight(x,z)+height,z),new THREE.Vector3(xx,groundHeight(xx,zz)+height,zz));
    };
    for(let x=-dims.halfWidthWorld;x<=dims.halfWidthWorld;x+=gap)for(let z=-dims.halfHeightWorld;z<dims.halfHeightWorld;z+=segment)add(x,z,x,Math.min(dims.halfHeightWorld,z+segment));
    for(let z=-dims.halfHeightWorld;z<=dims.halfHeightWorld;z+=gap)for(let x=-dims.halfWidthWorld;x<dims.halfWidthWorld;x+=segment)add(x,z,Math.min(dims.halfWidthWorld,x+segment),z);
    const grid=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:band==='high'?0xe1d7ff:0xd5f8ff,transparent:true,opacity:.08,depthWrite:false}));
    groundGrids[band]=grid; groundVisuals.add(grid);
  }
  groundTransportInit();groundCaptureInit(); groundScriptReset(); groundSupplyInit(); groundSightInit(); groundUpdateSight(); groundHud(); groundDraw();
}
// 見本 ground-b.html の輪郭と3機のV字編隊。
function groundAircraft(group,color){
  const size=2.7, outline=[[0,-1],[-.18,-.16],[-1,.2],[-1,.36],[-.23,.26],[-.14,.66],[.14,.66],[.23,.26],[1,.36],[1,.2],[.18,-.16],[0,-1]];
  for(const [ox,oz] of [[0,0],[-size*1.5,size*1.5],[size*1.5,size*1.5]]){
    const shape=new THREE.Shape(); outline.forEach(([x,z],i)=>i?shape.lineTo(x*size,-z*size):shape.moveTo(x*size,-z*size));
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false}); mat.userData.baseOpacity=.38;
    const body=new THREE.Mesh(new THREE.ShapeBufferGeometry(shape),mat); body.rotation.x=-Math.PI/2; body.position.set(ox,0,oz); group.add(body);
    const points=outline.map(([x,z])=>new THREE.Vector3(ox+x*size,.01,oz+z*size));
    const lineMat=new THREE.LineBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false}); lineMat.userData.baseOpacity=.95;
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),lineMat));
  }
}
// 宇宙と同じ輪を、各頂点の地表高に沿わせる。航空部隊も地表に投影する。
function groundSelectionInit(f){
  const ring=f.groundSelection=new THREE.Mesh(new THREE.RingGeometry(1,1.12,64).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthWrite:false,side:THREE.DoubleSide}));
  ring.renderOrder=6;ring.userData.flat=ring.geometry.attributes.position.array.slice();ring.visible=false;groundVisuals.add(ring);return ring;
}
// target: 搭乗ボタンを押したあと、選んだ中隊が乗れる相手。緑の輪を明滅させ、名札の印も光らせる（仮の色）。
function groundSelectionDraw(f,picked,target=false){
  const glow=target&&!picked;f.el?.classList.toggle('board-target',glow);
  const ring=f.groundSelection||((picked||target)&&groundVisuals?groundSelectionInit(f):null);if(!ring)return;
  ring.visible=(picked||target)&&f.alive&&!f.embarked&&!groundAbsent(f);
  if(!ring.visible)return;
  ring.material.color.set(glow?0x7dffb0:0xffffff);ring.material.opacity=glow?.6+.35*Math.sin(performance.now()/1000*Math.PI*2):.95;
  const radius=Math.sqrt(f.ships.length)*1.35*(Number.isFinite(f.scale)?f.scale:.3)+2.5+(glow?.8:0),flat=ring.userData.flat,position=ring.geometry.attributes.position;
  ring.position.set(f.pos.x,0,f.pos.z);
  for(let i=0;i<position.count;i++){
    const x=flat[i*3]*radius,z=flat[i*3+2]*radius;
    position.setXYZ(i,x,groundSurfaceHeight(f.pos.x+x,f.pos.z+z)+.15,z);
  }
  position.needsUpdate=true;ring.geometry.computeBoundingSphere();
}
function groundDraw(){
  if(!groundVisuals) return;
  const picked=orderTargets(),now=gameSec;
  groundRangesDraw(picked);
  if(groundBridgeNoGo){groundBridgeNoGo.visible=groundBridgeNoGo.visible&&!over;groundBridgeNoGo.children.forEach(m=>m.material.opacity=.45+.15*Math.sin(performance.now()/1600*Math.PI*2));}
  const boardTargets=groundWorkAiming==='board'&&picked.length===1?groundBoardTargets(picked[0]):[];
  for(const f of fleets){
    groundSelectionDraw(f,picked.includes(f),boardTargets.includes(f));
    const model=f.groundModel; if(!model)continue; model.visible=f.alive&&!f.embarked&&!groundAbsent(f)&&(f.team===0||groundSeenBy(0,f));
    groundFormationDraw(f,now);
    const pose=model.userData.pose;
    if(pose){
      // Orders can wait at obstacles; actual displacement also covers pursuit and aircraft.
      if(pose.last.distanceToSquared(f.pos)>1e-10)pose.movedAt=now;
      pose.last.copy(f.pos);
      const moving=now-(f.bodies?f.groundMovedAt:pose.movedAt)<.4;
      pose.stand.forEach((body,i)=>body.visible=!moving&&(!f.bodies||f.bodies[i]?.alive));
      pose.move.forEach((moves,i)=>{
        const clock=pose.clocks[i],at=(clock.start+Math.floor(now/clock.stepSec+clock.phase))%moves.length;
        moves.forEach((body,j)=>body.visible=moving&&j===at&&(!f.bodies||f.bodies[i]?.alive));
      });
    }
    if(!pose&&model.userData.formation)model.userData.formation.bodies.forEach((body,i)=>body.visible=!f.bodies||!!f.bodies[i]?.alive);
    model.position.copy(f.pos); if(f.band==='ground')model.position.y+=.15; model.rotation.y=Math.atan2(f.heading.x,f.heading.z)+(!model.userData.groundShape&&['fighter','attack','supportAircraft'].includes(f.groundKind)?Math.PI:0);
    const dim=groundView!=='all'&&groundView!==f.band, k=dim?groundRules().dimOpacity:1;
    model.traverse(o=>{if(o.material)o.material.opacity=o.material.userData.baseOpacity*k;});
    f.el.style.opacity=String(k*(f.team===1&&!f.seen?.42:1)); // 表示を薄くしても選択と射撃の規則は変えない。
    for(const s of f.ships)s.pos.copy(f.pos);
  }
  for(const [band,grid] of Object.entries(groundGrids)) grid.material.opacity=groundView===band?.32:groundView==='all'?.08:.025;
  groundFogDraw(); groundCaptureDraw(); groundHud();
  groundStrikeDraw(); groundTransportDraw(); groundSupplyDraw(); groundScriptDraw();
  if(typeof groundPlanDraw==='function')groundPlanDraw();
  if(typeof groundAreaDraw==='function')groundAreaDraw();
}
function groundStep(dt){
  if(over) return;
  groundSupplyBefore(dt);
  // 案内をとばした後も、残った命令・追撃・射撃目標を毎回消す。
  for(const f of fleets)if(groundTrainingEnemy(f)){groundClearOrders(f);f.stance='evade';}
  groundStrikeStep(dt);
  groundTransportStep(dt);
  groundUpdateSight();
  if(op.npc&&!op.groundDrill)npcGroundStep();
  for(const f of fleets){
    if(!f.alive||f.embarked||groundAbsent(f)||groundScriptDescending(f)) continue;
    if(f.groundLastPos&&f.groundLastPos.distanceToSquared(f.pos)>1e-10)f.groundMovedAt=gameSec;
    if(f.groundLastPos)f.groundLastPos.copy(f.pos);
    if(f.groundKind==='mechanicalAssault'){
      groundMechanicalWear(f,dt); if(!f.alive)continue;
    }
    if(f.bandTo){
      f.bandLeft=Math.max(0,f.bandLeft-dt);
      if(f.bandLeft<1e-8){
        const arrived=f.bandTo!=='ground'||groundLandable(f);
        if(arrived) f.band=f.bandTo;
        f.bandTo=null; f.bandLeft=0; f.pos.y=groundUnitHeight(f);
        if(arrived&&f.order&&f.order.type==='move'){
          const left=pathLeft(f.order),dest=f.order.dest.clone();order(f,{type:'move',via:left.slice(0,-1),dest});
          if(!f.order) nextOrder(f);
        }
      }
    }
    if(f.groundKind==='was') f.speed= groundRuleSet().unitTypes.was.speed*(f.band==='high'?8/3:f.band==='low'?2:1);
    if(!groundFlyingAircraft(f)||groundTrainingEnemy(f)||groundStaticTarget(f))f.pos.y=groundUnitHeight(f);
    if(groundFlyingAircraft(f)){
      if(f.order?.type==='attack'&&(!f.order.target.alive||!groundSeenBy(f.team,f.order.target))){f.order=null;dropArrow(f.arrow);f.arrow=null;nextOrder(f);}
      groundAirMotion(f,dt);continue;
    }
    // 進撃（共有命令の実行）の途中で撃てる敵がいれば、自動交戦の隊は止まって撃ち合う。命令優先の隊は進む（ユーザー決定 2026-11-14）。fireTarget は前のステップの値
    const advanceHold=f.order?.groundAdvance&&f.stance==='engage'&&f.fireTarget?.alive&&groundAnyBodyCanFire(f,f.fireTarget);
    if(f.order&&f.order.type==='move'&&!advanceHold&&followPath(f,dt)){ groundFormationArrive(f);f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
    if(f.team===1&&!groundStaticTarget(f)&&!f.groundRout&&!f.groundRecover&&!f.groundAirState&&groundPermissionOnly(f)&&f.stance!=='evade'&&!f.order){
      const allowed=fleets.filter(t=>groundFireSolution(f,t)).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0];
      if(allowed)order(f,{type:'attack',target:allowed});
    }
    const target=f.order&&f.order.type==='attack'?f.order.target:null;
    if(target&&(!target.alive||!groundSeenBy(f.team,target))){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
    // 射程の8割より遠いか、射線・弾道が通らず撃てないあいだは近づく（ユーザー決定 2026-11-14「撃てるまで近づく」）
    else if(target&&groundEngagementRange(f,target)>0&&(groundDistanceTo(f,target)>groundEngagementRange(f,target)*.8||!groundFireMode(f,target)||!groundAnyBodyCanFire(f,target))){
      f.groundChaseT=(f.groundChaseT||0)-dt;
      if(f.groundChaseT<=0){ f.order.path=groundPath(f.pos,target.pos,groundMoveKind(f));f.groundChaseT=.5; }
      if(f.order.path&&(!op.npc||npcGroundHoldChase(f,target))) groundFollow(f,dt);
    }
  }
  for(const f of fleets)if(f.groundLastPos&&f.groundLastPos.distanceToSquared(f.pos)>1e-10){f.groundMovedAt=gameSec;f.groundLastPos.copy(f.pos);}
  for(const f of fleets)if(f.alive&&f.bodies)groundTrailMark(f);
  groundTransportSync();
  groundBombStep();
  // 両軍とも全隊の移動後の視界を共有し、同じ視線・射程で撃つ。
  groundUpdateSight();
  for(const f of fleets){
    if(!f.alive||f.embarked||groundAbsent(f)||groundScriptDescending(f)) continue;
    if(f.bodies)for(const b of f.bodies)b.shotT=Math.max(0,b.shotT-dt);
    if(f.groundAreaSalvo||f.groundVolley||f.groundBombRun){f.fireTarget=null;if(f.bodies)groundBodyIdleClock(f,'shotT');continue;}
    const target=f.order&&f.order.type==='attack'?f.order.target:null;
    // 毎回、現在の段から選び直す。予約・自動交戦・残った目標も同じ表を通す。
    f.fireTarget=target&&groundCanFire(f,target)?target:f.stance==='evade'||groundStaticTarget(f)?null:fleets.filter(t=>groundCanFire(f,t)).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0]||null;
    f.groundShotT=Math.max(0,(f.groundShotT||0)-dt);
    if(f.team===1&&(!op.npc||!npcGroundFires(f))&&!f.groundRout&&!f.groundRecover&&['artillery','guidedRocket','was','sea'].includes(f.groundKind)&&f.stance!=='evade') groundStrikeAI(f);
    if(f.bodies){if(f.fireTarget&&groundFireMode(f,f.fireTarget)==='direct'){groundBodyFire(f,f.fireTarget,0);continue;}groundBodyIdleClock(f,'shotT');}
    if(f.fireTarget&&f.groundShotT===0){
      if(groundFireMode(f,f.fireTarget)==='indirect'){if(!op.npc||!npcGroundFires(f))groundVolleyStart(f,{point:f.fireTarget.pos,target:f.fireTarget});continue;}
      shoot(f.pos,f.fireTarget.pos,TEAM_COL[f.team],.25);
      damage(f.fireTarget,f.dmg*(f.groundPlatoons||1)*groundFireFactor(f,f.fireTarget)*groundMatchup(f,f.fireTarget)*groundSupplyAttackFactor(f),f);
      groundSupplyShot(f);
      f.groundShotT=groundRules().fireEvery;
    }
  }
  groundAutoAAStep(dt);
  groundCaptureStep(dt);
  groundSupplyAfter(dt);
  if(op.groundDrill)groundDrillTick();
}

function groundMatchup(f,t){
  const c=groundRuleSet().combat;
  return f.groundKind==='mobileAA'&&['low','high'].includes(t.band)?c.mobileAAAir:
    f.groundKind==='vehicle'&&['infantry','commando'].includes(t.groundKind)?c.tankInfantry:
    f.groundKind==='heavyInfantry'&&t.groundKind==='vehicle'?c.heavyTank:1;
}
function groundDamageFactor(t){
  const descent=groundScriptDescending(t)?1.5:1;
  if(t.groundUnloading)return groundLandingRules().damageFactor*descent;
  if(t.band!=='ground'||!['infantry','heavyInfantry','commando'].includes(t.groundKind))return descent;
  const c=groundRuleSet().combat,m=c.urbanMargin;
  const cover=groundInForest(t.pos.x,t.pos.z)||groundTownZones().some(zone=>groundInsideTown(t.pos,zone))||groundBuildings.some(b=>b.settlement==null&&t.pos.x>=b.minX-m&&t.pos.x<=b.maxX+m&&t.pos.z>=b.minZ-m&&t.pos.z<=b.maxZ+m);
  return descent*(cover?1-(1-c.infantryCover)*(t.groundKind==='commando'?c.commandoCoverBonus:1):1);
}
function groundMechanicalWear(f,dt){
  groundBodiesSpread(f,(f.groundMaxHp||f.n*f.hp)*groundRuleSet().combat.mechanicalWearPerSec*dt);
  const want=Math.max(0,Math.ceil(f.hpPool/f.hp));
  while(f.ships.length>want)f.ships.pop();
  if(!want){
    // 人間の小隊長の損害とは分け、機械部の稼働終了として扱う。
    groundTransportDestroyed(f,f);groundClearOrders(f);f.alive=false;f.el.remove();unselect(f);
    logEvent(`${f.name} 稼働終了`,'機械部の消耗により、この中隊は行動を終了しました。');
  }
}
// 進捗は軍ごとに保持。所有者が変わった時だけ両軍のゲージを消す。
let groundSites=[], groundTerritory=null;
function groundCanCapture(f){ return !groundAbsent(f)&&!groundScriptDescending(f)&&f.alive&&f.hpPool>0&&f.band==='ground'&&['infantry','was'].includes(f.groundKind)&&!f.embarked&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0); }
function groundCaptureCounts(f){ return !groundAbsent(f)&&!groundScriptDescending(f)&&f.alive&&f.hpPool>0&&f.band==='ground'&&groundBands(f).includes('ground')&&f.groundKind!=='sea'&&!f.embarked&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0); }
function groundCapturePresent(s,team){
  let count=0;
  for(const f of fleets){
    if(f.team!==team||groundDistanceTo(f,s)>s.captureRadius)continue;
    if(groundCanCapture(f))return true;
    if(groundCaptureCounts(f)&&++count>=groundRuleSet().capture.group)return true;
  }
  return false;
}
function groundCaptureSeconds(s,owner=s.owner){return owner===null?groundRuleSet().capture.neutralSeconds:s.captureSec;}
// 途中の占領は残り続けない（ユーザー決定 2026-11-15）: 持ち主が踏むとすぐ戻り、いない軍の進みは、離れて decayDelay 秒たつと
// 占領と同じ速さで減る（道路の端をかすめて一瞬出入りしただけでは減らさない）。視界の外で「中断」と見たままの進みも、
// 同じ速さで減ったものとして見せる。拠点と道路で共通。true なら占領は進まない。
function groundCaptureDecay(s,team,dt){
  const r=groundRuleSet().capture;
  if(!s.progress)s.progress=[0,0];if(!s.away)s.away=[0,0];
  if(team!==null&&team===s.owner)s.progress=[0,0];
  for(const t of [0,1]){
    if(t===team){s.away[t]=0;continue;}
    s.away[t]+=dt;const lose=Math.min(dt,s.away[t]-r.decayDelay)*r.decayPerSec;
    if(lose>0)s.progress[t]=Math.max(0,s.progress[t]-lose);
  }
  if(s.observed===false&&s.knownProgress&&!s.knownContested&&s.knownCapturingTeam==null)s.knownProgress=s.knownProgress.map(p=>Math.max(0,p-dt*r.decayPerSec));
  return team===null||team===s.owner;
}
function groundCaptureStep(dt){
  if(over) return;
  for(const s of groundSites){
    const present=[groundCapturePresent(s,0),groundCapturePresent(s,1)];
    s.contested=present[0]&&present[1];s.capturingTeam=s.contested?null:present[0]?0:present[1]?1:null;
    if(s.contested) continue;
    const team=present[0]?0:present[1]?1:null;
    if(groundCaptureDecay(s,team,dt)) continue;
    const seconds=groundCaptureSeconds(s);
    s.progress[team]=Math.min(seconds,s.progress[team]+dt);
    if(s.progress[team]>=seconds-1e-8){ s.owner=team; s.progress=[0,0]; }
  }
  groundScriptStep(dt);
}
function groundCaptureInit(){
  for(const s of groundSites){s.el?.remove();if(s.ring){groundVisuals.remove(s.ring);s.ring.geometry.dispose();s.ring.material.dispose();}}
  if(groundTerritory?.mesh){groundBoard.remove(groundTerritory.mesh);groundTerritory.mesh.geometry.dispose();groundTerritory.texture.dispose();groundTerritory.mesh.material.dispose();}
  const d=WOS_TERRAIN[op.ground], rules=groundRuleSet().capture;
  groundSites=(op.groundSites||[]).map(spec=>{
    const site=d.sites.find(s=>s.id===spec.site), el=document.createElement('div');
    el.className='ground-site'; el.dataset.site=site.id;
    el.innerHTML='<b></b><small></small><span class="capture-track"><i></i><i></i></span>';
    el.querySelector('b').textContent=site.name; labelsEl.appendChild(el);
    return {...site,owner:spec.owner,contested:false,pos:groundPoint(site.x,site.y),captureRadius:(spec.radiusKm??rules.radiusKm)*GROUND_SCALE,captureSec:spec.captureSec??rules.seconds,progress:[0,0],el};
  });
  // 占拠できる小円。影響範囲の大きな円とは別。
  for(const s of groundSites){
    const points=[];
    for(let i=0;i<96;i++){const a=i/96*Math.PI*2,x=s.pos.x+Math.cos(a)*s.captureRadius,z=s.pos.z+Math.sin(a)*s.captureRadius;points.push(new THREE.Vector3(x,groundSurfaceHeight(x,z)+.18,z));}
    const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xcad1c5,transparent:true,opacity:.9,depthWrite:false}));
    ring.renderOrder=5;groundVisuals.add(ring); s.ring=ring;
  }
  const canvas=document.createElement('canvas'),pixelScale=Math.min(10,480/Math.max(d.meta.widthKm,d.meta.heightKm));canvas.width=Math.round(d.meta.widthKm*pixelScale);canvas.height=Math.round(d.meta.heightKm*pixelScale);
  const texture=new THREE.CanvasTexture(canvas), geometry=new THREE.PlaneBufferGeometry(d.meta.widthKm,d.meta.heightKm,groundMeshGrid().segmentsX,groundMeshGrid().segmentsZ);
  geometry.rotateX(-Math.PI/2); const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,groundElevation(p.getX(i)+d.meta.widthKm/2,d.meta.heightKm/2-p.getZ(i))/GROUND_SCALE+.025);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  mesh.renderOrder=4; groundBoard.add(mesh);
  groundTerritory={canvas,texture,mesh,key:null,sections:groundRoadSections(d.objects.roads,groundSites)};
}
// 道路を通過する拠点で区切り、区間の中点までをそれぞれの拠点に結ぶ（見本案C）。
function groundRoadSections(roads,sites){
  const sections=[];
  for(const road of roads){
    const points=road.points, lengths=[0];
    for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    const total=lengths[lengths.length-1], stops=[];
    for(const site of sites){
      let best=Infinity, along=0;
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],len=lengths[i]-lengths[i-1],t=Math.max(0,Math.min(1,((site.x-a[0])*dx+(site.y-a[1])*dy)/(len*len))),dist=Math.hypot(site.x-a[0]-dx*t,site.y-a[1]-dy*t);
        if(dist<best){best=dist;along=lengths[i-1]+len*t;}
      }
      if(best<.8)stops.push({along,site});
    }
    stops.sort((a,b)=>a.along-b.along); if(!stops.length)continue;
    if(stops[0].along>.05)stops.unshift({along:0,site:null});
    if(total-stops[stops.length-1].along>.05)stops.push({along:total,site:null});
    const at=t=>{for(let i=1;i<points.length;i++)if(t<=lengths[i]){const k=(t-lengths[i-1])/(lengths[i]-lengths[i-1]);return [points[i-1][0]+(points[i][0]-points[i-1][0])*k,points[i-1][1]+(points[i][1]-points[i-1][1])*k];}return points[points.length-1];};
    const add=(from,to,site)=>{if(site&&to-from>.001)sections.push({site,path:[at(from),...points.filter((p,i)=>lengths[i]>from&&lengths[i]<to),at(to)]});};
    for(let i=1;i<stops.length;i++){const a=stops[i-1],b=stops[i],mid=(a.along+b.along)/2;add(a.along,mid,a.site);add(mid,b.along,b.site);}
  }
  return sections;
}
// Geometry only: retain live site/edge references, never cache ownership or visibility.
let groundInfluenceCache=null, groundTerritoryPixels=null;
function groundInfluenceAt(x,y,cache=null){
  if(!cache){
    const d=WOS_TERRAIN[op.ground],grid=d.terrain,active=groundSupplyActive(),net=groundSupplyNet,
      sections=groundTerritory?.sections,sources=active&&net?net.edges:sections||[],c=groundInfluenceCache;
    if(!c||c.terrain!==d||c.grid!==grid||c.cells!==grid.cells||c.cols!==grid.cols||c.rows!==grid.rows||c.cellKm!==d.meta.cellKm||
      c.board!==d.display.board||c.sea!==d.water.sea||c.sites!==groundSites||c.net!==net||c.active!==active||
      c.sections!==sections||c.sources!==sources||c.roadWidth!==groundRuleSet().capture.roadWidthKm||
      c.siteGeometry.length!==groundSites.length||c.siteGeometry.some((v,i)=>v.ref!==groundSites[i]||v.x!==v.ref.x||v.y!==v.ref.y||v.r!==v.ref.radiusKm)||
      c.sourceRefs.length!==sources.length||c.sourceRefs.some((v,i)=>v.ref!==sources[i]||v.path!==v.ref.path)){
      const floor=Math.floor,min=Math.min,max=Math.max,siteBins=new Map(),roadBins=new Map(),
        roadLimit=groundRuleSet().capture.roadWidthKm/2+(active&&net?1e-8:0);
      // One-km bins contain candidates in original order, including equal-distance ties.
      const add=(bins,ref,x0,y0,x1,y1)=>{
        for(let bx=floor(x0);bx<=floor(x1);bx++)for(let by=floor(y0);by<=floor(y1);by++){
          const key=bx+','+by;let list=bins.get(key);if(!list)bins.set(key,list=[]);
          if(list[list.length-1]!==ref)list.push(ref);
        }
      };
      for(const site of groundSites){const r=site.radiusKm+1e-8;add(siteBins,site,site.x-r,site.y-r,site.x+r,site.y+r);}
      for(const source of sources)for(let i=1;i<source.path.length;i++){
        const a=source.path[i-1],b=source.path[i],r=roadLimit+1e-8;
        add(roadBins,source,min(a[0],b[0])-r,min(a[1],b[1])-r,max(a[0],b[0])+r,max(a[1],b[1])+r);
      }
      groundInfluenceCache={terrain:d,grid,cells:grid.cells,cols:grid.cols,rows:grid.rows,cellKm:d.meta.cellKm,
        board:d.display.board,sea:d.water.sea,sites:groundSites,net,active,sections,sources,roadWidth:groundRuleSet().capture.roadWidthKm,
        siteGeometry:groundSites.map(ref=>({ref,x:ref.x,y:ref.y,r:ref.radiusKm})),sourceRefs:sources.map(ref=>({ref,path:ref.path})),
        siteBins,roadBins,roadLimit,supply:!!(active&&net)};
    }
    cache=groundInfluenceCache;
  }
  if(x===null&&y===null)return cache; // Paint validates geometry without a spatial query.
  const key=Math.floor(x)+','+Math.floor(y);let site=null,weight=Infinity;
  for(const s of cache.siteBins.get(key)||[]){const ratio=Math.hypot(x-s.x,y-s.y)/s.radiusKm;if(ratio<=1&&ratio<weight){site=s;weight=ratio;}}
  if(site)return site;
  let distance=cache.roadLimit;
  for(const source of cache.roadBins.get(key)||[]){const dist=groundDistance(x,y,source.path);if(dist<distance){site=cache.supply?source:source.site;distance=dist;}}
  return site;
}
function groundPaintTerritory(){
  const t=groundTerritory;if(!t)return;
  // Validate once per paint, not once per pixel. Bridge state does not change spatial membership.
  const spatial=groundInfluenceAt(null,null),key=groundSites.map(s=>`${s.knownOwner}:${s.knownContested}`).join('|')+'/'+(groundSupplyActive()?groundSupplyNet?.edges.map(e=>`${e.knownOwner}:${e.knownContested}`).join('|'):'');
  const width=t.canvas.width,height=t.canvas.height,d=WOS_TERRAIN[op.ground];
  let pixels=groundTerritoryPixels;
  const rebuild=!pixels||pixels.spatial!==spatial||pixels.territory!==t;
  if(!rebuild&&t.key===key)return;
  if(rebuild){
    const mask=new Uint8Array(width*height),members=new Array(width*height);
    for(let py=0;py<height;py++)for(let px=0;px<width;px++){
      const x=(px+.5)/(width/d.meta.widthKm),y=d.meta.heightKm-(py+.5)/(height/d.meta.heightKm),i=py*width+px;
      if(!groundInside(x,y,spatial.board))continue;
      if(groundInside(x,y,spatial.sea)){mask[i]=1;continue;}
      mask[i]=2;members[i]=groundInfluenceAt(x,y,spatial);
    }
    pixels=groundTerritoryPixels={spatial,territory:t,mask,members};
  }
  const ctx=t.canvas.getContext('2d'),img=ctx.createImageData(width,height),raw=img.data,colors=[[75,160,225],[230,85,72],[160,168,165]];
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const i=py*width+px,s=pixels.members[i];if(pixels.mask[i]!==2||!s)continue;
    const known=s.circle||s,stripe=known.knownContested&&(px+py)%12<3,color=stripe?[238,225,183]:colors[known.knownOwner??2],k=i*4;
    raw[k]=color[0];raw[k+1]=color[1];raw[k+2]=color[2];raw[k+3]=stripe?190:102;
  }
  ctx.putImageData(img,0,0);t.texture.needsUpdate=true;t.key=key;
}
function groundCaptureDraw(){
  groundRememberTerritory();groundPaintTerritory();groundRoadLabelsDraw();
  for(const s of groundSites){
    const color=s.knownOwner===0?'#8bdfff':s.knownOwner===1?'#ff998b':'#cad1c5',p=proj(s.pos.clone().add(new THREE.Vector3(0,1,0)));
    s.ring.material.color.set(color); s.el.style.color=color;
    /* 札は占拠の円の画面でいちばん上の点より上に置き、円の中の部隊を隠さない（ユーザー 2026-11-14「拠点のラベルが大きく、場所が低い」） */
    const ringPos=s.ring.geometry.attributes.position;let top=p.y;
    for(let i=0;i<ringPos.count;i+=6){const q=proj(new THREE.Vector3(ringPos.getX(i),ringPos.getY(i),ringPos.getZ(i)));if(q.z<=1)top=Math.min(top,q.y);}
    s.el.style.visibility=p.z>1?'hidden':'visible'; s.el.style.transform=`translate(${p.x}px,${top-6}px) translate(-50%,-100%)`;
    const owner=s.knownOwner===0?'地球連合':s.knownOwner===1?'惑星共和国':'中立',progress=(s.knownProgress||[0,0]).map(n=>Math.floor(n/groundCaptureSeconds(s,s.knownOwner)*100));
    // 青と赤の進み具合は札のゲージで見せ、文字には出さない（札を小さくするため）。
    s.el.querySelector('small').textContent=`${s.knownOwner!==null&&s.knownOwner!==undefined&&Object.values(op.groundHQ||{}).includes(s.id)?'本営 / ':''}${owner} / ${groundCaptureReadout(s,groundCaptureSeconds(s,s.knownOwner))}${groundSupplyActive()&&s.owner===0&&s.knownOwner===0?' / '+(groundSupplyAt({pos:s.pos,team:0}).rate===1?'接続':groundSupplyAt({pos:s.pos,team:0}).rate===.5?'半速':'切断'):''}`;
    s.el.querySelectorAll('i').forEach((bar,i)=>bar.style.width=`${progress[i]}%`);
  }
}

// 確定デザインはデータのSVGをそのまま使用する。既存の固有ボタンのID・イベント・titleは維持。
document.querySelectorAll('[data-command-icon]').forEach(button=>{
  const icon=WOS_COMMAND_ICONS[button.dataset.commandIcon];
  button.setAttribute('aria-label',button.textContent.trim());
  button.innerHTML=icon.svg;
});
function groundCommandBarHud(list){
  if(typeof groundPlanHud==='function')groundPlanHud(list);
  const canMove=list.some(f=>!f.locked&&!f.embarked&&groundCommandAllowed(f,'move'));
  document.getElementById('groundMove').disabled=!canMove||over;
  document.getElementById('groundMove').setAttribute('aria-pressed',String(groundWorkAiming==='move'));
  document.getElementById('groundHold').disabled=!canMove||over;
  const kinds=list.map(f=>f.groundKind), carries=list.some(f=>f.embarked||f.groundPassenger||groundLandingShip(f));
  // 搭乗は、今乗れる相手がいる中隊だけ（戦車は岸の揚陸艦がいるときだけ。groundBoardTargets）。
  const visible={board:list.some(f=>groundBoardTargets(f).length>0),unload:carries||kinds.includes('apc'),land:list.some(f=>groundLandingShip(f.embarked||f)),strike:kinds.some(k=>['artillery','guidedRocket','was','vehicle','sea','supportAircraft'].includes(k)),bridge:kinds.includes('engineer'),supply:kinds.includes('supply')};
  groundBridgeNoGoHud(list);
  const buttons=[...document.querySelectorAll('#groundUniqueCommands button')];
  buttons.forEach(b=>b.hidden=!visible[b.dataset.commandIcon]);
  const expand=document.getElementById('groundCommandExpand');
  document.getElementById('groundStrikeControl').hidden=!visible.strike;
  expand.hidden=buttons.filter(b=>!b.hidden).length*51+(visible.strike?36:0)<=204;
  if(expand.hidden){expand.setAttribute('aria-expanded','false');document.getElementById('groundUniqueCommands').classList.remove('expanded');}
}
document.getElementById('groundMove').addEventListener('click',()=>{
  const aiming=groundWorkAiming!=='move';
  groundClearAiming();groundWorkAiming=aiming?'move':null;groundHud();
});
document.getElementById('groundHold').addEventListener('click',()=>{
  const list=orderTargets().filter(f=>!f.locked&&!f.embarked&&groundCommandAllowed(f,'move'));
  if(!list.length||over)return;
  npcAutoPlayer(list);saveUndo(list);
  for(const f of list){groundCancelWork(f);groundClearOrders(f);f.groundDeployed=true;f.fireTarget=null;f.post.copy(f.pos);f.stance='engage';}
  groundClearAiming();groundHud();updateRoster();
});
document.getElementById('groundCommandExpand').addEventListener('click',e=>{
  const button=e.currentTarget,expanded=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(expanded));
  document.getElementById('groundUniqueCommands').classList.toggle('expanded',expanded);
});

// 射程は地表へ投影した破線。着弾範囲の塗り円とは別に表示する。
let groundRanges=new Map();
function groundRangesClear(){
  for(const v of groundRanges.values()){for(const line of v.lines){line.parent?.remove(line);line.geometry.dispose();line.material.dispose();}v.el.remove();}
  groundRanges.clear();
}
function groundRangeInfo(f){
  if(!f?.alive||f.embarked||groundAbsent(f))return null;
  const r=groundFireRanges(f),entries=[],bands=['ground','low','high','sea'].filter(band=>groundFireFactor(f,{band})>0);
  if(r.direct>0)entries.push({id:'direct',text:f.groundKind==='sea'?'直接射撃（地平線）':'直接射撃',range:r.direct,bands:bands.filter(b=>!['low','high'].includes(b))});
  if(r.indirect&&groundStrikeWeapon(f))entries.push({id:'indirect',text:'間接砲撃',range:r.indirect.max,min:r.indirect.min,bands:[]});
  if(f.groundKind!=='supportAircraft'&&r.ground>0&&(bands.includes('ground')||bands.includes('sea')||groundStrikeWeapon(f)))entries.push({id:'ground',text:'対地・対艦',range:r.ground,bands:bands.filter(b=>['ground','sea'].includes(b))});
  if(r.air>0)entries.push({id:'air',text:groundAutoAASource(f)?'自動対空':'対空',range:r.air,bands:bands.filter(b=>['low','high'].includes(b))});
  if(r.aa>0)entries.push({id:'aa',text:'自動対空',range:r.aa,bands:bands.filter(b=>['low','high'].includes(b))});
  return entries.length?{...entries.find(e=>e.id==='indirect')||entries[0],entries}:null;
}
// 選択隊だけの可射マスク。32方向×12距離の境界を描き、内側の遮蔽も残す。
// 点ごとの厳密な発射判定は共有の射線・弾道判定。マスクは表示用の離散近似。
function* groundRangeMaskSteps(f,e){
  const angles=32,steps=12,R=e.range,dr=R/steps,da=2*Math.PI/angles,mask=[];
  const point=(a,r)=>{const x=f.pos.x+Math.cos(a)*r,z=f.pos.z+Math.sin(a)*r;return new THREE.Vector3(x,groundSurfaceHeight(x,z)+.28,z);};
  const clear=(a,r)=>{
    if(e.min&&r<e.min)return false;
    const p=point(a,r);
    if(e.id==='indirect')return groundStrikeInRange(f,p);
    if(f.groundKind==='sea'&&groundNavalClass(f)){
      const sea=groundInside(groundMapX(p.x),groundMapY(p.z),WOS_TERRAIN[op.ground].water.sea),target={pos:p,band:sea?'sea':'ground',groundKind:sea?'sea':'infantry',type:'ff'};
      if(r>(groundNavalHorizonKm(f,target)??0)*GROUND_SCALE)return false;
    }
    return groundClearLine(groundEye(f),{x:p.x,z:p.z,y:groundSightHeight(p.x,p.z)+groundSightRules().eyeHeight});
  };
  for(let j=0;j<steps;j++){mask[j]=[];for(let i=0;i<angles;i++){mask[j][i]=clear((i+.5)*da,(j+.5)*dr);yield;}}
  const points=[];
  for(let j=0;j<steps;j++)for(let i=0;i<angles;i++)if(mask[j][i]){
    const a=i*da,b=(i+1)*da,inner=j*dr,outer=(j+1)*dr;
    if(j===steps-1||!mask[j+1][i])points.push(point(a,outer),point(b,outer));
    if(j>0&&!mask[j-1][i])points.push(point(a,inner),point(b,inner));
    if(!mask[j][(i+angles-1)%angles])points.push(point(a,inner),point(a,outer));
    if(!mask[j][(i+1)%angles])points.push(point(b,inner),point(b,outer));
  }
  return points;
}
// 同期APIは対象確認用にも保持。描画では同じ計算をフレームへ分散する。
function groundRangeMask(f,e){const task=groundRangeMaskSteps(f,e);let result;do{result=task.next();}while(!result.done);return result.value;}
const GROUND_RANGE_FRAME_BUDGET_MS=3.5; // 仮。単一の弾道計算は途中で中断しない協調予算。
let groundRangeBudgetStats={lastMs:0,maxMs:0,pending:0};
function groundRangeSetPoints(line,points){line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(points);line.computeLineDistances();}
function groundRangesDraw(list){
  if(!groundVisuals)return;
  const started=performance.now(),live=new Set();let pending=0;
  for(const f of list){
    const info=groundRangeInfo(f);if(!info)continue;live.add(f);
    let v=groundRanges.get(f);
    if(!v){const el=document.createElement('div');el.className='ground-range-label';labelsEl.appendChild(el);v={lines:[],el,jobs:null};groundRanges.set(f,v);}
    const rings=info.entries.flatMap(e=>[e,...(e.min>0?[{...e,id:e.id+'Min',range:e.min}]:[])]);
    const key=[f.pos.x,f.pos.z,f.band,...rings.map(e=>e.id+':'+e.range)].join('/'),changed=v.band!==f.band||v.buildings!==groundBuildings;
    if(changed)v.jobs=null;
    if((v.key!==key||changed)&&!v.jobs&&(!v.updatedAt||performance.now()-v.updatedAt>750||changed)){
      for(const line of v.lines){line.parent?.remove(line);line.geometry.dispose();line.material.dispose();}
      // 全サンプルが同じ射手位置・段を使う。移動中の値を途中で混ぜない。
      const snapshot={...f,pos:f.pos.clone(),heading:f.heading?.clone()};v.jobs=[];
      v.lines=rings.map(e=>{
        const masked=['direct','indirect'].includes(e.id),points=[];
        if(!masked)for(let i=0;i<=128;i++){const a=i/128*Math.PI*2,x=snapshot.pos.x+Math.cos(a)*e.range,z=snapshot.pos.z+Math.sin(a)*e.range;points.push(new THREE.Vector3(x,groundSurfaceHeight(x,z)+.28,z));}
        const line=new (masked?THREE.LineSegments:THREE.Line)(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0xe2c58a,transparent:true,opacity:.7,depthWrite:false,dashSize:e.id==='aa'?.3:.7,gapSize:.45}));line.renderOrder=5;line.computeLineDistances();groundVisuals.add(line);
        if(masked)v.jobs.push({line,task:groundRangeMaskSteps(snapshot,e)});return line;
      });v.line=v.lines[0];v.key=key;v.updatedAt=performance.now();v.band=f.band;v.buildings=groundBuildings;
    }
    while(v.jobs?.length&&performance.now()-started<GROUND_RANGE_FRAME_BUDGET_MS){
      const job=v.jobs[0],result=job.task.next();
      if(result.done){groundRangeSetPoints(job.line,result.value);v.jobs.shift();}
    }
    if(v.jobs&&!v.jobs.length)v.jobs=null;if(v.jobs)pending++;
    const p=proj(new THREE.Vector3(f.pos.x,groundSurfaceHeight(f.pos.x,f.pos.z)+1.5,f.pos.z));
    v.el.hidden=p.z>1||p.x<0||p.y<0||p.x>innerWidth||p.y>innerHeight;
    v.el.style.transform=`translate(${p.x}px,${p.y+30}px)`;
    v.el.textContent=info.entries.map(e=>e.text+' '+(e.min>0?(e.min/GROUND_SCALE).toFixed(1)+'〜':'')+(e.range/GROUND_SCALE).toFixed(1)+'km').join(' / ')+(v.jobs?' / 射程計算中':'');
  }
  for(const [f,v] of groundRanges)if(!live.has(f)){v.jobs=null;for(const line of v.lines){line.parent?.remove(line);line.geometry.dispose();line.material.dispose();}v.el.remove();groundRanges.delete(f);}
  const elapsed=performance.now()-started;groundRangeBudgetStats={lastMs:elapsed,maxMs:Math.max(groundRangeBudgetStats.maxMs,elapsed),pending};
}
// 進捗は観測済み情報だけを使う。視界外の最新の所有者・進捗を漏らさない。
function groundCaptureReadout(s,seconds){
  const prefix=s.observed===false?'最終確認：':'';
  if(s.knownContested)return prefix+'競合中・占領停止';
  const p=s.knownProgress||[0,0],teams=[0,1].filter(team=>p[team]>0&&s.knownOwner!==team);
  const team=teams.includes(s.knownCapturingTeam)?s.knownCapturingTeam:teams.sort((a,b)=>p[b]-p[a])[0]??null;
  if(team===null)return prefix+(s.knownOwner==null?'未占領':'占領済み');
  const remaining=Math.max(0,Math.ceil(seconds-p[team]));
  // 視界の外では残り秒を出さない（最後に見たときの秒数は今の値ではないため。ユーザー 2026-11-16）
  return prefix+(s.knownCapturingTeam===team?'占領中':'中断')+' '+(team===0?'青':'赤')+(s.observed===false?'':' あと'+remaining+'秒');
}

// 工兵選択時の架橋不可帯。地形ごとに初回選択で生成し、groundSetup から破棄する。
let groundBridgeNoGo=null;
function groundBridgeNoGoClear(){
  if(!groundBridgeNoGo)return;
  groundBridgeNoGo.parent?.remove(groundBridgeNoGo);
  for(const mesh of groundBridgeNoGo.children){mesh.geometry.dispose();mesh.material.dispose();}
  groundBridgeNoGo=null;
}
function groundBridgeNoGoHud(list){
  const show=!over&&list.some(f=>fleets.includes(f)&&f.alive&&f.team===0&&f.groundKind==='engineer');
  if(show&&!groundBridgeNoGo&&groundVisuals){
    groundBridgeNoGo=new THREE.Group();groundVisuals.add(groundBridgeNoGo);
    for(const section of groundBridgeNoGoSections()){
      if(section.points.length<2)continue;
      const vertices=[],indices=[];
      for(const p of section.points)for(const side of [-1,1]){
        const half=(p.width+.1)/2,x=p.x-side*p.ty*half,y=p.y+side*p.tx*half;
        vertices.push(groundWorldX(x),groundElevation(x,y)+.03*GROUND_SCALE,groundWorldZ(y));
      }
      for(let i=1;i<section.points.length;i++){const a=(i-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);
      const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xff3b30,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide}));
      mesh.renderOrder=4;mesh.userData.river=section.river;groundBridgeNoGo.add(mesh);
    }
  }
  if(groundBridgeNoGo)groundBridgeNoGo.visible=show;
}
