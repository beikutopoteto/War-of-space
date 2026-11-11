/* 地上と指揮官の橋渡し。km座標で状況を作り、通常の命令だけを発行する。 */
let npcGroundState=null;
function npcGroundActive(team){return !!(op.ground&&!op.groundDrill&&op.npc?.[team]);}
function npcGroundReset(){
  for(const f of npcGroundState?.synced||[])f.syncSpeed=null;
  npcGroundState=null;
}
function npcGroundPower(f){
  const hp=Math.max(0,Math.min(1,f.hpPool/Math.max(1,f.groundMaxHp||f.n*f.hp)));
  return (window.WOS_DATA.npc.power.ground[f.groundKind]??1)*hp;
}
function npcGroundFree(f){
  return f.alive&&f.hpPool>0&&!f.locked&&!f.embarked&&!f.groundRout&&!f.groundRecover&&!f.groundAirState&&!f.groundBuilding&&!f.groundUnloading&&
    !['board','bridge','land'].includes(f.order?.type)&&groundCommandAllowed(f,'move');
}
function npcGroundInit(){
  npcGroundReset();
  if(!op.ground||op.groundDrill||!op.npc)return;
  const N=window.WOS_DATA.npc,commanders=new Map();
  for(const [key,cfg] of Object.entries(op.npc)){
    const team=Number(key),D=N.doctrines[cfg.doctrine],L=N.levels[cfg.level];
    if(![0,1].includes(team)||!D||!L)continue;
    const c=npcCommander({team,side:cfg.side,doctrine:D,level:L,seed:(op.npcSeed??1)+team*7});
    c.nextThink=gameSec+team*L.think/2;commanders.set(team,c);
    for(const f of fleets)if(f.team===team)f.stance='engage';
  }
  npcGroundState={sites:groundSites,commanders,initial:new Map(groundSites.map(s=>[s.id,s.owner])),last:new Map(),links:null,linkKey:null,
    holds:new Map(),modes:new Map(),synced:new Set(),timings:{count:0,total:0,max:0}};
}
// 道路の結節から探索し、別の拠点に到着したらそこで止める。開通路を優先し、閉鎖路も記録する。
function npcGroundLinks(){
  const state=npcGroundState,net=groundSupplyNet;if(!net)return [];
  const key=net.edges.map(e=>e.open===false?'x':'o').join('');
  if(state.links&&state.linkNet===net&&state.linkKey===key)return state.links;
  const at=new Map();for(const [s,i] of net.sites){if(!at.has(i))at.set(i,[]);at.get(i).push(s);}
  const result=new Map();
  for(const [source,start] of net.sites)for(const onlyOpen of [false,true]){
    const dist=new Map([[start,0]]),done=new Set();
    for(;;){
      let i=null,best=Infinity;for(const [j,d] of dist)if(!done.has(j)&&d<best){i=j;best=d;}
      if(i===null)break;done.add(i);
      const targets=(at.get(i)||[]).filter(s=>s!==source);
      if(targets.length){for(const target of targets){const k=[source.id,target.id].sort().join(':');
        if(!result.has(k)||onlyOpen)result.set(k,{a:source.id,b:target.id,len:best,open:onlyOpen});}continue;}
      for(const ei of net.nodes[i].edges){const e=net.edges[ei];if(onlyOpen&&e.open===false)continue;
        const j=e.a===i?e.b:e.a,a=net.nodes[i],b=net.nodes[j],d=best+Math.hypot(a.x-b.x,a.y-b.y);
        if(d<(dist.get(j)??Infinity))dist.set(j,d);
      }
    }
  }
  state.linkNet=net;state.linkKey=key;return state.links=[...result.values()];
}
function npcGroundSituation(c){
  const team=c.team,N=window.WOS_DATA.npc,max=groundSupplyRules().max;
  const relative=owner=>owner===team?'own':owner==null?'none':'foe';
  const zones=groundSites.map(s=>{
    const seen=s.owner===team||groundPointSeenBy(team,s.pos),base=s.id===op.groundHQ?.[team]?'own':s.id===op.groundHQ?.[1-team]?'foe':null;
    return {id:s.id,x:s.x,z:s.y,r:s.radiusKm,owner:seen?relative(s.owner):null,seen,known:relative(npcGroundState.initial.get(s.id)),
      base,goal:base==='foe',final:base==='foe',supply:s.owner===team?groundSupplyAt({pos:s.pos,team}).rate:0};
  });
  const units=fleets.filter(f=>f.team===team&&f.alive&&f.hpPool>0).map(f=>({id:f.id,role:N.roles.ground[f.groundKind]||'line',power:npcGroundPower(f),
    x:groundMapX(f.pos.x),z:groundMapY(f.pos.z),speed:speedOf(f)/GROUND_SCALE,health:Math.max(0,f.hpPool/(f.groundMaxHp||f.n*f.hp)),
    canHold:groundCanCapture(f),morale:(f.groundMorale??max)/max,supply:(f.groundSupply??max)/max,free:npcGroundFree(f)&&f.groundKind!=='sea',
    engaged:!!(f.fireTarget||f.order?.type==='attack'||f.groundHitLeft>0)}));
  // 死亡・現在の耐久・現在位置を視界外から読まない。最後に見たときの記録だけ。
  const contacts=[];
  for(const f of fleets){if(f.team===team||!f.alive)continue;const k=f.groundContacts?.[team];if(!k||k.power===undefined)continue;
    contacts.push({id:f.id,x:groundMapX(k.pos.x),z:groundMapY(k.pos.z),power:k.power,role:k.role,age:f.groundVisible?.[team]?0:Math.max(0,gameSec-k.at)});
  }
  const sit={time:gameSec,zones,links:npcGroundLinks(),units,contacts,goal:{type:'seize'}};
  if(c.side==='ally'){
    // 明示の先頭拠点を優先。未指定なら既知の自軍拠点まで（最終目標は頭でも除外する）。
    const home=zones.find(z=>z.base==='own'),own=zones.filter(z=>z.owner==='own');
    sit.lead={front:op.npc[team].lead?.front??own.sort((a,b)=>Math.hypot(b.x-(home?.x||0),b.z-(home?.z||0))-Math.hypot(a.x-(home?.x||0),a.z-(home?.z||0)))[0]?.id};
  }
  return sit;
}
// 隊形の位置が川・海・盤外なら、最も近い通行可能セルへ移す。高度段はそのまま。
function npcGroundPassPoint(f,x,y,region=()=>true){
  const kind=groundMoveKind(f),d=groundDimensions(),cell=d.data.meta.cellKm;
  const valid=(a,b)=>a>=0&&b>=0&&a<=d.widthKm&&b<=d.heightKm&&region(a,b)&&groundPass(a,b,kind);
  if(valid(x,y)){const p=groundPoint(x,y);p.y=f.pos.y;return p;}
  const cx=Math.floor(Math.max(0,Math.min(d.widthKm-cell,x))/cell),cy=Math.floor(Math.max(0,Math.min(d.heightKm-cell,y))/cell);
  let best=null,dist=Infinity;
  for(let r=0;r<=Math.ceil(Math.max(d.widthKm,d.heightKm)/cell);r++){
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
      const a=(cx+dx+.5)*cell,b=(cy+dy+.5)*cell,v=Math.hypot(a-x,b-y);
      if(v<dist&&valid(a,b)){best=[a,b];dist=v;}
    }
    if(best&&r*cell>dist+cell*2)break;
  }
  if(!best)return null;const p=groundPoint(...best);p.y=f.pos.y;return p;
}
function npcGroundDestination(c,sit,k,x,index,count){
  const z=sit.zones.find(z=>z.id===k.zone),from=sit.zones.find(z=>z.id===k.from)||sit.zones.find(z=>z.base==='own')||z;
  const f=fleets.find(f=>f.id===x.id),u=sit.units.find(u=>u.id===x.id);if(!z||!f||!u)return null;
  const len=Math.hypot(z.x-from.x,z.z-from.z),dx=len?(z.x-from.x)/len:1,dy=len?(z.z-from.z)/len:0;
  const ranges=groundFireRanges(f),range=(ranges.indirect?.max||ranges.direct||ranges.ground||ranges.air||f.range||0)/GROUND_SCALE;
  // 後方距離の固定値は仮（docs/menu.md）。
  let region=null,px=z.x,py=z.z,back=0,offset=(index-(count-1)/2)*1.5;
  const capture=groundSites.find(s=>s.id===z.id).captureRadius/GROUND_SCALE;
  if(k.type==='seize'&&k.stage==='assemble'){px=from.x;py=from.z;back=-Math.min(1,from.r*.25);}
  else if(k.type==='fix')back=Math.max(capture+1,range*.8);
  else if(k.type==='recon')back=groundSightRange(f)/GROUND_SCALE*.8;
  else if(k.type==='hold'){
    region=(a,b)=>Math.hypot(a-z.x,b-z.z)<=(u.canHold?capture:1);
    if(u.canHold){
      const holders=k.units.filter(x=>sit.units.find(u=>u.id===x.id)?.canHold),at=holders.findIndex(h=>h.id===x.id);
      offset=(at-(holders.length-1)/2)*Math.min(1.5,capture*1.6/Math.max(1,holders.length-1));
    }else {back=.6;offset=(index-(count-1)/2)*Math.min(1.5,1.6/Math.max(1,count-1));}
  }
  else if(k.type==='seize'&&(k.stage==='advance'&&x.as==='main'||k.stage==='assault'&&!npcGroundArmed(f))){back=z.r+1;region=(a,b)=>Math.hypot(a-z.x,b-z.z)>z.r;}
  else if(k.type==='seize'&&k.stage==='assault'&&!(x.as==='support'&&u.role==='fires')){
    region=(a,b)=>Math.hypot(a-z.x,b-z.z)<=(u.canHold?capture:1);
    const limit=u.canHold?capture*.8:.8;
    offset=(index-(count-1)/2)*Math.min(1.5,2*limit/Math.max(1,count-1));
  }
  else if(x.as==='support')back=u.role==='fires'?range*.7:u.role==='support'?4:u.role==='screen'?2:1;
  else if((k.type==='seize'||k.type==='cut')&&u.canHold){
    offset=(index-(count-1)/2)*Math.min(1.5,capture*1.6/Math.max(1,count-1));
  }
  // 占拠担当を除き横一列。占拠担当は必ず小さな占拠円内に置く。
  return npcGroundPassPoint(f,px-dx*back-dy*offset,py-dy*back+dx*offset,region||undefined);
}
// 開いている道路の最短木。辺の所有変更では作り直さず、閉鎖・開通と始点を鍵にする。
function npcGroundRoadTree(site){
  const state=npcGroundState,net=groundSupplyNet,start=net?.sites.get(site);if(start===undefined)return null;
  const key=net.edges.map(e=>e.open===false?'x':'o').join('');
  if(state.roadNet!==net||state.roadKey!==key){state.roadNet=net;state.roadKey=key;state.roadTrees=new Map();}
  if(state.roadTrees.has(start))return state.roadTrees.get(start);
  const dist=new Map([[start,0]]),prev=new Map(),queue=[[start,0]];
  while(queue.length){
    queue.sort((a,b)=>b[1]-a[1]);const [i,d]=queue.pop();if(d!==dist.get(i))continue;
    for(const ei of net.nodes[i].edges){const e=net.edges[ei];if(e.open===false)continue;
      const j=e.a===i?e.b:e.a,a=net.nodes[i],b=net.nodes[j],v=d+Math.hypot(a.x-b.x,a.y-b.y);
      if(v<(dist.get(j)??Infinity)){dist.set(j,v);prev.set(j,{i,ei});queue.push([j,v]);}
    }
  }
  const path=target=>{let j=net.sites.get(target);if(!dist.has(j))return [];const out=[];
    while(j!==start){const p=prev.get(j);out.unshift(net.edges[p.ei]);j=p.i;}return out;};
  const tree={dist,path};state.roadTrees.set(start,tree);return tree;
}
function npcGroundRoadUnit(f){return npcGroundFree(f)&&groundCanCaptureRoad(f)&&!['air','sea'].includes(groundMoveKind(f));}
function npcGroundRoadPoint(f,e){
  // 中点が通れない兵科には任せない。近傍補正で道路帯から外れるのを防ぐ。
  if(!groundPass(e.x,e.y,groundMoveKind(f)))return null;
  const p=groundPoint(e.x,e.y);p.y=f.pos.y;return p;
}
function npcGroundRoadOrders(c,sit,plan){
  const state=npcGroundState,overrides=new Map(),net=groundSupplyNet;if(!net)return overrides;
  if(!state.roadWork)state.roadWork=new Map();
  let work=state.roadWork.get(c.team);
  const visible=sit.contacts.some(e=>e.age===0),byId=new Map(fleets.map(f=>[f.id,f]));
  const eligible=plan.tasks.filter(k=>k.type==='reserve'||k.type==='hold'&&k.stage==='wait');
  const candidates=eligible.flatMap(k=>k.units.map(x=>({k,f:byId.get(x.id)}))).filter(({f})=>f&&npcGroundRoadUnit(f));
  if(work&&(visible||!candidates.some(({f})=>f.id===work.id))){state.last.delete(work.id);state.roadWork.delete(c.team);work=null;}
  if(!visible){
    const home=groundSites.find(s=>s.id===op.groundHQ?.[c.team]&&s.owner===c.team),tree=home&&npcGroundRoadTree(home),edges=new Set();
    if(tree)for(const s of groundSites.filter(s=>s.owner===c.team)){
      const path=tree.path(s);
      // 所有を知っている敵拠点を越して補給路を作らない。
      if(path.some(e=>e.circle&&e.circle.owner!==c.team))continue;
      for(const e of path)if(!e.circle&&e.open!==false&&e.owner!==c.team)edges.add(e);
    }
    const ordered=[...edges].sort((a,b)=>Math.min(tree.dist.get(a.a),tree.dist.get(a.b))-Math.min(tree.dist.get(b.a),tree.dist.get(b.b)));
    if(!work&&ordered.length){const candidate=candidates.find(({f})=>npcGroundRoadPoint(f,ordered[0]));
      if(candidate){work={id:candidate.f.id,origin:candidate.f.pos.clone()};state.roadWork.set(c.team,work);}}
    if(work){const f=byId.get(work.id),edge=ordered[0],dest=edge?npcGroundRoadPoint(f,edge):work.origin;
      if(dest){overrides.set(f.id,dest);work.edge=edge||null;
        if(!edge&&f.pos.distanceTo(dest)<.01*GROUND_SCALE){state.roadWork.delete(c.team);state.last.delete(f.id);}}
      else {state.roadWork.delete(c.team);state.last.delete(f.id);}
    }
  }
  // 前進する主攻の最後尾だけを道路で止める。先頭は通常の目的地を維持。
  if(!state.roadRear)state.roadRear=new Map();
  const active=new Set();
  for(const k of plan.tasks.filter(k=>k.type==='seize'&&k.stage==='advance'&&k.from)){
    const key=c.team+':'+k.key;active.add(key);
    if(visible){const id=state.roadRear.get(key);state.last.delete(id);state.roadRear.delete(key);continue;}
    const from=groundSites.find(s=>s.id===k.from),to=groundSites.find(s=>s.id===k.zone),tree=from&&npcGroundRoadTree(from);
    const edge=tree&&tree.path(to).find(e=>!e.circle&&e.owner!==c.team&&e.open!==false);
    if(!edge){const id=state.roadRear.get(key);state.last.delete(id);state.roadRear.delete(key);continue;}
    const pool=k.units.map(x=>byId.get(x.id)).filter(f=>f&&npcGroundRoadUnit(f)&&!overrides.has(f.id)&&npcGroundRoadPoint(f,edge));
    if(pool.length<2){state.roadRear.delete(key);continue;} // 地上の先頭が1隊だけなら止めない。
    let f=pool.find(f=>f.id===state.roadRear.get(key));
    if(!f)f=pool.sort((a,b)=>groundDistanceTo(b,to)-groundDistanceTo(a,to))[0];
    if(f){state.roadRear.set(key,f.id);overrides.set(f.id,npcGroundRoadPoint(f,edge));}
  }
  for(const [key,id] of state.roadRear)if(key.startsWith(c.team+':')&&!active.has(key)){state.roadRear.delete(key);state.last.delete(id);}
  if(!state.roadOverrides)state.roadOverrides=new Map();
  for(const id of state.roadOverrides.get(c.team)||[])if(!overrides.has(id))state.last.delete(id);
  state.roadOverrides.set(c.team,new Set(overrides.keys()));
  return overrides;
}
// 経路の各線分と補給円・道路帯の境界を交差させ、最初に補給率>0となる地点を取る。
function npcGroundRefitEntry(f,points){
  const net=groundSupplyNet,team=f.team,r=WOS_TERRAIN[op.ground].capture.roadWidthKm/2;
  const circles=groundSites.filter(s=>s.owner===team&&groundSupplyAt({team,pos:s.pos}).rate>0);
  const roads=(net?.edges||[]).filter(e=>e.owner===team&&e.open!==false&&e.rates[team]>0&&!e.circle);
  if(groundSupplyAt(f).rate>0)return f.pos.clone();
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],ax=groundMapX(a.x),ay=groundMapY(a.z),dx=groundMapX(b.x)-ax,dy=groundMapY(b.z)-ay,cuts=[0,1];
    const add=t=>{if(t>0&&t<1)cuts.push(t);};
    const circle=(x,y,radius)=>{const x0=ax-x,y0=ay-y,A=dx*dx+dy*dy,B=2*(x0*dx+y0*dy),C=x0*x0+y0*y0-radius*radius,D=B*B-4*A*C;
      if(A>0&&D>=0){add((-B-Math.sqrt(D))/(2*A));add((-B+Math.sqrt(D))/(2*A));}};
    for(const s of circles)circle(s.x,s.y,s.radiusKm);
    for(const e of roads){const [p,q]=e.path,ex=q[0]-p[0],ey=q[1]-p[1],len=Math.hypot(ex,ey);if(!len)continue;
      circle(...p,r);circle(...q,r);
      const cross=(ax-p[0])*ey-(ay-p[1])*ex,delta=dx*ey-dy*ex;
      if(Math.abs(delta)>1e-12)for(const sign of [-1,1]){const t=(sign*r*len-cross)/delta,u=((ax+t*dx-p[0])*ex+(ay+t*dy-p[1])*ey)/(len*len);if(u>=0&&u<=1)add(t);}
    }
    cuts.sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++){
      const lo=cuts[j-1],hi=cuts[j];if(hi-lo<1e-12)continue;
      const middle=a.clone().lerp(b,(lo+hi)/2);if(groundSupplyAt({team,pos:middle}).rate<=0)continue;
      const p=a.clone().lerp(b,Math.min((lo+hi)/2,lo+1e-5/Math.max(1e-9,Math.hypot(dx,dy))));
      if(groundSupplyAt({team,pos:p}).rate>0)return p;
    }
  }
  return null;
}
function npcGroundRefitPoint(f,z){
  const state=npcGroundState;if(!state.refit)state.refit=new Map();
  if(groundSupplyAt(f).rate>0)return f.pos.clone();
  const key=z.id+':'+groundSupplyNet?.key+':'+groundBridgeRevision,old=state.refit.get(f.id);
  if(old?.key===key&&groundSupplyAt({team:f.team,pos:old.dest}).rate>0)return old.dest;
  const path=groundPath(f.pos,groundPoint(z.x,z.z),groundMoveKind(f));
  const dest=path&&npcGroundRefitEntry(f,path.points);if(dest)state.refit.set(f.id,{key,dest});return dest;
}

