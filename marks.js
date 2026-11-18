/* Shared ship class marks. */
(function(){
const SCALE={cv:.55,ff:.7,dd:.85,cl:1.2,bb:1.7,cvb:1.6,mas:.9,masc:1.6};
const SV={S:6.5,SY:4.4,OX:16,OY:9,k:1,kx:1}; /* heights at 0.68x: a low, long recognition-chart profile */
const sp=(x,y)=>`${(SV.OX+x*SV.S*SV.k*SV.kx).toFixed(2)},${(SV.OY-y*SV.SY*SV.k).toFixed(2)}`;
function prof(st,up=0){ const t=st.map(e=>sp(e[0],up+(e[3]||0)+e[2])), b=[...st].reverse().map(e=>sp(e[0],up+(e[3]||0)-e[2]));
  return `<polygon class="p" points="${[...t,...b].join(' ')}"/>`; }
/* a turret: a low angled block and a long barrel (dir -1 points aft) */
const tur=(x,y,r,dir=1)=>{ const d=dir, a=x-d*r, b=x+d*r*.75, h=r*.7, bt=r*.44, bb=r*.27, e=x+d*r*2.3;
  return `<polygon class="p" points="${sp(a,y-.05)} ${sp(a,y)} ${sp(a+d*r*.2,y+h)} ${sp(b,y+h)} ${sp(x+d*r,y)} ${sp(x+d*r,y-.05)}"/><polygon class="p" points="${sp(b-d*r*.1,y+bt)} ${sp(e,y+bt)} ${sp(e,y+bb)} ${sp(b-d*r*.1,y+bb)}"/>`; };
const eng=(x,y,r)=>`<path class="p" d="M${sp(x,y+r)}L${sp(x-.16,y+r*.75)}L${sp(x-.16,y-r*.75)}L${sp(x,y-r)}Z"/>`;
/* a modern superstructure block: square at the back, the face raked toward the bow; and a thin mast */
const blk=(x0,x1,y,h,rake)=>`<polygon class="p" points="${sp(x0,y)} ${sp(x0,y+h)} ${sp(x1-rake,y+h)} ${sp(x1,y)}"/>`;
const mast=(x,y,h)=>`<polygon class="p" points="${sp(x-.025,y)} ${sp(x-.01,y+h)} ${sp(x+.01,y+h)} ${sp(x+.025,y)}"/>`;
const tube=x=>`<polygon class="p" points="${sp(x-.12,.09)} ${sp(x-.12,.15)} ${sp(x+.14,.16)} ${sp(x+.14,.09)}"/>`;
/* the deck height of a hull loft at x, so turrets sit on it */
const deck=(st,x)=>{ for(let i=1;i<st.length;i++){ const a=st[i-1], b=st[i]; if(x<=b[0]){ const t=(x-a[0])/(b[0]-a[0]), ya=(a[3]||0)+a[2], yb=(b[3]||0)+b[2]; return ya+(yb-ya)*t; } } return 0; };
const CL_H=[[-1.1,.32,.19],[-.45,.38,.23],[.45,.29,.17],[1.2,0,.01,-.02]], BB_H=[[-1.35,.34,.2],[-.6,.41,.25],[.6,.31,.19],[1.45,0,.01,-.03]];
const fin=(pts)=>`<polygon class="p" points="${pts.map(([x,y])=>sp(x,y)).join(' ')}"/>`;
const SIDE={
  cv:  ()=>fin([[-.4,.06],[-.8,.32],[-.95,.32],[-.75,.06]])+prof([[-1,.13,.07],[-.55,.2,.1],[.35,.13,.07],[1.05,0,0]])+eng(-1,0,.07),
  /* フリゲート: a short hull with a tall block amidships and a mast: the escort that watches */
  ff:  ()=>blk(-.5,.18,.13,.11,.12)+blk(-.36,-.02,.24,.08,.07)+mast(-.22,.32,.2)+prof([[-1,.2,.13],[-.35,.25,.16],[.45,.18,.12],[1.05,0,.01]])+eng(-1,0,.1),
  /* 駆逐艦: long and low, a small bridge forward and two torpedo mounts on the deck */
  dd:  ()=>blk(.1,.42,.1,.07,.09)+mast(.2,.17,.08)+tube(-.2)+tube(-.62)+prof([[-1.1,.18,.12],[-.4,.21,.11],[.7,.13,.08],[1.25,0,0]])+eng(-1.1,0,.07),
  cl:  ()=>prof([[-.6,.15,.09],[-.25,.17,.16,.06],[.05,.1,.08,.03],[.25,0,0]],.2)+tur(.45,deck(CL_H,.45),.15)+prof(CL_H)+eng(-1.1,0,.11),
  bb:  ()=>blk(-.85,.08,.22,.15,.12)+blk(-.62,-.12,.37,.12,.1)+mast(-.42,.49,.22)
       +tur(.82,deck(BB_H,.82),.19)+blk(.22,.6,deck(BB_H,.42)-.02,.08,0)+tur(.42,deck(BB_H,.42)+.06,.19)+tur(-.98,deck(BB_H,-.98),.19,-1)+fin([[-.3,-.2],[-.45,-.3],[-1.05,-.3],[-1.05,-.2]])
       +prof(BB_H)+eng(-1.35,0,.12),
  cvb: ()=>blk(-.48,.02,.19,.14,.08)+blk(-.38,-.1,.33,.08,.06)+mast(-.26,.41,.16)+prof([[-1.15,.2,.13],[-.4,.23,.15],[.6,.17,.11],[1.15,0,.01]])
       +fin([[-1.25,.2],[1.2,.2],[1.2,.13],[-1.25,.13]])+eng(-1.15,0,.09),
  mas: ()=>blk(-.72,-.08,.19,.12,.1)+blk(-.6,-.3,.31,.07,.06)+mast(-.46,.38,.14)
       +prof([[-1.05,.22,.16],[-.3,.29,.21],[.6,.26,.18],[.95,.18,.12]])+eng(-1.05,0,.1),
  masc:()=>blk(-.66,-.14,.13,.12,.08)+blk(-.55,-.3,.25,.07,.05)+mast(-.42,.32,.14)+prof([[-1.15,.13,.11],[-.3,.16,.13],[.6,.12,.1],[1.2,0,0]],-.04)
       +fin([[-.9,.13],[.65,.13],[.65,.07],[-.9,.07]])+eng(-1.15,-.04,.09),
};
/* outline only (user decision): all parts are stroked at double width, then the inside of their union is masked away, so only the outer edge is left */
let MKN=0;
/* fit: every class at the battleship's length, not to scale, and a little shorter than long (the battle map and the roster tiles;
   user decision 2026-11-06: too small to tell apart, and too long) */
const FIT_X=.85;
const svgSide=(id,fit)=>{ SV.k=fit?SCALE.bb:SCALE[id]; SV.kx=fit?FIT_X:1; const p=SIDE[id](), k='mk'+(++MKN);
  return `<svg viewBox="0 0 32 16"><defs><mask id="${k}" maskUnits="userSpaceOnUse" x="-4" y="-4" width="40" height="24"><rect x="-4" y="-4" width="40" height="24" fill="#fff"/><g fill="#000">${p}</g></mask></defs><g class="ol" mask="url(#${k})" fill="none" stroke="currentColor" stroke-linejoin="miter">${p}</g><g opacity=".18" fill="currentColor">${p}</g></svg>`; };

const FR='<polygon class="s" points="3,4 21,4 23,6 23,14 21,16 3,16 1,14 1,6"/>';
const B_IN={
  cv:  '<path class="l" d="M16 7L8 10L16 13"/>',                                   /* the eye: a wide open angle, looking ahead */
  ff:  '<path class="l" d="M12 6.5L17 8V11.5L12 14L7 11.5V8Z"/>',                  /* the shield */
  dd:  '<path class="l" d="M5 10H17"/><path class="f" d="M17 8.6L20 10L17 11.4Z"/>',  /* the torpedo */
  cl:  '<path class="l" d="M5 10H19"/><path class="l" d="M9 8V12"/>',               /* one gun */
  bb:  '<path class="l" d="M5 8.5H19M5 11.5H19"/><path class="l" d="M9 7V13"/>',     /* two guns */
  cvb: '<path class="l" d="M6 12L12 7.5L18 12"/>',                                  /* the wing */
  mas: '<path class="l" d="M8 7L14 10L8 13M12 7L18 10L12 13"/>',                     /* the assault: a double chevron */
  masc:'<path class="l" d="M5 12.5L9.5 8L14 12.5"/><path class="l" d="M13 7.5L18.5 10L13 12.5"/>', /* wing and chevron */
};
const B_TICKS={cv:1,ff:1,dd:2,cl:3,bb:4,cvb:4,mas:2,masc:4};
const svgB=id=>`<svg viewBox="0 0 24 16">${FR}${Array.from({length:B_TICKS[id]},(_,i)=>`<path class="l" d="M${(12-(B_TICKS[id]-1)*1.6+i*3.2).toFixed(1)} 0.5V3"/>`).join('')}${B_IN[id]}</svg>`;
window.WOS_MARKS={svg:(type,set,fit)=>SIDE[type]?(set==='B'?svgB(type):svgSide(type,fit)):'',ground:groundMark};

/* ---------- 地上の兵科の記号（ユーザー決定 2026-11-18。オプション「地上の兵科記号」: A シルエット（初め）・B NATO 兵科記号）----------
   シルエットは敵味方で同じ形で、色はチームの色（currentColor）。どれも横2:縦1の白い型（マスク）の画像で、はじめて使うときに一度だけ作る。
   歩兵の3つは手で描く（40×20 の座標、前は右）: 強化歩兵は戦闘用ヘルメット（横のレール、耳のヘッドセットとマイク、前面に沿う細い暗視
   ゴーグル）。強化コマンド歩兵は同じヘルメットに 45° の斜めの抜き3本（殻を端まで貫く。ヘッドセットとゴーグルは削らない）。重強化歩兵は
   ヘルメットに跳ね上げ式の面板（前の薄い鉄板、目の切り欠きは前側だけ、ヘルメットの横の軸まで回る扇形の腕とボルト）と、いちばん手前に
   首まわりの装甲（首の後ろが高く、前が低い）。ほかはゲームの3Dモデル（地球連合の形）を1色で描いた形: 真横（前が右）、航空機と
   ドローンハイブは真上。斥候は上に双眼鏡、工兵は上に横向きのシャベルを足す。見本は 2026-11-18 の会話の見本10・19。
   NATO は Wikipedia「兵科記号（北大西洋条約機構）」の形（味方は横長の四角、敵はひし形）。NATO に無い兵科は Claude の案（承認 2026-11-18）:
   重強化歩兵＝歩兵＋対戦車（Λ）、強化コマンド歩兵＝歩兵＋SF、機械化突撃兵＝歩兵＋R、陸戦型 W.A.S.＝装甲＋2本の脚、航空隊＝固定翼＋F（戦闘）・A（攻撃）・B（爆撃・支援） */
function groundMark(kind,set,enemy){
  if(set==='B'||!groundMasks()||!GM_KINDS.includes(kind)) return `<span class="mk gm">${natoSvg(kind,enemy)}</span>`;
  return `<span class="mk gm"><i class="gm-${kind}"></i></span>`;
}
const GM_KINDS=['infantry','heavyInfantry','commando','mechanicalAssault','vehicle','artillery','guidedRocket','mobileAA','scout','apc','engineer','supply','was','droneHive','fighter','attack','supportAircraft'];
const GM_TOP=['fighter','attack','supportAircraft','droneHive'];
let gmState=null;   // null: まだ / true: 作った / false: 作れない（WebGL なし。NATO で出す）
function groundMasks(){
  if(gmState!==null) return gmState;
  gmState=false;
  if(typeof THREE==='undefined'||typeof groundModelFor!=='function'||typeof document==='undefined'||!document.head) return false;
  let r; try{ r=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true}); }catch(e){ return false; }
  const W=240,H=120,U=6,scene=new THREE.Scene(),mat=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}),rules=[];
  r.setPixelRatio(1); r.setSize(W,H); r.setClearColor(0,0);
  // モデルを真横（前が右）か真上（機首が右）から、横2:縦1いっぱいに描く。描いた絵は r.domElement に残る
  const model=(kind,top)=>{ const spec=groundModelFor(kind,'earth'), geo=spec&&groundShapeGeo(spec.key); if(!geo) return false;
    geo.computeBoundingBox(); const b=geo.boundingBox, mesh=new THREE.Mesh(geo,mat); scene.add(mesh);
    const [u0,u1]=[b.min.z,b.max.z], [v0,v1]=top?[b.min.x,b.max.x]:[b.min.y,b.max.y], cu=(u0+u1)/2, cv=(v0+v1)/2, k=Math.max((u1-u0)*1.08/W,(v1-v0)*1.08/H);
    const cam=new THREE.OrthographicCamera(-W*k/2,W*k/2,H*k/2,-H*k/2,-100,100);
    if(top){ cam.position.set(cv,50,cu); cam.up.set(-1,0,0); cam.lookAt(cv,0,cu); } else { cam.position.set(-50,cv,cu); cam.lookAt(0,cv,cu); }
    r.render(scene,cam); scene.remove(mesh); geo.dispose(); return true; };
  const P=(ctx,pts)=>{ ctx.beginPath(); pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath(); ctx.fill(); };
  const O=(ctx,x,y,rr)=>{ ctx.beginPath(); ctx.ellipse(x,y,rr,rr,0,0,Math.PI*2); ctx.fill(); };
  const cut=(ctx,fn)=>{ ctx.save(); ctx.globalCompositeOperation='destination-out'; fn(); ctx.restore(); };
  const SHELL=[[11.4,13.4],[11,9.6],[12.8,6.2],[16.4,3.9],[21,3.2],[25.4,4.1],[28.2,6.4],[29.3,9.2],[27.5,9.5],[26.2,11.2],[23.6,12.4],[18.8,12.4],[17.2,13.8],[13.6,14.2]];
  const COLLAR=[[9.4,8.8],[12.4,9.4],[13.6,12.6],[19.6,13.8],[26.4,14.4],[29,15.4],[28.4,18.8],[9.8,18.8],[8.8,13.2]];
  // 殻（横のレールを抜く）→ shellCut（殻だけを削る）→ ヘッドセットとマイク → 暗視ゴーグル（前面の接線に沿う細い筒）
  const helmet=(ctx,{rail=true,shellCut,gear=true}={})=>{
    P(ctx,SHELL); if(rail) cut(ctx,()=>P(ctx,[[14.2,9.4],[25,9.2],[25.1,10.3],[14.4,10.5]])); if(shellCut) cut(ctx,shellCut);
    if(!gear) return;
    O(ctx,20.6,15.4,3.2); cut(ctx,()=>P(ctx,[[18.6,14.6],[22.6,14.4],[22.7,15.6],[18.7,15.8]])); P(ctx,[[23.4,16.6],[28.6,18],[28.4,18.8],[23.1,17.5]]); O(ctx,29,18.4,.9);
    const ux=.58,uy=.81,nx=.81,ny=-.58,ox=28.2+nx*.72,oy=6.4+ny*.72,T=.6,a0=-2,a1=4.2;
    P(ctx,[[ox+ux*a0-nx*T,oy+uy*a0-ny*T],[ox+ux*a1-nx*T,oy+uy*a1-ny*T],[ox+ux*a1+nx*T,oy+uy*a1+ny*T],[ox+ux*a0+nx*T,oy+uy*a0+ny*T]]); };
  const draw={
    infantry:ctx=>helmet(ctx),
    // ＼向き 45° の抜き3本: (c,8) を通り、殻の上から下まで
    commando:ctx=>helmet(ctx,{rail:false,shellCut:()=>[13.3,17.8,22.3].forEach(c=>P(ctx,[[c-9,-1],[c-6.7,-1],[c+9.8,15.5],[c+7.5,15.5]]))}),
    heavyInfantry:ctx=>{ helmet(ctx,{gear:false});
      const vp=new Path2D(); vp.moveTo(31,6.2); vp.lineTo(31.8,16.6); vp.lineTo(29.8,16.8); vp.lineTo(29.6,14.4); vp.lineTo(24.8,12.1);
      vp.quadraticCurveTo(23.1,11.9,23.2,10.3); vp.quadraticCurveTo(24,7.2,27,6.4); vp.closePath();
      const line=(w,draw)=>cut(ctx,()=>{ ctx.lineWidth=w; ctx.lineJoin='round'; draw(); });
      line(.9,()=>ctx.stroke(vp)); ctx.fill(vp); cut(ctx,()=>{ P(ctx,[[30.4,10.8],[33,10.8],[33,12],[30.5,12]]); O(ctx,24.5,10.4,.6); });
      const cp=new Path2D(); COLLAR.forEach(([x,y],i)=>i?cp.lineTo(x,y):cp.moveTo(x,y)); cp.closePath();
      line(1.1,()=>ctx.stroke(cp)); ctx.fill(cp); cut(ctx,()=>P(ctx,[[10.4,15],[28.2,16.6],[28.2,17.2],[10.4,15.6]])); },
    // 双眼鏡（右寄り・車体の上）: こちらを向いた丸いレンズ2つ（縁を細く抜く）、上の真ん中にピントのつまみと橋
    scout:ctx=>{ if(!model('scout',false)) return false; ctx.drawImage(r.domElement,4,4.4,32,16);
      P(ctx,[[27.6,3.4],[32.4,3.4],[32.4,5],[27.6,5]]); O(ctx,30,3.1,.75); O(ctx,27.2,6.2,2.3); O(ctx,32.8,6.2,2.3);
      cut(ctx,()=>{ ctx.lineWidth=.42; for(const x of [27.2,32.8]){ ctx.beginPath(); ctx.arc(x,6.2,1.55,0,Math.PI*2); ctx.stroke(); } }); },
    // 横向きのシャベル（上、0.82倍）: 左に D の握り（中を抜く）、細い柄、受け口、右に幅のある刃
    engineer:ctx=>{ if(!model('engineer',false)) return false; ctx.drawImage(r.domElement,5,5.4,30,15);
      ctx.save(); ctx.translate(18.9,2.5); ctx.scale(.82,.82); ctx.translate(-18.9,-2.5);
      P(ctx,[[5.6,.5],[8.8,.5],[9.6,1.3],[9.6,3.7],[8.8,4.5],[5.6,4.5]]); cut(ctx,()=>P(ctx,[[6.4,1.3],[8.5,1.3],[8.8,1.7],[8.8,3.3],[8.5,3.7],[6.4,3.7]]));
      P(ctx,[[9.6,2.1],[22.4,2.1],[22.4,2.9],[9.6,2.9]]); P(ctx,[[22,1.7],[24.4,1],[24.4,4],[22,3.3]]); P(ctx,[[24.2,0],[29,.2],[31,1.1],[32.2,2.5],[31,3.9],[29,4.8],[24.2,5]]);
      ctx.restore(); },
  };
  for(const kind of GM_KINDS){
    const c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d'); ctx.fillStyle=ctx.strokeStyle='#fff'; ctx.scale(U,U);
    const ok=draw[kind]?draw[kind](ctx)!==false:model(kind,GM_TOP.includes(kind))&&(ctx.drawImage(r.domElement,0,0,40,20),true);
    if(!ok) continue;
    const url=c.toDataURL(); rules.push(`.gm-${kind}{-webkit-mask-image:url(${url});mask-image:url(${url})}`);
  }
  mat.dispose(); r.dispose(); if(r.forceContextLoss) r.forceContextLoss();
  const st=document.createElement('style'); st.id='gmMasks'; st.textContent=rules.join('\n'); document.head.appendChild(st);
  return gmState=true;
}
/* NATO 兵科記号（viewBox 0 0 30 20 の四角の中）。敵はひし形の中に縮めて置く */
const NX='<path d="M1 1L29 19M1 19L29 1"/>', NE='<ellipse cx="15" cy="10" rx="7" ry="3.6"/>', NDOT='<circle cx="15" cy="10" r="2.2" fill="currentColor" stroke="none"/>',
  NT=(t,y)=>`<text x="15" y="${y}" font-size="6.5" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial,sans-serif" font-weight="700">${t}</text>`,
  NWING='<path d="M8.5 10.5a3.3 2.3 0 1 0 6.5 0a3.3 2.3 0 1 0-6.5 0M15 10.5a3.3 2.3 0 1 0 6.5 0a3.3 2.3 0 1 0-6.5 0"/>';
