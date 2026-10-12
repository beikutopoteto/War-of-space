/* 第2節「後退」を最後まで早送りして、時刻ごとの様子を出す（釣り合わせの確かめ）。1〜2分かかる。
   node tools/retreat-sim.cjs <a|b|c> [rescue]
   a: 駐屯隊が船団のそばに付き、近づいた敵を撃つ（揚陸艦が先。本隊も撃つ）
   b: 本隊とは撃ち合わない（命令優先で船団のそばに隠れ、本隊以外の近づいた敵だけを撃つ）
   c: 何もしない
   rescue を付けると、1隊がカワセミを助けに行く。PATCH=ファイル.js を付けると、始める前にそのスクリプトをページで実行する
   （WOS_DATA を書き換えて数値を試す。データは書き換えない）。
   行の読み方: 戦闘の秒 時刻 段階 me=駐屯隊4隊の隻数 cv=輸送船の隻数@船団の位置(z) spot=見つかっている隊 en=敵（?は見えていない、L は引き返して消えた）。
   最後に勝ち負け（over outcome）、実時間の長さ、駐屯隊と船団に打撃を与えた敵の内訳 */
const { openGame } = require('./browser.cjs');
(async () => {
  const { browser, page, errors } = await openGame();
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  if (process.env.PATCH) await page.evaluate(require('fs').readFileSync(process.env.PATCH, 'utf8'));
  await page.click('[data-go="sortie"]'); await page.click('[data-op="retreat"]'); await page.click('#goBattle'); await page.waitForTimeout(800);
  await page.click('#talkSkip').catch(() => {}); await page.waitForTimeout(300);
  const strat = process.argv[2] || 'a', res = process.argv[3] === 'rescue';
  const r = await page.evaluate(([strat, res]) => {
    const log = [], T = () => `${gameSec.toFixed(0).padStart(4)}s ${clockStr()} ${phaseName}`;
    const mine = () => fleets.filter(f => f.team === 0 && !f.ward && !f.convoy && f.alive);
    const L = (t = '') => log.push(`${T()} me=${fleets.filter(f => f.team === 0 && !f.ward && !f.convoy).map(f => f.alive ? f.ships.length : '-').join('/')} cv=${convoy.alive ? convoy.ships.length + '@' + Math.round(convoy.pos.z) : convoy.escaped ? 'ESC' : 'x'} spot=${spotNow ? 'yes' : '-'} en=${fleets.filter(f => f.team === 1 && (f.alive || f.left)).map(f => f.name.replace(/^第(\d+) .*/, '$1') + (f.left ? 'L' : f.ships.length + (f.seen ? '' : '?'))).join(',')} ${t}`);
    const _l = logEvent; logEvent = function (a, b) { if (/本隊|引き返|揚陸|追撃|撃沈|全滅|救助|カワセミ/.test(a + b)) log.push(`${T()} LOG ${a} | ${(b || '').slice(0, 50)}`); return _l.apply(this, arguments); };
    const dmgBy = {}; const _d = damage; damage = function (t, amt, src) { if (t.team === 0 && t.kind === 'fleet' && (!t.ward || t.convoy)) { const k = (t.convoy ? 'cv<' : 'me<') + (src.kind === 'wing' ? 'W:' : '') + (src.carrier ? src.carrier.name : src.name).replace(/ 戦闘隊| エスカドラ/, ''); dmgBy[k] = (dmgBy[k] || 0) + amt; } return _d(t, amt, src); };
    const isMain = e => e.name === '第1 主力砲撃 エスカドラ';
    if (strat === 'b') for (const f of mine()) f.stance = 'evade';
    let n = 0;
    while (!over && n++ < 30000) { step(.05);
      if (n % 10) continue;
      if (strat !== 'c' && convoy.alive) {
        const seen = fleets.filter(e => e.team === 1 && e.alive && e.seen && e.ai !== 'scout' && e.pos.distanceTo(convoy.pos) < 90 && (strat === 'a' || !isMain(e)));
        mine().forEach((f, i) => {
          if (res && i === 0 && rescue && !rescue.done && !rescue.lost && rescue.ship.alive) { if (n % 40 === 0) order(f, { type: 'move', dest: rescue.ship.pos.clone() }); return; }
          const pri = e => (e.hangars && e.hangars.length ? 0 : 200) + e.pos.distanceTo(f.pos);
          const e = seen.sort((a, b) => pri(a) - pri(b))[0];
          if (e) { if (!(f.order && f.order.target === e)) order(f, { type: 'attack', target: e }); }
          else if (n % 40 === 0) { const a = i * 1.57; order(f, { type: 'move', dest: convoy.pos.clone().add(new THREE.Vector3(Math.cos(a) * 12, 0, Math.sin(a) * 12 + 10)) }); }
        });
      }
      if (n % 400 === 0) L();
    }
    L('END');
    return { log, over, outcome, sec: gameSec, rescued, dmgBy: Object.fromEntries(Object.entries(dmgBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])) };
  }, [strat, res]);
  console.log(r.log.join('\n'));
  console.log(`RESULT over=${r.over} outcome=${r.outcome} realSec=${r.sec.toFixed(0)}（${(r.sec / 60).toFixed(1)}分） rescued=${r.rescued}`);
  console.log('打撃の内訳', JSON.stringify(r.dmgBy), errors.slice(0, 3));
  await browser.close();
})();
