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
const tube=(r,l,seg=8)=>{ const g=new THREE.CylinderGeometry(r,r,l,seg); g.rotateX(Math.PI/2); return g; } // along Z
const taper=(r0,r1,l,seg=8)=>{ const g=new THREE.CylinderGeometry(r1,r0,l,seg); g.rotateX(Math.PI/2); return g; } // r0 at the back, r1 at the front

/* a hull lofted through cross-sections [z, half-width, half-height, y-offset?] from stern to bow.
   The default cross-section is a flattened hexagon, which gives the hull a keel and a spine; a half-width of 0 ends in a point */
const HEX=[[0,1],[1,.38],[1,-.38],[0,-1],[-1,-.38],[-1,.38]], RECT=[[1,1],[1,-1],[-1,-1],[-1,1]];
/* a box whose sides slope in toward the top (the stealth house of the surface guns) */
const TRAP=[[.6,1],[1,-1],[-1,-1],[-.6,1]];
/* how far the thrusters' nozzles lean back from the rock's face (radians, 仮) */
const THR_TILT=.45;
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
  /* 揚陸艇 (第5節, the enemy's; user decision 2026-10-18, 見本 D3: between A and C): a rounded box hull with a short ramp at the bow, a small
     bridge, a small pod on each side with its nozzle pointing down, and A's four landing legs with pads */
  lc:()=>{ const pod=[...pair(at(loft([[-.24,.08,.08],[.15,.09,.09],[.24,.05,.05]],ROUND),.42,0,-.2)), ...pair(at(new THREE.CylinderGeometry(.06,.08,.075,10),.42,-.11,-.2))];
    const legs=[[.26,.42],[-.26,.42],[.26,-.52],[-.26,-.52]].flatMap(([x,z])=>[limb([x*.9,-.1,z],[x*1.45,-.4,z],.03,.025), at(new THREE.CylinderGeometry(.07,.08,.03,8),x*1.45,-.42,z)]);
    return [loft([[-.85,.3,.16],[-.45,.36,.19],[.4,.33,.17],[.78,.18,.1,-.03]],SQR), at(plate([[-.22,0],[.22,0],[.19,.34],[-.19,.34]],.04),0,-.08,.74,-.55,0,0),
      at(loft([[-.35,.1,.06],[-.1,.11,.11,.04],[.15,0,0,.02]]),0,.17,-.25), ...pod, ...engines([.14,-.14],0,-.9,.075), ...legs]; },
  /* 輸送船: a long cargo spine with containers and a tank, the civilian ship of escort operations */
  tr:()=>[at(box(.5,.5,1.9),0,0,0), at(box(.7,.42,.5),0,.05,.45), at(box(.7,.42,.5),0,.05,-.15), at(tube(.3,.7,10),0,0,-.85), at(box(.36,.3,.32),0,.36,.8)],
  /* 対空砲台 (第4節・第6節): a fixed battery on the surface of a body, built by the Earth to keep raiders off Denali and taken by the
     Republic (user decision 2026-10-23, 見本 B: a small single gun like a destroyer's, not the twin battleship guns of 第5節). An octagonal
     pad and a turntable; a faceted stealth house, pointed at the front, its sides sloping in to the roof, with a low step on the roof; one
     slim barrel out of a slot in its front, held a little raised. The rock is at y -.34 (the gun stands .34 × scale over it, state.js) */
  aa:()=>{ const oct=(r0,r1,h,y)=>{ const g=new THREE.CylinderGeometry(r0,r1,h,8); g.rotateY(Math.PI/8); return at(g,0,y,0); }, G=-.34, EL=.26;
    return [oct(.66,.76,.32,G-.12), oct(.5,.52,.06,G+.06), at(new THREE.CylinderGeometry(.42,.46,.1,16),0,G+.14,0),
      at(loft([[-.44,.26,.13],[-.12,.31,.15],[.16,.27,.13,-.01],[.5,.05,.04,-.08]],TRAP),0,G+.33,0), at(loft([[-.4,.14,.05],[-.2,.15,.05],[-.08,.1,.03]],TRAP),0,G+.52,0),
      at(box(.06,.2,.1),0,G+.32,.36),
      ...[at(tube(.036,1.15,10),0,0,.58), at(taper(.044,.036,.08,10),0,0,1.18), at(box(.06,.08,.3),0,0,.1)].map(g=>at(g,0,G+.32,.22,-EL))]; },
  /* 推進器 (第6節): the Republic's big thruster on Denali, the type that moved the rock of Februaria, firing rock from the mine with fusion
     (user decision 2026-10-23: 見本 B at 1.5 times the sample's size; drawn at scale 1). A hexagonal pad held to the rock by three legs, the feed
     duct from the mine along the rock behind it, a tapering hexagonal reactor, and a magnetic nozzle with no bell: four octagonal coils
     widening upward, tied by three thin beams, with a radiator panel on each side. The nozzle leans back (THR_TILT) from the rock's face:
     all of them face the way that slowed Denali. The rock is at y -.34 as for the guns */
  thr:()=>{ const K=1.5, P=1, top=1.9, legs=[], duct=[at(tube(.2,3.6,8),0,.15,-3.2)], lean=[];
    for(let i=0;i<3;i++){ const a=Math.PI/3+i*Math.PI*2/3, s=Math.sin(a), c=Math.cos(a); legs.push(limb([s*1.1,.1,c*1.1],[s*2.1,-.25,c*2.1],.1,.08), at(new THREE.CylinderGeometry(.22,.28,.12,6),s*2.1,-.25,c*2.1)); }
    for(let i=0;i<3;i++) duct.push(at(new THREE.CylinderGeometry(.28,.28,.14,8),0,.15,-1.8-i*1.2,Math.PI/2));
    lean.push(at(new THREE.CylinderGeometry(.5,.95,1.9,6),0,.95,0), at(taper(.3,.5,.4,8),0,top+.1,0,-Math.PI/2), at(box(.05,1.5,1.1),.98,1,0), at(box(.05,1.5,1.1),-.98,1,0));
    for(const [y,r] of [[2.1,.75],[2.65,1],[3.2,1.28],[3.75,1.56]]){ const g=new THREE.TorusGeometry(r,.11,4,8); g.rotateX(Math.PI/2); g.rotateY(Math.PI/8); lean.push(at(g,0,y,0)); }
    for(let i=0;i<3;i++){ const a=i*Math.PI*2/3+.3; lean.push(limb([Math.sin(a)*.45,top,Math.cos(a)*.45],[Math.sin(a)*1.6,3.85,Math.cos(a)*1.6],.06,.05)); }
    lean.forEach(g=>{ g.translate(0,-P,0); g.rotateX(-THR_TILT); g.translate(0,P,0); });
    const p=[at(new THREE.CylinderGeometry(1.35,1.51,.45,6),0,-.1,0), ...legs, ...duct, ...lean]; p.forEach(g=>{ g.scale(K,K,K); g.translate(0,-.34,0); }); return p; },
  /* fleets without a class (the old cone) */
  gen:()=>[at(new THREE.ConeGeometry(.45,2,5),0,0,0,Math.PI/2)],
};
const CRAFT_SHAPES={
  /* 艦載機: a stealth fighter blended into a flying wing. A swept wing with a sawtooth trailing edge, a chined fuselage with a canopy,
     intakes on each side, two outward-canted tails and flat nozzles */
  ftr:()=>{ const p=[at(plate([[0,0.85],[0.72,-0.1],[0.7,-0.2],[0.47,-0.05],[0.31,-0.3],[0.15,-0.15],[0,-0.3],[-0.15,-0.15],[-0.31,-0.3],[-0.47,-0.05],[-0.7,-0.2],[-0.72,-0.1]],.035),0,0,0), loft([[-.42,.12,.05],[-.1,.17,.08],[.3,.12,.07],[.7,.04,.03],[.92,0,0]]),
    at(loft([[.12,.035,.02],[.32,.045,.045,.01],[.55,0,0]]),0,.06,0), ...pair(at(box(.06,.06,.2),.15,-.01,.12,0,.12,0)),
    ...pair(at(plate([[0,-.06],[0,-.3],[.2,-.36],[.2,-.22]],.02),.12,.04,0,0,0,Math.PI/2-.45)), ...pair(at(box(.09,.035,.08),.07,0,-.44))];
    p.forEach(g=>g.scale(.62,.62,.62)); return p; },
  /* W.A.S. (user decision 2026-10-14: rebuilt from the icon, B-1, with its proportions). Drawn in icon units × 0.1 with the waist at 0,
     facing +Z, its right is -X. Long arms from a point above the shoulder to below the hip, round (a spindle along each arm's axis,
     as thick as the icon's arm is wide); a small faceted head; a wide chest stepping in to a narrow belly; short legs with a thruster
     pod alongside each; thin rods for the joints. The body and the legs are diamonds seen from the side too. It flies leaning
     forward; the arms do not bend at the elbow: each turns as a whole at its joint with the body, about its middle at chest
     height (user decision 2026-10-14: below the shoulder seen from the side), so the rifle on the right arm's axis and the
     cannon over the left shoulder point straight ahead. 0.9 the width (user decision); the size matches the old model */
  was:()=>{ const K=.1, P=([x,y])=>[(x-12)*K,(11.2-y)*K], V=(x,y,z=0)=>new THREE.Vector3(x,y,z), M=()=>new THREE.Matrix4();
    const rotAt=(axis,ang,p)=>M().makeTranslation(p.x,p.y,p.z).multiply(M().makeRotationAxis(axis,ang)).multiply(M().makeTranslation(-p.x,-p.y,-p.z));
    const X=V(1,0,0), Z=V(0,0,1), L=.45;   // lean of the body in flight
    const up=g=>{ g.rotateX(-Math.PI/2); return g; };   // a loft along Z stood up along +Y (its half-height becomes depth)
    const along=(g,a,b)=>{ g.applyMatrix4(M().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(Z,b.clone().sub(a).normalize()))); g.translate(a.x,a.y,a.z); return g; };
    const head=new THREE.IcosahedronGeometry(.085,0); head.scale(1,1.08,1.05);
    const parts=[at(head,0,.415,.01), at(box(.1,.022,.03),0,.42,.085), limb([0,.32,0],[0,.36,0],.025,.022),
      /* torso: deepest at the step of the chest */
      up(loft([[-.05,.012,.012],[0,.055,.06],[.145,.095,.1],[.17,.135,.11],[.3,.17,.07],[.335,.14,.035]],HEX)),
      /* backpack and its two thrusters */
      at(box(.18,.16,.09),0,.2,-.14), ...pair(at(new THREE.CylinderGeometry(.035,.025,.08,8),.06,.09,-.16))], right=[];
    /* the right arm: from the point above the shoulder (TOP) to the end of the forearm (TIP), turned at its joint (PV, 0.59 of the way
       down, at chest height) to point ahead: the front part reaches forward, the pointed rear part runs back past the body */
    const TOP=V(...P([8.2,2.8])), TIP=V(...P([7.32,15])), EL=TOP.clone().lerp(TIP,6.9/12.2), PV=TOP.clone().lerp(TIP,.59), dir=TIP.clone().sub(EL).normalize();
    const armM=M().makeTranslation(PV.x,PV.y,PV.z).multiply(M().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(TIP.clone().sub(TOP).normalize(),V(0,Math.sin(L),Math.cos(L))))).multiply(M().makeTranslation(-PV.x,-PV.y,-PV.z));
    right.push(along(loft([[0,.004,.004],[.27,.075,.075],[.5,.115,.115],[TOP.distanceTo(EL),.128,.128]],ROUND),TOP,EL),
      along(loft([[.46,.118,.118],[.5,.12,.12]],ROUND),TOP,EL),   // a ring where the icon has its panel line
      along(loft([[0,.128,.128],[.26,.13,.13],[.42,.08,.08],[EL.distanceTo(TIP),.03,.03]],ROUND),EL,TIP));
    for(const g of right) g.applyMatrix4(armM);
    for(const [a,b] of [[[10.5,8.7],[8.6,7.6]],[[10.75,9.4],[8.4,9.3]]]) right.push(limb([...P(a),0],V(...P(b)).applyMatrix4(armM).toArray(),.011,.011));
    /* the right leg: thigh and shin (a ^ knee), each a diamond seen from the side, deepest at the knee; a thruster pod alongside */
    const LX=-.105, HIP=V(LX,-.01), KN=V(LX,-.271), thM=rotAt(X,-.35,HIP), knee=KN.clone().applyMatrix4(thM);
    const shM=M().makeTranslation(knee.x-KN.x,knee.y-KN.y,knee.z-KN.z).multiply(rotAt(X,.4,KN));
    const thigh=up(loft([[KN.y,.063,.1],[-.17,.06,.075],[-.073,.057,.05],[HIP.y,.021,.03]],HEX)), shin=up(loft([[-.505,.078,.035],[-.39,.07,.075],[KN.y,.063,.1]],HEX));
    thigh.translate(LX,0,0); shin.translate(LX,0,0); shin.applyMatrix4(shM);
    const kneeCap=new THREE.ConeGeometry(.04,.05,4); kneeCap.rotateX(Math.PI/2); kneeCap.rotateZ(Math.PI/4);
    const pod=up(loft([[-.33,.02,.02],[-.28,.042,.042],[-.1,.04,.04],[-.02,.035,.035],[0,.02,.02]],HEX)); pod.translate(...P([9.62,11.8]),0);
    const noz=new THREE.CylinderGeometry(.03,.045,.05,8); noz.translate(...P([9.62,15.35]),0);
    for(const g of [thigh,pod,noz]) g.applyMatrix4(thM);
    right.push(thigh, shin, pod, noz, at(kneeCap,knee.x,knee.y,knee.z+.1), limb([...P([10.6,11.3]),0],V(...P([10.1,12])).applyMatrix4(thM).toArray(),.01,.01));
    for(const [a,b] of [[[11.3,10.6],[10.92,11.3]],[[11.5,11.05],[11.26,11.35]]]) right.push(limb([...P(a),0],V(...P(b)).applyMatrix4(thM).toArray(),.01,.01));
    /* the rifle in the right hand, on the arm's axis past its end: a grip block and a barrel */
    const on=t=>TIP.clone().addScaledVector(dir,t), rifle=[along(loft([[-.06,.055,.04],[.1,.055,.04]],RECT),on(0),on(1)),
      along(loft([[.1,.018,.018],[.4,.018,.018]],ROUND),on(0),on(1)), along(loft([[.4,.024,.024],[.44,.018,.018]],ROUND),on(0),on(1))];
    for(const g of rifle) g.applyMatrix4(armM);
    /* the left side mirrors the right, without the rifle */
    for(let g of right){ g=g.index?g.toNonIndexed():g; parts.push(g,mirror(g)); }
    parts.push(...rifle);
    /* the cannon over the left shoulder: a mount, a breech block, a long barrel and a muzzle brake, pointing ahead */
    const cm=rotAt(X,Math.PI/2-L,V(.245,.38,-.07));
    parts.push(limb([.15,.3,-.06],[.245,.38,-.07],.02,.018), ...[at(box(.11,.2,.1),.245,.48,-.07), at(up(tube(.022,.52,10)),.245,.84,-.07), at(box(.1,.012,.03),.245,1.1,-.07)].map(g=>g.applyMatrix4(cm)));
    const p=parts.map(g=>g.index?g.toNonIndexed():g); p.forEach(g=>{ g.rotateX(L); g.scale(.38,.42,.42); }); return p; },
};
function shapeGeo(type){ return joinParts((SHAPES[type]||SHAPES.gen)()); }
function craftGeo(type){ return joinParts((CRAFT_SHAPES[type]||CRAFT_SHAPES.ftr)()); }
