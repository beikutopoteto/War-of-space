/* War of Space の確認用の道具の共通部分: ヘッドレス Chromium でゲームを開く（CDN の代わりに node_modules/three を返す）。
   使い方は docs/maps.md の「確かめ方」。ゲーム本体は使わない */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const THREE_DIR = path.dirname(require.resolve(path.join(ROOT, 'node_modules/three/package.json')));
async function openGame(viewport = { width: 1280, height: 800 }) {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, route => { const u = route.request().url(); const rel = u.includes('cdnjs') ? 'build/three.min.js' : u.split('three@0.128.0/')[1]; route.fulfill({ path: path.join(THREE_DIR, rel), contentType: 'application/javascript' }); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '' }));
  await page.goto('file://' + path.join(ROOT, 'index.html')); await page.waitForTimeout(1200);
  return { browser, page, errors };
}
/* STAGE=1 in the tools (2026-10-20): the player's own fleets (built in the fleet editor) researched as far as the operation's stage,
   on the Earth's tables (battle/state.js techFleet), the speed at the same rate as the player's own. Call it once the battle is built */
async function toStage(page) {
  await page.evaluate(() => fleets.filter(f => f.team === 0 && f.stats && f.alive).forEach(f => { const rate = techRate('earth', op.stage || 0), v = techFleet(0, { comp: f.comp, hangar: f.hangar });
    const spd = Math.min(...Object.keys(f.comp).map(t => CLASS_MAX[t].spd)) * rate;
    Object.assign(f, { hp: v.hp * HP_K, hpPool: f.n * v.hp * HP_K, dmg: v.dmg, eva: v.eva, range: v.range, speed: (2 + spd) * SPEED_K, craft: { ...f.craft, ...v.craft } }); }));
}
module.exports = { openGame, toStage, ROOT };
