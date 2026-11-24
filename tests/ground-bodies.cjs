/* Issue #445: real initialization, damage, shooting, blast, transport and orders. */
const assert=require('assert/strict');
function nodeChecks(){
 const {run}=require('./ground-controls.cjs').createControlsContext();
 run(`
  var bodyShots=[],bodyBursts=[];
  function bodyFresh(){
   op={ground:'exercise2',wipeLose:false};fleets=[];groundSites=[];groundStrikes=[];groundImpacts=[];groundForests=[];groundBuildings=[];groundFog=null;
   groundHeight=groundSightHeight=()=>0;groundHeightCacheReset();groundVisuals=new THREE.Group();gameSec=0;over=false;engaged.clear();bodyShots=[];bodyBursts=[];
   groundFxReset();
   groundVisualDirect=(f,i,t,j,from,to)=>bodyShots.push({from:from.clone(),to:to.clone()});
   groundVisualLoss=(f,p)=>bodyBursts.push(p.clone());groundHud=()=>{};
  }
  function bodyUnit(kind='vehicle',team=0,x=0,z=0,init=true,platoons=1){
   const f=makeFleet(team,groundUnitSpec({name:kind+' '+fid,kind,at:[8,27],stance:'evade',platoons}));fleets.push(f);if(init)groundInitUnit(f);
   f.pos.set(x,0,z);f.heading.set(0,0,1);f.band=groundBands(f)[0];f.pos.y=groundUnitHeight(f);f.groundVisible=[true,true];f.eva=0;f.groundDeployed=true;f.groundLastPos=f.pos.clone();return f;
  }
  function bodyClose(a,b){return Math.abs(a-b)<1e-7;}
  function bodySum(f){return f.bodies.reduce((s,b)=>s+(b.alive?b.hp:0),0);}
  function bodyLayout(f,offsets){f.groundBodySpec={offsets,size:1};f.groundBodyLayouts=null;}
  function bodyReady(f){for(const b of f.bodies)b.shotT=b.aaT=0;}
  function bodyBlast(s){
   const random=Math.random;Math.random=()=>.99;
   try{groundStrikes=[s];groundStrikeStep(0);}finally{Math.random=random;}
  }
 `);
 const rows=[],check=(name,code)=>{try{run('bodyFresh()');rows.push({name,ok:!!run('(()=>{'+code+'})()')});}catch(e){rows.push({name,ok:false,error:e.message});}};
 check('初期化は戦車4体・等分耐久、shipsとnは1のまま',`const f=bodyUnit();return f.bodies0===4&&f.bodies.every(b=>bodyClose(b.hp,f.groundMaxHp/4)&&b.hp===b.max&&b.alive)&&f.ships.length===1&&f.n===1&&bodyClose(f.hpPool,bodySum(f));`);
 check('全兵科の体数はモデルのoffset、艦・ハイブ・支援機は1',`for(const kind of Object.keys(groundRuleSet().unitTypes)){const f=bodyUnit(kind),spec=groundModelFor(kind,'earth'),n=['sea','droneHive','supportAircraft'].includes(kind)?1:spec?.offsets.length||1;if(f.bodies0!==n)return false;}return true;`);
 check('体の時計は固有の再現可能な位相',`const f=bodyUnit();return new Set(f.bodies.map(b=>b.shotT)).size===4&&f.bodies.every((b,i)=>b.shotT===groundBodyRandom(f,i)()*groundRules().fireEvery);`);
 check('実直射で4→3→2→1→0、余りを捨て最後だけ隊撃破',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8);f.weapons=f.weapons.map(w=>({...w,power:1e6}));for(let n=3;n>=0;n--){bodyReady(f);for(let i=1;i<f.bodies.length;i++)f.bodies[i].shotT=100;groundBodyFire(f,t,0);if(groundAliveBodies(t)!==n||!bodyClose(t.hpPool,bodySum(t))||t.alive!==(n>0)||t.ships.length!==(n?1:0)||t.n!==1)return false;if(t.bodies.filter(b=>b.alive).some(b=>b.hp!==b.max))return false;}return true;`);
 // 小隊の数（2026-11-18）: 作戦のデータの中隊は4小隊。体・耐久・撃つ量が4倍、1体の耐久と1体の1発は1小隊のときと同じ
 check('作戦データの中隊は既定で4小隊、体と耐久は4倍で1体の耐久は同じ',`const a=bodyUnit('vehicle',0,0,0,true,1),b=bodyUnit('vehicle',0,0,-3,true,4);return groundUnitSpec({name:'既定',kind:'vehicle',at:[1,1]}).groundPlatoons===4&&b.groundPlatoons===4&&b.bodies0===16&&bodyClose(b.groundMaxHp,a.groundMaxHp*4)&&bodyClose(b.bodies[0].max,a.bodies[0].max)&&bodyClose(b.hpPool,bodySum(b));`);
 check('4小隊が全体で撃つと1小隊の4倍',`const f=bodyUnit('vehicle',0,0,0,true,4),t=bodyUnit('vehicle',1,0,8,true,4);const w=groundDirectWeapon(f,t),hp=t.hpPool;bodyReady(f);groundBodyFire(f,t,0);return bodyShots.length===16&&bodyClose(hp-t.hpPool,4*w.power*w.armorFactor*groundRuleSet().combat.damageScale);`);
 check('撃破の小爆発は撃破体の位置',`const f=bodyUnit(),p=groundVisualBodyPoint(f,2,groundBodyPosition(f,2));groundBodyHit(f,f.bodies[2],1e6);return bodyBursts.length===1&&bodyBursts[0].equals(p);`);
 check('消耗は生きている体へ等分しhpPoolと一致',`const f=bodyUnit('mechanicalAssault');groundBodyHit(f,f.bodies[0],1e6);const before=f.bodies.map(b=>b.hp),hp=f.hpPool,amt=f.groundMaxHp*groundRuleSet().combat.mechanicalWearPerSec*2;groundMechanicalWear(f,2);return bodyClose(f.hpPool,hp-amt)&&bodyClose(f.hpPool,bodySum(f))&&f.bodies.slice(1).every((b,i)=>bodyClose(before[i+1]-b.hp,amt/(f.bodies0-1)))&&f.ships.length===1;`);
 check('輸送車撃破の損害を搭載歩兵の全生存体へ等分',`const apc=bodyUnit('apc'),p=bodyUnit('infantry');apc.groundPassenger=p;p.embarked=apc;const hp=p.hpPool,per=p.bodies[0].hp;groundTransportDestroyed(apc,apc);return !p.embarked&&p.alive&&p.bodies.every(b=>bodyClose(b.hp,per*(1-groundTransportRules().wreckLoss)))&&bodyClose(p.hpPool,hp*(1-groundTransportRules().wreckLoss))&&bodyClose(p.hpPool,bodySum(p));`);
 check('揚陸艦の搭載隊は一部損傷でも全体が撃破される',`const ship=bodyUnit('sea'),p=bodyUnit('infantry');ship.groundLanding=true;ship.groundPassengers=[p];p.embarked=ship;groundBodyHit(p,p.bodies[0],p.bodies[0].hp*.8);groundTransportDestroyed(ship,ship);return !p.alive&&p.hpPool===0&&p.bodies.every(b=>!b.alive&&b.hp===0)&&p.ships.length===0;`);
 check('体のない隊は従来のdamage・消耗・均等損害を維持',`const f=bodyUnit('vehicle',0,0,0,false),t=bodyUnit('vehicle',1,0,8,false),hp=t.hpPool;damage(t,1,f);if(!bodyClose(t.hpPool,hp-groundRuleSet().combat.damageScale)||t.bodies)return false;groundBodiesSpread(t,3);return bodyClose(t.hpPool,hp-groundRuleSet().combat.damageScale-3);`);
 check('全体が撃てると元の1発と同じで、描画へ体ごとの射撃を渡す',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8);const w=groundDirectWeapon(f,t),hp=t.hpPool;bodyReady(f);groundBodyFire(f,t,0);return bodyShots.length===4&&bodyClose(hp-t.hpPool,w.power*w.armorFactor*groundRuleSet().combat.damageScale)&&bodyShots.every((s,i)=>s.from.equals(groundBodyPosition(f,i))&&t.bodies.some((b,j)=>s.to.equals(groundBodyPosition(t,j))));`);
 check('射程は射手の体から最も近い相手の生存体まで',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8);const h=groundBodyTarget(f,0,t,100);if(!h)return false;const nearest=t.bodies.map((b,j)=>({j,d:groundBodyPosition(t,j).distanceTo(h.from)})).sort((a,b)=>a.d-b.d)[0];if(h.j!==nearest.j||groundBodyTarget(f,0,t,nearest.d-.001))return false;groundBodyHit(t,h.b,1e6);return groundBodyTarget(f,0,t,100).j!==h.j;`);
 check('丘の陰の1体は撃たず、ほかの体だけ撃つ',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8,false);bodyLayout(f,[[-1,0],[1,0],[2,0],[3,0]]);groundSightHeight=(x,z)=>x<-.1&&z>2&&z<6?2:0;f.dmg=.001;bodyReady(f);groundBodyFire(f,t,0);return bodyShots.length===3&&!bodyShots.some(s=>s.from.x<0)&&groundCanFire(f,t);`);
 check('体が1つ減ると直射の量も4分の3',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8);groundBodyHit(f,f.bodies[0],1e6);const w=groundDirectWeapon(f,t),hp=t.hpPool;bodyReady(f);groundBodyFire(f,t,0);return bodyShots.length===3&&bodyClose(hp-t.hpPool,w.power*w.armorFactor*groundRuleSet().combat.damageScale*.75);`);
 check('1体1発の補給は隊1発の4分の1',`op.groundHQ={0:'A',1:'F'};const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8);f.dmg=.001;const supply=f.groundSupply;bodyReady(f);groundBodyFire(f,t,0);return bodyClose(supply-f.groundSupply,groundSupplyRules().shot);`);
 check('再射撃は各体のfireEvery、死んだ体は発射しない',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8);f.dmg=.001;bodyReady(f);groundBodyFire(f,t,0);groundBodyFire(f,t,.4);if(bodyShots.length!==4)return false;groundBodyHit(f,f.bodies[0],1e6);groundBodyFire(f,t,.61);return bodyShots.length===7;`);
 check('敵のいない間も初期位相を保ち接敵時に全員が同時射撃しない',`const f=bodyUnit();f.dmg=.001;for(let i=0;i<40;i++){gameSec+=.05;groundStep(.05);}const t=bodyUnit('vehicle',1,0,8);f.stance='engage';const counts=[];for(let i=0;i<20;i++){gameSec+=.05;groundStep(.05);counts.push(bodyShots.length);}return bodyShots.length===4&&new Set(counts.filter(n=>n>0)).size>1;`);
 check('対空も各体が射撃し元の1発と同じ合計',`const f=bodyUnit('mobileAA'),t=bodyUnit('fighter',1,0,8);f.dmg=.001;bodyReady(f);const hp=t.hpPool;groundAutoAAStep(0);return bodyShots.length===f.bodies0&&bodyClose(hp-t.hpPool,f.dmg*groundRuleSet().combat.mobileAAAir*groundRuleSet().combat.damageScale)&&!f.groundAAResolving;`);
 check('射線の再利用は同時刻だけ、移動・撃破・次の時刻で再確認',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8),real=groundClearLine;let rays=0;groundClearLine=(...a)=>{rays++;return real(...a);};try{const hit=groundBodyTarget(f,0,t,100);groundBodyTarget(f,0,t,100);if(rays!==1)return false;t.pos.x+=1;groundBodyTarget(f,0,t,100);if(rays!==2)return false;groundBodyHit(t,hit.b,1e6);groundBodyTarget(f,0,t,100);gameSec+=.05;groundBodyTarget(f,0,t,100);return rays===4;}finally{groundClearLine=real;}`);
 check('体の位置は向きで回し、描画の座標を参照しない',`const f=bodyUnit();bodyLayout(f,[[1,2],[0,0],[0,0],[0,0]]);f.heading.set(1,0,0);const p=groundBodyPosition(f,0);f.groundModel.userData.formation.bodies[0].position.set(999,999,999);return bodyClose(p.x,f.pos.x+2)&&bodyClose(p.z,f.pos.z-1)&&groundBodyPosition(f,0).equals(p);`);
 check('航空機と空中WASの体位置は隊の位置',`for(const kind of ['fighter','attack','was']){const f=bodyUnit(kind);f.band='low';if(!f.bodies.every((b,i)=>groundBodyPosition(f,i).equals(f.pos)))return false;}return true;`);
 check('全員同じ爆風位置なら合計は従来の1発',`const f=bodyUnit('artillery'),t=bodyUnit('vehicle',1,0,8);bodyLayout(t,[[0,0],[0,0],[0,0],[0,0]]);const hp=t.hpPool,s={source:f,team:0,kind:'artillery',impact:t.pos.clone(),radius:4,dmg:1,left:0};bodyBlast(s);return bodyClose(hp-t.hpPool,groundRuleSet().combat.damageScale)&&bodyClose(t.hpPool,bodySum(t));`);
 check('爆風外の体は無傷、中心と縁は体の距離で軽減',`const f=bodyUnit('artillery'),t=bodyUnit('vehicle',1,0,8);bodyLayout(t,[[0,0],[.3,0],[.6,0],[.61,0]]);const hp=t.bodies.map(b=>b.hp);bodyBlast({source:f,team:0,kind:'artillery',impact:t.pos.clone(),radius:4,dmg:1,left:0});const loss=t.bodies.map((b,i)=>hp[i]-b.hp);return loss[0]>loss[1]&&loss[1]>loss[2]&&bodyClose(loss[2],groundRuleSet().combat.damageScale*1/9/4)&&loss[3]===0;`);
 check('隊の中心が爆風外でも中の体だけ被弾',`const f=bodyUnit('artillery'),t=bodyUnit('vehicle',1,5,8);bodyLayout(t,[[-4.8,0],[0,0],[1,0],[2,0]]);const hp=t.bodies.map(b=>b.hp),s={source:f,team:0,kind:'artillery',impact:new THREE.Vector3(0,0,8),radius:2,dmg:1,left:0,resolving:true};if(!groundStrikeHits(s,t,f))return false;bodyBlast(s);return t.bodies[0].hp<hp[0]&&t.bodies.slice(1).every((b,i)=>b.hp===hp[i+1]);`);
 check('地点攻撃の単発は初期体数で割り、撃破で二重に減らさない',`const f=bodyUnit(),p=new THREE.Vector3(0,0,8),a=groundStrikeLaunch(f,p,p);if(!a||!bodyClose(a.dmg,f.dmg*(groundStrikeWeapon(f).dmgScale??1)/f.bodies0))return false;groundBodyHit(f,f.bodies[0],1e6);f.groundStrikeCooldown=0;const b=groundStrikeLaunch(f,p,p);return b&&bodyClose(b.dmg,a.dmg);`);
 check('体が全員撃てない攻撃命令は実際に近づく',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8);bodyLayout(f,[[100,0],[101,0],[102,0],[103,0]]);f.stance='engage';order(f,{type:'attack',target:t});f.groundDeployed=true;const blocked=!groundAnyBodyCanFire(f,t),before=f.pos.clone();groundStep(.1);return blocked&&f.pos.distanceTo(before)>0;`);
 check('進撃中も体が全員撃てなければ立ち止まらない',`const f=bodyUnit(),t=bodyUnit('vehicle',1,0,8);bodyLayout(f,[[100,0],[101,0],[102,0],[103,0]]);f.stance='engage';order(f,{type:'move',dest:new THREE.Vector3(0,0,12),groundAdvance:true});f.fireTarget=t;const before=f.pos.clone();groundStep(.1);return f.pos.distanceTo(before)>0;`);
 check('占領は戦車4体でも1隊、別の隊と合わせて占領',`const a=bodyUnit(),b=bodyUnit('vehicle',0,0,1),site={id:'body-test',pos:new THREE.Vector3(),captureRadius:8,captureSec:.5,owner:null,progress:[0,0]};groundSites=[site];b.pos.x=100;groundCaptureStep(1);if(site.owner!==null)return false;b.pos.x=0;groundCaptureStep(1);return site.owner===0;`);
 return rows;
}
// Browser checks use the actual label, roster and moving/standing meshes.
function bodyScene(kind='vehicle',pair=false){
 reset({op:'groundExercise2',fleets:[{name:'体の確認小隊',kind,at:[12,27],stance:'evade',platoons:1}]});if(talking)endTalk();if(deploying)endDeploy();setSpeed(0);
 for(const f of fleets){f.stance='evade';groundClearOrders(f);if(f.name!=='体の確認小隊')f.alive=false;}
 // 布陣した形で置き直す（体ごとの動きの体は、布陣の位置から始める）
 const f=fleets.find(f=>f.alive);f.groundDeployed=true;f.heading.set(0,0,1);f.groundTrack=null;
 if(pair){op={...op,groundStaticEnemies:false};const t=makeFleet(1,groundUnitSpec({name:'対向歩兵小隊',kind,at:[12,27.5],stance:'evade',platoons:1}));fleets.push(t);groundInitUnit(t);t.groundDeployed=true;t.groundTrack=null;f.stance=t.stance='engage';}
 setSel([f]);groundUpdateSight();return f.name;
}
async function checkGroundBodies(page,check){
 await page.evaluate('window.bodyScene='+bodyScene.toString());
 await page.evaluate(()=>bodyScene());
 for(const r of await page.evaluate(()=>{
  const rows=[],f=selected,record=(n,ok)=>rows.push({name:n,ok:!!ok});
  groundDraw();updateRoster();updateFleetLabel(f,false,'');
  record('名札と一覧は最初に×4',f.el.querySelector('.mk2 em').textContent==='×4'&&f.btn.querySelector('.no small').textContent.includes('×4'));
  groundBodyHit(f,f.bodies[1],1e6);groundDraw();updateRoster();updateFleetLabel(f,false,'');
  record('名札と一覧は撃破後×3',f.el.querySelector('.mk2 em').textContent==='×3'&&f.btn.querySelector('.no small').textContent.includes('×3'));
  // 向きを変えた直後は体がなめらかに回って寄る（世界の向きでならす、2026-11-18）ので、落ち着いてから比べる
  for(let i=0;i<200;i++){gameSec+=.05;groundDraw();}
  const form=f.groundModel.userData.formation,others=form.bodies.map(b=>b.position.clone());
  for(let i=0;i<20;i++){gameSec+=.05;groundDraw();}
  record('停止中も撃破体は消えたままで空所を詰めない',!form.bodies[1].visible&&form.bodies.filter((b,i)=>i!==1).every((b,i)=>b.position.distanceTo(others[i<1?i:i+1])<1e-6)&&form.bodies.every((b,i)=>{const t=form.layouts.defend[i];return Math.hypot(b.position.x-t.x,b.position.z-t.z)<1e-4;}));
  order(f,{type:'move',dest:f.pos.clone().add(new THREE.Vector3(0,0,8))});const before=f.pos.clone();
  for(let i=0;i<20;i++){gameSec+=.05;groundStep(.05);groundDraw();}
  record('実移動後も撃破体は復活しない',f.pos.distanceTo(before)>0&&!form.bodies[1].visible);
  const p=makeFleet(0,groundUnitSpec({name:'歩兵の姿勢確認',kind:'infantry',at:[10,27],platoons:1}));fleets.push(p);groundInitUnit(p);groundBodyHit(p,p.bodies[2],1e6);
  order(p,{type:'move',dest:p.pos.clone().add(new THREE.Vector3(0,0,8))});
  for(let i=0;i<20;i++){gameSec+=.05;groundStep(.05);groundDraw();}
  const pose=p.groundModel.userData.pose;
  record('歩行姿勢が切り替わっても撃破体は復活しない',!pose.stand[2].visible&&pose.move[2].every(b=>!b.visible));
  return rows;
 }))check(r.ok,'地上の体: '+r.name);
}
module.exports={nodeChecks,checkGroundBodies,bodyScene};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(rows);assert.equal(bad.length,0,JSON.stringify(bad));console.log('体の確認 '+rows.length+'件に通りました。');}
