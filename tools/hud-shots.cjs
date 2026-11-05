/* Capture and measure the battle HUD in each operation and viewport. */
const {openGame, ROOT}=require('./browser.cjs');
const fs=require('fs'), path=require('path');
(async()=>{
 const out=path.join(ROOT,'test-results','hud'); fs.mkdirSync(out,{recursive:true});
 for(const size of [{width:1600,height:900},{width:1280,height:800}]){
  for(const id of ['charybdis','shinano','retreat','nile','denali','februaria','denaliBreak'].filter(id=>!process.argv[2]||id===process.argv[2])){
   const {browser,page,errors}=await openGame(size);
   try{
    await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
    await page.click('#mainNav [data-go="mode"]'); await page.click('[data-s="mode"] [data-go="sortie"]');
    await page.click(`[data-op="${id}"]`); await page.click('#goBattle');
    if(await page.isVisible('#forcesBattle')) { if(await page.isDisabled('#forcesBattle')) { await page.click('[data-s=forces] .back'); await page.click('#goQuick'); } else await page.click('#forcesBattle'); }
    await page.evaluate(()=>{if(talking) endTalk(); if(deploying) endDeploy(); setSpeed(0); select(fleets.find(f=>f.team===0&&!f.ward&&f.alive)); talkEl.hidden=false; talkWho.textContent='通信'; talkText.textContent='作戦の状況を報告します。'; updateGoal();});
    const problems=new Set();
    const states=id==='denaliBreak'?['both','fresh','detail','scale']:['both','fresh','detail'];
    for(const state of states){
     await page.evaluate(state=>{ goalEl.classList.remove('shut','fold'); briefEl.classList.remove('shut','fresh','open');
      if(state==='fresh'){briefEl.classList.add('shut'); flashBrief(60000);}
      if(state==='detail') briefEl.classList.add('open');
      if(state==='scale'){lured={at:opMin(),by:'test'}; step(.05); op.win={...op.win,type:'deflect',need:15}; goalFlashT=0; updateGoal(); if(!document.querySelector('#goalGates svg.nks')) throw Error('scale missing');}
     },state);
     await page.screenshot({path:path.join(out,`${id}-${size.width}-${state}.png`)});
     const issues=await page.evaluate(()=>{
      const ids=['hudTabs','goal','brief','alt','talk','camSticks','legend','roster'];
      const visible=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
      const es=ids.map(id=>[id,document.getElementById(id)]).filter(([,e])=>visible(e));
      const rect=e=>e.getBoundingClientRect(), overlap=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
      const bad=[]; for(let i=0;i<es.length;i++){const [a,el]=es[i],r=rect(el); if(r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5) bad.push(a+':画面外');
       for(let j=i+1;j<es.length;j++) if(overlap(r,rect(es[j][1]))) bad.push(a+'/'+es[j][0]); }
      const g=document.getElementById('goal'); if(visible(g)){const r=rect(g); for(const e of g.querySelectorAll('*')) if(visible(e)){const x=rect(e); if(x.left<r.left-.5||x.right>r.right+.5) bad.push('goal内容:'+(e.id||e.tagName));}}
      return [...new Set(bad)]; });
     issues.forEach(x=>problems.add(state+':'+x));
    }
    if(errors.length) problems.add('エラー:'+errors.join(';'));
    console.log(`| ${id} | ${size.width}×${size.height} | ${[...problems].join('、')||'なし'} |`);
   }finally{await browser.close();}
  }
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
