/* km変換・出撃地点と制限。固定配備は変更前に撮った実ゲームのJSONと比べる。 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {collectStarts,compareStarts}=require('../tools/ground-start-snapshot.cjs');
function nodeChecks(){
  const {ctx,run,read}=require('./ground-landing.cjs').createGroundContext(),rows=[];
  run(read('data/ground-org.js'));
  const check=(name,fn)=>{try{fn();rows.push({name,ok:true});}catch(e){rows.push({name,ok:false,error:e.stack});}};
  const yes=code=>assert.equal(run(code),true);
  run("op=WOS_DATA.operations.find(o=>o.id==='groundExercise2');");
  check('km変換は入力を変えず、段の省略・海艦・搭載中隊と旧形式を扱う',()=>{
    yes(`(()=>{const u={name:'艦',kind:'sea',at:[12,5],band:'sea',type:'dd',team:1,groundLanding:true,
      groundCargo:[{name:'歩兵',kind:'infantry',at:[12,5],stance:'evade',vis:9,stl:0}]};
      const before=JSON.stringify(u),a=groundUnitSpec(u),b=groundUnitSpec(u),p=groundPoint(12,5),c=a.groundCargo[0];
      a.pos[0]=123;c.pos[0]=456;return JSON.stringify(u)===before&&b!==a&&b.groundCargo!==a.groundCargo&&
        b.pos[0]===p.x&&b.pos[1]===p.z&&b.groundKind==='sea'&&b.type==='dd'&&b.team===1&&b.groundLanding&&
        c.groundKind==='infantry'&&c.band==='ground'&&c.type==='cv'&&c.n===1&&c.scale===.3&&c.alt===0&&c.stance==='evade'&&c.vis===9&&c.stl===0&&groundUnitSpec(b)===b;})()`);
  });
  check('旧演習の6枠を維持し7中隊目は0.6km東へ置く',()=>{
    yes(`(()=>{const org=window.WOS_GROUND_ORG.defaults();org.companies.push({id:'extra',name:'追加',kind:'infantry'});
      const before=JSON.stringify(org),f=groundSortieForces(op,org).fleets;
      return JSON.stringify(org)===before&&f.length===7&&f[0].pos[0]===-64&&f[0].pos[1]===-36&&f[5].pos[1]===-28&&
        f.every((u,i)=>{const slot=op.groundSortie.slots[i%6],p=groundPoint(slot[0]+Math.floor(i/6)*.6,slot[1]);return u.pos[0]===p.x&&u.pos[1]===p.z;});})()`);
  });
  run("op=WOS_DATA.operations.find(o=>o.id==='baikonur');");
  check('全兵科は本営Aの8km内の重ならない通行可能な点へ置く',()=>{
    yes(`(()=>{const companies=Object.keys(window.WOS_GROUND_ORG.types()).map((kind,i)=>({id:'all'+i,name:kind,kind}));
      const f=groundSortieForces(op,{companies}).fleets,site=groundData().sites.find(s=>s.id==='A');
      return f.length===companies.length&&new Set(f.map(u=>u.pos.join())).size===f.length&&f.every(u=>{
        const x=groundMapX(u.pos[0]),y=groundMapY(u.pos[1]),move=groundMoveKind(u);
        return Math.hypot(x-site.x,y-site.y)<=8&&groundPass(x,y,move,false)&&(move==='air'||groundData().water.rivers.every(r=>{const p=groundRiverAt(x,y,r);return p.dist>=p.width/2+.12;}));});})()`);
  });
  check('禁止兵科を除いて編成順の上限を使い、大隊の参照も絞る',()=>{
    yes(`(()=>{const org=window.WOS_GROUND_ORG.defaults(),before=JSON.stringify(org),o={...op,groundSortie:{...op.groundSortie,maxCompanies:2,bannedKinds:['vehicle']}};
      const s=groundSortieForces(o,org);return JSON.stringify(org)===before&&s.fleets.map(f=>f.companyId).join()==='gc2,gc3'&&s.org.companies.length===2&&
        s.org.battalions.flatMap(b=>b.companies).join()==='gc2,gc3'&&groundSortieForces({...o,groundSortie:{...o.groundSortie,maxCompanies:0}},org).fleets.length===0;})()`);
  });
  check('1kmずつ半径を広げ、最大2倍でも不足すればエラーにする',()=>{
    yes(`(()=>{const companies=Array.from({length:40},(_,i)=>({id:'many'+i,name:'歩兵'+i,kind:'infantry'}));
      const s=groundSortieForces(op,{companies}),site=groundData().sites.find(s=>s.id==='A');
      return s.fleets.some(f=>Math.hypot(groundMapX(f.pos[0])-site.x,groundMapY(f.pos[1])-site.y)>4)&&s.fleets.every(f=>Math.hypot(groundMapX(f.pos[0])-site.x,groundMapY(f.pos[1])-site.y)<=8);})()`);
    assert.throws(()=>run(`groundSortieForces(op,{companies:Array.from({length:200},(_,i)=>({id:'x'+i,kind:'infantry'}))})`),/出撃地点/);
    assert.throws(()=>run('groundSortieForces({...op,groundSortie:null})'),/groundSortie/);
  });
  check('固定／クイックは編成制限を受けず、旧形式cfgも維持する',()=>{
    yes(`(()=>{const o={...op,groundSortie:{...op.groundSortie,maxCompanies:0,bannedKinds:['infantry']}};
      const quick=groundResolveForces(o,{fleets:o.quick}),legacy={name:'旧',groundKind:'vehicle',pos:[1,2]},old=groundResolveForces(o,{fleets:[legacy]});
      return quick.fleets.length===11&&!quick.org&&old.fleets[0]===legacy&&groundResolveForces({...o,forces:'fixed'},{}).fleets.length===11;})()`);
  });
  check('視点と案内のkm変換は地形切替・やり直しで累積しない',()=>{
    yes(`(()=>{const source=op,t=source.groundTutorial;
      op={...source,...t};groundSetupCoordinates();const first=JSON.stringify([op.view.target,op.tutorial.map(r=>r.marks)]);
      op=source;groundSetupCoordinates();op={...source,...t};groundSetupCoordinates();
      return JSON.stringify([op.view.target,op.tutorial.map(r=>r.marks)])===first&&op.view.target.join()==='-56,-40';})()`);
  });
  return rows;
}
async function checkGroundForces(page,check){
  const before=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ground-start-before.json'),'utf8'));
  const after=await collectStarts(page);
  for(const [id,message] of Object.entries(compareStarts(before,after)))check(true,'出撃の写し: '+id+' '+message);
  const placement=await page.evaluate(()=>{
    WOS.start({op:'baikonur',groundOrg:WOS_GROUND_ORG.defaults()});setSpeed(0);
    const site=groundData().sites.find(s=>s.id==='A');
    return fleets.filter(f=>f.team===0&&!f.embarked&&f.groundKind!=='sea').map(f=>{
      const x=groundMapX(f.pos.x),y=groundMapY(f.pos.z);
      return {name:f.name,kind:f.groundKind,at:[x,y],distanceKm:Math.hypot(x-site.x,y-site.y),passable:groundPass(x,y,groundMoveKind(f)),alt:f.pos.y};
    });
  });
  check(placement.length===6&&placement.every(p=>p.distanceKm<=8&&p.passable),'編成の開始位置: 全6中隊がAから8km内で通行可能');
  fs.writeFileSync(path.join(__dirname,'../test-results/forces-placement.json'),JSON.stringify(placement,null,2)+'\n');
}
module.exports={nodeChecks,checkGroundForces};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'✓ ':'✗ ')+r.name+(r.error?' '+r.error:''));assert(rows.every(r=>r.ok));}
