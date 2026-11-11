/* node tests/ground-dimensions.cjs — ブラウザ不要。実データ・実Three.jsを使用。
   Canvasの描画命令だけstub。広域データの設計をfixtureの引伸ばしで代用しない。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),THREE=require('three');
function createContext(){
  const canvases=[],draw=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}})}, {get:(t,k)=>k in t?t[k]:()=>{}});
  const context=vm.createContext({THREE,console,op:{ground:'exercise2'},fleets:[],gameSec:0,
    document:{createElement(){const c={width:0,height:0,getContext:()=>draw};canvases.push(c);return c;}},
    scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),ambient:new THREE.AmbientLight(),
    renderer:{shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}},groundConfigure:()=>{},groundBuiltBridgeAt:()=>false,groundBridgeRevision:0});
  context.window=context;
  for(const key of ['grid','starField','skyObj','fieldRocks','debrisObj','cloudObj','farPlanet','rim'])context[key]=new THREE.Group();
  const run=s=>vm.runInContext(s,context);
  for(const file of ['data/terrain/exercise2.js','data/terrain/baikonur2.js','data/terrain/wide-fields.js','battle/terrain.js','battle/ground-sight.js','battle/ground-ballistics.js'])run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  run(`function groundRules(){return groundData().bands;}
    function groundStrikeRange(f){return f.rangeOverride||{min:0,max:200};}
    function gun(x,z){return {alive:true,groundKind:'artillery',band:'ground',pos:new THREE.Vector3(x,groundHeight(x,z),z)};}`);
  return {context,run,canvases};
}
function nodeChecks(){
  const rows=[],check=(name,fn)=>{try{fn();rows.push({name,ok:true});}catch(error){rows.push({name,ok:false,error:error.stack});}};
  const close=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
  const {run,context,canvases}=createContext();
  check('48×36の座標・高度・従来格子とテクスチャを維持',()=>{
    const d=run('groundDimensions()');assert.deepEqual([d.widthWorld,d.heightWorld,d.halfWidthWorld,d.halfHeightWorld],[192,144,96,72]);
    assert.deepEqual([d.mesh.segmentsX,d.mesh.segmentsZ,d.mesh.stepX,d.mesh.stepZ,d.texture.width,d.texture.height],[192,144,1,1,1152,864]);
    for(const [x,y,h] of [[8,25,.11648107134759246],[28,25,.12467971085097898],[23,33,.3360845082749051],[41,27,.3469757275418449],[24,5,0]]){
      const p=run(`groundPoint(${x},${y})`);close(p.x,(x-24)*4);close(p.z,(18-y)*4);close(p.y,h);
      close(run(`groundHeight(${p.x},${p.z})`),h);
    }
  });
  check('setup前はop.groundの切替で高度・弾道cacheを破棄',()=>{
    run(`var f=gun(0,0),p=new THREE.Vector3(16,0,0);var old=groundBallisticPoint(f,p),oldHeights=groundSightHeights;op={ground:'field150'};`);
    assert.equal(run('groundData().meta.id'),'field150');
    assert.equal(run('old!==groundBallisticPoint(f,p)&&oldHeights!==groundSightHeights'),true);
    run('var heightSource=groundSightHeights;var data=groundData();data.height={...data.height};groundSightHeight(0,0);');
    assert.equal(run('heightSource!==groundSightHeights'),true);
  });
  for(const [id,W,H,step] of [['exercise2',48,36,1],['baikonur2',96,72,1],['field150',150,100,2],['field300',300,200,4]]){
    check(`${id}: 寸法・盤外を含む座標往復・cap`,()=>{
      context.op={ground:id};run('groundTerrainId=null;');
      const d=run('groundDimensions()');assert.equal(d.widthKm,W);assert.equal(d.heightKm,H);
      assert.equal(d.mesh.stepX,step);assert.equal(d.mesh.stepZ,step);
      assert.ok(d.mesh.segmentsX<=512&&d.mesh.segmentsZ<=512&&d.texture.width<=2048&&d.texture.height<=2048);
      for(const [x,y] of [[0,0],[W,H],[W*.73,H*.81],[-10,-20],[W+10,H+20]]){
        close(run(`groundMapX(groundWorldX(${x}))`),x);close(run(`groundMapY(groundWorldZ(${y}))`),y);
      }
      assert.equal(run(`groundPass(-.1,${H/2},'air')||groundPass(${W+.1},${H/2},'air')||groundPass(${W/2},${H+.1},'sea')`),false);
    });
    check(`${id}: 実setupでcache破棄・texture/geometry/影の上限`,()=>{
      run(`groundSightHeight(0,0);var heightsBeforeSetup=groundSightHeights;groundSetup('${id}');`);
      assert.equal(run('groundSightHeights===null&&groundFog===null&&groundBallisticBuildingIndex===null'),true);
      const d=run('groundDimensions()'),mesh=run('groundBoard.children[0]');
      assert.equal(mesh.geometry.attributes.position.count,d.mesh.verticesX*d.mesh.verticesZ);
      assert.equal(mesh.geometry.parameters.widthSegments,d.mesh.segmentsX);assert.equal(mesh.geometry.parameters.heightSegments,d.mesh.segmentsZ);
      assert.equal(mesh.material.map.image.width,d.texture.width);assert.equal(mesh.material.map.image.height,d.texture.height);
      assert.ok(canvases.every(c=>c.width<=2048&&c.height<=2048));
      assert.equal(run('groundMeshGrid()===groundDimensions().mesh'),true);
      const factor=Math.max(1,W/48,H/36);close(context.sun.shadow.camera.right,140*factor);close(context.sun.shadow.camera.far,440*factor);
    });
    check(`${id}: 描画indexの三角形内部・対角線・外縁で高度一致`,()=>{
      const mesh=run('groundBoard.children[0]'),g=mesh.geometry,p=g.attributes.position,index=g.index;
      // 描画されたindexを直接読む。補間式をテストへ複製しない。
      const samples=[0,Math.floor(index.count/12)*6,index.count-6];
      for(const offset of samples)for(const tri of [0,3])for(const weights of [[.2,.3,.5],[0,.5,.5],[1,0,0]]){
        const q=new THREE.Vector3();
        for(let j=0;j<3;j++)q.addScaledVector(new THREE.Vector3().fromBufferAttribute(p,index.getX(offset+tri+j)),weights[j]*4);
        close(run(`groundSightHeight(${q.x},${q.z})`),q.y,2e-6);
      }
      assert.equal(run('groundSightHeights.length'),p.count);
      run('groundSightInit();');
      const fog=run('groundBoard.children[groundBoard.children.length-1]');assert.equal(fog.geometry.attributes.position.count,p.count);
      const fp=fog.geometry.attributes.position;
      for(const i of [0,Math.floor(p.count/2),p.count-1])close(fp.getY(i)-p.getY(i),.04,2e-7);
      run('groundFogDraw(true)');
    });
    check(`${id}: InstancedMesh・低木renderCount・森林の代表密度を維持`,()=>{
      const d=run('groundData()'),objects=run('groundBoard.children'),shrubs=objects.find(m=>m.isInstancedMesh&&m.instanceMatrix.count===(d.objects.shrubs.renderCount??(id==='exercise2'?650:d.objects.shrubs.count))*7);
      assert.ok(shrubs);
      const plantCount=shrubs.instanceMatrix.count/7,shadow=objects.find(m=>m.isInstancedMesh&&m.geometry.type==='CircleGeometry'&&m.instanceMatrix.count===plantCount);
      assert.ok(shrubs.count>=plantCount*3&&shrubs.count<=plantCount*7);assert.ok(shadow);assert.equal(shadow.count,plantCount);
      assert.equal(run('groundForests.length'),Math.round(d.objects.forest.count*.55));
      assert.equal(run(`groundForests.every(p=>groundInside(groundMapX(p.x),groundMapY(p.z),groundData().display.board)&&!groundInside(groundMapX(p.x),groundMapY(p.z),groundData().water.sea))`),true);
    });
    if(id==='exercise2')continue;
    check(`${id}: 海上・航空・盤外の経路`,()=>{
      assert.equal(run(`groundPass(${W*.4},${H*.1},'sea')&&!groundPass(${W*.4},${H*.1},'vehicle')`),true);
      assert.equal(run(`groundHeight(groundWorldX(${W*.4}),groundWorldZ(${H*.1}))`),0);
      run(`var seaPath=groundPath(groundPoint(${W*.3},${H*.1}),groundPoint(${W*.7},${H*.1}),'sea');`);
      assert.equal(run('!!seaPath&&seaPath.points.every(p=>groundPass(groundMapX(p.x),groundMapY(p.z),\'sea\'))'),true);
      assert.equal(run(`groundPath(groundPoint(-1,${H*.5}),groundPoint(${W*.5},${H*.5}),'air')===null`),true);
      assert.equal(run(`!!groundPath(groundPoint(${W*.7},${H*.7}),groundPoint(${W*.8},${H*.7}),'air')`),true);
    });
    check(`${id}: 旧盤より遠い実データの橋経路・沼地倍率`,()=>{
      const [x,y]=id==='baikonur2'?[49,60]:id==='field150'?[75,72]:[177,120];
      run(`var start=groundPoint(${x-3},${y}),dest=groundPoint(${x+3},${y}),route=groundPath(start,dest,'vehicle');`);
      assert.equal(run(`!!route&&route.points.at(-1).distanceTo(dest)<1e-7&&route.points.every(p=>groundPass(groundMapX(p.x),groundMapY(p.z),'vehicle'))`),true);
      const d=run('groundData()'),cell=d.terrain.cells.indexOf('沼地');assert.ok(cell>=0);
      const gx=(cell%d.terrain.cols+.5)*d.meta.cellKm,gy=(Math.floor(cell/d.terrain.cols)+.5)*d.meta.cellKm;
      close(run(`groundFactor(groundWorldX(${gx}),groundWorldZ(${gy}),'infantry')`),d.movement.marsh.infantry*run(`groundRiverFactor(${gx},${gy},'infantry')`));
    });
  }
  check('setupでopより明示IDを選び、同じIDの再setupでもcache破棄',()=>{
    context.op={ground:'field300'};run(`groundSetup('exercise2');var testGun=gun(-4,0),testPoint=new THREE.Vector3(4,0,0),cached=groundBallisticPoint(testGun,testPoint);groundSetup('exercise2');`);
    assert.equal(run('groundData().meta.id'),'exercise2');assert.equal(run('cached!==groundBallisticPoint(testGun,testPoint)'),true);
  });
  check('矩形の非整数寸法でも描画の原点・X/Z stepを共有',()=>{
    run(`var odd=JSON.parse(JSON.stringify(WOS_TERRAIN.field150));odd.meta={...odd.meta,id:'odd',widthKm:150.25,heightKm:100.75};WOS_TERRAIN.odd=odd;groundTerrainId=null;op={ground:'odd'};`);
    const d=run('groundDimensions()');assert.notEqual(d.mesh.stepX,d.mesh.stepZ);assert.equal(d.mesh.originX,-300.5);
    const geo=new THREE.PlaneGeometry(d.widthKm,d.heightKm,d.mesh.segmentsX,d.mesh.segmentsZ);geo.rotateX(-Math.PI/2);
    for(let i=0;i<geo.attributes.position.count;i++){
      const p=geo.attributes.position;close(p.getX(i)*4,d.mesh.originX+(i%d.mesh.verticesX)*d.mesh.stepX,4e-5);
    }
    geo.dispose();
  });
  for(const [id,step] of [['field150',2],['field300',4]])check(`${id}: 1worldでない三角形の狭い隆起と極薄建物の弾道衝突`,()=>{
    const {run:r}=createContext();
    r(`op={ground:'${id}'};var d=JSON.parse(JSON.stringify(groundData()));d.meta.id='ridge';d.objects.forest.count=0;d.objects.shrubs.count=0;d.objects.shrubs.renderCount=0;d.objects.reeds.count=0;d.objects.settlements=[];WOS_TERRAIN.ridge=d;op.ground='ridge';
      var step=${step},ridgeX=step,ridgeZ=0,vertexHeight=0;
      groundElevation=(mx,my)=>Math.abs(groundWorldX(mx)-ridgeX)<1e-7&&Math.abs(groundWorldZ(my)-ridgeZ)<1e-7?vertexHeight:0;
      var source=gun(-step,step*.3),target=new THREE.Vector3(step*3,0,step*.3),clear=groundBallisticSolution(source,target),u=(step*.7-source.pos.x)/(target.x-source.pos.x);
      var peakM=groundFreeFall(clear.originMeters,clear.velocityMeters,clear.physicalDuration*u).y;
      vertexHeight=(peakM+.0001)/.7*GROUND_SCALE*groundData().meta.elevationExaggeration/1000;
      groundSetup('ridge');var blocked=groundBallisticSolution(source,target);`);
    assert.equal(r('clear.clear&&!blocked.clear&&blocked.reason===\'terrain\''),true);
    close(r('blocked.impact.x'),step*.7,.0001);
    // 補間だけを偽造せず、描画meshの同じ尖点の高さを確認。
    close(r('Math.max(...groundBoard.children[0].geometry.attributes.position.array.filter((_,i)=>i%3===1))*GROUND_SCALE'),r('vertexHeight'),.0001);
    r(`vertexHeight=0;groundSightReset();groundBallisticReset();var base=groundBallisticSolution(source,target),t=.371234,point=groundBallisticAt(base,base.duration*t);
      groundBuildings=[{minX:point.x-5e-9,maxX:point.x+5e-9,minZ:point.z-.1,maxZ:point.z+.1,bottom:point.y-.0001,top:point.y+.0001}];var boxHit=groundBallisticSolution(source,target);`);
    assert.equal(r('!boxHit.clear&&boxHit.reason===\'building\''),true);close(r('boxHit.hitTime/boxHit.duration'),.371234,1e-7);
  });
  check('直射もLOSサンプル間の狭い三角形隆起を検出',()=>{
    const {run:r}=createContext();
    r(`op={ground:'field300'};groundHeight=(x,z)=>x===4&&z===0?2*(1+1e-6):0;groundSightReset();
      var a={x:.2,y:1,z:.2},b={x:3.8,y:1,z:3.8};
      groundEye=()=>a;groundStrikeRange=()=>({min:0,max:10,direct:true});groundSightRules=()=>({...groundData().sight,eyeHeight:1-groundSightHeight(b.x,b.z)});
      var shooter=gun(a.x,a.z);var solution=groundBallisticSolution(shooter,new THREE.Vector3(b.x,0,b.z));`);
    assert.equal(r('groundClearLine(a,b)'),true); // 旧rayStep=.5では尖点を通り越す固定場面。
    assert.equal(r('!solution.clear&&solution.reason===\'terrain\''),true);close(r('solution.impact.x'),2,.00001);
  });
  return rows;
}
module.exports={createContext,nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`地上寸法 ${rows.length-bad.length}/${rows.length}`);for(const b of bad)console.error(b.name+'\n'+b.error);assert.equal(bad.length,0);}
