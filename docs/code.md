# コードの構成

CLAUDE.md の「ファイルと動かし方」の詳しい版。コードを触るときに必要な部分だけ読む。

## ファイル
- `index.html`: HUD の骨組みと読み込みだけ。ビルド不要、`file://` でも動くよう ES モジュールではなく普通の `<script>` で読む。
- `data/`: ゲームのデータ。`window.WOS_DATA` にまとめる。数値や作戦を足すときはここだけ直す。書き方は各ファイルの先頭のコメント。
  - `ships.js` 艦種と小型機、部隊の名前の表（`unitNames`）、対空（`aa`）
  - `bonuses.js` 編成ボーナス
  - `operations.js` 作戦。並びは 1. 演習「要塞カリュブディス攻略戦」（出撃画面のクイック出撃もこれ）、2. 第一章第1節「ネオ信濃奇襲」、3. 第2節「後退」、4. 第3節「ナイル防衛線」、5. 第4節「デナリの盾」、6. 第5節「フェブルアーリア防衛戦」、7. 第6節「デナリ破砕」（2026-10-24、作りかけ。`hidden:true` で出撃画面に出さず、`WOS.start({op:'denaliBreak'})` でだけ開く。第4節のデナリを使うので配列のあとに push で足す）
  - `tech.js` 解放・報酬・技術ツリー
  - `ground-rules.js` 地上・海上の12個の基本規則（`WOS_GROUND_RULES`）と既定の6中隊。地形より前に読む。入口 `groundRuleSet()` は基本 → 地形の `overrides` → 作戦の `groundRuleOverrides` → 試合中の変化を重ねた同じ結果を返す。開始・やり直しは `groundSetup()` から `rebuildGroundRuleSet()`、天候等の変化時は `rebuildGroundRuleSet(changes)` で変更一式を渡す。地形に残す `water.engineerBridgeMaxWidthKm` は川幅の判定用。
  - `ground-org.js` 規則の兵科表と既定の中隊一覧から地上編成を作る。`sortie()` は位置を決めず、地形や隠し作戦には依存しない。
  - `earth.js` Natural Earth の地球の陸地マスク（`tools/earth-mask.cjs` で生成）
  - `WOS_DATA.balance`（`operations.js`）: 全体の釣り合い。耐久の倍率 `hp` と艦の速さの倍率 `speed` は全部の作戦で同じで、戦闘の生成のときに掛ける（`battle/state.js` の `HP_K`・`SPEED_K`）。データと準備画面の表示は元の値
  - `WOS_DATA.roles`（`ships.js`）: 艦種別の動きの表（2026-10-22、ユーザー決定。陣営ごとの役目・狙い・距離・退き際。作戦の `roleAI:true` だけで使う。`docs/menu.md`「艦種別の動き」）
  - `WOS_DATA.doctrines`（`ships.js`）: ドクトリンの型（2026-10-22、ユーザー決定。共和国の槍・霧と鎚・岩の盾の枠・段・合図・退き際。作戦の `packs` だけで使う。`docs/menu.md`「ドクトリン（型）」）
  - `WOS_DATA.sides`（`ships.js`）: 両陣営の艦種の表（2026-10-20）。作戦データで `hp` を書いていない戦う艦隊は、陣営の表と作戦の `stage`（技術の段階）から `battle/state.js` の `techFleet` で値を出す（`makeFleet` の最初）
