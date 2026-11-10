/* 地上演習の盤。見本 ground-b.html と同じ地形・水系・高度を使う。座標は 1 km = 4 戦闘単位。 */
const GROUND_SCALE=4;
let groundBoard=null, groundWaterMaterial=null;
let groundTerrainId=null, groundDimensionCache=null;
// setup の明示IDを優先。setup前のNode確認等では作戦、最後に旧演習を使う。
function groundData(){ return WOS_TERRAIN[groundTerrainId||(typeof op!=='undefined'&&op.ground)||'exercise2']; }
// 仮の性能上限。距離の尺度（4 world/km）とデータの物体密度は変えない。
const GROUND_MESH_MAX_SEGMENTS=512, GROUND_TEXTURE_MAX_SIZE=2048;
function groundDimensions(){
  const d=groundData(),widthKm=d.meta.widthKm,heightKm=d.meta.heightKm;
  if(groundDimensionCache?.data===d&&groundDimensionCache.widthKm===widthKm&&groundDimensionCache.heightKm===heightKm)return groundDimensionCache;
  const widthWorld=widthKm*GROUND_SCALE,heightWorld=heightKm*GROUND_SCALE;
  const spacing=Math.max(1,2**Math.ceil(Math.log2(Math.max(widthWorld,heightWorld)/GROUND_MESH_MAX_SEGMENTS)));
  const segmentsX=Math.max(1,Math.ceil(widthWorld/spacing)),segmentsZ=Math.max(1,Math.ceil(heightWorld/spacing));
  const textureScale=Math.min(24,GROUND_TEXTURE_MAX_SIZE/Math.max(widthKm,heightKm));
  const mesh=Object.freeze({originX:-widthWorld/2,originZ:-heightWorld/2,stepX:widthWorld/segmentsX,stepZ:heightWorld/segmentsZ,segmentsX,segmentsZ,verticesX:segmentsX+1,verticesZ:segmentsZ+1});
  return groundDimensionCache=Object.freeze({data:d,widthKm,heightKm,widthWorld,heightWorld,halfWidthWorld:widthWorld/2,halfHeightWorld:heightWorld/2,halfWidthKm:widthKm/2,halfHeightKm:heightKm/2,
    minX:-widthWorld/2,maxX:widthWorld/2,minZ:-heightWorld/2,maxZ:heightWorld/2,mesh,
    texture:Object.freeze({scale:textureScale,width:Math.ceil(widthKm*textureScale),height:Math.ceil(heightKm*textureScale)})});
}
function groundMeshGrid(){ return groundDimensions().mesh; }
function groundMapX(worldX){ return worldX/GROUND_SCALE+groundDimensions().halfWidthKm; }
function groundMapY(worldZ){ return groundDimensions().halfHeightKm-worldZ/GROUND_SCALE; }
function groundWorldX(mapX){ return (mapX-groundDimensions().halfWidthKm)*GROUND_SCALE; }
function groundWorldZ(mapY){ return (groundDimensions().halfHeightKm-mapY)*GROUND_SCALE; }
// 描画と同じ樹冠・建物の位置を地上の索敵に渡す（戦闘単位）。
let groundForests=[], groundBuildings=[];
function groundInside(x,y,poly){ let hit=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j]; if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) hit=!hit; } return hit; }
function groundDistance(x,y,points){ let best=Infinity; for(let i=0;i<points.length-1;i++){ const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))); best=Math.min(best,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)); } return best; }
function groundElevation(x,y){
  const d=groundData(),spec=d.height;
  if(groundInside(x,y,d.water.sea))return 0;
  let sum=0,weight=0;
  for(const p of spec.points){const w=1/(1+((x-p.x)**2+(y-p.y)**2)/spec.interpolationRadiusKm**2);sum+=p.m*w;weight+=w;}
  let h=weight?sum/weight:spec.baseM;
  const l=spec.levee,river=l&&d.water.rivers.find(r=>r.id===l.river);
  if(river){const dist=groundDistance(x,y,river.points);h+=l.heightM*Math.exp(-(((dist-l.bankOffsetKm)/l.widthKm)**2))-l.channelCutM*Math.exp(-((dist/l.channelHalfWidthKm)**2));}
  const t=spec.terrace;if(t)h+=t.heightM/(1+Math.exp(-(y-t.edgeYKm)/t.widthKm));
  const hill=p=>Math.exp(-(((x-p.x)/p.widthXKm)**2+((y-p.y)/p.widthYKm)**2));
  for(const p of spec.depressions||[])h-=p.depthM*hill(p);
  for(const p of spec.sandbars||[])h+=p.heightM*hill(p);
  if(spec.observationHill)h+=spec.observationHill.heightM*hill(spec.observationHill);
  h+=(spec.noiseM||0)*Math.sin(x*1.71+y*.62)*Math.cos(y*1.19);
  return Math.max(0,h*d.meta.elevationExaggeration/1000)*GROUND_SCALE;
}
function groundHeight(x,z){ return groundElevation(groundMapX(x),groundMapY(z)); }
function groundPoint(x,y){ return new THREE.Vector3(groundWorldX(x),groundElevation(x,y),groundWorldZ(y)); }
// 川幅は各区間で補間し、橋と浅瀬は川ごとに判定する。
function groundRiverAt(x,y,river){
  let best=null;
  for(let i=0;i<river.points.length-1;i++){
    const a=river.points[i],b=river.points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(len*len))),cx=a[0]+t*dx,cy=a[1]+t*dy,dist=Math.hypot(x-cx,y-cy);
    if(!best||dist<best.dist)best={river:river.id,x:cx,y:cy,dist,width:river.widths[i]*(1-t)+river.widths[i+1]*t,tx:dx/len,ty:dy/len};
  }
  return best;
}
function groundRiverFactor(x,y,kind){
  const d=groundData(); let factor=1;
  for(const river of d.water.rivers){
    const r=groundRiverAt(x,y,river);
    if(r.dist>=r.width/2+.12)continue;
    const bridge=d.objects.bridges.some(b=>b.river===river.id&&Math.hypot(x-b.x,y-b.y)<.9)||groundBuiltBridgeAt(x,y,river.id);
    const ford=d.objects.fords.some(f=>f.river===river.id&&Math.abs((x-f.x)*r.tx+(y-f.y)*r.ty)<=(f.widthKm+d.meta.cellKm)/2&&Math.hypot(x-f.x,y-f.y)<r.width/2+d.meta.cellKm);
    if(!bridge&&!ford)factor=Math.min(factor,d.movement.river[kind]??0);
  }
  return factor;
}
function groundPass(x,y,kind='vehicle'){ const d=groundData(),sea=groundInside(x,y,d.water.sea); return x>=0&&x<d.meta.widthKm&&y>=0&&y<d.meta.heightKm&&groundInside(x,y,d.display.board)&&(kind==='air'||(kind==='sea'?sea:!sea&&!d.water.ponds.some(p=>groundInside(x,y,p))&&groundRiverFactor(x,y,kind)>0)); }
function groundFactor(x,z,kind){ if(kind==='air'||kind==='sea') return 1; const d=groundData(),gx=groundMapX(x),gy=groundMapY(z),c=Math.floor(gx/d.meta.cellKm),r=Math.floor(gy/d.meta.cellKm),marsh=d.terrain.cells[r*d.terrain.cols+c]==='沼地'?(d.movement.marsh[kind]??1):1; return marsh*groundRiverFactor(gx,gy,kind); }
let groundBackground=null;
function groundSetup(id){
  groundTerrainId=id||null;groundDimensionCache=null;
  if(typeof groundSightReset==='function')groundSightReset();
  if(typeof groundBallisticReset==='function')groundBallisticReset();
  if(groundWaterMaterial){ groundWaterMaterial.uniforms.mask.value.dispose(); groundWaterMaterial=null; }
  if(groundBoard){ scene.remove(groundBoard); groundBoard.traverse(o=>{if(o.geometry)o.geometry.dispose(); if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}}); groundBoard=null; }
  groundForests=[]; groundBuildings=[];
  const active=!!id; groundConfigure(active);
  grid.visible=!active; starField.visible=!active; skyObj.visible=!active; fieldRocks.visible=!active; debrisObj.visible=!active; cloudObj.visible=!active; if(active) farPlanet.visible=false;
  renderer.shadowMap.enabled=active; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=active?THREE.NoToneMapping:THREE.ACESFilmicToneMapping;
  ambient.color.setHex(active?0xb7cbd0:0x3a4a66); ambient.intensity=active?.5:.9;
  sun.intensity=active?1.1:1.6; sun.castShadow=active; rim.visible=!active;
  if(!active){ scene.background=new THREE.Color(0x05080f); return; }
  const dimensions=groundDimensions(),shadowScale=Math.max(1,dimensions.widthWorld/192,dimensions.heightWorld/144);
  sun.position.set(-144*shadowScale,72*shadowScale,-104*shadowScale); sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-140*shadowScale,right:140*shadowScale,top:120*shadowScale,bottom:-120*shadowScale,near:.5,far:440*shadowScale}); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias=-.0003;
  if(!groundBackground){ const bg=document.createElement('canvas'); bg.width=512; bg.height=512; const c=bg.getContext('2d'),gradient=c.createRadialGradient(256,230,0,256,230,360); gradient.addColorStop(0,'#122c42'); gradient.addColorStop(.5,'#071422'); gradient.addColorStop(1,'#020913'); c.fillStyle=gradient; c.fillRect(0,0,512,512); groundBackground=new THREE.CanvasTexture(bg); }
  scene.background=groundBackground;
  const d=groundData(),W=d.meta.widthKm,H=d.meta.heightKm,seaMode='real',inside=groundInside,segmentDistance=groundDistance,elevation=(x,y)=>groundElevation(x,y)/GROUND_SCALE,toX=x=>groundWorldX(x)/GROUND_SCALE,toZ=y=>groundWorldZ(y)/GROUND_SCALE;
  function nearestRoadPoint(x,y){let best=Infinity,result={x,y,dx:1,dy:0};for(const road of d.objects.roads)for(let i=0;i<road.points.length-1;i++){const a=road.points[i],b=road.points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/len)),px=a[0]+t*dx,py=a[1]+t*dy,dist=Math.hypot(x-px,y-py);if(dist<best){best=dist;result={x:px,y:py,dx:dx/Math.sqrt(len),dy:dy/Math.sqrt(len)}}}return result}
  const world=groundBoard=new THREE.Group(); world.scale.setScalar(GROUND_SCALE); scene.add(world);
