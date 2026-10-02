/* War of Space data: operations (maps). Values are provisional (see docs/menu.md).
   Classic script; goes into window.WOS_DATA. The first operation is used for クイック戦闘. */
window.WOS_DATA=window.WOS_DATA||{};

/* 作戦。座標は [x, z]（-z が北＝敵側）、alt は高度（上が +）。要塞は戦場の中央に置く。
   艦隊の書き方は CLAUDE.md の「艦隊の仕様の形式」と同じ。艦の形は type（全艦同じ艦種）か comp（{艦種: 隻数}）で決まる。
   name / summary / threat: 出撃画面に出す名前と説明　brief: 戦闘開始時の作戦概要
   date / start: 画面左上の日付と開始時刻。時計は1秒で30秒進む
   deploy: 出撃した軍集団の立方体の中心 [x, z]（立方体の前方は北）
   sectors: 戦場に出す宙域の名前　fortress: 要塞（装甲 hp を0にすると勝利）
   quick: クイック戦闘で使う自軍　enemies: 開戦時の敵艦隊
     ai:'guard' は持ち場から leash 以内に来た敵だけを追う。ai:'hunt' は見えている敵を追い、
     見えないときは watch の位置で待つ。
   reinforcements: 増援。after は開戦から何分後か（作戦の時計）、arrow は登場時の矢印の向かう先、log は通知
   result: 勝敗の文。win / lose は結果画面、winLog / loseLog は解説パネル */
WOS_DATA.operations=[
  {
    id:'charybdis',
    name:'要塞カリュブディス攻略戦',
    summary:'二つの小惑星を接合した敵要塞。防空4隊と近衛艦隊が守り、開戦30分後に北から増援が来る。',
    threat:'敵戦力：艦隊5・要塞1／難易度：標準',
    brief:'二つの小惑星を接合した敵要塞。周囲の防空圏は東西南北の4隊と近衛艦隊が守る。艦隊を分けて防空隊を各個撃破し、要塞の装甲を0にすれば勝利。敵艦隊は味方の視界に入るまで見えない。',
    date:'宙暦0412.07.18', start:'08:00',
    deploy:[0,112],
    sectors:[
      {name:'北宙域', sub:'本国航路・増援の出口', pos:[22,-82]},
      {name:'東宙域', sub:'暗礁帯', pos:[86,10]},
      {name:'南宙域', sub:'連合艦隊の進入方向', pos:[-20,92]},
      {name:'西宙域', sub:'哨戒線のみ', pos:[-92,-12]},
    ],
    fortress:{name:'要塞カリュブディス', hp:3200, dps:18, range:46, radius:11, vis:8},
    quick:[
      {name:'第1突撃艇隊', sub:'高速・軽装', type:'cv', n:24, hp:10, dmg:1.25, range:15, speed:10, scale:.75, pos:[-24,112], alt:-8, vis:8, stl:7},
      {name:'第2戦隊', sub:'主力巡洋艦', type:'cl', n:10, hp:42, dmg:4.2, range:22, speed:5.5, scale:1.5, pos:[12,118], alt:6, vis:6, stl:4},
      {name:'第3戦隊', sub:'主力巡洋艦', type:'cl', n:10, hp:42, dmg:4.2, range:22, speed:5.5, scale:1.5, pos:[100,64], alt:24, vis:6, stl:4},
      {name:'第7機動部隊', sub:'戦闘母艦', type:'cvb', n:3, hp:70, dmg:1.6, range:14, speed:5, scale:1.6, pos:[-108,46], alt:-26, vis:7, stl:3, hangar:{ftr:120}},
    ],
    enemies:[
      {name:'防空第1隊', sub:'北宙域守備', comp:{ff:10, dd:6}, n:16, hp:12, dmg:1.3, range:16, speed:7, scale:.8, pos:[0,-52], alt:18, ai:'guard', leash:42, vis:5, stl:5},
      {name:'防空第2隊', sub:'南宙域守備', comp:{ff:10, dd:6}, n:16, hp:12, dmg:1.3, range:16, speed:7, scale:.8, pos:[0,52], alt:-14, ai:'guard', leash:42, vis:5, stl:5},
      {name:'防空第3隊', sub:'東宙域守備', comp:{ff:10, dd:6}, n:16, hp:12, dmg:1.3, range:16, speed:7, scale:.8, pos:[54,0], alt:4, ai:'guard', leash:42, vis:5, stl:5},
      {name:'防空第4隊', sub:'西宙域守備', comp:{ff:10, dd:6}, n:16, hp:12, dmg:1.3, range:16, speed:7, scale:.8, pos:[-54,0], alt:22, ai:'guard', leash:42, vis:5, stl:5},
      {name:'近衛艦隊', sub:'要塞直掩', comp:{bb:4, cl:8}, n:12, hp:36, dmg:3.4, range:20, speed:5, scale:1.4, pos:[-8,-22], alt:-6, ai:'guard', leash:30, vis:6, stl:3},
    ],
    reinforcements:[
      {after:30,
       fleet:{name:'第5戦隊', sub:'本国からの増援', comp:{bb:4, cl:6, dd:4}, n:14, hp:30, dmg:3, range:20, speed:6.5, scale:1.3, pos:[10,-150], alt:34, ai:'hunt', watch:{pos:[0,-38], alt:22}},
       arrow:{pos:[0,-60], alt:20},
       log:['北宙域に艦影の反応', '本国航路の出口で大きな反応。惑星共和国の増援とみられる。位置をつかむには視界に捉える必要がある。']},
    ],
    result:{
      win:'要塞カリュブディス陥落。',
      lose:'連合艦隊は壊滅した。防空隊を一つずつ引き剥がしてから要塞を叩こう。',
      winLog:['要塞カリュブディス陥落', '要塞の主砲が沈黙した。惑星共和国の防衛線は崩壊。'],
      loseLog:['連合艦隊 壊滅', '作戦は失敗に終わった。'],
    },
  },
];
