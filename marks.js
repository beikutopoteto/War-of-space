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
window.WOS_MARKS={svg:(type,set,fit)=>SIDE[type]?(set==='B'?svgB(type):svgSide(type,fit)):''};
})();
