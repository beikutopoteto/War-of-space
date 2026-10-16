/* 第5節「フェブルアーリア防衛戦」を最後まで早送りして、時刻ごとの様子を出す（釣り合わせの確かめ）。1〜2分かかる。
   node tools/februaria-sim.cjs <a|b|c|d|g|h> [tech]（tech: 全研究のあとで）
   a: 駐屯隊が揚陸艦を優先して叩く  d: 駐屯隊を段階ごとの持ち場（作戦フィールドの中心）へ動かし、近づく揚陸艦と持ち場の近くの敵を叩く（ふつうの遊び方）  b: 駐屯隊は何もしない（友軍と砲台だけで持つか）  c: 駐屯隊が見えた敵をどこまでも追う
   g: 持ち場にいて、近づいた突撃揚陸艦からは下がり（揚陸艦は砲台に任せる）、持ち場の近くの護衛を叩く（2026-10-12 の古い案内どおりの遊び方。負けてよい）
   h: 持ち場にいて、ゲートの輪にいちばん近い揚陸艦から叩き、いなければ持ち場の近くの護衛を叩く（新しい案内「揚陸艦を輪に入れるな。護衛より揚陸艦が先」どおり。2026-10-14）
   2026-10-14: 本隊の5割で共和国が退く（win.retreat）。退き始めた時刻を「退却」に、下がった隊（fallBack）の数と残りの隻数を「下がった」に出す
   2026-10-16: 降下点を3つのゲートに置き換えた。行の読み方: 時刻 段階 sunk=主力の撃沈の割合 gate=西/中央/東のシールドの残り%（S 塞いだ / B 最後のゲートが破られた）
   gar=基地守備隊の耐久 bt=鳴っている砲台 al=友軍の隻数 me=駐屯隊 en=敵（@ は揚陸艦の位置）。
   最後に勝ち負け「over outcome loseWhy repelBy」、ゲートが破られた時刻、守備隊の耐久と削られ始めた時刻、
   敵の主力に与えた打撃の割合と沈めた隻数（me 自軍 / ally 友軍の艦 / battery 地表の砲台 / inf 強化歩兵。艦載機はその母艦に数える。2026-10-14） */