const NATO={infantry:NX,heavyInfantry:NX+'<path d="M1 19L15 1L29 19"/>',commando:NX+NT('SF',7.5),mechanicalAssault:NX+NT('R',18),
  vehicle:NE,artillery:NE+NDOT,guidedRocket:NE+NDOT+'<path d="M12 5.4L15 2.6L18 5.4"/>',mobileAA:'<path d="M3 19Q15 4 27 19"/>',
  scout:'<path d="M1 19L29 1"/>',apc:NX+NE,engineer:'<path d="M8 13V7.5H22V13M15 7.5V13"/>',supply:'<path d="M1 14H29"/>',
  was:NE+'<path d="M11 13.4L9 18.6M19 13.4L21 18.6"/>',droneHive:'<path d="M6 12.5L15 6.5L24 12.5L15 10Z"/>',
  fighter:NWING+NT('F',7.2),attack:NWING+NT('A',7.2),supportAircraft:NWING+NT('B',7.2)};
const natoSvg=(kind,enemy)=>enemy
  ?`<svg viewBox="-3 -6 36 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M15 -5L32 10L15 25L-2 10Z" stroke-width="1.6"/><g transform="translate(4.5 3.5) scale(.7)">${NATO[kind]||''}</g></svg>`
  :`<svg viewBox="0 0 30 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="1" width="28" height="18" stroke-width="1.5"/>${NATO[kind]||''}</svg>`;
})();
