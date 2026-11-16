/* War of Space battle: low-poly models for the ground battle (ground units, aircraft, sea ships).
   Classic script, loaded right after battle/shapes.js: it uses that file's helpers (at, box, tube, taper, loft, plate, pair, mirror).
   Every model points forward along +Z with +Y up and is about 2 units long. Ground models stand on y = 0; ships float with the
   waterline at y = 0; aircraft are centred on y = 0.
   A part may carry a tone: tone(g, k) darkens (k < 1) that part against the team colour, so tracks, wheels and glass read apart.
   All models here are flat shaded (one normal per face), unlike the space ships. */
const tone=(g,k)=>{ g.userData.tone=k; return g; };
/* join parts into one flat-shaded geometry with a grey vertex colour per part (multiplies the material's team colour) */
function groundJoin(parts,mono=false){
  parts=parts.filter(g=>{ if(g.userData.rig?.part==='frame'){ g.dispose(); return false; } return true; });
  parts=parts.map(g=>{ if(!g.index) return g; const n=g.toNonIndexed(); n.userData.tone=g.userData.tone; return n; });
  let n=0; parts.forEach(g=>n+=g.attributes.position.count);
  const pos=new Float32Array(n*3), col=new Float32Array(n*3); let o=0;
  parts.forEach(g=>{ const c=g.attributes.position.count, k=mono?1:(g.userData.tone??1); pos.set(g.attributes.position.array,o*3);
    if(Array.isArray(k)) for(let i=o;i<o+c;i++) col.set(k,i*3); else col.fill(k,o*3,(o+c)*3); o+=c; g.dispose(); }); // tone は濃さ1つか、色 [r,g,b]（畑・水・道）
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
/* a disc with its axis across the body (road wheels, joints of the frame) */
const discG=(x,y,z,r,w=.05)=>{ const g=new THREE.CylinderGeometry(r,r,w,6); g.rotateZ(Math.PI/2); return at(g,x,y,z); };
/* vehicle parts. trackG: a dark track block along one side, raised at both ends, with a row of road wheels showing on its outer face. wheelG: a dark road wheel on a side.
   brl: a piece of barrel from z0 to z1 along +Z from the trunnion at the origin. gunG: barrel pieces set at the trunnion and
   raised by el radians */
const trackG=(x,z0,z1,w=.1,h=.24,n=6)=>[tone(at(loft([[z0,w,h*.22,h*.64],[z0+.14,w,h/2,h/2],[z1-.17,w,h/2,h/2],[z1,w,h*.22,h*.68]],RECT),x,0,0),DK),
  ...[...Array(n)].map((_,i)=>tone(discG(x+Math.sign(x)*(w+.012),h*.4,z0+.2+(z1-z0-.42)*i/(n-1),h*.36,.03),.6))];
const wheelG=(x,z,r=.15,w=.12)=>{ const g=new THREE.CylinderGeometry(r,r,w,8); g.rotateZ(Math.PI/2); return tone(at(g,x,r,z),DK); };
const brl=(r,z0,z1,seg=6)=>at(tube(r,z1-z0,seg),0,0,(z0+z1)/2);
const gunG=(pieces,y,z,el=0)=>pieces.map(g=>tone(at(g,0,y,z,-el),DK));
/* 動く部品の印（ユーザー 2026-11-17）: TUR 砲塔（向きを変える）、GUN 砲（仰角を変える）。形は変えない。groundRig が印で分ける */
const TUR=ps=>ps.map(g=>{ g.userData.part='turret'; return g; }), GUN=ps=>ps.map(g=>{ g.userData.part='gun'; return g; });
/* shared running gear (docs/models.md 2). hullE: the Earth's tank hull — tracks showing under plate skirts, a flat deck, a
   sloping glacis (top of the deck at y .36), a fender over each track from the hull side out to the skirt, turned down at both
   ends (user 2026-11-13: no open space above the tracks). hullM: the Republic's common hull for tank, gun, air defence, rockets and
   engineers — long and low, skirts in one piece with the hull, a long shallow glacis over the crew capsule with a dark sensor
   strip instead of hatches; where the hull draws in at the nose and the tail, a guard covers each track end. wheelsG: road wheels at the given z on both sides, each pair on an axle with a suspension arm up to the hull (user 2026-11-12: wheels with nothing between them and the hull look wrong). piv: parts built around a pivot at the
   origin, raised by el and set at x,y,z */
const hullE=()=>[...trackG(.37,-.98,.98), ...trackG(-.37,-.98,.98), ...pair(at(box(.03,.13,1.66),.485,.22,-.03)), loft([[-.95,.34,.09,.27],[.5,.34,.09,.27],[.97,.31,.035,.215]],SLAB),
  ...pair(tone(at(loft([[-1.01,.11,.012,.2],[-.9,.11,.014,.262],[.84,.11,.014,.262],[1.01,.11,.012,.2]],RECT),.39,0,0),.9))];
const hullM=()=>[...trackG(.38,-1.02,1,.09,.22,7), ...trackG(-.38,-1.02,1,.09,.22,7), loft([[-1.05,.38,.07,.25],[-.85,.47,.11,.25],[.3,.47,.11,.25],[1.06,.2,.03,.17]],SKIRT), tone(at(box(.34,.03,.1),0,.345,.46),GL),
  ...pair(tone(at(loft([[.2,.1,.012,.27],[.84,.1,.012,.24],[1.03,.1,.012,.18]],RECT),.385,0,0),.8)), ...pair(tone(at(loft([[-1.05,.1,.012,.18],[-.93,.1,.012,.24],[-.78,.1,.012,.26]],RECT),.385,0,0),.8))];
const wheelsG=(zs,x=.37,r=.15)=>zs.flatMap(z=>[wheelG(x,z,r),wheelG(-x,z,r), tone(at(box(2*x,.05,.05),0,r,z),.45), ...pair(tone(barG([x-.21,r+.1,z],[x-.07,r,z],.06,.05),.45))]);
const piv=(parts,x,y,z,el=0)=>parts.map(g=>at(g,x,y,z,-el));
/* the Earth's truck: four axles, a frame, a cab with a windscreen at the front; the bed is free from z -.95 to .4 at y .31 */
const truckE=()=>[...wheelsG([-.7,-.3,.22,.64]), tone(at(box(.5,.1,1.9),0,.26,0),.6), loft([[.44,.34,.17,.48],[.84,.34,.17,.48],[.98,.32,.09,.41]],SLAB), tone(at(box(.56,.09,.03),0,.56,.9,.5),GL)];
/* the Republic's truck: three axles under a sealed creased nose with a sensor strip and no windows */
const truckM=()=>[...wheelsG([-.66,-.2,.6]), tone(at(box(.48,.1,1.9),0,.26,0),.6), loft([[.36,.33,.14,.45],[.8,.3,.12,.44],[1.05,.1,.04,.42]],CREASE), tone(at(box(.3,.03,.04),0,.527,.9,.38),GL)];
/* a straight faceted limb from a to b (n sides) */
function segG(a,b,r0,r1,n=6){ const A=new THREE.Vector3(...a), d=new THREE.Vector3(...b).sub(A), l=d.length(), g=new THREE.CylinderGeometry(r1,r0,l,n);
  g.translate(0,l/2,0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))); g.translate(A.x,A.y,A.z); return g.toNonIndexed(); }
/* a flat bar from a to b: width w across the body, thickness t */
function barG(a,b,w,t){ const A=new THREE.Vector3(...a), d=new THREE.Vector3(...b).sub(A), l=d.length(), g=new THREE.BoxGeometry(w,l,t);
  g.translate(0,l/2,0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))); g.translate(A.x,A.y,A.z); return g.toNonIndexed(); }
/* poses of the trooper (h…: the heavy one). d: how far the hips drop, L: forward lean of the upper body (radians), feet: [half
   stance width, z, ankle height] for the left and the right foot (…2: the other step, feet changed over; c…: the commando), el: elbows in the upright body's coordinates
   (right, left), wr: wrists in the world (right, left; the heavy one's left hand is set from the gun), gun: where the right
   hand holds the weapon, or rifle: the two ends of a rifle carried across the chest (wrU, rifleU: the same given in the upright
   body's coordinates, so they follow a deep lean) */
const EXO_POSE={
  walk:{d:.03,L:.08,feet:[[.11,.17],[.11,-.15,.11]],el:[[-.31,1.05,.02],[.31,1.09,.05]],wr:[[-.11,.94,.2],[.1,1.11,.22]],rifle:[[-.23,.84,.23],[.23,1.26,.23]]},
  fight:{d:.08,L:.2,feet:[[.13,.22],[.13,-.2,.11]],el:[[-.34,1.157,.054],[.17,1.154,.238]],wr:[[-.11,1.2,.3],[-.02,1.19,.5]],gun:[-.11,1.2,.3]},
  hwalk:{d:.05,L:.12,feet:[[.14,.17],[.14,-.15,.11]],el:[[-.32,1.05,-.05],[.21,1.07,.19]],gun:[-.27,.81,.13]},
  cwalk:{d:.12,L:.38,feet:[[.11,.2],[.11,-.18,.11]],el:[[-.31,1.05,.02],[.31,1.09,.05]],wrU:[[-.11,.96,.2],[.1,1.13,.21]],rifleU:[[-.3,.78,.22],[.3,1.34,.21]]},
  cfight:{d:.43,L:.15,feet:[[.12,.3],[.12,-.45,.08]],el:[[-.34,1.157,.054],[.17,1.154,.238]],wr:[[-.11,.86,.29],[-.02,.85,.5]],gun:[-.11,.86,.29]},
};
/* the other step of each walk: the feet change places */
for(const k of ['walk','hwalk','cwalk']) EXO_POSE[k+'2']={...EXO_POSE[k],feet:[...EXO_POSE[k].feet].reverse()};
/* the exoskeleton trooper (docs/models.md 3.2). The body is eight heads tall (1.6 units upright: chin 1.4, chest 1.2, navel 1,
   crotch .8, knee .45; shoulders two heads wide), drawn dark; the frame around it is in the team colour: foot plates, struts down
   the outside of each leg with discs at hip and knee, a hip ring, a spine and power unit, a yoke across the shoulders, struts
   down the arms, a helmet. Its right is -X. It never stands straight: the hips are dropped, the knees bent, the body leaning
   forward, one foot ahead (user decision 2026-11-12). pose walk: moving, the rifle carried across the chest; fight: lower, the
   rifle levelled with its butt against the right shoulder (user decision 2026-11-12). The heavy one has the one pose. Each walk has a
   second step (walk2) with the feet changed over; in the game each trooper steps on its own clock.
   kind true (heavy): armour over the whole body, a big round helmet in a high collar, frame struts on the inside of the legs too, a
   multi-launcher and an ammunition drum on the back, and a large rapid-fire cannon held at the right hip like a minigun; armour sleeves on the arms.
   The ordinary trooper and the commando wear an armour vest over the body (user 2026-11-13).
   kind 'c' (commando): no power unit but a ghillie suit — shaggy tufts in two tones over the head, shoulders, back and arms and
   wrapped round the rifle (user 2026-11-12), none on the chest front, where the vest shows (user 2026-11-13) — and a long rifle with a sight; it moves in a low crouch, carrying the
   rifle across the chest as the ordinary trooper does (user 2026-11-12), and fights kneeling */
function exoParts(kind,pose,msl=false){ const heavy=kind===true, cmd=kind==='c', BODY=.16, T=.375, P=EXO_POSE[(heavy?'h':cmd?'c':'')+pose], p=[], U=[], body=g=>tone(g,BODY), HY=.82-P.d, mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
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
    at(box(.44,.06,.2),0,.86,0), at(box(.07,.44,.06),0,1.08,-.13), at(box(.54,.05,.1),0,1.37,-.07),
    ...(cmd?[[0,1.55,-.05,.15],[.25,1.37,-.04,.13],[-.25,1.37,-.04,.13],[0,1.22,-.17,.2],[.13,1.02,-.16,.15],[-.13,1.0,-.17,.15],[0,.85,-.14,.14],[0,1.4,-.14,.13]].map(v=>tuftG(...v)):[at(box(.25,.27,.12),0,1.17,-.2)]));
  /* the armour vest (user 2026-11-13): a plate carrier over chest and back in a mid tone, a row of pouches under the front plate, straps over the shoulders */
  if(!heavy) U.push(tone(stand(loft([[.99,.135,.1],[1.06,.15,.11],[1.22,.205,.13],[1.33,.2,.105]],HEX)),.62), ...[-.09,0,.09].map(x=>tone(at(box(.075,.085,.045),x,1.045,.105-Math.abs(x)*.25),.4)),
    ...pair(tone(at(box(.07,.035,.2),.13,1.345,0),.62)));
  if(!heavy){ const head=new THREE.IcosahedronGeometry(.1,0); head.scale(1,1.15,1.05); U.push(at(head,0,1.5,0), tone(at(box(.13,.04,.04),0,1.51,.085),GL)); }
  else { const head=new THREE.IcosahedronGeometry(.118,1); head.scale(1,1.05,1.08);
    U.push(at(head,0,1.53,0), tone(at(box(.17,.065,.05),0,1.54,.095),GL), at(new THREE.CylinderGeometry(.15,.175,.13,8),0,1.43,-.005),
      stand(loft([[1.08,.2,.13],[1.3,.25,.15],[1.4,.2,.11]],HEX)), at(box(.27,.14,.06),0,.99,.095), at(box(.26,.1,.07),0,.86,.09),
      ...pair(at(loft([[-.11,.1,.07],[.11,.085,.05]],SLAB),.325,1.36,-.01)), ...pair(at(box(.075,.19,.1),.34,1.17,-.03)),
      /* the launcher on the back: carried low behind the head; msl: swung up over the head on two arms, its tubes forward and up, to fire (user 2026-11-17) */
      ...(msl?[at(box(.42,.2,.3),0,1.83,-.2,-.42), tone(at(box(.38,.16,.012),0,1.89,-.065,-.42),DK), ...pair(tone(segG([.04,1.4,-.25],[.15,1.76,-.24],.022,.022,5),.45))]
        :[at(box(.42,.2,.26),0,1.5,-.29,-.25), tone(at(box(.36,.14,.02),0,1.535,-.165,-.25),DK)]), at(box(.1,.18,.1),0,1.33,-.25), tone(discG(0,1.0,-.27,.12,.24),.6)); }
  for(const g of U) g.applyMatrix4(M);
  p.push(...U);
  /* arms and weapon, in the world: shoulder and elbow follow the lean, the hands hold the weapon */
  const G=P.gun, rifle=P.rifleU?P.rifleU.map(W):P.rifle, wr=heavy?[[G[0],G[1]+.01,G[2]],[G[0]+.06,G[1]+.14,G[2]+.2]]:P.wrU?P.wrU.map(W):P.wr;
  [[-.21,1.31,0],[.21,1.31,0]].forEach((s0,i)=>{ const sx=Math.sign(s0[0]), sh=W(s0), el=W(P.el[i]), o=v=>[v[0]+sx*.055,v[1]+.02,v[2]-.02];
    p.push(body(segG(sh,el,.055,.045)), body(segG(el,wr[i],.045,.035)), discG(sh[0]+sx*.07,sh[1]+.02,sh[2]-.02,.062), segG(o(sh),o(el),.024,.022,5), segG(o(el),o(wr[i]),.022,.02,5), discG(el[0]+sx*.055,el[1],el[2]-.02,.045,.04));
    if(heavy) p.push(segG(mix(sh,el,.12),mix(sh,el,.86),.082,.072), segG(mix(el,wr[i],.16),mix(el,wr[i],.88),.07,.058));
    if(cmd) p.push(tuftG(...mix(sh,el,.45),.1), tuftG(...mix(el,wr[i],.4),.075)); });
  if(rifle) p.push(tone(barG(rifle[0],rifle[1],.05,.075),DK), ...(cmd?[tuftG(...mix(rifle[0],rifle[1],.62),.07), tuftG(...mix(rifle[0],rifle[1],.85),.055)]:[]));
  else if(cmd) p.push(tone(at(box(.045,.07,1),G[0],G[1]+.03,G[2]+.3),DK), tone(at(tube(.034,.22,5),G[0],G[1]+.03,G[2]+.9),DK), tone(at(box(.04,.12,.05),G[0],G[1]-.05,G[2]+.02),DK), tone(at(box(.035,.05,.2),G[0],G[1]+.09,G[2]+.2),GL), tuftG(G[0],G[1]+.04,G[2]+.55,.07), tuftG(G[0],G[1]+.03,G[2]+.74,.055));
  else if(!heavy) p.push(tone(at(box(.05,.08,.8),G[0],G[1]+.03,G[2]+.22),DK), tone(at(box(.045,.13,.06),G[0],G[1]-.05,G[2]+.02),DK), tone(at(box(.03,.04,.1),G[0],G[1]+.09,G[2]+.2),DK));
  else p.push(tone(at(box(.1,.13,.36),G[0],G[1],G[2]+.08),DK), tone(at(tube(.06,.3,6),G[0],G[1],G[2]+.4),.6), tone(at(tube(.04,.5,6),G[0],G[1],G[2]+.78),DK), tone(at(tube(.058,.1,6),G[0],G[1],G[2]+1.06),DK),
    tone(at(box(.03,.03,.24),G[0]+.05,G[1]+.13,G[2]+.18),DK), tone(at(box(.03,.08,.03),G[0]+.05,G[1]+.09,G[2]+.08),DK), tone(at(box(.03,.08,.03),G[0]+.05,G[1]+.09,G[2]+.28),DK),
    tone(segG(W([-.12,.97,-.22]),[G[0],G[1]+.02,G[2]-.06],.03,.03,5),DK));
  return p; }
/* a tuft of a ghillie suit: an uneven faceted lump, its shape and tone fixed by where it sits */
function tuftG(x,y,z,r){ const g=new THREE.IcosahedronGeometry(r,0), q=g.attributes.position; let h=Math.abs(Math.sin(x*91.7+y*57.3+z*33.1+r*17))*1e4;
  const rnd=()=>(h=(h*9301+49297)%233280)/233280, seen={};
  for(let i=0;i<q.count;i++){ const k=[q.getX(i),q.getY(i),q.getZ(i)].map(v=>v.toFixed(3)).join(), f=seen[k]||(seen[k]=.6+rnd()*.85); q.setXYZ(i,q.getX(i)*f,q.getY(i)*f*1.15,q.getZ(i)*f); }
  return tone(at(g,x,y,z),rnd()<.5?.55:.8); }
/* W.A.S. (docs/models.md 11): one design for space and for the ground. The infantry's and the factory's powered exoskeleton
   grown to 4–5 m: the trunk is small (a size up from a person), the limbs are extended and big. What every proposal carries
   (user decision 2026-11-12): over the left shoulder a long cannon held at its middle by an arm from the back, a cylinder with
   the case ejector at its rear; on the right arm two big three-barrelled rotary cannon one above the other and a few anti-ship
   rockets, fed from the pack; on the left arm a reactive shield against lasers, a long tiled slab drawn to a point whose tip
   throws plasma; round the waist two coiled sub-arms with three fingers; thrusters in the legs and the pack. Its right is -X.
   WAS_KIT builds those parts at the places a body gives */
const WAS_KIT=(()=>{ const dk=g=>tone(g,DK), J=(x,y,z,r,w=.08)=>tone(discG(x,y,z,r,w),.35);
  const rot=(x,y,z)=>[dk(at(tube(.05,.16,6),x,y,z+.2)), ...[0,2.1,4.2].map(a=>dk(at(tube(.016,.7,5),x+Math.cos(a)*.03,y+Math.sin(a)*.03,z+.59))), dk(at(tube(.045,.05,6),x,y,z+.56)), dk(at(tube(.047,.07,6),x,y,z+.92))];
  return { dk, J,
    cannon:(x,y,z,from)=>[at(tube(.085,.42,8),x,y,z-.4), dk(at(box(.07,.06,.14),x+.1,y,z-.44)), dk(at(box(.05,.1,.05),x,y-.1,z-.5)), at(box(.13,.14,.4),x,y,z), dk(at(box(.04,.03,.5),x,y+.085,z+.05)),
      dk(at(tube(.03,1.15,6),x,y,z+.78)), dk(at(tube(.046,.08,6),x,y,z+1.37)), dk(at(box(.03,.03,.7),x,y-.05,z+.6)), segG(from,[x,y-.08,z-.02],.045,.04), J(x,y-.08,z-.02,.055,.09)],
    guns:(x,y,z,back)=>[at(box(.17,.32,.38),x,y,z), ...rot(x,y+.075,z), ...rot(x,y-.075,z), ...[-.06,0,.06].map(d=>tone(at(tube(.028,.3,6),x+d,y+.195,z-.02),.7)), ...[-.06,0,.06].map(d=>dk(at(tube(.03,.04,6),x+d,y+.195,z+.15))),
      dk(segG([x,y+.04,z-.18],[(x+back[0])/2,Math.min(y,back[1])-.16,(z+back[2])/2],.028,.028,5)), dk(segG([(x+back[0])/2,Math.min(y,back[1])-.16,(z+back[2])/2],back,.028,.028,5))],
    shield:(x,y,z,tilt)=>{ const SH=g=>at(g,x,y,z,tilt,0,Math.PI/2);
      return [SH(plate([[.5,-.13],[.5,.13],[.2,.17],[-.2,.12],[-.56,.025],[-.56,-.025],[-.2,-.12],[.2,-.17]],.05)), ...[.37,.22,.07,-.08].flatMap(u=>[-.07,.07].map(w=>tone(SH(at(box(.12,.035,.11),u,-.04,w)),.8))),
        dk(SH(at(box(.2,.06,.07),-.6,0,0))), tone(SH(at(box(.06,.03,.03),-.72,0,0)),GL)]; },
    /* the two rotary cannon are mounted ON the forearm, not the arm itself, slim, one above the other (user 2026-11-12), fixed
       to it so that barrels and forearm are parallel, close against it, with ONE launcher of three rocket tubes on the outer
       side; detailed after the user's photo of a twin rotary cannon: a long receiver box reaching back past the elbow with
       three lamps on its rear, a drive plate between the guns, a thick sleeve where the barrels leave, a ring and a thick muzzle
       at their end, a light tube above and below, a grip underneath (user 2026-11-13). Built in the forearm's own frame: the
       elbow at the origin, +Z along the forearm; s is the outer side (-1: the right arm). The belt is added by the body */
    guns2:s=>{ const x=s*.125, z0=-.2, gun=yy=>[dk(at(tube(.038,.16,6),x,yy,z0+.32)), tone(at(tube(.041,.08,6),x,yy,z0+.56),.62),
        ...[0,2.1,4.2].map(a=>dk(at(tube(.011,.78,5),x+Math.cos(a)*.02,yy+Math.sin(a)*.02,z0+.79))),
        dk(at(tube(.028,.035,6),x,yy,z0+1.03)), tone(at(tube(.036,.11,6),x,yy,z0+1.2),.45), dk(at(tube(.039,.025,6),x,yy,z0+1.16))];
      return [...[.03,.27].map(z=>tone(at(box(.2,.15,.045),s*.035,0,z),.45)), at(box(.025,.13,.3),s*.082,0,.15),
        tone(at(box(.075,.21,.26),x,0,z0+.13),.55), ...[.06,0,-.06].map(d=>at(box(.03,.026,.012),x,d,z0-.004)), tone(at(box(.03,.1,.2),x,0,z0+.46),.45),
        ...gun(.062), ...gun(-.062),
        ...[.12,-.12].flatMap(d=>[at(tube(.02,.3,6),x,d,z0+.33), tone(at(tube(.023,.03,6),x,d,z0+.49),.6)]), dk(at(box(.02,.07,.03),x,-.165,z0+.4)),
        ...[.06,0,-.06].flatMap(d=>[tone(at(tube(.027,.32,6),x+s*.062,d,z0+.2),.7), dk(at(tube(.029,.025,6),x+s*.062,d,z0+.365))])]; },
    /* the shield is thin and rounded, curved across and along (user 2026-11-12); a little shorter and wider than before, its
       reactive tiles small, three-sided, spread over the middle of the slab and lying on the curve; the heat hawk is the slab's own outline
       drawn on to a dark point, with the emitter slit along it (user 2026-11-13). T: where the middle of the slab's chord goes,
       tilt: how far the top leans back, grips: points on the forearm, each joined to the inside of the shield by a bracket */
    shield2:(T,tilt,grips=[],turn=0,roll=0)=>{ const ca=.08, cl=.05, t=.025, R=[-.47,.42], body=[[-.3,.13],[-.14,.185],[.08,.2],[.28,.185],[.42,.13]], tip=[[-.47,.012],[-.4,.06],[-.3,.13]], all=[...tip,...body.slice(1)];
      const Ms=new THREE.Matrix4().compose(new THREE.Vector3(...T),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),roll).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt,turn,Math.PI/2))),new THREE.Vector3(1,1,1)), Mi=Ms.clone().invert(), SH=g=>{ g=g.index?g.toNonIndexed():g; g.applyMatrix4(Ms); return g; };
      const hw=u=>{ for(let i=0;i<all.length-1;i++) if(u<=all[i+1][0]) return all[i][1]+(all[i+1][1]-all[i][1])*Math.max(0,(u-all[i][0])/(all[i+1][0]-all[i][0])); return all[all.length-1][1]; };
      const bul=(u,z)=>{ const v=Math.max(-1,Math.min(1,z/hw(u))), uu=(u-(R[0]+R[1])/2)/((R[1]-R[0])/2); return -(ca*(1-v*v)+cl*(1-uu*uu)); };
      /* a small slab lying on the outer face at u, z */
      const on=(u,z,g,th,k)=>{ const e=.01, X=new THREE.Vector3(1,(bul(u+e,z)-bul(u-e,z))/(2*e),0).normalize(), Z=new THREE.Vector3(0,(bul(u,z+e)-bul(u,z-e))/(2*e),1).normalize(); g=g.index?g.toNonIndexed():g;
        g.applyMatrix4(new THREE.Matrix4().makeBasis(X,new THREE.Vector3().crossVectors(Z,X),Z).setPosition(u,bul(u,z)-t/2-th/2+.003,z)); return tone(SH(g),k); };
      /* reactive tiles: three-sided, set point to base in rows like a honeycomb of triangles (user 2026-11-13), over the middle of the slab */
      const r=.044, tile=(u0,k,i)=>{ const up=(k+i)%2===0, g=new THREE.CylinderGeometry(r,r,.012,3); g.rotateY(up?Math.PI/2:-Math.PI/2); return on(u0+(up?r/2:r),k*.046,g,.012,.66); };
      return [SH(curvedSlab(body,ca,cl,t,4,R)), tone(SH(curvedSlab(tip,ca,cl,t,4,R)),.42), on(-.37,0,box(.17,.012,.022),.012,GL),
        ...[-.155,-.08,-.005,.07,.145].flatMap((u0,i)=>[-3,-2,-1,0,1,2,3].filter(k=>Math.abs(k)*.046+.04<hw(u0+r*.75)*.85).map(k=>tile(u0,k,i))),
        ...grips.map(g=>{ const l=new THREE.Vector3(...g).applyMatrix4(Mi), u=Math.max(-.25,Math.min(.36,l.x)), z=Math.max(-.6,Math.min(.6,l.z/hw(u)))*hw(u); return tone(barG(g,new THREE.Vector3(u,bul(u,z)+t/2,z).applyMatrix4(Ms).toArray(),.07,.05),.45); })]; },
    subArms:(y,r)=>[tone(at(new THREE.CylinderGeometry(r,r,.04,8),0,y,0),.6), tone(at(new THREE.CylinderGeometry(r*.9,r*.9,.03,8),0,y+.04,0),.6),
      ...[r*.8,-r*.8].flatMap(x=>[tone(at(box(.06,.06,.07),x,y+.015,r*.75),.6), ...[-.03,0,.03].map(d=>dk(segG([x+d,y,r*.75+.03],[x+d*2.2,y-.06,r*.75+.11],.012,.008,4)))])] }; })();
/* a thin slab that is curved both across and along (the W.A.S. shield): stations [u, half width] along its length, bulging
   toward -y by ca across and cl along, thickness t. rng: the whole length the bulge runs over, when the slab is one piece of a
   longer one. Flat shaded like everything else */
