(() => {
/* while the menu is open the battle is paused and its keyboard shortcuts are off */
let menuOpen=true; document.body.classList.add('inmenu');
addEventListener('keydown',e=>{ if(menuOpen) e.stopImmediatePropagation(); },true);
const EMB = [
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 18.5 17h-13Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><ellipse cx="12" cy="13.5" rx="10" ry="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.4 6.6 7 .5-5.4 4.4 1.8 6.9L12 17l-5.8 3.9L8 14 2.6 9.6l7-.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12.4" r="2.1" fill="currentColor"/></svg>'
];
document.getElementById('lg0').innerHTML = EMB[0];
document.getElementById('lg1').innerHTML = EMB[1];
const TEAM_COL = [new THREE.Color(0x7fc8ff), new THREE.Color(0xff6a45)];
const TEAM_NAME = ['地球連合','惑星共和国'];

/* ---------- renderer / scene ---------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05080f);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 3000);
const CAM0=new THREE.Vector3(55, 72, 175);
camera.position.copy(CAM0);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0,0,24);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 35; controls.maxDistance = 330;
controls.maxPolarAngle = Math.PI-0.12;
controls.screenSpacePanning = false;

scene.add(new THREE.AmbientLight(0x3a4a66, 0.9));
const sun = new THREE.DirectionalLight(0xffe2c0, 1.6); sun.position.set(120,80,40); scene.add(sun);
const rim = new THREE.DirectionalLight(0x6fa8ff, 0.7); rim.position.set(-100,30,-120); scene.add(rim);

let composer = null;
try {
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(512,512), 0.85, 0.45, 0.55));
} catch(e){ composer = null; }

/* stars */
{
  const n=3500, p=new Float32Array(n*3), c=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const v=new THREE.Vector3().randomDirection ? new THREE.Vector3().randomDirection() : new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize();
    v.multiplyScalar(1200+Math.random()*400); p.set([v.x,v.y,v.z],i*3);
    const b=.35+Math.random()*.65, w=Math.random(); c.set([b*(.85+.15*w),b*.9,b*(1-.1*w)+.1],i*3);
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3)); g.setAttribute('color',new THREE.BufferAttribute(c,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.6,sizeAttenuation:false,vertexColors:true})));
}
/* distant planet */
{
  const pl=new THREE.Mesh(new THREE.SphereGeometry(260,64,48), new THREE.MeshStandardMaterial({color:0x2c5d8f,roughness:.9,emissive:0x0b1830}));
  pl.position.set(520,-120,-900); scene.add(pl);
  const halo=new THREE.Mesh(new THREE.SphereGeometry(272,64,48), new THREE.ShaderMaterial({
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.BackSide,
    vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.-abs(dot(vN,vV)),3.);gl_FragColor=vec4(vec3(.45,.75,1.)*f*1.2,f);}'
  }));
  halo.position.copy(pl.position); scene.add(halo);
}

