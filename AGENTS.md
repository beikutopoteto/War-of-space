# AGENTS.md

OpenAI Codex 向けの入口。宇宙艦隊戦の 3D リアルタイムストラテジー「War of Space」の試作で、ブラウザだけで動く。Claude Code（入口は `CLAUDE.md`）と同じリポジトリで交代に作業する。共通のルールは `docs/collaboration.md`。

## 最初に読む
1. `docs/collaboration.md`: セットアップ、テスト、ブランチ、引き継ぎ、Git の運用。
2. `docs/PROJECT_STATUS.md`: いま作業中のブランチと次の一手。
3. 頼まれた話題に要る資料だけ（一覧は `CLAUDE.md` の「資料」の表）。大きなファイルは grep で場所を探し、その部分だけ読む。

## 会話
- 日本語で、短く結論から。
- 指示が曖昧なら、実装の前に選択肢を出して聞く。指示の読み方は `docs/requests.md`。
- 見た目（アイコン、形、色）は見本の画像を見せ、許可を得てから入れる（`docs/spec.md`「デザインの方向性」）。

## 守ること
- ユーザーが決めた仕様（`docs/spec.md`、`docs/campaign.md`、章のファイル）は勝手に変えない。戦闘や画面の動きを変える前に読む。
- 釣り合わせは、全作戦で共通の値（`data/ships.js` の艦種の性能、W.A.S. の1隻8機、`WOS_DATA.balance` の倍率）でなく、その節のデータで行う。共通の値を変えるしかないときは先に聞く。
- 自分で置いた数値は「仮」と書き、`docs/menu.md` に記録する。
- 版権の名前は使わない。自軍「地球連合」（青）、敵「惑星共和国（アストラルリパブリック）」（赤）、要塞「カリュブディス」。「W.A.S.」を使い「M.A.S.」は使わない。
- 画面を隠さない。新しい UI は小さく半透明で、たためるようにする。PC 向けだけ（スマホ向けの調整は足さない）。
- 既存のアーキテクチャを変えない（理由は `docs/DECISIONS.md`）。

## コード（詳しくは `docs/code.md`）
- ビルド不要。`file://` でも動くよう ES モジュールでなく普通の `<script>` で読む。Three.js r128（新しい API はない）。
- `index.html` は骨組みだけ。`data/` はゲームのデータ（`window.WOS_DATA`）。`battle/` は戦闘画面（外側の名前をファイル間で共有し、読み込み順がある）。`prep.js` / `prep.css` はタイトル〜出撃〜艦隊編集〜技術ツリー。
- 保存は localStorage の `wos.save.v1`。形式を変えたら `migrate()` で古いデータを直す。

## 確認
- `npm ci` のあと `npm test`（約20分）と `npm run check-docs`。両方通ってから PR にする。テストを消したり飛ばしたりしない。

## Git
- ブランチは `codex/<話題>`。`main` へ直接 push しない。force-push と、push したあとの rebase はしない。
- PR は作るが、マージは Claude かユーザーが行う。PR の本文は「変更」「確認」「引き継ぎ」の見出しで書く（引き継ぎの型は `docs/collaboration.md`）。
- コミットの文は日本語で、何をしたかを1行目に書く。
- 決まったことと経緯は、資料（`docs/roadmap.md`、`docs/history.md` ほか）に `CLAUDE.md` の表のとおりに書く。

## Codex にはないもの
`.claude/` のサブエージェントとスキル、試遊ページ（claude.ai の非公開ページ）の更新は Claude 専用。スキルの手順書（`.claude/skills/*/SKILL.md`）は読んで、手でなぞってよい。ただし Artifact と GitHub MCP の手順は飛ばす。