function curvedSlab(st,ca,cl,t,m=4,rng){ const U0=rng?rng[0]:st[0][0], U1=rng?rng[1]:st[st.length-1][0], P=[], V=(x,y,z)=>new THREE.Vector3(x,y,z);
  const pt=(i,j,side)=>{ const [u,w]=st[i], v=-1+2*j/m, uu=(u-(U0+U1)/2)/((U1-U0)/2); return V(u,-(ca*(1-v*v)+cl*(1-uu*uu))+side*t/2,v*w); };
  const tri=(a,b,c,out)=>{ const n=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)); if(n.dot(out)<0) P.push(a,c,b); else P.push(a,b,c); };
  for(let i=0;i<st.length-1;i++) for(let j=0;j<m;j++) for(const side of [1,-1]){ const a=pt(i,j,side), b=pt(i+1,j,side), c=pt(i+1,j+1,side), d=pt(i,j+1,side), o=V(0,side,0); tri(a,b,c,o); tri(a,c,d,o); }
  const rim=(a,b)=>{ const A=pt(...a,1), B=pt(...b,1), C=pt(...b,-1), D=pt(...a,-1), o=V((A.x+B.x)/2-(U0+U1)/2,0,(A.z+B.z)/2); tri(A,B,C,o); tri(A,C,D,o); };
  for(let i=0;i<st.length-1;i++){ rim([i,0],[i+1,0]); rim([i,m],[i+1,m]); } for(let j=0;j<m;j++){ rim([0,j],[0,j+1]); rim([st.length-1,j],[st.length-1,j+1]); }
  const g=new THREE.BufferGeometry(); g.setFromPoints(P); g.computeVertexNormals(); return g; }
/* the section of the W.A.S. shoulder armour, a stub wing: x along the chord (-1 the leading edge), thickest a third of the way back */
const WAS_WING=[[-1,0],[-.35,1],[.45,.7],[1,0],[.45,-.45],[-.35,-.55]];
/* 案1 骨組み型: the factory frame shows. The pilot sits in a small dark pod inside a roll cage; the limbs are bare struts with
   pistons and dark joints, the legs bend back at a hock and end in three toes; a high truss carries the arms; ammunition drums
   and belts on the back */
function wasFrame(){ const K=WAS_KIT, p=[], th=(a,b,r=.04)=>segG(a,b,r,r*.9,5);
  for(const sx of [1,-1]){ const hip=[sx*.2,.84,-.02], knee=[sx*.23,.55,.16], hock=[sx*.23,.3,-.1], foot=[sx*.23,.07,.03];
    p.push(th(hip,knee,.055), th(knee,hock,.05), th(hock,foot,.045), K.dk(segG([hip[0],hip[1]-.05,hip[2]-.07],[hock[0],hock[1]+.05,hock[2]-.02],.018,.018,4)), K.dk(segG([knee[0],knee[1]-.04,knee[2]+.03],[foot[0],foot[1]+.06,foot[2]+.08],.016,.016,4)),
      K.J(hip[0],hip[1],hip[2],.08,.1), K.J(knee[0],knee[1],knee[2],.07,.09), K.J(hock[0],hock[1],hock[2],.06,.09), K.dk(at(new THREE.CylinderGeometry(.045,.075,.12,6),hock[0],hock[1]+.03,hock[2]-.1,.9)),
      at(box(.06,.05,.28),foot[0]+.07,.025,foot[2]+.12,0,.3,0), at(box(.06,.05,.28),foot[0]-.07,.025,foot[2]+.12,0,-.3,0), at(box(.05,.05,.18),foot[0],.025,foot[2]-.12),
      th([sx*.2,.88,-.02],[sx*.44,1.26,-.04],.028), K.J(sx*.5,1.24,0,.085,.1), th([sx*.5,1.22,.05],[sx*.52,.92,.06],.03), th([sx*.5,1.22,-.05],[sx*.52,.92,-.02],.03), K.J(sx*.52,.92,.02,.065,.11),
      th([sx*.14,.9,.12],[sx*.14,1.3,.08],.022), th([sx*.14,.9,-.12],[sx*.14,1.3,-.1],.022), th([sx*.14,1.3,.08],[sx*.14,1.3,-.1],.022)); }
  p.push(at(box(.36,.08,.16),0,.84,-.02), at(box(1,.05,.08),0,1.27,-.04), th([-.14,1.3,.08],[.14,1.3,.08],.022), th([0,.86,-.14],[0,1.26,-.14],.04),
    tone(stand(loft([[.92,.1,.09],[1.02,.14,.12],[1.18,.15,.12],[1.26,.1,.09]],HEX)),.35), tone(at(box(.16,.12,.03),0,1.12,.125),GL), at(box(.1,.07,.1),0,1.36,.05), tone(at(box(.08,.025,.03),0,1.365,.1),GL),
    ...[.12,-.12].map(x=>{ const g=new THREE.CylinderGeometry(.1,.1,.2,8); g.rotateZ(Math.PI/2); return tone(at(g,x,1.02,-.27),.6); }), ...pair(K.dk(at(new THREE.CylinderGeometry(.045,.075,.12,6),.1,.82,-.22,.5))),
    th([-.52,.92,.02],[-.5,.82,.28],.05), th([.52,.92,.02],[.54,.66,.2],.05), K.dk(segG([.14,1.08,-.32],[.34,1.44,-.34],.025,.025,5)),
    ...K.guns(-.5,.8,.44,[-.14,1.05,-.34]), ...K.shield(.66,.74,.17,-.5), ...K.cannon(.34,1.52,0,[.2,1.28,-.12]), ...K.subArms(.9,.15));
  return p; }
/* 案2 重装型: the frame buried in armour. Great shoulder blocks with the small trunk and a tiny head sunk between them, thick
   forearms, shins that widen down to square feet with thruster vents behind, skirt plates over the hips, a big pack with two
   boosters */
function wasHeavy(){ const K=WAS_KIT, p=[];
  for(const sx of [1,-1]){ const hip=[sx*.17,.8,0], knee=[sx*.21,.48,.08], ank=[sx*.21,.16,-.02];
    p.push(segG(hip,knee,.12,.11), K.J(hip[0],hip[1],hip[2],.09,.1), at(box(.18,.15,.16),knee[0],knee[1],knee[2]+.05),
      at(stand(loft([[.07,.17,.19],[.3,.15,.16],[.5,.11,.11]],SLAB)),ank[0],0,ank[2]), K.dk(at(box(.22,.12,.04),ank[0],.2,ank[2]-.2)), at(box(.23,.08,.42),ank[0],.04,ank[2]+.08),
      at(loft([[-.18,.15,.13],[.16,.13,.11]],SLAB),sx*.5,1.23,0), K.J(sx*.41,1.2,0,.09,.06), segG([sx*.5,1.12,0],[sx*.53,.86,.03],.1,.1), at(box(.04,.2,.2),sx*.27,.74,0), at(box(.15,.17,.04),sx*.09,.73,.15,-.2)); }
  p.push(at(box(.34,.12,.24),0,.8,0), tone(segG([0,.85,0],[0,.92,0],.09,.08),.35), stand(loft([[.9,.13,.11],[1.02,.2,.15],[1.2,.24,.16],[1.28,.16,.11]],HEX)), tone(at(box(.16,.07,.03),0,1.13,.155),GL),
    at(box(.3,.06,.2),0,1.29,-.02), at(box(.1,.08,.11),0,1.345,.03), tone(at(box(.08,.025,.03),0,1.35,.085),GL),
    at(box(.44,.4,.24),0,1.05,-.28), ...pair(K.dk(at(new THREE.CylinderGeometry(.07,.11,.2,6),.13,.8,-.32,.4))), ...pair(tone(at(tube(.06,.3,6),.27,1.08,-.3,Math.PI/2),.7)),
    at(box(.2,.2,.3),-.53,.8,.14), at(box(.2,.2,.3),.53,.74,.12),
    ...K.guns(-.53,.8,.5,[-.16,1.02,-.4]), ...K.shield(.7,.74,.16,-.45), ...K.cannon(.36,1.56,0,[.22,1.3,-.16]), ...K.subArms(.9,.17));
  return p; }
/* 案3 鋭角型: slim and sharp, every limb four-sided and widening toward its end. A wide angular chest over a narrow waist, a
   small head with a fin swept back, pointed pods on the shoulders, big gauntlets, lower legs that flare to pointed feet with
   thruster vanes behind, blades at the hips */
function wasSharp(){ const K=WAS_KIT, p=[];
  for(const sx of [1,-1]){ const hip=[sx*.14,.84,0], knee=[sx*.18,.5,.1], ank=[sx*.19,.14,-.03];
    p.push(segG(hip,knee,.07,.085,4), K.J(hip[0],hip[1],hip[2],.07,.09), at(new THREE.ConeGeometry(.05,.18,4),knee[0],knee[1]+.05,knee[2]+.08,1.2), segG(knee,ank,.075,.135,4),
      tone(at(box(.02,.3,.15),ank[0],.36,ank[2]-.17,.25),.75), K.dk(at(new THREE.CylinderGeometry(.04,.07,.1,6),ank[0],.16,ank[2]-.16,.9)), at(loft([[-.14,.08,.05],[.1,.1,.06],[.34,.02,.02,-.03]],SLAB),ank[0],.06,ank[2]),
      tone(at(box(.03,.3,.16),sx*.27,.7,-.06,.35,0,sx*.2),.8),
      at(loft([[-.2,.12,.1],[.02,.15,.12],[.26,.04,.04]],HEX),sx*.5,1.3,-.02), tone(at(box(.02,.06,.22),sx*.655,1.3,-.04),GL), K.J(sx*.42,1.2,0,.07,.07), segG([sx*.46,1.18,0],[sx*.5,.88,.03],.055,.06,4), K.J(sx*.5,.88,.03,.055,.09)); }
  p.push(at(loft([[-.1,.12,.06],[.12,.08,.05]],HEX),0,.84,0), tone(segG([0,.87,0],[0,.93,0],.06,.055),.35), stand(loft([[.9,.07,.07],[1,.1,.1],[1.18,.26,.15],[1.27,.14,.09]],HEX)),
    at(loft([[0,.11,.06],[.15,0,0]],HEX),0,1.16,.12), tone(at(box(.12,.06,.03),0,1.06,.105),GL),
    at(new THREE.IcosahedronGeometry(.06,0),0,1.33,.03), tone(at(box(.08,.02,.03),0,1.335,.085),GL), at(plate([[0,.05],[0,-.22],[.1,-.28],[.045,0]],.02),0,1.36,0,0,0,Math.PI/2),
    at(box(.26,.34,.16),0,1.06,-.2), ...pair(at(loft([[-.32,.03,.03],[-.1,.075,.075],[.1,.05,.05]],HEX),.2,1.1,-.26,.5)), ...pair(K.dk(at(new THREE.CylinderGeometry(.04,.065,.1,6),.2,.95,-.52,1.1))),
    segG([-.5,.88,.03],[-.47,.8,.3],.07,.1,4), segG([.5,.88,.03],[.52,.64,.22],.07,.1,4),
    ...K.guns(-.47,.8,.46,[-.1,1.05,-.3]), ...K.shield(.64,.72,.17,-.5), ...K.cannon(.32,1.54,0,[.16,1.28,-.14]), ...K.subArms(.89,.12));
  return p; }
/* 案1+3 (user decision 2026-11-12): the sharp body carried on the bare frame. From the sharp one: every limb four-sided and
   widening to its end, an angular chest, pointed pods on the shoulders, a small head with a fin, flared lower legs with vanes
   and pointed feet. From the frame: pistons along the legs, a truss out to the shoulders, the pilot's dark pod showing in a cage
   under the chest armour, ammunition drums and belts on the back. Real forearms and hands: the guns hang on the right forearm
   and the shield on the left. The knife is sheathed on the right thigh.
   User 2026-11-13: the legs a little shorter (thigh .36 → .32, shin .39 → .35), the knees bent more and the hips dropped from
   .84 to .69, the body leaning forward; the trunk .7 times as wide (chest half-width .26 → .18) and drawn forward to a point like
   a nose cone; the shoulders closer to the body (x .5 → .37) and armoured — a guard plate and a four-sided upper arm, no bare
   struts; the upper arm .4 times as long (.32 → .13); the right forearm and the guns' barrels parallel; nothing floats — every
   part is placed from the joints (hip, knee, ankle, shoulder, elbow, wrist). The upper body is built upright with the hips at
   y .84 and then dropped and leaned as one (M); arms and weapons are set in the world from the leaned shoulders, so the guns
   and the cannon stay level.
   User 2026-11-13 (second note): two truss struts to each shoulder, one from the chest and one from the back, leaving the trunk
   high up (y 1.13, not the waist); the shoulder armour reaches a little further out and is a swept stub wing with an aerofoil
   section; each foot is two claws with dark tips and a spur behind; the thigh is a slim bone with two hydraulic cylinders in
   plain sight (dark barrel, collar, bright rod) and only a narrow plate outside.
   User 2026-11-13 (third note, with a picture of a slim machine — looked at, not copied): the trunk a little toward it — the chest
   a wedge with a flat deck sloping forward to a wide brow and a dark slit under it, a pointed skirt plate over each hip; below
   the knee, a knee guard that is thick but streamlined, the shin, calf and foot slimmer, and the calf's thruster pod, nozzle
   and fin made one with the shin.
   User 2026-11-13 (fourth note): the head .7 of its size; the lower body as it is, the upper body leaning further forward
   (.12 → .3 radians). The pelvis and the hip skirts keep the old lean (M0), so nothing below the waist moves; the cannon sits a
   little higher so that it clears the left shoulder.
   User 2026-11-13 (fifth note): the joint between trunk and shoulder shorter (the shoulders at x .28, SX, not .37); the body
   itself two plates put together, sharp at the front, upright seen from the front (it replaces the wedge chest); then the
   shoulders sharper too: the wing thinner, swept further and drawn out to a point, the guard plate under it a blade pointing
   down */
/* P: a pose (WAS_POSE). Nothing given: the standing shape, exactly as approved. hy: hips up or down, lean: the upper body's lean,
   ank: ankles [x,y,z] of the left (+X) and the right leg (the knee is found from them), foot: how far each foot's toes point down,
   elR/wrR/elL/wrL: elbow from shoulder, wrist from elbow, shield: [where from the forearm's middle, tilt, turn]. The nozzles of
   the pose (back and calves: p, d: where the exhaust goes, k: size) are left on the returned list as .nozzles */
function wasMix(P={}){ const K=WAS_KIT, p=[], U=[], NZ=[], th=(a,b,r=.028)=>segG(a,b,r,r*.9,5), add=(a,d)=>a.map((v,i)=>v+d[i]), mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const HY=.69+(P.hy||0), HZ=-.02, lean=a=>new THREE.Matrix4().makeTranslation(0,HY,HZ).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(0,-.84,0)), M=lean(P.lean??.3), M0=lean(P.lean0??.12), SX=.28, W=v=>new THREE.Vector3(...v).applyMatrix4(M).toArray();
  /* a frame along a forearm: the elbow at the origin, +Z toward the wrist */
  const along=(el,wr)=>new THREE.Matrix4().compose(new THREE.Vector3(...el),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...wr).sub(new THREE.Vector3(...el)).normalize()),new THREE.Vector3(1,1,1));
  /* thr: the back thrusters swung about their mount (negative: the nozzles point further down) */
  const THR=new THREE.Matrix4().makeTranslation(0,1.1,-.27).multiply(new THREE.Matrix4().makeRotationX(P.thr||0)).multiply(new THREE.Matrix4().makeTranslation(0,-1.1,.27));
  for(const sx of [1,-1]){ const hip=[sx*.13,HY,HZ], ank=P.ank?P.ank[sx>0?0:1]:[sx*.23,.13,0], pitch=P.foot?P.foot[sx>0?0:1]:0,
      knee=P.ank||P.hy?(()=>{ const T=.3217, L=.3548, h=new THREE.Vector3(...hip), d=new THREE.Vector3(...ank).sub(h), dd=Math.min(d.length(),T+L-.004), dn=d.clone().normalize(), a=(T*T-L*L+dd*dd)/(2*dd),
        f=new THREE.Vector3(sx*.13,0,1); f.addScaledVector(dn,-f.dot(dn)).normalize(); return h.addScaledVector(dn,a).addScaledVector(f,Math.sqrt(Math.max(0,T*T-a*a))).toArray(); })():[sx*.2,.44,.17], S=along(ank,knee), SL=new THREE.Vector3(...knee).distanceTo(new THREE.Vector3(...ank));
    p.push(tone(segG(hip,knee,.042,.042,4),.6), barG(add(mix(hip,knee,.06),[sx*.07,0,0]),add(mix(hip,knee,.8),[sx*.08,0,0]),.022,.075), K.J(...hip,.075,.1), K.J(...knee,.065,.1),
      ...[1,-1].flatMap(f=>{ const o=[0,f*.039,f*.052], a=add(mix(hip,knee,.08),o), b=add(mix(hip,knee,.92),o), m=mix(a,b,.56); return [tone(segG(a,m,.03,.03,6),.35), tone(segG(mix(a,b,.5),m,.037,.037,6),.6), segG(m,b,.014,.014,5)]; }),
      segG(knee,ank,.058,.08,4), K.dk(segG(add(mix(knee,ank,.5),[0,-.02,.06]),add(ank,[0,.05,.08]),.013,.013,4)),
      /* in the shin's own frame (the ankle at the origin, +Z up to the knee, +y behind): the knee guard, thick but drawn out to
         a point above and below; behind the calf a thruster pod faired into the shin, its nozzle below and a fin on its back */
      ...[at(loft([[-.19,.022,.016],[-.06,.066,.05],[.05,.074,.06],[.21,.016,.012,.01]],HEX),0,-.062,SL), at(loft([[-.15,.036,.036],[-.04,.052,.05],[.16,.014,.014,-.02]],HEX),0,.068,SL*.5),
        K.dk(at(taper(.05,.03,.08,6),0,.07,SL*.5-.18)), tone(at(box(.014,.075,.2),0,.13,SL*.5-.02),.75)].map(g=>{ g.applyMatrix4(S); return g; }),
      ...[at(box(.15,.08,.15),ank[0],.075,ank[2]-.01), at(loft([[-.19,.01,.013,-.03],[0,.038,.04]],SLAB),ank[0],.05,ank[2]-.07),
      ...[1,-1].flatMap(f=>[at(loft([[-.02,.042,.046],[.13,.038,.045,.028],[.24,.03,.034,.012]],SLAB),ank[0]+f*.046,.05,ank[2]+.04,0,f*.26,0), tone(at(loft([[.24,.03,.034,.012],[.33,.022,.025,-.004],[.42,.005,.009,-.036]],SLAB),ank[0]+f*.046,.05,ank[2]+.04,0,f*.26,0),.45)])]
        .map(g=>{ if(ank[1]!==.13||pitch){ g.translate(-ank[0],-.13,-ank[2]); if(pitch) g.rotateX(pitch); g.translate(...ank); } return g; }));
    NZ.push({p:new THREE.Vector3(0,.07,SL*.5-.23).applyMatrix4(S).toArray(), d:new THREE.Vector3(0,0,-1).transformDirection(S).toArray(), k:.7});
    if(sx<0) p.push(K.dk(barG(add(mix(hip,knee,.14),[-.1,0,0]),add(mix(hip,knee,.78),[-.11,0,0]),.03,.06)), tone(barG(add(mix(hip,knee,.04),[-.1,0,0]),add(mix(hip,knee,.16),[-.1,0,0]),.025,.035),.6)); }
  /* the pelvis and the hip skirts (lower body, M0); then the upper body, upright: spine, shoulder beam, the body of two plates, the pilot's pod and its glass in a cage,
     the head, drums, thrusters, sub-arms; then per side the shoulder joint, its wing armour and guard plate, two truss struts */
  p.push(...[at(loft([[-.1,.1,.06],[.14,.07,.05]],HEX),0,.84,0), ...[1,-1].map(f=>at(loft([[-.03,.062,.016],[.1,.055,.014],[.23,.008,.006,-.004]],SLAB),f*.085,.85,.1,.92,f*.16,0))].map(g=>{ g.applyMatrix4(M0); return g; }));
  /* the body (user 2026-11-13, fifth note): two plates standing on edge, meeting in a sharp upright edge at the front and
     opening to the rear like a ship's bow — from the front it is one upright line; a dark deck sunk between them, the pilot's
     dark pod and its cage below. blade(a): one plate, its outline [y, z back from the edge], turned by a about the edge */
  const ZF=.42, TA=.242, blade=a=>{ let g=plate([[1.2,0],[1.04,-.05],[1,-.36],[1.08,-.6],[1.3,-.56],[1.31,-.3]],.03); g=g.index?g.toNonIndexed():g; const e=tone(box(.012,.02,.1).toNonIndexed(),GL); g.rotateZ(Math.PI/2); e.translate(-Math.sign(a)*.018,1.17,-.12);
    return [g,e].map(q=>{ q.rotateY(a); q.translate(0,0,ZF); return q; }); };
  U.push(th([0,.86,-.1],[0,1.25,-.1],.035), at(box(2*SX+.02,.045,.08),0,1.25,-.07), ...blade(Math.atan(TA)), ...blade(-Math.atan(TA)),
    tone(at(plate([[0,ZF-.03],[.135,-.16],[-.135,-.16]],.03),0,1.262,0),.35),
    /* the back of the body closed by a bulkhead between the plates' rear edges (user 2026-11-13: the back was open), raked
       forward a little like the edges, with two dark vents */
    at(box(.31,.32,.03),0,1.15,-.15,.13), ...pair(tone(at(box(.07,.05,.02),.065,1.21,-.168,.13),DK)),
    tone(at(loft([[-.1,.06,.08],[.02,.07,.105],[.17,.062,.09],[.27,.03,.04,-.02]],HEX),0,1,.02),.35), tone(at(loft([[.11,.068,.055],[.21,.052,.04,-.012]],HEX),0,1.05,.02),GL),
    ...pair(th([.075,.88,.09],[.075,1.07,.15],.02)), ...pair(th([.085,.88,-.07],[.12,1.1,-.1],.02)),
    /* the head (user 2026-11-13: bigger, after a concept sheet of a long low helmet — looked at, not copied): a low wedge
       pointing forward on a dark neck ring; a chin piece below, a dark sensor slit set back between chin and shell, the shell in
       three plates that overlap and sweep back — a ridged middle one and one each side splaying out to a point behind —
       a box with a dark vent on each cheek, an aerial on the right. Built at one size and then scaled from the neck: 1.25 at first, then .7 of that (user 2026-11-13) */
    ...[tone(at(new THREE.CylinderGeometry(.05,.055,.045,6),0,1.285,-.03),.35), tone(at(loft([[-.09,.06,.02],[.05,.055,.02],[.16,.028,.012,-.006]],SLAB),0,1.312,0),.6),
    tone(at(box(.1,.026,.2),0,1.338,.015),GL), at(loft([[-.15,.034,.018,.014],[-.03,.052,.03],[.1,.042,.022,-.008],[.22,.012,.008,-.03]],FACET),0,1.372,0),
    ...[1,-1].map(f=>at(loft([[-.19,.012,.008,.024],[-.1,.034,.018,.012],[.02,.04,.022],[.15,.014,.01,-.022]],FACET),f*.062,1.36,-.01,0,-f*.2,-f*.18)),
    ...pair(tone(at(box(.05,.05,.1),.088,1.33,-.05),.8)), ...pair(tone(at(box(.03,.026,.035),.102,1.332,-.02),DK)), tone(at(box(.012,.14,.012),-.088,1.42,-.09,-.2),DK)].map(g=>{ g.translate(0,-1.275,.03); g.scale(.875,.875,.875); g.translate(0,1.275,-.03); return g; }),
    ...[.1,-.1].map(x=>{ const g=new THREE.CylinderGeometry(.085,.085,.17,8); g.rotateZ(Math.PI/2); return tone(at(g,x,1.02,-.215),.6); }),
    ...[...pair(at(loft([[-.32,.03,.03],[-.1,.07,.07],[.1,.05,.05]],HEX),.17,1.1,-.27,-.5)), ...pair(K.dk(at(new THREE.CylinderGeometry(.04,.065,.1,6),.17,.94,-.55,1.1)))].map(g=>{ g.applyMatrix4(THR); return g; }),
    ...K.subArms(.9,.115));
  const wing=()=>{ const g=loft([[0,.22,.06],[.1,.19,.056,-.004],[.24,.1,.028,-.026],[.34,.04,.01,-.05],[.41,.006,.003,-.066]],WAS_WING); g.rotateY(Math.PI/2); g.applyMatrix4(new THREE.Matrix4().set(1,0,0,0, 0,1,0,0, -.62,0,1,0, 0,0,0,1)); return g; };
  const guard=()=>{ let g=plate([[.085,.11],[.085,-.09],[-.02,-.075],[-.15,.01],[-.02,.085]],.028); g=g.index?g.toNonIndexed():g; g.rotateZ(Math.PI/2); return g; };
  for(const sx of [1,-1]){ const w=at(sx>0?wing():mirror(wing()),sx*(SX-.08),1.31,-.02);
    U.push(K.J(sx*SX,1.22,-.02,.08,.1), w, at(guard(),sx*(SX+.085),1.2,-.02,0,0,-sx*.15),
      th([sx*.085,1.13,.12],[sx*(SX-.04),1.21,.02],.024), th([sx*.14,1.13,-.15],[sx*(SX-.04),1.21,-.06],.024), K.J(sx*.095,1.13,.12,.035,.05), K.J(sx*.15,1.13,-.15,.035,.05)); }
  for(const g of U) g.applyMatrix4(M);
  p.push(...U);
  /* arms */
  const shR=W([-SX,1.22,-.02]), elR=add(shR,P.elR||[-.025,-.13,-.02]), wrR=add(elR,P.wrR||[0,0,.36]), shL=W([SX,1.22,-.02]), elL=add(shL,P.elL||[.025,-.13,-.02]), wrL=add(elL,P.wrL||[.03,-.2,.27]), SH=P.shield||[[.1,-.176,.096],-.5,0,0];
  for(const x of [.17,-.17]) NZ.push({p:new THREE.Vector3(x,.9,-.63).applyMatrix4(THR).applyMatrix4(M).toArray(), d:new THREE.Vector3(0,-.45,-.89).transformDirection(THR).transformDirection(M).toArray(), k:1});
  for(const [sh,el,wr] of [[shR,elR,wrR],[shL,elL,wrL]]){ const A=along(el,wr), hand=box(.09,.09,.1).toNonIndexed(); hand.translate(0,0,new THREE.Vector3(...wr).distanceTo(new THREE.Vector3(...el))+.035); hand.applyMatrix4(A);
    p.push(segG(sh,el,.07,.08,4), K.J(...el,.06,.11), segG(el,wr,.06,.085,4), hand); }
  /* right forearm: the guns, parallel to it; the belt sags from the receiver to the drum on the back */
  const AR=along(elR,wrR), b0=new THREE.Vector3(-.125,-.06,-.19).applyMatrix4(AR).toArray(), b3=W([-.1,.99,-.29]), b1=add(b0,[.03,-.15,-.07]), b2=[(b0[0]+b3[0])/2+.04,Math.min(b0[1],b3[1])-.17,(b0[2]+b3[2])/2-.05];
  p.push(...K.guns2(-1).map(g=>{ g.applyMatrix4(AR); return g; }), K.dk(segG(b0,b1,.02,.02,5)), K.dk(segG(b1,b2,.02,.02,5)), K.dk(segG(b2,b3,.02,.02,5)));
  /* left forearm: the shield, held by two brackets; over the left shoulder the cannon on its arm, with a brace from the drum */
  const mid=mix(elL,wrL,.5), C=W([SX+.02,1.58,0]);
  p.push(...K.shield2(add(mid,SH[0]),SH[1],[mix(elL,wrL,.2),mix(elL,wrL,.85)],SH[2],SH[3]), ...K.cannon(...C,W([SX-.1,1.25,-.07])), K.dk(segG(W([.12,1.08,-.27]),[C[0],C[1]-.075,C[2]-.42],.022,.022,5)));
  p.nozzles=NZ; p.muzzle=[C[0],C[1],C[2]+1.42]; p.guns=[.062,-.062].map(y=>new THREE.Vector3(-.125,y,1.06).applyMatrix4(AR).toArray());
  return p; }
/* poses of the W.A.S. (wasMix). Walk: four steps — left foot ahead, passing, right foot ahead, passing; the arms move a little
   against the legs. Fire: braced, the shield turned to the front and held before the body while the cannon on the back fires.
   Fly…: the legs trail with the toes down; hover upright, move leaning far forward, up stretched, down with the legs drawn up ahead */
