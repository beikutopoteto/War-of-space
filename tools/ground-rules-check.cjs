/* node tools/ground-rules-check.cjs — 規則のやり直しと広域の実架橋。写真は1600×900。 */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{
  const out=path.join(ROOT,'.shots','ground-rules');fs.mkdirSync(out,{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    const result=await page.evaluate(()=>{
      const source=OPS.find(o=>o.id==='groundfield150'),cfg={op:source.id,fleets:[{...source.quick[0],name:'架橋確認',groundKind:'engineer',band:'ground'}]};
      const start=()=>{WOS.start(cfg);setSpeed(0);if(talking)endTalk();endDeploy();};
      const saved=source.groundRuleOverrides;source.groundRuleOverrides={sight:{basic:31}};
      start();const first=groundRuleSet();rebuildGroundRuleSet({sight:{basic:32}});const changed=groundRuleSet().sight.basic===32;
      start();const retried=groundRuleSet()!==first&&groundRuleSet().sight.basic===31;
      if(saved===undefined)delete source.groundRuleOverrides;else source.groundRuleOverrides=saved;
      start();
      let point,plan;
      search:for(const river of groundData().water.rivers)for(let i=0;i<river.points.length-1;i++)for(let n=1;n<50;n++){
        const a=river.points[i],b=river.points[i+1],t=n/50,p=groundPoint(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t),candidate=groundBridgePlan(p);
        if(!candidate.reason){point=p;plan=candidate;break search;}
      }
      if(!plan)throw Error('架橋可能な両岸が見つからない');
      const engineer=fleets.find(f=>f.team===0&&f.groundKind==='engineer');
      engineer.pos.copy(plan.banks[0]);engineer.stance='evade';for(const s of engineer.ships)s.pos.copy(engineer.pos);
      select(engineer);const bridge=groundBridgeCommand([engineer],point);if(!bridge)throw Error(groundTransportMessage);
      for(let i=0;i<450&&!bridge.complete;i++)groundTransportStep(.05);
      groundUpdateSight();groundDraw();updateRoster();updateGoal();
      camAnim=null;controls.target.copy(point);camera.position.copy(point).add(new THREE.Vector3(0,38,30));camera.lookAt(point);controls.update();
      return {changed,retried,complete:bridge.complete,hp:bridge.hp,seconds:bridge.progress,fogStep:groundSightRules().fogStep,message:groundTransportMessage};
    });
    assert.equal(result.changed,true);assert.equal(result.retried,true);assert.equal(result.complete,true);assert.equal(result.hp,40);assert.equal(result.seconds,20);assert.equal(result.fogStep,3.125);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:path.join(out,'field150-bridge.png')});assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'engineering-after.json'),JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
