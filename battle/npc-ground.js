/* 地上と指揮官の橋渡し。km座標で状況を作り、通常の命令だけを発行する。 */
let npcGroundState=null;
function npcGroundActive(team){return !!(op.ground&&!op.groundDrill&&op.npc?.[team]);}
function npcGroundReset(){npcGroundState=null;}
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
    timings:{count:0,total:0,max:0}};
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
function npcGroundPassPoint(f,x,y){
  const kind=groundMoveKind(f),d=groundDimensions(),cell=d.data.meta.cellKm;
  const valid=(a,b)=>a>=0&&b>=0&&a<=d.widthKm&&b<=d.heightKm&&groundPass(a,b,kind);
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
  let px=z.x,py=z.z,back=0,offset=(index-(count-1)/2)*1.5;
  const capture=groundSites.find(s=>s.id===z.id).captureRadius/GROUND_SCALE;
  if(k.type==='seize'&&k.stage==='assemble'){px=from.x;py=from.z;back=-Math.min(1,from.r*.25);}
  else if(k.type==='fix')back=Math.max(capture+1,range*.8);
  else if(k.type==='recon')back=groundSightRange(f)/GROUND_SCALE*.8;
  else if(x.as==='support')back=u.role==='fires'?range*.7:u.role==='support'?4:u.role==='screen'?2:1;
  else if(k.type==='seize'&&k.stage==='advance')back=u.role==='shock'?0:1.5;
  else if((k.type==='hold'||k.type==='seize'||k.type==='cut')&&u.canHold){
    const holders=k.units.filter(x=>sit.units.find(u=>u.id===x.id)?.canHold),at=holders.findIndex(h=>h.id===x.id);
    offset=Math.max(-capture*.8,Math.min(capture*.8,(at-(holders.length-1)/2)*1.5));back=0;
  }
  else if(k.type==='hold')back=-Math.min(z.r*.5,2);
  // 占拠担当を除き横一列。占拠担当は必ず小さな占拠円内に置く。
  return npcGroundPassPoint(f,px-dx*back-dy*offset,py-dy*back+dx*offset);
}
function npcGroundApply(c,sit,plan){
  for(const k of plan.tasks)for(let i=0;i<k.units.length;i++){
    const x=k.units[i],f=fleets.find(f=>f.id===x.id);if(!f||f.groundKind==='sea'||!npcGroundFree(f))continue;
    const dest=npcGroundDestination(c,sit,k,x,i,k.units.length);if(!dest)continue;
    const last=npcGroundState.last.get(f.id),distance=p=>Math.hypot(p.x-dest.x,p.z-dest.z)/GROUND_SCALE;
    let target=null;
    if(k.type==='seize'&&k.stage==='assault'&&!groundCanCapture(f)&&x.as!=='support'){
      const zone=sit.zones.find(z=>z.id===k.zone);
      target=fleets.filter(t=>t.team!==c.team&&groundSeenBy(c.team,t)&&groundManualTargetAllowed(f,t)&&
        Math.hypot(groundMapX(t.pos.x)-zone.x,groundMapY(t.pos.z)-zone.z)<=zone.r).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b))[0];
    }
    if(target){if(f.order?.type!=='attack'||f.order.target!==target){order(f,{type:'attack',target});npcGroundState.last.set(f.id,dest.clone());}}
    else if(!last||distance(last)>=1||!f.order&&distance(f.pos)>=1){order(f,{type:'move',dest});npcGroundState.last.set(f.id,dest.clone());}
  }
}
function npcGroundStep(){
  if(!op.ground||op.groundDrill||!op.npc)return;
  if(!npcGroundState||npcGroundState.sites!==groundSites)npcGroundInit();
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
