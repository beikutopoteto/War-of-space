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
   sloping glacis (top of the deck at y .36). hullM: the Republic's common hull for tank, gun, air defence, rockets and
   engineers — long and low, skirts in one piece with the hull, a long shallow glacis over the crew capsule with a dark sensor
   strip instead of hatches. wheelsG: road wheels at the given z on both sides, each pair on an axle with a suspension arm up to the hull (user 2026-11-12: wheels with nothing between them and the hull look wrong). piv: parts built around a pivot at the
   origin, raised by el and set at x,y,z */
const hullE=()=>[...trackG(.37,-.98,.98), ...trackG(-.37,-.98,.98), ...pair(at(box(.03,.13,1.66),.485,.22,-.03)), loft([[-.95,.34,.09,.27],[.5,.34,.09,.27],[.97,.31,.035,.215]],SLAB)];
const hullM=()=>[...trackG(.38,-1.02,1,.09,.22,7), ...trackG(-.38,-1.02,1,.09,.22,7), loft([[-1.05,.38,.07,.25],[-.85,.47,.11,.25],[.3,.47,.11,.25],[1.06,.2,.03,.17]],SKIRT), tone(at(box(.34,.03,.1),0,.345,.46),GL)];
const wheelsG=(zs,x=.37,r=.15)=>zs.flatMap(z=>[wheelG(x,z,r),wheelG(-x,z,r), tone(at(box(2*x,.05,.05),0,r,z),.45), ...pair(tone(barG([x-.21,r+.1,z],[x-.07,r,z],.06,.05),.45))]);
const piv=(parts,x,y,z,el=0)=>parts.map(g=>at(g,x,y,z,-el));
/* the Earth's truck: four axles, a frame, a cab with a windscreen at the front; the bed is free from z -.95 to .4 at y .31 */
const truckE=()=>[...wheelsG([-.7,-.3,.22,.64]), tone(at(box(.5,.1,1.9),0,.26,0),.6), loft([[.44,.34,.17,.48],[.84,.34,.17,.48],[.98,.32,.09,.41]],SLAB), tone(at(box(.56,.09,.03),0,.56,.9,.5),GL)];
/* the Republic's truck: three axles under a sealed creased nose with a sensor strip and no windows */
const truckM=()=>[...wheelsG([-.66,-.2,.6]), tone(at(box(.48,.1,1.9),0,.26,0),.6), loft([[.36,.33,.14,.45],[.8,.3,.12,.44],[1.05,.1,.04,.42]],CREASE), tone(at(box(.3,.03,.04),0,.53,.78,.2),GL)];
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
   kind 'c' (commando): no power unit but a ghillie suit — shaggy tufts in two tones over the head, shoulders, back and arms and
   wrapped round the rifle (user 2026-11-12) — and a long rifle with a sight; it moves in a low crouch, carrying the
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
    ...(cmd?[[0,1.55,-.05,.15],[.25,1.37,-.04,.13],[-.25,1.37,-.04,.13],[0,1.22,-.17,.2],[.13,1.02,-.16,.15],[-.13,1.0,-.17,.15],[0,.85,-.14,.14],[.11,1.24,.1,.085],[-.12,1.2,.1,.085],[0,1.4,-.14,.13]].map(v=>tuftG(...v)):[at(box(.25,.27,.12),0,1.17,-.2)]));
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
/* W.A.S. (docs/models.md 9 D): one design for space and for the ground (user decision 2026-11-12).
   wasParts: the space W.A.S. of battle/shapes.js (the shape the user approved on 2026-10-14) with its numbers opened up.
   L: forward lean (.45 in flight); arm, leg: thickness of the arms and of the legs with their thruster pods; feet: pads to stand on */
