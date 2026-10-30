/* War of Space data: ship classes and small craft. All values are provisional (see docs/menu.md).
   Classic script loaded before battle/ and prep.js; everything goes into window.WOS_DATA. */
window.WOS_DATA=window.WOS_DATA||{};

/* 艦種。能力値は1〜10。研究をすべて終えた最終形態の値で、自分で編成した艦隊は最初その3割（data/tech.js）。
   突撃揚陸艦の防御2.44: 2026-10-19（ユーザー決定）に、艦種ごとの耐久の倍率0.7（前の WOS_DATA.classHp）を地の値に入れた（防御4・耐久26 → 2.44・18.2。耐久は 6＋防御×5）
   aa: 対空照準。艦砲が艦載機と W.A.S. に与える打撃に効く（下の WOS_DATA.aa）
   id: 保存データと編成ボーナスが使う名前（変えると古い保存データが読めなくなる）
   max: 1つの支隊（戦闘団）に入れられる最大隻数　scale: 戦闘画面での艦の大きさ
   hangar: 1隻あたりの搭載数（ftr=艦載機、was=W.A.S.） */
WOS_DATA.ships=[
  {id:'cv',   name:'コルベット', atk:2, def:1, eva:9, rng:3, vis:8, stl:9, aa:5, spd:10, max:12, scale:.55, note:'偵察と哨戒を担う小型艦'},
  {id:'ff',   name:'フリゲート', atk:3, def:2, eva:7, rng:4, vis:7, stl:7, aa:8, spd:8,  max:10, scale:.7,  note:'護衛と対小型艦戦'},
  {id:'dd',   name:'駆逐艦',   atk:5, def:3, eva:6, rng:5, vis:6, stl:6, aa:4, spd:7,  max:8,  scale:.85, note:'雷撃で大型艦を狙う'},
  {id:'cl',   name:'巡洋艦',   atk:6, def:6, eva:4, rng:6, vis:6, stl:4, aa:6, spd:5,  max:6,  scale:1.2, note:'攻守の均衡した主力艦'},
  {id:'bb',   name:'戦艦',    atk:9, def:9, eva:2, rng:8, vis:5, stl:2, aa:4, spd:3,  max:4,  scale:1.7, note:'長射程の主砲を持つ決戦艦'},
  {id:'cvb',  name:'戦闘母艦',  atk:4, def:5, eva:3, rng:4, vis:7, stl:3, aa:6, spd:4,  max:3,  scale:1.6, hangar:{ftr:40}, note:'艦載機（W.A.S.ではない）を発進させ、遠くの敵を叩く'},
  {id:'mas',  name:'突撃揚陸艦', atk:5, def:2.44, eva:5, rng:2, vis:5, stl:7, aa:3, spd:6,  max:6,  scale:.9,  hangar:{was:10}, note:'W.A.S.（Weaponed Armored Shell・武装装甲化外骨格）を運び、近距離で突入させる'},
  {id:'masc', name:'強襲母艦',  atk:4, def:5, eva:2, rng:3, vis:6, stl:3, aa:4, spd:4,  max:3,  scale:1.6, hangar:{was:30,ftr:10}, note:'W.A.S.が主力。艦載機も少し出せる'},
];

/* 部隊の名前（ユーザー決定 2026-10-04）: 「第N 役割 規模」。規模は階層ごとに1つ（word）。
   各艦種の行は [戦区軍, 打撃群, 支隊] それぞれの [番号, 役割]。新しく作った部隊は、主力の艦種（打撃群と戦区軍は隻数が一番多い艦種、
   同数なら旗艦の艦種）の番号から始め、同じ階層で使われていればその次の空き番号にする。
   earth は地球連合（米中方式）、foe は惑星共和国の軍「惑星自治軍」（露日方式）。foe は作戦データで敵の名前を付けるときの決まり */
