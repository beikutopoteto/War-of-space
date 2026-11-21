/* node tests/ground-org.cjs: ブラウザ不要。npm test では実画面の編集・再読込・一括命令も確認。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
function nodeChecks(){
  const THREE=require('three'),store=new Map();
  const ctx=vm.createContext({console,THREE,window:{},document:{querySelectorAll:()=>[],getElementById:()=>({addEventListener(){}})},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}});
  const run=s=>vm.runInContext(s,ctx),load=p=>run(read(p));
  ctx.WOS_DATA=ctx.window.WOS_DATA={};load('data/ships.js');
  load('data/operations.js');load('data/ground-rules.js');load('data/terrain/exercise2.js');ctx.WOS_TERRAIN=ctx.window.WOS_TERRAIN;
  load('data/ground-org.js');ctx.G=ctx.window.WOS_GROUND_ORG;
  // 実際の defaults/load/migrate/persist を準備画面の DOM 初期化の直前まで読み込む。
  run(read('prep.js').split('/* ---------- debug switches')[0]+ '\nwindow.saveTest={defaults,migrate,load,persist,get:()=>save,set:s=>save=s};})();');
  ctx.S=ctx.window.saveTest;
  let count=0;const check=(code)=>{assert.equal(run(code),true,code);count++;};
  check(`(()=>{const s=S.defaults(),space=JSON.stringify([s.bgs,s.armies,s.groups]);delete s.groundOrg;S.migrate(s);return s.groundOrg.companies.length===6&&s.groundOrg.battalions.length===2&&s.groundOrg.brigades.length===1&&JSON.stringify([s.bgs,s.armies,s.groups])===space;})()`);
  check(`(()=>{const s=S.defaults();s.groundOrg.companies[0].name='保存中隊';s.groundOrg.companies[0].kind='scout';G.assign(s.groundOrg,'companies','gc1','gb2');S.set(s);S.persist();const loaded=S.load();return JSON.stringify(loaded.groundOrg)===JSON.stringify(s.groundOrg)&&JSON.stringify(loaded.groups)===JSON.stringify(s.groups);})()`);
  check(`(()=>{const s=S.defaults();s.groundOrg={companies:[],battalions:[],brigades:[]};S.set(s);S.persist();return S.load().groundOrg.companies.length===0&&G.sortie(S.load().groundOrg).fleets.length===6;})()`);
  check(`(()=>{const o=G.defaults();return G.assign(o,'companies','gc4','gb1')&&!G.assign(o,'companies','gc5','gb1')&&o.battalions[0].companies.length===4&&o.battalions[1].companies.includes('gc5')&&!o.battalions[1].companies.includes('gc4');})()`);
  check(`(()=>{const o=G.defaults();o.battalions.push({id:'gb3',name:'3',companies:[]},{id:'gb4',name:'4',companies:[]},{id:'gb5',name:'5',companies:[]});return G.assign(o,'battalions','gb3','gr1')&&G.assign(o,'battalions','gb4','gr1')&&!G.assign(o,'battalions','gb5','gr1')&&!G.assign(o,'battalions','missing','gr1')&&o.brigades[0].battalions.length===4;})()`);
  check(`(()=>{const o=G.defaults();G.remove(o,'brigades','gr1');G.remove(o,'battalions','gb1');return o.companies.map(c=>c.id).join()==='gc4,gc5,gc6'&&o.battalions.length===1&&!o.brigades.length;})()`);
  check(`(()=>{const o=G.defaults();G.remove(o,'companies','gc1');return !o.battalions[0].companies.includes('gc1')&&G.sortie(o).fleets.length===5;})()`);
  check(`(()=>{const o=G.defaults();o.battalions[0].companies=['gc1','gc1','missing','gc2','gc3','gc4','gc5'];o.battalions[1].companies=['gc4','gc5'];const n=G.normalize(o);return n.battalions[0].companies.join() === 'gc1,gc2,gc3,gc4'&&n.battalions[1].companies.join()==='gc5';})()`);
  check(`(()=>{const o=G.defaults();o.companies=[o.companies[2],o.companies[0]];o.companies[0].kind='scout';const before=JSON.stringify(o),s=G.sortie(o);return s.fleets[0].companyId==='gc3'&&s.fleets[0].groundKind==='scout'&&s.fleets[1].companyId==='gc1'&&JSON.stringify(o)===before;})()`);
  // 小隊の数（2026-11-18）: 無い・範囲外は直す。どの大隊にも入っていない中隊は新しい大隊へ。行の追加・兵科・小隊の数。
  check(`(()=>{const o=G.defaults();o.companies.forEach(c=>delete c.platoons);o.companies[1].platoons=9;o.companies[2].platoons=0;const n=G.normalize(o);return n.companies[0].platoons===4&&n.companies[1].platoons===4&&n.companies[2].platoons===1;})()`);
  check(`(()=>{const o=G.defaults();o.companies.push({id:'gc7',name:'迷子',kind:'scout'},{id:'gc8',name:'迷子2',kind:'artillery',platoons:2});const n=G.normalize(o),b=n.battalions.find(b=>b.companies.includes('gc7'));return n.battalions.length===3&&b&&b.companies.join()==='gc7,gc8'&&b.name==='第3 大隊'&&!n.brigades[0].battalions.includes(b.id)&&n.companies.find(c=>c.id==='gc8').platoons===2;})()`);
  check(`(()=>{const o=G.defaults(),c=G.addCompany(o,'gb1','artillery'),first={platoons:c.platoons,name:c.name};const full=G.addCompany(o,'gb1','infantry');const kind=G.setKind(o,c.id,'guidedRocket'),pl=G.setPlatoons(o,c.id,2);return !full&&first.platoons===4&&first.name==='第7 自走砲中隊'&&c.name==='第7 無誘導ロケット中隊'&&kind&&pl&&c.platoons===2&&o.battalions[0].companies.length===4&&G.platoonsOf(G.companiesOf(o,'brigades','gr1'))===26;})()`);
  check(`(()=>{const o=G.defaults();G.setKind(o,'gc1','scout');return o.companies[0].name==='第1 戦車中隊'&&o.companies[0].kind==='scout';})()`);
  for(const kind of ['commando','guidedRocket','droneHive','mechanicalAssault','mobileAA','supply']){
    check(`(()=>{const s=S.defaults();s.groundOrg.companies[0].kind='${kind}';S.set(s);S.persist();const loaded=S.load(),f=G.sortie(loaded.groundOrg).fleets[0];return loaded.groundOrg.companies[0].kind==='${kind}'&&f.groundKind==='${kind}'&&f.band==='${kind==='droneHive'?'low':'ground'}';})()`);
  }
  load('battle/ground-volley.js');load('battle/ground-air.js');load('battle/ground-air-orders.js');load('battle/ground-air-missions.js');load('battle/terrain.js');load('battle/ground-transport.js');load('battle/ground-supply.js');load('battle/ground-naval.js');load('battle/ground.js');load('battle/ground-script.js');
  const state=read('battle/state.js'),hud=read('battle/hud.js');
  run(state.slice(state.indexOf('function groupOrder('),state.indexOf('function openSelectedRoster(')));
  run(state.split('\n').find(line=>line.startsWith('function orderTargets(')));
  run(hud.slice(hud.indexOf('function order(f,o)'),hud.indexOf('\nconst ray=')));
  Object.assign(ctx,{op:{ground:'exercise2'},selGroup:null,selMulti:[],fleets:[],dropArrow:()=>{},makeArrow:()=>null,TEAM_COL:['blue','red'].map(c=>new (require('three').Color)(c)),saveUndo:()=>{},npcAutoPlayer:()=>{},tutorialOrder:()=>{},speedOf:f=>f.speed});
  ctx.setSel=list=>{ctx.selMulti=list;};
  run(`const spec=G.sortie(G.defaults());fleets=spec.fleets.map((f,i)=>({...f,id:i,team:0,alive:true,speed:2,pos:groundPoint(8+i*.5,27),heading:new THREE.Vector3(),march:new THREE.Vector3(),queue:[],order:null}));groundInitOrg(spec.org);`);
  check(`(()=>{groundSelectUnit('battalions','gb1');groupOrder({type:'move',dest:groundPoint(10,29)});return orderTargets().length===3&&fleets.slice(0,3).every(f=>f.order?.type==='move'&&f.order.path.points.length>1)&&fleets.slice(3).every(f=>!f.order);})()`);
  check(`(()=>{const starts=fleets.map(f=>f.pos.clone());for(let i=0;i<30;i++)fleets.slice(0,3).forEach(f=>groundFollow(f,.05));return fleets.slice(0,3).every((f,i)=>f.pos.distanceTo(starts[i])>.1)&&fleets.slice(3).every((f,i)=>f.pos.equals(starts[i+3]));})()`);
  check(`(()=>{groundSelectUnit('brigades','gr1');return orderTargets().length===6;})()`);
  check(`(()=>{fleets[0].alive=false;groundSelectUnit('battalions','gb1');groupOrder({type:'move',dest:groundPoint(11,30)});return orderTargets().length===2&&fleets.slice(1,3).every(f=>f.order?.type==='move');})()`);
  check(`(()=>{fleets[1].order=null;fleets[2].order=null;groundSelectUnit('companies','gc2');groupOrder({type:'move',dest:groundPoint(10,28)});return orderTargets().length===1&&fleets[1].order?.type==='move'&&!fleets[2].order;})()`);
  console.log(`| 地上編成（ブラウザ不要） | ${count}/${count} 成功 |`);
}
async function checkGroundOrg(page,check){
  const original=await page.evaluate(()=>localStorage.getItem('wos.save.v1'));
  const openOrg=async()=>{await page.evaluate(()=>{WOS.openMenu();document.getElementById('forcesOrg').click();});await page.click('[data-org-force="ground"]');};
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wos.save.v1')).groundOrg);
  try{
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('wos.save.v1')||'null');if(s){delete s.groundOrg;localStorage.setItem('wos.save.v1',JSON.stringify(s));}});
    await page.reload();await openOrg();
    // 大隊のタブ（既定）: 旧保存から既定の2大隊、第1大隊の中隊3行と小隊のマス
    check(await page.locator('[data-ground-tab]').count()===2&&await page.locator('#orgList [data-ground-unit]').count()===2&&await page.locator('[data-ground-kind]').count()===3&&await page.locator('[data-ground-platoons="gc1"].on').count()===4,'地上編成: 旧保存から既定の旅団・大隊・中隊を補完し、大隊のタブに中隊の行と小隊のマス');
    await page.selectOption('[data-ground-kind="gc1"]','scout');
    await page.click('[data-ground-platoons="gc1"][data-n="2"]');
    await page.fill('#groundName','保存確認大隊');await page.locator('#groundName').dispatchEvent('change');
    await page.selectOption('#groundAddCompany','artillery');
    const edited=await saved();
    check(edited.companies.find(c=>c.id==='gc1').kind==='scout'&&edited.companies.find(c=>c.id==='gc1').platoons===2&&edited.battalions[0].companies.length===4&&edited.companies.at(-1).kind==='artillery','地上編成: 行の兵科・小隊のマス・中隊の追加を保存');
    await page.reload();await openOrg();
    check(await page.inputValue('#groundName')==='保存確認大隊'&&await page.inputValue('[data-ground-kind="gc1"]')==='scout'&&await page.locator('[data-ground-platoons="gc1"].on').count()===2&&await page.locator('[data-ground-kind]').count()===4,'地上編成: 編集後の保存と再読込');
    await page.click('[data-ground-tab="brigades"]');
    check(await page.locator('.cells.gb').count()===2&&await page.locator('.cells.gb .gco').count()===7,'地上編成: 旅団のタブに大隊の行と中の中隊');
    await page.click('[data-ground-out="gb2"]');
    check((await saved()).brigades[0].battalions.join()==='gb1','地上編成: 旅団から大隊を外す');
    await page.selectOption('#groundAddBattalion','gb2');
    check((await saved()).brigades[0].battalions.join()==='gb1,gb2','地上編成: 旅団へ大隊を加える');
    await page.click('[data-org-force="space"]');
    const space=await page.evaluate(()=>JSON.parse(localStorage.getItem('wos.save.v1')).armies.length);
    check(await page.locator('#orgList [data-army]').count()===space,'地上編成: 宇宙軍の編集を保持');
    const result=await page.evaluate(()=>{
      WOS.start({op:'groundExercise2'});setSpeed(0);endDeploy();
      const b=groundOrg.battalions[0];document.querySelector(`[data-level="battalions"][data-id="${b.id}"] .grpBtn`).click();
      const t=orderTargets(),before=fleets.map(f=>f.pos.clone());fleets.forEach(f=>f.stance='evade');
      groupOrder({type:'move',dest:groundPoint(10,30)});
      const ordered=t.every(f=>f.order?.type==='move'),other=fleets.filter(f=>f.team===0&&!t.includes(f)).every(f=>!f.order);
      for(let i=0;i<20;i++)step(.05);
      const moved=t.every(f=>f.pos.distanceTo(before[fleets.indexOf(f)])>.1);
      const company=fleets.find(f=>f.companyId==='gc1');
      const custom=company.groundKind==='scout'&&company.hp===groundRuleSet().unitTypes.scout.hp;
      const parent=document.querySelector('[data-level="brigades"] .ground-fold');parent.click();const folded=!document.querySelector('[data-level="battalions"]');parent.click();
      return {ordered,other,moved,custom,folded,selected:t.length===4};
    });
    for(const [name,ok] of Object.entries(result))check(ok,'地上編成の実画面: '+name);
    check(await page.locator('#roster [data-level="battalions"]').count()===2,'地上編成: 旅団→大隊→中隊を再展開');
    // 旅団・大隊の見出しの「全自動／全命令／全混在」（宇宙の戦区軍と同じ。ユーザーの指示 2026-11-21）
    const stance=await page.evaluate(()=>{
      fleets.forEach(f=>f.stance='engage');buildRoster();updateRoster();
      const brigade=groundOrg.brigades[0],[b1,b2]=brigade.battalions,mine=groundMembers('brigades',brigade.id);
      const btn=(level,id)=>document.querySelector(`[data-level="${level}"][data-id="${id}"] > .ground-rhead .rgStance`);
      const text=()=>[btn('brigades',brigade.id),btn('battalions',b1),btn('battalions',b2)].map(b=>b.textContent).join();
      const r={start:text()==='全自動,全自動,全自動'};
      btn('battalions',b2).click();
      r.battalion=text()==='全混在,全自動,全命令'&&groundMembers('battalions',b2).every(f=>f.stance==='evade')&&groundMembers('battalions',b1).every(f=>f.stance==='engage')&&
        btn('brigades',brigade.id).dataset.st==='mixed';
      btn('brigades',brigade.id).click();
      r.brigadeEvade=text()==='全命令,全命令,全命令'&&mine.every(f=>f.stance==='evade')&&btn('battalions',b1).dataset.st==='evade';
      btn('brigades',brigade.id).click();
      r.brigadeEngage=text()==='全自動,全自動,全自動'&&mine.every(f=>f.stance==='engage');
      r.others=fleets.filter(f=>f.team===0&&!mine.includes(f)).every(f=>f.stance==='engage');
      return r;
    });
    for(const [name,ok] of Object.entries(stance))check(ok,'地上編成の全自動／全命令: '+name);
  }finally{
    await page.evaluate(s=>{if(s===null)localStorage.removeItem('wos.save.v1');else localStorage.setItem('wos.save.v1',s);},original);
    await page.reload();
  }
}
module.exports={checkGroundOrg};
if(require.main===module){try{nodeChecks();}catch(e){console.error(e);process.exitCode=1;}}
