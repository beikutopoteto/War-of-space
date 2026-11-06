/* War of Space data: unlocks, rewards and the tech tree. All values are provisional (see docs/menu.md).
   Classic script loaded before battle/ and prep.js; everything goes into window.WOS_DATA. */
window.WOS_DATA=window.WOS_DATA||{};

/* メニューの画面の解放。値の作戦（data/operations.js の id）をクリアすると使えるようになる */
WOS_DATA.unlocks={fleet:'retreat', tech:'retreat'};

/* 作戦の報酬（資金）は data/operations.js の reward。2回目からのクリアは replay（演習は exercise）の割合だけもらえる
   （ユーザー決定 2026-11-06: 再戦は前の 1/2 の 1/3＝初回の1/6、演習の再戦は初回の2/3）。
   敗北と中止は報酬なし。クイック出撃は進行にも報酬にも数えない */
WOS_DATA.reward={replay:1/6, exercise:2/3};

/* 能力の研究（ユーザー決定 2026-10-03）。data/ships.js の能力値は研究をすべて終えた最終形態（最大）で、
   自分で編成した艦隊は最初その base の割合（3割）から始まり、研究した節点の add の分だけ最大へ近づく（全部で10割）。
   決まった艦隊（ストーリーの作戦、友軍、クイック出撃）と敵には効かない。敵は作戦ごとの強さで、章が進むと強くなる */
WOS_DATA.techStat={base:.3};

/* 技術ツリーのタブ。地上軍は将来入れる（今は中身なし） */
WOS_DATA.techForces=[
  {id:'space',  name:'宇宙軍'},
  {id:'ground', name:'地上軍', soon:'地上戦（第二章〜）で導入予定。'},
];

/* 宇宙軍の技術ツリー（どの兵科も同じ形。名前の {gun} は兵科の主兵装の名前に置き換わる）。年は A.E.（開戦は A.E.45）。
   id: 保存データが使う名前（変えると研究済みが消える）　icon: 節点の絵（cap gun aim armor engine sensor stealth flak fighter was deck supply）
   col / row: 画面上の位置（列は左から、行は上から）　req: 先に研究が要る節点（すべて）。空なら最初から研究できる
   cap: 兵科の出撃上限の段階（下の branches の steps の番号。資金もそこの cost）。名前は、多くの艦を指揮し整備できるようにする技術
     （ユーザー決定 2026-11-06: 第一世代管制システム → 新型データリンク → ドックの拡張。前は第一次・第二次艦隊動員計画、総力戦動員計画）
   add: 研究すると能力が最大の何割ぶん上がるか（同じ能力の合計が 1 - techStat.base になるように置く）
   cost: 資金（兵科の costMul を掛け、10きざみに丸める。ユーザー決定 2026-11-06 で全部の節点と出撃上限の段を1.2倍・10きざみにした）
   only: この兵科にだけ出す（branches の id）　craft: 艦ではなく、その小型機（data/ships.js の crafts）の能力を上げる。
     小型機の値も最終形態で、自分で編成した艦隊の小型機は最初 techStat.base の割合 */