function wasParts(o){ const K=.1, P=([x,y])=>[(x-12)*K,(11.2-y)*K], V=(x,y,z=0)=>new THREE.Vector3(x,y,z), M=()=>new THREE.Matrix4(), L=o.L, A=o.arm, G=o.leg;
  const rotAt=(axis,ang,p)=>M().makeTranslation(p.x,p.y,p.z).multiply(M().makeRotationAxis(axis,ang)).multiply(M().makeTranslation(-p.x,-p.y,-p.z));
  const X=V(1,0,0), Z=V(0,0,1), up=g=>{ g.rotateX(-Math.PI/2); return g; };
  const along=(g,a,b)=>{ g.applyMatrix4(M().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(Z,b.clone().sub(a).normalize()))); g.translate(a.x,a.y,a.z); return g; };
  const head=new THREE.IcosahedronGeometry(.085,0); head.scale(1,1.08,1.05);
  const parts=[at(head,0,.415,.01), tone(at(box(.1,.022,.03),0,.42,.085),GL), limb([0,.32,0],[0,.36,0],.025,.022),
    up(loft([[-.05,.012,.012],[0,.055,.06],[.145,.095,.1],[.17,.135,.11],[.3,.17,.07],[.335,.14,.035]],HEX)),
    at(box(.18,.16,.09),0,.2,-.14), ...pair(tone(at(new THREE.CylinderGeometry(.035,.025,.08,8),.06,.09,-.16),DK))], right=[];
  const TOP=V(...P([8.2,2.8])), TIP=V(...P([7.32,15])), EL=TOP.clone().lerp(TIP,6.9/12.2), PV=TOP.clone().lerp(TIP,.59), dir=TIP.clone().sub(EL).normalize();
  const armM=M().makeTranslation(PV.x,PV.y,PV.z).multiply(M().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(TIP.clone().sub(TOP).normalize(),V(0,Math.sin(L),Math.cos(L))))).multiply(M().makeTranslation(-PV.x,-PV.y,-PV.z));
  right.push(along(loft([[0,.004,.004],[.27,.075*A,.075*A],[.5,.115*A,.115*A],[TOP.distanceTo(EL),.128*A,.128*A]],ROUND),TOP,EL),
    along(loft([[0,.128*A,.128*A],[.26,.13*A,.13*A],[.42,.08*A,.08*A],[EL.distanceTo(TIP),.03*A,.03*A]],ROUND),EL,TIP));
  for(const g of right) g.applyMatrix4(armM);
  for(const [a,b] of [[[10.5,8.7],[8.6,7.6]],[[10.75,9.4],[8.4,9.3]]]) right.push(tone(limb([...P(a),0],V(...P(b)).applyMatrix4(armM).toArray(),.011,.011),DK));
  const LX=-.105*(o.feet?1.15:1), HIP=V(LX,-.01), KN=V(LX,-.271), thM=rotAt(X,-.35,HIP), knee=KN.clone().applyMatrix4(thM);
  const shM=M().makeTranslation(knee.x-KN.x,knee.y-KN.y,knee.z-KN.z).multiply(rotAt(X,.4,KN));
  const thigh=up(loft([[KN.y,.063*G,.1*G],[-.17,.06*G,.075*G],[-.073,.057*G,.05*G],[HIP.y,.021,.03]],HEX)), shin=up(loft([[-.505,.078*G,.035*G],[-.39,.07*G,.075*G],[KN.y,.063*G,.1*G]],HEX));
  thigh.translate(LX,0,0); shin.translate(LX,0,0); shin.applyMatrix4(shM);
  const kneeCap=new THREE.ConeGeometry(.04,.05,4); kneeCap.rotateX(Math.PI/2); kneeCap.rotateZ(Math.PI/4);
  const pod=up(loft([[-.33,.02,.02],[-.28,.042*G,.042*G],[-.1,.04*G,.04*G],[-.02,.035*G,.035*G],[0,.02,.02]],HEX)); pod.translate(P([9.62,11.8])[0]-(G-1)*.05,P([9.62,11.8])[1],0);
  const noz=tone(new THREE.CylinderGeometry(.03*G,.045*G,.05,8),DK); noz.translate(P([9.62,15.35])[0]-(G-1)*.05,P([9.62,15.35])[1],0);
  for(const g of [thigh,pod,noz]) g.applyMatrix4(thM);
  right.push(thigh, shin, pod, noz, at(kneeCap,knee.x,knee.y,knee.z+.1*G));
  if(o.feet){ const f=at(box(.13,.03,.2),LX,-.515,.03); f.applyMatrix4(shM); right.push(f); }
  const on=t=>TIP.clone().addScaledVector(dir,t), rifle=[along(loft([[-.06,.055,.04],[.1,.055,.04]],RECT),on(0),on(1)),
    along(loft([[.1,.018,.018],[.4,.018,.018]],ROUND),on(0),on(1)), along(loft([[.4,.024,.024],[.44,.018,.018]],ROUND),on(0),on(1))];
  for(const g of rifle){ g.applyMatrix4(armM); tone(g,DK); }
  for(let g of right){ const t=g.userData.tone; g=g.index?g.toNonIndexed():g; if(t!=null) g.userData.tone=t; parts.push(g,mirror(g)); }
  parts.push(...rifle);
  const cm=rotAt(X,Math.PI/2-L,V(.245,.38,-.07));
  parts.push(limb([.15,.3,-.06],[.245,.38,-.07],.02,.018), ...[at(box(.11,.2,.1),.245,.48,-.07), tone(at(up(tube(.022,.52,10)),.245,.84,-.07),DK), tone(at(box(.1,.012,.03),.245,1.1,-.07),DK)].map(g=>g.applyMatrix4(cm)));
  const out=parts.map(g=>{ if(!g.index) return g; const n=g.toNonIndexed(); n.userData.tone=g.userData.tone; return n; }); out.forEach(g=>{ g.rotateX(L); g.scale(1.52,1.68,1.68); });
  return onGround(out); }
