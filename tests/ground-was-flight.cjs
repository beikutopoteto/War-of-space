function nodeChecks(){
  const {createControlsContext}=require('./ground-controls.cjs');
  const {run}=createControlsContext();
  return run(`(() => {
    op={ground:'exercise2'};groundVisuals=new THREE.Group();
    const start=groundPoint(9,23),baseSpacing=groundWasCruiseSpacing(),baseId=fid,dt=.01;
    const check=(name,ok)=>({name,ok:!!ok}),close=(a,b)=>Math.abs(a-b)<1e-7;
    const cases=[1/3,2/3,1,4/3].map(scale=>{
      const multiplier=scale*3;
      gameSec=0;fid=baseId;
      rebuildGroundRuleSet({wasCombat:{cruiseSpacing:baseSpacing*scale}});
      const was=makeFleet(0,{groundKind:'was',name:'陸戦型 W.A.S.',type:'cv',n:1,scale:.3,pos:[start.x,start.z],groundPlatoons:4,stance:'evade'});
      groundInitUnit(was);
      was.heading.set(0,0,1);
      const bodies=was.groundModel.userData.formation.bodies,layout=groundLayouts(was).move;
      const walking=()=>bodies.every((body,i)=>close(body.position.x,layout[i].x)&&close(body.position.z,layout[i].z));
      const draw=()=>groundFormationDraw(was,gameSec);
      draw();
      const walked=walking(),takesOff=groundWasToggle(was)&&was.bandTo==='cruise';
      const band=()=>{
        while(was.bandTo){
          gameSec+=dt;groundStepBand(was,dt);was.pos.y=groundUnitHeight(was);groundWasFlightStep(was,dt);draw();
        }
      };
      band();
      const snapshot=()=>{
        const yaw=Math.atan2(was.heading.x,was.heading.z),axis=new THREE.Vector3(0,1,0);
        return bodies.map(b=>({pos:b.position.clone().applyAxisAngle(axis,yaw).add(was.pos),yaw:yaw+b.rotation.y}));
      };
      const span=()=>Math.max(...bodies.flatMap(a=>bodies.map(b=>Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z))))/GROUND_SCALE;
      const speed=groundRuleSet().wasFlight.speed.cruise;
      let maximum=0;
      const advance=(moving=true,seconds=dt)=>{
        gameSec+=seconds;
        if(moving){was.pos.addScaledVector(was.heading,speed*seconds);was.groundMovedAt=gameSec;}
        groundWasFlightStep(was,seconds);draw();
        maximum=Math.max(maximum,span());
      };
      const spacing=baseSpacing*scale;
      const dims=groundBodyDims(was.groundBodySpec),L=dims.len,W=dims.wid,H=dims.ht;
      const driftRules=groundRuleSet().wasCombat.cruiseDrift;
      const sepXZ=W*driftRules.sepWidth,sepY=H*driftRules.sepHeight;
      const minSep=()=>{
        let m=Infinity;
        for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
          const a=bodies[i].position,b=bodies[j].position;
          m=Math.min(m,Math.hypot((a.x-b.x)/sepXZ,(a.z-b.z)/sepXZ,(a.y-b.y)/sepY));
        }
        return m;
      };
      const gaps=layout.map((p,i)=>spacing*Math.min(...layout.map((q,j)=>i===j?Infinity:Math.hypot(p.x-q.x,p.z-q.z))));
      const spread=values=>Math.max(...values)-Math.min(...values);
      const offsets=()=>bodies.map((b,i)=>b.position.clone().sub(new THREE.Vector3(layout[i].x*spacing,0,layout[i].z*spacing)));
      const aligned=()=>{
        const vectors=offsets();
        const mean=vectors.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(vectors.length);
        const bound=Math.max(L*1.35*(1+driftRules.spacingGain*(multiplier-1)),Math.max(...gaps));
        return span()<=.4*multiplier+1e-6&&vectors.every(p=>Math.hypot(p.x-mean.x,p.z-mean.z)<bound);
      };
      const sampleDrift=moving=>{
        for(let i=0;i<40;i++)advance(moving,.05);
        const samples=[];
        let minPair=Infinity;
        for(let i=0;i<360;i++){advance(moving,.05);minPair=Math.min(minPair,minSep());samples.push(offsets());}
        const range=(i,axis)=>spread(samples.map(frame=>frame[i][axis]))/2;
        const independent=(i,j,axis)=>spread(samples.map(frame=>frame[i][axis]-frame[j][axis]))/2;
        const factor=moving?1:driftRules.idleFactor;
        const gain=1+driftRules.spacingGain*(multiplier-1);
        const meanRangeX=bodies.reduce((s,_,i)=>s+range(i,'x'),0)/bodies.length;
        const meanRangeZ=bodies.reduce((s,_,i)=>s+range(i,'z'),0)/bodies.length;
        const meanRangeY=bodies.reduce((s,_,i)=>s+range(i,'y'),0)/bodies.length;
        const ok=aligned()&&minPair>.7&&bodies.every((_,i)=>
          range(i,'x')>.24*factor*L&&range(i,'z')>.24*factor*L&&
          Math.max(range(i,'x'),range(i,'z'))>.38*factor*L&&
          range(i,'y')>.22*factor*H&&
          (i%2===1||['x','y','z'].every(axis=>independent(i,i+1,axis)>.08*factor*Math.min(L,H))));
        return {ok,meanRangeX,meanRangeZ,meanRangeY,minPair,gain};
      };
      was.order={type:'move'};
      const movingDrift=sampleDrift(true),behind=offsets().reduce((sum,p)=>sum-p.z,0)/bodies.length/GROUND_SCALE;
      const idleDrift=sampleDrift(false);
      for(let i=0;i<70;i++)advance();
      const pairGaps=frame=>frame.filter((_,i)=>i%2===0).map((b,i)=>b.pos.distanceTo(frame[2*i+1].pos));
      const avg=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
      // 180° 反転（部隊内クロス）: 前衛が後ろから新しい先頭へ抜け、最後列は元の向き側を向いて撃ちながら新しい最後尾へ下がる。
      const reverse=(()=>{
        const oldYaw=Math.atan2(was.heading.x,was.heading.z),newYaw=Math.atan2(0,-1);
        const startSnap=snapshot();
        was.heading.set(0,0,-1);
        draw();
        let previous=snapshot(),smooth=previous.every((b,i)=>b.pos.distanceTo(startSnap[i].pos)<1e-7&&close(groundWrap(b.yaw-startSnap[i].yaw),0));
        let startFrontRear=false,rearFacedOld=true,overtook=false;
        for(let step=1;step<=420;step++){
          advance();
          const current=snapshot();
          current.forEach((b,i)=>{
            const yaw=Math.abs(groundWrap(b.yaw-previous[i].yaw));
            smooth&&=yaw<.05&&b.pos.distanceTo(previous[i].pos)<speed*dt*2.2;
          });
          const fz=avg(bodies.slice(0,4).map(b=>b.position.z)),rz=avg(bodies.slice(12,16).map(b=>b.position.z));
          if(step===1)startFrontRear=fz<rz;
          if(step>=20&&step<=200){
            const rearOk=current.slice(12,16).every((b,k)=>Math.abs(groundWrap(b.yaw-oldYaw))<.2&&bodies[12+k].userData.wasReverseFire);
            rearFacedOld&&=rearOk;
          }
          if(step<=160&&fz>rz)overtook=true;
          previous=current;
        }
        const endFz=avg(bodies.slice(0,4).map(b=>b.position.z)),endRz=avg(bodies.slice(12,16).map(b=>b.position.z));
        const rejoined=aligned()&&endFz>endRz&&previous.every(b=>Math.abs(groundWrap(b.yaw-newYaw))<.2)&&bodies.every(b=>!b.userData.wasReverseFire);
        return {ok:smooth&&startFrontRear&&rearFacedOld&&overtook&&rejoined};
      })();
      // 90° 浅い曲がり角（120°未満）: 従来の時間差の弧で崩れてから矢印へ戻る。
      const bend=(()=>{
        const startSnap=snapshot();
        const beforeGaps=pairGaps(startSnap);
        was.heading.set(1,0,0);
        draw();
        let previous=snapshot(),smooth=previous.every((b,i)=>b.pos.distanceTo(startSnap[i].pos)<1e-7&&close(groundWrap(b.yaw-startSnap[i].yaw),0));
        const first=bodies.map(()=>Infinity);
        let curvedAt,tighter=0,wider=0,noReverseFire=true;
        for(let step=1;step<=400;step++){
          advance();
          const current=snapshot();
          current.forEach((b,i)=>{
            const yaw=Math.abs(groundWrap(b.yaw-previous[i].yaw));
            if(yaw>.0025)first[i]=Math.min(first[i],step);
            smooth&&=yaw<.05&&b.pos.distanceTo(previous[i].pos)<speed*dt*2.2;
          });
          noReverseFire&&=bodies.every(b=>!b.userData.wasReverseFire);
          if(step===45)curvedAt=current;
          if(step<=150)pairGaps(current).forEach((gap,i)=>{
            tighter=Math.max(tighter,(beforeGaps[i]-gap)/Math.max(gaps[2*i],.01));
            wider=Math.max(wider,(gap-beforeGaps[i])/Math.max(gaps[2*i],.01));
          });
          previous=current;
        }
        const curved=previous.filter((b,i)=>{
          const chord=b.pos.clone().sub(startSnap[i].pos),mid=curvedAt[i].pos.clone().sub(startSnap[i].pos);
          const length=Math.hypot(chord.x,chord.z);
          return Math.abs(chord.x*mid.z-chord.z*mid.x)>.01*multiplier*length;
        }).length>=bodies.length/2;
        const staggered=first.every(Number.isFinite)&&spread(first)>=12;
        const rejoined=aligned()&&previous.every(b=>Math.abs(groundWrap(b.yaw-Math.atan2(1,0)))<.2);
        return {motion:smooth&&staggered&&curved&&noReverseFire,breakup:(tighter>.15||wider>.25)&&rejoined};
      })();
      const matchesFlight=snapshot().every(({pos},i)=>{
        pos.y+=GROUND_BODY_LIFT;
        return pos.distanceTo(groundBodyPosition(was,i))<1e-7;
      })&&groundBodyPosition(was,0).distanceTo(groundBodyPosition(was,1))>.01;
      groundClearOrders(was);was.pos.copy(start);was.heading.set(0,0,1);
      const lands=groundWasToggle(was)&&was.bandTo==='ground';
      band();
      return {walked:walked&&takesOff&&lands&&was.band==='ground'&&walking(),compact:bodies.length===16&&maximum<=.4*multiplier+.005,maximum,
        movingDrift,idleDrift,follows:Math.abs(behind)<.13,reverse,bend,matchesFlight};
    });
    const growsWithSpacing=cases[3].movingDrift.meanRangeX>cases[0].movingDrift.meanRangeX&&cases[3].movingDrift.meanRangeZ>cases[0].movingDrift.meanRangeZ;
    const idleSmaller=cases.every(c=>c.idleDrift.ok&&c.idleDrift.meanRangeX<c.movingDrift.meanRangeX*.8&&c.idleDrift.meanRangeY<c.movingDrift.meanRangeY*.8);
    return [
      check('巡航移動の間隔は採用値 0.36（歩行の36%・旧値の3倍）',close(baseSpacing,.36)),
      check('離陸して巡航へ入り、着陸後は採用図の歩行間隔に戻る',cases.every(c=>c.walked)),
      {...check('巡航の16機は×1〜×4とも反転と曲がり角で端から端が0.4 km×倍率くらいに収まる',cases.every(c=>c.compact)),detail:cases.map(c=>c.maximum.toFixed(4)+' km').join(' / ')},
      check('×1〜×4の直進中は模型の大きさ基準で前後・左右・上下に僚機とも別々に漂い、重ならず間隔に応じて広がる',cases.every(c=>c.movingDrift.ok)&&growsWithSpacing),
      check('×1〜×4の待機中も、幅を小さくして矢印の中で漂う',idleSmaller),
      check('直進中の各機は中隊の目印から遅れ続けず、自分の位置へ追いつく',cases.every(c=>c.follows)),
      check('反転では前衛が新しい先頭へ抜け、最後列の小隊が元の向き側を向いて撃つ姿勢で新しい最後尾へ下がる',cases.every(c=>c.reverse.ok)),
      check('浅い曲がり角（120°未満）では、時間差で弧を描いて崩れ、数秒後に矢印へ戻る',cases.every(c=>c.bend.motion&&c.bend.breakup)),
      check('巡航移動中の射撃・被弾の位置は描画と同じ機体別の位置',cases.every(c=>c.matchesFlight))
    ];
  })()`);
}

