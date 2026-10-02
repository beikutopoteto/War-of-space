/* War of Space battle: simple shapes for each ship class and small craft: lofted hulls, flat plates, boxes, cones and cylinders.
   Classic script: top-level names are shared with the other battle/*.js files (loaded in order by index.html).
   Every shape points forward along +Z with +Y up, and is about 2 units long; a ship is drawn at its class's `scale` (data/ships.js). */
const _pm=new THREE.Matrix4(), _pq=new THREE.Quaternion(), _pe=new THREE.Euler();
/* place a primitive: position, then optional rotation (radians) */
function at(g,x,y,z,rx=0,ry=0,rz=0){ g=g.index?g.toNonIndexed():g; _pq.setFromEuler(_pe.set(rx,ry,rz)); g.applyMatrix4(_pm.compose(new THREE.Vector3(x,y,z),_pq,new THREE.Vector3(1,1,1))); return g; }
/* join primitives into one geometry (positions and normals only) */
function joinParts(parts){
  let n=0; parts.forEach(g=>n+=g.attributes.position.count);
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3); let o=0;
  parts.forEach(g=>{ pos.set(g.attributes.position.array,o*3); nor.set(g.attributes.normal.array,o*3); o+=g.attributes.position.count; g.dispose(); });
  const out=new THREE.BufferGeometry(); out.setAttribute('position',new THREE.BufferAttribute(pos,3)); out.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  return out;
}
const box=(w,h,l)=>new THREE.BoxGeometry(w,h,l);
const nose=(r,l,seg=4)=>{ const g=new THREE.ConeGeometry(r,l,seg); g.rotateX(Math.PI/2); return g; }      // tip toward +Z
const tube=(r,l,seg=8)=>{ const g=new THREE.CylinderGeometry(r,r,l,seg); g.rotateX(Math.PI/2); return g; } // along Z
const taper=(r0,r1,l,seg=8)=>{ const g=new THREE.CylinderGeometry(r1,r0,l,seg); g.rotateX(Math.PI/2); return g; } // r0 at the back, r1 at the front

/* a hull lofted through cross-sections [z, half-width, half-height, y-offset?] from stern to bow.
   The default cross-section is a flattened hexagon, which gives the hull a keel and a spine; a half-width of 0 ends in a point */
const HEX=[[0,1],[1,.38],[1,-.38],[0,-1],[-1,-.38],[-1,.38]], RECT=[[1,1],[1,-1],[-1,-1],[-1,1]];
function loft(secs,prof=HEX){
  const ring=s=>prof.map(([px,py])=>new THREE.Vector3(px*s[1],py*s[2]+(s[3]||0),s[0])), rings=secs.map(ring), P=[];
  const tri=(a,b,c,out)=>{ const n=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)); if(n.dot(out)<0) P.push(a,c,b); else P.push(a,b,c); };
  for(let i=0;i<rings.length-1;i++) for(let j=0;j<prof.length;j++){ const k=(j+1)%prof.length, A=rings[i][j], B=rings[i][k], C=rings[i+1][k], D=rings[i+1][j];
    const out=new THREE.Vector3().addVectors(A,C).multiplyScalar(.5); out.z=0; out.y-=((secs[i][3]||0)+(secs[i+1][3]||0))/2;
    tri(A,B,C,out); tri(A,C,D,out); }
  const cap=(r,s,dir)=>{ if(s[1]<=0||s[2]<=0) return; const c=new THREE.Vector3(0,s[3]||0,s[0]); for(let j=0;j<r.length;j++) tri(c,r[j],r[(j+1)%r.length],new THREE.Vector3(0,0,dir)); };
  cap(rings[0],secs[0],-1); cap(rings[rings.length-1],secs[secs.length-1],1);
  const g=new THREE.BufferGeometry(); g.setFromPoints(P); g.computeVertexNormals(); return g;
}
/* a flat plate from an outline in the horizontal plane: points [x, z] (z forward), thickness t */
function plate(pts,t=.03){ const sh=new THREE.Shape(pts.map(([x,z])=>new THREE.Vector2(x,-z))); const g=new THREE.ExtrudeGeometry(sh,{depth:t,bevelEnabled:false});
  g.rotateX(-Math.PI/2); g.translate(0,-t/2,0); return g; }
