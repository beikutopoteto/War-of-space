/* 地上の重さの測り（部隊編成の実装の最初の段、2026-11-18。docs/spec.md「地上の部隊編成」の作戦規模の上限を決めるため）。
   node tools/ground-weight.cjs [--per=4] [--seconds=150] [--seed=1] [--sw] [--today] 16 64 128 192 256
   300 km の検証場（field300）の拠点 B と C のあいだに、両軍に同じ数の小隊（引数、1軍あたり）を約14 km 離して並べ、
   両軍の指揮官 AI（地球・共和国、ふつう）で戦わせる。兵科の割合は旅団らしい16個中隊の組（歩兵4・戦車4・重強化歩兵2・
   自走砲2・ロケット・自走対空・斥候・補給 各1）の繰り返し。
   小隊は「中隊の強さ」の形をこの道具の中だけで先取りする: 1中隊 = --per 小隊で、体の数・耐久・火力を per 倍
   （小隊の体は横2列に並べる）。--per=1 は今の形（1中隊 = 1小隊）。
   --today: 比べる基準。今のバイコヌール演習のクイック出撃（48×36 km、決まった部隊）を同じ測り方で（小隊の数の引数は要らない）。
   測るもの（1フレームは groundStep 1回 + groundDraw + 描画 + 名札など。battle/loop.js の frame）:
   - 計算: groundStep(0.05) の平均と95%点（開始から --seconds ゲーム秒まで。撃ち合いの始まりと、撃っている隊の数の平均）
   - 1フレームの仕事: 戦いの最中に速度1で3秒動かし、frame 1回の時間（平均・95%点）と内訳。描画のすぐあとで GPU が描き終わるのを待つ（gl.finish）ので、GPU の仕事を含む
     （計算 groundStep・描く準備 groundDraw・描画 renderer.render（GPU 込み）・その他＝名札や一覧）。60fps には16.7ms、30fps には33ms 以内
   - GPU: 止めた状態で、描画を GPU が描き終わるまで（gl.finish）の時間。広い視点（距離140＝作戦の始めの視点）と近い視点（距離30）、
     地上の部隊を隠した地形だけの時間も（差が体の重さ）。描く回数（draw call）と三角形の数
   ヘッドレスの実フレームの間隔は、画面を重ねる処理（コンポジット）が実際のブラウザより重く比べられないので出さない（2026-11-18）。
   既定で Mac の GPU（Metal）で描く（--sw でソフトウェア描画）。画面は 1600×900、画素の倍率2（Retina。ゲームは最大2で描く）。
   結果と読み方は docs/reports/2026-11-18-ground-weight.md。 */
const {openGame}=require('./browser.cjs');
const MIX=['infantry','vehicle','infantry','heavyInfantry','vehicle','artillery','infantry','vehicle','heavyInfantry','guidedRocket','infantry','vehicle','mobileAA','artillery','scout','supply'];