- `battle/`: 戦闘画面。一番外側の名前はファイル間で共有される（名前を変えるときは全ファイルを検索する）。読み込み時に呼ぶ処理は `loop.js` に置く。読み込み順:
  1. `scene.js` シーン・要塞・ステーション
  1.5 `terrain.js` 地上演習の盤と地表高度・マス経路・通行（`?ground=exercise2`）。`groundUnitSpec(u)` は `{name,kind,at:[xKm,yKm],band?}` と搭載中隊を艦隊の形へ変換し、`at` がなければそのまま返す。`groundSortieForces(op,org)` は作戦の `groundSortie`（`slots` または `site`・`radiusKm`、任意の `maxCompanies`・`bannedKinds`）で編成を制限・配置する。`groundResolveForces(op,cfg)` が既存の部隊選択をまとめ、宇宙は従来の仕様を返す。`groundSetupCoordinates()` は視点の `targetKm` と案内の `at` を再変換する（併設されたチュートリアルの印はその地図の座標を使う）。
  2. `effects.js` 粒子・曳光弾・矢印
  2.5 `base.js` 第5節の総基地のゲート（八角形のふた、状態の帯、塞いだ瓦礫）と強化歩兵の点・撃つ見た目（2026-10-16。共和国の強化歩兵の赤い点 `drawTroops` は 2026-10-18。描くだけ。シールド・塞ぐ・守備隊の仕組みは `sim.js`）。地表の砲台の案I（`pitBuild`・`pitDraw`: 竪穴をステンシルで岩に見せる、向きと仰角、砲台の強化歩兵。2026-10-17。仰角の制限 `pitCan` と砲台の歩兵の射撃は `sim.js`。後処理の描画先にステンシルを持たせたのは `scene.js`）
  3. `shapes.js` 艦と小型機と地表の砲台・推進器の形（艦の古い形は、地上の画面の海の戦闘母艦・突撃揚陸艦がまだ使う。準備画面のドックは 2026-11-14 から新しい形）
  3.1 `ground-shapes.js` 地上・航空・海上・宇宙の艦の模型、編隊 `GROUND_FORMS`、陣営別の `groundModelFor(kind, side)` と見本用の `kind[@side]:key:size:form` 差し替え。採用表 `GROUND_MODELS`（地上）と `SPACE_MODELS`（宇宙の艦。地球 `sp*`、共和国 `sp*M`）。表にない兵科は従来の形を使う。
  4. `units.js` 名札・メッシュ・軌跡。宇宙の艦の `shipMeshes` は平らな面と頂点の色、共和国の形は `<艦種>@mars` の鍵で、`shipMeshKey(f,type)` が選ぶ
  5. `state.js` 状態・艦隊生成・ロスター・`reset()`・戻す
  6. `hud.js` パネル・任務欄・会話・命令・視点・入力・メニュー
  7. `sim.js` 索敵・戦闘・小型機・出来事・敵 AI・`step()`。天体の陰と回り込み（`bodyBlocks` / `detour`、`makePath` が経由点を足す）、敵の目標選び（`pickFoe`）と立つ位置（`slotOf`）、挟撃（`pincers`）、デバッグのオートモード（`autoAI`）、小型機と母艦をつなぐ（`tetherCarriers`。`step()` で艦が動いたあと、出ている隊を発艦の距離の外に残さないよう母艦を止める。2026-10-22）、艦種別の動き（2026-10-22。作戦の `roleAI` だけ。`roleOf` で隊の役目（いちばん上位の艦種と陣営、表は `data/ships.js` の `WOS_DATA.roles`）を出し、`pickFoe` の係数 `aimK`、撃つ相手 `roleFoe`（`fireTargetOf`）、小型機の `roleCraftFoe`（`craftTarget`）、立つ距離 `roleStand`（`standOff`）、下がるか `backsOff`（`stepFight`・`fallBack`）、AI の `roleFirst`（退き際・逃げる）と `rolePlace`（盾・母体・目・傘の位置）、`roleClamp`（戦艦と傘の持ち場）。自軍の隊は `roleMove` が null で狙いだけ）、ドクトリンの型（2026-10-22。作戦の `packs` だけ、共和国だけ。`initPacks`（`reset()` から）で組を作り、`enemyAI` の中で `stepPacks` が組・目標・守るもの・合図・退き際・そろって着く速さを決め、`packAI` が隊ごとの動き（approach・charge・hold・hide・back）を出す。作戦の `ai` の分岐のあと、艦種別の動きの前。立つ点は `f.packSpot`（`step()` の `stepFight`））
  7.2 `ground.js` 地上作戦だけの3段（`band`・遷移先・残り秒）、水平距離の段別射撃、航空の3機編隊と層の格子。切り替え中は元の段で射撃し、描画高度だけ補間する。航空は低・高、陸戦型 W.A.S. は3段、地上部隊は地上のみ。左下の命令は複数選択の共通段だけ有効、表示は射撃に影響しない。仮値は `data/ground-rules.js` の `bands`。航空の1隊は既存耐久100の1部隊を3機の形で表す。
  7.2.0 `ground-script.js` 地上の台本。`ground.js` の直後に読む。`groundScriptEval(script,state)` は plain data の純粋な判定、`groundScriptStep(dt)` は占拠更新後の適用。勝敗は毎ステップ、出来事は0.5ゲーム秒ごと。増援も `groundInitUnit(f)` を通す。試合中の状態は作戦データから分離し、resetで初期化。条件とすることは `docs/ground-script.md`。
  7.2.1 `ground-plan.js` 地上作戦だけの線指定による布陣・進撃計画・実行。`ground-script.js`の後に読み込み、計画は作戦中の部隊だけに保持する。
  7.2.2 `ground-area.js` 地上専用の円形・曲線帯状砲撃、1〜30回の予約、範囲描画と未発射分の取消・復元。`ground-plan.js` の直後に読み込む。仕様と仮値は `docs/ground-area.md`。
  7.5 `cut.js` 会話の後ろに出す絵（第6節のかすめる場面。2026-10-28）。会話の行の4つ目の要素で `showCut`、出ているあいだは `loop.js` が戦場の代わりに描く
  7.8 `tutorial.js` 演習の段の進行と、下のセリフの板の案内・光る枠・地図の目標地点。段の文と対象は `charybdis.tutorial`、作戦時計は `opClock()` と停止秒 `clockHeld`
  8. `loop.js` 描画ループと起動。挟撃の矢じり（`pinchMarks`）
