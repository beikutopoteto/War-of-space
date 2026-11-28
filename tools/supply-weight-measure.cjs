/* #522: node tools/supply-weight-measure.cjs [--json]
   Chromium で実際の groundStep を早送りする。npm test や撮影と同時に回さない。 */
const assert=require('node:assert/strict');
const {openGame}=require('./browser.cjs');
const {fixture}=require('./ground-weapons-measure.cjs');

const SEEDS=[101,202,303];
const COMBAT=['infantry','commando','mechanicalAssault','heavyInfantry','vehicle','was','attack'];
const INDIRECT=['infantry','artillery','guidedRocket'];
const ANTI_AIR=['attack','mobileAA','fighter'];
const DUEL_KM=.45, INDIRECT_KM=2.5, AIR_KM=1.5;
const DUEL_MINUTES=60, DAMAGE_MINUTES=30, MAX_INFANTRY=24;

function measureTrial({kind,mode,seed,infantry=1,opponents=1,distance,minutes}){
  const oldRandom=Math.random;
  let rng=seed;
  Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  try{
    groundStrikeReset();
    for(const f of fleets){
      f.el.remove();
      f.groundModel?.parent?.remove(f.groundModel);
      f.groundSelection?.parent?.remove(f.groundSelection);
    }
    fleets=[];fid=0;gameSec=0;engaged.clear();
    const unit=(kind,team,x,z,a,i,stance='engage')=>{
      const p={at:[groundMapX(x),groundMapY(z)],name:`計測 ${seed}/${team}/${i}`,kind,platoons:1,stance};
      if(['attack','fighter'].includes(kind))p.band='low';
      const f=makeFleet(team,groundUnitSpec(p));
      f.heading.set(Math.cos(a),0,Math.sin(a));
      f.march.copy(f.heading);
      fleets.push(f);groundInitUnit(f);f.groundDeployed=true;
      return f;
    };
    const radius=distance*GROUND_SCALE;
    let a,b;
    if(mode==='duel'){
      // 同じ距離の正面に並ぶ。1対2では兵科側を扇形に置く。
      const fan=(k,team,n)=>Array.from({length:n},(_,i)=>{
        const a=(i-(n-1)/2)*Math.min(.15,1.9/Math.max(1,n-1))+(team===1?Math.PI:0);
        return unit(k,team,-radius*Math.cos(a),-radius*Math.sin(a),a,i);
      });
      if(opponents===1){
        a=fan('infantry',0,infantry);b=[unit(kind,1,0,0,Math.PI,0)];
      }else{
        a=[unit('infantry',0,0,0,0,0)];b=fan(kind,1,opponents);
      }
    }else{
      a=[unit(kind,0,-radius,0,0,0)];
      b=[unit(mode==='air'?'attack':'infantry',1,0,0,Math.PI,0,'evade')];
    }
    const active=f=>f.alive&&!f.groundRout&&!f.groundAirState;
    const initial=group=>group.reduce((sum,f)=>sum+f.groundMaxHp,0);
    const hp=group=>group.reduce((sum,f)=>sum+Math.max(0,f.hpPool),0);
    const dt=.05,ticks=Math.round(minutes/groundRuleSet().clock.minutesPerSecond/dt);
    const first=[initial(a),initial(b)];
    if(fleets.some(f=>f.groundSupply!==groundSupplyRules().max||
      groundSupplyLand(f)&&f.groundMorale!==groundMoraleMax(f)))throw Error('計測の初期補給・士気が満タンではありません');
    const gun=a[0],target=b[0];
    if(mode==='indirect'&&kind!=='infantry'&&groundFireMode(gun,target)!=='indirect')throw Error(`${kind} が曲射できません`);
    for(let tick=1;tick<=ticks;tick++){
      gameSec=tick*dt;
      // 直接射撃は自動交戦。曲射は両兵科とも同じ部隊指定で再装填ごとに行う。
      if(mode==='indirect'&&kind!=='infantry'&&target.alive&&!gun.groundVolley&&groundStrikeCanLaunch(gun,target.pos)){
        if(!groundVolleyStart(gun,{point:target.pos,target}))throw Error(`${kind} の曲射を開始できません`);
      }
      groundStep(dt);
      if(mode==='duel'&&(!a.some(active)||!b.some(active)))break;
      if(mode==='air'&&!target.alive)break;
    }
    const hpLeft=[hp(a),hp(b)],activeHp=[hp(a.filter(active)),hp(b.filter(active))];
    const survivors=[a.filter(active).length,b.filter(active).length];
    const winner=mode!=='duel'?null:survivors.every(n=>n>0)?'timeout':survivors[0]?'infantry':survivors[1]?'opponent':'draw';
    const leftForBase=fleets.filter(f=>f.groundAirState).map(f=>f.team);
    return {seed,infantry,opponents,minutes:opClock(),hpLeft,initialHp:first,survivors,winner,
      balance:activeHp[0]/first[0]-activeHp[1]/first[1],damage:first[1]-hpLeft[1],leftForBase};
  }finally{Math.random=oldRandom;}
}

