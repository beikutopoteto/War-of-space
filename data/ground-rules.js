/* 地上・海上専用の基本規則。地形とは独立し、宇宙の性能表には適用しない。 */
window.WOS_GROUND_RULES = {
  clock: { minutesPerSecond:1 }, // 地上戦はゲームの1秒で作戦の時計が1分進む（#509）
  bands: { heights: { ground:0, low:12.288, high:19.2 }, transitionSec:5, weakFire:.5, fireEvery:1, initial:{fireEvery:1.5}, dimOpacity:.15, gridStep:8 }, // 段の見た目の高さは見本と同じ比率（戦闘単位）。全て仮。
  // 飛ぶ速さ（ユーザー 2026-11-25）: 巡航は山や木をよけるので低空より遅く約180 km/h、低空は設定の300〜400 km/h に戦闘中の0.7倍で245 km/h。
  // 時速 = 速さの値 × 15 km（ゲームの1秒 = 1分の目安、docs/ground-tempo.md）。値は仮。
  wasFlight: { heightKm:.03, transitionSec:2, speed:{ cruise:12, low:16.3 },
    moveSupplyFactor:{cruise:1.4,low:2}, idleSupplyPerSec:{cruise:.035,low:.05}, // 巡航は今の0.7倍（ユーザー決定 2026-11-27）
    evasion:.5, npcMinKm:6 }, // ほかは仮。
  // 索敵の距離・高さは戦闘単位。レーダーも同じ視界に含める。全て試作の仮値。
  sight: { site:30, basic:30, scout:40, concealment:{scout:.5,drone:.5}, supportAircraft:100, forest:.6, eyeHeight:.35, heightGain:.3, heightForMax:1.2, rayStep:.5, fogStep:2, fogEvery:.5, fogAlpha:110 },
  // 地点攻撃の試作値。距離は戦闘単位。散布は着弾中心の最大ずれ、威力は unitTypes の dmg。
  // 2026-11-17決定の最大値で遊ぶ。initialは将来の研究用データだけで、現在は参照しない。
  // dmgScale は地点攻撃の弾だけに掛ける威力の倍率（対地の直射は unitTypes の weapons を参照）。間接の砲撃は2倍（ユーザー決定 2026-11-17）。
  // minScatterDiameter10KmM は10kmでの最小直径（m）、scatterRatioは距離に対する直径の比。
  strike: {
    vehicle:{delay:2,radius:.4,dmgScale:3,areaRadius:2,spread:.08,reload:4,initial:{radius:.2,reload:6}}, // 地点攻撃だけ3倍（ユーザー決定 2026-11-17。爆風が小さくなり強化歩兵への効きが前の約0.28倍だった）
    was:{delay:5,radius:.4,dmgScale:2,areaRadius:7,reload:8,minScatterDiameter10KmM:25,initial:{radius:.2,reload:12}},
    artillery:{delay:5,radius:.8,dmgScale:2,areaRadius:7,spread:2,reload:8,minScatterDiameter10KmM:25,initial:{radius:.4,reload:12}},
    guidedRocket:{delay:5,radius:1.2,dmgScale:2,areaRadius:7,reload:30,rocketsPerVolley:12,burstInterval:.25,scatterRatio:.02,initial:{radius:.6,burstInterval:.5,reload:45}},
    supportAircraft:{delay:7,radius:2.4,areaRadius:9,spread:2,reload:10,bombsPerPass:6,initial:{radius:1.2,reload:15,bombsPerPass:4}},
    battleship:{delay:8,radius:1.2,dmgScale:2,areaRadius:10,reload:10,scatterRatio:.004,initial:{radius:.6,reload:15}},
    sea:{delay:8,radius:.48,dmgScale:2,areaRadius:10,reload:10,minScatterDiameter10KmM:25,initial:{radius:.24,reload:15}},
    // 海の艦・橋・未指定兵科の倍率、aiBodiesは仮（#448）。
    armor:{supply:1.3,infantry:1,commando:1,mechanicalAssault:1,heavyInfantry:.35,apc:.35,scout:.35,artillery:.35,mobileAA:.35,guidedRocket:.35,engineer:.35,vehicle:.15,was:.2,sea:.15,bridge:1,default:1},
    // #501 の仮値。armor は爆風の半径に使い、softTarget は当たったときの威力に使う。
    softTarget:{
      infantry:2,commando:2,supply:2,mechanicalAssault:1.8,heavyInfantry:1.5,
      apc:1.25,scout:1.25,engineer:1.25,artillery:1.25,guidedRocket:1.25,mobileAA:1.25,
      vehicle:1,was:1,sea:1,bridge:1,default:1
    },
    morale:{vehicle:2,was:2,artillery:2.5,guidedRocket:2.5,supportAircraft:2.5,battleship:2.5,sea:2.5},
    suppress:{
      profiles:{
        infantry:'infantry',commando:'infantry',mechanicalAssault:'infantry',supply:'infantry',heavyInfantry:'heavyInfantry',
        vehicle:'heavyVehicle',was:'heavyVehicle',apc:'lightVehicle',scout:'lightVehicle',engineer:'lightVehicle',
        artillery:'lightVehicle',guidedRocket:'lightVehicle',mobileAA:'lightVehicle'
      },
      infantry:{seconds:10,speed:.1},heavyInfantry:{seconds:10,speed:.4},shock:{seconds:5,speed:.7},
      mobility:{runningGear:{seconds:30,speed:.4},engine:{seconds:60,speed:.15}},
      chances:{heavyVehicle:{runningGear:.15,engine:.05,destroy:.01},lightVehicle:{runningGear:.25,engine:.08,destroy:.03}}
    },
    unseenSpread:2,aiBodies:3,effectSec:.8
  },
  // 輸送・架橋の試作値。距離は戦闘単位、橋の幅判定は water の km。
  transport: { boardRange:1.6, unloadKm:.4, wreckLoss:.5, repathSec:.5 },
  landing: { capacity:2, seconds:10, damageFactor:1.3 }, // 海の揚陸艦だけの仮値。沈没時は搭載中隊を全滅扱い。
  engineering: { seconds:20, hp:40, workRange:2.4, bankMarginKm:.12, laneHalfKm:.4 },
  // 地上試作専用。硬さ1点=耐久20の仮換算。宇宙艦の表・倍率は使わない。
  // moraleMax は士気の最大の倍率（max×倍率）。歩兵は他の兵科より士気が高い（ユーザー決定 2026-11-17）。W.A.S. の2は #501 の仮（士気を戻しても正面の戦車1隊に勝つ役割を保つ）。
  supply: {max:100,moraleMax:{infantry:1.5,heavyInfantry:1.5,commando:1.5,mechanicalAssault:2,was:2},refill:2,refillWait:2,move:2,shot:.5,strike:4,build:.2,giveKm:3,give:4,moraleGiveMax:.8,moraleGiveCost:.5,
    giveStart:.8,approachKm:1,followKm:1.5,giveRepath:1,aiFocusBelow:.5, // 分配の開始割合はユーザー決定、距離・間隔・NPCの割合は仮（#486）
    rearGapKm:.5,retreatSafeKm:5,retreatSearchKm:12,retreatFallbackKm:5,retreatQuietSec:20,retreatCheckSec:1, // #508 の仮値
    terrainMove:{'平地':1,'沼地':3,'山岳':3,'砂漠':2},terrainIdle:['沼地','山岳','砂漠'],idleMorale:.05,
    moraleCut:.5,moraleLoss:2,moraleBodyLoss:.5,dugSec:60, // #501 の仮値
    siteRefill:2,siteMoraleRefill:1.5, // 味方拠点の円の中では補充と士気回復をこの倍に（道路は1倍。ユーザー決定 2026-11-25）
    moraleRefill:2,restWait:5,hitSlow:.65,hitSeconds:2,routArrivalKm:1,routRepath:2,rally:30,
    aiSupply:25,aiMorale:30,aiResume:60,airIdle:.05,airShot:2,airStrike:8,airReturn:15,airBase:20}, // 全て地上試作の仮値
  // fireRangesKm は武器到達距離（km）の仮値。索敵距離とは独立。
  // direct / indirect:{min,max} は地上・海上、ground / air は航空の対地・対空。
  // aa は航空機以外の自動対空用、airborne は空中 W.A.S. の対地・対空。未指定・0は能力なし。
  // 出撃する1小隊あたりの補給値（仮、#485）。海の艦は対象外。
  supplyWeight: {
    infantry:1,scout:1,engineer:1,commando:1,apc:1,supply:1,
    heavyInfantry:2,mobileAA:2,mechanicalAssault:2,
    vehicle:3,artillery:3,guidedRocket:3,was:3,fighter:3,attack:3,supportAircraft:3
  },
  sortieLimits: {
    scales:{division:{name:'師団規模',cap:64}},supplyPerPlatoon:4, // 仮（#485）
    penaltyPerPoint:2,maxPenalty:50 // %（ユーザー決定 2026-11-18）
  },
  // 旧 range（戦闘単位）は旧データとの互換用に維持し、新しい射撃判定は fireRangesKm を使う。
  // #501 の耐久・装甲・直射武器・爆風への士気の強さはすべて仮。dmg は地点攻撃や既存の対空などに使う。
  unitTypes: {
    // 速さ（ユーザー承認 2026-11-25、値は仮）: 歩く兵科は前の約0.75倍、装甲兵員輸送車 4→3・斥候 4→3.5（装輪は道路で2.5倍）。補給部隊は野原で戦車と並ぶ 2.5→3、無誘導ロケットは自走砲と同じ 1.5→2.5（ユーザー 2026-11-25）。ほかの装軌は前のまま。
    // W.A.S. の歩きは設定の75〜125 km/h に戦闘中の0.7倍で70 km/h（3→4.7、ユーザー 2026-11-25）。航空は仕様が変わるかもしれないので前のまま（仮）。
    infantry:{name:'強化歩兵',speed:1.5,range:10,hp:160,dmg:2,armor:10,blastMorale:1,weapons:[{power:2,pen:15,morale:1},{power:2.5,pen:700,soft:.15,morale:1,shaped:true}],fireRangesKm:{direct:0.8,aa:0.5}},
    heavyInfantry:{name:'重強化歩兵',speed:1.1,range:16,hp:200,dmg:4,armor:30,blastMorale:1,weapons:[{power:4,pen:60,morale:1.2},{power:7,pen:2000,soft:.15,morale:1,top:true}],fireRangesKm:{direct:4,aa:6}},
    commando:{name:'強化コマンド歩兵',speed:1.9,range:10,hp:160,dmg:2,armor:10,blastMorale:1,weapons:[{power:2,pen:15,morale:1},{power:2.5,pen:700,soft:.15,morale:1,shaped:true}],fireRangesKm:{direct:0.8,aa:0.5}},
    guidedRocket:{name:'無誘導ロケット',speed:2.5,range:30,hp:100,dmg:4,permissionOnly:true,armor:{front:300,side:50,top:40},blastMorale:.7,fireRangesKm:{indirect:{min:0,max:50}}},
    mechanicalAssault:{name:'機械化突撃兵',speed:2.2,range:10,hp:120,dmg:3,permissionOnly:true,armor:15,blastMorale:1,weapons:[{power:3,pen:25,morale:1},{power:2.5,pen:700,soft:.15,morale:1,shaped:true}],fireRangesKm:{direct:1.2,aa:0.8}},
    mobileAA:{name:'自走対空砲',speed:2.5,range:25,hp:150,dmg:4,armor:{front:300,side:50,top:40},blastMorale:.7,weapons:[{power:2,pen:90,morale:1.5}],fireRangesKm:{direct:2,aa:4}},
    vehicle:{name:'主力戦車',speed:3,range:20,hp:250,dmg:5,armor:{front:1800,side:500,top:150,shapedFront:2200},blastMorale:.4,weapons:[{power:5,pen:100,soft:1.6,morale:1.2},{power:6,pen:1800,soft:.2,morale:1.2}],fireRangesKm:{direct:3,aa:1}},
    scout:{name:'斥候',speed:3.5,range:7,hp:80,dmg:1,armor:{front:200,side:60,top:40},blastMorale:.7,weapons:[{power:1,pen:20,morale:1}],fireRangesKm:{direct:0.6}},
    apc:{name:'装甲兵員輸送車',speed:3,range:8,hp:225,dmg:1,armor:{front:200,side:60,top:40},blastMorale:.7,weapons:[{power:3,pen:200,morale:1.2}],fireRangesKm:{direct:1.5,aa:1}},
    engineer:{name:'工兵',speed:2,range:7,hp:100,dmg:1,armor:{front:200,side:60,top:40},blastMorale:.7,weapons:[{power:1,pen:20,morale:1}],fireRangesKm:{direct:0.6}},
    supply:{name:'補給部隊',speed:3,range:0,hp:100,dmg:0,armor:5,blastMorale:1,fireRangesKm:{direct:0}},
    artillery:{name:'自走砲',speed:2.5,range:45,hp:100,dmg:12,armor:{front:300,side:50,top:40},blastMorale:.7,weapons:[{power:6,pen:150,morale:2}],fireRangesKm:{direct:2,indirect:{min:2,max:30}}},
    fighter:{name:'戦闘機',speed:8,range:20,hp:40,dmg:2,fireRangesKm:{ground:0,air:2}},
    attack:{name:'攻撃機',speed:6,range:15,hp:40,dmg:2,weapons:[{power:2,pen:60,soft:2,morale:1.5},{power:6,pen:1500,soft:.2,morale:1.5,top:true}],fireRangesKm:{ground:10,air:15}},
    supportAircraft:{name:'広域戦略支援航空機',speed:5,range:20,hp:20,dmg:16,fireRangesKm:{ground:0,air:0}}, // 固定射程なし。段階7の実高度・速度から投下進入を計画（索敵はsightで独立）
    // directFirst: 直接射撃を主とする。間接射撃は地点攻撃の命令のときだけ撃ち（自動交戦・攻撃の命令・敵の自動の地点攻撃では撃たない）、
    // 攻撃の命令と NPC の助攻では直接射撃の距離まで近づく（ユーザー決定 2026-11-19）
    was:{name:'陸戦型 W.A.S.',speed:4.7,range:12,hp:150,dmg:2,directFirst:true,armor:{front:250,side:150,top:150},blastMorale:.7,weapons:[{power:5,pen:280,soft:1.5,morale:1.5,air:true,fx:'gatling'},{power:5,pen:800,morale:2},{power:6,pen:2500,soft:.1,morale:1.5,shaped:true}],evasion:.3,fireRangesKm:{direct:3,indirect:{min:1,max:12},aa:6,airborne:{ground:5,air:15}}}
  },
  // 地上・海上専用の仮射程（km）。既存の艦種IDを使い、宇宙側の艦種・性能は変更しない。
  navalFireRangesKm: {
    cv:{direct:8,indirect:{min:0,max:8},aa:3}, // 高速艇（モデル統合は段階6）
    ff:{direct:8,indirect:{min:0,max:8},aa:3},
    dd:{direct:24,indirect:{min:0,max:24},aa:150}, // イージス艦。150kmは発見・追尾を保証しない。
    cl:{direct:24,indirect:{min:0,max:24},aa:150},
    bb:{direct:70,indirect:{min:0,max:70},aa:6}, // レールガン（2026-11-14）。実際の値は battle/ground-naval.js の戦艦
    // 母艦・揚陸艦は未再設計。旧到達距離 (10 + ships.rng * 1.6) / 4 km を直接・間接・対空に仮置き。
    cvb:{direct:4.1,indirect:{min:0,max:4.1},aa:4.1},
    mas:{direct:3.3,indirect:{min:0,max:3.3},aa:3.3},
    masc:{direct:3.7,indirect:{min:0,max:3.7},aa:3.7}
  },
  // ユーザー決定 2026-11-12: damageScale、neutralSeconds、roadSegmentKm、timeScale、roadFactorは全て仮。
  combat: {
    // #511。時刻はゲーム秒。機体数と射程・電池はユーザー決定、ほかの性能は仮。
    drone: {
      name:'ドローン',airframes:3,rangeKm:15,researchRangeKm:50,batterySec:60,
      speedKmPerSecond:1,heightKm:.25,sightKm:2,orbitKm:.5,chargeSec:30,
      diveInterval:.25,otherHit:.1, // ユーザー決定 2026-11-27
      diveHeightKm:.05,diveOffsetKm:.025,seaAAKm:3, // 仮。落下を始める高さと手前の距離、艦の近接対空。
      replenishSec:30,replenishSupply:.5,aaHit:.5,
      weapon:{power:5,pen:800,soft:.5,morale:1,top:true},
      npcTargets:['vehicle','artillery','guidedRocket','mobileAA'],
      launchOffsetKm:[.35,.45] // 仮。承認済みの見本と同じ斥候からの前後・左右の間隔。
    },
    damageScale:1.3,mobileAAAir:2,urbanMargin:.8,townMargin:.4,mechanicalWearPerSec:.001,
    // #501 の仮値。正面は ±60°（cos 60° = 0.5）。町と森は町を優先し、停止による陣地は重ねる。
    penetration:{exponent:4,floor:.03,frontCos:.5},
    infantryCover:{
      forest:{direct:{h:.6,m:.7},blast:{h:.6,m:.85}},
      town:{direct:{h:.5,m:.55},blast:{h:.3,m:.6}},
      dug:{direct:{h:.7,m:.8},blast:{h:.5,m:.7}}
    },
    commandoCoverPower:1.5
  },
  capture: { group:2, seconds:30, roadSeconds:5, neutralSeconds:.5, roadSegmentKm:3, radiusKm:2, roadWidthKm:1.25, decayPerSec:1, decayDelay:2, contestedRate:.5 }, // group: ほかの兵科は1隊 1/group 点。contestedRate: 拠点の競合中の速さ（ユーザー決定 2026-11-20）
  movement: { timeScale:1.2, roadFactor:1.5,
    // 道路の速さの倍率は足回りで分ける（ユーザー承認 2026-11-25「速さは出してもらった案でいいですよ」。値は仮）。
    // 徒歩（infantry）・二足歩行（was）1.2、装軌（vehicle・engineer）1.5、装輪（wheel＝補給部隊・地球の無誘導ロケット、scout、apc）2.5。表にない種類は roadFactor。
    road: { infantry: 1.2, was: 1.2, vehicle: 1.5, engineer: 1.5, wheel: 2.5, scout: 2.5, apc: 2.5 },
    marsh: { vehicle: 0.3, wheel: 0.3, infantry: 0.6, was: 0.6, scout: 0.3, apc: 0.3, engineer: 0.6 }, river: { vehicle: 0, wheel: 0, infantry: 0.2, was: 0.5, scout: 0.5, apc: 0.5, engineer: 0.5, air: 1 } }, // 仮の通行速度倍率
};