- `prep.js` / `prep.css`: タイトル、出撃、艦隊編集、技術ツリー、艦艇データ、オプション、デバッグ欄。`battle/` の後に読む。
- `tools/terrain-check.cjs`・`tests/terrain-check.cjs`: 地形検査。`node tools/terrain-check.cjs <地形id|all> [--json] [--perf]` で拠点・本営道路網・橋・6兵科の経路・架橋区間・浜・盤と海の塗りを調べる。不合格があれば終了コード1。ブラウザ不要の検査と壊した写しのテストは ground 組、`--perf` の Chromium 計測は手元だけ。性能の仮上限と基準値は `docs/ground-structure.md` 票5。
- `tests/smoke.cjs`: 自動確認。`tests/docs-check.cjs`: 資料の確認（`npm run check-docs`）。
- `tools/ground-start-snapshot.cjs`: `before` / `after` で5種類の開始状態をJSON（test-results）、1600×900の写真（.shots）に保存する。`tests/fixtures/ground-start-before.json` は変更前の実測。`tests/ground-forces.cjs` がkm変換・出撃制限・配置不足・固定配備と本営周囲の開始位置を ground 組で確認する。確認用ファイルなのでゲームの配信・script一覧へは加えない。
- `tools/`: 確認用の道具（ゲームは使わない）。`tools/body-shots.cjs` は天体の見本の画像、`tools/retreat-sim.cjs` は第2節、`tools/denali-sim.cjs` は第4節、`tools/februaria-sim.cjs` は第5節の早送り（`q` はデバッグのオートモード `autoAI` をそのまま使う。2026-10-19）、`tools/op-sim.cjs` はどの作戦でも早送りして勝ち負け・長さ・沈んだ隻数を出す（2026-10-20）、`tools/length-sim.cjs` は第1〜6節の長さの表（2026-10-30）、`tools/feint-sim.cjs` は第6節の止まっている隊・陽動・方角守備隊・オートモードの分岐の記録（2026-10-30）。`tools/ch1-check.cjs` は1つの作戦を最後まで早送りして、例外・console.error・任務欄と名札の NaN／undefined を集める（第一章の通しのバグ取り、2026-11-05）。`STAGE=1` を付けると自分の艦隊をその作戦の技術の段階まで研究した値にする（`tools/browser.cjs` の `toStage`）、`tools/ally-targets.cjs` は友軍の狙う相手の表。`tools/model-sheet.cjs`（地上モデルの見本ページ）・`tools/ground-model-shots.cjs`（ゲーム画面の写真）・`tools/model-floaters.cjs`（体から浮いた部品の一覧）は `docs/models.md` 4。`tools/tutorial-check.cjs`（演習のチュートリアル）・`tools/prep-tutorial-check.cjs`（準備画面のチュートリアル）・`tools/masc-check.cjs`（強襲母艦の配備と別枠）は `tests/smoke.cjs` から呼ぶ確かめで、1つだけでも走る。使い方は `docs/maps.md`。

