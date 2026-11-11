/* Claude実行用。ブラウザ確認・早送り・npm testと同時に回さない。写真は実行後だけ生成する。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {openGame}=require('./browser.cjs'),{checkNpcAuto}=require('../tests/npc-ground.cjs');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await checkNpcAuto(page,(ok,name,detail)=>{assert(ok,name+' '+(detail||''));console.log('✓ '+name);});
  const out=path.resolve(__dirname,'../.shots/npc-auto');fs.mkdirSync(out,{recursive:true});
  for(const id of ['baikonur','charybdis']){
   await page.evaluate(id=>{WOS_MENU.setAuto(true);WOS.start({op:id,tutorial:false});if(talking)endTalk();setSpeed(0);endDeploy();step(.05);const f=fleets.find(f=>f.team===0&&f.alive&&!f.embarked&&(!op.ground||f.groundKind==='infantry'));select(f);groupOrder({type:'move',dest:f.pos.clone()});updateRoster();camAnim=null;controls.target.copy(f.pos);camera.position.copy(f.pos).add(new THREE.Vector3(0,90,65));camera.lookAt(f.pos);controls.update();},id);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:path.join(out,id+'-manual.png')});
   await page.evaluate(()=>{document.body.classList.add('dbg-battle');openPause();});
   await page.screenshot({path:path.join(out,id+'-menu.png')});
   await page.evaluate(()=>closePause());
  }
  assert.equal(errors.length,0,errors.join(' / '));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
