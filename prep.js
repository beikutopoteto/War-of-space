/* War of Space: preparation screens (main menu, sortie, organization, ship data).
   Data lives in localStorage; the battle is started through window.WOS (defined in index.html). */
(() => {
'use strict';

/* ---------- master data (values are provisional) ---------- */
const STATS = [
  {k:'atk', n:'攻撃'}, {k:'def', n:'防御'}, {k:'eva', n:'回避'},
  {k:'rng', n:'射程'}, {k:'vis', n:'視界'}, {k:'stl', n:'隠蔽性'}
];
const SHIPS = [
  {id:'cv',   name:'コルベット',        atk:2, def:1, eva:9, rng:3, vis:8, stl:9, spd:10, max:12, scale:.55, note:'偵察と哨戒を担う小型艦'},
  {id:'ff',   name:'フリゲート',        atk:3, def:2, eva:7, rng:4, vis:7, stl:7, spd:8,  max:10, scale:.7,  note:'護衛と対小型艦戦'},
  {id:'dd',   name:'駆逐艦',            atk:5, def:3, eva:6, rng:5, vis:6, stl:6, spd:7,  max:8,  scale:.85, note:'雷撃で大型艦を狙う'},
  {id:'cl',   name:'巡洋艦',            atk:6, def:6, eva:4, rng:6, vis:6, stl:4, spd:5,  max:6,  scale:1.2, note:'攻守の均衡した主力艦'},
  {id:'bb',   name:'戦艦',              atk:9, def:9, eva:2, rng:8, vis:5, stl:2, spd:3,  max:4,  scale:1.7, note:'長射程の主砲を持つ決戦艦'},
  {id:'cvb',  name:'戦闘母艦',          atk:4, def:5, eva:3, rng:4, vis:7, stl:3, spd:4,  max:3,  scale:1.6, hangar:{ftr:40}, note:'艦載機（W.A.S.ではない）を発進させ、遠くの敵を叩く'},
  {id:'mas',  name:'突撃揚陸艦',        atk:5, def:4, eva:5, rng:2, vis:5, stl:7, spd:6,  max:6,  scale:.9,  hangar:{was:10}, note:'W.A.S.（Weaponed Armored Shell・武装装甲化外骨格）を運び、近距離で突入させる'},
  {id:'masc', name:'強襲母艦',          atk:4, def:5, eva:2, rng:3, vis:6, stl:3, spd:4,  max:3,  scale:1.6, hangar:{was:30,ftr:10}, note:'W.A.S.が主力。艦載機も少し出せる'},
];
const SHIP = Object.fromEntries(SHIPS.map(s=>[s.id,s]));
const CARRIERS = ['cvb','masc'];
const CRAFT = {ftr:'艦載機', was:'W.A.S.'};
const hangarStr=h=>h?Object.entries(h).map(([k,v])=>`${CRAFT[k]}${Math.round(v)}`).join('・'):'';
const BONUSES = [
  {id:'strike', name:'打撃艦隊', cond:'戦艦・巡洋艦・駆逐艦を含む', eff:'攻撃 +15%', test:t=>t.has('bb')&&t.has('cl')&&t.has('dd'), mod:{atk:1.15}},
  {id:'escort', name:'護衛艦隊', cond:'母艦と、フリゲートかコルベットを含む', eff:'防御 +15%', test:t=>CARRIERS.some(c=>t.has(c))&&(t.has('ff')||t.has('cv')), mod:{def:1.15}},
  {id:'air',    name:'機動部隊', cond:'母艦の戦闘団が2つ以上', eff:'射程 +10%', test:(t,bgs)=>bgs.filter(b=>CARRIERS.includes(b.type)).length>=2, mod:{rng:1.1}},
  {id:'scout',  name:'前衛偵察', cond:'コルベットを含む', eff:'視界 +25%', test:t=>t.has('cv'), mod:{vis:1.25}},
  {id:'stealth',name:'隠密艦隊', cond:'全戦闘団の隠蔽性が6以上', eff:'隠蔽性 +20%', test:(t,bgs)=>bgs.length>0&&bgs.every(b=>SHIP[b.type].stl>=6), mod:{stl:1.2}},
  {id:'assault',name:'強襲揚陸', cond:'突撃揚陸艦と強襲母艦を含む', eff:'攻撃 +10%・回避 +10%', test:t=>t.has('mas')&&t.has('masc'), mod:{atk:1.1,eva:1.1}},
  {id:'uniform',name:'単一艦種', cond:'3つ以上の戦闘団がすべて同じ艦種', eff:'全能力 +5%', test:(t,bgs)=>bgs.length>=3&&t.size===1, mod:{atk:1.05,def:1.05,eva:1.05,rng:1.05,vis:1.05,stl:1.05}},
];
const MAX_BG=5, MAX_ARMY=5, CUBE=5;
const GROUP_COLORS=['#7fc8ff','#8fe8c0','#f0d27a','#c9a7ff','#ff9fc2'];

/* ---------- save data ---------- */
const KEY='wos.save.v1';
function defaults(){
  return {
    seq: 100,
    bgs: [
      {id:'bg1', name:'第1戦艦戦闘団', type:'bb', count:3},
      {id:'bg2', name:'第11巡洋戦闘団', type:'cl', count:6},
      {id:'bg3', name:'第21駆逐戦闘団', type:'dd', count:8},
      {id:'bg4', name:'第31護衛戦闘団', type:'ff', count:10},
      {id:'bg5', name:'第1航空戦闘団', type:'cvb', count:2},
      {id:'bg6', name:'第41偵察戦闘団', type:'cv', count:12},
      {id:'bg7', name:'第1突撃揚陸戦闘団', type:'mas', count:6},
      {id:'bg8', name:'第2強襲母艦戦闘団', type:'masc', count:2},
      {id:'bg9', name:'第22駆逐戦闘団', type:'dd', count:8},
    ],
    armies: [
      {id:'a1', name:'第1軍', bgs:['bg1','bg2','bg3']},
      {id:'a2', name:'第2軍', bgs:['bg5','bg4','bg6']},
      {id:'a3', name:'第3軍', bgs:['bg7','bg8','bg9']},
    ],
    groups: [
      {id:'g1', name:'第1軍集団', sync:true, members:[
        {army:'a1', x:2, y:2, z:1}, {army:'a2', x:1, y:3, z:3}, {army:'a3', x:3, y:1, z:2}]},
    ],
  };
}
let save;
function load(){ try{ const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s&&s.bgs&&s.armies&&s.groups){ migrate(s); return s; } }catch(e){} return defaults(); }
/* M.A.S. was renamed: W.A.S., 突撃揚陸艦 and 強襲母艦 */
function migrate(s){ s.bgs.forEach(b=>{ b.name=String(b.name).replace(/M\.A\.S\.母艦/g,'強襲母艦').replace(/M\.A\.S\./g,'W.A.S.'); }); }
function persist(){ try{ localStorage.setItem(KEY,JSON.stringify(save)); }catch(e){} }
save=load();
const newId=p=>p+(++save.seq);
const bgById=id=>save.bgs.find(b=>b.id===id);
const armyById=id=>save.armies.find(a=>a.id===id);
const armyOfBg=id=>save.armies.find(a=>a.bgs.includes(id));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- army math ---------- */
function armyStats(a){
  const bgs=a.bgs.map(bgById).filter(Boolean);
  const types=new Set(bgs.map(b=>b.type));
  const ships=bgs.reduce((s,b)=>s+b.count,0);
  const st={atk:0,def:0,eva:0,rng:0,vis:0,stl:10,spd:bgs.length?99:0};
  bgs.forEach(b=>{ const s=SHIP[b.type], w=b.count/ships;
    st.atk+=s.atk*w; st.def+=s.def*w; st.eva+=s.eva*w; st.rng+=s.rng*w;
    st.vis=Math.max(st.vis,s.vis); st.stl=Math.min(st.stl,s.stl); st.spd=Math.min(st.spd,s.spd); });
  if(!bgs.length) st.stl=0;
  const hangar={}; bgs.forEach(b=>Object.entries(SHIP[b.type].hangar||{}).forEach(([k,v])=>hangar[k]=(hangar[k]||0)+v*b.count));
  const active=BONUSES.filter(b=>b.test(types,bgs));
  active.forEach(b=>Object.entries(b.mod).forEach(([k,m])=>st[k]*=m));
  return {st,ships,bgs,active,hangar};
}
/* convert an army into the battle fleet spec used by index.html */
function armyToFleet(a){
  const {st,ships,bgs,hangar}=armyStats(a);
  const big=bgs.reduce((m,b)=>Math.max(m,SHIP[b.type].scale),.6);
  const by={}; bgs.forEach(b=>by[b.type]=(by[b.type]||0)+b.count);
  const sub=Object.entries(by).sort((x,y)=>SHIP[y[0]].scale-SHIP[x[0]].scale).slice(0,3).map(([t,c])=>SHIP[t].name+c).join('・');
  return {name:a.name, sub, n:Math.max(1,ships), hp:6+st.def*5, dmg:.4+st.atk*.45, eva:Math.min(.4,st.eva*.04),
    range:10+st.rng*1.6, speed:2+st.spd, vis:st.vis, stl:st.stl, hangar, scale:Math.min(1.5,.4+big*.6), stats:st};
}

/* ---------- screens ---------- */
const menu=document.getElementById('menu');
let screen='title', tab='army', selBg=null, selArmy=null, selGroup=null, layer=2, placing=null, sortieGroup=null, confirmDel=null;

function show(s){ screen=s; confirmDel=null; render(); menu.scrollTop=0; }
function render(){
  menu.querySelectorAll('.scr').forEach(el=>el.hidden=el.dataset.s!==screen);
  if(screen==='sortie') renderSortie();
  if(screen==='org') renderOrg();
  if(screen==='data') renderData();
  preview.active=(screen==='org'&&tab==='group');
}

menu.innerHTML=`
<section class="scr" data-s="title">
  <div class="ttl">
    <p class="eyebrow">宙域艦隊戦　試作版</p>
    <h1>WAR OF SPACE</h1>
    <p class="lead">地球連合の司令官として艦隊を編成し、惑星共和国の要塞宙域へ出撃する。</p>
  </div>
  <nav class="mainnav" aria-label="メインメニュー">
    <button data-go="sortie"><b>出撃</b><span>作戦と軍集団を選んで戦闘を始める</span></button>
    <button data-go="org"><b>編成</b><span>戦闘団・軍・軍集団を組む</span></button>
    <button data-go="data"><b>艦艇データ</b><span>8艦種の能力と編成ボーナス</span></button>
    <button data-act="quick"><b>クイック戦闘</b><span>用意された艦隊ですぐに戦う</span></button>
  </nav>
</section>
<section class="scr" data-s="sortie" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2>出撃</h2></header>
  <div class="sortie">
    <div class="pane">
      <h3>作戦</h3>
      <div class="op sel"><b>要塞カリュブディス攻略戦</b><span>二つの小惑星を接合した敵要塞。防空4隊と近衛艦隊が守り、開戦30分後に北から増援が来る。</span><em>敵戦力：艦隊5・要塞1／難易度：標準</em></div>
    </div>
    <div class="pane">
      <h3>出撃する軍集団</h3>
      <div id="sgList" class="cards"></div>
    </div>
  </div>
  <footer class="act"><button id="goBattle" class="primary">出撃する</button></footer>
</section>
<section class="scr" data-s="org" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2>編成</h2>
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="group">軍集団</button><button role="tab" data-tab="army">軍</button><button role="tab" data-tab="bg">戦闘団</button>
    </div>
  </header>
  <p class="tabnote" id="tabNote"></p>
  <div class="org">
    <aside class="list" id="orgList"></aside>
    <div class="detail" id="orgDetail"></div>
  </div>
</section>
<section class="scr" data-s="data" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2>艦艇データ</h2></header>
  <p class="tabnote">数値はすべて仮の値です（1〜10）。速度は軍の移動速度を決め、軍は最も遅い艦に合わせて動きます。視界は敵を見つけられる距離、隠蔽性は敵からの見つかりにくさで、軍の視界は最も高い艦、隠蔽性は最も低い艦で決まります。母艦は敵が近づくと艦載機やW.A.S.（Weaponed Armored Shell・武装装甲化外骨格）を自動で発進させます。艦載機は遠くまで届き、W.A.S.は近距離で打たれ強く火力が高い小型ユニットです。</p>
  <div class="tblwrap"><table class="ships" id="shipTbl"></table></div>
  <h3 class="sub">編成ボーナス（軍単位・仮）</h3>
  <div class="tblwrap"><table class="ships" id="bonusTbl"></table></div>
</section>`;

menu.addEventListener('click',e=>{
  const go=e.target.closest('[data-go]'); if(go){ show(go.dataset.go); return; }
  const act=e.target.closest('[data-act]'); if(act&&act.dataset.act==='quick'){ startBattle(null); return; }
  const t=e.target.closest('[data-tab]'); if(t){ tab=t.dataset.tab; confirmDel=null; render(); }
});

/* ---------- sortie ---------- */
function groupSummary(g){ return g.members.map(m=>armyById(m.army)).filter(Boolean); }
function renderSortie(){
  if(!save.groups.find(g=>g.id===sortieGroup)) sortieGroup=save.groups[0]?.id||null;
  const el=document.getElementById('sgList');
  el.innerHTML=save.groups.length?save.groups.map(g=>{ const arms=groupSummary(g); const ships=arms.reduce((s,a)=>s+armyStats(a).ships,0);
    return `<button class="sgcard ${g.id===sortieGroup?'sel':''}" data-sg="${g.id}" aria-pressed="${g.id===sortieGroup}"><b>${esc(g.name)}</b><span>${arms.map(a=>esc(a.name)).join('・')||'軍が未配置'}</span><em>${arms.length}個軍・${ships}隻・速度同期${g.sync?'あり':'なし'}</em></button>`;}).join('')
    :'<p class="empty">軍集団がありません。編成画面で作成してください。</p>';
  el.querySelectorAll('[data-sg]').forEach(b=>b.onclick=()=>{ sortieGroup=b.dataset.sg; renderSortie(); });
  const g=save.groups.find(x=>x.id===sortieGroup);
  const btn=document.getElementById('goBattle'); btn.disabled=!g||!groupSummary(g).some(a=>armyStats(a).ships>0);
  btn.onclick=()=>startBattle(g);
}
function startBattle(g){
  if(!window.WOS) return;
  if(!g){ window.WOS.start(null); return; }
  const fleets=[], members=[];
  g.members.forEach(m=>{ const a=armyById(m.army); if(!a||!armyStats(a).ships) return;
    const f=armyToFleet(a); f.pos=[(m.x-2)*16,112+(m.z-2)*16]; f.alt=(m.y-2)*10; members.push(fleets.length); fleets.push(f); });
  window.WOS.start({fleets, group:{name:g.name, sync:g.sync, members}});
}

/* ---------- organization ---------- */
const NOTES={
  group:'軍集団は最大5個の軍をまとめ、5×5×5の立方体に配置して保存します。戦闘中は軍集団単位で動かせ、軍の出し入れもできます。',
  army:'軍は最大5個の戦闘団で編成します。組み合わせで編成ボーナスが付きます。戦闘で操作する単位です。',
  bg:'戦闘団は同じ艦種の艦をまとめた単位です。戦闘中は編成を変えられません。'
};
function renderOrg(){
  menu.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
  document.getElementById('tabNote').textContent=NOTES[tab];
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
function renderBgTab(){
  if(!bgById(selBg)) selBg=save.bgs[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  list.innerHTML=listHtml(save.bgs.map(b=>({id:b.id,name:b.name,meta:`${SHIP[b.type].name}×${b.count}・${armyOfBg(b.id)?esc(armyOfBg(b.id).name):'未所属'}`})),selBg,'＋ 戦闘団を作る','data-bg');
  list.querySelector('[data-new]').onclick=()=>{ const b={id:newId('bg'),name:`新戦闘団${save.bgs.length+1}`,type:'dd',count:4}; save.bgs.push(b); selBg=b.id; persist(); renderOrg(); };
  list.querySelectorAll('[data-bg]').forEach(x=>x.onclick=()=>{ selBg=x.dataset.bg; confirmDel=null; renderOrg(); });
  const b=bgById(selBg);
  if(!b){ det.innerHTML='<p class="empty">戦闘団がありません。左の「戦闘団を作る」から追加してください。</p>'; return; }
  const s=SHIP[b.type], a=armyOfBg(b.id);
  det.innerHTML=`
    <label class="fld">名前<input id="bgName" maxlength="20" value="${esc(b.name)}"></label>
    <div class="fld">艦種<div class="types">${SHIPS.map(t=>`<button data-type="${t.id}" aria-pressed="${t.id===b.type}">${t.name}</button>`).join('')}</div></div>
    <label class="fld"><span>隻数 <b id="bgCountV">${b.count}</b> / 最大${s.max}</span><input id="bgCount" type="range" min="1" max="${s.max}" value="${Math.min(b.count,s.max)}"></label>
    <p class="note">${esc(s.note)}。${s.hangar?`搭載（1隻あたり）：${hangarStr(s.hangar)}。`:''}所属：${a?esc(a.name):'未所属（軍の画面で編入できます）'}</p>
    <h4>1隻あたりの能力（仮）</h4>${bars(s)}
    <div class="row">${delBtn('bg:'+b.id,'この戦闘団を解散する')}</div>`;
  det.querySelector('#bgName').oninput=e=>{ b.name=e.target.value||'無名の戦闘団'; persist(); list.querySelector(`[data-bg="${b.id}"] b`).textContent=b.name; };
  det.querySelectorAll('[data-type]').forEach(x=>x.onclick=()=>{ b.type=x.dataset.type; b.count=Math.min(b.count,SHIP[b.type].max); persist(); renderOrg(); });
  det.querySelector('#bgCount').oninput=e=>{ b.count=+e.target.value; det.querySelector('#bgCountV').textContent=b.count; persist(); list.querySelector(`[data-bg="${b.id}"] span`).textContent=`${SHIP[b.type].name}×${b.count}・${a?a.name:'未所属'}`; };
  wireDel(det,'bg:'+b.id,()=>{ save.armies.forEach(x=>x.bgs=x.bgs.filter(id=>id!==b.id)); save.bgs=save.bgs.filter(x=>x!==b); selBg=null; });
}

/* armies */
function renderArmyTab(){
  if(!armyById(selArmy)) selArmy=save.armies[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  list.innerHTML=listHtml(save.armies.map(a=>{ const s=armyStats(a); return {id:a.id,name:a.name,meta:`戦闘団${a.bgs.length}・${s.ships}隻・ボーナス${s.active.length}`}; }),selArmy,'＋ 軍を作る','data-army');
  list.querySelector('[data-new]').onclick=()=>{ const a={id:newId('a'),name:`第${save.armies.length+1}軍`,bgs:[]}; save.armies.push(a); selArmy=a.id; persist(); renderOrg(); };
  list.querySelectorAll('[data-army]').forEach(x=>x.onclick=()=>{ selArmy=x.dataset.army; confirmDel=null; renderOrg(); });
  const a=armyById(selArmy);
  if(!a){ det.innerHTML='<p class="empty">軍がありません。左の「軍を作る」から追加してください。</p>'; return; }
  const {st,ships,active,hangar}=armyStats(a);
  const free=save.bgs.filter(b=>!armyOfBg(b.id));
  const slots=[...Array(MAX_BG)].map((_,i)=>{ const b=bgById(a.bgs[i]);
    if(b) return `<div class="slot full"><span class="no">${i+1}</span><b>${esc(b.name)}</b><span>${SHIP[b.type].name}×${b.count}</span><button class="x" data-rm="${b.id}" aria-label="${esc(b.name)}を外す">外す</button></div>`;
    if(i===a.bgs.length) return `<div class="slot"><span class="no">${i+1}</span>${free.length?`<select id="addBg" aria-label="編入する戦闘団"><option value="">＋ 未所属の戦闘団を編入…</option>${free.map(f=>`<option value="${f.id}">${esc(f.name)}（${SHIP[f.type].name}×${f.count}）</option>`).join('')}</select>`:'<span class="dim">未所属の戦闘団がありません（戦闘団の画面で作成）</span>'}</div>`;
    return `<div class="slot vacant"><span class="no">${i+1}</span><span class="dim">空き</span></div>`; }).join('');
  det.innerHTML=`
    <label class="fld">名前<input id="armyName" maxlength="20" value="${esc(a.name)}"></label>
    <h4>戦闘団（${a.bgs.length}/${MAX_BG}）</h4><div class="slots">${slots}</div>
    <h4>軍の能力　<span class="dim">総数${ships}隻${Object.keys(hangar).length?`・搭載 ${hangarStr(hangar)}`:''}・速度は最も遅い艦に合わせます</span></h4>${bars(st)}
    <h4>編成ボーナス</h4>
    <ul class="bonus">${BONUSES.map(bn=>`<li class="${active.includes(bn)?'on':''}"><b>${bn.name}</b><span>${bn.cond}</span><em>${bn.eff}</em></li>`).join('')}</ul>
    <div class="row">${delBtn('army:'+a.id,'この軍を解散する')}</div>`;
  det.querySelector('#armyName').oninput=e=>{ a.name=e.target.value||'無名の軍'; persist(); list.querySelector(`[data-army="${a.id}"] b`).textContent=a.name; };
  const add=det.querySelector('#addBg'); if(add) add.onchange=()=>{ if(add.value){ a.bgs.push(add.value); persist(); renderOrg(); } };
  det.querySelectorAll('[data-rm]').forEach(x=>x.onclick=()=>{ a.bgs=a.bgs.filter(id=>id!==x.dataset.rm); persist(); renderOrg(); });
  wireDel(det,'army:'+a.id,()=>{ save.groups.forEach(g=>g.members=g.members.filter(m=>m.army!==a.id)); save.armies=save.armies.filter(x=>x!==a); selArmy=null; });
}

/* army groups */
function renderGroupTab(){
  if(!save.groups.find(g=>g.id===selGroup)) selGroup=save.groups[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  list.innerHTML=listHtml(save.groups.map(g=>({id:g.id,name:g.name,meta:`軍${g.members.length}/${MAX_ARMY}・速度同期${g.sync?'あり':'なし'}`})),selGroup,'＋ 軍集団を作る','data-grp');
  list.querySelector('[data-new]').onclick=()=>{ const g={id:newId('g'),name:`第${save.groups.length+1}軍集団`,sync:true,members:[]}; save.groups.push(g); selGroup=g.id; persist(); renderOrg(); };
  list.querySelectorAll('[data-grp]').forEach(x=>x.onclick=()=>{ selGroup=x.dataset.grp; placing=null; confirmDel=null; renderOrg(); });
  const g=save.groups.find(x=>x.id===selGroup);
  if(!g){ det.innerHTML='<p class="empty">軍集団がありません。左の「軍集団を作る」から追加してください。</p>'; preview.set(null); return; }
  if(placing!=null&&!g.members[placing]) placing=null;
  const avail=save.armies.filter(a=>!g.members.some(m=>m.army===a.id));
  const chips=g.members.map((m,i)=>{ const a=armyById(m.army); const s=a?armyStats(a):null;
    return `<div class="chip ${placing===i?'sel':''}" style="--c:${GROUP_COLORS[i]}"><button class="pick" data-pick="${i}" aria-pressed="${placing===i}"><i></i><b>${a?esc(a.name):'?'}</b><span>${s?`${s.ships}隻・速度${s.st.spd.toFixed(0)}`:''}　位置 ${'ABCDE'[m.x]}${m.z+1}・高さ${m.y+1}</span></button><button class="x" data-out="${i}" aria-label="外す">外す</button></div>`; }).join('');
  const cells=[];
  for(let z=0;z<CUBE;z++) for(let x=0;x<CUBE;x++){
    const here=g.members.findIndex(m=>m.x===x&&m.z===z&&m.y===layer);
    const other=g.members.findIndex(m=>m.x===x&&m.z===z&&m.y!==layer);
    cells.push(`<button class="cell" data-cx="${x}" data-cz="${z}" style="${here>=0?`--c:${GROUP_COLORS[here]}`:other>=0?`--o:${GROUP_COLORS[other]}`:''}" ${here>=0?'data-on':''} ${other>=0&&here<0?'data-other':''} aria-label="${'ABCDE'[x]}${z+1}">${here>=0?esc((armyById(g.members[here].army)||{}).name||''):''}</button>`);
  }
  const slowest=g.members.map(m=>armyById(m.army)).filter(Boolean).map(a=>armyStats(a).st.spd).filter(v=>v>0);
  det.innerHTML=`
    <label class="fld">名前<input id="grpName" maxlength="20" value="${esc(g.name)}"></label>
    <label class="toggle"><input type="checkbox" id="grpSync" ${g.sync?'checked':''}> 移動時は最も遅い艦に速度を合わせる <span class="dim">${slowest.length?`（この軍集団では速度${Math.min(...slowest).toFixed(0)}）`:''}</span></label>
    <h4>所属する軍（${g.members.length}/${MAX_ARMY}）　<span class="dim">軍を選んでから、下の格子で置き場所を押します</span></h4>
    <div class="chips">${chips}${g.members.length<MAX_ARMY?(avail.length?`<select id="addArmy" aria-label="追加する軍"><option value="">＋ 軍を追加…</option>${avail.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>`:'<span class="dim">追加できる軍がありません</span>'):''}</div>
    <div class="cubeed">
      <div class="layer">
        <div class="lyr" role="group" aria-label="高さの段">${[4,3,2,1,0].map(y=>`<button data-ly="${y}" aria-pressed="${y===layer}">${y+1}${y===4?' 上':y===0?' 下':''}</button>`).join('')}</div>
        <div class="gridwrap"><p class="front">▲ 前方（敵側）</p><div class="grid">${cells.join('')}</div><p class="dim small">点線の枠は別の高さにいる軍です</p></div>
      </div>
      <div class="pv"><canvas id="cubeCv" aria-label="配置の立体表示（ドラッグで回転）"></canvas><p class="dim small">ドラッグで回転</p></div>
    </div>
    <div class="row">${delBtn('grp:'+g.id,'この軍集団を削除する')}</div>`;
  det.querySelector('#grpName').oninput=e=>{ g.name=e.target.value||'無名の軍集団'; persist(); list.querySelector(`[data-grp="${g.id}"] b`).textContent=g.name; };
  det.querySelector('#grpSync').onchange=e=>{ g.sync=e.target.checked; persist(); renderOrg(); };
  const add=det.querySelector('#addArmy'); if(add) add.onchange=()=>{ if(!add.value) return; const spot=freeCell(g); g.members.push({army:add.value,...spot}); placing=g.members.length-1; layer=spot.y; persist(); renderOrg(); };
  det.querySelectorAll('[data-pick]').forEach(x=>x.onclick=()=>{ const i=+x.dataset.pick; placing=placing===i?null:i; if(placing!=null) layer=g.members[i].y; renderOrg(); });
  det.querySelectorAll('[data-out]').forEach(x=>x.onclick=()=>{ g.members.splice(+x.dataset.out,1); placing=null; persist(); renderOrg(); });
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
    g.members.forEach((m,i)=>{ const b=new THREE.Mesh(new THREE.BoxGeometry(.86,.86,.86),new THREE.MeshStandardMaterial({color:GROUP_COLORS[i],emissive:GROUP_COLORS[i],emissiveIntensity:.25,transparent:true,opacity:.9}));
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
  document.getElementById('shipTbl').innerHTML=`<thead><tr><th>艦種</th>${STATS.map(s=>`<th>${s.n}</th>`).join('')}<th>速度</th><th>戦闘団の最大隻数</th><th>搭載</th><th>役割</th></tr></thead><tbody>${
    SHIPS.map(s=>`<tr><th>${s.name}</th>${STATS.map(k=>`<td><span class="pip" style="--v:${s[k.k]*10}%"></span>${s[k.k]}</td>`).join('')}<td>${s.spd}</td><td>${s.max}</td><td>${hangarStr(s.hangar)||'—'}</td><td class="note">${s.note}</td></tr>`).join('')}</tbody>`;
  document.getElementById('bonusTbl').innerHTML=`<thead><tr><th>名前</th><th>条件</th><th>効果</th></tr></thead><tbody>${BONUSES.map(b=>`<tr><th>${b.name}</th><td class="note">${b.cond}</td><td>${b.eff}</td></tr>`).join('')}</tbody>`;
}

/* back to the menu from the battle */
window.WOS_MENU={ open(){ menu.hidden=false; show('title'); } };
render();
})();
