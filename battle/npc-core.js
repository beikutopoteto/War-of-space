/* NPC の指揮官: 宇宙と地上で共通の「頭」。設計は docs/npc-doctrine.md。
   状況（sit）だけを読み、任務の一覧（plan）だけを返す。three.js・画面・戦闘の内部には触らない（Node でも動く）。
   モードごとの橋渡し（状況を作ること、任務を通常の命令に直すこと）は battle/npc-ground.js など別のファイル。
   考える順: ①見積もる（力の比・脅威・情報）→ ②姿勢を決める → ③任務を立てる → ④隊を割り当てる → ⑤段取りを進める。 */
function npcRng(seed){ let s=(seed>>>0)||1; return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
function npcHash(v){ const t=String(v); let h=2166136261; for(let i=0;i<t.length;i++){ h^=t.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0)/4294967296; }

/* cfg: {team, side:'foe'|'ally', doctrine:{…}, level:{…}, seed} */
function npcCommander(cfg){
  return {team:cfg.team, side:cfg.side||'foe', D:cfg.doctrine, L:cfg.level, styles:cfg.styles||null, rng:npcRng(cfg.seed||1), seed:cfg.seed||1, t0:null,
    posture:null, postureAt:-1e9, want:null, wantAt:0, probeFrom:null, wonAt:-1e9,
    zone:new Map(), unit:new Map(), tasks:new Map(), graph:null, plan:null, log:[], nextThink:0};
}
function npcLog(c,t,what,zone,why){ c.log.push({t:+t.toFixed(1),what,zone:zone??null,why}); if(c.log.length>200)c.log.shift(); }

/* 拠点のつながり。全点間の最短距離と、守りを避ける経路探し。つながらない所は直線の1.6倍で代用する。 */
function npcGraph(c,sit){
  const key=sit.zones.map(z=>z.id).join(',')+'|'+sit.links.map(l=>l.a+'-'+l.b+':'+Math.round(l.len*10)+(l.open===false?'x':'')+(l.way?l.way[0]:'')).join(',');
  if(c.graph&&c.graph.key===key)return c.graph;
  const ids=sit.zones.map(z=>z.id), ix=new Map(ids.map((id,i)=>[id,i])), n=ids.length;
  const d=ids.map((_,i)=>ids.map((_,j)=>i===j?0:Infinity)), adj=ids.map(()=>[]), pot=ids.map(()=>[]);
  for(const l of sit.links){
    const a=ix.get(l.a), b=ix.get(l.b); if(a===undefined||b===undefined||a===b)continue;
    /* 手段があれば通れるつながり: 橋のない川（way:'gap' で閉じている。工兵が架ける）と海（way:'sea'。揚陸艦で渡る）。
       ふつうの距離と「隣」には数えず、経路探し（route の pen）でだけ使う。 */
    if(l.way==='sea'||l.way==='gap'&&l.open===false){ pot[a].push({j:b,len:l.len,way:l.way}); pot[b].push({j:a,len:l.len,way:l.way}); continue; }
    if(l.open===false)continue;
    if(l.len<d[a][b])d[a][b]=d[b][a]=l.len; adj[a].push({j:b,len:l.len}); adj[b].push({j:a,len:l.len});
  }
  for(let k=0;k<n;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(d[i][k]+d[k][j]<d[i][j])d[i][j]=d[i][k]+d[k][j];
  const pos=sit.zones.map(z=>[z.x,z.z]), air=(i,j)=>Math.hypot(pos[i][0]-pos[j][0],pos[i][1]-pos[j][1])*1.6;
  let span=1; for(let i=0;i<n;i++)for(let j=0;j<n;j++)span=Math.max(span,Number.isFinite(d[i][j])?d[i][j]:air(i,j));
  const dist=(a,b)=>{ const i=ix.get(a), j=ix.get(b); return Number.isFinite(d[i][j])?d[i][j]:air(i,j); };
  /* cost(id): その拠点に入るときの上乗せ。経路は拠点の id の並び。
     pen(way,a,b): 手段の要るつながりを a から b へ渡るときの上乗せ（Infinity は使えない）。渡さなければ、ふつうの道だけを通る。
     返す並びの ways[k] は、k 番目の拠点へ入るときの手段（ふつうの道は null）。 */
  const route=(from,to,cost,pen)=>{
    const s=ix.get(from), e=ix.get(to), best=ids.map(()=>Infinity), prev=ids.map(()=>-1), how=ids.map(()=>null), done=ids.map(()=>false); best[s]=0;
    for(;;){ let i=-1; for(let k=0;k<n;k++)if(!done[k]&&best[k]<Infinity&&(i<0||best[k]<best[i]))i=k; if(i<0||i===e)break; done[i]=true;
      for(const {j,len} of adj[i]){ const v=best[i]+len+(j===e?0:cost(ids[j])); if(v<best[j]){ best[j]=v; prev[j]=i; how[j]=null; } }
      if(pen)for(const {j,len,way} of pot[i]){ const x=pen(way,ids[i],ids[j]); if(!(x<Infinity))continue;
        const v=best[i]+len+x+(j===e?0:cost(ids[j])); if(v<best[j]){ best[j]=v; prev[j]=i; how[j]=way; } } }
    if(best[e]===Infinity)return [from,to];
    const out=[], ways=[]; for(let i=e;i>=0;i=prev[i]){ out.unshift(ids[i]); ways.unshift(how[i]); } out.ways=ways; return out;
  };
  const way=(a,b)=>pot[ix.get(a)].find(q=>ids[q.j]===b)?.way||null; // a と b のあいだの、手段の要るつながり
  return c.graph={key,ids,ix,adj,span,dist,route,way,next:id=>adj[ix.get(id)].map(a=>ids[a.j]),sea:id=>pot[ix.get(id)].filter(q=>q.way==='sea').map(q=>ids[q.j])};
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
  /* 友軍（side:'ally'）は先導（プレイヤーの隊、sit.lead.units）に合わせる。同じ軍なので、先導の位置と命令先（to）は知っていてよい。
     先導の隊が渡されなければ、今までどおり front の制限だけ。値は規範の ally（仮）。 */
  const ally=c.side==='ally', A={commit:.5,easy:.5,rescue:.5,finish:.2,main:.3,...(D.ally||{})};
  /* 手順のある任務（架橋・上陸・補給）。隊の can: 'bridge' 工兵／'ferry' 揚陸艦（lift=運べる隊の数）／'supply' 補給部隊。
     busy は、任務の手順の途中（乗っている・架けている）で命令を受けられない隊。任務から外さない。値は規範の lift（仮）。 */
  const T={gap:6,sea:8,gapMax:120,seaMax:240,supplyGo:.5,supplyWait:40,supplyNeed:.3,...(D.lift||{})};
  const usable=u=>u.free!==false||u.busy, engineers=units.filter(u=>u.can==='bridge'&&usable(u)), ferries=units.filter(u=>u.can==='ferry'&&usable(u));
  const ferryLift=ferries.reduce((s,u)=>s+(u.lift||0),0), byId=new Map(units.map(u=>[u.id,u]));
  if(!c.link)c.link=new Map(); const lkey=(a,b)=>a<b?a+'|'+b:b+'|'+a, linkBad=(a,b)=>t-(c.link.get(lkey(a,b))??-1e9)<D.retry; // 渡れなかったつながりは、しばらく使わない
  const leadU=ally?(sit.lead?.units||[]).filter(u=>u.power>0):[]; for(const u of leadU)if(u.zone==null)u.zone=nearest(u);
  const leadP=leadU.reduce((s,u)=>s+u.power,0), leadAt=u=>away(u,u.zone)<=(zById.get(u.zone).r||0)*2.5+1e-9; // 拠点のそばにいるか
  if(ally)c.lead0=Math.max(c.lead0||0,leadP);
  const leadFull=sit.lead?.full??c.lead0??0, led=ally&&leadFull>0; // full: 先導の初めの力（橋渡しが渡さなければ、見た中の最大）
  const leadIn=new Map(), leadTo=new Map(), bump=(m,id,v)=>m.set(id,(m.get(id)||0)+v);
  for(const u of leadU){ const at=leadAt(u); if(at)bump(leadIn,u.zone,u.power); const to=u.to??(at?u.zone:null); if(to!=null&&zById.has(to))bump(leadTo,to,u.power); }

  /* ① 見積もる。持ち主は「今見えている」か「自軍のもの」のときだけ更新し、あとは覚えている値を使う。 */
  for(const z of zones){
    let m=c.zone.get(z.id); if(!m)c.zone.set(z.id,m={owner:z.owner||z.known||'unknown',seenAt:z.owner?t:-1e9,lostAt:-1e9,failAt:-1e9,jit:(c.rng()-.5)*D.vary});
    if(z.owner==='own'){ if(m.owner!=='own'&&c.posture!==null)c.wonAt=t; m.owner='own'; m.seenAt=t; }
    else { if(m.owner==='own'){ m.lostAt=t; m.owner=z.owner||'foe'; } if(z.seen&&z.owner){ m.owner=z.owner; m.seenAt=t; } }
  }
  const E=new Map(zones.map(z=>[z.id,{own:0,foe:0,threat:0}])), mem=id=>c.zone.get(id), isOwn=id=>mem(id).owner==='own';
  let own=0; for(const u of units){ own+=u.power; E.get(u.zone).own+=u.power; }
  for(const [id,v] of leadIn)E.get(id).own+=v; // 先導がいる拠点は、その力も味方として数える
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
  const ratio=(own+leadP)/Math.max(foe,avg*.25), horizon=L.horizon*g.span;
  c.foe0=Math.max(c.foe0||0,known); const quiet=led&&c.foe0>0&&known<A.finish*c.foe0; // 敵が残りわずか: とどめは先導に残す
  for(const z of zones){ if(!isOwn(z.id))continue; const e=E.get(z.id);
    for(const k of contacts)e.threat+=k.est*Math.max(0,1-g.dist(k.zone,z.id)/horizon)**2; }
  const others=zones.filter(z=>!isOwn(z.id)), ownZ=zones.filter(z=>isOwn(z.id));
  const info=others.length?others.filter(z=>t-mem(z.id).seenAt<=L.memory).length/others.length:1;
  const base=zones.find(z=>z.base==='own'&&isOwn(z.id)), foeBase=zones.find(z=>z.base==='foe');
  const home=base?base.id:ownZ.length?ownZ.reduce((a,b)=>E.get(b.id).own>E.get(a.id).own?b:a).id:units.length?units[0].zone:zones[0]?.id;
  const front=id=>g.next(id).some(j=>!isOwn(j));
  // 先導が負けそう（力が初めの rescue 倍以下、または本営を失った）なら、友軍は制限をゆるめて助けに入る。最終目標だけは取らない。
  const rescue=led&&(leadP<=A.rescue*leadFull||!base), follow=led&&!rescue;
  let leadMain=null; if(led){ let best=A.main*leadP; for(const [id,v] of leadTo)if(!isOwn(id)&&v>0&&v>=best){ best=v; leadMain=id; } } // 先導が攻めている拠点
  if(led){ const mode=rescue?'rescue':quiet?'quiet':'follow'; if(mode!==c.allyMode){ c.allyMode=mode; npcLog(c,t,'ally:'+mode,leadMain,rescue?'先導が危ない':quiet?'とどめは先導に残す':'先導に合わせる'); }
    c.leadSeen=c.leadSeen||new Set(); for(const id of leadIn.keys())c.leadSeen.add(id); }

  /* ② 姿勢。行ったり来たりしないよう、今の姿勢のときは境目を少しずらし、変えるまでに反応の遅れを置く。 */
  const atk=D.attack*(1-.4*(sit.urgency||0))*(c.posture==='attack'||c.posture==='probe'?1-D.band:1), brk=D.break_*(c.posture==='delay'?1+D.band:1);
  /* 作戦の意図（sit.goal）: seize 取る（既定）／hold 守る／delay 時間を稼ぐ（until まで）／withdraw 逃がす。
     守る・時間を稼ぐのあいだは、力の比が低くても姿勢は「守る」のまま。どこを捨てるかは守り方の型が決める。 */
  const G=sit.goal||{}; if(c.t0===null)c.t0=t;
  const keeping=G.type==='hold'||G.type==='delay'&&(G.until==null||t<G.until);
  let want;
  if(G.type==='withdraw')want='delay';
  else if(keeping)want='defend';
  else if(follow)want=ratio<brk?'delay':leadMain!=null&&!quiet?'attack':'defend'; // 友軍は自分の力の比で攻めを決めず、先導が攻めたら出る
  else if(ratio<brk)want='delay';
  else if(ratio<atk||!others.length)want='defend';
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
  /* 守り方の型（攻めていないときだけ）: firm 固守／delay 遅滞／mobile 機動防御／depth 縦深。表は規範のデータ（styles）。
     型の表が無ければ、型なしの今までの守り。must は捨てない拠点（作戦が指定した拠点と本営）。 */
  const defending=posture==='defend'||posture==='delay';
  const styleName=!defending?null:G.type==='withdraw'||posture==='delay'&&!G.style?'delay':G.style||D.defense||null;
  const S=styleName&&c.styles&&c.styles[styleName]||null, must=new Set([...(G.zones||[]),...(base?[base.id]:[])]);
  if(styleName!==c.style){ c.style=styleName; if(S)npcLog(c,t,'style:'+styleName,null,G.type||'力の比'); }
  // 線: 敵地から数えた深さ（1 が前線）
  const depth=new Map(); { let layer=ownZ.filter(z=>front(z.id)).map(z=>z.id), d=1;
    while(layer.length){ for(const id of layer)depth.set(id,d); layer=[...new Set(layer.flatMap(id=>g.next(id)))].filter(id=>isOwn(id)&&!depth.has(id)); d++; } }
  const lines=Math.max(0,...depth.values());
  // 時間を稼ぐとき、残り時間が少ないほど下がらない
  const left=G.type==='delay'&&G.until!=null?Math.max(0,Math.min(1,(G.until-t)/Math.max(1e-6,G.until-c.t0))):1;
  // 守り
  let holdNeed=0;
  for(const z of ownZ){
    const e=E.get(z.id), isBase=base&&z.id===base.id, f=front(z.id), keep=isBase||must.has(z.id);
    const eco=posture==='attack'?D.economy:1, gar=S?S.garrison:D.garrison, hr=S?S.holdRatio:D.holdRatio;
    const thr=S&&S.reach<1?contacts.reduce((v,k)=>v+k.est*Math.max(0,1-g.dist(k.zone,z.id)/(horizon*S.reach))**2,0):e.threat; // 機動防御は近い脅威だけに反応する
    let need=isBase?Math.max(D.baseGuard*avg,thr*hr*eco):thr>0||f?Math.max(gar*avg*eco,thr*hr*eco):S&&S.lines==='all'?gar*avg*.5:0;
    if(S){
      if(S.lines==='front'&&!f&&!keep)need=0;                                  // 遅滞: 前の線だけを持つ
      if(!keep&&S.abandon>0&&e.threat>0&&e.own<e.threat*S.abandon*left)need=0;   // 守りきれない所は手放す（捨てない拠点は別）
      if(G.type==='withdraw')need=f?avg:0;                                       // 逃がす: 前線に殿を1隊ずつ（脅威が強くても残す）
    } else if(posture==='delay'&&!isBase&&e.own<e.threat*D.break_)need=0; // 守りきれない所は捨てて下がる
    const relief=led&&c.leadSeen.has(z.id)&&!leadIn.has(z.id); // 先導が取って離れた拠点
    if(led)need=Math.max(0,need-(leadIn.get(z.id)||0)); // 先導がいる拠点には守備を重ねない。離れたら引き継ぐ
    if(need>0){ holdNeed+=need; push({type:'hold',zone:z.id,pri:isBase?100:(posture==='attack'?45:65)+Math.min(20,thr/avg*5)+(keep?10:0),need,cap:Math.max(need,avg),
      why:isBase?'本営を守る':G.type==='withdraw'?'殿を務める':keep?'ここは渡さない':relief?'引き継いで守る':thr>0?'脅威に備える':'前線を保つ'}); }
  }
  // 攻め
  const cutSet=new Set();
  if(foeBase){ const fronts=others.filter(z=>mem(z.id).owner==='foe'&&g.next(z.id).some(isOwn));
    for(const f of fronts)for(const id of g.route(foeBase.id,f.id,()=>0).slice(1,-1))if(!isOwn(id))cutSet.add(id); }
  // 友軍は最終目標を取らず、先導より先へ出ない。先頭は front の指定、なければ味方の拠点と先導のいる拠点のうち本営からいちばん遠い所。助けに入るときは先へ出てよい。
  const lead=sit.lead?.front; let leadReach=Infinity;
  if(ally&&home!=null&&!rescue){ if(lead!=null)leadReach=g.dist(home,lead); else if(led)leadReach=Math.max(0,...ownZ.map(z=>g.dist(home,z.id)),...[...leadIn.keys()].map(id=>g.dist(home,id))); }
  const allowed=z=>!ally||!z.final&&g.dist(home,z.id)<=leadReach+1e-6;
  const commitCap=follow?A.commit*man:Infinity; // 友軍が攻めに出してよい力
  const score=z=>{ const m=mem(z.id);
    return (z.value||1)*(z.goal?D.wGoal:1)+D.wCut*(cutSet.has(z.id)?1:0)-D.wFoe*E.get(z.id).foe/Math.max(own,1e-9)-D.wDist*(home!=null?g.dist(home,z.id):0)/g.span
      +(t-m.lostAt<D.counterWindow?D.wLost:0)-(t-m.failAt<D.retry?D.wFail:0)+(c.main===z.id?D.stickObj:0)+m.jit; };
  let mainZone=null, offensive=0;
  const stage=k=>c.tasks.get(k), running=[...c.tasks.values()].find(k=>k.type==='seize'&&!isOwn(k.zone));
  // 手段の要るつながりの上乗せ。川は工兵がいれば。海は、味方の拠点から、揚陸艦で運べる力で取れる相手へだけ。
  const pen=(w,a,b)=>linkBad(a,b)?Infinity:w==='gap'?(engineers.length?T.gap:Infinity):ferryLift>0&&isOwn(a)&&!isOwn(b)&&E.get(b).foe*D.attack<=ferryLift*avg?T.sea:Infinity;
  const seize=(z,why,ratioNeed)=>{
    // 最近押し返された拠点は、経路でも大きく避ける。ほかに道がなければ、retry が過ぎるまでその方向へは攻めない。
    const failed=id=>t-mem(id).failAt<D.retry;
    const path=home!=null?g.route(home,z.id,id=>isOwn(id)?0:D.avoid*E.get(id).foe/Math.max(own,1e-9)*g.span+(failed(id)?g.span*10:0),pen):[z.id];
    let i=path.findIndex(id=>!isOwn(id)); if(i<0)i=path.length-1;
    let obj=path[i], from=i>0?path[i-1]:null, via=null, link=null;
    // 目標の手前までに、手段の要るつながり（橋のない川・海）があれば、その手前の拠点から始める
    for(let k=1;k<=i;k++)if(path.ways?.[k]){ via=path.ways[k]; link=[path[k-1],path[k]]; from=path[k-1]; break; }
    // 同じ目標へ向かっている途中なら、次に取る拠点を変えない（敵の見積もりの揺れで行き先が入れ替わるのを防ぐ）
    if(running&&(running.goalZone||running.zone)===z.id&&!isOwn(running.zone)&&!failed(running.zone)){
      const same=running.via&&running.link&&!linkBad(...running.link)&&g.way(...running.link)===running.via&&isOwn(running.link[0])&&(running.via!=='sea'||ferryLift>0)&&(running.via!=='gap'||engineers.length);
      if(same){ obj=running.zone; from=running.from; via=running.via; link=running.link; } // 架けている・渡っている途中は、手段も変えない
      else if(!via){ obj=running.zone; from=running.from!=null&&isOwn(running.from)?running.from:g.next(obj).filter(isOwn).sort((a,b)=>g.dist(home,a)-g.dist(home,b))[0]??null; } }
    if(failed(obj))return false;
    const sea=via==='sea', need=sea?Math.max(avg,E.get(obj).foe*ratioNeed):Math.max(avg,E.get(obj).foe*ratioNeed,posture==='attack'&&!follow?D.mass*man:0);
    mainZone=obj; offensive++;
    push({type:'seize',zone:obj,from,pri:80,need,cap:Math.max(avg,Math.min((1-D.reserve)*man,commitCap)),max:sea?ferryLift:Infinity,
      why:sea?`${why}（海から）`:obj===z.id?why:`${why}（${z.id}への途中）`,why0:why,goalZone:z.id,via,link,blocked:via==='gap'}); // 橋ができるまでは集結で待つ
    if(via==='gap')push({type:'bridge',zone:from,to:link[1],link,pri:82,need:avg,cap:avg*2,max:3,why:'橋を架ける',fit:{line:1,shock:.6}}); // 護衛が岸を押さえ、工兵が架ける
    return true;
  };
  const cand=others.filter(allowed);
  if(follow){ // 先導に合わせる友軍: 支援攻撃と、空いた拠点だけ
    if(!quiet&&posture==='attack'&&leadMain!=null&&t-mem(leadMain).failAt>=D.retry){ // 先導が攻める拠点の手前まで出て撃つ。占領の円には入らない（fix と同じ動き）
      const from=g.next(leadMain).filter(isOwn).sort((a,b)=>g.dist(a,leadMain)-g.dist(b,leadMain))[0]??home; offensive++;
      push({type:'fix',zone:leadMain,from,pri:70,need:Math.max(avg,E.get(leadMain).foe*D.fix),cap:Math.max(avg,commitCap),why:'攻撃を支援する'}); }
    if(!quiet&&posture!=='delay'&&t-c.wonAt>=D.consolidate){ // 敵がほぼいない隣の拠点。先導が向かっている所には手を出さない
      const easy=cand.filter(z=>z.id!==leadMain&&!leadTo.has(z.id)&&g.next(z.id).some(isOwn)&&E.get(z.id).foe<=A.easy*avg);
      const cur=running&&easy.find(z=>z.id===(running.goalZone||running.zone));
      if(!(cur&&seize(cur,running.why0||'空いた所を取る',D.attack)))for(const z of easy.sort((a,b)=>score(b)-score(a)))if(seize(z,'空いた所を取る',D.attack))break;
    }
  } else if(posture==='attack'&&cand.length){
    const keep=running&&running.stage!=='assemble'&&cand.find(z=>z.id===(running.goalZone||running.zone)); // 動き出した主攻は変えない
    if(keep)seize(keep,running.why0||'主攻を続ける',D.attack);
    else if(t-c.wonAt>=D.consolidate){ // 点数の高い順に、攻められる所が見つかるまで試す
      for(const best of [...cand].sort((a,b)=>score(b)-score(a)))if(seize(best,best.goal?'目標を取る':cutSet.has(best.id)?'補給線を切る':'前へ出る',D.attack)){ c.main=best.id; break; } }
  } else if(posture==='defend'&&(!ally||rescue)&&G.type!=='withdraw'){ // 取られた拠点を、余力があれば取り返す
    // 型ごとの取り返し: 固守は捨てない拠点だけ（何度でも）、遅滞はしない、機動防御は何でも、縦深は線が2本残っているあいだ
    const rule=S?S.counter:'any', cr=S&&S.counterRatio||D.counter, spare=Math.max(0,man-holdNeed);
    const lost=rule==='none'?[]:cand.filter(z=>(must.has(z.id)&&mem(z.id).lostAt>-1e9||t-mem(z.id).lostAt<D.counterWindow&&(rule==='any'||rule==='depth'&&lines>=2))&&E.get(z.id).foe*cr<=spare);
    // 取り返しが先。なければ、隣の守りの薄い拠点（中立など）を余力で取る（型が許すとき）
    const opp=!S||S.opportunism, easy=!opp?[]:cand.filter(z=>!lost.includes(z)&&g.next(z.id).some(isOwn)&&Math.max(avg,E.get(z.id).foe*D.attack)<=spare&&t-c.wonAt>=D.consolidate);
    // 取りに出た所は、余力が少し減ったくらいでは変えない（出したり引っ込めたりしない）
    const cur=running&&cand.find(z=>z.id===(running.goalZone||running.zone)&&(lost.includes(z)||opp&&Math.max(avg,E.get(z.id).foe*D.attack)<=spare*1.6+avg)); // 型が禁じたら、出ていた隊も戻す
    let done=!!cur&&seize(cur,running.why0||'空いた所を取る',lost.includes(cur)?cr:D.attack);
    if(!done)for(const z of lost.sort((a,b)=>score(b)-score(a)))if(seize(z,'取り返す',cr)){ done=true; break; }
    if(!done)for(const z of easy.sort((a,b)=>score(b)-score(a)))if(seize(z,'空いた所を取る',D.attack))break;
  }
  if(posture==='attack'&&mainZone&&!follow){
    if(D.feint&&offensive<L.tasks){ // 助攻: 主攻とは別の、敵がいる隣の拠点を押さえつける
      const f=cand.filter(z=>z.id!==mainZone&&t-mem(z.id).failAt>=D.retry&&g.next(z.id).some(isOwn)&&E.get(z.id).foe>0).sort((a,b)=>E.get(b.id).foe-E.get(a.id).foe)[0];
      if(f){ offensive++; push({type:'fix',zone:f.id,from:g.next(f.id).filter(isOwn).sort((a,b)=>g.dist(a,f.id)-g.dist(b,f.id))[0],pri:50,need:Math.max(avg,E.get(f.id).foe*D.fix),cap:Math.max(avg,E.get(f.id).foe*D.fix*1.5),why:'敵を引きつける'}); }
    }
    if(D.wCut>0&&offensive<L.tasks){ // 遮断: 敵の本営と前線のあいだの、守りの薄い拠点
      const k=cand.filter(z=>cutSet.has(z.id)&&z.id!==mainZone&&t-mem(z.id).failAt>=D.retry&&!want2.some(w=>w.zone===z.id)&&E.get(z.id).foe<=avg*D.cutMax).sort((a,b)=>E.get(a.id).foe-E.get(b.id).foe)[0];
      if(k){ offensive++; const port=ferryLift>0?g.sea(k.id).find(id=>isOwn(id)&&!linkBad(id,k.id)):null; // 海でつながっていれば、前線を通らず海から回る
        push({type:'cut',zone:k.id,from:port??ownZ.map(z=>z.id).sort((a,b)=>g.dist(a,k.id)-g.dist(b,k.id))[0]??null,pri:48,need:avg,cap:avg*1.5,max:port?Math.min(2,ferryLift):2,
          why:port?'補給線を切る（海から）':'補給線を切る',via:port?'sea':null,link:port?[port,k.id]:null}); }
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
  const keepers=[], kept=new Map();
  for(const u of units){
    let m=c.unit.get(u.id); if(!m)c.unit.set(u.id,m={task:null,refit:false,refitAt:-1e9,block:-1e9});
    // 下げるのは、休めば戻るもの（士気・補給）が減ったときだけ。戻らない耐久が減った隊は、攻めに使わず守りと予備に回す。
    const mo=u.morale??1, su=u.supply??1; u.worn=(u.health??1)<D.pull;
    if(m.refit&&(mo>=D.resume&&su>=D.resume||t-m.refitAt>D.refitMax)){ m.refit=false; if(t-m.refitAt>D.refitMax)m.block=t+D.refitMax; }
    else if(!m.refit&&(mo<D.pullMorale||su<D.pullSupply)&&safe.length&&t>=m.block){ m.refit=true; m.refitAt=t; }
    if(u.free===false){ if(u.busy&&m.task)keepers.push(u); else assign.set(u.id,null); continue; }
    if(m.refit&&safe.length){ const id=safe.reduce((a,b)=>eta(u,b)+E.get(b).threat<eta(u,a)+E.get(a).threat?b:a); give({key:'refit:'+id,type:'refit',zone:id,from:null,pri:0,why:'再編する'},u,'main'); }
  }
  want2.sort((a,b)=>b.pri-a.pri);
  for(const u of keepers){ const m=c.unit.get(u.id), w=want2.find(w=>w.key===m.task); // 手順の途中の隊は、任務が続くかぎり外さない
    if(!w){ assign.set(u.id,null); continue; } give(w,u,m.as||'main'); if((m.as||'main')==='main'){ const v=kept.get(w.key)||{got:0,n:0}; v.got+=u.power; v.n++; kept.set(w.key,v); } }
  for(const w of want2){ if(w.type!=='bridge')continue; // 橋を架ける工兵（いちばん早く着く1隊）
    if(tasksOut.get(w.key)?.units.some(x=>x.as==='work'))continue;
    const e=engineers.filter(u=>!assign.has(u.id)).sort((a,b)=>eta(a,w.zone)-eta(b,w.zone))[0]; if(e)give(w,e,'work'); }
  const targetOf=w=>w.from&&(!stage(w.key)||stage(w.key).stage==='assemble')?w.from:w.zone, pre=new Map();
  for(const w of want2){ if(w.type!=='seize'&&w.type!=='cut')continue; // 拠点を取れる隊は少ないので、守りに取られる前に攻めへ1つずつ確保する
    const h=units.filter(u=>!assign.has(u.id)&&u.canHold).map(u=>({u,cost:eta(u,targetOf(w))-(c.unit.get(u.id).task===w.key?D.sticky:0)+(u.worn?1e6:0)})).sort((a,b)=>a.cost-b.cost)[0];
    if(h){ give(w,h.u,'main'); pre.set(w.key,h.u.power); } }
  for(const w of want2){
    const fit=w.fit||NPC_FIT[w.type], target=targetOf(w); let got=(pre.get(w.key)||0)+(kept.get(w.key)?.got||0), n=(pre.has(w.key)?1:0)+(kept.get(w.key)?.n||0);
    const attackTask=w.type==='seize'||w.type==='fix'||w.type==='cut';
    const pool=units.filter(u=>!assign.has(u.id)&&fit[u.role]>0) // 傷んだ隊は攻めでは最後に回す（元気な隊が足りないときだけ使う）
      .map(u=>({u,cost:eta(u,target)-(c.unit.get(u.id).task===w.key?D.sticky:0)-fit[u.role]*D.roleBias+(attackTask&&u.worn?1e6:0)})).sort((a,b)=>a.cost-b.cost);
    for(const {u} of pool){ if(n>=w.max||n>0&&got>=w.need||got+u.power>w.cap&&n>0)break; give(w,u,'main'); got+=u.power; n++; }
    if(tasksOut.has(w.key))tasksOut.get(w.key).got=got; // 隊を1つも取れなかった任務は立てない
  }
  for(const k of tasksOut.values()){ if(k.via!=='sea'||!k.units.some(x=>x.as==='main'))continue; // 海から行く任務に揚陸艦を付ける
    for(const u of ferries)if(!assign.has(u.id))give(k,u,'lift'); }
  for(const u of units){ if(assign.has(u.id)||u.can!=='supply')continue; // 補給部隊は、補給の減りがいちばん大きい任務へ（攻めの任務を優先）
    let best=null, bv=T.supplyNeed;
    for(const k of tasksOut.values()){ if(k.type==='refit'||k.type==='reserve'||k.type==='retire')continue;
      const v=k.units.reduce((s,x)=>s+(x.as==='main'?1-(byId.get(x.id).supply??1):0),0)*(k.type==='seize'?1.5:1); if(v>bv){ bv=v; best=k; } }
    if(best)give(best,u,'supply'); }
  // 火力・打撃・護衛・支援は、いちばん大事な攻めの任務（なければ脅威のある守り）に付ける
  const anchor=[...tasksOut.values()].filter(k=>k.type==='seize'&&k.units.length)[0]||[...tasksOut.values()].filter(k=>k.type==='hold'&&k.units.length).sort((a,b)=>b.pri-a.pri)[0];
  const exit=G.type==='withdraw'?(G.zones||[]).find(id=>zById.has(id))??home:null;
  for(const u of units){ if(assign.has(u.id))continue;
    if(exit!=null)give({key:'retire:'+exit,type:'retire',zone:exit,from:null,pri:10,why:'退く'},u,'main'); // 逃がす: 殿のほかは退避点へ
    else if(u.role==='line'||u.role==='shock'||u.role==='recon'||!anchor){ if(spot!=null)give({key:'reserve:'+spot,type:'reserve',zone:spot,from:null,pri:10,why:'予備'},u,'main'); else assign.set(u.id,null); }
    else give(anchor,u,'support'); }
  if(mainZone&&!tasksOut.has('seize:'+mainZone))mainZone=null;

  /* ⑤ 段取り。攻めの任務は 集結 → 前進 → 突入。押し返されたら中止して、しばらくその拠点を避ける。 */
  const powerOf=new Map(units.map(u=>[u.id,u])), now=new Map();
  for(const k of tasksOut.values()){
    const old=c.tasks.get(k.key), mains=k.units.filter(x=>x.as==='main').map(x=>powerOf.get(x.id)), sum=mains.reduce((s,u)=>s+u.power,0);
    const st=old?{...old}:{key:k.key,type:k.type,zone:k.zone,stage:null,since:t,power0:sum};
    st.goalZone=k.goalZone; st.why0=k.why0; st.from=k.from??null; st.via=k.via??null; st.link=k.link??null;
    if(!old)npcLog(c,t,'task:'+k.type,k.zone,k.why);
    const set=s=>{ if(st.stage!==s){ st.stage=s; st.since=t; npcLog(c,t,k.type+':'+s,k.zone,k.why); } };
    if(k.type==='seize'||k.type==='fix'||k.type==='cut'){
      const z=zById.get(k.zone), reach=(z.r||0)*1.5+1e-9, at=mains.filter(u=>k.from!=null&&away(u,k.from)<=Math.max(zById.get(k.from).r||0,1e-9)*1.5||away(u,k.zone)<=reach).reduce((s,u)=>s+u.power,0);
      if(st.stage===null){ set(k.from!=null&&(k.type==='seize'||k.via==='sea')?'assemble':'advance'); st.power0=sum; }
      // 補給が減っている主攻は、集結地点で補給を待ってから出る（supplyWait まで）。橋を待つあいだは、時間切れでも出ない。
      const low=k.type==='seize'&&mains.length>0&&mains.reduce((s,u)=>s+(u.supply??1),0)/mains.length<T.supplyGo&&t-st.since<=T.supplyWait;
      if(low&&!st.resupply&&st.stage==='assemble'){ st.resupply=true; npcLog(c,t,'seize:resupply',k.zone,'補給を待つ'); }
      if(st.stage==='assemble'&&!k.blocked&&(sum>0&&at/sum>=D.massing&&!low||t-st.since>D.assembleMax))set('advance');
      if(k.via==='sea'&&st.stage==='advance'&&t-st.since>T.seaMax){ c.link.set(lkey(...k.link),t); mem(k.zone).failAt=t; npcLog(c,t,k.type+':abort',k.zone,'上陸できなかった'); k.aborted=true; }
      // 前進→突入: 目標の手前に主攻がそろってから一斉に入る（先に着いた隊だけで突っ込まない）。待つのは assembleMax の半分まで。
      const near=mains.filter(u=>away(u,k.zone)<=reach+(z.r||0)).reduce((s,u)=>s+u.power,0);
      if(st.stage==='advance'&&near>0&&st.arriveAt==null)st.arriveAt=t;
      if(st.stage==='advance'&&near>0&&(near/sum>=D.massing||t-st.arriveAt>D.assembleMax/2)){ set(k.type==='fix'?'pin':'assault'); st.power0=sum; } // 突入したときの力を基準に損害を測る
      const weak=k.type==='fix'?D.fix*.5:D.break_; // 助攻はもともと弱い力で押さえるので、中止の境目も低い
      if(sum<=0||(st.stage==='assault'||st.stage==='pin')&&t-st.since>=D.commit&&(sum<E.get(k.zone).foe*weak||sum<D.abort*st.power0)){
        mem(k.zone).failAt=t; npcLog(c,t,k.type+':abort',k.zone,'押し返された'); k.aborted=true; }
    } else if(k.type==='bridge'){ set('work'); // 手順（岸を押さえる→架ける）は橋渡しが進める。長くかかりすぎたら、そのつながりをしばらくあきらめる
      if(t-st.since>T.gapMax){ c.link.set(lkey(...k.link),t); npcLog(c,t,'bridge:abort',k.zone,'架けられなかった'); k.aborted=true; }
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
  const asOf=new Map(); for(const k of tasksOut.values())for(const x of k.units)asOf.set(x.id,x.as);
  c.tasks=now; for(const u of units){ const m=c.unit.get(u.id); m.task=assign.get(u.id)??null; m.as=asOf.get(u.id)??null; }
  for(const id of [...c.unit.keys()])if(!powerOf.has(id))c.unit.delete(id);
  return c.plan={time:t,posture,ratio,info,own,foe,main:mainZone,lead:led?{main:leadMain,mode:c.allyMode,power:leadP}:null,
    tasks:[...tasksOut.values()].map(k=>({key:k.key,type:k.type,zone:k.zone,from:k.from??null,stage:k.stage,since:k.since,why:k.why,units:k.units,
      via:k.via??null,link:k.link??null,to:k.to??null,blocked:!!k.blocked}))};
}

if(typeof module!=='undefined')module.exports={npcCommander,npcThink,npcGraph,npcRng,npcHash,NPC_FIT};
