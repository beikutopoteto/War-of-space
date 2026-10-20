/* 第5節「フェブルアーリア防衛戦」を最後まで早送りして、時刻ごとの様子を出す（釣り合わせの確かめ）。1〜2分かかる。
   node tools/februaria-sim.cjs <b|s|q> [tech] [army=N]（PATCH=ファイル.js を付けると、始める前にそのスクリプトをページで実行する（WOS_DATA を書き換えて数値を試す）。tech: 全研究のあとで。army: 駐屯隊を約 N 隻にする。同じ隊を写して足す。預かる艦は数えない）
   b: 駐屯隊は何もしない（友軍と砲台だけで持つか。負けてよい）
   s: 駐屯隊は基地の真ん中の前に居続け、近づく揚陸艦と近くの敵を叩く
   q: 即応（2026-10-16 の案内どおりの遊び方）。ゲートの輪に近い揚陸艦から叩き、いなければ通信で押されている方面（いちばん段階の高い方面）の敵を叩き、
      どこも押されていなければ真ん中の前で待つ。2026-10-19 から、デバッグのオートモードそのもの（battle/sim.js の autoAI。auto と書いても同じ）で動かす
   2026-10-16: 三方面の押し合いに作り直した。行の読み方: 時刻 段階 sunk=主力の撃沈の割合 gate=西/中央/東のシールドの残り%（S 塞いだ / B 最後のゲートが破られた）
   gar=基地守備隊の耐久 cap=敵がまだ入れられる量（W.A.S.×was＋強化歩兵×troop。括弧は W.A.S. の機数と強化歩兵の人数。2026-10-18） tp=岩の上の共和国の強化歩兵 bt=鳴っている砲台（西/真ん中/東） pr=列の進み%（西/真上/東。h はこちらが数で勝って止まっている） fr=押されている段階（西/真上/東。x は閉じた方面）
   en=敵の隻数（西/真上/東/北） al=友軍の隻数（西/真上/東） me=駐屯隊の隻数（西/真上/東/北） id=友軍の棒立ちの隊/隊の数（西/中/東。2026-10-20）。
   最後に勝ち負け「over outcome loseWhy repelBy」、ゲートが破られた時刻、守備隊の耐久、総攻撃と退却の時刻、
   敵の主力に与えた打撃の割合と沈めた隻数（me 自軍 / ally 友軍の艦 / battery 地表の砲台 / inf 強化歩兵。艦載機はその母艦に数える。2026-10-14）、
   敵がいない（撃っていない）時間の割合、場にいる敵の平均と最多、揚陸艦の行き先、押されている知らせの通信 */
