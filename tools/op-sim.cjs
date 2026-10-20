/* 1つの作戦を最後まで早送りして、勝ち負け・長さ・両軍の沈んだ隻数を出す（2026-10-20、両陣営の艦種の表で釣り合わせ直すときの確かめ）。
   node tools/op-sim.cjs <作戦の id> [auto|idle] [army=N]
   auto: デバッグのオートモード（battle/sim.js の autoAI）。idle: 何もしない（既定）。army=N: 自分の艦隊を写して約 N 隻にする
   STAGE=1 を付けると、自分で編成した艦隊を、その作戦の技術の段階（op.stage）まで研究した値にする（地球の表。速さも段階の割合。
   作戦の想定する研究の度合い）。TECH=1 は全研究。PATCH=ファイル.js は始める前にそのスクリプトをページで実行する（データは書き換えない）。
   出すもの: 勝ち負けと理由（over outcome loseWhy）、戦闘の秒（1倍速の実時間）と作戦の時刻、両軍の沈んだ隻数（自軍・友軍・敵）、輸送船の残り */
const { openGame } = require('./browser.cjs');
const id = process.argv[2], strat = process.argv[3] || 'idle';
const opt = Object.fromEntries(process.argv.slice(3).filter(a => a.includes('=')).map(a => a.split('=')));
(async () => {
  const { browser, page, errors } = await openGame();
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  if (process.env.TECH) await page.click('#dbgB [data-dbga="tech"]');
  if (process.env.PATCH) await page.evaluate(require('fs').readFileSync(process.env.PATCH, 'utf8'));
  await page.click('[data-go="sortie"]'); await page.click(`[data-op="${id}"]`); await page.click('#goBattle'); await page.waitForTimeout(800);
  await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
  await page.click('#deployGo').catch(() => {});
  const r = await page.evaluate(({ strat, army, stage }) => {
    const own = () => fleets.filter(f => f.team === 0 && f.stats && f.alive);
    /* the player's own fleets researched as far as the operation's stage (the Earth's tables; the speed at the same rate, as the player's) */
    if (stage) own().forEach(f => { const p = op.stage || 0, rate = techRate('earth', p), v = techFleet(0, { comp: f.comp, hangar: f.hangar });
      const spd = Math.min(...Object.keys(f.comp).map(t => CLASS_MAX[t].spd)) * rate;
      Object.assign(f, { hp: v.hp * HP_K, hpPool: f.n * v.hp * HP_K, dmg: v.dmg, eva: v.eva, range: v.range, speed: (2 + spd) * SPEED_K, craft: { ...f.craft, ...v.craft } }); });
    if (army) { const base = own(); let total = base.reduce((s, f) => s + f.n, 0), k = 0;
      while (base.length && total + base[k % base.length].n <= army) { const f = base[k % base.length], o = {};
        for (const key of ['sub', 'type', 'comp', 'n', 'dmg', 'eva', 'range', 'scale', 'vis', 'stl', 'hangar', 'craft', 'aa', 'stats']) if (f[key] != null) o[key] = f[key];
        o.name = `${f.name}（写し${Math.floor(k / base.length) + 1}）`; o.hp = f.hp / HP_K; o.speed = f.speed / SPEED_K; o.pos = [f.pos.x + (Math.random() - .5) * 30, f.pos.z + (Math.random() - .5) * 20]; o.alt = f.pos.y;
        fleets.push(makeFleet(0, o)); total += f.n; k++; }
      buildRoster(); updateRoster(); }
    const start = own().map(f => `${f.name.slice(0, 8)} ${f.n}隻 耐久${(f.hp / HP_K).toFixed(1)} 打撃${f.dmg.toFixed(2)}`);
    if (strat === 'auto') autoMode = true;
    let n = 0; while (!over && n++ < 60000) step(.05);
    const side = pick => { const a = fleets.filter(f => f.kind === 'fleet' && !f.fixed && !f.convoy && f.type !== 'tr' && pick(f)), t = a.reduce((s, f) => s + f.n, 0), k = a.reduce((s, f) => s + (f.alive || f.left ? f.ships.length : 0), 0); return `${t - k}/${t}`; };
    return { start, over, outcome: typeof outcome !== 'undefined' ? outcome : null, why: loseWhy, sec: Math.round(gameSec), clock: clockStr(),
      sunk: { me: side(f => f.team === 0 && !f.ward && !f.ally && !f.isCarrier), ally: side(f => f.team === 0 && (f.ally || f.ward) && !f.isCarrier), enemy: side(f => f.team === 1) },
      convoy: typeof convoy !== 'undefined' && convoy ? `${convoy.alive ? convoy.ships.length : 0}/${convoy.n}` : null,
      carrier: opCarrier ? (opCarrier.alive ? Math.round(opCarrier.hpPool) : 'x') : null };
  }, { strat, army: +opt.army || 0, stage: !!process.env.STAGE });
  console.log(JSON.stringify(r, null, 1)); if (errors.length) console.log('errors', errors.slice(0, 3));
  await browser.close();
})();
