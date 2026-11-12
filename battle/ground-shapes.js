/* War of Space battle: low-poly models for the ground battle (ground units, aircraft, sea ships).
   Classic script, loaded right after battle/shapes.js: it uses that file's helpers (at, box, tube, taper, loft, plate, pair, mirror).
   Every model points forward along +Z with +Y up and is about 2 units long. Ground models stand on y = 0; ships float with the
   waterline at y = 0; aircraft are centred on y = 0.
   A part may carry a tone: tone(g, k) darkens (k < 1) that part against the team colour, so tracks, wheels and glass read apart.
   All models here are flat shaded (one normal per face), unlike the space ships. */
const tone=(g,k)=>{ g.userData.tone=k; return g; };
/* join parts into one flat-shaded geometry with a grey vertex colour per part (multiplies the material's team colour) */
function groundJoin(parts,mono=false){
  parts=parts.map(g=>{ if(!g.index) return g; const n=g.toNonIndexed(); n.userData.tone=g.userData.tone; return n; });
  let n=0; parts.forEach(g=>n+=g.attributes.position.count);
  const pos=new Float32Array(n*3), col=new Float32Array(n*3); let o=0;
  parts.forEach(g=>{ const c=g.attributes.position.count, k=mono?1:(g.userData.tone??1); pos.set(g.attributes.position.array,o*3); col.fill(k,o*3,(o+c)*3); o+=c; g.dispose(); });
  const out=new THREE.BufferGeometry(); out.setAttribute('position',new THREE.BufferAttribute(pos,3)); out.setAttribute('color',new THREE.BufferAttribute(col,3));
  out.computeVertexNormals(); return out;
}
/* tones: dark parts (tracks, guns, packs) and glass */
const DK=.3, GL=.2;
/* cross-sections for loft: a slab with slightly sloping sides, and a hull whose sides drop to skirts */
const SLAB=[[.84,1],[1,-1],[-1,-1],[-.84,1]], SKIRT=[[.62,1],[1,.1],[.96,-1],[-.96,-1],[-1,.1],[-.62,1]];
/* a loft built along Z stood up along +Y (its half-height becomes depth, front toward +Z) */
const stand=g=>{ g.rotateX(-Math.PI/2); g.scale(1,1,-1); const p=g.attributes.position; for(let i=0;i<p.count;i+=3){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i); p.setXYZ(i,p.getX(i+1),p.getY(i+1),p.getZ(i+1)); p.setXYZ(i+1,x,y,z); } return g; };
/* an eight-sided tube, and a lifting body: flat underneath, its sides drawn in to a narrower back */
const O8=[...Array(8)].map((_,i)=>[Math.cos((i+.5)*Math.PI/4),Math.sin((i+.5)*Math.PI/4)]), LIFT=[[.55,1],[1,-.1],[.82,-1],[-.82,-1],[-1,-.1],[-.55,1]];
/* a hull with a crease along its sides (the boat hull of the Republic's carrier), and a slab with its top edges cut */
const CREASE=[[.7,1],[1,.1],[.8,-1],[-.8,-1],[-1,.1],[-.7,1]], FACET=[[.6,1],[1,.3],[1,-1],[-1,-1],[-1,.3],[-.6,1]];
/* vehicle parts. trackG: a dark track block along one side, raised at both ends. wheelG: a dark road wheel on a side.
   brl: a piece of barrel from z0 to z1 along +Z from the trunnion at the origin. gunG: barrel pieces set at the trunnion and
   raised by el radians */
const trackG=(x,z0,z1,w=.1,h=.24)=>tone(at(loft([[z0,w,h*.22,h*.64],[z0+.14,w,h/2,h/2],[z1-.17,w,h/2,h/2],[z1,w,h*.22,h*.68]],RECT),x,0,0),DK);
const wheelG=(x,z,r=.15,w=.12)=>{ const g=new THREE.CylinderGeometry(r,r,w,8); g.rotateZ(Math.PI/2); return tone(at(g,x,r,z),DK); };
const brl=(r,z0,z1,seg=6)=>at(tube(r,z1-z0,seg),0,0,(z0+z1)/2);
const gunG=(pieces,y,z,el=0)=>pieces.map(g=>tone(at(g,0,y,z,-el),DK));
/* shared running gear (docs/models.md 2). hullE: the Earth's tank hull — tracks showing under plate skirts, a flat deck, a
   sloping glacis (top of the deck at y .36). hullM: the Republic's common hull for tank, gun, air defence, rockets and
   engineers — long and low, skirts in one piece with the hull, a long shallow glacis over the crew capsule with a dark sensor
   strip instead of hatches. wheelsG: road wheels at the given z on both sides. piv: parts built around a pivot at the
   origin, raised by el and set at x,y,z */