function polyPath(ctx,points,scale){ctx.beginPath();points.forEach(([x,y],i)=>{const px=x*scale,py=(H-y)*scale;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.closePath()}
function smoothPath(ctx,points,scale){ctx.beginPath();const n=points.length;for(let i=0;i<n;i++){const a=points[(i+n-1)%n],b=points[i],c=points[(i+1)%n],start=[(a[0]+b[0])/2,(a[1]+b[1])/2],end=[(b[0]+c[0])/2,(b[1]+c[1])/2];if(i===0)ctx.moveTo(start[0]*scale,(H-start[1])*scale);ctx.quadraticCurveTo(b[0]*scale,(H-b[1])*scale,end[0]*scale,(H-end[1])*scale)}ctx.closePath()}
function smoothOutline(points){const curve=new THREE.CatmullRomCurve3(points.map(([x,y])=>new THREE.Vector3(...onGround(x,y,.03))),true,'centripetal');return curve.getPoints(points.length*8).map(p=>[p.x,p.y,p.z])}
function drawLine(ctx,points,width,color,scale){ctx.beginPath();points.forEach(([x,y],i)=>{const px=x*scale,py=(H-y)*scale;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width*scale;ctx.strokeStyle=color;ctx.stroke()}
const outlineControl=d.display.board.filter((_,i)=>i%3===0),outlineCurve=new THREE.CatmullRomCurve3(outlineControl.map(([x,y])=>new THREE.Vector3(x,y,0)),true,'centripetal'),boardOutline=outlineCurve.getPoints(320).map(p=>[p.x,p.y]);
const scale=dimensions.texture.scale,canvas=document.createElement('canvas');canvas.width=dimensions.texture.width;canvas.height=dimensions.texture.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#988e64';ctx.fillRect(0,0,canvas.width,canvas.height);
// Draw cell colours to an offscreen map, then interpolate for continuous ground texture.
const cell=d.meta.cellKm,ground=document.createElement('canvas');ground.width=d.terrain.cols;ground.height=d.terrain.rows;const groundCtx=ground.getContext('2d');groundCtx.fillStyle='#a29c75';groundCtx.fillRect(0,0,ground.width,ground.height);
const terrainColors={'平地':'#a4aa7b','沼地':'#526e59','山岳':'#85818e','砂漠':'#c4b69a'};
for(let row=0;row<d.terrain.rows;row++)for(let col=0;col<d.terrain.cols;col++){const type=d.terrain.cells[row*d.terrain.cols+col];if(!type)continue;const x=(col+.5)*cell,y=(row+.5)*cell,surface=d.surface.find(v=>v.as===type&&inside(x,y,v.polygon));let color=terrainColors[type];if(type==='平地'&&surface&&surface.type==='field'){let v=(Math.floor(col/10)*7+Math.floor(row/3)*11)%4;color=['#a99e70','#8c9968','#b1aa78','#948c68'][v]}else if(type==='沼地'&&surface&&surface.type==='reed')color='#496550';else if(type==='砂漠'&&surface&&surface.type==='salt')color='#c5bda6';groundCtx.fillStyle=color;groundCtx.fillRect(col,d.terrain.rows-1-row,1,1)}
ctx.save();ctx.imageSmoothingEnabled=true;ctx.filter='blur(5px)';ctx.drawImage(ground,0,0,canvas.width,canvas.height);ctx.restore();
// Seeded, clipped texture preserves each surface's designed extent.
function textureNoise(poly,seed,count,palette){let state=seed;function next(){state=state*16807%2147483647;return (state-1)/2147483646}ctx.save();if(poly){polyPath(ctx,poly,scale);ctx.clip()}for(let i=0;i<count;i++){const x=next()*canvas.width,y=next()*canvas.height;ctx.fillStyle=palette[Math.floor(next()*palette.length)];const size=1+next()*5;ctx.fillRect(x,y,size,size*(.4+next()))}ctx.restore()}
textureNoise(null,d.meta.seed,55000,['rgba(58,79,47,.12)','rgba(230,218,164,.15)','rgba(74,68,43,.09)']);
// A low-angle relief shade makes metre-scale banks and hollows readable at map scale.
const shade=document.createElement('canvas');const shadeScale=Math.min(5,512/Math.max(W,H));shade.width=Math.ceil(W*shadeScale);shade.height=Math.ceil(H*shadeScale);const sh=shade.getContext('2d'),shadePixels=sh.createImageData(shade.width,shade.height);for(let py=0;py<shade.height;py++)for(let px=0;px<shade.width;px++){const x=px/shade.width*W,y=H-py/shade.height*H,k=(py*shade.width+px)*4;if(inside(x,y,d.water.sea))continue;const h=elevation(x,y),slope=(elevation(x+.18,y)-h)*38+(elevation(x,y+.18)-h)*24;let light=Math.max(-.22,Math.min(.22,slope));shadePixels.data[k]=light>0?240:25;shadePixels.data[k+1]=light>0?229:38;shadePixels.data[k+2]=light>0?190:29;shadePixels.data[k+3]=Math.round(Math.abs(light)*255)}sh.putImageData(shadePixels,0,0);ctx.save();ctx.globalAlpha=.85;ctx.drawImage(shade,0,0,canvas.width,canvas.height);ctx.restore();
// Light undergrowth follows the same discontinuous river bands as the trees.
ctx.save();ctx.filter='blur(5px)';for(const band of d.objects.forest.bands){const river=d.water.rivers.find(r=>r.id===band.river);for(let i=0;i<river.points.length-1;i++){const a=river.points[i],b=river.points[i+1],y=(a[1]+b[1])/2;if(y<band.yMin||y>band.yMax||y>d.objects.forest.terraceMaxYKm)continue;const fade=Math.max(0,Math.min(1,(y-band.yMin)/(band.fadeStartYKm-band.yMin)));ctx.globalAlpha=.08+.15*fade;drawLine(ctx,[a,b],2*(band.bankMinKm+(band.bankMaxNorthKm-band.bankMinKm)*fade),'#30563e',scale)}}ctx.restore();
ctx.save();smoothPath(ctx,d.water.sea,scale);ctx.clip();
if(seaMode==='board'){
  // Four stepped depth bands measured outwards from the coastline.
  ctx.fillStyle='#081d35';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const [width,color] of [[9,'#10354c'],[6.2,'#195365'],[3.6,'#28777b'],[1.5,'#54a4a0']])drawLine(ctx,d.water.coast,width,color,scale);
  for(const offset of [.7,1.8,3.1,4.4])drawLine(ctx,d.water.coast.map(([x,y])=>[x,y-offset]),.045,'rgba(153,232,222,.72)',scale);
}else{
  // Distances from the local coast control shallow water and deeper offshore colour.
  const seaCanvas=document.createElement('canvas');const seaScale=Math.min(10,1024/Math.max(W,H));seaCanvas.width=Math.ceil(W*seaScale);seaCanvas.height=Math.ceil(H*seaScale);const seaCtx=seaCanvas.getContext('2d'),seaPixels=seaCtx.createImageData(seaCanvas.width,seaCanvas.height);function coastAt(x){const coast=d.water.coast;for(let i=0;i<coast.length-1;i++){const a=coast[i],b=coast[i+1];if(x<=b[0]){const t=Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0])));return a[1]+(b[1]-a[1])*t}}return coast[coast.length-1][1]}
  for(let py=0;py<seaCanvas.height;py++)for(let px=0;px<seaCanvas.width;px++){const x=(px+.5)/seaCanvas.width*W,y=H-(py+.5)/seaCanvas.height*H,depth=Math.max(0,coastAt(x)-y),f=Math.max(0,Math.min(1,(depth-1)/2)),t=f*f*(3-2*f),shallow=[115,192,179],deep=[9,32,57];let color=shallow.map((v,i)=>v*(1-t)+deep[i]*t);const sun=Math.exp(-(((x-W*39/48)/8)**2+((depth-1.5)/2.6)**2))*.34;color=color.map((v,i)=>v+(255-v)*sun);for(const river of d.water.rivers){const end=river.points[river.points.length-1],mouthY=coastAt(end[0]),plume=Math.exp(-(((x-end[0])/2.5)**2+((y-(mouthY-.7))/1.2)**2))*.52;color=color.map((v,i)=>v*(1-plume)+[180,158,118][i]*plume)}let k=(py*seaCanvas.width+px)*4;for(let i=0;i<3;i++)seaPixels.data[k+i]=color[i];seaPixels.data[k+3]=255}seaCtx.putImageData(seaPixels,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(seaCanvas,0,0,canvas.width,canvas.height);

}
ctx.restore();if(seaMode==='real'){const shorelineCurve=new THREE.CatmullRomCurve3(d.water.coast.map(([x,y])=>new THREE.Vector3(x,y,0)),false,'centripetal'),foam=shorelineCurve.getPoints(500).map((p,i)=>[p.x,p.y-.06+.035*Math.sin(i*.19)]);drawLine(ctx,foam,.11,'rgba(235,247,232,.96)',scale);drawLine(ctx,foam.map(([x,y],i)=>[x,y-.12+.018*Math.sin(i*.29)]),.035,'rgba(229,246,239,.7)',scale)}
for(const pond of d.water.ponds){polyPath(ctx,pond,scale);ctx.fillStyle='#4d8987';ctx.fill()}
for(const river of d.water.rivers){const path=new THREE.CatmullRomCurve3(river.points.map(p=>new THREE.Vector3(p[0],p[1],0)),false,'centripetal'),points=path.getPoints((river.points.length-1)*8);for(let i=0;i<points.length-1;i++){let t=i/(points.length-1)*(river.widths.length-1),k=Math.floor(t),width=river.widths[k]*(1-(t-k))+river.widths[Math.min(k+1,river.widths.length-1)]*(t-k);drawLine(ctx,[[points[i].x,points[i].y],[points[i+1].x,points[i+1].y]],width,'#4c9fa8',scale)}}
drawLine(ctx,d.water.deepChannel.points,d.water.deepChannel.widthKm,'#24596b',scale);
for(const road of d.objects.roads){drawLine(ctx,road.points,.19,'#5d594c',scale);drawLine(ctx,road.points,.1,'#e2d7b8',scale)}
for(const bridge of d.objects.bridges)drawLine(ctx,[[bridge.x-.45,bridge.y],[bridge.x+.45,bridge.y]],.14,'#eee7d4',scale);
ctx.save();ctx.globalCompositeOperation='destination-in';polyPath(ctx,boardOutline,scale);ctx.fillStyle='#fff';ctx.fill();ctx.restore();
const texture=new THREE.CanvasTexture(canvas);texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const geometry=new THREE.PlaneGeometry(W,H,dimensions.mesh.segmentsX,dimensions.mesh.segmentsZ);geometry.rotateX(-Math.PI/2);const pos=geometry.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,elevation(pos.getX(i)+W/2,H/2-pos.getZ(i)));geometry.computeVertexNormals();const groundMesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({map:texture,transparent:true,alphaTest:.1,side:THREE.DoubleSide}));groundMesh.receiveShadow=true;world.add(groundMesh);

