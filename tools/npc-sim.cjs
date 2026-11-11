/* 実ゲームChromium。node tools/npc-sim.cjs exercise2 mars earth standard 1 600
   node tools/npc-sim.cjs baikonur mars earth standard 1 300 --idle
   --intent0 seize --intent1 hold:firm:F,E / delay:delay:F:300 で軍ごとの作戦の意図。
   charybdis mars earth standard 1 600 [--no-npc]: 自軍はNPC（NPCなし比較ではautoAI）、敵はNPCまたは元の台本。
   --ally 0.5: 地上の軍0を先導と友軍へ分割（隊数の割合、0以上1未満）。
   --brief は経過の要約のみ。--profile は関数別の包括／自己時間を足す（計測負荷あり）。
   seedはゲームの乱数と指揮官の乱数を固定。通常はJSONと表を出す。 */
const {openGame}=require('./browser.cjs');
function setupNpcSim(cfg){
  if(cfg.terrain==='charybdis')return setupSpaceNpcSim(cfg);
  let rng=cfg.seed>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const base=WOS_DATA.operations.find(o=>o.id===(['exercise2','baikonur'].includes(cfg.terrain)?'baikonur':'ground'+cfg.terrain));
  // exercise2は過去の計測と同じ48kmの仮配備を維持。広域演習は作戦そのもの。
  const fixtureNames={inf:'第1 強化歩兵中隊',tank:'第2 主力戦車中隊',heavy:'第3 重強化歩兵中隊',scout:'第4 斥候中隊',air:'第5 攻撃航空隊',aa:'第6 自走対空砲中隊',gun:'第7 自走砲中隊',apc:'第8 装甲兵員輸送車中隊',eng:'第9 工兵中隊',ship:'演習砲撃艦',landing:'演習揚陸艦',cargo:'第10 上陸歩兵中隊'};
  const fixtureUnit=(name,groundKind,x,y,band='ground')=>({name,groundKind,band,type:'cv',n:1,scale:.3,pos:[(x-24)*4,(18-y)*4],alt:0,stance:'evade'});
  const fixtureSea=(name,type,x,y)=>({...fixtureUnit(name,'sea',x,y,'sea'),type,team:0});
  const source={...base,...(cfg.terrain==='exercise2'?{ground:'exercise2',
    groundHQ:{0:'B',1:'F'},groundSupportSites:['B','C','F'],
    groundSites:[{site:'A',owner:0},{site:'B',owner:0},{site:'C',owner:null},{site:'D',owner:null},{site:'E',owner:1},{site:'F',owner:1}],view:{target:[-56,-40],dist:100,dir:[0,1,.65],max:350},
    // 案内なしの仮配置。チュートリアル2は groundTutorial.quick に従来配置を保持。
    quick:[fixtureUnit(fixtureNames.inf,'infantry',7,27),fixtureUnit(fixtureNames.tank,'vehicle',11,25),fixtureUnit(fixtureNames.heavy,'heavyInfantry',17,25),fixtureUnit(fixtureNames.scout,'scout',22,29),fixtureUnit(fixtureNames.air,'attack',15,24,'high'),fixtureUnit(fixtureNames.aa,'mobileAA',20,27),fixtureUnit(fixtureNames.gun,'artillery',11,22),fixtureUnit(fixtureNames.apc,'apc',9,29),fixtureUnit(fixtureNames.eng,'engineer',12,27),fixtureUnit('第11 強化歩兵中隊','infantry',21,28)],
    groundSea:[fixtureSea(fixtureNames.ship,'cl',17,4),{...fixtureSea(fixtureNames.landing,'dd',12,5),groundLanding:true,groundCargo:[fixtureUnit(fixtureNames.cargo,'infantry',12,5)]}],
    // 演習専用の仮配備。案内付きの敵は groundTutorial 側で従来配備を上書きする。
    enemies:[fixtureUnit('仮想敵 歩兵','infantry',34,22),fixtureUnit('仮想敵 戦車','vehicle',35.5,23),
      fixtureUnit('仮想敵 第2歩兵','infantry',40,27),fixtureUnit('仮想敵 第3歩兵','infantry',42,28),fixtureUnit('仮想敵 第2戦車','vehicle',40,25.5),
      fixtureUnit('仮想敵 自走砲','artillery',42,26),fixtureUnit('仮想敵 斥候','scout',26,21),fixtureUnit('仮想敵 航空','fighter',40,28,'low')].map(f=>({...f,stance:'engage'})),
  }: {})};
  source.npc=cfg.idle?{1:{doctrine:cfg.doctrines[0],level:cfg.level}}:{0:{doctrine:cfg.doctrines[0],level:cfg.level},1:{doctrine:cfg.doctrines[1],level:cfg.level}};
  for(const [team,intent] of Object.entries(cfg.intents||{}))if(source.npc[team])source.npc[team].intent=intent;
  source.npcSeed=cfg.seed;source.groundStaticEnemies=false;
  // 検証場の中立全占領による早期終了を使わず、本営占領／全滅で両軍を測る（道具の実行中だけ）。
  source.win={type:'groundHQ',text:'検証: 敵本営占領または敵全滅'};
  // 広域検証の配備はこの道具の中だけ。作戦のファイルへは追加しない。
  if(cfg.terrain.startsWith('field')){
    const d=WOS_TERRAIN[cfg.terrain],kinds=['infantry','infantry','infantry','infantry','vehicle','vehicle','heavyInfantry','heavyInfantry','artillery','scout','fighter','supply'];
    const force=team=>{const s=d.sites.find(s=>s.id===source.groundHQ[team]);return kinds.map((kind,i)=>({name:(team?'赤':'青')+' 検証第'+(i+1)+'中隊',groundKind:kind,type:'cv',n:1,scale:.3,
      pos:[(s.x+(i%4-1.5)*1.5-d.meta.widthKm/2)*GROUND_SCALE,(d.meta.heightKm/2-s.y-(Math.floor(i/4)-1)*1.5)*GROUND_SCALE],band:kind==='fighter'?'low':'ground',stance:'engage'}));};
    source.quick=force(0);source.enemies=force(1);source.groundSea=[];
  }
  const index=WOS_DATA.operations.findIndex(o=>o.id===source.id);WOS_DATA.operations[index]=source;
  autoMode=false; // 比較ではデバッグ自軍指揮官を重ねない。
  reset({op:source.id,fleets:source.quick});if(talking)endTalk();setSpeed(0);endDeploy();
  if(cfg.ally>0)npcGroundSplit(cfg.ally);
  window.npcMeasure={ally:{captures:0,totalCaptures:0,finalCaptures:0,aheadTasks:0,seenTasks:new Set(),modeSeconds:{follow:0,quiet:0,rescue:0},previousLead:new Map(),pending:new Map(),relief:[]},cfg,start:gameSec,steps:0,stepMs:0,idle:[0,0],unitTime:[0,0],concentration:[0,0],assaultTime:[0,0],firstContact:null,changes:[0,0],last:[null,null],aborts:[0,0],
    logs:[],postures:[],lowSupplyMax:[0,0],events:[],initialOwners:groundSites.map(s=>({site:s.id,owner:s.owner})),owners:Object.fromEntries(groundSites.map(s=>[s.id,s.owner])),samples:[]};
  // 中止logは200件のリングを越えても数える。
  const oldLog=npcLog;npcLog=(c,t,what,zone,why)=>{
    const m=npcMeasure,entry={team:c.team,time:+(t-m.start).toFixed(2),what,zone:zone??null,why};
    if(what.endsWith(':abort'))m.aborts[c.team]++;
    if(what.startsWith('posture:'))m.postures.push(entry);
    if(/^(posture:|style:|task:seize$|seize:|fix:abort$)/.test(what))m.logs.push(entry);
    oldLog(c,t,what,zone,why);
  };
}
function advanceNpcSim(seconds){
  if(npcMeasure.cfg.terrain==='charybdis')return advanceSpaceNpcSim(seconds);
  const m=npcMeasure,end=Math.min(m.cfg.seconds,seconds),dt=.05;
  while(gameSec-m.start<end-1e-8&&!over){
    const before=performance.now(),at=gameSec;if(window.npcProfile)npcProfile.active=true;
    try{step(dt);}finally{if(window.npcProfile)npcProfile.active=false;}
    m.stepMs+=performance.now()-before;m.steps++;
    for(const team of [0,1]){
      const live=fleets.filter(f=>f.team===team&&f.alive&&f.hpPool>0&&!f.embarked&&!groundAbsent(f)),plan=npcGroundState?.commanders.get(team)?.plan;
      m.lowSupplyMax[team]=Math.max(m.lowSupplyMax[team],live.filter(f=>Number.isFinite(f.groundSupply)&&f.groundSupply<groundSupplyRules().max*.2).length);
      for(const f of live){m.unitTime[team]+=dt;const engaged=!!(f.fireTarget||f.order?.type==='attack'||f.groundHitLeft>0||fleets.some(t=>groundFireSolution(f,t)));
        if(!f.order&&!engaged)m.idle[team]+=dt;
      }
      if(plan?.main&&m.last[team]&&m.last[team]!==plan.main)m.changes[team]++;
      if(plan?.main)m.last[team]=plan.main;
      const main=plan?.tasks.find(k=>k.type==='seize'&&k.stage==='assault');
      if(main){const assigned=new Set(main.units.map(x=>x.id)),power=live.reduce((s,f)=>s+npcGroundPower(f),0);m.concentration[team]+=live.filter(f=>assigned.has(f.id)).reduce((s,f)=>s+npcGroundPower(f),0)/Math.max(1e-9,power)*dt;m.assaultTime[team]+=dt;}
    }
    if(m.cfg.ally>0)sampleNpcAlly(gameSec-at);
    if(m.firstContact===null&&fleets.some(f=>f.groundContacts?.[1-f.team]))m.firstContact=gameSec-m.start;
    for(const s of groundSites)if(m.owners[s.id]!==s.owner){
      const ally=npcGroundState?.commanders.get('0:ally'),byAlly=s.owner===0&&!!ally&&fleets.some(f=>ally.unitIds.has(f.id)&&groundCanCapture(f)&&groundDistanceTo(f,s)<=s.captureRadius);
      if(s.owner===0){m.ally.totalCaptures++;if(byAlly){m.ally.captures++;if(s.id===op.groundHQ?.[1])m.ally.finalCaptures++;}}
      m.events.push({time:+(gameSec-m.start).toFixed(2),site:s.id,owner:s.owner,...(m.cfg.ally>0?{ally:byAlly}:{})});m.owners[s.id]=s.owner;
    }
    if(m.steps%600===0){
      const units=fleets.filter(f=>f.alive&&f.hpPool>0).map(f=>({id:f.id,team:f.team,groundKind:f.groundKind,
        supply:f.groundSupply??null,morale:f.groundMorale??null,x:+groundMapX(f.pos.x).toFixed(2),y:+groundMapY(f.pos.z).toFixed(2),
        order:f.order?.type||null,task:[...(npcGroundState?.commanders.values()||[])].find(c=>c.team===f.team&&(!c.unitIds||c.unitIds.has(f.id)))?.unit.get(f.id)?.task||null,
        road:npcGroundState?.roadWork?.get(f.team)?.id===f.id?(npcGroundState.roadWork.get(f.team).edge?'connect':'return'):[...(npcGroundState?.roadRear?.values()||[])].includes(f.id)?'rear':null,
        destination:f.order?.dest?{x:+groundMapX(f.order.dest.x).toFixed(2),y:+groundMapY(f.order.dest.z).toFixed(2)}:null}));
      const tasks=[0,1].map(team=>{const counts={};for(const u of units.filter(u=>u.team===team)){const type=u.task?.split(':')[0]||'none';counts[type]=(counts[type]||0)+1;}return counts;});
      m.samples.push({time:+(gameSec-m.start).toFixed(1),tasks,units});
    }
    // 道具だけの両軍対称の終端。本体の敗北条件には足さない。
    if(!m.cfg.idle&&groundSites.some(s=>s.id===op.groundHQ?.[0]&&s.owner===1)){m.winner=1;break;}
  }
  return over||m.winner!==undefined||gameSec-m.start>=m.cfg.seconds-1e-8;
}
// 先頭の定義は頭と同じ道路距離。友軍の任務が新しく向いた時だけ違反を数える（先導の攻撃目標への支援は除く）。
function sampleNpcAlly(dt){
  const a=npcMeasure.ally,c=npcGroundState.commanders.get('0:ally');if(!c)return;
  const sit=npcGroundSituation(c),g=npcGraph(c,sit),home=sit.zones.find(z=>z.base==='own')?.id;
  const leads=sit.lead.units,nearest=u=>sit.zones.reduce((a,b)=>Math.hypot(u.x-a.x,u.z-a.z)<Math.hypot(u.x-b.x,u.z-b.z)?a:b);
  const nearLead=new Set(leads.map(u=>[u,nearest(u)]).filter(([u,z])=>Math.hypot(u.x-z.x,u.z-z.z)<=z.r*2.5+1e-9).map(([,z])=>z.id));
  const own=sit.zones.filter(z=>z.owner==='own'),reach=home==null?Infinity:Math.max(0,...own.map(z=>g.dist(home,z.id)),...[...nearLead].map(id=>g.dist(home,id)));
  const mode=c.plan?.lead?.mode;if(mode)a.modeSeconds[mode]+=dt;
  const activeTasks=new Set();
  for(const k of c.plan?.tasks||[]){
    if(!['seize','fix','cut'].includes(k.type)||!k.units.length)continue;
    activeTasks.add(k.key);if(a.seenTasks.has(k.key))continue;
    // 先導の攻撃目標への支援（fix、占領の円に入らない）は設計どおりなので数えない（docs/npc-doctrine.md 5.2）
    if(k.type==='fix'&&k.zone===c.plan?.lead?.main)continue;
    if(mode!=='rescue'&&home!=null&&g.dist(home,k.zone)>reach+1e-6)a.aheadTasks++;
  }
  a.seenTasks=activeTasks;
  for(const z of sit.zones){
    const front=g.next(z.id).some(id=>sit.zones.find(x=>x.id===id)?.owner!=='own');
    const at=nearLead.has(z.id);
    if(z.owner!=='own'||!front){a.pending.delete(z.id);a.previousLead.set(z.id,at);continue;}
    if(a.previousLead.get(z.id)&&!at&&!a.pending.has(z.id))a.pending.set(z.id,gameSec);
    if(at)a.pending.delete(z.id);
    if(a.pending.has(z.id)){
      const guard=(c.plan?.tasks||[]).filter(k=>k.type==='hold'&&k.zone===z.id).flatMap(k=>k.units).some(x=>{
        const f=fleets.find(f=>f.id===x.id);return f?.alive&&Math.hypot(groundMapX(f.pos.x)-z.x,groundMapY(f.pos.z)-z.z)<=z.r;
      });
      if(guard){a.relief.push(gameSec-a.pending.get(z.id));a.pending.delete(z.id);}
    }
    a.previousLead.set(z.id,at);
  }
}
function npcSimResult(){
  if(npcMeasure.cfg.terrain==='charybdis')return spaceNpcSimResult();
  const m=npcMeasure,t=npcGroundState?.timings||{count:0,total:0,max:0},round=x=>+x.toFixed(4),live=team=>fleets.filter(f=>f.team===team&&f.alive&&f.hpPool>0);
  return {config:m.cfg,winner:m.winner??(over?(outcome?0:1):null),seconds:round(gameSec-m.start),remaining:[0,1].map(team=>({units:live(team).length,power:round(live(team).reduce((s,f)=>s+npcGroundPower(f),0))})),
    idle:[0,1].map(team=>round(m.idle[team]/Math.max(1e-9,m.unitTime[team]))),mainConcentration:[0,1].map(team=>m.assaultTime[team]?round(m.concentration[team]/m.assaultTime[team]):null),
    firstContact:m.firstContact===null?null:round(m.firstContact),targetChanges:m.changes,aborts:m.aborts,think:{count:t.count,meanMs:round(t.total/Math.max(1,t.count)),maxMs:round(t.max)},step:{count:m.steps,meanMs:round(m.stepMs/Math.max(1,m.steps))},
    ally:m.cfg.ally>0?{captures:m.ally.captures,captureShare:round(m.ally.captures/Math.max(1,m.ally.totalCaptures)),finalCaptures:m.ally.finalCaptures,aheadTasks:m.ally.aheadTasks,reliefCount:m.ally.relief.length,reliefMeanSec:m.ally.relief.length?round(m.ally.relief.reduce((s,x)=>s+x,0)/m.ally.relief.length):null,reliefPending:m.ally.pending.size,modeShare:Object.fromEntries(Object.entries(m.ally.modeSeconds).map(([k,v])=>[k,round(v/Math.max(1e-9,gameSec-m.start))]))}:null,
    initialOwners:m.initialOwners,sites:m.owners,captures:m.events,postures:m.postures,logs:m.logs,lowSupplyMax:m.lowSupplyMax,
    units:fleets.map(f=>({id:f.id,team:f.team,groundKind:f.groundKind,alive:f.alive,hp:f.hpPool,supply:f.groundSupply??null,morale:f.groundMorale??null})),
    profile:window.npcProfile?Object.fromEntries(Object.entries(npcProfile.rows).map(([name,v])=>[name,{count:v.count,totalMs:round(v.total),selfMs:round(v.self),meanMs:round(v.total/Math.max(1,v.count))}])):null,
    debug:npcDebug(),samples:m.samples};
}
function table(r){
  return ['| 地形 / seed | 勝者 | 秒 | 残存 0/1 | 棒立ち 0/1 | 主攻集中 0/1 | 初接触 | 変更 0/1 | 中止 0/1 | 判断 平均/最大ms | step平均ms |',
    '|---|---|---:|---|---|---|---:|---|---|---|---:|',
    `| ${r.config.terrain} / ${r.config.seed} | ${r.winner??'未決'} | ${r.seconds} | ${r.remaining.map(x=>x.units).join('/')} | ${r.idle.join('/')} | ${r.mainConcentration.map(x=>x??'突入なし').join('/')} | ${r.firstContact??'なし'} | ${r.targetChanges.join('/')} | ${r.aborts.join('/')} | ${r.think.meanMs}/${r.think.maxMs} | ${r.step.meanMs} |`].join('\n');
}
// 関数を書き換えるのは道具のページ内だけ。自己時間は入れ子の計測分を引く。
function installNpcProfile(){
  window.npcProfile={rows:{},stack:[],active:false};
  const wrap=(name,fn)=>(...args)=>{
    const p=npcProfile;if(!p.active)return fn(...args);
    const row=p.rows[name]||(p.rows[name]={count:0,total:0,self:0}),frame={children:0},start=performance.now();p.stack.push(frame);
    try{return fn(...args);}finally{const elapsed=performance.now()-start;p.stack.pop();row.count++;row.total+=elapsed;row.self+=elapsed-frame.children;
      if(p.stack.length)p.stack[p.stack.length-1].children+=elapsed;}
  };
  step=wrap('step',step);
  groundUpdateSight=wrap('groundUpdateSight',groundUpdateSight);
  groundPath=wrap('groundPath',groundPath);groundMovePath=wrap('groundMovePath',groundMovePath);groundFollow=wrap('groundFollow',groundFollow);
  groundSupplyRoadCapture=wrap('groundSupplyRoadCapture',groundSupplyRoadCapture);
  groundCaptureStep=wrap('groundCaptureStep',groundCaptureStep);groundSupplyRefresh=wrap('groundSupplyRefresh',groundSupplyRefresh);
  groundSupplyBefore=wrap('groundSupplyBefore',groundSupplyBefore);groundSupplyAfter=wrap('groundSupplyAfter',groundSupplyAfter);
  groundPaintTerritory=wrap('groundPaintTerritory',groundPaintTerritory);groundDraw=wrap('groundDraw',groundDraw);
  groundStrikeStep=wrap('groundStrikeStep',groundStrikeStep);groundFireSolution=wrap('groundFireSolution',groundFireSolution);
  npcGroundStep=wrap('npcGroundStep',npcGroundStep);npcThink=wrap('npcThink',npcThink);
}
function brief(r){
 const owner=x=>x===null?'中立':String(x),lines=[`${r.config.terrain} ${r.config.doctrines.join('/')} ${r.config.level} seed${r.config.seed} 勝者:${r.winner??'未決'} 時間:${r.seconds}秒 残存:${r.remaining.map((v,i)=>i+'軍 '+v.units+'隊'+(v.ships===undefined?'':' '+v.ships+'隻')).join(' / ')}`];
 if(r.clock)lines.push(`作戦時計: ${r.clock.text}（経過${r.clock.minutes}分）、NPC:${r.config.npc===false?'なし':'あり'}`);
 if(r.armor)lines.push('要塞装甲: '+r.armor.map(s=>s.time+'秒='+s.percent+'%').join(' '));
 if(r.ally)lines.push(`友軍: 占領${r.ally.captures}（割合${r.ally.captureShare}）、最終目標${r.ally.finalCaptures}、先走り${r.ally.aheadTasks}、引継ぎ平均${r.ally.reliefMeanSec??'未着'}秒（${r.ally.reliefCount}件、未着${r.ally.reliefPending}件）、状態比 ${JSON.stringify(r.ally.modeShare)}`);
 if(r.transitions)for(const s of r.transitions)lines.push(`指揮 ${s.time}秒 ${s.team}軍 ${s.posture}/${s.style} `+s.tasks.map(k=>`${k.type}:${k.zone}/${k.stage} [${k.units.map(x=>x.id).join(',')}]`).join(' '));
 lines.push('拠点: '+r.initialOwners.map(e=>e.site+'='+owner(e.owner)).join(' '));
 const captureLabel=r.config.terrain==='charybdis'?'保有変更':'占領';
 if(!r.captures.length)lines.push(captureLabel+': なし');
 for(const e of r.captures)lines.push(`${captureLabel} ${e.time}秒 ${e.site} → ${owner(e.owner)}`);
 for(const e of r.postures)lines.push(`姿勢 ${e.time}秒 ${e.team}軍 ${e.what.slice(8)}`);
 for(const e of r.logs)lines.push(`log ${e.time}秒 ${e.team}軍 ${e.what} ${e.zone??''} ${e.why}`);
 for(const s of r.samples)lines.push(`任務 ${s.time}秒 `+s.tasks.map((v,i)=>i+'軍 '+Object.entries(v).map(([k,n])=>k+':'+n).join(' ')).join(' / '));
 lines.push('補給20%未満 最大: '+r.lowSupplyMax.map((n,i)=>i+'軍 '+n+'隊').join(' / '));
 lines.push(`判断: ${r.think.count}回 平均${r.think.meanMs}ms 最大${r.think.maxMs}ms、棒立ち比: ${r.idle.join('/')}、step平均: ${r.step.meanMs}ms`);
 if(r.profile){lines.push('関数別（計測負荷あり・step内と5秒ごとの明示描画）: 関数 呼数 包括ms 自己ms 平均ms');
   for(const [name,v] of Object.entries(r.profile).sort((a,b)=>b[1].selfMs-a[1].selfMs))lines.push(`${name} ${v.count} ${v.totalMs} ${v.selfMs} ${v.meanMs}`);}
 return lines.join('\n');
}
async function run(cfg){
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{for(const fn of [setupSpaceNpcSim,advanceSpaceNpcSim,spaceNpcSimResult,sampleNpcAlly])await page.evaluate('window.'+fn.name+'='+fn.toString());
  await page.evaluate(setupNpcSim,cfg);if(cfg.profile)await page.evaluate(installNpcProfile);await page.evaluate('window.advanceNpcSim='+advanceNpcSim.toString());await page.evaluate('window.npcSimResult='+npcSimResult.toString());
  let done=false,elapsed=0;while(!done){elapsed+=5;done=await page.evaluate(sec=>{const done=advanceNpcSim(sec);if(window.npcProfile){npcProfile.active=true;try{if(op.ground)groundDraw();}finally{npcProfile.active=false;}}return done;},elapsed);}
  if(errors.length)throw new Error(errors.join('\n'));return await page.evaluate(()=>npcSimResult());
 }finally{await browser.close();}
}
// 型・拠点・期限は省略可。期限は作戦開始からのゲーム秒。
function parseIntent(value){
 const parts=value.split(':'),[type,style,zones,until]=parts;
 if(parts.length>4||!['seize','hold','delay','withdraw'].includes(type)||style&&!['firm','delay','mobile','depth'].includes(style))throw new Error('意図: seize|hold|delay|withdraw[:firm|delay|mobile|depth[:拠点ID,拠点ID[:期限秒]]]');
 const goal={type};if(style)goal.style=style;
 if(zones){goal.zones=zones.split(',');if(goal.zones.some(id=>!id.trim()||id!==id.trim()))throw new Error('意図の拠点IDが不正: '+zones);}
 if(until!==undefined&&until!==''){goal.until=Number(until);if(!Number.isFinite(goal.until)||goal.until<0)throw new Error('意図の期限は0以上の秒数: '+until);}
 return goal;
}
function parseArgs(args){
 const positional=[],intents={};let idle=false,profile=false,npc=true,ally=0;
 for(let i=0;i<args.length;i++){
  const arg=args[i],match=/^--intent([01])(?:=(.*))?$/.exec(arg);
  if(match){const value=match[2]??args[++i];if(!value||value.startsWith('--'))throw new Error(arg+' の意図がありません');intents[match[1]]=parseIntent(value);}
  else if(arg==='--ally'){const value=args[++i];if(value===undefined||value.startsWith('--')||value.trim()==='')throw new Error('--ally の割合がありません');ally=Number(value);if(!Number.isFinite(ally)||ally<0||ally>=1)throw new Error('--ally は0以上1未満');}
  else if(arg==='--no-npc')npc=false;
  else if(arg==='--idle')idle=true;
  else if(arg==='--profile')profile=true;
  else if(arg==='--brief')continue;
  else if(arg.startsWith('--'))throw new Error('不明な引数: '+arg);
  else positional.push(arg);
 }
 const [terrain='exercise2',d0='mars',d1='earth',level='standard',seed='1',seconds='600']=positional;
 const cfg={terrain,doctrines:[d0,d1],level,seed:Number(seed),seconds:Number(seconds),idle,profile,intents,npc,ally};
 if(ally>0&&(terrain==='charybdis'||idle))throw new Error('--ally は地上の両軍NPC計測のみ');
 if(positional.length>6||!['exercise2','baikonur','field150','field300','charybdis'].includes(terrain)||![d0,d1].every(x=>['mars','earth'].includes(x))||!['easy','standard','hard'].includes(level)||!Number.isInteger(cfg.seed)||!Number.isFinite(cfg.seconds)||cfg.seconds<=0)throw new Error('引数: exercise2|baikonur|field150|field300 mars|earth mars|earth easy|standard|hard seed 秒 [--idle] [--brief] [--profile] [--intent0 意図] [--intent1 意図]');
 return cfg;
}
module.exports={setupNpcSim,advanceNpcSim,npcSimResult,installNpcProfile,sampleNpcAlly,brief,table,run,parseIntent,parseArgs};
const {setupSpaceNpcSim,advanceSpaceNpcSim,spaceNpcSimResult}=require('./npc-space-sim.cjs');
if(require.main===module){
 const args=process.argv.slice(2),cfg=parseArgs(args);
 run(cfg).then(r=>{if(args.includes('--brief'))console.log(brief(r));else{console.log(JSON.stringify(r,null,2));console.log(table(r));}}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