const hullE=()=>[trackG(.37,-.98,.98), trackG(-.37,-.98,.98), ...pair(at(box(.03,.13,1.66),.485,.22,-.03)), loft([[-.95,.34,.09,.27],[.5,.34,.09,.27],[.97,.31,.035,.215]],SLAB)];
const hullM=()=>[trackG(.38,-1.02,1,.09,.22), trackG(-.38,-1.02,1,.09,.22), loft([[-1.05,.38,.07,.25],[-.85,.47,.11,.25],[.3,.47,.11,.25],[1.06,.2,.03,.17]],SKIRT), tone(at(box(.34,.03,.1),0,.345,.46),GL)];
const wheelsG=(zs,x=.37,r=.15)=>zs.flatMap(z=>[wheelG(x,z,r),wheelG(-x,z,r)]);
const piv=(parts,x,y,z,el=0)=>parts.map(g=>at(g,x,y,z,-el));
/* the Earth's truck: four axles, a frame, a cab with a windscreen at the front; the bed is free from z -.95 to .4 at y .31 */
const truckE=()=>[...wheelsG([-.7,-.3,.22,.64]), tone(at(box(.5,.1,1.9),0,.26,0),.6), loft([[.44,.34,.17,.48],[.84,.34,.17,.48],[.98,.32,.09,.41]],SLAB), tone(at(box(.56,.09,.03),0,.56,.9,.5),GL)];
/* the Republic's truck: three axles under a sealed creased nose with a sensor strip and no windows */
const truckM=()=>[...wheelsG([-.66,-.2,.6]), tone(at(box(.48,.1,1.9),0,.26,0),.6), loft([[.36,.33,.14,.45],[.8,.3,.12,.44],[1.05,.1,.04,.42]],CREASE), tone(at(box(.3,.03,.04),0,.53,.78,.2),GL)];
/* a straight faceted limb from a to b (n sides) */
function segG(a,b,r0,r1,n=6){ const A=new THREE.Vector3(...a), d=new THREE.Vector3(...b).sub(A), l=d.length(), g=new THREE.CylinderGeometry(r1,r0,l,n);
  g.translate(0,l/2,0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))); g.translate(A.x,A.y,A.z); return g.toNonIndexed(); }
/* a joint disc of the frame, its axis across the body */
const discG=(x,y,z,r,w=.05)=>{ const g=new THREE.CylinderGeometry(r,r,w,6); g.rotateZ(Math.PI/2); return at(g,x,y,z); };
/* a flat bar from a to b: width w across the body, thickness t */
function barG(a,b,w,t){ const A=new THREE.Vector3(...a), d=new THREE.Vector3(...b).sub(A), l=d.length(), g=new THREE.BoxGeometry(w,l,t);
  g.translate(0,l/2,0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))); g.translate(A.x,A.y,A.z); return g.toNonIndexed(); }
/* poses of the trooper (h…: the heavy one). d: how far the hips drop, L: forward lean of the upper body (radians), feet: [half
   stance width, z, ankle height] for the left (leading) and the right foot, el: elbows in the upright body's coordinates
   (right, left), wr: wrists in the world (right, left; the heavy one's left hand is set from the gun), gun: where the right
   hand holds the weapon, or rifle: the two ends of a rifle carried across the chest */
const EXO_POSE={
  walk:{d:.03,L:.08,feet:[[.11,.17],[.11,-.15,.11]],el:[[-.31,1.05,.02],[.31,1.09,.05]],wr:[[-.11,.94,.2],[.1,1.11,.22]],rifle:[[-.23,.84,.23],[.23,1.26,.23]]},
  fight:{d:.08,L:.2,feet:[[.13,.22],[.13,-.2,.11]],el:[[-.34,1.157,.054],[.17,1.154,.238]],wr:[[-.11,1.2,.3],[-.02,1.19,.5]],gun:[-.11,1.2,.3]},
  hwalk:{d:.05,L:.12,feet:[[.14,.17],[.14,-.15,.11]],el:[[-.32,1.05,-.05],[.21,1.07,.19]],gun:[-.27,.81,.13]},
};
/* the exoskeleton trooper (docs/models.md 3.2). The body is eight heads tall (1.6 units upright: chin 1.4, chest 1.2, navel 1,
   crotch .8, knee .45; shoulders two heads wide), drawn dark; the frame around it is in the team colour: foot plates, struts down
   the outside of each leg with discs at hip and knee, a hip ring, a spine and power unit, a yoke across the shoulders, struts
   down the arms, a helmet. Its right is -X. It never stands straight: the hips are dropped, the knees bent, the body leaning
   forward, one foot ahead (user decision 2026-11-12). pose walk: moving, the rifle carried across the chest; fight: lower, the
   rifle levelled with its butt against the right shoulder (user decision 2026-11-12). The heavy one has the one pose.
   heavy: armour over the whole body, a big round helmet in a high collar, frame struts on the inside of the legs too, a
   multi-launcher and an ammunition drum on the back, and a large rapid-fire cannon held at the right hip like a minigun */
