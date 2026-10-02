/* War of Space battle: simple shapes for each ship class and small craft, built from a few boxes, cones and cylinders.
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

const SHAPES={
  /* コルベット: a slim dart with small wings, the fast scout */
  cv:()=>[at(nose(.28,1.5,4),0,0,.25), at(box(.9,.05,.34),0,0,-.55), at(box(.05,.34,.34),0,.16,-.6)],
  /* フリゲート: a short hull with a pointed bow */
  ff:()=>[at(box(.46,.32,1.3),0,0,-.15), at(nose(.27,.6,4),0,0,.8), at(box(.2,.18,.4),0,.24,-.25)],
  /* 駆逐艦: long and thin, with a torpedo tube on each side */
  dd:()=>[at(box(.36,.26,1.7),0,0,-.1), at(nose(.22,.5,4),0,0,1.0), at(tube(.07,1.1),.26,0,0), at(tube(.07,1.1),-.26,0,0), at(box(.16,.2,.3),0,.22,-.35)],
  /* 巡洋艦: a broad hull, a bridge tower and one forward turret */
  cl:()=>[at(box(.7,.36,1.6),0,0,-.1), at(nose(.4,.55,4),0,0,.95), at(box(.3,.34,.4),0,.33,-.25), at(box(.26,.14,.3),0,.24,.45), at(tube(.12,.3),.22,0,-1.0), at(tube(.12,.3),-.22,0,-1.0)],
  /* 戦艦: the largest hull, three turrets and a tall bridge */
  bb:()=>[at(box(.9,.46,1.9),0,0,-.05), at(nose(.5,.5,4),0,0,1.15), at(box(.32,.5,.42),0,.46,-.35), at(box(.3,.16,.32),0,.31,.6), at(box(.3,.16,.32),0,.31,.2), at(box(.3,.16,.32),0,.31,-.85), at(tube(.15,.35),.28,0,-1.15), at(tube(.15,.35),-.28,0,-1.15)],
  /* 戦闘母艦: a flat flight deck with the island off to one side */
  cvb:()=>[at(box(1.15,.12,2.0),0,.14,0), at(box(.7,.32,1.8),0,-.1,-.05), at(box(.18,.42,.5),.46,.42,-.2), at(tube(.14,.3),.2,-.1,-1.1), at(tube(.14,.3),-.2,-.1,-1.1)],
  /* 突撃揚陸艦: a bulky hull with a blunt bay at the bow and a pod on each side */
  mas:()=>[at(box(.8,.55,1.3),0,0,-.1), at(box(.66,.46,.36),0,-.03,.72), at(tube(.15,.9),.5,-.05,-.1), at(tube(.15,.9),-.5,-.05,-.1), at(box(.22,.2,.3),0,.37,-.45)],
  /* 強襲母艦: twin hulls joined by a deck */
  masc:()=>[at(box(.38,.36,1.9),.44,0,0), at(box(.38,.36,1.9),-.44,0,0), at(box(1.3,.1,1.4),0,.22,-.1), at(nose(.22,.4,4),.44,0,1.15), at(nose(.22,.4,4),-.44,0,1.15), at(box(.26,.32,.36),0,.43,-.45)],
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
