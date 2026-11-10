# 地上海軍の分類・射程・地平線

2026-11-10。段階6の独立部品。`battle/ground-naval.js` とNode専用の `tests/ground-naval.cjs` を追加した。既存の生成・射撃・表示・保存への接続は主担当の別作業で、段階6全体の完了を意味しない。新しい見た目の制作、宇宙艦表・宇宙編成の移行は行わない。

## APIと旧typeの互換

`groundNavalClass(f)` は `groundKind==='sea'` の場合だけ分類する。戻り値は `{id,name,model,rangesKm,gunHeightM,targetHeightM}`。`rangesKm` は `{direct,indirect:{min,max},aa}`（km）。各呼出しでコピーを返し、呼出し側の換算が共有表を変更しない。`groundNavalModel(f)` はモデルID文字列を返す。非海軍・未知IDはどちらも `null`。

|旧type／条件|id|表示名|流用モデル|直接km|間接km|自動対空km|仮の砲口高m|仮の目標高m|
|---|---|---|---|---:|---|---:|---:|---:|
|cv / ff|fastboat|高速艇|ff|8|0〜8|3|4|4|
|dd / cl|aegis|イージス艦|cl|24|0〜24|150|8|8|
|bb|battleship|戦艦|bb|40|0〜40|6|12|12|
|groundLanding:true|landing|揚陸艦|dd|現行表を保持|現行表を保持|現行表を保持|4|4|

射程は `docs/ground-redesign-plan.md` の仮案。対空150kmは観測・追尾を保証する距離ではない。砲口高と目標高も実測値ではなく仮値で、マスト高ではない。揚陸艦フラグを旧type分類より優先する。既存のddモデルを維持するが、揚陸機能・容量・所要時間の判定は既存の `groundLanding` に残す。

揚陸艦の射程は実行時の `WOS_TERRAIN[op.ground].navalFireRangesKm[f.type]` をコピーする。現在の演習はtype:ddで、直接24km・間接0〜24km・対空150km。旧 `groundSeaStats('dd').range` の18戦闘単位（4.5km）は互換用の旧値であり、現在の武器射程と取り違えない。作戦表がない、typeが未登録、射程が非有限・不正の場合は分類も `null` として能力を捏造しない。未統合のcvb / mas / mascを一般戦闘艦へ自動分類しない。既存の経路を維持するかは呼出し側が決める。

旧typeを書き換えず分類先のmodelを別に使う。固定性能は主担当の統合でff / cl / bbの現在の換算式を使い、元の `WOS_DATA.ships`、研究・宇宙編成・保存データには変更を加えない。揚陸艦の固定性能は従来のdd換算を維持する。戦艦の主砲中心の射撃設定も既存統合側の担当で、この部品は射撃間隔や威力を変更しない。

## 物理高さと地平線

`groundNavalHorizonFromMeters(h1,h2)` は、mを入力してkmを返す純粋関数。地球半径R=6371kmと `sqrt(2R*h1/1000)+sqrt(2R*h2/1000)` を使う。有限の負値は0へ丸め、NaN・Infinity・数値以外は `null`。地形の遮蔽・観測条件・兵器の到達距離とは独立した上限である。

`groundNavalHorizonKm(f,t)` は海軍射手の砲口高と目標高を求めて上の式へ渡す。不正な射手・目標・座標・必要な地形設定は `null`。`groundNavalHeightMeters(f,role)` で中間値を取得でき、roleは `'gun'` または `'target'`（既定値）。

- 海軍の砲口／代表目標高は上表の海面からの仮値。海軍の描画pos.yや視界用eyeHeightを使わない。
- 地上目標の地表高mは `groundSightHeight(x,z)*1000/(GROUND_SCALE*elevationExaggeration)`。三角形補間した面の高さを使い、目標の代表高2m（仮）を加える。対象は `pos:{x,y,z}` を持つ部隊または地点ラッパーで、band省略時は地上扱い。
- 空中目標は地表の実高に `(pos.y-groundHeight(x,z))*1000/GROUND_SCALE` を加える。航空高度を18で割らず、高度切替中も実際のpos.yを使う。地表から下のオフセットは0へ丸める。
- 現行地形の海面は描画／戦闘座標の0。meta.seaLevelMは海抜datumなので、上の地表高へ再度加減しない。

これらの換算は既存の表示誇張から物理高さを分ける実装規約。地球以外の曲率、屈折、観測方式の追加は実装していない。

## 接続担当への注意

直射の可否・追撃距離・射程マスクで、兵器射程と地平線の小さい方を同じ規約で使う。距離を比較するときだけkmを `GROUND_SCALE` 倍して戦闘単位へ変換する。`null` を無制限射程と解釈しない。既存LOS・観測条件も維持する。間接照準と自動対空へこの地上直射上限を一律適用しない。

海上への間接射撃は、部隊目標のband制約、海上地点禁止、着弾対象、砲撃AI候補を一緒に直す必要がある。この分類部品だけでは、それらの旧制限は解除されない。既存の一斉射・散布・弾道台帳の仕様も変えない。

## 専用確認

`node tests/ground-naval.cjs`。`nodeChecks()` は `{name,ok}` の行を返す。旧ID・揚陸艦の優先、射程コピーと宇宙艦表の不変、単位と負値・不正値、地表18倍と航空高度の分離を確認する。既存統合・ブラウザ・全テストはこの担当では実行しない。
