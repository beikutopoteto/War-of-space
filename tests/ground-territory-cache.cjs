/* CPU-only pixel equivalence and geometry invalidation; node tests/ground-territory-cache.cjs */
const legacySource="function groundInfluenceAt(x,y){\n  let site=null, weight=Infinity;\n  for(const s of groundSites){const ratio=Math.hypot(x-s.x,y-s.y)/s.radiusKm;if(ratio<=1&&ratio<weight){site=s;weight=ratio;}}\n  if(site) return site;\n  if(groundSupplyActive()&&groundSupplyNet)return groundRoadAt(x,y);\n  let distance=WOS_TERRAIN[op.ground].capture.roadWidthKm/2;\n  for(const section of groundTerritory.sections){const d=groundDistance(x,y,section.path);if(d<distance){site=section.site;distance=d;}}\n  return site;\n}\nfunction groundPaintTerritory(){\n  const t=groundTerritory, key=groundSites.map(s=>`${s.knownOwner}:${s.knownContested}`).join('|')+'/'+(groundSupplyActive()?groundSupplyNet?.edges.map(e=>`${e.knownOwner}:${e.knownContested}`).join('|'):'');\n  if(!t||t.key===key)return; t.key=key;\n  const d=WOS_TERRAIN[op.ground],ctx=t.canvas.getContext('2d'),img=ctx.createImageData(480,360),colors=[[75,160,225],[230,85,72],[160,168,165]];\n  for(let py=0;py<360;py++)for(let px=0;px<480;px++){\n    const x=(px+.5)/10,y=36-(py+.5)/10;\n    if(!groundInside(x,y,d.display.board)||groundInside(x,y,d.water.sea))continue;\n    const s=groundInfluenceAt(x,y); if(!s)continue;\n    const known=s.circle||s,stripe=known.knownContested&&(px+py)%12<3, color=stripe?[238,225,183]:colors[known.knownOwner??2],k=(py*480+px)*4;\n    img.data.set([...color,stripe?190:102],k); // \u540c\u3058\u8ecd\u306e\u5186\u3068\u5e2f\u30821\u753b\u7d201\u56de\u3060\u3051\u3002\u91cd\u306a\u3063\u3066\u3082\u6fc3\u304f\u306a\u3089\u306a\u3044\u3002\n  }\n  ctx.putImageData(img,0,0);t.texture.needsUpdate=true;\n}\n";

