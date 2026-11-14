/* 1600×900、降下予告の写真と台本の実画面検証。出力はtest-results。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
const {checkGroundScript}=require('../tests/ground-script.cjs');
(async()=>{
  const {browser,page,errors}=await openGame({width:1600,height:900});let failed=0;const rows=[];
  try{
    await checkGroundScript(page,(ok,name,detail='')=>{rows.push({ok,name,detail});if(!ok)failed++;},{shot:async()=>{await page.screenshot({path:path.join(ROOT,'test-results/ground-script-warning.png')});}});
    if(errors.length){failed++;rows.push({ok:false,name:'ページ例外',detail:errors.join('\n')});}
    fs.writeFileSync(path.join(ROOT,'test-results/ground-script-browser.json'),JSON.stringify(rows,null,2)+'\n');
    rows.filter(r=>!r.ok).forEach(r=>console.error(r));console.log(`地上台本 Chromium: ${rows.filter(r=>r.ok).length}/${rows.length} 成功`);
  }catch(e){fs.writeFileSync(path.join(ROOT,'test-results/ground-script-browser.json'),JSON.stringify(rows,null,2)+'\n');throw e;}finally{await browser.close();}
  if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