const WAS_POSE=(()=>{
  /* the guard (user 2026-11-17): the shield before the body, slanting across it (its top toward the left shoulder, its point
     down to the right) and leaning with the foot of it forward; when firing the right arm's guns rest on its upper edge */
  const G={elL:[-.03,-.13,.06], wrL:[-.2,-.06,.3], shield:[[-.08,-.2,.2],-.36,-Math.PI/2+.2,-.6]}, REST={elR:[.1,-.13,-.02], wrR:[.04,0,.36]};
  const step=(l,r,hy,sw)=>({hy,lean:.34,ank:[l,r],foot:[l[1]>.14&&l[2]<0?.5:0,r[1]>.14&&r[2]<0?.5:0], elR:[-.025,-.13,-.02+sw*.03], wrR:[0,sw*.02,.36], ...G, wrL:[-.2,-.06+sw*.015,.3-sw*.02]});
  return { wasWalk1:step([.22,.13,.24],[-.22,.17,-.2],-.03,1), wasWalk2:step([.22,.13,.03],[-.21,.27,.02],0,.3),
    wasWalk3:step([.22,.17,-.2],[-.22,.13,.24],-.03,-1), wasWalk4:step([.21,.27,.02],[-.22,.13,.03],0,-.3),
    wasFire:{hy:-.13,lean:.36,ank:[[.28,.13,.22],[-.28,.13,-.26]],foot:[0,.12], ...G, ...REST},
    wasFly:{lean:.22,lean0:.05,ank:[[.2,.1,-.14],[-.2,.1,-.14]],foot:[.75,.75], wrL:[.03,-.24,.22]},
    wasFlyFire:{lean:.3,lean0:.08,ank:[[.4,.26,-.04],[-.4,.26,-.04]],foot:[.45,.45],thr:-.8, ...G, ...REST},
    wasFlyMove:{lean:.58,lean0:.4,ank:[[.17,.3,-.52],[-.17,.3,-.52]],foot:[1.3,1.3], ...G},
    wasFlyUp:{lean:.12,lean0:0,ank:[[.16,.04,-.06],[-.16,.04,-.06]],foot:[1.1,1.1], wrL:[.03,-.27,.17]},
    wasFlyDown:{lean:.05,lean0:-.1,ank:[[.22,.25,.3],[-.22,.25,.3]],foot:[.25,.25], wrL:[.05,-.16,.3]} }; })();
/* the assault machine: step 1 or -1 says which foot is ahead */
function mechParts(step){ const p=[], T=.4;
  for(const sx of [1,-1]){ const hip=[sx*.13,.82,-.05], ank=[sx*.13,.1,sx*step>0?.2:-.16], dy=ank[1]-hip[1], dz=ank[2]-hip[2], dd=Math.hypot(dy,dz), k=Math.sqrt(Math.max(0,T*T-dd*dd/4));
    const knee=[hip[0],(hip[1]+ank[1])/2-k*dz/dd,(hip[2]+ank[2])/2+k*dy/dd];
    p.push(segG(hip,knee,.06,.045), segG(knee,ank,.04,.03), tone(discG(hip[0],hip[1],hip[2],.07,.08),DK), tone(discG(knee[0],knee[1],knee[2],.05,.07),DK), tone(discG(ank[0],ank[1],ank[2],.045,.07),DK), at(box(.12,.06,.26),ank[0],ank[1]-.065,ank[2]+.05)); }
  p.push(at(loft([[-.3,.13,.09],[.05,.19,.14],[.42,.1,.07,-.03]],HEX),0,.93,0), tone(at(box(.16,.03,.03),0,.93,.4),GL), tone(at(box(.1,.14,.2),0,1.05,-.18),.6),
    ...pair(at(box(.07,.1,.24),.22,.93,.05)), ...pair(tone(at(tube(.028,.42,5),.22,.92,.38),DK)), tone(at(box(.3,.05,.08),0,.84,-.05),DK), tone(at(box(.02,.3,.02),.035,1.25,-.2),DK));
  return p; }
/* sea ships (docs/models.md 13): the space ships changed a little for the sea. SEA: the hull's cross-section — a flat deck,
   sides that lean in above a knuckle and flare below it, a flat bottom; lofted with half-height .1 and y offset .03 the deck
   is at y .13 and the bottom at y -.07 (waterline y 0). A half-width of 0 ends the hull in an upright stem.
   seaMast: an optical mast (no radar: a post, a yard and a sensor box). railTurret: a low faceted gun house with a railgun —
   two flat rails one above the other with a gap, a breech box and two clamps — standing on y at z, s: scale, rear: facing aft.
   gunTurret: a small house with one slim barrel. cellsG: the dark lids of vertical launch cells let into the deck */
const SEA=[[.9,1],[1,.3],[.7,-1],[-.7,-1],[-1,.3],[-.9,1]];
const seaMast=(z,y0,h,w=.2)=>[at(box(.03,h,.03),0,y0+h/2,z), at(box(w,.012,.02),0,y0+h*.65,z), at(box(.07,.035,.05),0,y0+h,z)];
const seaSet=(p,y,z,s,rear)=>p.map(g=>{ g.scale(s,s,s); if(rear) g.rotateY(Math.PI); g.translate(0,y,z); return g; });
/* 艦の砲塔の印（ユーザー 2026-11-17「艦艇の砲塔は必要です。宇宙のもです」）。砲塔は自分の座標（原点に立ち、+Z が前）で作ってから
   置かれるので、ここで部品に印を付け、向きを知るための小さな枠（原点・上・前・右・砲の軸の点）を部品と一緒に運ぶ。枠は置かれるときの
   移動・回転・裏返しを部品と同じに受ける。groundJoin は枠を捨てる（形は変わらない）。base: 動かない台、house: 旋回する部分、gun: 仰角の付く砲、
   pivot: 砲の軸の点、built: 描いたときの仰角、el: 届く仰角 [下,上]、arc: 正面から左右へ回れる角（π: 一周）、rate: 回る速さ（ラジアン/秒。仮） */
let RIG_ID=0;
const rigT=(base,house,gun,pivot,{built=0,el=[-.1,1.2],arc=Math.PI,rate=1.2}={})=>{ const id=++RIG_ID, k=.05, [px,py,pz]=pivot,
    ni=g=>{ if(!g.index) return g; const n=g.toNonIndexed(); n.userData={...g.userData}; return n; }, tag=(l,part)=>l.map(g=>{ g=ni(g); g.userData.rig={id,part}; return g; });
  const f=new THREE.BufferGeometry(); f.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0, 0,k,0, 0,0,k, k,0,0, px,py,pz, px,py,pz],3)); f.userData.rig={id,part:'frame',built,el,arc,rate};
  return [...base.map(ni),...tag(house,'house'),...tag(gun,'gun'),f]; };
const railTurret=(y,z,s=1,rear=false,el=.12)=>seaSet(rigT([],[loft([[-.13,.1,.045,.045],[.04,.11,.045,.045],[.16,.05,.04,.04]],TRAP)],
  [at(box(.07,.05,.12),0,0,.08), at(box(.045,.012,.46),0,.016,.3), at(box(.045,.012,.46),0,-.016,.3), at(box(.056,.05,.025),0,0,.34), at(box(.056,.05,.025),0,0,.52)].map(g=>tone(at(g,0,.05,.04,-el),DK)),[0,.05,.04],{built:el,el:[-.05,.8],arc:2.6,rate:.5}),y,z,s,rear);
const gunTurret=(y,z,s=1)=>seaSet(rigT([],[loft([[-.07,.06,.035,.035],[.03,.065,.035,.035],[.1,.03,.03,.03]],TRAP)],[tone(at(tube(.012,.3,5),0,.04,.2,-.1),DK)],[0,.04,.06],{built:.1,el:[-.1,1.2],arc:2.6,rate:1.2}),y,z,s,false);
const cellsG=(z,w,l,y=.134)=>[z-l*.27,z+l*.27].flatMap(c=>pair(tone(at(box(w*.46,.012,l*.46),w*.27,y,c),DK)));
/* space ship parts with tones: engine bells and the laser turret of battle/shapes.js, bell and barrel dark */
const spBells=(xs,y,z,r)=>engines(xs,y,z,r).map(g=>tone(g,DK));
const spTurret=(x,y,z,r)=>{ const [b,g]=turret(x,y,z,r); return [b,tone(g,DK)]; };
/* space ship parts, round 2 (docs/models.md 15.4). atX: move parts sideways. laserT: a laser turret worked out — an octagonal
   ring, a faceted house pointed at the front with two radiator fins at its back, one or two dark emitter barrels each with a collar
   and a wider lens housing at the muzzle; x,y,z: where it stands, s: scale (1: house .2 wide), n: barrels, rear: facing aft.
   pdG: point defence against craft and missiles — a low neck, a faceted half dome, two short dark emitters raised forward.
   lidsG: a row of n dark launcher lids along z on a top at y */
const atX=(p,x)=>p.map(g=>{ g.translate(x,0,0); return g; });
const laserT=(x,y,z,s=1,n=1,rear=false,el=.06)=>{ const base=[at(new THREE.CylinderGeometry(.1,.11,.03,8),0,.015,0)], gun=[], house=[loft([[-.12,.09,.04,.06],[.03,.1,.045,.065],[.13,.05,.035,.06]],TRAP), ...pair(at(box(.012,.1,.07),.062,.09,-.08))];
  for(const dx of n>2?[-.055,0,.055]:n>1?[-.035,.035]:[0]) gun.push(...[at(tube(.013,.32,6),dx,0,.26), at(tube(.02,.03,6),dx,0,.14), at(tube(.025,.06,6),dx,0,.42)].map(g=>tone(at(g,0,.07,0,-el),DK)));
  return atX(seaSet(rigT(base,house,gun,[0,.07,0],{built:el,el:[-.25,1.4],arc:2.6,rate:.8}),y,z,s,rear),x); };
const pdG=(x,y,z,s=1)=>atX(seaSet(rigT([at(new THREE.CylinderGeometry(.028,.034,.04,6),0,.02,0)],[at(new THREE.SphereGeometry(.036,6,3,0,Math.PI*2,0,Math.PI/2),0,.035,0)],
  [-.013,.013].map(dx=>tone(at(tube(.007,.08,4),dx,.05,.045,-.35),DK)),[0,.05,0],{built:.35,el:[-.1,1.5],rate:2.5}),y,z,s,false),x);
const lidsG=(x,y,z0,z1,n,w=.04)=>[...Array(n)].map((_,i)=>tone(at(box(w,.012,(z1-z0)/n*.7),x,y,z0+(z1-z0)*(i+.5)/n),DK));
/* underside weapons (docs/models.md 15.6). flipY: turn parts upside down (x and y change sign). gatG: an interceptor gatling
   standing on y — a low ring, a box, a bundle of six thin dark barrels with a ring at the front. belly: a laser turret hung under
   the keel at y (the keel's height, negative) on a low barbette; gatB: a gatling hung under a surface at y */
const flipY=p=>p.map(g=>{ g.rotateZ(Math.PI); return g; });
const gatG=(x,y,z,s=1)=>atX(seaSet(rigT([at(new THREE.CylinderGeometry(.034,.038,.03,8),0,.015,0)],[at(box(.056,.045,.07),0,.05,0)],
  [...[...Array(6)].map((_,i)=>tone(at(tube(.0055,.12,4),Math.cos(i*Math.PI/3)*.014,.05+Math.sin(i*Math.PI/3)*.014,.09),DK)), tone(at(tube(.022,.014,6),0,.05,.125),DK)],[0,.05,0],{el:[-.1,1.5],rate:2.5}),y,z,s,false),x);
const belly=(x,y,z,s=1,n=1,rear=false)=>[at(new THREE.CylinderGeometry(.11*s,.11*s,.1*s,8),x,y+.03*s,z), ...flipY(laserT(-x,-(y-.02*s),z,s,n,rear))];
const gatB=(x,y,z,s=1)=>flipY(gatG(-x,-(y+.01),z,s));
/* longT: a big turret with one long gun (the battleship's underside heavy gun, docs/models.md 15.8) standing on y — a broad ring,
   a long faceted house, radiator fins, a long dark barrel of length len with rings at its root, middle and muzzle. bellyL hangs it
   under the keel at y on a barbette */
const longT=(x,y,z,s=1,len=1)=>atX(seaSet(rigT([at(new THREE.CylinderGeometry(.12,.13,.035,8),0,.017,0)],[loft([[-.16,.11,.05,.07],[.06,.12,.055,.075],[.18,.06,.04,.07]],TRAP),
  ...pair(at(box(.012,.11,.09),.075,.1,-.1))], [at(tube(.022,len,6),0,0,.15+len/2), at(tube(.032,.08,6),0,0,.2), at(tube(.028,.05,6),0,0,.15+len*.5), at(tube(.036,.1,6),0,0,.12+len)].map(g=>tone(at(g,0,.085,0),DK)),[0,.085,.12],{el:[-.15,1],arc:2.6,rate:.45}),y,z,s,false),x);
const bellyL=(y,z,s=1,len=1)=>[at(new THREE.CylinderGeometry(.13*s,.13*s,.1*s,8),0,y+.03*s,z), ...flipY(longT(0,-(y-.02*s),z,s,len))];
/* railL: the battleship's big railgun (docs/models.md 15.9) standing on y — a broad low octagonal platform, a low flat house, a dark
   breech box, two flat rails one above the other running len forward, four clamps and a muzzle box. bellyR hangs it under the keel
   at y on a low barbette sunk into the hull */
const railL=(x,y,z,s=1,len=1)=>atX(seaSet(rigT([at(new THREE.CylinderGeometry(.2,.21,.03,8),0,.015,0)],[loft([[-.17,.12,.025,.055],[.08,.13,.03,.06],[.2,.07,.022,.055]],TRAP)],
  [at(box(.09,.05,.14),0,.06,.2), at(box(.06,.016,len),0,.082,.2+len/2), at(box(.06,.016,len),0,.038,.2+len/2), ...[0,1,2,3].map(i=>at(box(.075,.075,.03),0,.06,.32+i*(len-.16)/3)), at(box(.08,.08,.045),0,.06,.2+len)].map(g=>tone(g,DK)),[0,.06,.14],{el:[-.05,.75],arc:2.6,rate:.3}),y,z,s,false),x);
const bellyR=(y,z,s=1,len=1)=>[at(new THREE.CylinderGeometry(.21*s,.21*s,.12*s,8),0,y+.04*s,z), ...flipY(railL(0,-(y-.02*s),z,s,len))];
/* flatT: a flattened laser turret (height k of laserT) standing on y — the assault ship's flat twin secondary guns */
const flatT=(x,y,z,s=1,n=2,k=.6)=>laserT(x,0,z,s,n).map(g=>{ g.scale(1,k,1); g.translate(0,y,0); return g; });
/* sideT: a flat turret laid on its side on a side wall at x (its top facing out, barrels forward, one above the other) */
const sideT=(x,y,z,s=1,n=2,k=.6)=>flatT(0,0,z,s,n,k).map(g=>{ g.rotateZ(x>0?-Math.PI/2:Math.PI/2); g.translate(x,y,0); return g; });
/* 惑星共和国の宇宙の艦 (docs/models.md 15.12, from the Codex study docs/reports/2026-11-13-mars-space-ships.md): a low sealed hull of
   the CREASE section in two parts (above the crease in the team colour, below it a step darker), a cut bow, no wings or outboard
   pods, a low command hump with a dark optical band, dark optical faces on the bow shoulders, a squared engine block with dark
   octagonal nozzles. mShip turns the study's sections (normalised to length 2) into the length z0..z1 (widths and heights times k)
   and gives the hull's half width and height at any z; under hangs parts under the flat bottom, side lays them on the crease of
   both sides. Everything off the top sits at the middle of the length (the user's rule, 15.8) */
const MUP=[[.7,1],[1,.1],[-1,.1],[-.7,1]], MLO=[[1,.1],[.8,-1],[-.8,-1],[-1,.1]];
function mShip(sec,z0,z1,k){ const mid=(z0+z1)/2, half=(z1-z0)/2, S=sec.map(([z,w,h])=>[mid+z*half,w*half*k,h*half*k]);
  const sz=z=>{ if(z<=S[0][0]) return {w:S[0][1],h:S[0][2]}; for(let i=0;i<S.length-1;i++){ const a=S[i], b=S[i+1]; if(z<=b[0]){ const t=(z-a[0])/(b[0]-a[0]); return {w:a[1]+(b[1]-a[1])*t,h:a[2]+(b[2]-a[2])*t}; } } const e=S[S.length-1]; return {w:e[1],h:e[2]}; };
  const top=z=>sz(z).h, bot=z=>-sz(z).h;
  return {S,mid,z0:S[0][0],z1:S[S.length-1][0],at:sz,top,bot,
    hull:()=>[loft(S,MUP),tone(loft(S,MLO),.72)],
    hump:(za,zb,w,h)=>mHump(za,zb,w,h,top((za+zb)/2)-.005),
    eyes:(z,dx=.62)=>pair(tone(at(box(.05,.012,.09),sz(z).w*dx,top(z)+.002,z),GL)),
    under:(p,z,x=0)=>flipY(p).map(g=>{ g.translate(x,bot(z)+.006,0); return g; }),
    side:(mk,z)=>{ const {w,h}=sz(z); return [...mk().map(g=>{ g.rotateZ(-Math.PI/2); g.translate(w-.006,.1*h,0); return g; }), ...mk().map(g=>{ g.rotateZ(Math.PI/2); g.translate(-(w-.006),.1*h,0); return g; })]; } }; }
/* the Republic's parts. mGun: a low unmanned laser turret — a flat creased house, square barrels (n), dark optics at the muzzle;
   flatM: the same, twin and flattened (side secondaries); mPD: a flat point-defence box with two short dark emitters; mGat: a gatling
   behind an angular shield; mEng: squared engine housings at the stern z, each with a dark octagonal nozzle. All stand on y */
const mGun=(x,y,z,s=1,n=1,rear=false)=>{ const gun=[], p=[at(new THREE.CylinderGeometry(.075,.085,.02,6),0,.01,0), loft([[-.11,.085,.028,.045],[.05,.09,.03,.048],[.13,.04,.02,.04]],CREASE)];
  for(const dx of n>1?[-.03,.03]:[0]) gun.push(tone(at(box(.024,.022,.3),dx,.05,.26),.6), tone(at(box(.03,.028,.04),dx,.05,.42),DK));
  return atX(seaSet(rigT([p[0]],[p[1]],gun,[0,.05,.1],{el:[-.2,1.3],arc:2.6,rate:.8}),y,z,s,rear),x); };
const flatM=(x,y,z,s=1)=>mGun(x,0,z,s,2).map(g=>{ g.scale(1,.6,1); g.translate(0,y,0); return g; });
const mPD=(x,y,z,s=1)=>atX(seaSet(rigT([],[at(box(.07,.026,.06),0,.013,0)],[-.014,.014].map(dx=>tone(at(box(.008,.008,.05),dx,.018,.05),DK)),[0,.018,.02],{el:[-.1,1.5],rate:2.5}),y,z,s,false),x);
const mGat=(x,y,z,s=1)=>atX(seaSet(rigT([at(box(.06,.03,.05),0,.015,0)],[at(box(.07,.045,.015),0,.028,.03)],[0,1,2,3].map(i=>tone(at(tube(.005,.07,4),(i%2-.5)*.016,.028+((i>>1)-.5)*.016,.07),DK)),[0,.028,.03],{el:[-.1,1.5],rate:2.5}),y,z,s,false),x);
const mEng=(xs,z,r)=>xs.flatMap(x=>[at(box(r*2.5,r*2.3,.14),x,0,z+.05), tone(at(new THREE.CylinderGeometry(r,r*.85,.05,8).rotateX(Math.PI/2),x,0,z-.035),DK)]);
const mPair=(f,x,y,z,s)=>[...f(x,y,z,s), ...f(-x,y,z,s)];
/* mHump: the low command hump standing on y, with its dark optical band. mA: a Republic body from sections given as they are
   (z, half width, half height). onTop: a body laid on the top of M (its sections follow M's top), returns its parts and its top.
   ySh: move parts up or down */
function mHump(za,zb,w,h,y){ return [at(loft([[za,w*.75,h*.5,h*.5],[za+(zb-za)*.35,w,h*.5,h*.5],[zb,w*.55,h*.4,h*.4]],CREASE),0,y,0), tone(at(box(w*2,h*.28,(zb-za)*.32),0,y+h*.55,za+(zb-za)*.62),GL)]; }
const mA=S=>mShip(S,-1,1,1);
const onTop=(M,sec)=>{ const T=mA(sec), S2=T.S.map(([z,w,h])=>[z,w,h,M.top(z)+h*.9]); return {parts:[loft(S2,MUP),tone(loft(S2,MLO),.72)], top:z=>M.top(z)+T.top(z)*1.9}; };
const ySh=(p,y)=>p.map(g=>{ g.translate(0,y,0); return g; });
/* mBox: a Republic cargo module (a short creased body with cut corners) of length l centred at x, y, z. sideAt: parts made by mk
   laid on both side walls at x (their top facing out) and height y */
const mBox=(x,y,z,l,w,h)=>{ const B=mA([[z-l/2,w*.85,h*.85],[z-l/2+.03,w,h],[z+l/2-.03,w,h],[z+l/2,w*.85,h*.85]]); return B.hull().map(g=>{ g.translate(x,y,0); return g; }); };
/* wallStrip: a continuous wall along points [x, z, height, base?] standing on y0 or each point's own base (thickness t), its outer face leaning in — a smooth
   bulwark that follows a hull's edge. Faces are turned outward from the strip's centre line */
function wallStrip(pts,y0,t=.035){ const V=(x,y,z)=>new THREE.Vector3(x,y,z), P=[];
  const S=pts.map(([x,z,h,yb=y0])=>{ const s=Math.sign(x)||1; return [V(x+.005*s,yb,z),V(x-.012*s,yb+h,z),V(x-(t-.01)*s,yb+h,z),V(x-t*s,yb,z)]; });
  const C=S.map(r=>r.reduce((a,b)=>a.clone().add(b),V(0,0,0)).multiplyScalar(.25));
  const tri=(a,b,c,o)=>{ const n=V(0,0,0).subVectors(b,a).cross(V(0,0,0).subVectors(c,a)); if(n.dot(o)<0) P.push(a,c,b); else P.push(a,b,c); };
  for(let i=0;i<S.length-1;i++){ const m=C[i].clone().add(C[i+1]).multiplyScalar(.5);
    for(let j=0;j<4;j++){ const k=(j+1)%4, a=S[i][j], b=S[i+1][j], c=S[i+1][k], d=S[i][k], o=a.clone().add(c).multiplyScalar(.5).sub(m); tri(a,b,c,o); tri(a,c,d,o); } }
  const cap=(r,o)=>{ tri(r[0],r[1],r[2],o); tri(r[0],r[2],r[3],o); }, n=S.length-1;
  cap(S[0],C[0].clone().sub(C[1])); cap(S[n],C[n].clone().sub(C[n-1]));
  const g=new THREE.BufferGeometry(); g.setFromPoints(P); g.computeVertexNormals(); return g; }
const sideAt=(mk,x,y)=>[...mk().map(g=>{ g.rotateZ(-Math.PI/2); g.translate(x,y,0); return g; }), ...mk().map(g=>{ g.rotateZ(Math.PI/2); g.translate(-x,y,0); return g; })];
/* model key → parts. Keys ending in A, B… are variants shown on the sample sheet; the game uses the keys named in GROUND_MODELS */
/* 建物の部品（docs/models.md 16）。obx: 底が y0 の箱。obRoof: 棟が x に沿う切妻の屋根（幅 w、高さ h、奥行き l。中心の高さに置く）。
   obPrism: y に立つ柱（断面は loft の形）。obDomeG: 半球。OB_SAW: のこぎり屋根の断面。OB_ARC: かまぼこ屋根の断面 */
const obx=(w,h,l,x,y0,z)=>at(box(w,h,l),x,y0+h/2,z);
const OB_TRI=[[1,-1],[-1,-1],[0,1]], OB_SAW=[[1,-1],[-1,-1],[-1,1],[-.7,1]], OB_ARC=[...Array(7)].map((_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)*2-1]);
const obRoof=(w,h,l)=>at(loft([[-w/2,l/2,h/2],[w/2,l/2,h/2]],OB_TRI),0,0,0,0,Math.PI/2,0);
const obPrism=(rx,rz,h,prof)=>{ const g=loft([[0,rx,rz],[h,rx,rz]],prof); g.rotateX(-Math.PI/2); return g; };
const obDomeG=(r,h)=>{ const g=new THREE.SphereGeometry(1,8,4,0,Math.PI*2,0,Math.PI/2); g.scale(r,h,r); return g; };
/* 色つきの tone（建物の灰色に掛ける色）: 土、畑の緑2つ、稲、水、舗装、線 */
const OC={soil:[.74,.62,.44],crop:[.5,.66,.36],crop2:[.66,.7,.4],rice:[.56,.74,.42],water:[.34,.5,.64],asph:.36,line:1.05,walk:.82};
const obRoofZ=(w,h,l)=>loft([[-l/2,w/2,h/2],[l/2,w/2,h/2]],OB_TRI);        // 棟が z に沿う切妻
const obTurn=g=>{ const t=g.userData.tone; g=g.index?g.toNonIndexed():g; g.rotateY(Math.PI/2); g.userData.tone=t; return g; }; // 部品を90°回す
const obRails=(x,l,z=0)=>[tone(obx(.3,.03,l,x,0,z),.55), ...[...Array(Math.round(l*8))].map((_,i)=>tone(obx(.26,.012,.05,x,.03,z-l/2+(i+.5)/8),.32)), ...[-.08,.08].map(d=>tone(obx(.02,.025,l,x+d,.035,z),.95))];
/* 見本用の並べ方。obPut(P): 形を k 倍して (x,z) に置く。 */
const obPut=P=>(parts,x,z,k=.68,turn=false)=>parts.forEach(g=>{ const t=g.userData.tone; g=g.index?g.toNonIndexed():g; if(turn) g.rotateY(Math.PI/2); g.scale(k,k,k); g.translate(x,0,z); g.userData.tone=t; P.push(g); });
const obRnd=seed=>()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
/* 村: 道の両側に家、その外に畑か水田 */
function obVillage(house,field,seed){ const P=[], put=obPut(P), r=obRnd(seed); P.push(tone(obx(9,.02,.4,0,-.02,0),.5));
  for(let i=0;i<9;i++) put(GROUND_SHAPES[r()<.8?house:'obShed'](),-3.6+i*.9+(r()-.5)*.3,(i%2?1:-1)*(.75+r()*.25));
  for(let i=0;i<6;i++) for(const sg of [1,-1]) for(const row of [0,1]) put(GROUND_SHAPES[r()<.8?field:'obField'](),-3.75+i*1.5,sg*(2+row*1.5),1.45,r()<.5);
  return P; }
/* 都市: n × n の街区を道の格子で区切る。1街区は建物4棟。pick(ring, r) が形の鍵（ring は中心からの段。0 が中心）。
   o.block(ring, r): 鍵を返すと、その街区は1つの巨大な建物（1.6倍）になる。o.hw: 高架の高速道路が街を横切る（道の番号。配列なら複数）。o.rail: 端に鉄道と駅 */
function obCity(n,pick,seed,o={}){ const P=[], put=obPut(P), r=obRnd(seed), dr=obRnd(seed+7777), pitch=2, c=(n-1)/2, half=n*pitch/2;
  P.push(tone(obx(n*pitch+.4,.02,n*pitch+.4,0,-.02,0),OC.asph));
  for(let i=0;i<n;i++) for(let j=0;j<n;j++){ const bx=(i-c)*pitch, bz=(j-c)*pitch, ring=Math.round(Math.max(Math.abs(i-c),Math.abs(j-c)));
    P.push(tone(obx(1.66,.03,1.66,bx,-.01,bz),OC.walk));
    const big=o.block&&o.block(ring,r()); if(big){ put(GROUND_SHAPES[o.dmg&&OB_RUINKEY[big]||big](),bx,bz,1.6); continue; }
    for(const [dx,dz] of [[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]]){ const key=pick(ring,r()); if(!key) continue;
      if(o.slum&&ring>=Math.round(c)){ put(obSlumQ(OB_SQ,dr,dr()<.1),bx+dx,bz+dz,.9); continue; }
      const lv=obDmg(o.dmg,dr()); put(lv===1&&OB_RUINKEY[key]?GROUND_SHAPES[OB_RUINKEY[key]]():lv?obRuinSq(key,lv,dr):GROUND_SHAPES[key](),bx+dx,bz+dz); } }
  for(let i=0;i<=n;i++) for(let j=0;j<n*2;j++){ P.push(tone(obx(.02,.012,.3,(i-n/2)*pitch,0,-half+.5+j),OC.line)); P.push(tone(obx(.3,.012,.02,-half+.5+j,0,(i-n/2)*pitch),OC.line)); }
  for(const hw of [].concat(o.hw??[])) for(let k=0;k<Math.ceil((n*pitch+.4)/.9);k++) if(!(o.dmg&&dr()<o.dmg*.2)) put(GROUND_SHAPES.obHighway(),-half-.2+.45+k*.9,(hw-n/2)*pitch,.9,true);
  if(o.rail){ const z=half+.75; P.push(tone(obx(n*pitch+.4,.02,1.1,0,-.02,z),.6)); for(let k=0;k<n*2;k++) put(GROUND_SHAPES.obRail(),-half+.5+k,z,1,true); put(GROUND_SHAPES.obStation(),0,z,1,true); put(GROUND_SHAPES.obTrain(),-half*.5,z+.0,1,true); }
  return P; }
