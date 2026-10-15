# コードの構成

CLAUDE.md の「ファイルと動かし方」の詳しい版。コードを触るときに必要な部分だけ読む。

## ファイル
- `index.html`: HUD の骨組みと読み込みだけ。ビルド不要、`file://` でも動くよう ES モジュールではなく普通の `<script>` で読む。
- `data/`: ゲームのデータ。`window.WOS_DATA` にまとめる。数値や作戦を足すときはここだけ直す。書き方は各ファイルの先頭のコメント。
  - `ships.js` 艦種と小型機、部隊の名前の表（`unitNames`）、対空（`aa`）
  - `bonuses.js` 編成ボーナス
  - `operations.js` 作戦。並びは 1. 演習「要塞カリュブディス攻略戦」（出撃画面のクイック出撃もこれ）、2. 第一章第1節「ネオ信濃奇襲」、3. 第2節「後退」、4. 第3節「ナイル防衛線」、5. 第4節「デナリの盾」、6. 第5節「フェブルアーリア防衛戦」
  - `tech.js` 解放・報酬・技術ツリー
  - `WOS_DATA.balance`（`operations.js`）: 全体の釣り合い。耐久の倍率 `hp`（作戦の `hpScale` が優先）は戦闘の生成のときに掛ける（`battle/state.js` の `HP_K`）。データと準備画面の表示は元の値
- `battle/`: 戦闘画面。一番外側の名前はファイル間で共有される（名前を変えるときは全ファイルを検索する）。読み込み時に呼ぶ処理は `loop.js` に置く。読み込み順:
  1. `scene.js` シーン・要塞・ステーション
  2. `effects.js` 粒子・曳光弾・矢印
  3. `shapes.js` 艦と小型機の形
  4. `units.js` 名札・メッシュ・軌跡
  5. `state.js` 状態・艦隊生成・ロスター・`reset()`・戻す
  6. `hud.js` パネル・任務欄・会話・命令・視点・入力・メニュー
  7. `sim.js` 索敵・戦闘・小型機・出来事・敵 AI・`step()`。天体の陰と回り込み（`bodyBlocks` / `detour`、`makePath` が経由点を足す）、敵の目標選び（`pickFoe`）と立つ位置（`slotOf`）、挟撃（`pincers`）、デバッグのオートモード（`autoAI`）
  8. `loop.js` 描画ループと起動。挟撃の矢じり（`pinchMarks`）
- `prep.js` / `prep.css`: タイトル、出撃、艦隊編集、技術ツリー、艦艇データ、オプション、デバッグ欄。`battle/` の後に読む。
- `tests/smoke.cjs`: 自動確認。`tests/docs-check.cjs`: 資料の確認（`npm run check-docs`）。
- `tools/`: 確認用の道具（ゲームは使わない）。`tools/body-shots.cjs` は天体の見本の画像、`tools/retreat-sim.cjs` は第2節、`tools/denali-sim.cjs` は第4節、`tools/februaria-sim.cjs` は第5節の早送り、`tools/ally-targets.cjs` は友軍の狙う相手の表。使い方は `docs/maps.md`。

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

第5節で足したもの（2026-10-14）: 敵の `fallBack`（隻数がこの割合を切ると雲へ下がる。下がった艦は撃沈に数えない）、events の `ai.drops`（予備を守りの薄い降下点へ。`sim.js` の `weakDrop`）、`win.retreat`（5割で全部の敵が退き、少し見せてから勝利。`sim.js` の `stepRepel` と `repelT`）。書き方は `data/operations.js` の先頭のコメント。

## 確認
`npm install` のあと `npm test`（`tests/smoke.cjs`、ヘッドレス Chromium。CDN の代わりに `node_modules/three` を返す）。git のワークツリーで並行して作業するときは、そこでも `npm install` する。`node_modules` をリンクで置くと、片付けたときに本体の `node_modules` が消える（2026-10-14。`.gitignore` はリンクも除外する）。同じテストが GitHub Actions で PR ごとに走る。`package.json` は確認用の道具だけ。