const { openGame } = require('./browser.cjs');
(async () => {
  const { browser, page, errors } = await openGame();
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  if(process.argv[3]==='tech') await page.click('#dbgB [data-dbga="tech"]');   // 全研究: the upper bound of our strength
  await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]'); await page.click('#goBattle'); await page.waitForTimeout(800);
  await page.click('#talkSkip').catch(()=>{}); await page.waitForTimeout(300);
  await page.click('#deployGo').catch(()=>{});
  const strat=process.argv[2]||'a';
  const r = await page.evaluate((strat) => {
    const cat=s=>s.inf?'inf':s.fixed?'battery':s.ally?'ally':'me', dmgBy={}, sinkBy={}, _d=window.damage;
    window.damage=function(t,amt,src){ const o=src.kind==='wing'&&src.carrier?src.carrier:src, hit=t.team===1&&t.main&&t.kind==='fleet'&&t.alive, had=hit?t.ships.length:0;
      if(hit) dmgBy[cat(o)]=(dmgBy[cat(o)]||0)+Math.min(amt,t.hpPool);
      _d(t,amt,src);
      if(hit){ const k=had-(t.alive?t.ships.length:0); if(k>0) sinkBy[cat(o)]=(sinkBy[cat(o)]||0)+k; } };
    const log=[]; const mine=()=>fleets.filter(f=>f.team===0&&!f.ward&&f.alive);
    const gateStr=()=>gates.map(g=>g.sealed?'S':g.breached?'B':Math.round(100*g.hp/g.max)).join('/');
    const L=(t='')=>log.push(`${clockStr()} ${phaseName} sunk=${Math.round(mainSunk()*100)}% gate=${gateStr()} gar=${garrison?Math.round(garrison.hp):'-'} bt=${fleets.filter(f=>f.fixed&&f.alive&&!f.silent).length} al=${fleets.filter(f=>f.ally&&!f.fixed).map(f=>f.alive?f.ships.length:'-').join('/')} me=${fleets.filter(f=>f.team===0&&!f.ward).map(f=>f.alive?f.ships.length:'-').join('/')} en=${fleets.filter(f=>f.team===1&&f.alive).map(f=>f.name.replace(/ エスカドラ/,'').replace(/ /,'').slice(0,5)+f.ships.length+(f.seen?'':'?')+(f.ai==='land'?`@${Math.round(f.pos.x)},${Math.round(f.pos.z)}`:'')).join(',')} ${t}`);
    L('start '+mine().map(f=>`${f.name.slice(0,5)}:${f.n}x${f.hp.toFixed(1)} d${f.dmg.toFixed(2)} r${f.range.toFixed(0)} s${f.speed}`).join(' '));
    let n=0, retreatAt='', drainAt=''; const gateAt={};
    while(!over&&n++<40000){ step(.05);
      for(const g of gates) if((g.sealed||g.breached)&&!gateAt[g.name]){ gateAt[g.name]=`${clockStr()}${g.sealed?'塞いだ':'破られた（最後）'}`; L(`${g.name} ${g.sealed?'sealed':'breached'}`); }
      if(garrison&&garrison.hp<garrison.max&&!drainAt) drainAt=clockStr();
      if(n%20) continue;
      const en=fleets.filter(x=>x.team===1&&x.alive&&x.seen), land=en.filter(e=>e.ai==='land');
      if(strat==='a') for(const f of mine()){ const pool=land.length?land:en.filter(e=>e.pos.z>-40); const e=pool.sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0];
        if(e&&!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); }
      if(strat==='d') mine().forEach((f,i)=>{ const spot=fieldC.clone();
        const e=land.filter(e=>e.pos.distanceTo(spot)<150).sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0]||en.filter(e=>e.pos.distanceTo(spot)<90).sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0];
        if(e){ if(!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); } else if(f.pos.distanceTo(spot)>8&&!(f.order&&f.order.type==='move')) order(f,{type:'move',dest:spot}); });
      if(strat==='g') mine().forEach(f=>{ const spot=fieldC.clone(), back=spot.clone().add(new THREE.Vector3(0,0,25));
        if(en.some(e=>e.type==='mas'&&e.pos.distanceTo(f.pos)<36)){ if(!(f.order&&f.order.type==='move'&&f.order.dest.distanceTo(back)<3)) order(f,{type:'move',dest:back}); return; }
        const e=en.filter(e=>e.type!=='mas'&&e.pos.distanceTo(spot)<60).sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0];
        if(e){ if(!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); } else if(f.pos.distanceTo(spot)>8&&!(f.order&&f.order.type==='move')) order(f,{type:'move',dest:spot}); });
      if(strat==='h'){ const urgent=land.filter(e=>e.pos.distanceTo(fieldC)<150).map(e=>({e,d:Math.min(...openGates().map(g=>g.ring.distanceTo(e.pos)))})).sort((a,b)=>a.d-b.d).map(x=>x.e);
        mine().forEach(f=>{ const spot=fieldC.clone(), e=urgent[0]||en.filter(e=>e.pos.distanceTo(spot)<90).sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0];
          if(e){ if(!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); } else if(f.pos.distanceTo(spot)>8&&!(f.order&&f.order.type==='move')) order(f,{type:'move',dest:spot}); }); }
      if(repelT!=null&&!retreatAt) retreatAt=clockStr()+'('+Math.round(gameSec)+'s)';
      if(strat==='c') for(const f of mine()) if(!f.order){ const e=en.sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0]; if(e) order(f,{type:'attack',target:e}); }
      if(n%100===0) L();
    }
    L('end'); const tot=Object.values(dmgBy).reduce((a,b)=>a+b,0)||1;
    const fb=fleets.filter(f=>f.team===1&&f.fellBack);
    return {retreatAt, fell:`${fb.length}隊 ${fb.reduce((s,f)=>s+f.ships.length,0)}隻 予備2→${(fleets.find(f=>f.name==='第26 局地強襲 エスカドラ')||{}).drop||'-'}`, log, over, outcome, loseWhy, repelBy, sec:Math.round(gameSec), share:Object.entries(dmgBy).map(([k,v])=>`${k}:${Math.round(v/tot*100)}%`).join(' '), sinkBy:JSON.stringify(sinkBy),
      gates:gates.map(g=>`${g.name} ${gateAt[g.name]||Math.round(100*g.hp/g.max)+'%'}`).join('・'), gar:garrison?`${Math.ceil(garrison.hp)}/${garrison.max}（削られ始め ${drainAt||'-'}）`:'-', clock:clockStr()};
  }, strat);
  console.log(r.log.join('\n')); console.log(r.over, r.outcome, r.loseWhy, r.repelBy, r.clock, errors.slice(0, 3));
  console.log(`ゲート ${r.gates}　基地守備隊 ${r.gar}`);
  console.log(`退却 ${r.retreatAt||'-'} 下がった ${r.fell}`); console.log(`${r.sec}秒 打撃 ${r.share} 撃沈 ${r.sinkBy}`);
  await browser.close();
})();
