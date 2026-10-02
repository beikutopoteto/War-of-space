/* War of Space battle: render loop and start-up.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- render loop ---------- */
let W=1,H=1;
function resize(){ W=innerWidth; H=innerHeight; renderer.setSize(W,H); camera.aspect=W/H; camera.fov=W<H?Math.min(78,50*Math.min(1.6,H/W)):50; camera.updateProjectionMatrix(); if(composer) composer.setSize(W,H); }
addEventListener('resize',resize); resize();

const o3=new THREE.Object3D(), up=new THREE.Vector3(0,1,0);
let last=performance.now(), time=0, rosterTick=0;
function frame(now){
  const rdt=Math.min(.05,(now-last)/1000); last=now; time+=rdt;
  const dt=(over||menuOpen)?0:rdt*speed; controls.autoRotate=menuOpen;
  if(dt>0) step(dt);
  // ships
  const cnt=[0,0];
  for(const f of fleets){ if(!f.alive) continue; const hide=!shown(f);
    const k=1-Math.exp(-(dt>0?dt:0)*2.5);
    for(const s of f.ships){
      _w.copy(f.pos).add(s.off); _w.y+=Math.sin(time*.8+s.wob)*.35;
      s.pos.lerp(_w,dt>0?k:0);
      if(hide) continue;
      const m=shipMeshes[f.team], i=cnt[f.team]++; if(i>=600) continue;
      o3.position.copy(s.pos); o3.lookAt(_v.copy(s.pos).add(f.heading)); o3.scale.setScalar(f.scale); o3.updateMatrix(); m.setMatrixAt(i,o3.matrix);
    }
  }
  shipMeshes.forEach((m,t)=>{m.count=cnt[t];m.instanceMatrix.needsUpdate=true;});
  const cc=[0,0];
  for(const w of wings){ if(!w.alive||!shown(w)) continue;
    const k=1-Math.exp(-(dt>0?dt:0)*5);
    for(const s of w.ships){
      _w.copy(w.pos).add(s.off); _w.x+=Math.sin(time*1.7+s.wob)*.6; _w.y+=Math.cos(time*1.3+s.wob)*.4;
      s.pos.lerp(_w,dt>0?k:0);
      const m=craftMeshes[w.team], i=cc[w.team]++; if(i>=1500) continue;
      o3.position.copy(s.pos); o3.lookAt(_v.copy(s.pos).add(w.heading)); o3.scale.setScalar(1); o3.updateMatrix(); m.setMatrixAt(i,o3.matrix);
    }
  }
  craftMeshes.forEach((m,t)=>{m.count=cc[t];m.instanceMatrix.needsUpdate=true;});
  stepParticles(rdt*(speed||1)*(over?1:1)); stepTracers(dt>0?dt:0);
  fortressObj.rotation.y+=rdt*.04;
  gridMat.uniforms.uTime.value=time;
  for(const ar of [...arrows]){
    ar.mat.uniforms.uTime.value=time;
    if(ar.life!==Infinity){ ar.age+=dt>0?dt:0; ar.mat.uniforms.uOp.value=Math.max(0,1-ar.age/ar.life); if(ar.age>=ar.life) dropArrow(ar); }
  }
  for(const f of fleets){ if(f.alive&&f.arrow&&f.order&&f.order.type==='move'){ const rem=f.pos.distanceTo(f.arrow.to); f.arrow.mat.uniforms.uCut.value=Math.max(0,Math.min(.9,1-rem/f.arrow.len)); } }
  // selection visuals
  if(selected&&selected.alive){ selRing.visible=rangeRing.visible=true; const R=Math.sqrt(selected.ships.length)*1.35*selected.scale+2.5;
    selRing.position.set(selected.pos.x,selected.pos.y,selected.pos.z); selRing.scale.setScalar(R*(1+.05*Math.sin(time*4)));
    rangeRing.position.set(selected.pos.x,selected.pos.y,selected.pos.z); rangeRing.scale.setScalar(Math.max(selected.range,selected.launchR||0));
    sightRing.visible=true; sightRing.position.copy(selected.pos); sightRing.scale.setScalar(sightOf(selected)*concealOf({stl:5}));
    layer.visible=true; layer.position.set(selected.pos.x,selAlt,selected.pos.z); layerMat.uniforms.uTime.value=time; }
  else selRing.visible=rangeRing.visible=sightRing.visible=layer.visible=false;
  updateStalks();

  stepCam(rdt); rotateByKeys(rdt); panCamera(rdt);
  controls.update(); syncCamBars();
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
  document.getElementById('date').textContent='宙暦0412.07.18　'+clockStr();
  rosterTick-=rdt; if(rosterTick<=0){rosterTick=.25; updateRoster();}
  requestAnimationFrame(frame);
}
reset();
requestAnimationFrame(frame);
