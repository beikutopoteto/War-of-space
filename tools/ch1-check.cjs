/* 第一章の通しのバグ取り（作業票 #308、2026-11-05）: 1つの作戦を最後まで早送りし、勝ち負けと長さに加えて、ページの例外・console.error・
   任務欄と名札に出た NaN／undefined（100手ごとに採る）を1行の表で出す。
   node tools/ch1-check.cjs <作戦の id> [auto|idle|escort] [army=N]。STAGE=1・TECH=1・PATCH=ファイル.js は tools/op-sim.cjs と同じ。
   演習（charybdis）のように戦区軍の選べない作戦はクイック出撃で始める */
const { openGame, toStage } = require('./browser.cjs');
const id = process.argv[2], strat = process.argv[3] || 'idle';
const opt = Object.fromEntries(process.argv.slice(3).filter(a => a.includes('=')).map(a => a.split('=')));
(async () => {
  const { browser, page, errors } = await openGame();
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  if (process.env.TECH) await page.click('#dbgB [data-dbga="tech"]');
  if (process.env.PATCH) await page.evaluate(require('fs').readFileSync(process.env.PATCH, 'utf8'));
  await page.click('#mainNav [data-go="mode"]'); await page.click('[data-s="mode"] [data-go="sortie"]'); await page.click(`[data-op="${id}"]`); if (await page.locator('#goQuick').isVisible()) await page.click('#goQuick');
    else { await page.click('#goBattle'); if (await page.locator('#forcesBattle').isVisible()) await page.click('#forcesBattle'); }
    await page.waitForTimeout(800);
    const actualId = await page.evaluate(() => op.id);
    if (actualId !== id) throw new Error(`作戦が違います: 指定 ${id}、開始 ${actualId}`);
  await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
  await page.click('#deployGo').catch(() => {});
  if (process.env.STAGE) await toStage(page);
  const r = await page.evaluate(({ strat, army }) => {
    const own = () => fleets.filter(f => f.team === 0 && f.stats && f.alive);
    if (army) { const base = own(); let total = base.reduce((s, f) => s + f.n, 0), k = 0;
      while (base.length && total + base[k % base.length].n <= army) { const f = base[k % base.length], o = {};
        for (const key of ['sub', 'type', 'comp', 'n', 'dmg', 'eva', 'range', 'scale', 'vis', 'stl', 'hangar', 'craft', 'aa', 'stats']) if (f[key] != null) o[key] = f[key];
        o.name = `${f.name}（写し${Math.floor(k / base.length) + 1}）`; o.hp = f.hp / HP_K; o.speed = f.speed / SPEED_K; o.pos = [f.pos.x + (Math.random() - .5) * 30, f.pos.z + (Math.random() - .5) * 20]; o.alt = f.pos.y;
        fleets.push(makeFleet(0, o)); total += f.n; k++; }
      buildRoster(); updateRoster(); }
    const start = own().map(f => `${f.name.slice(0, 8)} ${f.n}隻 耐久${(f.hp / HP_K).toFixed(1)} 打撃${f.dmg.toFixed(2)}`);
    if (strat === 'auto') autoMode = true;
    const mine = () => fleets.filter(f => f.team === 0 && !f.ward && !f.convoy && f.alive), isMain = e => !!(e.comp && e.comp.bb);
    let n = 0; const anomalies = []; while (!over && n++ < 60000) { step(.05);
      if (n % 100 === 0 || over) { updateGoal(); updateRoster(); const checks = [['goal', document.querySelector('#goal').textContent], ['labels', [...units()].filter(u => u.alive && u.el).map(u => (u.el.textContent || '') + ' ' + (u.kind === 'fleet' ? subText(u) : '')).join(' ')]]; for (const [where, value] of checks) if (/NaN|undefined/.test(value) && !anomalies.some(a => a.where === where)) anomalies.push({ where, sec: gameSec, text: value.match(/.{0,35}(?:NaN|undefined).{0,35}/)[0] }); }
      if (strat !== 'escort' || n % 10 || !convoy || !convoy.alive) continue;
      const seen = fleets.filter(e => e.team === 1 && e.alive && e.seen && e.ai !== 'scout' && !isMain(e) && e.pos.distanceTo(convoy.pos) < 90);
      mine().forEach((f, i) => { const pri = e => (e.hangars && e.hangars.length ? 0 : 200) + e.pos.distanceTo(f.pos), e = seen.sort((a, b) => pri(a) - pri(b))[0];
        if (e) { if (!(f.order && f.order.target === e)) order(f, { type: 'attack', target: e }); }
        else if (n % 40 === 0) { const a = i * 1.57; order(f, { type: 'move', dest: convoy.pos.clone().add(new THREE.Vector3(Math.cos(a) * 12, 0, Math.sin(a) * 12 + 10)) }); } }); }
    const side = pick => { const a = fleets.filter(f => f.kind === 'fleet' && !f.fixed && !f.convoy && f.type !== 'tr' && pick(f)), t = a.reduce((s, f) => s + f.n, 0), k = a.reduce((s, f) => s + (f.alive || f.left ? f.ships.length : 0), 0); return `${t - k}/${t}`; };
    return { anomalies, start, over, outcome: typeof outcome !== 'undefined' ? outcome : null, why: loseWhy, sec: Math.round(gameSec), clock: clockStr(),
      sunk: { me: side(f => f.team === 0 && !f.ward && !f.ally && !f.isCarrier), ally: side(f => f.team === 0 && (f.ally || f.ward) && !f.isCarrier), enemy: side(f => f.team === 1) },
      convoy: typeof convoy !== 'undefined' && convoy ? `${convoy.alive ? convoy.ships.length : 0}/${convoy.n}` : null,
      carrier: opCarrier ? (opCarrier.alive ? Math.round(opCarrier.hpPool) : 'x') : null,
      fort: fortress && fortress.max ? Math.round(100 * Math.max(0, fortress.hpPool) / fortress.max) + '%' : null };   // the fortress or the station we keep
  }, { strat, army: +opt.army || 0 });
  console.log('| ' + [id, r.over ? (r.outcome ? '勝ち' : '負け') : '未終結', (r.sec / 60).toFixed(2), JSON.stringify(r.anomalies), JSON.stringify(errors)].join(' | ') + ' |');
  await browser.close();
})();
