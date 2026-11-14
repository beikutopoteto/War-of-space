# CLAUDE.md

宇宙艦隊戦の 3D リアルタイムストラテジー「War of Space」の試作。ブラウザだけで動く。詳しくは下の資料。

## 会話
- 日本語で、短く結論から。
- 指示が曖昧なら実装の前に選択式で聞く（ユーザー決定 2026-10-02）。指示の読み方は `docs/requests.md`。読み違えた・聞き返された・新しい言い回しが出たら、その都度そこを直して育てる。
- 見た目（アイコン、形、色）は見本の画像を見せ、許可を得てから入れる（ユーザー決定 2026-10-03）。方向性は `docs/spec.md`「デザインの方向性」。
- ユーザーが決めた仕様（`docs/spec.md`）は勝手に変えない。戦闘や画面の動きを変える前に読む。Claude が置いた数値は「仮」と書き `docs/menu.md` に記録する。

## 作業の進め方
- 正本はこのリポジトリ。ブランチを切って PR にし、`main` へ直接 push しない。マージは Claude の判断で随時よい（ユーザー決定 2026-10-02）。テストが通ってから。
- OpenAI Codex と同じリポジトリで交代に作業する（ユーザー決定 2026-10-29）。ブランチは `claude/<話題>`、止まる前に作業中のコミットを push し、PR に引き継ぎを書く。分担（作業票のコードは Codex、計画・測ること・git・資料・試遊ページは Claude）と Codex の呼び方・モデルは `docs/collaboration.md`、今の分担（ふだん／Codex 多め）は `docs/PROJECT_STATUS.md`、Codex の入口は `AGENTS.md`。セッションの最初に試遊ページと `main` を比べ、違えば載せ直す。
- 変更ができたら聞かずに `/ship`（`.claude/skills/ship/SKILL.md`）で最後まで: テスト → PR → CI → マージ → 試遊ページの更新（ゲームが変わったとき）→ 短い報告。止めるのはテストが直せないときと、ユーザーの判断が要るときだけ。
- 資料の整理とこのファイルの圧縮は `/tidy-docs`（「整理して」で、やり方の見直しもまとめて）。物語の叩き台と台詞の書き直しは `/story-draft`（置き場所はスキルの表）。
- サブエージェント（`wos-dev` 実装、`wos-story` 物語の考証、`wos-strategy` 部隊の動き、`wos-balance` 数値、`wos-ai` CPU の動き）の使い分けは `docs/collaboration.md`「サブエージェント」。
- トークン節約: 資料は必要なものだけ。大きなファイルは grep で場所を探してその部分だけ読む。確認用スクリプトはスクラッチパッドに置く。

## 資料（必要なときだけ読む）

| ファイル | 中身 |
|---|---|
| `docs/collaboration.md` | Codex との共同作業（セットアップ、テスト、ブランチ、引き継ぎ、Git の運用） |
| `docs/PROJECT_STATUS.md` | 作業中のブランチと担当、次の一手（引き継ぎ用の短いメモ） |
| `docs/DECISIONS.md` | コードの形と作業の進め方の判断と理由 |
| `docs/requests.md` | 指示の読み方（言い換え、範囲、質問のしかた、承認の言葉） |
| `docs/spec.md` | ユーザーが決めた仕様（見た目、操作、メニュー、技術ツリー、デザイン、艦種、索敵、艦載機と W.A.S.、部隊の名前） |
| `docs/menu.md` | 画面の流れ、細かい操作、仮の数値 |
| `docs/roadmap.md` | 完成の定義、現在地、次にやること、注意点、フェーズ |
| `docs/history.md` | これまでの経緯（日ごと）、ユーザーの判断の一覧（経緯を確かめたいときだけ） |
| `docs/campaign.md` | キャンペーンの作戦の表、各節の実装メモ |
| `docs/chapter1.md` | 第一章の物語の正本 |
| `docs/chapter2.md` | 第二章の物語の正本（叩き台） |
| `docs/ground-redesign-plan.md` | 地上・海上戦の再設計（確定・仮案・未着手） |
| `docs/terrain.md` | 地上戦のマップの地形の方針（作る順、設計図の形）。作戦ごとは `docs/terrain/` |
| `docs/supply.md` | 地上戦の補給と士気（仕様と仮の数値） |
| `docs/npc-doctrine.md` | NPC の規範行動（宇宙と地上で共通の指揮官の層、陣営の性格、強さの段階、確かめ方） |
| `docs/ground-script.md` | 地上の台本 |
| `docs/ground-structure.md` | 地上のコードの作りの見直し（第二章の前の整理） |
| `docs/weather.md` | 天候（雲・雨・雷・雪）のまとめ。実装は地上戦の土台のあと |
| `docs/riko.md` | リコ軍曹の話し方と考え方（台詞を書く前に読む） |
| `docs/story.md` | 世界設定（年表、D-RAMS、居住区の重さ、W.A.S.、拠点と資源衛星、火星、勢力、戦争の暦） |
| `docs/tutorial.md` | チュートリアル（カリュブディス）の計画 |
| `docs/maps.md` | 天体とマップの作り方（衛星、岩くず、民間区画、砲台、作戦の部品、確かめ方、好み） |
| `docs/models.md` | 地上戦の3Dモデル（決定、見本の作り方、残り: 海の艦・強襲母艦） |
| `docs/code.md` | コードの構成（ファイルの役割、`battle/` の読み込み順、保存、画面のつながり、艦隊の仕様の形式、確認） |
| `docs/reports/` | Codex の評価・価格の見積もり、監査の報告 |
| `docs/plans/` | 作戦の布陣とブリーフィングの図（`.png` と `.py`） |

## ファイルと動かし方（詳しくは `docs/code.md`）
- ビルド不要。`file://` でも動くよう ES モジュールでなく普通の `<script>` で読む。Three.js r128（新しい API はない）、CDN は cdnjs と jsdelivr の `three@0.128.0`。
- `index.html` は骨組みだけ。`data/` はゲームのデータ（`window.WOS_DATA`、数値や作戦はここだけ直す）。`battle/` は戦闘画面。`prep.js` / `prep.css` はタイトル〜出撃〜艦隊編集〜技術ツリー。
- 地上: 規則 `data/ground-rules.js`、台本 `battle/ground-script.js`。
- 保存は localStorage の `wos.save.v1`。形式を変えたら `migrate()` で古いデータを直す。
- 確認: `npm install` のあと `npm test`（ヘッドレス Chromium）と `npm run check-docs`。PR ごとに GitHub Actions でも走る。
- 試遊ページ: https://claude.ai/artifact/TZwfsz3vsyF6sgY3YYxPk1（非公開。GitHub Pages は公開になるので使わない）。

## いつも守ること
- 版権の名前は使わない。自軍「地球連合」（青）、敵「惑星共和国（アストラルリパブリック）」（赤）、要塞「カリュブディス」。「W.A.S.」を使い「M.A.S.」は使わない。
- 画面を隠さない。新しい UI は小さく半透明で、たためるようにする。
- 販売は PC 向けだけ（ユーザー決定 2026-10-03）。スマホ・狭い画面向けの調整は足さない。
