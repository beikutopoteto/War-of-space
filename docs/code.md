# コードの構成

CLAUDE.md の「ファイルと動かし方」の詳しい版。コードを触るときに必要な部分だけ読む。

## ファイル
- `index.html`: HUD の骨組みと読み込みだけ。ビルド不要、`file://` でも動くよう ES モジュールではなく普通の `<script>` で読む。
- `data/`: ゲームのデータ。`window.WOS_DATA` にまとめる。数値や作戦を足すときはここだけ直す。書き方は各ファイルの先頭のコメント。
  - `ships.js` 艦種と小型機、部隊の名前の表（`unitNames`）、対空（`aa`）
  - `bonuses.js` 編成ボーナス
  - `operations.js` 作戦。並びは 1. 演習「要塞カリュブディス攻略戦」（出撃画面のクイック出撃もこれ）、2. 第一章第1節「ネオ信濃奇襲」、3. 第2節「後退」、4. 第3節「ナイル防衛線」、5. 第4節「デナリの盾」、6. 第5節「フェブルアーリア防衛戦」
  - `tech.js` 解放・報酬・技術ツリー
  - `WOS_DATA.balance`（`operations.js`）: 全体の釣り合い。耐久の倍率 `hp` と艦の速さの倍率 `speed` は全部の作戦で同じで、戦闘の生成のときに掛ける（`battle/state.js` の `HP_K`・`SPEED_K`）。データと準備画面の表示は元の値
  - `WOS_DATA.roles`（`ships.js`）: 艦種別の動きの表（2026-10-22、ユーザー決定。陣営ごとの役目・狙い・距離・退き際。作戦の `roleAI:true` だけで使う。`docs/menu.md`「艦種別の動き」）
  - `WOS_DATA.doctrines`（`ships.js`）: ドクトリンの型（2026-10-22、ユーザー決定。共和国の槍・霧と鎚・岩の盾の枠・段・合図・退き際。作戦の `packs` だけで使う。`docs/menu.md`「ドクトリン（型）」）
  - `WOS_DATA.sides`（`ships.js`）: 両陣営の艦種の表（2026-10-20）。作戦データで `hp` を書いていない戦う艦隊は、陣営の表と作戦の `stage`（技術の段階）から `battle/state.js` の `techFleet` で値を出す（`makeFleet` の最初）
- `battle/`: 戦闘画面。一番外側の名前はファイル間で共有される（名前を変えるときは全ファイルを検索する）。読み込み時に呼ぶ処理は `loop.js` に置く。読み込み順:
  1. `scene.js` シーン・要塞・ステーション
  2. `effects.js` 粒子・曳光弾・矢印
  2.5 `base.js` 第5節の総基地のゲート（八角形のふた、状態の帯、塞いだ瓦礫）と強化歩兵の点・撃つ見た目（2026-10-16。共和国の強化歩兵の赤い点 `drawTroops` は 2026-10-18。描くだけ。シールド・塞ぐ・守備隊の仕組みは `sim.js`）。地表の砲台の案I（`pitBuild`・`pitDraw`: 竪穴をステンシルで岩に見せる、向きと仰角、砲台の強化歩兵。2026-10-17。仰角の制限 `pitCan` と砲台の歩兵の射撃は `sim.js`。後処理の描画先にステンシルを持たせたのは `scene.js`）
  3. `shapes.js` 艦と小型機の形
  4. `units.js` 名札・メッシュ・軌跡
  5. `state.js` 状態・艦隊生成・ロスター・`reset()`・戻す
  6. `hud.js` パネル・任務欄・会話・命令・視点・入力・メニュー
  7. `sim.js` 索敵・戦闘・小型機・出来事・敵 AI・`step()`。天体の陰と回り込み（`bodyBlocks` / `detour`、`makePath` が経由点を足す）、敵の目標選び（`pickFoe`）と立つ位置（`slotOf`）、挟撃（`pincers`）、デバッグのオートモード（`autoAI`）、小型機と母艦をつなぐ（`tetherCarriers`。`step()` で艦が動いたあと、出ている隊を発艦の距離の外に残さないよう母艦を止める。2026-10-22）、艦種別の動き（2026-10-22。作戦の `roleAI` だけ。`roleOf` で隊の役目（いちばん上位の艦種と陣営、表は `data/ships.js` の `WOS_DATA.roles`）を出し、`pickFoe` の係数 `aimK`、撃つ相手 `roleFoe`（`fireTargetOf`）、小型機の `roleCraftFoe`（`craftTarget`）、立つ距離 `roleStand`（`standOff`）、下がるか `backsOff`（`stepFight`・`fallBack`）、AI の `roleFirst`（退き際・逃げる）と `rolePlace`（盾・母体・目・傘の位置）、`roleClamp`（戦艦と傘の持ち場）。自軍の隊は `roleMove` が null で狙いだけ）、ドクトリンの型（2026-10-22。作戦の `packs` だけ、共和国だけ。`initPacks`（`reset()` から）で組を作り、`enemyAI` の中で `stepPacks` が組・目標・守るもの・合図・退き際・そろって着く速さを決め、`packAI` が隊ごとの動き（approach・charge・hold・hide・back）を出す。作戦の `ai` の分岐のあと、艦種別の動きの前。立つ点は `f.packSpot`（`step()` の `stepFight`））
  8. `loop.js` 描画ループと起動。挟撃の矢じり（`pinchMarks`）
