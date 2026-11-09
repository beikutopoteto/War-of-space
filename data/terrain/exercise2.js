window.WOS_TERRAIN = window.WOS_TERRAIN || {};
window.WOS_TERRAIN.exercise2 = {
  meta: { id:'exercise2', location:'カザフスタン・アティラウ南方のウラル川デルタを基にした架空演習場', latitude:46.85, longitude:51.85, terrainTypes:['河川デルタ','氾濫原'], widthKm:48, heightKm:36, cellKm:0.4, elevationExaggeration:18, seed:27011, seaLevelM:-28, note:'実在の沼地を参考にした架空配置。演習用の港と浚渫水路は創作。' },
  bands: { heights: { ground:0, low:12.288, high:19.2 }, transitionSec:5, weakFire:.5, fireEvery:1, dimOpacity:.15, gridStep:8 }, // 段の見た目の高さは見本と同じ比率（戦闘単位）。全て仮。
  // 索敵の距離・高さは戦闘単位。レーダーも同じ視界に含める。全て試作の仮値。
  sight: { basic:30, scout:60, supportAircraft:100, forest:.6, eyeHeight:.35, heightGain:.3, heightForMax:1.2, rayStep:.5, fogStep:2, fogEvery:.5, fogAlpha:110 },
  // 地点攻撃の試作値。距離は戦闘単位。散布は着弾中心の最大ずれ、威力は unitTypes の dmg。
  strike: { vehicle:{delay:2,radius:2,spread:1,reload:4}, artillery:{delay:5,radius:7,spread:2,reload:8}, supportAircraft:{delay:7,radius:9,spread:2,reload:10}, sea:{delay:8,radius:10,spread:2,reload:10}, unseenSpread:2, edgeDamage:.2, aiCluster:2, effectSec:.8 },
  // 輸送・架橋の試作値。距離は戦闘単位、橋の幅判定は water の km。
  transport: { boardRange:1.6, unloadKm:.4, wreckLoss:.5, repathSec:.5 },
  landing: { capacity:2, seconds:10, damageFactor:1.3 }, // 海の揚陸艦だけの仮値。沈没時は搭載中隊を全滅扱い。
  engineering: { seconds:20, hp:40, workRange:2.4, bankMarginKm:.12, laneHalfKm:.4 },
  // 地上試作専用。硬さ1点=耐久20の仮換算。宇宙艦の表・倍率は使わない。
  supply: {max:100,refill:2,refillWait:2,move:2,shot:.5,strike:4,build:.2,giveKm:1,give:2,
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
    supportAircraft:{name:'広域戦略支援航空機',speed:5,range:20,hp:20,dmg:16,fireRangesKm:{ground:5,air:0}}, // 段階7の弾道・投下可能範囲まで旧5kmを仮置き
    was:{name:'陸戦型 W.A.S.',speed:3,range:12,hp:80,dmg:2,fireRangesKm:{direct:3,indirect:{min:1,max:12},aa:6,airborne:{ground:5,air:15}}}
  },
  // 地上・海上専用の仮射程（km）。既存の艦種IDを使い、宇宙側の艦種・性能は変更しない。
  navalFireRangesKm: {
    cv:{direct:8,indirect:{min:0,max:8},aa:3}, // 高速艇（モデル統合は段階6）
    ff:{direct:8,indirect:{min:0,max:8},aa:3},
    dd:{direct:24,indirect:{min:0,max:24},aa:150}, // イージス艦。150kmは発見・追尾を保証しない。
    cl:{direct:24,indirect:{min:0,max:24},aa:150},
    bb:{direct:40,indirect:{min:0,max:40},aa:6},
    // 母艦・揚陸艦は未再設計。旧到達距離 (10 + ships.rng * 1.6) / 4 km を直接・間接・対空に仮置き。
    cvb:{direct:4.1,indirect:{min:0,max:4.1},aa:4.1},
    mas:{direct:3.3,indirect:{min:0,max:3.3},aa:3.3},
    masc:{direct:3.7,indirect:{min:0,max:3.7},aa:3.7}
  },
  combat: { tankInfantry:2, heavyTank:3, rocketTank:3, rocketAir:2, mobileAAAir:2, infantryCover:.8, commandoCoverBonus:1.5, urbanMargin:.8, mechanicalWearPerSec:.001 }, // 消耗は最大耐久の毎秒0.1%。森と建物周辺の被弾軽減は重ねない。
  capture: { seconds:30, roadSeconds:5, radiusKm:2, roadWidthKm:1.25 },
  movement: { marsh: { vehicle: 0.3, infantry: 0.6, was: 0.6, scout: 0.3, apc: 0.3, engineer: 0.6 }, river: { vehicle: 0, infantry: 0.2, was: 0.5, scout: 0.5, apc: 0.5, engineer: 0.5, air: 1 } }, // 仮の通行速度倍率
  height: { baseM:0.5, interpolationRadiusKm:8, noiseM:0.06,
    levee:{river:'main',bankOffsetKm:.48,widthKm:.38,heightM:2.4,channelHalfWidthKm:.17,channelCutM:.7},
    terrace:{edgeYKm:30.5,widthKm:.65,heightM:2.8},
    depressions:[{x:14,y:15,widthXKm:5,widthYKm:3,depthM:1.1},{x:31,y:13,widthXKm:5,widthYKm:2.8,depthM:1.0}],
    sandbars:[{x:15,y:7.7,widthXKm:1.7,widthYKm:.8,heightM:1.0},{x:21,y:7.8,widthXKm:1.5,widthYKm:.8,heightM:1.1},{x:31,y:7.8,widthXKm:1.7,widthYKm:.8,heightM:1.0}],
    observationHill:{x:41,y:27,widthXKm:2.5,widthYKm:1.8,heightM:3.0}, points:[{x:2,y:34,m:3.0},{x:13,y:32,m:2.2},{x:27,y:34,m:3.3},{x:43,y:32,m:2.8},{x:6,y:23,m:1.4},{x:23,y:23,m:1.8},{x:39,y:22,m:1.6},{x:8,y:15,m:0.7},{x:24,y:14,m:0.9},{x:41,y:14,m:1.1},{x:7,y:8,m:0.3},{x:28,y:9,m:0.35},{x:43,y:8,m:0.4}] },
  water: {
    engineerBridgeMaxWidthKm:.3, // 仮の架橋可能な川幅の上限
    coast:[[0,8],[2,8.5],[4,8.15],[6,8.8],[8,8.3],[10,8.1],[12,7.5],[14,7.7],[15,7.2],[17,7.8],[19,7.1],[20,7.7],[22,7.1],[24,7.45],[25,6.8],[27,7.4],[29,6.9],[30,7.3],[32,6.7],[34,7.4],[35,6.7],[37,7.4],[39,7.2],[40,7.8],[42,7.5],[44,8.2],[46,7.5],[48,7.3]],
    rivers:[{id:'main',points:[[24,36],[23.7,34.5],[23,33],[22.8,32],[23,31],[23.55,29],[24,27],[23.2,25.5],[22,23],[22.5,21],[23,19],[22.5,17.3],[22,16],[21.3,14.8],[21,12],[20.4,10.8],[21.25,9.2],[21,7]],widths:[.35,.36,.37,.38,.4,.42,.45,.46,.5,.52,.55,.6,.65,.69,.75,.8,.85,.9]},{id:'west',points:[[22,16],[21,15.7],[20.5,14.8],[19,14.3],[19,13],[18.4,11.8],[17,11.2],[17,10],[16,9.2],[15.6,8],[15,7.2]],widths:[.3,.32,.34,.36,.4,.42,.45,.48,.5,.55,.6]},{id:'east',points:[[21,12],[22.2,11.7],[23,10.9],[24.2,11],[25,10],[26.5,9.5],[28,9.8],[29,8.8],[30.5,8.3],[31,7.2]],widths:[.25,.26,.28,.3,.32,.34,.38,.42,.48,.55]}],
    deepChannel:{name:'演習用浚渫水路（架空）',points:[[41,0],[41,4],[40,7.7],[40,9]],widthKm:.65},
    ponds:[[[8,10],[10,10.3],[11,11.7],[9,12.1],[7.5,11]],[[29,10],[31,9.4],[32,10.4],[31,11.5],[29,11.3]]] },
  surface: [
    {id:'reed-west',type:'reed',as:'沼地',polygon:[[2,9],[15,7],[18,10],[19,14],[16,18],[8,17],[2,14]]},
    {id:'reed-east',type:'reed',as:'沼地',polygon:[[23,8],[35,7],[38,10],[36,15],[29,16],[24,13]]},
    {id:'fields-west',type:'field',as:'平地',polygon:[[11,19],[20,19],[20,28],[12,28]]},
    {id:'fields-east',type:'field',as:'平地',polygon:[[26,20],[36,20],[36,29],[26,29]]},
    {id:'salt-east',type:'salt',as:'砂漠',polygon:[[37.8,11.2],[38.5,9.9],[40,9.7],[41,10.3],[42.5,9.8],[44,10.4],[45.8,10.2],[46.5,11.6],[46.1,13],[47,14.3],[46.4,15.9],[44.8,16.6],[43.6,16.2],[42,17.1],[40.7,16.5],[39,17.2],[38.5,15.5],[37.4,14.4],[38.1,13]]}
  ],
  objects: { fords:[{id:'F1',river:'main',x:23,y:33,widthKm:.2},{id:'F2',river:'main',x:22.5,y:17.3,widthKm:.2},{id:'F3',river:'west',x:20.5,y:14.8,widthKm:.2},{id:'F4',river:'east',x:23,y:10.9,widthKm:.2}], // widthKm は川に沿う渡河可能な幅
    forest:{type:'森林',species:['ヤナギ','ポプラ'],count:2200,seed:1709,rule:'本流と主な分流の両岸の細い帯。上流は密で下流は葦原へ移行。北の乾いた段丘上と道路を避け、林は途切れ途切れ',roadClearanceKm:.18,terraceMaxYKm:30.4,bands:[{river:'main',yMin:8.4,yMax:30.4,bankMinKm:.26,bankMaxNorthKm:.88,bankMaxSouthKm:.36,fadeStartYKm:15,gapPeriodKm:2.6,gapFraction:.24},{river:'west',yMin:8,yMax:16,bankMinKm:.23,bankMaxNorthKm:.50,bankMaxSouthKm:.27,fadeStartYKm:13,gapPeriodKm:1.8,gapFraction:.36},{river:'east',yMin:8,yMax:12,bankMinKm:.22,bankMaxNorthKm:.43,bankMaxSouthKm:.26,fadeStartYKm:11,gapPeriodKm:1.7,gapFraction:.4}]}, shrubs:{type:'低木',species:['タマリスク','ヨモギ類','塩生低木'],seed:8309,count:2600,clusterKm:2.4,terraceMaxYKm:35.5,roadClearanceKm:.12,zones:[{id:'west-steppe',kind:'steppe',polygon:[[2,18],[17,18],[19,28],[18,34],[4,34],[1,26]],density:0.22},{id:'east-steppe',kind:'steppe',polygon:[[27,18],[38,18],[46,20],[45,34],[28,34]],density:0.22},{id:'forest-edge',kind:'bank',riverIds:['main','west','east'],minKm:.9,maxKm:1.7,density:0.7},{id:'salt-edge',kind:'salt',polygon:[[36,9],[47,8],[48,18],[37,19]],density:0.15}],rule:'草原は疎らな小群、河畔林の外縁は帯、塩性平地の周りは疎ら。水域・道路を避ける'}, reeds:{coverIds:['reed-west','reed-east'],densityPerKm2:0.87,count:210,seed:622,rule:'デルタの低沼地にまとまる'}, settlements:[{site:'A',count:65,spacingKm:.13},{site:'B',count:38,spacingKm:.14},{site:'C',count:48,spacingKm:.13},{site:'D',count:24,spacingKm:.14},{site:'E',count:24,spacingKm:.14},{site:'F',count:30,spacingKm:.15},{site:'G',count:22,spacingKm:.15},{site:'H',count:28,spacingKm:.14}] },
  roadNetwork: { lines:[{id:'north',type:'main',points:[[7,29],[15,30],[22,29],[24,29],[33,29],[41,27]]},{id:'west',type:'main',points:[[7,29],[10,25],[12,21],[11,17],[9,13]]},{id:'east',type:'main',points:[[24,29],[29,25],[34,22],[38,17],[40,12],[40,9]]},{id:'bridge',type:'local',points:[[12,21],[18,21],[22.5,21],[27,21],[34,22]]},{id:'port',type:'local',points:[[34,22],[40,18],[42,14],[40,9]]}], bridges:[{id:'N',x:23.5,y:29,river:'main'},{id:'C',x:22.5,y:21,river:'main'}] },
  sites: [
    {id:'A',name:'西方集落',x:7,y:29,radiusKm:5,owner:'blue',role:'西側の出発点'},
    {id:'B',name:'北橋',x:23.5,y:29,radiusKm:4,owner:'blue',role:'北の渡河点'},
    {id:'C',name:'中央渡河地',x:22.5,y:21,radiusKm:4,owner:'neutral',contested:true,role:'中央の橋'},
    {id:'D',name:'西の葦原',x:9,y:13,radiusKm:4,owner:'neutral',role:'歩兵の遮蔽'},
    {id:'E',name:'東方農地',x:34,y:22,radiusKm:5,owner:'orange',role:'開けた機動路'},
    {id:'F',name:'北東観測地',x:41,y:27,radiusKm:4,owner:'orange',role:'緩い微高地'},
    {id:'G',name:'塩性平地',x:42,y:14,radiusKm:4,owner:'neutral',role:'開けた海岸側'},
    {id:'H',name:'演習港',x:40,y:9,radiusKm:4,owner:'orange',role:'浚渫水路の港'}
  ],
  display: { board:[[1,4],[3,2.6],[6,3.5],[9,1.7],[12,2.8],[15,.8],[18,2.5],[21,1.3],[24,2.8],[27,.9],[30,2.4],[33,1.1],[36,3],[39,1.6],[42,2.8],[45,1.8],[47,4],[46.5,7],[48,10],[46.3,13],[47.5,16],[46,19],[47.7,22],[46.5,25],[47,28],[45.5,31],[43,33.8],[40,32.4],[37,34.6],[34,33.1],[31,35],[27,33.8],[24,36],[21,34.1],[17,35.2],[14,33.7],[10,35],[7,33.3],[4,33.8],[2,31],[2.6,28],[.8,25],[2.2,22],[.6,19],[1.8,16],[0,13],[1.7,10],[.4,7]], units:[{x:8,y:27,side:'blue',code:'EF / A-21',name:'機甲中隊',count:12,alt:0},{x:14,y:22,side:'blue',code:'EF / B-04',name:'歩兵中隊',count:8,alt:0},{x:11,y:18,side:'blue',code:'EF / L-12',name:'攻撃航空隊',count:6,alt:1},{x:19,y:26,side:'blue',code:'EF / H-02',name:'戦闘航空隊',count:10,alt:2},{x:28,y:23,side:'orange',code:'PR / C-13',name:'砲兵中隊',count:6,alt:0},{x:31,y:18,side:'orange',code:'PR / L-07',name:'降下航空隊',count:8,alt:1},{x:37,y:26,side:'orange',code:'PR / H-09',name:'戦闘航空隊',count:12,alt:2},{x:41,y:3,side:'blue',code:'EF / N-01',name:'海上艦',count:1,alt:0}], bombardment:{x:18,y:20,radiusKm:2}, descent:{x:33,y:18} }
};