## ライブラリ
Three.js r128（cdnjs）、OrbitControls と EffectComposer/UnrealBloom（jsdelivr の `three@0.128.0/examples/js`）。r128 なので新しい API（`BufferGeometry.applyQuaternion` など）はない。

## 保存
localStorage の `wos.save.v1`（進行は `prog`）。形式を変えたら `migrate()` で古いデータを直す。デバッグの切り替えは別のキー `wos.debug`、オプションは `wos.opt`（prep.js が `window.WOS_OPT` に置き、battle/hud.js が会話を出すか決める）。

## 画面のつながり
`prep.js` → `window.WOS.start({op, fleets, groups, flags})`（`hud.js`）。`fleets` を渡さなければ宇宙・固定作戦は `quick` を使う。編成が可変の地上作戦は保存された地上編成（空なら既定6中隊）を作戦の出撃地点へ配置する。地上のクイック出撃は `fleets:op.quick` を渡す。戦闘後は `window.WOS_MENU.open()`（`prep.js`）。

## 艦隊の仕様の形式
`prep.js` の `armyToFleet()` が打撃群をこの形にする。作戦データ（`data/operations.js`）の艦隊も同じ形。`type` か `comp` で艦の形が決まる。

```
{name, sub, n, hp, dmg, range, speed, scale, pos:[x,z], alt, vis, stl, type?, comp?:{艦種:隻数}, eva?, hangar?:{ftr, was}（宇宙港などは [{was, prey}, …] の並びにもでき、格納庫ごとに狙うものを変える。`makeHangars`、第6節 2026-11-05）, ai?, leash?, watch?:{pos:[x,z], alt}, preyLast?, fallBack?}
```

