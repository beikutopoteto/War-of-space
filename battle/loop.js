/* War of Space battle: render loop and start-up.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- render loop ---------- */
let W=1,H=1;
function resize(){ W=innerWidth; H=innerHeight; renderer.setSize(W,H); camera.aspect=W/H; camera.fov=W<H?Math.min(78,50*Math.min(1.6,H/W)):50; camera.updateProjectionMatrix(); if(composer) composer.setSize(W,H); }
addEventListener('resize',resize); resize();

/* small craft in combat circle their target like electrons around a nucleus (drawing only; the battle still uses the wing's position).
   W.A.S. fly round orbits in tilted planes that slowly turn, so they swarm in three dimensions.
   Fighters only thrust forward: straight passes across the target, from one side of it to the other, turning sharply at each end. */
const _oq=new THREE.Quaternion(), _ou=new THREE.Vector3(), _ov=new THREE.Vector3(), _on=new THREE.Vector3(), _oa=new THREE.Vector3(), _ob=new THREE.Vector3();
const hash=(a,b,c)=>{ const x=Math.sin(a*12.9898+b*78.233+c*37.719)*43758.5453; return (x-Math.floor(x))*2-1; };
function craftOrbit(w,s,t,out){
  if(!s.orb){ const r=()=>Math.random(); s.orb={seed:r()*1000, ax:new THREE.Vector3(r()-.5,r()-.5,r()-.5).normalize(), tilt:new THREE.Vector3(r()-.5,r()-.5,r()-.5).normalize(),
    rad:(t.radius||3)+w.range*(w.type==='was'?.7+r()*.6:.9+r()*.5), ph:r()*Math.PI*2, dir:r()<.5?-1:1}; }
  const o=s.orb, R=o.rad, T=gameSec;
  _on.copy(o.ax).applyQuaternion(_oq.setFromAxisAngle(o.tilt,T*.25+o.ph));   // the orbit's axis turns slowly
  if(w.type==='was'){
    _ou.set(0,1,0).cross(_on); if(_ou.lengthSq()<1e-4) _ou.set(1,0,0); _ou.normalize(); _ov.crossVectors(_on,_ou);
    const th=o.ph+o.dir*T*w.W.speed*.6/R;
    out.copy(t.pos).addScaledVector(_ou,Math.cos(th)*R).addScaledVector(_ov,Math.sin(th)*R).addScaledVector(_on,Math.sin(th*2+o.ph)*R*.3);
  } else {
    const D=2*R/(w.W.speed*.8), x=T/D+o.ph, i=Math.floor(x), f=x-i;
    const end=(j,v)=>v.set(hash(o.seed,j,1),hash(o.seed,j,2),hash(o.seed,j,3)).multiplyScalar(.7).addScaledVector(_on,j%2?-1:1).normalize().multiplyScalar(R);
    end(i,_oa); end(i+1,_ob); out.copy(t.pos).add(_oa.lerp(_ob,f));
  }
  return out;
}
const o3=new THREE.Object3D(), up=new THREE.Vector3(0,1,0);
let last=performance.now(), time=0, rosterTick=0;
function frame(now){
  const rdt=Math.min(.05,(now-last)/1000); last=now; time+=rdt;
  const dt=(over||menuOpen||talking)?0:rdt*speed; controls.autoRotate=menuOpen;
  if(dt>0) step(dt);
  // ships
  for(const t of [0,1]){ for(const m of Object.values(shipMeshes[t])) m.count=0; for(const m of Object.values(craftMeshes[t])) m.count=0; }
  for(const f of fleets){ if(!f.alive) continue; const hide=!shown(f);
    const k=1-Math.exp(-(dt>0?dt:0)*2.5); _oq.setFromAxisAngle(up,Math.atan2(f.heading.x,f.heading.z));   // the formation turns with the heading
    for(const s of f.ships){
      _w.copy(s.off).applyQuaternion(_oq).add(f.pos); _w.y+=Math.sin(time*.8+s.wob)*.35;
      s.pos.lerp(_w,dt>0?k:0);
      if(hide) continue;
      const m=shipMeshes[f.team][s.type]; if(m.count>=SHIP_MAX) continue;
      o3.position.copy(s.pos); o3.lookAt(_v.copy(s.pos).add(f.heading)); o3.scale.setScalar(SHIP_SIZE[s.type]||f.scale); o3.updateMatrix(); m.setMatrixAt(m.count++,o3.matrix);
    }
  }
  let trV=0;   // vertices of craft trails written this frame
  for(const w of wings){ if(!w.alive) continue;
    const t=w.state==='attack'?w.target:null, orbit=t&&t.alive&&w.pos.distanceTo(t.pos)<=w.range*.6+(t.radius||0)+3;
    const k=1-Math.exp(-(dt>0?dt:0)*(orbit?4:5)), hide=!shown(w);
    for(const s of w.ships){
      if(orbit) craftOrbit(w,s,t,_w); else { _w.copy(w.pos).add(s.off); _w.x+=Math.sin(time*1.7+s.wob)*.6; _w.y+=Math.cos(time*1.3+s.wob)*.4; }
      if(!s.hd) s.hd=w.heading.clone();
      if(dt>0){ _v.copy(s.pos); s.pos.lerp(_w,k); _v.subVectors(s.pos,_v); const d=_v.length();
        if(orbit&&d>1e-4) s.hd.lerp(_v.multiplyScalar(1/d),Math.min(1,dt*10)).normalize(); else if(!orbit) s.hd.lerp(w.heading,Math.min(1,dt*4)).normalize(); }
      if(!s.tr){ s.tr=[]; s.trT=0; }
      if(dt>0){ s.trT+=dt; if(s.trT>=TRAIL_DT){ s.trT=0; s.tr.unshift(s.pos.clone()); if(s.tr.length>TRAIL_N) s.tr.pop(); }
        if(w.type==='was'&&!hide&&Math.random()<dt*.5) sparks.burst(_v.copy(s.hd).multiplyScalar(-.3).add(s.pos),TEAM_COL[w.team],3,2,.3); }
      if(hide) continue;
      if(trV+TRAIL_N*2<=trPos.length/3){ const c=trailCol[w.team][w.type]||trailCol[w.team].ftr; let p=s.pos;
        for(let j=0;j<s.tr.length;j++){ const q=s.tr[j], k0=1-j/TRAIL_N, k1=1-(j+1)/TRAIL_N;
          trPos.set([p.x,p.y,p.z,q.x,q.y,q.z],trV*3); trCol.set([c.r*k0,c.g*k0,c.b*k0,c.r*k1,c.g*k1,c.b*k1],trV*3); trV+=2; p=q; } }
      const m=craftMeshes[w.team][w.type]||craftMeshes[w.team].ftr; if(m.count>=CRAFT_MAX) continue;
      o3.position.copy(s.pos); o3.lookAt(_v.copy(s.pos).add(s.hd)); o3.scale.setScalar(1); o3.updateMatrix(); m.setMatrixAt(m.count++,o3.matrix);
    }
  }
  trGeo.setDrawRange(0,trV); trGeo.attributes.position.needsUpdate=true; trGeo.attributes.color.needsUpdate=true;
  for(const t of [0,1]){ for(const m of Object.values(shipMeshes[t])) m.instanceMatrix.needsUpdate=true; for(const m of Object.values(craftMeshes[t])) m.instanceMatrix.needsUpdate=true; }
  stepParticles(rdt*(speed||1)); stepTracers(dt>0?dt:0);
  fortressObj.rotation.y+=rdt*.04;
  gridMat.uniforms.uTime.value=time;
  /* the grid follows a moving field; its squares stay put in space. A cloud the camera is inside fades so it does not cover the view */
  grid.position.set(fieldC.x,0,fieldC.z); gridMat.uniforms.uC.value.set(fieldC.x,-fieldC.z);
  for(const c of clouds){ c.mat.uniforms.uTime.value=time; c.mat.uniforms.uOp.value=camera.position.distanceTo(c.c)<c.r*1.1?.25:1; }
  for(const ar of [...arrows]){
    ar.mat.uniforms.uTime.value=time;
    if(ar.life!==Infinity){ ar.age+=dt>0?dt:0; ar.mat.uniforms.uOp.value=Math.max(0,1-ar.age/ar.life); if(ar.age>=ar.life) dropArrow(ar); }
  }
  for(const f of fleets){ if(f.alive&&f.arrow&&f.order&&f.order.type==='move'&&f.order.path){ const p=f.order.path; f.arrow.mat.uniforms.uCut.value=Math.max(0,Math.min(.9,p.s/p.L)); } }
  /* an own fleet chasing its target keeps an arrow that follows the target; it goes away once the target is in range */
  for(const f of fleets){ if(!f.alive||f.team!==0||!f.order||f.order.type!=='attack') continue;
    const t=f.order.target, chasing=t.alive&&t.seen&&gap(f,t)>f.range;
    if(!chasing){ if(f.arrow){ dropArrow(f.arrow); f.arrow=null; } continue; }
    if(!f.arrow||f.arrow.from.distanceTo(f.pos)>1||f.arrow.to.distanceTo(t.pos)>1){
      dropArrow(f.arrow); f.arrow=makeArrow(f.pos,t.pos,TEAM_COL[0]); if(f.arrow){ f.arrow.from=f.pos.clone(); f.arrow.to=t.pos.clone(); } } }
  // selection visuals
  if(selected&&selected.alive){ selRing.visible=rangeRing.visible=true; const R=Math.sqrt(selected.ships.length)*1.35*selected.scale+2.5;
    selRing.position.set(selected.pos.x,selected.pos.y,selected.pos.z); selRing.scale.setScalar(R*(1+.05*Math.sin(time*4)));
    rangeRing.position.set(selected.pos.x,selected.pos.y,selected.pos.z); rangeRing.scale.setScalar(Math.max(selected.range,selected.launchR||0));
    sightRing.visible=true; sightRing.position.copy(selected.pos); sightRing.scale.setScalar(sightOf(selected)*concealOf({stl:5}));
    layer.visible=true; layer.position.set(selected.pos.x,selAlt,selected.pos.z); layerMat.uniforms.uTime.value=time; }
  else selRing.visible=rangeRing.visible=sightRing.visible=layer.visible=false;
  updateStalks();

  stepCam(rdt); rotateByKeys(rdt); panCamera(rdt);
  controls.update();
  if(composer) composer.render(); else renderer.render(scene,camera);

  // labels
  for(const u of units()){ if(!u.alive||!u.el) continue;
    const lost=!shown(u), at=lost?u.lastPos:u.pos;
    if(lost&&(!at||gameSec-u.lostAt>LOST_MEMORY)){ u.el.style.visibility='hidden'; continue; }
    if(u.el.classList.contains('lost')!==lost){ u.el.classList.toggle('lost',lost); u._sub=null; }
    const s=proj(_v.copy(at).add(_w.set(0,u.kind==='fortress'?7:4,0)));
    if(s.z>1||s.x<-60||s.x>W+60||s.y<-60||s.y>H+60){u.el.style.visibility='hidden';continue;}
    u.el.style.visibility='visible'; u.el.style.transform=`translate(${s.x}px,${s.y}px)`;
    const sub=lost?`最終確認位置　<span class="num">${Math.round(gameSec-u.lostAt)}秒前</span>`:u.kind==='fortress'?`装甲 <span class="num">${Math.max(0,Math.ceil(100*u.hpPool/u.max))}%</span>`:subText(u);
    if(u._sub!==sub){u._sub=sub; u.el.querySelector('.flag span').innerHTML=sub;}
  }
  for(const s of sectors){ const p=proj(s.pos); s.el.style.visibility=p.z>1?'hidden':'visible'; s.el.style.transform=`translate(${p.x}px,${p.y}px) translate(0,-100%)`; }
  document.getElementById('date').textContent=dateStr()+'　'+clockStr();
  rosterTick-=rdt; if(rosterTick<=0){rosterTick=.25; updateRoster(); updateGoal();}
  requestAnimationFrame(frame);
}
reset();
requestAnimationFrame(frame);
