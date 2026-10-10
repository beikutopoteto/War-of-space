/* 第4節「デナリの盾」を最後まで早送りして、時刻ごとの様子を出す（釣り合わせの確かめ）。3〜4分かかる。
   node tools/denali-sim.cjs <a|b>
   a: 駐屯隊が奇襲部隊を叩きに行く  b: 着陸したら駐屯隊をすぐ離脱点へ逃がす
   行の読み方: 時刻 段階 cas=民間の被害 yk=ユーコンの耐久 al=本軍6隊の隻数（L=離脱） me=駐屯隊 en=敵 aa=残りの砲台。
   最後に乗せた人数と、駐屯隊に打撃を与えた敵の内訳。勝ち負けは「over outcome loseWhy」 */
const { openGame } = require('./browser.cjs');
(async () => {
  const { browser, page, errors } = await openGame();
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  await page.click('[data-go="sortie"]'); await page.click('[data-op="denali"]'); await page.click('#goBattle'); await page.waitForTimeout(800);
  await page.click('#talkSkip').catch(()=>{}); await page.waitForTimeout(300);
  await page.click('#deployGo').catch(()=>{});
  const strat=process.argv[2]||'a';
  const r = await page.evaluate((strat) => {
    const log=[]; const L=(t='')=>log.push(`${clockStr()} ${phaseName} cas=${Math.round(casualties)} yk=${opCarrier.alive?Math.round(opCarrier.hpPool):'x'} al=${fleets.filter(f=>f.ally).map(f=>f.alive?f.ships.length:(f.left?'L':'-')).join('/')} me=${fleets.filter(f=>f.team===0&&!f.ward&&!f.isCarrier).map(f=>f.alive?f.ships.length:'-').join('/')} en=${fleets.filter(f=>f.team===1&&f.alive&&!f.fixed).map(f=>f.name.slice(0,5)+f.ships.length).join(',')} aa=${fleets.filter(f=>f.fixed&&f.alive).length} ${t}`);
    const mine=()=>fleets.filter(f=>f.team===0&&!f.ward&&!f.isCarrier&&f.alive);
    L('start '+mine().map(f=>`${f.name.slice(0,6)}:${f.n}x${f.hp.toFixed(1)} d${f.dmg.toFixed(2)} r${f.range.toFixed(0)} s${f.speed}`).join(' '));
    const dmgBy={}; const _d=damage; damage=function(t,amt,src){ if(t.team===0&&t.kind==='fleet'&&!t.ally&&!t.isCarrier){ const k=(src.kind==='wing'?'W:':'')+(src.carrier?src.carrier.name:src.name); dmgBy[k]=(dmgBy[k]||0)+amt; } return _d(t,amt,src); };
    const P=op.body.port, port=new THREE.Vector3(P.pos[0],0,P.pos[1]);
    let n=0, sent=false, flee=false;
    while(!over&&n++<40000){ step(.05);
      if(n%20) continue;
      const en=fleets.filter(x=>x.team===1&&x.alive&&x.seen);
      if(phaseName==='奪還'||phaseName==='交戦'){
        const tgt=en.filter(e=>e.name.includes('第14')||e.name==='第5 デナリ対空砲台'||e.name==='第6 デナリ対空砲台');
        for(const f of mine()) if(!f.order){ const e=tgt.sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0]; if(e) order(f,{type:'attack',target:e}); }
        if(!sent&&!fleets.some(x=>x.alive&&(x.name.includes('第14')||x.name==='第5 デナリ対空砲台'||x.name==='第6 デナリ対空砲台'))){ sent=true; order(opCarrier,{type:'move',dest:port.clone()}); L('send carrier'); }
        if(n>8000&&!sent){ sent=true; order(opCarrier,{type:'move',dest:port.clone()}); L('send carrier (timeout)'); }
      } else if(phaseName==='収容'||phaseName==='占領'){
        if(strat==='a'){ const raid=en.filter(e=>!e.fixed); for(const f of mine()) if(!f.order||n%200===0){ const e=raid.sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0]; if(e) order(f,{type:'attack',target:e}); } }
        if(strat==='b'&&!flee){ flee=true; for(const f of mine()) order(f,{type:'move',dest:opCarrier.cs.exit.clone()}); }
      } else if(phaseName==='撤退'){
        if(!opCarrier.order) order(opCarrier,{type:'move',dest:opCarrier.cs.exit.clone()});
        if(!flee){ flee=true; for(const f of mine()) order(f,{type:'move',dest:opCarrier.cs.exit.clone()}); }
      }
      if(opCarrier.cs.evac&&!window._ev){ window._ev=1; L('EVAC'); }
      if(n%160===0) L(`A1=${(f=>f.alive?Math.round(f.pos.x)+","+Math.round(f.pos.z)+":"+f.mode:"x")(fleets.find(x=>x.ally))} A3=${(f=>f.alive?Math.round(f.pos.x)+","+Math.round(f.pos.z)+":"+f.mode:"x")(fleets.filter(x=>x.ally)[1])} ALV=${(f=>f?f.alive?Math.round(f.pos.x)+","+Math.round(f.pos.z)+(f.seen?"":"?"):"dead":"-")(fleets.find(x=>x.ace))} W=${wings.filter(w=>w.team===1).reduce((s,w)=>s+w.n,0)}`);
    }
    L('boarded='+(opCarrier.cs.boarded)+' end '+JSON.stringify(Object.fromEntries(Object.entries(dmgBy).map(([k,v])=>[k,Math.round(v)])))); return {log, over, outcome, loseWhy};
  }, strat);
  console.log(r.log.join('\n')); console.log(r.over, r.outcome, r.loseWhy, errors.slice(0, 3));
  await browser.close();
})();
