/* 宇宙艦の実画面を1600×900で撮る。撮影用に艦を並べ、既存の描画を使う。 */
const fs=require('node:fs'),path=require('node:path'),{openGame,ROOT}=require('./browser.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  const version=process.argv.includes('--before')?'before':'after';
  if(version==='before'){await page.route('**/battle/ground-shapes.js',r=>r.fulfill({path:path.join(ROOT,'.shots/before/ground-shapes.js'),contentType:'application/javascript'}));await page.reload();}
  try{
    await page.addStyleTag({content:'#labels{display:none!important}'});
    for(const shot of [
      {name:'earth',op:'charybdis',team:0,types:['cv','dd','cl','bb','cvb']},
      {name:'mars',op:'charybdis',team:1,types:['cl','bb','cvb','masc']},
      {name:'captured',op:'februaria',team:1,types:['bb'],captured:true},
      {name:'masc',op:'charybdis',team:0,types:['masc'],both:true},
    ]){
      await page.evaluate(({op:operation,team,types,captured,both})=>{
        WOS.start({op:operation,tutorial:false});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();
        fleets.forEach(f=>{f.alive=false;});
        // Photography only: expose Republic classes absent from current campaign data.
        for(const type of ['bb','cvb','masc']){const s=CLASS_MAX[type];WOS_DATA.sides.mars.ships[type]||={atk:s.atk,def:s.def,eva:s.eva,rng:s.rng,spd:s.spd};}
        if(both)types=['masc','masc'];
        const source=captured?op.events.find(e=>e.fleet&&e.fleet.name.startsWith('第1 鹵獲戦艦')).fleet:null;
        types.forEach((type,i)=>{
          const spec=source?{...source,n:1,pos:[0,0],alt:0}:{name:'撮影 '+type,type,n:1,scale:1,pos:[0,0],alt:0};
          const f=makeFleet(both?i:team,spec); f.seen=true;f.everSeen=true;f.pos.set((i-(types.length-1)/2)*4,100,200);f.ships[0].pos.copy(f.pos);f.ships[0].off.set(0,0,0);fleets.push(f);
          if(captured&&shipMeshKey(f,'bb')!=='bb')throw new Error('鹵獲戦艦の形が違う');
        });
        camAnim=null;controls.enableDamping=false;controls.minDistance=.5;controls.target.set(0,100,200);
        const dist=types.length===1?11:31;camera.position.copy(controls.target).add(new THREE.Vector3(dist*.25,dist*.65,dist*.75));camera.lookAt(controls.target);controls.update();
      },shot);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      if(errors.length)throw new Error(errors.join('\n'));
      await page.screenshot({path:path.join(ROOT,'.shots',`space-models-${version}-${shot.name}.png`)});
      console.log(`写真: ${shot.name}`);
    }
    const vertices=await page.evaluate(()=>{delete WOS_DATA.sides.mars.ships.bb;delete WOS_DATA.sides.mars.ships.cvb;delete WOS_DATA.sides.mars.ships.masc;WOS.start({op:'februaria',tutorial:false});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();return fleets.filter(f=>f.alive).reduce((sum,f)=>sum+f.ships.filter(s=>s.alive!==false).reduce((n,s)=>n+shipMeshes[colOf(f)][shipMeshKey(f,s.type||f.type)].geometry.attributes.position.count,0),0);});
    console.log(version+' vertices: '+vertices);
    if(errors.length)throw new Error(errors.join('\n'));
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
