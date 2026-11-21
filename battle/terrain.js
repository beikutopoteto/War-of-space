/* 地上演習の盤。見本 ground-b.html と同じ地形・水系・高度を使う。座標は 1 km = 4 戦闘単位。 */
const GROUND_SCALE=4;
const GROUND_MIN_VIEW=7;   // カメラが寄れる最も近い距離（地上。約1.7km。ユーザー決定 2026-11-18「もう少し大きく」で10から。前は宇宙と同じ35）
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
// 作戦のkm表記を、既存の艦隊生成が読む形へ直す唯一の入口。旧表記はそのまま使える。
// 小隊の数（docs/spec.md「地上の部隊編成」）: 作戦のデータ・台本の部隊（km表記）で指定（platoons）がなければ4（満員の中隊。ユーザー決定 2026-11-18）。編成から出撃する中隊は編成の数。
// 旧表記（km表記でない）はそのまま返し、小隊の数がなければ groundInitUnit で1になる
const groundSpecPlatoons=u=>({groundPlatoons:u.groundPlatoons??u.platoons??4});
function groundUnitSpec(u){
  if(!u.at)return u;
  const {kind,at,...rest}=u;
  return {type:'cv',n:1,scale:.3,alt:0,...rest,...groundSpecPlatoons(u),groundKind:kind,band:u.band||'ground',
    pos:[groundWorldX(at[0]),groundWorldZ(at[1])],
    ...(u.groundCargo?{groundCargo:u.groundCargo.map(groundUnitSpec)}:{})};
}
// 編成は位置を持たない。出撃制限を適用してから、作戦の枠または拠点周辺へ置く。
function groundSortieForces(operation,value){
  const config=operation.groundSortie;
  if(!config)throw new Error(operation.id+': groundSortie がありません');
  const sortie=window.WOS_GROUND_ORG.sortie(value),max=config.maxCompanies;
  if(max!=null&&(!Number.isInteger(max)||max<0))throw new Error('groundSortie.maxCompanies は0以上の整数です');
  const companies=sortie.org.companies.filter(c=>!(config.bannedKinds||[]).includes(c.kind)).slice(0,max??Infinity);
  const ids=new Set(companies.map(c=>c.id));
  const org=window.WOS_GROUND_ORG.normalize({...sortie.org,companies});
  const units=sortie.fleets.filter(f=>ids.has(f.companyId));
  if(config.slots){
    if(!config.slots.length)throw new Error('groundSortie.slots が空です');
    return {org,fleets:units.map((f,i)=>{const slot=config.slots[i%config.slots.length];
      return groundUnitSpec({...f,kind:f.groundKind,at:[slot[0]+Math.floor(i/config.slots.length)*.6,slot[1]]});})};
  }
  const center=groundData().sites.find(s=>s.id===config.site),radius=config.radiusKm;
  if(!center||!Number.isFinite(radius)||radius<=0)throw new Error('groundSortie の拠点・半径が不正です');
  const spacing=1.5,limit=Math.ceil(radius*2/spacing),points=[]; // 間隔1.5km、最大半径2倍（仮）
  for(let y=-limit;y<=limit;y++)for(let x=-limit;x<=limit;x++){
    const distance=Math.hypot(x,y)*spacing;
    if(distance<=radius*2)points.push({at:[center.x+x*spacing,center.y+y*spacing],distance});
  }
  points.sort((a,b)=>a.distance-b.distance||a.at[1]-b.at[1]||a.at[0]-b.at[0]);
  const used=new Set();
  const fleets=units.map(f=>{
    const moveKind=groundMoveKind(f),air=moveKind==='air';let slot;
    const valid=p=>!used.has(p)&&groundPass(...p.at,moveKind,false)&&(air||groundData().water.rivers.every(r=>{
      const river=groundRiverAt(...p.at,r);return river.dist>=river.width/2+.12;
    }));
    for(let reach=radius;!slot;reach=Math.min(radius*2,reach+1)){
      slot=points.find(p=>p.distance<=reach&&valid(p));
      if(reach===radius*2)break;
    }
    if(!slot)throw new Error(operation.id+': '+f.name+' の出撃地点が半径'+radius*2+'km以内にありません');
    used.add(slot);return groundUnitSpec({...f,kind:f.groundKind,at:slot.at});
  });
  return {org,fleets};
}
// 宇宙の部隊選択も従来どおり返す。state.js に地上用の分かれ目を増やさない。
function groundResolveForces(operation,cfg){
  const sortie=operation.ground&&operation.forces!=='fixed'&&!(cfg?.fleets?.length)?groundSortieForces(operation,cfg?.groundOrg):null;
  const spec=operation.groundDrill?operation.quick:sortie?sortie.fleets:cfg?.fleets?.length?cfg.fleets:operation.quick;
  return {fleets:operation.ground?spec.map(groundUnitSpec):spec,
    enemies:operation.ground?operation.enemies.map(groundUnitSpec):operation.enemies,org:sortie?.org||(operation.ground&&cfg?.quickOrg?'quick':null)};
}
function groundSetupCoordinates(){
  if(op.view?.targetKm)op.view.target=op.view.targetKm.map((v,i)=>i?groundWorldZ(v):groundWorldX(v));
  const guide=op.groundTutorial?.ground;
  const d=guide?WOS_TERRAIN[guide]:groundData();
  for(const row of op.tutorial||[])for(const mark of row.marks||[])if(mark.at)
    mark.pos=[(mark.at[0]-d.meta.widthKm/2)*GROUND_SCALE,(d.meta.heightKm/2-mark.at[1])*GROUND_SCALE];
}
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
  for(const p of spec.ridges||[])h+=p.heightM*hill(p);
  for(const p of spec.observationHills||[])h+=p.heightM*hill(p);
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
function groundRiverFactor(x,y,kind,includeBuilt=true){
  const d=groundData(); let factor=1;
  for(const river of d.water.rivers){
    const r=groundRiverAt(x,y,river);
    if(r.dist>=r.width/2+.12)continue;
    const bridge=d.objects.bridges.some(b=>b.river===river.id&&Math.hypot(x-b.x,y-b.y)<.9)||(includeBuilt&&groundBuiltBridgeAt(x,y,river.id));
    const ford=d.objects.fords.some(f=>f.river===river.id&&Math.abs((x-f.x)*r.tx+(y-f.y)*r.ty)<=(f.widthKm+d.meta.cellKm)/2&&Math.hypot(x-f.x,y-f.y)<r.width/2+d.meta.cellKm);
    if(!bridge&&!ford)factor=Math.min(factor,groundRuleSet().movement.river[kind]??0);
  }
  return factor;
}
// 町に実際に建てる数。地図のデータの count の0.8倍（建物が重なって見えたため。ユーザー 2026-11-16）
const GROUND_TOWN_DENSITY=.8;function groundTownCount(spec){return Math.round(spec.count*GROUND_TOWN_DENSITY);}
function groundPass(x,y,kind='vehicle',includeBuilt=true){ const d=groundData(),sea=groundInside(x,y,d.water.sea); return x>=0&&x<d.meta.widthKm&&y>=0&&y<d.meta.heightKm&&groundInside(x,y,d.display.board)&&(kind==='air'||(kind==='sea'?sea:!sea&&!d.water.ponds.some(p=>groundInside(x,y,p))&&groundRiverFactor(x,y,kind,includeBuilt)>0)); }
// 道路帯は所有・補給の状態から独立した幾何。探索中の各サンプルで全道路を走査しない。
const groundRoadGeometry=new WeakMap();
function groundRoadQuery(d=groundData()){
  let cache=groundRoadGeometry.get(d);const roads=d.objects.roads,width=groundRuleSet().capture.roadWidthKm/2;
  if(!cache||cache.roads!==roads||cache.roadCount!==roads.length||cache.width!==width){
    const bins=new Map();
    for(const road of roads)for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;if(!length2)continue;
      const s={x:a[0],y:a[1],dx,dy,length2};
      for(let x=Math.floor(Math.min(a[0],b[0])-width);x<=Math.floor(Math.max(a[0],b[0])+width);x++)for(let y=Math.floor(Math.min(a[1],b[1])-width);y<=Math.floor(Math.max(a[1],b[1])+width);y++){
        const key=y*d.meta.widthKm+x;let list=bins.get(key);if(!list)bins.set(key,list=[]);list.push(s);
      }
    }
    const limit=(width+1e-8)**2;
    const contains=(x,y)=>{for(const s of bins.get(Math.floor(y)*d.meta.widthKm+Math.floor(x))||[]){const px=x-s.x,py=y-s.y,t=Math.max(0,Math.min(1,(px*s.dx+py*s.dy)/s.length2));if((px-t*s.dx)**2+(py-t*s.dy)**2<=limit)return true;}return false;};
    // 道路1線分の帯（カプセル）は凸。両端が同じ帯内なら線全体が道路。
    contains.coversLeg=(ax,ay,bx,by)=>{
      for(const s of bins.get(Math.floor(ay)*d.meta.widthKm+Math.floor(ax))||[]){
        const distance=(x,y)=>{const px=x-s.x,py=y-s.y,t=Math.max(0,Math.min(1,(px*s.dx+py*s.dy)/s.length2));return (px-t*s.dx)**2+(py-t*s.dy)**2;};
        if(distance(ax,ay)<=limit&&distance(bx,by)<=limit)return true;
      }return false;
    };
    cache={roads,roadCount:roads.length,width,contains};groundRoadGeometry.set(d,cache);
  }
  return cache.contains;
}
function groundFactor(x,z,kind){
  if(kind==='air'||kind==='sea')return 1;
  const d=groundData(),gx=groundMapX(x),gy=groundMapY(z),river=groundRiverFactor(gx,gy,kind);
  // 道路でも通行不能な川は渡れない。橋はriver=1なので道路加速を受ける。
  if(groundRoadQuery(d)(gx,gy))return groundRuleSet().movement.roadFactor*river;
  const c=Math.floor(gx/d.meta.cellKm),r=Math.floor(gy/d.meta.cellKm),marsh=d.terrain.cells[r*d.terrain.cols+c]==='沼地'?(groundRuleSet().movement.marsh[kind]??1):1;
  return marsh*river;
}
/* 町の作り（docs/town-roads.md 5.、docs/terrain.md 3.5）。座標は km（地図の x 東・y 北）。
   ① 幹線（地図の道）を中心から外へたどる → ② 型と段階で集散路を引く → ③ 生活道路を集散路から直角に伸ばし、別の道に当たれば T 字、町の外れや水に当たれば行き止まり
   → ④ 生活道路・集散路・幹線の順に、道に面して建物を置く（重ならない、水と道にかからない、外形はなるべく円く）。
   承認済みの見本 towngen.js から移植（THREE を使わない）。高さだけ地図の段階で決める。 */
