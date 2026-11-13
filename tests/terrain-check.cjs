/* 実データ全4地形と、写しだけを壊した反例。ブラウザは使わない。 */
const assert=require('node:assert/strict');
const {IDS,createContext,headquarters,checkTerrain}=require('../tools/terrain-check.cjs');
function nodeChecks(){
 const c=createContext(),rows=[],before=new Map(IDS.map(id=>[id,JSON.stringify(c.ctx.WOS_TERRAIN[id])]));
 const check=(name,fn)=>{try{fn();rows.push({name,ok:true});}catch(e){rows.push({name,ok:false,error:e.message});}};
 // field300 の兵科ごとの通行（経路探索12回）は1回で約170秒かかるので、CI では省く。道具 node tools/terrain-check.cjs field300 では調べる（2026-11-14）
 const CI_SKIP={field300:['paths']},SECTIONS=['sites','bridges','roads','paths','engineering','beaches','coverage'];
 for(const id of IDS)check(id+' 全検査で不合格0（注意は表示）'+(CI_SKIP[id]?'（'+CI_SKIP[id].join('・')+'は道具だけ）':''),()=>{
  const skip=CI_SKIP[id]||[],r=checkTerrain(c,id,undefined,skip.length?{sections:SECTIONS.filter(s=>!skip.includes(s))}:{});
  assert.equal(r.summary.不合格,0,JSON.stringify(r.issues));
  assert.ok(r.sites.length);assert.ok(r.bridges.length);
  assert.ok(r.headquarters.length);assert.ok(r.headquarters.every(p=>p.road.connected&&(skip.includes('paths')||p.paths.length===6&&p.paths.every(k=>k.found&&k.lengthKm>0))));
  assert.equal(r.engineering.length,c.ctx.WOS_TERRAIN[id].water.rivers.length);
  assert.ok(r.beaches.seaCells>0&&r.beaches.infantry.cells>0&&r.beaches.vehicle.cells>0);
  assert.equal(r.coverage.gaps,0);assert.equal(r.coverage.corners.length,4);
 });
 check('同じ地形の通常作戦と tutorial2 の本営を両方調べる',()=>{
  assert.deepEqual(headquarters(c,'exercise2').map(p=>p.operation),['groundExercise2','tutorial2']);
  assert.deepEqual(headquarters(c,'baikonur2').map(p=>[p.from,p.to]),[['A','F']]);
  assert.deepEqual(headquarters(c,'field150').map(p=>[p.from,p.to]),[['A','C']]);
  assert.deepEqual(headquarters(c,'field300').map(p=>[p.from,p.to]),[['A','D']]);
 });
 check('道路から10km離した拠点で不合格（元の地形は保持）',()=>{
  const d=structuredClone(c.ctx.WOS_TERRAIN.field150);d.sites[0].y+=10;
  const r=checkTerrain(c,'field150',d,{sections:['sites']});
  assert.equal(r.sites[0].radius,false);assert.ok(r.summary.不合格>0);
 });
 check('川から外した橋で不合格（元の地形は保持）',()=>{
  const d=structuredClone(c.ctx.WOS_TERRAIN.field150);d.objects.bridges[0].x=0;d.objects.bridges[0].y=0;
  const r=checkTerrain(c,'field150',d,{sections:['bridges']});
  assert.equal(r.bridges[0].valid,false);assert.equal(r.summary.不合格,1);
 });
 check('本営を結ぶ道路1本の削除で不合格・道路網が切断',()=>{
  const d=structuredClone(c.ctx.WOS_TERRAIN.baikonur2);d.objects.roads=d.objects.roads.filter(r=>r.id!=='西本営幹線');
  assert.equal(d.objects.roads.length,c.ctx.WOS_TERRAIN.baikonur2.objects.roads.length-1);
  const r=checkTerrain(c,'baikonur2',d,{sections:['roads']});
  assert.equal(r.headquarters[0].road.connected,false);assert.equal(r.summary.不合格,1);
 });
 check('橋と浅瀬がない川で道路網が切断',()=>{
  const d=structuredClone(c.ctx.WOS_TERRAIN.baikonur2);d.objects.bridges=[];d.objects.fords=[];
  const r=checkTerrain(c,'baikonur2',d,{sections:['roads']});
  assert.ok(r.headquarters.every(p=>!p.road.connected));assert.equal(r.summary.不合格,1);
 });
 check('格子と海の外へ盤を広げると塗りの隙間を検出',()=>{
  const d=structuredClone(c.ctx.WOS_TERRAIN.field150);d.display.board=[[-2,50],[2,50],[2,54],[-2,54]];
  const r=checkTerrain(c,'field150',d,{sections:['coverage']});
  assert.ok(r.coverage.gaps>0&&r.coverage.edgeGaps>0&&r.coverage.examples.length>0);assert.ok(r.summary.不合格>0);
 });
 check('海のない地形は海なし・浜0として合格',()=>{
  const d=structuredClone(c.ctx.WOS_TERRAIN.exercise2);d.water.sea=[];
  const r=checkTerrain(c,'exercise2',d,{sections:['beaches']});
  assert.equal(r.beaches.seaCells,0);assert.equal(r.beaches.infantry.cells,0);assert.equal(r.beaches.vehicle.cells,0);
  assert.equal(r.beaches.infantry.note,'海なし');assert.equal(r.summary.不合格,0);
 });
 check('すべての検査と反例のあとも元の4地形は変更なし',()=>{
  for(const id of IDS)assert.equal(JSON.stringify(c.ctx.WOS_TERRAIN[id]),before.get(id),id);
 });
 return rows;
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log(`${r.ok?'合格':'不合格'} ${r.name}${r.error?' '+r.error:''}`);if(rows.some(r=>!r.ok))process.exitCode=1;}
