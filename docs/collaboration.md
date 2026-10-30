# Claude と Codex の共同作業

Claude Code（Claude）と OpenAI Codex（Codex。Codex Cloud か、ユーザーの Mac の Codex CLI）が同じ GitHub リポジトリで作業するときの共通ルール（ユーザー決定 2026-10-29。手元の CLI は 2026-10-30 から）。Claude の利用上限に達したときも、Codex が続きを拾えるようにするのが目的。入口は Claude が `CLAUDE.md`、Codex が `AGENTS.md`。ゲームの仕様と進め方の決まりはどちらも同じ（`docs/spec.md`、`docs/requests.md`）。

## 分担（ユーザー決定 2026-10-29。2026-10-30 に手元の Codex CLI 向けに変えた）
ふだんは、ユーザーの Mac で Claude が Codex CLI を直接呼ぶ（下の「Codex を手元から呼ぶ」）。ユーザーが間に立って作業票を貼る形（「Codex への渡し方（手動）」）は、Codex Cloud を使うときだけ。
- **Claude**:
  - 会話、指示の読み取り、仕様と計画、物語、見た目の見本。
  - 作業票（Issue）を書き、Codex の作業フォルダ（`git worktree`）を作って `codex exec` で呼ぶ。
  - **git は Claude**: コミット、push、PR、マージ。Codex の差分を読み、Codex が測った数のうち大事なものは Claude も早送りで確かめる（下の「Codex への渡し方」のレビュー）。
  - Codex の差分をレビューし、直しが要れば Codex に返して直させる（`codex exec resume`）。
  - 資料に記録する。試遊ページを更新する。
  - **小さな直しも Codex に任せる**（ユーザーの指示 2026-10-30「簡単なテストなども任せてみてください」）: テストの直し、数行のコードの直し、早送りやテストを回すことも Codex に頼む。Claude が自分でやるのは、頼む手間のほうが明らかに大きいとき（1行の打ち間違いなど）と資料だけ。
- **Codex**（`gpt-6.1-terra`、推論の強さ medium。ユーザー決定 2026-10-30）:
  - 作業票1つ分のコードとデータの変更。作業フォルダの中だけを直す。
  - 構文の確認（`node --check`）、`npm run check-docs`、早送りの道具（`tools/*.cjs`）、`npm test` を自分で回し、測った数を結果に書く（サンドボックスを緩めた。ユーザー決定 2026-10-30）。
  - 結果（下の「結果」の型）を最後の返事に書いて止まる。コミット・push・PR はしない。
  - 資料の整理はしない（`docs/menu.md` の仮の数値は書いてよい）。

## 作業票（GitHub の Issue）
Claude が書く。題は「作業票: <話題>」。本文の型:

```
## 目的
## 触ってよいファイル
## 変えてはいけないもの（ユーザーが決めた仕様、全作戦で共通の値など）
## 完了の条件（例: オートモードで半分以上勝つ、npm test が通る）
## 届かないとき（調整してよいものと順番、上下の幅。それでも届かなければ止めて結果に書く）
## 確かめ方（コマンド、見る数字）
## 参考（読む資料の場所。必要な部分だけ）
```

作業票で決めておくこと（Codex の要望 2026-10-30、#239 の結果）:
- 測り方: 完了を判定する道具と遊び方（`denali-sim` の auto は駐屯隊35隻のまま、`length-sim` の auto は出撃の上限まで写す、のように母集団が違う）。「何もしない」はどの道具のどの引数か（`length-sim` か `op-sim` の idle）。
- 数え方: 「長さ」は `gameSec`（1倍速の換算）で、早送りにかかった壁時計の時間ではない。中央値は全回か勝った回か、範囲はすべての回か中央値か。
- 順番と前提: 出来事の順番（波の順など）と、目標をどの段階で作るか。仮説（「これを直せば届く」）は仮説と書く。
- 原因を切り分ける数: 隻数だけでなく耐久の残りなど、結果の表に出してほしい項目。

