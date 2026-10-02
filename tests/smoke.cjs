/* War of Space smoke test: opens index.html in headless Chromium and walks through the main screens.
   Run with `npm test` (after `npm install`). Screenshots go to test-results/.
   The CDN scripts are served from node_modules/three, so the test also works offline. */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-results');
const THREE_DIR = path.dirname(require.resolve('three/package.json'));

let failed = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? '　' + detail : ''}`);
  if (!ok) failed++;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, route => {
    const u = route.request().url();
    const rel = u.includes('cdnjs') ? 'build/three.min.js' : u.split('three@0.128.0/')[1];
    route.fulfill({ path: path.join(THREE_DIR, rel), contentType: 'application/javascript' });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '' }));
  const shot = name => page.screenshot({ path: path.join(OUT, name + '.png') });
  /* advance the battle simulation directly (headless rendering is too slow to wait in real time) */
  const advance = sec => page.evaluate(sec => { const end = gameSec + sec; while (gameSec < end && !over) step(.05); return gameSec; }, sec);

  try {
    /* title */
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    check(await page.textContent('#menu h1') === 'WAR OF SPACE', 'タイトル画面');
    const data = await page.evaluate(() => ({ ships: WOS_DATA.ships.length, bonuses: WOS_DATA.bonuses.length, ops: WOS_DATA.operations.length }));
    await shot('01-title');

    /* ship data */
    await page.click('[data-go="data"]');
    check(await page.locator('#shipTbl tbody tr').count() === data.ships, '艦艇データ: 艦種の表', `${data.ships}艦種`);
    check(await page.locator('#bonusTbl tbody tr').count() === data.bonuses, '艦艇データ: 編成ボーナスの表', `${data.bonuses}種`);
    await shot('02-data');
    await page.click('[data-s="data"] .back');

    /* organization: each tab renders */
    await page.click('[data-go="org"]');
    for (const [tab, sel] of [['bg', '[data-bg]'], ['army', '[data-army]'], ['group', '[data-grp]']]) {
      await page.click(`[data-tab="${tab}"]`);
      check(await page.locator('#orgList ' + sel).count() > 0, `編成: ${tab} タブ`);
    }
    await shot('03-org-group');
    await page.click('[data-s="org"] .back');

    /* sortie with the first army group */
    await page.click('[data-go="sortie"]');
    check(await page.locator('#opList [data-op]').count() === data.ops, '出撃: 作戦の一覧', `${data.ops}作戦`);
    await shot('04-sortie');
    await page.click('#goBattle');
    await page.waitForTimeout(1500);
    const opName = await page.evaluate(() => op.name);
    check(await page.textContent('#bh') === opName, '出撃: 作戦概要', opName);
    check(await page.locator('#grpBtn').count() === 1, '出撃: 軍集団の全軍ボタン');
    const before = await page.evaluate(() => fleets.length);
    await advance(90);
    const after = await page.evaluate(() => ({ n: fleets.length, reinf: (op.reinforcements || []).filter(r => r.after <= 90 * CLOCK_RATE).length }));
    check(after.n === before + after.reinf, '出撃: 増援が時刻どおり現れる', `${after.reinf}隊`);
    await page.waitForTimeout(500);
    await shot('05-sortie-battle');

    /* quick battle */
    await page.evaluate(() => WOS.openMenu());
    await page.click('[data-act="quick"]');
    await page.waitForTimeout(3000);
    const legend = await page.textContent('#legend');
    check(legend.includes('地球連合') && legend.includes('惑星共和国'), 'クイック戦闘: 凡例の陣営名');
    check(await page.locator('#roster button').count() === await page.evaluate(() => op.quick.length), 'クイック戦闘: 自軍の一覧');
    await shot('06-quick');

    /* views change only the vertical angle */
    await page.evaluate(() => setAngles(60, 40));
    await page.click('#cv1'); await page.waitForTimeout(1200);
    const view = await page.evaluate(() => getAngles());
    check(Math.round(view.az) === 60 && view.el > 80, '視点: 真上にしても横の角度が変わらない', `横${Math.round(view.az)}° 縦${Math.round(view.el)}°`);
    await page.click('#cv0'); await page.waitForTimeout(1200);

    /* queued waypoints: the fleet passes the first point and stops at the last */
    const route = await page.evaluate(() => {
      const f = fleets.find(x => x.team === 0); select(f);
      const A = f.pos.clone().add(new THREE.Vector3(30, 0, -40)), B = f.pos.clone().add(new THREE.Vector3(-10, 0, -80));
      groupOrder({ type: 'move', dest: A }); groupOrder({ type: 'move', dest: B, queue: true });
      const pts = f.order.path.pts.length; let minA = 1e9, n = 0;
      while (f.order && f.order.type === 'move' && n++ < 4000) { step(.05); minA = Math.min(minA, f.pos.distanceTo(A)); }
      return { pts, minA, endB: f.pos.distanceTo(B) };
    });
    check(route.pts === 2 && route.minA < 1 && route.endB < .1, '予約指示: 経由地を通って終点に着く', `経由地まで${route.minA.toFixed(2)}`);

    /* engagement stance: 回避 holds fire, 交戦 fires */
    const stance = await page.evaluate(() => ['evade', 'engage'].map(st => {
      reset(); const f = fleets.find(x => x.team === 0), e = fleets.find(x => x.team === 1);
      select(f); setStance(st); f.pos.set(e.pos.x, e.pos.y, e.pos.z + Math.min(12, f.range * .8));
      let fired = 0; for (let i = 0; i < 40; i++) { step(.05); if (f.revealT > 0) fired++; } return fired;
    }));
    check(stance[0] === 0 && stance[1] > 0, '交戦/回避: 回避中は撃たず、交戦では撃つ');
    await page.evaluate(() => { reset(); select(null); });

    /* a player order, then tens of seconds of combat */
    await page.evaluate(() => { const f = fleets.find(x => x.team === 0); select(f); groupOrder({ type: 'attack', target: fortress }); });
    await advance(60);
    check(await page.evaluate(() => engaged.size > 0), 'クイック戦闘: 交戦が始まる');
    await page.waitForTimeout(500);
    await shot('07-quick-combat');

    /* victory: destroy the fortress */
    await page.evaluate(() => damage(fortress, fortress.hpPool + 1, fleets.find(x => x.team === 0 && x.alive)));
    await page.waitForTimeout(2000);
    check(await page.isVisible('#result') && await page.textContent('#rh') === '勝利', 'クイック戦闘: 要塞を落とすと勝利');
    await shot('08-victory');
  } catch (e) {
    check(false, '実行中に例外', e.message);
  }

  check(errors.length === 0, 'ページのエラーなし', errors.join(' / '));
  await browser.close();
  console.log(failed ? `\n${failed}件の確認に失敗しました。` : '\nすべての確認に通りました。');
  process.exit(failed ? 1 : 0);
})();
