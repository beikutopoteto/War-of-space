/* 地上の効果（ユーザー 2026-11-17）: 射撃の光、弾、着弾、爆風、煙、W.A.S. の噴射。
   groundFire と同じ作り: どれも {group, update(t)} を返す。t は始まってからの秒。update は終わったら false を返す。
   炎は使わない（砲撃の着弾は煙を少しだけ）。爆風は、地面を広がる輪で届く範囲 R を見せる: 明るい前の縁、後ろの土ぼこりの帯と低い壁、
   中心の光、土の噴き上げ、火花。光はどれも、芯が白く外へ薄れるぼかしの絵（canvas で描く）を重ねて作る（第1回の白一色の星形と
   縁のくっきりした輪は「安っぽい」とのこと。ユーザー 2026-11-17）。
   見本の段階。ゲームにはまだ入れていない（docs/models.md 17）。 */
const GFX=(()=>{
  const mat=(c,o=1,add=false,map=null)=>new THREE.MeshBasicMaterial({color:c,map,transparent:true,opacity:o,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});
  const canvasTex=(w,h,draw)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); return new THREE.CanvasTexture(c); };
  const radial=(x,stops,r=1)=>{ const g=x.createRadialGradient(0,0,0,0,0,r); for(const [p,c] of stops) g.addColorStop(p,c); return g; };
  let G=null,T=null;
  /* ぼかしの絵: glow 丸い光、flame 砲口の炎（根元が白く先へ橙に薄れる）、streak 弾の筋（頭が明るく尾が薄れる）、
     edge 爆風の前の縁（細い明るい輪）、haze 縁の後ろの土ぼこり（幅のある輪）、wall 土ぼこりの壁（下が濃い）、soft 縁のぼけた円 */
  const tex=()=>T||(T={
    glow:canvasTex(128,128,(x,w)=>{ x.translate(w/2,w/2); x.fillStyle=radial(x,[[0,'rgba(255,255,255,1)'],[.18,'rgba(255,244,214,.95)'],[.45,'rgba(255,190,110,.42)'],[1,'rgba(255,140,60,0)']],w/2); x.fillRect(-w/2,-w/2,w,w); }),
    flame:canvasTex(256,64,(x,w,h)=>{ x.translate(w*.1,h/2); x.scale(1,h/2/(w*.9)); x.fillStyle=radial(x,[[0,'rgba(255,255,255,1)'],[.12,'rgba(255,250,220,1)'],[.34,'rgba(255,205,110,.85)'],[.62,'rgba(255,130,50,.42)'],[1,'rgba(200,70,20,0)']],w*.9); x.fillRect(-w,-w*2,w*3,w*4); }),
    streak:canvasTex(256,32,(x,w,h)=>{ const g=x.createLinearGradient(0,0,w,0); g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.6,'rgba(255,255,255,.35)'); g.addColorStop(.9,'rgba(255,255,255,1)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,w,h);
      const v=x.createLinearGradient(0,0,0,h); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(.5,'rgba(0,0,0,1)'); v.addColorStop(1,'rgba(0,0,0,0)'); x.globalCompositeOperation='destination-in'; x.fillStyle=v; x.fillRect(0,0,w,h); }),
    edge:canvasTex(512,512,(x,w)=>{ x.translate(w/2,w/2); x.fillStyle=radial(x,[[0,'rgba(255,255,255,0)'],[.86,'rgba(255,255,255,0)'],[.93,'rgba(255,236,200,.35)'],[.968,'rgba(255,255,255,1)'],[.985,'rgba(255,240,210,.5)'],[1,'rgba(255,255,255,0)']],w/2); x.fillRect(-w/2,-w/2,w,w); }),
    haze:canvasTex(256,256,(x,w)=>{ x.translate(w/2,w/2); x.fillStyle=radial(x,[[0,'rgba(255,255,255,0)'],[.45,'rgba(255,255,255,.06)'],[.8,'rgba(255,255,255,.45)'],[.95,'rgba(255,255,255,.8)'],[1,'rgba(255,255,255,0)']],w/2); x.fillRect(-w/2,-w/2,w,w); }),
    wall:canvasTex(8,64,(x,w,h)=>{ const g=x.createLinearGradient(0,h,0,0); g.addColorStop(0,'rgba(255,255,255,.9)'); g.addColorStop(.35,'rgba(255,255,255,.45)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,w,h); }),
    soft:canvasTex(128,128,(x,w)=>{ x.translate(w/2,w/2); x.fillStyle=radial(x,[[0,'rgba(255,255,255,1)'],[.55,'rgba(255,255,255,.8)'],[1,'rgba(255,255,255,0)']],w/2); x.fillRect(-w/2,-w/2,w,w); }) });
  /* cross: +Z へ長さ1、幅1の、十字に組んだ2枚の板（絵の横が長さ）。どの向きから見ても筋や炎に見える */
  const geo=()=>G||(G={ flat:new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2), tube:new THREE.CylinderGeometry(1,1,1,48,1,true).translate(0,.5,0),
    puff:new THREE.IcosahedronGeometry(1,0), puff2:new THREE.IcosahedronGeometry(1,1), bolt:new THREE.CylinderGeometry(.5,.5,1,5).rotateX(Math.PI/2),
    jet:new THREE.ConeGeometry(.5,1,6,1,true).translate(0,.5,0), cone:new THREE.ConeGeometry(.5,1,8,1,true).rotateX(-Math.PI/2).translate(0,0,-.5), fin:new THREE.BoxGeometry(1,.08,.5),
    cross:(()=>{ const g=new THREE.BufferGeometry(), P=[], U=[]; for(const [ax,ay] of [[1,0],[0,1]]){ const q=[[-.5,0,0,0],[.5,0,0,1],[.5,1,1,1],[-.5,1,1,0]]; for(const i of [0,1,2,0,2,3]){ const [a,z,u,v]=q[i]; P.push(a*ax,a*ay,z); U.push(u,v); } }
      g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2)); return g; })() });
  const mesh=(g,m,group)=>{ const x=new THREE.Mesh(g,m); group.add(x); return x; };
  const glow=(c,group)=>{ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex().glow,color:c,transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending})); group.add(s); return s; };
  const ease=u=>1-Math.pow(1-Math.min(1,Math.max(0,u)),3);
  let seed=7; const rnd=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  /* 火花: n 本の短い光の筋が飛び散って落ちる。v: 速さ、up: 上向きの強さ、g: 落ちる速さ */
  function sparks(group,n,v,up,g,len){ const list=[...Array(n)].map(()=>{ const a=rnd()*6.28, k=.4+rnd()*.6; return {m:mesh(geo().cross,mat(0xffd9a0,1,true,tex().streak),group),vx:Math.cos(a)*v*k,vz:Math.sin(a)*v*k,vy:up*(.5+rnd()*.7),life:.35+rnd()*.5}; }), p=new THREE.Vector3();
    return t=>{ for(const s of list){ const y=s.vy*t-g*t*t, on=t<s.life&&y>=0; s.m.visible=on; if(!on) continue; s.m.position.set(s.vx*t,y,s.vz*t); s.m.lookAt(group.localToWorld(p.set(s.vx*(t+.02),s.vy*(t+.02)-g*(t+.02)*(t+.02),s.vz*(t+.02)))); s.m.translateZ(-len); s.m.scale.set(len*.12,len*.12,len); s.m.material.opacity=1-t/s.life; } }; }

  /* 煙: n 個の灰色の塊が上って薄れる。s: 塊の大きさ、life: 1個の秒、rise: 上る高さ。loop: 出し続ける（噴煙） */
  function smoke(s,{n=4,life=4,rise=3,color=0x5a5a5e,loop=false,drift=[.5,.15]}={}){
    const group=new THREE.Group(), puffs=[...Array(n)].map((_,i)=>({m:mesh(geo().puff,mat(color,0),group),ph:i/n,a:rnd()*6,ox:(rnd()-.5)*s*.8,oz:(rnd()-.5)*s*.8}));
    return {group,update(t){ let alive=false;
      for(const p of puffs){ const u=loop?((t/life+p.ph)%1):(t-p.ph*life*.35)/life; if(u<0||u>1){ p.m.visible=false; if(u<0) alive=true; continue; } alive=true; p.m.visible=true;
        const k=s*(.45+u*1.1); p.m.position.set(p.ox+s*drift[0]*u*u*rise,s*.4+s*rise*ease(u*.9),p.oz+s*drift[1]*u*rise); p.m.scale.set(k,k*.8,k); p.m.rotation.y=p.a+u; p.m.material.opacity=.6*(1-u)*Math.min(1,u*8); }
      return loop||alive; }};
  }
  /* 爆風。R: 爆風の届く半径。smokeK: 煙の量（0で無し）。
     0〜0.2秒: 中心の白い光と地面を照らす光。0〜0.75秒: 輪が R まで広がる（明るい前の縁、後ろに土ぼこりの帯と低い壁）。
     0〜1.2秒: 土の噴き上げと土ぼこり、火花。あとに焦げ跡と少しの煙 */
  function blast(R,{smokeK=1,dust=0x8f7f66,dirt=0x4a3f33}={}){
    const group=new THREE.Group(), T0=.75, X=tex();
    const scorch=mesh(geo().flat,mat(0x161412,.6,false,X.soft),group), light=mesh(geo().flat,mat(0xffd9a0,1,true,X.glow),group), haze=mesh(geo().flat,mat(dust,.6,false,X.haze),group),
      wall=mesh(geo().tube,mat(dust,.5,false,X.wall),group), edge=mesh(geo().flat,mat(0xfff1d6,1,true,X.edge),group), flash=glow(0xffe2b0,group), core=glow(0xffffff,group);
    scorch.position.y=.01; light.position.y=.02; haze.position.y=.03; edge.position.y=.05;
    const jets=[...Array(8)].map((_,i)=>{ const m=mesh(geo().jet,mat(dirt,.9),group), a=i/8*6.28+rnd(), lean=i?(.25+rnd()*.5):0; m.rotation.set(Math.cos(a)*lean,0,Math.sin(a)*lean); return {m,h:R*(i?.16+rnd()*.14:.34),w:R*(.035+rnd()*.03),d:rnd()*.08}; });
    const clouds=[...Array(7)].map((_,i)=>({m:mesh(geo().puff2,mat(dust,.6),group),a:i/7*6.28+rnd(),k:.7+rnd()*.6}));
    const spark=sparks(group,12,R*.9,R*.55,R*1.4,R*.07), sm=smokeK?smoke(R*.075*smokeK,{n:4,life:4.5,rise:4}):null; if(sm) group.add(sm.group);
    return {group,update(t){
      const u=t/T0, r=Math.max(.001,R*ease(u)), fade=t<T0?1:Math.max(0,1-(t-T0)/.4);
      flash.visible=core.visible=t<.22; flash.scale.setScalar(R*(.5+t*3)); flash.material.opacity=Math.max(0,1-t/.22); flash.position.y=R*.05; core.scale.setScalar(R*(.22+t*.6)); core.material.opacity=Math.max(0,1-t/.12); core.position.y=R*.05;
      light.visible=t<.4; light.scale.setScalar(R*(.5+t*1.6)); light.material.opacity=.8*Math.max(0,1-t/.4);
      scorch.scale.setScalar(R*.14); scorch.material.opacity=.6*Math.max(0,1-t/7);
      edge.visible=haze.visible=wall.visible=fade>0;
      edge.scale.setScalar(r/.968); edge.material.opacity=fade*(1-.35*Math.min(1,u));
      haze.scale.setScalar(r); haze.material.opacity=.6*fade*(1-.4*Math.min(1,u));
      wall.scale.set(r*.97,R*.05*(.5+Math.min(1,u*2))*(1-.3*Math.min(1,u)),r*.97); wall.material.opacity=.5*fade;
      for(const j of jets){ const v=(t-j.d)/1.1, on=v>0&&v<1; j.m.visible=on; if(on){ const k=Math.sin(Math.PI*Math.pow(v,.6)); j.m.scale.set(j.w*(1+v*1.5),j.h*k,j.w*(1+v*1.5)); j.m.material.opacity=.9*(1-v*v); } }
      for(const c of clouds){ const v=t/1.6, on=v<1; c.m.visible=on; if(on){ const d=R*.13*ease(v)*c.k, k=R*.07*c.k*(.5+ease(v)*1.1); c.m.position.set(Math.cos(c.a)*d,k*.55,Math.sin(c.a)*d); c.m.scale.set(k,k*.7,k); c.m.rotation.y=c.a+v; c.m.material.opacity=.6*(1-v); } }
      spark(t); const s=sm?sm.update(t-.3):false; return t<7||s; }};
  }
  /* 小さな着弾（直射・小火器）: ぼかした光、火花、土ぼこり */
  function hit(s,{sparks:sp=true,dust=0x8f7f66}={}){
    const group=new THREE.Group(), fl=glow(0xffe0a8,group), puffs=[...Array(4)].map(()=>({m:mesh(geo().puff2,mat(dust,.5),group),a:rnd()*6.28,k:.6+rnd()*.6})), spark=sp?sparks(group,5,s*5,s*4,s*14,s*.9):null;
    return {group,update(t){ fl.visible=sp&&t<.1; fl.scale.setScalar(s*(2+t*16)); fl.material.opacity=Math.max(0,1-t/.1); fl.position.y=s*.3;
      for(const p of puffs){ const u=t/.9; p.m.visible=u<1; const k=s*p.k*(.4+u*1.3); p.m.scale.set(k,k*.8,k); p.m.position.set(Math.cos(p.a)*s*u*.9,s*(.2+u*1.1),Math.sin(p.a)*s*u*.9); p.m.material.opacity=.5*(1-u); }
      if(spark) spark(t); return t<.9; }};
  }
  /* 空中の破裂（対空砲）: 光、火花、黒い煙のかたまり */
  function airBurst(s){
    const group=new THREE.Group(), fl=glow(0xfff0c8,group), balls=[...Array(5)].map((_,i)=>({m:mesh(geo().puff2,mat(0x2c2c30,.8),group),d:new THREE.Vector3(rnd()-.5,rnd()-.5,rnd()-.5).normalize().multiplyScalar(i?.55:0),k:i?.5+rnd()*.3:.8})), spark=sparks(group,6,s*4,s*1.5,s*5,s*.7);
    return {group,update(t){ fl.visible=t<.1; fl.scale.setScalar(s*(3+t*14)); fl.material.opacity=Math.max(0,1-t/.1);
      for(const b of balls){ const e=ease(t/.45); b.m.position.copy(b.d).multiplyScalar(s*e); b.m.scale.setScalar(s*b.k*(.4+e*.8)); b.m.rotation.y=t; b.m.material.opacity=.8*Math.max(0,1-t/1.5); }
      spark(t); return t<1.5; }};
  }
  /* 砲口の光: 前へ伸びる炎（外と芯）、横へ吹く短い炎（side: 砲口制退器のある大きな砲）、丸い光、前へ飛ぶ火花、あとに砲煙。
     s: 大きさ。group を砲口に置き、+Z を撃つ向きに向ける。smokeK: 砲煙の量 */
  function muzzle(s,{smokeK=0,life=.11,side=false}={}){
    const group=new THREE.Group(), X=tex(), roll=rnd()*3, fl=(c,o)=>{ const m=mesh(geo().cross,mat(c,o,true,X.flame),group); m.rotation.z=roll; return m; };
    const outer=fl(0xffb060,.9), inner=fl(0xffffff,1), sides=side?[1,-1].map(d=>{ const m=fl(0xffc070,.9); m.rotation.set(0,d*1.75,0); return m; }):[], g=glow(0xffd9a0,group);
    const bits=[...Array(side?5:2)].map(()=>({m:mesh(geo().cross,mat(0xffd9a0,1,true,X.streak),group),x:(rnd()-.5)*.5,y:(rnd()-.5)*.5,v:5+rnd()*6}));
    const sm=smokeK?smoke(s*.45*smokeK,{n:3,life:1.6,rise:1.5,color:0x8a8a8c}):null; if(sm){ sm.group.position.z=s*.8; group.add(sm.group); }
    return {group,update(t){ const u=t/life, on=u<1, k=on?1-u*u:0, grow=.55+.45*ease(u*2.2);
      for(const m of [outer,inner,g,...sides]) m.visible=on;
      outer.scale.set(s*1.1*grow,s*1.1*grow,s*3.2*grow); inner.scale.set(s*.5*grow,s*.5*grow,s*1.9*grow); outer.material.opacity=.9*k; inner.material.opacity=k;
      for(const m of sides){ m.scale.set(s*.7*grow,s*.7*grow,s*1.5*grow); m.material.opacity=.9*k; }
      g.scale.setScalar(s*(2.2+u*1.5)); g.material.opacity=.9*k; g.position.z=s*.3;
      for(const b of bits){ const v=t/(life*2.2); b.m.visible=v<1; b.m.position.set(b.x*s*v*3,b.y*s*v*3,s*b.v*v-s*.6); b.m.scale.set(s*.07,s*.07,s*.6); b.m.material.opacity=1-v; }
      return t<life*2.2||(sm?sm.update(t):false); }};
  }
  /* 飛ぶ弾。path(u): 0〜1 の位置（THREE.Vector3）、dur: 秒。
     kind: tracer（光る筋: 頭が明るく尾が薄れる）、shell（暗い弾と、弾底の小さな光）、rocket（噴射の炎と光、煙の尾）、bomb（落ちる爆弾）。s: 大きさ */
  function shot(path,dur,kind='tracer',s=.1,{color=0xffc890}={}){
    const group=new THREE.Group(), head=new THREE.Group(), X=tex(); group.add(head);
    const streak=(c,w,len,o=1)=>{ const m=mesh(geo().cross,mat(c,o,true,X.streak),head); m.scale.set(w,w,len); m.position.z=-len*.95; return m; };
    if(kind==='tracer'){ streak(color,s*1.5,s*11,.8); streak(0xffffff,s*.6,s*6); glow(color,head).scale.setScalar(s*2.4); }
    else if(kind==='shell'){ mesh(geo().bolt,mat(0x2b2b2e,1),head).scale.set(s*.5,s*.5,s*1.6); streak(color,s*.9,s*6,.5); const g=glow(color,head); g.scale.setScalar(s*1.6); g.position.z=-s; }
    else if(kind==='bomb'){ mesh(geo().bolt,mat(0x34363a,1),head).scale.set(s*.6,s*.6,s*1.8); for(const r of [0,Math.PI/2]){ const f=mesh(geo().fin,mat(0x34363a,1),head); f.scale.setScalar(s*1.3); f.rotation.z=r; f.position.z=-s*.9; } }
    else { mesh(geo().bolt,mat(0xd8dadc,1),head).scale.set(s*.4,s*.4,s*2.2); const f=mesh(geo().cross,mat(0xffffff,1,true,X.flame),head); f.scale.set(s*1.3,s*1.3,s*4.5); f.rotation.y=Math.PI; f.position.z=-s*1.1; const g=glow(0xffc070,head); g.scale.setScalar(s*3.4); g.position.z=-s*1.6; }
    const trail=kind==='rocket'?[...Array(16)].map(()=>({m:mesh(geo().puff2,mat(0xd2d2d6,0),group),t0:-1,p:new THREE.Vector3()})):[]; let next=0,last=-1; const a=new THREE.Vector3(), b=new THREE.Vector3();
    return {group,update(t){ const u=Math.min(1,t/dur), fly=t<dur; head.visible=fly;
      if(fly){ a.copy(path(u)); b.copy(path(Math.min(1,u+.01))); head.position.copy(a); if(b.distanceToSquared(a)>1e-10) head.lookAt(b);
        if(trail.length&&t-last>dur/18){ last=t; const p=trail[next++%trail.length]; p.t0=t; p.p.copy(a); } }
      let alive=fly; for(const p of trail){ const v=p.t0<0?2:(t-p.t0)/1.4; p.m.visible=v<1; if(v<1){ alive=true; p.m.position.copy(p.p); p.m.position.y+=v*s*2; p.m.scale.setScalar(s*(.6+v*2.4)); p.m.material.opacity=.5*(1-v); } }
      return alive; }};
  }
  /* 噴射（W.A.S. の推進器）: 外の青い炎と中の白い芯。group を噴射口に置き、+Z を噴き出す向きに向ける。update(t,power)。power 0〜1.5 */
  function plume(s){
    const group=new THREE.Group(), outer=mesh(geo().cone,mat(0x58a6ff,.5),group), mid=mesh(geo().cone,mat(0xa9d6ff,.8),group), core=mesh(geo().cone,mat(0xffffff,1),group), g=glow(0x9ccfff,group), ph=rnd()*9;
    for(const m of [outer,mid,core]) m.rotation.y=Math.PI;
    return {group,update(t,power=1){ const f=1+.12*Math.sin(t*37+ph)+.07*Math.sin(t*61+ph*2), L=s*power*f; group.visible=power>.02;
      outer.scale.set(s*.55,s*.55,L*1.7); mid.scale.set(s*.36,s*.36,L*1.1); core.scale.set(s*.2,s*.2,L*.55); g.scale.setScalar(s*(.9+power*.8)*f); g.material.opacity=.55; return true; }};
  }
  return {smoke,blast,hit,airBurst,muzzle,shot,plume};
})();
