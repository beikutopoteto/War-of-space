/* 地上作戦だけの高度・射撃・表示。宇宙の移動と射撃は sim.js の既存処理を使う。 */
const GROUND_BAND_NAMES={ground:'地上',low:'低',high:'高'};
let groundView='all', groundVisuals=null, groundGrids={};
function groundRules(){ return WOS_TERRAIN[op.ground].bands; }
function groundBands(f){ return f.groundKind==='was'?['ground','low','high']:['fighter','attack'].includes(f.groundKind)?['low','high']:['ground']; }
function groundMoveKind(f){ return (f.band||'ground')==='ground'?(f.groundKind==='was'?'infantry':f.groundKind):'air'; }
function groundUnitHeight(f){
  const h=groundRules().heights, from=h[f.band||'ground'];
  return groundHeight(f.pos.x,f.pos.z)+(f.bandTo?from+(h[f.bandTo]-from)*(1-f.bandLeft/groundRules().transitionSec):from);
}
// 直接射撃の表（設計案3）。地点攻撃・海軍はこの試作には含めない。
function groundFireFactor(f,t){
  const band=f.band||'ground', target=t.band||'ground', weak=groundRules().weakFire;
  const row={infantry:{ground:1,low:weak},scout:{ground:1},vehicle:{ground:1},
    fighter:{low:1,high:1},attack:band==='low'?{ground:1,low:1,sea:1}:{},
    was:band==='high'?{low:1,high:1}:band==='low'?{ground:1,low:1}:{ground:1}}[f.groundKind];
  return row&&row[target]||0;
}
function groundDistanceTo(f,t){ return Math.hypot(f.pos.x-t.pos.x,f.pos.z-t.pos.z); }
function groundCanFire(f,t){ return f.alive&&t.alive&&f.team!==t.team&&groundFireFactor(f,t)>0&&groundDistanceTo(f,t)<=f.range; }
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
  groundView='all'; groundVisuals=null; groundGrids={};
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
    f.pos.y=groundUnitHeight(f); f.post.copy(f.pos); f.home.copy(f.pos); f.seen=true;
    for(const s of f.ships){ s.off.set(0,0,0); s.pos.copy(f.pos); }
    const model=f.groundModel=new THREE.Group(); groundVisuals.add(model);
    if(['fighter','attack'].includes(f.groundKind)) groundAircraft(model,TEAM_COL[f.team]);
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
  groundHud(); groundDraw();
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
    const model=f.groundModel; if(!model)continue; model.visible=f.alive;
    model.position.copy(f.pos); if(f.band==='ground')model.position.y+=.15; model.rotation.y=Math.atan2(f.heading.x,f.heading.z)+(['fighter','attack'].includes(f.groundKind)?Math.PI:0);
    const dim=groundView!=='all'&&groundView!==f.band, k=dim?groundRules().dimOpacity:1;
    model.traverse(o=>{if(o.material)o.material.opacity=o.material.userData.baseOpacity*k;});
    f.el.style.opacity=String(k); // 表示を薄くしても選択と射撃の規則は変えない。
    for(const s of f.ships)s.pos.copy(f.pos);
  }
  for(const [band,grid] of Object.entries(groundGrids)) grid.material.opacity=groundView===band?.32:groundView==='all'?.08:.025;
  groundHud();
}
function groundStep(dt){
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
    f.pos.y=groundUnitHeight(f);
    if(f.order&&f.order.type==='move'&&followPath(f,dt)){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
    const target=f.order&&f.order.type==='attack'?f.order.target:null;
    if(target&&!target.alive){ f.order=null; dropArrow(f.arrow); f.arrow=null; nextOrder(f); }
    else if(target&&groundFireFactor(f,target)>0&&groundDistanceTo(f,target)>f.range*.8){
      f.groundChaseT=(f.groundChaseT||0)-dt;
      if(!f.order.path||f.groundChaseT<=0){ f.order.path=groundPath(f.pos,target.pos,groundMoveKind(f));f.groundChaseT=.5; }
      if(f.order.path) groundFollow(f,dt);
    }
    // 毎回、現在の段から選び直す。予約・自動交戦・残った目標も同じ表を通す。
    f.fireTarget=target&&groundCanFire(f,target)?target:f.stance==='evade'?null:fleets.filter(t=>groundCanFire(f,t)).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0]||null;
    f.groundShotT=Math.max(0,(f.groundShotT||0)-dt);
    if(f.fireTarget&&f.groundShotT===0){
      shoot(f.pos,f.fireTarget.pos,TEAM_COL[f.team],.25);
      damage(f.fireTarget,f.dmg*groundFireFactor(f,f.fireTarget),f);
      f.groundShotT=groundRules().fireEvery;
    }
  }
}