function townRng(seed){return ()=>{seed=seed*16807%2147483647;return (seed-1)/2147483646}}
const TOWN_W={art:.19,col:[.1,.11,.13,.14],loc:[.07,.08,.09,.09]};
function townSegDist(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/l)):0;return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
// 有限距離の問い合わせだけを0.25kmの線分索引で絞る。
// 距離式・同距離の優先順は元と同じ。返す線分番号も変えない。
const townSegmentIndexes=new WeakMap();
function townNear(x,y,pts,limit=Infinity){
 let index=townSegmentIndexes.get(pts);
 if(Number.isFinite(limit)&&pts.length>8&&!index){const bins=new Map(),segments=[],seen=new Uint32Array(pts.length-1);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),y0=Math.min(a[1],b[1]),y1=Math.max(a[1],b[1]);segments.push({a,b,x0,x1,y0,y1});minX=Math.min(minX,x0);maxX=Math.max(maxX,x1);minY=Math.min(minY,y0);maxY=Math.max(maxY,y1);
   for(let ix=Math.floor(x0/.25);ix<=Math.floor(x1/.25);ix++)for(let iy=Math.floor(y0/.25);iy<=Math.floor(y1/.25);iy++){const key=ix*65536+iy;let list=bins.get(key);if(!list)bins.set(key,list=[]);list.push(i);}}
  index={bins,segments,seen,tick:0,minX,maxX,minY,maxY};townSegmentIndexes.set(pts,index);
 }
 let m=Infinity,k=0;
 if(index&&Number.isFinite(limit)){
  if(x<index.minX-limit||x>index.maxX+limit||y<index.minY-limit||y>index.maxY+limit)return {d:m,i:k};
  if(++index.tick===4294967295){index.seen.fill(0);index.tick=1;}
  for(let ix=Math.floor((x-limit)/.25);ix<=Math.floor((x+limit)/.25);ix++)for(let iy=Math.floor((y-limit)/.25);iy<=Math.floor((y+limit)/.25);iy++)for(const i of index.bins.get(ix*65536+iy)||[]){
   if(index.seen[i]===index.tick)continue;index.seen[i]=index.tick;const seg=index.segments[i];if(x<seg.x0-limit||x>seg.x1+limit||y<seg.y0-limit||y>seg.y1+limit)continue;
   const d=townSegDist(x,y,seg.a,seg.b);if(d<m||d===m&&i<k){m=d;k=i;}
  }
 }else for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];if(Number.isFinite(limit)&&(x<Math.min(a[0],b[0])-limit||x>Math.max(a[0],b[0])+limit||y<Math.min(a[1],b[1])-limit||y>Math.max(a[1],b[1])+limit))continue;const d=townSegDist(x,y,a,b);if(d<m){m=d;k=i;}}
 return {d:m,i:k};
}
function townLen(pts){let L=0;for(let i=0;i<pts.length-1;i++)L+=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]);return L;}
// 折れ線の上を一定の間隔で歩き、その点と向きを返す
function townAlong(pts,s0,step,s1=Infinity){const out=[];let acc=0,next=s0;for(let i=0;i<pts.length-1;i++){const [ax,ay]=pts[i],[bx,by]=pts[i+1],L=Math.hypot(bx-ax,by-ay);if(L<1e-9)continue;while(next<=acc+L&&next<=s1){const t=(next-acc)/L;out.push({x:ax+(bx-ax)*t,y:ay+(by-ay)*t,tx:(bx-ax)/L,ty:(by-ay)/L,s:next});next+=step;}acc+=L;}return out;}