- `prep.js` / `prep.css`: タイトル、出撃、艦隊編集、技術ツリー、艦艇データ、オプション、デバッグ欄。`battle/` の後に読む。
- `tests/smoke.cjs`: 自動確認。`tests/docs-check.cjs`: 資料の確認（`npm run check-docs`）。
- `tools/`: 確認用の道具（ゲームは使わない）。`tools/body-shots.cjs` は天体の見本の画像、`tools/retreat-sim.cjs` は第2節、`tools/denali-sim.cjs` は第4節、`tools/februaria-sim.cjs` は第5節の早送り（`q` はデバッグのオートモード `autoAI` をそのまま使う。2026-10-19）、`tools/op-sim.cjs` はどの作戦でも早送りして勝ち負け・長さ・沈んだ隻数を出す（2026-10-20）。`STAGE=1` を付けると自分の艦隊をその作戦の技術の段階まで研究した値にする（`tools/browser.cjs` の `toStage`）、`tools/ally-targets.cjs` は友軍の狙う相手の表。使い方は `docs/maps.md`。

## ライブラリ
Three.js r128（cdnjs）、OrbitControls と EffectComposer/UnrealBloom（jsdelivr の `three@0.128.0/examples/js`）。r128 なので新しい API（`BufferGeometry.applyQuaternion` など）はない。

## 保存
localStorage の `wos.save.v1`（進行は `prog`）。形式を変えたら `migrate()` で古いデータを直す。デバッグの切り替えは別のキー `wos.debug`、オプションは `wos.opt`（prep.js が `window.WOS_OPT` に置き、battle/hud.js が会話を出すか決める）。

## 画面のつながり
`prep.js` → `window.WOS.start({op, fleets, groups, flags})`（`hud.js`）。`fleets` を渡さなければ作戦の `quick` の艦隊で戦う（決まった艦隊の作戦とクイック出撃）。戦闘後は `window.WOS_MENU.open()`（`prep.js`）。

## 艦隊の仕様の形式
`prep.js` の `armyToFleet()` が打撃群をこの形にする。作戦データ（`data/operations.js`）の艦隊も同じ形。`type` か `comp` で艦の形が決まる。

```
{name, sub, n, hp, dmg, range, speed, scale, pos:[x,z], alt, vis, stl, type?, comp?:{艦種:隻数}, eva?, hangar?:{ftr, was}, ai?, leash?, watch?:{pos:[x,z], alt}, preyLast?, fallBack?}
```

第5節で足したもの（2026-10-14）: 敵の `fallBack`（隻数がこの割合を切ると雲へ下がる。下がった艦は撃沈に数えない）、events の `ai.drops`（予備を守りの薄い降下点へ。`sim.js` の `weakDrop`）、`win.retreat`（5割で全部の敵が退き、少し見せてから勝利。`sim.js` の `stepRepel` と `repelT`）。2026-10-20: events の `ai.post`・`stack`・`gateFirst`（総攻撃の戦艦の戦線。1か所に2隊まで。`sim.js` の `frontPost`）。書き方は `data/operations.js` の先頭のコメント。
第5節で足したもの（2026-10-20〜21）: 総攻撃で戦艦が戦線の前の持ち場へ（`battle/sim.js` の `frontPost`、1か所2隊まで）。友軍の後退とゲートの守り（作戦データの `allyFall`・`guardGate`、ゲートが残り一つで全隊が集まる）。強化歩兵は4分の1点きざみで数える（`infQ`・`infR`。1点＝1個中隊）。艦砲が歩兵を撃つ射程は組の中心かいちばん近い点まで（`troopGap`）。`op.wipeLose:false` で自軍の全滅を負けにしない。共和国の突撃揚陸艦の W.A.S. は、データに `hangar` がなければ艦種の表（`sides.mars.ships.mas.was`）から `techFleet` が積む。退くかどうかの揚陸の量（`wasLeft`）もこれを数え、アルバレス隊（`ace`）の分も入れる
第5節で足したもの（2026-10-23）: 隊の出入り（作戦データの `rotate`、艦隊の `rotate:'名前'`。`battle/sim.js` の `rotHurt`・`rotStep`・`stepRotate`・`rotDue`。アルバレス隊が傷むと北の雲へ退き、次の揚陸の波で全快して戻る）。`wasLeft` は戻ってくる隊の W.A.S. を全部、これから来る分に数える

## 確認
`npm install` のあと `npm test`（`tests/smoke.cjs`、ヘッドレス Chromium。CDN の代わりに `node_modules/three` を返す）。git のワークツリーで並行して作業するときは、そこでも `npm install` する。`node_modules` をリンクで置くと、片付けたときに本体の `node_modules` が消える（2026-10-14。`.gitignore` はリンクも除外する）。同じテストが GitHub Actions で PR ごとに走る。`package.json` は確認用の道具だけ。