const mean=values=>values.reduce((sum,n)=>sum+n,0)/values.length;
// 隣り合う試行の「戦える残存耐久の割合」の差を直線で補間する。
function parity(rows){
  const ratio=r=>r.infantry/r.opponents;
  for(const [i,b] of rows.entries()){
    if(b.balance===0)return ratio(b);
    const a=rows[i-1];
    if(a&&a.balance<0&&b.balance>0)return ratio(a)+(ratio(b)-ratio(a))*(-a.balance)/(b.balance-a.balance);
  }
  throw Error('互角の前後を測定できません: '+JSON.stringify(rows));
}
const roundWeight=n=>Math.round(n*2)/2;

async function run(){
  const {browser,page,errors}=await openGame();
  try{
    await page.evaluate('window.assertMeasure=(ok,message)=>{if(!ok)throw Error(message);};');
    await page.evaluate(fixture);
    await page.evaluate(()=>{
      // 補給の消費と士気を有効にし、補充できる拠点・道路は置かない。
      op={...op,groundHQ:{},win:null,wipeLose:false,groundRuleOverrides:null};
      groundSupplyNet={nodes:[],edges:[],sites:new Map()};
      groundSupplyPenalty=0;clockHeld=0;
    });
    const trial=options=>page.evaluate(measureTrial,options);
    const rows=[];
    for(const kind of COMBAT){
      const trials=[];
      for(const seed of SEEDS){
        const duel=(infantry,opponents)=>trial({kind,mode:'duel',seed,infantry,opponents,distance:DUEL_KM,minutes:DUEL_MINUTES});
        const cases=[await duel(1,1)];
        if(cases[0].balance>0)cases.unshift(await duel(1,2));
        for(let n=2;cases.at(-1).balance<0&&n<=MAX_INFANTRY;n++)cases.push(await duel(n,1));
        trials.push({seed,value:parity(cases),cases});
      }
      rows.push({kind,method:'duel',trials,weight:kind==='infantry'?1:roundWeight(mean(trials.map(t=>t.value)))});
    }
    for(const [mode,kinds] of [['indirect',INDIRECT],['air',ANTI_AIR]]){
      const base=[];
      for(const [i,kind] of kinds.entries()){
        const trials=[];
        for(const [j,seed] of SEEDS.entries()){
          const distance=mode==='air'?AIR_KM:kind==='infantry'?DUEL_KM:INDIRECT_KM;
          const result=await trial({kind,mode,seed,distance,minutes:DAMAGE_MINUTES});
          // 対空も30分間で1小隊から減った耐久。撃墜で計測を終えた場合も、残り時間の損害は0。
          const score=result.damage;
          if(i===0){assert(score>0,`${mode} の比較元が損害を与えていません`);base.push(score);}
          trials.push({seed,value:score/base[j],score,result});
        }
        const scale=mode==='air'?rows.find(r=>r.kind==='attack').weight:1;
        rows.push({kind,method:mode,trials,weight:i===0?null:roundWeight(scale*mean(trials.map(t=>t.value)))});
      }
    }
    assert.equal(errors.length,0,errors.join('\n'));
    const standard=await page.evaluate(()=>{
      const op=WOS_DATA.operations.find(o=>o.id==='baikonur');
      const quick=op.quick.map(groundUnitSpec).map(f=>({kind:f.groundKind,platoons:f.groundPlatoons}));
      return {quick,defaults:WOS_GROUND_ORG.defaults().companies.map(({kind,platoons})=>({kind,platoons})),
        base:op.groundSortie.supplyBase,weights:WOS_GROUND_RULES.supplyWeight,bonusPerPlatoon:WOS_GROUND_RULES.sortieLimits.supplyPerPlatoon};
    });
    const weights={...standard.weights};
    for(const r of rows)if(r.weight!==null)weights[r.kind]=r.weight;
    const total=(companies,values)=>companies.reduce((sum,c)=>sum+(values[c.kind]??0)*c.platoons,0);
    const lineups=Object.fromEntries(['defaults','quick'].map(key=>{
      const list=standard[key];
      return [key,{platoons:list.reduce((sum,c)=>sum+c.platoons,0),
        before:total(list,standard.weights),after:total(list,weights),bonus:total(list,{supply:standard.bonusPerPlatoon})}];
    }));
    const result={seeds:SEEDS,duelKm:DUEL_KM,indirectKm:INDIRECT_KM,airKm:AIR_KM,duelMinutes:DUEL_MINUTES,damageMinutes:DAMAGE_MINUTES,
      rows,currentBase:standard.base,currentWeights:standard.weights,weights,lineups};
    if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));
    else{
      for(const r of rows)console.log(`${r.kind} (${r.method})  ${r.trials.map(t=>t.value.toFixed(3)).join(' / ')}  → ${r.weight??'比較元'}`);
      console.log(lineups);
    }
  }finally{await browser.close();}
}

run().catch(e=>{console.error(e);process.exitCode=1;});