WOS_DATA.unitNames={
  earth:{word:{group:'戦区軍', army:'打撃群', bg:'支隊'},
    cv:  [[1,'警備哨戒'], [3,'局地警戒'], [12,'沿岸哨戒']],
    ff:  [[2,'護衛防空'], [5,'船団護衛'], [18,'護送護衛']],
    dd:  [[3,'水上迎撃'], [7,'機動水雷'], [24,'駆逐突撃']],
    cl:  [[1,'軌道制圧'], [2,'巡洋'],     [9,'前衛巡洋']],
    bb:  [[4,'主力砲戦'], [1,'主力戦艦'], [3,'砲戦突破']],
    cvb: [[2,'航空制圧'], [4,'空母航空'], [15,'航空戦闘']],
    mas: [[5,'遠征展開'], [6,'揚陸侵攻'], [21,'突撃揚陸']],
    masc:[[1,'統合強襲'], [8,'機動強襲'], [7,'強襲打撃']]},
  foe:{word:{group:'戦線', army:'エスカドラ', bg:'戦闘隊'},
    cv:  [[2,'辺境哨戒'], [4,'警戒監視'], [10,'哨戒迎撃']],
    ff:  [[1,'防空警衛'], [6,'護衛展開'], [14,'護衛警衛']],
    dd:  [[3,'高速迎撃'], [2,'機動駆逐'], [8,'駆逐強襲']],
    cl:  [[1,'機動打撃'], [5,'重巡洋'],   [11,'巡洋阻止']],
    bb:  [[4,'決戦突破'], [1,'主力砲撃'], [2,'砲戦突破']],
    cvb: [[2,'航空支援'], [3,'航空制宙'], [5,'母艦航空']],
    mas: [[5,'挺身突入'], [7,'局地強襲'], [19,'突撃揚陸']],
    masc:[[1,'総軍強襲'], [8,'機動強襲'], [1,'機動機甲']],
    /* 揚陸艇（2026-10-18。共和国だけの艦種で、上の艦種の表 WOS_DATA.ships には入れない。名前は仮） */
    lc:  [[3,'軌道降下'], [12,'降下揚陸'], [31,'強行揚陸']]},
};

/* 対空照準の効き目（仮）: 艦や要塞の砲が小型機に与える打撃 = 打撃 ×（1 − 小型機の eva）× per × 撃つ側の aa。
   aa を書いていない艦隊（決まった艦隊、敵、要塞）は std。std の艦が今の対空の基準（艦載機 0.375、W.A.S. 0.275） */
WOS_DATA.aa={per:.1, std:5};

/* 母艦から出る小型機。戦闘画面の値をそのまま使う。
   squad: 1隊の数　maxOut: 同時に出られる隊の数　launchR: 発進距離　fuel: 燃料（秒）
   branch: 機体の研究をする兵科（data/tech.js の branches）
   rearm: 帰還後の整備（秒）　cd: 次の隊を出すまで（秒）　eva: 回避率（0〜1）。艦載機は W.A.S. より当たりやすい（ユーザー決定 2026-10-03） */
WOS_DATA.crafts={
  ftr:{name:'艦載機', branch:'carrier', squad:30, maxOut:3, launchR:52, range:9, speed:17, hp:5,  eva:.25, dmg:.3,  fuel:24, rearm:8,  cd:3, vis:5, stl:7},
  was:{name:'W.A.S.', branch:'was',     squad:20, maxOut:3, launchR:30, range:5, speed:10, hp:10, eva:.45, dmg:.65, fuel:16, rearm:10, cd:4, vis:4, stl:6},
};

