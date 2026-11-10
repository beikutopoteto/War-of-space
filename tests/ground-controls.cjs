/* node tests/ground-controls.cjs: 実入力・予約経路・選択輪のブラウザ不要の回帰確認。 */
const assert=require('assert/strict');
const {createGroundContext}=require('./ground-landing.cjs');
function createControlsContext(){
  const {ctx,read,run}=createGroundContext(),elements=new Map(),keys=[];
  const element=()=>({hidden:true,style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){}});
  Object.assign(ctx,{selected:null,selGroup:null,selMulti:[],selAlt:0,deploying:false,labelEnemy:null,
    document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll:()=>[]},
    hideGhost(){},closePick(){ctx.pickCtx=null;},openSelectedRoster(){},setAlt(){},hideHint(){},tutorialOrder(){},
    pick:()=>({best:ctx.hitUnit||null,fort:false}),groundAt:()=>ctx.hitPoint||null,shown:()=>true,
    openPick:(x,y,target,dest,queue)=>{ctx.pickCtx={target,dest,queue};},
    openPause:()=>{ctx.pauseOpened=true;},addEventListener:(name,fn)=>{if(name==='keydown')keys.push(fn);},
    detours:()=>[],groundHud(){},paused:false,performance:{now:()=>0}});
  const hud=read('battle/hud.js'),state=read('battle/state.js'),sim=read('battle/sim.js');
  run(hud.slice(hud.indexOf('function setSel('),hud.indexOf('/* altitude control:')));
  run(state.slice(state.indexOf('function toggleMulti('),state.indexOf('/* o.queue')));
  run(state.slice(state.indexOf('const UNDO_MAX='),state.indexOf('function openSelectedRoster(')));
  run(sim.slice(sim.indexOf('const MAX_WAYPOINTS='),sim.indexOf('/* advance along the path;')));
  run(hud.slice(hud.indexOf('function tap('),hud.indexOf('/* the deploy step (user decision')));
  run(hud.slice(hud.indexOf('/* PC keys:'),hud.indexOf("document.getElementById('again')")));
  ctx.pressEscape=()=>keys.forEach(fn=>fn({code:'Escape',target:{tagName:'DIV'},preventDefault(){}}));
  return {ctx,run};
}
function controlsCases(){
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
  op={ground:'exercise2'};fleets=[];groundSites=[];groundTerritory=null;groundBridges=[];over=false;
  const unit=(kind,x=8,y=27,team=0)=>{
    const p=groundPoint(x,y),f=makeFleet(team,{name:kind+x,groundKind:kind,type:'cv',n:1,scale:.3,pos:[p.x,p.z],stance:'evade'});
    f.band=groundBands(f)[0];f.pos.y=groundUnitHeight(f);f.el.classList.toggle=()=>{};f.el.classList.remove=()=>{};fleets.push(f);return f;
  };
  const a=unit('infantry'),b=unit('infantry',10),tank=unit('vehicle',12),gun=unit('artillery',13,19),engineer=unit('engineer',24,12),truck=unit('supply',8.6),apc=unit('apc',8.5);
  const mode=m=>{groundClearAiming();if(m==='strike')groundStrikeAiming=true;else if(m==='supply')groundSupplyAiming=true;else groundWorkAiming=m;};
  const clear=()=>!groundWorkAiming&&!groundStrikeAiming&&!groundSupplyAiming;
  for(const m of ['board','bridge','strike','supply']){
    select(a);mode(m);select(b);check(m+'は別中隊の選択で解除',selected===b&&clear());
    select(a);mode(m);hitUnit=b;tap(0,0);check(m+'待機中の盤上の味方クリックは選択',selected===b&&clear());
    select(a);mode(m);toggleMulti(b);check(m+'はShift複数選択で解除',orderTargets().length===2&&clear());
    select(a);mode(m);select(null);check(m+'は選択解除で消える',!selected&&clear());
  }
  groundInitOrg(null);select(a);mode('board');groundSelectUnit('companies',b.companyId);
  check('一覧の中隊選択でも解除',selected===b&&clear());
  select(a);hitUnit=apc;tap(0,0);check('通常の輸送車クリックは搭乗せず選択',selected===apc&&!a.order);
  select(a);mode('board');tap(0,0);check('明示した搭乗待ちでは輸送車が命令先',selected===a&&a.order?.type==='board'&&a.order.target===apc&&clear());
  groundCancelWork(a);groundClearOrders(a);
  select(a);hitUnit=apc;tap(0,0,true);check('右クリックは従来の直接搭乗を維持',selected===a&&a.order?.type==='board');
  groundCancelWork(a);groundClearOrders(a);
  mode('strike');groundStrikeToggle.call(null); // 歩兵には地点攻撃を追加しない。
  check('非対応部隊では地点攻撃を起動できない',!groundStrikeWeapon(a));groundClearAiming();
  select(gun);groundStrikeToggle();hitUnit=tank;tap(0,0);check('地点攻撃中の味方選択で発射しない',selected===tank&&!groundStrikes.length&&clear());
  op.groundHQ={0:'A',1:'F'};select(truck);mode('supply');hitUnit=a;tap(0,0);
  check('補給待ちの受給可能な味方クリックは分配',selected===truck&&truck.groundGiving===a&&clear());
  select(truck);mode('supply');hitUnit=b;tap(0,0,false,true);check('補給待ちでもShiftは複数選択',orderTargets().includes(b)&&clear());
  delete op.groundHQ;
  select(engineer);mode('bridge');check('架橋命令が受理され全待機を解除',!!groundBridgeCommand([engineer],groundPoint(23.6,10.95))&&clear());
  groundCancelWork(engineer);groundClearOrders(engineer);
  select(gun);mode('strike');check('地点攻撃を受理して全待機を解除',groundStrikeCommand([gun],groundPoint(17,17))===1&&clear());
  select(gun);mode('strike');groundStrikeCommand([gun],groundPoint(47,35));check('不可な狙点は同部隊の待機で再指定可能',groundStrikeAiming);groundClearAiming();
  select(a);groundSupplyAiming=groundStrikeAiming=true;groundWorkAiming='board';pressEscape();
  check('Esc一回で全待機を解除しメニューは開かない',clear()&&!pauseOpened);pressEscape();check('待機なしのEscは従来のメニュー',pauseOpened);
  select(a);mode('board');groupOrder({type:'move',dest:groundPoint(9,27)});check('通常命令の発行でも待機解除',clear());
  mode('strike');undo();check('命令取消でも全待機を解除',clear());
  // 地形を使った本物の経路。クリックで予約し、全経由地の通過を確認する。
  groundClearOrders(a);a.pos.copy(groundPoint(8,27));select(a);hitUnit=null;
  const targets=[[9,27],[9,29],[11,29]].map(p=>groundPoint(...p));
  targets.forEach((p,i)=>{hitPoint=p;tap(0,0,false,i>0);});
  check('Shiftで三つの経由地を矢印経路に保持',a.order.path.pts.length===3&&targets.every((p,i)=>a.order.path.pts[i].distanceTo(p)<1e-6));
  groundBridgeRevision++;groundFollow(a,.01);
  check('橋変更時の再探索も残り三つの経由地を保持',a.order.path.pts.length===3);
  const visited=targets.map(()=>false);
  for(let i=0;i<10000&&a.order;i++){
    const done=groundFollow(a,.01);targets.forEach((p,j)=>{if(groundDistanceTo(a,{pos:p})<.04)visited[j]=true;});
    if(done){a.order=null;nextOrder(a);}
  }
  check('予約した全経由地を順に実移動し到着',visited.every(Boolean)&&!a.order&&groundDistanceTo(a,{pos:targets[2]})<1e-6);
  const enemy=unit('vehicle',10,29,1);enemy.seen=true;
  a.pos.copy(groundPoint(8,27));select(a);groupOrder({type:'move',dest:targets[0]});groupOrder({type:'attack',target:enemy,queue:true});groupOrder({type:'move',dest:targets[1],queue:true});groupOrder({type:'move',dest:targets[2],queue:true});
  check('移動→攻撃→二つの経由地を予約',a.queue.length===2&&a.queue[0].type==='attack'&&a.queue[1].via.length===1);
  groundFollow(a,100);a.order=null;nextOrder(a);check('先の移動後は予約攻撃になる',a.order?.type==='attack'&&a.order.target===enemy);
  enemy.alive=false;a.order=null;nextOrder(a);check('攻撃後の予約経由地も実経路に残る',a.order.path.pts.length===2&&a.order.path.pts[0].distanceTo(targets[1])<1e-6);
  groupOrder({type:'move',dest:groundPoint(10,28)});check('Shiftなしで古い予約を消す',!a.queue.length&&a.order.path.pts.length===1);
  a.order.path.s=a.order.path.at[0];groupOrder({type:'move',dest:targets[2],queue:true});
  check('到着境界での予約も空の基準点で例外にならない',a.order?.path&&Number.isFinite(a.order.dest.x));
  const before=copyOrder(a.order);groupOrder({type:'move',dest:targets[1]});undo();
  check('戻すで残りの地上経由地を復元',a.order.path.pts.length===before.via.length+1&&a.order.dest.distanceTo(before.dest)<1e-6);
  // 第一章は既存の曲線・予約処理のまま。
  op={};groundClearOrders(a);a.pos.set(0,0,0);select(a);const space=[new THREE.Vector3(10,0,0),new THREE.Vector3(10,5,20)];
  groupOrder({type:'move',dest:space[0]});groupOrder({type:'move',dest:space[1],queue:true});
  check('第一章の予約は従来の曲線のまま',a.order.path.curve.isCatmullRomCurve3&&a.order.path.pts.length===2&&a.order.dest.equals(space[1]));
  // 途中追加の中隊にも輪を作り、全頂点を地表より上に保つ。
  op={ground:'exercise2'};groundVisuals=new THREE.Group();const late=unit('infantry',41,27);delete late.scale;
  groundSelectionDraw(late,true);const ring=late.groundSelection,p=ring.geometry.attributes.position;
  check('途中追加部隊の白い選択輪を生成',ring?.visible&&ring.parent===groundVisuals&&ring.material.color.getHex()===0xffffff&&ring.renderOrder>4);
  check('scale省略でも輪の全頂点と包囲球が有限',Array.from(p.array).every(Number.isFinite)&&Number.isFinite(ring.geometry.boundingSphere.radius));
  check('斜面でも輪の全頂点が実地表と描画地表の上',Array.from({length:p.count},(_,i)=>p.getY(i)>groundSurfaceHeight(late.pos.x+p.getX(i),late.pos.z+p.getZ(i))).every(Boolean));
  late.embarked=apc;groundSelectionDraw(late,true);check('搭乗中は輪を隠す',!ring.visible);late.embarked=null;groundSelectionDraw(late,false);check('非選択の輪を隠す',!ring.visible);
  // 経路探索に失敗しても既存の0.5秒タイマーを守り、毎ステップ探し直さない。
  const attacker=unit('infantry',8,27),blocked=unit('vehicle',12,27,1);fleets=[attacker,blocked];groundSites=[];
  attacker.range=1;attacker.groundChaseT=.5;order(attacker,{type:'attack',target:blocked});
  check('新しい追撃命令は前の再探索待ちを引き継がない',attacker.groundChaseT===0);
  const realPath=groundPath,realSight=groundUpdateSight,realSeen=groundSeenBy;let searches=0;
  groundPath=()=>{searches++;return null;};groundUpdateSight=()=>{};groundSeenBy=()=>true;
  try{
    groundStep(.125);check('到達不能な追撃も最初は探索する',searches===1&&attacker.order?.type==='attack');
    for(let i=0;i<3;i++)groundStep(.125);check('失敗直後の3ステップでは探索を繰り返さない',searches===1);
    groundStep(.125);check('失敗した追撃経路は0.5秒後に再探索',searches===2);
    for(let i=0;i<4;i++)groundStep(.125);check('失敗が続いても0.5秒ごとの再探索',searches===3);
  }finally{groundPath=realPath;groundUpdateSight=realSight;groundSeenBy=realSeen;}
  // 手動の対空指定を拒否しても、移動・予約経路・undo履歴と自動迎撃は独立。
  const guard=unit('vehicle',8,27),air=unit('fighter',8.2,27,1);fleets=[guard,air];groundSites=[];groundForests=[];groundBuildings=[];
  guard.stance=air.stance='evade';select(guard);groupOrder({type:'move',dest:groundPoint(9,27)});groupOrder({type:'move',dest:groundPoint(9,29),queue:true});
  const move=guard.order,queued=guard.queue,history=undoStack.length,at=guard.pos.clone();
  groupOrder({type:'attack',target:air});order(guard,{type:'attack',target:air});
  check('敵航空への手動攻撃は予約移動とundo履歴を変えない',guard.order===move&&guard.order.path.pts.length===2&&guard.queue===queued&&undoStack.length===history);
  guard.groundAATimer=0;const airHP=air.hpPool;groundStep(.05);
  check('交戦回避でも移動と予約を保って別対象として自動迎撃',air.hpPool<airHP&&guard.groundAATarget===air&&!guard.fireTarget&&guard.order===move&&guard.order.path.pts.length===2&&guard.queue===queued&&guard.pos.distanceTo(at)>0);
  return rows;
}
function nodeChecks(){const {ctx,run}=createControlsContext();ctx.pauseOpened=false;return run(`(${controlsCases.toString()})()`);}
module.exports={nodeChecks,createControlsContext};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`| 地上入力・予約・選択輪 | ${rows.length-bad.length}/${rows.length} 成功 |`);assert.equal(bad.length,0,bad.map(r=>r.name).join('\n'));}
