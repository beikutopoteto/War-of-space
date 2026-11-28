/* 地上・海上専用の基本規則。地形とは独立し、宇宙の性能表には適用しない。 */
window.WOS_GROUND_RULES = {
  clock: { minutesPerSecond:1 }, // 地上戦はゲームの1秒で作戦の時計が1分進む（#509）
  bands: { heights: { ground:0, low:12.288, high:40 }, transitionSec:5, weakFire:.5, fireEvery:1, initial:{fireEvery:1.5}, dimOpacity:.15, gridStep:8 }, // 戦闘単位。高高度10 kmはユーザー決定 2026-11-28。
  // 距離は km、時間はゲーム秒。重力は 9.8 m/s² を 1ゲーム秒＝60秒で換算。
  airCombat: {
    cruiseKmSec:{fighter:10.5,attack:7.5,supportAircraft:1.25}, minSpeedFactor:.6, maxSpeedFactor:1.22, speedVariation:.045,
    turnGravityKmSec2:9.8*60**2/1000, turnLoadG:{fighter:[5,7],attack:[3,4],supportAircraft:[1.5,2]}, maxPitchDeg:28, pitchRateDeg:85,
    sectorKm:12, // 仮。航空巡回（#521）と同じ左下 A1 の格子。
    pitchSpeedFactor:.65, speedResponse:3, stepSec:.05, boundaryMarginKm:1,
    pairDelaySec:.55, wingDelaySec:.14, pairAngleDeg:23, wingAngleDeg:2.5, reentryAngleDeg:110,
    ground:{entryKm:11,pullKm:8,diveKm:4,exitKm:4.5,lowKm:.24,diveDeg:18},
    // 仮。低い相手への掃射と、狙われた W.A.S. の組が反応する範囲。
    strafe:{lowKm:.32,climbKm:2.2,threatHeightKm:3.5,threatWidthKm:.9,threatLeadSec:.55,wingDelaySec:.1},
    // 仮。支援機は従来の巡航速度（1.25 km/ゲーム秒）で、上限1.5〜2 Gの内側に広い旋回を取る。
    support:{entryKm:2,exitKm:2,turnRadiusKm:.75},
    air:{minHeightKm:1.5,maxHeightKm:6,heightAdvantageKm:1.3,diveSec:.48,exitKm:6,tailSec:.75,tailAngleDeg:24,peelDeg:45,leadSec:1.2,
      attack:{maxHeightKm:3},
      fighter:{maxPitchDeg:42,pitchRateDeg:145,diveSec:.62,exitKm:3.5,climbLookAheadSec:.2,divePitchBiasDeg:12,passDiveSec:.22}} // 戦闘機の一撃離脱は仮。
  },
  // 飛ぶ速さ（ユーザー 2026-11-25）: 巡航は山や木をよけるので低空より遅く約180 km/h、低空は設定の300〜400 km/h に戦闘中の0.7倍で245 km/h。
  // 時速 = 速さの値 × 15 km（ゲームの1秒 = 1分の目安、docs/ground-tempo.md）。値は仮。
  wasFlight: { heightKm:.03, transitionSec:2, speed:{ cruise:12, low:16.3 },
    moveSupplyFactor:{ground:.5,cruise:.7,low:1}, idleSupplyPerSec:{cruise:1.05,low:2.05}, // ユーザー決定 2026-11-27。停止は補給の表示点/ゲーム秒。
    evasion:.6, // ユーザー決定 2026-11-28（仮）。
    npcMinKm:6 }, // 仮。
  wasCombat: { // #525 の仮値。距離は km。
    reactiveArmor:{penetrationRatio:2,refillCost:2},
    topAttackKm:1,
    shotSupplyFactor:1.3, // ユーザー決定 2026-11-28。射撃・対艦ロケットなど撃つときの補給消費倍率（wasFlight の移動・停止消費は変えない）。
    autoCruise:{supplyFraction:.3,quietSec:10},
    // 巡航で移動するとき、採用図の矢印（歩くときの間隔）を縮める倍率（ユーザー決定 2026-11-28「移動は3倍」、採用）。.36 で4小隊16機の最大間隔は約0.87 km。
    cruiseSpacing:.36,
    // 各機の描画の仮値。時間はゲーム秒、角度はラジアン。drift・scatter は模型の長さ、height は模型の高さに対する倍率。
    cruiseMotion:{follow:12,velocityResponse:30,leadSec:.115,swarmAimSec:.45},
    cruiseDrift:{periodSec:[4.5,12.5],drift:[.4,.78],height:[.3,.58],spacingGain:.12,scatter:.16,idleFactor:.55,yawSway:.09,
      sepWidth:.95,sepHeight:.85,sepRate:26,minClearanceKm:.02},
    // 巡航陣形の崩し方と戻り方（仮）。maxRadiusKm は cruiseSpacing が既定値のときの半径。
    cruiseTurn:{staggerSec:.32,courseResponse:[3,6],yawResponse:9,maxYawSpeed:4.5,speed:[2.2,4.2],
      settleResponse:1.4,arc:[.25,.85],bankPerTurn:.08,maxRadiusKm:.588,
      enterSec:[.65,1.15],rejoinSec:[2,3.1]},
    // 巡航中の反転（おおむね120°以上の向き変更）の部隊内クロス（仮）。長さ比は模型の長さ、高さ比は模型の高さ。
    cruiseReverse:{minAngleDeg:120,turnWindowSec:.45,
      frontDelaySec:[0,.2],frontDurationSec:[1.15,1.55],
      middleDelaySec:[.1,.35],middleDurationSec:[1.65,2.2],
      rearDelaySec:[.05,.25],rearDurationSec:[2.2,2.8],
      rearMinCoverSec:1.0,rearCoverSec:[2.4,3.1],rearMaxCoverSec:4.5,
      frontLaneL:.42,frontHeightH:.38,middleArcL:[.45,.95],rearSpreadL:.48,rearHeightH:.24,
      frontPitch:.12,rearPitch:-.06,bankPerTurn:.1},
    // ユーザー決定 2026-11-28（採用）。全機が飛び回り、外周の直径は約2 km。
    swarmPattern:'all',
    // 見本の0.7 kmから全距離を2.0/0.7倍。middleKm・rearKmはrolesで自軍側へ下がる距離。
    swarmLayout:{frontRadiusKm:.2*2/.7,middleKm:.3*2/.7,rearKm:.45*2/.7,allMiddleRadiusKm:.27*2/.7,allRearRadiusKm:1,maxSpanKm:2},
    // 巡航 W.A.S. 同士の巴戦（仮）。距離は km、時間はゲーム秒、角度はラジアン。
    dogfight:{
      damageScale:1,noEvasion:true, // ユーザー決定 2026-11-28: 飛行中の W.A.S. 同士は回避なし（損害4倍はやめた）。
      cannonEvasionFactor:2,cannonMaxEvasion:.9,
      radiusKm:[.63,.78,.91],heightKm:[.054,.05,.064],periodSec:[5.8,7,9.2],
      periodVariationSec:.85,headingSpread:1.16,crossWidth:.53,phaseLag:.44,
      minHeightKm:.03,lowMaxHeightKm:.08,maxHeightKm:.2,heightWaveKm:.013,
      pairGapKm:.076,splitKm:.14,tailKm:.14,coverKm:.14,pursuit:.32,pitchLimit:.85,
      jump:{start:.15,riseSec:.7,riseKm:[.08,.12],diveSec:1.05,pitchDeg:16},
      slide:{start:.72,durationSec:.82,rejoinSec:.72,distanceKm:[.12,.19],plumeLength:2.6},
      pass:{start:.28,enter:.41,exit:.54,end:.68,alongKm:.27,gapKm:[.055,.09],fireKm:.135,flashEverySec:.19},
      stray:{chance:.28,reachKm:[.065,.12],size:.075},
      wreck:{durationSec:[2,3],driftKm:.18,smokePuffs:9,smokeSec:1.15,impactSize:.27}
    },
    // 停止巡航で交戦中のロール・ピッチと揺れの速さ（仮）。角度はラジアン、速さはラジアン/ゲーム秒。
    swarmAttitude:{
      frontOrbitSpeed:1.5,frontRoll:.42,frontRollSway:.14,frontAimPitch:.55,frontClimbPitch:.22,
      middleOrbitSpeed:.95,middleSwaySpeed:2.8,middleRoll:.34,middlePitch:.24,
      rearOrbitSpeed:.58,rearSwaySpeed:2.5,rearRoll:.3,rearPitch:.2,maxYawSpeed:9,
      maneuverResponse:16 // ブースト・通過中の描画の追従率（1/ゲーム秒）。
    },
    // 技と僚機の離れ方は仮。距離・高さは km、時間はゲーム秒、Deg は度。
    swarmManeuvers:{
      slotSec:4.4,slotVariationSec:.6,pairPhase:.54,minHeightKm:.02,maxHeightKm:.17,
      // 僚機の半独立（仮）: 間隔は50 m〜数百 m でゆっくり伸縮し、相対位置も時間で回る。技の開始・向きも長機とずらす。
      pair:{gapKm:.09,minGapKm:.068,maxGapKm:.21,sideKm:.074,backKm:.09,riseKm:.068,passRiseKm:.032,
        orbitRate:[.38,.66],breatheRate:[.26,.48],heightRate:[.52,.92],heightWaveKm:.032,
        speedWaveKm:.065,speedWaveRate:[.45,.8],leadWanderKm:.042,leadWanderRate:[.32,.56],
        phaseLag:.28,phaseLagVar:.16,phaseDrift:.10,phaseDriftRate:.24,
        passAngleDeg:36,passLaneKm:.11,avoidHeightKm:.032,unitClearKm:.055},
      jump:{startSec:.9,prepSec:.55,riseSec:.8,floatSec:.3,fallSec:.86,thrustFadeSec:.12,
        launchKm:.045,riseKm:.08,variationKm:.01,pitchDeg:16},
      front:{heightKm:.09,swayKm:.06,innerScale:.48,infantryClearanceKm:.125,
        diveHighKm:.15,diveLowKm:.03,diveRadiusScale:.48,divePitchDeg:67,outerScale:1.16,
        // 飛び越え・突っ切り・射撃通過。enter/start/end/exit は技の中での進み具合（0〜1）。
        passes:{
          2:{enter:.10,start:.30,end:.70,exit:.90,radiusKm:.15,heightKm:.145},
          4:{enter:.14,start:.405,end:.595,exit:.86,radiusKm:.14,heightKm:.14,leadLaneKm:.06},
          5:{enter:.14,start:.375,end:.625,exit:.86,radiusKm:.14,heightKm:.14}
        },
        firePass:{pitchDeg:[40,70],flashEverySec:.19}},
      middle:{sideKm:.15,swayKm:.023,depthSwayKm:.015,coverKm:.088,slideKm:.058,
        heightKm:.055,heightSwayKm:.024,climbKm:.064,innerKm:.22,arcRad:.24,
        passInnerKm:.26,passHeightKm:.13,outerScale:1.12},
      rear:{sideKm:.09,swayKm:.038,depthSwayKm:.017,heightKm:.046,heightSwayKm:.026,
        sniperRiseKm:.072,innerKm:.21,arcRad:.22,dipHeightKm:.032,orbitInsetKm:.06,outerScale:1.12}
    }
  },
  // 索敵の距離・高さは戦闘単位。レーダーも同じ視界に含める。全て試作の仮値。
  sight: { site:30, basic:30, scout:40, concealment:{scout:.5,drone:.5}, supportAircraft:100, forest:.6, eyeHeight:.35, heightGain:.3, heightForMax:1.2, rayStep:.5, fogStep:2, fogEvery:.5, fogAlpha:110 },
  // 地点攻撃の試作値。距離は戦闘単位。散布は着弾中心の最大ずれ、威力は unitTypes の dmg。
  // 2026-11-17決定の最大値で遊ぶ。initialは将来の研究用データだけで、現在は参照しない。
  // dmgScale は地点攻撃の弾だけに掛ける威力の倍率（対地の直射は unitTypes の weapons を参照）。間接の砲撃は2倍（ユーザー決定 2026-11-17）。
  // minScatterDiameter10KmM は10kmでの最小直径（m）、scatterRatioは距離に対する直径の比。
  strike: {
    vehicle:{delay:2,radius:.4,dmgScale:3,areaRadius:2,spread:.08,reload:4,initial:{radius:.2,reload:6}}, // 地点攻撃だけ3倍（ユーザー決定 2026-11-17。爆風が小さくなり強化歩兵への効きが前の約0.28倍だった）
    // 88 mm 砲の間接発射間隔は 76 mm の1.5倍（仮、ユーザー決定 2026-11-28）。
    was:{delay:5,radius:.4,dmgScale:2,areaRadius:7,reload:12,minScatterDiameter10KmM:25,initial:{radius:.2,reload:18}},
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
    // 35 mm 連装機関砲1つで空も地上も撃つ（カメラによる自動計算照準。ユーザー決定 2026-11-28、耐久・直射士気軽減・威力・貫通・士気・発射間隔・回避軽減は仮）。
    mobileAA:{name:'自走対空砲',speed:2.5,range:25,hp:180,dmg:4,armor:{front:300,side:50,top:150},blastMorale:.7,directMorale:.08,weapons:[{power:8,pen:220,morale:.4,fireFactor:.2,burst:1.5,air:true,evasionFactor:.15,barrels:2}] /* 35 mm 連装: 1門3×2門、1回の射撃を長く（power 8、間隔0.2。上面装甲150＝対空なので上を厚く。ユーザー 2026-11-28）。耐久は1両60（小隊180）（ユーザー決定 2026-11-28） */,fireRangesKm:{direct:2,aa:6}},
    vehicle:{name:'主力戦車',speed:3,range:20,hp:250,dmg:5,armor:{front:1800,side:500,top:150,shapedFront:2200},blastMorale:.4,weapons:[{power:5,pen:100,soft:1.6,morale:1.2},{power:6,pen:1800,soft:.2,morale:1.2}],fireRangesKm:{direct:3,aa:1}},
    scout:{name:'斥候',speed:3.5,range:7,hp:80,dmg:1,armor:{front:200,side:60,top:40},blastMorale:.7,weapons:[{power:1,pen:20,morale:1}],fireRangesKm:{direct:0.6}},
    apc:{name:'装甲兵員輸送車',speed:3,range:8,hp:225,dmg:1,armor:{front:200,side:60,top:40},blastMorale:.7,weapons:[{power:3,pen:200,morale:1.2}],fireRangesKm:{direct:1.5,aa:1}},
    engineer:{name:'工兵',speed:2,range:7,hp:100,dmg:1,armor:{front:200,side:60,top:40},blastMorale:.7,weapons:[{power:1,pen:20,morale:1}],fireRangesKm:{direct:0.6}},
    supply:{name:'補給部隊',speed:3,range:0,hp:100,dmg:0,armor:5,blastMorale:1,fireRangesKm:{direct:0}},
    artillery:{name:'自走砲',speed:2.5,range:45,hp:100,dmg:12,armor:{front:300,side:50,top:40},blastMorale:.7,weapons:[{power:6,pen:150,morale:2}],fireRangesKm:{direct:2,indirect:{min:2,max:30}}},
    fighter:{name:'戦闘機',speed:8,range:20,hp:40,dmg:2,maxPlatoons:1,fireRangesKm:{ground:0,air:2}},
    attack:{name:'攻撃機',speed:6,range:15,hp:40,dmg:2,maxPlatoons:1,weapons:[{power:2,pen:60,soft:2,morale:1.5},{power:6,pen:1500,soft:.2,morale:1.5,top:true}],fireRangesKm:{ground:10,air:15}},
    supportAircraft:{name:'広域戦略支援航空機',speed:5,range:20,hp:20,dmg:16,fireRangesKm:{ground:0,air:0}}, // 固定射程なし。段階7の実高度・速度から投下進入を計画（索敵はsightで独立）
    // directFirst: 直接射撃を主とする。間接射撃は地点攻撃の命令のときだけ撃ち（自動交戦・攻撃の命令・敵の自動の地点攻撃では撃たない）、
    // 攻撃の命令と NPC の助攻では直接射撃の距離まで近づく（ユーザー決定 2026-11-19）
    // 装甲と耐久はユーザー決定 2026-11-27。
    was:{name:'陸戦型 W.A.S.',speed:4.7,range:12,hp:170,dmg:2,directFirst:true,armor:{front:400,side:200,top:150},blastMorale:.7,weapons:[
      // 30 mm バルカン（ユーザー決定 2026-11-28）: 威力3・軟目標倍率なし、88 mm・対艦ロケットと同時に独自間隔で撃つ。
      {power:3,pen:280,morale:1.5,air:true,parallel:true,fx:'gatling'},
      // 88 mm 砲（ユーザー決定 2026-11-28）: 威力8。貫通900・直射間隔1.5倍（fireFactor）は仮。
      {power:8,pen:900,morale:2,fireFactor:1.5,wasCannon:true},
      // 対艦ロケットはユーザー決定 2026-11-27。威力60は仮（ユーザー決定 2026-11-28 で 55 から戻した）。
      {power:60,pen:2500,soft:.1,morale:1.5,shaped:true,rounds:3,roundInterval:1,reloadSec:5,fx:'rocket'}
    ],evasion:.3,fireRangesKm:{direct:3,indirect:{min:1,max:12},aa:6,airborne:{ground:5,air:15}}}
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
    aaMaxHeightKm:{mobileAA:4,default:1.5}, // 自動対空が届く対地高度（仮、ユーザー決定 2026-11-28）。
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