/* 両陣営の技術（ユーザー決定 2026-10-20。docs/spec.md「両陣営の技術と強さ」。数値は仮）。
   作戦データで hp を書いていない戦う艦隊（敵・友軍・自分の決まった艦隊）は、陣営の表と作戦の stage（技術の段階。最大までのどこまでか、0〜1）から
   値を出す（battle/state.js の techFleet）。能力の割合は base +（1 − base）× stage で、耐久・打撃・回避・射程・速さは自分で編成した艦隊と同じ式
   （prep.js の armyToFleet）。小型機の耐久・打撃・回避も同じ割合。
   earth: 地球連合。艦種の最大は上の WOS_DATA.ships、小型機の最大は WOS_DATA.crafts。
   mars: 惑星共和国（惑星自治軍）。ships は艦種の最大（打撃/防御/回避/射程/速さ）。表にない艦種（戦艦など）は鹵獲した地球の艦として地球の表と割合を使う。
     作戦データの side:'earth' の敵は全部地球の表（鹵獲艦の隊）。crafts は小型機の最大（W.A.S. は地球の1.5倍、回避0.55）。
     ships の was: 1隻に積む W.A.S.（2026-10-21、ユーザー決定: 揚陸艦そのものの性能。12から8に（同じ日）。どの作戦でも。作戦データに hangar を書かない共和国の隊は、
     その艦種の隻数×was を積む。地球の突撃揚陸艦は上の WOS_DATA.ships の hangar で10）。
     ace: 惑星先進装備開発局の隊（ace:true、アルバレス隊）は、その段階の値の ship 倍（耐久・打撃・回避・射程・速さ。小型機も）、W.A.S. の打撃は wasDmg 倍。
       艦の耐久だけは hp 倍（ユーザー決定 2026-10-23: 第5節で砲台の1発で退く前に沈んでいたので艦を硬く。W.A.S. の耐久は ship 倍のまま） */
WOS_DATA.sides={
  earth:{base:.3},
  mars:{base:.45,
    ships:{cv:{atk:3, def:1.5, eva:10, rng:3, spd:11}, ff:{atk:4, def:2.5, eva:8, rng:4, spd:9}, dd:{atk:6, def:3.5, eva:7, rng:5, spd:8},
      cl:{atk:8, def:7, eva:4, rng:6.5, spd:6}, mas:{atk:6, def:3, eva:6, rng:2.5, spd:8, was:8}},
    crafts:{was:{hp:15, dmg:1, eva:.55}},
    ace:{ship:1.25, hp:1.5, wasDmg:3}},
};

/* 艦種別の動き（ユーザー決定 2026-10-22。docs/spec.md「CPU の行動規範」。数値はすべて仮で docs/menu.md「艦種別の動き」）。
   作戦データに roleAI:true がある作戦（第6節から）だけで効く。作戦が隊に書いたこと（ai、leash、fallBack、retreat など）が先で、
   書いていないところだけをこの表で埋める。敵（共和国）と友軍は狙い・立つ位置・退き際、自軍（プレイヤーの隊）は狙いだけ
   （命令のないときにどれを撃つか。艦載機と W.A.S. の狙いも）。仕組みは battle/sim.js の「艦種別の動き」。
   rank: 隊の役目を決める艦種の上位の順（混成の隊はいちばん上位の艦種。部隊の名前の決まりと同じ。揚陸艇はいちばん下）
   heavy: 「重い艦」の重さ（戦艦は射程の中でいちばん重い艦を撃つ。cl 以上が「重い艦」）
   k: 狙いの係数。距離にかける（小さいほど先に狙う）。prefer 好む、avoid 避ける、mark 駆逐艦が「味方が撃っている重い艦」「W.A.S. が取り付いた艦」
   behind: 退いた隊が味方の重い艦の後ろに立つ間隔（艦の円盤の外から）。foeSide: 「後ろ」を決める敵の向き（その重い艦のまわりこの距離の敵の真ん中）
   earth（大艦巨砲主義）/ mars（W.A.S. が要）: 艦種ごとの役目。表にない艦種は earth の行（鹵獲戦艦は地球の戦艦と同じ）
     role: anchor 錨 / core 芯 / pincer 挟み手 / umbrella 傘 / eye 目 / base 基地（母艦） / mother 母体（突撃揚陸艦） / bait 囮と盾 / edge 射程の端 / ferry 運び手
     prefer / avoid: 先に狙う / 後回しにする相手の艦種（ftr 艦載機、was W.A.S.）
     guard: その艦種の味方に near 以内まで寄った小型機を先に撃つ（傘、盾）
     stay: {of: 艦種, r}: その艦種の味方から r 以内にいる（傘は戦艦か母艦、芯は戦艦）
     hold: 錨が持ち場から leash×hold より外へ出ない（ai:'hunt' の隊は作戦のとおり追う）
     stand: 撃つ距離（射程の割合）。edge は寄られたら下がる。eye は相手の射程の外（相手の射程×1.05＋3）
     back: 隻数がこの割合を切ると、味方の重い艦の後ろ（いなければ来た所）へ下がる。base は艦載機・W.A.S. の残り
     mark: 'guns'（戦艦・巡洋艦が撃っている重い艦）/ 'was'（味方の W.A.S. が取り付いた艦）を mark 倍
     stray: まわりこの距離に味方のいない隊を好む（はぐれた隊）
     shy: 射程の長い相手の射程＋shy に入ったら、戦艦の後ろへ　close: 敵艦がここまで寄ったら、フリゲートの後ろへ
     front: 盾が揚陸艦の前に立つ距離（reach 以内の揚陸艦について行く）　ahead: 目が揚陸艦の前に出る距離
     crafts: 小型機の狙い（命令、相手の小型機、母艦を撃っている艦（guard:true）のあと） */
