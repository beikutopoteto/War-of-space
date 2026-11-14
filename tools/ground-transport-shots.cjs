/* 実行: node tools/ground-transport-shots.cjs（npm ci・Playwright Chromium 導入済みのMac）。
   1600×900、.shots/⑦-a.png ～ ⑦-d.png。実際の乗降・架橋・経路移動で固定場面を作る。
   輸送車・工兵は編成画面で追加できる兵科。ここでは撮影用の4中隊を出撃させる。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
    await page.waitForFunction(()=>window.WOS&&typeof groundFog!=='undefined'&&groundFog);
    const setup=async()=>page.evaluate(()=>{
      const base=groundUnitSpec(OPS.find(o=>o.id==='groundExercise2').quick[0]);
      reset({op:'groundExercise2',fleets:['infantry','apc','engineer','vehicle'].map((kind,i)=>({...base,groundKind:kind,name:`第${i+1} ${groundRuleSet().unitTypes[kind].name}中隊`}))});setSpeed(0);
      fleets.forEach(f=>{f.stance='evade';f.order=null;f.queue=[];f.pos.copy(groundPoint(f.team?44:4,30));});
      window.transportShotUnits=Object.fromEntries(fleets.filter(f=>f.team===0).map(f=>[f.groundKind,f]));
    });
    const draw=async(x,y,dist)=>{
      await page.evaluate(({x,y,dist})=>{
        const at=groundPoint(x,y);camAnim=null;controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(0,dist,.01));camera.lookAt(at);controls.update();
        groundUpdateSight();groundDraw();groundFogDraw(true);updateGoal();
      },{x,y,dist});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    const advance=async seconds=>page.evaluate(seconds=>{for(let i=0;i<Math.round(seconds/.05);i++){if(over)throw new Error('撮影前に戦闘が終了');step(.05);}groundDraw();},seconds);
    const shot=async letter=>page.screenshot({path:path.join(ROOT,'.shots',`⑦-${letter}.png`)});
    // (a) 徒歩で近づいて乗車し、輸送車の名札に搭載中隊を表示。
    await setup();await page.evaluate(()=>{
      const {infantry,apc}=window.transportShotUnits;infantry.pos.copy(groundPoint(8,27));apc.pos.copy(groundPoint(10,27));select(infantry);
      if(!groundBoardCommand([infantry],apc))throw new Error('乗車命令に失敗');
    });await advance(8);
    await page.evaluate(()=>{const {infantry,apc}=window.transportShotUnits;if(infantry.embarked!==apc)throw new Error('乗車していない');select(apc);});
    await draw(10,27,50);await shot('a');
    // (b) 通れる隣接地へ降車。両中隊の名札を表示。
    await page.evaluate(()=>{const {infantry,apc}=window.transportShotUnits;if(!groundUnloadCommand([apc]))throw new Error('降車できない');select(infantry);});
    await draw(10,27,50);await shot('b');
    // (c) 実在の狭い分流の両岸へ配置。工兵は川岸で停止して10秒作業。
    await setup();const focus=await page.evaluate(()=>{
      const {engineer,vehicle}=window.transportShotUnits,r=WOS_TERRAIN.exercise2.water.rivers.find(r=>r.id==='east'),a=r.points[2],b=r.points[3],p=groundPoint((a[0]+b[0])/2,(a[1]+b[1])/2),plan=groundBridgePlan(p);
      if(plan.reason)throw new Error(plan.reason);
      engineer.pos.copy(plan.banks[0]);vehicle.pos.copy(plan.banks[0]).add(plan.banks[0].clone().sub(plan.pos).setLength(3));
      select(engineer);const bridge=groundBridgeCommand([engineer],p);if(!bridge)throw new Error('架橋命令に失敗');
      window.transportShotBridge=bridge;window.transportShotDestination=plan.banks[1];return {x:plan.x,y:plan.y};
    });await advance(10.05);
    await page.evaluate(()=>{const b=window.transportShotBridge;if(b.complete||Math.abs(b.progress-10)>.001)throw new Error('架橋中の固定場面に失敗');});
    await draw(focus.x,focus.y,40);await shot('c');
    // (d) 完成後、戦車へ対岸への命令。実際の経路で橋の上へ到達したコマで止める。
    await advance(10);await page.evaluate(()=>{
      const b=window.transportShotBridge,{vehicle}=window.transportShotUnits;if(!b.complete)throw new Error('橋が未完成');
      select(vehicle);order(vehicle,{type:'move',dest:window.transportShotDestination});let crossed=false;
      for(let i=0;i<1000&&vehicle.order;i++){
        step(.05);const x=vehicle.pos.x/GROUND_SCALE+24,y=18-vehicle.pos.z/GROUND_SCALE;
        if(groundBuiltBridgeAt(x,y,b.river)&&Math.abs(-(x-b.x)*b.ty+(y-b.y)*b.tx)<b.width/2){crossed=true;break;}
      }
      if(!crossed)throw new Error('戦車が仮設橋の上に到達しない');
    });await draw(focus.x,focus.y,40);await shot('d');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('| 写真 | .shots/⑦-a.png ～ ⑦-d.png（4枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
