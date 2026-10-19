/* War of Space battle: the base's gates and the armoured infantry round them (第5節 フェブルアーリア: op.body.blocks with gate:true, op.base;
   user decision 2026-10-16, from the samples the user chose: the long octagonal lid, the state band over it, the infantry as dots (案1)
   and their fire (案c)). The lid is two leaves, north and south, hinged at the two short ends and parted along the middle east-west
   (user decision 2026-10-16); it stays shut in battle. Drawing only: the shields, the sealing and the infantry's fire are in sim.js.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html). Sizes are 仮 */
const baseObj=new THREE.Group(); scene.add(baseObj);
/* a gate is GATE_SCALE times the shapes below (about 24 long north-south and 15 wide); its collar stands GATE_TOP over the crater floor */
const GATE_SCALE=1.5, GATE_TOP=.6;
/* the band over a gate: blue while the shield holds, amber at GATE_AMBER of it or under (the lid then shows the damage), grey once sealed (仮) */
const GATE_COL={ok:0x7fc8ff, band:0x6fb8ff, amber:0xffb347, grey:0x93a3b8}, GATE_AMBER=.6;
const GM={
  hull:new THREE.MeshStandardMaterial({color:0x8a8f99,metalness:.5,roughness:.5}),
  plate:new THREE.MeshStandardMaterial({color:0x6f7782,metalness:.35,roughness:.62}),
  plate2:new THREE.MeshStandardMaterial({color:0x828a95,metalness:.35,roughness:.6}),
  dark:new THREE.MeshStandardMaterial({color:0x3b4250,metalness:.4,roughness:.7}),
  char:new THREE.MeshStandardMaterial({color:0x24262a,metalness:.25,roughness:.95}),
  burnt:new THREE.MeshStandardMaterial({color:0x423e3b,metalness:.3,roughness:.85}),
  burnt2:new THREE.MeshStandardMaterial({color:0x5a5653,metalness:.3,roughness:.8}),
  rubble:new THREE.MeshStandardMaterial({color:0x34302d,roughness:1,metalness:0,flatShading:true}),
  berm:new THREE.MeshStandardMaterial({color:0x3b4250,metalness:.4,roughness:.7,flatShading:true,side:THREE.DoubleSide}),
  hinge:new THREE.MeshStandardMaterial({color:0x2a2f37,metalness:.65,roughness:.42}),
  seam:new THREE.MeshBasicMaterial({color:0x05070b}),
  hole:new THREE.MeshBasicMaterial({color:0xff7a2a}), holeDark:new THREE.MeshBasicMaterial({color:0x2a1408}), crack:new THREE.MeshBasicMaterial({color:0xff8a3a}),
  soot:new THREE.MeshBasicMaterial({color:0x0d0b0a,transparent:true,opacity:.75,depthWrite:false}),
  soot2:new THREE.MeshBasicMaterial({color:0x080706,transparent:true,opacity:.55,depthWrite:false}),
};
const GM_KEEP=new Set(Object.values(GM));
const pxK=()=>renderer.getPixelRatio();   // the dots and lights are given in screen pixels

/* ---- the rendered rock ---- */
/* the distance of the rendered cap from the body's centre along the unit direction d (the mesh is coarser than bodyShape.R, so what is
   set on R can sink under it): the cell of the cap's grid that d falls in, and the ray against its two triangles */
const _cr=new THREE.Ray(), _cq=new THREE.Quaternion(), _cd=new THREE.Vector3(), _ca=new THREE.Vector3(), _cb=new THREE.Vector3(), _cc=new THREE.Vector3(), _ch=new THREE.Vector3();
function capR(d){
  const C=bodyShape.cap; if(!C) return bodyShape.R(d);
  _cd.copy(d).applyQuaternion(_cq.copy(C.q).invert());
  const th=Math.acos(Math.max(-1,Math.min(1,_cd.y))); if(th>=C.A) return bodyShape.R(d);
  let ph=Math.atan2(_cd.z,-_cd.x); if(ph<0) ph+=Math.PI*2;
  const iy=Math.min(C.H-1,Math.floor(th/C.A*C.H)), ix=Math.min(C.W-1,Math.floor(ph/(Math.PI*2)*C.W)), P=bodyShape.geo.attributes.position, id=(y,x)=>y*(C.W+1)+x;
  const a=id(iy,ix+1), b=id(iy,ix), c=id(iy+1,ix), e=id(iy+1,ix+1);
  _cr.origin.set(0,0,0); _cr.direction.copy(d);
  for(const [p,q,r] of [[a,b,e],[b,c,e]]){ _ca.fromBufferAttribute(P,p); _cb.fromBufferAttribute(P,q); _cc.fromBufferAttribute(P,r);
    if(_cr.intersectTriangle(_ca,_cb,_cc,false,_ch)) return _ch.length(); }
  return bodyShape.R(d);
}
/* the rendered rock at (x, z): the surface height found along y (the rock is star-shaped from its centre), then the mesh in that direction */
function rockAt(x,z){ let lo=-170, hi=80; const v=new THREE.Vector3();
  for(let i=0;i<34;i++){ const m=(lo+hi)/2; v.set(x,m,z).sub(bodyC); if(v.length()<bodyShape.R(v.normalize())) lo=m; else hi=m; }
  v.set(x,(lo+hi)/2,z).sub(bodyC).normalize(); return v.clone().multiplyScalar(capR(v)).add(bodyC); }
