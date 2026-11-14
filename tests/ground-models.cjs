/* ブラウザ不要。実際の形・groundInit/groundDraw・見本HTMLを確かめる。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createGroundContext}=require('./ground-landing.cjs'),{build}=require('../tools/model-sheet.cjs');
function nodeChecks(){
  const {ctx,run}=createGroundContext();let count=0;
  const check=(name,code)=>{assert.equal(run(code),true,name);count++;};
  ctx.URLSearchParams=URLSearchParams;ctx.location={search:''};
  {
    const test=createGroundContext(), c=test.ctx, u=test.read('battle/units.js');
    c.scene=new c.THREE.Scene();c.TEAM_COL=[0,1,2,3].map(()=>new c.THREE.Color('blue'));
    test.run(u.slice(u.indexOf('const SHIP_MAX='),u.indexOf('/* small craft')));
    const verify=(name,code)=>{assert.equal(test.run(code),true,name);count++;};
    verify('両陣営の7艦種の頂点数とジオメトリ共有',`Object.entries(SPACE_MODELS).filter(([k])=>k!=='masc').every(([k,s])=>['earth','mars'].every(side=>{const key=k+(side==='mars'?'@mars':'');return shipMeshes[0][key].geometry.attributes.position.count===groundShapeGeo(s[side]).attributes.position.count&&shipMeshes.every(m=>m[key].geometry===shipMeshes[0][key].geometry);}))`);
    verify('全艦の頂点色',`shipMeshes.every(m=>Object.values(m).every(v=>!!v.geometry.attributes.color))`);
    verify('陣営と鹵獲艦の鍵',`shipMeshKey({team:1},'cv')==='cv@mars'&&shipMeshKey({team:1},'bb')==='bb'&&shipMeshKey({team:1,side:'earth'},'cv')==='cv'&&shipMeshKey({team:0},'cv')==='cv'`);
    verify('共和国の鍵がない場合は従来の鍵',`(()=>{const m=shipMeshes[1]['cv@mars'];delete shipMeshes[1]['cv@mars'];const key=shipMeshKey({team:1},'cv');shipMeshes[1]['cv@mars']=m;return key==='cv';})()`);
    verify('強襲母艦の高さ',`(()=>{const a=shipMeshes[0].masc.geometry.attributes.position,b=groundShapeGeo('masc2').attributes.position;return a.count===b.count&&Array.from({length:a.count},(_,i)=>Math.abs(a.getY(i)-b.getY(i)+.09)<1e-6).every(Boolean)&&!shipMeshes[0]['masc@mars'];})()`);
  }

  run(`globalThis.testKey=Object.keys(GROUND_SHAPES)[0];`);
  check('採用表の全陣営のキーと編隊が存在する',`Object.values(GROUND_MODELS).every(m=>['earth','mars'].every(side=>{const s=m.earth||m.mars?m[side]:m;return !!s&&Object.prototype.hasOwnProperty.call(GROUND_SHAPES,s.key)&&Object.prototype.hasOwnProperty.call(GROUND_FORMS,s.form||'one');}))`);
  check('未採用の兵科は従来表示',`groundModelFor('missing-kind')===null`);
  /* the table the user approved (sample round 14, 2026-11-13): the same entries as the sample's override, and every land and air
     kind of the ground battle and the sea ships (docs/models.md 13・14) have a model; sea:cvb and sea:mas keep the old drawing */
  const approved=fs.readFileSync(path.join(__dirname,'../docs/mockups/models/pilot-override.txt'),'utf8').trim();
  check('採用表は見本の差し替えと同じ',`(o=>o.split(',').every(e=>{const q=e.split(':'),n=q[0]==='sea'?2:1,who=q.slice(0,n).join(':'),[key,size,form,move]=q.slice(n),[kind,side]=who.split('@');return (side?[side]:['earth','mars']).every(sd=>{const m=groundModelFor(kind,sd);return !!m&&m.key===key&&Math.abs(m.size-+size)<1e-9&&m.form===form&&m.move.join('+')===(move||'');});}))(${JSON.stringify(approved)})`);
  check('地上戦の全兵科と海の艦に採用の形があり、海の戦闘母艦・突撃揚陸艦は従来表示',`Object.keys(groundRuleSet().unitTypes).every(k=>['earth','mars'].every(sd=>!!groundModelFor(k,sd)))&&['sea:bb','sea:cl','sea:ff','sea:dd','sea:masc'].every(k=>['earth','mars'].every(sd=>!!groundModelFor(k,sd)))&&groundModelFor('sea:cvb')===null&&groundModelFor('sea:mas')===null`);
  /* the checks below test the address override and the old drawing, so they run on an empty table; it is put back at the end */
  run(`globalThis.APPROVED_MODELS={...GROUND_MODELS};for(const k of Object.keys(GROUND_MODELS))delete GROUND_MODELS[k];`);
  check('未知・継承されたキーは見つからない',`groundShapeGeo('missing-model')===null&&groundShapeGeo('toString')===null`);
  check('全モデルの座標・法線・頂点色が有限',`Object.keys(GROUND_SHAPES).every(key=>{const g=groundShapeGeo(key);return ['position','normal','color'].every(k=>g.attributes[k].count===g.attributes.position.count&&[...g.attributes[k].array].every(Number.isFinite));})`);
  check('仮の形は二つの濃淡を保つ',`!Object.prototype.hasOwnProperty.call(GROUND_SHAPES,'stub')||new Set(groundShapeGeo('stub').attributes.color.array).size===2`);
  check('単色は全部の部品が白い頂点色',`Object.keys(GROUND_SHAPES).every(key=>[...groundShapeGeo(key,true).attributes.color.array].every(k=>k===1))`);
  check('宇宙艦と小型機は頂点色を持たない',`!shapeGeo('cv').attributes.color&&!craftGeo('was').attributes.color`);
  ctx.location.search='?groundModels='+encodeURIComponent(`vehicle:${ctx.testKey}:0.7:one,infantry:${ctx.testKey}:0.5:squad6,fighter:${ctx.testKey}:0.8:v3,sea:cl:${ctx.testKey}:1.1:line3`);
  check('地上と海上の差し替えを読む',`groundModelFor('vehicle').size===.7&&groundModelFor('infantry').form==='squad6'&&groundModelFor('infantry').offsets===GROUND_FORMS.squad6&&groundModelFor('sea:cl').size===1.1&&groundModelFor('was')===null`);
  ctx.location.search='?groundModels='+encodeURIComponent(`vehicle:missing-model:1:v3,infantry:${ctx.testKey}:-2:7`);
  check('不明モデルは従来表示、不正な大きさと編隊は既定値',`groundModelFor('vehicle')===null&&groundModelFor('infantry').size===1&&groundModelFor('infantry').form==='one'&&groundModelFor('infantry').offsets===GROUND_FORMS.one`);
  ctx.location.search='?groundModels='+encodeURIComponent(`vehicle:${ctx.testKey}:1:one,vehicle@mars:${ctx.testKey}:2:box4`);
  check('陣営指定が共通指定に優先する',`groundModelFor('vehicle','earth').size===1&&groundModelFor('vehicle','mars').size===2&&groundModelFor('vehicle','mars').offsets===GROUND_FORMS.box4`);
  check('移動形なしは空配列',`groundModelFor('vehicle','earth').move.length===0`);
  ctx.location.search='?groundModels='+encodeURIComponent(`vehicle:${ctx.testKey}:1:one:${ctx.testKey},infantry:${ctx.testKey}:1:one:missing-model`);
  check('移動形を読み、不明な移動形は空配列',`groundModelFor('vehicle').move.length===1&&groundModelFor('vehicle').move[0]===testKey&&groundModelFor('infantry').move.length===0`);
  run(`globalThis.stepKeys=Object.keys(GROUND_SHAPES).slice(0,2);`);
  ctx.location.search='?groundModels='+encodeURIComponent(`infantry:${ctx.testKey}:1:squad6:${ctx.stepKeys.join('+')}+missing-model`);
  check('a+bの順序を保ち不明なキーだけを除く',`JSON.stringify(groundModelFor('infantry').move)===JSON.stringify(stepKeys)`);
  ctx.location.search='';ctx.TEAM_COL=[0x4aa3ff,0xff5a4a].map(c=>new ctx.THREE.Color(c));
  Object.assign(ctx,{labelsEl:{appendChild(){}},proj:p=>({x:p.x,y:p.z,z:0}),SHIP_SIZE:Object.fromEntries(ctx.WOS_DATA.ships.map(s=>[s.id,s.scale*1.2]))});
  run(`groundHud=groundCaptureInit=groundSightInit=()=>{};
    globalThis.shipMeshes=[0,1].map(()=>Object.fromEntries(Object.keys(SHAPES).map(k=>[k,new THREE.Mesh(shapeGeo(k),new THREE.MeshStandardMaterial())])));
    globalThis.craftMeshes=[0,1].map(()=>Object.fromEntries(Object.keys(CRAFT_SHAPES).map(k=>[k,new THREE.Mesh(craftGeo(k),new THREE.MeshStandardMaterial())])));
    globalThis.initModels=()=>{op=WOS_DATA.operations.find(o=>o.id==='groundExercise2');fleets=[...op.quick.map(groundUnitSpec).map(s=>makeFleet(0,s)),makeFleet(1,groundUnitSpec(op.quick[0]))];groundSeaDeploy();groundInitOrg(null);groundBoard=new THREE.Group();groundInit();};initModels();`);
  check('差し替えなしはコルベット・旧航空・WAS・海艦を維持',`fleets.every(f=>{const m=f.groundModel;if(['fighter','attack','supportAircraft'].includes(f.groundKind))return m.children.filter(o=>o.isMesh).length===3&&m.children.filter(o=>o.isLine).length===3&&m.rotation.y===Math.atan2(f.heading.x,f.heading.z)+Math.PI;const src=f.groundKind==='was'?craftMeshes[f.team].was:shipMeshes[f.team][f.groundKind==='sea'?(groundNavalModel(f)||f.type):'cv'];return m.children.length===1&&m.children[0].geometry!==src.geometry&&[...m.children[0].geometry.attributes.position.array].every((v,i)=>v===src.geometry.attributes.position.array[i]);})`);
  ctx.location.search='?groundModels='+encodeURIComponent(`vehicle:${ctx.testKey}:0.7:one,infantry:${ctx.testKey}:0.5:squad6,fighter:${ctx.testKey}:0.8:v3,sea:cl:${ctx.testKey}:1.1:line3`);run('initModels();');
  check('兵科と統合した海艦のキーだけを差し替える',`fleets.every(f=>f.groundModel.userData.groundShape===!!groundModelFor(f.groundKind==='sea'?'sea:'+(groundNavalModel(f)||f.type):f.groundKind))`);
  check('編隊の全座標・大きさ・新モデルの向き',`fleets.filter(f=>f.groundModel.userData.groundShape).every(f=>{const m=f.groundModel,s=groundModelFor(f.groundKind==='sea'?'sea:'+(groundNavalModel(f)||f.type):f.groundKind);return m.children.length===s.offsets.length&&m.children.every((b,i)=>b.scale.x===s.size&&b.position.x===s.offsets[i][0]*s.size&&b.position.y===0&&b.position.z===s.offsets[i][1]*s.size&&b.geometry===m.children[0].geometry&&b.material===m.children[0].material)&&m.rotation.y===Math.atan2(f.heading.x,f.heading.z);})`);
  check('各隊の材質は独立、陣営色・頂点色・透過を保持',`(()=>{const list=fleets.filter(f=>f.groundModel.userData.groundShape),mats=list.map(f=>f.groundModel.children[0].material);return new Set(mats).size===mats.length&&list.every(f=>{const m=f.groundModel.children[0].material;return m.vertexColors&&m.transparent&&m.userData.baseOpacity===1&&m.emissive.equals(TEAM_COL[f.team])&&m.color.equals(TEAM_COL[f.team].clone().multiplyScalar(.5));});})()`);
  check('高度表示で編隊全体を薄くし戻せる',`(()=>{const f=fleets.find(f=>f.groundKind==='infantry');groundView='high';groundDraw();const dim=f.groundModel.children.every(m=>m.material.opacity===groundRules().dimOpacity);groundView='all';groundDraw();return dim&&f.groundModel.children.every(m=>m.material.opacity===1);})()`);
  check('死亡・搭載・不在・未発見は引き続き非表示',`(()=>{const f=fleets.find(f=>f.groundKind==='infantry');f.alive=false;groundDraw();const dead=!f.groundModel.visible;f.alive=true;f.embarked={};groundDraw();const cargo=!f.groundModel.visible;f.embarked=null;const absent=groundAbsent;groundAbsent=t=>t===f;groundDraw();const away=!f.groundModel.visible;groundAbsent=absent;const seen=groundSeenBy;groundSeenBy=()=>false;groundDraw();const hidden=fleets.filter(f=>f.team===1).every(f=>!f.groundModel.visible);groundSeenBy=seen;return dead&&cargo&&away&&hidden;})()`);
  ctx.location.search='?groundModels='+encodeURIComponent(`vehicle@earth:${ctx.testKey}:.4:line4,vehicle@mars:${ctx.testKey}:.9:box4`);
  run('initModels();');
  check('陣営の省略はチーム1だけ共和国',`fleets.filter(f=>f.groundKind==='vehicle').every(f=>f.groundModel.children[0].scale.x===(f.team===1?.9:.4))`);
  run(`fleets[0].side='mars';fleets[fleets.length-1].side='earth';groundInit();`);
  check('明示した陣営とチームの既定陣営を渡す',`fleets.filter(f=>f.groundKind==='vehicle').every(f=>{const s=groundModelFor('vehicle',f.side||(f.team===1?'mars':'earth'));return f.groundModel.children.length===s.offsets.length&&f.groundModel.children[0].scale.x===s.size;})`);
  check('編隊全体は部隊の地形高度を共有',`(()=>{groundDraw();return fleets.every(f=>f.groundModel.position.y===f.pos.y+(f.band==='ground'?.15:0));})()`);
  ctx.location.search='?groundModels='+encodeURIComponent(`infantry:${ctx.testKey}:.5:squad6:${ctx.testKey}`);run('initModels();');
  check('移動形は同じ位置・材質で最初は非表示',`(()=>{const m=fleets.find(f=>f.groundKind==='infantry').groundModel,p=m.userData.pose;return p.stand.length===6&&p.move.length===6&&p.stand.every((b,i)=>b.visible&&!p.move[i][0].visible&&b.position.equals(p.move[i][0].position)&&b.scale.equals(p.move[i][0].scale)&&b.material===p.move[i][0].material);})()`);
  ctx.gameSec=1;
  check('命令があっても移動していなければ立つ',`(()=>{const f=fleets.find(f=>f.groundKind==='infantry');f.order={type:'move'};groundDraw();return f.groundModel.userData.pose.stand.every(b=>b.visible);})()`);
  check('命令なしの実移動でも移動形へ切り替える',`(()=>{const f=fleets.find(f=>f.groundKind==='infantry');f.order=null;f.pos.x+=.1;groundDraw();const p=f.groundModel.userData.pose;return p.move.every(m=>m.length===1&&m[0].visible)&&p.stand.every(b=>!b.visible);})()`);
  ctx.gameSec=1.399;
  check('停止後0.4秒未満は移動形を保つ',`(groundDraw(),fleets.find(f=>f.groundKind==='infantry').groundModel.userData.pose.move.every(m=>m[0].visible))`);
  ctx.gameSec=1.401;
  check('停止後0.4秒で立つ形に戻る',`(groundDraw(),fleets.find(f=>f.groundKind==='infantry').groundModel.userData.pose.stand.every(b=>b.visible))`);
  ctx.location.search='?groundModels='+encodeURIComponent(`infantry:${ctx.testKey}:.5:squad6:${ctx.stepKeys.join('+')}`);run('initModels();');
  check('各歩行形は全員で形状と隊の材質を共有する',`(()=>{const p=fleets.find(f=>f.groundKind==='infantry').groundModel.userData.pose;return p.move.length===6&&p.move.every((moves,i)=>moves.length===2&&moves.every((b,j)=>!b.visible&&b.geometry===p.move[0][j].geometry&&b.material===p.stand[i].material&&b.position.equals(p.stand[i].position)));})()`);
  check('6人は各時刻に一つの形だけを表示し全員同じ足を出し続けない',`(()=>{
    const f=fleets.find(f=>f.groundKind==='infantry'),p=f.groundModel.userData.pose,patterns=[];
    for(const t of [0,.1,.3,.6,1,1.5,2,3,5]){gameSec=t;f.pos.x+=.01;groundDraw();
      if(!p.stand.every(b=>!b.visible)||!p.move.every(m=>m.filter(b=>b.visible).length===1))return false;
      patterns.push(p.move.map(m=>m.findIndex(b=>b.visible)));
    }
    return patterns.some(a=>new Set(a).size===2)&&patterns[0].every((_,i)=>new Set(patterns.map(a=>a[i])).size===2)&&p.clocks.every(c=>c.stepSec>=.45*.8&&c.stepSec<=.45*1.25)&&new Set(p.clocks.map(c=>c.stepSec)).size===6;
  })()`);
  check('停止中の再描画で歩調が変わらず再初期化しても同じ時計',`(()=>{const f=fleets.find(f=>f.groundKind==='infantry'),p=f.groundModel.userData.pose,clocks=JSON.stringify(p.clocks),visible=()=>JSON.stringify(p.move.map(m=>m.map(b=>b.visible))),before=visible();groundDraw();if(visible()!==before)return false;groundInit();return clocks===JSON.stringify(f.groundModel.userData.pose.clocks);})()`);
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/mockups/models/example.json'),'utf8')),html=build({...config,intro:'</script><img src=x>'});
  assert.equal((html.match(/<script src=/g)||[]).length,1);count++;
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,3);for(const s of scripts)new vm.Script(s[1]);count++;
  assert.ok(html.includes('\\u003c/script>')&&!html.includes('<img src=x>'));count++;
  // Run the built sheet with a DOM/renderer stub: exercise real formations, bounds and colour toggles without Chromium.
  const groups=[],elements=[],renders=[],THREE={...ctx.THREE};let drawFrame,intersect;
  THREE.Group=class extends ctx.THREE.Group{constructor(){super();groups.push(this);}};
  THREE.WebGLRenderer=class{setPixelRatio(){}setSize(){}render(scene,camera){renders.push({scene,camera});}};
  const element=tag=>{const e={tag,children:[],dataset:{},style:{},events:{},clientWidth:300,clientHeight:200,getContext:()=>({drawImage(){}}),setPointerCapture(){},appendChild(c){this.children.push(c);c.parentNode=this;},setAttribute(){},addEventListener(name,fn){this.events[name]=fn;}};elements.push(e);return e;};
  const nodes=Object.fromEntries(['groups','heading','intro'].map(id=>[id,element('div')]));
  const sheetConfig={title:'test',groups:[{title:'forms',items:[
    {label:'earth',table:'ground',key:ctx.testKey,form:'squad6',side:'earth'},
    {label:'mars',table:'ship',key:'cv',form:'box4',side:'mars'},
    {label:'toggle',table:'craft',key:'was',form:'v3'},
    {label:'default',table:'ground',key:ctx.testKey}
  ]}]};
  const sheetHtml=build(sheetConfig),sheetScripts=[...sheetHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const sheet=vm.createContext({THREE,document:{getElementById:id=>nodes[id],createElement:element,querySelectorAll:()=>[],addEventListener(){}},window:{devicePixelRatio:1},requestAnimationFrame:fn=>{drawFrame=fn;return 1;},
    IntersectionObserver:class{constructor(fn){intersect=fn;}observe(){}},ResizeObserver:class{observe(){}}});
  for(const script of sheetScripts)vm.runInContext(script[1],sheet);
  const formations=vm.runInContext('GROUND_FORMS',sheet);
  assert.equal(groups.length,4);
  groups.forEach((g,i)=>{const offsets=formations[sheetConfig.groups[0].items[i].form||'one'];assert.equal(g.children.length,offsets.length);g.children.forEach((b,j)=>{assert.equal(b.position.x,offsets[j][0]);assert.equal(b.position.z,offsets[j][1]);});
    const bounds=new THREE.Box3().setFromObject(g);assert.ok(bounds.getCenter(new THREE.Vector3()).length()<1e-6);});count++;
  const colours=()=>groups.map(g=>g.children[0].material.emissive.clone()),before=colours();
  sheet.window.MODEL_SHEET.setFaction(1);const after=colours();
  assert.ok(before[0].equals(after[0])&&before[1].equals(after[1])&&!before[2].equals(after[2])&&!before[3].equals(after[3]));
  sheet.window.MODEL_SHEET.setFaction(0);colours().forEach((c,i)=>assert.ok(c.equals(before[i])));count++;
  assert.deepEqual(elements.filter(e=>e.className==='side-tag').map(e=>e.textContent),['地球連合','惑星共和国']);count++;
  assert.throws(()=>build({...sheetConfig,groups:[{title:'bad',items:[{label:'bad',key:ctx.testKey,table:'ground',side:'invalid'}]}]}),/side/);count++;
  sheet.window.MODEL_SHEET.freeze();
  intersect(elements.filter(e=>e.tag==='article').map(target=>({target,isIntersecting:true})));drawFrame(1000);
  for(const {scene,camera} of renders){
    const box=new THREE.Box3().setFromObject(scene.children.find(o=>o.isGroup)),projected=new THREE.Box2();
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);projected.expandByPoint(new THREE.Vector2(p.x,p.y));}
    // Fixed-size strips deliberately use their requested pixel size instead of the 85% fit.
    const size=projected.getSize(new THREE.Vector2());assert.ok(Math.max(size.x,size.y)<=1.700001);
  }count++;
  const canvas=elements.find(e=>e.className==='large'),reset=elements.find(e=>e.className==='reset-view');
  const span=()=>{drawFrame(1000);const c=renders[renders.length-1].camera;return c.right-c.left;};
  let prevented=false;const wheel=deltaY=>canvas.events.wheel({deltaY,deltaMode:0,preventDefault(){prevented=true;}});
  wheel(-100);assert.equal(prevented,false);
  canvas.events.pointerdown({pointerId:1,clientX:0,clientY:0});canvas.events.pointerup({pointerId:1});
  // Make this the only visible card, so the most recent render is its large view.
  intersect(elements.filter(e=>e.tag==='article').map((target,i)=>({target,isIntersecting:i===0})));drawFrame(1000);
  reset.events.click();const initial=span();wheel(-1e6);assert.equal(prevented,true);assert.ok(Math.abs(span()/initial-.2)<1e-6);
  wheel(1e6);assert.ok(Math.abs(span()/initial-2)<1e-6);reset.events.click();assert.ok(Math.abs(span()-initial)<1e-6);
  canvas.events.pointerdown({pointerId:1,clientX:0,clientY:0});canvas.events.pointerdown({pointerId:2,clientX:100,clientY:0});
  canvas.events.pointermove({pointerId:2,clientX:200,clientY:0});assert.ok(Math.abs(span()/initial-.5)<1e-6);count++;
  const {options,movingShot,rowFrame}=require('../tools/ground-model-shots.cjs'),override=`vehicle@earth:${ctx.testKey}:.7:line4,vehicle@mars:${ctx.testKey}:.9:box4`;
  assert.equal(options(['--all','--models',override,'--out','.shots/all']).models,override);assert.equal(options(['--all']).all,true);assert.equal(options(['--no-labels','--moving'])['no-labels'],true);assert.equal(options(['--moving']).moving,true);assert.throws(()=>options(['--unknown']),/Usage/);count++;
  // Execute the tool's actual pre-start setup and layout in the game's node context.
  const shotSource=fs.readFileSync(path.join(__dirname,'../tools/ground-model-shots.cjs'),'utf8');
  const setup=shotSource.slice(shotSource.indexOf('page.evaluate(all=>{')+'page.evaluate('.length,shotSource.indexOf(',!!opt.all);'));
  ctx.WOS={start:cfg=>{ctx.shotConfig=cfg;}};ctx.setSpeed=()=>{};
  run(`(${setup})(true)`);
  const kinds=Object.keys(ctx.groundRuleSet().unitTypes),operation=ctx.WOS_DATA.operations.find(o=>o.id==='groundExercise2');
  assert.deepEqual(Array.from(ctx.shotConfig.fleets,f=>f.groundKind),kinds);
  assert.deepEqual(Array.from(operation.enemies,f=>f.groundKind),kinds);assert.equal(operation.groundSea.length,0);
  assert.ok(operation.quick.some(f=>ctx.groundRuleSet().unitTypes[f.groundKind].permissionOnly));count++;
  ctx.location.search='';run(`op=WOS_DATA.operations.find(o=>o.id==='groundExercise2');fleets=[...op.quick.map(groundUnitSpec).map(s=>makeFleet(0,s)),...op.enemies.map(groundUnitSpec).map(s=>makeFleet(1,s))];groundInitOrg(null);groundBoard=new THREE.Group();groundInit();`);
  ctx.scene=new ctx.THREE.Scene();run('scene.add(groundBoard);');ctx.camera=new ctx.THREE.PerspectiveCamera(50,1600/900,.1,3000);
  const layout=shotSource.slice(shotSource.indexOf('page.evaluate(line=>{')+'page.evaluate('.length,shotSource.indexOf('},line);')+1);
  const framing=run(`(${layout})(true)`);
  const teams=[0,1].map(team=>ctx.fleets.filter(f=>f.team===team));
  for(const list of teams){
    assert.equal(list.length,kinds.length);const rows=new Map();
    for(const f of list){const row=rows.get(f.pos.z)||[];row.push(f.pos.x);rows.set(f.pos.z,row);assert.equal(f.el.querySelector('.nm').style.display,'block');}
    assert.equal(rows.size,Math.ceil(kinds.length/6));for(const row of rows.values()){assert.ok(row.length<=6);row.sort((a,b)=>a-b);for(let i=1;i<row.length;i++)assert.ok(Math.abs(row[i]-row[i-1]-6.4)<1e-6);}
  }
  assert.ok(Math.min(...teams[0].map(f=>f.pos.z))>Math.max(...teams[1].map(f=>f.pos.z)));
  assert.ok(Number.isFinite(framing.dist)&&framing.dist>0);count++;
  for(const team of [0,1])for(let row=0;row<Math.ceil(kinds.length/6);row++){
    const framing=run(`(${rowFrame.toString()})(${JSON.stringify({team,row})})`),shown=ctx.fleets.filter(f=>!ctx.window.modelShotAbsent(f)&&f.groundModel.visible);
    assert.equal(shown.length,Math.min(6,kinds.length-row*6));assert.ok(shown.every(f=>f.team===team));
    const direction=new ctx.THREE.Vector3().fromArray(framing.direction);assert.ok(Math.abs(Math.asin(direction.y)*180/Math.PI-40)<1e-6);assert.equal(Math.sign(direction.z),team?1:-1);
    ctx.camera.position.fromArray(framing.target).addScaledVector(direction,framing.dist);ctx.camera.lookAt(new ctx.THREE.Vector3().fromArray(framing.target));ctx.camera.updateMatrixWorld(true);
    for(const f of shown){const box=new ctx.THREE.Box3().setFromObject(f.groundModel);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new ctx.THREE.Vector3(x,y,z).project(ctx.camera);assert.ok(Math.abs(p.x)<=.860001&&Math.abs(p.y)<=.860001);}}
  }count++;
  run('groundAbsent=window.modelShotAbsent;');
  ctx.location.search='?groundModels='+encodeURIComponent(`infantry:${ctx.testKey}:.5:squad6:${ctx.stepKeys.join('+')}`);run('groundInit();');
  const places=ctx.fleets.map(f=>f.pos.clone());let steps=0;
  ctx.step=dt=>{steps++;ctx.gameSec+=dt;};run(`(${movingShot.toString()})()`);
  assert.equal(steps,20);ctx.fleets.forEach((f,i)=>assert.ok(f.pos.equals(places[i])));
  assert.ok(ctx.fleets.filter(f=>f.groundModel.userData.pose).every(f=>f.groundModel.userData.pose.move.every(m=>m.filter(b=>b.visible).length===1)));count++;
  ctx.location.search='';run('Object.assign(GROUND_MODELS,APPROVED_MODELS);initModels();');
  check('差し替えなしで陸と空の全部隊が採用の形、海艦は従来表示',`fleets.every(f=>f.groundModel.userData.groundShape===(f.groundKind!=='sea'))&&fleets.filter(f=>f.groundKind==='was').every(f=>f.groundModel.children[0].scale.x===.75)`);
  console.log(`| 地上模型・差し替え・見本（ブラウザ不要） | ${count}/${count} 成功 |`);
}
if(require.main===module)nodeChecks();
module.exports={nodeChecks};