// ページの中で動く。両軍を並べ、小隊の倍率を入れる。
function setupWeight(cfg){
  let rng=cfg.seed>>>0||1;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const base=WOS_DATA.operations.find(o=>o.id===(cfg.today?'baikonur':'groundfield300'));
  const source={...base,npc:{0:{doctrine:'earth',level:'standard'},1:{doctrine:'mars',level:'standard'}},npcSeed:cfg.seed,
    groundStaticEnemies:false,win:{type:'groundHQ',text:'検証: 敵本営占領または敵全滅'}};
  if(!cfg.today)source.groundSea=[];
  const index=WOS_DATA.operations.findIndex(o=>o.id===base.id);WOS_DATA.operations[index]=source;
  autoMode=false;
  reset({op:source.id,fleets:source.quick});if(talking)endTalk();setSpeed(0);endDeploy();   // 地形を読み込んでから置き場所を探す
  if(!cfg.today){
    const companies=Math.ceil(cfg.platoons/cfg.per),used=new Set();
    const place=(team,cx,cy,dir)=>{const rows=Math.min(8,companies),out=[];
      for(let i=0;i<companies;i++){
        const kind=cfg.mix[i%cfg.mix.length],kindMove=groundMoveKind({groundKind:kind,band:'ground'}),x=cx-dir*Math.floor(i/rows)*1.2,y=cy+(i%rows-(rows-1)/2)*1.2;
        let at=null;
        for(let s=0;s<60&&!at;s++)for(let a=0,n=Math.max(1,s*6);a<n&&!at;a++){
          const px=x+Math.cos(a/n*Math.PI*2)*s*.4,py=y+Math.sin(a/n*Math.PI*2)*s*.4,key=Math.round(px/.4)+','+Math.round(py/.4);
          if(!used.has(key)&&groundPass(px,py,kindMove,false)){at=[px,py];used.add(key);}
        }
        out.push({name:(team?'赤':'青')+' 検証第'+(i+1)+'中隊',kind,at:at||[x,y],band:'ground',stance:'engage'});
      }return out;};
    source.quick=place(0,134,126,1);source.enemies=place(1,148,123,-1);
    if(cfg.per>1){
      const scaled=new Set(['infantry','heavyInfantry','vehicle','artillery','guidedRocket','mobileAA','scout','supply','apc','engineer','commando','mechanicalAssault']);
      const model=groundModelFor,init=groundInitUnit;
      groundModelFor=(kind,side)=>{const m=model(kind,side);if(!m||!scaled.has(kind))return m;
        const xs=m.offsets.map(o=>o[0]),zs=m.offsets.map(o=>o[1]),w=Math.max(...xs)-Math.min(...xs)+1.6,d=Math.max(...zs)-Math.min(...zs)+1.6;
        const cols=Math.min(2,cfg.per),rows=Math.ceil(cfg.per/cols),offsets=[];
        for(let p=0;p<cfg.per;p++)for(const [x,z] of m.offsets)offsets.push([x+(p%cols-(cols-1)/2)*w,z-(Math.floor(p/cols)-(rows-1)/2)*d]);
        return {...m,offsets};};
      groundInitUnit=f=>{if(scaled.has(f.groundKind)){f.hpPool*=cfg.per;f.dmg*=cfg.per;}return init(f);};
    }
    reset({op:source.id,fleets:source.quick});if(talking)endTalk();setSpeed(0);endDeploy();
  }
  menuOpen=false;document.body.classList.remove('inmenu');document.getElementById('menu').hidden=true;   // WOS.start と同じ（戦闘の画面で測る）
  window.weight={start:gameSec,steps:[],firing:[],contact:null};
  let meshes=0;groundVisuals.traverse(o=>{if(o.isMesh)meshes++;});
  const mine=t=>fleets.filter(f=>f.team===t&&f.alive&&f.groundKind!=='sea');
  return {companies:[0,1].map(t=>mine(t).length),bodies:[0,1].map(t=>mine(t).reduce((n,f)=>n+(f.bodies0||1),0)),meshes};
}
function advanceWeight(until){
  const m=weight;
  while(gameSec-m.start<until&&!over){
    const t0=performance.now();step(.05);m.steps.push(performance.now()-t0);
    const firing=fleets.filter(f=>f.alive&&f.fireTarget).length;
    if(m.contact===null&&firing)m.contact=+(gameSec-m.start).toFixed(1);
    if(m.contact!==null)m.firing.push(firing);
  }
  return over;
}
function weightView(view){
  const live=fleets.filter(f=>f.alive&&!f.embarked&&f.groundKind!=='sea'),mid=new THREE.Vector3();live.forEach(f=>mid.add(f.pos));mid.multiplyScalar(1/Math.max(1,live.length));
  let target=mid,dist=140;
  if(view==='close'){const own=live.filter(f=>f.team===0);target=own.reduce((a,b)=>a.pos.distanceTo(mid)<b.pos.distanceTo(mid)?a:b,own[0]).pos;dist=30;}
  camAnim=null;controls.target.copy(target);camera.position.set(target.x,target.y+dist*.84,target.z+dist*.55);camera.lookAt(controls.target);controls.update();
}
function median(a){const s=[...a].sort((x,y)=>x-y);return s.length?+s[Math.floor(s.length/2)].toFixed(2):null;}
function pct95(a){const s=[...a].sort((x,y)=>x-y);return s.length?+s[Math.ceil(s.length*.95)-1].toFixed(2):null;}
// GPU の速さは回によってぶれる（このMacは熱で速さが落ちることがある）ので、平均でなく中央値。
function renderWeight(view){
  weightView(view);const gl=renderer.getContext();
  const time=()=>{const times=[];for(let i=0;i<32;i++){const t0=performance.now();groundDraw();renderer.render(scene,camera);gl.finish();if(i>=2)times.push(performance.now()-t0);}return median(times);};
  const gpuMs=time(),calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
  groundVisuals.visible=false;const terrainMs=time();groundVisuals.visible=true;
  return {gpuMs,terrainMs,calls,triangles};
}
// frame を包んで、1フレームのメインスレッドの時間と内訳を測る（frame は最後に requestAnimationFrame(frame) で自分を名前で呼ぶ）。
function liveWeight(view){
  weightView(view);
  // 元の関数は最初の1回だけ覚える（包んだ frame は戻したあとも、すでに予約した1回だけ呼ばれる）。
  const orig=window.weightOrig||(window.weightOrig={frame,groundStep,groundDraw,render:renderer.render}),sum={step:0,draw:0,render:0},rows=[];
  const wrap=(fn,k,self)=>(...a)=>{const t0=performance.now();try{return fn.apply(self,a);}finally{sum[k]+=performance.now()-t0;}};
  // 描画のすぐあとで GPU を待つ: 描画は GPU の仕事を含み、フレームどうしで GPU の仕事が溜まらない（画面の重ね合わせは入らない）。
  const gl=renderer.getContext(),renderAndWait=function(...a){orig.render.apply(this,a);gl.finish();};
  groundStep=wrap(orig.groundStep,'step');groundDraw=wrap(orig.groundDraw,'draw');renderer.render=wrap(renderAndWait,'render',renderer);
  return new Promise(resolve=>{
    // 内訳はフレームごとの前後の差で取る（包む前に予約済みのフレームの分を混ぜない）。止めたあとの始めの0.5秒は捨てる。
    const t0=performance.now();let done=false;
    frame=now=>{if(done)return orig.frame(now);const s=performance.now(),b={...sum};orig.frame(now);const e=performance.now();
      if(s-t0>=500)rows.push({frame:e-s,step:sum.step-b.step,draw:sum.draw-b.draw,render:sum.render-b.render});
      if(s-t0>=3500){done=true;frame=orig.frame;groundStep=orig.groundStep;groundDraw=orig.groundDraw;renderer.render=orig.render;setSpeed(0);
        const col=k=>rows.map(r=>r[k]),mean=k=>+(col(k).reduce((a,b)=>a+b,0)/rows.length).toFixed(2);
        resolve({frames:rows.length,medianMs:median(col('frame')),p95Ms:pct95(col('frame')),stepMs:mean('step'),drawMs:mean('draw'),renderMs:mean('render'),
          otherMs:+(mean('frame')-mean('step')-mean('draw')-mean('render')).toFixed(2),stepP95Ms:pct95(col('step'))});}};
    setSpeed(1);
  });
}
function summary(){
  const m=weight,mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
  return {steps:m.steps.length,stepMedianMs:median(m.steps),stepMeanMs:+mean(m.steps).toFixed(2),stepP95Ms:pct95(m.steps),stepMaxMs:+Math.max(...m.steps).toFixed(1),
    contact:m.contact,firingMean:+mean(m.firing).toFixed(1),alive:[0,1].map(t=>fleets.filter(f=>f.team===t&&f.alive).length),heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null};
}
async function measure(platoons,opt){
  const {browser,page,errors}=await openGame({width:1600,height:900},{gpu:!opt.sw,scale:2});
  try{
    const gpu=await page.evaluate(()=>{const gl=renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'?';});
    const setup=await page.evaluate(setupWeight,{platoons,per:opt.per,seed:opt.seed,mix:MIX,today:opt.today});
    for(const fn of [median,pct95,advanceWeight,weightView,renderWeight,liveWeight,summary])await page.evaluate('window.'+fn.name+'='+fn.toString());
    for(let at=10;at<opt.seconds+10;at+=10)if(await page.evaluate(s=>advanceWeight(s),Math.min(at,opt.seconds)))break;
    const sim=await page.evaluate(()=>summary());
    const render={wide:await page.evaluate(()=>renderWeight('wide')),close:await page.evaluate(()=>renderWeight('close'))};
    const live={wide:await page.evaluate(()=>liveWeight('wide')),close:await page.evaluate(()=>liveWeight('close'))};
    if(errors.length)throw new Error(errors.join('\n'));
    return {platoons:opt.today?'今':platoons,per:opt.today?1:opt.per,gpu,...setup,sim,render,live};
  }finally{await browser.close();}
}
const HEAD=['| 小隊/軍 | 中隊 0/1 | 体（両軍） | 計算 中央/平均/95%/最大 ms | 撃つ隊（平均） | 1フレーム 広い 中央/95% ms | 内訳 計算/準備/描画(GPU込み)/その他 ms | 同 近い 中央/95% ms | GPU 広い/近い ms（地形だけ） | 描く回数/三角形（広い） |',
  '|---:|---|---:|---|---:|---|---|---|---|---|'];
