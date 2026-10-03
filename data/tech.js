/* War of Space data: unlocks, rewards and the tech tree. All values are provisional (see docs/menu.md).
   Classic script loaded before battle/ and prep.js; everything goes into window.WOS_DATA. */
window.WOS_DATA=window.WOS_DATA||{};

/* メニューの画面の解放。値の作戦（data/operations.js の id）をクリアすると使えるようになる */
WOS_DATA.unlocks={fleet:'retreat', tech:'retreat'};

/* 作戦の報酬（資金）は data/operations.js の reward。2回目からのクリアは replay の割合だけもらえる。
   敗北と中止は報酬なし。クイック戦闘は進行にも報酬にも数えない */
WOS_DATA.reward={replay:.5};

/* 能力の研究（ユーザー決定 2026-10-03）。data/ships.js の能力値は研究をすべて終えた最終形態（最大）で、
   自分で編成した艦隊は最初その base の割合（3割）から始まり、研究した節点の add の分だけ最大へ近づく（全部で10割）。
   決まった艦隊（ストーリーの作戦、友軍、クイック戦闘）と敵には効かない。敵は作戦ごとの強さで、章が進むと強くなる */
WOS_DATA.techStat={base:.3};

/* 技術ツリーのタブ。地上軍は将来入れる（今は中身なし） */
WOS_DATA.techForces=[
  {id:'space',  name:'宇宙軍'},
  {id:'ground', name:'地上軍', soon:'地上戦（第二章〜）で導入予定。'},
];

/* 宇宙軍の技術ツリー（どの兵科も同じ形。名前の {gun} は兵科の主兵装の名前に置き換わる）。年は A.E.（開戦は A.E.45）。
   id: 保存データが使う名前（変えると研究済みが消える）　icon: 節点の絵（cap gun aim armor engine sensor stealth flak fighter was deck supply）
   col / row: 画面上の位置（列は左から、行は上から）　req: 先に研究が要る節点（すべて）。空なら最初から研究できる
   cap: 兵科の出撃上限の段階（下の branches の steps の番号。資金もそこの cost）
   add: 研究すると能力が最大の何割ぶん上がるか（同じ能力の合計が 1 - techStat.base になるように置く）
   cost: 資金（兵科の costMul を掛ける）
   only: この兵科にだけ出す（branches の id）　craft: 艦ではなく、その小型機（data/ships.js の crafts）の能力を上げる。
     小型機の値も最終形態で、自分で編成した艦隊の小型機は最初 techStat.base の割合 */
