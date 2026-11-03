// 第6節の作戦図用。戦闘を進めず、初期位置・実メッシュ・設定を取り出す。
// node docs/plans/denali-dump.cjs → docs/plans/denali.json
const fs = require('fs');
const path = require('path');
const { openGame } = require('../../tools/browser.cjs');
(async () => {
  const { browser, page, errors } = await openGame();
  try {
    await page.evaluate(() => {
      WOS_OPT.story = false;
      WOS.start({ op: 'denaliBreak' });
      speed = 0;
      if (talking) endTalk();
      if (deploying) endDeploy();
    });
    const result = await page.evaluate(() => {
      const operation = WOS_DATA.operations.find(o => o.id === 'denaliBreak');
      const v = p => [p.x, p.y, p.z].map(x => +x.toFixed(2));
      const a = bodyShape.geo.attributes.position;
      const vertices = [];
      for (let i = 0; i < a.count; i++) {
        vertices.push([a.getX(i), a.getY(i), a.getZ(i)].map(x => +x.toFixed(2)));
      }
      // 陽動が最初に向かう砲台の傘の縁。交戦後の点は状況で変わる。
      const feintPosts = {};
      for (const [side, data] of Object.entries(operation.feints)) {
        const p = packs.find(p => p.name === data.screen);
        const dir = p.postV.clone().sub(bodyC).normalize();
        const distance = umbrellaEdge(p, dir) + 3;
        feintPosts[side] = v(dir.multiplyScalar(distance).add(p.postV));
      }
      return {
        operation, vertices, bodyCenter: v(bodyC), mine: v(nuke.mine),
        fieldRadius: FIELD_R, deployRadius: zoneOf().r, feintPosts,
        fleets: fleets.map(f => ({ name: f.name, pos: v(f.pos), fixed: !!f.fixed, team: f.team })),
      };
    });
    if (errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(path.join(__dirname, 'denali.json'), JSON.stringify(result));
    console.log(`denali.json | 頂点 ${result.vertices.length} | 敵の隊・設備 ${result.operation.enemies.length} | ブラウザーエラー 0`);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
