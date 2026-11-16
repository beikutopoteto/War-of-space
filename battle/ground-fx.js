/* 地上の効果（ユーザー 2026-11-17）: 射撃の光、弾、着弾、爆風、煙、W.A.S. の噴射。
   groundFire と同じ作り: どれも {group, update(t)} を返す。t は始まってからの秒。update は終わったら false を返す。
   炎は使わない（砲撃の着弾は煙を少しだけ）。爆風は、地面を広がる明るい輪と土ぼこりの帯で、届く範囲 R を見せる。
   見本の段階。ゲームにはまだ入れていない（docs/models.md 17）。 */
const GFX=(()=>{
  const mat=(c,o=1,add=false)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});
  let G=null;
  const geo=()=>G||(G={ ring:new THREE.RingGeometry(.94,1,64).rotateX(-Math.PI/2), band:new THREE.RingGeometry(.55,.96,64).rotateX(-Math.PI/2), disc:new THREE.CircleGeometry(1,32).rotateX(-Math.PI/2),
    dome:new THREE.SphereGeometry(1,18,8,0,Math.PI*2,0,Math.PI/2), puff:new THREE.IcosahedronGeometry(1,0), chunk:new THREE.TetrahedronGeometry(1,0),
    bolt:new THREE.CylinderGeometry(.5,.5,1,5).rotateX(Math.PI/2), cone:new THREE.ConeGeometry(.5,1,8,1,true).rotateX(-Math.PI/2).translate(0,0,-.5),
    star:(()=>{ const g=new THREE.BufferGeometry(), P=[]; for(let i=0;i<4;i++){ const a=i*Math.PI/4, c=Math.cos(a), s=Math.sin(a); P.push(-c,-s,0, c,s,0, -s*.16,c*.16,0,  c,s,0, -c,-s,0, s*.16,-c*.16,0); } g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); return g; })() });
  const mesh=(g,m,group)=>{ const x=new THREE.Mesh(g,m); group.add(x); return x; };
  const ease=u=>1-Math.pow(1-Math.min(1,Math.max(0,u)),3);
  let seed=7; const rnd=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };

  /* 煙: n 個の灰色の塊が上って薄れる。s: 塊の大きさ、life: 1個の秒、rise: 上る高さ。loop: 出し続ける（噴煙） */
  function smoke(s,{n=4,life=4,rise=3,color=0x5a5a5e,loop=false,drift=[.5,.15]}={}){
    const group=new THREE.Group(), puffs=[...Array(n)].map((_,i)=>({m:mesh(geo().puff,mat(color,0),group),ph:i/n,a:rnd()*6,ox:(rnd()-.5)*s*.8,oz:(rnd()-.5)*s*.8}));
    return {group,update(t){ let alive=false;
      for(const p of puffs){ const u=loop?((t/life+p.ph)%1):(t-p.ph*life*.35)/life; if(u<0||u>1){ p.m.visible=false; if(u<0) alive=true; continue; } alive=true; p.m.visible=true;
        const k=s*(.45+u*1.1); p.m.position.set(p.ox+s*drift[0]*u*u*rise,s*.4+s*rise*ease(u*.9),p.oz+s*drift[1]*u*rise); p.m.scale.set(k,k*.8,k); p.m.rotation.y=p.a+u; p.m.material.opacity=.6*(1-u)*Math.min(1,u*8); }
      return loop||alive; }};
  }
  /* 爆風: 地面の R まで広がる輪（明るい細い輪＋土ぼこりの帯）、中心の光と土の丸屋根、飛ぶ破片、焦げ跡、あとに少しの煙。
     R: 爆風の届く半径。smokeK: 煙の量（0で無し）。 */
  function blast(R,{smokeK=1,warm=0xffe9c0,dust=0x9a8a70}={}){
    const group=new THREE.Group(), T=.75;
    const flash=mesh(geo().dome,mat(0xfff4d8,1,true),group), dome=mesh(geo().dome,mat(dust,.5),group), scorch=mesh(geo().disc,mat(0x1c1a18,.5),group),
      band=mesh(geo().band,mat(dust,.4),group), ring=mesh(geo().ring,mat(warm,1,true),group), ring2=mesh(geo().ring,mat(0xffffff,.7,true),group);
    scorch.position.y=.01; band.position.y=.03; ring.position.y=.05; ring2.position.y=.06;
    const chunks=[...Array(9)].map(()=>{ const a=rnd()*6.28, v=R*(.25+rnd()*.35); return {m:mesh(geo().chunk,mat(0x2a2622,1),group),vx:Math.cos(a)*v,vz:Math.sin(a)*v,vy:R*(.5+rnd()*.5),s:R*(.012+rnd()*.014)}; });
    const sm=smokeK?smoke(R*.075*smokeK,{n:4,life:4.5,rise:4}):null; if(sm) group.add(sm.group);
    return {group,update(t){
      const u=t/T, r=R*ease(u);
      flash.visible=t<.16; flash.scale.setScalar(R*(.1+t*1.2)); flash.material.opacity=Math.max(0,1-t/.16);
      dome.visible=t<.6; dome.scale.set(R*.3*ease(t/.45),R*.2*ease(t/.3),R*.3*ease(t/.45)); dome.material.opacity=.55*Math.max(0,1-t/.6);
      scorch.scale.setScalar(R*.11); scorch.material.opacity=.5*Math.max(0,1-t/6);
      ring.visible=ring2.visible=band.visible=t<T+.35; const fade=t<T?1:Math.max(0,1-(t-T)/.35);
      ring.scale.setScalar(Math.max(.001,r)); ring.material.opacity=fade; ring2.scale.setScalar(Math.max(.001,r*.985)); ring2.material.opacity=.7*fade*(1-u*.5);
      band.scale.setScalar(Math.max(.001,r)); band.material.opacity=.42*fade*(1-.5*Math.min(1,u));
      for(const c of chunks){ const y=c.vy*t-R*2.2*t*t; c.m.visible=y>=0; c.m.position.set(c.vx*t,y,c.vz*t); c.m.scale.setScalar(c.s); c.m.rotation.set(t*9,t*7,0); }
      const s=sm?sm.update(t-.15):false; return t<6||s; }};
  }
  /* 小さな着弾（直射・小火器）: 光と土ぼこりだけ */
  function hit(s,{sparks=true,dust=0x9a8a70}={}){
    const group=new THREE.Group(), flash=mesh(geo().star,mat(0xffe6a8,1,true),group), puffs=[...Array(3)].map(()=>({m:mesh(geo().puff,mat(dust,.5),group),a:rnd()*6.28,k:.6+rnd()*.6}));
    return {group,update(t){ flash.visible=sparks&&t<.09; flash.scale.setScalar(s*(1+t*14)); flash.rotation.z=1; flash.material.opacity=1-t/.09;
      for(const p of puffs){ const u=t/.9; p.m.visible=u<1; const k=s*p.k*(.4+u*1.3); p.m.scale.setScalar(k); p.m.position.set(Math.cos(p.a)*s*u*.9,s*(.2+u*1.1),Math.sin(p.a)*s*u*.9); p.m.material.opacity=.5*(1-u); }
      return t<.9; }};
  }
  /* 空中の破裂（対空砲）: 光と黒い煙の玉 */
  function airBurst(s){
    const group=new THREE.Group(), flash=mesh(geo().star,mat(0xfff0c0,1,true),group), ball=mesh(geo().puff,mat(0x2c2c30,.8),group);
    return {group,update(t){ flash.visible=t<.08; flash.scale.setScalar(s*(1.2+t*10)); ball.scale.setScalar(s*(.5+ease(t/.4)*.9)); ball.rotation.y=t; ball.material.opacity=.8*Math.max(0,1-t/1.4); return t<1.4; }};
  }
  /* 砲口の光: 前へ伸びる円すいと星形。s: 大きさ。group を砲口に置き、+Z を撃つ向きに向ける。smokeK: 砲煙の量 */
  function muzzle(s,{smokeK=0,life=.1}={}){
    const group=new THREE.Group(), cone=mesh(geo().cone,mat(0xffd27a,1,true),group), core=mesh(geo().cone,mat(0xffffff,1,true),group), star=mesh(geo().star,mat(0xffe9b0,1,true),group);
    cone.rotation.y=Math.PI; core.rotation.y=Math.PI; const sm=smokeK?smoke(s*.45*smokeK,{n:3,life:1.6,rise:1.5,color:0x8a8a8c}):null; if(sm){ sm.group.position.z=s*.8; group.add(sm.group); }
    return {group,update(t){ const u=t/life, on=u<1; cone.visible=core.visible=star.visible=on; cone.scale.set(s*.7,s*.7,s*(1.2+u)); core.scale.set(s*.3,s*.3,s*(.8+u)); star.scale.setScalar(s*(.7+u*.5)); star.rotation.z=.4;
      cone.material.opacity=core.material.opacity=star.material.opacity=1-u*.7; return on||(sm?sm.update(t):false); }};
  }
  /* 飛ぶ弾。path(u): 0〜1 の位置（THREE.Vector3）、dur: 秒。
     kind: tracer（光る筋）、shell（暗い弾と細い光）、rocket（噴射の光と煙の尾）、bomb（落ちる爆弾）。s: 大きさ */
  function shot(path,dur,kind='tracer',s=.1,{color=0xffd9a0}={}){
    const group=new THREE.Group(), head=new THREE.Group(); group.add(head);
    if(kind==='tracer'){ mesh(geo().bolt,mat(color,1,true),head).scale.set(s*.35,s*.35,s*5); mesh(geo().bolt,mat(0xffffff,1,true),head).scale.set(s*.14,s*.14,s*3); }
    else if(kind==='shell'){ mesh(geo().bolt,mat(0x2b2b2e,1),head).scale.set(s*.5,s*.5,s*1.6); const g=mesh(geo().bolt,mat(color,.7,true),head); g.scale.set(s*.22,s*.22,s*5); g.position.z=-s*3; }
    else if(kind==='bomb'){ mesh(geo().bolt,mat(0x34363a,1),head).scale.set(s*.6,s*.6,s*1.8); const f=mesh(geo().star,mat(0x34363a,1),head); f.scale.setScalar(s*.6); f.position.z=-s*.9; }
    else { mesh(geo().bolt,mat(0xd8dadc,1),head).scale.set(s*.4,s*.4,s*2.2); const f=mesh(geo().cone,mat(0xffc45a,1,true),head); f.scale.set(s*.7,s*.7,s*2.4); f.position.z=-s*1; f.rotation.y=Math.PI; f.position.z=-s*3.4; f.rotation.y=0; }
    const trail=kind==='rocket'?[...Array(14)].map(()=>({m:mesh(geo().puff,mat(0xc9c9cc,0),group),t0:-1,p:new THREE.Vector3()})):[]; let next=0,last=-1; const a=new THREE.Vector3(), b=new THREE.Vector3();
    return {group,update(t){ const u=Math.min(1,t/dur), fly=t<dur; head.visible=fly;
      if(fly){ a.copy(path(u)); b.copy(path(Math.min(1,u+.01))); head.position.copy(a); if(b.distanceToSquared(a)>1e-10) head.lookAt(b);
        if(trail.length&&t-last>dur/16){ last=t; const p=trail[next++%trail.length]; p.t0=t; p.p.copy(a); } }
      let alive=fly; for(const p of trail){ const v=p.t0<0?2:(t-p.t0)/1.3; p.m.visible=v<1; if(v<1){ alive=true; p.m.position.copy(p.p); p.m.position.y+=v*s*2; p.m.scale.setScalar(s*(.7+v*2.2)); p.m.material.opacity=.55*(1-v); } }
      return alive; }};
  }
  /* 噴射（W.A.S. の推進器）: 外の青い炎と中の白い芯。group を噴射口に置き、+Z を噴き出す向きに向ける。update(t,power)。power 0〜1.5 */
  function plume(s){
    const group=new THREE.Group(), outer=mesh(geo().cone,mat(0x58a6ff,.5),group), mid=mesh(geo().cone,mat(0xa9d6ff,.8),group), core=mesh(geo().cone,mat(0xffffff,1),group), ph=rnd()*9;
    for(const m of [outer,mid,core]) m.rotation.y=Math.PI;
    return {group,update(t,power=1){ const f=1+.12*Math.sin(t*37+ph)+.07*Math.sin(t*61+ph*2), L=s*power*f; group.visible=power>.02;
      outer.scale.set(s*.55,s*.55,L*1.7); mid.scale.set(s*.36,s*.36,L*1.1); core.scale.set(s*.2,s*.2,L*.55); return true; }};
  }
  return {smoke,blast,hit,airBurst,muzzle,shot,plume};
})();
