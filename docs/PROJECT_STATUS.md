# いまの状態（引き継ぎ用）

最終更新: 2026-11-11。Codexが直接の主担当。元のClaude用資料・旧委託ガイドは保持する。

## 現在地

- 第一章は完成。操作修正#375〜#380、再設計の段階1〜5をmainへマージ済み。
- 作業表 `docs/ground-redesign-plan.md` の段階6〜9は `claude/ground-integration` へ統合し、実装・対象確認・写真保存まで完了。最終の全作戦CI／マージ状態は同ブランチのPRを正とする。確認結果は `docs/ground-final-check.md`。
- 海上分類・地平線・海上間接砲撃、航空の連続運動と物理投下、広域の独立地形・性能対応、能力別命令と案内を統合。
- 第二章の新規作戦、天候の実装、航空・地上モデルの全面再制作はユーザーの指示どおり保留。
- 非公開試遊ページは版173のまま。Codexから更新していない。反映はClaudeへ引き継ぐ。公開ホスティングへ移さない。

## 保存中のブランチ

|ブランチ|内容・扱い|
|---|---|
|claude/npc-intent|Codexがテスト・計測道具・資料を追加。頭・橋渡しの本体は未変更。Node全35ファイル中33成功（頭の新規2件と既存の領域キャッシュ画素比較が失敗）。次はClaudeが頭の修正・実ゲーム4条件の計測。試遊ページは更新しない|
|claude/npc-space|Codex作業票の実装済み・未コミット。npc-intent上に宇宙橋渡し、演習9拠点16辺、計測器、Node12項目とsmoke・写真台本。頭と規範値は変更なし。下の引き継ぎ参照|
|claude/baikonur-map|2026-11-11 作業票2実装済。砂丘8列・観測地4・村8、植生と集落を増量。Node37/38成功。領域キャッシュ画素比較1件は変更前95e6d45でも同じ失敗。写真・ブラウザテスト・平均12ms目標の実測とgit操作はClaudeへ。NPC・拠点・道路網・勝敗・チュートリアル2は維持。詳細はdocs/terrain/baikonur2.md、.shots/report2.md。試遊ページは未更新|
|claude/ground-integration|段階6〜9の最終版。対象確認と1600×900の写真を保存。全作戦CI成功後にsquashマージする。CI／マージ結果はPRを参照|
|claude/ground-naval-types|段階6・PR #387。最新233e467のCI42786024421成功。内容は最終版へ統合済み。最終版がmainへ入ったら重複PRを閉じる|
|claude/ground-air-flight|段階7の保存版e6f9a9e。最終版へ統合済み。単独で重複マージしない|
|claude/ground-wide-fields|段階8の保存版b27d3c2。設計図・独立データ・対象確認・写真を最終版へ統合済み|
|claude/ground-auto-aa|段階5・PR #386。最新9be501cのCI42833839866成功後、88caff4でマージ済み|
|claude/ground-volley|段階4・PR #385。最新e77f0b5のCI42785714214成功後、a4115beでマージ済み|
|claude/ground-scatter|段階3・PR #384。5019299でマージ済み|
|claude/ground-ballistics|段階2・PR #383。a0228b4でマージ済み|
|claude/ground-fire-ranges|段階1・PR #382。bc42158でマージ済み|
|claude/ground-redesign-plan|資料PR #381はドラフト保持。承認済み計画は実装PRへ取り込み済み|
|claude/chapter2-middle-east|第二章第1節の未採用下書きbda26f9。保存・保留。再開指示を待つ|

## 次の一手と注意

1. 最終統合PRの最新headで通常CIが成功したことを確認してsquashマージ。失敗なら原因を直し、確認を削除・スキップしない。
2. すでに成功した対象確認を理由なく繰り返さない。手元では今回の地上変更を確認し、第一章全作戦は通常CIを使う。ブラウザと重い確認を重ねず、同じworktreeのテスト中に編集しない。
3. 最終版の後、ユーザーの新指示まで第二章の作戦や保留項目へ進めない。
4. worktreeの.shots/に実画面を保持。画像リンクを壊さないよう作業フォルダを残す。

広域は `?ground=field150`／`?ground=field300` で開く隠し検証場。通常演習は48×36kmを維持。新たな第二章のステージ・報酬・物語として扱わない。共通戦闘値、宇宙艦種、確定SVGは今回変更しない。

## NPC意図の作業票の確認（2026-11-11）

