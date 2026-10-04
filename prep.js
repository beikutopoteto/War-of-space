/* War of Space: preparation screens (main menu, sortie, organization, tech tree, ship data, debug).
   Data lives in localStorage; the battle is started through window.WOS (defined in index.html). */
(() => {
'use strict';

/* ---------- master data (data/*.js, values are provisional) ---------- */
const STATS = [
  {k:'atk', n:'攻撃'}, {k:'def', n:'防御'}, {k:'eva', n:'回避'},
  {k:'rng', n:'射程'}, {k:'vis', n:'視界'}, {k:'stl', n:'隠蔽性'}, {k:'aa', n:'対空照準'}
];
const D=window.WOS_DATA;
const SHIPS=D.ships, BONUSES=D.bonuses, OPS=D.operations, BRANCHES=D.branches, TREE=D.techTree;
/* the campaign: the operations with a chapter, in order. Each opens when the one before it is cleared */
const CAMP=OPS.filter(o=>o.chapter);
const SHIP=Object.fromEntries(SHIPS.map(s=>[s.id,s]));
const hangarStr=h=>h?Object.entries(h).map(([k,v])=>`${D.crafts[k].name}${Math.round(v)}`).join('・'):'';
/* a bonus applies when every condition in its `when` holds (format: data/bonuses.js) */
function bonusOn(bn,types,bgs){ const c=bn.when||{};
  if(c.need&&!c.need.every(any=>any.some(t=>types.has(t)))) return false;
  if(c.count&&bgs.filter(b=>c.count.types.includes(b.type)).length<c.count.min) return false;
  if(c.minStat&&!(bgs.length&&bgs.every(b=>SHIP[b.type][c.minStat.stat]>=c.minStat.min))) return false;
  if(c.minBgs&&bgs.length<c.minBgs) return false;
  if(c.sameType&&types.size!==1) return false;
  return true; }
const MAX_BG=5, MAX_ARMY=5, CUBE=5;
const GROUP_COLORS=['#7fc8ff','#8fe8c0','#f0d27a','#c9a7ff','#ff9fc2'];

/* ---------- save data ---------- */
const KEY='wos.save.v1';
function defaults(){
  return {
    seq: 100,
    /* the starting fleet: the four squadrons of 第2節 (same counts) and the cruiser squadron that joins at Nile (user decision 2026-10-03) */
    bgs: [
      {id:'bg1', name:'第9 前衛巡洋 支隊', type:'cl', count:6},
      {id:'bg2', name:'第12 沿岸哨戒 支隊', type:'cv', count:9},
      {id:'bg3', name:'第18 護送護衛 支隊', type:'ff', count:8},
      {id:'bg4', name:'第24 駆逐突撃 支隊', type:'dd', count:6},
      {id:'bg5', name:'第19 護送護衛 支隊', type:'ff', count:6},
    ],
    /* each army holds one battle group and so goes by its name, as in the story (第一章第1・2節) */
    armies: [
      {id:'a1', name:'第9 前衛巡洋 支隊', bgs:['bg1'], auto:'bg:bg1'},
      {id:'a2', name:'第12 沿岸哨戒 支隊', bgs:['bg2'], auto:'bg:bg2'},
      {id:'a3', name:'第18 護送護衛 支隊', bgs:['bg3'], auto:'bg:bg3'},
      {id:'a4', name:'第24 駆逐突撃 支隊', bgs:['bg4'], auto:'bg:bg4'},
      {id:'a5', name:'第19 護送護衛 支隊', bgs:['bg5'], auto:'bg:bg5'},
    ],
    groups: [
      {id:'g1', name:'第2 ネオ信濃駐屯 戦区軍', sync:true, members:[
        {army:'a1', x:2, y:2, z:2}, {army:'a2', x:1, y:3, z:2}, {army:'a3', x:3, y:1, z:2}, {army:'a4', x:2, y:2, z:1}, {army:'a5', x:2, y:3, z:3}]},
    ],
    prog: newProg(),
  };
}
/* campaign progress: cleared operations, funds, research per branch ([node ids], data/tech.js techTree), story flags */
function newProg(){ return {cleared:[], funds:0, tech:{}, flags:{}}; }
let save;
function load(){ try{ const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s&&s.bgs&&s.armies&&s.groups){ migrate(s); return s; } }catch(e){} return defaults(); }
const OLD_BGS=JSON.stringify([['bg1','第1戦闘団','bb',3],['bg2','第2戦闘団','cl',6],['bg3','第3戦闘団','dd',8],['bg4','第4戦闘団','ff',10],['bg5','第5戦闘団','cvb',2],
  ['bg6','第6戦闘団','cv',12],['bg7','第7戦闘団','mas',6],['bg8','第8戦闘団','masc',2],['bg9','第9戦闘団','dd',8]]);
const OLD_NAMES={'第41巡洋戦隊':'第9 前衛巡洋 支隊','第11哨戒戦隊':'第12 沿岸哨戒 支隊','第21護衛戦隊':'第18 護送護衛 支隊',
  '第31駆逐戦隊':'第24 駆逐突撃 支隊','第22護衛戦隊':'第19 護送護衛 支隊','ネオ信濃駐屯隊':'第2 ネオ信濃駐屯 戦区軍'};
/* M.A.S. was renamed: W.A.S., 突撃揚陸艦 and 強襲母艦 */
function migrate(s){ s.bgs.forEach(b=>{ b.name=String(b.name).replace(/M\.A\.S\.母艦/g,'強襲母艦').replace(/M\.A\.S\./g,'W.A.S.'); });
  /* the first starting fleet (battleships, carriers, W.A.S.) is replaced by the new one while the player has not changed it */
  if(JSON.stringify(s.bgs.map(b=>[b.id,b.name,b.type,b.count]))===OLD_BGS&&s.armies.length===3&&s.groups.length===1){
    const d=defaults(); s.bgs=d.bgs; s.armies=d.armies; s.groups=d.groups; }
  /* the starting fleet's names before the naming rule of 2026-10-04 */
  const rn=x=>{ if(OLD_NAMES[x.name]) x.name=OLD_NAMES[x.name]; }; s.bgs.forEach(rn); s.armies.forEach(rn); s.groups.forEach(rn);
  /* an army of one battle group named after it follows the battle group's name (user decision 2026-10-04) */
  s.armies.forEach(a=>{ const b=a.bgs.length===1&&s.bgs.find(x=>x.id===a.bgs[0]); if(a.auto===undefined&&b&&b.name===a.name) a.auto='bg:'+b.id; });
  s.bgs.forEach(b=>{ if(b.auto&&/戦隊$/.test(b.name)) b.name=unitName('bg',b.type,new Set(s.bgs.filter(y=>y!==b).map(y=>unitNo(y.name)))); });
  /* saves from before the campaign progress start at the beginning */
  s.prog=Object.assign(newProg(),s.prog||{});
  /* saves that cleared an operation before its grant existed get the grant now */
  OPS.forEach(o=>{ const k='aid:'+o.id; if(o.aid&&s.prog.cleared.includes(o.id)&&!s.prog.flags[k]){ s.prog.flags[k]=true; s.prog.funds+=o.aid.funds; } });
  /* earlier tech trees kept a number per branch, then {line: steps}: only the sortie-limit steps carry over */
  Object.keys(s.prog.tech).forEach(k=>{ const v=s.prog.tech[k]; if(Array.isArray(v)) return;
    const n=typeof v==='number'?v:(v&&v.cap)||0; s.prog.tech[k]=['cap1','cap2','cap3'].slice(0,n); }); }
function persist(){ try{ localStorage.setItem(KEY,JSON.stringify(save)); }catch(e){} }
save=load();
const newId=p=>p+(++save.seq);
const bgById=id=>save.bgs.find(b=>b.id===id);
const armyById=id=>save.armies.find(a=>a.id===id);
const armyOfBg=id=>save.armies.find(a=>a.bgs.includes(id));
const prog=()=>save.prog;

/* ---------- debug switches (kept apart from the save, so resetting the progress keeps them) ---------- */
const DKEY='wos.debug';
let dbg={free:false, battle:false};
try{ Object.assign(dbg,JSON.parse(localStorage.getItem(DKEY)||'{}')); }catch(e){}
function persistDbg(){ try{ localStorage.setItem(DKEY,JSON.stringify(dbg)); }catch(e){} document.body.classList.toggle('dbg-battle',!!dbg.battle); }
document.body.classList.toggle('dbg-battle',!!dbg.battle);

/* ---------- progress ---------- */
const cleared=id=>prog().cleared.includes(id);
/* a menu screen opens when its operation is cleared (data/tech.js unlocks) */
const unlocked=key=>cleared(D.unlocks[key]);
function opOpen(o){ if(dbg.free) return true;
  const i=CAMP.indexOf(o); if(i<0) return !!o.quick||unlocked('fleet');   // 演習: クイック出撃 (o.quick) from the start, own army groups once 艦隊編集 opens
  return i===0||cleared(CAMP[i-1].id); }
/* a thin line lock in the text colour (no emoji) */
const LOCK='<svg class="lock" viewBox="0 0 12 14" aria-hidden="true"><rect x="1.5" y="6" width="9" height="7" rx="1"/><path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2"/></svg>';
const opLabel=o=>`${o.chapter?o.chapter+'「':'「'}${o.name}」`;
const unlockText=key=>{ const o=OPS.find(x=>x.id===D.unlocks[key]); return o?`${opLabel(o)}をクリアで解放`:'未解放'; };
/* the tech tree (data/tech.js techTree): every branch has the same nodes; a node opens when all its req are researched */
const techOf=b=>prog().tech[b.id]||(prog().tech[b.id]=[]);
const nodeById=id=>TREE.find(n=>n.id===id);
const nodeDone=(b,n)=>techOf(b).includes(n.id);
const nodeOpen=(b,n)=>branchOpen(b)&&!nodeDone(b,n)&&n.req.every(r=>techOf(b).includes(r));
const nodeCost=(b,n)=>n.cap?b.steps[n.cap].cost:Math.round(n.cost*(b.costMul||1));
const nodeName=(b,n)=>n.name.replace('{gun}',b.gun||'主砲');
const techLv=b=>Math.min(b.steps.length-1,TREE.reduce((m,n)=>n.cap&&nodeDone(b,n)?Math.max(m,n.cap):m,0));
const branchOpen=b=>!b.need||!!prog().flags[b.need];
const branchCap=b=>branchOpen(b)?b.steps[techLv(b)].cap:0;
/* the ship values in data/ships.js are the final form. A fleet built by the player has, per stat,
   techStat.base of it plus the add of every researched node */
const branchOfType=t=>BRANCHES.find(b=>b.types.includes(t));
function statRate(b,k){ if(!b) return 1;
  return Math.min(1,D.techStat.base+TREE.reduce((s,n)=>s+(n.add&&!n.craft&&nodeDone(b,n)?n.add[k]||0:0),0)); }
/* the same for the small craft of a branch's ships (data/ships.js crafts are their final form) */
function craftRate(b,c,k){ if(!b) return 1;
  return Math.min(1,D.techStat.base+TREE.reduce((s,n)=>s+(n.craft===c&&nodeDone(b,n)?n.add[k]||0:0),0)); }
const CRAFT_STATS=['dmg','hp','eva'];
/* the branch that researches a craft's airframe (艦載機 → 母艦, W.A.S. → W.A.S. 部隊), whichever ship carries it */
const craftOwner=c=>BRANCHES.find(x=>x.id===D.crafts[c].branch);
/* carrier operations (craft:'all' nodes): squadrons out at once, and the speed of rearming (time = data ÷ speed) */
const OUT_NODES=TREE.filter(n=>n.add&&n.add.out);
const craftOut=(b,c)=>Math.max(1,D.crafts[c].maxOut-OUT_NODES.filter(n=>(!n.only||n.only.includes(b.id))&&!nodeDone(b,n)).length);
const craftTurn=b=>Math.min(1,D.techStat.base+TREE.reduce((s,n)=>s+(n.add&&n.add.turn&&nodeDone(b,n)?n.add.turn:0),0));
/* the nodes a branch shows: the craft lines only for the branches whose ships carry them */
const nodesOf=b=>TREE.filter(n=>!n.only||n.only.includes(b.id));
const RATED=['atk','def','eva','rng','aa','vis','stl','spd'];
/* a ship class can be put in a new battle group once its branch is open (or with the debug switch) */
const typeOpen=t=>dbg.free||!branchOfType(t)||branchOpen(branchOfType(t));
function shipNow(t){ const s={...SHIP[t]}, b=branchOfType(t); RATED.forEach(k=>s[k]=SHIP[t][k]*statRate(b,k)); return s; }
/* ships per branch in the army groups going out together, against the limits */
function groupLoad(gs){
  const n={}; gs.forEach(g=>g.members.map(m=>armyById(m.army)).filter(Boolean).forEach(a=>a.bgs.map(bgById).filter(Boolean).forEach(b=>n[b.type]=(n[b.type]||0)+b.count)));
  return BRANCHES.map(b=>({b, used:b.types.reduce((s,t)=>s+(n[t]||0),0), cap:branchCap(b)})).filter(x=>x.used||x.b.types.some(t=>n[t]));
}
/* a one-time grant on the first clear of an operation (o.aid), remembered in the story flags */
function grantAid(o){ const k='aid:'+o.id; if(!o.aid||prog().flags[k]) return 0; prog().flags[k]=true; prog().funds+=o.aid.funds; return o.aid.funds; }
/* story flags the battle's conversations may use (a line's third element, battle/hud.js talkFor) */
function storyFlags(){ return {kawasemi:!!prog().flags['rescued:retreat']}; }
/* the battle the menu started: the result is recorded when it ends (クイック出撃 is not counted) */
let running=null;
function onEnd(opId,win,res={}){
  if(!running||running.quick||running.op!==opId||!win) return '';
  const o=OPS.find(x=>x.id===opId), first=!cleared(opId), before={fleet:unlocked('fleet'),tech:unlocked('tech')};
  /* the story remembers whether the distress call was answered (the latest win counts); later conversations use it */
  if(o.rescue) prog().flags['rescued:'+opId]=!!res.rescued;
  const gain=Math.round((o.reward||0)*(first?1:D.reward.replay));
  prog().funds+=gain; if(first) prog().cleared.push(opId);
  const aid=first?grantAid(o):0; persist();
  const opened=[['fleet','艦隊編集'],['tech','技術ツリー']].filter(([k])=>!before[k]&&unlocked(k)).map(([,n])=>`「${n}」`);
  return `${gain?`　報酬：資金 +${gain}${first?'':'（再戦）'}。`:''}${aid?`　${o.aid.name}：資金 +${aid}。`:''}${opened.length?`　${opened.join('と')}が使えるようになった。`:''}`;
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- army math ---------- */
function armyStats(a){
  const bgs=a.bgs.map(bgById).filter(Boolean);
  const types=new Set(bgs.map(b=>b.type));
  const ships=bgs.reduce((s,b)=>s+b.count,0);
  const st={atk:0,def:0,eva:0,rng:0,aa:0,vis:0,stl:10,spd:bgs.length?99:0};
  bgs.forEach(b=>{ const s=shipNow(b.type), w=b.count/ships;
    st.atk+=s.atk*w; st.def+=s.def*w; st.eva+=s.eva*w; st.rng+=s.rng*w; st.aa+=s.aa*w;
    st.vis=Math.max(st.vis,s.vis); st.stl=Math.min(st.stl,s.stl); st.spd=Math.min(st.spd,s.spd); });
  if(!bgs.length) st.stl=0;
  const hangar={}; bgs.forEach(b=>Object.entries(SHIP[b.type].hangar||{}).forEach(([k,v])=>hangar[k]=(hangar[k]||0)+v*b.count));
  const active=BONUSES.filter(b=>bonusOn(b,types,bgs));
  active.forEach(b=>Object.entries(b.mod).forEach(([k,m])=>st[k]*=m));
  return {st,ships,bgs,active,hangar};
}
/* convert an army into the battle fleet spec used by battle/ */
function armyToFleet(a){
  const {st,ships,bgs,hangar}=armyStats(a);
  /* the small craft's rates, weighted by how many each ship class brings */
  const craft={}; Object.keys(hangar).forEach(c=>{ let w=0, out=1, turn=0; const r={dmg:0,hp:0,eva:0};
    bgs.forEach(b=>{ const v=(SHIP[b.type].hangar||{})[c]; if(!v) return; const n=v*b.count, br=branchOfType(b.type); w+=n;
      CRAFT_STATS.forEach(k=>r[k]+=craftRate(craftOwner(c)||br,c,k)*n); out=Math.max(out,craftOut(br,c)); turn+=craftTurn(br)*n; });
    if(w) craft[c]={...Object.fromEntries(CRAFT_STATS.map(k=>[k,r[k]/w])), out, turn:turn/w}; });
  const big=bgs.reduce((m,b)=>Math.max(m,SHIP[b.type].scale),.6);
  const by={}; bgs.forEach(b=>by[b.type]=(by[b.type]||0)+b.count);
  const sub=Object.entries(by).sort((x,y)=>SHIP[y[0]].scale-SHIP[x[0]].scale).slice(0,3).map(([t,c])=>SHIP[t].name+c).join('・');
  return {name:a.name, sub, comp:by, n:Math.max(1,ships), hp:6+st.def*5, dmg:.4+st.atk*.45, eva:Math.min(.4,st.eva*.04),
    range:10+st.rng*1.6, speed:2+st.spd, vis:st.vis, stl:st.stl, aa:st.aa, hangar, craft, scale:Math.min(1.5,.4+big*.6), stats:st};
}

/* ---------- screens ---------- */
const menu=document.getElementById('menu');
let screen='title', tab='army', selBg=null, selArmy=null, selGroup=null, layer=2, placing=null, sortieGroups=[], sortieOp=OPS[0].id, confirmDel=null;

function show(s){ screen=s; confirmDel=null; render(); menu.scrollTop=0; }
function render(){
  menu.querySelectorAll('.scr').forEach(el=>el.hidden=el.dataset.s!==screen);
  if(screen==='sortie') renderSortie();
  if(screen==='org') renderOrg();
  if(screen==='data') renderData();
  if(screen==='title') renderTitle();
  if(screen==='tech') renderTech();
  preview.active=(screen==='org'&&tab==='group');
}

menu.innerHTML=`
<section class="scr" data-s="title">
  <div class="ttl">
    <p class="eyebrow">宙域艦隊戦　試作版</p>
    <h1>WAR OF SPACE</h1>
    <p class="lead">地球連合の司令官として艦隊を編成し、惑星共和国の要塞宙域へ出撃する。</p>
  </div>
  <p class="tstat" id="tStat"></p>
  <nav class="mainnav" id="mainNav" aria-label="メインメニュー"></nav>
  <aside class="dbgp" id="dbgP">
    <button class="dbgt" id="dbgT" aria-expanded="false">DEBUG</button>
    <div class="dbgb" id="dbgB" hidden></div>
  </aside>
</section>
<section class="scr" data-s="tech" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2>技術ツリー</h2>
    <div class="tabs" role="tablist" id="forceTabs"></div><p class="funds" id="techFunds"></p></header>
  <p class="tabnote">資金で研究し、出撃上限と、自分で編成した艦隊の能力（最初は最大の3割）を上げます。線の先は、つながる元をすべて研究すると始められます。数値は仮。</p>
  <p class="empty" id="forceSoon" hidden></p>
  <div class="techwrap" id="techWrap">
    <nav class="brbar" id="brBar" aria-label="兵科"></nav>
    <div class="treebox">
      <div class="trsum" id="trSum"></div>
      <div class="trscroll" id="trScroll"><div class="trcv" id="trCv"></div></div>
      <div class="tinfo" id="tInfo"></div>
    </div>
  </div>
</section>
<section class="scr" data-s="sortie" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2>出撃</h2><button id="goQuick" class="gohead quick" hidden title="用意された艦隊ですぐに戦う（進行と報酬には数えない）">クイック出撃</button><button id="goBattle" class="primary gohead">出撃する</button></header>
  <div class="sortie">
    <div class="pane">
      <h3>作戦</h3>
      <div id="opList" class="cards"></div>
    </div>
    <div class="pane">
      <h3>出撃する戦区軍</h3>
      <div id="sgList" class="cards"></div>
      <div id="sgLoad"></div>
    </div>
  </div>
</section>
<section class="scr" data-s="org" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2>艦隊編集</h2>
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="group">戦区軍</button><button role="tab" data-tab="army">打撃群</button><button role="tab" data-tab="bg">支隊</button>
    </div>
  </header>
  <p class="tabnote" id="tabNote"></p>
  <p class="orgcap" id="orgCap"></p>
  <div class="org">
    <aside class="list" id="orgList"></aside>
    <div class="detail" id="orgDetail"></div>
  </div>
</section>
<section class="scr" data-s="data" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2>艦艇データ</h2></header>
  <p class="tabnote">数値はすべて仮の値です（1〜10）。表の値は技術ツリーの研究をすべて終えた最終形態（最大）で、自分で編成した艦隊は最初その3割から始まります。速度は打撃群の移動速度を決め、打撃群は最も遅い艦に合わせて動きます。視界は敵を見つけられる距離、隠蔽性は敵からの見つかりにくさで、打撃群の視界は最も高い艦、隠蔽性は最も低い艦で決まります。母艦は敵が近づくと艦載機やW.A.S.（Weaponed Armored Shell・武装装甲化外骨格）を自動で発進させます。艦載機は遠くまで届き、W.A.S.は近距離で打たれ強く火力が高い小型ユニットです。</p>
  <div class="tblwrap"><table class="ships" id="shipTbl"></table></div>
  <h3 class="sub">編成ボーナス（打撃群単位・仮）</h3>
  <div class="tblwrap"><table class="ships" id="bonusTbl"></table></div>
</section>`;

menu.addEventListener('click',e=>{
  const go=e.target.closest('[data-go]'); if(go){ show(go.dataset.go); return; }
  const t=e.target.closest('[data-tab]'); if(t){ tab=t.dataset.tab; confirmDel=null; render(); }
});

/* ---------- title (main menu) ---------- */
function renderTitle(){
  const P=prog(), next=CAMP.find(o=>!cleared(o.id)), last=[...CAMP].reverse().find(o=>cleared(o.id));
  document.getElementById('tStat').innerHTML=`<span>資金 <b>${P.funds.toLocaleString()}</b></span><span>進行 <b>${last?esc(opLabel(last))+'まで完了':'開始前'}</b></span>${dbg.free||dbg.battle?'<span class="dbgon">デバッグ中</span>':''}`;
  const item=(key,go,name,desc)=>{ const ok=!key||unlocked(key)||dbg.free;
    return `<button data-go="${go}" ${ok?'':'disabled'}><b>${ok?'':LOCK}${name}</b><span>${ok?desc:unlockText(key)}</span></button>`; };
  document.getElementById('mainNav').innerHTML=
    `<button data-go="sortie" class="lead"><b>出撃</b><span>${next?`次の作戦：${esc(opLabel(next))}`:'次の作戦は準備中。クリアした作戦はもう一度遊べます'}</span></button>`+
    item('fleet','org','艦隊編集','支隊・打撃群・戦区軍を組む')+
    item('tech','tech','技術ツリー','資金を使い、兵科ごとの出撃上限を上げる')+
    item(null,'data','艦艇データ','8艦種の能力と編成ボーナス');
  renderDebug();
}
/* the debug panel (bottom right of the title, folded at first) */
let dbgOpen=false, dbgConfirm=false;
function renderDebug(){
  const t=document.getElementById('dbgT'), b=document.getElementById('dbgB');
  t.setAttribute('aria-expanded',String(dbgOpen)); b.hidden=!dbgOpen; if(!dbgOpen) return;
  b.innerHTML=`
    <label class="toggle"><input type="checkbox" data-dbg="free" ${dbg.free?'checked':''}> 作戦と画面を自由に選ぶ（鍵と出撃上限を無視）</label>
    <label class="toggle"><input type="checkbox" data-dbg="battle" ${dbg.battle?'checked':''}> 戦闘中のメニューに即勝利・即敗北</label>
    <div class="dbgr"><button data-dbga="one" title="まだクリアしていない最初の節を、勝ったときと同じに扱う（報酬と緊急援助も入る）">一節だけクリア</button><button data-dbga="all">全作戦クリア</button><button data-dbga="funds">資金 +1000</button><button data-dbga="branches" title="物語でまだ開いていない兵科（戦艦・母艦・W.A.S. 部隊）を、研究はせずに開く">全兵科解放</button><button data-dbga="tech">全研究（全兵科を解放）</button><button data-dbga="reset" class="danger" title="進行（クリア・資金・研究）と、艦隊（支隊・打撃群・戦区軍）を最初の状態に戻す">${dbgConfirm?'もう一度押すと戻します':'進行を最初に戻す'}</button></div>
    <p class="dim small">進行を戻しても、編成はそのまま残ります。</p>`;
  b.querySelectorAll('[data-dbg]').forEach(x=>x.onchange=()=>{ dbg[x.dataset.dbg]=x.checked; persistDbg(); renderTitle(); });
  b.querySelectorAll('[data-dbga]').forEach(x=>x.onclick=()=>{ const a=x.dataset.dbga, P=prog();
    if(a!=='reset') dbgConfirm=false;
    /* 一節だけ: the first section not cleared yet counts as won (its reward and aid too) */
    if(a==='one'){ const o=CAMP.find(x=>!cleared(x.id)); if(o){ P.funds+=o.reward||0; P.cleared.push(o.id); grantAid(o); } }
    if(a==='all') OPS.forEach(o=>{ if(!cleared(o.id)) P.cleared.push(o.id); if(o.aid) P.flags['aid:'+o.id]=true; });
    if(a==='funds') P.funds+=1000;
    /* 全兵科解放: opens every branch the story has not opened yet, without researching anything (user decision 2026-10-04) */
    if(a==='branches') BRANCHES.forEach(br=>{ if(br.need) P.flags[br.need]=true; });
    /* 全研究 also opens the branches the story has not opened yet (戦艦・母艦・W.A.S. 部隊) */
    if(a==='tech') BRANCHES.forEach(br=>{ if(br.need) P.flags[br.need]=true; P.tech[br.id]=TREE.map(n=>n.id); });
    /* back to the start: the progress and the fleets (battle groups, armies, army groups) as a new save has them (user decision 2026-10-04) */
    if(a==='reset'){ if(!dbgConfirm){ dbgConfirm=true; renderDebug(); return; } dbgConfirm=false;
      const d=defaults(); Object.assign(save,{seq:d.seq,bgs:d.bgs,armies:d.armies,groups:d.groups,prog:newProg()}); selBg=selArmy=selGroup=null; sortieGroups=[]; }
    persist(); renderTitle(); });
}
document.addEventListener('click',e=>{ if(e.target.closest('#dbgT')){ dbgOpen=!dbgOpen; dbgConfirm=false; renderDebug(); } });

/* ---------- tech tree ----------
   tabs: 宇宙軍 / 地上軍 (地上軍 comes later). left: a thin bar of the branches the story has opened.
   right: the tree of the chosen branch, a web of ○ nodes linked by their requirements, scrolled sideways.
   Click a node to see it below and research it there */
const STAT_NAME={atk:'攻撃',def:'防御',eva:'回避',rng:'射程',aa:'対空照準',vis:'視界',stl:'隠蔽性',spd:'速度'};
const CRAFT_NAME={dmg:'火力',hp:'耐久',eva:'回避'};
const crafts=b=>[...new Set(b.types.flatMap(t=>Object.keys(SHIP[t].hangar||{})))];
const num2=v=>v<1?v.toFixed(2):num(v);
/* node icons: thin line drawings in a 24×24 box, drawn in the node's colour */
const ICONS={
  cap:'<path d="M6 21V4M6 4h11l-2.5 3.5L17 11H6"/>',
  gun:'<path d="M3 15h9l2-2h7v-3h-7l-2-2H3z"/><path d="M6 15v4h4v-4"/>',
  aim:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  armor:'<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M8.5 11.5l2.5 2.5 4.5-5"/>',
  engine:'<path d="M4 8l6 4-6 4M11 8l6 4-6 4"/><path d="M19 7v10"/>',
  sensor:'<path d="M5 19a10 10 0 0 1 0-14M8.5 15.5a5 5 0 0 1 0-7"/><circle cx="12" cy="12" r="1.6"/><path d="M12 12l8-6"/>',
  fighter:'<path d="M12 3l2 7 7 4v2l-7-2-1 5 2 2v1l-3-1-3 1v-1l2-2-1-5-7 2v-2l7-4z"/>',
  /* W.A.S. (user decision 2026-10-03, design C; D is kept in docs/icons/): a little larger than a person. Arms tapering to a point
     above the shoulders and spread like ハ, joined to the body by thin lines; a main gun on the back, straight up along the body; an
     autocannon on the arm; a small head; a chest with a step to the narrow belly; short slim legs with a ^ knee and a thruster
     alongside, joined to the waist by thin lines. Angular armor, lightly filled */
  was:'<g stroke-width="1.2" transform="translate(0 2.48)"><path d="M10.2 8V1.2"/><circle cx="12" cy="7.05" r=".85"/><path stroke-width=".6" d="M10.5 8.7L8.4 7.6M10.75 9.4L8.1 9.3M13.5 8.7l2.1-1.1M13.25 9.4l2.65-.1"/><path stroke-width=".6" d="M11.30 10.60L10.92 11.30M12.70 10.60L13.08 11.30M11.50 11.05L11.26 11.35M12.50 11.05L12.74 11.35"/><g fill="currentColor" fill-opacity=".3"><path d="M10.3 8.0 L13.7 8.0 L13.35 9.5 L12.95 9.75 L12.55 11.2 L12.0 11.7 L11.45 11.2 L11.05 9.75 L10.65 9.5 Z"/><path fill="none" stroke-width=".6" d="M10.6 9.0 L12.0 9.4 L13.4 9.0"/><g transform="rotate(14 7.55 5.8)"><path d="M8.2 2.8 L7.0 5.8 L6.25 9.8 L6.25 12.2 L7.32 15.0 L8.85 12.4 L8.85 9.6 L8.5 5.2 Z"/><path fill="none" stroke-width=".6" d="M6.7 8.0 L8.75 7.2"/></g><g transform="rotate(-14 16.45 5.8)"><path d="M15.8 2.8 L17.0 5.8 L17.75 9.8 L17.75 12.2 L16.68 15.0 L15.15 12.4 L15.15 9.6 L15.5 5.2 Z"/><path fill="none" stroke-width=".6" d="M17.3 8.0 L15.25 7.2"/><path fill="none" d="M16.45 15.0v3.2"/></g><path d="M10.82 11.3 L11.24 11.3 L11.54 11.93 L11.54 13.91 L11.66 16.25 L10.1 16.25 L10.28 13.91 L10.4 12.29 Z"/><path d="M13.18 11.3 L12.76 11.3 L12.46 11.93 L12.46 13.91 L12.34 16.25 L13.9 16.25 L13.72 13.91 L13.6 12.29 Z"/><path d="M10.1 11.8 L10.15 12.9 L10.05 13.9 L9.95 15.1 L9.1 15.1 L9.25 13.9 L9.4 12.9 Z"/><path d="M13.9 11.8 L13.85 12.9 L13.95 13.9 L14.05 15.1 L14.9 15.1 L14.75 13.9 L14.6 12.9 Z"/><path fill="none" stroke-width=".6" d="M10.33 14.18 L10.91 13.55 L11.49 14.18 M13.67 14.18 L13.09 13.55 L12.51 14.18 M9.18 14.5 L10.0 14.5 M14.82 14.5 L14.0 14.5"/></g></g>',
  deck:'<path d="M3 15h18l-2 4H5zM6 15V9h12v6M9 9V6h6v3"/>',
  supply:'<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/><path d="M9 12h6M12 9v6"/>',
  flak:'<path d="M12 21v-6M8 21h8"/><path d="M12 15l-5-9M12 15l5-9"/><circle cx="6" cy="4" r="1.2"/><circle cx="18" cy="4" r="1.2"/>',
  stealth:'<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/><path d="M4 20L20 4"/>',
};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]||ICONS.cap}</svg>`;
const num=v=>(Math.round(v*10)/10).toFixed(1);
/* one line for the tooltip: what a node raises */
const effShort=(b,n)=>n.add&&n.add.out?'同時に出撃できる隊 +1'
  :n.add&&n.add.turn?'補給が速くなる'
  :n.cap?`出撃上限 +${b.steps[n.cap].cap-b.steps[n.cap-1].cap}隻`
  :n.craft?Object.keys(n.add).map(k=>`${D.crafts[n.craft].name} ${CRAFT_NAME[k]} +${num2(D.crafts[n.craft][k]*n.add[k])}`).join('・')
  :Object.keys(n.add).map(k=>`${STAT_NAME[k]} +${b.types.map(t=>num(SHIP[t][k]*n.add[k])).join('/')}`).join('・');
let techForce='space', techBr=null, techSel=null;
/* the tree view (user decision 2026-10-04): drag with the left button to move it up, down and sideways, the wheel to zoom.
   tv = {br, x, y, z}: the branch shown, the offset of the tree in its box and the zoom */
let tv=null, treeDragged=false, treeWired=false;
const TREE_Z=[.4,1.8];
function fitTree(br,cw,ch){ const box=document.getElementById('trScroll'), W=box.clientWidth||900, H=box.clientHeight||480;
  const z=Math.max(TREE_Z[0],Math.min(1,(H-8)/ch,(W-8)/Math.min(cw,W/.6))); tv={br,x:8,y:Math.max(4,(H-ch*z)/2),z}; }
function placeTree(){ document.getElementById('trCv').style.transform=`translate(${tv.x}px,${tv.y}px) scale(${tv.z})`; }
function wireTree(){
  if(treeWired) return; treeWired=true;
  const box=document.getElementById('trScroll'); let drag=null;
  box.addEventListener('pointerdown',e=>{ if(e.button!==0) return; drag={x:e.clientX,y:e.clientY,tx:tv.x,ty:tv.y}; treeDragged=false; });
  addEventListener('pointermove',e=>{ if(!drag) return; const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if(!treeDragged&&Math.hypot(dx,dy)<4) return; treeDragged=true; box.classList.add('drag'); tv.x=drag.tx+dx; tv.y=drag.ty+dy; placeTree(); });
  addEventListener('pointerup',()=>{ if(!drag) return; drag=null; box.classList.remove('drag'); setTimeout(()=>treeDragged=false,0); });
  /* zoom around the pointer */
  box.addEventListener('wheel',e=>{ e.preventDefault(); const r=box.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
    const z=Math.max(TREE_Z[0],Math.min(TREE_Z[1],tv.z*Math.exp(-e.deltaY*.0015))), k=z/tv.z;
    tv.x=mx-(mx-tv.x)*k; tv.y=my-(my-tv.y)*k; tv.z=z; placeTree(); },{passive:false});
}
function renderTech(){
  const P=prog(), F=D.techForces, force=F.find(f=>f.id===techForce)||F[0];
  document.getElementById('techFunds').innerHTML=`資金 <b>${P.funds.toLocaleString()}</b>`;
  document.getElementById('forceTabs').innerHTML=F.map(f=>`<button role="tab" data-force="${f.id}" aria-selected="${f===force}">${esc(f.name)}</button>`).join('');
  document.querySelectorAll('#forceTabs [data-force]').forEach(x=>x.onclick=()=>{ techForce=x.dataset.force; techSel=null; renderTech(); });
  const soon=document.getElementById('forceSoon'), wrap=document.getElementById('techWrap');
  soon.hidden=!force.soon; wrap.hidden=!!force.soon;
  if(force.soon){ soon.textContent=`${force.name}の技術ツリーは準備中です。${force.soon}`; return; }
  const open=BRANCHES.filter(branchOpen);
  if(!open.includes(techBr)) techBr=open[0];
  const b=techBr;
  document.getElementById('brBar').innerHTML=open.map(x=>`<button data-br="${x.id}" aria-pressed="${x===b}"><b>${esc(x.name)}</b><span>上限${branchCap(x)}隻</span></button>`).join('');
  document.querySelectorAll('#brBar [data-br]').forEach(x=>x.onclick=()=>{ techBr=BRANCHES.find(y=>y.id===x.dataset.br); techSel=null; renderTech(); });
  /* the branch now: each ship class's stats as numbers (the final form is not shown) */
  document.getElementById('trSum').innerHTML=`<div class="trhead"><b>${esc(b.name)}</b><span>出撃上限 ${branchCap(b)}隻</span></div>`+
    b.types.map(t=>`<div class="trrow"><span class="tname">${SHIP[t].name}</span>${RATED.map(k=>`<i>${STAT_NAME[k]} <em>${num(SHIP[t][k]*statRate(b,k))}</em></i>`).join('')}</div>`).join('')+
    crafts(b).map(c=>{ const o=craftOwner(c)||b; return `<div class="trrow"><span class="tname">${D.crafts[c].name}</span>${o===b?CRAFT_STATS.map(k=>`<i>${CRAFT_NAME[k]} <em>${num2(D.crafts[c][k]*craftRate(b,c,k))}</em></i>`).join(''):`<i>機体の研究は${esc(o.name)}</i>`}`+
      `<i>出撃 <em>${craftOut(b,c)}</em>隊</i><i>補給 <em>${num(D.crafts[c].rearm/craftTurn(b))}</em>秒</i></div>`; }).join('');
  /* the web: nodes at (col,row), a curve from each requirement to the node */
  const CW=168, RH=68, R=21, PADX=80, PADY=10;
  const at=n=>({x:PADX+n.col*CW, y:PADY+R+ROWS.indexOf(n.row)*RH});
  const NODES=nodesOf(b), ROWS=[...new Set(NODES.map(n=>n.row))].sort((x,y)=>x-y);
  const cols=Math.max(...NODES.map(n=>n.col))+1, rows=ROWS.length;
  const edges=NODES.flatMap(n=>n.req.map(r=>{ const p=at(nodeById(r)), q=at(n), m=(p.x+q.x)/2;
    const st=nodeDone(b,nodeById(r))?(nodeDone(b,n)?'on':'ready'):'';
    return `<path d="M${p.x+R} ${p.y}C${m} ${p.y} ${m} ${q.y} ${q.x-R} ${q.y}" class="${st} ${techSel===n.id?'req':techSel===r?'next':''}"/>`; })).join('');
  const selN=nodeById(techSel);
  const nodes=NODES.map(n=>{ const p=at(n), done=nodeDone(b,n), can=nodeOpen(b,n), sel=techSel===n.id, pre=selN&&selN.req.includes(n.id);
    return `<button class="tn ${done?'done':can?'can':''} ${sel?'sel':''} ${pre?'pre':''}" data-node="${n.id}" style="left:${p.x}px;top:${p.y}px" aria-pressed="${sel}" title="${esc(nodeName(b,n))}　${done?'研究済み':`資金${nodeCost(b,n)}`}　${esc(effShort(b,n))}"><i class="orb">${icon(n.icon)}</i><b>${esc(nodeName(b,n))}</b></button>`; }).join('');
  const cv=document.getElementById('trCv'), cw=PADX*2+(cols-1)*CW, ch=PADY*2+(rows-1)*RH+R*2+30;
  cv.style.width=cw+'px'; cv.style.height=ch+'px';
  /* a new branch starts fitted to the box (no vertical scroll); then it is dragged and zoomed freely (treeView) */
  if(!tv||tv.br!==b.id) fitTree(b.id,cw,ch); placeTree(); wireTree();
  cv.innerHTML=`<svg class="tedges" width="100%" height="100%" aria-hidden="true">${edges}</svg>${nodes}`;
  cv.querySelectorAll('[data-node]').forEach(x=>x.onclick=()=>{ if(treeDragged) return; techSel=x.dataset.node; renderTech(); });
  /* the chosen node */
  const info=document.getElementById('tInfo'), n=nodeById(techSel);
  if(!n){ info.innerHTML='<p class="dim">研究を選ぶと、ここに効果と必要な資金が出ます。左の列の研究は最初から始められます。</p>'; return; }
  const done=nodeDone(b,n), can=nodeOpen(b,n), cost=nodeCost(b,n);
  const eff=n.cap?`${esc(b.name)}の出撃上限 ${b.steps[n.cap-1].cap} → ${b.steps[n.cap].cap}隻`
    :n.add&&n.add.out?crafts(b).map(c=>{ const now=craftOut(b,c), from=done?now-1:now; return `${D.crafts[c].name} 同時に出撃できる隊　${from} → ${from+1}`; }).join('<br>')
    :n.add&&n.add.turn?crafts(b).map(c=>{ const C=D.crafts[c], from=craftTurn(b)-(done?n.add.turn:0), to=Math.min(1,from+n.add.turn);
      return `${C.name} 補給　${num(C.rearm/from)} → ${num(C.rearm/to)}秒、次の隊の発進間隔　${num(C.cd/from)} → ${num(C.cd/to)}秒`; }).join('<br>')
    :n.craft?Object.keys(n.add).map(k=>{ const C=D.crafts[n.craft], from=craftRate(b,n.craft,k)-(done?n.add[k]:0), to=Math.min(1,from+n.add[k]);
      return `${C.name} ${CRAFT_NAME[k]}　${num2(C[k]*from)} → ${num2(C[k]*to)}（+${num2(C[k]*(to-from))}）`; }).join('<br>')
    :Object.keys(n.add).map(k=>{ const from=statRate(b,k)-(done?n.add[k]:0), to=Math.min(1,from+n.add[k]);
      return `${STAT_NAME[k]}　${b.types.map(t=>`${SHIP[t].name} ${num(SHIP[t][k]*from)} → ${num(SHIP[t][k]*to)}（+${num(SHIP[t][k]*(to-from))}）`).join('、')}`; }).join('<br>');
  /* prerequisites (all of them, marked done or not) and what this one leads to */
  const reqs=n.req.length?n.req.map(r=>{ const x=nodeById(r), ok=nodeDone(b,x); return `<span class="${ok?'ok':'ng'}">${ok?'✓':'✗'} ${esc(nodeName(b,x))}</span>`; }).join(''):'<span class="ok">なし（最初から研究できる）</span>';
  const leads=NODES.filter(c=>c.req.includes(n.id)).map(c=>esc(nodeName(b,c)));
  info.innerHTML=`<div><b>${esc(nodeName(b,n))}</b><p>${eff}</p><p class="treq">前提の研究：${reqs}</p>${leads.length?`<p class="dim">この先：${leads.join('・')}</p>`:''}</div>`+
    `<div class="tact">${done?'<em>研究済み</em>':`<span>資金 ${cost}</span><button id="tRes" ${can&&P.funds>=cost?'':'disabled'}>研究する</button>${can&&P.funds<cost?'<em class="dim">資金が足りません</em>':''}`}</div>`;
  const r=document.getElementById('tRes'); if(r) r.onclick=()=>{ if(!nodeOpen(b,n)||P.funds<cost) return; P.funds-=cost; techOf(b).push(n.id); persist(); renderTech(); };
}
/* the mouse wheel scrolls the tree sideways */
document.addEventListener('wheel',e=>{ const sc=e.target.closest&&e.target.closest('#trScroll'); if(!sc||Math.abs(e.deltaX)>Math.abs(e.deltaY)) return;
  if(sc.scrollWidth>sc.clientWidth){ e.preventDefault(); sc.scrollLeft+=e.deltaY; } },{passive:false});

/* ---------- sortie ---------- */
function groupSummary(g){ return g.members.map(m=>armyById(m.army)).filter(Boolean); }
function renderSortie(){
  /* the campaign first, then the exercises; a locked operation shows how it opens. At first the next one to play is chosen */
  const list=[...CAMP,...OPS.filter(o=>!o.chapter)];
  if(!list.some(o=>o.id===sortieOp&&opOpen(o))) sortieOp=(CAMP.find(o=>!cleared(o.id)&&opOpen(o))||list.find(opOpen)||list[0]).id;
  const ol=document.getElementById('opList');
  const card=o=>{ const ok=opOpen(o), done=cleared(o.id), i=CAMP.indexOf(o);
    const why=i>0?`${opLabel(CAMP[i-1])}をクリアで解放`:unlockText('fleet');
    return `<button class="op ${o.id===sortieOp?'sel':''} ${ok?'':'locked'}" data-op="${o.id}" aria-pressed="${o.id===sortieOp}" ${ok?'':'disabled'}>${o.chapter?`<i class="chap">${esc(o.chapter)}${done?'　<span class="clr">クリア済み</span>':''}</i>`:done?'<i class="chap"><span class="clr">クリア済み</span></i>':''}<b>${ok?'':LOCK}${esc(o.name)}</b><span>${ok?esc(o.summary):esc(why)}</span>${ok?`<em>${esc(o.threat)}　報酬：資金${o.reward||0}${done?`（再戦は${Math.round((o.reward||0)*D.reward.replay)}）`:''}</em>`:''}</button>`; };
  ol.innerHTML=`<p class="grp">キャンペーン</p>${CAMP.map(card).join('')}<p class="grp">演習（自分の戦区軍か、クイック出撃の用意された艦隊で戦う）</p>${OPS.filter(o=>!o.chapter).map(card).join('')}`;
  ol.querySelectorAll('[data-op]').forEach(b=>b.onclick=()=>{ sortieOp=b.dataset.op; renderSortie(); });
  const load=document.getElementById('sgLoad'); load.innerHTML='';
  /* several army groups may sortie together while the ships of each branch stay within the limit (user decision 2026-10-04).
     Two groups that share an army cannot go out together: once one is chosen, the other is dimmed */
  sortieGroups=sortieGroups.filter(id=>save.groups.some(g=>g.id===id)); if(!sortieGroups.length&&save.groups[0]) sortieGroups=[save.groups[0].id];
  const el=document.getElementById('sgList'), fixedOp=OPS.find(o=>o.id===sortieOp&&o.forces==='fixed');
  /* an exercise with prepared fleets (op.quick): クイック出撃 fights with them, not counted for progress or reward (user decision 2026-10-04) */
  const qOp=!fixedOp&&OPS.find(o=>o.id===sortieOp&&o.quick), qb=document.getElementById('goQuick'); qb.hidden=!qOp;
  if(qOp) qb.onclick=()=>{ if(window.WOS){ running={quick:true}; window.WOS.start({op:qOp.id}); } };
  /* a story operation is fought with the fleets the story gives; army groups are not used */
  if(fixedOp){ el.innerHTML=`<p class="empty">この作戦は決まった艦隊で戦います：${fixedOp.quick.map(f=>esc(f.name)).join('・')}</p>`;
    const btn=document.getElementById('goBattle'); btn.disabled=false; btn.onclick=()=>{ if(window.WOS){ running={op:fixedOp.id}; window.WOS.start({op:fixedOp.id, flags:storyFlags()}); } }; return; }
  /* before 艦隊編集 opens, an exercise is fought only with クイック出撃 */
  if(!unlocked('fleet')&&!dbg.free){ el.innerHTML=`<p class="empty">自分の戦区軍での出撃は、${esc(unlockText('fleet'))}。今はクイック出撃（用意された艦隊）で戦えます。</p>`;
    const btn=document.getElementById('goBattle'); btn.disabled=true; btn.onclick=null; return; }
  const chosen=sortieGroups.map(id=>save.groups.find(g=>g.id===id)), clashes=g=>!sortieGroups.includes(g.id)&&chosen.some(h=>shareArmy(g,h));
  el.innerHTML=save.groups.length?save.groups.map(g=>{ const arms=groupSummary(g); const ships=arms.reduce((s,a)=>s+armyStats(a).ships,0), on=sortieGroups.includes(g.id), cl=clashes(g);
    return `<button class="sgcard ${on?'sel':''} ${cl?'clash':''}" data-sg="${g.id}" aria-pressed="${on}" ${cl?'disabled':''}>${cl?'<i class="clashnote">同一支隊を含みます</i>':''}<b>${esc(g.name)}</b><span>${arms.map(a=>esc(a.name)).join('・')||'打撃群が未配置'}</span><em>${arms.length}個打撃群・${ships}隻・速度同期${g.sync?'あり':'なし'}</em></button>`;}).join('')
    :'<p class="empty">戦区軍がありません。艦隊編集で作成してください。</p>';
  el.querySelectorAll('[data-sg]').forEach(b=>b.onclick=()=>{ const id=b.dataset.sg; sortieGroups=sortieGroups.includes(id)?sortieGroups.filter(x=>x!==id):[...sortieGroups,id]; renderSortie(); });
  /* the sortie limit per branch (tech tree), for all the chosen groups together */
  const rows=chosen.length?groupLoad(chosen):[], over=rows.some(r=>r.used>r.cap);
  if(chosen.length) load.innerHTML=`<h3>出撃上限（技術ツリー）${chosen.length>1?`　<span class="dim">${chosen.length}個戦区軍の合計</span>`:''}</h3><table class="load"><tbody>${rows.map(r=>`<tr class="${r.used>r.cap?'over':''}"><th>${esc(r.b.name)}</th><td>${r.used} / ${r.cap}隻</td><td class="note">${r.used>r.cap?(branchOpen(r.b)?'上限を超えています':esc(r.b.needText||'未解放')):''}</td></tr>`).join('')}</tbody></table>${
    over?`<p class="warn">${dbg.free?'デバッグ：出撃上限を無視して出撃できます。':'上限を超える兵科があります。艦隊編集で艦を減らすか、技術ツリーで上限を上げてください。'}</p>`:''}`;
  const btn=document.getElementById('goBattle'); btn.disabled=!chosen.length||!chosen.some(g=>groupSummary(g).some(a=>armyStats(a).ships>0))||over&&!dbg.free;
  btn.onclick=()=>{ running={op:sortieOp}; startBattle(chosen); };
}
/* whether two army groups have an army in common */
function shareArmy(g,h){ return g.members.some(m=>h.members.some(n=>n.army===m.army)); }
/* the flagship of an army group: the army chosen with ☆, or the first one */
function flagIndex(g){ const i=g.members.findIndex(m=>m.army===g.flag); return i<0?0:i; }
/* each cube is laid out around its flagship: the army groups stand side by side across the deploy point (GROUP_SPREAD apart),
   the armies keep their places in the cube relative to the flagship (1 cell = 16 across, 10 up). They can be moved before the
   battle starts (battle/hud.js, the deploy step) */
const GROUP_SPREAD=56;
function startBattle(gs){
  if(!window.WOS) return;
  if(!gs||!gs.length){ window.WOS.start(null); return; }
  const op=OPS.find(o=>o.id===sortieOp)||OPS[0], [cx,cz]=op.deploy||[0,112];
  const fleets=[], groups=[], live=gs.filter(g=>g.members.some(m=>{ const a=armyById(m.army); return a&&armyStats(a).ships; }));
  live.forEach((g,i)=>{ const ok=g.members.filter(m=>{ const a=armyById(m.army); return a&&armyStats(a).ships; });
    const fm=ok.includes(g.members[flagIndex(g)])?g.members[flagIndex(g)]:ok[0], gx=cx+(i-(live.length-1)/2)*GROUP_SPREAD;
    const members=[], offsets=[];
    ok.forEach(m=>{ const a=armyById(m.army), d=[(m.x-fm.x)*16,(m.y-fm.y)*10,(m.z-fm.z)*16];
      const f=armyToFleet(a); f.pos=[gx+d[0],cz+d[2]]; f.alt=d[1]; members.push(fleets.length); offsets.push(d); fleets.push(f); });
    groups.push({name:g.name, sync:g.sync, members, flag:members[ok.indexOf(fm)], offsets}); });
  if(!fleets.length) return;
  window.WOS.start({op:op.id, fleets, groups, flags:storyFlags()});
}

/* ---------- organization ---------- */
const NOTES={
  group:'戦区軍は最大5個の打撃群をまとめ、5×5×5の立方体に配置して保存します。戦闘中は戦区軍単位で動かせ、打撃群の出し入れもできます。',
  army:'打撃群は最大5個の支隊で編成します。組み合わせで編成ボーナスが付きます。戦闘で操作する単位です。',
  bg:'支隊は同じ艦種の艦をまとめた単位です。戦闘中は編成を変えられません。'
};
/* per branch: the ships of every battle group the player has, against the branch's sortie limit (tech tree; user decision 2026-10-04).
   Branches not opened yet show only when they hold ships */
function updateOrgCap(){
  const n={}; save.bgs.forEach(b=>n[b.type]=(n[b.type]||0)+b.count);
  const rows=BRANCHES.map(b=>({b,used:b.types.reduce((s,t)=>s+(n[t]||0),0),cap:branchCap(b)})).filter(r=>branchOpen(r.b)||r.used);
  document.getElementById('orgCap').innerHTML=`<b>出撃上限（技術ツリー）</b>`+rows.map(r=>`<span class="${r.used>r.cap?'over':''}">${esc(r.b.name)} <i>${r.used}/${r.cap}隻</i>${branchOpen(r.b)?'':'（未解放）'}</span>`).join('');
}
function renderOrg(){
  refreshAutoNames();
  menu.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
  document.getElementById('tabNote').textContent=NOTES[tab]; updateOrgCap();
  ({bg:renderBgTab,army:renderArmyTab,group:renderGroupTab})[tab]();
}
function listHtml(items,selId,newLabel,attr){
  return `<button class="new" data-new>${newLabel}</button>`+items.map(it=>`<button class="li ${it.id===selId?'sel':''}" ${attr}="${it.id}" aria-pressed="${it.id===selId}"><b>${esc(it.name)}</b><span>${it.meta}</span></button>`).join('');
}
function bars(st,max=10){
  return `<dl class="stats">${STATS.map(s=>`<div><dt>${s.n}</dt><dd><i style="width:${Math.min(100,st[s.k]/max*100)}%"></i></dd><span>${st[s.k].toFixed(1)}</span></div>`).join('')}<div><dt>速度</dt><dd><i style="width:${Math.min(100,(st.spd||0)/max*100)}%"></i></dd><span>${(st.spd||0).toFixed(0)}</span></div></dl>`;
}
function delBtn(key,label){ return `<button class="danger" data-del="${key}">${confirmDel===key?'もう一度押すと削除します':label}</button>`; }
function wireDel(detail,key,fn){ const b=detail.querySelector('[data-del]'); if(b) b.onclick=()=>{ if(confirmDel===key){ confirmDel=null; fn(); persist(); renderOrg(); } else { confirmDel=key; renderOrg(); } }; }

/* battle groups */
/* a new battle group is named 第N 役割 支隊 after its class (data/ships.js unitNames; battle/state.js unitName): N starts at the
   class's number and moves on to the next free one (user decision 2026-10-04). self is left out when renaming an existing one */
function nextBgName(type,self){ return unitName('bg',type,new Set(save.bgs.filter(b=>b!==self).map(b=>unitNo(b.name)))); }
/* armies and army groups whose name was given here (auto: the main class it was named after, '' for none) follow a change of
   their main class: the highest class in them (battle/state.js mainType).
   An army of one battle group goes by that battle group's name (auto 'bg:id'); with two or more it becomes 第N 役割 打撃群
   (user decision 2026-10-04) */
function armyMain(a){ const by={}, bgs=a.bgs.map(bgById).filter(Boolean); bgs.forEach(b=>by[b.type]=(by[b.type]||0)+b.count); return mainType(by)||''; }
function groupMain(g){ const by={}, ar=g.members.map(m=>armyById(m.army)).filter(Boolean);
  ar.forEach(a=>a.bgs.map(bgById).filter(Boolean).forEach(b=>by[b.type]=(by[b.type]||0)+b.count));
  return mainType(by)||''; }
function armyKey(a){ const b=a.bgs.length===1&&bgById(a.bgs[0]); return b?'bg:'+b.id:armyMain(a); }
function refreshAutoNames(){ let ch=false;
  const run=(list,level,main)=>list.forEach(x=>{ if(x.auto===undefined) return; const t=main(x);
    if(t.startsWith('bg:')){ const n=bgById(t.slice(3)).name; if(x.auto!==t||x.name!==n){ x.auto=t; x.name=n; ch=true; } return; }
    if(t===x.auto) return;
    x.auto=t; x.name=unitName(level,t,new Set(list.filter(y=>y!==x).map(y=>unitNo(y.name)))); ch=true; });
  run(save.armies,'army',armyKey); run(save.groups,'group',groupMain); if(ch) persist(); }
function renderBgTab(){
  if(!bgById(selBg)) selBg=save.bgs[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  list.innerHTML=listHtml(save.bgs.map(b=>({id:b.id,name:b.name,meta:`${SHIP[b.type].name}×${b.count}・${armyOfBg(b.id)?esc(armyOfBg(b.id).name):'未所属'}`})),selBg,'＋ 支隊を作る','data-bg');
  /* auto: the name was given here and not edited since, so it follows a change of class */
  list.querySelector('[data-new]').onclick=()=>{ const type=SHIPS.find(t=>t.id==='dd'&&typeOpen('dd'))?'dd':SHIPS.find(t=>typeOpen(t.id)).id;
    const b={id:newId('bg'),name:nextBgName(type),type,count:4,auto:true}; save.bgs.push(b); selBg=b.id; persist(); renderOrg(); };
  list.querySelectorAll('[data-bg]').forEach(x=>x.onclick=()=>{ selBg=x.dataset.bg; confirmDel=null; renderOrg(); });
  const b=bgById(selBg);
  if(!b){ det.innerHTML='<p class="empty">支隊がありません。左の「支隊を作る」から追加してください。</p>'; return; }
  const s=SHIP[b.type], a=armyOfBg(b.id);
  /* the class buttons: only classes whose branch is open (or the one this battle group already has); locked ones are not shown (user decision 2026-10-04) */
  det.innerHTML=`
    <label class="fld">名前<input id="bgName" maxlength="20" value="${esc(b.name)}"></label>
    <div class="fld">艦種<div class="types">${SHIPS.filter(t=>typeOpen(t.id)||t.id===b.type).map(t=>`<button data-type="${t.id}" aria-pressed="${t.id===b.type}">${t.name}</button>`).join('')}</div></div>
    <label class="fld"><span>隻数 <b id="bgCountV">${b.count}</b> / 最大${s.max}</span><input id="bgCount" type="range" min="1" max="${s.max}" value="${Math.min(b.count,s.max)}"></label>
    <p class="note">${esc(s.note)}。${s.hangar?`搭載（1隻あたり）：${hangarStr(s.hangar)}。`:''}所属：${a?esc(a.name):'未所属（打撃群の画面で編入できます）'}</p>
    <h4>1隻あたりの能力（仮）　<span class="dim">技術ツリーの研究で上がります。最大は艦艇データの値</span></h4>${bars(shipNow(b.type))}
    <div class="row">${delBtn('bg:'+b.id,'この支隊を解散する')}</div>`;
  det.querySelector('#bgName').oninput=e=>{ b.name=e.target.value||'無名の支隊'; delete b.auto; persist(); list.querySelector(`[data-bg="${b.id}"] b`).textContent=b.name; };
  det.querySelectorAll('[data-type]').forEach(x=>x.onclick=()=>{ b.type=x.dataset.type; b.count=Math.min(b.count,SHIP[b.type].max); if(b.auto) b.name=nextBgName(b.type,b); persist(); renderOrg(); });
  det.querySelector('#bgCount').oninput=e=>{ b.count=+e.target.value; det.querySelector('#bgCountV').textContent=b.count; persist(); updateOrgCap(); list.querySelector(`[data-bg="${b.id}"] span`).textContent=`${SHIP[b.type].name}×${b.count}・${a?a.name:'未所属'}`; };
  wireDel(det,'bg:'+b.id,()=>{ save.armies.forEach(x=>x.bgs=x.bgs.filter(id=>id!==b.id)); save.bgs=save.bgs.filter(x=>x!==b); selBg=null; });
}

/* armies */
function renderArmyTab(){
  if(!armyById(selArmy)) selArmy=save.armies[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  list.innerHTML=listHtml(save.armies.map(a=>{ const s=armyStats(a); return {id:a.id,name:a.name,meta:`支隊${a.bgs.length}・${s.ships}隻・ボーナス${s.active.length}`}; }),selArmy,'＋ 打撃群を作る','data-army');
  list.querySelector('[data-new]').onclick=()=>{ const a={id:newId('a'),name:unitName('army',null,new Set(save.armies.map(x=>unitNo(x.name)))),bgs:[],auto:''}; save.armies.push(a); selArmy=a.id; persist(); renderOrg(); };
  list.querySelectorAll('[data-army]').forEach(x=>x.onclick=()=>{ selArmy=x.dataset.army; confirmDel=null; renderOrg(); });
  const a=armyById(selArmy);
  if(!a){ det.innerHTML='<p class="empty">打撃群がありません。左の「打撃群を作る」から追加してください。</p>'; return; }
  const {st,ships,active,hangar}=armyStats(a);
  const free=save.bgs.filter(b=>!armyOfBg(b.id));
  const slots=[...Array(MAX_BG)].map((_,i)=>{ const b=bgById(a.bgs[i]);
    if(b) return `<div class="slot full"><span class="no">${i+1}</span><b>${esc(b.name)}</b><span>${SHIP[b.type].name}×${b.count}</span><button class="x" data-rm="${b.id}" aria-label="${esc(b.name)}を外す">外す</button></div>`;
    if(i===a.bgs.length) return `<div class="slot"><span class="no">${i+1}</span>${free.length?`<select id="addBg" aria-label="編入する支隊"><option value="">＋ 未所属の支隊を編入…</option>${free.map(f=>`<option value="${f.id}">${esc(f.name)}（${SHIP[f.type].name}×${f.count}）</option>`).join('')}</select>`:'<span class="dim">未所属の支隊がありません（支隊の画面で作成）</span>'}</div>`;
    return `<div class="slot vacant"><span class="no">${i+1}</span><span class="dim">空き</span></div>`; }).join('');
  det.innerHTML=`
    <label class="fld">名前<input id="armyName" maxlength="20" value="${esc(a.name)}"></label>
    <h4>支隊（${a.bgs.length}/${MAX_BG}）</h4><div class="slots">${slots}</div>
    <h4>打撃群の能力　<span class="dim">総数${ships}隻${Object.keys(hangar).length?`・搭載 ${hangarStr(hangar)}`:''}・速度は最も遅い艦に合わせます</span></h4>${bars(st)}
    <h4>編成ボーナス</h4>
    <ul class="bonus">${BONUSES.map(bn=>`<li class="${active.includes(bn)?'on':''}"><b>${bn.name}</b><span>${bn.cond}</span><em>${bn.eff}</em></li>`).join('')}</ul>
    <div class="row">${delBtn('army:'+a.id,'この打撃群を解散する')}</div>`;
  det.querySelector('#armyName').oninput=e=>{ a.name=e.target.value||'無名の打撃群'; delete a.auto; persist(); list.querySelector(`[data-army="${a.id}"] b`).textContent=a.name; };
  const add=det.querySelector('#addBg'); if(add) add.onchange=()=>{ if(add.value){ a.bgs.push(add.value); persist(); renderOrg(); } };
  det.querySelectorAll('[data-rm]').forEach(x=>x.onclick=()=>{ a.bgs=a.bgs.filter(id=>id!==x.dataset.rm); persist(); renderOrg(); });
  wireDel(det,'army:'+a.id,()=>{ save.groups.forEach(g=>g.members=g.members.filter(m=>m.army!==a.id)); save.armies=save.armies.filter(x=>x!==a); selArmy=null; });
}

/* army groups */
function renderGroupTab(){
  if(!save.groups.find(g=>g.id===selGroup)) selGroup=save.groups[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  list.innerHTML=listHtml(save.groups.map(g=>({id:g.id,name:g.name,meta:`打撃群${g.members.length}/${MAX_ARMY}・速度同期${g.sync?'あり':'なし'}`})),selGroup,'＋ 戦区軍を作る','data-grp');
  list.querySelector('[data-new]').onclick=()=>{ const g={id:newId('g'),name:unitName('group',null,new Set(save.groups.map(x=>unitNo(x.name)))),sync:true,members:[],auto:''}; save.groups.push(g); selGroup=g.id; persist(); renderOrg(); };
  list.querySelectorAll('[data-grp]').forEach(x=>x.onclick=()=>{ selGroup=x.dataset.grp; placing=null; confirmDel=null; renderOrg(); });
  const g=save.groups.find(x=>x.id===selGroup);
  if(!g){ det.innerHTML='<p class="empty">戦区軍がありません。左の「戦区軍を作る」から追加してください。</p>'; preview.set(null); return; }
  if(placing!=null&&!g.members[placing]) placing=null;
  const avail=save.armies.filter(a=>!g.members.some(m=>m.army===a.id));
  const fi=flagIndex(g);
  const chips=g.members.map((m,i)=>{ const a=armyById(m.army); const s=a?armyStats(a):null;
    return `<div class="chip ${placing===i?'sel':''}" style="--c:${GROUP_COLORS[i]}"><button class="pick" data-pick="${i}" aria-pressed="${placing===i}"><i></i><b>${a?esc(a.name):'?'}</b><span>${s?`${s.ships}隻・速度${s.st.spd.toFixed(0)}`:''}　位置 ${'ABCDE'[m.x]}${m.z+1}・高さ${m.y+1}</span></button><button class="flg" data-flag="${i}" aria-pressed="${i===fi}" title="${i===fi?'この打撃群が旗艦（陣形の中心）':'この打撃群を旗艦（陣形の中心）にする'}">${i===fi?'★ 旗艦':'☆'}</button><button class="x" data-out="${i}" aria-label="外す">外す</button></div>`; }).join('');
  const cells=[];
  for(let z=0;z<CUBE;z++) for(let x=0;x<CUBE;x++){
    const here=g.members.findIndex(m=>m.x===x&&m.z===z&&m.y===layer);
    const other=g.members.findIndex(m=>m.x===x&&m.z===z&&m.y!==layer);
    cells.push(`<button class="cell" data-cx="${x}" data-cz="${z}" style="${here>=0?`--c:${GROUP_COLORS[here]}`:other>=0?`--o:${GROUP_COLORS[other]}`:''}" ${here>=0?'data-on':''} ${other>=0&&here<0?'data-other':''} aria-label="${'ABCDE'[x]}${z+1}">${here>=0?esc((armyById(g.members[here].army)||{}).name||''):''}</button>`);
  }
  const slowest=g.members.map(m=>armyById(m.army)).filter(Boolean).map(a=>armyStats(a).st.spd).filter(v=>v>0);
  det.innerHTML=`
    <label class="fld">名前<input id="grpName" maxlength="20" value="${esc(g.name)}"></label>
    <label class="toggle"><input type="checkbox" id="grpSync" ${g.sync?'checked':''}> 移動時は最も遅い艦に速度を合わせる <span class="dim">${slowest.length?`（この戦区軍では速度${Math.min(...slowest).toFixed(0)}）`:''}</span></label>
    <h4>所属する打撃群（${g.members.length}/${MAX_ARMY}）　<span class="dim">打撃群を選んでから、下の格子で置き場所を押します。★の旗艦を中心に陣形を組みます</span></h4>
    <div class="chips">${chips}${g.members.length<MAX_ARMY?(avail.length?`<select id="addArmy" aria-label="追加する打撃群"><option value="">＋ 打撃群を追加…</option>${avail.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>`:'<span class="dim">追加できる打撃群がありません</span>'):''}</div>
    <div class="cubeed">
      <div class="layer">
        <div class="lyr" role="group" aria-label="高さの段">${[4,3,2,1,0].map(y=>`<button data-ly="${y}" aria-pressed="${y===layer}">${y+1}${y===4?' 上':y===0?' 下':''}</button>`).join('')}</div>
        <div class="gridwrap"><p class="front">▲ 前方（敵側）</p><div class="grid">${cells.join('')}</div><p class="dim small">点線の枠は別の高さにいる打撃群です</p></div>
      </div>
      <div class="pv"><canvas id="cubeCv" aria-label="配置の立体表示（ドラッグで回転）"></canvas><p class="dim small">ドラッグで回転</p></div>
    </div>
    <div class="row">${delBtn('grp:'+g.id,'この戦区軍を削除する')}</div>`;
  det.querySelector('#grpName').oninput=e=>{ g.name=e.target.value||'無名の戦区軍'; delete g.auto; persist(); list.querySelector(`[data-grp="${g.id}"] b`).textContent=g.name; };
  det.querySelector('#grpSync').onchange=e=>{ g.sync=e.target.checked; persist(); renderOrg(); };
  const add=det.querySelector('#addArmy'); if(add) add.onchange=()=>{ if(!add.value) return; const spot=freeCell(g); g.members.push({army:add.value,...spot}); placing=g.members.length-1; layer=spot.y; persist(); renderOrg(); };
  det.querySelectorAll('[data-pick]').forEach(x=>x.onclick=()=>{ const i=+x.dataset.pick; placing=placing===i?null:i; if(placing!=null) layer=g.members[i].y; renderOrg(); });
  det.querySelectorAll('[data-out]').forEach(x=>x.onclick=()=>{ const [m]=g.members.splice(+x.dataset.out,1); if(m&&m.army===g.flag) delete g.flag; placing=null; persist(); renderOrg(); });
  det.querySelectorAll('[data-flag]').forEach(x=>x.onclick=()=>{ g.flag=g.members[+x.dataset.flag].army; persist(); renderOrg(); });
  det.querySelectorAll('[data-ly]').forEach(x=>x.onclick=()=>{ layer=+x.dataset.ly; renderOrg(); });
  det.querySelectorAll('[data-cx]').forEach(c=>c.onclick=()=>{
    const x=+c.dataset.cx, z=+c.dataset.cz, occ=g.members.findIndex(m=>m.x===x&&m.z===z&&m.y===layer);
    if(placing==null){ if(occ>=0){ placing=occ; renderOrg(); } return; }
    if(occ>=0&&occ!==placing){ const o=g.members[occ], p=g.members[placing]; [o.x,o.y,o.z]=[p.x,p.y,p.z]; }
    Object.assign(g.members[placing],{x,y:layer,z}); persist(); renderOrg(); });
  wireDel(det,'grp:'+g.id,()=>{ save.groups=save.groups.filter(x=>x!==g); selGroup=null; });
  preview.set(g, det.querySelector('#cubeCv'));
}
function freeCell(g){ for(const y of [2,1,3,0,4]) for(const z of [2,1,3,0,4]) for(const x of [2,1,3,0,4]) if(!g.members.some(m=>m.x===x&&m.y===y&&m.z===z)) return {x,y,z}; return {x:0,y:0,z:0}; }

/* small 3D preview of the 5×5×5 cube */
const preview=(()=>{
  let r=null,sc,cam,ctl,boxes=null,cv=null,group=null,active=false;
  function init(){
    r=new THREE.WebGLRenderer({antialias:true,alpha:true}); r.setPixelRatio(Math.min(devicePixelRatio,2));
    sc=new THREE.Scene(); cam=new THREE.PerspectiveCamera(40,1,.1,100); cam.position.set(7,6,9);
    sc.add(new THREE.AmbientLight(0xffffff,.7)); const d=new THREE.DirectionalLight(0xffffff,.6); d.position.set(3,5,4); sc.add(d);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(5,5,5)),new THREE.LineBasicMaterial({color:0x7fc8ff,transparent:true,opacity:.6})); sc.add(edges);
    const g=new THREE.GridHelper(5,5,0x7fc8ff,0x34506e); g.position.y=-2.5; sc.add(g);
    const arrow=new THREE.Mesh(new THREE.ConeGeometry(.3,.7,3),new THREE.MeshBasicMaterial({color:0xff6a45})); arrow.rotation.x=-Math.PI/2; arrow.position.set(0,-2.5,-3.2); sc.add(arrow);
    boxes=new THREE.Group(); sc.add(boxes);
  }
  function set(g,canvas){
    group=g; if(!g||!canvas){ cv=null; return; }
    if(!r) init();
    canvas.replaceWith(r.domElement); r.domElement.id='cubeCv'; cv=r.domElement;
    if(!ctl){ ctl=new THREE.OrbitControls(cam,r.domElement); ctl.enableZoom=false; ctl.enablePan=false; ctl.autoRotate=true; ctl.autoRotateSpeed=.8; }
    while(boxes.children.length) boxes.remove(boxes.children[0]);
    const fi=flagIndex(g);
    g.members.forEach((m,i)=>{ const s=i===fi?1:.86; /* the flagship's box is a little larger and brighter */
      const b=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),new THREE.MeshStandardMaterial({color:GROUP_COLORS[i],emissive:GROUP_COLORS[i],emissiveIntensity:i===fi?.6:.25,transparent:true,opacity:.9}));
      b.position.set(m.x-2,m.y-2,m.z-2); boxes.add(b);
      const st=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(m.x-2,m.y-2,m.z-2),new THREE.Vector3(m.x-2,-2.5,m.z-2)]),new THREE.LineBasicMaterial({color:GROUP_COLORS[i],transparent:true,opacity:.6})); boxes.add(st); });
  }
  function loop(){ requestAnimationFrame(loop); if(!active||!cv||!r) return;
    const w=cv.parentElement.clientWidth, h=Math.min(w,280); if(cv.width!==Math.round(w*r.getPixelRatio())||cv.height!==Math.round(h*r.getPixelRatio())){ r.setSize(w,h); cam.aspect=w/h; cam.updateProjectionMatrix(); }
    ctl.update(); r.render(sc,cam); }
  requestAnimationFrame(loop);
  return {set, get active(){return active;}, set active(v){active=v;}};
})();

/* ---------- ship data ---------- */
function renderData(){
  document.getElementById('shipTbl').innerHTML=`<thead><tr><th>艦種</th>${STATS.map(s=>`<th>${s.n}</th>`).join('')}<th>速度</th><th>支隊の最大隻数</th><th>搭載</th><th>役割</th></tr></thead><tbody>${
    SHIPS.map(s=>`<tr><th>${s.name}</th>${STATS.map(k=>`<td><span class="pip" style="--v:${s[k.k]*10}%"></span>${s[k.k]}</td>`).join('')}<td>${s.spd}</td><td>${s.max}</td><td>${hangarStr(s.hangar)||'—'}</td><td class="note">${s.note}</td></tr>`).join('')}</tbody>`;
  document.getElementById('bonusTbl').innerHTML=`<thead><tr><th>名前</th><th>条件</th><th>効果</th></tr></thead><tbody>${BONUSES.map(b=>`<tr><th>${b.name}</th><td class="note">${b.cond}</td><td>${b.eff}</td></tr>`).join('')}</tbody>`;
}

/* back to the menu from the battle */
/* Enter decides: 出撃 on the sortie screen, 研究する on the tech tree (user decision 2026-10-04). Called by battle/scene.js while the menu is open */
function onKey(e){
  if(e.key!=='Enter'||e.isComposing||menu.hidden||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target&&e.target.tagName||'')) return;
  const b=screen==='sortie'?document.getElementById('goBattle'):screen==='tech'?document.getElementById('tRes'):null;
  if(b&&!b.disabled){ e.preventDefault(); b.click(); }
}
window.WOS_MENU={ open(){ menu.hidden=false; show('title'); }, onEnd, onKey };
render();
})();
