/* CPU only: node tests/ground-path-perf.cjs [--baseline=/absolute/terrain-before.js]
 * Every VM evaluation is bounded. Optional baseline compares exact geometry,
 * costs, lengths and bridge revisions; no browser, terrain edits or disk output.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {createGroundContext}=require('./ground-landing.cjs');
const baselineArg=process.argv.find(a=>a.startsWith('--baseline='));
const contexts=[{name:'current',...createGroundContext()}];
if(baselineArg){
  const ref={name:'baseline',...createGroundContext()};
  const source=fs.readFileSync(baselineArg.slice('--baseline='.length),'utf8');
  const begin=source.indexOf('function groundPath('),marker=source.indexOf('\n// 地形の迂回点とユーザー',begin),end=marker>=0?marker:source.indexOf('\nfunction groundFollow(',begin);
  assert(begin>=0&&end>begin,'baseline must contain groundPath');
  vm.runInContext(source.slice(begin,end),ref.ctx,{timeout:1000});
  contexts.push(ref);
}
const evaluate=(c,code)=>vm.runInContext(code,c.ctx,{timeout:20000});
for(const c of contexts){
  c.dataset=evaluate(c,'JSON.stringify([WOS_TERRAIN,WOS_DATA])');
  evaluate(c,`
    globalThis.pathSnapshot=p=>{
      if(!p)return null;
      if(p.curve.curves){
        if(p.curve.curves.length!==p.points.length-1)throw Error('arrow leg count');
        for(let i=0;i<p.curve.curves.length;i++){
          if(!p.curve.curves[i].v1.equals(p.points[i])||!p.curve.curves[i].v2.equals(p.points[i+1]))throw Error('arrow and actual geometry differ');
        }
      }
      return {points:p.points.map(p=>[p.x,p.y,p.z]),cost:p.cost,L:p.L,revision:p.bridgeRevision};
    };
  `);
}
const cases=[
  ['short',[8,27],[12,27],'vehicle'],
  ['infantry-river',[21,26],[26,26],'infantry'],
  ['scout-river',[21,26],[26,26],'scout'],
  ['infantry-rounding-regression',[21,24],[26,24],'infantry'],
  ['vehicle-ford',[21,33],[25,33],'vehicle'],
  ['long',[7,29],[41,27],'vehicle'],
  // Actual pond corner: both endpoints pass, one orthogonal neighbor is blocked.
  ['diagonal-pond-corner',[9,9.8],[9.4,10.200000000000001],'vehicle'],
  ['pond-detour',[7,10],[12,12],'vehicle'],
  ['sea',[12,5],[17,4],'sea'],
  ['sea-coast-detour',[14,7.6],[17,7.6],'sea'],
  ['air',[8,27],[12,27],'air'],
  ['same-point',[8,27],[8,27],'vehicle'],
  ['blocked-pond',[9,11],[12,12],'vehicle',true],
  ['blocked-river',[23.47,26],[26,26],'vehicle',true],
  ['outside',[-1,27],[12,27],'air',true]
];
let checked=0;
for(const [name,a,b,kind,blocked=false] of cases){
  const results=[];
  for(const c of contexts){
    c.ctx.__case={a,b,kind};
    const start=performance.now();
    const p=evaluate(c,`(()=>{const {a,b,kind}=__case;globalThis.__lastPath=groundPath(groundPoint(...a),groundPoint(...b),kind);return pathSnapshot(__lastPath);})()`);
    const ms=performance.now()-start;
    assert.equal(p===null,blocked,`${name}: expected reachability`);
    if(p){
      assert(Number.isFinite(p.L)&&p.L>=0,`${name}: finite length`);
      assert(p.points.flat().every(Number.isFinite),`${name}: finite geometry`);
      assert(evaluate(c,`__lastPath.points.every(p=>groundPass(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,__case.kind))`),`${name}: passable points`);
      if(kind!=='air')assert(Number.isFinite(p.cost),`${name}: finite cost`);
    }
    results.push(p);
    console.log(JSON.stringify({case:name,version:c.name,ms:+ms.toFixed(3),points:p?.points.length,cost:p?.cost,L:p?.L}));
  }
  if(results.length===2)assert.equal(JSON.stringify(results[0]),JSON.stringify(results[1]),`${name}: exact baseline path`);
  checked++;
}
// Repeated identical requests must observe incomplete/complete/dead bridges,
// revision changes, and reset to a previously seen revision in the same VM.
for(const c of contexts)evaluate(c,`
  globalThis.__bridgePlan=(()=>{const river=WOS_TERRAIN.exercise2.water.rivers.find(r=>r.id==='east'),a=river.points[2],b=river.points[3];return groundBridgePlan(groundPoint((a[0]+b[0])/2,(a[1]+b[1])/2));})();
  if(__bridgePlan.reason)throw Error(__bridgePlan.reason);
  groundBridges=[{...__bridgePlan,complete:false,hp:100}];groundBridgeRevision=0;
`);
const bridgePaths=[];
for(const [phase,mutation] of [
  ['incomplete',''],
  ['complete','groundBridges[0].complete=true;groundBridgeRevision=1;'],
  ['destroyed','groundBridges[0].hp=0;groundBridgeRevision=2;'],
  ['reset','groundBridges=[];groundBridgeRevision=0;']
]){
  const results=contexts.map(c=>evaluate(c,`${mutation}pathSnapshot(groundPath(__bridgePlan.banks[0],__bridgePlan.banks[1],'vehicle'))`));
  assert(results[0],phase+': path found');
  if(results.length===2)assert.equal(JSON.stringify(results[0]),JSON.stringify(results[1]),phase+': exact baseline bridge path');
  bridgePaths.push(results[0]);checked++;
}
assert(bridgePaths[1].cost<bridgePaths[0].cost,'completed bridge is faster');
assert.equal(JSON.stringify(bridgePaths[0]),JSON.stringify(bridgePaths[3]),'reset cannot reuse completed bridge');
assert.equal(bridgePaths[2].cost,bridgePaths[0].cost,'destroyed bridge restores detour');
const current=contexts[0];
assert(evaluate(current,`(()=>{
  const start=groundPoint(8,27),dest=groundPoint(12,27),path=groundPath(start,dest,'vehicle');
  const f={pos:start.clone(),heading:new THREE.Vector3(),march:new THREE.Vector3(),groundKind:'vehicle',speed:1,order:{path}};
  let done=false;for(let i=0;i<2000&&!done;i++){done=groundFollow(f,.05);if(!groundPass(f.pos.x/4+24,18-f.pos.z/4,'vehicle'))return false;}
  return done&&f.pos.distanceTo(dest)<1e-6;
})()`),'actual movement arrives safely on displayed path');
for(const c of contexts)assert.equal(evaluate(c,'JSON.stringify([WOS_TERRAIN,WOS_DATA])'),c.dataset,'datasets and unit stats preserved');
console.log(`PASS ${checked} path/bridge cases, arrow geometry, actual movement, unchanged datasets${baselineArg?', exact before/after comparison':''}`);