// Animated specular flecks are masked to the sea and excluded from dry ground.
const waterMask=document.createElement('canvas');waterMask.width=canvas.width;waterMask.height=canvas.height;const wm=waterMask.getContext('2d');smoothPath(wm,d.water.sea,scale);wm.fillStyle='#fff';wm.fill();wm.globalCompositeOperation='destination-in';polyPath(wm,boardOutline,scale);wm.fill();const waterMaskTexture=new THREE.CanvasTexture(waterMask);const waterGeo=geometry.clone(),wp=waterGeo.attributes.position;for(let i=0;i<wp.count;i++)wp.setY(i,wp.getY(i)+.008);const waterMaterial=groundWaterMaterial=new THREE.ShaderMaterial({uniforms:{mask:{value:waterMaskTexture},time:{value:0}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D mask; uniform float time; varying vec2 vUv; void main(){float m=texture2D(mask,vUv).a; float a=sin(vUv.x*780.0+vUv.y*280.0+time*.65); float b=sin(vUv.y*620.0-vUv.x*120.0-time*.43); float glint=pow(max(0.0,a*b),13.0);gl_FragColor=vec4(.68,.86,.84,m*glint*.25);}',transparent:true,depthWrite:false});const waterLayer=new THREE.Mesh(waterGeo,waterMaterial);waterLayer.visible=seaMode==='real';world.add(waterLayer);

function rng(seed){return function(){seed=seed*16807%2147483647;return (seed-1)/2147483646}}
// Reeds are a surface detail and appear only on wet cells.
function populateReeds(){const spec=d.objects.reeds,random=rng(spec.seed),polys=d.surface.filter(s=>spec.coverIds.includes(s.id)).map(s=>s.polygon),mesh=new THREE.InstancedMesh(new THREE.ConeBufferGeometry(.07,.17,4),new THREE.MeshLambertMaterial({color:0xb2aa63}),spec.count),dummy=new THREE.Object3D();let count=0;for(let i=0;i<spec.count*120&&count<spec.count;i++){let x=random()*W,y=random()*H;if(!polys.some(p=>inside(x,y,p))||inside(x,y,d.water.sea)||d.terrain.cells[Math.floor(y/cell)*d.terrain.cols+Math.floor(x/cell)]!=='沼地')continue;dummy.position.set(toX(x),elevation(x,y)+.075,toZ(y));dummy.scale.setScalar(.65+random()*.5);dummy.rotation.y=random()*Math.PI;dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix)}mesh.count=count;mesh.castShadow=true;world.add(mesh)}
function forestBandWidth(b,y){const t=Math.max(0,Math.min(1,(y-b.yMin)/(b.fadeStartYKm-b.yMin)));return b.bankMaxSouthKm+(b.bankMaxNorthKm-b.bankMaxSouthKm)*t}
// Place trees from each actual channel outwards, in reproducible interrupted banks.
function populateForest(){const spec=d.objects.forest,random=rng(spec.seed),treeCount=Math.round(spec.count*.55),mesh=new THREE.InstancedMesh(new THREE.IcosahedronBufferGeometry(.154,0),new THREE.MeshLambertMaterial({color:0xffffff}),treeCount),dummy=new THREE.Object3D();let count=0;for(let attempt=0;attempt<treeCount*80&&count<treeCount;attempt++){const band=spec.bands[Math.floor(random()*spec.bands.length)],river=d.water.rivers.find(r=>r.id===band.river),i=Math.floor(random()*(river.points.length-1)),a=river.points[i],b=river.points[i+1],t=random(),cx=a[0]+(b[0]-a[0])*t,cy=a[1]+(b[1]-a[1])*t;if(cy<band.yMin||cy>band.yMax||cy>spec.terraceMaxYKm)continue;const fade=Math.max(0,Math.min(1,(cy-band.yMin)/(band.fadeStartYKm-band.yMin)));if(random()>.18+.82*fade)continue;const gap=(Math.sin((cy/band.gapPeriodKm)*Math.PI*2+band.gapFraction*7)+1)/2;if(gap<band.gapFraction)continue;const width=forestBandWidth(band,cy),distance=band.bankMinKm+random()*Math.max(0,width-band.bankMinKm),side=random()<.5?-1:1,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),x=cx-side*dy/len*distance,y=cy+side*dx/len*distance;if(!inside(x,y,d.display.board)||inside(x,y,d.water.sea))continue;const road=nearestRoadPoint(x,y);if(Math.hypot(x-road.x,y-road.y)<spec.roadClearanceKm)continue;const height=.38+random()*.3;dummy.position.set(toX(x),elevation(x,y)+height*.455,toZ(y));dummy.scale.set(.85+random()*.5,height/.35,.85+random()*.5);dummy.rotation.y=random()*Math.PI;dummy.updateMatrix();mesh.setMatrixAt(count,dummy.matrix);mesh.setColorAt(count,new THREE.Color(random()<.5?0x446e4c:0x638456));groundForests.push({x:toX(x)*GROUND_SCALE,z:toZ(y)*GROUND_SCALE,r:.154*Math.max(dummy.scale.x,dummy.scale.z)*GROUND_SCALE});count++}mesh.count=count;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh)}
// Bushes form little clusters on steppe, river margins, and salt margins only.
function populateShrubs(){
 const spec={...d.objects.shrubs,count:d.objects.shrubs.renderCount??(d.meta.id==='exercise2'?650:d.objects.shrubs.count)},random=rng(spec.seed),geo=new THREE.IcosahedronBufferGeometry(1,1),positions=geo.attributes.position;
 // One fixed irregular low-poly shape is varied in scale, rotation and colour per lobe.
 const jitter=rng(spec.seed+313);for(let i=0;i<positions.count;i++){const f=.78+jitter()*.44;positions.setXYZ(i,positions.getX(i)*f,positions.getY(i)*f,positions.getZ(i)*f)}geo.computeVertexNormals();
 const mesh=new THREE.InstancedMesh(geo,new THREE.MeshLambertMaterial({color:0xffffff}),spec.count*7),shadow=new THREE.InstancedMesh(new THREE.CircleBufferGeometry(.17,8),new THREE.MeshBasicMaterial({color:0x122017,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide}),spec.count),dummy=new THREE.Object3D();let plants=0,lobes=0;
 function cluster(x,y){let gx=Math.floor(x/spec.clusterKm),gy=Math.floor(y/spec.clusterKm),n=Math.sin(gx*127.1+gy*311.7+spec.seed)*43758.5453;return n-Math.floor(n)}
 function eligible(x,y){if(y>spec.terraceMaxYKm||!inside(x,y,d.display.board)||inside(x,y,d.water.sea))return false;let valid=false;for(const zone of spec.zones){if(zone.kind==='bank'){const dist=Math.min(...zone.riverIds.map(id=>segmentDistance(x,y,d.water.rivers.find(r=>r.id===id).points)));if(dist>=zone.minKm&&dist<=zone.maxKm&&random()<zone.density)valid=true}else if(inside(x,y,zone.polygon)&&cluster(x,y)>.58&&random()<zone.density)valid=true}if(!valid)return false;const road=nearestRoadPoint(x,y);return Math.hypot(x-road.x,y-road.y)>=spec.roadClearanceKm}
 for(let attempt=0;attempt<spec.count*100&&plants<spec.count;attempt++){const cx=random()*W,cy=random()*H;if(!eligible(cx,cy))continue;const groupSize=2+Math.floor(random()*4);for(let n=0;n<groupSize&&plants<spec.count;n++){const angle=random()*Math.PI*2,r=n?(.12+random()*.38):0,x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r;if(n&&!eligible(x,y))continue;const base=elevation(x,y),shadeColors=[0x8b9a7a,0x929a67,0xaca378,0x8d7e67,0x78947c],color=new THREE.Color(shadeColors[Math.floor(random()*shadeColors.length)]),lobeCount=3+Math.floor(random()*5);dummy.position.set(toX(x),base+.012,toZ(y));dummy.rotation.set(-Math.PI/2,0,random()*Math.PI);dummy.scale.set(1.05,.75,1);dummy.updateMatrix();shadow.setMatrixAt(plants,dummy.matrix);for(let j=0;j<lobeCount;j++){const a=random()*Math.PI*2,dist=j===0?0:random()*.12,wide=.07+random()*.09,high=.035+random()*.045;dummy.position.set(toX(x)+Math.cos(a)*dist,base+high*.75,toZ(y)+Math.sin(a)*dist);dummy.rotation.set(random()*.25,random()*Math.PI,random()*.25);dummy.scale.set(wide,high,wide*(.75+random()*.5));dummy.updateMatrix();mesh.setMatrixAt(lobes,dummy.matrix);mesh.setColorAt(lobes,color.clone().multiplyScalar(.88+random()*.24));lobes++}plants++}}
 mesh.count=lobes;shadow.count=plants;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;world.add(shadow);world.add(mesh)
}