WOS_DATA.techTree=[
  {id:'cap1',  name:'第一世代管制システム', icon:'cap',     col:0, row:0, req:[],               cap:1},
  {id:'cap2',  name:'新型データリンク',     icon:'cap',     col:3, row:0, req:['cap1','eng1'],  cap:2},
  {id:'cap3',  name:'ドックの拡張',         icon:'cap',     col:6, row:0, req:['cap2','def3'],  cap:3},
  {id:'gun1',  name:'38式 {gun}',           icon:'gun',     col:0, row:1, req:[],               add:{atk:.1},  cost:70},
  {id:'gun2',  name:'42式改 {gun}',         icon:'gun',     col:2, row:1, req:['gun1'],         add:{atk:.15}, cost:160},
  {id:'gun3',  name:'45式 高出力{gun}',     icon:'gun',     col:4, row:1, req:['gun2','eng2'],  add:{atk:.2},  cost:290},
  {id:'gun4',  name:'試製47式 {gun}',       icon:'gun',     col:6, row:1, req:['gun3','rng2'],  add:{atk:.25}, cost:500},
  {id:'rng1',  name:'40式 射撃管制装置',    icon:'aim',     col:1, row:2, req:['gun1'],         add:{rng:.2},  cost:110},
  {id:'rng2',  name:'44式 長距離照準儀',    icon:'aim',     col:3, row:2, req:['rng1','vis2'],  add:{rng:.25}, cost:220},
  {id:'rng3',  name:'46式 統合火器管制',    icon:'aim',     col:5, row:2, req:['rng2','vis3'],  add:{rng:.25}, cost:380},
  {id:'def1',  name:'38式 複合装甲板',      icon:'armor',   col:0, row:3, req:[],               add:{def:.1},  cost:70},
  {id:'def2',  name:'42式 積層装甲',        icon:'armor',   col:2, row:3, req:['def1'],         add:{def:.15}, cost:160},
  {id:'def3',  name:'45式 電磁反応装甲',    icon:'armor',   col:4, row:3, req:['def2','eng1'],  add:{def:.2},  cost:290},
  {id:'def4',  name:'試製47式 偏向力場装甲', icon:'armor',  col:6, row:3, req:['def3','eng2'],  add:{def:.25}, cost:500},
  {id:'eng1',  name:'D-RAMS 第2世代推進器', icon:'engine',  col:1, row:4, req:['def1'],         add:{eva:.2,spd:.2},   cost:110},
  {id:'eng2',  name:'D-RAMS 第3世代推進器', icon:'engine',  col:3, row:4, req:['eng1','def2'],  add:{eva:.25,spd:.25}, cost:220},
  {id:'eng3',  name:'D-RAMS 高機動改修',    icon:'engine',  col:5, row:4, req:['eng2','stl2'],  add:{eva:.25,spd:.25}, cost:380},
  {id:'vis1',  name:'39式 光学探査儀',      icon:'sensor',  col:0, row:5, req:[],               add:{vis:.2},  cost:70},
  {id:'vis2',  name:'43式 航跡探知機',      icon:'sensor',  col:2, row:5, req:['vis1'],         add:{vis:.25}, cost:160},
  {id:'vis3',  name:'46式 広域索敵網',      icon:'sensor',  col:4, row:5, req:['vis2','rng1'],  add:{vis:.25}, cost:290},
  {id:'stl1',  name:'40式 低放射塗装',      icon:'stealth', col:1, row:6, req:['vis1'],         add:{stl:.2},  cost:110},
  {id:'stl2',  name:'44式 排熱遮蔽外殻',    icon:'stealth', col:3, row:6, req:['stl1','def2'],  add:{stl:.25}, cost:220},
  {id:'stl3',  name:'試製47式 航跡攪乱装置', icon:'stealth', col:5, row:6, req:['stl2','vis3'], add:{stl:.25}, cost:380},
  {id:'aa1',   name:'40式 対空機銃',        icon:'flak',    col:1, row:7, req:['gun1'],         add:{aa:.2},   cost:110},
  {id:'aa2',   name:'44式 対空誘導弾',      icon:'flak',    col:3, row:7, req:['aa1','vis2'],   add:{aa:.25},  cost:220},
  {id:'aa3',   name:'46式 近接防御網',      icon:'flak',    col:5, row:7, req:['aa2','rng2'],   add:{aa:.25},  cost:380},
  /* 小型機の機体。艦載機は母艦、W.A.S. は W.A.S. 部隊（data/ships.js の crafts の branch）。craft の小型機の火力 dmg・耐久 hp・回避 eva が上がる。
     強襲母艦の艦載機にも母艦の研究が効く */
  {id:'ftr1',  name:'F-38 アクィラ',        icon:'fighter', col:0, row:8, req:[],               only:['carrier'], craft:'ftr', add:{dmg:.2,hp:.2,eva:.2},    cost:100},
  {id:'ftr2',  name:'F-42 ファルコ',        icon:'fighter', col:2, row:8, req:['ftr1','eng1'],  only:['carrier'], craft:'ftr', add:{dmg:.25,hp:.25,eva:.25}, cost:190},
  {id:'ftr3',  name:'F-46 ハルピュイア',    icon:'fighter', col:4, row:8, req:['ftr2','aa2'],   only:['carrier'], craft:'ftr', add:{dmg:.25,hp:.25,eva:.25}, cost:340},
  {id:'was1',  name:'W-21 ルクス',          icon:'was',     col:1, row:9, req:['def1'],         only:['was'], craft:'was', add:{dmg:.2,hp:.2,eva:.2},    cost:140},
  {id:'was2',  name:'W-24 ノクス',          icon:'was',     col:3, row:9, req:['was1','eng1'],  only:['was'], craft:'was', add:{dmg:.25,hp:.25,eva:.25}, cost:240},
  {id:'was3',  name:'W-27 ウンブラ',        icon:'was',     col:5, row:9, req:['was2','def3'],  only:['was'], craft:'was', add:{dmg:.25,hp:.25,eva:.25}, cost:380},
  /* 母艦の運用（母艦と W.A.S. 部隊だけ）。craft:'all' はその兵科の艦が積む小型機すべて。
     out: 同時に出撃できる隊の数が1つ増える（data/ships.js の maxOut が最終形態。研究前は out の節点の数だけ少ない、最低1隊）
     turn: 補給（帰還後の整備 rearm と次の隊の発進間隔 cd）が速くなる。速さは techStat.base から始まり、時間は data の値 ÷ 速さ */
  {id:'out1',  name:'第2飛行甲板増設',      icon:'deck',    col:2, row:10, req:['turn1','def2'], only:['carrier','was'], craft:'all', add:{out:1},     cost:240},
  {id:'out2',  name:'多層格納甲板',          icon:'deck',    col:5, row:10, req:['out1','eng2'],  only:['carrier','was'], craft:'all', add:{out:1},     cost:430},
  {id:'turn1', name:'40式 自動補給機構',     icon:'supply',  col:1, row:11, req:['def1'],         only:['carrier','was'], craft:'all', add:{turn:.2},   cost:110},
  {id:'turn2', name:'44式 高速整備ライン',   icon:'supply',  col:3, row:11, req:['turn1','eng1'], only:['carrier','was'], craft:'all', add:{turn:.25},  cost:220},
  {id:'turn3', name:'46式 無人整備システム', icon:'supply',  col:5, row:11, req:['turn2','out1'], only:['carrier','was'], craft:'all', add:{turn:.25},  cost:380},
];

