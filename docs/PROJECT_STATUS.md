# いまの状態（引き継ぎ用）

Claude と Codex が作業を受け渡すための短いメモ。運用は `docs/collaboration.md`。

最終更新: 2026-11-08（Claude → Codex の引き継ぎ）

**今の分担: Codex がチャットの主担当**。Claude が利用上限に達したため、このあとはユーザーが Codex と直接開発を続ける。進め方は `docs/collaboration.md`「Codex がチャットの主担当になるときの進め方」。

## 今の到達点
- 第一章は完成。ユーザーが通しで遊び、釣り合いを確認済み。
- 地上戦の試作①〜⑩b、補給と士気（PR #370）、地上戦の直し（#371）、チュートリアル2とバイコヌール演習・章タブ（#372）まで `main` にマージ済み。
- 試遊ページは **版173**（[claude.ai の Artifact](https://claude.ai/artifact/TZwfsz3vsyF6sgY3YYxPk1)）。Codex からは更新できない。更新はユーザーが Claude に頼むか、後回しにする。

## 作業中のブランチ

| ブランチ | 担当 | 中身 | 状態 | PR |
|---|---|---|---|---|
| claude/handoff-codex | Codex | Claude → Codex の引き継ぎ資料の整理 | 資料更新・check-docs 完了、未コミット | 未作成 |

## 次の作業（ユーザーの決めた順）
1. 第二章の作戦を作る。中東の防衛から（`docs/chapter2.md`）。
2. A: 見本図 `docs/mockups/ground-b.html` の手直し。効果の数値と札の形を直し、気候マップの見本を用意し、海の波打ち際を大きくする。
3. 航空機と地上部隊のモデルを作り直す。`battle/shapes.js` の艦載機の作り方に学び、横から見て平たくしない。自走対空砲も対象。
4. 天候（`docs/weather.md`）は後で。

## 未決・注意
- チュートリアル2のリコ軍曹の通信文の見直し。
- 各数値はすべて仮（補給と士気は `docs/supply.md`、ほかの資料の数値も同様）。
- `npm test` と写真は Chromium を使う。Codex のサンドボックスでは起動できなかったため、サンドボックスの外で回す。ユーザーの許可を得て回すか、ユーザーに実行してもらう。
- 手元の `npm test` で「第6節」「視点のスティック」が落ちたのは、ほかの重い処理と同時に回したときだけ。再実行・CI では通っている。同時に回さない。

## 開発環境
- 本体は `~/dev/War-of-space`（`main`）。作業ごとに `~/dev/wos-codex-<話題>` の worktree と `claude/<話題>` ブランチを使う。
- node_modules は `~/dev/War-of-space/node_modules` へのリンク。
- `gh` は `~/.local/bin/gh`。試遊ページの Artifact 更新と `.claude/` のサブエージェントは Claude 専用。
