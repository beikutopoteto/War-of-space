/* Ground-battle presentation. Positions here are in groundVisuals coordinates.
   A shot records only drawing state. The simulation still owns firing, flight, hits and movement. */
const GROUND_FX_LIMIT={direct:48,flight:48,blast:8,plumes:24}; // 同時表示数は仮
const groundFxQueues={direct:[],flight:[],blast:[]},groundFxPlumes=[];
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
  groundFxPlumesUsed=0;
}
function groundFxAdd(type,start,life,create,options={}){
  if(!groundVisuals)return;
  const queue=groundFxQueues[type];
  if(queue.length===GROUND_FX_LIMIT[type])groundFxRelease(queue.shift().fx);
  queue.push({start,life,create,fx:null,...options});
}
function groundFxDraw(now){
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
function groundVisualRigDraw(body,aim,heading,moving){
  const state=body.userData.aimParts;
  if(!aim){
    if(state.parts?.parent){body.remove(state.parts);body.layers.enable(0);}
    return;
  }
  if(!state.parts)Object.assign(state,groundVisualRigParts(body,state.rig));
  const {parts,turret,gun,rig}=state;
  if(!parts.parent){body.layers.disable(0);body.add(parts);}
  const yaw=aim.yaw-heading-body.rotation.y;
  gun.rotation.x=-aim.el;
  turret.rotation.y=rig.hasTurret?yaw:0;
  // The fixed launcher turns its displayed chassis when stopped. The track still owns moving bodies.
  parts.rotation.y=!rig.hasTurret&&!moving?yaw:0;
}
function groundWasVisualPose(f,shot,moving,guard){
  if(f.bandTo)return groundBandHeight(f.bandTo)>groundBandHeight(f.band)?'wasFlyUp':'wasFlyDown';
  if(f.band==='ground')return shot?'wasFire':null;
  if(shot)return 'wasFlyFire';
  return moving?(guard?'wasFlyMove':'wasFlyMarch'):'wasFly';
}
function groundWasPlume(body,key,now){
  const nozzles=body.geometry.userData.nozzles;
  if(!nozzles||groundFxPlumesUsed+nozzles.length>GROUND_FX_LIMIT.plumes)return;
  for(const n of nozzles){
    const i=groundFxPlumesUsed++,fx=groundFxPlumes[i]||(groundFxPlumes[i]=GFX.plume(.52));
    if(fx.group.parent!==body)body.add(fx.group);
    fx.group.position.fromArray(n.p);
    fx.group.quaternion.setFromUnitVectors(groundFxForward,new THREE.Vector3().fromArray(n.d));
    fx.update(now,groundWasPower[key]*n.k);
  }
}
// The ground lift is shared with groundDraw. For aircraft with centred hit tests,
// use the displayed body offsets for the picture of the shot.
function groundVisualBodyPoint(f,i,p){
  const at=p.clone();
  if(f.band==='ground')at.y+=.15;
  const body=f.groundModel?.userData.formation?.bodies[i];
  if(body&&f.bodies0>1&&groundBodyCentered(f))at.add(body.position.clone().applyAxisAngle(groundFxUp,Math.atan2(f.heading.x,f.heading.z)));
  return at;
}
function groundVisualAim(f,i,from,to,{missile=false,indirect=false}={}){
  const data=f.groundModel?.userData,spec=f.groundBodySpec,rig=data?.rig,form=data?.formation;
  const groundMove=!!f.groundTrack?.moving[i],base=groundVisualBodyPoint(f,i,from),size=spec?.body??spec?.size??1;
  const heading=f.heading?Math.atan2(f.heading.x,f.heading.z):0;
  const body=form?.bodies[i],relativeYaw=body?.userData.baseYaw??body?.rotation.y??0;
  const bodyYaw=groundBodyPositions(f).yaws?.[i]??heading+relativeYaw;
  let yaw=Math.atan2(to.x-base.x,to.z-base.z),el=0,muzzle,direction;
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
    const local=(pose||move?.geometry||data?.pose?.rest||body?.geometry)?.userData.muzzle;
    const muzzleYaw=pose&&(key==='hinfMsl'||key==='wasFire'||key==='wasFlyFire')?yaw:bodyYaw;
    muzzle=local?new THREE.Vector3().fromArray(local).multiplyScalar(size).applyAxisAngle(groundFxUp,muzzleYaw).add(base):
      base.add(new THREE.Vector3(Math.sin(bodyYaw)*size*.5,f.band==='ground'?size*.4:0,Math.cos(bodyYaw)*size*.5));
    direction=to.clone().sub(muzzle).normalize();
  }
  if((rig||data?.special?.size)&&f.bodies?.[i])f.bodies[i].look={yaw,el,missile,until:gameSec+(indirect?.7:1.05)};
  return {muzzle,direction};
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
function groundVisualDirect(f,i,t,j,from,to,aa=false){
  if(!groundVisuals)return;
  const seen=groundFxSeen(f),seenTarget=groundFxSeen(t);
  if(!seen&&!seenTarget)return;
  const at=groundVisualBodyPoint(t,j,to);
  if(t.band==='ground')at.y+=(t.groundBodySpec?.body??.4)*.5;
  const missile=f.groundKind==='heavyInfantry'&&(aa||t.groundKind==='vehicle');
  const tank=f.groundKind==='vehicle'?GFX.tank:null,duration=tank?.duration??.25;
  const size=missile?.14:f.groundKind==='was'?.17:f.groundModel?.userData.rig?.13:.085;
  if(seen){
    const shot=groundVisualAim(f,i,from,at,{missile});
    groundVisualMuzzle(shot,tank?tank.muzzleSize*GROUND_BODY_SCALE:size,tank?.muzzleOptions);
    if(seenTarget){
      const path=u=>shot.muzzle.clone().lerp(at,u);
      const tracerSize=tank?tank.tracerSize*GROUND_BODY_SCALE:size;
      groundFxAdd('direct',gameSec,missile?duration+1.4:duration,()=>GFX.shot(path,duration,missile?'rocket':'tracer',tracerSize));
    }
  }
  if(seenTarget){
    const start=gameSec+duration,airborne=groundAATargetable(t);
    if(tank&&t.band==='ground'&&!airborne)groundVisualDust(at,tank.impactRadius*GROUND_BODY_SCALE,start,tank.impactSmoke);
    else groundFxAdd('direct',start,airborne?1.5:.9,()=>groundFxPlace(
      airborne?GFX.airBurst(size*4):GFX.hit(size*1.8,{detail:groundFxDetail(at,size*2,5)}),at));
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
  const tail=projectile==='rocket'?1.4:0;
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
function groundVisualLoss(f,at){
  if(!groundVisuals||!groundFxSeen(f))return;
  const inAir=['low','high'].includes(f.band);
  groundFxAdd('direct',gameSec,inAir?1.5:.9,()=>groundFxPlace(inAir?GFX.airBurst(.55):GFX.hit(.28),at));
}