const mirror=g=>{ const m=g.clone(); m.scale(-1,1,1); const p=m.attributes.position; for(let i=0;i<p.count;i+=3){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i); p.setXYZ(i,p.getX(i+1),p.getY(i+1),p.getZ(i+1)); p.setXYZ(i+1,x,y,z); } m.computeVertexNormals(); return m; };
const pair=g=>{ g=g.index?g.toNonIndexed():g; return [g,mirror(g)]; };
/* a low turret: a flat hexagonal base and a slim barrel pointing forward */
const turret=(x,y,z,r=.12)=>[at(new THREE.CylinderGeometry(r,r*1.15,r*.6,6),x,y,z), at(tube(r*.18,r*2.6,5),x,y+r*.1,z+r*1.4)];
/* engine bells at the stern */
const engines=(xs,y,z,r)=>xs.map(x=>at(taper(r*1.15,r*.8,.22,8),x,y,z));

const SHAPES={
  /* コルベット: a needle with swept wings, the fast scout */
  cv:()=>[loft([[-1,.13,.07],[-.55,.2,.1],[.35,.13,.07],[1.05,0,0]]), ...pair(at(plate([[.08,-.2],[.5,-.65],[.5,-.8],[.08,-.62]]),0,0,0)),
    at(plate([[0,-.35],[0,-.85],[.03,-.85],[.03,-.5]],.02),0,.05,0,0,0,Math.PI/2), ...engines([0],0,-1.08,.09)],
  /* フリゲート: a slim arrow hull with a dorsal fin and twin engines */
  ff:()=>[loft([[-1,.2,.13],[-.35,.25,.16],[.45,.18,.12],[1.05,0,.01]]), at(loft([[-.55,.06,.05],[-.1,.07,.09,.04],[.25,0,0,.02]]),0,.14,0),
    ...pair(at(plate([[.2,-.5],[.42,-.85],[.42,-.95],[.2,-.85]]),0,-.02,0)), ...engines([.1,-.1],0,-1.05,.08)],
  /* 駆逐艦: long and narrow, with a slim torpedo pod on each side */
  dd:()=>[loft([[-1.1,.18,.12],[-.4,.21,.14],[.7,.13,.09],[1.25,0,0]]), at(loft([[-.5,.07,.06],[-.15,.08,.1,.04],[.2,0,0,.02]]),0,.13,0),
    ...pair(at(loft([[-.7,.05,.05],[.3,.05,.05],[.6,0,0]]),.27,-.03,0)), ...pair(at(plate([[.15,-.2],[.27,-.25],[.27,.05],[.15,.15]],.02),0,-.03,0)), ...engines([.08,-.08],0,-1.15,.07)],
  /* 巡洋艦: a broad, sloping hull with a raked bridge and a forward turret */
  cl:()=>[loft([[-1.1,.32,.19],[-.45,.38,.23],[.45,.29,.17],[1.2,0,.01,-.02]]), at(loft([[-.6,.15,.09],[-.25,.17,.16,.06],[.05,.1,.08,.03],[.25,0,0]]),0,.2,0),
    ...turret(0,.2,.45,.11), ...pair(at(plate([[.3,-.45],[.55,-.75],[.55,-.95],[.3,-.9]]),0,-.04,0)), ...engines([.17,-.17,0],0,-1.15,.09)],
  /* 戦艦: the longest hull, stepped superstructure, three turrets and a keel fin */
  bb:()=>[loft([[-1.35,.34,.2],[-.6,.41,.25],[.6,.31,.19],[1.45,0,.01,-.03]]), at(loft([[-.85,.18,.09],[-.35,.2,.17,.06],[.05,.13,.1,.04],[.3,0,0,.02]]),0,.22,0),
    at(loft([[-.6,.08,.07],[-.4,.08,.12,.05],[-.2,0,0,.03]]),0,.44,0),
    ...turret(0,.22,.8,.12), ...turret(0,.25,.48,.12), ...turret(0,.22,-1.0,.11),
    at(plate([[0,-.3],[0,-1.05],[.03,-1.05],[.03,-.5]],.025),0,-.19,0,0,0,-Math.PI/2), ...engines([.18,-.18,0],0,-1.4,.1)],
  /* 戦闘母艦: a long flat flight deck over a slim hull, with the island off to one side */
  cvb:()=>[at(loft([[-1.2,.3,.03],[-.8,.38,.03],[.55,.34,.03],[1.2,.06,.03]],RECT),0,.16,0), loft([[-1.15,.2,.13],[-.4,.23,.15],[.6,.17,.11],[1.15,0,.01]]),
    at(loft([[-.4,.05,.05],[-.22,.06,.18,.09],[0,.035,.09,.05],[.1,0,0]]),.33,.2,0), ...engines([.1,-.1],-.02,-1.2,.08)],
  /* 突撃揚陸艦: a heavy wedge with a blunt bay door at the bow and a pod on each side */
  mas:()=>[loft([[-1.05,.22,.16],[-.3,.29,.21],[.6,.26,.18],[.95,.18,.12]]), ...pair(at(loft([[-.75,.06,.06],[.3,.07,.07],[.6,0,0]]),.32,-.05,0)),
    at(loft([[-.65,.1,.06],[-.35,.11,.12,.05],[-.05,0,0,.02]]),0,.19,0), ...engines([.12,-.12],0,-1.1,.08)],
  /* 強襲母艦: two slim hulls joined by a broad deck */
  masc:()=>[...pair(at(loft([[-1.15,.13,.11],[-.3,.16,.13],[.6,.12,.1],[1.2,0,0]]),.33,0,0)),
    at(loft([[-.85,.36,.025],[.35,.36,.025],[.6,.12,.025]],RECT),0,.1,0), loft([[-.9,.1,.08],[-.2,.12,.1],[.4,.08,.07],[.8,0,0]]),
    at(loft([[-.6,.08,.07],[-.35,.09,.15,.06],[-.05,0,0,.03]]),0,.15,0), ...engines([.33,-.33],0,-1.2,.08)],
  /* 輸送船: a long cargo spine with containers and a tank, the civilian ship of escort operations */
  tr:()=>[at(box(.5,.5,1.9),0,0,0), at(box(.7,.42,.5),0,.05,.45), at(box(.7,.42,.5),0,.05,-.15), at(tube(.3,.7,10),0,0,-.85), at(box(.36,.3,.32),0,.36,.8)],
  /* fleets without a class (the old cone) */
  gen:()=>[at(new THREE.ConeGeometry(.45,2,5),0,0,0,Math.PI/2)],
};
const CRAFT_SHAPES={
  /* 艦載機: a small delta wing */
  ftr:()=>[at(nose(.17,1.2,4),0,0,.15), at(box(1.0,.04,.42),0,0,-.25), at(box(.04,.26,.3),0,.13,-.4)],
  /* W.A.S.: a person-shaped shell leaning into its flight, with a thruster pack on its back */
  was:()=>{ const lean=.7, p=[at(box(.46,.5,.28),0,.15,0), at(box(.2,.2,.2),0,.55,.02), at(box(.12,.5,.14),.32,.1,0), at(box(.12,.5,.14),-.32,.1,0),
      at(box(.15,.55,.16),.13,-.42,0), at(box(.15,.55,.16),-.13,-.42,0), at(box(.38,.32,.16),0,.2,-.23), at(tube(.07,.25),.12,.1,-.4), at(tube(.07,.25),-.12,.1,-.4)];
    p.forEach(g=>g.rotateX(lean)); return p; },
};
function shapeGeo(type){ return joinParts((SHAPES[type]||SHAPES.gen)()); }
function craftGeo(type){ return joinParts((CRAFT_SHAPES[type]||CRAFT_SHAPES.ftr)()); }