function townPlan(o){
 const grow=o.grow||1,rnd=townRng(o.seed),T=o.tier,layout=o.layout,Wc=TOWN_W.col[T],Wl=TOWN_W.loc[T];
 const R0=Math.sqrt(o.target*.19*.17/(.42*Math.PI))*grow,Redge=R0*1.24,wob=[rnd()*6.3,rnd()*6.3];
 // ① 幹線: 地図の道のうち、拠点の近くを通るものを、中心から外へ向かう腕に分ける。拠点にいちばん近い道の点を町の中心にする
 let best=null;for(const r of o.roads){const n=townNear(o.site[0],o.site[1],r.pts,.6);if(n.d<.6&&(!best||n.d<best.d))best={...n,r};}
 let c=o.site.slice();if(best){const a=best.r.pts[best.i],b=best.r.pts[best.i+1],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((o.site[0]-a[0])*dx+(o.site[1]-a[1])*dy)/l));c=[a[0]+dx*t,a[1]+dy*t];}
 const [cx,cy]=c,reach=Redge+1.2,arms=[];
 for(const r of o.roads){const n=townNear(cx,cy,r.pts,.6);if(n.d>.6)continue;const a=r.pts[n.i],b=r.pts[n.i+1],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((cx-a[0])*dx+(cy-a[1])*dy)/l)),p=[a[0]+dx*t,a[1]+dy*t];
  for(const dir of [1,-1]){const pts=[p];let L=0,i=dir>0?n.i+1:n.i;while(i>=0&&i<r.pts.length&&L<reach){const q=r.pts[i],last=pts[pts.length-1],d=Math.hypot(q[0]-last[0],q[1]-last[1]);if(d<1e-9){i+=dir;continue;}if(L+d>reach){const f=(reach-L)/d;pts.push([last[0]+(q[0]-last[0])*f,last[1]+(q[1]-last[1])*f]);L=reach;break;}pts.push(q);L+=d;i+=dir;}
   if(L>.4){const q=townAlong(pts,Math.min(.8,L*.5),1)[0];arms.push({pts,ang:Math.atan2(q.y-cy,q.x-cx),main:r.type==='main',id:r.id});}}}
 arms.sort((a,b)=>(b.main-a.main)||(townLen(b.pts)-townLen(a.pts)));
 const mainAng=arms.length?arms[0].ang:rnd()*Math.PI*2;
 const roads=arms.map(a=>({cls:'art',pts:a.pts,map:true}));
 const W=r=>r.cls==='art'?TOWN_W.art:r.cls==='col'?Wc:Wl;
 const edge=(x,y)=>{const t=Math.atan2(y-cy,x-cx);return Redge*(1+.07*Math.sin(2*t+wob[0])+.05*Math.sin(3*t+wob[1]));};
 const outside=(x,y)=>Math.hypot(x-cx,y-cy)>edge(x,y);
 const blocks=[];   // 広場・本営の敷地・公園（向きのある長方形）
 const inBlock=(x,y,m=0)=>blocks.some(b=>{const dx=x-b.x,dy=y-b.y,u=dx*b.u[0]+dy*b.u[1],v=-dx*b.u[1]+dy*b.u[0];return Math.abs(u)<b.hu+m&&Math.abs(v)<b.hv+m;});
 const addBlock=(kind,x,y,ang,hu,hv)=>{const b={kind,x,y,u:[Math.cos(ang),Math.sin(ang)],hu,hv,ang};blocks.push(b);return b;};
 const wet=o.wet;
 // 水と町の外で道を切る
 function cut(pts,cls,extra={}){let cur=[];const out=[];const fine=[];for(let i=0;i<pts.length-1;i++){const [ax,ay]=pts[i],[bx,by]=pts[i+1],n=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)/.05));for(let k=0;k<n;k++)fine.push([ax+(bx-ax)*k/n,ay+(by-ay)*k/n]);}fine.push(pts[pts.length-1]);
  for(const p of fine){if(wet(p[0],p[1])||inBlock(p[0],p[1],.02)){if(cur.length>1)out.push(cur);cur=[];}else cur.push(p);}if(cur.length>1)out.push(cur);
  for(const s of out)if(townLen(s)>.25)roads.push({cls,pts:s,...extra});}
 // 道を伸ばす。別の道に当たれば T 字、町の外れ・水・広場に当たれば行き止まり。平行に近い生活道路に寄りすぎたら止める
 const junctions=[];
 function march(x,y,ang,{from=null,max=3,turn=0,stopNear=null,curve=0}={}){const pts=[[x,y]];let L=0,a=ang,end='dead',hit=null;
  while(L<max){a+=turn+(curve?(rnd()-.5)*curve:0);const nx=x+Math.cos(a)*.04,ny=y+Math.sin(a)*.04;
   if(outside(nx,ny)||wet(nx,ny)||inBlock(nx,ny,.03)){if(wet(nx,ny)&&pts.length>2){pts.pop();}break;}
   if(stopNear&&stopNear(nx,ny)){break;}
   let h=null;for(const r of roads){if(r===from&&L<.2)continue;const n=townNear(nx,ny,r.pts,Math.max(W(r)/2+Wl/2,.3));if(n.d<W(r)/2+Wl/2){h={r,n};break;}
    if(r.cls==='loc'&&L>.12&&n.d<.3){const p=r.pts[n.i],q=r.pts[n.i+1],dl=Math.hypot(q[0]-p[0],q[1]-p[1])||1,cos=Math.abs(((q[0]-p[0])*Math.cos(a)+(q[1]-p[1])*Math.sin(a))/dl);if(cos>.75){h={near:true};break;}}}
   if(h){if(!h.near){const r=h.r,p=r.pts[h.n.i],q=r.pts[h.n.i+1],dx=q[0]-p[0],dy=q[1]-p[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((nx-p[0])*dx+(ny-p[1])*dy)/l)):0;pts.push([p[0]+dx*t,p[1]+dy*t]);end='tee';hit=r;}break;}
   x=nx;y=ny;L+=.04;if(pts.length===1||Math.hypot(x-pts[pts.length-1][0],y-pts[pts.length-1][1])>.12)pts.push([x,y]);}
  if(end==='dead'&&(pts[pts.length-1][0]!==x||pts[pts.length-1][1]!==y)&&!wet(x,y))pts.push([x,y]);
  return {pts,end,hit};}
 function addLocal(res,{min=.25,trim=0}={}){let {pts,end}=res;if(townLen(pts)<min)return null;
  if(trim&&end==='tee'&&townLen(pts)>min+trim+.1){const keep=townAlong(pts,0,.04,townLen(pts)-trim);pts=keep.map(p=>[p.x,p.y]);end='dead';}
  const r={cls:'loc',pts,end};roads.push(r);if(end==='tee')junctions.push(pts[pts.length-1]);junctions.push(pts[0]);return r;}
 const tooCloseJ=(x,y,m=.2)=>junctions.some(j=>Math.hypot(j[0]-x,j[1]-y)<m);
 // 道から直角に生活道路を出す（両側、片側ずつ半分ずらして十字を避ける）
 function ribs(road,{step=.48,s0=.2,sides=[1,-1],max=3,deadP=.2,jitter=0,curve=0,turn=0,min=.25,sEnd=Infinity,len=null,stopNear=null}={}){
  for(const sd of sides){for(const p of townAlong(road.pts,s0+(sd<0?step/2:0),step,sEnd)){if(tooCloseJ(p.x,p.y,.22))continue;const a=Math.atan2(p.tx*sd,-p.ty*sd)+(jitter?(rnd()-.5)*jitter:0);
   const x=p.x+Math.cos(a)*(W(road)/2),y=p.y+Math.sin(a)*(W(road)/2);const res=march(x,y,a,{from:road,max:len?len[0]+rnd()*(len[1]-len[0]):max,curve,turn:turn*(rnd()-.5),stopNear});res.pts[0]=[p.x,p.y];addLocal(res,{min,trim:rnd()<deadP?.22:0});}}}

 // ② 型ごとの集散路と ③ 生活道路
 let plaza=null,compound=null;
 if(o.hq&&layout!=='radial'){const angs=arms.map(a=>a.ang).sort((a,b)=>a-b);let best=mainAng+Math.PI,g=0;for(let i=0;i<angs.length;i++){const a=angs[i],b=i+1<angs.length?angs[i+1]:angs[0]+Math.PI*2;if(b-a>g){g=b-a;best=a+g/2;}}
  const L=T>=2?.73:.55,hv=T>=2?.36:.28;let d0=.14;const tries=[];for(const dd of [.14,.45,.8])for(let k=0;k<=8;k++)for(const sg of (k?[1,-1]:[1]))tries.push([sg*k*.2,dd]);for(const [off,dd] of tries){d0=dd;const a=best+off,mx=cx+Math.cos(a)*(d0+L/2),my=cy+Math.sin(a)*(d0+L/2),u=[Math.cos(a),Math.sin(a)];let dry=true;for(const i of [-1,0,1])for(const j of [-1,0,1]){const x=mx+u[0]*L/2*i-u[1]*hv*j,y=my+u[1]*L/2*i+u[0]*hv*j;if(wet(x,y)||roads.some(r=>townNear(x,y,r.pts,TOWN_W.art/2+.04).d<TOWN_W.art/2+.04))dry=false;}if(dry){compound=addBlock('hq',mx,my,a,L/2,hv);compound.d0=d0;compound.L=L;break;}}}
 if(layout==='radial'){
  const ph=T>=1?.1+.03*T:0;if(ph)plaza=addBlock('plaza',cx,cy,mainAng,ph,ph);
  const angs=arms.map(a=>({ang:a.ang,arm:true}));if(!angs.length)angs.push({ang:mainAng,arm:false});
  for(let guard=0;guard<6;guard++){angs.sort((a,b)=>a.ang-b.ang);let gi=-1,g=0;for(let i=0;i<angs.length;i++){const a=angs[i].ang,b=i+1<angs.length?angs[i+1].ang:angs[0].ang+Math.PI*2;if(b-a>g){g=b-a;gi=i;}}if(g<=Math.PI*.62)break;angs.push({ang:angs[gi].ang+g/2,arm:false,gap:g});}
  if(o.hq){const spare=angs.filter(a=>!a.arm).sort((a,b)=>b.gap-a.gap)[0];if(spare){spare.hq=true;const L=T>=2?.73:.55,hv=T>=2?.36:.28,d0=(ph||.06)+.02,mx=cx+Math.cos(spare.ang)*(d0+L/2),my=cy+Math.sin(spare.ang)*(d0+L/2);compound=addBlock('hq',mx,my,spare.ang,L/2,hv);compound.d0=d0;compound.L=L;}}
  const ringR=t=>.82*R0*(1+.045*Math.sin(3*t+wob[0])+.025*Math.sin(5*t+wob[1]));
  const spokes=[];
  for(const a of angs){if(a.arm||a.hq)continue;const rr=T>=1?ringR(a.ang):Redge*.85,pts=[];for(let k=0;k<=6;k++){const s=(ph||.05)+(rr-(ph||.05))*k/6,b=a.ang+(k>0&&k<6?(rnd()-.5)*.06:0);pts.push([cx+Math.cos(b)*s,cy+Math.sin(b)*s]);}const before=roads.length;cut(pts,'col');for(let i=before;i<roads.length;i++)spokes.push(roads[i]);}
  let ring=null;if(T>=1){const pts=[];for(let k=0;k<=120;k++){const t=mainAng+.35+k/120*Math.PI*2,r=ringR(t);pts.push([cx+Math.cos(t)*r,cy+Math.sin(t)*r]);}const before=roads.length;cut(pts,'col',{ring:true});ring=roads.slice(before);}
  for(const s of spokes)ribs(s,{s0:.25,step:.48,deadP:.2});
  // 集散路のない区画（幹線と幹線のあいだ）は、幹線から生活道路を出す（例外）
  const sorted=angs.slice().sort((a,b)=>a.ang-b.ang);
  for(const arm of arms){const i=sorted.findIndex(a=>a.arm&&Math.abs(a.ang-arm.ang)<1e-9);for(const [sd,nb] of [[1,sorted[(i+1)%sorted.length]],[-1,sorted[(i-1+sorted.length)%sorted.length]]]){if(!nb.arm)continue;const road=roads.find(r=>r.pts===arm.pts);ribs(road,{s0:(ph||.05)+.3,step:.5,sides:[sd],deadP:.25,sEnd:(T>=1?.82*R0:Redge)});}}
  if(ring)for(const r of ring){ribs(r,{s0:.25,step:.55,sides:[1],len:[.3,.5],deadP:0,min:.22});ribs(r,{s0:.5,step:.55,sides:[-1],deadP:.3,min:.3});}
 }else if(layout==='grid'){
  const u=[Math.cos(mainAng),Math.sin(mainAng)],n=[-u[1],u[0]],D=[.8,.9,.95,1][T],K=Math.ceil(Redge/D);
  const line=(off,along0,along1)=>[[cx+n[0]*off+u[0]*along0,cy+n[1]*off+u[1]*along0],[cx+n[0]*off+u[0]*along1,cy+n[1]*off+u[1]*along1]];
  const rails=[];
  if(T>=1){for(let k=-K;k<=K;k++){if(k===0)continue;const off=k*D;if(Math.abs(off)>Redge*.95)continue;const h=Math.sqrt(Math.max(0,Redge*Redge-off*off))*1.05;const before=roads.length;cut(line(off,-h,h),'col');for(let i=before;i<roads.length;i++)rails.push({r:roads[i],k});}
   if(arms.length<2){const before=roads.length;cut(line(0,-Redge*1.05,-.0),'col');for(let i=before;i<roads.length;i++)rails.push({r:roads[i],k:0});}
   cut(line(0,0,0).map((p,i)=>[cx+n[0]*(i?Redge:-Redge),cy+n[1]*(i?Redge:-Redge)]),'col',{cross:true});}
  else{const before=roads.length;cut(line(0,-Redge,Redge),'col');}
  const art=roads.filter(r=>r.cls==='art');
  for(const {r,k} of rails){if(k===0)continue;const stagger=(Math.abs(k)%2)*.24,inner=Math.abs(k)===1;
   // 内側へ: 隣の列に T 字（幹線の手前では止めて行き止まり）。いちばん外の列は外へ短い行き止まり
   ribs(r,{s0:.2+stagger,step:.48,sides:[k>0?-1:1],deadP:.15});
   if(Math.abs(k)===Math.max(...rails.map(q=>Math.abs(q.k))))ribs(r,{s0:.44+stagger,step:.48,sides:[k>0?1:-1],len:[.3,.5],deadP:0,min:.22});}
  if(T===0)for(const r of roads.filter(r=>r.cls==='col'))ribs(r,{s0:.25,step:.48,len:[.3,.5],deadP:.5});
 }else if(layout==='organic'){
  // 集散路: 幹線から斜めに分かれて曲がりながら外へ。生活道路: 少し斜め・曲がり・行き止まり多め
  const nCol=T>=1?2+T:0;let tries=0;
  {const angs=arms.map(a=>a.ang).sort((a,b)=>a-b);if(!angs.length)angs.push(mainAng);const gaps=[];for(let i=0;i<angs.length;i++){const a=angs[i],b=i+1<angs.length?angs[i+1]:angs[0]+Math.PI*2;if(b-a>Math.PI*.75)gaps.push(a+(b-a)/2);}
   for(const g of gaps){const res=march(cx+Math.cos(g)*.12,cy+Math.sin(g)*.12,g+(rnd()-.5)*.3,{max:Redge*1.1,curve:.12});res.pts[0]=[cx,cy];if(townLen(res.pts)>.5){roads.push({cls:T>=1?'col':'loc',pts:res.pts,end:res.end});junctions.push([cx,cy]);}}}
  while(roads.filter(r=>r.cls==='col').length<nCol&&tries++<30){const arm=arms[Math.floor(rnd()*arms.length)];if(!arm)break;const L=townLen(arm.pts),s=(.2+rnd()*.5)*Math.min(L,R0),p=townAlong(arm.pts,s,1)[0];if(!p)continue;const sd=rnd()<.5?1:-1,a=Math.atan2(p.ty,p.tx)+sd*(.7+rnd()*.35);
   const res=march(p.x,p.y,a,{from:roads.find(r=>r.pts===arm.pts),max:Redge*1.2,curve:.12,turn:0});if(townLen(res.pts)<.5)continue;res.pts[0]=[p.x,p.y];roads.push({cls:'col',pts:res.pts,end:res.end});junctions.push([p.x,p.y]);}
  for(const r of roads.filter(r=>r.cls==='col'))ribs(r,{s0:.18,step:.42+rnd()*.1,jitter:.6,curve:.18,len:[.3,.75],deadP:.35});
  for(const r of roads.filter(r=>r.cls==='art'))ribs(r,{s0:.25,step:.5,jitter:.7,curve:.18,len:[.25,.6],deadP:.4,sEnd:Redge});
 }else{   // roadside（村）: 幹線から 2〜4 本の短い行き止まり
  const n=2+Math.floor(rnd()*3)+Math.floor(o.target*grow/10);let made=0,tries=0;
  while(made<n&&tries++<40){const arm=arms[Math.floor(rnd()*arms.length)];if(!arm)break;const p=townAlong(arm.pts,.15+rnd()*R0*.8,1)[0];if(!p||tooCloseJ(p.x,p.y,.35))continue;const sd=rnd()<.5?1:-1,a=Math.atan2(p.tx*sd,-p.ty*sd)+(rnd()-.5)*.4;const res=march(p.x+Math.cos(a)*.1,p.y+Math.sin(a)*.1,a,{max:.3+rnd()*.25,curve:.1});res.pts[0]=[p.x,p.y];if(addLocal(res,{min:.22}))made++;}
 }
 // 公園: 地方都市以上の盤目・放射状で、中心から少し離れた区画の真ん中を1つ空ける
 const parks=[];
 if(T>=1&&(layout==='radial'||layout==='grid')){for(let i=0;i<24;i++){const a=mainAng+.6+i*.9,r=.5*R0,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r,b={x,y,u:[Math.cos(mainAng),Math.sin(mainAng)],hu:.13,hv:.12};
  const ok=!wet(x,y)&&!inBlock(x,y,.25)&&roads.every(rd=>townNear(x,y,rd.pts,W(rd)/2+.16).d>W(rd)/2+.16);if(ok){parks.push(addBlock('park',x,y,mainAng,.13,.12));break;}}}

 // ④ 建物
 const keys=o.keys,foot=o.foot,heights=o.heights,shapeRnd=townRng(o.seed+100003),hr=townRng(o.seed+9133);
 function shapeFor(h){const ratio=h/.17,choice=shapeRnd();shapeRnd();let pair,first;
  if(ratio<.85){pair=['obHouseFlat','obBlockFlat'];first=choice<.75?0:1;}else if(ratio<1.2){pair=['obBlockFlat','obDome'];first=choice<.7?0:1;}else if(ratio<1.6){pair=['obDome','obOffice'];first=choice<.5?0:1;}else{pair=['obOffice','obTowerME'];first=choice<.55?0:1;}
  const scale=k=>ratio/heights[k],valid=k=>scale(k)>=.7&&scale(k)<=1.35;let key=pair[first];if(!valid(key)){const ot=pair[1-first];key=valid(ot)?ot:(Math.abs(scale(key)-1)<=Math.abs(scale(ot)-1)?key:ot);}
  return {key,vertical:Math.max(.7,Math.min(1.35,scale(key)))};}
 const box=(x,y,a,w,d)=>({x,y,u:[Math.cos(a),Math.sin(a)],v:[-Math.sin(a),Math.cos(a)],hw:w/2,hd:d/2,ang:a});
 const pts9=(b)=>{const out=[];for(const [i,j] of [[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[0,1],[-1,0],[1,0],[0,0]])out.push([b.x+b.u[0]*b.hw*i+b.v[0]*b.hd*j,b.y+b.u[1]*b.hw*i+b.v[1]*b.hd*j]);return out;};
 const overlap=(p,q,m)=>{for(const ax of [p.u,p.v,q.u,q.v]){const dist=Math.abs((q.x-p.x)*ax[0]+(q.y-p.y)*ax[1]);const rp=(p.hw+m)*Math.abs(p.u[0]*ax[0]+p.u[1]*ax[1])+(p.hd+m)*Math.abs(p.v[0]*ax[0]+p.v[1]*ax[1]);const rq=(q.hw+m)*Math.abs(q.u[0]*ax[0]+q.u[1]*ax[1])+(q.hd+m)*Math.abs(q.v[0]*ax[0]+q.v[1]*ax[1]);if(dist>rp+rq)return false;}return true;};
 const clear=(b,m)=>pts9(b).every(([x,y])=>!wet(x,y)&&!inBlock(x,y,m)&&roads.every(r=>townNear(x,y,r.pts,W(r)/2+m).d>=W(r)/2+m)&&(o.otherRoads||[]).every(r=>townNear(x,y,r,TOWN_W.art/2+m).d>=TOWN_W.art/2+m));
 const facilities=[];
 if(compound){const s=T>=2?1:.8;const F=[['obHQ',.27,0,0,.3],['obWarehouse',.57,.22,0,.2],['obWarehouse',.57,-.22,0,.2],['obHangar',.57,0,Math.PI/2,.2],['obTanks',.09,-.24,0,.13],['obRadar',.09,.25,0,.14],['obContainers',.29,.27,0,.13],['obDepot',.29,-.27,0,.14]];
  for(const [key,a,b,rot,sc] of F){if(a*s>compound.L-.08||Math.abs(b*s)>compound.hv-.06)continue;const d=compound.d0+a*s,x=cx+compound.u[0]*d-compound.u[1]*b*s,y=cy+compound.u[1]*d+compound.u[0]*b*s;facilities.push({key,b:box(x,y,compound.ang+Math.PI+rot,foot[key][0]*sc*s,foot[key][1]*sc*s),s:sc*s,vertical:1,h:heights[key]*sc*s});}}
 const pri={loc:0,col:.22,art:layout==='roadside'?.15:.6},cand=[];
 for(const r of roads){const back=r.cls==='loc'||(r.cls==='col'&&r.ring)||(r.cls==='art'&&layout==='roadside');const offs=back?[W(r)/2+.1,W(r)/2+.29]:[W(r)/2+.1];
  for(const p of townAlong(r.pts,.06,.1)){if(r.map&&Math.hypot(p.x-cx,p.y-cy)>Redge)continue;const ang=Math.atan2(p.ty,p.tx);for(const sd of [-1,1])offs.forEach((off,row)=>{const x=p.x-p.ty*off*sd,y=p.y+p.tx*off*sd;cand.push({x,y,ang,k:Math.hypot(x-cx,y-cy)+pri[r.cls]+row*.1+rnd()*.15});});}}
 cand.sort((a,b)=>a.k-b.k);
 const placed=[];
 for(const q of cand){if(placed.length>=o.target)break;if(outside(q.x,q.y))continue;const r=hr(),h=(.16+r*.2)*(T>=2?.75:.5),{key,vertical}=shapeFor(h),b=box(q.x,q.y,q.ang,foot[key][0]*.17,foot[key][1]*.17);
  if(!clear(b,.012))continue;if(placed.some(p=>overlap(p.b,b,.012))||facilities.some(f=>overlap(f.b,b,.03)))continue;placed.push({key,b,s:.17,vertical,h,damage:0});}
 if(placed.length<o.target&&grow<1.9)return townPlan({...o,grow:grow*1.12});
 const tee=roads.filter(r=>r.cls==='loc'&&r.end==='tee').length,dead=roads.filter(r=>r.end==='dead').length;
 return {c,R0,Redge,grow,arms,roads,blocks,plaza,compound,parks,facilities,buildings:placed,tee,dead,W:{art:TOWN_W.art,col:Wc,loc:Wl}};
}

