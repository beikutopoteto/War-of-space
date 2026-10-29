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
    /* options: the story (conversations) is off by default; the rest of this test plays with it on */
    await page.click('#mainNav [data-go="opt"]');
    const opt0 = await page.evaluate(() => ({ box: document.querySelector('[data-opt="story"]').checked, story: WOS_OPT.story }));
    check(!opt0.box && !opt0.story, 'オプション: ストーリーはデフォルトでオフ', JSON.stringify(opt0));
    await page.click('[data-opt="story"]');
    check(JSON.parse(await page.evaluate(() => localStorage.getItem('wos.opt'))).story === true, 'オプション: ストーリーをオンにすると保存される');
    await page.click('[data-s="opt"] .back');
    const data = await page.evaluate(() => ({ ships: WOS_DATA.ships.length, bonuses: WOS_DATA.bonuses.length, ops: WOS_DATA.operations.length, shown: WOS_DATA.operations.filter(o => !o.hidden).length }));
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
    check(await page.locator('#opList [data-op]').count() === data.shown && await page.locator('#opList [data-op="denaliBreak"]').count() === 1, '出撃: 作戦の一覧（作りかけの hidden の作戦は出さない。第6節は出る）', `${data.shown}作戦`);
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
    await advance(160);
    const after = await page.evaluate(() => ({ n: fleets.length, reinf: (op.reinforcements || []).filter(r => r.after <= 160 * CLOCK_RATE).length }));
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
    /* the prepared fleets are outside the scale's cap (user decision 2026-10-12) */
    const qcap = await page.evaluate(() => ({ ships: fleets.filter(f => f.team === 0 && !f.ward).reduce((s, f) => s + f.ships.length, 0), cap: WOS_DATA.scales[op.scale].cap }));
    check(qcap.ships > qcap.cap, 'クイック戦闘: 用意された艦隊は規模の上限の外（全艦で出る）', JSON.stringify(qcap));
    await shot('06-quick');

    /* views change only the vertical angle */
    await page.evaluate(() => setAngles(60, 40));
    await page.click('#cv1'); await page.waitForFunction(() => !camAnim, null, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(200);
    const view = await page.evaluate(() => getAngles());
    check(Math.round(view.az) === 60 && view.el > 80, '視点: 真上にしても横の角度が変わらない', `横${Math.round(view.az)}° 縦${Math.round(view.el)}°`);
    await page.click('#cv0'); await page.waitForFunction(() => !camAnim, null, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(200);
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

    /* 小型機と母艦をつなぐ (user decision 2026-10-22): a carrier on 自動交戦 told to move off does not leave its W.A.S. beyond the launch
       distance (it waits, calls them home, then goes); the AI's assault ship withdrawing the same, and it still gets away; on 命令優先 the
       player's carrier may go, and the squadron left beyond it is lost */
    const teth = await page.evaluate(() => {
      const run = (team, how) => {
        reset(); fortress.alive = false; fleets.forEach(f => { f.alive = false; });
        const N = fieldC.z - FIELD_R + 15, c = makeFleet(team, { name: '揚陸', sub: '', type: 'mas', n: 3, hp: 70, dmg: 0, range: 6, speed: how === 'evade' ? 20 : 6, scale: 1, pos: [0, N + 30], alt: 0, vis: 7, stl: 3, hangar: { was: 60 } });
        const e = makeFleet(1 - team, { name: '的', sub: '', type: 'cl', n: 4, hp: 999, dmg: 0, range: 6, speed: 0, scale: 1, pos: [0, N + 52], alt: 0, vis: 7, stl: 3 });
        fleets.push(c, e); c.hpPool = e.hpPool = 1e9; e.ai = null; e.leash = 0; c.seen = e.seen = true;
        if (team === 1) { c.ai = 'hunt'; c.leash = 300; c.post = c.pos.clone(); } else { c.stance = how; order(c, { type: 'attack', target: e }); }
        let i = 0; while (!wings.some(w => w.carrier === c && w.alive && w.state === 'attack' && w.pos.distanceTo(c.pos) > 15) && i++ < 400) step(.05);
        const p0 = c.pos.clone(), sq = wings.filter(w => w.carrier === c && w.alive).map(w => w.squad), lost0 = tetherLost; let worst = 0, t = 0;
        if (team === 1) { c.ai = 'withdraw'; c.order = null; } else order(c, { type: 'move', dest: c.pos.clone().add(new THREE.Vector3(0, 0, 150)) });
        for (; t < 1600 && c.alive && c.pos.distanceTo(p0) < 60; t++) { step(.05);
          for (const w of wings) if (w.carrier === c && w.alive) worst = Math.max(worst, w.pos.distanceTo(c.pos) / w.launchR); }
        const r = { out: sq.length, worst: +worst.toFixed(3), sec: +(t * .05).toFixed(1), went: +c.pos.distanceTo(p0).toFixed(1), left: !!c.left, lost: sq.filter(q => q.state === 'lost').length, tlost: tetherLost - lost0 };
        c.el.remove(); e.el.remove(); return r;
      };
      return { engage: run(0, 'engage'), ai: run(1, 'withdraw'), evade: run(0, 'evade') };
    });
    check(teth.engage.out > 0 && teth.engage.worst <= 1.01 && teth.engage.went >= 60 && teth.engage.sec > 2 && teth.engage.lost === 0
      && teth.ai.out > 0 && teth.ai.worst <= 1.01 && (teth.ai.went >= 60 || teth.ai.left) && teth.ai.lost === 0
      && teth.evade.out > 0 && teth.evade.worst > 1 && teth.evade.lost > 0 && teth.evade.tlost === teth.evade.lost,
      '小型機と母艦: 自動交戦と CPU の母艦は出ている隊を発艦の距離の外に残して動かず（呼び戻してから動く）、命令優先なら離れられて残された隊は失われる', JSON.stringify(teth));
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
    /* the two sides' tech (user decision 2026-10-20): a fighting fleet with no hp in the data takes the class tables at the operation's stage
       (開戦 0: the Earth 3割, the Republic 4.5割), the speed at the final form, every warship ×balance.speed; no multiplier per operation */
    const tt = await page.evaluate(() => { const q = op.enemies[0], e = fleets.find(f => f.name === q.name), mq = op.quick.find(x => x.type === 'dd'), m = fleets.find(f => f.name === mq.name);
      const T = WOS_DATA.sides.mars.ships, c = q.comp, tot = Object.values(c).reduce((a, b) => a + b, 0), avg = k => Object.keys(c).reduce((s, t) => s + T[t][k] * c[t], 0) / tot;
      const M = { def: avg('def'), atk: avg('atk'), spd: Math.min(...Object.keys(c).map(t => T[t].spd)) }, E = WOS_DATA.ships.find(x => x.id === 'dd'), near = (a, b) => Math.abs(a - b) < 1e-9;
      return { stage: op.stage, noData: q.hp == null && mq.hp == null, k: !('enemyHp' in op) && !WOS_DATA.operations.some(o => 'hpScale' in o || 'enemyHp' in o || 'enemyDmg' in o),
        enemy: near(e.hp, (6 + M.def * .45 * 5) * HP_K) && near(e.dmg, .4 + M.atk * .45 * .45) && near(e.speed, (2 + M.spd) * SPEED_K),
        mine: near(m.hp, (6 + E.def * .3 * 5) * HP_K) && near(m.dmg, .4 + E.atk * .3 * .45) && near(m.range, 10 + E.rng * .3 * 1.6) && near(m.speed, (2 + E.spd) * SPEED_K), conv: convoy.speed === op.convoy.fleet.speed }; });
    check(tt.stage === 0 && tt.noData && tt.k && tt.enemy && tt.mine && tt.conv, 'ネオ信濃奇襲: 敵も自分の決まった艦隊も、陣営の艦種の表の技術の段階（開戦0）の値。速さは研究しきった値の1.2倍、輸送船はそのまま（2026-10-20）', JSON.stringify(tt));
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
    /* the distress call comes at 10:00 (the clock is slower since 2026-10-12, so it comes before the main force) */
    const rs = await page.evaluate(() => { while (!rescue && gameSec * CLOCK_RATE < op.rescue.after + 30 && !over) step(.05);
      const s = rescue && rescue.ship; if (!s) return { spawned: false };
      s.hpPool = 1e9; const us = fleets.find(f => f.name === '第24 駆逐突撃 支隊');
      for (let i = 0; i < 440 && !rescue.done && !over; i++) { us.order = null; us.pos.copy(s.pos).add(new THREE.Vector3(4, 0, 0)); step(.05); }
      return { spawned: true, done: rescue.done, rescued, gone: !s.alive }; });
    check(rs.spawned && rs.done && rs.rescued && rs.gone, '後退: 救難信号の船のそばに10秒付くと救助できる', JSON.stringify(rs));
    const rsp = await page.evaluate(() => { const at = op.events.find(e => e.fleet && e.fleet.name === '第1 主力砲撃 エスカドラ').after;
      while (!fleets.some(f => f.name === '第1 主力砲撃 エスカドラ' && f.alive) && gameSec * CLOCK_RATE < at + 10 && !over) step(.05);
      const main = fleets.find(f => f.name === '第1 主力砲撃 エスカドラ' && f.alive), us = fleets.find(f => f.name === '第18 護送護衛 支隊');
      if (!main) return { main: false };
      /* above the clouds (they are scattered over the whole field since 2026-10-14), so neither is hidden */
      main.pos.y = 120; us.pos.copy(main.pos).add(new THREE.Vector3(0, 0, 40)); main.inCloud = inCloud(main); us.inCloud = inCloud(us); main.blindT = 0; updateFog(); enemyAI();
      const t = main.order && main.order.target;
      return { main: true, seen: us.seen, chase: !!(t && main.order.type === 'attack' && t.team === 0 && t.seen), target: t && t.name, spot: spotNow }; });
    check(rsp.main && rsp.seen && rsp.chase && rsp.spot, '後退: 見つかった部隊へ共和国の本隊が向かう', JSON.stringify(rsp));
    /* 19:00: the main force runs out of deuterium and turns back (events の ai:'withdraw'): it holds its fire, goes north out of the field
       and leaves the battle (not sunk) */
    const rwd = await page.evaluate(() => { const main = fleets.find(f => f.name === '第1 主力砲撃 エスカドラ' && f.alive); if (!main) return { main: false };
      main.hpPool = 1e9; const E = op.events.find(e => e.ai && e.ai.ai === 'withdraw'), logs = [], _l = logEvent; logEvent = (a, b) => { logs.push(a + ' ' + b); return _l(a, b); };
      gameSec = E.after / CLOCK_RATE; step(.05); const r = { main: true, ai: main.ai, clock: clockStr(), z0: main.pos.z - fieldC.z };
      main.order = null; enemyAI(); r.quiet = main.stance === 'evade' && !fireTargetOf(main);
      let n = 0; while (main.alive && n++ < 1200) step(.05);
      logEvent = _l; r.left = !main.alive && main.left; r.north = main.pos.z - fieldC.z < -FIELD_R; r.sec = Math.round(n * .05);
      r.said = logs.some(l => l.includes('引き返して')); r.sunk = logs.some(l => l.includes('第1 主力砲撃 エスカドラ 全滅')); return r; });
    check(rwd.main && rwd.ai === 'withdraw' && rwd.clock === '19:00' && rwd.quiet && rwd.left && rwd.north && rwd.said && !rwd.sunk,
      '後退: 19:00 に本隊は重水素が尽きて撃つのをやめ、北の枠の外へ引き返して戦場から消える', JSON.stringify(rwd));
    await page.waitForTimeout(400);
    await shot('10-retreat');
    const rw = await page.evaluate(() => { fleets.filter(f => f.team === 1).forEach(f => { f.alive = false; f.el.remove(); }); wings = [];
      let n = 0; while (!over && n++ < 24000) step(.05); return { over, outcome, saved: convoy.escaped, clock: clockStr() }; });
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
    /* the exercise with the player's own army groups opens once something has been researched (user decision 2026-10-13); クイック出撃 is always there */
    await page.click('[data-go="sortie"]'); await page.click('[data-op="charybdis"]');
    const exLock = { own: await page.isDisabled('#goBattle'), quick: await page.isVisible('#goQuick'), note: await page.textContent('#sgList') };
    check(exLock.own && exLock.quick && exLock.note.includes('研究'), '出撃: 自分の戦区軍での演習は、技術ツリーで研究を1つ終えるまで鍵付き（クイック出撃はできる）', JSON.stringify(exLock));
    await page.click('[data-s="sortie"] .back');
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
      /* three allies side by side with two foes before them: a foe more than 30% of the allied force is already going for is passed
         over, so they do not all go for the nearer one (pickFoe, ALLY_SHARE_MAX). With one foe left, all go for it (no other in reach),
         each from its own side of it, with room between them, within their leash (allySlot): from directions over 90 degrees apart
         (a pincer, user decision 2026-10-13) and at different heights */
      const A = al.slice(0, 3), keep = A.map(f => ({ pos: f.pos.clone(), post: f.post.clone(), leash: f.leash })), ne = nextEvent, gs = gameSec; nextEvent = opEvents.length;
      A.forEach((f, i) => { f.pos.set(-15 + i * 15, 0, -60); f.post.copy(f.pos); f.leash = 60; f.order = null; });
      const foe = (name, z) => { const x = makeFleet(1, { name, sub: '', type: 'cl', n: 6, hp: 1e6, dmg: 0, range: 16, speed: 0, scale: 1.1, pos: [0, z], alt: 0, vis: 5, stl: 5, ai: 'guard', leash: 0 }); x.seen = true; fleets.push(x); return x; };
      const e1 = foe('試験A', -85), e2 = foe('試験B', -88); allyAI();
      const on = t => A.filter(f => f.order && f.order.type === 'attack' && f.order.target === t).length;
      r.split = { e1: on(e1), e2: on(e2) };
      e2.alive = false; e2.el.remove(); A.forEach(f => f.order = null); allyAI();
      for (let i = 0; i < 400; i++) step(.05);
      const dR = f => Math.sqrt(f.n) * 1.35 * f.scale; let room = 1e9;
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) room = Math.min(room, A[i].pos.distanceTo(A[j].pos) - dR(A[i]) - dR(A[j]));
      const dirs = []; A.forEach(f => { const v = f.pos.clone().sub(e1.pos).normalize(); if (dirs.every(d => d.dot(v) <= 0)) dirs.push(v); });
      r.spread = { all: on(e1) === 3, room: +room.toFixed(1), leash: A.every(f => f.pos.distanceTo(f.post) < f.leash), pincer: dirs.length,
        height: +(Math.max(...A.map(f => f.pos.y)) - Math.min(...A.map(f => f.pos.y))).toFixed(1) };
      e1.alive = false; e1.el.remove(); A.forEach((f, i) => { f.pos.copy(keep[i].pos); f.post.copy(keep[i].post); f.leash = keep[i].leash; f.order = null; }); nextEvent = ne; gameSec = gs;
      return r; });
    check(n1.op === 'nile' && n1.station && n1.allies === 4 && n1.mine === 5 && n1.group === '第2 ネオ信濃駐屯 戦区軍' && n1.notInRoster,
      'ナイル防衛線: 守るステーションと友軍4隊（ドナウは前衛と主力）が出て、友軍は艦隊一覧に入らない', JSON.stringify(n1));
    check(n1.rate === .72, 'ナイル防衛線: 避難の速さは0.9倍で、ステーションの耐久が削られた割合の半分だけさらに遅れる', JSON.stringify(n1));
    check(n1.falling && n1.moved > 1 && n1.rear, 'ナイル防衛線: ドナウ残存隊は隻数が3分の2を切ると後ろへ下がっていく', JSON.stringify(n1));
    check(n1.siege && n1.was, 'ナイル防衛線: 攻城の敵はステーションへ向かい、敵の W.A.S. はステーションを狙える', JSON.stringify(n1));
    check(n1.stationFtr, 'ナイル防衛線: ステーションは艦載機を持ち、近づいた敵へ出す', JSON.stringify(n1));
    check(n1.split.e1 + n1.split.e2 === 3 && Math.max(n1.split.e1, n1.split.e2) <= 2 && n1.spread.all && n1.spread.room > 0 && n1.spread.leash && n1.spread.pincer === 3 && n1.spread.height > 4,   // 2026-10-20: 6 → 4. The heights come out about 6.0±0.2 (3rd unit stops about 5 short of its spot), so 6 failed by chance
      '友軍: 並んだ3隊は、味方の3割より多くがもう狙っている敵を避けて2つの敵に分かれる。敵が1つなら全隊でそれを狙い、90度より離れた3つの向きから、高さを変え、間を空けて挟む（持ち場の leash の中）', JSON.stringify(n1.split) + JSON.stringify(n1.spread));
    await page.evaluate(() => { while (gameSec < 22 && !over) step(.05); });
    await page.waitForTimeout(500);
    await shot('12-nile');
    const nw = await page.evaluate(() => { fleets.filter(f => f.team === 1).forEach(f => { f.alive = false; f.el.remove(); }); wings = []; opEvents.length = nextEvent;
      let n = 0, wave = false; while (!over && n++ < 18000) { step(.05); wave = wave || fleets.some(f => f.team === 1 && f.name === op.evacEvents[0].fleet.name); }
      return { over, outcome, evac: Math.round(evac), clock: clockStr(), wave }; });
    await page.waitForTimeout(2200);
    check(nw.over && nw.outcome, 'ナイル防衛線: 避難が終わると勝利', JSON.stringify(nw));
    check(nw.wave, 'ナイル防衛線: 避難が90%を越えると小さな敵の波が1つ来る（2026-10-13）', JSON.stringify(nw));
    await page.click('#talkSkip').catch(() => {});
    await page.waitForTimeout(300);
    await page.click('#toMenu');
    const n3 = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).prog);
    check(n3.cleared.includes('nile') && n3.funds === 1700 + 500, 'ナイル防衛線: クリアが記録され、報酬が入る', JSON.stringify(n3));
    /* 第4節 デナリの盾 (a battle the story loses): the carrier given for this section joins at the end of our list; an asteroid belt
       hides what is behind it; our fire on a ship in a civilian zone costs lives, the allies hold theirs; the carrier lands in the
       spaceport ring, the W.A.S. unit comes back, the boarding takes 5 hours, and getting the carrier to the exit ends it */
    await page.click('[data-go="sortie"]'); await page.click('[data-op="denali"]');
    check(!(await page.isDisabled('#goBattle')), 'デナリの盾: 第3節のクリアで開き、自分の戦区軍で出撃する');
    await page.click('#goBattle'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {});
    await page.click('#deployGo').catch(() => {});
    const d1 = await page.evaluate(() => {
      const mine = fleets.filter(f => f.team === 0 && !f.ward);
      const r = { op: op.id, last: mine[mine.length - 1] === opCarrier && opCarrier.name === 'ユーコン', free: !groupOf(opCarrier), noCraft: !opCarrier.craft,
        allies: fleets.filter(f => f.ally).length, aa: fleets.filter(f => f.fixed).length, blocks: blocks.length, debris: debris.length, masc: fleets.some(f => f.ships.some(x => x.type === 'masc')) || (op.carrier.landEvents || []).some(e => e.fleet && (e.fleet.comp && e.fleet.comp.masc || e.fleet.type === 'masc')) };
      /* the rock stops sight and fire, a move across it goes round it, and a fleet fired on from two sides fires back weaker, with marks */
      r.rockHides = bodyBlocks(new THREE.Vector3(0, 0, 60), new THREE.Vector3(0, 0, -60)) && !bodyBlocks(new THREE.Vector3(0, 0, 60), new THREE.Vector3(30, 0, 60));
      { const pa = makePath(new THREE.Vector3(0, 0, 70), [new THREE.Vector3(0, 0, -70)]); let clear = 1e9;
        for (let i = 0; i <= 100; i++) { const q = pa.curve.getPointAt(i / 100); clear = Math.min(clear, q.length() - bodySurface(q, op.body.r)); }
        r.roundRock = clear > 2 && pa.pts.length === 1; }
      { const E = fleets.find(f => f.name.includes('第14')), A = mine.find(f => !f.isCarrier), B = mine.find(f => !f.isCarrier && f !== A), keep = [E, A, B].map(f => [f.pos.clone(), f.fireTarget]);
        E.pos.set(60, 0, 95); A.pos.set(60 - A.range * .6, 0, 95); B.pos.set(60 + B.range * .5, B.range * .3, 95); A.fireTarget = E; B.fireTarget = E; pincers();
        r.pinch = E.pinchN === 2 && E.pinch === .8; pinchMarks(E, proj(E.pos), false); r.pinchMarks = !!E.pzEl && !E.pzEl.hidden && E.pzEl.textContent === '×0.8' && E.pzEl.querySelectorAll('.pz-v').length === 2;
        B.fireTarget = null; pincers(); pinchMarks(E, proj(E.pos), false); r.pinchOff = E.pinch === 1 && !!E.pzEl && E.pzEl.hidden;
        [E, A, B].forEach((f, i) => { f.pos.copy(keep[i][0]); f.fireTarget = keep[i][1]; }); pincers(); }
      /* behind a debris cloud: not seen, however close; inside one: not seen from outside; in the open: seen */
      const c = debris[0], mid = c.c.clone();
      const o = { pos: mid.clone().add(new THREE.Vector3(0, 0, c.r + 25)), vis: 9 }, t = { pos: mid.clone().add(new THREE.Vector3(0, 0, -c.r - 25)), stl: 1 },
        tin = { pos: mid.clone(), stl: 1 }, t2 = { pos: o.pos.clone().add(new THREE.Vector3(-30, 0, 10)), stl: 1 };
      r.beltHides = !canSee(o, t) && !canSee(o, tin) && canSee(o, t2);
      /* a ship in a civilian zone: hitting it costs lives; out in the open, or a gun battery on the rock, it does not */
      const g = fleets.find(f => f.name === '第14 巡洋阻止 戦闘隊'), gp = g.pos.clone(), me = mine[0];
      g.pos.copy(blocks[2].pos).add(new THREE.Vector3(0, 0, 6)); const c0 = casualties; damage(g, 5, me); r.zoneCost = +(casualties - c0).toFixed(1); r.zoneWant = +(5 * (1 - g.eva) * op.civil.perDmg / HP_K).toFixed(1);
      g.pos.copy(gp); const c1 = casualties; damage(g, 5, me); const e = fleets.find(f => f.fixed && f.alive); damage(e, 5, me); r.openFree = casualties === c1;
      /* the allies do not fire on a ship in a zone, but do on a battery */
      const a = fleets.find(f => f.ally); g.seen = true; g.pos.copy(blocks[2].pos).add(new THREE.Vector3(0, 0, 6)); a.pos.copy(g.pos).add(new THREE.Vector3(0, 0, 14));
      r.allyHold = fireTargetOf(a) !== g; g.pos.copy(gp);
      e.seen = true; a.pos.copy(e.pos).add(new THREE.Vector3(0, 0, 10)); r.allyBattery = fireTargetOf(a) === e; a.pos.copy(a.post);
      /* with no garrison left to fight, an allied unit goes for a battery (the batteries are foes too, user decision 2026-10-13), and the
         six share them out like ships: no battery has more than two of them (ALLY_SHARE_MAX) */
      const gs = fleets.filter(f => f.team === 1 && f.alive && !f.fixed); gs.forEach(f => f.alive = false); a.order = null; allyAI();
      r.toBattery = !!a.order && (a.order.type === 'attack' ? a.order.target.fixed : fleets.some(f => f.fixed && f.alive && f.pos.distanceTo(a.order.dest) < 1));
      { const al = fleets.filter(f => f.ally && f.alive), aims = new Map(); al.forEach(f => aims.set(f.aim, (aims.get(f.aim) || 0) + 1));
        r.batteryShare = al.every(f => f.aim && f.aim.fixed) && Math.max(...aims.values()) <= 2; al.forEach(f => { f.order = null; f.aim = null; }); }
      /* one foe left in reach (user decision 2026-10-14, op.allySplit): no more than two of the six go for it, the rest hold their posts */
      { const bs = fleets.filter(f => f.fixed && f.team === 1 && f.alive), one = gs[0], al = fleets.filter(f => f.ally && f.alive);
        bs.forEach(f => f.alive = false); one.alive = true; one.seen = true; al.forEach(f => { f.order = null; f.aim = null; f.pos.copy(f.post); });
        allyAI(); allyAI(); const on = al.filter(f => f.aim === one).length, rest = al.filter(f => f.aim !== one);
        r.split = op.allySplit && on >= 1 && on <= 2 && rest.length >= 4 && rest.every(f => !f.aim && !(f.order && f.order.type === 'attack'));
        r.splitOn = on; bs.forEach(f => f.alive = true); al.forEach(f => { f.order = null; f.aim = null; }); }
      gs.forEach(f => f.alive = true); a.order = null;
      /* the port is shut until its control is opened from inside (body.port.openAt): stopped in the ring, the carrier waits */
      const P = op.body.port; opCarrier.pos.set(P.pos[0], P.alt || 0, P.pos[1]); opCarrier.order = null; step(.05); step(.05);
      updateGoal(); r.shut = P.openAt > 0 && !opCarrier.cs.landed && goalLabel.textContent.includes('管制 閉鎖中');
      /* once it opens, stopped in the port ring, the carrier lands to take the port (占領), and the W.A.S. unit (Alvarez, vivid red) comes back */
      gameSec = P.openAt / CLOCK_RATE; step(.05);
      r.landed = opCarrier.cs.landed && opCarrier.locked && phaseName === '占領' && !opCarrier.cs.evac && Math.abs(opCarrier.cs.landMin - P.openAt) < 1;
      const before = new Set(fleets); step(.05);
      const back = fleets.filter(f => f.team === 1 && f.alive && !f.fixed && !before.has(f)); r.back = back.length;
      r.raidYukon = back.filter(f => f.prey === 'carrier' && !f.spare && !f.ace && !f.letGo).length;   // one of the raid goes for Yukon (2026-10-17)
      /* the raid coming back starts the boarding at once (user decision 2026-10-17: no waiting while the port is held) */
      r.evacNow = !op.carrier.evac && opCarrier.cs.evac && phaseName === '収容' && Math.abs(opCarrier.cs.evacMin - opCarrier.cs.landMin) < 1; endTalk();
      /* they come from the far (north-west) end of the debris cloud, well away from the port */
      r.far = Math.round(Math.min(...back.map(f => f.pos.distanceTo(new THREE.Vector3(P.pos[0], P.alt || 0, P.pos[1])))));
      /* they go for our ships, spare Yukon, and keep out of the civilian zones (so the allies can answer them) */
      r.noRaid = !fleets.some(f => f.team === 1 && f.alive && f.ai === 'raid') && fleets.filter(f => f.team === 1 && f.alive && !f.fixed).every(f => (f.prey === 'carrier' || spares(f, opCarrier)) && f.keepOut);   // but the one going for Yukon (2026-10-17)
      const kz = back[0], kp = kz.pos.clone(); kz.pos.copy(blocks[1].pos).add(new THREE.Vector3(4, 0, 0)); keepOutOfZones(kz); r.keptOut = !inZone(kz); kz.pos.copy(kp);
      /* no allied unit is left behind in the rear; told to protect, each takes what it is given (Wong's on Yukon), outside every zone */
      r.noRear = fleets.filter(f => f.ally).every(f => f.leash >= 300);
      const pa = fleets.find(f => f.ally && f.alive), pb = fleets.find(f => f.name === '第20 ドナウ前衛 支隊');
      [pa, pb].forEach(f => { f.mode = 'protect'; protectAI(f); });
      r.protectOut = !!pa.order && blocks.every(b => Math.hypot(pa.order.dest.x - b.pos.x, pa.order.dest.z - b.pos.z) >= op.civil.r) && pa.protects === opCarrier && pb.protects === blocks[0];
      [pa, pb].forEach(f => { f.mode = 'guard'; f.order = null; });
      const ace = fleets.find(f => f.ace && f.alive); r.ace = !!ace && colOf(ace) === 3;
      r.spare = !!ace && !craftMayHit({ team: 1, type: 'was', carrier: ace }, opCarrier) && !nearestFoe(ace, 1e9, u => u === opCarrier);
      /* landed, it takes no move order */
      select(opCarrier); groupOrder({ type: 'move', dest: new THREE.Vector3(0, 0, 100) }); r.stays = !opCarrier.order; select(null);
      /* with every foe down (ships and batteries), the allied units (hold) do not go back to their posts: they spread out and wait near
         the habitat blocks, outside the civilian zones, two to a block, apart from each other and at different heights (user decision 2026-10-13) */
      fleets.filter(f => f.team === 1).forEach(f => { f.alive = false; f.el.remove(); }); wings = []; const keepEv = opEvents.splice(nextEvent);
      const h = fleets.find(f => f.ally && f.alive && f.hold); h.pos.set(-20, 0, 60); fleets.forEach(f => { if (f.ally) { f.order = null; f.waitAt = null; } }); allyAI();
      { const W = fleets.filter(f => f.ally && f.alive && f.hold), near = p => Math.min(...blocks.map(b => p.distanceTo(b.pos))), by = new Map(); let sep = 1e9;
        W.forEach(f => by.set(f.waitBlock, (by.get(f.waitBlock) || 0) + 1));
        W.forEach((f, i) => W.slice(i + 1).forEach(g => { sep = Math.min(sep, f.waitAt.distanceTo(g.waitAt)); }));
        r.wait = { all: W.every(f => f.waitAt && near(f.waitAt) >= op.civil.r && near(f.waitAt) < op.civil.r + 12), blocks: by.size, most: Math.max(...by.values()), sep: Math.round(sep),
          heights: new Set(W.map(f => Math.round(f.waitAt.y))).size, notHome: h.post.distanceTo(h.home) > 5, goes: !!h.order && h.order.type === 'move' && h.order.dest.distanceTo(h.waitAt) < 1 }; }
      opEvents.push(...keepEv);
      /* 24 minutes later the second wave comes for Yukon from the north-east */
      const t0 = gameSec; let n = 0; while (opCarrier.cs.board < 47 && n++ < 6000) step(.05);   // the first of the last waves: 40 minutes in (2026-10-17)
      const w2 = fleets.find(f => f.team === 1 && f.alive && f.prey === 'carrier'); r.wave2 = !!w2 && w2.keepOut;
      if (w2) { w2.alive = false; w2.el.remove(); }
      r.noLastYet = !opCarrier.cs.lastCame; fleets.forEach(f => { f.tag = null; });   // the loop below takes every enemy off: not the first wave's losses
      /* 3,000 people an hour while the main fleet holds (user decision 2026-10-16; the later waves are taken off as they come); cut short once 60% of the
         battle line is sunk, and always after cut.max minutes */
      while (opCarrier.cs.board < 120 && n++ < 6000) { step(.05); fleets.forEach(f => { if (f.team === 1 && f.alive && !f.fixed) { f.alive = false; f.el.remove(); } }); }
      r.boardSec = Math.round(gameSec - t0); r.clock = CLOCK_RATE; step(.05); r.holds = !opCarrier.cs.done && opCarrier.cs.boarded === 6000;
      { const S = opCarrier.cs, b = S.board; r.noCut = !cutBoarding(op.carrier, S); S.board = op.carrier.cut.max; r.cutMax = cutBoarding(op.carrier, S); S.board = b; }
      /* the later half (user decision 2026-10-15): the enemy comes all at once, as many units as ours still in the battle plus one,
         the same ships and W.A.S. as before; they break us one by one: two on the one that stands most alone, one on each of the
         others nearest it */
      { const before = fleets.length, ours = fleets.filter(f => f.team === 0 && f.alive && !f.fixed && !f.convoy && !f.ghost && !f.isCarrier);
        const k = spawnMass(op.carrier.evacEvents.find(e => e.mass).mass), add = fleets.slice(before), G = add.filter(f => f.ai === 'detail');
        ours.forEach(f => { f.seen = true; }); detailFocus = null;
        const plan = detailPlan(fleets.filter(f => f.team === 0 && f.alive && !f.ghost)), on = t => [...plan.values()].filter(x => x === t).length;
        const others = ours.filter(t => t !== detailFocus);
        r.mass = { k, ours: ours.length, n: add.reduce((s, f) => s + f.n, 0), was: add.reduce((s, f) => s + (f.hangar && f.hangar.was || 0), 0), detail: G.length,
          focus: on(detailFocus), pinned: others.filter(t => on(t) === 1).length, lone: !detailFocus.preyLast };
        add.forEach(f => { f.alive = false; f.el.remove(); f.tag = null; }); detailFocus = null; }
      /* the last wave in two (user decision 2026-10-17): the second comes once the first has lost 60% of its ships, and the retreat begins with it */
      { const S = opCarrier.cs, before = fleets.length; spawnMass(op.carrier.evacEvents.find(e => e.mass).mass);
        const W1 = fleets.slice(before).filter(f => f.tag === 'w1'), n1 = W1.reduce((s, f) => s + f.n, 0); let lost = 0;
        for (const f of W1) while (f.ships.length && lost < n1 * .55) { f.ships.pop(); lost++; }
        const b2 = fleets.length; stepLastWave(op.carrier, S); const early = fleets.length === b2 && !S.lastCame && !cutBoarding(op.carrier, S);
        for (const f of W1) while (f.ships.length && lost < n1 * .6) { f.ships.pop(); lost++; }
        W1.forEach(f => { if (!f.ships.length) f.alive = false; });
        stepLastWave(op.carrier, S); const gapWait = fleets.length === b2 && !S.lastCame; massAt.w1 -= op.carrier.lastWave.gap;   // not within 30 minutes of the first
        const eA = makeFleet(1, { name: '試験 赤', sub: '', type: 'mas', n: 2, hp: 999, dmg: 0, eva: 0, range: 13, speed: 9, scale: 1, pos: [100, -100], alt: 0, vis: 9, stl: 0, ai: 'hunt', ace: true }); fleets.push(eA);
        const said = [], logE = logEvent; logEvent = (a, b) => { said.push(b); logE(a, b); }; stepLastWave(op.carrier, S); logEvent = logE; const W2 = fleets.slice(b2).filter(f => f !== eA);
        r.pullBack = eA.letGone && eA.ai === 'guard'; eA.alive = false; eA.el.remove();   // Alvarez leaves the rest to the main force (2026-10-17)
        r.lastWave = { gapWait, n1, was1: W1.reduce((s, f) => s + (f.hangar && f.hangar.was || 0), 0), early, came: S.lastCame && W2.length >= 2 && said.some(t => t.includes(W2.length + '隊')),
          units2: W2.length, yukon2: W2.filter(f => f.prey === 'carrier' && !f.spare).length, n2: W2.reduce((s, f) => s + f.n, 0), was2: W2.reduce((s, f) => s + (f.hangar && f.hangar.was || 0), 0),
          wait: !cutBoarding(op.carrier, S) };
        S.lastMin -= op.carrier.lastWave.after; r.lastWave.cut = cutBoarding(op.carrier, S);   // the retreat begins `after` (20) minutes after it came
        [...W1, ...W2].forEach(f => { f.alive = false; f.el.remove(); f.tag = null; }); S.lastCame = false; }
      /* at the cut, the waves not yet come (wave:true) are dropped and the retreat's own events (doneEvents) follow from then
         (none of the boarding's own are left by now: one is put in to see it go) */
      opEvents.splice(nextEvent, 0, { after: gameSec * CLOCK_RATE + 500, wave: true, log: ['試し', '来ない波'] });
      r.wavesLeft = opEvents.slice(nextEvent).some(e => e.wave);
      /* when the allied units have lost half their ships, the last wave comes, and 20 minutes later the retreat begins (user decision 2026-10-17); the unit nearest Yukon escorts it, the rest
         stay and hold the enemy off. The enemy comes after Yukon, beating what of ours is near first; only Alvarez's units let it go */
      const al = fleets.filter(f => f.ally && f.alive && !f.fixed), alN = al.reduce((s, f) => s + f.n, 0);
      const mk = o => { const e = makeFleet(1, { sub: '', type: 'cl', n: 2, hp: 999, dmg: 0, eva: 0, range: 20, speed: 9, scale: 1, alt: 0, vis: 9, stl: 0, ai: 'detail', keepOut: true, ...o }); e.seen = true; fleets.push(e); return e; };
      const eAce = mk({ name: '試験 赤', pos: [100, -100], ace: true, spare: ['carrier'] }), eLet = mk({ name: '試験 部下', pos: [110, -100], letGo: true, spare: ['carrier'] }), eRun = mk({ name: '試験 追う', pos: [120, -100], spare: ['carrier'] });
      let cutN = 0; for (const f of al) { while (alliesLost() < .45 && f.ships.length > 1) { f.ships.pop(); cutN++; } }
      step(.05); r.notYet = !opCarrier.cs.done; al[0].ships.splice(0, Math.ceil(alN * .02)); al.forEach(f => { if (!f.ships.length) f.alive = false; });
      { const before = fleets.length; opCarrier.seen = true; step(.05); const W2 = fleets.slice(before).filter(f => f.team === 1);
        r.callsLast = opCarrier.cs.lastCame && W2.length === op.carrier.lastWave.mass.units && !opCarrier.cs.done;
        W2.forEach(f => { f.alive = false; f.el.remove(); }); wings = wings.filter(w => !W2.includes(w.carrier)); opCarrier.cs.lastMin -= op.carrier.lastWave.after; }
      step(.05); r.cut = opCarrier.cs.done && alliesLost() >= .5; r.boarded = opCarrier.cs.boarded; endTalk();
      { const left = al.filter(f => f.alive), esc = left.filter(f => f.mode === 'leave'), near = left.slice().sort((a, b) => a.pos.distanceTo(opCarrier.pos) - b.pos.distanceTo(opCarrier.pos))[0];
        r.escort = esc.length === 1 && esc[0] === near && left.filter(f => f.mode === 'rear').length === left.length - 1;
        r.letGo = eAce.letGone && eLet.letGone && eAce.ai === 'guard' && !eRun.letGone && eRun.ai === 'chase' && !eRun.spare;
        const rear = left.find(f => f.mode === 'rear'); eRun.pos.copy(rear.pos).add(new THREE.Vector3(20, 0, 0)); rear.seen = true; eRun.order = null; enemyAI(); r.chaseNear = !!eRun.order && eRun.order.target !== opCarrier && eRun.order.target.team === 0;
        eRun.pos.set(opCarrier.pos.x + 100, opCarrier.pos.y + 60, opCarrier.pos.z); left.forEach(f => { f.seen = false; }); opCarrier.seen = true; eRun.order = null; enemyAI(); r.chaseYukon = !!eRun.order && eRun.order.target === opCarrier;
        left.forEach(f => { f.seen = true; }); allyAI(); r.rearFights = !!rear.order && rear.order.type === 'attack' && rear.order.target.team === 1;
        [eAce, eLet, eRun].forEach(e => { e.alive = false; e.el.remove(); }); }
      { const rest = opEvents.slice(nextEvent), d = rest.find(e => e.fleet && e.fleet.name === '第18 機動駆逐 戦闘隊');
        r.wavesGone = r.wavesLeft && !rest.some(e => e.wave); r.doneEv = !!d && Math.abs(d.after - (gameSec * CLOCK_RATE + op.carrier.doneEvents[0].after)) < 1; }
      /* the win talk says the share of the battle line that did not come back (a unit that left at the exit came back) */
      r.lost = fillText('{lost}'); r.lostWant = Math.max(1, Math.round(lineLost() * 10)) + '割';
      { const lf = fleets.find(f => op.carrier.line.includes(f.name) && f.ships.length); lf.alive = false; lf.left = true; r.lostLeft = fillText('{lost}') === r.lost; lf.alive = true; lf.left = false; }
      /* the more aboard, the slower Yukon goes: 30% of its speed when full (8,000) */
      const b0 = opCarrier.cs.boarded; r.slow = +loadSlow(opCarrier).toFixed(2); opCarrier.cs.boarded = 8000; r.slowFull = +loadSlow(opCarrier).toFixed(2); opCarrier.cs.boarded = b0;
      r.retreat = phaseName === '撤退' && !opCarrier.locked && exitObj.visible;
      opCarrier.pos.copy(opCarrier.cs.exit); step(.05); r.over = over; r.win = outcome;
      return r; });
    check(d1.op === 'denali' && d1.last && d1.free && d1.noCraft && d1.allies === 6 && d1.aa === 6 && d1.blocks === 3 && d1.debris > 3 && !d1.masc,
      'デナリの盾: ユーコンが自軍の一覧の最後に出て（戦区軍の外、研究は効かない）、本軍6隊・対空砲台6基・居住区3つ・採掘の岩くずの雲がある（強襲母艦は出ない）', JSON.stringify(d1));
    check(d1.beltHides, 'デナリの盾: 岩くずの雲の向こうと中は見えない', JSON.stringify(d1));
    check(d1.rockHides && d1.roundRock, 'デナリ: 岩の向こうは見えず撃てない。岩を横切る移動は岩を回り込む（経由地の印は増えない）', JSON.stringify(d1));
    check(d1.pinch && d1.pinchMarks && d1.pinchOff, '挟撃: 2方向から撃たれると砲の打撃が0.8倍になり、紋章のまわりに矢じり2つと「×0.8」が出る。挟撃が解けると消える', JSON.stringify(d1));
    /* 5 × (1 − eva .16) × perDmg 2 ÷ the hit points multiplier 2 (2026-10-13: the same lives for twice the fire) */
    check(d1.zoneCost === d1.zoneWant && d1.zoneCost > 0 && d1.openFree && d1.allyHold && d1.allyBattery && d1.toBattery && d1.batteryShare && d1.split, 'デナリの盾: 民間区画の中の敵艦を撃つと住民に被害が出る（区画の外と、岩の上の対空砲台なら出ない）。本軍は区画の中の艦を撃たないが、守備隊を片付けると対空砲台を壊しに行く（砲台も目標を分け、1基に多くて2隊）。敵が1つでも向かうのは多くて2隊で、ほかは持ち場に残る（2026-10-14）', JSON.stringify(d1));
    check(d1.shut && d1.landed && d1.ace && d1.spare && d1.stays, 'デナリの盾: 宇宙港は管制が開くまで降りられない（任務欄に「管制 閉鎖中」）。開くと、輪で止まったユーコンが着陸して港を押さえ（占領）、アルバレスの隊（鮮烈な赤）が戻る。アルバレスはユーコンを狙わず、着陸したユーコンは動かない', JSON.stringify(d1));
    check(d1.raidYukon === 1, 'デナリの盾: 着陸で戻る奇襲部隊のうち1隊（アルバレスの隊ではない）がユーコンを狙う（2026-10-17）', JSON.stringify(d1));
    check(d1.evacNow && d1.wave2, 'デナリの盾: 着陸で奇襲部隊が戻ると、すぐ作戦変更で収容が始まる（2026-10-17）。40分後に最後の波の1つ目（ユーコンを狙う第6 を含む）が来る', JSON.stringify(d1));
    check(d1.notYet && d1.callsLast && d1.escort && d1.letGo && d1.chaseNear && d1.chaseYukon && d1.rearFights, 'デナリの盾: 本軍の隻数の5割が沈むと最後の波の2つ目が来て、20分後に撤退。ユーコンにいちばん近い1隊がつき、残りは残って敵を食い止める。敵はアルバレスの隊だけ追わず、ほかは近くの味方を先に叩き、いなければユーコンを追う（2026-10-17）', JSON.stringify(d1));
    check(d1.holds && d1.noCut && d1.cutMax && d1.cut && d1.boarded === 6000 && d1.retreat && d1.over && d1.win, 'デナリの盾: 収容は1時間に3,000人（2026-10-16）。最後の波の2つ目から20分たつか（2026-10-17）、収容が cut.max 分になると切り上げて撤退に変わり、ユーコンが離脱点に着けば作戦は終わる', JSON.stringify(d1));
    /* the waves' ships and W.A.S. from the data (2026-10-20: the Republic's numbers were fitted to the two sides' tables) */
    const DW = await page.evaluate(() => { const C = WOS_DATA.operations.find(o => o.id === 'denali').carrier, E = C.evacEvents.find(e => e.mass).mass, L = C.lastWave.mass;
      const cnt = m => m.own.reduce((s, f) => s + f.n, 0) + m.types.reduce((s, t) => s + t.n, 0), was = m => m.types.reduce((s, t) => s + (t.was ?? ((WOS_DATA.sides.mars.ships[t.fleet.type] || {}).was || 0) * t.n), 0);   // the class's W.A.S. when the data gives none (2026-10-21)
      return { n1: cnt(E), was1: was(E), n2: cnt(L), was2: was(L) }; });
    { const M = d1.mass || {};
      check(M.ours >= 2 && M.k === 4 && M.n === DW.n1 && M.was === DW.was1 && M.detail === M.k - 1 && M.focus === 2 && M.pinned === Math.min(M.ours - 1, M.detail - 2) && M.lone,
        'デナリの盾: 後半の敵は一度に来る（1つ目の波は第6 を入れて4隊。隻数と W.A.S. はデータのとおり。2026-10-17）。各個撃破: 孤立した隊に2隊、ほかの隊に1隊ずつ（ウォン中将の隊は最後）', JSON.stringify(M)); }
    { const L = d1.lastWave || {};
      check(d1.noLastYet && L.n1 === DW.n1 && L.was1 === DW.was1 && L.early && L.gapWait && L.came && L.n2 === DW.n2 && L.was2 === DW.was2 && L.units2 === 6 && L.yukon2 === 1 && L.wait && L.cut && d1.pullBack, 'デナリの盾: 最後の波は2つ。1つ目の6割が沈み、1つ目から30分たつと2つ目（6隊。隻数と W.A.S. はデータのとおり。1隊はユーコンを狙う。前半の第17 重巡洋を戻した）が来て、アルバレスの隊は引き上げ、20分後に撤退が始まる（2026-10-17）', JSON.stringify(L)); }
    check(d1.wavesGone && d1.doneEv,'デナリの盾: 切り上げのとき、まだ来ていない波（wave:true）は捨て、撤退の出来事（doneEvents）が切り上げから始まる', JSON.stringify(d1));
    check(d1.lost === d1.lostWant && d1.lostLeft, 'デナリの盾: 勝ちの会話の {lost} に、本軍の戦艦の帰らなかった割合が入る（離脱点から抜けた隊は帰ったと数える）', JSON.stringify(d1));
    check(d1.slow === .48 && d1.slowFull === .3, 'デナリの盾: ユーコンは乗せた人数に比例して遅くなり、満員で70%遅い', JSON.stringify(d1));
    check(d1.wait.all && d1.wait.blocks === 3 && d1.wait.most === 2 && d1.wait.sep >= 14 && d1.wait.heights >= 3 && d1.wait.notHome && d1.wait.goes,
      'デナリの盾: 本軍は敵（砲台も）を倒し終えると、持ち場へ戻らず、ばらけて居住区の近く（民間区画の縁の外）で待つ。3つの居住区に2隊ずつ、離れて、高さを変えて', JSON.stringify(d1.wait));
    check(d1.far >= 140 && d1.noRaid && d1.keptOut && d1.noRear && d1.protectOut, 'デナリの盾: 奇襲部隊は宇宙港から遠い雲の端から来て、こちらの艦を狙い（ユーコンを狙う1隊のほか）、民間区画には入らない。本軍は後ろに残らず、受け持ちのユーコンか居住区を区画の外で守る', JSON.stringify(d1));
    check(Math.abs(d1.clock - 630 / (1050 * .85)) < 1e-9 && d1.boardSec === 170 && d1.back === 4, 'デナリの盾: 時計は大規模の長さに合わせて進み（span 630分を1,050秒の85%。2時間の収容に戦闘の170秒）、着陸すると4隊が同時に戻ってくる（2026-10-14）', JSON.stringify(d1));
    await page.waitForTimeout(2200);
    await page.click('#talkSkip').catch(() => {});
    await page.waitForTimeout(300);
    await page.click('#toMenu');
    const d3 = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).prog);
    check(d3.cleared.includes('denali') && d3.funds === 2200 + 600, 'デナリの盾: クリアが記録され、報酬が入る', JSON.stringify(d3));
    /* where the player has to take a ship (the carrier's exit) lies inside the clickable field, ring and all (2026-10-15: it was at 212) */
    const ex = await page.evaluate(() => WOS_DATA.operations.filter(o => o.carrier).map(o => { const E = o.carrier.exit; return { id: o.id, out: Math.hypot(E.pos[0], E.pos[1]) + (E.r || 12) }; }));
    check(ex.length && ex.every(e => e.out <= 200), '撤退の離脱点は、輪ごと作戦フィールドの中心から200以内（クリックできる範囲）', JSON.stringify(ex));
    /* 第5節 フェブルアーリア防衛戦: a body far larger than the field to the south, the Earth behind it, a battleship lent from the yard,
       friendly batteries on the rock; the base's three gates under their shields (2026-10-16): a breached gate is blown shut, the last one
       open lets the assault ships wear the garrison down (0 loses); holding until 18:00 wins, and the battleship branch opens */
    await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]');
    check(!(await page.isDisabled('#goBattle')), 'フェブルアーリア防衛戦: 第4節のクリアで開き、自分の戦区軍で出撃する');
    /* the battle's scale: its name and length on the card, and a cap on all the ships together */
    const scl = await page.evaluate(() => ({ card: document.querySelector('[data-op="februaria"] em').textContent, row: (document.querySelector('#sgLoad tr.scale') || {}).textContent || '',
      small: document.querySelector('[data-op="charybdis"] em') && document.querySelector('[data-op="charybdis"] em').textContent }));
    check(scl.card.startsWith('大規模（目安 15〜20分）') && /戦闘の規模（大規模）\d+ \/ 150隻/.test(scl.row) && scl.small.startsWith('小規模（目安 5〜10分）'),
      '戦闘の規模: 出撃画面に規模と目安の長さが出て、出撃できる艦の合計に規模の上限が付く（第5節は作戦の cap で150。2026-10-18）', JSON.stringify(scl));
    await page.click('#goBattle'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {});
    await page.click('#deployGo').catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/februaria-gates.png' }).catch(() => {});
    const f1 = await page.evaluate(() => {
      const mine = fleets.filter(f => f.team === 0 && !f.ward), bb = mine[mine.length - 1], bt = fleets.filter(f => f.ally && f.fixed);
      const r = { op: op.id, bb: bb.type === 'bb' && !groupOf(bb), allies: fleets.filter(f => f.ally && !f.fixed).length, bt: bt.length,
        onRock: bt.every(f => f.pit && f.pit.root && Math.abs(f.pos.y - rockAt(f.pos.x, f.pos.z).y) < 2), centre: bodyC.z > 200,
        sky: skyObj.children.length >= 3 && !farPlanet.visible };
      /* the gates: west, middle, east, the middle on the rock's middle and the two others about 160 either side, on their craters' floors,
         18 infantry dots round each (2026-10-18: twice the 36, 72; 2026-10-20: a quarter of the dots, each four times as strong); the batteries placed the same both sides */
      const G = gates, W = G[0], C = G[1], E = G[2];
      r.gates = G.map(g => g.name).join('・'); r.sym = Math.abs(C.pos.x) < 3 && Math.abs(W.pos.x + 160) < 6 && Math.abs(E.pos.x - 160) < 6;
      r.onFloor = G.every(g => Math.abs(g.look.frame.pos.distanceTo(bodyC) - bodySurface(g.look.frame.pos, op.body.r)) < 4) && G.every(g => g.ring.distanceTo(g.pos) > 9);
      r.inf = G.every(g => g.look.inf.pts.length === 18 && g.inf === 18);
      /* by the gates, a little apart (user decision 2026-10-17): 3 by the west gate, 2 by the middle, 3 by the east, and two more each further out
         (2026-10-17 夜): 5, 4, 5; 4 infantry dots each (2026-10-18: twice the 8, 16; 2026-10-20: a quarter) */
      const gNear = f => gates.reduce((b, g) => Math.hypot(f.pos.x - g.pos.x, f.pos.z - g.pos.z) < Math.hypot(f.pos.x - b.pos.x, f.pos.z - b.pos.z) ? g : b);
      r.btSym = bt.every(f => { const g = gNear(f), d = Math.hypot(f.pos.x - g.pos.x, f.pos.z - g.pos.z); return d > 20 && d < 70 && f.infN === 4; }) && gates.map(g => bt.filter(f => gNear(f) === g).length).join() === '5,4,5';
      r.btRange = bt.every(f => f.range === 240 && f.every === 36);
      /* 2026-10-18 (user decision: wider, then wider again): the guns reach down to 20 degrees over the rock's face, not to 15 */
      { const g = bt[0], at = d => g.pos.clone().addScaledVector(g.pit.up, Math.sin(d * Math.PI / 180) * 50).addScaledVector(new THREE.Vector3(1, 0, 0).addScaledVector(g.pit.up, -g.pit.up.x).normalize(), Math.cos(d * Math.PI / 180) * 50);
        r.gunEl = pitCan(g, { pos: at(25) }) && !pitCan(g, { pos: at(15) }); }
      /* a ship heading over the base is put back outside the rock (the body's centre is off the field) */
      const me = mine[0], p0 = me.pos.clone(); me.pos.set(0, -60, 160); keepOffBody(me); r.pushed = me.pos.distanceTo(bodyC) >= bodySurface(me.pos, op.body.r) + 2.4; me.pos.copy(p0);
      /* 2026-10-13: the gun hunters (prey:'battery', 2026-10-16: one on each side, let go in turn) go for a gun on the base first; the first gun
         lost is not told. Craft leave a fleet marked preyLast for when nothing else is in reach */
      const hunters = op.events.filter(e => e.fleet && e.fleet.prey === 'battery').map(e => e.fleet);
      r.preyOps = hunters.length >= 5 && hunters.every(f => f.type === 'cl' && f.ai === 'guard' && op.events.some(e => e.ai && e.ai.ai === 'hunt' && e.ai.fleets.includes(f.name)));
      const esc = makeFleet(1, { name: '試験 護衛', sub: '', type: 'cl', n: 2, hp: 999, dmg: 0, eva: 0, range: 20, speed: 0, scale: 1, pos: [0, 60], alt: 0, ai: 'hunt', prey: 'battery', vis: 6, stl: 4 });
      fleets.push(esc); bt.forEach(f => { f.seen = true; }); me.seen = true; me.pos.set(0, 0, 55); enemyAI(); r.battery = !!(esc.order && esc.order.target && esc.order.target.fixed); me.pos.copy(p0);
      const said = [], logE = logEvent; logEvent = (a, b) => { said.push(a + b); logE(a, b); };
      const g0 = bt[0]; damage(g0, g0.hpPool + 1, esc); r.gunLog = !said.some(t => t.includes('砲台がやられました'));   // the line was removed (user decision 2026-10-14)
      esc.alive = false; esc.el.remove();
      const ally = (name, z, last) => { const a = makeFleet(0, { name, sub: '', type: 'cl', n: 2, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [0, z], alt: 0, ally: true, preyLast: last, vis: 6, stl: 4 }); a.seen = true; fleets.push(a); return a; };
      const near = ally('試験 最後', -100, true), farA = ally('試験 先', -112, false);
      const cv = makeFleet(1, { name: '試験 揚陸', sub: '', type: 'mas', n: 1, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [0, -90], alt: 0, hangar: { was: 10 }, vis: 6, stl: 4 });
      r.craftPick = craftTarget(cv, 'was', 30) === farA; farA.alive = false; r.craftOnly = craftTarget(cv, 'was', 30) === near;
      [near, farA].forEach(a => { a.alive = false; a.el.remove(); }); cv.el.remove();
      /* a battery fires one heavy shot every 64 s, each gun's shot sinking a corvette (user decision 2026-10-17: a corvette researched to the end, 11 hit points × HP_K, evasion .36) */
      const gun = bt[3], tgt = makeFleet(1, { name: '試験 的', sub: '', type: 'dd', n: 1, hp: 1e6, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [gun.pos.x, gun.pos.z - 40], alt: gun.pos.y + 30, vis: 9, stl: 0 });
      tgt.seen = true; fleets.push(tgt); gun.shotT = 0; const hits = [], dmg0 = damage; let i = 0;
      damage = (t, a, src) => { if (src === gun && t === tgt) hits.push([i, a]); return dmg0(t, a, src); };
      for (; i < 1400; i++) { gun.fireTarget = tgt; gun.retarget = 99; step(.05); }
      damage = dmg0; r.shots = hits.length; r.shotGap = hits.length > 1 ? (hits[1][0] - hits[0][0]) * .05 : 0; r.shotPer = hits.length ? hits[0][1] / gun.ships.length : 0; r.corvette = r.shotPer * (1 - .36) >= 11 * HP_K;
      tgt.alive = false; tgt.el.remove();
      /* one field over the whole base (2026-10-16): it does not move, it is larger, the move orders reach further, and a fleet cannot leave it.
         No stages: 前衛 → 全線 (at 100 minutes, with the goal panel's line) → 総攻撃. Deployed in front of the middle only */
      r.field = !op.phases && fieldC.x === 0 && fieldC.z === 120 && FIELD_R === 480 && REACH === 465 && controls.maxDistance === 720 && gridMat.uniforms.uR.value === 480 && ALT_MAX === 90 && phaseName === '前衛'
        && op.deployZone.r === 60 && !op.events.some(e => e.fleet && e.fleet.fallBack);
      const far = mine[1], fp = far.pos.clone(); far.pos.set(0, 0, 120 - 520); step(.05); r.kept = Math.abs(Math.hypot(far.pos.x, far.pos.z - 120) - 480) < .5; far.pos.copy(fp);
      const said0 = said.length; gameSec = 100.01 / CLOCK_RATE; step(.05);
      r.allLine = phaseName === '全線' && stageText.startsWith('押されている方面へ') && said.slice(said0).some(t => t.includes('本隊、東の端から'));
      /* a line (press) holds its post at the edge and moves it on toward its goal: slowly under a gun, fast where none covers it, not at all
         while our ships round it are 1.5 times its own */
      const ln = fleets.find(f => f.name === '第15 重巡洋 エスカドラ'), G0 = ln.post.clone();
      r.pressAt = ln.ai === 'guard' && Math.hypot(G0.x - 100, G0.z + 51) < 1 && G0.y === 5;   // 2026-10-18: the line's posts stand north of the allied line
      const others = fleets.filter(f => f.team === 0 && !f.fixed && f.alive), keepY = others.map(f => f.pos.y); others.forEach(f => { f.pos.y += 600; });   // nobody of ours near
      const gunE = bt[6], P = gunE.pos.clone().add(new THREE.Vector3(0, 70, -30)), goalP = new THREE.Vector3(131, -25, 145);
      ln.post.copy(P); enemyAI(); const v1 = P.distanceTo(ln.post);   // under the gun
      const gunsOff = bt.map(f => f.alive); bt.forEach(f => { f.alive = false; }); ln.post.copy(P); enemyAI(); const v2 = P.distanceTo(ln.post);   // no gun left
      r.press = v1 > 0 && v2 > v1 * 3 && ln.post.distanceTo(goalP) < P.distanceTo(goalP);
      const wall = makeFleet(0, { name: '試験 壁', sub: '', type: 'cl', n: 12, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [ln.post.x, ln.post.z], alt: ln.post.y, vis: 1, stl: 9 }); fleets.push(wall);
      const G2 = ln.post.clone(); enemyAI(); r.held = ln.pressHeld && ln.post.equals(G2); wall.alive = false; wall.el.remove();
      bt.forEach((f, i) => { f.alive = gunsOff[i]; }); others.forEach((f, i) => { f.pos.y = keepY[i]; }); ln.post.copy(G0); ln.pressFrom.copy(G0);
      /* the fronts (2026-10-16): the east end pressed (the lines there have come far) is told by its commander and summed up by Haddad;
         not again soon, unless it gets worse */
      const Fe = fronts.find(F => F.name === '東の端'), lines = fleets.filter(f => f.alive && f.team === 1 && f.press && f.ai === 'guard' && f.pressGoal && f.pressGoal.x > 90);
      Object.assign(Fe, { level: 0, pend: 0, lastLv: 0, saidLv: 0, said: -1e9, calmT: null });
      const keepP = lines.map(f => f.post.clone()); lines.forEach(f => f.post.lerp(f.pressGoal, .5)); frontSaidT = -1e9; const s1 = said.length; stepFronts();
      r.front = Fe.level === 1 && Fe.cause === 'line' && said.slice(s1).some(t => t.startsWith('第4 主力戦艦 打撃群 大佐')) && said.slice(s1).some(t => t === 'ハッダード曹長「東の端が押されています。敵の列がゲートへ寄ってきます」');
      frontSaidT = -1e9; Fe.level = 0; const s2 = said.length; stepFronts(); r.frontQuiet = Fe.level === 1 && said.length === s2;
      lines.forEach(f => f.post.lerp(f.pressGoal, .9)); frontSaidT = -1e9; stepFronts(); r.frontWorse = Fe.level === 2 && said.slice(s2).some(t => t.includes('東ゲートが持ちません'));
      lines.forEach((f, i) => f.post.copy(keepP[i]));
      /* an enemy with nothing else in reach fires on the nearest gate's shield; the W.A.S. with nothing else go for it too; fewer infantry
         as it goes down. A hunting unit with nothing in sight closes on the gate by its watch point */
      const sh = makeFleet(1, { name: '試験 削る', sub: '', type: 'cl', n: 3, hp: 999, dmg: 1, eva: 0, range: 20, speed: 0, scale: 1, pos: [W.pos.x, W.pos.z], alt: W.pos.y + 14, ai: 'hunt', vis: 1, stl: 9 }); fleets.push(sh);
      const ours = fleets.filter(f => f.team === 0), seenK = ours.map(f => f.seen); ours.forEach(f => { f.seen = false; });   // nothing of ours in sight
      sh.pos.copy(W.pos).addScaledVector(W.up, 14); r.shieldPick = fireTargetOf(sh) === W;
      const wc = makeFleet(1, { name: '試験 W.A.S.', sub: '', type: 'mas', n: 1, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [0, 0], alt: 0, hangar: { was: 10 }, vis: 1, stl: 9 });
      wc.pos.copy(C.pos).addScaledVector(C.up, 20); r.wasPick = craftTarget(wc, 'was', 30) === C; wc.el.remove();
      const hw = makeFleet(1, { name: '試験 待つ', sub: '', type: 'dd', n: 1, hp: 999, dmg: 0, eva: 0, range: 15, speed: 9, scale: 1, pos: [150, -200], alt: 0, ai: 'hunt', watch: { pos: [150, 150], alt: 0 }, vis: 1, stl: 9 }); fleets.push(hw);
      enemyAI(); r.gateWatch = !!(hw.order && hw.order.type === 'move' && Math.hypot(hw.order.dest.x - E.pos.x, hw.order.dest.z - E.pos.z) < 20); hw.alive = false; hw.el.remove();
      const hp0 = W.hp; damage(W, W.max * .5, sh); stepBase(.05); r.worn = W.hp < hp0 && Math.abs(W.inf - 9) <= 1 && !W.sealed && said.some(t => t.includes('西ゲートのシールド、残り半分'));
      /* the infantry fire on a W.A.S. near their gate, weakly */
      const wg = { kind: 'wing', team: 1, type: 'was', id: 9999, alive: true, seen: true, n: 4, hp: 24, hpPool: 96, eva: 0, pos: W.pos.clone().addScaledVector(W.up, 6), ships: [], squad: {} };
      wings.push(wg); for (let i = 0; i < 20; i++) stepBase(.05); r.infHit = wg.hpPool < 96 && wg.hpPool > 90; wg.alive = false;
      /* the west gate breached: it is blown shut (not the last), its infantry go in, and both sides draw off to the gates left */
      /* an allied unit holding by the west gate (2026-10-18: the line stands far forward now, so a test one) */
      const am = makeFleet(0, { name: '試験 ゲートの守り', sub: '', type: 'cl', n: 2, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [W.pos.x, W.pos.z - 25], alt: W.pos.y + 10, ally: true, vis: 6, stl: 4 }); am.ward = true; fleets.push(am); const amPost = am.post.clone();
      const ld = makeFleet(1, { name: '試験 揚陸艦', sub: '突撃揚陸艦', type: 'mas', n: 4, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [W.ring.x, W.ring.z], alt: W.ring.y, ai: 'land', drop: '西ゲート', vis: 1, stl: 9 }); fleets.push(ld);
      const wt = makeFleet(1, { name: '試験 見張り', sub: '', type: 'dd', n: 1, hp: 999, dmg: 0, eva: 0, range: 15, speed: 0, scale: 1, pos: [-150, 0], alt: 0, ai: 'hunt', watch: { pos: [-170, 150], alt: 0 }, vis: 1, stl: 9 }); fleets.push(wt);
      /* a line pressing on the west gate (press) goes on to the gate left too (2026-10-17 夜: it sat at the sealed gate) */
      const pl = makeFleet(1, { name: '試験 列', sub: '', type: 'cl', n: 1, hp: 999, dmg: 0, eva: 0, range: 15, speed: 0, scale: 1, pos: [-170, 100], alt: 0, ai: 'guard', postAt: [-170, 100], press: { goal: [-165, 150, 0] }, vis: 1, stl: 9 }); fleets.push(pl);
      pressPost(pl); const plGoal = pl.pressGoal.clone(), plPost = pl.post.clone();
      damage(W, W.hp + 1, sh); stepBase(.05);
      r.lineOn = Math.abs(pl.pressGoal.x - plGoal.x - (C.pos.x - W.pos.x)) < 1 && Math.abs(pl.post.x - plPost.x - (C.pos.x - W.pos.x)) < 1; pl.alive = false; pl.el.remove();
      r.sealed = W.sealed && !W.alive && !over && W.inf === 0 && said.some(t => t.includes('西ゲートが破られた')) && W.look.state === 'sealed';
      r.drawOff = Math.abs(am.post.x - amPost.x - (C.pos.x - W.pos.x)) < 1 && dropFor(ld) === C && Math.abs(wt.watchPos.x - (-170 + C.pos.x - W.pos.x)) < 1; am.alive = false; am.el.remove();
      r.notShot = fireTargetOf(sh) !== W; ours.forEach((f, k) => { f.seen = seenK[k]; });
      stepFronts(); r.frontShut = fronts[0].closed;   // the west gate sealed closes the west end's front
      /* the middle gate breached too: the east gate is the last; its shield gone, it stays open, and the assault ships by it wear the garrison down */
      damage(C, C.hp + 1, sh); damage(E, E.hp + 1, sh); stepBase(.05);
      r.last = C.sealed && !E.sealed && E.breached && !over && said.some(t => t.includes('最後のゲート、東ゲート'));
      /* only the W.A.S. wear it down (user decision 2026-10-17 夜): the assault ships by it put theirs in, one from each ship every G.every minutes,
         G.was each; a ship with none aboard does nothing */
      const GA = op.base.garrison, aboard = f => f.hangars.reduce((s, h) => s + h.reserve + h.squads.reduce((t, q) => t + (q.state === 'docked' ? q.n : 0), 0), 0);
      ld.dropAt = null; ld.pos.copy(E.ring); const g00 = garrison.hp; for (let i = 0; i < 20; i++) stepBase(.05); const d0 = g00 - garrison.hp;   // no W.A.S. aboard
      ld.hangars = makeHangars({ was: 300 }); ld.putAcc = 0; const a0 = aboard(ld), g0h = garrison.hp; for (let i = 0; i < 20; i++) stepBase(.05); const d1 = g0h - garrison.hp, put1 = a0 - aboard(ld);
      const ld2 = makeFleet(1, { name: '試験 揚陸艦2', sub: '突撃揚陸艦', type: 'mas', n: 4, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, hangar: { was: 300 }, pos: [E.ring.x, E.ring.z], alt: E.ring.y, ai: 'land', vis: 1, stl: 9 }); fleets.push(ld2);
      ld2.pos.copy(E.ring); ld.putAcc = 0; const g1h = garrison.hp; for (let i = 0; i < 20; i++) stepBase(.05); const d2 = g1h - garrison.hp;
      const want = Math.floor(4 * CLOCK_RATE / GA.every);   // one battle second
      /* the assault ships by a gate do not stop on one point (2026-10-18): each its own spot, inside the ring */
      { const sp = [0, 1, 2, 3].map(k => { const f = makeFleet(1, { name: '試験 散開' + k, sub: '', type: 'mas', n: 1, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [E.pos.x, E.pos.z - 80], alt: 0, ai: 'land', drop: '東ゲート', vis: 1, stl: 9 }); landAI(f); f.el.remove(); return f.order && f.order.dest; });
        let md = 1e9; sp.forEach((a, i) => sp.forEach((b, j) => { if (i < j) md = Math.min(md, a.distanceTo(b)); }));
        r.spread = sp.every(p => p && p.distanceTo(E.ring) <= E.r && p.distanceTo(E.ring) > 3) && md > 3; }
      /* Alvarez's two (2026-10-18, user decision; 2026-10-21 both hunt, named 試験強襲 of the Advanced Equipment Development Bureau): they hunt on the front line (prey:'front'): the nearest of
         our ships north of the gates, not one by the gates, and its W.A.S. are not counted as able to take the base */
      { const ev = [...op.events, ...op.win.surge.events].map(e => e.fleet).filter(Boolean), a7 = ev.find(f => f.name.startsWith('第7 試験強襲')), a8 = ev.find(f => f.name.startsWith('第8 試験強襲'));   // 2026-10-23: they come at 全線 (op.events)
        const w0 = wasLeft(), hn = makeFleet(1, { name: '試験 敵狩り', sub: '', type: 'mas', n: 1, hp: 999, dmg: 0, eva: 0, range: 15, speed: 0, scale: 1, pos: [420, 110], alt: 80, ai: 'hunt', prey: 'front', watch: { pos: [0, -38], alt: 40 }, hangar: { was: 40 }, vis: 1, stl: 9 }); fleets.push(hn);
        const mk = z => { const a = makeFleet(0, { name: '試験 的' + z, sub: '', type: 'cl', n: 1, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [420, z], alt: 80, ally: true, vis: 6, stl: 4 }); a.seen = true; a.ward = true; fleets.push(a); return a; };
        const byGate = mk(115), onFront = mk(60); enemyAI();   // off at the east edge, away from the rest: the one by the gates (z over FRONT_LINE) is nearer
        r.hunter = [a7, a8].every(a => a.ai === 'hunt' && a.prey === 'front' && !a.drop && a.ace && a.sub.startsWith('惑星先進装備開発局')) && hn.order && hn.order.target === onFront && wasLeft() === w0;
        [hn, byGate, onFront].forEach(f => { f.alive = false; f.el.remove(); }); }
      r.drain = garrison.max === 2000 && Math.abs(gates[0].max - op.base.shield * HP_K) < 1e-6 && GA.was === 5 && d0 === 0 && put1 >= want && put1 <= want + 1 && d1 === put1 * GA.was && Math.abs(d2 - 2 * d1) <= 2 * GA.was;
      updateGoal(); const gx = document.getElementById('goalGates'); r.goal = !gx.hidden && gx.textContent.includes('閉鎖') && gx.textContent.includes('基地守備隊') && !goalSub.textContent.includes('降下点');
      /* 2026-10-18: the panel shows the gates and the garrison only, and keeps them when folded */
      r.goalFold = (() => { goalEl.classList.add('fold'); const v = getComputedStyle(gx).display !== 'none', g = getComputedStyle(goalBar.parentNode).display === 'none' && getComputedStyle(goalText).display === 'none'; goalEl.classList.remove('fold'); return goalEl.classList.contains('gonly') && v && g; })();
      logEvent = logE;
      /* the garrison worn to 0: the operation is lost */
      let n = 0; while (!over && n++ < 4000) stepBase(.05);
      r.lost = over && !outcome && loseWhy === 'garrison' && document.getElementById('rp').textContent.includes('基地守備隊が力尽きた');
      sh.el.remove(); return r; });
    check(f1.field && f1.kept && f1.allLine, 'フェブルアーリア防衛戦: 作戦フィールドは基地全体を覆う1つ（中心 [0,120]、半径480、クリックは465まで、上下±90。2026-10-18）で動かず、艦はその外へ出られない。段階はなく、100分に「全線」（2026-10-16）', JSON.stringify(f1));
    check(f1.pressAt && f1.press && f1.held, 'フェブルアーリア防衛戦: 敵の列は傘の縁の持ち場からゲートの前へ寄る。砲台の届かない所では速く、こちらが数で勝つ所では止まる（押し込み。2026-10-16）', JSON.stringify(f1));
    check(f1.front && f1.frontQuiet && f1.frontWorse && f1.frontShut, 'フェブルアーリア防衛戦: 押されている方面を、方面の指揮官とハッダード曹長が知らせる。すぐには繰り返さず、崩れかけたら言う。塞いだゲートの方面は閉じる（2026-10-16）', JSON.stringify(f1));
    check(f1.op === 'februaria' && f1.bb && f1.allies === 27 && f1.bt === 14 && f1.onRock && f1.centre && f1.sky && f1.pushed,
      'フェブルアーリア防衛戦: 戦艦が自軍の一覧の最後に出て、友軍27隊（2026-10-18 の兵力の見直し: 280隻）と地表の砲台14基がある。天体の中心は南の枠の外で、艦はその表面の外へ押し出される。背景に地球が出る', JSON.stringify(f1));
    check(f1.gates === '西ゲート・中央ゲート・東ゲート' && f1.sym && f1.onFloor && f1.inf && f1.btSym,
      'フェブルアーリア防衛戦: 総基地の3つのゲート（中央が岩の真ん中、西と東が左右へ約160）がクレーターの底にあり、まわりに強化歩兵の点が18ずつ。砲台はゲートのそば（西5・中央4・東5）で、強化歩兵の点が4ずつ守る（2026-10-17、数は 2026-10-18 に2倍、2026-10-20 に点を4分の1・1点を4倍）', JSON.stringify(f1));
    check(f1.preyOps && f1.battery && f1.gunLog, 'フェブルアーリア防衛戦: 砲台狩りの重巡洋艦は縁で待ち、時刻で放たれて地表の砲台を先に狙う（2026-10-13・16）。砲台が沈んだときの通信は出ない（2026-10-14 に消した）', JSON.stringify(f1));
    check(f1.btRange && f1.gunEl && f1.shots >= 2 && Math.abs(f1.shotGap - 36) < .11 && f1.corvette, 'フェブルアーリア防衛戦: 地表の砲台は射程240、36秒ごとに1発、仰角20度から（1門の1発でコルベット1隻を沈める。2026-10-17、射程・間隔・仰角は 2026-10-18）', JSON.stringify(f1));
    check(f1.craftPick && f1.craftOnly, '小型機: 艦載機と W.A.S. は preyLast の艦隊をほかに狙えるものがないときだけ狙う（2026-10-13）', JSON.stringify(f1));
    check(f1.shieldPick && f1.wasPick && f1.gateWatch && f1.worn && f1.infHit, 'フェブルアーリア防衛戦: ほかに届く敵がいなければ、敵の艦も W.A.S. も近いゲートのシールドを撃つ。強化歩兵は W.A.S. を弱く撃ち、シールドが減ると点も減る（2026-10-16）', JSON.stringify(f1));
    check(f1.sealed && f1.drawOff && f1.lineOn && f1.notShot, 'フェブルアーリア防衛戦: 最後でないゲートが破られると中を爆破して塞ぎ、友軍の持ち場・敵の狙う先と押し込みの列の行き先が残りのゲートへ移る（2026-10-16、列は 2026-10-17 夜）', JSON.stringify(f1));
    check(f1.spread && f1.hunter, 'フェブルアーリア防衛戦: ゲートの輪の突撃揚陸艦は1点に集まらず、輪の中で散らばる。アルバレス隊は第7が中央ゲートへ、第8が前線で敵狩り（2026-10-18）', JSON.stringify(f1));
    check(f1.last && f1.drain && f1.goal && f1.goalFold && f1.lost, 'フェブルアーリア防衛戦: 最後のゲートのシールドが尽きると、そばの揚陸艦が積んだ W.A.S. を1機ずつ降ろし、W.A.S. だけが基地守備隊（耐久1000、1機で5）を削る。シールドは1ゲートのデータの値×耐久の倍率（2026-10-19 から倍率は第4節と同じ2）。0で負け。任務欄に3つのゲートと守備隊（2026-10-16、2026-10-17 夜）', JSON.stringify(f1));
    await page.waitForTimeout(2200); await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
    await page.click('#toMenu');
    await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]');
    await page.click('#goBattle'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {});
    await page.click('#deployGo').catch(() => {});
    /* falling back (user decision 2026-10-17 夜): with no order, a fleet that outranges its foe backs off at half speed, bow on the foe, firing in
       full; one that outranges an attacker of ours does not run off faster than ours can follow; fire over the stern is a quarter */
    const fb = await page.evaluate(() => {
      const keep = fleets.splice(0, fleets.length), r = {}, g0 = gameSec, st = dt => { gameSec = g0; step(dt); };   // the clock held: no event comes
      const mk = (team, o) => { const f = makeFleet(team, { sub: '', n: 3, hp: 1e5, dmg: 1, eva: 0, scale: 1, alt: 0, vis: 30, stl: 0, ...o }); f.seen = true; fleets.push(f); return f; };
      const e = mk(1, { name: '試験 巡洋', type: 'cl', range: 20, speed: 8, pos: [0, 0], ai: 'hunt' }), m = mk(0, { name: '試験 フリゲート', type: 'ff', range: 13, speed: 8, pos: [0, 40] });
      order(m, { type: 'attack', target: e }); for (let i = 0; i < 600; i++) { e.order = { type: 'attack', target: m }; st(.05); }
      _v.subVectors(m.pos, e.pos); r.caught = _v.length() < 13; r.bowOn = e.heading.dot(_v.normalize()) > .9;
      fleets.length = 0; const a = mk(0, { name: '試験 a', type: 'ff', range: 13, speed: 8, pos: [0, 0] }), b = mk(1, { name: '試験 b', type: 'dd', range: 5, speed: 0, pos: [0, 8] });
      a.heading.set(0, 0, -1); const hits = [], d1 = damage; damage = (t, x, s) => { if (s === a) hits.push(x); return d1(t, x, s); };
      for (let i = 0; i < 5; i++) { a.fireTarget = b; a.retarget = 9; a.order = { type: 'move', dest: new THREE.Vector3(0, 0, -200) }; st(.05); }
      const rear = hits[hits.length - 1]; a.order = null; a.pos.set(0, 0, 0);
      for (let i = 0; i < 60; i++) { a.fireTarget = b; a.retarget = 9; st(.05); } const front = hits[hits.length - 1]; damage = d1;
      r.rear = Math.abs(rear / front - .25) < 1e-6;
      a.pos.set(0, 0, 0); const p0 = a.pos.clone(); st(.05); r.back = Math.abs(a.pos.distanceTo(p0) / .05 / speedOf(a) - .5) < .01 && a.pos.z < 0;
      fleets.length = 0; keep.forEach(f => fleets.push(f)); [e, m, a, b].forEach(f => f.el.remove()); gameSec = g0;
      return r;
    });
    check(fb.caught && fb.bowOn && fb.rear && fb.back, '後退: 命令なしで射程が上回る隊は、艦首を相手に向けたまま半分の速さで下がり（追えば追いつける）、後ろ方向への攻撃は前の25%（2026-10-17 夜）', JSON.stringify(fb));
    /* 2026-10-18: the guns on the base are small squares with a dot, their names hidden until selected; the enemy falls back once its
       W.A.S. (aboard and still to come) are too few to wear the garrison down (garrison.hp / garrison.was) */
    const ws = await page.evaluate(() => {
      const r = {}, bt = fleets.filter(f => f.pit);
      r.icon = bt.length === 14 && bt.every(f => f.el.classList.contains('gun') && f.el.querySelector('.emb rect') && getComputedStyle(f.el.querySelector('.flag')).display === 'none');
      /* 2026-10-18: the W.A.S. (× garrison.was) and the armoured infantry (× garrison.troop) together; no share of the main force */
      const GA = op.base.garrison, cap = () => wasLeft() * GA.was + troopsLeft() * GA.troop; r.need = garrison.hp; r.left = wasLeft(); r.troops = troopsLeft(); r.cap = cap();
      r.start = !wasShort() && r.cap >= garrison.hp && troopsLeft() > 0 && !op.win.share && op.win.wasShort && GA.hp === 2000 && GA.troop > 0;
      const ne = nextEvent, su = surged, keep = fleets.filter(f => f.team === 1).map(f => f.hangars.map(h => [h.reserve, h.squads.map(q => q.n)]));
      nextEvent = opEvents.length; surged = true; fleets.filter(f => f.team === 1).forEach(f => f.hangars.forEach(h => { h.reserve = 0; h.squads.forEach(q => { q.n = 0; }); }));
      r.short = wasShort();
      fleets.filter(f => f.team === 1).forEach((f, i) => f.hangars.forEach((h, k) => { h.reserve = keep[i][k][0]; h.squads.forEach((q, m) => { q.n = keep[i][k][1][m]; }); }));
      nextEvent = ne; surged = su; r.back = wasLeft() === r.left;
      return r; });
    check(ws.icon && ws.start && ws.short && ws.back, 'フェブルアーリア防衛戦: 地表の砲台は小さな四角に点のアイコン（名札は選んだときだけ）。敵の W.A.S. と強化歩兵（乗っている分とこれから来る分）で基地守備隊（2000）を削りきれなくなると勝ち。主力の6割では勝たない（2026-10-18）', JSON.stringify(ws));
    const f2 = await page.evaluate(() => {
      /* the all-out attack (13:30, or 3割 of the main force sunk first): the lines all come on (hunt), Alvarez's unit comes down from above on the
         middle gate (its W.A.S. 1.5 times the others', the reach as it is: 2026-10-16), repaired frigates from the yard join at the end of our list
         (outside any army group, an event's given), and Wong's battleships move up in front of the middle */
      const n0 = fleets.filter(f => f.team === 0 && !f.ward).length, SG = op.win.surge; gameSec = (SG.at - .2) / CLOCK_RATE; step(.05); const early = !surged;   // one step is about .03 minutes
      gameSec = SG.at / CLOCK_RATE; step(.05); gameSec = (SG.at + 1.02) / CLOCK_RATE; step(.05);
      const mine = fleets.filter(f => f.team === 0 && !f.ward), ff = mine[mine.length - 1], w = fleets.find(f => f.name === '第1 主力戦艦 打撃群');
      const r = { given: early && surged && phaseName === '総攻撃' && mine.length === n0 + 1 && ff.name === SG.events.find(e => e.given).given[0].name && !groupOf(ff) && !!ff.btn && rosterEl.contains(ff.btn),
        wong: Math.hypot(w.post.x + 40, w.post.z + 57) < 1, surgeAt: SG.share === .3 && SG.at === 450,
        lines: fleets.filter(f => f.team === 1 && f.alive && f.press).every(f => f.ai === 'hunt') };
      /* 2026-10-20 (user decision): Wong's four and every unit with battleships on the line take posts on the front of the line, no more than two to a place */
      { const bb = fleets.filter(f => f.ally && !f.fixed && f.stack), crowd = f => fleets.filter(x => x !== f && x.ally && x.alive && !x.fixed && Math.hypot(x.post.x - f.post.x, x.post.z - f.post.z) < STACK_R).length;
        const want = fleets.filter(f => f.ally && !f.fixed && (f.type === 'bb' || f.comp && f.comp.bb));
        r.bbLine = bb.length === 8 && want.length === 8 && want.every(f => bb.includes(f)) && bb.every(f => f.post.z < 0 && f.stack === 2 && f.gateFirst && crowd(f) < 2); }
      /* 2026-10-20 (user decision): the Bureau's fleets are 1.25 times the stage's Republic values (ships and W.A.S.), their W.A.S. hitting 3 times as hard */
      const ace = fleets.filter(f => f.ace && f.alive), A = WOS_DATA.sides.mars.ace, plain = techFleet(1, { type: 'mas', hangar: { was: 1 } }), PC = plain.craft.was, AC = ace.length && ace[0].craft.was, near = (x, y) => Math.abs(x - y) < 1e-9;
      r.ace = ace.length === 2 && ace.every(f => f.prey === 'front' && f.ai === 'hunt' && !f.drop && f.hangars[0].reserve + f.hangars[0].squads.reduce((s, q) => s + q.n, 0) === 80)   // 2026-10-18: 第7 to the middle gate, 第8 hunts on the front line (2026-10-20: 80 W.A.S. each)
        && near(AC.hp, PC.hp * A.ship) && near(AC.eva, PC.eva * A.ship) && near(AC.dmg, PC.dmg * A.wasDmg) && AC.speed === A.ship && AC.range === A.ship
        && A.hp === 1.5 && near(ace[0].hp, plain.hp * A.hp * HP_K) && near(ace[0].dmg, plain.dmg * A.ship) && near(ace[0].range, plain.range * A.ship)
        && near(ace[0].speed, plain.speed * A.ship * SPEED_K) && near(ace[0].eva, plain.eva * A.ship);
      const e1 = makeFleet(1, { name: '試験 敵', sub: '', type: 'dd', n: 1, hp: 999, dmg: 0, eva: 0, range: 15, speed: 0, scale: 1, pos: [ace[0].pos.x, ace[0].pos.z - 10], alt: ace[0].pos.y, vis: 9, stl: 0 });
      const t0 = makeFleet(0, { name: '試験 的', sub: '', type: 'dd', n: 1, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [ace[0].pos.x, ace[0].pos.z + 10], alt: ace[0].pos.y, vis: 9, stl: 0 }); t0.seen = true; fleets.push(t0);
      ace[0].hangars[0].next = 0; ace[0].hangars[0].squads.forEach(q => { q.ready = 0; }); const w0 = wings.length; launchCheck(ace[0]); const aw = wings[wings.length - 1];
      r.aceWas = wings.length > w0 && Math.abs(aw.speed - WING.was.speed * A.ship) < 1e-9 && Math.abs(aw.range - WING.was.range * A.ship) < 1e-9; t0.alive = false; t0.el.remove(); e1.el.remove();
      /* Oliveira's unit, badly hurt, gives ground (retreat) */
      const am = fleets.find(f => f.name === '第10 アマゾン残存 支隊'); am.ships.splice(0, am.ships.length - 1); allyAI(); r.amzBack = !!am.falling && am.post.distanceTo(am.fallTo) < 1;
      /* 2026-10-14: a unit hurt below fallBack (7割) of its ships withdraws into the clouds; its ships left are not counted as sunk, and a later
         event does not send it back in */
      const k0 = mainSunk(), hurt = makeFleet(1, { name: '試験 本隊', sub: '', type: 'cl', n: 5, hp: 30, dmg: 0, eva: 0, range: 20, speed: 9, scale: 1, pos: [-300, -40], alt: 0, ai: 'hunt', main: true, fallBack: .7, vis: 6, stl: 4 });
      fleets.push(hurt); enemyAI(); r.fbKeep = hurt.ai === 'hunt'; hurt.ships.splice(0, 2); enemyAI();
      opEvents.splice(nextEvent, 0, { after: 0, ai: { fleets: ['試験 本隊'], ai: 'hunt' } }); step(.05);
      r.fbBack = hurt.ai === 'withdraw' && hurt.fellBack && Math.abs(mainSunk() - k0 - 2 / mainTotal) < 1e-9;
      hurt.alive = false; hurt.el.remove();
      /* the reserve goes where the defence is thinnest (drops): the open gate among the candidates with the fewest of our ships and the
         allies' within 60 */
      const ours = fleets.filter(f => f.team === 0 && f.alive && !f.fixed), P0 = gates.find(g => g.name === '中央ゲート'), P1 = gates.find(g => g.name === '西ゲート'), keep = ours.map(f => f.pos.clone());
      ours.forEach(f => f.pos.set(P0.pos.x, 0, P0.pos.z + 10)); r.weak1 = weakDrop(['中央ゲート', '西ゲート']) === P1;
      ours.forEach(f => f.pos.set(P1.pos.x, 0, P1.pos.z + 10)); r.weak2 = weakDrop(['中央ゲート', '西ゲート']) === P0;
      const rs = makeFleet(1, { name: '試験 予備', sub: '', type: 'mas', n: 2, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [-150, -300], alt: 0, ai: 'guard', drop: '西ゲート', vis: 1, stl: 9 }); fleets.push(rs);
      const said = [], logE = logEvent; logEvent = (a, b) => { said.push(b); logE(a, b); };
      opEvents.splice(nextEvent, 0, { after: 0, ai: { fleets: ['試験 予備'], ai: 'land', drops: ['中央ゲート', '西ゲート'], log: ['試験', '{drop}へ'] } }); step(.05); logEvent = logE;
      r.weakGo = rs.ai === 'land' && rs.drop === '中央ゲート' && said.includes('中央ゲートへ');
      /* an assault ship that comes in with drops picks the thinnest gate then (2026-10-16) */
      logEvent = (a, b) => { said.push(b); logE(a, b); };
      opEvents.splice(nextEvent, 0, { after: 0, fleet: { name: '試験 揚陸', sub: '', type: 'mas', n: 1, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [0, -300], alt: 0, ai: 'land', drops: ['中央ゲート', '西ゲート'], vis: 1, stl: 9 }, log: ['試験', '揚陸艦{drop}'] }); step(.05); logEvent = logE;
      const sl = fleets.find(f => f.name === '試験 揚陸'); r.spawnDrop = sl.drop === '中央ゲート' && said.includes('揚陸艦中央ゲート'); sl.alive = false; sl.el.remove();
      ours.forEach((f, i) => f.pos.copy(keep[i])); rs.alive = false; rs.el.remove();
      gameSec = op.win.until / CLOCK_RATE; step(.05); return { ...r, over, outcome, by: repelBy, share: op.win.share }; });
    check(f2.given && f2.wong && f2.amzBack && f2.surgeAt && f2.lines && f2.bbLine, 'フェブルアーリア防衛戦: 総攻撃（13:30 か本隊の3割）で列が全部前へ出る。工廠のフリゲートが自軍の一覧の最後に加わり、ウォン中将の4隊と戦線の戦艦の隊が戦線の前へ出る（1か所に2隊まで。2026-10-20）。アマゾン残存隊は損害が大きいと下がる', JSON.stringify(f2));
    /* 2026-10-20 (user decision): the battleships' line (stack:2): a third onto one place goes on to the next; no foe with two others already on it;
       what makes for a gate is met first (gateFirst); the post follows the line to the gate left when the gate in front of it is sealed */
    const sk = await page.evaluate(() => {
      const keep = fleets.splice(0, fleets.length), r = {};
      const ally = (name, x, z, o) => { const f = makeFleet(0, { name, sub: '', type: 'bb', n: 1, hp: 1e5, dmg: 0, eva: 0, range: 15, speed: 0, scale: 1, pos: [x, z], alt: 0, vis: 6, stl: 3, ally: true, leash: 40, ...o }); f.ward = true; f.mode = 'guard'; fleets.push(f); return f; };
      const foe = (name, x, z, ai) => { const f = makeFleet(1, { name, sub: '', type: 'cl', n: 1, hp: 1e5, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [x, z], alt: 0, ai, vis: 9, stl: 0 }); f.seen = true; fleets.push(f); return f; };
      for (let i = 0; i < 7; i++) ally('試験 遠く' + i, -400 + i * 30, 400);   // the rest of the allied force, far off (the share-out counts all of them)
      const a = ally('試験 戦艦a', 0, 0, { stack: 2 }), b = ally('試験 戦艦b', 1, 0, { stack: 2 }), c = ally('試験 戦艦c', 30, 0, { stack: 2 });
      /* the third onto one place moves on to the next */
      c.post.set(0, 0, 0); frontPost(c); r.spread = Math.abs(Math.abs(c.post.x) - STACK_STEP) < 1e-6 && c.post.z === 0; c.post.set(-1, 0, 0);
      const t1 = foe('試験 敵1', 0, -5, 'hunt'), t2 = foe('試験 敵2', 0, -30, 'hunt'); allyAI();
      r.two = a.aim === t1 && b.aim === t1 && c.aim === t2;
      c.stack = 0; c.aim = null; c.order = null; allyAI(); r.free = c.aim === t1;   // without stack the third would go for the near one too
      /* gateFirst: the one making for a gate, a little farther, first */
      [a, b, c, t1, t2].forEach(f => { f.alive = false; f.el.remove(); });
      const g = ally('試験 戦艦g', 0, 0, { stack: 2, gateFirst: true }), h = foe('試験 敵h', 0, -10, 'hunt'), l = foe('試験 揚陸', 0, 12, 'land'); allyAI(); r.gateFirst = g.aim === l;
      /* the gate in front sealed: the post goes across to the front of the gate left */
      const W = gates.find(x => x.name === '西ゲート'), C = gates.find(x => x.name === '中央ゲート'), s0 = W.sealed; W.sealed = true;
      const wl = ally('試験 西の戦艦', -218, -30, { stack: 2 }); frontPost(wl); r.sealed = Math.abs(wl.post.x - (-218 + C.pos.x - W.pos.x)) < 1e-6 && wl.post.z === -30; W.sealed = s0;
      fleets.forEach(f => f.el && f.el.remove()); fleets.length = 0; keep.forEach(f => fleets.push(f));
      return r; });
    /* 2026-10-20 (user decision, after the east of the line stood idle in the second half): a front's line that gives way splits, half (the
       escorts first) round its gate, the rest to a second line halfway back; the gate's guards then take on what works on the shield. One gate
       left: every ally round it, no more than two to a place, the battleships on the outer ring */
    const af = await page.evaluate(() => {
      const lg = lastGate, xz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z), r = {};
      /* the east and west gates guarded from the start (2026-10-20, user decision: two escort units taken from the east wing) */
      { const gd = n => fleets.find(f => f.name === n), G = n => gates.find(g => g.name === n), e = gd('第12 護衛 打撃群'), w = gd('第22 護衛 打撃群');
        const east = op.allies.filter(a => !a.fixed && !a.guardGate && a.pos[0] > 120);   // the east wing (the data's block east of x 120)
        r.guards = e.guardGate === '東ゲート' && w.guardGate === '西ゲート' && [[e, G('東ゲート')], [w, G('西ゲート')]].every(([f, g]) => f.fall === 'gate' && xz(f.home, g.pos) < 80 && f.home.z < g.pos.z && !f.line)
          && east.length === 6 && east.reduce((s, a) => s + a.n, 0) === 35; r.east = [east.length, east.reduce((s, a) => s + a.n, 0)]; }   // 2026-10-21: the front units about halved (100 ships with the Moon's PKO)
      /* the enemy's infantry (2026-10-20): in reach when a man of the group is (not only its centre); the auto mode goes for a group making
         for a gun by a sealed gate too */
      { const E = gates.find(g => g.name === '東ゲート'), t0 = troops.length; troopsOut({ ships: [1], troops: 12, name: '試験 歩兵' }, { p: rockAt(E.pos.x + 30, E.pos.z - 10), gate: E }); const g = troops[troops.length - 1];
        const me = makeFleet(0, { name: '試験 自軍', sub: '', type: 'cl', n: 1, hp: 1e6, dmg: 0, eva: 0, range: 15, speed: 0, scale: 1, pos: [g.pos.x, g.pos.z], alt: 0, vis: 1, stl: 9 }); me.ward = true;
        const far = g.dots[0]; far.set(g.pos.x + 5, 0, g.pos.z); far.y = rockAt(far.x, far.z).y + .3;   // one man 5 out from the centre (a group of few dots may sit tight)
        const out = far.clone().sub(g.pos).setY(0).normalize(); me.pos.copy(far).addScaledVector(out, 10).setY(far.y + 9); fleets.push(me);   // about 13.5 from him, out past him and over
        r.manIn = me.pos.distanceTo(g.pos) > me.range && troopGap(me.pos, g) <= me.range && !bodyBlocks(me.pos, g.pos) && fireTargetOf(me) === g;
        me.pos.y += 20; r.manOut = fireTargetOf(me) !== g;
        const ov = over, am = autoMode, s0 = E.sealed, ord = fleets.filter(f => f.team === 1 && f.alive), mine = () => fleets.filter(f => f.team === 0 && f.alive && !f.ward && !f.ally && !f.fixed && !f.isCarrier);
        ord.forEach(f => { f.alive = false; }); over = false; autoMode = true; E.sealed = true; g.goal = troopGoal(g, op.base.troops); mine().forEach(f => { f.order = null; }); autoAI();
        r.autoSealed = g.goal && g.goal.kind === 'fleet' && mine().length > 0 && mine().every(f => f.order && f.order.target === g);
        ord.forEach(f => { f.alive = true; }); over = ov; autoMode = am; E.sealed = s0; mine().forEach(f => { f.order = null; });
        me.alive = false; me.el.remove(); fleets.splice(fleets.indexOf(me), 1); troops.length = t0; }
      const keep = fleets.splice(0, fleets.length);
      const ally = (name, x, z, o) => { const f = makeFleet(0, { name, sub: '', type: 'cl', n: 4, hp: 1e5, dmg: 0, eva: 0, range: 15, speed: 0, scale: 1, pos: [x, z], alt: 0, vis: 6, stl: 3, ally: true, leash: 60, ...o }); f.ward = true; f.mode = 'guard'; fleets.push(f); return f; };
      const E = gates.find(g => g.name === '東ゲート'), C = gates.find(g => g.name === '中央ゲート'), W = gates.find(g => g.name === '西ゲート'), L = fronts.find(F => F.gate === '東ゲート');
      const u = [ally('試験 巡洋1', 150, -20), ally('試験 巡洋2', 180, -20), ally('試験 護衛', 210, -20, { type: 'ff' }), ally('試験 巡洋3', 240, -20)];
      u.forEach(f => { f.frontL = L; }); u[3].ships.splice(0, 2);   // the hurt one goes to the gate with the escort
      const before = u.map(f => f.post.clone()); fallTo(u, E, null);
      const toG = u.filter(f => f.fall === 'gate'), back = u.filter(f => f.fall === 'back'), crowd = f => postsNear(f.post, f) >= 2;
      r.split = toG.length === 2 && toG.includes(u[2]) && toG.includes(u[3]) && toG.every(f => xz(f.post, E.pos) < 80 && f.post.z < E.pos.z)
        && back.every(f => { const i = u.indexOf(f); return f.post.z > before[i].z + 40 && f.post.z < E.pos.z - 40 && f.home.equals(f.post); }) && !u.some(crowd);
      /* an enemy working on the shield, out of the line's old leash: a gate guard goes for it */
      const e = makeFleet(1, { name: '試験 揚陸', sub: '', type: 'mas', n: 1, hp: 1e5, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [E.pos.x, E.pos.z - 20], alt: E.pos.y + 10, ai: 'land', vis: 9, stl: 0 }); e.seen = true; fleets.push(e);
      r.wasOut = before.every(p => p.distanceTo(e.pos) > 60); allyAI(); r.engage = toG.some(f => f.aim === e); e.alive = false; e.el.remove();
      /* one gate left: everyone round it (two to a place at most; the battleships outside, the escorts and the carrier inside) */
      const s0 = [W.sealed, E.sealed]; W.sealed = E.sealed = true; lastGate = null;
      const more = [...Array(14)].map((_, i) => ally('試験 隊' + i, -250 + i * 40, i % 2 ? -50 : 160, { type: ['bb', 'cl', 'ff', 'cl'][i % 4] }));
      const cv = ally('試験 母艦', 0, 170, { type: 'cvb' }), all = [...u, ...more, cv]; lastStand(C);
      const d = f => xz(f.post, C.pos), bb = all.filter(f => f.type === 'bb'), ff = all.filter(f => f.type === 'ff' || f === cv);
      r.last = lastGate === C && all.every(f => f.fall === 'last' && d(f) < 80 && f.post.z < C.pos.z && !crowd(f) && f.home.equals(f.post))
        && Math.min(...bb.map(d)) > Math.max(...ff.map(d));
      W.sealed = s0[0]; E.sealed = s0[1]; lastGate = lg;
      fleets.forEach(f => f.el && f.el.remove()); fleets.length = 0; keep.forEach(f => fleets.push(f));
      return r; });
    check(af.guards, 'フェブルアーリア防衛戦: 東西のゲートには最初から護衛の艦隊（第12・第22、東翼から回した。東翼は6隊35隻。2026-10-21 に戦線を約半分に）がつき、ゲートのまわりに持ち場を取る（2026-10-20）', JSON.stringify(af));
    check(af.manIn && af.manOut && af.autoSealed, 'フェブルアーリア防衛戦: 艦は共和国の強化歩兵を、組の中心でなくいちばん近い1人が射程に入れば撃つ。オートモードは塞がれたゲートのそばでも、砲台へ向かう歩兵へ寄る（2026-10-20）', JSON.stringify(af));
    check(af.split && af.wasOut && af.engage && af.last,'フェブルアーリア防衛戦: 崩れた方面の戦線は半分（護衛と損害の大きい隊から）がゲートのまわり、ほかは持ち場をゲートへ半分寄せる。ゲートの守りはシールドを削る敵を受ける。ゲートが残り一つで友軍すべてがそのまわりへ（1か所に2隊まで、戦艦が外。2026-10-20）', JSON.stringify(af));
    check(sk.spread && sk.two && sk.free && sk.gateFirst && sk.sealed,'フェブルアーリア防衛戦: 総攻撃の戦艦は1か所に2隊まで（3隊目は横の次の場所へ）、同じ敵へ向かうのも2隊まで。ゲートへ向かう敵を先に受け、前のゲートが塞がれると残りのゲートの前へ移る（2026-10-20）', JSON.stringify(sk));
    check(f2.ace && f2.aceWas, 'フェブルアーリア防衛戦: アルバレス隊は真上から（第7は中央ゲートへ、第8は前線で敵狩り。2026-10-18）。艦の耐久・打撃と W.A.S. の打撃・耐久は、ほかの共和国の3倍、速さと射程は1.2倍、回避は1.5倍（2026-10-18）', JSON.stringify(f2));
    check(f2.fbKeep && f2.fbBack, 'フェブルアーリア防衛戦: 敵の隊は隻数が7割を切ると雲へ下がり（fallBack）、残りの艦は撃沈に数えない。あとの出来事でも戻らない（2026-10-14）', JSON.stringify(f2));
    check(f2.weak1 && f2.weak2 && f2.weakGo && f2.spawnDrop, 'フェブルアーリア防衛戦: 予備と、出るときに drops を持つ揚陸艦は、候補のゲートのうち、まわりの自軍と友軍がいちばん少ないところへ向かう（2026-10-14・16）', JSON.stringify(f2));
    check(f2.over && f2.outcome && f2.by === 'time' && !f2.share, 'フェブルアーリア防衛戦: 18:00 まで持たせると勝利（主力の6割で勝つのは 2026-10-18 にやめた）', JSON.stringify(f2));
    await page.waitForTimeout(2200); await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
    await page.click('#toMenu');
    const f3 = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.save.v1')).prog);
    check(f3.cleared.includes('februaria') && f3.flags.bb === true, 'フェブルアーリア防衛戦: クリアが記録され、戦艦の兵科が開く', JSON.stringify({ cleared: f3.cleared, flags: f3.flags }));
    /* 2026-10-14: the Republic falls back (2026-10-18: once what it has left cannot take the base): every enemy withdraws (an assault ship by
       the last gate wears the garrison down no more), nothing more comes, and after about 20 s the victory follows */
    await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]');
    await page.click('#goBattle'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {});
    await page.click('#deployGo').catch(() => {});
    const f4 = await page.evaluate(() => {
      gameSec = 300 / CLOCK_RATE; for (let i = 0; i < 4; i++) step(.05);
      const [W, C, E] = gates; gateHit(W, W.hp + 1); gateHit(C, C.hp + 1); gateHit(E, E.hp + 1);
      const lander = makeFleet(1, { name: '試験 揚陸艦', sub: '', type: 'mas', n: 4, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, hangar: { was: 300 }, pos: [E.ring.x, E.ring.z], alt: E.ring.y, ai: 'land', drop: E.name, vis: 1, stl: 9 }); fleets.push(lander);
      lander.pos.copy(E.ring); for (let i = 0; i < 20; i++) step(.05);
      const r = { drain: W.sealed && C.sealed && E.breached && garrison.hp < garrison.max };
      /* what is left to put in falls short of the garrison: no more to come, every other ship empty, the one by the gate with 20 W.A.S. */
      nextEvent = opEvents.length; surged = true; troops = [];
      fleets.filter(f => f.team === 1 && f !== lander).forEach(f => { if (f.ai === 'drop') f.alive = false; f.hangars.forEach(h => { h.reserve = 0; h.squads.forEach(q => { q.n = 0; }); }); });
      lander.hangars.forEach(h => { h.reserve = 20; h.squads.forEach(q => { q.n = 0; }); });
      const said = [], logE = logEvent; logEvent = (a, b) => { said.push(a + b); logE(a, b); }; const ev0 = nextEvent;
      step(.05); logEvent = logE;
      r.retreat = !over && repelBy === 'was' && fleets.filter(f => f.team === 1 && f.alive && !f.fixed).every(f => f.ai === 'withdraw') && said.some(t => t.includes('追うな'));
      const g0 = garrison.hp; for (let i = 0; i < 40; i++) step(.05);
      r.noLand = garrison.hp === g0 && nextEvent === ev0 && stageText === op.win.retreat.text;
      let n = 0; while (!over && n++ < 2000) step(.05);
      r.won = over && outcome && repelBy === 'was'; r.secs = Math.round(n * .05 + 2.05);
      return r; });
    check(f4.drain && f4.retreat && f4.noLand && f4.won && Math.abs(f4.secs - 20) <= 1, 'フェブルアーリア防衛戦: W.A.S. と強化歩兵で守備隊を削りきれなくなると共和国が退き（全部の敵が撃たずに北へ。最後のゲートのそばの揚陸艦も守備隊を削らない）、約20秒あとに勝利（2026-10-14、きっかけは 2026-10-18）', JSON.stringify(f4));
    await page.waitForTimeout(2200); await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/februaria-retreat.png' }).catch(() => {});
    await page.click('#toMenu');
    /* 2026-10-23 (user decision): Alvarez's two come at 全線 with the main force from the north; each goes once its ships' hit points fall
       under 20% of its full (W.A.S. not counted), into the cloud to the north at once, its W.A.S. called home and following it (recall:0:
       it does not wait for them; those not yet home when it is gone go with it. User decision 2026-10-23) (not sunk), and comes again whole at the next landing wave (the second time at the all-out attack); the third time it goes
       under 10% and does not come again. Coming again counts as W.A.S. still to come (wasShort); gone for good counts none */
    await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]');
    await page.click('#goBattle'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {});
    await page.click('#deployGo').catch(() => {});
    const rt = await page.evaluate(() => {
      const r = {}, R = op.rotate.alvarez, at = m => { gameSec = m / CLOCK_RATE; step(.05); }, name = '第7 試験強襲 エスカドラ';
      const said = [], logE = logEvent; logEvent = (a, b) => { said.push(b); logE(a, b); };
      const a7 = () => fleets.find(f => f.alive && f.name === name), was = f => f.hangars[0].reserve + f.hangars[0].squads.reduce((s, q) => s + (q.state === 'out' ? (q.wing && q.wing.alive ? q.wing.n : 0) : q.n), 0);
      const hurt = (f, k) => { f.ships.splice(0, f.ships.length - 1); f.hpPool = f.rot.full * k; };
      const cloudIn = f => { const T = f.rot; enemyAI(); f.pos.copy(T.to.p); enemyAI(); };   // on its way out: put it in its cloud
      at(99.9); r.notYet = !a7() && !surged;
      at(100.01); let f = a7();
      r.first = !!f && f.rot.k === 1 && f.ai === 'hunt' && f.prey === 'front' && f.ace && f.pos.z < -300 && was(f) === 80 && f.ships.length === 4;
      /* not yet under 20%: it stays */
      f.hpPool = f.rot.full * .25; enemyAI(); r.stay = !f.rot.leaving;
      /* a squadron out: called home; the unit does not wait (recall:0) but makes for the cloud at once, its W.A.S. following */
      const t0 = makeFleet(0, { name: '試験 的', sub: '', type: 'dd', n: 1, hp: 999, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [f.pos.x, f.pos.z + 10], alt: f.pos.y, vis: 9, stl: 0 }); t0.seen = true; fleets.push(t0);
      f.hangars[0].next = 0; f.hangars[0].squads.forEach(q => { q.ready = 0; }); launchCheck(f); const w = wings.filter(x => x.alive && x.carrier === f)[0];
      t0.alive = false; t0.el.remove(); fleets.splice(fleets.indexOf(t0), 1);
      const wl0 = wasLeft(); hurt(f, .12); w.pos.x += 300; enemyAI();
      r.noWait = R.recall === 0 && !!w && w.alive && w.state === 'return' && f.rot.leaving && !f.rot.last && f.alive && f.stance === 'evade' && f.order && f.order.type === 'move'
        && f.rot.to && f.rot.to.p.z < -250 && said.includes(R.leaveLog[1]) && wasLeft() === wl0 - was(f) + 80;
      const wl1 = wasLeft(); f.pos.copy(f.rot.to.p); enemyAI();
      r.gone = !f.alive && f.left && !w.alive && w.squad.state !== 'lost' && rotOut.length === 1 && rotOut[0].k === 2 && wasLeft() === wl1 && !a7();
      /* the second time no earlier than the all-out attack */
      r.waitSurge = rotDue(rotOut[0]) === null; at(300); r.stillAway = !a7() && rotOut.length === 1;
      at(op.win.surge.at); f = a7();
      r.second = surged && !!f && f.rot.k === 2 && f.ships.length === 4 && f.hpPool === f.rot.full && was(f) === 80 && f.pos.z < -300 && rotOut.length === 0 && said.includes(R.backLog[1])
        && opEvents.slice(nextEvent).some(e => e.log && e.log[1].includes('赤い W.A.S.') && Math.abs(e.after - surgeMin - 6) < 1e-6);
      /* the next wave after it went: a wave of the all-out attack (surgeWaves), or a time wave after it; none left: `wait` minutes on */
      const P = (k, left) => ({ T: f.rot, k, left });
      r.next = rotDue(P(2, surgeMin + 10)) === surgeMin + 20 && rotDue(P(3, surgeMin + 3)) === surgeMin + 8 && rotDue(P(3, 1000)) === 1000 + R.wait && rotDue(P(2, surgeMin - 50)) === surgeMin;
      hurt(f, .12); cloudIn(f); const due = rotDue(rotOut[0]);
      r.twice = !f.alive && rotOut.length === 1 && rotOut[0].k === 3 && due === surgeMin + R.surgeWaves[0];
      at(due - .05); r.notBack = !a7(); at(due + .01); f = a7();
      r.third = !!f && f.rot.k === 3 && f.ships.length === 4 && was(f) === 80;
      /* the third time: 10%, then gone for good (its W.A.S. no longer counted) */
      hurt(f, .12); enemyAI(); r.hold3 = !f.rot.leaving;
      const wl2 = wasLeft(), w3 = was(f); f.hpPool = f.rot.full * .08; enemyAI();
      r.last = f.rot.leaving && f.rot.last && said.includes(R.lastLog[1]) && wasLeft() === wl2 - w3;
      f.pos.copy(f.rot.to.p); enemyAI(); at(surgeMin + 200);
      r.never = !f.alive && f.left && rotOut.length === 0 && !a7();
      logEvent = logE; gameSec = op.win.until / CLOCK_RATE; step(.05); return r; });
    check(Object.values(rt).every(Boolean), 'フェブルアーリア防衛戦: アルバレス隊は全線で北から出て、艦の耐久が20%を切ると W.A.S. の収容を待たずに北の雲へ下がり（W.A.S. は後を追う）、次の波で全快して戻る（2回目は総攻撃より前に戻らない）。3回目は10%で退き、もう戻らない。戻る隊の W.A.S. はこれから来る分に数え、戻らない隊は数えない（2026-10-23）', JSON.stringify(rt));
    await page.waitForTimeout(2200); await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
    await page.click('#toMenu');
    /* 2026-10-18 (user decision): the landing craft (a new class, the enemy's) set armoured infantry down by a gun; theirs and ours fight it
       out, they wear the gun down once its infantry are gone, wait out of reach of a gate held by more of ours, and go in by the last gate
       once its shield is gone, each man taking garrison.troop off the garrison. They are red dots */
    await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]');
    await page.click('#goBattle'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {});
    await page.click('#deployGo').catch(() => {});
    const lt = await page.evaluate(() => {
      const r = {}, T = op.base.troops, GA = op.base.garrison, [W, C, E] = gates;
      const lcs = [...op.events, ...op.win.surge.events].filter(e => e.fleet && e.fleet.type === 'lc').map(e => e.fleet);
      r.data = lcs.length >= 10 && lcs.every(f => f.ai === 'drop' && f.troops > 0 && (f.drop || f.drops)) && !!SHAPES.lc && SHIP_SIZE.lc < SHIP_SIZE.mas && !WOS_DATA.ships.some(x => x.id === 'lc');
      /* a craft comes down by a gun of the middle gate, sets its infantry down, and leaves */
      const lc = makeFleet(1, { name: '試験 揚陸艇', sub: '', type: 'lc', n: 2, hp: 1e6, dmg: 0, eva: 0, range: 1, speed: 30, scale: .6, troops: 3, pos: [0, 40], alt: 30, ai: 'drop', drop: '中央ゲート', vis: 1, stl: 9 }); fleets.push(lc);
      const n0 = troops.length; let n = 0, sat = false;
      while (n++ < 3000 && !lc.unloaded) { enemyAI(); step(.05); sat = sat || lc.dropState === 'sit'; }
      const g = troops[troops.length - 1], gun = lc.dropTo && lc.dropTo.gun;
      r.landed = sat && lc.unloaded && lc.ai === 'withdraw' && troops.length === n0 + 1 && g.n === 6 && !!gun && Math.hypot(g.pos.x - gun.pos.x, g.pos.z - gun.pos.z) < 16;
      r.dots = g.dots.length === 6 && g.dots.every(p => Math.abs(p.y - rockAt(p.x, p.z).y) < 1);
      /* they go each on his own (2026-10-18, user: not one block sliding along; 見本 B and C: in file, the teams by bounds): the centre walking on, the men do not all shift alike */
      { const p0 = g.dots.map(p => p.clone()), c0 = g.pos.clone(); for (let i = 0; i < 40; i++) { g.pos.x += .2; time += .1; stepTroopMen(g, .1); }   // 4 s: longer than a team's run and lie-down (1.1 + 1.6 s), so every team runs (the bounds go by the clock `time`, which this loop moves on)
        const dv = g.dots.map((p, i) => p.x - p0[i].x), mean = dv.reduce((a, v) => a + v, 0) / dv.length, sd = Math.sqrt(dv.reduce((a, v) => a + (v - mean) ** 2, 0) / dv.length);
        const moved = g.dots.reduce((a, p, i) => a + Math.hypot(p.x - p0[i].x, p.z - p0[i].z), 0) / g.dots.length;   // they fall in behind one another: not all the same way
        r.walk = { moved: +moved.toFixed(2), sd: +sd.toFixed(2) }; r.walkOk = moved > .5 && sd > .3 && g.dots.every(p => Math.abs(p.y - rockAt(p.x, p.z).y) < 3); g.pos.copy(c0); }
      /* 2026-10-18 (user: our infantry guard the guns, the enemy on the move or not, not going far): ours round another gun fire on a group
         passing within its reach that is not at them yet, and lean a little toward it */
      { const gun2 = fleets.filter(f => f.pit && f.pit !== true && f.alive && f !== gun && hxz(f.pos, g.pos) > 60)[0], p = rockAt(gun2.pos.x + 18, gun2.pos.z);
        troopsOut({ ships: [1], troops: 3, name: '試験 通り' }, { p, gate: C }); const h = troops[troops.length - 1], d0 = gun2.pit.inf.pts[0].clone();
        for (let i = 0; i < 10; i++) { stepBase(.05); infLean(gun2.pit.inf, gun2, .05); }
        r.guard = h.lost > 0 && h.foe !== gun2 && gun2.infAim === h && gun2.pit.inf.pts[0].distanceTo(d0) > 0 && gun2.pit.inf.pts[0].distanceTo(gun2.pit.inf.home[0]) <= 3.01;
        troops.splice(troops.indexOf(h), 1); }
      drawTroops(); r.drawn = tpGeo.drawRange.count === troops.reduce((s, x) => s + Math.ceil(Math.min(x.n, x.dots.length)), 0) && tpPts.material.color.getHex() === TEAM_COL[1].getHex();
      /* theirs and ours at the gun: both lose men; with ours gone they wear the gun down */
      const inf0 = gun.inf, hp0 = gun.hpPool; let k = 0; while (k++ < 4000 && gun.inf > 0) stepBase(.05);
      r.fight = inf0 > 0 && gun.inf === 0 && g.n < 6 && g.n > 0;
      const hp1 = gun.hpPool, sh0 = shoot; let fired = 0; shoot = (...a) => { fired++; return sh0(...a); }; for (let i = 0; i < 200; i++) stepBase(.05); shoot = sh0; r.gunHit = gun.hpPool < hp1 && fired > 0;   // 2026-10-18: seen firing on it
      /* a gate held by more of ours: they wait out of its infantry's reach; the gate the last and open: they go in */
      gun.alive = false; fleets.filter(f => f.pit && f.pit !== true).forEach(f => { f.alive = false; });
      g.lost = 0; g.went = 0; g.n0 = g.n = 5; for (let i = 0; i < 600; i++) stepBase(.05);
      r.wait = g.goal === C && C.inf > 5 && Math.hypot(g.pos.x - C.pos.x, g.pos.z - C.pos.z) >= DEF_R.gate && g.n > 0;   // out of its infantry's reach (2026-10-18: they draw back to it)
      /* 2026-10-19 (user decision): the gate's infantry gone, they come on and wear its shield down as they do a gun */
      { const lost0 = C.infLost; C.infLost = 1e6; const hpC = C.hp; let j = 0; while (j++ < 2000 && C.hp >= hpC) stepBase(.05);
        r.gateHit = C.hp < hpC && C.inf === 0 && g.goal === C && g.n > 0; C.infLost = lost0; }
      /* 2026-10-19 (user decision): our ships with no enemy ship in reach fire on the enemy's infantry; an ally with no enemy ship to go for
         closes on the infantry within its leash of its post. op.base.troops.hp a man */
      { const al = makeFleet(0, { name: '試験 友軍', sub: '', type: 'cl', n: 1, hp: 1e6, dmg: 0, eva: 0, range: 16, speed: 0, scale: 1, pos: [g.pos.x, g.pos.z + 30], alt: g.pos.y + 25, vis: 1, stl: 9, ally: true, leash: 60 });
        fleets.push(al); allyAI(); const ordered = !!(al.order && al.order.target === g);
        al.pos.set(g.pos.x, g.pos.y + 8, g.pos.z + 6); const ft = fireTargetOf(al), n0 = g.n; damage(g, 3 * (op.base.troops.hp ?? 10) * HP_K + 1e-6, al);
        r.shipInf = { ordered, fire: ft === g, killed: n0 - g.n }; r.shipInfOk = ordered && ft === g && n0 - g.n === 3;
        /* 2026-10-20 (a quarter of the dots, each four times as strong): a dot's men go one by one (a quarter each); the dot stays drawn till the last */
        { const n2 = g.n; damage(g, .25 * (op.base.troops.hp ?? 40) * HP_K + 1e-6, al); r.quarter = n2 - g.n === .25 && Math.ceil(g.n) === Math.ceil(n2) && g.n > 0; r.shipInfOk = r.shipInfOk && r.quarter; }
        al.alive = false; al.el.remove(); fleets.splice(fleets.indexOf(al), 1); }
      const sh = makeFleet(1, { name: '試験 撃つ', sub: '', type: 'cl', n: 1, hp: 1, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1, pos: [0, -300], alt: 0, vis: 1, stl: 9 });
      damage(W, W.hp + 1, sh); damage(E, E.hp + 1, sh); damage(C, C.hp + 1, sh); stepBase(.05);
      const g0 = garrison.hp, n1 = g.n, w0 = troopsWent; let m = 0; while (m++ < 4000 && g.n > 0) stepBase(.05);
      r.inside = C.breached && n1 > 0 && g.n === 0 && Math.abs(g0 - garrison.hp - n1 * GA.troop) < 1e-6 && troopsWent - w0 === n1;
      sh.el.remove(); return r; });
    check(lt.data && lt.landed && lt.dots && lt.drawn && lt.walkOk, 'フェブルアーリア防衛戦: 揚陸艇（共和国だけの新しい艦種）は砲台のそばの岩に降りて強化歩兵（赤い点）を降ろし、北へ帰る。強化歩兵は丸ごと平行移動せず、一列で組ごとに交互に走る・伏せる（2026-10-18）', JSON.stringify(lt));
    check(lt.guard, 'フェブルアーリア防衛戦: 味方の強化歩兵は、まわり（砲台22・ゲート40）の共和国の強化歩兵を、歩いていても撃ち、少しだけ前へ出る（持ち場を大きく離れない。2026-10-18）', JSON.stringify(lt));
    check(lt.gateHit && lt.shipInfOk, 'フェブルアーリア防衛戦: 共和国の強化歩兵は、ゲートの強化歩兵がいなくなるとシールドを削る。味方の艦は射程に敵の艦がいないとき共和国の強化歩兵を撃ち、友軍は持ち場の範囲の歩兵へ寄る（2026-10-19）。1点は4分の1ずつ減り、残りがあるうちは点が残る（2026-10-20）', JSON.stringify({ gateHit: lt.gateHit, shipInf: lt.shipInf }));
    check(lt.fight && lt.gunHit && lt.wait && lt.inside, 'フェブルアーリア防衛戦: 共和国の強化歩兵は砲台の強化歩兵と撃ち合い、いなくなると砲台を撃って壊す（撃つ光が出る。2026-10-18）。守りの多いゲートの手前で待ち、最後のゲートが開くと中へ入って守備隊を削る（2026-10-18）', JSON.stringify(lt));
    await page.evaluate(() => { if (talking) endTalk(); if (!over) end(false, true); }); await page.waitForTimeout(300); await page.click('#toMenu');
    /* balance (user decision 2026-10-13): both sides' hit points ×2 when the battle is built (op.hpScale overrides it: 第2節 ×1.5), and doing
       nothing loses. The exercise: the fortress (×3, half the fire, 60 fighters) must fall by 17:00 */
    await page.click('[data-go="sortie"]');
    const mScale = await page.evaluate(() => document.querySelector('[data-op="nile"] em').textContent);
    check(mScale.startsWith('中規模（目安 5〜8分）'), '戦闘の規模: 目安の長さは pace で縮めた実際の長さ（第3節は中規模の9〜15分 × 0.5 で5〜8分。2026-10-15）', mScale);
    await page.click('[data-op="charybdis"]'); await page.click('#goQuick'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {});
    const tu = await page.evaluate(() => {
      const F = op.fortress, q = op.quick[0], f = fleets[0], cv = fleets.find(x => x.team === 0 && x.hangars.length);
      const r = { k: HP_K, fort: fortress.max === F.hp * 2 && fortress.max === 9600 && F.dps === 9 && F.hangar.ftr === 60, fleet: f.hp === q.hp * 2 && f.hpPool === q.n * q.hp * 2,
        retreat: WOS_DATA.operations.every(o => o.hpScale == null), craftData: WOS_DATA.crafts.ftr.hp === 5 };
      const e = makeFleet(1, { name: '試験', sub: '', type: 'dd', n: 2, hp: 10, dmg: 0, range: 10, speed: 0, scale: 1, pos: [cv.pos.x, cv.pos.z - 20], alt: cv.pos.y, vis: 5, stl: 5 });
      fleets.push(e); e.seen = true; const w0 = wings.length; launchCheck(cv); const w = wings[wings.length - 1];
      r.wing = wings.length > w0 && w.hp === WING[w.type].hp * 2; wings.forEach(x => { x.alive = false; }); wings = []; e.alive = false; e.el.remove();
      fleets.filter(x => x.team === 0).forEach(x => { x.hpPool = 1e9; });
      const said = [], logE = logEvent; logEvent = (a, b) => { said.push(a + b); logE(a, b); };
      gameSec = (op.timeUp.at - 1) / CLOCK_RATE; step(.05); logEvent = logE; r.warned = said.some(t => t.includes('残り30分')); r.early = !over;
      let n = 0; while (!over && n++ < 400) step(.05);
      return { ...r, over, outcome, why: loseWhy, clock: clockStr(), rp: document.getElementById('rp').textContent }; });
    check(tu.k === 2 && tu.fort && tu.fleet && tu.wing && tu.retreat && tu.craftData, '釣り合い: 戦闘の生成で艦隊・小型機・要塞の耐久が2倍になる（データは元の値。全部の作戦で同じ、2026-10-20）。要塞は基準4,800（2倍で9,600）、火力9、艦載機60', JSON.stringify(tu));
    check(tu.warned && tu.early && tu.over && !tu.outcome && tu.why === 'time' && tu.clock === '17:00' && tu.rp.includes('時間切れ'), '演習: 17:00 までに要塞を落とせなければ時間切れで負け（警告の通信が先に入る）', JSON.stringify(tu));
    await page.waitForTimeout(2200); await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
    await page.click('#toMenu');
    /* 第4節: the data of the main fleet's battleships is halved (275) so that with ×2 they fight as before; Yukon not landed by 12:00 loses */
    await page.click('[data-go="sortie"]'); await page.click('[data-op="denali"]');
    await page.click('#goBattle'); await page.waitForTimeout(800);
    await page.click('#talkSkip').catch(() => {});
    await page.click('#deployGo').catch(() => {});
    const dl = await page.evaluate(() => {
      const w = fleets.find(f => f.name === '第1 主力戦艦 打撃群'), r = { main: op.allies[0].hp == null && Math.abs(w.hp - techFleet(0, op.allies[0]).hp * HP_K) < 1e-9 };   // the Earth's tables at the stage (2026-10-20)
      fleets.filter(x => x.team === 0).forEach(x => { x.hpPool = 1e9; });
      const T = op.timeUp; gameSec = (T.at + 1) / CLOCK_RATE; opCarrier.cs.landed = true; stepTimeUp(); r.landedOk = !over; opCarrier.cs.landed = false;
      gameSec = (T.warn.at - 1) / CLOCK_RATE; step(.05); r.quiet = !over && !timeWarned;
      gameSec = (T.at - 1) / CLOCK_RATE; step(.05); r.warned = timeWarned && !over;
      let n = 0; while (!over && n++ < 400) step(.05);
      return { ...r, over, outcome, why: loseWhy, clock: clockStr(), rp: document.getElementById('rp').textContent }; });
    check(dl.main && dl.landedOk && dl.quiet && dl.warned && dl.over && !dl.outcome && dl.why === 'time' && dl.clock === '12:00' && dl.rp.includes('降りられなかった'),
      'デナリの盾: 12:00 までにユーコンが宇宙港に着陸していなければ負け（着陸していれば続く）。本軍の戦艦の隊は地球の艦種の表の、この節の技術の段階の値（2026-10-20）', JSON.stringify(dl));
    await page.waitForTimeout(2200); await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
    await page.click('#toMenu');
    /* 艦種別の動き (user decision 2026-10-22): only in an operation marked roleAI (第6節 on; none yet, so a small battle of mixed units of both
       sides made here). The same battle with the mark and without it, from the same random numbers (2 seeds × 120 s): the allied battleship
       holds within leash × 0.6 of its post and fires on the heaviest in reach; the destroyer goes round (the 2nd place on) onto what our
       battleship and cruiser fire on, and falls back behind a heavy ship under 4割; the Republic's frigates go in front of their assault ship;
       their W.A.S. leave our frigates for last; the player's own fleet only aims by its role (standing off and backing off as before) */
    const ro = await page.evaluate(() => {
      const rand0 = Math.random, end0 = end, r = { on: [], off: [] };
      const mk = (name, o) => ({ name, sub: '', vis: 6, stl: 4, ...o });
      const OP = { id: 'roletest', name: '試験', brief: '', forces: 'fixed', stage: .35, wipeLose: false, phase: '交戦', sectors: [],
        quick: [mk('試験 自軍戦艦', { type: 'bb', n: 2, scale: 1.4, pos: [45, 30] })],
        allies: [mk('試験 戦艦', { type: 'bb', n: 3, scale: 1.4, pos: [0, 48], leash: 70 }), mk('試験 巡洋', { type: 'cl', n: 4, scale: 1.1, pos: [-14, 44], leash: 70 }),
          mk('試験 駆逐', { type: 'dd', n: 6, scale: .85, pos: [16, 44], leash: 70 }), mk('試験 護衛', { type: 'ff', n: 6, scale: .7, pos: [0, 34], leash: 70 })],
        enemies: [mk('試験 揚陸', { type: 'mas', n: 4, scale: .9, pos: [0, -30], ai: 'hunt' }), mk('試験 盾', { type: 'ff', n: 6, scale: .7, pos: [-12, -35], ai: 'hunt' }),
          mk('試験 敵駆逐', { type: 'dd', n: 6, scale: .85, pos: [20, -30], ai: 'hunt' }), mk('試験 重巡', { type: 'cl', n: 4, scale: 1.1, pos: [-25, -25], ai: 'hunt' })] };
      WOS_DATA.operations.push(OP); end = w => { over = true; outcome = w; };
      const seed = sd => { let s = sd >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
      const start = (on, sd) => { seed(sd); OP.roleAI = on; aiTimer = 0; reset({ op: 'roletest' });
        fleets.forEach(f => { f.seen = true; const k = f.team === 0 && !f.ally ? 20 : 4; f.hp *= k; f.hpPool *= k; }); return n => fleets.find(f => f.name === n); };
      try {
        for (const sd of [1, 2]) for (const on of [true, false]) {
          const F = start(on, sd), bb = F('試験 戦艦'), dd = F('試験 駆逐'), ff = F('試験 盾'), mas = F('試験 揚陸');
          const m = { bbMax: 0, heavier: 0, bbFire: 0, ddOn: 0, ddMark: 0, ddSlot0: 0, ffN: 0, ffFront: 0, was: 0, wasFF: 0, fell: null, behN: 0, behind: 0 };
          for (let i = 0; i < 2400; i++) { step(.05); if (i % 4) continue;
            if (bb.alive) { m.bbMax = Math.max(m.bbMax, bb.pos.distanceTo(bb.post)); const t = bb.fireTarget;
              if (t && t.kind === 'fleet') { m.bbFire++; if (fleets.some(e => e.team === 1 && e.alive && e.seen && gap(bb, e) <= bb.range && !bodyBlocks(bb.pos, e.pos) && heavyOf(e) > heavyOf(t))) m.heavier++; } }
            if (dd.alive && !dd.roleFell && dd.order && dd.order.type === 'attack') { const t = dd.order.target; m.ddOn++; if (dd.slotOn === t && !dd.slotK) m.ddSlot0++;
              if (fleets.some(x => x.ally && x.alive && x !== dd && ['bb', 'cl'].includes(x.type) && (x.fireTarget === t || x.order && x.order.target === t))) m.ddMark++; }
            const t = mas.alive && mas.order && mas.order.target;
            if (ff.alive && t && t.alive) { m.ffN++; if (ff.pos.distanceTo(mas.pos) < 25 && ff.pos.distanceTo(t.pos) < mas.pos.distanceTo(t.pos)) m.ffFront++; }
            for (const w of wings) if (w.alive && w.team === 1 && w.type === 'was' && w.state === 'attack' && w.target && w.target.kind === 'fleet') { m.was++; if (w.target.type === 'ff') m.wasFF++; }
            if (dd.roleFell && m.fell == null) m.fell = dd.ships.length / dd.n;
            if (dd.alive && dd.roleFell) { const H = friendOf(dd, dd.pos, ['bb', 'cl'], 1e9, x => !x.roleFell), c = H && foeSide(H, fleets.filter(x => x.team === 1 && x.alive)); if (c) { m.behN++; if (dd.pos.distanceTo(c) > H.pos.distanceTo(c)) m.behind++; } } }
          (on ? r.on : r.off).push({ bbMax: +m.bbMax.toFixed(1), heavier: +(m.heavier / Math.max(1, m.bbFire)).toFixed(2), ddMark: +(m.ddMark / Math.max(1, m.ddOn)).toFixed(2), ddSlot0: m.ddSlot0,
            ffFront: +(m.ffFront / Math.max(1, m.ffN)).toFixed(2), wasFF: +(m.wasFF / Math.max(1, m.was)).toFixed(2), fell: m.fell && +m.fell.toFixed(2), behind: +(m.behind / Math.max(1, m.behN)).toFixed(2) }); }
        /* the player's own: two foes in reach, a frigate near and a cruiser further; no order: the cruiser (the battleship's heaviest) with the mark,
           the frigate without; an attack order still comes first; how far it stands off and whether it backs off are as before */
        const aim = on => { const F = start(on, 3), me = F('試験 自軍戦艦'), a = F('試験 盾'), b = F('試験 重巡');
          fleets.forEach(f => { if (f.team === 1 && f !== a && f !== b) f.alive = false; if (f.ally) f.alive = false; });
          a.pos.set(me.pos.x, 0, me.pos.z - 7); b.pos.set(me.pos.x, 0, me.pos.z - 14);
          const x = { free: fireTargetOf(me).name, stand: +standOff(me, b).toFixed(3), back: backsOff(me, a) === outranges(me, a), move: roleMove(me) };
          order(me, { type: 'attack', target: a }); x.ordered = fireTargetOf(me).name; return x; };
        r.me = { on: aim(true), off: aim(false) };
        OP.roleAI = false; r.none = fleets.every(f => roleOf(f) == null);
      } finally { WOS_DATA.operations.pop(); Math.random = rand0; end = end0; }
      return r; });
    const avg = (L, k) => L.reduce((s, x) => s + x[k], 0) / L.length;
    check(ro.on.every(x => x.bbMax <= 70 * .6 + 4 && x.heavier <= .1) && avg(ro.off, 'bbMax') > 55,
      '艦種別の動き: 戦艦は持ち場から leash×0.6 の中に据わり（印なしでは追って出る）、射程の中のいちばん重い艦を撃つ（2026-10-22）', JSON.stringify([ro.on, ro.off]));
    check(ro.on.every(x => x.ddSlot0 === 0 && x.fell != null && x.fell < .4 && x.behind >= .6) && avg(ro.on, 'ddMark') > avg(ro.off, 'ddMark') && ro.off.every(x => x.fell == null),
      '艦種別の動き: 駆逐艦は戦艦・巡洋艦が撃っている重い艦へ、回る向きの2番目以降から挟み、4割を切ると味方の重い艦の後ろへ下がる（2026-10-22）', JSON.stringify([ro.on, ro.off]));
    check(ro.on.every(x => x.ffFront >= .5) && avg(ro.on, 'ffFront') > avg(ro.off, 'ffFront') + .2,
      '艦種別の動き: 共和国のフリゲートは突撃揚陸艦と一緒に出て、その前（揚陸艦の目標の側）に並ぶ（2026-10-22）', JSON.stringify([ro.on, ro.off]));
    check(ro.on.every(x => x.wasFF <= .1) && avg(ro.off, 'wasFF') > avg(ro.on, 'wasFF') + .1,
      '艦種別の動き: 共和国の W.A.S. は地球のフリゲート（対空が強い）を後回しにする（2026-10-22）', JSON.stringify([ro.on, ro.off]));
    check(ro.me.on.free === '試験 重巡' && ro.me.off.free === '試験 盾' && ro.me.on.ordered === '試験 盾' && ro.me.on.stand === ro.me.off.stand && ro.me.on.back && ro.me.on.move === null && ro.none,
      '艦種別の動き: 自軍の隊は命令のないときの狙いだけが変わる（戦艦はいちばん重い艦。命令が先、立つ距離と下がり方は前のまま）。印のない作戦では役目がない（2026-10-22）', JSON.stringify([ro.me, ro.none]));
    /* ドクトリン（型） (user decision 2026-10-22): only the Republic's units in an operation with packs (第6節 on; none yet, so a small battle made
       here, roleAI on in both). The same battle with packs and without, from the same random numbers (2 seeds × 120 s, the clock at 0.75 minutes
       a second): the spear (two teams from the north and from the east above), the mist and hammer, the rock shield round a thruster that our
       battleship is sent at. Once the spear's last charge has gone on 15 s, half of its frigates are sunk here (to see the break-off) */
    const dc = await page.evaluate(() => {
      const rand0 = Math.random, end0 = end, r = { on: [], off: [] };
      const mk = (name, o) => ({ name, sub: '', vis: 6, stl: 4, ...o });
      const PK = [{ doctrine: 'spear', fleets: ['槍 盾1', '槍 揚陸1', '槍 駆逐1', '槍 盾2', '槍 揚陸2', '槍 駆逐2'], goal: ['試験 工作', 'bb'], from: [[0, -1, 0], [1, 0, .7]] },
        { doctrine: 'mistHammer', fleets: ['霧 揚陸', '鎚 重巡'], goal: 'bb' }, { doctrine: 'rockShield', fleets: ['岩 盾', '岩 縁', '岩 予備'], ward: '岩 推進器' }];
      const OP = { id: 'packtest', name: '試験', brief: '', forces: 'fixed', stage: .35, wipeLose: false, phase: '交戦', sectors: [], roleAI: true, clockScale: .05,
        quick: [mk('試験 自軍戦艦', { type: 'bb', n: 2, scale: 1.4, pos: [-120, 40] })],
        allies: [mk('試験 戦艦', { type: 'bb', n: 3, scale: 1.4, pos: [0, 48], leash: 70 }), mk('試験 巡洋', { type: 'cl', n: 4, scale: 1.1, pos: [-14, 44], leash: 70 }),
          mk('試験 駆逐', { type: 'dd', n: 6, scale: .85, pos: [16, 44], leash: 70 }), mk('試験 護衛', { type: 'ff', n: 6, scale: .7, pos: [0, 34], leash: 70 }),
          mk('試験 母艦', { type: 'cvb', n: 2, scale: 1.4, pos: [30, 62], leash: 70 })],
        enemies: [mk('槍 盾1', { type: 'ff', n: 6, scale: .7, pos: [-10, -60], ai: 'hunt' }), mk('槍 揚陸1', { type: 'mas', n: 4, scale: .9, pos: [-10, -66], ai: 'hunt' }),
          mk('槍 駆逐1', { type: 'dd', n: 4, scale: .85, pos: [-3, -64], ai: 'hunt' }), mk('槍 盾2', { type: 'ff', n: 6, scale: .7, pos: [110, -90], ai: 'hunt' }),
          mk('槍 揚陸2', { type: 'mas', n: 4, scale: .9, pos: [116, -94], ai: 'hunt' }), mk('槍 駆逐2', { type: 'dd', n: 4, scale: .85, pos: [112, -98], ai: 'hunt' }),
          mk('霧 揚陸', { type: 'mas', n: 4, scale: .9, pos: [-40, -40], ai: 'hunt' }), mk('鎚 重巡', { type: 'cl', n: 4, scale: 1.1, pos: [-60, -95], ai: 'hunt' }),
          mk('岩 推進器', { type: 'cl', n: 1, hp: 30, dmg: 0, eva: 0, range: 1, speed: 0, scale: 1.4, fixed: true, pos: [-120, -20], vis: 1, stl: 2 }),
          mk('岩 盾', { type: 'ff', n: 6, scale: .7, pos: [-115, -10], ai: 'hunt' }), mk('岩 縁', { type: 'cl', n: 3, scale: 1.1, pos: [-135, -15], ai: 'hunt' }),
          mk('岩 予備', { type: 'mas', n: 4, scale: .9, pos: [-120, -50], ai: 'hunt' })] };
      WOS_DATA.operations.push(OP); end = w => { over = true; outcome = w; };
      const seed = sd => { let s = sd >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
      const start = (on, sd) => { seed(sd); OP.packs = on ? PK : undefined; aiTimer = 0; reset({ op: 'packtest' });
        fleets.forEach(f => { f.seen = true; const k = f.team === 0 && !f.ally ? 20 : 4; if (!f.fixed) { f.hp *= k; f.hpPool *= k; } }); return n => fleets.find(f => f.name === n); };
      const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())))) * 180 / Math.PI, fx = (x, d = 1) => x == null ? null : +x.toFixed(d);
      try {
        for (const sd of [1, 2]) for (const on of [true, false]) {
          const F = start(on, sd), me = F('試験 自軍戦艦'), bb = F('試験 戦艦'), W = F('岩 推進器'), res = F('岩 予備'), ham = F('鎚 重巡');
          const team = [['槍 盾1', '槍 揚陸1', '槍 駆逐1'], ['槍 盾2', '槍 揚陸2', '槍 駆逐2']].map(L => L.map(F)), [S, M, R] = on ? packs : [];
          const m = { vec: {}, ffN: 0, ffFront: 0, pre: 0, preN: 0, post: 0, postN: 0, hamFire: null, wasOn: null, back: null, far0: null, left: 0, mww: 0, guardN: 0, guard: 0, idle: 0, out: 0, y: 0, end: null, s2: null };
          for (let i = 0; i < 2400; i++) {
            if (i === 200) order(me, { type: 'attack', target: W });   // our battleship at the thruster: the rock shield's reserve comes out
            if (on && m.s2 == null && S.step === 2) m.s2 = i;
            if (on && m.s2 != null && i === m.s2 + 300) for (const [ff] of team) while (ff.alive && ff.ships.length > 2) damage(ff, ff.hp, bb);
            step(.05); if (i % 4) continue; const min = opMin(), G = on ? S.G : bb;
            for (const L of team) for (const f of L) if (f.alive && G && !m.vec[f.name] && f.pos.distanceTo(G.pos) < 62) m.vec[f.name] = f.pos.clone().sub(G.pos);
            for (const [ff, mas, dd] of team) { const t = mas.alive && mas.order && mas.order.type === 'attack' && mas.order.target, go = on ? S.step >= 1 && !S.back : !!t;
              if (go && ff.alive && mas.alive && G) { m.ffN++; if (ff.pos.distanceTo(mas.pos) < 25 && ff.pos.distanceTo(G.pos) < mas.pos.distanceTo(G.pos)) m.ffFront++; }
              if (go && dd.alive && mas.alive && G) { const side = ang(dd.pos.clone().sub(G.pos), mas.pos.clone().sub(G.pos)) >= 55 && dd.pos.distanceTo(G.pos) < 30;
                if (on && S.step === 1) { m.preN++; if (side) m.pre++; } else { m.postN++; if (side) m.post++; } } }
            if (on && M.step === 1 && m.wasOn == null) m.wasOn = min;
            if (ham.alive && m.hamFire == null && ham.fireTarget && gap(ham, ham.fireTarget) <= ham.range * 1.08) m.hamFire = min;
            if (on && S.back) { if (m.back == null) { m.back = min; m.far0 = team.map(L => L[1].pos.distanceTo(L[1].home)); }
              for (const w of wings) if (w.alive && w.carrier.pack === S && w.carrier.alive) m.left = Math.max(m.left, w.pos.distanceTo(w.carrier.pos) - w.launchR);
              for (const [ff, mas, dd] of team) if (mas.alive && mas.order && mas.order.type === 'move') { if (wings.some(w => w.alive && w.carrier === mas)) m.mww++;
                if (mas.pos.distanceTo(mas.home) > 8 && G) for (const g of [ff, dd]) if (g.alive) { m.guardN++; if (g.pos.distanceTo(G.pos) < mas.pos.distanceTo(G.pos)) m.guard++; } } }
            if (on && res.alive) { const sh = packAt(res);
              if (R.hitAt == null && min > 5) m.idle = Math.max(m.idle, res.pos.distanceTo(sh));
              if (R.hitAt != null && R.lostAt == null) { m.out = Math.max(m.out, res.pos.distanceTo(sh)); m.y = Math.max(m.y, Math.abs(res.pos.y - W.pos.y)); }
              if (R.lostAt != null) m.end = res.pos.distanceTo(sh) + wings.filter(w => w.alive && w.carrier === res).length * 100; } }
          const v = m.vec, arr = on ? S.mem.map(f => f.packArr).filter(x => x != null) : [];
          (on ? r.on : r.off).push({ arr: on ? arr.length : null, spread: arr.length ? fx(Math.max(...arr) - Math.min(...arr), 2) : null, angle: v['槍 揚陸1'] && v['槍 揚陸2'] ? Math.round(ang(v['槍 揚陸1'], v['槍 揚陸2'])) : null,
            ffFront: fx(m.ffFront / Math.max(1, m.ffN), 2), ddPre: fx(m.pre / Math.max(1, m.preN), 2), ddPost: fx(m.post / Math.max(1, m.postN), 2), wasOn: fx(m.wasOn), hamFire: fx(m.hamFire),
            back: fx(m.back), mww: m.mww, left: fx(m.left), guard: fx(m.guard / Math.max(1, m.guardN), 2), far: on ? team.map((L, k) => fx(L[1].pos.distanceTo(L[1].home) - m.far0[k])) : null,
            hit: on ? fx(R.hitAt) : null, lost: on ? fx(R.lostAt) : null, idle: fx(m.idle), out: fx(m.out), y: fx(m.y), end: fx(m.end) }); }
        /* the hammer with no mist (its assault ship gone at the start): it waits 20 minutes, holding its fire, then goes */
        const F = start(true, 3), mist = F('霧 揚陸'), ham = F('鎚 重巡'); mist.alive = false; mist.el.remove(); r.t20 = null; r.fire20 = null;
        for (let i = 0; i < 1200; i++) { step(.05); if (r.t20 == null && packs[1].step === 1) r.t20 = +opMin().toFixed(2);
          if (r.fire20 == null && ham.fireTarget && gap(ham, ham.fireTarget) <= ham.range * 1.08) r.fire20 = +opMin().toFixed(2); }
        OP.packs = undefined; r.none = WOS_DATA.operations.every(o => o === OP || !o.packs || o.roleAI);   // packs only from 第6節 (roleAI) on
      } finally { WOS_DATA.operations.pop(); Math.random = rand0; end = end0; }
      return r; });
    const avgD = (L, k) => L.reduce((s, x) => s + x[k], 0) / L.length;
    check(dc.on.every(x => x.arr === 6 && x.spread <= 15 && x.angle >= 60),
      'ドクトリン（型）: 槍の隊は別の向き（上下も含む）から、作戦の時計で15分以内にそろって着く（遅い隊に速さを合わせる。2026-10-22）', JSON.stringify([dc.on, dc.off].map(L => L.map(x => [x.arr, x.spread, x.angle]))));
    check(dc.on.every(x => x.ffFront >= .8) && avgD(dc.on, 'ffFront') > avgD(dc.off, 'ffFront') + .2,
      'ドクトリン（型）: 槍の突撃では、フリゲートが組の揚陸艦の前に並ぶ（2026-10-22）', JSON.stringify([dc.on, dc.off].map(L => L.map(x => x.ffFront))));
    check(dc.on.every(x => x.ddPre <= .2 && x.ddPost >= .5) && avgD(dc.on, 'ddPost') > avgD(dc.off, 'ddPost'),
      'ドクトリン（型）: 槍の駆逐艦は W.A.S. が目標に取り付くまで待ち、取り付いたら目標の横か上下へ回る（2026-10-22）', JSON.stringify([dc.on, dc.off].map(L => L.map(x => [x.ddPre, x.ddPost]))));
    check(dc.on.every(x => x.wasOn != null && x.hamFire != null && x.hamFire >= x.wasOn) && dc.t20 >= 20 && dc.t20 < 21 && (dc.fire20 == null || dc.fire20 >= 20),
      'ドクトリン（型）: 霧と鎚の重巡洋艦は W.A.S. が取り付くまで撃たず、合図がなければ20分で出る（2026-10-22）', JSON.stringify({ on: dc.on.map(x => [x.wasOn, x.hamFire]), t20: dc.t20, fire20: dc.fire20 }));
    check(dc.on.every(x => x.back != null && x.mww === 0 && x.left <= 1.5 && x.guard >= .6 && x.far.every(d => d == null || d < -20)),
      'ドクトリン（型）: 槍はフリゲートが半分沈むと退く。揚陸艦は W.A.S. を戻してから先に下がり（置き去りにしない）、フリゲートと駆逐艦が後ろを守る（2026-10-22）', JSON.stringify(dc.on.map(x => [x.back, x.mww, x.left, x.guard, x.far])));
    check(dc.on.every(x => x.hit != null && x.lost != null && x.idle <= 6 && x.out >= 20 && x.y >= 10 && x.end != null && x.end <= 6),
      'ドクトリン（型）: 岩の盾の予備は陰で待ち、守るものが撃たれると上か下を回って出て、落ちると陰へ戻る（2026-10-22）', JSON.stringify(dc.on.map(x => [x.hit, x.lost, x.idle, x.out, x.y, x.end])));
    check(dc.none && dc.off.every(x => x.hit == null && x.back == null),
      'ドクトリン（型）: packs のない作戦（第1〜5節・演習）には型が効かない（2026-10-22）', JSON.stringify(dc.none));
    /* 第6節「デナリ破砕」（2026-10-28 に陽動の形に作り直した。docs/campaign.md 第6節「作り直しの案」、docs/spec.md「第6節の形」）の舞台: 推進器12基（戻せるのは東と北の6基）と砲台6基、
       共和国74隻（正面48、方角守備隊 西上9・東下9・北8）、友軍の陽動は左上・右下に46隻ずつ（巡洋艦12・駆逐艦12・フリゲート12・コルベット6・戦闘母艦4、戦艦なし）、
       出撃の上限60、作戦フィールドは近づくときに一度だけ一定の速さで北へ滑る（突破と2回目の滑り、砲撃線はやめた） */
    const db = await page.evaluate(() => {
      const F = n => fleets.find(f => f.name === n), P = n => packs.find(x => x.name === n), mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk();
      const T = fleets.filter(f => f.type === 'thr'), W = F('第1 主力戦艦 打撃群'), r = {}, cnt = L => L.reduce((s, n) => s + F(n).n, 0);
      const comp = s => { const c = {}; for (const f of fleets.filter(f => f.feint === s)) for (const [t, k] of Object.entries(f.comp || { [f.type]: f.n })) c[t] = (c[t] || 0) + k; return ['cl', 'dd', 'ff', 'cv', 'cvb', 'bb'].map(t => c[t] || 0).join(','); };
      r.stage = { fc: fieldC.z, thr: T.length, restore: T.filter(f => f.restore).map(f => f.name.replace('推進器 ', '')).join(''), guns: fleets.filter(f => f.fixed && f.type === 'aa' && f.team === 1).length,
        up: T.every(f => f.ships.every(s => Math.abs(s.up.dot(s.base.clone().sub(bodyC).normalize()) - 1) < 1e-6)), hurt: +(W.hp / (techFleet(0, op.allies[0]).hp * HP_K)).toFixed(2),
        fe: [+skyGrow[0].m.scale.x.toFixed(2), +growR(skyGrow[0].G, 21).toFixed(1)], packs: packs.length,
        en: fleets.filter(f => f.team === 1 && !f.fixed).reduce((s, f) => s + f.n, 0), front: ['西の拠点', '中の拠点', '東の拠点', '槍1', '槍2', '霧と鎚'].reduce((s, n) => s + cnt(P(n).fleets), 0),
        side: ['西上守備隊', '東下守備隊', '北守備隊'].map(n => cnt(P(n).fleets)).join(','), feint: [comp('左上'), comp('右下')], ally: fleets.filter(f => f.ally).length,
        esc: fleets.filter(f => f.ally && f.mode === 'escort').map(f => `${f.name}:${Object.entries(f.comp).map(([t, k]) => t + k).join('')}`).join(','), allyN: fleets.filter(f => f.ally).reduce((s, f) => s + f.n, 0),
        was: fleets.filter(f => f.team === 1 && f.type === 'mas').every(f => f.hangars.reduce((s, h) => s + h.reserve + h.squads.reduce((a, q) => a + q.n, 0), 0) === 8 * f.n), s2mas: P('槍2').fleets.filter(n => F(n).type === 'mas').length,
        thrHp: fleets.filter(f => f.restore).map(f => f.hp / HP_K).join(','),
        cap: op.cap, gone: typeof shellAI === 'undefined' && typeof stepBreach === 'undefined' && !op.breach && op.phases.length === 2 };
      mins(1); const t0 = gameSec; while (gameSec < t0 + 13) step(.05); r.slide = Math.round(fieldC.z);   // a quarter of 52 s: 260 even
      mins(40); r.stop = Math.round(fieldC.z);
      return r;
    });
    check(db.stage.fc === 300 && db.stage.thr === 12 && db.stage.restore === '東1東2東3北1北2北3' && db.stage.guns === 6 && db.stage.up && db.stage.hurt === .9 && db.stage.packs === 9
      && db.stage.fe[0] === 2.2 && Math.abs(db.stage.fe[1] - 10.5) < .1,
      '第6節: デナリに推進器12基（戻せるのは東と北の6基、軸は中心から外）と砲台6基、本軍の耐久9割、フェブルアーリアは 13:00 に半径2.2・21:00 に10.5（2026-10-24）', JSON.stringify(db.stage));
    check(db.stage.en === 74 && db.stage.front === 48 && db.stage.side === '9,9,8' && db.stage.feint.every(c => c === '12,12,8,4,4,0') && db.stage.ally === 18 && db.stage.cap === 60 && db.stage.gone
      && db.stage.esc === '第29 前衛巡洋 支隊:cl3dd3,第30 護衛 支隊:ff4cv2' && db.stage.allyN === 105,
      '第6節（陽動の形、2026-10-28・29）: 共和国74隻（正面48・方角守備隊 西上9・東下9・北8）、陽動は左上と右下に40隻ずつ（戦艦なし）、戦艦の護衛に第29・第30 支隊（友軍は合わせて105隻）、出撃の上限60。突破・砲撃線はない', JSON.stringify(db.stage));
    check(db.stage.was && db.stage.s2mas === 0 && db.stage.thrHp === '520,520,520,430,430,430',
      '第6節の釣り合わせ（2026-10-29、仮）: 突撃揚陸艦の W.A.S. は1隻8機のまま（基礎の値）、槍2に突撃揚陸艦はない（駆逐艦）、戻せる推進器の耐久は東520・北430', JSON.stringify([db.stage.was, db.stage.s2mas, db.stage.thrHp]));
    check(Math.abs(db.slide - 260) <= 3 && db.stop === 140, '第6節: 作戦フィールドは近づくときに一度だけ一定の速さで北へ滑って止まる（linear、z300 → 140）', JSON.stringify([db.slide, db.stop]));
    /* 方角守備隊（型 screen）: 守るものから130以内に見えた敵と守るものの間（敵の40手前）に割り込み、持ち場の中心から100の外へは出ない。敵がいなければ戻る。
       予備の揚陸艦は持ち場で待つ。北守備隊と正面は追わない */
    const scr6 = await page.evaluate(() => {
      const F = n => fleets.find(f => f.name === n), P = n => packs.find(x => x.name === n), mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk();
      for (const f of fleets) if (f.feint) { f.alive = false; f.el.remove(); }
      const me = fleets.filter(f => f.team === 0 && !f.ward && f.alive);
      me.slice(1).forEach(f => { f.pos.set(0, 0, 330); f.order = null; });
      const S = P('東下守備隊'), W = F('推進器 東2'), N = P('北守備隊'), e = me[0], r = {};
      const go = (dir, d) => { e.pos.copy(W.pos).add(dir.clone().setLength(d)); e.order = null; e.revealT = 1e9; e.locked = true; };
      step(.05); step(.05);
      go(new THREE.Vector3(.5, -.3, -.8), 110); mins(opMin() + 8);
      const wall = S.mem.filter(f => f.packSlot !== 'reserve' && f.alive), res = S.mem.find(f => f.packSlot === 'reserve');
      r.near = { gap: wall.map(f => Math.round(f.pos.distanceTo(e.pos))), post: wall.map(f => Math.round(f.pos.distanceTo(S.postV))), toW: Math.round(S.scr.s.distanceTo(S.scr.W)), want: Math.round(Math.min(...['東1', '東2', '東3'].map(n => F('推進器 ' + n).pos.distanceTo(e.pos))) - 40),
        res: +res.pos.distanceTo(res.home).toFixed(1), north: N.mem.every(f => f.pos.distanceTo(f.home) < 5) };
      /* far out (129 from the thruster, the other side of the rock from the post): held at 100 from the post */
      go(new THREE.Vector3(-.6, -.2, -.8), 129); mins(opMin() + 10); r.far = wall.map(f => Math.round(f.pos.distanceTo(S.postV)));
      /* gone: back to their spots */
      e.pos.set(0, 0, 330); e.revealT = 0; mins(opMin() + 10); r.back = S.mem.length === 4 && S.mem.every(f => f.pos.distanceTo(f.home) < 3) && !S.scr;
      return r;
    });
    check(scr6.near.gap.every(d => d >= 36 && d <= 50) && Math.abs(scr6.near.toW - scr6.near.want) <= 2 && scr6.near.res < 3 && scr6.near.north && scr6.far.every(d => d <= 110) && Math.max(...scr6.far) > 90 && scr6.back,
      '第6節: 方角守備隊は守るものから130以内の敵と守るものの間（敵の40手前）に立ち、持ち場の中心から100の外へ出ない。敵がいなければ戻る。予備と北守備隊は動かない（2026-10-28）', JSON.stringify(scr6));
    /* 第二段階の合図 lure: 西上と東下の守備隊18隻のうち、持ち場の中心から60の外へ出た艦と沈んだ艦が半分（9）になったら（一番早くて 13:50）、遅くとも 15:00。
       そこで移乗、推進器の印（見本の案C）は合図まで出さない。14:45 になっても合図がなければウォン中将「15:00 に出る」 */
    const lu = await page.evaluate(() => {
      const said = [], logE = logEvent; logEvent = (a, b) => { said.push(a + b); logE(a, b); };
      const F = n => fleets.find(f => f.name === n), P = n => packs.find(x => x.name === n), mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      const kill = f => { while (f && f.alive) damage(f, f.hpPool + 1, fleets[0]); };
      const start = () => { WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); said.length = 0; for (const f of fleets) if (f.feint) { f.alive = false; f.el.remove(); } for (const G of nuke.G) G.hpPool *= 50; };
      const r = {};
      try {
        start(); mins(5); const T = F('推進器 東2'), Wst = F('推進器 西1');
        r.mark = { off: thrOff(T), cls: T.el.classList.contains('thr') && T.el.classList.contains('rs') && Wst.el.classList.contains('dim'), tg: T.el.querySelector('.tg').textContent, hex: !!T.el.querySelector('.emb svg polygon') };
        /* 9 of the 18 sunk at 13:05: not before 13:50 */
        const S = [...P('西上守備隊').mem, ...P('東下守備隊').mem].filter(f => f.packSlot !== 'reserve');
        let n = 0; for (const f of S) { if (n >= 9) break; n += f.ships.length; kill(f); }
        r.count = lureCount(); mins(49.5); r.early = { lured: !!lured, state: nuke.state };
        mins(50.6); r.share = { by: lured && lured.by, state: nuke.state, phase: phaseName, cue: !!packCue.lure, known: fleets.filter(f => f.type === 'thr').every(f => f.known && f.seen), off: thrOff(T),
          said: said.some(t => t.includes('方角守備隊が半分を切りました')) && said.some(t => t.includes('推進器、12基')) && !said.some(t => t.includes('剥がれきらない')), wait: !said.some(t => t.includes('15:00 に出る')) };
        /* nothing drawn out: at 15:00 by the clock, after the word at 14:45 */
        start(); gameSec = 104.9 / CLOCK_RATE; mins(105.2); const w1 = said.some(t => t.includes('15:00 に出る'));
        mins(119.8); const s0 = nuke.state; mins(120.2);
        r.time = { w1, s0, by: lured && lured.by, state: nuke.state, half: said.some(t => t.includes('半分を切りました')), move: said.some(t => t.includes('移乗にかかれ')), late: said.some(t => t.includes('剥がれきらないが、時間だ')) };
        /* drawn out (more than 60 from the post) counts like sunk */
        start(); mins(51); const E = P('東下守備隊'); E.mem.filter(f => f.packSlot !== 'reserve').forEach(f => { f.pos.add(new THREE.Vector3(0, 0, -75)); f.home.copy(f.pos); });
        const out = lureCount(); step(.05); r.out = { out: out.out, n0: out.n0, lured: !!lured };
        return r;
      } finally { logEvent = logE; }
    });
    check(lu.mark.off && lu.mark.cls && lu.mark.tg === '東2' && lu.mark.hex && lu.count.n0 === 18 && lu.count.out >= 9 && !lu.early.lured && lu.early.state === 'wait'
      && lu.share.by === 'share' && lu.share.state === 'board' && lu.share.phase === '第二段階' && lu.share.cue && lu.share.known && !lu.share.off && lu.share.said && lu.share.wait,
      '第6節: 西上・東下の守備隊18隻の半分が沈むか持ち場の60の外へ出ると、13:50 を待って第二段階（移乗、推進器の印は六角と短い名前でここから。西は薄く）（2026-10-28）', JSON.stringify(lu));
    check(lu.time.w1 && lu.time.s0 === 'wait' && lu.time.by === 'time' && lu.time.state === 'board' && !lu.time.half && lu.time.move && lu.time.late && lu.out.out === 7 && !lu.out.lured,
      '第6節: 守りが剥がれなくても 15:00 で第二段階（14:45 にウォン中将「15:00 に出る」、15:00 に「剥がれきらないが、時間だ」2026-10-29）。持ち場の60の外へ出た艦も数える（2026-10-28）', JSON.stringify([lu.time, lu.out]));
    /* 第6節の核を積んだ戦艦と着弾予想点（2026-10-27。2026-10-28 に移乗は第二段階の合図で、降りる道は左上、ずれの上限30 km）: 移乗（15分止まる）→ 空の戦艦が左上の道で鉱山へ降りて着底
       → そろって15分で起爆、予想点は着底した数 × 23:00 までの残り時間（上限30 km）ずれる。起爆のあと、戻せる推進器1基が1時間2.4 km 戻す。見込みが15 km 以上で勝ち、
       予想点が15を割る・18:30 までに起爆できない・戦艦が全部沈む で負け。任務欄に目盛りと推進器・戦艦の印 */
    const nk = await page.evaluate(() => {
      const F = n => fleets.find(f => f.name === n), now = () => gameSec * CLOCK_RATE, mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      const kill = n => { const f = F(n); while (f && f.alive) damage(f, f.hpPool + 1, fleets[0]); };
      const start = () => { WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); };
      const lure = () => { lured = { at: opMin(), by: 'test' }; packCue.lure = true; step(.05); };
      const r = {};
      start(); const N = op.nukes, G = nuke.G;
      r.init = { G: G.map(f => f.nuke).join(','), nb0: nuke.nb0.join(','), thr0: nuke.thr0, state: nuke.state, mine: +nuke.mine.distanceTo(bodyC).toFixed(1), R: +bodyShape.R(nuke.M.d).toFixed(1) };
      mins(2); const n1 = G[0].ships.length; lure(); const t0 = now();
      r.board = { state: nuke.state, bbs: nuke.bbs.length, alive: nuke.bbs.filter(b => b.f && b.f.alive).length, bbLeft: G.reduce((s, f) => s + f.ships.filter(x => x.type === 'bb').length, 0),
        gn: G[0].n, cut: n1 - G[0].ships.length, locked: nuke.bbs.every(b => !b.f || b.f.locked) && G[0].locked, ally: nuke.bbs.every(b => !b.f || b.f.ally && b.f.ward), route: !!nuke.route };
      const p0 = nuke.bbs[0].f.pos.clone(); mins(t0 + 14); r.board.still = +nuke.bbs[0].f.pos.distanceTo(p0).toFixed(2); r.board.st14 = nuke.state;
      mins(t0 + 15.5); const o = nuke.bbs[0].f.order, via = o && o.via || [];
      r.descend = { state: nuke.state, cue: !!packCue.descend, silent: nuke.bbs.every(b => !b.f || !b.f.alive || b.f.silent), unlock: !G[0].locked, crew: G[0].sub.includes('乗員'),
        via: via.map(v => [Math.round(v.x), Math.round(v.z), Math.round(v.y)].join(' ')).join(' / ') };
      /* bring the battleships over the mine (a fast-forward of the way down) and let them settle */
      nuke.bbs.forEach(b => { if (b.f && b.f.alive) { b.f.hpPool = b.f.hp * 50; b.f.pos.copy(b.slot); b.f.order = null; } });   // hard to sink while they wait (the test is of the clock)
      step(.05); step(.05); const tl = now(), nl = nuke.bbs.filter(b => b.f && b.f.alive && b.f.nukeSt === 'landed').length;
      r.land = { state: nuke.state, n: nl, cue: !!packCue.land, fuse: +(nuke.fuseAt - tl).toFixed(1), pv: +nukePreview().km.toFixed(2), want: +Math.min(30, nl * (600 - nuke.fuseAt) / 60).toFixed(2) };
      goalFlashT = 0; updateGoal();   // the 1.5 s "updating" flash (real time, goalFlash) draws no marks: on a slow runner it is still on here
      const gg = document.getElementById('goalGates'); r.hud0 = { scale: !!gg.querySelector('svg.nks'), dash: gg.innerHTML.includes('stroke-dasharray="1.6 1.2"'), bb: gg.querySelectorAll('svg.nb').length, thr: gg.querySelectorAll('.nkr svg:not(.nb)').length };
      mins(nuke.fuseAt + .2); const fa = nuke.fireAt;
      r.fire = { state: nuke.state, km: +nuke.km.toFixed(2), want: +Math.min(30, nl * (600 - fa) / 60).toFixed(2), raw: +(nl * (600 - fa) / 60).toFixed(1), gone: nuke.bbs.filter(b => b.f && b.f.nukeSt === 'gone' && !b.f.alive).length, cue: !!packCue.ignite,
        back: G.filter(f => f.alive).every(f => f.mode === 'nukeBack'), route: (drawRoute(), !document.querySelector('#nkRoute .ln')) };
      /* the restoring thrusters pull the aim back 2.4 km an hour each; one more down raises the strike at 23:00 */
      const R0 = restoreLeft(), k0 = nuke.km; mins(fa + 30.2);
      r.pull = { R: R0, per: +((k0 - nuke.km) / (30 / 60) / Math.max(1, restoreLeft())).toFixed(2), sameR: restoreLeft() === R0 };
      const e1 = nukeEst(), alive = fleets.filter(f => f.restore && f.alive); kill(alive[0].name); step(.05);
      r.pull.up = +(nukeEst() - e1).toFixed(2); r.pull.want = +(N.pull * Math.max(0, N.stop - now()) / 60).toFixed(2);
      goalFlashT = 0; updateGoal(); r.hud1 = { circle: !!document.querySelector('#goalGates svg.nks circle'), label: document.getElementById('goalLabel').textContent };
      /* win: the strike at 23:00 is 15 km or more once the thrusters left are down */
      fleets.filter(f => f.restore && f.alive).forEach(f => kill(f.name)); step(.05);
      r.win = { over, outcome, est: +nukeEst().toFixed(1), rp: document.getElementById('rp').textContent };
      /* lose: the aim under 15 km */
      start(); mins(2); Object.assign(nuke, { state: 'fired', fireAt: now(), lastMin: now(), km: 15.05 }); step(.05); const kept = !over; nuke.km = 14.9; step(.05);
      r.short = { kept, over, outcome, why: loseWhy };
      /* lose: nothing gone off by 18:30 */
      start(); gameSec = (op.win.due - .01) / CLOCK_RATE; step(.05); step(.05); r.late = { over, outcome, why: loseWhy };
      /* lose: every battleship sunk */
      start(); mins(2); nuke.G.forEach(f => kill(f.name)); step(.05); r.sunk = { over, outcome, why: loseWhy, rp: document.getElementById('rp').textContent };
      /* an operation without op.nukes: nothing */
      WOS.start({ op: 'februaria' }); setSpeed(0); if (talking) endTalk(); r.none = nuke === null && !document.querySelector('#goalGates svg.nks') && !lured;
      return r;
    });
    check(nk.init.G === '3,3' && nk.init.nb0 === '3,2' && nk.init.thr0 === 6 && nk.init.state === 'wait' && Math.abs(nk.init.mine - nk.init.R - 3) < .01,
      '第6節: 核を積んだ戦艦は第1・第2打撃群の5隻（3発ずつ）、戻せる推進器6基、着底する所は鉱山の底の上（2026-10-27）', JSON.stringify(nk.init));
    check(nk.board.state === 'board' && nk.board.bbs === 5 && nk.board.alive === 5 && nk.board.bbLeft === 0 && nk.board.cut === 3 && nk.board.gn === 4 && nk.board.locked && nk.board.ally && nk.board.route
      && nk.board.still < .01 && nk.board.st14 === 'board',
      '第6節: 第二段階で移乗。戦艦は1隻ずつの友軍に分かれ、隊と一緒に15分その場で止まる（2026-10-27、合図は 2026-10-28）', JSON.stringify(nk.board));
    check(nk.descend.state === 'descend' && nk.descend.cue && nk.descend.silent && nk.descend.unlock && nk.descend.crew && nk.descend.via === '-60 265 60 / -110 90 45 / -50 40 40',
      '第6節: 移乗のあと空の戦艦は左上の道（経由点 [-110,90]+45 → [-50,40]+40）で鉱山へ降りる（撃たない、合図 descend）。巡洋艦とフリゲートは乗員を乗せて動き出す（2026-10-28）', JSON.stringify(nk.descend));
    check(nk.land.state === 'armed' && nk.land.n >= 4 && nk.land.cue && Math.abs(nk.land.fuse - 15) < .1 && Math.abs(nk.land.pv - nk.land.want) < .01
      && nk.hud0.scale && nk.hud0.dash && nk.hud0.bb === 5 && nk.hud0.thr === 6,
      '第6節: 鉱山の輪で着底し、生きている戦艦がそろうと15分後に起爆。任務欄に目盛り・起爆でのずれ（破線の◆）・推進器6と戦艦5の印（2026-10-27）', JSON.stringify([nk.land, nk.hud0]));
    check(nk.fire.state === 'fired' && nk.fire.raw > 30 && nk.fire.km <= 30 && nk.fire.km > 29.8 && nk.fire.gone === nk.land.n && nk.fire.cue && nk.fire.back && nk.fire.route,
      '第6節: 起爆で予想点が 着底した数 × 23:00 までの残り時間 km ずれ（上限30 km、2026-10-28）、着底した戦艦は消え、乗員を乗せた隊は南へ下がる', JSON.stringify(nk.fire));
    check((!nk.pull.sameR || Math.abs(nk.pull.per - 2.4) < .1) && Math.abs(nk.pull.up - nk.pull.want) < .05 && nk.pull.up > 0 && nk.hud1.circle && nk.hud1.label.includes('23:00'),
      '第6節: 起爆のあと戻せる推進器1基が1時間2.4 km 戻し、1基壊すと 23:00 の見込みが上がる（2026-10-27）', JSON.stringify([nk.pull, nk.hud1]));
    check(nk.win.over && nk.win.outcome === true && nk.win.est >= 15 && nk.win.rp.includes('着弾予想点'), '第6節: 戻せる推進器が尽きて見込みが15 km 以上になると、その時点で勝ち（2026-10-27）', JSON.stringify(nk.win));
    check(nk.short.kept && nk.short.over && nk.short.outcome === false && nk.short.why === 'short' && nk.late.over && nk.late.outcome === false && nk.late.why === 'late'
      && nk.sunk.over && nk.sunk.outcome === false && nk.sunk.why === 'sunk' && nk.sunk.rp.includes('沈んだ') && nk.none,
      '第6節: 負けは、予想点が15 km を割る・18:30 までに起爆できない・戦艦が全部沈む。op.nukes のない作戦には効かない（2026-10-27）', JSON.stringify([nk.short, nk.late, nk.sunk, nk.none]));
    /* 第6節: 核を積んだ隊と戦艦の名札に印と琥珀の縁（見本の案A）、任務欄の戦艦の印を押すとその戦艦へ視点が飛ぶ（案D、2026-10-28） */
    const nm = await page.evaluate(() => {
      const r = {}; WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk();
      const G = nuke.G, others = fleets.filter(f => f.alive && !G.includes(f));
      r.wait = G.every(nukeCarrier) && !others.some(nukeCarrier);
      goalFlashT = 0; updateGoal(); const press = i => { const m = document.querySelector(`#goalGates svg.nb[data-nb="${i}"]`); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); return camAnim && camAnim.tT; };
      const fold0 = goalEl.classList.contains('fold'), t = press(3); r.fly0 = !!t && t.distanceTo(G[1].pos) < .01 && goalEl.classList.contains('fold') === fold0;
      lured = { at: opMin(), by: 'test' }; step(.05);
      r.board = nuke.state === 'board' && nuke.bbs.every(b => nukeCarrier(b.f)) && !G.some(nukeCarrier);
      goalFlashT = 0; updateGoal(); const t1 = press(4); r.fly1 = !!t1 && t1.distanceTo(nuke.bbs[4].f.pos) < .01;
      const b0 = nuke.bbs[0].f; while (b0.alive) damage(b0, b0.hpPool + 1, fleets[0]); goalFlashT = 0; updateGoal();
      r.sunk = !nukeCarrier(b0) && !document.querySelector('#goalGates svg.nb[data-nb="0"]').classList.contains('go');
      return r;
    });
    check(nm.wait && nm.fly0 && nm.board && nm.fly1 && nm.sunk, '第6節: 核を積んだ隊・戦艦の名札に印（案A）、任務欄の戦艦の印を押すとその戦艦へ視点が飛ぶ（案D、2026-10-28）', JSON.stringify(nm));
    /* 第6節の型の切り替え（2026-10-27）: 槍2は戦艦が鉱山へ向かうと（descend）降りる戦艦を狙い、霧と鎚は着底（land）で動き出す。起爆（ignite）で
       霧と鎚の残りは残った戻せる推進器の守りへ。槍1・槍2は守りに回らない。拠点は正面に残る（2026-10-29）。方角守備隊はそのまま。槍の「そろう」は15分で打ち切る */
    const sw = await page.evaluate(() => {
      const F = n => fleets.find(f => f.name === n), P = n => packs.find(x => x.name === n), now = () => gameSec * CLOCK_RATE, mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      const tough = () => { for (const f of fleets) if (f.ally && f.alive) f.hpPool = Math.max(f.hpPool, f.hp * f.ships.length * 20); };
      const later = sec => { const t = gameSec + sec; while (gameSec < t && !over) { step(.05); tough(); } };   // the packs turn in the next round of enemyAI (every half second)
      WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); tough();
      const r = {}; mins(2); lured = { at: opMin(), by: 'test' }; later(.6);
      r.wait = { s2: P('槍2').t0, ham: P('霧と鎚').t0, s1: P('槍1').doctrine };
      mins(now() + 15.3); later(.6);
      r.desc = { s2: P('槍2').t0 != null, ham: P('霧と鎚').t0 != null, goal: P('槍2').G && P('槍2').G.nukeSt || null };
      nuke.bbs.forEach(b => { if (b.f && b.f.alive) { b.f.pos.copy(b.slot); b.f.order = null; } }); later(.6);
      r.land = { ham: P('霧と鎚').t0 != null, goal: P('霧と鎚').G && P('霧と鎚').G.nukeSt || null };
      mins(nuke.fuseAt + .1); later(.6);
      const s2 = P('槍2'), hm = P('霧と鎚'), mid = P('中の拠点'), s1 = P('槍1');
      r.ignite = { state: nuke.state, s2: s2.doctrine, hamWardAll: [].concat(hm.ward).slice(0, 6).join(','),
        ham: hm.doctrine, hamWard: [].concat(hm.ward)[0], post: hm.mem.filter(f => f.alive).every(f => f.post.distanceTo(F('推進器 北2').pos) < .01), step: String(hm.step),
        mid: mid.doctrine + ':' + [].concat(mid.ward).some(w => typeof w === 'string') + ':' + mid.mem.every(f => !f.alive || f.ai === 'guard'), s1: s1.doctrine, north: P('北守備隊').t0 != null, scr: P('西上守備隊').doctrine };
      /* the spears' wait for each other ends after `sync` minutes */
      WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); mins(35.5); const q = P('槍1'); q.mem.forEach(f => { f.packArr = null; f.speed = 1e-4; }); const t0 = q.t0;
      mins(t0 + 14.5); const st14 = q.step; mins(t0 + 15.6); r.sync = [st14, q.step, WOS_DATA.doctrines.mars.spear.sync];
      return r;
    });
    check(sw.wait.s2 == null && sw.wait.ham == null && sw.wait.s1 === 'spear' && sw.desc.s2 && !sw.desc.ham && sw.land.ham && ['descend', 'landed'].includes(sw.land.goal),
      '第6節: 槍2は戦艦が鉱山へ向かうと、霧と鎚は着底すると動き出し、隊を離れた核を積んだ戦艦を狙う（2026-10-27）', JSON.stringify([sw.wait, sw.desc, sw.land]));
    check(sw.ignite.state === 'fired' && sw.ignite.s2 === 'spear' && sw.ignite.ham === 'rockShield' && sw.ignite.hamWardAll === '推進器 北2,推進器 北1,推進器 北3,推進器 東2,推進器 東1,推進器 東3'
      && sw.ignite.hamWard === '推進器 北2' && sw.ignite.post && sw.ignite.step === '0'
      && sw.ignite.mid === 'rockShield:false:true' && sw.ignite.s1 === 'spear' && sw.ignite.north && sw.ignite.scr === 'screen',
      '第6節: 起爆で霧と鎚の残りは残った戻せる推進器の守り（岩の盾）へ、持ち場は推進器。槍1・槍2は守りに回らない。拠点は正面に残る（2026-10-29）。北守備隊が動き出し、方角守備隊はそのまま（2026-10-28）', JSON.stringify(sw.ignite));
    check(sw.sync[0] === 0 && sw.sync[1] === 1 && sw.sync[2] === 15, 'ドクトリン（型）: 槍が着かなくても、そろう待ちは15分で打ち切る（2026-10-27）', JSON.stringify(sw.sync));
    /* 友軍の陽動（ai:'feint'、2026-10-28）: 本隊は撃たず小型機も出さない。触れる隊（駆逐艦）は方角守備隊の見える艦（予備でない）を射程の端から撃ち、内側に入られると20秒下がる。
       推進器は撃たない。核の戦艦を3隻失うと（起爆の前）艦だけを撃つ本気の攻撃に移り（台詞）、60分で下がる。2隻なら移らない。21:00 に下がる */
    const fe = await page.evaluate(() => {
      const said = [], logE = logEvent; logEvent = (a, b) => { said.push(a + b); logE(a, b); };
      const F = n => fleets.find(f => f.name === n), P = n => packs.find(x => x.name === n), mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      const kill = f => { while (f && f.alive) damage(f, f.hpPool + 1, fleets[0]); };
      const r = {};
      try {
        WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); said.length = 0;
        const main = fleets.filter(f => f.feint === '左上' && !f.touch), touch = fleets.filter(f => f.feint === '左上' && f.touch);
        const tough = () => { for (const G of nuke.G) if (G.alive) G.hpPool = Math.max(G.hpPool, G.hp * G.ships.length * 20); };
        mins(30); const S = P('西上守備隊'), atk = () => touch.find(f => f.alive && f.order && f.order.type === 'attack' && f.packSpot);
        for (let i = 0; i < 4000 && !atk() && !over; i++) { step(.05); tough(); }
        r.main = { evade: main.every(f => !f.alive || f.stance === 'evade'), craft: !wings.some(w => w.alive && w.carrier.feint && w.carrier.mode === 'feint' && !w.carrier.touch), out: main.every(f => !f.alive || f.feintOut) };
        const t = atk();
        r.touch = t ? { on: S.mem.includes(t.order.target) && t.order.target.packSlot !== 'reserve', edge: t.packSpot ? +(t.packSpot.distanceTo(t.order.target.pos) / t.range).toFixed(2) : null } : null;
        /* a thruster alone in reach: the feints never fire on it */
        const T = F('推進器 西の上2'), f0 = touch.find(f => f.alive) || touch[0], m0 = main[0]; T.seen = true;
        const others = fleets.filter(x => x.team === 1 && x.alive && x !== T); others.forEach(x => { x.alive = false; });
        for (const f of [f0, m0]) { f.alive = true; f.order = null; f.stance = 'engage'; f.pos.copy(T.pos).sub(bodyC).setLength(T.pos.distanceTo(bodyC) + f.range * .4).add(bodyC); }
        r.thr = [fireTargetOf(f0), fireTargetOf(m0)].map(x => x ? x.name : null);
        others.forEach(x => { x.alive = true; });
        /* closed on: back to the lane for 20 s */
        const e = S.mem.find(x => x.alive); f0.feintBack = 0; f0.feintOut = true; f0.mode = 'feint'; e.pos.copy(f0.pos).add(new THREE.Vector3(f0.range * .3, 0, 0)); e.seen = true;
        allyAI(); r.back = +(f0.feintBack - gameSec).toFixed(1);
        /* two battleships lost: nothing; the third: all out */
        WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); said.length = 0; mins(5);
        const bb = () => nuke.G.flatMap(G => G.ships.filter(s => s.type === 'bb').map(s => [G, s]));
        const sink = () => { const [G, s] = bb()[0]; G.ships.splice(G.ships.indexOf(s), 1); G.hpPool -= G.hp; step(.05); };
        sink(); sink(); r.two = { mode: fleets.filter(f => f.feint && f.alive).every(f => f.mode === 'feint'), all: !!feintAll };
        const run = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) { step(.05); tough(); } };
        sink(); run(opMin() + .6); const A = fleets.filter(f => f.feint && f.alive);
        r.three = { mode: A.every(f => f.mode === 'assault'), engage: A.every(f => f.stance === 'engage'), said: said.some(t => t.includes('全艦攻撃に移れ')) && said.some(t => t.includes('帰り道は、デナリが知ってる')) };
        const g = fleets.find(x => x.fixed && x.type === 'aa' && x.team === 1), c = A[0]; g.seen = true; const oth = fleets.filter(x => x.team === 1 && x.alive && x !== g); oth.forEach(x => { x.alive = false; });
        c.order = null; c.pos.copy(g.pos).sub(bodyC).setLength(g.pos.distanceTo(bodyC) + c.range * .4).add(bodyC); r.three.gun = fireTargetOf(c) ? fireTargetOf(c).name : null; oth.forEach(x => { x.alive = true; });
        run(feintAll.at + 60.5); r.three.after = fleets.filter(f => f.feint && f.alive).every(f => f.mode === 'gone');
        /* 21:00: the feints leave */
        WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); mins(3); gameSec = 480.1 / CLOCK_RATE; allyAI(); r.end = fleets.filter(f => f.feint && f.alive).every(f => f.mode === 'gone');
        return r;
      } finally { logEvent = logE; }
    });
    check(fe.main.evade && fe.main.craft && fe.main.out && fe.touch && fe.touch.on && fe.touch.edge >= .9 && fe.touch.edge <= 1.1 && fe.thr.every(x => x === null) && fe.back >= 19,
      '第6節: 陽動の本隊は撃たず小型機も出さない。触れる隊は方角守備隊の艦を射程の端から撃ち、内側に入られると20秒下がる。推進器は撃たない（2026-10-28）', JSON.stringify(fe));
    check(fe.two.mode && !fe.two.all && fe.three.mode && fe.three.engage && fe.three.said && fe.three.gun === null && fe.three.after && fe.end,
      '第6節: 核の戦艦を3隻失うと陽動は艦だけを撃つ本気の攻撃へ（ウォン中将とオリヴェイラ少佐の台詞）、60分で下がる。2隻では移らない。21:00 に陽動は下がる（2026-10-28）', JSON.stringify([fe.two, fe.three, fe.end]));
    /* 第6節の戦艦の護衛（ユーザー決定 2026-10-29: 陽動から割いた第29・第30 支隊。battle/sim.js の escortAI）: 待つあいだは戦艦の隊のそばに立ち、戦艦に寄る揚陸艦を
       近くのほかの艦より先に叩く。第二段階は1隻ずつになった戦艦について道を降りる。移乗で分かれた戦艦の耐久は艦種の割合（隊の平均でなく、2026-10-29） */
    const esc6 = await page.evaluate(() => {
      const F = n => fleets.find(f => f.name === n), mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      const tough = () => { for (const f of fleets) if (f.ally && f.alive) f.hpPool = Math.max(f.hpPool, f.hp * f.ships.length * 20); };
      const run = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) { step(.05); tough(); } };
      const r = {};
      /* the battleships' share when they split (no damage yet) */
      WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); mins(1); lured = { at: opMin(), by: 'test' }; step(.05); step(.05);
      const bb = techFleet(0, { type: 'bb', n: 1 }).hp * HP_K, b1 = nuke.bbs.map(b => b.f).filter(Boolean);
      r.share = { k: b1.map(f => +(f.hpPool / bb).toFixed(2)).join(','), crew: nuke.G.map(G => G.alive ? +(G.hpPool / G.ships.length / G.hp).toFixed(2) : null).join(',') };
      WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk();
      const E = ['第29 前衛巡洋 支隊', '第30 護衛 支隊'].map(F), G = nuke.G;
      const mid = L => L.reduce((v, g) => v.add(g.pos), new THREE.Vector3()).multiplyScalar(1 / L.length);
      run(20); r.mode = E.map(f => f.mode).join(','); r.wait = E.map(f => Math.round(f.pos.distanceTo(mid(G.filter(g => g.alive)))));
      /* an assault ship and, nearer the escorts, a frigate by the battleships: both go for the assault ship */
      const M = F('第22 突撃揚陸 戦闘隊'), Q = F('第22 護衛警衛 戦闘隊'), c = mid(E);
      M.pos.copy(G[0].pos).add(new THREE.Vector3(-22, 0, -12)); Q.pos.copy(c).add(new THREE.Vector3(-4, 0, -4)); [M, Q].forEach(x => { x.seen = true; x.order = null; });
      allyAI(); r.mas = E.map(f => !!(f.order && f.order.type === 'attack' && f.order.target === M)).join(',');
      M.pos.set(0, 0, -300); Q.pos.set(0, 0, -300); M.seen = Q.seen = false;
      /* the second stage: with the battleships on their way down */
      const p0 = E.map(f => f.pos.clone()); lured = { at: opMin(), by: 'test' }; run(opMin() + 15.5); r.desc = nuke.state;
      run(opMin() + 8); const B = nuke.bbs.map(b => b.f).filter(f => f && f.alive);
      r.follow = { gap: E.map(f => Math.round(f.pos.distanceTo(mid(B)))), moved: E.map((f, i) => Math.round(f.pos.distanceTo(p0[i]))), bbMoved: Math.round(mid(B).distanceTo(p0[0])) };
      nuke.state = 'wait'; drawRoute();   // the way down off the screen for the next check
      return r;
    });
    check(esc6.share.k === '0.9,0.9,0.9,0.8,0.8' && esc6.mode === 'escort,escort' && esc6.wait.every(d => d <= 25) && esc6.mas === 'true,true'
      && esc6.desc === 'descend' && esc6.follow.gap.every(d => d <= 30) && esc6.follow.moved.every(d => d >= 40),
      '第6節の戦艦の護衛（2026-10-29）: 第29・第30 は戦艦のそばで待ち、寄る揚陸艦を先に叩き、第二段階は降りる戦艦について行く。分かれた戦艦の耐久は戦艦の分（9割・8割）', JSON.stringify(esc6));
    /* 第6節の任務欄（見本の案B）と切り替え（目標更新中）、戦艦の道（案A）、推進器の印（案C）: 第一段階は西上・東下の守備隊ごとに六角9つ（持ち場にいる艦を塗る）・戦艦・
       「半分を切れば第二段階（遅くとも 15:00）」。合図で一瞬「目標更新中」、そのあと目盛りと推進器。戦艦の道は第二段階で出る */
    const hd = await page.evaluate(() => {
      const P = n => packs.find(x => x.name === n), mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      const kill = f => { while (f && f.alive) damage(f, f.hpPool + 1, fleets[0]); };
      WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); for (const f of fleets) if (f.feint) { f.alive = false; f.el.remove(); }
      mins(3); goalFlashT = 0; updateGoal(); const gg = document.getElementById('goalGates'), r = {};
      r.p1 = { text: document.getElementById('goalText').textContent, hx: gg.querySelectorAll('svg.hx').length, rows: [...gg.querySelectorAll('.nkr .nw')].map(x => x.textContent).join(','),
        v: [...gg.querySelectorAll('.nkr .v')].map(x => x.textContent).join(','), say: gg.querySelector('.nkw').textContent, scale: !!gg.querySelector('svg.nks'), route: !document.querySelector('#nkRoute .ln') };
      const S = P('東下守備隊').mem.find(f => f.packSlot === 'wall'); kill(S); updateGoal(); r.p1.v2 = [...gg.querySelectorAll('.nkr .v')].map(x => x.textContent).join(',');
      [...P('西上守備隊').mem, ...P('東下守備隊').mem].filter(f => f.packSlot !== 'reserve').forEach(kill); mins(50.6);
      r.flash = { upd: goalEl.classList.contains('upd') && gg.textContent === '目標更新中', lured: !!lured };
      return r;
    });
    await page.waitForTimeout(1700);
    const hd2 = await page.evaluate(() => { updateGoal(); const gg = document.getElementById('goalGates');
      return { upd: goalEl.classList.contains('upd'), scale: !!gg.querySelector('svg.nks'), thr: gg.querySelectorAll('.nkr svg:not(.nb)').length, text: document.getElementById('goalText').textContent }; });
    await page.waitForTimeout(300);
    const hd3 = await page.evaluate(() => ({ route: (document.querySelector('#nkRoute .ln') || { getAttribute: () => '' }).getAttribute('d').length > 20, mine: !!document.querySelector('#nkRoute circle.dot'),
      chev: document.querySelectorAll('#nkRoute .ch path').length, thr: (() => { const T = fleets.find(f => f.name === '推進器 東2'); return !thrOff(T); })() }));
    check(hd.p1.text === '陽動が方角守備隊を引き剥がすまで、戦艦を守る' && hd.p1.hx === 18 && hd.p1.rows === '西上,東下,戦艦' && hd.p1.v === '9/9,9/9,5/5' && hd.p1.v2 === '9/9,6/9,5/5'
      && hd.p1.say === '半分を切れば第二段階（遅くとも 15:00）' && !hd.p1.scale && hd.p1.route,
      '第6節の任務欄（第一段階、見本の案B）: 西上・東下の守備隊ごとに六角9つ（持ち場にいる艦）と N/9、戦艦 N/5、「半分を切れば第二段階（遅くとも 15:00）」。推進器と戦艦の道はまだ出ない（2026-10-28）', JSON.stringify(hd.p1));
    check(hd.flash.upd && hd.flash.lured && !hd2.upd && hd2.scale && hd2.thr === 6 && hd2.text.includes('移っている') && hd3.route && hd3.mine && hd3.chev >= 2 && hd3.thr,
      '第6節: 第二段階で任務欄に一瞬「目標更新中」、そのあと目盛りと戻せる推進器の印。戦艦の道（琥珀の点線と›、鉱山に◎）と推進器の印が出る（2026-10-28）', JSON.stringify([hd.flash, hd2, hd3]));
    /* 第6節のオートモード（2026-10-28 に陽動の形へ作り直した。battle/sim.js の autoDenali）: 開始からすぐ動く。第一段階は一部（対空の強い隊）が戦艦のそばで、ほかは戦艦に寄る敵か、
       西上守備隊（砲台から離れたもの）。第二段階は護衛と、鉱山のまわりの砲台を先に払う隊。起爆のあとは戻せる推進器（東2から、そばの砲台が先）。西の推進器は撃たない */
    const dauto = await page.evaluate(() => {
      const F = n => fleets.find(f => f.name === n), mins = m => { const end = m / CLOCK_RATE; while (gameSec < end && !over) step(.05); };
      const kill = n => { const f = F(n); while (f && f.alive) damage(f, f.hpPool + 1, fleets[0]); };
      const mine = () => fleets.filter(f => f.team === 0 && f.alive && !f.ward && !f.ally && !f.fixed && !f.isCarrier);
      const tough = () => { for (const f of fleets) if (f.team === 0 && f.alive) f.hpPool = Math.max(f.hpPool, f.hp * f.ships.length * 20); };
      WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); autoMode = true; tough();
      const bbs = () => nuke.G.filter(G => G.alive);
      const r = {}; mins(1.5); r.start = mine().length > 0 && mine().every(f => f.order || bbs().some(b => f.pos.distanceTo(b.pos) < op.auto.escortR * 2 + 4));   // moving, or by the battleships already
      r.esc = mine().filter(f => f.order && f.order.type === 'move' && bbs().some(b => f.order.dest.distanceTo(b.pos) < op.auto.escortR + 1.5)).length;
      r.help = mine().filter(f => f.order && f.order.type === 'move' && f.order.dest.distanceTo(packVec(op.auto.helpVia[0])) < 1).length;   // the west way round the front (2026-10-29)
      lured = { at: opMin(), by: 'test' }; mins(opMin() + 1); tough();
      const near = g => g.pos.distanceTo(nuke.mine) < op.auto.mineR;
      const west = d => op.auto.helpVia.some(v => d.distanceTo(packVec(v)) < 1);   // to the mine by the west way round the front (2026-10-29)
      r.p2 = { obj: mine().filter(f => f.order && (f.order.target ? near(f.order.target) && f.order.target.fixed : false) || f.order && f.order.type === 'move' && (f.order.dest.distanceTo(nuke.mine) < op.auto.mineR + 25 || west(f.order.dest))).length,
        esc: mine().filter(f => f.order && f.order.type === 'move' && nuke.bbs.some(b => b.f && f.order.dest.distanceTo(b.f.pos) < op.auto.escortR + 1.5)).length };
      Object.assign(nuke, { state: 'fired', fireAt: opMin(), lastMin: opMin(), km: 30 }); packCue.ignite = true; mins(opMin() + 1);
      r.fired = autoObj && autoObj.name;
      fleets.filter(f => f.team === 1 && f.fixed && f.type === 'aa').forEach(f => kill(f.name)); mins(opMin() + 1);
      r.thr = autoObj && autoObj.name;
      /* a fleet of ours right by 推進器 西1, with it in sight and in reach: it does not fire on it in the auto mode */
      const w = F('推進器 西1'), f = mine()[0]; w.seen = true; f.order = null;
      f.pos.copy(w.pos).sub(bodyC).setLength(w.pos.distanceTo(bodyC) + f.range * .4).add(bodyC);
      const others = fleets.filter(x => x.team === 1 && x.alive && x !== w); others.forEach(x => { x.alive = false; });
      r.west = { auto: (fireTargetOf(f) || {}).name || null }; autoMode = false; r.west.off = (fireTargetOf(f) || {}).name || null;
      others.forEach(x => { x.alive = true; });
      r.ops = WOS_DATA.operations.filter(o => o.auto).map(o => o.id).join(',');
      return r;
    });
    check(dauto.start && dauto.esc >= 1 && dauto.help >= 1 && dauto.p2.obj >= 1 && dauto.p2.esc >= 1 && dauto.fired === '第5 デナリ砲台' && dauto.thr === '推進器 東2'
      && dauto.west.auto !== '推進器 西1' && dauto.west.off === '推進器 西1' && dauto.ops === 'denaliBreak',
      '第6節のオートモード（2026-10-28）: 開始からすぐ動き、第一段階は戦艦のそばと西上守備隊へ、第二段階は護衛と鉱山の砲台、起爆のあとは戻せる推進器（そばの砲台から、東2）。西の推進器は撃たない。op.auto は第6節だけ', JSON.stringify(dauto));
    /* 見るための絵: 第一段階（陽動が方角守備隊に触れたところ）と第二段階（戦艦の道・推進器の印・任務欄） */
    await page.evaluate(() => { WOS.start({ op: 'denaliBreak' }); setSpeed(0); if (talking) endTalk(); const end = 30 / CLOCK_RATE; while (gameSec < end && !over) step(.05);
      controls.target.set(-30, 10, 120); camera.position.set(60, 170, 330); controls.update(); updateGoal(); });
    await page.waitForTimeout(500);
    await shot('25-denali-stage1');
    await page.evaluate(() => { for (const f of fleets) if (f.alive && (f.name.startsWith('第19 ') || f.name.startsWith('第11 ') || f.name.startsWith('第14 ') || f.name.startsWith('第15 ') || f.name.startsWith('第12 '))) { while (f.alive) damage(f, f.hpPool + 1, fleets[0]); }
      const end = 51 / CLOCK_RATE; while (gameSec < end && !over) step(.05); goalFlashT = 0; const e2 = 70 / CLOCK_RATE; for (const f of fleets) if (f.ally) f.hpPool *= 20; while (gameSec < e2 && !over) step(.05);
      controls.target.set(-40, 20, 90); camera.position.set(80, 150, 260); controls.update(); updateGoal(); });
    await page.waitForTimeout(500);
    await shot('25b-denali-stage2');
    await page.evaluate(() => openMenu());
    /* holding Ctrl fast-forwards the conversation */
    await page.click('[data-go="sortie"]'); await page.click('[data-op="shinano"]');
    await page.click('#goBattle'); await page.waitForTimeout(1200);
    const ff0 = await page.evaluate(() => talkQ.length);
    await page.keyboard.down('Control'); await page.waitForTimeout(800); await page.keyboard.up('Control');
    const ff1 = await page.evaluate(() => ({ left: talkQ.length, talking }));
    check(ff0 >= 2 && (ff0 - ff1.left >= 2 || !ff1.talking), '会話: Ctrl 長押しで早送り', JSON.stringify([ff0, ff1]));
    await page.click('#talkSkip').catch(() => {});
    /* with the story off, the battle starts without the conversation */
    await page.evaluate(() => openMenu());
    await page.click('#mainNav [data-go="opt"]'); await page.click('[data-opt="story"]'); await page.click('[data-s="opt"] .back');
    await page.click('[data-go="sortie"]'); await page.click('[data-op="shinano"]');
    await page.click('#goBattle'); await page.waitForTimeout(1200);
    const off = await page.evaluate(() => ({ talking, hidden: document.getElementById('talk').hidden, story: WOS_OPT.story }));
    check(!off.talking && off.hidden && !off.story, 'オプション: ストーリーをオフにすると会話を出さない', JSON.stringify(off));
    /* the debug auto mode (user decision 2026-10-15): a switch in the title's debug panel; the talk reads on by itself, the deploy step
       ends by itself and our fleets get orders of their own (sim.js autoAI) */
    await page.evaluate(() => openMenu());
    await page.click('#mainNav [data-go="opt"]'); await page.click('[data-opt="story"]'); await page.click('[data-s="opt"] .back');
    if (!(await page.isVisible('#dbgB [data-dbg="auto"]'))) await page.click('#dbgT');
    await page.click('#dbgB [data-dbg="auto"]');
    await page.click('[data-go="sortie"]'); await page.click('[data-op="nile"]'); await page.click('#goBattle'); await page.waitForTimeout(400);
    const au0 = await page.evaluate(() => ({ auto: autoMode, left: talkQ.length, talking }));
    await page.waitForTimeout(2200);
    const au = await page.evaluate(() => { const r = { left: talkQ.length }; while (talking) nextTalk(); r.deploying = deploying;
      for (let i = 0; i < 40; i++) step(.05); r.orders = fleets.filter(f => f.team === 0 && !f.ward && f.alive && f.order).length; return r; });
    check(au0.auto && au0.talking && au.left < au0.left && !au.deploying && au.orders > 0, 'デバッグ: オートモードでは会話が自動で進み、配置もそのまま始まり、自軍が自分で動く', JSON.stringify([au0, au]));
    await page.evaluate(() => openMenu()); await page.click('#dbgB [data-dbg="auto"]');
  } catch (e) {
    check(false, '実行中に例外', e.message);
  }

  check(errors.length === 0, 'ページのエラーなし', errors.join(' / '));
  await browser.close();
  console.log(failed ? `\n${failed}件の確認に失敗しました。` : '\nすべての確認に通りました。');
  process.exit(failed ? 1 : 0);
})();
