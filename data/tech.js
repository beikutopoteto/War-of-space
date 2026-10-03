/* War of Space data: unlocks, rewards and the tech tree. All values are provisional (see docs/menu.md).
   Classic script loaded before battle/ and prep.js; everything goes into window.WOS_DATA. */
window.WOS_DATA=window.WOS_DATA||{};

/* メニューの画面の解放。値の作戦（data/operations.js の id）をクリアすると使えるようになる */
WOS_DATA.unlocks={fleet:'retreat', tech:'retreat'};

/* 作戦の報酬（資金）は data/operations.js の reward。2回目からのクリアは replay の割合だけもらえる。
   敗北と中止は報酬なし。クイック戦闘は進行にも報酬にも数えない */
WOS_DATA.reward={replay:.5};

/* 兵科。軍集団で出撃するとき、艦の数を兵科ごとに cap 隻までに抑える（出撃上限）。
   types: 含む艦種（data/ships.js の id）
   steps: 技術ツリーの段階 [{cap, cost}]。最初の段階は最初から持っている。cost の資金で次の段階を研究する
   need / needText: 物語で解放されるまで上限0で研究もできない（need は進行の旗の名前）。needText はその説明 */
WOS_DATA.branches=[
  {id:'escort',  name:'護衛艦艇',   types:['cv','ff'], steps:[{cap:24},{cap:36,cost:200},{cap:48,cost:400},{cap:64,cost:800}]},
  {id:'dd',      name:'駆逐艦',     types:['dd'],      steps:[{cap:16},{cap:24,cost:200},{cap:32,cost:400},{cap:48,cost:800}]},
  {id:'cruiser', name:'巡洋艦',     types:['cl'],      steps:[{cap:6},{cap:10,cost:300},{cap:14,cost:600},{cap:20,cost:1000}]},
  {id:'bb',      name:'戦艦',       types:['bb'],      steps:[{cap:4},{cap:6,cost:400},{cap:8,cost:800},{cap:12,cost:1200}]},
  {id:'carrier', name:'母艦',       types:['cvb'],     steps:[{cap:2},{cap:3,cost:400},{cap:4,cost:800},{cap:6,cost:1200}]},
  {id:'was',     name:'W.A.S. 部隊', types:['mas','masc'], need:'was', needText:'物語で解放（第二章後半〜第三章の予定）',
                 steps:[{cap:8},{cap:12,cost:500},{cap:16,cost:1000},{cap:24,cost:1500}]},
];