第5節で足したもの（2026-10-14）: 敵の `fallBack`（隻数がこの割合を切ると雲へ下がる。下がった艦は撃沈に数えない）、events の `ai.drops`（予備を守りの薄い降下点へ。`sim.js` の `weakDrop`）、`win.retreat`（5割で全部の敵が退き、少し見せてから勝利。`sim.js` の `stepRepel` と `repelT`）。2026-10-20: events の `ai.post`・`stack`・`gateFirst`（総攻撃の戦艦の戦線。1か所に2隊まで。`sim.js` の `frontPost`）。書き方は `data/operations.js` の先頭のコメント。
第5節で足したもの（2026-10-20〜21）: 総攻撃で戦艦が戦線の前の持ち場へ（`battle/sim.js` の `frontPost`、1か所2隊まで）。友軍の後退とゲートの守り（作戦データの `allyFall`・`guardGate`、ゲートが残り一つで全隊が集まる）。強化歩兵は4分の1点きざみで数える（`infQ`・`infR`。1点＝1個中隊）。艦砲が歩兵を撃つ射程は組の中心かいちばん近い点まで（`troopGap`）。`op.wipeLose:false` で自軍の全滅を負けにしない。共和国の突撃揚陸艦の W.A.S. は、データに `hangar` がなければ艦種の表（`sides.mars.ships.mas.was`）から `techFleet` が積む。退くかどうかの揚陸の量（`wasLeft`）もこれを数え、アルバレス隊（`ace`）の分も入れる
第5節で足したもの（2026-10-23）: 隊の出入り（作戦データの `rotate`、艦隊の `rotate:'名前'`。`battle/sim.js` の `rotHurt`・`rotStep`・`stepRotate`・`rotDue`。アルバレス隊が傷むと北の雲へ退き、次の揚陸の波で全快して戻る）。`wasLeft` は戻ってくる隊の W.A.S. を全部、これから来る分に数える
第6節で足したもの（2026-10-24、舞台と防衛線）: 段階の `linear`（一定の速さ）と `when:'breach'`、防衛線の `breach`（2026-10-28 にやめた）と events の `unless:'breach'`、型の `name`・`shade:'ward'`・`spare`・ward の並びと点の撃たれた判定・`start` の合図（`packCue`）、推進器 `type:'thr'`（`restore`）、友軍の `hurt`・`ownPost`、`body.dark`、空の `februaria.grow`（`battle/scene.js` の `growSky`）。書き方は `data/operations.js` の先頭のコメント、仮の数は `docs/menu.md`「第6節の舞台」
第6節で足したもの（2026-10-27、核を積んだ戦艦と着弾予想点）: 友軍の `nuke`、作戦の `nukes`、勝ち負けの `win.type:'deflect'` と `result.loseBy`（`battle/sim.js` の `stepNukes`。移乗で戦艦を1隻ずつの隊に分ける `nukeBoard`、予想点 `nuke.km` と 23:00 の見込み `nukeEst`、友軍の動き `nukeAI`。`packCue` の `descend`・`land`・`ignite` を出す）、任務欄の目盛りと印（`battle/hud.js` の `nukeHtml`・`nukeLabel`）
第6節を陽動の形に作り直したとき（2026-10-28）: 方角守備隊の型 `screen`（`data/ships.js`、`battle/sim.js` の `screenSpot`・`screenAI`）、友軍の陽動 `ai:'feint'` と作戦の `feints`（`feintAI`、3隻失ったときの `feintAssault`）、第二段階の合図 `lure`（`stepLure`・`lureCount`、合図の前は推進器の印を出さない `thrOff`）、`nukes.route`・`max`・`allOut`、作戦の `cap`、任務欄の第一段階と「目標更新中」（`battle/hud.js` の `nukeHtml`・`lureRows`・`goalFlash`）、戦艦の道の矢印（`drawRoute`、`loop.js` から毎フレーム）、推進器の印（`battle/state.js` の `makeFleet`、`.unit.thr`）、オートモードの作り直し（`autoDenali`）。やめたもの: 防衛線の突破（`breach`・`stepBreach`・`when:'breach'`）と砲撃線（`ai:'shell'`・`shellAI`）
第6節の釣り合わせ（2026-10-29）: 戦艦の護衛の友軍 `ai:'escort'`（`battle/sim.js` の `escortAI`、`allyAI` から）。移乗で分かれた戦艦の耐久は艦種の割合（`nukeBoard`）。オートモードの西の道（`op.auto.helpVia` を点の並びに、`frontZ`）と、第二段階で鉱山が空いたら戻せる推進器へ（`autoThr`）

第4節の警戒の隊と収容（2026-10-30、#240・#242）: 撤退の基準 `alliesAtLand`（着陸か警戒の隊の全滅の時点の本軍の隻数。`alliesLost`）、警戒の隊 `carrier.patrol`（`stepPatrol`・`finishPatrol`、狩る側は `patrolHunter` と `patrolHunting`）、収容の曲線 `rate`・`rateDecay`（`boardingTotal`、積分で計算）、2つ目の波は1つ目のあと（`stepLastWave`）。第4節と第6節の砲台は `WOS_DATA.denaliGun`（`data/operations.js` の先頭）。

