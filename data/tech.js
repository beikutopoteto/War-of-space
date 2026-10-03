/* War of Space data: unlocks, rewards and the tech tree. All values are provisional (see docs/menu.md).
   Classic script loaded before battle/ and prep.js; everything goes into window.WOS_DATA. */
window.WOS_DATA=window.WOS_DATA||{};

/* メニューの画面の解放。値の作戦（data/operations.js の id）をクリアすると使えるようになる */
WOS_DATA.unlocks={fleet:'retreat', tech:'retreat'};

/* 作戦の報酬（資金）は data/operations.js の reward。2回目からのクリアは replay の割合だけもらえる。
   敗北と中止は報酬なし。クイック戦闘は進行にも報酬にも数えない */
WOS_DATA.reward={replay:.5};

/* 能力の研究（ユーザー決定 2026-10-03）。data/ships.js の能力値は研究をすべて終えた最終形態（最大）で、
   自分で編成した艦隊は最初その base の割合（3割）から始まり、強化を1つ研究するごとに step ずつ最大へ近づく。
   決まった艦隊（ストーリーの作戦、友軍、クイック戦闘）と敵には効かない。敵は作戦ごとの強さで、章が進むと強くなる */
WOS_DATA.techStat={base:.3, step:.1};

/* 技術ツリーの形。どの兵科も同じ形で、根元の〇から枝分かれする。
   parent: どの枝の先から生えるか（書かなければ根元の〇）。親の枝を研究し終えると研究できる
   cap: true なら兵科の出撃上限の段階（下の branches の steps）
   stats: 1段ごとに techStat.step ずつ上がる能力　costs: 段ごとの資金（兵科の costMul を掛ける）。段の数は costs の長さ */
WOS_DATA.techLines=[
  {id:'cap',  name:'上限解放', cap:true},
  {id:'arms', name:'兵装技術', costs:[100]},
  {id:'atk',  name:'火力強化', parent:'arms', stats:['atk'],       costs:[60,90,130,180,240,320,420]},
  {id:'rng',  name:'射程強化', parent:'arms', stats:['rng'],       costs:[60,90,130,180,240,320,420]},
  {id:'hull', name:'船体技術', costs:[100]},
  {id:'def',  name:'装甲強化', parent:'hull', stats:['def'],       costs:[60,90,130,180,240,320,420]},
  {id:'mob',  name:'機関強化', parent:'hull', stats:['eva','spd'], costs:[60,90,130,180,240,320,420]},
  {id:'elec', name:'電子技術', costs:[100]},
  {id:'vis',  name:'索敵強化', parent:'elec', stats:['vis'],       costs:[60,90,130,180,240,320,420]},
  {id:'stl',  name:'隠蔽強化', parent:'elec', stats:['stl'],       costs:[60,90,130,180,240,320,420]},
];

/* 兵科。技術ツリーの左の縦の欄で選ぶ単位（物語で解放されていない兵科は出さない）。
   軍集団で出撃するとき、艦の数を兵科ごとに cap 隻までに抑える（出撃上限）。
   types: 含む艦種（data/ships.js の id）
   steps: 技術ツリーの段階 [{cap, cost}]。最初の段階は最初から持っている。cost の資金で次の段階を研究する
   need / needText: 物語で解放されるまで上限0で研究もできない（need は進行の旗の名前）。needText はその説明
   costMul: この兵科の強化（techLines の costs）に掛ける倍率 */
WOS_DATA.branches=[
  {id:'escort',  name:'護衛艦艇',   costMul:1, types:['cv','ff'], steps:[{cap:24},{cap:36,cost:200},{cap:48,cost:400},{cap:64,cost:800}]},
  {id:'dd',      name:'駆逐艦',     costMul:1, types:['dd'],      steps:[{cap:16},{cap:24,cost:200},{cap:32,cost:400},{cap:48,cost:800}]},
  {id:'cruiser', name:'巡洋艦',     costMul:1.5, types:['cl'],      steps:[{cap:6},{cap:10,cost:300},{cap:14,cost:600},{cap:20,cost:1000}]},
  {id:'bb',      name:'戦艦',       costMul:2, types:['bb'],      steps:[{cap:4},{cap:6,cost:400},{cap:8,cost:800},{cap:12,cost:1200}]},
  {id:'carrier', name:'母艦',       costMul:2, types:['cvb'],     steps:[{cap:2},{cap:3,cost:400},{cap:4,cost:800},{cap:6,cost:1200}]},
  {id:'was',     name:'W.A.S. 部隊', costMul:2, types:['mas','masc'], need:'was', needText:'物語で解放（第二章後半〜第三章の予定）',
                 steps:[{cap:8},{cap:12,cost:500},{cap:16,cost:1000},{cap:24,cost:1500}]},
];
