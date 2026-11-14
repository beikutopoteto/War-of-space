/* 地上と指揮官の橋渡し。km座標で状況を作り、通常の命令だけを発行する。 */
let npcGroundState=null;
function npcGroundActive(team){return !!(op.ground&&!op.groundDrill&&(op.npc?.[team]||team===0&&op.npc&&autoMode));}
function npcGroundReset(){
  for(const f of npcGroundState?.synced||[])f.syncSpeed=null;
  npcGroundState=null;
}
// 以下の所有切替は演習のデバッグ用。本番の友軍の所属や保存形式には使わない。
let npcAutoReturn=true;
function npcAutoConfig(){return {doctrine:'earth',level:'standard',...op.npcAuto};}
function npcAutoState(){return op.ground?npcGroundState:(typeof npcSpaceState==='undefined'?null:npcSpaceState);}
function npcAutoPlayerUnit(f){return !!(typeof autoMode!=='undefined'&&autoMode&&f.team===0&&npcAutoState()?.auto?.players.has(f.id));}
let npcIssuing=false; // 指揮官が命令を出しているあいだ。画面の入口を通っても、プレイヤーの隊にしない
function npcAutoPlayer(list){
  if(npcIssuing||typeof autoMode==='undefined'||!autoMode||!op.npc||op.groundDrill)return;
  npcAutoToggle();const state=npcAutoState();if(!state?.commanders.get(0)?.debugAuto)return;
  for(const f of list)if(f?.team===0&&f.alive){
    state.auto.players.set(f.id,{idle:null});
    f.syncSpeed=null;state.synced?.delete(f);state.holds?.delete(f.id);state.last?.delete(f.id);state.modes?.delete(f.id);
    // 宇宙の持ち場維持・地上の守備追撃を即時解除。いまの命令そのものは残す。
    delete f.npcTask;
  }
}
function npcAutoBusy(f){
  return !!(f.order||f.queue?.length||f.groundPlan||f.groundAreaSalvo||f.groundVolley||f.groundBombRun||
    f.groundBuilding||f.groundUnloading||f.groundGiving||f.bandTo||f.pending||f.groundAirTask);
}
function npcAutoSync(state,create,fullPower){
  const enabled=typeof autoMode!=='undefined'&&autoMode&&!op.groundDrill&&(op.ground||!tutorialActive())&&!window.WOS_NO_NPC;
  const old=state.commanders.get(0);
  if(enabled&&!old){const c=create(npcAutoConfig());c.debugAuto=true;state.commanders.set(0,c);}
  if(!enabled&&old?.debugAuto){
    state.commanders.delete(0);state.auto=null;
    for(const f of fleets.filter(f=>f.team===0)){
      f.syncSpeed=null;state.synced?.delete(f);state.holds?.delete(f.id);state.last?.delete(f.id);state.modes?.delete(f.id);delete f.npcTask;
    }
  }
  if(!state.commanders.get(0)?.debugAuto)return;
  if(!state.auto)state.auto={players:new Map(),full:new Map()};
  for(const f of fleets.filter(f=>f.team===0&&f.alive))if(!state.auto.full.has(f.id))state.auto.full.set(f.id,fullPower(f));
  for(const [id,p] of state.auto.players){
    const f=fleets.find(f=>f.id===id);if(!f?.alive)continue; // 損失した先導の初期の力は、帰属が終わるまで保持する。
    if(npcAutoBusy(f)){p.idle=null;continue;}
    if(p.idle===null)p.idle=gameSec;
    if(npcAutoReturn&&gameSec-p.idle>=(window.WOS_DATA.npc.auto.returnSec)-1e-8){
      state.auto.players.delete(id);state.last?.delete(id);state.modes?.delete(id);
    }
  }
}
function npcAutoSituation(state,c,sit,point){
  if(!c.debugAuto)return sit;
  const players=state.auto.players,lead=sit.units.filter(u=>players.has(u.id));
  c.side=players.size?'ally':'foe';
  sit.units=sit.units.filter(u=>!players.has(u.id));
  if(players.size){
    sit.lead={full:[...players.keys()].reduce((v,id)=>v+(state.auto.full.get(id)||0),0),units:lead.map(u=>{
      const f=fleets.find(f=>f.id===u.id),o=f.order||f.queue?.[0];
      const dest=o?.dest||o?.target?.pos||o?.bridge?.pos||f.groundPlan?.dest||f.groundGiving?.pos||f.groundBombRun?.ledger?.shot?.aim||f.groundVolley?.ledger?.point;
      const points=dest?[dest]:(f.groundAreaSalvo?.area?.points||[]);
      const distance=z=>Math.min(...points.map(p=>{const v=point(p);return Math.hypot(v.x-z.x,v.z-z.z);}));
      const to=sit.zones.filter(z=>distance(z)<=z.r*1.5).sort((a,b)=>distance(a)-distance(b))[0]?.id;
      return {id:u.id,x:u.x,z:u.z,power:u.power,to:to??null};
    })};
  }else delete sit.lead;
  return sit;
}
// 任務の開始・段取り／理由の変更だけ通知。同じ文の30秒抑制は指揮官の作り直しでも維持。
function npcAllyCommunicate(state,c,sit,plan){
  if(c.side!=='ally'){c.radioTasks=new Map();c.radioMode=null;return;}
  if(!state.radio)state.radio=new Map();
  const say=text=>{if(gameSec-(state.radio.get(text)??-Infinity)<30)return;state.radio.set(text,gameSec);logEvent(text,'');};
  if(plan.lead?.mode!==c.radioMode){
    if(plan.lead?.mode==='rescue')say('友軍: 支援に入る');
    if(plan.lead?.mode==='quiet')say('友軍: 残敵は任せる');
    c.radioMode=plan.lead?.mode;
  }
  const next=new Map();
  for(const k of plan.tasks){
    if(!k.units.length||!['hold','fix','seize'].includes(k.type))continue;
    const signature=[k.stage,k.why].join(':');next.set(k.key,signature);
    if(c.radioTasks?.get(k.key)===signature)continue;
    const name=sit.zones.find(z=>z.id===k.zone)?.name||k.zone;
    say('友軍: '+name+(k.type==='hold'?(k.why==='引き継いで守る'?'を引き継ぐ':'を保持する'):k.type==='fix'?'への攻撃を支援する':'を確保する'));
  }
  c.radioTasks=next;
}
function npcAutoToggle(){
  if(!op.npc||op.groundDrill)return;
  if(op.ground){if(!npcGroundState||npcGroundState.sites!==groundSites)npcGroundInit();else npcGroundAutoSync();}
  else if(typeof npcSpaceAutoSync==='function'&&!tutorialActive()){
    if(!npcSpaceState||npcSpaceState.op!==op||npcSpaceState.fleets!==fleets)npcSpaceInit();else npcSpaceAutoSync();
  }
}
function npcGroundAutoSync(){
  const N=window.WOS_DATA.npc;
  npcAutoSync(npcGroundState,cfg=>{
    const c=npcCommander({team:0,doctrine:N.doctrines[cfg.doctrine],level:N.levels[cfg.level],styles:N.styles,seed:op.npcSeed??1});c.nextThink=gameSec;return c;
  },f=>N.power.ground[f.groundKind]??1);
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
    const c=npcCommander({team,side:cfg.side,doctrine:D,level:L,styles:N.styles,seed:(op.npcSeed??1)+team*7});
    c.nextThink=gameSec+team*L.think/2;commanders.set(team,c);
    for(const f of fleets)if(f.team===team)f.stance='engage';
  }
  npcGroundState={sites:groundSites,commanders,initial:new Map(groundSites.map(s=>[s.id,s.owner])),last:new Map(),links:null,linkKey:null,
    holds:new Map(),modes:new Map(),synced:new Set(),timings:{count:0,total:0,max:0}};
  npcGroundAutoSync();
}
// 道具専用の分割。軍番号は保ち、キャッシュの鍵と指揮する隊だけを分ける。
function npcGroundSplit(ratio){
  if(!npcGroundState)npcGroundInit();
  const leader=npcGroundState.commanders.get(0);if(!leader)return;
  const all=fleets.filter(f=>f.team===0&&f.alive),allyIds=new Set(all.filter((f,i)=>Math.floor((i+1)*ratio)>Math.floor(i*ratio)).map(f=>f.id));
  leader.unitIds=new Set(all.filter(f=>!allyIds.has(f.id)).map(f=>f.id));leader.key=0;
  const N=window.WOS_DATA.npc,cfg=op.npc[0];
  const ally=npcCommander({team:0,side:'ally',doctrine:leader.D,level:leader.L,styles:N.styles,seed:(op.npcSeed??1)+97});
  ally.key='0:ally';ally.cfg=cfg;ally.unitIds=allyIds;ally.leadIds=leader.unitIds;
  ally.leadFull=all.filter(f=>ally.leadIds.has(f.id)).reduce((v,f)=>v+(N.power.ground[f.groundKind]??1),0);
  ally.nextThink=gameSec;npcGroundState.commanders.set(ally.key,ally);
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
        const j=e.a===i?e.b:e.a,d=best+groundSupplyEdgeLength(e);
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
    return {id:s.id,name:s.name||s.id,x:s.x,z:s.y,r:s.radiusKm,owner:seen?relative(s.owner):null,seen,known:relative(npcGroundState.initial.get(s.id)),
      base,goal:base==='foe',final:base==='foe',supply:s.owner===team?groundSupplyAt({pos:s.pos,team}).rate:0};
  });
  const units=fleets.filter(f=>f.team===team&&f.alive&&f.hpPool>0&&!f.groundExited).map(f=>({id:f.id,role:N.roles.ground[f.groundKind]||'line',power:npcGroundPower(f),
    x:groundMapX(f.pos.x),z:groundMapY(f.pos.z),speed:speedOf(f)/GROUND_SCALE,health:Math.max(0,f.hpPool/(f.groundMaxHp||f.n*f.hp)),
    canHold:groundCanCapture(f),morale:(f.groundMorale??max)/max,supply:(f.groundSupply??max)/max,free:npcGroundFree(f)&&(f.groundKind!=='sea'||npcGroundLiftActive()&&groundLandingShip(f)),
    ...(npcGroundLiftActive()?npcGroundLiftUnit(f):{}),
    engaged:!!(f.fireTarget||f.order?.type==='attack'||f.groundHitLeft>0)}));
  // 死亡・現在の耐久・現在位置を視界外から読まない。最後に見たときの記録だけ。
  const contacts=[];
  for(const f of fleets){if(f.team===team||!f.alive||f.groundExited)continue;const k=f.groundContacts?.[team];if(!k||k.power===undefined)continue;
    contacts.push({id:f.id,x:groundMapX(k.pos.x),z:groundMapY(k.pos.z),power:k.power,role:k.role,age:f.groundVisible?.[team]?0:Math.max(0,gameSec-k.at)});
  }
  const sit={time:gameSec,zones,links:[...npcGroundLinks(),...(npcGroundLiftActive()?npcGroundLiftLinks():[])],units,contacts,goal:{type:'seize',...(groundScriptIntent(team)||(c.cfg||op.npc[team])?.intent||{})}}; // 作戦の意図（npc の intent: type・zones・until・style）
  if(c.side==='ally'&&!c.debugAuto){
    // 明示の先頭拠点を優先。未指定なら既知の自軍拠点まで（最終目標は頭でも除外する）。
    const home=zones.find(z=>z.base==='own'),own=zones.filter(z=>z.owner==='own');
    sit.lead={front:op.npc[team]?.lead?.front??own.sort((a,b)=>Math.hypot(b.x-(home?.x||0),b.z-(home?.z||0))-Math.hypot(a.x-(home?.x||0),a.z-(home?.z||0)))[0]?.id};
  }
  if(c.unitIds)sit.units=sit.units.filter(u=>c.unitIds.has(u.id));
  if(c.leadIds){
    const lead=fleets.filter(f=>c.leadIds.has(f.id)&&f.alive&&f.hpPool>0);
    sit.lead={full:c.leadFull,units:lead.map(f=>{
      const task=[...npcGroundState.commanders.values()].filter(a=>a!==c).flatMap(a=>a.plan?.tasks||[]).find(k=>k.units.some(u=>u.id===f.id));
      return {id:f.id,x:groundMapX(f.pos.x),z:groundMapY(f.pos.z),power:npcGroundPower(f),to:task?.goalZone??task?.zone??null};
    })};
  }
  return npcAutoSituation(npcGroundState,c,sit,p=>({x:groundMapX(p.x),z:groundMapY(p.z)}));
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
      const j=e.a===i?e.b:e.a,v=d+groundSupplyEdgeLength(e);
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
  let work=state.roadWork.get(c.key??c.team);
  const visible=sit.contacts.some(e=>e.age===0),byId=new Map(fleets.map(f=>[f.id,f]));
  const eligible=plan.tasks.filter(k=>k.type==='reserve'||k.type==='hold'&&k.stage==='wait');
  const candidates=eligible.flatMap(k=>k.units.map(x=>({k,f:byId.get(x.id)}))).filter(({f})=>f&&npcGroundRoadUnit(f));
  if(work&&(visible||!candidates.some(({f})=>f.id===work.id))){state.last.delete(work.id);state.roadWork.delete(c.key??c.team);work=null;}
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
      if(candidate){work={id:candidate.f.id,origin:candidate.f.pos.clone()};state.roadWork.set(c.key??c.team,work);}}
    if(work){const f=byId.get(work.id),edge=ordered[0],dest=edge?npcGroundRoadPoint(f,edge):work.origin;
      if(dest){overrides.set(f.id,dest);work.edge=edge||null;
        if(!edge&&f.pos.distanceTo(dest)<.01*GROUND_SCALE){state.roadWork.delete(c.key??c.team);state.last.delete(f.id);}}
      else {state.roadWork.delete(c.key??c.team);state.last.delete(f.id);}
    }
  }
  // 前進する主攻の最後尾だけを道路で止める。先頭は通常の目的地を維持。
  if(!state.roadRear)state.roadRear=new Map();
  const active=new Set();
  for(const k of plan.tasks.filter(k=>k.type==='seize'&&k.stage==='advance'&&k.from)){
    const key=(c.key??c.team)+'|'+k.key;active.add(key);
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
  for(const [key,id] of state.roadRear)if(key.startsWith((c.key??c.team)+'|')&&!active.has(key)){state.roadRear.delete(key);state.last.delete(id);}
  if(!state.roadOverrides)state.roadOverrides=new Map();
  for(const id of state.roadOverrides.get(c.key??c.team)||[])if(!overrides.has(id))state.last.delete(id);
  state.roadOverrides.set(c.key??c.team,new Set(overrides.keys()));
  return overrides;
}
// 経路の各線分と補給円・道路帯の境界を交差させ、最初に補給率>0となる地点を取る。
function npcGroundRefitEntry(f,points){
  const net=groundSupplyNet,team=f.team,r=groundRuleSet().capture.roadWidthKm/2;
  const circles=groundSites.filter(s=>s.owner===team&&groundSupplyAt({team,pos:s.pos}).rate>0);
  const roads=(net?.edges||[]).filter(e=>e.owner===team&&e.open!==false&&e.rates[team]>0&&!e.circle);
  if(groundSupplyAt(f).rate>0)return f.pos.clone();
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],ax=groundMapX(a.x),ay=groundMapY(a.z),dx=groundMapX(b.x)-ax,dy=groundMapY(b.z)-ay,cuts=[0,1];
    const add=t=>{if(t>0&&t<1)cuts.push(t);};
    const circle=(x,y,radius)=>{const x0=ax-x,y0=ay-y,A=dx*dx+dy*dy,B=2*(x0*dx+y0*dy),C=x0*x0+y0*y0-radius*radius,D=B*B-4*A*C;
      if(A>0&&D>=0){add((-B-Math.sqrt(D))/(2*A));add((-B+Math.sqrt(D))/(2*A));}};
    for(const s of circles)circle(s.x,s.y,s.radiusKm);
    for(const e of roads)for(let j=1;j<e.path.length;j++){const p=e.path[j-1],q=e.path[j],ex=q[0]-p[0],ey=q[1]-p[1],len=Math.hypot(ex,ey);if(!len)continue;
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
    if(x.as!=='support'||!f||npcAutoPlayerUnit(f)||!npcGroundFires(f)||!npcGroundFree(f)||f.groundVolley||f.groundAreaSalvo)continue;
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
  for(const f of npcGroundState.synced)if(f.team===c.team&&(!c.unitIds||c.unitIds.has(f.id))){f.syncSpeed=null;npcGroundState.synced.delete(f);}
  for(const k of plan.tasks.filter(k=>k.type==='seize'&&k.stage==='advance')){
    const group=k.units.map(x=>fleets.find(f=>f.id===x.id)).filter(f=>f&&!npcAutoPlayerUnit(f)&&npcGroundFree(f)&&!['air','sea'].includes(groundMoveKind(f))&&!(npcGroundLiftActive()&&['apc','supply','engineer'].includes(f.groundKind)));
    if(!group.length)continue;
    // syncSpeed は補給による速度倍率の前の値。前回の同期値を使って減速を累積させない。
    const slow=Math.min(...group.map(f=>f.speed*groundSupplySpeedFactor(f)));
    for(const f of group){f.syncSpeed=slow/groundSupplySpeedFactor(f);npcGroundState.synced.add(f);}
  }
}
function npcGroundApply(c,sit,plan){
  npcGroundSync(c,plan);
  for(const [id] of npcGroundState.holds)if(fleets.find(f=>f.id===id)?.team===c.team&&(!c.unitIds||c.unitIds.has(id)))npcGroundState.holds.delete(id);
  const lift=npcGroundLiftActive()?npcGroundLiftOrders(c,sit,plan):new Set();
  const road=npcGroundRoadOrders(c,sit,plan);
  for(const k of plan.tasks){
    for(let i=0;i<k.units.length;i++){
      const x=k.units[i],f=fleets.find(f=>f.id===x.id);if(!f||lift.has(f.id)||!sit.units.some(u=>u.id===f.id)||npcAutoPlayerUnit(f)||f.groundKind==='sea'||!npcGroundFree(f))continue;
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
  npcGroundAutoSync();
  if(npcGroundLiftActive()){npcIssuing=true;try{npcGroundLiftWatch();}finally{npcIssuing=false;}}
  npcGroundHoldStep();
  for(const f of npcGroundState.synced)if(!npcGroundFree(f)||!npcGroundActive(f.team)){f.syncSpeed=null;npcGroundState.synced.delete(f);}
  for(const c of npcGroundState.commanders.values()){
    if(gameSec+1e-8<c.nextThink)continue;c.nextThink=gameSec+c.L.think;
    for(const f of fleets)if(f.team===c.team&&!npcAutoPlayerUnit(f)&&(!c.unitIds||c.unitIds.has(f.id)))f.stance='engage';
    const sit=npcGroundSituation(c),start=performance.now(),plan=npcThink(c,sit),ms=performance.now()-start,m=npcGroundState.timings;
    m.count++;m.total+=ms;m.max=Math.max(m.max,ms);npcAllyCommunicate(npcGroundState,c,sit,plan);npcIssuing=true;try{npcGroundApply(c,sit,plan);}finally{npcIssuing=false;}
  }
}
function npcDebug(){
  if(!op.ground||op.groundDrill||!op.npc||!npcGroundState||npcGroundState.sites!==groundSites)return {};
  return Object.fromEntries([...npcGroundState.commanders].map(([team,c])=>[team,{posture:c.posture,ratio:c.plan?.ratio??null,plan:c.plan,log:c.log.slice()}]));
}

// 明示した演習だけで使う。既存作戦の入力・命令・規範には影響させない。
function npcGroundLiftActive(){return op.npcLift===true;}
function npcGroundLiftState(){
  const s=npcGroundState;
  if(!s.lift)s.lift={terrain:null,coasts:[],ports:new Map(),gaps:[],sea:[],boats:new Map(),trucks:new Map(),crossing:new Map(),works:new Map(),cooldown:new Map(),portOrder:new Map(),routes:new Map(),offshore:[]};
  return s.lift;
}
function npcGroundLiftUnit(f){
  const boats=npcGroundLiftState().boats,trip=boats.get(f.id);
  const waiting=[...boats.values()].some(t=>t.crew?.includes(f.id)&&['land','done'].includes(t.phase)&&[...npcGroundState.commanders.values()].some(c=>c.plan?.tasks.some(k=>k.key===t.key&&k.stage==='assemble')));
  const busy=!!(waiting||trip&&['sail','land'].includes(trip.phase)||f.embarked||f.groundBuilding||f.groundUnloading||['board','bridge'].includes(f.order?.type)||npcGroundLiftState().crossing.has(f.id));
  return {can:f.groundKind==='engineer'?'bridge':groundLandingShip(f)?'ferry':f.groundKind==='supply'?'supply':null,
    ...(groundLandingShip(f)?{lift:groundLandingRules().capacity}:{}),busy,
    ...(busy?{free:false}:{})};
}
function npcGroundSegmentDistance(x,y,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a.x-dx*t,y-a.y-dy*t);
}
function npcGroundSegmentsCross(a,b,p,q){
  const cross=(u,v,w)=>(v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x);
  return cross(a,b,p)*cross(a,b,q)<=0&&cross(p,q,a)*cross(p,q,b)<=0&&
    Math.max(a.x,b.x)>=Math.min(p.x,q.x)&&Math.max(p.x,q.x)>=Math.min(a.x,b.x)&&Math.max(a.y,b.y)>=Math.min(p.y,q.y)&&Math.max(p.y,q.y)>=Math.min(a.y,b.y);
}
function npcGroundLiftLinks(){
  const s=npcGroundLiftState(),d=groundData(),cell=d.meta.cellKm;
  if(s.terrain!==d||s.sites!==groundSites){
    s.terrain=d;s.sites=groundSites;s.coasts=[];s.offshore=[];s.ports=new Map();s.portOrder=new Map();s.gaps=[];s.sea=[];
    for(let row=0;row<d.terrain.rows;row++)for(let col=0;col<d.terrain.cols;col++){
      const x=(col+.5)*cell,y=(row+.5)*cell,water=groundPoint(x,y),land=groundCoastCells({pos:water},'vehicle');
      if(land.length)s.coasts.push({water,land});else if(groundPass(x,y,'sea'))s.offshore.push(water);
    }
    for(const z of groundSites){
      const ports=s.coasts.map(p=>({...p,distance:Math.min(...p.land.map(q=>groundDistanceTo({pos:q},z)/GROUND_SCALE))})).filter(p=>p.distance<=6+1e-8).sort((a,b)=>a.distance-b.distance);
      if(ports.length)s.ports.set(z.id,ports);
    }
    const candidates=new Map();
    for(const r of d.water.rivers){
      const points=[];
      for(let i=1;i<r.points.length;i++){
        const a=r.points[i-1],b=r.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/Math.min(cell,.1));
        for(let j=0;j<=n;j++){
          const p=groundBridgeTerrain(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n);
          if(!p.reason&&p.river===r.id&&![...d.objects.bridges,...d.objects.fords].some(v=>v.river===r.id&&Math.hypot(p.x-v.x,p.y-v.y)<.9))points.push(p);
        }
      }
      candidates.set(r.id,points);
    }
    for(let i=0;i<groundSites.length;i++)for(let j=i+1;j<groundSites.length;j++){
      const a=groundSites[i],b=groundSites[j];
      if(s.ports.has(a.id)&&s.ports.has(b.id)){
        const pa=s.ports.get(a.id)[0],pb=s.ports.get(b.id)[0],path=groundPath(pa.water,pb.water,'sea');
        if(path)s.sea.push({a:a.id,b:b.id,way:'sea',open:true,len:Math.hypot(a.x-b.x,a.y-b.y)});
      }
      let best=null,distance=Infinity;
      for(const r of d.water.rivers){
        if(!r.points.slice(1).some((p,k)=>npcGroundSegmentsCross(a,b,{x:r.points[k][0],y:r.points[k][1]},{x:p[0],y:p[1]})))continue;
        for(const p of candidates.get(r.id)){
          const v=npcGroundSegmentDistance(p.x,p.y,a,b);if(v<distance){distance=v;best=p;}
        }
      }
      if(best){
        // 頭へは拠点間の距離を渡す。既存の浅瀬を通る現在の迂回長を、未開通の橋の長さにしない。
        s.gaps.push({a:a.id,b:b.id,way:'gap',open:false,len:Math.hypot(a.x-b.x,a.y-b.y),bridge:best});
      }
    }
  }
  for(const l of s.gaps){
    l.open=groundBuiltBridgeAt(l.bridge.x,l.bridge.y,l.bridge.river);
    if(l.open&&l.revision!==groundBridgeRevision){const a=groundSites.find(z=>z.id===l.a),b=groundSites.find(z=>z.id===l.b),path=groundPath(a.pos,b.pos,'vehicle');l.openLength=path?path.L/GROUND_SCALE:Infinity;l.revision=groundBridgeRevision;}
    l.len=l.open?l.openLength:Math.hypot(groundSites.find(z=>z.id===l.a).x-groundSites.find(z=>z.id===l.b).x,groundSites.find(z=>z.id===l.a).y-groundSites.find(z=>z.id===l.b).y);
  }
  return [...s.gaps,...s.sea];
}
function npcGroundLiftLink(k){return npcGroundLiftLinks().find(l=>l.way===(k.type==='bridge'?'gap':k.via)&&k.link?.includes(l.a)&&k.link?.includes(l.b));}
function npcGroundLiftMove(f,dest,via){
  if(!dest||!f?.alive||f.embarked||npcAutoPlayerUnit(f))return false;
  const last=npcGroundState.last.get(f.id),routes=npcGroundLiftState().routes,route=via===undefined?null:via.map(p=>p.x.toFixed(3)+','+p.z.toFixed(3)).join(';');
  if(route!==null&&routes.get(f.id)!==route||!last||last.distanceTo(dest)>.05*GROUND_SCALE||!f.order&&f.pos.distanceTo(dest)>.05*GROUND_SCALE||f.order&&f.order.type!=='move'){
    order(f,{type:'move',dest:dest.clone(),...(via?.length?{via:via.map(p=>p.clone())}:{})});
    npcGroundState.last.set(f.id,dest.clone());if(route!==null)routes.set(f.id,route);
  }
  return !!f.order||f.pos.distanceTo(dest)<=.05*GROUND_SCALE;
}
// 見えている接触だけから危険円を作る。視界外の現在位置・兵科・射程を読まない。
function npcGroundLiftThreats(team){
  return fleets.filter(f=>npcGroundVisibleEnemy(team,f)).map(f=>({f,pos:f.pos.clone(),range:Math.max(groundFireRanges(f).direct||0,groundFireRanges(f).ground||0)}));
}
function npcGroundLiftDanger(pos,threats,beach=false){
  return threats.some(t=>groundDistanceTo({pos},t)<=t.range||(beach&&groundDistanceTo({pos},t)<=groundData().meta.cellKm*GROUND_SCALE));
}
function npcGroundLiftSafePath(ship,dest,threats){
  const safe=p=>threats.every(t=>groundDistanceTo({pos:p},t)>t.range||groundDistanceTo(ship,t)<=t.range&&groundDistanceTo({pos:p},t)>groundDistanceTo(ship,t)+1e-6),path=groundPath(ship.pos,dest,'sea');
  if(!path)return null;
  const line=(a,b)=>{const n=Math.max(1,Math.ceil(a.distanceTo(b)/(groundData().meta.cellKm*GROUND_SCALE/2)));for(let i=1;i<=n;i++)if(!safe(a.clone().lerp(b,i/n)))return false;return true;};
  if(path.points.slice(1).every((p,i)=>line(path.points[i],p)))return path.points.slice(1,-1);
  // 海のセルを安全円の外だけで探索し、全経由点を通常の移動へ渡す。
  const d=groundData(),cell=d.meta.cellKm,cols=d.terrain.cols,rows=d.terrain.rows;
  const index=p=>Math.floor(groundMapY(p.z)/cell)*cols+Math.floor(groundMapX(p.x)/cell),point=i=>groundPoint((i%cols+.5)*cell,(Math.floor(i/cols)+.5)*cell);
  const start=index(ship.pos),end=index(dest),queue=[start],prev=new Map([[start,null]]);
  for(let at=0;at<queue.length&&!prev.has(end);at++){
    const i=queue[at],x=i%cols,y=Math.floor(i/cols);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const xx=x+dx,yy=y+dy,j=yy*cols+xx;if(xx<0||xx>=cols||yy<0||yy>=rows||prev.has(j))continue;
      const p=point(j);if(!groundPass((xx+.5)*cell,(yy+.5)*cell,'sea')||!safe(p)||!line(i===start?ship.pos:point(i),p))continue;
      prev.set(j,i);queue.push(j);
    }
  }
  if(!prev.has(end))return null;
  const via=[];for(let i=end;i!==start;i=prev.get(i))via.unshift(point(i));
  return via;
}
function npcGroundLiftPort(ship,zone,threats){
  const s=npcGroundLiftState(),z=groundSites.find(z=>z.id===zone);if(!z)return null;
  // 遠回りの浜も地上経路で同じ目標へ到達できるものだけを使う。
  if(!s.portOrder.has(zone))s.portOrder.set(zone,s.coasts.map(p=>({...p,distance:Math.min(...p.land.map(q=>groundDistanceTo({pos:q},z)))})).sort((a,b)=>a.distance-b.distance));
  const ports=s.portOrder.get(zone);
  for(const p of ports){
    if(p.land.some(q=>npcGroundLiftDanger(q,threats,true))||npcGroundLiftDanger(p.water,threats))continue;
    if(p.pathRevision!==groundBridgeRevision){p.reachable=p.land.some(q=>groundPath(q,z.pos,'vehicle'));p.pathRevision=groundBridgeRevision;}
    if(!p.reachable)continue;
    const via=npcGroundLiftSafePath(ship,p.water,threats);if(via)return {...p,via};
  }
  return null;
}
function npcGroundLiftOffshore(ship,threats){
  const s=npcGroundLiftState(),points=s.offshore.filter(pos=>!npcGroundLiftDanger(pos,threats));
  if(ship.order?.type==='move'&&!npcGroundLiftDanger(ship.order.dest,threats)&&!groundCoastCells({pos:ship.order.dest}).length)return true;
  points.sort((a,b)=>ship.pos.distanceToSquared(a)-ship.pos.distanceToSquared(b));
  for(const p of points){const via=npcGroundLiftSafePath(ship,p,threats);if(via)return npcGroundLiftMove(ship,p,via);}
  return false;
}
function npcGroundLiftWatch(){
  const s=npcGroundLiftState();npcGroundLiftLinks();
  for(const [id,work] of s.works){
    const f=fleets.find(f=>f.id===id);
    if(work.bridge.complete){
      for(const member of work.members){const u=fleets.find(f=>f.id===member);if(u?.alive&&!u.embarked){s.crossing.set(u.id,work.far.clone());npcGroundLiftMove(u,work.far);}}
      s.works.delete(id);
    }else if(!f?.alive||f.order?.bridge!==work.bridge)s.works.delete(id);
  }
  for(const [id,p] of s.crossing){const f=fleets.find(f=>f.id===id);if(!f?.alive||f.embarked||f.pos.distanceTo(p)<.1*GROUND_SCALE||f.groundRout){s.crossing.delete(id);npcGroundState.last.delete(id);}}
  for(const ship of fleets.filter(f=>f.alive&&groundLandingShip(f)&&npcGroundActive(f.team)&&!npcAutoPlayerUnit(f))){
    const trip=s.boats.get(ship.id),threats=npcGroundLiftThreats(ship.team);
    if(ship.groundUnloading&&groundCoastCells(ship,'vehicle').some(p=>npcGroundLiftDanger(p,threats,true))){order(ship,{type:'move',dest:ship.pos.clone()});npcGroundLiftOffshore(ship,threats);if(trip){trip.phase='sail';trip.port=null;}}
    // 危険な浜からの退避は通常の移動を継続。経由点の全探索は判断時に行う。
  }
}
function npcGroundLiftOrders(c,sit,plan){
  const s=npcGroundLiftState(),handled=new Set(),tasks=new Map();npcGroundLiftLinks();
  for(const k of plan.tasks)for(const x of k.units)tasks.set(x.id,k);
  const ours=f=>f?.team===c.team&&(!c.unitIds||c.unitIds.has(f.id))&&!npcAutoPlayerUnit(f),threats=npcGroundLiftThreats(c.team);
  for(const [id,p] of s.crossing){const f=fleets.find(f=>f.id===id);if(ours(f)){handled.add(id);npcGroundLiftMove(f,p);}}
  // 任務が消えたら建設を中止する。搭載した隊は安全な味方の浜へ戻して降ろす。
  for(const f of fleets.filter(ours)){
    const k=tasks.get(f.id);
    if(f.order?.type==='bridge'&&k?.type!=='bridge'){order(f,{type:'move',dest:f.pos.clone()});s.works.delete(f.id);}
    if(f.order?.type==='board'&&(!k||tasks.get(f.order.target.id)!==k)){order(f,{type:'move',dest:f.pos.clone()});}
  }
  for(const k of plan.tasks.filter(k=>k.type==='bridge')){
    const link=npcGroundLiftLink(k);if(!link||link.open)continue;
    const units=k.units.map(x=>fleets.find(f=>f.id===x.id)).filter(f=>ours(f)&&f.alive),worker=units.find(f=>f.groundKind==='engineer');if(!worker)continue;
    const banks=link.bridge.banks.map(p=>({p,path:groundPath(worker.pos,p,groundMoveKind(worker))})).filter(b=>b.path).sort((a,b)=>a.path.L-b.path.L),near=banks[0]?.p;if(!near)continue;
    const far=link.bridge.banks.find(p=>p!==near),guard=units.filter(f=>f!==worker);
    for(const f of guard){handled.add(f.id);npcGroundLiftMove(f,near);}
    handled.add(worker.id);
    const enemy=threats.some(t=>groundDistanceTo(t,{pos:link.bridge.pos})<=groundEngineeringRules().workRange);
    const ready=guard.length>0&&guard.some(f=>groundDistanceTo(f,{pos:near})<=groundEngineeringRules().workRange);
    if(!enemy&&ready&&npcGroundFree(worker)){
      const bridge=groundBridgeCommand([worker],link.bridge.pos);
      if(bridge){s.works.set(worker.id,{bridge,far,members:[worker.id,...guard.map(f=>f.id)]});if(groundScriptState?.op===op)groundScriptState.flags.npcBridgeStarted=true;}
    }
  }
  for(const k of plan.tasks.filter(k=>k.via==='gap'&&k.blocked)){
    const link=npcGroundLiftLink(k),work=[...s.works.values()].find(w=>w.bridge.river===link?.bridge.river);
    if(!link)continue;
    for(const x of k.units){const f=fleets.find(f=>f.id===x.id);if(!ours(f)||!npcGroundFree(f))continue;
      const near=work?link.bridge.banks.find(p=>!p.equals(work.far)):link.bridge.banks.slice().sort((a,b)=>f.pos.distanceTo(a)-f.pos.distanceTo(b))[0];
      handled.add(f.id);npcGroundLiftMove(f,near);
    }
  }
  for(const ship of fleets.filter(f=>ours(f)&&f.alive&&groundLandingShip(f))){
    const previous=s.boats.get(ship.id);
    const k=tasks.get(ship.id),loadedSupport=groundPassengers(ship).length&&['seize','cut'].includes(k?.type)&&npcGroundLiftLinks().some(l=>l.way==='sea'&&[l.a,l.b].includes(k.from)&&[l.a,l.b].includes(k.zone)),sea=k?.via==='sea'||!!loadedSupport||previous?.key===k?.key&&['sail','land','done'].includes(previous.phase),mains=sea?k.units.filter(x=>x.as==='main').map(x=>fleets.find(f=>f.id===x.id)).filter(f=>ours(f)&&f.alive):[];
    if(!sea&&!s.boats.has(ship.id))continue;
    // 初期搭載の支援艦も、割り当てられた主攻の同じ目標へ海から運ぶ。
    const existing=s.boats.get(ship.id);if(existing?.key===k?.key&&existing.phase==='done'){handled.add(ship.id);if(k.stage==='assemble')for(const id of existing.delivered||[]){const f=fleets.find(f=>f.id===id);if(f?.alive&&tasks.get(id)===k){handled.add(id);}}continue;}
    handled.add(ship.id);
    const from=sea?k.from:groundSites.filter(z=>z.owner===c.team&&s.ports.has(z.id)).sort((a,b)=>ship.pos.distanceTo(a.pos)-ship.pos.distanceTo(b.pos))[0]?.id;
    if(!from)continue;
    let trip=s.boats.get(ship.id);
    const key=sea?k.key:'return:'+from;
    if(!trip||trip.key!==key){trip={key,phase:'assemble',from,to:sea?k.zone:from,port:null};s.boats.set(ship.id,trip);npcGroundState.last.delete(ship.id);}
    const aboard=groundPassengers(ship);
    // 初期搭載も、この艦の上陸任務に所属させる。free:false / busy:true のまま次の判断に渡す。
    if(sea&&aboard.length){trip.crew=aboard.map(f=>f.id);for(const f of aboard){const m=c.unit.get(f.id);if(m){m.task=k.key;m.as='main';}if(!k.units.some(x=>x.id===f.id))k.units.push({id:f.id,as:'main'});handled.add(f.id);}if(trip.phase==='assemble'&&!(ship.groundBoarders||[]).length)trip.phase='sail';}
    if(trip.phase==='assemble'){
      if(!trip.port)trip.port=npcGroundLiftPort(ship,from,threats);if(!trip.port)continue;
      npcGroundLiftMove(ship,trip.port.water,trip.port.via);
      for(const f of mains)if(!f.embarked&&!s.crossing.has(f.id)){handled.add(f.id);if(npcGroundFree(f))npcGroundLiftMove(f,trip.port.land[0]);}
      if(ship.pos.distanceTo(trip.port.water)>.1*GROUND_SCALE)continue;
      if(!sea){if(aboard.length&&!ship.groundUnloading)groundLandCommand([ship]);if(!aboard.length)s.boats.delete(ship.id);continue;}
      if(k.stage==='assemble')continue;
      for(const f of mains){if(s.crossing.has(f.id))continue;handled.add(f.id);if(!f.embarked&&npcGroundFree(f))groundBoardCommand([f],ship);}
      if(mains.length&&mains.every(f=>f.embarked===ship)){trip.phase='sail';trip.port=null;}
    }
    if(trip.phase==='sail'){
      const threatKey=threats.map(t=>[t.f.id,t.pos.x.toFixed(1),t.pos.z.toFixed(1),t.range].join(':')).join('|');
      if(trip.threatKey!==threatKey){if(trip.port){const via=npcGroundLiftSafePath(ship,trip.port.water,threats);if(via)trip.port.via=via;else trip.port=null;}s.routes.delete(ship.id);trip.threatKey=threatKey;}
      if(trip.port&&trip.port.zone!==trip.to)trip.port=null;
      if(trip.port&&(trip.port.land.some(p=>npcGroundLiftDanger(p,threats,true))||npcGroundLiftDanger(trip.port.water,threats)))trip.port=null;
      if(!trip.port){const port=npcGroundLiftPort(ship,trip.to,threats);if(port)trip.port={...port,zone:trip.to};}
      if(!trip.port){npcGroundLiftOffshore(ship,threats);continue;}
      npcGroundLiftMove(ship,trip.port.water,trip.port.via);
      if(ship.pos.distanceTo(trip.port.water)<=.1*GROUND_SCALE&&groundPassengers(ship).length&&!ship.groundUnloading){if(groundLandCommand([ship]))trip.phase='land';}
    }
    if(trip.phase==='land'){
      for(const f of mains)if(f.embarked)handled.add(f.id);
      if(!groundPassengers(ship).length){trip.phase='done';trip.delivered=trip.crew||[];}
    }
    if(sea&&['land','done'].includes(trip.phase)&&k.stage==='assemble')for(const id of trip.crew||[])handled.add(id);
    // 同じ任務で降りた隊を出発の浜へ呼び戻さない。任務が変わるまで完了を保持。
    if(trip.phase==='done'&&!sea)s.boats.delete(ship.id);
  }
  // 同じ任務の歩兵を空いた輸送車へ。既存の搭乗・降車コマンドで予約と中止も処理する。
  for(const [id,ride] of s.trucks){
    const truck=fleets.find(f=>f.id===id),f=fleets.find(f=>f.id===ride.passenger);if(!ours(truck))continue;
    if(!truck.alive||!f?.alive){s.trucks.delete(id);continue;}
    handled.add(truck.id);handled.add(f.id);
    if(!tasks.has(f.id)||tasks.get(f.id)!==tasks.get(truck.id)){
      if(truck.groundPassenger){if(groundUnloadCommand([truck]))s.cooldown.set(f.id,gameSec+30);}else if(f.order?.type==='board')order(f,{type:'move',dest:f.pos.clone()});
      s.trucks.delete(id);continue;
    }
    if(f.embarked===truck){
      if(npcGroundLiftDanger(truck.pos,threats)||truck.pos.distanceTo(ride.dest)<=.2*GROUND_SCALE){if(groundUnloadCommand([truck])){s.trucks.delete(id);s.cooldown.set(f.id,gameSec+30);}}
      else npcGroundLiftMove(truck,ride.dest);
    }
  }
  for(const k of plan.tasks){
    const group=k.units.map(x=>({x,f:fleets.find(f=>f.id===x.id)})).filter(({f})=>ours(f)&&f.alive);
    if(k.via!=='sea'&&!k.blocked&&k.type!=='bridge')for(const {f,x} of group){
      if(handled.has(f.id)||gameSec<(s.cooldown.get(f.id)||0)||!groundBoardable(f)||!npcGroundFree(f))continue;
      const dest=npcGroundDestination(c,sit,k,x,k.units.indexOf(x),k.units.length);if(!dest||f.pos.distanceTo(dest)<6*GROUND_SCALE)continue;
      const truck=group.map(a=>a.f).filter(t=>t.groundKind==='apc'&&npcGroundFree(t)&&!handled.has(t.id)&&!groundPassengers(t).length&&!t.groundBoarder).sort((a,b)=>f.pos.distanceTo(a.pos)-f.pos.distanceTo(b.pos))[0];
      if(!truck)continue;
      const path=groundPath(truck.pos,dest,groundMoveKind(truck));if(!path||path.L<6*GROUND_SCALE)continue;
      // 危険円に入る直前の経路点で降ろす。全経路が安全なら通常の集結地点まで。
      let stop=truck.pos.clone(),blocked=false;for(let i=1;i<path.points.length&&!blocked;i++){const a=path.points[i-1],b=path.points[i],n=Math.max(1,Math.ceil(a.distanceTo(b)/(groundData().meta.cellKm*GROUND_SCALE/2)));for(let j=1;j<=n;j++){const p=a.clone().lerp(b,j/n);if(npcGroundLiftDanger(p,threats)){blocked=true;break;}stop=p;}}
      const remaining=groundPath(truck.pos,stop,groundMoveKind(truck));if(!remaining||remaining.L<6*GROUND_SCALE)continue;
      if(groundBoardCommand([f],truck)){handled.add(f.id);handled.add(truck.id);s.trucks.set(truck.id,{passenger:f.id,dest:stop.clone()});}
    }
    for(const {f,x} of group)if(f.groundKind==='supply'&&(x.as==='supply'||x.as==='support')&&!handled.has(f.id)&&npcGroundFree(f)){
      const candidates=group.filter(a=>a.x.as==='main'&&!a.f.embarked&&groundSupplyCanGive(f,a.f)).sort((a,b)=>(a.f.groundSupply??100)-(b.f.groundSupply??100)).map(a=>a.f);if(!candidates.length)continue;
      let main=null,dest=null;
      for(const candidate of candidates){main=candidate;
      const z=sit.zones.find(z=>z.id===k.zone),home=sit.zones.find(z=>z.id===k.from)||sit.zones.find(z=>z.base==='own');
      const dx=(z?.x??groundMapX(main.pos.x))-(home?.x??groundMapX(f.pos.x)),dy=(z?.z??groundMapY(main.pos.z))-(home?.z??groundMapY(f.pos.z)),len=Math.hypot(dx,dy)||1;

      for(const side of [0,1,-1,2,-2]){
        const p=npcGroundPassPoint(f,groundMapX(main.pos.x)-dx/len*.6-dy/len*side*.2,groundMapY(main.pos.z)-dy/len*.6+dx/len*side*.2);
        if(p&&p.distanceTo(main.pos)<=groundSupplyRules().giveKm*GROUND_SCALE&&!npcGroundLiftDanger(p,threats)){dest=p;break;}
      }
      if(dest)break;
      }
      handled.add(f.id);
      if(dest){if(f.pos.distanceTo(dest)>.1*GROUND_SCALE)npcGroundLiftMove(f,dest);else if(f.groundGiving!==main)groundSupplyCommand([f],main);}
      else if(f.order||f.groundGiving)order(f,{type:'move',dest:f.pos.clone()});
    }
  }
  return handled;
}