// The coastline is the single source for sea and shallow-water boundaries.
(function (d) {
  const coast=d.water.coast;
  d.water.sea=[[0,0],[48,0],...coast.slice().reverse()];
  d.water.shallow=[...coast,...coast.slice().reverse().map(([x,y])=>[x,Math.max(0,y-2.5)])];
  // Fixed seed, subdivided edges: the same polygon drives display and placement.
  function roughen(poly,seed,amplitude){let state=seed;function random(){state=state*16807%2147483647;return (state-1)/2147483646}const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),steps=Math.max(1,Math.ceil(length/.55));for(let j=0;j<steps;j++){const t=j/steps,offset=j===0?0:(random()-.5)*2*amplitude;out.push([+(a[0]+dx*t-dy/length*offset).toFixed(4),+(a[1]+dy*t+dx/length*offset).toFixed(4)])}}return out}
  for(const surface of d.surface)if(surface.type==='reed'||surface.type==='salt')surface.polygon=roughen(surface.polygon,d.meta.seed+surface.id.length*91,.22);
  // Disjoint treatment priority: wet polygons override the default plain.
  d.surfaceDefault={type:'steppe',as:'平地'}; // The renderer selects a surface only when as matches the cell.
  // Coastal wetlands follow the shoreline; riparian strips follow the channel axes.
  function riverStrip(r,width){const pts=r.points,left=[],right=[];for(let i=0;i<pts.length;i++){let prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],length=Math.hypot(dx,dy),nx=-dy/length*width,ny=dx/length*width;left.push([pts[i][0]+nx,pts[i][1]+ny]);right.push([pts[i][0]-nx,pts[i][1]-ny])}return left.concat(right.reverse())}
  const coastBand=coast.map(([x,y])=>[x,y+2.1]).concat(coast.slice().reverse());
  const oldChannels=[[[5,22],[10,22.7],[14,21.7],[18,21]],[[28,17.2],[31,18.1],[35,17.5],[38,16.2]],[[8,12],[12,13.3],[16,13.2]],[[8,10],[9,11],[11,11.7]],[[29,10],[30,11],[32,10.4]]];
  const channelRegions=oldChannels.map((points,i)=>({id:'old-channel-'+i,region:riverStrip({points},.52),mix:{沼地:.85,平地:.15},patch:.8,seed:340+i*19}));
  d.terrain={regions:[
    {id:'salt',region:d.surface.find(s=>s.id==='salt-east').polygon,mix:{砂漠:.7,平地:.3},patch:1.8,seed:701},
    {id:'coastal-reeds',region:coastBand,mix:{沼地:.72,平地:.28},patch:1.0,seed:319},
    {id:'estuary',region:[[16,7],[30,7],[32,9],[29,10.5],[25,11.2],[20,12],[17,10]],mix:{沼地:.80,平地:.20},patch:1.1,seed:317},
    {id:'north',region:[[0,30.5],[48,30.5],[48,36],[0,36]],mix:{平地:1},patch:3.2,seed:221},
    ...channelRegions,
    {id:'levee',region:[[19,17],[25.5,17],[27,30.5],[20,30.5],[20.5,29],[19,23]],mix:{平地:1},patch:2.2,seed:487},
    {id:'floodplain',region:[[0,0],[48,0],[48,30.5],[0,30.5]],mix:{平地:1},patch:1.7,seed:113}
  ]};
  // A cell belongs to the first containing region; rank smooth noise within each
  // region so the requested mix is preserved for the actual land cells.
  function inside(x,y,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit}return hit}
  function hash(x,y,seed){let n=Math.sin(x*127.1+y*311.7+seed*41.3)*43758.5453123;return n-Math.floor(n)}
  function noise(x,y,r){let xx=x/r.patch,yy=y/r.patch,ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);let a=hash(ix,iy,r.seed)*(1-fx)+hash(ix+1,iy,r.seed)*fx,b=hash(ix,iy+1,r.seed)*(1-fx)+hash(ix+1,iy+1,r.seed)*fx,value=a*(1-fy)+b*fy;if(r.oldChannels){let best=Infinity;for(const path of r.oldChannels)for(let i=0;i<path.length-1;i++){let p=path[i],q=path[i+1],dx=q[0]-p[0],dy=q[1]-p[1],t=Math.max(0,Math.min(1,((x-p[0])*dx+(y-p[1])*dy)/(dx*dx+dy*dy)));best=Math.min(best,Math.hypot(x-p[0]-t*dx,y-p[1]-t*dy))}value+=2*Math.exp(-((best/r.channelWidthKm)**2))}return value}
  const size=d.meta.cellKm,cols=Math.round(d.meta.widthKm/size),rows=Math.round(d.meta.heightKm/size),groups=d.terrain.regions.map(()=>[]);d.terrain.cells=Array(cols*rows).fill(null);d.terrain.cols=cols;d.terrain.rows=rows;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){let x=(col+.5)*size,y=(row+.5)*size;if(!inside(x,y,d.display.board)||inside(x,y,d.water.sea))continue;let i=d.terrain.regions.findIndex(r=>inside(x,y,r.region));if(i<0)continue;groups[i].push({index:row*cols+col,value:noise(x,y,d.terrain.regions[i])})}
  groups.forEach((g,i)=>{g.sort((a,b)=>a.value-b.value||a.index-b.index);let entries=Object.entries(d.terrain.regions[i].mix),from=0;entries.forEach(([type,ratio],j)=>{let end=j===entries.length-1?g.length:Math.round(from+g.length*ratio);for(let k=from;k<Math.min(end,g.length);k++)d.terrain.cells[g[k].index]=type;from=end})});
  d.objects.roads=d.roadNetwork.lines;d.objects.bridges=d.roadNetwork.bridges;delete d.roadNetwork;
  for(const settlement of d.objects.settlements){const site=d.sites.find(s=>s.id===settlement.site),r=settlement.spacingKm*5;settlement.type='市街地';settlement.polygon=[[site.x-r,site.y-r],[site.x+r,site.y-r],[site.x+r,site.y+r],[site.x-r,site.y+r]];settlement.densityPerKm2=+(settlement.count/(4*r*r)).toFixed(2);settlement.alongRoadKm=.18}
})(window.WOS_TERRAIN.exercise2);
