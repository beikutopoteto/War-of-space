/* 第5節「フェブルアーリア防衛戦」を最後まで早送りして、時刻ごとの様子を出す（釣り合わせの確かめ）。1〜2分かかる。
   node tools/februaria-sim.cjs <a|b|c>
   a: 駐屯隊が揚陸艦を優先して叩く  d: 駐屯隊を降下点の前に分けて置き、近づく揚陸艦と、近くの敵だけを叩く（砲台の射程の中で受ける。ふつうの遊び方）  b: 駐屯隊は何もしない（友軍と砲台だけで持つか）  c: 駐屯隊が見えた敵をどこまでも追う
   行の読み方: 時刻 段階 sunk=主力の撃沈の割合 drop=降下点（o 無事 / L 揚陸中 / X 占拠） bt=鳴っている砲台 al=友軍の隻数 me=駐屯隊 en=敵。
   最後に勝ち負け「over outcome loseWhy repelBy」 */
const { openGame } = require('./browser.cjs');
(async () => {
  const { browser, page, errors } = await openGame();
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]'); await page.click('#goBattle'); await page.waitForTimeout(800);
  await page.click('#talkSkip').catch(()=>{}); await page.waitForTimeout(300);
  await page.click('#deployGo').catch(()=>{});
  const strat=process.argv[2]||'a';
  const r = await page.evaluate((strat) => {
    const log=[]; const mine=()=>fleets.filter(f=>f.team===0&&!f.ward&&f.alive);
    const L=(t='')=>log.push(`${clockStr()} ${phaseName} sunk=${Math.round(mainSunk()*100)}% drop=${drops.map(d=>d.taken?'X':d.state==='landing'?'L'+Math.round(d.prog):'o').join('')} bt=${fleets.filter(f=>f.fixed&&f.alive&&!f.silent).length} al=${fleets.filter(f=>f.ally&&!f.fixed).map(f=>f.alive?f.ships.length:'-').join('/')} me=${fleets.filter(f=>f.team===0&&!f.ward).map(f=>f.alive?f.ships.length:'-').join('/')} en=${fleets.filter(f=>f.team===1&&f.alive).map(f=>f.name.replace(/ エスカドラ/,'').replace(/ /,'').slice(0,5)+f.ships.length+(f.seen?'':'?')+(f.ai==='land'?`@${Math.round(f.pos.x)},${Math.round(f.pos.z)}`:'')).join(',')} ${t}`);
    L('start');
    let n=0;
    while(!over&&n++<40000){ step(.05);
      if(n%20) continue;
      const en=fleets.filter(x=>x.team===1&&x.alive&&x.seen), land=en.filter(e=>e.ai==='land'&&!e.landed);
      if(strat==='a') for(const f of mine()){ const pool=land.length?land:en.filter(e=>e.pos.z>-40); const e=pool.sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0];
        if(e&&!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); }
      if(strat==='d') mine().forEach((f,i)=>{ const d=drops[i%drops.length], spot=d.pos.clone().add(new THREE.Vector3(0,30,-25));
        const e=land.filter(e=>e.pos.distanceTo(d.pos)<90).sort((a,b)=>a.pos.distanceTo(d.pos)-b.pos.distanceTo(d.pos))[0]||en.filter(e=>e.pos.distanceTo(spot)<45).sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0];
        if(e){ if(!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); } else if(f.pos.distanceTo(spot)>8&&!(f.order&&f.order.type==='move')) order(f,{type:'move',dest:spot}); });
      if(strat==='c') for(const f of mine()) if(!f.order){ const e=en.sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0]; if(e) order(f,{type:'attack',target:e}); }
      if(n%100===0) L();
    }
    L('end'); return {log, over, outcome, loseWhy, repelBy};
  }, strat);
  console.log(r.log.join('\n')); console.log(r.over, r.outcome, r.loseWhy, r.repelBy, errors.slice(0, 3));
  await browser.close();
})();