/* a frame on the rock at (x, z): a plane fitted over radius r, up = its normal, local -z = north along the plane; set a little into the rock */
function gateFrame(x,z,r){
  const pts=[]; for(let i=-3;i<=3;i++) for(let j=-3;j<=3;j++){ if(i*i+j*j>10) continue; const p=rockAt(x+i*r/3,z+j*r/3); pts.push([p.x-x,p.y,p.z-z]); }
  let n=pts.length,sx=0,sz=0,sy=0,sxx=0,szz=0,sxz=0,sxy=0,szy=0;
  for(const [dx,y,dz] of pts){ sx+=dx; sz+=dz; sy+=y; sxx+=dx*dx; szz+=dz*dz; sxz+=dx*dz; sxy+=dx*y; szy+=dz*y; }
  const A=[[n,sx,sz],[sx,sxx,sxz],[sz,sxz,szz]], B=[sy,sxy,szy];
  const det=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  const D=det(A), col=k=>A.map((row,i)=>row.map((v,j)=>j===k?B[i]:v)), a=det(col(0))/D, b=det(col(1))/D, c=det(col(2))/D;
  let top=-1e9; for(const [dx,y,dz] of pts) top=Math.max(top,y-(a+b*dx+c*dz));
  const up=new THREE.Vector3(-b,1,-c).normalize(), fwd=new THREE.Vector3(0,0,-1).addScaledVector(up,up.z).normalize(), right=new THREE.Vector3().crossVectors(fwd,up).normalize();
  return {pos:new THREE.Vector3(x,a+Math.min(top,.6)-.1,z), up, quat:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,fwd.clone().negate()))};
}

/* ---- small helpers (local coordinates of a gate: x east, -z north, y up) ---- */
let gSeed=7; const gRnd=()=>{ gSeed=(gSeed*16807)%2147483647; return (gSeed-1)/2147483646; };
const gPoly=(n,r,a0=0)=>{ const o=[]; for(let k=0;k<n;k++){ const a=a0+k*Math.PI*2/n; o.push([Math.cos(a)*r,Math.sin(a)*r]); } return o; };
const gScl=(o,k)=>o.map(([x,z])=>[x*k,z*k]);
/* a flat piece from an outline [x, z], t thick, its top at y */
function gSlab(o,t,mat,y=0){ const sh=new THREE.Shape(o.map(([x,z])=>new THREE.Vector2(x,-z))), geo=new THREE.ExtrudeGeometry(sh,{depth:t,bevelEnabled:false});
  geo.rotateX(-Math.PI/2); geo.translate(0,y-t,0); return new THREE.Mesh(geo,mat); }
function gRing(outer,inner,mat,y){ const sh=new THREE.Shape(outer.map(([x,z])=>new THREE.Vector2(x,-z))); sh.holes.push(new THREE.Path(inner.map(([x,z])=>new THREE.Vector2(x,-z))));
  const geo=new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI/2); const m=new THREE.Mesh(geo,mat); m.position.y=y; return m; }
/* the collar: a sloped armoured berm, its top outline at GATE_TOP widening by k down to GATE_TOP-H, so it meets the rock like a foundation */
function gBerm(o,k,H){ const n=o.length, pos=[], idx=[];
  o.forEach(([x,z])=>pos.push(x,GATE_TOP,z)); o.forEach(([x,z])=>pos.push(x*k,GATE_TOP-H,z*k));
  for(let i=0;i<n;i++){ const j=(i+1)%n; idx.push(i,j,n+i, j,n+j,n+i); }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.setIndex(idx); geo.computeVertexNormals();
  const g=new THREE.Group(); g.add(new THREE.Mesh(geo,GM.berm),gSlab(o,.05,GM.berm,GATE_TOP)); return g; }
function gPoints(g,pts,col,size,op=1,add=true){ const p=new Float32Array(pts.length*3); pts.forEach((v,i)=>p.set(v,i*3)); const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(p,3));
  const m=new THREE.Points(geo,new THREE.PointsMaterial({color:col,size:size*pxK(),sizeAttenuation:false,transparent:true,opacity:op,blending:add?THREE.AdditiveBlending:THREE.NormalBlending,depthWrite:false})); g.add(m); return m; }
function gLine(g,pts,col,op,kind='loop'){ const geo=new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(...p))), mat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:op,depthWrite:false});
  const m=kind==='loop'?new THREE.LineLoop(geo,mat):kind==='segs'?new THREE.LineSegments(geo,mat):new THREE.Line(geo,mat); g.add(m); return m; }
const gAt=(o,y)=>o.map(([x,z])=>[x,y,z]);

/* ---- the lid ---- */
/* the collar's outline: a long octagon, pointed north and south with the points cut off (w half width, L half length, c half the short edge) */
const GATE_O=(()=>{ const w=5,L=8,c=1.75; return [[-c,-L],[c,-L],[w,-L/2],[w,L/2],[c,L],[-c,L],[-w,L/2],[-w,-L/2]]; })(), GATE_P=gScl(GATE_O,.775);
const GATE_SPLIT=.5;   // the gap between the two leaves (local)
/* the lid's plates: eight triangles meeting at the middle; the east and west ones are cut by the parting, so each leaf has five.
   Each piece {o, k (its triangle), north} */
const GATE_PIECES=(()=>{ const out=[];
  for(let k=0;k<8;k++){ const a=GATE_P[k], b=GATE_P[(k+1)%8], tris=k===2||k===6?[[[0,0],a,[a[0],0]],[[0,0],[a[0],0],b]]:[[[0,0],a,b]];
    for(const t of tris){ const m=[(t[1][0]+t[2][0])/2,(t[1][1]+t[2][1])/2], L=Math.hypot(m[0],m[1]), north=m[1]<0, dz=(north?-1:1)*GATE_SPLIT/2;
      out.push({o:t.map(([x,z])=>[x+m[0]/L*.09,z+m[1]/L*.09+dz]),k,north}); } }
  return out; })();
/* the hub in the middle, cut in two by the parting */
const GATE_HUB=(()=>{ const h=gScl(GATE_O,.15), n=[[-h[3][0],0],h[7],h[0],h[1],h[2],[h[3][0],0]];
  return [n.map(([x,z])=>[x,z-GATE_SPLIT/2-.02]),n.map(([x,z])=>[x,-z+GATE_SPLIT/2+.02])]; })();
