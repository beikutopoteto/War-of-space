---
name: ship
description: War of Space の変更を出す手順。テスト、コミット、PR、CI の確認、マージ、試遊ページ（claude.ai の非公開ページ）の更新までを決まった手順で行う。変更ができて「PR にする」「マージする」「試遊ページに載せる」ときに使う。
---

# 変更を出す手順（/ship）

毎回同じ手順なので、考え直さずにこの順で進める。

ユーザーの Mac（2026-10-30〜）では GitHub MCP の代わりに `~/.local/bin/gh` を使う: PR は `gh pr create`、見張りは `gh pr checks <番号> --watch`（後ろで走らせる）、マージは `gh pr merge <番号> --squash --delete-branch`。Codex の作業はコミットする前に必ず差分を読み、Codex が回したテストの結果を確かめ、大事な数は自分でも早送りで確かめる（テストを回すのも Codex に任せてよい。2026-10-30）（`docs/collaboration.md`「Codex を手元から呼ぶ」）。

## 1. 確かめる
- `npm test` を走らせ、最後が「すべての確認に通りました。」であることを見る（`| tail -1` で足りる）。
- 画面が変わる変更は、スクリーンショットを1枚見て確かめる（`test-results/` か、スクラッチパッドの確認用スクリプト）。ユーザーは iPhone でも遊ぶので、文字や部品の大きさが変わるものはスマホの大きさ（390×780、`deviceScaleFactor:3`、`isMobile`）でも撮る（2026-11-06）。
- 足した確かめは、その場合を本当に通るかを見る（2026-11-06: 新しく作った空の打撃群を解散して「支隊も消える」を確かめたつもりで、前提が空のまま落ちた）。
- `npm test` と、ほかのブラウザを使う確かめ（早送り、スクリーンショット）を同時に走らせない。実時間に頼る確認が落ちることがある。

## 2. コミットと PR
- `main` にいたら `git checkout -b <話題の短い英語名>`。1つの PR は1つの話題。
- コミットの文は日本語で、何をしたかを1行目に書く。末尾にシステムが指定する帰属の行（Co-Authored-By と Claude-Session）を付ける。
- `git push -u origin <ブランチ>`。
- PR は GitHub MCP の `create_pull_request`（owner `beikutopoteto`、repo `war-of-space`、base `main`）。本文は「変更」「確認」の2見出しで短く。末尾にシステムが指定する帰属の行を付ける。
- `subscribe_pr_activity` で PR を見張る。

## 3. CI とマージ
- ユーザーの Mac での CI の待ち方（2026-11-04）: PR を作った直後の `gh pr checks --watch` は「no checks reported」で終わる。20〜40秒おいてから、最新のコミットの `headSha` で `gh run list` から走りを選び、`gh run watch <id> --exit-status` を後ろで走らせる。`gh run watch` は CI の途中で抜けることがある（2026-11-05）。抜けたら `gh run view <id> --json status,conclusion,headSha` で `completed` と `success`、最新のコミットであることを見てからマージする。同じ PR へ間を空けずに push を重ねない（CI が同時に走り、どの結果か分かりにくく、実時間に頼る確認も落ちやすい）。直しはまとめて1回で push する。
- CI（`smoke`）の結果は、GitHub の通知で届くのを待つ。通知が来たら `pull_request_read` の `get_check_runs` で確かめる。通知の `head_sha` が PR の最新のコミットか見る（前のコミットの CI の知らせも届く）。
- 成功なら `merge_pull_request`（`merge_method: squash`）。CI の結果を見てから、別のコマンドでマージする（2026-11-04: `gh pr checks` とマージを1行に続けて、落ちた CI のまま #289 をマージした。落ちたのは時々落ちる第6節の確認で、回し直すと通った）。失敗なら原因を直して push する（テストを消したり飛ばしたりしない）。
- 先に別の PR をマージしたせいで食い違いが出たら、`git merge origin/main` で取り込み、テストしてから push する。
- PR の CI は `main` と合わせた形で走る。`main` に別の PR が入ると、前に通った PR でも落ちることがある（2026-11-06 #334: #335 でデバッグの全作戦クリアが巡洋艦6隻も置くようになり、強襲母艦の確かめの「戦闘の規模 34隻」が40隻になった）。長く開いている PR は、マージの直前に最新のコミットの CI を見る。
- マージ後: `git fetch origin main -q && git checkout -q main && git reset -q --hard origin/main`。`gh pr merge --delete-branch` で、そのブランチの作業フォルダ（ワークツリー）も消えていることがある（2026-11-06）。`git worktree prune` で表を片付ける。