function exoParts(heavy,pose){ const BODY=.16, T=.375, P=EXO_POSE[(heavy?'h':'')+pose], p=[], U=[], body=g=>tone(g,BODY), HY=.82-P.d;
  const M=new THREE.Matrix4().makeTranslation(0,HY,0).multiply(new THREE.Matrix4().makeRotationX(P.L)).multiply(new THREE.Matrix4().makeTranslation(0,-.82,0));
  const W=v=>new THREE.Vector3(...v).applyMatrix4(M).toArray();
  for(const sx of [1,-1]){ const f=P.feet[sx>0?0:1], hip=[sx*.1,HY,0], ank=[sx*f[0],f[2]||.08,f[1]], dy=ank[1]-hip[1], dz=ank[2]-hip[2], dd=Math.hypot(dy,dz), k=Math.sqrt(Math.max(0,T*T-dd*dd/4));
    const knee=[(hip[0]+ank[0])/2,(hip[1]+ank[1])/2+k*dz/dd,(hip[2]+ank[2])/2-k*dy/dd], calf=knee.map((v,i)=>v+(ank[i]-v)*.4), o=(v,t,z=0)=>[v[0]+sx*t,v[1],v[2]+z];
    p.push(body(segG(hip,knee,.088,.06)), body(segG(knee,calf,.06,.068)), body(segG(calf,ank,.068,.04)), at(box(.13,.06,.3),ank[0],ank[1]-.05,ank[2]+.06),
      segG(o(hip,.115),o(knee,.095),.03,.028,5), segG(o(knee,.095),o(ank,.06),.028,.024,5), discG(hip[0]+sx*.115,hip[1]+.02,hip[2],.07), discG(knee[0]+sx*.095,knee[1],knee[2],.058),
      at(box(.07,.05,.12),ank[0]+sx*.04,ank[1],ank[2]), barG(o(knee,0,-.07),o(knee,.1,-.07),.035,.04), barG(o(calf,0,-.07),o(calf,.08,-.07),.035,.04));
    if(heavy) p.push(segG(o(hip,-.075),o(knee,-.075),.026,.024,5), segG(o(knee,-.075),o(ank,-.06),.024,.022,5), discG(knee[0]-sx*.075,knee[1],knee[2],.05,.04),
      barG(o(hip,0,.08).map((v,i)=>v+(o(knee,0,.08)[i]-v)*.2),o(knee,0,.085),.19,.05), barG(o(knee,0,.075),o(ank,0,.06).map((v,i)=>v+(o(knee,0,.075)[i]-v)*.1),.15,.045)); }
  /* upper body, built upright and then leaned as one: torso, neck, hip ring, spine, power unit, yoke */
  U.push(body(stand(loft([[.78,.13,.085],[.98,.12,.08],[1.2,.19,.11],[1.33,.2,.09],[1.4,.06,.05]],HEX))), body(segG([0,1.38,0],[0,1.46,0],.045,.04)),
    at(box(.44,.06,.2),0,.86,0), at(box(.07,.44,.06),0,1.08,-.13), at(box(.25,.27,.12),0,1.17,-.2), at(box(.54,.05,.1),0,1.37,-.07));
  if(!heavy){ const head=new THREE.IcosahedronGeometry(.1,0); head.scale(1,1.15,1.05); U.push(at(head,0,1.5,0), tone(at(box(.13,.04,.04),0,1.51,.085),GL)); }
  else { const head=new THREE.IcosahedronGeometry(.118,1); head.scale(1,1.05,1.08);
    U.push(at(head,0,1.53,0), tone(at(box(.17,.065,.05),0,1.54,.095),GL), at(new THREE.CylinderGeometry(.15,.175,.13,8),0,1.43,-.005),
      stand(loft([[1.08,.2,.13],[1.3,.25,.15],[1.4,.2,.11]],HEX)), at(box(.27,.14,.06),0,.99,.095), at(box(.26,.1,.07),0,.86,.09),
      ...pair(at(loft([[-.11,.1,.07],[.11,.085,.05]],SLAB),.325,1.36,-.01)), ...pair(at(box(.075,.19,.1),.34,1.17,-.03)),
      at(box(.42,.2,.26),0,1.5,-.29,-.25), tone(at(box(.36,.14,.02),0,1.535,-.165,-.25),DK), at(box(.1,.18,.1),0,1.33,-.25), tone(discG(0,1.0,-.27,.12,.24),.6)); }
  for(const g of U) g.applyMatrix4(M);
  p.push(...U);
  /* arms and weapon, in the world: shoulder and elbow follow the lean, the hands hold the weapon */
  const G=P.gun, wr=heavy?[[G[0],G[1]+.01,G[2]],[G[0]+.06,G[1]+.14,G[2]+.2]]:P.wr;
  [[-.21,1.31,0],[.21,1.31,0]].forEach((s0,i)=>{ const sx=Math.sign(s0[0]), sh=W(s0), el=W(P.el[i]), o=v=>[v[0]+sx*.055,v[1]+.02,v[2]-.02];
    p.push(body(segG(sh,el,.055,.045)), body(segG(el,wr[i],.045,.035)), discG(sh[0]+sx*.07,sh[1]+.02,sh[2]-.02,.062), segG(o(sh),o(el),.024,.022,5), segG(o(el),o(wr[i]),.022,.02,5), discG(el[0]+sx*.055,el[1],el[2]-.02,.045,.04)); });
  if(P.rifle) p.push(tone(barG(P.rifle[0],P.rifle[1],.05,.075),DK));
  else if(!heavy) p.push(tone(at(box(.05,.08,.8),G[0],G[1]+.03,G[2]+.22),DK), tone(at(box(.045,.13,.06),G[0],G[1]-.05,G[2]+.02),DK), tone(at(box(.03,.04,.1),G[0],G[1]+.09,G[2]+.2),DK));
  else p.push(tone(at(box(.1,.13,.36),G[0],G[1],G[2]+.08),DK), tone(at(tube(.06,.3,6),G[0],G[1],G[2]+.4),.6), tone(at(tube(.04,.5,6),G[0],G[1],G[2]+.78),DK), tone(at(tube(.058,.1,6),G[0],G[1],G[2]+1.06),DK),
    tone(at(box(.03,.03,.24),G[0]+.05,G[1]+.13,G[2]+.18),DK), tone(at(box(.03,.08,.03),G[0]+.05,G[1]+.09,G[2]+.08),DK), tone(at(box(.03,.08,.03),G[0]+.05,G[1]+.09,G[2]+.28),DK),
    tone(segG(W([-.12,.97,-.22]),[G[0],G[1]+.02,G[2]-.06],.03,.03,5),DK));
  return p; }
