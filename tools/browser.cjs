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
module.exports = { openGame, ROOT };
