/* 強襲母艦の独立した出撃枠と配備研究を、準備画面から実際の戦闘まで確認する。 */
const assert = require('assert');
async function checkMasc(page, screenshot) {
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]'); await page.click('#dbgB [data-dbga="tech"]');
  const base = await page.evaluate(() => {const v=JSON.parse(localStorage.getItem('wos.save.v1')); v.prog.funds=2000;
    v.bgs.push({id:'bg-masc-test',name:'強襲試験',type:'masc',count:2},{id:'bg-mas-test',name:'揚陸試験',type:'mas',count:3});
    v.armies.find(a=>a.id==='a2').bgs.push('bg-masc-test','bg-mas-test'); return v;});
  const stage=async ids=>{await page.evaluate(({v,ids})=>{v.prog.tech.was=ids;localStorage.setItem('wos.save.v1',JSON.stringify(v));},{v:base,ids});await page.reload();};
  for(const ids of [['cap1'],['turn2']]){ await stage(ids); await page.click('[data-go="tech"]'); await page.click('#brBar [data-br="was"]');
    await page.click('#trCv [data-node="mascDeploy"]'); assert.equal(await page.isDisabled('#tRes'),true); }
  const before=['cap1','turn2']; await stage(before);
  await page.click('[data-go="org"]'); await page.click('[data-tab="army"]'); await page.click('#orgList [data-army="a1"]');
  const locked=await page.locator('#addBg option[value="new:masc"]').count(), org0=await page.locator('#orgCap').innerText();
  assert.equal(locked,0); assert.match(org0,/強襲母艦\s+2\/0隻/); assert.match(org0,/W\.A\.S\. 部隊\s+3\/12隻/);
  await page.click('[data-s="org"] .back'); await page.click('#dbgT'); await page.check('#dbgB [data-dbg="free"]');
  await page.click('[data-go="org"]'); await page.click('[data-tab="army"]'); await page.click('#orgList [data-army="a1"]');
  assert.equal(await page.locator('#addBg option[value="new:masc"]').count(),1);
  await page.click('[data-s="org"] .back'); await page.uncheck('#dbgB [data-dbg="free"]');
  await page.click('[data-go="tech"]'); await page.click('#brBar [data-br="was"]');
  await page.click('#trCv [data-node="mascDeploy"]');
  const info=await page.locator('#tInfo').innerText(); assert.match(info,/資金\s*800/); assert.match(info,/0 → 1隻/); assert.equal(await page.isDisabled('#tRes'),false);
  if(screenshot){ await page.click('#tClose'); await page.screenshot({path:screenshot}); await page.click('#trCv [data-node="mascDeploy"]'); }
  await page.click('#tRes'); const purchased=await page.evaluate(()=>JSON.parse(localStorage.getItem('wos.save.v1')));
  assert(purchased.prog.tech.was.includes('mascDeploy')); assert.equal(purchased.prog.funds,1200);
  const rows=[];
  for(const ids of [['cap1','turn2','mascDeploy'],['cap1','cap2','turn2','mascDeploy'],['cap1','cap2','cap3','turn2','mascDeploy']]){
    await stage(ids); await page.click('[data-go="org"]'); await page.click('[data-tab="army"]'); await page.click('#orgList [data-army="a1"]');
    const org=await page.locator('#orgCap').innerText(), available=await page.locator('#addBg option[value="new:masc"]').count();
    assert.equal(available,1); assert.match(org,new RegExp(`強襲母艦\\s+2/${ids.includes('cap3')?3:ids.includes('cap2')?2:1}隻`));
    await page.click('[data-s="org"] .back'); await page.click('[data-go="tech"]'); await page.click('#brBar [data-br="was"]');
    const title=await page.locator('#trSum .trhead').innerText(); await page.click('[data-s="tech"] .back');
    await page.click('#mainNav [data-go="mode"]'); await page.click('[data-s="mode"] [data-go="sortie"]'); await page.click('[data-op="charybdis"]'); await page.click('#goBattle');
    const load=await page.locator('#sgLoad').innerText(), disabled=await page.isDisabled('#forcesBattle');
    const cap=ids.includes('cap3')?3:ids.includes('cap2')?2:1, was=ids.includes('cap3')?24:ids.includes('cap2')?16:12;
    assert.match(title,new RegExp(`強襲母艦\\s+${cap}隻`)); assert.match(load,new RegExp(`W\\.A\\.S\\. 部隊\\s+3 / ${was}隻`));
    assert.match(load,new RegExp(`強襲母艦\\s+2 / ${cap}隻`)); assert.match(load,/戦闘の規模[^\n]*\s+34 \/ 45隻/); assert.equal(disabled,cap<2);
    assert(!org.includes('実数')&&!load.includes('実数')); rows.push({cap,was,disabled});
    if(cap===2){await page.click('#forcesBattle');const fleet=await page.evaluate(()=>{const f=fleets.find(x=>x.comp?.masc);return {comp:f.comp,n:f.n,hangar:f.hangar};});
      assert.equal(fleet.comp.masc,2);assert.equal(fleet.comp.mas,3);assert.equal(fleet.n,14);assert.equal(fleet.hangar.was,90);assert.equal(fleet.hangar.ftr,20); rows[1].fleet=fleet;}
  }
  await page.evaluate(()=>localStorage.removeItem('wos.save.v1')); await page.reload();
  return {locked,org0,info,rows};
}
module.exports={checkMasc};
if(require.main===module){const {openGame}=require('./browser.cjs');(async()=>{const {browser,page}=await openGame({width:1600,height:900});try{console.log(JSON.stringify(await checkMasc(page,'test-results/masc-node.png')));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});}
