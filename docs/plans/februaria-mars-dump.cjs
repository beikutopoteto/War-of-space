// 第5節の共和国側の作戦説明の図に使う、砲台の届く所・ゲート・友軍の位置をゲームから取り出す。
// 使い方: node docs/plans/februaria-mars-dump.cjs docs/plans/februaria-mars.json
const { openGame } = require(require('path').join(__dirname,'../../tools/browser.cjs'));
(async () => {
  const { browser, page, errors } = await openGame();
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  await page.click('[data-go="sortie"]'); await page.click('[data-op="februaria"]'); await page.click('#goBattle'); await page.waitForTimeout(800);
  await page.click('#talkSkip').catch(()=>{}); await page.waitForTimeout(300);
  await page.click('#deployGo').catch(()=>{});
  const r = await page.evaluate(() => {
    step(.05);
    const v=p=>[+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1)];
    const bat=fleets.filter(f=>f.fixed&&f.team===0).map(f=>({name:f.name,pos:v(f.pos),up:f.pit&&f.pit.up?[+f.pit.up.x.toFixed(3),+f.pit.up.y.toFixed(3),+f.pit.up.z.toFixed(3)]:null,range:f.range}));
    const gs=gates.map(g=>({name:g.name,pos:v(g.pos),ring:v(g.ring),r:g.r}));
    const al=fleets.filter(f=>f.ally&&!f.fixed).map(f=>({name:f.name,pos:v(f.pos),n:f.ships.length}));
    // coverage grid at several altitudes
    const _a=new THREE.Vector3(); const cov={};
    for(const alt of [-20,0,30,60]){ const rows=[]; for(let z=-300;z<=200;z+=5){ let row=''; for(let x=-440;x<=440;x+=5){ _a.set(x,alt,z);
        const ok=fleets.some(f=>f.fixed&&f.team===0&&f.pos.distanceTo(_a)<=f.range&&pitCan(f,{pos:_a})&&!bodyBlocks(f.pos,_a)); row+=ok?'1':'0'; } rows.push(row); } cov[alt]=rows; }
    return {bat,gs,al,cov,CLOCK_RATE,FIELD_R};
  });
  require('fs').writeFileSync(process.argv[2], JSON.stringify(r));
  console.log(JSON.stringify({bat:r.bat.slice(0,3),gs:r.gs,CLOCK_RATE:r.CLOCK_RATE,FIELD_R:r.FIELD_R}), errors.slice(0,3));
  await browser.close();
})();
