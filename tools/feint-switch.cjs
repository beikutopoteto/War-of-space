/* 作業票 #254: 第6節で killAt 分（既定 110 = 14:50）に核の戦艦3隻を沈めて切り替え（feintAssault）を起こし、オートで最後まで早送りする。
   node tools/feint-switch.cjs [runs=3] [killAt=110]
   出すもの: 切り替えの時刻と側ごとの隻数、推進器の落ちた時刻、切り替えのあとの1秒標本の和 tally
   （側:狙いの種類。thr=推進器 gun=砲台 ship=敵艦 none=なし、wing は小型機）。研究は節まで（toStage）。
   dmg はページ内の damage(t,amt,src) を包んで測る切り替え後の打撃の和（実際の hpPool の減少、撃沈時の超過分も含む）。
   キーは側:ship/wing:thr/gun/ship/other。dmgHits は左上が推進器・砲台に打撃を与えた時刻・隊・小型機の state・母艦の mode・呼び出し元の stack。 */
const { openGame, toStage } = require('./browser.cjs');
const runs = Number(process.argv[2] || 3), killAt = Number(process.argv[3] || 110);
(async () => { for (let run = 1; run <= runs; run++) { const { browser, page, errors } = await openGame(); try {
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]'); await page.click('[data-go="sortie"]'); await page.click('[data-op="denaliBreak"]'); await page.click('#goBattle');
  await page.evaluate(() => { speed = 0; if (talking) endTalk(); if (deploying) endDeploy(); }); await toStage(page);
  const r = await page.evaluate(killAt => { autoMode = true; const ev = [], tally = {}, dmg = {}, dmgHits = [], down = new Set(); let killed = false, sw = null, ticks = 0, departed = 0, outside = 0;
    const kind = t => !t ? 'none' : t.restore ? 'thr' : t.fixed ? (t.type === 'aa' ? 'gun' : 'fixed') : t.team === 1 ? 'ship' : 'other';
    const dmgKind = t => t.restore ? 'thr' : t.fixed && t.type === 'aa' ? 'gun' : t.kind === 'fleet' && !t.fixed && t.team === 1 ? 'ship' : 'other';
    for (const side of ['左上', '右下']) for (const unit of ['ship', 'wing']) for (const target of ['thr', 'gun', 'ship', 'other']) dmg[side + ':' + unit + ':' + target] = 0;
    const originalDamage = damage;
    damage = function(t, amt, src) {
      const wing = !!src.carrier, fleet = wing ? src.carrier : src, side = fleet.feint;
      const track = !!feintAll && !!side && (wing || src.kind === 'fleet');
      const before = t.hpPool, target = track ? dmgKind(t) : null;
      const hit = track && side === '左上' && (target === 'thr' || target === 'gun') ?
        { clock: clockStr(), gameSec, side, unit: wing ? 'wing' : 'ship', fleet: fleet.name, source: src.name, target: t.name, state: wing ? src.state : null, mode: fleet.mode, stack: new Error().stack } : null;
      const result = originalDamage(t, amt, src);
      const dealt = before - t.hpPool;
      if (track && dealt > 0) {
        const key = side + ':' + (wing ? 'wing' : 'ship') + ':' + target;
        dmg[key] = (dmg[key] || 0) + dealt;
        if (hit) dmgHits.push({ ...hit, dmg: dealt });
      }
      return result;
    };
    try {
    while (!over && ticks < 80000) { step(.05); ticks++;
      if (!killed && opMin() >= killAt && nuke.bbs && nuke.bbs.length) { killed = true; const src = fleets.find(e => e.team === 1 && e.alive && !e.fixed);
        nuke.bbs.slice(0, 3).forEach(b => b.f && b.f.alive && destroyFleet(b.f, src)); ev.push(clockStr() + ' kill3'); }
      if (!sw && feintAll) { sw = clockStr(); ev.push(sw + ' switch ' + JSON.stringify(feintAll.n0)); }
      for (const f of fleets) if (f.restore && !f.alive && !down.has(f)) { down.add(f); ev.push(clockStr() + ' thrDown ' + f.name); }
      if (sw && ticks % 20 === 0) {
        departed = Math.max(departed, fleets.filter(f => f.feint && (f.left || f.mode === 'gone')).length);
        if (fleets.some(f => f.restore && f.alive)) outside = Math.max(outside, fleets.filter(f => f.feint && f.alive && Math.hypot(f.pos.x-fieldC.x, f.pos.z-fieldC.z)>FIELD_R).length);
        for (const f of fleets) if (f.ally && f.alive && f.feint) { const k = f.feint + ':' + kind(f.order?.target || f.fireTarget); tally[k] = (tally[k] || 0) + 1; }
        for (const w of wings) if (w.alive && w.carrier.feint) { const k = w.carrier.feint + ':wing:' + kind(w.fireTarget || w.target); tally[k] = (tally[k] || 0) + 1; } } }
    return { over, win: outcome, why: loseWhy, clock: clockStr(), ev, tally, dmg, departed, outside, feints: fleets.filter(f => f.ally && f.feint).map(f => f.feint + ' ' + f.name + ' ' + (f.alive ? f.ships.length : 'x')) };
    } finally { damage = originalDamage; } }, killAt);
  if (errors.length) throw Error(errors.join(';')); console.log(JSON.stringify({ run, ...r }));
} finally { await browser.close(); } } })().catch(e => { console.error(e); process.exitCode = 1; });
