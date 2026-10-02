/* War of Space battle: explosion particles, tracers, movement arrows.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). */
/* ---------- particles (explosions, sparks) ---------- */
const dot=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
const HOT=new THREE.Color(1,.82,.5);
/* a pool of glowing points: burst(at, color, count, speed, life) throws some out, step(dt) moves and fades them.
   hot is the share of points drawn in the white-hot colour instead of the given one */
function particles(max,size,hot){
  const pos=new Float32Array(max*3), col=new Float32Array(max*3), vel=new Float32Array(max*3), base=new Float32Array(max*3), life=new Float32Array(max), maxL=new Float32Array(max);
  let head=0;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({size,map:dot,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  pts.frustumCulled=false; scene.add(pts);
  return {
    burst(at,c,n,spd,l){
      for(let k=0;k<n;k++){
        const i=head; head=(head+1)%max;
        pos[i*3]=at.x;pos[i*3+1]=at.y;pos[i*3+2]=at.z;
        const v=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize().multiplyScalar(spd*(.3+Math.random()));
        vel[i*3]=v.x;vel[i*3+1]=v.y;vel[i*3+2]=v.z;
        const cc=Math.random()<hot?HOT:c; base[i*3]=cc.r*2;base[i*3+1]=cc.g*2;base[i*3+2]=cc.b*2;
        life[i]=maxL[i]=l*(.5+Math.random()*.7);
      }
    },
    step(dt){
      for(let i=0;i<max;i++){
        if(life[i]>0){
          life[i]-=dt; const k=Math.max(0,life[i]/maxL[i]), d=Math.pow(.25,dt);
          pos[i*3]+=vel[i*3]*dt;pos[i*3+1]+=vel[i*3+1]*dt;pos[i*3+2]+=vel[i*3+2]*dt;
          vel[i*3]*=d;vel[i*3+1]*=d;vel[i*3+2]*=d;
          col[i*3]=base[i*3]*k;col[i*3+1]=base[i*3+1]*k;col[i*3+2]=base[i*3+2]*k;
        } else if(col[i*3]!==0||col[i*3+1]!==0){col[i*3]=col[i*3+1]=col[i*3+2]=0;}
      }
      geo.attributes.position.needsUpdate=true; geo.attributes.color.needsUpdate=true;
    }
  };
}
const blasts=particles(4000,1.8,.55), sparks=particles(600,.35,.3);   // explosions; the tiny sparks W.A.S. give off now and then
function burst(at,col,n,spd,life){ blasts.burst(at,col,n,spd,life); }
function stepParticles(dt){ blasts.step(dt); sparks.step(dt); }

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
/* an arrow shows the route a fleet really takes: a straight line, or opt.curve (the path through queued waypoints) */
const arrows=new Set();
function makeArrow(from,to,col,opt={}){
  const curve=opt.curve||new THREE.LineCurve3(from.clone(),to.clone());
  const len=curve.getLength(); if(len<3) return null;
  const w=opt.width||2.4, tH=1-Math.min(.35,7.5/len);
  const ent=[]; const M=40,K=6;
  for(let i=0;i<=M;i++) ent.push([tH*i/M,w]);
  for(let j=0;j<=K;j++) ent.push([tH+(1-tH)*j/K, w*2.2*(1-j/K)]);
  const P=[],U=[],I=[];
  ent.forEach(([t,wd],k)=>{
    const p=curve.getPointAt(Math.min(t,1)), tg=curve.getTangentAt(Math.min(t,.999)), s=new THREE.Vector3(-tg.z,0,tg.x);
    if(s.lengthSq()<1e-4) s.set(1,0,0); s.normalize().multiplyScalar(wd/2);
    P.push(p.x+s.x,p.y+.5,p.z+s.z,p.x-s.x,p.y+.5,p.z-s.z); U.push(t,0,t,1);
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
  const ar={mesh,mat,len,life:opt.life??Infinity,age:0};
  arrows.add(ar); return ar;
}
function dropArrow(ar){ if(!ar) return; scene.remove(ar.mesh); ar.mesh.geometry.dispose(); ar.mat.dispose(); arrows.delete(ar); }