## 確認
- 文字が欄に収まるかは、要素のスクリーンショットの見た目でなく、`document.createRange()` で文字の範囲を測って、欄の右端と比べる（2026-11-07: 撮った画像の端で「集中特化ドクトリン」が切れて見えたが、測ると収まっていた。行が高かったのは効果の文の折り返し）。準備画面の関数は外から呼べない（`prep.js` は包まれている）ので、編成画面は鍵のボタンの `disabled` を外して押して開く。
- メニューの画面は CSS の `zoom` で拡大・縮小する（`prep.css` の `--k`、タイトル以外はさらに 1.12 倍。`prep.js` `fitMenu`、#291）。`zoom` の中では `100vh` も縮むので、画面の高さに合わせるときは `zoom` の値で割る。`getBoundingClientRect()` は縮んだあとの大きさなので、`style.left/top` に入れるときも割り戻す（2026-11-05 #296: 技術ツリーの箱が画面の下まで届かず、ウィンドウが左上にずれた）。
- 新しい保存では、チュートリアルを終えるまでほかの作戦は鍵（#320）。準備画面から作戦を開く確かめは、デバッグの「一節だけクリア」を最初に押して飛ばすか、`WOS.start({op})` で直接始める。`prep.js` は即時関数の中なので、`show`・`prog` などは `page.evaluate` から呼べない（2026-11-05 に `show is not defined` で落ちた）。画面のボタンか `WOS_MENU` を使う。
- 戦闘画面の HUD は `.hud` の CSS の `zoom`（`--uis`）で拡大縮小する。画面の座標（`getBoundingClientRect()`・`proj()`）で置く物（チュートリアルの光る枠など）は `zoom:1` にして拡大させない（2026-11-05 #318: 1.2倍の画面で枠がずれた）。
- 確かめの道具に、データの座標（目標地点など）を写して書かない。`op` から読む（2026-11-06 #322: 目標 E を動かしたら、2か所に書いた古い座標で `tutorial-check` が落ちた）。
- `tests/smoke.cjs` は一続きの流れで、前のほうで変えたオプションが後ろの確認にも効く（例: 部隊の表示を「名前だけ」にしてから編成を確かめる）。期待する値は、その時点の設定で書く（2026-11-05 #295）。
- テストで任務欄（`#goalGates`）を読む前は `goalFlashT = 0` にする。合図や段階の切り替えのあと実時間1.5秒は「目標更新中」だけが出て、CI の速さによって印が見つからず落ちた（2026-10-29、#235）。
- 早送りの道具（`tools/`）は回すたびに `data/` を読み込む。回しているあいだにデータを書き換えない（途中から別の値で測ることになる）。数を試すときは `PATCH=` を使う。
`npm install` のあと `npm test`（`tests/smoke.cjs`、ヘッドレス Chromium。CDN の代わりに `node_modules/three` を返す）。git のワークツリーで並行して作業するときは、そこでも `npm install` する。`node_modules` をリンクで置くと、片付けたときに本体の `node_modules` が消える（2026-10-14。`.gitignore` はリンクも除外する）。同じテストが GitHub Actions で PR ごとに走る（上限30分。2026-10-24 に19分かかり20分で切れたので上げた）。`package.json` は確認用の道具だけ。Codex と併用するときのセットアップとテストの手順は `docs/collaboration.md`。

確定済みの地上命令アイコンは `data/command-icons.js` の `window.WOS_COMMAND_ICONS`。普通のscriptで `battle/ground.js` より先に読み、SVGをそのままボタンに入れる。寸法は36×22.5px（縮小指示後）。SVG内の線幅・パス・動作部分の色指定は変更しない。

工兵の地形判定は `battle/ground-transport.js` の `groundBridgeTerrain(xKm,yKm)`。命令の `groundBridgePlan` は橋の重複を幅と足場の間に確認する。地形だけの判定では `groundPass` / `groundRiverFactor` の `includeBuilt=false` で仮設橋を除き、命令では従来通り含める。`groundBridgeNoGoSections()` が拒否区間をまとめ、`battle/ground.js` の `groundBridgeNoGoHud` が選択に合わせて帯をキャッシュ表示する。`tools/bridge-nogo-shots.cjs` はチュートリアル2の架橋段を1600×900と390×780（3倍・mobile）で撮影し、`test-results/` に保存する。