async function checkWasFlight(page,check){
  const rows=await page.evaluate(()=>{
    reset({op:'groundExercise2'});
    setSpeed(0);
    op={...op,groundHQ:null,groundStaticEnemies:false};
    const rows=[],record=(name,ok,detail='')=>rows.push({name,ok,detail});
    const close=(a,b)=>Math.abs(a-b)<1e-6;
    const was=fleets.find(f=>f.team===0&&f.groundKind==='was');
    const vehicle=fleets.find(f=>f.team===1&&f.groundKind==='vehicle');
    fleets=[was,vehicle];
    const at=groundPoint(12,26.4);
    was.pos.copy(at);vehicle.pos.copy(at).add(new THREE.Vector3(1,0,0));
    was.stance=vehicle.stance='evade';
    select(was);
    const toggle=document.getElementById('groundWasFlight'),alt=document.getElementById('groundCommand');
    const band=name=>alt.querySelector(`[data-band="${name}"]`);
    const label=()=>toggle.getAttribute('aria-label');
    const settle=()=>{
      groundStepBand(was,was.bandLeft);
      was.pos.y=groundUnitHeight(was);
      groundHud();
    };
    const iconMatches=id=>toggle.innerHTML===new DOMParser().parseFromString(WOS_COMMAND_ICONS[id].svg,'text/html').body.innerHTML;
    record('歩きは高度を隠し、占領に参加',alt.hidden&&label()==='飛行'&&iconMatches('wasFly')&&groundCanCapture(was)&&groundCanCaptureRoad(was));
    const walkRange=groundFireRanges(was);
    toggle.click();
    record('離陸が始まると占領を止める',was.bandTo==='cruise'&&!groundCaptureCounts(was)&&!groundCanCaptureRoad(was));
    settle();
    const heightM=(was.pos.y-groundHeight(was.pos.x,was.pos.z))*1000/GROUND_SCALE;
    record('巡航は30m、地上の射程と着陸ボタンを使う',was.band==='cruise'&&close(heightM,30)&&JSON.stringify(walkRange)===JSON.stringify(groundFireRanges(was))&&label()==='着陸'&&iconMatches('wasLand')&&!alt.hidden&&band('high').hidden, heightM.toFixed(1)+' m');
    band('low').click();settle();
    record('「低」は空中射程に切り替える',was.band==='low'&&groundFireRanges(was).ground===5*GROUND_SCALE&&groundAARange(was)===15*GROUND_SCALE&&!groundManualTargetAllowed(vehicle,was));
    band('ground').click();settle();
    record('「地上」は巡航に戻る',was.band==='cruise'&&!was.bandTo&&label()==='着陸');
    band('low').click();settle();toggle.click();
    const beginsBelow=was.band==='low'&&was.bandTo==='cruise';
    settle();
    const goesOnToLand=was.band==='cruise'&&was.bandTo==='ground';
    settle();
    record('低高度から巡航を経て1回の操作で着陸',beginsBelow&&goesOnToLand&&was.band==='ground'&&!was.bandTo&&alt.hidden&&label()==='飛行'&&groundCanCapture(was));

    // 体を撃破する最後の弾は残り耐久で頭打ちになるため、回避の測定では耐久を十分に取る。
    for(const body of was.bodies)body.hp=body.max=1000;
    groundBodySync(was);
    const originalDamage=damage;
    const hits=[];
    damage=(t,n,f,...args)=>{
      const hp=t.hpPool;
      const spent=args[1]?.groundWasArmorSpent;
      originalDamage(t,n,f,...args);
      if(t===was&&f===vehicle&&hp>t.hpPool)hits.push({aa:f.groundAAResolving===t,scale:(hp-t.hpPool)/(n*args[2].armorFactor),reactive:!spent&&!!args[1]?.groundWasArmorSpent});
    };
    try{
      vehicle.stance='engage';
      const fire=()=>{
        for(const b of vehicle.bodies)b.shotT=b.aaT=0;
        groundStep(.05);
        return hits.splice(0);
      };
      const walking=fire();
      toggle.click();settle();
      const cruising=fire();
      vehicle.pos.copy(at).add(new THREE.Vector3(6,0,0));
      const cruisingFar=fire();
      vehicle.pos.copy(at).add(new THREE.Vector3(1,0,0));
      band('low').click();settle();
      const low=fire();
      const scale=groundRuleSet().combat.damageScale;
      const counts=hits=>({direct:hits.filter(h=>!h.aa).length,aa:hits.filter(h=>h.aa).length});
      record('敵の車両は巡航を二重発射せず、直射の主砲だけで撃ち、低空は自動対空で撃つ',walking.length>0&&walking.every(h=>!h.aa)&&cruising.length>0&&cruising.every(h=>!h.aa)&&cruisingFar.length>0&&cruisingFar.every(h=>!h.aa)&&low.length>0&&low.every(h=>h.aa),JSON.stringify([walking,cruising,cruisingFar,low].map(counts)));
      const expected=(hits,factor)=>hits.every(h=>close(h.scale,factor*scale*(h.reactive?.5:1)));
      record('装甲を除いた実被弾量は地上0.7倍・飛行中0.4倍、反応装甲を使った弾はさらに半分',expected(walking,.7)&&cruising.length>0&&cruisingFar.length>0&&low.length>0&&expected([...cruising,...cruisingFar,...low],.4));
    }finally{damage=originalDamage;}

    vehicle.stance='evade';vehicle.groundHoldFire=true;
    toggle.click();settle();settle();
    const d=groundData(),cell=d.meta.cellKm;
    const i=d.terrain.cells.findIndex((t,i)=>{
      const x=(i%d.terrain.cols+.5)*cell,y=(Math.floor(i/d.terrain.cols)+.5)*cell,p=groundPoint(x,y);
      return t==='沼地'&&groundPass(x,y,'was')&&groundFactor(p.x,p.z,'was')===.6;
    });
    const swamp=groundPoint((i%d.terrain.cols+.5)*cell,(Math.floor(i/d.terrain.cols)+.5)*cell);
    // 行き先は0.1秒で着かない遠さにする（巡航は速さ12で0.1秒に1.2進む。2026-11-25）。
    const travel=(far=.8)=>{
      was.pos.copy(swamp);
      const original=swamp.clone(),dest=original.clone().add(new THREE.Vector3(far,0,0));
      order(was,{type:'move',dest});
      groundStep(.1);
      const distance=groundDistanceTo(was,{pos:original});
      groundClearOrders(was);
      return {distance,speed:was.speed};
    };
    const ground=travel();toggle.click();settle();
    const flight=travel(3),sea=groundPoint(12,3);
    record('巡航速度は wasFlight.speed.cruise（歩きと別の値）。沼地で減速せず、海上へ経路を引ける',i>=0&&close(flight.speed,groundRuleSet().wasFlight.speed.cruise)&&close(ground.speed,groundRuleSet().unitTypes.was.speed)&&close(ground.distance,.1*.6*ground.speed)&&close(flight.distance,.1*flight.speed)&&!!groundPath(was.pos,sea,groundMoveKind(was)),JSON.stringify({ground,flight}));
    was.pos.copy(sea);groundHud();
    const waterNoLand=toggle.disabled&&!groundWasToggle(was);
    was.pos.copy(at);groundHud();toggle.click();
    was.pos.copy(sea);settle();
    record('水面への着陸拒否と降下中に地表を外れたときの巡航復帰',waterNoLand&&was.band==='cruise'&&!was.bandTo&&!was.groundWasLanding);

    was.groundSupply=0;
    groundStep(.05);
    const waitsOverWater=!groundLandable(was)&&was.band==='cruise'&&!was.bandTo;
    was.pos.copy(at);
    groundStep(.05);
    const autoLanding=was.bandTo==='ground'&&was.groundWasLanding;
    groundStep(was.bandLeft);groundHud();
    record('巡航中に補給が切れると、水上では巡航を続け、地表で自動着陸して歩行になる',waitsOverWater&&autoLanding&&was.band==='ground'&&!was.bandTo&&label()==='飛行'&&alt.hidden&&groundCanCapture(was));

    const disabled=toggle.disabled;
    toggle.click();
    const playerBlocked=was.band==='ground'&&!was.bandTo;
    const hq=groundSites.find(s=>s.id==='B');
    const npcDestination=groundSites.find(s=>groundLandable(was,s.pos)&&groundDistanceTo(was,s)>=groundRuleSet().wasFlight.npcMinKm*GROUND_SCALE);
    npcGroundMove(was,npcDestination.pos);
    record('補給0ではプレイヤーも NPC も離陸できない',disabled&&playerBlocked&&was.band==='ground'&&!was.bandTo&&!was.groundWasNpcCruise);
    groundClearOrders(was);
    op={...op,groundHQ:{0:'B',1:'F'}};
    was.pos.copy(hq.pos);was.groundSupplyWait=groundSupplyRules().refillWait;
    groundStep(.05);groundHud();
    const refilled=was.groundSupply>0&&!toggle.disabled;
    toggle.click();
    record('本営で補給が入ると再び離陸できる',refilled&&was.bandTo==='cruise');
    settle();

    band('low').click();settle();
    was.groundSupply=.001;was.groundSupplyWait=groundSupplyRules().refillWait;
    groundStep(.05);
    const startsInLow=was.band==='low'&&was.bandTo==='cruise'&&was.groundSupply>0;
    groundStep(was.bandLeft);
    const viaCruise=was.band==='cruise'&&was.bandTo==='ground';
    groundStep(was.bandLeft);
    record('低高度で停止中に使い切ると、同じステップで補給されても巡航を経て着陸する',startsInLow&&viaCruise&&was.band==='ground'&&!was.bandTo);
    groundHud();toggle.click();groundStep(was.bandLeft);groundStep(.05);
    record('補給済みで着陸したあとは再離陸しても自動着陸しない',was.band==='cruise'&&!was.bandTo);
    return rows;
  });
  for(const {name,ok,detail} of rows)check(ok,'W.A.S. 飛行: '+name,detail);
}
module.exports={nodeChecks,checkWasFlight};
if(require.main===module){
  const rows=nodeChecks();
  for(const {name,ok,detail} of rows)console.log((ok?'✓ ':'✗ ')+name+(detail?' — '+detail:''));
  process.exitCode=Number(rows.some(({ok})=>!ok));
}
