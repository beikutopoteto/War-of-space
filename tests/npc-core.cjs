/* Nodeのみ。頭の規範と段取りを固定状況で確認。既存規範の数値は変更しない。 */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {npcCommander,npcThink}=require('../battle/npc-core.js');
const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../data/npc-doctrines.js'),'utf8'),box);const N=box.window.WOS_DATA.npc;
function fixture(){
  return {time:0,zones:[['A',0,0,'own','own'],['B',10,0,'own'],['C',20,0,'foe'],['D',20,12,'foe'],['F',30,0,'foe','foe']].map(([id,x,z,owner,base])=>({id,x,z,r:2,owner,known:owner,seen:true,base,goal:id==='F',final:id==='F'})),
    links:[['A','B'],['B','C'],['B','D'],['C','F'],['D','F']].map(([a,b])=>({a,b,len:10})),
    units:Array.from({length:20},(_,i)=>({id:'u'+i,role:i%3===0?'shock':'line',power:1,x:10,z:0,speed:.3,canHold:i%3!==0,health:1,morale:1,supply:1,free:true})),
    contacts:[{id:'e1',x:20,z:0,power:1,age:0},{id:'e2',x:20,z:12,power:1,age:0}],goal:{type:'seize'}};
}
const commander=(doctrine='mars',level='standard',side='foe',seed=1)=>npcCommander({team:0,side,doctrine:N.doctrines[doctrine],level:N.levels[level],seed});
const main=p=>p.tasks.find(k=>k.type==='seize');
function nodeChecks(){
 const rows=[],test=(name,fn)=>{try{fn();rows.push({name,ok:true});}catch(e){rows.push({name,ok:false,detail:e.message});}};
 test('力の比で攻撃・防御・遅滞が変わる',()=>{
  const post=power=>{const s=fixture();s.contacts.forEach(e=>e.power=power);return npcThink(commander(),s).posture;};
  assert.equal(post(1),'attack');assert.equal(post(15),'defend');assert.equal(post(50),'delay');
 });
 test('姿勢の境目の幅と反応遅れで往復しない',()=>{
  const c=commander(),s=fixture();assert.equal(npcThink(c,s).posture,'attack');
  for(let t=3;t<=90;t+=3){s.time=t;s.contacts.forEach(e=>e.power=t%2?9:10);assert.equal(npcThink(c,s).posture,'attack');}
  s.contacts.forEach(e=>e.power=15);s.time=100;assert.equal(npcThink(c,s).posture,'attack');s.time=106;assert.equal(npcThink(c,s).posture,'defend');
 });
 test('主攻は集結→前進→突入、集結率未満では待つ',()=>{
  const c=commander(),s=fixture();s.units.forEach(u=>{u.x=-10;});let p=npcThink(c,s);assert.equal(main(p).stage,'assemble');
  const k=main(p),from=s.zones.find(z=>z.id===k.from),target=s.zones.find(z=>z.id===k.zone),ids=k.units.filter(x=>x.as==='main').map(x=>x.id);
  const group=s.units.filter(u=>ids.includes(u.id));const gathered=Math.ceil(group.length*c.D.massing);
  group.slice(0,gathered-1).forEach(u=>{u.x=from.x;u.z=from.z;});s.time=3;p=npcThink(c,s);assert.equal(main(p).stage,'assemble');
  group.forEach(u=>{u.x=from.x;u.z=from.z;});s.time=6;p=npcThink(c,s);assert.equal(main(p).stage,'advance');
  for(const x of main(p).units){const u=s.units.find(u=>u.id===x.id);u.x=target.x;u.z=target.z;}s.time=9;p=npcThink(c,s);assert.equal(main(p).stage,'assault');
  assert.deepEqual(c.log.filter(l=>l.what.startsWith('seize:')).map(l=>l.what),['seize:assemble','seize:advance','seize:assault']);
 });
 test('assembleMaxまでは進まず、超過時に前進する',()=>{
  const c=commander(),s=fixture();s.units.forEach(u=>u.x=-30);assert.equal(main(npcThink(c,s)).stage,'assemble');
  s.time=c.D.assembleMax;assert.equal(main(npcThink(c,s)).stage,'assemble');s.time++;assert.equal(main(npcThink(c,s)).stage,'advance');
 });
 test('押し返された主攻は中止しretry中は別目標を選ぶ',()=>{
  const c=commander(),s=fixture();let k=main(npcThink(c,s));assert.equal(k.stage,'advance');
  const failed=k.zone;const st=c.tasks.get(k.key);st.power0=100; // 同じ隊が損耗した攻撃を固定で再現
  s.time=3;npcThink(c,s);assert(c.log.some(l=>l.what==='seize:abort'&&l.zone===failed));
  s.time=6;k=main(npcThink(c,s));assert(!k||k.zone!==failed);
  assert.equal(c.zone.get(failed).failAt,3);
 });
 test('本営の脅威で守備が増え前線の隊が戻る',()=>{
  const c=commander(),s=fixture(),p=npcThink(c,s),before=p.tasks.find(k=>k.type==='hold'&&k.zone==='A').units.length;
  s.time=3;s.contacts=[{id:'raid',x:0,z:0,power:10,age:0}];const hold=npcThink(c,s).tasks.find(k=>k.type==='hold'&&k.zone==='A');
  assert(hold.units.length>before);assert(hold.units.some(x=>!p.tasks.find(k=>k.type==='hold'&&k.zone==='A').units.some(y=>y.id===x.id)));
 });
 test('owner:nullでは既知の所有を使い、隠れた所有変化を使わない',()=>{
  const c=commander(),s=fixture();s.zones.find(z=>z.id==='C').owner=null;s.zones.find(z=>z.id==='C').seen=false;npcThink(c,s);assert.equal(c.zone.get('C').owner,'foe');
  const z=s.zones.find(z=>z.id==='C');z.owner='none';z.seen=true;s.time=3;npcThink(c,s);assert.equal(c.zone.get('C').owner,'none');z.owner=null;z.seen=false;z.known='foe';s.time=6;npcThink(c,s);assert.equal(c.zone.get('C').owner,'none');
 });
 test('友軍はfinalを狙わずlead.frontを越えない',()=>{
  const c=commander('mars','hard','ally'),s=fixture();s.lead={front:'C'};
  for(let t=0;t<120;t+=3){s.time=t;const p=npcThink(c,s);for(const k of p.tasks.filter(k=>['seize','fix','cut'].includes(k.type))){assert.notEqual(k.zone,'F');assert(c.graph.dist('A',k.zone)<=c.graph.dist('A','C'));}}
 });
 test('低士気・低補給はrefit、低耐久は攻めの最後',()=>{
  const c=commander(),s=fixture();s.units[0].morale=.1;s.units[1].supply=.1;s.units[2].health=.1;const p=npcThink(c,s),refit=p.tasks.filter(k=>k.type==='refit').flatMap(k=>k.units.map(x=>x.id));
  assert(refit.includes('u0')&&refit.includes('u1'));assert(!main(p).units.some(x=>x.id==='u2'));assert(!refit.includes('u2'));
 });
 test('連合は助攻なし・共和国は助攻あり・easyの攻めは主攻だけ',()=>{
  for(const d of ['earth','mars'])for(const l of ['standard','easy']){const p=npcThink(commander(d,l),fixture());assert.equal(p.tasks.some(k=>k.type==='fix'),d==='mars'&&l==='standard');if(l==='easy')assert(p.tasks.filter(k=>['seize','fix','cut'].includes(k.type)).every(k=>k.type==='seize'));}
 });
 test('同じseedと状況で計画・logが一致する',()=>{
  const a=commander(),b=commander();for(let t=0;t<180;t+=3){const s=fixture();s.time=t;assert.deepEqual(npcThink(a,structuredClone(s)),npcThink(b,structuredClone(s)));}assert.deepEqual(a.log,b.log);
 });
 return rows;
}
module.exports={nodeChecks,fixture,commander};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'✓ ':'✗ ')+r.name+(r.detail?' '+r.detail:''));assert(rows.every(r=>r.ok),'NPC頭の固定状況テスト');}
