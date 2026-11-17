/* Rebuild the candidate table from measured JSON. Never edits combat data. */
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,'.shots','weapons-'+p+'.json'),'utf8'));
const allPath=path.join(root,'.shots/weapons-all-arcs.json');
const before=read('before'),after=read('after'),allArcs=fs.existsSync(allPath)?JSON.parse(fs.readFileSync(allPath,'utf8')):null,fmt=n=>Number(n.toFixed(4)).toString();
const match=(r,t)=>before.rows.find(b=>b.weapon===r.weapon&&b.km===r.km&&b.target===t);
const HEAD='\n## 前と後の比べ（間接の砲撃の威力2倍・戦車の地点攻撃3倍を入れたあと）';
let out=HEAD+'\n\n「後」は、間接の砲撃（自走砲・無誘導ロケット・W.A.S. の 76 mm・戦艦・高速艇とイージス艦）の地点攻撃の弾の威力を2倍にした値（`strike.*.dmgScale`、ユーザー決定 2026-11-17「砲撃ダメージは元の2倍程度で構いません」）。戦車の地点攻撃は3倍（ユーザー決定 2026-11-17）。支援機の爆弾と直射は1倍のまま。この表は士気なしで測る（歩兵の士気の倍率は効かない）。各欄は毎分の耐久減少の「後 ÷ 前」、括弧は「前の何分の一」かの分母。最後の欄は、強化歩兵の実測を前へ戻すのにさらに要る倍率（前 ÷ 後）。体の撃破・耐久の上限で比例しない場合がある。0被弾の標本からは倍率を求められない。`unitTypes` の `dmg` は変えていない。\n\n|兵器|距離 km|強化歩兵 後/前|主力戦車 後/前|陸戦型 W.A.S. 後/前|対歩兵の dmg 倍率候補|\n|---|---:|---:|---:|---:|---:|\n';
for(const r of after.rows.filter(r=>r.target==='infantry')){
 const cells=['infantry','vehicle','was'].map(t=>{
  const a=after.rows.find(a=>a.weapon===r.weapon&&a.km===r.km&&a.target===t),b=match(r,t);
  return a.perMinute?`${fmt(a.perMinute/b.perMinute)}（1/${fmt(b.perMinute/a.perMinute)}）`:'0（算出不可）';
 });
 out+='|'+[r.weapon,r.km??'1進入',...cells,fmt(match(r,'infantry').perMinute/r.perMinute)+'倍'].join('|')+'|\n';
}
out+=`\n負荷の平均CPU時間: ${fmt(before.load.meanMs)} → ${fmt(after.load.meanMs)} ms（${fmt((after.load.meanMs/before.load.meanMs-1)*100)}%変化）。p95: ${fmt(before.load.p95Ms)} → ${fmt(after.load.p95Ms)} ms。最大: ${fmt(before.load.maxMs)} → ${fmt(after.load.maxMs)} ms。最大飛翔弾: ${before.load.maxProjectiles} → ${after.load.maxProjectiles} 発、実際に描いた弾道: ${before.load.maxArcs} → ${after.load.maxArcs} 本、表示札: ${before.load.maxLabels} → ${after.load.maxLabels}。\n\n${allArcs?`全144発の弾道と弾を描く実装では平均 ${fmt(allArcs.meanMs)} ms（前より ${fmt((allArcs.meanMs/before.load.meanMs-1)*100)}%増）、p95 ${fmt(allArcs.p95Ms)} msだった。平均が2割を超えたため、作業票に従い体ごとの最初の弾だけ弾道と弾を描く方式へ変更した。`:'既定は各体の最初の弾だけ弾道と弾を描く。削減前の負荷データは今回の入力に含まれていない。'}着弾輪は全弾、秒数札は斉射につき1つ。最大値には実行環境の揺らぎも含む。\n`;
const report=path.join(root,'docs/reports/2026-11-17-weapons-measure.md');
const previous=fs.readFileSync(report,'utf8'),at=[HEAD,'\n## 前と後の比べ（間接の砲撃の威力2倍を入れたあと）','\n## 威力の候補（未適用）'].map(h=>previous.indexOf(h)).find(i=>i>=0)??-1,next=at<0?-1:previous.indexOf('\n## ',at+5);
fs.writeFileSync(report,(at<0?previous:previous.slice(0,at))+out+(next<0?'':previous.slice(next)));
console.log('| 比較表 | 13組、前と後の比べを記録 |');
