# CLAUDE.md

宇宙艦隊戦の 3D リアルタイムストラテジー「War of Space」の試作。ブラウザだけで動く。このファイルは毎回読み込まれるので、短く保つ（詳しいことは下の資料へ）。

## 会話
- ユーザーとは日本語で話す。返事は短く、結論から。
- 指示が曖昧なときは、実装の前にユーザーへ選択式で質問する（ユーザー決定 2026-10-02）。
- ユーザーが決めた仕様（`docs/spec.md`）は勝手に変えない。戦闘や画面の動きを変える前に読む。Claude が仮に置いた数値は「仮」と明示し、`docs/menu.md` に記録する。

## 作業の進め方
- 正本はこのリポジトリ。ブランチを切って PR にし、`main` へ直接 push しない。
- PR のマージは Claude の判断で随時行ってよい（ユーザー決定 2026-10-02）。テストが通ってからマージする。
- 変更ができたら、ユーザーに聞かずに `/ship`（`.claude/skills/ship/SKILL.md`）の手順で最後まで進める: テスト → PR → CI → マージ → 試遊ページの更新（ゲームの中身が変わったとき）→ 短い報告。止めるのは、テストが直せないときと、ユーザーの判断が要るときだけ。
- 資料の整理と、このファイルを短く保つ作業は `/tidy-docs`（`.claude/skills/tidy-docs/SKILL.md`）。
- 物語の置き場所: 物語は章ごとに `docs/chapterN.md`、作戦の表と実装メモは `docs/campaign.md`、章をまたぐ世界設定は `docs/story.md`。節や章の叩き台は `/story-draft`（`.claude/skills/story-draft/SKILL.md`）の手順で書く。
- 範囲がはっきりした実装は、サブエージェント `wos-dev`（`.claude/agents/wos-dev.md`）に任せてもよい。小さな修正は直接やる。
- トークンを節約する: 資料は必要なものだけ読む。大きなファイルは grep で場所を探してから、その部分だけ読む。確認用のスクリプトはスクラッチパッドに置く。

## 資料（必要なときだけ読む）

| ファイル | 中身 |
|---|---|
| `docs/spec.md` | ユーザーが決めた仕様（見た目、操作、艦種、索敵、艦載機と W.A.S.、要塞） |
| `docs/menu.md` | 画面の流れ、細かい操作、仮の数値（能力値、索敵の式、艦載機の数値など） |
| `docs/roadmap.md` | 完成の定義、現在地、フェーズ、ユーザーの判断の一覧 |
| `docs/campaign.md` | キャンペーンの作戦の表、各節の実装メモ（編成、数値、仕組み） |
| `docs/chapter1.md` | 第一章の物語の正本（章の流れ、人物、各節のプロットと会話） |
| `docs/story.md` | 世界設定（年表、D-RAMS、W.A.S.、拠点、勢力） |
| `docs/tutorial.md` | チュートリアル（カリュブディス）の計画 |

## ファイルと動かし方
- `index.html`: HUD の骨組みと読み込みだけ。ビルド不要、`file://` でも動くよう ES モジュールではなく普通の `<script>` で読む。
- `data/`: ゲームのデータ（`ships.js` 艦種と小型機、`bonuses.js` 編成ボーナス、`operations.js` 作戦）。`window.WOS_DATA` にまとめる。数値や作戦を足すときはここだけ直す。書き方は各ファイルの先頭のコメント。最初の作戦がクイック戦闘、2つ目が第一章第1節「ネオ信濃奇襲」、3つ目が第2節「後退」。
- `battle/`: 戦闘画面。読み込み順は `scene.js`（シーン・要塞・ステーション）→ `effects.js`（粒子・曳光弾・矢印）→ `shapes.js`（艦と小型機の形）→ `units.js`（名札・メッシュ・軌跡）→ `state.js`（状態・艦隊生成・ロスター・`reset()`・戻す）→ `hud.js`（パネル・任務欄・会話・命令・視点・入力・メニュー）→ `sim.js`（索敵・戦闘・小型機・出来事・敵 AI・`step()`）→ `loop.js`（描画ループと起動）。一番外側の名前はファイル間で共有される。読み込み時に呼ぶ処理は `loop.js` に置く。
- `prep.js` / `prep.css`: タイトル、出撃、編成、艦艇データの画面。`battle/` の後に読む。
- ライブラリ: Three.js r128（cdnjs）、OrbitControls と EffectComposer/UnrealBloom（jsdelivr の `three@0.128.0/examples/js`）。r128 なので新しい API（`BufferGeometry.applyQuaternion` など）はない。
- 保存: localStorage の `wos.save.v1`。形式を変えたら `migrate()` で古いデータを直す。
- 連携: `prep.js` → `window.WOS.start({op, fleets, group})`（`hud.js`）。戦闘後は `window.WOS_MENU.open()`（`prep.js`）。
- 艦隊の仕様の形式（`prep.js` の `armyToFleet()` が軍をこの形にする。`type` か `comp` で艦の形が決まる）:

  ```
  {name, sub, n, hp, dmg, range, speed, scale, pos:[x,z], alt, vis, stl, type?, comp?:{艦種:隻数}, eva?, hangar?:{ftr, was}, ai?, leash?, watch?:{pos:[x,z], alt}}
  ```

- 確認: `npm install` のあと `npm test`（`tests/smoke.cjs`、ヘッドレス Chromium。CDN の代わりに `node_modules/three` を返す）。同じテストが GitHub Actions で PR ごとに走る。`package.json` は確認用の道具だけ。
- 試遊ページ: https://claude.ai/artifact/TZwfsz3vsyF6sgY3YYxPk1（ユーザーだけが開ける非公開ページ。GitHub Pages は公開になるので使わない）。ゲームの変更をマージしたら `/ship` の手順で載せ直す。

## いつも守ること
- 版権の名前は使わない。自軍「地球連合」（青）、敵「惑星共和国（アストラルリパブリック）」（赤）、要塞「カリュブディス」。「W.A.S.」を使い、「M.A.S.」は使わない。
- 画面を隠さない。新しい UI は小さく半透明で、たためるようにする。
- 販売は PC 向けだけ（ユーザー決定 2026-10-03）。スマホの画面は考えない（狭い画面向けの調整を足さない）。
