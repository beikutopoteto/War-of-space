const assert=require('assert/strict');
function nodeChecks(){
 const {run}=require('./ground-landing.cjs').createGroundContext();
 return run(`(()=>{
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});op={ground:'exercise2',groundHQ:null};groundPass=()=>true;groundHeight=groundSightHeight=()=>0;
  const unit=(kind='fighter',team=0,x=0)=>{const f=makeFleet(team,{name:kind,groundKind:kind,type:'cv',n:1,pos:[x,0],band:'low',stance:'evade'});f.band='low';f.pos.y=groundUnitHeight(f);f.groundVisible=[true,true];f.heading.set(1,0,0);return f;};
  const f=unit(),t=unit('fighter',1,4);fleets=[f,t];
  const order={type:'attack',target:t},queue=[{type:'move',dest:new THREE.Vector3(10,0,10)}];f.order=order;f.queue=queue;f.groundShotT=4;const before=f.pos.clone();groundAirMotion(f,.1);
  check('接敵しても飛行し通常命令・予約・射撃時計を保持',f.pos.distanceTo(before)>0&&f.order===order&&f.queue===queue&&f.groundShotT===4);
  const heading=f.heading.clone();groundAirTurnMove(f,f.pos.clone().add(new THREE.Vector3(0,0,100)),.1);
  check('旋回は瞬時に90度向かず角速度の上限を守る',f.heading.angleTo(heading)<=GROUND_AIR_CONTROL.turnRate*.1+1e-7&&f.heading.angleTo(heading)>0);
  check('前方の空中目標だけ射界に入る',groundAirInFront(f,{band:'low',pos:f.pos.clone().addScaledVector(f.heading,4)})&&!groundAirInFront(f,{band:'high',pos:f.pos.clone().addScaledVector(f.heading,-4)}));
  f.order=null;const at=f.pos.clone();groundAirMotion(f,.1);check('無命令でも待機旋回して停止しない',f.pos.distanceTo(at)>0&&f.groundLoiterCenter);
  op={ground:'exercise2',groundDrill:true};const enemy=unit('fighter',1),p=enemy.pos.clone();groundAirMotion(enemy,1);check('チュートリアルの敵航空目標は固定のまま',enemy.pos.equals(p));
  op={ground:'exercise2'};const infantry=unit('infantry'),was=unit('was');check('地上部隊とWASへ航空運動を適用しない',!groundAirMotion(infantry,.1)&&!groundAirMotion(was,.1));
  f.groundAirState='base';const b=f.pos.clone();groundAirMotion(f,1);check('基地補給中は不在位置を動かさない',f.pos.equals(b));
  op={};check('宇宙作戦を変更しない',!groundAirMotion(f,1));
  return rows;
 })()`);
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log('航空運動 '+(rows.length-bad.length)+'/'+rows.length);assert.equal(bad.length,0,JSON.stringify(bad));}
