/* War of Space data: formation bonuses for an army. All provisional (see docs/menu.md).
   Classic script; goes into window.WOS_DATA. */
window.WOS_DATA=window.WOS_DATA||{};

/* 編成ボーナス。when の条件をすべて満たすと mod の倍率が軍の能力に掛かる。
   when.need:    [[艦種…], …]  内側の各組から1つ以上の艦種を含む
   when.count:   {types:[艦種…], min}  その艦種の支隊が min 個以上
   when.minStat: {stat, min}  すべての支隊の艦種で能力 stat が min 以上
   when.minBgs:  支隊が この数以上
   when.sameType: true なら すべての支隊が同じ艦種
   when.minTypes: 艦種が この数以上
   when.maxBgs:  支隊が1つ以上、この数以下
   modBy: {艦種:{能力:倍率}} なら、mod の代わりに打撃群の艦種で倍率を選ぶ（sameType と組む）
   cond と eff は画面に出す説明文。 */
/* 10種（ユーザー決定 2026-11-07: 名前と、1つの能力で編成ボーナスの合計は +30% まで。旗艦の +10% は別）。
   連合艦隊・スペシャリスト（5支隊が同じ艦種で、艦種による能力 +20%）・ゲリラ戦（支隊1つで、攻撃と視界が下がり速度・防御・回避が上がる）の
   条件もユーザー決定。スペシャリストの艦種ごとの能力とゲリラ戦の数は Claude の案をユーザーが承認。ほかの7種の条件と効果は仮。最初の7種はそれぞれ別の能力に +15% なので、連合艦隊の +10% と重なっても
   1.15×1.1 = +26.5% まで。スペシャリストの能力は、同じ艦種で成り立つ7種の能力と重ならないものにした（フリゲートはハリネズミ艦隊の対空を避けて回避など）。 */
WOS_DATA.bonuses=[
  {id:'main',    name:'大艦巨砲主義', cond:'戦艦と巡洋艦を含む',                    eff:'攻撃 +15%',     when:{need:[['bb'],['cl']]}, mod:{atk:1.15}},
  {id:'carrier', name:'航空主兵論',   cond:'戦闘母艦の支隊が2つ以上',               eff:'射程 +15%',     when:{count:{types:['cvb'],min:2}}, mod:{rng:1.15}},
  {id:'escort',  name:'傘理論',       cond:'母艦と、フリゲートかコルベットを含む', eff:'防御 +15%',     when:{need:[['cvb','masc'],['ff','cv']]}, mod:{def:1.15}},
  {id:'aa',      name:'ハリネズミ艦隊', cond:'フリゲートの支隊が2つ以上',           eff:'対空照準 +15%', when:{count:{types:['ff'],min:2}}, mod:{aa:1.15}},
  {id:'scout',   name:'先制発見',     cond:'コルベットを含む',                      eff:'視界 +15%',     when:{need:[['cv']]}, mod:{vis:1.15}},
  {id:'assault', name:'機甲電撃戦'  , cond:'突撃揚陸艦と強襲母艦を含む',            eff:'回避 +15%',     when:{need:[['mas'],['masc']]}, mod:{eva:1.15}},
  {id:'torpedo', name:'群狼戦術',     cond:'駆逐艦の支隊が2つ以上',                 eff:'隠蔽性 +15%',   when:{count:{types:['dd'],min:2}}, mod:{stl:1.15}},
  {id:'specialist',name:'スペシャリスト', cond:'5つの支隊がすべて同じ艦種（コルベットは隠蔽性、フリゲートは回避、駆逐艦は攻撃、巡洋艦は防御、戦艦は射程、戦闘母艦は視界、突撃揚陸艦は速度、強襲母艦は防御）', eff:'艦種による能力 +20%',
    when:{minBgs:5,sameType:true}, modBy:{cv:{stl:1.2},ff:{eva:1.2},dd:{atk:1.2},cl:{def:1.2},bb:{rng:1.2},cvb:{vis:1.2},mas:{spd:1.2},masc:{def:1.2}}},
  {id:'guerrilla', name:'ゲリラ戦', cond:'支隊が1つだけ', eff:'速度・防御・回避 +15%、攻撃・視界 −15%', when:{maxBgs:1}, mod:{spd:1.15,def:1.15,eva:1.15,atk:.85,vis:.85}},
  {id:'combined',name:'連合艦隊',     cond:'5種類以上の艦種を含む',                 eff:'全能力 +10%',   when:{minTypes:5}, mod:{atk:1.1,def:1.1,eva:1.1,rng:1.1,vis:1.1,stl:1.1}},
];

/* 旗艦（ユーザー決定 2026-11-06）: 戦区軍の旗艦の打撃群は全能力 +10%（攻撃・防御・回避・射程・視界・隠蔽性の6つ。連合艦隊と同じ）。
   出撃のときに、編成画面で★を付けた打撃群に掛かる（prep.js armyStats）。 */
WOS_DATA.flagBonus={id:'flag', name:'旗艦', eff:'全能力 +10%', mod:{atk:1.1,def:1.1,eva:1.1,rng:1.1,vis:1.1,stl:1.1}};
