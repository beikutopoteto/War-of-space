/* 作業票 #236: 作戦の長さを測る（ゲームのデータは変更しない）。
   node tools/length-sim.cjs [作戦id …] [runs=N]
   既定: 第1〜6節、各遊び方3回。作戦を3つ並列で実行する。
   auto だけ出撃上限まで艦隊単位で複製し、toStage で研究する。
   複製は op-sim と同じため、端数分は上限に届かない。
   早送り上限3000ゲーム秒、各回の実行上限10分。未終結・例外は失敗。
   表の分数は gameSec / 60（1倍速実時間）。失敗は長さの集計から除く。 */
const { openGame, toStage } = require('./browser.cjs');
const IDS = ['shinano', 'retreat', 'nile', 'denali', 'februaria', 'denaliBreak'];
const args = process.argv.slice(2);
const ids = args.filter(a => !a.startsWith('runs='));
const runArgs = args.filter(a => a.startsWith('runs='));
const runs = runArgs.length ? Number(runArgs[0].slice(5)) : 3;
if (runArgs.length > 1 || !Number.isSafeInteger(runs) || runs < 1 || ids.some(id => !IDS.includes(id))) {
  console.error('使い方: node tools/length-sim.cjs [shinano retreat nile denali februaria denaliBreak] [runs=正の整数]');
  process.exit(1);
}
const selected = ids.length ? [...new Set(ids)] : IDS;
async function trial(id, strat) {
  let browser, timer;
  const work = async () => {
    const game = await openGame();
    browser = game.browser;
    const { page, errors } = game;
    await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
    await page.click('[data-go="sortie"]'); await page.click(`[data-op="${id}"]`);
    await page.click('#goBattle'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
    await page.click('#deployGo').catch(() => {});
    if (strat === 'auto') await toStage(page);
    const result = await page.evaluate(({ strat }) => {

    const own = () => fleets.filter(f => f.team === 0 && f.stats && f.alive);
    const scale = WOS_DATA.scales[op.scale];
    const pace = op.pace ?? 1;
    const target = { min: scale.min * pace, max: scale.max == null ? null : scale.max * pace };
    const army = strat === 'auto' ? (op.cap ?? scale.cap) : 0;
    if (army) { const base = own(); let total = base.reduce((s, f) => s + f.n, 0), k = 0;
      while (base.length && total + base[k % base.length].n <= army) { const f = base[k % base.length], o = {};
        for (const key of ['sub', 'type', 'comp', 'n', 'dmg', 'eva', 'range', 'scale', 'vis', 'stl', 'hangar', 'craft', 'aa', 'stats']) if (f[key] != null) o[key] = f[key];
        o.name = `${f.name}（写し${Math.floor(k / base.length) + 1}）`; o.hp = f.hp / HP_K; o.speed = f.speed / SPEED_K; o.pos = [f.pos.x + (Math.random() - .5) * 30, f.pos.z + (Math.random() - .5) * 20]; o.alt = f.pos.y;
        fleets.push(makeFleet(0, o)); total += f.n; k++; }
      buildRoster(); updateRoster(); }
    const initialShips = own().reduce((sum, f) => sum + f.n, 0);
    if (strat === 'auto') autoMode = true;
    const mine = () => fleets.filter(f => f.team === 0 && !f.ward && !f.convoy && f.alive), isMain = e => !!(e.comp && e.comp.bb);
    let n = 0; while (!over && n++ < 60000) { step(.05);
      if (strat !== 'escort' || n % 10 || !convoy || !convoy.alive) continue;
      const seen = fleets.filter(e => e.team === 1 && e.alive && e.seen && e.ai !== 'scout' && !isMain(e) && e.pos.distanceTo(convoy.pos) < 90);
      mine().forEach((f, i) => { const pri = e => (e.hangars && e.hangars.length ? 0 : 200) + e.pos.distanceTo(f.pos), e = seen.sort((a, b) => pri(a) - pri(b))[0];
        if (e) { if (!(f.order && f.order.target === e)) order(f, { type: 'attack', target: e }); }
        else if (n % 40 === 0) { const a = i * 1.57; order(f, { type: 'move', dest: convoy.pos.clone().add(new THREE.Vector3(Math.cos(a) * 12, 0, Math.sin(a) * 12 + 10)) }); } }); }
    return { over, win: outcome === true, sec: gameSec, why: loseWhy || '理由なし', target,
      initialShips };
    }, { strat });
    if (errors.length) throw new Error(errors.join('; '));
    if (!result.over) return { ...result, failure: '3000ゲーム秒で未終結' };
    return result;
  };
  let expired = false;
  try {
    return await Promise.race([
      work().then(async r => { if (expired && browser) await browser.close(); return r; }),
      new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('実行上限10分')); }, 600000); })
    ]);
  } catch (e) { return { failure: e.message }; }
  finally { clearTimeout(timer); if (browser) await browser.close().catch(() => {}); }
}
const median = a => { const b = [...a].sort((x,y) => x-y), m = Math.floor(b.length/2); return b.length ? (b.length % 2 ? b[m] : (b[m-1]+b[m])/2) : null; };
const cell = s => String(s).replace(/\|/g, '／').replace(/[\r\n]/g, ' ');
function report(rows) {
  console.log('\n分数は1倍速実時間。* は目安の範囲外。— は該当なし。失敗は長さの集計から除外。');
  console.log('| 作戦 | 遊び方 | 回数 | 勝ち | 勝ち最短 | 勝ち中央値 | 勝ち最長 | 全回中央値 | 負けの理由 (loseWhy) | 失敗 | 目安（分） |');
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---|---|---|');
  for (const {id, strat, results} of rows) {
    const done = results.filter(r => !r.failure), wins = done.filter(r => r.win).map(r => r.sec / 60);
    const target = results.find(r => r.target)?.target;
    const fmt = n => n == null ? '—' : n.toFixed(2) + (target && (n < target.min || target.max != null && n > target.max) ? '*' : '');
    const counts = values => { const m = new Map(); for (const v of values) m.set(v, (m.get(v)||0)+1); return [...m].map(([k,v]) => `${k}: ${v}`).join('、') || '—'; };
    console.log('| ' + [id, strat, results.length, wins.length, fmt(wins.length ? Math.min(...wins) : null), fmt(median(wins)), fmt(wins.length ? Math.max(...wins) : null), fmt(median(done.map(r => r.sec/60))), counts(done.filter(r => !r.win).map(r => r.why)), counts(results.filter(r => r.failure).map(r => r.failure)), target ? `${target.min}〜${target.max ?? ''}` : '—'].map(cell).join(' | ') + ' |');
  }
}
(async () => {
  const rows = selected.flatMap(id => (['shinano','retreat'].includes(id) ? ['idle','auto','escort'] : ['idle','auto']).map(strat => ({id, strat, results: []})));
  let next = 0;
  async function worker() {
    while (next < selected.length) {
      const id = selected[next++];
      for (const row of rows.filter(r => r.id === id)) for (let i = 0; i < runs; i++) {
        const result = await trial(id, row.strat); row.results.push(result);
        console.error(JSON.stringify({id, strat: row.strat, run: i+1, ...result}));
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(3, selected.length)}, worker));
  report(rows);
})().catch(e => { console.error(e); process.exitCode = 1; });
