/* 地上作戦だけの高度・射撃・表示。宇宙の移動と射撃は sim.js の既存処理を使う。 */
const GROUND_BAND_NAMES={ground:'地上',cruise:'超低空巡航',low:'低',high:'高',sea:'海面'};
let groundView='all', groundVisuals=null, groundGrids={};
let groundOrg=null, groundRosterNodes=[];
// org: 出撃の編成。null なら全隊が独立中隊。'quick' はクイック出撃で、兵科で旅団・大隊にまとめる（WOS_GROUND_ORG.quickOrg）。
function groundInitOrg(org){
  const quick=org==='quick';if(quick)org=null;
  groundOrg=org?JSON.parse(JSON.stringify(org)):{companies:fleets.filter(f=>f.team===0&&f.groundKind!=='sea').map(f=>({id:'unit'+f.id,name:f.name,kind:f.groundKind})),battalions:[],brigades:[]};
  if(org)fleets.filter(f=>f.team===0&&f.groundFixed).forEach(f=>groundOrg.companies.push({id:'unit'+f.id,name:f.name,kind:f.groundKind}));
  // 固定配備の地上隊は、保存の編成で出るときと同じく独立中隊のまま。
  if(quick){const fixed=new Set(fleets.filter(f=>f.team===0&&f.groundFixed).map(f=>'unit'+f.id));
    Object.assign(groundOrg,window.WOS_GROUND_ORG.quickOrg(groundOrg.companies.filter(c=>!fixed.has(c.id))));}
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
function groundSelectUnit(level,id,toggle=false){
  const list=groundMembers(level,id);
  if(!list.length)return;
  const targets=orderTargets();
  setSel(toggle&&list.length===targets.length&&list.every(f=>targets.includes(f))?[]:list);
}
function groundCanReorganize(f){
  return f.alive&&!f.groundExited&&f.groundKind!=='sea'&&!groundPermissionOnly(f)&&groundOrg.companies.some(c=>c.id===f.companyId);
}
function groundOrgSelection(targets){
  const companies=[...new Set(targets.filter(groundCanReorganize).map(f=>f.companyId))];
  const battalions=groundOrg.battalions.filter(b=>b.companies.some(id=>companies.includes(id))).map(b=>b.id);
  return {companies,battalions};
}
function groundRefreshOrg(){
  const empty=new Set(groundOrg.battalions.filter(b=>!b.companies.length).map(b=>b.id));
  groundOrg.battalions=groundOrg.battalions.filter(b=>!empty.has(b.id));
  for(const brigade of groundOrg.brigades)brigade.battalions=brigade.battalions.filter(id=>!empty.has(id));
  groundOrg.brigades=groundOrg.brigades.filter(b=>b.battalions.length);
  groundPlanColorRevision++; // 同じ中隊が前線に残っていても、所属が変われば色を引き直す。
  buildRoster();updateRoster();
}
function groundNewFormation(level){
  if(over)return;
  const rules=window.WOS_GROUND_ORG, battalion=level==='battalions';
  const children=battalion?'companies':'battalions', label=battalion?'大隊':'旅団', childLabel=battalion?'中隊':'大隊';
  const max=battalion?rules.MAX_COMPANIES:rules.MAX_BATTALIONS, ids=groundOrgSelection(orderTargets())[children];
  if(!ids.length)return;
  if(ids.length>max){
    logEvent(`${label}は${max}個${childLabel}まで`,`選んでいる${ids.length}個のうち、${max}個までにしてください。`);
    return;
  }
  const items=groundOrg[level], usedNumbers=new Set(items.map(item=>unitNo(item.name)));
  let number=1;while(usedNumbers.has(number))number++;
  const prefix=battalion?'gb':'gr';
  const usedIds=new Set(Object.values(groundOrg).flatMap(list=>list.map(item=>item.id)));
  let serial=items.length+1;while(usedIds.has(prefix+serial))serial++;
  const item={id:prefix+serial,name:`第${number} ${label}`,[children]:[]};
  items.push(item);
  for(const id of ids)rules.assign(groundOrg,children,id,item.id);
  groundRefreshOrg();
  groundSelectUnit(level,item.id);
  logEvent(`${item.name} 編成`,`${ids.length}個の${childLabel}で${label}を作った。`);
}
function groundDisbandFormation(level,item){
  if(over)return;
  const battalion=level==='battalions';
  if(battalion)window.WOS_GROUND_ORG.assign(groundOrg,'battalions',item.id,null);
  groundOrg[level]=groundOrg[level].filter(x=>x!==item);
  groundRefreshOrg();
  logEvent(`${item.name} 解散`,battalion?'各中隊は独立中隊に戻った。':'各大隊は独立の大隊に戻った。');
}
function groundRosterDropZone(e,level){
  const el=document.elementFromPoint(e.clientX,e.clientY);
  if(!rosterEl.contains(el))return null;
  if(level==='companies')return el.closest('.ground-rnode[data-level="battalions"], .ground-rfree');
  return el.closest('.ground-rnode[data-level="brigades"]')||el.closest('.ground-rnode, .ground-rfree, .gnew')||rosterEl;
}
function groundRosterMove(level,source,zone){
  if(over)return;
  const company=level==='companies', id=company?source.companyId:source.id;
  if(company&&!groundCanReorganize(source))return;
  const parents=groundOrg[company?'battalions':'brigades'], parentId=zone.dataset.level===(company?'battalions':'brigades')?zone.dataset.id:null;
  const from=parents.find(p=>p[level].includes(id)), to=parents.find(p=>p.id===parentId);
  if(from===to)return;
  const rules=window.WOS_GROUND_ORG, parentLabel=company?'大隊':'旅団', childLabel=company?'中隊':'大隊';
  if(!rules.assign(groundOrg,level,id,parentId)){
    const max=company?rules.MAX_COMPANIES:rules.MAX_BATTALIONS;
    logEvent(`${parentLabel}は満員です`,`${parentLabel}に入れられる${childLabel}は${max}個までです。`);
    return;
  }
  groundRefreshOrg();
  logEvent(to?`${source.name} ${to.name}へ`:`${source.name} 独立行動へ`,
    to?`${source.name}が${to.name}の指揮下に入った。`:`${source.name}が${from.name}を離れ、独立${childLabel}になった。`);
}
function groundBuildRoster(mk){
  groundPlanClosePalette();
  groundRosterNodes=[];fleets.forEach(f=>{f.btn=null;f.stBtn=null;});
  const branch=(level,item,parent)=>{
    const node=document.createElement('div'); node.className='ground-rnode';node.dataset.level=level;node.dataset.id=item.id;
    const head=document.createElement('div');head.className='ground-rhead ghead';
    const fold=document.createElement('button');fold.className='ground-fold';fold.textContent=item.open===false?'＋':'−';fold.setAttribute('aria-expanded',String(item.open!==false));fold.setAttribute('aria-label',item.name+'を開閉');
    fold.onclick=()=>{item.open=item.open===false;buildRoster();updateRoster();};
    const pick=document.createElement('button');pick.className='grpBtn';pick.textContent=item.name;pick.setAttribute('aria-label',item.name+'を一括選択');pick.onclick=()=>groundSelectUnit(level,item.id,true);
    if(level==='battalions')dragSource(pick,item,level);
    const disband=document.createElement('button');disband.className='st rgDel';disband.textContent='解散';disband.setAttribute('aria-label',item.name+'を解散');
    disband.onclick=()=>groundDisbandFormation(level,item);
    const meters=document.createElement('small');meters.className='ground-summary';
    /* 旅団・大隊の全隊の自動交戦/命令優先（宇宙の戦区軍の「全自動／全命令」と同じ。ユーザーの指示 2026-11-21） */
    const stance=document.createElement('button');stance.className='st rgStance';stance.title=item.name+'の全隊の自動交戦/命令優先をまとめて切り替える';
    stance.onclick=()=>{const m=groundStanceMembers(level,item.id);if(m.length)applyStance(m,m.every(f=>f.stance==='evade')?'engage':'evade',item.name+' 全隊');};
    head.append(fold,pick,meters,disband,stance,groundPlanRosterSwatch(level,item));node.append(head);parent.append(node);groundRosterNodes.push({level,item,pick,meters,stance});
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
  const loose=document.createElement('div');loose.className='ground-rfree';
  const title=document.createElement('small');title.textContent='独立中隊';loose.append(title);
  if(free.length)companies(free.map(c=>c.id),loose);
  rosterEl.append(loose);
  const create=document.createElement('div');create.className='gnew';
  create.innerHTML='<button type="button">＋大隊</button><button type="button">＋旅団</button><span></span>';
  create.children[0].onclick=()=>groundNewFormation('battalions');
  create.children[1].onclick=()=>groundNewFormation('brigades');
  rosterEl.append(create);
}
function groundOpenSelected(list){
  if(list.some(f=>f.groundExited)){setSel(list.filter(f=>!f.groundExited));return;}
  let changed=false;
  const open=(items,level)=>items.forEach(item=>{if(item.open===false&&groundMembers(level,item.id).some(f=>list.includes(f))){item.open=true;changed=true;}});
  open(groundOrg.brigades,'brigades');open(groundOrg.battalions,'battalions');if(changed)buildRoster();
}
/* 方針を変えられる隊だけ（許可制の隊や、方針の命令を受け付けない隊は数えない） */
function groundStanceMembers(level,id){return groundMembers(level,id).filter(f=>!groundPermissionOnly(f)&&groundCommandAllowed(f,'stance'));}
function groundUpdateRoster(targets){
  for(const {level,item,pick,meters,stance} of groundRosterNodes){const m=groundMembers(level,item.id);groundSupplyUpdateMeters(meters,m);pick.disabled=!m.length;pick.setAttribute('aria-pressed',String(!!m.length&&m.length===targets.length&&m.every(f=>targets.includes(f))));
    const s=groundStanceMembers(level,item.id),ev=s.filter(f=>f.stance==='evade').length;
    stance.textContent='全'+(!s.length?'—':ev===s.length?'命令':ev?'混在':'自動');stance.dataset.st=s.length&&ev===s.length?'evade':ev?'mixed':'engage';stance.disabled=!s.length;}
  const [battalion,brigade,count]=rosterEl.querySelector('.gnew').children;
  const {companies,battalions}=groundOrgSelection(targets);
  battalion.disabled=over||!companies.length;
  brigade.disabled=over||!battalions.length;
  count.textContent=`${companies.length}隊を選択中`;
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
function groundUsesAirRange(f,t){return groundAirTarget(t)||(groundWasCruising(t)||t.groundKind==='drone')&&['fighter','attack'].includes(f.groundKind);}
function groundTargetRange(f,t){
  const r=groundFireRanges(f),airborne=['fighter','attack','supportAircraft'].includes(f.groundKind)||f.groundKind==='was'&&['low','high'].includes(f.band);
  const range=groundUsesAirRange(f,t)?(airborne?r.air:r.aa)||0:(airborne?r.ground:r.direct)||0;
  return f.groundKind==='sea'&&groundNavalClass(f)&&!groundAirTarget(t)?Math.min(range,(groundNavalHorizonKm(f,t)??0)*GROUND_SCALE):range;
}
function groundIndirectTarget(f,t){
  const band=t.band||'ground';
  return band==='ground'&&!groundWasFlying(t)||f.groundKind==='sea'&&band==='sea';
}
function groundManualTargetAllowed(f,t){
  if(!op.ground)return true;
  if(!f?.groundKind||!t||f.groundKind==='drone')return false;
  // 能力だけを調べる。groundFireMode／発射可否／距離／LOSへ戻らない。
  const r=groundFireRanges(f),band=f.band||'ground',target=t.band||'ground',positive=n=>Number.isFinite(n)&&n>0;
  if(groundUsesAirRange(f,t))return (groundWasLowDuel(f,t)||!groundAutoAASource(f))&&positive(r.air)&&groundFireFactor(f,t)>0;
  if(!['ground','sea'].includes(target)&&!groundWasCruising(t)&&t.groundKind!=='drone')return false;
  if(groundWasCruising(t)&&f.groundKind==='supportAircraft')return false;
  const rules=groundStrikeRules(),weapon=rules[f.groundKind]||(['guidedRocket','was'].includes(f.groundKind)?rules.artillery:null);
  if(f.groundKind==='supportAircraft')return band==='high'&&!!weapon;
  const airborne=['fighter','attack'].includes(f.groundKind)||f.groundKind==='was'&&['low','high'].includes(band);
  if(positive(airborne?r.ground:r.direct)&&groundFireFactor(f.groundKind==='fighter'?{...f,band:'low'}:f,t)>0)return true;
  const indirectSource=f.groundKind==='sea'?band==='sea':['artillery','guidedRocket','was','vehicle'].includes(f.groundKind)&&band==='ground';
  return !!(groundIndirectTarget(f,t)&&indirectSource&&weapon&&r.indirect&&positive(r.indirect.max)&&Number.isFinite(r.indirect.min)&&r.indirect.min>=0&&r.indirect.min<=r.indirect.max);
}
function groundFireMode(f,t){
  if(!groundManualTargetAllowed(f,t)||!groundAirSquad(f)&&!groundAirInFront(f,t))return null;
  const distance=groundDistanceTo(f,t),direct=groundTargetRange(f,t);
  if(groundFireFactor(f,t)>0&&groundShotInRange(f,t,direct))return 'direct';
  const r=groundFireRanges(f).indirect;
  return groundIndirectTarget(f,t)&&r&&distance>=r.min&&distance<=r.max&&groundStrikeWeapon(f)&&groundAutoIndirect(f)&&groundStrikeInRange(f,t.pos)?'indirect':null;
}
function groundEngagementRange(f,t){
  if(!groundManualTargetAllowed(f,t))return 0;
  const direct=groundTargetRange(f,t),indirect=groundFireRanges(f).indirect;
  return Math.max(groundFireFactor(f,t)>0?direct:0,groundIndirectTarget(f,t)&&groundStrikeWeapon(f)&&groundAutoIndirect(f)?indirect?.max||0:0);
}
// 直接射撃を主とする兵科（unitTypes の directFirst。W.A.S.）は、間接射撃を地点攻撃の命令のときだけ撃つ。自動交戦・攻撃の命令では撃たず、
// 攻撃の命令では直接射撃で撃てるところまで近づく（ユーザー決定 2026-11-19「wasは基本直接射撃、攻撃を基本とする」「wasが自動で間接砲撃するのは不要」）
function groundAutoIndirect(f){ return !groundRuleSet().unitTypes[f.groundKind]?.directFirst; }
function groundBands(f){ return f.groundKind==='sea'?['sea']:f.groundKind==='drone'?['low']:f.groundKind==='was'?['ground','cruise','low']:['fighter','attack','supportAircraft'].includes(f.groundKind)?['low','high']:['ground']; }
function groundBandOpacity(f){return groundView==='all'||groundView===(groundWasCruising(f)?'ground':f.band)?1:groundRules().dimOpacity;}
function groundMoveKind(f){ return f.groundKind==='sea'?'sea':(f.band||'ground')==='ground'&&!groundWasFlying(f)?(['heavyInfantry','commando','mechanicalAssault'].includes(f.groundKind)?'infantry':f.groundKind==='supply'||f.groundKind==='guidedRocket'&&groundDriveKind(f.groundBodySpec)==='wheel'?'wheel':['artillery','guidedRocket','mobileAA'].includes(f.groundKind)?'vehicle':f.groundKind):'air'; }
function groundPermissionOnly(f){ return !!groundRuleSet().unitTypes[f.groundKind]?.permissionOnly; }
function groundBandSeconds(f,band){
  return f.groundKind==='was'&&(f.band==='ground'||band==='ground')?groundRuleSet().wasFlight.transitionSec:groundRules().transitionSec;
}
function groundUnitHeight(f){
  if(f.groundKind==='sea')return 0; // 海面は固定。地表高や高度切り替えから独立。
  if(f.groundKind==='drone')return groundHeight(f.pos.x,f.pos.z)+groundRuleSet().combat.drone.heightKm*GROUND_SCALE;
  const from=groundBandHeight(f.band);
  return groundHeight(f.pos.x,f.pos.z)+(f.bandTo?from+(groundBandHeight(f.bandTo)-from)*(1-f.bandLeft/groundBandSeconds(f,f.bandTo)):from);
}
// 直接射撃の表（設計案3）。地点攻撃は ground-strike.js で別判定。
function groundFireFactor(f,t,aa=false){
  const band=f.band||'ground', target=(groundWasCruising(t)||t.groundKind==='drone')?(aa||groundUsesAirRange(f,t)?'low':'ground'):t.band||'ground', weak=groundRules().weakFire;
  const aircraft=band==='low'?{ground:1,low:1,high:1,sea:1}:{low:1,high:1};
  // 自走対空砲は 35 mm 連装機関砲1つで空も地上も撃つため、ここでは減衰を掛けない。
  const row={heavyInfantry:{ground:1,low:1,high:1},infantry:{ground:1,low:weak},commando:{ground:1,low:weak},guidedRocket:{ground:1},mechanicalAssault:{ground:1,low:weak,high:weak},mobileAA:{ground:1,low:1,high:1},scout:{ground:1},artillery:{ground:1},vehicle:{ground:1,low:weak,high:weak},apc:{ground:1,low:weak,high:weak},engineer:{ground:1},
    sea:{low:1,high:1,sea:1},fighter:aircraft,attack:aircraft,
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
function groundFireSolution(f,t){ return f.groundKind!=='drone'&&!groundScriptDescending(f)&&!groundTrainingEnemy(f)&&f.alive&&t.alive&&!groundAbsent(f)&&!groundAbsent(t)&&!f.groundAirState&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0)&&!f.embarked&&!t.embarked&&!f.groundBuilding&&f.team!==t.team&&groundSeenBy(f.team,t)&&!!groundFireMode(f,t); }
function groundLandable(f,pos=f.pos){return groundPass(groundMapX(pos.x),groundMapY(pos.z),'was');}
function groundBandCommandTarget(f,band){
  if(f.groundKind!=='was')return band;
  return band==='ground'?'cruise':band;
}
function groundBandCommandAllowed(f,band){
  if(!f.alive||f.embarked||!groundCommandAllowed(f,'band'))return false;
  if(f.groundKind==='fighter')return false; // 巡回・移動と空戦で自動的に切り替える。
  if(f.groundKind==='was')return groundWasFlying(f)&&!f.groundWasLanding&&['ground','low'].includes(band)&&(!f.bandTo||f.bandTo===groundBandCommandTarget(f,band));
  return groundBands(f).includes(band);
}
function groundBeginBand(f,band){
  if(f.bandTo===band)return;
  f.bandTo=band===f.band?null:band;
  f.bandLeft=f.bandTo?groundBandSeconds(f,band):0;
  f.pos.y=groundUnitHeight(f);
}
function groundWasCanToggle(f){
  return f.groundKind==='was'&&f.alive&&!f.locked&&!f.embarked&&!f.bandTo&&groundCommandAllowed(f,'band')&&(groundWasFlying(f)?groundLandable(f):f.groundSupply!==0);
}
function groundWasLand(f){
  f.groundWasLanding=true;
  groundBeginBand(f,f.band==='low'?'cruise':'ground');
}
function groundWasAutoLand(f){
  if(!groundWasFlying(f)||(f.groundSupply!==0&&!f.groundWasForcedLanding))return;
  f.groundWasForcedLanding=true;
  if(!f.bandTo&&groundLandable(f))groundWasLand(f);
}
function groundWasToggle(f){
  if(!groundWasCanToggle(f))return false;
  if(groundWasFlying(f))groundWasLand(f);
  else{
    groundBeginBand(f,'cruise');
    f.syncSpeed=null;
    groundRepathForMoveKind(f);
  }
  return true;
}
function groundWasCombatCruise(f,target){
  const active=f.groundWasAutoCruiseAt!=null;
  if(f.stance!=='engage'){f.groundWasAutoCruiseAt=null;return;}
  if(!active&&!f.groundWasNpcCruise&&!f.groundWasStayGround&&(f.band!=='ground'||f.bandTo))return;
  const rules=groundRuleSet().wasCombat.autoCruise;
  const direct=target&&groundAnyBodyCanFire(f,target);
  if(direct){
    if(f.groundWasForcedLanding||f.groundWasLanding||f.groundWasStayGround)return;
    if(active||f.groundWasNpcCruise&&groundWasCruising(f)){
      f.groundWasNpcCruise=false;
      f.groundWasAutoCruiseAt=gameSec;
    }else if(f.band==='ground'&&!f.bandTo&&
      (!groundSupplyActive()||f.groundSupply>=groundSupplyRules().max*rules.supplyFraction)&&groundWasToggle(f)){
      f.groundWasAutoCruiseAt=gameSec;
    }
    return;
  }
  f.groundWasStayGround=false;
  if(active&&gameSec-f.groundWasAutoCruiseAt>=rules.quietSec-1e-8&&
    (f.band==='ground'&&!f.bandTo||groundWasCanToggle(f)&&groundWasToggle(f)))f.groundWasAutoCruiseAt=null;
}
function groundRepathForMoveKind(f){
  const o=f.order;
  if(o?.type==='attack'){f.groundChaseT=0;o.path=null;}
  if(o?.type!=='move')return;
  const remaining=pathLeft(o),path=groundMovePath(f.pos,remaining.length?remaining:[o.dest],groundMoveKind(f),!!o.groundAdvance);
  dropArrow(f.arrow); f.arrow=null;
  if(!path){f.order=null;nextOrder(f);return;}
  o.path=path; o.dest=path.points.at(-1).clone();
  if((f.team===0||f.seen||typeof revealMode!=='undefined'&&revealMode)&&!(o.groundAdvance&&f.team===0))f.arrow=makeArrow(f.pos,o.dest,TEAM_COL[f.team],{curve:path.curve});
}
function groundStepBand(f,dt){
  f.bandLeft=Math.max(0,f.bandLeft-dt);
  if(f.bandLeft>=1e-8)return;
  const band=f.bandTo,kind=groundMoveKind(f);
  if(band!=='ground'||groundLandable(f))f.band=band;
  f.bandTo=null; f.bandLeft=0;
  if(f.groundWasLanding){
    if(band==='cruise'&&groundLandable(f))groundBeginBand(f,'ground');
    else f.groundWasLanding=false;
  }
  if(band==='ground'&&f.band==='ground'&&f.groundKind==='was')f.groundWasForcedLanding=false;
  if(kind!==groundMoveKind(f))groundRepathForMoveKind(f);
}
function groundSetBand(list,band){
  if(!op.ground||!list.length||!list.every(f=>groundBandCommandAllowed(f,band))) return false;
  npcAutoPlayer(list);
  for(const f of list){
    if(f.groundKind==='was'){f.groundWasAutoCruiseAt=null;f.groundWasNpcCruise=false;}
    if(f.bandTo===groundBandCommandTarget(f,band))continue; // 同じ命令の連打では時計を戻さない。
    groundBeginBand(f,groundBandCommandTarget(f,band));
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
  const command=document.getElementById('groundCommand');
  const onlyWas=list.length>0&&list.every(f=>f.groundKind==='was');
  command.hidden=(onlyWas&&!list.every(groundWasFlying))||list.length>0&&list.every(f=>f.groundDrone);
  command.querySelectorAll('button').forEach(b=>{
    const band=b.dataset.band;
    b.hidden=onlyWas&&band==='high';
    b.disabled=!list.length||!list.every(f=>groundBandCommandAllowed(f,band));
    b.title=onlyWas&&band==='ground'?'超低空巡航へ':onlyWas&&band==='low'?'低高度へ':'';
    b.setAttribute('aria-pressed',String(!!list.length&&list.every(f=>(f.bandTo||f.band)===groundBandCommandTarget(f,band))));
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
  if(typeof groundDroneReset==='function')groundDroneReset();
  if(typeof npcGroundReset==='function')npcGroundReset();
  groundInfluenceCache=null;groundTerritoryPixels=null;
  if(typeof fleets!=='undefined')for(const f of fleets||[])if(groundFlyingAircraft(f)){groundBombCancel(f);f.groundFlightVelocity=null;f.groundAirBoundary=null;f.groundAirSquad=null;f.groundBodyGeometry=null;}
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
// 攻撃の命令のあいだ（敵へ向かって動くときも、止まって撃つときも）は追撃の形 'chase'（小隊を 2×2。ユーザー決定 2026-11-19）
// 命令が終わった直後（動いてから0.4秒）は、列の体が着く途中（groundTrack.arr）のときだけ列の形のまま。進撃・追撃が終わったら、
// 列の形を挟まずにすぐ布陣・待機の形へ（2026-11-19: 進撃が着いた瞬間に列の前後へ向かい「DNA の複製みたいに二つの集団に」なった）
function groundFormationState(f,now=gameSec){
  const moved=now-(f.groundMovedAt??(!f.bodies?f.groundModel?.userData.movedAt:undefined)??-Infinity)<.4;
  const s=moved&&(f.order||f.groundTrack?.arr)?f.order?.groundAdvance?'advance':'move':f.groundDeployed?'defend':'idle';
  return f.order?.type==='attack'&&f.groundBodySpec&&(s==='move'||s==='idle')?'chase':s;
}
// groundLine（布陣・進撃計画の線。ground-plan.js）: その中隊が使える幅と正面。着いたら正面を向き、その幅で小隊を並べる（2026-11-18）
function groundFormationOrder(f,o){
  if(['move','attack'].includes(o.type)&&!o.groundDeploy&&!o.groundAdvance)f.groundDeployed=false;
  if(o.groundDeploy||o.groundAdvance)f.groundLine=o.groundLine?{width:o.groundLine.width,face:{...o.groundLine.face}}:null;
}
function groundFormationArrive(f){
  if(!(f.order?.groundDeploy||f.order?.groundAdvance))return;
  if(typeof groundFrontRememberVia==='function')groundFrontRememberVia(f);
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
  if(spec.form==='wasArrow')return GROUND_WAS_FORMS[p];
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
  const out={spec,width};for(const st of ['idle','defend','advance','move','chase'])out[st]=groundFormationLayout(f,spec,st);
  return f.groundBodyLayouts=out;
}
function groundFormationLayout(f,spec,state){
  if(spec.form==='wasArrow')return spec.offsets.map(([x,z])=>({x:x*spec.size,y:0,z:z*spec.size,yaw:0,bank:0}));
  const p=spec.platoons||1,width=f.groundLine?.width,cols=p<=1?1:state==='idle'||state==='chase'?Math.min(2,p):Number.isFinite(width)?Math.floor(width/groundPlatoonWidth(spec)):p;
  // 追撃の形: 小隊を 2×2 に並べた塊（1小隊なら布陣と同じ）。体は前を向き、動いているあいだは前後左右に少しゆらぐ（wa/ww/wp は横、wb/wv/wq は前後の幅・速さ・位相。仮）
  if(state==='chase'){
    const sp=Math.max(.15,spec.size*.5);
    return groundPlatoonOffsets(spec,cols).map(([x,z],i)=>{const r=groundBodyRandom(f,12000+i);
      return {x:x*spec.size,y:0,z:z*spec.size,yaw:0,bank:0,wa:sp*(.5+r()*.5),ww:2*Math.PI/(6+r()*6),wp:r()*6.3,wb:sp*(.4+r()*.4),wv:2*Math.PI/(7+r()*6),wq:r()*6.3};});
  }
  const base=groundPlatoonOffsets(spec,cols).map(([x,z])=>({x:x*spec.size,y:0,z:z*spec.size,yaw:0,bank:0})),n=base.length;
  if(n<2)return base;
  const vehicles=['vehicle','apc','artillery','guidedRocket','mobileAA','scout','engineer','supply'],foot=['infantry','heavyInfantry','commando','mechanicalAssault','was'];
  if(!vehicles.includes(f.groundKind)&&!foot.includes(f.groundKind))return base;
  if(state==='move')return groundMarchLayout(f,spec,vehicles.includes(f.groundKind));
  if(state==='idle'){
    const radius=Math.max(...base.map(p=>Math.hypot(p.x,p.z)))*1.3;
    return base.map((p,i)=>{const random=groundBodyRandom(f,i),a=random()*Math.PI*2,r=Math.sqrt(random())*radius;return {...p,x:Math.cos(a)*r,z:Math.sin(a)*r,yaw:(random()*2-1)*Math.PI/3};});
  }
  // 進撃と布陣（ユーザー 2026-11-19「進撃する時、列が綺麗すぎます…全体的にランダムに」「到着したらもう少し規則的に並び直す」）
  if(!spec.key)return base;   // モデルのない手組みの並び（テストなど）はずらさない
  const R=GROUND_ADVANCE_RANDOM,per=Math.max(1,Math.round(n/p)),s=spec.size,sp=Math.max(.15,s*.5),k=state==='defend'?R.defend:1;
  return base.map((o,i)=>{const rp=groundBodyRandom(f,13000+Math.floor(i/per)),r=groundBodyRandom(f,14000+i),pz=(rp()*2-1)*R.platoonZ,px=(rp()*2-1)*R.platoonX;
    const q={...o,x:o.x+(px+(r()*2-1)*R.bodyX)*s*k,z:o.z+(pz+(r()*2-1)*R.bodyZ)*s*k,yaw:(r()*2-1)*R.yaw*k};
    return state==='advance'?{...q,wa:sp*(.4+r()*.4),ww:2*Math.PI/(6+r()*6),wp:r()*6.3,wb:sp*(.5+r()*.5),wv:2*Math.PI/(7+r()*6),wq:r()*6.3}:q;});
}
/* 進撃・布陣のずれ（形の単位。数値はすべて仮。見本 2026-11-19 でユーザー承認）: 小隊ごとに前後 platoonZ・左右 platoonX、体ごとに前後 bodyZ・
   左右 bodyX・向き yaw（ラジアン）の幅でずらす。進撃で動いているあいだは追撃と同じように前後左右にゆっくりゆらぐ。布陣（着いたあと）は
   同じずれを defend 倍に縮めた位置へ並び直す（少し規則的に） */
const GROUND_ADVANCE_RANDOM={platoonZ:1.5,platoonX:.4,bodyZ:1,bodyX:.45,yaw:.25,defend:.3};
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
  const size=spec.body??spec.size;   // 描く体の大きさ（GROUND_BODY_SCALE を掛けたもの）
  if(!spec.key)return {len:2*size,wid:size,ht:size};
  const k=spec.key+':'+size;if(groundBodyDimsCache.has(k))return groundBodyDimsCache.get(k);
  const g=groundShapeGeo(spec.key);g.computeBoundingBox();const b=g.boundingBox,out={len:(b.max.z-b.min.z)*size,wid:(b.max.x-b.min.x)*size,ht:(b.max.y-b.min.y)*size};g.dispose();
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
  if(!f.groundBodySpec||f.groundBodySpec.form==='wasArrow'||groundFormationState(f)!=='move'){f.groundTrail=null;return;}
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
/* 体ごとの動き（ユーザー承認 2026-11-19。見本は「兵種の動き方」のページ）。体は自分の世界の位置・向き・速さを持ち（f.groundTrack）、
   行き先（並びの位置。動いていれば行き先の動きも）へ、自分の足回り（GROUND_DRIVE）で近づく。中隊の印（f.pos）が動いても、体は勝手には動かない。
   - ふつうの移動: 列は道のとおりに進み、体の1つ1つが目的地の近く（R 以内）まで来たら、その体だけ列を離れて、空いている中でいちばん近い
     自分の位置へ行く（先に着いた体から順に位置につく）。部隊の印が止まったあとも、列に残った体は通った道を進み続ける。
     列の半分より短い動き直しは、列を作らず全員がそのまま近い順に新しい位置へ向かう。
   - 攻撃の命令のあいだは追撃の形（groundFormationLayout の 'chase'）。
   - 装軌: 前と後ろにだけ進み、向きが pivot 度より大きくずれていれば進まずにその場で回る（超信地旋回）。装輪: その場では回れず、進みながら
     曲がる（着いたら、そのときの向きのまま止まる）。二足歩行（W.A.S.）: その場で回れ、前後へ歩く。徒歩: どの向きにも歩けるが横と後ろは遅い。
   - 前後の判定: 行き先がすぐ後ろ（revMax 体ぶん以内）で、止まる並びの向きが今の向きに近いときは、向きを変えずに後ろへ下がる。
   - 止まる位置のすぐそば（park 体ぶん）では止まる向きへ回り（装輪は回らない）、前後だけで合わせる。動いているあいだは同じ中隊の体どうしでよける。
   数はすべて仮（docs/menu.md）。turn: 体の長さ1つを部隊の速さで進むあいだに回るラジアン、cap: 回る速さの上限（ラジアン/秒）、rev: 後ろへの速さ
   （部隊の速さに対して）、radius: 装輪の回る半径（体の長さ）、minFwd: 装輪が曲がるあいだも保つ前への速さ、side/back: 徒歩の横・後ろへの速さ、accel: 加速 */
const GROUND_DRIVE={tankE:'track',tankM:'track',spgE:'track',spgM:'track',aaE:'track',aaM:'track',engE:'track',engM:'track',mlrsM:'track',
  apcE:'wheel',apcM:'wheel',scoutE:'wheel',scoutM:'wheel',supE:'wheel',supM:'wheel',mlrsE:'wheel',was4:'walk'};
const GROUND_MOVE={
  gain:1.6,
  track:{turn:.6,cap:4,pivot:55,rev:.4,revMax:3,accel:3,park:.6},
  wheel:{radius:1.5,rev:.3,revMax:3,accel:2.5,minFwd:.3,park:.6},
  walk:{turn:.8,cap:4,pivot:45,rev:.5,revMax:3,accel:3,park:.6},
  foot:{turn:3,cap:9,side:.6,back:.45,accel:8}
};
function groundDriveKind(spec){return GROUND_DRIVE[spec?.key]||'foot';}
const groundWrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// 体の位置を1つにまとめて扱う隊。
function groundBodyCentered(f){return !f.bodies||f.bodies0===1||!f.groundBodySpec||['supportAircraft','drone'].includes(f.groundKind)||groundWasFlying(f)&&!groundWasBodyFlight(f);}
// 体と位置の組み合わせ: 近い組から順に決める
function groundAssign(cur,tg){
  const n=cur.length,pairs=[];
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)pairs.push([Math.hypot(cur[i].x-tg[j].x,cur[i].z-tg[j].z),i,j]);
  pairs.sort((a,b)=>a[0]-b[0]);
  const slot=new Array(n).fill(-1),used=new Array(n).fill(false);let left=n;
  for(const [,i,j] of pairs){if(slot[i]>=0||used[j])continue;slot[i]=j;used[j]=true;if(!--left)break;}
  return slot;
}
// 今の組み合わせ（prev）のまま動く場合と、近い組から決め直す場合で、動く距離の合計の短い方（並びをそのままずらすとき、前と後ろの列が入れ替わらない）
function groundAssignBest(cur,tg,prev){
  const g=groundAssign(cur,tg),n=cur.length;
  if(!prev||prev.length!==n||prev.some(j=>!(j>=0&&j<tg.length))||new Set(prev).size!==n)return g;
  const cost=sl=>sl.reduce((a,j,i)=>a+Math.hypot(cur[i].x-tg[j].x,cur[i].z-tg[j].z),0);
  return cost(prev)<=cost(g)?prev.slice():g;
}
// 道筋（center から前は ahead、後ろは behind）を細かく取り、幅 smooth でならす。返す関数 at(u) は center から u 進んだ所（groundMarchPositions と同じ取り方）
function groundPathSampler(center,dir,aheadPts,behindPts,lo,hi,smooth){
  const ahead=[{x:center.x,z:center.z,dx:dir.x,dz:dir.z},...aheadPts],behind=[{x:center.x,z:center.z,dx:-dir.x,dz:-dir.z},...behindPts];
  const H=GROUND_MARCH_STEP,back=Math.ceil(-lo/H),fwd=Math.ceil(hi/H),K=back+fwd+1,L0=-back*H,sx=new Float64Array(K+1),sz=new Float64Array(K+1);
  const q={x:0,z:0},wb=groundPolyWalker(behind),wa=groundPolyWalker(ahead),xs=new Float64Array(K),zs=new Float64Array(K);
  for(let k=back;k>=0;k--){wb((back-k)*H,q);xs[k]=q.x;zs[k]=q.z;}
  for(let k=back+1;k<K;k++){wa((k-back)*H,q);xs[k]=q.x;zs[k]=q.z;}
  for(let k=0;k<K;k++){sx[k+1]=sx[k]+xs[k];sz[k+1]=sz[k]+zs[k];}
  const w=Math.round(smooth/H),sm=k=>{k=Math.max(0,Math.min(K-1,k));const a=Math.max(0,k-w),b=Math.min(K-1,k+w),c=b-a+1;return {x:(sx[b+1]-sx[a])/c,z:(sz[b+1]-sz[a])/c};};
  return u=>{const t=(u-L0)/H,k=Math.floor(t),e=t-k,a=sm(k),b=sm(k+1);return {x:a.x+(b.x-a.x)*e,z:a.z+(b.z-a.z)*e};};
}
// 列の中の体の位置（shift: 道筋の中心からさらに進んだ距離）。a は道筋の中心からの距離
function groundMarchBody(at,half,b,shift,now){
  const x=half-(b.s+b.sa*Math.sin(b.sw*now+b.sp))+shift,p=at(x),q=at(x+.3),r=at(x-.3);
  let tx=q.x-r.x,tz=q.z-r.z;const tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;const lat=b.lat+b.la*Math.sin(b.lw*now+b.lp);
  return {x:p.x+tz*lat,z:p.z-tx*lat,yaw:Math.atan2(tx,tz)+b.ya*Math.sin(b.lw*now+b.lp+1.2),a:x};
}
// 着いたあとの並び（目的地 D と最後の向き）。R: 体がこの距離まで近づいたら列を離れる
function groundArrival(f,L,o,aheadPts){
  const last=aheadPts[aheadPts.length-1]||f.pos,prev=aheadPts.length>1?aheadPts[aheadPts.length-2]:f.pos;
  let dir={x:last.x-prev.x,z:last.z-prev.z};const dl=Math.hypot(dir.x,dir.z);dir=dl>1e-6?{x:dir.x/dl,z:dir.z/dl}:{x:f.heading.x,z:f.heading.z};
  const face=o.groundDeploy&&f.groundLine?.face&&Math.hypot(f.groundLine.face.x,f.groundLine.face.z)>1e-6?f.groundLine.face:dir;
  const state=o.groundDeploy?'defend':'idle',a=Math.atan2(face.x,face.z),cos=Math.cos(a),sin=Math.sin(a);
  const slots=L[state].map(p=>({x:last.x+p.x*cos+p.z*sin,z:last.z-p.x*sin+p.z*cos,yaw:a+(p.yaw||0)}));
  const far=Math.max(...slots.map(s=>Math.hypot(s.x-last.x,s.z-last.z)));
  return {order:o,D:{x:last.x,z:last.z},dir,slots,used:slots.map(()=>false),R:Math.max(1.5,Math.min(4,far*.4)),dist:0,behind:null,at:null};
}
// 並びの位置（中隊の位置からのずれ、世界の向き）と向き
function groundFormationTargets(f,L,state){
  const lay=L[state];
  if(lay.march){const m=groundMarchPositions(f,lay,gameSec);return m.map(p=>({x:p.x-f.pos.x,z:p.z-f.pos.z,yaw:p.yaw}));}
  const a=Math.atan2(f.heading.x,f.heading.z),cos=Math.cos(a),sin=Math.sin(a),now=gameSec,mv=now-(f.groundMovedAt??-Infinity)<.4;
  return lay.map(p=>{let x=p.x,z=p.z;if((state==='chase'||state==='advance')&&mv&&p.wa){x+=p.wa*Math.sin(p.ww*now+p.wp);z+=p.wb*Math.sin(p.wv*now+p.wq);}
    return {x:x*cos+z*sin,z:-x*sin+z*cos,yaw:a+(p.yaw||0)};});
}
// 体の世界の位置からずれ（T.off）を作り直す。中隊が一度に大きく動いたとき（置き直し・乗り降り）は、体も並びのまま一緒に動かす
function groundTrackSync(f,T,dt){
  const n=T.off.length,jx=f.pos.x-T.px,jz=f.pos.z-T.pz,jump=Math.hypot(jx,jz)>Math.max(3,Math.max(.5,f.speed||1)*dt*4);
  for(let i=0;i<n;i++){if(jump){T.ax[i]+=jx;T.az[i]+=jz;T.v[i]=0;T.vx[i]=0;T.vz[i]=0;}
    T.off[i].x=T.ax[i]-f.pos.x;T.off[i].z=T.az[i]-f.pos.z;}
}
function groundBodyMove(f,T,tgt,dt){
  const spec=f.groundBodySpec,kind=groundDriveKind(spec),M=GROUND_MOVE[kind],GAIN=GROUND_MOVE.gain,n=tgt.length,{len,wid}=groundBodyDims(spec);
  const vU=Math.max(.5,f.speed||1),L=Math.max(len,.05),sepR=wid*1.6;   // よける距離: 体の幅の1.6倍（並びの横の間隔より狭く）
  for(let i=0;i<n;i++){
    const p=tgt[i],Px=f.pos.x+p.x,Pz=f.pos.z+p.z,id=T.mode[i]+(T.mode[i]==='s'?T.arrSlot[i]:T.slot[i])+'|'+T.key;
    // 行き先の動き（並びの位置が中隊と一緒に動いていれば、その速さで先回りする）
    let vtx=0,vtz=0;
    if(T.ps[i]===id&&T.pp[i]){vtx=(Px-T.pp[i].x)/dt;vtz=(Pz-T.pp[i].z)/dt;const m=Math.hypot(vtx,vtz),cap=vU*1.3;if(m>cap){vtx*=cap/m;vtz*=cap/m;}}
    T.pp[i]={x:Px,z:Pz};T.ps[i]=id;
    const ex=Px-T.ax[i],ez=Pz-T.az[i],e=Math.hypot(ex,ez),vmax=(p.walk?1:1.5)*vU,still=Math.hypot(vtx,vtz)<.08*vU;
    const arrive=kind==='foot'?.02:kind==='wheel'?Math.max(.05,L*.3):Math.max(.04,L*.12);
    let dx=vtx+ex*GAIN,dz=vtz+ez*GAIN;
    // よける（同じ中隊の体どうし）。よける向きのうち行き先から遠ざかる分は捨て、横へよけるだけにする（隣の体に押し返されて行き先へ着けなくならない）
    if(!(still&&e<arrive*3)){let px=0,pz=0;for(let j=0;j<n;j++){if(j===i)continue;const sx=T.ax[i]-T.ax[j],sz=T.az[i]-T.az[j],d=Math.hypot(sx,sz);if(d>1e-6&&d<sepR){const k=(sepR-d)/sepR*vU*.8/d;px+=sx*k;pz+=sz*k;}}
      if(e>1e-6){const back=(px*ex+pz*ez)/e;if(back<0){px-=back*ex/e;pz-=back*ez/e;}}dx+=px;dz+=pz;}
    let dm=Math.hypot(dx,dz);if(dm>vmax){dx*=vmax/dm;dz*=vmax/dm;dm=vmax;}
    if(still&&e<arrive){dx=dz=0;dm=0;}
    const yaw=T.yaw[i];let moved=false,turned=0;
    if(kind==='foot'){
      // 遠くへ進む（中隊について行く）ときは進む向きを向く。止まった並びの近くの動き直しは、並びの向きのまま横・後ろへ歩く
      const travel=dm>1e-6&&(!still||e>4*L),want=travel?Math.atan2(dx,dz):p.yaw;
      const om=Math.min(M.cap,M.turn*vU/L)*dt,dy=groundWrap(want-yaw),t=Math.max(-om,Math.min(om,dy));T.yaw[i]=yaw+t;turned=Math.abs(t);
      let lim=vmax;if(dm>1e-6){const c=(dx*Math.sin(T.yaw[i])+dz*Math.cos(T.yaw[i]))/dm;lim*=c>=0?M.side+(1-M.side)*c:M.side+(M.back-M.side)*(-c);}
      let wx=dx,wz=dz;if(dm>lim){wx*=lim/dm;wz*=lim/dm;}
      const a=M.accel*vU*dt,ddx=wx-T.vx[i],ddz=wz-T.vz[i],dd=Math.hypot(ddx,ddz),k=dd>a?a/dd:1;
      T.vx[i]+=ddx*k;T.vz[i]+=ddz*k;T.ax[i]+=T.vx[i]*dt;T.az[i]+=T.vz[i]*dt;
      moved=Math.hypot(T.vx[i],T.vz[i])>.05*vU;
    }else if(still&&e<M.park*L&&(kind==='wheel'||Math.abs(ex*Math.cos(p.yaw)-ez*Math.sin(p.yaw))<M.park*L*.4)){
      // 止まる位置のすぐそば: 止まる向きへ回り（装輪は回れない）、前後だけで位置を合わせる。横の少しのずれ（体の長さの0.24倍まで）は直さない。
      // それより横にずれていれば（装軌・二足歩行）、下の動きでその場で回って少し進み、着いてから止まる向きへ回り直す
      const want=kind==='wheel'?yaw:p.yaw,om=Math.min(M.cap||4,(M.turn||1)*vU/L)*dt,dy=groundWrap(want-yaw),t=kind==='wheel'?0:Math.max(-om,Math.min(om,dy));T.yaw[i]=yaw+t;turned=Math.abs(t);
      const along=ex*Math.sin(T.yaw[i])+ez*Math.cos(T.yaw[i]),goal=Math.abs(along)<arrive*.5||Math.abs(groundWrap(want-T.yaw[i]))>.35?0:Math.max(-M.rev*vU,Math.min(vmax,along*GAIN)),a=M.accel*vU*dt;
      T.v[i]+=Math.max(-a,Math.min(a,goal-T.v[i]));T.gear[i]=T.v[i]<0?-1:1;
      T.ax[i]+=Math.sin(T.yaw[i])*T.v[i]*dt;T.az[i]+=Math.cos(T.yaw[i])*T.v[i]*dt;moved=Math.abs(T.v[i])>.05*vU;
    }else{
      let g=T.gear[i],want=yaw,spd=0;
      if(dm>1e-6){
        const dir=Math.atan2(dx,dz),err=groundWrap(dir-yaw);
        // 前か後ろか: 行き先がすぐ後ろで、止まる並びの向きが今の向きに近いときは、向きを変えずに後ろへ下がる
        const near=still&&e<M.revMax*L&&Math.abs(groundWrap(p.yaw-yaw))<Math.PI/3;
        if(g===1&&near&&Math.abs(err)>Math.PI*.6)g=-1;else if(g===-1&&(!near||Math.abs(err)<Math.PI*.35))g=1;
        // 装輪は、近くで真横の行き先へは回り込めないので、そこで止まる
        if(kind==='wheel'&&g===1&&still&&e<L*.6&&Math.abs(err)>Math.PI*.4){dm=0;}
        else{T.gear[i]=g;want=g===1?dir:dir+Math.PI;spd=g===1?dm:Math.min(dm,M.rev*vU);}
      }
      if(dm<=1e-6){T.gear[i]=1;want=kind==='wheel'?yaw:p.yaw;spd=0;}
      const om=kind==='wheel'?Math.abs(T.v[i])/(M.radius*L)*dt:Math.min(M.cap,M.turn*vU/L)*dt;   // 装輪は進んでいるときだけ曲がれる
      const dy=groundWrap(want-yaw),t=Math.max(-om,Math.min(om,dy));T.yaw[i]=yaw+t;turned=Math.abs(t);
      const e2=Math.abs(groundWrap(want-T.yaw[i]));
      if(kind==='wheel'){if(spd>0)spd*=Math.max(M.minFwd,Math.cos(Math.min(e2,Math.PI/2)));}
      else{const c0=Math.cos(M.pivot*Math.PI/180);spd*=Math.max(0,Math.min(1,(Math.cos(e2)-c0)/(1-c0)));}   // 向きが大きくずれていれば進まずに、その場で回る
      const goal=T.gear[i]*spd,a=M.accel*vU*dt;T.v[i]+=Math.max(-a,Math.min(a,goal-T.v[i]));
      T.ax[i]+=Math.sin(T.yaw[i])*T.v[i]*dt;T.az[i]+=Math.cos(T.yaw[i])*T.v[i]*dt;
      moved=Math.abs(T.v[i])>.05*vU;
    }
    T.moving[i]=moved||turned>.5*dt;
    T.off[i].x=T.ax[i]-f.pos.x;T.off[i].z=T.az[i]-f.pos.z;
  }
}
/* 体ごとの動きを返す。体を1つにまとめて扱う隊は null。
   advance: 今の時刻まで進める（groundStep の中で、中隊が動いた直後に1回だけ）。進めるとき、体は世界の位置のまま中隊の動きを追う
   （体が中隊ごと平行に動いて横すべりしない）。進めないあいだに中隊が置き直されたら（台本・テスト・乗り降り・1ステップの中）、体は並びのまま一緒に動く */
function groundBodyTrack(f,advance=false){
  if(groundBodyCentered(f)||groundWasBodyFlight(f)||groundAirSquad(f)){f.groundTrack=null;return null;}
  const spec=f.groundBodySpec,L=groundLayouts(f,spec),n=spec.offsets.length,state=groundFormationState(f),width=f.groundLine?.width??Infinity;
  // 止まっているあいだに向きが変わったら（布陣の正面を変えたとき）、体と位置の組み合わせを近い順に決め直す
  const key=state+'|'+width+(state==='idle'||state==='defend'?'|'+Math.round(Math.atan2(f.heading.x,f.heading.z)/(Math.PI/6)):'');
  let T=f.groundTrack;
  if(!T||T.spec!==spec||T.off.length!==n){
    const tg=groundFormationTargets(f,L,state),z=()=>tg.map(()=>0);
    return f.groundTrack={spec,key,t:gameSec,px:f.pos.x,pz:f.pos.z,slot:tg.map((_,i)=>i),off:tg.map(p=>({x:p.x,z:p.z})),yaw:tg.map(p=>p.yaw),moving:tg.map(()=>false),mode:tg.map(()=>'f'),arrSlot:tg.map(()=>-1),arr:null,
      ax:tg.map(p=>f.pos.x+p.x),az:tg.map(p=>f.pos.z+p.z),v:z(),vx:z(),vz:z(),gear:tg.map(()=>1),pp:[],ps:[]};
  }
  const dt=gameSec-T.t;
  if(!advance||!(dt>0))return T;
  groundTrackSync(f,T,dt);
  const o=f.order,plain=state==='move'&&L.move.march&&o?.type==='move'&&o.path?.points,tgt=new Array(n);
  if(T.arr&&o&&T.arr.order!==o){T.arr=null;T.mode.fill('f');T.key=null;}   // 新しい命令: 着く途中の並びをやめる
  const peel=i=>{const A=T.arr,bx=f.pos.x+T.off[i].x,bz=f.pos.z+T.off[i].z;let best=-1,bd=Infinity;
    A.slots.forEach((s,j)=>{if(A.used[j])return;const d=Math.hypot(s.x-bx,s.z-bz);if(d<bd){bd=d;best=j;}});
    A.used[best]=true;T.arrSlot[i]=best;T.mode[i]='s';};
  const slotTgt=i=>{const s=T.arr.slots[T.arrSlot[i]];return {x:s.x-f.pos.x,z:s.z-f.pos.z,yaw:s.yaw,walk:true};};
  if(plain){
    const lay=L.move,half=lay.L/2,p=o.path,aheadPts=[];for(let i=p.atIndex||0;i<p.points.length;i++)aheadPts.push(p.points[i]);
    const at=groundPathSampler(f.pos,f.heading,aheadPts,(f.groundTrail||[]).slice(1),-(half+1+lay.smooth),half+1+lay.smooth,lay.smooth);
    const march=lay.map(b=>groundMarchBody(at,half,b,0,gameSec)),limit=half+6,rem=groundPolyLength([{x:f.pos.x,z:f.pos.z},...aheadPts],limit),known=rem<=limit;
    if(known&&!T.arr){T.arr=groundArrival(f,L,o,aheadPts);
      // 列の半分より短い動き直し: 列を作らず、全員がそのまま近い順に新しい位置へ向かう
      if(rem<half){const A=T.arr,sl=groundAssignBest(T.off,A.slots.map(q=>({x:q.x-f.pos.x,z:q.z-f.pos.z})),T.slot);for(let i=0;i<n;i++){T.arrSlot[i]=sl[i];A.used[sl[i]]=true;T.mode[i]='s';}}}
    if(T.key!==key&&!T.arr){T.slot=groundAssignBest(T.off,march.map(m=>({x:m.x-f.pos.x,z:m.z-f.pos.z})),T.slot);T.key=key;}
    if(T.arr){T.arr.behind=(f.groundTrail||[]).slice(1);T.arr.dir={x:f.heading.x,z:f.heading.z};T.arr.at=null;}
    for(let i=0;i<n;i++){
      if(T.mode[i]!=='s'){const m=march[T.slot[i]];if(T.arr&&known&&m.a-rem>=-T.arr.R)peel(i);else{T.mode[i]='m';tgt[i]={x:m.x-f.pos.x,z:m.z-f.pos.z,yaw:m.yaw};continue;}}
      tgt[i]=slotTgt(i);
    }
  }else if(T.arr&&T.mode.some(m=>m==='m')){
    // 部隊の印は止まった。列に残った体は、通った道を進み続ける
    const A=T.arr,lay=L.move,half=lay.L/2;A.dist+=(f.speed||1)*dt;
    const at=A.at||(A.at=groundPathSampler(A.D,A.dir,[],A.behind||[],-(half+1+lay.smooth),1+lay.smooth,lay.smooth));
    for(let i=0;i<n;i++){
      if(T.mode[i]!=='s'){const m=groundMarchBody(at,half,lay[T.slot[i]],A.dist,gameSec);if(m.a>=-A.R)peel(i);else{tgt[i]={x:m.x-f.pos.x,z:m.z-f.pos.z,yaw:m.yaw};continue;}}
      tgt[i]=slotTgt(i);
    }
  }else{
    if(T.arr&&state!=='move'){T.slot=T.arrSlot.slice();T.key=key;T.arr=null;T.mode.fill('f');}   // 全員が位置についた
    if(T.arr){for(let i=0;i<n;i++)tgt[i]=slotTgt(i);}
    else{
      const tg=groundFormationTargets(f,L,state);
      if(T.key!==key){if(spec.form!=='wasArrow')T.slot=groundAssignBest(T.off,tg,T.slot);T.key=key;}
      for(let i=0;i<n;i++)tgt[i]=tg[T.slot[i]];
    }
  }
  groundBodyMove(f,T,tgt,dt);
  T.t=gameSec;T.px=f.pos.x;T.pz=f.pos.z;
  return T;
}
/* W.A.S. の歩く形の使い分け（ユーザー 2026-11-19）: 盾を前に構えて歩くのは追撃（攻撃の命令）と進撃のときだけ。命令が終わっても
   （着いた・相手が倒れた）、位置へ歩き終えるまでは構えたまま。別の命令が来たら下ろす */
function groundWasGuard(f){
  const o=f.order,g=o?.type==='attack'||!!o?.groundAdvance;
  if(g)f.groundWasGuarded=o;else if(o&&o!==f.groundWasGuarded)f.groundWasGuarded=null;
  if(!g&&f.groundTrack&&!f.groundTrack.moving.some(Boolean))f.groundWasGuarded=null;
  return g||!!f.groundWasGuarded;
}
// 採用図の組の順。小さい中隊も前から順に役割を割り当てる（内訳は仮）。
const GROUND_WAS_ROLES=[null,[1,1],[1,2,1],[3,2,1],[3,3,2]];
// 巡航で移動するとき、採用図の矢印を等比で縮める倍率は data/ground-rules.js の wasCombat.cruiseSpacing（採用 .36）。
const groundWasCruiseSpacing=()=>groundRuleSet().wasCombat.cruiseSpacing??.36;
// 僚機の技順（前衛は通過技の節 2,4,5 をそろえ、半周反転後の再合流と連続性を保つ）。
const GROUND_WAS_FRONT_WING=[[3,0,5,1,2,4],[1,3,4,0,5,2],[3,0,4,1,5,2],[0,3,5,1,2,4]];
const GROUND_WAS_MID_WING=[[2,4,0,1,5,3],[3,0,5,2,1,4],[4,2,1,5,3,0],[5,3,1,0,2,4]];
const GROUND_WAS_REAR_WING=[[2,3,0,4,1],[3,4,1,0,2],[4,0,3,1,2],[1,4,2,0,3]];
const GROUND_WAS_FRONT_NAMES=['jump','inner','overpass','dive','cut','firePass'];
const GROUND_WAS_MID_NAMES=['orbit','jump','inner','climb','cut','firePass'];
const GROUND_WAS_REAR_NAMES=['orbit','jump','inner','snipe','sprint'];
function groundWasSwarmPair(f,t,targets,i,now,forward,rules){
  const {swarmLayout:layout,swarmAttitude:att,swarmManeuvers:m}=rules,all=rules.swarmPattern==='all';
  const [front,middle]=GROUND_WAS_ROLES[targets.length/4],pair=i/2,isFront=pair<front,rear=pair>=front+middle;
  const smooth=THREE.MathUtils.smootherstep,lerp=THREE.MathUtils.lerp,clamp=THREE.MathUtils.clamp,degToRad=THREE.MathUtils.degToRad;
  const pCfg=m.pair,unit01=(a,b,c)=>(1+hash(a,b,c))*.5;
  // 組ごとの基準周期。僚機は開始位相と揺らぎをずらし、長機と半ば独立して技に入る。
  const slot=m.slotSec+m.slotVariationSec*hash(f.id,pair,0);
  const baseClock=now/slot+pair*m.pairPhase+unit01(f.id,0,1);
  const frontOuter=Math.min(layout.frontRadiusKm*m.front.outerScale,layout.maxSpanKm/2);
  const wingLag=pCfg.phaseLag+pCfg.phaseLagVar*unit01(f.id,pair,31);
  const wingDrift=pCfg.phaseDrift*Math.sin(now*pCfg.phaseDriftRate+hash(f.id,pair,32)*Math.PI);
  const spinDir=hash(f.id,pair,40)>=0?1:-1;
  const spinRate=lerp(pCfg.orbitRate[0],pCfg.orbitRate[1],unit01(f.id,pair,41));
  const wingTheta=now*spinRate*spinDir+hash(f.id,pair,42)*Math.PI;
  const breatheRate=lerp(pCfg.breatheRate[0],pCfg.breatheRate[1],unit01(f.id,pair,43));
  const wingSep=lerp(pCfg.minGapKm,pCfg.maxGapKm,.5+.5*Math.sin(now*breatheRate+hash(f.id,pair,44)*Math.PI));
  const speedWaveRate=lerp(pCfg.speedWaveRate[0],pCfg.speedWaveRate[1],unit01(f.id,pair,45));
  const speedWave=pCfg.speedWaveKm*Math.sin(now*speedWaveRate+hash(f.id,pair,46)*Math.PI);
  const leadRate=lerp(pCfg.leadWanderRate[0],pCfg.leadWanderRate[1],unit01(f.id,pair,47));
  const leadTheta=now*leadRate*(-spinDir)+hash(f.id,pair,48)*Math.PI;
  const leadR=pCfg.leadWanderKm*(.5+.5*Math.sin(now*breatheRate*1.17+hash(f.id,pair,49)*Math.PI));
  const sideSign=Math.sign(targets[i].x+targets[i+1].x)||1;
  const pickIndex=(list,salt)=>Math.min(list.length-1,Math.floor(unit01(f.id,pair,salt)*list.length));

  const memberState=member=>{
    const isWing=member===1;
    const clock=isWing?baseClock-wingLag+wingDrift:baseClock;
    const beat=Math.floor(clock),u=clock-beat;
    const pulse=smooth(u,.04,.25)*(1-smooth(u,.76,.98));
    const hRate=lerp(pCfg.heightRate[0],pCfg.heightRate[1],unit01(f.id,pair,isWing?51:52));
    const hWave=pCfg.heightWaveKm*(isWing?1:.55)*Math.sin(now*hRate+hash(f.id,pair,isWing?53:54)*Math.PI);
    const dRad=isWing?wingSep*Math.cos(wingTheta):leadR*Math.cos(leadTheta);
    const dTan=isWing?wingSep*Math.sin(wingTheta)+speedWave:leadR*Math.sin(leadTheta);
    const dRadRate=isWing?-wingSep*spinRate*spinDir*Math.sin(wingTheta):-leadR*leadRate*(-spinDir)*Math.sin(leadTheta);
    let angle,distance,lateral=0,height,bank,pitch,outer;
    let passBlend=0,aim=0,jumpReady=0,boost=0,doJump=false,maneuver='orbit';

    if(isFront){
      const cfg=m.front,cycle=Math.floor(beat/6),step=((beat%6)+6)%6;
      const move=isWing?GROUND_WAS_FRONT_WING[pickIndex(GROUND_WAS_FRONT_WING,cycle*13+60)][step]:step;
      const pass=cfg.passes[move];
      const turns=3*cycle+Number(step>2)+Number(step>4);
      let over=0,a=-now*att.frontOrbitSpeed+pair*2*Math.PI/front+turns*Math.PI;
      if(pass){
        over=smooth(u,pass.start,pass.end);
        passBlend=smooth(u,pass.enter,pass.start)*(1-smooth(u,pass.end,pass.exit));
        // 中央を横切る間だけ周回を止め、進入時と離脱時に輪へつなぐ。
        a+=(u-(pass.start+pass.end)/2)*slot*att.frontOrbitSpeed*passBlend;
        if(isWing){
          const dir=hash(f.id,pair,beat*7+70)>=0?1:-1;
          a+=dir*degToRad(pCfg.passAngleDeg)*(.65+.35*Math.abs(hash(f.id,pair,beat*7+71)))*passBlend;
        }
      }
      const attitudePhase=a+over*Math.PI+(isWing?.95:0);
      angle=forward+a;
      distance=layout.frontRadiusKm+dRad*(1-passBlend);
      // 通過後の半周反転（over=1）で次の節の angle+π と横ずれの向きを一致させる。
      lateral=dTan*(1-2*over)*(1-passBlend);
      height=cfg.heightKm+cfg.swayKm*Math.cos(attitudePhase)+hWave*(1-.5*passBlend);
      bank=-att.frontRoll-att.frontRollSway*Math.sin(attitudePhase)-dRadRate*1.1;
      pitch=Math.min(att.frontAimPitch,Math.atan2(height,Math.max(.08,distance)))-att.frontClimbPitch*Math.sin(attitudePhase);
      outer=frontOuter;
      maneuver=GROUND_WAS_FRONT_NAMES[move];
      if(move===0)doJump=true;
      if(move===1){
        const innerMul=isWing?lerp(cfg.innerScale,cfg.innerScale+.12,unit01(f.id,pair,beat+72)):cfg.innerScale;
        distance=lerp(distance,layout.frontRadiusKm*innerMul+dRad*.35,pulse);
        if(isWing)angle+=.22*(hash(f.id,pair,beat+73)>=0?1:-1)*pulse;
      }
      if(pass){
        distance=lerp(distance,pass.radiusKm,passBlend)*(1-2*over);
        height=lerp(height,pass.heightKm+(isWing?hash(f.id,pair,beat+74)*.022:0),passBlend);
        bank*=1-passBlend;
        let lane=0;
        if(t.groundKind==='heavyInfantry')lane=(isWing?-1:1)*cfg.infantryClearanceKm;
        else if(isWing)lane=(hash(f.id,pair,beat+75)>=0?1:-1)*pCfg.passLaneKm;
        else if(pass.leadLaneKm)lane=pass.leadLaneKm;
        lateral=lerp(lateral,lane,passBlend);
        if(move===5)aim=passBlend;
      }
      if(move===3){
        const down=smooth(u,.29,.61)*(1-smooth(u,.67,.93));
        height=lerp(height,lerp(cfg.diveHighKm,cfg.diveLowKm,down),pulse);
        distance*=lerp(1,cfg.diveRadiusScale,down);
        const noseDown=smooth(u,.24,.37)*(1-smooth(u,.60,.72));
        pitch=lerp(pitch,degToRad(cfg.divePitchDeg),noseDown);
        pitch-=att.frontClimbPitch*smooth(u,.68,.79)*(1-smooth(u,.87,.98));
      }
    }else{
      const cfg=rear?m.rear:m.middle,phase=now*(rear?att.rearSwaySpeed:att.middleSwaySpeed)+pair*1.7+(isWing?1.35:0);
      const vel=Math.cos(phase),sway=Math.sin(phase),variation=hash(f.id,pair,beat*5+(isWing?83:2))*pulse;
      height=cfg.heightKm+cfg.heightSwayKm*sway+hWave;
      bank=-vel*(rear?att.rearRoll:att.middleRoll)-dRadRate*.9;
      pitch=-vel*(rear?att.rearPitch:att.middlePitch);
      if(all){
        const row=rear?pair-front-middle:pair-front,count=rear?targets.length/2-front-middle:middle;
        const baseRadius=rear?Math.min(layout.maxSpanKm/2,layout.allRearRadiusKm)-cfg.orbitInsetKm:Math.min(layout.maxSpanKm/2,layout.allMiddleRadiusKm);
        outer=rear?Math.min(layout.maxSpanKm/2,layout.allRearRadiusKm):Math.min(layout.maxSpanKm/2,layout.allMiddleRadiusKm*(cfg.outerScale||1));
        angle=forward+now*(rear?-att.rearOrbitSpeed:att.middleOrbitSpeed)+row*2*Math.PI/count;
        distance=baseRadius+dRad;
        lateral=dTan;
        bank+=(rear?-1:1)*(rear?att.rearRoll:att.middleRoll)*.5;
        if(rear){
          const cycle=Math.floor(beat/5),step=((beat%5)+5)%5;
          const move=isWing?GROUND_WAS_REAR_WING[pickIndex(GROUND_WAS_REAR_WING,cycle*13+90)][step]:(step+pair)%5;
          maneuver=GROUND_WAS_REAR_NAMES[move];
          if(move===1)doJump=true;
          else if(move===2){
            distance-=cfg.innerKm*pulse;
            bank-=att.rearRoll*.45*pulse;
          }else if(move===3){
            height+=cfg.sniperRiseKm*pulse;
            bank*=1-pulse;
          }else if(move===4){
            const dir=hash(f.id,pair,beat*5+91)>=0?1:-1;
            angle+=dir*cfg.arcRad*pulse;
            height=lerp(height,cfg.dipHeightKm,pulse);
            bank+=dir*att.rearRoll*.5*pulse;
          }
        }else{
          const cycle=Math.floor(beat/6),step=((beat%6)+6)%6;
          const move=isWing?GROUND_WAS_MID_WING[pickIndex(GROUND_WAS_MID_WING,cycle*13+100)][step]:(step+pair)%6;
          maneuver=GROUND_WAS_MID_NAMES[move];
          if(move===1)doJump=true;
          else if(move===2){
            distance-=cfg.innerKm*pulse;
            angle+=.16*(isWing?-1:1)*pulse;
            bank+=att.middleRoll*.45*pulse;
          }else if(move===3){
            height+=cfg.climbKm*pulse;
            distance+=.06*pulse;
            bank*=1-.6*pulse;
          }else if(move===4){
            const dir=hash(f.id,pair,beat*5+101)>=0?1:-1;
            angle+=dir*cfg.arcRad*pulse;
            distance-=cfg.innerKm*.7*pulse;
            height+=dir*.032*pulse;
            bank+=dir*att.middleRoll*.5*pulse;
          }else if(move===5){
            const passP=smooth(u,.16,.34)*(1-smooth(u,.66,.86));
            passBlend=passP;
            distance-=cfg.passInnerKm*passP;
            height=lerp(height,cfg.passHeightKm+(isWing?hash(f.id,pair,beat+102)*.018:0),passP);
            angle+=.2*(isWing?-1:1)*passP;
            bank*=1-.7*passP;
            aim=smooth(u,.24,.38)*(1-smooth(u,.62,.76));
          }
        }
      }else{
        angle=forward+Math.PI;
        outer=layout.maxSpanKm-frontOuter;
        lateral=-sideSign*cfg.sideKm+cfg.swayKm*sway+dTan*.5;
        distance=(rear?layout.rearKm:layout.middleKm)+cfg.depthSwayKm*vel+dRad*.5;
        const step=((beat%3)+3)%3,move=isWing?(step+1+(hash(f.id,pair,beat+110)>=0?1:0))%3:step;
        if(rear){
          outer=Math.min(outer,layout.rearKm*cfg.outerScale);
          lateral+=cfg.swayKm*(.5*Math.sin(phase*1.61)+variation);
          distance+=cfg.depthSwayKm*variation;
          height+=cfg.heightSwayKm*(Math.sin(phase*1.83)+variation);
          if(move===0){height+=cfg.sniperRiseKm*pulse;bank*=1-pulse;maneuver='snipe';}
          else if(move===1){doJump=true;maneuver='jump';}
        }else if(move===0){distance-=cfg.coverKm*pulse;maneuver='inner';}
        else if(move===1){lateral+=cfg.slideKm*(variation>=0?1:-1)*pulse;doJump=true;maneuver='jump';}
        else{height+=cfg.climbKm*pulse;maneuver='climb';}
      }
      pitch+=Math.atan2(height,Math.max(.08,distance));
    }
    if(doJump){
      const jump=m.jump,time=u*slot-jump.startSec,fallAt=jump.riseSec+jump.floatSec,end=fallAt+jump.fallSec;
      const lift=smooth(time,0,jump.riseSec)*(1-smooth(time,fallAt,end));
      jumpReady=smooth(time,-jump.prepSec,0)*(1-smooth(time,end,end+jump.prepSec));
      boost=smooth(time,0,jump.thrustFadeSec)*(1-smooth(time,jump.riseSec-jump.thrustFadeSec,jump.riseSec));
      const rise=jump.riseKm+jump.variationKm*hash(f.id,pair,beat*3+(isWing?119:11));
      height=lerp(height,jump.launchKm,jumpReady)+rise*lift;
      pitch=lerp(pitch,-degToRad(jump.pitchDeg),boost);
    }
    const x=Math.sin(angle)*distance+Math.cos(angle)*lateral,z=Math.cos(angle)*distance-Math.sin(angle)*lateral;
    return {x,z,height:clamp(height,m.minHeightKm,m.maxHeightKm),bank,pitch,boost,aim,passBlend,jumpReady,outer,maneuver};
  };

  const leader=memberState(0),wing=memberState(1);
  const clampOuter=b=>{const r=Math.hypot(b.x,b.z);if(r>b.outer){const k=b.outer/r;b.x*=k;b.z*=k;}};
  clampOuter(leader);clampOuter(wing);
  // 2機が近づきすぎたときは水平と高さを少しずらして衝突を避ける。
  const dx=wing.x-leader.x,dz=wing.z-leader.z,dh=wing.height-leader.height;
  const distH=Math.hypot(dx,dz),dist3=Math.hypot(dx,dz,dh);
  if(dist3<pCfg.minGapKm){
    const fallback=wingTheta;
    const ux=distH>1e-4?dx/distH:Math.cos(fallback),uz=distH>1e-4?dz/distH:Math.sin(fallback);
    const push=(pCfg.minGapKm-distH)*.55;
    if(push>0){
      leader.x-=ux*push;leader.z-=uz*push;
      wing.x+=ux*push;wing.z+=uz*push;
      clampOuter(leader);clampOuter(wing);
      // 外周で片方が押し戻されたら、もう片方を内側へ逃がして最小間隔を保つ。
      const rx=wing.x-leader.x,rz=wing.z-leader.z,rd=Math.hypot(rx,rz);
      if(rd<pCfg.minGapKm){
        const lack=pCfg.minGapKm-rd,lr=Math.hypot(leader.x,leader.z),wr=Math.hypot(wing.x,wing.z);
        if(wr>=lr&&lr>1e-4){leader.x-=leader.x/lr*lack;leader.z-=leader.z/lr*lack;}
        else if(wr>1e-4){wing.x-=wing.x/wr*lack;wing.z-=wing.z/wr*lack;}
      }
    }
    if(Math.abs(dh)<pCfg.avoidHeightKm){
      const sign=dh===0?(hash(f.id,pair,120)>=0?1:-1):Math.sign(dh);
      const blend=smooth(pCfg.minGapKm-dist3,0,pCfg.minGapKm*.45);
      const lift=(pCfg.avoidHeightKm-Math.abs(dh))*.5*blend;
      leader.height=clamp(leader.height-sign*lift,m.minHeightKm,m.maxHeightKm);
      wing.height=clamp(wing.height+sign*lift,m.minHeightKm,m.maxHeightKm);
    }
  }
  for(const b of [leader,wing]){
    b.x=t.pos.x-f.pos.x+b.x*GROUND_SCALE;
    b.z=t.pos.z-f.pos.z+b.z*GROUND_SCALE;
    b.height=clamp(b.height,m.minHeightKm,m.maxHeightKm)*GROUND_SCALE;
    b.outer*=GROUND_SCALE;
  }
  return [leader,wing];
}
// 両隊が止まって互いに交戦しているときだけ、同じ中点を囲む。
function groundWasSwarmTarget(f,rules){
  const t=f.fireTarget;
  return f.band==='cruise'&&!f.bandTo&&gameSec-f.groundMovedAt>=.4&&t?.alive&&!groundAbsent(t)&&!t.embarked&&
    groundDistanceTo(f,t)<=groundTargetRange(f,t)+rules.swarmLayout.maxSpanKm*GROUND_SCALE/2?t:null;
}
function groundWasDuelDirect(f,t){
  return groundWasCruising(f)&&groundWasCruising(t);
}
function groundWasLowDuel(f,t){
  return f.groundKind==='was'&&f.band==='low'&&!f.bandTo&&t?.groundKind==='was'&&t.band==='low'&&!t.bandTo;
}
function groundWasDogfightPairs(f,t,paths){
  const [front,middle]=GROUND_WAS_ROLES[f.bodies.length/4];
  const [enemyFront,enemyMiddle]=GROUND_WAS_ROLES[t.bodies.length/4];
  const ends=[0,front,front+middle,f.bodies.length/2];
  const enemyEnds=[0,enemyFront,enemyFront+enemyMiddle,t.bodies.length/2];
  const roles=[[0,1,2],[1,0,2],[2,1,0]];
  return Array.from({length:f.bodies.length/2},(_,i)=>{
    const role=i<front?0:i<front+middle?1:2,row=i-ends[role];
    const pairs=roles[role].flatMap(r=>{
      const start=enemyEnds[r],count=enemyEnds[r+1]-start;
      return Array.from({length:count},(_,j)=>start+(row+j)%count);
    });
    const {lerp}=THREE.MathUtils;
    return {role,row,target:t,pairs,
      phase:paths.phaseSpread*hash(f.id,i,31),bearing:paths.angleSpread*hash(f.id,i,32),
      radius:lerp(...paths.radiusScale,(1+hash(f.id,i,33))/2),
      wander:Math.PI*hash(f.id,i,34)};
  });
}
function groundWasDogfightTarget(f,rules){
  if(!f?.alive||f.embarked||groundAbsent(f)||!groundWasBodyFlight(f)||f.bandTo||gameSec-f.groundMovedAt<.4)return null;
  const t=groundWasLowDuel(f,f.fireTarget)?f.fireTarget:groundWasSwarmTarget(f,rules);
  return t?.alive&&t.team!==f.team&&t.band===f.band&&!t.bandTo&&!t.embarked&&!groundAbsent(t)&&groundWasBodyFlight(t)?t:null;
}
// 近い組から両軍の組を結び、余った組は相手の組に1組ずつ加える。
function groundWasDogfightMatch(members,pairsByUnit,snapshots){
  const teams=[[],[]];
  for(const f of members){
    const bodies=snapshots.get(f);
    pairsByUnit.get(f).forEach((pair,i)=>{
      pair.target=null;pair.pairs=[];
      const a=bodies[2*i],b=bodies[2*i+1];
      if(!a.alive&&!b.alive)return;
      const pos=a.alive&&b.alive?a.pos.clone().lerp(b.pos,.5):(a.alive?a:b).pos;
      teams[f.team].push({f,pair,i,pos});
    });
  }
  const links=teams[0].flatMap(a=>teams[1].map(b=>({a,b,d:a.pos.distanceToSquared(b.pos)}))).sort((a,b)=>a.d-b.d);
  const assign=(a,b)=>{a.pair.target=b.f;a.pair.pairs=[b.i];};
  for(const {a,b} of links){
    if(a.pair.target||b.pair.target)continue;
    assign(a,b);assign(b,a);
  }
  const reinforced=new Set();
  for(const {a,b} of links){
    const [free,foe]=a.pair.target?[b,a]:[a,b];
    if(free.pair.target||reinforced.has(foe))continue;
    assign(free,foe);reinforced.add(foe);
  }
}
function groundWasDogfightStates(rules){
  const {dogfight:d,swarmLayout}=rules,contacts=new Map(),states=new Map(),groups=[];
  for(const f of fleets){
    const t=groundWasDogfightTarget(f,rules);
    if(t)contacts.set(f,t);
  }
  const nearby=new Set([...contacts].filter(([f,t])=>contacts.has(t)&&groundDistanceTo(f,t)<=d.mergeKm*GROUND_SCALE).map(([f])=>f));
  // 同じ空域の交戦につながる隊を残す。相手が離脱した隊は参加しない。
  let removed;
  do{
    removed=false;
    for(const f of nearby)if(!nearby.has(contacts.get(f))){nearby.delete(f);removed=true;}
  }while(removed);
  while(nearby.size){
    const first=nearby.values().next().value,members=[first];
    nearby.delete(first);
    for(const f of members)for(const t of nearby){
      if(t.band===f.band&&groundDistanceTo(f,t)<=d.mergeKm*GROUND_SCALE){members.push(t);nearby.delete(t);}
    }
    if(members.length>=3)groups.push(members);
  }
  const grouped=new Set(groups.flat());
  for(const [f,t] of contacts)if(!grouped.has(f)&&!grouped.has(t)&&contacts.get(t)===f){
    groups.push([f,t]);grouped.add(f);grouped.add(t);
  }
  for(const members of groups){
    members.sort((a,b)=>a.id-b.id);
    const low=members[0].band==='low',multi=members.length>2,mode=low?d.low:d;
    const scale=(members.length/2)**d.sizeExponent,outer=(low?mode.maxSpanKm:swarmLayout.maxSpanKm)*GROUND_SCALE*scale/2;
    let x=0,z=0;
    const snapshots=new Map();
    for(const f of members){
      x+=f.pos.x;z+=f.pos.z;
      // 同じ時点の位置を一度だけ読む。後で動かす隊にも移動前の位置・向きを渡す。
      snapshots.set(f,groundWasFlightTrack(f).bodies.map((b,i)=>({pos:b.pos.clone(),yaw:b.yaw,unit:f,index:i,alive:f.bodies[i].alive})));
    }
    x/=members.length;z/=members.length;
    const key=members.map(f=>f.id).join(',');
    const livePairs=multi?members.map(f=>f.bodies.reduce((mask,b,i)=>mask|(b.alive?1<<(i>>1):0),0)).join(','):null;
    const prior=members.find(f=>{
      const group=f.groundWasFlight?.dogfight?.group;
      return group?.key===key&&group.paths===mode.paths&&group.livePairs===livePairs;
    })?.groundWasFlight.dogfight.group;
    let pairsByUnit=prior?.pairsByUnit;
    if(!pairsByUnit){
      pairsByUnit=new Map(members.map(f=>[f,groundWasDogfightPairs(f,contacts.get(f),mode.paths)]));
      if(multi)groundWasDogfightMatch(members,pairsByUnit,snapshots);
    }
    const group={key,livePairs,paths:mode.paths,pairsByUnit,members,multi,low,x,z,outer};
    for(const f of members){
      const old=f.groundWasFlight?.dogfight;
      states.set(f,{group,target:contacts.get(f),low,at:old?.low===low?old.at:gameSec,
        x,z,outer,scale,pairs:pairsByUnit.get(f),friends:snapshots.get(f),snapshots});
    }
  }
  return states;
}
function groundWasDogfightAim(state,i,useLock=false){
  const {target,pairs}=state.pairs[i>>1],foes=state.snapshots.get(target),wing=i%2;
  if(!foes)return null;
  if(useLock){
    const locked=state.friends[i].unit.groundBodyTargets?.get(target)?.pairTargets[i>>1];
    if(foes[locked]?.alive&&(!state.group.multi||pairs.includes(locked>>1)))return foes[locked];
  }
  for(const pair of pairs){
    const j=2*pair+wing,k=2*pair+1-wing;
    if(foes[j].alive)return foes[j];
    if(foes[k].alive)return foes[k];
  }
  return null;
}
function groundWasBoostJump(time,jump,fallAt,fallSec){
  const {smootherstep:smooth,degToRad}=THREE.MathUtils;
  const lift=smooth(time,0,jump.riseSec)*(1-smooth(time,fallAt,fallAt+fallSec));
  const boost=smooth(time,0,.12)*(1-smooth(time,jump.riseSec-.12,jump.riseSec));
  return {lift,boost,pitch:-degToRad(jump.pitchDeg)*boost};
}
function groundWasBoostSlide(time,slide){
  const {smootherstep:smooth}=THREE.MathUtils;
  const holdUntil=slide.durationSec+(slide.holdSec??0);
  const rejoin=smooth(time,holdUntil,holdUntil+slide.rejoinSec);
  const move=smooth(time,0,slide.durationSec);
  const boost=smooth(time,0,.1)*(1-smooth(time,slide.durationSec-.15,slide.durationSec));
  return {rejoin,move,boost};
}
function groundWasAirEvasion(f,track,now){
  if(f.bandTo||f.band!=='cruise'&&f.band!=='low'){track.airEvasion=null;return null;}
  const cfg=groundRuleSet().wasCombat.aircraft,mode=cfg[f.band],ownHeight=groundAirPhysicalY(f.pos);
  const prior=track.airEvasion,settling=prior?.band===f.band&&prior.spreadUntil>now;
  let target=null,contacts=[],nearest=Infinity;
  for(const enemy of fleets){
    const air=enemy.groundAirSquad;
    if(enemy.team===f.team||!enemy.alive||enemy.embarked||groundAbsent(enemy)||!air||
       !['fighter','attack'].includes(enemy.groundKind)||!groundSeenBy(f.team,enemy))continue;
    const range=mode.noticeKm===undefined?groundAARange(f,enemy):mode.noticeKm*GROUND_SCALE;
    const nearby=air.bodies.filter((b,i)=>enemy.bodies[i].alive&&
      Math.hypot(b.pos.x-f.pos.x,b.pos.z-f.pos.z)<=range&&
      Math.abs(groundAirPhysicalY(b.pos)-ownHeight)<=mode.noticeHeightKm*GROUND_SCALE);
    const distance=Math.min(...nearby.map(b=>b.pos.distanceToSquared(f.pos)));
    if(distance<nearest){nearest=distance;target=enemy;contacts=nearby;}
  }
  if(!target){
    const canAim=prior?.band===f.band&&prior.target.alive&&!prior.target.embarked&&!groundAbsent(prior.target)&&now-prior.seenAt<=cfg.lingerSec;
    if(settling||canAim){
      for(const pair of prior.pairs){pair.incoming=null;if(!canAim)pair.aim=null;}
      return prior;
    }
    track.airEvasion=null;return null;
  }
  if(settling)prior.target=target;
  else if(prior?.target!==target||prior.band!==f.band){
    track.airEvasion={target,band:f.band,at:now,pairs:[]};
  }
  const state=track.airEvasion,positions=groundBodyPositions(f).positions;
  state.seenAt=now;
  const centers=Array.from({length:positions.length/2},(_,pair)=>{
    const lead=2*pair,wing=lead+1;
    return f.bodies[lead].alive&&f.bodies[wing].alive?positions[lead].clone().lerp(positions[wing],.5):
      positions[f.bodies[lead].alive?lead:wing];
  });
  for(const [pair,own] of centers.entries()){
    const p=state.pairs[pair]??={};
    p.aim=contacts.reduce((a,b)=>own.distanceToSquared(a.pos)<=own.distanceToSquared(b.pos)?a:b).pos.clone();
    if(f.band==='low'){
      const incoming=p.incoming=groundWasAirIncoming(own,contacts,cfg);
      if(incoming)incoming.lane=Math.abs(incoming.cross)<1e-6?(pair%2?1:-1):Math.sign(incoming.cross);
      if(incoming&&incoming.time<=cfg.threatLeadSec&&p.evade?.entry!==incoming.b.entryAim&&!(p.evade?.end>now)){
        const {durationSec,rejoinSec}=mode.slide;
        p.evade={entry:incoming.b.entryAim,at:now,end:now+durationSec+rejoinSec+cfg.wingDelaySec,
          dir:incoming.dir,lane:incoming.lane};
      }
    }
  }
  if(f.band==='cruise'&&!(state.spreadUntil>now)){
    const incoming=groundWasAirIncoming(f.pos,contacts,cfg);
    if(incoming&&incoming.time<=cfg.threatLeadSec&&state.spreadEntry!==incoming.b.entryAim){
      groundWasAirSpread(f,state,centers,incoming,now,cfg,mode.slide);
    }
  }
  return state;
}
function groundWasAirIncoming(own,contacts,cfg){
  let incoming=null;
  for(const b of contacts){
    if(!b.entryDir||!['approach','pull','dive'].includes(b.phase))continue;
    const dir=b.entryDir,dx=own.x-b.pos.x,dz=own.z-b.pos.z;
    const ahead=dx*dir.x+dz*dir.z,cross=dx*dir.z-dz*dir.x;
    const time=ahead/Math.max(1,b.speed*Math.cos(b.pitch));
    if(time<=0||time>=(incoming?.time??Infinity)||Math.abs(cross)>cfg.threatWidthKm*GROUND_SCALE)continue;
    incoming={b,dir,cross,time};
  }
  return incoming;
}
function groundWasAirSpread(f,state,centers,incoming,now,cfg,slide){
  const {dir,b}=incoming,{lerp,degToRad}=THREE.MathUtils;
  // 進入線に直角な並びの外側へ散らし、組どうしが横切らないようにする。
  const order=centers.map((p,i)=>({i,cross:p.x*dir.z-p.z*dir.x})).sort((a,b)=>a.cross-b.cross);
  state.spreadEntry=b.entryAim;state.spreadUntil=now;
  for(const [rank,{i}] of order.entries()){
    const side=(rank+.5)/order.length*2-1;
    const delay=(1+hash(f.id,i,43))/2*slide.staggerSec;
    const at=now+delay,end=at+slide.durationSec+slide.holdSec+slide.rejoinSec+cfg.wingDelaySec;
    const yaw=Math.atan2(dir.x,dir.z)+degToRad(slide.spreadDeg)*hash(f.id,i,45);
    state.pairs[i].evade={at,end,dir:groundAirDirection(yaw),lane:Math.sign(side),
      distanceKm:lerp(...slide.distanceKm,Math.abs(side))};
    state.spreadUntil=Math.max(state.spreadUntil,end);
  }
}
function groundWasAirSlide(f,pair,i,now,cfg,mode){
  const evade=pair.evade;
  if(!(evade?.end>now))return {offset:0,boost:0};
  const slide=groundWasBoostSlide(now-evade.at-(i%2)*cfg.wingDelaySec,mode.slide);
  const distance=(evade.distanceKm??THREE.MathUtils.lerp(...mode.slide.distanceKm,(1+hash(f.id,i,42))/2))*GROUND_SCALE;
  return {offset:evade.lane*slide.move*(1-slide.rejoin)*distance,boost:slide.boost,dir:evade.dir,lane:evade.lane};
}
function groundWasDogfightSlide(f,state,b,i,foe,own,x,z,time,slide){
  if(time<0||time>=slide.durationSec+slide.rejoinSec){b.duelSlide=null;return {x,z,boost:0};}
  const {lerp}=THREE.MathUtils,lane=i%2?1:-1;
  if(!b.duelSlide){
    const dx=(foe?.pos.x??state.x)-own.x,dz=(foe?.pos.z??state.z)-own.z;
    const yaw=dx||dz?Math.atan2(dx,dz):b.yaw;
    b.duelSlide={x:own.x,z:own.z,dx:lane*Math.cos(yaw),dz:-lane*Math.sin(yaw)};
  }
  const entry=b.duelSlide,{rejoin,move,boost}=groundWasBoostSlide(time,slide);
  const distance=lerp(...slide.distanceKm,(1+hash(f.id,i,42))/2)*GROUND_SCALE*move;
  return {x:lerp(entry.x+entry.dx*distance,x,rejoin),z:lerp(entry.z+entry.dz*distance,z,rejoin),boost};
}
function groundWasDogfightMove(f,state,b,i,now,forward,rules){
  const {dogfight:d,swarmAttitude:a}=rules;
  const {clamp,lerp,smootherstep:smooth}=THREE.MathUtils;
  const iPair=i>>1,wing=i%2,lane=wing?1:-1,pair=state.pairs[iPair],{role,row}=pair;
  const period=d.periodSec[role]+d.periodVariationSec*hash(f.id,iPair,0);
  const clock=now/period+pair.phase+role/3;
  const phase=clock*2*Math.PI,cycle=clock-wing*d.phaseLag/(2*Math.PI);
  const lap=Math.floor(cycle),u=cycle-lap;
  const drift=now/d.paths.wanderSec*2*Math.PI+pair.wander;
  const bearing=forward+pair.bearing+d.paths.turnWander*Math.sin(drift);
  const side=Math.sin(bearing),ahead=Math.cos(bearing);
  const radius=d.radiusKm[role]*pair.radius*state.scale,own=state.friends[i].pos;
  const foe=groundWasDogfightAim(state,i,state.group.multi);

  // 同じ組は横に並ぶ区間を持ち、進入時に左右へ開いて各機が受け持つ相手に向かう。
  const pass=d.pass,split=smooth(u,.13,pass.enter)*(1-smooth(u,pass.end,.96));
  const tangentX=Math.cos(phase),tangentZ=role===2?-Math.sin(phase):2*d.crossWidth*Math.cos(2*phase);
  const tangent=Math.hypot(tangentX,tangentZ)||1;
  const gap=lane*(d.pairGapKm/2+d.splitKm*split);
  const across=radius*Math.sin(phase)+gap*tangentZ/tangent+.012*Math.sin(phase*.73+i);
  const along=radius*(role===2?Math.cos(phase):d.crossWidth*Math.sin(2*phase))-gap*tangentX/tangent;
  const wander=d.paths.wanderKm*state.scale;
  let x=state.x+(across*ahead+along*side+wander*Math.cos(drift))*GROUND_SCALE,
    z=state.z+(along*ahead-across*side+wander*Math.sin(drift+pair.wander))*GROUND_SCALE;
  let height=clamp(d.heightKm[role]+d.heightWaveKm*Math.sin(phase+wing+row),d.minHeightKm,d.lowMaxHeightKm);

  // 前衛は相手の後ろを狙い、中衛は前衛を援護する。後衛はふだん外周に残る。
  if(role===0&&foe){
    const tail=d.pursuit*split;
    x=lerp(x,foe.pos.x-Math.sin(foe.yaw)*d.tailKm*GROUND_SCALE,tail);
    z=lerp(z,foe.pos.z-Math.cos(foe.yaw)*d.tailKm*GROUND_SCALE,tail);
  }else if(role===1){
    const [front]=GROUND_WAS_ROLES[f.bodies.length/4];
    const first=2*(row%front);
    const guard=f.bodies[first+wing].alive?state.friends[first+wing]:
      f.bodies[first+1-wing].alive?state.friends[first+1-wing]:null;
    if(guard){
      const cover=d.pursuit*split;
      x=lerp(x,guard.pos.x-Math.sin(guard.yaw)*d.coverKm*GROUND_SCALE,cover);
      z=lerp(z,guard.pos.z-Math.cos(guard.yaw)*d.coverKm*GROUND_SCALE,cover);
    }
  }
  const attack=foe?smooth(u,pass.start,pass.enter)*(1-smooth(u,pass.exit,pass.end)):0;
  if(attack){
    // 最短点を相手の横に置き、手前から奥まで走り抜ける。
    const travel=lerp(-pass.alongKm,pass.alongKm,clamp((u-pass.start)/(pass.end-pass.start),0,1));
    const clearance=lane*lerp(...pass.gapKm,(1+hash(f.id,i,44))/2);
    x=lerp(x,foe.pos.x+(travel*side+clearance*ahead)*GROUND_SCALE,attack);
    z=lerp(z,foe.pos.z+(travel*ahead-clearance*side)*GROUND_SCALE,attack);
  }

  // 組の開始をずらし、片方ずつ2周に1度、高く跳んで通過の半ばで低空に戻る。
  const jump=d.jump,jumpTime=(u-jump.start)*period;
  const jumping=(lap+i+row+role+f.team)%2===0;
  const leap=groundWasBoostJump(jumping?jumpTime:-1,jump,(pass.enter-jump.start)*period,jump.diveSec);
  const jumpReady=leap.lift,thrust=leap.boost;
  height+=jumpReady*lerp(...jump.riseKm,(1+hash(f.id,i,43))/2);

  const slide=d.slide,slideTime=(u-slide.start)*period;
  const slip=groundWasDogfightSlide(f,state,b,i,foe,own,x,z,slideTime,slide);
  x=slip.x;z=slip.z;
  const slideBoost=slip.boost;

  const outer=state.outer,offset=Math.hypot(x-state.x,z-state.z);
  if(offset>outer){x=lerp(state.x,x,outer/offset);z=lerp(state.z,z,outer/offset);}
  const passing=attack>.6&&own.distanceToSquared(foe.pos)<=(pass.fireKm*GROUND_SCALE)**2;
  return {x:x-f.pos.x,z:z-f.pos.z,height:clamp(height,d.minHeightKm,jumpReady?d.maxHeightKm:d.lowMaxHeightKm)*GROUND_SCALE,outer,
    bank:lerp([a.frontRoll,a.middleRoll,a.rearRoll][role]*Math.cos(phase),lane*a.frontRoll,slideBoost),
    pitch:leap.pitch,boost:Math.max(thrust,slideBoost),slideBoost,jumpReady,
    passBlend:Math.max(attack,slideTime>=0&&slideTime<slide.durationSec?1:0),
    foe:foe?.pos,passTarget:passing?foe.index:null,passUnit:passing?foe.unit:null};
}
function groundWasLowDogfightMove(f,state,b,i,forward,d){
  const {lerp,smootherstep:smooth}=THREE.MathUtils;
  const pair=state.pairs[i>>1],{role,row}=pair,wing=i%2,lane=wing?1:-1,pass=d.pass;
  const period=d.periodSec[role]+d.periodVariationSec*hash(f.id,i>>1,0);
  const delay=wing*d.wingDelaySec+b.stagger*d.unitDelaySec;
  const cycle=(gameSec-state.at-delay)/period+row*d.pairPhase+role/3+pair.phase;
  const lap=Math.floor(cycle),u=cycle-lap;
  const drift=(gameSec-state.at)/d.paths.wanderSec*2*Math.PI+pair.wander;
  const bearing=forward+pair.bearing+d.paths.turnWander*Math.sin(drift),dx=Math.sin(bearing),dz=Math.cos(bearing);
  const run=smooth(u,pass.start,pass.end),back=smooth(u,pass.turn,pass.returnAt);
  const along=pass.alongKm*pair.radius*state.scale*(2*(run-back)-1);
  const split=smooth(u,0,pass.enter)*(1-smooth(u,pass.exit,pass.returnAt));
  const turn=smooth(u,pass.end,pass.turn)*(1-back);
  const across=lane*(d.pairGapKm/2+d.splitKm*split+d.turnWidthKm*turn);
  const wander=d.paths.wanderKm*state.scale;
  let x=state.x+(dx*along+dz*across+wander*Math.cos(drift))*GROUND_SCALE,
    z=state.z+(dz*along-dx*across+wander*Math.sin(drift+pair.wander))*GROUND_SCALE;
  const level=lane*(f.team===1?-1:1)*(lap%2?-1:1);
  const dive=smooth(u,pass.enter,pass.exit),rise=smooth(u,0,pass.enter);
  const height=level*lerp(...d.heightKm,b.stagger)*(rise-2*dive+smooth(u,pass.turn,1))+
    d.heightWaveKm*Math.sin(2*Math.PI*u+i)+d.turnClimbKm*turn;

  const assigned=groundWasDogfightAim(state,i);
  if(assigned){
    const tail=d.tailKm*GROUND_SCALE;
    x=lerp(x,assigned.pos.x-Math.sin(assigned.yaw)*tail,d.pursuit*turn);
    z=lerp(z,assigned.pos.z-Math.cos(assigned.yaw)*tail,d.pursuit*turn);
  }
  const foe=groundWasDogfightAim(state,i,true)??assigned,own=state.friends[i].pos;
  const slip=groundWasDogfightSlide(f,state,b,i,foe,own,x,z,(u-d.slide.start)*period,d.slide);
  const passBlend=smooth(u,pass.start,pass.enter)*(1-smooth(u,pass.exit,pass.end));
  return {x:slip.x,z:slip.z,height,turn,aim:foe?.index,passUnit:foe?.unit,foe:foe?.pos,passBlend,slideBoost:slip.boost,
    bank:lane*d.turnBank*Math.max(turn,slip.boost),boost:Math.max(passBlend,turn,slip.boost)};
}
// 反転時の役割: 先頭の小隊が前衛、最後列の小隊が後衛（1小隊のときは前2機・後2機）。
function groundWasReverseRole(i,count){
  if(count<=4)return i<2?'front':'rear';
  const platoons=Math.ceil(count/4),p=Math.floor(i/4);
  return p===0?'front':p===platoons-1?'rear':'middle';
}
// 小隊の位置の癖に、機体ごと・軸ごとの周期と旋回・反転の癖を重ねる。
function groundWasCruiseTracks(f,spec,heading,drift,turn,rev){
  const {lerp}=THREE.MathUtils,ground=f.groundTrack;
  const sin=Math.sin(heading),cos=Math.cos(heading);
  return spec.offsets.map(([sx,sz],i)=>{
    const platoon=groundBodyRandom(f,15000+Math.floor(i/4)),unit=groundBodyRandom(f,16000+i);
    const sample=([min,max])=>lerp(min,max,unit());
    const wave=range=>({amplitude:sample(range),phase:unit()*2*Math.PI,rate:2*Math.PI/sample(drift.periodSec)});
    const gap=Math.min(...spec.offsets.map(([x,z],j)=>j===i?Infinity:Math.hypot(x-sx,z-sz)))*spec.size;
    const x=sx*spec.size,z=sz*spec.size,offset=ground?.off[i];
    const role=groundWasReverseRole(i,spec.offsets.length);
    const side=Math.sign(sx)||(i%2?-1:1);
    const revDelay=role==='front'?sample(rev.frontDelaySec):role==='rear'?sample(rev.rearDelaySec):sample(rev.middleDelaySec);
    const revDur=role==='front'?sample(rev.frontDurationSec):role==='rear'?sample(rev.rearDurationSec):sample(rev.middleDurationSec);
    return {
      pos:new THREE.Vector3(f.pos.x+(offset?.x??x*cos+z*sin),f.pos.y+GROUND_BODY_LIFT,f.pos.z+(offset?.z??z*cos-x*sin)),
      vel:new THREE.Vector3(),course:heading,yaw:ground?.yaw[i]??heading,pitch:0,bank:0,boost:0,passFiring:false,reverseFire:false,gap,
      dx:platoon()+unit()-1,dz:platoon()+unit()-1,
      driftX:wave(drift.drift),driftZ:wave(drift.drift),driftY:wave(drift.height),
      stagger:unit(),turnSpeed:sample(turn.speed),turnResponse:sample(turn.courseResponse),
      arc:sample(turn.arc)*(unit()<.5?-1:1),breakup:0,
      enterSec:sample(turn.enterSec),rejoinSec:sample(turn.rejoinSec),transfer:null,
      role,revSide:side,revDelay,revDur,revArc:sample(rev.middleArcL),
      revLane:(unit()*2-1),revHeight:(i%2?1:-1)*(.5+.5*unit()),
      rearCoverSec:sample(rev.rearCoverSec),revStart:null
    };
  });
}
// 位置と速度が連続するよう、減衰する加速度で各軸の行き先へ近づく。
function groundWasFollow(track,axis,goal,follow,velocity,slowDecay,fastDecay){
  const error=track.pos[axis]-goal,slow=(track.vel[axis]+velocity*error)/(velocity-follow),fast=error-slow;
  track.pos[axis]=goal+slow*slowDecay+fast*fastDecay;
  track.vel[axis]=-follow*slow*slowDecay-velocity*fast*fastDecay;
}
// 機どうしが3Dで重ならないように位置を押し離し、水平半径と地表の余裕を守る。
function groundWasSeparate(points,alive,centerX,centerZ,sepXZ,sepY,maxRadius,minY,passes=6,gain=.52,maxMove=Infinity){
  const n=points.length;
  for(let pass=0;pass<passes;pass++){
    for(let i=0;i<n;i++){
      if(!alive[i])continue;
      const a=points[i];
      for(let j=i+1;j<n;j++){
        if(!alive[j])continue;
        const b=points[j];
        let dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;
        let nx=dx/sepXZ,ny=dy/sepY,nz=dz/sepXZ,q=Math.hypot(nx,ny,nz);
        if(q>=1)continue;
        if(q<1e-5){nx=i%2?1:-1;ny=(i-j)%2?.5:-.5;nz=0;q=Math.hypot(nx,ny,nz);}
        const push=(1-q)*gain/q;
        let px=nx*push*sepXZ,py=ny*push*sepY,pz=nz*push*sepXZ;
        if(Number.isFinite(maxMove)){
          const mag=Math.hypot(px,py,pz);
          if(mag>maxMove){const k=maxMove/mag;px*=k;py*=k;pz*=k;}
        }
        a.x+=px;a.y+=py;a.z+=pz;
        b.x-=px;b.y-=py;b.z-=pz;
      }
    }
    for(let i=0;i<n;i++){
      if(!alive[i])continue;
      const g=points[i];
      if(maxRadius>0){
        const ox=g.x-centerX,oz=g.z-centerZ,r=Math.hypot(ox,oz);
        if(r>maxRadius){const k=maxRadius/r;g.x=centerX+ox*k;g.z=centerZ+oz*k;}
      }
      if(g.y<minY[i])g.y=minY[i];
    }
  }
}
// 交戦周回中に機どうしが近づきすぎないよう押し離し、各機の輪の半径と高さの範囲を守る。
function groundWasSwarmSeparate(points,alive,centerX,centerZ,outers,minYs,maxYs,pairGap,unitGap,sepXZ,sepY,avoidY,passes=4,gain=.55,maxMove=Infinity){
  const n=points.length,{clamp}=THREE.MathUtils;
  const pairXZ=Math.max(sepXZ,pairGap),unitXZ=Math.max(sepXZ,unitGap),needY=Math.max(sepY,avoidY);
  for(let pass=0;pass<passes;pass++){
    let moved=false;
    for(let i=0;i<n;i++){
      if(!alive[i])continue;
      const a=points[i];
      for(let j=i+1;j<n;j++){
        if(!alive[j])continue;
        const b=points[j],samePair=(i>>1)===(j>>1),needXZ=samePair?pairXZ:unitXZ;
        const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;
        const h2=dx*dx+dz*dz,y2=dy*dy;
        const q2=h2/(needXZ*needXZ)+y2/(needY*needY),d2=h2+y2;
        const pairClose=samePair&&d2<pairGap*pairGap;
        if(!pairClose&&q2>=1)continue;
        moved=true;
        let px=0,py=0,pz=0;
        if(pairClose){
          const dh=Math.sqrt(h2),ux=dh>1e-5?dx/dh:Math.cos(i*1.7+j),uz=dh>1e-5?dz/dh:Math.sin(i*1.7+j);
          const push=(pairGap-Math.sqrt(d2))*gain;
          px=ux*push;pz=uz*push;
          if(Math.abs(dy)<avoidY)py=(dy===0?(i%2?1:-1):Math.sign(dy))*(avoidY-Math.abs(dy))*.35*gain;
        }else{
          const q=Math.sqrt(q2),push=(1-q)*gain/Math.max(q,1e-5);
          px=dx*push;py=dy*push;pz=dz*push;
        }
        if(Number.isFinite(maxMove)){
          const mag=Math.hypot(px,py,pz);
          if(mag>maxMove){const k=maxMove/mag;px*=k;py*=k;pz*=k;}
        }
        a.x+=px;a.y+=py;a.z+=pz;
        b.x-=px;b.y-=py;b.z-=pz;
      }
    }
    for(let i=0;i<n;i++){
      if(!alive[i])continue;
      const g=points[i],ox=g.x-centerX,oz=g.z-centerZ,r2=ox*ox+oz*oz,lim=outers[i];
      if(lim>0&&r2>lim*lim){const k=lim/Math.sqrt(r2);g.x=centerX+ox*k;g.z=centerZ+oz*k;moved=true;}
      const y=clamp(g.y,minYs[i],maxYs[i]);
      if(g.y!==y){g.y=y;moved=true;}
    }
    if(!moved)break;
  }
}
// 中隊ごとの補間のあと、別中隊の機体も同じ空域で押し離す。
function groundWasDogfightSeparate(group,rules){
  const sep=rules.swarmManeuvers.pair,drift=rules.cruiseDrift,{x,z,outer,low}=group;
  const height=low?rules.dogfight.low.heightLimitKm:rules.dogfight.maxHeightKm;
  const bandY=low?groundBandHeight('low'):0,minHeight=low?-height:rules.dogfight.minHeightKm;
  const companies=[];
  for(const f of group.members){
    const track=f.groundWasFlight;
    if(track?.dogfight?.group!==group)continue;
    const dims=groundBodyDims(track.spec);
    companies.push({f,points:track.bodies.filter((b,i)=>f.bodies[i].alive).map(b=>b.pos),
      width:Math.max(sep.unitClearKm*GROUND_SCALE,dims.wid*drift.sepWidth),
      height:Math.max(sep.avoidHeightKm*GROUND_SCALE,dims.ht*drift.sepHeight)});
  }
  const {clamp}=THREE.MathUtils,minY=minHeight*GROUND_SCALE,maxY=height*GROUND_SCALE;
  const fit=(p,px,py,pz)=>{
    // 参戦の途中で空域の外にいる機も、押し離しでさらに外へ出さない。
    const ox=p.x-x,oz=p.z-z,rx=ox+px,rz=oz+pz,lim2=Math.max(outer*outer,ox*ox+oz*oz),r2=rx*rx+rz*rz;
    const k=r2>lim2?Math.sqrt(lim2/r2):1;
    p.x=x+rx*k;p.z=z+rz*k;
    const surface=groundSurfaceHeight(p.x,p.z)+bandY;
    p.y=clamp(p.y+py,surface+minY,surface+maxY);
  };
  for(let pass=0;pass<rules.dogfight.separationPasses;pass++){
    let moved=false;
    for(let i=0;i<companies.length;i++)for(let j=i+1;j<companies.length;j++){
      const a=companies[i],b=companies[j],width=Math.max(a.width,b.width),height=Math.max(a.height,b.height);
      for(const p of a.points)for(const q of b.points){
        let dx=p.x-q.x,dy=p.y-q.y,dz=p.z-q.z;
        if(Math.abs(dx)>=width||Math.abs(dy)>=height||Math.abs(dz)>=width)continue;
        let distance=(dx*dx+dz*dz)/(width*width)+dy*dy/(height*height);
        if(distance>=1)continue;
        if(distance<1e-8){
          const bearing=Math.PI*hash(a.f.id,b.f.id,35);
          dx=Math.sin(bearing)*width;dy=0;dz=Math.cos(bearing)*width;
          distance=0;
        }else{
          distance=Math.sqrt(distance);
          dx/=distance;dy/=distance;dz/=distance;
        }
        const push=(1-distance)/2;
        fit(p,dx*push,dy*push,dz*push);fit(q,-dx*push,-dy*push,-dz*push);
        moved=true;
      }
    }
    if(!moved)break;
  }
}
function groundWasBodyFlight(f){return !!f.bodies&&f.groundBodySpec?.form==='wasArrow'&&groundWasFlying(f);}
function groundWasFlightTrack(f){
  if(f.groundWasFlight?.spec===f.groundBodySpec)return f.groundWasFlight;
  const spec=f.groundBodySpec,heading=Math.atan2(f.heading.x,f.heading.z),rules=groundRuleSet().wasCombat;
  return {spec,last:f.pos.clone(),heading,course:heading,turnAt:-Infinity,steeredAt:-Infinity,
    turnOriginHeading:heading,swarm:null,swarmAt:gameSec,reverse:null,
    bodies:groundWasCruiseTracks(f,spec,heading,rules.cruiseDrift,rules.cruiseTurn,rules.cruiseReverse)};
}
// 巡航の位置・姿勢をゲーム時計で進める。描画はこの状態を読むだけ。
function groundWasCruiseStep(f,track,targets,now,dt,heading,dogfight=null,airFight=null){
  const prev=track.last,priorHeading=track.heading;
  const {wasCombat:rules,wasFlight}=groundRuleSet(),M=rules.cruiseMotion,D=rules.cruiseDrift,T=rules.cruiseTurn,R=rules.cruiseReverse;
  const {clamp,lerp,degToRad,smoothstep,smootherstep}=THREE.MathUtils;
  const moved=now-f.groundMovedAt<.4;
  // 周回が中隊の命令位置を離れて逃げる目標を追い続けないよう、武器と陣形の届く範囲で回る。
  const swarm=airFight?null:groundWasSwarmTarget(f,rules);
  if(airFight)dogfight=null;
  const swarmCenter=dogfight??swarm?.pos;
  const centerY=f.pos.y+GROUND_BODY_LIFT;
  const mx=f.pos.x-prev.x,mz=f.pos.z-prev.z,distance=Math.hypot(mx,mz),speed=wasFlight.speed.cruise;
  const shift=distance>Math.max(3,speed*dt*4)?f.pos.clone().sub(prev):null;
  // 直進中の隊に遅れ続けないよう、実際に進んだ量から少し先の並びを狙う。
  const lead=dt>0&&!shift?M.leadSec/Math.max(dt,distance/speed):0;
  const centerX=f.pos.x+mx*lead,centerZ=f.pos.z+mz*lead;
  const priorCenterY=prev.y+GROUND_BODY_LIFT;
  if(shift){
    track.reverse=null;
    for(const b of track.bodies){b.pos.add(shift);b.vel.set(0,0,0);b.revStart=null;}
  }
  if(track.swarm!==swarm||track.dogfight?.group?.key!==dogfight?.group.key){
    track.swarm=swarm;track.swarmAt=now;track.reverse=null;
    // 周回への出入りは、そのとき飛んでいる位置・速度から機体ごとの時間でつなぐ。
    for(const b of track.bodies){b.transfer={x:b.pos.x-prev.x,y:b.pos.y-priorCenterY,z:b.pos.z-prev.z};b.revStart=null;b.duelSlide=null;}
  }
  track.dogfight=dogfight&&{target:dogfight.target,x:dogfight.x,z:dogfight.z,pairs:dogfight.pairs,group:dogfight.group};
  const landing=f.bandTo==='ground';
  if(landing||airFight)track.reverse=null;
  const airMode=rules.aircraft.cruise;
  // 等価な角度へ折り返さずに積み上げ、180度の折り返しでも各機が同じ側から旋回する。
  const turn=groundWrap(heading-track.heading);
  const reverseAngle=degToRad(R.minAngleDeg);
  if(Math.abs(turn)>1e-6){
    if(now-track.steeredAt>Math.max(T.staggerSec,R.turnWindowSec)){
      track.turnAt=now-dt;
      track.turnOriginHeading=track.heading;
    }
    track.steeredAt=now;
  }
  const totalTurn=Math.abs(groundWrap(heading-track.turnOriginHeading));
  const shouldReverse=!landing&&!swarm&&!airFight&&!shift&&Math.abs(turn)>1e-6&&
    (Math.abs(turn)>=reverseAngle||totalTurn>=reverseAngle&&(!track.reverse||now-track.reverse.at>R.turnWindowSec));
  track.heading=heading;track.course+=turn;
  const c=Math.cos(heading),s=Math.sin(heading);
  if(shouldReverse){
    const oldHeading=Math.abs(turn)>=reverseAngle?priorHeading:track.turnOriginHeading;
    const revCenterX=f.pos.x,revCenterZ=f.pos.z,revCenterY=centerY;
    track.reverse={at:now-dt,oldHeading,hadTarget:!!f.fireTarget?.alive};
    track.turnOriginHeading=heading;
    for(const b of track.bodies){
      const rx=b.pos.x-revCenterX,rz=b.pos.z-revCenterZ;
      b.revStart={x:rx*c-rz*s,y:b.pos.y-revCenterY,z:rx*s+rz*c};
      b.course=track.course;b.breakup=0;
    }
  }
  const dims=groundBodyDims(track.spec);
  const baseSpacing=window.WOS_GROUND_RULES.wasCombat.cruiseSpacing;
  const spacing=landing?1:groundWasCruiseSpacing();
  const spacingScale=landing?1:spacing/baseSpacing;
  // 漂い幅と反転弧の広がりは基準間隔 0.12（旧既定）比で算出し、採用した 0.36（3倍）で見本と同じ動きを保つ。
  const motionScale=landing?1:spacing/.12;
  const driftScale=1+D.spacingGain*Math.max(0,motionScale-1);
  const driftFactor=landing?0:moved?1:D.idleFactor;
  const maxRadius=landing?0:T.maxRadiusKm*GROUND_SCALE*spacingScale;
  const steer=T.maxYawSpeed*dt,steerK=1-Math.exp(-T.yawResponse*dt);
  const settle=1-Math.exp(-T.settleResponse*dt);
  const wave=({rate,phase})=>Math.sin(now*rate+phase);
  const dx=swarmCenter?swarmCenter.x-f.pos.x:0,dz=swarmCenter?swarmCenter.z-f.pos.z:0,forward=dx||dz?Math.atan2(dx,dz):heading;
  const velocity=Math.max(M.velocityResponse,M.follow+1,rules.swarmAttitude.maneuverResponse+1),fastDecay=Math.exp(-velocity*dt);
  const aimBlend=swarm?smoothstep(now-track.swarmAt,0,M.swarmAimSec):0;
  const rev=track.reverse;
  if(rev&&f.fireTarget?.alive)rev.hadTarget=true;
  const minClearance=D.minClearanceKm*GROUND_SCALE;
  const alive=track.bodies.map((_,i)=>!!f.bodies[i]?.alive);
  const goals=[],minYs=[],meta=[],swarmOuters=[],swarmMaxYs=[];
  let pair,anyReversing=false;
  track.bodies.forEach((b,i)=>{
    b.boost=0;b.slideBoost=0;b.passFiring=false;b.passTarget=null;b.passUnit=null;
    const slot=targets[i];
    const delay=b.stagger*T.staggerSec;
    const gap=b.gap*spacing,scatter=landing?0:D.scatter*Math.min(dims.len,gap*1.6+dims.len*.35);
    const swayX=wave(b.driftX),swayZ=wave(b.driftZ),swayY=wave(b.driftY);
    const driftAmpXZ=dims.len*driftScale*driftFactor;
    const driftAmpY=dims.ht*driftScale*driftFactor;
    // 上下の揺れで足先が地表に沈まないよう、揺れの中心を少し上へ寄せる。
    const liftBias=Math.max(0,b.driftY.amplitude*driftAmpY-.10);
    const baseLocalX=slot.x*spacing+b.dx*scatter+swayX*b.driftX.amplitude*driftAmpXZ;
    const baseLocalZ=slot.z*spacing+b.dz*scatter+swayZ*b.driftZ.amplitude*driftAmpXZ;
    const baseGoalY=centerY+liftBias+swayY*b.driftY.amplitude*driftAmpY;
    let goalX,goalY=baseGoalY,goalZ;
    let yaw,pitch=0,bank=0,response=M.follow,aim=0,heightResponse=response,reverseFire=false,forceTurnSign=0,foe=null;
    const transfer=b.transfer?smootherstep(now-track.swarmAt-delay,0,swarm?b.enterSec:b.rejoinSec):1;
    if(rev&&!swarm&&!landing){
      const elapsed=now-rev.at;
      const moveU=smootherstep(elapsed-b.revDelay,0,b.revDur);
      const startRel=b.revStart||{x:baseLocalX,y:0,z:baseLocalZ};
      // 新しい向きの座標で、前衛は中を速く抜け、中の小隊は弧を描き、最後列は外へ開いてゆっくり引く。
      let ctrlX=(startRel.x+baseLocalX)*.5,ctrlY=(startRel.y+liftBias)*.5,ctrlZ=(startRel.z+baseLocalZ)*.5;
      if(b.role==='front'){
        ctrlX=lerp(ctrlX,b.revLane*R.frontLaneL*dims.len*Math.min(2,motionScale),.75);
        ctrlZ=lerp(startRel.z,baseLocalZ,.58);
        ctrlY+=R.frontHeightH*dims.ht*(.4+.6*Math.abs(b.revHeight));
      }else if(b.role==='rear'){
        const spread=R.rearSpreadL*dims.len*Math.min(2.2,motionScale);
        ctrlX+=b.revSide*spread;
        ctrlZ=lerp(startRel.z,baseLocalZ,.32);
        ctrlY-=R.rearHeightH*dims.ht*.35;
      }else{
        const arcW=b.revArc*dims.len*Math.min(2.2,motionScale);
        ctrlX+=b.revSide*arcW;
        ctrlY+=b.revHeight*dims.ht*.35;
      }
      const inv=1-moveU;
      const lx=inv*inv*startRel.x+2*inv*moveU*ctrlX+moveU*moveU*baseLocalX;
      const ly=inv*inv*startRel.y+2*inv*moveU*ctrlY+moveU*moveU*(liftBias+swayY*b.driftY.amplitude*driftAmpY);
      const lz=inv*inv*startRel.z+2*inv*moveU*ctrlZ+moveU*moveU*baseLocalZ;
      goalX=centerX+(lx*c+lz*s);
      goalZ=centerZ+(-lx*s+lz*c);
      goalY=centerY+ly;
      // 接線の向き（新しい向き基準）で弧に沿った機首と傾きを決める。
      const tx=2*inv*(ctrlX-startRel.x)+2*moveU*(baseLocalX-ctrlX);
      const tz=2*inv*(ctrlZ-startRel.z)+2*moveU*(baseLocalZ-ctrlZ);
      const tangentYaw=Math.hypot(tx,tz)>1e-4?heading+Math.atan2(tx,tz):heading;
      const pulse=4*moveU*inv;
      b.course=track.course;b.breakup=0;
      if(b.role==='rear'){
        const hasTarget=!!f.fireTarget?.alive;
        const holdRear=hasTarget?elapsed<R.rearMaxCoverSec:rev.hadTarget?elapsed<R.rearMinCoverSec:elapsed<b.rearCoverSec;
        if(holdRear){
          reverseFire=true;
          if(hasTarget){
            const aimX=f.fireTarget.pos.x-b.pos.x,aimZ=f.fireTarget.pos.z-b.pos.z;
            yaw=aimX||aimZ?Math.atan2(aimX,aimZ):rev.oldHeading;
          }else yaw=rev.oldHeading;
          pitch=R.rearPitch;
          bank=clamp(-tx/Math.max(.5,b.revDur)*R.bankPerTurn,-.35,.35);
        }else{
          yaw=heading+D.yawSway*swayX*driftFactor;
          forceTurnSign=b.revSide;
        }
        if(moveU<1||holdRear)anyReversing=true;
      }else{
        yaw=moveU<.88?lerp(tangentYaw,heading,smoothstep(moveU,.55,.88)):heading+D.yawSway*swayX*driftFactor;
        forceTurnSign=b.revSide;
        if(b.role==='front')pitch=R.frontPitch*pulse;
        bank=clamp(-tx/Math.max(.5,b.revDur)*R.bankPerTurn*pulse,-.42,.42);
        if(moveU<1)anyReversing=true;
      }
    }else{
      const turnDt=clamp(now-track.turnAt-delay,0,dt),angleLeft=track.course-b.course;
      const demand=angleLeft*(1-Math.exp(-b.turnResponse*turnDt)),step=clamp(demand,-b.turnSpeed*turnDt,b.turnSpeed*turnDt);
      b.course+=step;
      b.breakup+=(Math.min(1,Math.abs(angleLeft)/(Math.PI/2))-b.breakup)*settle;
      // 弧の半径と進み具合を機ごとに変え、向きがそろった後もずれが残ってから収まる。
      const arc=landing?0:b.arc*b.breakup*Math.max(gap,dims.len*.45);
      const radius=Math.hypot(slot.x,slot.z)||1;
      const x=baseLocalX+slot.x/radius*arc;
      const z=baseLocalZ+slot.z/radius*arc;
      const offset=Math.hypot(x,z);
      const fit=!landing&&maxRadius>0&&offset>maxRadius?maxRadius/offset:1;
      const sin=Math.sin(b.course),cos=Math.cos(b.course);
      goalX=centerX+(x*cos+z*sin)*fit;
      goalZ=centerZ+(-x*sin+z*cos)*fit;
      yaw=b.course+D.yawSway*swayX*driftFactor;
      bank=dt?-step/dt*T.bankPerTurn:0;
    }
    if(swarm){
      if(!dogfight&&i%2===0)pair=groundWasSwarmPair(f,swarm,targets,i,now,forward,rules);
      const target=dogfight?groundWasDogfightMove(f,dogfight,b,i,now,forward,rules):pair[i%2];
      goalX=f.pos.x+target.x;goalZ=f.pos.z+target.z;
      // 高度の行き先は各機の地表から取り、巡航との切替でも速度を引き継ぐ。
      goalY=groundSurfaceHeight(b.pos.x,b.pos.z)+target.height;
      response=lerp(4,rules.swarmAttitude.maneuverResponse,target.passBlend);
      heightResponse=lerp(response,rules.swarmAttitude.maneuverResponse,target.jumpReady);
      pitch=target.pitch;bank=target.bank;aim=dogfight?0:target.aim*aimBlend*transfer;
      foe=target.foe??null;
      b.boost=target.boost*transfer;
      b.slideBoost=(target.slideBoost??0)*transfer;
      b.passTarget=target.passTarget??null;b.passUnit=target.passUnit??null;
      b.passFiring=aim===1||b.passTarget!==null;
      swarmOuters[i]=target.outer;
      swarmMaxYs[i]=groundSurfaceHeight(goalX,goalZ)+(dogfight?rules.dogfight.maxHeightKm:rules.swarmManeuvers.maxHeightKm)*GROUND_SCALE;
    }
    if(b.transfer&&!landing){
      goalX=lerp(centerX+b.transfer.x,goalX,transfer);
      goalY=lerp(centerY+b.transfer.y,goalY,transfer);
      goalZ=lerp(centerZ+b.transfer.z,goalZ,transfer);
      if(transfer===1)b.transfer=null;
    }
    if(airFight&&alive[i]){
      const pair=airFight.pairs[i>>1],cfg=rules.aircraft;
      const jump=airMode.jump,delay=lerp(...jump.delaySec,(1+hash(f.id,i,44))/2);
      const time=now-(pair.evade?.at??Infinity)-delay;
      const leap=groundWasBoostJump(time,jump,jump.riseSec,jump.fallSec);
      const rise=lerp(...jump.riseKm,(1+hash(f.id,i,46))/2)*leap.lift;
      const slide=groundWasAirSlide(f,pair,i,now,cfg,airMode);
      if(slide.dir){
        const x=goalX+slide.dir.z*slide.offset,z=goalZ-slide.dir.x*slide.offset;
        if(groundPass(groundMapX(x),groundMapY(z),'air')){goalX=x;goalZ=z;}
      }
      goalY=groundSurfaceHeight(goalX,goalZ)+(airMode.minHeightKm+rise)*GROUND_SCALE;
      foe=pair.aim;pitch=leap.pitch;
      bank=rules.swarmAttitude.frontRoll*(slide.lane??0)*slide.boost;
      b.boost=Math.max(leap.boost,slide.boost);b.slideBoost=slide.boost;
      heightResponse=rules.swarmAttitude.maneuverResponse;
    }
    const clearance=airFight?airMode.minHeightKm*GROUND_SCALE:
      dogfight?rules.dogfight.minHeightKm*GROUND_SCALE:GROUND_BODY_LIFT+minClearance;
    const minY=landing?-Infinity:groundSurfaceHeight(goalX,goalZ)+clearance;
    if(goalY<minY)goalY=minY;
    goals.push({x:goalX,y:goalY,z:goalZ});
    minYs.push(minY);
    meta.push({yaw,pitch,bank,response,heightResponse,aim,reverseFire,forceTurnSign,foe});
  });
  if(rev&&!anyReversing){
    track.reverse=null;
    for(const b of track.bodies)b.revStart=null;
  }
  // 巡航中（着陸・交戦周回を除く）は、機どうしが3Dで重ならないように目標位置をよける。
  const sepXZ=dims.wid*D.sepWidth,sepY=dims.ht*D.sepHeight;
  const transferring=track.bodies.some(b=>b.transfer);
  const clampRadius=transferring?0:maxRadius+(airFight?airMode.slide.distanceKm[1]*GROUND_SCALE:0);
  if(!landing&&!swarm){
    // 現在の実位置が近すぎる組にも押し戻しを足し、すれ違い時の重なりを防ぐ。
    for(let i=0;i<goals.length;i++){
      if(!alive[i])continue;
      const bi=track.bodies[i].pos;
      for(let j=i+1;j<goals.length;j++){
        if(!alive[j])continue;
        const bj=track.bodies[j].pos;
        const dx=bi.x-bj.x,dy=bi.y-bj.y,dz=bi.z-bj.z;
        const nx=dx/sepXZ,ny=dy/sepY,nz=dz/sepXZ,q=Math.hypot(nx,ny,nz);
        if(q>=1.15||q<1e-5)continue;
        const push=(1.15-q)*.65/q;
        goals[i].x+=nx*push*sepXZ;goals[i].y+=ny*push*sepY;goals[i].z+=nz*push*sepXZ;
        goals[j].x-=nx*push*sepXZ;goals[j].y-=ny*push*sepY;goals[j].z-=nz*push*sepXZ;
      }
    }
    groundWasSeparate(goals,alive,centerX,centerZ,sepXZ,sepY,clampRadius,minYs,8,.52);
  }else if(!landing&&swarm&&!transferring){
    // 交戦周回中も、同組の2機や他組との接近時に実位置と目標位置の両方から少しよける（各機の輪と高さは保つ）。
    const pCfg=rules.swarmManeuvers.pair,pairGap=pCfg.minGapKm*GROUND_SCALE,unitGap=pCfg.unitClearKm*GROUND_SCALE;
    const avoidY=pCfg.avoidHeightKm*GROUND_SCALE;
    for(let i=0;i<goals.length;i++){
      if(!alive[i])continue;
      const bi=track.bodies[i].pos;
      for(let j=i+1;j<goals.length;j++){
        if(!alive[j])continue;
        const bj=track.bodies[j].pos,need=((i>>1)===(j>>1)?Math.max(sepXZ,pairGap):Math.max(sepXZ,unitGap))*1.35;
        const dx=bi.x-bj.x,dy=bi.y-bj.y,dz=bi.z-bj.z,d2=dx*dx+dy*dy+dz*dz;
        if(d2>=need*need)continue;
        const d3=Math.sqrt(d2);
        const dh=Math.hypot(dx,dz);
        const ux=dh>1e-5?dx/dh:Math.cos(i*1.7+j),uz=dh>1e-5?dz/dh:Math.sin(i*1.7+j);
        const push=(need-d3)*.85;
        goals[i].x+=ux*push;goals[i].z+=uz*push;goals[j].x-=ux*push;goals[j].z-=uz*push;
        if(Math.abs(dy)<avoidY){
          const sgn=dy===0?(i%2?1:-1):Math.sign(dy),py=(avoidY-Math.abs(dy))*.45;
          goals[i].y+=sgn*py;goals[j].y-=sgn*py;
        }
      }
    }
    groundWasSwarmSeparate(goals,alive,swarmCenter.x,swarmCenter.z,swarmOuters,minYs,swarmMaxYs,pairGap,unitGap,sepXZ,sepY,avoidY,6,.55);
  }
  track.bodies.forEach((b,i)=>{
    const g=goals[i],m=meta[i];
    b.reverseFire=m.reverseFire;
    if(dt>0){
      const slowDecay=Math.exp(-m.response*dt);
      groundWasFollow(b,'x',g.x,m.response,velocity,slowDecay,fastDecay);
      groundWasFollow(b,'z',g.z,m.response,velocity,slowDecay,fastDecay);
      groundWasFollow(b,'y',g.y,m.heightResponse,velocity,Math.exp(-m.heightResponse*dt),fastDecay);
      let yaw=m.yaw,pitch=m.pitch,bank=m.bank,limit=steer,gain=steerK;
      if(swarm){
        const aimPoint=m.foe??swarm.pos;
        const aimX=aimPoint.x-b.pos.x,aimZ=aimPoint.z-b.pos.z;
        yaw=aimX||aimZ?Math.atan2(aimX,aimZ):b.yaw;
        limit=rules.swarmAttitude.maxYawSpeed*dt;gain=1;
        if(dogfight){
          const limit=rules.dogfight.pitchLimit;
          const aimPitch=clamp(Math.atan2(b.pos.y-aimPoint.y,Math.hypot(aimX,aimZ)),-limit,limit);
          pitch=lerp(pitch,aimPitch,aimBlend);
        }else if(m.aim){
          const [low,high]=rules.swarmManeuvers.front.firePass.pitchDeg;
          const swarmY=swarm.pos.y+(swarm.band==='ground'?GROUND_BODY_LIFT:0);
          pitch=lerp(pitch,clamp(Math.atan2(b.pos.y-swarmY,Math.hypot(aimX,aimZ)),degToRad(low),degToRad(high)),m.aim);
        }
      }
      if(airFight&&m.foe){
        const dx=m.foe.x-b.pos.x,dz=m.foe.z-b.pos.z;
        yaw=Math.atan2(dx,dz);limit=rules.swarmAttitude.maxYawSpeed*dt;gain=1;
        pitch+=clamp(Math.atan2(b.pos.y-m.foe.y,Math.hypot(dx,dz)),-rules.dogfight.pitchLimit,rules.dogfight.pitchLimit);
      }
      let turnLeft=groundWrap(yaw-b.yaw);
      if(m.forceTurnSign&&Math.abs(turnLeft)>2.8)turnLeft=Math.abs(turnLeft)*m.forceTurnSign;
      b.yaw+=lerp(clamp(turnLeft*gain,-limit,limit),turnLeft,m.aim);
      b.pitch+=(pitch-b.pitch)*lerp(1-Math.exp(-m.heightResponse*dt),1,m.aim);
      b.bank+=(bank-b.bank)*(1-slowDecay);
    }
  });
  // 実位置でもすれ違い時の重なりを滑らかに押し戻す（dt=0 の瞬間は動かさない）。
  if(dt>0&&!landing&&!swarm){
    const alpha=.5*(1-Math.exp(-(D.sepRate??26)*dt));
    groundWasSeparate(track.bodies.map(b=>b.pos),alive,f.pos.x,f.pos.z,sepXZ,sepY,clampRadius,minYs,4,alpha,speed*dt*.55);
  }else if(dt>0&&!landing&&swarm&&!transferring){
    const pCfg=rules.swarmManeuvers.pair,alpha=.5*(1-Math.exp(-42*dt));
    groundWasSwarmSeparate(track.bodies.map(b=>b.pos),alive,swarmCenter.x,swarmCenter.z,swarmOuters,minYs,swarmMaxYs,
      pCfg.minGapKm*GROUND_SCALE,pCfg.unitClearKm*GROUND_SCALE,sepXZ,sepY,pCfg.avoidHeightKm*GROUND_SCALE,6,alpha,speed*dt*.95);
  }
  const heightLimits=airFight?airMode:dogfight?rules.dogfight:null;
  if(heightLimits&&dt>0)for(const b of track.bodies){
    const surface=groundSurfaceHeight(b.pos.x,b.pos.z);
    b.pos.y=clamp(b.pos.y,surface+heightLimits.minHeightKm*GROUND_SCALE,surface+heightLimits.maxHeightKm*GROUND_SCALE);
  }
}
function groundWasLowAirStep(f,track,targets,dt,heading,airFight){
  const {wasCombat,wasFlight}=groundRuleSet(),cfg=wasCombat.aircraft,mode=cfg.low;
  const {clamp,lerp}=THREE.MathUtils,c=Math.cos(heading),s=Math.sin(heading);
  const now=gameSec,k=1-Math.exp(-wasCombat.swarmAttitude.maneuverResponse*dt);
  for(const [i,b] of track.bodies.entries()){
    if(!f.bodies[i].alive)continue;
    const slot=targets[i],pair=airFight.pairs[i>>1],slide=groundWasAirSlide(f,pair,i,now,cfg,mode);
    const dir=slide.dir??pair.incoming?.dir??groundAirDirection(heading);
    const period=lerp(...mode.periodSec,(1+hash(f.id,i,45))/2);
    const phase=(now-airFight.at-(i>>1)*cfg.pairDelaySec-(i%2)*cfg.wingDelaySec)/period*Math.PI*2;
    const goal=new THREE.Vector3(f.pos.x+slot.x*c+slot.z*s,f.pos.y+GROUND_BODY_LIFT+slot.y,f.pos.z+slot.z*c-slot.x*s);
    // 近づく機の進路の横に待ち、通過前に同じ側へ強く噴射する。
    const line=pair.incoming?.b.pos;
    const lane=slide.lane??pair.incoming?.lane??0;
    const cross=line?(goal.x-line.x)*dir.z-(goal.z-line.z)*dir.x:0;
    const standOff=lane*clamp(mode.standOffKm*GROUND_SCALE-cross*lane,0,mode.standOffKm*GROUND_SCALE);
    const side=standOff+Math.sin(phase)*mode.swayKm*GROUND_SCALE+slide.offset;
    const along=Math.sin(phase*.8)*mode.swayKm*GROUND_SCALE;
    const x=goal.x+dir.z*side+dir.x*along,z=goal.z-dir.x*side+dir.z*along;
    if(groundPass(groundMapX(x),groundMapY(z),'air')){goal.x=x;goal.z=z;}
    goal.y+=mode.heightKm*GROUND_SCALE*(Math.cos(phase)*(1-slide.boost)+(i%2?1:-1)*slide.boost);
    const delta=goal.sub(b.pos).multiplyScalar(k).clampLength(0,wasFlight.speed.low*dt);
    b.pos.add(delta);
    if(dt>0)b.vel.copy(delta).divideScalar(dt);
    const aim=pair.aim,dx=aim.x-b.pos.x,dz=aim.z-b.pos.z;
    const limit=wasCombat.swarmAttitude.maxYawSpeed*dt;
    b.yaw+=clamp(groundWrap(Math.atan2(dx,dz)-b.yaw),-limit,limit);
    b.pitch=lerp(b.pitch,clamp(Math.atan2(b.pos.y-aim.y,Math.hypot(dx,dz)),-wasCombat.dogfight.pitchLimit,wasCombat.dogfight.pitchLimit),k);
    b.bank=lerp(b.bank,lane*wasCombat.swarmAttitude.frontRoll*slide.boost,k);
    b.boost=b.slideBoost=slide.boost;
    b.transfer=null;b.revStart=null;b.course=heading;b.breakup=0;b.reverseFire=false;b.passFiring=false;b.passTarget=null;
  }
}
function groundWasLowDogfightStep(f,track,state,dt,heading,rules){
  const d=rules.dogfight.low,{clamp,lerp,degToRad}=THREE.MathUtils;
  if(!track.dogfight?.low||track.dogfight.target!==state.target){
    for(const b of track.bodies)b.duelSlide=null;
  }
  track.dogfight={target:state.target,low:true,at:state.at,x:state.x,z:state.z,pairs:state.pairs,group:state.group};
  track.swarm=state.target;track.reverse=null;track.airEvasion=null;
  track.heading=track.course=track.turnOriginHeading=heading;
  const dx=state.x-f.pos.x,dz=state.z-f.pos.z;
  const forward=dx||dz?Math.atan2(dx,dz):f.team*Math.PI;
  const altitude=groundBandHeight('low'),heightLimit=d.heightLimitKm*GROUND_SCALE,outer=state.outer;
  const velocity=rules.cruiseMotion.velocityResponse,fast=Math.exp(-velocity*dt);
  const alive=f.bodies.map(b=>b.alive),points=track.bodies.map(b=>b.pos);
  const minYs=[],maxYs=[],outers=[],moves=[];
  for(const [i,b] of track.bodies.entries()){
    if(!alive[i])continue;
    const move=moves[i]=groundWasLowDogfightMove(f,state,b,i,forward,d);
    const {x,z}=move,rx=x-state.x,rz=z-state.z,r=Math.hypot(rx,rz);
    const fit=r>outer?outer/r:1;
    // 離れた位置からの参戦でも、各機が外から詰めて空域へ入る。
    outers[i]=Math.max(outer,Math.hypot(b.pos.x-state.x,b.pos.z-state.z));
    const follow=lerp(d.response,d.passResponse,Math.max(move.passBlend,move.slideBoost,move.turn));
    const slow=Math.exp(-follow*dt),baseY=groundSurfaceHeight(b.pos.x,b.pos.z)+altitude;
    groundWasFollow(b,'x',state.x+rx*fit,follow,velocity,slow,fast);
    groundWasFollow(b,'z',state.z+rz*fit,follow,velocity,slow,fast);
    groundWasFollow(b,'y',baseY+move.height*GROUND_SCALE,follow,velocity,slow,fast);
    const localY=groundSurfaceHeight(b.pos.x,b.pos.z)+altitude;
    minYs[i]=localY-heightLimit;maxYs[i]=localY+heightLimit;
  }
  const pair=rules.swarmManeuvers.pair,dims=groundBodyDims(track.spec),drift=rules.cruiseDrift;
  if(dt>0)groundWasSwarmSeparate(points,alive,state.x,state.z,outers,minYs,maxYs,
    pair.minGapKm*GROUND_SCALE,pair.unitClearKm*GROUND_SCALE,dims.wid*drift.sepWidth,dims.ht*drift.sepHeight,
    pair.avoidHeightKm*GROUND_SCALE,4,.5,d.pass.alongKm*GROUND_SCALE*dt);
  for(const [i,b] of track.bodies.entries()){
    if(!alive[i])continue;
    const move=moves[i],baseY=groundSurfaceHeight(b.pos.x,b.pos.z)+altitude;
    b.pos.y=clamp(b.pos.y,baseY-heightLimit,baseY+heightLimit);
    const {foe,turn}=move,aimX=(foe?.x??state.x)-b.pos.x,aimZ=(foe?.z??state.z)-b.pos.z;
    const yaw=Math.atan2(aimX,aimZ),yawStep=rules.swarmAttitude.maxYawSpeed*dt;
    b.yaw+=clamp(groundWrap(yaw-b.yaw),-yawStep,yawStep);
    const aimPitch=foe?clamp(Math.atan2(b.pos.y-foe.y,Math.hypot(aimX,aimZ)),-rules.dogfight.pitchLimit,rules.dogfight.pitchLimit):0;
    const pose=1-Math.exp(-d.passResponse*dt);
    b.pitch=lerp(b.pitch,lerp(aimPitch,-degToRad(d.turnPitchDeg),turn),pose);
    b.bank=lerp(b.bank,move.bank,pose);
    b.boost=move.boost;b.slideBoost=move.slideBoost;
    b.passFiring=!!foe&&move.passBlend>.5&&b.pos.distanceToSquared(foe)<=(d.pass.fireKm*GROUND_SCALE)**2;
    b.passTarget=b.passFiring?move.aim:null;b.passUnit=b.passFiring?move.passUnit:null;
    b.transfer=null;b.revStart=null;b.course=heading;b.breakup=0;b.reverseFire=false;
  }
}
function groundWasFlightStep(f,dt,dogfight=null){
  if(!groundWasBodyFlight(f)){f.groundWasFlight=null;return;}
  const track=f.groundWasFlight=groundWasFlightTrack(f),heading=Math.atan2(f.heading.x,f.heading.z);
  const targets=groundLayouts(f)[groundFormationState(f)];
  const airFight=dogfight?.low?null:groundWasAirEvasion(f,track,gameSec);
  if(dogfight?.low){
    groundWasLowDogfightStep(f,track,dogfight,dt,heading,groundRuleSet().wasCombat);
  }else if(f.band==='cruise'||f.bandTo==='cruise'){
    groundWasCruiseStep(f,track,targets,gameSec,dt,heading,dogfight,airFight);
  }else if(airFight){
    groundWasLowAirStep(f,track,targets,dt,heading,airFight);
    track.swarm=null;track.dogfight=null;track.reverse=null;
  }else{
    // 低空・高空は従来の陣形へ指数補間する。高度は中隊と一緒に上下する。
    const c=Math.cos(heading),s=Math.sin(heading),k=1-Math.exp(-4*dt);
    const dx=f.pos.x-track.last.x,dy=f.pos.y-track.last.y,dz=f.pos.z-track.last.z;
    track.bodies.forEach((b,i)=>{
      const slot=targets[i];
      b.pos.x+=dx+(f.pos.x+slot.x*c+slot.z*s-b.pos.x-dx)*k;
      b.pos.y+=dy+(f.pos.y+GROUND_BODY_LIFT+slot.y-b.pos.y-dy)*k;
      b.pos.z+=dz+(f.pos.z+slot.z*c-slot.x*s-b.pos.z-dz)*k;
      b.yaw+=groundWrap(heading+slot.yaw-b.yaw)*k;b.pitch*=1-k;b.bank*=1-k;
      b.vel.set(0,0,0);b.transfer=null;b.revStart=null;b.course=heading;b.breakup=0;
      b.passFiring=false;b.passTarget=null;b.reverseFire=false;b.boost=0;b.slideBoost=0;b.duelSlide=null;
    });
    track.heading=track.course=track.turnOriginHeading=heading;
    track.swarm=null;track.dogfight=null;track.reverse=null;track.airEvasion=null;
  }
  track.last.copy(f.pos);
  f.groundBodyGeometry=null;
}
function groundFormationDraw(f,now){
  const model=f.groundModel,data=model.userData,form=data.formation;
  // Legacy drawing/capture helpers can build a model without groundInitUnit.
  if(!data.last){data.last=f.pos.clone();data.movedAt=-Infinity;data.drawnAt=now;}
  const dt=Math.max(0,now-data.drawnAt);data.drawnAt=now;
  if(data.last.distanceToSquared(f.pos)>1e-10)data.movedAt=now;
  if(!form||f.groundDrone){data.last.copy(f.pos);return;}
  const a1=Math.atan2(f.heading.x,f.heading.z),c1=Math.cos(a1),s1=Math.sin(a1);
  const a0=data.drawYaw??a1;
  data.drawYaw=a1;data.last.copy(f.pos);
  if(groundAirSquad(f)){
    const {air,positions}=groundBodyPositions(f);
    form.bodies.forEach((body,i)=>{
      const b=air.bodies[i],p=positions[i],x=p.x-f.pos.x,z=p.z-f.pos.z;
      body.position.set(x*c1-z*s1,p.y-f.pos.y,x*s1+z*c1);
      body.rotation.set(-b.pitch,b.yaw-a1,b.bank,'YXZ');
      for(const moving of data.pose?.move[i]||[]){moving.position.copy(body.position);moving.rotation.copy(body.rotation);}
    });
    return;
  }
  if(groundWasBodyFlight(f)){
    const g=groundBodyPositions(f),track=g.flight;
    const config=groundRuleSet().wasCombat.thrust;
    data.wasSwarming=!!track.swarm;
    form.bodies.forEach((body,i)=>{
      const b=track.bodies[i],p=g.positions[i],x=p.x-f.pos.x,z=p.z-f.pos.z;
      body.position.set(x*c1-z*s1,p.y-f.pos.y-GROUND_BODY_LIFT,x*s1+z*c1);
      const {pitch,bank}=groundWasDrawThrust(body,p,b.yaw,now,config,b.boost);
      body.rotation.set(pitch,b.yaw-a1,bank,'YXZ');
      body.userData.wasPassFiring=b.passFiring;
      body.userData.wasPassTarget=b.passTarget;
      body.userData.wasPassUnit=b.passUnit;
      body.userData.wasReverseFire=b.reverseFire;
      body.userData.wasPlumePosition=p;
    });
    return;
  }
  data.wasSwarming=false;
  for(const body of form.bodies){
    body.userData.wasReverseFire=false;
    delete body.userData.wasThrust;
    delete body.userData.wasPlumePosition;
  }
  // 地上の体: 体ごとの動き（groundBodyTrack）の位置と向きへそのまま置く（ならしは動きの側で済んでいる）
  if(!groundBodyCentered(f)){
    const g=groundBodyPositions(f);
    form.bodies.forEach((body,i)=>{
      const p=g.positions[i]||g.positions[0],wx=p.x-f.pos.x,wz=p.z-f.pos.z;
      body.position.x=wx*c1-wz*s1;body.position.z=wx*s1+wz*c1;body.position.y=0;
      body.rotation.y=(g.yaws?.[i]??a1)-a1;body.rotation.x=0;body.rotation.z=0;
      for(const moving of data.pose?.move[i]||[]){moving.position.copy(body.position);moving.rotation.copy(body.rotation);}
    });
    return;
  }
  const targets=groundLayouts(f,form.spec)[groundFormationState(f,now)],k=1-Math.exp(-4*dt);
  const da=a1-a0,cd=Math.cos(da),sd=Math.sin(da);
  const march=targets.march,marchBodies=march?groundBodyPositions(f):null;
  form.bodies.forEach((body,i)=>{
    let target=targets[i];
    if(body.rotation.order!=='XYZ')body.rotation.reorder('XYZ');
    // 隊の向きが変わった分だけ体を逆に回し、世界では元の所に残す。
    if(da){const x=body.position.x,z=body.position.z;body.position.x=x*cd-z*sd;body.position.z=x*sd+z*cd;body.rotation.y-=da;}
    if(march){
      const p=marchBodies.positions[i]||marchBodies.positions[0],wx=p.x-f.pos.x,wz=p.z-f.pos.z;
      target={...target,x:wx*c1-wz*s1,z:wx*s1+wz*c1,yaw:(p.yaw??marchBodies?.yaws?.[i]??a1)-a1};
    }
    body.rotation.x*=1-k;
    body.position.x+=(target.x-body.position.x)*k;body.position.y+=((target.y||0)-body.position.y)*k;body.position.z+=(target.z-body.position.z)*k;
    body.rotation.y+=groundWrap(target.yaw-body.rotation.y)*k;
    body.rotation.z+=((target.bank||0)-body.rotation.z)*k;
    for(const moving of data.pose?.move[i]||[]){moving.position.copy(body.position);moving.rotation.copy(body.rotation);}
  });
}
function groundAliveBodies(f){return f.bodies?f.bodies.reduce((n,b)=>n+(b.alive?1:0),0):f.ships.length;}
// Cache only geometry. HP and living-body choices are read afresh after every hit.
// 地上・飛行それぞれの動きから得た位置と向きを、同じ時刻・同じ位置なら再利用する。
function groundBodyPositions(f){
  if(groundAirSquad(f)){
    const air=groundAirSquadTrack(f);
    return f.groundBodyGeometry??= {air,x:f.pos.x,z:f.pos.z,positions:air.bodies.map(b=>b.pos.clone()),yaws:air.bodies.map(b=>b.yaw)};
  }
  const spec=f.groundBodySpec,c=f.groundBodyGeometry,centered=groundBodyCentered(f);
  const flying=groundWasBodyFlight(f),flightState=f.groundWasFlight;
  if(c&&c.t===gameSec&&c.x===f.pos.x&&c.y===f.pos.y&&c.z===f.pos.z&&c.band===f.band&&c.spec===spec&&
    c.centered===centered&&c.flying===flying&&c.flightState===flightState&&(centered||flying||c.track===f.groundTrack&&c.ht===f.groundTrack?.t))return c;
  const flight=flying?groundWasFlightTrack(f):null,T=centered||flying?null:groundBodyTrack(f);
  let positions,yaws=null;
  if(flight){
    const dx=f.pos.x-flight.last.x,dy=f.pos.y-flight.last.y,dz=f.pos.z-flight.last.z;
    positions=flight.bodies.map(b=>new THREE.Vector3(b.pos.x+dx,b.pos.y+dy,b.pos.z+dz));
    yaws=flight.bodies.map(b=>b.yaw);
  }else if(!T)positions=[f.pos.clone()];
  else{positions=T.off.map(o=>new THREE.Vector3(f.pos.x+o.x,f.pos.y,f.pos.z+o.z));yaws=T.yaw.slice();}
  return f.groundBodyGeometry={x:f.pos.x,y:f.pos.y,z:f.pos.z,band:f.band,t:gameSec,spec,centered,flying,flightState,flight,track:T,ht:T?.t,positions,yaws};
}
function groundBodyPosition(f,i){const positions=groundBodyPositions(f).positions;return (positions[i]||positions[0]).clone();}
function groundBodySync(f){f.hpPool=f.bodies.reduce((n,b)=>n+(b.alive?b.hp:0),0);}
function groundBodyHit(f,body,amt,showLoss=true){
  if(!body?.alive||!(amt>0))return;
  body.hp=Math.max(0,body.hp-amt);
  if(body.hp===0){
    body.alive=false;
    if(showLoss||f.groundKind==='was'&&['cruise','low'].includes(f.band)){
      const i=f.bodies.indexOf(body),at=groundVisualBodyPoint(f,i,groundBodyPosition(f,i));
      groundVisualLoss(f,at,i);
    }
  }
  groundBodySync(f);
  if(!body.alive)groundMoraleBodyLoss(f);
}
function groundBodiesSpread(f,amt){
  if(!f.bodies){f.hpPool=Math.max(0,f.hpPool-amt);return;}
  const live=groundAliveBodies(f);if(live)for(const b of f.bodies)if(b.alive)groundBodyHit(f,b,amt/live);groundBodySync(f);
}
function groundBodyShot(f,i,t,j,range,fromGeometry=groundBodyPositions(f),toGeometry=groundBodyPositions(t),aa=false){
  const from=fromGeometry.positions[i]||fromGeometry.positions[0],pos=toGeometry.positions[j]||toGeometry.positions[0];
  const dx=from.x-pos.x,dz=from.z-pos.z;
  if(!(range>=0&&dx*dx+dz*dz<=range*range))return null;
  if(aa&&!groundAAHeightAllows(f,pos,t,from))return null;
  const pass=toGeometry.air;
  if(aa&&f.band==='low'&&pass?.wasPass&&pass.target===f&&
    !['dive','exit','climb'].includes(pass.bodies[j].phase))return null;
  const eyeHeight=groundSightRules().eyeHeight;
  const eye=(unit,p,g)=>g.flight||g.air?p:unit.groundKind==='drone'?groundEye(unit):({x:p.x,z:p.z,y:groundHeight(p.x,p.z)+groundBandHeight(unit.band)+eyeHeight});
  const toEye=eye(t,pos,toGeometry),air=fromGeometry.air;
  if(air){
    const b=air.bodies[i];
    if(air.target!==t||!['dive','tail'].includes(b.phase)||!groundAirBodyInFront(b,from,toEye))return null;
  }
  if(!groundClearLine(eye(f,from,fromGeometry),toEye))return null;
  return {from,pos,b:t.bodies?.[j]??null,j,flight:!!(fromGeometry.flight||toGeometry.flight||air||toGeometry.air),targetYaw:toGeometry.yaws?.[j]};
}
function groundBodyTarget(f,i,t,range,aa=false,assignedPair=null){
  const fromGeometry=groundBodyPositions(f),toGeometry=groundBodyPositions(t);
  const mask=t.bodies?t.bodies.reduce((n,b,j)=>n+(b.alive?2**j:0),0):1;
  // Reuse a ray only within this simulation instant and with identical geometry/live slots.
  // A moving squad, a formation change, or a newly destroyed target invalidates it immediately.
  const cache=f.groundBodyTargets||(f.groundBodyTargets=new Map());
  let entry=cache.get(t);
  if(!entry||entry.fromFlight!==fromGeometry.flight||entry.toFlight!==toGeometry.flight){
    entry={fromFlight:fromGeometry.flight,toFlight:toGeometry.flight,rows:[],pairTargets:[]};
    cache.set(t,entry);
  }
  const {pairTargets}=entry,rows=assignedPair===null?entry.rows:(entry.assignedRows??=[]);
  const duel=!!(fromGeometry.flight&&toGeometry.flight),pair=i>>1;
  const leader=2*pair,aimFrom=duel?(f.bodies[leader].alive?leader:leader+1):i;
  const locked=duel?pairTargets[pair]:undefined;
  const old=rows[i];if(old&&old.time===gameSec&&old.from===fromGeometry&&old.to===toGeometry&&old.mask===mask&&old.range===range&&
    old.aimFrom===aimFrom&&old.buildings===groundBuildings&&old.aa===aa&&old.assignedPair===assignedPair)return old.hit;
  const flight=!!(fromGeometry.flight||toGeometry.flight);
  let best=locked!==undefined&&(assignedPair===null||(locked>>1)===assignedPair)&&t.bodies[locked]?.alive&&
    (!aa||groundAAHeightAllows(f,toGeometry.positions[locked],t,fromGeometry.positions[i]))?locked:-1;
  let hit=null;
  if(best<0){
    const from=fromGeometry.positions[aimFrom]||fromGeometry.positions[0];
    let dist2=Infinity;
    const count=assignedPair===null?(t.bodies?t.bodies.length:1):2*assignedPair+2;
    for(let j=assignedPair===null?0:2*assignedPair;j<count;j++){
      if(t.bodies&&!t.bodies[j].alive)continue;
      const p=toGeometry.positions[j]||toGeometry.positions[0];
      const dx=from.x-p.x,dz=from.z-p.z,dy=flight?from.y-p.y:0,d=dx*dx+dz*dz+dy*dy;
      if(d>=dist2)continue;
      // 航空機の組み合わせでは近い機体が射界外や遮蔽物の裏なら、次に近い体も調べる。
      if(aa||fromGeometry.air||toGeometry.air){
        const candidate=groundBodyShot(f,i,t,j,range,fromGeometry,toGeometry,aa);
        if(!candidate)continue;
        hit=candidate;
      }
      best=j;dist2=d;
    }
  }
  if(best>=0&&!hit)hit=groundBodyShot(f,i,t,best,range,fromGeometry,toGeometry,aa);
  // 組で1機を狙い、撃墜まで維持する。射程・射線は撃つ機体ごとに確かめる。
  if(duel&&hit)pairTargets[pair]=best;
  rows[i]={time:gameSec,from:fromGeometry,to:toGeometry,mask,range,aimFrom,buildings:groundBuildings,aa,assignedPair,hit};return hit;
}
function groundBodyInRange(f,t,range,aa=false){
  return f.bodies?f.bodies.some((b,i)=>b.alive&&groundBodyTarget(f,i,t,range,aa)):!!groundBodyTarget(f,0,t,range,aa);
}
// 受け持ちのない組は、長機を基準に乱戦内の近くにいる撃てる機体を探す。
function groundWasDogfightFreeShot(f,i,group){
  const from=groundBodyPositions(f),leader=i&~1;
  const origin=from.positions[f.bodies[leader].alive?leader:leader+1];
  let closest=null,distance=Infinity;
  for(const t of group.members){
    if(t.team===f.team||!t.alive||t.groundWasFlight?.dogfight?.group!==group||!groundSeenBy(f.team,t))continue;
    const to=groundBodyPositions(t),range=groundTargetRange(f,t);
    for(const [j,b] of t.bodies.entries()){
      if(!b.alive)continue;
      const d=origin.distanceToSquared(to.positions[j]);
      if(d>=distance)continue;
      const hit=groundBodyShot(f,i,t,j,range,from,to);
      if(hit){closest={t,hit};distance=d;}
    }
  }
  return closest;
}
function groundBodyReach(g){
  if(g.reach!==undefined)return g.reach;
  let r2=0;
  for(const p of g.positions){const dx=p.x-g.x,dz=p.z-g.z;r2=Math.max(r2,dx*dx+dz*dz);}
  return g.reach=Math.sqrt(r2);
}
function groundBodiesWithinReach(f,t,range){
  return groundDistanceTo(f,t)<=range+groundBodyReach(groundBodyPositions(f))+groundBodyReach(groundBodyPositions(t));
}
function groundUsesFlightBodies(f,t){return groundWasBodyFlight(f)||groundWasBodyFlight(t)||groundAirSquad(f)||groundAirSquad(t);}
function groundShotInRange(f,t,range,aa=false){
  if(!(range>0))return false;
  if(!groundUsesFlightBodies(f,t))return groundDistanceTo(f,t)<=range&&(!aa||groundAAHeightAllows(f,t.pos,t))&&groundLineOfSight(f,t);
  // 離れた候補は各体の組み合わせや射線を調べる前に、陣形全体の広がりで除く。
  return groundBodiesWithinReach(f,t,range)&&groundBodyInRange(f,t,range,aa);
}
function groundAnyBodyCanFire(f,t){
  if(!f.bodies)return true;
  const mode=groundFireMode(f,t);
  if(mode!=='direct')return mode==='indirect';
  return groundUsesFlightBodies(f,t)||groundBodyInRange(f,t,groundTargetRange(f,t));
}
function groundWeaponInterval(weapon){
  return groundRules().fireEvery*(weapon?.fireFactor??1);
}
function groundBodyIdleClock(f,timer){
  if(timer==='shotT'&&groundAirSquad(f))return;
  // Keep the seeded phases while there is no target, rather than making every clock wait at zero.
  for(const b of f.bodies)if(b.alive&&b[timer]<=0)b[timer]=groundRules().fireEvery;
}
function groundBodyDirectShot(f,i,t,hit,aa,weapon){
  const flight=f.groundAirSquad;
  if(!aa&&flight?.intercept&&flight.target===t)flight.bodies[i].interceptFired=true;
  groundVisualDirect(f,i,t,hit.j,hit.from,hit.pos,aa,weapon);
  groundFireDirect(f,t,1/groundBodiesPerPlatoon(f),aa,hit.b,weapon);
  groundSupplyShot(f,false,1/f.bodies0);
}
function groundBodyFire(f,primary,dt,aa=false){
  const duel=!aa&&groundWasDuelDirect(f,primary);
  const lowDuel=!aa&&groundWasLowDuel(f,primary),gatling=duel||lowDuel;
  // バルカンと88 mm砲は、対地戦から切り替わってもそれぞれの射撃間隔を引き継ぐ。
  const timer=aa?'aaT':gatling?'parallelT':'shotT',extraTimer=gatling?'shotT':'parallelT';
  const range=aa?groundAARange(f,primary):groundTargetRange(f,primary);
  const dogfight=f.groundWasFlight?.dogfight;
  const multi=gatling&&dogfight?.group?.multi&&dogfight.group.members.includes(primary);
  const flight=groundWasBodyFlight(f)||groundWasBodyFlight(primary);
  const parallel=!aa&&!flight?groundParallelWeapons(f,primary):[];
  const hasParallel=!lowDuel&&(flight?!aa&&(f.weapons??groundRuleSet().unitTypes[f.groundKind]?.weapons)?.some(w=>w.parallel):parallel.length>0);
  for(const [i,b] of f.bodies.entries()){
    b[timer]=Math.max(0,(b[timer]??0)-dt);
    if(!aa&&b[extraTimer]!==undefined)b[extraTimer]=Math.max(0,b[extraTimer]-dt);
    if(!b.alive||!primary.alive)continue;
    const rocket=!aa&&!gatling&&b.groundRocket;
    // ロケットの発射間隔と再装填は、通常武器の射撃間隔とは別にゲーム時刻で進む。
    const mainDue=b[timer]<=0||!!(rocket&&rocket.readyAt<=gameSec+1e-8);
    const parallelDue=hasParallel&&(b[extraTimer]??0)<=0;
    if(!aa&&!hasParallel&&(b[extraTimer]??1)<=0)b[extraTimer]=groundRules().fireEvery;
    if(!mainDue&&!parallelDue)continue;
    const assignment=multi?dogfight.pairs[i>>1]:null;
    const freeShot=assignment&&!assignment.target?groundWasDogfightFreeShot(f,i,dogfight.group):null;
    if(assignment&&!assignment.target&&!freeShot)continue;
    const t=assignment?.target??freeShot?.t??primary,assignedPair=assignment?.pairs[0]??null;
    if(assignment?.target&&(!t.alive||t.groundWasFlight?.dogfight?.group!==dogfight.group||!groundSeenBy(f.team,t)))continue;
    const reach=t===primary?range:groundTargetRange(f,t);
    const hit=freeShot?.hit??groundBodyTarget(f,i,t,reach,aa,assignedPair);if(!hit)continue;
    if(mainDue){
      const weapon=groundDirectWeapon(f,t,aa,b,hit);
      if(b[timer]<=0||weapon.rounds){
        b[timer]=groundWeaponInterval(weapon);
        if(weapon.rounds){
          const roundsLeft=(rocket?.roundsLeft||weapon.rounds)-1;
          b.groundRocket={roundsLeft,readyAt:gameSec+(roundsLeft?weapon.roundInterval:weapon.reloadSec)};
        }
        groundBodyDirectShot(f,i,t,hit,aa,weapon);
      }
    }
    if(parallelDue&&t.alive){
      const shot=hit.b&&!hit.b.alive?groundBodyTarget(f,i,t,reach,aa,assignedPair):hit;
      if(!shot)continue;
      const weapons=flight?groundParallelWeapons(f,t,false,shot):parallel;
      if(!weapons.length)b[extraTimer]=groundRules().fireEvery;
      for(const weapon of weapons){
        if(!t.alive||shot.b&&!shot.b.alive)break;
        b[extraTimer]=groundWeaponInterval(weapon);
        groundBodyDirectShot(f,i,t,shot,false,weapon);
      }
    }
  }
}
/* 小隊の数（docs/spec.md「地上の部隊編成」、2026-11-18）: 1小隊は今の駒1つぶん。中隊の体の数・耐久・火力を小隊の数の倍にする。
   体1つの耐久と、体1つの射撃・地点攻撃の弾の威力は1小隊のときと同じ。海の艦は1のまま。指定のない部隊は1（作戦のデータの部隊は
   terrain.js groundUnitSpec で4） */
function groundPlatoonCount(f){
  const max=f.groundKind==='sea'?1:window.WOS_GROUND_RULES.unitTypes[f.groundKind]?.maxPlatoons??4;
  return Math.max(1,Math.min(max,Math.round(+f.groundPlatoons)||1));
}
function groundInitUnit(f){
  f.groundPlatoons=groundPlatoonCount(f);if(!f.groundPlatoonHp){f.hpPool*=f.groundPlatoons;f.groundPlatoonHp=true;}
  f.groundMaxHp=f.hpPool;
  const modelSpec=groundModelFor(f.groundKind==='sea'?'sea:'+(groundNavalModel(f)||f.type):f.groundKind,f.side||(f.team===1?'mars':'earth'));
  const one=modelSpec&&['fighter','attack'].includes(f.groundKind)&&modelSpec.offsets.length!==4?
    {...modelSpec,form:'flight4',offsets:GROUND_FORMS.flight4}:modelSpec;
  const bodySpec=one&&f.groundPlatoons>1?{...one,platoon:one.offsets,platoons:f.groundPlatoons,offsets:groundPlatoonOffsets({...one,platoon:one.offsets,platoons:f.groundPlatoons},f.groundPlatoons)}:one;
  f.groundBodyGeometry=null;f.groundBodyLayouts=null;f.groundBodyTargets=null;f.groundTrack=null;f.groundWasFlight=null;f.groundWasGuarded=null;f.groundAirSquad=null;
  f.groundWasAutoCruiseAt=null;f.groundWasStayGround=false;
  f.groundBodySpec=bodySpec;f.bodies0=f.groundKind==='sea'?1:(bodySpec?.offsets.length||1);
  const cruise=groundRuleSet().airCombat.cruiseKmSec[f.groundKind];
  if(cruise)f.speed=cruise*GROUND_SCALE;
  f.bodies=Array.from({length:f.bodies0},(_,i)=>{
    const random=groundBodyRandom(f,i),phase=random()*groundRules().fireEvery;
    return {hp:f.groundMaxHp/f.bodies0,max:f.groundMaxHp/f.bodies0,alive:true,shotT:phase,aaT:phase,parallelT:random()*groundRules().fireEvery};
  });
  groundBodySync(f);f.groundMovedAt=-Infinity;f.groundSpawnAt=gameSec;
  // 古い地上作戦が指定する高高度は、W.A.S. が使える低高度へ収める。
  if(f.groundKind==='was'&&f.band==='high')f.band='low';
  if(f.groundKind==='fighter'&&!groundTrainingEnemy(f)&&!groundStaticTarget(f))f.band='high';
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
    const special=groundVisualSpecialKeys(spec.key),geos=new Map([spec.key,...spec.move,...special].map(key=>[key,null]));
    // y: the table's lift of the shape before scaling (the sea assault carriers' waterline, docs/models.md 15.25)
    for(const key of geos.keys()){ const g=groundShapeGeo(key); if(spec.y)g.translate(0,spec.y,0); geos.set(key,g); }
    const geo=geos.get(spec.key),size=spec.size;
    model.userData.material=mat;
    if(special.length)model.userData.special=new Map(special.map(key=>[key,geos.get(key)]));
    const rig=model.userData.rig=spec.move.length?null:groundRig(spec.key);
    model.userData.geometries=[...geos.values(),rig?.hull,rig?.turret,rig?.gun].filter(Boolean);
    const form=model.userData.formation={spec,bodies:[],layouts:{}};
    form.layouts=groundLayouts(f,spec);
    if(spec.move.length||special.length)model.userData.pose={stand:[],move:[],clocks:[],last:f.pos.clone(),movedAt:-Infinity,slidAt:-Infinity};
    for(const [i,[x,z]] of spec.offsets.entries()){
      const body=new THREE.Mesh(geo,mat);
      if(spec.form==='wasArrow')body.rotation.order='YXZ';
      if(rig)body.userData.aimParts={rig};
      body.scale.setScalar(spec.body??size); body.position.set(x*size,0,z*size); model.add(body);
      form.bodies.push(body);
      if(model.userData.pose){
        // Stable body-local seed: drawing or rebuilding this fleet must not reshuffle its steps.
        const random=groundBodyRandom(f,i);
        // step: 1歩の間隔の倍率（W.A.S. は歩兵の 0.6 倍、仮）
        const clock={start:Math.floor(random()*spec.move.length),phase:random(),stepSec:.45*(.8+random()*.45)*(spec.step||1)};
        const moves=spec.move.map(key=>{
          const moving=new THREE.Mesh(geos.get(key),mat); moving.scale.copy(body.scale); moving.position.copy(body.position); moving.visible=false; model.add(moving);return moving;
        });
        model.userData.pose.stand.push(body); model.userData.pose.move.push(moves); model.userData.pose.clocks.push(clock);
      }
    }
    if(model.userData.pose)model.userData.pose.rest=geo;
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
  groundFxReset();
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
  const picked=orderTargets(),now=gameSec,plumes=[];
  groundFxPlumesUsed=0;
  groundRangesDraw(picked);
  if(groundBridgeNoGo){groundBridgeNoGo.visible=groundBridgeNoGo.visible&&!over;groundBridgeNoGo.children.forEach(m=>m.material.opacity=.45+.15*Math.sin(performance.now()/1600*Math.PI*2));}
  const boardTargets=groundWorkAiming==='board'&&picked.length===1?groundBoardTargets(picked[0]):[];
  for(const f of fleets){
    groundSelectionDraw(f,picked.includes(f),boardTargets.includes(f));
    const model=f.groundModel; if(!model)continue; model.visible=f.alive&&!f.embarked&&!groundAbsent(f)&&(f.team===0||groundSeenBy(0,f)||typeof revealMode!=='undefined'&&revealMode);
    const {pose,rig,special,formation,material}=model.userData;
    if(special)for(const body of pose.stand){
      if(body.userData.baseYaw!==undefined){body.rotation.y=body.userData.baseYaw;delete body.userData.baseYaw;}
    }
    groundFormationDraw(f,now);
    const heading=Math.atan2(f.heading.x,f.heading.z);
    if(pose){
      // Orders can wait at obstacles; actual displacement also covers pursuit and aircraft.
      if(pose.last.distanceToSquared(f.pos)>1e-10)pose.movedAt=now;
      if(Math.hypot(pose.last.x-f.pos.x,pose.last.z-f.pos.z)>1e-5)pose.slidAt=now;
      pose.last.copy(f.pos);
      // 歩く形は体ごと（体ごとの動きで動いている体・その場で回っている体だけ歩く）。体ごとの動きのない隊は隊が動いているかで決める。
      const T=f.groundTrack,unit=now-(f.bodies?f.groundMovedAt:pose.movedAt)<.4,was=special?.has('wasFire');
      const cyc=formation.spec.cycle||0,guard=was&&groundWasGuard(f),base=guard?cyc:0;
      const swarm=model.userData.wasSwarming;
      const duel=f.groundWasFlight?.dogfight;
      const combat=was?groundRuleSet().wasCombat:null;
      const thrust=combat?.thrust,calf=thrust?.calf;
      const liftOff=calf&&f.band==='ground'&&f.bandTo==='cruise'&&groundBandSeconds(f,f.bandTo)-f.bandLeft<calf.transitionSec;
      const touchDown=calf&&f.bandTo==='ground'&&f.bandLeft<calf.transitionSec;
      const transitionPower=liftOff||touchDown?calf.transitionPower:0;
      const flashEvery=duel?combat.dogfight.pass.flashEverySec:combat?.swarmManeuvers.front.firePass.flashEverySec;
      pose.move.forEach((moves,i)=>{
        const b=f.bodies?.[i],alive=!f.bodies||!!b?.alive,aim=groundVisualKeepAim(f,b,now),body=pose.stand[i];
        const passFiring=swarm&&body.userData.wasPassFiring;
        const reverseFiring=!swarm&&!!body.userData.wasReverseFire;
        const key=was?groundWasVisualPose(f,aim||passFiring||reverseFiring,now-pose.slidAt<.4,guard):aim?.missile&&special?.has('hinfMsl')?'hinfMsl':null;
        const moving=!key&&moves.length>0&&(T?!!T.moving[i]:unit),clock=pose.clocks[i];
        const at=moving?base+(clock.start+Math.floor(now/clock.stepSec+clock.phase))%(cyc||moves.length):-1;
        body.visible=!moving&&alive;
        if(special?.size)body.geometry=special.get(key)||pose.rest;
        if(alive&&key&&aim&&(key==='wasFire'||key==='wasFlyFire'&&!groundWasBodyFlight(f)||key==='hinfMsl')){
          body.userData.baseYaw=body.rotation.y;
          body.rotation.y=aim.yaw-heading;
        }
        if(alive&&thrust?.poses.includes(key)&&model.visible){
          plumes.push({body,boost:body.userData.wasThrust?.boost??0,config:thrust,transitionPower});
        }
        if(alive&&model.visible&&f.fireTarget?.alive&&passFiring&&now-(body.userData.wasPassShotAt??-Infinity)>=flashEvery){
          body.userData.wasPassShotAt=now;
          groundWasPassFlash(body,f,body.userData.wasPassUnit??f.fireTarget,heading,now);
        }
        moves.forEach((body,j)=>body.visible=moving&&j===at&&alive);
      });
    }
    if(!pose&&formation)formation.bodies.forEach((body,i)=>{
      const b=f.bodies?.[i];body.visible=!f.bodies||!!b?.alive;
      if(rig&&model.visible&&body.visible)groundVisualRigDraw(body,groundVisualKeepAim(f,b,now),heading,!!f.groundTrack?.moving[i]);
    });
    model.position.copy(f.pos); if(f.band==='ground'||f.groundKind==='was')model.position.y+=GROUND_BODY_LIFT; model.rotation.y=heading+(!model.userData.groundShape&&['fighter','attack','supportAircraft'].includes(f.groundKind)?Math.PI:0);
    const k=groundBandOpacity(f);
    if(material)material.opacity=material.userData.baseOpacity*k;
    else model.traverse(o=>{if(o.material)o.material.opacity=o.material.userData.baseOpacity*k;});
    f.el.style.opacity=String(k*(f.team===1&&!f.seen&&!(typeof revealMode!=='undefined'&&revealMode)?.42:1)); // 表示を薄くしても選択と射撃の規則は変えない。
    for(const s of f.ships)s.pos.copy(f.pos);
  }
  for(const f of fleets)if(f.groundDrone)groundDroneDraw(f,picked);
  for(const [band,grid] of Object.entries(groundGrids)) grid.material.opacity=groundView===band?.32:groundView==='all'?.08:.025;
  // 背中の表示を優先し、残りの枠で近くのふくらはぎを描く。
  plumes.sort((a,b)=>b.boost-a.boost);
  for(const {body,config} of plumes)groundWasPlume(body,now,config);
  for(const {body,config,transitionPower} of plumes)groundWasPlume(body,now,config,true,transitionPower);
  groundFogDraw(); groundCaptureDraw(); groundHud();
  groundStrikeDraw(); groundFxDraw(now); groundTransportDraw(); groundSupplyDraw(); groundScriptDraw();
  if(typeof groundPlanDraw==='function')groundPlanDraw();
  if(typeof groundAreaDraw==='function')groundAreaDraw();
}
const GROUND_FRONTLINE_KINDS=new Set(['infantry','heavyInfantry','commando','mechanicalAssault','vehicle','apc','was']);
const GROUND_REAR_KINDS=new Set(['supply','artillery','guidedRocket','mobileAA','engineer']);
function groundFrontlineUnit(f){return GROUND_FRONTLINE_KINDS.has(f.groundKind)&&f.alive&&f.hpPool>0&&!f.embarked&&!groundAbsent(f)&&!groundScriptDescending(f)&&groundMoveKind(f)!=='air';}
function groundRearPaced(f){
  return GROUND_REAR_KINDS.has(f.groundKind)&&groundMoveKind(f)!=='air'&&!f.groundBuilding&&!f.groundGiving&&!f.groundUnloading&&
    !f.groundRout&&!f.groundSupplyTrip&&f.order?.groundSupplyMove!=='retreat'&&(f.order?.type==='move'||f.order?.type==='attack');
}
function groundStep(dt){
  if(over) return;
  groundSupplyBefore(dt);
  // 案内をとばした後も、残った命令・追撃・射撃目標を毎回消す。
  for(const f of fleets)if(groundTrainingEnemy(f)){groundClearOrders(f);f.stance='evade';}
  groundStrikeStep(dt);
  groundTransportStep(dt);
  groundUpdateSight();
  if(op.npc&&!op.groundDrill){
    if(typeof groundFrontKeepPlayer==='function')groundFrontKeepPlayer();
    npcGroundStep();
  }
  const movingFront=[[],[]],rear=[];
  for(const f of fleets){
    if(!f.alive||f.groundDrone||f.embarked||groundAbsent(f)||groundScriptDescending(f)) continue;
    if(f.groundLastPos&&f.groundLastPos.distanceToSquared(f.pos)>1e-10)f.groundMovedAt=gameSec;
    if(f.groundLastPos)f.groundLastPos.copy(f.pos);
    if(f.groundKind==='mechanicalAssault'){
      groundMechanicalWear(f,dt); if(!f.alive)continue;
    }
    if(f.groundKind==='was')groundWasAutoLand(f);
    if(f.bandTo)groundStepBand(f,dt);
    if(f.groundKind==='was'){const rules=groundRuleSet();f.speed=groundWasCruising(f)?rules.wasFlight.speed.cruise:groundWasFlying(f)?rules.wasFlight.speed.low:rules.unitTypes.was.speed;}
    if(!groundFlyingAircraft(f)||groundTrainingEnemy(f)||groundStaticTarget(f))f.pos.y=groundUnitHeight(f);
    if(groundFlyingAircraft(f)){
      if(f.order?.type==='attack'&&(!f.order.target.alive||!groundAirSquad(f)&&!f.order.groundFrontEngage&&!groundSeenBy(f.team,f.order.target))){f.order=null;dropArrow(f.arrow);f.arrow=null;nextOrder(f);}
      groundAirMotion(f,dt);continue;
    }
    if(groundRearPaced(f)){rear.push(f);continue;}
    const {x,z}=f.pos;
    groundStepMove(f,dt);
    if((f.pos.x!==x||f.pos.z!==z)&&groundFrontlineUnit(f))movingFront[f.team].push(f);
  }
  // 配列の順序にかかわらず、このステップで実際に動いた前列との間隔を守る。
  for(const f of rear){
    const battalion=groundSupplyBattalion(f),front=movingFront[f.team];
    groundStepMove(f,dt,battalion?front.filter(t=>battalion.companies.includes(t.companyId)):front);
  }
  for(const f of fleets)if(f.groundLastPos&&f.groundLastPos.distanceToSquared(f.pos)>1e-10){f.groundMovedAt=gameSec;f.groundLastPos.copy(f.pos);}
  for(const f of fleets)if(f.alive&&f.bodies)groundTrailMark(f);
  // 体ごとの動きを、中隊が動いたあとの位置で進める（このあとの視界・射撃は進めた体の位置を使う）
  const wasRules=groundRuleSet().wasCombat,dogfights=groundWasDogfightStates(wasRules);
  for(const f of fleets)if(f.alive&&f.bodies){
    if(f.groundKind==='was'&&!f.embarked&&!groundAbsent(f))groundWasFlightStep(f,dt,dogfights.get(f));
    groundBodyTrack(f,true);
  }
  if(dt>0){
    const groups=new Set([...dogfights.values()].map(state=>state.group));
    for(const group of groups)groundWasDogfightSeparate(group,wasRules);
  }
  groundTransportSync();
  if(typeof groundDroneStep==='function')groundDroneStep(dt);
  groundBombStep();
  // 両軍とも全隊の移動後の視界を共有し、同じ視線・射程で撃つ。
  groundUpdateSight();
  for(const f of fleets){
    if(!f.alive||f.groundDrone||f.embarked||groundAbsent(f)||groundScriptDescending(f)) continue;
    if(f.bodies)for(const b of f.bodies){b.shotT=Math.max(0,b.shotT-dt);if(b.parallelT!==undefined)b.parallelT=Math.max(0,b.parallelT-dt);}
    const dronePriority=f.groundKind==='mobileAA'&&fleets.some(t=>t.groundDrone&&groundAASolution(f,t));
    if(dronePriority||f.groundAreaSalvo||f.groundVolley||f.groundBombRun){
      f.fireTarget=null;
      if(f.groundKind==='was')groundWasCombatCruise(f,null);
      if(f.bodies){groundBodyIdleClock(f,'shotT');groundBodyIdleClock(f,'parallelT');}
      continue;
    }
    const target=f.order&&f.order.type==='attack'?f.order.target:null;
    // 毎回、現在の段から選び直す。予約・自動交戦・残った目標も同じ表を通す。
    // 巡航 W.A.S. へ対空武器（air:true）を持つ隊の自動対空が届くときは二重発射せず対空武器へ任せる（ユーザー決定 2026-11-28）。
    // 戦車など air:true を持たない兵科は直射の主砲で撃ち、groundAutoAAStep 側で同じ相手への重複発射を抑える。
    const directCanFire=t=>groundCanFire(f,t)&&(groundWasDuelDirect(f,t)||
      !(groundWasCruising(t)&&groundHasAirWeapon(f)&&groundAASolution(f,t)));
    f.fireTarget=target&&directCanFire(target)?target:f.stance==='evade'||groundStaticTarget(f)?null:groundSelectEnemy(f,directCanFire);
    if(f.groundKind==='was')groundWasCombatCruise(f,f.fireTarget);
    f.groundShotT=Math.max(0,(f.groundShotT||0)-dt);
    // 敵の自動の地点攻撃。W.A.S. は自分からは撃たない（groundAutoIndirect。ユーザー決定 2026-11-19）
    if(f.team===1&&(!op.npc||!npcGroundFires(f))&&!f.groundRout&&!f.groundRecover&&['artillery','guidedRocket','sea'].includes(f.groundKind)&&f.stance!=='evade') groundStrikeAI(f);
    if(f.bodies){if(f.fireTarget&&groundFireMode(f,f.fireTarget)==='direct'){groundBodyFire(f,f.fireTarget,0);continue;}groundBodyIdleClock(f,'shotT');groundBodyIdleClock(f,'parallelT');}
    if(f.fireTarget&&f.groundShotT===0){
      if(groundFireMode(f,f.fireTarget)==='indirect'){if(!op.npc||!npcGroundFires(f))groundVolleyStart(f,{point:f.fireTarget.pos,target:f.fireTarget});continue;}
      const target=f.fireTarget;
      const hit=groundUsesFlightBodies(f,target)?groundBodyTarget(f,0,target,groundTargetRange(f,target)):null;
      const weapon=groundDirectWeapon(f,target,false,null,hit);
      groundVisualDirect(f,0,target,hit?.j??0,hit?.from??f.pos,hit?.pos??target.pos,false,weapon);
      groundFireDirect(f,target,f.groundPlatoons||1,false,hit?.b??null,weapon);
      groundSupplyShot(f);
      f.groundShotT=groundWeaponInterval(weapon);
    }
  }
  groundAutoAAStep(dt);
  if(typeof groundDroneCleanup==='function')groundDroneCleanup();
  groundCaptureStep(dt);
  groundSupplyAfter(dt);
  if(typeof groundFrontStep==='function')groundFrontStep();
  if(op.groundDrill)groundDrillTick();
}

function groundStepMove(f,dt,front){
  // 進撃中に撃てる敵がいれば自動交戦の隊は停止し、命令優先の隊は進む。fireTarget は前のステップの値。
  const advanceHold=f.order?.groundAdvance&&f.stance==='engage'&&f.fireTarget?.alive&&groundAnyBodyCanFire(f,f.fireTarget);
  if(f.order?.type==='move'&&!advanceHold&&groundFollow(f,dt,front)){
    groundFormationArrive(f);
    if(f.order.groundSupplyMove){
      if(f.order.groundSupplyMove==='follow')f.groundSupplyServing=f.order.groundSupplyMoveTarget;
      f.groundSupplyCheckLeft=0;
    }
    f.order=null;dropArrow(f.arrow);f.arrow=null;nextOrder(f);
  }
  if(f.team===1&&!groundStaticTarget(f)&&!f.groundRout&&!f.groundRecover&&!f.groundAirState&&groundPermissionOnly(f)&&f.stance!=='evade'&&!f.order){
    const allowed=fleets.filter(t=>groundFireSolution(f,t)).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0];
    if(allowed)order(f,{type:'attack',target:allowed});
  }
  const target=f.order?.type==='attack'?f.order.target:null;
  if(target&&(!target.alive||!f.order.groundFrontEngage&&!groundSeenBy(f.team,target))){f.order=null;dropArrow(f.arrow);f.arrow=null;nextOrder(f);}
  // 射程の8割より遠いか、射線・弾道が通らず撃てないあいだは近づく。W.A.S. は直接射撃で撃てるまで。
  else if(target&&groundSeenBy(f.team,target)&&groundEngagementRange(f,target)>0&&(groundDistanceTo(f,target)>groundEngagementRange(f,target)*.8||!groundFireMode(f,target)||!groundAnyBodyCanFire(f,target))){
    f.groundChaseT=(f.groundChaseT||0)-dt;
    if(f.groundChaseT<=0){f.order.path=groundPath(f.pos,target.pos,groundMoveKind(f));f.groundChaseT=.5;}
    if(f.order.path&&(!op.npc||npcGroundHoldChase(f,target)))groundFollow(f,dt,front);
  }
}

// 自動交戦は撃てる敵だけが候補。指揮官は追撃先も選べるが、対戦車の優先は今撃てる相手にだけ付ける。
function groundSelectEnemy(f,eligible,canCounter){
  const counters=window.WOS_DATA?.npc?.counters?.ground[f.groundKind];
  let target=null,bestDistance=Infinity,bestCounter=false;
  for(const t of fleets){
    if(!eligible(t))continue;
    const counter=!!counters?.includes(t.groundKind)&&(!canCounter||canCounter(f,t)),distance=groundDistanceTo(f,t);
    if(!target||counter&&!bestCounter||counter===bestCounter&&distance<bestDistance){
      target=t;bestDistance=distance;bestCounter=counter;
    }
  }
  return target;
}

function groundArmorFactor(armor,pen,rules){
  const p=1/(1+(armor/pen)**rules.exponent);
  return p+(1-p)*rules.floor;
}
function groundWeaponContext(f,t,aa=false,hit=null){
  const rules=groundRuleSet(),flyingWas=t.groundKind==='was'&&groundWasFlying(t);
  const wasVsFlying=f.groundKind==='was'&&flyingWas,air=aa||groundUsesAirRange(f,t)||wasVsFlying;
  const armor=rules.unitTypes[t.groundKind]?.armor,penetration=rules.combat.penetration;
  const shot=hit?.flight?hit:null,from=shot?.from??f.pos,to=shot?.pos??t.pos;
  const dx=from.x-to.x,dz=from.z-to.z,distance=Math.hypot(dx,dz);
  const yaw=shot?.targetYaw;
  const hx=yaw==null?t.heading?.x:Math.sin(yaw),hz=yaw==null?t.heading?.z:Math.cos(yaw);
  const front=armor?.front&&!(air&&flyingWas&&!wasVsFlying)&&dx*hx+dz*hz>=distance*penetration.frontCos;
  const fromAbove=armor?.top!=null&&groundWasCruising(f)&&distance<=rules.wasCombat.topAttackKm*GROUND_SCALE&&
    (!shot||from.y>to.y+(t.band==='ground'&&!groundWasBodyFlight(t)?GROUND_BODY_LIFT:0));
  const ambush=armor?.side&&f.band==='ground'&&['infantry','heavyInfantry','commando','mechanicalAssault'].includes(f.groundKind)&&groundTerrainCover(f);
  const soft=['infantry','commando','mechanicalAssault'].includes(t.groundKind);
  return {rules,air,armor,penetration,front,fromAbove,ambush,soft};
}
function groundWeaponEvaluate(w,ctx){
  const plate=typeof ctx.armor==='number'?ctx.armor:w.top||ctx.fromAbove?ctx.armor?.top:ctx.front&&!ctx.ambush?(w.shaped?ctx.armor.shapedFront??ctx.armor.front:ctx.armor.front):ctx.armor?.side;
  const armorFactor=groundArmorFactor(plate??0,w.pen,ctx.penetration),power=w.power*(ctx.soft?w.soft??1:1);
  return {...w,power,armorFactor,plate};
}
function groundHasAirWeapon(f){
  const weapons=f?.weapons??groundRuleSet().unitTypes[f?.groundKind]?.weapons;
  return !!weapons?.some(w=>w.air);
}
function groundDirectWeapon(f,t,aa=false,shooter=null,hit=null){
  const ctx=groundWeaponContext(f,t,aa,hit);
  const weapons=f.weapons??ctx.rules.unitTypes[f.groundKind]?.weapons;
  // 地上用の表に対空武器がない場合は既存の対空火力を使う。
  const fallback={power:f.dmg*(f.groundKind==='mobileAA'&&ctx.air?ctx.rules.combat.mobileAAAir:1),armorFactor:1,morale:1};
  if(!weapons)return fallback;
  let best=null;
  for(const w of weapons){
    if(ctx.air&&!w.air||!ctx.air&&w.airOnly||t.groundDrone&&!ctx.air&&w.air)continue;
    if(!ctx.air&&w.parallel)continue;
    if(w.rounds&&shooter?.groundRocket?.readyAt>gameSec+1e-8)continue;
    const candidate=groundWeaponEvaluate(w,ctx);
    if(!best||candidate.power*candidate.armorFactor>best.power*best.armorFactor)best=candidate;
  }
  return best??fallback;
}
function groundParallelWeapons(f,t,aa=false,hit=null){
  const ctx=groundWeaponContext(f,t,aa,hit);
  const weapons=f.weapons??ctx.rules.unitTypes[f.groundKind]?.weapons;
  if(!weapons)return [];
  if(ctx.air){
    const cannon=!aa&&groundWasDuelDirect(f,t)&&weapons.find(w=>w.wasCannon);
    return cannon?[groundWeaponEvaluate(cannon,ctx)]:[];
  }
  const list=[];
  for(const w of weapons){
    if(!w.parallel||t.groundDrone&&w.air)continue;
    // 抜ける相手だけ撃つ: 戦車は巡航の上面攻撃だけ、戦車以外はどの向きからでも（ユーザー決定 2026-11-28）。
    if(t.groundKind==='vehicle'&&!ctx.fromAbove)continue;
    list.push(groundWeaponEvaluate(w,ctx));
  }
  return list;
}
function groundFireDirect(f,t,share,aa=false,body=null,weapon=groundDirectWeapon(f,t,aa)){
  const raw=weapon.power*groundFireFactor(f,t,aa)*groundSupplyAttackFactor(f)*share;
  damage(t,raw,f,null,body,weapon);
}
function groundTerrainCover(t){
  const {x,z}=t.pos,{urbanMargin:m}=groundRuleSet().combat;
  if(groundTownZones().some(zone=>groundInsideTown(t.pos,zone))||groundBuildings.some(b=>b.settlement==null&&x>=b.minX-m&&x<=b.maxX+m&&z>=b.minZ-m&&z<=b.maxZ+m))return 'town';
  return groundInForest(x,z)?'forest':null;
}
function groundDamageFactor(t,blast=false){
  const descent=groundScriptDescending(t)?1.5:1;
  if(t.groundUnloading)return {h:groundLandingRules().damageFactor*descent,m:1};
  if(t.band!=='ground'||!['infantry','heavyInfantry','commando'].includes(t.groundKind))return {h:descent,m:1};
  const {infantryCover,commandoCoverPower}=groundRuleSet().combat,mode=blast?'blast':'direct';
  const terrain=infantryCover[groundTerrainCover(t)]?.[mode];
  const stoppedAt=Math.max(t.groundSpawnAt??-Infinity,t.groundMovedAt??-Infinity);
  const dug=Number.isFinite(stoppedAt)&&gameSec-stoppedAt>=groundSupplyRules().dugSec?infantryCover.dug[mode]:null;
  const power=t.groundKind==='commando'?commandoCoverPower:1;
  return {h:descent*((terrain?.h??1)*(dug?.h??1))**power,m:((terrain?.m??1)*(dug?.m??1))**power};
}
function groundWasReactiveArmor(body,weapon){
  if(!body?.alive||body.groundWasArmorSpent||!weapon)return 1;
  const {penetrationRatio}=groundRuleSet().wasCombat.reactiveArmor;
  if(!(weapon.pen>=weapon.plate*penetrationRatio))return 1;
  body.groundWasArmorSpent=true;
  return weapon.shaped||weapon.top?0:.5;
}
function groundDamageAmount(t,raw,src,impact,weapon,body=null){
  const rules=groundRuleSet(),cover=groundDamageFactor(t,!!impact);
  const duel=!impact&&src&&groundWasFlying(src)&&groundWasFlying(t);
  const amount=raw*rules.combat.damageScale*(duel?rules.wasCombat.dogfight.damageScale:1)*(weapon?.armorFactor??1);
  let evasion=t.eva??0,armor=1;
  if(t.groundKind==='was'){
    evasion=groundWasFlying(t)?rules.wasFlight.evasion:rules.unitTypes.was.evasion;
    // 飛んでいる W.A.S. どうしは回避なし（ユーザー決定 2026-11-28「was同士は回避がない」）
    if(duel&&rules.wasCombat.dogfight.noEvasion)evasion=0;
    else if(groundWasFlying(t)&&weapon?.wasCannon){
      const {cannonEvasionFactor,cannonMaxEvasion}=rules.wasCombat.dogfight;
      evasion=Math.min(evasion*cannonEvasionFactor,cannonMaxEvasion);
    }
    if(!impact&&amount>0)armor=groundWasReactiveArmor(body,weapon);
  }
  if(weapon?.evasionFactor!=null)evasion*=weapon.evasionFactor;
  const hit=amount*(impact?groundStrikeDamageFactor(t.groundKind):1)*(1-evasion)*armor;
  const morale=impact?groundStrikeMoraleFactor(impact,t,src):(weapon?.morale??1)*(rules.unitTypes[t.groundKind]?.directMorale??1);
  return groundMoraleHit(t,hit,cover,morale,!!impact);
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
function groundCanCapture(f){ return ['infantry','was'].includes(f.groundKind)&&groundCaptureCounts(f); }
function groundCaptureCounts(f){ return !groundAbsent(f)&&!groundScriptDescending(f)&&f.alive&&f.hpPool>0&&f.band==='ground'&&!groundWasFlying(f)&&groundBands(f).includes('ground')&&f.groundKind!=='sea'&&!f.embarked&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0); }
/* 拠点の占領の点（ユーザー決定 2026-11-20）: 1隊で占領できる兵科（強化歩兵・地上の W.A.S.）は1点、ほかの占領に数える隊は
   1/capture.group 点（0.5点）。円の中の点の多い軍が優勢。占領が進むのは優勢で1点以上のときだけ（戦車1隊の0.5点では進まない）。 */
function groundCapturePoints(s,team){
  let points=0;const part=1/groundRuleSet().capture.group;
  for(const f of fleets){
    if(f.team!==team||groundDistanceTo(f,s)>s.captureRadius)continue;
    if(groundCanCapture(f))points+=1;else if(groundCaptureCounts(f))points+=part;
  }
  return points;
}
function groundCapturePresent(s,team){return groundCapturePoints(s,team)>=1-1e-9;}
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
  const rate=groundRuleSet().capture.contestedRate??.5;
  for(const s of groundSites){
    const points=[groundCapturePoints(s,0),groundCapturePoints(s,1)],lead=points[0]>points[1]?0:points[1]>points[0]?1:null;
    const team=lead!==null&&points[lead]>=1-1e-9?lead:null;   // 進められる軍（優勢で1点以上）
    s.points=points;s.leading=lead;s.contested=points[0]>0&&points[1]>0;   // 競合: 両軍とも円の中に1隊でもいる
    s.supplyContested=points[0]>=1-1e-9&&points[1]>=1-1e-9;   // 補給と士気の競合は前の決め方（両軍とも1点以上。ユーザー 2026-11-20「案2」）
    s.capturingTeam=team!==null&&team!==s.owner?team:null;
    if(!s.progress)s.progress=[0,0];if(!s.away)s.away=[0,0];
    if(s.contested){
      // 競合中は半分の速さ（ユーザー決定 2026-11-20「競合中はそうでない時の半分の速度で占領が進みます（奪還側も同じ）」）。
      // 優勢な軍は、まず相手の進みを押し戻し（持ち主の奪還も同じ速さ）、なくなってから自分の進みを足す。拮抗・1点未満なら止まる
      s.away=[0,0];if(team===null)continue;
      const step=dt*rate,other=1-team;
      if(s.progress[other]>0){s.progress[other]=Math.max(0,s.progress[other]-step);continue;}
      if(team===s.owner)continue;
      const seconds=groundCaptureSeconds(s);s.progress[team]=Math.min(seconds,s.progress[team]+step);
      if(s.progress[team]>=seconds-1e-8){s.owner=team;s.progress=[0,0];}
      continue;
    }
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
// 拠点のモザイクのマスの大きさ（km。ユーザー 2026-11-20「モザイクは一つ一つ大きめでも構いません（建物と同じかそれ以上）」。町の建物は0.1〜0.2km。仮）
const GROUND_MOSAIC_KM=.8;
function groundTerritoryCellHash(x,y){let h=Math.imul(x,374761393)+Math.imul(y,668265263)|0;h=Math.imul(h^h>>>13,1274126177);return ((h^h>>>16)>>>0)/4294967296;}
function groundPaintTerritory(){
  const t=groundTerritory;if(!t)return;
  // Validate once per paint, not once per pixel. Bridge state does not change spatial membership.
  const spatial=groundInfluenceAt(null,null),key=groundSites.map(s=>`${s.knownOwner}:${(s.knownProgress||[0,0]).map(p=>Math.round(p/groundCaptureSeconds(s,s.knownOwner)*50)).join(',')}`).join('|')+'/'+(groundSupplyActive()?groundSupplyNet?.edges.map(e=>`${e.knownOwner}:${e.knownContested}`).join('|'):'');
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
  const sites=new Set(groundSites),cell=Math.max(1,Math.round(GROUND_MOSAIC_KM*width/d.meta.widthKm));
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const i=py*width+px,s=pixels.members[i];if(pixels.mask[i]!==2||!s)continue;
    const known=s.circle||s,k=i*4;let color,alpha=102;
    if(sites.has(known)){
      /* 拠点（ユーザー決定 2026-11-20）: 占領の進みに合わせて、進めている軍の色のマスがまだらに増える（モザイク）。占領し切るまでは持ち主の陣地のまま。
         競合の黄色の斜線は使わない（競合は札の「〇〇優勢・競合」で見せる）。マスは GROUND_MOSAIC_KM 四方、マスごとの乱数が進みの割合より小さければ塗る */
      const p=known.knownProgress||[0,0],sec=groundCaptureSeconds(known,known.knownOwner),h=groundTerritoryCellHash(Math.floor(px/cell),Math.floor(py/cell));
      const q0=known.knownOwner===0?0:p[0]/sec,q1=known.knownOwner===1?0:p[1]/sec;
      color=colors[h<q0?0:h>=1-q1?1:known.knownOwner??2];
    }else{const stripe=known.knownContested&&(px+py)%12<3;color=stripe?[238,225,183]:colors[known.knownOwner??2];if(stripe)alpha=190;}   // 道路は今まで通り
    raw[k]=color[0];raw[k+1]=color[1];raw[k+2]=color[2];raw[k+3]=alpha;
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
    s.el.querySelector('small').textContent=`${s.knownOwner!==null&&s.knownOwner!==undefined&&Object.values(op.groundHQ||{}).includes(s.id)?'本営 / ':''}${owner} / ${groundSiteReadout(s)}${groundSupplyActive()&&s.owner===0&&s.knownOwner===0?' / '+(groundSupplyAt({pos:s.pos,team:0}).rate===1?'接続':groundSupplyAt({pos:s.pos,team:0}).rate===.5?'半速':'切断'):''}`;
    s.el.querySelectorAll('i').forEach((bar,i)=>bar.style.width=`${progress[i]}%`);
  }
}

// 確定デザインはデータのSVGをそのまま使用する。既存の固有ボタンのID・イベント・titleは維持。
document.querySelectorAll('[data-command-icon]').forEach(button=>{
  const icon=WOS_COMMAND_ICONS[button.dataset.commandIcon];
  button.setAttribute('aria-label',button.textContent.trim());
  button.innerHTML=icon.svg;
  if(button.id==='groundWasFlight')button.addEventListener('click',groundWasPlayerToggle);
});
function groundWasCommandHud(list){
  const button=document.getElementById('groundWasFlight');
  const units=list.filter(f=>f.groundKind==='was'&&!f.embarked);
  const canToggle=units.length>0&&units.every(groundWasCanToggle);
  const landing=units.length>0&&units.every(groundWasFlying);
  const icon=WOS_COMMAND_ICONS[landing?'wasLand':'wasFly'];
  if(button.dataset.commandIcon!==icon.id){
    button.dataset.commandIcon=icon.id;
    button.innerHTML=icon.svg;
  }
  button.setAttribute('aria-label',icon.label);
  button.title=landing&&units.some(f=>!groundLandable(f))?'着陸できる地表に移動してください':icon.desc;
  button.disabled=over||!canToggle||units.some(f=>groundWasFlying(f)!==landing);
  return units.length>0;
}
function groundCommandBarHud(list){
  if(typeof groundPlanHud==='function')groundPlanHud(list);
  const canMove=list.some(f=>!f.locked&&!f.embarked&&groundCommandAllowed(f,'move'));
  document.getElementById('groundMove').disabled=!canMove||over;
  document.getElementById('groundMove').setAttribute('aria-pressed',String(groundWorkAiming==='move'));
  document.getElementById('groundHold').disabled=!canMove||over;
  const kinds=list.map(f=>f.groundKind), carries=list.some(f=>f.embarked||f.groundPassenger||groundLandingShip(f));
  // 搭乗は、今乗れる相手がいる中隊だけ（戦車は岸の揚陸艦がいるときだけ。groundBoardTargets）。
  const flight=groundWasCommandHud(list);
  const visible={...groundDroneHud(list),board:list.some(f=>groundBoardTargets(f).length>0),unload:carries||kinds.includes('apc'),land:list.some(f=>groundLandingShip(f.embarked||f)),wasFly:flight,wasLand:flight,strike:kinds.some(k=>['artillery','guidedRocket','was','vehicle','sea','supportAircraft'].includes(k)),bridge:kinds.includes('engineer'),supply:kinds.includes('supply')};
  groundBridgeNoGoHud(list);
  const buttons=[...document.querySelectorAll('#groundUniqueCommands button[data-command-icon]')];
  buttons.forEach(b=>b.hidden=!visible[b.dataset.commandIcon]);
  const recall=document.getElementById('groundFrontRecall');
  recall.hidden=over||deploying||!list.some(groundFrontCanRecall);
  const expand=document.getElementById('groundCommandExpand');
  document.getElementById('groundStrikeControl').hidden=!visible.strike;
  expand.hidden=buttons.filter(b=>!b.hidden).length*51+(visible.strike?36:0)+(visible.launch?37:0)+(recall.hidden?0:85)<=204;
  if(expand.hidden){expand.setAttribute('aria-expanded','false');document.getElementById('groundUniqueCommands').classList.remove('expanded');}
}
function groundWasPlayerToggle(){
  const units=orderTargets().filter(f=>f.groundKind==='was'&&!f.embarked);
  if(over||!units.length||!units.every(f=>groundWasCanToggle(f)&&groundWasFlying(f)===groundWasFlying(units[0])))return;
  npcAutoPlayer(units);
  for(const f of units)if(groundWasToggle(f)){
    f.groundWasAutoCruiseAt=null;
    f.groundWasNpcCruise=false;
    f.groundWasStayGround=!!f.groundWasLanding;
  }
  groundClearAiming();groundHud();
}
document.getElementById('groundMove').addEventListener('click',()=>{
  const aiming=groundWorkAiming!=='move';
  groundClearAiming();groundWorkAiming=aiming?'move':null;groundHud();
});
function groundHoldCommand(){
  const list=orderTargets().filter(f=>!f.locked&&!f.embarked&&groundCommandAllowed(f,'move'));
  if(!list.length||over)return;
  npcAutoPlayer(list);saveUndo(list);
  groundFrontRemoveMembers(list);
  for(const f of list){if(f.groundDrone)f.groundDrone.npc=false;groundFrontDefend(f);}
  groundClearAiming();groundHud();updateRoster();
}
document.getElementById('groundHold').addEventListener('click',groundHoldCommand);
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
// 拠点の札（道路の札は groundCaptureReadout のまま）
function groundSiteReadout(s){
  // 残り秒は出さない（ユーザー決定 2026-11-20「残り秒数表示は廃止でゲージと〇〇優勢」）。進みは札のゲージで見せる
  const prefix=s.observed===false?'最終確認：':'',name=t=>t===0?'青':'赤',lead=s.knownLeading??null;
  if(s.knownContested)return prefix+(lead===null?'競合・拮抗':name(lead)+'優勢・競合');
  if(s.knownCapturingTeam!=null)return prefix+name(s.knownCapturingTeam)+'優勢';
  const p=s.knownProgress||[0,0],team=[0,1].filter(t=>p[t]>0&&s.knownOwner!==t).sort((a,b)=>p[b]-p[a])[0]??null;
  if(team!==null)return prefix+'中断 '+name(team);
  return prefix+(s.knownOwner==null?'未占領':'占領済み');
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
