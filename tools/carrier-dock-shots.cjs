/* 1600x900: actual preparation dock with every class, and both sea assault carriers. */
const fs=require('node:fs'),path=require('node:path'),{openGame,ROOT}=require('./browser.cjs');
(async()=>{
 const version=process.argv.includes('--before')?'before':'after';
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  if(version==='before'){await page.route('**/battle/ground-shapes.js',r=>r.fulfill({path:path.join(ROOT,'.shots/before/ground-shapes.js'),contentType:'application/javascript'}));await page.reload();}
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const shoot=async name=>{await settle();if(errors.length)throw Error(errors.join('\n'));await page.screenshot({path:path.join(ROOT,'.shots',`${name}-${version}.png`)});};
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.id='reviewDock';document.body.appendChild(canvas);
   Object.assign(canvas.style,{position:'fixed',inset:'0',width:'1600px',height:'900px',zIndex:99999});
   WOS_DOCK.draw(canvas,['bb','cvb','masc','cl','dd','mas','ff','cv']);
  });await shoot('dock-all');
  await page.evaluate(()=>{WOS_DOCK.close();document.getElementById('reviewDock').remove();
   const operation=WOS_DATA.operations.find(o=>o.id==='groundExercise2');
   operation.groundSea=[0,1].map(team=>({name:team?'共和国 強襲母艦':'連合 強襲母艦',kind:'sea',type:'masc',band:'sea',team,at:[18+team*2,4]}));
   operation.enemies=[];WOS.start({op:operation.id,fleets:[]});setSpeed(0);
   fleets.forEach(f=>{f.seen=true;f.everSeen=true;f.groundVisible[0]=true;});
   groundDraw();groundFogDraw(true);camAnim=null;controls.enableDamping=false;
   const at=groundPoint(19,4);controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(9,12,16));camera.lookAt(at);controls.update();
  });await shoot('sea-masc');
  console.log(version+': dock-all, sea-masc');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
