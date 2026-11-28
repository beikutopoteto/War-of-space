/* 地上専用。道路の所有と本営からの流量、補給、士気、航空の基地帰投。 */
let groundSupplyNet=null, groundSupplyAiming=false, groundSupplyMessage='', groundSupplyPenalty=0;
function groundSupplyRules(){return groundRuleSet().supply;}
function groundSupplyActive(){return !!(op.ground&&op.groundHQ&&(!op.groundDrill||typeof tutorial!=='undefined'&&(tutorial?.skipped||groundDrillRow()?.section>=10)));}
function groundSupplyLand(f){return !!f&&!['sea','drone','fighter','attack','supportAircraft'].includes(f.groundKind);}
function groundSupplyAir(f){return !!f&&['fighter','attack','supportAircraft'].includes(f.groundKind);}
function groundAbsent(f){return !!f.groundExited||f.groundAirState==='base';}
function groundCommandAllowed(f,type){return (!groundSupplyActive()||f.groundMorale!==0||f.groundRout==='regroup')&&!groundAbsent(f)&&!f.groundAirState&&!(typeof groundScriptDescending==='function'&&groundScriptDescending(f))&&f.groundRout!=='routing'&&(!f.groundRout||['move','board'].includes(type));}
function groundSupplyInitUnit(f){
  if(groundSupplyLand(f)||groundSupplyAir(f))f.groundSupply=groundSupplyUnitMax(f);
  if(groundSupplyLand(f))f.groundMorale=groundMoraleUnitMax(f);
  f.groundSupplyGiving=false;f.groundMoraleGiving=false;f.groundStockGiving=false;f.groundSupplySource=null;f.groundSupplyWait=0;f.groundRest=0;f.groundHitLeft=0;f.groundRout=null;f.groundAirState=null;f.groundSupplyGiven=0;f.groundSupplyReceived=0;
  f.groundSupplyDemand=false;f.groundSupplyTrip=null;f.groundSupplyTargets=null;f.groundSupplyCheckLeft=0;f.groundSupplyServing=null;
  f.groundSupplyRetreat=null;f.groundSupplyCombatAt=-Infinity;
}
function groundSupplyReset(){groundRoadLabelsClear();groundSupplyLinksClear();groundSupplyMapClear();groundSupplyNet=null;groundSupplyAiming=false;groundSupplyMessage='';}
function groundCircleAt(x,y){
  let best=null,weight=Infinity;
  for(const s of groundSites){const k=Math.hypot(x-s.x,y-s.y)/s.radiusKm;if(k<=1&&k<weight){best=s;weight=k;}}
  return best;
}
// 道の折れ曲がりは同じ区切りのpathに保持。セル境界では切らない。
function groundSupplyBuild(){
  const d=WOS_TERRAIN[op.ground],roads=[],segments=[],nodes=[],edges=[],byPoint=new Map();
  const node=(x,y)=>{const key=x.toFixed(6)+','+y.toFixed(6);if(!byPoint.has(key)){byPoint.set(key,nodes.length);nodes.push({x,y,edges:[],rates:[0,0]});}return byPoint.get(key);};
  for(const data of d.objects.roads){
    const road={points:data.points,lengths:[0],cuts:[0]};roads.push(road);
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),along=road.lengths[i-1];
      road.lengths.push(along+length);if(length>0)segments.push({a,b,length,along,road});
    }
    road.total=road.lengths.at(-1);road.cuts.push(road.total);
  }
  const add=(s,t)=>{if(t>=0&&t<=1)s.road.cuts.push(s.along+t*s.length);};
  const cut=(s,x,y)=>{const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=((x-s.a[0])*dx+(y-s.a[1])*dy)/(s.length*s.length);if(Math.hypot(x-s.a[0]-t*dx,y-s.a[1]-t*dy)<1e-6)add(s,t);};
  const projections=new Map();
  for(const site of groundSites){let best=null;
    for(const s of segments){const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=Math.max(0,Math.min(1,((site.x-s.a[0])*dx+(site.y-s.a[1])*dy)/(s.length*s.length))),x=s.a[0]+dx*t,y=s.a[1]+dy*t,dist=Math.hypot(x-site.x,y-site.y);if(!best||dist<best.dist)best={x,y,dist};}
    if(best&&best.dist<.8)projections.set(site,best);
  }
  for(let i=0;i<segments.length;i++){
    const s=segments[i],dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];
    for(let j=i+1;j<segments.length;j++){
      const q=segments[j];
      // 隣り合う折れ点は接続済み。交差だけが必須の切れ目。
      if(q.road===s.road&&(s.b===q.a||q.b===s.a))continue;
      const ex=q.b[0]-q.a[0],ey=q.b[1]-q.a[1],den=dx*ey-dy*ex;
      if(Math.abs(den)<1e-10){cut(s,...q.a);cut(s,...q.b);cut(q,...s.a);cut(q,...s.b);continue;}
      const t=((q.a[0]-s.a[0])*ey-(q.a[1]-s.a[1])*ex)/den,u=((q.a[0]-s.a[0])*dy-(q.a[1]-s.a[1])*dx)/den;
      if(t>=0&&t<=1&&u>=0&&u<=1){add(s,t);add(q,u);}
    }
    for(const section of groundTerritory?.sections||[])for(const p of [section.path[0],section.path.at(-1)])cut(s,...p);
    // 拠点の円の境界と、恒久橋の通行範囲の両端。
    for(const circle of [...groundSites,...d.objects.bridges.map(b=>({...b,radiusKm:.9}))]){
      const x=s.a[0]-circle.x,y=s.a[1]-circle.y,A=s.length*s.length,B=2*(x*dx+y*dy),C=x*x+y*y-circle.radiusKm**2,D=B*B-4*A*C;
      if(D>=0)for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])add(s,t);
    }
  }
  for(const road of roads){
    const at=t=>{for(let i=1;i<road.points.length;i++)if(t<=road.lengths[i]+1e-8){const k=(t-road.lengths[i-1])/(road.lengths[i]-road.lengths[i-1]);return [road.points[i-1][0]+(road.points[i][0]-road.points[i-1][0])*k,road.points[i-1][1]+(road.points[i][1]-road.points[i-1][1])*k];}return road.points.at(-1);};
    const mandatory=road.cuts.sort((a,b)=>a-b).filter((v,i,all)=>!i||v-all[i-1]>1e-7),cuts=[mandatory[0]];
    for(let i=1;i<mandatory.length;i++){
      const from=mandatory[i-1],to=mandatory[i];
      for(let t=from+groundRuleSet().capture.roadSegmentKm;t<to-1e-7;t+=groundRuleSet().capture.roadSegmentKm)cuts.push(t);
      cuts.push(to);
    }
    for(let i=1;i<cuts.length;i++){
      const from=cuts[i-1],to=cuts[i],path=[at(from),...road.points.filter((p,j)=>road.lengths[j]>from+1e-7&&road.lengths[j]<to-1e-7),at(to)],a=path[0],b=path.at(-1),[x,y]=at((from+to)/2),circle=groundCircleAt(x,y),section=(groundTerritory?.sections||[]).find(v=>groundDistance(x,y,v.path)<1e-6);
      const e={a:node(...a),b:node(...b),path,lengthKm:to-from,x,y,circle,owner:circle?circle.owner:section?.site.owner??null,contested:false,progress:[0,0],rates:[0,0]};
      nodes[e.a].edges.push(edges.length);nodes[e.b].edges.push(edges.length);edges.push(e);
    }
  }
  // 円の境界のノードへ載せる。拠点中心だけの追加の切れ目は作らない。
  const sites=new Map();for(const [site,p] of projections){let best=null;nodes.forEach((n,i)=>{if(!n.edges.some(e=>edges[e].circle===site))return;const dist=Math.hypot(n.x-p.x,n.y-p.y);if(!best||dist<best.dist)best={i,dist};});if(best)sites.set(site,best.i);}
  groundSupplyNet={nodes,edges,sites,key:null,revision:0};groundSupplyRefresh();
}
function groundSupplyEdgeLength(e){
  if(Number.isFinite(e.lengthKm))return e.lengthKm;
  if(e.path)return e.path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-e.path[i][0],p[1]-e.path[i][1]),0);
  const a=groundSupplyNet.nodes[e.a],b=groundSupplyNet.nodes[e.b];return Math.hypot(a.x-b.x,a.y-b.y);
}
function groundRoadAt(x,y){
  if(!groundSupplyNet)return null;let found=null,best=groundRuleSet().capture.roadWidthKm/2+1e-8;
  for(const e of groundSupplyNet.edges){const dist=groundDistance(x,y,e.path);if(dist<best){best=dist;found=e;}}
  return found;
}
function groundCanCaptureRoad(f){return !f.groundExited&&f.alive&&f.hpPool>0&&f.band==='ground'&&!groundWasFlying(f)&&groundBands(f).includes('ground')&&!f.embarked&&!f.groundRout&&(!groundSupplyActive()||f.groundMorale!==0);}
function groundRoadCaptureSeconds(e,owner=e?.owner){const r=groundRuleSet().capture;return owner===null?r.neutralSeconds:r.roadSeconds;}
function groundSupplyRoadCapture(dt){
  if(!groundSupplyNet)return;
  const troops=fleets.filter(groundCanCaptureRoad),width=groundRuleSet().capture.roadWidthKm/2;
  for(const e of groundSupplyNet.edges){
    if(e.circle){e.owner=e.circle.owner;e.contested=!!e.circle.supplyContested;continue;}   // 補給の競合は拠点の supplyContested（両軍とも1点以上）
    const present=[false,false];for(const f of troops)if(groundDistance(groundMapX(f.pos.x),groundMapY(f.pos.z),e.path)<=width+1e-8)present[f.team]=true;
    e.contested=present[0]&&present[1];e.capturingTeam=e.contested?null:present[0]?0:present[1]?1:null;if(e.contested)continue;
    const team=present[0]?0:present[1]?1:null;if(groundCaptureDecay(e,team,dt))continue;
    const seconds=groundRoadCaptureSeconds(e);
    e.progress[team]=Math.min(seconds,e.progress[team]+dt);
    if(e.progress[team]>=seconds-1e-8){e.owner=team;e.progress=[0,0];groundSupplyNet.revision++;}
  }
}
function groundSupplyRoadOpen(e){
  const d=WOS_TERRAIN[op.ground];
  // 細い川も飛び越さない。浅瀬は物流を通さない。
  for(let leg=1;leg<e.path.length;leg++){
    const a=e.path[leg-1],b=e.path[leg],n=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(d.meta.cellKm/8)));
    for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,y=a[1]+(b[1]-a[1])*i/n;
      if(!groundPass(x,y,'air')||groundInside(x,y,d.water.sea)||d.water.ponds.some(p=>groundInside(x,y,p)))return false;
      for(const river of d.water.rivers){const r=groundRiverAt(x,y,river);if(r.dist<r.width/2+.12&&!d.objects.bridges.some(p=>p.river===river.id&&Math.hypot(p.x-x,p.y-y)<.9)&&!groundBuiltBridgeAt(x,y,river.id))return false;}
    }
  }return true;
}
function groundSupplyRefresh(){
  const net=groundSupplyNet;if(!net)return;
  const key=groundSites.map(s=>s.owner+':'+!!s.supplyContested).join('|')+'/'+net.edges.map(e=>e.owner+':'+e.contested).join('|')+'/'+groundBridgeRevision;
  if(net.key===key)return;net.key=key;
  net.nodes.forEach(n=>n.rates=[0,0]);net.edges.forEach(e=>{e.rates=[0,0];e.open=groundSupplyRoadOpen(e);});
  for(const team of [0,1]){
    const hq=groundSites.find(s=>s.id===op.groundHQ?.[team]);if(!hq||hq.owner!==team)continue;
    const start=net.sites.get(hq);if(start===undefined)continue;
    const queue=[start];net.nodes[start].rates[team]=hq.supplyContested?.5:1;
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
  const x=groundMapX(f.pos.x),y=groundMapY(f.pos.z),s=groundCircleAt(x,y),net=groundSupplyNet;
  if(s){const hq=s.id===op.groundHQ?.[f.team]&&s.owner===f.team,rate=hq?(s.supplyContested?.5:1):net?.nodes[net.sites.get(s)]?.rates[f.team]||0;return {owner:s.owner,contested:!!s.supplyContested,rate:(s.owner===f.team||s.supplyContested)?rate:0,site:s};}
  const e=groundRoadAt(x,y);return {owner:e?.owner??null,contested:e?.contested||false,rate:e?.rates[f.team]||0,edge:e};
}
function groundSupplyInit(){
  for(const f of fleets)groundSupplyInitUnit(f);
  if(!op.groundDrill&&groundSupplyActive())groundSupplyBuild();
}
function groundSupplyAttackFactor(f){
  if(!groundSupplyActive())return 1;const max=groundSupplyRules().max;
  return (Number.isFinite(f.groundSupply)&&f.groundKind!=='supply'?.5+.5*f.groundSupply/max:1)*(Number.isFinite(f.groundMorale)?.5+.5*f.groundMorale/groundMoraleMax(f):1);
}
function groundSupplySpeedFactor(f){
  const blast=f.groundBlastUntil>gameSec||f.groundMobilityUntil>gameSec?groundStrikeSpeedFactor(f):1;
  if(!groundSupplyActive())return blast;
  const r=groundSupplyRules(),supply=Number.isFinite(f.groundSupply)&&f.groundKind!=='supply'?.7+.3*f.groundSupply/r.max:1;
  const direct=f.groundRout!=='routing'&&f.groundHitLeft>0?r.hitSlow:1;
  return supply*Math.min(direct,blast);
}
function groundSupplySpend(f,amount){if(groundSupplyActive()&&Number.isFinite(f.groundSupply))f.groundSupply=Math.max(0,f.groundSupply-amount);}
function groundSupplyShot(f,strike=false,share=1){
  f.groundSupplyCombatAt=gameSec;
  const r=groundSupplyRules(),base=groundSupplyAir(f)?(strike?r.airStrike:r.airShot):(strike?r.strike:r.shot);
  const factor=f.groundKind==='was'?groundRuleSet().wasCombat.shotSupplyFactor??1:1;
  groundSupplySpend(f,base*factor*Math.max(0,Number.isFinite(share)?share:1));
}
function groundSupplyMoved(f,a,b){
  if(!groundSupplyActive()||f.embarked||!Number.isFinite(f.groundSupply))return;
  if(!groundSupplyLand(f))return;f.groundMoved=true;
  const flying=groundWasFlying(f),km=Math.hypot(b.x-a.x,b.z-a.z)/GROUND_SCALE;
  const r=groundSupplyRules();
  const factor=f.groundKind==='was'?groundRuleSet().wasFlight.moveSupplyFactor[groundWasCruising(f)?'cruise':flying?'low':'ground']:1;
  groundSupplySpend(f,km*r.move*factor);
  if(!Number.isFinite(f.groundMorale)||f.groundRout)return;
  if(flying){f.groundMorale=Math.max(0,f.groundMorale-km*r.terrainMove['平地']);return;}
  const d=WOS_TERRAIN[op.ground],n=Math.max(1,Math.ceil(km/(d.meta.cellKm/4)));let spent=0;
  for(let i=0;i<n;i++){const t=(i+.5)/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,gx=groundMapX(x),gy=groundMapY(z),type=d.terrain.cells[Math.floor(gy/d.meta.cellKm)*d.terrain.cols+Math.floor(gx/d.meta.cellKm)]||'平地',road=groundRoadAt(gx,gy)||d.objects.roads.some(p=>groundDistance(gx,gy,p.points)<=groundRuleSet().capture.roadWidthKm/2),cover=groundForests.some(p=>Math.hypot(p.x-x,p.z-z)<=p.r)||d.objects.settlements.some(s=>groundInside(gx,gy,s.polygon));spent+=km/n*(r.terrainMove[type]||1)*(road?.5:cover?.75:1);}
  f.groundMorale=Math.max(0,f.groundMorale-spent);
}
function groundMoraleHit(f,amount,cover,morale,blast){
  const damage=amount*cover.h;
  if(!(amount>0))return damage;
  if(!groundSupplyActive())return damage;
  const r=groundSupplyRules();
  if(!blast)f.groundHitLeft=r.hitSeconds;
  f.groundSupplyCombatAt=gameSec;
  f.groundRest=0;
  if(!Number.isFinite(f.groundMorale))return damage;
  // 小隊数を含む隊の最大耐久で割る。カット率には打撃を受ける直前の士気を使う。
  const cut=r.moraleCut*Math.min(1,f.groundMorale/groundMoraleMax(f));
  const maxHp=f.groundMaxHp??f.n*f.hp;
  if(maxHp>0)groundMoraleLose(f,amount*cover.m*morale*r.moraleLoss*100/maxHp);
  return damage*(1-cut);
}
function groundMoraleBodyLoss(f){
  if(groundSupplyActive()&&Number.isFinite(f.groundMorale)){
    groundMoraleLose(f,groundMoraleMax(f)*groundSupplyRules().moraleBodyLoss/f.bodies0);
  }
}
function groundMoraleLose(f,amount){
  f.groundMorale=Math.max(0,f.groundMorale-amount);
  if(f.groundMorale===0&&f.hpPool>0&&!f.embarked&&!f.groundRout)groundRoutStart(f);
}
function groundForceRout(f){
  if(Number.isFinite(f.groundMorale))groundMoraleLose(f,f.groundMorale);
}
function groundRoutStart(f){
  if(groundStaticTarget(f))return;
  groundCancelWork(f);groundClearOrders(f);f.groundGiving=null;
  if(f.groundKind!=='was'){f.bandTo=null;f.bandLeft=0;}
  f.groundRout='routing';f.groundRoutRepath=0;f.groundRest=0;
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
  let best=groundNearestRoute(f,fleets.filter(t=>t!==f&&t.team===f.team&&t.alive&&!t.groundExited&&!t.embarked&&groundSupplyLand(t)&&!t.groundRout));
  if(!best)best=groundNearestRoute(f,groundSites.filter(s=>s.owner===f.team));
  if(!best){groundClearOrders(f);f.groundRout='regroup';f.groundRoutTarget=null;return;}
  f.groundRoutTarget=best.target;f.groundRoutRepath=r.routRepath;groundSupplyInternalMove(f,best.target.pos,best.path);
}
function groundSupplyCanGive(f,t){
  if(!groundSupplyActive()||!f||!t||f===t||f.groundExited||t.groundExited||f.groundKind!=='supply'||!f.alive||f.locked||f.embarked||f.groundRout||!t.alive||t.embarked||t.team!==f.team||!groundSupplyLand(t)||t.groundKind==='supply'||groundStaticTarget(t))return false;
  return true;
}
function groundSupplyStopMove(f){
  if(!f.order?.groundSupplyMove)return;
  f.order=null;dropArrow(f.arrow);f.arrow=null;
}
function groundSupplyCancelFocus(f){
  if(!f.groundGiving)return false;
  f.groundGiving=null;
  if(f.order?.groundSupplyMove==='focus')groundSupplyStopMove(f);
  f.groundSupplyCheckLeft=0;
  return true;
}
function groundSupplyCommand(list,t){
  const f=list.length===1?list[0]:null;if(!groundSupplyCanGive(f,t))return false;
  if(!npcIssuing&&typeof saveUndo==='function')saveUndo([f]);
  npcAutoPlayer([f]);groundCancelWork(f);groundClearOrders(f);f.groundGiving=t;f.groundSupplyCheckLeft=0;
  f.groundSupplyRetreat=null;
  groundClearAiming();groundSupplyMessage='補給先：'+t.name;
  if(op.groundDrill)groundDrillEvent('supplyFocus',f,t);
  return true;
}
function groundSupplyDemand(t,r){
  const max=groundSupplyUnitMax(t);
  if(t.groundSupply>=max)t.groundSupplyDemand=false;
  else if(t.groundSupply<max*r.giveStart)t.groundSupplyDemand=true;
  return t.groundSupplyDemand;
}
function groundSupplyNeeds(t,r,focus){
  return (focus?t.groundSupply<groundSupplyUnitMax(t):groundSupplyDemand(t,r))||t.groundMorale<groundMoraleUnitMax(t)*r.moraleGiveMax||
    (t.groundKind==='was'&&t.bodies?.some(b=>b.alive&&b.groundWasArmorSpent));
}
function groundWasRestockArmor(f){
  if(f.groundKind!=='was'||!f.bodies)return false;
  const cost=groundRuleSet().wasCombat.reactiveArmor.refillCost;
  let restored=false;
  for(const body of f.bodies){
    if(f.groundSupply<cost)break;
    if(!body.alive||!body.groundWasArmorSpent)continue;
    groundSupplySpend(f,cost);
    body.groundWasArmorSpent=false;
    restored=true;
  }
  return restored;
}
function groundSupplyBattalion(f){
  return f.team===0&&f.companyId&&groundOrg?.battalions.find(b=>b.companies.includes(f.companyId));
}
function groundSupplyPeers(f,battalion=groundSupplyBattalion(f)){
  return fleets.filter(t=>groundSupplyCanGive(f,t)&&(!battalion||battalion.companies.includes(t.companyId)));
}
function groundSupplyInReach(f,pos,r){
  const range=r.giveKm*GROUND_SCALE;
  if(groundDistanceTo(f,{pos})>range)return false;
  const path=groundPath(f.pos,pos,groundMoveKind(f),true,true,{bridgesOnly:true,shortest:true,maxKm:r.giveKm});
  return !!path&&groundPolyLength(path.points,range)<=range+1e-8;
}
function groundSupplyIdle(f,allowFront=false,allowNpc=false){
  const frontOrder=allowFront&&f.groundFrontOf&&f.order?.groundFrontId===f.groundFrontOf.id;
  return !f.locked&&!f.embarked&&!f.groundRout&&!f.groundBuilding&&!f.groundUnloading&&!f.pending&&!f.bandTo&&
    !f.queue?.length&&!f.groundPlan&&!f.groundAreaSalvo&&!f.groundVolley&&!f.groundBombRun&&
    (!f.order||f.order.groundSupplyMove||frontOrder||allowNpc&&f.order.groundSupplyNpcMove);
}
function groundSupplyStartTrip(f){
  if(f.groundKind!=='supply'||!f.alive||f.groundExited||f.groundSupply!==0||f.team===1&&groundTrainingEnemy(f)||
    f.groundSupplyTrip?.phase==='out'||f.groundSupplyTrip?.phase==='base'||!groundSupplyIdle(f,true))return;
  if(f.groundFrontOf)groundFrontRememberVia(f);
  if(f.order){f.order=null;dropArrow(f.arrow);f.arrow=null;}
  const range=groundSupplyRules().giveKm*GROUND_SCALE;
  const peers=groundSupplyBattalion(f)?[]:groundSupplyPeers(f).filter(t=>groundDistanceTo(f,t)<=range);
  f.groundSupplyTrip={phase:'out',site:null,peers};
  f.groundSupplyCheckLeft=0;
}
function groundSupplyMove(f,path,purpose,target=null){
  f.order={type:'move',dest:path.points.at(-1).clone(),path,groundSupplyMove:purpose,groundSupplyMoveTarget:target};
}
function groundSupplyNearSide(f,pos,km){
  const distance=groundDistanceTo(f,{pos});
  return distance?pos.clone().lerp(f.pos,Math.min(1,km*GROUND_SCALE/distance)):f.pos.clone();
}
function groundSupplyCenter(peers){
  if(!peers.length)return null;
  return peers.reduce((p,t)=>p.add(t.pos),new THREE.Vector3()).multiplyScalar(1/peers.length);
}
function groundSupplyApproach(f,dest,r,target=null){
  const kind=groundMoveKind(f),d=groundData(),cell=d.meta.cellKm,x=groundMapX(dest.x),y=groundMapY(dest.z);
  const points=[dest],cx=Math.floor(x/cell),cy=Math.floor(y/cell),nearby=[];
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)nearby.push(groundPoint((cx+i+.5)*cell,(cy+j+.5)*cell));
  points.push(...nearby.sort((a,b)=>groundDistanceTo({pos:a},{pos:dest})-groundDistanceTo({pos:b},{pos:dest})));
  for(const pos of points){
    if(!groundPass(groundMapX(pos.x),groundMapY(pos.z),kind))continue;
    if(groundDistanceTo(f,{pos})<1e-6)return null;
    if(target&&!groundSupplyInReach({...f,pos},target.pos,r))continue;
    const path=groundPath(f.pos,pos,kind);
    if(path)return path;
  }
  return null;
}
function groundSupplyFrontCombatAt(f){
  const battalion=groundSupplyBattalion(f);let last=-Infinity;
  for(const t of fleets){
    if(t.team!==f.team||!groundFrontlineUnit(t)||battalion&&!battalion.companies.includes(t.companyId))continue;
    const target=t.order?.type==='attack'?t.order.target:null;
    if(t.fireTarget?.alive||t.groundVolley||t.groundAreaSalvo||target?.alive&&groundSeenBy(t.team,target))return gameSec;
    last=Math.max(last,t.groundSupplyCombatAt??-Infinity);
  }
  return last;
}
function groundSupplyRetreatPath(f,r){
  const d=groundData(),cell=d.meta.cellKm*GROUND_SCALE,kind=groundMoveKind(f),at=f.pos;
  const dist2=(a,b)=>(a.x-b.x)**2+(a.z-b.z)**2;
  const current=[],remembered=[];
  for(const t of fleets){
    const contact=t.groundContacts?.[f.team];
    if(t.team===f.team||!contact)continue;
    if(groundSeenBy(f.team,t))current.push(contact.pos);
    else remembered.push(contact);
  }
  current.sort((a,b)=>dist2(a,at)-dist2(b,at));
  remembered.sort((a,b)=>b.at-a.at||dist2(a.pos,at)-dist2(b.pos,at));
  const enemy=current[0]||remembered[0]?.pos,home=groundSites.find(s=>s.id===op.groundHQ?.[f.team]&&s.owner===f.team)?.pos;
  let dx=enemy?at.x-enemy.x:0,dz=enemy?at.z-enemy.z:0;
  if(!dx&&!dz){const rear=home||f.home;dx=rear.x-at.x;dz=rear.z-at.z;}
  if(!dx&&!dz)return null;
  const length=Math.hypot(dx,dz);dx/=length;dz/=length;
  const search=r.retreatSearchKm*GROUND_SCALE,safe=r.retreatSafeKm*GROUND_SCALE,points=[];
  const eligible=(x,z)=>{
    const p={x,z};return (x-at.x)*dx+(z-at.z)*dz>=0&&dist2(p,at)<=search**2&&current.every(t=>dist2(p,t)>=safe**2);
  };
  const add=(x,z)=>{if(eligible(x,z))points.push({x,z,distance:dist2({x,z},at)});};
  if(groundTerrainCover(f))add(at.x,at.z);
  // 森の小さな遮蔽も拾うため、セルの中心に加えて木の遮蔽円の手前と中心を調べる。
  for(const tree of groundForests){
    const distance=Math.sqrt(dist2(tree,at));
    if(distance>search+tree.r)continue;
    const edge=distance>tree.r?(tree.r-1e-8)/distance:1;
    add(tree.x+(at.x-tree.x)*edge,tree.z+(at.z-tree.z)*edge);
    add(tree.x,tree.z);
  }
  const x0=groundMapX(at.x),y0=groundMapY(at.z),km=d.meta.cellKm;
  for(let row=Math.floor((y0-r.retreatSearchKm)/km);row<=Math.floor((y0+r.retreatSearchKm)/km);row++){
    const z=groundWorldZ((row+.5)*km);
    for(let col=Math.floor((x0-r.retreatSearchKm)/km);col<=Math.floor((x0+r.retreatSearchKm)/km);col++){
      const x=groundWorldX((col+.5)*km);
      if(eligible(x,z)&&groundTerrainCover({pos:{x,z}}))points.push({x,z,distance:dist2({x,z},at)});
    }
  }
  const pathTo=(x,z)=>{
    const gx=groundMapX(x),gy=groundMapY(z);
    if(groundPass(gx,gy,kind))return groundPath(at,groundPoint(gx,gy),kind);
    return null;
  };
  points.sort((a,b)=>a.distance-b.distance);
  for(const p of points){
    if(p.distance===0)return null; // すでに安全な遮蔽にいる。
    const path=pathTo(p.x,p.z);if(path)return path;
  }
  // 盤の端や水際では、同じ向きで通れる手前の地点を選ぶ。
  for(let distance=r.retreatFallbackKm*GROUND_SCALE;distance>0;distance-=cell){
    const path=pathTo(at.x+dx*distance,at.z+dz*distance);if(path)return path;
  }
  return null;
}
function groundSupplyRetreatStep(f,r){
  const old=f.groundSupplyRetreat,eligible=groundSupplyIdle(f,false,true)&&f.groundSupply>0&&!f.groundGiving&&!groundTrainingEnemy(f);
  const last=eligible?Math.max(old?.lastCombat??-Infinity,groundSupplyFrontCombatAt(f)):-Infinity;
  if(gameSec-last>=r.retreatQuietSec-1e-8){
    if(old){if(f.order?.groundSupplyMove==='retreat')groundSupplyStopMove(f);f.groundSupplyRetreat=null;f.groundSupplyCheckLeft=0;}
    return false;
  }
  const revision=groundBridgeRevision;
  f.groundSupplyRetreat=old||{lastCombat:last,revision,nextCheck:gameSec};
  f.groundSupplyRetreat.lastCombat=last;
  const retreat=f.groundSupplyRetreat,check=gameSec>=retreat.nextCheck-1e-8;
  const unsafe=check&&fleets.some(t=>t.team!==f.team&&groundSeenBy(f.team,t)&&t.groundContacts?.[f.team]&&
    groundDistanceTo(f,{pos:t.groundContacts[f.team].pos})<r.retreatSafeKm*GROUND_SCALE);
  if(check)retreat.nextCheck=gameSec+r.retreatCheckSec;
  if(!old||check&&(unsafe||f.order?.groundSupplyMove==='retreat'&&old.revision!==revision)){
    if(f.order){f.order=null;dropArrow(f.arrow);f.arrow=null;}
    const path=groundSupplyRetreatPath(f,r);
    if(path)groundSupplyMove(f,path,'retreat');
    f.groundSupplyRetreat.revision=revision;f.groundSupplyCheckLeft=0;
  }
  return true;
}
function groundSupplyTripStep(f,r,refresh){
  const trip=f.groundSupplyTrip;
  if(trip.front&&trip.front===f.groundFrontOf){
    if(!f.order&&!f.groundFrontAway&&trip.front.slots.some(s=>s.f===f))f.groundSupplyTrip=null;
    return;
  }
  if(!groundSupplyIdle(f))return;
  if(trip.phase==='return'){
    if(f.groundFrontOf){trip.front=f.groundFrontOf;return;}
    if(trip.started&&!f.order){f.groundSupplyTrip=null;return;}
    if(!refresh)return;
    const battalion=groundSupplyBattalion(f);
    const peers=battalion?groundSupplyPeers(f,battalion):trip.peers.filter(t=>groundSupplyCanGive(f,t));
    const center=groundSupplyCenter(peers),cell=groundData().meta.cellKm*GROUND_SCALE;
    if(center&&f.order?.groundSupplyMove==='return'&&f.order.path.bridgeRevision===groundBridgeRevision&&groundDistanceTo({pos:center},{pos:f.order.groundSupplyMoveTarget})<cell)return;
    const path=center&&groundSupplyApproach(f,groundSupplyNearSide(f,center,r.followKm),r);
    if(path){groundSupplyMove(f,path,'return',center);trip.started=true;}
    else {groundSupplyStopMove(f);f.groundSupplyTrip=null;}
    return;
  }
  const connected=s=>s?.owner===f.team&&!s.supplyContested&&groundSupplyAt({team:f.team,pos:s.pos}).rate>0;
  const at=groundSupplyAt(f);
  if(at.rate>0&&connected(at.site)){
    groundSupplyStopMove(f);trip.phase='base';trip.site=at.site;
    if(f.groundSupply>=groundSupplyUnitMax(f)){
      trip.phase='return';
      f.groundSupplyCheckLeft=0;
      trip.front=f.groundFrontOf; // 前線の空いていた持ち場へ既存の命令で復帰する。
    }
    return;
  }
  trip.phase='out';
  if(connected(trip.site)&&f.order?.groundSupplyMove==='out'&&f.order.path.bridgeRevision===groundBridgeRevision)return;
  groundSupplyStopMove(f);
  if(!refresh)return;
  let best=null;
  for(const s of groundSites){
    if(!connected(s))continue;
    const path=groundPath(f.pos,s.pos,groundMoveKind(f),false,true,{shortest:true});
    if(!path)continue;
    const length=groundPolyLength(path.points);
    if(!best||length<best.length)best={site:s,path,length};
  }
  trip.site=best?.site||null;
  if(best)groundSupplyMove(f,best.path,'out');
}
function groundSupplyPlan(f,dt,r){
  if(f.groundGiving&&(!groundSupplyCanGive(f,f.groundGiving)||!groundSupplyNeeds(f.groundGiving,r,true)))groundSupplyCancelFocus(f);
  if(f.groundSupplyTrip)f.groundSupplyRetreat=null;
  const retreat=!f.groundSupplyTrip&&groundSupplyRetreatStep(f,r);
  const focus=f.groundGiving||null;
  f.groundSupplyCheckLeft=(f.groundSupplyCheckLeft||0)-dt;
  const revision=groundBridgeRevision,old=f.groundSupplyTargets;
  const refresh=f.groundSupplyCheckLeft<=1e-8||old?.focus!==focus||old?.revision!==revision;
  if(refresh){
    f.groundSupplyCheckLeft=r.giveRepath;
    f.groundSupplyTargets={focus,revision,targets:[]};
  }
  if(f.groundSupplyTrip){groundSupplyTripStep(f,r,refresh);return;}
  const moving=f.order?.groundSupplyMove;
  // 前線の移動はそのまま。集中の接近だけは通常の自動追従と区別する。
  if(!groundSupplyIdle(f)||f.groundSupply<=0||f.team===1&&groundTrainingEnemy(f))return;
  if(!refresh)return;
  const battalion=groundSupplyBattalion(f);
  const peers=focus?[focus]:groundSupplyPeers(f,battalion);
  const range=r.giveKm*GROUND_SCALE,targets=peers.filter(t=>groundSupplyNeeds(t,r,!!focus)&&groundSupplyInReach(f,t.pos,r));
  f.groundSupplyTargets.targets=targets;
  if(retreat)return;
  if(!focus&&(f.groundFrontOf||!battalion)){groundSupplyStopMove(f);return;}
  if(moving){
    const t=f.order.groundSupplyMoveTarget;
    if(f.order.path.bridgeRevision===revision){
      if(moving==='rear'){
        const center=groundSupplyCenter(peers);
        if(center&&groundDistanceTo({pos:center},{pos:t})<groundData().meta.cellKm*GROUND_SCALE)return;
      }else if(t&&peers.includes(t)&&groundSupplyNeeds(t,r,!!focus)&&groundSupplyInReach({...f,pos:f.order.dest},t.pos,r))return;
    }
    groundSupplyStopMove(f);
  }
  // 接近した相手には停車して配り、遠い部隊の間を往復するだけになるのを防ぐ。
  if(targets.includes(f.groundSupplyServing))return;
  f.groundSupplyServing=null;
  const far=focus?[focus]:peers.filter(t=>groundSupplyDemand(t,r)&&groundDistanceTo(f,t)>range);
  far.sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b));
  if(far.length&&!targets.includes(far[0])){
    const t=far[0];
    const path=groundSupplyApproach(f,groundSupplyNearSide(f,t.pos,r.approachKm),r,t);
    if(path)groundSupplyMove(f,path,focus?'focus':'follow',t);
    return;
  }
  if(!focus&&peers.length&&peers.every(t=>groundDistanceTo(f,t)>range)){
    const center=groundSupplyCenter(peers);
    const path=groundSupplyApproach(f,groundSupplyNearSide(f,center,r.followKm),r);
    if(path)groundSupplyMove(f,path,'rear',center);
  }
}
function groundSupplyGive(dt,netGains){
  const r=groundSupplyRules(),used=new Set(),trucks=fleets.filter(f=>f.alive&&!f.groundExited&&f.groundKind==='supply');
  for(const f of trucks){
    f.groundSupplyGiving=false;f.groundMoraleGiving=false;f.groundStockGiving=false;f.groundSupplyCount=0;
    groundSupplyPlan(f,dt,r);
  }
  // 手動・NPCの集中は自動分配より先に処理する。
  trucks.sort((a,b)=>Number(!!b.groundGiving)-Number(!!a.groundGiving));
  for(const f of trucks){
    if(f.order||f.groundMoved||f.groundSupplyTrip||f.groundSupply<=0||!groundSupplyIdle(f))continue;
    const focus=f.groundGiving;
    const targets=f.groundSupplyTargets.targets.filter(t=>!used.has(t)&&groundSupplyCanGive(f,t)&&groundSupplyNeeds(t,r,!!focus)&&groundDistanceTo(f,t)<=r.giveKm*GROUND_SCALE);
    if(!targets.length)continue;
    const share=r.give*dt/targets.length,received=new Set();
    // 先に全隊の物資を配り、その残りで士気を回復する。
    for(const t of targets){
      if(!focus&&!t.groundSupplyDemand)continue;
      const max=groundSupplyUnitMax(t);
      const extra=Math.min(share-(netGains.get(t)||0),max-t.groundSupply,f.groundSupply);
      if(extra<=0)continue;
      t.groundSupply+=extra;f.groundSupply-=extra;f.groundSupplyGiven+=extra;t.groundSupplyReceived+=extra;
      if(t.groundSupply>=max)t.groundSupplyDemand=false;
      f.groundStockGiving=true;received.add(t);
      if(op.groundDrill&&focus)groundDrillEvent('supplyFocusGain',f,{target:t,amount:extra});
    }
    for(const t of targets)if((received.has(t)||f.groundSupply>0)&&groundWasRestockArmor(t))received.add(t);
    for(const t of targets){
      const morale=Math.min(share,groundMoraleUnitMax(t)*r.moraleGiveMax-t.groundMorale,f.groundSupply/r.moraleGiveCost);
      if(morale<=0)continue;
      t.groundMorale+=morale;f.groundSupply-=morale*r.moraleGiveCost;f.groundMoraleGiving=true;received.add(t);
    }
    // 割り算の誤差で0にならず、拠点へ戻り始めないのを防ぐ。
    if(f.groundSupply<1e-6)f.groundSupply=0;
    for(const t of received){used.add(t);t.groundSupplySource={unit:f};}
    f.groundSupplyCount=received.size;f.groundSupplyGiving=!!received.size;
    if(focus&&!groundSupplyNeeds(focus,r,true))groundSupplyCancelFocus(f);
  }
}
function groundAirStep(f,dt){
  const r=groundSupplyRules();
  if(f.groundAirState==='base'){
    f.groundAirLeft-=dt;if(f.groundAirLeft<=0){f.groundSupply=groundSupplyUnitMax(f);f.groundAirState='return';const task=f.groundAirTask;groundSupplyInternalMove(f,f.groundAirResume);f.groundAirTask=task;}
    return;
  }
  groundSupplySpend(f,r.airIdle*dt);
  if(!f.groundAirState&&f.groundSupply<=r.airReturn){
    const task=groundCopyAirTask(f);f.groundAirResume=f.pos.clone();const base=groundSites.find(s=>s.id===op.groundHQ[f.team]&&s.owner===f.team);f.groundAirState='out';groundSupplyInternalMove(f,base?.pos||f.home);f.groundAirTask=task;
  }
  if(f.groundAirState&&!f.order){
    if(f.groundAirState==='out'){f.groundAirState='base';f.groundAirLeft=r.airBase;f.fireTarget=null;}
    else {const task=f.groundAirTask;f.groundAirState=null;f.groundAirTask=null;groundRestoreAirTask(f,task);}
  }
}
function groundSupplyAI(f){
  if(f.team!==1||!groundSupplyLand(f)||f.groundKind==='supply'||f.groundRout||f.groundSupplyAITimer>0)return;
  f.groundSupplyAITimer=groundSupplyRules().routRepath;
  const r=groundSupplyRules();
  if(f.groundRecover){if(f.groundSupply>=r.aiResume&&f.groundMorale>=r.aiResume){f.groundRecover=false;groundSupplyInternalMove(f,f.groundRecoverPost);return;}if(f.order)return;}
  else if(f.groundSupply>r.aiSupply&&f.groundMorale>r.aiMorale)return;
  const places=groundSites.filter(s=>s.owner===f.team&&!s.supplyContested&&(f.groundMorale<=r.aiMorale||groundSupplyAt({...f,pos:s.pos}).rate>0));
  const best=groundNearestRoute(f,places);if(!best)return;
  if(!f.groundRecover)f.groundRecoverPost=f.post.clone();f.groundRecover=true;
  if(groundDistanceTo(f,best.target)>GROUND_SCALE)groundSupplyInternalMove(f,best.target.pos,best.path);
}
function groundSupplyBefore(dt){
  if(!groundSupplyActive())return;
  if(op.groundDrill&&!groundSites.some(s=>s.id==='B'))groundSupplyDrillSetup(!!tutorial?.skipped);
  if(!groundSupplyNet)groundSupplyBuild();
  for(const f of fleets){if(!f.alive||f.groundExited||f.embarked||groundStaticTarget(f)||(typeof groundScriptDescending==='function'&&groundScriptDescending(f)))continue;
    if((groundSupplyLand(f)||groundSupplyAir(f))&&!Number.isFinite(f.groundSupply))groundSupplyInitUnit(f);
    f.groundHitLeft=Math.max(0,(f.groundHitLeft||0)-dt);f.groundMoved=false;f.groundSupplyAITimer=Math.max(0,(f.groundSupplyAITimer||0)-dt);
    if(groundSupplyAir(f))groundAirStep(f,dt);
    if(groundSupplyLand(f)){if(f.groundMorale<=0&&!f.groundRout)groundRoutStart(f);groundRoutStep(f,dt);groundSupplyStartTrip(f);if(!op.npc?.[f.team]||op.groundDrill)groundSupplyAI(f);}
  }
}
// 攻撃・速度の倍率と棒は、補給限界の超過を掛ける前の最大に対して測る。敗走・再集結も従来の数で判定する。
function groundMoraleMax(f){const r=groundSupplyRules();return r.max*(r.moraleMax?.[f?.groundKind]??1);}
function groundSupplyCapFactor(f){return f.team===0?1-groundSupplyPenalty/100:1;}
function groundSupplyUnitMax(f){return groundSupplyRules().max*groundSupplyCapFactor(f);}
function groundMoraleUnitMax(f){return groundMoraleMax(f)*groundSupplyCapFactor(f);}
// 味方の占領色は上限まで、それ以外は上限の80%。現在値を切り下げずに回復を止める。
function groundMoraleCap(f,at){return groundMoraleUnitMax(f)*(at.owner===f.team&&!at.contested?1:.8);}
function groundSupplyAfter(dt){
  for(const f of fleets)f.groundSupplySource=null;
  if(!groundSupplyActive())return;
  groundSupplyRoadCapture(dt);groundSupplyRefresh();const r=groundSupplyRules(),netGains=new Map(),d=WOS_TERRAIN[op.ground];
  for(const f of fleets){if(!f.alive||f.groundExited||f.embarked||!groundSupplyLand(f))continue;
    const flying=groundWasFlying(f);
    if(flying){
      if(!f.groundMoved)groundSupplySpend(f,groundRuleSet().wasFlight.idleSupplyPerSec[groundWasCruising(f)?'cruise':'low']*dt);
      // 同じステップで補給を受けても、移動や停止で使い切った時点の着陸を続ける。
      if(!groundScriptDescending(f))groundWasAutoLand(f);
    }
    groundSupplyDemand(f,r);
    groundSupplyStartTrip(f);
    const at=groundSupplyAt(f);f.groundSupplyRate=at.rate;
    const before=f.groundSupplyWait;f.groundSupplyWait=at.rate?before+dt:0;
    if(at.site&&at.rate>0&&f.groundSupplyWait>r.refillWait&&groundWasRestockArmor(f))f.groundSupplySource={site:at.site};
    const gain=Math.min(groundSupplyUnitMax(f)-f.groundSupply,r.refill*(at.site?r.siteRefill??1:1)*at.rate*Math.min(dt,Math.max(0,f.groundSupplyWait-r.refillWait)));
    f.groundSupply+=gain;netGains.set(f,gain);
    if(f.groundSupply>=groundSupplyUnitMax(f))f.groundSupplyDemand=false;
    if(gain>0)f.groundSupplySource=at.site?{site:at.site}:{edge:at.edge};
    if(f.groundBuilding)groundSupplySpend(f,r.build*dt);
    const own=at.owner===f.team&&!at.contested;
    const gx=groundMapX(f.pos.x),gy=groundMapY(f.pos.z),type=d.terrain.cells[Math.floor(gy/d.meta.cellKm)*d.terrain.cols+Math.floor(gx/d.meta.cellKm)];
    if(!flying&&!own&&!f.groundRout&&r.terrainIdle.includes(type))f.groundMorale=Math.max(0,f.groundMorale-r.idleMorale*dt);
    const restBefore=f.groundRest;f.groundRest=!at.contested&&!f.groundMoved&&f.groundRout!=='routing'?restBefore+dt:0;
    const moraleCap=groundMoraleCap(f,at);
    if(f.groundRest>r.restWait&&f.groundMorale<moraleCap)f.groundMorale=Math.min(moraleCap,f.groundMorale+r.moraleRefill*(at.site&&own?r.siteMoraleRefill??1:1)*Math.min(dt,f.groundRest-r.restWait));
    if(f.groundRout==='regroup'&&f.groundMorale>=r.rally)f.groundRout=null;
    if(f.groundMorale<=0&&!f.groundRout)groundRoutStart(f);
  }
  groundSupplyGive(dt,netGains);
  for(const f of fleets)groundSupplyStartTrip(f);
}
function groundSupplyStatus(f){
  if(!groundSupplyActive())return '訓練前';
  if(f.groundAirState)return {out:'補給帰投中',base:'基地補給中',return:'戦場へ復帰中'}[f.groundAirState];
  if(f.groundRout)return f.groundRout==='routing'?'敗走中・操作不可':'再集結・移動と搭乗のみ';
  if(f.groundSupplyTrip)return {out:'補給に戻る途中',base:'拠点で補給中',return:'大隊へ戻る途中'}[f.groundSupplyTrip.phase];
  if(f.groundGiving)return '集中補給：'+f.groundGiving.name;
  if(f.groundSupplyGiving)return f.groundStockGiving?`大隊へ補給中（${f.groundSupplyCount}隊）`:'士気を回復中';
  if(!groundSupplyLand(f))return groundSupplyAir(f)?'飛行中':'対象外';
  const at=groundSupplyAt(f),capture=at.edge?.progress[f.team]||0;return (capture&&at.owner!==f.team?`道路占領 ${Math.floor(capture/groundRoadCaptureSeconds(at.edge)*100)}% / `:'')+(at.rate===1?'本営接続':at.rate===.5?'競合・半速補給':'接続なし');
}
function groundSupplyReadings(list){
  return [['groundMorale','士気'],['groundSupply','補給']].flatMap(([key,label])=>{
    const values=list.filter(f=>Number.isFinite(f[key])).map(f=>Math.max(0,Math.min(100,100*f[key]/(key==='groundMorale'?groundMoraleMax(f):groundSupplyRules().max))));
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
  const penalty=groundSupplyPenalty?`補給限界 超過 −${groundSupplyPenalty}% / `:'';
  const detail=groundSupplyAiming?'集中補給する味方中隊をクリック（Escで取消）':`${hq?'本営：'+hq.name:'本営なし'} / 接続${counts[0]} 半速${counts[1]} 切断${counts[2]}${list.length===1?' / '+groundSupplyStatus(list[0]):''}`;
  status.textContent=penalty+detail;
}
document.querySelectorAll('#groundSupply').forEach(b=>b.addEventListener('click',()=>{
  const list=orderTargets();if(list.length!==1||list[0].groundKind!=='supply'||!groundCommandAllowed(list[0],'give'))return;
  const aiming=!groundSupplyAiming;groundClearAiming();groundSupplyAiming=aiming;groundHud();
}));
// 既存の配置画面から利用。地上の配置では円外へ押し出さない。
function groundSupplyPlace(list,p){
  const hq=groundSites.find(s=>s.id===op.groundHQ?.[0]&&s.owner===0);if(!hq||!list.length||list.some(f=>f.embarked||groundMoveKind(f)==='air'||f.groundKind==='sea'))return false;
  const lead=list[0],mv=p.clone().sub(lead.pos),positions=list.map(f=>f.pos.clone().add(mv));
  if(positions.some((p,i)=>groundDistanceTo({pos:p},hq)>hq.radiusKm*GROUND_SCALE||!groundPass(groundMapX(p.x),groundMapY(p.z),groundMoveKind(list[i]))))return false;
  list.forEach((f,i)=>{f.pos.copy(positions[i]);f.pos.y=groundUnitHeight(f);f.home.copy(f.pos);f.post.copy(f.pos);groundClearOrders(f);for(const s of f.ships)s.pos.copy(f.pos);if(op.groundDrill)groundDrillEvent('supplyPlace',f,p);});return true;
}
function groundSupplyTile(f){
  return '<span class="ground-tile-meters">'+groundSupplyMeters([f])+'</span>'+(f.groundKind==='scout'?'<small class="ground-drone-stock"></small>':'');
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
  for(const f of list){const p=slots.find(p=>!used.has(p)&&groundPass(groundMapX(p.x),groundMapY(p.z),groundMoveKind(f)));if(!p){groundSupplyMessage='本営内に配置できる場所が足りません';deploying=true;deployEl.hidden=false;deployEl.querySelector('p').textContent=groundSupplyMessage;document.getElementById('deployGo').disabled=true;return;}used.add(p);plan.push([f,p]);}
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
  if(s.unit)return groundSupplyCanGive(s.unit,f)&&s.unit.groundSupplyGiving?s.unit.pos:null;
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
  const panel=document.getElementById('groundSupplyStatus')?.parentElement,net=groundSupplyNet;
  if(!net||!panel?.open){groundSupplyMapClear();return;}
  if(groundSupplyMap?.key!==net.key){
    groundSupplyMapClear();groundSupplyMap={key:net.key,lines:[],labels:[]};
    for(const rate of [1,.5,0]){
      const edges=net.edges.filter(e=>!e.circle&&e.owner===0&&e.rates[0]===rate),points=[];
      for(const e of edges)for(let i=1;i<e.path.length;i++)for(const [x,y] of [e.path[i-1],e.path[i]]){const p=groundPoint(x,y);p.y+=.25;points.push(p);}
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
  if(focus){const x=groundMapX(focus.pos.x),y=groundMapY(focus.pos.z);edges.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));}
  for(const e of edges){
    const p=proj(groundPoint(e.x,e.y).add(new THREE.Vector3(0,1,0)));
    if(p.z>1||p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight||placed.some(q=>Math.abs(q.x-p.x)<170&&Math.abs(q.y-p.y)<28))continue;
    placed.push(p);let el=groundRoadLabels[count++];
    if(!el){el=document.createElement('div');el.className='ground-road-label';labelsEl.appendChild(el);groundRoadLabels.push(el);}
    el.hidden=false;el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
    el.textContent='道路 · '+groundCaptureReadout(e,groundRoadCaptureSeconds(e,e.knownOwner));
    el.style.color=e.knownContested?'#e2c58a':e.knownOwner===1?'#ff998b':'#8bdfff';
  }
  groundRoadLabels.slice(count).forEach(el=>el.hidden=true);
}
