# 地上戦の寸法APIと描画格子（段階8）

2026-11-10。対象は寸法・索敵高度・弾道の接続。地形の正本は `data/terrain/exercise2.js` と `data/terrain/wide-fields.js`、広域の設計は `docs/terrain/wide-fields.md`。この実装で演習の配置を拡大して広域地形の代用にはしない。

## API

`GROUND_SCALE=4`（1km = 4 world）は維持する。地図座標は南西原点km、worldは盤の中心原点、北へZが減る。

- `groundData()`：`groundSetup(id)` の明示ID、setup前は `op.ground`、両方なければ旧 `exercise2` のデータ。登録済みデータを返し、lazy getterの広域データもそのまま扱う。
- `groundMapX(worldX)`、`groundMapY(worldZ)`：worldから地図kmへ変換。
- `groundWorldX(mapX)`、`groundWorldZ(mapY)`：地図kmからworldへ変換。盤外も値を丸めず、経路・通行判定側で拒否する。
- `groundDimensions()`：安定したobjectを返す。`widthKm,heightKm,widthWorld,heightWorld,halfWidthWorld,halfHeightWorld,halfWidthKm,halfHeightKm,minX,maxX,minZ,maxZ`、データ参照 `data`、下記 `mesh` と `texture` を持つ。
- `groundMeshGrid()`：`groundDimensions().mesh` と同じobject。`originX,originZ,stepX,stepZ,segmentsX,segmentsZ,verticesX,verticesZ`。原点とstepはworld単位。占領膜なども同じsegmentsを使う。

## 仮の性能値と互換

|地形|world寸法|mesh分割X×Z|step X/Z（world）|高度cache頂点数|地表texture|
|---|---:|---:|---:|---:|---:|
|exercise2|192×144|192×144|1 / 1|27,985|1152×864|
|field150|600×400|300×200|2 / 2|60,501|2048×1366|
|field300|1200×800|300×200|4 / 4|60,501|2048×1366|

長辺最大512分割、基準stepは1以上の2の冪。辺が割り切れない寸法は分割数を切り上げ、実stepを `widthWorld/segmentsX` と `heightWorld/segmentsZ` で定義する。頂点上限は513×513。地表と水面のgeometry、索敵の霧はこの同じ分割。三角形はThree.js r128のPlaneGeometryのindexに合わせ `tx+tz=1` の対角線で分ける。高度は同じ頂点から線形補間し、弾道も格子線と対角線で区切った全区間を二次方程式で交差する。直射も厳密交差を通し、LOSの固定サンプル間の狭い隆起を抜けない。

地表と水面maskは長辺2048pxまで、従来24px/kmを超えない。小数pixelは切り上げ。海色補助canvasは長辺1024、陰影補助は512までで縦横比を追従する。既存演習の各解像度は維持。影は従来の光源位置・カメラ範囲・farへ `max(1,widthWorld/192,heightWorld/144)` を掛けて盤に追従し、shadow mapは2048のまま。これらは仮の上限であり、GPU性能の達成値ではない。

森・低木・葦・建物はInstancedMeshを継続。森林の代表本数は従来 `round(objects.forest.count*.55)`。低木は `objects.shrubs.renderCount ?? count` を読み、旧exercise2だけrenderCount未指定時650株を維持する。広域はデータの1300/2400株を使う。既存の配置帯・区画・道路離隔を守り、描画側が全域へ再分配しない。試行回数上限に達した場合の実配置数は指定数より少なくなる場合がある。

`groundSetup` は同じIDで再生成する場合も寸法・高度・霧・建物index・弾道cacheを破棄する。setup前のop変更、登録データ参照、寸法、height/terrain/cells参照や高度関数の差替えも検知する。高さや建物を同じobject内で書き換えるデバッグ操作は従来どおり明示resetする。地形切替は `groundSetup(op.ground)` を呼ぶ。

## 確認範囲

`node tests/ground-dimensions.cjs` は実データと実Three.jsを読み、Canvas描画命令だけstubにする。旧座標と高度、150/300kmの往復・盤外・海上/橋/航空経路・沼地倍率、cache切替、描画indexの三角形との高度一致、geometry/texture cap、代表本数、非整数寸法、step2/4で対角線付近のごく狭い隆起を横切る弾道、極薄建物、直射のサンプル抜けを確認する。衝突用のデータ複製は検証fixtureに限定し、製品の地形設計には使わない。

ブラウザ描画、実写真、GPU負荷、広域の移動/索敵/補給全体の性能は主担当の確認。sky・view距離、他groundファイルの座標変換、占領膜、3層格子の接続は主担当が担当する。天候・道路・沼地・共通の速度等の仕様は変更しない。

## 作業時の確認状態

2026-11-10 18:06 JSTまでに構文確認（terrain / ground-sight / ground-ballistics）と既存弾道30/30を実行済み。専用寸法テストの初回は19/23で、低木の塊数を最大7固定とした期待値3件と、直射サンプル抜けの固定場面1件を修正した。主担当から同時編集中の確認停止指示を受け、修正後は再実行していない。最新一式の最終確認は主担当が行う。

広域の実計測で143kmの陸上経路に約1.1秒掛かったため、全区間の通行・速度検査で通常速度の直線が理論上の最短コストに一致した場合だけA*を省く。河川・沼地・減速・障害がある場合は従来の探索へ戻る。近道のために橋・浅瀬・川幅判定を省略しない。改修後の実測は最終確認時に記録する。

## 対象確認と実測

寸法23、独立した広域データ21、自動対空31、弾道30、操作53、輸送46、補給70が成功。実ブラウザで150×100/300×200km、メッシュ300×200、最大2048×1366pxの地表、fog192×128、占領膜480×320、ロケット50km、旧演習48×36と宇宙への解除を確認。ページ例外なし。検証配備は保存編成に置き換わらないようforces:fixedを指定する。

このMacでの1回ずつのCPU計算実測：53.3km経路は約132.7ms→3.5ms、143.1km経路は約1095.5ms→3.6ms。障害のない直線の最短コストを検証する高速経路による。同じ地点砲撃の可射マスクは総計約43〜45msを12〜13回へ分散し、1回の呼出し最大約3.7〜4.0ms。3.5msは協調予算で、単一弾道計算や描画用の確保中を中断する厳密な上限ではない。

これは計算関数の時間でFPSの測定ではない。非同期requestAnimationFrameによる間隔測定は待ちが終了せず中止したため、FPSの数値は報告しない。台本 `tools/ground-wide-check.cjs` は画面評価を30秒で打ち切り、手動の描画・経路計算を測る。写真 `.shots/ground-field150-overview.png` / `ground-field300-overview.png` は1600×900の実画面。航空統合後の最終確認は別途行う。
