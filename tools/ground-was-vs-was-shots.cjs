/* #525: node tools/ground-was-vs-was-shots.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');

function prepareDogfight(){
  WOS.start({op:'groundExercise2',fleets:[]});
  if(talking)endTalk();
  if(deploying)endDeploy();
  setSpeed(0);
  op={...op,npc:null,groundStaticEnemies:false};
  rebuildGroundRuleSet();
  for(const f of fleets){f.el.remove();f.groundModel?.parent?.remove(f.groundModel);}
  fleets=[];revealMode=true;hideHint();select(null);

  let lane;
  for(let y=23;y<33&&!lane;y+=.5)for(let x=9;x<34&&!lane;x+=.5){
    const points=[-1,0,1].flatMap(dx=>[-1,0,1].map(dy=>groundPoint(x+dx,y+dy)));
    if(points.every(p=>groundPass(groundMapX(p.x),groundMapY(p.z),'vehicle')&&!groundTerrainCover({pos:p})&&Math.abs(p.y-points[0].y)<.15))lane={x,y};
  }
  if(!lane)throw Error('撮影用の平地が見つからない');

  const makeWas=(team,x,name)=>{
    const f=makeFleet(team,groundUnitSpec({kind:'was',name,at:[x,lane.y],platoons:4,stance:'evade'}));
    fleets.push(f);groundInitUnit(f);
    f.band='cruise';
    f.heading.set(team?-1:1,0,0);
    f.el.style.display='none';
    return f;
  };
  const blue=makeWas(0,lane.x-.38,'地球連合 W.A.S.');
  const red=makeWas(1,lane.x+.38,'惑星共和国 W.A.S.');
  order(blue,{type:'attack',target:red});order(red,{type:'attack',target:blue});
  for(const arrow of arrows)dropArrow(arrow);
  if(!document.body.classList.contains('noui'))toggleUi();

  const midpoint=blue.pos.clone().lerp(red.pos,.5);
  camAnim=null;
  controls.target.copy(midpoint).add(new THREE.Vector3(0,.35,0));
  camera.position.copy(controls.target).add(new THREE.Vector3(-6.8,6.6,5.7));
  camera.lookAt(controls.target);camera.updateMatrixWorld(true);
  // 確認用にカメラを寄せたまま固定する。
  controls.update=()=>{};
  const started=gameSec;
  const height=p=>(p.y-groundSurfaceHeight(p.x,p.z))/GROUND_SCALE*1000;
  const advance=end=>{
    while(gameSec+1e-8<end){
      const dt=Math.min(.05,end-gameSec);
      gameSec+=dt;groundStep(dt);
      for(const f of fleets)groundFormationDraw(f,gameSec);
      groundDraw();
    }
  };
  // 撃墜あり。通常の耐久と相互攻撃のまま、次に撃墜された機体を追う。
  window.startWreckPhoto=()=>{
    const prior=groundFxQueues.wreck.at(-1),deadline=gameSec+120;
    let wreck;
    while(!over&&gameSec<deadline){
      advance(gameSec+.05);
      wreck=groundFxQueues.wreck.at(-1);
      if(wreck?.fx&&wreck!==prior)break;
    }
    if(!wreck?.fx||wreck===prior)throw Error('通常の交戦で新しい撃墜が起きなかった');
    const [body,trail,impact]=wreck.fx.group.children;
    // 撃墜を記録した後は、カメラで残骸を追いながら描画だけ進める。
    window.advanceWreckPhoto=elapsed=>{
      gameSec=wreck.start+elapsed;groundFxDraw(gameSec);
      controls.target.copy(body.visible?body.position:impact.position).add(new THREE.Vector3(0,-.15,0));
      camera.position.copy(controls.target).add(new THREE.Vector3(-2.05,1.3,1.5));
      camera.lookAt(controls.target);camera.updateMatrixWorld(true);
    };
    window.wreckPhotoState=()=>{
      return {height:body.visible?Math.round(height(body.position)):null,
        flame:trail.children[0].visible,smoke:trail.children.slice(2).filter(o=>o.visible).length,
        impact:impact.visible,removed:!wreck.fx.group.parent};
    };
    return wreck.life-groundRuleSet().wasCombat.dogfight.wreck.smokeSec;
  };
  window.advanceDogfightPhoto=seconds=>{
    advance(started+seconds);
    return fleets.map(f=>{
      const flight=f.groundWasFlight;
      const points=groundBodyPositions(f).positions.filter((_,i)=>f.bodies[i].alive);
      const meters=points.map(height);
      const nearestPass=Math.min(...flight.bodies.flatMap((b,i)=>f.bodies[i].alive&&b.passTarget!=null&&flight.dogfight?.target.bodies[b.passTarget].alive?
        [b.pos.distanceTo(groundBodyPosition(flight.dogfight.target,b.passTarget))/GROUND_SCALE*1000]:[]));
      return {alive:points.length,dogfight:!!f.groundWasFlight?.dogfight,
        inFrame:points.every(p=>{
          const projected=p.clone().project(camera);
          return Math.abs(projected.x)<.9&&Math.abs(projected.y)<.8&&Math.abs(projected.z)<1;
        }),
        low:meters.filter(h=>h>=30-1e-7&&h<=80).length,maxHeight:Math.round(Math.max(...meters)),
        sliding:flight.bodies.filter((b,i)=>f.bodies[i].alive&&b.slideBoost>.5).length,
        passing:flight.bodies.filter((b,i)=>f.bodies[i].alive&&b.passTarget!=null).length,
        nearestPass:Number.isFinite(nearestPass)?Math.round(nearestPass):null,
        groundHits:groundFxQueues.stray.filter(e=>e.fx?.group.children[1].visible).length};
    });
  };
}

async function main(){
  const out=path.join(ROOT,'.shots','was-vs-was');
  fs.mkdirSync(out,{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  try{
    await page.addInitScript(()=>{
      let seed=525;
      Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    });
    await page.reload();
    await page.evaluate(prepareDogfight);
    const photo=async name=>{
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(out,name+'.png'),timeout:120000});
      assert.deepEqual(errors,[],'ページ例外');
    };
    for(const seconds of [3,4,5,6,7,8]){
      const state=await page.evaluate(seconds=>advanceDogfightPhoto(seconds),seconds);
      assert(state.every(s=>s.dogfight&&s.inFrame),JSON.stringify(state));
      await photo('low-dogfight-'+seconds+'s');
      console.log(JSON.stringify({seconds,state}));
    }
    const duration=await page.evaluate(()=>startWreckPhoto());
    const wreckStates=new Map();
    const impactAt=duration+.045;
    for(const seconds of [0,1,2,3,4,5,impactAt].sort((a,b)=>a-b)){
      await page.evaluate(seconds=>advanceWreckPhoto(seconds),seconds);
      const wreck=await page.evaluate(()=>wreckPhotoState());
      await photo(Number.isInteger(seconds)?'wreck-'+seconds+'s':'wreck-impact');
      console.log(JSON.stringify({seconds,wreck}));
      wreckStates.set(seconds,wreck);
    }
    const [start,fall,nearGround,impact,end]=[0,1,2,impactAt,5].map(s=>wreckStates.get(s));
    assert(start.height>fall.height&&fall.height>nearGround.height&&nearGround.height>0);
    assert(fall.flame&&fall.smoke>=2&&impact.impact&&!impact.flame&&end.removed);
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
