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
const CAMP=OPS.filter(o=>o.chapter&&!o.hidden);   // hidden: still being made; not in the menus, opened only by WOS.start({op})
/* the tutorial (docs/tutorial.md): 要塞カリュブディス攻略戦 with the guide. It heads the campaign until it is cleared, then sits with
   the exercises; nothing else opens before it (user decision 2026-11-05). Only the menu knows it: the battle starts charybdis with tutorial:true */
const TUT={...OPS.find(o=>o.id==='charybdis'), id:'tutorial', tag:'チュートリアル', name:'士官学校の卒業演習', card:'チュートリアル', reward:0, quick:null,   // card: its name in the list
  summary:'艦隊指揮の卒業演習。リコ軍曹の案内に従って操作を11段で覚え、最後に演習用の要塞カリュブディスを落とす。'};
const TUT2_BASE=OPS.find(o=>o.id==='baikonur');
const TUT2={...TUT2_BASE,...TUT2_BASE.groundTutorial,id:'tutorial2'};
const SHIP=Object.fromEntries(SHIPS.map(s=>[s.id,s]));
const hangarStr=h=>h?Object.entries(h).map(([k,v])=>`${D.crafts[k].name}${Math.round(v)}`).join('・'):'';
/* a bonus applies when every condition in its `when` holds (format: data/bonuses.js) */
function bonusOn(bn,types,bgs){ const c=bn.when||{};
  if(c.need&&!c.need.every(any=>any.some(t=>types.has(t)))) return false;
  if(c.count&&bgs.filter(b=>c.count.types.includes(b.type)).length<c.count.min) return false;
  if(c.minStat&&!(bgs.length&&bgs.every(b=>SHIP[b.type][c.minStat.stat]>=c.minStat.min))) return false;
  if(c.minBgs&&bgs.length<c.minBgs) return false;
  if(c.sameType&&types.size!==1) return false;
  if(c.minTypes&&types.size<c.minTypes) return false;
  if(c.maxBgs&&!(bgs.length&&bgs.length<=c.maxBgs)) return false;
  return true; }
/* the rates a bonus puts on an army: modBy picks them by the army's ship class */
const modOf=(bn,types)=>bn.modBy?bn.modBy[[...types][0]]||{}:bn.mod;
const MAX_BG=5, MAX_ARMY=5, CUBE=5;
const GROUP_COLORS=['#7fc8ff','#8fe8c0','#f0d27a','#c9a7ff','#ff9fc2'];

/* ---------- save data ---------- */
const KEY='wos.save.v1';
const GROUND=window.WOS_GROUND_ORG;
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
      {id:'a2', name:'第12 沿岸哨戒 支隊', bgs:['bg2'], auto:'bg:bg2'},
      {id:'a3', name:'第18 護送護衛 支隊', bgs:['bg3'], auto:'bg:bg3'},
      {id:'a4', name:'第24 駆逐突撃 支隊', bgs:['bg4'], auto:'bg:bg4'},
      {id:'a5', name:'第19 護送護衛 支隊', bgs:['bg5'], auto:'bg:bg5'},
      {id:'a1', name:'第9 前衛巡洋 支隊', bgs:['bg1'], auto:'bg:bg1'},
    ],
    groups: [
      {id:'g1', name:'第2 ネオ信濃駐屯 戦区軍', sync:true, members:[
        {army:'a2', x:1, y:3, z:2}, {army:'a3', x:3, y:1, z:2}, {army:'a4', x:2, y:2, z:1}, {army:'a5', x:2, y:3, z:3}]},
    ],
    groundOrg: GROUND.defaults(),
    prog: newProg(),
    sortieMenu: {closed:{},seen:[]},
  };
}
/* campaign progress: cleared operations, funds, research per branch ([node ids], data/tech.js techTree), story flags */
function newProg(){ return {cleared:[], funds:0, tech:{}, flags:{}, tutorialCleared:false, prepStep:0, prepDone:false}; }
let save;
function load(){ try{ const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s&&s.bgs&&s.armies&&s.groups){ migrate(s); return s; } }catch(e){} return defaults(); }
const OLD_BGS=JSON.stringify([['bg1','第1戦闘団','bb',3],['bg2','第2戦闘団','cl',6],['bg3','第3戦闘団','dd',8],['bg4','第4戦闘団','ff',10],['bg5','第5戦闘団','cvb',2],
  ['bg6','第6戦闘団','cv',12],['bg7','第7戦闘団','mas',6],['bg8','第8戦闘団','masc',2],['bg9','第9戦闘団','dd',8]]);
const OLD_NAMES={'第41巡洋戦隊':'第9 前衛巡洋 支隊','第11哨戒戦隊':'第12 沿岸哨戒 支隊','第21護衛戦隊':'第18 護送護衛 支隊',
  '第31駆逐戦隊':'第24 駆逐突撃 支隊','第22護衛戦隊':'第19 護送護衛 支隊','ネオ信濃駐屯隊':'第2 ネオ信濃駐屯 戦区軍'};
