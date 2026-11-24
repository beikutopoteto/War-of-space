/* #440 実地図監査。node tools/town-cover-audit.cjs [before|after|both]
   before は HEAD の地上戦関連ファイルをブラウザへの応答だけ差し替える（作業ファイルは戻さない）。
   凸包は両版とも現在の groundTownZones。before の判定・倍率・処理時間は HEAD の実関数。
   直射は射程を除いた遮蔽を調べるため ignoreRange:true。時間はウォームアップ後5回の中央値。
   出力: test-results/town-cover/audit-{before,after}.json, audit.md */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {openGame,ROOT}=require('./browser.cjs');
const OUT=path.join(ROOT,'test-results/town-cover');
const baseline=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const changed=['data/ground-rules.js','battle/ground-sight.js','battle/ground-ballistics.js','battle/ground.js','battle/sim.js','battle/ground-strike.js','battle/ground-supply.js','battle/ground-aa.js','battle/ground-drill.js'];
const sightSource=fs.readFileSync(path.join(ROOT,'battle/ground-sight.js'),'utf8');
const zoneSource=sightSource.slice(sightSource.indexOf('let groundTownSource='),sightSource.indexOf('function groundBuildingsBlock('));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
function auditMap(opId){
  const zones=groundTownZones(),rows=[];
  for(const zone of zones){
    // 町の中心は外接箱の中心。0.3半径の線も同じ向きの平行線。
    const h=zone.hull,cx=(zone.minX+zone.maxX)/2,cz=(zone.minZ+zone.maxZ)/2;
    const radius=Math.max(zone.maxX-zone.minX,zone.maxZ-zone.minZ)/2;
    const area=Math.abs(h.reduce((n,p,i)=>{const q=h[(i+1)%h.length];return n+p[0]*q[1]-q[0]*p[1];},0))/2/GROUND_SCALE**2;
    const blockedSight=[0,0,0],blockedDirect=[0,0,0],escapes=[];
    for(let i=0;i<36;i++)for(let kind=0;kind<3;kind++){
      const angle=i*Math.PI/36,dx=Math.cos(angle),dz=Math.sin(angle),offset=kind===1?.3*radius:0;
      const x=cx-dz*offset,z=cz+dx*offset,far=100*GROUND_SCALE;
      const lineA={x:x-dx*far,z:z-dz*far},lineB={x:x+dx*far,z:z+dz*far};
      const interval=groundTownInterval(lineA,lineB,zone);assertInterval(interval);
      // 中心・ずらし線は凸包の境界のそれぞれ0.8km外。3km線は中心の両側3km。
      const from=kind===2?-3*GROUND_SCALE:-far+2*far*interval[0]-.8*GROUND_SCALE;
      const to=kind===2?3*GROUND_SCALE:-far+2*far*interval[1]+.8*GROUND_SCALE;
      const p=new THREE.Vector3(x+dx*from,0,z+dz*from),q=new THREE.Vector3(x+dx*to,0,z+dz*to);
      if(![p.x,p.z,q.x,q.z].every(Number.isFinite))throw Error('監査の端点が有限値でない');
      p.y=groundSightHeight(p.x,p.z)+groundSightRules().eyeHeight;q.y=groundSightHeight(q.x,q.z)+groundSightRules().eyeHeight;
      const sightClear=groundClearLine(p,q);
      const f={groundKind:'vehicle',band:'ground',alive:true,pos:new THREE.Vector3(p.x,groundHeight(p.x,p.z),p.z)};
      const shot=groundBallisticSolution(f,q,{ignoreRange:true});
      if(!sightClear)blockedSight[kind]++;
      if(!shot.clear)blockedDirect[kind]++;
      if(sightClear||shot.clear){
        const span=groundTownInterval(p,q,zone),n=span?Math.max(1,Math.ceil((span[1]-span[0])*p.distanceTo(q)/.01)):0;
        let min=Infinity,max=-Infinity,minAt=null;
        const probes=[];
        if(span){
          for(let j=0;j<=n;j++)probes.push(span[0]+(span[1]-span[0])*j/n);
          // 地面は三角形の中では線形。格子線と対角線の交点も含め、最小差を正確に取る。
          const g=groundSightGrid(),vx=q.x-p.x,vz=q.z-p.z,cuts=groundBallisticGridCuts(p.x,p.z,vx,vz,g.stepX,g.originX,g.originZ,g.stepZ);
          probes.push(...cuts);
          for(let j=1;j<cuts.length;j++){
            const mid=(cuts[j-1]+cuts[j])/2,ix=Math.floor((p.x+vx*mid-g.originX)/g.stepX),iz=Math.floor((p.z+vz*mid-g.originZ)/g.stepZ),den=vx/g.stepX+vz/g.stepZ;
            if(Math.abs(den)>1e-12){const u=(ix+iz+1-(p.x-g.originX)/g.stepX-(p.z-g.originZ)/g.stepZ)/den;if(u>cuts[j-1]&&u<cuts[j])probes.push(u);}
          }
        }
        for(const u of probes.filter(u=>u>=span[0]&&u<=span[1])){
          const wx=p.x+(q.x-p.x)*u,wz=p.z+(q.z-p.z)*u;
          const gap=p.y+(q.y-p.y)*u-groundSightHeight(wx,wz)-zone.roof;
          if(gap<min){min=gap;minAt={x:wx,z:wz};}max=Math.max(max,gap);
        }
        const endpointsInside=groundInsideTown(p,zone)||groundInsideTown(q,zone);
        escapes.push({kind:['center','offset','3km'][kind],angleDeg:i*5,sightClear,directClear:shot.clear,directReason:shot.reason,
          cause:!span?'outside-hull':endpointsInside?'endpoint-inside':min>=0?'above-roof':'unexpected',
          minAboveRoofWorld:min,maxAboveRoofWorld:max,minAboveRoofM:min*1000/GROUND_SCALE,maxAboveRoofM:max*1000/GROUND_SCALE,minAt,p,q});
      }
    }
    const site=groundSites.find(s=>s.id===zone.settlement);let covered=0,samples=0;
    if(site)for(let ix=-50;ix<=50;ix++)for(let iz=-50;iz<=50;iz++){
      if(ix*ix+iz*iz>2500)continue;
      const x=site.pos.x+ix/50*site.captureRadius,z=site.pos.z+iz/50*site.captureRadius;samples++;
      const cover=groundDamageFactor({band:'ground',groundKind:'infantry',pos:{x,z}});
      if((cover.h??cover)<1)covered++;
    }
    rows.push({id:zone.settlement,areaKm2:area,roofWorld:zone.roof,roofM:zone.roof*1000/GROUND_SCALE,blockedSight,blockedDirect,
      coverage:samples?100*covered/samples:null,covered,samples,escapes});
  }
  function assertInterval(interval){if(!interval)throw Error('町の中心/ずらし線が凸包と交差しない');}
  return {opId,rows};
}
async function measurePhase(phase){
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    if(phase==='before')for(const file of changed){
      const source=execFileSync('git',['show',baseline+':'+file],{cwd:ROOT,encoding:'utf8'});
      await page.route('**/'+file,route=>route.fulfill({body:source,contentType:'application/javascript'}));
    }
    // 両版とも再読み込みして同じ起点から測る。
    await page.reload();await page.evaluate(()=>setSpeed(0));
    if(phase==='before'){
      await page.evaluate(()=>{window.WOS_GROUND_RULES.combat.townMargin=.4;});
      await page.evaluate(zoneSource);
    }
    const maps=[];
    for(const opId of ['baikonur','groundExercise2']){
      const timing=await page.evaluate(opId=>{
        reset({op:opId});setSpeed(0);groundUpdateSight();groundFogDraw(true);
        const setupMs=[],sightMs=[];
        for(let i=0;i<5;i++){
          let start=performance.now();reset({op:opId});setSpeed(0);setupMs.push(performance.now()-start);
          start=performance.now();groundUpdateSight();groundFogDraw(true);sightMs.push(performance.now()-start);
        }
        return {setupMs,sightMs};
      },opId);
      const result=await page.evaluate(auditMap,opId);
      result.timing={...timing,setupMedianMs:median(timing.setupMs),sightMedianMs:median(timing.sightMs)};
      maps.push(result);console.log(JSON.stringify({phase,opId,...result.timing,rows:result.rows.map(r=>({id:r.id,blockedSight:r.blockedSight,blockedDirect:r.blockedDirect,coverage:r.coverage,escapes:phase==='after'?r.escapes:r.escapes.length}))}));
    }
    if(errors.length)throw Error(errors.join('\n'));
    const result={phase,baseline,maps};fs.writeFileSync(path.join(OUT,'audit-'+phase+'.json'),JSON.stringify(result,null,2)+'\n');return result;
  }finally{await browser.close();}
}
function report(){
  const files=['before','after'].map(phase=>path.join(OUT,'audit-'+phase+'.json'));if(!files.every(f=>fs.existsSync(f)))return;
  const [before,after]=files.map(f=>JSON.parse(fs.readFileSync(f))),lines=['# 町の遮蔽監査','#440 / baseline '+baseline,'','5回の中央値。開く時間はreset全体、視界はgroundUpdateSight + groundFogDraw(true)。','',
    '| 地図 | 開くms 前→後 | 差ms | 視界ms 前→後 | 倍率 |','|---|---:|---:|---:|---:|'];
  const failures=[];
  for(const a of after.maps){const b=before.maps.find(b=>b.opId===a.opId),dt=a.timing.setupMedianMs-b.timing.setupMedianMs,ratio=a.timing.sightMedianMs/b.timing.sightMedianMs;
    lines.push(`| ${a.opId} | ${b.timing.setupMedianMs.toFixed(1)} → ${a.timing.setupMedianMs.toFixed(1)} | ${dt.toFixed(1)} | ${b.timing.sightMedianMs.toFixed(1)} → ${a.timing.sightMedianMs.toFixed(1)} | ${ratio.toFixed(3)} |`);
    if(dt>200||ratio>1.5)failures.push(a.opId+'の処理時間が条件を超えた');
  }
  lines.push('','| 地図 | 町 | 面積km² | 屋根m（表示） | 歩兵遮蔽% 前→後 | 視界遮断 中心/ずらし/3km（各36） | 直射遮断 同左 |','|---|---|---:|---:|---:|---|---|');
  for(const a of after.maps)for(const r of a.rows){const b=before.maps.find(b=>b.opId===a.opId).rows.find(b=>b.id===r.id);
    lines.push(`| ${a.opId} | ${r.id} | ${r.areaKm2.toFixed(2)} | ${r.roofM.toFixed(1)} | ${r.coverage===null?'占領円なし':b.coverage.toFixed(1)+' → '+r.coverage.toFixed(1)} | ${r.blockedSight.join('/')} | ${r.blockedDirect.join('/')} |`);
    if(r.coverage!==null&&Math.abs(r.coverage-b.coverage)>15)failures.push(a.opId+' '+r.id+' 遮蔽の割合が15ポイント以上変化');
    for(const e of r.escapes){lines.push('',`${a.opId} ${r.id} ${e.kind} ${e.angleDeg}°: ${e.cause}。屋根との差 ${e.minAboveRoofWorld.toFixed(6)}〜${e.maxAboveRoofWorld.toFixed(6)} world（${e.minAboveRoofM.toFixed(3)}〜${e.maxAboveRoofM.toFixed(3)} m）。`);if(!['above-roof','endpoint-inside'].includes(e.cause))failures.push(a.opId+' '+r.id+' '+e.cause);}
  }
  fs.writeFileSync(path.join(OUT,'audit.md'),lines.join('\n')+'\n');
  assert.equal(failures.length,0,failures.join('\n'));
}
(async()=>{
  const phase=process.argv[2]||'both';if(!['before','after','both'].includes(phase))throw Error('before|after|both');
  fs.mkdirSync(OUT,{recursive:true});for(const p of phase==='both'?['before','after']:[phase])await measurePhase(p);report();
})().catch(error=>{console.error(error);process.exitCode=1;});
