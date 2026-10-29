# Claude と Codex の共同作業

Claude Code（Claude）と OpenAI Codex Cloud（Codex）が同じ GitHub リポジトリで作業するときの共通ルール（ユーザー決定 2026-10-29）。Claude の利用上限に達したときも、Codex が続きを拾えるようにするのが目的。入口は Claude が `CLAUDE.md`、Codex が `AGENTS.md`。ゲームの仕様と進め方の決まりはどちらも同じ（`docs/spec.md`、`docs/requests.md`）。

## セットアップ
- Node.js 22（CI と同じ）。`npm ci`（ロックファイルどおり。`npm install` でもよい）。
- Playwright は `1.56.1` に固定。その版の Chromium を `npx playwright install chromium` で入れる（CI は `--with-deps` 付き）。
  - Codex: 環境のセットアップで導入済み（2026-10-29、Node 22.23.4）。
  - Claude のクラウド環境: 入っている Chromium の版が合わないことがある（`Executable doesn't exist at …headless_shell-1194` と出る）。そのときはリポジトリを変えず、スクラッチパッドに置いた読み込み用の小さなスクリプトで、`chromium.launch` の `executablePath` を `/opt/pw-browsers/chromium` にして `node -r <そのスクリプト> tests/smoke.cjs` で走らせる。
- 秘密の値（API キーなど）は要らない。`.env` は作らない。秘密の値はコミットにもログにも出さない。

## 起動
ビルド不要。リポジトリ直下の `index.html` をブラウザで開く（`file://` でよい）。three.js は CDN から読む。

## テスト
- `npm test`: `tests/smoke.cjs`。ヘッドレス Chromium で画面と戦闘を一通り動かす（約20分。CDN の代わりに `node_modules/three` を返すので、ネットにつながらなくても走る）。最後の行が「すべての確認に通りました。」なら成功。
- `npm run check-docs`: 資料の確認（`CLAUDE.md` の大きさ、資料に書いたファイルがあるか、古い名前）。
- PR ごとに GitHub Actions（`.github/workflows/check.yml`）が `npm test` を走らせる。`check-docs` は CI に入っていないので、資料を変えたら手で走らせる。
- テストを消したり飛ばしたりして通さない。

## ブランチと担当
- `main` へ直接 push しない。1つの話題に1ブランチ・1担当。
- 名前: Claude は `claude/<話題>`、Codex は `codex/<話題>`。2026-10-29 より前のブランチは名前の決まりがない（`feat/…` など）。
- いま誰がどのブランチを持っているかは `docs/PROJECT_STATUS.md`。
- マージ:
  - Claude: CI が通ったら squash でマージしてよい（ユーザー決定 2026-10-02）。手順は `/ship`。
  - Codex: PR を作るところまで。マージは Claude かユーザーが行う。

## 変更の受け渡し
- 止まる前（区切りごと、利用上限が近いとき、セッションを終えるとき）に、作業中の変更を「作業中: …」のコミットにして push する。未コミットのまま残さない。
- PR を作る（できあがっていなければ下書きの PR）。本文の最後に「引き継ぎ」の欄を書く:

```
## 引き継ぎ
- 担当: Claude / Codex
- 状態: どこまでできたか（最後のコミット）
- 次の一手:
- 未確認・気になること:
- テスト: npm test の結果（未実行ならそう書く）
- 試遊ページの更新: 要る / 要らない
```

- 受け取る側: `git fetch origin` → `git switch <ブランチ>` → `git merge origin/main` → PR の「引き継ぎ」と `docs/PROJECT_STATUS.md` を読んでから続ける。引き継ぐときは PR の担当の行を書き換える。
- マージしたら `docs/PROJECT_STATUS.md` の「作業中のブランチ」から消す。

## 変更を失わないために
- 作業を始める前に `git status` と `git fetch origin`。未コミットの変更があれば、何のものか確かめてからにする（消さない）。
- push したブランチで rebase、amend、force-push をしない。`main` は `git merge origin/main` で取り込む。
- 相手が担当しているブランチには、引き継いだときだけコミットする。
- 食い違いやすいのは資料（`docs/history.md`、`docs/roadmap.md`、`docs/menu.md`、`docs/campaign.md`）と `tests/smoke.cjs`。資料への追記は、マージの直前にまとめて行うと食い違いが減る。
- `package-lock.json` は手で直さず、`npm install` で作り直す。
- `git reset --hard`、`git clean`、`git checkout -- .` は、未コミットの変更がないことを確かめてからだけ使う。

## Claude だけができること
- 試遊ページ（claude.ai の非公開ページ）の更新。Codex がゲームの中身を変えたときは、PR に「試遊ページの更新が要る」と書く。マージのあと Claude が載せる。
- サブエージェント（`.claude/agents/`）とスキル（`/ship`、`/tidy-docs`、`/story-draft`）。Codex は同じ資料を読んで、同じ手順を手で行う。
- PR の見張り（CI とレビューの通知）。
