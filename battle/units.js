/* War of Space battle: name labels, ship meshes, selection rings, altitude stalks.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- labels ---------- */
const labelsEl=document.getElementById('labels');
function mkUnitLabel(team,name,sub){
  const el=document.createElement('div'); el.className='unit t'+team;
  el.innerHTML=`<div class="emb">${EMB[team]}</div><div class="flag"><b></b><span></span></div>`;
  el.querySelector('b').textContent=name; el.querySelector('span').innerHTML=sub;
  labelsEl.appendChild(el); return el;
}
/* sector names on the battle plane, set per operation */
let sectors=[];
function buildSectors(list){
  sectors.forEach(s=>s.el.remove());
  sectors=(list||[]).map(s=>{const el=document.createElement('div');el.className='sector';el.innerHTML='<b></b><span></span>';
    el.querySelector('b').textContent=s.name; el.querySelector('span').textContent=s.sub||'';
    labelsEl.appendChild(el);return {el,pos:new THREE.Vector3(s.pos[0],0,s.pos[1])};});
}

/* ---------- ships ---------- */
/* one instanced mesh per team and ship class (shapes.js); a ship is drawn at its class's size */
const SHIP_MAX=600, CRAFT_MAX=1500;
const SHIP_SIZE=Object.fromEntries(WOS_DATA.ships.map(s=>[s.id,s.scale*1.2]));
function instanced(geo,mat,max){ const m=new THREE.InstancedMesh(geo,mat,max); m.count=0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled=false; scene.add(m); return m; }
const shipMeshes=[0,1].map(t=>{ const c=TEAM_COL[t];
  const mat=new THREE.MeshStandardMaterial({color:c.clone().multiplyScalar(.5),emissive:c,emissiveIntensity:.22,metalness:.35,roughness:.5});
  return Object.fromEntries(Object.keys(SHAPES).map(k=>[k,instanced(shapeGeo(k),mat,SHIP_MAX)])); });
/* small craft (fighters and W.A.S.) launched from carriers */
const craftMeshes=[0,1].map(t=>{ const c=TEAM_COL[t].clone().lerp(new THREE.Color(1,1,1),.35);
  const mat=new THREE.MeshStandardMaterial({color:c.clone().multiplyScalar(.55),emissive:c,emissiveIntensity:.35,metalness:.2,roughness:.5});
  return Object.fromEntries(Object.keys(CRAFT_SHAPES).map(k=>[k,instanced(craftGeo(k),mat,CRAFT_MAX)])); });

/* faint trails behind small craft: the last TRAIL_N positions, one every TRAIL_DT game seconds (about 0.6 s in all), fading
   toward the tail. W.A.S. trails are a slightly deeper shade than fighters' */
const TRAIL_N=8, TRAIL_DT=.075;
const trailCol=[0,1].map(t=>({ftr:TEAM_COL[t].clone().lerp(new THREE.Color(1,1,1),.35).multiplyScalar(.4),
  was:TEAM_COL[t].clone().offsetHSL(0,.15,-.12).multiplyScalar(.4)}));
const trPos=new Float32Array(CRAFT_MAX*2*TRAIL_N*2*3), trCol=new Float32Array(trPos.length);
const trGeo=new THREE.BufferGeometry();
trGeo.setAttribute('position',new THREE.BufferAttribute(trPos,3)); trGeo.setAttribute('color',new THREE.BufferAttribute(trCol,3));
const trails=new THREE.LineSegments(trGeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
trails.frustumCulled=false; scene.add(trails);

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
    if(f.team===0&&f.order&&f.order.type==='move') pathLeft(f.order).forEach(p=>put(p,TEAM_COL[0],.6));
    if(f.team===0) f.queue.forEach(o=>{ if(o.type==='move') pathLeft(o).forEach(p=>put(p,TEAM_COL[0],.4)); }); }
  sGeo.attributes.position.needsUpdate=sGeo.attributes.color.needsUpdate=true;
  fGeo.attributes.position.needsUpdate=fGeo.attributes.color.needsUpdate=true;
}

/* defense zone as a sphere: three faint great circles around the fortress (hidden when the operation has none) */
const zoneLines=new THREE.Group(); scene.add(zoneLines);
{
  const pts=[]; for(let i=0;i<=96;i++){const a=i/96*Math.PI*2; pts.push(new THREE.Vector3(Math.cos(a)*40,Math.sin(a)*40,0));}
  const g=new THREE.BufferGeometry().setFromPoints(pts), m=new THREE.LineBasicMaterial({color:0xff6a45,transparent:true,opacity:.28,depthWrite:false});
  [0,Math.PI/3,2*Math.PI/3].forEach(r=>{const l=new THREE.Line(g,m); l.rotation.y=r; l.position.y=3; zoneLines.add(l);});
}
