/* Ground-battle presentation. Positions here are in groundVisuals coordinates.
   A shot records only drawing state. The simulation still owns firing, flight, hits and movement. */
const GROUND_FX_LIMIT={direct:48,flight:48,blast:8,rocket:24,stray:8,wreck:6,plumes:32}; // 同時表示数は仮。噴射口は1個中隊16機×2。
const GROUND_BODY_LIFT=.15; // 地上の体と空中の W.A.S. を描くときの持ち上げ幅
const groundFxQueues={direct:[],flight:[],blast:[],rocket:[],stray:[],wreck:[]},groundFxPlumes=[],groundGatlingBursts=[];
const groundFxUp=new THREE.Vector3(0,1,0),groundFxForward=new THREE.Vector3(0,0,1);
const groundWasPower={wasFly:.6,wasFlyFire:.6,wasFlyMove:1.25,wasFlyMarch:1.25,wasFlyUp:1.5,wasFlyDown:.45};
let groundFxPlumesUsed=0;

function groundFxRelease(fx){
  if(!fx)return;
  fx.group.parent?.remove(fx.group);
  // GFX owns and shares the textures and geometry. Each effect owns its materials.
  fx.group.traverse(o=>o.material?.dispose());
}
function groundFxReset(){
  for(const queue of Object.values(groundFxQueues)){for(const e of queue)groundFxRelease(e.fx);queue.length=0;}
  for(const fx of groundFxPlumes)groundFxRelease(fx);
  groundFxPlumes.length=0;
  groundGatlingBursts.length=0;
  groundFxPlumesUsed=0;
}
function groundFxAdd(type,start,life,create,options={}){
  if(!groundVisuals)return;
  const queue=groundFxQueues[type];
  if(queue.length===GROUND_FX_LIMIT[type])groundFxRelease(queue.shift().fx);
  queue.push({start,life,create,fx:null,...options});
}
function groundFxDraw(now){
  groundVisualDrawGatling(now);
  for(const queue of Object.values(groundFxQueues)){
    let kept=0;
    for(const e of queue){
      const age=e.elapsed?e.elapsed():now-e.start;
      if(age>=e.life){groundFxRelease(e.fx);continue;}
      if(age>=0){
        const visible=!e.visible||e.visible(age);
        if(visible&&!e.fx){e.fx=e.create();groundVisuals.add(e.fx.group);}
        if(e.fx){
          if(age!==e.age&&!e.fx.update(age)){groundFxRelease(e.fx);continue;}
          e.age=age;
          e.fx.group.visible=visible;
        }
      }
      queue[kept++]=e;
    }
    queue.length=kept;
  }
  for(let i=groundFxPlumesUsed;i<groundFxPlumes.length;i++)groundFxPlumes[i].group.parent?.remove(groundFxPlumes[i].group);
}
function groundFxPlace(fx,at,dir){
  fx.group.position.copy(at);
  if(dir&&dir.lengthSq()>0)fx.group.quaternion.setFromUnitVectors(groundFxForward,dir.clone().normalize());
  return fx;
}
function groundFxSeen(f){return f.team===0||groundSeenBy(0,f)||f.seen||typeof revealMode!=='undefined'&&revealMode;}
function groundFxDetail(at,radius,minPixels){
  if(typeof camera==='undefined'||!camera?.isPerspectiveCamera||typeof H==='undefined')return true;
  return radius*H>=2*minPixels*Math.tan(camera.fov*Math.PI/360)*camera.position.distanceTo(at);
}

