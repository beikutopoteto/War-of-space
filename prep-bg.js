/* Solar system background, adapted from docs/mockups/menu-b.html. */
(()=>{
let BASE=1, OX=0, OY=0, scr='title', raf=0, last=0;
const DEG=Math.PI/180;
const EARTH={r:1,p:365.25,a0:0}, MARS={r:1.524,p:687,a0:73};
/* the ring is 0.85 AU in the setting; drawn closer to the sun here, with the setting's period */
const ST_R=.7, ST_P=365.25*Math.pow(.85,1.5);
const STATIONS=['ナイル','アマゾン','ミシシッピ','ドナウ','ヴォルガ','ガンジス','長江','信濃'].map((n,i)=>({n,a0:-5+45*i}));
/* bodies around each planet (docs/story.md 5.2, 5.3). Radii are display AU, in the setting's order; periods are slowed
   but keep inner = faster. polar: the orbit plane stands up through the poles. lp: a Lagrange point (+1 sunward L1, -1 night side L2) */
const EARTH_SYS=[
  {n:'月',r:.06,p:27.3,a0:0,moon:1},
  {n:'フェブルアーリア',r:.06,p:27.3,a0:180,col:'ally',big:1},
  {n:'デナリ',r:.085,p:41,a0:120},
  {n:'エベレスト',lp:1,r:.13},
  {n:'キリマンジャロ',lp:-1,r:.13},
];
const MARS_SYS=[
  {n:'フォボス',r:.022,p:6,a0:0,moon:1},
  {n:'スキャパレッリ',r:.034,p:9,a0:90,polar:30},
  {n:'ホイヘンス',r:.046,p:12,a0:200},
  {n:'ダイモス',r:.058,p:15,a0:300,moon:1},
  {n:'ホール',r:.058,p:15,a0:0},
  {n:'マイク',r:.08,p:24,a0:140,big:1},
  {n:'ケプラー',lp:1,r:.12},
  {n:'ローウェル',lp:-1,r:.12},
];
const ang=(o,d)=>(o.a0*DEG)+2*Math.PI*d/o.p;
const stAng=(i,d)=>STATIONS[i].a0*DEG+2*Math.PI*d/ST_P;
const stW=(i,d)=>{ const a=stAng(i,d); return [ST_R*Math.cos(a),ST_R*Math.sin(a),0]; };
const C={blue:'#7fc8ff',red:'#ff6a45',brass:'#e2c58a',ink:'#e6edf6',dim:'#93a3b8',ally:'#8fe8c0'};

const cv=document.createElement('canvas'), g=cv.getContext('2d');
cv.id='menuBg'; cv.setAttribute('aria-hidden','true');
const rnd=(s=>()=>(s=(s*16807)%2147483647)/2147483647)(7);
const STARS=Array.from({length:420},()=>({x:rnd()*1600,y:rnd()*900,r:rnd()<.08?1.3:.6+rnd()*.5,a:.15+rnd()*.55}));
/* things that never move are painted once into layers and reused every frame */
let layers={}, glows={};
function layer(key,paint){ if(layers[key]) return layers[key];
  const c=document.createElement('canvas'); c.width=cv.width; c.height=cv.height; const x=c.getContext('2d'); x.fillStyle='#05080f'; if(key==='stars') x.fillRect(0,0,c.width,c.height); x.setTransform(BASE,0,0,BASE,OX,OY); paint(x); return layers[key]=c; }
const starLayer=()=>layer('stars',x=>{ x.fillStyle='#05080f'; x.fillRect(0,0,1600,900); x.fillStyle='#cfe3ff'; for(const s of STARS){ x.globalAlpha=s.a; x.fillRect(s.x,s.y,s.r,s.r); } });
const shadeLayer=s=>layer('shade-'+s,x=>{
  const vg=x.createLinearGradient(0,0,1600,0); vg.addColorStop(0,'rgba(5,8,15,.8)'); vg.addColorStop(.42,'rgba(5,8,15,.22)'); vg.addColorStop(.7,'rgba(5,8,15,0)'); x.fillStyle=vg; x.fillRect(0,0,1600,900);
  if(s!=='title'){ x.fillStyle='rgba(5,8,15,.5)'; x.fillRect(0,0,1600,900); } });
function glowSprite(r,col){ const key=col+'|'+r; if(glows[key]) return glows[key];
  const n=Math.max(2,Math.ceil(r*2*BASE)), c=document.createElement('canvas'); c.width=c.height=n; const x=c.getContext('2d');
  const gr=x.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2); gr.addColorStop(0,col); gr.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=gr; x.fillRect(0,0,n,n); return glows[key]=c; }


/* views: title (whole system, sun lower right) and the sortie close-ups, which pin a world point to an anchor on screen */
const HOME={cx:1270,cy:690,s:430,yaw:-193};
const view={...HOME};
const rot=(x,y)=>{ const c=Math.cos(view.yaw*DEG), s=Math.sin(view.yaw*DEG); return [x*c-y*s, x*s+y*c]; };
function P(x,y,z=0){ const [X,Y]=rot(x,y); return [view.cx+X*view.s, view.cy+(Y-z*0)*view.s]; }
function ring(r,style,w,dash,alpha,ox=0,oy=0,segs=180){
  g.save(); g.globalAlpha=alpha; g.strokeStyle=style; g.lineWidth=w; g.setLineDash(dash||[]); g.beginPath();
  for(let i=0;i<=segs;i++){ const a=i/segs*2*Math.PI, [x,y]=P(ox+r*Math.cos(a),oy+r*Math.sin(a)); i?g.lineTo(x,y):g.moveTo(x,y); }
  g.stroke(); g.restore();
}
function arcTrail(ox,oy,r,a1,span,col,alpha=.75,w=1.6,n=18){ /* afterimage: a fading arc behind a body on its orbit (around ox,oy) */
  g.save(); g.lineWidth=w; g.strokeStyle=col; g.lineCap='round';
  for(let i=0;i<n;i++){ const aa=a1-span*i/n, ab=a1-span*(i+1)/n, [x1,y1]=P(ox+r*Math.cos(aa),oy+r*Math.sin(aa)), [x2,y2]=P(ox+r*Math.cos(ab),oy+r*Math.sin(ab));
    g.globalAlpha=alpha*(1-i/n); g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke(); }
  g.restore();
}
const trail=(o,d,col,span)=>arcTrail(0,0,o.r,ang(o,d),span,col);
function glow(x,y,r,col,a){ r=Math.round(r/10)*10||10; g.globalAlpha=a; g.drawImage(glowSprite(r,col),x-r,y-r,2*r,2*r); g.globalAlpha=1; }
function label(x,y,txt,col,dx=14,dy=-14,size=12,alpha=.9){ /* angled leader line, then text */
  g.save(); g.strokeStyle=col; g.globalAlpha=alpha*.6; g.lineWidth=1; g.beginPath(); g.moveTo(x+Math.sign(dx)*4,y+Math.sign(dy)*4); g.lineTo(x+dx,y+dy); g.lineTo(x+dx+Math.sign(dx)*16,y+dy); g.stroke();
  g.globalAlpha=alpha; g.fillStyle=col; g.font=`500 ${size}px "Zen Kaku Gothic New","Chakra Petch",sans-serif`; g.textBaseline='middle'; g.textAlign=dx<0?'right':'left';
  g.fillText(txt,x+dx+Math.sign(dx)*20,y+dy); g.restore();
}
function station(x,y,col){ g.save(); g.strokeStyle=col; g.lineWidth=1; g.beginPath(); g.arc(x,y,4.5,0,7); g.moveTo(x-4.5,y); g.lineTo(x+4.5,y); g.moveTo(x,y-4.5); g.lineTo(x,y+4.5); g.stroke(); g.restore(); }
function diamond(x,y,r,col,fill){ g.save(); g.beginPath(); g.moveTo(x,y-r); g.lineTo(x+r*.7,y); g.lineTo(x,y+r); g.lineTo(x-r*.7,y); g.closePath(); g.strokeStyle=col; g.lineWidth=1; if(fill){ g.fillStyle=col; g.globalAlpha=.35; g.fill(); g.globalAlpha=1; } g.stroke(); g.restore(); }

/* a point on a body's orbit around (cx,cy) at angle a; polar orbits are seen edge-on from above, so they stay on one line */
function orbPt(b,cx,cy,a){
  if(b.polar!=null){ const n=b.polar*DEG; return [cx+b.r*Math.cos(a)*Math.cos(n), cy+b.r*Math.cos(a)*Math.sin(n), b.r*Math.sin(a)]; }
  return [cx+b.r*Math.cos(a), cy+b.r*Math.sin(a), 0];
}
function bodyW(b,pl,d){
  const pa=ang(pl,d);
  if(b.lp){ const R=pl.r+(b.lp>0?-b.r:b.r); return [R*Math.cos(pa),R*Math.sin(pa),0]; }
  return orbPt(b,pl.r*Math.cos(pa),pl.r*Math.sin(pa),(b.a0||0)*DEG+2*Math.PI*d/b.p);
}
function system(list,pl,d,px,py,col,showNames){
  const pa=ang(pl,d), cx=pl.r*Math.cos(pa), cy=pl.r*Math.sin(pa);
  for(const b of list){
    const c=b.col?C[b.col]:col, w=bodyW(b,pl,d);
    if(b.lp){ /* L1/L2 ride the sun–planet line, so they trail along the planet's own arc */
      const R=pl.r+(b.lp>0?-b.r:b.r); arcTrail(0,0,R,pa,.12,c,.5,1.1,20);
      g.save(); g.setLineDash([1,3]); g.strokeStyle=c; g.globalAlpha=.3; g.beginPath(); g.moveTo(px,py); g.lineTo(...P(w[0],w[1])); g.stroke(); g.restore();
    } else {
      const a=(b.a0||0)*DEG+2*Math.PI*d/b.p;
      g.save(); g.strokeStyle=c; g.globalAlpha=.16; g.lineWidth=1; g.beginPath();
      for(let i=0;i<=40;i++){ const q=orbPt(b,cx,cy,i/40*2*Math.PI), [x,y]=P(...q); i?g.lineTo(x,y):g.moveTo(x,y); } g.stroke();
      g.lineWidth=1.2; g.lineCap='round';
      for(let i=0;i<12;i++){ const [x1,y1]=P(...orbPt(b,cx,cy,a-1.5*i/12)), [x2,y2]=P(...orbPt(b,cx,cy,a-1.5*(i+1)/12)); g.globalAlpha=.6*(1-i/12); g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke(); }
      g.restore();
    }
    const [x,y]=P(w[0],w[1]);
    if(b.moon){ g.fillStyle=C.dim; g.beginPath(); g.arc(x,y,b.n==='月'?2.4:1.6,0,7); g.fill(); }
    else diamond(x,y,b.big?4.6:3.4,c,1);
    if(showNames&&!b.moon){ const ox=x-px, oy=y-py; label(x,y,b.n,c,(ox>=0?1:-1)*8,(oy>=0?1:-1)*8,10); }
  }
}

function draw(d,now){
  g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.drawImage(starLayer(),0,0); g.setTransform(BASE,0,0,BASE,OX,OY);
  const sc=view.s, close=sc>1500;

  for(const r of [.5,1.25,1.75,2]) ring(r,C.blue,1,[2,6],.12);
  { g.save(); g.strokeStyle=C.blue; g.globalAlpha=.28; g.lineWidth=1;
    for(let k=0;k<72;k++){ const a=k*5*DEG, L=k%6?.03:.07, [x1,y1]=P(1.75*Math.cos(a),1.75*Math.sin(a)), [x2,y2]=P((1.75+L)*Math.cos(a),(1.75+L)*Math.sin(a)); g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke(); }
    g.restore(); }
  ring(ST_R,C.brass,1,[3,5],.38,0,0,360); ring(EARTH.r,C.blue,1,null,.35,0,0,360); ring(MARS.r,C.red,1,null,.32,0,0,360);
  trail(EARTH,d,C.blue,.9); trail(MARS,d,C.red,.6);

  const [sx,sy]=P(0,0); glow(sx,sy,Math.min(260,Math.max(70,sc*.32)),'rgba(255,214,150,.55)',1); glow(sx,sy,18,'rgba(255,244,220,1)',1);
  g.fillStyle='#fff6e6'; g.beginPath(); g.arc(sx,sy,6,0,7); g.fill();
  label(sx,sy,'太陽',C.brass,-18,22);

  STATIONS.forEach((st,i)=>{ const a=stAng(i,d), [x,y]=P(ST_R*Math.cos(a),ST_R*Math.sin(a)); arcTrail(0,0,ST_R,a,.32,C.brass,.55,1.2,10); station(x,y,C.brass);
    const inw=(x-sx)>=0?-1:1; label(x,y,st.n,C.brass,inw*12,(y-sy)>=0?-12:12,11); });

  const ea=ang(EARTH,d), [epx,epy]=P(Math.cos(ea),Math.sin(ea));
  const ma=ang(MARS,d), [mpx,mpy]=P(MARS.r*Math.cos(ma),MARS.r*Math.sin(ma));
  system(EARTH_SYS,EARTH,d,epx,epy,C.blue,true);
  system(MARS_SYS,MARS,d,mpx,mpy,C.red,true);
  glow(epx,epy,close?40:26,'rgba(127,200,255,.55)',1); g.fillStyle=C.blue; g.beginPath(); g.arc(epx,epy,close?9:6,0,7); g.fill();
  glow(mpx,mpy,24,'rgba(255,106,69,.5)',1); g.fillStyle=C.red; g.beginPath(); g.arc(mpx,mpy,5,0,7); g.fill();
  label(epx,epy,'地球',C.blue,-24,-26,13); label(mpx,mpy,'火星',C.red,-24,-26,13);

  hits=[];
  if(scr==='sortie'){
    const a=stAng(7,d), b=stAng(0,d)+2*Math.PI; g.save(); g.setLineDash([6,5]); g.strokeStyle=C.ally; g.globalAlpha=.55; g.beginPath(); for(let i=0;i<=60;i++){const q=a+(b-a)*i/60, [x,y]=P(ST_R*1.012*Math.cos(q),ST_R*1.012*Math.sin(q)); i?g.lineTo(x,y):g.moveTo(x,y);} g.stroke(); g.restore();
    for(const o of marks){ const [x,y]=P(...opW(o,d)), on=clock.focus&&clock.focus.id===o.id, r=on?16:10; g.save(); g.strokeStyle=on?C.blue:C.ally; g.lineWidth=1; for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){g.beginPath();g.moveTo(x+sx*r,y+sy*r*.55);g.lineTo(x+sx*r,y+sy*r);g.lineTo(x+sx*r*.55,y+sy*r);g.stroke();} g.restore(); if(on) label(x,y,o.name,C.blue,18,-20,13); hits.push({id:o.id,x,y}); }
  }
  g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.drawImage(shadeLayer(scr),0,0);
}