WOS_DATA.techTree=[
  {id:'cap1',  name:'第一次艦隊動員計画',   icon:'cap',     col:0, row:0, req:[],               cap:1},
  {id:'cap2',  name:'第二次艦隊動員計画',   icon:'cap',     col:3, row:0, req:['cap1','eng1'],  cap:2},
  {id:'cap3',  name:'総力戦動員計画',       icon:'cap',     col:6, row:0, req:['cap2','def3'],  cap:3},
  {id:'gun1',  name:'38式 {gun}',           icon:'gun',     col:0, row:1, req:[],               add:{atk:.1},  cost:60},
  {id:'gun2',  name:'42式改 {gun}',         icon:'gun',     col:2, row:1, req:['gun1'],         add:{atk:.15}, cost:130},
  {id:'gun3',  name:'45式 高出力{gun}',     icon:'gun',     col:4, row:1, req:['gun2','eng2'],  add:{atk:.2},  cost:240},
  {id:'gun4',  name:'試製47式 {gun}',       icon:'gun',     col:6, row:1, req:['gun3','rng2'],  add:{atk:.25}, cost:420},
  {id:'rng1',  name:'40式 射撃管制装置',    icon:'aim',     col:1, row:2, req:['gun1'],         add:{rng:.2},  cost:90},
  {id:'rng2',  name:'44式 長距離照準儀',    icon:'aim',     col:3, row:2, req:['rng1','vis2'],  add:{rng:.25}, cost:180},
  {id:'rng3',  name:'46式 統合火器管制',    icon:'aim',     col:5, row:2, req:['rng2','vis3'],  add:{rng:.25}, cost:320},
  {id:'def1',  name:'38式 複合装甲板',      icon:'armor',   col:0, row:3, req:[],               add:{def:.1},  cost:60},
  {id:'def2',  name:'42式 積層装甲',        icon:'armor',   col:2, row:3, req:['def1'],         add:{def:.15}, cost:130},
  {id:'def3',  name:'45式 電磁反応装甲',    icon:'armor',   col:4, row:3, req:['def2','eng1'],  add:{def:.2},  cost:240},
  {id:'def4',  name:'試製47式 偏向力場装甲', icon:'armor',  col:6, row:3, req:['def3','eng2'],  add:{def:.25}, cost:420},
  {id:'eng1',  name:'D-RAMS 第2世代推進器', icon:'engine',  col:1, row:4, req:['def1'],         add:{eva:.2,spd:.2},   cost:90},
  {id:'eng2',  name:'D-RAMS 第3世代推進器', icon:'engine',  col:3, row:4, req:['eng1','def2'],  add:{eva:.25,spd:.25}, cost:180},
  {id:'eng3',  name:'D-RAMS 高機動改修',    icon:'engine',  col:5, row:4, req:['eng2','stl2'],  add:{eva:.25,spd:.25}, cost:320},
  {id:'vis1',  name:'39式 光学探査儀',      icon:'sensor',  col:0, row:5, req:[],               add:{vis:.2},  cost:60},
  {id:'vis2',  name:'43式 航跡探知機',      icon:'sensor',  col:2, row:5, req:['vis1'],         add:{vis:.25}, cost:130},
  {id:'vis3',  name:'46式 広域索敵網',      icon:'sensor',  col:4, row:5, req:['vis2','rng1'],  add:{vis:.25}, cost:240},
  {id:'stl1',  name:'40式 低放射塗装',      icon:'stealth', col:1, row:6, req:['vis1'],         add:{stl:.2},  cost:90},
  {id:'stl2',  name:'44式 排熱遮蔽外殻',    icon:'stealth', col:3, row:6, req:['stl1','def2'],  add:{stl:.25}, cost:180},
  {id:'stl3',  name:'試製47式 航跡攪乱装置', icon:'stealth', col:5, row:6, req:['stl2','vis3'], add:{stl:.25}, cost:320},
  {id:'aa1',   name:'40式 対空機銃',        icon:'flak',    col:1, row:7, req:['gun1'],         add:{aa:.2},   cost:90},
  {id:'aa2',   name:'44式 対空誘導弾',      icon:'flak',    col:3, row:7, req:['aa1','vis2'],   add:{aa:.25},  cost:180},
  {id:'aa3',   name:'46式 近接防御網',      icon:'flak',    col:5, row:7, req:['aa2','rng2'],   add:{aa:.25},  cost:320},
  /* 小型機の機体。艦載機は母艦、W.A.S. は W.A.S. 部隊（data/ships.js の crafts の branch）。craft の小型機の火力 dmg・耐久 hp・回避 eva が上がる。
     強襲母艦の艦載機にも母艦の研究が効く */
  {id:'ftr1',  name:'F-38 アクィラ',        icon:'fighter', col:0, row:8, req:[],               only:['carrier'], craft:'ftr', add:{dmg:.2,hp:.2,eva:.2},    cost:80},
  {id:'ftr2',  name:'F-42 ファルコ',        icon:'fighter', col:2, row:8, req:['ftr1','eng1'],  only:['carrier'], craft:'ftr', add:{dmg:.25,hp:.25,eva:.25}, cost:160},
  {id:'ftr3',  name:'F-46 ハルピュイア',    icon:'fighter', col:4, row:8, req:['ftr2','aa2'],   only:['carrier'], craft:'ftr', add:{dmg:.25,hp:.25,eva:.25}, cost:280},
  {id:'was1',  name:'W-21 ルクス',          icon:'was',     col:1, row:9, req:['def1'],         only:['was'], craft:'was', add:{dmg:.2,hp:.2,eva:.2},    cost:120},
  {id:'was2',  name:'W-24 ノクス',          icon:'was',     col:3, row:9, req:['was1','eng1'],  only:['was'], craft:'was', add:{dmg:.25,hp:.25,eva:.25}, cost:200},
  {id:'was3',  name:'W-27 ウンブラ',        icon:'was',     col:5, row:9, req:['was2','def3'],  only:['was'], craft:'was', add:{dmg:.25,hp:.25,eva:.25}, cost:320},
  /* 母艦の運用（母艦と W.A.S. 部隊だけ）。craft:'all' はその兵科の艦が積む小型機すべて。
     out: 同時に出撃できる隊の数が1つ増える（data/ships.js の maxOut が最終形態。研究前は out の節点の数だけ少ない、最低1隊）
     turn: 補給（帰還後の整備 rearm と次の隊の発進間隔 cd）が速くなる。速さは techStat.base から始まり、時間は data の値 ÷ 速さ */
  {id:'out1',  name:'第2飛行甲板増設',      icon:'deck',    col:2, row:10, req:['turn1','def2'], only:['carrier','was'], craft:'all', add:{out:1},     cost:200},
  {id:'out2',  name:'多層格納甲板',          icon:'deck',    col:5, row:10, req:['out1','eng2'],  only:['carrier','was'], craft:'all', add:{out:1},     cost:360},
  {id:'turn1', name:'40式 自動補給機構',     icon:'supply',  col:1, row:11, req:['def1'],         only:['carrier','was'], craft:'all', add:{turn:.2},   cost:90},
  {id:'turn2', name:'44式 高速整備ライン',   icon:'supply',  col:3, row:11, req:['turn1','eng1'], only:['carrier','was'], craft:'all', add:{turn:.25},  cost:180},
  {id:'turn3', name:'46式 無人整備システム', icon:'supply',  col:5, row:11, req:['turn2','out1'], only:['carrier','was'], craft:'all', add:{turn:.25},  cost:320},
];

