/* node tests/ground-hint.cjs: 案内の本文と実時間タイマーをブラウザなしで確認。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function nodeChecks(){
  const html=read('index.html'),hud=read('battle/hud.js'),nodes=new Map(),timers=new Map(),listeners=new Map();let id=0;
  const hint=html.match(/<div id="hint"[^>]*>(.*?)<\/div>/s)[1],keys=html.match(/<table id="keys" hidden>(.*?)<\/table>/s)[1];
  for(const [name,text] of [['hint',hint],['keys',keys]]){
    const classes=new Set();nodes.set(name,{textContent:text,innerHTML:text,hidden:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},addEventListener(){}});
  }
  const ctx=vm.createContext({op:{ground:true},document:{getElementById:id=>nodes.get(id)},addEventListener:(name,fn)=>listeners.set(name,fn),setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  const run=s=>vm.runInContext(s,ctx),rows=[];
  const check=(name,fn)=>{try{fn();rows.push({name,ok:true});}catch(e){rows.push({name,ok:false,error:e.message});}};
  run(hud.slice(hud.indexOf("const hintEl=document.getElementById('hint')"),hud.indexOf('/* attack policy')));
  const h=nodes.get('hint'),k=nodes.get('keys');
  const tick=ms=>{for(const [i,t] of [...timers])if(t.ms===ms){timers.delete(i);t.fn();}};
  check('地上は専用本文・操作表、宇宙語なし',()=>{run('resetControlGuide({})');assert.equal(h.hidden,false);assert.doesNotMatch(h.textContent+k.innerHTML,/宙域|要塞|艦隊/);assert.match(k.innerHTML,/地点攻撃/);assert.match(k.innerHTML,/未発射/);assert.match(h.textContent,/自動迎撃/);});
  check('7秒後にフェード・800ms後に非表示',()=>{tick(7000);assert(h.classList.contains('gone'));assert.equal(h.hidden,false);tick(800);assert(h.hidden);});
  check('操作で同じフェード',()=>{run('resetControlGuide({})');listeners.get('pointerdown')();assert(h.classList.contains('gone'));tick(800);assert(h.hidden);});
  check('作戦切替時に古いフェードを解除',()=>{run('resetControlGuide({});hideHint();op={};resetControlGuide({})');tick(800);assert.equal(h.hidden,false);assert.equal(h.textContent,hint);assert.equal(k.innerHTML,keys);assert.equal(h.classList.contains('gone'),false);});
  check('前作戦の自動終了時刻を引き継がない',()=>{assert.equal(timers.size,1);tick(7000);assert(h.classList.contains('gone'));tick(800);assert(h.hidden);});
  check('チュートリアルは従来どおり非表示・地上本文',()=>{run('op={ground:true};resetControlGuide({tutorial:true})');assert(h.hidden);assert.equal(timers.size,0);assert.doesNotMatch(h.textContent+k.innerHTML,/宙域|要塞|艦隊/);});
  check('reset経由と通常出撃経由の両方で初期化',()=>{assert.match(read('battle/state.js'),/resetControlGuide\(cfg\);/);assert.match(hud.slice(hud.indexOf('window.WOS={ start')),/resetControlGuide\(cfg\);/);});
  return rows;
}
async function checkGroundHint(page,check){
  const result=await page.evaluate(()=>{
    const original={hint:spaceHint,keys:spaceKeys};
    const clean=()=>!(/宙域|要塞|艦隊/.test(hintEl.textContent+keysEl.textContent));
    reset({op:'baikonur'});const direct=clean()&&!hintEl.hidden;
    WOS.start({op:'baikonur'});const sortie=clean()&&!hintEl.hidden;
    openPause();document.querySelector('[data-pm="keys"]').click();
    if(keysEl.hidden)document.querySelector('[data-pm="keys"]').click();
    const table=clean()&&!keysEl.hidden&&!pauseEl.hidden;closePause();
    WOS.start({op:'baikonur',tutorial:true});const tutorialHidden=hintEl.hidden&&clean();
    WOS.start({op:'charybdis'});const space=hintEl.textContent===original.hint&&keysEl.innerHTML===original.keys&&!hintEl.hidden;
    return {direct,sortie,table,tutorialHidden,space};
  });
  for(const [name,ok] of Object.entries(result))check(ok,'操作案内の実画面: '+name);
}
module.exports={nodeChecks,checkGroundHint};
if(require.main===module){const rows=nodeChecks();console.log(`操作案内 ${rows.filter(r=>r.ok).length}/${rows.length}`);assert(rows.every(r=>r.ok),JSON.stringify(rows.filter(r=>!r.ok)));}
