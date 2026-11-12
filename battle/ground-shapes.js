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
/* a hull with a crease along its sides (the boat hull of the Republic's carrier), and a slab with its top edges cut */
const CREASE=[[.7,1],[1,.1],[.8,-1],[-.8,-1],[-1,.1],[-.7,1]], FACET=[[.6,1],[1,.3],[1,-1],[-1,-1],[-1,.3],[-.6,1]];
/* vehicle parts. trackG: a dark track block along one side, raised at both ends. wheelG: a dark road wheel on a side.
   brl: a piece of barrel from z0 to z1 along +Z from the trunnion at the origin. gunG: barrel pieces set at the trunnion and
   raised by el radians */
const trackG=(x,z0,z1,w=.1,h=.24)=>tone(at(loft([[z0,w,h*.22,h*.64],[z0+.14,w,h/2,h/2],[z1-.17,w,h/2,h/2],[z1,w,h*.22,h*.68]],RECT),x,0,0),DK);
const wheelG=(x,z,r=.15,w=.12)=>{ const g=new THREE.CylinderGeometry(r,r,w,8); g.rotateZ(Math.PI/2); return tone(at(g,x,r,z),DK); };
const brl=(r,z0,z1,seg=6)=>at(tube(r,z1-z0,seg),0,0,(z0+z1)/2);
const gunG=(pieces,y,z,el=0)=>pieces.map(g=>tone(at(g,0,y,z,-el),DK));
/* a straight faceted limb from a to b (n sides) */
function segG(a,b,r0,r1,n=6){ const A=new THREE.Vector3(...a), d=new THREE.Vector3(...b).sub(A), l=d.length(), g=new THREE.CylinderGeometry(r1,r0,l,n);
  g.translate(0,l/2,0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))); g.translate(A.x,A.y,A.z); return g.toNonIndexed(); }
/* a joint disc of the frame, its axis across the body */
const discG=(x,y,z,r,w=.05)=>{ const g=new THREE.CylinderGeometry(r,r,w,6); g.rotateZ(Math.PI/2); return at(g,x,y,z); };
/* the exoskeleton trooper (docs/models.md 3.2). The body is eight heads tall (1.6 units: chin 1.4, chest 1.2, navel 1, crotch .8,
   knee .45; shoulders two heads wide; elbow at the navel, wrist at the crotch), drawn dark; the frame around it is in the team
   colour: foot plates, struts down the outside of each leg with discs at hip and knee, a hip ring, a spine and power unit, a
   yoke across the shoulders, struts down the arms, a helmet. Its right is -X.
   heavy: armour over the whole body, a big round helmet in a high collar, frame struts on the inside of the legs too, a
   multi-launcher and an ammunition drum on the back, and a large rapid-fire cannon held at the right hip like a minigun */
