/* Hash the complete gameplay cover arrays and measure rendered instances and triangles. */
const crypto=require('crypto');
const {openGame}=require('./browser.cjs');
const id=process.argv[2];
if(!['exercise2','baikonur2','field150','field300'].includes(id))throw new Error('Usage: node tools/ground-cover-hash.cjs exercise2|baikonur2|field150|field300');
(async()=>{const {browser,page,errors}=await openGame();try{
 const data=await page.evaluate(id=>{
  op={...WOS_DATA.operations.find(o=>o.id===(id==='baikonur2'?'baikonur':id==='exercise2'?'groundExercise2':'ground'+id)),ground:id};
  groundSetup(id);
  const meshes=[],shapes={},heightDiffOver20=0,boxByPosition=groundBuildings;let badHeights=0;groundBoard.traverse(o=>{if(['buildings','forest'].includes(o.userData.groundObject)){const g=o.geometry;if(o.userData.groundObject==='buildings'&&g.userData.groundShapeKey){const key=g.userData.groundShapeKey;shapes[key]=(shapes[key]||0)+o.count;const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);matrix.decompose(pos,quat,scale);const b=boxByPosition.find(b=>Math.abs((b.minX+b.maxX)/2/GROUND_SCALE-pos.x)<.00002&&Math.abs((b.minZ+b.maxZ)/2/GROUND_SCALE-pos.z)<.00002);if(!b)throw new Error('Building position missing from cover');if(Math.abs((g.boundingBox.max.y-g.boundingBox.min.y)*scale.y*GROUND_SCALE/(b.top-b.bottom)-1)>.2)badHeights++;}}meshes.push({kind:o.userData.groundObject,settlement:o.userData.settlement,count:o.count,triangles:o.count*(g.index?g.index.count:g.attributes.position.count)/3});}});
  return {buildings:groundBuildings,forests:groundForests,meshes,shapes,badHeights};
 },id);
 if(errors.length)throw new Error(errors.join('\n'));
 const hash=a=>crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex');
 console.log(JSON.stringify({id,buildings:{count:data.buildings.length,sha256:hash(data.buildings)},forests:{count:data.forests.length,sha256:hash(data.forests)},triangles:Object.fromEntries(['buildings','forest'].map(k=>[k,data.meshes.filter(m=>m.kind===k).reduce((n,m)=>n+m.triangles,0)])),shapes:data.shapes,heightDiffOver20:data.badHeights,meshes:data.meshes},null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
