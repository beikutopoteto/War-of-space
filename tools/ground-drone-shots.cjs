/* node tools/ground-drone-shots.cjs [--dive-only] — 実画面を 1600×900 で .shots/ に保存。 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');

async function main(){
  const out=path.join(ROOT,'.shots');
  const diveOnly=process.argv.includes('--dive-only');
  fs.mkdirSync(out,{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  try{
    await page.evaluate(()=>{
      const opId='groundExercise2';
      WOS.start({op:opId,fleets:[{name:'斥候中隊',kind:'scout',at:[20,24],platoons:3,stance:'evade'}]});
      if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);
      op={...op,npc:null,groundHQ:null};
      const scout=fleets.find(f=>f.team===0&&f.groundKind==='scout');
      const tank=makeFleet(1,groundUnitSpec({name:'戦車中隊',kind:'vehicle',at:[22,25],platoons:1,stance:'evade'}));
      fleets.forEach(f=>{if(f!==scout)f.alive=false;});fleets.push(tank);groundInitUnit(tank);
      scout.pos.copy(groundPoint(20,24));scout.heading.set(0,0,1);scout.groundTrack=null;scout.groundDeployed=true;
      window.droneShot={scout,tank};
      window.droneShotCamera=(point,offset)=>{
        camAnim=null;controls.minDistance=.05;camera.near=.01;camera.updateProjectionMatrix();
        controls.target.copy(point);camera.position.copy(point).add(new THREE.Vector3(...offset));
        camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);
        groundFogDraw(true);groundDraw();
      };
      window.droneShotTick=seconds=>{
        const end=gameSec+seconds;
        while(gameSec<end-1e-8){
          const dt=Math.min(.05,end-gameSec);gameSec+=dt;groundDroneStep(dt);groundDroneCleanup();
        }
        groundUpdateSight();groundDraw();
      };
      select(null);groundUpdateSight();droneShotCamera(scout.pos,[6,8,7]);
    });
    const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const shot=async name=>{
      if(diveOnly&&name!=='06-dive')return;
      await frames();assert.deepEqual(errors,[],'ページ例外');
      await page.screenshot({path:path.join(out,`ground-drone-${name}.png`),timeout:120000});
      assert.deepEqual(errors,[],'ページ例外');
    };
    const btn=id=>page.locator('#groundDrone'+id);
    const scoutButton=page.getByRole('button',{name:/^斥候中隊/});
    await scoutButton.click();
    await page.mouse.move(1100,500);
    assert.equal(await btn('Count').textContent(),'3/3');assert.equal(await btn('Launch').isVisible(),true);
    await shot('01-launch-3');
    await btn('Launch').click();
    await page.evaluate(()=>{
      const shot=droneShot,drone=shot.drone=shot.scout.groundDroneSlots[0].drone;
      droneShotCamera(shot.scout.pos.clone().lerp(drone.pos,.5),[3.15,2.4,1.8]);
    });
    await shot('02-fiber-selected');
    assert.equal(await page.evaluate(()=>droneShot.drone.groundDrone.fiber.children.filter(l=>l.visible).length),3);
    await scoutButton.click();
    await page.mouse.move(1100,500);
    assert.equal(await page.evaluate(()=>!!selected),false);
    await shot('03-fiber-unselected');
    assert.equal(await page.evaluate(()=>droneShot.drone.groundDrone.fiber.visible),false);
    await page.evaluate(()=>{
      const {scout,drone}=droneShot;
      droneShotCamera(scout.pos.clone().lerp(drone.pos,.5),[5,9,6]);
    });
    await frames();
    const selectDrone=async ()=>{
      const point=await page.evaluate(()=>{
        const mark=droneShot.drone.el.querySelector('.mk2'),r=mark.getBoundingClientRect();
        const x=r.left+r.width/2,y=r.top+r.height/2;
        if(!mark.contains(document.elementFromPoint(x,y)))throw Error('ドローンの名札に別の名札が重なっている');
        return {x,y};
      });
      await page.mouse.click(point.x,point.y);
      assert.equal(await page.evaluate(()=>selected===droneShot.drone),true);
    };
    await selectDrone();
    await shot('04-drone-commands');
    await btn('Orbit').click();
    const orbit=await page.evaluate(()=>{
      const p=groundPoint(20.3,24.85),q=proj(p),hit=document.elementFromPoint(q.x,q.y);
      if(hit!==renderer.domElement)throw Error('旋回偵察地点に別の表示が重なっている');
      return q;
    });
    await page.mouse.click(orbit.x,orbit.y);
    await page.evaluate(()=>{
      if(droneShot.drone.groundDrone.mission?.type!=='orbit')throw Error('旋回命令が発行されていない');
      droneShotTick(2.5);
      droneShotCamera(droneShot.drone.pos,[1.5,7,-2]);
    });
    assert.equal(await page.locator('#groundTransportStatus').textContent(),'旋回偵察中');
    await shot('05-orbit');
    await page.evaluate(()=>droneShotCamera(droneShot.tank.pos.clone().lerp(droneShot.drone.pos,.5),[7,9,6]));
    await frames();
    await btn('Dive').click();
    const target=await page.evaluate(()=>{
      const mark=droneShot.tank.el.querySelector('.mk2'),r=mark.getBoundingClientRect();
      const x=r.left+r.width/2,y=r.top+r.height/2;
      if(!mark.contains(document.elementFromPoint(x,y)))throw Error('戦車の名札に別の名札が重なっている');
      return {x,y};
    });
    await page.mouse.click(target.x,target.y);
    await page.evaluate(()=>{
      const {drone,tank}=droneShot;
      if(drone.groundDrone.mission?.target!==tank)throw Error('自爆命令が発行されていない');
      const frames=drone.groundDrone.mission.frames;
      const fromTarget=()=>groundDistanceTo(drone,tank)/GROUND_SCALE;
      for(let i=0;i<600&&fromTarget()>.28;i++){gameSec+=.01;groundDroneStep(.01);}
      if(fromTarget()>.28||frames.some((frame,i)=>!frame.body.alive||frame.pitch<=0||i>0&&frame.pos.y<=frames[i-1].pos.y)){
        throw Error('高度の異なる3機が突入している場面を撮影できない');
      }
      const tail=frames[2].pos,dir=tank.pos.clone().sub(tail);
      dir.y=0;dir.normalize();
      groundUpdateSight();
      droneShotCamera(tank.pos.clone().lerp(tail,.5),[-dir.z*4.5-dir.x*.3,1.25,dir.x*4.5-dir.z*.3]);
    });
    await shot('06-dive');
    await page.evaluate(()=>droneShotTick(3));
    assert.equal(await page.evaluate(()=>groundDroneStats[0].hits),3);
    if(diveOnly)return;
    await scoutButton.click();
    await page.mouse.move(1100,500);
    await btn('Launch').click();
    await page.evaluate(()=>{const {scout}=droneShot;order(scout.groundDroneSlots[1].drone,{type:'move',dest:groundPoint(19,24)});droneShotTick(1.6);});
    await btn('Launch').click();
    await page.evaluate(()=>droneShotCamera(droneShot.scout.pos,[6,8,7]));
    assert.equal(await btn('Count').textContent(),'0/3');assert.equal(await btn('Launch').isDisabled(),true);
    await shot('07-launch-0');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
