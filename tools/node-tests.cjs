/* Nodeだけで実行するtests/の入口を、失敗しても最後まで順番に回す。
   npm test（Chromium）は別に実行。ログと一覧はtest-results/node-tests/へ保存。 */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/node-tests');
fs.mkdirSync(out,{recursive:true});
const files=fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.cjs')&&name!=='smoke.cjs'&&
 (/require\.main\s*===\s*module/.test(fs.readFileSync(path.join(root,'tests',name),'utf8'))||name==='ground-path-perf.cjs')).sort();
const rows=[];
for(const name of files){
 const result=spawnSync(process.execPath,[path.join(root,'tests',name)],{cwd:root,encoding:'utf8',timeout:900000,maxBuffer:8*1024*1024});
 const log=(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:'');
 fs.writeFileSync(path.join(out,name+'.log'),log);
 const row={file:name,ok:result.status===0&&!result.error,status:result.status,signal:result.signal};rows.push(row);
 console.log((row.ok?'✓ ':'✗ ')+name);
}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(rows,null,2)+'\n');
console.log(`Nodeテスト: ${rows.filter(r=>r.ok).length}/${rows.length} ファイル成功`);
process.exitCode=rows.every(r=>r.ok)?0:1;
