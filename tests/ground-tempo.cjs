/* 地上のテンポ。Nodeは実関数、ブラウザはEscメニューの実クリックを確認。 */
const assert=require('node:assert/strict');
function tempoCases(){
 const rows=[],check=(name,ok,detail)=>rows.push({name,ok:!!ok,detail}),d=groundData(),near=(a,b)=>Math.abs(a-b)<1e-7;
 op={ground:'exercise2'};over=false;end=()=>{};groundSites=[];groundForests=[];groundBuildings=[];
 d.objects.roads=[{points:[[7,29],[8,29],[8,30],[18,30]]}];groundTerritory={sections:[]};groundSupplyBuild();
 const length=e=>e.path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-e.path[i][0],p[1]-e.path[i][1]),0);
 check('セル境界・折れ点で切らず、道路は3kmごと',groundSupplyNet.edges.length===4&&groundSupplyNet.edges.every(e=>near(length(e),3))&&groundSupplyNet.edges[0].path.length===4,groundSupplyNet.edges.map(e=>({path:e.path,length:length(e)})));
 groundSites=[{id:'Q',x:21.5,y:29,radiusKm:1,owner:0,contested:false}];d.objects.roads=[{points:[[21,29],[26,29]]}];groundTerritory={sections:[{site:{owner:1},path:[[24,29],[26,29]]}]};groundSupplyBuild();
 check('拠点円・橋の通行範囲の両端・帯の端で区切る',[22.5,22.6,24,24.4].every(x=>groundSupplyNet.nodes.some(n=>near(n.x,x)&&near(n.y,29))));
 check('恒久橋上も道路加速',near(groundFactor(groundWorldX(23.5),groundWorldZ(29),'vehicle'),groundRuleSet().movement.roadFactor));
 groundSites=[];
 d.objects.roads=[{points:[[7,29],[17,29]]},{points:[[11,27],[11,31]]}];groundTerritory={sections:[{site:{owner:0},path:[[7,29],[12,29]]}]};groundSupplyBuild();
 check('実交点と帯の端で切って接続',groundSupplyNet.nodes.some(n=>near(n.x,11)&&near(n.y,29)&&n.edges.length===4)&&groundSupplyNet.nodes.some(n=>near(n.x,12)&&near(n.y,29))&&groundSupplyNet.edges.every(e=>length(e)<=groundRuleSet().capture.roadSegmentKm+1e-7));
 const unit=(team=0,kind='infantry',x=15,y=29)=>{const p=groundPoint(x,y),f=makeFleet(team,{name:'tempo',groundKind:kind,type:kind==='sea'?'cl':'cv',n:1,scale:.3,pos:[p.x,p.z],stance:'evade'});f.band=groundBands(f)[0];f.groundMaxHp=f.hpPool;return f;};
 check('折れ線の道路長は弦ではなく道沿い',near(groundSupplyEdgeLength({path:[[7,29],[8,29],[8,30]]}),2));
 const f=unit(),e=groundRoadAt(15,29);fleets=[f];e.owner=null;e.progress=[0,0];
 groundSupplyRoadCapture(.2);op.groundHQ={0:'HQ'};groundRememberTerritory();
 groundSupplyRoadCapture(.2);groundRememberTerritory();check('中立の道路進捗は1秒未満でも再観測する',near(e.knownProgress[0],.4));op.groundHQ=null;
 groundSupplyRoadCapture(.09);check('中立道路は0.5秒直前は中立',e.owner===null&&near(e.progress[0],.49));
 op.groundHQ={0:'HQ'};groundRememberTerritory();op.groundHQ=null;check('中立道路の進捗表示は0.5秒基準',groundRoadCaptureSeconds(e,e.knownOwner)===.5&&groundCaptureReadout(e,groundRoadCaptureSeconds(e,e.knownOwner)).includes('あと1秒'));
 groundSupplyRoadCapture(.01);check('中立道路は0.5秒で占領',e.owner===0&&e.progress.every(p=>p===0));
 e.owner=1;groundSupplyRoadCapture(4.99);check('敵道路は5秒直前も敵',e.owner===1);groundSupplyRoadCapture(.01);check('敵道路は従来の5秒',e.owner===0);
 const cell=Math.floor(29/d.meta.cellKm)*d.terrain.cols+Math.floor(15/d.meta.cellKm);d.terrain.cells[cell]='沼地';
 check('道路帯内は沼地減速なし',near(groundFactor(groundWorldX(15),groundWorldZ(29),'vehicle'),groundRuleSet().movement.roadFactor));
 const offCell=Math.floor(28/d.meta.cellKm)*d.terrain.cols+Math.floor(15/d.meta.cellKm);d.terrain.cells[offCell]='沼地';
 check('道路帯の外では沼地減速',near(groundFactor(groundWorldX(15),groundWorldZ(28),'vehicle'),groundRuleSet().movement.marsh.vehicle));
 const advance=(kind,band,y)=>{const u=unit(0,kind,15,y);u.band=band;u.order={path:{points:[u.pos.clone(),u.pos.clone().add(new THREE.Vector3(.1,0,0))],atIndex:1,s:0}};const x=u.pos.x;groundFollow(u,.001);return (u.pos.x-x)/u.speed/.001;};
 check('実移動も道路1.75倍、航空・海・浮いたW.A.S.は等速',near(advance('vehicle','ground',29),groundRuleSet().movement.roadFactor)&&near(advance('was','ground',29),groundRuleSet().movement.roadFactor)&&near(advance('was','low',29),1)&&near(advance('fighter','low',29),1)&&near(groundFactor(groundWorldX(15),groundWorldZ(29),'sea'),1));
 d.objects.roads=[{points:[[8,28],[8,30],[18,30],[18,28]]}];d.terrain.cells.fill('平地');
 const p=groundPath(groundPoint(8,28),groundPoint(18,28),'vehicle');
 check('経路は速い道路へ寄り道し、直接10kmより短い時間で着く',p&&p.points.some(p=>groundMapY(p.z)>29.3)&&p.cost<10/d.meta.cellKm,{cost:p?.cost,points:p?.points.length});
 // 通常damageと解決中の着弾の共通入口を両軍で確認。対空・海上は既存の実射撃確認も通す。
 for(const team of [0,1])for(const kind of ['vehicle','artillery','guidedRocket','supportAircraft','sea']){
  const src=unit(team,kind,15,29),t=unit(1-team,'vehicle',15,29);fleets=[src,t];groundUpdateSight();
  const before=t.hpPool,impact={source:src,resolving:true,impact:t.pos.clone(),radius:1};damage(t,10,src,impact);
  check('共通の着弾損害倍率 '+kind+' 軍'+team,near(before-t.hpPool,10*groundRuleSet().combat.damageScale));
 }
 const machine=unit(0,'mechanicalAssault'),hp=machine.hpPool;groundMechanicalWear(machine,10);
 check('機械の消耗には損害倍率を掛けない',near(hp-machine.hpPool,machine.groundMaxHp*groundRuleSet().combat.mechanicalWearPerSec*10));
 return rows;
}
function supplyAdvanceCases(id,planned=false){
 const rows=[],check=(name,ok,detail)=>rows.push({name,ok:!!ok,detail});
 op={...WOS_DATA.operations.find(o=>o.id===(id==='baikonur2'?'baikonur':'groundExercise2')),ground:id,groundDrill:false};groundTerrainId=null;over=false;end=()=>{};
 const d=groundData();groundSites=op.groundSites.map(spec=>{const s=d.sites.find(p=>p.id===spec.site);return {...s,owner:spec.owner,contested:false,captureSec:groundRuleSet().capture.seconds,captureRadius:groundRuleSet().capture.radiusKm*GROUND_SCALE,progress:[0,0],pos:groundPoint(s.x,s.y)};});
 groundTerritory={sections:groundRoadSections(d.objects.roads,groundSites)};groundSupplyBuild();
 check(id+' 全拠点が道路網に載る',groundSupplyNet.sites.size===groundSites.length);
 check(id+' 開始時の味方拠点は本営接続',groundSites.filter(s=>s.owner===0).every(s=>groundSupplyAt({team:0,pos:s.pos}).rate===1));
 const points=id==='baikonur2'?[[27,49],[36,43],[47,39]]:[[23.5,29],[22,29],[15,30],[7,29]],start=groundPoint(...points[0]);
 const f=makeFleet(0,{name:'補給確認',groundKind:'infantry',type:'cv',n:1,scale:.3,pos:[start.x,start.z],stance:'evade'});f.band='ground';f.groundMaxHp=f.hpPool;groundSupplyInitUnit(f);fleets=[f];
 const pathPoints=[start];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.05);for(let j=1;j<=n;j++)pathPoints.push(groundPoint(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n));}
 f.order={type:'move',path:planned?groundPath(start,pathPoints.at(-1),'infantry'):{points:pathPoints,atIndex:1,s:0}};
 let done=false;for(let i=0;i<10000&&!done;i++){done=groundFollow(f,.05);groundCaptureStep(.05);groundSupplyAfter(.05);}
 groundCaptureStep(groundRuleSet().capture.neutralSeconds);groundSupplyRoadCapture(groundRuleSet().capture.neutralSeconds);groundSupplyRefresh();
 const at=groundSupplyAt(f);check(id+(planned?' 経路探索で':' 道路上を')+'前進・中立拠点を占領した前線に本営の補給が届く',done&&f.pos.distanceTo(pathPoints.at(-1))<1e-5&&at.rate===1,{rate:at.rate,neutral:groundSupplyNet.edges.filter(e=>e.owner===null).length,pos:[groundMapX(f.pos.x),groundMapY(f.pos.z)]});
 // 敵が道を占領すれば同じ前線が切れ、奪還で復旧する。
 const edge=groundSupplyNet.edges.find(e=>!e.circle&&e.owner===0&&e.rates[0]===1&&groundDistance(e.x,e.y,points)<1e-6);
 if(edge){edge.owner=1;groundSupplyRefresh();const cut=groundSupplyAt(f).rate===0;edge.owner=0;groundSupplyRefresh();check(id+' 経由道路の喪失・奪還が補給に反映',cut&&groundSupplyAt(f).rate===1);}
 return rows;
}
function pathCacheCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok}),d=groundData();
 d.terrain.cells.fill('平地');d.display.board=[[7,28],[20,28],[20,30],[7,30]];
 const points=[[8,28.5],[8,29.5],[18,29.5],[18,28.5]];d.objects.roads=[{points}];
 const route=()=>groundPath(groundPoint(8,28.5),groundPoint(18,28.5),'vehicle'),first=route(),again=route();
 check('反復した経路は再利用後も同じコスト・終点',first&&again&&Math.abs(first.cost-again.cost)<1e-7&&first.points.at(-1).equals(again.points.at(-1)));
 points.forEach(p=>p[1]+=3);const offRoad=route();
 check('同じ配列内の道路座標の編集で古い加速を捨てる',offRoad&&offRoad.cost>first.cost+1);
 for(let y=28;y<30;y+=d.meta.cellKm)for(let x=11;x<15;x+=d.meta.cellKm)d.terrain.cells[Math.floor(y/d.meta.cellKm)*d.terrain.cols+Math.floor(x/d.meta.cellKm)]='沼地';
 const marsh=route();check('同じセル配列内の沼地追加を次の探索で反映',marsh&&marsh.cost>offRoad.cost*1.5);
 groundRuleSet().movement.marsh.vehicle=.5;const faster=route();check('規則データの速度変更も次の探索で反映',faster&&faster.cost<marsh.cost-1);
 return rows;
}
function nodeChecks(){
 const {run,read}=require('./ground-landing.cjs').createGroundContext();
 const rows=run(`(${tempoCases.toString()})()`);
 const cached=require('./ground-landing.cjs').createGroundContext();rows.push(...cached.run(`(${pathCacheCases.toString()})()`));
 rows.push(...run(`(()=>{
  groundSites=[];fleets=[];groundVisuals=new THREE.Group();
  document.getElementById=()=>({parentElement:{open:true}});globalThis.labelsEl={appendChild(){}};globalThis.proj=()=>({x:0,y:0,z:0});
  groundSupplyNet={key:'polyline',nodes:[],edges:[{owner:0,rates:[1,0],path:[[7,29],[8,29],[8,30]],x:8,y:29}]};
  groundSupplyDraw();const p=groundSupplyMap.lines[0].geometry.attributes.position;
  return [{name:'補給図の折れ線は各線分の端を対で描く',ok:p.count===4&&p.getX(1)===p.getX(2)&&p.getZ(1)===p.getZ(2)&&p.getZ(3)!==p.getZ(2)}];
 })()`));
 // 本体stepの地上分岐を実行。groundStepへ渡す全処理のdtと時計を一緒に観測。
 const sim=read('battle/sim.js');run(sim.slice(sim.indexOf('function step(dt){'),sim.indexOf('  gameSec+=dt; if(tutorialHolding())'))+'}');
 rows.push(...run(`(()=>{const original=groundStep;let received=0;groundStep=dt=>received=dt;gameSec=0;step(10);groundStep=original;return [{name:'チュートリアルを含む地上stepと時計が1.2倍',ok:received===12&&gameSec===12}];})()`));
 for(const id of ['exercise2','baikonur2'])for(const planned of [false,true]){const c=require('./ground-landing.cjs').createGroundContext();rows.push(...c.run(`(${supplyAdvanceCases.toString()})('${id}',${planned})`));}
 return rows;
}
async function checkGroundTempo(page,check){
 const errors=[],onError=e=>errors.push(e.message);page.on('pageerror',onError);
 const debug=await page.evaluate(()=>localStorage.getItem('wos.debug'));
 try{
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('wos.debug')||'{}');d.battle=true;localStorage.setItem('wos.debug',JSON.stringify(d));});await page.reload();
  for(const id of ['charybdis','groundExercise2']){
   await page.evaluate(id=>{WOS.start({op:id});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();},id);
   await page.keyboard.press('Escape');
   for(let i=0;i<2;i++){
    const before=await page.evaluate(()=>autoMode);await page.click('#pause [data-pm="auto"]');
    check(await page.evaluate(before=>{const b=document.querySelector('#pause [data-pm="auto"]'),saved=JSON.parse(localStorage.getItem('wos.debug'));return autoMode===!before&&document.body.classList.contains('dbg-auto')===autoMode&&saved.auto===autoMode&&b.getAttribute('aria-pressed')===String(autoMode)&&b.textContent.includes(autoMode?'オン':'オフ')&&paused&&speed===0;},before),id+' メニューでオートを切替・表示・保存');
   }
   await page.keyboard.press('Escape');
  }
  check(errors.length===0,'テンポとオート切替でページ例外なし');
 }finally{page.off('pageerror',onError);await page.evaluate(debug=>{if(debug===null)localStorage.removeItem('wos.debug');else localStorage.setItem('wos.debug',debug);},debug);await page.reload();await page.evaluate(()=>{WOS.start({op:'charybdis'});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();});}
}
module.exports={nodeChecks,checkGroundTempo};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log(JSON.stringify(r));assert.equal(rows.filter(r=>!r.ok).length,0);}
