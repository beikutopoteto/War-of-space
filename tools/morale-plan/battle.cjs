/* 地上の士気・装甲・遮蔽の案を、実ゲームのコード（Node VM。体ごとの射撃・爆風・散布）で今の仕組みと比べる。リポジトリは変えない。
   node battle.cjs params.json cases.json [seeds=3]
   場面: units=[{k,team,x,z,h:[hx,hz],cover,dug,gun:true(地点攻撃で撃ち続ける)}]。直射の隊はいちばん近い、敗走していない敵を撃つ。
   砲の隊は target（units の番号）へ「隊を指定」の砲撃を繰り返す。終わり: 片方の直射の隊がすべて敗走・全滅、または T 秒。
   士気は自前で持つ（補給網は使わない）。now=今の仕組み（士気が1対1で先に吸う、歩兵の遮蔽0.8、相性2・3倍）、new=案。 */
const fs=require('fs');
const {createControlsContext}=require(require('path').join(__dirname,'../../tests/ground-controls.cjs'));
const P=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const cases=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const seeds=+(process.argv[4]||3);
const {ctx,run}=createControlsContext();
ctx.P=P;
run(`
function fresh(seed){
  groundVolleyReset();op={ground:'exercise2',groundHQ:null};fleets=[];groundSites=[];groundBridges=[];groundStrikes=[];groundImpacts=[];groundForests=[];groundBuildings=[];groundFog=null;
  groundHeight=groundSightHeight=()=>0;groundHeightCacheReset();groundVisuals=new THREE.Group();gameSec=0;over=false;engaged.clear();
  shoot=burst=groundHud=()=>{};groundSeenBy=groundPointSeenBy=()=>true;
  let s=seed>>>0||1;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}
const SOFT=new Set(P.soft||['infantry','commando','mechanicalAssault']);const INF=new Set(['infantry','commando','heavyInfantry','mechanicalAssault']);
const COVERED=new Set(['infantry','commando','heavyInfantry']);
const MORALE_MAX={infantry:150,heavyInfantry:150,commando:150,mechanicalAssault:200};
let MODEL='now';
function U(o,team){
  const kind=o.k;
  const f=makeFleet(team,groundUnitSpec({name:kind+team,kind,type:'cv',at:[12,18],band:'ground',stance:'evade'}));
  if(MODEL==='new'&&P.hp[kind]!=null){f.hp=P.hp[kind];f.hpPool=P.hp[kind];}
  fleets.push(f);groundInitUnit(f);f.pos.set(o.x*GROUND_SCALE,0,(o.z||0)*GROUND_SCALE);const h=o.h||[team?-1:1,0];f.heading.set(h[0],0,h[1]).normalize();
  f.groundDeployed=true;f.groundVisible=[true,true];f.eva=0;
  f.mo=['was','droneHive'].includes(kind)?null:(MORALE_MAX[kind]||100);f.moMax=f.mo;f.routAt=null;f.cover=o.cover||null;f.dug=!!o.dug;f.gun=!!o.gun;f.spec=o;
  return f;
}
function armorOf(t,src,w){
  const A=P.armor[t.groundKind];if(!A)return 0;
  if(w.face==='top')return A.t;
  if(P.ambush&&INF.has(src.groundKind)&&src.cover&&!INF.has(t.groundKind))return A.s; // 森・町の歩兵は横と上を撃てる
  const dx=src.pos.x-t.pos.x,dz=src.pos.z-t.pos.z,L=Math.hypot(dx,dz)||1,cos=(dx*t.heading.x+dz*t.heading.z)/L;
  if(cos>=.5)return w.heat&&A.heat?A.heat:A.f;
  return A.s;
}
function penFactor(pen,armor){if(!(armor>0))return 1;const p=1/(1+(armor/pen)**P.penK);return p+(1-p)*P.floor;}
function bestWeapon(f,t){
  let best=null;
  for(const w of P.weapons[f.groundKind]||[]){
    const v=w.d*penFactor(w.pen,armorOf(t,f,w))*(SOFT.has(t.groundKind)?(w.soft??1):1);
    if(!best||v>best.v)best={v,w};
  }
  return best;
}
const origMatchup=groundMatchup;
groundMatchup=function(f,t){
  if(MODEL==='now')return origMatchup(f,t);
  const b=bestWeapon(f,t);if(!b)return 0;f.lastS=b.w.S??1;return b.v/f.dmg;
};
groundSupplyAttackFactor=f=>f.mo==null?1:.5+.5*f.mo/f.moMax;
function coverOf(t,blast){
  if(MODEL==='now')return {h:t.cover&&COVERED.has(t.groundKind)?1-(1-.8)*(t.groundKind==='commando'?1.5:1):1,m:1};
  let h=1,m=1;
  if(COVERED.has(t.groundKind)){
    const k=t.groundKind==="commando"?P.commando:1,add=c=>{h*=c.h**k;m*=c.m**k;};
    if(t.cover)add(P.cover[t.cover][blast?'blast':'direct']);
    if(t.dug)add(P.cover.dug[blast?'blast':'direct']);
  }
  return {h,m};
}
damage=function(t,amt,src,impact,body){
  if(!t.alive||!(amt>0))return;
  amt*=1.3;const blast=!!impact,c=coverOf(t,blast);
  const before=t.bodies.filter(b=>b.alive).length;
  let hp;
  if(MODEL==='now'){
    amt*=c.h;
    if(t.mo!=null&&t.mo>0){const ab=Math.min(t.mo,amt);t.mo-=ab;amt-=ab;}
    hp=amt;
  }else{
    const S=blast?(P.blastS[src.groundKind]??2.5)*(P.blastRes[t.groundKind]??1):(src.lastS??1);
    if(t.mo==null){hp=amt*c.h*(1-(P.fixedCut[t.groundKind]||0));}
    else{
      const cut=t.mo>0?P.C*t.mo/t.moMax:0;
      hp=amt*c.h*(1-cut);
      t.mo=Math.max(0,t.mo-amt*c.m*S*P.r*100/t.groundMaxHp);
    }
  }
  const b=body&&body.alive?body:t.bodies.find(b=>b.alive);if(b)groundBodyHit(t,b,hp);
  const after=t.bodies.filter(b=>b.alive).length;
  if(MODEL!=='now'&&t.mo!=null&&after<before)t.mo=Math.max(0,t.mo-(before-after)*P.bodyShock*t.moMax/t.bodies0);
  if(!after)t.alive=false;
  if(t.mo!=null&&t.mo<=0&&t.routAt==null)t.routAt=gameSec;
};
function active(f){return f.alive&&f.routAt==null;}
function battle(model,c,seed){
  MODEL=model;fresh(seed);
  const us=c.units.map(o=>U(o,o.team));
  const T=c.T||300;let t=0;const snaps={};
  const lines=team=>us.filter(f=>f.team===team&&!f.gun);
  while(t<T){
    for(const f of us)if(f.gun&&active(f)){
      const tg=us[f.spec.target];
      if(tg&&tg.alive&&(f.spec.volleys==null||(f.vols||0)<f.spec.volleys)&&(tg.routAt==null||f.spec.keep)&&!f.groundVolley&&(f.groundStrikeCooldown||0)<=0){if(groundVolleyStart(f,{point:tg.pos.clone(),target:tg}))f.vols=(f.vols||0)+1;}
    }
    gameSec+=.05;t+=.05;
    for(const f of us){
      if(f.gun||!active(f))continue;
      const foes=us.filter(e=>e.team!==f.team&&active(e)&&!e.gun).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b));
      if(foes[0])groundBodyFire(f,foes[0],.05);
    }
    groundStrikeStep(.05);
    for(const s of c.snap||[])if(!snaps[s]&&t>=s)snaps[s]=us.map(stat);
    const done=[0,1].some(team=>lines(team).length&&lines(team).every(f=>!active(f)));
    if(done&&!groundStrikes.length&&!us.some(f=>f.groundVolley))break;
    if(c.untilVolleys&&us.every(f=>!f.gun||(f.vols||0)>=f.spec.volleys)&&!groundStrikes.length&&!us.some(f=>f.groundVolley))break;
  }
  return {t:+t.toFixed(1),u:us.map(stat),snaps};
}
function stat(f){return {k:f.groundKind,team:f.team,rout:f.routAt==null?null:+f.routAt.toFixed(1),hpLost:+(100*(1-f.hpPool/f.groundMaxHp)).toFixed(1),bodies:f.bodies0-f.bodies.filter(b=>b.alive).length,mo:f.mo==null?null:Math.round(f.mo),dead:!f.alive,vols:f.vols};}
`);
const out=[];
for(const c of cases){
  const res={};
  for(const m of (c.models||['now','new'])){
    const runs=[];for(let s=1;s<=seeds;s++){ctx.__c=c;ctx.__m=m;ctx.__s=s*101;runs.push(run('battle(__m,__c,__s)'));}
    res[m]=runs;
  }
  out.push({name:c.name,res});
}
// 平均を表に
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
for(const {name,res} of out){
  const line=[name.padEnd(26)];
  for(const m of Object.keys(res)){
    const runs=res[m],n=runs[0].u.length,parts=[];
    for(let i=0;i<n;i++){
      const us=runs.map(r=>r.u[i]);const routs=us.filter(u=>u.rout!=null);
      parts.push(`${us[0].k[0]+us[0].k.slice(1,4)}${us[0].team}:${routs.length?'敗走'+avg(routs.map(u=>u.rout)).toFixed(0)+'s('+routs.length+'/'+us.length+')':'残'}/-${avg(us.map(u=>u.hpLost)).toFixed(0)}%${us[0].mo!=null?'/士気'+avg(us.map(u=>u.mo)).toFixed(0):''}${us.some(u=>u.dead)?'/全滅'+us.filter(u=>u.dead).length:''}${us[0].vols?'/斉射'+avg(us.map(u=>u.vols||0)).toFixed(1):''}`);
    }
    line.push(`[${m} t=${avg(runs.map(r=>r.t)).toFixed(0)}] `+parts.join(' '));
  }
  console.log(line.join(' '));
}
fs.writeFileSync(process.argv[3].replace('.json','')+'.out.json',JSON.stringify(out));
