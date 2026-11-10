const assert=require('assert/strict');
function nodeChecks(){
 const {run}=require('./ground-controls.cjs').createControlsContext();
 return run(`(()=>{
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});op={ground:'exercise2',groundHQ:null};fleets=[];groundSites=[];groundBuildings=[];
  const unit=(kind,band='ground',team=0)=>{const p=groundPoint(15,25),f=makeFleet(team,{name:kind,groundKind:kind,type:kind==='sea'?'cl':'cv',n:1,pos:[p.x,p.z],band,stance:'evade'});f.band=band;f.pos.y=groundUnitHeight(f);f.groundVisible=[true,true];f.el.classList.toggle=f.el.classList.remove=()=>{};fleets.push(f);return f;};
  const bomber=unit('supportAircraft','high'),fighter=unit('fighter','low'),attack=unit('attack','high'),aa=unit('mobileAA'),supply=unit('supply'),ship=unit('sea','sea'),rocket=unit('guidedRocket'),air=unit('fighter','low',1),ground=unit('infantry','ground',1);
  check('対空0の支援機と補給に無効な攻撃を出さない',!groundManualTargetAllowed(bomber,air)&&!groundManualTargetAllowed(supply,ground));
  check('戦闘機は対地不可・対空可、自動AA部隊は手動対空不可',!groundManualTargetAllowed(fighter,ground)&&groundManualTargetAllowed(fighter,air)&&!groundManualTargetAllowed(aa,air));
  check('攻撃機の対地は低高度だけ',!groundManualTargetAllowed(attack,ground)&&(attack.band='low',groundManualTargetAllowed(attack,ground)));
  check('支援機の地上と海面への爆撃は高高度だけ',groundManualTargetAllowed(bomber,ground)&&groundManualTargetAllowed(bomber,ship)&&(bomber.band='low',!groundManualTargetAllowed(bomber,ground)));
  bomber.band='high';check('艦の陸上間接とロケットの間接攻撃を許可',groundManualTargetAllowed(ship,ground)&&groundManualTargetAllowed(rocket,ground));
  const far={...ground,pos:new THREE.Vector3(10000,0,10000)};groundBuildings=[{minX:-100,maxX:100,minZ:-100,maxZ:100,bottom:0,top:1000}];
  check('攻撃命令の受付を距離や障害物で禁止しない',groundManualTargetAllowed(rocket,far)&&groundManualTargetAllowed(bomber,far));groundBuildings=[];
  select(bomber);groupOrder({type:'move',dest:groundPoint(16,25)});groupOrder({type:'move',dest:groundPoint(17,25),queue:true});const before=bomber.order,queue=bomber.queue.slice(),history=undoStack.length;
  groupOrder({type:'attack',target:air});order(bomber,{type:'attack',target:air});
  check('無効な攻撃で移動・予約・Undoを失わない',bomber.order===before&&bomber.queue.length===queue.length&&bomber.queue[0]===queue[0]&&undoStack.length===history);
  setSel([bomber,fighter],null);groupOrder({type:'attack',target:air,queue:true});
  check('混成では対応する戦闘機だけに攻撃を渡す',fighter.order?.target===air&&bomber.order===before&&bomber.queue.length===queue.length&&bomber.queue[0]===queue[0]);
  op={};check('宇宙の命令受付を変更しない',groundManualTargetAllowed({},{band:'high'}));
  return rows;
 })()`);
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log('地上命令の能力判定 '+(rows.length-bad.length)+'/'+rows.length);assert.equal(bad.length,0,JSON.stringify(bad));}
