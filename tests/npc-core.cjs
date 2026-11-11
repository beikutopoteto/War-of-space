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
// 既存の確認は styles なしを維持し、型ありの確認だけ明示的に渡す。
const styled=(doctrine='earth')=>npcCommander({team:0,doctrine:N.doctrines[doctrine],level:N.levels.standard,styles:N.styles,seed:1});
function defenseFixture(){
 const s=fixture();
 s.zones=[['A',0,0,'own','own'],['B',10,0,'own'],['E',20,0,'own'],['D',20,12,'own'],['C',30,0,'foe'],['F',30,12,'foe','foe']]
  .map(([id,x,z,owner,base])=>({id,x,z,r:2,owner,known:owner,seen:true,base}));
 s.links=[['A','B'],['B','E'],['B','D'],['E','C'],['D','F'],['C','F']].map(([a,b])=>({a,b,len:10}));
 s.units.forEach((u,i)=>Object.assign(u,{role:'line',canHold:true,x:i<10?20:10,z:i<5?12:0}));
 s.contacts=[];s.goal={type:'hold'};return s;
}
const main=p=>p.tasks.find(k=>k.type==='seize');
const holds=p=>p.tasks.filter(k=>k.type==='hold');
const count=(p,type)=>p.tasks.filter(k=>k.type===type).reduce((n,k)=>n+k.units.length,0);
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
 test('前進中は損耗・敵の力・交戦中を理由に中止も突入もしない',()=>{
  const c=commander(),s=fixture();let k=main(npcThink(c,s));const st=c.tasks.get(k.key);st.power0=1000;
  s.units.forEach(u=>u.engaged=true);s.contacts.forEach(e=>e.power=5);s.time=3;
  k=main(npcThink(c,s));assert.equal(k.stage,'advance');assert(!c.log.some(l=>l.what==='seize:abort'));
 });
 test('r×2.5以内の主攻の力がmassing未満なら待ち、そろうと突入する',()=>{
  const c=commander(),s=fixture();s.units.forEach((u,i)=>u.power=i%2?1:2);
  let k=main(npcThink(c,s));assert.equal(k.stage,'advance');const z=s.zones.find(z=>z.id===k.zone);
  const group=k.units.filter(x=>x.as==='main').map(x=>s.units.find(u=>u.id===x.id));
  const total=group.reduce((n,u)=>n+u.power,0);let arrived=0;
  group[0].x=z.x-z.r*1.5;group[0].z=z.z;arrived+=group[0].power;
  s.time=3;assert.equal(main(npcThink(c,s)).stage,'advance');
  // 支援の到着は主攻の集結率に足さない。
  s.units.filter(u=>!group.includes(u)).forEach(u=>{u.x=z.x;u.z=z.z;});
  for(const u of group.slice(1)){
   if((arrived+u.power)/total>=c.D.massing)break;
   u.x=z.x-z.r*2.5;u.z=z.z;arrived+=u.power;
  }
  s.time=6;assert.equal(main(npcThink(c,s)).stage,'advance');
  for(const u of group){u.x=z.x-z.r*2.5-.001;u.z=z.z;}
  s.time=9;assert.equal(main(npcThink(c,s)).stage,'advance');
  arrived=0;for(const u of group){u.x=z.x-z.r*2.5;arrived+=u.power;if(arrived/total>=c.D.massing)break;}
  s.time=12;assert.equal(main(npcThink(c,s)).stage,'assault');
 });
 test('前進の打ち切りは最初の到着からassembleMax/2秒を超えてから',()=>{
  const c=commander(),s=fixture(),k=main(npcThink(c,s)),z=s.zones.find(z=>z.id===k.zone);
  s.time=c.D.assembleMax*2;assert.equal(main(npcThink(c,s)).stage,'advance');
  const u=s.units.find(u=>u.id===k.units.find(x=>x.as==='main').id);u.x=z.x-z.r*2.5;u.z=z.z;
  s.time++;const at=s.time;assert.equal(main(npcThink(c,s)).stage,'advance');
  s.time=at+c.D.assembleMax/2;assert.equal(main(npcThink(c,s)).stage,'advance');
  s.time+=.001;assert.equal(main(npcThink(c,s)).stage,'assault');
 });
 test('memoryを過ぎた敵の数は力の比に残り、拠点の脅威には残らない',()=>{
  const c=commander(),s=fixture();s.contacts=[{id:'old',x:0,z:0,power:24,age:c.L.memory+1}];
  const p=npcThink(c,s),seen=npcThink(commander(),{...structuredClone(s),contacts:[{...s.contacts[0],age:0}]});
  assert.equal(p.foe,seen.foe);assert.equal(p.ratio,seen.ratio);assert.equal(p.posture,'defend');
  const empty=npcThink(commander(),{...structuredClone(s),goal:{type:'hold'},contacts:[]});
  const guard=p.tasks.find(k=>k.type==='hold'&&k.zone==='A');
  assert.equal(guard.stage,'wait');assert.equal(guard.units.length,empty.tasks.find(k=>k.type==='hold'&&k.zone==='A').units.length);
  assert.equal(seen.tasks.find(k=>k.type==='hold'&&k.zone==='A').stage,'defend');
 });
 test('守りの姿勢でも隣の薄い中立拠点を余力で取り、余力なしでは出さない',()=>{
  const s=fixture();s.goal={type:'hold'};s.zones.find(z=>z.id==='C').owner='none';s.zones.find(z=>z.id==='C').known='none';s.contacts=[];s.zones=s.zones.filter(z=>z.id!=='D');s.links=s.links.filter(l=>l.a!=='D'&&l.b!=='D');
  const p=npcThink(commander(),s);assert.equal(p.posture,'defend');assert.equal(main(p).zone,'C');assert.equal(main(p).why,'空いた所を取る');
  const remembered=commander();s.contacts=[{id:'forgotten-position',x:20,z:0,power:24,age:remembered.L.memory+1}];const stale=npcThink(remembered,s);assert.equal(stale.posture,'defend');assert.equal(main(stale).zone,'C');assert.equal(main(stale).units.length,main(p).units.length);
  const poor=fixture();poor.goal={type:'hold'};poor.zones.find(z=>z.id==='C').owner='none';poor.contacts=[];poor.units=poor.units.slice(0,1);
  const q=npcThink(commander(),poor);assert.equal(q.posture,'defend');assert(!main(q));
 });
 test('拠点を取れる唯一の隊は本営守備でなく主攻に入る',()=>{
  const c=commander(),s=fixture();s.units.forEach((u,i)=>u.canHold=i===0);const p=npcThink(c,s);
  assert(main(p).units.some(x=>x.id==='u0'&&x.as==='main'));assert(!p.tasks.filter(k=>k.type==='hold').some(k=>k.units.some(x=>x.id==='u0')));
 });
 function assault(){
  const c=commander(),s=fixture();let k=main(npcThink(c,s));const z=s.zones.find(z=>z.id===k.zone);
  for(const x of k.units.filter(x=>x.as==='main')){const u=s.units.find(u=>u.id===x.id);u.x=z.x;u.z=z.z;}
  s.time=3;k=main(npcThink(c,s));assert.equal(k.stage,'assault');return {c,s,k};
 }
 test('突入からcommit秒までは中止せず、その後の損耗で中止する',()=>{
  const {c,s,k}=assault();c.tasks.get(k.key).power0=1000;
  s.time=3+c.D.commit-.01;assert.equal(main(npcThink(c,s)).stage,'assault');assert(!c.log.some(l=>l.what==='seize:abort'));
  s.time=3+c.D.commit;npcThink(c,s);assert(c.log.some(l=>l.what==='seize:abort'&&l.zone===k.zone));assert.equal(c.zone.get(k.zone).failAt,s.time);
 });
 test('中止した拠点にはretry中、主攻・助攻・遮断を出さない',()=>{
  const {c,s,k}=assault();c.tasks.get(k.key).power0=1000;s.time=3+c.D.commit;npcThink(c,s);const failedAt=s.time;
  for(const t of [failedAt+.01,failedAt+c.D.retry/2,failedAt+c.D.retry-.01]){s.time=t;const p=npcThink(c,s);assert(!p.tasks.some(t=>['seize','fix','cut'].includes(t.type)&&t.zone===k.zone));}
 });
 test('失敗拠点を通る道しかない方向にはretry中に攻めない',()=>{
  const c=commander('earth'),s=fixture();s.links=s.links.filter(l=>l.a!=='D'&&l.b!=='D');s.zones=s.zones.filter(z=>z.id!=='D');s.contacts=s.contacts.slice(0,1);
  npcThink(c,s);c.zone.get('C').failAt=0;s.time=3;const p=npcThink(c,s);assert(!p.tasks.some(k=>['seize','fix','cut'].includes(k.type)));
 });
 test('助攻も拘束に入ってからcommit秒までは中止しない',()=>{
  const c=commander(),s=fixture();let k=npcThink(c,s).tasks.find(k=>k.type==='fix');assert(k);const z=s.zones.find(z=>z.id===k.zone);
  for(const x of k.units){const u=s.units.find(u=>u.id===x.id);u.x=z.x;u.z=z.z;}
  s.time=3;k=npcThink(c,s).tasks.find(k=>k.type==='fix');assert.equal(k.stage,'pin');c.tasks.get(k.key).power0=1000;
  s.time=3+c.D.commit-.01;npcThink(c,s);assert(!c.log.some(l=>l.what==='fix:abort'));
  s.time=3+c.D.commit;npcThink(c,s);assert(c.log.some(l=>l.what==='fix:abort'&&l.zone===k.zone));
 });
 test('主攻・助攻・遮断それぞれの候補を失敗記録で除外する',()=>{
  for(const type of ['seize','fix','cut']){
    const c=commander('mars','hard'),s=fixture();s.zones.push({id:'E',x:25,z:0,r:2,owner:'foe',known:'foe',seen:true});
    s.links=s.links.filter(l=>!(l.a==='C'&&l.b==='F'));s.links.push({a:'C',b:'E',len:10},{a:'E',b:'F',len:10});
    const before=npcThink(c,s),k=before.tasks.find(k=>k.type===type);assert(k,'失敗前に'+type+'の候補がある');
    c.zone.get(k.zone).failAt=0;s.time=3;const after=npcThink(c,s);
    assert(!after.tasks.some(t=>['seize','fix','cut'].includes(t.type)&&t.zone===k.zone));
  }
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
 // 友軍が先導（プレイヤーの隊）に合わせる動き。lead.units を渡したときだけ働く。
 const off=p=>p.tasks.filter(k=>['seize','fix','cut'].includes(k.type)),leadAtB=(extra={})=>[{id:'p1',x:10,z:0,power:3,...extra},{id:'p2',x:10,z:0,power:3,...extra}];
 test('友軍は自分の力の比では攻めず、先導が攻めた拠点を占領せずに支援する',()=>{
  const c=commander('mars','hard','ally'),s=fixture();s.lead={units:leadAtB()};
  let p=npcThink(c,s);assert.equal(p.posture,'defend');assert.equal(off(p).length,0);assert.equal(p.lead.mode,'follow');
  s.lead={units:leadAtB({to:'C'})};s.time=60;p=npcThink(c,s);assert.equal(p.posture,'defend');s.time=63;p=npcThink(c,s);assert.equal(p.posture,'attack'); // 反応の遅れのあとに出る
  assert.equal(p.lead.main,'C');
  const fix=p.tasks.find(k=>k.type==='fix'&&k.zone==='C');assert(fix&&fix.why==='攻撃を支援する');assert(!p.tasks.some(k=>k.type==='seize'));
  const used=off(p).flatMap(k=>k.units).length;assert(used>0&&used<=10); // 攻めに出すのは半分まで
 });
 test('友軍は先導がいる拠点に守備を重ねず、離れたら引き継ぐ',()=>{
  const c=commander('mars','hard','ally'),s=fixture();s.lead={units:leadAtB()};
  let p=npcThink(c,s);assert(!holds(p).some(k=>k.zone==='B'));
  s.lead={units:leadAtB({x:0})};s.time=3;p=npcThink(c,s);const h=holds(p).find(k=>k.zone==='B');assert(h&&h.why==='引き継いで守る');
 });
 test('友軍は敵のいない横の拠点だけ取り、先導が向かう拠点には手を出さない',()=>{
  const lateral=s=>{s.zones.push({id:'E',x:10,z:12,r:2,owner:'none',known:'none',seen:true});s.links.push({a:'A',b:'E',len:10});return s;};
  let c=commander('mars','hard','ally'),s=lateral(fixture());s.lead={units:leadAtB()};
  let p=npcThink(c,s);assert.deepEqual(p.tasks.filter(k=>k.type==='seize').map(k=>k.zone),['E']);
  c=commander('mars','hard','ally');s=lateral(fixture());s.lead={units:leadAtB({to:'E'})};
  for(let t=0;t<90;t+=3){s.time=t;p=npcThink(c,s);assert(!p.tasks.some(k=>k.type==='seize'));}
 });
 test('敵が残りわずかになると、友軍は攻めをやめてとどめを先導に残す',()=>{
  const c=commander('mars','hard','ally'),s=fixture();s.contacts.forEach(e=>e.power=5);s.lead={units:leadAtB({to:'C'})};
  let p=npcThink(c,s);assert(off(p).length>0);
  s.contacts=[{id:'e1',x:20,z:0,power:1,age:0}];s.time=60;p=npcThink(c,s);assert.equal(p.lead.mode,'quiet');assert.equal(off(p).length,0);
 });
 test('先導が負けそうなら友軍は助けに入るが、最終目標は取らない',()=>{
  const c=commander('mars','hard','ally'),s=fixture();s.lead={full:10,units:[{id:'p1',x:10,z:0,power:4}]};
  for(let t=0;t<120;t+=3){s.time=t;const p=npcThink(c,s);assert.equal(p.lead.mode,'rescue');for(const k of off(p))assert.notEqual(k.zone,'F');if(t===0)assert(p.tasks.some(k=>k.type==='seize'));}
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
 // 同じ地形・戦力で型だけを替え、隊の割当まで比べる。
 test('固守は指定拠点を厚く守り、機動防御は守備を薄く予備を多く持つ',()=>{
  const s=defenseFixture();s.goal.zones=['E'];s.contacts=[{id:'push',x:20,z:0,power:6,age:0}];
  const plans=Object.fromEntries(['firm','mobile'].map(style=>{const t=structuredClone(s);t.goal.style=style;return [style,npcThink(styled(),t)];}));
  assert(holds(plans.firm).find(k=>k.zone==='E').units.length>holds(plans.mobile).find(k=>k.zone==='E').units.length);
  assert(count(plans.mobile,'hold')<count(plans.firm,'hold'));assert(count(plans.mobile,'reserve')>count(plans.firm,'reserve'));
 });
 test('遅滞は前線だけを持ち、縦深は脅威のない後ろの線にも守備を置く',()=>{
  for(const style of ['firm','delay','mobile','depth']){
   const s=defenseFixture();s.goal.style=style;const p=npcThink(styled(),s);
   assert.equal(holds(p).some(k=>k.zone==='B'),style==='depth',style);assert(holds(p).some(k=>k.zone==='A'),style);
   assert(holds(p).some(k=>k.zone==='E'),style);assert(holds(p).some(k=>k.zone==='D'),style);
  }
 });
 test('遅滞は脅威で前線を手放し、失っても取り返さない',()=>{
  const c=styled(),s=defenseFixture();s.goal.style='delay';assert(holds(npcThink(c,s)).some(k=>k.zone==='E'));
  s.time=30;s.contacts=[{id:'push',x:20,z:0,power:20,age:0}];assert(!holds(npcThink(c,s)).some(k=>k.zone==='E'));
  s.time=33;Object.assign(s.zones.find(z=>z.id==='E'),{owner:'foe'});s.contacts=[];
  const p=npcThink(c,s);assert(!main(p));assert.equal(p.posture,'defend');
 });
 test('機動防御は遠い脅威では守備を増やさず、近い脅威に反応する',()=>{
  const run=(style,x)=>{const s=defenseFixture();s.goal.style=style;s.goal.zones=['E'];s.contacts=[{id:'push',x,z:0,power:20,age:0}];return holds(npcThink(styled(),s)).find(k=>k.zone==='E').units.length;};
  assert.equal(run('mobile',30),run('mobile',50));assert(run('mobile',20)>run('mobile',30));assert(run('firm',30)>run('mobile',30));
 });
 test('機動防御は余力があれば失った拠点へ取り返し、余力がなければ出さない',()=>{
  for(const poor of [false,true]){
   const c=styled(),s=defenseFixture();s.goal.style='mobile';s.contacts=[{id:'guardC',x:30,z:0,power:50,age:0},{id:'guardF',x:30,z:12,power:50,age:0}];npcThink(c,s);s.contacts=[];
   s.time=30;s.zones.find(z=>z.id==='E').owner='foe';if(poor){s.units=s.units.slice(0,1);s.contacts=[{id:'guard',x:20,z:0,power:100,age:0}];}
   const k=main(npcThink(c,s));if(poor)assert(!k);else {assert.equal(k.zone,'E');assert.equal(k.why,'取り返す');}
  }
 });
 test('固守は指定拠点だけを取り返し、縦深は二本以上の線が残る間に取り返す',()=>{
  for(const style of ['firm','depth'])for(const must of [false,true]){
   const c=styled(),s=defenseFixture();s.goal={type:'hold',style,zones:must?['E']:[]};npcThink(c,s);
   s.time=30;s.zones.find(z=>z.id==='E').owner='foe';const k=main(npcThink(c,s));assert.equal(!!k,style==='depth'||must);if(k){assert.equal(k.zone,'E');assert.equal(k.why,'取り返す');}
  }
  const c=styled(),s=fixture();s.goal={type:'hold',style:'depth'};s.zones.find(z=>z.id==='A').owner='foe';npcThink(c,s);
  s.time=30;s.zones.find(z=>z.id==='B').owner='foe';assert(!main(npcThink(c,s)));
 });
 test('opportunismなしの三型は空いた拠点を取りに行かない',()=>{
  for(const style of Object.keys(N.styles)){
   const s=defenseFixture();s.goal.style=style;s.zones.find(z=>z.id==='C').owner='none';const k=main(npcThink(styled(),s));
   assert.equal(!!k,style==='mobile',style);if(k)assert.equal(k.why,'空いた所を取る');
  }
 });
 test('全型で指定の前線拠点と本営は大きく不利でも手放さない',()=>{
  for(const style of Object.keys(N.styles))for(const x of [0,20]){
   const s=defenseFixture();s.goal={type:'hold',style,zones:['E']};s.contacts=[{id:'push',x,z:0,power:100,age:0}];
   const p=npcThink(styled(),s);assert.equal(p.posture,'defend');assert(holds(p).some(k=>k.zone=== (x===0?'A':'E')),style+' 脅威を受けた必須拠点');
  }
 });
 test('holdは力の比が高くても低くても守りの姿勢を続ける',()=>{
  for(const power of [0,100]){const c=styled(),s=defenseFixture();s.contacts=[{id:'push',x:30,z:0,power,age:0}];
   for(const time of [0,30,120]){s.time=time;assert.equal(npcThink(c,s).posture,'defend');}}
 });
 test('delayはuntil直前まで守り、期限後は反応遅れを経て力の比で姿勢を決める',()=>{
  for(const [power,expected] of [[1,'attack'],[15,'defend'],[100,'delay']]){
   const c=styled(),s=fixture();s.goal={type:'delay',until:300,style:'delay'};s.contacts.forEach(e=>e.power=power);
   for(const time of [0,299]){s.time=time;assert.equal(npcThink(c,s).posture,'defend');}
   s.time=300;assert.equal(npcThink(c,s).posture,'defend');assert.equal(c.want,expected);
   s.time=306;assert.equal(npcThink(c,s).posture,expected);
  }
 });
 test('delayは残り時間が少ないほど同じ脅威でも前線を手放しにくい',()=>{
  const c=styled(),s=defenseFixture();s.goal={type:'delay',until:300,style:'delay'};s.contacts=[{id:'push',x:20,z:0,power:20,age:0}];
  assert(!holds(npcThink(c,s)).some(k=>k.zone==='E'));s.time=290;assert(holds(npcThink(c,s)).some(k=>k.zone==='E'));
 });
 test('withdrawは前線ごとに殿を一隊残し、ほかを指定退避点へretireにする',()=>{
  const s=defenseFixture();s.goal={type:'withdraw',zones:['B'],style:'firm'};const c=styled(),p=npcThink(c,s);
  assert.equal(p.posture,'delay');assert.equal(c.style,'delay');assert.deepEqual(holds(p).map(k=>[k.zone,k.units.length]).sort(),[['D',1],['E',1]]);
  const k=p.tasks.find(k=>k.type==='retire');assert.equal(k.zone,'B');assert.equal(k.stage,'wait');assert.equal(k.units.length,18);assert(!main(p));
  const ids=p.tasks.flatMap(k=>k.units.map(u=>u.id));assert.equal(new Set(ids).size,s.units.length);assert.equal(ids.length,s.units.length);
 });
 test('withdrawの退避先がなければ本営へ退く',()=>{
  const s=defenseFixture();s.goal={type:'withdraw'};assert.equal(npcThink(styled(),s).tasks.find(k=>k.type==='retire').zone,'A');
 });
 test('型の既定は連合が固守・共和国が機動防御、比による遅滞はdelay',()=>{
  for(const [doctrine,style] of [['earth','firm'],['mars','mobile']]){const c=styled(doctrine);npcThink(c,defenseFixture());assert.equal(c.style,style);}
  const c=styled(),s=fixture();s.contacts.forEach(e=>e.power=100);npcThink(c,s);assert.equal(c.style,'delay');
  const explicit=styled();s.goal.style='depth';npcThink(explicit,s);assert.equal(explicit.style,'depth');
 });
 test('攻めの姿勢では型を適用せず、守り方の切り替えだけをlogへ出す',()=>{
  const c=styled(),s=defenseFixture();s.goal.style='firm';npcThink(c,s);s.time=3;npcThink(c,s);
  s.goal.style='depth';s.time=6;npcThink(c,s);s.time=9;npcThink(c,s);
  assert.deepEqual(c.log.filter(l=>l.what.startsWith('style:')).map(l=>[l.t,l.what]),[[0,'style:firm'],[6,'style:depth']]);
  const attack=fixture(),a=styled();attack.goal.style='firm';const p=npcThink(a,attack);assert.equal(p.posture,'attack');assert.equal(a.style,null);assert(!a.log.some(l=>l.what.startsWith('style:')));
 });
 test('stylesを渡さない指揮官は型指定があっても従来の割当とlogを保つ',()=>{
  for(const type of ['seize','hold','delay']){
   const s=fixture();s.goal={type};const c=commander(),p=npcThink(c,structuredClone(s));
   for(const style of Object.keys(N.styles)){const d=commander(),q=structuredClone(s);q.goal.style=style;assert.deepEqual(npcThink(d,q),p);assert.deepEqual(d.log,c.log);}
  }
 });
 test('withdrawは強い脅威の前線にも殿を一隊ずつ残す',()=>{
  const s=defenseFixture();s.goal={type:'withdraw',zones:['B']};s.contacts=[{id:'push',x:20,z:0,power:100,age:0}];
  const p=npcThink(styled(),s);assert.deepEqual(holds(p).map(k=>[k.zone,k.units.length]).sort(),[['D',1],['E',1]]);
 });
 test('opportunismなしの型へ切り替えたら空いた所を取る任務を続けない',()=>{
  const c=styled(),s=defenseFixture();s.goal.style='mobile';assert.equal(main(npcThink(c,s)).why,'空いた所を取る');
  s.time=3;s.goal.style='delay';assert(!main(npcThink(c,s)));
 });
 return rows;
}
module.exports={nodeChecks,fixture,commander};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'✓ ':'✗ ')+r.name+(r.detail?' '+r.detail:''));assert(rows.every(r=>r.ok),'NPC頭の固定状況テスト');}
