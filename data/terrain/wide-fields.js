/* 広域検証の地形。設計図 docs/terrain/wide-fields.md。演習場の引伸ばしではなく別の配置。
   戦闘規則だけ共用し、地形・密度・道路は独立。必要なmapの初回アクセス時に生成する。 */
(function(){
 const source=window.WOS_TERRAIN.exercise2,keys=['bands','sight','strike','transport','landing','unitTypes','navalFireRangesKm','combat','capture','movement','supply'];
 const common={};for(const k of keys)common[k]=JSON.parse(JSON.stringify(source[k]));
 function inside(x,y,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
 const definitions={
  field150:{width:150,height:100,seed:28150,coast:[[0,20],[18,22],[34,19],[50,24],[66,21],[82,23],[100,19],[120,22],[137,18],[150,21]],
   main:[[78,100],[76,90],[78,80],[75,72],[74,65],[72,55],[78,45],[75,35],[70,22]],west:[[75,35],[66,32],[62,27],[53,22]],east:[[75,35],[84,31],[88,26],[92,23]],
   sites:[['A','西方本営',20,78],['B','中央渡河点',75,72],['C','東方本営',130,80],['D','西方港',25,25],['E','南部中継',62,42],['F','東方集落',112,42]],
   roads:[['連絡幹線',[[20,78],[44,77],[61,74],[75,72],[96,74],[112,78],[130,80]]],['西岸線',[[20,78],[25,60],[30,44],[25,25]]],['南部連絡線',[[30,44],[45,42],[62,42],[78,45],[98,44],[112,42]]],['東岸線',[[130,80],[122,61],[112,42]]]],
   bridges:[['中央橋',75,72,'main'],['南部橋',78,45,'main']],fords:[['浅瀬北',76,90,'main'],['西分流浅瀬',66,32,'west']],
   desert:[[112,24],[140,23],[147,38],[139,49],[122,47],[110,35]],swamps:[[[40,24],[54,24],[61,29],[56,35],[44,33]],[[75,24],[94,25],[99,31],[89,36],[77,31]],[[65,50],[70,48],[72,55],[68,59],[64,56]]],
   fields:[[[37,57],[55,56],[58,65],[39,67]],[[92,56],[111,56],[113,65],[95,67]]],forest:1400,shrubs:1300,reeds:300},
  field300:{width:300,height:200,seed:28300,coast:[[0,39],[28,43],[54,38],[81,46],[105,41],[132,45],[158,39],[184,44],[212,40],[239,46],[266,37],[300,42]],
   main:[[198,200],[185,185],[180,177],[179,160],[190,140],[177,120],[169,100],[172,84],[173,78],[166,42]],west:[[173,78],[160,66],[145,55],[132,42]],east:[[173,78],[192,69],[210,56],[218,43]],
   sites:[['A','西方本営',35,150],['B','西部中継',105,130],['C','中央渡河点',177,120],['D','東方本営',260,160],['E','西方港',52,48],['F','河口基地',157,58],['G','東部集落',244,84],['H','北部中継',180,177]],
   roads:[['内陸幹線',[[35,150],[68,142],[105,130],[140,124],[177,120],[209,130],[236,147],[260,160]]],['西岸連絡線',[[35,150],[42,115],[54,80],[52,48]]],['河口連絡線',[[54,80],[94,72],[125,67],[157,58]]],['東岸連絡線',[[157,58],[170,72],[172,84],[210,79],[244,84],[252,117],[260,160]]],['北部連絡線',[[140,124],[158,149],[180,177],[216,173],[260,160]]]],
   bridges:[['中央橋',177,120,'main'],['河口橋',172,84,'main'],['北部橋',180,177,'main']],fords:[['北の浅瀬',185,185,'main'],['西分流浅瀬',160,66,'west']],
   desert:[[235,47],[275,44],[292,64],[285,99],[256,104],[230,76]],swamps:[[[109,45],[136,46],[148,56],[140,64],[117,59]],[[170,44],[207,45],[223,55],[207,67],[179,58]],[[156,96],[164,92],[170,100],[164,109],[154,106]]],
   fields:[[[77,102],[108,100],[112,118],[84,120]],[[216,112],[243,109],[247,126],[220,129]]],forest:2500,shrubs:2400,reeds:600}
 };
 function create(id){
  const b=definitions[id],W=b.width,H=b.height,d=JSON.parse(JSON.stringify(common)),rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  d.sight.fogStep=Math.max(d.sight.fogStep,Math.max(W,H)*4/192);
  d.meta={id,location:'ウラル川下流・北カスピ海を型にした架空の広域検証場',widthKm:W,heightKm:H,cellKm:.4,elevationExaggeration:18,seed:b.seed,seaLevelM:-28,terrainTypes:['河川デルタ','氾濫原'],note:'実測GISではない。設計図に基づく創作配置。新しい章の作戦ではない。'};
  // 地形: 海岸・本流・分流・低窪地を先に固定する。
  const rivers=[{id:'main',points:b.main,widths:b.main.map((_,i)=>.32+i*.065)},{id:'west',points:b.west,widths:b.west.map((_,i)=>.28+i*.12)},{id:'east',points:b.east,widths:b.east.map((_,i)=>.3+i*.12)}];
  const sea=[[0,0],[W,0],...b.coast.slice().reverse()];
  d.water={engineerBridgeMaxWidthKm:.3,coast:b.coast,sea,shallow:[...b.coast,...b.coast.slice().reverse().map(([x,y])=>[x,Math.max(0,y-3)])],rivers,ponds:[],deepChannel:{name:'検証用の港湾水路（創作）',points:[[b.sites[3]?.[2]||W*.2,0],[W*.2,H*.22]],widthKm:.65}};
  d.height={baseM:.5,interpolationRadiusKm:W*.13,noiseM:.06,levee:{river:'main',bankOffsetKm:.65,widthKm:.5,heightM:2.4,channelHalfWidthKm:.19,channelCutM:.7},terrace:{edgeYKm:H*.8,widthKm:1.1,heightM:3},depressions:b.swamps.map(p=>({x:p.reduce((s,v)=>s+v[0],0)/p.length,y:p.reduce((s,v)=>s+v[1],0)/p.length,widthXKm:4,widthYKm:3,depthM:1})),sandbars:[],observationHill:{x:W*.86,y:H*.78,widthXKm:4,widthYKm:3,heightM:3},points:[{x:W*.08,y:H*.92,m:6},{x:W*.5,y:H*.95,m:7},{x:W*.92,y:H*.92,m:8},{x:W*.14,y:H*.55,m:2},{x:W*.5,y:H*.55,m:2.5},{x:W*.87,y:H*.56,m:3},{x:W*.1,y:H*.24,m:.5},{x:W*.5,y:H*.24,m:.6},{x:W*.9,y:H*.23,m:.5}]};
  // オブジェクト: 森と低木は決めた帯・区画にだけ置く。全域へ散布しない。
  d.surface=[...b.swamps.map((polygon,i)=>({id:'reed-'+i,type:'reed',as:'沼地',polygon})),...b.fields.map((polygon,i)=>({id:'field-'+i,type:'field',as:'平地',polygon})),{id:'sand-east',type:'salt',as:'砂漠',polygon:b.desert}];d.surfaceDefault={type:'steppe',as:'平地'};
  d.sites=b.sites.map(([id,name,x,y])=>({id,name,x,y,radiusKm:4,owner:id==='A'?'blue':id===(b.sites.length===6?'C':'D')?'orange':'neutral',role:'設計済みの道路結節'}));
  d.objects={forest:{type:'森林',seed:b.seed+10,count:b.forest,roadClearanceKm:.15,terraceMaxYKm:H*.85,bands:rivers.map((r,i)=>({river:r.id,yMin:r.points.at(-1)[1]+2,yMax:i?Math.max(...r.points.map(p=>p[1])):H*.85,bankMinKm:.6,bankMaxNorthKm:1.4,bankMaxSouthKm:.8,fadeStartYKm:H*.4,gapPeriodKm:i?3:6,gapFraction:.25}))},
   shrubs:{type:'低木',species:['タマリスク','ヨモギ類','塩生低木'],seed:b.seed+20,count:b.shrubs,renderCount:b.shrubs,clusterKm:3,terraceMaxYKm:H*.96,roadClearanceKm:.2,zones:[{id:'west-steppe',kind:'steppe',polygon:rect(W*.04,H*.38,W*.4,H*.9),density:.22},{id:'east-steppe',kind:'steppe',polygon:rect(W*.72,H*.52,W*.95,H*.92),density:.22},{id:'forest-edge',kind:'bank',riverIds:['main','west','east'],minKm:1.5,maxKm:2.6,density:.6}]},
   reeds:{coverIds:b.swamps.map((_,i)=>'reed-'+i),count:b.reeds,seed:b.seed+30,densityPerKm2:.87},
   settlements:d.sites.map(s=>({site:s.id,type:'市街地',count:s.id==='A'||s.id===(b.sites.length===6?'C':'D')?90:50,spacingKm:.16,alongRoadKm:.18,polygon:rect(s.x-.8,s.y-.8,s.x+.8,s.y+.8)})),
   roads:b.roads.map(([id,points],i)=>({id,type:i?'local':'main',points})),bridges:b.bridges.map(([id,x,y,river])=>({id,x,y,river})),fords:b.fords.map(([id,x,y,river])=>({id,x,y,river,widthKm:.2}))};
  // 道路: 本営・橋・港・中継の間だけを連結する。河川や集落の配置を後から曲げない。
  const port=d.sites.find(s=>s.id===(b.sites.length===6?'D':'E'));d.water.deepChannel.points=[[port.x,0],[port.x,Math.max(0,port.y-5)],[port.x,port.y]];
  const outline=[[.02,.08],[.13,.025],[.34,.045],[.54,.018],[.76,.035],[.94,.02],[.985,.16],[.96,.38],[.99,.61],[.96,.84],[.87,.975],[.66,.95],[.44,.985],[.23,.96],[.065,.975],[.015,.82],[.035,.59],[.008,.35]].map(([x,y])=>[x*W,y*H]);
  // 分割は等間隔。外枠へランダムなギザギザを足さない。
  const board=outline.flatMap((a,i)=>{const c=outline[(i+1)%outline.length];return [0,1,2].map(j=>[a[0]+(c[0]-a[0])*j/3,a[1]+(c[1]-a[1])*j/3]);});
  d.display={board,units:[],bombardment:{x:W*.5,y:H*.6,radiusKm:2},descent:{x:W*.7,y:H*.6}};
  const cols=Math.round(W/d.meta.cellKm),rows=Math.round(H/d.meta.cellKm);d.terrain={cols,rows,cells:Array(cols*rows).fill(null),regions:[...b.swamps.map((region,i)=>({id:'lowland-'+i,region,mix:{沼地:1}})),{id:'dry-sand',region:b.desert,mix:{砂漠:1}}]};
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
   const px=(x+.5)*d.meta.cellKm,py=(y+.5)*d.meta.cellKm;if(!inside(px,py,board)||inside(px,py,sea))continue;
   d.terrain.cells[y*cols+x]=b.swamps.some(p=>inside(px,py,p))?'沼地':inside(px,py,b.desert)?'砂漠':'平地';
  }
  return d;
 }
 for(const id of Object.keys(definitions)){let cached;Object.defineProperty(window.WOS_TERRAIN,id,{enumerable:true,get(){return cached||(cached=create(id));}});}
})();