/* 木の色と部品。obBlob: 角ばった塊（樹冠）。obForest: 6 × 4 の林。pick(r) が木の鍵（null は今のゲームの木＝丸い塊だけ）。dens は混み具合 */
const OT={trunk:[.5,.4,.3],broad:[.4,.6,.38],broad2:[.52,.66,.42],fir:[.26,.46,.36],fir2:[.32,.52,.4],rain:[.24,.56,.3],rain2:[.36,.66,.34]};
const obBlob=(rx,ry,rz,x,y,z)=>{ const g=new THREE.IcosahedronGeometry(1,0); g.scale(rx,ry,rz); return at(g,x,y,z); };
function obForest(pick,seed,dens=1){ const P=[], put=obPut(P), r=obRnd(seed), used=[]; P.push(tone(obx(6.6,.02,4.4,0,-.02,0),[.56,.62,.44]));
  for(let k=0;k<Math.round(110*dens)*30&&used.length<Math.round(110*dens);k++){ const x=(r()-.5)*6, z=(r()-.5)*3.8, gap=.42/Math.sqrt(dens); if(used.some(u=>Math.hypot(u[0]-x,u[1]-z)<gap)) continue; used.push([x,z]);
    const key=pick(r()), k2=.5+r()*.3; if(key) put(GROUND_SHAPES[key](),x,z,k2); else { const h=.38+r()*.3; P.push(tone(obBlob(.62*(.85+r()*.5),.62*h/.35,.62*(.85+r()*.5),x,h*4*.455,z),r()<.5?[.3,.48,.33]:[.43,.58,.38])); } }
  [[.65,.7],[-.65,.7],[1.95,-.7],[-1.95,-.7]].forEach(([x,z])=>GROUND_SHAPES.tankE().forEach(g=>{ const t=(g.userData.tone??1)*.5; g=g.index?g.toNonIndexed():g; g.rotateY(Math.PI/2); g.scale(.5,.5,.5); g.translate(z*.5+3.8,0,x*.5); g.userData.tone=t; P.push(g); }));
  return P; }
/* 段階ごとの建物の選び方: pick(ring, r)。ring は中心からの段（0 が中心）。OB_BLOCK: メトロポリタンで1街区を占める巨大建築 */
const OB_PICK={
  ME:[(g,r)=>r<.12?null:r<.6?'obHouseFlat':r<.9?'obBlockFlat':'obDome',
      (g,r)=>g===0?(r<.5?'obSuper':'obTowerME'):g===1?(r<.5?'obTowerME':r<.8?'obOffice':'obTowerTwin'):(r<.3?'obOffice':r<.45?'obTowerME':r<.9?'obBlockFlat':'obDome'),
      (g,r)=>g<=1?(r<.6?'obSuper':'obTowerME'):g===2?(r<.4?'obSuper':r<.8?'obTowerME':'obTowerTwin'):(r<.4?'obTowerME':r<.7?'obOffice':'obBlockFlat')],
  EA:[(g,r)=>r<.1?null:r<.6?'obShop':r<.9?'obApart':'obWarehouse',
      (g,r)=>g===0?(r<.5?'obSuper':'obTowerTwin'):g===1?(r<.45?'obTower':r<.75?'obTowerTwin':'obOffice'):(r<.35?'obTower':r<.85?'obApart':'obOffice'),
      (g,r)=>g<=1?(r<.6?'obSuper':'obTowerTwin'):g===2?(r<.4?'obSuper':r<.8?'obTower':'obTowerTwin'):(r<.45?'obTower':r<.8?'obApart':'obOffice')]};
const OB_BLOCK=(g,r)=>g===0?'obMega':g===1?(r<.5?'obArco':null):g===2&&r<.15?'obArco':null;
/* 四角でない建物（ユーザー 2026-11-15「四角以外の建物も導入」）: 区画の四辺形 q（[x,z] が4点）をそのまま底面にして立てる。
   h: 高さ。o.set: 上に細い段を1〜2段。o.roof: 低い屋根。窓の帯と屋上の縁つき。台形・くさび・ゆがんだ四辺形の区画をすき間なく埋めるのに使う */
function obLot(q,h,o={}){ const cx=(q[0][0]+q[1][0]+q[2][0]+q[3][0])/4, cz=(q[0][1]+q[1][1]+q[2][1]+q[3][1])/4, sc=k=>q.map(([x,z])=>[cx+(x-cx)*k,cz+(z-cz)*k]),
    pl=(pts,y0,t)=>{ const g=plate(pts,t); g.translate(0,y0+t/2,0); return g; }, n=Math.max(1,Math.round(h/.3)), P=[pl(q,0,h), tone(pl(sc(1.04),h,.025),.8)];
  for(let i=0;i<n;i++) P.push(tone(pl(sc(1.03),(i+.4)*h/n,h/n*.36),GL));
  if(o.set){ P.push(pl(sc(.7),h,h*.45), tone(pl(sc(.72),h*1.1,h*.25),GL)); if(o.set>1) P.push(pl(sc(.44),h*1.45,h*.4), tone(pl(sc(.46),h*1.52,h*.22),GL), tone(pl(sc(.1),h*1.85,h*.25),DK)); }
  if(o.roof) P.push(tone(pl(sc(.62),h+.02,.09),.62));
  return P; }
/* 形の鍵 → 区画の建物の高さと作り（OB_PICK をそのまま使うため） */
const OB_LOT={obHouseFlat:[.3],obShop:[.34,{roof:1}],obBlockFlat:[.6],obDome:[.42],obWarehouse:[.3,{roof:1}],obApart:[.85],obOffice:[1.2],obTower:[1.5,{set:1}],obTowerME:[1.5,{set:1}],obTowerTwin:[1.7,{set:1}],obSuper:[2.1,{set:2}]};
/* 放射状（kind 'rad'）と自然都市（'org'）の見本。半径は段階で 3・5・7（盤目の 3×3・5×5・7×7 街区と同じ広さ）。
   どちらも「環状の道」と「中心から外へ伸びる道」で区画を切り、区画を四角でない建物（obLot）ですき間なく埋める。
   放射状: 道はまっすぐな放射と正しい円。自然都市: 同じ網をゆがめる（環は波打ち、外へ伸びる道はうねり、間隔も不ぞろい）。区画の分け方も不ぞろいにする */
function obCityFree(kind,cult,tier,seed,O={}){ const P=[], put=obPut(P), r=obRnd(seed), dr=obRnd(seed+7777), R=[3,5,7][tier-1], top=tier, pick=OB_PICK[cult][tier-1], T=Math.PI*2, org=kind==='org';
  const ph=[r()*T,r()*T,r()*T,r()*T], reg=[1,.6,.4][tier-1], amp=d=>org?reg+(1-reg)*Math.min(1,d/R):0,   // 自然都市のゆがみ。大都会・メトロポリタンは中心ほど整備されて小さい
    wob=(a,d)=>1+amp(d)*(.08*Math.sin(2*a+ph[0])+.045*Math.sin(3*a+ph[1])), wig=d=>amp(d)*(.38*Math.sin(d*.9+ph[2])+.12*Math.sin(d*1.9+ph[3]))/Math.max(1.5,d);
  const F=(d,a)=>{ const b=a+wig(d), q=d*wob(b,d); return [Math.cos(b)*q,Math.sin(b)*q]; };
  const road=(pts,w)=>{ for(let i=1;i<pts.length;i++){ const [x1,z1]=pts[i-1], [x2,z2]=pts[i], l=Math.hypot(x2-x1,z2-z1); P.push(tone(at(box(w,.02,l+w*.4),(x1+x2)/2,.005,(z1+z2)/2,0,Math.atan2(x2-x1,z2-z1),0),OC.asph)); } };
  P.push(tone(at(new THREE.CylinderGeometry(R+.9,R+.9,.02,40),0,-.01,0),OC.walk));
  const rings=[1.2]; while(rings[rings.length-1]<R-.6) rings.push(rings[rings.length-1]+(org?1.5+r()*.7:1.85)); rings[rings.length-1]=Math.max(rings[rings.length-1],R+.3);
  const n=tier===1?6:8, spokes=[...Array(n)].map((_,i)=>(i+(org?(r()-.5)*.5:0))/n*T);
  rings.slice(0,-1).forEach(q=>road([...Array(41)].map((_,i)=>F(q,i/40*T)),.32));
  spokes.forEach(a=>road([...Array(Math.ceil((R+.5-1.2)/.4)+1)].map((_,i)=>F(Math.min(R+.5,1.2+i*.4),a)),.36));
  const bigs=tier===3?[[0,0,'obMega',1.6,1.25], ...[0,1,2,3].map(i=>[...F(2.7,Math.PI/8+i*T/4),'obArco',1.3,1.2])]:tier===2?[[0,0,'obSuper',1.2,.9]]:[];
  const hw=tier>=2?R*.5:null, hw2=tier===3?-R*.5:null;
  for(let k=0;k<rings.length-1;k++) for(let i=0;i<n;i++){ const d0=rings[k]+.24, d1=rings[k+1]-(k===rings.length-2?0:.24), a0=spokes[i], a1=i===n-1?spokes[0]+T:spokes[i+1], dm=(d0+d1)/2;
    const rows=Math.max(1,Math.round((d1-d0)/.8)), cut=(m,j)=>org&&j>0&&j<m?(j+(r()-.5)*.3*amp(dm))/m:j/m;
    const rc=[...Array(rows+1)].map((_,j)=>d0+(d1-d0)*cut(rows,j));
    for(let u=0;u<rows;u++){ const ra=rc[u]+.03, rb=rc[u+1]-.03, rm=(ra+rb)/2, g0=.26/rm, arc=(a1-a0-2*g0)*rm, cols=Math.max(1,Math.round(arc/.8)), cc=[...Array(cols+1)].map((_,j)=>a0+g0+(a1-a0-2*g0)*cut(cols,j));
      for(let v=0;v<cols;v++){ const b0=cc[v]+.03/rm, b1=cc[v+1]-.03/rm, q=[F(ra,b0),F(ra,b1),F(rb,b1),F(rb,b0)], [x,z]=F(rm,(b0+b1)/2), d=Math.hypot(x,z);
        if(bigs.some(b=>Math.hypot(x-b[0],z-b[1])<b[4])||(hw!=null&&Math.abs(z-hw)<.62)||(hw2!=null&&Math.abs(x-hw2)<.62)) continue;
        const E=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]), area=Math.abs((q[2][0]-q[0][0])*(q[3][1]-q[1][1])-(q[3][0]-q[1][0])*(q[2][1]-q[0][1]))/2, thin=area/Math.max(E(q[0],q[1]),E(q[1],q[2]),E(q[2],q[3]),E(q[3],q[0]));
        if(thin<.36){ const g=plate(q,.03); g.translate(0,.02,0); P.push(tone(g,OC.crop)); continue; }   // 細すぎる区画は建てずに緑地にする（薄く細いビルを作らない）
        const key=pick(Math.min(top,Math.floor(d/(R+.5)*(top+1))),r()); if(!key) continue; const [h,o]=OB_LOT[key]||[.5], hh=h*(.85+r()*.3);
        if(O.slum&&d>R*O.slum){ obSlumQ(q,dr,dr()<.08).forEach(g=>P.push(g)); continue; }
        const lv=obDmg(O.dmg,dr()); (lv?obLotRuin(q,hh,lv,dr):obLot(q,hh,thin<.5?{...o,set:0}:o)).forEach(g=>P.push(g)); } } }
  bigs.forEach(([x,z,key,k])=>put(GROUND_SHAPES[O.dmg&&OB_RUINKEY[key]||key](),x,z,k));
  if(O.slum<0){ const a=.78; obSlumQ([[-a,-a],[a,-a],[a,a],[-a,a]],dr,true).forEach(g=>P.push(g)); }   // スラムだけの町は中心の広場も埋める
  const chord=c=>Math.sqrt(Math.max(0,(R+.9)**2-c*c));
  if(hw!=null){ const h=chord(hw); for(let x=-h+.45;x<h;x+=.9) if(!(O.dmg&&dr()<O.dmg*.2)) put(GROUND_SHAPES.obHighway(),x,hw,.9,true); }
  if(hw2!=null){ const h=chord(hw2); for(let z=-h+.45;z<h;z+=.9) put(GROUND_SHAPES.obHighway(),hw2,z,.9); }
  if(tier===3){ const z=-(R+1.5); P.push(tone(obx(2*R,.02,1.1,0,-.02,z),.6)); for(let k=0;k<2*R;k++) put(GROUND_SHAPES.obRail(),-R+.5+k,z,1,true); put(GROUND_SHAPES.obStation(),0,z,1,true); put(GROUND_SHAPES.obTrain(),-R*.5,z,1,true); }
  return P; }
/* ---- 壊れた建物とスラム（2026-11-16。ユーザー「スラムと壊れた都市系」。docs/models.md 16.6）----
   どちらも新しい町の作りは足さず、今の都市（obCity・obCityFree）の区画に「損害」「スラム」の指定を足す。
   obDmg(D,x): 町の損害 D（1 半壊・2 壊滅）と乱数 x から、建物ごとの壊れ方（0 無傷・1 半壊・2 全壊・3 がれきだけ）。
   obLotRuin(q,h,lv,r): 区画 q の壊れた建物。区画を4つに割り、角ごとに高さを段々に落とす（どの向きからも崩れた輪郭になる）。
     すそにがれきの板と塊、割れた上面は暗い。lv 3 はがれきだけ。obRuinSq(key,lv,r): 四角い区画（盤目・単体の見本）用。
   obSlumQ(q,r,stack): 区画を小さな屋根で埋めるスラム（ゲームの大きさでは1棟ずつでなく、不ぞろいな屋根の集まりとして読ませる）。
     stack: 積み上げた居住モジュールの塔（100年先のスラム）を1本立てる。 */
const OB_SQ=[[-.42,-.38],[.42,-.38],[.42,.38],[-.42,.38]];
const obDmg=(D,x)=>!D?0:D===1?(x<.32?0:x<.78?1:2):(x<.03?0:x<.22?1:x<.86?2:3);
const obQ=q=>{ const B=(u,v)=>[(q[0][0]*(1-u)+q[1][0]*u)*(1-v)+(q[3][0]*(1-u)+q[2][0]*u)*v,(q[0][1]*(1-u)+q[1][1]*u)*(1-v)+(q[3][1]*(1-u)+q[2][1]*u)*v];
  return {B, sub:(u0,u1,v0,v1)=>[B(u0,v0),B(u1,v0),B(u1,v1),B(u0,v1)], pl:(pts,y0,t)=>{ const g=plate(pts,t); g.translate(0,y0+t/2,0); return g; }}; };
function obLotRuin(q,h,lv,r){ const {B,sub,pl}=obQ(q), P=[tone(pl(sub(-.14,1.14,-.14,1.14),0,.04),.5)], blob=(u,v,k)=>{ const [x,z]=B(u,v); P.push(tone(obBlob(.13*k,.08*k,.11*k,x,.04,z),.58)); };
  if(lv<3){ const cu=.38+r()*.24, cv=.38+r()*.24, hi=Math.floor(r()*4), f=lv===1?[1,.7,.46,.22]:[.3,.19,.1,.06];
    [[0,cu,0,cv],[cu,1,0,cv],[cu,1,cv,1],[0,cu,cv,1]].forEach((c,i)=>{ const hh=Math.max(.07,h*f[(i-hi+4)%4]*(.85+r()*.3)), sq=sub(...c), n=Math.floor(hh/.45), m=[(c[0]+c[1])/2,(c[2]+c[3])/2], in_=k=>sub(m[0]+(c[0]-m[0])*k,m[0]+(c[1]-m[0])*k,m[1]+(c[2]-m[1])*k,m[1]+(c[3]-m[1])*k);
      P.push(tone(pl(sq,0,hh),.7+r()*.16), tone(pl(in_(.78),hh-.01,.025),DK));                       // 壁と、割れて開いた上面
      for(let j=0;j<n;j++) P.push(tone(pl(in_(1.04),(j+.4)*hh/n,hh/n*.36),GL));
      if(hh>.45){ const e=i%2?[c[0],c[1],c[2],c[2]+(c[3]-c[2])*.3]:[c[0],c[0]+(c[1]-c[0])*.3,c[2],c[3]]; P.push(tone(pl(sub(...e),hh-.02,hh*.12+.05),.84)); } });   // 残った壁
  } else P.push(tone(pl(sub(.1,.9,.1,.9),.02,.05),.62), tone(pl(sub(.3,.75,.25,.6),.05,.07),.72));
  blob(-.06,.3,1.3); blob(1.07,.6,1.4); if(lv>1) blob(.5,.5,1.7);
  return P; }
/* 目印の建物（超高層・連結超高層・積層都市・双子の塔）の半壊の鍵。町が壊れていれば、これに差し替える */
const OB_RUINKEY={obSuper:'obSuperRuin',obMega:'obMegaRuin',obArco:'obArcoRuin',obTowerTwin:'obTwinRuin'};
const obSkirt=w=>[tone(obx(w,.04,w,0,0,0),.5), tone(obBlob(.16,.09,.15,w*.42,.04,-w*.3),.58), tone(obBlob(.14,.08,.16,-w*.4,.04,w*.34),.58)];
const obRuinSq=(key,lv,r)=>obLotRuin(OB_SQ,((OB_LOT[key]||[.5])[0])*1.5,lv,r);
function obSlumStack(k=1){ const P=[obx(.16,1.25,.16,0,0,0), tone(obx(.3,.03,.3,0,1.25,0),.8), tone(at(new THREE.CylinderGeometry(.09,.09,.1,6),0,1.33,0),.9)];
  [[.52,.4,.1,0],[.4,.54,-.08,.06],[.5,.36,.02,-.1],[.36,.5,.1,.08],[.46,.38,-.1,0],[.34,.44,.06,-.06]].forEach(([w,l,x,z],i)=>{ P.push(tone(obx(w,.17,l,x,i*.2,z),i%2?.78:1), tone(obx(w+.02,.05,l+.02,x,i*.2+.07,z),GL)); });
  return P.map(g=>{ const t=g.userData.tone; g.scale(k,k,k); g.userData.tone=t; return g; }); }
function obSlumQ(q,r,stack){ const {B,sub,pl}=obQ(q), E=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]), nu=Math.max(2,Math.round((E(q[0],q[1])+E(q[3],q[2]))/2/.25)), nv=Math.max(2,Math.round((E(q[1],q[2])+E(q[0],q[3]))/2/.25)),
    P=[tone(pl(sub(0,1,0,1),0,.03),.55)], T=[.66,.76,.88,1,1.08];
  const cu=[...Array(nu+1)].map((_,i)=>i===0?0:i===nu?1:(i+(r()-.5)*.4)/nu), cv=[...Array(nv+1)].map((_,i)=>i===0?0:i===nv?1:(i+(r()-.5)*.4)/nv);
  for(let i=0;i<nu;i++) for(let j=0;j<nv;j++){ if(r()<.08) continue; const gu=.07*(cu[i+1]-cu[i]), gv=.07*(cv[j+1]-cv[j]), u0=cu[i]+gu, u1=cu[i+1]-gu, v0=cv[j]+gv, v1=cv[j+1]-gv, h=.1+r()*.14;
    P.push(tone(pl(sub(u0,u1,v0,v1),.02,h),T[Math.floor(r()*5)]));
    if(r()<.3){ const a=r()<.5, b=r()<.5, w=.62; P.push(tone(pl(sub(a?u0:u0+(u1-u0)*(1-w),a?u0+(u1-u0)*w:u1,b?v0:v0+(v1-v0)*(1-w),b?v0+(v1-v0)*w:v1),.02+h,.1+r()*.06),T[Math.floor(r()*5)])); } }
  if(stack){ const [x,z]=B(.5,.5); obSlumStack(.7).forEach(g=>{ g.translate(x,0,z); P.push(g); }); }
  return P; }
/* 炎の見本の場面（炎そのものは下の GROUND_FIRES と groundFire）。obDim: 形を暗くする（焼けた車両） */
const obDim=(parts,k)=>parts.map(g=>{ const t=g.userData.tone??1; g.userData.tone=Array.isArray(t)?t.map(v=>v*k):t*k; return g; });
/* 見本用の町: ゲームの置き方（battle/terrain.js の町。道の両側に、道から .18km 以上離して並べる）を同じ比で写す。建物1つの底面は .68 × .6。
   pick(r) が形の鍵を返す（null なら今の灰色の箱で、高さは .64〜1.44）。端に戦車4両（size .5 のくさび形）を大きさの比べ用に置く */
