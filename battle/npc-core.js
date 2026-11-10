/* NPC の指揮官: 宇宙と地上で共通の「頭」。設計は docs/npc-doctrine.md。
   状況（sit）だけを読み、任務の一覧（plan）だけを返す。three.js・画面・戦闘の内部には触らない（Node でも動く）。
   モードごとの橋渡し（状況を作ること、任務を通常の命令に直すこと）は battle/npc-ground.js など別のファイル。
   考える順: ①見積もる（力の比・脅威・情報）→ ②姿勢を決める → ③任務を立てる → ④隊を割り当てる → ⑤段取りを進める。 */
function npcRng(seed){ let s=(seed>>>0)||1; return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
function npcHash(v){ const t=String(v); let h=2166136261; for(let i=0;i<t.length;i++){ h^=t.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0)/4294967296; }

/* cfg: {team, side:'foe'|'ally', doctrine:{…}, level:{…}, seed} */
function npcCommander(cfg){
  return {team:cfg.team, side:cfg.side||'foe', D:cfg.doctrine, L:cfg.level, rng:npcRng(cfg.seed||1), seed:cfg.seed||1,
    posture:null, postureAt:-1e9, want:null, wantAt:0, probeFrom:null, wonAt:-1e9,
    zone:new Map(), unit:new Map(), tasks:new Map(), graph:null, plan:null, log:[], nextThink:0};
}
function npcLog(c,t,what,zone,why){ c.log.push({t:+t.toFixed(1),what,zone:zone??null,why}); if(c.log.length>200)c.log.shift(); }

/* 拠点のつながり。全点間の最短距離と、守りを避ける経路探し。つながらない所は直線の1.6倍で代用する。 */
function npcGraph(c,sit){
  const key=sit.zones.map(z=>z.id).join(',')+'|'+sit.links.map(l=>l.a+'-'+l.b+':'+Math.round(l.len*10)+(l.open===false?'x':'')).join(',');
  if(c.graph&&c.graph.key===key)return c.graph;
  const ids=sit.zones.map(z=>z.id), ix=new Map(ids.map((id,i)=>[id,i])), n=ids.length;
  const d=ids.map((_,i)=>ids.map((_,j)=>i===j?0:Infinity)), adj=ids.map(()=>[]);
  for(const l of sit.links){
    if(l.open===false)continue; const a=ix.get(l.a), b=ix.get(l.b); if(a===undefined||b===undefined||a===b)continue;
    if(l.len<d[a][b])d[a][b]=d[b][a]=l.len; adj[a].push({j:b,len:l.len}); adj[b].push({j:a,len:l.len});
  }
  for(let k=0;k<n;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(d[i][k]+d[k][j]<d[i][j])d[i][j]=d[i][k]+d[k][j];
  const pos=sit.zones.map(z=>[z.x,z.z]), air=(i,j)=>Math.hypot(pos[i][0]-pos[j][0],pos[i][1]-pos[j][1])*1.6;
  let span=1; for(let i=0;i<n;i++)for(let j=0;j<n;j++)span=Math.max(span,Number.isFinite(d[i][j])?d[i][j]:air(i,j));
  const dist=(a,b)=>{ const i=ix.get(a), j=ix.get(b); return Number.isFinite(d[i][j])?d[i][j]:air(i,j); };
  /* cost(id): その拠点に入るときの上乗せ。経路は拠点の id の並び。 */
  const route=(from,to,cost)=>{
    const s=ix.get(from), e=ix.get(to), best=ids.map(()=>Infinity), prev=ids.map(()=>-1), done=ids.map(()=>false); best[s]=0;
    for(;;){ let i=-1; for(let k=0;k<n;k++)if(!done[k]&&best[k]<Infinity&&(i<0||best[k]<best[i]))i=k; if(i<0||i===e)break; done[i]=true;
      for(const {j,len} of adj[i]){ const v=best[i]+len+(j===e?0:cost(ids[j])); if(v<best[j]){ best[j]=v; prev[j]=i; } } }
    if(best[e]===Infinity)return [from,to];
    const out=[]; for(let i=e;i>=0;i=prev[i])out.unshift(ids[i]); return out;
  };
  return c.graph={key,ids,ix,adj,span,dist,route,next:id=>adj[ix.get(id)].map(a=>ids[a.j])};
}

const NPC_FIT={ // 任務ごとの役の向き（0 は割り当てない）
  seize:{shock:1,line:1,strike:.6}, hold:{line:1,shock:.5,screen:.6}, fix:{line:.8,shock:.6,strike:.8},
  cut:{recon:1,shock:.8,line:.5}, recon:{recon:1,strike:.4,line:.2,shock:.1}, reserve:{line:1,shock:1,recon:.3},
};

function npcThink(c,sit){
  const D=c.D, L=c.L, t=sit.time, g=npcGraph(c,sit), zones=sit.zones, zById=new Map(zones.map(z=>[z.id,z]));
  const nearest=p=>{ let b=null, bd=Infinity; for(const z of zones){ const v=Math.hypot(z.x-p.x,z.z-p.z); if(v<bd){ bd=v; b=z.id; } } return b; };
  const away=(u,id)=>{ const z=zById.get(id); return Math.hypot(z.x-u.x,z.z-u.z); };
  const units=sit.units.filter(u=>u.power>0); for(const u of units)if(u.zone==null)u.zone=nearest(u);

  /* ① 見積もる。持ち主は「今見えている」か「自軍のもの」のときだけ更新し、あとは覚えている値を使う。 */
  for(const z of zones){
    let m=c.zone.get(z.id); if(!m)c.zone.set(z.id,m={owner:z.owner||z.known||'unknown',seenAt:z.owner?t:-1e9,lostAt:-1e9,failAt:-1e9,jit:(c.rng()-.5)*D.vary});
    if(z.owner==='own'){ if(m.owner!=='own'&&c.posture!==null)c.wonAt=t; m.owner='own'; m.seenAt=t; }
    else { if(m.owner==='own'){ m.lostAt=t; m.owner=z.owner||'foe'; } if(z.seen&&z.owner){ m.owner=z.owner; m.seenAt=t; } }
  }
  const E=new Map(zones.map(z=>[z.id,{own:0,foe:0,threat:0}])), mem=id=>c.zone.get(id), isOwn=id=>mem(id).owner==='own';
  let own=0; for(const u of units){ own+=u.power; E.get(u.zone).own+=u.power; }
  const avg=units.length?own/units.length:1;
  // 見失った敵は、位置（拠点ごとの見積もりと脅威）だけが時間とともに薄れる。数は覚えていて、力の比には数え続ける。
  let foe=0, known=0; const contacts=[];
  for(const e of sit.contacts){
    const seen=e.power*(1+L.error*(npcHash(c.seed+':'+e.id)*2-1)); known+=seen;
    const conf=e.age<=0?1:Math.max(0,1-e.age/L.memory); if(conf<=0)continue;
    const est=seen*conf, zone=e.zone??nearest(e);
    contacts.push({...e,est,zone}); foe+=est; E.get(zone).foe+=est;
  }
  for(const z of zones){ const m=mem(z.id), e=E.get(z.id); // 見ていない敵地には守備がいると仮定する
    if(m.owner!=='own'&&m.owner!=='none'&&t-m.seenAt>L.memory){ const a=D.assume*avg*(z.base==='foe'?2:1); if(e.foe<a){ foe+=a-e.foe; e.foe=a; } } }
  foe=Math.max(foe,known,sit.intel||0);
  const ratio=own/Math.max(foe,avg*.25), horizon=L.horizon*g.span;
  for(const z of zones){ if(!isOwn(z.id))continue; const e=E.get(z.id);
    for(const k of contacts)e.threat+=k.est*Math.max(0,1-g.dist(k.zone,z.id)/horizon)**2; }
  const others=zones.filter(z=>!isOwn(z.id)), ownZ=zones.filter(z=>isOwn(z.id));
  const info=others.length?others.filter(z=>t-mem(z.id).seenAt<=L.memory).length/others.length:1;
  const base=zones.find(z=>z.base==='own'&&isOwn(z.id)), foeBase=zones.find(z=>z.base==='foe');
  const home=base?base.id:ownZ.length?ownZ.reduce((a,b)=>E.get(b.id).own>E.get(a.id).own?b:a).id:units.length?units[0].zone:zones[0]?.id;
  const front=id=>g.next(id).some(j=>!isOwn(j));

  /* ② 姿勢。行ったり来たりしないよう、今の姿勢のときは境目を少しずらし、変えるまでに反応の遅れを置く。 */
  const atk=D.attack*(1-.4*(sit.urgency||0))*(c.posture==='attack'||c.posture==='probe'?1-D.band:1), brk=D.break_*(c.posture==='delay'?1+D.band:1);
  let want;
  if(ratio<brk)want='delay';
  else if(sit.goal?.type==='hold'||ratio<atk||!others.length)want='defend';
  else if(c.posture==='attack')want='attack'; // 攻め始めたら偵察のために止まらない（偵察は並行して出す）
  else { if(info>=D.minInfo)c.probeFrom=null; else if(c.probeFrom==null||c.posture!=='probe'&&t-c.probeFrom>D.probeMax*3)c.probeFrom=t;
    want=c.probeFrom!=null&&t-c.probeFrom<D.probeMax?'probe':'attack'; }
  if(want!==c.want){ c.want=want; c.wantAt=t; }
  if(c.posture===null||want!==c.posture&&t-c.wantAt>=L.react&&t-c.postureAt>=D.commit){
    npcLog(c,t,'posture:'+want,null,`比${ratio.toFixed(2)} 情報${info.toFixed(2)}`); c.posture=want; c.postureAt=t; }
  const posture=c.posture;

  /* ③ 任務を立てる。pri が高い順に隊を取る。need は要る力、cap は取ってよい力の上限。 */
  const want2=[], push=o=>want2.push({from:null,cap:Infinity,max:Infinity,...o,key:o.type+':'+o.zone});
  const man=units.filter(u=>u.free!==false&&(u.role==='line'||u.role==='shock')).reduce((s,u)=>s+u.power,0);
  // 守り
  let holdNeed=0;
  for(const z of ownZ){
    const e=E.get(z.id), isBase=base&&z.id===base.id, f=front(z.id);
    const eco=posture==='attack'?D.economy:1;
    let need=isBase?Math.max(D.baseGuard*avg,e.threat*D.holdRatio*eco):e.threat>0||f?Math.max(D.garrison*avg*eco,e.threat*D.holdRatio*eco):0;
    if(posture==='delay'&&!isBase&&e.own<e.threat*D.break_)need=0; // 守りきれない所は捨てて下がる
    if(need>0){ holdNeed+=need; push({type:'hold',zone:z.id,pri:isBase?100:(posture==='attack'?45:65)+Math.min(20,e.threat/avg*5),need,cap:Math.max(need,avg),why:isBase?'本営を守る':e.threat>0?'脅威に備える':'前線を保つ'}); }
  }
  // 攻め
  const cutSet=new Set();
  if(foeBase){ const fronts=others.filter(z=>mem(z.id).owner==='foe'&&g.next(z.id).some(isOwn));
    for(const f of fronts)for(const id of g.route(foeBase.id,f.id,()=>0).slice(1,-1))if(!isOwn(id))cutSet.add(id); }
  const lead=sit.lead?.front, leadReach=lead!=null&&home!=null?g.dist(home,lead):Infinity;
  const allowed=z=>c.side!=='ally'||!z.final&&(lead==null||g.dist(home,z.id)<=leadReach+1e-6); // 友軍は最終目標を取らず、プレイヤーより先へ出ない
  const score=z=>{ const m=mem(z.id);
    return (z.value||1)*(z.goal?D.wGoal:1)+D.wCut*(cutSet.has(z.id)?1:0)-D.wFoe*E.get(z.id).foe/Math.max(own,1e-9)-D.wDist*(home!=null?g.dist(home,z.id):0)/g.span
      +(t-m.lostAt<D.counterWindow?D.wLost:0)-(t-m.failAt<D.retry?D.wFail:0)+(c.main===z.id?D.stickObj:0)+m.jit; };
  let mainZone=null, offensive=0;
  const stage=k=>c.tasks.get(k), running=[...c.tasks.values()].find(k=>k.type==='seize'&&!isOwn(k.zone));
  const seize=(z,why,ratioNeed)=>{
    // 最近押し返された拠点は、経路でも大きく避ける。ほかに道がなければ、retry が過ぎるまでその方向へは攻めない。
    const failed=id=>t-mem(id).failAt<D.retry;
    const path=home!=null?g.route(home,z.id,id=>isOwn(id)?0:D.avoid*E.get(id).foe/Math.max(own,1e-9)*g.span+(failed(id)?g.span*10:0)):[z.id];
    let i=path.findIndex(id=>!isOwn(id)); if(i<0)i=path.length-1;
    let obj=path[i], from=i>0?path[i-1]:null;
    // 同じ目標へ向かっている途中なら、次に取る拠点を変えない（敵の見積もりの揺れで行き先が入れ替わるのを防ぐ）
    if(running&&(running.goalZone||running.zone)===z.id&&!isOwn(running.zone)&&!failed(running.zone)){
      obj=running.zone; from=running.from!=null&&isOwn(running.from)?running.from:g.next(obj).filter(isOwn).sort((a,b)=>g.dist(home,a)-g.dist(home,b))[0]??null; }
    if(failed(obj))return false;
    const need=Math.max(avg,E.get(obj).foe*ratioNeed,posture==='attack'?D.mass*man:0);
    mainZone=obj; offensive++;
    push({type:'seize',zone:obj,from,pri:80,need,cap:Math.max(avg,(1-D.reserve)*man),why:obj===z.id?why:`${why}（${z.id}への途中）`,why0:why,goalZone:z.id});
    return true;
  };
  const cand=others.filter(allowed);
  if(posture==='attack'&&cand.length){
    const keep=running&&running.stage!=='assemble'&&cand.find(z=>z.id===(running.goalZone||running.zone)); // 動き出した主攻は変えない
    if(keep)seize(keep,running.why0||'主攻を続ける',D.attack);
    else if(t-c.wonAt>=D.consolidate){ // 点数の高い順に、攻められる所が見つかるまで試す
      for(const best of [...cand].sort((a,b)=>score(b)-score(a)))if(seize(best,best.goal?'目標を取る':cutSet.has(best.id)?'補給線を切る':'前へ出る',D.attack)){ c.main=best.id; break; } }
  } else if(posture==='defend'&&c.side!=='ally'){ // 取られた拠点を、余力があれば取り返す
    const spare=Math.max(0,man-holdNeed), lost=cand.filter(z=>t-mem(z.id).lostAt<D.counterWindow&&E.get(z.id).foe*D.counter<=spare);
    // 取り返しが先。なければ、隣の守りの薄い拠点（中立など）を余力で取る
    const easy=cand.filter(z=>!lost.includes(z)&&g.next(z.id).some(isOwn)&&Math.max(avg,E.get(z.id).foe*D.attack)<=spare&&t-c.wonAt>=D.consolidate);
    // 取りに出た所は、余力が少し減ったくらいでは変えない（出したり引っ込めたりしない）
    const cur=running&&cand.find(z=>z.id===(running.goalZone||running.zone)&&(lost.includes(z)||Math.max(avg,E.get(z.id).foe*D.attack)<=spare*1.6+avg));
    let done=!!cur&&seize(cur,running.why0||'空いた所を取る',lost.includes(cur)?D.counter:D.attack);
    if(!done)for(const z of lost.sort((a,b)=>score(b)-score(a)))if(seize(z,'取り返す',D.counter)){ done=true; break; }
    if(!done)for(const z of easy.sort((a,b)=>score(b)-score(a)))if(seize(z,'空いた所を取る',D.attack))break;
  }
  if(posture==='attack'&&mainZone){
    if(D.feint&&offensive<L.tasks){ // 助攻: 主攻とは別の、敵がいる隣の拠点を押さえつける
      const f=cand.filter(z=>z.id!==mainZone&&t-mem(z.id).failAt>=D.retry&&g.next(z.id).some(isOwn)&&E.get(z.id).foe>0).sort((a,b)=>E.get(b.id).foe-E.get(a.id).foe)[0];
      if(f){ offensive++; push({type:'fix',zone:f.id,from:g.next(f.id).filter(isOwn).sort((a,b)=>g.dist(a,f.id)-g.dist(b,f.id))[0],pri:50,need:Math.max(avg,E.get(f.id).foe*D.fix),cap:Math.max(avg,E.get(f.id).foe*D.fix*1.5),why:'敵を引きつける'}); }
    }
    if(D.wCut>0&&offensive<L.tasks){ // 遮断: 敵の本営と前線のあいだの、守りの薄い拠点
      const k=cand.filter(z=>cutSet.has(z.id)&&z.id!==mainZone&&t-mem(z.id).failAt>=D.retry&&!want2.some(w=>w.zone===z.id)&&E.get(z.id).foe<=avg*D.cutMax).sort((a,b)=>E.get(a.id).foe-E.get(b.id).foe)[0];
      if(k){ offensive++; push({type:'cut',zone:k.id,from:ownZ.map(z=>z.id).sort((a,b)=>g.dist(a,k.id)-g.dist(b,k.id))[0]??null,pri:48,need:avg,cap:avg*1.5,max:2,why:'補給線を切る'}); }
    }
  }
  // 偵察: 長く見ていない敵地へ。偵察の隊の数まで（偵察の姿勢なら、隊がなくても1つ出す）
  const scouts=units.filter(u=>u.free!==false&&u.role==='recon').length, stale=others.filter(z=>t-mem(z.id).seenAt>L.memory&&z.id!==mainZone)
    .sort((a,b)=>(b.goal?1:0)-(a.goal?1:0)||(home!=null?g.dist(home,a.id)-g.dist(home,b.id):0));
  for(const z of stale.slice(0,Math.max(scouts,posture==='probe'?1:0)))push({type:'recon',zone:z.id,pri:posture==='probe'?75:40,need:0,cap:0,max:1,why:'様子を見る',fit:scouts?{recon:1}:null});
  // 予備の置き場: 味方の拠点のうち、前線と本営の両方に近い所
  const fronts=ownZ.filter(z=>front(z.id)).map(z=>z.id), spot=ownZ.length?ownZ.map(z=>z.id).reduce((a,b)=>{
    const v=id=>(fronts.length&&posture!=='delay'?Math.max(...fronts.map(f=>g.dist(id,f))):0)+(home!=null?g.dist(id,home)*(posture==='delay'?1:.5):0); return v(b)<v(a)?b:a; }):home;

  /* ④ 割り当てる。傷んだ隊は先に下げ、残りを pri の高い任務から、着くのが早く役の合う隊で埋める。 */
  const assign=new Map(), tasksOut=new Map(), ensure=w=>{ if(!tasksOut.has(w.key))tasksOut.set(w.key,{...w,units:[]}); return tasksOut.get(w.key); };
  const give=(w,u,as)=>{ ensure(w).units.push({id:u.id,as}); assign.set(u.id,w.key); };
  const eta=(u,id)=>(away(u,u.zone)+g.dist(u.zone,id))/Math.max(u.speed||1,1e-6);
  const safe=ownZ.filter(z=>(z.supply??1)>0).map(z=>z.id);
  for(const u of units){
    let m=c.unit.get(u.id); if(!m)c.unit.set(u.id,m={task:null,refit:false,refitAt:-1e9,block:-1e9});
    // 下げるのは、休めば戻るもの（士気・補給）が減ったときだけ。戻らない耐久が減った隊は、攻めに使わず守りと予備に回す。
    const mo=u.morale??1, su=u.supply??1; u.worn=(u.health??1)<D.pull;
    if(m.refit&&(mo>=D.resume&&su>=D.resume||t-m.refitAt>D.refitMax)){ m.refit=false; if(t-m.refitAt>D.refitMax)m.block=t+D.refitMax; }
    else if(!m.refit&&(mo<D.pullMorale||su<D.pullSupply)&&safe.length&&t>=m.block){ m.refit=true; m.refitAt=t; }
    if(u.free===false){ assign.set(u.id,null); continue; }
    if(m.refit&&safe.length){ const id=safe.reduce((a,b)=>eta(u,b)+E.get(b).threat<eta(u,a)+E.get(a).threat?b:a); give({key:'refit:'+id,type:'refit',zone:id,from:null,pri:0,why:'再編する'},u,'main'); }
  }
  want2.sort((a,b)=>b.pri-a.pri);
  const targetOf=w=>w.from&&(!stage(w.key)||stage(w.key).stage==='assemble')?w.from:w.zone, pre=new Map();
  for(const w of want2){ if(w.type!=='seize'&&w.type!=='cut')continue; // 拠点を取れる隊は少ないので、守りに取られる前に攻めへ1つずつ確保する
    const h=units.filter(u=>!assign.has(u.id)&&u.canHold).map(u=>({u,cost:eta(u,targetOf(w))-(c.unit.get(u.id).task===w.key?D.sticky:0)+(u.worn?1e6:0)})).sort((a,b)=>a.cost-b.cost)[0];
    if(h){ give(w,h.u,'main'); pre.set(w.key,h.u.power); } }
  for(const w of want2){
    const fit=w.fit||NPC_FIT[w.type], target=targetOf(w); let got=pre.get(w.key)||0, n=pre.has(w.key)?1:0;
    const attackTask=w.type==='seize'||w.type==='fix'||w.type==='cut';
    const pool=units.filter(u=>!assign.has(u.id)&&fit[u.role]>0) // 傷んだ隊は攻めでは最後に回す（元気な隊が足りないときだけ使う）
      .map(u=>({u,cost:eta(u,target)-(c.unit.get(u.id).task===w.key?D.sticky:0)-fit[u.role]*D.roleBias+(attackTask&&u.worn?1e6:0)})).sort((a,b)=>a.cost-b.cost);
    for(const {u} of pool){ if(n>=w.max||n>0&&got>=w.need||got+u.power>w.cap&&n>0)break; give(w,u,'main'); got+=u.power; n++; }
    if(tasksOut.has(w.key))tasksOut.get(w.key).got=got; // 隊を1つも取れなかった任務は立てない
  }
  // 火力・打撃・護衛・支援は、いちばん大事な攻めの任務（なければ脅威のある守り）に付ける
  const anchor=[...tasksOut.values()].filter(k=>k.type==='seize'&&k.units.length)[0]||[...tasksOut.values()].filter(k=>k.type==='hold'&&k.units.length).sort((a,b)=>b.pri-a.pri)[0];
  for(const u of units){ if(assign.has(u.id))continue;
    if(u.role==='line'||u.role==='shock'||u.role==='recon'||!anchor){ if(spot!=null)give({key:'reserve:'+spot,type:'reserve',zone:spot,from:null,pri:10,why:'予備'},u,'main'); else assign.set(u.id,null); }
    else give(anchor,u,'support'); }
  if(mainZone&&!tasksOut.has('seize:'+mainZone))mainZone=null;

  /* ⑤ 段取り。攻めの任務は 集結 → 前進 → 突入。押し返されたら中止して、しばらくその拠点を避ける。 */
  const powerOf=new Map(units.map(u=>[u.id,u])), now=new Map();
  for(const k of tasksOut.values()){
    const old=c.tasks.get(k.key), mains=k.units.filter(x=>x.as==='main').map(x=>powerOf.get(x.id)), sum=mains.reduce((s,u)=>s+u.power,0);
    const st=old?{...old}:{key:k.key,type:k.type,zone:k.zone,stage:null,since:t,power0:sum};
    st.goalZone=k.goalZone; st.why0=k.why0; st.from=k.from??null;
    if(!old)npcLog(c,t,'task:'+k.type,k.zone,k.why);
    const set=s=>{ if(st.stage!==s){ st.stage=s; st.since=t; npcLog(c,t,k.type+':'+s,k.zone,k.why); } };
    if(k.type==='seize'||k.type==='fix'||k.type==='cut'){
      const z=zById.get(k.zone), reach=(z.r||0)*1.5+1e-9, at=mains.filter(u=>k.from!=null&&away(u,k.from)<=Math.max(zById.get(k.from).r||0,1e-9)*1.5||away(u,k.zone)<=reach).reduce((s,u)=>s+u.power,0);
      if(st.stage===null){ set(k.from!=null&&k.type==='seize'?'assemble':'advance'); st.power0=sum; }
      if(st.stage==='assemble'&&(sum>0&&at/sum>=D.massing||t-st.since>D.assembleMax))set('advance');
      // 前進→突入: 目標の手前に主攻がそろってから一斉に入る（先に着いた隊だけで突っ込まない）。待つのは assembleMax の半分まで。
      const near=mains.filter(u=>away(u,k.zone)<=reach+(z.r||0)).reduce((s,u)=>s+u.power,0);
      if(st.stage==='advance'&&near>0&&st.arriveAt==null)st.arriveAt=t;
      if(st.stage==='advance'&&near>0&&(near/sum>=D.massing||t-st.arriveAt>D.assembleMax/2)){ set(k.type==='fix'?'pin':'assault'); st.power0=sum; } // 突入したときの力を基準に損害を測る
      const weak=k.type==='fix'?D.fix*.5:D.break_; // 助攻はもともと弱い力で押さえるので、中止の境目も低い
      if(sum<=0||(st.stage==='assault'||st.stage==='pin')&&t-st.since>=D.commit&&(sum<E.get(k.zone).foe*weak||sum<D.abort*st.power0)){
        mem(k.zone).failAt=t; npcLog(c,t,k.type+':abort',k.zone,'押し返された'); k.aborted=true; }
    } else set(k.type==='hold'&&E.get(k.zone).threat>0?'defend':'wait');
    st.ids=mains.map(u=>u.id); k.stage=st.stage; k.since=st.since; if(!k.aborted)now.set(k.key,st);
  }
  for(const old of c.tasks.values()){ // 突入した隊が全滅か敗走して任務ごと消えたときも、失敗として覚える（突入の前に消えた任務は失敗に数えない）
    if(now.has(old.key)||tasksOut.has(old.key)||old.stage!=='assault'&&old.stage!=='pin'||isOwn(old.zone))continue;
    if((old.ids||[]).length&&old.ids.every(id=>!powerOf.has(id)||powerOf.get(id).free===false)){ mem(old.zone).failAt=t; npcLog(c,t,old.type+':abort',old.zone,'隊を失った'); } }
  for(const k of [...tasksOut.values()].filter(k=>k.aborted)){ // 中止した隊は出発した拠点へ下げる
    const back=k.from??spot; tasksOut.delete(k.key); if(back==null)continue;
    const w={key:'reserve:'+back,type:'reserve',zone:back,from:null,pri:10,why:'下がって立て直す',stage:'wait',since:t};
    for(const x of k.units){ const u=powerOf.get(x.id); if(!tasksOut.has(w.key))tasksOut.set(w.key,{...w,units:[]}); tasksOut.get(w.key).units.push({id:u.id,as:'main'}); assign.set(u.id,w.key); }
  }
  c.tasks=now; for(const u of units)c.unit.get(u.id).task=assign.get(u.id)??null;
  for(const id of [...c.unit.keys()])if(!powerOf.has(id))c.unit.delete(id);
  return c.plan={time:t,posture,ratio,info,own,foe,main:mainZone,
    tasks:[...tasksOut.values()].map(k=>({key:k.key,type:k.type,zone:k.zone,from:k.from??null,stage:k.stage,since:k.since,why:k.why,units:k.units}))};
}

if(typeof module!=='undefined')module.exports={npcCommander,npcThink,npcGraph,npcRng,npcHash,NPC_FIT};
