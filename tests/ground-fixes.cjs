/* node tests/ground-fixes.cjs。実関数で描画頂点・探知記憶・受給線・固定敵を確認。 */
const assert=require('assert/strict');
const {createDrillContext}=require('./ground-drill.cjs');

function fixesCases(){
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
  op=WOS_DATA.operations.find(o=>o.id==='groundExercise2');tutorial=null;over=false;
  const unit=(team,kind,x,y)=>{
    const p=groundPoint(x,y),f=makeFleet(team,{name:kind+team+x,groundKind:kind,type:kind==='sea'?'cl':'cv',n:1,scale:.3,pos:[p.x,p.z],stance:'evade'});
    f.band=groundBands(f)[0];f.pos.y=groundUnitHeight(f);groundSupplyInitUnit(f);return f;
  };
  // 実地形の斜面・高台。旧水平輪なら地面より下になることも確かめる。
  const points=[[40,27],[41,27],[42,27],[20,18]],realOp=op;
  let vertices=0,buried=0,minClearance=Infinity;
  for(const [x,y] of points){
    const at=groundPoint(x,y);
    op={...realOp,groundDrill:false,tutorial:[{name:'高さ確認',text:'',targets:[],marks:[{label:'斜面',pos:[at.x,at.z],alt:0}]}]};
    tutorial={step:0,skipped:false};tutorialRender();
    for(const child of tutorialMarks[0].group.children){
      const p=child.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        const wx=at.x+p.getX(i),wz=at.z+p.getZ(i),h=groundHeight(wx,wz);
        if(h>at.y)buried++;vertices++;minClearance=Math.min(minClearance,p.getY(i)-Math.max(h,groundSightHeight(wx,wz)));
      }
    }
    check(`目標輪 ${x},${y} の全頂点が地表より上`,minClearance>.17&&tutorialMarks[0].group.children.length===2);
  }
  check('旧水平輪のめり込みを実地形で再現',buried>0);
  tutorialClearMarks();op=realOp;tutorial=null;
  groundCaptureInit();groundSupplyBuild();
  const observer=unit(0,'infantry',7,27);fleets=[observer];
  const enemySite=groundSites.find(s=>s.owner===1),neutral=groundSites.find(s=>s.owner===null);
  groundUpdateSight();groundCaptureDraw();
  check('未探知の敵拠点・中立拠点は同じ中立色',enemySite.knownOwner===null&&neutral.knownOwner===null&&enemySite.el.style.color===neutral.el.style.color);
  check('霧の中でも名札・円・影響範囲を描く',enemySite.el.style.visibility==='visible'&&enemySite.ring.visible&&enemySite.ring.renderOrder>3&&groundTerritory.mesh.renderOrder>3);
  check('未探知名札は敵の持ち主と本営を明かさない',!enemySite.el.querySelector('small').textContent.includes('共和国')&&!enemySite.el.querySelector('small').textContent.includes('本営'));
  observer.pos.copy(enemySite.pos);groundUpdateSight();groundCaptureDraw();
  check('探知した拠点は敵色',enemySite.knownOwner===1&&enemySite.el.style.color==='#ff998b');
  observer.pos.copy(groundPoint(7,27));groundUpdateSight();groundCaptureDraw();
  check('視界を離れても敵色を保持',!enemySite.observed&&enemySite.knownOwner===1&&enemySite.el.style.color==='#ff998b');
  enemySite.owner=null;groundUpdateSight();groundCaptureDraw();
  check('視界外の所有変更は最後に見た敵色を保持',enemySite.knownOwner===1);
  observer.pos.copy(enemySite.pos);groundUpdateSight();groundCaptureDraw();
  check('再探知で中立への変更も反映',enemySite.knownOwner===null);
  const road=groundSupplyNet.edges.find(e=>!e.circle&&e.owner===1);
  observer.pos.copy(groundPoint(7,27));groundUpdateSight();
  check('未探知道路は中立色',!!road&&road.knownOwner===null);
  observer.pos.copy(groundPoint(road.x,road.y));groundUpdateSight();
  observer.pos.copy(groundPoint(7,27));groundUpdateSight();
  check('道路も探知した敵色を記憶',road.knownOwner===1&&!road.observed);

  // 本営の円と、実際につながる道路帯の中央を給源にする。
  observer.pos.copy(groundSites.find(s=>s.id===op.groundHQ[0]).pos).add(new THREE.Vector3(2,0,0));
  observer.groundSupply=40;observer.groundSupplyWait=0;
  groundSupplyAfter(1);groundSupplyLinksDraw();check('開始待ち中は線なし',groundSupplyLinks.size===0);
  groundSupplyAfter(2);groundSupplyLinksDraw();
  check('補充中は拠点中心から線を描く',observer.groundSupply>40&&observer.groundSupplySource?.site&&groundSupplyLinks.has(observer));
  const linked=groundSupplyNet.edges.find(e=>!e.circle&&e.owner===0&&e.rates[0]>0);
  observer.pos.copy(groundPoint(linked.x,linked.y));observer.groundSupply=40;groundSupplyAfter(1);groundSupplyLinksDraw();
  check('道路帯での補充は小区間の中央が給源',observer.groundSupplySource?.edge===linked&&groundSupplyLinks.has(observer));
  observer.groundSupply=100;groundSupplyAfter(1);groundSupplyLinksDraw();check('満タンで受給がなければ線なし',groundSupplyLinks.size===0);
  observer.pos.copy(groundPoint(15,26));observer.groundSupply=40;groundSupplyAfter(1);groundSupplyLinksDraw();check('補給網外は線なし',groundSupplyLinks.size===0);
  const truck=unit(0,'supply',15.7,26);fleets.push(truck);
  groundSupplyCommand([truck],observer);groundSupplyAfter(1);groundSupplyLinksDraw();
  check('分配の実増加中は補給部隊が給源',observer.groundSupply>40&&observer.groundSupplySource?.unit===truck&&groundSupplyLinks.has(observer));
  const line=groundSupplyLinks.get(observer),p=line.geometry.attributes.position;
  check('点線の全頂点が地表より上',line.material.isLineDashedMaterial&&Array.from({length:p.count},(_,i)=>p.getY(i)>groundHeight(p.getX(i),p.getZ(i))).every(Boolean));
  groundClearOrders(truck);groundSupplyLinksDraw();check('分配取消後は停止中でも線を消す',groundSupplyLinks.size===0);
  groundSupplyCommand([truck],observer);truck.groundSupply=0;groundSupplyAfter(1);groundSupplyLinksDraw();check('供給側の残量ゼロでは線なし',groundSupplyLinks.size===0);
  groundSupplyLinksClear();

  // 初期の全敵（海上も含む）を射程内に置く。命令なしの自動交戦と残った射撃目標を試す。
  groundSites=[];groundSupplyNet=null;op={...realOp,groundHQ:null};
  const blue=unit(0,'infantry',20,25),reds=realOp.enemies.map(s=>makeFleet(1,s));
  for(const spec of realOp.groundSea.filter(s=>s.team===1))reds.push(makeFleet(1,spec));
  for(const f of reds){f.band=groundBands(f)[0];f.pos.copy(blue.pos).add(new THREE.Vector3(1,0,0));f.pos.y=groundUnitHeight(f);groundSupplyInitUnit(f);f.stance='engage';f.fireTarget=blue;}
  fleets=[blue,...reds];const starts=reds.map(f=>f.pos.clone()),realDamage=damage;let hits=0;
  damage=(t,n,src,...rest)=>{if(src?.team===1)hits++;return realDamage(t,n,src,...rest);};
  for(let i=0;i<200;i++)groundStep(.05);
  check('演習の敵5隊は10秒間、実打撃ゼロ・移動ゼロ',reds.length===5&&hits===0&&reds.every((f,i)=>f.pos.equals(starts[i])));
  check('固定敵は自動で攻撃命令を作らず残った射撃目標も消す',reds.every(f=>!f.order&&!f.fireTarget));
  const tank=reds.find(f=>f.groundKind==='vehicle'),hp=blue.hpPool;
  order(tank,{type:'attack',target:blue});groundStep(.05);
  check('固定敵への明示した攻撃命令は実打撃になる',hits>0&&blue.hpPool<hp);
  groundClearOrders(tank);const stopped=hits;groundStep(.05);
  check('命令取消後は自動射撃に戻らない',hits===stopped&&!tank.fireTarget);
  const rocket=unit(1,'guidedRocket',20,25);rocket.stance='engage';fleets.push(rocket);groundStep(.05);
  check('固定敵の許可制兵科は自動で攻撃命令を作らない',!rocket.order&&!rocket.fireTarget);
  const sea=reds.find(f=>f.groundKind==='sea');groundStrikes=[];
  for(let i=1;i<groundStrikeRules().aiCluster;i++)fleets.push(unit(0,'infantry',20,25));
  groundUpdateSight();
  groundStrikeAI(sea);
  check('固定敵の艦砲は自動で地点攻撃しない',groundStrikes.length===0);
  check('固定敵の艦砲への明示した地点攻撃は受理する',!!groundStrikeLaunch(sea,blue.pos));
  groundStrikes=[];
  op=realOp;for(const f of reds){f.groundSupply=0;f.groundMorale=0;}groundSupplyBefore(1);
  check('固定敵は補給切れ・士気ゼロでも移動命令を作らない',reds.every(f=>!f.groundRecover&&!f.groundRout&&!f.groundAirState));
  damage=realDamage;
  check('バイコヌール演習は固定指定の対象外',!WOS_DATA.operations.find(o=>o.id==='baikonur').groundStaticEnemies);
  return {rows,vertices,minClearance,buried};
}

