# 地上の台本

実装 2026-11-14（Codex、レビュー前）。第二章の作戦用の土台。既存の宇宙の出来事は使わない。

```js
groundScript:{
  objective:'本営 B を守る',
  loseText:'本営 B を失うか全滅で敗北',
  win:{any:[{hold:{site:'B',team:0,until:300}},{wiped:1}]},
  lose:{any:[{lost:'B',team:0},{wiped:0}]},
  events:[{id:'reinforce',when:{at:60},do:[{say:['演習管制','増援']}],once:true}]
}
```

時刻はすべて `gameSec`（地上の時間倍率を掛けたゲーム秒）。`opClock` / `CLOCK_RATE`（作戦時計の分）とは別。任務欄は `hold` の期限を「あと N 秒」で示す。勝敗は拠点の占拠更新後に毎ステップ、負けから先に判定。出来事だけ0.5ゲーム秒ごと。`once` は省略時true。falseなら条件が真の間、判定のたびに繰り返す。`after` はその出来事が直近に発生したゲーム秒から数える。

## 条件（when・win・loseで共通）

| 部品 | 意味 |
|---|---|
| `{at:秒}` | 時刻が秒以上 |
| `{site:'B',owner:0}` | 拠点の現在の持ち主。nullは中立 |
| `{lost:'B',team:0}` | 初めか試合中にその軍が持った拠点が、今その軍のものでない |
| `{power:{team:1,below:.5}}` | 生きている隊の耐久＋離脱時の耐久が、初期耐久＋増援出現時の耐久の合計の割合を下回る（境界と同値では偽） |
| `{inside:{team:0,at:[x,y],radiusKm:3,count:1}}` | 円内にその軍の生きている隊がcount隊以上。搭乗中・出口から離脱済みは数えない |
| `{flag:'名前'}` | 旗が立っている |
| `{after:{event:'id',sec:30}}` | 指定出来事が起きてからsec秒以上 |
| `{hold:{site:'B',team:0,until:300}}` | 時刻がuntil以上、その時点でその軍の拠点（連続保持の条件ではない） |
| `{exited:{team:0,count:3}}` | 出口から離脱した隊がcount以上 |
| `{wiped:1}` | 生きている隊が0、かつ出口から離脱した隊も0 |
| `{all:[…]}`・`{any:[…]}` | 全部・どれか |

`win` / `lose` は条件の代わりに `[{when:<条件>,text:'結果の文',log:['話し手','通信']},…]` とも書ける。上から最初の成立理由を結果画面と通信に使う。textやlogの省略時は従来の `op.result` を使う。

## すること（do）

| 部品 | 中身 |
|---|---|
| `{spawn:{team:1,units:[…],via:'edge'}}` | 自軍0または敵1の部隊を出す。unitsは `{name,kind,at:[xKm,yKm],band}`。edge / sea は指定地点に出す。海の艦もseaで書ける（kind:'sea', type等） |
| `{spawn:{team:1,units:[…],via:'air',warnSec:20,descentSec:10}}` | 出来事発生時に赤い予告円と残り秒。warnSec後に出現、descentSecの間は移動・攻撃不可、被弾1.5倍（仮） |
| `{say:['話し手','文']}` | logEventで通信 |
| `{objective:'文'}` | 任務欄の目標を更新。初期文はgroundScript.objective、省略時op.win.text |
| `{setWin:<条件>}`・`{setLose:<条件>}` | 試合中の勝敗条件を差し替える。結果理由の一覧も使用可 |
| `{intent:{team:1,type:'hold',zones:['F'],until:600,style:'firm'}}` | 指揮官の意図を上書き。既存seize / hold / delay / withdrawだけ。次の判断で読む |
| `{owner:{site:'C',team:1}}` | 拠点の持ち主を変更。両軍の占拠進捗を0へ |
| `{flag:'名前'}` | 旗を立てる |
| `{mark:{label:'敵の増援',at:[x,y],sec:30}}` | 地図に印。sec後に消す、省略で永続 |
| `{exit:{id:'west',team:0,at:[x,y],radiusKm:2}}` | 出口と印。その軍の地上の隊が円内に入れば離脱。死亡扱いにせずfleetsに残し、描画・選択・被弾・占拠から除く |
| `{end:'win'}`・`{end:'lose'}` | 即終了 |

地形の座標はkm。初期部隊と増援は共通の `groundInitUnit(f)` で高さ・通行可能地点・持ち場・モデル・名札・索敵・補給を初期化。自軍増援は編成の独立中隊に、敵増援は指揮官がいる場合に次の判断から入る。

## 状態と互換性

`battle/ground-script.js` の判定 `groundScriptEval(script,state)` は純粋関数。stateは time、sites（id / owner / heldBy）、teams（initial / power / alive / exited）、units（team / alive / exited / embarked / at）、flags、done（出来事id→秒）、eventsDueを持つ。返り値は actions / end / why と発生したidの fired。入力は書き換えない。

適用 `groundScriptStep(dt)` は試合中の状態に旗・済んだ出来事・印・出口・増援・予告待ち・条件と目標と意図の上書き・持ち主の履歴を持つ。現在の持ち主は従来どおり試合中のgroundSites。作戦データのopは書き換えない。resetで作り直す。

台本がなくても従来の `win.type` は動く。敵本営の占領か全滅、支援以外の全拠点占拠、自軍全滅を内部で条件へ変換する。案内の進行と完了は既存の処理、スキップ時はA占拠。既存の任務欄の文は維持。groundScriptのwin / lose指定があれば優先する。

天候変更・友軍として出す部隊は後で（ユーザー決定2026-11-14）。プレイヤーと敵の共有命令（布陣・進撃計画・実行・停止防衛）はこの票では扱わない。

## 確認

- `node tests/ground-script.cjs`：条件・組合せ・once・after・全アクション返却・入力不変。
- `node tools/ground-script-check.cjs`：実画面の適用と早送り。1600×900の写真は `test-results/ground-script-warning.png`、結果は同じ場所のground-script-browser.json。
- `npm run test:ground`：上記のNode検証と実画面検証を既存の地上検証と一緒に実行。
- 演習 `groundScriptTest` はhidden:true / debug:true。デバッグの「作戦と画面を自由に選ぶ」が有効なときだけ演習一覧に表示。ほかの隠し作戦は出さない。

仮の数値は `docs/menu.md`「地上の台本の仮の数値」。
