/* War of Space data: operations (maps). Values are provisional (see docs/menu.md).
   Classic script; goes into window.WOS_DATA. The first operation is used for クイック戦闘. */
window.WOS_DATA=window.WOS_DATA||{};

/* 作戦。座標は [x, z]（-z が北＝敵側）、alt は高度（上が +）。要塞は戦場の中央に置く。
   艦隊の書き方は CLAUDE.md の「艦隊の仕様の形式」と同じ。艦の形は type（全艦同じ艦種）か comp（{艦種: 隻数}）で決まる。
   name / summary / threat: 出撃画面に出す名前と説明　brief: 戦闘開始時の作戦概要
   date / start: 画面左上の日付と開始時刻。時計は1秒で15分進む。日をまたぐと日付も進む
   deploy: 出撃した軍集団の立方体の中心 [x, z]（立方体の前方は北）
   deployZone: 始まる前に軍集団を置ける範囲 {pos:[x,z], r}（書かなければ deploy から半径60の円）
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
   phase: 開始時の段階の名前　exit: 離脱点 {pos, alt}（地図に輪を出す）　view: 最初の視点 {target:[x,z], dist, dir?:カメラの向き [x,y,z]}
   events: 時刻の出来事 [{after, log?, phase?, fleet?, arrow?, blast?:[x,z,alt]}]（reinforcements と同じ形で、まとめて時刻順に起きる）
   convoy: 輸送船団 {fleet, depart, route:[{pos, alt}…], boardText?, escortText?}。depart 分まで乗船して動かず、そのあと route をたどる。最後の点が離脱点。
     boardText / escortText は左上の任務欄に出す指示（乗船中 / 出港後）
   win: {type:'escort', lose} なら、船団が離脱点を越えれば勝ち、輸送船を lose 隻失えば負け（書かなければ要塞の撃破で勝ち）
   onEnemyWAS: 敵の W.A.S. が初めて出撃したときの通知 [見出し, 本文]
   talk: 作戦の前後の会話 {before, win, lose}。どれも [[話し手, 台詞], …]。話し手を '' にすると地の文
   reward: クリアでもらえる資金（技術ツリーに使う。2回目からは data/tech.js の reward.replay の割合）
   aid: 初めてクリアしたときに一度だけもらえる資金 {funds, name}（name は結果に出す名前）
   group: {name, sync} 決まった艦隊（quick）で戦うとき、全艦隊をこの軍集団にまとめる
   result.loseBlast: 負けたときに爆発させる位置 [x, z, alt]
   field:'convoy' なら作戦フィールドの中心が輸送船団になり、船団と一緒に動く（枠の半径215、自軍は枠の外へ出られない）。
     convoy.depart を 0 にすると最初から航行する。convoy.sailSub は航行中の説明、pointName は任務欄でのゴールの名前
   clouds: プラズマ雲 [{pos, alt, r}]。中の艦は見える距離が半分、外から見つかる距離も半分（両方中なら4分の1）、速度1.1倍
   events の rel:true: fleet.pos と arrow.pos を作戦フィールドの中心からの位置で書く
   events の onSpot:{min, delay}: 敵に見つかったら delay 分後（min 分より前にはしない）に早める
   ai:'scout' は戦わずに見張る（見つけた相手から距離を取ってついていく）。patrol:[[x,z],…] はフィールドの中心からの巡回点（高度は watch.alt）
   ai:'pursue' は見えている相手を攻撃し、見えなければ最後に見つけた位置へ、そのあとは前方の雲を近い順に探す
   spotLog / shakeLog: 敵に見つかったとき / 振り切ったときの通知
   rescue: 救難信号 {after, pos（フィールドの中心から）, fleet, need（秒）, reach, lure?（向かってくる偵察隊の名前）, log, doneLog, lostLog}
   talk の台詞に3つ目の要素 'rescued' / '!rescued' を付けると、救助した / しなかったときだけ出す */