let groundBackground=null;
function groundSetup(id){
  groundTerrainId=id||null;groundDimensionCache=null;
  if(id){rebuildGroundRuleSet();groundSetupCoordinates();}
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
  // 同じ形を町ごとにまとめる。底面と高さは見本と同じく実際の頂点から測る。
  const buildingKeys=['obHouseFlat','obBlockFlat','obDome','obOffice','obTowerME','obHQ','obWarehouse','obHangar','obTanks','obRadar','obDepot','obContainers'],buildingGeos={},buildingHeights={},buildingFoot={};
  for(const key of buildingKeys){const geo=groundShapeGeo(key);geo.computeBoundingBox();const b=geo.boundingBox;
   buildingFoot[key]=[b.max.x-b.min.x,b.max.z-b.min.z];buildingHeights[key]=b.max.y-b.min.y;
   geo.translate(-(b.min.x+b.max.x)/2,-b.min.y,-(b.min.z+b.max.z)/2);geo.userData.groundShapeKey=key;
   const colors=geo.attributes.color;for(let i=0;i<colors.count*3;i++)colors.array[i]=.62+.38*colors.array[i];buildingGeos[key]=geo;
  }
  // 町の最大生成範囲を20m格子の配列へ一度だけ塗る。
  // 多角形の内部は走査線でまとめて記録。水際・川幅に触れるセルだけは
  // 正確な座標で元の判定を行い、道と建物の位置を格子丸めで変えない。
  const wetExact=(x,y)=>!groundPass(x,y,'vehicle')||d.water.rivers.some(r=>{const q=groundRiverAt(x,y,r);return q.dist<q.width/2+.1;});
  function townWater(cx,cy,extent){const step=.02,x0=Math.floor((cx-extent)/step),y0=Math.floor((cy-extent)/step),cols=Math.ceil((cx+extent)/step)-x0+1,rows=Math.ceil((cy+extent)/step)-y0+1,cells=new Uint8Array(cols*rows);cells.fill(2);
   function paint(poly,value){for(let iy=0;iy<rows;iy++){const y=(y0+iy+.5)*step,cross=[];
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y))cross.push((b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]);}
    cross.sort((a,b)=>a-b);for(let i=0;i+1<cross.length;i+=2){const left=Math.max(0,Math.ceil(cross[i]/step-x0-.5)),right=Math.min(cols,Math.ceil(cross[i+1]/step-x0-.5));if(right>left)cells.fill(value,iy*cols+left,iy*cols+right);}
   }}
   paint(d.display.board,1);paint(d.water.sea,2);for(const pond of d.water.ponds)paint(pond,2);
   function boundary(a,b,pad){const left=Math.max(0,Math.floor((Math.min(a[0],b[0])-pad)/step)-x0),right=Math.min(cols-1,Math.floor((Math.max(a[0],b[0])+pad)/step)-x0),bottom=Math.max(0,Math.floor((Math.min(a[1],b[1])-pad)/step)-y0),top=Math.min(rows-1,Math.floor((Math.max(a[1],b[1])+pad)/step)-y0);
    if(left>right||bottom>top)return;for(let iy=bottom;iy<=top;iy++)cells.fill(3,iy*cols+left,iy*cols+right+1);
   }
   for(const poly of [d.display.board,d.water.sea,...d.water.ponds])for(let i=0,j=poly.length-1;i<poly.length;j=i++)boundary(poly[i],poly[j],step);
   for(const river of d.water.rivers){const pad=Math.max(...river.widths)/2+.12+Math.SQRT2*.01;for(let i=1;i<river.points.length;i++)boundary(river.points[i-1],river.points[i],pad);}
   boundary([0,0],[W,0],step);boundary([0,H],[W,H],step);boundary([0,0],[0,H],step);boundary([W,0],[W,H],step);
   return (x,y)=>{const ix=Math.floor(x/step)-x0,iy=Math.floor(y/step)-y0;if(ix<0||iy<0||ix>=cols||iy>=rows||x<0||x>=W||y<0||y>=H)return wetExact(x,y);const value=cells[iy*cols+ix];return value===3?wetExact(x,y):value===2;};
  }
  const townLayouts=new Map(),mapRoads=d.objects.roads.map(r=>({id:r.id,type:r.type,pts:r.points}));
  for(const spec of d.objects.settlements){const site=d.sites.find(s=>s.id===spec.site)||spec,id=spec.site||spec.id,target=groundTownCount(spec),tier=spec.tier??(target>=60?2:target>=30?1:0);
   const nearest=nearestRoadPoint(site.x,site.y),center=Math.hypot(nearest.x-site.x,nearest.y-site.y)<.6?[nearest.x,nearest.y]:[site.x,site.y],redge=Math.sqrt(target*.19*.17/(.42*Math.PI))*1.24,wet=townWater(...center,redge*1.9+1.2);
   const t=townPlan({site:[site.x,site.y],roads:mapRoads,layout:spec.layout||['roadside','organic','radial','radial'][tier],tier,target,wet,seed:d.meta.seed+Array.from(id).reduce((n,c)=>n+c.charCodeAt(0),0),hq:(spec.facilities||[]).includes('depot'),foot:buildingFoot,heights:buildingHeights});
   t.R=Math.max(0,...t.buildings.map(p=>Math.hypot(p.b.x-t.c[0],p.b.y-t.c[1])))+.25;townLayouts.set(spec,t);
  }
  const townList=[...townLayouts.values()],vegetationBins=new Map();
  for(const t of townList)for(const p of [...t.buildings,...t.facilities]){const b=p.b,ex=Math.abs(b.u[0])*b.hw+Math.abs(b.v[0])*b.hd,ey=Math.abs(b.u[1])*b.hw+Math.abs(b.v[1])*b.hd;
   for(let ix=Math.floor((b.x-ex-1)/.5);ix<=Math.floor((b.x+ex+1)/.5);ix++)for(let iy=Math.floor((b.y-ey-1)/.5);iy<=Math.floor((b.y+ey+1)/.5);iy++){const key=ix*65536+iy;let list=vegetationBins.get(key);if(!list)vegetationBins.set(key,list=[]);list.push(b);}
  }
  function nearTownBuilding(x,y,radius){for(const b of vegetationBins.get(Math.floor(x/.5)*65536+Math.floor(y/.5))||[]){const dx=x-b.x,dy=y-b.y,u=dx*b.u[0]+dy*b.u[1],v=dx*b.v[0]+dy*b.v[1];if(Math.hypot(Math.max(0,Math.abs(u)-b.hw),Math.max(0,Math.abs(v)-b.hd))<=radius+.05)return true;}return false;}
  const SURF={art:'#e2d7b8',col:'#c9c2b0',loc:'#cfc29f'},EDGE={art:'#5d594c',col:'#6c665a',loc:'#8a7a5a'},RANK={loc:0,col:1,art:2},FADE=.1;
  function roadWidth(t,r,surface){return r.cls==='art'?(surface?.1:.19):t.W[r.cls]*(surface?(r.cls==='col'?.72:.68):1);}
  function joinAt(t,r,p){let best=null,bd=.05;for(const q of t.roads){if(q===r)continue;const dist=townNear(p[0],p[1],q.pts,.05).d;if(dist<bd&&RANK[q.cls]>RANK[r.cls]&&(!best||RANK[q.cls]>RANK[best.cls]||dist<bd)){bd=dist;best=q;}}return best?best.cls:null;}
  function roadColors(t,r){const own=new THREE.Color(SURF[r.cls]),j0=joinAt(t,r,r.pts[0]),j1=joinAt(t,r,r.pts[r.pts.length-1]),c0=j0&&new THREE.Color(SURF[j0]),c1=j1&&new THREE.Color(SURF[j1]);
   return (s,L,c=new THREE.Color())=>{c.copy(own);if(c0&&s<FADE)c.lerp(c0,1-s/FADE);if(c1&&L-s<FADE)c.lerp(c1,1-(L-s)/FADE);return c;};
  }
  const denseRoadCache=new WeakMap();
  function denseRoad(pts){if(denseRoadCache.has(pts))return denseRoadCache.get(pts);const out=[{p:pts[0],s:0}],L=townLen(pts);let acc=0;
   for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/.03));for(let k=1;k<=n;k++)out.push({p:[a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n],s:acc+len*k/n});acc+=len;}const result={points:out,L};denseRoadCache.set(pts,result);return result;
  }
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
ctx.save();ctx.globalAlpha=.2;
for(const row of d.objects.forest.windbreaks||[])drawLine(ctx,row.points,row.widthKm,'#30563e',scale);
for(const patch of d.objects.forest.islands||[]){polyPath(ctx,patch.polygon,scale);ctx.fillStyle='#30563e';ctx.fill();}
ctx.restore();
ctx.save();smoothPath(ctx,d.water.sea,scale);ctx.clip();
if(seaMode==='board'){
  // Four stepped depth bands measured outwards from the coastline.
  ctx.fillStyle='#081d35';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const [width,color] of [[9,'#10354c'],[6.2,'#195365'],[3.6,'#28777b'],[1.5,'#54a4a0']])drawLine(ctx,d.water.coast,width,color,scale);
  for(const offset of [.7,1.8,3.1,4.4])drawLine(ctx,d.water.coast.map(([x,y])=>[x,y-offset]),.045,'rgba(153,232,222,.72)',scale);
}else{
  // Distances from the local coast control shallow water and deeper offshore colour.
  const seaCanvas=document.createElement('canvas');const seaScale=Math.min(10,1024/Math.max(W,H));seaCanvas.width=Math.ceil(W*seaScale);seaCanvas.height=Math.ceil(H*seaScale);const seaCtx=seaCanvas.getContext('2d'),seaPixels=seaCtx.createImageData(seaCanvas.width,seaCanvas.height);function coastAt(x){const coast=d.water.coast;for(let i=0;i<coast.length-1;i++){const a=coast[i],b=coast[i+1];if(x<=b[0]){const t=Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0])));return a[1]+(b[1]-a[1])*t}}return coast[coast.length-1][1]}
  // 同じ画素値を、画素ごとの配列生成なしで求める。列・行だけで決まる項も先に計算する。
  const seaCols=Array.from({length:seaCanvas.width},(_,px)=>{const x=(px+.5)/seaCanvas.width*W;return {x,coast:coastAt(x),sunX:((x-W*39/48)/8)**2};});
  const mouths=d.water.rivers.map(r=>{const end=r.points[r.points.length-1];return {mouthY:coastAt(end[0]),xs:seaCols.map(c=>((c.x-end[0])/2.5)**2)};});
  for(let py=0;py<seaCanvas.height;py++){const y=H-(py+.5)/seaCanvas.height*H,plumeY=mouths.map(m=>((y-(m.mouthY-.7))/1.2)**2);
   for(let px=0;px<seaCanvas.width;px++){const c=seaCols[px],depth=Math.max(0,c.coast-y),f=Math.max(0,Math.min(1,(depth-1)/2)),t=f*f*(3-2*f),sun=Math.exp(-(c.sunX+((depth-1.5)/2.6)**2))*.34;
    let red=115*(1-t)+9*t,green=192*(1-t)+32*t,blue=179*(1-t)+57*t;
    red=red+(255-red)*sun;green=green+(255-green)*sun;blue=blue+(255-blue)*sun;
    for(let i=0;i<mouths.length;i++){const plume=Math.exp(-(mouths[i].xs[px]+plumeY[i]))*.52;red=red*(1-plume)+180*plume;green=green*(1-plume)+158*plume;blue=blue*(1-plume)+118*plume;}
    const k=(py*seaCanvas.width+px)*4;seaPixels.data[k]=red;seaPixels.data[k+1]=green;seaPixels.data[k+2]=blue;seaPixels.data[k+3]=255;
   }
  }
  seaCtx.putImageData(seaPixels,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(seaCanvas,0,0,canvas.width,canvas.height);

}
ctx.restore();if(seaMode==='real'){const shorelineCurve=new THREE.CatmullRomCurve3(d.water.coast.map(([x,y])=>new THREE.Vector3(x,y,0)),false,'centripetal'),foam=shorelineCurve.getPoints(500).map((p,i)=>[p.x,p.y-.06+.035*Math.sin(i*.19)]);drawLine(ctx,foam,.11,'rgba(235,247,232,.96)',scale);drawLine(ctx,foam.map(([x,y],i)=>[x,y-.12+.018*Math.sin(i*.29)]),.035,'rgba(229,246,239,.7)',scale)}
for(const pond of d.water.ponds){polyPath(ctx,pond,scale);ctx.fillStyle='#4d8987';ctx.fill()}
for(const river of d.water.rivers){const path=new THREE.CatmullRomCurve3(river.points.map(p=>new THREE.Vector3(p[0],p[1],0)),false,'centripetal'),points=path.getPoints((river.points.length-1)*8);for(let i=0;i<points.length-1;i++){let t=i/(points.length-1)*(river.widths.length-1),k=Math.floor(t),width=river.widths[k]*(1-(t-k))+river.widths[Math.min(k+1,river.widths.length-1)]*(t-k);drawLine(ctx,[[points[i].x,points[i].y],[points[i+1].x,points[i+1].y]],width,'#4c9fa8',scale)}}
drawLine(ctx,d.water.deepChannel.points,d.water.deepChannel.widthKm,'#24596b',scale);
// 地図の幹線も町の道も、全てのふち → 全ての路面の順に描く。
for(const t of townLayouts.values())for(const r of t.roads.filter(r=>!r.map))drawLine(ctx,r.pts,roadWidth(t,r,false),EDGE[r.cls],scale);
for(const road of d.objects.roads)drawLine(ctx,road.points,.19,EDGE.art,scale);
for(const t of townLayouts.values())for(const r of t.roads.filter(r=>!r.map)){const {points,L}=denseRoad(r.pts),colorAt=roadColors(t,r);
 // 同色の路面は折れ線を一度だけ描く。色が変わる接続端だけ細分する。
 drawLine(ctx,r.pts,roadWidth(t,r,true),SURF[r.cls],scale);
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a.s>=FADE&&L-b.s>=FADE)continue;const ca=colorAt(a.s,L).getHexString(),cb=colorAt(b.s,L).getHexString();if(ca===cb&&ca===SURF[r.cls].slice(1))continue;
  const gradient=ctx.createLinearGradient(a.p[0]*scale,(H-a.p[1])*scale,b.p[0]*scale,(H-b.p[1])*scale);gradient.addColorStop(0,'#'+ca);gradient.addColorStop(1,'#'+cb);drawLine(ctx,[a.p,b.p],roadWidth(t,r,true),gradient,scale);}}