function obTown(pick){
  let seed=20261115; const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }, P=[];
  const put=(g,x,z,k,t)=>{ g=g.index?g.toNonIndexed():g; g.scale(k,k,k); g.translate(x,0,z); g.userData.tone=t; P.push(g); };
  P.push(tone(obx(11,.02,.5,0,-.02,0),.45));
  for(let i=0;i<34;i++){ const along=(rnd()-.5)*10, side=(rnd()<.5?-1:1)*(.72+rnd()*.52)*1.3, key=pick(rnd()), h=.64+rnd()*.8;
    if(key) GROUND_SHAPES[key]().forEach(g=>put(g,along,side,.68,g.userData.tone)); else put(box(.68,h,.6).translate(0,h/2,0),along,side,1,1); }
  [[.65,.7],[-.65,.7],[1.95,-.7],[-1.95,-.7]].forEach(([x,z])=>GROUND_SHAPES.tankE().forEach(g=>{ const t=(g.userData.tone??1)*.5; g=g.index?g.toNonIndexed():g; g.rotateY(Math.PI/2); put(g,z*.5+5.9,x*.5,.5,t); }));
  return P;
}
const GROUND_SHAPES={
  /* placeholder until the pilot shapes are in: a box hull with a darker turret */
  stub:()=>[at(box(.7,.3,1.8),0,.15,0), tone(at(box(.4,.2,.6),0,.4,-.1),.6), tone(at(tube(.04,.9,6),0,.42,.6),.6)],
  /* --- 地球連合の車両 (docs/models.md 2.1): crewed, heavy, today's vehicles a century on. Big turrets with hatches, sights and
     weapon stations added on the roof, tracks showing under plate skirts, thick guns --- */
  /* 主力戦車（地球連合）: the heavy western tank and the Russian tank of today grown into one (user decision 2026-11-12). From the
     western one: a long low slab turret wider than the hull, a stowage rack behind it, two hatches with
     shielded guns, deep skirts with the road wheels showing under them, a fume extractor on a thick gun. From the Russian one:
     the turret front drawn to a low point with armour slabs lying flat on its two faces (user 2026-11-12; nothing standing out
     from it — the wedges that did were ugly), armour bags along the skirts and blocks on the glacis, net cages
     round the turret rack and the tail, sleeves on the barrel */
  tankE:()=>[...hullE(), ...pair(at(box(.03,.15,1.84),.49,.235,-.02)), ...[.6,.36,.12,-.12].flatMap(z=>pair(tone(at(box(.05,.11,.2),.52,.25,z),.82))),
    tone(at(box(.5,.035,.3),0,.33,.72,.23),.82), tone(at(box(.52,.04,.42),0,.375,-.7),.6),
    ...pair(tone(at(box(.022,.13,.4),.535,.25,-.8),DK)), tone(at(box(1.09,.13,.022),0,.25,-1.02),DK),
    ...TUR([at(loft([[-.8,.27,.085],[-.4,.37,.1],[.1,.37,.1],[.5,.12,.065,-.025]],SLAB),0,.475,-.02),
    ...pair(tone(at(box(.045,.125,.4),.268,.458,.285,.0,-.54,0),.82)), ...pair(tone(at(box(.05,.03,.36),.235,.55,.25,0,-.54,0),.82)), at(box(.15,.12,.14),0,.455,.5),
    tone(at(box(.56,.09,.14),0,.47,-.86),.55), tone(at(box(.72,.1,.02),0,.46,-.95),DK), ...pair(tone(at(box(.02,.1,.3),.36,.46,-.8),DK)),
    ...pair(tone(at(box(.04,.05,.12),.35,.51,.02),DK)),
    at(new THREE.CylinderGeometry(.085,.085,.05,6),.15,.6,-.22), at(box(.13,.09,.02),.15,.66,-.13), ...piv([tone(brl(.016,0,.3),DK)],.15,.66,-.14),
    at(new THREE.CylinderGeometry(.07,.07,.035,6),-.16,.59,-.34), tone(at(box(.09,.07,.09),-.13,.61,.0),DK)]),
    ...GUN(gunG([brl(.05,0,1.08),brl(.062,.12,.4),brl(.071,.46,.66),brl(.062,.72,.94),brl(.058,1.02,1.08)],.475,.52))],
  /* 装甲兵員輸送車（地球連合）: eight wheels under a box that is a plain rectangle seen from above; the front is one long,
     gentle slope from the roof down to the nose, half the length of the vehicle (user decision 2026-11-12). The weapon
     station sits off to one side behind the commander's hatch, stowage boxes along the rear sides, a ramp door behind */
  apcE:()=>[...wheelsG([-.66,-.24,.22,.64]), tone(at(box(.5,.15,1.8),0,.2,0),.6),
    loft([[-.96,.36,.15,.43],[.02,.36,.15,.43],[.99,.36,.04,.31]],SLAB), tone(at(box(.42,.2,.02),0,.42,-.965),.6),
    tone(at(box(.46,.02,.1),0,.535,.3,.245),GL), ...pair(at(box(.05,.12,.5),.34,.5,-.6)),
    ...TUR([at(loft([[-.15,.11,.055],[.13,.09,.045]],SLAB),.14,.635,-.34)]), ...GUN(piv([tone(brl(.02,0,.5),DK),tone(at(box(.05,.05,.05),.07,.04,-.05),DK)],.14,.645,-.24)),
    at(new THREE.CylinderGeometry(.075,.075,.035,6),-.15,.6,-.12), tone(at(box(.03,.3,.03),-.3,.73,-.85),DK)],
  /* 自走砲（地球連合）: the tank hull under a tall, wide gun house at the rear, a thick raised gun with a boxed muzzle brake */
  spgE:()=>[...hullE(), at(loft([[-.98,.3,.17],[-.2,.33,.2],[.1,.27,.17],[.26,.19,.12,-.02]],SLAB),0,.56,0), tone(at(box(.44,.12,.03),0,.56,-1),.6),
    tone(at(box(.1,.07,.12),-.16,.79,-.5),DK), at(new THREE.CylinderGeometry(.07,.07,.03,6),.15,.775,-.3),
    ...GUN(gunG([brl(.075,0,.3),brl(.05,.3,1.34),at(box(.15,.09,.15),0,0,1.38)],.6,.16,.2))],
  /* 自走対空砲（地球連合）: the tank hull under a turret with a pair of cannon on each side, raised, and an optical tracker
     ball on a short mast (no radar in this war) */
  aaE:()=>[...hullE(), ...TUR([at(loft([[-.45,.19,.11],[.25,.2,.11],[.42,.12,.08,-.01]],SLAB),0,.48,-.08)]),
    ...GUN([.29,-.29].flatMap(x=>piv([box(.1,.13,.34),tone(at(brl(.02,0,.75),0,.03,.1),DK),tone(at(brl(.02,0,.75),0,-.03,.1),DK)],x,.52,-.02,.45))),
    ...TUR([tone(at(box(.5,.05,.05),0,.52,-.02),.6), tone(at(box(.03,.14,.03),0,.66,-.36),DK), tone(at(new THREE.IcosahedronGeometry(.075,0),0,.78,-.36),GL)])],
  /* ロケット車両（地球連合）: the truck with a boxed launcher of six tubes on the bed, raised */
  mlrsE:()=>[...truckE(), ...GUN(piv([at(box(.58,.3,1.05),0,.17,.5),tone(at(box(.5,.22,.02),0,.17,1.03),DK),tone(at(box(.5,.22,.02),0,.17,-.03),DK)],0,.36,-.92,.3)), tone(at(box(.44,.1,.24),0,.36,-.84),.6), tone(barG([0,.3,-.28],[0,.56,-.37],.08,.06),.45)],
  /* 補給（地球連合）: the truck with a ribbed container on the bed */
  supE:()=>[...truckE(), tone(at(box(.62,.42,1.3),0,.53,-.28),.8), ...[-.75,-.28,.19].map(z=>at(box(.66,.44,.04),0,.53,z))],
  /* 工兵（地球連合）: the tank hull with a dozer blade in front and a folded bridge carried on top */
  engE:()=>[...hullE(), at(box(.98,.24,.05),0,.17,1.1,-.25), ...pair(tone(at(box(.05,.06,.3),.3,.2,.98),DK)),
    at(box(.3,.14,.3),0,.43,.4), tone(at(box(.5,.05,1.5),0,.44,-.3),.75), tone(at(box(.5,.05,1.5),0,.53,-.3),.75), ...[-.9,-.3,.3].map(z=>tone(at(box(.54,.16,.04),0,.47,z),DK))],
  /* 斥候（地球連合）: a small four-wheeled scout car with a sensor head on a tall mast */
  scoutE:()=>[...wheelsG([-.42,.42],.33,.16), tone(at(box(.44,.12,1.2),0,.22,0),.6), loft([[-.72,.3,.1,.38],[.2,.3,.1,.38],[.58,.28,.06,.34],[.76,.24,.03,.3]],SLAB),
    at(loft([[-.55,.22,.07],[.05,.22,.07],[.2,.16,.04,-.02]],SLAB),0,.55,0), tone(at(box(.36,.06,.03),0,.56,.2,.6),GL),
    tone(at(box(.03,.5,.03),-.12,.86,-.4),DK), tone(at(box(.12,.1,.1),-.12,1.14,-.4),GL), ...GUN(piv([tone(brl(.016,0,.36),DK)],.1,.64,-.1))],
  /* --- 惑星共和国の車両 (docs/models.md 2.2; the Armata line a century on, user decision 2026-11-12): few crew sitting in the
     hull front, sealed shells with no hatches or windows, small uncrewed turrets set back, one common hull, long slim guns --- */
  /* 主力戦車（惑星共和国）: a narrow faceted turret shell, a very long gun, slat frames at the rear */
  tankM:()=>[...hullM(), ...pair(tone(at(box(.025,.11,.36),.5,.22,-.82),DK)),
    ...TUR([at(loft([[-.86,.1,.05],[-.56,.2,.085],[-.1,.19,.08],[.4,0,0,-.03]],HEX),0,.45,-.05), tone(at(box(.07,.08,.07),.08,.555,-.32),DK)]),
    ...GUN(gunG([brl(.058,0,.24),at(taper(.04,.03,1.2,6),0,0,.84)],.45,.24))],
  /* 装甲兵員輸送車（惑星共和国）: eight wheels under a boat hull with a crease along its sides and an upswept prow, a flat
     uncrewed turret set well back with a long thin cannon */
  apcM:()=>[...wheelsG([-.7,-.28,.16,.6]), tone(at(box(.5,.13,1.72),0,.2,-.04),.6),
    loft([[-.98,.3,.13,.36],[-.72,.37,.15,.37],[.45,.37,.15,.37],[.85,.28,.1,.37],[1.1,.1,.03,.41]],CREASE), tone(at(box(.26,.03,.04),0,.5,.58,.3),GL),
    ...TUR([at(new THREE.CylinderGeometry(.15,.2,.08,6),0,.56,-.32)]), ...GUN(gunG([brl(.018,0,.85),at(box(.05,.05,.2),.06,0,.1)],.58,-.26))],
  /* 自走砲（惑星共和国）: the common hull under a tall narrow gun house with cut top edges; a long powder gun, the longest on the
     field (user decision 2026-11-12: not a railgun, its range would not fit 30 km) */
  spgM:()=>[...hullM(), at(loft([[-.92,.2,.15],[-.5,.24,.19],[.18,.22,.17],[.46,.11,.09,-.04]],FACET),0,.56,-.05), tone(at(box(.07,.07,.07),.1,.775,-.4),DK),
    ...GUN(gunG([brl(.062,0,.26),brl(.038,.26,1.78),brl(.052,.9,1.06),brl(.055,1.64,1.78)],.6,.3,.22))],
  /* 自走対空砲（惑星共和国）: the common hull under a flat uncrewed turret with four short cannon in a block, raised a little, and
     a tracker ball; low and compact (user 2026-11-12) */
  aaM:()=>[...hullM(), ...TUR([at(new THREE.CylinderGeometry(.22,.27,.1,6),0,.42,-.2)]),
    ...GUN(piv([box(.22,.13,.3),...[[.05,.035],[-.05,.035],[.05,-.035],[-.05,-.035]].map(([x,y])=>tone(at(brl(.018,0,.5),x,y,.12),DK))],0,.52,-.2,.3)), ...TUR([tone(at(box(.03,.12,.03),.2,.4,-.42),DK), tone(at(new THREE.IcosahedronGeometry(.07,0),.2,.5,-.42),GL)])],
  /* ロケット車両（惑星共和国）: the common hull with two rows of launch tubes lying low on the deck */
  mlrsM:()=>[...hullM(), ...GUN(piv([...[-.17,0,.17].flatMap(x=>[.06,.2].map(y=>{ const g=tube(.068,1.15,6); return at(g,x,y,.5); })),tone(at(box(.5,.3,.02),0,.13,1.08),DK),at(box(.56,.06,.3),0,-.02,.2)],0,.4,-.9,.16))],
  /* 補給（惑星共和国）: the sealed truck with two tanks on the bed */
  supM:()=>[...truckM(), ...[-.62,-.02].map(z=>{ const g=new THREE.CylinderGeometry(.24,.24,.52,8); g.rotateX(Math.PI/2); return tone(at(g,0,.56,z),.8); }), at(box(.5,.06,1.2),0,.33,-.32)],
  /* 工兵（惑星共和国）: the common hull with a folded bridge on top and a narrow blade */
  engM:()=>[...hullM(), at(box(.8,.18,.04),0,.14,1.12,-.3), ...pair(tone(at(box(.05,.05,.3),.3,.15,.98),DK)), tone(at(box(.46,.05,1.5),0,.42,-.3),.75), tone(at(box(.46,.05,1.5),0,.5,-.3),.75), ...[-.9,.3].map(z=>tone(at(box(.5,.17,.04),0,.435,z),DK))],
  /* 斥候（惑星共和国）: a small low four-wheeled boat hull with a tiny uncrewed turret */
  scoutM:()=>[...wheelsG([-.42,.42],.33,.16), tone(at(box(.44,.12,1.2),0,.22,0),.6), loft([[-.72,.26,.11,.34],[-.5,.32,.13,.35],[.35,.32,.13,.35],[.82,.1,.03,.37]],CREASE), tone(at(box(.22,.03,.04),0,.46,.45,.3),GL),
    ...TUR([at(new THREE.CylinderGeometry(.1,.14,.07,6),0,.51,-.22)]), ...GUN(gunG([brl(.015,0,.5)],.53,-.18)), ...TUR([tone(at(box(.05,.07,.05),.0,.58,-.3),GL)])],
  /* 強化歩兵: about 2 m tall. W: moving, F: standing or fighting */
  infW:()=>exoParts(false,'walk'), infW2:()=>exoParts(false,'walk2'), infF:()=>exoParts(false,'fight'),
  /* 重強化歩兵: the same frame a little bigger, armoured all over (user decision 2026-11-12) */
  hinfMsl:()=>exoParts(true,'walk',true).map(g=>g.scale(1.12,1.12,1.12)),
  hinf:()=>exoParts(true,'walk').map(g=>g.scale(1.12,1.12,1.12)), hinf2:()=>exoParts(true,'walk2').map(g=>g.scale(1.12,1.12,1.12)),
  /* 強化コマンド歩兵: the soldier who uses the ground. A ghillie suit instead of the power unit, a long rifle; W: moving in a low
     crouch, F: kneeling to shoot */
  cmdW:()=>exoParts('c','walk'), cmdW2:()=>exoParts('c','walk2'), cmdF:()=>exoParts('c','fight'),
  /* 機械化突撃兵: the expendable machines that go first into a breach (only their platoon leader is human). No head and no
     body inside: a wedge-shaped trunk slung forward on legs with the knee to the rear, a sensor slit, a gun on each side.
     A and B are the two steps of its walk */
  mechA:()=>mechParts(1), mechB:()=>mechParts(-1),
  /* ドローンハイブ: an uncrewed carrier that flies low — a flat six-sided body on four ducted fans with its cells dark on top, a
     sensor ball underneath, and five of its small drones around it */
  hive:()=>{ const dr=(x,y,z,r)=>[at(plate([[0,.15],[.13,-.1],[0,-.04],[-.13,-.1]],.03),x,y,z,0,r,0), tone(at(box(.03,.035,.12),x,y+.02,z),DK)];
    return [at(new THREE.CylinderGeometry(.4,.48,.14,6),0,0,0), tone(at(new THREE.CylinderGeometry(.3,.3,.03,6),0,.08,0),DK), tone(at(new THREE.IcosahedronGeometry(.07,0),0,-.1,.3),GL),
      ...[[.5,.5],[-.5,.5],[.5,-.5],[-.5,-.5]].flatMap(([x,z])=>[at(new THREE.CylinderGeometry(.22,.22,.07,8),x,0,z), tone(at(new THREE.CylinderGeometry(.16,.16,.08,8),x,0,z),DK), at(box(.12,.04,.12),x*.62,0,z*.62)]),
      ...dr(.98,.25,.45,.3), ...dr(-1.02,.15,.1,-.4), ...dr(.68,.3,-.88,.2), ...dr(-.58,.35,-.98,0), ...dr(.05,.2,1.08,0)]; },
  /* 陸戦型 W.A.S. (for now): the space W.A.S. as it is (CRAFT_SHAPES.was, a user-approved shape), four times the size and set
     on the ground. It is redesigned with the assault carrier later (docs/models.md 9 D) */
  wasG:()=>{ const p=CRAFT_SHAPES.was(); p.forEach(g=>{ g.scale(4,4,4); g.translate(0,.78,0); }); return p; },
  /* W.A.S. の3案 (docs/models.md 11): 1 骨組み型, 2 重装型, 3 鋭角型 */
  was1:()=>wasFrame(), was2:()=>wasHeavy(), was3:()=>wasSharp(),
  /* 案1+3: the sharp body on the bare frame, slim arm-mounted guns, a thin curved shield (user decision 2026-11-12; redone 2026-11-13) */
  was4:()=>wasMix(),
  /* W.A.S. の動き（ユーザー 2026-11-17）: 歩行4こま（手も少し動く）、射撃（盾を前に構え、背の砲で撃つ）、飛行の待機・移動・上昇・下降 */
  ...Object.fromEntries(Object.keys(WAS_POSE).map(k=>[k,()=>wasMix(WAS_POSE[k])])),
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
    ...pair(tone(at(taper(.12,.105,.5,6),.27,.19,-.45),DK)), ...pair(at(box(.2,.05,.2),.15,.11,-.45)),
    ...pair(at(plate([[0,-.78],[.52,-.84],[.52,-1.04],[0,-1.02]],.04),0,.03,0)), ...pair(at(plate([[0,-.8],[0,-1.06],[.3,-1.1],[.3,-.9]],.035),.52,.03,0,0,0,Math.PI/2)),
    tone(at(loft([[.36,.07,.05],[.56,.085,.09,.02],[.84,0,0]]),0,.12,0),GL), tone(at(tube(.036,.42,6),.03,-.13,.98),DK)],
  /* 広域戦略支援航空機（地球連合）: the two heavy bombers of today grown into one (user decision 2026-11-12). From the swing-wing
     one: a long pointed body blended into the wing roots, the cockpit windows dark in the nose, a tall fin with the tailplane
     half way up it. From the old eight-engined one: long narrow swept wings set high, four twin engine pods on pylons under
     them, a pod near each tip. A small sensor ball under the nose, the bomb bay doors dark under the belly; no radar */
  awE:()=>[loft([[-1.15,.05,.06],[-.7,.12,.12],[-.1,.2,.13],[.45,.14,.12],[.85,.08,.09],[1.25,0,0,-.02]]),
    ...pair(at(plate([[.12,.55],[.46,-.02],[.3,-.34],[.12,-.4]],.06),0,.04,0)), ...pair(at(plate([[.3,.14],[1.5,-.5],[1.5,-.66],[.3,-.3]],.05),0,.07,0)),
    ...[.56,.96].flatMap(x=>{ const z=.14-(x-.3)*.533; return [...pair(at(box(.03,.09,.2),x,-.0,z)), ...pair(tone(at(taper(.056,.05,.32,6),x-.05,-.07,z+.08),DK)), ...pair(tone(at(taper(.056,.05,.32,6),x+.05,-.07,z+.08),DK))]; }),
    ...pair(at(loft([[-.16,.035,.035],[.1,.04,.04],[.2,0,0]]),1.36,.0,-.5)),
    at(plate([[0,-.62],[0,-1.12],[.5,-1.24],[.5,-1.02]],.045),0,.1,0,0,0,Math.PI/2), ...pair(at(plate([[0,-.9],[.46,-1.1],[.46,-1.2],[0,-1.12]],.035),0,.32,0)),
    tone(loft([[.74,.07,.045,.065],[.92,.055,.04,.05],[1.06,.015,.015,.025]],O8),GL), tone(at(new THREE.IcosahedronGeometry(.055,0),0,-.1,.8),GL), tone(at(box(.2,.03,.7),0,-.125,-.25),DK)],
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
  /* 戦艦（海）: the space battleship's long hull and stepped house, afloat. Three railgun turrets (two forward, the second
     raised on a barbette to fire over the first, one aft), a bridge tower with a window band and an optical mast, a funnel, small guns
     along the sides. No keel fin, no engine bells */
  seaBB:()=>[loft([[-1.35,.3,.1,.03],[-.6,.41,.1,.03],[.6,.31,.1,.03],[1.1,.15,.105,.035],[1.45,0,.12,.05]],SEA),
    at(loft([[-.7,.2,.06],[.14,.2,.06],[.3,.1,.06]],TRAP),0,.19,0), at(loft([[-.3,.14,.09],[.08,.14,.09],[.2,.08,.07,-.02]],TRAP),0,.34,0),
    tone(at(loft([[-.02,.105,.018],[.085,.105,.018],[.21,.062,.018]],RECT),0,.385,0),GL), ...seaMast(-.08,.42,.2,.24),
    at(loft([[-.62,.07,.07],[-.44,.07,.07]],TRAP),0,.31,0), tone(at(box(.07,.012,.13),0,.382,-.53),DK),
    ...railTurret(.125,.9,1.25), at(new THREE.CylinderGeometry(.125,.135,.08,6),0,.165,.5), ...railTurret(.2,.5,1.25), ...railTurret(.125,-.82,1.25,true),
    ...[-.2,-.5].flatMap(z=>pair(tone(at(box(.05,.045,.09),.27,.15,z),DK)))],
  /* イージス艦（海）: the space cruiser's broad hull and raked bridge. One small gun forward, launch cells before the bridge
     and aft of the funnel, a faceted deckhouse, a landing pad on the stern */
  seaCL:()=>[loft([[-1.1,.3,.1,.03],[-.45,.38,.1,.03],[.45,.29,.1,.03],[.9,.13,.105,.035],[1.2,0,.12,.05]],SEA),
    at(loft([[-.35,.24,.1],[.1,.24,.1],[.28,.13,.1]],TRAP),0,.23,0), at(loft([[-.2,.13,.05],[.08,.13,.05],[.18,.07,.045,-.005]],TRAP),0,.38,0),
    tone(at(loft([[0,.105,.014],[.085,.105,.014],[.19,.058,.014]],RECT),0,.385,0),GL), ...seaMast(-.1,.41,.18),
    at(loft([[-.52,.09,.09],[-.34,.09,.09]],TRAP),0,.22,0), tone(at(box(.08,.012,.12),0,.312,-.43),DK),
    ...gunTurret(.125,.62), ...cellsG(.42,.2,.14), ...cellsG(-.66,.3,.16), tone(at(box(.36,.008,.24),0,.132,-.93),.7)],
  /* 高速艇（海）: the space frigate's slim arrow hull, its bow lifted to plane. A low cabin with a window band and a slim
     mast (the frigate's fin), a small gun forward, two raised missile boxes aft */
  seaFF:()=>[loft([[-1,.2,.075,.02],[-.35,.25,.075,.02],[.45,.18,.08,.03],[1.05,0,.1,.07]],SEA),
    at(loft([[-.4,.13,.055],[-.02,.13,.055],[.18,.07,.045,-.01]],TRAP),0,.15,0), tone(at(loft([[-.1,.1,.014],[-.02,.1,.014],[.185,.054,.014]],RECT),0,.165,0),GL),
    at(box(.02,.15,.02),0,.265,-.25), at(box(.14,.01,.015),0,.3,-.25), ...gunTurret(.1,.42,.8),
    ...pair(tone(at(box(.07,.06,.26),.09,.14,-.68,-.3),DK))],
  /* 揚陸艦（海）: the space destroyer's long narrow hull. The bridge stands forward, the after half is one flat vehicle deck
     with a gate in the stern; the destroyer's side pods are landing boats carried on the sides. No guns */
  seaDD:()=>[loft([[-1.1,.2,.1,.03],[-.4,.22,.1,.03],[.7,.15,.1,.03],[1,.08,.105,.04],[1.25,0,.115,.05]],SEA),
    at(loft([[.2,.15,.09],[.55,.14,.09],[.7,.08,.08,-.01]],TRAP),0,.22,0), tone(at(loft([[.45,.105,.014],[.555,.1,.014],[.705,.056,.014]],RECT),0,.27,0),GL),
    ...seaMast(.35,.3,.16,.16), tone(at(box(.3,.008,1.1),0,.132,-.45),.7), tone(at(box(.26,.12,.02),0,.06,-1.1),DK),
    ...pair(tone(at(loft([[-.6,.04,.035],[-.2,.04,.035],[-.1,.02,.03,.005]],RECT),.225,.1,0),.8))],
  /* space ships worked out (docs/models.md 15, round 2 in 15.4): today's hulls with their numbers kept, outlines added where
     the role shows, laser turrets worked out (laserT), point defence on every ship (pdG). Centred on y 0. sp…: used for space ships; SHAPES remains for legacy ground and sea drawings */
  spCV:()=>[loft([[-1,.13,.07],[-.55,.2,.1],[.35,.13,.07],[1.05,0,0]]), ...pair(at(plate([[.08,-.2],[.5,-.65],[.5,-.8],[.08,-.62]]),0,0,0)),
    at(plate([[0,-.35],[0,-.85],[.03,-.85],[.03,-.5]],.02),0,.05,0,0,0,Math.PI/2), ...pair(at(plate([[.08,.58],[.21,.44],[.21,.4],[.08,.42]],.02),0,0,0)),
    ...pair(at(loft([[-.98,.05,.045],[-.75,.055,.05],[-.55,.035,.03]]),.17,0,0)), ...spBells([0],0,-1.08,.09), ...spBells([.17,-.17],0,-1.03,.045),
    at(tube(.006,.28,4),0,0,1.17), tone(at(box(.018,.018,.04),0,0,1.3),GL), tone(at(box(.08,.03,.16),0,.075,.2),GL), ...belly(0,-.081,.03,.45),
    ...pair(at(loft([[-.86,.03,.03],[-.62,.035,.035],[-.45,0,0]]),.5,0,0)), ...pair(tone(at(tube(.012,.06,5),.5,0,-.89),DK)), ...pdG(0,.08,-.2,.8), ...gatB(0,-.092,-.3,.8)],
  spFF:()=>[loft([[-1,.2,.13],[-.35,.25,.16],[.45,.18,.12],[1.05,0,.01]]), at(loft([[-.55,.06,.05],[-.1,.07,.09,.04],[.25,0,0,.02]]),0,.14,0),
    ...pair(at(plate([[.2,-.5],[.42,-.85],[.42,-.95],[.2,-.85]]),0,-.02,0)), ...spBells([.1,-.1],0,-1.05,.08),
    ...pair(at(loft([[-.6,.05,.045],[-.5,.065,.055],[.05,.065,.055],[.15,.05,.045]],RECT),.25,.03,0)), ...[.25,-.25].flatMap(x=>lidsG(x,.088,-.48,0,5,.08)),
    ...laserT(0,.098,.55,.8), tone(at(box(.06,.025,.1),0,.2,.05),GL), ...pdG(0,.245,-.2,.8), ...pdG(.25,.083,.1,.7), ...pdG(-.25,.083,.1,.7),
    ...belly(0,-.141,.03,.7), ...gatB(.12,-.11,-.4,.8), ...gatB(-.12,-.11,-.4,.8)],
  spDD:()=>[loft([[-1.1,.18,.12],[-.4,.21,.14],[.7,.13,.09],[1.25,0,0]]), at(loft([[-.5,.07,.06],[-.15,.08,.1,.04],[.2,0,0,.02]]),0,.13,0),
    tone(loft([[-.55,.218,.055],[-.4,.222,.06],[.4,.163,.06],[.5,.15,.05]],SLAB),.8),
    ...pair(tone(at(loft([[-.75,.06,.06],[-.6,.07,.07],[.3,.07,.07],[.45,.055,.055]]),.29,-.03,0),.85)), ...pair(at(plate([[.15,-.2],[.29,-.25],[.29,.05],[.15,.15]],.02),0,-.03,0)),
    ...[.29,-.29].flatMap(x=>[[-.022,-.012],[.022,-.012],[0,.022]].map(([dx,dy])=>tone(at(tube(.015,.03,6),x+dx,-.03+dy,.455),DK))), ...spBells([.08,-.08],0,-1.15,.07),
    ...laserT(0,.088,.62,.8), tone(at(box(.07,.025,.1),0,.2,-.02),GL), ...pdG(.29,.035,-.35,.7), ...pdG(-.29,.035,-.35,.7), ...pdG(0,.205,-.42,.7),
    ...belly(0,-.118,.08,.7), ...gatB(.1,-.089,-.2,.8), ...gatB(-.1,-.089,-.2,.8)],
  /* 突撃揚陸艦 (docs/models.md 15.5): the W.A.S. drop from under the body — a flat-bottomed launch bay under the hull, its sides
     drawn in toward the bottom, and two rows of five pods (one W.A.S. each) half out of its floor, each with a dark lid. No side pods:
     a flat twin secondary gun laid on each side wall (15.7) */
  spMAS:()=>{ const BAY=[[1,1],[.8,-1],[-.8,-1],[-1,1]];
    const pods=[.11,-.11].flatMap(x=>[-.5,-.3,-.1,.1,.3].flatMap(z=>[tone(at(loft([[-.08,.04,.035],[.06,.05,.04],[.08,.035,.03]],O8),x,-.22,z),.8), tone(at(box(.06,.01,.1),x,-.258,z),DK)]));
    return [loft([[-1.05,.22,.16],[-.3,.29,.21],[.6,.26,.18],[.95,.18,.12]]), ...sideT(.272,0,-.05,.6), ...sideT(-.272,0,-.05,.6),
      loft([[-.75,.2,.06,-.13],[-.6,.26,.075,-.145],[.4,.25,.075,-.145],[.6,.18,.05,-.12]],BAY), ...pods,
      at(loft([[-.65,.1,.06],[-.35,.11,.12,.05],[-.05,0,0,.02]]),0,.19,0), ...spBells([.12,-.12],0,-1.1,.08),
      ...laserT(0,.18,.48,.65), tone(at(box(.09,.03,.08),0,.3,-.3),GL), ...pdG(.2,.1,-.5,.8), ...pdG(-.2,.1,-.5,.8), ...pdG(0,.28,-.55,.8)]; },
  /* 惑星共和国の宇宙の艦 (docs/models.md 15.12, outlines per class 15.13). m: the middle of the ship's length */
  /* コルベット・フリゲート（共和国）: the first version (sample round 10, 15.12), brought back by the user (15.21) */
  spCVM:()=>{ const M=mShip([[-1,.12,.06],[-.5,.24,.09],[0,.22,.08],[.65,.13,.055],[1,.04,.02]],-1,1.05,.9), m=M.mid;
    return [...M.hull(), ...M.hump(m-.25,m+.2,.07,.035), ...M.eyes(.75), ...mEng([0],M.z0,.06), ...mEng([.13,-.13],M.z0,.025),
      ...mGun(0,M.top(.45),.45,.7), ...mPD(0,M.top(-.5),-.5,.8), ...M.under(mGat(0,0,m,.9),m)]; },
  spFFM:()=>{ const M=mShip([[-1,.17,.08],[-.5,.25,.10],[0,.34,.12],[.4,.36,.12],[1,.12,.055]],-1,1.05,.85), m=M.mid, W=z=>M.at(z).w;
    return [...M.hull(), ...M.hump(m-.45,m-.05,.09,.04), ...M.eyes(.85), ...mEng([.09,-.09],M.z0,.05), ...mGun(0,M.top(.62),.62,.85),
      ...[[.38,.55],[-.6,.5]].flatMap(([z,dx])=>mPair(mPD,W(z)*dx,M.top(z),z,.8)),
      ...M.under(mGun(0,0,m,.55),m), ...M.side(()=>mGat(0,0,m,.9),m)]; },
  spDDM:()=>{ const B=mA([[-1.1,.17,.07],[-.6,.21,.08],[.2,.19,.075],[.55,.15,.065]]), P=mA([[.4,.07,.055],[1,.06,.045],[1.25,.03,.03]]), m=.075;
    return [...B.hull(), ...atX(P.hull(),.09), ...atX(P.hull(),-.09), ...pair(tone(at(box(.04,.01,.09),.09,P.top(1.08)+.002,1.08),GL)), ...B.hump(-.7,-.25,.08,.04),
      ...pair(at(loft([[-1.12,.05,.05],[-.85,.065,.06],[-.5,.03,.035]],O8),.2,0,0)), ...pair(tone(at(new THREE.CylinderGeometry(.04,.034,.04,8).rotateX(Math.PI/2),.2,0,-1.13),DK)), ...mGun(0,B.top(.3),.3,.85,2), ...mPair(mPD,B.at(-.45).w*.5,B.top(-.45),-.45,.75),
      ...B.under(mGun(0,0,m,.7,2),m), ...B.side(()=>mGat(0,0,m,.85),m)]; },
  /* 巡洋艦・戦艦の作り直しの見本（2026-11-15、docs/models.md 15.24。採用の形を SPACE_MODELS に接続）
     spCL3 (Earth cruiser, after the heavy cruiser Prinz Eugen): a long slim hull with a flat deck and a raked bow, four twin turrets
       (two superfiring forward, two aft), a tower bridge, one raked stack (a radiator tower) and an aft mast
     spBB3 (Earth battleship, after the battleship Yamato): a broad hull widest abaft the middle with a long fine bow that rises, three
       triple turrets (two superfiring forward, one aft), two triple secondaries on the centre line, a tall tower with a wide
       range-finder, a raked stack and mast, point defence crowded round the tower; the big railgun stays under the keel (15.9)
     Republic cruiser: spCLM4a; battleship: spBBM5. */
  spCL3:()=>{ const H=eHull([[-1.35,.13,.11],[-.95,.21,.15],[-.6,.24,.16],[.2,.24,.16],[.8,.17,.125],[1.3,.1,.09],[1.6,.045,.065],[1.75,.022,.05]]), T=H.top, dk=T(0)+.085;
    return [...H.parts, tone(at(loft([[-.5,.08,.045],[-.2,.095,.045],[.26,.09,.045],[.36,.05,.04]],SLAB),0,T(0)+.04,0),.9),
      at(loft([[.06,.05,.09],[.26,.045,.09],[.33,.025,.07]],TRAP),0,dk+.085,0), tone(at(box(.07,.028,.03),0,dk+.12,.285),GL),
      at(box(.16,.02,.035),0,dk+.185,.16), at(box(.03,.1,.03),0,dk+.24,.16), tone(at(box(.06,.035,.05),0,dk+.3,.16),GL),
      ...eStack(dk-.005,-.1,.065,.16,.17), at(box(.022,.2,.022),0,dk+.095,-.43), at(box(.16,.012,.02),0,dk+.15,-.43), tone(at(box(.05,.03,.04),0,dk+.2,-.43),GL),
      ...laserT(0,T(.78)-.008,.78,.8,2), at(new THREE.CylinderGeometry(.09,.1,.08,8),0,T(.54)+.03,.54), ...laserT(0,T(.54)+.07,.54,.8,2),
      at(new THREE.CylinderGeometry(.09,.1,.08,8),0,T(-.66)+.03,-.66), ...laserT(0,T(-.66)+.07,-.66,.8,2,true), ...laserT(0,T(-.9)-.008,-.9,.8,2,true),
      ...pdG(.055,dk-.004,.02,.8), ...pdG(-.055,dk-.004,.02,.8), ...pdG(.06,dk-.004,-.3,.8), ...pdG(-.06,dk-.004,-.3,.8),
      ...pair(at(plate([[.16,-1],[.33,-1.15],[.33,-1.32],[.14,-1.28]]),0,-.02,0)), ...spBells([.08,-.08,0],0,-1.4,.06),
      ...belly(0,H.keel(.05)+.003,.05,.6), ...sideT(H.w(.05)-.013,0,.05,.6), ...sideT(-(H.w(.05)-.013),0,.05,.6), ...gatB(.11,H.low(.11,-.5),-.5,.9), ...gatB(-.11,H.low(.11,-.5),-.5,.9)]; },
  spBB3:()=>{ const H=eHull([[-1.65,.15,.13],[-1.2,.27,.18],[-.25,.34,.2],[.4,.3,.18],[.9,.21,.14],[1.5,.12,.105],[1.85,.055,.08],[2.05,.028,.062]]), T=H.top, dk=T(-.2)+.105, t1=dk+.2;
    return [...H.parts, tone(at(loft([[-.84,.11,.055],[-.4,.14,.055],[.12,.13,.055],[.24,.08,.05]],SLAB),0,T(-.2)+.05,0),.9),
      at(loft([[-.32,.065,.1],[-.06,.06,.1],[.04,.035,.08]],TRAP),0,dk+.1,0), tone(at(box(.12,.03,.03),0,dk+.13,-.04),GL),
      at(box(.085,.15,.15),0,t1+.07,-.16), tone(at(box(.095,.026,.02),0,t1+.1,-.082),GL),
      at(box(.3,.03,.045),0,t1+.16,-.16), at(box(.07,.07,.07),0,t1+.2,-.16), tone(at(box(.08,.025,.02),0,t1+.21,-.12),GL),
      ...eStack(dk-.005,-.47,.085,.22,.2), at(barG([0,dk,-.62],[0,dk+.3,-.72],.03,.03),0,0,0), at(box(.2,.012,.02),0,dk+.24,-.7), tone(at(box(.05,.03,.04),0,dk+.31,-.72),GL),
      ...laserT(0,T(.72)-.008,.72,1.2,3), at(new THREE.CylinderGeometry(.14,.15,.11,8),0,T(.37)+.045,.37), ...laserT(0,T(.37)+.095,.37,1.2,3), ...laserT(0,T(-1)-.008,-1,1.2,3,true),
      at(new THREE.CylinderGeometry(.065,.07,.09,8),0,dk+.04,.14), ...laserT(0,dk+.085,.14,.6,3), ...laserT(0,dk-.004,-.76,.6,3,true),
      ...[.0,-.25,-.55].flatMap(z=>[...pdG(.085,dk-.004,z,.9), ...pdG(-.085,dk-.004,z,.9)]), ...[.1,-.88].flatMap(z=>[...pdG(H.w(z)*.58,T(z)-.004,z,.9), ...pdG(-H.w(z)*.58,T(z)-.004,z,.9)]),
      ...pair(at(plate([[.18,-1.3],[.38,-1.46],[.38,-1.6],[.16,-1.58]],.02),0,0,0)), ...spBells([.1,.034,-.034,-.1],0,-1.7,.05),
      ...sideT(H.w(.05)-.013,0,.05,.8), ...sideT(-(H.w(.05)-.013),0,.05,.8),
      ...bellyR(H.keel(-.4)+.003,-.4,1.1,1.25), ...gatB(.16,H.low(.16,.1),.1,1), ...gatB(-.16,H.low(.16,.1),.1,1), ...gatB(.16,H.low(.16,-.9),-.9,1), ...gatB(-.16,H.low(.16,-.9),-.9,1)]; },
  spCLM4a:()=>mCT({S:[[-1.1,.17,.07],[.15,.2,.15],[1.2,.09,.04]], guns:[[.5,.9,2,false],[-.7,.7,1,true]], side:()=>mGun(0,0,.05,.8,2), rail:false, eng:[[.07,-.07],-1.1,.045], pd:[-.3], gat:[-.45], rad:-.8}),
  /* 強襲母艦の作り直しの見本 (15.25、見本だけ。両陣営で別の形)
     masc3 (Earth): a slim hull with a long bow; two catapults of the same kind side by side on the centre deck (launch pads), for
       W.A.S. and aircraft alike, out of two dark mouths. The hangar is one wedge with leaning walls (the cut point forward
       with the mouths, widening aft); on it a slim neck and, larger than the neck, the bevelled bridge with a window band along
       its edges; an outrigger wedge pod on each side with a turret and an engine, set a little low on a drooped wing with a curved edge
     masc3M (the Republic): two slim hulls side by side, each with a level launch deck and a hangar that runs down to the stern as
       one slope; a flat bridge spans them over the hangars with the command hump in the middle, and a beam joins them at the stern */
  masc3:()=>{ const H=eHull([[-1.3,.3,.14],[-1,.34,.17],[.2,.2,.15],[.9,.11,.11],[1.35,.05,.07,.02],[1.5,0,.01,.07]]), fy=.185, m=g=>tone(g,DK), by=.365, py=-.25, px=.66,
      wing=()=>{ const P=[[-.04,-.2,-1.1,10],[.03,-.3,-.92,20],[.1,-.36,-.82,32],[.25,-.4,-.76,40],[.48,-.42,-.72]], out=[]; let x=.235, y=-.005;
        for(let i=0;i<4;i++){ const A=P[i], B=P[i+1], L=B[0]-A[0], a=A[3]*Math.PI/180, g=plate([[-.006,A[1]],[L+.006,B[1]],[L+.006,B[2]],[-.006,A[2]]],.045);
          g.rotateZ(-a); g.translate(x,y,0); out.push(g); x+=L*Math.cos(a); y-=L*Math.sin(a); } return out; },
      SL=[[.72,1],[1,-1],[-1,-1],[-.72,1]], BV=[[.8,1],[1,0],[.8,-1],[-.8,-1],[-1,0],[-.8,1]],
      win=(xf,zf,xb,zb,y,h)=>{ const dx=xb-xf, dz=zb-zf, L=Math.hypot(dx,dz), th=Math.atan2(dx,dz), cx=(xf+xb)/2-dz/L*.003, cz=(zf+zb)/2+dx/L*.003;
        return [1,-1].map(sg=>tone(at(box(.012,h,L*.8),sg*cx,y,cz,0,sg*th),GL)); };
    return [...H.parts, loft([[-.3,.15,.045,.14],[.6,.13,.045,.14],[1,.09,.045,.14],[1.38,.04,.045,.14]],RECT),
      ...[.06,-.06].flatMap(x=>[...[0,.3,.6,.9].map(z=>m(at(box(.07,.008,.12),x,fy+.002,z))), m(at(box(.01,.008,1.3),x,fy+.002,.42))]), m(at(box(.12,.008,.02),0,fy+.002,1.12)),
      loft([[-1.3,.2,.04,.2],[-1,.238,.055,.215],[-.25,.165,.045,.205]],SL), ...[.07,-.07].map(x=>m(at(box(.1,.065,.02),x,.205,-.246))),
      at(loft([[-.27,.022,.035,fy+.03],[.2,.008,.008,fy+.006]],TRAP),0,0,0),
      at(loft([[-1.04,.06,.04,.295],[-.72,.035,.04,.295]],TRAP),0,0,0),
      at(loft([[-1.12,.11,.034,by],[-1,.13,.04,by],[-.55,.04,.028,by]],BV),0,0,0), tone(at(box(.065,.02,.02),0,by,-.546),GL), ...win(.04,-.55,.13,-1,by,.02),
      at(loft([[-1.02,.04,.02],[-.8,.025,.02]],TRAP),0,by+.05,0), at(barG([0,by+.06,-.95],[0,by+.2,-1.02],.02,.02),0,0,0), at(box(.1,.01,.016),0,by+.14,-.99), tone(at(box(.04,.024,.04),0,by+.2,-1.02),GL),
      ...pair(at(loft([[-.9,.09,.09],[-.6,.11,.1],[.35,.02,.03]]),px,py,0)),
      ...wing().flatMap(g=>pair(g)),
      ...laserT(px,py+.088,-.45,.7,2), ...laserT(-px,py+.088,-.45,.7,2), ...spBells([px,-px],py,-.95,.07), ...spBells([.15,-.15],0,-1.35,.08),
      ...pdG(.13,.258,-.8,.8), ...pdG(-.13,.258,-.8,.8), ...pdG(.13,.256,-1.1,.8), ...pdG(-.13,.256,-1.1,.8),
      ...belly(0,H.keel(0)+.003,0,.6), ...gatB(.08,H.low(.08,.4),.4,.8), ...gatB(-.08,H.low(.08,.4),.4,.8), ...gatB(.12,H.low(.12,-.7),-.7,.8), ...gatB(-.12,H.low(.12,-.7),-.7,.8)]; },
  masc3M:()=>{ const bx=.3, dk=.125, m=g=>tone(g,DK), B=()=>mA([[-1.3,.13,.1],[-.5,.17,.12],[.3,.15,.1],[1,.1,.08],[1.45,.05,.05]]), M=B(),
      HP=[[.5,1],[1,.1],[1,-1],[-1,-1],[-1,.1],[-.5,1]], HS=[[-1.27,.09,.03,.11],[-.5,.15,.1,.19],[-.3,.14,.09,.18]],
      D=[-.3,.3,1,1.4].map(z=>{ const b=M.top(z)-.03, w=z>1?.045:.09; return [z,w,(dk-b)/2,(dk+b)/2]; }), both=f=>[1,-1].flatMap(sg=>atX(f(sg),sg*bx)),
      S=mA([[-.72,.3,.035],[-.5,.34,.045],[-.3,.3,.035]]), A=mA([[-1.12,.3,.05],[-.9,.3,.05]]);
    return [...both(()=>B().hull()), ...both(()=>[tone(loft(D,SLAB),.95), tone(loft(HS,HP),.9), m(at(box(.16,.085,.02),0,dk+.045,-.296)),
        ...[-.08,.2,.48,.76].map(z=>m(at(box(.1,.008,.11),0,dk+.002,z))), m(at(box(.01,.008,1.2),0,dk+.002,.36)), tone(at(box(.07,.012,.03),0,dk+.004,1.33),GL)]),
      ...ySh(S.hull(),.235), ...mHump(-.66,-.36,.12,.065,.27), ...ySh(A.hull(),.02), ...mEng([.36,.24,-.24,-.36],-1.28,.05),
      ...mPair(mPD,.22,.275,-.5,.85), ...mGun(0,.065,-1,.75,1,true),
      ...both(sg=>B().under(mGun(0,0,.2,.7,2),.2)), ...both(sg=>B().under(mGat(0,0,-.5,.85),-.5)), ...both(sg=>B().under(mGat(0,0,.8,.85),.8)),
      ...both(sg=>{ const p=mGun(0,0,.05,.7,2); return p.map(g=>{ g.rotateZ(-sg*Math.PI/2); g.translate(sg*(M.at(.05).w-.006),.012,0); return g; }); })]; },
  /* ゲームでは使わない。設定の絵（15.25）。
     the assault carriers landed (15.25): the same ships with the landing gear down. The gear is a ski (lSki: a dark runner whose
     end curves up a little) on a skeleton leg (lLeg: two thin splayed struts, a drag strut and a cross brace). Earth rests on its
     two low pods and one ski under the bow; the Republic on four skis under its two hulls — the fore pair raked and curved
     forward, the aft pair raked and curved aft. At sea both float as they are (no gear) */
  masc3L:()=>[...GROUND_SHAPES.masc3(), ...lSki(0,-.34,.82,.98,.09), ...lLeg(0,-.09,.68,-.085,1.02,-.335,.9)],
  masc3ML:()=>[...GROUND_SHAPES.masc3M(), ...[.3,-.3].flatMap(x=>[...lSki(x,-.27,.64,.82,.09), ...lLeg(x,-.07,.6,-.07,.8,-.265,.73),
    ...lSki(x,-.27,-.97,-.79,.09,-1), ...lLeg(x,-.08,-.75,-.08,-.95,-.265,-.88)])],
  spBBM5:()=>mBB5(),
  /* 戦闘母艦（連合）の作り直しの見本 (15.26): the flight deck after a modern supercarrier's (looked at only). One deck plate wider
     than the slim hull: a square-ended bow, a straight starboard edge, and the angled landing deck swinging out to port amidships at
     9°. On it the landing area (centre dashes, two edge lines, arresting wires), two bow catapults and two waist catapults on the
     angled deck (dark tracks, blast deflectors at their aft ends), three deck-edge elevators (two starboard forward of the island, one
     port aft), a small island aft of amidships on the starboard edge with flat radar faces and a mast, and parked aircraft */
  spCVB4:()=>{ const T=.15, K=T-.22, dt=T+.03, dy=T+.015, y=dt+.003, A=.157, cA=Math.cos(A), cx=z=>.02+(z+1.38)*Math.tan(A), m=g=>tone(g,DK), xi=-.215,
      D=[[-.1,1.52],[-.19,1.3],[-.24,1],[-.26,.6],[-.27,-.2],[-.27,-1.42],[.18,-1.42],[.26,-1.25],[.38,-.85],[.44,-.45],[.45,-.1],[.42,.12],[.3,.4],[.21,.62],[.19,1],[.15,1.3],[.1,1.52]],
      ln=(o,z,l,w=.01)=>at(box(w,.008,l),cx(z)+o/cA,y,z,0,A,0),
      jet=(x,z,r)=>{ const g=plate([[0,.07],[.04,-.02],[.015,-.03],[.015,-.05],[-.015,-.05],[-.015,-.03],[-.04,-.02]],.012); g.rotateY(r); g.translate(x,dt+.004,z); return g; };
    return [deckHull(D,[[T,1,1],[T-.05,.93,.99],[T-.13,.56,.96],[K,.32,.9]]), tone(at(plate(D,.03),0,dy,0),.62),
      ...[-1.25,-1.05,-.85,-.65,-.45,-.25,-.05].map(z=>ln(0,z,.08)), ...[.13,-.13].map(o=>ln(o,-.6,1.5)), ...[-1.05,-.97,-.89,-.81].map(z=>m(ln(0,z,.008,.22))),
      ...[-.07,.05].flatMap(x=>[m(at(box(.012,.008,.78),x,y,1.03)), m(at(box(.1,.008,.025),x,y,.6))]),
      m(ln(.06,-.1,.5,.012)), m(ln(.06,-.37,.025,.1)), m(ln(.17,-.25,.4,.012)), m(ln(.17,-.47,.025,.1)),
      ...[.3,.04].map(z=>tone(at(box(.13,.034,.16),-.245,dy,z),.45)), tone(at(box(.13,.034,.15),.33,dy,-1),.45),
      at(loft([[-.64,.045,.05],[-.38,.05,.05],[-.32,.03,.04]],TRAP),xi,dt+.05,0), at(loft([[-.5,.04,.03],[-.37,.045,.03],[-.33,.03,.025]],TRAP),xi,dt+.13,0),
      tone(at(box(.06,.018,.012),xi,dt+.135,-.335),GL), ...[1,-1].map(sg=>m(at(box(.008,.04,.06),xi+sg*.05,dt+.06,-.47))), m(at(box(.06,.04,.008),xi,dt+.06,-.343)),
      at(barG([xi,dt+.15,-.45],[xi,dt+.32,-.49],.018,.018),0,0,0), at(box(.1,.01,.016),xi,dt+.27,-.48), tone(at(box(.04,.024,.04),xi,dt+.33,-.49),GL),
      ...[.72,.86,1,1.14].map(z=>jet(-.17,z,Math.PI*.75)), ...[-.85,-1,-1.15].map(z=>jet(-.2,z,Math.PI*.25)), ...[1.2,1.33].map(z=>jet(.1,z,-Math.PI*.75)),
      ...pdG(-.22,dt-.004,-1.36,.75), ...pdG(.15,dt-.004,-1.36,.75), ...pdG(.4,dt-.004,-.62,.75), ...pdG(-.23,dt-.004,-.95,.75), ...pdG(-.14,dt-.004,1.4,.75), ...pdG(.12,dt-.004,1.42,.75),
      ...spBells([.13,0,-.13],.075,-1.41,.06),
      ...belly(0,K+.003,0,.6), ...[.5,-.8].flatMap(z=>[...gatB(.06,K+.003,z,.8), ...gatB(-.06,K+.003,z,.8)])]; },
  /* 戦闘母艦（共和国）の飛行甲板の直しの見本 (15.24): the same ship; the angled deck is one plate cut to the hull — its starboard edge runs
     along the island, its port edge swings out from the stern, the corners are cut, and a darker sponson under the overhang fairs it into the side */
  spCVBM2:()=>{ const M=mA([[-1.2,.2,.12],[-.9,.25,.12],[.2,.25,.12],[.9,.17,.1],[1.5,.03,.05]]), m=0, A=-.11, dy=M.top(-.5)+.03;
    const deck=[at(plate([[.07,-1.2],[.07,.32],[0,.42],[-.3,.42],[-.42,.26],[-.42,-.2],[-.24,-1.05],[-.2,-1.2]],.03),0,dy,0),
      tone(at(plate([[-.2,.4],[-.3,.4],[-.39,.26],[-.39,-.2],[-.22,-.9]],.07),0,dy-.045,0),.72),
      ...[at(box(.022,.01,1.44),-.143,dy+.017,-.4,0,A,0), ...[.05,-.2,-.6,-1].map(z=>at(box(.1,.01,.08),-.13+(z+.52)*Math.sin(A),dy+.017,z,0,A,0)), at(box(.3,.01,.02),-.15,dy+.017,.38),
        ...[.085,-.085].map(d=>at(box(.01,.01,1.4),-.143+d,dy+.017,-.4,0,A,0)), ...[-.045,-.015,.015,.045].map(d=>at(box(.016,.01,.1),-.068+d,dy+.017,-1.1,0,A,0)),
        at(box(.1,.01,.12),-.33,dy+.017,-.33), at(box(.1,.01,.12),-.33,dy+.017,-.02), ...[1,-1].map(sg=>at(box(.014,.01,.1),-.218+sg*.025,dy+.017,.27,0,A+sg*.5,0))].map(g=>tone(g,DK))];
    const yI=M.top(-.1)-.02, isl=[at(loft([[-.42,.06,.055,.055],[-.3,.08,.065,.065],[.12,.08,.065,.065],[.2,.05,.05,.05]],TRAP),.16,yI,0),
      at(loft([[-.3,.045,.05,.05],[-.2,.06,.06,.06],[.04,.055,.055,.055],[.1,.035,.04,.04]],TRAP),.16,yI+.12,0), tone(at(box(.13,.03,.16),.16,yI+.18,-.07),GL),
      at(box(.025,.16,.025),.16,yI+.3,-.12), tone(at(new THREE.IcosahedronGeometry(.035,0),.16,yI+.4,-.12),GL)];
    const tubes=[.09,-.09].flatMap(x=>[.06,-.03].flatMap(dx=>[at(box(.035,.035,.22),x+dx,M.top(.6)+.035,.6,-.25,0,0), tone(at(box(.03,.03,.012),x+dx,M.top(.6)+.062,.705,-.25,0,0),DK)])).concat([.09,-.09].map(x=>at(box(.12,.03,.1),x,M.top(.57)+.012,.57)));
    return [...M.hull(), ...deck, ...isl, ...tubes, ...M.eyes(1.34,.5), ...mEng([.12,-.12],-1.2,.06),
      ...mGun(0,M.top(1.18),1.18,.75,2), ...mGun(0,M.top(.9),.9,.8,2),
      ...mPair(mPD,.19,M.top(.46)-.004,.46,.8), ...mPD(.17,M.top(-.98),-.98,.8), ...mPD(-.37,dy+.013,-.17,.8),
      ...M.under(mGun(0,0,m,.6),m), ...[.13,-.13].flatMap(dz=>[1,-1].flatMap(sg=>M.under(mGat(0,0,m+dz,.85),m+dz,sg*.15)))]; },
  /* 戦闘母艦（共和国, 15.16）: a slim heavy aviation cruiser — a long narrow hull with a fine bow, the fore deck armed (two twin
     turrets, two pairs of raised twin launch tubes), a big two-level island to starboard amidships with an optical mast and dome, and
     an angled flight deck on the after half whose fore end swings out past the port side on a support */
  /* 突撃揚陸艦（共和国, 15.16, longer and streamlined 15.18）: a landing craft — a flat-bottomed hull drawn in at both ends; an open
     well deck between side walls that follow the hull and turn in over the fore third; a raked wedge ramp with dark grating bars ahead
     of the well and a fine bow below it; a low deckhouse aft with a sloped front, its optical band and a post; dark fenders. The eight
     W.A.S. sit in the well in pods (two rows of four) and drop through lids in the floor */
  spMASM:()=>{ const M=mA([[-1.2,.19,.075],[-1,.28,.095],[-.3,.31,.1],[.45,.29,.1],[.85,.22,.085],[1.15,.1,.05]]), m=-.025, wy=M.top(0);
    const wz=[...Array(18)].map((_,i)=>-1.12+i*2.04/17), wh=z=>z<-.6?.02+.11*Math.sin(Math.PI/2*(z+1.12)/.52):.13-.03*Math.min(1,Math.max(0,(z-.2)/.62)), yc=z=>.1*M.at(z).h-.004, walls=[1,-1].map(sg=>wallStrip(wz.map(z=>[sg*(M.at(z).w-.006),z,wy-.012+wh(z)-yc(z),yc(z)]),wy-.012));
    const floor=tone(loft([[-.64,.27,.003,wy+.003],[.35,.27,.003,wy+.003],[.8,.19,.003,wy+.003]],RECT),.55);
    const RA=.6, rb=M.top(.93)-.006, rt=wy-.012+.1, RL=(rt-rb)/Math.cos(RA)+.01;
    const ramp=[at(box(.36,RL,.035),0,0,0), ...[-.3,-.1,.1,.3].map(k=>tone(at(box(.3,.016,.012),0,k*RL,.022),DK))].map(g=>{ g.rotateX(-RA); g.translate(0,(rb+rt)/2,.93-RL/2*Math.sin(RA)); return g; });
    const pods=[.11,-.11].flatMap(x=>[-.47,-.19,.09,.37].map(z=>tone(at(box(.15,.07,.2),x,wy+.04,z),.85)));
    const lids=[.11,-.11].flatMap(x=>[-.47,-.19,.09,.37].map(z=>tone(at(box(.11,.008,.15),x,M.bot(z)-.002,z),DK)));
    const house=[at(loft([[-1.12,.07,.015,.015],[-1.02,.14,.04,.04],[-.92,.16,.05,.05],[-.76,.14,.045,.045],[-.68,.08,.025,.025]],FACET),0,wy-.025,0), ...mHump(-.98,-.8,.1,.045,wy+.065), at(box(.015,.14,.015),-.06,wy+.155,-.98)];
    const fend=[.25,-.45].flatMap(z=>pair(tone(at(tube(.028,.1,8),M.at(z).w+.003,.02,z),DK)));
    return [...M.hull(), ...walls, floor, ...ramp, ...pods, ...lids, ...house, ...fend, ...mEng([.1,-.1],-1.2,.055),
      ...mGun(0,wy+.107,-.9,.7), ...mPair(mPD,.285,wy+.12,-.55,.75), ...sideAt(()=>flatM(0,0,m,.6),M.at(m).w-.006,.02)]; },
  /* ---- 地上の建物と施設（見本の第1回、2026-11-15。ゲームにはまだ入れていない。docs/models.md 16）----
     底面はおよそ 1 × 1（x・z が ±.5）、地面は y = 0。高さは形ごとに決まり、縦には伸ばさない。回さずに置く（視界と遮蔽の箱が軸に沿うため）。
     色は陣営色でなく灰色で描く。tone で屋根・窓の帯・暗い部品を分ける */
  /* 中東: 平らな屋根の低い家。手すり壁と、角に載る小さい2階、中庭の塀 */
  obHouseFlat:()=>[obx(.78,.34,.7,-.08,0,.05), tone(obx(.82,.04,.74,-.08,.34,.05),.8), obx(.36,.24,.34,-.26,.36,-.1), tone(obx(.4,.03,.38,-.26,.6,-.1),.8),
    obx(.2,.2,.9,.4,0,0), tone(obx(.1,.16,.02,-.1,.02,.41),DK), tone(obx(.5,.05,.02,-.08,.2,.41),GL)],
  /* 中東: 丸屋根の建物と細い塔（町の目印） */
  obDome:()=>[obx(.72,.36,.72,-.1,0,0), tone(obx(.76,.03,.76,-.1,.36,0),.8), tone(at(obDomeG(.27,.24),-.1,.39,0),.9), at(new THREE.CylinderGeometry(.05,.06,.95,6),.4,.475,.36),
    tone(at(new THREE.CylinderGeometry(.075,.075,.04,6),.4,.78,.36),.8), tone(at(new THREE.ConeGeometry(.06,.16,6),.4,1.03,.36),.8), obx(.3,.12,.2,.25,0,.36)],
  /* 中東: 3〜4階の平屋根の集合住宅。段になった屋上と水のタンク */
  obBlockFlat:()=>[obx(.9,.62,.6,0,0,0), tone(obx(.94,.03,.64,0,.62,0),.8), obx(.5,.2,.5,-.2,.65,0), tone(obx(.54,.03,.54,-.2,.85,0),.8),
    ...[.16,.34,.52].map(y=>tone(obx(.92,.05,.61,0,y,0),GL)), tone(at(new THREE.CylinderGeometry(.07,.07,.12,6),.28,.71,.12),DK), tone(at(new THREE.CylinderGeometry(.07,.07,.12,6),.28,.71,-.12),DK)],
  /* 華南: 道沿いの長屋。1階がひさしの通路、勾配の屋根 */
  obShop:()=>[obx(.9,.46,.56,0,0,-.05), tone(at(obRoof(.94,.2,.6),0,.56,-.05),.62), tone(obx(.9,.03,.2,0,.2,.3),.75), ...[-.36,-.12,.12,.36].map(x=>obx(.04,.2,.04,x,0,.37)),
    tone(obx(.8,.07,.02,0,.3,.23),GL)],
  /* 華南: 中層の集合住宅。ベランダの帯と屋上の階段室 */
  obApart:()=>[obx(.96,1.05,.5,0,0,0), ...[.18,.36,.54,.72,.9].map(y=>tone(obx(.98,.06,.52,0,y,0),GL)), tone(obx(1,.03,.54,0,1.05,0),.8),
    obx(.2,.14,.24,-.3,1.08,0), tone(obx(.3,.1,.2,.2,1.08,.05),DK), obx(.16,1.12,.56,0,0,0)],
  /* 広州: 高層ビル。上で細くなる段と、屋上のアンテナ */
  obTower:()=>[obx(.8,1.3,.7,0,0,0), obx(.62,.7,.54,0,1.3,0), obx(.4,.3,.34,0,2,0), ...[.25,.5,.75,1,1.5,1.75].map(y=>tone(obx(y>1.3?.63:.81,.1,y>1.3?.55:.71,0,y,0),GL)),
    tone(obx(.84,.03,.74,0,1.3,0),.8), tone(obx(.66,.03,.58,0,2,0),.8), tone(at(new THREE.CylinderGeometry(.012,.02,.4,5),0,2.5,0),DK)],
  /* 広州: 100年先の高層ビル。角を切ったガラスの塔2本を、空中の渡り廊下でつなぐ */
  obTowerTwin:()=>{ const tw=(x,h,z)=>[at(obPrism(.19,.19,h,O8),x,0,z), tone(at(obPrism(.195,.195,h*.82,O8),x,h*.1,z),GL), at(obPrism(.2,.2,.04,O8),x,h,z)];
    return [obx(1,.16,.8,0,0,0), tone(obx(1.02,.02,.82,0,.16,0),.8), ...tw(-.26,2.3,.08), ...tw(.26,1.9,-.08), obx(.3,.1,.14,0,1.35,0), tone(obx(.26,.05,.15,0,1.375,0),GL)]; },
  /* 倉庫: 長い切妻の屋根と大きな扉 */
  obWarehouse:()=>[obx(1.2,.3,.7,0,0,0), tone(at(obRoof(1.24,.16,.74),0,.38,0),.62), tone(obx(.26,.22,.02,-.3,0,.35),DK), tone(obx(.26,.22,.02,.3,0,.35),DK)],
  /* 工場: のこぎり屋根と煙突 */
  obFactory:()=>[obx(1.1,.3,.8,-.05,0,0), ...[-.3,-.1,.1,.3].map(z=>tone(at(loft([[-.55,.1,.07],[.55,.1,.07]],OB_SAW),-.05,.37,z,0,Math.PI/2,0),.62)),
    at(new THREE.CylinderGeometry(.045,.06,.9,6),.48,.45,-.3), tone(at(new THREE.CylinderGeometry(.05,.05,.05,6),.48,.86,-.3),DK), obx(.2,.2,.3,.45,0,.2)],
  /* 燃料タンク: 丸いタンク3基と配管 */
  obTanks:()=>[...[[-.28,-.2],[.28,-.2],[0,.26]].flatMap(([x,z])=>[at(new THREE.CylinderGeometry(.23,.23,.3,10),x,.15,z), tone(at(new THREE.CylinderGeometry(.03,.235,.05,10),x,.325,z),.8)]),
    tone(obx(.6,.03,.03,0,.05,-.2),DK), tone(obx(.03,.03,.5,.1,.05,.03),DK), tone(obx(1,.02,.96,0,0,.03),.7)],
  /* 港: 岸壁のガントリークレーン。脚4本、梁、海へ張り出す腕 */
  obCrane:()=>[...[[-.25,-.2],[.25,-.2],[-.25,.2],[.25,.2]].map(([x,z])=>obx(.05,.9,.05,x,0,z)), obx(.56,.05,.46,0,.9,0), obx(.08,.06,1.5,0,.95,.3), tone(obx(.16,.12,.2,0,.83,.5),DK),
    tone(obx(.012,.5,.012,0,.33,.5),DK), tone(obx(.2,.03,.1,0,.3,.5),DK), obx(.03,.42,.03,0,1,-.1), tone(limb([0,1.42,-.1],[0,1.01,.95],.01,.01),DK),
    ...[-.2,.2].map(z=>obx(.55,.04,.04,0,.45,z))],
  /* 港: コンテナの山 */
  obContainers:()=>[[-.3,0,-.25,1],[0,0,-.25,.85],[.3,0,-.25,.7],[-.3,.14,-.25,.7],[0,.14,-.25,1],[-.15,.28,-.25,.85],[-.3,0,.25,.85],[0,0,.25,.7],[.3,0,.25,1],[.15,.14,.25,.85]]
    .map(([x,y,z,k])=>tone(obx(.28,.14,.44,x,y,z),k)).concat([tone(obx(1,.02,1,0,0,0),.7)]),
  /* 飛行場: かまぼこ形の格納庫 */
  obHangar:()=>[at(loft([[-.5,.5,.2],[.5,.5,.2]],OB_ARC),0,.2,0), tone(obx(.7,.26,.02,0,0,.5),DK), tone(obx(1.04,.03,1.04,0,0,0),.7)],
  /* 飛行場: 管制塔 */
  obControl:()=>[obx(.5,.24,.5,0,0,0), at(obPrism(.11,.11,.7,O8),0,.24,0), tone(at(new THREE.CylinderGeometry(.24,.17,.16,8),0,1.02,0),GL), at(new THREE.CylinderGeometry(.26,.26,.04,8),0,1.12,0),
    tone(at(new THREE.CylinderGeometry(.01,.01,.24,5),.1,1.26,0),DK)],
  /* 軍: 司令部。斜めの壁の掩体、アンテナの柱、レーダーの皿 */
  obHQ:()=>[at(loft([[-.45,.5,.14],[.45,.5,.14]],SLAB),0,.14,0), obx(.5,.14,.4,-.1,.28,0), tone(obx(.42,.05,.02,-.1,.33,.2),GL), tone(obx(.2,.16,.02,.2,0,.455),DK),
    tone(at(new THREE.CylinderGeometry(.012,.02,.6,5),-.28,.72,-.1),DK), at(new THREE.CylinderGeometry(.03,.04,.16,6),.22,.36,-.1), tone(at(new THREE.CylinderGeometry(.16,.03,.06,8),.22,.47,-.1,.5,0,0),.8)],
  /* 軍: レーダー。台の上の丸い覆い */
  obRadar:()=>[obx(.5,.2,.5,0,0,0), at(obPrism(.14,.14,.3,O8),0,.2,0), tone(at(new THREE.SphereGeometry(.27,8,6),0,.7,0),.9)],
  /* 軍: 補給所。屋根つきの置き場と、積んだ箱、燃料の筒 */
  obDepot:()=>[...[[-.4,-.3],[.4,-.3],[-.4,.3],[.4,.3]].map(([x,z])=>obx(.04,.3,.04,x,0,z)), tone(at(obRoof(.96,.1,.76),0,.35,0),.62), ...[[-.2,0,-.1,.85],[.05,0,-.1,.7],[-.08,.12,-.1,1],[.25,0,.12,.85]].map(([x,y,z,k])=>tone(obx(.22,.12,.3,x,y,z),k)),
    tone(at(tube(.06,.34,8),-.22,.08,.2,0,Math.PI/2,0),DK), tone(obx(.98,.02,.78,0,0,0),.7)],
  /* ---- 第2回で足した形（2026-11-15。ユーザー「村落、畑・水田、都会を文化圏ごとに3種類、高速道路と都市の道路、鉄道と駅、飛行場、港」）---- */
  /* 畑: うねの縞。水田: あぜで区切った水面と稲の列 */
  obField:()=>[tone(obx(1,.02,1,0,0,0),OC.soil), ...[...Array(8)].map((_,i)=>tone(obx(.07,.035,.94,-.42+i*.12,0,0),i%4<2?OC.crop:OC.crop2))],
  obPaddy:()=>[tone(obx(1,.02,1,0,0,0),OC.water), ...[-.48,0,.48].flatMap(d=>[tone(obx(1,.045,.04,0,0,d),OC.soil), tone(obx(.04,.045,1,d,0,0),OC.soil)]),
    ...[[-.24,-.24],[.24,.24]].flatMap(([x,z])=>[...Array(5)].map((_,i)=>tone(obx(.36,.03,.03,x,0,z-.16+i*.08),OC.rice)))],
  /* 村の家（中東）: 塀で囲んだ中庭と平屋根の家。村の家（東アジア）: 勾配屋根の母屋と離れ、庭の塀。物置 */
  obFarmME:()=>[obx(.5,.26,.42,-.2,0,-.24), tone(obx(.54,.03,.46,-.2,.26,-.24),.8), obx(.3,.18,.3,.3,0,.3), tone(obx(.34,.03,.34,.3,.18,.3),.8),
    obx(1,.13,.04,0,0,-.48), obx(1,.13,.04,0,0,.48), obx(.04,.13,1,-.48,0,0), obx(.04,.13,.6,.48,0,-.2), tone(obx(.08,.14,.02,-.2,.01,-.02),DK)],
  obFarmCN:()=>[obx(.66,.24,.36,0,0,-.26), tone(at(obRoof(.74,.16,.46),0,.32,-.26),.6), obx(.26,.18,.4,-.32,0,.18), tone(at(obRoofZ(.34,.12,.46),-.32,.24,.18),.6),
    obx(.68,.1,.03,.14,0,.385), obx(.03,.1,.5,.465,0,.15), tone(obx(.3,.05,.02,0,.12,-.07),GL)],
  obShed:()=>[obx(.4,.18,.3,0,0,0), tone(at(obRoof(.46,.1,.36),0,.23,0),.6), tone(obx(.14,.13,.02,0,0,.15),DK)],
  /* 大都市の事務所ビル: 低い台と薄い板の塔 */
  obOffice:()=>[obx(.95,.2,.8,0,0,0), tone(obx(.97,.02,.82,0,.2,0),.8), obx(.7,1.5,.4,0,.22,0), tone(obx(.62,1.4,.42,0,.27,0),GL), tone(obx(.74,.03,.44,0,1.72,0),.8), tone(obx(.3,.1,.2,.1,1.75,0),DK)],
  /* メトロポリタンの超高層: 上へ細くなる八角の塔と尖塔 */
  obSuper:()=>{ const body=k=>{ const g=loft([[.2,.36*k,.36*k],[1.7,.3*k,.3*k],[2.9,.2*k,.2*k],[3.4,.08*k,.08*k]],O8); g.rotateX(-Math.PI/2); return g; };
    return [obx(.95,.2,.95,0,0,0), tone(obx(.97,.02,.97,0,.2,0),.8), tone(body(1),GL), ...[0,1,2,3].map(i=>at(obx(.05,3.1,.05,.3,.2,0).rotateZ(.083),0,0,0,0,i*Math.PI/2+Math.PI/8,0)),
      ...[1,1.7,2.4].map(y=>at(obPrism(.33-.055*(y-.2),.33-.055*(y-.2),.04,O8),0,y,0)), tone(at(new THREE.CylinderGeometry(.01,.03,.6,5),0,3.7,0),DK)]; },
  /* メトロポリタンの積層都市: 1街区を占める段々の巨大建築。段ごとにガラスの帯と屋上の緑、頂に塔 */
  obArco:()=>[...[[1,0,.5],[.8,.5,.5],[.6,1,.5],[.4,1.5,.7]].flatMap(([w,y,h])=>[obx(w,h,w,0,y,0), tone(obx(w+.01,h*.5,w+.01,0,y+h*.3,0),GL), tone(obx(w,.02,w,0,y+h,0),OC.crop)]),
    tone(obx(.42,.03,.42,0,2.2,0),.8), tone(at(new THREE.CylinderGeometry(.012,.03,.5,5),0,2.45,0),DK)],
  /* メトロポリタンの連結超高層: 3本の塔を2段の空中の輪でつなぐ */
  obMega:()=>{ const tw=(x,z,h)=>{ const g=loft([[.2,.2,.2],[h*.6,.17,.17],[h,.09,.09]],O8); g.rotateX(-Math.PI/2); g.translate(x,0,z); return [tone(g,GL), at(obPrism(.1,.1,.04,O8),x,h,z), tone(at(new THREE.CylinderGeometry(.008,.02,.4,5),x,h+.2,z),DK)]; };
    return [obx(1,.2,1,0,0,0), tone(obx(1.02,.02,1.02,0,.2,0),.8), ...tw(0,.27,3.6), ...tw(-.25,-.17,3.1), ...tw(.25,-.17,2.7), ...[1.1,2].flatMap(y=>[at(obPrism(.46,.46,.07,O8),0,y,0), tone(at(obPrism(.47,.47,.03,O8),0,y+.02,0),GL)])]; },
  /* 中東の大都市の塔: 細い塔に、斜めに切った頂部 */
  obTowerME:()=>[obx(.9,.16,.9,0,0,0), tone(at(obDomeG(.16,.14),.28,.16,.28),.9), obx(.46,1.7,.46,-.1,.16,-.1), ...[.5,.9,1.3,1.7].map(y=>tone(obx(.47,.2,.47,-.1,y-.14,-.1),GL)),
    tone(at(loft([[-.23,.23,.2],[.23,.23,.2]],OB_SAW),-.1,2.06,-.1),.8)],
  /* 都市の道路（長さ1、z 向き）: 車道、歩道、中央の線。交差点 */
  obRoadCity:()=>[tone(obx(.5,.02,1,0,0,0),OC.asph), ...[-.3,.3].map(x=>tone(obx(.1,.035,1,x,0,0),OC.walk)), ...[-.33,0,.33].map(z=>tone(obx(.015,.024,.18,0,0,z),OC.line))],
  obCross:()=>[tone(obx(.7,.02,.7,0,0,0),OC.asph), ...[[1,1],[1,-1],[-1,1],[-1,-1]].map(([a,b])=>tone(obx(.1,.035,.1,a*.3,0,b*.3),OC.walk)),
    ...[[0,.27,1],[0,-.27,1],[.27,0,0],[-.27,0,0]].flatMap(([x,z,h])=>[-.15,-.05,.05,.15].map(d=>tone(h?obx(.05,.024,.08,x+d,0,z):obx(.08,.024,.05,x,0,z+d),OC.line)))],
  /* 高速道路（高架、長さ1、z 向き）: 橋脚、2本の車道、中央と両側の壁 */
  obHighway:()=>[...[-.3,.3].flatMap(z=>[obx(.14,.3,.12,0,0,z), obx(.8,.06,.12,0,.3,z)]), tone(obx(.84,.04,1,0,.36,0),OC.asph), ...[-.42,0,.42].map(x=>tone(obx(.03,.07,1,x,.38,0),.9)),
    ...[-.21,.21].flatMap(x=>[-.3,.1].map(z=>tone(obx(.012,.01,.2,x,.4,z+.1),OC.line)))],
  /* 鉄道（長さ1、z 向き）。駅: ホーム2本と線路2本、かまぼこの上屋、駅舎。列車: 100年先の高速列車3両 */
  obRail:()=>obRails(0,1),
  obStation:()=>[tone(obx(1.9,.02,1.6,.15,0,0),.6), ...obRails(-.17,1.6), ...obRails(.17,1.6), ...[-.42,.42].map(x=>tone(obx(.16,.07,1.6,x,0,0),.8)), tone(at(loft([[-.6,.52,.1],[.6,.52,.1]],OB_ARC),0,.4,0),.62),
    ...[-.5,.5].flatMap(x=>[-.5,0,.5].map(z=>obx(.03,.32,.03,x,0,z))), obx(.36,.3,.8,.76,0,0), tone(obx(.4,.03,.84,.76,.3,0),.8), tone(obx(.02,.1,.6,.945,.1,0),GL)],
  obTrain:()=>[...obRails(0,1.6), ...[-.5,0,.5].flatMap((z,i)=>[at(loft(i===1?[[-.25,.075,.065],[.25,.075,.065]]:i?[[-.25,.075,.065],[.1,.075,.065],[.26,.03,.03,-.03]]:[[-.26,.03,.03,-.03],[-.1,.075,.065],[.25,.075,.065]],SQR),0,.12,z),
      tone(obx(.155,.03,.36,0,.13,z+(i-1)*-.04),GL)])],
  /* 飛行場: 滑走路（長さ2、z 向き）とターミナル（弓なりの屋根と搭乗橋） */
  obRunway:()=>[tone(obx(.6,.02,2,0,0,0),OC.asph), ...[...Array(7)].map((_,i)=>tone(obx(.02,.024,.16,0,0,-.72+i*.24),OC.line)), ...[-.9,.9].flatMap(z=>[-.2,-.12,-.04,.04,.12,.2].map(x=>tone(obx(.03,.024,.12,x,0,z),OC.line))),
    ...[-.28,.28].map(x=>tone(obx(.012,.024,1.96,x,0,0),OC.line))],
  obTerminal:()=>[obTurn(at(loft([[-.7,.3,.11],[.7,.3,.11]],OB_ARC),0,.11,0)).translate(0,0,-.2), tone(obx(1.36,.12,.02,0,.02,.1),GL), ...[-.4,.4].flatMap(x=>[obx(.1,.1,.5,x,.02,.34), tone(obx(.26,.06,.06,x,.05,.5),DK)]),
    tone(obx(1.5,.02,1.2,0,0,.1),.7)],
  /* 港: 岸壁（水面つき）、突堤、貨物船 */
  obQuay:()=>[tone(obx(1.4,.1,.5,0,0,-.25),.8), tone(obx(1.4,.03,.6,0,0,.28),OC.water), obx(.14,.09,.56,-.4,0,.28), ...[-.5,0,.5].map(x=>tone(at(new THREE.CylinderGeometry(.02,.025,.05,6),x,.125,-.04),DK))],
  obShipCargo:()=>[tone(obx(.5,.02,1.5,0,0,0),OC.water), at(loft([[-.62,.1,.07],[-.5,.15,.08],[.4,.15,.08],[.66,.02,.07]],SLAB),0,.085,0), obx(.22,.2,.14,0,.16,-.48), tone(obx(.24,.04,.03,0,.3,-.41),GL),
    ...[[-.25,1],[-.05,.75],[.15,.9],[.33,.7]].flatMap(([z,k])=>[tone(obx(.24,.07,.17,0,.165,z),k), tone(obx(.24,.06,.17,0,.235,z),k*.85)]).slice(0,7)],
  /* 見本用: 村と、文化圏ごとの3段階の都市（地方都市・大都市・メトロポリタン）、交通の施設の並び */
  obVillageME:()=>obVillage('obFarmME','obField',11),
  obVillageEA:()=>obVillage('obFarmCN','obPaddy',12),
  /* 都市の型は3つ（ユーザー 2026-11-15）: 盤目（obCity）、放射状、自然都市（開発はされているが、道が昔からの流用で不規則）。
     段階は3つ: 地方都市／大都会（今の上海・ニューヨーク・東京・ロンドン級）／メトロポリタン（前からの大都会の最終形）。鍵は ob<型><文化圏><段階> */
  obCityME1:()=>obCity(3,OB_PICK.ME[0],21), obCityME2:()=>obCity(5,OB_PICK.ME[1],22,{hw:1}), obCityME3:()=>obCity(7,OB_PICK.ME[2],23,{hw:[2,5],rail:1,block:OB_BLOCK}),
  obCityEA1:()=>obCity(3,OB_PICK.EA[0],31), obCityEA2:()=>obCity(5,OB_PICK.EA[1],32,{hw:1}), obCityEA3:()=>obCity(7,OB_PICK.EA[2],33,{hw:[2,5],rail:1,block:OB_BLOCK}),
  obRadEA1:()=>obCityFree('rad','EA',1,41), obRadEA2:()=>obCityFree('rad','EA',2,42), obRadEA3:()=>obCityFree('rad','EA',3,43), obRadME2:()=>obCityFree('rad','ME',2,44),
  obOrgEA1:()=>obCityFree('org','EA',1,51), obOrgEA2:()=>obCityFree('org','EA',2,52), obOrgEA3:()=>obCityFree('org','EA',3,53), obOrgME2:()=>obCityFree('org','ME',2,54),
  obSceneAir:()=>{ const P=[], put=obPut(P); P.push(tone(obx(6,.02,3.6,0,-.02,0),[.6,.66,.48])); [-2,0,2].forEach(x=>put(GROUND_SHAPES.obRunway(),x,-1,1,true)); put(GROUND_SHAPES.obTerminal(),0,.5,1.2);
    [-2.3,-1.6].forEach(x=>put(GROUND_SHAPES.obHangar(),x,.6,.8)); put(GROUND_SHAPES.obControl(),1.5,.5,.68); put(GROUND_SHAPES.obRadar(),2.3,.7,.68); return P; },
  obScenePort:()=>{ const P=[], put=obPut(P); P.push(tone(obx(6,.02,2,0,-.02,-1),.75)); P.push(tone(obx(6,.02,2,0,-.03,1),OC.water)); [-2.1,-.7,.7,2.1].forEach(x=>put(GROUND_SHAPES.obQuay(),x,0,1));
    [-1.6,.2].forEach(x=>put(GROUND_SHAPES.obCrane(),x,-.2,.68)); [-2.4,-.9,1.2].forEach(x=>put(GROUND_SHAPES.obContainers(),x,-1,.68)); put(GROUND_SHAPES.obWarehouse(),2.2,-1.2,.8); put(GROUND_SHAPES.obTanks(),.2,-1.3,.68);
    put(GROUND_SHAPES.obShipCargo(),-.9,.7,1.3,true); return P; },
  obSceneRoad:()=>{ const P=[], put=obPut(P); P.push(tone(obx(5,.02,3,0,-.02,0),[.6,.66,.48])); [-2,-1,1,2].forEach(x=>put(GROUND_SHAPES.obRoadCity(),x,.8,1,true)); put(GROUND_SHAPES.obCross(),0,.8,1.43);
    [-.2,1.8].forEach(z=>put(GROUND_SHAPES.obRoadCity(),0,z-.2+ (z<0?-.3:0),1)); [-2,-1,0,1,2].forEach(x=>put(GROUND_SHAPES.obHighway(),x,-.8,1,true)); return P; },
  obSceneRail:()=>{ const P=[], put=obPut(P); P.push(tone(obx(5.4,.02,2.4,0,-.02,0),[.6,.66,.48])); [-2.2,-1.2,1.2,2.2].forEach(x=>put(GROUND_SHAPES.obRail(),x,-.17,1,true)); put(GROUND_SHAPES.obStation(),0,0,1,true);
    put(GROUND_SHAPES.obTrain(),-1.7,.17,1,true); [1.3,2.3].forEach(x=>put(GROUND_SHAPES.obRail(),x,.17,1,true)); return P; },
  /* ---- 木（第4回、2026-11-15。ユーザー「森林も現在のに加えて、針葉樹、熱帯雨林など」）。幅はおよそ1、根元は y = 0。色つき ---- */
  /* 広葉樹: 今のゲームの木（丸い塊）に短い幹を足した形。針葉樹: 幹と3段の円すい。熱帯雨林の高木: 細く高い幹の上に平たい樹冠、下に低い樹冠。
     ヤシ: 曲がった幹と放射の葉。下生え: 低い茂み */
  obTreeBroad:()=>[tone(at(new THREE.CylinderGeometry(.06,.09,.4,5),0,.2,0),OT.trunk), tone(obBlob(.5,.55,.5,0,.85,0),OT.broad), tone(obBlob(.32,.34,.32,.22,.6,.12),OT.broad2)],
  obTreeConifer:()=>[tone(at(new THREE.CylinderGeometry(.05,.08,.5,5),0,.25,0),OT.trunk), ...[[.46,.75,.6],[.36,.65,1.05],[.24,.6,1.5]].map(([r,h,y],i)=>tone(at(new THREE.ConeGeometry(r,h,6),0,y,0),i%2?OT.fir2:OT.fir))],
  obTreeRain:()=>[tone(at(new THREE.CylinderGeometry(.05,.1,1.7,5),0,.85,0),OT.trunk), tone(obBlob(.62,.24,.62,0,1.85,0),OT.rain), tone(obBlob(.36,.2,.36,.2,2.02,-.1),OT.rain2),
    tone(obBlob(.4,.3,.4,-.2,.75,.15),OT.rain2), tone(obBlob(.34,.26,.34,.24,.5,-.2),OT.rain), ...[[-.5,.3],[.5,-.2]].map(([x,z])=>tone(limb([0,.03,0],[x,.0,z],.07,.02),OT.trunk))],
  obPalm:()=>[tone(limb([0,0,0],[.08,.7,0],.07,.055),OT.trunk), tone(limb([.08,.7,0],[.2,1.35,0],.055,.045),OT.trunk),
    ...[...Array(7)].map((_,i)=>{ const a=i/7*Math.PI*2, g=plate([[0,0],[.07,.25],[0,.6],[-.07,.25]],.02); g.rotateX(.5); g.rotateY(a); g.translate(.2,1.36,0); return tone(g,i%2?OT.rain2:OT.rain); }), tone(obBlob(.07,.07,.07,.2,1.34,0),OT.trunk)],
  obUnder:()=>[tone(obBlob(.34,.2,.3,-.12,.17,0),OT.rain2), tone(obBlob(.26,.16,.26,.22,.13,.1),OT.rain), tone(obBlob(.2,.13,.2,0,.1,-.24),OT.broad2)],
  /* 見本用の森: 今のゲームの森（丸い塊だけ）、広葉樹、針葉樹、熱帯雨林、ヤシの林。端に戦車4両 */
  obForestOld:()=>obForest(()=>null,61), obForestBroad:()=>obForest(r=>'obTreeBroad',62), obForestConifer:()=>obForest(r=>r<.92?'obTreeConifer':'obTreeBroad',63),
  obForestRain:()=>obForest(r=>r<.45?'obTreeRain':r<.7?'obTreeBroad':r<.82?'obPalm':'obUnder',64,1.5), obForestPalm:()=>obForest(r=>r<.75?'obPalm':'obUnder',65,.6),
  /* 四角でない建物の見本: 台形（放射状の区画）、くさび、ゆがんだ四辺形、段のある塔 */
  obLotTrap:()=>obLot([[-.3,-.4],[.3,-.4],[.5,.4],[-.5,.4]],.85), obLotWedge:()=>obLot([[-.45,-.4],[.5,-.15],[.45,.4],[-.3,.35]],.6), obLotSkew:()=>obLot([[-.5,-.3],[.35,-.45],[.5,.3],[-.4,.45]],.34,{roof:1}),
  obLotTower:()=>obLot([[-.3,-.4],[.3,-.4],[.5,.4],[-.5,.4]],1.5,{set:1}), obLotSuper:()=>obLot([[-.4,-.45],[.45,-.3],[.4,.45],[-.45,.3]],2.1,{set:2}),
  /* ---- 壊れた建物・スラム・炎（第6回、2026-11-16。docs/models.md 16.6）---- */
  obRuinLow:()=>obRuinSq('obShop',1,obRnd(71)), obRuinMid:()=>obRuinSq('obApart',1,obRnd(72)), obRuinTower:()=>obRuinSq('obTower',1,obRnd(73)),
  obRuinFlat:()=>obRuinSq('obTower',2,obRnd(74)), obRubble:()=>obRuinSq('obShop',3,obRnd(75)),
  obCrater:()=>[tone(at(new THREE.CylinderGeometry(.42,.6,.07,10),0,.035,0),[.62,.54,.42]), tone(at(new THREE.CylinderGeometry(.38,.2,.05,10),0,.05,0),[.3,.26,.22])],
  obCityEA2D1:()=>obCity(5,OB_PICK.EA[1],32,{hw:1,dmg:1}), obCityEA2D2:()=>obCity(5,OB_PICK.EA[1],32,{hw:1,dmg:2}),
  obOrgEA2D1:()=>obCityFree('org','EA',2,52,{dmg:1}), obOrgEA2D2:()=>obCityFree('org','EA',2,52,{dmg:2}),
  obSlum:()=>obSlumQ(OB_SQ.map(([x,z])=>[x*1.2,z*1.2]),obRnd(81)), obSlumStack:()=>obSlumStack(),
  obSlumTown:()=>obCityFree('org','EA',1,82,{slum:-1}), obOrgEA2S:()=>obCityFree('org','EA',2,52,{slum:.6}), obCityEA2S:()=>obCity(5,OB_PICK.EA[1],32,{hw:1,slum:1}),
  obFireS:()=>[tone(at(new THREE.CylinderGeometry(.3,.34,.02,10),0,.01,0),[.3,.27,.24])], obFireL:()=>[tone(at(new THREE.CylinderGeometry(.6,.66,.02,12),0,.01,0),[.3,.27,.24])],
  obFireHouse:()=>[tone(obx(1.6,.02,1.4,0,-.02,0),[.6,.66,.48]), ...GROUND_SHAPES.obFarmCN()],
  obFireTank:()=>[tone(obx(1.8,.02,2.8,0,-.02,.3),[.6,.66,.48]), ...obDim(GROUND_SHAPES.tankE(),.45)],
  obFireTanks:()=>[tone(obx(1.6,.02,1.4,0,-.02,0),.7), ...GROUND_SHAPES.obTanks()],
  obFireForest:()=>{ const P=[], put=obPut(P), r=obRnd(91); P.push(tone(obx(3.4,.02,2.4,0,-.02,0),[.56,.62,.44]));
    for(let i=0;i<5;i++) for(let j=0;j<3;j++) put(GROUND_SHAPES[r()<.8?'obTreeConifer':'obTreeBroad'](),-1.3+i*.65+(r()-.5)*.25,-.75+j*.75+(r()-.5)*.25,.5+r()*.2); return P; },
  /* 目印の建物の半壊（2026-11-16。ユーザー「真ん中のランドマークの半壊モデルも」）。元の形が分かるように、折れた所・残った骨組み・落ちた上半分で壊れを見せる。
     obCut: 先細りの八角の塔を高さ hc で折る（割れ口は暗い）。obSkirt: すそのがれき */
  obSuperRuin:()=>{ const sec=(y0,y1,r0,r1)=>{ const g=loft([[y0,r0,r0],[y1,r1,r1]],O8); g.rotateX(-Math.PI/2); return g; };
    return [...obSkirt(1.5), obx(.95,.2,.95,0,0,0), tone(obx(.97,.02,.97,0,.2,0),.7), tone(sec(.2,1.7,.36,.3),GL), tone(sec(1.7,1.95,.3,.285),GL), tone(at(obPrism(.27,.27,.03,O8),0,1.94,0),DK),
      tone(at(sec(1.9,2.75,.15,.05),.12,0,.08),.5),                                                               // 残った芯
      ...[0,1,2,3].map(i=>at(obx(.05,i%2?2.6:1.85,.05,.3,.2,0).rotateZ(.083),0,0,0,0,i*Math.PI/2+Math.PI/8,0)),      // 骨組みは2本が割れ口の上まで残る
      ...[1,1.7].map(y=>at(obPrism(.33-.055*(y-.2),.33-.055*(y-.2),.04,O8),0,y,0)),
      tone(at(loft([[0,.2,.2],[.75,.11,.11],[1.05,.05,.05]],O8),.74,.2,-.6,0,.5,0),.36), tone(obBlob(.2,.1,.18,.62,.05,-.5),.58), tone(obBlob(.16,.09,.16,1.2,.05,-.05),.58)]; },   // 落ちた上半分
  obMegaRuin:()=>{ const tw=(x,z,H,hc)=>{ const rr=y=>y<H*.6?.2-(.03)*(y-.2)/(H*.6-.2):.17-.08*(y-H*.6)/(H*.4), S=[[.2,.2,.2]]; if(hc>H*.6) S.push([H*.6,.17,.17]); S.push([hc,rr(hc),rr(hc)]);
        const g=loft(S,O8); g.rotateX(-Math.PI/2); g.translate(x,0,z); return [tone(g,GL), hc<H?tone(at(obPrism(rr(hc)*.9,rr(hc)*.9,.03,O8),x,hc-.01,z),DK):at(obPrism(.1,.1,.04,O8),x,H,z)]; };
    return [...obSkirt(1.55), obx(1,.2,1,0,0,0), tone(obx(1.02,.02,1.02,0,.2,0),.7), ...tw(0,.27,3.6,3.6), ...tw(-.25,-.17,3.1,1.55), ...tw(.25,-.17,2.7,2.3),
      at(obPrism(.46,.46,.07,O8),0,1.1,0), tone(at(obPrism(.47,.47,.03,O8),0,1.12,0),GL), at(obPrism(.3,.3,.07,O8),.125,2,.05), tone(at(obPrism(.31,.31,.03,O8),.125,2.02,.05),GL),   // 上の輪は半分だけ残る
      tone(at(loft([[0,.15,.15],[1.2,.09,.09]],O8),-.75,.16,-.55,0,-.6,0),.36), tone(obBlob(.2,.1,.18,-.6,.05,-.62),.58), tone(obBlob(.17,.09,.15,.72,.05,.3),.58)]; },
  obArcoRuin:()=>[...obSkirt(1.6), ...[[1,0,.5],[.8,.5,.5]].flatMap(([w,y,h])=>[obx(w,h,w,0,y,0), tone(obx(w+.01,h*.5,w+.01,0,y+h*.3,0),GL), tone(obx(w,.02,w,0,y+h,0),.5)]),
    obx(.34,.5,.6,-.13,1,0), tone(obx(.35,.25,.61,-.13,1.15,0),GL), tone(obx(.3,.02,.56,-.13,1.5,0),DK), obx(.2,.42,.3,-.2,1.5,-.1), tone(obx(.16,.02,.26,-.2,1.92,-.1),DK),    // 3段目は半分、頂は割れた芯
    tone(obBlob(.2,.1,.2,.22,1.06,.1),.58), tone(obBlob(.15,.08,.14,.2,1.05,-.2),.58), tone(obBlob(.22,.11,.2,.62,.06,.6),.58), tone(obBlob(.18,.1,.2,-.7,.05,-.4),.58)],
  obTwinRuin:()=>{ const tw=(x,h,z,cut)=>[at(obPrism(.19,.19,h,O8),x,0,z), tone(at(obPrism(.195,.195,h*.82,O8),x,h*.1,z),GL), cut?tone(at(obPrism(.17,.17,.03,O8),x,h,z),DK):at(obPrism(.2,.2,.04,O8),x,h,z)];
    return [...obSkirt(1.5), obx(1,.16,.8,0,0,0), tone(obx(1.02,.02,.82,0,.16,0),.7), ...tw(-.26,2.3,.08), ...tw(.26,1.05,-.08,true), obx(.2,.1,.14,-.1,1.35,0),
      tone(at(obPrism(.17,.17,.7,O8),.72,.17,-.4,Math.PI/2-.12,.5,0),.36), tone(obBlob(.18,.1,.16,.6,.05,.3),.58)]; },
  obOrgEA3D1:()=>obCityFree('org','EA',3,53,{dmg:1}),
  obCityEA2D1F:()=>GROUND_SHAPES.obCityEA2D1(), obCityEA2D2F:()=>GROUND_SHAPES.obCityEA2D2(), obOrgEA2D1F:()=>GROUND_SHAPES.obOrgEA2D1(), obOrgEA2D2F:()=>GROUND_SHAPES.obOrgEA2D2(), obSuperRuinF:()=>GROUND_SHAPES.obSuperRuin(),
  /* 見本用: 町の並び（ゲームの置き方と同じ決まりで並べる）。今の灰色の箱、中東、華南、広州、港と基地。手前の4両は戦車（大きさの比べ用） */
  obTownOld:()=>obTown(()=>null),
  obTownME:()=>obTown(r=>r<.55?'obHouseFlat':r<.85?'obBlockFlat':r<.93?'obDome':'obShop'),
  obTownCN:()=>obTown(r=>r<.4?'obShop':r<.8?'obApart':r<.9?'obBlockFlat':'obWarehouse'),
  obTownCity:()=>obTown(r=>r<.3?'obApart':r<.6?'obTower':r<.75?'obTowerTwin':r<.9?'obShop':'obBlockFlat'),
  obTownPort:()=>obTown(r=>r<.2?'obWarehouse':r<.35?'obContainers':r<.5?'obTanks':r<.6?'obCrane':r<.7?'obFactory':r<.78?'obHangar':r<.84?'obControl':r<.9?'obHQ':r<.95?'obRadar':'obDepot'),
};
/* formations: where each body of a unit stands, in model units before the size is applied (x to the right, z forward; a
   vehicle is about 2 long and 1 wide). A unit on the map is a company; it is drawn as one platoon of its arm (user decision
   2026-11-12: the number that fits the arm) */
