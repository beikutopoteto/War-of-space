/* 確定SVGの同一性と既存ボタンの接続を実ブラウザで確認。見本の重ね描きはしない。 */
const {openGame,ROOT}=require('./browser.cjs');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const {browser,page,errors}=await openGame({width:1600,height:900});
 try{
  await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
  await page.waitForFunction(()=>window.WOS&&typeof groundSupplyNet!=='undefined',{timeout:60000});
  console.log('演習を読み込み済み');
  await page.evaluate(()=>window.requestAnimationFrame=()=>0);
  const result=await page.evaluate(require('../tests/command-icons.cjs').commandIconCases);
  console.log(JSON.stringify(result));
  for(const k of ['directBoard','cleared','friendSelect','cancelled','identical','board','move','hold','expanded','collapsed','shared','left','bar'])assert.equal(result[k],true,k);
  assert.deepEqual(result.buttonSize,[48,25]);assert.equal(result.ratio,1.6);assert.deepEqual(result.size,[36,22.5]);
  assert.equal(result.title,'輸送車に乗車・岸の揚陸艦に乗艦');
  for(const [file,key] of [['ground-transport','transportCases'],['ground-strike','strikeCases'],['ground-supply','supplyCases']]){
   const rows=await page.evaluate(require('../tests/'+file+'.cjs')[key]);
   const failed=rows.filter(r=>!r.ok);console.log(file+': '+(rows.length-failed.length)+'/'+rows.length);assert.deepEqual(failed,[]);
  }
  // 実部隊の固有命令を選んだ実寸写真。描画を待ってから保存。
  await page.evaluate(()=>{reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});setSpeed(0);if(talking)endTalk();endDeploy();setSpeed(0);const f=fleets.find(f=>f.team===0&&f.groundKind==='artillery');select(f);camAnim=null;controls.target.copy(f.pos);camera.position.copy(f.pos).add(new THREE.Vector3(0,65,80));camera.lookAt(f.pos);controls.update();groundHud();groundDraw();renderer.render(scene,camera);});
  await page.waitForTimeout(500);
  fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  await page.screenshot({path:path.join(ROOT,'.shots','command-icons-artillery.png')});
  await page.evaluate(()=>{select(fleets.find(f=>f.team===0&&f.groundKind==='infantry'));groundHud();});
  await page.waitForTimeout(250);await page.screenshot({path:path.join(ROOT,'.shots','command-icons-infantry.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
