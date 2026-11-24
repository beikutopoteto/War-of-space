/* 曲射（間接砲撃）の威力を、遮蔽のあり・なしと散布半径ごとに測る。サンドボックス（平らな検証場、障害物なし）。
   node tools/ground-indirect-measure.cjs
   兵器: 自走砲・無誘導ロケット（1隊、満タン、20 km 先へ）。的: 強化歩兵・重強化歩兵（遮蔽なし／あり）、主力戦車、陸戦型 W.A.S.（遮蔽は効かない）。
   撃ち方: 「隊を指定」（いちばん近い体を狙う点の砲撃）と、的の隊の真ん中を中心にした範囲砲撃（散布半径ごと。最小より小さい半径は撃てない）。
   遮蔽ありは「森の中」として測る（現在の爆風に対する森の倍率を使う）。士気は効かせない（補給網なし）ので、減った量はそのまま耐久。各組20斉射、種448。 */
const {openGame}=require('./browser.cjs');
const {fixture}=require('./ground-weapons-measure.cjs');
function measureIndirect(){
 const KM=GROUND_SCALE,radiiM=[100,250,500,1000],out=[];
 const targets=[['infantry',false],['infantry',true],['heavyInfantry',false],['heavyInfantry',true],['vehicle',false],['was',false]];
 const forest=groundInForest;
 for(const [kind,km] of [['artillery',20],['guidedRocket',20]]){
  for(const [targetKind,cover] of targets){
   measureClear();const f=measureUnit(kind,0,-60,0),t=measureUnit(targetKind,1,-60+km*KM,0);
   groundInForest=cover?(()=>true):forest;
   const minimum=groundAreaClampRadius([f],[t.pos.clone()],0).radius*1.001; // 距離で決まる散布が範囲の幅の下限
   const modes=[{label:'隊を指定',radius:null},{label:'範囲 最小',radius:minimum},...radiiM.map(m=>({label:'範囲 '+m+' m',radius:m/1000*KM}))];
   for(const mode of modes){
    if(mode.radius!==null&&mode.radius<minimum-1e-9){out.push({kind,km,target:targetKind,cover,mode:mode.label,radiusM:Math.round(mode.radius/KM*1000),skip:true});continue;}
    let seed=448;const random=Math.random;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const sums={hits:0,loss:0,kills:0,period:0,shots:0};
    try{for(let trial=0;trial<20;trial++){
     groundStrikeReset();measureReset(f);measureReset(t);
     const hp=t.bodies.map(b=>b.hp),max=t.hpPool;
     const target=mode.radius===null?{point:t.pos.clone(),target:t}:{area:{...groundAreaShape([t.pos.clone()],mode.radius,'m'+trial),sent:new Map()}};
     const w=groundStrikeWeapon(f);assertMeasure(groundVolleyStart(f,target),'volley '+kind+' '+mode.label);sums.period+=w.reload+(kind==='guidedRocket'?(w.rocketsPerVolley-1)*w.burstInterval:0);
     let elapsed=0,shots=groundStrikes.length;
     while(groundStrikes.length||f.groundVolley){const before=new Set(groundStrikes);gameSec+=.05;elapsed+=.05;groundStrikeStep(.05);shots+=groundStrikes.filter(s=>!before.has(s)).length;assertMeasure(elapsed<180,'timeout');}
     sums.hits+=t.bodies.filter((b,i)=>b.hp<hp[i]-1e-10).length;sums.loss+=(max-t.hpPool)/max*100;sums.kills+=t.bodies.filter(b=>!b.alive).length;sums.shots+=shots;
    }}finally{Math.random=random;}
    out.push({kind,km,target:targetKind,cover,mode:mode.label,radiusM:mode.radius===null?null:Math.round(mode.radius/KM*1000),bodies:t.bodies0,shots:sums.shots/20,hits:sums.hits/20,loss:sums.loss/20,kills:sums.kills/20,perMinute:sums.loss/sums.period*60});
   }
  }
 }
 groundInForest=forest;return out;
}
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.evaluate('window.assertMeasure=(ok,message)=>{if(!ok)throw Error(message);};');
  for(const fn of [fixture,measureIndirect])await page.evaluate('window.'+fn.name+'='+fn.toString());
  await page.evaluate(fixture);const rows=await page.evaluate(()=>measureIndirect());
  if(errors.length)throw new Error(errors.join('\n'));
  const name={artillery:'自走砲',guidedRocket:'無誘導ロケット',infantry:'強化歩兵',heavyInfantry:'重強化歩兵',vehicle:'主力戦車',was:'陸戦型 W.A.S.'},f1=n=>n.toFixed(1),f2=n=>n.toFixed(2);
  console.log(JSON.stringify(rows));
  for(const kind of ['artillery','guidedRocket']){
   console.log(`\n### ${name[kind]}（20 km 先へ）\n\n|撃ち方|的|遮蔽|発数/斉射|当たった体|耐久減少 %/斉射|撃破した体|耐久減少 %/分|\n|---|---|---|---:|---:|---:|---:|---:|`);
   for(const r of rows.filter(r=>r.kind===kind)){
    const mode=r.mode==='範囲 最小'?`範囲 最小（${r.radiusM} m）`:r.mode;
    if(r.skip){console.log(`|${mode}|${name[r.target]}|${r.cover?'あり':'なし'}|—|—|最小（それより小さい半径は撃てない）|—|—|`);continue;}
    console.log(`|${mode}|${name[r.target]}（${r.bodies}体）|${r.cover?'あり':'なし'}|${f1(r.shots)}|${f2(r.hits)}|${f1(r.loss)}|${f2(r.kills)}|${f1(r.perMinute)}|`);
   }
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
