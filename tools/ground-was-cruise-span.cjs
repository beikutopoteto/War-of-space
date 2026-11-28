/* #525: node tools/ground-was-cruise-span.cjs [1 2 3 4] — 写真を撮らずに機体間の最大距離を測る。 */
const assert=require('node:assert/strict');
const {openGame}=require('./browser.cjs');

function measure(multipliers){
  WOS.start({op:'groundExercise2',fleets:[]});
  if(talking)endTalk();
  if(deploying)endDeploy();
  setSpeed(0);
  op={...op,groundHQ:null,groundStaticEnemies:false,npc:null};
  for(const f of fleets){f.el.remove();f.groundModel?.parent?.remove(f.groundModel);}
  fleets=[];

  // 見本と同じ条件で、戦車の手前に4 kmの直線と直角の経由地を取れる平地を探す。
  let lane;
  for(let y=23;y<33&&!lane;y+=.5)for(let x=9;x<34&&!lane;x+=.5){
    const points=[-1,0,.55,1,2,3,4].flatMap(dx=>[-1.2,0,1.2].map(dy=>groundPoint(x+dx,y+dy)));
    if(points.every(p=>groundPass(groundMapX(p.x),groundMapY(p.z),'vehicle')&&
      !groundTerrainCover({pos:p})&&Math.abs(p.y-points[0].y)<.15))lane={x,y};
  }
  if(!lane)throw Error('測定用の平地が見つからない');
  const point=(dx,dy=0)=>groundPoint(lane.x+dx,lane.y+dy);
  const add=(kind,team,platoons,position)=>{
    const unit=makeFleet(team,groundUnitSpec({kind,at:[groundMapX(position.x),groundMapY(position.z)],platoons,stance:'evade'}));
    fleets.push(unit);groundInitUnit(unit);
    unit.groundHoldFire=true;
    unit.heading.set(team?-1:1,0,0);
    return unit;
  };
  const start=point(0),end=point(4),corner=point(4,1.2);
  add('vehicle',1,1,point(2,1.2));
  const baseSpacing=groundWasCruiseSpacing(),baseId=fid,dt=.02;
  const cruise=multipliers.map(multiplier=>{
    fid=baseId;gameSec=0;
    const cruiseSpacing=baseSpacing*multiplier;
    rebuildGroundRuleSet({wasCombat:{cruiseSpacing}});
    const company=add('was',0,4,start),model=company.groundModel;
    const bodies=model.userData.formation.bodies;
    if(bodies.length!==16)throw Error('W.A.S. が16機そろっていない');
    const span=()=>Math.max(...bodies.flatMap(a=>bodies.map(b=>
      Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)/GROUND_SCALE)));
    const move=(dest,via=[])=>{
      const groundPreparedPath=groundMovePath(company.pos,[...via,dest],groundMoveKind(company),true);
      if(!groundPreparedPath)throw Error('測定用の経路が引けない');
      order(company,{type:'move',dest,via,groundPreparedPath});
    };
    const tick=()=>{gameSec+=dt;groundStep(dt);groundFormationDraw(company,gameSec);};
    const travel=until=>{
      let maxKm=span(),frames=0;
      while(frames<800&&!until()){
        tick();
        maxKm=Math.max(maxKm,span());frames++;
      }
      if(!until()||!frames)throw Error('測定区間を移動できなかった');
      return {maxKm,frames};
    };
    groundFormationDraw(company,gameSec);
    if(!groundWasToggle(company))throw Error('巡航へ切り替えられない');
    for(let i=0;company.bandTo&&i<200;i++)tick();
    if(company.band!=='cruise'||company.bandTo)throw Error('巡航への切り替えが終わらない');

    move(end);
    const outbound=travel(()=>company.pos.x>=point(3).x);
    const reverseAt=gameSec;
    move(start);
    const reversal=travel(()=>!company.order&&gameSec-reverseAt>=4);
    if(groundDistanceTo(company,{pos:start})>1e-6||company.heading.x>-.99)throw Error('折り返して出発点に戻っていない');

    move(corner,[end]);
    const bend=travel(()=>!company.order);
    if(groundDistanceTo(company,{pos:corner})>1e-6||company.heading.z>-.99)throw Error('直角に曲がっていない');
    // 中隊の印が止まった後も、飛んでいる機体が追いつくまで測る。
    const settle=travel(()=>gameSec-company.groundMovedAt>=4);
    const maximum=Math.max(outbound.maxKm,reversal.maxKm,bend.maxKm,settle.maxKm);
    company.el.remove();model.parent.remove(model);
    fleets=fleets.filter(f=>f!==company);
    return {multiplier,cruiseSpacing,maximum,outbound,reversal,bend,settle};
  });
  return {lane,cruise};
}

async function main(){
  const multipliers=process.argv.slice(2).map(Number);
  if(multipliers.some(n=>![1,2,3,4].includes(n)))throw Error('倍率は1〜4を指定');
  const {browser,page,errors}=await openGame();
  try{
    const result=await page.evaluate(measure,multipliers.length?multipliers:[1,2,3,4]);
    assert.deepEqual(errors,[],'ページ例外');
    console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();}
}

main().catch(error=>{console.error(error);process.exitCode=1;});
