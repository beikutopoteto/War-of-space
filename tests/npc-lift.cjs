/* 輸送の状況入力と通常命令。規則・地形・既存の期待値は変更しない。 */
const {createGroundContext}=require('./ground-landing.cjs');
function liftCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 op=WOS_DATA.operations.find(o=>o.id==='groundLiftExercise');
 groundSites=op.groundSites.map(spec=>{const z=groundData().sites.find(z=>z.id===spec.site);return {...z,owner:spec.owner,pos:groundPoint(z.x,z.y),captureRadius:GROUND_SCALE*.3,progress:[0,0]};});
 groundHud=()=>{};fleets=[...op.quick.map(u=>makeFleet(0,groundUnitSpec(u))),...op.enemies.map(u=>makeFleet(1,groundUnitSpec(u)))];groundSeaDeploy();
 for(const f of fleets){f.band=f.band||'ground';f.groundVisible=[true,true];f.groundContacts=[null,null];f.groundMaxHp=f.hpPool;groundSupplyInitUnit(f);}
 groundTransportInit();groundSupplyBuild();npcGroundInit();
 const c=npcGroundState.commanders.get(1),ship=fleets.find(groundLandingShip),eng=fleets.find(f=>f.team===1&&f.groundKind==='engineer'),stock=fleets.find(f=>f.team===1&&f.groundKind==='supply');
 const links=npcGroundLiftLinks(),gap=links.find(l=>l.way==='gap'),sea=links.filter(l=>l.way==='sea');
 check('exercise2の東分流にgap 1本、D・H・G間にsea 3本',links.filter(l=>l.way==='gap').length===1&&sea.length===3&&gap.bridge.river==='east'&&Math.hypot(gap.bridge.x-24.2,gap.bridge.y-11)<.11);
 check('候補は地形だけの架橋判定を通り、既存渡河点から離れる',!groundBridgeTerrain(gap.bridge.x,gap.bridge.y).reason&&![...groundData().objects.bridges,...groundData().objects.fords].some(p=>p.river===gap.bridge.river&&Math.hypot(p.x-gap.bridge.x,p.y-gap.bridge.y)<.9));
 check('架橋前の見積もり＋規範の6kmが既存の道路より短い',gap.len+c.D.lift.gap<npcGroundLinks().find(l=>[l.a,l.b].includes('D')&&[l.a,l.b].includes('H')).len);
 check('満載でもliftは搭載上限、工兵・揚陸艦・補給にcan',npcGroundLiftUnit(ship).lift===groundLandingRules().capacity&&groundPassengers(ship).length===2&&npcGroundLiftUnit(ship).can==='ferry'&&npcGroundLiftUnit(eng).can==='bridge'&&npcGroundLiftUnit(stock).can==='supply');
 const cargo=groundPassengers(ship),savedBuilding=eng.groundBuilding;
 eng.groundBuilding=true;check('搭乗・建設・上陸はbusyで命令不可',npcGroundLiftUnit(cargo[0]).busy&&npcGroundLiftUnit(eng).busy&&npcGroundLiftUnit(eng).free===false);eng.groundBuilding=savedBuilding;
 ship.groundUnloading={progress:0};check('上陸中の艦もbusy',npcGroundLiftUnit(ship).busy);ship.groundUnloading=null;
 groundBridges.push({...gap.bridge,complete:true,hp:100});groundBridgeRevision++;
 check('橋の完成でgapが開く',npcGroundLiftLinks().find(l=>l.way==='gap').open);
 groundBridges=[];groundBridgeRevision++;
 check('橋が落ちると同じgapが閉じる',!npcGroundLiftLinks().find(l=>l.way==='gap').open);
 op={...op,npcLift:false};const legacy=npcGroundSituation(c);
 check('明示しない作戦には輸送リンク・can・busyを追加しない',legacy.links.every(l=>!l.way)&&legacy.units.every(u=>!('can'in u)&&!('busy'in u)));op={...op,npcLift:true};
 // 既存の頭へ搭載上限を渡せば、満載のbusy任務はseaのまま続く。頭の変更は不要。
 const N=WOS_DATA.npc,commander=npcCommander({team:1,doctrine:N.doctrines.earth,level:N.levels.standard,seed:1});
 const situation={time:0,zones:[['A',0,0,'own','own'],['B',10,0,'own'],['C',20,0,'foe'],['D',20,12,'foe'],['F',30,0,'foe','foe']].map(([id,x,z,owner,base])=>({id,x,z,r:2,owner,known:owner,seen:true,base,goal:id==='D',final:id==='F'})),
  links:[{a:'A',b:'B',len:10},{a:'B',b:'C',len:10},{a:'C',b:'F',len:10},{a:'D',b:'F',len:10},{a:'B',b:'D',len:14,way:'sea'}],
  units:Array.from({length:20},(_,i)=>({id:'u'+i,role:i%3===0?'shock':'line',power:1,x:10,z:0,speed:.3,canHold:i%3!==0,health:1,morale:1,supply:1,free:true})),contacts:[{id:'e',x:20,z:0,power:8,age:0}],goal:{type:'seize'}};
 situation.units.push({id:'boat',role:'fires',power:2,x:10,z:4,speed:.2,canHold:false,health:1,morale:1,supply:1,free:true,can:'ferry',lift:npcGroundLiftUnit(ship).lift});
 const first=npcThink(commander,situation).tasks.find(k=>k.via==='sea');
 for(const u of situation.units)if(first.units.some(x=>x.id===u.id)){u.free=false;u.busy=true;}
 situation.time=3;const next=npcThink(commander,situation).tasks.find(k=>k.key===first.key);
 check('満載・busyでも頭のvia seaと全乗員の任務が続く',next?.via==='sea'&&first.units.every(x=>next.units.some(u=>u.id===x.id)));
 // 初期搭載分を主攻へ結び付け、搭載中は次の判断でも所属を維持する。
 const sit=npcGroundSituation(c);npcThink(c,sit);
 const task={key:'seize:H',type:'seize',zone:'H',from:'D',stage:'advance',via:'sea',link:['D','H'],units:[{id:ship.id,as:'lift'}]};
 npcGroundLiftOrders(c,sit,{tasks:[task]});
 check('初期搭載の2隊は揚陸艦の任務に所属する',cargo.every(f=>c.unit.get(f.id).task===task.key&&task.units.some(x=>x.id===f.id&&x.as==='main')&&npcGroundLiftUnit(f).busy));
 // 実在する海の経路の直射円を避ける。見えていない敵は危険円に入れない。
 const threats=[{pos:groundPoint(27,4),range:GROUND_SCALE*2}],start={pos:groundPoint(23,4)},dest=groundPoint(31,4),via=npcGroundLiftSafePath(start,dest,threats);
 check('直射の射程を避ける海の経由点を作る',via&&via.length>0&&via.every(p=>!npcGroundLiftDanger(p,threats)));
 ship.pos.copy(start.pos);npcGroundLiftMove(ship,dest,[]);const directOrder=ship.order;npcGroundLiftMove(ship,dest,via);
 check('同じ目的地でも安全な経由点が変われば移動を出し直す',ship.order!==directOrder&&ship.order.via.length===via.length);
 const invisible=fleets.find(f=>f.team===0);invisible.groundVisible[1]=false;
 check('見えていない敵の現在位置を危険円に使わない',!npcGroundLiftThreats(1).some(t=>t.f===invisible));
 const beachThreat=[{pos:groundSites.find(z=>z.id==='H').pos.clone(),range:GROUND_SCALE*2}];const alternative=npcGroundLiftPort(ship,'H',beachThreat);
 check('敵の直射が届く浜を避けて別の浜を選ぶ',alternative&&alternative.land.every(p=>!npcGroundLiftDanger(p,beachThreat,true)));
 // 上陸中に見える敵が現れたら、実際の移動命令で中止して沖へ出る。
 const originalFleets=fleets.slice();
 const coast=npcGroundLiftState().ports.get('D')[0];ship.pos.copy(coast.water);ship.groundUnloading={progress:2};invisible.groundVisible[1]=true;invisible.pos.copy(coast.land[0]);fleets=[ship,...cargo,invisible];npcGroundLiftWatch();
 check('敵出現で上陸を中止し搭載を保って沖への移動を命じる',!ship.groundUnloading&&cargo.every(f=>f.embarked===ship)&&ship.order?.type==='move'&&!groundCoastCells({pos:ship.order.dest}).length);
 fleets=originalFleets;
 // 輸送車の実コマンドと、降車後30秒の再乗車禁止。
 const infantry=fleets.find(f=>f.team===1&&f.groundKind==='infantry'&&!f.embarked),truck=fleets.find(f=>f.team===1&&f.groundKind==='apc');
 fleets=[infantry,truck];for(const f of fleets){groundClearOrders(f);f.pos.copy(groundPoint(26,20));f.pos.y=groundUnitHeight(f);f.groundRout=null;}
 npcGroundInit();const cc=npcGroundState.commanders.get(1),k={key:'seize:H',type:'seize',zone:'H',from:'D',stage:'advance',units:[{id:infantry.id,as:'main'},{id:truck.id,as:'support'}]};
 npcGroundLiftOrders(cc,npcGroundSituation(cc),{tasks:[k]});let state=npcGroundLiftState(),ride=state.trucks.get(truck.id);
 check('同じ任務で残り経路6km以上なら実際の搭乗命令',!!ride&&infantry.order?.type==='board');
 if(ride){groundCancelWork(infantry);groundClearOrders(infantry);truck.groundPassenger=infantry;infantry.embarked=truck;truck.pos.copy(ride.dest);
  npcGroundLiftOrders(cc,npcGroundSituation(cc),{tasks:[k]});check('到着した輸送車から実際に降ろし30秒の待ちを記録',!infantry.embarked&&!truck.groundPassenger&&state.cooldown.get(infantry.id)===gameSec+30);
  const now=gameSec;infantry.pos.copy(groundPoint(26,20));truck.pos.copy(infantry.pos);gameSec=now+29.99;npcGroundLiftOrders(cc,npcGroundSituation(cc),{tasks:[k]});check('降車から29.99秒では乗り直さない',infantry.order?.type!=='board');
  gameSec=now+30;npcGroundLiftOrders(cc,npcGroundSituation(cc),{tasks:[k]});check('30秒後も残り6km以上なら乗れる',infantry.order?.type==='board');}
 // 補給は通常のコマンドと実配布で確認。地形や規則の値は変更しない。
 fleets=[infantry,stock];groundCancelWork(infantry);groundClearOrders(infantry);infantry.embarked=null;infantry.pos.copy(groundPoint(34,22));infantry.groundSupply=20;stock.groundSupply=100;
 const dx=31,dy=-4,len=Math.hypot(dx,dy);stock.pos.copy(groundPoint(34-dx/len*.6,22-dy/len*.6));groundClearOrders(stock);
 npcGroundInit();const supplyC=npcGroundState.commanders.get(1),supplyK={...k,units:[{id:infantry.id,as:'main'},{id:stock.id,as:'supply'}]};
 npcGroundLiftOrders(supplyC,npcGroundSituation(supplyC),{tasks:[supplyK]});const before=infantry.groundSupply;groundSupplyGive(.5,new Map());
 check('主力の後ろ1km以内で補給命令を出し実配布する',stock.groundGiving===infantry&&groundDistanceTo(stock,infantry)<=groundSupplyRules().giveKm*GROUND_SCALE&&infantry.groundSupply>before);
 const attacker=makeFleet(0,groundUnitSpec(op.quick.find(u=>u.kind==='vehicle')));attacker.groundVisible=[true,true];attacker.pos.copy(stock.pos);fleets.push(attacker);npcGroundLiftOrders(supplyC,npcGroundSituation(supplyC),{tasks:[supplyK]});
 check('見えている直射の中で補給を続けない',stock.groundGiving===null);
 return rows;
}
function nodeChecks(){return createGroundContext().run('('+liftCases.toString()+')()');}
module.exports={nodeChecks,liftCases};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'合格':'不合格')+' '+r.name);if(rows.some(r=>!r.ok))process.exitCode=1;}
