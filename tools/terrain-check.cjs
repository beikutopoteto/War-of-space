/* 地形データの検査。ゲームの判定は変更せず Node VM / --perf の Chromium で実行する。 */
// 仮（2026-11-14 の baikonur2 の実測×1.5）。cold=初回、warm=2〜10回目。
const PERF_LIMITS = {
 path:{medianMs:89.1,maxMs:213.3,coldMs:213.3,warmMedianMs:87.6,warmMaxMs:111.15},
 sight:{medianMs:.45,maxMs:2.4,coldMs:2.4,warmMedianMs:.45,warmMaxMs:.9}
};
const {createGroundContext}=require('../tests/ground-landing.cjs');
const IDS=['exercise2','baikonur2','field150','field300'];
const KINDS=['vehicle','infantry','was','scout','apc','engineer'];
function createContext(){
 const c=createGroundContext();c.run(c.read('data/terrain/wide-fields.js'));return c;
}
// 準備画面と同じ groundTutorial の上書きも含める。作戦のない地図だけ名前を使う。
function headquarters(c,id){
 const operations=Array.from(c.ctx.WOS_DATA.operations).flatMap(o=>[o,...(o.groundTutorial?[{...o,...o.groundTutorial,id:'tutorial2'}]:[])]).filter(o=>o.ground===id);
 if(operations.length)return operations.filter(o=>o.groundHQ).map(o=>({operation:o.id,from:o.groundHQ[0],to:o.groundHQ[1],overrides:o.groundRuleOverrides}));
 const sites=c.ctx.WOS_TERRAIN[id].sites.filter(s=>s.name.includes('本営')),pairs=[];
 for(let i=0;i<sites.length;i++)for(let j=i+1;j<sites.length;j++)pairs.push({operation:'作戦なし（本営名）',from:sites[i].id,to:sites[j].id});
 return pairs;
}
// この関数だけを VM に渡す。地形の生成・通行・架橋は実際のゲーム関数を使う。
function inspectTerrain(pairs,sections){
 const d=groundData(),cell=d.meta.cellKm,roads=d.objects.roads||d.roadNetwork?.lines||[],half=groundRuleSet().capture.roadWidthKm/2;
 const rows=[],result={id:d.meta.id,rows,issues:[]};
 const enabled=name=>!sections||sections.includes(name);
 const add=(check,status,count,detail)=>{rows.push({check,status,count,detail});if(status!=='合格')result.issues.push({check,status,detail});};
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 function samples(points,step){
  const out=[],lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
  const total=lengths.at(-1);let segment=1;
  const at=s=>{while(segment<points.length-1&&lengths[segment]<s)segment++;const a=points[segment-1],b=points[segment],len=lengths[segment]-lengths[segment-1],t=len?(s-lengths[segment-1])/len:0;return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,alongKm:s};};
  for(let i=0;i*step<total;i++)out.push(at(i*step));out.push(at(total));return out;
 }
 if(enabled('sites')){
  result.sites=d.sites.map(s=>{const dist=Math.min(Infinity,...roads.map(r=>groundDistance(s.x,s.y,r.points)));return {id:s.id,name:s.name,x:s.x,y:s.y,distance:dist,center:dist<=half,radius:dist<=s.radiusKm+half};});
  for(const s of result.sites){add('拠点中心 '+s.id,s.center?'合格':s.radius?'注意':'不合格',1,{...s});add('拠点半径 '+s.id,s.radius?'合格':'不合格',1,{...s});}
 }
 if(enabled('bridges')){
  result.bridges=d.objects.bridges.map(b=>{const river=d.water.rivers.find(r=>r.id===b.river),at=river&&groundRiverAt(b.x,b.y,river);return {id:b.id,river:b.river,x:b.x,y:b.y,distance:at?.dist??null,width:at?.width??null,valid:!!at&&at.dist<=at.width/2};});
  for(const b of result.bridges)add('橋 '+b.id,b.valid?'合格':'不合格',1,b);
 }
 if(enabled('roads')||enabled('paths')){
  result.headquarters=[];
  if(!pairs.length)add('本営の組','不合格',0,{reason:'作戦の groundHQ または本営名の組がない'});
  for(const pair of pairs){
   op={ground:'__terrain_check',groundRuleOverrides:pair.overrides};rebuildGroundRuleSet();
   const a=d.sites.find(s=>s.id===pair.from),b=d.sites.find(s=>s.id===pair.to),label=pair.operation+' '+pair.from+'→'+pair.to;
   const entry={...pair};result.headquarters.push(entry);
   if(!a||!b){add('本営 '+label,'不合格',0,{reason:'本営に指定した拠点がない'});continue;}
   if(enabled('roads')){
    const points=roads.flatMap(r=>samples(r.points,.2)).filter(p=>groundPass(p.x,p.y,'vehicle')),bins=new Map(),edges=points.map(()=>[]),size=.3;
    for(let i=0;i<points.length;i++){
     const p=points[i],gx=Math.floor(p.x/size),gy=Math.floor(p.y/size);
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const j of bins.get((gx+dx)+','+(gy+dy))||[])if(Math.hypot(p.x-points[j].x,p.y-points[j].y)<=size+1e-9){edges[i].push(j);edges[j].push(i);}
     const key=gx+','+gy;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);
    }
    const queue=[],seen=new Set();for(let i=0;i<points.length;i++)if(Math.hypot(points[i].x-a.x,points[i].y-a.y)<=a.radiusKm){queue.push(i);seen.add(i);}
    let connected=false;for(let head=0;head<queue.length;head++){const i=queue[head],p=points[i];if(Math.hypot(p.x-b.x,p.y-b.y)<=b.radiusKm){connected=true;break;}for(const j of edges[i])if(!seen.has(j)){seen.add(j);queue.push(j);}}
    entry.road={connected,points:points.length};add('本営道路 '+label,connected?'合格':'不合格',connected?1:0,entry.road);
   }
   if(enabled('paths')){
    entry.paths=[];for(const kind of ['vehicle','infantry','was','scout','apc','engineer']){
     const from=groundPoint(a.x,a.y),to=groundPoint(b.x,b.y),path=groundPath(from,to,kind),dry=path&&groundPath(from,to,kind,true);
     const p={kind,found:!!path,lengthKm:path?path.L/GROUND_SCALE:null,bridgeFordOnly:!!dry,bridgeFordLengthKm:dry?dry.L/GROUND_SCALE:null};entry.paths.push(p);add('通行 '+label+' '+kind,path?'合格':'不合格',path?1:0,p);
    }
   }
  }
  op={ground:'__terrain_check'};rebuildGroundRuleSet();
 }
 if(enabled('engineering')){
  result.engineering=d.water.rivers.map(r=>{
   const intervals=[],rejected={width:0,bridge:0,banks:0,outside:0,other:0};let interval=null,accepted=0;
   for(const p of samples(r.points,cell)){
    const plan=groundBridgePlan(groundPoint(p.x,p.y));
    if(!plan.reason){accepted++;if(!interval){interval={start:p,end:p,samples:0};intervals.push(interval);}interval.end=p;interval.samples++;}
    else {interval=null;const key=plan.reason.includes('川幅')?'width':plan.reason.includes('橋がある')?'bridge':plan.reason.includes('足場')?'banks':plan.reason.includes('盤の外')?'outside':'other';rejected[key]++;}
   }
   const e={river:r.id,intervals,accepted,rejected};add('架橋 '+r.id,intervals.length?'合格':'注意',intervals.length,e);return e;
  });
 }
 if(enabled('beaches')){
  const {cols,rows:height}=d.terrain,seaCells=[],beaches={infantry:new Set(),vehicle:new Set()};
  for(let row=0;row<height;row++)for(let col=0;col<cols;col++)if(groundPass((col+.5)*cell,(row+.5)*cell,'sea'))seaCells.push(row*cols+col);
  for(const index of seaCells){const col=index%cols,row=Math.floor(index/cols);for(const kind of ['infantry','vehicle']){
   let found=false;for(let dy=-1;dy<=1&&!found;dy++)for(let dx=-1;dx<=1&&!found;dx++)if((dx||dy)&&groundPass((col+dx+.5)*cell,(row+dy+.5)*cell,kind))found=true;
   if(found)beaches[kind].add(index);
  }}
  result.beaches={seaCells:seaCells.length};
  for(const kind of ['infantry','vehicle']){
   const remaining=new Set(beaches[kind]),intervals=[];
   while(remaining.size){const start=remaining.values().next().value,queue=[start];remaining.delete(start);let sx=0,sy=0;
    for(let head=0;head<queue.length;head++){const i=queue[head],col=i%cols,row=Math.floor(i/cols);sx+=(col+.5)*cell;sy+=(row+.5)*cell;
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!(dx||dy)||col+dx<0||col+dx>=cols||row+dy<0||row+dy>=height)continue;const next=(row+dy)*cols+col+dx;if(remaining.delete(next))queue.push(next);}
    }
    intervals.push({cells:queue.length,x:sx/queue.length,y:sy/queue.length});
   }
   const b={cells:beaches[kind].size,intervals,note:seaCells.length?'8近傍で連結':'海なし'};result.beaches[kind]=b;add('浜 '+kind,seaCells.length&&!b.cells?'注意':'合格',intervals.length,b);
  }
 }
 if(enabled('coverage')){
  const xs=d.display.board.map(p=>p[0]),ys=d.display.board.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),step=cell/2;
  const coverage={sampleStepKm:step,samples:0,gaps:0,examples:[],edgeGaps:0,corners:[]};
  const land=(x,y)=>x>=0&&x<d.meta.widthKm&&y>=0&&y<d.meta.heightKm;
  for(let row=0;minY+row*step<=maxY+1e-9;row++)for(let col=0;minX+col*step<=maxX+1e-9;col++){
   const x=minX+col*step,y=minY+row*step;if(!groundInside(x,y,d.display.board))continue;coverage.samples++;
   if(!land(x,y)&&!groundInside(x,y,d.water.sea)){coverage.gaps++;if(coverage.examples.length<10)coverage.examples.push({x,y});if(groundDistance(x,y,[...d.display.board,d.display.board[0]])<=cell)coverage.edgeGaps++;}
  }
  // 外接長方形の四隅。盤外かどうかも併記し、陸/海の表示だけで合否を決めない。
  for(const [name,x,y] of [['左下',minX,minY],['右下',maxX,minY],['左上',minX,maxY],['右上',maxX,maxY]])coverage.corners.push({name,x,y,insideBoard:groundInside(x,y,d.display.board),paint:groundInside(x,y,d.water.sea)?'海':land(x,y)?'陸':'隙間'});
  result.coverage=coverage;add('盤と海の塗り',coverage.gaps?'不合格':'合格',coverage.gaps,coverage);add('端1セルの塗り',coverage.edgeGaps?'不合格':'合格',coverage.edgeGaps,{examples:coverage.examples});
 }
 result.summary={合格:rows.filter(r=>r.status==='合格').length,注意:rows.filter(r=>r.status==='注意').length,不合格:rows.filter(r=>r.status==='不合格').length};
 return result;
}
function checkTerrain(c,id,terrain,options={}){
 const pairs=options.pairs||headquarters(c,id);
 c.ctx.checkTerrainInput=terrain||c.ctx.WOS_TERRAIN[id];
 c.ctx.checkTerrainPairs=pairs;c.ctx.checkTerrainSections=options.sections||null;
 c.run(`WOS_TERRAIN.__terrain_check=checkTerrainInput;op={ground:'__terrain_check'};groundTerrainId=null;groundBridges=[];groundBridgeRevision++;rebuildGroundRuleSet();`);
 try{return c.run('('+inspectTerrain.toString()+')(checkTerrainPairs,checkTerrainSections)');}
 finally{c.run('delete WOS_TERRAIN.__terrain_check;groundTerrainId=null;op={ground:"exercise2"};rebuildGroundRuleSet();');}
}
function formatReport(result){
 const lines=['地形 | 検査 | 判定 | 数 | 詳細','--- | --- | --- | --- | ---'];
 for(const [id,r] of Object.entries(result.terrains)){
  for(const row of r.rows)lines.push(`${id} | ${row.check} | ${row.status} | ${row.count} | ${JSON.stringify(row.detail)}`);
  lines.push(`${id} | 合計 | 合格${r.summary.合格} 注意${r.summary.注意} 不合格${r.summary.不合格} | ${r.rows.length} |`);
 }
 if(result.performance)lines.push('重さ '+JSON.stringify(result.performance));return lines.join('\n');
}
async function measurePerformance(){
 const {openGame}=require('./browser.cjs'),{browser,page,errors}=await openGame({width:1600,height:900});
 try{
  const result=await page.evaluate(()=>{
   reset({op:'baikonur'});if(talking)endTalk();setSpeed(0);if(deploying)endDeploy();
   const d=groundData(),a=d.sites.find(s=>s.id===op.groundHQ[0]),b=d.sites.find(s=>s.id===op.groundHQ[1]),from=groundPoint(a.x,a.y),to=groundPoint(b.x,b.y);
   // reset 中の初期探索・視界更新を除き、初回のキャッシュ構築を計測に含める。
   groundPathGrids.delete(d);groundRoadGeometry.delete(d);groundHeightCacheReset();
   const collect=fn=>{const times=[];for(let i=0;i<10;i++){const start=performance.now();fn();times.push(performance.now()-start);}const sorted=times.slice().sort((a,b)=>a-b),warm=times.slice(1).sort((a,b)=>a-b);return {samplesMs:times,medianMs:(sorted[4]+sorted[5])/2,maxMs:sorted[9],coldMs:times[0],warmMedianMs:warm[4],warmMaxMs:warm[8]};};
   const path=collect(()=>{if(!groundPath(from,to,'vehicle'))throw new Error('本営間の車両経路がない');}),sight=collect(()=>groundUpdateSight());
   return {terrain:'baikonur2',operation:'baikonur',rounds:10,path,sight};
  });
  if(errors.length)throw new Error(errors.join('\n'));
  result.limits=PERF_LIMITS;result.status=PERF_LIMITS&&['path','sight'].every(k=>Object.keys(PERF_LIMITS[k]).every(m=>result[k][m]<=PERF_LIMITS[k][m]+1e-6))?'合格':PERF_LIMITS?'不合格':'未校正';
  return result;
 }finally{await browser.close();}
}
async function main(){
 const args=process.argv.slice(2),id=args[0];
 if(!id||!(id==='all'||IDS.includes(id))||args.slice(1).some(a=>!['--json','--perf'].includes(a))){console.error('使い方: node tools/terrain-check.cjs <地形id|all> [--json] [--perf]（重さは baikonur2 の固定場面）');process.exitCode=2;return;}
 const c=createContext(),result={terrains:{}};
 for(const name of id==='all'?IDS:[id])result.terrains[name]=checkTerrain(c,name);
 if(args.includes('--perf'))result.performance=await measurePerformance();
 console.log(args.includes('--json')?JSON.stringify(result,null,2):formatReport(result));
 process.exitCode=Object.values(result.terrains).some(r=>r.summary.不合格)||(result.performance&&result.performance.status!=='合格')?1:0;
}
module.exports={IDS,KINDS,PERF_LIMITS,createContext,headquarters,checkTerrain,formatReport,measurePerformance};
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