const { openGame, toStage } = require('./browser.cjs');
const opt=Object.fromEntries(process.argv.slice(3).filter(a=>a.includes('=')).map(a=>a.split('=')));
(async () => {
  const { browser, page, errors } = await openGame();
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  if (process.env.PATCH) await page.evaluate(require('fs').readFileSync(process.env.PATCH, 'utf8'));   // PATCH=file.js: a script run in the page first (try WOS_DATA values; the data files stay)
  if(process.argv.includes('tech')) await page.click('#dbgB [data-dbga="tech"]');   // 全研究: the upper bound of our strength
  await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]'); await page.click('#goBattle'); await page.waitForTimeout(800);
  await page.click('#talkSkip').catch(()=>{}); await page.waitForTimeout(300);
  await page.click('#deployGo').catch(()=>{});
  const strat=process.argv[2]||'q';
  if (process.env.STAGE) await toStage(page);   // STAGE=1: our own fleets researched as far as the operation's stage (2026-10-20)
  const r = await page.evaluate(({strat,army}) => {
    /* army=N: copies of our own fleets (not the lent ones) until about N ships */
    const lent=f=>(op.given||[]).some(g=>g.name===f.name), own=()=>fleets.filter(f=>f.team===0&&!f.ward&&!f.ally&&f.alive&&!lent(f));
    if(army){ const base=own(); let total=base.reduce((s,f)=>s+f.n,0), k=0;
      while(base.length&&total+base[k%base.length].n<=army){
        const f=base[k%base.length], o={}; for(const key of ['sub','type','comp','n','dmg','eva','range','speed','scale','vis','stl','hangar','craft','aa']) if(f[key]!=null) o[key]=f[key];
        o.name=`${f.name}（写し${Math.floor(k/base.length)+1}）`; o.hp=f.hp/HP_K; o.speed=f.speed/SPEED_K; o.pos=[f.pos.x+(Math.random()-.5)*30,f.pos.z+(Math.random()-.5)*20]; o.alt=f.pos.y;
        fleets.push(makeFleet(0,o)); total+=f.n; k++; }
      buildRoster(); updateRoster(); }
    const cat=s=>s.inf===true?'inf':s.fixed?'battery':s.ally?'ally':'me', dmgBy={}, sinkBy={}, _d=window.damage;
    window.damage=function(t,amt,src){ const o=src.kind==='wing'&&src.carrier?src.carrier:src, hit=t.team===1&&t.main&&t.kind==='fleet'&&t.alive, had=hit?t.ships.length:0;
      if(hit) dmgBy[cat(o)]=(dmgBy[cat(o)]||0)+Math.min(amt,t.hpPool);
      _d(t,amt,src);
      if(hit){ const k=had-(t.alive?t.ships.length:0); if(k>0) sinkBy[cat(o)]=(sinkBy[cat(o)]||0)+k; } };
    const said=[], _l=window.logEvent; window.logEvent=function(a,b){ if(fronts.some(L=>b&&(b.includes(L.name)||L.press===b||L.fall===b))) said.push(`${clockStr()} ${a}${b}`); return _l.apply(this,arguments); };
    const reg=p=>p.z<-60?'N':p.x<-90?'W':p.x>90?'E':'C', R3=['W','C','E'];
    const mine=()=>fleets.filter(f=>f.team===0&&!f.ward&&!f.ally&&f.alive);
    const gateStr=()=>gates.map(g=>g.sealed?'S':g.breached?'B':Math.round(100*g.hp/g.max)).join('/');
    const sum=(list,key)=>{ const o={W:0,C:0,E:0,N:0}; list.forEach(f=>o[reg(key?key(f):f.pos)]+=f.ships.length); return o; };
    const log=[]; let idle=0, samples=0, maxOn=0, onSum=0;
    /* 2026-10-20: allied units standing idle (not firing, and moved less than STILL in a second) while the enemy is on the field (a ship south of
       z −60 not falling back), by the side they started on (W/C/E; the reserve behind the centre counts as C), in four periods: before the all-out
       attack (pre), after it (surge), one gate sealed (seal1), the last gate (last). id= in the log: idle units / units, now (whether or not a foe is on the field) */
    const STILL=.5, side=new Map(), lastP=new Map(), still={}, idleNow={W:0,C:0,E:0}, allyN={W:0,C:0,E:0};
    const period=()=>{ const s=gates.filter(g=>g.sealed).length; return s>=2?'last':s?'seal1':surged?'surge':'pre'; };
    /* hit: the same for the allies whose post is nearest a gate whose shield is going down (it lost shield in the last second) */
    const hitStill={}, gateHp=new Map();
    const allyIdle=()=>{ for(const k of R3){ idleNow[k]=0; allyN[k]=0; }
      const foe=fleets.some(e=>e.team===1&&e.alive&&!e.fixed&&e.ai!=='withdraw'&&e.pos.z>-60);
      const hitG=new Set(gates.filter(g=>{ const h=gateHp.get(g); gateHp.set(g,g.hp); return !g.sealed&&h!=null&&g.hp<h-1e-6; })), open=openGates();
      for(const f of fleets){ if(!f.ally||f.fixed||!f.alive) continue; if(!side.has(f)){ const r=reg(f.home); side.set(f,r==='N'?'C':r); }
        const k=side.get(f), p=lastP.get(f), moved=p?p.distanceTo(f.pos):1e9; lastP.set(f,f.pos.clone()); if(!p) continue;
        const z=!f.fireTarget&&moved<STILL; allyN[k]++; if(z) idleNow[k]++;
        const hit=hitG.size&&hitG.has(gateNear(f.post,open));
        for(const [on,S] of [[foe,still],[hit,hitStill]]){ if(!on) continue; const o=S[period()]=S[period()]||{W:[0,0],C:[0,0],E:[0,0]}; o[k][1]++; if(z) o[k][0]++; } } };
    /* 2026-10-18: what the enemy can still put in (W.A.S. × was + infantry × troop), and the infantry landed */
    const GA=op.base.garrison, capNow=()=>Math.round(wasLeft()*(GA.was||5)+(typeof troopsLeft==='function'?troopsLeft()*(GA.troop||0):0));
    let landed=0; const _to=window.troopsOut; if(_to) window.troopsOut=function(f,D){ landed+=Math.round(f.ships.length*(f.troops||0)); return _to.apply(this,arguments); };
    const L=(t='')=>{ const en=sum(fleets.filter(f=>f.team===1&&f.alive)), al=sum(fleets.filter(f=>f.ally&&!f.fixed&&f.alive)), me=sum(mine());
      const bt=R3.map(R=>fleets.filter(f=>f.fixed&&f.alive&&reg(f.home)===R).length).join('/');
      const pr=R3.map(R=>{ const u=fleets.filter(f=>f.alive&&f.team===1&&f.press&&f.ai==='guard'&&f.pressGoal&&reg(f.pressGoal)===R); return u.length?Math.round(100*u.reduce((s,f)=>s+pressShare(f),0)/u.length)+(u.some(f=>f.pressHeld)?'h':''):'-'; }).join('/');
      const fr=fronts.map(F=>F.closed?'x':F.level).join('/');
      log.push(`${clockStr()} ${phaseName} sunk=${Math.round(mainSunk()*100)}% gate=${gateStr()} gar=${garrison?Math.round(garrison.hp):'-'} cap=${capNow()}(${wasLeft()}w/${troopsLeft()}t) tp=${troops.reduce((s,g)=>s+g.n,0)} bt=${bt} pr=${pr} fr=${fr} en=${en.W}/${en.C}/${en.E}/${en.N} al=${al.W}/${al.C}/${al.E} me=${me.W}/${me.C}/${me.E}/${me.N} id=${R3.map(k=>`${idleNow[k]}/${allyN[k]}`).join(' ')} ${t}`); };
    L('start '+mine().length+'隊 '+mine().reduce((s,f)=>s+f.ships.length,0)+'隻');
    const anchor=new THREE.Vector3(0,0,125);
    if(strat==='q'||strat==='auto') autoMode=true;   // 2026-10-19: the quick response is the debug auto mode itself (sim.js autoAI), so the two stay the same
    let n=0, retreatAt='', surgeAt=''; const gateAt={}, fellAt={};
    while(!over&&n++<60000){ step(.05);
      for(const g of gates) if((g.sealed||g.breached)&&!gateAt[g.name]){ gateAt[g.name]=`${clockStr()}${g.sealed?'塞いだ':'破られた（最後）'}`; L(`${g.name} ${g.sealed?'sealed':'breached'}`); }
      if(surged&&!surgeAt){ surgeAt=clockStr(); L('総攻撃'); }
      for(const F of fronts) if(F.fell&&!fellAt[F.name]){ fellAt[F.name]=clockStr(); L(`${F.name} の戦線が崩れた（allyFall）`); }   // 2026-10-20
      if(typeof lastGate!=='undefined'&&lastGate&&!fellAt.last){ fellAt.last=clockStr(); L(`友軍すべて ${lastGate.name} のまわりへ`); }
      if(repelT!=null&&!retreatAt) retreatAt=clockStr();
      if(n%20) continue;
      const en=fleets.filter(x=>x.team===1&&x.alive&&x.seen), land=en.filter(e=>e.ai==='land'||e.ai==='drop'&&!e.unloaded);
      const onField=fleets.filter(x=>x.team===1&&x.alive&&x.pos.z>-60).reduce((s,f)=>s+f.ships.length,0);
      allyIdle(); samples++; onSum+=onField; maxOn=Math.max(maxOn,onField); if(!fleets.some(x=>x.team===1&&x.alive&&x.pos.z>-60&&x.fireTarget)) idle++;
      const near=(f,list)=>list.slice().sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0];
      const attack=(f,e)=>{ if(!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); };
      const wait=f=>{ if(f.pos.distanceTo(anchor)>10&&!(f.order&&f.order.type==='move')) order(f,{type:'move',dest:anchor.clone()}); };
      if(strat==='s') mine().forEach(f=>{ const e=near(f,land.filter(e=>e.pos.distanceTo(anchor)<130))||near(f,en.filter(e=>e.pos.distanceTo(anchor)<100)); e?attack(f,e):wait(f); });
      if(n%200===0) L();
    }
    L('end'); const tot=Object.values(dmgBy).reduce((a,b)=>a+b,0)||1;
    return {retreatAt, surgeAt, log, said, over, outcome, loseWhy, repelBy, sec:Math.round(gameSec), share:Object.entries(dmgBy).map(([k,v])=>`${k}:${Math.round(v/tot*100)}%`).join(' '), sinkBy:JSON.stringify(sinkBy),
      gates:gates.map(g=>`${g.name} ${gateAt[g.name]||Math.round(100*g.hp/g.max)+'%'}`).join('・'), gar:garrison?`${Math.ceil(garrison.hp)}/${garrison.max}`:'-', clock:clockStr(),
      idle:Math.round(100*idle/Math.max(1,samples)), ...Object.fromEntries([['still',still],['hitStill',hitStill]].map(([key,S])=>[key,['pre','surge','seal1','last'].filter(k=>S[k]).map(k=>`${k} `+R3.map(r=>{ const [a,b]=S[k][r]; return `${r}${b?Math.round(100*a/b):'-'}%`; }).join('/')).join('　')+'　全体 '+R3.map(r=>{ let a=0,b=0; for(const k in S){ a+=S[k][r][0]; b+=S[k][r][1]; } return `${r}${b?Math.round(100*a/b):'-'}%`; }).join('/')])), avgOn:Math.round(onSum/Math.max(1,samples)), maxOn,
      tg:JSON.stringify(troops.map(g=>[Math.round(g.pos.x),Math.round(g.pos.z),g.n,g.goal&&g.goal.name,troopFoe(g)&&troopFoe(g).name])),
      tp:`揚陸艇 ${fleets.filter(f=>f.team===1&&f.type==='lc').map(f=>`${f.name.replace(/ 降下揚陸 エスカドラ/,'')}${f.unloaded?'降':''}${f.alive||f.left?'':'x'}`).join(' ')}　降りた強化歩兵 ${landed}人・岩の上に残り ${troops.reduce((s,g)=>s+g.n,0)}人・中へ入った ${troopsWent}人`,
      drops:fleets.filter(f=>f.team===1&&f.type==='mas').map(f=>`${f.name.replace(/ 局地強襲 エスカドラ/,'')}→${(f.drop||'?').replace('ゲート','')}${f.alive?'':'x'}`).join(' ')};
  }, {strat, army:+(opt.army||0)});
  console.log(r.log.join('\n')); console.log(r.over, r.outcome, r.loseWhy, r.repelBy, r.clock, errors.slice(0, 3));
  console.log(`ゲート ${r.gates}　基地守備隊 ${r.gar}　総攻撃 ${r.surgeAt||'-'}　退却 ${r.retreatAt||'-'}`);
  console.log(`${r.sec}秒 打撃 ${r.share} 撃沈 ${r.sinkBy}`);
  console.log(`敵がいない（撃っていない）時間 ${r.idle}%　場の敵 平均 ${r.avgOn}隻 最多 ${r.maxOn}隻`); console.log(`友軍の棒立ち（撃たず動かない隊の割合。はじめの持ち場で西/中/東）\n  場に敵がいる時 ${r.still}\n  持ち場のいちばん近いゲートのシールドが削られている時 ${r.hitStill}`); console.log(`揚陸艦 ${r.drops}`); console.log(r.tp); if(process.env.TROOPS) console.log(r.tg);
  console.log('押されている知らせ:\n'+r.said.join('\n'));
  await browser.close();
})();
