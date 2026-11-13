/* 広域バイコヌール演習。地形→植生・集落の局在→道路→拠点は docs/terrain/baikonur2.md。
   地形は独立配置、初回参照時に生成。戦闘規則は data/ground-rules.js。 */
(function(){
 let cached;
 Object.defineProperty(window.WOS_TERRAIN,'baikonur2',{enumerable:true,get(){return cached||(cached=create());}});
 function create(){
  const d={};
  const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  d.meta={id:'baikonur2',name:'カスピ海沿岸演習場（広域）',location:'アティラウ南方・ウラル川デルタと北カスピ海の氾濫原',latitude:46.85,longitude:51.85,widthKm:96,heightKm:72,cellKm:.4,elevationExaggeration:18,seed:28111,seaLevelM:-28,terrainTypes:['河川デルタ','氾濫原'],note:'寸法・密度・配置は演習用の仮値。実測GISではなく、港湾水路は創作。'};
  const coast=[[0,17],[12,18],[23,17],[34,16.5],[43,15.5],[47,16],[60,15],[69,14.5],[76,18],[86,17],[96,16]];
  d.water={engineerBridgeMaxWidthKm:.5 /* 仮。ユーザー決定 2026-11-12 */,coast,sea:[[-20,-20],[116,-20],[116,16],...coast.slice().reverse(),[-20,17]]/*盤の外まで広げる。角を滑らかにしたとき南の隅が陸に見えた（2026-11-11）*/,shallow:[...coast,...coast.slice().reverse().map(([x,y])=>[x,y-2.5])],
   rivers:[{id:'main',points:[[51,72],[50,66],[49,60],[50,53],[48,46],[47,39],[46,32],[46,25],[46,23],[47,16]],widths:[.28,.3,.35,.4,.46,.52,.6,.7,.75,.9]},
    {id:'west',points:[[46,23],[39,21],[36,19],[34,16.5]],widths:[.26,.32,.4,.5]},
    {id:'east',points:[[46,23],[52,22],[56,20],[60,15]],widths:[.25,.28,.36,.5]}],
   ponds:[[[33,30],[35,29],[37,30],[36,32],[34,32]]],
   deepChannel:{name:'演習用沿岸浚渫水路（創作）',points:[[23,0],[23,17],[34,14],[46,12],[60,12],[70,14],[76,18]],widthKm:.8}};
  d.height={baseM:.5,interpolationRadiusKm:12,noiseM:.06,
   levee:{river:'main',bankOffsetKm:.65,widthKm:.5,heightM:2.4,channelHalfWidthKm:.2,channelCutM:.7},terrace:{edgeYKm:61,widthKm:.65,heightM:5},
   depressions:[{x:35,y:31,widthXKm:5,widthYKm:2,depthM:1.1},{x:60,y:31,widthXKm:5,widthYKm:2,depthM:1},{x:40,y:35,widthXKm:3,widthYKm:1,depthM:1.6},{x:56,y:35,widthXKm:3,widthYKm:1,depthM:1.5},{x:18,y:63,widthXKm:4,widthYKm:.7,depthM:2},{x:79,y:64,widthXKm:4,widthYKm:.8,depthM:2}],
   sandbars:[{x:23,y:18,widthXKm:2,widthYKm:.7,heightM:1},{x:76,y:19,widthXKm:2,widthYKm:.7,heightM:1}],
   // 東西の砂の高まりは北の乾燥帯に限定。幅はガウスの尺度（裾を含む長さは約4倍）。すべて仮。
   ridges:[{x:12,y:65,widthXKm:2,widthYKm:.4,heightM:8},{x:22,y:66,widthXKm:1.6,widthYKm:.5,heightM:12},{x:32,y:64,widthXKm:1.8,widthYKm:.45,heightM:7},{x:38,y:67,widthXKm:1.2,widthYKm:.4,heightM:10},
    {x:62,y:66,widthXKm:1.8,widthYKm:.45,heightM:9},{x:72,y:67,widthXKm:2,widthYKm:.5,heightM:13},{x:81,y:66,widthXKm:1.5,widthYKm:.4,heightM:8},{x:88,y:64,widthXKm:1.2,widthYKm:.45,heightM:11}],
   observationHills:[{x:18,y:58,widthXKm:1.5,widthYKm:.9,heightM:6},{x:40,y:53,widthXKm:1.4,widthYKm:1,heightM:7},{x:58,y:48,widthXKm:1.5,widthYKm:.9,heightM:7},{x:81,y:42,widthXKm:1.6,widthYKm:1,heightM:6}],
   points:[{x:8,y:67,m:4},{x:39,y:68,m:5},{x:87,y:66,m:4.5},{x:14,y:49,m:2},{x:47,y:48,m:2.1},{x:81,y:47,m:2.4},{x:12,y:25,m:.7},{x:46,y:26,m:.5},{x:82,y:23,m:.6}]};
  const regions=[
   {id:'mouth-west',region:[[27,17],[34,16.5],[43,15.5],[45,23],[39,23],[34,24],[28,22]],mix:{沼地:.75,平地:.25},patch:1.1,seed:912},
   {id:'mouth-east',region:[[48,16],[60,15],[67,15],[68,20],[58,22],[49,22]],mix:{沼地:.75,平地:.25},patch:1.2,seed:913},
   {id:'old-west',region:[[29,30],[34,28],[40,29],[42,31],[38,34],[32,33]],mix:{沼地:.8,平地:.2},patch:.8,seed:914},
   {id:'old-east',region:[[55,30],[59,28],[65,29],[67,32],[62,34],[56,33]],mix:{沼地:.8,平地:.2},patch:.9,seed:915},
   {id:'old-west-inner',region:rect(38,34,42,36),mix:{沼地:.7,平地:.3},patch:.8,seed:917},
   {id:'old-east-inner',region:rect(54,34,58,36),mix:{沼地:.7,平地:.3},patch:.8,seed:918},
   {id:'salt-north-west',region:rect(14,62.4,22,63.6),mix:{砂漠:.8,平地:.2},patch:1,seed:919},
   {id:'salt-north-east',region:rect(75,63.3,83,64.7),mix:{砂漠:.8,平地:.2},patch:1,seed:920},
   {id:'sand-north-west',region:rect(7,64,42,68),mix:{砂漠:.65,平地:.35},patch:1.2,seed:921},
   {id:'sand-north-east',region:rect(58,65,91,69),mix:{砂漠:.65,平地:.35},patch:1.2,seed:922},
   {id:'salt-east',region:[[79,21],[89,20],[94,25],[91,34],[83,34],[78,28]],mix:{砂漠:.7,平地:.3},patch:1.6,seed:916}];
  d.surface=[...regions.map(r=>({id:r.id,type:r.id.startsWith('salt')?'salt':r.id.startsWith('sand')?'sand':'reed',as:r.mix.砂漠?'砂漠':'沼地',polygon:r.region})),
   {id:'fields-west',type:'field',as:'平地',polygon:rect(23,45,39,53)},{id:'fields-east',type:'field',as:'平地',polygon:rect(56,43,73,52)}];
  d.surfaceDefault={type:'steppe',as:'平地'};
  // 道は既存のまま。村と畑を乾いた沿道へ置き、北幹線や浅瀬の迂回路に森を足さない。
  const villages=[['v1',19,53],['v2',30,47],['v3',36,43],['v4',58,42],['v5',77,48],['v6',26,35],['v7',60,24],['v8',75,32]];
  for(const [id,x,y] of villages)d.surface.push({id:'fields-'+id,type:'field',as:'平地',polygon:rect(x-2,y-1.4,x+2,y+1.4)});
  // 森は河岸・防風林・氾濫原の島、低木は草原区画・林縁・塩性地の縁に局在する。
  const settlements=[['A',10,56,96],['B',27,49,62],['C',49,60,42],['D',47,39,42],['E',69,44,62],['F',86,55,96],['G',23,19,42],['H',46,25,42],['I',76,20,42]];
  d.objects={forest:{type:'森林',species:['ヤナギ','ポプラ'],seed:28121,count:6000,renderFactor:.55,roadClearanceKm:.32,terraceMaxYKm:61,avoidWater:true,
    windbreakShare:.25,islandShare:.2,windbreaks:[
     {points:[[23,51.8],[38,51.8]],widthKm:.2},{points:[[24,45.3],[37,45.3]],widthKm:.2},
     {points:[[56,50.8],[72,50.8]],widthKm:.2},{points:[[59,44.8],[67,44.8]],widthKm:.2},
     ...villages.filter(v=>![26,60,75].includes(v[1])).map(([,x,y])=>({points:[[x-1.8,y+1.2],[x+1.8,y+1.2]],widthKm:.18}))],
    islands:[{polygon:rect(38,36.5,42,38.5)},{polygon:rect(52,37,56,39)},{polygon:rect(36,26,40,28)},{polygon:rect(52,25.5,56,27.5)},{polygon:rect(40,46,43,49)},{polygon:rect(53,48,56,51)}],bands:[
    {river:'main',yMin:24,yMax:61,bankMinKm:.5,bankMaxNorthKm:1.2,bankMaxSouthKm:.7,fadeStartYKm:38,gapPeriodKm:4,gapFraction:.28},
    ...['west','east'].map(river=>({river,yMin:17,yMax:23,bankMinKm:.4,bankMaxNorthKm:.8,bankMaxSouthKm:.5,fadeStartYKm:21,gapPeriodKm:2.5,gapFraction:.35}))]},
   shrubs:{type:'低木',species:['タマリスク','ヨモギ類','塩生低木'],seed:28131,count:3000,renderCount:2600,lobeMin:3,lobeMax:4,geometryDetail:0,clusterKm:2.8,roadClearanceKm:.18,terraceMaxYKm:69,zones:[
    {id:'west-steppe',kind:'steppe',polygon:rect(5,35,36,66),density:.22},{id:'east-steppe',kind:'steppe',polygon:rect(62,39,92,65),density:.22},
    {id:'bank-edge',kind:'bank',riverIds:['main','west','east'],minKm:1.3,maxKm:2,density:.6},{id:'salt-edge',kind:'salt',polygon:rect(77,19,94,35),density:.15}]},
   reeds:{coverIds:regions.filter(r=>r.mix.沼地).map(r=>r.id),seed:28141,count:1000,roadClearanceKm:.18},
   settlements:[...settlements.map(([site,x,y,count])=>({site,type:'市街地',count,spacingKm:.22,alongRoadKm:.24,avoidWater:true,polygon:rect(x-1.3,y-1.3,x+1.3,y+1.3)})),
    ...villages.map(([id,x,y])=>({id,x,y,type:'市街地',count:14,spacingKm:.15,alongRoadKm:.24,avoidWater:true,polygon:rect(x-1,y-1,x+1,y+1)}))]};
  // 道路は先に定めた乾燥地の集落と渡河点を結ぶ。河口分流は道路より南。
  d.objects.roads=[
   {id:'西本営幹線',type:'main',points:[[10,56],[19,53],[27,49]]},
   {id:'北幹線',type:'main',points:[[27,49],[31,59],[45,59+14/18],[49,60],[54,60],[61,60],[68,53],[69,44]]},
   {id:'中央線',type:'local',points:[[27,49],[36,43],[47,39],[58,42],[69,44]]},
   {id:'西岸線',type:'local',points:[[27,49],[26,35],[25,25],[23,19]]},
   {id:'海岸線',type:'local',points:[[23,19],[33,23],[39,25],[46,25],[60,24],[68,22],[76,20]]},
   {id:'東岸線',type:'local',points:[[76,20],[75,32],[69,44]]},
   {id:'東本営幹線',type:'main',points:[[69,44],[77,48],[86,55]]},
   {id:'北浅瀬迂回路',type:'local',points:[[45,59+14/18],[49,66],[50,66],[51,66],[54,60]]}];
  d.objects.bridges=[{id:'北幹線橋',x:49,y:60,river:'main'},{id:'中央橋',x:47,y:39,river:'main'},{id:'河口橋',x:46,y:25,river:'main'}];
  d.objects.fords=[{id:'北の浅瀬',x:50,y:66,river:'main',widthKm:.4}];
  const names=['西方本営','西方結節','北幹線橋','中央渡河地','東方結節','東方本営','西岸演習港','河口橋','東岸演習港'];
  d.sites=settlements.map(([id,x,y],i)=>({id,name:names[i],x,y,radiusKm:id==='A'||id==='F'?4:3,owner:['A','B','G'].includes(id)?'blue':['E','F','I'].includes(id)?'orange':'neutral',role:['本営','分岐','橋','橋','結節','本営','港','橋','港'][i]}));
  d.display={board:[[1,8],[5,2],[24,1],[46,2],[68,1],[91,3],[95,10],[94,29],[95,48],[92,68],[72,70],[51,72],[28,70],[5,68],[1,52],[2,30]],units:[],bombardment:{x:47,y:39,radiusKm:2},descent:{x:69,y:44}};
  const outline=d.display.board;d.display.board=outline.flatMap((a,i)=>{const b=outline[(i+1)%outline.length];return [0,1,2].map(j=>[a[0]+(b[0]-a[0])*j/3,a[1]+(b[1]-a[1])*j/3]);});
  function inside(x,y,p){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  const cols=240,rows=180,cells=Array(cols*rows).fill(null),groups=regions.map(()=>[]);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
   const px=(x+.5)*.4,py=(y+.5)*.4,i=y*cols+x;if(!inside(px,py,d.display.board)||inside(px,py,d.water.sea))continue;
   cells[i]='平地';const r=regions.findIndex(r=>inside(px,py,r.region));if(r>=0){const spec=regions[r],u=px/spec.patch,v=py/spec.patch;groups[r].push({i,n:Math.sin(u*.83+spec.seed)*Math.cos(v*.71-spec.seed)+.35*Math.sin(u*.37+v*.59+spec.seed)});}
  }
  regions.forEach((r,j)=>{const group=groups[j].sort((a,b)=>a.n-b.n||a.i-b.i),[kind,share]=Object.entries(r.mix)[0];for(let i=0;i<Math.round(group.length*share);i++)cells[group[i].i]=kind;});
  d.terrain={cols,rows,cells,regions};
  return d;
 }
})();
