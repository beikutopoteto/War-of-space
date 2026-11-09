/* 地上専用。道路の所有と本営からの流量、補給、士気、航空の基地帰投。 */
let groundSupplyNet=null, groundSupplyAiming=false, groundSupplyMessage='';
function groundSupplyRules(){return WOS_TERRAIN[op.ground].supply;}
function groundSupplyActive(){return !!(op.ground&&op.groundHQ&&(!op.groundDrill||typeof tutorial!=='undefined'&&(tutorial?.skipped||groundDrillRow()?.section>=10)));}
function groundSupplyLand(f){return !!f&&!['sea','was','droneHive','fighter','attack','supportAircraft'].includes(f.groundKind);}
function groundSupplyAir(f){return !!f&&['fighter','attack','supportAircraft'].includes(f.groundKind);}
function groundAbsent(f){return f.groundAirState==='base';}
function groundCommandAllowed(f,type){return (!groundSupplyActive()||f.groundMorale!==0||f.groundRout==='regroup')&&!groundAbsent(f)&&!f.groundAirState&&f.groundRout!=='routing'&&(!f.groundRout||['move','board'].includes(type));}
function groundSupplyInitUnit(f){
  if(groundSupplyLand(f)||groundSupplyAir(f))f.groundSupply=groundSupplyRules().max;
  if(groundSupplyLand(f))f.groundMorale=groundSupplyRules().max;
  f.groundSupplySource=null;f.groundSupplyWait=0;f.groundRest=0;f.groundHitLeft=0;f.groundRout=null;f.groundAirState=null;f.groundSupplyGiven=0;f.groundSupplyReceived=0;
}
function groundSupplyReset(){groundRoadLabelsClear();groundSupplyLinksClear();groundSupplyMapClear();groundSupplyNet=null;groundSupplyAiming=false;groundSupplyMessage='';}
function groundCircleAt(x,y){
  let best=null,weight=Infinity;
  for(const s of groundSites){const k=Math.hypot(x-s.x,y-s.y)/s.radiusKm;if(k<=1&&k<weight){best=s;weight=k;}}
  return best;
}
// 幾何学的な実交点だけを共有。セル境界・帰属境界も切り、帯の所有と網の辺を一致させる。
function groundSupplyBuild(){
  const d=WOS_TERRAIN[op.ground],segments=[],nodes=[],edges=[],byPoint=new Map();
  const node=(x,y)=>{const key=x.toFixed(6)+','+y.toFixed(6);if(!byPoint.has(key)){byPoint.set(key,nodes.length);nodes.push({x,y,edges:[],rates:[0,0]});}return byPoint.get(key);};
  for(const road of d.objects.roads)for(let i=1;i<road.points.length;i++)segments.push({a:road.points[i-1],b:road.points[i],cuts:[0,1]});
  const cut=(s,x,y)=>{const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=((x-s.a[0])*dx+(y-s.a[1])*dy)/(dx*dx+dy*dy);if(t>=0&&t<=1&&Math.hypot(x-s.a[0]-t*dx,y-s.a[1]-t*dy)<1e-6)s.cuts.push(t);};
  const projections=new Map();
  for(const site of groundSites){let best=null;
    for(const s of segments){const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=Math.max(0,Math.min(1,((site.x-s.a[0])*dx+(site.y-s.a[1])*dy)/(dx*dx+dy*dy))),x=s.a[0]+dx*t,y=s.a[1]+dy*t,dist=Math.hypot(x-site.x,y-site.y);if(!best||dist<best.dist)best={s,t,x,y,dist};}
    if(best&&best.dist<.8){best.s.cuts.push(best.t);projections.set(site,best);}
  }
  for(let i=0;i<segments.length;i++){
    const s=segments[i],dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];
    for(let j=i+1;j<segments.length;j++){
      const q=segments[j],ex=q.b[0]-q.a[0],ey=q.b[1]-q.a[1],den=dx*ey-dy*ex;
      if(Math.abs(den)<1e-10){cut(s,...q.a);cut(s,...q.b);cut(q,...s.a);cut(q,...s.b);continue;}
      const t=((q.a[0]-s.a[0])*ey-(q.a[1]-s.a[1])*ex)/den,u=((q.a[0]-s.a[0])*dy-(q.a[1]-s.a[1])*dx)/den;
      if(t>=0&&t<=1&&u>=0&&u<=1){s.cuts.push(t);q.cuts.push(u);}
    }
    for(let axis=0;axis<2;axis++){const delta=s.b[axis]-s.a[axis];if(Math.abs(delta)<1e-9)continue;
      for(let v=Math.ceil(Math.min(s.a[axis],s.b[axis])/d.meta.cellKm)*d.meta.cellKm;v<Math.max(s.a[axis],s.b[axis]);v+=d.meta.cellKm)s.cuts.push((v-s.a[axis])/delta);
    }
    for(const section of groundTerritory?.sections||[])for(const p of [section.path[0],section.path[section.path.length-1]])cut(s,...p);
    // 円と帯の境界を正確に切る。
    for(const site of groundSites){const x=s.a[0]-site.x,y=s.a[1]-site.y,A=dx*dx+dy*dy,B=2*(x*dx+y*dy),C=x*x+y*y-site.radiusKm**2,D=B*B-4*A*C;if(D<0)continue;for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(t>0&&t<1)s.cuts.push(t);}
    const cuts=[...new Set(s.cuts.map(t=>+t.toFixed(9)))].sort((a,b)=>a-b);
    for(let k=1;k<cuts.length;k++){
      const point=t=>[s.a[0]+dx*t,s.a[1]+dy*t],a=point(cuts[k-1]),b=point(cuts[k]);if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7)continue;
      const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,circle=groundCircleAt(x,y),section=(groundTerritory?.sections||[]).find(v=>groundDistance(x,y,v.path)<1e-6);
      const e={a:node(...a),b:node(...b),path:[a,b],x,y,circle,owner:circle?circle.owner:section?.site.owner??null,contested:false,progress:[0,0],rates:[0,0]};
      nodes[e.a].edges.push(edges.length);nodes[e.b].edges.push(edges.length);edges.push(e);
    }
  }
  const sites=new Map();for(const [site,p] of projections)sites.set(site,node(p.x,p.y));
  groundSupplyNet={nodes,edges,sites,key:null,revision:0};groundSupplyRefresh();
}
function groundRoadAt(x,y){
  if(!groundSupplyNet)return null;let found=null,best=WOS_TERRAIN[op.ground].capture.roadWidthKm/2+1e-8;
  for(const e of groundSupplyNet.edges){const dist=groundDistance(x,y,e.path);if(dist<best){best=dist;found=e;}}
  return found;
}
function groundCanCaptureRoad(f){return f.alive&&f.hpPool>0&&f.band==='ground'&&groundBands(f).includes('ground')&&!f.embarked&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0);}
function groundRoadCaptureSeconds(){const n=WOS_TERRAIN[op.ground].capture.roadSeconds;return Number.isFinite(n)&&n>0?n:5;} // 道路専用の仮値
function groundSupplyRoadCapture(dt){
  if(!groundSupplyNet)return;
  const troops=fleets.filter(groundCanCaptureRoad),seconds=groundRoadCaptureSeconds(),width=WOS_TERRAIN[op.ground].capture.roadWidthKm/2;
  for(const e of groundSupplyNet.edges){
    if(e.circle){e.owner=e.circle.owner;e.contested=e.circle.contested;continue;}
    const present=[false,false];for(const f of troops)if(groundDistance(f.pos.x/GROUND_SCALE+24,18-f.pos.z/GROUND_SCALE,e.path)<=width+1e-8)present[f.team]=true;
    e.contested=present[0]&&present[1];e.capturingTeam=e.contested?null:present[0]?0:present[1]?1:null;if(e.contested)continue;
    const team=present[0]?0:present[1]?1:null;if(team===null||team===e.owner)continue;
    e.progress[team]=Math.min(seconds,e.progress[team]+dt);
    if(e.progress[team]>=seconds-1e-8){e.owner=team;e.progress=[0,0];groundSupplyNet.revision++;}
  }
}
function groundSupplyRoadOpen(e){
  const d=WOS_TERRAIN[op.ground];
  // 細い川も飛び越さない。浅瀬は物流を通さない。
  const [a,b]=e.path,n=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(d.meta.cellKm/8)));
  for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,y=a[1]+(b[1]-a[1])*i/n;
    if(!groundPass(x,y,'air')||groundInside(x,y,d.water.sea)||d.water.ponds.some(p=>groundInside(x,y,p)))return false;
    for(const river of d.water.rivers){const r=groundRiverAt(x,y,river);if(r.dist<r.width/2+.12&&!d.objects.bridges.some(p=>p.river===river.id&&Math.hypot(p.x-x,p.y-y)<.9)&&!groundBuiltBridgeAt(x,y,river.id))return false;}
  }return true;
}
function groundSupplyRefresh(){
  const net=groundSupplyNet;if(!net)return;
  const key=groundSites.map(s=>s.owner+':'+s.contested).join('|')+'/'+net.edges.map(e=>e.owner+':'+e.contested).join('|')+'/'+groundBridgeRevision;
  if(net.key===key)return;net.key=key;
  net.nodes.forEach(n=>n.rates=[0,0]);net.edges.forEach(e=>{e.rates=[0,0];e.open=groundSupplyRoadOpen(e);});
  for(const team of [0,1]){
    const hq=groundSites.find(s=>s.id===op.groundHQ?.[team]);if(!hq||hq.owner!==team)continue;
    const start=net.sites.get(hq);if(start===undefined)continue;
    const queue=[start];net.nodes[start].rates[team]=hq.contested?.5:1;
    for(let at=0;at<queue.length;at++){
      const i=queue[at],n=net.nodes[i];
      for(const ei of n.edges){const e=net.edges[ei];if(!e.open||!e.contested&&e.owner!==team)continue;
        const rate=Math.min(n.rates[team],e.contested?.5:1),j=e.a===i?e.b:e.a;
        e.rates[team]=Math.max(e.rates[team],rate);if(rate>net.nodes[j].rates[team]){net.nodes[j].rates[team]=rate;queue.push(j);}
      }
    }
  }
}
function groundSupplyAt(f){
  const x=f.pos.x/GROUND_SCALE+24,y=18-f.pos.z/GROUND_SCALE,s=groundCircleAt(x,y),net=groundSupplyNet;
  if(s){const hq=s.id===op.groundHQ?.[f.team]&&s.owner===f.team,rate=hq?(s.contested?.5:1):net?.nodes[net.sites.get(s)]?.rates[f.team]||0;return {owner:s.owner,contested:s.contested,rate:(s.owner===f.team||s.contested)?rate:0,site:s};}
  const e=groundRoadAt(x,y);return {owner:e?.owner??null,contested:e?.contested||false,rate:e?.rates[f.team]||0,edge:e};
}
function groundSupplyInit(){
  for(const f of fleets)groundSupplyInitUnit(f);
  if(!op.groundDrill&&groundSupplyActive())groundSupplyBuild();
}
function groundSupplyAttackFactor(f){
  if(!groundSupplyActive())return 1;const max=groundSupplyRules().max;
  return (Number.isFinite(f.groundSupply)&&f.groundKind!=='supply'?.5+.5*f.groundSupply/max:1)*(Number.isFinite(f.groundMorale)?.5+.5*f.groundMorale/max:1);
}
function groundSupplySpeedFactor(f){
  if(!groundSupplyActive())return 1;const r=groundSupplyRules();return (Number.isFinite(f.groundSupply)&&f.groundKind!=='supply'?.7+.3*f.groundSupply/r.max:1)*(f.groundRout==='routing'||!(f.groundHitLeft>0)?1:r.hitSlow);
}
function groundSupplySpend(f,amount){if(groundSupplyActive()&&Number.isFinite(f.groundSupply))f.groundSupply=Math.max(0,f.groundSupply-amount);}
function groundSupplyShot(f,strike=false){groundSupplySpend(f,groundSupplyAir(f)?(strike?groundSupplyRules().airStrike:groundSupplyRules().airShot):(strike?groundSupplyRules().strike:groundSupplyRules().shot));}
function groundSupplyMoved(f,a,b){
  if(!groundSupplyActive()||f.embarked||!Number.isFinite(f.groundSupply))return;
  if(!groundSupplyLand(f))return;f.groundMoved=true;
  const km=Math.hypot(b.x-a.x,b.z-a.z)/GROUND_SCALE;groundSupplySpend(f,km*groundSupplyRules().move);
  if(!Number.isFinite(f.groundMorale)||f.groundRout)return;
  const d=WOS_TERRAIN[op.ground],r=d.supply,n=Math.max(1,Math.ceil(km/(d.meta.cellKm/4)));let spent=0;
  for(let i=0;i<n;i++){const t=(i+.5)/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,gx=x/GROUND_SCALE+24,gy=18-z/GROUND_SCALE,type=d.terrain.cells[Math.floor(gy/d.meta.cellKm)*d.terrain.cols+Math.floor(gx/d.meta.cellKm)]||'平地',road=groundRoadAt(gx,gy)||d.objects.roads.some(p=>groundDistance(gx,gy,p.points)<=d.capture.roadWidthKm/2),cover=groundForests.some(p=>Math.hypot(p.x-x,p.z-z)<=p.r)||d.objects.settlements.some(s=>groundInside(gx,gy,s.polygon));spent+=km/n*(r.terrainMove[type]||1)*(road?.5:cover?.75:1);}
  f.groundMorale=Math.max(0,f.groundMorale-spent);f.groundMoved=true;
}
function groundSupplyHit(f,amount){
  if(!groundSupplyActive()||!(amount>0))return amount;
  f.groundHitLeft=groundSupplyRules().hitSeconds;f.groundRest=0;
  if(!Number.isFinite(f.groundMorale))return amount;
  const absorbed=Math.min(f.groundMorale,amount);f.groundMorale-=absorbed;
  if(f.groundMorale<=0&&!f.groundRout)groundRoutStart(f);
  return amount-absorbed;
}
function groundRoutStart(f){
  if(groundStaticTarget(f))return;
  groundCancelWork(f);groundClearOrders(f);f.groundGiving=null;f.bandTo=null;f.bandLeft=0;f.groundRout='routing';f.groundRoutRepath=0;f.groundRest=0;
}
function groundSupplyInternalMove(f,p,path){groundClearOrders(f);f.order={type:'move',dest:p.clone(),path:path||groundPath(f.pos,p,groundMoveKind(f))};if(!f.order.path)f.order=null;}
function groundNearestRoute(f,candidates){
  let best=null;for(const target of candidates){const path=groundPath(f.pos,target.pos,groundMoveKind(f));if(!path)continue;const length=path.points.slice(1).reduce((n,p,i)=>n+groundDistanceTo({pos:p},{pos:path.points[i]}),0);if(!best||length<best.length)best={target,path,length};}return best;
}
function groundRoutStep(f,dt){
  if(f.groundRout!=='routing')return;
  const r=groundSupplyRules();f.groundRoutRepath-=dt;
  const target=f.groundRoutTarget,valid=target&&target.alive!==false&&(target.team===f.team&&!target.embarked&&!target.groundRout||target.owner===f.team);
  if(valid&&groundDistanceTo(f,target)<=r.routArrivalKm*GROUND_SCALE){groundClearOrders(f);f.groundRout='regroup';return;}
  if(f.groundRoutRepath>0&&f.order?.path&&f.order.path.blockedRevision!==groundBridgeRevision&&valid)return;
  let best=groundNearestRoute(f,fleets.filter(t=>t!==f&&t.team===f.team&&t.alive&&!t.embarked&&groundSupplyLand(t)&&!t.groundRout));
  if(!best)best=groundNearestRoute(f,groundSites.filter(s=>s.owner===f.team));
  if(!best){groundClearOrders(f);f.groundRout='regroup';f.groundRoutTarget=null;return;}
  f.groundRoutTarget=best.target;f.groundRoutRepath=r.routRepath;groundSupplyInternalMove(f,best.target.pos,best.path);
}
function groundSupplyCanGive(f,t){
  if(!groundSupplyActive()||!f||!t||f===t||f.groundKind!=='supply'||!f.alive||f.embarked||f.groundRout||!t.alive||t.embarked||t.team!==f.team||!groundSupplyLand(t)||t.groundKind==='supply')return false;
  return true;
}
function groundSupplyCommand(list,t){
  const f=list.length===1?list[0]:null;if(!groundSupplyCanGive(f,t))return false;
  groundCancelWork(f);groundClearOrders(f);f.groundGiving=t;groundClearAiming();groundSupplyMessage='補給先：'+t.name;return true;
}
function groundSupplyGive(dt,netGains){
  const r=groundSupplyRules(),used=new Set();
  for(const f of fleets){f.groundSupplyGiving=false;const t=f.groundGiving;if(!groundSupplyCanGive(f,t)){f.groundGiving=null;continue;}
    if(used.has(t)||f.order||f.groundSupply<=0||groundDistanceTo(f,t)>r.giveKm*GROUND_SCALE)continue;
    const path=groundPath(f.pos,t.pos,groundMoveKind(f),true);
    if(!path||path.L>r.giveKm*GROUND_SCALE||groundBuildingsBlock({x:f.pos.x,y:groundHeight(f.pos.x,f.pos.z)+.35,z:f.pos.z},{x:t.pos.x,y:groundHeight(t.pos.x,t.pos.z)+.35,z:t.pos.z}))continue;
    const prior=netGains.get(t)||0,gain=Math.min(r.give*dt,r.max-t.groundSupply+prior,f.groundSupply);
    if((netGains.get(t)||0)>=gain)continue;
    // ネットワークを既に受けた分を差し替える。実増加量だけを供給側から引く。
    const extra=Math.min(gain-prior,r.max-t.groundSupply);if(extra<=0)continue;
    t.groundSupply+=extra;f.groundSupply-=gain;f.groundSupplyGiven+=gain;t.groundSupplyReceived+=gain;used.add(t);f.groundSupplyGiving=true;t.groundSupplySource={unit:f};
  }
}
function groundAirStep(f,dt){
  const r=groundSupplyRules();
  if(f.groundAirState==='base'){
    f.groundAirLeft-=dt;if(f.groundAirLeft<=0){f.groundSupply=r.max;f.groundAirState='return';groundSupplyInternalMove(f,f.groundAirResume);}
    return;
  }
  groundSupplySpend(f,r.airIdle*dt);
  if(!f.groundAirState&&f.groundSupply<=r.airReturn){
    f.groundAirResume=f.pos.clone();const base=groundSites.find(s=>s.id===op.groundHQ[f.team]&&s.owner===f.team);f.groundAirState='out';groundSupplyInternalMove(f,base?.pos||f.home);
  }
  if(f.groundAirState&&!f.order){
    if(f.groundAirState==='out'){f.groundAirState='base';f.groundAirLeft=r.airBase;f.fireTarget=null;}
    else f.groundAirState=null;
  }
}
function groundSupplyAI(f){
  if(f.team!==1||!groundSupplyLand(f)||f.groundRout||f.groundSupplyAITimer>0)return;
  f.groundSupplyAITimer=groundSupplyRules().routRepath;
  const r=groundSupplyRules();
  if(f.groundRecover){if(f.groundSupply>=r.aiResume&&f.groundMorale>=r.aiResume){f.groundRecover=false;groundSupplyInternalMove(f,f.groundRecoverPost);return;}if(f.order)return;}
  else if(f.groundSupply>r.aiSupply&&f.groundMorale>r.aiMorale)return;
  const places=groundSites.filter(s=>s.owner===f.team&&!s.contested&&(f.groundMorale<=r.aiMorale||groundSupplyAt({...f,pos:s.pos}).rate>0));
  const best=groundNearestRoute(f,places);if(!best)return;
  if(!f.groundRecover)f.groundRecoverPost=f.post.clone();f.groundRecover=true;
  if(groundDistanceTo(f,best.target)>GROUND_SCALE)groundSupplyInternalMove(f,best.target.pos,best.path);
}
function groundSupplyBefore(dt){
  if(!groundSupplyActive())return;
  if(op.groundDrill&&!groundSites.some(s=>s.id==='B'))groundSupplyDrillSetup(!!tutorial?.skipped);
  if(!groundSupplyNet)groundSupplyBuild();
  for(const f of fleets){if(!f.alive||f.embarked||groundStaticTarget(f))continue;
    if((groundSupplyLand(f)||groundSupplyAir(f))&&!Number.isFinite(f.groundSupply))groundSupplyInitUnit(f);
    f.groundHitLeft=Math.max(0,(f.groundHitLeft||0)-dt);f.groundMoved=false;f.groundSupplyAITimer=Math.max(0,(f.groundSupplyAITimer||0)-dt);
    if(groundSupplyAir(f))groundAirStep(f,dt);
    if(groundSupplyLand(f)){if(f.groundMorale<=0&&!f.groundRout)groundRoutStart(f);groundRoutStep(f,dt);groundSupplyAI(f);}
  }
}
function groundSupplyAfter(dt){
  for(const f of fleets)f.groundSupplySource=null;
  if(!groundSupplyActive())return;
  groundSupplyRoadCapture(dt);groundSupplyRefresh();const r=groundSupplyRules(),netGains=new Map(),d=WOS_TERRAIN[op.ground];
  for(const f of fleets){if(!f.alive||f.embarked||!groundSupplyLand(f))continue;
    const at=groundSupplyAt(f);f.groundSupplyRate=at.rate;
    const before=f.groundSupplyWait;f.groundSupplyWait=at.rate?before+dt:0;
    const gain=Math.min(r.max-f.groundSupply,r.refill*at.rate*Math.min(dt,Math.max(0,f.groundSupplyWait-r.refillWait)));
    f.groundSupply+=gain;netGains.set(f,gain);
    if(gain>0)f.groundSupplySource=at.site?{site:at.site}:{edge:at.edge};
    if(f.groundBuilding)groundSupplySpend(f,r.build*dt);
    const own=at.owner===f.team&&!at.contested;
    const gx=f.pos.x/GROUND_SCALE+24,gy=18-f.pos.z/GROUND_SCALE,type=d.terrain.cells[Math.floor(gy/d.meta.cellKm)*d.terrain.cols+Math.floor(gx/d.meta.cellKm)];
    if(!own&&!f.groundRout&&r.terrainIdle.includes(type))f.groundMorale=Math.max(0,f.groundMorale-r.idleMorale*dt);
    const restBefore=f.groundRest;f.groundRest=own&&!f.groundMoved&&f.groundRout!=='routing'?restBefore+dt:0;
    if(f.groundRest>r.restWait)f.groundMorale=Math.min(r.max,f.groundMorale+r.moraleRefill*Math.min(dt,f.groundRest-r.restWait));
    if(f.groundRout==='regroup'&&f.groundMorale>=r.rally)f.groundRout=null;
    if(f.groundMorale<=0&&!f.groundRout)groundRoutStart(f);
  }
  groundSupplyGive(dt,netGains);
}
function groundSupplyStatus(f){
  if(!groundSupplyActive())return '訓練前';
  if(f.groundAirState)return {out:'補給帰投中',base:'基地補給中',return:'戦場へ復帰中'}[f.groundAirState];
  if(f.groundRout)return f.groundRout==='routing'?'敗走中・操作不可':'再集結・移動と搭乗のみ';
  if(f.groundSupplyGiving)return '補給を分配中';
  if(!groundSupplyLand(f))return groundSupplyAir(f)?'飛行中':'対象外';
  const at=groundSupplyAt(f),capture=at.edge?.progress[f.team]||0;return (capture&&at.owner!==f.team?`道路占領 ${Math.floor(capture/groundRoadCaptureSeconds()*100)}% / `:'')+(at.rate===1?'本営接続':at.rate===.5?'競合・半速補給':'接続なし');
}
function groundSupplyReadings(list){
  return [['groundMorale','士気'],['groundSupply','補給']].flatMap(([key,label])=>{
    const values=list.filter(f=>Number.isFinite(f[key])).map(f=>Math.max(0,Math.min(100,100*f[key]/groundSupplyRules().max)));
    return values.length?[{key,label,value:Math.round(values.reduce((a,b)=>a+b,0)/values.length),min:Math.floor(Math.min(...values)),low:values.some(v=>v<=30)}]:[];
  });
}
function groundSupplyRosterText(list,aggregate=true){
  const rows=groundSupplyReadings(list).map(r=>`${r.label} ${r.value}%${aggregate?`（最低${r.min}%）`:''}`);
  if(aggregate&&list.some(f=>f.groundRout))rows.push(`敗走・再集結 ${list.filter(f=>f.groundRout).length}`);
  return rows.join('　');
}
// 名札・中隊タイル・旅団/大隊で同じ細い棒を使う。対象外には文字も棒も置かない。
function groundSupplyMeters(list){
  const rows=groundSupplyReadings(list);
  return rows.length?'<span class="ground-meters">'+rows.map(r=>`<span class="ground-track" data-meter="${r.key}" data-low="${r.low}" role="meter" aria-label="${r.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.value}"><i style="width:${r.value}%"></i></span>`).join('')+'</span>':'';
}
function groundSupplyUpdateMeters(el,list){
  const html=groundSupplyMeters(list);if(el._groundMeters!==html){el._groundMeters=html;el.innerHTML=html;}
}
function groundSupplyHud(list){
  const button=document.getElementById('groundSupply'),status=document.getElementById('groundSupplyStatus');if(!button||!status)return;
  button.disabled=!groundSupplyActive()||list.length!==1||list[0].groundKind!=='supply'||!groundCommandAllowed(list[0],'give');
  if(button.disabled)groundSupplyAiming=false;
  button.setAttribute('aria-pressed',String(groundSupplyAiming));
  const net=groundSupplyNet,counts=net?[1,.5,0].map(k=>net.edges.filter(e=>e.owner===0&&e.rates[0]===k).length):[0,0,0],hq=groundSites.find(s=>s.id===op.groundHQ?.[0]);
  status.textContent=groundSupplyAiming?'補給先の味方中隊をクリック（Escで取消）':`${hq?'本営：'+hq.name:'本営なし'} / 接続${counts[0]} 半速${counts[1]} 切断${counts[2]}${list.length===1?' / '+groundSupplyStatus(list[0]):''}`;
}
document.querySelectorAll('#groundSupply').forEach(b=>b.addEventListener('click',()=>{
  const list=orderTargets();if(list.length!==1||list[0].groundKind!=='supply'||!groundCommandAllowed(list[0],'give'))return;
  const aiming=!groundSupplyAiming;groundClearAiming();groundSupplyAiming=aiming;groundHud();
}));
// 既存の配置画面から利用。地上の配置では円外へ押し出さない。
function groundSupplyPlace(list,p){
  const hq=groundSites.find(s=>s.id===op.groundHQ?.[0]&&s.owner===0);if(!hq||!list.length||list.some(f=>f.embarked||groundMoveKind(f)==='air'||f.groundKind==='sea'))return false;
  const lead=list[0],mv=p.clone().sub(lead.pos),positions=list.map(f=>f.pos.clone().add(mv));
  if(positions.some((p,i)=>groundDistanceTo({pos:p},hq)>hq.radiusKm*GROUND_SCALE||!groundPass(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,groundMoveKind(list[i]))))return false;
  list.forEach((f,i)=>{f.pos.copy(positions[i]);f.pos.y=groundUnitHeight(f);f.home.copy(f.pos);f.post.copy(f.pos);groundClearOrders(f);for(const s of f.ships)s.pos.copy(f.pos);if(op.groundDrill)groundDrillEvent('supplyPlace',f,p);});return true;
}
function groundSupplyTile(f){
  return '<span class="ground-tile-meters">'+groundSupplyMeters([f])+'</span>';
}
function groundSupplyUpdateTile(f){
  groundSupplyUpdateMeters(f.btn.querySelector('.ground-tile-meters'),[f]);
  const meters=groundSupplyRosterText([f],false);
  f.btn.setAttribute('aria-label',f.name+' / '+(meters?meters+' / ':'')+groundSupplyStatus(f));
}
function groundSupplyStartDeploy(only=null){
  if(!groundSupplyActive()||over)return;
  const hq=groundSites.find(s=>s.id===op.groundHQ[0]&&s.owner===0);if(!hq){groundSupplyMessage='本営がないため配置できません';return;}
  const list=(only||fleets).filter(f=>f.team===0&&!f.embarked&&groundMoveKind(f)!=='air'&&f.groundKind!=='sea'),d=WOS_TERRAIN[op.ground],slots=[];
  for(let y=hq.y-hq.radiusKm;y<=hq.y+hq.radiusKm;y+=d.meta.cellKm)for(let x=hq.x-hq.radiusKm;x<=hq.x+hq.radiusKm;x+=d.meta.cellKm)if(Math.hypot(x-hq.x,y-hq.y)<=hq.radiusKm)slots.push(groundPoint(x,y));
  slots.sort((a,b)=>groundDistanceTo({pos:a},hq)-groundDistanceTo({pos:b},hq));
  const plan=[],used=new Set();
  for(const f of list){const p=slots.find(p=>!used.has(p)&&groundPass(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,groundMoveKind(f)));if(!p){groundSupplyMessage='本営内に配置できる場所が足りません';deploying=true;deployEl.hidden=false;deployEl.querySelector('p').textContent=groundSupplyMessage;document.getElementById('deployGo').disabled=true;return;}used.add(p);plan.push([f,p]);}
  for(const [f,p] of plan)groundSupplyPlace([f],p);
  deploying=true;deployZone.visible=false;deployEl.hidden=false;document.getElementById('deployGo').disabled=false;
  deployEl.querySelector('p').textContent='地上中隊を選び、本営の味方色の円内をクリックして配置します。航空・海上・搭載中隊は固定位置です。配置後に「作戦開始」を押してください。';
  if(list.length)select(list[0]);
  flyTo(hq.pos,new THREE.Vector3(0,1,.65),100);
  if(autoMode)endDeploy();
}
let groundSupplyMap=null;
function groundSupplyMapClear(){
  if(!groundSupplyMap)return;
  for(const line of groundSupplyMap.lines){line.parent?.remove(line);line.geometry.dispose();line.material.dispose();}
  for(const el of groundSupplyMap.labels)el.remove();groundSupplyMap=null;
}
// 受給の実増加があった自軍部隊だけ。網の表示欄を閉じても線は残す。
let groundSupplyLinks=new Map();
function groundSupplyLinksClear(){
  for(const line of groundSupplyLinks.values()){line.parent?.remove(line);line.geometry.dispose();line.material.dispose();}
  groundSupplyLinks.clear();
}
function groundSupplyLinkSource(f){
  const s=f.groundSupplySource;
  if(!groundSupplyActive()||!f.alive||f.embarked||f.team!==0||!s)return null;
  if(s.unit)return groundSupplyCanGive(s.unit,f)&&s.unit.groundGiving===f&&s.unit.groundSupplyGiving?s.unit.pos:null;
  const at=groundSupplyAt(f);
  if(!at.rate||s.site!==at.site||s.edge!==at.edge)return null;
  return s.site?s.site.pos:s.edge?groundPoint(s.edge.x,s.edge.y):null;
}
function groundSupplyLinksDraw(){
  const live=new Set();
  for(const f of fleets){
    const source=groundSupplyLinkSource(f);if(!source)continue;live.add(f);
    let line=groundSupplyLinks.get(f);
    if(!line){
      line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0x8bdfff,transparent:true,opacity:.35,dashSize:.25,gapSize:.65,depthWrite:false}));
      line.renderOrder=5;groundVisuals.add(line);groundSupplyLinks.set(f,line);
    }
    const key=`${source.x},${source.z}/${f.pos.x},${f.pos.z}`;
    if(line.userData.key===key)continue;line.userData.key=key;
    const n=Math.max(1,Math.ceil(Math.hypot(source.x-f.pos.x,source.z-f.pos.z)/.5)),points=[];
    for(let i=0;i<=n;i++){const p=source.clone().lerp(f.pos,i/n);p.y=groundSurfaceHeight(p.x,p.z)+.24;points.push(p);}
    line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(points);line.computeLineDistances();
  }
  for(const [f,line] of groundSupplyLinks)if(!live.has(f)){line.parent?.remove(line);line.geometry.dispose();line.material.dispose();groundSupplyLinks.delete(f);}
}
function groundSupplyDraw(){
  groundSupplyLinksDraw();
  const panel=document.getElementById('groundSupply')?.parentElement,net=groundSupplyNet;
  if(!net||!panel?.open){groundSupplyMapClear();return;}
  if(groundSupplyMap?.key!==net.key){
    groundSupplyMapClear();groundSupplyMap={key:net.key,lines:[],labels:[]};
    for(const rate of [1,.5,0]){
      const edges=net.edges.filter(e=>!e.circle&&e.owner===0&&e.rates[0]===rate),points=[];
      for(const e of edges)for(const [x,y] of e.path){const p=groundPoint(x,y);p.y+=.25;points.push(p);}
      const material=rate===1?new THREE.LineBasicMaterial({color:0x8bdfff,transparent:true,opacity:.9,depthWrite:false}):new THREE.LineDashedMaterial({color:0x8bdfff,transparent:true,opacity:rate===.5?.8:.35,dashSize:rate===.5?1:.3,gapSize:rate===.5?1:1.5,depthWrite:false});
      const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),material);line.computeLineDistances();groundVisuals.add(line);groundSupplyMap.lines.push(line);
      // 最大各2枚の小さな文字札。敵の位置や名前は載せない。
      for(let i=0;i<Math.min(2,edges.length);i++){
        const e=edges[Math.floor((i+.5)*edges.length/Math.min(2,edges.length))],el=document.createElement('small');el.className='ground-supply-point';el.textContent=rate===1?'補給 接続':rate===.5?'補給 半速':'補給 切断';el.supplyPos=groundPoint(e.x,e.y);labelsEl.appendChild(el);groundSupplyMap.labels.push(el);
      }
    }
  }
  for(const el of groundSupplyMap.labels){const p=proj(el.supplyPos);el.hidden=p.z>1;el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;}
}

