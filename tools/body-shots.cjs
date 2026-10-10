/* 天体（op.body）と岩くずの雲の見本の画像を撮る。艦隊と UI を消して、決まった向きから写す。
   node tools/body-shots.cjs <作戦id> <出力フォルダ> <向き...>
   向き: top（真上）, south / east（全体を斜めから）, mine（露天掘り）, townN（N 番目の町に寄る）, linkNM（町 N と M の間）
   例: node tools/body-shots.cjs denali /tmp/shots south top town0 link01 */
const fs = require('fs'), path = require('path');
const { openGame } = require('./browser.cjs');
(async () => {
  const [op, out, ...views] = process.argv.slice(2);
  if (!op || !out || !views.length) { console.log('node tools/body-shots.cjs <作戦id> <出力フォルダ> <向き...>'); return; }
  fs.mkdirSync(out, { recursive: true });
  const { browser, page, errors } = await openGame();
  await page.evaluate(op => { WOS_OPT.story = false; WOS.start({ op }); }, op);
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.body.classList.add('noui', 'nolabels'); for (const f of fleets) { f.alive = false; f.el.remove(); } over = true; });
  for (const v of views) {
    await page.evaluate(v => { camAnim = null; let d, dist, centre = false;
      if (v === 'mine') { d = bodyShape.mine.d.clone(); dist = 45; }
      else if (v.startsWith('town')) { d = bodyShape.towns[+v.slice(4)].clone(); dist = 12; }
      else if (v.startsWith('link')) { const t = bodyShape.towns; d = t[+v[4]].clone().add(t[+v[5]]).normalize(); dist = 34; }
      else if (v === 'top') { d = new THREE.Vector3(0, 1, .05).normalize(); dist = 330; centre = true; }
      else if (v === 'east') { d = new THREE.Vector3(1, .15, .35).normalize(); dist = 110; centre = true; }
      else { d = new THREE.Vector3(.3, .25, 1).normalize(); dist = 110; centre = true; }
      const tgt = centre ? new THREE.Vector3() : d.clone().multiplyScalar(bodyShape.R(d)); controls.target.copy(tgt);
      camera.position.copy(tgt).add(d.clone().add(new THREE.Vector3(0, centre ? 0 : .35, centre ? 0 : .2)).normalize().multiplyScalar(dist)); }, v);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${op}_${v}.png`) });
  }
  if (errors.length) console.log(errors);
  await browser.close();
})();
