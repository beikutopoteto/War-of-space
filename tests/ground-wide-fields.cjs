/* 広域設計データと既存の経路・補給を接続する確認。 */
const assert=require('assert/strict');
function nodeChecks(){
 const {run,read}=require('./ground-landing.cjs').createGroundContext();run(read('data/terrain/wide-fields.js'));run(read('data/ground-fields.js'));
 return run(`(()=>{
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
  for(const [id,W,H,enemyId] of [['field150',150,100,'C'],['field300',300,200,'D']]){
   op=WOS_DATA.operations.find(o=>o.id==='ground'+id);groundTerrainId=null;const d=WOS_TERRAIN[id];
   check(id+'は演習とは独立した正しい寸法・セル数',op.forces==='fixed'&&op.quick.some(f=>f.groundKind==='guidedRocket')&&d.meta.widthKm===W&&d.meta.heightKm===H&&d.terrain.cells.length===W/.4*(H/.4)&&WOS_TERRAIN.exercise2.meta.widthKm===48);
   const land=d.terrain.cells.filter(Boolean),swamp=land.filter(t=>t==='沼地').length;
   check(id+'の沼地は局在し畑は平地',swamp>0&&swamp/land.length<.15&&d.surface.filter(s=>s.type==='field').every(s=>s.as==='平地')&&d.terrain.cells.includes('砂漠'));
   check(id+'の架橋上限は0.3kmを維持',d.water.engineerBridgeMaxWidthKm===.3);
   check(id+'の全拠点を道の結節へ設置',d.sites.every(s=>d.objects.roads.some(r=>groundDistance(s.x,s.y,r.points)<.001)&&groundPass(s.x,s.y,'vehicle')));
   check(id+'の橋と浅瀬が実河道に一致', [...d.objects.bridges,...d.objects.fords].every(p=>groundRiverAt(p.x,p.y,d.water.rivers.find(r=>r.id===p.river)).dist<.001));
   check(id+'の植生は指定帯と区画だけを持つ',d.objects.forest.bands.every(b=>d.water.rivers.some(r=>r.id===b.river))&&d.objects.shrubs.renderCount===(W===150?1300:2400)&&d.objects.reeds.coverIds.every(id=>d.surface.some(s=>s.id===id&&s.as==='沼地')));
   const spec=op.quick.find(s=>s.groundKind==='guidedRocket'),f=makeFleet(0,spec);f.band='ground';fleets=[f];
   check(id+'でもロケットの物理射程50kmは不変',groundStrikeRange(f).max===200&&Math.abs(groundMapX(f.pos.x)-d.sites[0].x)<2&&Math.abs(groundMapY(f.pos.z)-d.sites[0].y)<2);
   const home=d.sites[0],bridge=d.objects.bridges[0],a=groundPoint(home.x,home.y),b=groundPoint(bridge.x-2,bridge.y),route=groundPath(a,b,'vehicle');
   check(id+'の長い平地は道路加速を使い安全に到達',route&&route.cost*GROUND_SCALE*d.meta.cellKm<=groundDistanceTo({pos:a},{pos:b})+1e-6&&route.points.every(p=>groundPass(groundMapX(p.x),groundMapY(p.z),'vehicle'))&&route.points.at(-1).distanceTo(b)<1e-7);
   groundSites=d.sites.map(s=>({...s,pos:groundPoint(s.x,s.y),owner:0,contested:false,progress:[0,0]}));groundTerritory=null;groundSupplyBuild();groundSupplyNet.edges.forEach(e=>{e.owner=0;e.contested=false;});groundSupplyRefresh();const far=groundSites.find(s=>s.id===enemyId);
   check(id+'の道路と恒久橋を通じ本営から遠方まで実補給',groundSupplyAt({team:0,pos:far.pos}).rate===1);
   groundSupplyNet.edges.forEach(e=>{if(!e.circle)e.contested=true;});groundSupplyRefresh();check(id+'でも競合先は半速',groundSupplyAt({team:0,pos:far.pos}).rate===.5);
   groundSupplyNet.edges.forEach(e=>{if(!e.circle){e.contested=false;e.owner=1;}});groundSupplyRefresh();check(id+'でも敵占領で補給は切断',groundSupplyAt({team:0,pos:far.pos}).rate===0);
  }
  const a=WOS_TERRAIN.field150.water.rivers[0].points,b=WOS_TERRAIN.field300.water.rivers[0].points;
  check('300km版は150km版の全面倍率コピーではない',JSON.stringify(a.map(p=>p.map(v=>v*2)))!==JSON.stringify(b));
  return rows;
 })()`);
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log('広域地形データ '+(rows.length-bad.length)+'/'+rows.length);assert.equal(bad.length,0,JSON.stringify(bad));}
