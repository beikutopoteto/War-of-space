/* Exercise the actual training hooks and capture the requested HUD views. */
const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert');
async function checkTutorial(page, shots=false){
  await page.click('[data-tutorial]');
  let r=await page.evaluate(()=>({step:tutorial.step,hint:hintEl.hidden,clock:clockStr(),north:fleets.find(f=>f.name==='第14 北方防空 戦闘隊').seen}));
  assert.deepStrictEqual(r,{step:0,hint:true,clock:'08:00',north:false});
  r=await page.evaluate(()=>{ tutorialFrame(); return tutorialFrames.filter(e=>!e.hidden).length; }); assert.equal(r,2);
  await page.keyboard.press('h'); assert.equal(await page.locator('#tutorialGuide').isVisible(),false); await page.keyboard.press('h'); assert.equal(await page.locator('#tutorialGuide').isVisible(),true);
  r=await page.evaluate(()=>{ const f=fleets[0], e=fleets.find(x=>x.team===1); f.order=null; f.pos.copy(e.pos).add(new THREE.Vector3(0,0,10)); let hits=0, orig=damage; damage=function(t,a,s){if(t.team===0&&s&&s.team===1&&a>0) hits++; return orig(t,a,s);}; for(let i=0;i<30;i++) step(.05); damage=orig; return {hits,clock:clockStr()}; }); assert.deepStrictEqual(r,{hits:0,clock:'08:00'});
  await page.click('#cv1');
  r=await page.evaluate(()=>{ setSpeed(0); const f=fleets.find(x=>x.team===0), enemy=fleets.find(x=>x.team===1); select(f); groupOrder({type:'move',dest:new THREE.Vector3(0,0,100)}); return tutorial.step; }); assert.equal(r,2);
  if(shots){ await page.evaluate(()=>tutorialFrame()); await page.screenshot({path:path.join(ROOT,'test-results/tutorial-3.png')}); }
  r=await page.evaluate(()=>{ setAlt(15); groupOrder({type:'move',dest:new THREE.Vector3(0,15,80)}); return tutorial.step; }); assert.equal(r,3);
  r=await page.evaluate(()=>{ const orig=damage; let hits=0; damage=function(t,a,s){if(tutorialProtected()&&t.team===0&&s&&s.team===1&&a>0) hits++; return orig(t,a,s);}; const n=fleets.find(f=>f.name==='第14 北方防空 戦闘隊'), f=fleets[0]; f.order=null; f.pos.copy(n.pos).add(new THREE.Vector3(0,0,25)); for(let i=0;i<30;i++) step(.05); damage=orig; return {step:tutorial.step,hits,clock:clockStr()}; }); assert.deepStrictEqual(r,{step:4,hits:0,clock:'08:00'});
  r=await page.evaluate(()=>{ const f=fleets[0],e=fleets.find(x=>x.team===1&&x.alive); select(f); groupOrder({type:'attack',target:e}); damage(e,1,f); groupOrder({type:'move',dest:new THREE.Vector3(30,0,80),queue:true}); groupOrder({type:'move',dest:new THREE.Vector3(40,0,80),queue:true}); return tutorial.step; }); assert.equal(r,6);
  r=await page.evaluate(()=>{ const f=fleets.find(x=>x.name==='第4 空母航空 打撃群'),e=fleets.find(x=>x.team===1&&x.alive); f.pos.copy(e.pos).add(new THREE.Vector3(0,0,15)); e.seen=true; launchCheck(f); return {step:tutorial.step,wings:wings.filter(w=>w.carrier===f).length}; }); assert.equal(r.step,7); assert(r.wings>0);
  r=await page.evaluate(()=>{ select(fleets[0]); setStance('evade'); setSpeed(1); return tutorial.step; }); assert.equal(r,9);
  if(shots){ await page.evaluate(()=>{setSpeed(0);tutorialFrame();}); await page.screenshot({path:path.join(ROOT,'test-results/tutorial-10.png')}); }
  r=await page.evaluate(()=>{ select(fleets[0]); toggleMulti(fleets[1]); newGroup(); groupOrder({type:'move',dest:new THREE.Vector3(0,0,80)}); const before=clockStr(); step(1.1); return {step:tutorial.step,before,after:clockStr()}; }); assert.equal(r.step,10); assert.equal(r.before,'08:00'); assert.notEqual(r.after,'08:00');
  if(shots){ await page.evaluate(()=>tutorialFrame()); await page.screenshot({path:path.join(ROOT,'test-results/tutorial-11.png')}); }
  r=await page.evaluate(()=>{ damage(fortress,fortress.hpPool+1,fleets[0]); return {over,win:outcome,save:JSON.parse(localStorage.getItem('wos.save.v1')).prog.tutorialCleared}; }); assert.deepStrictEqual(r,{over:true,win:true,save:true});
  await page.evaluate(()=>openMenu()); assert((await page.locator('[data-tutorial]').innerText()).includes('クリア済み'));
  await page.click('[data-tutorial]');
  r=await page.evaluate(()=>{ for(let i=0;i<40;i++) step(.05); const held=clockStr(); guideEl.querySelector('[data-skip]').click(); step(2); return {held,after:clockStr(),guide:guideEl.hidden,training:trainingEl.hidden}; }); assert.equal(r.held,'08:00'); assert.notEqual(r.after,'08:00'); assert(r.guide&&r.training);
  r=await page.evaluate(()=>{ const f=fleets[0], e=fleets.find(x=>x.team===1&&x.alive); f.order=null; f.pos.copy(e.pos).add(new THREE.Vector3(0,0,8)); let hits=0, orig=damage; damage=function(t,a,s){if(t.team===0&&s&&s.team===1&&a>0) hits++; return orig(t,a,s);}; for(let i=0;i<30;i++) step(.05); damage=orig; return hits; }); assert(r>0);
  await page.evaluate(()=>{openMenu(); WOS.start({op:'charybdis'});});
  r=await page.evaluate(()=>({active:tutorialActive(),hint:hintEl.hidden})); assert.deepStrictEqual(r,{active:false,hint:false});
  return '11段・打撃0・時計停止／再開・保存・クイック出撃';
}
module.exports={checkTutorial};
if(require.main===module) (async()=>{fs.mkdirSync(path.join(ROOT,'test-results'),{recursive:true}); const {browser,page,errors}=await openGame({width:1600,height:900}); try{ const result=await checkTutorial(page,true); assert.deepStrictEqual(errors,[]); console.log('| チュートリアル | '+result+' |'); }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
