/* #459 の前後で node tools/npc-fixes-measure.cjs before|after を実行する。
   随伴レビューの前後は review-before|review-after。120秒を過ぎた随伴の中央値・P90を出す。
   バイコヌール mars/earth standard、seed 1〜3、600秒を直列で実行。
   毎ゲーム秒の任務・実際の移動先を測り、区間と判断ログを test-results/ に保存する。 */
const fs = require('node:fs');
const path = require('node:path');
const { openGame, ROOT } = require('./browser.cjs');
const { setupNpcSim, advanceNpcSim, parseArgs } = require('./npc-sim.cjs');

function observe() {
  const start = npcMeasure.start, teams = [0, 1].map(() => ({ intervals: [], peak: null, samples: [] }));
  const distances = [], escortDistances = [], escortTrace = [];
  let second = 0, trips = 0;
  const passengers = new Map();
  const round = n => +n.toFixed(2);
  const coord = p => p && [round(groundMapX(p.x)), round(groundMapY(p.z))];
  const pathFailures = [];
  const oldOrder = order;
  order = (f, o) => {
    const result = oldOrder(f, o);
    if (f.groundKind === 'apc' && o.type === 'move' && o.path === null) {
      pathFailures.push({ second: round(gameSec - start), name: f.name, at: coord(f.pos), dest: coord(o.dest) });
    }
    return result;
  };
  const near = (p, hq) => p && groundDistanceTo({ pos: p }, hq) <= hq.radiusKm * GROUND_SCALE;
  const oldStep = step;
  step = dt => {
    oldStep(dt);
    for (const f of fleets) {
      if (f.embarked?.groundKind === 'apc') {
        if (!passengers.has(f.id)) passengers.set(f.id, { carrier: f.embarked, start: f.embarked.pos.clone() });
      } else if (passengers.has(f.id)) {
        const ride = passengers.get(f.id);
        if (f.alive && ride.carrier.alive && ride.start.distanceTo(ride.carrier.pos) > 0) trips++;
        passengers.delete(f.id);
      }
    }
    if (gameSec - start < second + 1 - 1e-8) return;
    second++;
    for (const team of [0, 1]) {
      const c = npcGroundState?.commanders.get(team), hq = groundSites.find(s => s.id === op.groundHQ[team]);
      if (!c?.plan || !hq) continue;
      const live = fleets.filter(f => f.team === team && f.alive && f.hpPool > 0 && !groundAbsent(f));
      const land = live.filter(f => !['air', 'sea'].includes(groundMoveKind(f)));
      const assignments = new Map(c.plan.tasks.flatMap(k => k.units.map(x => [x.id, { k, as: x.as }])));
      const mainTask = m => {
        const a = assignments.get(m.id);
        return a?.as === 'main' && ['seize', 'fix', 'cut', 'hold'].includes(a.k.type) &&
          ['line', 'shock'].includes(WOS_DATA.npc.roles.ground[m.groundKind]) ? a.k : null;
      };
      for (const f of land.filter(f => f.groundKind === 'apc')) {
        const { k, as } = assignments.get(f.id) || {};
        if (!k || !['seize', 'fix', 'cut', 'hold'].includes(k.type) || !['support', 'escort'].includes(as)) continue;
        const mains = land.filter(m => mainTask(m)).map(m => ({ m, km: groundDistanceTo(m, f) / GROUND_SCALE }))
          .sort((a, b) => a.km - b.km);
        const nearMain = mains.find(({ m }) => mainTask(m) === k);
        if (!nearMain) continue;
        const { m, km } = nearMain;
        distances.push(km);
        if (as === 'escort') {
          escortDistances.push(km);
          const unit = u => ({ name: u.name, at: coord(u.pos), order: u.order?.type ?? null,
            dest: coord(u.order?.dest || u.order?.target?.pos), path: u.order?.path?.L / GROUND_SCALE || null,
            speed: round(speedOf(u) / GROUND_SCALE), hp: round(u.hpPool), supply: round(u.groundSupply ?? 0),
            last: coord(npcGroundState.last.get(u.id)) });
          escortTrace.push({ second, team, task: k.key, stage: k.stage, km,
            apc: unit(f), main: unit(m), nearestTask: mainTask(mains[0].m).key, nearestKm: round(mains[0].km) });
        }
      }
      if (!land.length) continue;
      const units = land.map(f => {
        const { k, as } = assignments.get(f.id) || {};
        const dest = f.order?.dest || f.order?.target?.pos;
        const homeTask = k && ['hold', 'reserve', 'refit', 'retire'].includes(k.type) && k.zone === hq.id;
        const orderedHome = !!(near(dest, hq) || !dest && homeTask && near(f.pos, hq));
        return { id: f.id, name: f.name, kind: f.groundKind, task: k?.key, as, reason: k?.why,
          order: f.order?.type, kmToHQ: round(groundDistanceTo(f, hq) / GROUND_SCALE),
          destKmToHQ: dest && round(groundDistanceTo({ pos: dest }, hq) / GROUND_SCALE), orderedHome,
          returning: !!(near(dest, hq) && !near(f.pos, hq)), morale: f.groundMorale, supply: f.groundSupply };
      });
      const home = units.filter(u => u.orderedHome).length, returning = units.filter(u => u.returning).length;
      const sample = { second, home, returning, total: units.length, posture: c.plan.posture, ratio: round(c.plan.ratio) };
      const stats = teams[team];
      const detail = () => ({ ...sample, units, log: c.log.filter(l => l.t >= gameSec - 15) });
      if (!stats.peak || home / units.length > stats.peak.home / stats.peak.total) stats.peak = detail();
      if (home * 10 < units.length * 7) continue;
      stats.samples.push({ ...sample, tasks: units.filter(u => u.orderedHome).map(u => u.task || u.order) });
      const last = stats.intervals.at(-1);
      if (last?.end === second - 1) last.end = second;
      else stats.intervals.push({ start: second, end: second, first: detail() });
    }
  };
  const median = values => {
    if (!values.length) return null;
    values.sort((a, b) => a - b);
    return round((values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2);
  };
  window.npcFixesResult = () => {
    const late = escortTrace.filter(x => x.second > 120).map(x => x.km);
    return { seconds: second, teams: teams.map((s, team) => ({ ...s, log: npcGroundState.commanders.get(team)?.log })),
      apc: { medianKm: median(distances), samples: distances.length, escortSamples: escortDistances.length,
        escortMedianKm: median(escortDistances), lateSamples: late.length, lateMedianKm: median(late),
        lateP90Km: late.length ? round(late[Math.ceil(late.length * .9) - 1]) : null, trips,
        lift: npcGroundLiftActive(), escortTrace, pathFailures } };
  };
}

async function measure(seed) {
  const { browser, page, errors } = await openGame({ width: 1600, height: 900 });
  try {
    await page.evaluate(setupNpcSim, parseArgs(['baikonur', 'mars', 'earth', 'standard', String(seed), '600']));
    await page.evaluate(observe);
    await page.evaluate('window.advanceNpcSim=' + advanceNpcSim.toString());
    for (let end = 5; !(await page.evaluate(sec => advanceNpcSim(sec), end)); end += 5) {}
    if (errors.length) throw new Error(errors.join('\n'));
    return await page.evaluate(() => npcFixesResult());
  } finally {
    await browser.close();
  }
}

async function main() {
  const phase = process.argv[2];
  if (!['before', 'after', 'review-before', 'review-after'].includes(phase)) throw new Error('before|after|review-before|review-after');
  const dir = path.join(ROOT, 'test-results', 'npc-fixes');
  fs.mkdirSync(dir, { recursive: true });
  for (const seed of [1, 2, 3]) {
    const r = await measure(seed);
    fs.writeFileSync(path.join(dir, `${phase}-${seed}.json`), JSON.stringify(r, null, 2) + '\n');
    if (phase.startsWith('review-')) {
      const a = r.apc;
      console.log(`| ${phase} | ${seed} | ${r.seconds} | ${a.lateSamples} | ${a.lateMedianKm ?? '—'} | ${a.lateP90Km ?? '—'} | ${a.trips} |`);
      continue;
    }
    for (const [team, s] of r.teams.entries()) {
      const longest = Math.max(0, ...s.intervals.map(i => i.end - i.start + 1));
      const moving = s.samples.filter(i => i.returning * 10 >= i.total * 7).length;
      console.log(`| ${phase} | ${seed} | ${team} | ${r.seconds} | ${s.samples.length} | ${longest} | ${moving} | ${s.peak?.home}/${s.peak?.total} @${s.peak?.second} | ${team === 0 ? r.apc.medianKm ?? '—' : '—'} | ${team === 0 ? r.apc.escortSamples : '—'} | ${team === 0 ? r.apc.trips : '—'} |`);
    }
  }
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
