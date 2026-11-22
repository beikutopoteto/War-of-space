/* 地上専用の視線と共有視界。レーダーもこの判定を通す。宇宙の canSee は変えない。 */
let groundTerritorySight=null;
let groundSightHeightSource=null;
let groundSightHeights=null, groundFog=null, groundSightBuildingSource=null, groundSightBuildingBins=new Map();
function groundSightRules(){ return groundRuleSet().sight; }
function groundHeightCacheReset(){ groundSightHeights=null;groundSightHeightSource=null;groundTerritorySight=null; }
function groundSightReset(){ groundHeightCacheReset(); groundFog=null; groundSightBuildingSource=null; }
// 描画と同じ格子原点・間隔・対角線（三角形 a,b,d / b,c,d）。
function groundSightGrid(){
  const dimensions=groundDimensions(),d=dimensions.data,source=groundSightHeightSource;
  if(!source||source.dimensions!==dimensions||source.height!==d.height||source.terrain!==d.terrain||source.cells!==d.terrain.cells||source.analytic!==groundHeight){
    groundHeightCacheReset();
    groundSightHeightSource={dimensions,height:d.height,terrain:d.terrain,cells:d.terrain.cells,analytic:groundHeight};
    groundSightHeights=new Float64Array(dimensions.mesh.verticesX*dimensions.mesh.verticesZ);groundSightHeights.fill(NaN);
  }
  return dimensions.mesh;
}
function groundSightVertex(index,x,z){
  let h=groundSightHeights[index];
  if(Number.isNaN(h)){h=groundHeight(x,z);groundSightHeights[index]=h;}
  return h;
}
function groundSightHeight(x,z){
  const g=groundSightGrid(),gx=(x-g.originX)/g.stepX,gz=(z-g.originZ)/g.stepZ;
  if(gx<0||gx>g.segmentsX||gz<0||gz>g.segmentsZ)return groundHeight(x,z);
  const ix=Math.min(g.segmentsX-1,Math.floor(gx)),iz=Math.min(g.segmentsZ-1,Math.floor(gz)),tx=gx-ix,tz=gz-iz;
  const x0=g.originX+ix*g.stepX,z0=g.originZ+iz*g.stepZ,i=iz*g.verticesX+ix;
  if(tx+tz<=1)return groundSightVertex(i,x0,z0)*(1-tx-tz)+groundSightVertex(i+1,x0+g.stepX,z0)*tx+groundSightVertex(i+g.verticesX,x0,z0+g.stepZ)*tz;
  return groundSightVertex(i+g.verticesX+1,x0+g.stepX,z0+g.stepZ)*(tx+tz-1)+groundSightVertex(i+g.verticesX,x0,z0+g.stepZ)*(1-tx)+groundSightVertex(i+1,x0+g.stepX,z0)*(1-tz);
}
// 高度切り替え中の索敵も、射撃と同じく到着までは元の段を使う。
function groundEye(f){
  return {x:f.pos.x,z:f.pos.z,y:groundHeight(f.pos.x,f.pos.z)+groundBandHeight(f.band)+groundSightRules().eyeHeight};
}
function groundSightRange(f){
  const r=groundSightRules(), base=r[f.groundKind==='droneHive'?'scout':f.groundKind]??r.basic;
  return base*(1+r.heightGain*Math.min(1,Math.max(0,groundHeight(f.pos.x,f.pos.z))/r.heightForMax));
}
// 木を4戦闘単位の区画に分けて、その点の近くの木だけを調べる（広い演習場で木が数千本あるため）
let groundForestSource=null,groundForestBins=null;
function groundInForest(x,z){
  if(groundForestSource!==groundForests||groundForestBins.n!==groundForests.length){
    groundForestSource=groundForests;groundForestBins=new Map();groundForestBins.n=groundForests.length;
    for(const p of groundForests)for(let gz=Math.floor((p.z-p.r)/4);gz<=Math.floor((p.z+p.r)/4);gz++)for(let gx=Math.floor((p.x-p.r)/4);gx<=Math.floor((p.x+p.r)/4);gx++){
      const key=gx+','+gz;if(!groundForestBins.has(key))groundForestBins.set(key,[]);groundForestBins.get(key).push(p);
    }
  }
  const list=groundForestBins.get(Math.floor(x/4)+','+Math.floor(z/4));
  return !!list&&list.some(p=>Math.hypot(x-p.x,z-p.z)<=p.r);
}
function groundConcealment(f){
  return (f.band||'ground')==='ground'&&!groundWasFlying(f)&&groundInForest(f.pos.x,f.pos.z)?groundSightRules().forest:1;
}
// 線分と建物の箱の交差。薄い建物もサンプリングの間から透視しない。
function groundBuildingBlocks(a,b,box){
  let lo=0,hi=1;
  for(let axis=0;axis<3;axis++){
    const start=axis===0?a.x:axis===1?a.y:a.z,end=axis===0?b.x:axis===1?b.y:b.z;
    const min=axis===0?box.minX:axis===1?box.bottom:box.minZ,max=axis===0?box.maxX:axis===1?box.top:box.maxZ,delta=end-start;
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;continue;}
    let enter=(min-start)/delta,leave=(max-start)/delta;
    if(enter>leave){const swap=enter;enter=leave;leave=swap;}
    lo=Math.max(lo,enter);hi=Math.min(hi,leave);if(lo>hi)return false;
  }
  return hi>0&&lo<1;
}
// 立っている建物の中（平面で箱の内側）。中の隊は外が見え、外からも見える（立てこもる。ユーザー決定 2026-11-14）。
function groundInsideBuilding(p,box){ return p.x>=box.minX&&p.x<=box.maxX&&p.z>=box.minZ&&p.z<=box.maxZ; }
// 建物配列の参照が変わったときだけ町の凸包を作り直す。
let groundTownSource=null,groundTownCache=[];
function groundTownZones(){
  if(groundTownSource===groundBuildings)return groundTownCache;
  groundTownSource=groundBuildings;const groups=new Map(),margin=groundRuleSet().combat.townMargin;
  for(const b of groundBuildings)if(b.settlement!=null){if(!groups.has(b.settlement))groups.set(b.settlement,[]);groups.get(b.settlement).push(b);}
  groundTownCache=[];
  for(const [settlement,boxes] of groups){
    const points=[],heights=[];
    for(const b of boxes){const c=Math.cos(b.ang),s=Math.sin(b.ang);heights.push(b.top-b.bottom);
      for(const i of [-1,1])for(const j of [-1,1]){const x=b.x+i*b.w/2*c+j*b.d/2*s,z=b.z-i*b.w/2*s+j*b.d/2*c;
        for(let k=0;k<8;k++)points.push([x+margin*Math.cos(k*Math.PI/4),z+margin*Math.sin(k*Math.PI/4)]);}}
    points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const half=ps=>{const h=[];for(const p of ps){while(h.length>1&&cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}return h;};
    const lower=half(points),upper=half([...points].reverse());lower.pop();upper.pop();const hull=lower.concat(upper);
    heights.sort((a,b)=>a-b);const roof=(heights[(heights.length-1)>>1]+heights[heights.length>>1])/2;
    groundTownCache.push({settlement,hull,roof,minX:Math.min(...hull.map(p=>p[0])),maxX:Math.max(...hull.map(p=>p[0])),minZ:Math.min(...hull.map(p=>p[1])),maxZ:Math.max(...hull.map(p=>p[1]))});
  }
  return groundTownCache;
}
function groundInsideTown(p,t){
  if(p.x<t.minX||p.x>t.maxX||p.z<t.minZ||p.z>t.maxZ)return false;
  return t.hull.every((v,i)=>{const q=t.hull[(i+1)%t.hull.length];return (q[0]-v[0])*(p.z-v[1])-(q[1]-v[1])*(p.x-v[0])>=-1e-9;});
}
// Cyrus–Beck: 凸包の内側へ入る・出る線分の位置。
function groundTownInterval(a,b,t){
  if(Math.max(a.x,b.x)<t.minX||Math.min(a.x,b.x)>t.maxX||Math.max(a.z,b.z)<t.minZ||Math.min(a.z,b.z)>t.maxZ)return null;
  let lo=0,hi=1;const dx=b.x-a.x,dz=b.z-a.z;
  for(let i=0;i<t.hull.length;i++){const p=t.hull[i],q=t.hull[(i+1)%t.hull.length],ex=q[0]-p[0],ez=q[1]-p[1],v=ex*(a.z-p[1])-ez*(a.x-p[0]),d=ex*dz-ez*dx;
    if(Math.abs(d)<1e-12){if(v<0)return null;}else if(d>0)lo=Math.max(lo,-v/d);else hi=Math.min(hi,-v/d);if(lo>hi)return null;}
  return [lo,hi];
}
function groundTownHit(a,b,t){
  const range=groundTownInterval(a,b,t);if(!range)return null;
  const [lo,hi]=range,n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*(hi-lo)/.1));
  const below=u=>a.y+(b.y-a.y)*u<groundSightHeight(a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u)+t.roof;
  for(let i=0;i<=n;i++){const u=lo+(hi-lo)*i/n;
    if(below(u)){
      if(!i)return u;
      // 屋根より低くなった位置を、最初の検出区間内で詰める。
      let left=lo+(hi-lo)*(i-1)/n,right=u;
      for(let j=0;j<24;j++){const mid=(left+right)/2;if(below(mid))right=mid;else left=mid;}
      return right;
    }}
  return null;
}
function groundBuildingsBlock(a,b){
  for(const town of groundTownZones())if(!groundInsideTown(a,town)&&!groundInsideTown(b,town)&&groundTownHit(a,b,town)!==null)return true;
  // 建物を4戦闘単位の区画に分け、線分の範囲外の町を調べない。
  if(groundSightBuildingSource!==groundBuildings){
    groundSightBuildingSource=groundBuildings;groundSightBuildingBins=new Map();
    for(const box of groundBuildings)if(box.settlement==null)for(let z=Math.floor(box.minZ/4);z<=Math.floor(box.maxZ/4);z++)for(let x=Math.floor(box.minX/4);x<=Math.floor(box.maxX/4);x++){
      const key=x+','+z;if(!groundSightBuildingBins.has(key))groundSightBuildingBins.set(key,[]);groundSightBuildingBins.get(key).push(box);
    }
  }
  if(!groundSightBuildingBins.size)return false;
  const minX=Math.floor(Math.min(a.x,b.x)/4),maxX=Math.floor(Math.max(a.x,b.x)/4),minZ=Math.floor(Math.min(a.z,b.z)/4),maxZ=Math.floor(Math.max(a.z,b.z)/4);
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
    const boxes=groundSightBuildingBins.get(x+','+z);
    if(boxes)for(const box of boxes)if(!groundInsideBuilding(a,box)&&!groundInsideBuilding(b,box)&&groundBuildingBlocks(a,b,box))return true;
  }
  return false;
}
function groundClearLine(a,b){
  if(groundBuildingsBlock(a,b))return false;
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/groundSightRules().rayStep));
  for(let i=1;i<n;i++){
    const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    if(groundSightHeight(x,z)>a.y+(b.y-a.y)*t)return false;
  }
  return true;
}
function groundLineOfSight(f,t){ return groundClearLine(groundEye(f),groundEye(t)); }
function groundCanSee(f,t){
  if(groundAbsent(f)||groundAbsent(t))return false;
  return f.alive&&t.alive&&!f.embarked&&!t.embarked&&f.team!==t.team&&groundDistanceTo(f,t)<=groundSightRange(f)*groundConcealment(t)&&groundLineOfSight(f,t);
}
// 占領した拠点も、その周り（site、仮に5km）を見る（ユーザー決定 2026-11-15）。中立の拠点は誰の目にもならない。
// 拠点の目は町の屋上（いちばん高い建物の上）に置く。地面の高さだと、まわりの建物にすべての向きを遮られる（2026-11-16）
let groundSiteRoofSource=null,groundSiteRoofs=new Map();
function groundSiteRoof(s){
  const list=typeof groundBuildings==='undefined'?[]:groundBuildings;
  if(groundSiteRoofSource!==list){groundSiteRoofSource=list;groundSiteRoofs=new Map();}
  if(!groundSiteRoofs.has(s)){const R=2*GROUND_SCALE;let top=-Infinity;for(const b of list)if(Math.hypot((b.minX+b.maxX)/2-s.pos.x,(b.minZ+b.maxZ)/2-s.pos.z)<=R)top=Math.max(top,b.top);groundSiteRoofs.set(s,top);}
  return groundSiteRoofs.get(s);
}
function groundSiteObservers(team){
  const r=groundSightRules();
  return (typeof groundSites==='undefined'?[]:groundSites).filter(s=>s.owner===team).map(s=>({eye:{x:s.pos.x,z:s.pos.z,y:Math.max(groundSightHeight(s.pos.x,s.pos.z),groundSiteRoof(s))+r.eyeHeight},range:r.site}));
}
function groundSiteSees(observers,t){
  if(!observers.length||groundAbsent(t)||!t.alive||t.embarked)return false;
  const eye=groundEye(t),range=groundConcealment(t);
  return observers.some(o=>Math.hypot(eye.x-o.eye.x,eye.z-o.eye.z)<=o.range*range&&groundClearLine(o.eye,eye));
}
function groundSeenBy(team,t){ return !!(t.groundVisible&&t.groundVisible[team]); }
// 地点の観測も⑤の距離・地形遮蔽を共有する。敵部隊の有無や射手の直線遮蔽とは独立。
function groundPointSeenBy(team,p){
  const target={x:p.x,z:p.z,y:groundSightHeight(p.x,p.z)+groundSightRules().eyeHeight};
  return fleets.some(f=>f.team===team&&f.alive&&!f.embarked&&!groundAbsent(f)&&Math.hypot(p.x-f.pos.x,p.z-f.pos.z)<=groundSightRange(f)&&groundClearLine(groundEye(f),target))
    ||groundSiteObservers(team).some(o=>Math.hypot(p.x-o.eye.x,p.z-o.eye.z)<=o.range&&groundClearLine(o.eye,target));
}
// 道路の所有者は現在見える地点でだけ更新する。自軍の占領は命令の結果として既知。
// 拠点の持ち主は、中立でなければ視界の外でも分かる（ユーザー決定 2026-11-15）。進みと競合は見えるときだけ。
function groundRememberTerritory(){
  const observers=fleets.filter(f=>f.team===0&&f.alive&&!f.embarked&&!groundAbsent(f)).map(f=>({eye:groundEye(f),range:groundSightRange(f)})).concat(groundSiteObservers(0));
  const net=groundSupplyActive()?groundSupplyNet:null;
  const key=observers.map(o=>`${o.eye.x},${o.eye.y},${o.eye.z},${o.range}`).join('|')+'/'+groundSites.map(s=>`${s.owner}:${s.contested}:${s.progress}:${s.capturingTeam}:${s.leading}`).join('|')+'/'+(net?.edges.map(e=>`${e.owner}:${e.contested}:${e.progress}:${e.capturingTeam}`).join('|')||'');
  // 同じ観測位置と所有状態で、移動前後・描画ごとに視線を引き直さない。
  if(groundTerritorySight?.sites===groundSites&&groundTerritorySight.net===net&&groundTerritorySight.key===key)return;
  groundTerritorySight={sites:groundSites,net,key};
  const remember=(s,p)=>{
    s.observed=s.owner===0||observers.some(o=>Math.hypot(p.x-o.eye.x,p.z-o.eye.z)<=o.range&&groundClearLine(o.eye,{x:p.x,z:p.z,y:groundSightHeight(p.x,p.z)+groundSightRules().eyeHeight}));
    if(s.observed){s.knownOwner=s.owner;s.knownContested=s.contested;s.knownProgress=s.progress?.slice();s.knownCapturingTeam=s.capturingTeam??null;s.knownLeading=s.leading??null;}
    else if(s.knownOwner===undefined){s.knownOwner=null;s.knownContested=false;}
  };
  for(const s of groundSites){remember(s,s.pos);s.knownOwner=s.owner;}
  if(net)for(const e of net.edges){
    if(e.circle)continue;
    remember(e,groundPoint(e.x,e.y));
  }
}
function groundUpdateSight(){
  if(!op.ground)return;
  const live=fleets.filter(f=>f.alive&&!f.embarked),sites=[groundSiteObservers(0),groundSiteObservers(1)];
  for(const t of fleets){
    t.groundVisible=[false,false];t.groundContacts=t.groundContacts||[null,null];
    for(const team of [0,1]){
      const visible=t.alive&&!t.embarked&&!groundAbsent(t)&&(t.team===team||live.some(f=>f.team===team&&groundCanSee(f,t))||groundSiteSees(sites[team],t));
      t.groundVisible[team]=visible;
      if(visible)t.groundContacts[team]={pos:t.pos.clone(),at:gameSec,...(op.npc&&!op.groundDrill?{power:npcGroundPower(t),role:window.WOS_DATA.npc.roles.ground[t.groundKind]||'line',kind:t.groundKind}:{})};
    }
    // seen は宇宙と同じ「相手に発見されている」。表示は青から見た赤だけを隠す。
    t.seen=t.groundVisible[1-t.team];
    if(t.seen)t.everSeen=true;
    const contact=t.groundContacts[1-t.team];
    t.lastPos=contact?contact.pos.clone():null;t.lostAt=contact?contact.at:-1e9;
  }
  groundRememberTerritory();
}
function groundSightInit(){
  const d=groundData(),r=groundRuleSet().sight,canvas=document.createElement('canvas');
  canvas.width=Math.ceil(d.meta.widthKm*GROUND_SCALE/r.fogStep);canvas.height=Math.ceil(d.meta.heightKm*GROUND_SCALE/r.fogStep);
  const texture=new THREE.CanvasTexture(canvas),geo=new THREE.PlaneGeometry(d.meta.widthKm,d.meta.heightKm,groundDimensions().mesh.segmentsX,groundDimensions().mesh.segmentsZ);
  geo.rotateX(-Math.PI/2);const p=geo.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,groundElevation(groundMapX(p.getX(i)*GROUND_SCALE),groundMapY(p.getZ(i)*GROUND_SCALE))/GROUND_SCALE+.04);
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  mesh.renderOrder=3;groundBoard.add(mesh);
  const ctx=canvas.getContext('2d');
  groundFog={canvas,texture,ctx,pixels:ctx.createImageData(canvas.width,canvas.height),next:-Infinity};
}
function groundFogDraw(force=false){
  const fog=groundFog;if(!fog||!force&&gameSec<fog.next)return;
  const d=groundData(),r=groundRuleSet().sight,{width,height}=fog.canvas,raw=fog.pixels.data;
  const observers=fleets.filter(f=>f.alive&&f.team===0&&!f.embarked&&!f.groundExited).map(f=>({eye:groundEye(f),range:groundSightRange(f)})).concat(groundSiteObservers(0));
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const gx=(px+.5)/width*d.meta.widthKm,gy=(1-(py+.5)/height)*d.meta.heightKm,x=groundWorldX(gx),z=groundWorldZ(gy);
    const k=(py*width+px)*4;let visible=false;
    if(groundInside(gx,gy,d.display.board)){
      const target={x,z,y:groundSightHeight(x,z)+r.eyeHeight};
      visible=observers.some(o=>Math.hypot(x-o.eye.x,z-o.eye.z)<=o.range&&groundClearLine(o.eye,target));
      raw[k+3]=visible?0:r.fogAlpha;
    }else raw[k+3]=0;
  }
  fog.ctx.putImageData(fog.pixels,0,0);fog.texture.needsUpdate=true;fog.next=gameSec+r.fogEvery;
}