/* 巡洋艦・戦艦の作り直しの見本の部品（docs/models.md 15.24）
   EDK / eHull: the Earth's hull with a flat weather deck above and the pointed keel below (a sea ship's deck on a space hull); gives
     the deck's height, the half width, the keel and the lower face's height at x for any z. eStack: a raked radiator tower (the
     funnel of a sea ship) standing on y at z, with a dark top and dark radiator faces on both sides
 */
const EDK=[[.7,1],[1,.3],[1,-.38],[0,-1],[-1,-.38],[-.5,1]];
const eHull=S=>{ const sz=z=>{ if(z<=S[0][0]) return S[0]; for(let i=0;i<S.length-1;i++){ const a=S[i], b=S[i+1]; if(z<=b[0]){ const t=(z-a[0])/(b[0]-a[0]); return [z,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,(a[3]||0)+((b[3]||0)-(a[3]||0))*t]; } } return S[S.length-1]; };
  return {parts:[loft(S,EDK)], w:z=>sz(z)[1], top:z=>{ const s=sz(z); return (s[3]||0)+s[2]; }, keel:z=>{ const s=sz(z); return (s[3]||0)-s[2]; },
    low:(x,z)=>{ const s=sz(z); return (s[3]||0)-s[2]*(1-.62*x/s[1]); } }; };
