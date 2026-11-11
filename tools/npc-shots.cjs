/* node tools/npc-shots.cjs: 1600×900。広域演習の全体真上／開始直後／120秒後。
   地形全体だけ視界膜を隠す。局所写真は実際の初期視界を維持。 */
const {openGame}=require('./browser.cjs'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.evaluate(()=>{
    const source=WOS_DATA.operations.find(o=>o.id==='baikonur');reset({op:'baikonur',fleets:source.quick});if(talking)endTalk();setSpeed(0);endDeploy();menuOpen=false;document.body.classList.remove('inmenu');document.getElementById('menu').hidden=true;
    select(null);camAnim=null;
  });
  const out=path.resolve(__dirname,'../.shots');fs.mkdirSync(out,{recursive:true});
  for(const [time,name,overview] of [[0,'npc-overview',true],[0,'npc-start',false],[120,'npc-120',false]]){
    await page.evaluate(({time,overview})=>{
      while(gameSec<time-1e-8&&!over)step(.05);
      camAnim=null;controls.target.copy(groundPoint(overview?48:20,overview?36:48));
      camera.position.copy(controls.target).add(overview?new THREE.Vector3(0,580,.01):new THREE.Vector3(0,180,110));
      camera.lookAt(controls.target);controls.update();groundDraw();
      for(const mesh of groundBoard.children)if(mesh.material?.map===groundFog?.texture)mesh.visible=!overview;
    },{time,overview});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    if(errors.length)throw new Error(errors.join('\n'));
    await page.screenshot({path:path.join(out,name+'.png')});
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(JSON.stringify(await page.evaluate(()=>({time:gameSec,terrain:op.ground,sites:groundSites.map(s=>({id:s.id,owner:s.owner})),npc:npcDebug(),over}))));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