/* 既定の6中隊。従来の地上演習と同じ名前・兵科・順番・仮配置。 */
window.WOS_GROUND_DEFAULT_COMPANIES = [
  {name:'第1 戦車中隊',groundKind:'vehicle',band:'ground'},
  {name:'第2 強化歩兵中隊',groundKind:'infantry',band:'ground'},
  {name:'第3 重強化歩兵中隊',groundKind:'heavyInfantry',band:'ground'},
  {name:'第4 戦闘航空隊',groundKind:'fighter',band:'high'},
  {name:'第5 攻撃航空隊',groundKind:'attack',band:'low'},
  {name:'第6 陸戦型 W.A.S. 試験隊',groundKind:'was',band:'ground'}
];

let groundRuleCache=null;
// 読み取り時は重ね直さない。setup前の確認では、作戦・地形の切替時に初期化する。
function groundRuleSet(){
  const operation=typeof op!=='undefined'?op:null;
  const id=(typeof groundTerrainId!=='undefined'&&groundTerrainId)||operation?.ground||'exercise2';
  const terrain=window.WOS_TERRAIN?.[id],overrides=operation?.groundRuleOverrides;
  if(!groundRuleCache||groundRuleCache.terrain!==terrain||groundRuleCache.id!==id||groundRuleCache.overrides!==overrides)return rebuildGroundRuleSet();
  return groundRuleCache.rules;
}
// 開始・やり直しは引数なし。天候等の変化時は、その時点の変更一式を渡す。
// オブジェクトは深く重ね、配列とnullは置換する。入力の規則・上書きは変更しない。
function rebuildGroundRuleSet(changes={}){
  const operation=typeof op!=='undefined'?op:null;
  const id=(typeof groundTerrainId!=='undefined'&&groundTerrainId)||operation?.ground||'exercise2';
  const terrain=window.WOS_TERRAIN?.[id],overrides=operation?.groundRuleOverrides;
  function merge(target,source){
    for(const [key,value] of Object.entries(source||{})){
      if(value&&typeof value==='object'&&!Array.isArray(value)){
        if(!target[key]||typeof target[key]!=='object'||Array.isArray(target[key]))target[key]={};
        merge(target[key],value);
      }else target[key]=Array.isArray(value)?JSON.parse(JSON.stringify(value)):value;
    }
    return target;
  }
  const rules=merge(merge(merge(merge({},window.WOS_GROUND_RULES),terrain?.overrides),overrides),changes);
  groundRuleCache={id,terrain,overrides,rules};
  if(typeof groundSightReset==='function')groundSightReset();
  if(typeof groundBallisticReset==='function')groundBallisticReset();
  return rules;
}
