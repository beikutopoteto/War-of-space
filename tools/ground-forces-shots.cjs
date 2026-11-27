/* node tools/ground-forces-shots.cjs
   実際の出撃画面を .shots/ground-forces/ に撮る。撮影用の編成は新規ブラウザ内だけに保存する。 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openGame,ROOT}=require('./browser.cjs');
const {seedSupplySortie}=require('../tests/ground-forces.cjs');
const {openSortieMenu}=require('../tests/ground-drill-menu.cjs');

const out=path.join(ROOT,'.shots','ground-forces');
const lineup=[
  [['infantry',4],['infantry',4],['supply',2]],
  [['vehicle',4],['apc',4],['engineer',3]],
  [['artillery',4],['infantry',2],['scout',1]],
  [['was',4],['was',2],['heavyInfantry',1]],
  [['infantry',4],['infantry',4],['infantry',3]],
  [['fighter',4],['fighter',4]],
  [['vehicle',4],['heavyInfantry',3],['apc',1]],
  [['scout',4],['scout',4],['scout',1]]
];

async function capture(viewport,mobile){
  const {browser,page,errors}=await openGame(viewport,{isMobile:mobile,scale:mobile?3:1});
  const checkErrors=()=>assert.deepEqual(errors,[]);
  try{
    await page.evaluate(seedSupplySortie);
    await page.evaluate(lineup=>{
      const save=JSON.parse(localStorage.getItem('wos.save.v1')), companies=[];
      const battalions=lineup.map((rows,i)=>({id:'gb'+(i+1),name:`第${i+1} 大隊`,companies:rows.map(([kind,platoons])=>{
        const n=companies.length+1,id='gc'+n;
        companies.push({id,name:`第${n} ${WOS_GROUND_ORG.types()[kind].name}中隊`,kind,platoons});
        return id;
      })}));
      const brigades=[['gb1','gb2','gb3'],['gb4','gb5'],['gb6','gb7']].map((ids,i)=>({id:'gr'+(i+1),name:`第${i+1} 旅団`,battalions:ids}));
      save.groundOrg={companies,battalions,brigades};
      localStorage.setItem('wos.save.v1',JSON.stringify(save));
    },lineup);
    await openSortieMenu(page,{reload:true});
    await page.click('[data-op="baikonur"]');
    await page.click('#goBattle');
    assert.equal(await page.locator('#groundForcesMap').getAttribute('data-terrain'),'baikonur2');
    assert.equal(await page.locator('#menuBg').isVisible(),false);
    await page.click('[data-ground-sortie="brigade:gr3"]');
    await page.click('[data-ground-sortie="battalion:gb8"]');
    const shoot=async (name,values,over)=>{
      assert.deepEqual(await page.locator('#sgLoad .load td:nth-child(2)').allTextContents(),values);
      assert.equal(await page.locator('#sgLoad .over').count(),over);
      assert.equal(await page.locator('#forcesBattle').isEnabled(),true);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      checkErrors();
      const file=path.join(out,name);
      await page.screenshot({path:file,animations:'disabled'});
      console.log(path.relative(ROOT,file));
    };
    await shoot(mobile?'ground-forces-iphone.png':'ground-forces-a.png',['46 / 64小隊','75 / 108'],0);
    if(!mobile){
      await page.click('[data-ground-sortie="brigade:gr3"]');
      await shoot('ground-forces-b.png',['62 / 64小隊','118 / 108'],1);
    }
    checkErrors();
  }finally{
    await browser.close();
  }
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  await capture({width:1600,height:900},false);
  // ページの viewport meta は足さず、390×780 のタッチ端末を DPR 3 で撮影する。
  await capture({width:390,height:780},true);
})().catch(e=>{ console.error(e); process.exitCode=1; });