/* deckHull (15.26): a hull that follows a flight deck's outline D ([x, z]) — rings of the outline scaled about x 0 and z 0 at each
   level L [y, sx, sz], from the deck edge down to a narrow flat keel; capped above and below */
const deckHull=(D,L)=>{ const R=L.map(([y,sx,sz])=>D.map(([x,z])=>new THREE.Vector3(x*sx,y,z*sz))), P=[], n=D.length;
  const tri=(a,b,c,out)=>{ const v=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)); if(v.dot(out)<0) P.push(a,c,b); else P.push(a,b,c); };
  let ar=0; for(let j=0;j<n;j++){ const k=(j+1)%n; ar+=D[j][0]*D[k][1]-D[k][0]*D[j][1]; } const sg=ar>0?1:-1;
  for(let i=0;i<R.length-1;i++) for(let j=0;j<n;j++){ const k=(j+1)%n, A=R[i][j], B=R[i][k], C=R[i+1][k], E=R[i+1][j], out=new THREE.Vector3(sg*(B.z-A.z),0,-sg*(B.x-A.x)); tri(A,B,C,out); tri(A,C,E,out); }
  for(const [r,dy] of [[R[0],1],[R[R.length-1],-1]]) for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(r.map(v=>new THREE.Vector2(v.x,v.z)),[])) tri(r[a],r[b],r[c],new THREE.Vector3(0,dy,0));
  const g=new THREE.BufferGeometry(); g.setFromPoints(P); g.computeVertexNormals(); return g; };