/* 兵科（宇宙軍）。技術ツリーの左の縦の欄で選ぶ単位（物語で解放されていない兵科は出さない）。
   gun: 技術ツリーの名前に入る主兵装
   戦区軍で出撃するとき、艦の数を兵科ごとに cap 隻までに抑える（出撃上限）。
   types: 含む艦種（data/ships.js の id）
   steps: 技術ツリーの段階 [{cap, cost}]。最初の段階は最初から持っている。cost の資金で次の段階を研究する
   need / needText: 物語で解放されるまで上限0で研究もできない（need は進行の旗の名前）。needText はその説明
   costMul: この兵科の研究（techTree の cost）に掛ける倍率
   今は巡洋艦まで解放済み（ユーザー決定 2026-10-03）。戦艦・母艦・W.A.S. 部隊は物語の旗 need で解放する */
WOS_DATA.branches=[
  {id:'escort',  name:'護衛艦艇',   gun:'速射レーザー砲', costMul:1, types:['cv','ff'], steps:[{cap:24},{cap:36,cost:240},{cap:48,cost:480},{cap:64,cost:960}]},
  {id:'dd',      name:'駆逐艦',     gun:'誘導魚雷',       costMul:1, types:['dd'],      steps:[{cap:16},{cap:24,cost:240},{cap:32,cost:480},{cap:48,cost:960}]},
  {id:'cruiser', name:'巡洋艦',     gun:'荷電粒子砲',     costMul:1.5, types:['cl'],      steps:[{cap:6},{cap:10,cost:360},{cap:14,cost:720},{cap:20,cost:1200}]},
  {id:'bb',      name:'戦艦',       gun:'大口径主砲',     costMul:2, need:'bb', needText:'第一章 第5節をクリアで解放', types:['bb'],      steps:[{cap:4},{cap:6,cost:480},{cap:8,cost:960},{cap:12,cost:1440}]},
  {id:'carrier', name:'母艦',       gun:'艦載機兵装',     costMul:2, need:'carrier', needText:'物語で解放（時期は未定）', types:['cvb'],     steps:[{cap:2},{cap:3,cost:480},{cap:4,cost:960},{cap:6,cost:1440}]},
  {id:'was',     name:'W.A.S. 部隊', gun:'W.A.S.兵装',   costMul:2, types:['mas','masc'], need:'was', needText:'物語で解放（第二章後半〜第三章の予定）',
                 steps:[{cap:8},{cap:12,cost:600},{cap:16,cost:1200},{cap:24,cost:1800}]},
];

