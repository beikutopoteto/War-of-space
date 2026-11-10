/* NPC の指揮官のドクトリン（規範）と強さの段階。設計は docs/npc-doctrine.md。数値はすべて仮。
   普通の <script> で読むと window.WOS_DATA.npc に入る。頭（battle/npc-core.js）はこの表だけで性格が変わる。
   時間はゲーム内の秒、力の比は「自軍の力 ÷ 知っている敵の力」。 */
(() => {
  const base = {
    // 姿勢を決める比
    attack: 1.3,        // この比以上なら攻める
    break_: 0.45,       // この比より下なら遅滞（下がりながら守る）
    band: 0.15,         // 姿勢を変えにくくする幅（行ったり来たりを防ぐ）
    commit: 30,         // 姿勢を変えたあと、次に変えるまでの最短の秒
    minInfo: 0.35,      // 敵地のうち最近見た割合がこれより低いと、攻める前に偵察する
    probeMax: 50,       // 偵察だけで待つ最長の秒
    assume: 1,          // 見ていない敵地にいると仮定する守備（平均的な1隊の何倍か）
    // 兵力の配り方
    mass: 0.6,          // 主攻に集める機動兵力の割合
    reserve: 0.2,       // 予備として残す割合
    garrison: 1,        // 前線の拠点に置く守備（平均的な1隊の何倍か）
    economy: 0.5,       // 攻めているあいだ、守備を減らす倍率
    baseGuard: 1,       // 本営に必ず置く守備
    holdRatio: 1,       // 脅威に対して守りに置く力の比
    fix: 0.5,           // 助攻（拘束）に使う力の比
    counter: 1.2,       // 取られた拠点を取り返すのに要る比
    counterWindow: 120, // 取られてから取り返しを考える秒
    cutMax: 0.5,        // 遮断の対象にするのは、守備がこの倍率以下の拠点
    // 主攻の段取り
    massing: 0.7,       // 集結で、この割合が集まったら前進
    assembleMax: 80,    // 集結を待つ最長の秒
    consolidate: 20,    // 拠点を取ったあと、次の攻撃までの秒
    abort: 0.5,         // 割り当てた力がこの割合まで減ったら攻撃を中止
    retry: 150,         // 中止した拠点を避ける秒
    // 目標の選び方（重み）
    wGoal: 2, wDist: 1, wFoe: 0.6, wCut: 0, wLost: 1, wFail: 1.5, stickObj: 0.5, vary: 0.2,
    avoid: 0,           // 経路で守りの固い拠点を避ける強さ（0 は最短を通る）
    feint: false,       // 助攻（拘束）を出すか
    // 傷んだ隊の扱い
    pull: 0.35,         // 耐久がこの割合より減った隊は、攻めに使わない（耐久は休んでも戻らない）
    pullMorale: 0.3, pullSupply: 0.2, resume: 0.7, // 士気か補給がここまで減ったら下げ、resume まで戻ったら復帰
    refitMax: 90,       // 再編で待つ最長の秒
    // 割り当ての安定
    sticky: 60, roleBias: 30,
    // 友軍の制限: プレイヤーの先頭の拠点より、この数の拠点ぶんまでしか先へ出ない
    allyLead: 0,
  };
  const doctrines = {
    /* 地球連合: 火力と線。集めてから一方向を押す。予備を厚く持ち、補給線を守る。 */
    earth: { ...base, name: '地球連合', attack: 1.5, mass: 0.7, reserve: 0.25, massing: 0.8, assembleMax: 90, consolidate: 30, feint: false, wCut: 0, avoid: 0, counter: 1.2 },
    /* 惑星共和国: 機動と浸透。固い所を避けて回り込み、助攻で釣り、補給線を切る。予備は薄い。 */
    mars: { ...base, name: '惑星共和国', attack: 1.1, break_: 0.4, commit: 20, minInfo: 0.25, probeMax: 35, assume: 0.7,
      mass: 0.5, reserve: 0.1, garrison: 0.5, economy: 0.3, holdRatio: 0.8, massing: 0.6, assembleMax: 50, consolidate: 10,
      abort: 0.4, retry: 110, feint: true, wCut: 1.2, avoid: 1.5, counter: 1.0, pull: 0.3 },
  };
  /* 強さの段階: 規範は同じで、判断の速さと読みの深さだけが違う。
     think: 考える間隔（秒）　react: 状況が変わってから姿勢を変えるまでの秒　memory: 見失った敵を覚えている秒
     horizon: 脅威として数える距離（マップの差し渡しに対する割合）　tasks: 同時に出せる攻めの任務の数（1=主攻だけ、2=＋助攻、3=＋遮断）
     error: 敵の力の見積もりの誤差（±の割合） */
  const levels = {
    easy:     { think: 6,   react: 12, memory: 30,  horizon: 0.25, tasks: 1, error: 0.4 },
    standard: { think: 3,   react: 5,  memory: 60,  horizon: 0.5,  tasks: 2, error: 0.2 },
    hard:     { think: 1.5, react: 2,  memory: 120, horizon: 0.8,  tasks: 3, error: 0.05 },
  };
  /* 兵科の役（モードに依らない7つ）。line=線を張り拠点を取る　shock=突破　fires=間接火力　screen=対空・護衛
     recon=偵察　strike=航空・W.A.S. の打撃　support=補給・工兵・輸送 */
  const roles = {
    ground: { infantry: 'line', heavyInfantry: 'line', commando: 'line', vehicle: 'shock', was: 'shock', mechanicalAssault: 'shock',
      artillery: 'fires', guidedRocket: 'fires', mobileAA: 'screen', scout: 'recon', droneHive: 'recon',
      fighter: 'screen', attack: 'strike', supportAircraft: 'strike', apc: 'support', engineer: 'support', supply: 'support', sea: 'fires' },
    space: { bb: 'shock', cl: 'line', dd: 'screen', ff: 'screen', cv: 'strike', cvb: 'strike', mas: 'strike', masc: 'strike' },
  };
  window.WOS_DATA = window.WOS_DATA || {};
  window.WOS_DATA.npc = { doctrines, levels, roles };
})();