WOS_DATA.roles={
  rank:['lc','cv','ff','dd','mas','cl','bb','cvb','masc'],
  heavy:{bb:5, cvb:4, masc:4, cl:3, mas:2, dd:2, ff:1, cv:1, lc:.5},
  k:{prefer:.6, avoid:1.5, mark:.5},
  behind:8, foeSide:90,
  earth:{
    bb:  {role:'anchor', hold:.6, prefer:['bb','cvb','masc','cl']},
    cl:  {role:'core', prefer:['dd','mas','lc'], stand:.75, back:.3, stay:{of:['bb'], r:40}},
    dd:  {role:'pincer', mark:'guns', back:.4},
    ff:  {role:'umbrella', prefer:['mas','lc'], guard:['bb','cvb','masc'], near:25, stay:{of:['bb','cvb','masc'], r:25}},
    cv:  {role:'eye', prefer:['lc','ftr','was'], stray:45, back:.6, shy:5},
    cvb: {role:'base', close:25, back:.5},
    masc:{role:'base', close:25, back:.5},
    mas: {role:'base', close:25, back:.5},
    crafts:{ftr:{prefer:['mas','lc']}, was:{prefer:['mas','lc']}},
  },
  mars:{
    mas: {role:'mother', prefer:['bb','cvb','masc','cl'], avoid:['ff']},
    masc:{role:'mother', prefer:['bb','cvb','masc','cl'], avoid:['ff']},
    ff:  {role:'bait', prefer:[], guard:['mas','masc'], near:20, front:8, reach:60},
    dd:  {role:'pincer', mark:'was', prefer:['ff'], back:.4},
    cl:  {role:'edge', prefer:['ff','cl'], stand:.92, back:.3},
    cv:  {role:'eye', ahead:30, back:.6, shy:5},
    lc:  {role:'ferry'},
    crafts:{was:{prefer:['mas','bb','dd'], avoid:['ff'], guard:true}},
  },
};