function exoParts(heavy){ const BODY=.16, p=[], body=g=>tone(g,BODY);
  for(const sx of [1,-1]){ const hip=[sx*.1,.82,0], knee=[sx*.11,.45,.03], ank=[sx*.11,.08,-.01];
    p.push(body(segG(hip,knee,.088,.06)), body(segG(knee,[sx*.11,.3,-.005],.06,.068)), body(segG([sx*.11,.3,-.005],ank,.068,.04)),
      at(box(.13,.06,.3),sx*.11,.03,.05),
      segG([sx*.215,.84,-.01],[sx*.205,.46,.03],.03,.028,5), segG([sx*.205,.46,.03],[sx*.17,.08,0],.028,.024,5),
      discG(sx*.215,.84,-.01,.07), discG(sx*.205,.46,.03,.058), at(box(.07,.05,.12),sx*.15,.08,0),
      at(box(.15,.035,.17),sx*.15,.64,.01), at(box(.14,.035,.16),sx*.15,.27,.0));
    if(heavy) p.push(segG([sx*.02,.78,0],[sx*.035,.46,.03],.026,.024,5), segG([sx*.035,.46,.03],[sx*.05,.08,0],.024,.022,5), discG(sx*.03,.46,.03,.05,.04),
      at(loft([[-.17,.075,.035],[.17,.085,.045]],HEX),sx*.11,.27,.075,Math.PI/2), at(loft([[-.16,.085,.04],[.16,.1,.05]],HEX),sx*.11,.64,.085,Math.PI/2)); }
  /* torso, neck, hip ring, spine, power unit, yoke */
  p.push(body(stand(loft([[.78,.13,.085],[.98,.12,.08],[1.2,.19,.11],[1.33,.2,.09],[1.4,.06,.05]],HEX))), body(segG([0,1.38,0],[0,1.46,0],.045,.04)),
    at(box(.44,.06,.2),0,.86,0), at(box(.07,.44,.06),0,1.08,-.13), at(box(.25,.27,.12),0,1.17,-.2), at(box(.54,.05,.1),0,1.37,-.07));
  /* arms: shoulder → elbow → wrist, with the frame strut outside. Standard: the rifle held across in both hands */
  const arms=heavy?[[[-.21,1.31,0],[-.31,1.05,-.05],[-.25,.9,.13]],[[.21,1.31,0],[.2,1.07,.2],[-.13,.99,.34]]]
                 :[[[-.21,1.31,0],[-.27,1.06,.04],[-.13,1.0,.26]],[[.21,1.31,0],[.24,1.05,.14],[-.02,1.0,.5]]];
  for(const [sh,el,wr] of arms){ const sx=Math.sign(sh[0]), o=v=>[v[0]+sx*.055,v[1]+.02,v[2]-.02];
    p.push(body(segG(sh,el,.055,.045)), body(segG(el,wr,.045,.035)), discG(sh[0]+sx*.07,sh[1]+.02,sh[2]-.02,.062), segG(o(sh),o(el),.024,.022,5), segG(o(el),o(wr),.022,.02,5), discG(el[0]+sx*.055,el[1],el[2]-.02,.045,.04)); }
  if(!heavy){ const head=new THREE.IcosahedronGeometry(.1,0); head.scale(1,1.15,1.05);
    p.push(at(head,0,1.5,0), tone(at(box(.13,.04,.04),0,1.51,.085),GL),
      tone(at(box(.05,.08,.8),-.075,1.0,.42),DK), tone(at(box(.045,.14,.06),-.075,.91,.3),DK), tone(at(box(.03,.04,.1),-.075,1.06,.4),DK)); }
  else { const head=new THREE.IcosahedronGeometry(.118,1); head.scale(1,1.05,1.08);
    p.push(at(head,0,1.53,0), tone(at(box(.17,.065,.05),0,1.54,.095),GL), at(new THREE.CylinderGeometry(.15,.175,.13,8),0,1.43,-.005),
      /* chest and back plate, belly, groin, shoulder, arm plates */
      stand(loft([[1.08,.2,.13],[1.3,.25,.15],[1.4,.2,.11]],HEX)), at(box(.27,.14,.06),0,.99,.095), at(box(.26,.1,.07),0,.86,.09),
      ...pair(at(loft([[-.11,.1,.07],[.11,.085,.05]],SLAB),.325,1.36,-.01)), ...pair(at(box(.075,.19,.1),.34,1.17,-.03)),
      /* the launcher (tubes showing dark at the front) and the drum on the back, the feed to the gun */
      at(box(.42,.2,.26),0,1.5,-.29,-.25), tone(at(box(.36,.14,.02),0,1.535,-.165,-.25),DK), at(box(.1,.18,.1),0,1.33,-.25),
      tone(discG(0,1.0,-.27,.12,.24),.6), tone(segG([-.12,.97,-.22],[-.25,.87,.08],.03,.03,5),DK),
      /* the cannon at the right hip: receiver, shroud, barrel, muzzle, the handle on top for the left hand */
      tone(at(box(.1,.13,.36),-.25,.84,.2),DK), tone(at(tube(.06,.3,6),-.25,.84,.52),.6), tone(at(tube(.04,.5,6),-.25,.84,.9),DK), tone(at(tube(.058,.1,6),-.25,.84,1.18),DK),
      tone(at(box(.03,.03,.24),-.2,.97,.3),DK), tone(at(box(.03,.08,.03),-.2,.93,.2),DK), tone(at(box(.03,.08,.03),-.2,.93,.4),DK)); }
  return p; }
