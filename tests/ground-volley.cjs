/* 単発primitiveを制御した独立VM。実データの装填値と車両参照を使いブラウザを起動しない。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
function createContext(){
  const context=vm.createContext({THREE:require('three'),console});context.window=context;
  const run=code=>vm.runInContext(code,context),root=path.join(__dirname,'..');
  run(fs.readFileSync(path.join(root,'data/terrain/exercise2.js'),'utf8'));
  run(fs.readFileSync(path.join(root,'battle/ground-volley.js'),'utf8'));
  run(`var op={ground:'exercise2'},projectiles=[],now=0,attempts=0;
    function groundCommandAllowed(f){return !f.denied&&!f.groundRout&&f.groundMorale!==0;}
    function groundStrikeWeapon(f){if(!f.alive||f.embarked||f.locked||f.training||!groundCommandAllowed(f))return null;return WOS_TERRAIN.exercise2.strike[f.groundKind]||(f.groundKind==='was'?WOS_TERRAIN.exercise2.strike.artillery:null);}
    function groundAreaShot(f,area){if(area.blocked)return null;area.samples=(area.samples||0)+1;return {aim:area.points[0].clone(),impact:area.points[0].clone().add(new THREE.Vector3(area.samples/100,0,0))};}
    function groundStrikeLaunch(f,aim,impact,area,token){
      if(f.groundVolley!==token)throw Error('invalid primitive token');
      attempts++;if(f.blocked||f.failAt===attempts)return null;
      const share=1/token.ledger.entries.length;
      if(f.ammo<share-1e-8)return null;
      f.ammo-=share;f.spent+=share;
      const shot={source:f,aim:aim.clone(),impact:impact?.clone(),area,token,time:now,cost:share};projectiles.push(shot);return shot;
    }
    function unit(kind='guidedRocket',n=2){return {alive:true,groundKind:kind,ships:Array.from({length:n},(_,id)=>({id})),groundStrikeCooldown:0,groundVolley:null,ammo:10,spent:0};}
    function target(){return {point:new THREE.Vector3(10,0,0)};}
    function area(){return {points:[new THREE.Vector3(10,0,0)],radius:1};}
    function reset(){groundVolleyReset();projectiles=[];now=0;attempts=0;}
    function tick(f,dt){now+=dt;f.groundStrikeCooldown=Math.max(0,f.groundStrikeCooldown-dt);groundVolleyStep(dt);}
    function close(a,b){return Math.abs(a-b)<1e-7;}
    function groundSeenBy(){throw Error('scheduler must not read enemy/fog');}
    Object.defineProperty(globalThis,'fleets',{get(){throw Error('scheduler must not enumerate live units');}});
  `);
  return {run,context};
}
function nodeChecks(){
  const {run}=createContext(),rows=[];
  const check=(name,code)=>{try{run('reset();');rows.push({name,ok:!!run(code)});}catch(error){rows.push({name,ok:false,error:error.message});}};
  check('自走砲2両の一斉射は単発2発・装填8秒',`(()=>{const f=unit('artillery');return groundVolleyStart(f,target())&&projectiles.length===2&&!f.groundVolley&&f.groundStrikeCooldown===8&&close(f.spent,1)&&projectiles.every(s=>s.token.ledger.fired.size===2);})()`);
  check('戦車・艦・WAS・支援機も各残存車両1発',`(()=>{for(const [kind,reload] of [['vehicle',4],['sea',10],['was',8],['supportAircraft',10]]){const f=unit(kind);const before=projectiles.length;if(!groundVolleyStart(f,target())||projectiles.length-before!==2||f.groundVolley||f.groundStrikeCooldown!==reload)return false;}return true;})()`);
  check('ロケット2両は6群で12発・最後の群の後30秒',`(()=>{const f=unit();if(!groundVolleyStart(f,target())||projectiles.length!==2||!close(f.groundStrikeCooldown,31.25))return false;const ledger=f.groundVolley.ledger;for(let group=1;group<6;group++){tick(f,.25);if(projectiles.length!==(group+1)*2||!projectiles.slice(group*2).every(p=>close(p.time,group*.25)))return false;}return !f.groundVolley&&ledger.fired.size===12&&ledger.skipped.size===0&&close(f.groundStrikeCooldown,30)&&close(f.spent,1);})()`);
  check('0.25秒より前に次群を撃たない',`(()=>{const f=unit();groundVolleyStart(f,target());tick(f,.249);if(projectiles.length!==2)return false;tick(f,.001);return projectiles.length===4;})()`);
  check('大きいdtでも各発射枠を1回だけ処理',`(()=>{const f=unit();groundVolleyStart(f,target());tick(f,2);if(projectiles.length!==12||f.groundVolley||!close(f.groundStrikeCooldown,30))return false;tick(f,100);return projectiles.length===12&&f.groundStrikeCooldown===0;})()`);
  check('停止後に追加発射せず補給・cooldownも巻き戻さない',`(()=>{const f=unit();groundVolleyStart(f,target());const spent=f.spent,cooldown=f.groundStrikeCooldown;groundVolleyCancel(f);if(f.groundStrikeCooldown!==cooldown||f.spent!==spent)return false;tick(f,1);return projectiles.length===2&&!f.groundVolley&&f.spent===spent;})()`);
  check('Undoは共有台帳の発射済みを再発射しない',`(()=>{const f=unit();groundVolleyStart(f,target());const saved=groundCopyVolley(f.groundVolley),ledger=saved.ledger;tick(f,.25);groundVolleyCancel(f);const ammo=f.ammo,cooldown=f.groundStrikeCooldown;f.groundVolley=groundRestoreVolley(f,saved);if(!f.groundVolley||f.groundVolley===saved||f.groundVolley.ledger!==ledger||f.ammo!==ammo||f.groundStrikeCooldown!==cooldown)return false;tick(f,.25);if(projectiles.length!==4)return false;tick(f,.25);if(projectiles.length!==6)return false;tick(f,1);return projectiles.length===12&&ledger.fired.size===12&&close(f.spent,1)&&!groundRestoreVolley(f,saved);})()`);
  check('装填0まで待ってからUndoしても最終群後30秒を確保',`(()=>{const f=unit();groundVolleyStart(f,target());const saved=groundCopyVolley(f.groundVolley);groundVolleyCancel(f);tick(f,40);f.groundVolley=groundRestoreVolley(f,saved);if(f.groundStrikeCooldown!==0)return false;tick(f,1.25);return projectiles.length===12&&!f.groundVolley&&close(f.groundStrikeCooldown,30)&&close(f.spent,1);})()`);
  check('撃破車両の未発射枠は省略・補給は実射分だけ',`(()=>{const f=unit();groundVolleyStart(f,target());const ledger=f.groundVolley.ledger;f.ships.pop();tick(f,1.25);return projectiles.length===7&&ledger.fired.size===7&&ledger.skipped.size===5&&!f.groundVolley&&close(f.spent,7/12);})()`);
  check('後から追加した車両に新しい弾を割り当てない',`(()=>{const f=unit();groundVolleyStart(f,target());f.ships.push({id:99});tick(f,2);return projectiles.length===12&&close(f.spent,1);})()`);
  check('撃破で省略済みの枠は車両を戻しても復活しない',`(()=>{const f=unit();groundVolleyStart(f,target());const saved=groundCopyVolley(f.groundVolley),lost=f.ships.pop();tick(f,.25);f.ships.push(lost);groundVolleyCancel(f);f.groundVolley=groundRestoreVolley(f,saved);tick(f,2);return projectiles.length===7&&saved.ledger.skipped.size===5&&!groundRestoreVolley(f,saved);})()`);
  check('全車両喪失の復元は未発射弾を復活させない',`(()=>{const f=unit();groundVolleyStart(f,target());const saved=groundCopyVolley(f.groundVolley),ships=f.ships;groundVolleyCancel(f);f.ships=[];if(groundRestoreVolley(f,saved)!==null)return false;f.ships=ships;return groundRestoreVolley(f,saved)===null&&projectiles.length===2;})()`);
  check('初回発射不可なら一斉射不成立・補給と装填なし',`(()=>{const f=unit();f.blocked=true;return !groundVolleyStart(f,target())&&!f.groundVolley&&projectiles.length===0&&f.spent===0&&f.groundStrikeCooldown===0;})()`);
  check('初回の一部だけ発射できた場合は成立・実射分だけ消費',`(()=>{const f=unit();f.failAt=2;return groundVolleyStart(f,target())&&projectiles.length===1&&!f.groundVolley&&close(f.spent,1/12)&&close(f.groundStrikeCooldown,31.25)&&projectiles[0].token.ledger.fired.size===1;})()`);
  check('残りの照準不可でburstを中止し台帳はUndo可能',`(()=>{const f=unit(),a=area();groundVolleyStart(f,{area:a});const saved=groundCopyVolley(f.groundVolley);a.blocked=true;tick(f,.25);if(f.groundVolley||projectiles.length!==2||saved.ledger.fired.size!==2)return false;a.blocked=false;f.groundVolley=groundRestoreVolley(f,saved);tick(f,2);return projectiles.length===12&&close(f.spent,1);})()`);
  check('範囲内の照準と着弾は各発独立・area参照は共有',`(()=>{const f=unit(),a=area();groundVolleyStart(f,{area:a});tick(f,2);return a.samples===12&&projectiles.every(p=>p.area===a&&p.impact&&p.aim!==p.impact)&&new Set(projectiles.map(p=>p.impact.x)).size===12;})()`);
  check('地点指定は入力をコピーし散布をprimitiveへ任せる',`(()=>{const f=unit(),t=target();groundVolleyStart(f,t);const v=f.groundVolley;t.point.set(99,99,99);tick(f,2);return v.ledger.point.x===10&&projectiles.every(p=>p.aim.x===10&&p.impact===undefined&&p.area===null);})()`);
  check('不在・指示不可・訓練敵は開始も継続もできない',`(()=>{for(const flags of [{alive:false},{embarked:{}},{locked:true},{denied:true},{training:true},{groundMorale:0}]){const f=Object.assign(unit(),flags);if(groundVolleyStart(f,target())||f.spent)return false;}const f=unit();groundVolleyStart(f,target());f.training=true;tick(f,.25);return projectiles.length===2&&!f.groundVolley;})()`);
  check('継続中の重複開始と装填中の新規開始を拒否',`(()=>{const f=unit();groundVolleyStart(f,target());const v=f.groundVolley;if(groundVolleyStart(f,target())||f.groundVolley!==v)return false;groundVolleyCancel(f);return !groundVolleyStart(f,target())&&projectiles.length===2;})()`);
  check('補給不足の発射失敗では補給も発射済み数も増えない',`(()=>{const f=unit();f.ammo=1/6;groundVolleyStart(f,target());const ledger=f.groundVolley.ledger;tick(f,.25);return projectiles.length===2&&ledger.fired.size===2&&!f.groundVolley&&close(f.spent,1/6);})()`);
  check('resetは全active wrapperを外し旧Undoを失効・弾は巻き戻さない',`(()=>{const a=unit(),b=unit();groundVolleyStart(a,target());groundVolleyStart(b,target());const saved=groundCopyVolley(a.groundVolley),ammo=a.ammo,cooldown=a.groundStrikeCooldown;groundVolleyReset();tick(a,2);return !a.groundVolley&&!b.groundVolley&&!groundRestoreVolley(a,saved)&&projectiles.length===4&&a.ammo===ammo&&close(a.groundStrikeCooldown,cooldown-2);})()`);
  check('copyは台帳とelapsedだけ保持し補給・装填snapshotを作らない',`(()=>{const f=unit();groundVolleyStart(f,target());const v=f.groundVolley,s=groundCopyVolley(v);return s!==v&&s.ledger===v.ledger&&s.elapsed===v.elapsed&&Object.keys(s).sort().join(',')==='elapsed,ledger'&&groundCopyVolley(null)===null;})()`);
  check('無効target・車両なし・他隊のUndoは拒否',`(()=>{const f=unit();if(groundVolleyStart(unit('artillery',0),target())||groundVolleyStart(f,{})||groundVolleyStart(f,{...target(),area:area()})||groundVolleyStart(f,{point:new THREE.Vector3(NaN,0,0)}))return false;groundVolleyStart(f,target());const saved=groundCopyVolley(f.groundVolley);return !groundRestoreVolley(unit(),saved);})()`);
  check('負・非有限dtはburst時計を進めない',`(()=>{const f=unit();groundVolleyStart(f,target());const v=f.groundVolley;groundVolleyStep(NaN);groundVolleyStep(-1);groundVolleyStep(Infinity);groundVolleyStep(0);return v.elapsed===0&&projectiles.length===2;})()`);
  return rows;
}
module.exports={nodeChecks,createContext};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`地上一斉射 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
