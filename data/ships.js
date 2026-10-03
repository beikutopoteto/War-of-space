/* War of Space data: ship classes and small craft. All values are provisional (see docs/menu.md).
   Classic script loaded before battle/ and prep.js; everything goes into window.WOS_DATA. */
window.WOS_DATA=window.WOS_DATA||{};

/* 艦種。能力値は1〜10。研究をすべて終えた最終形態の値で、自分で編成した艦隊は最初その3割（data/tech.js）。
   aa: 対空照準。艦砲が艦載機と W.A.S. に与える打撃に効く（下の WOS_DATA.aa）
   id: 保存データと編成ボーナスが使う名前（変えると古い保存データが読めなくなる）
   max: 1つの戦闘団に入れられる最大隻数　scale: 戦闘画面での艦の大きさ
   hangar: 1隻あたりの搭載数（ftr=艦載機、was=W.A.S.） */
WOS_DATA.ships=[
  {id:'cv',   name:'コルベット',   atk:2, def:1, eva:9, rng:3, vis:8, stl:9, aa:5, spd:10, max:12, scale:.55, note:'偵察と哨戒を担う小型艦'},
  {id:'ff',   name:'フリゲート',   atk:3, def:2, eva:7, rng:4, vis:7, stl:7, aa:8, spd:8,  max:10, scale:.7,  note:'護衛と対小型艦戦'},
  {id:'dd',   name:'駆逐艦',       atk:5, def:3, eva:6, rng:5, vis:6, stl:6, aa:4, spd:7,  max:8,  scale:.85, note:'雷撃で大型艦を狙う'},
  {id:'cl',   name:'巡洋艦',       atk:6, def:6, eva:4, rng:6, vis:6, stl:4, aa:6, spd:5,  max:6,  scale:1.2, note:'攻守の均衡した主力艦'},
  {id:'bb',   name:'戦艦',         atk:9, def:9, eva:2, rng:8, vis:5, stl:2, aa:4, spd:3,  max:4,  scale:1.7, note:'長射程の主砲を持つ決戦艦'},
  {id:'cvb',  name:'戦闘母艦',     atk:4, def:5, eva:3, rng:4, vis:7, stl:3, aa:6, spd:4,  max:3,  scale:1.6, hangar:{ftr:40}, note:'艦載機（W.A.S.ではない）を発進させ、遠くの敵を叩く'},
  {id:'mas',  name:'突撃揚陸艦',   atk:5, def:4, eva:5, rng:2, vis:5, stl:7, aa:3, spd:6,  max:6,  scale:.9,  hangar:{was:10}, note:'W.A.S.（Weaponed Armored Shell・武装装甲化外骨格）を運び、近距離で突入させる'},
  {id:'masc', name:'強襲母艦',     atk:4, def:5, eva:2, rng:3, vis:6, stl:3, aa:4, spd:4,  max:3,  scale:1.6, hangar:{was:30,ftr:10}, note:'W.A.S.が主力。艦載機も少し出せる'},
];

/* 対空照準の効き目（仮）: 艦や要塞の砲が小型機に与える打撃 = 打撃 ×（1 − 小型機の eva）× per × 撃つ側の aa。
   aa を書いていない艦隊（決まった艦隊、敵、要塞）は std。std の艦が今の対空の基準（艦載機 0.375、W.A.S. 0.275） */
WOS_DATA.aa={per:.1, std:5};

/* 母艦から出る小型機。戦闘画面の値をそのまま使う。
   squad: 1隊の数　maxOut: 同時に出られる隊の数　launchR: 発進距離　fuel: 燃料（秒）
   rearm: 帰還後の整備（秒）　cd: 次の隊を出すまで（秒）　eva: 回避率（0〜1）。艦載機は W.A.S. より当たりやすい（ユーザー決定 2026-10-03） */
WOS_DATA.crafts={
  ftr:{name:'艦載機', squad:30, maxOut:3, launchR:52, range:9, speed:17, hp:5,  eva:.25, dmg:.3,  fuel:24, rearm:8,  cd:3, vis:5, stl:7},
  was:{name:'W.A.S.', squad:20, maxOut:3, launchR:30, range:5, speed:10, hp:10, eva:.45, dmg:.65, fuel:16, rearm:10, cd:4, vis:4, stl:6},
};