function groundVisualSpecialKeys(key){
  if(key==='was4')return ['wasFire',...Object.keys(groundWasPower)];
  return key==='hinf'?['hinfMsl']:[];
}
function groundVisualRigParts(body,rig){
  const {material}=body,parts=new THREE.Group(),turret=new THREE.Group();
  const gun=new THREE.Mesh(rig.gun,material);
  parts.add(new THREE.Mesh(rig.hull,material),turret);
  turret.position.fromArray(rig.turretAt);
  if(rig.turret)turret.add(new THREE.Mesh(rig.turret,material));
  gun.position.fromArray(rig.gunAt);
  turret.add(gun);
  return {parts,turret,gun};
}
// 砲塔・砲身（砲塔のない自走砲などは車体）の回る速さ（ラジアン/実時間の秒。仮）。
// ユーザーの指示 2026-11-22「自走砲の場合打つ時だけ車体と方針を合わせ、その後一瞬で元に戻ります」: 撃つ相手がいる間は狙い続け、
// いなくなったらこの速さで正面へ戻す
const GROUND_RIG_TURN={turret:3,chassis:1.5};
// 撃った直後の向き（look）に加え、撃つ相手が生きている間はその相手を狙い続ける
function groundVisualKeepAim(f,b,now){
  if(b?.look?.until>now)return b.look;
  const t=f.fireTarget;
  if(!b?.look||!t?.alive||t.embarked||groundAbsent(t))return null;
  return {yaw:Math.atan2(t.pos.x-f.pos.x,t.pos.z-f.pos.z),el:b.look.el,missile:b.look.missile};
}
function groundVisualRigDraw(body,aim,heading,moving){
  const state=body.userData.aimParts,now=performance.now()/1000,dt=Math.min(.1,Math.max(0,now-(state.t??now)));state.t=now;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  if(!state.parts){
    if(!aim)return;
    Object.assign(state,groundVisualRigParts(body,state.rig));state.yaw=wrap(aim.yaw-heading-body.rotation.y);state.el=aim.el;
  }
  const {parts,turret,gun,rig}=state;
  const want=aim?wrap(aim.yaw-heading-body.rotation.y):0,wantEl=aim?aim.el:0;
  const step=(rig.hasTurret?GROUND_RIG_TURN.turret:GROUND_RIG_TURN.chassis)*dt,clamp=v=>Math.max(-step,Math.min(step,v));
  state.yaw=wrap(state.yaw+clamp(wrap(want-state.yaw)));state.el+=clamp(wantEl-state.el);
  if(!aim&&Math.abs(state.yaw)<1e-3&&Math.abs(state.el)<1e-3){
    if(parts.parent){body.remove(parts);body.layers.enable(0);}
    return;
  }
  if(!parts.parent){body.layers.disable(0);body.add(parts);}
  gun.rotation.x=-state.el;
  turret.rotation.y=rig.hasTurret?state.yaw:0;
  // The fixed launcher turns its displayed chassis when stopped. The track still owns moving bodies.
  parts.rotation.y=!rig.hasTurret&&!moving?state.yaw:0;
}
function groundWasVisualPose(f,shot,moving,guard){
  if(f.bandTo)return groundBandHeight(f.bandTo)>groundBandHeight(f.band)?'wasFlyUp':'wasFlyDown';
  if(f.band==='ground')return shot?'wasFire':null;
  if(shot)return 'wasFlyFire';
  return moving?(guard?'wasFlyMove':'wasFlyMarch'):'wasFly';
}
function groundWasPlume(body,key,now,boost=0,length=1){
  const nozzles=body.geometry.userData.nozzles;
  if(!nozzles||groundFxPlumesUsed+nozzles.length>GROUND_FX_LIMIT.plumes)return;
  const power=THREE.MathUtils.lerp(groundWasPower[key],groundWasPower.wasFlyUp,boost);
  for(const n of nozzles){
    const i=groundFxPlumesUsed++,fx=groundFxPlumes[i]||(groundFxPlumes[i]=GFX.plume(.52));
    if(fx.group.parent!==body)body.add(fx.group);
    fx.group.position.fromArray(n.p);
    fx.group.quaternion.setFromUnitVectors(groundFxForward,new THREE.Vector3().fromArray(n.d));
    fx.update(now,power*n.k,length);
  }
}
// 通過中は銃口の光と曳光を描く。実弾の発射と着弾は通常の射撃処理で起きる。
function groundWasPassFlash(body,f,t,heading,now){
  const local=body.geometry.userData.guns?.[0];
  if(!local)return;
  const muzzle=new THREE.Vector3().fromArray(local).multiply(body.scale).applyQuaternion(body.quaternion)
    .add(body.position).applyAxisAngle(groundFxUp,heading).add(f.pos);
  muzzle.y+=GROUND_BODY_LIFT;
  const index=body.userData.wasPassTarget;
  if(index!=null&&(f.groundWasFlight?.dogfight?.target!==t||!t.bodies?.[index]?.alive))return;
  const at=index==null?t.pos.clone():groundBodyPosition(t,index);
  if(index==null&&t.band==='ground')at.y+=GROUND_BODY_LIFT;
  if(index!=null&&!groundClearLine(muzzle,at))return;
  const direction=at.clone().sub(muzzle),g=GFX.gatling;
  groundFxAdd('direct',now,g.flashLife,()=>groundFxPlace(
    GFX.muzzle(g.flash,{life:g.flashLife,detail:groundFxDetail(muzzle,g.flash*2,5)}),muzzle,direction));
  if(groundFxSeen(t))groundFxAdd('direct',now,g.fly,()=>GFX.shot(u=>muzzle.clone().lerp(at,u),g.fly,'tracer',g.tracer));
}
// The ground lift is shared with groundDraw. For aircraft with centred hit tests,
// use the displayed body offsets for the picture of the shot.
function groundVisualBodyPoint(f,i,p){
  const at=p.clone();
  if(groundWasBodyFlight(f))return at;
  if(f.band==='ground')at.y+=GROUND_BODY_LIFT;
  const body=f.groundModel?.userData.formation?.bodies[i];
  if(body&&f.bodies0>1&&groundBodyCentered(f))at.add(body.position.clone().applyAxisAngle(groundFxUp,Math.atan2(f.heading.x,f.heading.z)));
  return at;
}
function groundVisualAim(f,i,from,to,{missile=false,indirect=false,gatling=false,rocket=false}={}){
  const data=f.groundModel?.userData,spec=f.groundBodySpec,rig=data?.rig,form=data?.formation;
  const groundMove=!!f.groundTrack?.moving[i],base=groundVisualBodyPoint(f,i,from),size=spec?.body??spec?.size??1;
  const heading=f.heading?Math.atan2(f.heading.x,f.heading.z):0;
  const body=form?.bodies[i],relativeYaw=body?.userData.baseYaw??body?.rotation.y??0;
  const geometry=groundBodyPositions(f),bodyYaw=geometry.yaws?.[i]??heading+relativeYaw;
  let yaw=Math.atan2(to.x-base.x,to.z-base.z),el=0,muzzle,direction,guns;
  if(rig){
    // Solve elevation at the trunnion. Axis offsets follow the turret, or the stopped chassis.
    const pivot=new THREE.Vector3().fromArray(rig.turretAt).multiplyScalar(size);
    if(rig.hasTurret){
      pivot.applyAxisAngle(groundFxUp,bodyYaw);
      yaw=Math.atan2(to.x-base.x-pivot.x,to.z-base.z-pivot.z);
    }else{
      if(groundMove)yaw=bodyYaw;
      pivot.applyAxisAngle(groundFxUp,yaw);
    }
    const trunnion=new THREE.Vector3().fromArray(rig.gunAt).multiplyScalar(size).applyAxisAngle(groundFxUp,yaw).add(base).add(pivot);
    const dx=to.x-trunnion.x,dz=to.z-trunnion.z;
    el=THREE.MathUtils.clamp(Math.atan2(to.y-trunnion.y,Math.hypot(dx,dz)),...rig.el);
    direction=new THREE.Vector3(Math.sin(yaw)*Math.cos(el),Math.sin(el),Math.cos(yaw)*Math.cos(el));
    muzzle=trunnion.addScaledVector(direction,rig.muzzle*size);
  }else{
    const key=missile?'hinfMsl':f.groundKind==='was'?groundWasVisualPose(f,true,false,false):null;
    const pose=data?.special?.get(key);
    const move=data?.pose?.move[i]?.find(mesh=>mesh.visible);
    const shape=pose||move?.geometry||data?.pose?.rest||body?.geometry;
    const local=rocket?shape?.userData.guns?.[0]:shape?.userData.muzzle;
    const muzzleYaw=pose&&(key==='hinfMsl'||key==='wasFire'||key==='wasFlyFire')?yaw:bodyYaw;
    const flight=geometry.flight?.bodies[i],air=geometry.air?.bodies[i],bodyFlight=air||flight;
    const attitude=bodyFlight&&new THREE.Quaternion().setFromEuler(new THREE.Euler(air?-air.pitch:flight.pitch,bodyFlight.yaw,bodyFlight.bank,'YXZ'));
    const worldPoint=(point,lift)=>{
      const p=new THREE.Vector3().fromArray(point).multiplyScalar(size);
      if(attitude)p.applyQuaternion(attitude);
      else p.applyAxisAngle(groundFxUp,muzzleYaw);
      // groundDraw lifts the flying W.A.S. model as well as the grounded one.
      if(lift&&!flight&&f.band!=='ground')p.y+=GROUND_BODY_LIFT;
      return p.add(base);
    };
    if(gatling&&pose?.userData.guns)guns=pose.userData.guns.map(point=>worldPoint(point,true));
    muzzle=local?worldPoint(local,rocket):air?worldPoint([0,0,.5],false):
      base.add(new THREE.Vector3(Math.sin(bodyYaw)*size*.5,f.band==='ground'?size*.4:0,Math.cos(bodyYaw)*size*.5));
    direction=to.clone().sub(muzzle).normalize();
  }
  if((rig||data?.special?.size)&&f.bodies?.[i])f.bodies[i].look={yaw,el,missile,until:gameSec+(indirect?.7:1.05)};
  return {muzzle,direction,guns};
}
function groundVisualMuzzle(shot,size,options={}){
  const {muzzle,direction}=shot;
  groundFxAdd('direct',gameSec,options.smokeK?2.2:.25,()=>groundFxPlace(
    GFX.muzzle(size,{...options,detail:groundFxDetail(muzzle,size*2,5)}),muzzle,direction));
}
function groundVisualDust(point,radius,start,smokeK=1){
  const at=point.clone();
  at.y=groundSurfaceHeight(at.x,at.z)+.025;
  groundFxAdd('blast',start,7,()=>groundFxPlace(GFX.blast(radius,{
    smokeK,detail:groundFxDetail(at,radius,24),
    surface:(x,z)=>groundSurfaceHeight(at.x+x,at.z+z)-at.y
  }),at));
}
function groundVisualGatlingGuns(f,i){
  if(!f?.alive||f.embarked||groundAbsent(f))return null;
  if(f.bodies&&!f.bodies[i]?.alive)return null;
  if(!groundFxSeen(f))return null;
  const model=f.groundModel;
  if(!model||!model.visible)return null;
  const data=model.userData,body=data?.formation?.bodies[i];
  const mesh=body?.visible?body:data?.pose?.move[i]?.find(m=>m.visible);
  if(!mesh)return null;
  const guns=mesh.geometry?.userData.guns||data?.special?.get(groundWasVisualPose(f,true,false,false))?.userData.guns;
  if(!guns?.length)return null;
  const origin=model.position,heading=model.rotation.y;
  return guns.map(local=>new THREE.Vector3().fromArray(local)
    .multiply(mesh.scale)
    .applyQuaternion(mesh.quaternion)
    .add(mesh.position)
    .applyAxisAngle(groundFxUp,heading)
    .add(origin));
}
function groundVisualGatling(f,i,guns,at,seenTarget,stray=null){
  // Reserving a whole burst in the direct queue would evict rounds before they even start.
  if(groundGatlingBursts.length===GROUND_FX_LIMIT.direct)groundGatlingBursts.shift();
  const rnd=GFX.visualRandom,miss=stray&&rnd()<stray.chance?Math.floor(rnd()*GFX.gatling.rounds):-1;
  groundGatlingBursts.push({start:gameSec,next:0,source:f,bodyIndex:i,hadSource:!!guns?.length,guns,at,seenTarget,stray,miss});
}
function groundVisualDrawGatling(now){
  const g=GFX.gatling,spacing=g.burst/g.rounds;
  let kept=0;
  for(const burst of groundGatlingBursts){
    const f=burst.source,i=burst.bodyIndex;
    if(!f?.alive||f.embarked||groundAbsent(f)||(f.bodies&&!f.bodies[i]?.alive))continue;
    const liveGuns=groundVisualGatlingGuns(f,i);
    if(burst.hadSource&&!liveGuns)continue;
    while(burst.next<g.rounds){
      const start=burst.start+burst.next*spacing;
      if(start>now)break;
      groundVisualGatlingRound(burst,liveGuns,burst.next++,start,now);
    }
    if(burst.next<g.rounds)groundGatlingBursts[kept++]=burst;
  }
  groundGatlingBursts.length=kept;
}
function groundVisualGatlingRound({at,seenTarget,stray,miss},guns,k,start,now){
  const g=GFX.gatling,rnd=GFX.visualRandom;
  const flash=guns&&now-start<g.flashLife,fly=guns&&seenTarget&&now-start<g.fly;
  const missed=k===miss&&!!guns&&seenTarget;
  const impact=!missed&&seenTarget&&k%g.hitEvery===0&&now-start-g.fly<g.hitLife;
  if(!flash&&!fly&&!impact&&!missed)return;
  const hit=at.clone().add(new THREE.Vector3((rnd()-.5)*2*g.spread,(rnd()-g.spreadHeightBias)*g.spread,(rnd()-.5)*2*g.spread));
  const muzzle=guns?.[k%guns.length];
  if(flash){
    const direction=hit.clone().sub(muzzle);
    const size=g.flash*THREE.MathUtils.lerp(g.flashMin,g.flashMax,rnd());
    groundFxAdd('direct',start,g.flashLife,()=>groundFxPlace(
      GFX.muzzle(size,{life:g.flashLife,detail:groundFxDetail(muzzle,g.flash*2,5)}),muzzle,direction));
  }
  if(missed)groundVisualStray(muzzle,at,start,now,stray);
  else if(fly)groundFxAdd('direct',start,g.fly,()=>GFX.shot(u=>muzzle.clone().lerp(hit,u),g.fly,'tracer',g.tracer));
  if(impact)groundFxAdd('direct',start+g.fly,g.hitLife,()=>groundFxPlace(
    GFX.hit(g.hit,{detail:groundFxDetail(hit,g.hit*1.4,5)}),hit));
}
function groundVisualStray(muzzle,at,start,now,config){
  const rnd=GFX.visualRandom,g=GFX.gatling,duration=g.fly*1.65;
  if(now-start>=duration+g.hitLife)return;
  const dx=at.x-muzzle.x,dz=at.z-muzzle.z,heading=Math.atan2(dx,dz);
  const reach=THREE.MathUtils.lerp(...config.reachKm,rnd())*GROUND_SCALE;
  const side=(rnd()<.5?-1:1)*reach*.55;
  const impact=at.clone().add(new THREE.Vector3(Math.sin(heading)*reach+Math.cos(heading)*side,0,Math.cos(heading)*reach-Math.sin(heading)*side));
  impact.y=groundSurfaceHeight(impact.x,impact.z)+.025;
  const path=u=>{
    const p=muzzle.clone().lerp(impact,u);
    const drop=Math.max(0,at.y-THREE.MathUtils.lerp(muzzle.y,impact.y,.72));
    p.y+=drop*4*u*(1-u);
    return p;
  };
  groundFxAdd('stray',start,duration+g.hitLife,()=>{
    const tracer=GFX.shot(path,duration,'tracer',g.tracer);
    const hit=groundFxPlace(GFX.hit(config.size),impact);
    const group=new THREE.Group();group.add(tracer.group,hit.group);
    return {group,update(t){
      tracer.group.visible=t<duration;hit.group.visible=t>=duration;
      if(t<duration)tracer.update(t);
      else hit.update(t-duration);
      return true;
    }};
  });
}
function groundVisualDirect(f,i,t,j,from,to,aa=false,weapon=null){
  if(!groundVisuals)return;
  const seen=groundFxSeen(f),seenTarget=groundFxSeen(t);
  if(!seen&&!seenTarget)return;
  const at=groundVisualBodyPoint(t,j,to);
  if(t.band==='ground'&&!groundWasBodyFlight(t))at.y+=(t.groundBodySpec?.body??.4)*.5;
  const missile=f.groundKind==='heavyInfantry'&&(aa||t.groundKind==='vehicle');
  const gatling=weapon?.fx==='gatling';
  const rocket=weapon?.fx==='rocket',smokeTrail=missile||rocket;
  const shot=seen?groundVisualAim(f,i,from,at,{missile,gatling,rocket}):null;
  if(gatling&&(!seen||shot?.guns?.length)){
    const stray=seen&&seenTarget&&f.groundKind==='was'&&groundWasCruising(t)?groundRuleSet().wasCombat.dogfight.stray:null;
    groundVisualGatling(f,i,shot?.guns,at,seenTarget,stray);
    return;
  }
  // ロケットは見えるように、距離から飛ぶ時間を決める（約0.6 km/秒、0.5〜3秒。仮、#525 2026-11-28）。ほかの直射は0.25秒のまま
  const flyKm=shot?shot.muzzle.distanceTo(at)/GROUND_SCALE:0;
  const tank=f.groundKind==='vehicle'?GFX.tank:null,duration=rocket?THREE.MathUtils.clamp(flyKm/.6,.5,3):tank?.duration??.25;
  /* W.A.S. の撃つ絵は機体（大きさ .5、描く体は約0.8）より小さく（ユーザー 2026-11-28「機体よりでかい」）。仮:
     対艦ロケットの弾 .045（弾体と炎で機体の約3分の1）、発射の光 .06、煙は無誘導ロケットの5割。88 mm の光と筋は .09（模型を .75 → .5 にした分も小さく） */
  const wasShot=f.groundKind==='was';
  const size=missile?.14:rocket?.045:wasShot?.09:f.groundModel?.userData.rig?.13:.085;
  // 発射の光とロケットの推進の炎は0.8倍（ユーザー 2026-11-28「0.8倍ぐらいに」）
  const flashSize=(rocket?.06:size)*(wasShot?.8:1),hitSize=rocket?.13:size; // 着弾の光は弾より大きく（形成炸薬の爆発）
  if(seen){
    groundVisualMuzzle(shot,tank?tank.muzzleSize*GROUND_BODY_SCALE:flashSize,tank?.muzzleOptions);
    if(seenTarget){
      const path=u=>shot.muzzle.clone().lerp(at,u);
      const tracerSize=tank?tank.tracerSize*GROUND_BODY_SCALE:size;
      groundFxAdd(smokeTrail?'rocket':'direct',gameSec,smokeTrail?duration+GFX.rocketSmokeSec:duration,()=>GFX.shot(path,duration,smokeTrail?'rocket':'tracer',tracerSize,{smoke:rocket?1.1:1,flame:rocket&&wasShot?.8:1}));
    }
  }
  if(seenTarget){
    const start=gameSec+duration,airborne=groundAATargetable(t);
    if(tank&&t.band==='ground'&&!airborne)groundVisualDust(at,tank.impactRadius*GROUND_BODY_SCALE,start,tank.impactSmoke);
    else groundFxAdd('direct',start,airborne?1.5:.9,()=>groundFxPlace(
      airborne?GFX.airBurst(hitSize*4):GFX.hit(hitSize*1.8,{detail:groundFxDetail(at,hitSize*2,5)}),at));
  }
}
function groundVisualLaunch(s,i){
  if(!groundVisuals)return;
  const {source:f,flight,impact,duration,kind}=s,bomb=kind==='supportAircraft';
  const projectile=kind==='guidedRocket'?'rocket':bomb?'bomb':kind==='vehicle'?'tracer':'shell';
  const aim=flight?groundBallisticAt(flight,Math.min(.1,duration*.1)):impact;
  // The first visible point of the path is the muzzle. The correction vanishes at the actual impact.
  const origin=flight?.origin||s.origin;
  const direction=aim.clone().sub(origin);
  if(direction.lengthSq()<1e-10)direction.copy(impact).sub(origin);
  const target=s.origin.clone().addScaledVector(direction.normalize(),32);
  const shot=bomb?{muzzle:origin,direction}:groundVisualAim(f,i,s.origin,target,{indirect:kind!=='vehicle'});
  if(groundFxSeen(f)){
    const heavy=!bomb&&projectile!=='rocket';
    if(kind==='vehicle')groundVisualMuzzle(shot,GFX.tank.muzzleSize*GROUND_BODY_SCALE,GFX.tank.muzzleOptions);
    else groundVisualMuzzle(shot,bomb?.09:kind==='guidedRocket'?.16:.22,heavy?{side:true,smokeK:.7}:undefined);
  }
  if(!(duration>0))return;
  const offset=shot.muzzle.clone().sub(origin),path=u=>flight?groundBallisticAt(flight,u*duration).addScaledVector(offset,1-u):shot.muzzle.clone().lerp(impact,u);
  const size=bomb?.23:projectile==='rocket'?.16:projectile==='tracer'?GFX.tank.tracerSize*GROUND_BODY_SCALE:.22;
  const tail=projectile==='rocket'?GFX.rocketSmokeSec:0;
  let checked=-Infinity,seen=false;
  groundFxAdd('flight',gameSec,duration+tail,()=>GFX.shot(path,duration,projectile,size),{
    elapsed:()=>duration-s.left+(s.visualLandedAt===undefined?0:Math.max(0,gameSec-s.visualLandedAt)),
    visible:f.team===0?null:age=>{
      if(age<checked||age-checked>=.2){checked=age;seen=groundPointSeenBy(0,path(Math.min(1,age/duration)));}
      return seen;
    }
  });
}
function groundVisualBlast(s){
  s.visualLandedAt=gameSec;
  if(!groundVisuals||s.team!==0&&!groundPointSeenBy(0,s.impact))return;
  groundVisualDust(s.impact,s.radius,gameSec,s.kind==='vehicle'?GFX.tank.impactSmoke:1);
}
function groundVisualLoss(f,at,i){
  if(!groundVisuals||!groundFxSeen(f))return;
  const data=f.groundModel?.userData,body=data?.formation?.bodies[i],flight=f.groundWasFlight?.bodies[i];
  if(f.groundKind==='was'&&['cruise','low'].includes(f.band)&&body&&flight){
    const {wreck,low}=groundRuleSet().wasCombat.dogfight;
    const config=f.band==='low'?{...wreck,...low.wreck}:wreck;
    groundVisualWasWreck(at,data.special?.get('wasFly')||body.geometry,body.material,body.scale,flight,config);
    return;
  }
  const inAir=['low','high'].includes(f.band);
  groundFxAdd('direct',gameSec,inAir?1.5:.9,()=>groundFxPlace(inAir?GFX.airBurst(.55):GFX.hit(.28),at));
}
function groundVisualWasWreck(at,geometry,material,scale,flight,config){
  const rnd=GFX.visualRandom;
  const {lerp,clamp}=THREE.MathUtils,duration=lerp(...config.durationSec,rnd());
  const spin=(rnd()<.5?-1:1),initial={yaw:flight.yaw,pitch:flight.pitch,bank:flight.bank};
  const drift=flight.vel.clone().setY(0).multiplyScalar(duration*.55);
  drift.clampLength(.045*GROUND_SCALE,config.driftKm*GROUND_SCALE);
  if(!drift.lengthSq())drift.set(Math.sin(initial.yaw),0,Math.cos(initial.yaw)).multiplyScalar(.045*GROUND_SCALE);
  const height=at.y-groundSurfaceHeight(at.x,at.z);
  const path=(t,out)=>{
    const u=clamp(t/duration,0,1);
    out.copy(at).addScaledVector(drift,u*(2-u));
    out.y=groundSurfaceHeight(out.x,out.z)+height*(1-u**1.8);
    return out;
  };
  const size=scale.clone(),start=gameSec;
  let finishedAt;
  groundFxAdd('wreck',start,duration+config.smokeSec,()=>{
    const group=new THREE.Group(),wreck=new THREE.Mesh(geometry,material.clone());
    wreck.scale.copy(size);
    const trail=GFX.wreckTrail(Math.max(.36,size.x*1.15),path,duration,config);
    const impact=groundFxPlace(GFX.hit(config.impactSize),path(duration,new THREE.Vector3()).add(new THREE.Vector3(0,.035,0)));
    group.add(wreck,trail.group,impact.group);
    return {group,update(t){
      const u=Math.min(1,t/duration);
      wreck.visible=t<duration;impact.group.visible=!wreck.visible;
      if(wreck.visible){
        path(t,wreck.position);
        wreck.rotation.set(initial.pitch+u*1.25,initial.yaw+spin*u*.9,initial.bank+spin*u*2.6,'YXZ');
      }else impact.update(t-duration);
      trail.update(t);
      return true;
    }};
  },{elapsed:()=>{
    // 最後の機体でも、戦闘終了で作戦時計が止まった後に地面まで落ちる。
    if(over&&finishedAt===undefined)finishedAt=performance.now();
    return gameSec-start+(finishedAt===undefined?0:(performance.now()-finishedAt)/1000);
  }});
}