let groundRoadLabels=[];
function groundRoadLabelsClear(){groundRoadLabels.forEach(el=>el.remove());groundRoadLabels=[];}
function groundRoadLabelsDraw(){
  if(!groundSupplyActive()||!groundSupplyNet){groundRoadLabelsClear();return;}
  const focus=orderTargets()[0],placed=[];let count=0;
  const edges=groundSupplyNet.edges.filter(e=>!e.circle&&(e.knownContested||(e.knownProgress||[]).some((p,i)=>p>0&&e.knownOwner!==i)));
  if(focus){const x=focus.pos.x/GROUND_SCALE+24,y=18-focus.pos.z/GROUND_SCALE;edges.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));}
  for(const e of edges){
    const p=proj(groundPoint(e.x,e.y).add(new THREE.Vector3(0,1,0)));
    if(p.z>1||p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight||placed.some(q=>Math.abs(q.x-p.x)<170&&Math.abs(q.y-p.y)<28))continue;
    placed.push(p);let el=groundRoadLabels[count++];
    if(!el){el=document.createElement('div');el.className='ground-road-label';labelsEl.appendChild(el);groundRoadLabels.push(el);}
    el.hidden=false;el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
    el.textContent='道路 · '+groundCaptureReadout(e,groundRoadCaptureSeconds());
    el.style.color=e.knownContested?'#e2c58a':e.knownOwner===1?'#ff998b':'#8bdfff';
  }
  groundRoadLabels.slice(count).forEach(el=>el.hidden=true);
}
