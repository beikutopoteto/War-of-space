/* 効果と W.A.S. の動きの見本を1枚の HTML にまとめる。node tools/fx-sheet.cjs --out .shots/fx-sheet.html */
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),CDN='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
/* このページの中で動く。THREE、形のスクリプト、GFX だけを使う。 */
function fxPage(){
  const TEAM=[0x4aa3ff,0xff5a4a], V=(x,y,z)=>new THREE.Vector3(x,y,z), still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const unitMat=t=>{ const c=new THREE.Color(TEAM[t]); return new THREE.MeshStandardMaterial({color:c.clone().multiplyScalar(.5),emissive:c,emissiveIntensity:.22,metalness:.35,roughness:.5,vertexColors:true}); };
  const mats=[unitMat(0),unitMat(1)], geos={}, geo=k=>geos[k]||(geos[k]=groundShapeGeo(k));
  function stage(canvas,{dist=6,target=[0,.8,0],yaw=.9,pitch=.32}={}){
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true}); renderer.setPixelRatio(Math.min(2,devicePixelRatio||1)); renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene(); scene.background=new THREE.Color(0x8fa3b0); scene.fog=new THREE.Fog(0x8fa3b0,60,220);
    const camera=new THREE.PerspectiveCamera(38,1,.05,400), view={dist,target:V(...target),yaw,pitch};
    scene.add(new THREE.HemisphereLight(0xdfe9f2,0x5b5a48,.95)); const sun=new THREE.DirectionalLight(0xfff2dc,1.1); sun.position.set(6,10,4); scene.add(sun);
    const tex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d'); x.fillStyle='#7c7f5c'; x.fillRect(0,0,128,128);
      for(let i=0;i<260;i++){ x.fillStyle=`rgba(${60+Math.random()*60|0},${70+Math.random()*50|0},${40+Math.random()*30|0},.35)`; x.fillRect(Math.random()*128,Math.random()*128,3+Math.random()*7,2+Math.random()*4); }
      const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(60,60); return t; })();
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400).rotateX(-Math.PI/2),new THREE.MeshLambertMaterial({map:tex})); scene.add(ground);
    let drag=null; canvas.style.touchAction='pan-y';
    canvas.addEventListener('pointerdown',e=>{ drag={x:e.clientX,y:e.clientY}; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove',e=>{ if(!drag) return; view.yaw-=(e.clientX-drag.x)*.008; view.pitch=Math.max(.05,Math.min(1.45,view.pitch+(e.clientY-drag.y)*.006)); drag={x:e.clientX,y:e.clientY}; });
    for(const n of ['pointerup','pointercancel']) canvas.addEventListener(n,()=>drag=null);
    canvas.addEventListener('wheel',e=>{ e.preventDefault(); view.dist*=Math.exp(e.deltaY*.001); },{passive:false});
    function render(){ const w=canvas.clientWidth,h=canvas.clientHeight; if(canvas.width!==Math.round(w*renderer.getPixelRatio())){ renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
      const c=Math.cos(view.pitch); camera.position.set(view.target.x+Math.sin(view.yaw)*c*view.dist,view.target.y+Math.sin(view.pitch)*view.dist,view.target.z+Math.cos(view.yaw)*c*view.dist); camera.lookAt(view.target); renderer.render(scene,camera); }
    return {scene,view,tex,render};
  }
  /* 効果の一覧: 始めた時刻から update を呼び、false で片付ける */
  function fxList(scene){ const list=[]; return { add(fx,pos,look,at=0){ if(pos) fx.group.position.copy(pos); if(look) fx.group.lookAt(look); fx.group.visible=false; scene.add(fx.group); list.push({fx,at}); return fx; },
    step(now){ for(let i=list.length-1;i>=0;i--){ const e=list[i]; if(now<e.at) continue; e.fx.group.visible=true; if(e.fx.update(now-e.at)===false){ scene.remove(e.fx.group); list.splice(i,1); } } },
    clear(){ for(const e of list) scene.remove(e.fx.group); list.length=0; } }; }
  const buttons=(el,items,on)=>{ items.forEach((it,i)=>{ const b=document.createElement('button'); b.type='button'; b.textContent=it.label; b.setAttribute('aria-pressed',i===0); b.onclick=()=>{ [...el.children].forEach(c=>c.setAttribute('aria-pressed',c===b)); on(it); }; el.appendChild(b); }); };

  /* ---- A: W.A.S. の動き ---- */
  (()=>{ const S=stage(document.getElementById('wasCanvas'),{dist:5.2,target:[0,.95,0],yaw:2.3,pitch:.22}), F=fxList(S.scene), note=document.getElementById('wasNote');
    window.FXV=S.view; const keys=['was4','wasWalk1','wasWalk2','wasWalk3','wasWalk4','wasFire','wasFly','wasFlyFire','wasFlyMove','wasFlyUp','wasFlyDown'], body=new THREE.Group(), meshes={}, data={}; S.scene.add(body);
    for(const k of keys){ const parts=GROUND_SHAPES[k](); data[k]={nozzles:parts.nozzles,muzzle:parts.muzzle,guns:parts.guns}; for(const g of parts) g.dispose(); meshes[k]=new THREE.Mesh(geo(k),mats[0]); meshes[k].visible=false; body.add(meshes[k]); }
    const plumes=[0,1,2,3].map(()=>{ const p=GFX.plume(.16); body.add(p.group); return p; });
    const modes=[
      {label:'歩行',text:'4こまの歩き。盾を前に構えたまま、足に合わせて腕が少し前後します。',key:t=>'wasWalk'+(1+Math.floor(t/.24)%4),y:t=>.012*Math.sin(t/.24*Math.PI),scroll:1.1,power:0},
      {label:'射撃',text:'腰を落として踏んばり、盾を体の前に斜めに構えます。右腕のバルカンを盾の上に乗せて撃ち、背の砲も撃ちます。',key:()=>'wasFire',y:()=>0,scroll:0,power:0,fire:true},
      {label:'飛行・待機',text:'その場に浮きます。足を下げ、噴射は弱めです。',key:()=>'wasFly',y:t=>1.5+.06*Math.sin(t*1.7),scroll:0,power:.55},
      {label:'飛行・射撃',text:'空中でも同じ構えで、敵に向いて撃ちます。',key:()=>'wasFlyFire',y:t=>1.5+.05*Math.sin(t*1.7),scroll:0,power:.6,fire:true},
      {label:'飛行・移動',text:'体を前へ倒し、足を後ろへ流します。盾は前に構えたまま。噴射は強めです。',key:()=>'wasFlyMove',y:t=>1.5+.04*Math.sin(t*2.3),scroll:5,power:1.25},
      {label:'上昇',text:'体を伸ばして上がります。噴射はいちばん強いです。',key:()=>'wasFlyUp',y:t=>.9+(t%2.4)*1,scroll:0,power:1.5},
      {label:'下降',text:'足を前に出して降ります。噴射は弱く、着く前に少し強まります。',key:()=>'wasFlyDown',y:t=>3.2-(t%2.4)*1,scroll:0,power:t=>.3+.5*Math.max(0,(t%2.4)-1.6)}];
    let mode=modes[0], t0=performance.now()/1000, lastShot=-9, lastGun=-9, gun=0;
    buttons(document.getElementById('wasModes'),modes,m=>{ mode=m; t0=performance.now()/1000; lastShot=lastGun=-9; F.clear(); note.textContent=m.text; }); note.textContent=mode.text;
    function frame(){ const now=performance.now()/1000, t=still?0:now-t0, k=mode.key(t), d=data[k];
      for(const key of keys) meshes[key].visible=key===k; body.position.y=mode.y(t); S.view.target.y=.95+Math.min(1.6,body.position.y); S.tex.offset.y=-(t*mode.scroll*.15)%1;
      const power=typeof mode.power==='function'?mode.power(t):mode.power;
      d.nozzles.forEach((n,i)=>{ const p=plumes[i]; p.group.position.set(...n.p); p.group.lookAt(body.localToWorld(V(n.p[0]+n.d[0],n.p[1]+n.d[1],n.p[2]+n.d[2]))); p.update(t,power*n.k); });
      body.position.z=0;
      if(mode.fire&&!still){
        if(t-lastShot>1.7){ lastShot=t; const m=V(...d.muzzle).add(V(0,body.position.y,0)), end=V(m.x,m.y-.2,m.z+26); F.add(GFX.muzzle(.34,{smokeK:1}),m,V(m.x,m.y,m.z+1),now); F.add(GFX.shot(u=>m.clone().lerp(end,u),.22,'tracer',.13),null,null,now); F.add(GFX.hit(.5),end.clone().setY(0),null,now+.22); }
        const rec=Math.max(0,1-(t-lastShot)/.25); body.position.z=-.07*rec;
        if(t%1.7>.7&&t%1.7<1.5&&t-lastGun>.07){ lastGun=t; const g=V(...d.guns[gun++%2]).add(V(0,body.position.y,0)), end=V(g.x+(Math.random()-.5)*1.4,.1,g.z+22); F.add(GFX.muzzle(.13),g,V(g.x,g.y,g.z+1),now); F.add(GFX.shot(u=>g.clone().lerp(end,u),.2,'tracer',.07,{color:0xffc070}),null,null,now); F.add(GFX.hit(.2),end,null,now+.2); } }
      F.step(now); S.render(); requestAnimationFrame(frame); }
    frame(); })();

  /* ---- B: 射撃・弾道・着弾 ---- */
  (()=>{ const S=stage(document.getElementById('fxCanvas')), F=fxList(S.scene), note=document.getElementById('fxNote'), units=new THREE.Group(); S.scene.add(units);
    const spec=(kind,side)=>groundModelFor(kind,side), rnd=(a=1)=>(Math.random()-.5)*2*a;
    /* 隊を置く: 体ごとの位置と砲口（箱の前の上寄り）を返す */
    function place(kind,team,z,face,y=0){ const s=spec(kind,team?'mars':'earth'), g=geo(s.key); g.computeBoundingBox(); const b=g.boundingBox, form=GROUND_FORMS[s.form]||[[0,0]];
      return form.map(([fx,fz])=>{ const m=new THREE.Mesh(g,mats[team]); m.scale.setScalar(s.size); m.position.set(fx*s.size*1.6,y,z+fz*s.size*1.6*face); m.rotation.y=face>0?0:Math.PI; units.add(m);
        return {m,pos:m.position,muzzle:(h=.78)=>V(m.position.x,y+b.max.y*s.size*h,m.position.z+face*b.max.z*s.size*.95),top:b.max.y*s.size}; }); }
    const arc=(a,b,h)=>u=>V(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u+h*4*u*(1-u),a.z+(b.z-a.z)*u);
    const line=(a,b)=>u=>a.clone().lerp(b,u);
    const scenes=[
      {label:'自走砲',text:'砲口の光と砲煙。弾は山なりに飛び、着弾で輪が爆風の届く所（約1.75 km）まで広がります。炎はなく、煙が少し残ります。',dist:46,pitch:.42,period:5.2,
        setup(){ this.a=place('artillery',0,-15,1); this.b=place('vehicle',1,15,-1); }, fire(now){ this.a.forEach((u,i)=>{ const t=now+i*.5, m=u.muzzle(1), end=V(rnd(2.5),0,15+rnd(2.5));
          F.add(GFX.muzzle(.7,{smokeK:1.4,life:.14,side:true}),m,V(m.x,m.y+.6,m.z+1),t); F.add(GFX.shot(arc(m,end,9),1.7,'shell',.16),null,null,t); F.add(GFX.blast(7),end,null,t+1.7); }); }},
      {label:'ロケット',text:'6発を続けて撃ち、白い煙の尾を引きます。着弾ごとに輪が広がります。',dist:50,pitch:.42,period:6.5,
        setup(){ this.a=place('guidedRocket',0,-16,1); this.b=place('infantry',1,16,-1); }, fire(now){ for(let i=0;i<6;i++){ const u=this.a[i%3], t=now+i*.22, m=u.muzzle(1.05), end=V(rnd(4),0,16+rnd(4));
          F.add(GFX.muzzle(.5,{smokeK:1.2}),m,V(m.x,m.y+1,m.z-1),t); F.add(GFX.shot(arc(m,end,10),2,'rocket',.2),null,null,t); F.add(GFX.blast(7,{smokeK:.8}),end,null,t+2); } }},
      {label:'爆撃',text:'支援機が通りすぎながら爆弾を落とします。輪は約2.25 km まで広がります。',dist:54,pitch:.36,period:6.5,
        setup(){ this.b=place('vehicle',1,6,-1); this.p=place('supportAircraft',0,-40,1,9)[0]; }, fire(now){ this.t0=now; for(let i=0;i<4;i++){ const t=now+1.1+i*.28, z0=-40+(1.1+i*.28)*18, a=V(0,8.6,z0), end=V(rnd(1.5),0,z0+13);
          F.add(GFX.shot(u=>V(a.x+(end.x-a.x)*u,a.y-8.6*u*u,a.z+(end.z-a.z)*u),1.3,'bomb',.2),null,null,t); F.add(GFX.blast(9),end,null,t+1.3); } },
        tick(now){ this.p.m.position.z=-40+(now-(this.t0??now))*18; }},
      {label:'艦砲',text:'艦の主砲。光と砲煙が大きく、輪は約2.5 km まで広がります。',dist:62,pitch:.4,period:6,
        setup(){ this.a=place('sea:cl',0,-22,1); this.b=place('artillery',1,20,-1); const w=new THREE.Mesh(new THREE.PlaneGeometry(400,60).rotateX(-Math.PI/2),new THREE.MeshLambertMaterial({color:0x3f6f8c})); w.position.set(0,.02,-40); units.add(w); },
        fire(now){ for(let i=0;i<2;i++){ const u=this.a[0], t=now+i*.4, m=V(rnd(.1),u.top*.55,-22+1.2), end=V(rnd(3),0,20+rnd(3));
          F.add(GFX.muzzle(1,{smokeK:1.6,life:.16,side:true}),m,V(m.x,m.y+.5,m.z+1),t); F.add(GFX.shot(arc(m,end,10),2,'shell',.22),null,null,t); F.add(GFX.blast(10),end,null,t+2); } }},
      {label:'戦車',text:'直射。砲口の光と砲煙、速い光の筋、当たった所に小さな輪と土ぼこり。',dist:20,pitch:.3,period:3.2,
        setup(){ this.a=place('vehicle',0,-7,1); this.b=place('vehicle',1,7,-1); }, fire(now){ this.a.forEach((u,i)=>{ const t=now+i*.45, m=u.muzzle(.8), tg=this.b[i%this.b.length], end=V(tg.pos.x+rnd(.3),.3,tg.pos.z-.4);
          F.add(GFX.muzzle(.45,{smokeK:1,side:true}),m,V(m.x,m.y,m.z+1),t); F.add(GFX.shot(line(m,end),.16,'tracer',.12),null,null,t); F.add(GFX.blast(2,{smokeK:.7}),end.clone().setY(0),null,t+.16); }); }},
      {label:'歩兵',text:'小銃の細い筋と、当たった所の小さな土ぼこり。',dist:11,pitch:.28,period:1.5,
        setup(){ this.a=place('infantry',0,-3.5,1); this.b=place('infantry',1,3.5,-1); }, fire(now){ for(const u of this.a) for(let k=0;k<3;k++){ const t=now+Math.random()*1.2+k*.09, m=u.muzzle(.8), end=V(rnd(1.6),.05+Math.random()*.3,3.5+rnd(.6));
          F.add(GFX.muzzle(.07),m,V(m.x,m.y,m.z+1),t); F.add(GFX.shot(line(m,end),.12,'tracer',.035),null,null,t); F.add(GFX.hit(.1,{sparks:false}),end.clone().setY(0),null,t+.12); } }},
      {label:'重強化歩兵',text:'腰の機関砲の連射。筋が太く、数が多いです。',dist:11,pitch:.28,period:1.6,
        setup(){ this.a=place('heavyInfantry',0,-3.5,1); this.b=place('infantry',1,3.5,-1); }, fire(now){ for(const u of this.a){ const s=Math.random()*.5; for(let k=0;k<7;k++){ const t=now+s+k*.07, m=u.muzzle(.55), end=V(u.pos.x+rnd(.8),.1,3.5+rnd(.5));
          F.add(GFX.muzzle(.1),m,V(m.x,m.y,m.z+1),t); F.add(GFX.shot(line(m,end),.11,'tracer',.05,{color:0xffc070}),null,null,t); F.add(GFX.hit(.14),end.clone().setY(0),null,t+.11); } } }},
      {label:'自走対空砲',text:'空へ伸びる連射の筋と、機体のそばで破裂する黒い煙。',dist:24,pitch:.12,period:2.4,target:[0,3.5,0],
        setup(){ this.a=place('mobileAA',0,-6,1); this.b=place('attack',1,7,-1,7); }, fire(now){ this.a.forEach((u,i)=>{ for(let k=0;k<12;k++){ const t=now+i*.2+k*.08, m=u.muzzle(1), end=V(rnd(2.5),7+rnd(1),7+rnd(2));
          F.add(GFX.muzzle(.14),m,m.clone().add(V(0,1,1.6)),t); F.add(GFX.shot(line(m,end),.3,'tracer',.06,{color:0xffb060}),null,null,t); if(k%3===0) F.add(GFX.airBurst(.35),end,null,t+.3); } }); }},
      {label:'攻撃機',text:'対地ミサイル。煙の尾を引いて飛び、小さめの輪で着弾します。',dist:30,pitch:.25,period:4,target:[0,2.5,0],
        setup(){ this.a=place('attack',0,-10,1,6); this.b=place('vehicle',1,9,-1); }, fire(now){ this.a.slice(0,2).forEach((u,i)=>{ const t=now+i*.5, m=V(u.pos.x,6,u.pos.z+.4), tg=this.b[i], end=V(tg.pos.x,.2,tg.pos.z);
          F.add(GFX.shot(arc(m,end,.6),.9,'rocket',.13),null,null,t); F.add(GFX.blast(2.5,{smokeK:.7}),end.clone().setY(0),null,t+.9); }); }},
      {label:'W.A.S.',text:'背の砲の太い筋と、右腕のバルカンの連射。',dist:16,pitch:.28,period:2.6,
        setup(){ this.a=place('was',0,-5.5,1); this.b=place('vehicle',1,6,-1); }, fire(now){ this.a.forEach((u,i)=>{ const t=now+i*.35, m=V(u.pos.x+.2,1.2,u.pos.z+1), tg=this.b[i%this.b.length], end=V(tg.pos.x,.3,tg.pos.z-.3);
          F.add(GFX.muzzle(.3,{smokeK:.8}),m,V(m.x,m.y,m.z+1),t); F.add(GFX.shot(line(m,end),.15,'tracer',.1),null,null,t); F.add(GFX.blast(1.6,{smokeK:.6}),end.clone().setY(0),null,t+.15);
          for(let k=0;k<8;k++){ const tk=t+.6+k*.07, g=V(u.pos.x-.1,.85,u.pos.z+.7), e=V(tg.pos.x+rnd(.7),.1,tg.pos.z+rnd(.5)); F.add(GFX.muzzle(.09),g,V(g.x,g.y,g.z+1),tk); F.add(GFX.shot(line(g,e),.13,'tracer',.05,{color:0xffc070}),null,null,tk); F.add(GFX.hit(.15),e.clone().setY(0),null,tk+.13); } }); }}];
    let cur=null, next=0;
    function pick(s){ F.clear(); while(units.children.length) units.remove(units.children[0]); cur=s; s.t0=undefined; s.setup(); S.view.dist=s.dist*.7; S.view.pitch=s.pitch; S.view.yaw=s.yaw??.95; S.view.target.set(...(s.target||[0,.6,s.dist*.16])); note.textContent=s.text; next=0; }
    buttons(document.getElementById('fxModes'),scenes,pick); pick(scenes[0]);
    function frame(){ const now=performance.now()/1000; if(!still&&now>=next){ cur.fire(now); next=now+cur.period; } if(cur.tick) cur.tick(now); F.step(now); S.render(); requestAnimationFrame(frame); }
    frame(); })();
}
function build(){
  const inline=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/<\/script/gi,'<\\/script');
  return `<title>効果と W.A.S. の動き</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<style>
/* 作り: 暗い作戦卓の1列。上に W.A.S. の舞台、下に射撃の舞台。ボタンで場面を切り替える。ゲームの画面と同じ真鍮色の差し色。 */
:root{color-scheme:dark;--bg:#12161b;--panel:#1a2027;--line:#2c3540;--ink:#e6e9ec;--dim:#9aa5b0;--brass:#e2c58a;--font:'Zen Kaku Gothic New','Hiragino Sans','Noto Sans JP',sans-serif;--disp:'Chakra Petch','Zen Kaku Gothic New',sans-serif}
body{background:var(--bg);color:var(--ink);font:15px/1.7 var(--font);padding-block:20px 40px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
h1{font:600 24px/1.3 var(--disp);margin:0;letter-spacing:.02em;text-wrap:balance}
h2{font:600 17px/1.3 var(--disp);margin:0;color:var(--brass);letter-spacing:.04em}
p{margin:0;max-width:62ch}.dim{color:var(--dim);font-size:13px}
section{display:flex;flex-direction:column;gap:10px}
.modes{display:flex;flex-wrap:wrap;gap:6px}
button{font:500 14px/1 var(--font);color:var(--ink);background:var(--panel);border:1px solid var(--line);padding:9px 12px;border-radius:3px;cursor:pointer}
button[aria-pressed="true"]{background:var(--brass);color:#1a1509;border-color:var(--brass)}
button:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
canvas{display:block;width:100%;max-width:100%;aspect-ratio:16/10;border:1px solid var(--line);border-radius:3px;background:#8fa3b0;cursor:grab}
.note{min-height:3.4em}
@media (max-width:520px){canvas{aspect-ratio:4/3.6}}
</style>
<main>
<header><h1>効果と W.A.S. の動き</h1><p class="dim">見本 第3回。まだゲームには入っていません。絵はドラッグで回せます（ホイールで拡大）。</p></header>
<section aria-labelledby="h-was"><h2 id="h-was">W.A.S. の動き</h2><div class="modes" id="wasModes" role="group" aria-label="W.A.S. の動き"></div><canvas id="wasCanvas" aria-label="W.A.S. の動きの絵"></canvas><p class="note" id="wasNote"></p></section>
<section aria-labelledby="h-fx"><h2 id="h-fx">射撃・弾道・着弾</h2><div class="modes" id="fxModes" role="group" aria-label="兵科"></div><canvas id="fxCanvas" aria-label="射撃と着弾の絵"></canvas><p class="note" id="fxNote"></p>
<p class="dim">青が撃つ側、赤が撃たれる側です。距離は絵に収まるよう縮めています。爆風の輪の広さはゲームの値のままです。</p></section>
</main>
<script src="${CDN}"></script><script>${inline('battle/shapes.js')}</script><script>${inline('battle/ground-shapes.js')}</script><script>${inline('battle/ground-fx.js')}</script>
<script>(${fxPage.toString()})();</script>`;
}
const i=process.argv.indexOf('--out'),out=path.resolve(i>0?process.argv[i+1]:'.shots/fx-sheet.html');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,build());console.log(out);
