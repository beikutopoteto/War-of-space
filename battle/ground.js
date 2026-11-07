/* 地上作戦だけの高度・射撃・表示。宇宙の移動と射撃は sim.js の既存処理を使う。 */
const GROUND_BAND_NAMES={ground:'地上',low:'低',high:'高'};
let groundView='all', groundVisuals=null, groundGrids={};
let groundOrg=null, groundRosterNodes=[];
function groundInitOrg(org){
  groundOrg=org||{companies:fleets.filter(f=>f.team===0).map(f=>({id:'unit'+f.id,name:f.name,kind:f.groundKind})),battalions:[],brigades:[]};
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
    head.append(fold,pick);node.append(head);parent.append(node);groundRosterNodes.push({level,item,pick});
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
  for(const {level,item,pick} of groundRosterNodes){const m=groundMembers(level,item.id);pick.disabled=!m.length;pick.setAttribute('aria-pressed',String(!!m.length&&m.length===targets.length&&m.every(f=>targets.includes(f))));}
}
function groundRules(){ return WOS_TERRAIN[op.ground].bands; }
function groundBands(f){ return f.groundKind==='was'?['ground','low','high']:['fighter','attack','supportAircraft'].includes(f.groundKind)?['low','high']:['ground']; }
function groundMoveKind(f){ return (f.band||'ground')==='ground'?(['was','heavyInfantry'].includes(f.groundKind)?'infantry':f.groundKind):'air'; }
function groundUnitHeight(f){
  const h=groundRules().heights, from=h[f.band||'ground'];
  return groundHeight(f.pos.x,f.pos.z)+(f.bandTo?from+(h[f.bandTo]-from)*(1-f.bandLeft/groundRules().transitionSec):from);
}
// 直接射撃の表（設計案3）。地点攻撃・海軍はこの試作には含めない。
function groundFireFactor(f,t){
  const band=f.band||'ground', target=t.band||'ground', weak=groundRules().weakFire;
  const row={heavyInfantry:{ground:1,low:1,high:1},infantry:{ground:1,low:weak},scout:{ground:1},vehicle:{ground:1},
    fighter:{low:1,high:1},attack:band==='low'?{ground:1,low:1,sea:1}:{},
    was:band==='high'?{low:1,high:1}:band==='low'?{ground:1,low:1}:{ground:1}}[f.groundKind];
  return row&&row[target]||0;
}
function groundDistanceTo(f,t){ return Math.hypot(f.pos.x-t.pos.x,f.pos.z-t.pos.z); }
function groundCanFire(f,t){ return f.alive&&t.alive&&f.team!==t.team&&groundFireFactor(f,t)>0&&groundDistanceTo(f,t)<=f.range&&groundSeenBy(f.team,t)&&groundLineOfSight(f,t); }
function groundLandable(f){ return groundPass(f.pos.x/GROUND_SCALE+24,18-f.pos.z/GROUND_SCALE,'infantry'); }
function groundSetBand(list,band){
  if(!op.ground||!list.length||!list.every(f=>f.alive&&groundBands(f).includes(band)&&(band!=='ground'||groundLandable(f)))) return false;
  for(const f of list){
    if(f.bandTo===band) continue; // 同じ命令の連打では時計を戻さない。
    f.bandTo=band===f.band?null:band; f.bandLeft=f.bandTo?groundRules().transitionSec:0;
    f.pos.y=groundUnitHeight(f);
  }
  groundHud(); return true;
}
function groundHud(){
  const list=orderTargets(), panel=document.getElementById('alt'); panel.hidden=false;
  document.getElementById('groundSelected').textContent=list.length===1?list[0].name:list.length?`${list.length}隊`:'部隊を選択';
  document.querySelectorAll('#groundCommand button').forEach(b=>{
    const band=b.dataset.band;
    b.disabled=!list.length||!list.every(f=>groundBands(f).includes(band)&&(band!=='ground'||groundLandable(f)));
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
  groundView='all'; groundVisuals=null; groundGrids={}; groundSightReset();
  groundSites.forEach(s=>s.el.remove()); groundSites=[]; groundTerritory=null;
  document.getElementById('alt').classList.toggle('ground-alt',active);
  document.getElementById('groundAlt').hidden=!active;
  document.querySelectorAll('#groundView button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.band==='all')));
}
document.querySelectorAll('#groundCommand button').forEach(b=>b.addEventListener('click',()=>groundSetBand(orderTargets(),b.dataset.band)));
document.querySelectorAll('#groundView button').forEach(b=>b.addEventListener('click',()=>groundSetView(b.dataset.band)));
function groundInit(){
  groundVisuals=new THREE.Group(); groundVisuals.scale.setScalar(1/GROUND_SCALE); groundBoard.add(groundVisuals);
  for(const f of fleets){
    f.band=groundBands(f).includes(f.band)?f.band:groundBands(f)[0]; f.bandTo=null; f.bandLeft=0;
    // 兵科変更・追加で元の配置が通れなくなった時は、同じ出発点付近の通行可能なセルへ置く。
    if(!groundPass(f.pos.x/GROUND_SCALE+24,18-f.pos.z/GROUND_SCALE,groundMoveKind(f))){
      const size=WOS_TERRAIN[op.ground].meta.cellKm;let best=null,dist=Infinity;
      for(let y=size/2;y<36;y+=size)for(let x=size/2;x<48;x+=size){
        if(!groundPass(x,y,groundMoveKind(f)))continue;const p=groundPoint(x,y),d=p.distanceToSquared(f.pos);if(d<dist){best=p;dist=d;}
      }
      if(best)f.pos.copy(best);
    }
    f.pos.y=groundUnitHeight(f); f.post.copy(f.pos); f.home.copy(f.pos); f.seen=false; f.groundContacts=[null,null];
    for(const s of f.ships){ s.off.set(0,0,0); s.pos.copy(f.pos); }
    const model=f.groundModel=new THREE.Group(); groundVisuals.add(model);
    if(['fighter','attack','supportAircraft'].includes(f.groundKind)) groundAircraft(model,TEAM_COL[f.team]);
    else {
      const src=f.groundKind==='was'?craftMeshes[f.team].was:shipMeshes[f.team].cv;
      const mat=src.material.clone(); mat.transparent=true; mat.userData.baseOpacity=1;
      const mesh=new THREE.Mesh(src.geometry.clone(),mat); mesh.scale.setScalar(f.groundKind==='was'?1:SHIP_SIZE[f.type]||f.scale); model.add(mesh);
    }
  }
  // 見本と同じ薄い格子。地表の起伏と同じ高さを足し、盤の輪郭内だけに置く。
  const d=WOS_TERRAIN[op.ground], gap=d.bands.gridStep;
  for(const band of ['ground','low','high']){
    const points=[], height=d.bands.heights[band]+.12;
    const add=(x,z,xx,zz)=>{
      if(!groundPass(x/GROUND_SCALE+24,18-z/GROUND_SCALE,'air')||!groundPass(xx/GROUND_SCALE+24,18-zz/GROUND_SCALE,'air'))return;
      points.push(new THREE.Vector3(x,groundHeight(x,z)+height,z),new THREE.Vector3(xx,groundHeight(xx,zz)+height,zz));
    };
    for(let x=-96;x<=96;x+=gap)for(let z=-72;z<72;z+=1.6)add(x,z,x,z+1.6);
    for(let z=-72;z<=72;z+=gap)for(let x=-96;x<96;x+=1.6)add(x,z,x+1.6,z);
    const grid=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:band==='high'?0xe1d7ff:0xd5f8ff,transparent:true,opacity:.08,depthWrite:false}));
    groundGrids[band]=grid; groundVisuals.add(grid);
  }
  groundCaptureInit(); groundSightInit(); groundUpdateSight(); groundHud(); groundDraw();
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
function groundDraw(){
  if(!groundVisuals) return;
  for(const f of fleets){
    const model=f.groundModel; if(!model)continue; model.visible=f.alive&&(f.team===0||groundSeenBy(0,f));
    model.position.copy(f.pos); if(f.band==='ground')model.position.y+=.15; model.rotation.y=Math.atan2(f.heading.x,f.heading.z)+(['fighter','attack','supportAircraft'].includes(f.groundKind)?Math.PI:0);
    const dim=groundView!=='all'&&groundView!==f.band, k=dim?groundRules().dimOpacity:1;
    model.traverse(o=>{if(o.material)o.material.opacity=o.material.userData.baseOpacity*k;});
    f.el.style.opacity=String(k*(f.team===1&&!f.seen?.42:1)); // 表示を薄くしても選択と射撃の規則は変えない。
    for(const s of f.ships)s.pos.copy(f.pos);
  }
  for(const [band,grid] of Object.entries(groundGrids)) grid.material.opacity=groundView===band?.32:groundView==='all'?.08:.025;
  groundFogDraw(); groundCaptureDraw(); groundHud();
}
function groundStep(dt){
  if(over) return;
  groundUpdateSight();
  for(const f of fleets){
    if(!f.alive) continue;
    if(f.bandTo){
      f.bandLeft=Math.max(0,f.bandLeft-dt);
      if(f.bandLeft<1e-8){
        const arrived=f.bandTo!=='ground'||groundLandable(f);
        if(arrived) f.band=f.bandTo;
        f.bandTo=null; f.bandLeft=0; f.pos.y=groundUnitHeight(f);
        if(arrived&&f.order&&f.order.type==='move'){
          const dest=f.order.dest.clone(); order(f,{type:'move',dest});
          if(!f.order) nextOrder(f);
        }
      }
    }
    if(f.groundKind==='was') f.speed= WOS_TERRAIN[op.ground].unitTypes.was.speed*(f.band==='high'?8/3:f.band==='low'?2:1);
    f.pos.y=groundUnitHeight(f);
    if(f.order&&f.order.type==='move'&&followPath(f,dt)){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
    const target=f.order&&f.order.type==='attack'?f.order.target:null;
    if(target&&(!target.alive||!groundSeenBy(f.team,target))){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
    else if(target&&groundFireFactor(f,target)>0&&groundDistanceTo(f,target)>f.range*.8){
      f.groundChaseT=(f.groundChaseT||0)-dt;
      if(!f.order.path||f.groundChaseT<=0){ f.order.path=groundPath(f.pos,target.pos,groundMoveKind(f));f.groundChaseT=.5; }
      if(f.order.path) groundFollow(f,dt);
    }
  }
  // 両軍とも全隊の移動後の視界を共有し、同じ視線・射程で撃つ。
  groundUpdateSight();
  for(const f of fleets){
    if(!f.alive) continue;
    const target=f.order&&f.order.type==='attack'?f.order.target:null;
    // 毎回、現在の段から選び直す。予約・自動交戦・残った目標も同じ表を通す。
    f.fireTarget=target&&groundCanFire(f,target)?target:f.stance==='evade'?null:fleets.filter(t=>groundCanFire(f,t)).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0]||null;
    f.groundShotT=Math.max(0,(f.groundShotT||0)-dt);
    if(f.fireTarget&&f.groundShotT===0){
      shoot(f.pos,f.fireTarget.pos,TEAM_COL[f.team],.25);
      damage(f.fireTarget,f.dmg*groundFireFactor(f,f.fireTarget)*groundMatchup(f,f.fireTarget),f);
      f.groundShotT=groundRules().fireEvery;
    }
  }
  groundCaptureStep(dt);
}

function groundMatchup(f,t){
  const c=WOS_TERRAIN[op.ground].combat;
  return f.groundKind==='vehicle'&&t.groundKind==='infantry'?c.tankInfantry:
    f.groundKind==='heavyInfantry'&&t.groundKind==='vehicle'?c.heavyTank:1;
}
// 進捗は軍ごとに保持。所有者が変わった時だけ両軍のゲージを消す。
let groundSites=[], groundTerritory=null;
function groundCanCapture(f){ return f.alive&&f.hpPool>0&&f.band==='ground'&&['infantry','was'].includes(f.groundKind)&&!f.embarked; }
function groundCaptureStep(dt){
  if(over) return;
  for(const s of groundSites){
    const present=[false,false];
    for(const f of fleets) if(groundCanCapture(f)&&groundDistanceTo(f,s)<=s.captureRadius) present[f.team]=true;
    s.contested=present[0]&&present[1];
    if(s.contested) continue;
    const team=present[0]?0:present[1]?1:null;
    if(team===null||s.owner===team) continue;
    s.progress[team]=Math.min(s.captureSec,s.progress[team]+dt);
    if(s.progress[team]>=s.captureSec-1e-8){ s.owner=team; s.progress=[0,0]; }
  }
  if(!fleets.some(f=>f.team===0&&f.alive&&f.hpPool>0)) end(false);
  else if(groundSites.length&&groundSites.every(s=>s.owner===0)) end(true);
}
function groundCaptureInit(){
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
    for(let i=0;i<96;i++){const a=i/96*Math.PI*2,x=s.pos.x+Math.cos(a)*s.captureRadius,z=s.pos.z+Math.sin(a)*s.captureRadius;points.push(new THREE.Vector3(x,groundHeight(x,z)+.18,z));}
    const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xcad1c5,transparent:true,opacity:.9,depthWrite:false}));
    groundVisuals.add(ring); s.ring=ring;
  }
  const canvas=document.createElement('canvas'); canvas.width=480; canvas.height=360;
  const texture=new THREE.CanvasTexture(canvas), geometry=new THREE.PlaneBufferGeometry(d.meta.widthKm,d.meta.heightKm,192,144);
  geometry.rotateX(-Math.PI/2); const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,groundElevation(p.getX(i)+24,18-p.getZ(i))/GROUND_SCALE+.025);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  mesh.renderOrder=1; groundBoard.add(mesh);
  groundTerritory={canvas,texture,key:null,sections:groundRoadSections(d.objects.roads,groundSites)};
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
function groundInfluenceAt(x,y){
  let site=null, weight=Infinity;
  for(const s of groundSites){const ratio=Math.hypot(x-s.x,y-s.y)/s.radiusKm;if(ratio<=1&&ratio<weight){site=s;weight=ratio;}}
  if(site) return site;
  let distance=WOS_TERRAIN[op.ground].capture.roadWidthKm/2;
  for(const section of groundTerritory.sections){const d=groundDistance(x,y,section.path);if(d<distance){site=section.site;distance=d;}}
  return site;
}
function groundPaintTerritory(){
  const t=groundTerritory, key=groundSites.map(s=>`${s.owner}:${s.contested}`).join('|');
  if(!t||t.key===key)return; t.key=key;
  const d=WOS_TERRAIN[op.ground],ctx=t.canvas.getContext('2d'),img=ctx.createImageData(480,360),colors=[[75,160,225],[230,85,72],[160,168,165]];
  for(let py=0;py<360;py++)for(let px=0;px<480;px++){
    const x=(px+.5)/10,y=36-(py+.5)/10;
    if(!groundInside(x,y,d.display.board)||groundInside(x,y,d.water.sea))continue;
    const s=groundInfluenceAt(x,y); if(!s)continue;
    const stripe=s.contested&&(px+py)%12<3, color=stripe?[238,225,183]:colors[s.owner??2],k=(py*480+px)*4;
    img.data.set([...color,stripe?190:102],k); // 同じ軍の円と帯も1画素1回だけ。重なっても濃くならない。
  }
  ctx.putImageData(img,0,0);t.texture.needsUpdate=true;
}
function groundCaptureDraw(){
  groundPaintTerritory();
  for(const s of groundSites){
    const color=s.owner===0?'#8bdfff':s.owner===1?'#ff998b':'#cad1c5',p=proj(s.pos.clone().add(new THREE.Vector3(0,1,0)));
    s.ring.material.color.set(color); s.el.style.color=color;
    s.el.style.visibility=p.z>1?'hidden':'visible'; s.el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
    const owner=s.owner===0?'地球連合':s.owner===1?'惑星共和国':'中立',progress=s.progress.map(n=>Math.floor(n/s.captureSec*100));
    s.el.querySelector('small').textContent=`${owner}${s.contested?' / 争奪中':''}　青${progress[0]}% 赤${progress[1]}%`;
    s.el.querySelectorAll('i').forEach((bar,i)=>bar.style.width=`${s.progress[i]/s.captureSec*100}%`);
  }
}
