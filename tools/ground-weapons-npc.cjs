/* #448: twelve sequential runs of the existing NPC tool; never runs a baseline. */
const fs=require('fs'),path=require('path');
const {run,parseArgs}=require('./npc-sim.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const rows=[];
 for(const doctrines of [['mars','earth'],['earth','mars']])for(const seed of [1,2,3])for(const ally of [0,.5]){
  const args=['baikonur',...doctrines,'standard',String(seed),'600',...(ally?['--ally',String(ally)]:[])],r=await run(parseArgs(args));
  const row={doctrines:doctrines.join('/'),seed,ally,winner:r.winner,seconds:r.seconds,captures:r.captures.length,nonNeutral:r.captures.filter(e=>e.owner!==null).length};rows.push(row);
  fs.mkdirSync(path.join(root,'.shots'),{recursive:true});fs.writeFileSync(path.join(root,'.shots',`weapons-npc-${doctrines.join('-')}-${seed}-${ally}.json`),JSON.stringify(r,null,2)+'\n');
  console.log('| '+[row.doctrines,seed,ally?'友軍50%':'分割なし',row.winner??'未決',row.seconds,row.captures,row.nonNeutral].join(' | ')+' |');
 }
 const wins=rows.filter(r=>r.winner!==null).length,captures=rows.reduce((s,r)=>s+r.captures,0),nonNeutral=rows.reduce((s,r)=>s+r.nonNeutral,0);
 let out='\n## バイコヌール12回（後）\n\n既存 `tools/npc-sim.cjs` の実行関数を順番に使用。standard・既定の600ゲーム秒、両陣営の順・種1〜3・友軍分割0または50%。前は#446本文の決着2・占領48を使用し、回し直していない。占領は道具の `captures` 記録数（中立化を含む所有変更）。中立化を除いた件数も併記する。\n\n|陣営0/1|種|友軍分割|勝者|経過 秒|占領記録|中立化を除く|\n|---|---:|---:|---|---:|---:|---:|\n';
 for(const r of rows)out+='|'+[r.doctrines,r.seed,r.ally?'50%':'なし',r.winner??'未決',r.seconds,r.captures,r.nonNeutral].join('|')+'|\n';
 out+=`\n決着 **2 → ${wins}**、占領記録 **48 → ${captures}**（後の中立化を除く占領${nonNeutral}）。威力・半径・倍率による釣り合わせは行っていない。\n`;
 const report=path.join(root,'docs/reports/2026-11-17-weapons-measure.md');fs.writeFileSync(report,fs.readFileSync(report,'utf8').split('\n## バイコヌール12回（後）')[0]+out);
 console.log(`| 合計 | 決着 ${wins}/12 | 占領記録 ${captures} | 中立化を除く ${nonNeutral} |`);
})().catch(e=>{console.error(e);process.exitCode=1;});
