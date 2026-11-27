/* km変換・出撃地点と制限。固定配備は変更前に撮った実ゲームのJSONと比べる。 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {collectStarts,compareStarts}=require('../tools/ground-start-snapshot.cjs');
const {openSortieMenu}=require('./ground-drill-menu.cjs');
function nodeChecks(){
  const {ctx,run,read}=require('./ground-landing.cjs').createGroundContext(),rows=[];
  run(read('data/ground-org.js'));
  const check=(name,fn)=>{try{fn();rows.push({name,ok:true});}catch(e){rows.push({name,ok:false,error:e.stack});}};
  const yes=code=>assert.equal(run(code),true);
  run("op=WOS_DATA.operations.find(o=>o.id==='groundExercise2');");
  check('km変換は入力を変えず、段の省略・海艦・搭載中隊と旧形式を扱う',()=>{
    yes(`(()=>{const u={name:'艦',kind:'sea',at:[12,5],band:'sea',type:'dd',team:1,groundLanding:true,
      groundCargo:[{name:'歩兵',kind:'infantry',at:[12,5],stance:'evade',vis:9,stl:0}]};
      const before=JSON.stringify(u),a=groundUnitSpec(u),b=groundUnitSpec(u),p=groundPoint(12,5),c=a.groundCargo[0];
      a.pos[0]=123;c.pos[0]=456;return JSON.stringify(u)===before&&b!==a&&b.groundCargo!==a.groundCargo&&
        b.pos[0]===p.x&&b.pos[1]===p.z&&b.groundKind==='sea'&&b.type==='dd'&&b.team===1&&b.groundLanding&&
        c.groundKind==='infantry'&&c.band==='ground'&&c.type==='cv'&&c.n===1&&c.scale===.3&&c.alt===0&&c.stance==='evade'&&c.vis===9&&c.stl===0&&groundUnitSpec(b)===b;})()`);
  });
  check('旧演習の6枠を維持し7中隊目は0.6km東へ置く',()=>{
    yes(`(()=>{const org=window.WOS_GROUND_ORG.defaults();org.companies.push({id:'extra',name:'追加',kind:'infantry'});
      const before=JSON.stringify(org),f=groundSortieForces(op,org).fleets;
      return JSON.stringify(org)===before&&f.length===7&&f[0].pos[0]===-64&&f[0].pos[1]===-36&&f[5].pos[1]===-28&&
        f.every((u,i)=>{const slot=op.groundSortie.slots[i%6],p=groundPoint(slot[0]+Math.floor(i/6)*.6,slot[1]);return u.pos[0]===p.x&&u.pos[1]===p.z;});})()`);
  });
  run("op=WOS_DATA.operations.find(o=>o.id==='baikonur');");
  check('全兵科は本営Aの8km内の重ならない通行可能な点へ置く',()=>{
    yes(`(()=>{const companies=Object.keys(window.WOS_GROUND_ORG.types()).map((kind,i)=>({id:'all'+i,name:kind,kind}));
      const f=groundSortieForces(op,{companies}).fleets,site=groundData().sites.find(s=>s.id==='A');
      return f.length===companies.length&&new Set(f.map(u=>u.pos.join())).size===f.length&&f.every(u=>{
        const x=groundMapX(u.pos[0]),y=groundMapY(u.pos[1]),move=groundMoveKind(u);
        return Math.hypot(x-site.x,y-site.y)<=8&&groundPass(x,y,move,false)&&(move==='air'||groundData().water.rivers.every(r=>{const p=groundRiverAt(x,y,r);return p.dist>=p.width/2+.12;}));});})()`);
  });
  check('禁止兵科を編成順を保って除き、大隊の参照と出撃集計も絞る',()=>{
    yes(`(()=>{const org=window.WOS_GROUND_ORG.defaults(),before=JSON.stringify(org),o={...op,groundSortie:{...op.groundSortie,bannedKinds:['vehicle']}};
      const s=groundSortieForces(o,org),ids='gc2,gc3,gc4,gc5,gc6';
      return JSON.stringify(org)===before&&s.fleets.map(f=>f.companyId).join()===ids&&s.org.battalions.flatMap(b=>b.companies).join()===ids&&
        s.load.platoons===20&&s.load.supplyUsed===48;})()`);
  });
  check('補給の超過0・10・40に対して、上限低下0・20・50%',()=>{
    yes(`(()=>{
      const load=(tanks,infantry)=>window.WOS_GROUND_ORG.sortieLoad([
        ...Array.from({length:tanks},()=>({kind:'vehicle',platoons:4})),
        ...infantry.map(platoons=>({kind:'infantry',platoons}))
      ],op);
      const exact=load(8,[4]),over=load(9,[2]),capped=load(11,[4,4]);
      return exact.supplyUsed===100&&exact.excess===0&&exact.penaltyPercent===0&&
        over.supplyUsed===110&&over.excess===10&&over.penaltyPercent===20&&
        capped.supplyUsed===140&&capped.excess===40&&capped.penaltyPercent===50;
    })()`);
  });
  check('補給中隊の小隊は規模と補給値に数え、1小隊につき補給限界を4増やす。海艦は除外',()=>{
    yes(`(()=>{
      const companies=[{kind:'infantry',platoons:2},{kind:'supply',platoons:3},{kind:'vehicle',platoons:4},{kind:'sea',platoons:4}];
      const load=window.WOS_GROUND_ORG.sortieLoad(companies,op);
      const banned=window.WOS_GROUND_ORG.sortieLoad(companies,{...op,groundSortie:{...op.groundSortie,bannedKinds:['supply','vehicle']}});
      return load.platoons===9&&load.supplyUsed===17&&load.supplyPlatoons===3&&load.supplyBonus===12&&load.supplyLimit===112&&
        banned.platoons===2&&banned.supplyUsed===2&&banned.supplyLimit===100;
    })()`);
  });
  check('空の編成は初期部隊に戻り、規模超過で出撃しても小隊を切り捨てない',()=>{
    yes(`(()=>{
      const empty=groundSortieForces(op,{companies:[]});
      const companies=Array.from({length:65},(_,i)=>({id:'many'+i,kind:'infantry',platoons:1}));
      const edge=groundSortieForces(op,{companies:companies.slice(0,64)}),over=groundSortieForces(op,{companies});
      return empty.fleets.length===6&&empty.load.platoons===24&&empty.load.supplyUsed===60&&
        !edge.load.scaleOver&&over.load.scaleOver&&over.fleets.length===65;
    })()`);
  });
  check('出撃に選んだ大隊だけを元の順で残す。明示的な空選択には初期部隊を足さない',()=>{
    yes(`(()=>{
      const org=window.WOS_GROUND_ORG.defaults(),before=JSON.stringify(org);
      const chosen=groundSortieForces(op,org,['gb2']),empty=groundSortieForces(op,org,[]);
      return chosen.fleets.map(f=>f.companyId).join()==='gc4,gc5,gc6'&&chosen.load.platoons===12&&
        chosen.org.brigades[0].battalions.join()==='gb2'&&chosen.org.battalions.length===1&&
        !empty.fleets.length&&!empty.org.brigades.length&&!empty.load.platoons&&JSON.stringify(org)===before;
    })()`);
  });
  check('1kmずつ半径を広げ、最大2倍でも不足すればエラーにする',()=>{
    yes(`(()=>{const companies=Array.from({length:40},(_,i)=>({id:'many'+i,name:'歩兵'+i,kind:'infantry'}));
      const s=groundSortieForces(op,{companies}),site=groundData().sites.find(s=>s.id==='A');
      return s.fleets.some(f=>Math.hypot(groundMapX(f.pos[0])-site.x,groundMapY(f.pos[1])-site.y)>4)&&s.fleets.every(f=>Math.hypot(groundMapX(f.pos[0])-site.x,groundMapY(f.pos[1])-site.y)<=8);})()`);
    assert.throws(()=>run(`groundSortieForces(op,{companies:Array.from({length:200},(_,i)=>({id:'x'+i,kind:'infantry'}))})`),/出撃地点/);
    assert.throws(()=>run('groundSortieForces({...op,groundSortie:null})'),/groundSortie/);
  });
  check('固定／クイックは編成制限を受けず、旧形式cfgも維持する',()=>{
    yes(`(()=>{const o={...op,groundSortie:{...op.groundSortie,supplyBase:0,bannedKinds:['infantry']}};
      const quick=groundResolveForces(o,{fleets:o.quick}),legacy={name:'旧',groundKind:'vehicle',pos:[1,2]},old=groundResolveForces(o,{fleets:[legacy]});
      const fixed=groundResolveForces({...o,forces:'fixed'},{}),tutorial=groundResolveForces({...o,groundDrill:true},{});
      return quick.fleets.length===11&&!quick.org&&quick.supplyPenalty===0&&old.fleets[0]===legacy&&
        fixed.fleets.length===11&&fixed.supplyPenalty===0&&tutorial.supplyPenalty===0;})()`);
  });
  check('視点と案内のkm変換は地形切替・やり直しで累積しない',()=>{
    yes(`(()=>{const source=op,t=source.groundTutorial;
      op={...source,...t};groundSetupCoordinates();const first=JSON.stringify([op.view.target,op.tutorial.map(r=>r.marks)]);
      op=source;groundSetupCoordinates();op={...source,...t};groundSetupCoordinates();
      return JSON.stringify([op.view.target,op.tutorial.map(r=>r.marks)])===first&&op.view.target.join()==='-56,-40';})()`);
  });
  return rows;
}
async function checkGroundForces(page,check){
  const before=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ground-start-before.json'),'utf8'));
  const after=await collectStarts(page);
  for(const [id,message] of Object.entries(compareStarts(before,after)))check(true,'出撃の写し: '+id+' '+message);
  const placement=await page.evaluate(()=>{
    WOS.start({op:'baikonur',groundOrg:WOS_GROUND_ORG.defaults()});setSpeed(0);
    const site=groundData().sites.find(s=>s.id==='A');
    return fleets.filter(f=>f.team===0&&!f.embarked&&f.groundKind!=='sea').map(f=>{
      const x=groundMapX(f.pos.x),y=groundMapY(f.pos.z);
      return {name:f.name,kind:f.groundKind,at:[x,y],distanceKm:Math.hypot(x-site.x,y-site.y),passable:groundPass(x,y,groundMoveKind(f)),alt:f.pos.y};
    });
  });
  check(placement.length===6&&placement.every(p=>p.distanceKm<=8&&p.passable),'編成の開始位置: 全6中隊がAから8km内で通行可能');
  fs.writeFileSync(path.join(__dirname,'../test-results/forces-placement.json'),JSON.stringify(placement,null,2)+'\n');
}
function seedSupplySortie({penalty=false,oversize=false,free=false}={}){
  WOS.openMenu();
  const debug=document.getElementById('dbgT');
  if(debug.getAttribute('aria-expanded')!=='true')debug.click();
  document.querySelector('[data-dbga="skip"]').click();
  const s=JSON.parse(localStorage.getItem('wos.save.v1')),ground=window.WOS_GROUND_ORG;
  s.prog.tutorialCleared=true;
  s.prog.prepDone=true;
  s.prog.cleared=[...WOS_DATA.operations.filter(o=>o.chapter&&!o.hidden).map(o=>o.id),'tutorial2'];
  s.sortieMenu={closed:{'第一章':true,'第二章':true},seen:[]};
  s.groundOrg=ground.defaults();
  if(penalty||oversize){
    // 40小隊、補給値114、限界104。追加の歩兵25小隊で師団上限も超える。
    const lineup=[['infantry',2],['supply',1],['attack',1],...Array.from({length:9},()=>['vehicle',4])];
    if(oversize)lineup.push(...Array.from({length:6},()=>['infantry',4]),['infantry',1]);
    const companies=lineup.map(([kind,platoons],i)=>({id:'test'+i,name:`第${i+1} ${ground.types()[kind].name}中隊`,kind,platoons}));
    const battalions=Array.from({length:Math.ceil(companies.length/4)},(_,i)=>({id:'testb'+i,name:`第${i+1} 大隊`,companies:companies.slice(i*4,i*4+4).map(c=>c.id)}));
    s.groundOrg={companies,battalions,brigades:[{id:'testr1',name:'第1 旅団',battalions:battalions.slice(0,3).map(b=>b.id)}]};
  }
  localStorage.setItem('wos.save.v1',JSON.stringify(s));
  localStorage.setItem('wos.debug',JSON.stringify({free}));
  localStorage.setItem('wos.opt',JSON.stringify({story:false}));
}
async function checkGroundSupplyLimit(page,check){
  const keys=['wos.save.v1','wos.debug','wos.opt'];
  const saved=await page.evaluate(keys=>keys.map(k=>[k,localStorage.getItem(k)]),keys);
  const open=async options=>{
    await page.evaluate(seedSupplySortie,options);
    await openSortieMenu(page,{reload:true});
    await page.click('[data-op="baikonur"]');
    await page.click('#goBattle');
  };
  const go=page.locator('#forcesBattle'),load=page.locator('#sgLoad');
  const cards=page.locator('[data-ground-sortie]'),brigade=cards.filter({hasText:'第1 旅団'});
  const values=()=>load.locator('td:nth-child(2)').allTextContents();
  try{
    await open({});
    check(await go.isEnabled()&&(await values()).join()===['24 / 64小隊','60 / 100'].join()&&await load.locator('tr.over').count()===0,
      '地上出撃上限: 作戦規模と補給限界の内なら通常出撃できる');
    await open({oversize:true});
    check(await page.locator('[data-ground-sortie][aria-pressed="true"]').count()===3&&await cards.count()===3&&
      (await cards.last().textContent()).includes('旅団に入っていない大隊'),
      '地上出撃: 旅団と独立大隊の札は初めにすべて選ばれる');
    check(await go.isDisabled()&&await load.locator('tr.over').count()===2&&(await values())[0]==='65 / 64小隊'&&await load.locator('.warn').first().isVisible(),
      '地上出撃上限: 65/64小隊で警告し通常出撃を止める');
    await brigade.click();
    check(await go.isEnabled()&&(await values()).join()===['25 / 64小隊','25 / 100'].join()&&await load.locator('tr.over').count()===0,
      '地上出撃: 旅団を外すと小隊・補給値と補給中隊の上積みが減る');
    await page.click('#forcesCreate');
    check(await page.locator('[data-org-force="ground"]').getAttribute('aria-selected')==='true'&&await page.locator('[data-ground-tab="brigades"]').getAttribute('aria-selected')==='true',
      '地上出撃: 編成へのボタンで地上軍の旅団を開く');
    await page.click('[data-s="org"] .back');
    check((await values())[0]==='25 / 64小隊'&&await brigade.getAttribute('aria-pressed')==='false',
      '地上出撃: 部隊編成から戻ると選択が残る');
    for(const card of await cards.all()) if(await card.getAttribute('aria-pressed')==='true') await card.click();
    check(await go.isDisabled()&&(await values()).join()===['0 / 64小隊','0 / 100'].join(),
      '地上出撃: 札をすべて外すと出撃できない');
    await brigade.press('Enter');
    check(await go.isEnabled()&&await load.locator('tr.over').count()===1&&
      await load.locator('tr.over th').textContent()==='補給限界'&&
      await load.locator('tr.over th').evaluate(e=>getComputedStyle(e).color===getComputedStyle(document.querySelector('#sgLoad .warn')).color)&&
      (await values())[1]==='114 / 104'&&/補給限界を10超えています。出撃はできますが、戦闘の補給・士気の上限が −20% になります。/.test(await load.textContent()),
      '地上出撃上限: 補給限界だけを超えた編成は下げ幅を表示して出撃できる');
    await go.click();
    const result=await page.evaluate(()=>{
      setSpeed(0);
      const infantry=fleets.find(f=>f.companyId==='test0'),truck=fleets.find(f=>f.companyId==='test1'),air=fleets.find(f=>f.companyId==='test2');
      const selected=fleets.filter(f=>f.team===0&&!f.embarked&&f.groundKind!=='sea').map(f=>f.companyId);
      const chosen=selected.join()===Array.from({length:12},(_,i)=>'test'+i).join()&&groundOrg.battalions.length===3;
      const near=(a,b)=>Math.abs(a-b)<1e-6;
      const initial=fleets.filter(f=>f.team===0).every(f=>(!Number.isFinite(f.groundSupply)||near(f.groundSupply,80))&&
        (!Number.isFinite(f.groundMorale)||near(f.groundMorale,.8*groundMoraleMax(f))))&&near(infantry.groundMorale,120)&&near(air.groundSupply,80);
      const enemy=fleets.filter(f=>f.team===1).every(f=>f.groundSupply===100&&(!Number.isFinite(f.groundMorale)||f.groundMorale===groundMoraleMax(f)));
      const bars=groundSupplyReadings([infantry]).every(r=>r.value===80)&&near(groundSupplyAttackFactor(infantry),.81)&&near(groundSupplySpeedFactor(infantry),.94);
      const hud=document.getElementById('groundSupplyStatus').textContent.startsWith('補給限界 超過 −20%');
      const hq=groundSites.find(s=>s.id===op.groundHQ[0]);
      infantry.pos.copy(hq.pos);infantry.groundSupply=78;infantry.groundMorale=118;
      groundSupplyAfter(10);
      const refill=near(infantry.groundSupply,80)&&near(infantry.groundMorale,120);
      const away=groundPoint(20,50);
      infantry.pos.copy(away);infantry.groundMorale=94;
      const at=groundSupplyAt(infantry);
      groundSupplyAfter(10);
      const awayRest=at.owner!==0&&!at.contested&&near(infantry.groundMorale,96);
      truck.pos.copy(hq.pos);infantry.pos.copy(hq.pos);truck.groundGiving=infantry;
      infantry.groundSupply=78;infantry.groundMorale=94;
      groundSupplyGive(10,new Map());
      const distribution=near(infantry.groundSupply,80)&&near(infantry.groundMorale,96);
      air.groundSupply=15;air.groundAirState='base';air.groundAirLeft=1;air.groundAirResume=air.pos.clone();
      groundAirStep(air,1);
      return {chosen,initial,enemy,bars,hud,refill,awayRest,distribution,airRefill:near(air.groundSupply,80)&&air.groundAirState==='return'};
    });
    const labels={chosen:'選んだ旅団の12中隊と3大隊だけで戦闘が始まる',initial:'自軍の初期補給80・歩兵士気120・航空補給80',enemy:'敵は補給100と兵科本来の士気',bars:'棒と性能は元の最大を参照',
      hud:'補給HUDの先頭に超過',refill:'本営の補充と休息は補給80・歩兵士気120まで',awayRest:'味方色の外の休息は歩兵士気96まで',
      distribution:'分配は補給80・歩兵士気96まで',airRefill:'航空の基地補給も80まで'};
    for(const [key,ok] of Object.entries(result))check(ok,'地上戦補給限界: '+labels[key]);
    await openSortieMenu(page);
    await page.click('[data-op="baikonur"]');
    check(await page.locator('#goQuick').isEnabled()&&!await go.isVisible(),'地上出撃: 65小隊の編成でも作戦選びからクイック出撃できる');
    await page.click('#goQuick');
    check(await page.evaluate(()=>{
      setSpeed(0);
      return !lastCfg.groundBattalions&&lastCfg.quickOrg&&lastCfg.fleets.length===11&&
        fleets.filter(f=>f.team===0&&Number.isFinite(f.groundSupply)).every(f=>f.groundSupply===100&&
        (!Number.isFinite(f.groundMorale)||f.groundMorale===groundMoraleMax(f)))&&!document.getElementById('groundSupplyStatus').textContent.includes('超過');
    }),'地上戦補給限界: クイック出撃は補給100と兵科本来の士気');
    await openSortieMenu(page);
    await page.click('[data-op="tutorial2"]');
    check(await page.locator('#goBattle').isEnabled()&&!await load.isVisible(),'地上出撃上限: 固定のチュートリアルは上限表示の外');
    await open({oversize:true,free:true});
    check(await go.isEnabled()&&/出撃上限を無視/.test(await load.textContent()),'地上出撃上限: デバッグで作戦規模を超えて出撃できる');
    await go.click();
    check(await page.evaluate(()=>{
      setSpeed(0);
      const companies=fleets.filter(f=>f.team===0&&f.companyId?.startsWith('test'));
      return companies.reduce((n,f)=>n+f.groundPlatoons,0)===65&&companies[0].groundSupply===50&&!document.getElementById('deployGo').disabled;
    }),'地上出撃上限: 65小隊を切り捨てず、補給・士気の下げ幅は最大50%');
  }finally{
    await page.evaluate(entries=>{
      for(const [key,value] of entries){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}
    },saved);
    await page.reload();
  }
}
module.exports={nodeChecks,checkGroundForces,checkGroundSupplyLimit,seedSupplySortie};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'✓ ':'✗ ')+r.name+(r.error?' '+r.error:''));assert(rows.every(r=>r.ok));}
