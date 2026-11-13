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
function exoParts(kind,pose){ const heavy=kind===true, cmd=kind==='c', BODY=.16, T=.375, P=EXO_POSE[(heavy?'h':cmd?'c':'')+pose], p=[], U=[], body=g=>tone(g,BODY), HY=.82-P.d, mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
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
      at(box(.42,.2,.26),0,1.5,-.29,-.25), tone(at(box(.36,.14,.02),0,1.535,-.165,-.25),DK), at(box(.1,.18,.1),0,1.33,-.25), tone(discG(0,1.0,-.27,.12,.24),.6)); }
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
    shield2:(T,tilt,grips=[])=>{ const ca=.08, cl=.05, t=.025, R=[-.47,.42], body=[[-.3,.13],[-.14,.185],[.08,.2],[.28,.185],[.42,.13]], tip=[[-.47,.012],[-.4,.06],[-.3,.13]], all=[...tip,...body.slice(1)];
      const Ms=new THREE.Matrix4().compose(new THREE.Vector3(...T),new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt,0,Math.PI/2)),new THREE.Vector3(1,1,1)), Mi=Ms.clone().invert(), SH=g=>{ g=g.index?g.toNonIndexed():g; g.applyMatrix4(Ms); return g; };
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
function wasMix(){ const K=WAS_KIT, p=[], U=[], th=(a,b,r=.028)=>segG(a,b,r,r*.9,5), add=(a,d)=>a.map((v,i)=>v+d[i]), mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const HY=.69, HZ=-.02, lean=a=>new THREE.Matrix4().makeTranslation(0,HY,HZ).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(0,-.84,0)), M=lean(.3), M0=lean(.12), SX=.28, W=v=>new THREE.Vector3(...v).applyMatrix4(M).toArray();
  /* a frame along a forearm: the elbow at the origin, +Z toward the wrist */
  const along=(el,wr)=>new THREE.Matrix4().compose(new THREE.Vector3(...el),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...wr).sub(new THREE.Vector3(...el)).normalize()),new THREE.Vector3(1,1,1));
  for(const sx of [1,-1]){ const hip=[sx*.13,HY,HZ], knee=[sx*.2,.44,.17], ank=[sx*.23,.13,0], S=along(ank,knee), SL=new THREE.Vector3(...knee).distanceTo(new THREE.Vector3(...ank));
    p.push(tone(segG(hip,knee,.042,.042,4),.6), barG(add(mix(hip,knee,.06),[sx*.07,0,0]),add(mix(hip,knee,.8),[sx*.08,0,0]),.022,.075), K.J(...hip,.075,.1), K.J(...knee,.065,.1),
      ...[1,-1].flatMap(f=>{ const o=[0,f*.039,f*.052], a=add(mix(hip,knee,.08),o), b=add(mix(hip,knee,.92),o), m=mix(a,b,.56); return [tone(segG(a,m,.03,.03,6),.35), tone(segG(mix(a,b,.5),m,.037,.037,6),.6), segG(m,b,.014,.014,5)]; }),
      segG(knee,ank,.058,.08,4), K.dk(segG(add(mix(knee,ank,.5),[0,-.02,.06]),add(ank,[0,.05,.08]),.013,.013,4)),
      /* in the shin's own frame (the ankle at the origin, +Z up to the knee, +y behind): the knee guard, thick but drawn out to
         a point above and below; behind the calf a thruster pod faired into the shin, its nozzle below and a fin on its back */
      ...[at(loft([[-.19,.022,.016],[-.06,.066,.05],[.05,.074,.06],[.21,.016,.012,.01]],HEX),0,-.062,SL), at(loft([[-.15,.036,.036],[-.04,.052,.05],[.16,.014,.014,-.02]],HEX),0,.068,SL*.5),
        K.dk(at(taper(.05,.03,.08,6),0,.07,SL*.5-.18)), tone(at(box(.014,.075,.2),0,.13,SL*.5-.02),.75)].map(g=>{ g.applyMatrix4(S); return g; }),
      at(box(.15,.08,.15),ank[0],.075,ank[2]-.01), at(loft([[-.19,.01,.013,-.03],[0,.038,.04]],SLAB),ank[0],.05,ank[2]-.07),
      ...[1,-1].flatMap(f=>[at(loft([[-.02,.042,.046],[.13,.038,.045,.028],[.24,.03,.034,.012]],SLAB),ank[0]+f*.046,.05,ank[2]+.04,0,f*.26,0), tone(at(loft([[.24,.03,.034,.012],[.33,.022,.025,-.004],[.42,.005,.009,-.036]],SLAB),ank[0]+f*.046,.05,ank[2]+.04,0,f*.26,0),.45)]));
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
    ...pair(at(loft([[-.32,.03,.03],[-.1,.07,.07],[.1,.05,.05]],HEX),.17,1.1,-.27,-.5)), ...pair(K.dk(at(new THREE.CylinderGeometry(.04,.065,.1,6),.17,.94,-.55,1.1))),
    ...K.subArms(.9,.115));
  const wing=()=>{ const g=loft([[0,.22,.06],[.1,.19,.056,-.004],[.24,.1,.028,-.026],[.34,.04,.01,-.05],[.41,.006,.003,-.066]],WAS_WING); g.rotateY(Math.PI/2); g.applyMatrix4(new THREE.Matrix4().set(1,0,0,0, 0,1,0,0, -.62,0,1,0, 0,0,0,1)); return g; };
  const guard=()=>{ let g=plate([[.085,.11],[.085,-.09],[-.02,-.075],[-.15,.01],[-.02,.085]],.028); g=g.index?g.toNonIndexed():g; g.rotateZ(Math.PI/2); return g; };
  for(const sx of [1,-1]){ const w=at(sx>0?wing():mirror(wing()),sx*(SX-.08),1.31,-.02);
    U.push(K.J(sx*SX,1.22,-.02,.08,.1), w, at(guard(),sx*(SX+.085),1.2,-.02,0,0,-sx*.15),
      th([sx*.085,1.13,.12],[sx*(SX-.04),1.21,.02],.024), th([sx*.14,1.13,-.15],[sx*(SX-.04),1.21,-.06],.024), K.J(sx*.095,1.13,.12,.035,.05), K.J(sx*.15,1.13,-.15,.035,.05)); }
  for(const g of U) g.applyMatrix4(M);
  p.push(...U);
  /* arms */
  const shR=W([-SX,1.22,-.02]), elR=add(shR,[-.025,-.13,-.02]), wrR=add(elR,[0,0,.36]), shL=W([SX,1.22,-.02]), elL=add(shL,[.025,-.13,-.02]), wrL=add(elL,[.03,-.2,.27]);
  for(const [sh,el,wr] of [[shR,elR,wrR],[shL,elL,wrL]]){ const A=along(el,wr), hand=box(.09,.09,.1).toNonIndexed(); hand.translate(0,0,new THREE.Vector3(...wr).distanceTo(new THREE.Vector3(...el))+.035); hand.applyMatrix4(A);
    p.push(segG(sh,el,.07,.08,4), K.J(...el,.06,.11), segG(el,wr,.06,.085,4), hand); }
  /* right forearm: the guns, parallel to it; the belt sags from the receiver to the drum on the back */
  const AR=along(elR,wrR), b0=new THREE.Vector3(-.125,-.06,-.19).applyMatrix4(AR).toArray(), b3=W([-.1,.99,-.29]), b1=add(b0,[.03,-.15,-.07]), b2=[(b0[0]+b3[0])/2+.04,Math.min(b0[1],b3[1])-.17,(b0[2]+b3[2])/2-.05];
  p.push(...K.guns2(-1).map(g=>{ g.applyMatrix4(AR); return g; }), K.dk(segG(b0,b1,.02,.02,5)), K.dk(segG(b1,b2,.02,.02,5)), K.dk(segG(b2,b3,.02,.02,5)));
  /* left forearm: the shield, held by two brackets; over the left shoulder the cannon on its arm, with a brace from the drum */
  const mid=mix(elL,wrL,.5), C=W([SX+.02,1.58,0]);
  p.push(...K.shield2(add(mid,[.1,-.176,.096]),-.5,[mix(elL,wrL,.2),mix(elL,wrL,.85)]), ...K.cannon(...C,W([SX-.1,1.25,-.07])), K.dk(segG(W([.12,1.08,-.27]),[C[0],C[1]-.075,C[2]-.42],.022,.022,5)));
  return p; }
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
const railTurret=(y,z,s=1,rear=false,el=.12)=>seaSet([loft([[-.13,.1,.045,.045],[.04,.11,.045,.045],[.16,.05,.04,.04]],TRAP),
  ...[at(box(.07,.05,.12),0,0,.08), at(box(.045,.012,.46),0,.016,.3), at(box(.045,.012,.46),0,-.016,.3), at(box(.056,.05,.025),0,0,.34), at(box(.056,.05,.025),0,0,.52)].map(g=>tone(at(g,0,.05,.04,-el),DK))],y,z,s,rear);
