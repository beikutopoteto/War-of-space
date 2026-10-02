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
/* rounded profiles for loft: a circle and a rounded square */
const ROUND=[...Array(12)].map((_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)]);
const SQR=[...Array(16)].map((_,i)=>{ const c=Math.cos(i*Math.PI/8), s=Math.sin(i*Math.PI/8); return [Math.sign(c)*Math.abs(c)**.5,Math.sign(s)*Math.abs(s)**.5]; });
/* an ellipsoid with radii rx, ry, rz at x, y, z */
const ell=(x,y,z,rx,ry,rz)=>{ const g=new THREE.SphereGeometry(1,8,6); g.scale(rx,ry,rz); return at(g,x,y,z); };
/* a round limb from point a to point b, radius r0 at a and r1 at b */
function limb(a,b,r0,r1){ const A=new THREE.Vector3(...a), d=new THREE.Vector3(...b).sub(A), l=d.length(), g=new THREE.CylinderGeometry(r1,r0,l,10);
  g.translate(0,l/2,0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))); g.translate(A.x,A.y,A.z); return g.toNonIndexed(); }
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
  /* 艦載機: a stealth fighter blended into a flying wing. A swept wing with a sawtooth trailing edge, a chined fuselage with a canopy,
     intakes on each side, two outward-canted tails and flat nozzles */
  ftr:()=>[at(plate([[0,0.85],[0.72,-0.1],[0.7,-0.2],[0.47,-0.05],[0.31,-0.3],[0.15,-0.15],[0,-0.3],[-0.15,-0.15],[-0.31,-0.3],[-0.47,-0.05],[-0.7,-0.2],[-0.72,-0.1]],.035),0,0,0), loft([[-.42,.12,.05],[-.1,.17,.08],[.3,.12,.07],[.7,.04,.03],[.92,0,0]]),
    at(loft([[.12,.035,.02],[.32,.045,.045,.01],[.55,0,0]]),0,.06,0), ...pair(at(box(.06,.06,.2),.15,-.01,.12,0,.12,0)),
    ...pair(at(plate([[0,-.06],[0,-.3],[.2,-.36],[.2,-.22]],.02),.12,.04,0,0,0,Math.PI/2-.45)), ...pair(at(box(.09,.035,.08),.07,0,-.44))],
  /* W.A.S.: a small, rounded powered exoskeleton a size larger than a person, leaning into its flight with the elbows and knees bent.
     Large arms: a rifle in the right hand and a cannon above the left shoulder. Flight thrusters on the backpack and at the waist */
  was:()=>{ const lean=.7, c=Math.cos(lean), s=Math.sin(lean), L=(x,y,z)=>[x,y*c-z*s,y*s+z*c], add=(p,q)=>p.map((v,i)=>v+q[i]);
    /* the body, standing and facing +Z (its right is -X) */
    const body=[ell(0,0,0,.095,.06,.07), ell(0,.12,0,.075,.08,.065), ell(0,.25,0,.12,.1,.085), limb([0,.32,0],[0,.37,.01],.03,.026),
      ell(0,.41,.02,.055,.065,.065), ell(0,.415,.065,.045,.022,.025), loft([[-.21,.11,.09,.25],[-.17,.13,.11,.25],[-.09,.12,.1,.25]],SQR)];
    for(const [x,gun] of [[-1,true],[1,false]]){
      const sh=[.16*x,.32,0], el=gun?[.2*x,.15,.08]:[.21*x,.16,.07], hd=gun?[.2*x,.13,.24]:[.2*x,.04,.17];
      body.push(ell(.17*x,.345,0,.075,.045,.085), limb(sh,el,.03,.026), ell(...el,.03,.03,.03), limb(el,hd,.038,.03), ell(...hd,.028,.028,.028));
      const hip=[.08*x,-.04,0], kn=gun?[.09*x,-.27,.08]:[.09*x,-.25,.1], an=gun?[.09*x,-.48,-.02]:[.09*x,-.45,0];
      body.push(limb(hip,kn,.04,.033), ell(...add(kn,[0,0,.02]),.04,.04,.04), limb(kn,an,.045,.032), ell(...add(an,[0,-.02,.035]),.035,.028,.065));
    }
    body.forEach(g=>g.rotateX(lean));
    /* gear, placed level in flight */
    const [, py, pz]=L(0,.3,-.2), [, wy, wz]=L(0,-.01,-.03), [, cy, cz]=L(.15,.42,-.04), [, hy, hz]=L(-.2,.13,.24), gear=[];
    for(const x of [1,-1]) gear.push(
      at(loft([[-.3,.042,.042],[-.22,.055,.055],[.05,.055,.055],[.16,.03,.03],[.2,0,0]],ROUND),.12*x,py,pz), at(taper(.065,.045,.1,12),.12*x,py,pz-.35),
      at(loft([[-.2,.03,.03],[-.14,.038,.038],[.04,.035,.035],[.1,0,0]],ROUND),.14*x,wy,wz), at(taper(.045,.032,.07,12),.14*x,wy,wz-.235));
    gear.push(...pair(at(plate([[.15,-.1],[.3,-.22],[.32,-.28],[.15,-.24]],.02),0,py,pz)),
      /* shoulder cannon */
      limb(L(.13,.36,-.1),[.15,cy+.04,cz+.05],.022,.018), at(loft([[-.16,.045,.05],[.1,.045,.05],[.16,.03,.035]],SQR),.15,cy+.07,cz+.08),
      at(tube(.022,.5,10),.15,cy+.07,cz+.49), at(taper(.022,.03,.05,10),.15,cy+.07,cz+.76),
      /* rifle */
      at(loft([[-.2,.022,.035],[-.12,.03,.045],[.12,.035,.05],[.18,.025,.03]],SQR),-.2,hy+.03,hz+.02),
      at(tube(.018,.4,10),-.2,hy+.035,hz+.4), at(taper(.018,.026,.05,10),-.2,hy+.035,hz+.62), at(box(.028,.09,.05),-.2,hy-.04,hz+.08));
    const p=[...body, ...gear]; p.forEach(g=>g.scale(.55,.55,.55)); return p; },
};
function shapeGeo(type){ return joinParts((SHAPES[type]||SHAPES.gen)()); }
function craftGeo(type){ return joinParts((CRAFT_SHAPES[type]||CRAFT_SHAPES.ftr)()); }
