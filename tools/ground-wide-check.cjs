/* 実際の広域検証場を開き、描画量・射程分散計算・経路・kmを確認する。 */
const {openGame,ROOT}=require('./browser.cjs');
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900}),results=[];
 const evaluate=page.evaluate.bind(page);page.evaluate=(fn,arg)=>{let timer;return Promise.race([evaluate(fn,arg),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('画面評価が30秒で終わりません')),30000);})]).finally(()=>clearTimeout(timer));};
 try{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  for(const [id,W,H] of [['field150',150,100],['field300',300,200]]){
   await page.goto('file://'+path.join(ROOT,'index.html')+'?ground='+id);await page.waitForFunction(id=>window.WOS&&op.ground===id,id);
   const ready=await page.evaluate(()=>({visuals:!!groundVisuals,op:op.id,units:fleets.length,range:fleets.find(f=>f.groundKind==='guidedRocket')&&groundRangeInfo(fleets.find(f=>f.groundKind==='guidedRocket'))}));if(!ready.visuals||!ready.range||errors.length)throw Error(JSON.stringify({ready,errors}));
   const renderTiming={nativeFrameIntervals:'未測定：非同期描画待ちを中止。以下は計算呼出し時間の実測'};
   const result=await page.evaluate(([id,W,H])=>{
    window.requestAnimationFrame=()=>0;if(talking)endTalk();endDeploy();setSpeed(0);camAnim=null;
    const dims=groundDimensions(),d=groundData();if(dims.widthKm!==W||dims.heightKm!==H)throw Error('寸法が異なる');
    const gun=fleets.find(f=>f.team===0&&f.groundKind==='guidedRocket');select(gun);if(!groundRangeInfo(gun))throw Error(JSON.stringify({alive:gun.alive,embarked:!!gun.embarked,band:gun.band,morale:gun.groundMorale,rout:gun.groundRout,airState:gun.groundAirState,locked:gun.locked,kind:gun.groundKind,ranges:groundFireRanges(gun),weapon:groundStrikeWeapon(gun),can:groundCommandAllowed(gun,'strike'),over,op:op.id}));groundRangesClear();groundBallisticReset();groundRangeBudgetStats={lastMs:0,maxMs:0,pending:0};
    const times=[];for(let i=0;i<1000;i++){const t=performance.now();groundRangesDraw([gun]);times.push(performance.now()-t);if(!groundRanges.get(gun).jobs)break;}
    if(groundRanges.get(gun).jobs)throw Error('射程計算が完了しない');
    const order=fleets.find(f=>f.team===0&&f.groundKind==='vehicle'),start=order.pos.clone(),bridge=d.objects.bridges[0],dest=groundPoint(bridge.x-2,bridge.y),t=performance.now(),route=groundPath(start,dest,'vehicle');const pathMs=performance.now()-t;if(!route)throw Error('本営から渡河点への経路なし');
    groupOrder({type:'move',dest}); // 選択中のロケット車両にも実経路を作る。
    for(let i=0;i<5;i++)groundStep(.05);setSpeed(0);
    controls.target.copy(groundPoint(W/2,H/2));camera.position.copy(controls.target).add(new THREE.Vector3(0,W*4*.9,W*4*.48));camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);frame(performance.now());
    return {id,widthKm:dims.widthKm,heightKm:dims.heightKm,mesh:[dims.mesh.segmentsX,dims.mesh.segmentsZ],texture:[dims.texture.width,dims.texture.height],fog:[groundFog.canvas.width,groundFog.canvas.height],territory:[groundTerritory.canvas.width,groundTerritory.canvas.height],rocketRangeKm:groundStrikeRange(gun).max/GROUND_SCALE,rangeFrames:times.length,rangeTotalMs:times.reduce((a,b)=>a+b,0),rangeMaxFrameMs:Math.max(...times),pathMs,pathKm:route.L/GROUND_SCALE,forests:groundForests.length,buildings:groundBuildings.length,far:camera.far,sourceMap:d.meta.location};
   },[id,W,H]);
   assert(result.mesh.every(v=>v<=512)&&result.texture.every(v=>v<=2048));assert(result.rocketRangeKm===50&&result.rangeFrames<1000);result.renderTiming=renderTiming;results.push(result);console.log(JSON.stringify({field:result}));
   await page.screenshot({path:path.join(ROOT,'.shots','ground-'+id+'-overview.png')});
  }
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');await page.waitForFunction(()=>op.ground==='exercise2');
  const exercise=await page.evaluate(()=>{setSpeed(0);return {width:groundDimensions().widthKm,height:groundDimensions().heightKm,mesh:groundMeshGrid().segmentsX};});assert.deepEqual(exercise,{width:48,height:36,mesh:192});
  await page.evaluate(()=>{reset({op:'charybdis'});setSpeed(0);});assert.equal(await page.locator('.ground-range-label').count(),0);assert.deepEqual(errors,[]);console.log(JSON.stringify({results,exercise,spaceClean:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