const gunTurret=(y,z,s=1)=>seaSet([loft([[-.07,.06,.035,.035],[.03,.065,.035,.035],[.1,.03,.03,.03]],TRAP), tone(at(tube(.012,.3,5),0,.04,.2,-.1),DK)],y,z,s,false);
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
const laserT=(x,y,z,s=1,n=1,rear=false,el=.06)=>{ const p=[at(new THREE.CylinderGeometry(.1,.11,.03,8),0,.015,0), loft([[-.12,.09,.04,.06],[.03,.1,.045,.065],[.13,.05,.035,.06]],TRAP), ...pair(at(box(.012,.1,.07),.062,.09,-.08))];
  for(const dx of n>1?[-.035,.035]:[0]) p.push(...[at(tube(.013,.32,6),dx,0,.26), at(tube(.02,.03,6),dx,0,.14), at(tube(.025,.06,6),dx,0,.42)].map(g=>tone(at(g,0,.07,0,-el),DK)));
  return atX(seaSet(p,y,z,s,rear),x); };
const pdG=(x,y,z,s=1)=>atX(seaSet([at(new THREE.CylinderGeometry(.028,.034,.04,6),0,.02,0), at(new THREE.SphereGeometry(.036,6,3,0,Math.PI*2,0,Math.PI/2),0,.035,0),
  ...[-.013,.013].map(dx=>tone(at(tube(.007,.08,4),dx,.05,.045,-.35),DK))],y,z,s,false),x);
