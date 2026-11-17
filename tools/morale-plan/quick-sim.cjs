/* クイック出撃（バイコヌール演習）を、今の仕組み(now)か案(new)で回す。リポジトリは変えず、ページの中で関数と値を上書きする。
   node quick-sim.cjs now|new params.json seed [秒=600] */
const fs=require('fs');
const {openGame}=require(require('path').join(__dirname,'../browser.cjs'));
const [model,paramFile,seedArg,secArg]=process.argv.slice(2);
const P=JSON.parse(fs.readFileSync(paramFile,'utf8'));
function patch({P,model}){
  window.__model=model;
  if(model!=='new')return;
  for(const [k,v] of Object.entries(P.hp))if(WOS_GROUND_RULES.unitTypes[k])WOS_GROUND_RULES.unitTypes[k].hp=v;
}
function patchAfter({P,model}){
  // 計測: 敗走の回数、失った耐久、撃破した体
  window.__stat={routs:{},hpLost:{},bodies:{},routHp:[],by:{}};window.__src=null;
  const name=f=>(f.team?'敵 ':'自軍 ')+(f.groundKind==='sea'?'艦':groundRuleSet().unitTypes[f.groundKind]?.name||f.groundKind);
  const oRout=groundRoutStart;groundRoutStart=function(f){if(!f.groundRout&&!groundStaticTarget(f)){const k=name(f);__stat.routs[k]=(__stat.routs[k]||0)+1;__stat.routHp.push(+(100*(1-f.hpPool/(f.groundMaxHp||1))).toFixed(0));}return oRout.apply(this,arguments);};
  const oBody=groundBodyHit;
  const SOFT=new Set(['infantry','commando','mechanicalAssault']),INF=new Set(['infantry','commando','heavyInfantry','mechanicalAssault']),COVERED=new Set(['infantry','commando','heavyInfantry']);
  window.__ctx=null;
  groundBodyHit=function(f,body,amt){
    const was=body?.alive,hp=body?.hp||0;const r=oBody.apply(this,arguments);
    if(was){const k=name(f);__stat.hpLost[k]=(__stat.hpLost[k]||0)+Math.min(hp,amt);if(__src){const kk=name(__src)+' → '+(f.groundKind==='sea'?'艦':groundRuleSet().unitTypes[f.groundKind]?.name);__stat.by[kk]=(__stat.by[kk]||0)+Math.min(hp,amt);}
      if(!body.alive){__stat.bodies[k]=(__stat.bodies[k]||0)+1;
        if(__model==='new'&&Number.isFinite(f.groundMorale)&&f.groundMorale>0){f.groundMorale=Math.max(0,f.groundMorale-P.bodyShock*groundMoraleMax(f)/f.bodies0);if(f.groundMorale<=0&&!f.groundRout)groundRoutStart(f);}}}
    return r;
  };
  const oD0=damage;damage=function(t,amt,src){__src=src;try{return oD0.apply(this,arguments);}finally{__src=null;}};
  if(__model!=='new')return;
  const inCover=t=>{const c=groundRuleSet().combat,m=c.urbanMargin;return groundInForest(t.pos.x,t.pos.z)?'forest':groundTownZones().some(z=>groundInsideTown(t.pos,z))||groundBuildings.some(b=>b.settlement==null&&t.pos.x>=b.minX-m&&t.pos.x<=b.maxX+m&&t.pos.z>=b.minZ-m&&t.pos.z<=b.maxZ+m)?'town':null;};
  const armorOf=(t,src,w)=>{const A=P.armor[t.groundKind];if(!A||t.band!=='ground')return 0;if(w.face==='top')return A.t;
    if(P.ambush&&INF.has(src.groundKind)&&!INF.has(t.groundKind)&&inCover(src))return A.s;
    const dx=src.pos.x-t.pos.x,dz=src.pos.z-t.pos.z,L=Math.hypot(dx,dz)||1,cos=(dx*t.heading.x+dz*t.heading.z)/L;return cos>=.5?(w.heat&&A.heat?A.heat:A.f):A.s;};
  const pf=(pen,a)=>{if(!(a>0))return 1;const p=1/(1+(a/pen)**P.penK);return p+(1-p)*P.floor;};
  const oMatch=groundMatchup;
  groundMatchup=function(f,t){
    const ws=P.weapons[f.groundKind];
    if(!ws||t.band!=='ground'||t.groundKind==='sea'){f.lastS=1;return oMatch(f,t);}
    let best=null;for(const w of ws){const v=w.d*pf(w.pen,armorOf(t,f,w))*(SOFT.has(t.groundKind)?(w.soft??1):1);if(!best||v>best.v)best={v,w};}
    f.lastS=best.w.S??1;return best.v/f.dmg;
  };
  const oDamage=damage;
  damage=function(t,amt,src,impact,body){__ctx={src,impact};try{return oDamage.apply(this,arguments);}finally{__ctx=null;}};
  const oFactor=groundDamageFactor;
  groundDamageFactor=function(t){ // 降下・上陸の倍率だけ残し、遮蔽は士気の処理で掛ける
    const descent=groundScriptDescending(t)?1.5:1;if(t.groundUnloading)return groundLandingRules().damageFactor*descent;return descent;};
  const oHit=groundSupplyHit;
  groundSupplyHit=function(f,amount){
    if(!(amount>0))return amount;
    const ctx=__ctx||{},blast=!!ctx.impact,src=ctx.src;
    let h=1,m=1;
    if(COVERED.has(f.groundKind)&&f.band==='ground'){const k=f.groundKind==='commando'?P.commando:1,add=c=>{h*=1-(1-c.h)*k;m*=1-(1-c.m)*k;};
      const cv=inCover(f);if(cv)add(P.cover[cv][blast?'blast':'direct']);if(gameSec-(f.groundMovedAt??-1e9)>=P.dugSec)add(P.cover.dug[blast?'blast':'direct']);}
    if(!groundSupplyActive())return amount*h*(1-(P.fixedCut[f.groundKind]||0));
    if(!Number.isFinite(f.groundMorale))return amount*h*(1-(P.fixedCut[f.groundKind]||0));
    f.groundHitLeft=groundSupplyRules().hitSeconds;f.groundRest=0;
    const M=groundMoraleMax(f),S=blast?(P.blastS[src?.groundKind]??2.5)*(P.blastRes[f.groundKind]??1):(src?.lastS??1);
    const out=amount*h*(1-(f.groundMorale>0?P.C*f.groundMorale/M:0));
    f.groundMorale=Math.max(0,f.groundMorale-amount*m*S*P.r*100/(f.groundMaxHp||1));
    if(f.groundMorale<=0&&!f.groundRout)groundRoutStart(f);
    return out;
  };
}
function setup(seed){
  let rng=seed>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const operation=WOS_DATA.operations.find(o=>o.id==='baikonur');operation.npcSeed=seed;
  document.body.classList.add('dbg-auto');
  WOS.start({op:'baikonur',fleets:operation.quick});if(talking)endTalk();endDeploy();setSpeed(0);
  window.__start=gameSec;
}
function adv(limit){const end=Math.min(limit,gameSec-__start+30);while(gameSec-__start<end-1e-8&&!over)step(.05);return over||gameSec-__start>=limit-1e-8;}
function result(){
  const sum=team=>{const us=fleets.filter(f=>f.team===team&&f.groundKind&&!['fighter','attack','supportAircraft','sea'].includes(f.groundKind));
    return {companies:us.length,alive:us.filter(f=>f.alive).length,hpLeftPct:+(100*us.reduce((n,f)=>n+(f.alive?f.hpPool:0),0)/us.reduce((n,f)=>n+(f.groundMaxHp||0),0)).toFixed(0)};};
  const owner=groundSites.map(s=>s.id+':'+(s.owner==null?'-':s.owner)).join(' ');
  return {sec:+(gameSec-__start).toFixed(0),result:over?(outcome?'自軍の勝ち':'自軍の負け'):'未決',ours:sum(0),foe:sum(1),sites:owner,routs:__stat.routs,routHpAvg:__stat.routHp.length?+(__stat.routHp.reduce((a,b)=>a+b,0)/__stat.routHp.length).toFixed(0):null,nRout:__stat.routHp.length,
    by:Object.fromEntries(Object.entries(__stat.by).filter(([k,v])=>v>=20).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,+v.toFixed(0)])),hpLost:Object.fromEntries(Object.entries(__stat.hpLost).map(([k,v])=>[k,+v.toFixed(0)])),bodies:__stat.bodies};
}
(async()=>{
  const {browser,page,errors}=await openGame({width:1280,height:800});
  try{
    await page.evaluate(patch,{P,model});
    await page.evaluate(setup,+seedArg);
    await page.evaluate(patchAfter,{P,model});
    for(const fn of [adv,result])await page.evaluate('window.'+fn.name+'='+fn.toString());
    const limit=+(secArg||600);
    while(!await page.evaluate(l=>adv(l),limit));
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(JSON.stringify({model,seed:+seedArg,...await page.evaluate(()=>result())}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
