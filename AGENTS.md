# AGENTS.md

OpenAI Codex 向けの入口。宇宙艦隊戦の 3D リアルタイムストラテジー「War of Space」の試作で、ブラウザだけで動く。Claude Code（入口は `CLAUDE.md`）と同じリポジトリで交代に作業する。共通のルールは `docs/collaboration.md`。

## 呼ばれ方（2026-10-30）
ふだんは、Claude がユーザーの Mac で `codex exec` から呼ぶ（`docs/collaboration.md`「Codex を手元から呼ぶ」）。このときは:
- 渡された作業フォルダ（`git worktree`）の中だけを直す。コミット・push・PR はしない（Claude がする）。
- `node --check`、`npm run check-docs`、早送りの道具（`tools/*.cjs`）、`npm test` を自分で回して確かめ、測った数を結果に書く（サンドボックスは `danger-full-access`。ユーザー決定 2026-10-30）。テストの直しも Codex がする。
- 早送りとテストは終わるまで待つ1回のコマンドで回す。後ろで走らせて `sleep`・`tail` で見回らない（見回るたびに会話を読み直してトークンを使う。ユーザー決定 2026-10-31）。出すのは結果の表の行だけ。
- 結果（`docs/collaboration.md`「作業票」の「結果」の型）を最後の返事に書いて止まる。
下の「作業票の終え方」と「Git」は、Codex Cloud で動くときのもの。

## 最初に読む
1. 頼まれた作業票（GitHub の Issue「作業票: …」）。目的・触ってよいファイル・変えてはいけないもの・完了の条件が書いてある。
2. `docs/collaboration.md`: 分担、作業票と結果の型、セットアップ、テスト、Git の運用。
3. 作業票の「参考」にある資料だけ（一覧は `CLAUDE.md` の「資料」の表）。大きなファイルは grep で場所を探し、その部分だけ読む。

## 会話
- 日本語で、短く結論から。
- 指示が曖昧なら、実装の前に選択肢を出して聞く。指示の読み方は `docs/requests.md`。
- 見た目（アイコン、形、色）は見本の画像を見せ、許可を得てから入れる（`docs/spec.md`「デザインの方向性」）。

## 守ること
- ユーザーが決めた仕様（`docs/spec.md`、`docs/campaign.md`、章のファイル）は勝手に変えない。戦闘や画面の動きを変える前に読む。
- 釣り合わせは、全作戦で共通の値（`data/ships.js` の艦種の性能、W.A.S. の1隻8機、`WOS_DATA.balance` の倍率）でなく、その節のデータで行う。共通の値を変えるしかないときは先に聞く。艦の耐久（`hp`、倍率、傷み `hurt`、回復）も変えない（ユーザー 2026-10-30）。
- 作業票の「変えてはいけないもの」を守る。作業票にないことはしない。迷ったら作業票の結果に書いて止まる。作業票の本文の下にある Claude の追記コメントも読む。
- ユーザーから直接受けた指示は、結果の本文に「ユーザーの指示」として書く（Claude が資料に移す）。
- 自分で置いた数値は、作業票の結果の「自分で置いた仮の数値」に書く。
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
- PR は作るが、マージは Claude かユーザーが行う。PR の本文は「変更」「確認」「引き継ぎ」の見出しで書き、作業票の Issue 番号を入れる（引き継ぎの型は `docs/collaboration.md`）。
- コミットの文は日本語で、何をしたかを1行目に書く。

## 作業票の終え方
1. `npm test` と `npm run check-docs` を通す。
2. 指示されたブランチに push する（PR は Claude が先に作ってある。なければ作る）。
3. 結果を最後のコミットの本文に書く（型は `docs/collaboration.md`「作業票」の「結果」）。Issue にコメントできるならそこにも。
4. 止まる。次の作業を自分で始めない。

資料（`docs/roadmap.md`、`docs/history.md`、`docs/menu.md`、`docs/PROJECT_STATUS.md`、`CLAUDE.md`）は書かない。マージのときに Claude が書く。

## Claude がいないとき
ユーザーが「Claude はしばらく休み」と言ったあいだだけ:
- 結果のほかに、仮の数値を `docs/menu.md` に、決まったことと経緯を `docs/roadmap.md`・`docs/history.md` に、作業中のブランチを `docs/PROJECT_STATUS.md` に書く（`CLAUDE.md` の資料の表のとおり）。
- マージはユーザーが行う。

## Codex にはないもの
`.claude/` のサブエージェントとスキル、試遊ページ（claude.ai の非公開ページ）の更新は Claude 専用。スキルの手順書（`.claude/skills/*/SKILL.md`）は読んで、手でなぞってよい。ただし Artifact と GitHub MCP の手順は飛ばす。
