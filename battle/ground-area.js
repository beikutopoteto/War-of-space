/* 地上作戦だけの範囲砲撃。着弾中心の散布範囲と、各弾の爆風半径を分ける。 */
let groundAreaAim=null,groundSalvoCount=1,groundAreaSerial=0,groundAreaVisuals=new Map();
const groundSalvoInput=document.getElementById('groundSalvoCount');
function groundAreaCount(){return Math.max(1,Math.min(30,Math.floor(Number(groundSalvoInput?.value||groundSalvoCount)||1)));}
groundSalvoInput?.addEventListener('change',()=>{groundSalvoCount=groundAreaCount();groundSalvoInput.value=groundSalvoCount;groundHud();});
groundSalvoInput?.addEventListener('keydown',e=>{if(e.code==='Escape'){e.stopPropagation();groundClearAiming();groundHud();groundSalvoInput.blur();}});
function groundAreaCancelInput(){groundAreaAim=null;}
function groundAreaReset(){
 groundAreaAim=null;groundSalvoCount=1;if(groundSalvoInput)groundSalvoInput.value=1;
 for(const v of groundAreaVisuals.values()){groundAreaDropVisual(v);}groundAreaVisuals.clear();
 if(Array.isArray(fleets))fleets.forEach(f=>f.groundAreaSalvo=null);
}
function groundAreaUnits(list=orderTargets()){return list.filter(f=>groundStrikeWeapon(f));}
function groundAreaLimits(units){
 const radii=units.map(f=>groundStrikeWeapon(f).areaRadius??groundStrikeWeapon(f).radius);
 return {radius:Math.min(...radii),length:units.reduce((n,f,i)=>n+2*radii[i]*Math.max(1,f.ships?.length??f.n??1),0)};
}
// 曲線帯も含め、参加射手と帯の遠端から必要な精度下限を求める。
function groundAreaClampRadius(units,points,wanted){
 const cap=groundAreaLimits(units).radius;let radius=Math.max(0,Math.min(cap,wanted)),minimum=0;
 for(let i=0;i<12;i++){
  minimum=groundAreaRequiredRadius(units,points,radius);
  if(minimum>cap+1e-7)return {radius:cap,minimum,valid:false};
  if(minimum<=radius+1e-8)return {radius,minimum,valid:true};radius=minimum;
 }
 return {radius,minimum,valid:minimum<=radius+1e-6};
}
function groundAreaDiameterText(radius){const meters=radius/GROUND_SCALE*2000;return meters<1000?Number(meters.toFixed(1))+'m':(meters/1000).toFixed(2)+'km';}
function groundAreaCurve(points){
 if(points.length<2||points.every(p=>Math.hypot(p.x-points[0].x,p.z-points[0].z)<1e-8))return {points:[points[0].clone()],length:0};
 const flat=points.map(p=>new THREE.Vector3(p.x,0,p.z)),curve=flat.length===2?new THREE.LineCurve3(...flat):new THREE.CatmullRomCurve3(flat,false,'centripetal');
 const sampled=curve.getPoints(Math.max(16,points.length*12));let length=0;for(let i=1;i<sampled.length;i++)length+=sampled[i].distanceTo(sampled[i-1]);return {points:sampled,length};
}
function groundAreaClosest(area,p){
 let best=area.points[0].clone(),distance=Infinity;
 if(area.points.length===1)return {point:best,distance:Math.hypot(p.x-best.x,p.z-best.z)};
 for(let i=1;i<area.points.length;i++){const a=area.points[i-1],b=area.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1))),q=new THREE.Vector3(a.x+t*dx,0,a.z+t*dz),d=Math.hypot(p.x-q.x,p.z-q.z);if(d<distance){best=q;distance=d;}}
 return {point:best,distance};
}
function groundAreaShape(points,radius,id){const curve=groundAreaCurve(points);return {...curve,radius,id,key:JSON.stringify([curve.points,radius])};}
function groundAreaEnd(state,p){
 const max=groundAreaLimits(groundAreaUnits(state.units)).length;let next=p.clone();
 if(groundAreaCurve([...state.points,next]).length<=max)return next;
 const last=state.points[state.points.length-1];let lo=0,hi=1;for(let i=0;i<18;i++){const t=(lo+hi)/2,q=last.clone().lerp(p,t);if(groundAreaCurve([...state.points,q]).length<=max)lo=t;else hi=t;}return last.clone().lerp(p,lo);
}
function groundAreaStart(){
 const units=groundAreaUnits();if(!units.length)return;
 groundAreaAim={units,type:units.some(f=>f.groundKind==='sea')||units.length>1?'line':'circle',points:[],stage:'start',preview:null};
}
function groundAreaHover(p){
 const s=groundAreaAim;if(!s||!p||!s.points.length)return;
 const units=groundAreaUnits(s.units);if(!units.length)return;const cap=groundAreaLimits(units);
 if(s.stage==='end')s.preview=groundAreaShape([...s.points,groundAreaEnd(s,p)],0,'aim');
 else{const curve=groundAreaShape(s.points,0,'aim'),r=Math.min(cap.radius,groundAreaClosest(curve,p).distance),limit=groundAreaClampRadius(units,curve.points,r);s.preview={...groundAreaShape(s.points,limit.radius,'aim'),minRadius:limit.minimum,valid:limit.valid};}
}
function groundAreaSample(area){
 const r=area.radius,points=area.points;
 if(points.length===1||area.length<1e-8){const a=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*r;return points[0].clone().add(new THREE.Vector3(Math.cos(a)*d,0,Math.sin(a)*d));}
 // 円柱の両端も含め、中心線の帯と半円を面積比で選ぶ。
 if(r>0&&Math.random()*(area.length*2*r+Math.PI*r*r)>area.length*2*r){
  const first=Math.random()<.5,a=first?points[0]:points[points.length-1],b=first?points[1]:points[points.length-2],angle=Math.atan2(a.z-b.z,a.x-b.x)+(Math.random()-.5)*Math.PI,d=Math.sqrt(Math.random())*r;
  return a.clone().add(new THREE.Vector3(Math.cos(angle)*d,0,Math.sin(angle)*d));
 }
 let at=Math.random()*area.length;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=a.distanceTo(b);if(at<=len||i===points.length-1){const p=a.clone().lerp(b,len?at/len:0),offset=(Math.random()*2-1)*r;p.x+=-(b.z-a.z)/(len||1)*offset;p.z+=(b.x-a.x)/(len||1)*offset;return p;}at-=len;}
}
function groundAreaShot(f,area){
 const minimum=groundAreaRequiredRadius([f],area.points,area.radius);
 if(minimum>area.radius+1e-6)return null;
 // 内側の帯で狙点を選んでから最小散布円を足す。射程境界で散布円を切り詰めない。
 const inner={...area,radius:Math.max(0,area.radius-minimum)};
 for(let i=0;i<48;i++){
  const aim=groundAreaSample(inner);if(!groundStrikeInRange(f,aim))continue;
  const impact=aim.clone().add(groundScatterOffset(minimum));aim.y=groundHeight(aim.x,aim.z);impact.y=groundHeight(impact.x,impact.z);return {aim,impact};
 }
 const near=groundAreaClosest(inner,f.pos),aim=near.point.clone();if(near.distance>0)aim.add(new THREE.Vector3(f.pos.x-aim.x,0,f.pos.z-aim.z).multiplyScalar(Math.min(near.distance,inner.radius)/near.distance));
 if(groundStrikeInRange(f,aim)){const impact=aim.clone().add(groundScatterOffset(minimum));aim.y=groundHeight(aim.x,aim.z);impact.y=groundHeight(impact.x,impact.z);return {aim,impact};}
 return null;
}
function groundAreaTarget(f,area){return groundAreaShot(f,area)?.aim||null;}
function groundAreaConfirm(area){
 const units=groundAreaUnits(groundAreaAim.units);if(!units.length)return false;
 const limit=groundAreaClampRadius(units,area.points,area.radius);if(!limit.valid){groundStrikeMessage='距離に必要な最小散布幅が指定上限を超えます';return false;}area.radius=limit.radius;area.minRadius=limit.minimum;area.key=JSON.stringify([area.points,area.radius]);
 const cap=groundAreaLimits(units);if(area.length>cap.length+1e-5){groundStrikeMessage='参加台数が減ったため中心線が長すぎます（Escで再指定）';return false;}
 for(const f of units)if(!groundAreaTarget(f,area)){groundStrikeMessage=f.name+'：指定範囲は射程外または攻撃不可（Escで再指定）';return false;}
 area.id=++groundAreaSerial;area.sent=new Map();const count=groundAreaCount();saveUndo(units);
 for(const f of units){groundCancelWork(f);groundClearOrders(f);f.groundAreaSalvo={area,remaining:count,total:count};}
 groundClearAiming();groundStrikeMessage=units.length+'隊に各'+count+'回の砲撃を指示';groundAreaSalvoStep();groundHud();return true;
}
function groundAreaTap(p,shift=false){
 const s=groundAreaAim;if(!s)return false;
 if(s.stage==='start'){s.points=[p.clone()];s.stage=s.type==='circle'?'radius':'end';groundAreaHover(p);groundStrikeMessage='';groundHud();return true;}
 if(s.stage==='end'){s.points.push(groundAreaEnd(s,p));if(!shift)s.stage='width';groundAreaHover(p);groundStrikeMessage='';groundHud();return true;}
 groundAreaHover(p);groundAreaConfirm(s.preview);groundHud();return true;
}
function groundAreaSalvoStep(){
 for(const f of fleets){const salvo=f.groundAreaSalvo;if(!salvo)continue;
  if(!groundStrikeWeapon(f)){f.groundAreaSalvo=null;continue;}if((f.groundStrikeCooldown||0)>1e-8)continue;
  const shot=groundAreaShot(f,salvo.area);if(!shot){f.groundAreaSalvo=null;groundStrikeMessage=f.name+'：射撃可能な地点がなくなったため中止';continue;}
  if(groundStrikeLaunch(f,shot.aim,shot.impact,salvo.area)){salvo.area.sent.set(f,(salvo.area.sent.get(f)||0)+1);salvo.remaining--;if(f.groundKind==='vehicle')f.groundShotT=Math.max(f.groundShotT||0,groundStrikeWeapon(f).reload);if(salvo.remaining<=0)f.groundAreaSalvo=null;}
 }
}
function groundAreaHint(){
 const s=groundAreaAim;if(!s)return '';
 const phase=s.stage==='start'?'中心または始点':s.stage==='radius'?'半径':s.stage==='end'?'終点（Shiftで中間点）':'幅';
 return (s.type==='circle'?'円形':'線状')+(s.units.every(f=>f.groundKind==='vehicle')?'直射範囲：':'砲撃：')+phase+'をクリック / 各'+groundAreaCount()+'回（Escで取消）'+(groundStrikeMessage?' / '+groundStrikeMessage:'');
}
// 線の周りの最短距離から輪郭を取る。強く曲がった帯も自己交差させない。
function groundAreaOutline(area){
 const pts=area.points,r=area.radius,out=[];
 if(r<1e-5){if(pts.length>1){for(let i=1;i<pts.length;i++)out.push(pts[i-1].clone(),pts[i].clone());}else for(const [dx,dz] of [[.3,0],[0,.3]])out.push(pts[0].clone().add(new THREE.Vector3(-dx,0,-dz)),pts[0].clone().add(new THREE.Vector3(dx,0,dz)));return out;}
 if(pts.length===1){for(let i=0;i<96;i++)for(const t of [i/96,(i+1)/96])out.push(pts[0].clone().add(new THREE.Vector3(Math.cos(t*Math.PI*2)*r,0,Math.sin(t*Math.PI*2)*r)));return out;}
 const n=64,x0=Math.min(...pts.map(p=>p.x))-r*1.05,z0=Math.min(...pts.map(p=>p.z))-r*1.05,
  width=Math.max(...pts.map(p=>p.x))+r*1.05-x0,height=Math.max(...pts.map(p=>p.z))+r*1.05-z0,dx=width/n,dz=height/n;
 const segments=pts.slice(1).map((b,i)=>{const a=pts[i],x=b.x-a.x,z=b.z-a.z;return {a,x,z,len:x*x+z*z||1};});
 const values=new Float64Array((n+1)*(n+1));
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){const px=x0+x*dx,pz=z0+y*dz;let best=Infinity;
  for(const s of segments){const t=Math.max(0,Math.min(1,((px-s.a.x)*s.x+(pz-s.a.z)*s.z)/s.len)),a=px-s.a.x-t*s.x,b=pz-s.a.z-t*s.z;best=Math.min(best,a*a+b*b);}
  values[y*(n+1)+x]=best-r*r;
 }
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const indices=[y*(n+1)+x,y*(n+1)+x+1,(y+1)*(n+1)+x+1,(y+1)*(n+1)+x],corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],hits=[];
  for(let i=0;i<4;i++){const j=(i+1)%4,a=values[indices[i]],b=values[indices[j]];if((a<0)===(b<0))continue;const t=a/(a-b);hits.push(new THREE.Vector3(x0+(corners[i][0]+(corners[j][0]-corners[i][0])*t)*dx,0,z0+(corners[i][1]+(corners[j][1]-corners[i][1])*t)*dz));}
  if(hits.length===2||hits.length===4)out.push(...hits);
 }
 return out;
}
function groundAreaDraw(){
 if(!groundVisuals)return;const live=new Map();if(groundAreaAim?.preview)live.set('aim',groundAreaAim.preview);
 for(const f of fleets)if(f.team===0&&f.groundAreaSalvo)live.set(f.groundAreaSalvo.area.id,f.groundAreaSalvo.area);
 for(const s of groundStrikes)if(s.team===0&&s.area)live.set(s.area.id,s.area);
 for(const [id,area] of live){let v=groundAreaVisuals.get(id);if(!v){const line=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x8bdfff,transparent:true,opacity:.9,depthWrite:false}));line.renderOrder=6;groundVisuals.add(line);const el=document.createElement('div');el.className='ground-strike-label';el.style.color='#8bdfff';labelsEl.appendChild(el);const axis=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xe2c58a,transparent:true,opacity:.75,depthWrite:false,dashSize:.7,gapSize:.4}));axis.renderOrder=6;groundVisuals.add(axis);v={line,el,axis};groundAreaVisuals.set(id,v);}
  if(v.key!==area.key){const points=groundAreaOutline(area);points.forEach(p=>p.y=groundSurfaceHeight(p.x,p.z)+.4);v.line.geometry.dispose();v.line.geometry=new THREE.BufferGeometry().setFromPoints(points);v.axis.visible=area.points.length>1;if(v.axis.visible){const axisPoints=area.points.map(p=>new THREE.Vector3(p.x,groundSurfaceHeight(p.x,p.z)+.42,p.z));v.axis.geometry.dispose();v.axis.geometry=new THREE.BufferGeometry().setFromPoints(axisPoints);v.axis.computeLineDistances();}v.key=area.key;}
  const p=proj(area.points[Math.floor(area.points.length/2)].clone().add(new THREE.Vector3(0,1,0)));v.el.hidden=p.z>1;v.el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
  const remaining=id==='aim'?groundAreaCount():Math.max(0,...fleets.filter(f=>f.groundAreaSalvo?.area===area).map(f=>f.groundAreaSalvo.remaining));
  v.el.textContent='散布直径'+groundAreaDiameterText(area.radius)+' / '+(id==='aim'?'各'+remaining+'回':remaining?'残り最大'+remaining+'回':'最終弾着弾待ち');
 }
 for(const [id,v] of groundAreaVisuals)if(!live.has(id)){groundAreaDropVisual(v);groundAreaVisuals.delete(id);}
}

function groundAreaDropVisual(v){for(const line of [v.line,v.axis])if(line){line.parent?.remove(line);line.geometry.dispose();line.material.dispose();}v.el.remove();}

// 戻すでも発射済みの回数を復活させない。未発射分だけを復元する。
function groundRestoreSalvo(f,saved){if(!saved)return null;const remaining=saved.area.sent?Math.max(0,saved.total-(saved.area.sent.get(f)||0)):saved.remaining;return remaining?{...saved,remaining}:null;}