for(const road of d.objects.roads)drawLine(ctx,road.points,.1,SURF.art,scale);
for(const bridge of d.objects.bridges)drawLine(ctx,[[bridge.x-.45,bridge.y],[bridge.x+.45,bridge.y]],.14,'#eee7d4',scale);
ctx.save();ctx.globalCompositeOperation='destination-in';polyPath(ctx,boardOutline,scale);ctx.fillStyle='#fff';ctx.fill();ctx.restore();
const texture=new THREE.CanvasTexture(canvas);texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const geometry=new THREE.PlaneGeometry(W,H,dimensions.mesh.segmentsX,dimensions.mesh.segmentsZ);geometry.rotateX(-Math.PI/2);const pos=geometry.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,elevation(pos.getX(i)+W/2,H/2-pos.getZ(i)));geometry.computeVertexNormals();const groundMesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({map:texture,transparent:true,alphaTest:.1,side:THREE.DoubleSide}));groundMesh.receiveShadow=true;groundMesh.renderOrder=-3;world.add(groundMesh);   // 半透明の組でいちばん先（町の道の帯 -2・-1 がその上）

// Animated specular flecks are masked to the sea and excluded from dry ground.
const waterMask=document.createElement('canvas');waterMask.width=canvas.width;waterMask.height=canvas.height;const wm=waterMask.getContext('2d');smoothPath(wm,d.water.sea,scale);wm.fillStyle='#fff';wm.fill();wm.globalCompositeOperation='destination-in';polyPath(wm,boardOutline,scale);wm.fill();const waterMaskTexture=new THREE.CanvasTexture(waterMask);const waterGeo=geometry.clone(),wp=waterGeo.attributes.position;for(let i=0;i<wp.count;i++)wp.setY(i,wp.getY(i)+.008);const waterMaterial=groundWaterMaterial=new THREE.ShaderMaterial({uniforms:{mask:{value:waterMaskTexture},time:{value:0}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D mask; uniform float time; varying vec2 vUv; void main(){float m=texture2D(mask,vUv).a; float a=sin(vUv.x*780.0+vUv.y*280.0+time*.65); float b=sin(vUv.y*620.0-vUv.x*120.0-time*.43); float glint=pow(max(0.0,a*b),13.0);gl_FragColor=vec4(.68,.86,.84,m*glint*.25);}',transparent:true,depthWrite:false});const waterLayer=new THREE.Mesh(waterGeo,waterMaterial);waterLayer.visible=seaMode==='real';world.add(waterLayer);

function rng(seed){return function(){seed=seed*16807%2147483647;return (seed-1)/2147483646}}
// Reeds are a surface detail and appear only on wet cells.
function populateReeds(){const spec=d.objects.reeds,random=rng(spec.seed),polys=d.surface.filter(s=>spec.coverIds.includes(s.id)).map(s=>s.polygon),mesh=new THREE.InstancedMesh(new THREE.ConeBufferGeometry(.07,.17,4),new THREE.MeshLambertMaterial({color:0xb2aa63}),spec.count),dummy=new THREE.Object3D();let count=0;for(let i=0;i<spec.count*120&&count<spec.count;i++){let x=random()*W,y=random()*H;if(!polys.some(p=>inside(x,y,p))||inside(x,y,d.water.sea)||d.terrain.cells[Math.floor(y/cell)*d.terrain.cols+Math.floor(x/cell)]!=='沼地')continue;if(spec.roadClearanceKm){const road=nearestRoadPoint(x,y);if(Math.hypot(x-road.x,y-road.y)<spec.roadClearanceKm)continue;}dummy.position.set(toX(x),elevation(x,y)+.075,toZ(y));dummy.scale.setScalar(.65+random()*.5);dummy.rotation.y=random()*Math.PI;dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix)}mesh.count=count;mesh.userData.groundObject='reeds';mesh.castShadow=true;world.add(mesh)}
function forestBandWidth(b,y){const t=Math.max(0,Math.min(1,(y-b.yMin)/(b.fadeStartYKm-b.yMin)));return b.bankMaxSouthKm+(b.bankMaxNorthKm-b.bankMaxSouthKm)*t}
// Place trees from each actual channel outwards, in reproducible interrupted banks.
function populateForest(){
 const spec=d.objects.forest,random=rng(spec.seed),treeCount=Math.round(spec.count*(spec.renderFactor??.55)),mesh=new THREE.InstancedMesh(groundShapeGeo('obTreeBroad'),new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true}),treeCount),dummy=new THREE.Object3D();
 mesh.geometry.computeBoundingBox();const forestBox=mesh.geometry.boundingBox,forestCanopyRadius=Math.hypot(Math.max(Math.abs(forestBox.min.x),Math.abs(forestBox.max.x)),Math.max(Math.abs(forestBox.min.z),Math.abs(forestBox.max.z)));
 function bankCandidate(){
  const band=spec.bands[Math.floor(random()*spec.bands.length)],river=d.water.rivers.find(r=>r.id===band.river),i=Math.floor(random()*(river.points.length-1)),a=river.points[i],b=river.points[i+1],t=random(),cx=a[0]+(b[0]-a[0])*t,cy=a[1]+(b[1]-a[1])*t;
  if(cy<band.yMin||cy>band.yMax||cy>spec.terraceMaxYKm)return null;
  const fade=Math.max(0,Math.min(1,(cy-band.yMin)/(band.fadeStartYKm-band.yMin)));if(random()>.18+.82*fade)return null;
  const gap=(Math.sin((cy/band.gapPeriodKm)*Math.PI*2+band.gapFraction*7)+1)/2;if(gap<band.gapFraction)return null;
  const width=forestBandWidth(band,cy),distance=band.bankMinKm+random()*Math.max(0,width-band.bankMinKm),side=random()<.5?-1:1,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  return {x:cx-side*dy/len*distance,y:cy+side*dx/len*distance,zone:'bank'};
 }
 function candidate(){
  // Optional sources use only their declared lines/polygons. Old maps keep their seeded river placement.
  if(!spec.windbreaks&&!spec.islands)return bankCandidate();
  const source=(count+.5)/treeCount;
  if(source<(spec.windbreakShare||0)){
   const row=spec.windbreaks[Math.floor(random()*spec.windbreaks.length)],i=Math.floor(random()*(row.points.length-1)),a=row.points[i],b=row.points[i+1],t=random(),side=(random()-.5)*row.widthKm,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
   return {x:a[0]+dx*t-dy/len*side,y:a[1]+dy*t+dx/len*side,zone:'windbreak'};
  }
  if(source<(spec.windbreakShare||0)+(spec.islandShare||0)){
   const p=spec.islands[Math.floor(random()*spec.islands.length)].polygon,xs=p.map(p=>p[0]),ys=p.map(p=>p[1]),x=Math.min(...xs)+random()*(Math.max(...xs)-Math.min(...xs)),y=Math.min(...ys)+random()*(Math.max(...ys)-Math.min(...ys));
   return inside(x,y,p)?{x,y,zone:'island'}:null;
  }
  return bankCandidate();
 }
 let count=0;
 for(let attempt=0;attempt<treeCount*80&&count<treeCount;attempt++){
  const p=candidate();if(!p)continue;const {x,y,zone}=p;
  if(!inside(x,y,d.display.board)||inside(x,y,d.water.sea)||(spec.avoidWater&&y>spec.terraceMaxYKm))continue;
  if(spec.avoidWater&&(!groundPass(x,y,'vehicle')||d.water.rivers.some(r=>{const at=groundRiverAt(x,y,r);return at.dist<at.width/2;})))continue;
  const road=nearestRoadPoint(x,y);if(Math.hypot(x-road.x,y-road.y)<spec.roadClearanceKm)continue;
  const height=.38+random()*.3;
  if(townList.some(t=>Math.hypot(x-t.c[0],y-t.c[1])<t.R)){random();random();random();random();continue;} // 町の円では必ず4回引いて飛ばす。
  const sx=.85+random()*.5,sz=.85+random()*.5,angle=random()*Math.PI,shade=random()<.5?1:.86;
  if(nearTownBuilding(x,y,forestCanopyRadius*.308/.9*Math.max(sx,sz)))continue;
  dummy.position.set(toX(x),elevation(x,y),toZ(y));dummy.scale.set(sx,height/.35,sz);dummy.rotation.y=angle;
  groundForests.push({x:toX(x)*GROUND_SCALE,z:toZ(y)*GROUND_SCALE,r:.154*Math.max(dummy.scale.x,dummy.scale.z)*GROUND_SCALE,...(spec.windbreaks||spec.islands?{zone}:{})});
  dummy.position.y=elevation(x,y);dummy.scale.set(.308*dummy.scale.x/.9,(height*.455+.154*height/.35)/1.32,.308*dummy.scale.z/.9);dummy.updateMatrix();mesh.setMatrixAt(count,dummy.matrix);mesh.setColorAt(count,new THREE.Color().setRGB(shade,shade,shade));count++;
 }
 mesh.count=count;mesh.userData.groundObject='forest';if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);
}
// Bushes form little clusters on steppe, river margins, and salt margins only.
function populateShrubs(){
 const spec={...d.objects.shrubs,count:d.objects.shrubs.renderCount??(d.meta.id==='exercise2'?650:d.objects.shrubs.count)},random=rng(spec.seed),geo=new THREE.IcosahedronBufferGeometry(1,spec.geometryDetail??1),positions=geo.attributes.position;
 // One fixed irregular low-poly shape is varied in scale, rotation and colour per lobe.
 const jitter=rng(spec.seed+313);for(let i=0;i<positions.count;i++){const f=.78+jitter()*.44;positions.setXYZ(i,positions.getX(i)*f,positions.getY(i)*f,positions.getZ(i)*f)}geo.computeVertexNormals();
 geo.computeBoundingBox();const shrubBox=geo.boundingBox,shrubRadius=.12+Math.hypot(.16*Math.max(Math.abs(shrubBox.min.x),Math.abs(shrubBox.max.x)),.08*Math.max(Math.abs(shrubBox.min.y),Math.abs(shrubBox.max.y)),.2*Math.max(Math.abs(shrubBox.min.z),Math.abs(shrubBox.max.z)));
 const mesh=new THREE.InstancedMesh(geo,new THREE.MeshLambertMaterial({color:0xffffff}),spec.count*7),shadow=new THREE.InstancedMesh(new THREE.CircleBufferGeometry(.17,8),new THREE.MeshBasicMaterial({color:0x122017,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide}),spec.count),dummy=new THREE.Object3D();let plants=0,lobes=0;
 function cluster(x,y){let gx=Math.floor(x/spec.clusterKm),gy=Math.floor(y/spec.clusterKm),n=Math.sin(gx*127.1+gy*311.7+spec.seed)*43758.5453;return n-Math.floor(n)}
 function eligible(x,y){if(nearTownBuilding(x,y,shrubRadius))return false;if(y>spec.terraceMaxYKm||!inside(x,y,d.display.board)||inside(x,y,d.water.sea))return false;let valid=false;for(const zone of spec.zones){if(zone.kind==='bank'){const dist=Math.min(...zone.riverIds.map(id=>segmentDistance(x,y,d.water.rivers.find(r=>r.id===id).points)));if(dist>=zone.minKm&&dist<=zone.maxKm&&random()<zone.density)valid=true}else if(inside(x,y,zone.polygon)&&cluster(x,y)>.58&&random()<zone.density)valid=true}if(!valid)return false;const road=nearestRoadPoint(x,y);return Math.hypot(x-road.x,y-road.y)>=spec.roadClearanceKm}
 for(let attempt=0;attempt<spec.count*100&&plants<spec.count;attempt++){const cx=random()*W,cy=random()*H;if(!eligible(cx,cy))continue;const groupSize=2+Math.floor(random()*4);for(let n=0;n<groupSize&&plants<spec.count;n++){const angle=random()*Math.PI*2,r=n?(.12+random()*.38):0,x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r;if(n&&!eligible(x,y))continue;const base=elevation(x,y),shadeColors=[0x8b9a7a,0x929a67,0xaca378,0x8d7e67,0x78947c],color=new THREE.Color(shadeColors[Math.floor(random()*shadeColors.length)]),lobeCount=(spec.lobeMin??3)+Math.floor(random()*((spec.lobeMax??7)-(spec.lobeMin??3)+1));dummy.position.set(toX(x),base+.012,toZ(y));dummy.rotation.set(-Math.PI/2,0,random()*Math.PI);dummy.scale.set(1.05,.75,1);dummy.updateMatrix();shadow.setMatrixAt(plants,dummy.matrix);for(let j=0;j<lobeCount;j++){const a=random()*Math.PI*2,dist=j===0?0:random()*.12,wide=.07+random()*.09,high=.035+random()*.045;dummy.position.set(toX(x)+Math.cos(a)*dist,base+high*.75,toZ(y)+Math.sin(a)*dist);dummy.rotation.set(random()*.25,random()*Math.PI,random()*.25);dummy.scale.set(wide,high,wide*(.75+random()*.5));dummy.updateMatrix();mesh.setMatrixAt(lobes,dummy.matrix);mesh.setColorAt(lobes,color.clone().multiplyScalar(.88+random()*.24));lobes++}plants++}}
 mesh.count=lobes;shadow.count=plants;mesh.userData.groundObject='shrubLobes';shadow.userData.groundObject='shrubs';if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;world.add(shadow);world.add(mesh)
}

