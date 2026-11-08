/* node tests/ground-sight.cjs: ブラウザ不要。npm test では同じ固定場面と実画面を確認。 */
const fs=require('fs'),path=require('path'),vm=require('vm');
function sightCases(){
  const saved={op,fleets,groundHeight,groundForests,groundBuildings,groundSites,over,end,damage,shoot,groundFog,groundFollow};
  const results=[],check=(name,ok)=>results.push({name,ok});
  const unit=(team,kind,x,z=0,band='ground')=>({team,groundKind:kind,band,alive:true,hpPool:1000,pos:new THREE.Vector3(x,0,z),heading:new THREE.Vector3(),ships:[],stance:'evade',range:20,dmg:2,queue:[],order:null});
  const terrain=height=>{groundHeight=height;groundHeightCacheReset();groundForests=[];groundBuildings=[];};
  try{
    // 戦闘規則の固定場面では本営とデバッグ専用の固定敵指定を外す。補給はground-supply、固定敵はground-fixesで確認。
    op={...op,groundHQ:null,groundStaticEnemies:false};
    over=false;end=()=>{};groundSites=[];shoot=()=>{};groundFog=null;groundFollow=()=>{};
    // 打撃の入り口も実コードの groundCanFire を通す。ブラウザ版は本物の damage でも後で確認する。
    let hits=[];damage=(t,n,f)=>{if(groundCanFire(f,t)){hits.push({t,f,n});t.hpPool-=n;}};
    terrain((x,z)=>Math.abs(x)<2&&Math.abs(z)<15?35:0);
    const scout=unit(0,'scout',-8),enemy=unit(1,'infantry',8);
    fleets=[scout,enemy];groundUpdateSight();
    check('山の裏は両軍とも未発見',!enemy.seen&&!scout.seen&&!groundCanSee(scout,enemy)&&!groundCanSee(enemy,scout));
    const plane=unit(0,'supportAircraft',-8,0,'high');fleets=[plane,enemy];groundUpdateSight();
    check('広域戦略支援航空機も山を透視しない',!enemy.seen&&!groundCanSee(plane,enemy));
    terrain(()=>0);groundUpdateSight();check('同じ距離でも山がなければ航空機が発見',enemy.seen);
    check('支援機は低・高のみ、直接射撃なし',groundBands(plane).join(',')==='low,high'&&groundFireFactor(plane,enemy)===0);
    terrain(()=>0);
    const tank=unit(0,'vehicle',0),infantry=unit(1,'infantry',22);
    fleets=[tank,infantry];groundUpdateSight();check('開けた場所の歩兵を発見',infantry.seen);
    groundForests=[{x:22,z:0,r:2}];groundUpdateSight();check('森の歩兵は基本視界30の0.6倍より遠いと隠れる',!infantry.seen);
    tank.pos.x=4;groundUpdateSight();check('森の歩兵も18以内に近づくと発見',infantry.seen);
    tank.pos.x=0;infantry.pos.x=19;groundForests=[{x:19,z:0,r:2}];
    scout.pos.set(-10,0,0);fleets=[tank,scout,infantry];groundUpdateSight();
    check('戦車自身は未発見、斥候から全軍に共有',!groundCanSee(tank,infantry)&&groundCanSee(scout,infantry)&&groundSeenBy(0,infantry)&&groundCanFire(tank,infantry));
    tank.order={type:'attack',target:infantry};hits=[];groundStep(.05);
    check('斥候が発見した敵を戦車が実際に撃つ',hits.some(h=>h.f===tank&&h.t===infantry));
    scout.alive=false;tank.groundShotT=0;hits=[];groundStep(.05);
    check('斥候を失うと残った攻撃命令も打撃0',!infantry.seen&&hits.length===0&&!tank.order);
    const last=infantry.lastPos.clone();infantry.pos.x=70;groundUpdateSight();
    check('最終確認位置は見失った後の移動を追わない',infantry.lastPos.equals(last)&&!infantry.lastPos.equals(infantry.pos));
    terrain(()=>0);groundBuildings=[{minX:9.1,maxX:9.2,minZ:-2,maxZ:2,bottom:0,top:3}];
    scout.alive=true;scout.pos.set(19,0,5);infantry.pos.set(19,0,0);fleets=[tank,scout,infantry];groundUpdateSight();
    check('薄い市街地の建物も視線を遮る',!groundCanSee(tank,infantry)&&groundCanSee(scout,infantry));
    check('味方が発見しても射手と目標の間の建物で直接射撃不可',infantry.seen&&!groundCanFire(tank,infantry));
    groundBuildings=[];tank.team=1;infantry.team=0;scout.team=1;groundForests=[{x:19,z:0,r:2}];scout.pos.set(-10,0,0);
    groundUpdateSight();tank.order={type:'attack',target:infantry};tank.groundShotT=0;hits=[];groundStep(.05);
    check('敵軍も斥候の発見を共有して射撃',groundSeenBy(1,infantry)&&hits.some(h=>h.f===tank&&h.t===infantry));
    scout.alive=false;tank.groundShotT=0;hits=[];groundStep(.05);check('敵軍も未発見の敵を撃たず追わない',!infantry.seen&&hits.length===0&&!tank.order);
    terrain(()=>1.2);check('高台の視界は最大1.3倍',Math.abs(groundSightRange(tank)-39)<1e-6);
    terrain(()=>12);check('高台の視界の上限を越えない',Math.abs(groundSightRange(tank)-39)<1e-6);
    terrain(()=>0);plane.pos.set(0,0,0);enemy.pos.set(95,0,0);fleets=[plane,enemy];groundUpdateSight();check('支援機は95の敵を発見',enemy.seen);
    enemy.pos.x=101;groundUpdateSight();check('支援機も100を越えると未発見',!enemy.seen);
    scout.alive=true;scout.team=0;scout.pos.set(0,0,0);enemy.pos.x=60;fleets=[scout,enemy];groundUpdateSight();check('斥候の視界は60まで',enemy.seen);enemy.pos.x=60.01;groundUpdateSight();check('斥候の視界60の外は未発見',!enemy.seen);
    plane.band='low';plane.bandTo='high';plane.bandLeft=2;
    check('切り替え中の観測高度も元の段',groundEye(plane).y===groundRules().heights.low+groundSightRules().eyeHeight);
  }finally{op=saved.op;
    ({fleets,groundHeight,groundForests,groundBuildings,groundSites,over,end,damage,shoot,groundFog,groundFollow}=saved);groundHeightCacheReset();
  }
  return results;
}
async function checkGroundSight(page,check){
  await page.evaluate(()=>{reset({op:'groundExercise2'});setSpeed(0);endDeploy();});
  for(const c of await page.evaluate(sightCases))check(c.ok,'地上索敵: '+c.name);
  const integration=await page.evaluate(()=>{
    reset({op:'groundExercise2'});setSpeed(0);endDeploy();
    const blue=fleets.filter(f=>f.team===0),red=fleets.filter(f=>f.team===1),tank=blue.find(f=>f.groundKind==='vehicle'),enemy=red[0];
    for(const f of fleets){f.stance='evade';f.order=null;f.groundContacts=[null,null];f.pos.copy(groundPoint(f.team?44:4,32));}
    groundUpdateSight();groundDraw();const hidden=red.every(f=>!f.seen&&!f.groundModel.visible&&!f.lastPos);
    enemy.pos.copy(tank.pos).add(new THREE.Vector3(1,0,0));groundUpdateSight();groundDraw();const revealed=enemy.seen&&enemy.groundModel.visible;
    const at=enemy.pos.clone();enemy.pos.copy(groundPoint(44,32));groundUpdateSight();groundDraw();
    const memory=!enemy.seen&&!enemy.groundModel.visible&&enemy.lastPos.equals(at);
    const fog=groundFog;groundFogDraw(true);const alphas=fog.ctx.getImageData(0,0,fog.canvas.width,fog.canvas.height).data;
    const dark=alphas.some((n,i)=>i%4===3&&n===groundSightRules().fogAlpha),clear=alphas.some((n,i)=>i%4===3&&n===0);
    enemy.pos.copy(tank.pos).add(new THREE.Vector3(1,0,0));enemy.band='ground';tank.order={type:'attack',target:enemy};tank.groundShotT=0;
    let hp=enemy.hpPool+(enemy.groundMorale||0);groundStep(.05);const hit=enemy.hpPool+(enemy.groundMorale||0)<hp;
    enemy.pos.copy(groundPoint(44,32));tank.groundShotT=0;groundUpdateSight();hp=enemy.hpPool;damage(enemy,1,tank);const blocked=enemy.hpPool===hp;
    reset({op:'groundExercise2'});const fresh=fleets.filter(f=>f.team===1&&!f.seen).every(f=>!f.lastPos)&&groundFog!==fog;
    reset({op:'charybdis'});const space=!groundFog&&groundForests.length===0&&groundBuildings.length===0;
    return {hidden,revealed,memory,dark,clear,hit,blocked,fresh,space};
  });
  for(const [name,ok] of Object.entries(integration))check(ok,'地上索敵の実画面: '+name);
}
module.exports={checkGroundSight,sightCases};
// Canvas の描画だけを省き、本物の地形生成で樹冠・建物の遮蔽体と撮影配置を確認する。
function nodeSceneChecks(ctx){
  const THREE=require('three'),draw=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})},{get:(t,p)=>p in t?t[p]:()=>{}});
  ctx.document.createElement=()=>({width:0,height:0,getContext:()=>draw});
  for(const key of ['grid','starField','skyObj','fieldRocks','debrisObj','cloudObj','farPlanet','rim'])ctx[key]=new THREE.Group();
  Object.assign(ctx,{scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),ambient:new THREE.AmbientLight(),renderer:{shadowMap:{},capabilities:{getMaxAnisotropy:()=>1}}});
  vm.runInContext('groundConfigure=()=>groundSightReset();groundSetup("exercise2");',ctx);
  const results=vm.runInContext(`(()=>{
    const results=[],check=(name,ok)=>results.push({name,ok});
    check('生成した樹冠1210本が有限座標',groundForests.length===1210&&groundForests.every(p=>Object.values(p).every(Number.isFinite)));
    check('生成した建物279棟が有限の遮蔽体',groundBuildings.length===279&&groundBuildings.every(p=>Object.values(p).every(Number.isFinite)));
    const make=(team,kind,p,band='ground')=>({team,groundKind:kind,alive:true,band,pos:p});
    const forest=groundForests.find(p=>groundPass(p.x/GROUND_SCALE+24,18-p.z/GROUND_SCALE,'infantry')&&groundPass((p.x-24)/GROUND_SCALE+24,18-p.z/GROUND_SCALE,'infantry')&&groundCanSee(make(0,'scout',new THREE.Vector3(p.x-24,0,p.z)),make(1,'infantry',new THREE.Vector3(p.x,0,p.z))));
    check('写真bの森と斥候を配置できる',!!forest);
    const hill=WOS_TERRAIN.exercise2.height.observationHill,original={...hill};
    Object.assign(hill,{x:41,y:27,widthXKm:.7,widthYKm:2,heightM:500});groundHeightCacheReset();
    const observer=make(0,'scout',groundPoint(44,27)),enemy=make(1,'infantry',groundPoint(42.5,27));fleets=[observer,enemy];
    groundUpdateSight();const seen=enemy.seen;observer.pos.copy(groundPoint(39.5,27));groundUpdateSight();
    check('写真cの山で発見から最終確認位置へ',seen&&!enemy.seen&&!!enemy.lastPos);
    observer.groundKind='supportAircraft';observer.band='high';groundUpdateSight();
    check('写真cの山は高高度からも透視しない',!enemy.seen);
    Object.assign(hill,original);groundHeightCacheReset();
    fleets=[make(0,'scout',groundPoint(19,27)),make(0,'supportAircraft',groundPoint(9,27),'high')];
    groundSightInit();groundFogDraw(true);
    check('霧は地形と同じ盤の寸法',groundFog.canvas.width===96&&groundFog.canvas.height===72);
    return results;
  })()`,ctx);
  const start=performance.now();vm.runInContext('groundFogDraw(true)',ctx);const ms=Math.round(performance.now()-start);
  return {results,ms};
}
if(require.main===module){
  const ctx=vm.createContext({THREE:require('three'),TEAM_COL:['blue','red'],window:{},document:{querySelectorAll:()=>[]},fleets:[],op:{ground:'exercise2'},gameSec:0,over:false,end:()=>{},damage:()=>{},shoot:()=>{},dropArrow:()=>{},nextOrder:()=>{},followPath:()=>false});
  for(const file of ['data/terrain/exercise2.js','battle/terrain.js','battle/ground-sight.js','battle/ground-strike.js','battle/ground-transport.js','battle/ground-supply.js','battle/ground.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);ctx.WOS_TERRAIN=ctx.window.WOS_TERRAIN;
  }
  const cases=vm.runInContext(`(${sightCases.toString()})()`,ctx),scene=nodeSceneChecks(ctx);cases.push(...scene.results);const failed=cases.filter(c=>!c.ok);
  console.log(`| 索敵の固定場面（ブラウザ不要） | ${cases.length-failed.length}/${cases.length} 成功 |`);
  console.log(`| 霧更新（地形生成済み・斥候＋支援機、Node） | ${scene.ms} ms |`);
  if(failed.length){console.error(failed);process.exitCode=1;}
}