const clock={d:0,target:null,since:0,focus:null}, DAY_MS=600;
let marks=[], selectMark=null, hits=[];
function opW(o,d){ const at=o.place; if(at.body==='地球'){const a=ang(EARTH,d);return [EARTH.r*Math.cos(a),EARTH.r*Math.sin(a),0];} if(at.st!=null) return stW(at.st,d); if(at.route){ const a=stAng(at.route[0],d), b=stAng(at.route[1],d)+2*Math.PI, t=a+(b-a)*at.f; return [ST_R*Math.cos(t),ST_R*Math.sin(t),0]; } return bodyW(EARTH_SYS.find(b=>b.n===at.body),EARTH,d); }
function dayOf(date){ const m=/A\.E\. (\d+)\.(\d+)\.(\d+)/.exec(date||''); return m?(Date.UTC(+m[1]+2054,+m[2]-1,+m[3])-Date.UTC(2099,3,12))/864e5:0; }
function formatDay(d){ const t=new Date(Date.UTC(2099,3,12)+Math.floor(d)*864e5); return `A.E. ${t.getUTCFullYear()-2054}.${String(t.getUTCMonth()+1).padStart(2,'0')}.${String(t.getUTCDate()).padStart(2,'0')}`; }
addEventListener('click',e=>{ if(scr!=='sortie'||e.target.closest('button, .det, .ops')) return; const x=(e.clientX*Math.min(devicePixelRatio||1,2)-OX)/BASE,y=(e.clientY*Math.min(devicePixelRatio||1,2)-OY)/BASE; const h=hits.find(h=>Math.hypot(h.x-x,h.y-y)<22); if(h&&selectMark) selectMark(h.id); });
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
function fit(){
  const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2), scale=Math.max(w/1600,h/900);
  BASE=scale*dpr;
  // Keep the sun visible even when the viewport crops the reference frame.
  OX=Math.min(0,Math.max(w-1600*scale,w*.8-1270*scale))*dpr;
  OY=Math.min(0,Math.max(h-900*scale,h*.77-690*scale))*dpr;
  cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr); layers={}; glows={};
}
function frame(now){
  raf=0; if(document.getElementById('menu').hidden) return;
  const dt=last?Math.min(.1,(now-last)/1000):0; last=now;
  if(clock.target==null){ if(!reduce.matches) clock.d+=dt*1000/DAY_MS; } else { const goal=clock.target+(reduce.matches?0:(now-clock.since)/8000); clock.d+=(goal-clock.d)*Math.min(1,dt*3); }
  let tgt=HOME;
  if(scr==='sortie'){ if(clock.focus){ const w=opW(clock.focus,clock.d), scale=clock.focus.place.body?3600:1500, [x,y]=rot(w[0],w[1]); tgt={cx:1080-x*scale,cy:380-y*scale,s:scale,yaw:HOME.yaw}; } else tgt={cx:1050,cy:430,s:250,yaw:HOME.yaw}; }
  const k=Math.min(1,dt*(reduce.matches?60:2.6)); view.s=Math.exp(Math.log(view.s)+(Math.log(tgt.s)-Math.log(view.s))*k); view.cx+=(tgt.cx-view.cx)*k; view.cy+=(tgt.cy-view.cy)*k; view.yaw+=(tgt.yaw-view.yaw)*k;
  const where=document.getElementById('where'); if(where&&scr==='sortie'){ const ea=ang(EARTH,clock.d),ma=ang(MARS,clock.d),dist=Math.hypot(MARS.r*Math.cos(ma)-Math.cos(ea),MARS.r*Math.sin(ma)-Math.sin(ea)); where.textContent=`${formatDay(clock.d)}\n地球–火星 ${dist.toFixed(2)} AU（光で${(dist*8.317).toFixed(1)}分）`; }
  draw(clock.d,now); raf=requestAnimationFrame(frame);
}
function sync(){
  const menu=document.getElementById('menu');
  if(!cv.isConnected) menu.prepend(cv);
  cv.hidden=scr==='ground-forces';
  if(menu.hidden||cv.hidden){ if(raf) cancelAnimationFrame(raf); raf=0; last=0; }
  else if(!raf){ last=0; raf=requestAnimationFrame(frame); }
}

