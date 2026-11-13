/* 実行: node tools/ground-model-shots.cjs [--models "kind[@side]:key:size:form,..."] [--all] [--no-labels] [--moving] [--out .shots/models]
   1600×900。停止した初期配置と、兵科ごとに両軍を1.6km間隔・各列6隊までで並べた見本を撮る。 */
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {openGame,ROOT}=require('./browser.cjs');
function options(args){
  const opt={out:path.join(ROOT,'.shots/models')};
  for(let i=0;i<args.length;i++){if(['--all','--no-labels','--moving'].includes(args[i])){opt[args[i].slice(2)]=true;continue;}if(!['--models','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: node tools/ground-model-shots.cjs [--models "kind[@side]:key:size:form,..."] [--all] [--no-labels] [--moving] [--out <dir>]');opt[args[i].slice(2)]=args[++i];}
  opt.out=path.resolve(opt.out);return opt;
}
// These callbacks also run in the node-only checks, with the real game objects.
function movingShot(){
  const units=fleets.filter(f=>f.alive&&!f.embarked&&!groundAbsent(f)),places=units.map(f=>({pos:f.pos.clone(),heading:f.heading.clone()}));
  units.forEach(f=>{f.order={type:'move',dest:f.pos.clone().addScaledVector(f.heading,80)};f.queue=[];});
  for(let i=0;i<20;i++){step(.05);groundDraw();}
  // Keep the comparison spacing and facing even if pathfinding turns or blocks a unit.
  // Prime the same displacement signal as normal movement, then freeze at this battle time.
  units.forEach((f,i)=>{f.pos.copy(places[i].pos);f.heading.copy(places[i].heading);const pose=f.groundModel.userData.pose;if(pose)pose.last.copy(f.pos).addScaledVector(f.heading,-.001);});
  groundDraw();
}
function rowFrame({team,row}){
  if(!window.modelShotAbsent)window.modelShotAbsent=groundAbsent;
  groundAbsent=window.modelShotAbsent;
  const units=fleets.filter(f=>f.team===team&&f.alive&&!f.embarked&&!groundAbsent(f)).slice(row*6,row*6+6);
  if(!units.length)throw new Error('撮影する行がない');
  groundAbsent=f=>window.modelShotAbsent(f)||!units.includes(f);
  groundUpdateSight();
  for(const f of units){f.groundVisible[0]=true;f.seen=true;f.everSeen=true;f.el.querySelector('.nm').style.display='block';}
  groundDraw();groundFogDraw(true);scene.updateMatrixWorld(true);
  const box=new THREE.Box3();units.forEach(f=>box.union(new THREE.Box3().setFromObject(f.groundModel)));
  const angle=THREE.MathUtils.degToRad(40),front=team===1?1:-1;
  const direction=new THREE.Vector3(front*.65,0,front).normalize().multiplyScalar(Math.cos(angle));direction.y=Math.sin(angle);
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
  const target=box.getCenter(new THREE.Vector3()),tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;let dist=1;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(direction);
    dist=Math.max(dist,Math.abs(p.dot(right))/(tanX*.86)+depth,Math.abs(p.dot(up))/(tanY*.86)+depth);
  }
  return {target:target.toArray(),dist,direction:direction.toArray()};
}
async function main(){
  const opt=options(process.argv.slice(2)),{browser,page,errors}=await openGame({width:1600,height:900});
  try{
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const url=pathToFileURL(path.join(ROOT,'index.html'));if(opt.models)url.searchParams.set('groundModels',opt.models);
    await page.goto(url.href);
    const placed=await page.evaluate(all=>{
      const operation=WOS_DATA.operations.find(o=>o.id==='groundExercise2');
      if(all){
        const kinds=Object.keys(groundRuleSet().unitTypes);
        const lineup=team=>kinds.map((kind,i)=>({name:(team?'共和国 ':'連合 ')+groundRuleSet().unitTypes[kind].name,groundKind:kind,
          band:['fighter','supportAircraft'].includes(kind)?'high':['attack','droneHive'].includes(kind)?'low':'ground',
          type:'cv',n:1,scale:.3,pos:[-64+(i%6)*6.4,-28+Math.floor(i/6)*6.4+team*24],alt:0,side:team?'mars':'earth',stance:'evade'}));
        operation.quick=lineup(0);operation.enemies=lineup(1);operation.groundSea=[];
      }
      // Explicit fleets bypass the saved ground organization, just like a quick sortie.
      WOS.start({op:operation.id,fleets:operation.quick});setSpeed(0);
      return {player:operation.quick.map(f=>f.groundKind),enemy:operation.enemies.map(f=>f.groundKind)};
    },!!opt.all);
    console.log('Placed kinds: '+JSON.stringify(placed));
    await page.waitForFunction(()=>window.WOS&&typeof groundVisuals!=='undefined'&&groundVisuals&&fleets.some(f=>f.team===0));
    await page.evaluate(()=>{setSpeed(0);});await page.waitForFunction(()=>!camAnim);
    const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    fs.mkdirSync(opt.out,{recursive:true});
    const shoot=async name=>{await settle();if(errors.length)throw new Error(errors.join('\n'));const file=path.join(opt.out,name+'.png');await page.screenshot({path:file});console.log(file);};
    if(opt['no-labels'])await page.addStyleTag({content:'.nm,.ground-site{display:none!important}'});
    if(!opt.all){if(opt.moving)await page.evaluate(movingShot);await shoot('far');}
    // Work out the closest 45-degree perspective view that fits the actual model bounds.
    const frame=async(line=false)=>page.evaluate(line=>{
      const players=fleets.filter(f=>f.team===0&&f.alive&&!f.embarked&&!groundAbsent(f));let shownUnits=players;
      if(line){
        const row=[...new Map(players.map(f=>[f.groundKind,f])).values()],enemies=row.map(f=>fleets.find(e=>e.team===1&&e.alive&&!e.embarked&&!groundAbsent(e)&&e.groundKind===f.groundKind));
        if(enemies.some(f=>!f))throw new Error('比較する敵の兵科が足りない');
        shownUnits=[...row,...enemies];
        const columns=Math.min(6,row.length),rows=Math.ceil(row.length/6),span=(columns-1)*1.6,depth=(rows*2-1)*1.6;
        // Pick a dry, clear, nearly level strip using the real terrain, trees and building bounds.
        let best=null;
        for(let y=4;y<groundDimensions().heightKm-depth-4;y+=.5)for(let x=span/2+3;x<groundDimensions().widthKm-span/2-3;x+=.5){
          const points=shownUnits.map((f,i)=>{
            const at=i%row.length,side=i>=row.length?1:0;
            // Map Y grows away from the camera: player rows are in front of every enemy row.
            return groundPoint(x-span/2+(at%6)*1.6,y+(side?rows*1.6:0)+Math.floor(at/6)*1.6);
          });
          if(points.some(p=>!groundPass(groundMapX(p.x),groundMapY(p.z),'vehicle')||groundForests.some(t=>Math.hypot(p.x-t.x,p.z-t.z)<t.r+2)||groundBuildings.some(b=>p.x>b.minX-2&&p.x<b.maxX+2&&p.z>b.minZ-2&&p.z<b.maxZ+2)))continue;
          const heights=points.map(p=>groundSurfaceHeight(p.x,p.z)),score=Math.max(...heights)-Math.min(...heights);
          if(!best||score<best.score)best={points,heights,score};
        }
        if(!best)throw new Error('比較用の開けた地面が見つからない');
        fleets.forEach(f=>{f.order=null;f.queue=[];f.stance='evade';if(!shownUnits.includes(f))f.pos.copy(groundPoint(groundDimensions().widthKm-1,1));});
        shownUnits.forEach((f,i)=>{f.pos.copy(best.points[i]);f.pos.y=f.band==='ground'?best.heights[i]+.15:groundUnitHeight(f);f.heading.set(0,0,f.team===1?1:-1);});
      }
      groundUpdateSight();
      if(line)for(const f of shownUnits){f.groundVisible[0]=true;f.seen=true;f.everSeen=true;f.el.querySelector('.nm').style.display='block';}
      groundDraw();groundFogDraw(true);scene.updateMatrixWorld(true);
      const box=new THREE.Box3();shownUnits.forEach(f=>box.union(new THREE.Box3().setFromObject(f.groundModel)));if(box.isEmpty())throw new Error('撮影する部隊がない');
      const target=box.getCenter(new THREE.Vector3()),direction=new THREE.Vector3(0,1,1).normalize(),up=new THREE.Vector3(0,1,-1).normalize();
      const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;let dist=1;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const p=new THREE.Vector3(x,y,z).sub(target),depth=p.dot(direction);
        dist=Math.max(dist,Math.abs(p.x)/(tanX*.8)+depth,Math.abs(p.dot(up))/(tanY*.8)+depth);
      }
      return {target:target.toArray(),dist};
    },line);
    const cameraAt=async(framing,factor)=>{
      await page.evaluate(({target,dist,factor,direction})=>{camAnim=null;controls.autoRotate=false;controls.enableDamping=false;controls.minDistance=.5;controls.maxDistance=3000;controls.target.fromArray(target);camera.position.copy(controls.target).add(new THREE.Vector3().fromArray(direction||[0,1,1]).normalize().multiplyScalar(dist*factor));camera.lookAt(controls.target);controls.update();groundDraw();},{...framing,factor});await settle();
    };
    if(opt.all){
      await frame(true);
      if(opt.moving)await page.evaluate(movingShot);
      for(const [team,side] of ['earth','mars'].entries())for(let row=0;row<Math.ceil((team?placed.enemy:placed.player).length/6);row++){
        const framing=await page.evaluate(rowFrame,{team,row});await cameraAt(framing,1);await shoot(`all-${side}-${row+1}`);
      }
      if(errors.length)throw new Error(errors.join('\n'));
      return;
    }
    const start=await frame();await cameraAt(start,2);await shoot('mid');await cameraAt(start,1);await shoot('near');
    // Reset with missing enemy kinds added through the normal fleet/model initialization.
    await page.evaluate(()=>{
      for(const f of op.quick)if(!op.enemies.some(e=>e.groundKind===f.groundKind))op.enemies.push({...f,side:'mars'});
      reset();setSpeed(0);
    });await page.waitForFunction(()=>!camAnim);
    const row=await frame(true);if(opt.moving)await page.evaluate(movingShot);await page.waitForTimeout(450);await cameraAt(row,1);await shoot('line-near');await cameraAt(row,2);await shoot('line-mid');
    if(errors.length)throw new Error(errors.join('\n'));
  }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={options,movingShot,rowFrame};
