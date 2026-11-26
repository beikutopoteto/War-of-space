/* #515: node tools/unit-data-shots.cjs. Capture desktop and iPhone views of the unit database. */
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('node:url');
const { openGame, ROOT } = require('./browser.cjs');
const output = path.join(ROOT, '.shots');

const nextPaint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function saveShot(page, errors, name, options = {}) {
  const file = `unit-data-${name}.png`;
  await page.screenshot({ path: path.join(output, file), ...options });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(file);
}

async function capture(viewport, options, shots) {
  const { browser, page, errors } = await openGame(viewport, options);
  try {
    const mobile = options.isMobile;
    const input = mobile ? 'tap' : 'click';
    if (mobile) {
      await saveShot(page, errors, 'iphone-menu');
      const title = pathToFileURL(path.join(ROOT, 'index.html')).href;
      await page.goto(title + '?ground=exercise2');
      await page.waitForFunction(() => op.ground === 'exercise2' && !menuOpen && !!groundBoard);
      await nextPaint(page);
      await saveShot(page, errors, 'iphone-battle');
      await page.goto(title);
    }
    await page.locator('#mainNav [data-go="data"]')[input]();
    const data = page.locator('#unitData');
    const menu = page.locator('#menu');
    const select = (key, value) => data.locator(`[data-unit-${key}="${value}"]`)[input]();
    for (const [name, force, unit, states = {}] of shots) {
      await select('force', force);
      await select('id', unit);
      if (mobile) {
        const layout = await data.evaluate(root => {
          const rect = selector => root.querySelector(selector).getBoundingClientRect();
          const list = root.querySelector('.ud-units');
          const sheet = rect('.ud-sheet');
          const scale = visualViewport.scale;
          const zoom = Number(getComputedStyle(root.closest('.scr')).zoom);
          return {
            hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
            layoutWidth: document.documentElement.clientWidth,
            screenWidth: screen.width,
            deviceScaleFactor: devicePixelRatio,
            scrolls: list.scrollWidth > list.clientWidth,
            row: [...list.querySelectorAll('.ud-unit')].every(button => button.getBoundingClientRect().y === rect('.ud-unit').y),
            sheetTop: (sheet.top - visualViewport.offsetTop) * scale,
            ordered: rect('.ud-tabs').bottom <= rect('.ud-units').top && rect('.ud-units').bottom <= sheet.top &&
              sheet.bottom < rect('.ud-model').top && rect('.ud-model').bottom < rect('.ud-state').top,
            bodySize: parseFloat(getComputedStyle(root.querySelector('.ud-description')).fontSize) * zoom * scale,
          };
        });
        assert.ok(!layout.hasViewportMeta && layout.layoutWidth === 980 && layout.screenWidth === viewport.width &&
          layout.deviceScaleFactor === 3, JSON.stringify(layout));
        assert.ok(layout.scrolls && layout.row && layout.ordered, JSON.stringify(layout));
        assert.ok(layout.sheetTop >= 0 && layout.sheetTop <= 16 && layout.bodySize >= 13, JSON.stringify(layout));
        console.log(`${name}: ${layout.layoutWidth}px layout, ${layout.bodySize.toFixed(2)}px visible body text`);
      }
      for (const [key, value] of Object.entries(states)) await select(key, value);
      if (unit !== 'bonus') {
        await data.locator('.ud-stage canvas').dblclick();
        await page.waitForFunction(() => document.querySelector('#unitData .ud-angles')?.textContent.includes('HDG'));
      }
      await menu.evaluate((menu, mobile) => {
        menu.scrollTop = 0;
        const sheet = menu.querySelector('#unitData .ud-sheet').getBoundingClientRect();
        if (!mobile && sheet.bottom > menu.clientHeight) menu.scrollTop = sheet.bottom - menu.clientHeight + 12;
      }, mobile);
      await nextPaint(page);
      await saveShot(page, errors, name);
      if (name === 'iphone-ground') {
        // Expand the fixed menu for this shot so fullPage includes its entire scrollable content.
        await saveShot(page, errors, `${name}-full`, {
          fullPage: true,
          style: `html, body { height:auto; overflow:visible; }
                  #menu { position:relative; inset:auto; min-height:100vh; box-sizing:border-box; overflow:visible; }`
        });
      }
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await capture({ width: 1600, height: 900 }, {}, [
    ['tank', 'ground', 'vehicle'],
    ['was-low', 'ground', 'was', { height: 'low' }],
    ['scout', 'ground', 'scout'],
    ['battleship', 'space', 'bb', { team: 1, research: 'max' }],
    ['corvette', 'space', 'cv', { team: 0, research: 'now' }],
    ['bonus', 'space', 'bonus']
  ]);
  await capture({ width: 390, height: 780 }, { scale: 3, isMobile: true, uis: null }, [
    ['iphone-space', 'space', 'bb', { team: 1, research: 'max' }],
    ['iphone-ground', 'ground', 'vehicle']
  ]);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