/* ドクトリンの型（ユーザー決定 2026-10-22。docs/spec.md「CPU の行動規範」、型の一覧は docs/story.md 6.1「型」。数値はすべて仮で docs/menu.md「ドクトリン（型）」）。
   作戦データの packs（data/operations.js の先頭）で隊の組に型を当てたときだけ、共和国の隊に効く。仕組みは battle/sim.js の「ドクトリンの型」。
   slots: 役の枠 → 入る艦種（隊のいちばん上位の艦種で入る。WOS_DATA.roles.rank）。同じ枠の k 番目の隊は、ほかの枠の k 番目と組（from の向き、盾と揚陸艦の組）
   steps: 段の並び。各段は 枠 → 動き（all は全部の枠）、next（次へ進む合図）、after（その段の始まりから作戦の時計で何分で進むか。next と早い方）
     動き: approach（goal のまわりの from の向き、gather の距離へ。そろって着く）　charge（goal へ。how の形で）　hold（持ち場で、holdR 以内に来た敵だけと戦う）
       hide（持ち場で撃たずに待つ。小型機は戻す）　back（退き際。母艦は小型機を戻してから先に退き、ほかは母艦と敵の間で後ろを守る）
     合図: sync（approach の隊がみな着いた）　wasOn（組の W.A.S. が母艦の目標に取り付いた）　hit（守るもの ward が撃たれた）　lost（ward が落ちた）
   how: charge の形。screen（組の揚陸艦の前 front に並ぶ）　flank（組の揚陸艦から見て目標の横か上下へ回る）　edge（射程の端 WOS_DATA.roles.mars.cl.stand から撃つ。
     ほかの敵に寄られたら艦種別の動きに任せる）　antiAir（prey の艦種の順に目標を選ぶ）　over（ward か天体の上か下を回って、ward を撃った敵へ）
   at: hold・hide の持ち場。front（ward の敵側 front。敵側は ward から faceR 以内に見えている敵の真ん中の向き）　rim（ward の横 ±70度、rim）　shadow（天体か ward の陰、shadow）。書かなければその段の始めにいた所
   breakOff: 退き際 {slot, below, was}: slot の隻数が below を切るか、組の W.A.S. が was を切ると、全部の隊が back になる
   gather / sync: approach の距離と、着く時刻の差の目安（分。遅い隊に速さを合わせ、着いた隊は待つ）。slowest: 速さを合わせるときのいちばん遅い割合
   方角守備隊 screen（第6節、ユーザー決定 2026-10-28。数値は仮）: 動きは screen だけ。守るもの ward（推進器の名前と点 [x, z, alt] の並び）から reach 以内に見えた敵の
     真ん中（隻数の重み）と、いちばん近い守るものの間に割り込む（守るものから 敵までの距離 − gap の所。持ち場の中心 op.packs[].post から out まで）。隊は spread ずつ横に並ぶ。
     立つ所の射程に入った敵を撃つ。敵がいなければ自分の持ち場へ戻る。予備（reserve）は持ち場で待ち、wasR 以内に入った敵へ W.A.S. を出す */
WOS_DATA.doctrines={
  mars:{
    spear:{slots:{shield:['ff'], mother:['mas','masc'], knife:['dd']}, how:{shield:'screen', knife:'flank'},
      steps:[{all:'approach', next:'sync'}, {shield:'charge', mother:'charge', knife:'hold', next:'wasOn'}, {all:'charge'}],
      breakOff:{slot:'shield', below:.5, was:.3}, gather:55, sync:15, slowest:.2, front:8, holdR:30},
    mistHammer:{slots:{mist:['mas','masc'], hammer:['cl']}, how:{mist:'antiAir', hammer:'edge'}, prey:['cvb','masc','ff','cl'],
      steps:[{mist:'charge', hammer:'hide', next:'wasOn', after:20}, {all:'charge'}], holdR:30},
    rockShield:{slots:{wall:['ff'], rim:['cl'], reserve:['mas','masc']}, how:{reserve:'over'}, at:{wall:'front', rim:'rim', reserve:'shadow'},
      steps:[{wall:'hold', rim:'hold', reserve:'hide', next:'hit'}, {wall:'hold', rim:'hold', reserve:'charge', next:'lost'}, {wall:'hold', rim:'hold', reserve:'hide'}],
      front:10, rim:28, shadow:30, over:15, holdR:30, faceR:150},
    screen:{slots:{wall:['ff','dd'], rim:['cl'], reserve:['mas','masc']}, steps:[{wall:'screen', rim:'screen', reserve:'screen'}], reach:130, gap:40, out:100, wasR:40, spread:9,
      /* 仮（#248）: op.feintRemake と packs.pursueFeint のある第6節だけ。撃った隊を65 gameSec・postから175まで追い、戻って12秒置く。予備は壁の18後ろ。 */
      chase:{out:175,seconds:65,gap:10,reserve:18,cooldown:12}},
  },
};
