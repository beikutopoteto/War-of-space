# NPC地上橋渡し・バイコヌール演習の結果

2026-11-11、`claude/npc-doctrine`。作業票の実装。頭 `battle/npc-core.js` と規範の既存値は変更していない。試遊ページは更新していない。コミット・pushはしていない（Git管理領域への書き込みが禁止され、開始時のfetchも失敗）。

## 変更したファイル

- 新規 `battle/npc-ground.js`: 状況のkm変換、初期所有と共有視界、接触の記録、道路網の拠点間探索、軍ごとの判断時刻、任務から通常命令への変換、`npcDebug()`。
- `battle/ground.js`: NPCを有効な地上作戦だけで呼び、再初期化で状態を消す。敵本営占領または敵全滅の勝利判定。
- `battle/ground-sight.js`: NPC有効時だけ、視認時の兵力と役を接触記録へ追加。見失った敵の現在の耐久・位置は状況に使わない。
- `battle/ground-supply.js`: NPC軍の旧 `groundSupplyAI` 呼び出しを止める。敗走・帰投・自動砲撃・自動対空の既存処理は維持。
- `battle/state.js` / `data/operations.js`: 演習の8隊・A〜F・勝利条件・説明。チュートリアル2の4隊を上書き用データに保持し `npc:null`。
- `data/npc-doctrines.js`: `power.ground` の仮の兵科重みだけ追加。
- `index.html` / `.claude/skills/ship/SKILL.md`: 新規3ファイルの読み込み・配信リスト。
- 新規 `tests/npc-core.cjs` / `tests/npc-ground.cjs`: 頭の固定状況11件、橋渡しと実地上処理12件、Chromiumの有効／無効テスト。
- `tests/smoke.cjs`: NPCのNodeテストと実画面テストを呼ぶ。
- `tests/ground-drill.cjs`: 全26手順で敵の打撃・移動を確認。演習の勝利条件にテストを合わせる。次の手順の準備による明示的配置替えは移動として数えない。
- `tests/ground-landing.cjs`: 共通のNode環境でNPCを読み込む。`performance` を渡す。
- `tests/ground-sea.cjs`: 既存の描画処理が使う `performance` がNode環境に欠けていたため補う（再実行52/52成功）。
- `tests/ground-territory-cache.cjs`: 仮キャンバスの実寸480×360を補う。固定比較の拠点4つを演習データから独立させる。残る既存の画素比較失敗は下記。
- 新規 `tools/npc-sim.cjs` / `tools/npc-shots.cjs`: 実ゲーム計測・撮影の台本。
- `docs/menu.md` / `docs/PROJECT_STATUS.md` / 本報告: 仮の値と引き継ぎ。

## 確認結果

- 構文確認、`git diff --check`、`npm run check-docs`: 成功。
- `node tests/npc-ground.cjs`: 12/12成功。演習で4秒間を実処理で進め、敵が任務の拠点へ実移動することも確認。
- `node tests/npc-core.cjs`: 10/11成功。`retry` の失敗は頭の不具合として残す（下記）。削除・スキップしていない。
- 地上系のNode用32スクリプトをすべて実行。海上の環境不足修正後は31本成功、領域キャッシュ比較1本が失敗。
- `node tests/ground-drill.cjs`: 全26手順成功。敵の実打撃は前半0・後半0・損害0。各手順中の敵の移動0。NPC無効。通常演習の敵打撃7回を確認した固定場面で敵本営占領の勝利を確認。敵全滅でも勝利、自軍全滅で敗北、報酬・解放・保存のメニューテスト60/60成功。
- `npm test`: Node部分を実行し、Chromium起動で停止。実画面部分は未確認。頭の `retry` の失敗もNode部分で記録する。
- Chromium単体起動も `bootstrap_check_in ... MachPortRendezvousServer: Permission denied (1100)` で失敗。現在の実行環境は承認による制限解除もできないため、作業票どおり実画面・計測・写真をClaudeへ引き継ぐ。

## 指定の計測表（Chromiumは未実行）

未測定を0や勝敗に置き換えていない。対戦は軍0=mars、軍1=earth。計測時間は道具の既定値600ゲーム秒（仮の計測上限、作戦の制限時間ではない）。

| 地形 | 規範 | level | seed | 上限 | 勝敗・残存・棒立ち・集中・初接触・目標変更・中止・判断ms・step ms |
|---|---|---|---:|---:|---|
| exercise2 | mars / earth | standard | 1 | 600秒 | 未測定（Chromium起動不可） |
| exercise2 | mars / earth | standard | 2 | 600秒 | 未測定（同上） |
| exercise2 | mars / earth | standard | 3 | 600秒 | 未測定（同上） |
| field150 | mars / earth | standard | 1 | 600秒 | 未測定（同上） |
| バイコヌール・自軍無操作 | 敵mars | standard | 1 | 180秒 | 占領拠点・勝敗とも未測定（同上） |

