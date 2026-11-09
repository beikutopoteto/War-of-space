/* 地上作戦だけの範囲砲撃。着弾中心の散布範囲と、各弾の爆風半径を分ける。 */
let groundAreaAim=null,groundSalvoCount=1,groundAreaSerial=0,groundAreaVisuals=new Map();
const groundSalvoInput=document.getElementById('groundSalvoCount');
function groundAreaCount(){return Math.max(1,Math.min(30,Math.floor(Number(groundSalvoInput?.value||groundSalvoCount)||1)));}
groundSalvoInput?.addEventListener('change',()=>{groundSalvoCount=groundAreaCount();groundSalvoInput.value=groundSalvoCount;groundHud();});
groundSalvoInput?.addEventListener('keydown',e=>{if(e.code==='Escape'){e.stopPropagation();groundClearAiming();groundHud();groundSalvoInput.blur();}});
function groundAreaCancelInput(){groundAreaAim=null;}
function groundAreaReset(){
 groundAreaAim=null;groundSalvoCount=1;if(groundSalvoInput)groundSalvoInput.value=1;
 for(const v of groundAreaVisuals.values()){v.line.parent?.remove(v.line);v.line.geometry.dispose();v.line.material.dispose();v.el.remove();}groundAreaVisuals.clear();
 if(Array.isArray(fleets))fleets.forEach(f=>f.groundAreaSalvo=null);
}
function groundAreaUnits(list=orderTargets()){return list.filter(f=>groundStrikeWeapon(f));}
function groundAreaLimits(units){
 const radii=units.map(f=>groundStrikeWeapon(f).areaRadius??groundStrikeWeapon(f).radius);
 return {radius:Math.min(...radii),length:units.reduce((n,f,i)=>n+2*radii[i]*Math.max(1,f.ships?.length??f.n??1),0)};
}
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
 else{const curve=groundAreaShape(s.points,0,'aim'),r=Math.min(cap.radius,groundAreaClosest(curve,p).distance);s.preview=groundAreaShape(s.points,r,'aim');}
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
function groundAreaTarget(f,area){
 for(let i=0;i<48;i++){const p=groundAreaSample(area);if(groundStrikeInRange(f,p)){p.y=groundHeight(p.x,p.z);return p;}}
 const near=groundAreaClosest(area,f.pos),p=near.point.clone();if(near.distance>0)p.add(new THREE.Vector3(f.pos.x-p.x,0,f.pos.z-p.z).multiplyScalar(Math.min(near.distance,area.radius)/near.distance));
 if(groundStrikeInRange(f,p)){p.y=groundHeight(p.x,p.z);return p;}return null;
}
function groundAreaConfirm(area){
 const units=groundAreaUnits(groundAreaAim.units);if(!units.length)return false;
 const cap=groundAreaLimits(units);if(area.length>cap.length+1e-5){groundStrikeMessage='参加台数が減ったため中心線が長すぎます（Escで再指定）';return false;}
 for(const f of units)if(!groundAreaTarget(f,area)){groundStrikeMessage=f.name+'：指定範囲は射程外または攻撃不可（Escで再指定）';return false;}
 area.id=++groundAreaSerial;const count=groundAreaCount();
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
  const p=groundAreaTarget(f,salvo.area);if(!p){f.groundAreaSalvo=null;groundStrikeMessage=f.name+'：射撃可能な地点がなくなったため中止';continue;}
  if(groundStrikeLaunch(f,p,p)){salvo.remaining--;if(f.groundKind==='vehicle')f.groundShotT=Math.max(f.groundShotT||0,groundStrikeWeapon(f).reload);if(salvo.remaining<=0)f.groundAreaSalvo=null;}
 }
}
function groundAreaHint(){
 const s=groundAreaAim;if(!s)return '';
 const phase=s.stage==='start'?'中心または始点':s.stage==='radius'?'半径':s.stage==='end'?'終点（Shiftで中間点）':'幅';
 return (s.type==='circle'?'円形':'線状')+'砲撃：'+phase+'をクリック / 各'+groundAreaCount()+'回（Escで取消）'+(groundStrikeMessage?' / '+groundStrikeMessage:'');
}
function groundAreaOutline(area){
 const pts=area.points,r=area.radius;
 if(pts.length===1){return Array.from({length:97},(_,i)=>pts[0].clone().add(new THREE.Vector3(Math.cos(i/96*Math.PI*2)*r,0,Math.sin(i/96*Math.PI*2)*r)));}
 const left=[],right=[];
 for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;left.push(pts[i].clone().add(new THREE.Vector3(-dz/len*r,0,dx/len*r)));right.push(pts[i].clone().add(new THREE.Vector3(dz/len*r,0,-dx/len*r)));}
 const arc=(at,angle)=>Array.from({length:17},(_,i)=>at.clone().add(new THREE.Vector3(Math.cos(angle-i/16*Math.PI)*r,0,Math.sin(angle-i/16*Math.PI)*r)));
 const a=pts[0],b=pts[1],z=pts[pts.length-1],y=pts[pts.length-2];
 return [...left,...arc(z,Math.atan2(z.z-y.z,z.x-y.x)+Math.PI/2),...right.reverse(),...arc(a,Math.atan2(b.z-a.z,b.x-a.x)-Math.PI/2)];
}
function groundAreaDraw(){
 if(!groundVisuals)return;const live=new Map();if(groundAreaAim?.preview)live.set('aim',groundAreaAim.preview);
 for(const f of fleets)if(f.team===0&&f.groundAreaSalvo)live.set(f.groundAreaSalvo.area.id,f.groundAreaSalvo.area);
 for(const [id,area] of live){let v=groundAreaVisuals.get(id);if(!v){const line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x8bdfff,transparent:true,opacity:.9,depthWrite:false}));line.renderOrder=6;groundVisuals.add(line);const el=document.createElement('div');el.className='ground-strike-label';el.style.color='#8bdfff';labelsEl.appendChild(el);v={line,el};groundAreaVisuals.set(id,v);}
  if(v.key!==area.key){const points=groundAreaOutline(area);points.forEach(p=>p.y=groundSurfaceHeight(p.x,p.z)+.4);v.line.geometry.dispose();v.line.geometry=new THREE.BufferGeometry().setFromPoints(points);v.key=area.key;}
  const p=proj(area.points[Math.floor(area.points.length/2)].clone().add(new THREE.Vector3(0,1,0)));v.el.hidden=p.z>1;v.el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
  const remaining=id==='aim'?groundAreaCount():Math.max(0,...fleets.filter(f=>f.groundAreaSalvo?.area===area).map(f=>f.groundAreaSalvo.remaining));
  v.el.textContent='散布範囲 半径'+(area.radius/GROUND_SCALE).toFixed(1)+'km / '+(id==='aim'?'各':'残り最大')+remaining+'回';
 }
 for(const [id,v] of groundAreaVisuals)if(!live.has(id)){v.line.parent?.remove(v.line);v.line.geometry.dispose();v.line.material.dispose();v.el.remove();groundAreaVisuals.delete(id);}
}