const GATE_LID_Y=GATE_TOP+.55;
function gateLid(g,state){
  const y=GATE_LID_Y, mat=state==='ok'?GM.plate:GM.burnt, inner=state==='ok'?GM.plate2:GM.burnt2;
  GATE_PIECES.forEach(p=>{
    /* worn: the east plate (both leaves' halves of it) blown away, the hot inside showing */
    if(state==='dmg'&&p.k===2){ g.add(gSlab(gScl(p.o,.93),.04,GM.hole,GATE_TOP+.06),gSlab(gScl(p.o,.98),.04,GM.holeDark,GATE_TOP+.03)); return; }
    g.add(gSlab(p.o,.5,mat,GATE_TOP+.45));
    const c=p.o.reduce((s,q)=>[s[0]+q[0]/3,s[1]+q[1]/3],[0,0]);
    g.add(gSlab(p.o.map(([x,z])=>[c[0]+(x-c[0])*.55,c[1]+(z-c[1])*.55]),.16,inner,y+.16)); });
  for(const h of GATE_HUB) g.add(gSlab(h,.5,GM.dark,y+.37));
  /* the parting: a dark gap right across, a raised lip on each leaf's edge */
  g.add(gSlab([[-4.1,-GATE_SPLIT/2-.04],[4.1,-GATE_SPLIT/2-.04],[4.1,GATE_SPLIT/2+.04],[-4.1,GATE_SPLIT/2+.04]],.05,GM.seam,GATE_TOP+.03));
  for(const s of [-1,1]){ const lip=new THREE.Mesh(new THREE.BoxGeometry(7.5,.22,.18),GM.dark); lip.position.set(0,y,s*(GATE_SPLIT/2+.1)); g.add(lip); }
  /* the hinges at the two short ends: a thick pin along the edge in two bearings, with a knuckle in the middle */
  for(const s of [-1,1]){ const z=s*6.62;
    const pin=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,2.9,12),GM.hinge); pin.rotation.z=Math.PI/2; pin.position.set(0,GATE_TOP+.32,z); g.add(pin);
    const kn=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.8,12),GM.hinge); kn.rotation.z=Math.PI/2; kn.position.set(0,GATE_TOP+.34,z); g.add(kn);
    for(const x of [-1.62,1.62]){ const b=new THREE.Mesh(new THREE.BoxGeometry(.42,.68,.86),GM.hinge); b.position.set(x,GATE_TOP+.34,z); g.add(b); } }
  /* the ribs of each leaf, north-south, stopping at the parting */
  const Lp=6.2, Wp=3.875, Cp=1.75*.775, zm=x=>Math.abs(x)<=Cp?Lp:Lp-(Math.abs(x)-Cp)/(Wp-Cp)*(Lp/2);
  for(const x of [-2.6,-1.35,1.35,2.6]){ const z1=zm(x)-.5, z0=GATE_SPLIT/2+.35, L=z1-z0; if(L<.3) continue;
    for(const s of [-1,1]){ const r=new THREE.Mesh(new THREE.BoxGeometry(.16,.2,L),GM.dark); r.position.set(x,y+.1,s*(z0+L/2)); g.add(r); } }
}
function gateLines(g,col,op){ const y=GATE_LID_Y;
  gLine(g,gAt(gScl(GATE_P,.97),y),col,op); gLine(g,gAt(GATE_O,y-.5),col,op*.45);
  for(const h of GATE_HUB) gLine(g,gAt(h,y+.39),col,op*.8,'line');
  const sp=[], hub=gScl(GATE_O,.17), out=gScl(GATE_P,.95); for(let k=0;k<8;k++){ const dz=(hub[k][1]<0?-1:1)*GATE_SPLIT/2; sp.push([hub[k][0],y+.02,hub[k][1]+dz],[out[k][0],y+.02,out[k][1]+dz]); }
  gLine(g,sp,col,op*.5,'segs');
  /* the parting's edges, clearly drawn */
  gLine(g,[[-3.8,y+.12,-GATE_SPLIT/2-.2],[3.8,y+.12,-GATE_SPLIT/2-.2],[-3.8,y+.12,GATE_SPLIT/2+.2],[3.8,y+.12,GATE_SPLIT/2+.2]],col,op,'segs');
}
/* worn armour: soot, glowing cracks where the plates have given, sparks */
function gateWorn(g){ const y=GATE_LID_Y, fz=1.4;
  for(let k=0;k<7;k++){ const a=gRnd()*Math.PI*2, r=1+gRnd()*3.2, s=.6+gRnd()*1.1;
    g.add(gSlab(gPoly(5+(k%3),s,gRnd()*3).map(([px,pz])=>[px*(.7+gRnd()*.6)+Math.cos(a)*r,(pz*(.7+gRnd()*.6)+Math.sin(a)*r)*fz]),.02,GM.soot,y+.03)); }
  for(let k=0;k<5;k++){ const a=gRnd()*Math.PI*2, r=.8+gRnd()*1.8; let px=Math.cos(a)*r, pz=Math.sin(a)*r*fz;
    for(let j=0;j<4;j++){ const nx=px+(gRnd()-.5)*1.8, nz=pz+(gRnd()-.5)*1.8*fz, L=Math.hypot(nx-px,nz-pz), b=new THREE.Mesh(new THREE.BoxGeometry(.09,.04,L),GM.crack);
      b.position.set((px+nx)/2,y+.04,(pz+nz)/2); b.rotation.y=Math.atan2(nx-px,nz-pz); g.add(b); px=nx; pz=nz; } }
  const sp=[]; for(let k=0;k<30;k++){ const a=gRnd()*Math.PI*2, r=gRnd()*4.4; sp.push([Math.cos(a)*r,y+.1+gRnd()*1.6,Math.sin(a)*r*fz]); } gPoints(g,sp,0xffc27a,3);
}
/* breached and blown shut from inside: the lid gone, the opening choked with rubble, torn plates, soot, no lights */
const GATE_RUBBLE=[new THREE.DodecahedronGeometry(1,0),new THREE.TetrahedronGeometry(1,0),new THREE.BoxGeometry(1,.6,1.4)];
function gateSealed(g){ const R=3.9, fz=1.55;
  for(let k=0;k<120;k++){ const a=gRnd()*Math.PI*2, r=Math.sqrt(gRnd())*R, px=Math.cos(a)*r, pz=Math.sin(a)*r*fz;
    const m=new THREE.Mesh(GATE_RUBBLE[k%3],k%5?GM.rubble:GM.char), s=.35+gRnd()*.75; m.scale.set(s,s*(.5+gRnd()*.6),s*(.7+gRnd()*.6));
    m.position.set(px,GATE_TOP-.25+gRnd()*.6+(1-r/R)*.6,pz); m.rotation.set(gRnd()*3,gRnd()*3,gRnd()*3); g.add(m); }
  [GATE_PIECES[0],GATE_PIECES[4]].forEach((p,i)=>{ const m=gSlab(p.o.map(([px,pz])=>[px*.55,pz*.55]),.4,GM.char,0); m.position.set(i?2.6:-3.1,GATE_TOP+.8,i?-2.2*fz:2.4*fz); m.rotation.set(i?.5:-.35,i?.8:2.1,i?.25:-.4); g.add(m); });
  g.add(gSlab(gPoly(16,R+2.8).map(([px,pz])=>[px*(.85+gRnd()*.3),pz*(.85+gRnd()*.3)*1.5]),.02,GM.soot2,GATE_TOP+.03));
  const sp=[]; for(let k=0;k<10;k++){ const a=gRnd()*Math.PI*2, r=gRnd()*R*.7; sp.push([Math.cos(a)*r,GATE_TOP+.2,Math.sin(a)*r*fz]); } gPoints(g,sp,0xff7a3a,2,.8);
}
/* the band over the gate, like a drop ring: the gate's own outline a little above it, flat so it shows from far off, clockwise from north.
   The bright part is the shield left (a draw range over the closed band) */
