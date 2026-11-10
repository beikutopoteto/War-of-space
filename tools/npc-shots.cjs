/* node tools/npc-shots.cjs: 実画面1600×900。無操作の演習を0/60/150秒で撮る。
   撮影のためだけ自軍斥候を東へ置く。他の部隊・視界規則は変更しない。 */
const {openGame}=require('./browser.cjs'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.evaluate(()=>{
    const source=WOS_DATA.operations.find(o=>o.id==='baikonur');reset({op:'baikonur',fleets:source.quick});if(talking)endTalk();setSpeed(0);endDeploy();
    const scout=fleets.find(f=>f.team===0&&f.groundKind==='scout');scout.pos.copy(groundPoint(33,26));scout.post.copy(scout.pos);groundUpdateSight();
    camAnim=null;controls.target.copy(groundPoint(28,25));camera.position.copy(controls.target).add(new THREE.Vector3(0,130,80));camera.lookAt(controls.target);controls.update();select(null);
  });
  const out=path.resolve(__dirname,'../.shots');fs.mkdirSync(out,{recursive:true});
  for(const [time,name] of [[0,'a'],[60,'b'],[150,'c']]){
    await page.evaluate(t=>{while(gameSec<t-1e-8&&!over)step(.05);groundDraw();},time);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    if(errors.length)throw new Error(errors.join('\n'));
    await page.screenshot({path:path.join(out,'npc-'+name+'.png')});
    console.log(JSON.stringify(await page.evaluate(()=>({time:gameSec,sites:groundSites.map(s=>({id:s.id,owner:s.owner})),npc:npcDebug(),over}))));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
