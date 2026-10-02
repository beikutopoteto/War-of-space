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
    /* a new battle group gets the next free 第N戦闘団 */
    await page.click('[data-tab="bg"]');
    const bgCount = await page.locator('#orgList [data-bg]').count();
    await page.click('#orgList [data-new]');
    const newName = await page.inputValue('#bgName');
    check(newName === `第${bgCount + 1}戦闘団`, '編成: 新しい戦闘団の名前', newName);
    await page.click('[data-tab="group"]');
    /* choose another army as the flagship */
    await page.click('#orgDetail [data-flag="1"]');
    const flag = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).groups[0].flag);
    check(flag === 'a2' && (await page.textContent('#orgDetail [data-flag="1"]')).includes('旗艦'), '編成: 軍集団の旗艦を選べる', flag);
    await page.click('#orgDetail [data-flag="0"]');
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
    /* the formation is laid out around the flagship: at deploy, after a group move, and after 陣形 */
    const fm = await page.evaluate(() => {
      const fl = groupFlag(), rel = f => f.pos.clone().sub(fl.pos), want = f => formationOffset(f);
      const near = (a, b) => a.distanceTo(b) < .01, others = groupAlive().filter(f => f !== fl);
      const deploy = others.every(f => near(rel(f), want(f))) && Math.abs(fl.pos.z - op.deploy[1]) < .01;
      selectGroup(); const D = fl.pos.clone().add(new THREE.Vector3(10, 0, -30)); groupOrder({ type: 'move', dest: D });
      const move = near(fl.order.dest, D) && others.every(f => near(f.order.dest.clone().sub(D), want(f)));
      fl.pos.x += 20; reform();
      const re = !fl.order && others.every(f => near(f.order.dest.clone().sub(fl.pos), want(f)));
      select(null); return { deploy, move, re, flag: fl.name, roster: fl.btn.textContent };
    });
    check(fm.deploy && fm.move && fm.re && fm.roster.startsWith('★'), '軍集団: 旗艦を中心に陣形を組む（展開・全軍の移動・陣形ボタン）', fm.flag);
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
    check(await page.locator('#roster button[id^="fl"]').count() === await page.evaluate(() => op.quick.length), 'クイック戦闘: 自軍の一覧');
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

    /* clicking an enemy offers attack or move-here; a chase arrow follows the target */
    await page.click('#sp0');
    const es = await page.evaluate(() => { reset(); select(fleets.find(x => x.team === 0)); const e = fleets.find(x => x.team === 1 && x.seen); setAlt(e.pos.y, false); return { s: proj(e.pos), x: e.pos.x, z: e.pos.z }; });
    await page.mouse.click(es.s.x, es.s.y);
    const picked = await page.isVisible('#pick');
    await page.click('[data-pk="move"]');
    const mv = await page.evaluate(() => { const o = selected.order; return o && o.type === 'move' ? Math.hypot(o.dest.x, o.dest.z) && [o.dest.x, o.dest.z] : null; });
    check(picked && mv && Math.hypot(mv[0] - es.x, mv[1] - es.z) < 3, '敵をクリック: 「ここへ移動」で敵の位置へ移動できる');
    await page.mouse.click(es.s.x, es.s.y); await page.click('[data-pk="attack"]');
    const chase = await page.evaluate(() => { const f = selected, t = f.order.target; t.pos.x += 20; step(.05); return f.order.type; });
    await page.click('#sp1'); await page.waitForTimeout(600);
    const follows = await page.evaluate(() => { const f = selected; return !!f.arrow && f.arrow.to.distanceTo(f.order.target.pos) < 1.5; });
    check(chase === 'attack' && follows, '敵をクリック: 「攻撃」で追撃し、矢印が敵を追う');

    /* a queued attack starts once the move ahead of it is done */
    const qa = await page.evaluate(() => { reset(); const f = fleets.find(x => x.team === 0), e = fleets.find(x => x.team === 1 && x.seen); select(f);
      groupOrder({ type: 'move', dest: f.pos.clone().add(new THREE.Vector3(0, 0, -15)) }); groupOrder({ type: 'attack', target: e, queue: true });
      const queued = f.queue.length, first = f.order.type; let n = 0; while (f.order && f.order.type === 'move' && n++ < 2000) step(.05);
      return { queued, first, then: f.order && f.order.type, target: f.order && f.order.target === e }; });
    check(qa.queued === 1 && qa.first === 'move' && qa.then === 'attack' && qa.target, '予約指示: 移動のあとに予約した攻撃が始まる');
    await page.evaluate(() => { reset(); select(null); });

    /* engagement stance: 回避 holds fire, 交戦 fires */
    const stance = await page.evaluate(() => ['evade', 'engage'].map(st => {
      reset(); const f = fleets.find(x => x.team === 0), e = fleets.find(x => x.team === 1);
      select(f); setStance(st); f.pos.set(e.pos.x, e.pos.y, e.pos.z + Math.min(12, f.range * .8));
      let fired = 0; for (let i = 0; i < 40; i++) { step(.05); if (f.revealT > 0) fired++; } return fired;
    }));
    check(stance[0] === 0 && stance[1] > 0, '交戦/回避: 回避中は撃たず、交戦では撃つ');
    await page.evaluate(() => { reset(); select(null); });

    /* small craft and a hostile fortress (both sides): never the fortress on their own; they keep to their carrier's side of its guns.
       The target their carrier was ordered to attack overrides this and holds through later moves */
    const fort = await page.evaluate(() => {
      reset(); const c = fleets.find(x => x.team === 0 && x.hangars.length), foes = fleets.filter(x => x.team === 1), e = foes[0];
      foes.forEach(x => { x.alive = false; }); c.speed = 0; c.pos.set(fortress.pos.x, fortress.pos.y, fortress.pos.z + fortress.range + FORT_MARGIN + 3);
      const run = () => { for (let i = 0; i < 40; i++) step(.05); return wings.filter(w => w.team === 0 && w.alive); };
      const fortOnly = run().length;
      e.alive = true; e.ai = null; e.leash = 0; e.speed = 0; e.pos.set(c.pos.x + 8, c.pos.y, fortress.pos.z + fortress.range - 6); e.post = e.pos.clone();
      const nearFort = run().length;
      e.pos.set(c.pos.x, c.pos.y, c.pos.z + 40); e.post = e.pos.clone(); const away = run(); const awayHit = away.length > 0 && away.every(w => w.target === e);
      e.alive = false; for (let i = 0; i < 40; i++) step(.05);
      const retarget = wings.filter(w => w.team === 0 && w.alive).every(w => w.target !== fortress);
      order(c, { type: 'attack', target: fortress }); for (let i = 0; i < 80; i++) step(.05);
      const ordered = wings.some(w => w.team === 0 && w.alive && w.target === fortress);
      order(c, { type: 'move', dest: c.pos.clone().add(new THREE.Vector3(4, 2, 0)) }); for (let i = 0; i < 40; i++) step(.05);
      const kept = wings.some(w => w.team === 0 && w.alive && w.target === fortress);
      /* a carrier inside the guns: its craft take the foe inside and leave the one outside alone */
      reset(); const c2 = fleets.find(x => x.team === 0 && x.hangars.length), [a, b] = fleets.filter(x => x.team === 1);
      fleets.filter(x => x.team === 1).forEach(x => { x.alive = false; }); c2.speed = 0;
      c2.pos.set(fortress.pos.x, fortress.pos.y, fortress.pos.z + fortress.range - 4);
      [[a, c2.pos.x + 6, fortress.pos.z + fortress.range - 12], [b, c2.pos.x, c2.pos.z + 22]].forEach(([x, px, pz]) => {
        x.alive = true; x.ai = null; x.leash = 0; x.speed = 0; x.hpPool = 1e9; x.pos.set(px, c2.pos.y, pz); x.post = x.pos.clone(); });
      const inside = run(); const insideHit = inside.length > 0 && inside.every(w => w.target === a);
      fortress.team = 0; const mirrored = underGuns(c2, 1) && !underGuns(c2, 0); fortress.team = 1;
      return { fortOnly, nearFort, awayHit, retarget, ordered, kept, insideHit, mirrored };
    });
    check(!fort.fortOnly && !fort.nearFort && fort.awayHit && fort.retarget && fort.ordered && fort.kept && fort.insideHit && fort.mirrored,
      '小型機: 要塞は命令がなければ狙わず、母艦が要塞の射程の外なら外の敵、内なら内の敵を狙う。命じた相手は移動しても狙い続ける（敵も同じ）', JSON.stringify(fort));
    await page.evaluate(() => { reset(); select(null); });

    /* carriers: a fleet of carriers stops once the target is inside 80% of its shortest launch distance; a new attack order turns the craft;
       in a fleet mixing carriers with other classes the carriers keep to the rear */
    const cv = await page.evaluate(() => {
      reset(); const c = fleets.find(x => x.team === 0 && x.carrierOnly), [a, b] = fleets.filter(x => x.team === 1);
      fleets.filter(x => x.team === 1).forEach(x => { x.alive = false; });
      c.pos.set(0, 10, 200); c.hpPool = 1e9;
      [[a, -10, 100], [b, 10, 100]].forEach(([x, px, pz]) => { x.alive = true; x.ai = null; x.leash = 0; x.speed = 0; x.hpPool = 1e9; x.dmg = 0; x.pos.set(px, 10, pz); x.post = x.pos.clone(); });
      order(c, { type: 'attack', target: a }); for (let i = 0; i < 400; i++) step(.05);
      const stopAt = c.pos.distanceTo(a.pos), want = c.launchMin * .8;
      const onA = wings.some(w => w.team === 0 && w.target === a);
      order(c, { type: 'attack', target: b }); for (let i = 0; i < 6; i++) step(.05);
      const out = wings.filter(w => w.team === 0 && w.alive && w.state === 'attack'), onB = out.length > 0 && out.every(w => w.target === b);
      const m = makeFleet(0, { name: 'mix', sub: '', comp: { cl: 6, cvb: 3 }, n: 9, hp: 1, dmg: 0, range: 20, speed: 5, scale: 1, pos: [0, 150], alt: 0, vis: 5, stl: 4, hangar: { ftr: 40 } });
      const zc = m.ships.filter(s => CARRIERS.has(s.type)).map(s => s.off.z), zo = m.ships.filter(s => !CARRIERS.has(s.type)).map(s => s.off.z);
      m.el.remove();
      return { stopAt: +stopAt.toFixed(1), want: +want.toFixed(1), onA, onB, rear: Math.max(...zc) < Math.min(...zo), mixedNotCarrierOnly: !m.carrierOnly };
    });
    check(Math.abs(cv.stopAt - cv.want) < 1.5 && cv.onA && cv.onB && cv.rear && cv.mixedNotCarrierOnly,
      '空母: 発進距離の0.8倍で止まり、攻撃の相手を替えると小型機も替える。混ざった軍では空母が最後尾', JSON.stringify(cv));
    await page.evaluate(() => { reset(); select(null); });

    /* ship guns: the foe ordered to attack comes first while in range, then the nearest */
    const fire = await page.evaluate(() => {
      reset(); const f = fleets.find(x => x.team === 0 && !x.hangars.length), [a, b] = fleets.filter(x => x.team === 1);
      fleets.filter(x => x.team === 1).forEach(x => { x.alive = false; });
      f.pos.set(0, 10, 200); f.speed = 0; f.hpPool = 1e9;
      [[a, f.range * .3], [b, f.range * .7]].forEach(([x, d]) => { x.alive = true; x.ai = null; x.leash = 0; x.speed = 0; x.hpPool = 1e9; x.dmg = 0; x.pos.set(0, 10, 200 - d); x.post = x.pos.clone(); });
      for (let i = 0; i < 20; i++) step(.05); const near = f.fireTarget === a;
      order(f, { type: 'attack', target: b }); for (let i = 0; i < 20; i++) step(.05);
      return { near, ordered: f.fireTarget === b };
    });
    check(fire.near && fire.ordered, '艦砲: 攻撃を命じた敵が射程内なら優先して撃ち、なければ近い敵を撃つ', JSON.stringify(fire));
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
    /* chapter 1 section 1: the escort operation from the sortie screen */
    await page.evaluate(() => WOS.openMenu());
    await page.click('#result >> text=メニューへ').catch(() => {});
    await page.click('[data-go="sortie"]'); await page.click('[data-op="shinano"]');
    check((await page.textContent('#sgList')).includes('決まった艦隊'), 'ネオ信濃奇襲: 出撃画面で決まった艦隊を使う');
    await page.click('#goBattle'); await page.waitForTimeout(1500);
    const talk = await page.evaluate(() => ({ talking, sec: gameSec, who: document.getElementById('talkWho').textContent }));
    check(talk.talking && talk.sec === 0 && talk.who.length > 0, 'ネオ信濃奇襲: 開始前の会話の間は戦闘が止まる', talk.who);
    await page.click('#talkSkip');
    const goal = await page.evaluate(() => { fleets.filter(f => f.team === 0).forEach(f => f.hpPool = 1e9); const end = 10 / CLOCK_RATE; while (gameSec < end) step(.05); updateGoal();
      return { text: goalText.textContent, label: goalLabel.textContent, sub: goalSub.textContent }; });
    check(goal.label.startsWith('乗船 50%') && goal.text.length > 0 && goal.sub.includes('5/5'), 'ネオ信濃奇襲: 右上の任務欄に乗船のゲージと指示が出る', goal.label);
    const sh = await page.evaluate(() => { const r = { convoy: !!convoy, station: stationObj.visible, fort: fortressObj.visible };
      /* the fight itself is random; keep own ships afloat so this checks only the timed flow */
      fleets.filter(f => f.team === 0).forEach(f => f.hpPool = 1e9);
      const end = 21 / CLOCK_RATE; while (gameSec < end && !over) step(.05);
      r.departed = convoy.departed && convoy.order && convoy.order.type === 'move'; r.assault = fleets.some(f => f.team === 1 && f.hangars.length); r.phase = phaseName; return r; });
    check(sh.convoy && sh.station && !sh.fort, 'ネオ信濃奇襲: 中継ステーションと輸送船団が出る');
    const rosterNames = await page.$$eval('#roster button[id^="fl"]', e => e.map(x => x.textContent));
    const grp = await page.textContent('#grpBtn').catch(() => '');
    check(grp.includes('ネオ信濃駐屯隊'), 'ネオ信濃奇襲: 4隊が軍集団「ネオ信濃駐屯隊」にまとまる', grp);
    /* switches in the fleet list: one fleet's stance, the whole group's stance, and speed sync */
    await page.click('#roster .frow:nth-of-type(1) .st, #roster .rzone .frow .st');
    const sw1 = await page.evaluate(() => fleets.filter(f => f.team === 0 && !f.convoy).map(f => f.stance));
    await page.click('#rgStance');
    const sw2 = await page.evaluate(() => fleets.filter(f => f.team === 0 && !f.convoy).map(f => f.stance));
    const sync0 = await page.evaluate(() => armyGroup.sync); await page.click('#rgSync'); const sync1 = await page.evaluate(() => armyGroup.sync);
    check(sw1.filter(s => s === 'evade').length === 1 && sw2.every(s => s === 'evade') && sync0 !== sync1, '艦隊一覧: 交戦/回避（1隊・全軍）と速度同期を切り替えられる');
    await page.evaluate(() => { fleets.forEach(f => f.stance = 'engage'); armyGroup.sync = false; updateRoster(); });
    check(rosterNames.length === 4 && !rosterNames.some(t => t.includes('輸送')), 'ネオ信濃奇襲: 動かせない輸送船団は艦隊一覧に入らない', `${rosterNames.length}隊`);
    check(sh.departed && sh.assault && sh.phase === '出港', 'ネオ信濃奇襲: 揚陸隊が現れ、06:20 に船団が出港する', sh.phase);
    await page.waitForTimeout(500);
    await shot('09-shinano');
    const win = await page.evaluate(() => { fleets.filter(f => f.team === 1).forEach(f => { f.alive = false; f.el.remove(); }); wings = [];
      let n = 0; while (!over && n++ < 6000) step(.05); return { over, saved: convoy.escaped }; });
    await page.waitForTimeout(2200);
    const winTalk = await page.isVisible('#talk');
    await page.click('#talkSkip').catch(() => {});
    await page.waitForTimeout(300);
    check(win.over && win.saved && winTalk && await page.textContent('#rh') === '勝利', 'ネオ信濃奇襲: 船団が離脱点を越えると、会話のあと勝利');
    const lose = await page.evaluate(() => { reset(); endTalk(); const src = fleets.find(f => f.team === 1);
      damage(convoy, convoy.hp * 3.2 / (1 - (convoy.eva || 0)), src); step(.05); return { over, left: convoy.ships.length, rh: document.getElementById('rh').textContent }; });
    check(lose.over && lose.rh === '敗北', 'ネオ信濃奇襲: 輸送船を3隻失うと敗北');
  } catch (e) {
    check(false, '実行中に例外', e.message);
  }

  check(errors.length === 0, 'ページのエラーなし', errors.join(' / '));
  await browser.close();
  console.log(failed ? `\n${failed}件の確認に失敗しました。` : '\nすべての確認に通りました。');
  process.exit(failed ? 1 : 0);
})();
