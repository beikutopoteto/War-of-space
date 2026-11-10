# 航空の連続飛行・非誘導投下（段階7）

2026-11-10。`battle/ground-air.js` は通常scriptで関数を定義し、必要なglobalsは呼出し時だけ読む。先に既存 `battle/ground-ballistics.js` を読み込む。`ground-air-orders.js` が連続運動、`ground-air-missions.js` が爆撃進入と帰投前後の任務保存を担当する。既存の命令・地上step・補給・一斉射・Undo・弾道表示へ接続済み。読み込み順はballistics→air→air-orders→air-missions→既存地上モジュール。ブラウザ確認・全作戦テストは未実行。

## API

- `groundBombSolution(f)`：実際の `pos`、`heading`、有効速度から非誘導落下のflightを返す。無効・接触を予測できない場合は `null`。目標座標・攻撃命令・敵・視界・乱数を読まない。
- `groundBombRelease(f,p)`：一定速度・海面基準高度で指定地点へ水平投下する仮の進入解 `{heading,releasePos,fallSeconds,physicalFallSeconds,speedWorld,altitudeMeters,target}` を返す。無効・解なしは `null`。fallSecondsはゲーム秒、physicalFallSecondsは物理秒。入力は変更しない。
- `groundBombState(f)`：コピーした始点・物理速度・座標変換sceneを返す内部用の補助関数。

flightは既存 `groundBallisticAt(flight,elapsedGameSec)` にそのまま渡せる。`mode:'indirect'` は既存評価器の重力分岐を使うための互換値で、`kind:'bomb'` が投下物を示す。`clear:true` は有効な最初の接触を計算できたという意味で、意図した目標に到達したという保証ではない。

`origin`、`target`、`impact` は戦闘座標のVector3。`originMeters`、`targetMeters`、`velocityMeters` はm・物理m/s。`duration` と `hitTime`、`collision.time` は実着弾までのゲーム秒で同じ値。`physicalDuration` は物理秒。`collision.point` は実着弾点、`reason` は最初に衝突した `terrain` または `building`。最初の障害物へその場で着弾し、その先の地表や指定地点へ瞬間移動させない。投下後に機体が動いたり向き・速度が変わっても、保存済み初期条件は変わらない。

## 単位と仮値

- 既存の重力9.81m/s²、`physicalSecondsPerGameSecond:10` を使う。速度は `speedOf(f)` があればその値、なければ `syncSpeed ?? speed`（world/gameSec）。操縦側が記録した `groundFlightVelocity`（world/gameSec、鉛直は実高相当）を優先し、未記録の純物理呼出しでは正規化したheadingへ速度を掛け、`1000/(GROUND_SCALE*10)` 倍して物理m/sへ変換する。速度に高度誇張を掛けない。機首に鉛直成分があれば初期鉛直速度も引き継ぐ。
- 仮の運用高度は既存highの19.2戦闘単位、すなわち地表から4800m（GROUND_SCALE=4）。計算時にこの高度へ強制せず、実際のposを使う。`pos.y` 自体が非有限・地表以下なら解なし。
- 描画地表 `H=groundSightHeight(x,z)` の実高は `H*1000/(GROUND_SCALE*elevationExaggeration)`。機体の地表からの高さ `(pos.y-H)*1000/GROUND_SCALE` は18で割らない。この和が海面基準の投下高度になる。描画には既存の「誇張地表＋誇張しないクリアランス」を使い、始点を実posと一致させる。
- 最大探索時間は仮に物理120秒（ゲーム12秒）。この時間より前に最初の接触を求められなければ `null`。範囲外へ適当な着弾を作らない。
- 地形・建物の衝突には `groundBallisticTrace` を再利用する。描画と同じ三角形平面、薄い建物の時間slab＋二次高さの交差を使う。建物の物理高は既存の中心地表基準の仮換算に従う。森を新しい弾止めにはしない。地形格子の既存の盤サイズ依存も引き継ぐ。

## 進入解の扱い

現時点の海面基準高度を一定、初期鉛直速度0、実機の水平速度一定と仮定する。指定点pは地表地点として扱い、p.yによる空中目標指定はしない。目標地表との差をΔhとすると、物理落下時間は `sqrt(2Δh/g)`、水平の先行距離は実水平速度×落下時間。現在位置からpへの向きに、その距離だけpの手前へreleasePosを置く。releasePosの描画高は計画上の一定物理高度を逆変換する。投下位置の地表が計画高度以上なら解なし。

これは進入設計のみで、旋回・地形回避・進入路・水平姿勢への整定は操縦側で扱う。追加の測量・照合ミニゲームは設けない。**実際に投下する時点で必ず移動後のfを渡してgroundBombSolutionを再計算する。** 進入解のtargetを弾へ渡したり、解の落下時間で着弾位置を強制しない。途中の地形・屋根へ先に衝突する場合も、実状態からの落下解を正本にする。

## 運動・命令との接続