const lidsG=(x,y,z0,z1,n,w=.04)=>[...Array(n)].map((_,i)=>tone(at(box(w,.012,(z1-z0)/n*.7),x,y,z0+(z1-z0)*(i+.5)/n),DK));
/* underside weapons (docs/models.md 15.6). flipY: turn parts upside down (x and y change sign). gatG: an interceptor gatling
   standing on y — a low ring, a box, a bundle of six thin dark barrels with a ring at the front. belly: a laser turret hung under
   the keel at y (the keel's height, negative) on a low barbette; gatB: a gatling hung under a surface at y */
const flipY=p=>p.map(g=>{ g.rotateZ(Math.PI); return g; });
const gatG=(x,y,z,s=1)=>atX(seaSet([at(new THREE.CylinderGeometry(.034,.038,.03,8),0,.015,0), at(box(.056,.045,.07),0,.05,0),
  ...[...Array(6)].map((_,i)=>tone(at(tube(.0055,.12,4),Math.cos(i*Math.PI/3)*.014,.05+Math.sin(i*Math.PI/3)*.014,.09),DK)), tone(at(tube(.022,.014,6),0,.05,.125),DK)],y,z,s,false),x);
const belly=(x,y,z,s=1,n=1,rear=false)=>[at(new THREE.CylinderGeometry(.11*s,.11*s,.1*s,8),x,y+.03*s,z), ...flipY(laserT(-x,-(y-.02*s),z,s,n,rear))];
const gatB=(x,y,z,s=1)=>flipY(gatG(-x,-(y+.01),z,s));
/* longT: a big turret with one long gun (the battleship's underside heavy gun, docs/models.md 15.8) standing on y — a broad ring,
   a long faceted house, radiator fins, a long dark barrel of length len with rings at its root, middle and muzzle. bellyL hangs it
   under the keel at y on a barbette */
const longT=(x,y,z,s=1,len=1)=>atX(seaSet([at(new THREE.CylinderGeometry(.12,.13,.035,8),0,.017,0), loft([[-.16,.11,.05,.07],[.06,.12,.055,.075],[.18,.06,.04,.07]],TRAP),
  ...pair(at(box(.012,.11,.09),.075,.1,-.1)), ...[at(tube(.022,len,6),0,0,.15+len/2), at(tube(.032,.08,6),0,0,.2), at(tube(.028,.05,6),0,0,.15+len*.5), at(tube(.036,.1,6),0,0,.12+len)].map(g=>tone(at(g,0,.085,0),DK))],y,z,s,false),x);