/* lift parts so the lowest point stands on y = 0 */
function onGround(parts){ let m=Infinity; for(const g of parts){ const q=g.attributes.position; for(let i=0;i<q.count;i++) m=Math.min(m,q.getY(i)); } parts.forEach(g=>g.translate(0,-m,0)); return parts; }
/* W.A.S. as Claude would build it from the setting (docs/story.md 4): a work exoskeleton grown to 4–5 m and armed. The same
   language as the infantry's frame, so the line shows: dark joints, a small faceted head and a dark chest hatch over the
   pilot, a wide angular chest stepping in to a narrow waist. Long thick arms (a ship-class rifle in the right hand, a close-in
   cannon on the left forearm), a ship-class cannon over the left shoulder; short thick legs, each calf a thruster nacelle with
   its bell behind, splayed feet to stand on the Earth; a pack with two thruster bells and two tanks */
function wasOwn(){ const p=[], dk=g=>tone(g,DK), J=(x,y,z,r,w=.07)=>tone(discG(x,y,z,r,w),.35);
  for(const sx of [1,-1]){ const hip=[sx*.17,.62,0], knee=[sx*.21,.37,.11], ank=[sx*.21,.12,-.01];
    p.push(segG(hip,knee,.115,.1), J(hip[0],hip[1],hip[2],.085,.1), J(knee[0],knee[1],knee[2],.075,.1),
      at(stand(loft([[.07,.1,.1],[.3,.145,.155],[.44,.1,.1]],O8)),ank[0],0,ank[2]-.02), dk(at(new THREE.CylinderGeometry(.06,.095,.12,6),ank[0],.14,ank[2]-.2,.9)),
      at(box(.17,.07,.34),ank[0],.035,ank[2]+.1), at(box(.1,.05,.14),ank[0],.03,ank[2]-.17),
      /* arm */
      J(sx*.44,1.19,0,.1,.1), at(loft([[-.15,.13,.1],[.13,.1,.075]],SLAB),sx*.45,1.27,0)); }
  p.push(at(box(.36,.14,.24),0,.63,0), tone(segG([0,.68,0],[0,.8,0],.1,.09),.35),
    stand(loft([[.76,.13,.11],[.9,.18,.14],[1.12,.36,.2],[1.26,.31,.16],[1.33,.15,.1]],HEX)), tone(at(box(.2,.09,.04),0,1.14,.19),GL),
    at(new THREE.IcosahedronGeometry(.078,0),0,1.42,.03), tone(at(box(.1,.025,.03),0,1.425,.1),GL), tone(segG([0,1.32,0],[0,1.37,0],.05,.045),.35),
    at(box(.38,.36,.18),0,1.04,-.27), ...pair(dk(at(new THREE.CylinderGeometry(.05,.085,.14,6),.11,.84,-.3,.5))), ...pair(tone(at(tube(.06,.3,6),.24,1.06,-.28,Math.PI/2),.7)));
  /* right arm with the rifle, left arm with the close-in cannon */
  const R=[[-.45,1.17,0],[-.5,.84,.02],[-.42,.76,.38]], Lf=[[.45,1.17,0],[.5,.82,.03],[.46,.56,.24]];
  for(const [sh,el,wr] of [R,Lf]) p.push(segG(sh,el,.095,.085), J(el[0],el[1],el[2],.07,.1), segG(el,wr,.105,.09));
  p.push(dk(at(box(.1,.15,.44),-.42,.76,.5)), dk(at(tube(.042,.85,6),-.42,.78,1.1)), dk(at(tube(.058,.12,6),-.42,.78,1.56)),
    dk(at(tube(.03,.3,5),.5,.5,.4,-.75)), dk(at(tube(.03,.3,5),.42,.5,.4,-.75)),
    at(box(.16,.18,.44),.3,1.44,-.1), at(box(.1,.14,.1),.3,1.33,-.14), dk(at(tube(.052,1.15,6),.3,1.45,.68)), dk(at(box(.14,.08,.14),.3,1.45,1.3)));
  return p; }
