/* 地上専用の視線と共有視界。レーダーもこの判定を通す。宇宙の canSee は変えない。 */
let groundTerritorySight=null;
let groundSightHeightSource=null;
let groundSightHeights=null, groundFog=null, groundSightBuildingSource=null, groundSightBuildingBins=new Map();
function groundSightRules(){ return groundData().sight; }
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
  return {x:f.pos.x,z:f.pos.z,y:groundHeight(f.pos.x,f.pos.z)+(groundRules().heights[f.band||'ground']||0)+groundSightRules().eyeHeight};
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
  return (f.band||'ground')==='ground'&&groundInForest(f.pos.x,f.pos.z)?groundSightRules().forest:1;
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
function groundBuildingsBlock(a,b){
  // 建物を4戦闘単位の区画に分け、線分の範囲外の町を調べない。
  if(groundSightBuildingSource!==groundBuildings){
    groundSightBuildingSource=groundBuildings;groundSightBuildingBins=new Map();
    for(const box of groundBuildings)for(let z=Math.floor(box.minZ/4);z<=Math.floor(box.maxZ/4);z++)for(let x=Math.floor(box.minX/4);x<=Math.floor(box.maxX/4);x++){
      const key=x+','+z;if(!groundSightBuildingBins.has(key))groundSightBuildingBins.set(key,[]);groundSightBuildingBins.get(key).push(box);
    }
  }
  if(!groundBuildings.length)return false;
  const minX=Math.floor(Math.min(a.x,b.x)/4),maxX=Math.floor(Math.max(a.x,b.x)/4),minZ=Math.floor(Math.min(a.z,b.z)/4),maxZ=Math.floor(Math.max(a.z,b.z)/4);
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
    const boxes=groundSightBuildingBins.get(x+','+z);
    if(boxes)for(const box of boxes)if(groundBuildingBlocks(a,b,box))return true;
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
function groundSeenBy(team,t){ return !!(t.groundVisible&&t.groundVisible[team]); }
// 地点の観測も⑤の距離・地形遮蔽を共有する。敵部隊の有無や射手の直線遮蔽とは独立。
function groundPointSeenBy(team,p){
  const target={x:p.x,z:p.z,y:groundSightHeight(p.x,p.z)+groundSightRules().eyeHeight};
  return fleets.some(f=>f.team===team&&f.alive&&!f.embarked&&!groundAbsent(f)&&Math.hypot(p.x-f.pos.x,p.z-f.pos.z)<=groundSightRange(f)&&groundClearLine(groundEye(f),target));
}
// 所有者は現在見える地点でだけ更新する。自軍の占領は命令の結果として既知。
function groundRememberTerritory(){
  const observers=fleets.filter(f=>f.team===0&&f.alive&&!f.embarked&&!groundAbsent(f)).map(f=>({eye:groundEye(f),range:groundSightRange(f)}));
  const net=groundSupplyActive()?groundSupplyNet:null;
  const key=observers.map(o=>`${o.eye.x},${o.eye.y},${o.eye.z},${o.range}`).join('|')+'/'+groundSites.map(s=>`${s.owner}:${s.contested}:${s.progress}:${s.capturingTeam}`).join('|')+'/'+(net?.edges.map(e=>`${e.owner}:${e.contested}:${e.progress?.map(Math.floor)}:${e.capturingTeam}`).join('|')||'');
  // 同じ観測位置と所有状態で、移動前後・描画ごとに視線を引き直さない。
  if(groundTerritorySight?.sites===groundSites&&groundTerritorySight.net===net&&groundTerritorySight.key===key)return;
  groundTerritorySight={sites:groundSites,net,key};
  const remember=(s,p)=>{
    s.observed=s.owner===0||observers.some(o=>Math.hypot(p.x-o.eye.x,p.z-o.eye.z)<=o.range&&groundClearLine(o.eye,{x:p.x,z:p.z,y:groundSightHeight(p.x,p.z)+groundSightRules().eyeHeight}));
    if(s.observed){s.knownOwner=s.owner;s.knownContested=s.contested;s.knownProgress=s.progress?.slice();s.knownCapturingTeam=s.capturingTeam??null;}
    else if(s.knownOwner===undefined){s.knownOwner=null;s.knownContested=false;}
  };
  for(const s of groundSites)remember(s,s.pos);
  if(net)for(const e of net.edges){
    if(e.circle)continue;
    remember(e,groundPoint(e.x,e.y));
  }
}
function groundUpdateSight(){
  if(!op.ground)return;
  const live=fleets.filter(f=>f.alive&&!f.embarked);
  for(const t of fleets){
    t.groundVisible=[false,false];t.groundContacts=t.groundContacts||[null,null];
    for(const team of [0,1]){
      const visible=t.alive&&!t.embarked&&!groundAbsent(t)&&(t.team===team||live.some(f=>f.team===team&&groundCanSee(f,t)));
      t.groundVisible[team]=visible;
      if(visible)t.groundContacts[team]={pos:t.pos.clone(),at:gameSec,...(op.npc&&!op.groundDrill?{power:npcGroundPower(t),role:window.WOS_DATA.npc.roles.ground[t.groundKind]||'line'}:{})};
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
  const d=groundData(),r=d.sight,canvas=document.createElement('canvas');
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
  const d=groundData(),r=d.sight,{width,height}=fog.canvas,raw=fog.pixels.data;
  const observers=fleets.filter(f=>f.alive&&f.team===0&&!f.embarked).map(f=>({eye:groundEye(f),range:groundSightRange(f)}));
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