/* 兵科（宇宙軍）。技術ツリーの左の縦の欄で選ぶ単位（物語で解放されていない兵科は出さない）。
   gun: 技術ツリーの名前に入る主兵装
   軍集団で出撃するとき、艦の数を兵科ごとに cap 隻までに抑える（出撃上限）。
   types: 含む艦種（data/ships.js の id）
   steps: 技術ツリーの段階 [{cap, cost}]。最初の段階は最初から持っている。cost の資金で次の段階を研究する
   need / needText: 物語で解放されるまで上限0で研究もできない（need は進行の旗の名前）。needText はその説明
   costMul: この兵科の研究（techTree の cost）に掛ける倍率
   今は巡洋艦まで解放済み（ユーザー決定 2026-10-03）。戦艦・母艦・W.A.S. 部隊は物語の旗 need で解放する */
WOS_DATA.branches=[
  {id:'escort',  name:'護衛艦艇',   gun:'速射レーザー砲', costMul:1, types:['cv','ff'], steps:[{cap:24},{cap:36,cost:200},{cap:48,cost:400},{cap:64,cost:800}]},
  {id:'dd',      name:'駆逐艦',     gun:'誘導魚雷',       costMul:1, types:['dd'],      steps:[{cap:16},{cap:24,cost:200},{cap:32,cost:400},{cap:48,cost:800}]},
  {id:'cruiser', name:'巡洋艦',     gun:'荷電粒子砲',     costMul:1.5, types:['cl'],      steps:[{cap:6},{cap:10,cost:300},{cap:14,cost:600},{cap:20,cost:1000}]},
  {id:'bb',      name:'戦艦',       gun:'大口径主砲',     costMul:2, need:'bb', needText:'物語で解放（時期は未定）', types:['bb'],      steps:[{cap:4},{cap:6,cost:400},{cap:8,cost:800},{cap:12,cost:1200}]},
  {id:'carrier', name:'母艦',       gun:'艦載機兵装',     costMul:2, need:'carrier', needText:'物語で解放（時期は未定）', types:['cvb'],     steps:[{cap:2},{cap:3,cost:400},{cap:4,cost:800},{cap:6,cost:1200}]},
  {id:'was',     name:'W.A.S. 部隊', gun:'W.A.S.兵装',   costMul:2, types:['mas','masc'], need:'was', needText:'物語で解放（第二章後半〜第三章の予定）',
                 steps:[{cap:8},{cap:12,cost:500},{cap:16,cost:1000},{cap:24,cost:1500}]},
];
