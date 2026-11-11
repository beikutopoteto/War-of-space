/* Node: 実データ・本物の頭・宇宙橋渡し・sortieを固定場面で確認。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),THREE=require('three'),{performance}=require('node:perf_hooks');
function createSpaceContext(){
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),box={THREE,performance,console,HP_K:2,ALT_MAX:100,gameSec:0,over:false,chase:null,autoMode:false,
    tutorial:null,tutorialActive(){return !!this.tutorial&&!this.tutorial.skipped;},inCloud:()=>false,bodyBlocks:()=>false,debris:[],clouds:[],
    fieldC:new THREE.Vector3(),CLOUD_SIGHT:.5,sightOf:f=>60+(f.vis??6)*8,concealOf:f=>1-Math.min(10,f.stl??4)*.04,
    speedOf:f=>f.speed,dropArrow(){},scoutAI(){},npcDebug:()=>({ground:true}),logEvent(){}};
  // 呼出し側のthisに依存しない、実ゲームと同じ有効判定。
  box.tutorialActive=()=>!!(box.tutorial&&!box.tutorial.skipped);box.window=box;
  const ctx=vm.createContext(box),run=code=>vm.runInContext(code,ctx);
  for(const p of ['data/ships.js','data/npc-doctrines.js','data/operations.js','battle/npc-core.js'])run(read(p));
  const sim=read('battle/sim.js');
  run(sim.slice(sim.indexOf('function canSee('),sim.indexOf('/* mining debris')));
  run(sim.slice(sim.indexOf('function topClass('),sim.indexOf('const sideOf=')));
  run('const ROLES=WOS_DATA.roles;');
  run(sim.slice(sim.indexOf('function stepSorties('),sim.indexOf('let aiTimer=')));
  run(read('battle/npc-ground.js'));run(read('battle/npc-space.js'));
  run(`op=WOS_DATA.operations.find(o=>o.id==='charybdis');fleets=[];fortress={alive:true,team:1,pos:new THREE.Vector3(0,3,0),hpPool:100,max:100,sortie:[]};`);
  let id=1;
  const unit=(team,x,z,extra={})=>{const f={kind:'fleet',id:id++,team,type:'cl',n:10,ships:Array.from({length:10},()=>({type:'cl'})),hp:84,dmg:4.2,hpPool:840,
    alive:true,pos:new THREE.Vector3(x,0,z),post:new THREE.Vector3(x,0,z),home:new THREE.Vector3(x,0,z),ai:'guard',leash:42,watchPos:null,
    range:22,speed:5,vis:6,seen:false,...extra};if(Array.isArray(f.pos))f.pos=new THREE.Vector3(f.pos[0],f.alt||0,f.pos[1]);box.fleets.push(f);return f;};
  return {box,run,unit};
}
function nodeChecks(){
  const rows=[],test=(name,fn)=>{fn();rows.push({name,ok:true});};
  test('自軍オートの生成・手動除外・初期戦力・20秒復帰・解除と再生成',()=>{
    const {box:b,run,unit}=createSpaceContext();const f=unit(0,0,120),other=unit(0,10,120);unit(1,0,0,{seen:true});
    run('npcSpaceInit()');assert.equal(run('npcSpaceState.commanders.has(0)'),false);
    b.autoMode=true;run('npcAutoToggle();npcSpaceStep()');assert(run('npcSpaceState.commanders.get(0).plan'));assert(f.npcTask||other.npcTask);
    b.actor=f;run("npcAutoPlayer([actor]);actor.order={type:'move',dest:new THREE.Vector3(0,0,120)};c=npcSpaceState.commanders.get(0);sit=npcSpaceSituation(c)");
    assert.equal(run('c.side'),'ally');assert.equal(run('sit.units.some(u=>u.id===actor.id)'),false);assert.equal(run('sit.lead.units[0].to'),'outerS');
    const old=f.order;b.task={key:'hold:fort',type:'hold',zone:'fort',stage:'wait',units:[{id:f.id,as:'main'}]};run('npcSpaceApply(c,sit,{tasks:[task]});npcSpaceKeepPosts()');assert.equal(f.order,old);assert.equal(run('npcSpaceControls(actor)'),false);
    f.ships.length=4;run('sit=npcSpaceSituation(c)');assert.equal(run('sit.lead.full'),1);assert.equal(run('sit.lead.units[0].power'),.4);
    f.order=null;f.queue=[old];run('npcSpaceAutoSync()');b.gameSec=30;run('npcSpaceAutoSync()');assert(run('npcAutoPlayerUnit(actor)'));
    f.queue=[];run('npcSpaceAutoSync()');b.gameSec=49.99;run('npcSpaceAutoSync()');assert(run('npcAutoPlayerUnit(actor)'));b.gameSec=50;run('npcSpaceAutoSync();sit=npcSpaceSituation(c)');assert.equal(run('npcAutoPlayerUnit(actor)'),false);assert.equal(run('c.side'),'foe');
    run('npcAutoPlayer([actor]);npcAutoReturn=false;npcSpaceAutoSync()');b.gameSec=100;run('npcSpaceAutoSync()');assert(run('npcAutoPlayerUnit(actor)'));
    f.order=old;b.autoMode=false;run('npcAutoToggle()');assert.equal(run('npcSpaceState.commanders.has(0)'),false);assert.equal(f.order,old);
    b.autoMode=true;run('npcAutoToggle()');assert(run('npcSpaceState.commanders.get(0)!==c'));assert.equal(run('npcSpaceState.auto.players.size'),0);
  });
  test('拠点は片軍だけで連続10秒、競合と無人で時計をリセット、無人は前所有を保持',()=>{
    const {box:b,run,unit}=createSpaceContext();b.op={...b.op,npcZones:[{id:'A',pos:[0,0],r:25,owner:null}],npcLinks:[]};
    const red=unit(1,0,0);run('npcSpaceInit();npcSpaceOwners()');b.gameSec=9.99;run('npcSpaceOwners()');assert.equal(run('npcSpaceState.zones[0].owner'),null);
    const blue=unit(0,0,0);b.gameSec=10;run('npcSpaceOwners()');assert.equal(run('npcSpaceState.zones[0].contested'),true);assert.equal(run('npcSpaceState.zones[0].owner'),null);
    blue.pos.x=100;b.gameSec=20;run('npcSpaceOwners()');b.gameSec=29.99;run('npcSpaceOwners()');assert.equal(run('npcSpaceState.zones[0].owner'),null);
    b.gameSec=30;run('npcSpaceOwners()');assert.equal(run('npcSpaceState.zones[0].owner'),1);
    red.pos.x=100;b.gameSec=90;run('npcSpaceOwners()');assert.equal(run('npcSpaceState.zones[0].owner'),1);
    blue.pos.x=0;b.gameSec=100;run('npcSpaceOwners()');blue.pos.x=100;b.gameSec=105;run('npcSpaceOwners()');blue.pos.x=0;b.gameSec=110;run('npcSpaceOwners()');b.gameSec=119.99;run('npcSpaceOwners()');assert.equal(run('npcSpaceState.zones[0].owner'),1);
    b.gameSec=120;run('npcSpaceOwners()');assert.equal(run('npcSpaceState.zones[0].owner'),0);
  });
  test('生存要塞は敵保有を固定、固定物・艦載機・退場隊は保有に数えない',()=>{
    const {box:b,run,unit}=createSpaceContext();unit(0,0,0);unit(1,86,10,{fixed:true});unit(1,86,10,{kind:'wing'});unit(1,86,10,{left:true});
    run('npcSpaceInit();npcSpaceOwners()');b.gameSec=11;run('npcSpaceOwners()');assert.equal(run("npcSpaceState.zones.find(z=>z.id==='fort').owner"),1);
    assert.equal(run("npcSpaceState.zones.find(z=>z.id==='outerE').owner"),null);
    b.fortress.alive=false;run('npcSpaceOwners()');b.gameSec=21;run('npcSpaceOwners()');assert.equal(run("npcSpaceState.zones.find(z=>z.id==='fort').owner"),0);
  });
  test('見えない拠点はowner=null、初期knownと自軍保有は分かる。視界は高度も使う',()=>{
    const {box:b,run,unit}=createSpaceContext();const red=unit(1,0,0);run('npcSpaceInit();');
    run("npcSpaceState.zones.find(z=>z.id==='outerE').owner=0");red.pos.set(-500,0,0);
    let z=run("npcSpaceSituation(npcSpaceState.commanders.get(1)).zones.find(z=>z.id==='outerE')");assert.equal(z.owner,null);assert.equal(z.known,'none');assert.equal(z.seen,false);
    assert.equal(run("npcSpaceSituation(npcSpaceState.commanders.get(1)).zones.find(z=>z.id==='fort').owner"),'own');
    red.pos.set(86,200,10);assert.equal(run('npcSpacePointSeen(1,new THREE.Vector3(86,0,10))'),false);
    red.pos.y=0;z=run("npcSpaceSituation(npcSpaceState.commanders.get(1)).zones.find(z=>z.id==='outerE')");assert.equal(z.owner,'foe');
  });
  test('発見した敵だけを記憶し、見失ったあとの位置・力・死亡を視界外から更新しない',()=>{
    const {box:b,run,unit}=createSpaceContext();const red=unit(1,0,0),blue=unit(0,20,0);unit(0,1000,0);
    run('npcSpaceInit();npcSpaceObserve()');assert.equal(run('npcSpaceSituation(npcSpaceState.commanders.get(1)).contacts.length'),0);
    blue.seen=true;b.gameSec=2;run('npcSpaceObserve()');blue.seen=false;blue.pos.x=1000;blue.ships.length=1;b.gameSec=3;run('npcSpaceObserve()');
    let k=run('npcSpaceSituation(npcSpaceState.commanders.get(1)).contacts[0]');assert.equal(k.x,20);assert.equal(k.power,1);assert.equal(k.lostAt,3);assert.equal(k.age,1);
    blue.alive=false;b.gameSec=30;run('npcSpaceObserve()');assert.equal(run('npcSpaceSituation(npcSpaceState.commanders.get(1)).contacts.length'),1);
    red.pos.x=1000;run('npcSpaceObserve()');assert.equal(run('npcSpaceSituation(npcSpaceState.commanders.get(1)).contacts.length'),0);
  });
  test('最重量艦種の役・残存戦力・速さ・耐久・命令可否を頭へ渡す',()=>{
    const {run,unit}=createSpaceContext();const a=unit(1,0,0,{comp:{cl:8,bb:2},ships:Array(5).fill({}),speed:7}),fixed=unit(1,0,0,{fixed:true});
    const locked=unit(1,0,0,{locked:true}),withdraw=unit(1,0,0,{ai:'withdraw'}),pending=unit(1,0,0,{pending:true});
    run('npcSpaceInit()');const units=run('npcSpaceSituation(npcSpaceState.commanders.get(1)).units'),u=units.find(x=>x.id===a.id);
    assert.equal(u.role,'shock');assert.equal(u.power,.5);assert.equal(u.health,.5);assert.equal(u.speed,7);assert.equal(u.canHold,true);
    assert.equal(units.find(u=>u.id===fixed.id).free,false);for(const f of [locked,withdraw,pending])assert.equal(units.find(u=>u.id===f.id).free,false);
  });
  test('hold・集結・前進・突入・fix・cut・recon・予備類と母艦支援を既存AI入力へ対応',()=>{
    const {box:b,run,unit}=createSpaceContext();const f=unit(1,0,0,{launchR:70});run('npcSpaceInit();c=npcSpaceState.commanders.get(1)');
    const zones=[{id:'H',x:0,z:0,alt:12,r:30,base:'own'},{id:'T',x:100,z:0,alt:20,r:25,base:'foe'}];b.sit={zones,contacts:[]};
    const place=(type,stage='wait',as='main',i=0,n=1)=>{b.task={key:type+':T',type,stage,zone:'T',from:'H',units:[{id:f.id,as}]};return run(`npcSpacePlacement(c,sit,task,task.units[0],${i},${n})`);};
    let p=place('hold');assert.equal(p.ai,'guard');assert.equal(p.leash,25);assert.equal(p.post.x,100);assert.equal(p.post.y,20);
    assert(place('hold','wait','main',0,2).post.y<20);assert(place('hold','wait','main',1,2).post.y>20);assert.notEqual(place('hold','wait','main',0,2).post.z,place('hold','wait','main',1,2).post.z);
    p=place('seize','assemble');assert.equal(p.ai,'guard');assert.equal(p.post.x,0);assert.equal(p.post.y,12);assert.equal(p.leash,30);
    p=place('seize','advance');assert.equal(p.ai,'guard');assert.equal(p.post.x,53);assert(p.post.distanceTo(new THREE.Vector3(100,20,0))>25);
    p=place('seize','assault');assert.equal(p.ai,'hunt');assert.equal(p.watch.x,100);
    p=place('fix');assert.equal(p.ai,'guard');assert(Math.abs(p.post.x-82.4)<1e-8);assert.equal(p.leash,8);
    run("c.side='ally'");p=place('fix');assert(Math.hypot(p.post.x-100,p.post.z)>25);assert(Math.hypot(p.post.x-100,p.post.z)-p.leash>=25);run("c.side='foe'");
    assert.equal(place('cut').ai,'hunt');assert.equal(place('recon').ai,'scout');b.scoutAI=undefined;assert.equal(place('recon').ai,'hunt');b.scoutAI=()=>{};
    for(const type of ['reserve','refit','retire']){p=place(type);assert.equal(p.ai,'guard');assert.equal(p.post.x,100);assert.equal(p.leash,8);}
    p=place('seize','assault','support',1,3);assert.equal(p.ai,'guard');assert(p.post.x<100);assert(p.post.distanceTo(new THREE.Vector3(100,20,0))<f.launchR);
    place('recon');run('npcSpaceApply(c,sit,{tasks:[task]})');assert.equal(f.patrol[0][0],100);assert.equal(f.watch.alt,20);
  });
  test('同じ任務では値も命令も書き直さず、交戦中も新任務の持ち場へ切替える',()=>{
    const {box:b,run,unit}=createSpaceContext();const f=unit(1,0,0),foe=unit(0,0,0,{seen:true});run('npcSpaceInit();c=npcSpaceState.commanders.get(1);sit=npcSpaceSituation(c)');
    b.task={key:'hold:fort',type:'hold',zone:'fort',stage:'wait',units:[{id:f.id,as:'main'}]};run('npcSpaceApply(c,sit,{tasks:[task]})');
    const watch=f.watchPos,post=f.post,oldOrder=f.order={type:'attack',target:foe};let writes=0;
    for(const key of ['ai','leash','watchPos','npcTask']){let value=f[key];Object.defineProperty(f,key,{get:()=>value,set:v=>{writes++;value=v;},configurable:true});}
    f.post.copy=()=>{writes++;return f.post;};run('npcSpaceApply(c,sit,{tasks:[task]})');assert.equal(writes,0);assert.equal(f.order,oldOrder);assert.equal(f.post,post);assert.equal(f.watchPos,watch);
    f.post.copy=THREE.Vector3.prototype.copy;b.task={...b.task,key:'hold:outerN',zone:'outerN'};run('npcSpaceApply(c,sit,{tasks:[task]})');assert.notEqual(f.post.z,0);assert.equal(f.order,null);
  });
  test('既存pickFoeの候補ゼロでの目標保持があっても、NPCの守備・fixは思考間隔中も深追いしない',()=>{
    const {box:b,run,unit}=createSpaceContext(),f=unit(1,0,0),foe=unit(0,20,0,{seen:true});
    const source=fs.readFileSync(path.join(__dirname,'../battle/sim.js'),'utf8');
    const begin=source.indexOf('function pickFoe(');run("roleMove=()=>null;const PICK_KEEP=.85;"+source.slice(begin,source.indexOf('/* 艦種別の動き',begin)));
    b.actor=f;b.foe=foe;f.order={type:'attack',target:foe};f.leash=8;
    assert.equal(run('pickFoe(actor,[foe],false)===foe'),true,'元のAIの境界条件を再現');
    run('npcSpaceInit();for(const c of npcSpaceState.commanders.values())c.nextThink=1000');f.npcTask='fix:fort:pin:main';run('npcSpaceStep()');
    assert.equal(f.order,null);assert.equal(run('pickFoe(actor,[foe],false)'),null);assert.equal(run('npcSpaceState.timings.count'),0);
    f.order={type:'attack',target:foe};b.op={...b.op,npc:null};run('npcSpaceKeepPosts()');assert.equal(f.order.target,foe,'NPCなしの隊AIは変更しない');
  });
  test('チュートリアル・npcなし・地上では無効、追撃では持ち場と台本を上書きしない',()=>{
    for(const mode of ['tutorial','noNpc','ground','chase']){
      const {box:b,run,unit}=createSpaceContext();const f=unit(1,0,0);run('npcSpaceInit()');const before=JSON.stringify(f);
      if(mode==='tutorial')b.tutorial={skipped:false};if(mode==='noNpc')b.op={...b.op,npc:null};if(mode==='ground')b.op={...b.op,ground:'exercise2'};if(mode==='chase')b.chase={};
      run('npcSpaceStep()');assert.equal(JSON.stringify(f),before);if(mode!=='ground')assert.equal(run('Object.keys(npcDebug()).length'),0);
      assert.equal(run('npcSpaceState.timings.count'),0);
    }
  });
  test('NPC有効時のsortieは無効、tutorialとnpcなしでは元の75%・50%台本を使う',()=>{
    for(const mode of ['npc','over','tutorial','noNpc']){
      const {box:b,run,unit}=createSpaceContext();const f=unit(1,0,0);f.name='guard';b.fortress.hpPool=40;b.fortress.sortie=[{below:.75,fleets:['guard'],started:false},{below:.5,fleets:['guard'],started:false}];
      if(mode==='tutorial')b.tutorial={skipped:false};if(mode==='noNpc')b.op={...b.op,npc:null};if(mode==='over')b.over=true;
      run('stepSorties()');const enabled=mode==='npc'||mode==='over';assert.equal(f.ai,enabled?'guard':'hunt');assert.equal(b.fortress.sortie.every(s=>s.started===true),!enabled);
    }
  });
  test('実作戦の9拠点16辺、意図と機動防御、到着した増援への任務割当て',()=>{
    const {box:b,run,unit}=createSpaceContext();for(const spec of b.op.enemies)unit(1,...spec.pos,spec);
    run('npcSpaceInit();npcSpaceStep()');assert.equal(run('npcSpaceState.zones.length'),9);assert.equal(run('npcSpaceState.links.length'),16);assert.equal(run('npcDebug()[1].style'),'mobile');
    assert.equal(run("npcSpaceSituation(npcSpaceState.commanders.get(1)).goal.zones[0]"),'fort');assert(b.fleets.every(f=>f.npcTask));
    assert.equal(run("npcSpaceState.links.find(l=>l.a==='fort'&&l.b==='north').len"),52);
    const reinforcement=unit(1,10,-150,b.op.reinforcements[0].fleet);b.gameSec=3;run('npcSpaceStep()');assert(reinforcement.npcTask);
  });
  test('宇宙計測器はNPCあり／なし、自軍auto、時計・隻数・装甲・型・任務・log・msを出す（模型）',()=>{
    const helpers=require('../tools/npc-space-sim.cjs');
    for(const npc of [true,false]){
      const {box:b,run,unit}=createSpaceContext();unit(1,0,0);unit(0,20,0,{seen:true});b.talking=false;
      b.reset=()=>{b.gameSec=0;b.over=false;run('npcSpaceInit()');};b.endDeploy=b.setSpeed=()=>{};b.opClock=()=>b.gameSec*15;
      b.step=dt=>{b.gameSec+=dt;b.fortress.hpPool-=dt*2;run(`npcSpaceStep();
        if(npcSpaceState){const c=npcSpaceState.commanders.get(1);c.plan.main=gameSec<2?'outerN':'outerE';
          c.plan.tasks=[{type:'seize',stage:'assault',zone:c.plan.main,units:[{id:1,as:'main'}]}];
          if(gameSec>=2&&!globalThis.measureAbort){globalThis.measureAbort=true;npcLog(c,gameSec,'seize:abort','outerN','模型');}}`);
        if(b.gameSec>=6)b.over=true;};b.outcome=false;
      for(const [name,fn] of Object.entries(helpers))run('globalThis.'+name+'='+fn.toString());
      b.cfg={terrain:'charybdis',doctrines:['mars','earth'],level:'standard',seed:1,seconds:20,npc};run('setupSpaceNpcSim(cfg)');assert.equal(b.autoMode,true);
      assert.equal(run('advanceSpaceNpcSim(5)'),false);assert.equal(run('advanceSpaceNpcSim(20)'),true);
      const r=run('spaceNpcSimResult()');assert.equal(r.winner,1);assert.equal(r.remaining[1].ships,10);assert(r.clock.minutes>=90);assert.equal(r.armor[0].percent,100);assert(r.armor.at(-1).percent<100);
      assert.equal(r.think.count>0,npc);assert.equal(r.transitions.length>0,npc);assert.equal(r.logs.length>0,npc);assert(r.step.count>0);assert(r.step.meanMs>=0);
      assert.equal(r.firstContact,.05);
      if(npc){assert.equal(r.transitions[0].style,'mobile');assert.equal(r.mainConcentration[1],1);assert.equal(r.targetChanges[1],1);assert.equal(r.aborts[1],1);}else assert.equal(Object.keys(r.debug).length,0);
      const text=require('../tools/npc-sim.cjs').brief(r);assert(text.includes(npc?'NPC:あり':'NPC:なし'));assert(text.includes('10隻'));assert(text.includes('作戦時計:'));
    }
  });
  return rows;
}
async function checkNpcSpace(page,check){
  for(const [id,tutorial,enabled] of [['charybdis',false,true],['charybdis',true,false],['shinano',false,false]]){
    const state=await page.evaluate(({id,tutorial})=>{
      reset({op:id,tutorial});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();for(let i=0;i<80&&!over;i++)step(.05);
      return {debug:npcDebug(),assigned:fleets.filter(f=>f.team===1&&f.alive&&!f.fixed).every(f=>!!f.npcTask),any:fleets.some(f=>f.npcTask),sortie:fortress.sortie?.some(s=>s.started)||false};
    },{id,tutorial});
    check(enabled?state.assigned&&state.debug[1]?.plan:!state.any&&Object.keys(state.debug).length===0,'宇宙NPC: '+id+(tutorial?'（案内あり）':'')+(enabled?'で全敵隊に任務':'で無効'),JSON.stringify(state));
  }
}
module.exports={nodeChecks,checkNpcSpace,createSpaceContext};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log('✓ '+r.name);assert(rows.every(r=>r.ok));}