WOS_DATA.operations=[
  {
    id:'charybdis',
    reward:200,
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
      /* 戦艦を主軸とした主力艦隊: 硬く射程が長いが遅い（数値は仮） */
      {name:'第1主力艦隊', sub:'戦艦主軸', comp:{bb:6, cl:4, dd:4}, n:14, hp:46, dmg:4.6, range:26, speed:4, scale:1.6, pos:[-46,132], alt:0, vis:6, stl:2},
    ],
    enemies:[
      {name:'防空第1隊', sub:'北宙域守備', comp:{ff:10, dd:6}, n:16, hp:12, dmg:1.3, range:16, speed:7, scale:.8, pos:[0,-52], alt:18, ai:'guard', leash:42, vis:5, stl:5},
      {name:'防空第2隊', sub:'南宙域守備', comp:{ff:10, dd:6}, n:16, hp:12, dmg:1.3, range:16, speed:7, scale:.8, pos:[0,52], alt:-14, ai:'guard', leash:42, vis:5, stl:5},
      {name:'防空第3隊', sub:'東宙域守備', comp:{ff:10, dd:6}, n:16, hp:12, dmg:1.3, range:16, speed:7, scale:.8, pos:[54,0], alt:4, ai:'guard', leash:42, vis:5, stl:5},
      {name:'防空第4隊', sub:'西宙域守備', comp:{ff:10, dd:6}, n:16, hp:12, dmg:1.3, range:16, speed:7, scale:.8, pos:[-54,0], alt:22, ai:'guard', leash:42, vis:5, stl:5},
      {name:'近衛艦隊', sub:'要塞直掩', comp:{bb:4, cl:8}, n:12, hp:36, dmg:3.4, range:20, speed:5, scale:1.4, pos:[-8,-22], alt:-6, ai:'guard', leash:30, vis:6, stl:3},
    ],
    reinforcements:[
      {after:900,
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
    reward:300,
    chapter:'第一章 第1節',
    name:'ネオ信濃奇襲',
    summary:'開戦の日。中継ステーション「ネオ信濃」が惑星共和国の奇襲を受ける。司令は戦死。残った警備艦隊で、避難民を乗せた輸送船団を逃がす。',
    threat:'敵戦力：艦隊2（増援あり）・W.A.S.／目標：輸送船団の護衛',
    brief:'惑星共和国の奇襲で司令が戦死した。輸送船団（5隻）の乗船が終わる 16:00 まで敵を近づけず、出港した船団を離脱点まで守る。輸送船を3隻失えば作戦は失敗。',
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
      depart:600,
      boardText:'乗船が終わるまで、敵を輸送船団に近づけるな', escortText:'輸送船団を離脱点（南の輪）まで守れ',
      route:[{pos:[24,60], alt:-4}, {pos:[10,120], alt:0}, {pos:[0,175], alt:0}],
    },
    win:{type:'escort', lose:3},
    enemies:[
      {name:'前衛第1隊', sub:'共和国前衛', comp:{ff:6, dd:4}, n:10, hp:18, dmg:2.1, eva:.26, range:17, speed:9, scale:.9, pos:[-60,-150], alt:12, ai:'hunt', watch:{pos:[0,-15], alt:5}, vis:6, stl:6},
      {name:'前衛第2隊', sub:'共和国前衛', comp:{ff:6, dd:4}, n:10, hp:18, dmg:2.1, eva:.26, range:17, speed:9, scale:.9, pos:[55,-160], alt:-10, ai:'hunt', watch:{pos:[10,-10], alt:-5}, vis:6, stl:6},
    ],
    events:[
      {after:6, phase:'奇襲', blast:[0,0,3], log:['司令室に直撃', '遠距離からの砲撃がネオ信濃の司令室を貫いた。ヴァーグナー大佐との通信が途絶。']},
      {after:30, log:['全周波数で放送', '「我々は惑星共和国（アストラルリパブリック）である。火星は本日をもって地球連合を離れ、独立する」']},
      {after:60, phase:'乗船', log:['ハッダード曹長', '「司令室、応答ありません……。少尉、駐屯隊の指揮を。全隊をまとめて動かすなら右下の『全軍』か G キー、1隊ずつなら隊をクリックです。16:00 の乗船完了まで、敵を船団に近づけないでください」']},
      {after:150, log:['ハッダード曹長', '「敵は上下からも来ます。左の高度バーか Q/E で高さを合わせてください。敵をクリックすると、攻撃するか、その場所へ移動するかを選べます」']},
      {after:240, fleet:{name:'強襲揚陸隊', sub:'共和国 突撃揚陸艦', type:'mas', n:4, hp:22, dmg:1.8, eva:.2, range:13, speed:8, scale:1, pos:[-110,-120], alt:-24, ai:'hunt', watch:{pos:[16,14], alt:-10}, vis:5, stl:7, hangar:{was:40}},
        arrow:{pos:[-40,-40], alt:-18}, log:['ハッダード曹長', '「下方に大型艦。揚陸艦のようです。船団のほうへ向かっています」']},
      {after:600, phase:'出港', log:['リン船長', '「白鷺より。乗船完了、5隻とも出港します。……少尉、頼みます」']},
      {after:630, log:['ハッダード曹長', '「船団の航路は決まっています。Shift+クリックで経由地を足すと、船団に並んで進めます」']},
      {after:840, log:['ハッダード曹長', '「北に大きな反応。共和国の本隊です。数が違いすぎます」']},
      {after:900, phase:'離脱', fleet:{name:'共和国本隊', sub:'主力艦隊', comp:{bb:4, cl:8}, n:12, hp:40, dmg:3.6, eva:.14, range:21, speed:5.5, scale:1.5, pos:[0,-210], alt:18, ai:'hunt', watch:{pos:[0,60], alt:0}, vis:6, stl:3},
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
  {
    id:'retreat',
    reward:400,
    /* 第3節の前に強化する資金。いずれ技術ツリーのチュートリアルで渡す（ユーザー決定 2026-10-03） */
    aid:{funds:1000, name:'司令部からの緊急援助'},
    chapter:'第一章 第2節',
    name:'後退',
    summary:'ネオ信濃を出て3日目。共和国の偵察と本隊が追ってくる。プラズマ雲に隠れながら、輸送船団をナイルまで護衛する。',
    threat:'敵戦力：偵察隊5・本隊（W.A.S.）／目標：輸送船団の護衛（撤退）',
    brief:'作戦フィールドの中心は輸送船団で、船団と一緒に動く。プラズマ雲の中は見つかりにくいが、こちらも前が見えない。偵察隊に見つかると、共和国の本隊が見つかった部隊へ向かってくる。雲に隠れるか偵察を沈めて振り切り、船団を撤退地点まで守れ。輸送船を3隻失えば作戦は失敗。',
    forces:'fixed', field:'convoy', phase:'航行', view:{target:[0,30], dist:170, dir:[.25,.45,-.86]},
    date:'A.E. 45.04.15', start:'04:00',
    deploy:[0,0],
    exit:{pos:[0,450], alt:0},
    sectors:[
      {name:'撤退地点', sub:'ジャディード・ナイル方面', pos:[10,452]},
      {name:'信濃側航路', sub:'共和国の追撃が来る方向', pos:[0,-70]},
    ],
    /* 第1節の4隊。損害は引き継がず、2〜3割減らした数（ユーザー決定 2026-10-03） */
    quick:[
      {name:'第11哨戒戦隊', sub:'コルベット・哨戒', type:'cv', n:9, hp:11, dmg:1.3, eva:.36, range:14.8, speed:12, scale:.73, pos:[-26,-8], alt:6, vis:8, stl:9},
      {name:'第21護衛戦隊', sub:'フリゲート・護衛', type:'ff', n:8, hp:16, dmg:1.75, eva:.28, range:16.4, speed:10, scale:.82, pos:[24,4], alt:-4, vis:7, stl:7},
      {name:'第31駆逐戦隊', sub:'駆逐艦・雷撃', type:'dd', n:6, hp:21, dmg:2.65, eva:.24, range:18, speed:9, scale:.91, pos:[0,24], alt:0, vis:6, stl:6},
      {name:'第22護衛戦隊', sub:'フリゲート・予備', type:'ff', n:6, hp:16, dmg:1.75, eva:.28, range:16.4, speed:10, scale:.82, pos:[0,-28], alt:8, vis:7, stl:7},
    ],
    group:{name:'ネオ信濃駐屯隊', sync:false},
    convoy:{
      fleet:{name:'輸送船団', sub:'白鷺ほか', type:'tr', n:5, hp:30, speed:4, scale:1.4, pos:[0,0], alt:0, vis:4, stl:2},
      depart:0, sailSub:'ナイルへ航行中', pointName:'撤退地点',
      escortText:'輸送船団を撤退地点まで守れ。雲に隠れ、偵察を振り切れ',
      route:[{pos:[10,60], alt:0}, {pos:[-18,138], alt:0}, {pos:[-8,215], alt:0}, {pos:[22,295], alt:0}, {pos:[12,365], alt:0}, {pos:[0,450], alt:0}],
    },
    win:{type:'escort', lose:3},
    /* 航路はほとんど雲の中を通る。最後の区間（365〜450）は雲がない。6つ目の雲はカワセミ（10:00 に現れる位置）を包む */
    clouds:[
      {pos:[6,52], alt:0, r:34}, {pos:[-16,132], alt:2, r:40}, {pos:[-6,214], alt:-2, r:36}, {pos:[20,292], alt:0, r:38}, {pos:[14,352], alt:0, r:24},
      {pos:[112,128], alt:-4, r:30}, {pos:[-95,190], alt:6, r:34}, {pos:[85,330], alt:-8, r:28},
    ],
    enemies:[
      {name:'偵察第1隊', sub:'共和国 偵察', type:'cv', n:4, hp:11, dmg:1.2, eva:.36, range:14, speed:11, scale:.73, pos:[0,-200], alt:10, ai:'scout', stance:'evade', patrol:[[-70,-110],[70,-110]], watch:{pos:[0,0], alt:10}, vis:8, stl:8},
    ],
    events:[
      {after:15, log:['ハッダード曹長', '「船団は止まりません。作戦フィールドの中心は、いつも船団です。枠の外へは出られないので、予約指示（Shift+クリック）で先回りしてください」']},
      {after:60, log:['ハッダード曹長', '「雲の中は見つかりにくい。そのかわり、こちらの目も半分です。撃てば居場所がばれます。隠れるなら R で命令優先に」']},
      {after:90, rel:true, fleet:{name:'偵察第2隊', sub:'共和国 偵察', type:'cv', n:4, hp:11, dmg:1.2, eva:.36, range:14, speed:11, scale:.73, pos:[-215,10], alt:0, ai:'scout', stance:'evade', patrol:[[-120,50],[-120,-50]], watch:{pos:[0,0], alt:0}, vis:8, stl:8},
        arrow:{pos:[-140,10], alt:0}, log:['ハッダード曹長', '「左舷の外に小さな反応。偵察です」']},
      {after:180, rel:true, fleet:{name:'偵察第3隊', sub:'共和国 偵察', type:'cv', n:4, hp:11, dmg:1.2, eva:.36, range:14, speed:11, scale:.73, pos:[215,30], alt:-10, ai:'scout', stance:'evade', patrol:[[120,70],[115,-40]], watch:{pos:[0,0], alt:-10}, vis:8, stl:8},
        arrow:{pos:[140,30], alt:-10}, log:['ハッダード曹長', '「右舷にも偵察。網を張られています」']},
      {after:270, rel:true, fleet:{name:'偵察第4隊', sub:'共和国 偵察', type:'cv', n:4, hp:11, dmg:1.2, eva:.36, range:14, speed:11, scale:.73, pos:[20,-40], alt:80, ai:'scout', stance:'evade', patrol:[[0,70],[-30,-60]], watch:{pos:[0,0], alt:45}, vis:8, stl:8},
        arrow:{pos:[10,0], alt:50}, log:['ハッダード曹長', '「真上に偵察。高度を上げないと届きません」']},
      {after:450, rel:true, fleet:{name:'偵察第5隊', sub:'共和国 偵察', type:'cv', n:4, hp:11, dmg:1.2, eva:.36, range:14, speed:11, scale:.73, pos:[-20,10], alt:-80, ai:'scout', stance:'evade', patrol:[[40,-60],[-40,40]], watch:{pos:[0,0], alt:-45}, vis:8, stl:8},
        arrow:{pos:[-10,0], alt:-50}, log:['ハッダード曹長', '「下方にも偵察。上下も見張られています」']},
      {after:540, rel:true, phase:'追撃', onSpot:{min:450, delay:90},
        fleet:{name:'共和国本隊', sub:'追撃艦隊', comp:{bb:2, cl:6}, n:8, hp:40, dmg:3.6, eva:.14, range:21, speed:9, scale:1.5, pos:[0,-215], alt:10, ai:'pursue', vis:6, stl:3},
        arrow:{pos:[0,-140], alt:10}, log:['ハッダード曹長', '「後方に大型艦の光。本隊です。見つかった隊へ向かってきます」']},
      {after:555, rel:true, onSpot:{min:465, delay:105},
        fleet:{name:'追撃揚陸隊', sub:'共和国 突撃揚陸艦', type:'mas', n:2, hp:22, dmg:1.8, eva:.2, range:13, speed:9, scale:1, pos:[-30,-215], alt:-30, ai:'pursue', vis:5, stl:7, hangar:{was:20}},
        arrow:{pos:[-20,-140], alt:-25}},
      {after:1200, rel:true, phase:'最後の区間',
        fleet:{name:'追撃分隊', sub:'共和国 駆逐隊', comp:{ff:6, dd:4}, n:10, hp:18, dmg:2.1, eva:.26, range:17, speed:9, scale:.9, pos:[215,-40], alt:20, ai:'pursue', vis:6, stl:6},
        arrow:{pos:[140,-20], alt:20}, log:['ハッダード曹長', '「ナイルの手前は雲が切れています。右から追撃分隊。高度で船団の上下を固めて、一気に抜けてください」']},
    ],
    spotLog:['ハッダード曹長', '「見られてます。本隊がこっちへ向きを変えました。雲に入るか、偵察を沈めてください」'],
    shakeLog:['ハッダード曹長', '「……見失ったようです。本隊は最後の位置へ向かっています」'],
    rescue:{after:360, pos:[120,20], need:10, reach:18, lure:'偵察第3隊',
      fleet:{name:'貨客船カワセミ', sub:'救難信号', type:'tr', n:1, hp:30, scale:1.2, alt:-4, vis:3, stl:3},
      log:['救難信号', 'ベケレ機関士「こちら貨客船カワセミ、機関停止。乗客が……誰か、聞こえますか」　右舷の雲の端。寄るなら、乗客を移すあいだ（10秒）そばに付いていること。信号は共和国にも聞こえている。'],
      doneLog:['カワセミ 救助', 'カワセミの乗客を駐屯隊の艦に移した。船体は放棄する。'],
      lostLog:['救難信号 途絶', 'カワセミの救難信号が途切れた。'],
    },
    onEnemyWAS:['ハッダード曹長', '「下方から人型。船団の腹を狙っています」'],
    talk:{
      before:[
        ['', 'A.E. 45.04.15。ネオ信濃を出て3日目。駐屯隊は輸送船団を囲み、ナイルへの航路を進んでいる。'],
        ['ハッダード曹長', '傍受です。ミシシッピ、ドナウ、ともに応答なし。……共和国の放送では「解放した」と。'],
        ['ハッダード曹長', '重水素の残りは4割。タンクの半分は火星産ですよ。皮肉なもんです。'],
        ['リン船長', '船団は雲の中を通ります。速くは進めません。……守ってくださいね、少尉。'],
        ['ミナセ少尉', '全艦、船団から離れるな。撃つのは、見つかったときだけだ。'],
      ],
      win:[
        ['マンスール准将', 'こちらジャディード・ナイル。信濃の駐屯隊だな。……よく来た。船団の入港を誘導する。'],
        ['ベケレ機関士', 'ありがとう。ドナウを出てから、初めて味方の声を聞いた。', 'rescued'],
        ['', 'カワセミの救難信号は、いつの間にか途切れていた。ハッダードは何も言わなかった。', '!rescued'],
        ['ハッダード曹長', 'ナイルは、まだ地球連合の旗を掲げています。'],
      ],
      lose:[
        ['', 'ナイルに届いたのは、船団の最後の通信だけだった。'],
      ],
    },
    result:{
      win:'輸送船団はナイルにたどり着いた。',
      lose:'輸送船団を守りきれなかった。',
      winLog:['撤退地点 到着', '船団はジャディード・ナイルの誘導に入った。ナイルはまだ、地球連合の旗を掲げている。'],
      loseLog:['船団 壊滅', 'ナイルへの撤退は失敗に終わった。'],
    },
  },
  {
    id:'nile',
    reward:500,
    chapter:'第一章 第3節',
    name:'ナイル防衛線',
    summary:'ナイルに集まった友軍と防衛線を引く。避難が終わるまで、ジャディード・ナイルを共和国の先遣艦隊から守る。',
    threat:'敵戦力：先遣艦隊・突破隊・主力（W.A.S.）／目標：避難が終わるまでステーションを守る（防衛）',
    brief:'ナイルの避難が終わるまでステーションを守れ。友軍3隊が左翼・中央・右翼を受け持つ（友軍は操作できない）。駐屯隊は予備として、崩れたところへ回る。ステーションが撃たれると避難が遅れ、耐久が0になれば作戦は失敗。敵を全部沈めなくてもよい。',
    phase:'布陣', view:{target:[0,-10], dist:200, dir:[.2,.55,.81]},
    date:'A.E. 45.04.17', start:'06:00',
    /* 軍集団で出撃する（最初から持っている艦隊はネオ信濃駐屯隊。ユーザー決定 2026-10-03）。展開はステーションの後ろ */
    deploy:[0,42],
    sectors:[
      {name:'火星側', sub:'共和国の先遣艦隊が来る方向', pos:[0,-150]},
      {name:'地球側', sub:'避難船の航路', pos:[10,150]},
    ],
    /* 守るステーション（数値は仮）。耐久が削られた割合の半分だけ避難が遅れる（ユーザー決定 2026-10-03） */
    station:{name:'ジャディード・ナイル', sub:'中継ステーション', hp:700, dps:9, range:24, radius:9, vis:7},
    win:{type:'defend', need:840, text:'避難が終わるまでナイルを守れ'},
    evacShip:{name:'避難船', sub:'地球へ'},
    evacLast:{name:'病院船', sub:'アイゼンハウアー大元帥ほか'},
    evacLogs:[
      [.5, 'ハッダード曹長', '「避難、半分を越えました」'],
      [.9, 'ハッダード曹長', '「病院船に長官の移送が始まりました。最後の船です」'],
    ],
    /* 決まった艦隊で始めるとき（軍集団がないとき・テスト）の代わり。ふだんは軍集団で出撃する */
    quick:[
      {name:'第41巡洋戦隊', sub:'巡洋艦', type:'cl', n:6, hp:13, dmg:1.2, eva:.05, range:16, speed:5, scale:1.2, pos:[0,42], alt:0, vis:6, stl:4},
      {name:'第11哨戒戦隊', sub:'コルベット', type:'cv', n:9, hp:7, dmg:.6, eva:.11, range:12, speed:8, scale:.73, pos:[-16,42], alt:10, vis:8, stl:9},
      {name:'第21護衛戦隊', sub:'フリゲート', type:'ff', n:8, hp:8, dmg:.8, eva:.08, range:13, speed:7, scale:.82, pos:[16,42], alt:-10, vis:7, stl:7},
      {name:'第31駆逐戦隊', sub:'駆逐艦', type:'dd', n:6, hp:9, dmg:1, eva:.07, range:14, speed:6, scale:.91, pos:[0,26], alt:0, vis:6, stl:6},
      {name:'第22護衛戦隊', sub:'フリゲート', type:'ff', n:6, hp:8, dmg:.8, eva:.08, range:13, speed:7, scale:.82, pos:[0,58], alt:10, vis:7, stl:7},
    ],
    group:{name:'ネオ信濃駐屯隊', sync:false},
    /* 友軍（操作できない。ユーザー決定 2026-10-03）。持ち場から leash 以内の敵だけを追う。
       ドナウ残存隊は隻数が3分の2を切ると、減るほどステーションの後ろへ下がる（ユーザー決定 2026-10-03） */
    allies:[
      {name:'アマゾン残存隊', sub:'友軍 駆逐艦・巡洋艦', comp:{dd:6, cl:2}, n:8, hp:22, dmg:2, eva:.2, range:18, speed:6, scale:1, pos:[-70,-48], alt:0, vis:6, stl:5, leash:40},
      {name:'ナイル警備戦隊', sub:'友軍 フリゲート・駆逐艦', comp:{ff:8, dd:4}, n:12, hp:16, dmg:1.7, eva:.24, range:17, speed:7, scale:.9, pos:[0,-55], alt:0, vis:6, stl:6, leash:40},
      {name:'ドナウ残存隊', sub:'友軍 コルベット・フリゲート', comp:{cv:5, ff:4}, n:9, hp:13, dmg:1.4, eva:.3, range:15, speed:9, scale:.8, pos:[70,-48], alt:0, vis:7, stl:7, leash:40,
        retreat:{below:2/3, to:[24,26], log:['ノヴァーク大尉', '「こちらドナウ残存隊、もう持たない。……すまない、下がる」'],
          heldIf:'右翼突破隊', heldLog:['ノヴァーク大尉', '「……助かった、中尉。ドナウ残存隊、持ち場を維持する」']}},
    ],
    enemies:[],
    /* 時刻の出来事（作戦の時計の分。06:00 から）。敵の数値はすべて仮で、自分で編成した艦隊（研究前は3割）に合わせて弱めにしてある */
    events:[
      {after:15, log:['ハッダード曹長', '「友軍は自分の持ち場を守ります。こちらからは動かせません。崩れたところへ回るのが、うちの仕事です」']},
      {after:45, log:['ハッダード曹長', '「巡洋艦は遅いぶん硬い。線の正面に据えてください」']},
      {after:0, phase:'先遣', fleet:{name:'先遣第1隊', sub:'共和国 先遣艦隊', comp:{ff:6, dd:4}, n:10, hp:12, dmg:1.1, eva:.24, range:16, speed:9, scale:.9, pos:[-60,-150], alt:6, ai:'hunt', watch:{pos:[-10,-14], alt:4}, vis:6, stl:6}, arrow:{pos:[-50,-60]}},
      {after:0, fleet:{name:'先遣第2隊', sub:'共和国 先遣艦隊', comp:{ff:6, dd:4}, n:10, hp:12, dmg:1.1, eva:.24, range:16, speed:9, scale:.9, pos:[55,-150], alt:-6, ai:'hunt', watch:{pos:[10,-14], alt:-4}, vis:6, stl:6}, arrow:{pos:[50,-60]}},
      {after:90, log:['オリヴェイラ少佐', '「アマゾン残存隊、左翼につく。ここから先は通さないよ」']},
      {after:150, phase:'上下から', log:['ハッダード曹長', '「上と下からも来ます。友軍は自分の高さしか見ていません」'],
        fleet:{name:'第2波 上方隊', sub:'共和国 駆逐艦・巡洋艦', comp:{dd:7, cl:3}, n:10, hp:15, dmg:1.5, eva:.2, range:17, speed:9, scale:1, pos:[-20,-110], alt:58, ai:'siege', vis:6, stl:5}, arrow:{pos:[-6,-30], alt:30}},
      {after:150, fleet:{name:'第2波 下方隊', sub:'共和国 駆逐艦・巡洋艦', comp:{dd:7, cl:3}, n:10, hp:15, dmg:1.5, eva:.2, range:17, speed:9, scale:1, pos:[20,-110], alt:-58, ai:'siege', vis:6, stl:5}, arrow:{pos:[6,-30], alt:-30}},
      {after:330, phase:'右翼の突破', log:['ハッダード曹長', '「右から巡洋艦。ドナウ残存隊が押されています」'],
        fleet:{name:'右翼突破隊', sub:'共和国 巡洋艦・駆逐艦', comp:{cl:4, dd:6}, n:10, hp:16, dmg:1.5, eva:.18, range:18, speed:8, scale:1.1, pos:[150,-70], alt:0, ai:'hunt', watch:{pos:[8,-6], alt:0}, vis:6, stl:5}, arrow:{pos:[80,-50]}},
      {after:420, log:['オリヴェイラ少佐', '「こっちは心配いらないよ、中尉。うちの連中、逃げ足より踏ん張りのほうが得意でね」']},
      {after:480, phase:'主力の影', log:['ハッダード曹長', '「北に大きな反応。戦艦です。……数えたくないですね」']},
      {after:510, log:['マンスール准将', '「主力と撃ち合うな。時間を稼げばいい。勝つ必要はない」']},
      {after:510,
        fleet:{name:'共和国主力', sub:'主力艦隊', comp:{bb:4, cl:8}, n:12, hp:26, dmg:2.2, eva:.12, range:21, speed:7, scale:1.5, pos:[0,-95], alt:12, ai:'siege', vis:6, stl:3}, arrow:{pos:[0,-60]}},
      {after:600, phase:'最後の2時間', fleet:{name:'強襲揚陸隊', sub:'共和国 突撃揚陸艦', type:'mas', n:3, hp:20, dmg:1.4, eva:.2, range:13, speed:8, scale:1, pos:[-40,-120], alt:-30, ai:'siege', vis:5, stl:7, hangar:{was:24}}},
      {after:690, log:['傍受', 'アルバレス大尉「ナイルは本隊に任せろ。俺たちの出番は次だ」']},
    ],
    onEnemyWAS:['ハッダード曹長', '「下方から人型。ステーションの腹に取り付く気です」'],
    talk:{
      before:[
        ['', 'A.E. 45.04.17。ジャディード・ナイル。陥落したステーションから逃れてきた艦が、港の外にばらばらに浮かんでいる。'],
        ['マンスール准将', 'ミナセ少尉。……いや、今日から中尉だ。信濃の駐屯隊は君の隊だよ。肩書きが実際に追いつくだけだ。'],
        ['マンスール准将', '警備の巡洋艦を6隻つけた。足は遅いが、殴られても倒れない。'],
        ['リン船長', '白鷺は第一陣を乗せて、先に地球へ発ちます。地球で待ってます。……今度は、置いていかないでくださいね。'],
        ['ベケレ機関士', '白鷺の機関は年寄りだ。俺が付いていく。', 'kawasemi'],
        ['マンスール准将', 'もう一つ。医療区画に、宇宙軍の参謀長官がいる。アイゼンハウアー大元帥だ。ドナウで撃たれて、まだ動かせない。'],
        ['ノヴァーク大尉', 'ドナウから運び出せたのは、長官と、この隊だけでした。……長官は最後の病院船に乗せます。それまで、右翼は私たちが持たせます。'],
        ['ハッダード曹長', '避難が終わるのは 20:00。それまでここを動けない、ってことです。'],
        ['ミナセ中尉', '動かないのは初めてだな。……全艦、線の後ろで待機。'],
      ],
      win:[
        ['ハッダード曹長', '病院船、離脱しました。長官を乗せた最後の船です。'],
        ['ノヴァーク大尉', '……これで、ドナウでやり残したことは一つ減った。', 'ally:ドナウ残存隊'],
        ['マンスール准将', '全艦、後退。駐屯隊は友軍を連れて地球へ向かえ。'],
        ['ミナセ中尉', '砲台は、人がいなければ撃てません。殿は駐屯隊が引き受けます。准将は避難船と一緒に。'],
        ['マンスール准将', '中尉。それは年寄りの取り分だ。若いのに持っていかれるほど、私はまだ耄碌しちゃいない。'],
        ['マンスール准将', '中央の砲台は半分が黙った。右は押し込まれている。後ろに引く道もない。……文句のつけようがない状況だ。ナイル、これより打って出る。'],
        ['', 'ヴァーグナー大佐の「人を残すな」が、ミナセの耳に残っていた。答えが出ないまま、ミナセは後退を命じた。'],
        ['', '駐屯隊がナイルを離れて3時間後、ナイルとの通信が途切れた。8基の中継ステーションは、すべて共和国の手に落ちた。'],
      ],
      lose:[
        ['', 'ナイルの灯が消えた。乗りきれなかった避難船が、港の中に残っていた。'],
      ],
    },
    result:{
      win:'避難は終わった。',
      lose:'ジャディード・ナイルは陥落した。',
      winLog:['避難完了', '最後の病院船がナイルを離れた。駐屯隊と友軍は地球へ後退する。'],
      loseLog:['ナイル 陥落', 'ステーションの耐久が尽きた。避難は終わらなかった。'],
    },
  },
];