populateReeds();populateForest();populateShrubs();
// 町ごとに路面1枚・ふち1枚。幹線の腕も重ね、路面を全てのふちより上へ置く。
// 帯は奥行きを書かない（ユーザー 2026-11-16「傾けると幹線道路の陣営の色が消える」: 帯の奥行きが、上に重ねる陣営の色と視界の霧を隠していた）。
// 半透明の組で、地面（renderOrder -3）のすぐあと、ほかの全て（攻撃の円など 0、霧 3、陣営の色 4）の前に描く。
// 重なりは描く順で決める: ふち（-2）→ 路面（-1）、同じ層では生活道路 → 集散路 → 幹線（前の高さの順と同じ）。
// 幹線の腕（町の外れ + 1.2 km まで伸びる）の外の端は、最後の 0.8 km で透けていき、地面の絵の同じ幹線へつながる
// （ユーザー 2026-11-16「ここのようなつなぎ目はなくして」）。透ける所でふちと路面が重なると色が濁るので、
// 幹線のふちは路面の両わきの2本の帯にする（重ならなければ、同じ色の絵の上で透けても色は変わらない）。
const ART_FADE=.8;
for(const [spec,t] of townLayouts){
 const sampled=t.roads.map(r=>{const d=denseRoad(r.pts);for(const p of d.points)p.h=elevation(...p.p);return {r,...d,corners:r.pts.map(p=>elevation(...p))};}).sort((a,b)=>RANK[a.r.cls]-RANK[b.r.cls]);
 const reach=t.Redge+1.2,verts=sampled.reduce((n,d)=>n+(d.points.length-1)*12+d.r.pts.length*24,0);
 for(const layer of ['edge','surf']){const P=new Float32Array(verts*3),C=new Float32Array(verts*4),surface=layer==='surf';let pi=0,ci=0;
  for(const {r,points,L,corners} of sampled){const w=roadWidth(t,r,surface),inner=r.map&&!surface?roadWidth(t,r,true):0,height=(surface?.009:.004)+RANK[r.cls]*.0012,edgeColor=new THREE.Color(EDGE[r.cls]),colorAt=surface?roadColors(t,r):()=>edgeColor,ca=new THREE.Color(),cb=new THREE.Color();
   const fade=r.map&&L>=reach-1e-3?ART_FADE:0,alpha=s=>fade?Math.max(0,Math.min(1,(L-s)/fade)):1;
   const put=(x,y,h,c,a)=>{P[pi++]=toX(x);P[pi++]=h+height;P[pi++]=toZ(y);C[ci++]=c.r;C[ci++]=c.g;C[ci++]=c.b;C[ci++]=a;};
   // 道の中心から横へ o0〜o1 の帯（前と同じ巻き方）。
   const strip=(o0,o1)=>{for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],[ax,ay]=a.p,[bx,by]=b.p,len=Math.hypot(bx-ax,by-ay)||1,ux=-(by-ay)/len,uy=(bx-ax)/len,aa=alpha(a.s),ba=alpha(b.s);if(!aa&&!ba)continue;const ac=colorAt(a.s,L,ca),bc=colorAt(b.s,L,cb);
    put(ax+ux*o1,ay+uy*o1,a.h,ac,aa);put(bx+ux*o0,by+uy*o0,b.h,bc,ba);put(ax+ux*o0,ay+uy*o0,a.h,ac,aa);put(ax+ux*o1,ay+uy*o1,a.h,ac,aa);put(bx+ux*o1,by+uy*o1,b.h,bc,ba);put(bx+ux*o0,by+uy*o0,b.h,bc,ba);}};
   if(inner){strip(inner/2,w/2);strip(-w/2,-inner/2);}else strip(-w/2,w/2);
   // 折れ目の丸。幹線のふちは透けない所だけ（透ける所では路面に重なって濁る）。
   let s=0;r.pts.forEach((p,i)=>{if(i)s+=Math.hypot(p[0]-r.pts[i-1][0],p[1]-r.pts[i-1][1]);const a0=alpha(s);if(a0<=0||(inner&&a0<1))return;const c=colorAt(s,L,ca),h=corners[i];for(let k=0;k<8;k++){const a=k/8*Math.PI*2,b=(k+1)/8*Math.PI*2;put(...p,h,c,a0);put(p[0]+Math.cos(b)*w/2,p[1]+Math.sin(b)*w/2,h,c,a0);put(p[0]+Math.cos(a)*w/2,p[1]+Math.sin(a)*w/2,h,c,a0);}});
  }
  if(!pi)continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P.slice(0,pi),3));g.setAttribute('color',new THREE.BufferAttribute(C.slice(0,ci),4));g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:surface?-2:-1,polygonOffsetUnits:surface?-2:-1}));m.renderOrder=surface?-1:-2;m.receiveShadow=true;m.userData={groundObject:surface?'streets':'streetEdges',settlement:spec.site||spec.id};world.add(m);
 }
 // 広場、本営の敷地と三方の低い塀、公園（公園の木は遮蔽に含めない）。
 for(const b of t.blocks){const u=b.u,v=[-u[1],u[0]],corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[b.x+u[0]*b.hu*i+v[0]*b.hv*j,b.y+u[1]*b.hu*i+v[1]*b.hv*j]);
  const sh=new THREE.Shape(corners.map(([x,y])=>new THREE.Vector2(toX(x),-toZ(y)))),g=new THREE.ShapeGeometry(sh);g.rotateX(-Math.PI/2);const positions=g.attributes.position;
  for(let i=0;i<positions.count;i++)positions.setY(i,elevation(positions.getX(i)+W/2,H/2-positions.getZ(i))+(b.kind==='plaza'?.0135:.0045));g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color:b.kind==='hq'?0xb3ad94:b.kind==='park'?0x6f8a55:0xc9c2b0,side:THREE.DoubleSide}));m.receiveShadow=true;m.userData={groundObject:'townBlocks',settlement:spec.site||spec.id};world.add(m);
  if(b.kind==='hq'){const material=new THREE.MeshLambertMaterial({color:0x8d8a7c}),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.025,.012),material,3),dummy=new THREE.Object3D();
   for(let k=0;k<3;k++){const a=corners[k],q=corners[(k+1)%4],x=(a[0]+q[0])/2,y=(a[1]+q[1])/2;dummy.position.set(toX(x),elevation(x,y)+.0125,toZ(y));dummy.scale.set(Math.hypot(q[0]-a[0],q[1]-a[1]),1,1);dummy.rotation.y=Math.atan2(q[1]-a[1],q[0]-a[0]);dummy.updateMatrix();mesh.setMatrixAt(k,dummy.matrix);}mesh.castShadow=true;mesh.userData.groundObject='hqWalls';world.add(mesh);
  }
  if(b.kind==='park'){const trees=[],random=townRng(7);for(let i=0;i<40&&trees.length<7;i++){const x=(random()*2-1)*(b.hu-.04),y=(random()*2-1)*(b.hv-.04);if(trees.every(([a,c])=>Math.hypot(a-x,c-y)>.07))trees.push([x,y]);}
   const mesh=new THREE.InstancedMesh(groundShapeGeo('obTreeBroad'),new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true}),trees.length),dummy=new THREE.Object3D();trees.forEach(([a,c],i)=>{const x=b.x+u[0]*a+v[0]*c,y=b.y+u[1]*a+v[1]*c;dummy.position.set(toX(x),elevation(x,y),toZ(y));dummy.scale.setScalar(.075+random()*.02);dummy.rotation.y=random()*6;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.castShadow=true;mesh.userData.groundObject='parkTrees';world.add(mesh);
  }
 }
}
const buildingMaterial=new THREE.MeshLambertMaterial({color:0xb6bab4,vertexColors:true});
for(const [spec,t] of townLayouts){const id=spec.site||spec.id;
 for(const [kind,items] of [['buildings',t.buildings],['hqFacilities',t.facilities]]){
  const groups={};for(const p of items)(groups[p.key]||(groups[p.key]=[])).push(p);
  for(const [key,list] of Object.entries(groups)){const mesh=new THREE.InstancedMesh(buildingGeos[key],buildingMaterial,list.length),dummy=new THREE.Object3D();
   list.forEach((p,i)=>{const {x,y,ang,hw,hd}=p.b,base=elevation(x,y)+.02,h=buildingHeights[key]*p.s*p.vertical,c=Math.abs(Math.cos(ang)),s=Math.abs(Math.sin(ang)),ex=c*hw+s*hd,ez=s*hw+c*hd;
    dummy.position.set(toX(x),base,toZ(y));dummy.rotation.set(0,ang,0);dummy.scale.set(p.s,p.s*p.vertical,p.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    groundBuildings.push({minX:(toX(x)-ex)*GROUND_SCALE,maxX:(toX(x)+ex)*GROUND_SCALE,minZ:(toZ(y)-ez)*GROUND_SCALE,maxZ:(toZ(y)+ez)*GROUND_SCALE,bottom:base*GROUND_SCALE,top:(base+h)*GROUND_SCALE,x:toX(x)*GROUND_SCALE,z:toZ(y)*GROUND_SCALE,ang,w:hw*2*GROUND_SCALE,d:hd*2*GROUND_SCALE,key,settlement:id,damage:0});
   });mesh.userData={groundObject:kind,settlement:id};mesh.castShadow=mesh.receiveShadow=true;world.add(mesh);
  }
 }
}
// Shape geometries not used by this map have no mesh to dispose them on the next setup.
for(const [key,g] of Object.entries(buildingGeos))if(!groundBuildings.some(b=>b.key===key))g.dispose();

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
const groundPathGrids=new WeakMap();
function groundPathRiverBlocked(x,y,river,d,cell){
  const r=groundRiverAt(x,y,river);
  if(r.dist>=r.width/2+.12)return false;
  const bridge=d.objects.bridges.some(b=>b.river===river.id&&Math.hypot(x-b.x,y-b.y)<.9)||groundBuiltBridgeAt(x,y,river.id);
  const ford=d.objects.fords.some(f=>f.river===river.id&&Math.abs((x-f.x)*r.tx+(y-f.y)*r.ty)<=(f.widthKm+cell)/2&&Math.hypot(x-f.x,y-f.y)<r.width/2+cell);
  return !bridge&&!ford;
}
// 中心は従来と同じ座標で渡河判定を済ませる。中心以外は、川が届き得るセルだけ実座標を検査する。
function groundPathRiverTable(d,rivers){
  const {cols,rows}=d.terrain,cell=d.meta.cellKm,table=new Uint8Array(cols*rows);
  const mark=(minX,minY,maxX,maxY)=>{
    const left=Math.max(0,Math.floor(minX/cell)),right=Math.min(cols-1,Math.floor(maxX/cell));
    for(let y=Math.max(0,Math.floor(minY/cell));y<=Math.min(rows-1,Math.floor(maxY/cell));y++){
      if(left<=right)table.fill(1,y*cols+left,y*cols+right+1);
    }
  };
  for(const box of rivers){
    const {points}=box.river,pad=box.pad;
    for(let i=1;i<points.length;i++){
      const [ax,ay]=points[i-1],[bx,by]=points[i];
      mark(Math.min(ax,bx)-pad,Math.min(ay,by)-pad,Math.max(ax,bx)+pad,Math.max(ay,by)+pad);
    }
  }
  for(let i=0;i<table.length;i++)if(table[i]){
    const x=(i%cols+.5)*cell,y=(Math.floor(i/cols)+.5)*cell;
    if(rivers.some(box=>groundPathWithin(x,y,box,box.pad)&&groundPathRiverBlocked(x,y,box.river,d,cell)))table[i]=2;
  }
  return table;
}
function groundPathWithin(x,y,b,pad=0){return x>=b.minX-pad&&x<=b.maxX+pad&&y>=b.minY-pad&&y<=b.maxY+pad;}
/* straight: 道路を速い道として選ばない（進撃の道。ユーザーの指示 2026-11-21「できるだけ最短ルート（直線ルート）」）。
   道路は沼地の遅さを打ち消すだけ（倍率1）。海・池・川・沼地の扱いは同じ。実際に動く速さは、足元の道路で今までどおり上がる */
function groundPath(from,to,kind='vehicle',dryOnly=false,straight=false){
  const roadFactor=straight?1:groundRuleSet().movement.roadFactor;
  const d=groundData(),rules=groundRuleSet(),cell=d.meta.cellKm,cols=d.terrain.cols,rows=d.terrain.rows,xy=p=>[groundMapX(p.x),groundMapY(p.z)],a=xy(from),b=xy(to),index=(x,y)=>Math.floor(y/cell)*cols+Math.floor(x/cell),start=index(...a),end=index(...b);
  if(kind==='air'){
    const length=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.max(1,Math.ceil(length/(cell*GROUND_SCALE/2)));
    for(let i=0;i<=steps;i++)if(!groundPass(a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps,'air'))return null;
    const dest=to.clone();dest.y=from.y;const curve=new THREE.LineCurve3(from.clone(),dest),L=curve.getLength();
    return {curve,points:[from.clone(),dest],atIndex:1,L,s:0,pts:[dest],at:[L]};
  }
  // 所有・部隊位置はコストに関係しない。地形・道路・橋・規則の変更だけで格子を破棄する。
  // セル配列の内容も比較し、同じ配列への地形編集を次の探索で反映する。
  const fingerprint=d.terrain.cells.join('|')+JSON.stringify([d.meta.widthKm,d.meta.heightKm,cell,cols,rows,d.display.board,d.water.sea,d.water.ponds,d.water.rivers,d.objects.roads,d.objects.bridges,d.objects.fords,rules.movement.marsh,rules.movement.river,rules.movement.roadFactor,rules.capture.roadWidthKm]);
  let gridCache=groundPathGrids.get(d);
  if(!gridCache||gridCache.fingerprint!==fingerprint||gridCache.revision!==groundBridgeRevision){
    gridCache={fingerprint,revision:groundBridgeRevision,profiles:new Map(),geometry:null};groundPathGrids.set(d,gridCache);groundRoadGeometry.delete(d);
  }
  const bounds=poly=>{let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const [x,y] of poly){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return {poly,minX,minY,maxX,maxY};};
  if(!gridCache.geometry){
    const board=bounds(d.display.board),sea=bounds(d.water.sea),ponds=d.water.ponds.map(bounds);
    const rivers=d.water.rivers.map(river=>({...bounds(river.points),river,pad:Math.max(...river.widths)/2+.12+1e-10}));
    // 多角形の辺がないセル内では内外は一定。細い水際・盤の縁だけは従来どおり正確に検査。
    for(const box of [board,sea,...ponds]){
      box.boundary=new Set();box.inside=new Int8Array(cols*rows);
      for(let i=0;i<box.poly.length;i++){
        const a=box.poly[i],b=box.poly[(i+1)%box.poly.length];
        for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1])/cell));y<=Math.min(rows-1,Math.floor(Math.max(a[1],b[1])/cell));y++)for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0])/cell));x<=Math.min(cols-1,Math.floor(Math.max(a[0],b[0])/cell));x++)box.boundary.add(y*cols+x);
      }
    }
    gridCache.geometry={board,sea,ponds,rivers,riverTable:null};
  }
  const {board,sea,ponds,rivers}=gridCache.geometry;
  const riverTable=kind!=='sea'||dryOnly?(gridCache.geometry.riverTable??=groundPathRiverTable(d,rivers)):null;
  const inside=(x,y,box)=>{
    if(!groundPathWithin(x,y,box))return false;
    const i=index(x,y);if(box.boundary.has(i)||i<0||i>=cols*rows)return groundInside(x,y,box.poly);
    let value=box.inside[i];if(!value)box.inside[i]=value=groundInside(x,y,box.poly)?1:-1;return value===1;
  };
  const crossingFactor=Math.min(1,rules.movement.river[kind]??0);
  function riverFactor(x,y,centerIndex){
    if(centerIndex!==undefined)return riverTable[centerIndex]===2?crossingFactor:1;
    const col=Math.floor(x/cell),row=Math.floor(y/cell);
    if(col>=0&&col<cols&&row>=0&&row<rows&&!riverTable[row*cols+col])return 1;
    for(const box of rivers)if(groundPathWithin(x,y,box,box.pad)&&groundPathRiverBlocked(x,y,box.river,d,cell))return crossingFactor;
    return 1;
  }
  // A leg needs both passability and speed at the exact same sample. Evaluate
  // water once, retaining the original fine sampling and endpoint checks.
  function waterFactor(x,y,centerIndex){
    if(!inside(x,y,board))return 0;
    const wet=inside(x,y,sea);
    if(kind==='sea')return wet&&(!dryOnly||riverFactor(x,y,centerIndex)===1)?1:0;
    if(wet||ponds.some(p=>inside(x,y,p)))return 0;
    const factor=riverFactor(x,y,centerIndex);
    return dryOnly&&factor!==1?0:factor;
  }
  const pass=(x,y)=>waterFactor(x,y)>0,onRoad=kind==='sea'?null:groundRoadQuery(d),maxFactor=kind==='sea'?1:Math.max(1,roadFactor,...Object.values(rules.movement.marsh),...Object.values(rules.movement.river));
  if(a.some((v,i)=>v<0||v>=[d.meta.widthKm,d.meta.heightKm][i])||b.some((v,i)=>v<0||v>=[d.meta.widthKm,d.meta.heightKm][i])||!pass(...a)||!pass(...b)||start<0||end<0||start>=cols*rows||end>=cols*rows)return null;
  const centers=i=>new THREE.Vector3(groundWorldX((i%cols+.5)*cell),0,groundWorldZ((Math.floor(i/cols)+.5)*cell));
  // コストはセル1辺ぶんの移動時間。端点も検査し、表示と実移動に同じ線を使う。
  const halfWidth=d.meta.widthKm/2,halfHeight=d.meta.heightKm/2,terrainCells=d.terrain.cells,marshSpeed=rules.movement.marsh[kind]??1;
  // 水域・川・盤の縁に触れない道路内の線は等速。サンプルを省ける条件を幾何で証明する。
  function dryRoadLeg(ax,ay,bx,by){
    const minX=Math.min(ax,bx),maxX=Math.max(ax,bx),minY=Math.min(ay,by),maxY=Math.max(ay,by);
    const overlaps=(box,pad=0)=>minX<=box.maxX+pad&&maxX>=box.minX-pad&&minY<=box.maxY+pad&&maxY>=box.minY-pad;
    if(overlaps(sea)||ponds.some(p=>overlaps(p))||rivers.some(r=>overlaps(r,r.pad)))return false;
    for(let y=Math.floor(minY/cell);y<=Math.floor(maxY/cell);y++)for(let x=Math.floor(minX/cell);x<=Math.floor(maxX/cell);x++)if(board.boundary.has(y*cols+x))return false;
    return inside(ax,ay,board)&&inside(bx,by,board);
  }
  function leg(p,q){
    if(kind==='sea'&&!groundSeaLeg(p,q))return Infinity;
    const length=Math.hypot(q.x-p.x,q.z-p.z),n=Math.max(1,Math.ceil(length/(cell*GROUND_SCALE/8)));
    let sum=0;const ax=p.x/GROUND_SCALE+halfWidth,ay=halfHeight-p.z/GROUND_SCALE,dx=(q.x-p.x)/GROUND_SCALE,dy=-(q.z-p.z)/GROUND_SCALE;
    if(kind!=='sea'&&onRoad.coversLeg(ax,ay,ax+dx,ay+dy)&&dryRoadLeg(ax,ay,ax+dx,ay+dy))return length/(cell*GROUND_SCALE*roadFactor);
    for(let k=0;k<=n;k++){
      const t=k/n,gx=ax+dx*t,gy=ay+dy*t,water=waterFactor(gx,gy);
      if(water<=0)return Infinity;
      const marsh=kind!=='sea'&&terrainCells[Math.floor(gy/cell)*cols+Math.floor(gx/cell)]==='沼地'?marshSpeed:1;
      const factor=(kind!=='sea'&&onRoad(gx,gy)?roadFactor:marsh)*water;if(factor<=0)return Infinity;
      sum+=(k===0||k===n?.5:1)/factor;
    }
    return length/(cell*GROUND_SCALE)*sum/n;
  }
  // 全区間が最大速度なら直線はコスト下限そのもの。巨大な盤でもA*を起動しない。
  // legは細い川・浅瀬・橋・沼地も従来と同じ間隔で検査し、減速や遮断があれば通常探索へ戻る。
  const direct=leg(from,to),lower=Math.hypot(to.x-from.x,to.z-from.z)/(cell*GROUND_SCALE*maxFactor);
  if(Number.isFinite(direct)&&Math.abs(direct-lower)<=1e-9*Math.max(1,lower)){
    const endPoint=to.clone();endPoint.y=groundHeight(endPoint.x,endPoint.z);const points=[from.clone(),endPoint],curve=new THREE.LineCurve3(points[0],points[1]),L=curve.getLength();
    return {cost:direct,curve,points,atIndex:1,L,s:0,pts:[endPoint.clone()],at:[L]};
  }
  const dist=new Float64Array(cols*rows).fill(Infinity),prev=new Int32Array(cols*rows).fill(-1),heap=[];
  const profileKey=JSON.stringify([kind==='sea',dryOnly,rules.movement.marsh[kind]??1,rules.movement.river[kind]??0,straight]);
  let profile=gridCache.profiles.get(profileKey);
  if(!profile){profile={edgeCosts:new Float64Array(cols*rows*4).fill(NaN),centerWater:new Float64Array(cols*rows).fill(NaN),centers:new Map()};gridCache.profiles.set(profileKey,profile);}
  const {edgeCosts,centerWater}=profile;
  const centerPass=(x,y)=>{const i=y*cols+x;let value=centerWater[i];if(Number.isNaN(value))centerWater[i]=value=waterFactor((x+.5)*cell,(y+.5)*cell,i);return value>0;};
  const centerCache=profile.centers,center=i=>{if(!centerCache.has(i))centerCache.set(i,centers(i));return centerCache.get(i);};
  // 最大速度で割った距離を下限にし、道路のある盤でも過大評価しない。
  function push(i,v){const priority=v+Math.hypot(i%cols-end%cols,Math.floor(i/cols)-Math.floor(end/cols))/maxFactor;let k=heap.length;heap.push([i,v,priority]);while(k){let p=(k-1)>>1;if(heap[p][2]<=priority)break;heap[k]=heap[p];k=p;}heap[k]=[i,v,priority];}
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
      if(dx&&dy&&(!centerPass(x+dx,y)||!centerPass(x,y+dy)))continue;
      const j=yy*cols+xx,key=Math.min(i,j)*4+(dy===0?0:dx===0?1:dx*dy>0?2:3);
      let edge=edgeCosts[key];if(Number.isNaN(edge))edgeCosts[key]=edge=leg(p,center(j));
      const n=cost+edge;
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
  function polyline(list){
    const points=[list[0]];
    for(let i=1;i<list.length;i++){
      const p=list[i-1],q=list[i],n=Math.max(1,Math.ceil(p.distanceTo(q)/(cell*GROUND_SCALE/2)));
      for(let k=1;k<=n;k++){const v=p.clone().lerp(q,k/n);v.y=kind==='sea'?0:groundHeight(v.x,v.z);points.push(v);}
    }
    if(points.length===1)points.push(points[0].clone());
    let cost=0;for(let i=1;i<points.length;i++)cost+=leg(points[i-1],points[i]);
    return {points,cost};
  }
  /* 検査点の位置は区切り方で変わる。角丸・近道のあとに区切り直すと、橋の端の角などで水へかかる区間が出ることがある。
     その線は渡さず、角丸なし → 格子のままの順に戻す（2026-11-14、戦車が工兵の橋の脇で止まる不具合） */
  let line=polyline(rounded);
  for(const list of [simple,raw]){if(Number.isFinite(line.cost))break;const other=polyline(list);if(Number.isFinite(other.cost))line=other;}
  const {points,cost}=line,curve=new THREE.CurvePath();
  for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(points[i-1],points[i]));
  const L=curve.getLength();
  // 近道・角丸で橋への迂回時間も縮む。格子上では渡河が速かった場合も、
  // 同じ兵科で橋・浅瀬だけを使う候補を整形し、最終的な移動時間で比べる。
  if(!dryOnly&&kind!=='sea'&&rules.movement.river[kind]>0&&points.some(p=>riverFactor(groundMapX(p.x),groundMapY(p.z))<1)){
    const detour=groundPath(from,to,kind,true,straight);
    if(detour&&detour.cost<cost)return detour;
  }
  return {bridgeRevision:groundBridgeRevision,cost,curve,points,atIndex:1,L,s:0,pts:[points[points.length-1]],at:[L]};
}
// 地形の迂回点とユーザーの経由地を分け、矢印と実移動には同じ経路を使う。straight は groundPath と同じ（橋が変わって引き直すときも保つ）
function groundMovePath(from,waypoints,kind,straight=false){
  const points=[from.clone()],pts=[],at=[],curve=new THREE.CurvePath();let cost=0,length=0;
  for(const dest of waypoints){
    const leg=groundPath(points[points.length-1],dest,kind,false,straight);if(!leg)return null;
    for(const p of leg.points.slice(1)){
      const prev=points[points.length-1];length+=Math.hypot(p.x-prev.x,p.z-prev.z);
      curve.add(new THREE.LineCurve3(prev,p));points.push(p);
    }
    pts.push(points[points.length-1].clone());at.push(length);cost+=leg.cost||0;
  }
  return {bridgeRevision:groundBridgeRevision,cost,curve,points,atIndex:1,L:curve.getLength(),s:0,pts,at,...(straight?{straight}:{})};
}
/* 進撃（共有命令の実行）の組は、まだ進撃中の生きている地上の隊のうち、いちばん遅い隊の今の速さで進む（ユーザー決定 2026-11-14）。
   航空は数えない。地形・道路の速さの倍率は各隊の足元で今までどおり掛かる */
