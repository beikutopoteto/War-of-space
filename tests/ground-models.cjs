/* ブラウザ不要。実際の形・groundInit/groundDraw・見本HTMLを確かめる。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createGroundContext}=require('./ground-landing.cjs'),{build}=require('../tools/model-sheet.cjs');
function nodeChecks(){
  const {ctx,run}=createGroundContext();let count=0;
  const check=(name,code)=>{assert.equal(run(code),true,name);count++;};
  ctx.URLSearchParams=URLSearchParams;ctx.location={search:''};
  run(`globalThis.testKey=Object.keys(GROUND_SHAPES)[0];`);
  check('採用表の全陣営のキーと編隊が存在する',`Object.values(GROUND_MODELS).every(m=>['earth','mars'].every(side=>{const s=m.earth||m.mars?m[side]:m;return !!s&&Object.prototype.hasOwnProperty.call(GROUND_SHAPES,s.key)&&Object.prototype.hasOwnProperty.call(GROUND_FORMS,s.form||'one');}))`);
  check('未採用の兵科は従来表示',`groundModelFor('missing-kind')===null`);
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
  ctx.location.search='';ctx.TEAM_COL=[0x4aa3ff,0xff5a4a].map(c=>new ctx.THREE.Color(c));
  Object.assign(ctx,{labelsEl:{appendChild(){}},proj:p=>({x:p.x,y:p.z,z:0}),SHIP_SIZE:Object.fromEntries(ctx.WOS_DATA.ships.map(s=>[s.id,s.scale*1.2]))});
  run(`groundHud=groundCaptureInit=groundSightInit=()=>{};
    globalThis.shipMeshes=[0,1].map(()=>Object.fromEntries(Object.keys(SHAPES).map(k=>[k,new THREE.Mesh(shapeGeo(k),new THREE.MeshStandardMaterial())])));
    globalThis.craftMeshes=[0,1].map(()=>Object.fromEntries(Object.keys(CRAFT_SHAPES).map(k=>[k,new THREE.Mesh(craftGeo(k),new THREE.MeshStandardMaterial())])));
    globalThis.initModels=()=>{op=WOS_DATA.operations.find(o=>o.id==='groundExercise2');fleets=[...op.quick.map(s=>makeFleet(0,s)),makeFleet(1,op.quick[0])];groundSeaDeploy();groundInitOrg(null);groundBoard=new THREE.Group();groundInit();};initModels();`);
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
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/mockups/models/example.json'),'utf8')),html=build({...config,intro:'</script><img src=x>'});
  assert.equal((html.match(/<script src=/g)||[]).length,1);count++;
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,3);for(const s of scripts)new vm.Script(s[1]);count++;
  assert.ok(html.includes('\\u003c/script>')&&!html.includes('<img src=x>'));count++;
  // Run the built sheet with a DOM/renderer stub: exercise real formations, bounds and colour toggles without Chromium.
  const groups=[],elements=[],THREE={...ctx.THREE};
  THREE.Group=class extends ctx.THREE.Group{constructor(){super();groups.push(this);}};
  THREE.WebGLRenderer=class{};
  const element=tag=>{const e={tag,children:[],dataset:{},style:{},appendChild(c){this.children.push(c);},setAttribute(){},addEventListener(){}};elements.push(e);return e;};
  const nodes=Object.fromEntries(['groups','heading','intro'].map(id=>[id,element('div')]));
  const sheetConfig={title:'test',groups:[{title:'forms',items:[
    {label:'earth',table:'ground',key:ctx.testKey,form:'squad6',side:'earth'},
    {label:'mars',table:'ship',key:'cv',form:'box4',side:'mars'},
    {label:'toggle',table:'craft',key:'was',form:'v3'},
    {label:'default',table:'ground',key:ctx.testKey}
  ]}]};
  const sheetHtml=build(sheetConfig),sheetScripts=[...sheetHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const sheet=vm.createContext({THREE,document:{getElementById:id=>nodes[id],createElement:element,querySelectorAll:()=>[],addEventListener(){}},window:{},requestAnimationFrame:()=>1,
    IntersectionObserver:class{observe(){}},ResizeObserver:class{observe(){}}});
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
  const {options}=require('../tools/ground-model-shots.cjs'),override=`vehicle@earth:${ctx.testKey}:.7:line4,vehicle@mars:${ctx.testKey}:.9:box4`;
  assert.equal(options(['--models',override]).models,override);count++;
  console.log(`| 地上模型・差し替え・見本（ブラウザ不要） | ${count}/${count} 成功 |`);
}
if(require.main===module)nodeChecks();
module.exports={nodeChecks};
