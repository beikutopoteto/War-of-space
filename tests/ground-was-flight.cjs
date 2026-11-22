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
      originalDamage(t,n,f,...args);
      if(t===was&&f===vehicle&&hp>t.hpPool)hits.push({aa:f.groundAAResolving===t,scale:(hp-t.hpPool)/n});
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
      band('low').click();settle();
      const low=fire();
      const scale=groundRuleSet().combat.damageScale;
      const counts=hits=>({direct:hits.filter(h=>!h.aa).length,aa:hits.filter(h=>h.aa).length});
      record('敵の車両は巡航を直射と自動対空の両方で撃つ',walking.length>0&&walking.every(h=>!h.aa)&&cruising.some(h=>h.aa)&&cruising.some(h=>!h.aa)&&low.length>0&&low.every(h=>h.aa),JSON.stringify([walking,cruising,low].map(counts)));
      record('実被弾量は飛行中だけ0.7倍',walking.every(h=>close(h.scale,scale))&&cruising.length>0&&low.length>0&&[...cruising,...low].every(h=>close(h.scale,.7*scale)));
    }finally{damage=originalDamage;}

    vehicle.stance='evade';vehicle.groundHoldFire=true;
    toggle.click();settle();settle();
    const d=groundData(),cell=d.meta.cellKm;
    const i=d.terrain.cells.findIndex((t,i)=>{
      const x=(i%d.terrain.cols+.5)*cell,y=(Math.floor(i/d.terrain.cols)+.5)*cell,p=groundPoint(x,y);
      return t==='沼地'&&groundPass(x,y,'was')&&groundFactor(p.x,p.z,'was')===.6;
    });
    const swamp=groundPoint((i%d.terrain.cols+.5)*cell,(Math.floor(i/d.terrain.cols)+.5)*cell);
    const travel=()=>{
      was.pos.copy(swamp);
      const original=swamp.clone(),dest=original.clone().add(new THREE.Vector3(.8,0,0));
      order(was,{type:'move',dest});
      groundStep(.1);
      const distance=groundDistanceTo(was,{pos:original});
      groundClearOrders(was);
      return {distance,speed:was.speed};
    };
    const ground=travel();toggle.click();settle();
    const flight=travel(),sea=groundPoint(12,3);
    record('巡航速度は歩きの2倍。沼地で減速せず、海上へ経路を引ける',i>=0&&close(flight.speed,2*ground.speed)&&close(ground.distance,.1*.6*ground.speed)&&close(flight.distance,.1*flight.speed)&&!!groundPath(was.pos,sea,groundMoveKind(was)),JSON.stringify({ground,flight}));
    was.pos.copy(sea);groundHud();
    const waterNoLand=toggle.disabled&&!groundWasToggle(was);
    was.pos.copy(at);groundHud();toggle.click();
    was.pos.copy(sea);settle();
    record('水面への着陸拒否と降下中に地表を外れたときの巡航復帰',waterNoLand&&was.band==='cruise'&&!was.bandTo&&!was.groundWasLanding);
    return rows;
  });
  for(const {name,ok,detail} of rows)check(ok,'W.A.S. 飛行: '+name,detail);
}
module.exports={checkWasFlight};