const GATE_MARK=gScl(GATE_O,1.31), GATE_MARK_Y=4.2;
const GATE_BAND=(()=>{ const dense=[]; for(let i=0;i<8;i++){ const a=GATE_MARK[i], b=GATE_MARK[(i+1)%8]; for(let k=0;k<12;k++){ const t=k/12; dense.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]); } }
  const ang=p=>{ let v=Math.atan2(p[0],-p[1]); if(v<0) v+=Math.PI*2; return v; }; return dense.sort((p,q)=>ang(p)-ang(q)); })();
function gBand(w,op,col){ const pos=[], idx=[], n=GATE_BAND.length, y=GATE_MARK_Y;
  GATE_BAND.forEach(([x,z])=>{ const L=Math.hypot(x,z)||1; pos.push(x,y,z, x+x/L*w,y,z+z/L*w); });
  for(let i=0;i<n;i++){ const j=(i+1)%n; idx.push(2*i,2*j,2*i+1, 2*j,2*j+1,2*i+1); }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.setIndex(idx);
  return new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:op,depthWrite:false,side:THREE.DoubleSide})); }
function gateMarker(L,state){ const g=new THREE.Group();
  if(state==='sealed'){ g.add(gBand(.45,.5,GATE_COL.grey));
    const s=3.4, f=1.5; for(const sg of [1,-1]){ const b=new THREE.Mesh(new THREE.BoxGeometry(.4,.02,Math.hypot(2*s,2*s*f)),new THREE.MeshBasicMaterial({color:GATE_COL.grey,transparent:true,opacity:.5,depthWrite:false}));
      b.position.y=GATE_MARK_Y; b.rotation.y=Math.atan2(2*s,2*s*f*sg); g.add(b); }
    L.dim=L.lit=null; return g; }
  L.dim=gBand(.5,.16,GATE_COL.band); L.lit=gBand(.5,.75,GATE_COL.band); g.add(L.dim,L.lit); return g; }

/* ---- the infantry: dots on the rock round a gate, in small fire teams (案1: the allies' colour with a dark rim, about 3 px on the screen
   whatever the zoom). The teams are drawn in a shuffled order, so as the shield goes down whole teams go in (draw range) ---- */
let infRim=null;
function infRimTex(){ if(infRim) return infRim; const c=document.createElement('canvas'); c.width=c.height=16; const x=c.getContext('2d');
  x.fillStyle='rgba(8,12,20,.9)'; x.beginPath(); x.arc(8,8,7.6,0,Math.PI*2); x.fill(); x.fillStyle='#fff'; x.beginPath(); x.arc(8,8,4.4,0,Math.PI*2); x.fill();
  return infRim=new THREE.CanvasTexture(c); }
/* teams: how many fire teams of `per`, unless the data gives the head count n (2026-10-18, user decision: twice the infantry, 72 a gate and 16 a gun) */
const INF_LOOK={teams:18, per:4, rMin:10.5, rMax:23, flat:1.37, spread:1.6, size:5, lift:.3};   // 1ゲートに72（18組×4）。東西 10.5〜23、南北 14〜32（仮。前は36、9組・〜19）
function infDots(x,z,I=INF_LOOK,n){ const teams=[], nt=n?Math.max(1,Math.round(n/I.per)):I.teams;
  for(let t=0;t<nt;t++){ const a=t*Math.PI*2/nt+gRnd()*.5, r=I.rMin+gRnd()*(I.rMax-I.rMin), cx=x+Math.cos(a)*r, cz=z+Math.sin(a)*r*I.flat, team=[];
    for(let k=0;k<I.per;k++){ const p=rockAt(cx+(gRnd()-.5)*I.spread,cz+(gRnd()-.5)*I.spread); p.y+=I.lift; team.push(p); } teams.push(team); }
  for(let i=teams.length-1;i>0;i--){ const j=Math.floor(gRnd()*(i+1)); [teams[i],teams[j]]=[teams[j],teams[i]]; }
  const pts=teams.flat(), p=new Float32Array(pts.length*3); pts.forEach((v,i)=>p.set([v.x,v.y,v.z],i*3));
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(p,3));
  const m=new THREE.Points(geo,new THREE.PointsMaterial({color:ALLY_HEX,size:I.size*pxK(),sizeAttenuation:false,transparent:true,depthWrite:false,map:infRimTex(),alphaTest:.05}));
  m.renderOrder=3; baseObj.add(m); return {m,pts}; }

