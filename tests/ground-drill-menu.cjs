/* ブラウザ不要。prep.js の実関数で2つの入口・解放・報酬・保存移行を確認。 */
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
function runMenuChecks(){
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),nodes=new Map(),stored=new Map(),calls=[];
  // Only button attributes are needed here; layout and native keyboard behavior are checked in Chromium below.
  const node=id=>{if(!nodes.has(id)){
    const n={innerHTML:'',textContent:'',hidden:false,scrollTop:0};
    Object.defineProperty(n,'innerHTML',{get(){return this.html||'';},set(html){this.html=html;this.buttons=[...html.matchAll(/<button\b([^>]*)>/g)].map(([,attrs])=>{
      const dataset=Object.fromEntries([...attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
      return {dataset,focus(){}};
    });}});
    n.querySelectorAll=selector=>(n.buttons||[]).filter(({dataset})=>{
      const key=selector.includes('op-section')?'opSection':'op',value=selector.match(/="([^"]*)"/)?.[1];
      return dataset[key]!==undefined&&(value===undefined||dataset[key]===value);
    });
    n.querySelector=selector=>n.querySelectorAll(selector)[0]; nodes.set(id,n);
  }return nodes.get(id);};
  let mapChoose;
  const ctx=vm.createContext({window:{WOS:{start:cfg=>calls.push(cfg)}},document:{body:{classList:{toggle(){}}},getElementById:node},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},WOS_BG:{focus:(o,list,choose)=>{mapChoose=choose;}},scaleText:()=>'',show(){}});
  const run=s=>vm.runInContext(s,ctx);
  run('var WOS_DATA=window.WOS_DATA={}');
  for(const file of ['data/ships.js','data/bonuses.js','data/operations.js','data/tech.js','data/terrain/exercise2.js','data/ground-org.js'])run(read(file));
  const prep=read('prep.js');
  run(prep.slice(prep.indexOf("'use strict';"),prep.indexOf('const esc=')));
  run("let sortieOp='tutorial2',sortieInitialized=false,sortieGroups=[];const esc=s=>String(s);");
  run(prep.slice(prep.indexOf('function sortieSections(){'),prep.indexOf('function renderForces(){')));
  run(prep.slice(prep.indexOf('function onKey(e){'),prep.indexOf('window.WOS_MENU=')));
  run("const menu={hidden:false};let screen='sortie',shortcutCalls=0;");
  run(prep.split('\n').find(line=>line.startsWith('const aidNow=')));
  let count=0;
  const check=(code,message)=>{assert.equal(run(code),true,message);count++;};
  check("!opOpen(TUT2)&&!opOpen(TUT2_BASE)",'新規保存では両方に鍵');
  run("prog().tutorialCleared=true;prog().cleared=CAMP.filter(o=>o.id!=='denaliBreak').map(o=>o.id)");
  check("!opOpen(TUT2)&&!opOpen(TUT2_BASE)",'第一章最終節前は両方に鍵');
  run("prog().cleared.push('denaliBreak');renderSortie()");
  check("opOpen(TUT2)&&!opOpen(TUT2_BASE)",'第一章後はチュートリアル2だけ解放');
  const section=id=>node('opList').innerHTML.match(new RegExp(`<section[^>]*data-section="${id}"[\\s\\S]*?</section>`))[0];
  const exercises=section('演習');
  assert.match(exercises,/data-op="tutorial2"[^>]*>[\s\S]*?チュートリアル2/);count++;
  assert.match(exercises,/data-op="baikonur"[^>]*disabled[\s\S]*?バイコヌール演習/);count++;
  check("TUT2.tutorial===TUT2_BASE.tutorial&&TUT2.groundDrill&&!TUT2_BASE.groundDrill&&TUT2.tutorial.length===26",'案内は基本演習と共有する26手順');
  assert.equal(node('goQuick').hidden,true);count++;
  node('goBattle').onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),{op:'baikonur',tutorial:true});count++;
  check("onEnd('baikonur',false)===''&&!cleared('tutorial2')",'敗北ではクリア・報酬なし');
  check("onEnd('baikonur',true).includes('資金 +100')&&cleared('tutorial2')&&!cleared('baikonur')&&prog().funds===100&&opOpen(TUT2_BASE)",'案内付き勝利は専用記録・資金100・通常演習解放');
  check("onEnd('baikonur',true).includes('資金 +67')&&prog().funds===167",'チュートリアル2再戦は67');
  run("sortieOp='baikonur';renderSortie()");
  assert.equal(node('goQuick').hidden,false);count++;
  node('goQuick').onclick();
  assert.equal(calls.at(-1).fleets.length,9);count++;
  check("onEnd('baikonur',true)===''&&!cleared('baikonur')&&prog().funds===167",'クイックは報酬・クリア記録なし');
  node('goBattle').onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),{op:'baikonur'});count++;
  check("onEnd('baikonur',true).includes('資金 +300')&&cleared('baikonur')&&prog().funds===467",'通常演習の初回は300');
  check("onEnd('baikonur',true).includes('資金 +200')&&prog().funds===667",'通常演習の再戦は200');
  run("globalThis.legacy=defaults();delete legacy.sortieMenu;legacy.prog.tutorialCleared=true;legacy.prog.cleared=['denaliBreak','ch2drill','tutorial2'];legacy.prog.funds=1234;migrate(legacy);save=legacy");
  check("Object.keys(save.sortieMenu.closed).length===0&&save.sortieMenu.seen.length===0",'旧保存に章タブの状態を補う');
  check("cleared('tutorial2')&&!cleared('ch2drill')&&!cleared('baikonur')&&prog().cleared.filter(id=>id==='tutorial2').length===1&&prog().funds===1234&&opOpen(TUT2_BASE)",'旧クリアは重複なくtutorial2へ移行・資金維持・通常演習解放');
  check("(()=>{const before=JSON.stringify(save);migrate(save);return JSON.stringify(save)===before;})()",'移行を再実行しても変わらない');
  run("prog().cleared=prog().cleared.filter(id=>id!=='denaliBreak')");
  check("!opOpen(TUT2)&&!opOpen(TUT2_BASE)",'旧案内クリアだけでもデナリ破砕前は両方に鍵');
  run("save=defaults();prog().tutorialCleared=true;prog().cleared=CAMP.filter(o=>o.id!=='denaliBreak').map(o=>o.id);renderSortie()");
  const clickTab=id=>node('opList').querySelectorAll('[data-op-section]').find(b=>b.dataset.opSection===id).onclick();
  const clickOp=id=>node('opList').querySelectorAll('[data-op]').find(b=>b.dataset.op===id).onclick();
  assert.match(section('第二章'),/第二章　重力[\s\S]*準備中/);count++;
  // Acknowledge the currently open exercises, then fold every section before the unlock.
  clickTab('演習');clickTab('演習');
  check("!sortieSections().find(s=>s.id==='演習').ops.some(sortieUnseen)&&!save.sortieMenu.seen.includes('tutorial2')",'開いた段の解放済み作戦だけ既読にする');
  clickTab('第一章');
  check("save.sortieMenu.closed['第一章']&&!save.sortieMenu.closed['第二章']&&!save.sortieMenu.closed['演習']",'第一章だけを畳んでもほかの段は開いたまま');
  for(const id of ['第二章','演習'])clickTab(id);
  check("Object.values(save.sortieMenu.closed).every(Boolean)",'3段を独立して畳める');
  run("persist();save=load();renderSortie()");
  for(const id of ['第一章','第二章','演習']){assert.match(section(id),/aria-expanded="false"[\s\S]*class="op-rows"[^>]*hidden/);count++;}
  run("prog().cleared.push('denaliBreak');persist();save=load();renderSortie()");
  assert.match(section('演習'),/op-tab unseen[\s\S]*op-new/);count++;
  check("sortieUnseen(TUT2)&&!sortieUnseen(TUT2_BASE)&&save.sortieMenu.closed['演習']",'デナリ破砕で案内が未読になり折り畳みを維持');
  run("renderSortie()");
  check("sortieUnseen(TUT2)",'自動選択・再描画では未読を消さない');
  clickTab('演習');
  check("!sortieUnseen(TUT2)&&!save.sortieMenu.closed['演習']",'段を開くと通知が止まる');
  assert.doesNotMatch(section('演習'),/op-tab unseen|op-new/);count++;
  run("persist();save=load();renderSortie()");
  check("!sortieUnseen(TUT2)&&!save.sortieMenu.closed['演習']",'開閉と既読を読み直して維持');
  run("prog().cleared.push('tutorial2');renderSortie()");
  check("opOpen(TUT2_BASE)&&sortieUnseen(TUT2_BASE)",'案内をクリアすると開いている段にも通常演習の新規通知');
  clickOp('baikonur');
  check("!sortieUnseen(TUT2_BASE)&&sortieOp==='baikonur'",'作戦を選ぶとその作戦が既読になる');
  run("save.sortieMenu.seen=[];renderSortie()");clickTab('演習');mapChoose('baikonur');
  check("!sortieUnseen(TUT2_BASE)&&!save.sortieMenu.closed['演習']",'地図から選ぶと段を開いて選んだ作戦を既読にする');
  run("save.sortieMenu.seen=['ch2drill','tutorial2'];migrate(save)");
  check("save.sortieMenu.seen.join(',')==='tutorial2'",'旧案内の既読も重複なく移行');
  run("persist()");
  assert.ok(!stored.get('wos.save.v1').includes('ch2drill'));count++;
  node('goBattle').click=()=>run('shortcutCalls++');
  run("onKey({key:'Enter',target:{tagName:'BUTTON',closest:()=>true},preventDefault(){throw Error('章タブの標準操作を妨げた');}})");
  check("shortcutCalls===0",'章タブのEnterは出撃せず標準の開閉に任せる');
  run("onKey({key:'Enter',target:{tagName:'BODY',closest:()=>null},preventDefault(){}})");
  check("shortcutCalls===1",'画面のEnterは従来どおり出撃');
  run("onKey({key:'Enter',target:{tagName:'BUTTON',closest:()=>null},preventDefault(){}})");
  check("shortcutCalls===2",'既存ボタンにフォーカスがあっても従来のEnter出撃を保つ');
  console.log(`| メニューの章タブ・解放・報酬・保存移行（ブラウザ不要） | ${count}/${count} 成功 |`);
}
async function checkSortieSections(page,check,menu,onState=async()=>{}){
  const tabs=page.locator('[data-op-section]'),tab=id=>page.locator(`[data-op-section="${id}"]`);
  check(await tabs.count()===3,'章タブ: 第一章・第二章・演習');
  await tab('演習').click();await tab('演習').click(); // acknowledge only operations available before Denali
  for(const id of ['第一章','第二章','演習'])await tab(id).click();
  await menu();
  check(await page.locator('[data-op-section][aria-expanded="false"]').count()===3&&await page.locator('.op-rows:visible').count()===0,'章タブ: 3段の折り畳みを再読込して保存');
  await onState('a');
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wos.save.v1'));s.prog.cleared.push('denaliBreak');localStorage.setItem('wos.save.v1',JSON.stringify(s));});await menu();
  check(await tab('演習').evaluate(e=>e.classList.contains('unseen')),'章タブ: 新しく解放した演習を黄色で通知');
  await menu();
  check(await tab('演習').evaluate(e=>getComputedStyle(e).animationName==='op-unseen'),'章タブ: 再読込後も未読なら点滅');
  await onState('b');
  await page.emulateMedia({reducedMotion:'reduce'});
  check(await tab('演習').evaluate(e=>getComputedStyle(e).animationName==='none')&&await tab('演習').locator('.op-new').isVisible(),'章タブ: 動きを減らす設定では黄色の印だけ');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await tab('演習').focus();await page.keyboard.press('Enter');
  check(await tab('演習').getAttribute('aria-expanded')==='true'&&await tab('演習').evaluate(e=>!e.classList.contains('unseen'))&&await page.locator('[data-s="sortie"]').isVisible(),'章タブ: Enterで開き通知を消す');
  await menu();
  check(await tab('演習').getAttribute('aria-expanded')==='true'&&await tab('演習').locator('.op-new').count()===0,'章タブ: 開いた状態と既読を保存');
  await tab('第一章').focus();await page.keyboard.press('Space');
  check(await tab('第一章').getAttribute('aria-expanded')==='true','章タブ: Spaceでも開く');
  // Keep the existing battle checks in their original state: first chapter complete, all sections open.
  await tab('第二章').click();
}
module.exports={runMenuChecks,checkSortieSections};
if(require.main===module)runMenuChecks();
