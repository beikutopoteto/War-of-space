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
    const gatlingBurst=(f,t,aa=false)=>{
      groundDraw();
      const start=gameSec,before=Object.fromEntries(names.map(name=>[name,calls[name].length]));
      const target=groundBodyTarget(f,0,t,aa?groundAARange(f):groundTargetRange(f,t));
      const entries=[],add=groundFxAdd;
      let initial,guns,shoulder,hitPoint;
      groundFxAdd=(type,start,life,create,options)=>{
        entries.push({type,start,life});
        return add(type,start,life,create,options);
      };
      try{
        single(f,t,aa);
        if(!target)return false;
        const body=f.groundModel.userData.pose.stand[0],geo=body.geometry.userData;
        if(!geo.guns)return false;
        body.updateWorldMatrix(true,false);
        const world=local=>groundVisuals.worldToLocal(body.localToWorld(new THREE.Vector3().fromArray(local)));
        guns=geo.guns.map(world);
        shoulder=world(geo.muzzle);
        hitPoint=groundVisualBodyPoint(t,target.j,target.pos);
        if(t.band==='ground')hitPoint.y+=t.groundBodySpec.body*.5;
        initial=entries.length;
        for(let k=1;k<20;k++){gameSec=start+k*.05+.001;groundDraw();}
      }finally{groundFxAdd=add;}
      const tracers=calls.shot.slice(before.shot),flashes=calls.muzzle.slice(before.muzzle),hits=calls.hit.slice(before.hit);
      return initial===3&&entries.length===25&&entries.every(e=>e.type==='direct')&&guns.length===2&&guns[0].distanceTo(guns[1])>0&&
        tracers.length===10&&flashes.length===10&&hits.length===5&&
        tracers.every(({args:[path,duration,kind,size]},k)=>{
          const muzzle=path(0),offset=path(1).sub(hitPoint);
          return muzzle.distanceTo(guns[k%2])<1e-6&&muzzle.distanceTo(shoulder)>.1&&duration===.14&&kind==='tracer'&&size===.03&&
            Math.abs(offset.x)<=.18&&Math.abs(offset.z)<=.18&&offset.y>=-.054&&offset.y<=.126;
        })&&flashes.every(({args:[size,options],fx},k)=>size>=.09*.8&&size<=.09*1.2&&options.life===.06&&fx.group.position.distanceTo(guns[k%2])<1e-6)&&
        hits.every(({args:[size],fx},k)=>size===.12&&fx.group.position.distanceTo(tracers[k*2].args[0](1))<1e-6)&&
        entries.filter(e=>e.life===.14).every((e,k)=>Math.abs(e.start-start-k*.05)<1e-6)&&
        entries.filter(e=>e.life===.5).every((e,k)=>Math.abs(e.start-start-.14-k*.1)<1e-6);
    };
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
      const special=f.groundModel.userData.special;
      record('W.A.S. の地上・飛行射撃の形に右腕の銃口が2つある',
        ['wasFire','wasFlyFire'].every(key=>special.get(key)?.userData.guns?.length===2));
      record('W.A.S. の対歩兵射撃は右腕の2本から交互に10発、着弾は5回',gatlingBurst(f,t));
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
      record('W.A.S. の対空射撃は空中で炸裂する',calls.hit.at(-1)?.fx.group.position.y>10);
      const lands=groundWasToggle(f);groundDraw();
      record('W.A.S. の下降姿勢',lands&&pose(f,'wasFlyDown'));

      for(const band of ['cruise','low']){
        ({f,t}=scene('was','infantry'));
        f.band=band;f.pos.y=groundUnitHeight(f);
        record('W.A.S. の飛行中の対地射撃も右腕から10発（'+band+'）',gatlingBurst(f,t)&&pose(f,'wasFlyFire'));
      }
      ({f,t}=scene('was','fighter','low'));
      record('W.A.S. の地上からの対空射撃も右腕から10発',gatlingBurst(f,t,true)&&pose(f,'wasFire'));

      ({f,t}=scene('was','vehicle'));
      const wasTracers=calls.shot.length;
      single(f,t);advance(.5);
      const wasBody=f.groundModel.userData.pose.stand[0];
      wasBody.updateWorldMatrix(true,false);
      const wasMuzzle=groundVisuals.worldToLocal(wasBody.localToWorld(new THREE.Vector3().fromArray(wasBody.geometry.userData.muzzle)));
      const wasShot=calls.shot.at(-1)?.args;
      record('W.A.S. の対戦車射撃は従来どおり左肩から太さ .17 の1発',
        calls.shot.length===wasTracers+1&&wasShot[3]===.17&&wasShot[0](0).distanceTo(wasMuzzle)<1e-6);

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
      // ユーザーの指示 2026-11-22: 撃った直後だけ向いて一瞬で戻らない
      ({f,t}=scene('artillery','vehicle'));
      // 撃った直後の向きを、撃つ処理と同じ形で置く（自走砲の直接射撃は距離で撃たないことがあるため）
      f.fireTarget=t;f.bodies[0].look={yaw:Math.atan2(t.pos.x-f.pos.x,t.pos.z-f.pos.z),el:.2,until:gameSec+1};groundDraw();
      const gunState=f.groundModel.userData.formation.bodies[0].userData.aimParts;
      advance(3);
      const kept=!!gunState.parts?.parent&&Math.abs(gunState.yaw)>.5;
      const realNow=performance.now;let ms=realNow.call(performance);performance.now=()=>ms;
      t.alive=false;ms+=50;groundDraw();const yaw1=Math.abs(gunState.yaw);ms+=50;groundDraw();const yaw2=Math.abs(gunState.yaw);
      performance.now=realNow;
      record('自走砲は撃つ相手がいる間は車体を向けたまま、いなくなるとなめらかに正面へ戻る',kept&&yaw1>.3&&yaw2<yaw1&&!!gunState.parts?.parent);
      reset({op:'charybdis'});setSpeed(0);
      record('作戦切替で効果・噴射を破棄する',Object.values(groundFxQueues).every(q=>!q.length)&&!groundFxPlumes.length&&!groundGatlingBursts.length&&!groundVisuals);
    }finally{Object.assign(GFX,originals);}
    return rows;
  });
  for(const {name,ok} of rows)check(ok,'地上の見た目: '+name);
}
module.exports={checkGroundVisuals};