/* W.A.S. 案C, to the user's own picture of it (2026-11-12): the infantry's and the factory's powered exoskeleton grown up. The
   trunk is small — a size up from a person — and it is the limbs that are extended and big. Over the left shoulder a long
   cannon held at its middle by an arm from the back, a cylinder with the case ejector at its rear. The right arm carries two
   big three-barrelled rotary cannon one above the other (fewer barrels for a bigger shell) and a few anti-ship rockets; ammunition
   and rockets come from the pack on the back. The left arm carries a reactive shield against lasers — a long slab with rows of
   armour tiles, drawn to a point whose tip throws plasma to melt armour when it is thrust in. Round the waist two sub-arms lie
   coiled, each ending in three fingers (they hand over the close-combat knife and reload the weapons); the knife is sheathed
   on the right thigh. Short thick legs, each calf a thruster nacelle, feet to stand on the Earth */
function wasUser(){ const p=[], dk=g=>tone(g,DK), J=(x,y,z,r,w=.08)=>tone(discG(x,y,z,r,w),.35), cyl=(r,l,x,y,z,n=8)=>{ const g=new THREE.CylinderGeometry(r,r,l,n); g.rotateZ(Math.PI/2); return at(g,x,y,z); };
  for(const sx of [1,-1]){ const hip=[sx*.16,.8,0], knee=[sx*.2,.47,.1], ank=[sx*.2,.14,-.02];
    p.push(segG(hip,knee,.1,.09), J(hip[0],hip[1],hip[2],.085,.1), J(knee[0],knee[1],knee[2],.075,.1),
      at(stand(loft([[.08,.1,.1],[.3,.15,.16],[.47,.1,.11]],O8)),ank[0],0,ank[2]-.03), dk(at(new THREE.CylinderGeometry(.06,.1,.13,6),ank[0],.15,ank[2]-.21,.9)),
      at(box(.17,.07,.34),ank[0],.035,ank[2]+.1), at(box(.1,.05,.14),ank[0],.03,ank[2]-.17),
      J(sx*.44,1.18,0,.1,.1), at(loft([[-.15,.12,.09],[.13,.095,.07]],SLAB),sx*.46,1.27,0), segG([sx*.46,1.16,0],[sx*.5,.85,.03],.09,.085), J(sx*.5,.85,.03,.072,.1)); }
  /* pelvis, waist with the coiled sub-arms and their three fingers, the small trunk, head, the yoke out to the arms */
  p.push(at(box(.3,.1,.2),0,.8,0), tone(segG([0,.84,0],[0,.92,0],.085,.075),.35), tone(at(new THREE.CylinderGeometry(.165,.165,.04,8),0,.875,0),.6), tone(at(new THREE.CylinderGeometry(.15,.15,.03,8),0,.915,0),.6),
    ...[[.13,.12],[-.13,.12]].flatMap(([x,z])=>[tone(at(box(.06,.06,.07),x,.89,z),.6), ...[-.03,0,.03].map(d=>dk(segG([x+d,.88,z+.03],[x+d*2.2,.82,z+.11],.012,.008,4)))]),
    stand(loft([[.9,.11,.09],[1.0,.15,.11],[1.16,.2,.13],[1.24,.15,.1]],HEX)), tone(at(box(.14,.07,.03),0,1.12,.125),GL),
    at(new THREE.IcosahedronGeometry(.065,0),0,1.31,.02), tone(at(box(.09,.022,.03),0,1.315,.08),GL), tone(segG([0,1.23,0],[0,1.27,0],.04,.035),.35), at(box(.84,.07,.14),0,1.2,-.05),
    /* pack: thrusters, the ammunition drum, spare rockets */
    at(box(.34,.36,.2),0,1.05,-.24), ...pair(dk(at(new THREE.CylinderGeometry(.05,.085,.14,6),.1,.84,-.28,.5))), tone(cyl(.1,.24,-.08,1.0,-.39),.6), ...[.08,.15].map(x=>tone(at(tube(.03,.3,6),x,1.08,-.38,Math.PI/2),.7)),
    dk(at(box(.04,.2,.06),-.3,.62,.05)));
  /* right arm: the two rotary cannon and the rockets, a feed from the pack */
  const rot=y=>[dk(at(tube(.05,.16,6),-.47,y,.64)), ...[0,2.1,4.2].map(a=>dk(at(tube(.016,.7,5),-.47+Math.cos(a)*.03,y+Math.sin(a)*.03,1.03))), dk(at(tube(.045,.05,6),-.47,y,1.0)), dk(at(tube(.047,.07,6),-.47,y,1.36))];
  p.push(segG([-.5,.85,.03],[-.47,.8,.3],.1,.09), at(box(.17,.32,.38),-.47,.8,.44), ...rot(.875), ...rot(.725),
    ...[-.06,0,.06].map(d=>tone(at(tube(.028,.3,6),-.47+d,.995,.42),.7)), ...[-.06,0,.06].map(d=>dk(at(tube(.03,.04,6),-.47+d,.995,.59))), dk(segG([-.47,.86,.26],[-.14,1.0,-.3],.028,.028,5)));
  /* left arm: the reactive shield, built flat and then stood on edge outside the forearm, its point forward and down */
  const SH=g=>at(g,.64,.72,.17,-.5,0,Math.PI/2);
  p.push(segG([.5,.85,.03],[.52,.62,.22],.1,.09), at(box(.1,.1,.12),.57,.68,.2),
    SH(plate([[.5,-.13],[.5,.13],[.2,.17],[-.2,.12],[-.56,.025],[-.56,-.025],[-.2,-.12],[.2,-.17]],.05)),
    ...[.37,.22,.07,-.08].flatMap(u=>[-.07,.07].map(z=>tone(SH(at(box(.12,.035,.11),u,-.04,z)),.8))), dk(SH(at(box(.2,.06,.07),-.6,0,0))), tone(SH(at(box(.06,.03,.03),-.72,0,0)),GL));
  /* the cannon over the left shoulder: rear cylinder and ejector, receiver, long barrel, the arm that holds its middle */
  p.push(at(tube(.085,.42,8),.34,1.5,-.4), dk(at(box(.07,.06,.14),.44,1.5,-.44)), dk(at(box(.05,.1,.05),.34,1.4,-.5)), at(box(.13,.14,.4),.34,1.5,0), dk(at(box(.04,.03,.5),.34,1.585,.05)),
    dk(at(tube(.03,1.15,6),.34,1.5,.78)), dk(at(tube(.046,.08,6),.34,1.5,1.37)), dk(at(box(.03,.03,.7),.34,1.45,.6)), segG([.28,1.22,-.14],[.34,1.42,-.02],.045,.04), J(.34,1.42,-.02,.055,.09));
  return p; }
