/* 作業票 #472。node tools/ground-front-shots.cjs
   作業票 #480 の比較写真: node tools/ground-front-shots.cjs --corridor before|after */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {ROOT}=require('./browser.cjs');
const out=path.join(ROOT,'.shots');
const three=path.dirname(require.resolve('three/package.json'));

async function open(browser,options){
  const page=await browser.newPage(options),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.WOS_UIS=1;});
  await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/,route=>{
    const url=route.request().url(),file=url.includes('cdnjs')?'build/three.min.js':url.split('three@0.128.0/')[1];
    return route.fulfill({path:path.join(three,file),contentType:'application/javascript'});
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/,route=>route.fulfill({body:''}));
  await page.goto(pathToFileURL(path.join(ROOT,'index.html')).href);
  await page.waitForFunction(()=>window.WOS&&window.WOS_MENU);
  return {page,errors};
}
async function setup(page,river=false){
  await page.evaluate(river=>{
    const names=['A 強化歩兵中隊','B 戦車中隊','C 重強化歩兵中隊','D 強化歩兵中隊','E 自走砲中隊'];
    const kinds=river?Array(4).fill('vehicle'):['infantry','vehicle','heavyInfantry','infantry','artillery'];
    const companies=kinds.map((kind,i)=>({id:'demo'+i,name:river?'第'+(i+1)+' 戦車中隊':names[i],kind}));
    const groundOrg={companies,battalions:[{id:'b1',name:'第1 大隊',companies:['demo0','demo1','demo4']},
      {id:'b2',name:'第2 大隊',companies:['demo2','demo3']}],
      brigades:[{id:'g1',name:'第1 旅団',battalions:['b1','b2']}]};
    WOS.start({op:'groundExercise2',groundOrg});if(talking)endTalk();if(deploying)endDeploy();
    window.WOS_NO_NPC=true;setSpeed(0);hideHint();
    const units=fleets.filter(f=>f.team===0&&companies.some(c=>c.name===f.name));
    units.forEach((f,i)=>{
      const at=river?[20,25+i*.4]:[i<4?7.5+i*2.4:11.1,i<4?21:20];
      f.pos.copy(groundPoint(...at));f.pos.y=groundUnitHeight(f);f.post.copy(f.pos);f.stance='evade';
    });
    for(const f of fleets)if(!units.includes(f))f.alive=false;
    groundUpdateSight();
    const p=groundPoint;
    const line=river?[p(20,24.8),p(20,27.2)]:Array.from({length:25},(_,i)=>{
      const t=i/24;return p(6+11*t,23.5+1.6*Math.sin(Math.PI*t));
    });
    const plan=river?[p(26,25.1),p(26,27.5)]:Array.from({length:25},(_,i)=>{
      const t=i/24;return p(6.5+11*t,30+1.1*Math.sin(Math.PI*2*t));
    });
    setSel(units);groundPlanToggle('deploy');groundPlanLineDone(line,null);
    groundPlanFinish(line,river?p(24,25):p(11.5,28));
    if(!units.every(f=>f.groundFrontOf))throw new Error('前線の作成に失敗');
    for(let i=0;i<4400&&units.some(f=>f.order);i++)step(.05);
    groundPlanToggle('plan');groundPlanLineDone(plan,null);
    if(!units[0].groundFrontOf.plan)throw new Error('進撃計画の作成に失敗');
    window.demo={front:units[0].groundFrontOf,units};
    const brief=document.querySelector('[data-tab="brief"]');
    if(brief.getAttribute('aria-expanded')==='true')brief.click();
    setSel([]);groundDraw();
  },river);
  await page.locator('#hint').waitFor({state:'hidden'});
}
async function view(page,x,y,d){
  await page.evaluate(([x,y,d])=>{
    const p=groundPoint(x,y);camAnim=null;controls.target.copy(p);
    camera.position.set(p.x,p.y+d,p.z+d*.66);camera.lookAt(p);controls.update();groundDraw();
  },[x,y,d]);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function pickPoint(page,kind){
  return page.evaluate(kind=>{
    const {front,units}=window.demo,arrows=groundPlanArrows(front);
    const points=kind==='via'?arrows.flatMap(a=>a.markers.filter(m=>m.i!==null).map(m=>m.p)):[];
    if(kind!=='via'){
      const lines=kind==='arrow'?arrows.filter(a=>a.f===units[1]).map(a=>a.shape):[kind==='plan'?front.plan.pts:front.pts];
      for(const pts of lines){
        const L=groundPlanLine(pts);
        for(const t of [.73,.65,.8,.58,.9,.45,.4,.35,.3,.25,.2,.15,.1])points.push(groundPlanAt(L,L.len*t));
      }
    }
    for(const p of points){
      const q=proj(new THREE.Vector3(p.x,groundSurfaceHeight(p.x,p.z)+GROUND_PLAN_LOOK.lift,p.z));
      const el=document.elementFromPoint(q.x,q.y);
      if(q.y<25||q.y>H-35||q.x<10||q.x>W-10||!(el===renderer.domElement||el?.matches('#labels .mk2')))continue;
      const hit=groundEditPick(q.x,q.y);
      if(hit?.kind===kind&&(kind!=='arrow'||hit.f===units[1]))return q;
    }
    throw new Error('画面で選べる位置が見つかりません: '+kind);
  },kind);
}
async function choose(page,kind,labels,mobile=false){
  const {x,y}=await pickPoint(page,kind);
  if(mobile)await page.touchscreen.tap(x,y);
  else{
    await page.mouse.move(x,y);
    if(!await page.locator('#groundEditPick').isVisible())await page.waitForFunction(kind=>groundEditHover?.kind===kind,kind);
    await page.mouse.click(x,y);
  }
  await page.locator('#groundEditPick').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('#groundEditPick button').allTextContents(),labels);
  await page.waitForFunction(()=>groundPlanVisual.meshes.highlight.visible);
}
async function capture({page,errors},name){
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'front-472-'+name+'.png')});
  assert.deepEqual(errors,[]);
  console.log(name);
}