Codex は終えたら、最後のコミットの本文に結果を書く（Claude は `git log` で読む。Issue にコメントできるならそこにも）:

```
## 結果
- PR: #番号（ブランチ codex/<話題>）
- やったこと:
- 測った数字:
- 作業票と違うこと・その理由:
- 自分で置いた仮の数値:
- 残った問題・わからないこと:
- テスト: npm test の結果
- 試遊ページの更新: 要る / 要らない
```

Claude はこれを読んでレビューとマージを行い、仮の数値と決まったことを資料（`docs/menu.md`、`docs/roadmap.md` ほか）に書いてから、Issue を閉じる。

## Codex を手元から呼ぶ（2026-10-30。ユーザーの Mac）
ユーザーの Mac では、Claude が Codex CLI を直接呼べる（作業票を貼る手間がない）。手動の渡し方（下）は、Codex Cloud を使うときに残す。
- 置き場所: リポジトリは `~/dev/War-of-space`。Codex CLI は `~/.npm-global/bin/codex`（ChatGPT でログイン済み）、`gh` は `~/.local/bin/gh`（PATH は通していないのでフルパスで）。push はこのリポジトリだけの設定（`credential.https://github.com.helper` に `gh auth git-credential`）。
- モデル: 基本 `gpt-6.1-terra`、推論の強さ medium（ユーザー決定 2026-10-30）。変えるのはユーザーが言ったときだけ。
- 手順:
  1. Claude が作業票を書く（GitHub の Issue。型は上の「作業票」）。
  2. Claude が `git worktree add -b codex/<話題> ~/dev/wos-codex-<話題> origin/main` で Codex 専用の作業フォルダを作る（Claude の作業と混ざらない）。
  3. Claude が後ろで走らせる: `codex exec -m gpt-6.1-terra -c model_reasoning_effort="medium" -C ~/dev/wos-codex-<話題> -s danger-full-access -o <結果のファイル> "<作業票の番号と、読むもの・守ること>" < /dev/null`。
  4. **コミットは Claude がする**: Codex は作業フォルダを直し、早送りとテストを自分で回して、結果（「結果」の型）を最後の返事に書いて止まる。Claude は差分を読み、大事な数は早送りで確かめる。
     - サンドボックスは `danger-full-access`（ユーザー決定 2026-10-30「緩めます」）。前の `workspace-write` では Chromium が起動せず（`browserType.launch` が閉じる）、`.git` にも書けなかった（`index.lock` を作れない）。緩めても、作業フォルダの外を直すこと・コミット・push は作業票で禁じる。直しが要れば、測った数を添えて `codex exec resume --last`（作業フォルダで）で続きを頼む。よければ Codex の結果を本文にしてコミット・push・PR・マージ・資料・試遊ページまで進める。
  5. 終わったら `git worktree remove` で作業フォルダを片付ける。
- `npm test`（約20分）と早送りの道具は、Claude と Codex で同時に回さない（実時間に頼る確認が落ちる）。Codex に走らせる回は、Claude は待つ。
- Codex が上限に当たったら、作業フォルダに残った変更を Claude が「作業中」のコミットで退避して push し、続きを同じ作業フォルダで呼び直す（`codex exec resume --last` も使える）。

