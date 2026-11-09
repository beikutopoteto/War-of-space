const assert=require('assert/strict');
function areaCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 op={ground:'exercise2'};fleets=[];groundSites=[];groundForests=[];groundBuildings=[];groundHeight=groundSightHeight=()=>0;over=false;deploying=false;
 const unit=(kind,x=8,y=27)=>{const p=groundPoint(x,y),f=makeFleet(0,{name:kind+x,groundKind:kind,type:kind==='sea'?'cl':'cv',n:1,scale:.3,pos:[p.x,p.z]});f.band=groundBands(f)[0];f.el.classList.toggle=()=>{};fleets.push(f);return f;};
 const gun=unit('artillery'),center=groundPoint(14,27),seen=[],real=groundStrikeLaunch,random=Math.random;let seed=17;
 Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 groundStrikeLaunch=(...args)=>{const shot=real(...args);if(shot)seen.push(shot);return shot;};
 try{
  select(gun);groundSalvoCount=3;groundStrikeToggle();groundAreaTap(center);
  check('1クリック目は中心だけで未発射',seen.length===0&&groundAreaAim.stage==='radius');
  const edge=center.clone().add(new THREE.Vector3(2,0,0));groundAreaHover(edge);const circle=groundAreaAim.preview;groundAreaTap(edge);
  check('2クリック目で半径を確定して1発目',seen.length===1&&gun.groundAreaSalvo.remaining===2&&!groundStrikeAiming);
  select(null);check('選択を変えても確定済みの連射指示は継続',gun.groundAreaSalvo.remaining===2);select(gun);
  saveUndo([gun]);for(let i=0;i<82;i++)groundStrikeStep(.1);undo();check('別操作を戻しても既に撃った回数を復活させない',gun.groundAreaSalvo.remaining===1);
  for(let i=0;i<400;i++)groundStrikeStep(.1);
  check('再装填に従い3回だけ発射して終了',seen.length===3&&!gun.groundAreaSalvo);
  check('全着弾中心は指定した円の内側',seen.every(s=>groundAreaClosest(circle,s.impact).distance<=circle.radius+1e-6));
  select(gun);gun.groundStrikeCooldown=0;groundSalvoCount=31;groundStrikeToggle();groundAreaTap(center);groundAreaTap(center);
  const concentrated=seen[seen.length-1],minimum=groundScatterRadius(gun,center),concentratedArea=concentrated.area;
  check('回数上限30・半径ゼロ指定も最小散布円へ拡張',gun.groundAreaSalvo.remaining===29&&concentratedArea===gun.groundAreaSalvo.area&&concentratedArea.radius>=minimum-1e-8&&Math.abs(minimum-.05)<1e-8);
  const deviation=Math.hypot(concentrated.impact.x-concentrated.aim.x,concentrated.impact.z-concentrated.aim.z);
  check('最小円でも狙点と実着弾を分け、実弾は円内に散る',Math.hypot(concentrated.aim.x-center.x,concentrated.aim.z-center.z)<1e-8&&deviation>0&&deviation<=minimum+1e-8&&groundAreaClosest(concentratedArea,concentrated.impact).distance<=concentratedArea.radius+1e-8);
  undo();check('戻すで未発射の残り回数を取り消す',!gun.groundAreaSalvo);
  gun.groundStrikeCooldown=0;groundSalvoCount=2;groundStrikeToggle();groundAreaTap(center);groundAreaTap(center);
  groundClearOrders(gun);const stopped=seen.length;for(let i=0;i<100;i++)groundStrikeStep(.1);check('停止で未発射の残り回数を取り消す',seen.length===stopped);
  const second=unit('artillery',9);gun.groundStrikeCooldown=0;groundSalvoCount=1;setSel([gun,second]);groundStrikeToggle();
  groundAreaTap(groundPoint(12,27));groundAreaTap(groundPoint(14,26),true);
  check('Shiftで中間点を保持し終点指定を続ける',groundAreaAim.points.length===2&&groundAreaAim.stage==='end');
  groundAreaTap(groundPoint(16,27));check('線を確定してから幅を待つ',groundAreaAim.stage==='width');
  const width=groundPoint(14,27);groundAreaHover(width);const curved=groundAreaAim.preview,start=seen.length;groundAreaTap(width);
  check('複数隊が曲線の帯の中へ発射',seen.length===start+2&&seen.slice(start).every(s=>groundAreaClosest(curved,s.impact).distance<=curved.radius+1e-6));
  check('同兵科の中心線上限は台数×最大直径',groundAreaLimits([gun,second]).length===28);
  const ship=unit('sea');check('混成上限は兵科別の最大直径を合算',groundAreaLimits([gun,ship]).length===34);
  select(ship);groundStrikeToggle();check('単艦でも線状指定が標準',groundAreaAim.type==='line');
  groundAreaTap(groundPoint(12,27));const end=groundAreaEnd(groundAreaAim,groundPoint(40,27));check('長すぎる中心線は上限で止まる',groundAreaCurve([...groundAreaAim.points,end]).length<=20+1e-6);groundClearAiming();
  // 確定後に遠ざかった射手は、古い狭い円で次弾を撃たない。発射済み弾は残す。
  select(gun);gun.groundStrikeCooldown=0;groundSalvoCount=2;groundStrikeToggle();groundAreaTap(center);groundAreaTap(center);
  const queued=gun.groundAreaSalvo,lateStart=seen.length,pending=groundStrikes.filter(s=>s.source===gun);
  gun.pos.copy(groundPoint(2,27));const tooNarrow=groundScatterRadius(gun,center)>queued.area.radius;
  gun.groundStrikeCooldown=0;groundAreaSalvoStep();
  check('射手が遠ざかり最小幅を満たさなくなった次弾だけ中止',queued.remaining===1&&tooNarrow&&!gun.groundAreaSalvo&&seen.length===lateStart&&pending.length>0&&pending.every(s=>groundStrikes.includes(s)));
  gun.pos.copy(groundPoint(8,27));
  // 自走砲より下限の大きいロケットを混ぜ、実際の2発と互換の狙点APIを確認。
  const rocket=unit('guidedRocket',9);gun.groundStrikeCooldown=0;setSel([gun,rocket]);groundSalvoCount=2;groundStrikeToggle();
  groundAreaTap(center);groundAreaTap(center);const mixedStart=seen.length;groundAreaTap(center);
  const mixedArea=gun.groundAreaSalvo.area,mixedShots=seen.slice(mixedStart);
  check('混成の最小円はロケット直径30mを守り各隊の実弾も円内',Math.abs(mixedArea.radius-.06)<1e-8&&groundAreaLimits([gun,rocket]).radius===7&&mixedShots.length===2&&mixedShots.some(s=>s.source===gun)&&mixedShots.some(s=>s.source===rocket)&&mixedShots.every(s=>groundAreaClosest(mixedArea,s.impact).distance<=mixedArea.radius+1e-8&&Math.hypot(s.impact.x-s.aim.x,s.impact.z-s.aim.z)<=groundScatterRadius(s.source,s.aim)+1e-8));
  const replaySeed=seed,planned=groundAreaShot(gun,mixedArea);seed=replaySeed;const nominal=groundAreaTarget(gun,mixedArea);
  check('互換APIは実着弾ではなく同じ乱数の狙点を返す',planned&&nominal&&nominal.equals(planned.aim)&&Math.hypot(nominal.x-planned.impact.x,nominal.z-planned.impact.z)>0);
  groundClearOrders(gun);groundClearOrders(rocket);
  const tank=unit('vehicle'),target=groundPoint(11,27),scout=unit('scout',11);groundBuildings=[{minX:groundPoint(9.5,27).x-.2,maxX:groundPoint(9.5,27).x+.2,minZ:target.z-3,maxZ:target.z+3,bottom:0,top:1}];
  check('遮蔽確認の狙点は戦車の直接射程3km境界',groundDistanceTo(tank,{pos:target})===groundStrikeRange(tank).max);
  check('観測済みでも戦車は壁越しに射撃しない',groundPointSeenBy(0,target)&&!groundStrikeInRange(tank,target));
  check('自走砲は弾道が越えられる壁へ間接照準できる',groundStrikeInRange(gun,target));
  groundBuildings=[];groundSightHeight=(x,z)=>Math.abs(x-groundPoint(9.5,27).x)<1?10:0;check('戦車は尾根越しにも射撃しない',!groundStrikeInRange(tank,target));groundSightHeight=()=>0;
  check('戦車は見通せる地点なら範囲射撃できる',groundStrikeInRange(tank,target));
  select(gun);groundStrikeToggle();groundAreaTap(center);select(tank);check('選択変更で指定途中の円とモードを解除',!groundAreaAim&&!groundStrikeAiming);
  op={};check('宇宙では範囲砲撃を起動しない',!groundStrikeWeapon(gun));
 }finally{groundStrikeLaunch=real;Math.random=random;}
 return rows;
}
function nodeChecks(){const {run}=require('./ground-controls.cjs').createControlsContext();return run(`(${areaCases.toString()})()`);}
module.exports={areaCases,nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`範囲砲撃 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