/* model key → parts. Keys ending in A, B… are variants shown on the sample sheet; the game uses the keys named in GROUND_MODELS */
const GROUND_SHAPES={
  /* placeholder until the pilot shapes are in: a box hull with a darker turret */
  stub:()=>[at(box(.7,.3,1.8),0,.15,0), tone(at(box(.4,.2,.6),0,.4,-.1),.6), tone(at(tube(.04,.9,6),0,.42,.6),.6)],
  /* --- 地球連合の車両: the line of today's western and Chinese vehicles a century on. Crewed turrets, so the turret is big,
     wide and tall, with a weapon station and a sight on its roof; tracks show under plate skirts; thick guns --- */
  /* 主力戦車（地球連合）: a wide wedge-fronted turret in the middle, a thick gun with a fume extractor */
  tankE:()=>[trackG(.37,-.98,.98), trackG(-.37,-.98,.98), ...pair(at(box(.03,.13,1.66),.485,.22,-.03)),
    loft([[-.95,.34,.09,.27],[.42,.34,.09,.27],[.97,.31,.035,.215]],SLAB), tone(at(box(.5,.03,.36),0,.37,-.72),.6),
    at(loft([[-.64,.24,.085],[-.36,.3,.105],[.12,.3,.105],[.58,.12,.07,-.012]],SLAB),0,.47,0),
    tone(at(box(.12,.09,.15),.13,.615,-.27),.6), ...gunG([brl(.014,0,.22)],.63,-.2).map(g=>at(g,.13,0,0)), tone(at(box(.08,.07,.08),-.14,.605,-.02),DK),
    ...gunG([brl(.045,0,1),brl(.063,.46,.63),brl(.056,.95,1.03)],.47,.5)],
  /* 装甲兵員輸送車（地球連合）: eight wheels, a tall box with upright sides and a sloping nose, a small weapon station */
  apcE:()=>[...[-.66,-.24,.22,.64].flatMap(z=>[wheelG(.37,z),wheelG(-.37,z)]), tone(at(box(.5,.15,1.8),0,.2,0),.6),
    loft([[-.96,.36,.15,.43],[.28,.36,.15,.43],[.72,.34,.09,.37],[.99,.3,.04,.31]],SLAB), tone(at(box(.42,.2,.02),0,.42,-.965),.6),
    tone(at(box(.3,.035,.03),0,.49,.62,.42),GL), at(loft([[-.17,.12,.055],[.15,.1,.045]],SLAB),0,.635,-.08),
    ...gunG([brl(.02,0,.52)],.64,.05), tone(at(box(.05,.05,.05),.1,.7,-.12),DK)],
  /* 自走砲（地球連合）: a tank hull under a tall, wide gun house at the rear, a thick raised gun with a boxed muzzle brake */
  spgE:()=>[trackG(.37,-.98,.98), trackG(-.37,-.98,.98), ...pair(at(box(.03,.13,1.66),.485,.22,-.03)),
    loft([[-.95,.34,.09,.27],[.5,.34,.09,.27],[.97,.31,.035,.215]],SLAB),
    at(loft([[-.98,.3,.17],[-.2,.33,.2],[.1,.27,.17],[.26,.19,.12,-.02]],SLAB),0,.56,0), tone(at(box(.44,.12,.03),0,.56,-1),.6),
    tone(at(box(.1,.07,.12),-.16,.79,-.5),DK),
    ...gunG([brl(.075,0,.3),brl(.05,.3,1.34),at(box(.15,.09,.15),0,0,1.38)],.6,.16,.2)],
  /* --- 惑星共和国の車両: the Armata line a century on (user decision 2026-11-12). Few crew, sitting in the hull front: small
     uncrewed turrets set back on a long, low common hull whose skirts cover the tracks; long slim guns --- */
  /* 主力戦車（惑星共和国）: a long shallow glacis over the crew, a narrow faceted turret shell, a very long gun */
  tankM:()=>[trackG(.38,-1.02,1,.09,.22), trackG(-.38,-1.02,1,.09,.22),
    loft([[-1.05,.38,.07,.25],[-.85,.47,.11,.25],[.3,.47,.11,.25],[1.06,.2,.03,.17]],SKIRT), tone(at(box(.34,.03,.1),0,.345,.44),GL),
    ...pair(tone(at(box(.025,.11,.36),.5,.22,-.82),DK)),
    at(loft([[-.86,.1,.05],[-.56,.2,.085],[-.1,.19,.08],[.4,0,0,-.03]],HEX),0,.45,-.05), tone(at(box(.07,.08,.07),.08,.555,-.32),DK),
    ...gunG([brl(.058,0,.24),at(taper(.04,.03,1.2,6),0,0,.84)],.45,.24)],
  /* 装甲兵員輸送車（惑星共和国）: eight wheels under a boat hull with a crease along its sides and an upswept prow, a flat
     uncrewed turret with a long thin cannon */
  apcM:()=>[...[-.7,-.28,.16,.6].flatMap(z=>[wheelG(.37,z),wheelG(-.37,z)]),
    loft([[-.98,.3,.13,.36],[-.72,.37,.15,.37],[.45,.37,.15,.37],[.85,.28,.1,.37],[1.1,.1,.03,.41]],CREASE), tone(at(box(.26,.03,.04),0,.5,.58,.3),GL),
    at(new THREE.CylinderGeometry(.15,.2,.08,6),0,.56,.02), ...gunG([brl(.018,0,.78),at(box(.05,.05,.2),.06,0,.1)],.58,.1)],
  /* 自走砲（惑星共和国）: the common hull under a tall narrow gun house with cut top edges, the longest gun on the field */
  spgM:()=>[trackG(.38,-1.02,1,.09,.22), trackG(-.38,-1.02,1,.09,.22),
    loft([[-1.05,.38,.07,.25],[-.85,.47,.11,.25],[.3,.47,.11,.25],[1.06,.2,.03,.17]],SKIRT), tone(at(box(.34,.03,.1),0,.345,.5),GL),
    at(loft([[-.92,.2,.15],[-.5,.24,.19],[.18,.22,.17],[.46,.11,.09,-.04]],FACET),0,.56,-.05), tone(at(box(.07,.07,.07),.1,.775,-.4),DK),
    ...gunG([brl(.062,0,.26),brl(.038,.26,1.72),brl(.055,1.56,1.72)],.6,.3,.22)],
  /* 強化歩兵: a soldier about 2 m tall in a powered exoskeleton, and the frame is what shows (user decision 2026-11-12): a dark
     slim body inside a frame in the team colour — foot plates, a strut down the outside of each leg with a knee block, a hip
     ring, a power unit on the back, a yoke across the shoulders, arm struts; a rifle held level in the right hand */
  inf:()=>exoParts(false),
  /* 重強化歩兵: the same frame a little bigger, with some armour (chest, shoulders, thighs) and a multi-launcher against armour
     on the back, its tubes showing over the shoulders (user decision 2026-11-12) */
  hinf:()=>{ const p=exoParts(true); p.forEach(g=>g.scale(1.12,1.12,1.12)); return p; },
  /* 戦闘機 A: the stealth fighter, kin to the carrier fighter. A chined body blended into a swept wing with a sawtooth trailing
     edge, canted twin tails, a dark canopy; thick enough to read from the side */
  ftrA:()=>[loft([[-.9,.13,.07],[-.35,.21,.14],[.25,.17,.13],[.72,.08,.07],[1.08,0,0]]),
    at(plate([[0,.6],[.2,.4],[.9,-.5],[.9,-.66],[.42,-.5],[.2,-.7],[0,-.55],[-.2,-.7],[-.42,-.5],[-.9,-.66],[-.9,-.5],[-.2,.4]],.06),0,-.01,0),
    tone(at(loft([[.18,.07,.04],[.4,.08,.08,.02],[.72,0,0]]),0,.1,0),GL),
    ...pair(at(plate([[0,-.4],[0,-.86],[.3,-.96],[.3,-.74]],.035),.15,.06,0,0,0,Math.PI/2-.42)),
    ...pair(tone(at(box(.13,.09,.14),.1,0,-.92),DK))],
  /* 戦闘機 B: the delta fighter. A long needle body, a plain delta wing, small canards behind the canopy, one tall fin, an
     intake under the body */
  ftrB:()=>[loft([[-.95,.1,.1],[-.5,.14,.15],[.2,.12,.13],[.7,.07,.08],[1.12,0,0]]),
    at(plate([[0,.25],[.82,-.7],[.82,-.82],[0,-.78],[-.82,-.82],[-.82,-.7]],.06),0,-.03,0),
    ...pair(at(plate([[.1,.6],[.36,.38],[.36,.3],[.1,.36]],.035),0,.04,0)),
    tone(at(loft([[.22,.06,.04],[.45,.07,.08,.02],[.78,0,0]]),0,.11,0),GL),
    at(plate([[0,-.3],[0,-.9],[.42,-1],[.42,-.78]],.04),0,.1,0,0,0,Math.PI/2),
    tone(at(loft([[-.5,.11,.06],[.1,.11,.06],[.3,.08,.03]],RECT),0,-.16,0),DK), tone(at(tube(.09,.14,6),0,0,-.98),DK)],
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
   {key, size, form}, or {earth:spec, mars:spec} when the two sides have their own shapes. key: in GROUND_SHAPES; size: scale of
   the model in the ground board's units (4 units = 1 km); form: a name in GROUND_FORMS (default one). A kind that is not listed
   keeps the old drawing. Empty until the user approves the samples (CLAUDE.md: looks go in after a sample is approved) */
const GROUND_MODELS={};
/* ?groundModels=kind:key:size:form,kind@mars:key:size:form in the page address overrides the table (for sample shots only);
   an entry without @side applies to both sides. Returns {key,size,form,offsets} or null */
function groundModelFor(kind,side='earth'){
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k), done=m=>m&&has(GROUND_SHAPES,m.key)?{key:m.key,size:Number.isFinite(+m.size)&&+m.size>0?+m.size:1,form:has(GROUND_FORMS,m.form)?m.form:'one',offsets:GROUND_FORMS[has(GROUND_FORMS,m.form)?m.form:'one']}:null;
  const q=typeof location!=='undefined'&&new URLSearchParams(location.search).get('groundModels');
  if(q) for(const who of [kind+'@'+side,kind]) for(const s of q.split(',')){
    if(!s.startsWith(who+':')) continue;
    const [key,size,form]=s.slice(who.length+1).split(':'), m=done({key,size,form}); if(m) return m;
  }
  const m=GROUND_MODELS[kind]; return done(m&&(m.earth||m.mars)?m[side]:m);
}
function groundShapeGeo(key,mono=false){ return Object.prototype.hasOwnProperty.call(GROUND_SHAPES,key)?groundJoin(GROUND_SHAPES[key](),mono):null; }
