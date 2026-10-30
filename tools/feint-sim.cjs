/* 作業票 #246・#248: 第6節の観測。ゲームのデータ・判断は変更しない。
   node tools/feint-sim.cjs <idle|auto> [runs=N]
   FEINT_SHOTS=<リポジトリ外のディレクトリ> で14:20と第二段階の画像も保存する。
   stdout は JSONL: 5秒ごとの sample、変化時の event、各回の summary。
   距離・位置は3次元（位置の順は [x,z,alt]）、秒は gameSec。
   停止は1秒の位置差 < .5 かつその1秒に砲撃可能な瞬間がないこと。
   固定施設も fixed として別記。最終端数は停止集計から除く。
   fired/received は damage が発生した .05 秒区間の和（着弾時間）。
   craftFired は艦載機を母艦に帰属。銃の射程内時間 gunActive も別記。
   乱数は通常の Math.random。各回は独立したブラウザで、同一seedの反復ではない。
   実行上限はコマンド全体10分。超過時は完了回数を書いて止まる。
   関数への観測呼び出しの挿入はページ内だけ。分岐式や返り値は変えない。
   挿入点が変わったら不正確な調査を続けず失敗する。 */
const { openGame, toStage } = require('./browser.cjs');
const args = process.argv.slice(2), strat = args[0];
const runs = args[1] ? Number(args[1].slice(5)) : 3;
if (!['idle', 'auto'].includes(strat) || args.length > 2 ||
    (args[1] && !/^runs=\d+$/.test(args[1])) || !Number.isSafeInteger(runs) || runs < 1) {
  console.error('使い方: node tools/feint-sim.cjs <idle|auto> [runs=正の整数]');
  process.exit(1);
}
const emit = row => console.log(JSON.stringify(row));
async function trial(run, deadline) {
  let browser, timer;
  try {
    const work = async () => {
      const game = await openGame(); browser = game.browser;
      const { page, errors } = game;
      await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
      await page.click('[data-go="sortie"]'); await page.click('[data-op="denaliBreak"]');
      if (strat === 'idle') await page.evaluate(() => { WOS.start({op:'denaliBreak'}); speed=0; });
      else { await page.click('#goBattle'); await page.evaluate(() => { speed=0; }); }
      await page.waitForTimeout(800);
      if (await page.locator('#talkSkip').isVisible()) await page.click('#talkSkip');
      // 配置中に止め、最初の step から観測する。描画フレームは進めない。
      await page.evaluate(() => { speed = 0; });
      if (await page.evaluate(() => deploying)) await page.click('#deployGo');
      if (strat === 'auto') await toStage(page);
      const shots=run===1?process.env.FEINT_SHOTS:null;
      if(shots){ require('fs').mkdirSync(shots,{recursive:true}); await page.exposeFunction('feintShot',label=>page.screenshot({path:require('path').join(shots,`${strat}-${run}-${label}.png`)})); }
      const result = await page.evaluate(async ({ strat, shots }) => {
        if (gameSec !== 0) throw new Error(`観測前に ${gameSec} 秒進行した`);
        const own = () => fleets.filter(f => f.team === 0 && !f.ally && !f.ward && !f.fixed && f.alive);
        if (strat === 'idle' && (own().length !== 5 || own().reduce((s,f)=>s+f.n,0) !== 31)) throw new Error('クイック5隊31隻ではない');
        if (strat === 'auto') {
          // length-sim と同じ複製順・位置分散・研究値。艦隊単位のため端数は埋めない。
          const base = own(), cap = op.cap; let total = base.reduce((s, f) => s + f.n, 0), k = 0;
          while (base.length && total + base[k % base.length].n <= cap) {
            const f = base[k % base.length], o = {};
            for (const key of ['sub','type','comp','n','dmg','eva','range','scale','vis','stl','hangar','craft','aa','stats']) if (f[key] != null) o[key] = f[key];
            o.name = `${f.name}（写し${Math.floor(k / base.length) + 1}）`;
            o.hp = f.hp / HP_K; o.speed = f.speed / SPEED_K;
            o.pos = [f.pos.x + (Math.random() - .5) * 30, f.pos.z + (Math.random() - .5) * 20]; o.alt = f.pos.y;
            fleets.push(makeFleet(0, o)); total += f.n; k++;
          }
          buildRoster(); updateRoster(); autoMode = true;
        }
        const DT = .05, rows = [], metrics = new Map(), branch = new Map(), enemyBranch = new Map(), routeIds = new WeakMap(); let routeId=0;
        const round = v => Math.round(v * 1000) / 1000;
        const xyz = p => p ? [p.x,p.z,p.y].map(round) : null;
        const stamp = () => ({ sec:round(gameSec), clock:clockStr(), opMin:round(opMin()) });
        const event = (what, more = {}) => rows.push({type:'event', what, ...stamp(), ...more});
        const identity = f => ({id:f.id,name:f.name,side:f.team === 1?'敵':f.ally?'友軍':'自軍',fixed:!!f.fixed});
        const definedPack = f => f.pack || packs.find(P => P.fleets.includes(f.name));
        const reason = f => {
          const P = definedPack(f);
          if (f.fixed) return '固定施設';
          if (f.team === 1) return `${enemyBranch.get(f) || 'enemyAI未実行'}; ai:${f.ai || 'なし'}${P && P.t0 == null ? ';型はstart:' + P.start + '待ち（後段AIは有効）' : ''}`;
          if (f.ally) return `${f.mode}${f.feint ? ':' + (f.touch?'touch':'本隊') + (f.feintOut?'lane':'via') : ''}`;
          return nuke.state==='wait' ? branch.get(f) || (autoMode?'auto未実行':'無操作') : 'auto第二段階以降/無操作';
        };
        const register = () => {
          for (const f of fleets) if (!metrics.has(f)) metrics.set(f, {
            ...identity(f), initial:f.n, pack:definedPack(f)?.name || null,
            feint:f.feint || null,touch:!!f.touch,slot:f.packSlot || null,
            born:stamp(),initialPos:xyz(f.pos),lastPos:f.pos.clone(),lastAlive:f.alive,idleSec:0,
            reasons:{}, intervals:[], current:null, longest:null,
            fired:0,craftFired:0,received:0,gunActive:0,autoSec:{},
            firstMove:null,firstDeparture:null,firstGun:null,firstHit:null,activation:null,
            postMin:null,postMax:null,scrSec:0,outSec:0,wardRanges:{},modes:{},crossings:[],
          });
        };
        register();
        let helpEmptySec = 0, helpTotalSec = 0, activeAuto = null;
        // 実際の autoDenali 内のローカル値と通った分岐を読む。
        // 観測専用のクロージャ。元の式・呼び出し順をそのまま保つ。
        const observeHelp = help => { activeAuto = {help:help.length}; };
        const observeAuto = (f, label) => { branch.set(f,label); };
        let source = autoDenali.toString();
        const insert = (from, to) => {
          if (source.split(from).length !== 2) throw new Error('AI の観測挿入点が変わった: ' + from);
          source = source.replace(from,to);
        };
        insert('const esc=new Set();', 'if(first) observeHelp(help); const esc=new Set();');
        insert('if(esc.has(f)){', "if(first) observeAuto(f,'第一段階:その他'); if(esc.has(f)){ if(first) observeAuto(f,'esc');");
        insert('if(first){ const e=by(f,threat,carrierFirst(f)); if(e){', "if(first){ const e=by(f,threat,carrierFirst(f)); if(e){ observeAuto(f,'threat');");
        insert('const h=by(f,help); if(h){', "const h=by(f,help); if(h){ observeAuto(f,'help');");
        insert('if(touch){ near2(f,touch.pos);', "if(touch){ observeAuto(f,'触れる隊のそば'); near2(f,touch.pos);");
        insert('if(bbs.length){ const b=bbs[k%bbs.length], a=k++*2.4;', "if(bbs.length){ observeAuto(f,'戦艦のそば'); const b=bbs[k%bbs.length], a=k++*2.4;");
        const originalAuto = autoDenali;
        autoDenali = eval('(' + source + ')');
        // start 待ちは型の参加を遅らせるだけで、その後段の AI は止めない。
        // 待機理由を型のメタデータから推測せず、実際に採用された分岐も記録する。
        const observeEnemy = (f,label) => { enemyBranch.set(f,label); };
        const adopted = (f,label,result) => { if(result) observeEnemy(f,label); return result; };
        const originalEnemy = enemyAI;
        source = enemyAI.toString();
        insert("if(f.team!==1||!f.alive||f.fixed) continue;", "if(f.team!==1||!f.alive||f.fixed) continue; observeEnemy(f,'後段:その他');");
        insert('if(f.pack&&packAI(f,foes)) continue;', "if(f.pack&&adopted(f,'pack:'+f.pack.doctrine+':'+packMove(f)+(f.pack.doctrine==='screen'?':'+f.packSlot+':scr='+!!f.pack.scr:''),packAI(f,foes))) continue;");
        insert('if(RL&&roleFirst(f,RL,foes)) continue;', "if(RL&&adopted(f,'roleFirst',roleFirst(f,RL,foes))) continue;");
        insert('if(RL&&rolePlace(f,RL,threat,foes)) continue;', "if(RL&&adopted(f,'rolePlace',rolePlace(f,RL,threat,foes))) continue;");
        insert("if(threat){ if(!(f.order&&f.order.target===threat))", "if(threat){ observeEnemy(f,'後段:threat'); if(!(f.order&&f.order.target===threat))");
        insert("else if(!f.order||f.order.type!=='move'){ if(f.pos.distanceTo(f.post)>2)", "else if(!f.order||f.order.type!=='move'){ observeEnemy(f,'後段:postへ戻る/保持'); if(f.pos.distanceTo(f.post)>2)");
        insert('if(waiting){ packWatch(f,waiting,f.home);', "if(waiting){ observeEnemy(f,'見回り:start待ち'); packWatch(f,waiting,f.home);");
        enemyAI = eval('(' + source + ')');
        const originalDamage = damage;
        let tickShot = new Set(), tickCraft = new Set(), tickHit = new Set(), secondActive = new Set();
        damage = function(t, amt, src) {
          if (amt > 0 && t.alive) {
            if (metrics.has(src)) tickShot.add(src);
            if (src.kind === 'wing' && metrics.has(src.carrier)) tickCraft.add(src.carrier);
            if (metrics.has(t)) tickHit.add(t);
          }
          return originalDamage.apply(this, arguments);
        };
        const wardPoints = P => {
          if (!P) return [];
          if (Array.isArray(P.ward) && typeof P.ward[0] === 'number') return [['点',packVec(P.ward)]];
          return [].concat(P.ward || []).map(w => typeof w === 'string'
            ? [w,fleets.find(x => x.name === w)?.pos] : ['鉱山西縁の点',Array.isArray(w)?packVec(w):null]).filter(([,p]) => p);
        };
        const screens = () => packs.filter(P => op.lure.packs.includes(P.name));
        const countScreen = P => {
          const units = lureUnits(P); let sunk=0, outside=0;
          for (const f of units) { const left=f.alive?f.ships.length:0; sunk+=f.n-left; if(left && P.postV && f.pos.distanceTo(P.postV)>op.lure.out) outside+=left; }
          return {pack:P.name,n0:units.reduce((s,f)=>s+f.n,0),sunk,outside,scr:!!P.scr,post:xyz(P.postV)};
        };
        const closeInterval = m => {
          if (!m.current) return;
          m.intervals.push(m.current);
          if (!m.longest || m.current.duration > m.longest.duration) m.longest = m.current;
          m.current = null;
        };
        const second = () => {
          for (const [f,m] of metrics) {
            const moved=m.lastPos.distanceTo(f.pos), idle=m.born.sec<=gameSec-1+1e-8 && m.lastAlive && f.alive && moved<.5 && !secondActive.has(f);
            const why=reason(f); m.lastPos.copy(f.pos); m.lastAlive=f.alive;
            if (idle) {
              m.idleSec++; m.reasons[why]=(m.reasons[why] || 0)+1;
              if (!m.current) m.current={from:{sec:round(gameSec-1),clock:clockStr((gameSec-1)*CLOCK_RATE)},to:null,duration:0,pos:xyz(f.pos),reasons:{}};
              m.current.duration++; m.current.to=stamp(); m.current.endPos=xyz(f.pos);
              m.current.reasons[why]=(m.current.reasons[why] || 0)+1;
            } else closeInterval(m);
          }
          secondActive.clear();
        };
        const snapshot = () => rows.push({type:'sample',...stamp(),phase:phaseName,nuke:nuke.state,
          helpCount:activeAuto?.help ?? null,lure:lureCount(),screens:screens().map(countScreen),
          units:[...metrics].map(([f,m]) => {
            const P=definedPack(f), W=f.feint?wardPoints(packs.find(p=>p.name===op.feints[f.feint].screen)):[];
            return {...identity(f),alive:f.alive,left:!!f.left,ships:f.alive?f.ships.length:0,pos:xyz(f.pos),
              ai:f.ai || null,pack:P?.name || null,slot:f.packSlot || null,mode:f.mode || null,
              reason:reason(f),order:f.order?.type || null,dest:xyz(f.order?.dest),target:f.order?.target?.name || null,
              fireTarget:f.fireTarget?.name || null,fireGap:f.fireTarget?round(gap(f,f.fireTarget)):null,range:round(f.range),
              postDistance:P?.postV?round(f.pos.distanceTo(P.postV)):null,scr:P?.D.reach?!!P.scr:null,
              wardDistances:W.map(([name,p])=>({name,distance:round(f.pos.distanceTo(p))})),
              fired:round(m.fired),craftFired:round(m.craftFired),received:round(m.received)};
          })});
        const laneKey = new Map(), packState = new Map(), screenState = new Map(), reliefSeen = new Set(), arrived = new Set(); let ignited=null; let lureSeen=false, nukeState=nuke.state;
        const changes = () => {
          for (const [side,F] of Object.entries(op.feints)) {
            const p=xyz(feintLane(F,opMin())), k=Math.floor(Math.max(0,opMin()-(F.from||0))/(F.dwell||10));
            if(laneKey.get(side)!==k){ laneKey.set(side,k); event('lane',{side,pos:p}); }
          }
          for (const P of packs) {
            if(P.reliefAt!=null&&!reliefSeen.has(P)){ reliefSeen.add(P); event('relief',{from:P.name,to:P.relief.to,units:P.reliefUnits}); }
            const s=`${P.t0 != null}:${P.step}:${!!P.back}:${!!P.scr}`;
            if(packState.get(P)!==s){ packState.set(P,s); event('pack',{pack:P.name,active:P.t0!=null,step:P.step,back:!!P.back,scr:!!P.scr,start:P.start}); }
          }
          for(const P of screens()){
            const c=countScreen(P), k=`${c.sunk}:${c.outside}`;
            if(screenState.get(P)!==k){ screenState.set(P,k); event('screenCount',c); }
          }
          if(lured && !lureSeen){ lureSeen=true; event('lure',{by:lured.by,count:lureCount(),screens:screens().map(countScreen)}); }
          for(const b of nuke.bbs||[]) if(b.f?.nukeSt==='landed'&&!arrived.has(b.f)){ arrived.add(b.f); event('land',{unit:b.f.name}); }
          if(nuke.state==='fired'&&!ignited){ ignited={...stamp(),shift:nuke.km,forecast:nukeEst(),landN:nuke.landN}; event('ignite',ignited); }
          if(nuke.state!==nukeState){ nukeState=nuke.state; event('nuke',{state:nukeState}); }
        };
        snapshot(); changes();
        const initialShips=own().reduce((s,f)=>s+f.n,0);
        let n=0, shot1=false, shot2=false;
        try {
          while(!over && n<60000){
            n++; tickShot.clear(); tickCraft.clear(); tickHit.clear();
            const before=new Map(fleets.filter(f=>f.alive).map(f=>[f,f.pos.clone()]));
            const firstBefore=nuke.state==='wait';
            step(DT); register();
            if(shots&&(!shot1&&opMin()>=80||!shot2&&nuke.state==='descend')){
              const label=!shot1&&opMin()>=80?'1420':'second'; if(label==='1420') shot1=true; else shot2=true;
              controls.target.set(0,0,130); camera.position.set(75,300,640); controls.update();
              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); await window.feintShot(label);
            }
            if(strat==='auto' && firstBefore && activeAuto){ helpTotalSec+=DT; if(!activeAuto.help) helpEmptySec+=DT; }
            for(const [f,m] of metrics){
              if(f.packSlot) m.slot=f.packSlot;
              if(before.has(f) && !m.firstMove && before.get(f).distanceTo(f.pos)/DT>=.5) m.firstMove={...stamp(),pos:xyz(f.pos)};
              if(!m.firstDeparture && f.pos.distanceTo(packVec(m.initialPos))>2) m.firstDeparture={...stamp(),pos:xyz(f.pos)};
              if(f.pack && !m.activation) m.activation={...stamp(),pack:f.pack.name};
              if(tickShot.has(f)){ m.fired+=DT; secondActive.add(f); }
              if(tickCraft.has(f)) m.craftFired+=DT;
              if(tickHit.has(f)){ m.received+=DT; if(!m.firstHit) m.firstHit=stamp(); }
              const t=f.fireTarget;
              if(f.alive && t?.alive && t.seen && !f.silent && gap(f,t)<=f.range*1.08 && !bodyBlocks(f.pos,t.pos)){
                m.gunActive+=DT; secondActive.add(f); if(!m.firstGun) m.firstGun=stamp();
              }
              if(!before.has(f)) continue;
              if(strat==='auto' && firstBefore && branch.has(f)) { const b=branch.get(f); m.autoSec[b]=(m.autoSec[b] || 0)+DT; }
              if(f.mode) m.modes[f.mode]=(m.modes[f.mode] || 0)+DT;
              const P=definedPack(f);
              if(P?.postV && op.lure.packs.includes(P.name)){
                const d=f.pos.distanceTo(P.postV); m.postMin=m.postMin==null?d:Math.min(m.postMin,d); m.postMax=Math.max(m.postMax || 0,d);
                if(P.scr) m.scrSec+=DT; if(d>op.lure.out) m.outSec+=DT;
              }
              if(f.feint) for(const [name,p] of wardPoints(packs.find(P=>P.name===op.feints[f.feint].screen))){
                const d=f.pos.distanceTo(p), r=m.wardRanges[name] || (m.wardRanges[name]={min:d,max:d}); r.min=Math.min(r.min,d); r.max=Math.max(r.max,d);
              }
            }
            for(const [f,m] of metrics){ const C=f.autoCross; if(C&&!routeIds.has(C)) routeIds.set(C,++routeId); const last=m.crossings[m.crossings.length-1], key=C?`${routeIds.get(C)}:${C.fromSouth}:${C.i}`:'none'; if((C||last&&last.key!=='none')&&key!==last?.key) m.crossings.push({...stamp(),key,pos:xyz(f.pos)}); }
            changes();
            if(n%20===0) second();
            if(n%100===0) snapshot();
          }
          if(n%100!==0) snapshot();
          for(const m of metrics.values()) closeInterval(m);
          return {rows,summary:{type:'summary',strat,...stamp(),over,win:outcome===true,why:loseWhy || (!fleets.some(f=>f.team===0&&f.alive&&!f.ward)?'army':null),
            arrived:[...arrived].map(f=>f.name),ignited,relief:packs.filter(P=>P.reliefAt!=null).map(P=>({from:P.name,to:P.relief.to,at:P.reliefAt,units:P.reliefUnits})),
            initialShips,clockRate:CLOCK_RATE,steps:n,unmeasuredTail:round(gameSec%1),
            helpEmptySec:round(helpEmptySec),helpTotalSec:round(helpTotalSec),
            lure:lured?{by:lured.by,opMin:lured.at,sec:round(lured.at/CLOCK_RATE),clock:clockStr(lured.at)}:null,
            units:[...metrics].map(([f,m])=>{ const {lastPos,lastAlive,current,...out}=m;
              return {...out,alive:f.alive,left:!!f.left,remaining:f.alive||f.left?f.ships.length:0,lost:m.initial-f.ships.length,endPos:xyz(f.pos)}; })}};
        } finally { damage=originalDamage; autoDenali=originalAuto; enemyAI=originalEnemy; }
      }, { strat, shots:!!shots });
      if(errors.length) throw new Error(errors.join('; '));
      for(const row of result.rows) emit({run,...row});
      emit({run,...result.summary});
      if(!result.summary.over) throw new Error('3000 gameSec で未終結');
    };
    await Promise.race([work(), new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('コマンド全体の実行上限10分')),Math.max(1,deadline-Date.now()));
    })]);
  } finally { clearTimeout(timer); if(browser) await browser.close(); }
}
(async () => {
  const start=Date.now(), deadline=start+600000; let completed=0;
  try {
    for(let run=1;run<=runs;run++) { await trial(run,deadline); completed++; console.error(`${strat} ${completed}/${runs} 完了 (${((Date.now()-start)/1000).toFixed(1)}秒)`); }
    emit({type:'complete',strat,requested:runs,completed,wallSec:(Date.now()-start)/1000});
  } catch(e) {
    emit({type:'failure',strat,requested:runs,completed,attempted:completed+1,reason:e.message}); process.exitCode=1;
  }
})();