populateReeds();populateForest();populateShrubs();
const buildingGroups={};for(const spec of d.objects.settlements){const site=d.sites.find(s=>s.id===spec.site),mesh=new THREE.InstancedMesh(new THREE.BoxBufferGeometry(1,1,1),new THREE.MeshLambertMaterial({color:0xb6bab4}),spec.count),dummy=new THREE.Object3D(),random=rng(d.meta.seed+site.id.charCodeAt(0));for(let i=0;i<spec.count;i++){const road=nearestRoadPoint(site.x,site.y),along=(random()-.5)*spec.spacingKm*8,side=(random()<.5?-1:1)*(spec.alongRoadKm+random()*.13),x=road.x+road.dx*along-road.dy*side,y=road.y+road.dy*along+road.dx*side,h=.16+random()*.2;dummy.position.set(toX(x),elevation(x,y)+h/2+.02,toZ(y));dummy.scale.set(.17,h,.15);dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);groundBuildings.push({minX:(toX(x)-.085)*GROUND_SCALE,maxX:(toX(x)+.085)*GROUND_SCALE,minZ:(toZ(y)-.075)*GROUND_SCALE,maxZ:(toZ(y)+.075)*GROUND_SCALE,bottom:(elevation(x,y)+.02)*GROUND_SCALE,top:(elevation(x,y)+h+.02)*GROUND_SCALE});}mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);buildingGroups[site.id]=mesh}

}
// 8方向のマス経路。辺と近道を検査し、細い川や海岸を飛び越えない。
// セルの中心と実際の出発・到着点を結ぶ線も、海岸や盤の切れ込みを横切らせない。
function groundSeaLeg(a,b){
  const d=groundData(),x=groundMapX(a.x),y=groundMapY(a.z),dx=(b.x-a.x)/GROUND_SCALE,dy=-(b.z-a.z)/GROUND_SCALE,cuts=[0,1];
  for(const poly of [d.water.sea,d.display.board])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],ex=q[0]-p[0],ey=q[1]-p[1],den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-10)continue;
    const t=((p[0]-x)*ey-(p[1]-y)*ex)/den,u=((p[0]-x)*dy-(p[1]-y)*dx)/den;
    if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  if(!groundPass(x,y,'sea')||!groundPass(x+dx,y+dy,'sea'))return false;
  return cuts.slice(1).every((t,i)=>groundPass(x+dx*(t+cuts[i])/2,y+dy*(t+cuts[i])/2,'sea'));
}
function groundPath(from,to,kind='vehicle',dryOnly=false){
  const d=groundData(),cell=d.meta.cellKm,cols=d.terrain.cols,rows=d.terrain.rows,xy=p=>[groundMapX(p.x),groundMapY(p.z)],a=xy(from),b=xy(to),index=(x,y)=>Math.floor(y/cell)*cols+Math.floor(x/cell),start=index(...a),end=index(...b);
  // Query bounds live only for this search: bridge construction/destruction and
  // terrain edits are always observed by the next call, including dry detours.
  const bounds=poly=>{let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const [x,y] of poly){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return {poly,minX,minY,maxX,maxY};};
  const within=(x,y,b,pad=0)=>x>=b.minX-pad&&x<=b.maxX+pad&&y>=b.minY-pad&&y<=b.maxY+pad;
  const board=bounds(d.display.board),sea=bounds(d.water.sea),ponds=d.water.ponds.map(bounds);
  const rivers=d.water.rivers.map(river=>({...bounds(river.points),river,pad:Math.max(...river.widths)/2+.12+1e-10}));
  function riverFactor(x,y){
    let factor=1;
    for(const box of rivers){
      if(!within(x,y,box,box.pad))continue;
      const river=box.river,r=groundRiverAt(x,y,river);
      if(r.dist>=r.width/2+.12)continue;
      const bridge=d.objects.bridges.some(b=>b.river===river.id&&Math.hypot(x-b.x,y-b.y)<.9)||groundBuiltBridgeAt(x,y,river.id);
      const ford=d.objects.fords.some(f=>f.river===river.id&&Math.abs((x-f.x)*r.tx+(y-f.y)*r.ty)<=(f.widthKm+cell)/2&&Math.hypot(x-f.x,y-f.y)<r.width/2+cell);
      if(!bridge&&!ford)factor=Math.min(factor,d.movement.river[kind]??0);
    }
    return factor;
  }
  // A leg needs both passability and speed at the exact same sample. Evaluate
  // water once, retaining the original fine sampling and endpoint checks.
  function waterFactor(x,y){
    if(!within(x,y,board)||!groundInside(x,y,board.poly))return 0;
    const wet=within(x,y,sea)&&groundInside(x,y,sea.poly);
    if(kind==='sea')return wet&&(!dryOnly||riverFactor(x,y)===1)?1:0;
    if(wet||ponds.some(p=>within(x,y,p)&&groundInside(x,y,p.poly)))return 0;
    const factor=riverFactor(x,y);
    return dryOnly&&factor!==1?0:factor;
  }
  const pass=(x,y)=>waterFactor(x,y)>0;
  if(kind==='air'){
    const length=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.max(1,Math.ceil(length/(cell*GROUND_SCALE/2)));
    for(let i=0;i<=steps;i++)if(!groundPass(a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps,'air'))return null;
    const dest=to.clone();dest.y=from.y;const curve=new THREE.LineCurve3(from.clone(),dest),L=curve.getLength();
    return {curve,points:[from.clone(),dest],atIndex:1,L,s:0,pts:[dest],at:[L]};
  }
  if(a.some((v,i)=>v<0||v>=[d.meta.widthKm,d.meta.heightKm][i])||b.some((v,i)=>v<0||v>=[d.meta.widthKm,d.meta.heightKm][i])||!pass(...a)||!pass(...b)||start<0||end<0||start>=cols*rows||end>=cols*rows)return null;
  const centers=i=>new THREE.Vector3(groundWorldX((i%cols+.5)*cell),0,groundWorldZ((Math.floor(i/cols)+.5)*cell));
  // コストはセル1辺ぶんの移動時間。端点も検査し、表示と実移動に同じ線を使う。
  function leg(p,q){
    if(kind==='sea'&&!groundSeaLeg(p,q))return Infinity;
    const length=Math.hypot(q.x-p.x,q.z-p.z),n=Math.max(1,Math.ceil(length/(cell*GROUND_SCALE/8)));
    let sum=0;
    for(let k=0;k<=n;k++){
      const t=k/n,x=p.x+(q.x-p.x)*t,z=p.z+(q.z-p.z)*t;
      const gx=groundMapX(x),gy=groundMapY(z),water=waterFactor(gx,gy);
      if(water<=0)return Infinity;
      const marsh=kind!=='sea'&&d.terrain.cells[Math.floor(gy/cell)*cols+Math.floor(gx/cell)]==='沼地'?(d.movement.marsh[kind]??1):1;
      const factor=marsh*water;if(factor<=0)return Infinity;
      sum+=(k===0||k===n?.5:1)/factor;
    }
    return length/(cell*GROUND_SCALE)*sum/n;
  }
  // 全区間が通常速度なら直線はコスト下限そのもの。巨大な盤でもA*を起動しない。
  // legは細い川・浅瀬・橋・沼地も従来と同じ間隔で検査し、減速や遮断があれば通常探索へ戻る。
  const direct=leg(from,to),lower=Math.hypot(to.x-from.x,to.z-from.z)/(cell*GROUND_SCALE);
  if(Number.isFinite(direct)&&Math.abs(direct-lower)<=1e-9*Math.max(1,lower)){
    const endPoint=to.clone();endPoint.y=groundHeight(endPoint.x,endPoint.z);const points=[from.clone(),endPoint],curve=new THREE.LineCurve3(points[0],points[1]),L=curve.getLength();
    return {cost:direct,curve,points,atIndex:1,L,s:0,pts:[endPoint.clone()],at:[L]};
  }
  const dist=new Float64Array(cols*rows).fill(Infinity),prev=new Int32Array(cols*rows).fill(-1),heap=[];
  const centerCache=new Map(),center=i=>{if(!centerCache.has(i))centerCache.set(i,centers(i));return centerCache.get(i);};
  // 通常の地形倍率は1以下。直線距離を下限にした A* で遠方のセルを探しすぎない。
  function push(i,v){const priority=v+Math.hypot(i%cols-end%cols,Math.floor(i/cols)-Math.floor(end/cols));let k=heap.length;heap.push([i,v,priority]);while(k){let p=(k-1)>>1;if(heap[p][2]<=priority)break;heap[k]=heap[p];k=p;}heap[k]=[i,v,priority];}
  function pop(){const out=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let c=k*2+1;if(c+1<heap.length&&heap[c+1][2]<heap[c][2])c++;if(heap[c][2]>=last[2])break;heap[k]=heap[c];k=c;}heap[k]=last;}return out;}
  // セル内の端点を中心へ結ぶ部分も、通れない川岸をまたがない。
  const first=leg(from,center(start));if(!Number.isFinite(first)||!Number.isFinite(leg(center(end),to)))return null;
  dist[start]=first;push(start,first);
  while(heap.length){
    const [i,cost]=pop();if(cost!==dist[i])continue;if(i===end)break;
    const x=i%cols,y=Math.floor(i/cols),p=center(i);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=cols||yy>=rows)continue;
      // 斜めでも通行不可セルの角をすり抜けない。
      if(dx&&dy&&(!pass((x+dx+.5)*cell,(y+.5)*cell)||!pass((x+.5)*cell,(y+dy+.5)*cell)))continue;
      const j=yy*cols+xx,n=cost+leg(p,center(j));
      if(n<dist[j]){dist[j]=n;prev[j]=i;push(j,n);}
    }
  }
  if(!Number.isFinite(dist[end]))return null;
  const ids=[];for(let i=end;i!==start;i=prev[i])ids.push(i);ids.reverse();
  const raw=[from.clone(),center(start),...ids.map(center),groundPoint(...b)];
  const costs=[0];for(let i=1;i<raw.length;i++)costs.push(costs[i-1]+leg(raw[i-1],raw[i]));
  // 沼地・渡河の時間を増やさない見通しのよい近道だけを採る。
  const simple=[raw[0]];
  for(let i=0;i<raw.length-1;){
    let j=raw.length-1;while(j>i+1&&leg(raw[i],raw[j])>costs[j]-costs[i]+1e-6)j--;
    if(raw[i].distanceToSquared(raw[j])>1e-10)simple.push(raw[j]);i=j;
  }
  // 曲がり角を短い二次曲線で丸める。通行不能なら元の角を残す。
  const rounded=[simple[0]];
  for(let i=1;i<simple.length-1;i++){
    const p=simple[i],before=simple[i-1],after=simple[i+1];
    const radius=Math.min(cell*GROUND_SCALE/2,p.distanceTo(before)/4,p.distanceTo(after)/4);
    const a=p.clone().lerp(before,radius/p.distanceTo(before)),b=p.clone().lerp(after,radius/p.distanceTo(after));
    const arc=new THREE.QuadraticBezierCurve3(a,p,b).getPoints(8);
    if(arc.slice(1).every((q,k)=>Number.isFinite(leg(arc[k],q))))rounded.push(...arc);
    else rounded.push(p);
  }
  if(simple.length>1)rounded.push(simple[simple.length-1]);
  // 地形の起伏も拾い、経路の線が地面へ潜らないようにする。
  const points=[rounded[0]];
  for(let i=1;i<rounded.length;i++){
    const p=rounded[i-1],q=rounded[i],n=Math.max(1,Math.ceil(p.distanceTo(q)/(cell*GROUND_SCALE/2)));
    for(let k=1;k<=n;k++){const v=p.clone().lerp(q,k/n);v.y=kind==='sea'?0:groundHeight(v.x,v.z);points.push(v);}
  }
  if(points.length===1)points.push(points[0].clone());
  const curve=new THREE.CurvePath();let cost=0;
  for(let i=1;i<points.length;i++){curve.add(new THREE.LineCurve3(points[i-1],points[i]));cost+=leg(points[i-1],points[i]);}
  const L=curve.getLength();
  // 近道・角丸で橋への迂回時間も縮む。格子上では渡河が速かった場合も、
  // 同じ兵科で橋・浅瀬だけを使う候補を整形し、最終的な移動時間で比べる。
  if(!dryOnly&&kind!=='sea'&&d.movement.river[kind]>0&&points.some(p=>riverFactor(groundMapX(p.x),groundMapY(p.z))<1)){
    const detour=groundPath(from,to,kind,true);
    if(detour&&detour.cost<cost)return detour;
  }
  return {bridgeRevision:groundBridgeRevision,cost,curve,points,atIndex:1,L,s:0,pts:[points[points.length-1]],at:[L]};
}
// 地形の迂回点とユーザーの経由地を分け、矢印と実移動には同じ経路を使う。
function groundMovePath(from,waypoints,kind){
  const points=[from.clone()],pts=[],at=[],curve=new THREE.CurvePath();let cost=0,length=0;
  for(const dest of waypoints){
    const leg=groundPath(points[points.length-1],dest,kind);if(!leg)return null;
    for(const p of leg.points.slice(1)){
      const prev=points[points.length-1];length+=Math.hypot(p.x-prev.x,p.z-prev.z);
      curve.add(new THREE.LineCurve3(prev,p));points.push(p);
    }
    pts.push(points[points.length-1].clone());at.push(length);cost+=leg.cost||0;
  }
  return {bridgeRevision:groundBridgeRevision,cost,curve,points,atIndex:1,L:curve.getLength(),s:0,pts,at};
}
function groundFollow(f,dt){let p=f.order.path;if(p&&p.bridgeRevision!==undefined&&groundMoveKind(f)!=='air'&&p.bridgeRevision!==groundBridgeRevision){if(p.blockedRevision===groundBridgeRevision)return false;const remaining=p.pts.filter((_,i)=>p.at[i]>p.s+1e-8);const updated=groundMovePath(f.pos,remaining.length?remaining:[p.points[p.points.length-1]],groundMoveKind(f));if(!updated){p.blockedRevision=groundBridgeRevision;return false;}f.order.path=updated;p=updated;}if(!p)return true;let remaining=speedOf(f)*dt;while(remaining>0&&p.atIndex<p.points.length){const target=p.points[p.atIndex],dx=target.x-f.pos.x,dz=target.z-f.pos.z,dist=Math.hypot(dx,dz),factor=groundFactor(f.pos.x,f.pos.z,groundMoveKind(f)),amount=Math.min(dist,remaining*factor);if(factor<=0)return false;if(groundMoveKind(f)==='sea'&&dist>1e-8&&!groundSeaLeg(f.pos,new THREE.Vector3(f.pos.x+dx/dist*amount,0,f.pos.z+dz/dist*amount)))return false;if(dist>1e-8){const before=f.pos.clone();f.pos.x+=dx/dist*amount;f.pos.z+=dz/dist*amount;f.heading.set(dx/dist,0,dz/dist);f.march.copy(f.heading);groundSupplyMoved(f,before,f.pos);}f.pos.y=groundUnitHeight(f);remaining-=amount/factor;p.s+=amount;if(dist-amount<1e-6)p.atIndex++;else break;}return p.atIndex>=p.points.length;}
