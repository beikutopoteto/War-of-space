---
name: ship
description: War of Space の変更を出す手順。テスト、コミット、PR、CI の確認、マージ、試遊ページ（claude.ai の非公開ページ）の更新までを決まった手順で行う。変更ができて「PR にする」「マージする」「試遊ページに載せる」ときに使う。
---

# 変更を出す手順（/ship）

毎回同じ手順なので、考え直さずにこの順で進める。

## 1. 確かめる
- `npm test` を走らせ、最後が「すべての確認に通りました。」であることを見る（`| tail -1` で足りる）。
- 画面が変わる変更は、スクリーンショットを1枚見て確かめる（`test-results/` か、スクラッチパッドの確認用スクリプト）。

## 2. コミットと PR
- `main` にいたら `git checkout -b <話題の短い英語名>`。1つの PR は1つの話題。
- コミットの文は日本語で、何をしたかを1行目に書く。末尾にシステムが指定する帰属の行（Co-Authored-By と Claude-Session）を付ける。
- `git push -u origin <ブランチ>`。
- PR は GitHub MCP の `create_pull_request`（owner `beikutopoteto`、repo `war-of-space`、base `main`）。本文は「変更」「確認」の2見出しで短く。末尾にシステムが指定する帰属の行を付ける。
- `subscribe_pr_activity` で PR を見張る。

## 3. CI とマージ
- CI（`smoke`）の結果は、GitHub の通知で届くのを待つ。通知が来たら `pull_request_read` の `get_check_runs` で確かめる。
- 成功なら `merge_pull_request`（`merge_method: squash`）。失敗なら原因を直して push する（テストを消したり飛ばしたりしない）。
- 先に別の PR をマージしたせいで食い違いが出たら、`git merge origin/main` で取り込み、テストしてから push する。
- マージ後: `git fetch origin main -q && git checkout -q main && git reset -q --hard origin/main`。

## 4. 試遊ページを載せ直す（ゲームの中身が変わったときだけ）
資料だけ、テストだけの変更なら載せ直さない。Artifact ツールで次のとおり呼ぶ。
- `url`: `https://claude.ai/artifact/TZwfsz3vsyF6sgY3YYxPk1`
- `file_path`: `/home/user/War-of-space/index.html`
- `label`: 変更の短い名前
- `files`:

```json
{"battle/battle.css":"battle/battle.css","battle/effects.js":"battle/effects.js","battle/hud.js":"battle/hud.js","battle/loop.js":"battle/loop.js","battle/scene.js":"battle/scene.js","battle/shapes.js":"battle/shapes.js","battle/sim.js":"battle/sim.js","battle/state.js":"battle/state.js","battle/units.js":"battle/units.js","data/bonuses.js":"data/bonuses.js","data/operations.js":"data/operations.js","data/tech.js":"data/tech.js","data/ships.js":"data/ships.js","prep.js":"prep.js","prep.css":"prep.css"}
```

`battle/` や `data/` にファイルを足したら、この表にも足す。

## 5. 報告
- ユーザーへは日本語で短く: 何が変わったか、PR 番号、試遊ページを更新したか。
- 「PR がマージされた」という通知には一言だけ返す。
