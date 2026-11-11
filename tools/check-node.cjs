/* Nodeだけで実行できる全確認を順番に回す。ブラウザの確認はnpm testで別に行う。 */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'tests');
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.cjs')&&f!=='smoke.cjs'&&
  (/require\.main\s*===\s*module/.test(fs.readFileSync(path.join(dir,f),'utf8'))||['docs-check.cjs','ground-path-perf.cjs','ground-territory-cache.cjs'].includes(f))).sort();
let failed=0;
for(const file of files){
 const r=spawnSync(process.execPath,[path.join(dir,file)],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
 console.log(`${r.status===0?'PASS':'FAIL'} ${file}`);
 if(r.status!==0){failed++;process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)console.error(r.error.message);}
}
console.log(`Node確認 ${files.length-failed}/${files.length} 成功`);process.exitCode=failed?1:0;