- `groundAirMotion(f,dt)` は航空機を処理したらtrue。groundStepは通常followPath／地上追尾へ進まず、二重移動しない。移動・予約・手動攻撃は既存orderを使う。無命令は待機旋回、交戦時は観測済み目標だけを追う。訓練敵・固定敵・基地不在は動かさない。WASと宇宙には適用しない。
- 仮の旋回率0.8rad/ゲーム秒、前方対空射界は半角36度、待機半径max(1,speed/0.8)、到達判定0.8world。到着後も飛行を続けるので移動点へ瞬間移動して完全停止しない。戦闘機の2km、攻撃機の対地10／対空15km、WAS枠・非航空AAを維持。
- 通常はAGL飛行、爆撃進入中は進入開始時の海面基準の物理高度を保持する仮方式。機体の移動区間が横切る地形格子・三角形対角線の高さと建物箱を調べ、地表／屋根から仮0.5world以上へ回避する。高度変更の昇降率にはまだ実機の制約を置かない。盤端では中央へ戻る旋回を保持し、命令方向との交互切替で停止し続けないようにする。
- `groundStrikeInRange(f,p)` はhigh支援機の進入計画可能性、`groundStrikeCanLaunch(f,p)` は実投下姿勢＋再装填。旧全周5kmは使わず、データの固定対地射程は0。legacy range20・delay7・spread2は旧fixture用に残るが実爆撃の飛翔時間／着弾先を決めない。`groundStrikeRange` の航空到達参考値は現在状態での実落下の水平距離。索敵は既存の共有目視・地形／建物LOSを使い、sight.supportAircraft=100worldと既存地形高度の倍率を維持。発見と細部識別の新しい区分・レーダー能力は追加しない。
- `groundBombPrepare(f,{point}|{area})` はbool。`f.groundBombRun={ledger,plan,phase}`、ledgerは `{source,area,shot:{aim,impact},altitudeMeters,issued}`。範囲の狙点は一度だけ抽選して保持する。進入は投下点の上流6旋回半径→3旋回半径→直線追従。すでに進入線上なら直線へ入る。盤端は盤内の上流点を作れる方向を選ぶ。追加の測量操作はない。
- `groundBombStep()` は全隊移動後に実姿勢を調べる。仮の許容水平誤差0.5world（125m）、機首差0.15rad（約8.6度）、鉛直速度1m/s以下。許容内でも狙点への命中を強制しない。実飛行状態からgroundBombSolutionを再計算し、既存groundStrikeLaunch・弾表示・damageへ渡す。未観測座標を指示できる。投下後は無誘導で、途中の地形・建物への最初の衝突で着弾する。
- 残存機1機につき1発の一斉投下をgroundVolley台帳へ接続。指定1〜30回は投下斉射の回数で、実投下成功時だけarea.sentとremainingを一回進める。既存の仮威力16・爆風半径9world・reload10ゲーム秒を維持。散布で爆弾の速度や着弾を操舵せず、範囲内の狙点選択と実姿勢の誤差が着弾に残る。補給消費は既存airStrikeを斉射のentries数で分け、合計一回分。
- `groundBombCancel(f)` は進入・保存任務を解除。`groundCopyBombRun`／`groundRestoreBombRun` は共有ledgerを保持し、issuedなら復元しない。通常停止・別命令・撃墜・resetから呼ぶ。範囲Undoは共有area.sent、斉射Undoは共有fired/skippedを読むので発射済み弾・補給・cooldownを巻き戻さない。
- `groundCopyAirTask(f)`／`groundRestoreAirTask(f,snapshot)` は帰投前の通常命令・予約・進撃計画・残回数・未投下進入・未発射斉射を保存する。基地への内部移動を組む前にコピーし、基地から元の場所への復帰を終えてから復元する。内部移動の到着で予約を取り出さない。既存の基地補給100への回復は維持し、過去の消費値や発射済み台帳は復元しない。

## 対象確認と未確認

`node tests/ground-air.cjs`（元の物理21件）、`node tests/ground-air-orders.cjs`（運動8件）、`node tests/ground-air-integration.cjs`。各nodeChecksは{name,ok}行を返し、smokeのCI入口へ接続。実Three.js・既存三角形／建物・命令・damage・補給・Undoを使う。実投下、無誘導、薄い建物での衝突、停止、未観測地点、盤端進入、帰投復帰、予約、斉射費用、手動対空を確認する。旧固定7秒・厳密停止の対象fixtureは実仕様に合わせる。

この作業ではブラウザ・全作戦npm test・gitを実行しない。実際の旋回の見え方、盤端と高低差が重なる進入、模型・名札と弾道の重なり、全作戦の回帰はCIと実画面確認へ引き継ぐ。大規模モデル再制作・新UI・段階8以降は未着手。

支援機への通常の敵部隊攻撃命令も、観測済みの地上・海面座標を保持して爆撃進入へ接続する。進入開始後に目標へ弾を誘導しない。対象を失えば通常の命令解除、投下後に攻撃命令が残っていれば再装填後に次の観測位置への進入を計画する。対空装備のない支援機の航空目標に対するUI整理は最終統合段階で確認する。
