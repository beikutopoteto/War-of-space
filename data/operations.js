/* War of Space data: operations (maps). Values are provisional (see docs/menu.md).
   Classic script; goes into window.WOS_DATA. The first operation is used for クイック戦闘. */
window.WOS_DATA=window.WOS_DATA||{};

/* 作戦。座標は [x, z]（-z が北＝敵側）、alt は高度（上が +）。要塞は戦場の中央に置く。
   艦隊の書き方は CLAUDE.md の「艦隊の仕様の形式」と同じ。艦の形は type（全艦同じ艦種）か comp（{艦種: 隻数}）で決まる。
   name / summary / threat: 出撃画面に出す名前と説明　brief: 戦闘開始時の作戦概要
   date / start: 画面左上の日付と開始時刻。時計は1秒で30秒進む
   deploy: 出撃した軍集団の立方体の中心 [x, z]（立方体の前方は北）
   sectors: 戦場に出す宙域の名前　fortress: 要塞（装甲 hp を0にすると勝利）
     fortress.hangar / launchR: 要塞の艦載機（母艦と同じ {ftr, was}）と発進距離
     fortress.sortie: 装甲が below（割合）を切ったら、fleets（名前）の敵艦隊が持ち場を離れて迎撃に出る [{below, fleets, every?, log?}]。
       every（秒）を書くと、自軍に近い隊から every 秒ごとに1隊ずつ出る
   quick: クイック戦闘で使う自軍　enemies: 開戦時の敵艦隊
     ai:'guard' は持ち場から leash 以内に来た敵だけを追う。ai:'hunt' は見えている敵を追い、
     見えないときは watch の位置で待つ。
   reinforcements: 増援。after は開戦から何分後か（作戦の時計）、arrow は登場時の矢印の向かう先、log は通知
   result: 勝敗の文。win / lose は結果画面、winLog / loseLog は解説パネル
   ここから下は省略できる:
   chapter: 出撃画面に出す章と節　forces:'fixed' なら軍集団を使わず quick の艦隊で戦う（ストーリーの作戦）
   center: 中央の物。'station' は中継ステーション（攻撃の対象ではない）。fortress を書かなければ要塞は出ない
   phase: 開始時の段階の名前　exit: 離脱点 {pos, alt}（地図に輪を出す）　view: 最初の視点 {target:[x,z], dist}
   events: 時刻の出来事 [{after, log?, phase?, fleet?, arrow?, blast?:[x,z,alt]}]（reinforcements と同じ形で、まとめて時刻順に起きる）
   convoy: 輸送船団 {fleet, depart, route:[{pos, alt}…], boardText?, escortText?}。depart 分まで乗船して動かず、そのあと route をたどる。最後の点が離脱点。
     boardText / escortText は右上の任務欄に出す指示（乗船中 / 出港後）
   win: {type:'escort', lose} なら、船団が離脱点を越えれば勝ち、輸送船を lose 隻失えば負け（書かなければ要塞の撃破で勝ち）
   onEnemyWAS: 敵の W.A.S. が初めて出撃したときの通知 [見出し, 本文]
   talk: 作戦の前後の会話 {before, win, lose}。どれも [[話し手, 台詞], …]。話し手を '' にすると地の文
   group: {name, sync} 決まった艦隊（quick）で戦うとき、全艦隊をこの軍集団にまとめる
   result.loseBlast: 負けたときに爆発させる位置 [x, z, alt] */
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
    fortress:{name:'要塞カリュブディス', hp:3200, dps:18, range:46, radius:11, vis:8, hangar:{ftr:120}, launchR:70,
      sortie:[
        {below:.75, fleets:['近衛艦隊'], log:['近衛艦隊 出撃', '要塞の装甲が75%を切った。直掩の近衛艦隊が持ち場を離れ、迎撃に出てきた。']},
        {below:.5, fleets:['防空第1隊','防空第2隊','防空第3隊','防空第4隊'], every:20, log:['防空隊 迎撃', '要塞の装甲が50%を切った。四方の防空隊が、近い隊から順に迎撃に加わる。']},
      ]},
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
  {
    id:'shinano',
    chapter:'第一章 第1節',
    name:'ネオ信濃奇襲',
    summary:'開戦の日。中継ステーション「ネオ信濃」が惑星共和国の奇襲を受ける。司令は戦死。残った警備艦隊で、避難民を乗せた輸送船団を逃がす。',
    threat:'敵戦力：艦隊2（増援あり）・W.A.S.／目標：輸送船団の護衛',
    brief:'惑星共和国の奇襲で司令が戦死した。輸送船団（5隻）の乗船が終わる 06:20 まで敵を近づけず、出港した船団を離脱点まで守る。輸送船を3隻失えば作戦は失敗。',
    forces:'fixed', center:'station', phase:'警戒', view:{target:[0,40], dist:150},
    date:'A.E. 45.04.12', start:'06:00',
    deploy:[0,40],
    exit:{pos:[0,175], alt:0},
    sectors:[
      {name:'ネオ信濃', sub:'第8中継ステーション', pos:[16,-16]},
      {name:'火星側航路', sub:'共和国艦隊の進入方向', pos:[34,-150]},
      {name:'離脱点', sub:'ナイル方面', pos:[14,178]},
    ],
    quick:[
      {name:'第11哨戒戦隊', sub:'コルベット・哨戒', type:'cv', n:12, hp:11, dmg:1.3, eva:.36, range:14.8, speed:12, scale:.73, pos:[-30,-25], alt:6, vis:8, stl:9},
      {name:'第21護衛戦隊', sub:'フリゲート・護衛', type:'ff', n:10, hp:16, dmg:1.75, eva:.28, range:16.4, speed:10, scale:.82, pos:[28,-22], alt:-4, vis:7, stl:7},
      {name:'第31駆逐戦隊', sub:'駆逐艦・雷撃', type:'dd', n:8, hp:21, dmg:2.65, eva:.24, range:18, speed:9, scale:.91, pos:[-6,22], alt:0, vis:6, stl:6},
      {name:'第22護衛戦隊', sub:'フリゲート・予備', type:'ff', n:8, hp:16, dmg:1.75, eva:.28, range:16.4, speed:10, scale:.82, pos:[0,-40], alt:10, vis:7, stl:7},
    ],
    /* the four squadrons are named after rivers that flow into the Shinano */
    group:{name:'ネオ信濃駐屯隊', sync:false},
    convoy:{
      fleet:{name:'輸送船団', sub:'白鷺ほか', type:'tr', n:5, hp:30, speed:4, scale:1.4, pos:[16,10], alt:-4, vis:4, stl:2},
      depart:20,
      boardText:'乗船が終わるまで、敵を輸送船団に近づけるな', escortText:'輸送船団を離脱点（南の輪）まで守れ',
      route:[{pos:[24,60], alt:-4}, {pos:[10,120], alt:0}, {pos:[0,175], alt:0}],
    },
    win:{type:'escort', lose:3},
    enemies:[
      {name:'前衛第1隊', sub:'共和国前衛', comp:{ff:6, dd:4}, n:10, hp:18, dmg:2.1, eva:.26, range:17, speed:9, scale:.9, pos:[-60,-150], alt:12, ai:'hunt', watch:{pos:[0,-15], alt:5}, vis:6, stl:6},
      {name:'前衛第2隊', sub:'共和国前衛', comp:{ff:6, dd:4}, n:10, hp:18, dmg:2.1, eva:.26, range:17, speed:9, scale:.9, pos:[55,-160], alt:-10, ai:'hunt', watch:{pos:[10,-10], alt:-5}, vis:6, stl:6},
    ],
    events:[
      {after:.2, phase:'奇襲', blast:[0,0,3], log:['司令室に直撃', '遠距離からの砲撃がネオ信濃の司令室を貫いた。ヴァーグナー大佐との通信が途絶。']},
      {after:1, log:['全周波数で放送', '「我々は惑星共和国（アストラルリパブリック）である。火星は本日をもって地球連合を離れ、独立する」']},
      {after:2, phase:'乗船', log:['ハッダード曹長', '「司令室、応答ありません……。少尉、駐屯隊の指揮を。全隊をまとめて動かすなら右下の『全軍』か G キー、1隊ずつなら隊をクリックです。06:20 の乗船完了まで、敵を船団に近づけないでください」']},
      {after:5, log:['ハッダード曹長', '「敵は上下からも来ます。左の高度バーか Q/E で高さを合わせてください。敵をクリックすると、攻撃するか、その場所へ移動するかを選べます」']},
      {after:8, fleet:{name:'強襲揚陸隊', sub:'共和国 突撃揚陸艦', type:'mas', n:4, hp:22, dmg:1.8, eva:.2, range:13, speed:8, scale:1, pos:[-110,-120], alt:-24, ai:'hunt', watch:{pos:[16,14], alt:-10}, vis:5, stl:7, hangar:{was:40}},
        arrow:{pos:[-40,-40], alt:-18}, log:['ハッダード曹長', '「下方に大型艦。揚陸艦のようです。船団のほうへ向かっています」']},
      {after:20, phase:'出港', log:['リン船長', '「白鷺より。乗船完了、5隻とも出港します。……少尉、頼みます」']},
      {after:21, log:['ハッダード曹長', '「船団の航路は決まっています。Shift+クリックで経由地を足すと、船団に並んで進めます」']},
      {after:28, log:['ハッダード曹長', '「北に大きな反応。共和国の本隊です。数が違いすぎます」']},
      {after:30, phase:'離脱', fleet:{name:'共和国本隊', sub:'主力艦隊', comp:{bb:4, cl:8}, n:12, hp:40, dmg:3.6, eva:.14, range:21, speed:5.5, scale:1.5, pos:[0,-210], alt:18, ai:'hunt', watch:{pos:[0,60], alt:0}, vis:6, stl:3},
        arrow:{pos:[0,-90], alt:12}, log:['共和国本隊 到着', 'ネオ信濃の周りに共和国の主力艦隊。正面から戦っても勝ち目はない。R キーで「回避」に切り替えれば、撃たずに船団に付いて離れられる。']},
    ],
    onEnemyWAS:['ハッダード曹長', '「小型機多数！ 艦載機……いえ、違います。人型です！ 輸送船に取り付こうとしています！」'],
    talk:{
      before:[
        ['ヴァーグナー大佐', 'ミナセ少尉、夜勤ご苦労。火星側の航路に大きな反応があるそうだな。'],
        ['ハッダード曹長', '定期便の予定はありません。問い合わせにも応答なし。D-RAMS の反応、三十を超えます。'],
        ['ヴァーグナー大佐', '駐屯隊は待機。輸送船の乗船も急がせてくれ。念のためだ。'],
        ['ミナセ少尉', '了解しました。……大佐、反応がさらに近づいています。'],
      ],
      win:[
        ['リン船長', '白鷺より全船、離脱点を通過。……ありがとう、少尉。'],
        ['ハッダード曹長', 'ネオ信濃に共和国の旗が……。ほかのステーションも、同じ時刻に襲われたようです。'],
        ['ミナセ少尉', 'ナイルへ向かう。全艦、船団に続け。'],
      ],
      lose:[
        ['ハッダード曹長', '船団が……。少尉、ここにも敵弾が――'],
        ['', '予備指揮所に直撃。ハッダード曹長の通信は、爆音とともに途絶えた。'],
      ],
    },
    result:{
      win:'輸送船団はネオ信濃を脱出した。',
      lose:'輸送船団を守りきれなかった。',
      winLog:['ネオ信濃 脱出', '船団と駐屯隊はナイルへ向かう。背後のネオ信濃には共和国の旗が上がった。'],
      loseLog:['船団 壊滅', '予備指揮所に直撃。ネオ信濃からの脱出は失敗に終わった。'],
      loseBlast:[0,0,3],
    },
  },
];
