/* 実演習でShift予約・選択円・モード解除を確認し、同じChromiumで旧処理と比較。 */
const {openGame,ROOT}=require('./browser.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {execFileSync}=require('child_process');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
  await page.waitForFunction(()=>window.WOS&&typeof groundSupplyNet!=='undefined'&&typeof groundScriptEval==='function',{timeout:60000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});if(talking)endTalk();endDeploy();setSpeed(0);});
  const baselineTerrain=execFileSync('git',['show','6f22ed5:battle/terrain.js'],{cwd:ROOT,encoding:'utf8'});
  const baselineGround=execFileSync('git',['show','6f22ed5:battle/ground.js'],{cwd:ROOT,encoding:'utf8'});
  const baseline={path:baselineTerrain.slice(baselineTerrain.indexOf('function groundPath('),baselineTerrain.indexOf('\nfunction groundFollow(')),paint:baselineGround.slice(baselineGround.indexOf('function groundInfluenceAt('),baselineGround.indexOf('\nfunction groundCaptureDraw('))};
  const timings=await page.evaluate(ref=>{
   const rows=[],time=(name,fn,n=3)=>{const values=[];for(let i=0;i<n;i++){const t=performance.now();fn();values.push(performance.now()-t);}values.sort((a,b)=>a-b);rows.push({name,medianMs:+values[Math.floor(values.length/2)].toFixed(3),samples:n});};
   const fast={path:groundPath,paint:groundPaintTerritory,influence:groundInfluenceAt};
   try{
    for(const [name,a,b,kind] of [['infantry-river',[21,26],[26,26],'infantry'],['long-vehicle',[7,29],[41,27],'vehicle']]){
     let before,after;groundPath=(0,eval)('('+ref.path+')');
     time(name+'.before',()=>before=groundPath(groundPoint(...a),groundPoint(...b),kind));
     groundPath=fast.path;time(name+'.after',()=>after=groundPath(groundPoint(...a),groundPoint(...b),kind));
     if(JSON.stringify(before.points)!==JSON.stringify(after.points)||before.cost!==after.cost)throw Error(name+': old/new path mismatch');
    }
    (0,eval)(ref.paint);
    time('territory.before',()=>{groundTerritory.key=null;groundPaintTerritory();},1);
    const oldPixels=groundTerritory.canvas.getContext('2d').getImageData(0,0,480,360).data;
    groundPaintTerritory=fast.paint;groundInfluenceAt=fast.influence;groundInfluenceCache=null;groundTerritoryPixels=null;
    time('territory.after.cold',()=>groundPaintTerritory(),1);
    const newPixels=groundTerritory.canvas.getContext('2d').getImageData(0,0,480,360).data;
    if(!oldPixels.every((v,i)=>v===newPixels[i]))throw Error('old/new territory pixels mismatch');
    time('territory.after.repaint',()=>{groundTerritory.key=null;groundPaintTerritory();});
    time('supply.refresh',()=>{groundSupplyNet.key=null;groundSupplyRefresh();});
    time('groundDraw',()=>groundDraw());time('renderer.call',()=>renderer.render(scene,camera));
   }finally{groundPath=fast.path;groundPaintTerritory=fast.paint;groundInfluenceAt=fast.influence;}
   return rows;
  },baseline);
  console.log(JSON.stringify({scope:'Same Chromium, CPU function times; not total frame/GPU latency',timings}));
  const points=await page.evaluate(()=>{
   const f=fleets.find(f=>f.team===0&&f.groundKind==='infantry');select(f);camAnim=null;
   controls.target.copy(f.pos).add(new THREE.Vector3(8,0,6));camera.position.copy(controls.target).add(new THREE.Vector3(0,38,28));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
   return [[6,0],[6,8],[14,8]].map(([x,z])=>{const p=f.pos.clone().add(new THREE.Vector3(x,0,z));p.y=groundSurfaceHeight(p.x,p.z);return proj(p);});
  });
  for(let i=0;i<points.length;i++){
   if(i===1)await page.keyboard.down('Shift');
   await page.mouse.click(points[i].x,points[i].y);
  }
  await page.keyboard.up('Shift');
  const result=await page.evaluate(()=>{
   const f=selected;frame(performance.now());
   const ring=f.groundSelection,p=ring.geometry.attributes.position;
   const finite=Array.from(p.array).every(Number.isFinite);
   const above=Array.from({length:p.count},(_,i)=>p.getY(i)>=groundSurfaceHeight(f.pos.x+p.getX(i),f.pos.z+p.getZ(i))).every(Boolean);
   return {waypoints:f.order?.path?.pts.length,ringVisible:ring.visible,finite,above,barWidth:document.getElementById('groundMove').getBoundingClientRect().width};
  });
  assert.equal(result.waypoints,3);for(const key of ['ringVisible','finite','above'])assert.equal(result[key],true,key);assert.equal(result.barWidth,48);
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  await page.screenshot({path:path.join(ROOT,'.shots','ground-basics-queue.png')});
  const modes=await page.evaluate(require('../tests/command-icons.cjs').commandIconCases);
  for(const key of ['directBoard','cleared','friendSelect','cancelled','identical'])assert.equal(modes[key],true,key);
  const data={timings,result,modes};fs.writeFileSync(path.join(ROOT,'.shots','ground-basics-check.json'),JSON.stringify(data,null,2));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result,modes}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
