/* node tests/ground-path.cjs: ブラウザ不要。smoke と同じ渡河・浅瀬・到着時間を確認する。 */
function crossingCases(){
  const results=[],check=(name,ok,detail)=>results.push({name,ok,detail});
  const trace=(kind,a,b,path)=>{
    const start=groundPoint(...a),dest=groundPoint(...b);
    const f={pos:start.clone(),heading:new THREE.Vector3(),march:new THREE.Vector3(),groundKind:kind,speed:1,order:{path:path===undefined?groundPath(start,dest,kind):path}};
    if(!f.order.path)return {arrived:false};
    let river=false,ford=false,bridge=false,safe=true,steps=0,done=false;
    const sample=()=>{
      const x=f.pos.x/4+24,y=18-f.pos.z/4;
      river ||= groundRiverFactor(x,y,kind)<1;
      ford ||= WOS_TERRAIN.exercise2.objects.fords.some(p=>Math.hypot(x-p.x,y-p.y)<.5);
      bridge ||= WOS_TERRAIN.exercise2.objects.bridges.some(p=>Math.hypot(x-p.x,y-p.y)<.9);
      safe &&= groundPass(x,y,kind);
    };
    sample();
    while(!done&&steps<100000){done=groundFollow(f,.01);steps++;sample();}
    return {arrived:done&&f.pos.distanceTo(dest)<.001,river,ford,bridge,safe,seconds:steps*.01};
  };
  const vehicle=trace('vehicle',[21,33],[25,33]);
  check('兵科別の渡河: 戦車は通れない川を避けて浅瀬で到着',vehicle.arrived&&vehicle.safe&&vehicle.ford&&!vehicle.river&&!vehicle.bridge,vehicle);
  // 候補を同じ兵科・速度で実際に進め、格子の形や固定の到着秒に期待値を結びつけない。
  // 同じ兵科の橋・浅瀬だけの経路と、川を横切る直線を候補にする。
  for(const [kind,y] of [['infantry',26],['scout',26],['infantry',24]]){
    const a=[21,y],b=[26,y],start=groundPoint(...a),dest=groundPoint(...b);
    const chosen=trace(kind,a,b),dry=trace(kind,a,b,groundPath(start,dest,kind,true));
    const direct=trace(kind,a,b,{points:[start,dest],atIndex:1,s:0});
    const valid=[chosen,dry,direct].every(p=>p.arrived&&p.safe);
    check(`兵科別の渡河: ${kind}・y=${y}は到着時間の短い経路を選ぶ`,valid&&direct.river&&!dry.river&&chosen.seconds<=Math.min(dry.seconds,direct.seconds)+.1,{chosen,dry,direct});
    // 同じ両岸でも遅い歩兵は橋、斥候は渡河。y=24 は整形前後で優劣が変わる回帰例。
    const detour=kind==='infantry';
    check(`兵科別の渡河: ${kind}・y=${y}は${detour?'橋へ迂回':'川を渡る'}`,valid&&(detour?chosen.bridge&&!chosen.river&&dry.seconds<direct.seconds:chosen.river&&!chosen.bridge&&direct.seconds<dry.seconds),{chosen:chosen.seconds,dry:dry.seconds,direct:direct.seconds});
  }
  const p=groundPoint(23.47,26),factor=kind=>groundFactor(p.x,p.z,kind);
  const travel=kind=>{
    const f={pos:p.clone(),heading:new THREE.Vector3(),march:new THREE.Vector3(),groundKind:kind,speed:1,order:{path:{points:[p.clone(),p.clone().add(new THREE.Vector3(.5,0,0))],atIndex:1,s:0}}};
    groundFollow(f,.01);return f.pos.x-p.x;
  };
  const factors={vehicle:factor('vehicle'),infantry:factor('infantry'),scout:factor('scout'),air:factor('air')};
  const infantryTravel=travel('infantry'),scoutTravel=travel('scout');
  check('兵科別の渡河・速度: 通行不可／0.2倍／0.5倍／航空は等速',factors.vehicle===0&&factors.infantry===.2&&factors.scout===.5&&factors.air===1&&Math.abs(infantryTravel-.002)<1e-9&&Math.abs(scoutTravel-.005)<1e-9,{...factors,infantryTravel,scoutTravel});
  return results;
}
module.exports={crossingCases};
if(require.main===module){
  const {run}=require('./ground-landing.cjs').createGroundContext();
  const results=run(`(${crossingCases.toString()})()`);
  for(const c of results)console.log(`| ${c.name} | ${c.ok?'成功':'失敗'} | ${JSON.stringify(c.detail)} |`);
  require('assert/strict').equal(results.filter(c=>!c.ok).length,0,'渡河・経路の全確認が成功');
}