// 出撃用の地図。戦闘のカメラ・地形の状態を動かさず、同じ地形データを北を上に描く。
function rng(seed){return function(){seed=seed*16807%2147483647;return (seed-1)/2147483646}}
function drawGround(canvas,id){
  if(canvas.dataset.terrain===id) return;
  const d=WOS_TERRAIN[id], {widthKm:width,heightKm:height,cellKm:cell,seed}=d.meta;
  const scale=1600/Math.max(width,height);
  canvas.width=Math.ceil(width*scale);
  canvas.height=Math.ceil(height*scale);
  const ctx=canvas.getContext('2d');
  const path=(points,close=false)=>{
    ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,height-y):ctx.moveTo(x,height-y));
    if(close) ctx.closePath();
  };
  const fill=(points,color)=>{ path(points,true); ctx.fillStyle=color; ctx.fill(); };
  const line=(points,w,color)=>{ path(points); ctx.lineWidth=w; ctx.strokeStyle=color; ctx.stroke(); };
  const relief=document.createElement('canvas');
  relief.width=Math.min(640,d.terrain.cols*2);
  relief.height=Math.min(640,d.terrain.rows*2);
  const r=relief.getContext('2d'), pixels=r.createImageData(relief.width,relief.height);
  const tones={'平地':115,'沼地':78,'山岳':126,'砂漠':142};
  const noise=rng(seed);
  for(let row=0;row<relief.height;row++)for(let col=0;col<relief.width;col++){
    const x=(col+.5)*width/relief.width,y=height-(row+.5)*height/relief.height;
    const cellRow=Math.min(d.terrain.rows-1,Math.max(0,Math.floor(y/cell))),cellCol=Math.min(d.terrain.cols-1,Math.max(0,Math.floor(x/cell)));
    const type=d.terrain.cells[cellRow*d.terrain.cols+cellCol];
    const h=groundElevation(x,y,d), slope=groundElevation(x-.24,y+.24,d)-h;
    const tone=(tones[type]??115)+Math.max(-41,Math.min(41,slope*2100))+noise()*15;
    const i=4*(row*relief.width+col);
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=tone;
    pixels.data[i+3]=255;
  }
  r.putImageData(pixels,0,0);
  ctx.scale(scale,scale);
  ctx.lineJoin=ctx.lineCap='round';
  path(d.display.board,true);
  ctx.save();
  ctx.clip();
  ctx.drawImage(relief,0,0,width,height);
  fill(d.water.sea,'#454545');
  fill(d.water.shallow,'#5e5e5e');
  for(const pond of d.water.ponds) fill(pond,'#505050');
  for(const river of d.water.rivers){
    for(let i=1;i<river.points.length;i++) line(river.points.slice(i-1,i+1),(river.widths[i-1]+river.widths[i])/2,'#585858');
  }
  const channel=d.water.deepChannel;
  if(channel) line(channel.points,channel.widthKm,'#3a3a3a');

  const grid=cell*5;
  for(let x=0;x<width;x+=grid) line([[x,0],[x,height]],.45/scale,'#ffffff13');
  for(let y=0;y<height;y+=grid) line([[0,y],[width,y]],.45/scale,'#ffffff13');

  const roads=d.objects.roads, forest=d.objects.forest;
  const trees=Math.round(forest.count*(forest.renderFactor??.55));
  const treeNoise=rng(forest.seed), candidate=groundForestSampler(d,treeNoise);
  let count=0;
  for(let attempt=0;attempt<trees*80&&count<trees;attempt++){
    const tree=candidate(count,trees);
    if(!tree) continue;
    const {x,y}=tree;
    if(!groundInside(x,y,d.display.board)||groundInside(x,y,d.water.sea)||d.water.ponds.some(p=>groundInside(x,y,p))) continue;
    if(d.water.rivers.some(r=>{const at=groundRiverAt(x,y,r);return at.dist<at.width/2;})||
       roads.some(r=>groundDistance(x,y,r.points)<forest.roadClearanceKm)) continue;
    const size=(.09+treeNoise()*.11)*Math.max(1,14/scale), top=height-y;
    ctx.fillStyle='#282828';
    ctx.beginPath(); ctx.ellipse(x+size,top+size,size*1.9,size,.6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=treeNoise()<.5?'#858585':'#a5a5a5';
    ctx.beginPath(); ctx.arc(x,top,size,0,Math.PI*2); ctx.fill();
    count++;
  }
  for(const road of roads) line(road.points,(road.type==='main'?5:3)/scale,'#727272');
  for(const road of roads) line(road.points,(road.type==='main'?3:1.5)/scale,'#9b9b9b');
  ctx.restore();

  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.font=`600 ${13/scale}px sans-serif`;
  for(const site of d.sites){
    const y=height-site.y, labelY=y-site.radiusKm;
    ctx.beginPath();
    ctx.arc(site.x,y,site.radiusKm,0,Math.PI*2);
    ctx.lineWidth=1/scale; ctx.strokeStyle='#b3b3b388'; ctx.stroke();
    const labelWidth=ctx.measureText(site.name).width+14/scale;
    const labelX=Math.max(labelWidth/2,Math.min(width-labelWidth/2,site.x));
    ctx.fillStyle='#242424d9';
    ctx.fillRect(labelX-labelWidth/2,labelY-19/scale,labelWidth,19/scale);
    ctx.fillStyle='#cecece';
    ctx.fillText(site.name,labelX,labelY-9/scale);
  }
  canvas.dataset.terrain=id;
}
window.WOS_BG={screen(name){ scr=name; if(name!=='sortie'){clock.target=null; clock.focus=null;} sync(); }, focus(op,list,select){ if(clock.focus?.id!==op.id || (clock.focus===null&&op.place)){clock.focus=op.place?op:null; clock.target=op.place?dayOf(op.date):null; clock.since=performance.now();} marks=list; selectMark=select; }, ground:drawGround};
addEventListener('resize',fit);
new MutationObserver(sync).observe(document.getElementById('menu'),{attributes:true,attributeFilter:['hidden']});
fit();
})();