/* model key → parts. Keys ending in A, B… are variants shown on the sample sheet; the game uses the keys named in GROUND_MODELS */
const GROUND_SHAPES={
  /* placeholder until the pilot shapes are in: a box hull with a darker turret */
  stub:()=>[at(box(.7,.3,1.8),0,.15,0), tone(at(box(.4,.2,.6),0,.4,-.1),.6), tone(at(tube(.04,.9,6),0,.42,.6),.6)],
  /* --- 地球連合の車両 (docs/models.md 2.1): crewed, heavy, today's vehicles a century on. Big turrets with hatches, sights and
     weapon stations added on the roof, tracks showing under plate skirts, thick guns --- */
  /* 主力戦車（地球連合）: a wide turret with wedge cheeks either side of the gun, a stowage basket behind, a thick gun */
  tankE:()=>[...hullE(), tone(at(box(.5,.03,.36),0,.37,-.72),.6),
    at(loft([[-.6,.25,.09],[-.34,.3,.105],[.1,.3,.105],[.5,.14,.08,-.01]],SLAB),0,.47,0),
    ...pair(at(loft([[-.22,.1,.09],[.12,.08,.075],[.34,.01,.05,-.01]],SLAB),.2,.465,.33,0,.3,0)),
    tone(at(box(.46,.1,.14),0,.46,-.69),.55), tone(at(box(.12,.09,.15),.14,.62,-.25),.6), ...piv([tone(brl(.014,0,.24),DK)],.14,.64,-.18),
    tone(at(box(.08,.1,.08),-.14,.625,.0),DK), at(new THREE.CylinderGeometry(.07,.07,.03,6),-.13,.585,-.3),
    ...gunG([brl(.047,0,1),brl(.066,.44,.62),brl(.058,.95,1.03)],.47,.5)],
  /* 装甲兵員輸送車（地球連合）: eight wheels, a tall box with upright sides and a sloping nose; the weapon station sits off to one
     side behind the commander's hatch, stowage boxes along the rear sides, a ramp door behind */
  apcE:()=>[...wheelsG([-.66,-.24,.22,.64]), tone(at(box(.5,.15,1.8),0,.2,0),.6),
    loft([[-.96,.36,.15,.43],[.28,.36,.15,.43],[.72,.34,.09,.37],[.99,.3,.04,.31]],SLAB), tone(at(box(.42,.2,.02),0,.42,-.965),.6),
    tone(at(box(.3,.035,.03),0,.49,.62,.42),GL), ...pair(at(box(.05,.12,.5),.385,.5,-.55)),
    at(loft([[-.15,.11,.055],[.13,.09,.045]],SLAB),.14,.635,-.02), ...piv([tone(brl(.02,0,.5),DK),tone(at(box(.05,.05,.05),.07,.04,-.05),DK)],.14,.645,.08),
    at(new THREE.CylinderGeometry(.075,.075,.035,6),-.15,.6,.28), tone(at(box(.03,.3,.03),-.3,.73,-.85),DK)],
  /* 自走砲（地球連合）: the tank hull under a tall, wide gun house at the rear, a thick raised gun with a boxed muzzle brake */
  spgE:()=>[...hullE(), at(loft([[-.98,.3,.17],[-.2,.33,.2],[.1,.27,.17],[.26,.19,.12,-.02]],SLAB),0,.56,0), tone(at(box(.44,.12,.03),0,.56,-1),.6),
    tone(at(box(.1,.07,.12),-.16,.79,-.5),DK), at(new THREE.CylinderGeometry(.07,.07,.03,6),.15,.775,-.3),
    ...gunG([brl(.075,0,.3),brl(.05,.3,1.34),at(box(.15,.09,.15),0,0,1.38)],.6,.16,.2)],
  /* 自走対空砲（地球連合）: the tank hull under a turret with a pair of cannon on each side, raised, and an optical tracker
     ball on a short mast (no radar in this war) */
  aaE:()=>[...hullE(), at(loft([[-.45,.19,.11],[.25,.2,.11],[.42,.12,.08,-.01]],SLAB),0,.48,-.08),
    ...[.29,-.29].flatMap(x=>piv([box(.1,.13,.34),tone(at(brl(.02,0,.75),0,.03,.1),DK),tone(at(brl(.02,0,.75),0,-.03,.1),DK)],x,.52,-.02,.45)),
    tone(at(box(.03,.14,.03),0,.66,-.36),DK), tone(at(new THREE.IcosahedronGeometry(.075,0),0,.78,-.36),GL)],
  /* ロケット車両（地球連合）: the truck with a boxed launcher of six tubes on the bed, raised */
  mlrsE:()=>[...truckE(), ...piv([at(box(.58,.3,1.05),0,.17,.5),tone(at(box(.5,.22,.02),0,.17,1.03),DK),tone(at(box(.5,.22,.02),0,.17,-.03),DK)],0,.36,-.92,.3)],
  /* 補給（地球連合）: the truck with a ribbed container on the bed */
  supE:()=>[...truckE(), tone(at(box(.62,.42,1.3),0,.53,-.28),.8), ...[-.75,-.28,.19].map(z=>at(box(.66,.44,.04),0,.53,z))],
  /* 工兵（地球連合）: the tank hull with a dozer blade in front and a folded bridge carried on top */
  engE:()=>[...hullE(), at(box(.98,.24,.05),0,.17,1.1,-.25), ...pair(tone(at(box(.05,.06,.3),.3,.2,.98),DK)),
    at(box(.3,.14,.3),0,.43,.4), tone(at(box(.5,.05,1.5),0,.44,-.3),.75), tone(at(box(.5,.05,1.5),0,.53,-.3),.75), ...[-.9,-.3,.3].map(z=>tone(at(box(.54,.16,.04),0,.47,z),DK))],
  /* 斥候（地球連合）: a small four-wheeled scout car with a sensor head on a tall mast */
  scoutE:()=>[...wheelsG([-.42,.42],.33,.16), tone(at(box(.44,.12,1.2),0,.22,0),.6), loft([[-.72,.3,.1,.38],[.2,.3,.1,.38],[.58,.28,.06,.34],[.76,.24,.03,.3]],SLAB),
    at(loft([[-.55,.22,.07],[.05,.22,.07],[.2,.16,.04,-.02]],SLAB),0,.55,0), tone(at(box(.36,.06,.03),0,.56,.2,.6),GL),
    tone(at(box(.03,.5,.03),-.12,.86,-.4),DK), tone(at(box(.12,.1,.1),-.12,1.14,-.4),GL), ...piv([tone(brl(.016,0,.36),DK)],.1,.64,-.1)],
  /* --- 惑星共和国の車両 (docs/models.md 2.2; the Armata line a century on, user decision 2026-11-12): few crew sitting in the
     hull front, sealed shells with no hatches or windows, small uncrewed turrets set back, one common hull, long slim guns --- */
  /* 主力戦車（惑星共和国）: a narrow faceted turret shell, a very long gun, slat frames at the rear */
  tankM:()=>[...hullM(), ...pair(tone(at(box(.025,.11,.36),.5,.22,-.82),DK)),
    at(loft([[-.86,.1,.05],[-.56,.2,.085],[-.1,.19,.08],[.4,0,0,-.03]],HEX),0,.45,-.05), tone(at(box(.07,.08,.07),.08,.555,-.32),DK),
    ...gunG([brl(.058,0,.24),at(taper(.04,.03,1.2,6),0,0,.84)],.45,.24)],
  /* 装甲兵員輸送車（惑星共和国）: eight wheels under a boat hull with a crease along its sides and an upswept prow, a flat
     uncrewed turret set well back with a long thin cannon */
  apcM:()=>[...wheelsG([-.7,-.28,.16,.6]),
    loft([[-.98,.3,.13,.36],[-.72,.37,.15,.37],[.45,.37,.15,.37],[.85,.28,.1,.37],[1.1,.1,.03,.41]],CREASE), tone(at(box(.26,.03,.04),0,.5,.58,.3),GL),
    at(new THREE.CylinderGeometry(.15,.2,.08,6),0,.56,-.32), ...gunG([brl(.018,0,.85),at(box(.05,.05,.2),.06,0,.1)],.58,-.26)],
  /* 自走砲（惑星共和国）: the common hull under a tall narrow gun house with capacitor banks on its sides; the gun is a railgun
     — two long rails braced together, the longest gun on the field */
  spgM:()=>[...hullM(), at(loft([[-.92,.2,.15],[-.5,.24,.19],[.18,.22,.17],[.46,.11,.09,-.04]],FACET),0,.56,-.05), ...pair(tone(at(box(.07,.2,.55),.27,.52,-.42),.55)),
    tone(at(box(.07,.07,.07),.1,.775,-.4),DK),
    ...piv([tone(at(box(.024,.085,1.75),.04,0,.95),DK),tone(at(box(.024,.085,1.75),-.04,0,.95),DK),at(box(.13,.13,.3),0,0,.17),...[.5,.95,1.4,1.8].map(z=>at(box(.12,.11,.045),0,0,z))],0,.6,.28,.2)],
  /* 自走対空砲（惑星共和国）: the common hull under a flat uncrewed turret with four cannon in a block, raised, and a tracker ball */
  aaM:()=>[...hullM(), at(new THREE.CylinderGeometry(.22,.27,.1,6),0,.42,-.2),
    ...piv([box(.2,.16,.36),...[[.05,.04],[-.05,.04],[.05,-.04],[-.05,-.04]].map(([x,y])=>tone(at(brl(.018,0,.8),x,y,.12),DK))],0,.55,-.2,.5), tone(at(new THREE.IcosahedronGeometry(.07,0),.2,.52,-.42),GL)],
  /* ロケット車両（惑星共和国）: the common hull with two rows of launch tubes lying low on the deck */
  mlrsM:()=>[...hullM(), ...piv([...[-.17,0,.17].flatMap(x=>[.06,.2].map(y=>{ const g=tube(.068,1.15,6); return at(g,x,y,.5); })),tone(at(box(.5,.3,.02),0,.13,1.08),DK),at(box(.56,.06,.3),0,-.02,.2)],0,.4,-.9,.16)],
  /* 補給（惑星共和国）: the sealed truck with two tanks on the bed */
  supM:()=>[...truckM(), ...[-.62,-.02].map(z=>{ const g=new THREE.CylinderGeometry(.24,.24,.52,8); g.rotateX(Math.PI/2); return tone(at(g,0,.56,z),.8); }), at(box(.5,.06,1.2),0,.33,-.32)],
  /* 工兵（惑星共和国）: the common hull with a folded bridge on top and a narrow blade */
  engM:()=>[...hullM(), at(box(.8,.18,.04),0,.14,1.12,-.3), tone(at(box(.46,.05,1.5),0,.42,-.3),.75), tone(at(box(.46,.05,1.5),0,.5,-.3),.75), ...[-.9,.3].map(z=>tone(at(box(.5,.15,.04),0,.45,z),DK))],
  /* 斥候（惑星共和国）: a small low four-wheeled boat hull with a tiny uncrewed turret */
  scoutM:()=>[...wheelsG([-.42,.42],.33,.16), loft([[-.72,.26,.11,.34],[-.5,.32,.13,.35],[.35,.32,.13,.35],[.82,.1,.03,.37]],CREASE), tone(at(box(.22,.03,.04),0,.46,.45,.3),GL),
    at(new THREE.CylinderGeometry(.1,.14,.07,6),0,.51,-.22), ...gunG([brl(.015,0,.5)],.53,-.18), tone(at(box(.05,.07,.05),.0,.58,-.3),GL)],
  /* 強化歩兵: about 2 m tall. W: moving, F: standing or fighting */
  infW:()=>exoParts(false,'walk'), infF:()=>exoParts(false,'fight'),
  /* 重強化歩兵: the same frame a little bigger, armoured all over (user decision 2026-11-12) */
  hinf:()=>exoParts(true,'walk').map(g=>g.scale(1.12,1.12,1.12)),
  /* --- 地球連合の航空機 (docs/models.md 2.1): a century more of flying on wings. Crewed, so each has a dark canopy --- */
  /* 戦闘機（地球連合）: kin to the carrier fighter. A chined body blended into a swept wing with a sawtooth trailing edge, dark
     intakes beside the canopy, canted twin tails; thick enough to read from the side */
  ftrE:()=>[loft([[-.9,.13,.07],[-.35,.21,.14],[.25,.17,.13],[.72,.08,.07],[1.08,0,0]]),
    at(plate([[0,.6],[.2,.4],[.9,-.5],[.9,-.66],[.42,-.5],[.2,-.7],[0,-.55],[-.2,-.7],[-.42,-.5],[-.9,-.66],[-.9,-.5],[-.2,.4]],.06),0,-.01,0),
    tone(at(loft([[.18,.07,.04],[.4,.08,.08,.02],[.72,0,0]]),0,.1,0),GL), ...pair(tone(at(box(.09,.1,.2),.2,-.02,.28,0,.12,0),DK)),
    ...pair(at(plate([[0,-.4],[0,-.86],[.3,-.96],[.3,-.74]],.035),.15,.06,0,0,0,Math.PI/2-.42)), ...pair(tone(at(box(.13,.09,.14),.1,0,-.92),DK))],
  /* 攻撃機（地球連合）: the low and slow gun carrier. Broad straight wings with tip pods and stores under them, two engine pods
     high on the rear body, a tailplane with a fin at each end, a big gun under the nose */
  atkE:()=>[loft([[-.9,.09,.09],[-.3,.15,.15],[.4,.14,.14],[.85,.09,.1],[1.06,.03,.04,-.03]],O8),
    ...pair(at(plate([[.1,.32],[1.08,.14],[1.08,-.1],[.1,-.24]],.07),0,-.05,0)), ...pair(at(loft([[-.3,.05,.05],[.2,.05,.05],[.36,0,0]]),1.08,-.05,.02)),
    ...[.42,.74].flatMap(x=>pair(tone(at(box(.06,.07,.3),x,-.13,.05),DK))),
    ...pair(tone(at(taper(.12,.105,.5,6),.27,.19,-.45),DK)), ...pair(at(box(.1,.05,.2),.18,.14,-.45)),
    ...pair(at(plate([[0,-.78],[.52,-.84],[.52,-1.04],[0,-1.02]],.04),0,.03,0)), ...pair(at(plate([[0,-.8],[0,-1.06],[.3,-1.1],[.3,-.9]],.035),.52,.03,0,0,0,Math.PI/2)),
    tone(at(loft([[.36,.07,.05],[.56,.085,.09,.02],[.84,0,0]]),0,.12,0),GL), tone(at(tube(.036,.42,6),.03,-.13,.98),DK)],
  /* 広域戦略支援航空機（地球連合）: a big bomber crossed with an early-warning aircraft (user decision 2026-11-12; no radar in
     this war, so no dish). A long tube body, long swept wings set high with four engine pods, a T tail; on its back a long
     optical sensor beam on struts, a sensor ball under the nose, the bomb bay doors dark under the belly */
  awE:()=>[loft([[-1.12,.06,.07],[-.72,.14,.15],[.6,.14,.15],[.96,.1,.11],[1.16,.02,.03,-.03]],O8),
    ...pair(at(plate([[.1,.36],[1.38,-.26],[1.38,-.44],[.1,-.16]],.06),0,.11,0)),
    ...[.46,.88].flatMap(x=>pair(tone(at(taper(.078,.066,.36,6),x,-.01,.14-x*.46),DK))),
    at(plate([[0,-.7],[0,-1.1],[.44,-1.2],[.44,-.96]],.045),0,.12,0,0,0,Math.PI/2), ...pair(at(plate([[0,-.96],[.46,-1.12],[.46,-1.22],[0,-1.17]],.035),0,.55,0)),
    at(box(.075,.075,1.05),0,.37,-.05), tone(at(box(.085,.035,.95),0,.37,-.05),GL), ...[-.4,.3].map(z=>at(box(.04,.12,.08),0,.27,z)),
    tone(at(new THREE.IcosahedronGeometry(.085,0),0,-.14,.86),GL), tone(at(box(.2,.03,.75),0,-.15,-.1),DK), tone(at(box(.2,.05,.05),0,.12,1.0,.5),GL)],
  /* --- 惑星共和国の航空機 (docs/models.md 2.2): Mars has no tradition of flying on wings, so what it flies in the Earth's air
     comes from craft that fall from orbit: thick flat-bellied lifting bodies with a dark heat shield underneath, small fins, sealed
     with a sensor strip instead of a canopy --- */
  /* 戦闘機（惑星共和国）: a dart-shaped lifting body with a fin canted out at each tip and flat nozzles */
  ftrM:()=>[loft([[-.9,.5,.09],[-.35,.56,.14],[.45,.3,.11],[1.06,.07,.04,-.02]],LIFT),
    tone(at(plate([[0,.98],[.26,.45],[.5,-.35],[.45,-.88],[-.45,-.88],[-.5,-.35],[-.26,.45]],.02),0,-.14,0),DK),
    ...pair(at(plate([[0,-.3],[0,-.9],[.36,-1],[.36,-.7]],.04),.5,.03,0,0,0,Math.PI/2-.5)),
    tone(at(box(.26,.03,.06),0,.1,.52,.1),GL), ...[-.2,.2].map(x=>tone(at(box(.22,.12,.14),x,.02,-.95),DK))],
  /* 攻撃機（惑星共和国）: a gunship out of the landing craft line. A boxy lifting body carried on four thruster pods at its
     corners that swivel down, a cannon under the chin */
  atkM:()=>[loft([[-.82,.3,.14],[-.4,.34,.17],[.5,.3,.15],[.96,.12,.07,-.04]],LIFT),
    ...[.48,-.56].flatMap(z=>[...pair(at(box(.34,.05,.14),.46,.02,z)), ...pair(at(loft([[-.22,.09,.09],[.14,.1,.1],[.25,.06,.06]],O8),.66,.02,z)), ...pair(tone(at(new THREE.CylinderGeometry(.07,.09,.09,6),.66,-.11,z),DK))]),
    tone(at(plate([[0,.9],[.24,.45],[.27,-.75],[-.27,-.75],[-.24,.45]],.02),0,-.19,0),DK), tone(at(box(.24,.03,.06),0,.13,.6,.12),GL),
    tone(at(box(.12,.08,.14),0,-.2,.6),DK), tone(at(tube(.03,.4,6),0,-.2,.86),DK), ...pair(at(plate([[0,-.5],[0,-.84],[.22,-.9],[.22,-.66]],.035),.2,.12,0,0,0,Math.PI/2-.3))],
  /* 広域戦略支援航空機（惑星共和国）: a wide manta-shaped flying wing around a thick lifting body, a row of sensor blisters down
     its back, a winglet at each tip */
  awM:()=>[at(plate([[0,.92],[.36,.55],[1.38,-.45],[1.38,-.72],[.62,-.6],[.3,-.86],[0,-.76],[-.3,-.86],[-.62,-.6],[-1.38,-.72],[-1.38,-.45],[-.36,.55]],.08),0,0,0),
    loft([[-.8,.3,.12],[-.2,.37,.18],[.5,.24,.13],[1.02,.05,.04,-.02]],LIFT), tone(at(plate([[0,.9],[.2,.5],[.3,-.2],[.26,-.74],[-.26,-.74],[-.3,-.2],[-.2,.5]],.02),0,-.17,0),DK),
    ...[-.5,-.2,.1,.4].map(z=>tone(at(new THREE.IcosahedronGeometry(.07,0),0,.17,z),GL)),
    ...pair(at(plate([[0,-.42],[0,-.72],[.26,-.78],[.26,-.56]],.035),1.36,.02,0,0,0,Math.PI/2-.3)), ...[-.2,0,.2].map(x=>tone(at(box(.16,.1,.12),x,.02,-.82),DK))],
};
/* formations: where each body of a unit stands, in model units before the size is applied (x to the right, z forward; a
   vehicle is about 2 long and 1 wide). A unit on the map is a company; it is drawn as one platoon of its arm (user decision
   2026-11-12: the number that fits the arm) */