/* ---- the base's guns (第5節; user decision 2026-10-17, 案I: the user's sketch (案H) with 案D's gun house inside): a round shaft straight down into the rock, ringed by an
   octagonal berm and a round collar, with a floor. The gun house (案D's: seen from above a long trapezoid, a rectangle, a short trapezoid) sits wholly
   under the ground; a ring round its upper part turns all the way round (traverse) and a bar across the ring is the axis it swings on
   (elevation, PIT_EL); only the twin barrels stand out of the mouth. They turn and rise toward the target, PIT_TURN a second; a target lower
   than PIT_EL[0] the gun cannot reach (sim.js pitCan). The shaft is seen into: a disc at the mouth marks the stencil where nothing nearer
   is drawn, the shaft is drawn there over the rock (depth always), then the house, the ring, the bar and the lamps with the usual depth test.
   Sizes are the sample's units × PIT_S (twice the old battery, as the user chose). A few infantry (data inf) stand round each gun (PIT_INF). 数値は仮 ---- */
const PIT_S=1.1, PIT_R=.8, PIT_AXIS=.8, PIT_DEEP=2.3, PIT_EL=[.349,1.57], PIT_REST=1.4, PIT_TURN=1.2;   // 仰角20〜90度（2026-10-18、ユーザー決定。その前は38、48）
/* aimed low, the gun rises in its shaft (2026-10-18, with the 20 degrees) so the barrels clear the collar: its bar stands at least
   PIT_POP[0] over the mouth where the barrels cross the collar's outer edge (PIT_POP[1] from the middle). A lost gun lies at PIT_DEAD, down */
const PIT_POP=[.2,1.16], PIT_DEAD=.84;
function pitLift(el){ return Math.max(0,PIT_POP[0]-PIT_POP[1]*Math.tan(el)+PIT_AXIS); }
const PIT_INF={teams:4, per:4, rMin:3.6, rMax:6.5, flat:1, spread:1.3, size:5, lift:.3};   // 16人（4組×4。前は8、2組・〜5.5。仮）
const PM={dead:new THREE.MeshStandardMaterial({color:0x2a2e33,metalness:.3,roughness:.9}),
  shaft:new THREE.MeshStandardMaterial({color:0x4a5462,roughness:.9,metalness:.2,side:THREE.DoubleSide,depthFunc:THREE.AlwaysDepth,
    stencilWrite:true,stencilRef:1,stencilFunc:THREE.EqualStencilFunc}),
  mask:new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,stencilWrite:true,stencilRef:1,stencilFunc:THREE.AlwaysStencilFunc,stencilZPass:THREE.ReplaceStencilOp}),
  lamp:new THREE.MeshBasicMaterial({color:0x9fd8ff})};
let pitMat=null;
function pitRing(ro,ri,h,y){ const sh=new THREE.Shape(); sh.absarc(0,0,ro,0,Math.PI*2,false); const hp=new THREE.Path(); hp.absarc(0,0,ri,0,Math.PI*2,true); sh.holes.push(hp);
  return at(new THREE.ExtrudeGeometry(sh,{depth:h,bevelEnabled:false,curveSegments:32}),0,y,0,-Math.PI/2); }
let pitGeo=null;
function pitGeos(){ if(pitGeo) return pitGeo; const R=PIT_R, A=PIT_AXIS, fix=[], turn=[], gun=[];
  for(let i=0;i<8;i++){ const a=i*Math.PI/4; fix.push(at(box(.98,.26,.22),Math.sin(a)*1.22,.13,Math.cos(a)*1.22,0,a,0)); }
  fix.push(pitRing(1.0,R,.14,0), pitRing(1.16,1.0,.05,0));
  /* the traverse ring with its rollers, and the bar across it (the elevation axis): they turn together */
  turn.push(at(new THREE.TorusGeometry(R-.06,.045,8,40),0,-A,0,Math.PI/2), at(box(2*(R-.08),.07,.09),0,-A,0));
  for(let i=0;i<4;i++){ const a=i*Math.PI/2+Math.PI/4; turn.push(at(box(.1,.06,.06),Math.sin(a)*(R-.01),-A,Math.cos(a)*(R-.01),0,a,0)); }
  /* the gun, on the bar (+z along the barrels): 案D's house (user decision 2026-10-17: the gun inside as in 案D) — seen from above a long
     trapezoid to the front, a rectangle, a short trapezoid at the back, its roof low at the front — the bar through its middle, and the
     barrels out of tall slots in its front face */
  gun.push(loft([[-.82,.34,.19],[-.47,.52,.19],[.05,.52,.19],[.75,.22,.11,-.08]],RECT));
  for(const x of [.1,-.1]) gun.push(at(taper(.07,.05,1.9,10),x,0,.72+.95), at(tube(.075,.14,10),x,0,2.62), at(box(.1,.26,.08),x,-.02,.7));
  const lamps=[]; for(let i=0;i<12;i++){ const a=i*Math.PI/6; lamps.push(at(box(.05,.05,.05),Math.cos(a)*R*.97,i%2?-.9:-1.5,Math.sin(a)*R*.97)); }
  const mask=new THREE.CircleGeometry(R,40); mask.rotateX(-Math.PI/2); mask.translate(0,.005,0);
  const wall=new THREE.CylinderGeometry(R,R,PIT_DEEP,40,1,true); wall.translate(0,-PIT_DEEP/2,0);
  const floor=new THREE.CircleGeometry(R,40); floor.rotateX(-Math.PI/2); floor.translate(0,-PIT_DEEP,0);
  return pitGeo={fix:joinParts(fix), turn:joinParts(turn), gun:joinParts(gun), lamps:joinParts(lamps), mask, shaft:joinParts([wall.toNonIndexed(),floor.toNonIndexed()])}; }
