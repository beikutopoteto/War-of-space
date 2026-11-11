# 地上戦の手ごたえ

## ユーザー決定 2026-11-12

バイコヌール演習の「全体に長い、道路の占領が長い、補給がつながっていない、移動が遅い、敵味方とも硬い」を受けた変更。値はすべて仮。正本は `data/terrain/exercise2.js` の規則で、`baikonur2` と広域検証場はこれを複製する。チュートリアル2も同じ地上規則を使う。

|規則|仮の値|適用|
|---|---:|---|
|capture.roadSegmentKm|3 km|必須境界間の道路の所有単位の最大長|
|capture.neutralSeconds|0.5 秒|owner が null の道路・拠点|
|capture.roadSeconds|5 秒（据え置き）|敵道路の1区切り|
|capture.seconds|30 秒（据え置き）|敵拠点。作戦の個別指定も維持|
|movement.timeScale|1.2|地上の時計・移動・射撃・占領・補給・作業の時間すべて|
|movement.roadFactor|1.75|所有者を問わず道路帯内の陸上部隊|
|combat.damageScale|1.3|両軍の直射・間接・対空・航空・艦砲・地点攻撃|

道路は交点、拠点の大円の境界、恒久橋の通行範囲の両端、既存の `groundTerritory.sections` の端で切り、その間を最大3kmに分ける。折れ点は区切り内の折れ線として保持し、セル境界では切らない。所有・補給網・領域の塗りは同じ辺を使う。円内は拠点に従う。拠点への接続ノードは円内の道路から選び、中心だけの追加の切れ目を作らない。

道路帯は従来の幅1.25km、中心線から幅の半分以内。陸上のW.A.S.も加速し、航空・海上・浮いたW.A.S.は対象外。橋の上も道路。沼地減速を道路加速へ置き換え、通行不能な川を道路だけで渡れるようにはしない。経路のコストも同じ速度倍率、ヒューリスティックは最大倍率で割る。道路を1kmの空間索引に入れ、逆向きの辺コスト・セル内外判定を再利用する。地形と通行倍率別の格子を探索間で再利用し、セル配列の内容・道路座標・水域・橋の更新・規則変更を検出して破棄する。探索後の地形変更・橋の更新は次の探索で読み直す。水域・盤の縁に触れず同じ道路帯の中に収まる線は、幾何で等速を確認してサンプル積分を省く。NPCへの距離の受け渡しと補給図も折れ線全体へ追従し、頭の判断は変更しない。

倍率は `step` の地上分岐で一度だけ掛け、速度ボタンの表示は維持。損害倍率は共通の `damage` 入口で掛ける。機械の毎秒消耗は同じシミュレーション秒あたりの率を維持する。宇宙の時間・性能・損害、NPCの判断、戦車が橋で止まる別件は変更しない。

Escメニューのデバッグボタンに「オートモード：オン／オフ」を追加。宇宙・地上とも `autoMode`、bodyの `dbg-auto`、準備画面の保存 `dbg.auto` を同期し、メニュー内では停止を維持する。地上指揮官による自軍の自動操作は追加しない。

## 補給が届かなかった原因と修正

変更前の `baikonur2` をNodeの実データで調査すると、道路801辺のうち中立273辺。全9拠点が網に載り、開始時のA→B/G、F→E/Iは接続していた。恒久橋3か所は開通し、閉鎖は北の浅瀬上の2辺だけ。浅瀬に物流を通さない従来規則は維持する。交点の分裂や拠点の0.8km接続距離が、この配置での原因ではなかった。

主因は、中立道路まで5秒を要する細切れの個別占領。道路上を通過しても占領が終わらない区切りが残り、前線拠点を取っても本営との途中に中立道路が残って補給が切れる。区間を粗くし、中立を0.5秒に短縮することで、前進して道路を確保した際に連続した補給路を作れる。円外の敵道路は従来どおり個別の奪還が必要。

切り分けの再現では、拠点の中立占領時間は新条件に揃え、道路の構築・占領と移動倍率だけ変更前へ戻した。同じB→Dの道路前進後、旧条件は流量0（道路801辺）、新条件は流量1（112辺）。橋や拠点接続を変更せずに差が出ることを確認した。

`tests/ground-tempo.cjs` は、baikonur2のB→中央橋D、exercise2の本営B→中立Aを道路上の折れ線と経路探索が選んだ経路の両方で実移動し、途中の道路と拠点を実際に占領して前線への流量1を確認する。経由道路の敵所有で流量0、奪還で1に復旧することも確認。道路外への近道では補給路が自動で占領されないのは仕様。

## 確認・引き継ぎ

- Nodeの実関数で中立0.5秒、敵道路5秒、敵拠点30秒、道路長・折れ線・交点・帯境界、実移動の加速・除外兵科・沼地、道路を選ぶ経路、損害倍率、機械消耗、時間倍率、両地形の補給接続を確認する。
- 既存の秒数・損害量・経路・辺数に依存する確認を追従。領域キャッシュの既知の画素境界の丸め差は、ピクセルから地図座標への除算順を旧描画と揃えて修正し、従来の比較fixtureを保持。
- ブラウザ確認は `tests/ground-tempo.cjs` を `tests/smoke.cjs` から呼ぶ。Escメニューの実クリック、表示、保存、両戦場を確認する。撮影は `tools/ground-tempo-shots.cjs`（1600×900、`.shots/`、ページ例外を失敗扱い）。この環境ではChromiumを起動しない。実画面と写真はClaudeが実行する。
- 最終の `node tools/check-node.cjs` は40/40ファイル成功（Node v24.15.0）。`npm run check-docs`、変更JS/CJS全28ファイルの構文確認、`git diff --check` も成功。新規の地上テンポは48/48項目、索敵28/28、補給70/70、領域キャッシュ39項目、広域21/21。NPCの頭・宇宙橋渡しも成功。全体ログは `.shots/ground-tempo-node-final.log`。
- コミット・push・PR、非公開試遊ページの更新は行っていない。試遊ページへの反映は必要。

