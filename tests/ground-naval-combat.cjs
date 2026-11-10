/* 海上分類の接続を実生成・射撃・着弾で確認。宇宙表の変更は許さない。 */
const assert=require('assert/strict');
function nodeChecks(){
 const {run}=require('./ground-landing.cjs').createGroundContext();
 return run(`(()=>{
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok}),before=JSON.stringify(WOS_DATA.ships);
  op={ground:'exercise2',groundHQ:null,wipeLose:false};groundSites=[];groundForests=[];groundBuildings=[];groundHeight=groundSightHeight=()=>0;over=false;
  const unit=(type,team=0,x=10,landing=false)=>{const p=groundPoint(x,5),f=makeFleet(team,{name:type,type,groundKind:'sea',groundLanding:landing,n:1,pos:[p.x,p.z],stance:'evade'});f.band='sea';f.pos.y=0;f.groundVisible=[true,true];return f;};
  const cv=unit('cv'),ff=unit('ff'),dd=unit('dd'),cl=unit('cl'),bb=unit('bb'),landing=unit('dd',0,10,true);
  check('旧cv/ffはff性能・モデルの高速艇へ統合',cv.sub==='海の高速艇'&&groundNavalModel(cv)==='ff'&&['hp','dmg','speed','scale'].every(k=>cv[k]===ff[k]));
  check('旧dd/clはcl性能・モデルのイージス艦へ統合',dd.sub==='海のイージス艦'&&groundNavalModel(dd)==='cl'&&['hp','dmg','speed','scale'].every(k=>dd[k]===cl[k]));
  const old=WOS_DATA.ships.find(s=>s.id==='dd');
  check('揚陸艦の旧dd性能・モデルを保持',groundNavalModel(landing)==='dd'&&landing.hp===6+old.def*5&&landing.speed===2+old.spd&&landing.hp!==dd.hp);
  check('旧母艦型にも近距離の直接照準が成立', ['cvb','mas','masc'].every(type=>{const t=unit(type,1,11);return groundNavalClass(t)===null&&groundTargetRange(cl,t)>groundDistanceTo(cl,t)&&groundFireMode(cl,t)==='direct';}));
  const target=unit('cl',1,32);fleets=[cl,target];
  check('既知の海上目標でも地平線より外は直接射撃不可',groundFireRanges(cl).direct===96&&groundTargetRange(cl,target)<groundDistanceTo(cl,target)&&groundFireMode(cl,target)==='indirect');
  const hp=target.hpPool;damage(target,10,cl);check('通常damageで地平線を迂回しない',target.hpPool===hp);
  check('近距離海上目標は従来どおり直接射撃',groundFireMode(cl,{...target,pos:cl.pos.clone().add(new THREE.Vector3(4,0,0))})==='direct');
  target.pos.copy(groundPoint(40,5));fleets=[bb,target];groundStrikeReset();
  check('戦艦は大型砲の40km射程・海面間接照準を持つ',bb.sub==='海の戦艦'&&bb.dmg>cl.dmg&&groundNavalModel(bb)==='bb'&&groundStrikeRange(bb).max===160&&groundFireMode(bb,target)==='indirect');
  const random=Math.random;let shot;try{Math.random=()=>0;shot=groundStrikeLaunch(bb,target.pos);}finally{Math.random=random;}
  check('戦艦が海面へ弾道弾を発射し着弾前は無傷',shot&&shot.flight&&shot.left>0&&target.hpPool===hp);
  if(shot)groundStrikeStep(shot.left);
  check('海面への間接着弾で実際に損害が入る',target.hpPool<hp&&groundStrikes.length===0);
  check('宇宙艦種・性能表は不変',JSON.stringify(WOS_DATA.ships)===before&&WOS_DATA.ships.some(s=>s.id==='cv')&&WOS_DATA.ships.some(s=>s.id==='dd'));
  return rows;
 })()`);
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log('海上統合の実射 '+(rows.length-bad.length)+'/'+rows.length);assert.equal(bad.length,0,JSON.stringify(bad));}