/* the assault machine: step 1 or -1 says which foot is ahead */
function mechParts(step){ const p=[], T=.4;
  for(const sx of [1,-1]){ const hip=[sx*.13,.82,-.05], ank=[sx*.13,.1,sx*step>0?.2:-.16], dy=ank[1]-hip[1], dz=ank[2]-hip[2], dd=Math.hypot(dy,dz), k=Math.sqrt(Math.max(0,T*T-dd*dd/4));
    const knee=[hip[0],(hip[1]+ank[1])/2-k*dz/dd,(hip[2]+ank[2])/2+k*dy/dd];
    p.push(segG(hip,knee,.06,.045), segG(knee,ank,.04,.03), tone(discG(hip[0],hip[1],hip[2],.07,.08),DK), tone(discG(knee[0],knee[1],knee[2],.05,.07),DK), at(box(.12,.05,.26),ank[0],ank[1]-.07,ank[2]+.05)); }
  p.push(at(loft([[-.3,.13,.09],[.05,.19,.14],[.42,.1,.07,-.03]],HEX),0,.93,0), tone(at(box(.16,.03,.03),0,.93,.4),GL), tone(at(box(.1,.14,.2),0,1.05,-.18),.6),
    ...pair(at(box(.07,.1,.24),.25,.93,.05)), ...pair(tone(at(tube(.028,.42,5),.25,.92,.38),DK)), tone(at(box(.3,.05,.08),0,.84,-.05),DK), tone(at(box(.02,.3,.02),.08,1.25,-.2),DK));
  return p; }
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
    ...pair(tone(at(box(.04,.05,.12),.385,.51,.02),DK)),
    at(new THREE.CylinderGeometry(.085,.085,.05,6),.15,.6,-.22), at(box(.13,.09,.02),.15,.66,-.13), ...piv([tone(brl(.016,0,.3),DK)],.15,.66,-.14),
    at(new THREE.CylinderGeometry(.07,.07,.035,6),-.16,.59,-.34), tone(at(box(.09,.07,.09),-.13,.61,.0),DK),
    ...gunG([brl(.05,0,1.08),brl(.062,.12,.4),brl(.071,.46,.66),brl(.062,.72,.94),brl(.058,1.02,1.08)],.475,.52)],
  /* 装甲兵員輸送車（地球連合）: eight wheels under a box that is a plain rectangle seen from above; the front is one long,
     gentle slope from the roof down to the nose, half the length of the vehicle (user decision 2026-11-12). The weapon
     station sits off to one side behind the commander's hatch, stowage boxes along the rear sides, a ramp door behind */
  apcE:()=>[...wheelsG([-.66,-.24,.22,.64]), tone(at(box(.5,.15,1.8),0,.2,0),.6),
    loft([[-.96,.36,.15,.43],[.02,.36,.15,.43],[.99,.36,.04,.31]],SLAB), tone(at(box(.42,.2,.02),0,.42,-.965),.6),
    tone(at(box(.46,.02,.1),0,.535,.3,.245),GL), ...pair(at(box(.05,.12,.5),.385,.5,-.6)),
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
    ...piv([box(.22,.13,.3),...[[.05,.035],[-.05,.035],[.05,-.035],[-.05,-.035]].map(([x,y])=>tone(at(brl(.018,0,.5),x,y,.12),DK))],0,.52,-.2,.3), tone(at(new THREE.IcosahedronGeometry(.07,0),.2,.5,-.42),GL)],
  /* ロケット車両（惑星共和国）: the common hull with two rows of launch tubes lying low on the deck */
  mlrsM:()=>[...hullM(), ...piv([...[-.17,0,.17].flatMap(x=>[.06,.2].map(y=>{ const g=tube(.068,1.15,6); return at(g,x,y,.5); })),tone(at(box(.5,.3,.02),0,.13,1.08),DK),at(box(.56,.06,.3),0,-.02,.2)],0,.4,-.9,.16)],
  /* 補給（惑星共和国）: the sealed truck with two tanks on the bed */
  supM:()=>[...truckM(), ...[-.62,-.02].map(z=>{ const g=new THREE.CylinderGeometry(.24,.24,.52,8); g.rotateX(Math.PI/2); return tone(at(g,0,.56,z),.8); }), at(box(.5,.06,1.2),0,.33,-.32)],
  /* 工兵（惑星共和国）: the common hull with a folded bridge on top and a narrow blade */
  engM:()=>[...hullM(), at(box(.8,.18,.04),0,.14,1.12,-.3), tone(at(box(.46,.05,1.5),0,.42,-.3),.75), tone(at(box(.46,.05,1.5),0,.5,-.3),.75), ...[-.9,.3].map(z=>tone(at(box(.5,.15,.04),0,.45,z),DK))],
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
  /* W.A.S. 案A: today's W.A.S. changed a little to fit the setting — the legs and their thruster pods thicker (short thick legs
     with ship-class thrusters), the arms a little thicker, feet to stand on the Earth, dark joints and weapons. Standing it
     leans less; AF is the same thing leaning forward in flight */
  wasA:()=>wasParts({L:.15,arm:1.15,leg:1.4,feet:true}), wasAF:()=>wasParts({L:.45,arm:1.15,leg:1.4,feet:true}),
  /* W.A.S. 案B: Claude's own design from the setting */
  wasB:()=>wasOwn(),
  /* W.A.S. 案C: to the user's own picture (small trunk, big limbs, shoulder cannon, twin rotary cannon, reactive shield, sub-arms) */
  wasC:()=>wasUser(),
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
   keeps the old drawing. Empty until the user approves the samples (CLAUDE.md: looks go in after a sample is approved) */
const GROUND_MODELS={};
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