Claudeが順番に実行するコマンド:

```sh
node tools/npc-sim.cjs exercise2 mars earth standard 1 600
node tools/npc-sim.cjs exercise2 mars earth standard 2 600
node tools/npc-sim.cjs exercise2 mars earth standard 3 600
node tools/npc-sim.cjs field150 mars earth standard 1 600
node tools/npc-sim.cjs baikonur mars earth standard 1 180 --idle
node tools/npc-shots.cjs
npm test
```

`npc-sim` はJSONと短い表を出す。残存は隊数と残存兵力、棒立ちは生存・非搭乗・非基地滞在の隊時間に対する無命令かつ非交戦の割合（海の艦も含む）。主攻集中は突入時の主攻任務に割り当てた兵力／その軍の生存・非搭乗・非基地滞在兵力の時間平均。突入なしはnull。最初の接触はどちらかが初めて相手を視認した秒。判断msは頭の `npcThink` のみ、step msは描画を除く実ゲームの `step`。JSONに所有の変化、30秒ごとの位置・命令・任務、終端の頭のlogも残す。広域の12隊ずつの配備は道具の実行中にだけ用意し、作戦のファイルを増やさない。計測中は広域検証場の中立拠点全占領による終了を使わず、両軍とも敵本営占領または敵全滅を終端とする（道具の実行中だけ）。

## 頭の不具合・足りない入力・気づいた点

### retryの間も同じ経由拠点を狙う（再現済み・未修正）

`tests/npc-core.cjs` の「押し返された主攻は中止しretry中は別目標を選ぶ」。A→B→C→F、B→D→Fの固定場面でCへの前進を中止した後、3秒後にCへ主攻を立て直す。

- t=0: 主攻C、最終目標F、前進。
- t=3: 過去に割り当てた兵力から大きく損耗した攻撃を固定履歴で再現し `seize:abort C / 押し返された`。Cの `failAt=3`。
- t=6: retry=110秒の途中なのに `seize:C` が再発行される。

原因の推定: 候補の点数は最終目標Fを評価する一方、途中のCの失敗が経路選択の費用に入らない。頭は変更禁止なので修正していない。テストは失敗したままsmokeにもつないだ。

### 接触の兵力（橋渡しで補った）

従来の `groundContacts[team]` には位置と時刻だけで、「最後に見たときの力」がなかった。NPC有効時の視認でだけ `power` / `role` を記録するようにした。頭の入力や実装は変更不要だった。

### 友軍の先頭拠点（制限あり）

作戦データにプレイヤーの `lead.front` を渡す既存の入口はない。橋渡しは `npc[team].lead.front` があればそれを渡し、未指定時は既知の自軍拠点のうち本営から最も離れた所を上限にする保守的な仮処理。独立した友軍軍団とプレイヤー軍団を同じteam内で分けて指揮する仕組みは今回の作戦にはない。頭の友軍制限自体は固定状況で確認済みだが、本番の友軍作戦へ導入する際には、どの部隊をプレイヤーの先頭として扱うかを接続する必要がある。

### 実際の長時間の動き

4〜5秒のNode実処理では、敵の主攻がBへ進み、斥候にAの偵察が割り当てられた。別途5秒時点の確認で頭のlogは t=1.6に `posture:attack`、`seize:assemble B`、同じ時刻に `seize:advance B`（出発拠点付近の集結率を既に満たす）。この時点だけで異常とは判定していない。180秒の勝敗・拠点占領、棒立ち、往復、川での停滞は未計測。規範の数値は変更していない。

### NPCとは別の既存の領域描画比較失敗

`tests/ground-territory-cache.cjs`: 仮キャンバスの寸法不足を補うと、`road section identity pixel equivalence` で旧描画との画素不一致が出る。今回変更前の `HEAD:battle/ground.js` と `HEAD:data/operations.js` をメモリ上で読み込ませても同じ失敗を再現した。NPCの変更が原因ではないことを確認したうえで報告し、対象外の描画処理は直していない。

## 仮の値・写真

兵科重み、演習の配置、橋渡しが補った後方距離などは `docs/menu.md`「NPC地上橋渡しの仮の値」に記録。既存の規範・強さの値は未変更。

撮影台本は `tools/npc-shots.cjs`。1600×900、`.shots/npc-a.png`（開始直後）、`npc-b.png`（60秒）、`npc-c.png`（150秒）。撮影時だけ自軍斥候を東側へ置き、カメラ移動後は2描画を待つ。ページ例外で失敗する。今回は起動できず写真は作っていない。試遊ページの更新は今回行わず、反映が必要ならClaudeが後で行う。
