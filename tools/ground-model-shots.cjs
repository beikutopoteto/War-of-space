/* 実行: node tools/ground-model-shots.cjs [--models "kind[@side]:key:size:form,..."] [--out .shots/models]
   1600×900。停止した初期配置と、兵科ごとに両軍を1.2km間隔・前後2kmで並べた見本を撮る。 */
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {openGame,ROOT}=require('./browser.cjs');
function options(args){
  const opt={out:path.join(ROOT,'.shots/models')};
  for(let i=0;i<args.length;i+=2){if(!['--models','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: node tools/ground-model-shots.cjs [--models "kind[@side]:key:size:form,..."] [--out <dir>]');opt[args[i].slice(2)]=args[i+1];}
  opt.out=path.resolve(opt.out);return opt;
}
async function main(){
  const opt=options(process.argv.slice(2)),{browser,page,errors}=await openGame({width:1600,height:900});
  try{
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const url=pathToFileURL(path.join(ROOT,'index.html'));url.searchParams.set('ground','exercise2');if(opt.models)url.searchParams.set('groundModels',opt.models);
    await page.goto(url.href);await page.waitForFunction(()=>window.WOS&&typeof groundVisuals!=='undefined'&&groundVisuals&&fleets.some(f=>f.team===0));
    await page.evaluate(()=>{setSpeed(0);});await page.waitForFunction(()=>!camAnim);
    const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    fs.mkdirSync(opt.out,{recursive:true});
    const shoot=async name=>{await settle();if(errors.length)throw new Error(errors.join('\n'));const file=path.join(opt.out,name+'.png');await page.screenshot({path:file});console.log(file);};
    await shoot('far');
    // Work out the closest 45-degree perspective view that fits the actual model bounds.
    const frame=async(line=false)=>page.evaluate(line=>{
      const players=fleets.filter(f=>f.team===0&&f.alive&&!f.embarked&&!groundAbsent(f));let shownUnits=players;
      if(line){
        const row=[...new Map(players.map(f=>[f.groundKind,f])).values()],enemies=row.map(f=>fleets.find(e=>e.team===1&&e.alive&&!e.embarked&&!groundAbsent(e)&&e.groundKind===f.groundKind));
        if(enemies.some(f=>!f))throw new Error('比較する敵の兵科が足りない');
        shownUnits=[...row,...enemies];
        const span=(row.length-1)*1.2;
        // Pick a dry, clear, nearly level strip using the real terrain, trees and building bounds.
        let best=null;
        for(let y=4;y<groundDimensions().heightKm-4;y+=.5)for(let x=span/2+3;x<groundDimensions().widthKm-span/2-3;x+=.5){
          const points=shownUnits.map((f,i)=>groundPoint(x-span/2+(i%row.length)*1.2,y+(i>=row.length?2:0)));
          if(points.some(p=>!groundPass(groundMapX(p.x),groundMapY(p.z),'vehicle')||groundForests.some(t=>Math.hypot(p.x-t.x,p.z-t.z)<t.r+2)||groundBuildings.some(b=>p.x>b.minX-2&&p.x<b.maxX+2&&p.z>b.minZ-2&&p.z<b.maxZ+2)))continue;
          const heights=points.map(p=>groundSurfaceHeight(p.x,p.z)),score=Math.max(...heights)-Math.min(...heights);
          if(!best||score<best.score)best={points,heights,score};
        }
        if(!best)throw new Error('比較用の開けた地面が見つからない');
        fleets.forEach(f=>{f.order=null;f.queue=[];f.stance='evade';if(!shownUnits.includes(f))f.pos.copy(groundPoint(groundDimensions().widthKm-1,1));});
        shownUnits.forEach((f,i)=>{f.pos.copy(best.points[i]);f.pos.y=best.heights[i]+.15;f.heading.set(0,0,f.team===1?1:-1);});
      }
      groundUpdateSight();
      if(line)for(const f of shownUnits){f.groundVisible[0]=true;f.seen=true;f.everSeen=true;}
      groundDraw();groundFogDraw(true);scene.updateMatrixWorld(true);
      const box=new THREE.Box3();shownUnits.forEach(f=>box.union(new THREE.Box3().setFromObject(f.groundModel)));if(box.isEmpty())throw new Error('撮影する部隊がない');
      const target=box.getCenter(new THREE.Vector3()),direction=new THREE.Vector3(0,1,1).normalize(),up=new THREE.Vector3(0,1,-1).normalize();
      const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;let dist=1;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(direction);
        dist=Math.max(dist,Math.abs(p.x)/(tanX*.85)+depth,Math.abs(p.dot(up))/(tanY*.8)+depth);
      }
      return {target:target.toArray(),dist};
    },line);
    const cameraAt=async(framing,factor)=>{
      await page.evaluate(({target,dist,factor})=>{camAnim=null;controls.autoRotate=false;controls.enableDamping=false;controls.minDistance=.5;controls.maxDistance=3000;controls.target.fromArray(target);camera.position.copy(controls.target).add(new THREE.Vector3(0,1,1).normalize().multiplyScalar(dist*factor));camera.lookAt(controls.target);controls.update();groundDraw();},{...framing,factor});await settle();
    };
    const start=await frame();await cameraAt(start,2);await shoot('mid');await cameraAt(start,1);await shoot('near');
    // Reset with missing enemy kinds added through the normal fleet/model initialization.
    await page.evaluate(()=>{
      for(const f of op.quick)if(!op.enemies.some(e=>e.groundKind===f.groundKind))op.enemies.push({...f,side:'mars'});
      reset();setSpeed(0);
    });await page.waitForFunction(()=>!camAnim);
    const row=await frame(true);await cameraAt(row,1);await shoot('line-near');await cameraAt(row,2);await shoot('line-mid');
    if(errors.length)throw new Error(errors.join('\n'));
  }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={options};
