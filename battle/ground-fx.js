/* 地上の効果（ユーザー 2026-11-17）: 射撃の光、弾、着弾、爆風、煙、W.A.S. の噴射。
   groundFire と同じ作り: どれも {group, update(t)} を返す。t は始まってからの秒。update は終わったら false を返す。
   砲撃の着弾は、地面を転がる土煙の輪で届く範囲 R を見せ、煙が少し残る。
   光はどれも、芯が白く外へ薄れるぼかしの絵（canvas で描く）を重ねて作る（第1回の白一色の星形と
   縁のくっきりした輪は「安っぽい」とのこと。ユーザー 2026-11-17）。
   見本と地上戦で使う（docs/models.md 17）。 */
const GFX=(()=>{
  const mat=(c,o=1,add=false,map=null)=>new THREE.MeshBasicMaterial({color:c,map,transparent:true,opacity:o,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});
  const canvasTex=(w,h,draw)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); return new THREE.CanvasTexture(c); };
  const radial=(x,stops,r=1)=>{ const g=x.createRadialGradient(0,0,0,0,0,r); for(const [p,c] of stops) g.addColorStop(p,c); return g; };
  let G=null,T=null;
  /* ぼかしの絵: glow 丸い光、flame 砲口の炎（根元が白く先へ橙に薄れる）、streak 弾の筋（頭が明るく尾が薄れる）、
     haze 縁の後ろの土ぼこり（幅のある輪）、wall 土ぼこりの壁（下が濃い）、soft 縁のぼけた円 */
  const tex=()=>T||(T={
    glow:canvasTex(128,128,(x,w)=>{ x.translate(w/2,w/2); x.fillStyle=radial(x,[[0,'rgba(255,255,255,1)'],[.18,'rgba(255,244,214,.95)'],[.45,'rgba(255,190,110,.42)'],[1,'rgba(255,140,60,0)']],w/2); x.fillRect(-w/2,-w/2,w,w); }),
    flame:canvasTex(256,64,(x,w,h)=>{ x.translate(w*.1,h/2); x.scale(1,h/2/(w*.9)); x.fillStyle=radial(x,[[0,'rgba(255,255,255,1)'],[.12,'rgba(255,250,220,1)'],[.34,'rgba(255,205,110,.85)'],[.62,'rgba(255,130,50,.42)'],[1,'rgba(200,70,20,0)']],w*.9); x.fillRect(-w,-w*2,w*3,w*4); }),
    streak:canvasTex(256,32,(x,w,h)=>{ const g=x.createLinearGradient(0,0,w,0); g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.6,'rgba(255,255,255,.35)'); g.addColorStop(.9,'rgba(255,255,255,1)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,w,h);
      const v=x.createLinearGradient(0,0,0,h); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(.5,'rgba(0,0,0,1)'); v.addColorStop(1,'rgba(0,0,0,0)'); x.globalCompositeOperation='destination-in'; x.fillStyle=v; x.fillRect(0,0,w,h); }),
    haze:canvasTex(256,256,(x,w)=>{ x.translate(w/2,w/2); x.fillStyle=radial(x,[[0,'rgba(255,255,255,0)'],[.45,'rgba(255,255,255,.06)'],[.8,'rgba(255,255,255,.45)'],[.95,'rgba(255,255,255,.8)'],[1,'rgba(255,255,255,0)']],w/2); x.fillRect(-w/2,-w/2,w,w); }),
    wall:canvasTex(8,64,(x,w,h)=>{ const g=x.createLinearGradient(0,h,0,0); g.addColorStop(0,'rgba(255,255,255,.9)'); g.addColorStop(.35,'rgba(255,255,255,.45)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,w,h); }),
    soft:canvasTex(128,128,(x,w)=>{ x.translate(w/2,w/2); x.fillStyle=radial(x,[[0,'rgba(255,255,255,1)'],[.55,'rgba(255,255,255,.8)'],[1,'rgba(255,255,255,0)']],w/2); x.fillRect(-w/2,-w/2,w,w); }),
    /* ロケット等の柔らかい煙の粒。正円に見えないよう複数のぼかしをずらして重ねる（#525、2026-11-28） */
    smoke:canvasTex(128,128,(x,w)=>{
      const lobes=[[0,0,.36,.52],[-.13,-.07,.27,.38],[.14,-.05,.25,.36],[-.06,.13,.26,.34],[.1,.11,.24,.32],[.02,-.14,.22,.3]];
      for(const [ox,oy,r,a] of lobes){
        x.save(); x.translate(w*(.5+ox),w*(.5+oy));
        x.fillStyle=radial(x,[[0,`rgba(255,255,255,${a})`],[.42,`rgba(255,255,255,${a*.55})`],[.78,`rgba(255,255,255,${a*.14})`],[1,'rgba(255,255,255,0)']],w*r);
        x.fillRect(-w*r,-w*r,w*r*2,w*r*2); x.restore();
      }
    }) });
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
     0〜0.75秒: 土煙の輪が R まで広がる（転がる土煙の塊、後ろに土ぼこりの帯と低い壁）。
     0〜1.2秒: 土の噴き上げと土ぼこり。あとに焦げ跡と少しの煙 */
  function blast(R,{smokeK=1,dust=0x8f7f66,dirt=0x4a3f33,detail=true,surface=null}={}){
    const group=new THREE.Group(), T0=.75, X=tex();
    const scorch=mesh(geo().flat,mat(0x161412,.6,false,X.soft),group), haze=mesh(geo().flat,mat(dust,.6,false,X.haze),group),
      wall=mesh(geo().tube,mat(dust,.5,false,X.wall),group);
    /* 爆風の前の縁は、白い線ではなく、地面を転がって広がる土煙の輪で見せる（ユーザー 2026-11-17） */
    const frontN=detail?30:12,jetN=detail?8:4,cloudN=detail?7:4;
    const front=[...Array(frontN)].map((_,i)=>({m:mesh(geo().puff2,mat(i%3?0xa39a8a:0x8a8072,.6),group),a:(i+rnd()*.7)/frontN*6.28,k:.7+rnd()*.7,j:.94+rnd()*.07,sp:rnd()*6}));
    scorch.position.y=.01; haze.position.y=.03;
    const jets=[...Array(jetN)].map((_,i)=>{ const m=mesh(geo().jet,mat(dirt,.9),group), a=i/jetN*6.28+rnd(), lean=i?(.25+rnd()*.5):0; m.rotation.set(Math.cos(a)*lean,0,Math.sin(a)*lean); return {m,h:R*(i?.16+rnd()*.14:.34),w:R*(.035+rnd()*.03),d:rnd()*.08}; });
    const clouds=[...Array(cloudN)].map((_,i)=>({m:mesh(geo().puff2,mat(dust,.6),group),a:i/cloudN*6.28+rnd(),k:.7+rnd()*.6}));
    const sm=smokeK?smoke(R*.075*smokeK,{n:detail?4:2,life:4.5,rise:4}):null; if(sm) group.add(sm.group);
    return {group,update(t){
      const u=t/T0, r=Math.max(.001,R*ease(u)), fade=t<T0?1:Math.max(0,1-(t-T0)/.7);
      scorch.scale.setScalar(R*.14); scorch.material.opacity=.6*Math.max(0,1-t/7);
      haze.visible=wall.visible=fade>0;
      for(const f of front){
        f.m.visible=fade>0&&t>.03;if(!f.m.visible)continue;
        const k=R*.05*f.k*(.45+.9*Math.min(1,u)+(t>T0?(t-T0)*.8:0)),x=Math.cos(f.a)*r*f.j,z=Math.sin(f.a)*r*f.j;
        f.m.position.set(x,k*.55+(surface?surface(x,z):0),z);f.m.scale.set(k,k*.75,k);f.m.rotation.set(0,f.sp+t*2,t*3);f.m.material.opacity=.62*fade*(1-.3*Math.min(1,u));
      }
      haze.scale.setScalar(r); haze.material.opacity=.6*fade*(1-.4*Math.min(1,u));
      wall.scale.set(r*.97,R*.07*(.5+Math.min(1,u*2))*(1-.3*Math.min(1,u)),r*.97); wall.material.opacity=.55*fade;
      for(const j of jets){ const v=(t-j.d)/1.1, on=v>0&&v<1; j.m.visible=on; if(on){ const k=Math.sin(Math.PI*Math.pow(v,.6)); j.m.scale.set(j.w*(1+v*1.5),j.h*k,j.w*(1+v*1.5)); j.m.material.opacity=.9*(1-v*v); } }
      for(const c of clouds){ const v=t/1.6, on=v<1; c.m.visible=on; if(on){ const d=R*.13*ease(v)*c.k, k=R*.07*c.k*(.5+ease(v)*1.1); c.m.position.set(Math.cos(c.a)*d,k*.55,Math.sin(c.a)*d); c.m.scale.set(k,k*.7,k); c.m.rotation.y=c.a+v; c.m.material.opacity=.6*(1-v); } }
      const s=sm?sm.update(t-.3):false; return t<7||s; }};
  }
  /* 小さな着弾（直射・小火器）: ぼかした光、火花、土ぼこり */
  function hit(s,{sparks:sp=true,dust=0x8f7f66,detail=true}={}){
    const group=new THREE.Group(), fl=glow(0xffe0a8,group), puffs=[...Array(detail?4:1)].map(()=>({m:mesh(geo().puff2,mat(dust,.5),group),a:rnd()*6.28,k:.6+rnd()*.6})), spark=sp&&detail?sparks(group,5,s*5,s*4,s*14,s*.9):null;
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
  function muzzle(s,{smokeK=0,life=.11,side=false,detail=true}={}){
    const group=new THREE.Group(), X=tex(), roll=rnd()*3, fl=(c,o)=>{ const m=mesh(geo().cross,mat(c,o,true,X.flame),group); m.rotation.z=roll; return m; };
    const outer=fl(0xffb060,.9), inner=detail?fl(0xffffff,1):null, sides=side?[1,-1].map(d=>{ const m=fl(0xffc070,.9); m.rotation.set(0,d*1.75,0); return m; }):[], g=glow(0xffd9a0,group);
    const bits=[...Array(detail?(side?5:2):0)].map(()=>({m:mesh(geo().cross,mat(0xffd9a0,1,true,X.streak),group),x:(rnd()-.5)*.5,y:(rnd()-.5)*.5,v:5+rnd()*6}));
    const sm=smokeK?smoke(s*.45*smokeK,{n:detail?3:1,life:1.6,rise:1.5,color:0x8a8a8c}):null; if(sm){ sm.group.position.z=s*.8; group.add(sm.group); }
    return {group,update(t){ const u=t/life, on=u<1, k=on?1-u*u:0, grow=.55+.45*ease(u*2.2);
      outer.visible=g.visible=on;
      outer.scale.set(s*1.1*grow,s*1.1*grow,s*3.2*grow); outer.material.opacity=.9*k;
      if(inner){inner.visible=on;inner.scale.set(s*.5*grow,s*.5*grow,s*1.9*grow);inner.material.opacity=k;}
      for(const m of sides){ m.visible=on; m.scale.set(s*.7*grow,s*.7*grow,s*1.5*grow); m.material.opacity=.9*k; }
      g.scale.setScalar(s*(2.2+u*1.5)); g.material.opacity=.9*k; g.position.z=s*.3;
      for(const b of bits){ const v=t/(life*2.2); b.m.visible=v<1; b.m.position.set(b.x*s*v*3,b.y*s*v*3,s*b.v*v-s*.6); b.m.scale.set(s*.07,s*.07,s*.6); b.m.material.opacity=1-v; }
      return t<life*2.2||(sm?sm.update(t):false); }};
  }
  /* 飛ぶ弾。path(u): 0〜1 の位置（THREE.Vector3）、dur: 秒。
     kind: tracer（光る筋: 頭が明るく尾が薄れる）、shell（暗い弾と、弾底の小さな光）、rocket（噴射の炎と光、煙の尾）、bomb（落ちる爆弾）。s: 大きさ */
  function shot(path,dur,kind='tracer',s=.1,{color=0xffc890,smoke=1,flame=1}={}){ // smoke: 煙の粒の大きさの倍率（W.A.S. の対艦ロケットは無誘導ロケットより細い）。flame: ロケットの推進の炎と光の倍率
    const group=new THREE.Group(), head=new THREE.Group(), X=tex(); group.add(head);
    // 筋の尾は飛んだ距離まで。撃った直後に尾が銃口より後ろ（撃った機体の背中側）へ突き出ない（#525、2026-11-28）
    const streaks=[], streak=(c,w,len,o=1)=>{ const m=mesh(geo().cross,mat(c,o,true,X.streak),head); m.scale.set(w,w,len); m.position.z=-len*.95; streaks.push({m,len}); return m; };
    if(kind==='tracer'){ streak(color,s*1.5,s*11,.8); streak(0xffffff,s*.6,s*6); glow(color,head).scale.setScalar(s*2.4); }
    else if(kind==='shell'){ mesh(geo().bolt,mat(0x2b2b2e,1),head).scale.set(s*.5,s*.5,s*1.6); streak(color,s*.9,s*6,.5); const g=glow(color,head); g.scale.setScalar(s*1.6); g.position.z=-s; }
    else if(kind==='bomb'){ mesh(geo().bolt,mat(0x34363a,1),head).scale.set(s*.6,s*.6,s*1.8); for(const r of [0,Math.PI/2]){ const f=mesh(geo().fin,mat(0x34363a,1),head); f.scale.setScalar(s*1.3); f.rotation.z=r; f.position.z=-s*.9; } }
    else { mesh(geo().bolt,mat(0xd8dadc,1),head).scale.set(s*.4,s*.4,s*2.2); const fs=s*flame, f=mesh(geo().cross,mat(0xffffff,1,true,X.flame),head); f.scale.set(fs*1.3,fs*1.3,fs*4.5); f.rotation.y=Math.PI; f.position.z=-s*1.1; const g=glow(0xffc070,head); g.scale.setScalar(fs*3.4); g.position.z=-s*1.1-fs*.5; }
    // ロケットの煙の尾: ぼかしテクスチャのスプライト36個を使い回し、進んだ道に沿って重ねて出して一続きの帯にする（#525、2026-11-28）
    const smokePalette=[0xdad8d2,0xcdd0d6,0xc0c4cc,0xd2d0ca];
    const trail=kind==='rocket'?[...Array(36)].map(()=>{
      const m=new THREE.Sprite(new THREE.SpriteMaterial({map:X.smoke,color:smokePalette[Math.floor(rnd()*smokePalette.length)],transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
      m.visible=false; group.add(m);
      return {m,t0:-1,life:1.2,p:new THREE.Vector3(),vx:0,vy:0,vz:0,size0:1,grow:2.6,aspect:1,rot0:0,spin:0,alpha:.2};
    }):[];
    const stepT=trail.length&&dur>0?Math.min(dur/34,.042):0, minGapSq=(s*.42)*(s*.42);
    let next=0,emitted=-stepT,hasLast=false; const a=new THREE.Vector3(), b=new THREE.Vector3(), lastSmoke=new THREE.Vector3();
    const spawnSmoke=(atT)=>{
      const su=Math.min(1,Math.max(0,atT/dur)), pt=path(su);
      if(hasLast&&pt.distanceToSquared(lastSmoke)<minGapSq)return;
      lastSmoke.copy(pt); hasLast=true;
      const p=trail[next++%trail.length];
      p.t0=atT;
      p.p.copy(pt);
      p.p.x+=(rnd()-.5)*s*.35; p.p.y+=(rnd()-.5)*s*.28; p.p.z+=(rnd()-.5)*s*.35;
      p.vx=(rnd()-.5)*s*(.45+rnd()*.85); p.vy=s*(.9+rnd()*1.7); p.vz=(rnd()-.5)*s*(.45+rnd()*.85);
      p.size0=s*smoke*(1.25+rnd()*.75); p.grow=(1.9+rnd()*1.8)*(.6+.4*smoke); p.aspect=.86+rnd()*.3;
      p.rot0=rnd()*6.283; p.spin=(rnd()-.5)*1.5;
      // 煙は少し残る（ユーザー 2026-11-28「煙は少し残るように」）: 3〜4.5秒かけて広がって薄れる（仮）。描く枠の長さは GFX.rocketSmokeSec
      p.life=3+rnd()*1.5; p.alpha=.2+rnd()*.12;
    };
    return {group,update(t){ const u=Math.min(1,t/dur), fly=t<dur; head.visible=fly;
      if(fly){ a.copy(path(u)); b.copy(path(Math.min(1,u+.01))); head.position.copy(a); if(b.distanceToSquared(a)>1e-10) head.lookAt(b);
        if(streaks.length){ const flown=a.distanceTo(path(0)); for(const st of streaks){ const l=Math.max(1e-4,Math.min(st.len,flown)); st.m.scale.z=l; st.m.position.z=-l*.95; } } }
      if(trail.length&&stepT>0&&emitted<dur){
        const endT=Math.min(t,dur);
        if(emitted<t-1.45)emitted=t-1.45;
        while(emitted+stepT<=endT+1e-6){ emitted+=stepT; spawnSmoke(emitted); }
      }
      let alive=fly; for(const p of trail){ const v=p.t0<0?2:(t-p.t0)/p.life; p.m.visible=v>=0&&v<1; if(p.m.visible){ alive=true;
        const e=ease(v), k=p.size0*(1+e*p.grow);
        p.m.position.set(p.p.x+p.vx*e,p.p.y+p.vy*e,p.p.z+p.vz*e);
        p.m.scale.set(k*p.aspect,k/p.aspect,1);
        p.m.material.rotation=p.rot0+p.spin*v;
        p.m.material.opacity=p.alpha*Math.min(1,v*12)*(1-v)*(1-v*.55); } }
      return alive; }};
  }
  /* 噴射（W.A.S. の推進器）: 外の青い炎と中の白い芯。group を噴射口に置き、+Z を噴き出す向きに向ける。 */
  function plume(s){
    const group=new THREE.Group(), outer=mesh(geo().cone,mat(0x58a6ff,.5),group), mid=mesh(geo().cone,mat(0xa9d6ff,.8),group), core=mesh(geo().cone,mat(0xffffff,1),group), g=glow(0x9ccfff,group), ph=rnd()*9;
    for(const m of [outer,mid,core]) m.rotation.y=Math.PI;
    return {group,update(t,power=1,length=1,detail=true){ const f=1+.12*Math.sin(t*37+ph)+.07*Math.sin(t*61+ph*2), L=s*power*f*length; group.visible=power>.02;
      outer.scale.set(s*.55,s*.55,L*1.7); mid.visible=core.visible=detail;
      if(detail){mid.scale.set(s*.36,s*.36,L*1.1);core.scale.set(s*.2,s*.2,L*.55);}
      g.scale.setScalar(s*(.9+power*.8)*f); g.material.opacity=Math.min(.9,.55+(length-1)*.2); return true; }};
  }
  // 落下の軌道をたどる煙。粒の数は固定し、落ちた後も最後の煙だけ少し残す。
  function wreckTrail(size,path,dur,{smokePuffs,smokeSec}){
    const group=new THREE.Group(),X=tex();
    const flame=mesh(geo().cross,mat(0xffaa52,1,true,X.flame),group);
    const light=glow(0xff9a43,group),point=new THREE.Vector3(),tail=new THREE.Vector3();
    const puffs=Array.from({length:smokePuffs},()=>({
      sprite:new THREE.Sprite(new THREE.SpriteMaterial({map:X.smoke,color:0x3c3532,transparent:true,depthWrite:false,toneMapped:false})),
      turn:rnd()*Math.PI*2
    }));
    for(const {sprite} of puffs)group.add(sprite);
    const interval=smokeSec/smokePuffs;
    return {group,update(t){
      light.visible=flame.visible=t<dur;
      if(flame.visible){
        path(t,point);path(Math.max(0,t-.12),tail);
        tail.y+=size*.5;
        flame.position.copy(point);
        flame.lookAt(group.localToWorld(tail));
        flame.scale.set(size*.75,size*.75,size*(1.6+.35*Math.sin(t*67)));
        light.position.copy(point);light.scale.setScalar(size*1.45);
      }
      const newest=Math.floor(Math.min(t,dur)/interval);
      for(let i=0;i<puffs.length;i++){
        const {sprite,turn}=puffs[i],at=(newest-i)*interval,age=(t-at)/smokeSec;
        sprite.visible=at>=0&&age<1;
        if(!sprite.visible)continue;
        path(at,sprite.position);
        sprite.position.x+=Math.cos(turn)*size*.6*age;
        sprite.position.z+=Math.sin(turn)*size*.6*age;
        sprite.position.y+=size*(.25+age);
        sprite.scale.setScalar(size*(1+2*age));
        sprite.material.opacity=.88*(1-age);
        sprite.material.rotation=turn+age;
      }
      return t<dur+smokeSec;
    }};
  }
  // 戦車の直射は見本と同じ値を使い、ゲーム側で車体の表示倍率を掛ける。
  const tank={muzzleSize:.45,muzzleOptions:{smokeK:1,side:true},tracerSize:.12,duration:.16,impactRadius:2,impactSmoke:.7};
  // #504・#525 の見本の値（仮）。1回の連射0.8秒・16発（0.05秒間隔）で射撃間隔1秒に収める。損害は地上戦の規則が持つ。
  const gatling={rounds:16,burst:.8,tracer:.03,fly:.14,flash:.09,flashLife:.06,flashMin:.8,flashMax:1.2,
    spread:.18,spreadHeightBias:.3,hit:.12,hitEvery:2,hitLife:.5};
  return {smoke,blast,hit,airBurst,muzzle,shot,plume,wreckTrail,tank,gatling,rocketSmokeSec:4.6,visualRandom:rnd};
})();
