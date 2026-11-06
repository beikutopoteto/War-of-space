const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert');
async function checkPrepTutorial(page,shots=false){
  const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wos.save.v1')));
  const step=async n=>{await page.waitForFunction(n=>JSON.parse(localStorage.getItem('wos.save.v1')).prog.prepStep===n,n);};
  const shot=async n=>{if(shots) await page.screenshot({path:path.join(ROOT,`test-results/prep-tutorial-${n}.png`)});};
  await page.evaluate(()=>{localStorage.removeItem('wos.save.v1');localStorage.removeItem('wos.debug');}); await page.reload();
  await page.click('#dbgT'); for(let i=0;i<3;i++) await page.click('#dbgB [data-dbga="one"]');
  await step(0); assert.equal((await save()).prog.funds,700); await page.waitForSelector('#prepTalk:not([hidden])'); await shot(1);
  await page.click('#mainNav [data-go="org"]'); await step(1);
  await page.click('[data-tab="army"]'); await page.click('#orgList [data-army="a1"]'); await step(2);
  await page.reload(); await step(2); await page.click('#mainNav [data-go="org"]'); await page.click('[data-tab="group"]'); await step(3); await shot(4);
  await page.click('.grid [data-cx="2"][data-cz="0"]'); await page.click('.orgpop [data-addarmy="a1"]'); await step(4);
  await page.waitForFunction(()=>document.querySelector('#prepTalk p').textContent.includes('全能力が10%')); // 旗艦の打撃群は全能力 +10% (2026-11-06)
  await page.click('.chip[data-chip-army="a1"] [data-flag]'); await step(5); assert.equal((await save()).prog.funds,1700);
  await page.locator('[data-s="org"] .back').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const f=document.querySelector('.prep-frame:not([hidden])'),b=document.querySelector('.scr:not([hidden]) .back'); return f&&b&&Math.abs(f.getBoundingClientRect().left-b.getBoundingClientRect().left+4)<2;});
  await page.click('[data-s="org"] .back'); await page.click('#mainNav [data-go="tech"]'); await step(6);
  await page.click('#brBar [data-br="cruiser"]'); await step(7); await page.click('#trCv [data-node="def1"]'); await shot(8);
  await page.click('#tRes'); await step(8); assert((await save()).prog.funds<1700);
  await page.click('[data-s="tech"] .back'); await page.click('#mainNav [data-go="mode"]'); await page.click('[data-s="mode"] [data-go="sortie"]'); await page.click('#opList [data-op="nile"]'); await page.click('#goBattle'); await shot(9);
  await page.evaluate(()=>{const real=WOS.start; WOS.start=function(c){window.sortieSpec=c; WOS.start=real; return real.call(this,c);};});
  await page.click('#forcesBattle'); assert((await save()).prog.prepDone);
  /* only the flagship's army (the cruisers) sorties with the flagship's bonus */
  const flagged=await page.evaluate(()=>{const c=window.sortieSpec, g=c.groups[0], a1=JSON.parse(localStorage.getItem('wos.save.v1')).armies.find(a=>a.id==='a1'); return g.members.map(i=>({a1:c.fleets[i].name===a1.name, flag:i===g.flag, bonus:c.fleets[i].bonus.includes('flag')}));});
  assert(flagged.length>1&&flagged.every(f=>f.flag===f.a1&&f.bonus===f.flag),JSON.stringify(flagged)); await page.evaluate(()=>openMenu()); assert(await page.locator('#prepTalk').isHidden());
  await page.evaluate(()=>{localStorage.removeItem('wos.save.v1');}); await page.reload(); await page.click('#dbgT'); for(let i=0;i<3;i++) await page.click('#dbgB [data-dbga="one"]'); await page.waitForSelector('#prepTalk:not([hidden])'); await page.click('#prepTalk button'); let s=await save(); assert(s.prog.prepDone&&s.prog.funds===1700&&s.groups[0].members.some(m=>m.army==='a1'));
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wos.save.v1')); delete s.prog.prepDone; delete s.prog.flags['aid:retreat']; s.prog.funds=700; localStorage.setItem('wos.save.v1',JSON.stringify(s));}); await page.reload(); await page.evaluate(()=>document.querySelector('#dbgT').click()); s=await page.evaluate(()=>{document.querySelector('#dbgB [data-dbga="funds"]').click();return JSON.parse(localStorage.getItem('wos.save.v1'));}); assert(s.prog.prepDone&&s.prog.flags['aid:retreat']&&s.prog.funds===2700); assert(await page.locator('#prepTalk').isHidden());
  /* the panel lets clicks through to what is under it (only とばす takes them) */
  await page.evaluate(()=>{localStorage.removeItem('wos.save.v1');}); await page.reload(); await page.click('#dbgT'); for(let i=0;i<3;i++) await page.click('#dbgB [data-dbga="one"]'); await page.waitForSelector('#prepTalk:not([hidden])');
  const through=await page.evaluate(()=>{const r=document.querySelector('#prepTalk p').getBoundingClientRect(), e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2), b=document.querySelector('#prepTalk button').getBoundingClientRect(); return {text:!e.closest('#prepTalk'), skip:!!document.elementFromPoint(b.left+b.width/2,b.top+b.height/2).closest('#prepTalk button')};});
  assert(through.text&&through.skip,JSON.stringify(through));
  /* the starting fleet before 2026-11-06 (the cruisers first in the army group, so its flagship): 戦区軍に置く and 旗艦にする pass at once */
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wos.save.v1')); s.groups[0].members.unshift({army:'a1',x:2,y:2,z:2}); s.prog.prepStep=3; localStorage.setItem('wos.save.v1',JSON.stringify(s));}); await page.reload();
  await step(5); assert.equal((await save()).prog.funds,1700);
  /* debug チュートリアルスキップ at the start: both tutorials done, the cruisers placed; the aid waits for 第2節 and comes with its clear */
  await page.evaluate(()=>{localStorage.removeItem('wos.save.v1');}); await page.reload(); await page.click('#dbgT'); await page.click('#dbgB [data-dbga="skip"]');
  s=await save(); assert(s.prog.tutorialCleared&&s.prog.prepDone&&s.groups[0].members.some(m=>m.army==='a1'&&m.x===2&&m.y===2&&m.z===0)&&s.prog.funds===0&&!s.prog.flags['aid:retreat'],JSON.stringify(s.prog));
  for(let i=0;i<2;i++) await page.click('#dbgB [data-dbga="one"]'); s=await save(); assert(s.prog.funds===1700&&s.prog.flags['aid:retreat'],JSON.stringify(s.prog)); assert(await page.locator('#prepTalk').isHidden());
  /* and in the middle of the guide: as とばす */
  await page.evaluate(()=>{localStorage.removeItem('wos.save.v1');}); await page.reload(); await page.click('#dbgT'); for(let i=0;i<3;i++) await page.click('#dbgB [data-dbga="one"]'); await page.waitForSelector('#prepTalk:not([hidden])');
  await page.click('#dbgB [data-dbga="skip"]'); s=await save(); assert(s.prog.prepDone&&s.prog.funds===1700&&s.groups[0].members.some(m=>m.army==='a1')); await page.waitForSelector('#prepTalk',{state:'hidden'});
  return '9段・保存・配置・旗艦（全能力 +10% は旗艦の打撃群だけ）・援助・研究・出撃・とばす・旧保存・板の下を押せる・旧い最初の艦隊・デバッグのスキップ';
}
module.exports={checkPrepTutorial};
if(require.main===module) (async()=>{fs.mkdirSync(path.join(ROOT,'test-results'),{recursive:true}); const {browser,page,errors}=await openGame({width:1600,height:900}); try{const result=await checkPrepTutorial(page,true); assert.deepStrictEqual(errors,[]); console.log('| 準備チュートリアル | '+result+' |');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
