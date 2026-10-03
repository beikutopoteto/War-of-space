/* War of Space battle: renderer, scene, stars, grid, fortress asteroid, debris.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
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
  uniforms:{uTime:{value:0},uZone:{value:1},uC:{value:new THREE.Vector2()},uFrame:{value:0}},
  vertexShader:'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`
    varying vec2 vP; uniform float uTime, uZone, uFrame; uniform vec2 uC;
    float ln(float x,float w){float d=abs(fract(x-.5)-.5)/max(fwidth(x),1e-4);return 1.-min(d/w,1.);}
    void main(){
      float r=length(vP);
      vec2 wP=vP+uC;   /* the squares stay put in space while the plane follows a moving field (uC) */
      float sq=max(ln(wP.x/10.,1.),ln(wP.y/10.,1.))*.16;
      float ring=(r<161.)?ln(r/20.,1.6)*.75:0.;
      float ang=atan(vP.y,vP.x)/6.2831853*12.;
      float rad=ln(ang,1.3)*.45*smoothstep(9.,14.,r);
      float fade=1.-smoothstep(130.,260.,r);
      vec3 cyan=vec3(.5,.8,1.);
      vec3 col=cyan; float a=max(sq,max(ring,rad))*fade;
      float zone=(1.-smoothstep(39.6,40.,r))*uZone;
      float edge=ln(r/40.,2.2)*step(30.,r)*step(r,50.)*uZone;
      col=mix(col,vec3(1.,.42,.3),zone*.85);
      a=max(a,zone*.13);
      a+=edge*(.9+.1*sin(uTime*2.));
      float frame=ln(r/215.,1.6)*step(200.,r)*step(r,230.)*uFrame;   /* the edge of a field that moves with the convoy */
      a=max(a,frame*.55);
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

/* relay station (中継ステーション): a hub, a turning habitat ring on spokes, solar wings and a docking arm */
const stationObj=new THREE.Group(), stationRing=new THREE.Group();
{
  const hull=new THREE.MeshStandardMaterial({color:0x8a96a8,metalness:.6,roughness:.4}), dark=new THREE.MeshStandardMaterial({color:0x3a4658,metalness:.5,roughness:.6});
  const panel=new THREE.MeshStandardMaterial({color:0x1d3f7a,emissive:0x16306a,emissiveIntensity:.5,metalness:.4,roughness:.3});
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,7,16),hull); stationObj.add(hub);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(2.3,16,10),dark); cap.position.y=3.6; stationObj.add(cap);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(10,1.1,10,48),hull); ring.rotation.x=Math.PI/2; stationRing.add(ring);
  for(let i=0;i<4;i++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,10),dark); sp.rotation.y=i*Math.PI/2; sp.position.set(Math.sin(i*Math.PI/2)*5,0,Math.cos(i*Math.PI/2)*5); stationRing.add(sp); }
  stationObj.add(stationRing);
  [-1,1].forEach(s=>{ const arm=new THREE.Mesh(new THREE.BoxGeometry(9,.3,.3),dark); arm.position.set(s*6.5,-2.8,0); stationObj.add(arm);
    const w=new THREE.Mesh(new THREE.BoxGeometry(6,.12,3.2),panel); w.position.set(s*11.5,-2.8,0); stationObj.add(w); });
  const dock=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,7),dark); dock.position.set(0,-2,5.5); stationObj.add(dock);
  const n=40,p=new Float32Array(n*3); for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; p.set([Math.cos(a)*10,.9*(i%2?1:-1),Math.sin(a)*10],i*3); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3));
  stationRing.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xbfe4ff,size:.5,transparent:true,blending:THREE.AdditiveBlending})));
}
stationObj.position.y=3; stationObj.visible=false; scene.add(stationObj);

/* departure point (離脱点) for escort operations: a slowly turning ring on the plane */
const exitObj=new THREE.Group();
{
  const m=new THREE.MeshBasicMaterial({color:0x9fe8c8,transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide});
  const r=new THREE.Mesh(new THREE.RingGeometry(9,9.6,64),m); r.rotation.x=-Math.PI/2; exitObj.add(r);
  for(let i=0;i<4;i++){ const t=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.5),m); t.rotation.x=-Math.PI/2; t.rotation.z=i*Math.PI/2; t.position.set(Math.cos(i*Math.PI/2)*11,0,Math.sin(i*Math.PI/2)*11); exitObj.add(t); }
}
exitObj.visible=false; scene.add(exitObj);

/* plasma clouds (プラズマ雲): left by D-RAMS exhaust. A soft pale glow, a few overlapping puffs each;
   the battle uses one sphere per cloud (data: {pos:[x,z], alt, r}). A cloud the camera is inside fades (loop.js) */
const cloudObj=new THREE.Group(); scene.add(cloudObj);
const cloudGeo=new THREE.IcosahedronGeometry(1,3);
function cloudMat(){ return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{uOp:{value:1},uTime:{value:0}},
  vertexShader:'varying vec3 vN;varying vec3 vV;varying vec3 vW;void main(){vN=normalize(normalMatrix*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vec4 mv=viewMatrix*w;vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
  fragmentShader:'varying vec3 vN;varying vec3 vV;varying vec3 vW;uniform float uOp,uTime;void main(){float f=pow(abs(dot(vN,vV)),1.8);float n=.65+.35*sin(vW.x*.11+uTime*.15)*sin(vW.y*.13-uTime*.1)*sin(vW.z*.09);gl_FragColor=vec4(vec3(.62,.58,.95),f*n*.17*uOp);}'}); }
function buildClouds(list){
  for(const m of [...cloudObj.children]){ cloudObj.remove(m); m.material.dispose(); }
  const out=[];
  (list||[]).forEach((c,i)=>{ const at=new THREE.Vector3(c.pos[0],c.alt||0,c.pos[1]), mat=cloudMat();
    const rnd=k=>{ const x=Math.sin((i+1)*91.7+k*13.3)*43758.5453; return x-Math.floor(x); };
    for(let k=0;k<5;k++){ const m=new THREE.Mesh(cloudGeo,mat), r=k?c.r*(.45+.25*rnd(k)):c.r;
      if(k) m.position.set((rnd(k+5)-.5)*c.r,(rnd(k+9)-.5)*c.r*.6,(rnd(k+13)-.5)*c.r);
      m.position.add(at); m.scale.set(r*(1+.15*rnd(k+2)),r*(.75+.2*rnd(k+3)),r); cloudObj.add(m); }
    out.push({c:at,r:c.r,mat}); });
  return out;
}

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
