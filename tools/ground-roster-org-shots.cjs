/* node tools/ground-roster-org-shots.cjs: 戦闘中の編成を実画面で撮影。 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const shots=path.join(root,'.shots');
const three=path.dirname(require.resolve('three/package.json'));

async function capture(browser,options,tag,withDrag=false){
  const page=await browser.newPage(options);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.addInitScript(()=>{window.WOS_UIS=1;});
    await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/,route=>{
      const url=route.request().url();
      const script=url.includes('cdnjs')?'build/three.min.js':url.split('three@0.128.0/')[1];
      return route.fulfill({path:path.join(three,script),contentType:'application/javascript'});
    });
    await page.route(/fonts\.(googleapis|gstatic)\.com/,route=>route.fulfill({body:''}));
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.evaluate(()=>{
      const exercise=OPS.find(o=>o.id==='groundExercise2');
      WOS.start({op:exercise.id,fleets:exercise.quick,quickOrg:true});
      if(talking)endTalk();
      if(deploying)endDeploy();
      setSpeed(0);hideHint();
    });
    const roster=page.locator('#roster');
    const free=roster.locator('.ground-rfree button[id^="fl"]');
    await free.nth(0).click();
    await free.nth(1).click({modifiers:['Shift']});
    assert.equal(await roster.locator('.gnew span').textContent(),'2隊を選択中');
    assert.equal(await roster.getByRole('button',{name:'＋大隊',exact:true}).isEnabled(),true);
    assert.equal(await roster.getByRole('button',{name:'＋旅団',exact:true}).isDisabled(),true);
    const headers=await page.locator('#roster .ground-rhead').evaluateAll(heads=>heads.map(head=>{
      const name=head.querySelector('.grpBtn'), range=document.createRange();
      range.selectNodeContents(name);
      const buttons=[...head.querySelectorAll('.rgDel,.rgStance,.ground-plan-swatch')].map(b=>b.getBoundingClientRect());
      const nameRight=Math.min(range.getBoundingClientRect().right,name.getBoundingClientRect().right-parseFloat(getComputedStyle(name).paddingRight));
      return {name:name.textContent,layout:nameRight<=buttons[0].left&&buttons.every((rect,i)=>i===0||buttons[i-1].right<=rect.left)};
    }));
    assert.ok(headers.length>0);
    assert.deepEqual(headers.filter(h=>!h.layout),[],'見出しの名前・解散・全自動・色の四角が重ならない');
    const shoot=async name=>{
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(shots,name+'.png')});
    };
    await page.mouse.move(1,1);
    await shoot('ground-roster-org-'+tag);
    if(withDrag){
      const from=roster.getByRole('button',{name:/^第3 重強化歩兵中隊/});
      const to=roster.locator('[data-level="battalions"]').last();
      await from.click();
      assert.equal(await roster.getByRole('button',{name:'＋旅団',exact:true}).isEnabled(),true);
      const origin=await from.boundingBox(),target=await to.boundingBox();
      await page.mouse.move(origin.x+origin.width/2,origin.y+origin.height/2);
      await page.mouse.down();
      await page.mouse.move(target.x+40,target.y+38,{steps:8});
      assert.equal(await to.evaluate(el=>getComputedStyle(el).outlineStyle),'dashed');
      assert.equal(await page.locator('.dragGhost').count(),1);
      await shoot('ground-roster-org-drag-'+tag);
      await page.mouse.up();
    }
    assert.deepEqual(errors,[],'ページの例外');
    console.log(`${tag} ${headers.length}見出しの重なりなし、ページ例外0件`);
  }finally{
    await page.close();
  }
}

(async()=>{
  fs.mkdirSync(shots,{recursive:true});
  const browser=await chromium.launch(process.platform==='darwin'?
    {args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}:{});
  try{
    await capture(browser,{viewport:{width:1100,height:760}},'1100',true);
    await capture(browser,{viewport:{width:390,height:780},deviceScaleFactor:3,isMobile:true,hasTouch:true},'390');
    await capture(browser,{viewport:{width:1600,height:900}},'1600');
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