function nodeChecks(){
  const {ctx,run}=createDrillContext();
  const create=ctx.document.createElement;
  ctx.document.createElement=(tag)=>{
    const el=create(tag);el.querySelectorAll=()=>[el.querySelector('i:first'),el.querySelector('i:last')];return el;
  };
  const fs=require('fs'),path=require('path'),tutorial=fs.readFileSync(path.join(__dirname,'../battle/tutorial.js'),'utf8');
  run(tutorial.slice(tutorial.indexOf('function tutorialRender(){'),tutorial.indexOf('function tutorialAdvance(){')));
  // Canvasの色はcheckGroundFixesの実画面で確認。Nodeでは輪・札・観測記憶を実行。
  run("tutorialTalk=()=>{};groundPaintTerritory=()=>{};");
  const result=run(`(${fixesCases.toString()})()`);
  // npm test と同じ固定指定つきの作戦で、輸送・架橋・上陸の実関数も通す。
  const {createGroundContext,landingCases}=require('./ground-landing.cjs');
  const {transportCases}=require('./ground-transport.cjs');
  for(const cases of [transportCases,landingCases]){
    const scene=createGroundContext();
    scene.run("op={...WOS_DATA.operations.find(o=>o.id==='groundExercise2'),wipeLose:false}");
    result.rows.push(...scene.run(`(${cases.toString()})()`));
  }
  return result;
}
async function checkGroundFixes(page,check){
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);endDeploy();});
  const result=await page.evaluate(()=>{
    const s=groundSites.find(s=>s.id===op.groundHQ[1]),home=groundSites.find(s=>s.id===op.groundHQ[0]);
    for(const f of fleets)if(f.team===0&&!f.embarked){f.stance='evade';groundClearOrders(f);f.pos.copy(home.pos);}
    groundUpdateSight();groundDraw();groundFogDraw(true);
    const color=(rgb)=>{const ctx=groundTerritory.canvas.getContext('2d'),p=ctx.getImageData(Math.floor(s.x*10),Math.floor((36-s.y)*10),1,1).data;return p[3]===102&&rgb.every((v,i)=>Math.abs(p[i]-v)<=2);};
    const unknown=s.knownOwner===null&&color([160,168,165])&&s.el.style.visibility==='visible'&&s.ring.material.color.getHexString()==='cad1c5';
    const observer=fleets.find(f=>f.team===0&&f.groundKind==='infantry');observer.pos.copy(s.pos);groundUpdateSight();groundDraw();
    const detected=s.knownOwner===1&&color([230,85,72]);
    observer.pos.copy(home.pos);groundUpdateSight();groundDraw();groundFogDraw(true);
    const remembered=!s.observed&&s.knownOwner===1&&color([230,85,72]);
    observer.pos.add(new THREE.Vector3(4,0,0));observer.groundSupply=40;observer.groundSupplyWait=0;
    document.getElementById('groundSupply').parentElement.open=false;
    groundSupplyAfter(3);groundDraw();const line=groundSupplyLinks.get(observer);
    const supplied=!!line&&line.parent===groundVisuals&&line.geometry.attributes.position.count>1&&line.material.isLineDashedMaterial;
    observer.groundSupply=100;groundSupplyAfter(1);groundDraw();const full=!groundSupplyLinks.has(observer);
    return {unknown,detected,remembered,supplied,full,aboveFog:s.ring.renderOrder>3&&groundTerritory.mesh.renderOrder>3};
  });
  for(const [name,ok] of Object.entries(result))check(ok,'地上の直しの実画面: '+name);
  await page.evaluate(()=>{reset({op:'charybdis'});});
}
module.exports={fixesCases,nodeChecks,checkGroundFixes};
if(require.main===module){
  const {rows,vertices,minClearance,buried}=nodeChecks(),bad=rows.filter(r=>!r.ok);
  console.log(`| 地上の直し | ${rows.length-bad.length}/${rows.length} 成功 |`);
  console.log(`| 目標輪 | ${vertices}頂点、最低地表差${minClearance.toFixed(3)}、旧輪の地中頂点${buried} |`);
  assert.equal(bad.length,0,bad.map(r=>r.name).join("\n"));
}