/* M.A.S. was renamed: W.A.S., 突撃揚陸艦 and 強襲母艦 */
function migrate(s){ s.groundOrg=GROUND.normalize(s.groundOrg); s.bgs.forEach(b=>{ b.name=String(b.name).replace(/M\.A\.S\.母艦/g,'強襲母艦').replace(/M\.A\.S\./g,'W.A.S.'); });
  s.sortieMenu={closed:s.sortieMenu?.closed||{},seen:Array.isArray(s.sortieMenu?.seen)?s.sortieMenu.seen:[]};
  s.sortieMenu.seen=[...new Set(s.sortieMenu.seen.map(id=>id==='ch2drill'?'tutorial2':id))];
  /* the first starting fleet (battleships, carriers, W.A.S.) is replaced by the new one while the player has not changed it */
  if(JSON.stringify(s.bgs.map(b=>[b.id,b.name,b.type,b.count]))===OLD_BGS&&s.armies.length===3&&s.groups.length===1){
    const d=defaults(); s.bgs=d.bgs; s.armies=d.armies; s.groups=d.groups; }
  /* the starting fleet's names before the naming rule of 2026-10-04 */
  const rn=x=>{ if(OLD_NAMES[x.name]) x.name=OLD_NAMES[x.name]; }; s.bgs.forEach(rn); s.armies.forEach(rn); s.groups.forEach(rn);
  /* an army of one battle group named after it follows the battle group's name (user decision 2026-10-04) */
  s.armies.forEach(a=>{ const b=a.bgs.length===1&&s.bgs.find(x=>x.id===a.bgs[0]); if(a.auto===undefined&&b&&b.name===a.name) a.auto='bg:'+b.id; });
  s.bgs.forEach(b=>{ if(b.auto&&/戦隊$/.test(b.name)) b.name=unitName('bg',b.type,new Set(s.bgs.filter(y=>y!==b).map(y=>unitNo(y.name)))); });
  /* a battle group lives only in its army (user decision 2026-11-06): ones left over from disbanded armies are removed */
  s.bgs=s.bgs.filter(b=>s.armies.some(a=>a.bgs.includes(b.id)));
  /* saves from before the campaign progress start at the beginning */
  const tutKnown=!!(s.prog&&'tutorialCleared' in s.prog);
  const prepKnown=!!(s.prog&&'prepDone' in s.prog);
  s.prog=Object.assign(newProg(),s.prog||{});
  // 旧 ch2drill は案内付き演習。通常演習の初回報酬・クリアは引き継がない。
  s.prog.cleared=[...new Set(s.prog.cleared.map(id=>id==='ch2drill'?'tutorial2':id))];
  if(!prepKnown&&s.prog.cleared.includes('retreat')) s.prog.prepDone=true;
  /* saves from before the tutorial (2026-11-05) that have cleared an operation do not have to go back to it */
  if(!tutKnown&&s.prog.cleared.length) s.prog.tutorialCleared=true;
  /* saves that cleared an operation before its grant existed get the grant now */
  OPS.forEach(o=>{ const k='aid:'+o.id; if(o.aid&&(o.aid.by!=='prep'||s.prog.prepDone)&&s.prog.cleared.includes(o.id)&&!s.prog.flags[k]){ s.prog.flags[k]=true; s.prog.funds+=o.aid.funds; } });
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
let dbg={free:false, battle:false, auto:false};
try{ Object.assign(dbg,JSON.parse(localStorage.getItem(DKEY)||'{}')); }catch(e){}
function persistDbg(){ try{ localStorage.setItem(DKEY,JSON.stringify(dbg)); }catch(e){} document.body.classList.toggle('dbg-battle',!!dbg.battle); document.body.classList.toggle('dbg-auto',!!dbg.auto); }
document.body.classList.toggle('dbg-battle',!!dbg.battle); document.body.classList.toggle('dbg-auto',!!dbg.auto);

/* ---------- options (the settings screen; kept apart from the save like the debug switches) ----------
   story: the conversations before and after an operation (off by default, user decision 2026-10-08). battle/hud.js reads window.WOS_OPT */
const OKEY='wos.opt';
const opt=window.WOS_OPT={story:false,markSet:'A',unitFmt:'both',grid:'sq'};
try{ Object.assign(opt,JSON.parse(localStorage.getItem(OKEY)||'{}')); }catch(e){}
function persistOpt(){ try{ localStorage.setItem(OKEY,JSON.stringify(opt)); }catch(e){} }

/* ---------- progress ---------- */
const cleared=id=>prog().cleared.includes(id);
const tutDone=()=>!!prog().tutorialCleared;
const opDone=o=>o===TUT?tutDone():cleared(o.id);
/* a menu screen opens when its operation is cleared (data/tech.js unlocks) */
const unlocked=key=>cleared(D.unlocks[key]);
/* the exercise with the player's own army groups opens once something has been researched (user decision 2026-10-13) */
const researched=()=>Object.values(prog().tech).some(t=>t&&t.length);
const ownExercise=()=>unlocked('fleet')&&researched();
/* Both ground exercises require the end of chapter one, including older saves that already cleared the guide. */
/* デバッグの「チュートリアルスキップ」「全作戦クリア」は、チュートリアル2とバイコヌール演習も開ける（ユーザー決定 2026-11-11） */
const groundOpen=()=>!!prog().flags?.groundOpen;
const opRequirement=o=>(o===TUT2||o===TUT2_BASE)&&groundOpen()?null:(o===TUT2||o===TUT2_BASE)&&!cleared(TUT2.requires)?TUT2.requires:o.requires;
function opOpen(o){ if(dbg.free||o===TUT) return true;
  if(!tutDone()) return false;   // nothing opens before the tutorial
  const need=opRequirement(o); if(need) return cleared(need);
  const i=CAMP.indexOf(o); if(i<0) return !!o.quick||ownExercise();   // 演習: クイック出撃 (o.quick) from the start, own army groups once 艦隊編集 opens and a research is done
  return i===0||cleared(CAMP[i-1].id); }
/* a thin line lock in the text colour (no emoji) */
const LOCK='<svg class="lock" viewBox="0 0 12 14" aria-hidden="true"><rect x="1.5" y="6" width="9" height="7" rx="1"/><path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2"/></svg>';
const opLabel=o=>`${o.chapter||o.tag?(o.chapter||o.tag)+'「':'「'}${o.name}」`;
const unlockText=key=>{ const o=OPS.find(x=>x.id===D.unlocks[key]); return o?`${opLabel(o)}をクリアで解放`:'未解放'; };
/* the tech tree (data/tech.js techTree): every branch has the same nodes; a node opens when all its req are researched */
const techOf=b=>prog().tech[b.id]||(prog().tech[b.id]=[]);
const nodeById=id=>TREE.find(n=>n.id===id);
const nodeDone=(b,n)=>techOf(b).includes(n.id);
const nodeOpen=(b,n)=>branchOpen(b)&&!nodeDone(b,n)&&n.req.every(r=>techOf(b).includes(r));
const nodeCost=(b,n)=>n.cap?b.steps[n.cap].cost:Math.round(n.cost*(b.costMul||1)/10)*10;   // in steps of 10 (2026-11-06)
const nodeName=(b,n)=>n.name.replace('{gun}',b.gun||'主砲');
const techLv=b=>Math.min(b.steps.length-1,TREE.reduce((m,n)=>n.cap&&nodeDone(b,n)?Math.max(m,n.cap):m,0));
const branchOpen=b=>!b.need||!!prog().flags[b.need];
const branchCap=b=>branchOpen(b)?b.steps[techLv(b)].cap:0;
const wasBranch=()=>BRANCHES.find(b=>b.id==='was');
const mascCap=()=>{ const b=wasBranch(); return branchOpen(b)&&nodeDone(b,nodeById('mascDeploy'))?techLv(b):0; };
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
const typeOpen=t=>dbg.free||(t==='masc'?mascCap()>0:!branchOfType(t)||branchOpen(branchOfType(t)));
/* Separate sortie limits; masc still uses the W.A.S. branch for its research and craft. */
function loadRows(n,showOpen){
  const rows=BRANCHES.map(b=>({b,used:b.types.filter(t=>t!=='masc').reduce((s,t)=>s+(n[t]||0),0),cap:branchCap(b)}))
    .filter(r=>r.used||showOpen&&branchOpen(r.b));
  const b=wasBranch(); if(branchOpen(b)||save.bgs.some(x=>x.type==='masc'&&x.count>0)) rows.push({b,name:'強襲母艦',used:n.masc||0,cap:mascCap()});
  return rows;
}
function shipNow(t){ const s={...SHIP[t]}, b=branchOfType(t); RATED.forEach(k=>s[k]=SHIP[t][k]*statRate(b,k)); return s; }
/* ships per branch in the army groups going out together, against the limits */
function groupLoad(gs){
  const n={}; gs.forEach(g=>g.members.map(m=>armyById(m.army)).filter(Boolean).forEach(a=>a.bgs.map(bgById).filter(Boolean).forEach(b=>n[b.type]=(n[b.type]||0)+b.count)));
  return loadRows(n,false);
}
/* the share of the reward a replay brings: the exercises keep more of it (user decision 2026-11-06) */
const replayRate=o=>o.chapter?D.reward.replay:D.reward.exercise;
/* a one-time grant on the first clear of an operation (o.aid), remembered in the story flags */
function grantAid(o){ const k='aid:'+o.id; if(!o.aid||prog().flags[k]) return 0; prog().flags[k]=true; prog().funds+=o.aid.funds; return o.aid.funds; }
/* story flags the battle's conversations may use (a line's third element, battle/hud.js talkFor) */
function storyFlags(){ return {kawasemi:!!prog().flags['rescued:retreat']}; }
/* the battle the menu started: the result is recorded when it ends (クイック出撃 is not counted) */
let running=null;
function onEnd(opId,win,res={}){
  /* the tutorial counts as cleared on any win: at whatever step, and after とばす too (2026-11-06: a win before the last step did not open 第1節) */
  if(running&&running.tutorial){ if(!win) return ''; const first=!tutDone(); prog().tutorialCleared=true; sortieOp=CAMP[0].id; persist(); return first?`　${opLabel(CAMP[0])}が出撃できるようになった。`:''; }
  if(!running||running.quick||running.op!==opId||!win) return '';
  const progressId=running.progress||opId;
  const o=progressId===TUT2.id?TUT2:OPS.find(x=>x.id===opId), first=!cleared(progressId), before={fleet:unlocked('fleet'),tech:unlocked('tech')};
  /* the story remembers whether the distress call was answered (the latest win counts); later conversations use it */
  if(o.rescue) prog().flags['rescued:'+opId]=!!res.rescued;
  const gain=Math.round((o.reward||0)*(first?1:replayRate(o)));
  prog().funds+=gain; if(first) prog().cleared.push(progressId);
  /* branches the story opens on a clear (o.opens: flag names, data/tech.js branches need; 第5節 opens the battleship) */
  const newBr=BRANCHES.filter(b=>b.need&&(o.opens||[]).includes(b.need)&&!prog().flags[b.need]); newBr.forEach(b=>{ prog().flags[b.need]=true; });
  const aid=first&&aidNow(o)?grantAid(o):0; persist();
  const opened=[...[['fleet','艦隊編集'],['tech','技術ツリー']].filter(([k])=>!before[k]&&unlocked(k)).map(([,n])=>`「${n}」`),...newBr.map(b=>`「${b.name}」`)];
  return `${gain?`　報酬：資金 +${gain}${first?'':'（再戦）'}。`:''}${aid?`　${o.aid.name}：資金 +${aid}。`:''}${opened.length?`　${opened.join('と')}が使えるようになった。`:''}`;
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- army math ---------- */
/* flag: the army is its army group's flagship, and takes D.flagBonus on top of its formation bonuses */
function armyStats(a,flag){
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
  if(flag&&D.flagBonus) active.push(D.flagBonus);
  active.forEach(b=>Object.entries(modOf(b,types)).forEach(([k,m])=>st[k]*=m));
  return {st,ships,bgs,active,hangar};
}
/* convert an army into the battle fleet spec used by battle/ */
function armyToFleet(a,flag){
  const {st,ships,bgs,hangar,active}=armyStats(a,flag);
  const types=new Set(bgs.map(b=>b.type)), mods=k=>active.reduce((v,b)=>v*(modOf(b,types)[k]||1),1);
  const byType=Object.fromEntries([...new Set(bgs.map(b=>b.type))].map(t=>{ const s=shipNow(t); return [t,{dps:.4+s.atk*mods('atk')*.45,range:10+s.rng*mods('rng')*1.6}]; }));
  /* the small craft's rates, weighted by how many each ship class brings */
  const craft={}; Object.keys(hangar).forEach(c=>{ let w=0, out=1, turn=0; const r={dmg:0,hp:0,eva:0};
    bgs.forEach(b=>{ const v=(SHIP[b.type].hangar||{})[c]; if(!v) return; const n=v*b.count, br=branchOfType(b.type); w+=n;
      CRAFT_STATS.forEach(k=>r[k]+=craftRate(craftOwner(c)||br,c,k)*n); out=Math.max(out,craftOut(br,c)); turn+=craftTurn(br)*n; });
    if(w) craft[c]={...Object.fromEntries(CRAFT_STATS.map(k=>[k,r[k]/w])), out, turn:turn/w}; });
  const big=bgs.reduce((m,b)=>Math.max(m,SHIP[b.type].scale),.6);
  const by={}; bgs.forEach(b=>by[b.type]=(by[b.type]||0)+b.count);
  const sub=Object.entries(by).sort((x,y)=>SHIP[y[0]].scale-SHIP[x[0]].scale).slice(0,3).map(([t,c])=>SHIP[t].name+c).join('・');
  return {name:a.name, sub, comp:by, byType, n:Math.max(1,ships), hp:6+st.def*5, dmg:.4+st.atk*.45, eva:Math.min(.4,st.eva*.04),
    range:10+st.rng*1.6, speed:2+st.spd, vis:st.vis, stl:st.stl, aa:st.aa, hangar, craft, scale:Math.min(1.5,.4+big*.6), stats:st, bonus:active.map(b=>b.id)};
}

/* ---------- screens ---------- */
const menu=document.getElementById('menu');
/* the menu is laid out for a 1600×900 window and scaled to the real one (a little smaller than 1:1, user 2026-11-04) */
const MENU_SCALE=.93;
function fitMenu(){ menu.style.setProperty('--k',(MENU_SCALE*Math.min(innerWidth/1600,innerHeight/900)).toFixed(4)); }
addEventListener('resize',fitMenu); fitMenu();
let orgPop=null, orgFromForces=false, sortieInitialized=false;
let orgForce='space', groundTab='brigades', selGround=null;
let screen='title', tab='army', selBg=null, selArmy=null, selGroup=null, layer=2, placing=null, sortieGroups=[], sortieOp=CAMP[0].id, confirmDel=null;

function show(s){ if(screen==='forces'&&s!=='forces') WOS_DOCK.close(); screen=s; confirmDel=null; render(); menu.scrollTop=0; }
function render(){
  WOS_BG.screen(screen);
  menu.querySelectorAll('.scr').forEach(el=>el.hidden=el.dataset.s!==screen);
  if(screen==='sortie') renderSortie();
  if(screen==='forces') renderForces();
  if(screen==='mode') renderMode();
  if(screen==='org') renderOrg();
  if(screen==='data') renderData();
  if(screen==='title') renderTitle();
  if(screen==='tech') renderTech();
  if(screen==='opt') renderOpt();
  preview.active=(screen==='org'&&orgForce==='space'&&tab==='group');
}

menu.innerHTML=`
<section class="scr" data-s="title">
  <div class="ttl">
    <p class="eyebrow">A.E. 45 — INTERPLANETARY WAR</p>
    <h1><span class="t-the">THE </span>WAR OF <em>SOL</em></h1>
    <p class="title-sub">太陽系戦争　試作版</p>
  </div>
  <p class="tstat" id="tStat"></p>
  <nav class="mainnav" id="mainNav" aria-label="メインメニュー"></nav>
  <aside class="dbgp" id="dbgP">
    <button class="dbgt" id="dbgT" aria-expanded="false">DEBUG</button>
    <div class="dbgb" id="dbgB" hidden></div>
  </aside>
</section>
<section class="scr" data-s="tech" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2 class="scrh"><b>RESEARCH</b><span>技術ツリー</span></h2>
    <div class="tabs stabs" role="tablist" id="forceTabs"></div><p class="funds" id="techFunds"></p></header>
  <p class="tabnote">資金で研究し、出撃上限と、自分で編成した艦隊の能力（最初は最大の3割）を上げます。線の先は、つながる元をすべて研究すると始められます。数値は仮。</p>
  <p class="empty" id="forceSoon" hidden></p>
  <div class="techwrap" id="techWrap">
    <nav class="brbar" id="brBar" aria-label="兵科"></nav>
    <div class="treebox">
      <div class="trsum" id="trSum"></div>
      <div class="trscroll" id="trScroll"><div class="trcv" id="trCv"></div></div>
      <div class="tzoom" role="group" aria-label="樹形図の拡大・縮小"><button data-tz="in" title="拡大（ホイールでも）">＋</button><button data-tz="out" title="縮小（ホイールでも）">−</button><button data-tz="fit" title="全体を枠に収める">全体</button></div>
      <div class="tinfo" id="tInfo" role="dialog" aria-label="研究" hidden></div>
    </div>
  </div>
</section>
<section class="scr sortie-screen" data-s="mode" hidden><button class="back plate" data-go="title">← メニュー</button><h2 class="sortie-heading"><b>SORTIE</b><span>出撃</span></h2><div class="modes"><button class="plate off" data-go="sortie"><i>OFFLINE</i><b>オフライン</b><span id="modeNext"></span></button><button class="plate on" data-go="online"><i>ONLINE</i><b>オンライン</b><span>ほかのプレイヤーと遊ぶ。</span><i class="tag">準備中</i></button></div></section>
<section class="scr sortie-screen" data-s="online" hidden><button class="back plate" data-go="mode">← 出撃</button><h2 class="sortie-heading"><b>ONLINE</b><span>オンライン</span></h2><div class="plate onpanel"><b>準備中</b><p>オンラインで遊べる内容はまだ決まっていません。</p></div></section>
<section class="scr sortie-screen" data-s="sortie" hidden>
  <button class="back plate" data-go="mode">← 出撃</button><h2 class="sortie-heading"><b>OFFLINE</b><span>作戦を選ぶ</span></h2>
  <div id="opList" class="ops"></div><p id="where" class="where"></p>
  <div class="plate det"><div id="opDetail"></div><div id="fixedNote"></div><div class="det-row"><span id="opReward"></span><span class="det-buttons"><button id="goQuick" class="quick" hidden>クイック出撃</button><button id="goBattle" class="primary">出撃する</button></span></div></div>
</section>
<section class="scr sortie-screen forces-screen" data-s="forces" hidden>
  <canvas id="dockCanvas"></canvas><button class="back plate" data-go="sortie">← 作戦を選ぶ</button>
  <h2 class="sortie-heading"><b>FORCES</b><span>出撃する戦区軍</span><small id="forcesName"></small></h2>
  <div class="forces-left"><div id="sgList" class="cards"></div><button id="forcesCreate" class="plate" data-go="org">＋ 艦隊編集で戦区軍を作る</button></div>
  <div class="forces-right"><div class="plate" id="forcesDetail"></div><div class="plate" id="sgLoad"></div><div class="forces-buttons"><button id="forcesOrg" data-go="org">艦隊編集へ</button><button id="forcesBattle" class="primary">出撃する</button></div></div>
</section>
<section class="scr" data-s="org" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2 class="scrh"><b>FLEET</b><span>艦隊編集</span></h2>
    <div class="tabs stabs" role="tablist" aria-label="軍種" id="orgForceTabs"><button role="tab" data-org-force="space">宇宙軍</button><button role="tab" data-org-force="ground">地上軍</button></div>
    <div class="tabs stabs" role="tablist" id="orgUnitTabs">
      <button role="tab" data-tab="group">戦区軍</button><button role="tab" data-tab="army">打撃群</button>
    </div>
  </header>
  <p class="tabnote" id="tabNote" hidden></p>
  <p class="orgcap" id="orgCap"></p>
  <div class="org">
    <aside class="list" id="orgList"></aside>
    <div class="detail" id="orgDetail"></div>
  </div>
</section>
<section class="scr" data-s="data" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2 class="scrh"><b>DATA</b><span>艦艇データ</span></h2></header>
  <p class="tabnote">数値はすべて仮の値です（1〜10）。表の値は技術ツリーの研究をすべて終えた最終形態（最大）で、自分で編成した艦隊は最初その3割から始まります。速度は打撃群の移動速度を決め、打撃群は最も遅い艦に合わせて動きます。視界は敵を見つけられる距離、隠蔽性は敵からの見つかりにくさで、打撃群の視界は最も高い艦、隠蔽性は最も低い艦で決まります。母艦は敵が近づくと艦載機やW.A.S.（Weaponed Armored Shell・武装装甲化外骨格）を自動で発進させます。艦載機は遠くまで届き、W.A.S.は近距離で打たれ強く火力が高い小型ユニットです。</p>
  <div class="tblwrap"><table class="ships" id="shipTbl"></table></div>
  <h3 class="sub">編成ボーナス（打撃群単位・仮）</h3>
  <div class="tblwrap"><table class="ships" id="bonusTbl"></table></div>
</section>
<section class="scr" data-s="opt" hidden>
  <header class="scrhead"><button class="back" data-go="title">← メニュー</button><h2 class="scrh"><b>OPTIONS</b><span>オプション</span></h2></header>
  <div class="optlist plate" id="optList"></div>
</section>`;

menu.addEventListener('click',e=>{
  const go=e.target.closest('[data-go]'); if(go){ if(go.dataset.go==='org') orgFromForces=screen==='forces'; if(screen==='org'&&go.classList.contains('back')&&orgFromForces){ orgFromForces=false; show('forces'); } else show(go.dataset.go); return; }
  const force=e.target.closest('[data-org-force]'); if(force){ orgForce=force.dataset.orgForce; confirmDel=null; render(); return; }
  const gt=e.target.closest('[data-ground-tab]'); if(gt){ groundTab=gt.dataset.groundTab; selGround=null; confirmDel=null; render(); return; }
  const t=e.target.closest('[data-tab]'); if(t){ tab=t.dataset.tab; confirmDel=null; render(); }
});

/* ---------- the preparation guide (docs/tutorial.md 6): after 第2節, before 第3節. Steps and text: data/tech.js prepTutorial ----------
   A step passes when its condition holds (also when it already held as the step began). Shown while the menu is open */
const PREP=D.prepTutorial, CRUISER=()=>BRANCHES.find(b=>b.id==='cruiser');
const prepG=()=>save.groups.find(x=>x.id==='g1');
const PREP_DONE={
  org:()=>screen==='org'&&orgForce==='space',
  army:()=>screen==='org'&&orgForce==='space'&&tab==='army'&&selArmy==='a1',
  group:()=>screen==='org'&&orgForce==='space'&&tab==='group',
  placed:()=>prepG().members.some(m=>m.army==='a1'),
  flag:()=>prepG().members[flagIndex(prepG())]?.army==='a1',
  tech:()=>screen==='tech',
  cruiser:()=>screen==='tech'&&techBr?.id==='cruiser',
  research:()=>techOf(CRUISER()).length>0,
  sortie:()=>false,   // passed by 出撃する on the forces screen (renderForces)
};
/* the fleet steps are passed over once the cruisers' army (or the army group they go in) is gone */
const prepGone=c=>(['army','group','placed','flag'].includes(c)&&!armyById('a1'))||(['placed','flag'].includes(c)&&!prepG());
const prepOn=()=>cleared('retreat')&&!prog().prepDone;
const prepTalk=document.createElement('div'); prepTalk.id='prepTalk'; prepTalk.hidden=true;
prepTalk.innerHTML='<div class="eye">COMMS 通信</div><b>リコ軍曹</b><p></p><div class="ctl"><span></span><button>とばす</button></div>';
menu.appendChild(prepTalk);
const prepFrames=[0,1].map(()=>{const el=document.createElement('div'); el.className='prep-frame'; el.hidden=true; menu.appendChild(el); return el;});
/* the guide's own aid (o.aid.by 'prep') comes with its step, or when the guide ends; before 第2節 is cleared it waits for the clear */
const prepAid=()=>{ const o=OPS.find(x=>x.id==='retreat'); return cleared(o.id)?grantAid(o):0; };
const aidNow=o=>!o.aid||o.aid.by!=='prep'||prog().prepDone;
/* skipped or ended: the cruisers' army goes into the army group (the front cell) as the guide would have put it */
function finishPrep(place){
  const g=prepG();
  if(place&&g&&armyById('a1')&&!g.members.some(m=>m.army==='a1')&&g.members.length<MAX_ARMY){
    const cell={x:2,y:2,z:0}; g.members.push({army:'a1',...(g.members.some(m=>m.x===2&&m.y===2&&m.z===0)?freeCell(g):cell)});
  }
  prog().prepDone=true; prepAid(); persist();
}
prepTalk.querySelector('button').onclick=()=>{finishPrep(true); render();};
let prepShown='', prepWas=false;
function prepTick(){
  const active=!menu.hidden&&prepOn();
  if(active){
    const p=prog();
    for(;p.prepStep<PREP.length-1;p.prepStep++,persist()){
      const row=PREP[p.prepStep];
      if(row.aid&&grantAid(OPS.find(o=>o.id===row.aid))) persist();
      if(!prepGone(row.condition)&&!PREP_DONE[row.condition]()&&!(row.until&&PREP_DONE[row.until]())) break;
    }
    const step=PREP[p.prepStep];
    prepTalk.querySelector('p').textContent=step.text; prepTalk.querySelector('.ctl span').textContent=`準備 ${p.prepStep+1}/${PREP.length}　${step.name}`;
    /* a target counts while it is drawn; one out of sight is scrolled to once, as its step begins or the screen or tab changes */
    const drawn=sel=>{const el=menu.querySelector(sel); if(!el||!el.getClientRects().length||getComputedStyle(el).visibility==='hidden') return null; const r=el.getBoundingClientRect(); return r.width&&r.height?el:null;};
    let target=step.targets.map(drawn).find(Boolean);
    /* not on the step's screen: the way there (the menu item on the title, else ← back) */
    if(!target) target=drawn(screen==='title'?`#mainNav [data-go="${step.screen==='forces'?'mode':step.screen}"]`:'.scr:not([hidden]) .back');
    const key=p.prepStep+'|'+screen+'|'+tab; if(target&&prepShown!==key){ prepShown=key; const r=target.getBoundingClientRect(); if(r.top<0||r.bottom>innerHeight) target.scrollIntoView({block:'center'}); }
    const targets=[target,...(step.also||[]).map(drawn)].filter(Boolean).slice(0,2);
    prepFrames.forEach((f,i)=>{const el=targets[i]; f.hidden=!el; if(el){const r=el.getBoundingClientRect(); Object.assign(f.style,{left:(r.left-4)+'px',top:(r.top-4)+'px',width:(r.width+8)+'px',height:(r.height+8)+'px'});}});
  }
  /* the DOM is touched only when the guide comes or goes (the loop also runs under the battle) */
  if(active!==prepWas){ prepWas=active; if(!active) prepFrames.forEach(f=>f.hidden=true); prepTalk.hidden=!active; menu.classList.toggle('prep-active',active); }
  requestAnimationFrame(prepTick);
}
requestAnimationFrame(prepTick);

/* ---------- title (main menu) ---------- */
function renderTitle(){
  const P=prog(), next=tutDone()?CAMP.find(o=>!cleared(o.id)):TUT, last=[...CAMP].reverse().find(o=>cleared(o.id));
  document.getElementById('tStat').innerHTML=`<span>資金 <b>${P.funds.toLocaleString()}</b></span><span>進行 <b>${last?esc(opLabel(last))+'まで完了':'開始前'}</b></span>${dbg.free||dbg.battle?'<span class="dbgon">デバッグ中</span>':''}`;
  const item=(key,go,name,desc)=>{ const ok=!key||unlocked(key)||dbg.free;
    return `<button data-go="${go}" ${ok?'':'disabled'}><b>${ok?'':LOCK}${name}</b><span>${ok?desc:unlockText(key)}</span></button>`; };
  document.getElementById('mainNav').innerHTML=
    `<button data-go="mode" class="lead"><b>出撃</b><span>${next?`次の作戦：${esc(opLabel(next))}`:'次の作戦は準備中。クリアした作戦はもう一度遊べます'}</span></button>`+
    item('fleet','org','艦隊編集','支隊・打撃群・戦区軍を組む')+
    item('tech','tech','技術ツリー','資金を使い、兵科ごとの出撃上限を上げる')+
    item(null,'data','艦艇データ','8艦種の能力と編成ボーナス')+
    item(null,'opt','オプション','ストーリーの表示などの設定');
  renderDebug();
}
/* ---------- options ---------- */
const mark=t=>`<span class="mk">${WOS_MARKS.svg(t,opt.markSet)}</span>`;
function renderOpt(){
  const box=document.getElementById('optList');
  const choices=(key,label,items)=>`<div class="optrow sepr"><b>${label}</b><span class="segc" role="radiogroup" aria-label="${label}">${items.map(([v,n])=>`<button role="radio" data-setting="${key}" data-value="${v}" aria-checked="${opt[key]===v}">${n}</button>`).join('')}</span></div>`;
  box.innerHTML=`<div class="optrow"><b>ストーリー</b><label class="toggle sw"><input type="checkbox" data-opt="story" ${opt.story?'checked':''}> ${opt.story?'オン':'オフ'}</label></div>
    <p>作戦の前後の会話を出します。オフにすると会話をとばして、すぐ配置や結果へ進みます。</p>
    ${choices('unitFmt','部隊の表示',[['both','番号＋名前'],['no','番号だけ'],['name','名前だけ']])}
    <p>編成画面と戦闘画面の名札で、部隊をどう呼ぶか。物語の隊はいつも名前で出します。</p>
    <div class="plates"><span class="np">${mark('cl')} ${opt.unitFmt==='no'?'第1打撃群':opt.unitFmt==='name'?'第1 前衛巡洋 打撃群':'第1打撃群　前衛巡洋'}</span><span class="np ace">${mark('mas')} アルバレス隊</span></div>
    ${choices('markSet','艦種マーク',[['A','艦影'],['B','部隊符号']])}
    <p>編成画面・技術ツリー・戦闘画面の名札に出す艦種の印。</p><div class="plates">${SHIPS.map(s=>`<span class="np">${mark(s.id)} ${s.name}</span>`).join('')}</div>
    ${choices('grid','戦闘のグリッド',[['sq','四角'],['polar','円']])}
    <p>四角: 宙域いっぱいに四角の目盛り、選んだ艦隊のまわりに円の目盛り。円: その逆（宙域の中心から円の目盛り、選んだ艦隊のまわりに四角）。</p>`;
  box.querySelector('[data-opt]').onchange=e=>{ opt.story=e.target.checked; persistOpt(); renderOpt(); };
  box.querySelectorAll('[data-setting]').forEach(x=>x.onclick=()=>{opt[x.dataset.setting]=x.dataset.value; persistOpt(); renderOpt();});
}
/* the debug panel (bottom right of the title, folded at first) */
let dbgOpen=false, dbgConfirm=false;
function renderDebug(){
  const t=document.getElementById('dbgT'), b=document.getElementById('dbgB');
  t.setAttribute('aria-expanded',String(dbgOpen)); b.hidden=!dbgOpen; if(!dbgOpen) return;
  b.innerHTML=`
    <label class="toggle"><input type="checkbox" data-dbg="free" ${dbg.free?'checked':''}> 作戦と画面を自由に選ぶ（鍵と出撃上限を無視）</label>
    <label class="toggle"><input type="checkbox" data-dbg="battle" ${dbg.battle?'checked':''}> 戦闘中のメニューに即勝利・即敗北・オート切替</label>
    <label class="toggle"><input type="checkbox" data-dbg="auto" ${dbg.auto?'checked':''}> オートモード（会話と配置を自動で進める。宇宙戦では自軍が自動で戦い、作戦の目標もこなす）</label>
    <div class="dbgr"><button data-dbga="one" title="まだクリアしていない最初の節を、勝ったときと同じに扱う（報酬も入り、緊急援助は準備の案内で届く）。チュートリアルを終えていなければ、先にチュートリアルを飛ばす">一節だけクリア</button><button data-dbga="skip" title="演習のチュートリアル、チュートリアル2（バイコヌール演習も開く）と準備画面の案内（第2節のあと）を済みにする。準備画面の案内は「とばす」と同じで、巡洋艦の打撃群を戦区軍に置き、緊急援助を渡す（第2節の前なら、援助は第2節のクリアで入る）">チュートリアルスキップ</button><button data-dbga="all">全作戦クリア</button><button data-dbga="funds">資金 +1000</button><button data-dbga="branches" title="物語でまだ開いていない兵科（戦艦・母艦・W.A.S. 部隊）を、研究はせずに開く">全兵科解放</button><button data-dbga="tech">全研究（全兵科を解放）</button><button data-dbga="reset" class="danger" title="進行（クリア・資金・研究）と、艦隊（支隊・打撃群・戦区軍）を最初の状態に戻す">${dbgConfirm?'もう一度押すと戻します':'進行を最初に戻す'}</button></div>
    <p class="dim small">進行を戻しても、編成はそのまま残ります。</p>`;
  b.querySelectorAll('[data-dbg]').forEach(x=>x.onchange=()=>{ dbg[x.dataset.dbg]=x.checked; persistDbg(); renderTitle(); });
  b.querySelectorAll('[data-dbga]').forEach(x=>x.onclick=()=>{ const a=x.dataset.dbga, P=prog();
    if(a!=='reset') dbgConfirm=false;
    /* 一節だけ: the first section not cleared yet counts as won (its reward and aid too). At the start it skips the tutorial (user decision 2026-11-05) */
    if(a==='one'){ const o=CAMP.find(x=>!cleared(x.id)); if(!tutDone()) P.tutorialCleared=true; else if(o){ P.funds+=o.reward||0; P.cleared.push(o.id); if(aidNow(o)) grantAid(o); } }
    /* チュートリアルスキップ: both tutorials count as done; the preparation guide as with its とばす (user decision 2026-11-06) */
    if(a==='skip'){ P.tutorialCleared=true; if(!P.prepDone) finishPrep(true); P.flags.groundOpen=true; if(!cleared(TUT2.id)) P.cleared.push(TUT2.id); }
    /* 全作戦クリア: the preparation guide too, as its とばす (the cruisers go into the army group; 2026-11-06: they were left out, so the
       fast-forward tools fought without them) */
    if(a==='all'){ P.tutorialCleared=true; if(!P.prepDone) finishPrep(true); P.flags.groundOpen=true; if(!cleared(TUT2.id)) P.cleared.push(TUT2.id); }
    if(a==='all') OPS.forEach(o=>{ if(!cleared(o.id)) P.cleared.push(o.id); if(o.aid) P.flags['aid:'+o.id]=true; });
    if(a==='funds') P.funds+=1000;
    /* 全兵科解放: opens every branch the story has not opened yet, without researching anything (user decision 2026-10-04) */
    if(a==='branches') BRANCHES.forEach(br=>{ if(br.need) P.flags[br.need]=true; });
    /* 全研究 also opens the branches the story has not opened yet (戦艦・母艦・W.A.S. 部隊) */
    if(a==='tech') BRANCHES.forEach(br=>{ if(br.need) P.flags[br.need]=true; P.tech[br.id]=TREE.map(n=>n.id); });
    /* back to the start: the progress and the fleets (battle groups, armies, army groups) as a new save has them (user decision 2026-10-04) */
    if(a==='reset'){ if(!dbgConfirm){ dbgConfirm=true; renderDebug(); return; } dbgConfirm=false;
      const d=defaults(); Object.assign(save,{seq:d.seq,bgs:d.bgs,armies:d.armies,groups:d.groups,groundOrg:d.groundOrg,prog:newProg(),sortieMenu:d.sortieMenu}); selBg=selArmy=selGroup=selGround=null; sortieGroups=[]; sortieInitialized=false; }
    persist(); renderTitle(); });
}
document.addEventListener('click',e=>{ if(e.target.closest('#dbgT')){ dbgOpen=!dbgOpen; dbgConfirm=false; renderDebug(); } });

/* ---------- tech tree ----------
   tabs: 宇宙軍 / 地上軍 (地上軍 comes later). left: a thin bar of the branches the story has opened.
   right: the tree of the chosen branch, a web of ○ nodes linked by their requirements, scrolled sideways.
   Click a node to open a small window beside it with the details, 研究する and × (user decision 2026-11-05) */
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
  /* W.A.S. (user decision 2026-10-14, design B-1, matching the 3D model; C and D are kept in docs/icons/): a little larger than a
     person. Arms tapering to a point above the shoulders and spread like ハ, joined to the body by thin lines; a cannon over the left
     shoulder (screen right), its box running down behind the body to the waist (drawn behind: nothing hides it but the thin joints),
     a long barrel and a muzzle brake; a rifle in the right hand on the arm's axis, its thick part starting behind the arm's end and
     narrowing as a long slim cone that curves into the barrel (T5); a small head; a chest with a step to the narrow belly; short slim legs with a ^ knee and a
     thruster alongside, joined to the waist by thin lines. Angular armor, lightly filled */
  was:'<g stroke-width="1.2" transform="translate(0 2.48)"><path fill="currentColor" fill-opacity=".3" d="M13.90 4.60 L15.00 4.60 L15.00 11.20 L13.90 11.20 Z"/><path d="M14.45 4.6V-0.6"/><path stroke-width=".6" d="M13.95 -0.6H14.95"/><circle cx="12" cy="7.05" r=".85"/><path stroke-width=".6" d="M10.5 8.7L8.4 7.6M10.75 9.4L8.1 9.3M13.5 8.7l2.1-1.1M13.25 9.4l2.65-.1"/><path stroke-width=".6" d="M11.30 10.60L10.92 11.30M12.70 10.60L13.08 11.30M11.50 11.05L11.26 11.35M12.50 11.05L12.74 11.35"/><g fill="currentColor" fill-opacity=".3"><path d="M10.3 8.0 L13.7 8.0 L13.35 9.5 L12.95 9.75 L12.55 11.2 L12.0 11.7 L11.45 11.2 L11.05 9.75 L10.65 9.5 Z"/><path fill="none" stroke-width=".6" d="M10.6 9.0 L12.0 9.4 L13.4 9.0"/><g transform="rotate(14 7.55 5.8)"><path d="M8.2 2.8 L7.0 5.8 L6.25 9.8 L6.25 12.2 L7.32 15.0 L8.85 12.4 L8.85 9.6 L8.5 5.2 Z"/><path fill="none" stroke-width=".6" d="M6.7 8.0 L8.75 7.2"/><path fill="currentColor" fill-opacity=".3" d="M6.74 15.36 L6.86 13.79 L7.32 15.00 L7.95 13.93 L7.84 15.44 L7.79 15.56 L7.73 15.68 L7.67 15.80 L7.61 15.93 L7.54 16.08 L7.47 16.24 L7.41 16.43 L7.35 16.65 L7.29 16.90 L7.24 17.19 L7.20 17.52 L7.16 17.90 L7.08 17.51 L7.09 17.17 L7.08 16.88 L7.06 16.63 L7.03 16.40 L6.99 16.21 L6.95 16.04 L6.90 15.88 L6.86 15.74 L6.81 15.61 L6.78 15.49 Z"/><path fill="none" d="M7.11 17.89L7.02 19.19"/></g><g transform="rotate(-14 16.45 5.8)"><path d="M15.8 2.8 L17.0 5.8 L17.75 9.8 L17.75 12.2 L16.68 15.0 L15.15 12.4 L15.15 9.6 L15.5 5.2 Z"/><path fill="none" stroke-width=".6" d="M17.3 8.0 L15.25 7.2"/></g><path d="M10.82 11.3 L11.24 11.3 L11.54 11.93 L11.54 13.91 L11.66 16.25 L10.1 16.25 L10.28 13.91 L10.4 12.29 Z"/><path d="M13.18 11.3 L12.76 11.3 L12.46 11.93 L12.46 13.91 L12.34 16.25 L13.9 16.25 L13.72 13.91 L13.6 12.29 Z"/><path d="M10.1 11.8 L10.15 12.9 L10.05 13.9 L9.95 15.1 L9.1 15.1 L9.25 13.9 L9.4 12.9 Z"/><path d="M13.9 11.8 L13.85 12.9 L13.95 13.9 L14.05 15.1 L14.9 15.1 L14.75 13.9 L14.6 12.9 Z"/><path fill="none" stroke-width=".6" d="M10.33 14.18 L10.91 13.55 L11.49 14.18 M13.67 14.18 L13.09 13.55 L12.51 14.18 M9.18 14.5 L10.0 14.5 M14.82 14.5 L14.0 14.5"/></g></g>',
  deck:'<path d="M3 15h18l-2 4H5zM6 15V9h12v6M9 9V6h6v3"/>',
  supply:'<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/><path d="M9 12h6M12 9v6"/>',
  flak:'<path d="M12 21v-6M8 21h8"/><path d="M12 15l-5-9M12 15l5-9"/><circle cx="6" cy="4" r="1.2"/><circle cx="18" cy="4" r="1.2"/>',
  stealth:'<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/><path d="M4 20L20 4"/>',
};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]||ICONS.cap}</svg>`;
const num=v=>(Math.round(v*10)/10).toFixed(1);
/* one line for the tooltip: what a node raises */
const effShort=(b,n)=>n.deploy==='masc'?'強襲母艦を編成できるようになる':n.add&&n.add.out?'同時に出撃できる隊 +1'
  :n.add&&n.add.turn?'補給が速くなる'
  :n.cap?`出撃上限 +${b.steps[n.cap].cap-b.steps[n.cap-1].cap}隻`
  :n.craft?Object.keys(n.add).map(k=>`${D.crafts[n.craft].name} ${CRAFT_NAME[k]} +${num2(D.crafts[n.craft][k]*n.add[k])}`).join('・')
  :Object.keys(n.add).map(k=>`${STAT_NAME[k]} +${b.types.map(t=>num(SHIP[t][k]*n.add[k])).join('/')}`).join('・');
let techForce='space', techBr=null, techSel=null;
/* the tree view (user decision 2026-10-04): drag with the left button to move it up, down and sideways, the wheel to zoom.
   tv = {br, x, y, z}: the branch shown, the offset of the tree in its box and the zoom */
let tv=null, treeDragged=false, treeWired=false, treeSize=null;
const TREE_Z=[.4,1.8];
function fitTree(br,cw,ch){ const box=document.getElementById('trScroll'), W=box.clientWidth||900, H=box.clientHeight||480;
  const z=Math.max(TREE_Z[0],Math.min(1,(H-8)/ch,(W-8)/cw)); tv={br,x:8,y:Math.max(4,(H-ch*z)/2),z}; }
function placeTree(){ document.getElementById('trCv').style.transform=`translate(${tv.x}px,${tv.y}px) scale(${tv.z})`; placeInfo(); }
/* the node window sits right of its node, or left when there is no room, inside the tree box */
function placeInfo(){ const info=document.getElementById('tInfo'), nd=techSel&&document.querySelector(`#trCv [data-node="${techSel}"] .orb`);
  if(info.hidden||!nd) return; const pb=info.parentElement, sc=document.getElementById('trScroll'), w=info.offsetWidth, h=info.offsetHeight;
  /* the menu is scaled with CSS zoom: screen rects are divided by it to get the box's own px */
  const k=pb.getBoundingClientRect().width/pb.offsetWidth||1, box=pb.getBoundingClientRect(), o=nd.getBoundingClientRect();
  const L=(o.left-box.left)/k, R=(o.right-box.left)/k, M=((o.top+o.bottom)/2-box.top)/k, x0=sc.offsetLeft, y0=sc.offsetTop;
  info.style.left=(R+16+w<=x0+sc.offsetWidth-8?R+16:Math.max(x0+8,L-16-w))+'px';
  info.style.top=Math.max(y0+8,Math.min(y0+sc.offsetHeight-h-8,M-h/2))+'px'; }
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
  /* the ＋ − 全体 buttons at the corner (user 2026-11-06): ＋ − zoom round the middle of the box, 全体 fits the whole tree again */
  document.querySelectorAll('.tzoom [data-tz]').forEach(bt=>bt.onclick=()=>{ const a=bt.dataset.tz;
    if(a==='fit'){ if(treeSize) fitTree(tv.br,treeSize.cw,treeSize.ch); placeTree(); return; }
    const mx=box.clientWidth/2, my=box.clientHeight/2, z=Math.max(TREE_Z[0],Math.min(TREE_Z[1],tv.z*(a==='in'?1.25:.8))), k=z/tv.z;
    tv.x=mx-(mx-tv.x)*k; tv.y=my-(my-tv.y)*k; tv.z=z; placeTree(); });
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
  document.getElementById('brBar').innerHTML=BRANCHES.map(x=>`<button data-br="${x.id}" aria-pressed="${x===b}" ${branchOpen(x)?'':'disabled'}><span class="marks">${x.types.map(mark).join('')}</span><b>${esc(x.name)}</b><span>${branchOpen(x)?`上限${branchCap(x)}隻`:esc(x.needText||'未解放')}</span></button>`).join('');
  document.querySelectorAll('#brBar [data-br]').forEach(x=>x.onclick=()=>{ techBr=BRANCHES.find(y=>y.id===x.dataset.br); techSel=null; renderTech(); });
  /* the branch now: each ship class's stats as numbers (the final form is not shown) */
  document.getElementById('trSum').innerHTML=`<div class="trhead"><b>${esc(b.name)}</b><span>出撃上限 ${branchCap(b)}隻${b.id==='was'?`・強襲母艦 ${mascCap()}隻`:''}</span></div>`+
    b.types.map(t=>`<div class="trrow"><span class="tname">${SHIP[t].name}</span>${RATED.map(k=>`<i>${STAT_NAME[k]} <em>${num(SHIP[t][k]*statRate(b,k))}</em></i>`).join('')}</div>`).join('')+
    crafts(b).map(c=>{ const o=craftOwner(c)||b; return `<div class="trrow"><span class="tname">${D.crafts[c].name}</span>${o===b?CRAFT_STATS.map(k=>`<i>${CRAFT_NAME[k]} <em>${num2(D.crafts[c][k]*craftRate(b,c,k))}</em></i>`).join(''):`<i>機体の研究は${esc(o.name)}</i>`}`+
      `<i>出撃 <em>${craftOut(b,c)}</em>隊</i><i>補給 <em>${num(D.crafts[c].rearm/craftTurn(b))}</em>秒</i></div>`; }).join('');
  /* the web: nodes at (col,row), a curve from each requirement to the node */
  const R=21, PADX=80, PADY=10;
  const NODES=nodesOf(b), ROWS=[...new Set(NODES.map(n=>n.row))].sort((x,y)=>x-y);
  const cols=Math.max(...NODES.map(n=>n.col))+1, rows=ROWS.length;
  /* the rows spread to fill the box's height (user 2026-11-05: more room between the rows), at least 84 apart */
  const RH=Math.min(130,Math.max(84,((document.getElementById('trScroll').clientHeight||480)-8-PADY*2-R*2-30)/Math.max(1,rows-1)));
  /* the columns spread to fill the box at the zoom its height allows (user 2026-11-04: use the room on the right) */
  const box=document.getElementById('trScroll'), bh=PADY*2+(rows-1)*RH+R*2+30, bz=Math.max(TREE_Z[0],Math.min(1,((box.clientHeight||480)-8)/bh));
  const CW=Math.max(168,(((box.clientWidth||900)-8)/bz-PADX*2)/Math.max(1,cols-1));
  const at=n=>({x:PADX+n.col*CW, y:PADY+R+ROWS.indexOf(n.row)*RH});
  /* the lines (user decision 2026-11-06, 見本の案C「合流」): a smooth S curve from the right of the source to a point JOIN short of the
     node's left, then one straight stub into it, so the lines of a node's requirements meet there (#288 had straight runs and 45° slants) */
  const JOIN=30;
  const edges=NODES.flatMap(n=>n.req.map(r=>{ const p=at(nodeById(r)), q=at(n), x1=p.x+R, j=q.x-R-JOIN, m=(x1+j)/2;
    const st=nodeDone(b,nodeById(r))?(nodeDone(b,n)?'on':'ready'):'';
    /* the deployment of the assault carriers sits below the tree: its long line from the first sortie-limit node goes round the left and
       bottom edges of the tree (rounded corners) instead of crossing it, into the node from below */
    const k=10, by=q.y+24;
    const d=n.deploy==='masc'&&r==='cap1'?`M${p.x-R} ${p.y}H${8+k}Q8 ${p.y} 8 ${p.y+k}V${by-k}Q8 ${by} ${8+k} ${by}H${q.x-k}Q${q.x} ${by} ${q.x} ${by-k}V${q.y+R}`
      :`M${x1} ${p.y}C${m} ${p.y} ${m} ${q.y} ${j} ${q.y}H${q.x-R}`;
    return `<path d="${d}" class="${st} ${techSel===n.id?'req':techSel===r?'next':''}"/>`; })).join('');
  const selN=nodeById(techSel);
  const nodes=NODES.map(n=>{ const p=at(n), done=nodeDone(b,n), can=nodeOpen(b,n), sel=techSel===n.id, pre=selN&&selN.req.includes(n.id);
    return `<button class="tn ${done?'done':can?'can':''} ${sel?'sel':''} ${pre?'pre':''}" data-node="${n.id}" style="left:${p.x}px;top:${p.y}px" aria-pressed="${sel}" title="${esc(nodeName(b,n))}　${done?'研究済み':`資金${nodeCost(b,n)}`}　${esc(effShort(b,n))}"><i class="orb">${icon(n.icon)}</i><b>${esc(nodeName(b,n))}</b></button>`; }).join('');
  const cv=document.getElementById('trCv'), cw=PADX*2+(cols-1)*CW, ch=PADY*2+(rows-1)*RH+R*2+30;
  cv.style.width=cw+'px'; cv.style.height=ch+'px';
  /* a new branch starts fitted to the box (no vertical scroll); then it is dragged and zoomed freely (treeView) */
  treeSize={cw,ch}; if(!tv||tv.br!==b.id) fitTree(b.id,cw,ch); placeTree(); wireTree();
  cv.innerHTML=`<svg class="tedges" width="100%" height="100%" aria-hidden="true">${edges}</svg>${nodes}`;
  cv.querySelectorAll('[data-node]').forEach(x=>x.onclick=()=>{ if(treeDragged) return; techSel=x.dataset.node; renderTech(); });
  /* the chosen node */
  const info=document.getElementById('tInfo'), n=nodeById(techSel);
  info.hidden=!n; if(!n) return;
  const done=nodeDone(b,n), can=nodeOpen(b,n), cost=nodeCost(b,n);
  const eff=n.deploy==='masc'?`強襲母艦を編成できるようになる（出撃上限 0 → 1隻。${esc(nodeName(b,nodeById('cap2')))}で2、${esc(nodeName(b,nodeById('cap3')))}で3）`:n.cap?`${esc(b.name)}の出撃上限 ${b.steps[n.cap-1].cap} → ${b.steps[n.cap].cap}隻`
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
  info.innerHTML=`<button class="tx" id="tClose" aria-label="閉じる">×</button><div><b>${esc(nodeName(b,n))}</b><p>${eff}</p><p class="treq">前提の研究：${reqs}</p>${leads.length?`<p class="dim">この先：${leads.join('・')}</p>`:''}</div>`+
    `<div class="tact">${done?'<em>研究済み</em>':`<span>資金 ${cost}</span><button id="tRes" ${can&&P.funds>=cost?'':'disabled'}>研究する</button>${can&&P.funds<cost?'<em class="dim">資金が足りません</em>':''}`}</div>`;
  document.getElementById('tClose').onclick=()=>{ techSel=null; renderTech(); };
  placeInfo();
  const r=document.getElementById('tRes'); if(r) r.onclick=()=>{ if(!nodeOpen(b,n)||P.funds<cost) return; P.funds-=cost; techOf(b).push(n.id); persist(); renderTech(); };
}
/* the mouse wheel scrolls the tree sideways */
document.addEventListener('wheel',e=>{ const sc=e.target.closest&&e.target.closest('#trScroll'); if(!sc||Math.abs(e.deltaX)>Math.abs(e.deltaY)) return;
  if(sc.scrollWidth>sc.clientWidth){ e.preventDefault(); sc.scrollLeft+=e.deltaY; } },{passive:false});

