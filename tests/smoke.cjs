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
    /* before 第一章 第2節 is cleared: 艦隊編集 and 技術ツリー are locked; only the first campaign operation is open */
    const lock0 = await page.evaluate(() => ({ org: document.querySelector('#mainNav [data-go="org"]').disabled, tech: document.querySelector('#mainNav [data-go="tech"]').disabled,
      text: document.querySelector('#mainNav [data-go="org"]').textContent }));
    check(lock0.org && lock0.tech && lock0.text.includes('後退'), 'メニュー: 第2節クリアまで艦隊編集と技術ツリーは鍵付き', lock0.text);
    await shot('01-title');
    await page.click('[data-go="sortie"]');
    const ops0 = await page.evaluate(() => ['shinano', 'retreat', 'charybdis'].map(id => document.querySelector(`[data-op="${id}"]`).disabled));
    check(!ops0[0] && ops0[1] && !ops0[2], '出撃: 最初は第1節と演習（クイック出撃）だけ選べる（第2節は鍵付き）', JSON.stringify(ops0));
    await page.click('[data-op="charybdis"]');
    const q0 = { quick: await page.isVisible('#goQuick'), own: await page.isDisabled('#goBattle'), note: await page.textContent('#sgList') };
    check(q0.quick && q0.own && q0.note.includes('後退'), '出撃: 演習は最初からクイック出撃でき、自分の戦区軍での出撃は第2節クリアまで鍵付き', JSON.stringify(q0));
    await page.click('[data-op="shinano"]');
    check(!(await page.isVisible('#goQuick')), '出撃: 決まった艦隊の作戦にはクイック出撃がない');
    check(await page.evaluate(() => !document.querySelector('#mainNav [data-act="quick"]') && !document.getElementById('mainNav').textContent.includes('クイック')), 'メニュー: タイトルにクイック戦闘はない');
    await page.click('[data-s="sortie"] .back');
    /* debug: unlock everything, turn on the in-battle instant win/defeat */
    await page.click('#dbgT');
    await page.check('#dbgB [data-dbg="battle"]');
    await page.click('#dbgB [data-dbga="all"]');
    await page.click('#dbgB [data-dbga="funds"]');
    const dbg1 = await page.evaluate(() => ({ org: document.querySelector('#mainNav [data-go="org"]').disabled, prog: JSON.parse(localStorage.getItem('wos.save.v1')).prog }));
    check(!dbg1.org && dbg1.prog.cleared.length === data.ops && dbg1.prog.funds === 1000 && !dbg1.prog.flags.was, 'デバッグ: 全作戦クリアと資金+1000（兵科は巡洋艦まで）', JSON.stringify(dbg1.prog));
    await shot('01b-debug');
    /* tech tree: 駆逐艦. 射撃管制 needs the gun first; 動員計画 and the gun are open from the start */
    await page.click('[data-go="tech"]');
    await page.click('#brBar [data-br="dd"]');
    const res = async id => { await page.click(`#trCv [data-node="${id}"]`); const ok = !(await page.isDisabled('#tRes')); if (ok) await page.click('#tRes'); return ok; };
    const early = await res('rng1');
    await res('cap1'); await res('gun1'); await res('rng1');
    const tech = await page.evaluate(() => ({ ...JSON.parse(localStorage.getItem('wos.save.v1')).prog, bar: document.querySelectorAll('#brBar [data-br]').length,
      next: document.querySelector('#trCv [data-node="gun2"]').classList.contains('can'), sum: document.getElementById('trSum').textContent }));
    check(!early && ['cap1', 'gun1', 'rng1'].every(id => tech.tech.dd.includes(id)) && tech.next && tech.funds === 1000 - (200 + 60 + 90) && tech.bar === 3 && !tech.sum.includes('%') && !tech.sum.includes('/'),
      '技術ツリー: 左の列から研究し、つながる元を終えると次が開く。能力は数で出る', JSON.stringify(tech));
    /* Enter researches the chosen node; the tree is dragged with the left button and zoomed with the wheel; the screen needs no vertical scroll */
    await page.click('#trCv [data-node="gun2"]'); await page.keyboard.press('Enter');
    const entered = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).prog.tech.dd.includes('gun2'));
    const tf = () => page.evaluate(() => document.getElementById('trCv').style.transform);
    const box = await page.locator('#trScroll').boundingBox(), t0 = await tf();
    await page.mouse.move(box.x + box.width - 30, box.y + box.height - 20); await page.mouse.down();
    await page.mouse.move(box.x + box.width - 110, box.y + box.height - 60, { steps: 5 }); await page.mouse.up();
    const t1 = await tf();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -400); await page.waitForTimeout(100);
    const t2 = await tf(), sc = s => +(/scale\(([\d.]+)\)/.exec(s) || [0, 0])[1];
    const fits = await page.evaluate(() => document.getElementById('menu').scrollHeight <= document.getElementById('menu').clientHeight + 1);
    check(entered && t1 !== t0 && sc(t2) > sc(t1) && fits, '技術ツリー: Enter で研究、左ドラッグで動かし、ホイールで拡大縮小。縦のスクロールは出ない', JSON.stringify({ entered, t0, t1, t2, fits }));
    await page.click('#forceTabs [data-force="ground"]');
    check(await page.isVisible('#forceSoon') && !(await page.isVisible('#techWrap')), '技術ツリー: 地上軍のタブ（準備中）');
    await page.click('#forceTabs [data-force="space"]');
    /* debug 全研究: every node of every branch, and the branches the story has not opened yet */
    await page.click('[data-s="tech"] .back'); await page.click('#dbgB [data-dbga="tech"]'); await page.click('[data-go="tech"]');
    const all = await page.evaluate(() => ({ bar: document.querySelectorAll('#brBar [data-br]').length, done: document.querySelectorAll('#trCv .tn.done').length, nodes: document.querySelectorAll('#trCv .tn').length }));
    check(all.bar === 6 && all.done === all.nodes, 'デバッグ: 全研究で全兵科が出て、すべて研究済み', JSON.stringify(all));
    await page.click('#brBar [data-br="was"]');
    const wasTree = await page.evaluate(() => ({ fighter: !!document.querySelector('#trCv [data-node="ftr1"]'), was: !!document.querySelector('#trCv [data-node="was1"]'), sum: document.getElementById('trSum').textContent }));
    await page.click('#brBar [data-br="carrier"]');
    const cvTree = await page.evaluate(() => ({ out: !!document.querySelector('#trCv [data-node="out2"]'), turn: !!document.querySelector('#trCv [data-node="turn3"]'),
      was: !!document.querySelector('#trCv [data-node="was1"]'), fighter: !!document.querySelector('#trCv [data-node="ftr1"]'), sum: document.getElementById('trSum').textContent }));
    check(cvTree.out && cvTree.turn && !cvTree.was && cvTree.sum.includes(`出撃 ${3}隊`) && cvTree.sum.includes('補給 8.0秒'),
      '技術ツリー: 母艦に出撃部隊数と補給の研究（全研究で 3隊・8秒）', JSON.stringify(cvTree));
    await page.click('#brBar [data-br="dd"]');
    const ddTree = await page.evaluate(() => !!document.querySelector('#trCv [data-node="ftr1"]'));
    check(!wasTree.fighter && wasTree.was && wasTree.sum.includes('W.A.S.') && !ddTree && cvTree.fighter, '技術ツリー: 艦載機の機体は母艦、W.A.S. の機体は W.A.S. 部隊に出る（駆逐艦には出ない）', JSON.stringify(wasTree));
    await page.evaluate(() => { document.getElementById('trScroll').scrollLeft = 0; });
    await shot('01c-tech');
    await page.click('[data-s="tech"] .back');

    /* ship data */
    await page.click('[data-go="data"]');
    check(await page.locator('#shipTbl tbody tr').count() === data.ships, '艦艇データ: 艦種の表', `${data.ships}艦種`);
    check(await page.locator('#bonusTbl tbody tr').count() === data.bonuses, '艦艇データ: 編成ボーナスの表', `${data.bonuses}種`);
    await shot('02-data');
    await page.click('[data-s="data"] .back');

    /* organization: each tab renders */
    await page.click('[data-go="org"]');
    /* ships per branch (all battle groups) against the sortie limit: the starting fleet has escorts 23, cruisers 6 */
    const orgCap = await page.evaluate(() => ({ text: document.getElementById('orgCap').textContent, cl: document.getElementById('orgCap').textContent.match(/巡洋艦 6\/(\d+)隻/) }));
    check(/護衛艦艇 23\/\d+隻/.test(orgCap.text) && !!orgCap.cl, '編成: 兵科ごとの隻数と出撃上限が出る', orgCap.text);
    for (const [tab, sel] of [['bg', '[data-bg]'], ['army', '[data-army]'], ['group', '[data-grp]']]) {
      await page.click(`[data-tab="${tab}"]`);
      check(await page.locator('#orgList ' + sel).count() > 0, `編成: ${tab} タブ`);
    }
    /* a new battle group (駆逐艦 at first) is named 第N 駆逐突撃 支隊, N from 24 on to the next free number (the starting fleet has 24);
       while its name is untouched it follows a change of class (前衛巡洋: from 9, the starting fleet has 9) */
    await page.click('[data-tab="bg"]');
    await page.click('#orgList [data-new]');
    const newName = await page.inputValue('#bgName');
    await page.click('#orgDetail [data-type="cl"]');
    const clName = await page.inputValue('#bgName');
    await page.fill('#bgName', '試験戦隊'); await page.click('#orgDetail [data-type="dd"]');
    const kept = await page.inputValue('#bgName');
    check(newName === '第25 駆逐突撃 支隊' && clName === '第10 前衛巡洋 支隊' && kept === '試験戦隊', '編成: 新しい支隊は「第N 役割 支隊」、名前を触るまでは艦種に合わせて付け直す', [newName, clName, kept].join(' / '));
    /* an army of one battle group goes by its name; with two or more it is named 第N 役割 打撃群 after its main class
       (the starting 第9 前衛巡洋 支隊 with 試験戦隊 added: 巡洋艦 6 to 駆逐艦 4, 第2 巡洋 打撃群), and goes back when one is taken out */
    await page.click('[data-tab="army"]'); await page.click('#orgList [data-army="a1"]');
    await page.selectOption('#addBg', { label: '試験戦隊（駆逐艦×4）' });
    const armyTwo = await page.inputValue('#armyName');
    await page.click('#orgDetail [data-rm]:not([data-rm="bg1"])');
    const armyOne = await page.inputValue('#armyName');
    /* a new army is 第N 打撃群 while empty; deleted again */
    await page.click('#orgList [data-new]');
    const armyNew = await page.inputValue('#armyName');
    check(armyTwo === '第2 巡洋 打撃群' && armyOne === '第9 前衛巡洋 支隊' && armyNew === '第1 打撃群', '編成: 支隊1つの打撃群は支隊の名前、2つ以上なら主力の艦種で「第N 役割 打撃群」', [armyTwo, armyOne, armyNew].join(' / '));
    /* the role comes from the highest class in the unit, whatever the numbers (user decision 2026-10-04) */
    const rank = await page.evaluate(() => [mainType({ dd: 4, cl: 1 }), mainType({ cv: 10, mas: 1 }), mainType({ dd: 6, mas: 2, ff: 3 }), mainType({ bb: 6, cvb: 1 }), mainType({ cvb: 3, masc: 1 }), mainType({ cl: 3, bb: 0 })]);
    check(rank.join() === 'cl,mas,mas,cvb,masc,cl', '名前: 役割は隻数でなく一番上位の艦種（コルベット < フリゲート < 駆逐艦 < 突撃揚陸艦 < 巡洋艦 < 戦艦 < 戦闘母艦 < 強襲母艦）', rank.join());
    await page.click('#orgDetail [data-del]'); await page.click('#orgDetail [data-del]');
    await page.click('[data-tab="group"]');
    /* choose another army as the flagship */
    await page.click('#orgDetail [data-flag="1"]');
    const flag = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).groups[0].flag);
    check(flag === 'a2' && (await page.textContent('#orgDetail [data-flag="1"]')).includes('旗艦'), '編成: 戦区軍の旗艦を選べる', flag);
    await page.click('#orgDetail [data-flag="0"]');
    await shot('03-org-group');
    /* a second army group holding an army of the first: the two cannot sortie together */
    await page.click('#orgList [data-new]'); await page.selectOption('#addArmy', 'a1');
    const grpName = await page.inputValue('#grpName');
    check(grpName === '第1 軌道制圧 戦区軍', '編成: 新しい戦区軍は主力の艦種で「第N 役割 戦区軍」になる', grpName);
    await page.click('[data-s="org"] .back');

    /* sortie with the first army group */
    await page.click('[data-go="sortie"]');
    check(await page.locator('#opList [data-op]').count() === data.ops, '出撃: 作戦の一覧', `${data.ops}作戦`);
    await page.click('[data-op="charybdis"]');
    check(await page.locator('#sgLoad tr').count() > 0 && !(await page.isDisabled('#goBattle')), '出撃: 兵科ごとの出撃上限が出て、上限内なら出撃できる');
    const clash = await page.evaluate(() => [...document.querySelectorAll('#sgList [data-sg]')].map(b => ({ on: b.getAttribute('aria-pressed'), off: b.disabled, note: b.textContent.includes('同一支隊を含みます') })));
    check(clash.length === 2 && clash[0].on === 'true' && clash[1].off && clash[1].note, '出撃: 同じ打撃群を含む戦区軍は一緒に選べず、暗くなって「同一支隊を含みます」と出る', JSON.stringify(clash));
    await shot('04-sortie');
    await page.keyboard.press('Enter');   // Enter decides the sortie (same as the 出撃 button)
    await page.waitForTimeout(1500);
    /* the deploy step: the clock waits; an army group can be put anywhere inside the zone, then 作戦開始 */
    const dep = await page.evaluate(() => {
      const r = { deploying, zone: deployZone.visible, panel: !document.getElementById('deploy').hidden, t0: gameSec };
      const g = groups[0], fl = groupFlag(g), m = groupAlive(g), rel0 = m.map(f => f.pos.clone().sub(fl.pos));
      selectGroup(g); const Z = zoneOf(); placeAt(new THREE.Vector3(Z.c.x + 500, 0, Z.c.z));
      r.inside = Math.hypot(fl.pos.x - Z.c.x, fl.pos.z - Z.c.z) <= Z.r - 3.9;
      r.kept = m.every((f, i) => f.pos.clone().sub(fl.pos).distanceTo(rel0[i]) < .01);
      /* two army groups at once (the battle side of a sortie with several) */
      const c = lastCfg; reset({ ...c, group: null, groups: [{ name: 'A', sync: true, members: [0, 1], flag: 0 }, { name: 'B', sync: true, members: [2, 3, 4], flag: 2 }] });
      r.groups = groups.length; r.buttons = document.querySelectorAll('#roster .grpBtn').length; reset(c); startDeploy(); select(null);
      return r; });
    check(dep.deploying && dep.zone && dep.panel && dep.t0 === 0, '配置: 戦区軍で出撃すると、始まる前に配置の段階になる（時間は止まっている）', JSON.stringify(dep));
    check(dep.inside && dep.kept, '配置: 選んだ戦区軍を範囲の中へ置ける（範囲の外を押しても中に収まり、軍の並びは崩れない）', JSON.stringify(dep));
    check(dep.groups === 2 && dep.buttons === 2, '出撃: 戦区軍を複数まとめて出撃できる', JSON.stringify(dep));
    await page.click('#deployGo');
    check(!(await page.evaluate(() => deploying)) && await page.isHidden('#deploy'), '配置: 「作戦開始」で時間が動き出す');
    const opName = await page.evaluate(() => op.name);
    check(await page.textContent('#bh') === opName, '出撃: 作戦概要', opName);
    check(await page.locator('#roster .grpBtn').count() === 1, '出撃: 戦区軍の全軍ボタン');
    /* the formation is laid out around the flagship: at deploy and after a group move; with 陣形OFF everyone goes to the point */
    const fm = await page.evaluate(() => {
      const g = groups[0], fl = groupFlag(g), rel = f => f.pos.clone().sub(fl.pos), want = f => formationOffset(g, f), off0 = !g.form;
      toggleForm(g);   // formation starts off; turn it on
      const near = (a, b) => a.distanceTo(b) < .01, others = groupAlive(g).filter(f => f !== fl);
      const deploy = others.every(f => near(rel(f), want(f))) && Math.abs(fl.pos.z - op.deploy[1]) < .01;
      selectGroup(g); const D = fl.pos.clone().add(new THREE.Vector3(10, 0, -30)), dir = D.clone().sub(fl.pos); groupOrder({ type: 'move', dest: D });
      /* every army heads straight for its own place around the point (none chases the flagship), turned to face the way they go */
      const move = near(fl.order.dest, D) && others.every(f => f.order.type === 'move' && near(f.order.dest, D.clone().add(turnTo(want(f), dir))));
      toggleForm(g); groupOrder({ type: 'move', dest: D }); const point = groupAlive(g).every(f => near(f.order.dest, D)); toggleForm(g);
      select(null); return { deploy, move, point, off0, flag: fl.name, roster: fl.btn.textContent };
    });
    check(fm.deploy && fm.move && fm.roster.startsWith('★'), '戦区軍: 陣形ONでは各軍が目的地の持ち場へ直接向かう（旗艦を追わない）', fm.flag);
    check(fm.point && fm.off0, '戦区軍: 陣形は最初OFF。OFF では全軍が指示した一点に集まる');
    /* formation shapes: choosing 縦陣 regroups at once; 出撃時の陣形 is offered too.
       Moving east, the formation turns so that east is ahead: the column lies along the east-west line */
    const fs2 = await page.evaluate(() => {
      const g = groups[0], fl = groupFlag(g), others = groupAlive(g).filter(f => f !== fl), sel = g.ui.gk;
      fleets.forEach(f => { if (f.team === 0) f.hpPool = 1e9; });
      const opts = [...sel.options].map(o => o.textContent);
      sel.value = 'column'; sel.dispatchEvent(new Event('change'));
      const set = !fl.order && others.every(f => f.order.type === 'move' && f.order.dest.distanceTo(fl.pos.clone().add(turnTo(formationOffset(g, f), fl.march))) < .01);
      const t0 = gameSec, ne = nextEvent; nextEvent = opEvents.length;   // hold the timed events while this runs
      select(null); selectGroup(g); const D = fl.pos.clone().add(new THREE.Vector3(90, 0, 0)); groupOrder({ type: 'move', dest: D });
      for (let i = 0; i < 1600; i++) step(.05);
      const east = new THREE.Vector3(1, 0, 0);
      const shape = others.every(f => f.pos.distanceTo(D.clone().add(turnTo(formationOffset(g, f), east))) < 3 && Math.abs(f.pos.z - fl.pos.z) < 3);
      /* attacking in formation: every army closes on the target itself, so the whole column gets it in range */
      const e = fleets.find(f => f.team === 1 && f.alive && !f.convoy); e.seen = true; e.hpPool = 1e9; e.speed = 0; e.ai = null; e.revealT = 1e9;
      select(null); selectGroup(g); groupOrder({ type: 'attack', target: e });
      for (let i = 0; i < 1500; i++) { step(.05); e.seen = true; }
      const gaps = groupAlive(g).map(f => [f.name, Math.round(gap(f, e)), f.range, f.order && f.order.type]);
      const reach = groupAlive(g).every(f => gap(f, e) <= f.range * 1.08);
      e.alive = false; e.el.remove(); step(.05);
      gameSec = t0; nextEvent = ne;
      setShape(g, 'base'); select(null); return { opts: opts.join('/'), set, shape, reach, gaps: JSON.stringify(gaps) };
    });
    check(fs2.reach, '戦区軍: 縦陣のまま攻撃しても全軍の射程が届く', fs2.reach ? '' : fs2.gaps);
    check(fs2.set && fs2.opts.startsWith('出撃時の陣形') && fs2.opts.includes('輪形陣'), '戦区軍: 陣形を選ぶとすぐ組み直す（出撃時＋3種）', fs2.opts);
    check(fs2.shape, '戦区軍: 陣形のまま動くと進む向きが正面になり、着いたとき形がそろう');
    /* Shift+click picks several fleets; ＋ forms a new army group from them, the first one picked as flagship; 解散 lets them go */
    const ng = await page.evaluate(() => {
      const g0 = groups[0], [a, b] = groupAlive(g0); select(a); toggleMulti(b);
      const multi = orderTargets().length === 2; document.getElementById('newGrp').click();
      const g = groups[groups.length - 1], made = groups.length === 2 && g.members.size === 2 && groupFlag(g) === a && selGroup === g && !g0.members.has(a);
      const names = [...document.querySelectorAll('#roster .grpBtn')].map(x => x.textContent);
      const named = /^第\d+ \S+ 戦区軍$/.test(g.name) && g.name !== g0.name;
      disband(g); const gone = groups.length === 1 && !groupOf(a);
      return { multi, made, gone, named, names: names.join('/') };
    });
    check(ng.multi && ng.made && ng.gone && ng.named, '戦区軍: Shift でまとめて選び、＋で新しい戦区軍（第N 役割 戦区軍）を作り、解散できる', ng.names);
    const before = await page.evaluate(() => fleets.length);
    await advance(90);
    const after = await page.evaluate(() => ({ n: fleets.length, reinf: (op.reinforcements || []).filter(r => r.after <= 90 * CLOCK_RATE).length }));
    check(after.n === before + after.reinf, '出撃: 増援が時刻どおり現れる', `${after.reinf}隊`);
    await page.waitForTimeout(500);
    await shot('05-sortie-battle');

    /* quick battle: クイック出撃 on the sortie screen (the exercise with its prepared fleets) */
    await page.evaluate(() => WOS.openMenu());
    await page.click('[data-go="sortie"]'); await page.click('[data-op="charybdis"]'); await page.click('#goQuick');
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
    /* formation shapes put the light ships ahead and around, the heavy ones at the rear and the centre (flagship included) */
    const cls = await page.evaluate(() => {
      const by = n => fleets.find(f => f.team === 0 && f.name === n), cv = by('第3 突撃艇 打撃群'), cl = by('第2 巡洋 打撃群'), cvb = by('第4 空母航空 打撃群');
      select(cl); toggleMulti(cv); toggleMulti(cvb); newGroup(); const g = groups[groups.length - 1];
      const col = shapeSlots('column', [cl, cv, cvb]), ring = shapeSlots('ring', [cl, cv, cvb]), line = shapeSlots('line', [cl, cv, cvb]);
      const r = { column: col.get(cv).z < col.get(cl).z && col.get(cl).z < col.get(cvb).z,
        ring: Math.hypot(ring.get(cvb).x, ring.get(cvb).z) < FORM_GAP * .5 && ring.get(cv).z < ring.get(cl).z,
        line: line.get(cvb).x === 0 && line.get(cl).x !== 0 && line.get(cv).x !== 0, form0: !g.form };
      disband(g); select(null); return r; });
    check(cls.column && cls.ring && cls.line && cls.form0, '陣形: 軽い艦は前と周り、空母や重い艦は後ろと中央。新しい戦区軍は陣形OFF', JSON.stringify(cls));
    /* altitude: ▲▼ go to the next step of 15 from 0, the bar and Q/E are free; the date moves on past midnight */
    const alt = await page.evaluate(() => { const f = fleets.find(x => x.team === 0); select(f); const r = [];
      setAlt(8, false); r.push(selAlt); document.getElementById('altUp').click(); r.push(selAlt); document.getElementById('altUp').click(); r.push(selAlt);
      setAlt(-22, false); document.getElementById('altDn').click(); r.push(selAlt); setAlt(-22, false); document.getElementById('altUp').click(); r.push(selAlt);
      setAlt(0, false); dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); r.push(selAlt); select(null);
      const g = gameSec; gameSec = 24 * 60 / CLOCK_RATE; const d = dateStr(); gameSec = g; return { r: r.join(','), d, d0: op.date }; });
    check(alt.r === '8,15,30,-30,-15,5' && alt.d !== alt.d0, '高度: ▲▼は0から15ずつの段へ、バーとQ/Eは自由。日をまたぐと日付が進む', `${alt.r} / ${alt.d}`);
    /* the turn stick at the bottom: held to the right the view keeps turning, let go it springs back to the middle */
    const az0 = await page.evaluate(() => getAngles().az);
    const tb = await page.locator('#azTrack').boundingBox();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.mouse.down();
    await page.mouse.move(tb.x + tb.width - 4, tb.y + tb.height / 2); await page.waitForTimeout(500);
    const az1 = await page.evaluate(() => getAngles().az); await page.mouse.up(); await page.waitForTimeout(300);
    const back = await page.evaluate(() => stick.az === 0);
    check(Math.abs(az1 - az0) > 20 && back, '視点: 下の横回転スティックを倒すと回り続け、離すと戻る', `${Math.round(az1 - az0)}°`);

    /* queued waypoints: the fleet passes the first point and stops at the last (southward, away from the fortress and its fighters) */
    const route = await page.evaluate(() => {
      const f = fleets.find(x => x.team === 0); select(f);
      const A = f.pos.clone().add(new THREE.Vector3(30, 0, 40)), B = f.pos.clone().add(new THREE.Vector3(-10, 0, 80));
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

    /* attack policy: 命令優先 (evade) holds fire, 自動交戦 (engage) fires */
    const stance = await page.evaluate(() => ['evade', 'engage'].map(st => {
      reset(); const f = fleets.find(x => x.team === 0), e = fleets.find(x => x.team === 1);
      select(f); setStance(st); f.pos.set(e.pos.x, e.pos.y, e.pos.z + Math.min(12, f.range * .8));
      let fired = 0; for (let i = 0; i < 40; i++) { step(.05); if (f.revealT > 0) fired++; } return fired;
    }));
    check(stance[0] === 0 && stance[1] > 0, '自動交戦/命令優先: 命令優先では撃たず、自動交戦では撃つ');
    await page.evaluate(() => { reset(); select(null); });

    /* small craft and a hostile fortress (both sides): never the fortress on their own; they keep to their carrier's side of its guns.
       The target their carrier was ordered to attack overrides this and holds through later moves */
    const fort = await page.evaluate(() => {
      reset(); const c = fleets.find(x => x.team === 0 && x.hangars.length), foes = fleets.filter(x => x.team === 1), e = foes[0];
      fortress.hangars = []; foes.forEach(x => { x.alive = false; }); c.speed = 0; c.pos.set(fortress.pos.x, fortress.pos.y, fortress.pos.z + fortress.range + FORT_MARGIN + 3);
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
      fortress.hangars = []; fleets.filter(x => x.team === 1).forEach(x => { x.alive = false; }); c2.speed = 0;
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

    /* fighters and W.A.S. both slow the fleet they attack to 40% speed; a fleet of carriers holds its ground (it no longer backs away, user decision 2026-10-04) */
    const duel = await page.evaluate(() => {
      const run = type => {
        reset(); fortress.alive = false; fleets.forEach(f => { f.alive = false; });
        const c = makeFleet(0, { name: '母艦', sub: '', type: 'cvb', n: 3, hp: 70, dmg: 1.6, range: 14, speed: 5, scale: 1.6, pos: [0, 150], alt: 0, vis: 7, stl: 3, hangar: { [type]: 120 } });
        const e = makeFleet(1, { name: '巡洋艦隊', sub: '', type: 'cl', n: 10, hp: 999, dmg: 0, range: 22, speed: 5.5, scale: 1.5, pos: [0, 95], alt: 0, vis: 6, stl: 4, ai: 'hunt', leash: 200 });
        fleets.push(c, e); c.hpPool = e.hpPool = 1e9;
        order(c, { type: 'attack', target: e }); const p0 = c.pos.clone(); let slowed = 0;
        for (let i = 0; i < 600; i++) { step(.05); if (e.slowT > 0) slowed = Math.max(slowed, 1 - speedOf(e) / e.speed); }
        const r = { slowBy: +slowed.toFixed(2), back: +(c.pos.z - p0.z).toFixed(1) };
        c.el.remove(); e.el.remove(); return r;
      };
      return { ftr: run('ftr'), was: run('was') };
    });
    check(Math.abs(duel.ftr.slowBy - .6) < .01 && Math.abs(duel.was.slowBy - .6) < .01 && duel.ftr.back < .5 && duel.was.back < .5,
      '空母: 艦載機と W.A.S. に撃たれた艦隊は速度が4割に落ち、空母だけの軍は下がらない', JSON.stringify(duel));
    await page.evaluate(() => { reset(); select(null); });

    /* the fortress: its fighters come out to meet us; the guard fleet sorties below 75% armour, all the air-defence fleets at once below 50% (user decision 2026-10-04) */
    const fd = await page.evaluate(() => {
      reset(); const c = fleets.find(x => x.team === 0 && x.hangars.length); fleets.filter(x => x.team === 0 && x !== c).forEach(x => { x.alive = false; });
      c.speed = 0; c.stance = 'evade'; c.pos.set(0, 0, 150);
      for (let i = 0; i < 20; i++) step(.05); const far = wings.filter(w => w.team === 1).length;
      c.pos.set(0, 0, fortress.radius + 50); for (let i = 0; i < 40; i++) step(.05);
      const near = wings.filter(w => w.team === 1 && w.carrier === fortress).length, ownOut = wings.filter(w => w.team === 0).length;
      const guard = fleets.find(f => f.name === '第5 要塞近衛 エスカドラ'), ad = fleets.filter(f => f.name.includes('防空'));
      fortress.hpPool = fortress.max * .74; step(.05); const g75 = guard.ai, ad75 = ad.filter(f => f.ai === 'hunt').length;
      fortress.hpPool = fortress.max * .49; step(.05); const ad49 = ad.filter(f => f.ai === 'hunt').length;
      for (let i = 0; i < 420; i++) step(.05); const ad70 = ad.filter(f => f.ai === 'hunt').length;
      return { far, near, ownOut, g75, ad75, ad49, ad70 };
    });
    check(fd.far === 0 && fd.near > 0 && fd.ownOut === 0 && fd.g75 === 'hunt' && fd.ad75 === 0 && fd.ad49 === 4 && fd.ad70 === 4,
      '要塞: 艦載機が迎撃に出て、装甲75%で近衛艦隊、50%で防空隊が全隊一斉に迎撃に出る。命令優先の母艦は命令なしに発進しない', JSON.stringify(fd));
    await page.evaluate(() => { reset(); select(null); });

    /* craft against craft: our fighters turn on the enemy's craft before its ships */
    const air = await page.evaluate(() => {
      reset(); fortress.alive = false; fleets.forEach(f => { f.alive = false; });
      const c = makeFleet(0, { name: '母艦', sub: '', type: 'cvb', n: 3, hp: 70, dmg: 0, range: 14, speed: 0, scale: 1.6, pos: [0, 150], alt: 0, vis: 7, stl: 3, hangar: { ftr: 120 } });
      const e = makeFleet(1, { name: '敵母艦', sub: '', type: 'cvb', n: 3, hp: 999, dmg: 0, range: 14, speed: 0, scale: 1.6, pos: [0, 105], alt: 0, vis: 7, stl: 3, hangar: { ftr: 120 } });
      fleets.push(c, e); for (let i = 0; i < 60; i++) step(.05);
      const ours = wings.filter(w => w.team === 0 && w.alive), theirs = wings.filter(w => w.team === 1 && w.alive);
      const r = { ours: ours.length, theirs: theirs.length, oursOnCraft: ours.filter(w => w.target && w.target.kind === 'wing').length };
      c.el.remove(); e.el.remove(); return r;
    });
    check(air.ours > 0 && air.theirs > 0 && air.oursOnCraft === air.ours, '空中戦: 小型機は敵の小型機を艦より先に狙う', JSON.stringify(air));
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

    /* in-battle menu: Esc opens it and stops the battle, Esc closes it; the controls list; やり直す and やめる */
    await page.evaluate(() => { select(null); setSpeed(2); });
    await page.keyboard.press('Escape');
    const pm = await page.evaluate(() => ({ open: !document.getElementById('pause').hidden, speed, t: gameSec }));
    await page.waitForTimeout(400);
    const pmStill = await page.evaluate(() => gameSec);
    await page.click('#pause [data-pm="keys"]');
    const keysShown = await page.isVisible('#keys');
    await shot('07b-pause-menu');
    await page.keyboard.press('Escape');
    const pmClosed = await page.evaluate(() => ({ closed: document.getElementById('pause').hidden, speed }));
    check(pm.open && pm.speed === 0 && pmStill === pm.t && keysShown && pmClosed.closed && pmClosed.speed === 2,
      'メニュー: Esc で開くと戦闘が止まり、操作の一覧が出て、Esc で閉じると元の速さに戻る', JSON.stringify({ pm, pmStill, keysShown, pmClosed }));

    /* undo: 戻す takes back the last order, one at a time */
    const un = await page.evaluate(() => {
      reset(); const f = fleets.find(x => x.team === 0); select(f);
      const before = !!f.order, dis0 = document.getElementById('undoBtn').disabled;
      const A = f.pos.clone().add(new THREE.Vector3(30, 0, 0)), B = f.pos.clone().add(new THREE.Vector3(0, 0, -30));
      groupOrder({ type: 'move', dest: A }); step(.05); groupOrder({ type: 'move', dest: B }); step(.05);
      const e = fleets.find(x => x.team === 1); groupOrder({ type: 'attack', target: e });
      undo(); const backToB = f.order && f.order.type === 'move' && f.order.dest.distanceTo(B) < .5;
      undo(); const backToA = f.order && f.order.type === 'move' && f.order.dest.distanceTo(A) < .5;
      undo(); const backToNone = !f.order === !before;
      return { dis0, backToB, backToA, backToNone, dis1: document.getElementById('undoBtn').disabled };
    });
    check(un.dis0 && un.backToB && un.backToA && un.backToNone && un.dis1, '戻す: 一つ前の指示を順に取り消せる', JSON.stringify(un));

    /* やり直す starts over; やめる ends the battle as a defeat */
    await page.evaluate(() => { for (let i = 0; i < 100; i++) step(.05); });
    await page.click('#pmBtn'); await page.click('#pause [data-pm="retry"]');
    const retry = await page.evaluate(() => ({ t: gameSec, closed: document.getElementById('pause').hidden, speed }));
    await page.evaluate(() => { if (talking) endTalk(); });
    await page.click('#pmBtn'); await page.click('#pause [data-pm="quit"]');
    await page.waitForTimeout(300);
    const quit = { result: await page.isVisible('#result'), rh: await page.textContent('#rh'), rp: await page.textContent('#rp') };
    check(retry.t < 1 && retry.closed && retry.speed === 1 && quit.result && quit.rh === '敗北' && quit.rp.includes('中止'),
      'メニュー: やり直すで最初から、やめるで敗北', JSON.stringify({ retry, quit }));
    await page.click('#again'); await page.evaluate(() => { if (talking) endTalk(); });
    /* debug: 勝利にする in the in-battle menu */
    await page.click('#pmBtn'); await page.click('#pause [data-pm="dwin"]');
    const dwin = await page.evaluate(() => ({ over, outcome, rh: document.getElementById('rh').textContent }));
    check(dwin.over && dwin.outcome && dwin.rh === '勝利', 'デバッグ: 戦闘中のメニューで即勝利', JSON.stringify(dwin));
    await page.waitForTimeout(1800); await page.click('#talkSkip').catch(() => {});
    await page.click('#again'); await page.evaluate(() => { if (talking) endTalk(); });

    /* the fortress falls: its guard runs north for the exit, the other enemy fleets come at us. Sinking the guard is a complete victory,
       letting it go a plain one (user decision 2026-10-04) */
    const chs = await page.evaluate(() => {
      const src = fleets.find(x => x.team === 0 && x.alive), g = fleets.find(f => f.name === op.chase.fleet);
      damage(fortress, fortress.hpPool + 1, src); const d0 = g.pos.distanceTo(chase.exit);
      for (let i = 0; i < 40; i++) step(.05);
      const others = fleets.filter(f => f.team === 1 && f.alive && f !== g);
      return { over, phase: phaseName, ai: g.ai, closer: g.pos.distanceTo(chase.exit) < d0 - 1, cover: others.length > 0 && others.every(f => f.ai === 'hunt' && f.cover), goal: document.getElementById('goalText').textContent };
    });
    check(!chs.over && chs.phase === '追撃' && chs.ai === 'escape' && chs.closer && chs.cover, '要塞戦: 要塞を落とすと近衛艦隊が北へ撤退し、ほかの敵艦隊は攻めてくる', JSON.stringify(chs));
    await shot('08-chase');
    await page.evaluate(() => { const g = chase.fleet; damage(g, g.hpPool + 1, fleets.find(x => x.team === 0 && x.alive)); step(.05); });
    await page.waitForTimeout(2000);
    check(await page.isVisible('#result') && await page.textContent('#rh') === '完全勝利', '要塞戦: 撤退する近衛艦隊を沈めると完全勝利');
    await shot('08-victory');
    await page.click('#again'); await page.evaluate(() => { if (talking) endTalk(); });
    const esc = await page.evaluate(() => {
      damage(fortress, fortress.hpPool + 1, fleets.find(x => x.team === 0 && x.alive));
      const g = chase.fleet; g.pos.copy(chase.exit).add(new THREE.Vector3(0, 0, 12)); for (let i = 0; i < 20 && !over; i++) step(.05);
      return { over, outcome, perfect, rh: document.getElementById('rh').textContent, rp: document.getElementById('rp').textContent };
    });
    check(esc.over && esc.outcome && !esc.perfect && esc.rh === '勝利' && esc.rp.includes('逃れた'), '要塞戦: 近衛艦隊に逃げられると普通の勝利', JSON.stringify(esc));
    await page.waitForTimeout(1800); await page.click('#talkSkip').catch(() => {});
    /* chapter 1 section 1: the escort operation from the sortie screen */
    await page.evaluate(() => WOS.openMenu());
    await page.click('#result >> text=メニューへ').catch(() => {});
    /* debug: back to the start of the campaign (press twice); with 自由に選ぶ the sortie limits are ignored */
    await page.click('#dbgB [data-dbga="reset"]'); await page.click('#dbgB [data-dbga="reset"]');
    await page.check('#dbgB [data-dbg="free"]');
    /* the starting fleet fits the limits, so push a battle group of escorts over its branch's limit */
    const setBgCount = async v => { await page.click('[data-go="org"]'); await page.click('[data-tab="bg"]'); await page.click('#orgList [data-bg="bg2"]');
      const n = await page.evaluate(v => { const r = document.getElementById('bgCount'), n = +r.value; r.value = v === 'max' ? r.max : v; r.dispatchEvent(new Event('input')); return n; }, v);
      await page.click('[data-s="org"] .back'); return n; };
    const bgN = await setBgCount('max');
    await page.click('[data-go="sortie"]'); await page.click('[data-op="charybdis"]');
    const over = { rows: await page.locator('#sgLoad tr.over').count(), warn: await page.textContent('#sgLoad').catch(() => ''), go: !(await page.isDisabled('#goBattle')) };
    check(over.rows > 0 && over.warn.includes('デバッグ') && over.go, 'デバッグ: 自由に選ぶと、出撃上限を超えても出撃できる', JSON.stringify(over));
    /* a campaign operation fought with the player's army groups (ナイル防衛線) has no クイック出撃: only the exercise does (user decision 2026-10-05) */
    await page.click('[data-op="nile"]');
    const nileQ = { quick: await page.isVisible('#goQuick'), go: await page.isVisible('#goBattle'), hasQuick: await page.evaluate(() => !!WOS_DATA.operations.find(o => o.id === 'nile').quick) };
    check(!nileQ.quick && nileQ.go && nileQ.hasQuick, '出撃: キャンペーンの作戦（ナイル防衛線）にはクイック出撃がない', JSON.stringify(nileQ));
    await page.click('[data-s="sortie"] .back');
    await setBgCount(bgN);
    await page.uncheck('#dbgB [data-dbg="free"]');
    const reset0 = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wos.save.v1'));
      return { prog: s.prog, org: document.querySelector('#mainNav [data-go="org"]').disabled, bgs: s.bgs.map(b => b.name + b.count).join(','), groups: s.groups.map(g => g.name).join(',') }; });
    check(reset0.prog.cleared.length === 0 && reset0.prog.funds === 0 && reset0.org, 'デバッグ: 進行を最初に戻す', JSON.stringify(reset0.prog));
    /* the fleets go back too: the battle group and the army group made earlier in this test are gone */
    check(reset0.bgs === '第9 前衛巡洋 支隊6,第12 沿岸哨戒 支隊9,第18 護送護衛 支隊8,第24 駆逐突撃 支隊6,第19 護送護衛 支隊6' && reset0.groups === '第2 ネオ信濃駐屯 戦区軍', 'デバッグ: 進行を最初に戻すと、艦隊も最初の状態に戻る', JSON.stringify(reset0));
    /* debug: 全兵科解放 opens every branch without researching anything */
    await page.click('#dbgB [data-dbga="branches"]');
    const br = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).prog);
    check(br.flags.bb && br.flags.carrier && br.flags.was && Object.values(br.tech).every(t => !t.length), 'デバッグ: 全兵科解放で、研究はせずに全兵科が開く', JSON.stringify(br));
    /* debug: 一節だけクリア counts the next section as won (reward and aid included); then back to the start again */
    await page.click('#dbgB [data-dbga="one"]');
    const one1 = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).prog);
    await page.click('#dbgB [data-dbga="one"]');
    const one2 = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).prog);
    check(one1.cleared.join() === 'shinano' && one1.funds === 300 && one2.cleared.join() === 'shinano,retreat' && one2.funds === 1700 && one2.flags['aid:retreat'],
      'デバッグ: 一節だけクリアで次の節が報酬つきでクリアになる', JSON.stringify([one1, one2]));
    await page.click('#dbgB [data-dbga="reset"]'); await page.click('#dbgB [data-dbga="reset"]');
    await page.click('[data-go="sortie"]'); await page.click('[data-op="shinano"]');
    check((await page.textContent('#sgList')).includes('決まった艦隊'), 'ネオ信濃奇襲: 出撃画面で決まった艦隊を使う');
    await page.click('#goBattle'); await page.waitForTimeout(1500);
    const talk = await page.evaluate(() => ({ talking, sec: gameSec, who: document.getElementById('talkWho').textContent }));
    check(talk.talking && talk.sec === 0 && talk.who.length > 0, 'ネオ信濃奇襲: 開始前の会話の間は戦闘が止まる', talk.who);
    await page.click('#talkSkip');
    const goal = await page.evaluate(() => { fleets.filter(f => f.team === 0).forEach(f => f.hpPool = 1e9); const end = op.convoy.depart * .5 / CLOCK_RATE; while (gameSec < end) step(.05); updateGoal();
      return { text: goalText.textContent, label: goalLabel.textContent, sub: goalSub.textContent }; });
    check(goal.label.startsWith('乗船 50%') && goal.text.length > 0 && goal.sub.includes('5/5'), 'ネオ信濃奇襲: 左上の任務欄に乗船のゲージと指示が出る', goal.label);
    const sh = await page.evaluate(() => { const r = { convoy: !!convoy, station: stationObj.visible, fort: fortressObj.visible };
      /* the fight itself is random; keep own ships afloat so this checks only the timed flow */
      fleets.filter(f => f.team === 0).forEach(f => f.hpPool = 1e9);
      const end = (op.convoy.depart + 10) / CLOCK_RATE; while (gameSec < end && !over) step(.05);
      r.departed = convoy.departed && convoy.order && convoy.order.type === 'move'; r.assault = fleets.some(f => f.team === 1 && f.hangars.length); r.phase = phaseName; return r; });
    check(sh.convoy && sh.station && !sh.fort, 'ネオ信濃奇襲: 中継ステーションと輸送船団が出る');
    const rosterNames = await page.$$eval('#roster button[id^="fl"]', e => e.map(x => x.textContent));
    const grp = await page.textContent('#roster .grpBtn').catch(() => '');
    check(grp.includes('第2 ネオ信濃駐屯 戦区軍'), 'ネオ信濃奇襲: 4隊が戦区軍「第2 ネオ信濃駐屯 戦区軍」にまとまる', grp);
    /* switches in the fleet list: one fleet's stance, the whole group's stance, and speed sync */
    await page.click('#roster .frow:nth-of-type(1) .st, #roster .rzone .frow .st');
    const sw1 = await page.evaluate(() => fleets.filter(f => f.team === 0 && !f.convoy).map(f => f.stance));
    await page.click('#roster .rgStance');
    const sw2 = await page.evaluate(() => fleets.filter(f => f.team === 0 && !f.convoy).map(f => f.stance));
    const sync0 = await page.evaluate(() => groups[0].sync); await page.click('#roster .rgSync'); const sync1 = await page.evaluate(() => groups[0].sync);
    check(sw1.filter(s => s === 'evade').length === 1 && sw2.every(s => s === 'evade') && sync0 !== sync1, '艦隊一覧: 自動交戦/命令優先（1隊・全軍）と速度同期を切り替えられる');
    await page.evaluate(() => { fleets.forEach(f => f.stance = 'engage'); groups[0].sync = false; updateRoster(); });
    check(rosterNames.length === 4 && !rosterNames.some(t => t.includes('輸送')), 'ネオ信濃奇襲: 動かせない輸送船団は艦隊一覧に入らない', `${rosterNames.length}隊`);
    check(sh.departed && sh.assault && sh.phase === '出港', 'ネオ信濃奇襲: 揚陸隊が現れ、16:00 に船団が出港する', sh.phase);
    await page.waitForTimeout(500);
    await shot('09-shinano');
    const win = await page.evaluate(() => { fleets.filter(f => f.team === 1).forEach(f => { f.alive = false; f.el.remove(); }); wings = [];
      let n = 0; while (!over && n++ < 6000) step(.05); return { over, saved: convoy.escaped }; });
    await page.waitForTimeout(2200);
    const winTalk = await page.isVisible('#talk');
    await page.click('#talkSkip').catch(() => {});
    await page.waitForTimeout(300);
    check(win.over && win.saved && winTalk && await page.textContent('#rh') === '勝利', 'ネオ信濃奇襲: 船団が離脱点を越えると、会話のあと勝利');
    const rw1 = await page.textContent('#rp');
    check(rw1.includes('資金 +300'), 'ネオ信濃奇襲: 勝つと報酬の資金が入る', rw1);
    const lose = await page.evaluate(() => { reset(); endTalk(); const src = fleets.find(f => f.team === 1);
      damage(convoy, convoy.hp * 3.2 / (1 - (convoy.eva || 0)), src); step(.05); return { over, left: convoy.ships.length, rh: document.getElementById('rh').textContent }; });
    check(lose.over && lose.rh === '敗北', 'ネオ信濃奇襲: 輸送船を3隻失うと敗北');

    /* chapter 1 section 2: the field moves with the convoy, plasma clouds hide, scouts bring the main force, a distress call */
    await page.evaluate(() => WOS.openMenu());
    await page.click('[data-go="sortie"]'); await page.click('[data-op="retreat"]');
    await page.click('#goBattle'); await page.waitForTimeout(1200); await page.evaluate(() => { if (talking) endTalk(); });
    const rmv = await page.evaluate(() => { fleets.filter(f => f.team === 0).forEach(f => f.hpPool = 1e9); const c0 = controls.target.clone();
      while (gameSec < 20 && !over) step(.05);
      return { id: op.id, departed: convoy.departed, moved: fieldC.length(), onConvoy: Math.hypot(fieldC.x - convoy.pos.x, fieldC.z - convoy.pos.z), cam: controls.target.distanceTo(c0),
        clouds: clouds.length, inField: fleets.filter(f => f.team === 0 && !f.ward && f.alive).every(f => Math.hypot(f.pos.x - fieldC.x, f.pos.z - fieldC.z) <= FIELD_R + .01) }; });
    check(rmv.id === 'retreat' && rmv.departed && rmv.moved > 50 && rmv.onConvoy < .01 && Math.abs(rmv.cam - rmv.moved) < 2 && rmv.inField,
      '後退: 作戦フィールドの中心が船団と一緒に動き、視点も付いていく。自軍は枠の外へ出ない', JSON.stringify(rmv));
    const rcl = await page.evaluate(() => { const c = clouds[1], us = fleets.find(f => f.name === '第12 沿岸哨戒 支隊'), sc = fleets.find(f => f.ai === 'scout' && f.alive);
      const R = sightOf(sc) * concealOf(us), off = new THREE.Vector3(R * .75, 0, 0); sc.blindT = 0;
      us.pos.copy(c.c); sc.pos.copy(c.c).add(off); us.inCloud = inCloud(us); sc.inCloud = inCloud(sc); const hidden = !canSee(sc, us);
      us.pos.set(c.c.x, 300, c.c.z); sc.pos.copy(us.pos).add(off); us.inCloud = inCloud(us); sc.inCloud = inCloud(sc); const open = canSee(sc, us);
      return { hidden, open, fast: speedOf({ speed: 10, inCloud: true }) > speedOf({ speed: 10 }) }; });
    check(rcl.hidden && rcl.open && rcl.fast, '後退: プラズマ雲の中の艦は外から見つかりにくく、雲の中では少し速い', JSON.stringify(rcl));
    const rsp = await page.evaluate(() => { while (gameSec < 40 && !over) step(.05);
      const main = fleets.find(f => f.name === '第1 主力砲撃 エスカドラ' && f.alive), us = fleets.find(f => f.name === '第18 護送護衛 支隊');
      if (!main) return { main: false };
      us.pos.copy(main.pos).add(new THREE.Vector3(0, 0, 40)); main.blindT = 0; updateFog(); enemyAI();
      const t = main.order && main.order.target;
      return { main: true, seen: us.seen, chase: !!(t && main.order.type === 'attack' && t.team === 0 && t.seen), target: t && t.name, spot: spotNow }; });
    check(rsp.main && rsp.seen && rsp.chase && rsp.spot, '後退: 見つかった部隊へ共和国の本隊が向かう', JSON.stringify(rsp));
    const rs = await page.evaluate(() => { const s = rescue && rescue.ship; if (!s) return { spawned: false };
      s.hpPool = 1e9; const us = fleets.find(f => f.name === '第24 駆逐突撃 支隊');
      for (let i = 0; i < 440 && !rescue.done && !over; i++) { us.order = null; us.pos.copy(s.pos).add(new THREE.Vector3(4, 0, 0)); step(.05); }
      return { spawned: true, done: rescue.done, rescued, gone: !s.alive }; });
    check(rs.spawned && rs.done && rs.rescued && rs.gone, '後退: 救難信号の船のそばに10秒付くと救助できる', JSON.stringify(rs));
    await page.waitForTimeout(400);
    await shot('10-retreat');
    const rw = await page.evaluate(() => { fleets.filter(f => f.team === 1).forEach(f => { f.alive = false; f.el.remove(); }); wings = [];
      let n = 0; while (!over && n++ < 8000) step(.05); return { over, outcome, saved: convoy.escaped }; });
    await page.waitForTimeout(2200);
    const rwTalk = await page.evaluate(() => [...document.querySelectorAll('#talkText')].map(e => e.textContent).join(''));
    check(rw.over && rw.outcome && rw.saved, '後退: 船団が撤退地点に着くと勝利', JSON.stringify(rw) + rwTalk);
    await page.click('#talkSkip').catch(() => {});
    /* clearing 第2節 opens 艦隊編集 and 技術ツリー */
    await page.waitForTimeout(300);
    const rw2 = await page.textContent('#rp');
    await page.click('#toMenu');
    const open2 = await page.evaluate(() => ({ org: !document.querySelector('#mainNav [data-go="org"]').disabled, tech: !document.querySelector('#mainNav [data-go="tech"]').disabled,
      prog: JSON.parse(localStorage.getItem('wos.save.v1')).prog }));
    check(rw2.includes('艦隊編集') && open2.org && open2.tech && open2.prog.cleared.join() === 'shinano,retreat',
      '後退: クリアで艦隊編集と技術ツリーが解放される', rw2 + JSON.stringify(open2.prog));
    /* the first clear of 第2節 also brings the one-time emergency aid (reward 300 + 400, aid 1000) */
    check(open2.prog.funds === 1700 && open2.prog.flags['aid:retreat'] && rw2.includes('緊急援助：資金 +1000'),
      '後退: 初めてのクリアで司令部からの緊急援助（資金 +1000）', rw2 + JSON.stringify(open2.prog));
    await shot('11-unlocked');
    /* the battle group screen offers only the classes whose branch is open (no locked ones with a lock mark) */
    await page.click('[data-go="org"]'); await page.click('[data-tab="bg"]'); await page.click('#orgList [data-bg="bg1"]');
    const types = await page.evaluate(() => ({ ids: [...document.querySelectorAll('#orgDetail [data-type]')].map(b => b.dataset.type).join(','), locks: document.querySelectorAll('#orgDetail .types .lock').length }));
    check(types.ids === 'cv,ff,dd,cl' && types.locks === 0, '編成: 支隊の艦種は開いている兵科だけ出す（鍵のマークは出さない）', JSON.stringify(types));
    await page.click('[data-s="org"] .back');

    /* 第3節 ナイル防衛線: fought with the player's army group; we defend the station, allied fleets (AI) hold the line */
    check(open2.prog.flags['rescued:retreat'] === true, '後退: カワセミを助けたかどうかが保存される', JSON.stringify(open2.prog.flags));
    await page.click('[data-go="sortie"]'); await page.click('[data-op="nile"]');
    const nSortie = { fixed: (await page.textContent('#sgList')).includes('決まった艦隊'), go: !(await page.isDisabled('#goBattle')) };
    check(!nSortie.fixed && nSortie.go, 'ナイル防衛線: 第2節のクリアで開き、自分の戦区軍で出撃する', JSON.stringify(nSortie));
    await page.click('#goBattle'); await page.waitForTimeout(800);
    const nTalk = await page.evaluate(() => talkFor(op.talk.before).map(l => l[0]));
    check(nTalk.includes('ベケレ機関士'), 'ナイル防衛線: 第2節でカワセミを助けていれば、出撃前の会話にベケレ機関士が出る', nTalk.join(','));
    await page.click('#talkSkip').catch(() => {});
    check(await page.evaluate(() => deploying), 'ナイル防衛線: 戦区軍で出撃するので、始まる前に配置できる');
    await page.click('#deployGo');
    const n1 = await page.evaluate(() => {
      const al = fleets.filter(f => f.ally), mine = fleets.filter(f => f.team === 0 && !f.ward);
      const r = { op: op.id, station: !!(fortress.defend && fortress.team === 0 && fortress.alive), allies: al.length, mine: mine.length, group: groups[0] && groups[0].name,
        notInRoster: !document.getElementById('roster').textContent.includes('アマゾン') };
      /* the evacuation slows by half the share of armour lost: 40% lost → 0.8 */
      fortress.hpPool = fortress.max * .6; step(.05); r.rate = +evacRate.toFixed(2); fortress.hpPool = fortress.max;
      /* the Donau squadron gives ground once under 2/3 of its ships, toward the rear of the station */
      const d = al.find(f => f.name === '第13 ドナウ主力 支隊'), home = d.post.clone();
      while (d.ships.length >= d.n * 2 / 3) d.ships.pop();
      allyAI(); r.falling = !!d.falling; r.moved = +d.post.distanceTo(home).toFixed(1); r.rear = d.post.z > home.z;
      /* a siege fleet makes for the station; enemy W.A.S. (not fighters) may hit it */
      const s = makeFleet(1, { name: '試験', sub: '', type: 'dd', n: 2, hp: 10, dmg: 0, range: 10, speed: 5, scale: 1, pos: [0, -100], alt: 0, vis: 5, stl: 5, ai: 'siege' });
      fleets.push(s); enemyAI(); r.siege = !!(s.order && s.order.target === fortress); s.alive = false; s.el.remove();
      r.was = craftMayHit({ team: 1, type: 'was' }, fortress) && !craftMayHit({ team: 1, type: 'ftr' }, fortress);
      /* the station's own fighters go out at an enemy coming near */
      const w0 = wings.length, e = makeFleet(1, { name: '試験2', sub: '', type: 'dd', n: 2, hp: 10, dmg: 0, range: 10, speed: 0, scale: 1, pos: [0, -30], alt: 0, vis: 5, stl: 5 });
      fleets.push(e); e.seen = true; launchCheck(fortress); r.stationFtr = fortress.hangars.length === 1 && wings.length > w0 && wings[wings.length - 1].carrier === fortress;
      wings.filter(w => w.carrier === fortress).forEach(w => { w.alive = false; }); wings = wings.filter(w => w.alive); e.alive = false; e.el.remove();
      return r; });
    check(n1.op === 'nile' && n1.station && n1.allies === 4 && n1.mine === 5 && n1.group === '第2 ネオ信濃駐屯 戦区軍' && n1.notInRoster,
      'ナイル防衛線: 守るステーションと友軍4隊（ドナウは前衛と主力）が出て、友軍は艦隊一覧に入らない', JSON.stringify(n1));
    check(n1.rate === .72, 'ナイル防衛線: 避難の速さは0.9倍で、ステーションの耐久が削られた割合の半分だけさらに遅れる', JSON.stringify(n1));
    check(n1.falling && n1.moved > 1 && n1.rear, 'ナイル防衛線: ドナウ残存隊は隻数が3分の2を切ると後ろへ下がっていく', JSON.stringify(n1));
    check(n1.siege && n1.was, 'ナイル防衛線: 攻城の敵はステーションへ向かい、敵の W.A.S. はステーションを狙える', JSON.stringify(n1));
    check(n1.stationFtr, 'ナイル防衛線: ステーションは艦載機を持ち、近づいた敵へ出す', JSON.stringify(n1));
    await page.evaluate(() => { while (gameSec < 22 && !over) step(.05); });
    await page.waitForTimeout(500);
    await shot('12-nile');
    const nw = await page.evaluate(() => { fleets.filter(f => f.team === 1).forEach(f => { f.alive = false; f.el.remove(); }); wings = []; opEvents.length = nextEvent;
      let n = 0; while (!over && n++ < 6000) step(.05); return { over, outcome, evac: Math.round(evac), clock: clockStr() }; });
    await page.waitForTimeout(2200);
    check(nw.over && nw.outcome, 'ナイル防衛線: 避難が終わると勝利', JSON.stringify(nw));
    await page.click('#talkSkip').catch(() => {});
    await page.waitForTimeout(300);
    await page.click('#toMenu');
    const n3 = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).prog);
    check(n3.cleared.includes('nile') && n3.funds === 1700 + 500, 'ナイル防衛線: クリアが記録され、報酬が入る', JSON.stringify(n3));
  } catch (e) {
    check(false, '実行中に例外', e.message);
  }

  check(errors.length === 0, 'ページのエラーなし', errors.join(' / '));
  await browser.close();
  console.log(failed ? `\n${failed}件の確認に失敗しました。` : '\nすべての確認に通りました。');
  process.exit(failed ? 1 : 0);
})();
