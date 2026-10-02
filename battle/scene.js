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
