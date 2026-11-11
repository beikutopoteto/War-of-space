/* 1600×900。宇宙NPCのsmokeと写真を一つずつ実行。npm test・早送りとは同時に回さない。 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{openGame}=require('./browser.cjs'),{checkNpcSpace}=require('../tests/npc-space.cjs');
(async()=>{
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await checkNpcSpace(page,(ok,label,detail)=>{assert(ok,label+' '+detail);console.log('✓ '+label);});
    const out=path.resolve(__dirname,'../.shots/npc-space');fs.mkdirSync(out,{recursive:true});
    for(const tutorial of [false,true]){
      await page.evaluate(tutorial=>{reset({op:'charybdis',tutorial});if(talking)endTalk();setSpeed(0);endDeploy();for(let i=0;i<80&&!over;i++)step(.05);},tutorial);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(out,tutorial?'tutorial.png':'exercise.png')});
    }
    if(errors.length)throw new Error(errors.join('\n'));
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