async function captureCorridor(browser,version){
  assert(['before','after'].includes(version),'before または after を指定してください');
  const desktop=await open(browser,{viewport:{width:1100,height:760}}),{page,errors}=desktop;
  await page.evaluate(()=>{
    const companies=Array.from({length:4},(_,i)=>({id:'cross'+i,name:'第'+(i+1)+' 戦車中隊',kind:'vehicle'}));
    const groundOrg={companies,battalions:[],brigades:[]};
    WOS.start({op:'groundExercise2',groundOrg});
    if(talking)endTalk();
    if(deploying)endDeploy();
    window.WOS_NO_NPC=true;setSpeed(0);hideHint();
    const units=fleets.filter(f=>f.team===0&&companies.some(c=>c.name===f.name));
    if(units.length!==4)throw Error('撮影用の4隊を置けませんでした');
    for(const f of fleets)if(!units.includes(f))f.alive=false;
    const p=groundPoint,line=[p(14,19),p(14,25.5)],plan=[p(33,19),p(33,27)];
    for(const {f,dest} of groundPlanSlots(units,line,1)){
      f.pos.copy(dest);f.pos.y=groundUnitHeight(f);f.post.copy(f.pos);f.stance='evade';
    }
    groundUpdateSight();
    setSel(units);groundPlanToggle('deploy');groundPlanLineDone(line,null);groundPlanFinish(line,p(24,22));
    for(let i=0;i<100&&units.some(f=>f.order);i++)step(.05);
    groundPlanToggle('plan');groundPlanLineDone(plan,null);
    if(!units[0].groundFrontOf?.plan)throw Error('進撃計画を作れませんでした: '+groundPlanMessage);
    window.demo={units};
    const brief=document.querySelector('[data-tab="brief"]');
    if(brief.getAttribute('aria-expanded')==='true')brief.click();
    setSel([]);
  });
  await view(page,23.5,23.5,85);
  await page.locator('#hint').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'front-480-'+version+'.png')});
  const used=await page.evaluate(()=>{
    setSel(window.demo.units);document.getElementById('groundExecute').click();
    const data=groundData(),sites=groundFrontCrossings(data);
    const rivers=data.water.rivers.map(r=>({id:r.id,points:r.points.map(([x,y])=>groundPoint(x,y))}));
    return window.demo.units.map(f=>{
      const c=f.order?.groundAdvance&&f.order.path&&groundFrontCrossed(f.order.path,rivers,sites);
      return c?[groundMapX(c.pos.x),groundMapY(c.pos.z)].join(','):null;
    });
  });
  const central='22.5,21';
  assert(used.every(Boolean),JSON.stringify(used));
  assert(version==='after'?used.every(c=>c===central):used.includes(central)&&used.some(c=>c!==central),JSON.stringify(used));
  assert.deepEqual(errors,[]);
  console.log(version,'進撃の渡河点',used.join(' / '));
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch(process.platform==='darwin'?{args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}:{});
  try{
    if(process.argv[2]==='--corridor')return await captureCorridor(browser,process.argv[3]);
    const desktop=await open(browser,{viewport:{width:1100,height:760}}),{page}=desktop;
    await setup(page);await view(page,11.5,26.5,54);
    await page.locator('#groundEdit').click();
    await choose(page,'plan',['編集（引き直す）','削除']);await capture(desktop,'plan');
    await choose(page,'front',['編集（引き直す）','削除（計画も消える）']);await capture(desktop,'front');
    await choose(page,'arrow',['中継地点を足す']);await capture(desktop,'arrow');
    await page.getByRole('menuitem',{name:'中継地点を足す'}).click();
    const via=await page.evaluate(()=>proj(groundPoint(8.6,27)));
    await page.mouse.click(via.x,via.y);
    await choose(page,'via',['編集（動かす）','削除']);await capture(desktop,'via');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#groundEdit').getAttribute('aria-pressed'),'false');

    const swatch=level=>page.locator(`.ground-rnode[data-id="${level}"] > .ground-rhead .ground-plan-swatch`);
    const palette=page.locator('.ground-plan-palette');
    await swatch('g1').click();await palette.getByRole('button',{name:'色 10',exact:true}).click();
    await swatch('b2').click();await palette.getByRole('button',{name:'色 4',exact:true}).click();
    assert.equal(await swatch('b2').evaluate(el=>el.classList.contains('own')),true);
    assert.equal(await page.evaluate(()=>groundPlanSectionColors(window.demo.front).join()),'#6fe0cf,#6fe0cf,#f08fb6,#f08fb6');
    await page.mouse.move(5,5);
    await capture(desktop,'sections');
    await swatch('g1').click();assert.equal(await palette.getByRole('button').count(),16);
    await capture(desktop,'palette');
    await page.keyboard.press('Escape');
    await setup(page,true);await view(page,23,25,75);
    const {used,shortest}=await page.evaluate(()=>{
      const {units,front}=window.demo;
      const data=groundData(),sites=groundFrontCrossings(data);
      const rivers=data.water.rivers.map(r=>({id:r.id,points:r.points.map(([x,y])=>groundPoint(x,y))}));
      const at=path=>{
        const c=path&&groundFrontCrossed(path,rivers,sites);
        return c?`${groundMapX(c.pos.x)},${groundMapY(c.pos.z)}`:null;
      };
      const byUnit=new Map(groundPlanSlots(groundFrontPresent(front),front.plan.pts,front.plan.side)
        .map(({f,dest})=>[f,at(groundMovePath(f.pos,[dest],groundMoveKind(f)))]));
      setSel(units);document.getElementById('groundExecute').click();
      const used=units.map(f=>at(f.order?.path));
      setSel([]);
      for(let i=0;i<20;i++)step(.05);
      groundDraw();return {used,shortest:units.map(f=>byUnit.get(f))};
    });
    assert(used.every(Boolean),JSON.stringify(used));
    assert.deepEqual(used,shortest);
    console.log('進撃の渡河点',used.join(' / '));
    await capture(desktop,'crossings');
    await page.setViewportSize({width:1600,height:900});await view(page,23,25,75);await capture(desktop,'overview');
    await page.close();

    const mobile=await open(browser,{viewport:{width:390,height:780},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    await setup(mobile.page);await view(mobile.page,11.5,26.5,58);
    await mobile.page.locator('#groundEdit').tap();
    await choose(mobile.page,'plan',['編集（引き直す）','削除'],true);
    await capture(mobile,'touch');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
