/* Nodeの実地上処理と、Chromiumの実画面から同じ橋渡しを確認する。 */
const assert=require('node:assert/strict');
function bridgeCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 npcGroundInit();const c=npcGroundState.commanders.get(1),sit=npcGroundSituation(c);
 const cfg=op.npc[c.team],oldIntent=cfg.intent;
 check('intent未指定はseize、stylesの表も指揮官へ渡す',sit.goal.type==='seize'&&c.styles===window.WOS_DATA.npc.styles);
 check('軍ごとのintentのtype・zones・until・styleをsit.goalへ渡す',['seize','hold','delay','withdraw'].every(type=>{
  cfg.intent={type,zones:['F','E'],until:300,style:'depth'};const g=npcGroundSituation(c).goal;
  return g.type===type&&g.zones.join(',')==='F,E'&&g.until===300&&g.style==='depth';
 }));
 if(oldIntent===undefined)delete cfg.intent;else cfg.intent=oldIntent;
 check('本営・目標・初期所有・影響半径をkmで渡す',sit.zones.find(z=>z.id===op.groundHQ[0]).goal&&sit.zones.find(z=>z.id===op.groundHQ[0]).base==='foe'&&sit.zones.find(z=>z.id==='F').base==='own'&&sit.zones.find(z=>z.id==='A').known==='foe'&&sit.zones.find(z=>z.id==='A').r===groundData().sites.find(s=>s.id==='A').radiusKm);
 const hidden=sit.zones.find(z=>z.id==='A');check('見えていない他軍の拠点はowner:null',!hidden.seen&&hidden.owner===null);
 const red=fleets.find(f=>f.team===1&&f.groundKind==='vehicle'),blue=fleets.find(f=>f.team===0&&f.groundKind==='vehicle'),full=red.hpPool;
 red.hpPool=full/2;check('兵科の重み×残存耐久',Math.abs(npcGroundPower(red)-1)<1e-8);red.hpPool=full;
 const flags=['groundRout','groundRecover','embarked','groundAirState','groundBuilding','groundUnloading','locked'];
 check('敗走・再集結・搭乗・帰投・架橋・上陸は命令不可',flags.every(key=>{const old=red[key];red[key]=true;const blocked=!npcGroundFree(red);red[key]=old;return blocked;}));
 // 既知の接触を固定し、見えない相手の位置と耐久を変更してもsituは記録値を使う。
 const oldContact=blue.groundContacts[1],oldVisible=blue.groundVisible[1],oldPos=blue.pos.clone(),oldHp=blue.hpPool;
 blue.groundContacts[1]={pos:groundPoint(14,20),at:gameSec-12,power:.75,role:'shock'};blue.groundVisible[1]=false;blue.pos.copy(groundPoint(5,10));blue.hpPool=1;
 const contact=npcGroundSituation(c).contacts.find(e=>e.id===blue.id);
 check('視界外は記録した位置・力・経過秒だけ',contact.x===14&&contact.z===20&&contact.power===.75&&contact.age===12);
 blue.pos.copy(oldPos);blue.hpPool=oldHp;blue.groundContacts[1]=oldContact;blue.groundVisible[1]=oldVisible;
 const savedNet=groundSupplyNet;
 const fakeSites=groundSites.slice(0,3),nodes=[0,1,2].map(x=>({x:x*3,y:0,edges:[]})),edges=[{a:0,b:1,open:true},{a:1,b:2,open:false}];
 edges.forEach((e,i)=>{nodes[e.a].edges.push(i);nodes[e.b].edges.push(i);});groundSupplyNet={nodes,edges,sites:new Map(fakeSites.map((s,i)=>[s,i]))};
 const links=npcGroundLinks();check('道路長・閉鎖・他拠点で探索を止める',links.length===2&&links.every(l=>l.len===3)&&links.some(l=>l.open===false)&&!links.some(l=>[l.a,l.b].includes(fakeSites[0].id)&&[l.a,l.b].includes(fakeSites[2].id)));
 edges[1].open=true;check('開通した道路の状態を再構築する',npcGroundLinks().every(l=>l.open));groundSupplyNet=savedNet;
 const point=npcGroundPassPoint(red,12,3);check('海の中の目的地は通れる近傍へ補正',point&&groundPass(groundMapX(point.x),groundMapY(point.z),groundMoveKind(red)));
 const air=fleets.find(f=>f.team===1&&f.groundKind==='fighter'),band=air.band,p=npcGroundPassPoint(air,35,26);check('航空機の高度段を変えない',p.y===air.pos.y&&air.band===band);
 const original=order;let issued=0;order=(...args)=>{issued++;original(...args);};
 const u=sit.units.find(u=>u.id===red.id),plan={tasks:[{type:'hold',zone:'E',from:'F',units:[{id:red.id,as:'main'}]}]};
 npcGroundApply(c,sit,plan);const first=issued;npcGroundApply(c,sit,plan);check('同じ目的地へ命令を出し直さない',first===1&&issued===1);
 red.order=null;red.pos.copy(groundPoint(26,27));npcGroundApply(c,sit,plan);check('命令なしで1km以上離れた隊には再発令',issued===2);order=original;
 return rows;
}
// 実際の地上ステップで退避点まで歩かせる。頭の再判断と敵の攻撃は混ぜない。
function retireCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 const red=fleets.find(f=>f.team===1&&f.groundKind==='infantry'),blue=fleets.find(f=>f.team===0&&f.groundKind==='infantry');
 blue.pos.copy(groundPoint(7,29));blue.order=null;blue.stance='evade';fleets=[red,blue];
 red.pos.copy(groundPoint(33,29));red.order=null;red.groundSupply=red.groundMorale=groundSupplyRules().max;
 npcGroundInit();const c=npcGroundState.commanders.get(1);c.nextThink=Infinity;
 const sit=npcGroundSituation(c),target=sit.zones.find(z=>z.id==='E');
 const k={key:'retire:E',type:'retire',stage:'wait',zone:'E',from:null,units:[{id:red.id,as:'main'}]};
 const start=red.pos.clone();npcGroundApply(c,sit,{tasks:[k]});
 const dest=red.order?.dest?.clone();
 check('retireは指定拠点へ通常の移動命令を出す',red.order?.type==='move'&&dest?.distanceTo(groundPoint(target.x,target.z))<.001);
 const limit=(red.order?.path?.cost||0)*groundDimensions().data.meta.cellKm*GROUND_SCALE/red.speed+60;
 for(let i=0;i<Math.ceil(limit/.05)&&red.order;i++)step(.05);
 check('retireの隊は実地上ステップで拠点まで移動して止まる',dest&&red.pos.distanceTo(start)>GROUND_SCALE&&red.pos.distanceTo(dest)<.001&&!red.order);
 const at=red.pos.clone();npcGroundApply(c,npcGroundSituation(c),{tasks:[k]});for(let i=0;i<100;i++)step(.05);
 check('退避点へ着いたretireは待機し道路係にもならない',!red.order&&red.pos.distanceTo(at)<.001&&npcGroundRoadOrders(c,sit,{tasks:[k]}).size===0);
 return rows;
}
function logisticsCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 const red=fleets.find(f=>f.team===1&&f.groundKind==='vehicle'),other=fleets.find(f=>f.team===1&&f.groundKind==='infantry');
 fleets=[red,other];
 const site=(id,x,owner)=>({id,x,y:29,pos:groundPoint(x,29),radiusKm:1,captureRadius:GROUND_SCALE,owner,contested:false});
 groundSites=[site('H',7,1),site('T',17,1),site('X',25,0)];op={...op,groundHQ:{0:'X',1:'H'}};
 const nodes=[7,9,11,13,15,17,25].map(x=>({x,y:29,edges:[],rates:[0,0]}));
 const edges=nodes.slice(1).map((n,i)=>({a:i,b:i+1,path:[[nodes[i].x,29],[n.x,29]],x:(nodes[i].x+n.x)/2,y:29,open:true,owner:i===0?1:null,progress:[0,0],rates:[0,i===0?1:0]}));
 edges.forEach((e,i)=>{nodes[e.a].edges.push(i);nodes[e.b].edges.push(i);});
 groundSupplyNet={nodes,edges,sites:new Map(groundSites.map((s,i)=>[s,[0,5,6][i]])),revision:0,key:'logistics-test'};
 npcGroundInit();const c=npcGroundState.commanders.get(1),sit=npcGroundSituation(c);sit.contacts=[];
 const task=(type,stage,zone,units,from=null)=>({key:type+':'+zone,type,stage,zone,from,units:units.map(f=>({id:f.id,as:'main'}))});
 red.pos.copy(groundPoint(8,27));other.pos.copy(groundPoint(16,29));
 const hold=task('hold','wait','H',[red]),reserve=task('reserve','wait','H',[other]),plan={tasks:[hold,reserve]};
 let road=npcGroundRoadOrders(c,sit,plan);
 check('安全な守備・予備から道路係は1隊、未占領区間を本営側から選ぶ',road.size===1&&road.has(red.id)&&groundMapX(road.get(red.id).x)===10);
 red.pos.copy(road.get(red.id));const seconds=groundRoadCaptureSeconds(edges[1]);
 groundSupplyRoadCapture(seconds-.1);road=npcGroundRoadOrders(c,sit,plan);
 check('中立の占領秒数までは中点で止まる',groundMapX(road.get(red.id).x)===10&&edges[1].owner!==1);
 groundSupplyRoadCapture(.1);road=npcGroundRoadOrders(c,sit,plan);
 check('占領完了後に次の区間へ進む',edges[1].owner===1&&groundMapX(road.get(red.id).x)===12);
 sit.contacts=[{id:'visible',age:0}];check('敵が見えたら道路係を中断する',npcGroundRoadOrders(c,sit,plan).size===0);sit.contacts=[];
 hold.stage='defend';reserve.type='refit';check('脅威のある守備や再編から道路係を取らない',npcGroundRoadOrders(c,sit,plan).size===0);
 hold.stage='wait';reserve.type='reserve';red.pos.copy(groundPoint(8,27));road=npcGroundRoadOrders(c,sit,plan);
 edges.forEach(e=>e.owner=1);road=npcGroundRoadOrders(c,sit,plan);
 check('道路が全部自軍になれば元の位置へ戻る',road.get(red.id)?.distanceTo(groundPoint(8,27))<1e-8);
 npcGroundState.roadWork.clear();edges[2].owner=null;edges[3].owner=null;
 const seize=task('seize','advance','T',[red,other],'H');road=npcGroundRoadOrders(c,sit,{tasks:[seize]});
 check('主攻の先頭を止めず最後尾の地上隊だけが取る',road.size===1&&road.has(red.id)&&!road.has(other.id));
 check('主攻の地上隊が1隊なら先頭を道路で止めない',npcGroundRoadOrders(c,sit,{tasks:[task('seize','advance','T',[red],'H')]}).size===0);
 edges[2].open=false;edges[3].open=false;check('閉じた道路へ占領命令を出さない',npcGroundRoadOrders(c,sit,{tasks:[seize]}).size===0);
 // 供給円の縁と道路帯を横切る経路。実際のgroundSupplyAtで結果を確かめる。
 edges.forEach(e=>{e.owner=1;e.open=true;e.rates=[0,0];});red.pos.copy(groundPoint(20,29));
 let p=npcGroundRefitEntry(red,[red.pos,groundPoint(7,29)]);
 check('再編は本営の中心でなく補給円の手前の縁に止まる',p&&Math.abs(groundMapX(p.x)-8)<.001&&groundSupplyAt({team:1,pos:p}).rate>0);
 edges[3].rates[1]=.5;red.pos.copy(groundPoint(14,26));p=npcGroundRefitEntry(red,[red.pos,groundPoint(14,32),groundPoint(7,29)]);
 check('再編経路が最初に交差する補給道路帯を選ぶ',p&&Math.abs(groundMapY(p.z)-(29-groundRuleSet().capture.roadWidthKm/2))<.001&&groundSupplyAt({team:1,pos:p}).rate>0);
 edges[3].rates[1]=0;p=npcGroundRefitEntry(red,[red.pos,groundPoint(14,32),groundPoint(7,29)]);
 check('未補給の自軍道路は再編先にしない',p&&groundMapX(p.x)<8.1);
 red.pos.copy(groundPoint(7.5,29));p=npcGroundRefitEntry(red,[red.pos,groundPoint(7,29)]);
 check('すでに補給範囲内ならその場で再編する',p?.equals(red.pos));
 return rows;
}
// 平坦な固定場面。実際の命令・経路・斉射を使い、頭の再割当てから切り離す。
function tacticsCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok}),near=(a,b)=>Math.abs(a-b)<1e-7;
 op={...op,groundHQ:null,npc:{0:{doctrine:'earth',level:'standard'},1:{doctrine:'mars',level:'standard'}}};
 groundHeight=()=>0;groundHeightCacheReset();groundForests=[];groundBuildings=[];groundPass=()=>true;groundSupplyNet=null;
 groundSites=[{id:'H',x:6,y:29,pos:groundPoint(6,29),radiusKm:2,captureRadius:GROUND_SCALE*.3,owner:1},
  {id:'T',x:18,y:29,pos:groundPoint(18,29),radiusKm:2,captureRadius:GROUND_SCALE*.3,owner:null}];
 const unit=(team,kind,x,y=29,band='ground')=>{
  const f=makeFleet(team,{...groundUnitSpec(op.quick[0]),groundKind:kind,n:1,band,name:kind});f.pos.copy(groundPoint(x,y));f.band=band;f.pos.y=groundUnitHeight(f);
  f.groundVisible=[true,true];f.groundContacts=[];f.groundMorale=f.groundSupply=100;f.groundShotT=1000;return f;
 };
 const tank=unit(1,'vehicle',8),inf=unit(1,'infantry',8,30),heavy=unit(1,'heavyInfantry',8,28),air=unit(1,'attack',8,29,'low');
 const trucks=['apc','engineer','supply'].map((kind,i)=>unit(1,kind,7,28+i)),enemy=unit(0,'infantry',18),enemy2=unit(0,'vehicle',19);
 fleets=[tank,inf,heavy,air,...trucks,enemy,enemy2];npcGroundInit();const c=npcGroundState.commanders.get(1);
 const sit=npcGroundSituation(c),task=(type,stage,group)=>({key:type+':T',type,stage,zone:'T',from:'H',units:group.map(f=>({id:f.id,as:'main'}))});
 const advance=task('seize','advance',[tank,inf,heavy]);
 const destinations=advance.units.map((x,i)=>npcGroundDestination(c,sit,advance,x,i,3));
 check('前進は手前r+1kmを中心に横1.5km間隔、全隊が影響円外',destinations.every(p=>near(groundMapX(p.x),15)&&groundDistanceTo({pos:p},groundSites[1])>2*GROUND_SCALE)&&near(destinations[0].distanceTo(destinations[1])/GROUND_SCALE,1.5)&&near(destinations[1].distanceTo(destinations[2])/GROUND_SCALE,1.5));
 const diagonal={...sit,zones:sit.zones.map(z=>z.id==='H'?{...z,x:10,z:21}:z)},dp=npcGroundDestination(c,diagonal,advance,advance.units[1],1,3);
 check('斜めの前進もfromから目標への向きで手前に置く',near(groundMapX(dp.x),18-3/Math.sqrt(2))&&near(groundMapY(dp.z),29-3/Math.sqrt(2)));
 groundPass=(x,y)=>x>=17.5;const corrected=npcGroundDestination(c,sit,advance,advance.units[1],1,3);check('通行補正でも前進先を影響円内へ入れない',corrected&&groundMapX(corrected.x)>=17.5&&groundDistanceTo({pos:corrected},groundSites[1])>2*GROUND_SCALE);groundPass=()=>true;
 const fix=task('fix','pin',[heavy]),fp=npcGroundDestination(c,sit,fix,fix.units[0],0,1);
 check('助攻は拘束でも直射射程の8割で止まる',near(groundMapX(fp.x),18-groundFireRanges(heavy).direct/GROUND_SCALE*.8));
 let calls=0;const original=order;order=(...args)=>{calls++;return original(...args);};
 const assault=task('seize','assault',[tank,inf,heavy,...trucks]);npcGroundApply(c,sit,{tasks:[assault]});
 check('突入では占拠担当を含む武装全隊が最寄りの敵を攻撃', [tank,inf,heavy].every(f=>f.order?.type==='attack'&&f.order.target===enemy));
 check('輸送車・工兵・補給は突入でも攻撃の位置に残る',trucks.every(f=>f.order?.type==='move'&&near(groundMapX(f.order.dest.x),15)));
 const first=calls;enemy2.pos.copy(groundPoint(16,29));npcGroundApply(c,sit,{tasks:[assault]});
 check('より近い敵が来ても生存・可視の攻撃命令を出し直さない',calls===first&&tank.order.target===enemy);
 enemy.groundVisible[1]=false;npcGroundApply(c,sit,{tasks:[assault]});check('見失った攻撃先から次の見える敵へ切り替える',tank.order.target===enemy2&&inf.order.target===enemy2);
 enemy2.alive=false;enemy.groundVisible[1]=true;npcGroundApply(c,sit,{tasks:[assault]});check('死亡した攻撃先は選ばない',tank.order.target===enemy);
 enemy.groundVisible[1]=false;npcGroundApply(c,sit,{tasks:[assault]});
 check('敵が見えなければ占拠隊は占拠円、ほかの武装隊は1km以内へ分散',inf.order?.type==='move'&&groundDistanceTo({pos:inf.order.dest},groundSites[1])<groundSites[1].captureRadius&&[tank,heavy].every(f=>f.order?.type==='move'&&groundDistanceTo({pos:f.order.dest},groundSites[1])<=GROUND_SCALE)&&!tank.order.dest.equals(heavy.order.dest));
 enemy.alive=true;enemy.groundVisible[1]=true;enemy.pos.copy(groundPoint(20.9,29));npcGroundApply(c,sit,{tasks:[assault]});
 check('攻撃候補は影響半径rの1.5倍までを含む',tank.order.target===enemy);
 enemy.pos.copy(groundPoint(21.01,29));tank.order=inf.order=heavy.order=null;npcGroundApply(c,sit,{tasks:[assault]});check('rの1.5倍の外にいる敵は新しい攻撃先にしない',tank.order?.type==='move');
 // 守備の配置、射程、視界と追撃境界。
 const hold=task('hold','wait',[inf,tank,heavy]);npcGroundApply(c,sit,{tasks:[hold]});
 const homes=[inf,tank,heavy].map(f=>f.order.dest.clone());
 check('守備の占拠隊は占拠円、ほかは異なる位置で中心1km以内',groundDistanceTo({pos:homes[0]},groundSites[1])<groundSites[1].captureRadius&&homes.slice(1).every(pos=>groundDistanceTo({pos},groundSites[1])<=GROUND_SCALE+1e-7)&&!homes[1].equals(homes[2]));
 [inf,tank,heavy].forEach((f,i)=>{f.pos.copy(homes[i]);});enemy.pos.copy(groundPoint(18.9,29));hold.stage='defend';npcGroundApply(c,sit,{tasks:[hold]});
 check('脅威時は占拠隊も直射射程の1.5倍以内の可視敵を攻撃',inf.order?.target===enemy&&tank.order?.target===enemy);
 const repeated=calls;npcGroundApply(c,sit,{tasks:[hold]});check('守備の攻撃命令も同じ敵へ出し直さない',calls===repeated);
 enemy.groundVisible[1]=false;npcGroundHoldStep();check('思考間隔を待たず見失った敵から元の守備位置へ戻す',inf.order?.type==='move'&&inf.order.dest.equals(homes[0])&&tank.order.dest.equals(homes[1]));
 enemy.groundVisible[1]=true;enemy.pos.copy(groundPoint(19.21,29));npcGroundApply(c,sit,{tasks:[hold]});check('歩兵の直射射程1.5倍の外へは攻撃命令を出さない',inf.order?.type==='move');
 enemy.pos.copy(groundPoint(19.9,29));npcGroundApply(c,sit,{tasks:[hold]});tank.order.path={points:[tank.pos.clone(),groundPoint(21,29),enemy.pos.clone()]};
 check('敵が円内でも、円外を通る追撃経路は進まない',!npcGroundHoldChase(tank,enemy));
 tank.order.path={points:[tank.pos.clone(),enemy.pos.clone()]};check('円内だけを通る追撃経路は使える',npcGroundHoldChase(tank,enemy));
 enemy.pos.copy(groundPoint(20.01,29));check('敵が影響円から出た瞬間に追撃を止める',!npcGroundHoldChase(tank,enemy));npcGroundHoldStep();check('円外の敵は射程内なら攻撃を保ち、追撃はしない',tank.order?.type==='attack'&&!npcGroundHoldChase(tank,enemy));enemy.pos.copy(groundPoint(25,29));npcGroundHoldStep();check('交戦範囲を離れた敵から元の守備位置へ戻る',tank.order?.type==='move'&&tank.order.dest.equals(homes[1]));
 enemy.pos.copy(groundPoint(20.1,29));npcGroundApply(c,sit,{tasks:[hold]});check('円外の敵も直射射程1.5倍以内なら攻撃命令を出す',heavy.order?.target===enemy&&!npcGroundHoldChase(heavy,enemy));
 hold.stage='wait';npcGroundApply(c,sit,{tasks:[hold]});check('脅威のないwaitでは攻撃命令を出さない',tank.order?.type==='move');
 // syncSpeedは既存の実移動でも使う。航空・別任務を含めない。
 advance.units.push({id:air.id,as:'main'});tank.speed=4;inf.speed=2;heavy.speed=3;air.speed=8;
 npcGroundApply(c,sit,{tasks:[advance]});check('前進中の同任務地上隊は最も遅い速度、航空は同期しない',[tank,inf,heavy].every(f=>f.syncSpeed===2)&&air.syncSpeed==null);
 op={...op,groundHQ:{1:'H'}};inf.groundSupply=0;
 npcGroundApply(c,sit,{tasks:[advance]});check('補給による減速も含めて実速度を同期する',near(speedOf(tank),speedOf(inf))&&near(speedOf(heavy),speedOf(inf)));op={...op,groundHQ:null};
 npcGroundApply(c,sit,{tasks:[advance]});check('前進の再判断で同期速度を累積減速しない',tank.syncSpeed===2);
 const start=tank.pos.clone();groundFollow(tank,.1);check('実経路の移動もsyncSpeedで進む',near(tank.pos.distanceTo(start),.2));
 npcGroundApply(c,sit,{tasks:[assault]});check('前進を終えたらsyncSpeedを消す',[tank,inf,heavy].every(f=>f.syncSpeed===null));
 npcGroundApply(c,sit,{tasks:[advance]});npcGroundApply(c,sit,{tasks:[]});check('任務を外れた隊のsyncSpeedを消す',[tank,inf,heavy].every(f=>f.syncSpeed===null));
 npcGroundApply(c,sit,{tasks:[advance]});npcGroundReset();check('再初期化でも以前のsyncSpeedを消す',tank.syncSpeed===null);
 order=original;
 // 火力支援は両軍、単独目標、射程、装填、味方巻き込み、通常ステップの別経路を確認。
 for(const team of [0,1])for(const kind of ['artillery','guidedRocket']){
  const gun=unit(team,kind,5),main=unit(team,'vehicle',10),foe=unit(1-team,'infantry',18),friend=unit(team,'infantry',8,33);
  fleets=[gun,main,foe,friend];npcGroundInit();const commander=npcGroundState.commanders.get(team),s=npcGroundSituation(commander);
  const k=task('seize','advance',[main]);k.units.push({id:gun.id,as:'support'});
  const resetShot=()=>{groundVolleyCancel(gun);groundStrikes=[];gun.groundStrikeCooldown=0;};
  npcGroundApply(commander,s,{tasks:[k]});check(team+'軍 '+kind+' は目標円内の単独可視敵へ斉射',groundStrikes.length===1&&groundStrikes[0].source===gun&&groundStrikes[0].aim.x===foe.pos.x);
  const count=groundStrikes.length;npcGroundSupportFire(commander,k,s.zones.find(z=>z.id==='T'));check(team+'軍 '+kind+' は装填・斉射中に重ね撃ちしない',groundStrikes.length===count);
  resetShot();gun.groundStrikeCooldown=1;npcGroundSupportFire(commander,k,s.zones.find(z=>z.id==='T'));check(team+'軍 '+kind+' は装填中なら斉射なしでも撃たない',groundStrikes.length===0);gun.groundStrikeCooldown=0;friend.pos.copy(foe.pos);npcGroundSupportFire(commander,k,s.zones.find(z=>z.id==='T'));check(team+'軍 '+kind+' は味方のいる着弾円を撃たない',groundStrikes.length===0);
  friend.pos.copy(groundPoint(8,33));foe.groundVisible[team]=false;npcGroundSupportFire(commander,k,s.zones.find(z=>z.id==='T'));check(team+'軍 '+kind+' は未観測の敵を撃たない',groundStrikes.length===0);
  foe.groundVisible[team]=true;foe.pos.copy(groundPoint(14,29));npcGroundSupportFire(commander,k,s.zones.find(z=>z.id==='T'));check(team+'軍 '+kind+' は任務外で主攻から3km超の敵を撃たない',groundStrikes.length===0);
  foe.pos.copy(groundPoint(13,29));npcGroundSupportFire(commander,k,s.zones.find(z=>z.id==='T'));check(team+'軍 '+kind+' は目標円外でも主攻から3km以内を撃つ',groundStrikes.length===1);
  resetShot();gun.pos.copy(foe.pos).add(new THREE.Vector3(-groundStrikeRange(gun).max-.01,0,0));npcGroundSupportFire(commander,k,s.zones.find(z=>z.id==='T'));check(team+'軍 '+kind+' は射程外を撃たない',groundStrikes.length===0);
 }
 // team 1の旧密集砲撃と自動交戦も安全判定を迂回しない。
 const gun=unit(1,'artillery',5),foe=unit(0,'infantry',18),second=unit(0,'vehicle',18.1),friend=unit(1,'infantry',18.2);
 fleets=[gun,foe,second,friend];npcGroundInit();for(const commander of npcGroundState.commanders.values())commander.nextThink=Infinity;
 groundStrikes=[];gun.groundShotT=0;groundStep(.05);check('通常ステップの密集砲撃・自動間接射撃が味方付近へ迂回発射しない',groundStrikes.length===0);
 const guard=unit(1,'infantry',19.5),runner=unit(0,'infantry',20.5);runner.stance='evade';fleets=[guard,runner];npcGroundInit();
 const defense=task('hold','defend',[guard]);npcGroundApply(npcGroundState.commanders.get(1),npcGroundSituation(npcGroundState.commanders.get(1)),{tasks:[defense]});
 for(const commander of npcGroundState.commanders.values())commander.nextThink=Infinity;
 const post=guard.pos.clone();for(let i=0;i<10;i++)groundStep(.05);
 check('実地上ステップも円外の敵を追わず守備位置を維持する',guard.order?.type==='attack'&&guard.order.target===runner&&guard.pos.equals(post));

 return rows;
}
// 同じ確認をNodeの実地上処理とブラウザで実行する。時計はゲーム秒で進める。
function autoCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 const originalAuto=autoMode,originalReturn=npcAutoReturn;
 autoMode=false;npcGroundInit();check('オート前には軍0の指揮官がいない',!npcGroundState.commanders.has(0));
 autoMode=true;npcAutoToggle();const c=npcGroundState.commanders.get(0);
 check('オート開始で連合・標準の軍0指揮官を作る',c?.debugAuto&&c.D===WOS_DATA.npc.doctrines.earth&&c.L===WOS_DATA.npc.levels.standard);
 npcGroundStep();check('軍0へ任務と命令が出る',!!c.plan&&fleets.some(f=>f.team===0&&f.order));
 const f=fleets.find(f=>f.team===0&&f.alive&&f.groundKind==='infantry'),z=groundSites[0];
 select(f);groupOrder({type:'move',dest:z.pos.clone()});const commanded=f.order,full=WOS_DATA.npc.power.ground[f.groundKind];
 let sit=npcGroundSituation(c);
 check('画面の命令だけを先導へ渡し、自軍の命令対象から外す',npcAutoPlayerUnit(f)&&!sit.units.some(u=>u.id===f.id)&&sit.lead.units.some(u=>u.id===f.id&&u.to===z.id)&&c.side==='ally');
 npcGroundApply(c,sit,{tasks:[{key:'hold:'+z.id,type:'hold',zone:z.id,stage:'wait',units:[{id:f.id,as:'main'}]}]});
 check('古い任務を渡してもプレイヤーの命令を上書きしない',f.order===commanded);
 f.hpPool*=.4;sit=npcGroundSituation(c);check('初期の力は損害前、先導の力は損害後',sit.lead.full===full&&Math.abs(sit.lead.units[0].power-full*.4)<1e-8);f.hpPool/=.4;
 const other=fleets.find(x=>x.team===0&&x!==f&&x.alive&&!x.embarked);order(other,{type:'move',dest:other.pos.clone()});
 check('低層orderの自動命令はプレイヤーの隊にならない',!npcAutoPlayerUnit(other));
 f.order=null;f.queue=[{type:'move',dest:z.pos.clone()}];gameSec+=50;npcGroundAutoSync();check('予約がある間は戻らない',npcAutoPlayerUnit(f));
 f.queue=[];npcGroundAutoSync();gameSec+=19.99;npcGroundAutoSync();check('無命令19.99秒では戻らない',npcAutoPlayerUnit(f));
 gameSec+=.01;npcGroundAutoSync();sit=npcGroundSituation(c);check('無命令20秒で戻り制限なしへ切り替わる',!npcAutoPlayerUnit(f)&&sit.units.some(u=>u.id===f.id)&&c.side==='foe'&&!sit.lead);
 npcAutoPlayer([f]);npcAutoReturn=false;f.order=null;f.queue=[];npcGroundAutoSync();gameSec+=60;npcGroundAutoSync();check('自動復帰オフでは20秒を超えても戻さない',npcAutoPlayerUnit(f));
 f.groundPlan={dest:z.pos.clone()};npcAutoReturn=true;npcGroundAutoSync();gameSec+=30;npcGroundAutoSync();check('未実行の進撃計画も予約として扱う',npcAutoPlayerUnit(f));f.groundPlan=null;
 const oldOrder={type:'move',dest:z.pos.clone()};f.order=oldOrder;autoMode=false;npcAutoToggle();check('オート解除は指揮官と所有だけを外し現在命令を保つ',!npcGroundState.commanders.has(0)&&!npcAutoPlayerUnit(f)&&f.order===oldOrder);
 autoMode=true;npcAutoToggle();check('再度オンで指揮官を作り直す',npcGroundState.commanders.get(0)!==c&&npcGroundState.auto.players.size===0);
 // 通信は任務開始と状態変更だけ。任務の継続や30秒未満の同文を出さない。
 const savedLog=logEvent,messages=[];logEvent=text=>messages.push(text);const commander={side:'ally'},radio={};
 const radioSit={zones:[{id:'T',name:'拠点T'}]},task=(type,why='')=>({key:type+':T',type,zone:'T',stage:'wait',why,units:[{id:f.id}]});
 const plan={lead:{mode:'follow'},tasks:[task('hold','引き継いで守る'),task('fix'),task('seize'),task('reserve'),task('refit'),task('recon')]};
 npcAllyCommunicate(radio,commander,radioSit,plan);npcAllyCommunicate(radio,commander,radioSit,plan);
 check('友軍の任務の通信文（予備・再編・偵察は出さない）',messages.join('|')==='友軍: 拠点Tを引き継ぐ|友軍: 拠点Tへの攻撃を支援する|友軍: 拠点Tを確保する');
 npcAllyCommunicate(radio,commander,radioSit,{lead:{mode:'rescue'},tasks:[task('hold')]});npcAllyCommunicate(radio,commander,radioSit,{lead:{mode:'quiet'},tasks:[]});
 check('友軍の状態通信と通常の保持文',messages.includes('友軍: 支援に入る')&&messages.includes('友軍: 残敵は任せる')&&messages.includes('友軍: 拠点Tを保持する'));
 npcAllyCommunicate(radio,commander,radioSit,{tasks:[]});npcAllyCommunicate(radio,commander,radioSit,plan);check('任務再開でも同文30秒未満は抑制',messages.length===6);
 gameSec+=30;npcAllyCommunicate(radio,commander,radioSit,{tasks:[]});npcAllyCommunicate(radio,commander,radioSit,plan);check('30秒後の任務再開では再通知できる',messages.length===9);logEvent=savedLog;
 autoMode=false;npcAutoToggle();npcGroundSplit(.5);const leader=npcGroundState.commanders.get(0);
 // 分割道具は明示した通常指揮官を使うので、ここでは作戦へ軍0を付けて確認。
 if(!leader){op={...op,npc:{...op.npc,0:{doctrine:'earth',level:'standard'}}};npcGroundInit();npcGroundSplit(.5);}
 const lead=npcGroundState.commanders.get(0),ally=npcGroundState.commanders.get('0:ally'),leadId=[...lead.unitIds][0],target=groundSites.at(-1).id;
 lead.plan={tasks:[{type:'seize',stage:'assemble',zone:target,from:groundSites[0].id,units:[{id:leadId}]}]};
 sit=npcGroundSituation(ally);check('同じ軍の2指揮官は隊を重複させず、集結中も目標拠点を先導toに渡す',!sit.units.some(u=>lead.unitIds.has(u.id))&&sit.lead.units.find(u=>u.id===leadId).to===target&&ally.leadFull>0);
 autoMode=false;npcGroundReset();op={...op,npc:{1:op.npc[1]},npcAuto:{doctrine:'mars',level:'hard'}};autoMode=true;npcAutoPlayer([f]);check('作戦のnpcAuto上書きと最初のステップ前の手動命令',npcGroundState.commanders.get(0).D===WOS_DATA.npc.doctrines.mars&&npcGroundState.commanders.get(0).L===WOS_DATA.npc.levels.hard&&npcAutoPlayerUnit(f));
 autoMode=originalAuto;npcAutoReturn=originalReturn;npcGroundReset();return rows;
}
function nodeChecks(){
 const {run}=require('./ground-drill.cjs').createDrillContext(false);
 const movement=run(`(()=>{
   const start=new Map(fleets.filter(f=>f.team===1).map(f=>[f.id,f.pos.clone()]));
   for(let i=0;i<80&&!over;i++)step(.05);
   const tasks=npcDebug()[1].plan.tasks.filter(k=>['seize','recon','cut'].includes(k.type));
   const moves=tasks.flatMap(k=>k.units.map(x=>({f:fleets.find(f=>f.id===x.id),k}))).filter(({f})=>f&&start.get(f.id).distanceTo(f.pos)>GROUND_SCALE);
   return {name:'通常演習で敵が動き出し任務の拠点へ近づく',ok:moves.some(({f,k})=>{const s=groundSites.find(s=>s.id===k.zone);return s.pos.distanceTo(f.pos)<s.pos.distanceTo(start.get(f.id));})};
 })()`);
 const auto=require('./ground-drill.cjs').createDrillContext(false);auto.ctx.selGroup=null;
 const bridge=run('('+bridgeCases.toString()+')()');
 const retire=require('./ground-drill.cjs').createDrillContext(false).run('('+retireCases.toString()+')()');
 const logistics=require('./ground-drill.cjs').createDrillContext(false).run('('+logisticsCases.toString()+')()');
 const tactics=require('./ground-drill.cjs').createDrillContext(false);
 // 実ゲームのspeedOfを読み、同期を無視する土台のstubから差し替える。
 const sim=require('node:fs').readFileSync(require('node:path').join(__dirname,'../battle/sim.js'),'utf8');
 tactics.run(sim.slice(sim.indexOf('function speedOf('),sim.indexOf('function speedOf(')+sim.slice(sim.indexOf('function speedOf(')).indexOf('\n')));
 return [movement,...auto.run('('+autoCases.toString()+')()'),...bridge,...retire,...logistics,...tactics.run('('+tacticsCases.toString()+')()')];
}
async function checkNpcGround(page,check){
 await page.evaluate(()=>{const data=WOS_DATA.operations.find(o=>o.id==='baikonur');reset({op:'baikonur',fleets:data.quick});if(talking)endTalk();setSpeed(0);endDeploy();});
 const movement=await page.evaluate(()=>{
  const start=new Map(fleets.filter(f=>f.team===1).map(f=>[f.id,f.pos.clone()]));
  for(let i=0;i<200&&!over;i++)step(.05);
  const c=npcGroundState.commanders.get(1),sit=npcGroundSituation(c),tasks=c.plan.tasks.filter(k=>['seize','recon','cut'].includes(k.type));
  const moves=tasks.flatMap(k=>k.units.map(x=>({f:fleets.find(f=>f.id===x.id),k}))).filter(({f})=>f&&start.get(f.id).distanceTo(f.pos)>GROUND_SCALE);
  return {moved:moves.length,heading:moves.some(({f,k})=>{const z=sit.zones.find(z=>z.id===k.zone);return groundPoint(z.x,z.z).distanceTo(f.pos)<groundPoint(z.x,z.z).distanceTo(start.get(f.id));}),debug:npcDebug()};
 });
 check(movement.moved>0&&movement.heading,'NPC演習: 敵が動き出し任務の拠点へ近づく',JSON.stringify(movement));
 for(const r of await page.evaluate(autoCases))check(r.ok,'NPCオート: '+r.name);
 await page.evaluate(()=>{reset({op:'baikonur',fleets:op.quick});if(talking)endTalk();setSpeed(0);endDeploy();});
 for(const r of await page.evaluate(bridgeCases))check(r.ok,'NPC橋渡し: '+r.name);
 for(const id of ['groundExercise2','shinano']){
  const ok=await page.evaluate(id=>{reset({op:id});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();let calls=0;const original=npcThink;npcThink=(...args)=>{calls++;return original(...args);};for(let i=0;i<80&&!over;i++)step(.05);npcThink=original;return calls===0&&Object.keys(npcDebug()).length===0;},id);
  check(ok,'NPC無効: '+id+'で頭を呼ばずdebugが空');
 }
}
// 実際のメニューボタン・方針ボタン・部隊一覧・デバッグ保存を確認する（Claude実行用）。
async function checkNpcAuto(page,check){
 // メニューのオート切替は保存値どおりに body の dbg-battle を付け直すので、デバッグのボタンを押す前に毎回付ける
 const clickDbg=async sel=>{await page.evaluate(()=>document.body.classList.add('dbg-battle'));await page.click(sel);};
 // 全体のテスト（tests/smoke.cjs）は台本どおりの要塞を確かめるため WOS_NO_NPC を立てている。この確認のあいだだけ外す。
 const saved=await page.evaluate(()=>{const v={debug:localStorage.getItem('wos.debug'),auto:autoMode,ret:npcAutoReturn,battle:document.body.classList.contains('dbg-battle'),noNpc:window.WOS_NO_NPC};window.WOS_NO_NPC=false;return v;});
 try{
  for(const id of ['baikonur','charybdis']){
   await page.evaluate(id=>{WOS_MENU.setAuto(false);WOS_MENU.setAutoReturn(true);WOS.start({op:id,tutorial:false});if(talking)endTalk();endDeploy();setSpeed(0);document.body.classList.add('dbg-battle');openPause();},id);
   await clickDbg('#pause [data-pm="auto"]');
   check(await page.evaluate(()=>npcAutoState().commanders.get(0)?.debugAuto&&JSON.parse(localStorage.getItem('wos.debug')).auto),'NPCオート '+id+': メニューから軍0を追加・保存');
   await page.click('#pause [data-pm="resume"]');
   const first=await page.evaluate(()=>{for(let i=0;i<12;i++)step(.05);const c=npcAutoState().commanders.get(0);return !!c.plan&&fleets.some(f=>f.team===0&&(f.order||f.npcTask));});
   check(first,'NPCオート '+id+': 開始後に自軍が命令を受ける');
   await page.evaluate(()=>{const f=fleets.find(f=>f.team===0&&f.alive&&!f.embarked&&(!op.ground||f.groundKind==='infantry'));select(f);groupOrder({type:'move',dest:f.pos.clone().add(new THREE.Vector3(2,0,2))});});
   await page.click('#stance [data-st="evade"]');
   check(await page.evaluate(()=>{const f=selected,state=npcAutoState(),c=state.commanders.get(0),sit=op.ground?npcGroundSituation(c):npcSpaceSituation(c),old=f.order;gameSec+=3;if(op.ground)npcGroundStep();else{npcSpaceStep();enemyAI();}updateRoster();return f.order===old&&f.stance==='evade'&&sit.lead.units.some(u=>u.id===f.id)&&!sit.units.some(u=>u.id===f.id)&&f.btn.querySelector('.no small').textContent.includes('手動');}),'NPCオート '+id+': 画面の移動・方針指定を保護し手動と表示');
   await page.evaluate(()=>openPause());
   await clickDbg('#pause [data-pm="autoReturn"]');
   check(await page.evaluate(()=>{const f=selected;f.order=null;f.queue=[];npcAutoToggle();gameSec+=21;npcAutoToggle();return npcAutoPlayerUnit(f)&&!npcAutoReturn&&JSON.parse(localStorage.getItem('wos.debug')).autoReturn===false;}),'NPCオート '+id+': 復帰オフを保存し20秒後も所有を保つ');
   await clickDbg('#pause [data-pm="autoReturn"]');
   check(await page.evaluate(()=>{npcAutoToggle();return !npcAutoPlayerUnit(selected)&&npcAutoReturn;}),'NPCオート '+id+': 復帰オンで待機した隊を戻す');
   await page.evaluate(()=>{window.npcAutoCheckOrder=selected.order={type:'move',dest:selected.pos.clone()};});await clickDbg('#pause [data-pm="auto"]');
   check(await page.evaluate(()=>!npcAutoState().commanders.has(0)&&selected.order===window.npcAutoCheckOrder),'NPCオート '+id+': オフでも現在命令を継続');
   await page.click('#pause [data-pm="resume"]');
  }
 }finally{
  await page.evaluate(saved=>{window.WOS_NO_NPC=saved.noNpc;autoMode=saved.auto;npcAutoReturn=saved.ret;WOS_MENU.setAuto(saved.auto);WOS_MENU.setAutoReturn(saved.ret);document.body.classList.toggle('dbg-battle',saved.battle);if(saved.debug===null)localStorage.removeItem('wos.debug');else localStorage.setItem('wos.debug',saved.debug);delete window.npcAutoCheckOrder;npcAutoToggle();},saved);
 }
}
module.exports={nodeChecks,checkNpcGround,bridgeCases,autoCases,checkNpcAuto};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'✓ ':'✗ ')+r.name);assert(rows.every(r=>r.ok));}
