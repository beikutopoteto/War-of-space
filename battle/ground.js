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
  return fleets.filter(f=>f.team===0&&!f.ward&&f.alive&&ids.includes(f.companyId));
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
    for(const id of ids){const f=fleets.find(f=>f.team===0&&f.companyId===id);if(f)tiles.append(mk(f));}
  };
  groundOrg.brigades.forEach(b=>branch('brigades',b,rosterEl));
  groundOrg.battalions.filter(b=>!groundOrg.brigades.some(p=>p.battalions.includes(b.id))).forEach(b=>branch('battalions',b,rosterEl));
  const free=groundOrg.companies.filter(c=>!groundOrg.battalions.some(b=>b.companies.includes(c.id)));
  if(free.length){const title=document.createElement('small');title.textContent='独立中隊';rosterEl.append(title);companies(free.map(c=>c.id),rosterEl);}
}
function groundOpenSelected(list){
  let changed=false;
  const open=(items,level)=>items.forEach(item=>{if(item.open===false&&groundMembers(level,item.id).some(f=>list.includes(f))){item.open=true;changed=true;}});
  open(groundOrg.brigades,'brigades');open(groundOrg.battalions,'battalions');if(changed)buildRoster();
}
function groundUpdateRoster(targets){
  for(const {level,item,pick,meters} of groundRosterNodes){const m=groundMembers(level,item.id);groundSupplyUpdateMeters(meters,m);pick.disabled=!m.length;pick.setAttribute('aria-pressed',String(!!m.length&&m.length===targets.length&&m.every(f=>targets.includes(f))));}
}
function groundRules(){ return WOS_TERRAIN[op.ground].bands; }
// 元の艦種の完成値を通常の換算式で読む。研究・陣営差・編成ボーナス・共通倍率は掛けない。
function groundSeaStats(type,landing=false){
  const model=groundNavalModel({groundKind:'sea',type,groundLanding:landing})||type,s=WOS_DATA.ships.find(s=>s.id===model);
  const name=landing?'揚陸艦':({ff:'高速艇',cl:'イージス艦',bb:'戦艦'}[model]||s.name);
  return {sub:'海の'+name,hp:6+s.def*5,dmg:.4+s.atk*.45,eva:Math.min(.4,s.eva*.04),range:10+s.rng*1.6,speed:2+s.spd,scale:s.scale};
}
// 作戦専用の武器射程（km）を戦闘単位へ変換。索敵・宇宙のrangeとは独立。
function groundFireRanges(f){
  if(!op.ground||!f?.groundKind)return {};
  const data=WOS_TERRAIN[op.ground],spec=f.groundKind==='sea'?(groundNavalClass(f)?.rangesKm||data.navalFireRangesKm?.[f.type]):data.unitTypes[f.groundKind]?.fireRangesKm;
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
function groundPermissionOnly(f){ return !!WOS_TERRAIN[op.ground].unitTypes[f.groundKind]?.permissionOnly; }
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
function groundFireSolution(f,t){ return !groundTrainingEnemy(f)&&f.alive&&t.alive&&!groundAbsent(f)&&!groundAbsent(t)&&!f.groundAirState&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0)&&!f.embarked&&!t.embarked&&!f.groundBuilding&&f.team!==t.team&&groundSeenBy(f.team,t)&&!!groundFireMode(f,t); }
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
function groundInit(){
  groundVisuals=new THREE.Group(); groundVisuals.scale.setScalar(1/GROUND_SCALE); groundBoard.add(groundVisuals);
  for(const f of fleets){
    f.groundMaxHp=f.hpPool;
    f.band=groundBands(f).includes(f.band)?f.band:groundBands(f)[0]; f.bandTo=null; f.bandLeft=0;
    // 兵科変更・追加で元の配置が通れなくなった時は、同じ出発点付近の通行可能なセルへ置く。
    if(!groundPass(groundMapX(f.pos.x),groundMapY(f.pos.z),groundMoveKind(f))){
      const size=WOS_TERRAIN[op.ground].meta.cellKm;let best=null,dist=Infinity;
      for(let y=size/2;y<groundDimensions().heightKm;y+=size)for(let x=size/2;x<groundDimensions().widthKm;x+=size){
        if(!groundPass(x,y,groundMoveKind(f)))continue;const p=groundPoint(x,y),d=p.distanceToSquared(f.pos);if(d<dist){best=p;dist=d;}
      }
      if(best)f.pos.copy(best);
    }
    f.pos.y=groundUnitHeight(f); f.post.copy(f.pos); f.home.copy(f.pos); f.seen=false; f.groundContacts=[null,null];
    for(const s of f.ships){ s.off.set(0,0,0); s.pos.copy(f.pos); }
    groundSelectionInit(f);
    const model=f.groundModel=new THREE.Group(); groundVisuals.add(model);
    const spec=groundModelFor(f.groundKind==='sea'?'sea:'+(groundNavalModel(f)||f.type):f.groundKind,f.side||(f.team===1?'mars':'earth'));
    model.userData.groundShape=!!spec;
    if(spec){
      const team=TEAM_COL[f.team],base=new THREE.MeshStandardMaterial({color:team.clone().multiplyScalar(.5),emissive:team,emissiveIntensity:.22,metalness:.35,roughness:.5,vertexColors:true});
      const mat=base.clone(); base.dispose(); mat.transparent=true; mat.userData.baseOpacity=1;
      const geos=new Map([spec.key,...spec.move].map(key=>[key,null]));
      for(const key of geos.keys())geos.set(key,groundShapeGeo(key));
      const geo=geos.get(spec.key),size=spec.size;
      if(spec.move.length)model.userData.pose={stand:[],move:[],clocks:[],last:f.pos.clone(),movedAt:-Infinity};
      for(const [i,[x,z]] of spec.offsets.entries()){
        const body=new THREE.Mesh(geo,mat); body.scale.setScalar(size); body.position.set(x*size,0,z*size); model.add(body);
        if(spec.move.length){
          // Stable body-local seed: drawing or rebuilding this fleet must not reshuffle its steps.
          let seed=2166136261;
          for(const c of `${f.id}:${f.name}:${i}`)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
          const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
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
      const mesh=new THREE.Mesh(src.geometry.clone(),mat); mesh.scale.setScalar(f.groundKind==='was'?1:SHIP_SIZE[f.groundKind==='sea'?(groundNavalModel(f)||f.type):f.type]||f.scale); model.add(mesh);
    }
  }
  // 見本と同じ薄い格子。地表の起伏と同じ高さを足し、盤の輪郭内だけに置く。
  const d=WOS_TERRAIN[op.ground],dims=groundDimensions(),span=Math.max(dims.widthWorld,dims.heightWorld),gap=Math.max(d.bands.gridStep,span/48),segment=Math.max(1.6,span/192);
  for(const band of ['ground','low','high']){
    const points=[], height=d.bands.heights[band]+.12;
    const add=(x,z,xx,zz)=>{
      if(!groundPass(groundMapX(x),groundMapY(z),'air')||!groundPass(groundMapX(xx),groundMapY(zz),'air'))return;
      points.push(new THREE.Vector3(x,groundHeight(x,z)+height,z),new THREE.Vector3(xx,groundHeight(xx,zz)+height,zz));
    };
    for(let x=-dims.halfWidthWorld;x<=dims.halfWidthWorld;x+=gap)for(let z=-dims.halfHeightWorld;z<dims.halfHeightWorld;z+=segment)add(x,z,x,Math.min(dims.halfHeightWorld,z+segment));
    for(let z=-dims.halfHeightWorld;z<=dims.halfHeightWorld;z+=gap)for(let x=-dims.halfWidthWorld;x<dims.halfWidthWorld;x+=segment)add(x,z,Math.min(dims.halfWidthWorld,x+segment),z);
    const grid=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:band==='high'?0xe1d7ff:0xd5f8ff,transparent:true,opacity:.08,depthWrite:false}));
    groundGrids[band]=grid; groundVisuals.add(grid);
  }
  groundTransportInit();groundCaptureInit(); groundSupplyInit(); groundSightInit(); groundUpdateSight(); groundHud(); groundDraw();
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
function groundSelectionDraw(f,picked){
  const ring=f.groundSelection||(picked&&groundVisuals?groundSelectionInit(f):null);if(!ring)return;
  ring.visible=picked&&f.alive&&!f.embarked&&!groundAbsent(f);
  if(!ring.visible)return;
  const radius=Math.sqrt(f.ships.length)*1.35*(Number.isFinite(f.scale)?f.scale:.3)+2.5,flat=ring.userData.flat,position=ring.geometry.attributes.position;
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
  for(const f of fleets){
    groundSelectionDraw(f,picked.includes(f));
    const model=f.groundModel; if(!model)continue; model.visible=f.alive&&!f.embarked&&!groundAbsent(f)&&(f.team===0||groundSeenBy(0,f));
    const pose=model.userData.pose;
    if(pose){
      // Orders can wait at obstacles; actual displacement also covers pursuit and aircraft.
      if(pose.last.distanceToSquared(f.pos)>1e-10)pose.movedAt=now;
      pose.last.copy(f.pos);
      const moving=now-pose.movedAt<.4;
      pose.stand.forEach(body=>body.visible=!moving);
      pose.move.forEach((moves,i)=>{
        const clock=pose.clocks[i],at=(clock.start+Math.floor(now/clock.stepSec+clock.phase))%moves.length;
        moves.forEach((body,j)=>body.visible=moving&&j===at);
      });
    }
    model.position.copy(f.pos); if(f.band==='ground')model.position.y+=.15; model.rotation.y=Math.atan2(f.heading.x,f.heading.z)+(!model.userData.groundShape&&['fighter','attack','supportAircraft'].includes(f.groundKind)?Math.PI:0);
    const dim=groundView!=='all'&&groundView!==f.band, k=dim?groundRules().dimOpacity:1;
    model.traverse(o=>{if(o.material)o.material.opacity=o.material.userData.baseOpacity*k;});
    f.el.style.opacity=String(k*(f.team===1&&!f.seen?.42:1)); // 表示を薄くしても選択と射撃の規則は変えない。
    for(const s of f.ships)s.pos.copy(f.pos);
  }
  for(const [band,grid] of Object.entries(groundGrids)) grid.material.opacity=groundView===band?.32:groundView==='all'?.08:.025;
  groundFogDraw(); groundCaptureDraw(); groundHud();
  groundStrikeDraw(); groundTransportDraw(); groundSupplyDraw();
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
    if(!f.alive||f.embarked||groundAbsent(f)) continue;
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
    if(f.groundKind==='was') f.speed= WOS_TERRAIN[op.ground].unitTypes.was.speed*(f.band==='high'?8/3:f.band==='low'?2:1);
    if(!groundFlyingAircraft(f)||groundTrainingEnemy(f)||groundStaticTarget(f))f.pos.y=groundUnitHeight(f);
    if(groundFlyingAircraft(f)){
      if(f.order?.type==='attack'&&(!f.order.target.alive||!groundSeenBy(f.team,f.order.target))){f.order=null;dropArrow(f.arrow);f.arrow=null;nextOrder(f);}
      groundAirMotion(f,dt);continue;
    }
    if(f.order&&f.order.type==='move'&&followPath(f,dt)){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
    if(f.team===1&&!groundStaticTarget(f)&&!f.groundRout&&!f.groundRecover&&!f.groundAirState&&groundPermissionOnly(f)&&f.stance!=='evade'&&!f.order){
      const allowed=fleets.filter(t=>groundFireSolution(f,t)).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0];
      if(allowed)order(f,{type:'attack',target:allowed});
    }
    const target=f.order&&f.order.type==='attack'?f.order.target:null;
    if(target&&(!target.alive||!groundSeenBy(f.team,target))){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
    else if(target&&groundEngagementRange(f,target)>0&&groundDistanceTo(f,target)>groundEngagementRange(f,target)*.8){
      f.groundChaseT=(f.groundChaseT||0)-dt;
      if(f.groundChaseT<=0){ f.order.path=groundPath(f.pos,target.pos,groundMoveKind(f));f.groundChaseT=.5; }
      if(f.order.path&&(!op.npc||npcGroundHoldChase(f,target))) groundFollow(f,dt);
    }
  }
  groundTransportSync();
  groundBombStep();
  // 両軍とも全隊の移動後の視界を共有し、同じ視線・射程で撃つ。
  groundUpdateSight();
  for(const f of fleets){
    if(!f.alive||f.embarked||groundAbsent(f)) continue;
    if(f.groundAreaSalvo||f.groundVolley||f.groundBombRun){f.fireTarget=null;continue;}
    const target=f.order&&f.order.type==='attack'?f.order.target:null;
    // 毎回、現在の段から選び直す。予約・自動交戦・残った目標も同じ表を通す。
    f.fireTarget=target&&groundCanFire(f,target)?target:f.stance==='evade'||groundStaticTarget(f)?null:fleets.filter(t=>groundCanFire(f,t)).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0]||null;
    f.groundShotT=Math.max(0,(f.groundShotT||0)-dt);
    if(f.team===1&&(!op.npc||!npcGroundFires(f))&&!f.groundRout&&!f.groundRecover&&['artillery','guidedRocket','was','sea'].includes(f.groundKind)&&f.stance!=='evade') groundStrikeAI(f);
    if(f.fireTarget&&f.groundShotT===0){
      if(groundFireMode(f,f.fireTarget)==='indirect'){if(!op.npc||!npcGroundFires(f))groundVolleyStart(f,{point:f.fireTarget.pos});continue;}
      shoot(f.pos,f.fireTarget.pos,TEAM_COL[f.team],.25);
      damage(f.fireTarget,f.dmg*groundFireFactor(f,f.fireTarget)*groundMatchup(f,f.fireTarget)*groundSupplyAttackFactor(f),f);
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
  const c=WOS_TERRAIN[op.ground].combat;
  return f.groundKind==='guidedRocket'?(t.groundKind==='vehicle'?c.rocketTank:['low','high'].includes(t.band)?c.rocketAir:1):
    f.groundKind==='mobileAA'&&['low','high'].includes(t.band)?c.mobileAAAir:
    f.groundKind==='vehicle'&&['infantry','commando'].includes(t.groundKind)?c.tankInfantry:
    f.groundKind==='heavyInfantry'&&t.groundKind==='vehicle'?c.heavyTank:1;
}
function groundDamageFactor(t){
  if(t.groundUnloading)return groundLandingRules().damageFactor;
  if(t.band!=='ground'||!['infantry','heavyInfantry','commando'].includes(t.groundKind))return 1;
  const c=WOS_TERRAIN[op.ground].combat,m=c.urbanMargin;
  const cover=groundInForest(t.pos.x,t.pos.z)||groundBuildings.some(b=>t.pos.x>=b.minX-m&&t.pos.x<=b.maxX+m&&t.pos.z>=b.minZ-m&&t.pos.z<=b.maxZ+m);
  return cover?1-(1-c.infantryCover)*(t.groundKind==='commando'?c.commandoCoverBonus:1):1;
}
function groundMechanicalWear(f,dt){
  f.hpPool=Math.max(0,f.hpPool-(f.groundMaxHp||f.n*f.hp)*WOS_TERRAIN[op.ground].combat.mechanicalWearPerSec*dt);
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
function groundCanCapture(f){ return f.alive&&f.hpPool>0&&f.band==='ground'&&['infantry','was'].includes(f.groundKind)&&!f.embarked&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0); }
function groundCaptureSeconds(s,owner=s.owner){return owner===null?WOS_TERRAIN[op.ground].capture.neutralSeconds:s.captureSec;}
function groundCaptureStep(dt){
  if(over) return;
  for(const s of groundSites){
    const present=[false,false];
    for(const f of fleets) if(groundCanCapture(f)&&groundDistanceTo(f,s)<=s.captureRadius) present[f.team]=true;
    s.contested=present[0]&&present[1];s.capturingTeam=s.contested?null:present[0]?0:present[1]?1:null;
    if(s.contested) continue;
    const team=present[0]?0:present[1]?1:null;
    if(team===null||s.owner===team) continue;
    const seconds=groundCaptureSeconds(s);
    s.progress[team]=Math.min(seconds,s.progress[team]+dt);
    if(s.progress[team]>=seconds-1e-8){ s.owner=team; s.progress=[0,0]; }
  }
  if(!fleets.some(f=>f.team===0&&f.alive&&f.hpPool>0)) end(false);
  else if(!op.groundDrill&&op.win?.type==='groundHQ'&&(groundSites.some(s=>s.id===op.groundHQ?.[1]&&s.owner===0)||!fleets.some(f=>f.team===1&&f.alive&&f.hpPool>0))) end(true);
  else if(op.win?.type!=='groundHQ'&&(!op.groundDrill||tutorial?.skipped)&&groundSites.length&&(op.groundDrill?groundSites.filter(s=>s.id==='A'):groundSites.filter(s=>!(op.groundSupportSites||[]).includes(s.id))).every(s=>s.owner===0)) end(true);
}
function groundCaptureInit(){
  for(const s of groundSites){s.el?.remove();if(s.ring){groundVisuals.remove(s.ring);s.ring.geometry.dispose();s.ring.material.dispose();}}
  if(groundTerritory?.mesh){groundBoard.remove(groundTerritory.mesh);groundTerritory.mesh.geometry.dispose();groundTerritory.texture.dispose();groundTerritory.mesh.material.dispose();}
  const d=WOS_TERRAIN[op.ground], rules=d.capture;
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
      c.sections!==sections||c.sources!==sources||c.roadWidth!==d.capture.roadWidthKm||
      c.siteGeometry.length!==groundSites.length||c.siteGeometry.some((v,i)=>v.ref!==groundSites[i]||v.x!==v.ref.x||v.y!==v.ref.y||v.r!==v.ref.radiusKm)||
      c.sourceRefs.length!==sources.length||c.sourceRefs.some((v,i)=>v.ref!==sources[i]||v.path!==v.ref.path)){
      const floor=Math.floor,min=Math.min,max=Math.max,siteBins=new Map(),roadBins=new Map(),
        roadLimit=d.capture.roadWidthKm/2+(active&&net?1e-8:0);
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
        board:d.display.board,sea:d.water.sea,sites:groundSites,net,active,sections,sources,roadWidth:d.capture.roadWidthKm,
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
    s.el.style.visibility=p.z>1?'hidden':'visible'; s.el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
    const owner=s.knownOwner===0?'地球連合':s.knownOwner===1?'惑星共和国':'中立',progress=(s.knownProgress||[0,0]).map(n=>Math.floor(n/groundCaptureSeconds(s,s.knownOwner)*100));
    s.el.querySelector('small').textContent=`${s.knownOwner!==null&&s.knownOwner!==undefined&&Object.values(op.groundHQ||{}).includes(s.id)?'本営 / ':''}${owner} / ${groundCaptureReadout(s,groundCaptureSeconds(s,s.knownOwner))}　青${progress[0]}% 赤${progress[1]}%${groundSupplyActive()&&s.owner===0&&s.knownOwner===0?' / '+(groundSupplyAt({pos:s.pos,team:0}).rate===1?'接続':groundSupplyAt({pos:s.pos,team:0}).rate===.5?'半速':'切断'):''}`;
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
  const visible={board:list.some(f=>f.groundKind!=='sea'&&groundBands(f).includes('ground')),unload:carries||kinds.includes('apc'),land:list.some(f=>groundLandingShip(f.embarked||f)),strike:kinds.some(k=>['artillery','guidedRocket','was','vehicle','sea','supportAircraft'].includes(k)),bridge:kinds.includes('engineer'),supply:kinds.includes('supply')};
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
  for(const f of list){groundCancelWork(f);groundClearOrders(f);f.fireTarget=null;f.post.copy(f.pos);f.stance='engage';}
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
  return prefix+(s.knownCapturingTeam===team?'占領中':'中断')+' '+(team===0?'青':'赤')+' あと'+remaining+'秒';
}