/* a gun of the base (a fixed fleet with pit): set on the rock at its [x, z], its ships (the two barrels) at the muzzles */
function pitBuild(f){
  if(!pitMat){ const c=TEAM_COL[2]; pitMat=new THREE.MeshStandardMaterial({color:c.clone().multiplyScalar(.4),emissive:c,emissiveIntensity:.176,metalness:.35,roughness:.5}); }   // 80% of the ships' light (user decision 2026-10-17: it shone too much to see)
  const G=pitGeos(), F=gateFrame(f.pos.x,f.pos.z,PIT_S*1.4), root=new THREE.Group(); root.position.copy(F.pos); root.quaternion.copy(F.quat); root.scale.setScalar(PIT_S); baseObj.add(root);
  const fix=new THREE.Mesh(G.fix,pitMat), mask=new THREE.Mesh(G.mask,PM.mask), shaft=new THREE.Mesh(G.shaft,PM.shaft), lamps=new THREE.Mesh(G.lamps,PM.lamp);
  const yaw=new THREE.Group(), pitch=new THREE.Group(), turn=new THREE.Mesh(G.turn,pitMat), gun=new THREE.Mesh(G.gun,pitMat);
  mask.renderOrder=4; shaft.renderOrder=5; lamps.renderOrder=turn.renderOrder=gun.renderOrder=6; for(const m of [fix,mask,shaft,lamps,turn,gun]) m.userData.keep=true;
  pitch.position.y=-PIT_AXIS; pitch.add(gun); yaw.add(turn,pitch); root.add(fix,mask,shaft,lamps,yaw);
  /* resting: toward the north (local -z), nearly straight up */
  const P={root,fix,turn,gun,yaw,pitch,lamps,up:F.up.clone(),az:Math.PI,el:PIT_REST,dead:false,inf:(gSeed=71+Math.abs(Math.round(F.pos.x*3+F.pos.z)),infDots(F.pos.x,F.pos.z,PIT_INF,f.inf))};
  yaw.rotation.y=P.az; pitch.rotation.x=-P.el; f.pit=P; f.infN=P.inf.pts.length; f.inf=f.infN;
  f.pos.copy(F.pos).addScaledVector(F.up,.6); f.post.copy(f.pos); f.home.copy(f.pos);
  f.ships.forEach(s=>{ s.up=F.up.clone(); s.base=f.pos.clone(); s.pos.copy(s.base); s.muzzle=f.pos.clone(); });
  pitDraw(f,0); }
/* every frame (loop.js): the gimbal turns and raises the barrels toward what the gun fires on; a lost gun lies dark with its barrels down */
const _pl=new THREE.Vector3();
function pitDraw(f,dt){ const P=f.pit; if(!P||P===true) return;
  if(!f.alive){ if(!P.dead){ P.dead=true; P.fix.material=P.turn.material=P.gun.material=PM.dead; P.lamps.visible=false; P.el=PIT_DEAD; P.pitch.rotation.x=-P.el; P.yaw.position.y=0; burst(f.pos,HOT,30,10,1.2); }
    P.inf.m.geometry.setDrawRange(0,0); return; }
  let az=P.az, el=PIT_REST; const t=f.fireTarget;
  if(t&&t.alive){ _pl.copy(t.pos); P.root.worldToLocal(_pl); az=Math.atan2(_pl.x,_pl.z); el=Math.min(PIT_EL[1],Math.max(PIT_EL[0],Math.atan2(_pl.y,Math.hypot(_pl.x,_pl.z)))); }
  const k=Math.min(1,dt*PIT_TURN*2), da=Math.atan2(Math.sin(az-P.az),Math.cos(az-P.az));
  P.az+=Math.sign(da)*Math.min(Math.abs(da),PIT_TURN*dt+Math.abs(da)*k*.2); P.el+=(el-P.el)*k;
  P.yaw.rotation.y=P.az; P.pitch.rotation.x=-P.el; P.yaw.position.y=pitLift(P.el); P.root.updateMatrixWorld(true);
  f.ships.forEach((s,i)=>{ s.muzzle.set(i?-.1:.1,0,2.69); P.pitch.localToWorld(s.muzzle); });
  infLean(P.inf,f,dt); P.inf.m.geometry.setDrawRange(0,f.inf); }

/* ---- building and changing the gates ---- */
function gateDispose(o){ o.traverse(x=>{ if(x.userData.keep) return; if(x.geometry&&!GATE_RUBBLE.includes(x.geometry)) x.geometry.dispose(); if(x.material&&!GM_KEEP.has(x.material)) x.material.dispose(); }); }
/* the gates of the body (blocks with gate:true), each on the floor of its crater: [{name, sub, block, at (the lid's middle), up, look}] */
function buildBase(B){
  for(const c of [...baseObj.children]){ baseObj.remove(c); gateDispose(c); }
  if(!B||!bodyShape) return [];
  return (B.blocks||[]).map((b,i)=>({b,i})).filter(o=>o.b.gate).map(({b,i},n)=>{
    const on=bodyShape.towns[i], floor=on.clone().multiplyScalar(bodyShape.R(on)-.25).add(bodyC), F=gateFrame(floor.x,floor.z,8*GATE_SCALE);
    gSeed=11+n*7; const inf=infDots(F.pos.x,F.pos.z,INF_LOOK,op.base&&op.base.infantry&&op.base.infantry.n);
    const L={name:b.name, sub:b.sub, block:i, frame:F, at:F.pos.clone().addScaledVector(F.up,GATE_LID_Y*GATE_SCALE), up:F.up, inf, state:null, g:null, shown:-1, infN:inf.pts.length, seed:31+n*13};
    gateSet(L,'ok'); return L; });
}
/* the gate drawn in a state: ok (shield whole or little worn) / dmg (worn to GATE_AMBER or under) / sealed (breached and blown shut) */
function gateSet(L,state){
  if(L.state===state) return; L.state=state; L.shown=-1;
  if(L.g){ baseObj.remove(L.g); gateDispose(L.g); }
  const g=new THREE.Group(); g.position.copy(L.frame.pos); g.quaternion.copy(L.frame.quat); g.scale.setScalar(GATE_SCALE); baseObj.add(g); L.g=g; gSeed=L.seed;
  g.add(gBerm(GATE_O,1.3,4)); g.add(gRing(GATE_O,gScl(GATE_O,.79),GM.hull,GATE_TOP+.01));
  if(state!=='sealed'){ gateLid(g,state); gateLines(g,state==='ok'?GATE_COL.ok:GATE_COL.amber,.75); }
  const lit=gAt(gScl(GATE_O,.875),GATE_TOP+.05);
  if(state==='ok') gPoints(g,lit,GATE_COL.ok,3.4);
  if(state==='dmg'){ gPoints(g,lit.filter((_,i)=>i%2===0),GATE_COL.amber,3.4); gateWorn(g); }
  if(state==='sealed') gateSealed(g);
  g.add(gateMarker(L,state));
}
/* every frame (loop.js): the band shows the shield left, the lid its state, the dots the infantry left */
/* our infantry leaning toward the enemy's they fire on (sim.js infAim; 2026-10-18, user: not going far from where they are): each dot
   goes at most INF_LEAN from its place toward them, INF_GO a second, and back when there is none; set on the rock again every TM.reH */