function row(r){
  const w=r.live.wide,c=r.live.close,s=r.sim;
  return `| ${r.platoons} | ${r.companies.join('/')} | ${r.bodies[0]+r.bodies[1]} | ${s.stepMedianMs} / ${s.stepMeanMs} / ${s.stepP95Ms} / ${s.stepMaxMs} | ${s.firingMean} | ${w.medianMs} / ${w.p95Ms} | ${w.stepMs} / ${w.drawMs} / ${w.renderMs} / ${w.otherMs} | ${c.medianMs} / ${c.p95Ms} | ${r.render.wide.gpuMs} / ${r.render.close.gpuMs}（${r.render.wide.terrainMs} / ${r.render.close.terrainMs}） | ${r.render.wide.calls} / ${Math.round(r.render.wide.triangles/1e4)}万 |`;
}
if(require.main===module){
  const args=process.argv.slice(2),flag=(k,d)=>{const a=args.find(a=>a.startsWith('--'+k+'='));return a?Number(a.split('=')[1]):d;};
  const opt={per:flag('per',4),seconds:flag('seconds',150),seed:flag('seed',1),sw:args.includes('--sw'),today:args.includes('--today')};
  const list=opt.today?[0]:args.filter(a=>!a.startsWith('--')).map(Number);
  if(!list.length||list.some(n=>!Number.isInteger(n)||n<0))throw new Error('引数: 1軍あたりの小隊の数（例 16 64 128）、または --today');
  (async()=>{
    console.log(HEAD.join('\n'));
    for(const n of list){const r=await measure(n,opt);console.log(row(r));console.error(JSON.stringify(r));}
  })().catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={measure,setupWeight,advanceWeight,MIX,HEAD,row,median,pct95};