function groundAdvanceSpeed(f){
  const g=f.order?.groundAdvance,own=speedOf(f);if(!g?.units)return own;
  let slowest=own;for(const u of g.units)if(u!==f&&u.alive&&u.order?.groundAdvance===g&&groundMoveKind(u)!=='air')slowest=Math.min(slowest,speedOf(u));
  return slowest;
}
function groundFollow(f,dt){let p=f.order.path;if(p&&p.bridgeRevision!==undefined&&groundMoveKind(f)!=='air'&&p.bridgeRevision!==groundBridgeRevision){if(p.blockedRevision===groundBridgeRevision)return false;const remaining=p.pts.filter((_,i)=>p.at[i]>p.s+1e-8);const updated=groundMovePath(f.pos,remaining.length?remaining:[p.points[p.points.length-1]],groundMoveKind(f),p.straight);if(!updated){p.blockedRevision=groundBridgeRevision;return false;}f.order.path=updated;p=updated;}if(!p)return true;let remaining=groundAdvanceSpeed(f)*dt;const kind=groundMoveKind(f),gap=groundData().meta.cellKm*GROUND_SCALE/4;while(remaining>0&&p.atIndex<p.points.length){const target=p.points[p.atIndex],dx=target.x-f.pos.x,dz=target.z-f.pos.z,dist=Math.hypot(dx,dz);let factor=groundFactor(f.pos.x,f.pos.z,kind);
    /* 経路は検査点（セルの1/8ごと）で確かめるので、検査点のあいだに細い水際が残ることがある（橋の端の角など）。
       そこで止まったままにしない: 今いる所が通れなければ次の点の速さで抜け、進んだ先が細い水際なら、その先の通れる所まで（検査点の間隔の2倍まで）進める。
       それより広い水は今までどおり手前で止まる（2026-11-14、戦車が橋の上で止まる不具合） */
    if(factor<=0&&kind!=='sea')factor=groundFactor(target.x,target.z,kind);
    if(factor<=0)return false;
    let amount=Math.min(dist,remaining*factor);
    if(kind!=='sea'&&dist>1e-8&&amount<dist){const wet=a=>groundFactor(f.pos.x+dx/dist*a,f.pos.z+dz/dist*a,kind)<=0;
      if(wet(amount)){let through=amount;while(through<dist&&through<amount+gap&&wet(through))through=Math.min(dist,through+gap/8);
        if(!wet(through))amount=through;else{let back=amount;while(back>0&&wet(back))back=Math.max(0,back-gap/8);amount=back;if(amount<=1e-8)return false;}}}
    if(kind==='sea'&&dist>1e-8&&!groundSeaLeg(f.pos,new THREE.Vector3(f.pos.x+dx/dist*amount,0,f.pos.z+dz/dist*amount)))return false;if(dist>1e-8){const before=f.pos.clone();f.pos.x+=dx/dist*amount;f.pos.z+=dz/dist*amount;f.heading.set(dx/dist,0,dz/dist);f.march.copy(f.heading);groundSupplyMoved(f,before,f.pos);}f.pos.y=groundUnitHeight(f);remaining-=amount/factor;p.s+=amount;if(dist-amount<1e-6)p.atIndex++;else break;}return p.atIndex>=p.points.length;}