const INF_LEAN=3, INF_GO=1.5, _il=new THREE.Vector3();
function infLean(I,H,dt){ if(!(dt>0)||!I||!I.pts.length) return;
  if(!I.home) I.home=I.pts.map(p=>p.clone()), I.at=I.pts.map(p=>p.clone());
  const A=H.infAim&&H.infAim.n>0?H.infAim:null; let moved=false;
  if(A){ _il.set(A.pos.x-H.pos.x,0,A.pos.z-H.pos.z); const l=_il.length(); if(l>1e-3) _il.multiplyScalar(INF_LEAN/l); else _il.set(0,0,0); } else _il.set(0,0,0);
  const pos=I.m.geometry.attributes.position;
  I.pts.forEach((p,i)=>{ const h=I.home[i], tx=h.x+_il.x, tz=h.z+_il.z, ex=tx-p.x, ez=tz-p.z, d=Math.hypot(ex,ez); if(d<.02) return;
    const s=Math.min(d,INF_GO*dt); p.x+=ex/d*s; p.z+=ez/d*s; moved=true;
    if(Math.hypot(p.x-I.at[i].x,p.z-I.at[i].z)>TM.reH){ p.y=rockAt(p.x,p.z).y+.3; I.at[i].copy(p); }
    pos.setXYZ(i,p.x,p.y,p.z); });
  if(moved) pos.needsUpdate=true; }
function drawGate(G,dt=0){ const L=G.look, k=G.max?Math.max(0,G.hp/G.max):0;
  if(!G.sealed) infLean(L.inf,G,dt);
  gateSet(L,G.sealed?'sealed':k<=GATE_AMBER?'dmg':'ok');
  if(L.lit){ const n=GATE_BAND.length, seg=k>=.999?n:k>0?Math.max(2,Math.round(n*k)):0;
    if(L.shown!==seg){ L.shown=seg; L.lit.geometry.setDrawRange(0,seg*6); L.dim.visible=seg<n; L.lit.material.opacity=seg>=n?.6:.75;
      const c=k>GATE_AMBER?GATE_COL.band:GATE_COL.amber; L.lit.material.color.setHex(c); L.dim.material.color.setHex(c); } }
  L.inf.m.geometry.setDrawRange(0,G.inf);
}

/* ---- the infantry's fire (案c): thin streaks of light, and now and then the thin white trail of an anti-armour rocket with a bright head.
   The rockets and the muzzle glints are a small pool of their own; the streaks are the battle's tracers (effects.js) ---- */
