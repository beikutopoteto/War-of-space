/* 5種類の地上出撃の開始状態。node tools/ground-start-snapshot.cjs before|after
   同じ collectStarts を ground 組でも使う。写真は1600×900で .shots/ へ。 */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');
const starts=[['exercise-org','groundExercise2',false,false],['exercise-quick','groundExercise2',true,false],
  ['baikonur-quick','baikonur',true,false],['baikonur-org','baikonur',false,false],['tutorial2','baikonur',false,true]];
async function collectStarts(page,{photos=false,suffix=''}={}){
  const out={};
  for(const [id,opId,quick,tutorial] of starts){
    out[id]=await page.evaluate(({opId,quick,tutorial})=>{
      const source=OPS.find(o=>o.id===opId),cfg={op:opId,groundOrg:WOS_GROUND_ORG.defaults()};
      if(quick)cfg.fleets=source.quick;if(tutorial)cfg.tutorial=true;
      WOS.start(cfg);setSpeed(0);
      const round=n=>+n.toFixed(2),at=p=>[round(groundMapX(p.x)),round(groundMapY(p.z))];
      const unit=f=>({name:f.name,kind:f.groundKind,band:f.band,team:f.team,at:at(f.pos),alt:round(f.pos.y),
        ...(f.groundKind==='sea'?{type:f.type,cargo:groundPassengers(f).map(p=>p.name)}:{}),...(f.embarked?{embarked:f.embarked.name}:{})});
      return {units:fleets.map(unit),marks:(op.tutorial||[]).map(r=>({name:r.name,marks:(r.marks||[]).map(m=>({label:m.label,at:at({x:m.pos[0],z:m.pos[1]}),alt:m.alt||0}))})),
        view:{at:at({x:op.view.target[0],z:op.view.target[1]}),dist:op.view.dist,dir:op.view.dir,max:op.view.max},
        opening:{target:at(camAnim.tT),alt:round(camAnim.tT.y),position:at(camAnim.tP),height:round(camAnim.tP.y)}};
    },{opId,quick,tutorial});
    if(photos){
      await page.evaluate(()=>{if(camAnim){controls.target.copy(camAnim.tT);camera.position.copy(camAnim.tP);camAnim=null;controls.update();camera.updateMatrixWorld(true);}});
      await page.waitForTimeout(350);
      await page.screenshot({path:path.join(ROOT,'.shots',id+'-'+suffix+'.png')});
    }
  }
  return out;
}
function compareStarts(before,after){
  const differences={};
  for(const [id] of starts){
    const a=structuredClone(before[id]),b=structuredClone(after[id]);
    if(id==='baikonur-org')for(let i=0;i<a.units.length;i++)if(a.units[i].team===0&&a.units[i].kind!=='sea'&&!a.units[i].embarked){
      // 高度は地表の移動に伴う差だけを許す（航空は段の高度を維持）。
      b.units[i].at=a.units[i].at;b.units[i].alt=a.units[i].alt;
    }
    assert.deepEqual(b,a,id+' の許可されていない開始状態の差');
    differences[id]=id==='baikonur-org'?'編成中隊の位置（地表高度を含む）だけ変更':'同じ';
  }
  return differences;
}
module.exports={collectStarts,compareStarts};
if(require.main===module)(async()=>{
  const suffix=process.argv[2]||'after';assert(['before','after'].includes(suffix));
  fs.mkdirSync(path.join(ROOT,'test-results'),{recursive:true});fs.mkdirSync(path.join(ROOT,'.shots'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{const result=await collectStarts(page,{photos:true,suffix});assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(ROOT,'test-results','forces-'+suffix+'.json'),JSON.stringify(result,null,2)+'\n');
    console.log('forces-'+suffix+'.json: '+Object.keys(result).join(', '));
    if(suffix==='after')console.log(compareStarts(JSON.parse(fs.readFileSync(path.join(ROOT,'test-results/forces-before.json'),'utf8')),result));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
