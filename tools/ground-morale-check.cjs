const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>window.WOS,{timeout:60000});
  const outside=await page.evaluate(()=>{
   window.requestAnimationFrame=()=>0;reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});if(talking)endTalk();endDeploy();setSpeed(0);
   const f=fleets.find(f=>f.team===0&&f.groundKind==='infantry');select(f);f.order=null;f.queue=[];f.groundRout=null;f.groundMoved=false;
   const d=WOS_TERRAIN[op.ground],hq=groundSites.find(s=>s.owner===0);let best=null,dist=Infinity;
   for(let y=2;y<34;y+=.4)for(let x=2;x<46;x+=.4){if(!groundPass(x,y,'infantry')||d.terrain.cells[Math.floor(y/d.meta.cellKm)*d.terrain.cols+Math.floor(x/d.meta.cellKm)]!=='平地')continue;
    const pos=groundPoint(x,y),at=groundSupplyAt({...f,pos});if(at.owner===0||at.contested)continue;const v=pos.distanceToSquared(hq.pos);if(v<dist){best=pos;dist=v;}}
   if(!best)throw Error('回復確認用の平地がない');f.pos.copy(best);f.pos.y=groundUnitHeight(f);f.groundMorale=79;f.groundRest=5;groundSupplyAfter(1);
   camAnim=null;controls.target.copy(f.pos);camera.position.copy(f.pos).add(new THREE.Vector3(0,45,35));camera.lookAt(f.pos);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
   return {morale:f.groundMorale,owner:groundSupplyAt(f).owner,at:f.pos.toArray()};
  });assert.equal(outside.morale,80);assert.notEqual(outside.owner,0);
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});await page.screenshot({path:path.join(ROOT,'.shots','ground-morale-outside.png')});
  const own=await page.evaluate(()=>{const f=selected,s=groundSites.find(s=>s.owner===0);f.pos.copy(s.pos);f.pos.y=groundUnitHeight(f);f.groundMorale=99;f.groundRest=5;f.groundMoved=false;groundSupplyAfter(1);camAnim=null;controls.target.copy(f.pos);camera.position.copy(f.pos).add(new THREE.Vector3(0,45,35));camera.lookAt(f.pos);controls.update();camera.updateMatrixWorld(true);frame(performance.now());return {morale:f.groundMorale,owner:groundSupplyAt(f).owner};});assert.equal(own.morale,100);assert.equal(own.owner,0);
  await page.screenshot({path:path.join(ROOT,'.shots','ground-morale-friendly.png')});assert.deepEqual(errors,[]);console.log(JSON.stringify({outside,own}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
