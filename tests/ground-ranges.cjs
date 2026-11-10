/* 地上・海上専用の射程契約。到達距離、死角、対象・視界、発射経路を実関数で確認。 */
const assert=require('assert/strict');
function rangeCases(){
 const saved={op,fleets,groundHeight,groundSightHeight,groundBuildings,groundForests,groundSites,shoot,burst,groundHud};
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 try{
  op={ground:'exercise2'};fleets=[];groundHeight=groundSightHeight=()=>0;groundBuildings=[];groundForests=[];groundSites=[];shoot=burst=groundHud=()=>{};
  const unit=(kind,team=0,type='cv',n=1)=>{const p=groundPoint(18,24),f=makeFleet(team,{name:kind,groundKind:kind,type,n,scale:.3,pos:[p.x,p.z],stance:'evade'});f.band=groundBands(f)[0];return f;};
  const gun=unit('artillery'),tank=unit('vehicle'),rocket=unit('guidedRocket'),target=unit('infantry',1),fighter=unit('fighter'),attack=unit('attack'),was=unit('was'),ship=unit('sea',0,'cl');
  const aim=km=>gun.pos.clone().add(new THREE.Vector3(km*GROUND_SCALE,0,0));
  check('自走砲の直射2kmと間接2〜30kmを分離',groundFireRanges(gun).direct===8&&groundStrikeRange(gun).min===8&&groundStrikeRange(gun).max===120);
  check('間接の最小2km以内は地点砲撃しない',!groundStrikeInRange(gun,aim(1.99))&&groundStrikeInRange(gun,aim(2)));
  // 地形盤は48km幅なので、30kmの射程境界は射手を西へ移して調べる。
  gun.pos.copy(groundPoint(4,24));check('間接30km境界と射程外を区別',groundStrikeInRange(gun,aim(30))&&!groundStrikeInRange(gun,aim(30.001)));
  target.pos.copy(gun.pos).add(new THREE.Vector3(4,0,0));fleets=[gun,target];
  check('近距離の敵部隊は直射、離れた部隊は間接',groundFireMode(gun,target)==='direct');target.pos.x=gun.pos.x+12;
  check('部隊目標への遠距離射撃も間接経路',groundFireMode(gun,target)==='indirect');
  const shield=target.hpPool;gun.order={type:'attack',target};damage(target,10,gun);check('間接射程内でも直接damageの呼出しは拒否',target.hpPool===shield);
  groundStrikes=[];gun.order={type:'attack',target};gun.groundShotT=0;const before=target.hpPool;groundStep(.05);
  check('間接射撃を即時直射打撃で代用しない',target.hpPool===before&&groundStrikes.some(s=>s.source===gun));
  const tankAim=tank.pos.clone().add(new THREE.Vector3(12,0,0));fleets=[tank,target];
  check('戦車は直射3kmだけ・間接枠なし',groundStrikeRange(tank).direct&&!groundFireRanges(tank).indirect&&groundStrikeInRange(tank,tankAim)&&!groundStrikeInRange(tank,tankAim.clone().add(new THREE.Vector3(.01,0,0))));
  const wallX=tank.pos.x+6;groundBuildings=[{minX:wallX-.1,maxX:wallX+.1,minZ:tank.pos.z-3,maxZ:tank.pos.z+3,bottom:0,top:100}];
  check('戦車は射程内でも建物越しに範囲射撃しない',!groundStrikeInRange(tank,tankAim));groundBuildings=[];
  check('ロケットは間接50kmだけ・対空なし',groundFireRanges(rocket).direct===0&&groundStrikeRange(rocket).max===200&&!groundTargetRange(rocket,{band:'high'}));
  fighter.band='high';check('戦闘機は対空2km・対地なし',groundTargetRange(fighter,{band:'low'})===8&&groundTargetRange(fighter,{band:'ground'})===0);
  attack.band='low';check('攻撃機は対地10km・対空15km',groundTargetRange(attack,{band:'ground'})===40&&groundTargetRange(attack,{band:'high'})===60);
  check('地上W.A.S.は直射3km・間接12km・対空6km',groundTargetRange(was,{band:'ground'})===12&&groundFireRanges(was).indirect.max===48&&groundTargetRange(was,{band:'high'})===24);
  was.band='high';check('空中W.A.S.は対地5km・対空15kmに切替・間接なし',groundTargetRange(was,{band:'ground'})===20&&groundTargetRange(was,{band:'low'})===60&&!groundFireRanges(was).indirect&&!groundStrikeWeapon(was));
  check('海上巡洋艦の直接24km・間接24km・対空150kmを分離',groundTargetRange(ship,{band:'sea'})===96&&groundStrikeRange(ship).max===96&&groundTargetRange(ship,{band:'high'})===600);
  ship.pos.copy(groundPoint(12,5));target.pos.copy(groundPoint(12,10));target.band='ground';check('艦の地上部隊目標は直射せず間接を選ぶ',groundFireMode(ship,target)==='indirect');
  fleets=[ship,target];target.band='high';target.pos.copy(groundPoint(45,30));groundUpdateSight();
  const unseenHP=target.hpPool;ship.groundAATimer=0;groundStep(.05);
  check('対空射程150kmでも未発見の航空目標へ自動対空の損害0',!groundSeenBy(0,target)&&target.hpPool===unseenHP&&!ship.groundAATarget);
  const sight=groundSightRange(tank);tank.range=99999;check('旧rangeを書換えても武器・索敵射程を拡大しない',groundTargetRange(tank,{band:'ground'})===12&&groundSightRange(tank)===sight);
  check('全兵科の操作枠は最大2つ',Object.keys(WOS_TERRAIN.exercise2.unitTypes).every(kind=>{const f=unit(kind),r=groundFireRanges(f);return [r.direct,r.indirect?.max,r.ground,r.air].filter(n=>n>0).length<=2;}));
  check('自走砲の表示は直射と間接、補給部隊は武器射程なし',groundRangeInfo(gun).entries.map(e=>e.id).join(',')==='direct,indirect'&&!groundRangeInfo(unit('supply')));
  // 射程は狙点へ適用。散布で境界を越えた実弾を発射取消にしない。
  gun.pos.copy(groundPoint(4,24));gun.order=null;gun.groundStrikeCooldown=0;fleets=[gun];groundStrikes=[];
  const savedRandom=Math.random;let draw=0;Math.random=()=>draw++%2?1:0;
  try{
   const shot=groundStrikeLaunch(gun,gun.pos.clone().add(new THREE.Vector3(120,0,0)));
   check('最大30kmの狙点から外側へ散った弾も発射して再装填',shot&&groundDistanceTo(gun,{pos:shot.impact})>120&&gun.groundStrikeCooldown>0&&shot.left>0);
   gun.groundStrikeCooldown=0;draw=0;Math.random=()=>draw++%2?1:.5;
   const inner=groundStrikeLaunch(gun,gun.pos.clone().add(new THREE.Vector3(8,0,0)));
   check('最小2kmの狙点から内側へ散った弾も発射',inner&&groundDistanceTo(gun,{pos:inner.impact})<8&&inner.left>0);
  }finally{Math.random=savedRandom;}
  gun.groundStrikeCooldown=0;gun.groundVolley=null;const stale={ledger:{source:gun,entries:[{}]}},oldCount=groundStrikes.length;
  check('古い連射トークンは装填済みでも発射・装填迂回不可',!groundStrikeLaunch(gun,gun.pos.clone().add(new THREE.Vector3(12,0,0)),null,null,stale)&&groundStrikes.length===oldCount&&gun.groundStrikeCooldown===0);
  const company=unit('artillery',0,'cv',2);fleets=[company];groundStrikes=[];
  check('地点攻撃コマンドも2台の一斉射へ接続',groundStrikeCommand([company],company.pos.clone().add(new THREE.Vector3(12,0,0)))===1&&groundStrikes.length===2&&company.groundStrikeCooldown>0);
  const battery=unit('guidedRocket');fleets=[battery];groundStrikes=[];
  const started=groundStrikeCommand([battery],battery.pos.clone().add(new THREE.Vector3(12,0,0))),ledger=battery.groundVolley?.ledger;groundStrikeStep(1.25);
  check('地点攻撃コマンドのロケットも1斉射6発・長い装填',started===1&&ledger?.fired.size===6&&groundStrikes.length===6&&!battery.groundVolley&&battery.groundStrikeCooldown>=30-1e-6);
  op={};check('宇宙に地上射程・地点攻撃を適用しない',Object.keys(groundFireRanges(gun)).length===0&&!groundStrikeWeapon(gun));
 }finally{Object.assign(globalThis,saved);groundStrikes=[];groundImpacts=[];groundHeightCacheReset();}
 return rows;
}
function nodeChecks(){const {run}=require('./ground-landing.cjs').createGroundContext();return run(`(${rangeCases.toString()})()`);}
module.exports={rangeCases,nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`射程分離 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
