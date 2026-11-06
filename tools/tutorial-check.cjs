const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert');
async function checkTutorial(page,shots=false){
  await page.click('#mainNav [data-go="mode"]'); await page.click('[data-s="mode"] [data-go="sortie"]');
  await page.click('[data-op="tutorial"]'); await page.click('#goBattle');
  const shot=async n=>{if(shots){await page.evaluate(()=>tutorialFrame()); await page.screenshot({path:path.join(ROOT,'test-results/tutorial-'+n+'.png')});}};
  let r=await page.evaluate(()=>({step:tutorial.step,clock:clockStr(),talk:!talking&&!talkEl.hidden,marks:tutorialMarks.length}));
  assert.deepStrictEqual(r,{step:0,clock:'08:00',talk:true,marks:1}); await shot(1);
  r=await page.evaluate(()=>{ const prev=window.WOS_OPT.story; window.WOS_OPT.story=true; startTalk([['通信','割り込み']]); const during=talking&&talkWho.textContent==='通信'; endTalk(); window.WOS_OPT.story=prev; return during&&!talking&&talkWho.textContent==='副官'; }); assert(r);
  await page.click('#talkText'); assert.equal(await page.evaluate(()=>tutorial.step),0);
  await page.keyboard.press('h'); assert.equal(await page.locator('#talk').isVisible(),false); await page.keyboard.press('h');
  r=await page.evaluate(()=>{let hits=0; const orig=damage; damage=function(t,a,src){if(t.team===0&&src&&src.team===1&&a>0) hits++; return orig(t,a,src);}; const f=fleets[0],e=fleets.find(x=>x.team===1); f.pos.copy(e.pos).add(new THREE.Vector3(0,0,10)); for(let i=0;i<30;i++) step(.05); damage=orig; return {hits,clock:clockStr()};}); assert.deepStrictEqual(r,{hits:0,clock:'08:00'});
  r=await page.evaluate(()=>{setSpeed(0); const f=fleets[0]; select(f); order(f,{type:'move',dest:new THREE.Vector3(-45,0,85)}); for(let i=0;i<5000&&tutorial.step===0;i++) step(.05); return tutorial.step;}); assert.equal(r,1); await shot(2);
  if(shots){ await page.setViewportSize({width:1920,height:1080}); await page.evaluate(()=>{window.WOS_UIS=null; resize(); tutorialFrame();}); const rects=await page.evaluate(()=>({alt:document.getElementById('alt').getBoundingClientRect().toJSON(), stick:document.getElementById('camSticks').getBoundingClientRect().toJSON()})); assert(rects.stick.left>rects.alt.right); await page.screenshot({path:path.join(ROOT,'test-results/tutorial-2-1920.png')}); await page.setViewportSize({width:1600,height:900}); await page.evaluate(()=>{window.WOS_UIS=1; resize();}); }
  r=await page.evaluate(()=>{const f=fleets[0]; order(f,{type:'move',dest:new THREE.Vector3(30,20,95)}); for(let i=0;i<5000&&tutorial.step===1;i++) step(.05); return tutorial.step;}); assert.equal(r,2); await shot(3);
  r=await page.evaluate(()=>{const f=fleets[0]; order(f,{type:'move',dest:new THREE.Vector3(-60,0,125)}); for(let i=0;i<5000&&f.order;i++) step(.05); return tutorial.step;}); assert.equal(r,2);
  r=await page.evaluate(()=>{const f=fleets[0]; order(f,{type:'move',via:[new THREE.Vector3(-80,0,70)],dest:new THREE.Vector3(-60,0,125)}); for(let i=0;i<6000&&tutorial.step===2;i++) step(.05); return tutorial.step;}); assert.equal(r,3);
  r=await page.evaluate(()=>{const f=fleets[0]; order(f,{type:'move',dest:(m=>new THREE.Vector3(m.pos[0],m.alt,m.pos[1]))(op.tutorial.find(r=>r.condition==='group').marks[0])}); for(let i=0;i<5000&&f.order;i++) step(.05); return tutorial.step;}); assert.equal(r,3);
  r=await page.evaluate(()=>{select(fleets[0]); toggleMulti(fleets[1]); newGroup(); const f=groupFlag(tutorial.group); order(f,{type:'move',dest:(m=>new THREE.Vector3(m.pos[0],m.alt,m.pos[1]))(op.tutorial.find(r=>r.condition==='group').marks[0])}); for(let i=0;i<5000&&tutorial.step===3;i++) step(.05); return tutorial.step;}); assert.equal(r,4);
  r=await page.evaluate(()=>{setSpeed(1); tutorialEvent('view'); return tutorial.step;}); assert.equal(r,6);
  r=await page.evaluate(()=>{const n=fleets.find(f=>f.name==='第14 北方防空 戦闘隊'); n.everSeen=true; step(.05); const f=fleets[0],e=fleets.find(x=>x.team===1&&x.alive); select(f); groupOrder({type:'attack',target:e}); damage(e,1,f); return tutorial.step;}); assert.equal(r,8);
  r=await page.evaluate(()=>{const f=fleets.find(x=>x.name==='第4 空母航空 打撃群'); tutorialLaunch(f); select(fleets[0]); setStance('evade'); return {step:tutorial.step,clock:clockStr()};}); assert.deepStrictEqual(r,{step:10,clock:'08:00'});
  r=await page.evaluate(()=>{step(2); const after=clockStr(); damage(fortress,fortress.hpPool+1,fleets[0]); return {after,over,win:outcome,save:JSON.parse(localStorage.getItem('wos.save.v1')).prog.tutorialCleared};}); assert.notEqual(r.after,'08:00'); assert(r.over&&r.win&&r.save);
  await page.evaluate(()=>{openMenu(); WOS.start({op:'charybdis',tutorial:true});});
  r=await page.evaluate(()=>{for(let i=0;i<40;i++) step(.05); const held=clockStr(); document.getElementById('talkSkip').click(); step(2); return {held,after:clockStr(),active:tutorialActive(),marks:tutorialMarks.length};}); assert.equal(r.held,'08:00'); assert.notEqual(r.after,'08:00'); assert(!r.active&&!r.marks);
  await page.evaluate(()=>{openMenu(); WOS.start({op:'charybdis'});}); assert.equal(await page.evaluate(()=>tutorialActive()),false);
  /* a win at any step, or after とばす, clears it (2026-11-06: a win before 仕上げ did not open 第1節) */
  for(const how of ['early','skip']){
    await page.evaluate(()=>localStorage.removeItem('wos.save.v1')); await page.reload();
    await page.click('#mainNav [data-go="mode"]'); await page.click('[data-s="mode"] [data-go="sortie"]'); await page.click('[data-op="tutorial"]'); await page.click('#goBattle');
    r=await page.evaluate(how=>{ if(how==='early'){ tutorial.step=op.tutorial.findIndex(x=>x.condition==='attack'); tutorialRender(); } else document.getElementById('talkSkip').click();
      damage(fortress,fortress.hpPool+1,fleets[0]); for(let i=0;i<3000&&!over;i++) step(.1);
      return {over,win:outcome,saved:!!(JSON.parse(localStorage.getItem('wos.save.v1')||'{}').prog||{}).tutorialCleared,said:document.getElementById('rp').textContent.includes('出撃できるようになった')}; },how);
    assert.deepStrictEqual(r,{over:true,win:true,saved:true,said:true},how);
  }
  return '11段・到着と経由・戦区軍・時計停止／再開・保存・とばす・クイック出撃・途中の段やとばしたあとの勝ちでもクリア';
}
module.exports={checkTutorial};
if(require.main===module) (async()=>{fs.mkdirSync(path.join(ROOT,'test-results'),{recursive:true}); const {browser,page,errors}=await openGame({width:1600,height:900}); try{ const result=await checkTutorial(page,true); assert.deepStrictEqual(errors,[]); console.log('| チュートリアル | '+result+' |'); }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