const INF_LINE=new THREE.Color(0xbfe6ff), TROOP_LINE=new THREE.Color(0xffc0ae), RK_MAX=48;   // TROOP_LINE: the enemy's infantry (2026-10-18)
const rkPos=new Float32Array(RK_MAX*6), rkHd=new Float32Array(RK_MAX*2*3);
const rkGeo=new THREE.BufferGeometry(); rkGeo.setAttribute('position',new THREE.BufferAttribute(rkPos,3));
const rkLines=new THREE.LineSegments(rkGeo,new THREE.LineBasicMaterial({color:0xd8dde4,transparent:true,opacity:.6,depthWrite:false})); rkLines.frustumCulled=false; scene.add(rkLines);
const hdGeo=new THREE.BufferGeometry(); hdGeo.setAttribute('position',new THREE.BufferAttribute(rkHd,3));
const hdPts=new THREE.Points(hdGeo,new THREE.PointsMaterial({color:0xffe2b0,size:4.5,sizeAttenuation:false,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); hdPts.frustumCulled=false; scene.add(hdPts);
let rockets=[], glints=[];
/* one burst of fire from the dots of gate L near the target point T (k: the dots still out there) */
function infFire(L,k,T,dt,rate,col=INF_LINE){
  const near=[]; for(let i=0;i<k;i++){ const p=L.inf.pts[i]; if(p.distanceTo(T)<30) near.push(p); } if(!near.length) return;
  const pick=()=>near[(Math.random()*near.length)|0];
  if(Math.random()<k*rate.line*dt){ const a=pick(); shoot(a,T,col,.26); if(glints.length<RK_MAX) glints.push({p:a.clone(),t:.1}); }
  if(Math.random()<k*rate.rocket*dt&&rockets.length<RK_MAX){ const a=pick(); rockets.push({a:a.clone(),b:T.clone(),t:0,dur:.5+a.distanceTo(T)/30}); }
}
/* the enemy's armoured infantry (第5節; user decision 2026-10-18: red dots, ours in the enemy's colour; sim.js troops): one pool of dots */
const TROOP_MAX=2400, tpPos=new Float32Array(TROOP_MAX*3), tpGeo=new THREE.BufferGeometry(); tpGeo.setAttribute('position',new THREE.BufferAttribute(tpPos,3));
const tpPts=new THREE.Points(tpGeo,new THREE.PointsMaterial({color:TEAM_COL[1],size:INF_LOOK.size,sizeAttenuation:false,transparent:true,depthWrite:false,map:infRimTex(),alphaTest:.05}));
tpPts.renderOrder=3; tpPts.frustumCulled=false; scene.add(tpPts);
/* how they walk (2026-10-18, user: not one block sliding along): the sim moves only the group's centre (sim.js stepTroops); here every man
   goes on his own toward his place, at his own pace (TM.v), and his dot is set on the rock again once he has gone TM.reH.
   On the move (user decision 2026-10-18: 見本 B and C together) they go in file, each TM.gap behind the one before along the way the
   centre went, and by bounds: each fire team of four runs TM.beat[0] seconds (TM.run times its pace) and lies down TM.beat[1], on its
   own beat, so some run while the others are down. Stopped (at the enemy, user: 「敵目前で広がる」) they spread out round the centre
   as they landed. 数値は仮 */
const TM={v:[1.7,2.6], run:1.7, gap:.85, beat:[1.1,1.6], reH:.35, still:.6, wave:.5};
const _tw=new THREE.Vector3();
function troopMen(g){ if(g.men) return g.men;
  g.dir=new THREE.Vector3(0,0,-1); g.prevC=g.pos.clone(); g.still=9; g.teamT=[]; g.trail=[g.pos.clone()];
  return g.men=g.dots.map((p,i)=>({p, h:p.clone(), v:TM.v[0]+Math.random()*(TM.v[1]-TM.v[0]), team:(i/4)|0, off:g.offs[i], wob:Math.random()*6})); }
/* the point d behind the head of the way the centre went */
function trailAt(g,d){ const T=g.trail; let p=T[T.length-1]; for(let i=T.length-2;i>=0;i--){ const q=T[i], l=Math.hypot(p.x-q.x,p.z-q.z); if(l>=d) return _tw.set(p.x+(q.x-p.x)*d/l,0,p.z+(q.z-p.z)*d/l); d-=l; p=q; } return _tw.set(p.x,0,p.z); }
function stepTroopMen(g,dt){
  const M=troopMen(g); if(dt<=0) return;
  const dx=g.pos.x-g.prevC.x, dz=g.pos.z-g.prevC.z, dm=Math.hypot(dx,dz);
  if(dm>1e-4){ g.dir.x+=(dx/dm-g.dir.x)*.2; g.dir.z+=(dz/dm-g.dir.z)*.2; g.dir.y=0; g.dir.normalize(); g.still=0; } else g.still+=dt;
  g.prevC.copy(g.pos);
  const L=g.trail[g.trail.length-1]; if(Math.hypot(g.pos.x-L.x,g.pos.z-L.z)>.5){ g.trail.push(g.pos.clone()); if(g.trail.length>160) g.trail.shift(); }
  const moving=g.still<TM.still, px=-g.dir.z, pz=g.dir.x;
  M.forEach((m,i)=>{ if(i>=g.n) return;
    let tx=g.pos.x+m.off[0], tz=g.pos.z+m.off[1];
    if(moving){ const q=trailAt(g,i*TM.gap+.5), w=Math.sin(time*1.1+m.wob)*TM.wave; tx=q.x+px*w; tz=q.z+pz*w; }
    const ex=tx-m.p.x, ez=tz-m.p.z, d=Math.hypot(ex,ez); if(d<.05) return;
    let v=m.v*Math.min(1.3,.35+d/2);
    if(moving){ const T=g.teamT[m.team]??=Math.random()*3, ph=(time+T)%(TM.beat[0]+TM.beat[1]); v=ph<TM.beat[0]?m.v*TM.run:d>5?m.v:0; }   // its team's bound: run, or lie down (catching up if left far behind)
    const s=Math.min(d,v*dt); m.p.x+=ex/d*s; m.p.z+=ez/d*s;
    if(Math.hypot(m.p.x-m.h.x,m.p.z-m.h.z)>TM.reH){ m.p.y=rockAt(m.p.x,m.p.z).y+.3; m.h.copy(m.p); } });
}
function drawTroops(dt=0){ let n=0;
  for(const g of troops){ stepTroopMen(g,dt); const k=Math.min(g.n,g.dots.length); for(let i=0;i<k&&n<TROOP_MAX;i++){ const p=g.dots[i]; tpPos[n*3]=p.x; tpPos[n*3+1]=p.y; tpPos[n*3+2]=p.z; n++; } }
  tpGeo.setDrawRange(0,n); tpGeo.attributes.position.needsUpdate=true; tpPts.material.size=INF_LOOK.size*pxK(); }
function stepBaseFx(dt){
  drawTroops(dt);
  let n=0, h=0;
  rockets=rockets.filter(r=>{ r.t+=dt; const f=r.t/r.dur; if(f>=1){ burst(r.b,HOT,4,4,.4); return false; }
    _v.lerpVectors(r.a,r.b,f); _w.lerpVectors(r.a,r.b,Math.max(0,f-Math.min(.5,3.5/Math.max(1,r.a.distanceTo(r.b)))));
    rkPos.set([_w.x,_w.y,_w.z,_v.x,_v.y,_v.z],n*6); n++; rkHd.set([_v.x,_v.y,_v.z],h*3); h++; return true; });
  glints=glints.filter(g=>{ g.t-=dt; if(g.t<=0) return false; if(h<RK_MAX*2){ rkHd.set([g.p.x,g.p.y,g.p.z],h*3); h++; } return true; });
  rkGeo.setDrawRange(0,n*2); rkGeo.attributes.position.needsUpdate=true; hdGeo.setDrawRange(0,h); hdGeo.attributes.position.needsUpdate=true;
  hdPts.material.size=4.5*pxK();
}
