# いまの状態（引き継ぎ用）

Claude と Codex が作業を受け渡すための短いメモ。詳しい「現在地」と「次にやること」の正本は `docs/roadmap.md`。ブランチを始めたとき・止めたとき・マージしたときに直す（運用は `docs/collaboration.md`）。

最終更新: 2026-11-04（Claude。ユーザーの Mac。#270 の砲台）

**今の分担: Codex 多め**（2026-10-31 夕方から。Claude の週の上限が残り15%を切った、とユーザーが知らせた）。短い直し・テストの直し・早送りも Codex に頼み、Claude は計画・作業票・差分のレビュー・git・資料だけ（`docs/collaboration.md`「分担」）。週の上限が戻ったら、ユーザーの知らせでふだんに戻す。

## 作業中のブランチ

| ブランチ | 担当 | 中身 | 状態 | PR |
|---|---|---|---|---|
| （なし） | | | | |

## 次の一手
1. 第一章は完成（#270 で第6節の砲台も入った）。ユーザーが通しで遊び、釣り合いはよい（2026-11-04）。次は第二章の物語と作戦（`/story-draft`）。

開発環境（2026-10-30）: ユーザーの Mac で、Claude が Codex CLI を `codex exec -s danger-full-access` で呼ぶ（`docs/collaboration.md`「Codex を手元から呼ぶ」、分担もそこ）。セッションはデスクトップの `開発環境` フォルダで開く（その CLAUDE.md がリポジトリの CLAUDE.md を読み込む）。リポジトリは `~/dev/War-of-space`（いつも `main`。`開発環境/.claude` のスキルとエージェントのリンク先）、Codex の作業フォルダは `~/dev/wos-codex-<話題>`（今はなし）。`gh` は `~/.local/bin/gh`、Codex は `~/.npm-global/bin/codex`（PATH は通していない）。

## 既知の問題
- `npm test` は約20分かかる。早送りの道具（`tools/`）を同時に回すと、実時間に頼る確認が落ちることがある。
- Claude のクラウド環境では、入っている Chromium と、固定した Playwright（1.56.1）の版が合わないことがある。回り道は `docs/collaboration.md`「セットアップ」。

## わからないこと（推測で埋めない）
- Codex Cloud の1回の作業の時間の上限で、`npm test`（約20分）が最後まで走るか。Codex 側のセットアップでは全項目が通ったと報告あり（2026-10-29）。
