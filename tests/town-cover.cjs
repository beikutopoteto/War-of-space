/* #440: 合成の町を実際の視界・弾道・被弾・補給の関数へ渡す。node tests/town-cover.cjs */
const assert=require('node:assert/strict');
const {createGroundContext}=require('./ground-landing.cjs');
function townCases(){
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok}),near=(a,b)=>Math.abs(a-b)<1e-6;
  op={ground:'exercise2',groundHQ:{0:'A',1:'F'}};groundHeight=()=>0;groundSightReset();groundForests=[];
  const cx=groundWorldX(15),cz=groundWorldZ(27);
  const point=(x=0,z=0,y=.35)=>new THREE.Vector3(cx+x,y,cz+z);
  const box=(x,z=0,w=1,d=4,top=2,settlement='town',ang=0)=>{
    const c=Math.abs(Math.cos(ang)),s=Math.abs(Math.sin(ang)),ex=(w*c+d*s)/2,ez=(w*s+d*c)/2;
    return {x:cx+x,z:cz+z,w,d,ang,minX:cx+x-ex,maxX:cx+x+ex,minZ:cz+z-ez,maxZ:cz+z+ez,bottom:0,top,settlement};
  };
  const set=boxes=>{groundBuildings=boxes;groundBallisticReset();};
  const unit=(kind,x,z=0)=>({groundKind:kind,team:0,band:'ground',alive:true,pos:point(x,z,0),groundSupply:40,groundMorale:100,groundSupplyReceived:0,groundSupplyGiven:0});
  // 通りは0.6 world = 0.15 km。両側の建物と同じsettlementの施設も1つの町。
  set([box(-.8),box(.8)]);
  const outside=point(0,-3),beyond=point(0,3),inside=point(),zone=groundTownZones()[0];
  check('0.15kmの通りに沿う外から外の視界を遮る',!groundClearLine(outside,beyond));
  check('町の中から外へ見える',groundClearLine(inside,beyond));
  check('外から町の中へ見える',groundClearLine(outside,inside));
  check('町の中どうしは見える',groundClearLine(point(0,-1),point(0,1)));
  check('両端が屋根より高い線は通る',groundClearLine(point(0,-3,3),point(0,3,3)));
  const tank=unit('vehicle',0,-3),toInside=groundBallisticSolution(tank,point()),across=groundBallisticSolution(tank,point(0,3));
  check('外の戦車から町の通りの点へ直射できる',toInside.clear);
  check('町の向こうへの直射は範囲の入り口に当たる',!across.clear&&across.reason==='building'&&near(across.impact.z,zone.minZ)&&near(across.impact.x,cx));
  check('町の中の戦車から外へ直射できる',groundBallisticSolution(unit('vehicle',0),point(0,3)).clear);
  const artillery=unit('artillery',0),arc=groundBallisticSolution(artillery,point(12));
  check('町内の自走砲は上昇中に隣の壁で止まらない',arc.clear);
  set([box(12,0,1,4,.2)]);
  const roofHit=groundBallisticSolution(unit('artillery',0),point(12));
  check('曲射は町内の目標建物の屋根に当たる',!roofHit.clear&&roofHit.reason==='building'&&near(roofHit.impact.y,.2)&&roofHit.impact.x>cx+11.5);
  // 町内で下降する弾には同じ町の箱を再び当てる。
  set([box(0,0,1,4,.2),box(12,0,1,4,.2)]);
  const descending=groundBallisticSolution(unit('artillery',0),point(12));
  check('町内発の曲射も頂点の後は同じ町の目標の屋根に当たる',!descending.clear&&descending.reason==='building'&&near(descending.impact.y,.2)&&descending.impact.x>cx+11);
  set([box(-2),box(2)]);
  const coverMatches=(f,h,m,blast=false)=>{const result=groundDamageFactor(f,blast);return near(result.h,h)&&near(result.m,m);};
  check('建物から0.2kmより離れた町内でも歩兵は軽減',groundBuildings.every(b=>cx<b.minX-.8||cx>b.maxX+.8)&&coverMatches(unit('infantry',0),.5,.55));
  for(const kind of ['infantry','heavyInfantry','commando']){
    const f=unit(kind,-2.95),c=groundRuleSet().combat;
    check(kind+'は町外なら建物から0.2km以内でも軽減なし',f.pos.x>=groundBuildings[0].minX-c.urbanMargin&&!groundInsideTown(f.pos,groundTownZones()[0])&&coverMatches(f,1,1));
    const power=kind==='commando'?1.5:1;
    check(kind+'の町内で直射と爆風に別の倍率を使う',coverMatches(unit(kind,0),.5**power,.55**power)&&coverMatches(unit(kind,0),.3**power,.6**power,true));
  }
  const dug=unit('commando',0);dug.groundSpawnAt=gameSec-60;
  check('停止60秒で町と陣地を重ね、コマンドは両方に1.5乗',coverMatches(dug,(.5*.7)**1.5,(.55*.8)**1.5)&&coverMatches(dug,(.3*.5)**1.5,(.6*.7)**1.5,true));
  dug.groundMovedAt=gameSec-59.99;
  check('移動後60秒未満は町だけを適用',coverMatches(dug,.3**1.5,.6**1.5,true));
  groundForests=[{x:cx-3,z:cz,r:.2}];
  check('町外でも森の歩兵は軽減',coverMatches(unit('infantry',-3),.6,.7)&&coverMatches(unit('infantry',-3),.6,.85,true));groundForests=[];
  set([box(0,0,1,1,2,undefined)]);delete groundBuildings[0].settlement;
  check('settlementなしの箱は従来のurbanMarginで軽減',coverMatches(unit('infantry',1),.5,.55));
  check('settlementなしの箱は町を作らず個別に遮る',groundTownZones().length===0&&!groundClearLine(point(-2),point(2)));
  // 分配は通行経路を使い、射線を遮る建物があっても届く。
  set([box(-.8,0,1,1),box(.8,0,1,1)]);
  const truck=unit('supply',0,-.5),recipient=unit('infantry',0,.5);truck.groundGiving=recipient;fleets=[truck,recipient];
  recipient.groundMorale=groundMoraleUnitMax(recipient);
  groundSupplyGive(1,new Map());
  check('同じ町内の通りで補給を実際に渡せる',recipient.groundSupply>40&&truck.groundSupply<40&&truck.groundSupplyGiving);
  truck.pos.copy(point(0,-1.5,0));recipient.pos.copy(point(0,1.5,0));truck.groundSupply=40;recipient.groundSupply=40;
  const path=groundPath(truck.pos,recipient.pos,groundMoveKind(truck),true);
  groundSupplyGive(1,new Map());
  check('町を挟んでも範囲内の通行経路で補給できる',!!path&&path.L<=groundSupplyRules().giveKm*GROUND_SCALE&&recipient.groundSupply===44&&truck.groundSupply===36&&truck.groundSupplyGiving);
  // 配列の交換・回転した底面・偶数棟の中央値も確認。
  set([box(0,0,2,4,1,'rotated',Math.PI/4),box(0,0,2,4,3,'rotated',Math.PI/4)]);
  const rotated=groundTownZones()[0],extent=3/Math.sqrt(2)+groundRuleSet().combat.townMargin;
  check('回転した底面の角を使い高さは中央値',near(rotated.maxX,cx+extent)&&near(rotated.minZ,cz-extent)&&near(rotated.roof,2));
  const cache=groundTownZones();check('同じ配列の町範囲を再利用',groundTownZones()===cache);
  const a=point(-4,0,4),b=point(4,0,0),fraction=groundTownHit(a,b,rotated);
  check('町の途中で屋根より低くなる線は屋根の交点に当たる',fraction!==null&&Math.abs(fraction-.5)<1e-7);
  groundHeight=()=>1;groundHeightCacheReset();
  check('町の屋根は各地点の地面に中央値を足す',groundTownHit(point(-4,0,2.5),point(4,0,2.5),rotated)!==null);

  set([]);check('建物配列を交換したら町範囲を作り直す',groundTownZones()!==cache&&groundTownZones().length===0);
  return rows;
}
function nodeChecks(){const {run}=createGroundContext();return run(`(${townCases.toString()})()`);}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`町の遮蔽 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