const bellyL=(y,z,s=1,len=1)=>[at(new THREE.CylinderGeometry(.13*s,.13*s,.1*s,8),0,y+.03*s,z), ...flipY(longT(0,-(y-.02*s),z,s,len))];
/* flatT: a flattened laser turret (height k of laserT) standing on y — the assault ship's flat twin secondary guns */
const flatT=(x,y,z,s=1,n=2,k=.6)=>laserT(x,0,z,s,n).map(g=>{ g.scale(1,k,1); g.translate(0,y,0); return g; });
/* sideT: a flat turret laid on its side on a side wall at x (its top facing out, barrels forward, one above the other) */
const sideT=(x,y,z,s=1,n=2,k=.6)=>flatT(0,0,z,s,n,k).map(g=>{ g.rotateZ(x>0?-Math.PI/2:Math.PI/2); g.translate(x,y,0); return g; });
/* model key → parts. Keys ending in A, B… are variants shown on the sample sheet; the game uses the keys named in GROUND_MODELS */
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
    at(loft([[-.8,.27,.085],[-.4,.37,.1],[.1,.37,.1],[.5,.12,.065,-.025]],SLAB),0,.475,-.02),
    ...pair(tone(at(box(.045,.125,.4),.268,.458,.285,.0,-.54,0),.82)), ...pair(tone(at(box(.05,.03,.36),.235,.55,.25,0,-.54,0),.82)), at(box(.15,.12,.14),0,.455,.5),
    tone(at(box(.56,.09,.14),0,.47,-.86),.55), tone(at(box(.72,.1,.02),0,.46,-.95),DK), ...pair(tone(at(box(.02,.1,.3),.36,.46,-.8),DK)),
    ...pair(tone(at(box(.04,.05,.12),.35,.51,.02),DK)),
    at(new THREE.CylinderGeometry(.085,.085,.05,6),.15,.6,-.22), at(box(.13,.09,.02),.15,.66,-.13), ...piv([tone(brl(.016,0,.3),DK)],.15,.66,-.14),
    at(new THREE.CylinderGeometry(.07,.07,.035,6),-.16,.59,-.34), tone(at(box(.09,.07,.09),-.13,.61,.0),DK),
    ...gunG([brl(.05,0,1.08),brl(.062,.12,.4),brl(.071,.46,.66),brl(.062,.72,.94),brl(.058,1.02,1.08)],.475,.52)],
  /* 装甲兵員輸送車（地球連合）: eight wheels under a box that is a plain rectangle seen from above; the front is one long,
     gentle slope from the roof down to the nose, half the length of the vehicle (user decision 2026-11-12). The weapon
     station sits off to one side behind the commander's hatch, stowage boxes along the rear sides, a ramp door behind */
  apcE:()=>[...wheelsG([-.66,-.24,.22,.64]), tone(at(box(.5,.15,1.8),0,.2,0),.6),
    loft([[-.96,.36,.15,.43],[.02,.36,.15,.43],[.99,.36,.04,.31]],SLAB), tone(at(box(.42,.2,.02),0,.42,-.965),.6),
    tone(at(box(.46,.02,.1),0,.535,.3,.245),GL), ...pair(at(box(.05,.12,.5),.34,.5,-.6)),
    at(loft([[-.15,.11,.055],[.13,.09,.045]],SLAB),.14,.635,-.34), ...piv([tone(brl(.02,0,.5),DK),tone(at(box(.05,.05,.05),.07,.04,-.05),DK)],.14,.645,-.24),
    at(new THREE.CylinderGeometry(.075,.075,.035,6),-.15,.6,-.12), tone(at(box(.03,.3,.03),-.3,.73,-.85),DK)],
  /* 自走砲（地球連合）: the tank hull under a tall, wide gun house at the rear, a thick raised gun with a boxed muzzle brake */
  spgE:()=>[...hullE(), at(loft([[-.98,.3,.17],[-.2,.33,.2],[.1,.27,.17],[.26,.19,.12,-.02]],SLAB),0,.56,0), tone(at(box(.44,.12,.03),0,.56,-1),.6),
    tone(at(box(.1,.07,.12),-.16,.79,-.5),DK), at(new THREE.CylinderGeometry(.07,.07,.03,6),.15,.775,-.3),
    ...gunG([brl(.075,0,.3),brl(.05,.3,1.34),at(box(.15,.09,.15),0,0,1.38)],.6,.16,.2)],
  /* 自走対空砲（地球連合）: the tank hull under a turret with a pair of cannon on each side, raised, and an optical tracker
     ball on a short mast (no radar in this war) */
  aaE:()=>[...hullE(), at(loft([[-.45,.19,.11],[.25,.2,.11],[.42,.12,.08,-.01]],SLAB),0,.48,-.08),
    ...[.29,-.29].flatMap(x=>piv([box(.1,.13,.34),tone(at(brl(.02,0,.75),0,.03,.1),DK),tone(at(brl(.02,0,.75),0,-.03,.1),DK)],x,.52,-.02,.45)),
    tone(at(box(.5,.05,.05),0,.52,-.02),.6), tone(at(box(.03,.14,.03),0,.66,-.36),DK), tone(at(new THREE.IcosahedronGeometry(.075,0),0,.78,-.36),GL)],
  /* ロケット車両（地球連合）: the truck with a boxed launcher of six tubes on the bed, raised */
  mlrsE:()=>[...truckE(), ...piv([at(box(.58,.3,1.05),0,.17,.5),tone(at(box(.5,.22,.02),0,.17,1.03),DK),tone(at(box(.5,.22,.02),0,.17,-.03),DK)],0,.36,-.92,.3), tone(at(box(.44,.1,.24),0,.36,-.84),.6), tone(barG([0,.3,-.28],[0,.56,-.37],.08,.06),.45)],
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
  apcM:()=>[...wheelsG([-.7,-.28,.16,.6]), tone(at(box(.5,.13,1.72),0,.2,-.04),.6),
    loft([[-.98,.3,.13,.36],[-.72,.37,.15,.37],[.45,.37,.15,.37],[.85,.28,.1,.37],[1.1,.1,.03,.41]],CREASE), tone(at(box(.26,.03,.04),0,.5,.58,.3),GL),
    at(new THREE.CylinderGeometry(.15,.2,.08,6),0,.56,-.32), ...gunG([brl(.018,0,.85),at(box(.05,.05,.2),.06,0,.1)],.58,-.26)],
  /* 自走砲（惑星共和国）: the common hull under a tall narrow gun house with cut top edges; a long powder gun, the longest on the
     field (user decision 2026-11-12: not a railgun, its range would not fit 30 km) */
  spgM:()=>[...hullM(), at(loft([[-.92,.2,.15],[-.5,.24,.19],[.18,.22,.17],[.46,.11,.09,-.04]],FACET),0,.56,-.05), tone(at(box(.07,.07,.07),.1,.775,-.4),DK),
    ...gunG([brl(.062,0,.26),brl(.038,.26,1.78),brl(.052,.9,1.06),brl(.055,1.64,1.78)],.6,.3,.22)],
  /* 自走対空砲（惑星共和国）: the common hull under a flat uncrewed turret with four short cannon in a block, raised a little, and
     a tracker ball; low and compact (user 2026-11-12) */
  aaM:()=>[...hullM(), at(new THREE.CylinderGeometry(.22,.27,.1,6),0,.42,-.2),
    ...piv([box(.22,.13,.3),...[[.05,.035],[-.05,.035],[.05,-.035],[-.05,-.035]].map(([x,y])=>tone(at(brl(.018,0,.5),x,y,.12),DK))],0,.52,-.2,.3), tone(at(box(.03,.12,.03),.2,.4,-.42),DK), tone(at(new THREE.IcosahedronGeometry(.07,0),.2,.5,-.42),GL)],
  /* ロケット車両（惑星共和国）: the common hull with two rows of launch tubes lying low on the deck */
  mlrsM:()=>[...hullM(), ...piv([...[-.17,0,.17].flatMap(x=>[.06,.2].map(y=>{ const g=tube(.068,1.15,6); return at(g,x,y,.5); })),tone(at(box(.5,.3,.02),0,.13,1.08),DK),at(box(.56,.06,.3),0,-.02,.2)],0,.4,-.9,.16)],
  /* 補給（惑星共和国）: the sealed truck with two tanks on the bed */
  supM:()=>[...truckM(), ...[-.62,-.02].map(z=>{ const g=new THREE.CylinderGeometry(.24,.24,.52,8); g.rotateX(Math.PI/2); return tone(at(g,0,.56,z),.8); }), at(box(.5,.06,1.2),0,.33,-.32)],
  /* 工兵（惑星共和国）: the common hull with a folded bridge on top and a narrow blade */
  engM:()=>[...hullM(), at(box(.8,.18,.04),0,.14,1.12,-.3), ...pair(tone(at(box(.05,.05,.3),.3,.15,.98),DK)), tone(at(box(.46,.05,1.5),0,.42,-.3),.75), tone(at(box(.46,.05,1.5),0,.5,-.3),.75), ...[-.9,.3].map(z=>tone(at(box(.5,.17,.04),0,.435,z),DK))],
  /* 斥候（惑星共和国）: a small low four-wheeled boat hull with a tiny uncrewed turret */
  scoutM:()=>[...wheelsG([-.42,.42],.33,.16), tone(at(box(.44,.12,1.2),0,.22,0),.6), loft([[-.72,.26,.11,.34],[-.5,.32,.13,.35],[.35,.32,.13,.35],[.82,.1,.03,.37]],CREASE), tone(at(box(.22,.03,.04),0,.46,.45,.3),GL),
    at(new THREE.CylinderGeometry(.1,.14,.07,6),0,.51,-.22), ...gunG([brl(.015,0,.5)],.53,-.18), tone(at(box(.05,.07,.05),.0,.58,-.3),GL)],
  /* 強化歩兵: about 2 m tall. W: moving, F: standing or fighting */
  infW:()=>exoParts(false,'walk'), infW2:()=>exoParts(false,'walk2'), infF:()=>exoParts(false,'fight'),
  /* 重強化歩兵: the same frame a little bigger, armoured all over (user decision 2026-11-12) */
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
  /* 強襲母艦 (docs/models.md 14): one design for space and sea — the space carrier's two slim hulls joined by a broad deck,
     worked out. Twin flat-bottomed hulls with an engine bell in each stern, a hangar body between them under the deck with a
     dark launch mouth at its front, a flight deck with two launch tracks, two W.A.S. lifts on the port side and a landing area
     aft, an island on the starboard hull, two small guns. Waterline y 0 */
  masc2:()=>{ const CAT=[[.6,1],[1,.2],[.6,-1],[-.6,-1],[-1,.2],[-.6,1]], sx=(p,x)=>p.map(g=>{ g.translate(x,0,0); return g; });
    return [...pair(at(loft([[-1.2,.12,.12,.06],[-.4,.16,.13,.06],[.6,.13,.125,.06],[1.25,0,.07,.11]],CAT),.36,0,0)),
      loft([[-.95,.21,.09,.11],[.5,.21,.09,.11],[.78,.15,.07,.13]],RECT), tone(at(box(.26,.1,.02),0,.125,.782),DK),
      at(loft([[-1.05,.5,.025],[.3,.5,.025],[.82,.3,.025]],RECT),0,.215,0),
      ...engines([.36,-.36],.07,-1.26,.085).map(g=>tone(g,DK)), ...engines([.1,-.1],.11,-1,.055).map(g=>tone(g,DK)),
      ...pair(tone(at(box(.03,.008,.95),.1,.241,.3),DK)), ...[-.25,.12].map(z=>tone(at(box(.17,.008,.22),-.3,.241,z),DK)), tone(at(box(.6,.008,.4),0,.241,-.75),.7),
      at(loft([[-.5,.075,.07],[-.12,.075,.07],[.02,.04,.06,-.01]],TRAP),.38,.31,0), tone(at(loft([[-.2,.062,.014],[-.12,.062,.014],[.025,.034,.014]],RECT),.38,.335,0),GL),
      at(box(.025,.16,.025),.38,.45,-.35), at(box(.14,.012,.02),.38,.47,-.35), at(box(.06,.03,.045),.38,.53,-.35),
      ...sx(gunTurret(.235,.2),-.4), ...sx(gunTurret(.235,.22),.38)]; },
  /* space ships worked out (docs/models.md 15, round 2 in 15.4): today's hulls with their numbers kept, outlines added where
     the role shows, laser turrets worked out (laserT), point defence on every ship (pdG). Centred on y 0. sp…: shown on the
     sample sheet; the game still draws SHAPES */
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
  spCL:()=>[loft([[-1.1,.32,.19],[-.45,.38,.23],[.45,.29,.17],[1.2,0,.01,-.02]]), at(loft([[-.6,.15,.09],[-.25,.17,.16,.06],[.05,.1,.08,.03],[.25,0,0]]),0,.2,0),
    ...laserT(0,.112,.68,1,2), at(new THREE.CylinderGeometry(.1,.11,.07,8),0,.2,.4), ...laserT(0,.235,.4,1,2), ...laserT(0,.2,-.82,1,2,true),
    ...pair(at(plate([[.3,-.45],[.55,-.75],[.55,-.95],[.3,-.9]]),0,-.04,0)), ...spBells([.17,-.17,0],0,-1.15,.09), tone(at(box(.14,.03,.08),0,.3,.02),GL),
    ...pdG(.2,.11,.1,.8), ...pdG(-.2,.11,.1,.8), ...pdG(.22,.14,-.45,.8), ...pdG(-.22,.14,-.45,.8),
    ...belly(0,-.197,.05,.6), ...sideT(.322,0,.05,.6), ...sideT(-.322,0,.05,.6), ...gatB(.15,-.171,-.5,.9), ...gatB(-.15,-.171,-.5,.9)],
  spBB:()=>[loft([[-1.35,.34,.2],[-.6,.41,.25],[.6,.31,.19],[1.45,0,.01,-.03]]), at(loft([[-.85,.18,.09],[-.35,.2,.17,.06],[.05,.13,.1,.04],[.3,0,0,.02]]),0,.22,0),
    at(loft([[-.6,.08,.07],[-.4,.08,.12,.05],[-.2,0,0,.03]]),0,.44,0),
    ...laserT(0,.118,.88,1.3,2), at(new THREE.CylinderGeometry(.13,.14,.08,8),0,.22,.52), ...laserT(0,.26,.52,1.3,2), ...laserT(0,.215,-1.02,1.25,2,true),
    ...laserT(.27,.11,.12,.55), ...laserT(-.27,.11,.12,.55), ...laserT(.27,.13,-.3,.55), ...laserT(-.27,.13,-.3,.55),
    at(plate([[0,-.3],[0,-1.05],[.03,-1.05],[.03,-.5]],.025),0,-.19,0,0,0,-Math.PI/2), ...spBells([.18,-.18,0],0,-1.4,.1), ...pair(at(plate([[.26,-1.05],[.46,-1.2],[.46,-1.32],[.26,-1.3]],.02),0,0,0)),
    ...pdG(.15,.33,-.5,.9), ...pdG(-.15,.33,-.5,.9), ...pdG(.3,.12,-.72,.9), ...pdG(-.3,.12,-.72,.9),
    tone(at(box(.16,.03,.08),0,.33,0),GL), at(box(.025,.14,.025),0,.6,-.45), at(box(.12,.012,.02),0,.62,-.45), tone(at(box(.05,.03,.04),0,.68,-.45),GL),
    ...bellyL(-.2175,.05,1.2,1), ...gatB(.22,-.154,-.35,1), ...gatB(-.22,-.154,-.35,1), ...gatB(.25,-.137,-.9,1), ...gatB(-.25,-.137,-.9,1)],
  spCVB:()=>[at(loft([[-1.2,.3,.03],[-.8,.38,.03],[.55,.34,.03],[1.2,.06,.03]],RECT),0,.16,0), loft([[-1.15,.2,.13],[-.4,.23,.15],[.6,.17,.11],[1.15,0,.01]]),
    loft([[-.85,.17,.035,.095],[.7,.17,.035,.095],[.8,.12,.03,.095]],RECT), tone(at(box(.2,.05,.01),0,.095,.802),DK),
    at(loft([[-.4,.05,.05],[-.22,.06,.18,.09],[0,.035,.09,.05],[.1,0,0]]),.33,.2,0), ...spBells([.1,-.1],-.02,-1.2,.08),
    ...pair(tone(at(box(.03,.008,1),.09,.191,.25),DK)), tone(at(box(.14,.008,.2),-.22,.191,-.3),DK), tone(at(box(.5,.008,.36),0,.191,-.9),.7),
    tone(at(box(.06,.03,.07),.33,.36,-.1),GL), at(box(.02,.12,.02),.33,.47,-.22), tone(at(box(.05,.025,.035),.33,.54,-.22),GL),
    ...laserT(-.26,.19,.3,.6), ...laserT(-.26,.19,-.1,.6), ...pdG(.3,.19,-1,.8), ...pdG(-.3,.19,-1,.8), ...pdG(.24,.19,.62,.8), ...pdG(-.2,.19,.75,.8),
    ...belly(0,-.134,0,.6), ...gatB(.1,-.082,.3,.8), ...gatB(-.1,-.082,.3,.8), ...gatB(.12,-.094,-.7,.8), ...gatB(-.12,-.094,-.7,.8), ...gatB(.3,.13,-.3,.8), ...gatB(-.3,.13,-.3,.8)],
  /* 突撃揚陸艦 (docs/models.md 15.5): the W.A.S. drop from under the body — a flat-bottomed launch bay under the hull, its sides
     drawn in toward the bottom, and two rows of five pods (one W.A.S. each) half out of its floor, each with a dark lid. No side pods:
     a flat twin secondary gun laid on each side wall (15.7) */
  spMAS:()=>{ const BAY=[[1,1],[.8,-1],[-.8,-1],[-1,1]];
    const pods=[.11,-.11].flatMap(x=>[-.5,-.3,-.1,.1,.3].flatMap(z=>[tone(at(loft([[-.08,.04,.035],[.06,.05,.04],[.08,.035,.03]],O8),x,-.22,z),.8), tone(at(box(.06,.01,.1),x,-.258,z),DK)]));
    return [loft([[-1.05,.22,.16],[-.3,.29,.21],[.6,.26,.18],[.95,.18,.12]]), ...sideT(.272,0,-.05,.6), ...sideT(-.272,0,-.05,.6),
      loft([[-.75,.2,.06,-.13],[-.6,.26,.075,-.145],[.4,.25,.075,-.145],[.6,.18,.05,-.12]],BAY), ...pods,
      at(loft([[-.65,.1,.06],[-.35,.11,.12,.05],[-.05,0,0,.02]]),0,.19,0), ...spBells([.12,-.12],0,-1.1,.08),
      ...laserT(0,.18,.48,.65), tone(at(box(.09,.03,.08),0,.3,-.3),GL), ...pdG(.2,.1,-.5,.8), ...pdG(-.2,.1,-.5,.8), ...pdG(0,.28,-.55,.8)]; },
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
  'sea:masc':{key:'masc2',size:1.92,form:'one'},
};
/* ?groundModels=kind:key:size:form[:move],kind@mars:key:size:form in the page address overrides the table (for sample shots
   only); an entry without @side applies to both sides. Returns {key,move,size,form,offsets} or null. key is the
   shape when the unit stands or fights. move: the keys of the shapes shown while it is moving (in the table an array, in the
   address joined with +; empty: the same shape always). With two or more, each body of the unit steps through them on its
   own clock (the steps of a walk), starting at a random one, so the bodies are out of step with each other */
function groundModelFor(kind,side='earth'){
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k), done=m=>m&&has(GROUND_SHAPES,m.key)?{key:m.key,move:(Array.isArray(m.move)?m.move:String(m.move||'').split('+')).filter(k=>has(GROUND_SHAPES,k)),size:Number.isFinite(+m.size)&&+m.size>0?+m.size:1,form:has(GROUND_FORMS,m.form)?m.form:'one',offsets:GROUND_FORMS[has(GROUND_FORMS,m.form)?m.form:'one']}:null;
  const q=typeof location!=='undefined'&&new URLSearchParams(location.search).get('groundModels');
  if(q) for(const who of [kind+'@'+side,kind]) for(const s of q.split(',')){
    if(!s.startsWith(who+':')) continue;
    const [key,size,form,move]=s.slice(who.length+1).split(':'), m=done({key,size,form,move}); if(m) return m;
  }
  const m=GROUND_MODELS[kind]; return done(m&&(m.earth||m.mars)?m[side]:m);
}
function groundShapeGeo(key,mono=false){ return Object.prototype.hasOwnProperty.call(GROUND_SHAPES,key)?groundJoin(GROUND_SHAPES[key](),mono):null; }
