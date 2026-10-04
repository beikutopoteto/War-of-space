/* War of Space data: formation bonuses for an army. All provisional (see docs/menu.md).
   Classic script; goes into window.WOS_DATA. */
window.WOS_DATA=window.WOS_DATA||{};

/* 編成ボーナス。when の条件をすべて満たすと mod の倍率が軍の能力に掛かる。
   when.need:    [[艦種…], …]  内側の各組から1つ以上の艦種を含む
   when.count:   {types:[艦種…], min}  その艦種の支隊が min 個以上
   when.minStat: {stat, min}  すべての支隊の艦種で能力 stat が min 以上
   when.minBgs:  支隊が この数以上
   when.sameType: true なら すべての支隊が同じ艦種
   cond と eff は画面に出す説明文。 */
WOS_DATA.bonuses=[
  {id:'strike', name:'打撃艦隊', cond:'戦艦・巡洋艦・駆逐艦を含む',          eff:'攻撃 +15%', when:{need:[['bb'],['cl'],['dd']]}, mod:{atk:1.15}},
  {id:'escort', name:'護衛艦隊', cond:'母艦と、フリゲートかコルベットを含む', eff:'防御 +15%', when:{need:[['cvb','masc'],['ff','cv']]}, mod:{def:1.15}},
  {id:'air',    name:'機動部隊', cond:'母艦の支隊が2つ以上',               eff:'射程 +10%', when:{count:{types:['cvb','masc'],min:2}}, mod:{rng:1.1}},
  {id:'scout',  name:'前衛偵察', cond:'コルベットを含む',                    eff:'視界 +25%', when:{need:[['cv']]}, mod:{vis:1.25}},
  {id:'stealth',name:'隠密艦隊', cond:'全支隊の隠蔽性が6以上',             eff:'隠蔽性 +20%', when:{minStat:{stat:'stl',min:6}}, mod:{stl:1.2}},
  {id:'assault',name:'強襲揚陸', cond:'突撃揚陸艦と強襲母艦を含む',          eff:'攻撃 +10%・回避 +10%', when:{need:[['mas'],['masc']]}, mod:{atk:1.1,eva:1.1}},
  {id:'uniform',name:'単一艦種', cond:'3つ以上の支隊がすべて同じ艦種',     eff:'全能力 +5%', when:{minBgs:3,sameType:true}, mod:{atk:1.05,def:1.05,eva:1.05,rng:1.05,vis:1.05,stl:1.05}},
];
