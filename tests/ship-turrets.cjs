/* node tests/ship-turrets.cjs: actual ship geometries and render helpers, without Chromium. */
const assert=require('node:assert/strict');
const {createGroundContext}=require('./ground-landing.cjs');
function createShipContext(){
  const test=createGroundContext(),{ctx,run,read}=test;
  ctx.scene=new ctx.THREE.Scene();ctx.TEAM_COL=[0,1,2,3].map(()=>new ctx.THREE.Color('blue'));
  const units=read('battle/units.js');run(units.slice(units.indexOf('const SHIP_MAX='),units.indexOf('/* faint trails')));
  run(`const o3=new THREE.Object3D(),camera=new THREE.PerspectiveCamera(50,1600/900,.1,2000),H=900;
    const gap=(f,t)=>f.pos.distanceTo(t.pos)-(t.radius||0),bodyBlocks=()=>false;
    camera.position.set(0,0,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  `);
  const loop=read('battle/loop.js');run(loop.slice(loop.indexOf('/* 仮: 見本'),loop.indexOf('let last=performance.now()')));
  run(`function testView(){camera.updateMatrixWorld();_shipProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);_shipFrustum.setFromProjectionMatrix(_shipProjection);shipTurretPixelScale=(H/2)/Math.tan(camera.fov*Math.PI/360);}
    function testClear(){for(const t of [0,1,2,3]){for(const m of Object.values(shipMeshes[t]))m.count=0;for(const m of Object.values(shipHullMeshes[t]))m.count=0;for(const m of turretMeshes[t].values())m.count=0;}}
    const testShip={type:'bb',pos:new THREE.Vector3()},testTarget={alive:true,seen:true,kind:'fleet',pos:new THREE.Vector3(-4,3,8),ships:[{pos:new THREE.Vector3(-4,3,8)}]},testFleet={team:0,pos:new THREE.Vector3(),range:100,fireTarget:null,ships:[testShip]};
    o3.updateMatrix();testView();
  `);
  return test;
}
function nodeChecks(){
  const {ctx,run}=createShipContext(); let count=0;
  const check=(name,code)=>{assert.equal(run(code),true,name);count++;};
  /* Exact rounded fingerprints first; points on a rounding boundary are matched within 1e-4.
     Cyclic permutations preserve the face winding, so a reversed triangle cannot pass. */
  ctx.sameShipTriangles=(geos,reference)=>{
    const triangles=gs=>gs.flatMap(g=>{const p=g.attributes.position,c=g.attributes.color,rows=[];
      for(let i=0;i<p.count;i+=3){const v=[];for(let j=0;j<3;j++)v.push([p.getX(i+j),p.getY(i+j),p.getZ(i+j),c.getX(i+j),c.getY(i+j),c.getZ(i+j)]);rows.push(v);}return rows;});
    const key=v=>[0,1,2].map(j=>[v[j],v[(j+1)%3],v[(j+2)%3]].map(p=>p.map(x=>Math.round(x*1e4)).join(',')).join(';')).sort()[0];
    const a=triangles(geos),b=triangles([reference]),buckets=new Map(),rest=[];if(a.length!==b.length)return false;
    for(const t of b){const k=key(t);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(t);}
    for(const t of a){const list=buckets.get(key(t));if(list?.length)list.pop();else rest.push(t);}
    const unmatched=[...buckets.values()].flat();
    for(const t of rest){const i=unmatched.findIndex(u=>[0,1,2].some(j=>t.every((p,k)=>p.every((x,d)=>Math.abs(x-u[(j+k)%3][d])<=1e-4))));if(i<0)return false;unmatched.splice(i,1);}
    return unmatched.length===0;
  };
  const result=JSON.parse(run(`JSON.stringify(Object.entries(shipRigs).map(([key,r])=>{
    const parts=[r.hull];for(const t of r.turrets)for(const id of [t.houseId,t.gunId])if(id!=null)parts.push(shipTurretShapes[id].clone().applyMatrix4(t.L0));
    return {key,ok:sameShipTriangles(parts,shipGeos[key]),turrets:r.turrets.length,meshes:new Set(r.turrets.flatMap(t=>[t.houseId,t.gunId]).filter(x=>x!=null)).size};
  }))`));
  for(const r of result){assert(r.ok,`${r.key}: 静止姿勢の三角形・色・表裏が一致`);count++;}
  check('全砲塔の行列式+1・表面材質・逆行列',`Object.values(shipRigs).every(r=>r.turrets.every(t=>Math.abs(t.M.determinant()-1)<1e-5&&new THREE.Matrix4().multiplyMatrices(t.M,t.Mi).elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-5)))&&shipMeshes.every(m=>m.bb.material.side===THREE.FrontSide)`);
  check('砲塔と艦体は未使用時に網を確保しない',`turretMeshes.every(m=>m.size===0)&&shipHullMeshes.every(m=>Object.keys(m).length===0)`);
  check('的のない静止艦は全体1インスタンス',`(drawShip(testFleet,testShip,'bb',.05,0),shipMeshes[0].bb.count===1&&!testShip.tur&&turretMeshes[0].size===0)`);
  check('左前上の的へ主砲が向く',`(()=>{testFleet.fireTarget=testTarget;for(let i=0;i<100;i++){testClear();drawShip(testFleet,testShip,'bb',.05,0);}return testShip.tur.some((s,i)=>{const t=shipRigs.bb.turrets[i];return t.arc<Math.PI&&s.yaw<-.1&&s.el>t.built+.05&&Math.abs(s.yaw)<=t.arc;})&&shipHullMeshes[0].bb.count===1&&shipMeshes[0].bb.count===0;})()`);
  check('dt 0で照準は止まる',`(()=>{const before=JSON.stringify(testShip.tur);testTarget.ships[0].pos.set(4,8,8);drawShip(testFleet,testShip,'bb',0,0);return before===JSON.stringify(testShip.tur);})()`);
  check('狙いの逆行列は艦1隻に1回だけ',`(()=>{let n=0;const invert=THREE.Matrix4.prototype.invert;THREE.Matrix4.prototype.invert=function(){n++;return invert.call(this);};try{drawShip(testFleet,testShip,'bb',.05,0);}finally{THREE.Matrix4.prototype.invert=invert;}return n===1;})()`);
  check('遠距離は全体1インスタンスでも角度を進める',`(()=>{camera.position.set(0,0,1000);testView();for(let i=0;i<100;i++){testClear();drawShip(testFleet,testShip,'bb',.05,0);}return shipMeshes[0].bb.count===1&&shipHullMeshes[0].bb.count===0&&testShip.tur.some(s=>s.yaw>.1);})()`);
  check('画面外は全体1インスタンスでも角度を進める',`(()=>{camera.position.set(0,0,8);camera.lookAt(0,0,16);testView();testTarget.ships[0].pos.set(-4,3,8);for(let i=0;i<100;i++){testClear();drawShip(testFleet,testShip,'bb',.05,0);}return shipMeshes[0].bb.count===1&&shipHullMeshes[0].bb.count===0&&testShip.tur.some(s=>s.yaw<-.1);})()`);
  check('分割しない艦も狙った砲口から発射する',`shipMuzzle(testFleet,testShip).distanceTo(testShip.pos)>.1`);
  check('的がなくなると同じ速さで静止姿勢へ戻る',`(()=>{testFleet.fireTarget=null;for(let i=0;i<150;i++){testClear();drawShip(testFleet,testShip,'bb',.05,0);}return testShip.tur.every((s,i)=>Math.abs(s.yaw)<1e-3&&Math.abs(s.el-shipRigs.bb.turrets[i].built)<1e-3)&&shipMeshes[0].bb.count===1;})()`);
  check('的のない静止艦は逆行列・砲塔行列を作らない',`(()=>{let n=0;const invert=THREE.Matrix4.prototype.invert,multiply=THREE.Matrix4.prototype.multiply;THREE.Matrix4.prototype.invert=function(){n++;return invert.call(this);};THREE.Matrix4.prototype.multiply=function(m){n++;return multiply.call(this,m);};try{drawShip(testFleet,testShip,'bb',.05,0);}finally{THREE.Matrix4.prototype.invert=invert;THREE.Matrix4.prototype.multiply=multiply;}return n===0;})()`);
  check('旋回の制限がある砲塔は後方を横切らない',`(()=>{testFleet.fireTarget=testTarget;testTarget.ships[0].pos.set(1,0,-8);for(let i=0;i<100;i++)drawShip(testFleet,testShip,'bb',.05,0);const previous=testShip.tur.map(s=>s.yaw);testTarget.ships[0].pos.x=-1;drawShip(testFleet,testShip,'bb',.05,0);return testShip.tur.every((s,i)=>{const t=shipRigs.bb.turrets[i];return t.arc>=Math.PI||Math.abs(s.yaw)<=t.arc&&Math.abs(s.yaw-previous[i])<=t.rate*SHIP_TURRET_RATE_K*.05+1e-8;});})()`);
  check('非表示の艦は砲塔・艦体・全体を描かない',`(()=>{testClear();testFleet.fireTarget=testTarget;drawShip(testFleet,testShip,'bb',.05,0,false);return shipMeshes[0].bb.count===0&&Object.values(shipHullMeshes[0]).every(m=>m.count===0)&&[...turretMeshes[0].values()].every(m=>m.count===0);})()`);
  check('艦種ごとの射程・見えていない的・遮蔽でない条件',`(()=>{testFleet.byType={bb:{range:1}};const a=shipTurretTarget(testFleet,testShip,0)===null;delete testFleet.byType;testTarget.seen=false;const b=shipTurretTarget(testFleet,testShip,0)===null;testTarget.seen=true;return a&&b;})()`);
  check('容量が必要な分だけ倍増し既存の行列を保持',`(()=>{const id=shipRigs.bb.turrets[0].gunId;turretMeshes[3].clear();const m=new THREE.Matrix4().makeTranslation(1,2,3);for(let i=0;i<9;i++)turretInstance(3,id,m);const mesh=turretMeshes[3].get(id),out=new THREE.Matrix4();mesh.getMatrixAt(0,out);return mesh.instanceMatrix.count===16&&mesh.count===9&&out.equals(m);})()`);
  check('W.A.S.の3姿勢は頂点色を持ち全チームで形を共有',`['wasFly','wasFlyMove','wasFlyFire'].every(k=>!!wasSpaceGeos[k].attributes.color&&craftMeshes.every(m=>m[k].material.vertexColors&&m[k].geometry===wasSpaceGeos[k]))&&!craftMeshes[0].ftr.material.vertexColors`);
  check('移動W.A.S.の外接箱の対角は旧形と同じ',`(()=>{const a=wasSpaceGeos.wasFlyMove,b=craftGeo('was'),x=new THREE.Vector3(),y=new THREE.Vector3();a.computeBoundingBox();b.computeBoundingBox();return Math.abs(a.boundingBox.getSize(x).length()-b.boundingBox.getSize(y).length())<1e-6;})()`);
  console.log(`| 宇宙砲塔・形・描画（ブラウザ不要） | ${count}/${count} 成功 |`);
  return result;
}
if(require.main===module)nodeChecks();
module.exports={nodeChecks,createShipContext};