## 4. 試遊ページを載せ直す（ゲームの中身が変わったときだけ）
資料だけ、テストだけの変更なら載せ直さない。Artifact ツールで次のとおり呼ぶ。
- `url`: `https://claude.ai/artifact/TZwfsz3vsyF6sgY3YYxPk1`
- `file_path`: `/home/user/War-of-space/index.html`
- `label`: 変更の短い名前
- `files`:

```json
{"battle/base.js":"battle/base.js","battle/battle.css":"battle/battle.css","battle/cut.js":"battle/cut.js","battle/effects.js":"battle/effects.js","battle/hud.js":"battle/hud.js","battle/loop.js":"battle/loop.js","battle/scene.js":"battle/scene.js","battle/shapes.js":"battle/shapes.js","battle/sim.js":"battle/sim.js","battle/state.js":"battle/state.js","battle/tutorial.js":"battle/tutorial.js","battle/units.js":"battle/units.js","data/bonuses.js":"data/bonuses.js","data/earth.js":"data/earth.js","data/operations.js":"data/operations.js","data/tech.js":"data/tech.js","data/ships.js":"data/ships.js","marks.js":"marks.js","prep.js":"prep.js","prep.css":"prep.css","prep-bg.js":"prep-bg.js","prep-dock.js":"prep-dock.js"}
```

`battle/` や `data/` や最上位にファイルを足したら（2026-11-04 の `prep-bg.js` など）、この表と下の `git archive` にも足す。

ユーザーの Mac（2026-10-31）: 載せるファイルは作業ディレクトリかスクラッチパッドの中に限られる。`git archive origin/main index.html battle data marks.js prep.js prep.css prep-bg.js prep-dock.js | tar -x -C <スクラッチパッド>/play` で写し、`file_path` を `<スクラッチパッド>/play/index.html`、`root` を `<スクラッチパッド>/play` にする。前の会話のページなので、先に `action:"read"` で読む。

コミット・push・マージがオートモードの安全チェックで止まったら、回り道をせずユーザーに承認を聞く（`開発環境/.claude/settings.local.json` の許可は、セッションを開き直すと効く）。

### 公開が断られたとき
- 「前に載せたファイルを読んでいない」と断られたら、`action:"read"` の `paths` で出ているファイルを読み、中身が前の `main` と同じこと（`git show <前のmain>:<file> | sha256sum`）を確かめてから載せ直す。

### 「先に乗せて」と言われたとき（2026-11-05）
- 作業中の版（コミット前でも）を、いつもの試遊ページへ先に載せる（写すのは `git archive` でなく作業フォルダから `cp -R index.html battle data marks.js prep.js prep.css prep-bg.js prep-dock.js <スクラッチパッド>/play/`）。テスト・PR・マージはそのあと続け、マージ後に `main` と同じ中身なら載せ直さない。

### マージの前に試したいと言われたとき（2026-10-30）
- いつもの試遊ページは `main` のまま。PR の版はスクラッチパッドに `index.html`・`battle/`・`data/`・`prep.js`・`prep.css` を写し、`root` をその場所にして新しい試しのページとして載せる（`url` は付けない。同じ `file_path` で載せ直せば同じページ）。マージしたら、いつものページを更新し、試しのページは聞いてから消す（2026-10-30 の試しのページは消した）。
- 試しのページはセーブが別（最初から始まる）。載せたときに、いつものページと何が違うか、どこを見ればよいか（デバッグで何を押すか。例: 戦艦は「全作戦クリア」）を添える（2026-11-06: ユーザーがいつものページで探して「変わってない」と言った）。
- 大きな変更を試しのページで遊んでもらう間に `main` が進んだら、PR に `main` を取り込み、試しのページにも載せ直す。承認でマージしたら、いつものページを載せ直し、試しのページを消してよいか聞く。

## 5. 報告
- ユーザーへは日本語で短く: 何が変わったか、PR 番号、試遊ページを更新したか。
- 「PR がマージされた」という通知には一言だけ返す。
