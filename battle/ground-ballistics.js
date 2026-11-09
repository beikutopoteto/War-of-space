/* 地上専用の弾道。通常scriptとして読み込み、依存するglobalsは呼出し時だけ読む。
   全て仮設定。敵・視界・命令・散布・groundStrikeInRangeは読まない（再帰を避ける）。 */
const GROUND_BALLISTIC_PROFILE=Object.freeze({gravity:9.81,physicalSecondsPerGameSecond:10,
  muzzleHeightM:2,preferredAngle:Math.PI/4,maxMuzzle:900,rocketMaxMuzzle:1000,directSpeed:1500});
let groundBallisticCache=new WeakMap(),groundBallisticBuildingIndex=null;
function groundBallisticReset(){groundBallisticCache=new WeakMap();groundBallisticBuildingIndex=null;}
function groundBallisticFinite(p){return !!p&&[p.x,p.y,p.z].every(Number.isFinite);}
function groundBallisticFail(reason){return {clear:false,reason,origin:null,target:null,impact:null,duration:0,physicalDuration:0,velocityMeters:null,collision:null};}
// 非誘導の落下予測。入力・出力はm、時間は物理秒。段階7の投下位置ソルバーは別。
function groundFreeFall(originMeters,velocityMeters,physicalSeconds){
  if(!groundBallisticFinite(originMeters)||!groundBallisticFinite(velocityMeters)||!Number.isFinite(physicalSeconds)||physicalSeconds<0)return null;
  return new THREE.Vector3(originMeters.x+velocityMeters.x*physicalSeconds,
    originMeters.y+velocityMeters.y*physicalSeconds-GROUND_BALLISTIC_PROFILE.gravity*physicalSeconds*physicalSeconds/2,
    originMeters.z+velocityMeters.z*physicalSeconds);
}
function groundBallisticScene(){
  if(typeof op==='undefined'||!op.ground||typeof WOS_TERRAIN==='undefined'||typeof groundSightHeight!=='function')return null;
  const data=WOS_TERRAIN[op.ground],scale=typeof GROUND_SCALE==='number'?GROUND_SCALE:NaN,e=data?.meta?.elevationExaggeration;
  if(!data||!(scale>0)||!Number.isFinite(scale)||!(e>0)||!Number.isFinite(e))return null;
  return {data,scale,e,m:1000/scale,height:groundSightHeight,buildings:typeof groundBuildings==='undefined'?[]:groundBuildings,
    terrain:data.terrain,heightSpec:data.height,cells:data.terrain?.cells,heights:typeof groundSightHeights==='undefined'?null:groundSightHeights,
    board:typeof groundBoard==='undefined'?null:groundBoard,
    analyticHeight:typeof groundHeight==='function'?groundHeight:null};
}
function groundBallisticTerrain(scene,x,z){return scene.height(x,z)*scene.m/scene.e;}
// 仮の描画規約: 地表だけ既存の誇張。地表からのクリアランス・航空高度は誇張しない。
// worldY = terrainDisplay + (physicalY - terrainMeters) * GROUND_SCALE / 1000。
function groundBallisticWorld(scene,p){
  const x=p.x/scene.m,z=p.z/scene.m,h=scene.height(x,z);
  return new THREE.Vector3(x,h+(p.y-h*scene.m/scene.e)/scene.m,z);
}
function groundBallisticAt(solution,elapsedGameSec){
  if(!solution?.originMeters||!Number.isFinite(elapsedGameSec))return null;
  const end=solution.hitTime??solution.duration,t=Math.max(0,Math.min(end,elapsedGameSec));
  if(t===0)return solution.origin.clone();
  if(t>=end)return solution.impact.clone();
  const u=solution.duration>0?t/solution.duration:1;
  if(solution.mode!=='indirect')return solution.origin.clone().lerp(solution.target,u);
  const tau=t*solution.timeScale,p=groundFreeFall(solution.originMeters,solution.velocityMeters,tau);
  return groundBallisticWorld(solution.scene,p);
}
// 安定な二次方程式。正規化した飛翔時間uで使用する。
function groundBallisticRoots(a,b,c){
  if(Math.abs(a)<1e-12)return Math.abs(b)<1e-12?[]:[-c/b];
  let d=b*b-4*a*c;if(d< -1e-9)return [];d=Math.sqrt(Math.max(0,d));
  const q=-.5*(b+(b<0?-d:d));
  return q===0?[-b/(2*a)]:[q/a,c/q];
}
// 二次の高さが[min,max]へ入る最初のu。境界を全て分割するため薄い箱も抜けない。
function groundBallisticBand(a,b,c,lo,hi,min,max){
  const cuts=[lo,hi,...groundBallisticRoots(a,b,c-min),...(Number.isFinite(max)?groundBallisticRoots(a,b,c-max):[])];
  const sorted=cuts.filter(u=>Number.isFinite(u)&&u>=lo&&u<=hi).sort((x,y)=>x-y);
  const inside=u=>{const h=(a*u+b)*u+c;return h>=min-1e-7&&h<=max+1e-7;};
  for(let i=0;i<sorted.length;i++){
    const u=sorted[i];if(inside(u))return u;
    if(i+1<sorted.length&&inside((u+sorted[i+1])/2))return u;
  }
  return null;
}
// 水平slab。接線方向や幅の非常に小さい建物も連続時間で扱う。
function groundBallisticSlab(start,delta,min,max,interval){
  if(Math.abs(delta)<1e-12)return start>=min&&start<=max;
  let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];
  interval[0]=Math.max(interval[0],a);interval[1]=Math.min(interval[1],b);return interval[0]<=interval[1];
}
// 格子線を横切る全てのu。現在のgroundSightHeightと同じ1戦闘単位三角形。
function groundBallisticGridCuts(x,z,dx,dz,size=1){
  const cuts=[0,1];
  for(const [start,delta] of [[x,dx],[z,dz]]){
    if(Math.abs(delta)<1e-12)continue;
    const low=Math.min(start,start+delta),high=Math.max(start,start+delta);
    for(let k=Math.floor(low/size)+1;k*size<high;k++){const u=(k*size-start)/delta;if(u>0&&u<1)cuts.push(u);}
  }
  return cuts.sort((a,b)=>a-b).filter((u,i,a)=>!i||u-a[i-1]>1e-12);
}
function groundBallisticBuildings(scene){
  let index=groundBallisticBuildingIndex;
  if(index&&index.source===scene.buildings&&index.height===scene.height&&index.heights===scene.heights&&index.terrain===scene.terrain&&index.data===scene.data&&index.e===scene.e&&index.scale===scene.scale)return index;
  index={source:scene.buildings,height:scene.height,heights:scene.heights,terrain:scene.terrain,data:scene.data,e:scene.e,scale:scene.scale,bins:new Map()};
  for(const box of scene.buildings){
    if(![box.minX,box.maxX,box.minZ,box.maxZ,box.bottom,box.top].every(Number.isFinite)||box.minX>box.maxX||box.minZ>box.maxZ||box.bottom>box.top)continue;
    const x=(box.minX+box.maxX)/2,z=(box.minZ+box.maxZ)/2,h=scene.height(x,z);
    // 仮: 描画の箱を中心地点の地表へ固定し、地表から上下端までの差は誇張しない。
    // 物理の建物寸法は未定。こうして得た定数bottomM/topMのAABBとの交差は厳密。
    const physical={box,bottomM:h*scene.m/scene.e+(box.bottom-h)*scene.m,topM:h*scene.m/scene.e+(box.top-h)*scene.m};
    for(let iz=Math.floor(box.minZ/4);iz<=Math.floor(box.maxZ/4);iz++)for(let ix=Math.floor(box.minX/4);ix<=Math.floor(box.maxX/4);ix++){
      const key=ix+','+iz;if(!index.bins.has(key))index.bins.set(key,[]);index.bins.get(key).push(physical);
    }
  }
  groundBallisticBuildingIndex=index;return index;
}
function groundBallisticTrace(s){
  const scene=s.scene,x=s.origin.x,z=s.origin.z,dx=s.target.x-x,dz=s.target.z-z,T=s.physicalDuration;
  const physical=s.mode==='indirect',a=physical?-GROUND_BALLISTIC_PROFILE.gravity*T*T/2:0,
    b=physical?s.velocityMeters.y*T:s.target.y-s.origin.y,c=physical?s.originMeters.y:s.origin.y;
  const endpointEpsilon=1e-9,lo=endpointEpsilon,hi=1-endpointEpsilon;
  let first=null,reason=null;
  const accept=(u,why)=>{if(u!==null&&u>=lo&&u<=hi&&(first===null||u<first)){first=u;reason=why;}};
  const height=(wx,wz)=>{const h=scene.height(wx,wz);return physical?h*scene.m/scene.e:h;};
  const cuts=groundBallisticGridCuts(x,z,dx,dz),triangles=[];
  for(let i=1;i<cuts.length;i++){
    const from=cuts[i-1],to=cuts[i],mid=(from+to)/2,ix=Math.floor(x+dx*mid),iz=Math.floor(z+dz*mid),den=dx+dz;
    triangles.push(from);
    if(Math.abs(den)>1e-12){const cross=(ix+iz+1-x-z)/den;if(cross>from+1e-12&&cross<to-1e-12)triangles.push(cross);}
  }
  triangles.push(1);
  for(let i=1;i<triangles.length;i++){
    const from=triangles[i-1],to=triangles[i];if(first!==null&&from>first)break;
    const h0=height(x+dx*from,z+dz*from),h1=height(x+dx*to,z+dz*to);
    if(!Number.isFinite(h0)||!Number.isFinite(h1))return {fraction:0,reason:'invalid-terrain'};
    const slope=(h1-h0)/(to-from),left=Math.max(lo,from),right=Math.min(hi,to);
    // 放物線と各三角形平面の差。最終地点だけの接地は衝突として拒否しない。
    if(left<=right){
      const qa=a,qb=b-slope,qc=c-h0+slope*from;
      const value=u=>(qa*u+qb)*u+qc;
      if(value(left)<-1e-7)accept(left,'terrain');
      for(const root of groundBallisticRoots(qa,qb,qc))if(root>=left&&root<=right)accept(root,'terrain');
      if(value(right)<-1e-7){const hit=groundBallisticBand(qa,qb,qc,left,right,-Infinity,0);accept(hit??right,'terrain');}
    }
  }
  const index=groundBallisticBuildings(scene),candidates=new Set(),bins=groundBallisticGridCuts(x,z,dx,dz,4);
  // DDAの区画と境界の両隣を調べる。箱全体・射線の矩形全体を毎回走査しない。
  for(let i=0;i<bins.length;i++){
    const u=i? (bins[i-1]+bins[i])/2:0,wx=x+dx*u,wz=z+dz*u,ix=Math.floor(wx/4),iz=Math.floor(wz/4);
    for(let zz=iz-1;zz<=iz+1;zz++)for(let xx=ix-1;xx<=ix+1;xx++)for(const box of index.bins.get(xx+','+zz)||[])candidates.add(box);
  }
  for(const item of candidates){
    const box=item.box,interval=[lo,first===null?hi:Math.min(hi,first)];
    if(!groundBallisticSlab(x,dx,box.minX,box.maxX,interval)||!groundBallisticSlab(z,dz,box.minZ,box.maxZ,interval))continue;
    accept(groundBallisticBand(a,b,c,interval[0],interval[1],physical?item.bottomM:box.bottom,physical?item.topM:box.top),'building');
  }
  return first===null?null:{fraction:first,reason};
}
// ignoreRange は有効な狙点を確認した後の散布先専用。武器の有無・初速上限・遮蔽は省略しない。
function groundBallisticSolution(f,p,options={ignoreRange:false}){
  if(!f||!groundBallisticFinite(f.pos)||!groundBallisticFinite(p))return groundBallisticFail('invalid');
  if(f.alive===false||f.embarked||f.groundAirState==='base')return groundBallisticFail('absent');
  const scene=groundBallisticScene();if(!scene)return groundBallisticFail('invalid-scene');
  const range=groundStrikeRange(f),dx=p.x-f.pos.x,dz=p.z-f.pos.z,d=Math.hypot(dx,dz),profile=GROUND_BALLISTIC_PROFILE;
  if(!range||!(range.max>0)||!Number.isFinite(range.max)||options?.ignoreRange!==true&&(d<(range.min||0)-1e-9||d>range.max+1e-9))return groundBallisticFail('range');
  const originH=scene.height(f.pos.x,f.pos.z),targetH=scene.height(p.x,p.z);
  if(!Number.isFinite(originH)||!Number.isFinite(targetH))return groundBallisticFail('invalid-terrain');
  // 航空高度は描画地表からの実オフセット。地表の18倍で割らない。
  const sourceGround=scene.analyticHeight?scene.analyticHeight(f.pos.x,f.pos.z):originH;
  if(!Number.isFinite(sourceGround))return groundBallisticFail('invalid-terrain');
  const airborne=['low','high'].includes(f.band),altitude=airborne?Math.max(0,f.pos.y-sourceGround)*scene.m:0;
  let originMeters=new THREE.Vector3(f.pos.x*scene.m,originH*scene.m/scene.e+altitude+profile.muzzleHeightM,f.pos.z*scene.m);
  let targetMeters=new THREE.Vector3(p.x*scene.m,targetH*scene.m/scene.e,p.z*scene.m);
  let origin=groundBallisticWorld(scene,originMeters),target=new THREE.Vector3(p.x,targetH,p.z);
  if(range.direct){
    // 直射だけ既存の視点を砲口の表示proxyとする（仮）。新しい2m砲口でLOSを狭めない。
    const eye=groundEye(f);if(!groundBallisticFinite(eye))return groundBallisticFail('invalid');
    origin=new THREE.Vector3(eye.x,eye.y,eye.z);target.y+=groundSightRules().eyeHeight;
    originMeters=new THREE.Vector3(origin.x*scene.m,originH*scene.m/scene.e+(origin.y-originH)*scene.m,origin.z*scene.m);
    targetMeters.y+=(target.y-targetH)*scene.m;
  }
  const delta=targetMeters.clone().sub(originMeters),distance=Math.hypot(delta.x,delta.z);
  let mode='indirect',T,velocity;
  if(f.groundKind==='supportAircraft'){
    // 段階7までの互換表示だけ。爆弾を誘導する解として使わない。
    mode='legacy-support';const delay=typeof groundStrikeRules==='function'?groundStrikeRules().supportAircraft?.delay:null;
    if(!(delay>0)||!Number.isFinite(delay))return groundBallisticFail('invalid-profile');
    T=delay*profile.physicalSecondsPerGameSecond;velocity=delta.clone().multiplyScalar(1/T);
  }else if(range.direct){mode='direct';T=distance/profile.directSpeed;velocity=T?delta.clone().multiplyScalar(1/T):new THREE.Vector3();}
  else if(distance<1e-7){
    if(delta.y>=0)return groundBallisticFail('unreachable');
    T=Math.sqrt(-2*delta.y/profile.gravity);velocity=new THREE.Vector3();
  }else{
    const angle=profile.preferredAngle,cos=Math.cos(angle),den=2*cos*cos*(distance*Math.tan(angle)-delta.y);
    if(!(den>0))return groundBallisticFail('unreachable');
    const speed=Math.sqrt(profile.gravity*distance*distance/den),cap=f.groundKind==='guidedRocket'?profile.rocketMaxMuzzle:profile.maxMuzzle;
    if(!Number.isFinite(speed)||speed>cap+1e-9)return groundBallisticFail('unreachable');
    T=distance/(speed*cos);velocity=new THREE.Vector3(delta.x/T,speed*Math.sin(angle),delta.z/T);
  }
  if(!Number.isFinite(T)||!(T>0)||!groundBallisticFinite(velocity))return groundBallisticFail('unreachable');
  const solution={clear:true,reason:'clear',mode,origin,target,originMeters,targetMeters,velocityMeters:velocity,
    duration:T/profile.physicalSecondsPerGameSecond,physicalDuration:T,timeScale:profile.physicalSecondsPerGameSecond,
    gravity:mode==='indirect'?profile.gravity:0,scene,impact:target.clone(),collision:null};
  if(mode==='legacy-support')return solution;
  // 直射の可否は既存LOSだけを正本とし、traceは拒否時の衝突位置を特定するためだけ。
  const directClear=mode==='direct'?groundClearLine(origin,target):null;
  if(directClear)return solution;
  const hit=groundBallisticTrace(solution);
  if(hit){
    const time=hit.fraction*solution.duration,point=groundBallisticAt(solution,time);
    solution.clear=false;solution.reason=hit.reason;solution.hitTime=time;solution.impact=point;solution.collision={point:point.clone(),time};
  }
  // 直射は既存の射線規則も満たす。通常は上の厳密traceで同じ障害物を特定済み。
  if(mode==='direct'&&solution.clear){solution.clear=false;solution.reason='direct-blocked';solution.hitTime=0;solution.impact=origin.clone();solution.collision={point:origin.clone(),time:0};}
  return solution;
}
function groundBallisticPoint(f,p,options={ignoreRange:false}){
  if(!f||typeof f!=='object'||!groundBallisticFinite(f.pos)||!groundBallisticFinite(p))return groundBallisticFail('invalid');
  const scene=groundBallisticScene();if(!scene)return groundBallisticFail('invalid-scene');
  const range=groundStrikeRange(f),sourceKey=[f.pos.x,f.pos.y,f.pos.z,f.band,f.groundKind,f.type,f.alive,!!f.embarked,f.groundAirState,range?.direct,range?.min,range?.max].join('/');
  let entry=groundBallisticCache.get(f);
  if(!entry||entry.key!==sourceKey||['data','terrain','heightSpec','cells','height','heights','buildings','board','analyticHeight','e','scale'].some(k=>entry.scene[k]!==scene[k])){
    entry={key:sourceKey,scene,points:new Map()};groundBallisticCache.set(f,entry);
  }
  const key=[p.x,p.y,p.z,options?.ignoreRange===true].join('/');if(entry.points.has(key))return entry.points.get(key);
  const solution=groundBallisticSolution(f,p,options);
  // 高度キャッシュは初回trace中に確保される。確保後の参照を保存する。
  entry.scene=groundBallisticScene();entry.points.set(key,solution);
  if(entry.points.size>64)entry.points.delete(entry.points.keys().next().value);
  return solution;
}
