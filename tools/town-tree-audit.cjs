/* Inspect rendered vegetation, not just gameplay forest records. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{openGame,ROOT}=require('./browser.cjs');
(async()=>{const {browser,page,errors}=await openGame();try{
 const rows=[];
 for(const id of ['exercise2','baikonur2','field150','field300'])rows.push(await page.evaluate(id=>{
  reset({op:id==='exercise2'?'groundExercise2':id==='baikonur2'?'baikonur':'ground'+id});setSpeed(0);
  const near=(x,z,b,r=0)=>{const dx=(x-b.x)/GROUND_SCALE,dy=-(z-b.z)/GROUND_SCALE,c=Math.cos(b.ang),s=Math.sin(b.ang),u=dx*c+dy*s,v=-dx*s+dy*c;return Math.hypot(Math.max(0,Math.abs(u)-b.w/GROUND_SCALE/2),Math.max(0,Math.abs(v)-b.d/GROUND_SCALE/2))-r<=.05;};
  const instances=[];for(const mesh of groundBoard.children.filter(m=>['forest','parkTrees','shrubLobes'].includes(m.userData.groundObject))){mesh.geometry.computeBoundingBox();const matrix=new THREE.Matrix4(),box=mesh.geometry.boundingBox;for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(pos,q,scale);let radius=0;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).applyMatrix4(matrix);radius=Math.max(radius,Math.hypot(v.x-pos.x,v.z-pos.z));}instances.push({kind:mesh.userData.groundObject,x:pos.x*GROUND_SCALE,z:pos.z*GROUND_SCALE,r:radius});}}
  return {id,rows:groundData().objects.settlements.map(spec=>{const sid=spec.site||spec.id,bs=groundBuildings.filter(b=>b.settlement===sid);return {id:sid,coverTreeNear:groundForests.filter(t=>bs.some(b=>near(t.x,t.z,b,t.r/GROUND_SCALE))).length,...Object.fromEntries(['forest','parkTrees','shrubLobes'].map(k=>[k,instances.filter(t=>t.kind===k&&bs.some(b=>near(t.x,t.z,b,t.r))).length]))};}),forestInstances:instances.filter(t=>t.kind==='forest').slice(0,3),forestCover:groundForests.slice(0,3)};
 },id));
 if(errors.length)throw new Error(errors.join('\n'));
 fs.writeFileSync(path.join(ROOT,'test-results/town-plan/trees-'+(process.argv[2]||'after')+'.json'),JSON.stringify(rows,null,2)+'\n');for(const row of rows)console.log(JSON.stringify(row));
 if(process.argv[2]!=='before')assert(rows.every(m=>m.rows.every(r=>r.forest===0&&r.parkTrees===0&&r.shrubLobes===0&&r.coverTreeNear===0)),'Vegetation enters the 50m building clearance');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