const GROUND_FORMS={
  one:[[0,0]],
  v3:[[0,0],[-3,-3],[3,-3]],                              // the old aircraft V
  wedge3:[[0,.8],[-1.3,-.7],[1.3,-.7]],
  wedge4:[[.65,.7],[-.65,.7],[1.95,-.7],[-1.95,-.7]],
  line3:[[-1.35,0],[0,0],[1.35,0]],
  line4:[[-2,0],[-.67,0],[.67,0],[2,0]],
  box4:[[.7,1.25],[-.7,1.25],[.7,-1.25],[-.7,-1.25]],
  squad6:[[0,.8],[-.9,.3],[.9,.3],[-1.8,-.2],[1.8,-.2],[0,-.5]],
  flight4:[[0,1.2],[-1.9,-.4],[1.9,-.4],[3.7,-2]],
};
/* ground unit kind (f.groundKind, or sea:<naval model> for ships) → the model the game draws. A value is one spec
   {key, size, form, move}, or {earth:spec, mars:spec} when the two sides have their own shapes. key: in GROUND_SHAPES; size: scale of
   the model in the ground board's units (4 units = 1 km); form: a name in GROUND_FORMS (default one). A kind that is not listed
   keeps the old drawing. Empty until the user approves the samples (CLAUDE.md: looks go in after a sample is approved) */
