# war-of-space

宇宙空間での艦隊戦をテーマにした 3D リアルタイムストラテジーゲームの試作です。

- `index.html`: Three.js を使ったブラウザ版の試作。戦闘画面と、準備画面を読み込むシェル。ブラウザで開けば動きます。
- `data/`: 艦種、編成ボーナス、作戦（マップ）、解放・報酬・技術ツリーのデータ。コードを触らずに数値と作戦を足せます。地上戦の規則は `data/ground-rules.js`、地形は `data/terrain/`。
- `battle/`: 戦闘画面。宇宙の戦闘と、地上戦（`ground*.js`・`terrain.js`）、敵と友軍の指揮官（`npc-*.js`）。構成は `docs/code.md`。
- `prep.js` / `prep.css`: メインメニュー、出撃、艦隊編集（戦区軍・打撃群・支隊）、技術ツリー、艦艇データ、デバッグ欄。編成と進行はブラウザの localStorage に保存します。
- `tests/smoke.cjs`: 自動確認。`npm install` のあと `npm test` で、ヘッドレスのブラウザが主な画面と戦闘を一通り動かします。PR ごとに GitHub Actions でも走ります。
- `tools/`: 確認用の道具（天体の見本の画像、第2・4・5節の早送り、どの作戦でも早送りする `op-sim`、第1〜6節の長さの表 `length-sim`、第一章の通しの確かめ `ch1-check`、チュートリアルの確かめ `tutorial-check`・`prep-tutorial-check`、強襲母艦の確かめ `masc-check`、友軍の狙う相手の表）。
- `docs/`: 仕様とデザインの方向性（`spec.md`）、操作と仮の数値（`menu.md`）、コードの構成（`code.md`）、天体とマップの作り方（`maps.md`）、チュートリアル（`tutorial.md`）、会話を受け持つリコ軍曹の話し方（`riko.md`）、ロードマップ、キャンペーン、ストーリー、設定、評価の報告（`reports/`）。`docs/icons/` にアイコンの案（SVG）。
- `CLAUDE.md`: 作業の進め方と資料の案内（Claude Code が毎回読む）。`.claude/` にサブエージェントとスキル（`/ship`、`/tidy-docs`、`/story-draft`）。
- `AGENTS.md`: OpenAI Codex の入口。Claude と Codex の共通のルール（セットアップ、テスト、ブランチ、引き継ぎ）は `docs/collaboration.md`、作業中のブランチは `docs/PROJECT_STATUS.md`、設計の判断は `docs/DECISIONS.md`。
- 陣営: 自軍「地球連合」、敵「惑星共和国」（オリジナル設定）。
