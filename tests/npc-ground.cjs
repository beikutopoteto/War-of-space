/* Nodeの実地上処理と、Chromiumの実画面から同じ橋渡しを確認する。 */
const assert=require('node:assert/strict');
function bridgeCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 npcGroundInit();const c=npcGroundState.commanders.get(1),sit=npcGroundSituation(c);
 check('本営・目標・初期所有・影響半径をkmで渡す',sit.zones.find(z=>z.id==='B').goal&&sit.zones.find(z=>z.id==='B').base==='foe'&&sit.zones.find(z=>z.id==='F').base==='own'&&sit.zones.find(z=>z.id==='A').known==='foe'&&sit.zones.find(z=>z.id==='A').r===5);
 const hidden=sit.zones.find(z=>z.id==='A');check('見えていない他軍の拠点はowner:null',!hidden.seen&&hidden.owner===null);
 const red=fleets.find(f=>f.team===1&&f.groundKind==='vehicle'),blue=fleets.find(f=>f.team===0&&f.groundKind==='vehicle'),full=red.hpPool;
 red.hpPool=full/2;check('兵科の重み×残存耐久',Math.abs(npcGroundPower(red)-1)<1e-8);red.hpPool=full;
 const flags=['groundRout','groundRecover','embarked','groundAirState','groundBuilding','groundUnloading','locked'];
 check('敗走・再集結・搭乗・帰投・架橋・上陸は命令不可',flags.every(key=>{const old=red[key];red[key]=true;const blocked=!npcGroundFree(red);red[key]=old;return blocked;}));
 // 既知の接触を固定し、見えない相手の位置と耐久を変更してもsituは記録値を使う。
 const oldContact=blue.groundContacts[1],oldVisible=blue.groundVisible[1],oldPos=blue.pos.clone(),oldHp=blue.hpPool;
 blue.groundContacts[1]={pos:groundPoint(14,20),at:gameSec-12,power:.75,role:'shock'};blue.groundVisible[1]=false;blue.pos.copy(groundPoint(5,10));blue.hpPool=1;
 const contact=npcGroundSituation(c).contacts.find(e=>e.id===blue.id);
 check('視界外は記録した位置・力・経過秒だけ',contact.x===14&&contact.z===20&&contact.power===.75&&contact.age===12);
 blue.pos.copy(oldPos);blue.hpPool=oldHp;blue.groundContacts[1]=oldContact;blue.groundVisible[1]=oldVisible;
 const savedNet=groundSupplyNet;
 const fakeSites=groundSites.slice(0,3),nodes=[0,1,2].map(x=>({x:x*3,y:0,edges:[]})),edges=[{a:0,b:1,open:true},{a:1,b:2,open:false}];
 edges.forEach((e,i)=>{nodes[e.a].edges.push(i);nodes[e.b].edges.push(i);});groundSupplyNet={nodes,edges,sites:new Map(fakeSites.map((s,i)=>[s,i]))};
 const links=npcGroundLinks();check('道路長・閉鎖・他拠点で探索を止める',links.length===2&&links.every(l=>l.len===3)&&links.some(l=>l.open===false)&&!links.some(l=>[l.a,l.b].includes(fakeSites[0].id)&&[l.a,l.b].includes(fakeSites[2].id)));
 edges[1].open=true;check('開通した道路の状態を再構築する',npcGroundLinks().every(l=>l.open));groundSupplyNet=savedNet;
 const point=npcGroundPassPoint(red,12,3);check('海の中の目的地は通れる近傍へ補正',point&&groundPass(groundMapX(point.x),groundMapY(point.z),groundMoveKind(red)));
 const air=fleets.find(f=>f.team===1&&f.groundKind==='fighter'),band=air.band,p=npcGroundPassPoint(air,35,26);check('航空機の高度段を変えない',p.y===air.pos.y&&air.band===band);
 const original=order;let issued=0;order=(...args)=>{issued++;original(...args);};
 const u=sit.units.find(u=>u.id===red.id),plan={tasks:[{type:'hold',zone:'E',from:'F',units:[{id:red.id,as:'main'}]}]};
 npcGroundApply(c,sit,plan);const first=issued;npcGroundApply(c,sit,plan);check('同じ目的地へ命令を出し直さない',first===1&&issued===1);
 red.order=null;red.pos.copy(groundPoint(26,27));npcGroundApply(c,sit,plan);check('命令なしで1km以上離れた隊には再発令',issued===2);order=original;
 return rows;
}
function nodeChecks(){
 const {run}=require('./ground-drill.cjs').createDrillContext(false);
 const movement=run(`(()=>{
   const start=new Map(fleets.filter(f=>f.team===1).map(f=>[f.id,f.pos.clone()]));
   for(let i=0;i<80&&!over;i++)step(.05);
   const tasks=npcDebug()[1].plan.tasks.filter(k=>['seize','recon','cut'].includes(k.type));
   const moves=tasks.flatMap(k=>k.units.map(x=>({f:fleets.find(f=>f.id===x.id),k}))).filter(({f})=>f&&start.get(f.id).distanceTo(f.pos)>GROUND_SCALE);
   return {name:'通常演習で敵が動き出し任務の拠点へ近づく',ok:moves.some(({f,k})=>{const s=groundSites.find(s=>s.id===k.zone);return s.pos.distanceTo(f.pos)<s.pos.distanceTo(start.get(f.id));})};
 })()`);
 return [movement,...run('('+bridgeCases.toString()+')()')];
}
async function checkNpcGround(page,check){
 await page.evaluate(()=>{const data=WOS_DATA.operations.find(o=>o.id==='baikonur');reset({op:'baikonur',fleets:data.quick});if(talking)endTalk();setSpeed(0);endDeploy();});
 const movement=await page.evaluate(()=>{
  const start=new Map(fleets.filter(f=>f.team===1).map(f=>[f.id,f.pos.clone()]));
  for(let i=0;i<200&&!over;i++)step(.05);
  const c=npcGroundState.commanders.get(1),sit=npcGroundSituation(c),tasks=c.plan.tasks.filter(k=>['seize','recon','cut'].includes(k.type));
  const moves=tasks.flatMap(k=>k.units.map(x=>({f:fleets.find(f=>f.id===x.id),k}))).filter(({f})=>f&&start.get(f.id).distanceTo(f.pos)>GROUND_SCALE);
  return {moved:moves.length,heading:moves.some(({f,k})=>{const z=sit.zones.find(z=>z.id===k.zone);return groundPoint(z.x,z.z).distanceTo(f.pos)<groundPoint(z.x,z.z).distanceTo(start.get(f.id));}),debug:npcDebug()};
 });
 check(movement.moved>0&&movement.heading,'NPC演習: 敵が動き出し任務の拠点へ近づく',JSON.stringify(movement));
 for(const r of await page.evaluate(bridgeCases))check(r.ok,'NPC橋渡し: '+r.name);
 for(const id of ['groundExercise2','charybdis']){
  const ok=await page.evaluate(id=>{reset({op:id});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();let calls=0;const original=npcThink;npcThink=(...args)=>{calls++;return original(...args);};for(let i=0;i<80&&!over;i++)step(.05);npcThink=original;return calls===0&&Object.keys(npcDebug()).length===0;},id);
  check(ok,'NPC無効: '+id+'で頭を呼ばずdebugが空');
 }
}
module.exports={nodeChecks,checkNpcGround,bridgeCases};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'✓ ':'✗ ')+r.name);assert(rows.every(r=>r.ok));}