// 輸送・工作・補給は武装隊として突入させない。
function npcGroundArmed(f){return !['apc','engineer','supply'].includes(f.groundKind)&&Object.values(groundFireRanges(f)).some(r=>typeof r==='number'?r>0:r?.max>0);}
function npcGroundFires(f){return npcGroundActive(f.team)&&['artillery','guidedRocket'].includes(f.groundKind);}
function npcGroundVisibleEnemy(team,t){return t.team!==team&&t.alive&&t.hpPool>0&&!t.embarked&&!groundAbsent(t)&&groundSeenBy(team,t);}
function npcGroundInZone(t,z,scale=1){return Math.hypot(groundMapX(t.pos.x)-z.x,groundMapY(t.pos.z)-z.z)<=z.r*scale;}
function npcGroundSupportFire(c,k,z){
  if(!z)return;
  const mains=k.units.filter(x=>x.as==='main').map(x=>fleets.find(f=>f.id===x.id)).filter(f=>f?.alive&&!f.embarked);
  for(const x of k.units){
    const f=fleets.find(f=>f.id===x.id);
    if(x.as!=='support'||!f||!npcGroundFires(f)||!npcGroundFree(f)||f.groundVolley||f.groundAreaSalvo)continue;
    const w=groundStrikeWeapon(f);if(!w||(f.groundStrikeCooldown||0)>0)continue;
    const targets=fleets.filter(t=>npcGroundVisibleEnemy(c.team,t)&&t.band==='ground'&&
      (npcGroundInZone(t,z)||mains.some(m=>groundDistanceTo(m,t)<=3*GROUND_SCALE))&&groundStrikeCanLaunch(f,t.pos)&&
      !fleets.some(a=>a.team===c.team&&a.alive&&!a.embarked&&!groundAbsent(a)&&a.band==='ground'&&groundDistanceTo(a,t)<=w.radius+groundScatterRadius(f,t.pos)));
    const target=targets.sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0];
    if(target)groundVolleyStart(f,{point:target.pos});
  }
}
// 通常の追撃経路が守備円の外へ出るなら進まない。見失い・交戦範囲からの離脱は思考間隔を待たず帰す。
function npcGroundHoldChase(f,t){
  const h=npcGroundState?.holds.get(f.id);if(!h)return true;
  return npcGroundInZone(t,h.z)&&npcGroundInZone(f,h.z)&&
    (!f.order?.path||f.order.path.points.every(pos=>npcGroundInZone({pos},h.z)));
}
function npcGroundHoldStep(){
  for(const [id,h] of npcGroundState.holds){
    const f=fleets.find(f=>f.id===id);if(!f||!npcGroundFree(f)||f.order?.type!=='attack')continue;
    const t=f.order.target;
    if(!npcGroundVisibleEnemy(f.team,t)||groundDistanceTo(f,t)>groundTargetRange(f,t)*1.5){
      order(f,{type:'move',dest:h.dest.clone()});npcGroundState.last.set(f.id,h.dest.clone());
    }
  }
}
function npcGroundSync(c,plan){
  for(const f of npcGroundState.synced)if(f.team===c.team){f.syncSpeed=null;npcGroundState.synced.delete(f);}
  for(const k of plan.tasks.filter(k=>k.type==='seize'&&k.stage==='advance')){
    const group=k.units.map(x=>fleets.find(f=>f.id===x.id)).filter(f=>f&&npcGroundFree(f)&&!['air','sea'].includes(groundMoveKind(f)));
    if(!group.length)continue;
    // syncSpeed は補給による速度倍率の前の値。前回の同期値を使って減速を累積させない。
    const slow=Math.min(...group.map(f=>f.speed*groundSupplySpeedFactor(f)));
    for(const f of group){f.syncSpeed=slow/groundSupplySpeedFactor(f);npcGroundState.synced.add(f);}
  }
}
function npcGroundApply(c,sit,plan){
  npcGroundSync(c,plan);
  for(const [id] of npcGroundState.holds)if(fleets.find(f=>f.id===id)?.team===c.team)npcGroundState.holds.delete(id);
  const road=npcGroundRoadOrders(c,sit,plan);
  for(const k of plan.tasks){
    for(let i=0;i<k.units.length;i++){
      const x=k.units[i],f=fleets.find(f=>f.id===x.id);if(!f||f.groundKind==='sea'||!npcGroundFree(f))continue;
      const z=sit.zones.find(z=>z.id===k.zone),special=road.has(f.id)||k.type==='refit';
      if(k.type!=='refit')npcGroundState.refit?.delete(f.id);
      const dest=road.get(f.id)||(k.type==='refit'?(z&&npcGroundRefitPoint(f,z)):npcGroundDestination(c,sit,k,x,i,k.units.length));if(!dest)continue;
      const mode=k.key+':'+k.stage,changed=npcGroundState.modes.get(f.id)!==mode,precision=(special||k.type==='hold'||k.type==='seize'&&k.stage==='assault') ? .001 : 1;
      const last=npcGroundState.last.get(f.id),distance=p=>Math.hypot(p.x-dest.x,p.z-dest.z)/GROUND_SCALE;
      let target=null;
      if(!special&&z){
        const assault=k.type==='seize'&&k.stage==='assault'&&npcGroundArmed(f)&&!(x.as==='support'&&npcGroundFires(f));
        const defend=k.type==='hold'&&k.stage==='defend'&&npcGroundArmed(f);
        if(k.type==='hold')npcGroundState.holds.set(f.id,{z,dest:dest.clone()});
        const eligible=t=>npcGroundVisibleEnemy(c.team,t)&&groundManualTargetAllowed(f,t)&&
          (assault?npcGroundInZone(t,z,1.5):defend&&npcGroundInZone(f,z)&&
            groundDistanceTo(f,t)<=groundTargetRange(f,t)*1.5);
        // 突入では生きて見えている既存目標を維持し、近い敵が現れても出し直さない。
        const old=f.order?.type==='attack'?f.order.target:null;
        if((assault&&!changed&&old&&npcGroundVisibleEnemy(c.team,old)&&groundManualTargetAllowed(f,old))||(defend&&old&&eligible(old)))target=old;
        else if(assault||defend)target=fleets.filter(eligible).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0];
      }
      if(target){
        if(f.order?.type!=='attack'||f.order.target!==target)order(f,{type:'attack',target});
        npcGroundState.last.set(f.id,dest.clone());
      }else if(changed||!last||distance(last)>=precision||f.order?.type==='attack'||!f.order&&distance(f.pos)>=precision){
        order(f,{type:'move',dest});npcGroundState.last.set(f.id,dest.clone());
      }
      npcGroundState.modes.set(f.id,mode);
    }
    npcGroundSupportFire(c,k,sit.zones.find(z=>z.id===k.zone));
  }
}
function npcGroundStep(){
  if(!op.ground||op.groundDrill||!op.npc)return;
  if(!npcGroundState||npcGroundState.sites!==groundSites)npcGroundInit();
  npcGroundHoldStep();
  for(const f of npcGroundState.synced)if(!npcGroundFree(f)||!npcGroundActive(f.team)){f.syncSpeed=null;npcGroundState.synced.delete(f);}
  for(const c of npcGroundState.commanders.values()){
    if(gameSec+1e-8<c.nextThink)continue;c.nextThink=gameSec+c.L.think;
    for(const f of fleets)if(f.team===c.team)f.stance='engage';
    const sit=npcGroundSituation(c),start=performance.now(),plan=npcThink(c,sit),ms=performance.now()-start,m=npcGroundState.timings;
    m.count++;m.total+=ms;m.max=Math.max(m.max,ms);npcGroundApply(c,sit,plan);
  }
}
function npcDebug(){
  if(!op.ground||op.groundDrill||!op.npc||!npcGroundState||npcGroundState.sites!==groundSites)return {};
  return Object.fromEntries([...npcGroundState.commanders].map(([team,c])=>[team,{posture:c.posture,ratio:c.plan?.ratio??null,plan:c.plan,log:c.log.slice()}]));
}
