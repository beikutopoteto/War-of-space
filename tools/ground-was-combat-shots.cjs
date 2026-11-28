/* #525: node tools/ground-was-combat-shots.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');

async function main(){
  const out=path.join(ROOT,'.shots');
  fs.mkdirSync(out,{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  try{
    await page.evaluate(()=>{
      WOS.start({op:'groundExercise2',fleets:[{name:'陸戦型 W.A.S. 検証小隊',kind:'was',at:[12,26.4],platoons:1}]});
      if(talking)endTalk();
      if(deploying)endDeploy();
      setSpeed(0);
      op={...op,groundStaticEnemies:false};
      const was=fleets.find(f=>f.team===0&&f.groundKind==='was');
      for(const f of fleets)if(f!==was){f.alive=false;f.el.hidden=true;f.groundModel.visible=false;}
      let lane=null;
      for(let y=22;y<34&&!lane;y+=.5)for(let x=6;x<40&&!lane;x+=.5){
        const points=[x,x+.65,x+4.5].map(a=>groundPoint(a,y));
        if(!points.every(p=>groundPass(groundMapX(p.x),y,'vehicle')&&
          groundPass(groundMapX(p.x),y,'was')&&!groundTerrainCover({pos:p})))continue;
        const [from,to]=points.map(p=>({x:p.x,y:groundHeight(p.x,p.z)+groundSightRules().eyeHeight,z:p.z}));
        if(groundClearLine(from,to))lane={x,y,points};
      }
      if(!lane)throw Error('直射できる地上の配置が見つからない');
      const tank=makeFleet(1,groundUnitSpec({name:'主力戦車 検証小隊',kind:'vehicle',at:[lane.x+.65,lane.y],platoons:1,stance:'engage'}));
      fleets=[was,tank];groundInitUnit(tank);
      was.pos.copy(lane.points[0]);was.pos.y=groundUnitHeight(was);was.groundTrack=null;
      was.stance='engage';was.heading.set(1,0,0);tank.heading.set(-1,0,0);
      hideHint();select(was);
      window.drawWasCombat=()=>{
        camAnim=null;
        controls.target.copy(was.pos).add(new THREE.Vector3(.9,.2,0));
        camera.position.copy(controls.target).add(new THREE.Vector3(4.5,4.3,4.6));
        camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);
        groundFogDraw(true);groundDraw();groundHud();
      };
      window.tickWasCombat=(seconds,withdraw=false)=>{
        if(withdraw)order(tank,{type:'move',dest:lane.points[2]});
        const end=gameSec+seconds;
        while(gameSec+1e-8<end){
          const dt=Math.min(.05,end-gameSec);
          gameSec+=dt;groundStep(dt);
        }
        drawWasCombat();
        return {altitude:was.band,pending:was.bandTo};
      };
      drawWasCombat();
    });
    const shot=async name=>{
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(out,'was-combat-'+name+'.png'),timeout:120000});
      assert.deepEqual(errors,[],'ページ例外');
    };
    await shot('walking');
    assert.deepEqual(await page.evaluate(()=>tickWasCombat(2.5)),{altitude:'cruise',pending:null});
    await shot('auto-cruise');
    assert.deepEqual(await page.evaluate(()=>tickWasCombat(23,true)),{altitude:'ground',pending:null});
    await shot('landed');
    console.log('.shots/was-combat-*.png 3枚（1600×900）');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