/* 準備画面のチュートリアル（第2節のあと〜第3節の前。docs/tutorial.md の 6。ユーザー決定 2026-11-06、名前と文は仮）。
   1段ずつ、その操作をしたら次へ進む。案内は画面の下の板（話し手「副官」）。
   name: 段の名前　text: 副官の文　screen: 段の画面（いないときは、そこへの道のボタンを光らせる）
   condition: 進む条件（prep.js の PREP_DONE。今そうなっていれば進む。org・army・group・placed・flag・tech・cruiser・research・sortie）
   targets: 光らせる場所の候補。見えている最初の1つを囲む　also: 見えていれば一緒に囲む
   until: この条件が満たされていれば、この段も済み（巡洋艦を先に置いたら、見るだけの段は飛ばす）
   aid: この段が始まったときに渡す援助（その作戦の aid。第2節の緊急援助） */
WOS_DATA.prepTutorial=[
 {name:'艦隊編集を開く',screen:'title',condition:'org',until:'placed',targets:['#mainNav [data-go="org"]'],text:'ナイル警備の巡洋艦6隻が、駐屯隊に加わりました。艦隊編集で、戦区軍に組み入れましょう。「艦隊編集」を開いてください。'},
 {name:'打撃群を見る',screen:'org',condition:'army',until:'placed',targets:['[data-tab="army"][aria-selected="false"]','#orgList [data-army="a1"]'],text:'打撃群は、戦闘で動かす単位です。同じ艦種の支隊を5つまでまとめます。一覧のいちばん下が、加わった「第9打撃群」（巡洋艦6隻）です。選んで、能力を見てください。'},
 {name:'戦区軍を開く',screen:'org',condition:'group',until:'placed',targets:['[data-tab="group"]'],text:'戦区軍は、打撃群をまとめて一度に動かす単位です。上の「戦区軍」のタブを開いてください。'},
 {name:'戦区軍に置く',screen:'org',condition:'placed',targets:['.orgpop [data-addarmy="a1"]','#orgList [data-grp="g1"]:not(.sel)','[data-ly="2"][aria-pressed="false"]','.grid [data-cx="2"][data-cz="0"]'],text:'戦区軍は、打撃群を5つまで5×5×5の立方体に並べます。上が敵の側です。光っている前のマスを押し、「第9打撃群」を加えてください。巡洋艦は遅いが硬く、射程が長いので、正面に置きます。'},
 {name:'旗艦にする',screen:'org',condition:'flag',targets:['.chip[data-chip-army="a1"] [data-flag]'],text:'戦区軍を動かすと、ほかの打撃群は旗艦を中心に並んだまま付いてきます。いちばん硬い第9打撃群を旗艦にしてください。'},
 {name:'技術ツリーを開く',screen:'tech',condition:'tech',aid:'retreat',targets:['#mainNav [data-go="tech"]'],text:'司令部から緊急援助の資金1,000が届きました。技術ツリーで、艦を強くしましょう。メニューに戻り、「技術ツリー」を開いてください。'},
 {name:'兵科を選ぶ',screen:'tech',condition:'cruiser',targets:['#brBar [data-br="cruiser"]'],text:'研究は兵科ごとです。左の「巡洋艦」を選んでください。'},
 {name:'研究する',screen:'tech',condition:'research',targets:['#brBar [data-br="cruiser"][aria-pressed="false"]','#tRes:not([disabled])','#trCv [data-node="def1"]'],text:'自分で編成した艦は、はじめは最大の3割の力です。研究すると能力が上がります。「38式 複合装甲板」を選び、「研究する」を押してください。残りの資金で、ほかの研究も進められます。'},
 {name:'出撃する',screen:'forces',condition:'sortie',targets:['#mainNav [data-go="mode"]','[data-s="mode"] [data-go="sortie"]','#opList [data-op="nile"][aria-pressed="false"]','#goBattle','#sgList [data-sg="g1"][aria-pressed="false"]','#forcesBattle'],also:['#sgLoad'],text:'準備ができたら出撃です。第3節「ナイル防衛線」は、自分の戦区軍で出ます。出撃する戦区軍を選び、出撃上限を確かめて、「出撃する」を押してください。'}
];
