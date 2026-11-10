/* 地上の一斉射スケジューラ。globalsは呼出し時だけ読む。照準・散布・補給は単発primitiveへ任せる。
   fired/skippedはUndoと共有する台帳。取消で未発射を消費せず、発射済みを復元しない。 */
let groundVolleySerial=0,groundVolleyEpoch=0,groundVolleySources=new Set();
function groundVolleyEligible(f){
  return !!f&&f.alive&&!f.embarked&&!f.locked&&groundCommandAllowed(f,'strike')&&!!groundStrikeWeapon(f);
}
function groundVolleyPending(ledger){return ledger.entries.some(e=>!ledger.fired.has(e.id)&&!ledger.skipped.has(e.id));}
function groundVolleyCancel(f){
  if(f)f.groundVolley=null;
  groundVolleySources.delete(f);
}
function groundVolleyReset(){
  for(const f of groundVolleySources)f.groundVolley=null;
  groundVolleySources.clear();groundVolleyEpoch++;
}
function groundCopyVolley(v){
  return v?.ledger&&Number.isFinite(v.elapsed)?{ledger:v.ledger,elapsed:Math.max(0,v.elapsed)}:null;
}
function groundRestoreVolley(f,snapshot){
  const ledger=snapshot?.ledger;
  if(!ledger||ledger.source!==f||ledger.epoch!==groundVolleyEpoch||!Number.isFinite(snapshot.elapsed)||!groundVolleyEligible(f))return null;
  // 一度失った車両の枠は、後から車両が追加されても再利用しない。
  const live=new Set(f.ships||[]);
  for(const e of ledger.entries)if(!ledger.fired.has(e.id)&&!live.has(e.vehicle))ledger.skipped.add(e.id);
  if(!groundVolleyPending(ledger))return null;
  groundVolleySources.add(f);
  // 呼出し側がf.groundVolleyへ代入する。ここでは補給・cooldown・発射済み集合を巻き戻さない。
  return {ledger,elapsed:Math.max(0,snapshot.elapsed)};
}
function groundVolleyFinish(f,v){
  // 取消後に旧cooldownが0になってからUndoしても、最後の実射後の装填を飛ばせない。
  if(v.ledger.fired.size)f.groundStrikeCooldown=Math.max(f.groundStrikeCooldown||0,v.ledger.reload);
  if(f.groundVolley===v)groundVolleyCancel(f);
}
function groundVolleyEmit(f,v){
  if(f.groundVolley!==v)return 0;
  if(!groundVolleyEligible(f)){groundVolleyCancel(f);return 0;}
  const ledger=v.ledger;let emitted=0;
  for(const entry of ledger.entries){
    if(f.groundVolley!==v)break;
    if(ledger.fired.has(entry.id)||ledger.skipped.has(entry.id))continue;
    if(!f.ships.includes(entry.vehicle)){ledger.skipped.add(entry.id);continue;}
    if(entry.at>v.elapsed+1e-8)continue;
    if(!groundVolleyEligible(f)){groundVolleyCancel(f);break;}
    const shot=ledger.shot?{aim:ledger.shot.aim.clone(),impact:ledger.shot.impact?.clone()||null}:ledger.area?groundAreaShot(f,ledger.area):{aim:ledger.point.clone(),impact:null};
    if(!shot?.aim){groundVolleyCancel(f);break;}
    const projectile=groundStrikeLaunch(f,shot.aim,shot.impact||null,ledger.area||null,v);
    if(!projectile){groundVolleyCancel(f);break;}
    ledger.fired.add(entry.id);emitted++;
  }
  if(f.groundVolley===v&&!groundVolleyPending(ledger))groundVolleyFinish(f,v);
  return emitted;
}
function groundVolleyStart(f,target){
  if(!groundVolleyEligible(f)||f.groundVolley||(f.groundStrikeCooldown||0)>1e-8||!Array.isArray(f.ships)||!f.ships.length)return false;
  if(!target||!!target.area===!!target.point)return false;
  if(target.point&&![target.point.x,target.point.y,target.point.z].every(Number.isFinite))return false;
  const weapon=groundStrikeWeapon(f),rocket=f.groundKind==='guidedRocket',rounds=rocket?weapon.rocketsPerVolley:1,interval=rocket?weapon.burstInterval:0;
  if(!Number.isInteger(rounds)||rounds<1||!Number.isFinite(interval)||interval<0||!Number.isFinite(weapon.reload)||weapon.reload<0)return false;
  const vehicles=f.ships.slice(),entries=[];
  for(let round=0;round<rounds;round++)for(const vehicle of vehicles)entries.push({id:entries.length,vehicle,round,at:round*interval});
  const ledger={id:++groundVolleySerial,epoch:groundVolleyEpoch,source:f,area:target.area||null,
    point:target.point?target.point.clone():null,shot:target.shot?{aim:target.shot.aim.clone(),impact:target.shot.impact?.clone()||null}:null,entries,fired:new Set(),skipped:new Set(),reload:weapon.reload,burstDuration:(rounds-1)*interval};
  const v={ledger,elapsed:0};f.groundVolley=v;groundVolleySources.add(f);
  const emitted=groundVolleyEmit(f,v);
  if(!emitted){if(f.groundVolley===v)groundVolleyCancel(f);return false;}
  f.groundStrikeCooldown=Math.max(f.groundStrikeCooldown||0,ledger.reload+ledger.burstDuration);
  return true;
}
// mainはcooldown・着弾処理の後、次の範囲一斉射を開始する前に呼ぶ。
function groundVolleyStep(dt){
  if(!Number.isFinite(dt)||dt<0)return;
  for(const f of [...groundVolleySources]){
    const v=f.groundVolley;
    if(!v||v.ledger.source!==f||v.ledger.epoch!==groundVolleyEpoch){groundVolleyCancel(f);continue;}
    v.elapsed+=dt;groundVolleyEmit(f,v);
  }
}