- `tools/node-tests.cjs` でブラウザ不要の全35入口を順番に実行（Node v24.15.0）。33ファイル成功。頭は37/39、橋渡しは95/95、計測器は11/11。頭の2件は `docs/npc-doctrine.md` 9.7 に再現条件を記録し、失敗するテストを保持。
- 既存の `tests/ground-territory-cache.cjs` は `road section identity pixel equivalence` で失敗。道路中心24.7km・幅1.5kmの境界で、旧座標23.95との差0.75に対し新座標23.950000000000003との差が0.7499999999999964になる。画素→地図座標の計算順による丸め差で、厳密な道路境界の内外が変わる。矩形盤面・道路2本の切り分けでも150画素の不一致を再現。タイムアウトや並列負荷の失敗ではない。今回の対象外として描画本体・既存テストは変更しない。
- Node全件のログは `test-results/node-tests/`。`npm run check-docs` と変更したJS/CJSの構文確認は成功。
- `npm test` はNode部分を実行後、Chromium起動の `bootstrap_check_in: Permission denied (1100)` で停止。ログは `test-results/npc-intent-smoke.log`。実ゲーム4条件の計測は未実行としてClaudeへ引き継ぐ（`node tools/npc-measure.cjs`）。試遊ページは未更新。
- 元の資料には9.7節と指定された「決めてほしいこと」3項目が存在しなかったため、実装の9.7節を新設。既存の10節の未決事項は別内容なので保持。
- Git管理領域への書き込みは禁止され、`git fetch origin` はFETCH_HEADへの書き込みで失敗。未コミットの差分を保持する。

## claude/npc-space の引き継ぎ（2026-11-11、作業票の範囲）

- 実装済み: `battle/npc-space.js`、カリュブディスの案内なし演習の敵指揮官（標準・機動防御・要塞保持）。9拠点16辺の表と仮の値は `docs/menu.md`「宇宙NPC」。チュートリアルは既存台本、追撃開始後は橋渡し停止。勝敗・時間切れ・報酬・共通性能は変更なし。
- 観測は視界内だけ。見失った敵は位置と力を記憶し、視界外での死は消さない。既存pickFoeの候補ゼロで現目標が残る境界条件をNodeで再現し、NPC守備だけ橋渡しからleash外の攻撃を解除する。共通の頭・規範・pickFoeは変更なし。
- 確認: smoke以外のNode実行対象38ファイルを順次実行。資料のパス表記は修正後 `npm run check-docs` 成功。宇宙は追加の境界確認を含め `node tests/npc-space.cjs` 12/12成功。既存の頭・地上橋渡し・計測器も成功。残る失敗は `tests/ground-territory-cache.cjs` の road section identity pixel equivalence（最初の不一致byte230440:160対0）。変更前HEAD `68ba776` の独立した展開でも同じ失敗を再現。地上の領域キャッシュは今回変更せず、テストも削除・スキップしていない。
- 未確認: ChromiumはmacOSのMachPortRendezvous登録がPermission deniedとなり起動不可。`tools/npc-space-shots.cjs` の実画面3条件・1600×900写真、`npm test`、実ゲームでのNPCあり／なし・seed1〜2はClaudeが順次実行する。勝率・装甲推移・棒立ち比・実ゲームの判断／step msは未測定。Nodeの模型での計測器出力と実ゲームの実測を混同しない。
- 実測の次の一手: `node tools/npc-space-shots.cjs` → `node tools/npc-measure.cjs` → `npm test`（同時に回さない）。計測器は地上の既存5条件に宇宙4条件を追加。宇宙だけは `node tools/npc-sim.cjs charybdis mars earth standard 1 900`、台本比較に `--no-npc`。記録は `.shots/npc/`。
- 頭に足りない入力: 要塞の残存装甲／被弾の緊急度、宇宙の射程・高度を含む段取りの到着判定。作業票の参照する設計9.7節はこのHEADにまだないため、既存のstylesデータと頭をそのまま使用。詳細は `docs/npc-doctrine.md` 7節。
- git: 指定ブランチ `claude/npc-space`。開始時の作業ツリーはclean。`git fetch origin` は本体側のGit管理領域への書き込み制限で失敗した。作業票の許可どおりコミット・push・PRは行わず差分を残す。
- 試遊ページ: 更新しない（今回の作業票）。写真も実測も未生成のため、撮れた／測れたとは報告しない。
広域は `?ground=field150`／`?ground=field300` で開く隠し検証場。チュートリアル2は48×36kmを維持。通常演習だけ広域96×72kmへの変更を作業中（上表）。新たな第二章のステージ・報酬・物語として扱わない。共通戦闘値、宇宙艦種、確定SVGは今回変更しない。