## 変更ファイル

- 規則・作戦: `data/terrain/exercise2.js`、`data/operations.js`（中立占領の案内文も追従）。baikonur2の規則は従来どおり複製し、独立の値を重ねない。
- 地上処理: `battle/ground-supply.js`、`battle/ground.js`、`battle/terrain.js`、`battle/ground-sight.js`、`battle/npc-ground.js`（折れ線の形への追従だけ）。
- 時計・共通損害入口・メニュー: `battle/sim.js`、`battle/hud.js`、`index.html`、`prep.js`。
- テスト: `tests/ground-tempo.cjs`（新規）、`tests/baikonur-map.cjs`、`tests/ground-aa.cjs`、`tests/ground-branches.cjs`、`tests/ground-capture.cjs`、`tests/ground-drill.cjs`、`tests/ground-landing.cjs`、`tests/ground-readouts.cjs`、`tests/ground-strike.cjs`、`tests/ground-supply.cjs`、`tests/ground-territory-cache.cjs`、`tests/ground-transport.cjs`、`tests/ground-wide-fields.cjs`、`tests/npc-ground.cjs`、`tests/smoke.cjs`。直接 `groundStep` を使う航空統合等の確認はシミュレーション秒の意味が変わらず、そのまま実行した。
- 道具: `tools/ground-tempo-shots.cjs`、`tools/ground-tempo-perf.cjs`（新規）、`tools/ground-fixes-shots.cjs`（折れ線対応）。
- 資料: `docs/ground-tempo.md`（本書）、`docs/ground-redesign-plan.md`、`docs/ground-controls-guide.md`、`docs/supply.md`、`docs/spec.md`、`docs/PROJECT_STATUS.md`。

## 経路性能の計測と未確認

`tools/ground-tempo-perf.cjs` でbaikonur2の7経路を各3回、変更前の `groundPath` と同じNode VMで順番に比較した。総平均は830.6→263.3ms（長距離・初回構築を含む）。ただし旧処理が直線を即座に返した中距離では増加が残る。中央値の例はB→Dが13.7→109.4ms、B→Cが11.3→195.1ms。これはブラウザの約17msの測定条件とは異なり、性能条件を満たしたとは扱わない。ログは `.shots/ground-tempo-path-perf.jsonl`。

Claude側で変更前の関数を保存してから、次を順番に実行する。Chromiumの操作・写真・ブラウザでの経路性能・全smokeは未確認。性能が増えるなら、道路を使う挙動と正しいコストを保って追加の最適化が必要。

```sh
git show HEAD:battle/terrain.js > /tmp/ground-tempo-before.js
node tools/ground-tempo-perf.cjs --browser --baseline=/tmp/ground-tempo-before.js
node tools/ground-tempo-shots.cjs
npm test
```

この作業では `git fetch origin` が共有Git管理領域の書き込み制限で失敗した。ユーザー指定によりコミットせず、差分を残して引き渡す。


## 試遊後の小修正（ユーザー決定 2026-11-12）

1. 補給部隊の士気自己回復: `groundSupplyAfter` が補給兵科を明示的に除外していたため、止まって休んでも回復しなかった。分配・移動の誤認ではない。除外を削除し、通常の待ち・土地の上限・被弾による待ち直しを適用する。旧テストも自己回復しない仕様を期待していたため修正した。
2. 士気の分配: 物資分配と同じ対象・距離・経路・建物遮蔽を使う。`exercise2.supply.moraleGiveMax=0.8`、`moraleGiveCost=0.5`（ともに仮）。速度は既存の `give=2/秒` を共用。物資満タンや網からの補充中も士気を回復できる。物資と同時に渡せるが、残量不足では物資を先に渡し、残りで士気を回復する。8割以上を切り下げず、回復実量だけ消費。状態表示・受給線は士気だけの回復にも対応する。詳細は `docs/supply.md`。
3. 架橋: `baikonur2.water.engineerBridgeMaxWidthKm` だけ0.3→0.5km（仮）。本流北半分・支流上流と0.5km境界で架橋でき、上限直後・本流下流・河口手前は拒否する。exercise2と広域検証場の0.3kmは維持する。

今回の変更ファイルは `battle/ground-supply.js`、`data/terrain/exercise2.js`、`data/terrain/baikonur2.js`、`tests/ground-supply.cjs`、`tests/ground-transport.cjs`、`tests/ground-wide-fields.cjs`、`tools/ground-supply-followup-shots.cjs`、本書・`docs/supply.md`・`docs/PROJECT_STATUS.md`。NPC・宇宙・その他の調整値は変更しない。

補給・架橋の追加ケースは既存の `tests/smoke.cjs` からも実行される。Chromium・全smoke・写真は未実行としてClaudeへ引き継ぐ。撮影台本は `tools/ground-supply-followup-shots.cjs`（1600×900、ページ例外は失敗、出力 `.shots/ground-supply-followup.png`）。コミットと試遊ページ更新は行わない。試遊ページへの反映は必要。

今回の確認結果: `node tools/node-tests.cjs` は39/39ファイル成功（この入口が検出するNode用テスト全件）。補給90/90、輸送・工兵54/54、広域23/23。`npm run check-docs`、変更JS/CJSの構文確認、`git diff --check` も成功。Chromiumは起動していない。Node全件ログは `test-results/node-tests/`。
