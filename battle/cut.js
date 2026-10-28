/* War of Space battle: still scenes shown behind the talk (第6節, user decision 2026-10-28: 見本の案A, three pictures as the lines go).
   A talk line may carry a scene key as its fourth element (hud.js nextTalk): the scene stays until another key, 'none', or the talk ends.
   Each scene is its own small THREE.Scene drawn instead of the battle (loop.js), with a slow camera drift and moving dust; no HUD over it.
   approach: 22:00, from behind Denali, Februaria filling the sky ahead. graze: 23:00, Denali scraping Februaria's rim, rock and hot dust.
   split: Denali in three pieces in a cloud of rock, heading for the Earth far off. Sizes are the true ratio (Februaria 40×20×16 km,
   Denali 3 km, its shape from the operation's body), everything else 仮 */
let cutOn=null, cutT=0, cutBuilt=null;
const cutCam=new THREE.PerspectiveCamera(40,1,.01,3000);
function cutBuild(){ if(cutBuilt) return cutBuilt;
  const cs=new THREE.Scene(); cs.background=new THREE.Color(0x020409);
  const sunD=new THREE.Vector3(-.6,.35,.7).normalize(), sl=new THREE.DirectionalLight(0xfff4e6,2.2); sl.position.copy(sunD); cs.add(sl); cs.add(new THREE.AmbientLight(0x30384a,.35));
  { const g=new THREE.BufferGeometry(), p=[]; for(let i=0;i<2500;i++){ const v=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize().multiplyScalar(900); p.push(v.x,v.y,v.z); }
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3)); cs.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xc8d4ff,size:1.2,sizeAttenuation:false}))); }
  const noise=(x,y,z)=>{ let v=0,a=.5,f=1; for(let o=0;o<6;o++){ v+=a*Math.sin(x*f*1.7+y*f*.3+o)*Math.cos(y*f*2.1-z*f*.7+o*2.3)+a*.5*Math.sin(z*f*3.3+x*f*1.1-o); a*=.5; f*=2.1; } return v; };
  const rock=(sx,sy,sz,seed,det,col)=>{ const g=new THREE.IcosahedronGeometry(1,det), a=g.attributes.position, v=new THREE.Vector3();
    for(let i=0;i<a.count;i++){ v.fromBufferAttribute(a,i); v.multiplyScalar(1+.18*noise(v.x*2+seed,v.y*2,v.z*2-seed)); a.setXYZ(i,v.x*sx,v.y*sy,v.z*sz); }
    g.computeVertexNormals(); return new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:col,roughness:1,flatShading:true})); };
  /* dust: points thrown from c along dir (spread, out to len); they drift on along their own way (cutTick) */
  const dust=(c,dir,n,col,spread,len,size)=>{ const g=new THREE.BufferGeometry(), p=[], d=[], w=new THREE.Vector3();
    for(let i=0;i<n;i++){ w.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(spread).add(dir).normalize(); const t=Math.pow(Math.random(),.7)*len;
      p.push(c.x+w.x*t,c.y+w.y*t,c.z+w.z*t); d.push(w.x*t*.02,w.y*t*.02,w.z*t*.02); }
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3)); const m=new THREE.Points(g,new THREE.PointsMaterial({color:col,size,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));
    m.userData.v=d; return m; };
  const glow=(pos,s,col)=>{ const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d'), gr=x.createRadialGradient(64,64,0,64,64,64);
    gr.addColorStop(0,col); gr.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=gr; x.fillRect(0,0,128,128);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true})); sp.position.copy(pos); sp.scale.set(s,s,1); return sp; };
  const feb=rock(20,10,8,1.3,48,0x6d6a66); feb.rotation.set(.3,.9,.2); cs.add(feb); feb.updateMatrixWorld();
  const denGeo=bodyShape?bodyShape.geo:new THREE.IcosahedronGeometry(33,4), denMat=new THREE.MeshStandardMaterial({color:0x4a4440,roughness:1,flatShading:true});
  const den=()=>{ const m=new THREE.Mesh(denGeo,denMat); m.scale.setScalar(1.5/33); return m; };
  /* the rim point Denali grazes (the end of Februaria's long axis), the way it came, the way it goes after, and the side to look from */
  const Y=new THREE.Vector3(0,1,0), rim=new THREE.Vector3(19.5,3,0).applyMatrix4(feb.matrixWorld), path=new THREE.Vector3(0,-.15,1).applyAxisAngle(Y,.9).normalize();
  const side=new THREE.Vector3().crossVectors(path,Y).normalize(), away=path.clone().applyAxisAngle(Y,-.5).add(new THREE.Vector3(0,-.12,0)).normalize();
  const S={};
  { const g=new THREE.Group(), d=den(); d.position.copy(rim).addScaledVector(path,-14).add(new THREE.Vector3(0,1.6,0)); g.add(d);
    S.approach={g, cam:d.position.clone().addScaledVector(path,-6).add(new THREE.Vector3(1.2,1.2,0)), look:rim.clone().add(new THREE.Vector3(-4,-1,0)), drift:path.clone().multiplyScalar(.25), spin:[d,.02]}; }
  { const g=new THREE.Group(), d=den(); d.position.copy(rim).add(new THREE.Vector3(0,1.4,0)); d.rotation.set(.4,.2,.7); g.add(d);
    g.add(dust(rim.clone().add(new THREE.Vector3(0,1,0)),path.clone().add(new THREE.Vector3(0,.6,0)),1500,0xb9a99a,1.4,9,.09), dust(rim,path,500,0xff9a50,.8,4,.12), glow(rim.clone().add(new THREE.Vector3(0,.6,0)),5,'rgba(255,170,90,.9)'));
    S.graze={g, cam:rim.clone().addScaledVector(side,-22).add(new THREE.Vector3(0,6,0)).addScaledVector(path,-6), look:rim.clone(), drift:side.clone().multiplyScalar(.15), spin:[d,.05]}; }
  { const g=new THREE.Group(), e=new THREE.Mesh(new THREE.SphereGeometry(1,64,32),skyMat(0)); e.material.uniforms.uSun.value.copy(sunD); e.scale.setScalar(12); e.position.copy(rim).addScaledVector(away,420); g.add(e);
    const P=[[1.1,.9,.8,0],[.8,.7,.6,3],[.55,.45,.5,6]].map(([a,b,c,s],i)=>{ const m=rock(a,b,c,s+2,16,0x4d4743); m.position.copy(rim).addScaledVector(away,9+i*2.2).add(new THREE.Vector3((i-1)*2.2,i%2?.9:-.6,(1-i)*.8)); m.rotation.set(i,i*2,i*.5); g.add(m); return m; });
    g.add(dust(rim.clone().addScaledVector(away,6),away,1800,0xa89d92,1.1,14,.06));
    S.split={g, cam:rim.clone().addScaledVector(away,-3).addScaledVector(side,-9).add(new THREE.Vector3(0,3.5,0)), look:rim.clone().addScaledVector(away,16), drift:away.clone().multiplyScalar(.3), spin:[P[0],.03], move:P.map((m,i)=>[m,away.clone().multiplyScalar(.12+.03*i)])}; }
  for(const k in S){ S[k].g.visible=false; cs.add(S[k].g); }
  return cutBuilt={cs,S};
}
/* show a scene (or none: back to the battle) */
function showCut(k){ if(k===undefined) return; const B=k&&k!=='none'?cutBuild():cutBuilt;
  if(B) for(const n in B.S) B.S[n].g.visible=n===k;
  cutOn=B&&B.S[k]?k:null; cutT=0; document.body.classList.toggle('incut',!!cutOn); }
/* each frame while a scene is on: the camera drifts, the dust and the pieces move on */
function cutTick(dt){ if(!cutOn) return; const C=cutBuilt.S[cutOn]; cutT+=dt;
  cutCam.aspect=W/H; cutCam.updateProjectionMatrix(); cutCam.position.copy(C.cam).addScaledVector(C.drift,cutT); cutCam.lookAt(C.look);
  if(C.spin) C.spin[0].rotation.y+=C.spin[1]*dt;
  for(const [m,v] of C.move||[]) m.position.addScaledVector(v,dt);
  C.g.traverse(o=>{ const v=o.userData&&o.userData.v; if(!v) return; const a=o.geometry.attributes.position; for(let i=0;i<a.count;i++) a.setXYZ(i,a.getX(i)+v[i*3]*dt,a.getY(i)+v[i*3+1]*dt,a.getZ(i)+v[i*3+2]*dt); a.needsUpdate=true; });
  renderer.render(cutBuilt.cs,cutCam); }