const assert=require('node:assert/strict'),vm=require('node:vm');
function checks(){
  const {ctx}=require('./ground-landing.cjs').createGroundContext();
  const run=s=>vm.runInContext(s,ctx,{timeout:20000});
  run(legacySource.replaceAll('groundInfluenceAt','legacyGroundInfluenceAt').replaceAll('groundPaintTerritory','legacyGroundPaintTerritory'));
  run(`
    op={ground:'exercise2',groundHQ:{0:'A',1:'B'}};
    globalThis.__realTerrain=WOS_TERRAIN.exercise2;
    WOS_TERRAIN.exercise2={...__realTerrain};globalThis.__d=WOS_TERRAIN.exercise2;
    __d.display={...__d.display,board:[[0,0],[18,0],[18,36],[0,36]]};
    __d.water={...__d.water,sea:[[0,0],[10,0],[10,5],[0,5]]};
    groundSites=[{id:'A',x:4,y:15,radiusKm:2,knownOwner:0,knownContested:true,owner:1},
      {id:'B',x:7,y:15,radiusKm:4,knownOwner:1,knownContested:false,owner:0}];
    groundSupplyNet={edges:[
      {path:[[1,24.5],[16,24.5]],knownOwner:0,knownContested:true,owner:1},
      {path:[[1,25.5],[16,25.5]],knownOwner:1,knownContested:false,owner:0},
      {path:[[0,2],[17,20],[5,32]],knownOwner:undefined,knownContested:false,owner:1},
      {path:[[0,9],[17,9]],circle:groundSites[1],knownOwner:0,knownContested:true,owner:0}]};
    globalThis.__writes=0;globalThis.__image=null;
    globalThis.__canvas={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData:img=>{__image=img.data;__writes++;}};
    groundTerritory={key:null,texture:{},canvas:{width:480,height:360,getContext:()=>__canvas},sections:[
      {path:[[1,24.5],[16,24.5]],site:groundSites[0]},
      {path:[[1,25.5],[16,25.5]],site:groundSites[1]}]};
  `);
  let count=0;
  const ok=(name,condition)=>{assert.equal(condition,true,name);count++;console.log(JSON.stringify({test:name,ok:true}));};
  const image=()=>Buffer.from(run('__image'));
  const equivalent=name=>{
    run('groundTerritory.key=null;legacyGroundPaintTerritory()');const expected=image();
    run('groundTerritory.key=null;groundPaintTerritory()');
    assert.deepEqual(image(),expected,name);ok(name,true);
  };
  equivalent('all 172800 pixels: overlap, hatching, sea, polyline and circle references');
  ok('site normalized-distance tie keeps original order',run('groundInfluenceAt(5,15)===groundSites[0]&&legacyGroundInfluenceAt(5,15)===groundSites[0]'));
  ok('road distance tie keeps original order',run('groundInfluenceAt(14,25)===groundSupplyNet.edges[0]&&legacyGroundInfluenceAt(14,25)===groundSupplyNet.edges[0]'));
  ok('road boundary epsilon matches legacy',run('[.625,.625+5e-9,.625+2e-8].every(d=>groundInfluenceAt(14,25.5+d)===legacyGroundInfluenceAt(14,25.5+d))'));
  run('globalThis.__pixels=groundTerritoryPixels;globalThis.__spatial=groundInfluenceCache');
  const hidden=image();
  run('groundSites.forEach(s=>{s.owner=1-s.owner;s.contested=!s.contested});groundSupplyNet.edges.forEach(e=>{e.owner=1-e.owner;e.contested=true});groundTerritory.key=null;groundPaintTerritory()');
  assert.deepEqual(image(),hidden);
  ok('unseen owner/contested changes never affect pixels or rebuild geometry',run('groundTerritoryPixels===__pixels&&groundInfluenceCache===__spatial'));
  run('groundSites[0].knownOwner=1;groundSites[0].knownContested=false;groundSupplyNet.edges[2].knownOwner=0;groundSupplyNet.edges[2].knownContested=true');
  equivalent('live known ownership and contested state change exact pixels');
  ok('known ownership reuses membership',run('groundTerritoryPixels===__pixels'));
  run('groundSites[0].knownOwner=undefined;groundSites[0].knownContested=undefined;groundSupplyNet.edges[0].knownOwner=undefined;groundSupplyNet.edges[0].knownContested=undefined');
  equivalent('unknown ownership stays neutral without hatching');
  run('groundBridgeRevision++;groundTerritory.key=null;groundPaintTerritory()');
  ok('bridge revision does not invalidate spatial geometry',run('groundTerritoryPixels===__pixels&&groundInfluenceCache===__spatial'));
  // Warm repaints must not perform any spatial distance/mask searches.
  run(`globalThis.__dist=groundDistance;globalThis.__inside=groundInside;
    globalThis.__distanceCalls=0;globalThis.__insideCalls=0;
    groundDistance=(...args)=>{__distanceCalls++;return __dist(...args)};
    groundInside=(...args)=>{__insideCalls++;return __inside(...args)};
    groundTerritory.key=null;groundPaintTerritory();`);
  ok('forced repaint performs zero road scans and zero board/sea tests',run('__distanceCalls===0&&__insideCalls===0'));
  run('groundDistance=__dist;groundInside=__inside;__writes=0;groundPaintTerritory()');
  ok('unchanged paint key produces no canvas write',run('__writes===0'));
  const invalidation=(name,mutation)=>{
    run('globalThis.__oldSpatial=groundInfluenceCache;globalThis.__oldPixels=groundTerritoryPixels');
    // Do not clear the paint key: geometry changes alone must trigger a rebuild and repaint.
    run(mutation+';__writes=0;groundPaintTerritory()');
    ok(name,run('groundInfluenceCache!==__oldSpatial&&groundTerritoryPixels!==__oldPixels&&__writes===1'));
    equivalent(name+' pixel equivalence');
  };
  invalidation('site array identity', 'groundSites=groundSites.map(s=>({...s}))');
  invalidation('site position and radius', 'groundSites[0].x+=.4;groundSites[0].radiusKm+=.1');
  invalidation('network identity and edge references', 'groundSupplyNet={edges:groundSupplyNet.edges.map(e=>({...e,path:e.path.map(p=>[p[0]+.1,p[1]]),knownOwner:1}))}');
  invalidation('terrain identity', 'WOS_TERRAIN.exercise2={...__d};__d=WOS_TERRAIN.exercise2');
  invalidation('grid identity', '__d.terrain={...__d.terrain}');
  invalidation('grid dimensions', '__d.terrain.cols++');
  invalidation('grid cell storage', '__d.terrain.cells=__d.terrain.cells.slice()');
  invalidation('board polygon identity', '__d.display.board=[[1,1],[16,1],[16,34],[1,34]]');
  invalidation('sea polygon identity', '__d.water.sea=[[0,0],[12,0],[12,7],[0,7]]');
  invalidation('road width', '__d.capture={...__d.capture,roadWidthKm:1.5}');
  invalidation('supply activation', 'op.groundHQ=null');
  ok('inactive road boundary excludes exact half-width',run('groundInfluenceAt(14,26.25)===legacyGroundInfluenceAt(14,26.25)'));
  invalidation('road section identity', 'groundTerritory.sections=groundTerritory.sections.map(s=>({...s,path:s.path.map(p=>[p[0],p[1]+.2])}))');
  run('globalThis.__oldPixels=groundTerritoryPixels;groundTerritory={...groundTerritory};__writes=0;groundPaintTerritory()');
  ok('new territory surface repaints even with unchanged known key',run('groundTerritoryPixels!==__oldPixels&&__writes===1'));
  // Real map: test the first full-resolution build and thousands of legacy membership samples.
  run(`WOS_TERRAIN.exercise2=__realTerrain;op={...WOS_DATA.operations.find(o=>o.id==='baikonur'),ground:'exercise2',groundHQ:{0:'B',1:'F'},groundSites:[{site:'A',owner:null},{site:'B',owner:0},{site:'C',owner:0},{site:'F',owner:1}]};
    groundSites=op.groundSites.map(spec=>({...__realTerrain.sites.find(s=>s.id===spec.site),owner:spec.owner,knownOwner:spec.owner,knownContested:false,contested:false}));
    groundTerritory={key:null,texture:{},canvas:{width:480,height:360,getContext:()=>__canvas},sections:groundRoadSections(__realTerrain.objects.roads,groundSites)};
    groundSupplyBuild();for(const e of groundSupplyNet.edges){e.knownOwner=e.owner;e.knownContested=false;}
    __distanceCalls=0;groundDistance=(...args)=>{__distanceCalls++;return __dist(...args)};
    groundPaintTerritory();groundDistance=__dist;`);
  ok('real map cold build compares local candidates, not all 359 edges per pixel',run('groundSupplyNet.edges.length===359&&__distanceCalls<480*360*359/10'));
  ok('real map sampled memberships and every edge boundary equal legacy',run(`(()=>{
    for(let i=0;i<1024;i++){const x=((i*137)%480+.5)/10,y=36-((i*53)%360+.5)/10;
      if(groundInfluenceAt(x,y)!==legacyGroundInfluenceAt(x,y))return false;}
    for(const e of groundSupplyNet.edges){const a=e.path[0],b=e.path[1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
      for(const offset of [0,.625,.625+5e-9,.625+2e-8]){const x=(a[0]+b[0])/2-dy/len*offset,y=(a[1]+b[1])/2+dx/len*offset;
        if(groundInfluenceAt(x,y)!==legacyGroundInfluenceAt(x,y))return false;}}
    return true;})()`));
  console.log(JSON.stringify({summary:'ground territory cache',passed:count}));
}
module.exports={legacySource,checks};
if(require.main===module){
  if(process.argv.includes('--worker'))checks();
  else{
    const r=require('node:child_process').spawnSync(process.execPath,[__filename,'--worker'],{stdio:'inherit',timeout:90000,killSignal:'SIGKILL'});
    if(r.error)console.error(r.error.message);
    process.exitCode=r.status===0&&!r.error?0:1;
  }
}
