const {readFileSync}=require('node:fs');
const {createControlsContext}=require('./ground-controls.cjs');
const {formations}=require('./fixtures/was-formation.json');

function nodeChecks(){
  const {run}=createControlsContext();
  const loop=readFileSync(require.resolve('../battle/loop.js'),'utf8');
  run(loop.split('\n').find(line=>line.startsWith('const hash=')));
  const cases=run(`(() => {
    const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
    const close=(a,b)=>Math.abs(a-b)<1e-7;
    const fresh=(supply=false)=>{
      op={ground:'exercise2',groundHQ:supply?{0:'A'}:null};
      fleets=[];groundSites=[];groundBridges=[];groundBuildings=[];groundForests=[];
      groundFog=null;groundTerritory=null;groundSupplyNet=null;groundVisuals=new THREE.Group();
      groundHeight=groundSightHeight=()=>0;groundHeightCacheReset();groundSightReset();groundStrikeReset();
      groundPass=()=>true;groundSeenBy=groundPointSeenBy=()=>true;
      gameSec=0;over=false;engaged.clear();
    };
    const unit=(kind,team,x,z=0,platoons=1)=>{
      const f=makeFleet(team,{groundKind:kind,name:kind,type:'cv',n:1,scale:.3,pos:[x,z],groundPlatoons:platoons,stance:'evade'});
      fleets.push(f);groundInitUnit(f);f.groundDeployed=true;f.groundVisible=[true,true];
      f.heading.set(team?-1:1,0,0);
      return f;
    };
    const fire=(f,t,body=t.bodies[0])=>{
      const hp=body.hp;
      groundFireDirect(f,t,1/groundBodiesPerPlatoon(f),false,body);
      return hp-body.hp;
    };
    const tick=dt=>{gameSec+=dt;groundStep(dt);};

    fresh();
    const approved=${JSON.stringify(formations)};
    for(const p of [1,2,3,4]){
      const company=unit('was',0,0,0,p),layouts=groundLayouts(company);
      const points=approved[p];
      check(p+'小隊の矢印は歩行・待機・追撃・布陣・進撃で採用図どおり',
        company.bodies0===4*p&&['move','idle','chase','defend','advance'].every(state=>layouts[state].length===points.length&&
          layouts[state].every((b,i)=>close(b.x,-points[i].x*.012*GROUND_SCALE)&&close(b.z,-points[i].y*.012*GROUND_SCALE)&&
            points[i].lead===(i%2===0)&&points[i].platoon===Math.floor(i/4))));
    }

    fresh();
    const squad=unit('was',0,-2),testTank=unit('vehicle',1,0);
    const tanksHp=testTank.hpPool,rocket=groundDirectWeapon(squad,testTank);
    const expected=groundDamageAmount(testTank,rocket.power*groundFireFactor(squad,testTank),squad,null,rocket);
    check('1小隊4機で耐久170、各機の耐久は42.5',squad.bodies.length===4&&squad.hpPool===170&&squad.bodies.every(b=>b.hp===42.5&&b.max===42.5));
    for(const b of squad.bodies)b.shotT=0;
    groundBodyFire(squad,testTank,0);
    check('4機の全弾を合わせた直射は小隊1発ぶん',rocket.shaped&&squad.bodies.every(b=>b.groundRocket?.roundsLeft===2)&&close(tanksHp-testTank.hpPool,expected));

    fresh();
    const tank=unit('vehicle',0,-2),heavy=unit('heavyInfantry',0,-2),scout=unit('scout',0,-2);
    const was=unit('was',1,0,0,2),[first,second,third]=was.bodies;
    check('2小隊の最大耐久は340、装甲は正面400・側面200・上面150',was.groundMaxHp===340&&
      [tank,heavy].map(f=>groundDirectWeapon(f,was).plate).join(',')==='400,150'&&
      (tank.pos.set(0,0,2),groundDirectWeapon(tank,was).plate===200));
    tank.pos.set(-2,0,0);
    check('弱い弾では反応装甲を使わない',fire(scout,was)>0&&!first.groundWasArmorSpent);
    check('上面を狙う成形炸薬を1機につき1発止める',fire(heavy,was)===0&&first.groundWasArmorSpent&&fire(heavy,was)>0&&
      fire(heavy,was,second)===0&&second.groundWasArmorSpent);
    const reduced=fire(tank,was,third);
    check('戦車の強い弾は最初の1発だけ半減',third.groundWasArmorSpent&&reduced>0&&close(fire(tank,was,third),2*reduced));
    const attacker=unit('was',0,-2);
    check('shaped の成形炸薬も止める',groundDirectWeapon(attacker,was).shaped&&fire(attacker,was,was.bodies[3])===0&&was.bodies[3].groundWasArmorSpent);

    fresh();
    const launcher=unit('was',0,-2),armor=unit('vehicle',1,0);
    const infantry=unit('infantry',1,0),[early,late,...waiting]=launcher.bodies;
    for(const b of armor.bodies)b.hp=b.max=1000;
    groundBodySync(armor);
    early.shotT=.05;late.shotT=.525;for(const b of waiting)b.shotT=100;
    order(launcher,{type:'attack',target:armor});
    const shots=[],visual=groundVisualDirect;
    try{
      groundVisualDirect=(f,i,t,j,from,to,aa,w)=>{
        if(f===launcher)shots.push({i,time:gameSec,weapon:w});
      };
      for(let i=0;i<151;i++)tick(.05);
    }finally{groundVisualDirect=visual;}
    for(const [i,start] of [[0,.05],[1,.55]]){
      const fired=shots.filter(s=>s.i===i),rockets=fired.filter(s=>s.weapon.shaped);
      const volleys=[0,1,2,7];
      check('機体'+(i+1)+'のロケットは1秒おきに3発、3発目から5秒後に再開',
        rockets.length===volleys.length&&rockets.every((s,k)=>close(s.time,start+volleys[k])));
      const fallback=fired.filter(s=>!s.weapon.shaped&&s.weapon.fx!=='gatling');
      check('機体'+(i+1)+'は再装填中に1.5秒おきで88 mm 砲を撃ち、戦車正面へバルカンは撃たない',
        fallback.length===3&&fallback.every((s,k)=>s.weapon.power===8&&s.weapon.pen===900&&s.weapon.fireFactor===1.5&&close(s.time,start+3+k*1.5))&&
        fired.every(s=>s.weapon.fx!=='gatling'));
    }
    check('バルカンの1連射は0.8秒・16発で射撃間隔1秒に収まる',
      GFX.gatling.rounds===16&&GFX.gatling.burst===.8&&GFX.gatling.burst<groundRules().fireEvery);
    check('強化歩兵・コマンド歩兵・機械化突撃兵には主武装に88 mm 砲、並行してバルカン（威力3・軟目標倍率なし）を使う',
      launcher.weapons.find(w=>w.shaped).soft===.1&&
      [infantry,unit('commando',1,0),unit('mechanicalAssault',1,0)].every(t=>
        [['ground',-2],['cruise',-2],['cruise',-5]].every(([band,x])=>{
          launcher.band=band;launcher.pos.x=x;
          return [[-1,0],[0,1],[1,0]].every(([hx,hz])=>{
            t.heading.set(hx,0,hz);
            const p=groundParallelWeapons(launcher,t);
            return p.length===1&&p[0].fx==='gatling'&&p[0].power===3&&p[0].pen===280&&p[0].air&&!p[0].top&&
              launcher.bodies.every(b=>{
                const w=groundDirectWeapon(launcher,t,false,b);
                return w.power===8&&w.pen===900&&!w.shaped;
              });
          });
        })));

    fresh(true);
    const target=unit('was',0,-2),gun=unit('vehicle',1,0);
    const body=target.bodies[0];
    fire(gun,target);
    groundSupplyAfter(1);
    check('補給源がなければ反応装甲は戻らない',body.groundWasArmorSpent&&target.groundSupply===100);
    const truck=unit('supply',0,0);
    check('満タンでも補給部隊から反応装甲を戻せる',groundSupplyCommand([truck],target)&&
      (groundSupplyGive(1,new Map()),!body.groundWasArmorSpent&&target.groundSupply===98&&target.groundSupplySource?.unit===truck));
    fire(gun,target);
    truck.alive=false;
    groundSites=[{id:'A',x:groundMapX(target.pos.x),y:groundMapY(target.pos.z),pos:target.pos.clone(),owner:0,radiusKm:1}];
    target.groundSupply=40;
    groundSupplyAfter(2);
    check('本営では補給待ちの間は反応装甲が戻らない',body.groundWasArmorSpent&&target.groundSupply===40);
    groundSupplyAfter(1);
    check('本営で反応装甲が戻り、補給4点のうち2点を使う',!body.groundWasArmorSpent&&target.groundSupply===42&&target.groundSupplySource?.site===groundSites[0]);

    fresh();
    const moving=unit('was',0,-4),slow=unit('vehicle',1,0),fast=unit('mobileAA',1,0);
    moving.band='cruise';
    const hit=src=>groundDamageAmount(moving,10,src,null,null);
    const stopped=hit(slow);
    order(moving,{type:'move',dest:moving.pos.clone().add(new THREE.Vector3(0,0,8))});
    tick(.05);
    check('巡航の回避0.6が耐久への打撃に効く',groundRuleSet().wasFlight.evasion===.6&&close(stopped,4*groundRuleSet().combat.damageScale));
    check('回り込みの設定がなく、実際に横へ動いても被弾量は射手によらず同じ',
      !Object.hasOwn(groundRuleSet().wasCombat,'tracking')&&moving.pos.z>0&&close(hit(slow),stopped)&&close(hit(fast),stopped));

    fresh();
    rebuildGroundRuleSet();
    const blue=unit('was',0,-2,0,4),red=unit('was',1,1,.6,4);
    for(const f of [blue,red])f.band='cruise';
    order(blue,{type:'attack',target:red});order(red,{type:'attack',target:blue});
    const duelShots=[],directFire=groundFireDirect;
    try{
      groundFireDirect=(f,t,share,aa,body,weapon)=>{
        duelShots.push({f,t,aa,body,weapon,time:gameSec});
        return directFire(f,t,share,aa,body,weapon);
      };
      for(let i=0;i<60;i++)tick(.05);
    }finally{groundFireDirect=directFire;}
    const centers=[blue,red].map(f=>f.groundWasFlight.dogfight);
    const midpoint=blue.pos.clone().lerp(red.pos,.5),radius=groundRuleSet().wasCombat.swarmLayout.maxSpanKm*GROUND_SCALE/2;
    check('相互に攻撃を命じた停止巡航は共通の中点・半径1 kmで巴戦する',
      centers.every((d,i)=>d?.target===[red,blue][i]&&close(d.x,midpoint.x)&&close(d.z,midpoint.z))&&
      [blue,red].every(f=>groundBodyPositions(f).positions.every(p=>Math.hypot(p.x-midpoint.x,p.z-midpoint.z)<=radius+1e-7)));
    check('両軍とも前衛3組・中衛3組・後衛2組が相手の同じ役割を受け持つ',
      centers.every(d=>d?.pairs.map(p=>p.role).join(',')==='0,0,0,1,1,1,2,2'&&d.pairs.every((p,i)=>p.pairs[0]===i)));
    const part=groundBodyTarget(blue,0,red,groundTargetRange(blue,red));
    check('巴戦の射線には各機の位置と向きを使う',
      !!part&&part.from.equals(groundBodyPositions(blue).positions[0])&&
      part.pos.equals(groundBodyPositions(red).positions[part.j])&&close(part.targetYaw,red.groundWasFlight.bodies[part.j].yaw));
    if(part)part.b.alive=false;
    const next=groundBodyTarget(blue,0,red,groundTargetRange(blue,red));
    check('撃墜された機を外し、生存機へ射線を切り替える',!!next&&next.b!==part?.b&&next.b.alive);
    check('巡航同士はバルカンを主に88 mm砲を併射し、対空との二重発射やロケットはない',
      [blue,red].every(f=>{
        const shots=duelShots.filter(s=>s.f===f);
        return shots.some(s=>s.weapon.wasCannon)&&shots.filter(s=>s.weapon.fx==='gatling').length>shots.filter(s=>s.weapon.wasCannon).length&&
          shots.every(s=>!s.aa&&!s.weapon.shaped&&(s.weapon.air||s.weapon.wasCannon))&&f.bodies.every(b=>!b.groundRocket);
      }));
    const evaluated=groundParallelWeapons(blue,red,false,part)[0];
    const normal={...evaluated,wasCannon:false};
    const hitWith=(source,weapon)=>groundDamageAmount(red,10,source,null,weapon);
    const walkingBlue={...blue,band:'ground'};
    const normalHit=hitWith(walkingBlue,normal);
    const duelHit=hitWith(blue,normal);
    check('88 mm砲は巴戦では回避なしを優先し、地上から撃つと飛行回避0.6を上限0.9に上げる',
      duelHit>0&&close(hitWith(blue,evaluated),duelHit)&&normalHit>0&&close(hitWith(walkingBlue,evaluated),normalHit*.25));
    if(part)part.b.alive=true;
    let low=0,total=0,peak=0,slides=false,passes=false;
    let paired=false,split=false;
    for(let k=0;k<100;k++){
      tick(.05);
      const flight=blue.groundWasFlight;
      for(const b of flight.bodies){
        const height=b.pos.y/GROUND_SCALE;
        if(height>=.03-1e-8&&height<=.08)low++;
        peak=Math.max(peak,height);
        total++;
        if(b.slideBoost>.5)slides=true;
        if(b.passTarget!=null)passes=true;
      }
      const gap=flight.bodies[0].pos.distanceTo(flight.bodies[1].pos)/GROUND_SCALE;
      if(gap<.11)paired=true;
      if(gap>.22)split=true;
    }
    check('巴戦は主に30〜80 mを飛び、時々跳び上がる',low/total>.5&&peak>.13&&peak<=.2+1e-8);
    check('各機の横滑りと射撃通過があり、組の間隔が並走と分離で変わる',slides&&passes&&paired&&split);

    groundFxReset();
    const survivors=blue.bodies.filter(b=>b.alive);
    const [fell,sibling]=survivors,otherHp=sibling.hp,fellIndex=blue.bodies.indexOf(fell);
    groundBodyHit(blue,fell,fell.hp);
    const wreck=groundFxQueues.wreck[0],wreckCfg=groundRuleSet().wasCombat.dogfight.wreck;
    check('巡航の撃墜で機体は直ちに射撃・標的から外れ、別枠で2〜3秒の墜落を描く',
      !fell.alive&&sibling.hp===otherHp&&groundAliveBodies(blue)===survivors.length-1&&
      groundBodyTarget(red,0,blue,groundTargetRange(red,blue))?.j!==fellIndex&&
      wreck?.life>=2+wreckCfg.smokeSec&&wreck.life<=3+wreckCfg.smokeSec&&!groundFxQueues.direct.length);

    fresh();
    const lowBlue=unit('was',0,-3,0,4),lowRed=unit('was',1,3,0,4),lowUnits=[lowBlue,lowRed];
    for(const f of lowUnits)f.band='low';
    order(lowBlue,{type:'attack',target:lowRed});order(lowRed,{type:'attack',target:lowBlue});
    const lowShots=[],lowBand=groundBandHeight('low'),lowMiddle=lowBlue.pos.clone().lerp(lowRed.pos,.5);
    const heights=lowUnits.map(f=>f.bodies.map(()=>({min:Infinity,max:-Infinity})));
    const crossed=lowUnits.map(()=>false),passed=lowUnits.map(()=>false);
    let maxHeight=0,maxRadius=0,enteredAt=Infinity,staggered=false,splitHeight=false,turned=false;
    try{
      groundFireDirect=(f,t,share,aa,body,weapon)=>{
        lowShots.push({f,t,aa,weapon,time:gameSec});
        return directFire(f,t,share,aa,body,weapon);
      };
      for(let step=0;step<200;step++){
        tick(.05);
        if(!lowUnits.every(f=>f.groundWasFlight?.dogfight?.low))continue;
        let radius=0;
        lowUnits.forEach((f,k)=>{
          const {bodies}=f.groundWasFlight;
          for(const [i,b] of bodies.entries()){
            if(!f.bodies[i].alive)continue;
            const p=groundBodyPosition(f,i),h=(p.y-lowBand)/GROUND_SCALE,span=heights[k][i];
            maxHeight=Math.max(maxHeight,Math.abs(h));
            radius=Math.max(radius,Math.hypot(p.x-lowMiddle.x,p.z-lowMiddle.z)/GROUND_SCALE);
            span.min=Math.min(span.min,h);span.max=Math.max(span.max,h);
            passed[k]||=b.passFiring;
            if(i===0)crossed[k]||=(k?-1:1)*(p.x-lowMiddle.x)>.45*GROUND_SCALE;
            if(i%2===0&&f.bodies[i+1].alive){
              const wing=bodies[i+1];
              staggered||=b.slideBoost>.5&&wing.slideBoost===0;
              splitHeight||=Math.abs(p.y-wing.pos.y)>.6*GROUND_SCALE;
            }
            turned||=b.pitch< -1;
          }
        });
        if(radius<=1.5+1e-8)enteredAt=Math.min(enteredAt,gameSec);
        if(Number.isFinite(enteredAt))maxRadius=Math.max(maxRadius,radius);
      }
    }finally{groundFireDirect=directFire;}
    check('低高度の相互攻撃は10秒以内に双方がバルカンを撃ち、対空との二重発射がない',
      lowUnits.every((f,k)=>f.order?.target===lowUnits[1-k]&&lowShots.some(s=>s.f===f&&s.t===f.order.target&&s.time<=10+1e-8))&&
      lowShots.every(s=>!s.aa&&s.weapon.fx==='gatling'));
    const minExcursion=Math.min(...heights.flat().map(s=>s.max-s.min));
    check('低高度の巴戦は各機が高さの差600 m以上を使い、段の上下1 km・直径3 kmに収まる（最大高度差 '+
      maxHeight.toFixed(2)+' km、最大半径 '+maxRadius.toFixed(2)+' km、最小上下幅 '+minExcursion.toFixed(2)+' km）',
      maxHeight<=1+1e-8&&enteredAt<=1&&maxRadius<=1.5+1e-8&&minExcursion>=.6);
    check('低高度の巴戦は双方が射撃通過し、組の上下分離・機ごとの横滑り・上昇反転がある',
      crossed.every(Boolean)&&passed.every(Boolean)&&splitHeight&&staggered&&turned);
    groundFxReset();
    const lowFell=lowBlue.bodies.find(b=>b.alive),lowWreckCfg=groundRuleSet().wasCombat.dogfight.low.wreck;
    groundBodyHit(lowBlue,lowFell,lowFell.hp);
    const lowWreck=groundFxQueues.wreck[0];
    const fallSec=lowWreck?.life-lowWreckCfg.smokeSec;
    check('低高度の撃墜機は別枠で5〜7秒の墜落を描く',!lowFell.alive&&fallSec>=5&&fallSec<=7);

    fresh();
    const leadFlight=unit('was',0,0),enemyFlight=unit('was',1,2),aa=unit('mobileAA',1,0);
    leadFlight.band=enemyFlight.band='cruise';
    const airLoss=groundDamageAmount(enemyFlight,10,leadFlight,null,null);
    const aaLoss=groundDamageAmount(enemyFlight,10,aa,null,null);
    const againstAA=groundDamageAmount(aa,10,leadFlight,null,null);
    leadFlight.band='ground';
    const walkingLoss=groundDamageAmount(enemyFlight,10,leadFlight,null,null);
    const walkingAgainstAA=groundDamageAmount(aa,10,leadFlight,null,null);
    leadFlight.band='low';
    const unscaledLoss=10*groundRuleSet().combat.damageScale;
    check('飛行中のW.A.S.同士は倍率1・回避なし、歩行中のW.A.S.と自走対空砲の射撃は通常どおり',
      close(airLoss,unscaledLoss)&&close(walkingLoss,unscaledLoss*.4)&&close(aaLoss,walkingLoss)&&
      close(groundDamageAmount(enemyFlight,10,leadFlight,null,null),airLoss)&&close(againstAA,walkingAgainstAA));

    leadFlight.band='cruise';
    const place=(f,xs)=>{
      const track=f.groundWasFlight=groundWasFlightTrack(f);
      track.bodies.forEach((b,i)=>b.pos.set(xs[i],1,0));
      f.groundBodyGeometry=null;
    };
    place(leadFlight,[0,6,8,8.5]);
    place(enemyFlight,[5,2,9,10]);
    const aim=(i,range=12)=>groundBodyTarget(leadFlight,i,enemyFlight,range);
    const wingAim=aim(1),leadAim=aim(0),otherAim=aim(2);
    const wingOutOfRange=!aim(1,3)&&aim(0,3)?.j===1;
    place(enemyFlight,[1,3,9,10]);
    const stayedOnTarget=aim(0)?.j===1&&aim(1)?.j===1;
    enemyFlight.bodies[1].alive=false;
    check('組は長機に最も近い1機を共有し、各機の射程を守り、撃墜後は次の生存機を狙う',
      leadAim?.j===1&&wingAim?.j===1&&wingAim.from.x===6&&otherAim?.j===2&&wingOutOfRange&&
      stayedOnTarget&&aim(0)?.j===0&&aim(1)?.j===0);

    fresh();
    const airWas=unit('was',0,-1),walkWas=unit('was',1,1);
    airWas.band='cruise';
    order(airWas,{type:'attack',target:walkWas});order(walkWas,{type:'attack',target:airWas});
    const mixedShots=[];
    try{
      groundFireDirect=(f,t,share,aa,body,weapon)=>{
        mixedShots.push({f,aa,weapon});
        return directFire(f,t,share,aa,body,weapon);
      };
      for(let i=0;i<60;i++)tick(.05);
    }finally{groundFireDirect=directFire;}
    check('歩く側はバルカンで対空、巡航側は飛び交いからロケットと上面150を抜くバルカンを撃つ',
      walkWas.band==='ground'&&airWas.groundWasFlight.swarm===walkWas&&!airWas.groundWasFlight.dogfight&&
      mixedShots.some(s=>s.f===walkWas)&&mixedShots.filter(s=>s.f===walkWas).every(s=>s.aa&&s.weapon.fx==='gatling')&&
      mixedShots.some(s=>s.f===airWas&&s.weapon.shaped)&&
      mixedShots.some(s=>s.f===airWas&&s.weapon.fx==='gatling'&&s.weapon.plate===150&&s.weapon.pen>s.weapon.plate));

    fresh();
    const cruiseTarget=unit('was',0,-3),aaGun=unit('mobileAA',1,0);
    for(const b of cruiseTarget.bodies)b.hp=b.max=1000;
    groundBodySync(cruiseTarget);
    cruiseTarget.band='cruise';aaGun.stance='engage';
    const aaWeapon=groundDirectWeapon(aaGun,cruiseTarget,true);
    const groundWeapon=groundDirectWeapon(aaGun,{...cruiseTarget,band:'ground'},false);
    const aaSpec=groundRuleSet().unitTypes.mobileAA;
    const sharedWeapon=w=>w.power===8&&w.pen===220&&w.morale===.4&&w.fireFactor===.2&&w.burst===1.5&&w.air&&!w.airOnly&&w.evasionFactor===.15&&w.barrels===2;
    check('自走対空砲の武器は35 mm 連装機関砲1つで空・地上共通（カメラ照準の回避軽減あり）',
      aaSpec.weapons.length===1&&aaSpec.directMorale===.08&&aaSpec.armor.top===150&&
      aaGun.groundMaxHp===180&&aaGun.bodies.length===3&&aaGun.bodies.every(b=>b.max===60)&&
      groundFireRanges(aaGun).direct===2*GROUND_SCALE&&groundAARange(aaGun)===6*GROUND_SCALE&&
      sharedWeapon(aaWeapon)&&sharedWeapon(groundWeapon)&&aaWeapon.plate===200&&groundWeapon.plate===400);
    const aaShots=[],origFire=groundFireDirect;
    try{
      groundFireDirect=(f,t,share,aa=false,body=null,w=groundDirectWeapon(f,t,aa))=>{
        if(f===aaGun&&t===cruiseTarget)aaShots.push({aa,weapon:w});
        return origFire(f,t,share,aa,body,w);
      };
      for(const b of aaGun.bodies){b.shotT=0;b.aaT=0;}
      const hpBeforeAA=cruiseTarget.hpPool;
      tick(.05);
      const expectedAA=aaWeapon.power*aaWeapon.armorFactor*groundRuleSet().combat.damageScale*(1-groundRuleSet().wasFlight.evasion*aaWeapon.evasionFactor);
      check('巡航 W.A.S. へ自走対空砲は二重発射せず対空武器だけで撃ち、カメラ照準で回避を下げ反応装甲は貫通不足で消費しない',
        aaShots.length===aaGun.bodies0&&aaShots.every(s=>s.aa&&s.weapon.air)&&!aaGun.fireTarget&&aaGun.groundAATarget===cruiseTarget&&
        close(hpBeforeAA-cruiseTarget.hpPool,expectedAA)&&cruiseTarget.bodies.every(b=>!b.groundWasArmorSpent));
      const highPen={...aaWeapon,pen:400,armorFactor:1};
      const reactiveHit=groundDamageAmount(cruiseTarget,10,aaGun,null,highPen,cruiseTarget.bodies[0]);
      check('対空武器でも貫通が装甲の2倍以上なら W.A.S. の反応装甲が効く',
        cruiseTarget.bodies[0].groundWasArmorSpent&&close(reactiveHit,10*groundRuleSet().combat.damageScale*(1-groundRuleSet().wasFlight.evasion*aaWeapon.evasionFactor)*.5));
      cruiseTarget.band='ground';aaShots.length=0;
      for(const b of aaGun.bodies){b.shotT=0;b.aaT=0;}
      tick(.05);
      check('歩行 W.A.S. へ自走対空砲は同じ機関砲で直射だけ撃つ',
        aaShots.length===aaGun.bodies0&&aaShots.every(s=>!s.aa&&s.weapon.air&&s.weapon.power===aaWeapon.power&&s.weapon.plate===400)&&aaGun.fireTarget===cruiseTarget&&!aaGun.groundAATarget);
      // 戦車など air:true の武器を持たない兵科は巡航 W.A.S. へ射程内で直射の主砲だけを撃ち、弱い対空との二重発射もしない。
      const tankGun=unit('vehicle',1,0);tankGun.stance='engage';
      aaGun.alive=false;cruiseTarget.band='cruise';cruiseTarget.pos.x=-2;
      const tankShots=[];
      groundFireDirect=(f,t,share,aa=false,body=null,w=groundDirectWeapon(f,t,aa))=>{
        if(f===tankGun&&t===cruiseTarget)tankShots.push({aa,weapon:w});
        return origFire(f,t,share,aa,body,w);
      };
      for(const b of tankGun.bodies){b.shotT=0;b.aaT=0;}
      tick(.05);
      check('戦車など air:true の武器を持たない兵科は巡航 W.A.S. へ直射の主砲だけを撃つ',
        tankShots.length===tankGun.bodies0&&tankShots.every(s=>!s.aa&&s.weapon.pen===1800)&&tankGun.fireTarget===cruiseTarget&&!tankGun.groundAATarget);
    }finally{groundFireDirect=origFire;}

    fresh();
    const swarm=unit('was',0,-3,0,4),objective=unit('vehicle',1,0);
    swarm.band='cruise';swarm.pos.y=groundUnitHeight(swarm);
    for(const b of objective.bodies)b.hp=b.max=10000;
    groundBodySync(objective);
    const data=swarm.groundModel.userData,models=data.formation.bodies;
    const drawFrames=count=>{for(let j=0;j<count;j++){tick(.05);groundFormationDraw(swarm,gameSec);}};
    const modelPoints=()=>models.map(b=>b.position.clone().applyAxisAngle(new THREE.Vector3(0,1,0),
      Math.atan2(swarm.heading.x,swarm.heading.z)).add(swarm.pos).add(new THREE.Vector3(0,GROUND_BODY_LIFT,0)));
    drawFrames(40);
    order(swarm,{type:'move',dest:swarm.pos.clone().add(new THREE.Vector3(1,0,0))});
    drawFrames(2);
    const center=swarm.pos.clone();
    order(swarm,{type:'attack',target:objective});
    let beforeSwarm;
    for(let j=0;j<80&&!data.wasSwarming;j++){
      beforeSwarm=modelPoints();
      tick(.01);groundFormationDraw(swarm,gameSec);
    }
    check('移動から交戦へ切り替わった瞬間も各機の位置が飛ばない',data.wasSwarming&&
      modelPoints().every((p,i)=>p.distanceTo(beforeSwarm[i])<.06));
    drawFrames(14);
    const entering=modelPoints(),exits=entering.map((p,i)=>p.distanceTo(beforeSwarm[i])/GROUND_SCALE);
    check('交戦へ移る途中は機体ごとに異なる距離を進み、矢印が崩れる',
      Math.max(...exits)-Math.min(...exits)>.2&&entering.some((p,i)=>i%2===0&&p.distanceTo(entering[i+1])>2*beforeSwarm[i].distanceTo(beforeSwarm[i+1])));
    drawFrames(31);
    const firstFrame=modelPoints();
    drawFrames(10);
    const secondFrame=modelPoints();
    const {swarmPattern,swarmLayout,swarmManeuvers}=groundRuleSet().wasCombat;
    check('停止巡航の既定は全機周回、見本の直径2 km',swarmPattern==='all'&&swarmLayout.maxSpanKm===2&&
      ['frontRadiusKm','middleKm','rearKm','allMiddleRadiusKm','allRearRadiusKm'].every((key,i)=>
        close(swarmLayout[key],[.2,.3,.45,.27,.35][i]*2/.7)));
    const frontReach=swarmLayout.frontRadiusKm*swarmManeuvers.front.outerScale*GROUND_SCALE;
    check('停止巡航の16機は中隊の中心を保ち、射撃・被弾の位置は描画どおり敵のまわりを動く',
      swarm.fireTarget===objective&&swarm.pos.equals(center)&&secondFrame.every((p,i)=>p.distanceTo(groundBodyPosition(swarm,i))<1e-7)&&
      secondFrame.every((p,i)=>p.distanceTo(firstFrame[i])>.01)&&secondFrame.slice(0,6).every(p=>Math.hypot(p.x,p.z)<=frontReach+.001));
    const orbitFrames=[secondFrame],orbitPairs=[],orbitMoves=[];
    const swarmTargets=groundLayouts(swarm).idle,swarmRules=groundRuleSet().wasCombat;
    for(let i=0;i<130;i++){
      drawFrames(4);
      const frame=modelPoints();
      orbitFrames.push(frame);
      const fwd=Math.atan2(objective.pos.x-swarm.pos.x,objective.pos.z-swarm.pos.z);
      const pairs=[];
      for(let pair=0;pair<frame.length/2;pair++){
        const a=frame[2*pair],b=frame[2*pair+1];
        pairs.push({d:a.distanceTo(b)/GROUND_SCALE,rel:groundWrap(Math.atan2(b.x-a.x,b.z-a.z)-Math.atan2(a.x-objective.pos.x,a.z-objective.pos.z))});
        const state=groundWasSwarmPair(swarm,objective,swarmTargets,2*pair,gameSec,fwd,swarmRules);
        orbitMoves.push([state[0].maneuver,state[1].maneuver]);
      }
      orbitPairs.push(pairs);
    }
    check('中衛・後衛も敵の両側へ回り込む',
      [6,8,10,12,14].every(i=>orbitFrames.some(frame=>frame[i].x>0)&&orbitFrames.some(frame=>frame[i].x<0)));
    const allPairDists=orbitPairs.flat().map(p=>p.d);
    const pairAvg=allPairDists.reduce((s,v)=>s+v,0)/allPairDists.length;
    const pairSpreads=Array.from({length:8},(_,pair)=>{
      const ds=orbitPairs.map(r=>r[pair].d);
      return Math.max(...ds)-Math.min(...ds);
    });
    const relDispersion=Array.from({length:8},(_,pair)=>{
      const rs=orbitPairs.map(r=>r[pair].rel);
      const cx=rs.reduce((s,a)=>s+Math.cos(a),0)/rs.length,cz=rs.reduce((s,a)=>s+Math.sin(a),0)/rs.length;
      return 1-Math.hypot(cx,cz);
    });
    const sameMoveRate=orbitMoves.filter(([a,b])=>a===b).length/orbitMoves.length;
    const minHeightKm=Math.min(...orbitFrames.flat().map(p=>p.y))/GROUND_SCALE;
    const maxHeightKm=Math.max(...orbitFrames.flat().map(p=>p.y))/GROUND_SCALE;
    check('僚機は50 m〜数百 mで伸縮・周回し別技を行い、全機の水平距離は直径 約2 km・高さ20〜170 m以内',
      Math.min(...allPairDists)>=.05&&Math.max(...allPairDists)<=.85&&pairAvg>=.12&&pairAvg<=.45&&
      pairSpreads.every(s=>s>=.15)&&relDispersion.every(d=>d>=.35)&&sameMoveRate<.35&&
      minHeightKm>=swarmManeuvers.minHeightKm-.001&&maxHeightKm<=swarmManeuvers.maxHeightKm+.001&&
      orbitFrames.every(frame=>frame.every((p,i)=>frame.every((q,j)=>i===j||
        Math.hypot(p.x-q.x,p.z-q.z)<=2*GROUND_SCALE+.001&&p.distanceTo(q)>=.045*GROUND_SCALE))));
    const incoming=modelPoints(),transitionDt=.001;
    tick(transitionDt);groundFormationDraw(swarm,gameSec);
    const beforeMove=modelPoints();
    order(swarm,{type:'move',dest:swarm.pos.clone().add(new THREE.Vector3(-60,0,0))});
    tick(transitionDt);groundFormationDraw(swarm,gameSec);
    check('交戦から移動へ切り替わった瞬間も各機が速度を引き継ぐ',swarm.pos.x<center.x&&!data.wasSwarming&&
      modelPoints().every((p,i)=>p.sub(beforeMove[i]).distanceTo(beforeMove[i].clone().sub(incoming[i]))<.003));
    const layout=groundLayouts(swarm).idle,spacing=groundWasCruiseSpacing(),bodyLen=groundBodyDims(swarm.groundBodySpec).len;
    const isArrow=()=>{
      const offsets=models.map((b,i)=>b.position.clone().sub(new THREE.Vector3(layout[i].x*spacing,0,layout[i].z*spacing)));
      const center=offsets.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(offsets.length);
      const span=Math.max(...models.flatMap(a=>models.map(b=>Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z))))/GROUND_SCALE;
      return span<=1.23&&offsets.every(p=>Math.hypot(p.x-center.x,p.z-center.z)<bodyLen*1.7);
    };
    drawFrames(20);
    const stillRejoining=!isArrow();
    drawFrames(60);
    check('巡航移動の間隔は0.36（採用）で、交戦からの移動では陣形が崩れたまま飛び出し数秒後に矢印へまとまる',
      close(spacing,.36)&&stillRejoining&&isArrow()&&swarm.order?.type==='move'&&!swarm.fireTarget);

    const shotFixtureId=fid;
    const distributedShots=draw=>{
      fresh();fid=shotFixtureId;
      const was=unit('was',0,-3,0,4),tank=unit('vehicle',1,0,0,4);
      was.band='cruise';was.pos.y=groundUnitHeight(was);
      order(was,{type:'attack',target:tank});
      for(const b of [...was.bodies,...tank.bodies]){b.shotT=100;b.parallelT=100;}
      if(!draw)was.groundModel=null;
      for(let i=0;i<60;i++){
        tick(.05);
        if(draw)groundFormationDraw(was,gameSec);
      }
      tank.stance='engage';
      const fire=(f,t)=>{
        const before=t.bodies.map(b=>b.hp),shots=[];
        const visual=groundVisualDirect;
        groundVisualDirect=(src,i,target,j,from,to)=>{shots.push({i,j,from:from.toArray(),to:to.toArray()});};
        try{
          for(const b of f.bodies)b.shotT=0;
          groundBodyFire(f,t,0);
        }finally{groundVisualDirect=visual;}
        return {shots,damaged:t.bodies.flatMap((b,i)=>b.hp<before[i]?[i]:[])};
      };
      return {inbound:fire(tank,was),outbound:fire(was,tank)};
    };
    const drawn=distributedShots(true),undrawn=distributedShots(false);
    check('巡航 W.A.S. を撃つと複数機に被弾がばらける',undrawn.inbound.damaged.length>1&&
      new Set(undrawn.inbound.shots.map(s=>s.j)).size>1);
    check('巡航 W.A.S. は複数の機が別々の敵を狙い、実際にダメージを与える',undrawn.outbound.damaged.length>1&&
      new Set(undrawn.outbound.shots.map(s=>s.i)).size>1&&new Set(undrawn.outbound.shots.map(s=>s.j)).size>1);
    check('陣形を毎回描いてもモデルなしでも同じ各機を狙い、被弾は一致する',JSON.stringify(drawn)===JSON.stringify(undrawn));

    fresh();
    const flying=unit('was',0,-4),armored=unit('vehicle',1,0);
    flying.band='cruise';flying.pos.y=groundUnitHeight(flying);
    const other=unit('fighter',1,0,3);
    other.band='low';
    check('戦闘機の射撃・被弾は各機の飛行位置を使う',
      new Set(other.bodies.map((_,i)=>groundBodyPosition(other,i).toArray().join(','))).size===4&&
      other.bodies.every((_,i)=>groundBodyPosition(other,i).equals(groundAirSquadTrack(other).bodies[i].pos)));
    groundWasFlightStep(flying,0);
    const from=flying.groundWasFlight.bodies[0].pos;
    const ground=groundBodyPosition(armored,0);
    from.set(ground.x-2,ground.y+.8,ground.z);
    const oldLine=groundClearLine,rays=[];
    try{
      groundClearLine=(a,b)=>{rays.push([a,b]);return a.y>ground.y+.6;};
      const hit=groundBodyTarget(flying,0,armored,2.1);
      check('各機の水平距離を射程に、高度を射線に使い、同じ射線は再利用する',
        !!hit&&groundBodyTarget(flying,0,armored,2.1)===hit&&rays.length===1&&rays[0][0].equals(from)&&
        !groundBodyTarget(flying,0,armored,1.9));
      check('巡航の上面・正面・側面装甲は機体の高度と標的の向きで選ぶ',
        groundDirectWeapon(flying,armored,false,flying.bodies[0],hit).plate===150&&
        groundWeaponContext(flying,armored,false,{...hit,from:new THREE.Vector3(hit.pos.x-2,hit.pos.y,hit.pos.z),targetYaw:-Math.PI/2}).front&&
        !groundWeaponContext(flying,armored,false,{...hit,from:new THREE.Vector3(hit.pos.x-2,hit.pos.y,hit.pos.z),targetYaw:0}).front&&
        !groundWeaponContext(flying,armored,false,{...hit,from:new THREE.Vector3(hit.pos.x-2,hit.pos.y,hit.pos.z)}).fromAbove);
    }finally{groundClearLine=oldLine;}

    fresh();
    const top=unit('was',0,-4),plate=unit('vehicle',1,0);
    top.band='cruise';
    const inRange=groundDirectWeapon(top,plate);
    top.pos.x-=.01;
    const outOfRange=groundDirectWeapon(top,plate);
    top.pos.x=-4;top.band='ground';
    check('巡航中だけ1km以内で上面装甲を使う',inRange.plate===150&&outOfRange.plate===2200&&
      groundDirectWeapon(top,plate).plate===2200&&inRange.armorFactor>outOfRange.armorFactor);

    top.band='cruise';
    check('上面を狙う全機が発射可能なら主武装にロケットを優先する',
      top.bodies.every(b=>groundDirectWeapon(top,plate,false,b).rounds===3));
    for(const b of top.bodies){b.shotT=0;b.parallelT=0;b.groundRocket={roundsLeft:0,readyAt:5};}
    const topWeapons=top.bodies.map(b=>groundDirectWeapon(top,plate,false,b));
    check('戦車の正面・側面には歩行中も上面攻撃の範囲外の巡航中も再装填中は全機が88 mm 砲を選び、バルカンは撃たない',
      [['ground',-4],['cruise',-4.01]].every(([band,x])=>{
        top.band=band;top.pos.x=x;
        return [[-1,0,1800],[0,1,500]].every(([hx,hz,armor])=>{
          plate.heading.set(hx,0,hz);
          return groundParallelWeapons(top,plate).length===0&&top.bodies.every(b=>{
            const w=groundDirectWeapon(top,plate,false,b);
            return w.power===8&&w.pen===900&&w.plate===armor;
          });
        });
      }));
    top.band='cruise';top.pos.x=-2;top.pos.y=groundUnitHeight(top);
    const topParallel=groundParallelWeapons(top,plate);
    const hpBeforeTop=plate.hpPool;
    const expectedTopLoss=topWeapons.reduce((sum,w)=>sum+groundDamageAmount(plate,
      w.power*groundFireFactor(top,plate)/groundBodiesPerPlatoon(top),top,null,w),0)+
      top.bodies.length*groundDamageAmount(plate,topParallel[0].power*groundFireFactor(top,plate)/groundBodiesPerPlatoon(top),top,null,topParallel[0]);
    groundFxReset();
    groundBodyFire(top,plate,0);
    check('戦車の上面150へ全機が88 mm 砲と30 mm バルカンを同時に撃ち、全機がバルカン連射を描く',
      topWeapons.every(w=>w.pen===900&&w.power===8&&w.plate===150)&&
      topParallel.length===1&&topParallel[0].pen===280&&topParallel[0].power===3&&topParallel[0].plate===150&&
      close(topParallel[0].armorFactor,groundArmorFactor(150,280,groundRuleSet().combat.penetration))&&
      topParallel[0].armorFactor>.9&&close(hpBeforeTop-plate.hpPool,expectedTopLoss)&&
      groundGatlingBursts.length===4&&groundGatlingBursts.every(b=>b.guns?.length===2));
    check('重強化歩兵や軽車両などにはどの向きでも再装填中は88 mm 砲と30 mm バルカンを同時に使う',
      ['heavyInfantry','scout','engineer','apc','supply','artillery','guidedRocket','mobileAA','was'].every(kind=>{
        const t=unit(kind,1,0);
        return [['ground',-4],['cruise',-4]].every(([band,x])=>{
          top.band=band;top.pos.x=x;
          return [[-1,0],[0,1],[1,0]].every(([hx,hz])=>{
            t.heading.set(hx,0,hz);
            const p=groundParallelWeapons(top,t);
            return p.length===1&&p[0].pen===280&&p[0].power===3&&
              top.bodies.every(b=>groundDirectWeapon(top,t,false,b).pen===900);
          });
        });
      }));
    // 巡航の上面攻撃では、ロケット発射中も88 mm 砲の合間もバルカンが止まらず独自間隔で撃ち続ける。
    fresh();
    const twin=unit('was',0,-3),topTank=unit('vehicle',1,0);
    twin.band='cruise';twin.pos.y=groundUnitHeight(twin);
    for(const b of topTank.bodies)b.hp=b.max=10000;
    groundBodySync(topTank);
    twin.bodies[0].shotT=.05;twin.bodies[0].parallelT=.225;
    for(const b of twin.bodies.slice(1)){b.shotT=100;b.parallelT=100;}
    order(twin,{type:'attack',target:topTank});
    const twinShots=[],origVis=groundVisualDirect;
    try{
      groundVisualDirect=(f,i,t,j,from,to,aa,w)=>{if(f===twin&&i===0)twinShots.push({time:gameSec,weapon:w});};
      for(let i=0;i<145;i++)tick(.05);
    }finally{groundVisualDirect=origVis;}
    const twinRockets=twinShots.filter(s=>s.weapon.shaped),twinCannons=twinShots.filter(s=>s.weapon.pen===900),twinVulcans=twinShots.filter(s=>s.weapon.fx==='gatling');
    check('ロケットと88 mm 砲を撃つ間も、バルカンは独自の間隔（1秒ごと）で止まらず同時に撃ち続ける',
      twinRockets.length===4&&twinCannons.length===3&&twinVulcans.length===8&&
      twinVulcans.every((s,k)=>close(s.time,.25+k)));

    fresh();
    const visualWas=unit('was',0,-2),visualTank=unit('vehicle',1,0,1);
    const visualModel=visualWas.groundModel,visualBody=visualModel.userData.formation.bodies[0];
    const rocketFx=groundDirectWeapon(visualWas,visualTank),makeShot=GFX.shot;
    let projectile;
    GFX.shot=(path,duration,kind)=>{projectile={origin:path(0),duration,kind};};
    try{
      for(const [band,pose] of [['ground','wasFire'],['cruise','wasFlyFire']]){
        visualWas.band=band;visualWas.fireTarget=visualTank;visualWas.pos.y=groundUnitHeight(visualWas);
        gameSec++;groundWasFlightStep(visualWas,1);groundFormationDraw(visualWas,gameSec);
        const from=groundBodyPosition(visualWas,0),to=groundBodyPosition(visualTank,0);
        const heading=Math.atan2(visualWas.heading.x,visualWas.heading.z);
        visualModel.position.copy(visualWas.pos);visualModel.position.y+=GROUND_BODY_LIFT;
        visualModel.rotation.y=heading;
        visualBody.geometry=visualModel.userData.special.get(pose);
        if(band==='ground')visualBody.rotation.y=Math.atan2(to.x-from.x,to.z-from.z)-heading;
        visualModel.updateMatrixWorld(true);
        const expectedMuzzle=visualBody.localToWorld(new THREE.Vector3().fromArray(visualBody.geometry.userData.guns[0]));
        groundFxReset();projectile=null;
        groundVisualDirect(visualWas,0,visualTank,0,from,to,false,rocketFx);
        const flight=groundFxQueues.rocket[0];
        flight?.create();
        check('対艦ロケットは右前腕の銃口から煙を引く（'+band+'）',
          visualModel.userData.wasSwarming===(band==='cruise')&&projectile?.kind==='rocket'&&
          projectile.origin.distanceTo(expectedMuzzle)<1e-7&&flight.life>projectile.duration);
      }
      // 30 mm バルカン連射は1発ごとに機体の現在位置・姿勢（quaternion）から発射し、撃破や非表示で残りを止める。
      const gatlingOrigins=[],origMuzzle=GFX.muzzle;
      GFX.muzzle=()=>({group:new THREE.Group(),update:()=>true});
      GFX.shot=(path)=>{gatlingOrigins.push(path(0).clone());return {group:new THREE.Group(),update:()=>true};};
      try{
        const gatlingWep=visualWas.weapons.find(w=>w.fx==='gatling');
        visualWas.band='cruise';visualWas.fireTarget=visualTank;visualWas.pos.y=groundUnitHeight(visualWas);
        visualModel.visible=true;visualBody.visible=true;
        visualModel.position.copy(visualWas.pos);visualModel.position.y+=GROUND_BODY_LIFT;
        visualModel.rotation.y=Math.atan2(visualWas.heading.x,visualWas.heading.z);
        visualBody.geometry=visualModel.userData.special.get('wasFlyFire');
        visualBody.position.set(1,0.5,-0.5);visualBody.rotation.set(.2,-.5,.3,'YXZ');
        groundFxReset();
        groundVisualDirect(visualWas,0,visualTank,0,groundBodyPosition(visualWas,0),groundBodyPosition(visualTank,0),false,gatlingWep);
        groundFxDraw(gameSec);
        visualModel.updateMatrixWorld(true);
        const firstExpected=visualBody.localToWorld(new THREE.Vector3().fromArray(visualBody.geometry.userData.guns[0]));
        const movedTo=new THREE.Vector3(4.5,1.8,2.2);
        visualBody.position.copy(movedTo);visualBody.rotation.set(-.35,.9,-.45,'YXZ');
        gameSec+=.05;groundFxDraw(gameSec);
        visualModel.updateMatrixWorld(true);
        const secondExpected=visualBody.localToWorld(new THREE.Vector3().fromArray(visualBody.geometry.userData.guns[1]));
        const tracked=gatlingOrigins.length===2&&gatlingOrigins[0].distanceTo(firstExpected)<1e-6&&
          gatlingOrigins[1].distanceTo(secondExpected)<1e-6&&gatlingOrigins[0].distanceTo(gatlingOrigins[1])>2;
        visualWas.bodies[0].alive=false;
        gameSec+=.05;groundFxDraw(gameSec);
        const stoppedOnDeath=gatlingOrigins.length===2&&groundGatlingBursts.length===0;
        visualWas.bodies[0].alive=true;
        groundFxReset();
        groundVisualDirect(visualWas,0,visualTank,0,groundBodyPosition(visualWas,0),groundBodyPosition(visualTank,0),false,gatlingWep);
        groundFxDraw(gameSec);
        visualModel.visible=false;
        gameSec+=.05;groundFxDraw(gameSec);
        const stoppedOnHidden=gatlingOrigins.length===3&&groundGatlingBursts.length===0;
        check('バルカン連射は1発ごとに現在位置と姿勢 quaternion から撃ち、撃破・非表示で残りを止める',tracked&&stoppedOnDeath&&stoppedOnHidden);
      }finally{GFX.muzzle=origMuzzle;}
    }finally{GFX.shot=makeShot;}
    groundFxReset();

    for(const team of [0,1]){
      fresh(true);
      const auto=unit('was',team,-13),foe=unit('vehicle',1-team,0);
      auto.stance='engage';auto.groundSupply=29;
      tick(.05);
      check('射程外の接近では歩行のまま（陣営'+team+'）',!auto.bandTo);
      auto.pos.set(-3,0,0);tick(.05);
      check('補給30%未満では自動巡航しない（陣営'+team+'）',!auto.bandTo);
      auto.groundSupply=30;tick(.05);
      check('直射の交戦で補給30%から自動巡航（陣営'+team+'）',auto.fireTarget===foe&&auto.bandTo==='cruise');
      tick(2);
      check('巡航へ移ったあと、交戦中は巡航を維持（陣営'+team+'）',auto.band==='cruise'&&!auto.bandTo);
      foe.pos.x=13;tick(9.99);
      check('交戦終了から10秒の手前ではまだ巡航（陣営'+team+'）',auto.band==='cruise'&&!auto.bandTo);
      tick(.01);
      check('交戦終了から10秒で降下し歩行に戻る（陣営'+team+'）',auto.bandTo==='ground'&&(tick(2),auto.band==='ground'&&!auto.bandTo));
    }
    fresh(true);
    const ordered=unit('was',0,-3),foe=unit('vehicle',1,0);
    order(ordered,{type:'attack',target:foe});tick(.05);
    check('命令優先で直射しても歩行のまま',ordered.fireTarget===foe&&!ordered.bandTo&&ordered.band==='ground');
    ordered.stance='engage';ordered.band='low';tick(.05);
    check('低高度で直射を始めても高さはそのまま',ordered.fireTarget===foe&&!ordered.bandTo&&ordered.band==='low');

    fresh(true);
    for(const [band,cost] of [['ground',0],['cruise',21],['low',41]]){
      fleets=[];
      const idle=unit('was',0,-20);idle.band=band;
      for(let i=0;i<20;i++)tick(1);
      check('実際の停止20秒で補給表示が'+cost+'点減る（'+band+'）',
        close(idle.groundSupply,100-cost)&&groundSupplyReadings([idle]).find(r=>r.key==='groundSupply').value===100-cost);
    }
    fresh(true);
    const cruising=unit('was',0,-7),enemy=unit('vehicle',1,0);
    cruising.band='cruise';order(cruising,{type:'attack',target:enemy});
    for(const b of cruising.bodies){b.shotT=0;b.parallelT=0;}
    tick(1);
    check('上面攻撃の範囲外で追撃せず巡航直射した1秒は停止消費1.05と主武装射撃0.65',close(cruising.groundSupply,98.3)&&!cruising.groundMoved);
    fresh(true);
    const topSupply=unit('was',0,-3),topEnemy=unit('vehicle',1,0);
    topSupply.band='cruise';order(topSupply,{type:'attack',target:topEnemy});
    for(const b of topSupply.bodies){b.shotT=0;b.parallelT=0;}
    tick(1);
    check('上面攻撃で主武装とバルカンを同時に撃った1秒は停止消費1.05と射撃0.65×2',close(topSupply.groundSupply,97.65)&&!topSupply.groundMoved);
    fresh();
    const company=unit('mobileAA',0,0,0,2),aircraft=unit('was',1,5);
    const nearerFlight=unit('was',1,3);
    const positions=(f,points,flight)=>({x:f.pos.x,z:f.pos.z,flight,positions:points.map(p=>new THREE.Vector3(...p))});
    // 3両目は損傷機には6 kmを超えるが、次に狙う近い機体には届く。
    const geometry=new Map([
      [company,positions(company,[[0,0,-2],[0,0,2],[-19,0,0],[0,0,-2],[0,0,2],[0,0,0]],false)],
      [aircraft,positions(aircraft,[[4,.2,-2],[4,.2,2],[6,.2,-1],[6,.2,1]],true)],
      [nearerFlight,positions(nearerFlight,[[2.5,.2,-1],[3,.2,1],[3.5,.2,-1],[3.5,.2,1]],true)]
    ]);
    aircraft.band=nearerFlight.band='cruise';
    const wounded=aircraft.bodies[3],bodyPositions=groundBodyPositions,aimed=[];
    wounded.hp=20;groundBodySync(aircraft);
    try{
      groundBodyPositions=f=>geometry.get(f)??bodyPositions(f);
      groundFireDirect=(f,t,share,aa=false,body=null,w=groundDirectWeapon(f,t,aa))=>{
        if(f===company)aimed.push({t,body,aa});
        return origFire(f,t,share,aa,body,w);
      };
      const ready=()=>{for(const gun of company.bodies)gun.shotT=gun.aaT=0;};
      ready();groundAutoAAStep(0);
      check('中隊の自走対空砲は近い飛行隊がいても最も損傷した1機に集中し、届かない車両は撃たない',
        wounded.hp<20&&aimed.length===5&&aimed.every(s=>s.aa&&s.t===aircraft&&s.body===wounded)&&company.bodies[2].aaT===0);

      wounded.hp=.01;groundBodySync(aircraft);
      aimed.length=0;ready();groundAutoAAStep(0);
      check('集中目標を撃墜した直後に最も近い生存機へ切り替え、その機を全車両で狙う',
        !wounded.alive&&aimed.length===6&&aimed[0].body===wounded&&aimed[1].t===nearerFlight&&
        aimed.slice(1).every(s=>s.t===nearerFlight&&s.body===nearerFlight.bodies[0]));

      aircraft.band='ground';
      geometry.get(aircraft).flight=false;
      const [left,right]=aircraft.bodies;
      right.hp=20;groundBodySync(aircraft);
      aimed.length=0;ready();groundBodyFire(company,aircraft,0);
      check('歩行目標への直射は損傷にかかわらず各車両から最も近い生存体に当たる',
        aimed.length===5&&aimed.every(s=>!s.aa)&&aimed[0].body===left&&aimed[1].body===right);
    }finally{groundBodyPositions=bodyPositions;groundFireDirect=origFire;}

    // 外接長方形を輪郭の各辺に合わせ、面積が最小になる向きで比べる。
    const outlineRatio=points=>{
      const edge=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
      const sorted=[...points].sort((a,b)=>a.x-b.x||a.z-b.z);
      const half=list=>{
        const out=[];
        for(const p of list){
          while(out.length>=2&&edge(out.at(-2),out.at(-1),p)<=0)out.pop();
          out.push(p);
        }
        return out.slice(0,-1);
      };
      const hull=half(sorted).concat(half([...sorted].reverse()));
      let area=0,box=Infinity;
      hull.forEach((a,i)=>{
        const b=hull[(i+1)%hull.length],dx=b.x-a.x,dz=b.z-a.z;
        area+=a.x*b.z-a.z*b.x;
        const x=hull.map(p=>p.x*dx+p.z*dz),z=hull.map(p=>p.z*dx-p.x*dz);
        box=Math.min(box,(Math.max(...x)-Math.min(...x))*(Math.max(...z)-Math.min(...z))/(dx*dx+dz*dz));
      });
      return Math.abs(area)/2/box;
    };
    for(const band of ['cruise','low']){
      fresh();
      const a=unit('was',0,-2,0,4),b=unit('was',1,1,.6,4),ratios=[];
      a.band=b.band=band;
      order(a,{type:'attack',target:b});order(b,{type:'attack',target:a});
      const originalFire=groundFireDirect;
      try{
        groundFireDirect=()=>{}; // 観測する間は配置が機数減少に左右されない。
        for(let i=0;i<160;i++){
          tick(.05);
          if(i>=49&&i%10===9&&a.groundWasFlight?.dogfight&&b.groundWasFlight?.dogfight){
            ratios.push(outlineRatio([a,b].flatMap(f=>groundBodyPositions(f).positions)));
          }
        }
      }finally{groundFireDirect=originalFire;}
      const mean=ratios.reduce((sum,r)=>sum+r,0)/ratios.length;
      check(band+' の上面の輪郭は外接長方形の角まで埋まらず、時間とともに変わる（面積比 '+mean.toFixed(2)+'）',
        ratios.length===12&&mean<.81&&Math.max(...ratios)-Math.min(...ratios)>.08);

      fresh();
      const joined=[unit('was',0,-2,-1,4),unit('was',0,-1.7,1.4,4),unit('was',1,1,-.5,4),unit('was',1,2.5,1.3,4)];
      const targets=[joined[2],joined[2],joined[1],joined[0]];
      joined.forEach((f,i)=>{f.band=band;order(f,{type:'attack',target:targets[i]});});
      const origin=joined.reduce((p,f)=>p.add(f.pos),new THREE.Vector3()).multiplyScalar(1/joined.length);
      const shots=[],originalShot=groundBodyDirectShot;
      try{
        groundBodyDirectShot=(f,i,t,hit,aa)=>{
          const duel=f.groundWasFlight?.dogfight;
          if(duel?.group?.multi)shots.push({f,t,i,j:hit.j,pair:duel.pairs[i>>1],aa});
        };
        for(let i=0;i<75;i++)tick(.05);
      }finally{groundBodyDirectShot=originalShot;}
      const fights=joined.map(f=>f.groundWasFlight?.dogfight),group=fights[0]?.group;
      const rules=groundRuleSet().wasCombat,span=band==='low'?rules.dogfight.low.maxSpanKm:rules.swarmLayout.maxSpanKm;
      check(band+' の各2個中隊は4中隊の平均位置・単独戦の√2倍の空域を共有する',
        group?.multi&&fights.every(d=>d?.group===group&&close(d.x,origin.x)&&close(d.z,origin.z))&&
          close(group.outer,span*GROUND_SCALE/Math.SQRT2));
      check(band+' の16組ずつが敵の組を重複なく分担し、実際の射撃も割り当て先に届く',
        [0,2].every(i=>{
          const pairs=fights.slice(i,i+2).flatMap(d=>d?.pairs??[]);
          return new Set(pairs.map(({target,pairs})=>target.id+':'+pairs[0])).size===16;
        })&&shots.some(({f,t})=>t!==targets[joined.indexOf(f)])&&
          shots.every(({t,j,pair,aa})=>!aa&&t===pair.target&&(j>>1)===pair.pairs[0]));
      if(group){
        const plans=joined.map(f=>f.groundWasFlight);
        const p=plans[0].bodies[0].pos,q=plans[1].bodies[0].pos;
        p.set(origin.x,groundBandHeight(band)+.2,origin.z);q.copy(p);
        groundWasDogfightSeparate(group,rules);
        check(band+' の別中隊の機が同じ位置に来ても押し離す',
          p.distanceTo(q)>=rules.swarmManeuvers.pair.unitClearKm*GROUND_SCALE-1e-7);
      }
    }

    return rows;
  })()`);
  return cases;
}

module.exports={nodeChecks};
if(require.main===module){
  const rows=nodeChecks();
  for(const row of rows)console.log((row.ok?'✓ ':'✗ ')+row.name);
  process.exitCode=Number(rows.some(row=>!row.ok));
}
