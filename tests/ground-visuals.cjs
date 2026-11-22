async function checkGroundVisuals(page,check){
  const rows=await page.evaluate(()=>{
    const rows=[],record=(name,ok)=>rows.push({name,ok:!!ok});
    const calls={};
    const names=['muzzle','shot','hit','blast','airBurst','plume'];
    const originals=Object.fromEntries(names.map(name=>[name,GFX[name]]));
    for(const name of names){
      calls[name]=[];
      GFX[name]=(...args)=>{
        const fx=originals[name](...args);
        calls[name].push({args,fx});
        return fx;
      };
    }
    const scene=(kind,target,band='ground')=>{
      reset({op:'groundExercise2',fleets:[{name:'見た目の確認',kind,at:[9,27],platoons:1}]});
      if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);
      for(const f of fleets)f.alive=f.team===0;
      const f=fleets.find(f=>f.alive),t=makeFleet(1,groundUnitSpec({kind:target,at:[11,27],band,platoons:1}));
      fleets.push(t);groundInitUnit(t);
      f.pos.copy(groundPoint(9,27));f.heading.set(0,0,1);f.groundTrack=null;f.groundDeployed=true;
      f.dmg=.001;f.stance='engage';t.stance='evade';f.groundVisible=t.groundVisible=[true,true];
      for(const b of f.bodies)b.shotT=b.aaT=100;
      return {f,t};
    };
    const single=(f,t,aa=false)=>{
      f.bodies[0][aa?'aaT':'shotT']=0;
      groundBodyFire(f,t,0,aa);groundDraw();
    };
    const currentPose=f=>f.groundModel.userData.pose.stand[0].geometry;
    const pose=(f,key)=>currentPose(f)===f.groundModel.userData.special.get(key);
    const advance=seconds=>{gameSec+=seconds;groundDraw();};
    try{
      let {f,t}=scene('vehicle','vehicle');
      const heading=f.heading.clone(),position=groundBodyPosition(f,0);
      camera.position.copy(position).add(new THREE.Vector3(0,2,4));
      const target=groundBodyTarget(f,0,t,groundTargetRange(f,t));
      single(f,t);
      const body=f.groundModel.userData.formation.bodies[0],parts=body.userData.aimParts;
      groundVisuals.updateWorldMatrix(true,true);
      const muzzle=parts.gun?.localToWorld(new THREE.Vector3(0,0,parts.rig.muzzle));
      if(muzzle)groundVisuals.worldToLocal(muzzle);
      const tracer=calls.shot.at(-1),flash=calls.muzzle.at(-1);
      record('直射の砲塔と砲口が撃った体・標的に合う',target&&parts.parts?.parent===body&&Math.abs(parts.turret.rotation.y)>.5&&muzzle?.distanceTo(flash?.fx.group.position)<1e-6&&tracer?.args[2]==='tracer'&&tracer.args[0](0).distanceTo(muzzle)<1e-6&&tracer.args[0](1).distanceTo(target.pos)<.6&&f.heading.equals(heading)&&groundBodyPosition(f,0).equals(position));
      advance(.45);
      const tank=GFX.tank,tankImpact=calls.blast.at(-1),smoke=flash?.fx.group.children.find(o=>o.isGroup);
      const end=tracer.args[0](1),at=tankImpact?.fx.group.position;
      record('戦車は見本の灰色の砲煙と弾の筋を表示する',flash?.args[0]===tank.muzzleSize*GROUND_BODY_SCALE&&smoke?.children.length===3&&smoke.children.every(p=>p.visible&&p.material.color.getHex()===0x8a8a8c)&&tracer.args[1]===tank.duration&&tracer.args[3]===tank.tracerSize*GROUND_BODY_SCALE);
      record('戦車の直射は到達点の地表に見本の土煙を出す',tankImpact?.args[0]===tank.impactRadius*GROUND_BODY_SCALE&&tankImpact.args[1].smokeK===tank.impactSmoke&&at.x===end.x&&at.z===end.z&&at.y===groundSurfaceHeight(end.x,end.z)+.025);

      ({f,t}=scene('artillery','infantry'));
      t.seen=true;
      const markerAtTarget=()=>fPos.some((x,i)=>i%3===0&&fCol[i+1]>0&&Math.abs(x-t.pos.x)<1e-5&&Math.abs(fPos[i+2]-t.pos.z)<1e-5);
      camera.position.copy(t.pos).add(new THREE.Vector3(0,60,60));updateStalks();
      const farMarker=markerAtTarget();
      camera.position.copy(t.pos).add(new THREE.Vector3(2,3,4));updateStalks();
      record('地上部隊の足元の光は遠景で表示し、近景の着弾とは重ならない',farMarker&&!markerAtTarget());
      f.dmg=10000;
      const aim=groundBodyPosition(t,0),shot=groundStrikeLaunch(f,aim,aim);
      groundDraw();
      const shell=calls.shot.at(-1);
      const heArt=f.groundModel.userData.formation.bodies[0].userData.aimParts;
      record('自走砲の車体と仰角が曲射の初速方向を向く',shot&&shell?.args[2]==='shell'&&!heArt.rig.hasTurret&&Math.abs(heArt.parts?.rotation.y)>.5&&heArt.gun.rotation.x<0);
      groundStrikeStep(shot.left);groundDraw();
      const blast=calls.blast.at(-1);
      record('着弾は弾の半径で爆風を描く',blast?.args[0]===shot.radius&&blast.fx.group.parent===groundVisuals&&!groundImpacts[0].visual.ring);
      advance(.75);
      let lit=false;
      blast.fx.group.traverse(o=>{if(o.isLine||o.material?.blending===THREE.AdditiveBlending)lit=true;});
      record('砲撃で体が撃破されても着弾は土煙だけで、発光や外周線を出さない',t.bodies.some(b=>!b.alive)&&!lit&&calls.hit.length===0);
      advance(6.26);
      record('着弾の効果は期限で取り外す',!blast?.fx.group.parent&&!groundFxQueues.blast.length);
      for(const [type,queue] of Object.entries(groundFxQueues)){
        const make=()=>({group:new THREE.Group(),update:()=>true});
        groundFxAdd(type,gameSec,10,make);groundFxDraw(gameSec);
        const oldest=queue.at(-1).fx.group,limit=GROUND_FX_LIMIT[type];
        for(let i=0;i<limit+3;i++)groundFxAdd(type,gameSec,10,make);
        record(type+' の上限で古い効果を取り外す',queue.length===limit&&!oldest.parent);
      }
      groundFxReset();

      ({f,t}=scene('was','infantry'));
      single(f,t);
      record('W.A.S. の地上射撃姿勢',pose(f,'wasFire'));
      advance(1.1);
      const climbs=groundWasToggle(f);groundDraw();
      record('W.A.S. の上昇姿勢と背中の噴射',climbs&&pose(f,'wasFlyUp')&&groundFxPlumesUsed===2*f.bodies0&&calls.plume.length>0);
      groundStepBand(f,groundRuleSet().wasFlight.transitionSec);f.pos.y=groundUnitHeight(f);advance(.5);
      record('W.A.S. の空中待機姿勢',pose(f,'wasFly'));
      f.order={type:'move'};f.pos.x+=.05;advance(.05);
      record('W.A.S. の通常飛行は盾を下げ、機体の位置が有効',pose(f,'wasFlyMarch')&&f.groundModel.userData.pose.stand.every(b=>b.position.toArray().every(Number.isFinite)));
      f.order={type:'move',groundAdvance:true};f.pos.x+=.05;advance(.05);
      record('W.A.S. の進撃飛行は盾を構える',pose(f,'wasFlyMove'));
      f.order={type:'attack',target:t};f.pos.x+=.05;advance(.05);
      record('W.A.S. の追撃飛行は盾を構える',pose(f,'wasFlyMove'));
      t.band='low';t.pos.y=groundUnitHeight(t);single(f,t,true);
      record('W.A.S. の空中射撃姿勢',pose(f,'wasFlyFire'));
      advance(.3);
      record('対空射撃は空中で炸裂する',calls.airBurst.at(-1)?.fx.group.position.y>10);
      const lands=groundWasToggle(f);groundDraw();
      record('W.A.S. の下降姿勢',lands&&pose(f,'wasFlyDown'));

      ({f,t}=scene('heavyInfantry','vehicle'));
      single(f,t);
      record('重強化歩兵は対戦車射撃で発射機を起こす',pose(f,'hinfMsl')&&calls.shot.at(-1)?.args[2]==='rocket');
      t.groundKind='infantry';single(f,t);
      const rifle=f.groundModel.userData.pose.stand[0];
      rifle.updateWorldMatrix(true,false);
      const rifleMuzzle=groundVisuals.worldToLocal(rifle.localToWorld(new THREE.Vector3().fromArray(rifle.geometry.userData.muzzle)));
      record('重強化歩兵は対歩兵射撃で小銃を使う',currentPose(f)===f.groundModel.userData.pose.rest&&calls.shot.at(-1)?.args[2]==='tracer'&&rifleMuzzle.distanceTo(calls.muzzle.at(-1)?.fx.group.position)<1e-6);
      t.band='low';t.pos.y=groundUnitHeight(t);single(f,t,true);
      record('重強化歩兵は対空射撃でも発射機を起こす',pose(f,'hinfMsl')&&calls.shot.at(-1)?.args[2]==='rocket');
      reset({op:'charybdis'});setSpeed(0);
      record('作戦切替で効果・噴射を破棄する',Object.values(groundFxQueues).every(q=>!q.length)&&!groundFxPlumes.length&&!groundVisuals);
    }finally{Object.assign(GFX,originals);}
    return rows;
  });
  for(const {name,ok} of rows)check(ok,'地上の見た目: '+name);
}
module.exports={checkGroundVisuals};