/* ---------- sortie ---------- */
function renderMode(){ const next=tutDone()?CAMP.find(o=>!cleared(o.id)):TUT; document.getElementById('modeNext').textContent='キャンペーンと演習。ひとりで、CPU の敵と戦う。\n'+(next?'次の作戦：'+opLabel(next):'次の作戦は準備中'); }
function groupSummary(g){ return g.members.map(m=>armyById(m.army)).filter(Boolean); }
function sortieSections(){
  const sections=[{id:'第一章',title:'無重力',ops:[]},{id:'第二章',title:'重力',ops:[]},{id:'演習',title:'',ops:[]}];
  const camp=tutDone()?CAMP:[TUT,...CAMP], ex=[TUT2,...OPS.filter(o=>!o.chapter&&!o.hidden)];
  camp.forEach(o=>{ const id=o.chapter?.split(' ')[0]||'第一章'; let section=sections.find(s=>s.id===id);
    if(!section){ section={id,title:o.chapterTitle||'',ops:[]}; sections.splice(sections.length-1,0,section); }
    if(o.chapterTitle) section.title=o.chapterTitle; section.ops.push(o); });
  sections.find(s=>s.id==='演習').ops=tutDone()?[TUT,...ex]:ex;
  return sections;
}
const sortieUnseen=o=>opOpen(o)&&!opDone(o)&&!save.sortieMenu.seen.includes(o.id);
function seeSortie(ops){
  save.sortieMenu.seen=[...new Set([...save.sortieMenu.seen,...ops.filter(opOpen).map(o=>o.id)])]; persist();
}
function renderSortie(){
  /* the campaign first, then the exercises; a locked operation shows how it opens. At first the next one to play is chosen */
  const sections=sortieSections(), camp=tutDone()?CAMP:[TUT,...CAMP], list=sections.flatMap(s=>s.ops);
  if(!list.some(o=>o.id===sortieOp&&opOpen(o))) sortieOp=(camp.find(o=>!opDone(o)&&opOpen(o))||list.find(opOpen)||list[0]).id;
  const ol=document.getElementById('opList');
  const nextOp=tutDone()?CAMP.find(o=>!cleared(o.id)):TUT;
  const card=o=>{ const ok=opOpen(o), done=opDone(o), i=CAMP.indexOf(o), need=opRequirement(o);
    const why=!tutDone()?'チュートリアルをクリアで解放':need?`${opLabel(need===TUT2.id?TUT2:OPS.find(x=>x.id===need))}をクリアで解放`:i>0?`${opLabel(CAMP[i-1])}をクリアで解放`:unlocked('fleet')?'技術ツリーで研究を1つ終えると解放':unlockText('fleet');
    return `<button class="plate op ${o.id===sortieOp?'sel':''} ${ok?'':'locked'}" data-op="${o.id}" aria-pressed="${o.id===sortieOp}" ${ok?'':'disabled'}><span>${o.chapter?esc(o.chapter.replace(/^第[一二]章 /,'')):'演習'}</span><b>${ok?'':LOCK}${esc(o.card||o.name)}</b><span class="op-status">${done?'クリア済み':!ok?esc(why):o===nextOp?'次の作戦':''}</span></button>`; };
  const scroll=ol.scrollTop;
  ol.innerHTML=sections.map((s,i)=>{ const open=!save.sortieMenu.closed[s.id], fresh=s.ops.some(sortieUnseen);
    return `<section class="op-section" data-section="${esc(s.id)}"><button class="grp op-tab ${fresh?'unseen':''}" data-op-section="${esc(s.id)}" aria-expanded="${open}" aria-controls="opRows${i}"><span class="op-fold" aria-hidden="true">${open?'−':'＋'}</span><span>${esc(s.id+(s.title?'　'+s.title:''))}</span>${fresh?'<span class="op-new">新規</span>':''}</button><div class="op-rows" id="opRows${i}" ${open?'':'hidden'}>${s.ops.length?s.ops.map(card).join(''):'<p class="empty">準備中</p>'}</div></section>`; }).join('');
  const choose=id=>{ const o=list.find(o=>o.id===id); if(!o||!opOpen(o)) return;
    sortieOp=id; save.sortieMenu.closed[sections.find(s=>s.ops.includes(o)).id]=false; seeSortie([o]); renderSortie(); };
  ol.querySelectorAll('[data-op-section]').forEach(b=>b.onclick=()=>{ const s=sections.find(s=>s.id===b.dataset.opSection), open=!!save.sortieMenu.closed[s.id];
    save.sortieMenu.closed[s.id]=!open; if(open) seeSortie(s.ops); else persist(); renderSortie();
    ol.querySelector(`[data-op-section="${s.id}"]`).focus({preventScroll:true}); });
  ol.querySelectorAll('[data-op]').forEach(b=>b.onclick=()=>{ choose(b.dataset.op); ol.querySelector(`[data-op="${b.dataset.op}"]`).focus({preventScroll:true}); });
  ol.scrollTop=scroll;
  const op=list.find(o=>o.id===sortieOp), done=opDone(op);
  document.getElementById('opDetail').innerHTML=`<span class="ch">${esc(op.tag||op.chapter||'演習　架空の宙域')}</span><h3>${esc(op.name)}</h3>${op.chapter||op.tag?`<span class="when">${esc(op.date)}　${esc(op.start)} 開始</span>`:''}<p>${esc(op.summary)}</p><p class="thr">${scaleText(op)}${esc(op.threat)}</p>`;
  document.getElementById('opReward').innerHTML=op===TUT?'報酬　なし':`報酬　資金 <b>${op.reward||0}</b>${done?`（再戦は${Math.round((op.reward||0)*replayRate(op))}）`:''}`;
  WOS_BG.focus(op,list.filter(o=>o.place&&opOpen(o)),choose);
  const fixedOp=op.forces==='fixed'?op:null;
  const qb=document.getElementById('goQuick'); qb.hidden=!!fixedOp||!!op.chapter||!op.quick;
  if(!qb.hidden) qb.onclick=()=>{ if(window.WOS){ running={quick:true}; window.WOS.start(op.ground?{op:op.id,fleets:op.quick}:{op:op.id}); } };
  document.getElementById('fixedNote').textContent=op.ground&&!fixedOp?`地上軍の全${save.groundOrg.companies.length}個中隊で出撃します。編成が空なら初期部隊を使います。`:fixedOp?'この作戦は決まった艦隊で戦います：'+fixedOp.quick.map(f=>f.name).join('・'):'';
  const btn=document.getElementById('goBattle'); btn.disabled=false;
  btn.onclick=()=>{ if(op===TUT2){ running={op:TUT2_BASE.id,progress:TUT2.id};window.WOS.start({op:TUT2_BASE.id,tutorial:true}); } else if(op.ground){ running={op:op.id};window.WOS.start({op:op.id}); } else if(op===TUT){ if(window.WOS){ running={op:'charybdis',tutorial:true}; window.WOS.start({op:'charybdis',tutorial:true}); } } else if(fixedOp){ if(window.WOS){ running={op:fixedOp.id}; window.WOS.start({op:fixedOp.id, flags:storyFlags()}); } } else { if(!sortieInitialized){ sortieGroups=save.groups[0]?[save.groups[0].id]:[]; sortieInitialized=true; } show('forces'); } };
}
function renderForces(){
  const op=OPS.find(o=>o.id===sortieOp), load=document.getElementById('sgLoad'); load.innerHTML='';
  document.getElementById('forcesName').textContent=(op.chapter||'演習')+'　'+op.name;
  document.getElementById('forcesDetail').innerHTML=`<span class="ch">${esc(op.chapter||'演習')}</span><h3>${esc(op.name)}</h3><p>${scaleText(op)}${esc(op.threat)}</p>`;
  document.getElementById('forcesOrg').hidden=document.getElementById('forcesCreate').hidden=!unlocked('fleet');
  /* several army groups may sortie together while the ships of each branch stay within the limit (user decision 2026-10-04).
     Two groups that share an army cannot go out together: once one is chosen, the other is dimmed */
  sortieGroups=sortieGroups.filter(id=>save.groups.some(g=>g.id===id));
  const el=document.getElementById('sgList');
  /* before 艦隊編集 opens and something is researched, an exercise is fought only with クイック出撃 (user decision 2026-10-13: own army groups after a research) */
  const exOp=OPS.some(o=>o.id===sortieOp&&!o.chapter);
  if(!(exOp?ownExercise():unlocked('fleet'))&&!dbg.free){ el.innerHTML=`<p class="empty">自分の戦区軍での出撃は、${unlocked('fleet')?'技術ツリーで研究を1つ終えると解放':esc(unlockText('fleet'))}。今はクイック出撃（用意された艦隊）で戦えます。</p>`;
    const btn=document.getElementById('forcesBattle'); btn.disabled=true; btn.onclick=null; WOS_DOCK.draw(document.getElementById('dockCanvas'),[]); return; }
  const chosen=sortieGroups.map(id=>save.groups.find(g=>g.id===id)), clashes=g=>!sortieGroups.includes(g.id)&&chosen.some(h=>shareArmy(g,h));
  el.innerHTML=save.groups.length?save.groups.map(g=>{ const arms=groupSummary(g); const ships=arms.reduce((s,a)=>s+armyStats(a).ships,0), on=sortieGroups.includes(g.id), cl=clashes(g);
    return `<button class="sgcard ${on?'sel':''} ${cl?'clash':''}" data-sg="${g.id}" aria-pressed="${on}" ${cl?'disabled':''}>${cl?'<i class="clashnote">同一支隊を含みます</i>':''}<b>${esc(g.name)}</b><em>${arms.length}個打撃群・${ships}隻・速度同期${g.sync?'あり':'なし'}</em><span class="forces-marks">${arms.map(a=>`<i title="${esc(a.name)}">${armyMain(a)?mark(armyMain(a)):''}<small>${esc(shortName(a.name,'打撃群'))}</small></i>`).join('')||'打撃群が未配置'}</span></button>`;}).join('')
    :'<p class="empty">戦区軍がありません。艦隊編集で作成してください。</p>';
  el.querySelectorAll('[data-sg]').forEach(b=>b.onclick=()=>{ const id=b.dataset.sg; sortieGroups=sortieGroups.includes(id)?sortieGroups.filter(x=>x!==id):[...sortieGroups,id]; renderForces(); });
  /* the sortie limit per branch (tech tree), for all the chosen groups together */
  const rows=chosen.length?groupLoad(chosen):[], branchOver=rows.some(r=>r.used>r.cap);
  /* and the battle's scale caps all the ships together (user decision 2026-10-12) */
  const S=scaleOf(OPS.find(o=>o.id===sortieOp)||{}), total=rows.reduce((s,r)=>s+r.used,0), scaleOver=!!S&&total>S.cap, over=branchOver||scaleOver;
  if(chosen.length) load.innerHTML=`<h3><i>LIMIT</i> 出撃上限${chosen.length>1?` <span class="dim">${chosen.length}個戦区軍の合計</span>`:''}</h3><table class="load"><tbody>${rows.map(r=>`<tr class="${r.used>r.cap?'over':''}"><th>${esc(r.name||r.b.name)}</th><td>${r.used} / ${r.cap}隻</td><td class="note">${r.used>r.cap?(branchOpen(r.b)?'上限を超えています':esc(r.b.needText||'未解放')):''}</td></tr>`).join('')}${
    S?`<tr class="scale ${scaleOver?'over':''}"><th>戦闘の規模（${esc(S.name)}）</th><td>${total} / ${S.cap}隻</td><td class="note">${scaleOver?'規模の上限を超えています':'全兵科の合計'}</td></tr>`:''}</tbody></table>${
    over?`<p class="warn">${dbg.free?'デバッグ：出撃上限を無視して出撃できます。':scaleOver&&!branchOver?`この作戦は${esc(S.name)}です。出撃できる艦は合計${S.cap}隻まで。戦区軍を減らすか、艦隊編集で艦を減らしてください。`:'上限を超える兵科があります。艦隊編集で艦を減らすか、技術ツリーで上限を上げてください。'}</p>`:''}`;
  const btn=document.getElementById('forcesBattle'); btn.disabled=!chosen.length||!chosen.some(g=>groupSummary(g).some(a=>armyStats(a).ships>0))||over&&!dbg.free;
  btn.onclick=()=>{ if(prepOn()&&(PREP[prog().prepStep].condition!=='sortie'||sortieOp==='nile')) finishPrep(false); WOS_DOCK.close(); running={op:sortieOp}; startBattle(chosen); };
  const ships=chosen.flatMap(g=>groupSummary(g).flatMap(a=>armyStats(a).bgs.flatMap(b=>Array(b.count).fill(b.type))));
  WOS_DOCK.draw(document.getElementById('dockCanvas'),ships);
}
/* the battle's scale (op.scale, user decision 2026-10-12): its name and the expected length at 1×, shortened by op.pace like the
   clock (user decision 2026-10-15: show the real length) */