## Codex への渡し方（手動。Codex Cloud を使うときだけ。ユーザー決定 2026-10-29）
1. Claude が作業票（Issue）を書き、ブランチ `codex/<話題>` と下書きの PR を先に作って見張る（最初のコミットは `docs/PROJECT_STATUS.md` の行）。
2. Claude が、Codex に貼る短い文をユーザーに渡す（リポジトリ、ブランチ、作業票の番号、「このブランチに push する」「新しい PR は作らない」「作業票の本文と、その下の Claude の追記コメントも読む」（追記がないときは「追記はなし」と書く。2026-10-30、Codex が追記を探して聞き返した）「目標に届かなければ、理由と試した数を書いて止まる」）。ブランチは、同じファイルを触る Claude の PR をマージしてから作る（食い違わないように）。
3. ユーザーがそれを Codex に貼る。手で行うのはここだけ。
4. Codex がそのブランチに push すると Claude が起こされ、CI → レビュー → マージ → 資料 → 試遊ページまで進める。
   - レビューでは、Codex が変えた数を Claude も早送りで確かめる（2026-10-30: Codex が延ばすためにユーコンの速さを半分にし、撤退で沈んで6回で1勝になっていた）。
   - 目標に届かなかった結果でも、ユーザーが決めた部分だけならマージしてよい。残りは作業票を開けたままにするか、新しい作業票にする（#239 → #241）。
   - Codex の結果の「作業票への意見」は、作業票の型（上）に取り込む。Codex がユーザーから直接受けた指示（例:「耐久を調節するとかは許されません」2026-10-30）は `docs/requests.md` に書き、作業票の追記も取り消す。

`@codex`（PR のコメントで頼む）は今は使わない。わかったこと（2026-10-29、PR #230〜#232）:
- Claude が書いた `@codex` にも Codex のボットは返事をする。「確かめて」のような頼み方だとコードレビューとして動いた。
- 実装を頼むと、Codex Cloud に環境（`beikutopoteto/War-of-space`、共有は「非公開」）があっても「create an environment for this repo」が返るだけで動かなかった。1回の `@codex` に返事が2つ来るので、GitHub に Codex の連携が2つ（ワークスペースが2つ）つながっていて、どちらからも環境が見えていない疑いがある。未解決。
- Codex は Issue に結果をコメントしなかった。結果はコミットの本文で受け取る（上の「作業票」）。

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
- PR ごとに GitHub Actions（`.github/workflows/check.yml`）が `npm run check-docs`（先に、すぐ終わる）と `npm test` を走らせる（check-docs は 2026-10-29、作業票 #229）。
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

- 受け取る側（Claude が上限で止まった作業を Codex が続けるときなど）: `git fetch origin` → `git switch <ブランチ>` → `git merge origin/main` → PR の「引き継ぎ」と `docs/PROJECT_STATUS.md` を読んでから続ける。引き継ぐときは PR の担当の行を書き換える。
- マージしたら `docs/PROJECT_STATUS.md` の「作業中のブランチ」から消す。

## 変更を失わないために
- 作業を始める前に `git status` と `git fetch origin`。未コミットの変更があれば、何のものか確かめてからにする（消さない）。
- push したブランチで rebase、amend、force-push をしない。`main` は `git merge origin/main` で取り込む。
- 相手が担当しているブランチには、引き継いだときだけコミットする。
- 食い違いやすいのは資料（`docs/history.md`、`docs/roadmap.md`、`docs/menu.md`、`docs/campaign.md`）と `tests/smoke.cjs`。資料への追記は、マージの直前にまとめて行うと食い違いが減る。
- `package-lock.json` は手で直さず、`npm install` で作り直す。
- `git reset --hard`、`git clean`、`git checkout -- .` は、未コミットの変更がないことを確かめてからだけ使う。

## 試遊ページ（ユーザー決定 2026-10-29）
- 更新は Claude だけができる（claude.ai の非公開ページ）。Codex がゲームの中身を変えたときは、PR と作業票の結果に「試遊ページの更新が要る」と書く。
- Claude はセッションの最初に、試遊ページに載っているファイル（Artifact の `read`）と `main` を比べ、違えば載せ直す。Claude がいないあいだの遅れは、これで取り戻す。
- 待たずに遊ぶときは、GitHub でブランチを選び「Code → Download ZIP」で落とし、展開した `index.html` を開く。ビルド不要なので、`main` でも作業中のブランチでもそのまま動く（three.js を CDN から読むのでネット接続は要る）。

## Claude だけができること
- サブエージェント（`.claude/agents/`）とスキル（`/ship`、`/tidy-docs`、`/story-draft`）。Codex は同じ資料を読んで、同じ手順を手で行う。
- PR の見張り（CI とレビューの通知）。
