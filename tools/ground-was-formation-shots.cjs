/* #525: node tools/ground-was-formation-shots.cjs [--cruise-only] */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');

const SWARM_SPANS_KM=[.7,1.0,1.5,2.0];

function prepareShots(){
  WOS.start({op:'groundExercise2',fleets:[]});
  if(talking)endTalk();
  if(deploying)endDeploy();
  setSpeed(0);
  op={...op,groundStaticEnemies:false,npc:null};
  for(const f of fleets){f.el.remove();f.groundModel?.parent?.remove(f.groundModel);}
  fleets=[];
  revealMode=true;
  hideHint();select(null);
  // 真上でも OrbitControls にカメラの上の向きを戻されないようにする。
  controls.update=()=>{};
  let lane;
  for(let y=23;y<33&&!lane;y+=.5)for(let x=9;x<34&&!lane;x+=.5){
    const points=[-1,0,.55,1,2,3,4].flatMap(dx=>[-1.2,0,1.2].map(dy=>groundPoint(x+dx,y+dy)));
    if(!points.every(p=>groundPass(groundMapX(p.x),groundMapY(p.z),'vehicle')&&!groundTerrainCover({pos:p})&&Math.abs(p.y-points[0].y)<.15))continue;
    const start=groundPoint(x,y),route=groundMovePath(start,[groundPoint(x+4,y)],'was',true);
    if(route?.points.every(p=>Math.abs(p.z-start.z)<1e-6))lane={x,y};
  }
  if(!lane)throw Error('撮影用の平らな場所が見つからない');

  const baseLayout={...window.WOS_GROUND_RULES.wasCombat.swarmLayout};
  const baseFid=fid;

  const unit=(kind,team,name,platoons,x)=>{
    const f=makeFleet(team,groundUnitSpec({kind,name,at:[lane.x+x,lane.y],platoons,stance:'evade'}));
    fleets.push(f);groundInitUnit(f);
    f.el.style.display='none'; // 近接撮影で機体に重なる名札だけ隠す。
    f.heading.set(team?-1:1,0,0);
    return f;
  };
  const clear=()=>{
    for(const f of fleets){groundClearOrders(f);f.el.remove();f.groundModel.parent?.remove(f.groundModel);}
    fleets=[];groundFxReset();
  };
  const stepFrames=seconds=>{
    for(let i=0;i<Math.round(seconds/.05);i++){
      gameSec+=.05;groundStep(.05);
      for(const f of fleets)groundFormationDraw(f,gameSec);
    }
  };
  const cameraAt=(at,offset,up,view)=>{
    setView(view);camAnim=null;controls.target.copy(at);
    camera.up.fromArray(up);camera.position.copy(at).add(new THREE.Vector3(...offset));
    camera.lookAt(at);camera.updateMatrixWorld(true);
    groundDraw();
  };
  const roleMarks=document.createElement('div');
  roleMarks.style.cssText='position:fixed;inset:0;z-index:100;pointer-events:none';
  document.body.append(roleMarks);
  const markRoles=(was,spanKm)=>{
    // 全景の写真に、各組の中央の色印・凡例・広さ表示を添える。
    const bodies=was.groundModel.userData.formation.bodies;
    const [front,middle]=GROUND_WAS_ROLES[was.groundPlatoons];
    const colors=['#83c8ff','#90dfa5','#ffa9d9'];
    const point=new THREE.Vector3(),wing=new THREE.Vector3();
    for(let pair=0;pair<bodies.length/2;pair++){
      const role=pair<front?0:pair<front+middle?1:2;
      bodies[2*pair].getWorldPosition(point);
      bodies[2*pair+1].getWorldPosition(wing);
      point.lerp(wing,.5).project(camera);
      const x=(1+point.x)*50,y=(1-point.y)*50,mark=document.createElement('span');
      mark.style.cssText=`position:absolute;left:${x}%;top:${y}%;width:8px;height:8px;transform:translate(-50%,-50%);border-radius:50%;background:${colors[role]};border:2px solid #182332`;
      roleMarks.append(mark);
    }
    const badge=document.createElement('div');
    badge.style.cssText='position:absolute;right:20px;top:172px;padding:8px 14px;background:#182332e0;border:1px solid #83c8ff66;color:#eef6ff;font:700 18px/1.3 sans-serif';
    badge.textContent=`広さ 約${spanKm.toFixed(1)} km`;
    roleMarks.append(badge);

    const legend=document.createElement('div');
    legend.style.cssText='position:absolute;right:20px;top:222px;padding:8px 12px;background:#182332d9;font:600 14px/1.7 sans-serif';
    for(const [i,name] of ['前衛 3組','中衛 3組','後衛 2組'].entries()){
      const row=document.createElement('div');
      row.style.color=colors[i];row.textContent=`● ${name}`;legend.append(row);
    }
    roleMarks.append(legend);
  };
  const bodyWorldPoints=units=>{
    groundBoard.updateMatrixWorld(true);
    const points=[];
    for(const f of units){
      for(const body of f.groundModel.userData.formation.bodies){
        const p=new THREE.Vector3();
        body.getWorldPosition(p);
        points.push(p);
      }
    }
    return points;
  };
  window.walkingWasPhoto=platoons=>{
    rebuildGroundRuleSet();
    roleMarks.replaceChildren();
    clear();
    fid=baseFid;gameSec=0;
    const was=unit('was',0,'陸戦型 W.A.S.',platoons,0);
    groundInitOrg(null);
    groundFormationDraw(was,gameSec);
    const dest=groundPoint(lane.x+4,lane.y);
    order(was,{type:'move',dest,groundPreparedPath:groundMovePath(was.pos,[dest],'was',true)});
    dropArrow(was.arrow);was.arrow=null;
    stepFrames(1.75);
    const distance=platoons===4?16.5:5.9;
    cameraAt(was.pos,[0,distance,0],was.heading.toArray(),1);
    return {bodies:groundAliveBodies(was),walking:groundFormationState(was)==='move'&&was.groundTrack.moving.every(Boolean),size:was.groundBodySpec.size};
  };
  window.swarmSpanPhoto=spanKm=>{
    const scale=spanKm/baseLayout.maxSpanKm;
    rebuildGroundRuleSet({wasCombat:{swarmLayout:{
      frontRadiusKm:baseLayout.frontRadiusKm*scale,middleKm:baseLayout.middleKm*scale,rearKm:baseLayout.rearKm*scale,
      allMiddleRadiusKm:baseLayout.allMiddleRadiusKm*scale,allRearRadiusKm:baseLayout.allRearRadiusKm*scale,maxSpanKm:spanKm
    }}});
    roleMarks.replaceChildren();
    clear();
    fid=baseFid;gameSec=0;
    const was=unit('was',0,'陸戦型 W.A.S.',4,0),tank=unit('vehicle',1,'敵戦車',1,.55);
    groundInitOrg(null);
    buildRoster();updateRoster();
    was.band='cruise';was.pos.y=groundUnitHeight(was);
    // 撮影まで全車を残す。士気への打撃にも撮影用の最大耐久を使う。
    for(const b of tank.bodies)b.hp=b.max=10000;
    groundBodySync(tank);
    tank.groundMaxHp=tank.hpPool;
    for(const [i,b] of was.bodies.entries())b.shotT=i<6?(i%3)*.18:2.5;
    const center=was.pos.clone();
    order(was,{type:'attack',target:tank});
    stepFrames(3.8);
    // 機体と戦車が煙や発射の光で隠れないよう、撮影時のエフェクトだけ消す。噴射炎は次の描画で戻る。
    groundFxReset();
    groundDraw();
    const points=bodyWorldPoints([was,tank]);
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of points){
      if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
      if(p.z<minZ)minZ=p.z;if(p.z>maxZ)maxZ=p.z;
    }
    // 自軍側から斜め上に見下ろし、前衛・中衛・後衛と戦車4両が全部入る距離まで引く。
    const at=new THREE.Vector3((minX+maxX)/2,tank.pos.y+.3,(minZ+maxZ)/2);
    const baseOffset=new THREE.Vector3(-2.8,9.4,.65);
    let factor=.9;
    const fits=k=>{
      cameraAt(at,[baseOffset.x*k,baseOffset.y*k,baseOffset.z*k],[0,1,0],0);
      return points.every(p=>{
        const q=p.clone().project(camera);
        return q.z>=-1&&q.z<=1&&Math.abs(q.x)<=.58&&Math.abs(q.y)<=.52;
      });
    };
    while(!fits(factor)&&factor<scale*2.5)factor+=.05;
    const allInView=fits(factor);
    markRoles(was,spanKm);
    return {bodies:groundAliveBodies(was),tanks:groundAliveBodies(tank),
      firing:was.fireTarget===tank&&was.bodies.some(b=>!!b.look),
      stopped:center.equals(was.pos),swarming:was.groundModel.userData.wasSwarming,allInView};
  };
  window.restoreSwarmLayout=()=>rebuildGroundRuleSet();
}

async function main(){
  const out=path.join(ROOT,'.shots','was-formation-game');
  fs.mkdirSync(out,{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:process.platform==='darwin'});
  try{
    await page.evaluate(prepareShots);
    const shot=async name=>{
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(out,name+'.png'),timeout:120000});
      assert.deepEqual(errors,[],'ページ例外');
    };
    const walking=process.argv.includes('--cruise-only')?[]:[[4,'company-walking-top-size05']];
    for(const [platoons,name] of walking){
      assert.deepEqual(await page.evaluate(n=>walkingWasPhoto(n),platoons),{bodies:platoons*4,walking:true,size:.5});
      await shot(name);
    }
    for(const spanKm of SWARM_SPANS_KM){
      assert.deepEqual(await page.evaluate(s=>swarmSpanPhoto(s),spanKm),{bodies:16,tanks:4,firing:true,stopped:true,swarming:true,allInView:true});
      await shot(`swarm-span-${spanKm.toFixed(1)}km`);
    }
    await page.evaluate(()=>restoreSwarmLayout());
    console.log(`.shots/was-formation-game/ ${walking.length+SWARM_SPANS_KM.length}枚（1600×900）`);
  }finally{await browser.close();}
}

main().catch(error=>{console.error(error);process.exitCode=1;});
