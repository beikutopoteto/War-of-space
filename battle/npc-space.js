/* 宇宙の指揮官。頭には観測した状況だけを渡し、既存の隊AIの持ち場を更新する。
   仮の距離・秒数は docs/menu.md。固定物・艦載機は指揮官の隊にしない。 */
let npcSpaceState=null;
// window.WOS_NO_NPC: 台本どおりの要塞を確かめるテストだけが立てる（tests/smoke.cjs）
function npcSpaceEnabled(team){return !!(!op.ground&&!tutorialActive()&&op.npc?.[team]&&!window.WOS_NO_NPC);}
function npcSpaceActive(team){
  return npcSpaceEnabled(team)&&!chase&&!over;
}
function npcSpaceFleet(f){return f.kind==='fleet'&&!f.fixed&&!f.ghost&&!f.left&&f.alive&&f.ships.length>0;}
function npcSpaceFree(f){
  return npcSpaceFleet(f)&&!f.locked&&!f.withdrawing&&!f.rot?.leaving&&!f.fellBack&&
    !['withdraw','escape','gone'].includes(f.ai)&&!f.pending;
}
function npcSpacePower(f){
  // 基準は10隻の巡洋隊（hp42、dmg4.2）。共通HP倍率は分母にも入れ、釣り合いには触らない。
  return f.ships.length*f.hp*f.dmg/(10*42*HP_K*4.2);
}
function npcSpaceInit(){
  npcSpaceState=null;
  if(op.ground||tutorialActive()||!op.npc)return;
  const N=WOS_DATA.npc,commanders=new Map();
  for(const [key,cfg] of Object.entries(op.npc)){
    const team=Number(key),D=N.doctrines[cfg.doctrine],L=N.levels[cfg.level];
    if(![0,1].includes(team)||!D||!L)continue;
    const c=npcCommander({team,side:cfg.side,doctrine:D,level:L,styles:N.styles,seed:(op.npcSeed??1)+team*7});
    c.nextThink=gameSec;commanders.set(team,c);
  }
  const zones=(op.npcZones||[]).map(z=>({...z,pos:new THREE.Vector3(z.pos[0],z.alt||0,z.pos[1]),initial:z.owner,candidate:null,since:null,contested:false}));
  const by=new Map(zones.map(z=>[z.id,z]));
  const links=(op.npcLinks||[]).filter(([a,b])=>by.has(a)&&by.has(b)).map(([a,b])=>({a,b,len:Math.hypot(by.get(a).pos.x-by.get(b).pos.x,by.get(a).pos.z-by.get(b).pos.z),open:true}));
  npcSpaceState={op,fleets,zones,links,commanders,contacts:new Map(),timings:{count:0,total:0,max:0}};
  npcSpaceOwners();
}
function npcSpacePointSeen(team,pos){
  const point={pos,stl:0,inCloud:inCloud({pos})};
  return fleets.some(f=>f.team===team&&npcSpaceFleet(f)&&canSee(f,point));
}
function npcSpaceOwners(){
  for(const z of npcSpaceState.zones){
    if(op.fortress&&fortress.alive&&z.base===fortress.team&&Math.hypot(z.pos.x-fortress.pos.x,z.pos.z-fortress.pos.z)<=z.r){
      z.owner=fortress.team;z.contested=false;z.candidate=z.since=null;continue;
    }
    const teams=new Set(fleets.filter(f=>npcSpaceFleet(f)&&Math.hypot(f.pos.x-z.pos.x,f.pos.z-z.pos.z)<=z.r).map(f=>f.team));
    z.contested=teams.size>1;
    const team=teams.size===1?[...teams][0]:null;
    if(team===null||team===z.owner){z.candidate=z.since=null;continue;}
    if(z.candidate!==team){z.candidate=team;z.since=gameSec;}
    if(gameSec-z.since>=10-1e-8){z.owner=team;z.candidate=z.since=null;}
  }
}
// updateFogと同じ観測結果。見失った隊の位置・力は更新しない。視界外での死も消さない。
function npcSpaceObserve(){
  if(!npcSpaceState||npcSpaceState.op!==op||npcSpaceState.fleets!==fleets)return;
  for(const team of npcSpaceState.commanders.keys()){
    if(!npcSpaceActive(team))continue;
    let contacts=npcSpaceState.contacts.get(team);if(!contacts)npcSpaceState.contacts.set(team,contacts=new Map());
    for(const f of fleets){
      if(f.team===team||f.kind!=='fleet'||f.fixed||f.ghost)continue;
      const k=contacts.get(f.id);
      if(f.alive&&f.seen){contacts.set(f.id,{id:f.id,lastPos:f.pos.clone(),at:gameSec,lostAt:null,power:npcSpacePower(f),role:WOS_DATA.npc.roles.space[topClass(f)]||'line'});}
      else if(!f.alive&&npcSpacePointSeen(team,f.pos)){contacts.delete(f.id);}
      else if(k&&k.lostAt===null)k.lostAt=gameSec;
    }
  }
}
function npcSpaceSituation(c){
  const relative=owner=>owner===c.team?'own':owner==null?'none':'foe';
  const zones=npcSpaceState.zones.map(z=>{
    const seen=z.owner===c.team||npcSpacePointSeen(c.team,z.pos),base=z.base==null?null:z.base===c.team?'own':'foe';
    return {id:z.id,x:z.pos.x,z:z.pos.z,alt:z.pos.y,r:z.r,seen,owner:seen?relative(z.owner):null,
      known:relative(z.initial),base,final:!!z.final,goal:base==='foe'};
  });
  const units=fleets.filter(f=>f.team===c.team&&f.kind==='fleet'&&f.alive&&!f.ghost&&!f.left&&f.ships.length>0).map(f=>({id:f.id,role:WOS_DATA.npc.roles.space[topClass(f)]||'line',
    x:f.pos.x,z:f.pos.z,power:npcSpacePower(f),speed:speedOf(f),health:Math.max(0,Math.min(1,f.ships.length/Math.max(1,f.n))),
    canHold:true,free:npcSpaceFree(f),engaged:!!(f.order?.type==='attack'&&f.order.target?.alive&&f.order.target.seen)}));
  const contacts=[...(npcSpaceState.contacts.get(c.team)?.values()||[])].map(k=>({id:k.id,x:k.lastPos.x,z:k.lastPos.z,
    lastPos:{x:k.lastPos.x,y:k.lastPos.y,z:k.lastPos.z},lostAt:k.lostAt,age:k.lostAt===null?0:Math.max(0,gameSec-k.at),power:k.power,role:k.role}));
  const sit={time:gameSec,zones,links:npcSpaceState.links,units,contacts,goal:{type:'seize',...(op.npc[c.team].intent||{})}};
  if(c.side==='ally')sit.lead={front:op.npc[c.team].lead?.front??zones.filter(z=>z.owner==='own').sort((a,b)=>{
    const home=zones.find(z=>z.base==='own')||{x:0,z:0};return Math.hypot(b.x-home.x,b.z-home.z)-Math.hypot(a.x-home.x,a.z-home.z);
  })[0]?.id};
  return sit;
}
function npcSpacePlacement(c,sit,k,x,index,count){
  const z=sit.zones.find(z=>z.id===k.zone),f=fleets.find(f=>f.id===x.id);if(!z||!f)return null;
  const from=sit.zones.find(z=>z.id===k.from)||sit.zones.find(z=>z.base==='own')||z;
  let dx=from.x-z.x,dz=from.z-z.z;
  // 同じ拠点を守るときは、既知の敵の側に正面を向け、その反対を味方側とする。
  if(Math.hypot(dx,dz)<1e-8){const foe=sit.contacts.slice().sort((a,b)=>Math.hypot(a.x-z.x,a.z-z.z)-Math.hypot(b.x-z.x,b.z-z.z))[0]||sit.zones.find(a=>a.base==='foe');
    dx=z.x-(foe?.x??z.x);dz=z.z-(foe?.z??z.z-1);}
  const len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;
  const offset=(index-(count-1)/2)*Math.min(8,z.r/Math.max(2,count)),up=count>1?(index%2?1:-1)*6:0;
  let px=z.x,pz=z.z,alt=z.alt||0,back=0,ai='guard',leash=Math.min(8,z.r),watch=null;
  if(x.as==='support'){
    // 母艦の発進半径より必ず内側。艦載機と通常の狙い分担は既存AIに任せる。
    back=f.launchR>0?f.launchR*.7:Math.max(z.r,f.range*.8);
  }else if(k.type==='hold'){leash=z.r;}
  else if(k.type==='seize'&&k.stage==='assemble'){px=from.x;pz=from.z;alt=from.alt||0;leash=from.r;}
  else if(k.type==='seize'&&k.stage!=='assault'){back=z.r+f.range;}
  else if(k.type==='fix'){back=f.range*.8;}
  else if(['seize','cut','recon'].includes(k.type)){
    ai=k.type==='recon'&&typeof scoutAI==='function'?'scout':'hunt';leash=1e9;watch=new THREE.Vector3(z.x,alt,z.z);
  }
  const post=new THREE.Vector3(px+dx*back-dz*offset,Math.max(-ALT_MAX+2,Math.min(ALT_MAX-2,alt+up)),pz+dz*back+dx*offset);
  if(x.as==='support'&&f.launchR>0){const centre=new THREE.Vector3(z.x,z.alt||0,z.z),v=post.clone().sub(centre);if(v.length()>f.launchR*.9)post.copy(centre).add(v.setLength(f.launchR*.9));}
  return {ai,post,leash,watch};
}
function npcSpaceApply(c,sit,plan){
  if(!npcSpaceActive(c.team))return;
  for(const k of plan.tasks)for(let i=0;i<k.units.length;i++){
    const x=k.units[i],f=fleets.find(f=>f.id===x.id);if(!f||f.team!==c.team||!npcSpaceFree(f))continue;
    const p=npcSpacePlacement(c,sit,k,x,i,k.units.length);if(!p)continue;
    const mode=[k.key,k.stage,x.as].join(':'),same=(a,b)=>a===b||!!(a&&b&&a.distanceToSquared(b)<1e-8);
    const changed=f.npcTask!==mode||f.ai!==p.ai||f.leash!==p.leash||!same(f.post,p.post)||!same(f.watchPos,p.watch);
    if(!changed)continue;
    if(f.ai!==p.ai)f.ai=p.ai;if(f.leash!==p.leash)f.leash=p.leash;
    if(!same(f.post,p.post))f.post.copy(p.post);
    if(!same(f.watchPos,p.watch))f.watchPos=p.watch;
    // scoutAIの通常の巡回入力（fieldC相対）。watchPosだけでは既定の北宙域へ行ってしまう。
    if(p.ai==='scout'){f.patrol=[[p.watch.x-fieldC.x,p.watch.z-fieldC.z]];f.watch={pos:[p.watch.x,p.watch.z],alt:p.watch.y};f.pi=0;}
    // 旧移動先を残さず、交戦も新しい持ち場の外なら解除する。目標選び自体はenemyAI。
    const target=f.order?.type==='attack'?f.order.target:null;
    if(f.order?.type==='move'||target&&(!target.alive||!target.seen||p.ai==='scout'||p.ai==='guard'&&target.pos.distanceTo(p.post)>=p.leash)){
      f.order=null;dropArrow(f.arrow);f.arrow=null;
    }
    f.npcTask=mode;
  }
}
function npcSpaceKeepPosts(){
  // 既存pickFoeは候補ゼロでも現目標を保持する場合がある。NPCの守備だけは毎ステップで境界を守る。
  for(const f of fleets){
    if(!npcSpaceActive(f.team)||!f.npcTask||f.ai!=='guard'||f.order?.type!=='attack')continue;
    const t=f.order.target;
    if(!t?.alive||!t.seen||t.pos.distanceTo(f.post)>=f.leash){f.order=null;dropArrow(f.arrow);f.arrow=null;}
  }
}
function npcSpaceStep(){
  if(op.ground||tutorialActive()||!op.npc||chase||over)return;
  if(!npcSpaceState||npcSpaceState.op!==op||npcSpaceState.fleets!==fleets)npcSpaceInit();
  if(!npcSpaceState.zones.length)return;
  npcSpaceOwners();
  npcSpaceKeepPosts();
  for(const c of npcSpaceState.commanders.values()){
    if(gameSec+1e-8<c.nextThink)continue;c.nextThink=gameSec+c.L.think;
    const sit=npcSpaceSituation(c),start=performance.now(),plan=npcThink(c,sit),ms=performance.now()-start,m=npcSpaceState.timings;
    m.count++;m.total+=ms;m.max=Math.max(m.max,ms);npcSpaceApply(c,sit,plan);
  }
}
// 地上の実装をそのまま使い、宇宙だけここでdebugを拡張する（npc-ground.jsの後に読む）。
const npcGroundDebug=npcDebug;
npcDebug=function(){
  if(op.ground)return npcGroundDebug();
  if(!npcSpaceState||npcSpaceState.op!==op||npcSpaceState.fleets!==fleets)return {};
  return Object.fromEntries([...npcSpaceState.commanders].filter(([team])=>npcSpaceActive(team)).map(([team,c])=>
    [team,{posture:c.posture,style:c.style,ratio:c.plan?.ratio??null,plan:c.plan,log:c.log.slice()}]));
};
