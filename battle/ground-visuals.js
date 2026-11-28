/* Ground-battle presentation. Positions here are in groundVisuals coordinates.
   A shot records only drawing state. The simulation still owns firing, flight, hits and movement. */
const GROUND_FX_LIMIT={direct:48,flight:48,blast:8,rocket:24,stray:8,plumes:64}; // 同時表示数は仮。噴射口は1個中隊16機×最大4。
const GROUND_BODY_LIFT=.15; // 地上の体と空中の W.A.S. を描くときの持ち上げ幅
const groundFxQueues={direct:[],flight:[],blast:[],rocket:[],stray:[],wreck:[]},groundFxPlumes=[],groundGatlingBursts=[];
const groundFxUp=new THREE.Vector3(0,1,0),groundFxForward=new THREE.Vector3(0,0,1);
const groundWasDrawVelocity=new THREE.Vector3(),groundWasDrawAccel=new THREE.Vector3();
const groundWasPlumePoint=new THREE.Vector3(),groundWasPlumeDirection=new THREE.Vector3();
const groundWreckVehicles=new Set(['vehicle','artillery','guidedRocket','mobileAA','apc','scout','engineer','supply']);
let groundWreckKneel=null,groundWreckShard=null;
let groundFxPlumesUsed=0;

function groundFxRelease(fx){
  if(!fx)return;
  fx.group.parent?.remove(fx.group);
  // GFX owns and shares the textures and geometry. Each effect owns its materials.
  const materials=new Set();
  fx.group.traverse(o=>{if(o.material)materials.add(o.material);});
  for(const material of materials)material.dispose();
}
function groundFxReset(){
  for(const queue of Object.values(groundFxQueues)){for(const e of queue)groundFxRelease(e.fx);queue.length=0;}
  for(const fx of groundFxPlumes)groundFxRelease(fx);
  groundFxPlumes.length=0;
  groundGatlingBursts.length=0;
  groundFxPlumesUsed=0;
  groundWreckKneel?.dispose();groundWreckKneel=null;
  groundWreckShard?.dispose();groundWreckShard=null;
}
function groundFxLimit(type){return type==='wreck'?groundRuleSet().wreckVisuals.limit:GROUND_FX_LIMIT[type];}
function groundFxAdd(type,start,life,create,options={}){
  if(!groundVisuals)return;
  const queue=groundFxQueues[type],limit=groundFxLimit(type);
  if(limit<=0)return;
  while(queue.length>=limit)groundFxRelease(queue.shift().fx);
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
  if(key==='was4')return ['wasFire',...groundRuleSet().wasCombat.thrust.poses];
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
function groundWasDrawThrust(body,position,yaw,now,config,maneuver=0){
  let state=body.userData.wasThrust;
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const {clamp,degToRad,radToDeg,smoothstep}=THREE.MathUtils;
  if(!state||now<state.at){
    state=body.userData.wasThrust={at:now,position:position.clone(),velocity:new THREE.Vector3(),
      accel:new THREE.Vector3(),yaw,step:0,boost:0,left:0,right:0,burstAt:-Infinity,burstDemand:false,pitch:0,bank:0};
  }else if(now>state.at){
    const dt=now-state.at;
    const velocity=groundWasDrawVelocity.subVectors(position,state.position).divideScalar(dt);
    const {back,calf}=config;
    const yawRate=radToDeg(groundWrap(yaw-state.yaw))/dt;
    let sideAccel=0,brake=0,accelSize=0;
    if(state.step>0){
      // 速度は各区間の中点の値として扱う。描画間隔が変わってもその中点間の時間で割る。
      const accel=groundWasDrawAccel.subVectors(velocity,state.velocity)
        .divideScalar((dt+state.step)/2*GROUND_SCALE);
      accelSize=accel.length();
      sideAccel=accel.x*c-accel.z*s;
      const {x,z}=state.velocity,speed=Math.hypot(x,z);
      if(speed>0)brake=-(accel.x*x+accel.z*z)/speed;
      accel.divideScalar(config.fullAccelKmSec2).clampLength(0,1);
      const rise=-Math.expm1(Math.log(.1)*dt/config.riseSec);
      state.accel.lerp(accel,rise);
    }
    const demand=accelSize>=back.accelKmSec2||Math.abs(yawRate)>=back.yawDegSec||maneuver>=back.maneuver;
    // 強噴射は閾値を超えた出だしだけ。連続した機動や入力の揺れで点き続けないようにする。
    if(demand&&!state.burstDemand&&now-state.burstAt>=back.reburstSec)state.burstAt=now;
    state.burstDemand=demand;
    const rise=-Math.expm1(Math.log(.1)*dt/config.plumeRiseSec),fall=-Math.expm1(Math.log(.1)*dt/config.plumeFallSec);
    const follow=(value,target)=>value+(target-value)*(target>value?rise:fall);
    state.boost=follow(state.boost,Number(now-state.burstAt<back.burstSec));
    const braking=smoothstep(brake,...calf.brakeKmSec2);
    // +X は左。右への転換・横加速には左脚を使い、制動では両脚を使う。
    state.left=follow(state.left,calf.maxPower*Math.max(braking,smoothstep(-yawRate,...calf.yawDegSec),smoothstep(-sideAccel,...calf.sideAccelKmSec2)));
    state.right=follow(state.right,calf.maxPower*Math.max(braking,smoothstep(yawRate,...calf.yawDegSec),smoothstep(sideAccel,...calf.sideAccelKmSec2)));
    state.position.copy(position);state.velocity.copy(velocity);state.yaw=yaw;state.step=dt;state.at=now;
  }
  // 機体のヨーを基準に前後・左右へ分ける。機体の正面は +Z。
  const {x,y,z}=state.accel;
  state.pitch=degToRad(clamp((x*s+z*c)*config.pitchDeg-y*config.verticalPitchDeg,-config.pitchDeg,config.pitchDeg));
  state.bank=degToRad(-(x*c-z*s)*config.rollDeg);
  return state;
}
function groundWasPlume(body,now,config,calves=false,transitionPower=0){
  const nozzles=body.geometry.userData.nozzles;
  if(!nozzles||groundFxPlumesUsed>=GROUND_FX_LIMIT.plumes)return;
  const {lerp}=THREE.MathUtils;
  const state=body.userData.wasThrust,{back,calf}=config,boost=state?.boost??0;
  if(calves&&!transitionPower&&Math.max(state?.left??0,state?.right??0)<=.02)return;
  const at=body.userData.wasPlumePosition??body.getWorldPosition(groundWasPlumePoint);
  if(calves&&!groundFxDetail(at,body.scale.x,calf.minPixels))return;
  const plumeSize=.52,backPower=lerp(back.idlePower,back.maxPower,boost);
  const radius=plumeSize*body.scale.x/GROUND_SCALE;
  if(!calves&&!groundFxDetail(at,radius,back.minPixels))return;
  const detail=calves||groundFxDetail(at,radius,back.detailPixels);
  const length=calves?1:lerp(1,back.maxLength,boost);
  for(const n of nozzles){
    if(Boolean(n.calfSide)!==calves)continue;
    if(groundFxPlumesUsed>=GROUND_FX_LIMIT.plumes)break;
    const power=n.k*(calves?Math.max(transitionPower,(n.calfSide>0?state?.left:state?.right)??0):backPower);
    if(power<=.02)continue;
    const i=groundFxPlumesUsed++,fx=groundFxPlumes[i]||(groundFxPlumes[i]=GFX.plume(plumeSize));
    if(fx.group.parent!==body)body.add(fx.group);
    fx.group.position.fromArray(n.p);
    fx.group.quaternion.setFromUnitVectors(groundFxForward,groundWasPlumeDirection.fromArray(n.d));
    const width=Math.sqrt(Math.min(1,power));
    fx.group.scale.set(width,width,1);
    fx.update(now,power,length,detail);
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
  if(index!=null&&(!f.groundWasFlight?.dogfight||!t.alive||!t.bodies?.[index]?.alive))return;
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
    const thrust=body?.userData.wasThrust;
    const attitude=bodyFlight&&new THREE.Quaternion().setFromEuler(new THREE.Euler(
      air?-air.pitch:thrust?.pitch??0,bodyFlight.yaw,air?air.bank:thrust?.bank??0,'YXZ'));
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
    if(burst.start+burst.next*spacing>now){groundGatlingBursts[kept++]=burst;continue;}
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
function groundVisualLoss(f,at,i,showLoss=true){
  if(!groundVisuals||!groundFxSeen(f))return;
  const data=f.groundModel?.userData,body=data?.formation?.bodies[i];
  const was=body&&f.groundKind==='was',aircraft=body&&groundAirSquad(f);
  const vehicle=body&&groundWreckVehicles.has(f.groundKind);
  if(!was&&!aircraft&&!vehicle&&!showLoss)return;
  const positions=i===undefined?null:groundBodyPositions(f);
  at??=groundVisualBodyPoint(f,i,positions.positions[i]||positions.positions[0]);
  const yaw=positions?.yaws?.[i]??Math.atan2(f.heading?.x??0,f.heading?.z??1);
  // 飛んでいる W.A.S. の各機の飛行の記録がないとき（テストの置き方など）は、地上の崩れ落ちる演出にする
  if(was&&positions?.flight?.bodies?.[i]){
    const {wreck,low}=groundRuleSet().wasCombat.dogfight;
    const config=['low','high'].includes(f.band)?{...wreck,...low.wreck}:wreck;
    groundVisualWasWreck(at,body,data.special?.get('wasFly'),positions.flight.bodies[i],config);
    return;
  }
  if(aircraft&&positions?.air?.bodies?.[i]){
    groundVisualAircraftWreck(at,body,positions.air.bodies[i],f.groundKind==='supportAircraft');
    return;
  }
  if(was||vehicle){
    const movingPose=data.pose?.move[i]?.find(pose=>pose.visible);
    groundVisualLandWreck(at,movingPose||body,yaw,!!was);
    return;
  }
  const inAir=['low','high'].includes(f.band);
  groundFxAdd('direct',gameSec,inAir?1.5:.9,()=>groundFxPlace(inAir?GFX.airBurst(.55):GFX.hit(.28),at));
}

function groundWreckQueue(life,create){
  const start=gameSec;
  let endedAt,ageAtEnd;
  groundFxAdd('wreck',start,life,create,{elapsed:()=>{
    // 作戦が終わって時計が止まっても、落下と残骸の消失は最後まで描く。
    if(!over)return gameSec-start;
    if(endedAt===undefined){endedAt=performance.now();ageAtEnd=gameSec-start;}
    return ageAtEnd+(performance.now()-endedAt)/1000;
  }});
}
function groundWreckDetail(at,size){
  return groundFxDetail(at,size,groundRuleSet().wreckVisuals.detailPixels);
}
function groundWreckMaterial(source){
  const material=source.clone();
  material.color.setHex(0x393534);
  material.emissive.setHex(0x000000);
  material.opacity=1;
  material.transparent=true;
  return material;
}
function groundVisualLandWreck(at,body,yaw,was){
  const rules=groundRuleSet().wreckVisuals,config=was?rules.walkingWas:rules.vehicle,rnd=GFX.visualRandom;
  const {geometry,material:source}=body,scale=body.scale.clone(),size=scale.x;
  const aim=body.userData.aimParts,rig=aim?.rig;
  const aimYaw=aim?.parts?.parent?aim.yaw:0,aimEl=aim?.parts?.parent?aim.el:0;
  const heading=yaw+(!rig?.hasTurret?(aim?.parts?.rotation.y??0):0);
  const launch=rig?.hasTurret&&rnd()<config.turretChance;
  const side=rnd()<.5?-1:1,forward=rnd()<.5;
  const floor=groundSurfaceHeight(at.x,at.z)+.025;
  groundWreckQueue(config.lifeSec,()=>{
    const detail=groundWreckDetail(at,size*1.6);
    const detach=launch&&detail;
    const material=groundWreckMaterial(source),group=new THREE.Group();
    const wreck=new THREE.Mesh(geometry,material);
    wreck.position.copy(at);
    wreck.rotation.set(0,heading,0,'YXZ');
    wreck.scale.copy(scale);group.add(wreck);
    let turret,turretAt,turretLand,kneel,kneeBounds;
    if(was){
      kneel=groundWreckKneel??=groundShapeGeo('wasKneel');
      if(!kneel.boundingBox)kneel.computeBoundingBox();
      kneeBounds=kneel.boundingBox;
    }else if(rig&&(detach||aimYaw||aimEl)){
      // 現在の向き・仰角のまま車体を残し、吹き飛ぶときだけ砲塔を外す。
      const parts=groundVisualRigParts(wreck,rig);
      wreck.geometry=rig.hull;
      turret=parts.turret;turretAt=turret.position.clone();
      turret.rotation.y=rig.hasTurret?aimYaw:0;
      parts.gun.rotation.x=-aimEl;
      wreck.add(turret);
      if(detach){
        turretLand=turretAt.clone().add(new THREE.Vector3(side*1.7,0,-.55));
        turret.position.copy(turretLand);
        turret.rotation.set(0,aimYaw+side*2.2,side*.65);
        wreck.updateWorldMatrix(true,false);
        const foot=new THREE.Box3().setFromObject(turret).min.y;
        const world=wreck.localToWorld(turretLand.clone());
        turretLand.y+=(groundSurfaceHeight(world.x,world.z)+.03-foot)/scale.y;
      }
    }
    const flash=groundFxPlace(was?GFX.hit(size*.72,{detail}):GFX.airBurst(size*1.65,{detail,fireballSec:.24}),at);
    const burn=groundFxPlace(GFX.wreckBurn(size*(was?.8:1.2),detail),at);
    group.add(flash.group,burn.group);
    return {group,update(t){
      const opacity=THREE.MathUtils.clamp((config.lifeSec-t)/config.fadeSec,0,1);
      material.opacity=opacity;
      if(was){
        const u=Math.min(1,t/config.collapseSec);
        const drop=THREE.MathUtils.smoothstep(u,0,.45);
        const tilt=THREE.MathUtils.smoothstep(u,.26,1)*(forward?1.36:1.46);
        wreck.geometry=drop>.56?kneel:geometry;
        if(forward)wreck.rotation.x=tilt;
        else wreck.rotation.z=side*tilt;
        const edge=forward?kneeBounds.max.z:side>0?-kneeBounds.min.x:kneeBounds.max.x;
        const contact=floor+size*(edge*Math.sin(tilt)-kneeBounds.min.y*Math.cos(tilt));
        wreck.position.y=THREE.MathUtils.lerp(at.y,contact,drop);
        burn.group.position.y=wreck.position.y+size*.36*Math.cos(tilt);
      }else if(detach){
        const u=Math.min(1,t/config.turretFlightSec);
        turret.position.copy(turretAt).lerp(turretLand,u);
        turret.position.y+=4.8*u*(1-u);
        turret.rotation.set(Math.sin(Math.PI*u)*1.45,aimYaw+side*u*2.2,side*(.65*u+Math.sin(Math.PI*u)));
      }
      flash.group.visible=t<(was?.9:1.5);
      if(flash.group.visible)flash.update(t);
      burn.update(t,opacity);
      return true;
    }};
  });
}
function groundVisualWasWreck(at,body,geometry,flight,config){
  const rnd=GFX.visualRandom;
  const {lerp,clamp}=THREE.MathUtils,duration=lerp(...config.durationSec,rnd());
  const thrust=body.userData.wasThrust;
  const spin=(rnd()<.5?-1:1),initial={yaw:flight.yaw,pitch:thrust?.pitch??0,bank:thrust?.bank??0};
  const drift=flight.vel.clone().setY(0).multiplyScalar(duration*.55);
  drift.clampLength(.045*GROUND_SCALE,config.driftKm*GROUND_SCALE);
  if(!drift.lengthSq())drift.set(Math.sin(initial.yaw),0,Math.cos(initial.yaw)).multiplyScalar(.045*GROUND_SCALE);
  const height=Math.max(0,at.y-groundSurfaceHeight(at.x,at.z));
  const path=(t,out)=>{
    const u=clamp(t/duration,0,1);
    out.copy(at).addScaledVector(drift,u*(2-u));
    out.y=groundSurfaceHeight(out.x,out.z)+height*(1-u**1.8);
    return out;
  };
  const pose=(t,out)=>{
    const u=t/duration;
    return out.set(initial.pitch+u*1.25,initial.yaw+spin*u*.9,initial.bank+spin*u*2.6,'YXZ');
  };
  groundVisualAirWreck(body,geometry||body.geometry,config,{path,duration,pose});
}
function groundVisualAircraftWreck(at,body,flight,support){
  const rules=groundRuleSet().wreckVisuals,config=support?rules.support:rules.aircraft,rnd=GFX.visualRandom;
  const nominal=THREE.MathUtils.lerp(...config.durationSec,rnd()),spin=rnd()<.5?-1:1;
  const roll=support?1.05:rnd()<.5?4.4:.75;
  const velocity=flight.velocity.clone();
  if(!velocity.lengthSq()){
    const speed=flight.speed*Math.cos(flight.pitch);
    velocity.set(Math.sin(flight.yaw)*speed,flight.speed*Math.sin(flight.pitch),Math.cos(flight.yaw)*speed);
  }
  // Derive a visual fall from the impact-time velocity, then find its first contact with the terrain.
  const height=Math.max(.05,at.y-groundSurfaceHeight(at.x,at.z));
  const gravity=2*(height+Math.max(0,velocity.y)*nominal)/nominal**2;
  const {halfWidthWorld,halfHeightWorld}=groundDimensions();
  const edgeTime=Math.max(.025,Math.min(
    velocity.x?(halfWidthWorld-Math.sign(velocity.x)*at.x)/Math.abs(velocity.x):Infinity,
    velocity.z?(halfHeightWorld-Math.sign(velocity.z)*at.z)/Math.abs(velocity.z):Infinity));
  const path=(t,out)=>{
    // Preserve the initial speed and slow the wreck near a map edge so it can land on the map.
    const driftTime=edgeTime<nominal*2?edgeTime*Math.tanh(t/edgeTime):t;
    out.set(at.x+velocity.x*driftTime,at.y+velocity.y*t-gravity*t*t*.5,at.z+velocity.z*driftTime);
    return out;
  };
  const point=new THREE.Vector3(),clearance=t=>{
    path(t,point);
    return point.y-groundSurfaceHeight(point.x,point.z);
  };
  const max=nominal*1.5,checks=30;
  let before=0,duration=max;
  for(let i=1;i<=checks;i++){
    const t=max*i/checks;
    if(clearance(t)>0){before=t;continue;}
    duration=t;
    for(let j=0;j<6;j++){
      const middle=(before+duration)/2;
      if(clearance(middle)>0)before=middle;
      else duration=middle;
    }
    break;
  }
  const {pitch,yaw,bank}=flight;
  const pose=(t,out)=>{
    const u=t/duration;
    return out.set(-pitch+(support?.48:1.07)*u,yaw,bank+spin*roll*u,'YXZ');
  };
  const geometry=body.geometry;
  let wing;
  if(support){
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    const bounds=geometry.boundingBox;
    wing=new THREE.Vector3(spin*(bounds.max.x-bounds.min.x)*.3,0,0).multiply(body.scale);
  }
  const smokeSize=Math.max(body.scale.x,velocity.length()*config.smokeSec/config.smokePuffs*.5);
  groundVisualAirWreck(body,geometry,{...config,smokeSize},{path,duration,pose,wing});
}
function groundVisualAirWreck(body,geometry,config,{path,duration,pose,wing}){
  const {material:source}=body,scale=body.scale.clone(),point=new THREE.Vector3(),angle=new THREE.Euler();
  const at=path(0,new THREE.Vector3()),landing=path(duration,new THREE.Vector3());
  landing.y=groundSurfaceHeight(landing.x,landing.z)+.035;
  const trailPath=wing?(t,out)=>path(t,out).add(point.copy(wing).applyEuler(pose(t,angle))):path;
  groundWreckQueue(duration+config.smokeSec,()=>{
    const size=Math.max(.36,scale.x*1.15),detail=groundWreckDetail(at,wing?wing.length():size);
    const smokePuffs=detail?config.smokePuffs:groundRuleSet().wreckVisuals.farSmokePuffs;
    const group=new THREE.Group(),wreck=new THREE.Mesh(geometry,source.clone());
    wreck.scale.copy(scale);
    const trail=GFX.wreckTrail(size,trailPath,duration,{...config,smokePuffs});
    const impact=groundFxPlace(config.fragments?GFX.airBurst(config.impactSize,{detail,fireballSec:.22}):
      GFX.hit(config.impactSize,{detail}),landing);
    group.add(wreck,trail.group,impact.group);
    const fragments=detail&&config.fragments?groundWreckFragments(group,config.fragments,scale.x,duration,landing,trailPath,!!wing):null;
    return {group,update(t){
      wreck.visible=t<duration;impact.group.visible=!wreck.visible;
      if(wreck.visible){
        path(t,wreck.position);
        pose(t,wreck.rotation);
      }else impact.group.visible=impact.update(t-duration);
      trail.update(t);
      fragments?.(t);
      return true;
    }};
  });
}
function groundWreckFragments(group,count,size,duration,landing,path,inFlight){
  const rnd=GFX.visualRandom,geometry=groundWreckShard??=new THREE.TetrahedronGeometry(1);
  const n=count[0]+Math.floor(rnd()*(count[1]-count[0]+1)),fragments=[];
  const material=new THREE.MeshStandardMaterial({color:0x393535,roughness:.85});
  for(let i=0;i<n;i++){
    const start=inFlight?duration*(.3+.28*i):duration;
    const origin=inFlight?path(start,new THREE.Vector3()):landing;
    const a=rnd()*Math.PI*2,velocity=new THREE.Vector3(Math.cos(a),0,Math.sin(a)).multiplyScalar(size*3);
    if(inFlight)velocity.add(path(start+.05,new THREE.Vector3()).sub(origin).multiplyScalar(14));
    else velocity.y=size*(1.8+rnd());
    const shard=new THREE.Mesh(geometry,material);
    shard.scale.set(size*.24,size*.08,size*.16);group.add(shard);
    fragments.push({shard,origin,start,velocity});
  }
  return t=>{
    for(const {shard,origin,start,velocity} of fragments){
      const age=t-start;
      shard.visible=age>=0&&age<(inFlight?2.3:1.2);
      if(!shard.visible)continue;
      shard.position.copy(origin).addScaledVector(velocity,age);
      shard.position.y-=size*4*age*age;
      shard.visible=shard.position.y>=groundSurfaceHeight(shard.position.x,shard.position.z);
      shard.rotation.set(age*4,age*3,age*5);
    }
  };
}
