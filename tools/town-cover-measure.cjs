/* 作業票 town-cover の前後比較。npc-sim と同じ setup/step/result を使い、観測だけを足す。
   node tools/town-cover-measure.cjs before|after （8本を直列実行、test-results/ に保存） */
const fs=require('node:fs'),path=require('node:path');
const {openGame}=require('./browser.cjs');
const {setupNpcSim,advanceNpcSim,npcSimResult,sampleNpcAlly,parseArgs}=require('./npc-sim.cjs');
function observeRegroup(){
  window.regroupMeasure={logs:[],regroups:[],transitions:[]};
  const name=c=>[...npcGroundState.commanders].find(([,v])=>v===c)?.[0]??c.team;
  const log=npcLog;npcLog=(c,t,what,zone,why)=>{
    regroupMeasure.logs.push({commander:name(c),team:c.team,time:+(t-npcMeasure.start).toFixed(2),what,zone,why});
    log(c,t,what,zone,why);
  };
  const think=npcThink;npcThink=(c,sit)=>{
    const prev=new Map([...c.tasks].map(([key,s])=>[key,s.stage])),start=regroupMeasure.logs.length,p=think(c,sit);
    for(const k of p.tasks){
      if(prev.get(k.key)!==k.stage&&['seize','cut','fix'].includes(k.type))regroupMeasure.transitions.push({commander:name(c),time:+(sit.time-npcMeasure.start).toFixed(2),key:k.key,zone:k.zone,stage:k.stage});
      if(regroupMeasure.logs.slice(start).some(l=>l.what===k.type+':regroup'&&l.zone===k.zone)){
        const z=sit.zones.find(z=>z.id===k.zone);
        regroupMeasure.regroups.push({commander:name(c),time:+(sit.time-npcMeasure.start).toFixed(2),key:k.key,zone:k.zone,
          mains:k.units.filter(x=>x.as==='main').map(x=>{const u=sit.units.find(u=>u.id===x.id),f=fleets.find(f=>f.id===x.id);return {id:x.id,kind:f.groundKind,km:+Math.hypot(u.x-z.x,u.z-z.z).toFixed(2)};})});
      }
    }
    for(const [key,stage] of prev)if(['assault','advance','assemble','pin'].includes(stage)&&!p.tasks.some(k=>k.key===key))regroupMeasure.transitions.push({commander:name(c),time:+(sit.time-npcMeasure.start).toFixed(2),key,stage:'ended'});
    return p;
  };
}
async function measure(cfg){
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    await page.evaluate('window.sampleNpcAlly='+sampleNpcAlly.toString());
    await page.evaluate(setupNpcSim,cfg);await page.evaluate(observeRegroup);
    await page.evaluate('window.advanceNpcSim='+advanceNpcSim.toString());
    await page.evaluate('window.npcSimResult='+npcSimResult.toString());
    let done=false,elapsed=0;while(!done){elapsed+=5;done=await page.evaluate(sec=>advanceNpcSim(sec),elapsed);}
    if(errors.length)throw new Error(errors.join('\n'));
    return await page.evaluate(()=>({sim:npcSimResult(),measurement:regroupMeasure,
      longAssaults:[...npcGroundState.commanders].flatMap(([commander,c])=>[...c.tasks.values()].filter(k=>k.stage==='assault'&&gameSec-k.since>100).map(k=>({commander,key:k.key,seconds:+(gameSec-k.since).toFixed(2)})))}));
  }finally{await browser.close();}
}
async function main(){
  const phase=process.argv[2];if(!['before','after'].includes(phase))throw new Error('before|after');
  const dir=path.join(__dirname,'../test-results/town-cover',phase);fs.mkdirSync(dir,{recursive:true});
  for(const d0 of ['earth','mars'])for(const seed of [1,2])for(const ally of [0,.5]){
    const args=['baikonur',d0,d0==='earth'?'mars':'earth','standard',String(seed),'600',...(ally?['--ally','0.5']:[])];
    const key=d0+'-'+seed+(ally?'-ally':''),file=path.join(dir,key+'.json');
    if(fs.existsSync(file)){console.log('保存済み '+phase+' '+key);continue;}
    const r=await measure(parseArgs(args));fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
    console.log(JSON.stringify({phase,key,winner:r.sim.winner,seconds:r.sim.seconds,captures:r.sim.captures.length,assaults:r.measurement.logs.filter(l=>l.what.endsWith(':assault')).length,long:r.longAssaults.length,regroups:r.measurement.regroups.length}));
  }
  const rows=[],root=path.join(__dirname,'../test-results/town-cover');
  const stats=r=>({winner:r.sim.winner,seconds:r.sim.seconds,captures:r.sim.captures.length,assaults:r.measurement.logs.filter(l=>l.what.endsWith(':assault')).length,long:r.longAssaults.length});
  for(const d0 of ['earth','mars'])for(const seed of [1,2])for(const ally of [0,.5]){
    const key=d0+'-'+seed+(ally?'-ally':''),row={key};
    for(const p of ['before','after']){const file=path.join(root,p,key+'.json');if(fs.existsSync(file))row[p]=stats(JSON.parse(fs.readFileSync(file,'utf8')));}
    rows.push(row);
  }
  const lines=['# 指揮官の前後比較（各600秒・seed 1/2）','','勝者は軍番号（0/1）、なしは600秒時点で未決着。友軍分けは0または0.5。','',
    '| 条件（0軍の陣営・seed・友軍分け） | 版 | 勝者 | 終了秒 | 占領 | 突入 | 終了時100秒超の突入 |','|---|---|---|---:|---:|---:|---:|'];
  const warnings=[];
  for(const row of rows){
    for(const p of ['before','after'])if(row[p]){const s=row[p];lines.push(`| ${row.key} | ${p} | ${s.winner??'なし'} | ${s.seconds} | ${s.captures} | ${s.assaults} | ${s.long} |`);}
    if(row.before&&row.after){const a=row.after.captures,b=row.before.captures,delta=b?(a-b)/b:a?Infinity:0;
      if(Math.abs(delta)>.25)warnings.push(`${row.key}: 占領 ${b} → ${a}（${(delta*100).toFixed(1)}%）`);
    }
  }
  if(rows.every(r=>r.before&&r.after)){
    const wins=p=>rows.filter(r=>r[p].winner!==null).length,b=wins('before'),a=wins('after');
    if(a!==b)warnings.push(`決着の本数 ${b} → ${a}`);
  }
  if(warnings.length)lines.push('','要判断（数値は変更しない）:',...warnings.map(s=>'- '+s));
  fs.writeFileSync(path.join(root,'measure.json'),JSON.stringify({rows,warnings},null,2)+'\n');
  fs.writeFileSync(path.join(root,'measure.md'),lines.join('\n')+'\n');
  console.log(lines.join('\n'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
