/* Node専用。既存の独立VM fixtureから実際の射程・視線・HP・補給処理を使用する。 */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
function createContext(){
  const {ctx,run}=require('./ground-landing.cjs').createGroundContext();
  run(fs.readFileSync(path.join(__dirname,'../battle/ground-aa.js'),'utf8'));
  run(`const aaActualDamage=damage,aaActualSupplyShot=groundSupplyShot;
    var hits=[],shots=[],supplyShots=0,rejected=0;
    // mainの専用damage入口と同じ契約をfixtureで接続。HPの処理自体はsim.jsの実関数。
    groundCanFire=(f,t)=>groundAutoAAHit(f,t);
    groundFireMode=(f,t)=>groundAutoAAHit(f,t)?'direct':null;
    damage=(t,amount,src)=>{if(!groundAutoAAHit(src,t)){rejected++;return;}const before=t.hpPool;aaActualDamage(t,amount,src);hits.push({source:src,target:t,amount,before,after:t.hpPool,resolving:src.groundAAResolving});};
    const aaDamageCallback=damage;
    groundSupplyShot=(f,...args)=>{supplyShots++;aaActualSupplyShot(f,...args);};
    shoot=(from,to,color,size)=>shots.push({from:from.clone(),to:to.clone(),color,size});
    function resetAA(){op={ground:'exercise2',groundHQ:{0:'A',1:'B'},wipeLose:false};fleets=[];groundHeight=groundSightHeight=()=>0;groundForests=[];groundBuildings=[];groundSites=[];hits=[];shots=[];supplyShots=0;rejected=0;damage=aaDamageCallback;engaged.clear();over=false;}
    function unit(kind='mobileAA',team=0,x=0,band){const p=new THREE.Vector3(x,0,0),f=makeFleet(team,{name:kind,type:kind==='sea'?'cl':'cv',groundKind:kind,n:1,scale:.3,pos:[p.x,p.z],stance:'evade'});f.band=band||(['fighter','attack','supportAircraft'].includes(kind)?'high':'ground');f.pos.y=groundRules().heights[f.band]||0;f.groundVisible=[true,true];f.hpPool=f.max=1000;f.eva=0;return f;}
    function scene(kind='mobileAA',distance=4){const f=unit(kind),t=unit('fighter',1,distance);fleets=[f,t];return {f,t};}
    function close(a,b){return Math.abs(a-b)<1e-7;}
  `);
  return {ctx,run};
}
function nodeChecks(){
  const {run}=createContext(),rows=[];
  const check=(name,code)=>{try{run('resetAA();');rows.push({name,ok:!!run(code)});}catch(error){rows.push({name,ok:false,error:error.message});}};
  check('航空機を除外し地上・海上・空中WASを対象とする',`['vehicle','sea','infantry','was'].every(k=>groundAutoAASource(unit(k)))&&['fighter','attack','supportAircraft'].every(k=>!groundAutoAASource(unit(k)))&&!groundAutoAASource(null)&&!groundAutoAASource({})`);
  check('対空射程は地上WAS6km・空中15km・巡洋艦150km',`groundAARange(unit('was'))===24&&groundAARange(unit('was',0,0,'low'))===60&&groundAARange(unit('was',0,0,'high'))===60&&groundAARange(unit('sea'))===600`);
  check('実damageは解決フラグ内だけ通り補給を1回消費',`(()=>{const {f,t}=scene();const expected=f.dmg*groundFireFactor(f,t)*groundMatchup(f,t)*groundSupplyAttackFactor(f),before=t.hpPool;groundAutoAAStep(.05);return hits.length===1&&close(before-t.hpPool,expected)&&hits[0].resolving===t&&f.groundAAResolving===null&&f.groundAATarget===t&&supplyShots===1&&close(f.groundSupply,99.5)&&shots[0].size===.25;})()`);
  check('フラグなし・他目標フラグではdamageを迂回できない',`(()=>{const {f,t}=scene(),other=unit('fighter',1,2),hp=t.hpPool;damage(t,100,f);f.groundAAResolving=other;damage(t,100,f);f.groundAAResolving=t;t.groundVisible[0]=false;damage(t,100,f);return hits.length===0&&t.hpPool===hp&&rejected===3&&!groundAutoAAHit(f,t);})()`);
  check('空中目標以外・友軍は解決フラグがあっても拒否',`(()=>{const {f,t}=scene();f.groundAAResolving=t;t.band='ground';if(groundAutoAAHit(f,t))return false;t.band='high';t.team=f.team;return !groundAutoAAHit(f,t);})()`);
  check('移動・砲撃・連射・通常目標の参照と時計を変更しない',`(()=>{const {f}=scene('was'),order={type:'move',path:{}},fireTarget={band:'ground'},salvo={remaining:2},volley={ledger:{fired:new Set([0])}},queue=[{}];Object.assign(f,{order,fireTarget,groundAreaSalvo:salvo,groundVolley:volley,queue,groundShotT:77,groundStrikeCooldown:31.25});groundAutoAAStep(.05);return hits.length===1&&f.order===order&&f.fireTarget===fireTarget&&f.groundAreaSalvo===salvo&&salvo.remaining===2&&f.groundVolley===volley&&f.queue===queue&&f.groundShotT===77&&f.groundStrikeCooldown===31.25;})()`);
  check('通常タイマーや砲撃装填に関係なく独立した1秒間隔',`(()=>{const {f}=scene();f.groundShotT=50;f.groundStrikeCooldown=30;groundAutoAAStep(.05);groundAutoAAStep(.4);if(hits.length!==1)return false;groundAutoAAStep(.6);return hits.length===2&&f.groundAATimer===1&&f.groundShotT===50&&f.groundStrikeCooldown===30&&supplyShots===2;})()`);
  check('既存の対空タイマーが残っている間は撃たない',`(()=>{const {f}=scene();f.groundAATimer=.8;groundAutoAAStep(.2);if(hits.length)return false;groundAutoAAStep(.6);return hits.length===1&&f.groundAATimer===1;})()`);
  check('未観測・地上目標を飛ばし最も近い観測済み航空を選ぶ',`(()=>{const {f}=scene(),far=unit('fighter',1,8),near=unit('fighter',1,3),unseen=unit('fighter',1,1),land=unit('infantry',1,.5);unseen.groundVisible[0]=false;fleets=[f,far,unseen,land,near];groundAutoAAStep(.05);return hits.length===1&&hits[0].target===near&&f.groundAATarget===near;})()`);
  check('目標が撃破されたら残った航空を選び直す',`(()=>{const {f,t}=scene(),next=unit('fighter',1,8);fleets.push(next);groundAutoAAStep(.05);t.alive=false;groundAutoAAStep(1);return hits.length===2&&hits[1].target===next&&f.groundAATarget===next;})()`);
  check('150km射程でも目視未発見の航空は迎撃しない',`(()=>{const {f,t}=scene('sea',80);t.groundVisible[0]=groundCanSee(f,t);groundAutoAAStep(.05);return groundAARange(f)===600&&!groundCanSee(f,t)&&!groundSeenBy(f.team,t)&&hits.length===0&&!groundAASolution(f,t);})()`);
  check('友軍の観測した航空は自身の視界外でも迎撃できる',`(()=>{const {f,t}=scene('sea',80),scout=unit('scout',0,75);t.groundVisible[0]=groundCanSee(scout,t);fleets.push(scout);groundAutoAAStep(.05);return !groundCanSee(f,t)&&groundCanSee(scout,t)&&hits.length===1&&hits[0].source===f;})()`);
  check('建物に射線を遮られた航空には撃たない',`(()=>{const {f,t}=scene();groundBuildings=[{minX:1,maxX:2,minZ:-1,maxZ:1,bottom:0,top:100}];groundAutoAAStep(.05);return !groundLineOfSight(f,t)&&hits.length===0&&f.groundAATarget===null;})()`);
  check('水平射程の境界内だけ許可し航空高度で距離を水増ししない',`(()=>{const {f,t}=scene('mobileAA',16);if(!groundAASolution(f,t))return false;t.pos.x+=.001;return !groundAASolution(f,t);})()`);
  check('射手の死亡・搭載・不在・工事・敗走・士気0・帰投・固定を拒否',`(()=>{for(const flags of [{alive:false},{embarked:{}},{groundAirState:'base'},{groundBuilding:true},{groundRout:'routing'},{groundRout:'regroup'},{groundMorale:0},{groundAirState:'return'},{locked:true}]){const {f,t}=scene();Object.assign(f,flags);if(groundAASolution(f,t))return false;groundAutoAAStep(.05);if(hits.length)return false;}return true;})()`);
  check('silent・設定の射撃禁止・対空無効を尊重',`(()=>{for(const flags of [{silent:true},{groundHoldFire:true},{groundAAEnabled:false}]){const {f,t}=scene();Object.assign(f,flags);groundAutoAAStep(.05);if(groundAASolution(f,t)||hits.length)return false;}return true;})()`);
  check('命令優先・自動交戦・停止防御のいずれでも迎撃',`(()=>{for(const stance of ['engage','evade']){const {f}=scene();f.stance=stance;f.order={type:'hold'};groundAutoAAStep(.05);if(hits[hits.length-1]?.source!==f||f.stance!==stance||f.order.type!=='hold')return false;}return hits.length===2;})()`);
  check('対空装備のない兵科へ能力を足さない',`(()=>{for(const kind of ['artillery','guidedRocket','droneHive','scout','engineer','supply']){const {f,t}=scene(kind,1);if(groundAARange(f)!==0||groundAASolution(f,t))return false;groundAutoAAStep(.05);if(hits.length)return false;}return true;})()`);
  check('航空機は通常戦闘に残し自動対空へ入れない',`(()=>{for(const kind of ['fighter','attack','supportAircraft']){const {f,t}=scene(kind,1);groundAutoAAStep(.05);if(groundAASolution(f,t)||groundAARange(f)||hits.length)return false;}return true;})()`);
  check('歩兵の低空0.5倍を維持し高空対象を追加しない',`(()=>{const {f,t}=scene('infantry',1);t.band='low';t.pos.y=groundRules().heights.low;groundAutoAAStep(.05);if(hits.length!==1||!close(hits[0].amount,f.dmg*.5))return false;t.band='high';return !groundAASolution(f,t);})()`);
  check('WASは空中で15kmの自動対空へ切り替わる',`(()=>{const {f,t}=scene('was',40);if(groundAASolution(f,t))return false;f.band='high';f.pos.y=groundRules().heights.high;groundAutoAAStep(.05);return hits.length===1&&groundAASolution(f,t)&&f.groundAATarget===t;})()`);
  check('訓練敵は対空でも味方へ打撃しない',`(()=>{const f=unit('mobileAA',1),t=unit('fighter',0,4);fleets=[f,t];op.groundDrill=true;const hp=t.hpPool;groundAutoAAStep(.05);return !groundAASolution(f,t)&&hits.length===0&&t.hpPool===hp&&supplyShots===0;})()`);
  check('デバッグ敵固定では自発対空も停止',`(()=>{const f=unit('mobileAA',1),t=unit('fighter',0,4);fleets=[f,t];op.groundStaticEnemies=true;groundAutoAAStep(.05);return !groundAASolution(f,t)&&hits.length===0;})()`);
  check('目標の搭載・不在・同陣営・地表は拒否',`(()=>{const {f,t}=scene();for(const flags of [{alive:false},{embarked:{}},{groundAirState:'base'},{team:0},{band:'ground'},{band:'sea'}]){const candidate={...t,...flags};if(groundAASolution(f,candidate))return false;}return true;})()`);
  check('禁止時に古い対空目標を消しても通常目標を保持',`(()=>{const {f,t}=scene(),normal={};groundAutoAAStep(.05);f.fireTarget=normal;f.groundHoldFire=true;groundAutoAAStep(.1);return f.groundAATarget===null&&f.fireTarget===normal&&hits.length===1&&f.groundAAResolving===null;})()`);
  check('damageが例外を投げても対空解決フラグを必ず解除',`(()=>{const {f,t}=scene();let caught=false;damage=(target,amount,src)=>{if(!groundAutoAAHit(src,target))throw Error('invalid context');throw Error('fixture');};try{groundAutoAAStep(.05);}catch(e){caught=e.message==='fixture';}finally{damage=aaDamageCallback;}return caught&&f.groundAAResolving===null&&f.groundAATimer===1;})()`);
  check('resetは対空専用の3フィールドだけを解除',`(()=>{const {f,t}=scene();f.groundAATimer=5;f.groundAATarget=t;f.groundAAResolving=t;f.groundShotT=7;f.groundStrikeCooldown=30;groundAutoAAReset();return f.groundAATimer===0&&f.groundAATarget===null&&f.groundAAResolving===null&&f.groundShotT===7&&f.groundStrikeCooldown===30;})()`);
  check('初回のfleets未定義でもreset可能',`(()=>{const saved=fleets;fleets=undefined;try{groundAutoAAReset();return true;}finally{fleets=saved;}})()`);
  check('地上作戦外・不正dtでは発射も通常時計変更もしない',`(()=>{const {f}=scene();f.groundShotT=7;groundAutoAAStep(NaN);groundAutoAAStep(-1);op={};groundAutoAAStep(1);return hits.length===0&&f.groundShotT===7;})()`);
  check('案内前の訓練航空は撃たず、手順で有効になれば迎撃',`(()=>{const {f,t}=scene();groundDrillAATargetAvailable=()=>false;try{groundAutoAAStep(.05);if(hits.length)return false;groundDrillAATargetAvailable=()=>true;groundAutoAAStep(.05);return hits.length===1;}finally{groundDrillAATargetAvailable=undefined;}})()`);
  check('装填中は射線探索を増やさず、次の発射時に遮蔽を再確認',`(()=>{const {f,t}=scene(),real=groundLineOfSight;let rays=0,blocked=false;groundLineOfSight=(...args)=>{rays++;return !blocked&&real(...args);};try{groundAutoAAStep(.05);const first=rays;if(hits.length!==1||!first)return false;for(let i=0;i<8;i++)groundAutoAAStep(.1);if(rays!==first)return false;blocked=true;groundAutoAAStep(.2);return rays>first&&hits.length===1&&f.groundAATarget===null;}finally{groundLineOfSight=real;}})()`);
  return rows;
}
module.exports={nodeChecks,createContext};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`地上自動対空 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
