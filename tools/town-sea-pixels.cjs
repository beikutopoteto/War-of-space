/* Sea texture optimization must preserve every byte, including river-mouth plumes. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('child_process'),{openGame,ROOT}=require('./browser.cjs');
const old=execFileSync('git',['show','HEAD:battle/terrain.js'],{cwd:ROOT,encoding:'utf8'}),beforeSetup=old.slice(old.indexOf('function groundSetup(id){'),old.indexOf('// 8方向'));
(async()=>{const {browser,page,errors}=await openGame();try{
 const rows=[];
 for(const id of ['exercise2','baikonur2','field150','field300'])rows.push(await page.evaluate(({id,beforeSetup})=>{
  reset({op:id==='exercise2'?'groundExercise2':id==='baikonur2'?'baikonur':'ground'+id});setSpeed(0);
  const d=groundData(),seaScale=Math.min(10,1024/Math.max(d.meta.widthKm,d.meta.heightKm)),w=Math.ceil(d.meta.widthKm*seaScale),h=Math.ceil(d.meta.heightKm*seaScale),orig=CanvasRenderingContext2D.prototype.putImageData,found=[];
  CanvasRenderingContext2D.prototype.putImageData=function(data,...rest){if(data.width===w&&data.height===h)found.push(data.data.slice());return orig.call(this,data,...rest);};
  try{new Function('return ('+beforeSetup+')')()(id);groundSetup(id);}finally{CanvasRenderingContext2D.prototype.putImageData=orig;}
  if(found.length!==2)throw new Error('Expected exactly two sea textures, found '+found.length);
  let differences=0;for(let i=0;i<found[0].length;i++)if(found[0][i]!==found[1][i])differences++;
  return {id,width:w,height:h,bytes:found[0].length,differences};
 },{id,beforeSetup}));
 if(errors.length)throw new Error(errors.join('\n'));
 fs.writeFileSync(path.join(ROOT,'test-results/town-plan/sea-pixels.json'),JSON.stringify(rows,null,2)+'\n');console.log(rows);assert(rows.every(r=>r.differences===0),'Sea pixels changed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