/* tactical grid plane */
const gridMat = new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, extensions:{derivatives:true},
  uniforms:{uTime:{value:0}},
  vertexShader:'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`
    varying vec2 vP; uniform float uTime;
    float ln(float x,float w){float d=abs(fract(x-.5)-.5)/max(fwidth(x),1e-4);return 1.-min(d/w,1.);}
    void main(){
      float r=length(vP);
      float sq=max(ln(vP.x/10.,1.),ln(vP.y/10.,1.))*.16;
      float ring=(r<161.)?ln(r/20.,1.6)*.75:0.;
      float ang=atan(vP.y,vP.x)/6.2831853*12.;
      float rad=ln(ang,1.3)*.45*smoothstep(9.,14.,r);
      float fade=1.-smoothstep(130.,260.,r);
      vec3 cyan=vec3(.5,.8,1.);
      vec3 col=cyan; float a=max(sq,max(ring,rad))*fade;
      float zone=1.-smoothstep(39.6,40.,r);
      float edge=ln(r/40.,2.2)*step(30.,r)*step(r,50.);
      col=mix(col,vec3(1.,.42,.3),zone*.85);
      a=max(a,zone*.13);
      a+=edge*(.9+.1*sin(uTime*2.));
      col=mix(col,vec3(1.,.45,.32),edge);
      gl_FragColor=vec4(col*1.15,a*.95);
    }`
});
gridMat.side=THREE.DoubleSide;
const grid = new THREE.Mesh(new THREE.PlaneGeometry(560,560), gridMat);
grid.rotation.x = -Math.PI/2; scene.add(grid);

/* fortress asteroid */
function rock(radius, detail, seed, squash){
  const g=new THREE.IcosahedronGeometry(radius,detail), pos=g.attributes.position, v=new THREE.Vector3();
  const h=(x,y,z)=>{const s=Math.sin(x*127.1+y*311.7+z*74.7+seed)*43758.5453;return s-Math.floor(s);};
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i); const d=v.clone().normalize();
    let k=1+.16*Math.sin(3.1*d.x+seed)*Math.sin(2.7*d.y+1.3*seed)*Math.cos(2.2*d.z)
          +.09*Math.sin(7*d.x+2*d.z+seed)*Math.sin(6*d.y)
          +.05*(h(Math.round(d.x*14),Math.round(d.y*14),Math.round(d.z*14))-.5);
    v.copy(d).multiplyScalar(radius*k); v.x*=squash[0]; v.y*=squash[1]; v.z*=squash[2];
    pos.setXYZ(i,v.x,v.y,v.z);
  }
  g.computeVertexNormals(); return g;
}
const rockMat = new THREE.MeshStandardMaterial({color:0x4a423b, roughness:1, metalness:0, flatShading:true});
const fortressObj = new THREE.Group();
const capRock = new THREE.Mesh(rock(9,4,1.7,[1.25,.62,1.15]), rockMat); capRock.position.y=2.5;
const stemRock = new THREE.Mesh(rock(5,3,4.2,[.9,1.05,.9]), rockMat); stemRock.position.set(.5,-4.5,.6);
fortressObj.add(capRock, stemRock);
{ // port lights
  const n=60,p=new Float32Array(n*3);
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,y=-2+Math.random()*3; p.set([Math.cos(a)*10.6,y,Math.sin(a)*9.6],i*3);}
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3));
  fortressObj.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xffb070,size:.55,transparent:true,blending:THREE.AdditiveBlending})));
}
fortressObj.position.y=3; scene.add(fortressObj);

/* debris field */
{
  const n=160, m=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0), rockMat, n), o=new THREE.Object3D();
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, r=18+Math.pow(Math.random(),.7)*120;
    o.position.set(Math.cos(a)*r,(Math.random()-.5)*60,Math.sin(a)*r);
    o.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
    const s=.3+Math.random()*Math.random()*2.4; o.scale.set(s,s*.8,s*1.1); o.updateMatrix(); m.setMatrixAt(i,o.matrix);
  }
  scene.add(m);
}

/* ---------- particles (explosions) ---------- */
const PMAX=4000;
const pPos=new Float32Array(PMAX*3), pCol=new Float32Array(PMAX*3), pVel=new Float32Array(PMAX*3), pBase=new Float32Array(PMAX*3), pLife=new Float32Array(PMAX), pMaxL=new Float32Array(PMAX);
let pHead=0;
const pGeo=new THREE.BufferGeometry();
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const dot=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
const pts=new THREE.Points(pGeo,new THREE.PointsMaterial({size:1.8,map:dot,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
pts.frustumCulled=false; scene.add(pts);
const HOT=new THREE.Color(1,.82,.5);
function burst(at,col,n,spd,life){
  for(let k=0;k<n;k++){
    const i=pHead; pHead=(pHead+1)%PMAX;
    pPos[i*3]=at.x;pPos[i*3+1]=at.y;pPos[i*3+2]=at.z;
    const v=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize().multiplyScalar(spd*(.3+Math.random()));
    pVel[i*3]=v.x;pVel[i*3+1]=v.y;pVel[i*3+2]=v.z;
    const c=Math.random()<.55?HOT:col; pBase[i*3]=c.r*2;pBase[i*3+1]=c.g*2;pBase[i*3+2]=c.b*2;
    pLife[i]=pMaxL[i]=life*(.5+Math.random()*.7);
  }
}
function stepParticles(dt){
  for(let i=0;i<PMAX;i++){
    if(pLife[i]>0){
      pLife[i]-=dt; const k=Math.max(0,pLife[i]/pMaxL[i]), d=Math.pow(.25,dt);
      pPos[i*3]+=pVel[i*3]*dt;pPos[i*3+1]+=pVel[i*3+1]*dt;pPos[i*3+2]+=pVel[i*3+2]*dt;
      pVel[i*3]*=d;pVel[i*3+1]*=d;pVel[i*3+2]*=d;
      pCol[i*3]=pBase[i*3]*k;pCol[i*3+1]=pBase[i*3+1]*k;pCol[i*3+2]=pBase[i*3+2]*k;
    } else if(pCol[i*3]!==0||pCol[i*3+1]!==0){pCol[i*3]=pCol[i*3+1]=pCol[i*3+2]=0;}
  }
  pGeo.attributes.position.needsUpdate=true; pGeo.attributes.color.needsUpdate=true;
}

/* ---------- tracers ---------- */
const TMAX=500;
const tPos=new Float32Array(TMAX*6), tCol=new Float32Array(TMAX*6);
const tracers=[]; let tHead=0;
const tGeo=new THREE.BufferGeometry();
tGeo.setAttribute('position',new THREE.BufferAttribute(tPos,3));
tGeo.setAttribute('color',new THREE.BufferAttribute(tCol,3));
const tLines=new THREE.LineSegments(tGeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
tLines.frustumCulled=false; scene.add(tLines);
function shoot(a,b,col,dur){ const i=tHead; tHead=(tHead+1)%TMAX; tracers[i]={a:a.clone(),b:b.clone(),t:0,dur,col}; }
const _v=new THREE.Vector3(), _w=new THREE.Vector3();
function stepTracers(dt){
  for(let i=0;i<TMAX;i++){
    const tr=tracers[i];
    if(!tr){continue;}
    tr.t+=dt; const f=tr.t/tr.dur;
    if(f>=1){ burst(tr.b,tr.col,2,4,.35); tracers[i]=null; tCol.fill(0,i*6,i*6+6); continue; }
    _v.lerpVectors(tr.a,tr.b,f); _w.lerpVectors(tr.a,tr.b,Math.max(0,f-.22));
    tPos.set([_w.x,_w.y,_w.z,_v.x,_v.y,_v.z],i*6);
    const c=tr.col; tCol.set([c.r*.4,c.g*.4,c.b*.4,c.r*2.2,c.g*2.2,c.b*2.2],i*6);
  }
  tGeo.attributes.position.needsUpdate=true; tGeo.attributes.color.needsUpdate=true;
}

/* ---------- movement arrows ---------- */
const arrows=new Set();
function makeArrow(from,to,col,opt={}){
  const a=new THREE.Vector3(from.x,from.y+.5,from.z), b=new THREE.Vector3(to.x,to.y+.5,to.z);
  const len=a.distanceTo(b); if(len<3) return null;
  const dir=b.clone().sub(a).normalize(), perp=new THREE.Vector3(-dir.z,0,dir.x); if(perp.lengthSq()<1e-4) perp.set(1,0,0); perp.normalize();
  const ctrl=a.clone().add(b).multiplyScalar(.5).add(perp.multiplyScalar(len*.16*(opt.bend??1)));
  const curve=new THREE.QuadraticBezierCurve3(a,ctrl,b);
  const w=opt.width||2.4, tH=1-Math.min(.35,7.5/len);
  const ent=[]; const M=40,K=6;
  for(let i=0;i<=M;i++) ent.push([tH*i/M,w]);
  for(let j=0;j<=K;j++) ent.push([tH+(1-tH)*j/K, w*2.2*(1-j/K)]);
  const P=[],U=[],I=[];
  ent.forEach(([t,wd],k)=>{
    const p=curve.getPoint(Math.min(t,1)), tg=curve.getTangent(Math.min(t,.999)), s=new THREE.Vector3(-tg.z,0,tg.x);
    if(s.lengthSq()<1e-4) s.set(1,0,0); s.normalize().multiplyScalar(wd/2);
    P.push(p.x+s.x,p.y+s.y,p.z+s.z,p.x-s.x,p.y-s.y,p.z-s.z); U.push(t,0,t,1);
    if(k>0){const o=(k-1)*2;I.push(o,o+1,o+2,o+1,o+3,o+2);}
  });
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2)); g.setIndex(I);
  const mat=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, side:THREE.DoubleSide,
    uniforms:{uColor:{value:col.clone()},uTime:{value:0},uCut:{value:0},uOp:{value:1},uLen:{value:len}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uTime,uCut,uOp,uLen;
      void main(){ if(vUv.x<uCut) discard;
        float s=fract(vUv.x*uLen/2.6-uTime*1.3);
        float stripe=.7+.3*step(.5,s);
        float edge=smoothstep(0.,.14,vUv.y)*smoothstep(1.,.86,vUv.y);
        float tail=smoothstep(uCut,uCut+.14,vUv.x);
        vec3 c=uColor*(.9+.5*(1.-edge));
        gl_FragColor=vec4(c,uOp*stripe*tail*(.5+.35*edge));}`
  });
  const mesh=new THREE.Mesh(g,mat); scene.add(mesh);
  const ar={mesh,mat,len,life:opt.life??Infinity,age:0,from:a,to:b};
  arrows.add(ar); return ar;
}
function dropArrow(ar){ if(!ar) return; scene.remove(ar.mesh); ar.mesh.geometry.dispose(); ar.mat.dispose(); arrows.delete(ar); }

/* ---------- labels ---------- */
const labelsEl=document.getElementById('labels');
function mkUnitLabel(team,name,sub){
  const el=document.createElement('div'); el.className='unit t'+team;
  el.innerHTML=`<div class="emb">${EMB[team]}</div><div class="flag"><b></b><span></span></div>`;
  el.querySelector('b').textContent=name; el.querySelector('span').innerHTML=sub;
  labelsEl.appendChild(el); return el;
}
const sectors=[
  {name:'北宙域',sub:'本国航路・増援の出口',p:[22,-82]},
  {name:'東宙域',sub:'暗礁帯',p:[86,10]},
  {name:'南宙域',sub:'連合艦隊の進入方向',p:[-20,92]},
  {name:'西宙域',sub:'哨戒線のみ',p:[-92,-12]}
].map(s=>{const el=document.createElement('div');el.className='sector';el.innerHTML=`<b>${s.name}</b><span>${s.sub}</span>`;labelsEl.appendChild(el);return {el,pos:new THREE.Vector3(s.p[0],0,s.p[1])};});

/* ---------- ships ---------- */
const shipGeo=new THREE.ConeGeometry(.45,2,5); shipGeo.rotateX(Math.PI/2);
const shipMeshes=[0,1].map(t=>{
  const c=TEAM_COL[t];
  const m=new THREE.InstancedMesh(shipGeo,new THREE.MeshStandardMaterial({color:c.clone().multiplyScalar(.55),emissive:c,emissiveIntensity:.75,metalness:.3,roughness:.45}),600);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled=false; scene.add(m); return m;
});
/* small craft (fighters and W.A.S.) launched from carriers */
const craftGeo=new THREE.ConeGeometry(.55,1.7,3); craftGeo.rotateX(Math.PI/2);
const craftMeshes=[0,1].map(t=>{
  const c=TEAM_COL[t].clone().lerp(new THREE.Color(1,1,1),.35);
  const m=new THREE.InstancedMesh(craftGeo,new THREE.MeshBasicMaterial({color:c}),1500);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled=false; scene.add(m); return m;
});

