/* #501 の実装を案4の固定場面で確認する。node tools/morale-plan/implemented.cjs [種数=3]
   体ごとの射撃と着弾は実ゲーム。隊は固定し、敗走開始・全滅で交戦を終える。
   補給の消費は有効。補給網、士気の回復、移動、指揮官、機械の自然消耗は場面から外す。 */
const {createControlsContext}=require('../../tests/ground-controls.cjs');
const originalCases=require('./c6.json');
const {ctx,run}=createControlsContext();
const trials=Number(process.argv[2]||3);
const duel=(a,b,defender={})=>({
  name:[a,b,defender.cover,defender.h&&'側面'].filter(Boolean).join(' / '),
  units:[{k:a,team:0,x:0},{k:b,team:1,x:[a,b].every(k=>['was','vehicle','heavyInfantry'].includes(k))?2:.7,...defender}],
  T:180
});
const cases=[
  ...originalCases.filter(c=>/^(artillery砲撃→(infantry|vehicle|apc)|guidedRocket砲撃→(infantry|vehicle)|鎧:|槍:|W\.A\.S\.:( 開け| 戦車2)|盾: 歩兵の撃ち合い)/.test(c.name)),
  duel('vehicle','infantry'),duel('vehicle','apc'),duel('infantry','apc'),duel('heavyInfantry','vehicle'),
  duel('was','infantry'),duel('was','heavyInfantry'),duel('was','mechanicalAssault'),duel('was','apc'),
  duel('was','vehicle'),duel('was','vehicle',{h:[0,1]}),
  duel('was','heavyInfantry',{cover:'town',dug:true}),
  duel('infantry','infantry',{cover:'town',dug:true}),duel('heavyInfantry','infantry',{cover:'town',dug:true}),
  duel('vehicle','heavyInfantry',{cover:'town',dug:true})
].map(c=>{
  // 元の2対1は隊中心間が小銃の射程外。横のずれだけ縮め、両側から射撃が届く配置にする。
  if(c.name.startsWith('鎧: 歩兵2'))return {...c,units:c.units.map(u=>u.team===0?{...u,z:u.z/2}:u)};
  return c;
});
run(`
function measure(c,seed){
  groundVolleyReset();op={ground:'exercise2',groundHQ:{0:'A',1:'F'},wipeLose:false};
  fleets=[];groundSites=[];groundStrikes=[];groundImpacts=[];groundForests=[];groundBuildings=[];
  groundHeight=groundSightHeight=()=>0;groundHeightCacheReset();groundFog=null;groundVisuals=new THREE.Group();
  const start=groundSupplyRules().dugSec;
  gameSec=start;over=false;engaged.clear();groundFxReset();
  shoot=burst=groundHud=()=>{};groundSeenBy=groundPointSeenBy=()=>true;
  let rng=seed;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const units=c.units.map(o=>{
    const f=makeFleet(o.team,groundUnitSpec({name:o.k,kind:o.k,at:[12,18],platoons:1}));
    fleets.push(f);groundInitUnit(f);f.pos.set(o.x*GROUND_SCALE,0,(o.z||0)*GROUND_SCALE);
    const [x,z]=o.h||[o.team?-1:1,0];f.heading.set(x,0,z);f.groundDeployed=true;
    if(o.dug)f.groundSpawnAt=0;
    if(o.cover==='forest')groundForests.push({x:f.pos.x,z:f.pos.z,r:.25});
    if(o.cover==='town'){
      const {x,z}=f.pos;
      groundBuildings.push({x,z,w:.4,d:.4,ang:0,minX:x-.2,maxX:x+.2,minZ:z-.2,maxZ:z+.2,bottom:0,top:0,settlement:'town'});
    }
    return f;
  });
  const active=f=>f.alive&&!f.groundRout;
  const finish=units.map(()=>null),volleys=units.map(()=>0);
  for(let tick=0;tick<c.T/.05;tick++){
    gameSec=start+tick*.05;
    for(const [i,f] of units.entries()){
      if(!active(f))continue;
      const spec=c.units[i];
      if(spec.gun){
        const target=units[spec.target];
        if(target.alive&&(active(target)||spec.keep)&&volleys[i]<(spec.volleys??Infinity)&&!f.groundVolley&&(f.groundStrikeCooldown||0)<=0&&groundVolleyStart(f,{point:target.pos,target}))volleys[i]++;
        continue;
      }
      const foes=units.filter((t,j)=>t.team!==f.team&&active(t)&&!c.units[j].gun).sort((a,b)=>groundDistanceTo(f,a)-groundDistanceTo(f,b));
      if(foes[0]){f.order={type:'attack',target:foes[0]};groundBodyFire(f,foes[0],.05);}
    }
    groundStrikeStep(.05);
    for(const [i,f] of units.entries())if(finish[i]===null&&!active(f))finish[i]={seconds:gameSec-start,state:f.alive?'敗走':'全滅'};
    const done=[0,1].some(team=>{
      const line=units.filter((f,i)=>f.team===team&&!c.units[i].gun);
      return line.length&&!line.some(active);
    });
    const volleyDone=c.untilVolleys&&c.units.every((o,i)=>!o.gun||volleys[i]>=o.volleys);
    if((done||volleyDone)&&!groundStrikes.length&&!units.some(f=>f.groundVolley))break;
  }
  return units.map((f,i)=>({loss:100*(1-f.hpPool/f.groundMaxHp),finish:finish[i],volleys:volleys[i]}));
}
`);
const average=xs=>xs.reduce((sum,x)=>sum+x,0)/xs.length;
for(const c of cases){
  ctx.input=c;
  const runs=Array.from({length:trials},(_,i)=>{ctx.seed=(i+1)*101;return run('measure(input,seed)');});
  const parts=c.units.map(({k,team},i)=>{
    const stats=runs.map(r=>r[i]),finished=stats.flatMap(r=>r.finish?[r.finish]:[]);
    const counts=['敗走','全滅'].map(state=>state+finished.filter(r=>r.state===state).length).join(' ');
    return `${team} ${k} 耐久減${average(stats.map(r=>r.loss)).toFixed(1)}% ${counts}${finished.length?' 平均'+average(finished.map(r=>r.seconds)).toFixed(1)+'秒':''}`;
  });
  console.log(c.name+' | '+parts.join(' | '));
}