const scaleOf=o=>{ const S=D.scales&&D.scales[o.scale]; return S&&o.cap?{...S,cap:o.cap}:S; };   // op.cap: this operation's own sortie limit (第5節 150)
/* the scale's name only: the length it aims at is not shown (user decision 2026-10-30) */
function scaleText(o){ const S=scaleOf(o); return S?`${S.name}　`:''; }
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
      const f=armyToFleet(a,m===fm); f.pos=[gx+d[0],cz+d[2]]; f.alt=d[1]; members.push(fleets.length); offsets.push(d); fleets.push(f); });
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
  const rows=loadRows(n,true);
  document.getElementById('orgCap').innerHTML=`<b>出撃上限（技術ツリー）</b>`+rows.map(r=>`<span class="${r.used>r.cap?'over':''}">${esc(r.name||r.b.name)} <i>${r.used}/${r.cap}隻</i>${branchOpen(r.b)?'':'（未解放）'}</span>`).join('');
}
function renderOrg(){
  document.querySelector('[data-s=org] .back').textContent=orgFromForces?'← 出撃の準備へ':'← メニュー';
  menu.querySelectorAll('[data-org-force]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.orgForce===orgForce)));
  document.getElementById('orgUnitTabs').innerHTML=orgForce==='ground'?
    Object.entries(GROUND_LEVELS).map(([k,v])=>`<button role="tab" data-ground-tab="${k}" aria-selected="${k===groundTab}">${v}</button>`).join(''):
    `<button role="tab" data-tab="group">戦区軍</button><button role="tab" data-tab="army">打撃群</button>`;
  if(orgForce==='ground'){ renderGroundOrg(); return; }
  refreshAutoNames();
  menu.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
  document.getElementById('tabNote').textContent=NOTES[tab]; updateOrgCap();
  ({bg:renderBgTab,army:renderArmyTab,group:renderGroupTab})[tab]();
}
const GROUND_LEVELS={brigades:'旅団',battalions:'大隊',companies:'中隊'};
function groundOrgTree(org,level,id){
  const x=org[level].find(x=>x.id===id); if(!x) return '';
  const child=level==='brigades'?'battalions':level==='battalions'?'companies':null;
  return `<div class="ground-org-node"><button class="li" data-ground-pick="${level}" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><span>${child?`${x[child].length}個${GROUND_LEVELS[child]}`:esc(GROUND.types()[x.kind].name)}</span></button>${child?x[child].map(id=>groundOrgTree(org,child,id)).join(''):''}</div>`;
}
function renderGroundOrg(){
  const org=save.groundOrg, level=groundTab, label=GROUND_LEVELS[level], items=org[level];
  if(!items.some(x=>x.id===selGround)) selGround=items[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  document.getElementById('tabNote').textContent='中隊が最小の操作単位です。大隊・旅団を解散しても所属部隊は残ります。';
  document.getElementById('orgCap').innerHTML=`<b>地上軍</b><span>大隊は${GROUND.MAX_COMPANIES}個中隊まで・旅団は${GROUND.MAX_BATTALIONS}個大隊まで（仮）</span><span>出撃：全${org.companies.length}個中隊${org.companies.length?'':'（空なら初期部隊）'}</span>`;
  list.innerHTML=listHtml(items.map(x=>({id:x.id,name:x.name,meta:level==='companies'?esc(GROUND.types()[x.kind].name):`${x[level==='brigades'?'battalions':'companies'].length}個${level==='brigades'?'大隊':'中隊'}`})),selGround,`＋ ${label}を作る`,'data-ground-unit');
  list.querySelector('[data-new]').onclick=()=>{
    const prefix={companies:'gc',battalions:'gb',brigades:'gr'}[level]; let id; do{id=newId(prefix);}while(items.some(x=>x.id===id));
    let n=1;while(items.some(x=>x.name===`第${n} ${label}`))n++;
    const x={id,name:`第${n} ${label}`}; if(level==='companies')x.kind='infantry';else x[level==='brigades'?'battalions':'companies']=[];
    items.push(x);selGround=id;persist();renderOrg();
  };
  list.querySelectorAll('[data-ground-unit]').forEach(b=>b.onclick=()=>{selGround=b.dataset.groundUnit;confirmDel=null;renderOrg();});
  const x=items.find(x=>x.id===selGround);if(!x){det.innerHTML=`<p class="empty">${label}を作ってください。</p>`;return;}
  const child=level==='brigades'?'battalions':level==='battalions'?'companies':null;
  const parent=level==='companies'?'battalions':level==='battalions'?'brigades':null;
  const childMax=level==='brigades'?GROUND.MAX_BATTALIONS:GROUND.MAX_COMPANIES;
  const owner=(lv,id)=>org[lv==='companies'?'battalions':'brigades'].find(p=>p[lv].includes(id));
  det.innerHTML=`<div class="dzh"><div class="tg">${label}</div><label class="fld">名前<input id="groundName" maxlength="40" value="${esc(x.name)}"></label>${delBtn('ground:'+x.id,level==='companies'?'削除':'解散')}</div>
    <div class="dzb"><div>${groundOrgTree(org,level,x.id)}</div><div class="dpanel">
    ${level==='companies'?`<label class="fld">兵科<select id="groundKind">${Object.entries(GROUND.types()).map(([k,u])=>`<option value="${k}" ${k===x.kind?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label>`:''}
    ${parent?`<label class="fld">所属${GROUND_LEVELS[parent]}<select id="groundParent"><option value="">未所属</option>${org[parent].map(p=>{const full=p[level].length>=(level==='companies'?GROUND.MAX_COMPANIES:GROUND.MAX_BATTALIONS),on=p[level].includes(x.id);return `<option value="${esc(p.id)}" ${on?'selected':''} ${full&&!on?'disabled':''}>${esc(p.name)}${full?'（満員）':''}</option>`;}).join('')}</select></label>`:''}
    ${child?`<h4>所属${GROUND_LEVELS[child]} ${x[child].length}/${childMax}</h4>${x[child].map(id=>`<button data-ground-out="${esc(id)}">${esc(org[child].find(c=>c.id===id).name)}を外す</button>`).join('')}
    <label class="fld">${GROUND_LEVELS[child]}を追加・移す<select id="groundAdd" ${x[child].length>=childMax?'disabled':''}><option value="">選んでください</option>${org[child].filter(c=>!x[child].includes(c.id)).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}（${esc(owner(child,c.id)?.name||'未所属')}）</option>`).join('')}</select></label>`:''}
    <p class="dim small">実装済みの兵科のみ選べます。宇宙軍の研究・編成ボーナスは適用しません。</p></div></div>`;
  det.querySelector('#groundName').onchange=e=>{x.name=e.target.value.trim()||x.name;persist();renderOrg();};
  const kind=det.querySelector('#groundKind');if(kind)kind.onchange=()=>{if(GROUND.types()[kind.value])x.kind=kind.value;persist();renderOrg();};
  const par=det.querySelector('#groundParent');if(par)par.onchange=()=>{GROUND.assign(org,level,x.id,par.value);persist();renderOrg();};
  const add=det.querySelector('#groundAdd');if(add)add.onchange=()=>{if(add.value)GROUND.assign(org,child,add.value,x.id);persist();renderOrg();};
  det.querySelectorAll('[data-ground-out]').forEach(b=>b.onclick=()=>{GROUND.assign(org,child,b.dataset.groundOut,'');persist();renderOrg();});
  det.querySelectorAll('[data-ground-pick]').forEach(b=>b.onclick=()=>{groundTab=b.dataset.groundPick;selGround=b.dataset.id;confirmDel=null;renderOrg();});
  wireDel(det,'ground:'+x.id,()=>{GROUND.remove(org,level,x.id);selGround=null;});
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
function unitDisplay(name, level){
  const m=/^第(\d+)(?:\s+(.+?))?\s+(支隊|打撃群|戦区軍)$/.exec(name);
  if(!m) return `<b>${esc(name)}</b>`;
  const no=`第${m[1]}${level}`, role=m[2]||'';
  if(opt.unitFmt==='name') return `<b>${esc(name)}</b>`;
  return `<b>${esc(no)}</b>${opt.unitFmt==='both'&&role?`<small>${esc(role)}</small>`:''}`;
}
/* the name field shows the short form 第N打撃群 (user decision 2026-11-04): a 第N entry keeps the role in the stored name
   第N 役割 打撃群, anything else is kept as a name of its own (named units such as アルバレス隊) */
function shortName(name,level){ const m=/^第(\d+)(?:\s+(.+?))?\s+(支隊|打撃群|戦区軍)$/.exec(name); return m?`第${m[1]}${level}`:name; }
function unitRole(name){ const m=/^第\d+\s+(.+?)\s+(支隊|打撃群|戦区軍)$/.exec(name||''); return m?m[1]:''; }
function longName(v,level,role){ const m=new RegExp(`^第\\s*(\\d+)\\s*(?:${level})?$`).exec(v.trim()); return m?`第${m[1]} ${role?role+' ':''}${level}`:v.trim(); }
/* the role shown under a strike group's mark on the theater army grid: from its name, or for a named one from its main class */
function armyRole(a){ return unitRole(a.name)||(UNAMES.earth[armyMain(a)]||[])[1]?.[1]||''; }
function relabel(li,name,level){ li.querySelectorAll(':scope>b,:scope>small').forEach(e=>e.remove()); li.insertAdjacentHTML('afterbegin',unitDisplay(name,level)); }
function orgBars(st){ return `<dl class="orgstats">${[...STATS,{k:'spd',n:'速度'}].map(x=>`<div><dt>${x.n}</dt><dd><span class="seg" style="--v:${Math.min(100,Math.max(0,st[x.k]*10))}%"></span></dd><span>${st[x.k].toFixed(1)}</span></div>`).join('')}</dl>`; }
function armyMarks(a){ return a.bgs.map(bgById).filter(Boolean).map(b=>mark(b.type)).join(''); }
function renderArmyTab(){
  if(!armyById(selArmy)) selArmy=save.armies[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  list.innerHTML='<button class="new" data-new>＋ 打撃群を作る</button>'+save.armies.map(a=>`<button class="li ${a.id===selArmy?'sel':''}" data-army="${a.id}">${unitDisplay(a.name,'打撃群')}<span>${armyMarks(a)} ${armyStats(a).ships}隻</span></button>`).join('');
  list.querySelector('[data-new]').onclick=()=>{ const a={id:newId('a'),name:unitName('army',null,new Set(save.armies.map(x=>unitNo(x.name)))),bgs:[],auto:''}; save.armies.push(a); selArmy=a.id; persist(); renderOrg(); };
  list.querySelectorAll('[data-army]').forEach(x=>x.onclick=()=>{ selArmy=x.dataset.army; confirmDel=null; renderOrg(); });
  const a=armyById(selArmy); if(!a){ det.innerHTML='<p class="empty">打撃群を作ってください。</p>'; return; }
  const {st,ships,active,hangar}=armyStats(a);
  const options=t=>SHIPS.filter(s=>typeOpen(s.id)||s.id===t).map(s=>`<option value="${s.id}" ${s.id===t?'selected':''}>${s.name}</option>`).join('');
  const rows=Array.from({length:MAX_BG},(_,i)=>{ const b=bgById(a.bgs[i]);
    if(!b) return `<div class="tr empty"><div class="th">${i===a.bgs.length?`<select id="addBg" aria-label="支隊を加える"><option value="">＋ 支隊を加える</option>${SHIPS.filter(s=>typeOpen(s.id)).map(s=>`<option value="new:${s.id}">${s.name}</option>`).join('')}</select>`:'空き'}</div></div>`;
    return `<div class="tr"><div class="th"><span class="no">${unitDisplay(b.name,'支隊')}</span><select data-type="${b.id}" aria-label="艦種">${options(b.type)}</select><button class="x" data-rm="${b.id}" aria-label="この支隊を消す">×</button></div><div class="cells">${Array.from({length:12},(_,k)=>k>=SHIP[b.type].max?'<span class="sc nx"></span>':`<button class="sc ${k<b.count?'on':''}" data-count="${b.id}" data-n="${k+1}" aria-label="${k+1}隻にする">${k<b.count?mark(b.type):'＋'}</button>`).join('')}</div><span class="ct">${b.count}<small>/${SHIP[b.type].max}</small></span></div>`; }).join('');
  det.innerHTML=`<div class="dzh"><div class="tg">${unitDisplay(a.name,'打撃群')}</div><label class="fld">名前<input id="armyName" maxlength="20" value="${esc(shortName(a.name,'打撃群'))}"></label><button data-copy>複製</button>${delBtn('army:'+a.id,'解散')}</div><div class="dzb"><div><h4>支隊　<span class="dim">マスを押して隻数を変える</span></h4>${rows}</div><div class="dpanel"><h4>打撃群の能力</h4><p>総数 ${ships}隻　搭載 ${hangarStr(hangar)||'なし'}</p>${orgBars(st)}<h4>編成ボーナス</h4><div class="bl">${BONUSES.map(bn=>`<div class="bon ${active.includes(bn)?'on':''}" title="${esc(bn.cond)}"><b>${bn.name}</b><em>${bn.eff}</em></div>`).join('')}</div></div></div>`;
  const role=armyRole(a);
  det.querySelector('#armyName').oninput=e=>{ a.name=longName(e.target.value,'打撃群',role)||'無名の打撃群'; delete a.auto; persist();
    det.querySelector('.tg').innerHTML=unitDisplay(a.name,'打撃群'); relabel(list.querySelector(`[data-army="${a.id}"]`),a.name,'打撃群'); };
  const add=det.querySelector('#addBg'); if(add) add.onchange=()=>{ if(!add.value)return; let id=add.value; if(id.startsWith('new:')){const type=id.slice(4), b={id:newId('bg'),name:nextBgName(type),type,count:Math.min(4,SHIP[type].max),auto:true}; save.bgs.push(b); id=b.id;} a.bgs.push(id); persist(); renderOrg(); };
  det.querySelectorAll('[data-type]').forEach(x=>x.onchange=()=>{const b=bgById(x.dataset.type); b.type=x.value; b.count=Math.min(b.count,SHIP[b.type].max); if(b.auto)b.name=nextBgName(b.type,b); persist(); renderOrg();});
  det.querySelectorAll('[data-count]').forEach(x=>x.onclick=()=>{bgById(x.dataset.count).count=+x.dataset.n; persist(); renderOrg();});
  det.querySelectorAll('[data-rm]').forEach(x=>x.onclick=()=>{a.bgs=a.bgs.filter(id=>id!==x.dataset.rm); save.bgs=save.bgs.filter(b=>b.id!==x.dataset.rm); persist(); renderOrg();});
  det.querySelector('[data-copy]').onclick=()=>{const bs=a.bgs.map(bgById).filter(Boolean).map(b=>{const c={...b,id:newId('bg'),name:nextBgName(b.type),auto:true};save.bgs.push(c);return c.id;}); const copy={id:newId('a'),name:unitName('army',null,new Set(save.armies.map(x=>unitNo(x.name)))),bgs:bs,auto:''};save.armies.push(copy);selArmy=copy.id;persist();renderOrg();};
  wireDel(det,'army:'+a.id,()=>{ save.groups.forEach(g=>g.members=g.members.filter(m=>m.army!==a.id)); save.bgs=save.bgs.filter(b=>!a.bgs.includes(b.id)); save.armies=save.armies.filter(x=>x!==a); selArmy=null; });
}

/* army groups */
function renderGroupTab(){
  if(!save.groups.find(g=>g.id===selGroup)) selGroup=save.groups[0]?.id||null;
  const list=document.getElementById('orgList'), det=document.getElementById('orgDetail');
  list.innerHTML='<button class="new" data-new>＋ 戦区軍を作る</button>'+save.groups.map(g=>`<button class="li ${g.id===selGroup?'sel':''}" data-grp="${g.id}">${unitDisplay(g.name,'戦区軍')}<span>打撃群${g.members.length}/${MAX_ARMY}・速度同期${g.sync?'あり':'なし'}</span></button>`).join('');
  list.querySelector('[data-new]').onclick=()=>{ const g={id:newId('g'),name:unitName('group',null,new Set(save.groups.map(x=>unitNo(x.name)))),sync:true,members:[],auto:''}; save.groups.push(g); selGroup=g.id; persist(); renderOrg(); };
  list.querySelectorAll('[data-grp]').forEach(x=>x.onclick=()=>{ selGroup=x.dataset.grp; placing=null; orgPop=null; confirmDel=null; renderOrg(); });
  const g=save.groups.find(x=>x.id===selGroup);
  if(!g){ det.innerHTML='<p class="empty">戦区軍がありません。左の「戦区軍を作る」から追加してください。</p>'; preview.set(null); return; }
  if(placing!=null&&!g.members[placing]) placing=null;
  const avail=save.armies.filter(a=>!g.members.some(m=>m.army===a.id));
  const fi=flagIndex(g);
  const chips=g.members.map((m,i)=>{ const a=armyById(m.army), st=a?armyStats(a):null;
    return `<div data-chip-army="${esc(m.army)}" class="chip ${placing===i?'sel':''}" style="--c:${GROUP_COLORS[i]}"><button class="pick" data-pick="${i}" aria-pressed="${placing===i}">${a?unitDisplay(a.name,'打撃群'):'?'}</button><span class="cm">${a?armyMarks(a):''}</span><span class="rs">${st?`${st.ships}隻・速度${st.st.spd.toFixed(0)}`:''}</span><span class="rp">${'ABCDE'[m.x]}${m.z+1}・高さ${m.y+1}</span><button class="flg" data-flag="${i}" aria-pressed="${i===fi}" title="${D.flagBonus?`旗艦の打撃群は${esc(D.flagBonus.eff)}（攻撃・防御・回避・射程・視界・隠蔽性）`:''}">${i===fi?'★ 旗艦':'☆ 旗艦にする'}</button><button class="x" data-out="${i}" aria-label="外す">外す</button></div>`; }).join('');
  const cells=[];
  for(let z=0;z<CUBE;z++) for(let x=0;x<CUBE;x++){
    const here=g.members.findIndex(m=>m.x===x&&m.z===z&&m.y===layer);
    const other=g.members.findIndex(m=>m.x===x&&m.z===z&&m.y!==layer), ha=here>=0&&armyById(g.members[here].army);
    cells.push(`<button class="cell ${here>=0&&placing===here?'sel':''}" data-cx="${x}" data-cz="${z}" style="${here>=0?`--c:${GROUP_COLORS[here]}`:other>=0?`--o:${GROUP_COLORS[other]}`:''}" ${here>=0?'data-on':''} ${other>=0&&here<0?'data-other':''} aria-label="${'ABCDE'[x]}${z+1}" ${ha?`title="${esc(shortName(ha.name,'打撃群'))}"`:''}>${ha?`${armyMain(ha)?mark(armyMain(ha)):''}<span class="rl">${esc(armyRole(ha))}</span>`:''}</button>`);
  }
  const slowest=g.members.map(m=>armyById(m.army)).filter(Boolean).map(a=>armyStats(a).st.spd).filter(v=>v>0);
  det.innerHTML=`
    <div class="arow"><label class="fld">名前<input id="grpName" maxlength="20" value="${esc(shortName(g.name,'戦区軍'))}"></label>
    <label class="sw"><input type="checkbox" id="grpSync" ${g.sync?'checked':''}> 移動時は最も遅い艦に速度を合わせる <span class="dim">${slowest.length?`（この戦区軍では速度${Math.min(...slowest).toFixed(0)}）`:''}</span></label></div>
    <div class="cubeed">
      <div class="layer">
        <div class="lyr" role="group" aria-label="高さの段">${[4,3,2,1,0].map(y=>`<button data-ly="${y}" aria-pressed="${y===layer}">${y+1}${y===4?' 上':y===0?' 下':''}</button>`).join('')}</div>
        <div class="gridwrap"><p class="front">▲ 前方（敵側）</p><div class="grid">${cells.join('')}</div>${orgPop?`<div class="orgpop"><b>${'ABCDE'[orgPop.x]}${orgPop.z+1}・高さ${layer+1}</b>${avail.map(a=>`<button data-addarmy="${a.id}" ${g.members.length>=MAX_ARMY?'disabled':''}>${unitDisplay(a.name,'打撃群')} ${armyMarks(a)}</button>`).join('')||'<span>追加できる打撃群がありません</span>'}${g.members.length>=MAX_ARMY?'<span>所属は5つまで</span>':''}${placing!=null?'<button data-move>選択中の打撃群をここへ移す</button>':''}<button data-close>やめる</button></div>`:''}<p class="dim small">点線の枠は別の高さにいる打撃群です</p></div>
      </div>
      <div class="pv"><canvas id="cubeCv" aria-label="配置の立体表示（ドラッグで回転）"></canvas><p class="dim small">ドラッグで回転</p></div>
    </div>
    <h4>所属する打撃群（${g.members.length}/${MAX_ARMY}）</h4><div class="chips">${chips}</div>
    <div class="row">${delBtn('grp:'+g.id,'この戦区軍を削除する')}</div>`;
  const grole=unitRole(g.name)||(UNAMES.earth[groupMain(g)]||[])[0]?.[1]||'';
  det.querySelector('#grpName').oninput=e=>{ g.name=longName(e.target.value,'戦区軍',grole)||'無名の戦区軍'; delete g.auto; persist(); relabel(list.querySelector(`[data-grp="${g.id}"]`),g.name,'戦区軍'); };
  det.querySelector('#grpSync').onchange=e=>{ g.sync=e.target.checked; persist(); renderOrg(); };
  det.querySelectorAll('[data-pick]').forEach(x=>x.onclick=()=>{ placing=+x.dataset.pick; layer=g.members[placing].y; orgPop=null; renderOrg(); });
  det.querySelectorAll('[data-out]').forEach(x=>x.onclick=()=>{ const [m]=g.members.splice(+x.dataset.out,1); if(m&&m.army===g.flag) delete g.flag; placing=null; orgPop=null; persist(); renderOrg(); });
  det.querySelectorAll('[data-flag]').forEach(x=>x.onclick=()=>{ g.flag=g.members[+x.dataset.flag].army; persist(); renderOrg(); });
  det.querySelectorAll('[data-ly]').forEach(x=>x.onclick=()=>{ layer=+x.dataset.ly; orgPop=null; renderOrg(); });
  det.querySelectorAll('[data-cx]').forEach(c=>c.onclick=()=>{ const x=+c.dataset.cx,z=+c.dataset.cz,occ=g.members.findIndex(m=>m.x===x&&m.z===z&&m.y===layer); if(occ>=0){placing=occ;orgPop=null;}else orgPop={x,z}; renderOrg(); });
  det.querySelectorAll('[data-addarmy]').forEach(x=>x.onclick=()=>{if(g.members.length>=MAX_ARMY||!orgPop)return;g.members.push({army:x.dataset.addarmy,x:orgPop.x,y:layer,z:orgPop.z});placing=g.members.length-1;orgPop=null;persist();renderOrg();});
  const move=det.querySelector('[data-move]'); if(move) move.onclick=()=>{Object.assign(g.members[placing],{x:orgPop.x,y:layer,z:orgPop.z});orgPop=null;persist();renderOrg();};
  const close=det.querySelector('[data-close]'); if(close) close.onclick=()=>{orgPop=null;renderOrg();};
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
let dataSort=null;
function renderData(){
  const list=[...SHIPS]; if(dataSort) list.sort((a,b)=>b[dataSort]-a[dataSort]);
  document.getElementById('shipTbl').innerHTML=`<thead><tr><th>艦種</th>${STATS.map(s=>`<th><button data-sort="${s.k}">${s.n}</button></th>`).join('')}<th><button data-sort="spd">速度</button></th><th><button data-sort="max">最大隻数</button></th><th>搭載</th></tr></thead><tbody>${list.map(s=>`<tr><th>${mark(s.id)} ${s.name}<small>${s.note}</small></th>${STATS.map(k=>`<td><span class="seg" style="--v:${s[k.k]*10}%"></span>${s[k.k]}</td>`).join('')}<td>${s.spd}</td><td>${s.max}</td><td>${hangarStr(s.hangar)||'—'}</td></tr>`).join('')}</tbody>`;
  document.querySelectorAll('#shipTbl [data-sort]').forEach(b=>b.onclick=()=>{dataSort=dataSort===b.dataset.sort?null:b.dataset.sort; renderData();});
  document.getElementById('bonusTbl').innerHTML=`<thead><tr><th>名前</th><th>条件</th><th>効果</th></tr></thead><tbody>${BONUSES.map(b=>`<tr><th>${b.name}</th><td>${b.cond}</td><td>${b.eff}</td></tr>`).join('')}</tbody>`;
}

/* back to the menu from the battle */
/* Enter decides: 出撃 on the sortie screen, 研究する on the tech tree (user decision 2026-10-04). Called by battle/scene.js while the menu is open */
function onKey(e){
  if(e.isComposing||menu.hidden||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target&&e.target.tagName||'')) return;
  const section=e.target&&e.target.closest&&e.target.closest('[data-op-section]');
  // scene.js intercepts keydown before it reaches the button. Activate it here, once per press.
  if(section){
    if(e.key==='Enter'||e.key===' '){ e.preventDefault(); if(!e.repeat) section.click(); }
    return;
  }
  if(e.key!=='Enter') return;
  const b=screen==='sortie'?document.getElementById('goBattle'):screen==='forces'?document.getElementById('forcesBattle'):screen==='tech'?document.getElementById('tRes'):null;
  if(b&&!b.disabled){ e.preventDefault(); b.click(); }
}
window.WOS_MENU={ setAuto(value){dbg.auto=!!value;persistDbg();renderDebug();}, open(){ menu.hidden=false; show('title'); }, onEnd, onKey,
  groundConfig(cfg){ return {...cfg,groundOrg:GROUND.normalize(save.groundOrg)}; } };
render();
{const groundPreview=new URLSearchParams(location.search).get('ground'),previewOps={exercise2:'groundExercise2',field150:'groundfield150',field300:'groundfield300'};if(previewOps[groundPreview])window.WOS.start({op:previewOps[groundPreview]});}
})();