/* lSki・lLeg: ゲームでは使わない。設定の絵（15.25）。 */
const lSki=(x,y,z0,z1,w,d=1)=>{ const p=[tone(at(box(w,.02,z1-z0),x,y,(z0+z1)/2),DK)]; let py=y, pz=d>0?z1-.005:z0+.005; for(const a of [.1,.22,.33]){ const L=.06;
    p.push(tone(at(box(w,.02,L+.01),x,py+L/2*Math.sin(a),pz+d*L/2*Math.cos(a),-d*a),DK)); py+=L*Math.sin(a); pz+=d*L*Math.cos(a); } return p; };
const lLeg=(x,yt,zt,yd,zd,yf,zf)=>[...[.045,-.045].map(dx=>at(barG([x+dx,yt,zt],[x,yf,zf],.014,.014),0,0,0)), at(barG([x,yd,zd],[x,yf,zf],.012,.012),0,0,0),
  at(box(.055,.01,.01),x,yt+(yf-yt)*.4,zt+(zf-zt)*.4), at(barG([x,yt+(yf-yt)*.4,zt+(zf-zt)*.4],[x,yd+(yf-yd)*.4,zd+(zf-zd)*.4],.008,.008),0,0,0), tone(at(box(.04,.03,.04),x,yf,zf),DK)];
const eStack=(y,z,w,h,l,rk=.28)=>{ const c=Math.cos(rk), s=Math.sin(rk), P=(g,d,dx=0)=>at(g,dx,y+d*c,z-d*s,-rk);
  return [P(box(w,h,l),h/2-.01), tone(P(box(w*1.08,.03,l*1.06),h),DK), ...[1,-1].map(sg=>tone(P(box(.012,h*.6,l*.7),h*.5,sg*w/2),DK))]; };
const mBoth=(M,p,z,x=0)=>[...p().map(g=>{ g.translate(x,M.top(z)-.004,0); return g; }), ...M.under(p(),z,-x)];
/* mCT (見本 第3回, 15.24): the Republic's cruiser and battleship as flat planes — three sections only, so the side view is one peak
   with a straight line down to the cut bow and another down to the stern; a slab belt on the sides, a narrow flat ridge above and
   below (the same both ways up). A dark sensor band before the peak and a sensor bar at the bow. rail: the forward wedge is the
   railgun — the bow face is the muzzle and the rails lie flush in the ridge from the bow to the peak, above and below */
const CTU=[[.45,1],[1,.15],[-1,.15],[-.45,1]], CTB=[[1,.15],[1,-.15],[-1,-.15],[-1,.15]], CTL=[[1,-.15],[.45,-1],[-.45,-1],[-1,-.15]];
function mCT(o){ const S=o.S, M=mA(S), W=z=>M.at(z).w, zp=S[1][0], z1=S[2][0], th=Math.atan2(S[1][2]-S[2][2],z1-zp), L=Math.hypot(z1-zp,S[1][2]-S[2][2]), zc=zp+(z1-zp)*.6, yc=S[1][2]+(S[2][2]-S[1][2])*.6;
  const rails=()=>[...[1,-1].map(sg=>tone(at(box(.024,.014,L*.72),sg*.032,yc+.004,zc,th),.55)), tone(at(box(.04,.008,L*.72),0,yc+.002,zc,th),DK)];
  return [loft(S,CTU), tone(loft(S,CTB),.86), tone(loft(S,CTL),.72), ...mEng(...o.eng),
    ...mBoth(M,()=>[tone(at(box(W(zp)*.9+.02,.016,.1),0,.006,zp+.1),GL)],zp+.1), ...mBoth(M,()=>[tone(at(box(W(z1-.08)*.9+.01,.014,.035),0,.006,z1-.08),GL)],z1-.08),
    ...(o.rail?[...rails(), ...flipY(rails()), tone(at(box(W(z1)*1.3,S[2][2]*1.3,.02),0,0,z1+.004),DK)]:[]),
    ...o.guns.flatMap(([z,s,n,rear])=>mBoth(M,()=>mGun(0,0,z,s,n,rear),z)), ...M.side(o.side,.05),
    ...o.pd.flatMap(z=>mBoth(M,()=>mPD(0,0,z,.9),z)), ...o.gat.flatMap(z=>M.under(mGat(0,0,z,.95),z)),
    ...[1,-1].map(sg=>tone(at(box(.014,M.at(o.rad).h*.26,.34),sg*(W(o.rad)-.004),0,o.rad),DK))]; }
/* mBB5 (見本 第4回, 15.24): the Republic's battleship in the language of its other ships — a slim creased hull with a level back and a
   cut bow. The railgun lies level along the back from the middle to past the bow: a low fairing in one piece with the hull, two
   rails with a dark slot, clamp bands, a dark breech at its root and a dark muzzle. A short cropped-delta wing (after the F-16's)
   on each side carries the bridge: a low command hump with an optical band on each wing, dark radiator panels behind it */
function mBB5(){ const M=mA([[-1.35,.22,.12],[-.7,.3,.17],[.5,.3,.17],[1.1,.24,.15],[1.45,.18,.13]]), m=.05, W=z=>M.at(z).w, ty=.17, z0=-.3, z1=1.5, zc=(z0+z1)/2, L=z1-z0;
  const gun=[loft([[z0,.1,.05,ty+.03],[z0+.12,.13,.05,ty+.03],[1.1,.13,.05,ty+.03],[z1-.03,.11,.05,ty+.03]],FACET),
    ...[1,-1].map(sg=>tone(at(box(.04,.03,L-.1),sg*.055,ty+.09,zc+.03),.55)), tone(at(box(.07,.012,L-.12),0,ty+.082,zc+.03),DK),
    ...[.0,.35,.7,1.05,1.36].map(z=>at(box(.2,.03,.05),0,ty+.092,z)), tone(at(box(.22,.09,.16),0,ty+.045,z0-.02),DK), tone(at(box(.17,.085,.03),0,ty+.045,z1-.02),DK)];
  const wing=pair(at(plate([[.26,.34],[.3,.14],[.37,-.06],[.47,-.25],[.57,-.4],[.64,-.5],[.66,-.58],[.63,-.66],[.52,-.71],[.26,-.77]],.05),0,.01,0));
  const dome=(rx,ry,rz)=>{ const g=new THREE.SphereGeometry(1,10,5,0,Math.PI*2,0,Math.PI/2); g.scale(rx,ry,rz); return g; };
  const bridge=sg=>[at(dome(.085,.065,.2),sg*.43,.03,-.42), tone(at(dome(.06,.052,.11),sg*.43,.03,-.29),GL), tone(at(box(.12,.008,.08),sg*.4,.037,-.68),DK)];
  return [...M.hull(), ...gun, ...wing, ...bridge(1), ...bridge(-1), ...M.eyes(1.25), ...mEng([.14,0,-.14],-1.35,.065),
    at(box(.26,.05,.3),0,M.top(-.62)+.02,-.62), ...mGun(0,M.top(-.62)+.04,-.62,1.3,2), ...mGun(0,M.top(-1.08)-.004,-1.08,1.2,2,true),
    ...mPair(mPD,.2,M.top(-.9)-.004,-.9,.95), ...mPair(mPD,.2,ty-.004,.3,.95),
    ...M.under(mGun(0,0,m,1.25,2),m), ...M.under(mGun(0,0,-.75,1.1,2,true),-.75), ...M.side(()=>mGun(0,0,.4,.7),.4),
    ...[.5,-.35].flatMap(z=>[1,-1].flatMap(sg=>M.under(mGat(0,0,z,.95),z,sg*W(z)*.55)))]; }
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
   {key, size, form, move:[keys]}, or {earth:spec, mars:spec} when the two sides have their own shapes. key: in GROUND_SHAPES; size: scale of
   the model in the ground board's units (4 units = 1 km); form: a name in GROUND_FORMS (default one). A kind that is not listed
   keeps the old drawing (the carrier and the assault ship on the sea). The user approved sample round 14 (version 20) on
   2026-11-13 (docs/models.md 12); the entries are the ones that sample used (docs/mockups/models/pilot-override.txt). Sizes: a trooper
   .32 × 1.57 units is about 2 m, the W.A.S. .75 × 1.45 about 4.3 m */
const GROUND_MODELS={
  vehicle:{earth:{key:'tankE',size:.5,form:'wedge4'},mars:{key:'tankM',size:.45,form:'wedge4'}},
  apc:{earth:{key:'apcE',size:.5,form:'box4'},mars:{key:'apcM',size:.5,form:'box4'}},
  artillery:{earth:{key:'spgE',size:.5,form:'line3'},mars:{key:'spgM',size:.48,form:'line3'}},
  guidedRocket:{earth:{key:'mlrsE',size:.5,form:'line3'},mars:{key:'mlrsM',size:.48,form:'line3'}},
  mobileAA:{earth:{key:'aaE',size:.5,form:'line3'},mars:{key:'aaM',size:.48,form:'line3'}},
  scout:{earth:{key:'scoutE',size:.45,form:'wedge3'},mars:{key:'scoutM',size:.45,form:'wedge3'}},
  engineer:{earth:{key:'engE',size:.5,form:'line3'},mars:{key:'engM',size:.48,form:'line3'}},
  supply:{earth:{key:'supE',size:.5,form:'box4'},mars:{key:'supM',size:.5,form:'box4'}},
  infantry:{key:'infF',size:.32,form:'squad6',move:['infW','infW2']},
  commando:{key:'cmdF',size:.32,form:'squad6',move:['cmdW','cmdW2']},
  heavyInfantry:{key:'hinf',size:.32,form:'squad6',move:['hinf','hinf2']},
  mechanicalAssault:{key:'mechA',size:.32,form:'squad6',move:['mechA','mechB']},
  droneHive:{key:'hive',size:.7,form:'one'},
  was:{key:'was4',size:.75,form:'wedge3'},
  fighter:{earth:{key:'ftrE',size:.6,form:'flight4'},mars:{key:'ftrM',size:.6,form:'flight4'}},
  attack:{earth:{key:'atkE',size:.6,form:'flight4'},mars:{key:'atkM',size:.6,form:'flight4'}},
  supportAircraft:{earth:{key:'awE',size:1,form:'one'},mars:{key:'awM',size:1,form:'one'}},
  /* sea ships and the assault carrier (docs/models.md 13・14, approved 2026-11-13): one shape for both sides, at today's size
     (SHIP_SIZE), one ship per unit. The carrier and the assault ship on the sea (sea:cvb, sea:mas) keep the old drawing */
  'sea:bb':{key:'seaBB',size:2.04,form:'one'},
  'sea:cl':{key:'seaCL',size:1.44,form:'one'},
  'sea:ff':{key:'seaFF',size:.84,form:'one'},
  'sea:dd':{key:'seaDD',size:1.02,form:'one'},
  'sea:masc':{earth:{key:'masc3',size:1.92,form:'one',y:.14},mars:{key:'masc3M',size:1.92,form:'one',y:.04}},
};
/* space ship class → the shape each side draws (docs/models.md 15.23; battle/units.js shipMeshes and shipMeshKey). y: moved up or down
   to centre the shape in space */
const SPACE_MODELS={cv:{earth:'spCV',mars:'spCVM'}, ff:{earth:'spFF',mars:'spFFM'}, dd:{earth:'spDD',mars:'spDDM'},
  cl:{earth:'spCL3',mars:'spCLM4a'}, bb:{earth:'spBB3',mars:'spBBM5'}, cvb:{earth:'spCVB4',mars:'spCVBM2'},
  mas:{earth:'spMAS',mars:'spMASM'}, masc:{earth:'masc3',mars:'masc3M',y:-.10}};
/* ?groundModels=kind:key:size:form[:move],kind@mars:key:size:form in the page address overrides the table (for sample shots
   only); an entry without @side applies to both sides. Returns {key,move,size,form,offsets} or null. key is the
   shape when the unit stands or fights. move: the keys of the shapes shown while it is moving (in the table an array, in the
   address joined with +; empty: the same shape always). With two or more, each body of the unit steps through them on its
   own clock (the steps of a walk), starting at a random one, so the bodies are out of step with each other */
function groundModelFor(kind,side='earth'){
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k), done=m=>m&&has(GROUND_SHAPES,m.key)?{key:m.key,move:(Array.isArray(m.move)?m.move:String(m.move||'').split('+')).filter(k=>has(GROUND_SHAPES,k)),size:Number.isFinite(+m.size)&&+m.size>0?+m.size:1,form:has(GROUND_FORMS,m.form)?m.form:'one',offsets:GROUND_FORMS[has(GROUND_FORMS,m.form)?m.form:'one'],y:Number.isFinite(+m.y)?+m.y:0}:null;
  const q=typeof location!=='undefined'&&new URLSearchParams(location.search).get('groundModels');
  if(q) for(const who of [kind+'@'+side,kind]) for(const s of q.split(',')){
    if(!s.startsWith(who+':')) continue;
    const [key,size,form,move]=s.slice(who.length+1).split(':'), m=done({key,size,form,move}); if(m) return m;
  }
  const m=GROUND_MODELS[kind]; return done(m&&(m.earth||m.mars)?m[side]:m);
}
/* ---- 炎と煙（効果。2026-11-16、docs/models.md 16.6）----
   建物の形（灰色の1つの網）とは別の、光らせて時間で動かす網。groundFire(points) が {group, update(t)} を返す。
   points は [x, y, z, 大きさ, 煙(0で無し)]。炎は外・中・芯の3色の舌と脇の小さな舌、煙は上って薄れる塊。
   GROUND_FIRES: 見本の鍵 → 炎を置く点（見本の道具が読む）。ゲームにはまだ入れていない。 */
const GROUND_FIRES={ obFireS:[[0,0,0,.45]], obFireL:[[0,0,0,.8],[.5,0,.25,.6],[-.45,0,-.3,.55],[-.1,0,.45,.45,0]],
  obFireHouse:[[0,.3,-.26,.42],[-.3,.2,.18,.26,0]], obFireTank:[[0,.3,-.1,.4]], obFireTanks:[[0,.3,.26,.8],[-.28,.3,-.2,.5,0]],
  obFireForest:[[-.6,.45,0,.55],[.1,.45,-.6,.45],[.7,.4,.5,.5,0],[-1.2,.3,.6,.3,0]] };
/* 壊れた町に置く炎: 町の中に n か所（盤目は四角 half、ほかは半径 R の中）。大きさと煙の有無は乱数 */
const obFirePts=(seed,n,R,sq)=>{ const r=obRnd(seed), P=[]; while(P.length<n){ const x=(r()*2-1)*R, z=(r()*2-1)*R; if(!sq&&Math.hypot(x,z)>R) continue; P.push([x,.15,z,.6+r()*.7,r()<.75?1:0]); } return P; };
Object.assign(GROUND_FIRES,{ obCityEA2D1F:obFirePts(101,7,4.6,true), obCityEA2D2F:obFirePts(102,12,4.6,true), obOrgEA2D1F:[[0,2.3,0,.7],...obFirePts(103,6,5)], obOrgEA2D2F:[[0,2.3,0,.7],...obFirePts(104,11,5)], obSuperRuinF:[[0,1.9,0,.5],[.7,.3,-.5,.35,0]] });
let groundFireGeo=null;
function groundFire(points){
  if(!groundFireGeo){ const H=[...Array(6)].map((_,i)=>[Math.cos(i*Math.PI/3),Math.sin(i*Math.PI/3)]), tongue=loft([[0,.3,.3],[.2,.46,.46],[.5,.3,.3],[.78,.13,.13],[1,0,0]],H); tongue.rotateX(-Math.PI/2);
    groundFireGeo={tongue, puff:new THREE.IcosahedronGeometry(1,0), mats:[0xff4a14,0xff9422,0xffe27a].map(c=>new THREE.MeshBasicMaterial({color:c,toneMapped:false}))}; }
  const group=new THREE.Group(), tongues=[], puffs=[];
  points.forEach(([x,y,z,s,smoke=1],pi)=>{
    [[0,0,1,0],[.05,.03,.66,1],[0,.02,.36,2],[.36,-.1,.5,0],[-.3,.16,.42,0],[-.12,-.22,.3,1]].forEach(([dx,dz,k,m],i)=>{ const mesh=new THREE.Mesh(groundFireGeo.tongue,groundFireGeo.mats[m]);
      mesh.position.set(x+dx*s,y,z+dz*s); mesh.renderOrder=m; group.add(mesh); tongues.push({mesh,w:s*k*1.05,h:s*k*1.55,ph:pi*2.1+i*1.3}); });
    if(smoke) for(let i=0;i<5;i++){ const mesh=new THREE.Mesh(groundFireGeo.puff,new THREE.MeshBasicMaterial({color:0x4c4c52,transparent:true,depthWrite:false,toneMapped:false}));
      group.add(mesh); puffs.push({mesh,x,y,z,s,ph:(i+pi*.37)/5}); } });
  function update(t){
    for(const f of tongues){ const a=Math.sin(t*9+f.ph), b=Math.sin(t*15.7+f.ph*2.3); f.mesh.scale.set(f.w*(1-.1*a),f.h*(1+.2*a+.1*b),f.w*(1-.1*a)); f.mesh.rotation.set(.1*Math.sin(t*6.3+f.ph*1.7),0,.13*Math.sin(t*5+f.ph)); }
    for(const p of puffs){ const u=(t*.22+p.ph)%1, k=p.s*(.3+u*.75); p.mesh.position.set(p.x+p.s*u*u*1.6,p.y+p.s*(1.1+u*3.6),p.z+p.s*u*.3); p.mesh.scale.set(k,k*.8,k); p.mesh.rotation.y=p.ph*9+u; p.mesh.material.opacity=.75*(1-u)*Math.min(1,u*5); }
  }
  update(0); return {group,update};
}
/* 動く車両の組み立て（ユーザー 2026-11-17「砲塔そして仰角が動くように」）。鍵 → 砲塔の軸 turret [x,z]（無ければ車体と一体）、
   砲の軸 gun [y,z]（x は砲塔の軸と同じ）、built: 形に付けてある仰角、el: 動かせる仰角 [下,上]（ラジアン。仮）。
   自走砲とロケット砲は砲塔なし（車体ごと向く）。狙う順は 仰角 → 砲塔 → 車体。
   groundRig(key) は {hull, turret, gun（網の形。無ければ null）, turretAt, gunAt（砲塔の軸から）, el, muzzle（砲の軸から砲口までの長さ）} を返す。
   置き方: 車体の下に砲塔の節（turretAt、rotation.y が向き）、その下に砲の節（gunAt、rotation.x が −仰角）。 */
const GROUND_RIG={ tankE:{turret:[0,-.1],gun:[.475,.52],el:[-.12,.35]}, tankM:{turret:[0,-.3],gun:[.45,.24],el:[-.1,.35]},
  apcE:{turret:[.14,-.3],gun:[.645,-.24],el:[-.1,.9]}, apcM:{turret:[0,-.32],gun:[.58,-.26],el:[-.1,.9]},
  spgE:{gun:[.6,.16],built:.2,el:[0,1.1]}, spgM:{gun:[.6,.3],built:.22,el:[0,1.1]},
  aaE:{turret:[0,-.08],gun:[.52,-.02],built:.45,el:[-.05,1.45]}, aaM:{turret:[0,-.2],gun:[.52,-.2],built:.3,el:[-.05,1.45]},
  mlrsE:{gun:[.36,-.92],built:.3,el:[0,1]}, mlrsM:{gun:[.4,-.9],built:.16,el:[0,1]},
  scoutE:{turret:[.1,-.1],gun:[.64,-.1],el:[-.1,.9]}, scoutM:{turret:[0,-.22],gun:[.53,-.18],el:[-.1,.9]} };
function groundRig(key){ const R=GROUND_RIG[key]; if(!R) return null;
  const parts=GROUND_SHAPES[key](), by={hull:[],turret:[],gun:[]}, [tx,tz]=R.turret||[0,R.gun[1]], [gy,gz]=R.gun;
  for(const g of parts) by[g.userData.part||'hull'].push(g);
  for(const g of by.turret) g.translate(-tx,0,-tz);
  for(const g of by.gun){ g.translate(-tx,-gy,-gz); if(R.built) g.rotateX(R.built); }
  const join=l=>l.length?groundJoin(l):null, gun=join(by.gun); gun.computeBoundingBox();
  return {hull:join(by.hull), turret:join(by.turret), gun, hasTurret:!!R.turret, turretAt:[tx,0,tz], gunAt:[0,gy,gz-tz], el:R.el, muzzle:gun.boundingBox.max.z}; }
/* 艦の砲塔の組み立て。鍵の形を、動かない艦体（hull）と、砲塔ごとの旋回する部分（house）・砲（gun）に分ける。どれも艦の座標のまま。
   砲塔ごとの M は砲塔の座標 → 艦の座標（向きと位置。裏返しを含むことがある）、pivot は砲の軸の点（砲塔の座標）。動かすときは
   house に M·Ry(旋回)·M⁻¹、gun に M·Ry(旋回)·T(pivot)·Rx(−(仰角−built))·T(−pivot)·M⁻¹ を掛ける（groundTurretPose）。 */
function groundTurretRig(key){ if(!Object.prototype.hasOwnProperty.call(GROUND_SHAPES,key)) return null;
  const hull=[], T=new Map(), v=new THREE.Vector3();
  for(const g of GROUND_SHAPES[key]()){ const r=g.userData.rig; if(!r){ hull.push(g); continue; } if(!T.has(r.id)) T.set(r.id,{house:[],gun:[]}); const t=T.get(r.id);
    if(r.part!=='frame'){ t[r.part].push(g); continue; }
    const P=g.attributes.position, pt=i=>new THREE.Vector3().fromBufferAttribute(P,i), o=pt(0);
    t.M=new THREE.Matrix4().makeBasis(pt(3).sub(o).normalize(),pt(1).sub(o).normalize(),pt(2).sub(o).normalize()).setPosition(o); t.Mi=t.M.clone().invert();
    t.pivot=pt(4).applyMatrix4(t.Mi); Object.assign(t,{built:r.built,el:r.el,arc:r.arc,rate:r.rate}); g.dispose(); }
  const join=l=>l.length?groundJoin(l):null;
  return {hull:join(hull), turrets:[...T.values()].filter(t=>t.M).map(t=>({...t,house:join(t.house),gun:join(t.gun),yaw:0,elev:t.built}))}; }
/* 砲塔 t を旋回 yaw・仰角 el にしたときの house と gun の行列（艦の座標）を書き込む */
const _tp=[new THREE.Matrix4(),new THREE.Matrix4(),new THREE.Matrix4()];
function groundTurretPose(t,yaw,el,house,gun){ const [R,A,B]=_tp; R.makeRotationY(yaw); house.copy(t.M).multiply(R).multiply(t.Mi);
  gun.copy(t.M).multiply(R).multiply(A.makeTranslation(t.pivot.x,t.pivot.y,t.pivot.z)).multiply(B.makeRotationX(-(el-t.built))).multiply(A.makeTranslation(-t.pivot.x,-t.pivot.y,-t.pivot.z)).multiply(t.Mi); }
function groundShapeGeo(key,mono=false){ return Object.prototype.hasOwnProperty.call(GROUND_SHAPES,key)?groundJoin(GROUND_SHAPES[key](),mono):null; }
