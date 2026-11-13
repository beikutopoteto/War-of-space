/* 地上・海上専用の基本規則。地形とは独立し、宇宙の性能表には適用しない。 */
window.WOS_GROUND_RULES = {
  bands: { heights: { ground:0, low:12.288, high:19.2 }, transitionSec:5, weakFire:.5, fireEvery:1, dimOpacity:.15, gridStep:8 }, // 段の見た目の高さは見本と同じ比率（戦闘単位）。全て仮。
  // 索敵の距離・高さは戦闘単位。レーダーも同じ視界に含める。全て試作の仮値。
  sight: { basic:30, scout:60, supportAircraft:100, forest:.6, eyeHeight:.35, heightGain:.3, heightForMax:1.2, rayStep:.5, fogStep:2, fogEvery:.5, fogAlpha:110 },
  // 地点攻撃の試作値。距離は戦闘単位。散布は着弾中心の最大ずれ、威力は unitTypes の dmg。
  // minScatterDiameter10KmM は10kmでの最小直径（m）。ロケットのdelay/radius/spreadは自走砲と同じ暫定値。6発/車・群間0.25秒・最終群後の装填30秒も仮。
  strike: { vehicle:{delay:2,radius:2,spread:1,reload:4}, artillery:{delay:5,radius:7,spread:2,reload:8,minScatterDiameter10KmM:25}, guidedRocket:{delay:5,radius:7,spread:2,reload:30,rocketsPerVolley:6,burstInterval:.25,minScatterDiameter10KmM:30}, supportAircraft:{delay:7,radius:9,spread:2,reload:10}, sea:{delay:8,radius:10,spread:2,reload:10}, unseenSpread:2, edgeDamage:.2, aiCluster:2, effectSec:.8 },
  // 輸送・架橋の試作値。距離は戦闘単位、橋の幅判定は water の km。
  transport: { boardRange:1.6, unloadKm:.4, wreckLoss:.5, repathSec:.5 },
  landing: { capacity:2, seconds:10, damageFactor:1.3 }, // 海の揚陸艦だけの仮値。沈没時は搭載中隊を全滅扱い。
  engineering: { seconds:20, hp:40, workRange:2.4, bankMarginKm:.12, laneHalfKm:.4 },
  // 地上試作専用。硬さ1点=耐久20の仮換算。宇宙艦の表・倍率は使わない。
  supply: {max:100,refill:2,refillWait:2,move:2,shot:.5,strike:4,build:.2,giveKm:1,give:2,moraleGiveMax:.8,moraleGiveCost:.5, // 士気分配の上限・消費比は仮（2026-11-12）
    terrainMove:{'平地':1,'沼地':3,'山岳':3,'砂漠':2},terrainIdle:['沼地','山岳','砂漠'],idleMorale:.05,
    moraleRefill:2,restWait:5,hitSlow:.65,hitSeconds:2,routArrivalKm:1,routRepath:2,rally:30,
    aiSupply:25,aiMorale:30,aiResume:60,airIdle:.05,airShot:2,airStrike:8,airReturn:15,airBase:20}, // 全て地上試作の仮値
  // fireRangesKm は武器到達距離（km）の仮値。索敵距離とは独立。
  // direct / indirect:{min,max} は地上・海上、ground / air は航空の対地・対空。
  // aa は航空機以外の自動対空用、airborne は空中 W.A.S. の対地・対空。未指定・0は能力なし。
  // 旧 range（戦闘単位）は旧データとの互換用に維持し、新しい射撃判定は fireRangesKm を使う。
  unitTypes: {
    infantry:{name:'強化歩兵',speed:2,range:10,hp:40,dmg:2,fireRangesKm:{direct:0.8,aa:0.5}},
    heavyInfantry:{name:'重強化歩兵',speed:1.5,range:16,hp:80,dmg:4,fireRangesKm:{direct:4,aa:6}},
    commando:{name:'強化コマンド歩兵',speed:2.5,range:10,hp:40,dmg:2,fireRangesKm:{direct:0.8,aa:0.5}},
    guidedRocket:{name:'精密誘導ロケット兵',speed:1.5,range:30,hp:40,dmg:4,permissionOnly:true,fireRangesKm:{indirect:{min:0,max:50}}},
    droneHive:{name:'ドローンハイブ',speed:4,range:12,hp:20,dmg:2,permissionOnly:true,fireRangesKm:{direct:10}}, // 送り出す機体の運用範囲（仮）
    mechanicalAssault:{name:'機械化突撃兵',speed:3,range:10,hp:40,dmg:3,permissionOnly:true,fireRangesKm:{direct:1.2,aa:0.8}},
    mobileAA:{name:'自走対空砲',speed:2.5,range:25,hp:60,dmg:4,fireRangesKm:{direct:2,aa:4}},
    vehicle:{name:'主力戦車',speed:3,range:20,hp:100,dmg:5,fireRangesKm:{direct:3,aa:1}},
    scout:{name:'斥候',speed:4,range:7,hp:20,dmg:1,fireRangesKm:{direct:0.6}},
    apc:{name:'装甲兵員輸送車',speed:4,range:8,hp:60,dmg:1,fireRangesKm:{direct:1.5,aa:1}},
    engineer:{name:'工兵',speed:2,range:7,hp:40,dmg:1,fireRangesKm:{direct:0.6}},
    supply:{name:'補給部隊',speed:2.5,range:0,hp:40,dmg:0,fireRangesKm:{direct:0}},
    artillery:{name:'自走砲',speed:2.5,range:45,hp:40,dmg:12,fireRangesKm:{direct:2,indirect:{min:2,max:30}}},
    fighter:{name:'戦闘機',speed:8,range:20,hp:40,dmg:2,fireRangesKm:{ground:0,air:2}},
    attack:{name:'攻撃機',speed:6,range:15,hp:40,dmg:2,fireRangesKm:{ground:10,air:15}},
    supportAircraft:{name:'広域戦略支援航空機',speed:5,range:20,hp:20,dmg:16,fireRangesKm:{ground:0,air:0}}, // 固定射程なし。段階7の実高度・速度から投下進入を計画（索敵はsightで独立）
    was:{name:'陸戦型 W.A.S.',speed:3,range:12,hp:80,dmg:2,fireRangesKm:{direct:3,indirect:{min:1,max:12},aa:6,airborne:{ground:5,air:15}}}
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
  combat: { damageScale:1.3, tankInfantry:2, heavyTank:3, rocketTank:3, rocketAir:2, mobileAAAir:2, infantryCover:.8, commandoCoverBonus:1.5, urbanMargin:.8, mechanicalWearPerSec:.001 }, // 消耗は最大耐久の毎秒0.1%。森と建物周辺の被弾軽減は重ねない。
  capture: { seconds:30, roadSeconds:5, neutralSeconds:.5, roadSegmentKm:3, radiusKm:2, roadWidthKm:1.25 },
  movement: { timeScale:1.2, roadFactor:1.75, marsh: { vehicle: 0.3, infantry: 0.6, was: 0.6, scout: 0.3, apc: 0.3, engineer: 0.6 }, river: { vehicle: 0, infantry: 0.2, was: 0.5, scout: 0.5, apc: 0.5, engineer: 0.5, air: 1 } }, // 仮の通行速度倍率
};

/* 既定の6中隊。従来の地上演習と同じ名前・兵科・順番・仮配置。 */
window.WOS_GROUND_DEFAULT_COMPANIES = [
  {name:'第1 戦車中隊',groundKind:'vehicle',band:'ground',pos:[-64,-36]},
  {name:'第2 強化歩兵中隊',groundKind:'infantry',band:'ground',pos:[-56,-40]},
  {name:'第3 重強化歩兵中隊',groundKind:'heavyInfantry',band:'ground',pos:[-48,-36]},
  {name:'第4 戦闘航空隊',groundKind:'fighter',band:'high',pos:[-20,-32]},
  {name:'第5 攻撃航空隊',groundKind:'attack',band:'low',pos:[-36,0]},
  {name:'第6 陸戦型 W.A.S. 試験隊',groundKind:'was',band:'ground',pos:[-28,-28]}
].map(f=>({type:'cv',n:1,scale:.3,alt:0,vis:9,stl:0,...f}));

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
