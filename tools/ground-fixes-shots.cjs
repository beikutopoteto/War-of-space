/* Claude用: node tools/ground-fixes-shots.cjs。1600×900、直し-a～f.png。
   a: 横寄りから斜面の目標輪・移動先 b: 未探知拠点 c: 探知後、再び霧の中
   d/e/f: 拠点中心／道路帯中央／補給部隊からの点線。ページ例外は失敗。
   --sim はブラウザ不要。撮影は停止した固定場面で実際の描画・命令関数を使う。 */
const fs=require('fs'),path=require('path');
if(process.argv.includes('--sim')){
  const {rows,vertices,minClearance}=require('../tests/ground-fixes.cjs').nodeChecks(),bad=rows.filter(r=>!r.ok);
  console.log(`| 地上の直し | ${rows.length-bad.length}/${rows.length} 成功・${vertices}頂点・最低地表差${minClearance.toFixed(3)} |`);
  if(bad.length)throw new Error(bad.map(r=>r.name).join('\n'));
}else (async()=>{
  const {openGame,ROOT}=require('./browser.cjs'),{browser,page,errors}=await openGame({width:1600,height:900});
  const fail=()=>{if(errors.length)throw new Error(errors.join('\n'));};
  const view=async(x,y,dist,tilt=.35)=>{
    await page.evaluate(({x,y,dist,tilt})=>{
      camAnim=null;const at=groundPoint(x,y);controls.target.copy(at);
      camera.position.copy(at).add(new THREE.Vector3(0,dist*tilt,dist));camera.lookAt(at);controls.update();
      groundUpdateSight();groundDraw();groundFogDraw(true);updateRoster();updateGoal();
    },{x,y,dist,tilt});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));fail();
  };
  const shot=async letter=>{fail();await page.screenshot({path:path.join(ROOT,'.shots',`直し-${letter}.png`)});fail();};
  const fresh=async()=>{
    await page.evaluate(()=>{
      reset({op:'groundExercise2',fleets:[{...OPS.find(o=>o.id==='groundExercise2').quick.map(groundUnitSpec).find(f=>f.groundKind==='infantry')}]});
      setSpeed(0);endDeploy();setSpeed(0);
      const hq=groundSites.find(s=>s.id===op.groundHQ[0]);
      for(const f of fleets)if(f.team===0&&!f.embarked){groundClearOrders(f);f.stance='evade';f.pos.copy(hq.pos);f.pos.y=groundUnitHeight(f);}
      select(fleets.find(f=>f.team===0&&f.groundKind==='infantry'));groundUpdateSight();
    });fail();
  };
  try{
    fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
    await page.goto('file://'+path.join(ROOT,'index.html')+'?ground=exercise2');
    await page.waitForFunction(()=>window.WOS&&groundSupplyNet);fail();
    // a: 実地形の観測高台の斜面に、実際のtutorialRenderで目標輪を置く。
    await fresh();
    await page.evaluate(()=>{
      const hill=WOS_TERRAIN[op.ground].height.observationHill,at=groundPoint(hill.x-1,hill.y);
      op={...op,tutorial:[{name:'斜面の目標',text:'地表に沿う目標輪と移動先',targets:[],marks:[{label:'斜面',pos:[at.x,at.z],alt:0}]}]};
      tutorial={step:0,skipped:false};tutorialRender();
      const f=selected;f.pos.copy(groundPoint(hill.x-3,hill.y));f.pos.y=groundUnitHeight(f);order(f,{type:'move',dest:at});
      if(!f.order)throw new Error('斜面への移動命令を受理しない');
      for(const child of tutorialMarks[0].group.children){const p=child.geometry.attributes.position;
        for(let i=0;i<p.count;i++)if(p.getY(i)<groundSurfaceHeight(at.x+p.getX(i),at.z+p.getZ(i)))throw new Error('目標輪が地表より下');}
    });
    const hill=await page.evaluate(()=>WOS_TERRAIN[op.ground].height.observationHill);
    await view(hill.x-1,hill.y,36,.45);await shot('a');
    // b: 東の拠点にカメラだけを寄せる。カメラは索敵を与えない。
    await fresh();
    const site=await page.evaluate(()=>{const s=groundSites.find(s=>s.id===op.groundHQ[1]);return {id:s.id,x:s.x,y:s.y};});
    await view(site.x,site.y,68,1.5);
    await page.evaluate(id=>{
      const s=groundSites.find(s=>s.id===id);
      if(s.observed||s.knownOwner!==null||s.el.style.visibility!=='visible'||s.el.style.color!=='rgb(202, 209, 197)'||s.ring.renderOrder<=3||groundTerritory.mesh.renderOrder<=3)throw new Error('未探知拠点の中立色・霧上の円と名札を確認できない');
    },site.id);await shot('b');
    // c: 自軍で探知してから本営へ戻し、霧の中の敵色記憶を写す。
    await page.evaluate(id=>{
      const s=groundSites.find(s=>s.id===id),f=selected,home=f.pos.clone();f.pos.copy(s.pos);groundUpdateSight();
      if(s.knownOwner!==1)throw new Error('拠点を探知できない');
      f.pos.copy(home);groundUpdateSight();
      if(s.observed||s.knownOwner!==1)throw new Error('拠点の最後の所有者を保持しない');
    },site.id);await view(site.x,site.y,68,1.5);await shot('c');
    // d: 本営円の中で補充。満タン・補給網外・待ち時間は線なしも確かめる。
    await fresh();
    const hq=await page.evaluate(()=>{
      const f=selected,s=groundSites.find(s=>s.id===op.groundHQ[0]);f.pos.copy(s.pos).add(new THREE.Vector3(4,0,0));f.pos.y=groundUnitHeight(f);f.groundSupply=40;
      groundSupplyAfter(1);groundSupplyLinksDraw();if(groundSupplyLinks.has(f))throw new Error('待ち時間に線が出る');
      groundSupplyAfter(2);groundSupplyLinksDraw();if(!groundSupplyLinks.has(f)||f.groundSupplySource?.site!==s)throw new Error('拠点からの受給線なし');return {x:s.x+.5,y:s.y};
    });await view(hq.x,hq.y,30,1.5);await shot('d');
    // e: 補給のつながる道路小区間の中央から。受け手は帯の中で少しずらす。
    const road=await page.evaluate(()=>{
      const f=selected;let e,at;
      for(const edge of groundSupplyNet.edges){
        if(edge.circle||edge.owner!==0||!edge.rates[0])continue;
        const j=edge.path.findIndex((p,i)=>i&&groundDistance(edge.x,edge.y,[edge.path[i-1],p])<1e-6);if(j<1)continue;
        const a=edge.path[j-1],b=edge.path[j],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<.2)continue;
        for(const side of [1,-1]){
          const x=edge.x-(b[1]-a[1])/L*.3*side,y=edge.y+(b[0]-a[0])/L*.3*side;
          if(!groundCircleAt(x,y)&&groundRoadAt(x,y)===edge&&groundPass(x,y,'infantry')){e=edge;at=groundPoint(x,y);break;}
        }
        if(e)break;
      }
      if(!e)throw new Error('円外でつながる道路区間なし');
      f.pos.copy(at);f.pos.y=groundUnitHeight(f);
      f.groundSupply=40;groundSupplyAfter(1);groundSupplyLinksDraw();if(!groundSupplyLinks.has(f)||f.groundSupplySource?.edge!==e)throw new Error('道路中央からの受給線なし');return {x:e.x,y:e.y};
    });await view(road.x,road.y,22,1.5);await shot('e');
    // f: 実補給命令をUIで出す。対象の名札と重ならないよう他の部隊を遠方へ。
    await page.evaluate(()=>{
      const f=selected;for(const t of fleets)if(t!==f&&!t.embarked)t.pos.copy(groundPoint(t.team?41:7,t.team?27:33));
      f.pos.copy(groundPoint(15,26));f.pos.y=groundUnitHeight(f);f.groundSupply=30;
      const t=makeFleet(0,{...groundUnitSpec(op.quick[0]),name:'撮影 補給中隊',groundKind:'supply'});fleets.push(t);t.band='ground';t.pos.copy(groundPoint(15.7,26));t.pos.y=groundUnitHeight(t);groundSupplyInitUnit(t);
      const src=shipMeshes[0].cv,mat=src.material.clone();mat.userData.baseOpacity=1;t.groundModel=new THREE.Group();const mesh=new THREE.Mesh(src.geometry.clone(),mat);mesh.scale.setScalar(SHIP_SIZE.cv);t.groundModel.add(mesh);groundVisuals.add(t.groundModel);
      t.companyId='fixesSupply';groundOrg.companies.push({id:t.companyId,name:t.name,kind:'supply'});buildRoster();select(t);
    });await view(15.35,26,25,1.5);
    await page.locator('#groundSupply').evaluate(el=>{el.parentElement.open=true;});
    await page.getByRole('button',{name:/^補給$/}).click();
    const pos=await page.evaluate(()=>{
      const f=fleets.find(f=>f.team===0&&f.groundKind==='infantry'),p=proj(f.pos),el=document.elementFromPoint(p.x,p.y);
      if(pick(p.x,p.y).best!==f||!(el===renderer.domElement||f.el.contains(el)))throw new Error('補給先に別の名札が重なる');return p;
    });await page.mouse.click(pos.x,pos.y);
    await page.evaluate(()=>{groundSupplyAfter(1);groundSupplyLinksDraw();if(!selected.groundSupplyGiving||groundSupplyLinks.size!==1)throw new Error('補給部隊からの受給線なし');});
    await view(15.35,26,25,1.5);await shot('f');
    await page.evaluate(()=>{
      const f=selected.groundGiving;f.groundSupply=100;groundSupplyAfter(1);groundSupplyLinksDraw();if(groundSupplyLinks.size)throw new Error('満タンでも受給線が残る');
      groundClearOrders(selected);f.groundSupply=30;groundSupplyAfter(1);groundSupplyLinksDraw();if(groundSupplyLinks.size)throw new Error('補給網外で受給線が残る');
    });fail();
    console.log('| 写真 | .shots/直し-a.png ～ 直し-f.png（6枚、1600×900） |');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