const GROUND_MODELS={};
/* ?groundModels=kind:key:size:form[:move],kind@mars:key:size:form in the page address overrides the table (for sample shots
   only); an entry without @side applies to both sides. Returns {key,move,size,form,offsets} or null. move: the key of the
   shape shown while the unit is moving (null: the same shape always); key is the shape when it stands or fights */
function groundModelFor(kind,side='earth'){
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k), done=m=>m&&has(GROUND_SHAPES,m.key)?{key:m.key,move:m.move&&has(GROUND_SHAPES,m.move)?m.move:null,size:Number.isFinite(+m.size)&&+m.size>0?+m.size:1,form:has(GROUND_FORMS,m.form)?m.form:'one',offsets:GROUND_FORMS[has(GROUND_FORMS,m.form)?m.form:'one']}:null;
  const q=typeof location!=='undefined'&&new URLSearchParams(location.search).get('groundModels');
  if(q) for(const who of [kind+'@'+side,kind]) for(const s of q.split(',')){
    if(!s.startsWith(who+':')) continue;
    const [key,size,form,move]=s.slice(who.length+1).split(':'), m=done({key,size,form,move}); if(m) return m;
  }
  const m=GROUND_MODELS[kind]; return done(m&&(m.earth||m.mars)?m[side]:m);
}
function groundShapeGeo(key,mono=false){ return Object.prototype.hasOwnProperty.call(GROUND_SHAPES,key)?groundJoin(GROUND_SHAPES[key](),mono):null; }