/* selection rings */
const selRing=new THREE.Mesh(new THREE.RingGeometry(1,1.12,64),new THREE.MeshBasicMaterial({color:0xdff2ff,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide}));
selRing.rotation.x=-Math.PI/2; selRing.visible=false; scene.add(selRing);
const rangeRing=new THREE.Mesh(new THREE.RingGeometry(.97,1,96),new THREE.MeshBasicMaterial({color:0x7fc8ff,transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide}));
rangeRing.rotation.x=-Math.PI/2; rangeRing.visible=false; scene.add(rangeRing);
/* sight ring: how far the selected fleet spots an enemy of ordinary concealment */
const sightRing=new THREE.Mesh(new THREE.RingGeometry(.994,1,160),new THREE.MeshBasicMaterial({color:0x9fe8c8,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide}));
sightRing.rotation.x=-Math.PI/2; sightRing.visible=false; scene.add(sightRing);

/* order layer: the horizontal plane taps land on, drawn at the chosen altitude */
const layerMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,extensions:{derivatives:true},
  uniforms:{uTime:{value:0}},
  vertexShader:'varying vec2 vP;varying vec2 vW;void main(){vP=position.xz;vec4 w=modelMatrix*vec4(position,1.);vW=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`varying vec2 vP;varying vec2 vW;uniform float uTime;
    float ln(float x,float w){float d=abs(fract(x-.5)-.5)/max(fwidth(x),1e-4);return 1.-min(d/w,1.);}
    void main(){float r=length(vP);float g=max(ln(vW.x/10.,1.),ln(vW.y/10.,1.));
      float f=1.-smoothstep(20.,70.,r);float pulse=ln((r-uTime*6.)/24.,1.5)*.5;
      gl_FragColor=vec4(vec3(.62,.86,1.),(g*.55+pulse*.4)*f);}`});
const layer=new THREE.Mesh(new THREE.PlaneGeometry(150,150),layerMat); layer.geometry.rotateX(-Math.PI/2); layer.visible=false; scene.add(layer);

/* altitude stalks: a vertical line from each unit (and each move destination) down to the grid, plus a foot mark */
const SMAX=64, sPos=new Float32Array(SMAX*6), sCol=new Float32Array(SMAX*6), fPos=new Float32Array(SMAX*3), fCol=new Float32Array(SMAX*3);
const sGeo=new THREE.BufferGeometry(); sGeo.setAttribute('position',new THREE.BufferAttribute(sPos,3)); sGeo.setAttribute('color',new THREE.BufferAttribute(sCol,3));
const stalks=new THREE.LineSegments(sGeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.75,depthWrite:false})); stalks.frustumCulled=false; scene.add(stalks);
const fGeo=new THREE.BufferGeometry(); fGeo.setAttribute('position',new THREE.BufferAttribute(fPos,3)); fGeo.setAttribute('color',new THREE.BufferAttribute(fCol,3));
const feet=new THREE.Points(fGeo,new THREE.PointsMaterial({size:2.2,map:dot,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); feet.frustumCulled=false; scene.add(feet);
function updateStalks(){
  sCol.fill(0); fCol.fill(0); let i=0;
  const put=(p,c,k)=>{ if(i>=SMAX) return; sPos.set([p.x,p.y,p.z,p.x,0,p.z],i*6); sCol.set([c.r*k,c.g*k,c.b*k,c.r*k*.25,c.g*k*.25,c.b*k*.25],i*6); fPos.set([p.x,0,p.z],i*3); fCol.set([c.r*k,c.g*k,c.b*k],i*3); i++; };
  for(const f of fleets){ if(!f.alive||!shown(f)) continue; put(f.pos,TEAM_COL[f.team],1);
    if(f.team===0&&f.order&&f.order.type==='move') put(f.order.dest,TEAM_COL[0],.6); }
  sGeo.attributes.position.needsUpdate=sGeo.attributes.color.needsUpdate=true;
  fGeo.attributes.position.needsUpdate=fGeo.attributes.color.needsUpdate=true;
}

/* defense zone as a sphere: three faint great circles around the fortress */
{
  const pts=[]; for(let i=0;i<=96;i++){const a=i/96*Math.PI*2; pts.push(new THREE.Vector3(Math.cos(a)*40,Math.sin(a)*40,0));}
  const g=new THREE.BufferGeometry().setFromPoints(pts), m=new THREE.LineBasicMaterial({color:0xff6a45,transparent:true,opacity:.28,depthWrite:false});
  [0,Math.PI/3,2*Math.PI/3].forEach(r=>{const l=new THREE.Line(g,m); l.rotation.y=r; l.position.y=3; scene.add(l);});
}

/* ---------- game state ---------- */
let fleets, fortress, gameSec, speed=1, over, selected, engaged, phaseName, events, reinforced, fortressMarks, fid;
const PLAYER_SPEC=[
  {name:'第1突撃艇隊',sub:'高速・軽装',n:24,hp:10,dmg:1.25,range:15,speed:10,scale:.75,pos:[-24,112],alt:-8,vis:8,stl:7},
  {name:'第2戦隊',sub:'主力巡洋艦',n:10,hp:42,dmg:4.2,range:22,speed:5.5,scale:1.5,pos:[12,118],alt:6,vis:6,stl:4},
  {name:'第3戦隊',sub:'主力巡洋艦',n:10,hp:42,dmg:4.2,range:22,speed:5.5,scale:1.5,pos:[100,64],alt:24,vis:6,stl:4},
  {name:'第7機動部隊',sub:'戦闘母艦',n:3,hp:70,dmg:1.6,range:14,speed:5,scale:1.6,pos:[-108,46],alt:-26,vis:7,stl:3,hangar:{ftr:120}},
];
const ENEMY_SPEC=[
  {name:'防空第1隊',sub:'北宙域守備',n:16,hp:12,dmg:1.3,range:16,speed:7,scale:.8,pos:[0,-52],alt:18,ai:'guard',leash:42,vis:5,stl:5},
  {name:'防空第2隊',sub:'南宙域守備',n:16,hp:12,dmg:1.3,range:16,speed:7,scale:.8,pos:[0,52],alt:-14,ai:'guard',leash:42,vis:5,stl:5},
  {name:'防空第3隊',sub:'東宙域守備',n:16,hp:12,dmg:1.3,range:16,speed:7,scale:.8,pos:[54,0],alt:4,ai:'guard',leash:42,vis:5,stl:5},
  {name:'防空第4隊',sub:'西宙域守備',n:16,hp:12,dmg:1.3,range:16,speed:7,scale:.8,pos:[-54,0],alt:22,ai:'guard',leash:42,vis:5,stl:5},
  {name:'近衛艦隊',sub:'要塞直掩',n:12,hp:36,dmg:3.4,range:20,speed:5,scale:1.4,pos:[-8,-22],alt:-6,ai:'guard',leash:30,vis:6,stl:3},
];

function makeFleet(team,o){
  const f={...o,team,kind:'fleet',id:fid++,pos:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),post:new THREE.Vector3(o.pos[0],o.alt||0,o.pos[1]),
    heading:new THREE.Vector3(0,0,team?1:-1),ships:[],hpPool:o.n*o.hp,alive:true,order:null,arrow:null,fireTarget:null,retarget:Math.random()*.4,radius:0,seen:false,everSeen:false,revealT:0,lastPos:null,lostAt:-1e9};
  const R=Math.sqrt(o.n)*1.35*o.scale;
  for(let i=0;i<o.n;i++){const a=Math.random()*Math.PI*2,r=R*Math.sqrt(Math.random());
    const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*2.4*o.scale,Math.sin(a)*r);
    f.ships.push({off,pos:f.pos.clone().add(off),wob:Math.random()*6});}
  f.hangars=makeHangars(o.hangar);
  f.launchR=f.hangars.reduce((m,h)=>Math.max(m,WING[h.type].launchR),0);
  f.el=mkUnitLabel(team,o.name,'');
  return f;
}
/* carriers: craft sortie in squadrons. Each hangar fills up to maxOut squadrons, the rest waits aboard as reserve */
const WING={
  ftr:{name:'艦載機',squad:30,maxOut:3,launchR:52,range:9,speed:17,hp:5,eva:.45,dmg:.3,fuel:24,rearm:8,cd:3,vis:5,stl:7},
  was:{name:'W.A.S.',squad:20,maxOut:3,launchR:30,range:5,speed:10,hp:10,eva:.25,dmg:.65,fuel:16,rearm:10,cd:4,vis:4,stl:6},
};
function makeHangars(hg){
  if(!hg) return [];
  return Object.entries(hg).filter(([t,c])=>WING[t]&&c>0).map(([type,cap])=>{
    const W=WING[type], squads=[]; let left=Math.round(cap);
    while(squads.length<W.maxOut&&left>0){ const n=Math.min(W.squad,left); squads.push({n,state:'docked',ready:0,wing:null}); left-=n; }
    return {type,reserve:left,squads,next:0,announced:false};
  });
}
function hangarText(f){
  return f.hangars.map(h=>{ const W=WING[h.type], out=h.squads.filter(q=>q.state==='out');
    const total=h.reserve+h.squads.reduce((s,q)=>s+(q.state==='out'?q.wing.n:q.n),0);
    return `${W.name}${total}　出撃${out.length}/${h.squads.length}隊　予備${h.reserve}`; }).join('　');
}
function altStr(y){ y=Math.round(y); return y===0?'±0':(y>0?'+':'−')+Math.abs(y); }
function subText(f){ return `${f.sub}　<span class="num">×${f.ships.length}　高度${altStr(f.pos.y)}</span>${f.hangars.length?`<br>${hangarText(f)}`:''}`; }

const rosterEl=document.getElementById('roster');
/* keep the briefing panel above the roster on narrow screens */
try{ new ResizeObserver(()=>document.documentElement.style.setProperty('--rh',rosterEl.offsetHeight+'px')).observe(rosterEl); }catch(e){}
/* roster: with an army group, its armies sit in a group section; drag a button between sections to take an army out or put it back */
function buildRoster(){
  rosterEl.innerHTML='';
  const mine=fleets.filter(f=>f.team===0);
  const mk=(f)=>{ const i=mine.indexOf(f);
    const b=document.createElement('button'); b.id='fl'+i; b.setAttribute('aria-pressed','false');
    b.innerHTML=`<span>${f.name}</span><span class="n"></span><span class="bar"><i></i></span>`;
    b.addEventListener('click',()=>{ if(b._dragged){ b._dragged=false; return; } select(f.alive&&(selected!==f||selGroupMode)?f:null); });
    if(armyGroup) dragSource(b,f);
    f.btn=b; return b; };
  if(!armyGroup){ mine.forEach(f=>rosterEl.appendChild(mk(f))); return; }
  const gz=document.createElement('div'); gz.className='rzone'; gz.dataset.zone='group';
  const gb=document.createElement('button'); gb.className='grpBtn'; gb.id='grpBtn';
  gb.textContent=`${armyGroup.name} 全軍`; gb.title=armyGroup.sync?'最も遅い艦に速度を合わせて移動':'各軍の速度で移動';
  gb.addEventListener('click',()=>selectGroup());
  gz.appendChild(gb);
  const fz=document.createElement('div'); fz.className='rzone'; fz.dataset.zone='free';
  fz.innerHTML='<div class="rhead">独立行動（ここへドラッグで外す）</div>';
  mine.forEach(f=>(armyGroup.members.has(f)?gz:fz).appendChild(mk(f)));
  rosterEl.append(gz,fz);
}
function dragSource(b,f){
  let st=null,ghost=null;
  b.addEventListener('pointerdown',e=>{ st={x:e.clientX,y:e.clientY,id:e.pointerId}; });
  b.addEventListener('pointermove',e=>{ if(!st||e.pointerId!==st.id) return;
    if(!ghost&&Math.hypot(e.clientX-st.x,e.clientY-st.y)>8){ b.setPointerCapture(e.pointerId); ghost=document.createElement('div'); ghost.className='dragGhost'; ghost.textContent=f.name; document.body.appendChild(ghost); b.classList.add('dragging'); }
    if(ghost){ ghost.style.transform=`translate(${e.clientX+10}px,${e.clientY+6}px)`; const z=zoneAt(e); rosterEl.querySelectorAll('.rzone').forEach(x=>x.classList.toggle('drop',x===z)); } });
  const end=e=>{ if(ghost){ const z=zoneAt(e); ghost.remove(); ghost=null; b._dragged=true; b.classList.remove('dragging');
      if(z&&f.alive){ const into=z.dataset.zone==='group'; if(into!==armyGroup.members.has(f)){ into?armyGroup.members.add(f):armyGroup.members.delete(f);
        if(into&&armyGroup.members.size>5){ armyGroup.members.delete(f); logEvent('軍集団は満員です','軍集団に入れられる軍は5個までです。'); }
        else logEvent(into?`${f.name} 軍集団に復帰`:`${f.name} 独立行動へ`, into?`${f.name}が${armyGroup.name}の指揮下に戻った。`:`${f.name}が${armyGroup.name}を離れ、単独で行動する。`);
        f.syncSpeed=null; if(selGroupMode) select(null); buildRoster(); updateRoster(); } } }
    st=null; rosterEl.querySelectorAll('.rzone').forEach(x=>x.classList.remove('drop')); };
  b.addEventListener('pointerup',end); b.addEventListener('pointercancel',end);
}
function zoneAt(e){ const el=document.elementFromPoint(e.clientX,e.clientY); return el&&el.closest?el.closest('.rzone'):null; }
function groupAlive(){ return armyGroup?[...armyGroup.members].filter(f=>f.alive):[]; }
function selectGroup(){ const m=groupAlive(); if(!m.length) return; if(selGroupMode){ select(null); return; } select(m[0]); selGroupMode=true;
  fleets.forEach(x=>x.el.classList.toggle('sel',m.includes(x))); updateRoster(); }
/* the fleets an order goes to: the whole army group, or just the selected army */
function orderTargets(){ return selGroupMode?groupAlive():(selected&&selected.alive?[selected]:[]); }
function groupOrder(o){
  const t=orderTargets(); if(!t.length) return;
  const sync=selGroupMode&&armyGroup.sync?Math.min(...t.map(f=>f.speed)):null;
  if(o.type==='move'&&t.length>1){
    const c=new THREE.Vector3(); t.forEach(f=>c.add(f.pos)); c.divideScalar(t.length);
    t.forEach(f=>{ f.syncSpeed=sync; order(f,{type:'move',dest:o.dest.clone().add(f.pos.clone().sub(c))}); });
  } else t.forEach(f=>{ f.syncSpeed=sync; order(f,o); });
}
function updateRoster(){
  fleets.forEach(f=>{ if(!f.btn) return;
    f.btn.querySelector('.n').textContent='×'+f.ships.length;
    f.btn.querySelector('.bar i').style.width=(100*f.ships.length/f.n)+'%';
    f.btn.disabled=!f.alive; f.btn.setAttribute('aria-pressed',String(selGroupMode?armyGroup.members.has(f):selected===f));
  });
  const gb=document.getElementById('grpBtn'); if(gb){ gb.setAttribute('aria-pressed',String(selGroupMode)); gb.disabled=!groupAlive().length; }
}

let lastCfg=null, armyGroup=null, selGroupMode=false;
function reset(cfg=lastCfg){
  lastCfg=cfg;
  if(fleets) fleets.forEach(f=>{f.el.remove();dropArrow(f.arrow);});
  if(fortress) fortress.el.remove();
  [...arrows].forEach(dropArrow); wings=[];
  document.getElementById('alt').hidden=true;
  fid=1; gameSec=0; over=false; selected=null; engaged=new Map(); reinforced=false; fortressMarks=new Set(); events=[];
  const spec=cfg&&cfg.fleets&&cfg.fleets.length?cfg.fleets:PLAYER_SPEC;
  fleets=[...spec.map(o=>makeFleet(0,o)),...ENEMY_SPEC.map(o=>makeFleet(1,o))];
  selGroupMode=false;
  armyGroup=cfg&&cfg.group?{name:cfg.group.name,sync:cfg.group.sync,members:new Set(cfg.group.members.map(i=>fleets[i]))}:null;
  fortress={kind:'fortress',team:1,id:0,name:'要塞カリュブディス',pos:new THREE.Vector3(0,3,0),hpPool:3200,max:3200,dps:18,range:46,radius:11,alive:true,retarget:0,fireTarget:null,vis:8,seen:true,everSeen:true,revealT:0};
  fortress.el=mkUnitLabel(1,fortress.name,''); fortress.el.classList.add('fort'); fortress.el.querySelector('.emb').style.cssText='width:32px;height:32px';
  setPhase('布陣');
  document.getElementById('result').hidden=true;
  document.getElementById('log').innerHTML='';
  showBrief('作戦概要','要塞カリュブディス攻略戦','二つの小惑星を接合した敵要塞。周囲の防空圏は東西南北の4隊と近衛艦隊が守る。艦隊を分けて防空隊を各個撃破し、要塞の装甲を0にすれば勝利。敵艦隊は味方の視界に入るまで見えない。'); flashBrief(8000);
  fogTimer=0; updateFog();
  buildRoster(); updateRoster();
}

/* ---------- HUD ---------- */
function clockStr(){ const m=8*60+Math.floor(gameSec*.5); return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function setPhase(p){ phaseName=p; document.getElementById('phase').textContent=p; }
function showBrief(t,h,p){ document.getElementById('bt').textContent=t; document.getElementById('bh').textContent=h; document.getElementById('bp').textContent=p; }
function logEvent(title,desc){
  const t=clockStr();
  const prev=document.getElementById('bh').textContent, prevT=document.getElementById('bt').textContent;
  if(prevT!=='作戦概要'){ const li=document.createElement('li'); li.innerHTML=`<b>${prevT}</b>`; li.append(prev); const log=document.getElementById('log'); log.prepend(li); while(log.children.length>3) log.lastChild.remove(); }
  showBrief(t,title,desc); flashBrief();
}

/* ---------- selection & orders ---------- */
function select(f){ selected=f; selGroupMode=false; if(!f) hideGhost(); fleets.forEach(x=>x.el.classList.toggle('sel',x===f));
  if(f){ setAlt(f.order&&f.order.type==='move'?f.order.dest.y:f.pos.y,false); }
  document.getElementById('alt').hidden=!f; updateRoster(); }
/* altitude control: sets the height of the selected fleet's destination */
let selAlt=0; const ALT_MAX=60;
const altTrack=document.getElementById('altTrack'), altKnob=document.getElementById('altKnob'), altVal=document.getElementById('altVal');
function setAlt(v,apply=true){
  selAlt=Math.max(-ALT_MAX,Math.min(ALT_MAX,Math.round(v)));
  altKnob.style.top=(50-50*selAlt/ALT_MAX)+'%'; altVal.textContent=altStr(selAlt); altTrack.setAttribute('aria-valuenow',selAlt);
  if(!apply||!selected||!selected.alive) return;
  const t=orderTargets(); if(!t.length) return;
  const cy=t.reduce((s,f)=>s+(f.order&&f.order.type==='move'?f.order.dest.y:f.pos.y),0)/t.length;
  t.forEach(f=>{
    if(f.order&&f.order.type==='move'){ const d=f.order.dest.clone(); d.y+=selAlt-cy; order(f,{type:'move',dest:d}); }
    else if(!f.order){ order(f,{type:'move',dest:new THREE.Vector3(f.pos.x,f.pos.y+selAlt-cy,f.pos.z)}); }
  });
}
function altFromPointer(e){ const r=altTrack.getBoundingClientRect(); setAlt(ALT_MAX*(1-2*(e.clientY-r.top)/r.height)); }
altTrack.addEventListener('pointerdown',e=>{ altTrack.setPointerCapture(e.pointerId); altFromPointer(e); });
altTrack.addEventListener('pointermove',e=>{ if(altTrack.hasPointerCapture(e.pointerId)) altFromPointer(e); });
altTrack.addEventListener('keydown',e=>{ if(e.key==='ArrowUp'){setAlt(selAlt+5);e.preventDefault();} if(e.key==='ArrowDown'){setAlt(selAlt-5);e.preventDefault();} });
document.getElementById('altUp').addEventListener('click',()=>setAlt(selAlt+5));
document.getElementById('altDn').addEventListener('click',()=>setAlt(selAlt-5));
/* WASD pans the camera across the battle plane, relative to where it is looking; Shift doubles the speed */
const panKeys=new Set();
addEventListener('keydown',e=>{ if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code)) panKeys.add(e.code); });
addEventListener('keyup',e=>panKeys.delete(e.code));
addEventListener('blur',()=>panKeys.clear());
const _fw=new THREE.Vector3(), _rt=new THREE.Vector3(), _mv=new THREE.Vector3();
function panCamera(dt){
  if(!panKeys.size) return;
  camera.getWorldDirection(_fw); _fw.y=0; if(_fw.lengthSq()<1e-6) _fw.set(0,0,-1); _fw.normalize();
  _rt.crossVectors(_fw,camera.up).normalize();
  _mv.set(0,0,0);
  if(panKeys.has('KeyW')) _mv.add(_fw); if(panKeys.has('KeyS')) _mv.sub(_fw);
  if(panKeys.has('KeyD')) _mv.add(_rt); if(panKeys.has('KeyA')) _mv.sub(_rt);
  if(_mv.lengthSq()===0) return;
  const fast=panKeys.has('ShiftLeft')||panKeys.has('ShiftRight')?2:1;
  _mv.normalize().multiplyScalar(camera.position.distanceTo(controls.target)*.45*fast*dt);
  if(Math.hypot(controls.target.x+_mv.x,controls.target.z+_mv.z)>220) return;
  controls.target.add(_mv); camera.position.add(_mv);
}
addEventListener('keydown',e=>{ if(!selected||e.target===altTrack) return; if(e.key==='q'||e.key==='Q') setAlt(selAlt+5); if(e.key==='e'||e.key==='E') setAlt(selAlt-5); });
function order(f,o){
  dropArrow(f.arrow); f.arrow=null; f.order=o;
  if(f.team===1&&!f.seen) return;
  if(o.type==='move') f.arrow=makeArrow(f.pos,o.dest,TEAM_COL[f.team]);
  else { const ar=makeArrow(f.pos,o.target.pos,TEAM_COL[f.team],{life:3.5}); if(f.team===0) f.arrow=ar; }
}

const ray=new THREE.Raycaster(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function proj(v){ const p=v.clone().project(camera); return {x:(p.x+1)/2*W, y:(1-p.y)/2*H, z:p.z}; }
/* hover preview (mouse only): shows where a click would send the selected fleet, at the chosen altitude */
const ghost=new THREE.Group(); ghost.visible=false; scene.add(ghost);
const ghostRing=new THREE.Mesh(new THREE.RingGeometry(2.2,2.7,40),new THREE.MeshBasicMaterial({color:0xbfe4ff,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide}));
ghostRing.rotation.x=-Math.PI/2; ghost.add(ghostRing);
const ghostFoot=new THREE.Mesh(new THREE.RingGeometry(1.2,1.5,32),new THREE.MeshBasicMaterial({color:0x7fc8ff,transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide}));
ghostFoot.rotation.x=-Math.PI/2; scene.add(ghostFoot); ghostFoot.visible=false;
const ghostStalkGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
const ghostStalk=new THREE.Line(ghostStalkGeo,new THREE.LineDashedMaterial({color:0xbfe4ff,dashSize:1.2,gapSize:.8,transparent:true,opacity:.8})); ghostStalk.frustumCulled=false; scene.add(ghostStalk); ghostStalk.visible=false;
const cursorAlt=document.getElementById('cursorAlt');
function hideGhost(){ ghost.visible=ghostFoot.visible=ghostStalk.visible=false; cursorAlt.hidden=true; }
renderer.domElement.addEventListener('pointermove',e=>{
  if(e.pointerType!=='mouse'||!selected||!selected.alive||over||e.buttons){ hideGhost(); return; }
  ray.setFromCamera({x:e.clientX/W*2-1,y:-(e.clientY/H)*2+1},camera); plane.constant=-selAlt;
  const hit=new THREE.Vector3();
  if(!ray.ray.intersectPlane(plane,hit)||Math.hypot(hit.x,hit.z)>200){ hideGhost(); return; }
  ghost.position.copy(hit); ghostFoot.position.set(hit.x,.05,hit.z);
  ghostStalkGeo.setFromPoints([hit,new THREE.Vector3(hit.x,0,hit.z)]); ghostStalk.computeLineDistances();
  ghost.visible=true; ghostFoot.visible=ghostStalk.visible=Math.abs(selAlt)>.5;
  cursorAlt.hidden=false; cursorAlt.textContent='高度'+altStr(selAlt); cursorAlt.style.transform=`translate(${e.clientX+14}px,${e.clientY+10}px)`;
});
renderer.domElement.addEventListener('pointerleave',hideGhost);

/* camera views: oblique / top-down / side-on, plus F to center on the selected fleet */
const VIEWS=[{name:'斜め',dir:()=>new THREE.Vector3(.3,.4,.87)},{name:'真上',dir:()=>new THREE.Vector3(0,1,.002)},
  {name:'真横',dir:()=>{const d=camera.position.clone().sub(controls.target);d.y=0;if(d.lengthSq()<1e-4)d.set(0,0,1);d.normalize();d.y=.06;return d;}}];
let viewIdx=0, camAnim=null;
function flyTo(target,dir,dist){
  dist=dist??camera.position.distanceTo(controls.target);
  camAnim={t:0,fT:controls.target.clone(),tT:target.clone(),fP:camera.position.clone(),tP:target.clone().add(dir.clone().normalize().multiplyScalar(dist))};
}
function setView(i){ viewIdx=i; flyTo(controls.target,VIEWS[i].dir());
  document.querySelectorAll('#camView button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===i))); }
function cycleView(){ setView((viewIdx+1)%VIEWS.length); }
function focusSelected(){ if(!selected||!selected.alive) return; const d=camera.position.clone().sub(controls.target); flyTo(selected.pos,d,Math.min(d.length(),120)); }
/* view angle: horizontal bar turns the camera around the target, vertical bar tilts it from above to below; arrow keys do the same */
const EL_MIN=-80, EL_MAX=88, _sph=new THREE.Spherical(), _off=new THREE.Vector3();
const azTrack=document.getElementById('azTrack'), azKnob=document.getElementById('azKnob'), elTrack=document.getElementById('elTrack'), elKnob=document.getElementById('elKnob');
elTrack.querySelector('.lv').style.top=(100*EL_MAX/(EL_MAX-EL_MIN))+'%';
function getAngles(){ _off.subVectors(camera.position,controls.target); _sph.setFromVector3(_off); return {az:THREE.MathUtils.radToDeg(_sph.theta), el:90-THREE.MathUtils.radToDeg(_sph.phi)}; }
function setAngles(az,el){
  camAnim=null; _off.subVectors(camera.position,controls.target); _sph.setFromVector3(_off);
  if(az!=null) _sph.theta=THREE.MathUtils.degToRad(((az+540)%360)-180);
  if(el!=null) _sph.phi=THREE.MathUtils.degToRad(90-Math.max(EL_MIN,Math.min(EL_MAX,el)));
  _off.setFromSpherical(_sph); camera.position.copy(controls.target).add(_off);
}
function syncCamBars(){ const a=getAngles();
  azKnob.style.left=(50+50*a.az/180)+'%'; elKnob.style.top=(100*(EL_MAX-a.el)/(EL_MAX-EL_MIN))+'%';
  azTrack.setAttribute('aria-valuenow',Math.round(a.az)); elTrack.setAttribute('aria-valuenow',Math.round(a.el)); }
function bindBar(tr,fromEvent){
  tr.addEventListener('pointerdown',e=>{ tr.setPointerCapture(e.pointerId); fromEvent(e); });
  tr.addEventListener('pointermove',e=>{ if(tr.hasPointerCapture(e.pointerId)) fromEvent(e); });
}
bindBar(azTrack,e=>{ const r=azTrack.getBoundingClientRect(); setAngles(360*((e.clientX-r.left)/r.width)-180,null); });
bindBar(elTrack,e=>{ const r=elTrack.getBoundingClientRect(); setAngles(null,EL_MAX-(EL_MAX-EL_MIN)*(e.clientY-r.top)/r.height); });
const rotKeys=new Set();
addEventListener('keydown',e=>{ if(e.target===altTrack) return; if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){ rotKeys.add(e.key); e.preventDefault(); } });
addEventListener('keyup',e=>rotKeys.delete(e.key));
addEventListener('blur',()=>rotKeys.clear());
function rotateByKeys(dt){
  if(!rotKeys.size) return; const a=getAngles();
  const daz=(rotKeys.has('ArrowLeft')?-1:0)+(rotKeys.has('ArrowRight')?1:0), del=(rotKeys.has('ArrowUp')?1:0)+(rotKeys.has('ArrowDown')?-1:0);
  if(daz||del) setAngles(a.az+daz*90*dt, a.el+del*60*dt);
}
function stepCam(dt){
  if(!camAnim) return; camAnim.t=Math.min(1,camAnim.t+dt/.6); const k=camAnim.t*camAnim.t*(3-2*camAnim.t);
  controls.target.lerpVectors(camAnim.fT,camAnim.tT,k); camera.position.lerpVectors(camAnim.fP,camAnim.tP,k);
  if(camAnim.t>=1) camAnim=null;
}
document.querySelectorAll('#camView button').forEach(b=>b.addEventListener('click',()=>setView(+b.dataset.v)));
addEventListener('keydown',e=>{ if(e.code==='KeyV') cycleView(); if(e.code==='KeyF') focusSelected(); });

function tap(x,y){
  if(over) return;
  let best=null,bd=34;
  for(const f of fleets){ if(!f.alive||!shown(f)) continue; const s=proj(f.pos); const d=Math.hypot(s.x-x,s.y-y); if(d<bd){bd=d;best=f;} }
  const fs=proj(fortress.pos.clone().setY(7)); const fd=Math.hypot(fs.x-x,fs.y-y);
  if(best&&best.team===0){ select(best===selected?null:best); return; }
  if(selected&&selected.alive){
    if(best&&best.team===1){ groupOrder({type:'attack',target:best}); return; }
    if(fd<46&&fortress.alive){ groupOrder({type:'attack',target:fortress}); return; }
    ray.setFromCamera({x:x/W*2-1,y:-(y/H)*2+1},camera); const hit=new THREE.Vector3();
    plane.constant=-selAlt;
    if(ray.ray.intersectPlane(plane,hit)&&Math.hypot(hit.x,hit.z)<200){ groupOrder({type:'move',dest:hit}); hideHint(); }
  }
}
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:performance.now()};});
renderer.domElement.addEventListener('pointerup',e=>{ if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<8&&performance.now()-down.t<450) tap(e.clientX,e.clientY); down=null; });
const hintEl=document.getElementById('hint'); let hintGone=false;
function hideHint(){ if(hintGone) return; hintGone=true; hintEl.classList.add('gone'); setTimeout(()=>hintEl.hidden=true,800); }
/* the hint closes on its own after a few seconds, or as soon as the player touches anything */
hintEl.addEventListener('click',hideHint);
addEventListener('pointerdown',hideHint,{capture:true});

document.querySelectorAll('#speed button').forEach(b=>b.addEventListener('click',()=>{
  speed=+b.dataset.s; document.querySelectorAll('#speed button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
}));
document.getElementById('again').addEventListener('click',()=>reset());
document.getElementById('toMenu').addEventListener('click',()=>{ document.getElementById('result').hidden=true; openMenu(); });
function openMenu(){ menuOpen=true; document.body.classList.add('inmenu'); select(null); if(window.WOS_MENU) window.WOS_MENU.open(); }
/* entry point used by the preparation screens (prep.js) */
window.WOS={ start(cfg){
  menuOpen=false; document.body.classList.remove('inmenu'); document.getElementById('menu').hidden=true;
  reset(cfg||null); speed=1; document.querySelectorAll('#speed button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.s==='1')));
  setView(0); flyTo(new THREE.Vector3(0,0,24),new THREE.Vector3(.3,.4,.87),190);
  hintGone=false; hintEl.hidden=false; hintEl.classList.remove('gone'); setTimeout(hideHint,7000);
}, openMenu };

/* the briefing shows its text briefly on each new event, then folds back to one line; click to pin it open */
const briefEl=document.getElementById('brief'); let briefTimer=0;
function flashBrief(ms=5000){ briefEl.classList.add('fresh'); clearTimeout(briefTimer); briefTimer=setTimeout(()=>briefEl.classList.remove('fresh'),ms); }
briefEl.tabIndex=0;
function toggleBrief(){ briefEl.classList.toggle('open'); briefEl.classList.remove('fresh'); }
briefEl.addEventListener('click',toggleBrief);
briefEl.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleBrief(); } });
/* view toggles: H hides the panels, L hides name flags */
const vUi=document.getElementById('vUi'), vLb=document.getElementById('vLb');
function toggleUi(){ const off=document.body.classList.toggle('noui'); vUi.setAttribute('aria-pressed',String(!off)); }
function toggleLabels(){ const off=document.body.classList.toggle('nolabels'); vLb.setAttribute('aria-pressed',String(!off)); }
vUi.addEventListener('click',toggleUi); vLb.addEventListener('click',toggleLabels);
addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT') return; if(e.key==='h'||e.key==='H') toggleUi(); if(e.key==='l'||e.key==='L') toggleLabels(); });

/* ---------- simulation ---------- */
let wings=[];
function units(){ return fortress.alive?[...fleets,...wings,fortress]:[...fleets,...wings]; }
function gap(a,b){ return a.pos.distanceTo(b.pos)-(b.radius||0); }
/* detection: a team sees an enemy unit while any of its own units has it within sight.
   sight grows with the observer's 視界, shrinks with the target's 隠蔽性; vision is shared across the team,
   and a unit that opens fire gives itself away for a few seconds. */
const sightOf=u=>60+(u.vis??6)*8, concealOf=u=>1-Math.min(10,u.stl??4)*.04, FIRE_REVEAL=3, LOST_MEMORY=30;
function shown(u){ return u.team===0||u.seen; }
let fogTimer=0;
function updateFog(){
  const all=units();
  for(const t of all){ if(!t.alive) continue;
    let by=null;
    if(t.kind==='fortress'||t.revealT>0) by=t;
    else for(const o of all){ if(!o.alive||o.team===t.team) continue;
      if(o.pos.distanceTo(t.pos)<=sightOf(o)*concealOf(t)){ by=o; break; } }
    const was=t.seen; t.seen=!!by;
    if(was&&!t.seen){ t.lastPos=t.pos.clone(); t.lostAt=gameSec; }
    if(t.seen&&!t.everSeen){ t.everSeen=true;
      if(t.team===1&&gameSec>0&&by!==t) logEvent(`${t.name} 発見`,`${by.name}が${t.name}（${t.ships.length}隻）を捕捉。`); }
  }
}
function nearestFoe(f,maxD){ let best=null,bd=maxD; for(const u of units()){ if(!u.alive||u.team===f.team||!u.seen) continue; const d=gap(f,u); if(d<bd){bd=d;best=u;} } return best; }
function randShip(u){ if(u.kind==='fortress'){ const a=Math.random()*Math.PI*2; return new THREE.Vector3(Math.cos(a)*10,3+Math.random()*4,Math.sin(a)*9); } return u.ships.length?u.ships[(Math.random()*u.ships.length)|0].pos:u.pos; }

function damage(t,amt,src){
  if(!t.alive) return;
  if(t.eva) amt*=1-t.eva;
  if(t.kind==='wing'&&src.kind!=='wing') amt*=.5; // ship guns track small craft poorly
  t.hpPool-=amt;
  const key=Math.min(src.id,t.id)+'-'+Math.max(src.id,t.id), last=engaged.get(key), wingy=t.kind==='wing'||src.kind==='wing';
  if(last===undefined||gameSec-last>40){
    if(last===undefined){
      const a=src.team===0?src:t, b=src.team===0?t:src;
      if(t.kind==='fortress'||src.kind==='fortress'){
        if(phaseName!=='要塞攻略'){ setPhase('要塞攻略'); logEvent('要塞攻略開始',`${a.name}が要塞の防空砲火圏に突入。要塞の主砲は射程46、近づくほど危険。`); }
      } else { if(phaseName==='布陣') setPhase('交戦'); if(!wingy) logEvent(`${a.name} 対 ${b.name}`,`${a.name}（${a.ships.length}隻）と${b.name}（${b.ships.length}隻）が交戦を開始。`); }
    }
    engaged.set(key,gameSec);
  } else engaged.set(key,gameSec);
  if(t.kind==='wing'){
    const want=Math.max(0,Math.ceil(t.hpPool/t.hp));
    while(t.ships.length>want){ const s=t.ships.pop(); burst(s.pos,TEAM_COL[t.team],5,5,.6); }
    t.n=want; if(want===0){ t.alive=false; t.squad.n=0; t.squad.state='lost'; }
  } else if(t.kind==='fleet'){
    const want=Math.max(0,Math.ceil(t.hpPool/t.hp));
    while(t.ships.length>want){ const s=t.ships.pop(); burst(s.pos,TEAM_COL[t.team],16,7,.9); }
    if(want===0) destroyFleet(t,src);
  } else {
    const pct=t.hpPool/t.max;
    for(const m of [.75,.5,.25]) if(pct<m&&!fortressMarks.has(m)){ fortressMarks.add(m); logEvent(`要塞装甲 ${m*100}%`,m===.25?'要塞の外殻が崩れ始めた。もう一押しで陥落する。':'要塞表面で誘爆が続いている。砲火はまだ衰えていない。'); }
    if(Math.random()<amt*.06) burst(randShip(t),TEAM_COL[1],10,6,1);
    if(t.hpPool<=0){ t.alive=false; for(let i=0;i<14;i++) burst(randShip(t),HOT,40,14,1.6); end(true); }
  }
}
function destroyFleet(f,src){
  f.alive=false; f.el.remove(); dropArrow(f.arrow); f.arrow=null;
  burst(f.pos,TEAM_COL[f.team],40,10,1.3);
  if(selected===f) select(null);
  logEvent(`${f.name} 全滅`, f.team===0?`${src.name}の攻撃で${f.name}が失われた。残る艦隊で戦線を立て直せ。`:`${src.name}が${f.name}を撃破。${TEAM_NAME[1]}の防空網に穴が開いた。`);
  if(!fleets.some(x=>x.team===0&&x.alive)) end(false);
  updateRoster();
}
function end(win){
  if(over) return; over=true; setPhase('戦闘終結');
  const left=fleets.filter(f=>f.team===0&&f.alive).reduce((s,f)=>s+f.ships.length,0);
  document.getElementById('rh').textContent=win?'勝利':'敗北';
  document.getElementById('rp').textContent=win?`${clockStr()}、要塞カリュブディス陥落。残存艦 ${left}隻。`:`${clockStr()}、連合艦隊は壊滅した。防空隊を一つずつ引き剥がしてから要塞を叩こう。`;
  logEvent(win?'要塞カリュブディス陥落':'連合艦隊 壊滅',win?'要塞の主砲が沈黙した。惑星共和国の防衛線は崩壊。':'作戦は失敗に終わった。');
  setTimeout(()=>{document.getElementById('result').hidden=false;},1600);
}

/* launch: when a spotted enemy comes within reach, docked squadrons sortie one at a time (cooldown cd), up to maxOut at once */
function launchCheck(f){
  for(const h of f.hangars){ const W=WING[h.type];
    if(gameSec<h.next) continue;
    const sq=h.squads.find(q=>q.state==='docked'&&q.n>0&&gameSec>=q.ready); if(!sq) continue;
    const tgt=nearestFoe(f,W.launchR); if(!tgt) continue;
    h.next=gameSec+W.cd; sq.state='out';
    const w={kind:'wing',team:f.team,id:fid++,type:h.type,W,carrier:f,hangar:h,squad:sq,name:`${f.name}${W.name}隊`,
      pos:f.pos.clone(),heading:f.heading.clone(),n:sq.n,launched:sq.n,hp:W.hp,hpPool:sq.n*W.hp,eva:W.eva,dmg:W.dmg,range:W.range,
      vis:W.vis,stl:W.stl,fuel:W.fuel,target:tgt,state:'attack',alive:true,seen:f.seen,everSeen:true,revealT:0,retarget:0,fireTarget:null,radius:0,ships:[]};
    const R=Math.sqrt(sq.n)*.55;
    for(let i=0;i<sq.n;i++){ const a=Math.random()*Math.PI*2,r=R*Math.sqrt(Math.random());
      const off=new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*1.6,Math.sin(a)*r); w.ships.push({off,pos:f.pos.clone(),wob:Math.random()*6}); }
    sq.wing=w; wings.push(w);
    if(f.team===0&&!h.announced){ h.announced=true;
      logEvent(`${f.name} ${W.name}発進`,`${tgt.name}を捉え、${W.name}${sq.n}機が発進。最大${W.maxOut}隊まで順に出撃し、燃料が尽きると母艦へ戻る。`); }
  }
}
/* back aboard: half of this sortie's losses are made up from the reserve, then the squadron rearms */
function dock(w){
  const h=w.hangar, q=w.squad, rec=Math.min(Math.ceil((w.launched-w.n)/2),h.reserve);
  h.reserve-=rec; q.n=w.n+rec; q.state='docked'; q.ready=gameSec+w.W.rearm; q.wing=null; w.alive=false;
}
function stepWings(dt){
  for(const w of wings){ if(!w.alive) continue;
    const c=w.carrier;
    if(w.state==='attack'){
      w.fuel-=dt;
      if(!w.target||!w.target.alive||!w.target.seen) w.target=nearestFoe(w,w.W.launchR*.6)||(c.alive?nearestFoe(c,w.W.launchR):null);
      if(w.fuel<=0||!w.target){ w.state='return'; w.target=null; }
    }
    if(w.state==='return'&&!c.alive){ w.fuel-=dt; if(w.fuel<=-w.W.fuel*.5){ w.alive=false; w.squad.n=0; w.squad.state='lost'; continue; } }
    const goal=w.state==='attack'?w.target.pos:(c.alive?c.pos:null);
    if(goal){
      const stop=w.state==='attack'?w.range*.6+(w.target.radius||0):1;
      _v.subVectors(goal,w.pos); const d=_v.length();
      if(w.state==='return'&&d<=stop+.5){ dock(w); continue; }
      if(d>stop){ _v.normalize(); w.pos.addScaledVector(_v,Math.min(w.W.speed*dt,d-stop)); w.heading.lerp(_v,Math.min(1,dt*4)).normalize(); }
    }
    if(w.state!=='attack') continue;
    w.retarget-=dt; if(w.retarget<=0){ w.retarget=.4; w.fireTarget=nearestFoe(w,w.range); }
    const ft=w.fireTarget;
    if(ft&&ft.alive&&ft.seen&&gap(w,ft)<=w.range*1.08){
      damage(ft,w.n*w.dmg*dt,w); w.revealT=FIRE_REVEAL;
      if(Math.random()<Math.min(w.n,10)*1.4*dt) shoot(randShip(w),randShip(ft),TEAM_COL[w.team],.18);
    }
  }
  wings=wings.filter(w=>w.alive);
}

let aiTimer=0;
/* with no allied fleet in sight, the reinforcement takes up a watch north of the fortress */
const HUNT_POST=new THREE.Vector3(0,22,-38);
function enemyAI(){
  const foes=fleets.filter(f=>f.team===0&&f.alive&&f.seen);
  for(const f of fleets){
    if(f.team!==1||!f.alive) continue;
    let threat=null,bd=f.ai==='hunt'?1e9:f.leash;
    for(const p of foes){ const d=p.pos.distanceTo(f.post); if(d<bd){bd=d;threat=p;} }
    if(threat){ if(!(f.order&&f.order.target===threat)) order(f,{type:'attack',target:threat}); }
    else if(f.ai==='hunt'){ if(f.pos.distanceTo(HUNT_POST)>2&&(!f.order||f.order.type!=='move')) f.order={type:'move',dest:HUNT_POST.clone()}; }
    else if(!f.order||f.order.type!=='move'){ if(f.pos.distanceTo(f.post)>2){ f.order={type:'move',dest:f.post.clone()}; } else f.order=null; }
  }
}

function step(dt){
  gameSec+=dt;
  if(!reinforced&&gameSec>=60){ reinforced=true;
    const r=makeFleet(1,{name:'第5戦隊',sub:'本国からの増援',n:14,hp:30,dmg:3,range:20,speed:6.5,scale:1.3,pos:[10,-150],alt:34,ai:'hunt',leash:0});
    fleets.push(r); makeArrow(r.pos,new THREE.Vector3(0,20,-60),TEAM_COL[1],{life:6});
    logEvent('北宙域に艦影の反応','本国航路の出口で大きな反応。惑星共和国の増援とみられる。位置をつかむには視界に捉える必要がある。');
  }
  for(const u of units()) if(u.revealT>0) u.revealT-=dt;
  fogTimer-=dt; if(fogTimer<=0){fogTimer=.25; updateFog();}
  aiTimer-=dt; if(aiTimer<=0){aiTimer=.5; enemyAI();}
  stepWings(dt);
  for(const f of fleets){
    if(!f.alive) continue;
    if(f.hangars.length) launchCheck(f);
    f.retarget-=dt; if(f.retarget<=0){ f.retarget=.4; f.fireTarget=nearestFoe(f,f.range); }
    let goal=null, stop=.6;
    if(f.order){
      if(f.order.type==='move') goal=f.order.dest;
      else { const t=f.order.target; if(!t.alive){ f.order=null; }
        else if(!t.seen){ if(f.team===0&&t.lastPos) order(f,{type:'move',dest:t.lastPos.clone()}); else { f.order=null; dropArrow(f.arrow); f.arrow=null; } if(f.order) goal=f.order.dest; }
        else { goal=t.pos; stop=f.range*.75+(t.radius||0); } }
    }
    if(goal){
      _v.subVectors(goal,f.pos); const d=_v.length();
      if(d>stop){ _v.normalize(); f.pos.addScaledVector(_v,Math.min((f.syncSpeed||f.speed)*dt,d-stop)); f.heading.lerp(_v,Math.min(1,dt*3)).normalize(); }
      else if(f.order.type==='move'){ f.order=null; if(f.arrow){ dropArrow(f.arrow); f.arrow=null; } }
    }
    const ft=f.fireTarget;
    if(ft&&ft.alive&&ft.seen&&gap(f,ft)<=f.range*1.08){
      if(!goal){ _v.subVectors(ft.pos,f.pos).normalize(); f.heading.lerp(_v,Math.min(1,dt*2)).normalize(); }
      damage(ft,f.ships.length*f.dmg*dt,f); f.revealT=FIRE_REVEAL;
      const rate=Math.min(f.ships.length,12)*1.6;
      if(Math.random()<rate*dt) shoot(randShip(f),randShip(ft).clone().add(new THREE.Vector3((Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2)),TEAM_COL[f.team],.28);
      if(Math.random()<rate*dt*.5) shoot(randShip(f),randShip(ft),TEAM_COL[f.team],.22);
    }
  }
  if(fortress.alive){
    fortress.retarget-=dt; if(fortress.retarget<=0){fortress.retarget=.5; fortress.fireTarget=nearestFoe(fortress,fortress.range);}
    const ft=fortress.fireTarget;
    if(ft&&ft.alive&&ft.seen){ damage(ft,fortress.dps*dt,fortress); if(Math.random()<dt*14) shoot(randShip(fortress),randShip(ft),new THREE.Color(1,.55,.3),.35); }
  }
}

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
})();
