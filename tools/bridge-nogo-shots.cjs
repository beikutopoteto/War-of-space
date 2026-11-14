/* node tools/bridge-nogo-shots.cjs: 架橋の案内輪と不可帯。PCとmobile条件の写真だけを作る。 */
const fs=require('fs'),path=require('path');
const {openGame,ROOT}=require('./browser.cjs');
(async()=>{
  fs.mkdirSync(path.join(ROOT,'test-results'),{recursive:true});
  const {browser,page,errors}=await openGame({width:1600,height:900});
  try{
    const devices=[{name:'desktop',viewport:{width:1600,height:900}},{name:'mobile',viewport:{width:390,height:780},deviceScaleFactor:3,isMobile:true}];
    for(const device of devices){
      const p=device.name==='desktop'?page:await browser.newPage(device);
      if(p!==page){
        p.on('pageerror',e=>errors.push(e.message));
        const three=path.dirname(require.resolve('three/package.json'));
        await p.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/,r=>{const u=r.request().url(),rel=u.includes('cdnjs')?'build/three.min.js':u.split('three@0.128.0/')[1];return r.fulfill({path:path.join(three,rel),contentType:'application/javascript'});});
        await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({body:''}));
        await p.goto('file://'+path.join(ROOT,'index.html'));await p.waitForFunction(()=>window.WOS);
      }
      await p.evaluate(()=>{WOS.start({op:'baikonur',tutorial:true});if(talking)endTalk();setSpeed(0);});
      // 写真用の固定場面。架橋段のデータを読み、その案内輪を実際に描く。
      await p.evaluate(()=>{
        if(deploying)endDeploy();tutorial.step=op.tutorial.findIndex(r=>r.condition==='groundBridge');
        groundDrillEnter();tutorialRender();
      });
      await p.evaluate(()=>{
        select(groundDrillUnit(groundDrillRow().actor));groundCommandBarHud(orderTargets());
        if(!groundBridgeNoGo?.visible||!groundBridgeNoGo.children.length)throw new Error('不可帯がない');
        camAnim=null;
        const m=groundDrillRow().marks[0],at=new THREE.Vector3(m.pos[0],groundHeight(...m.pos),m.pos[1]);
        controls.target.copy(at);camera.position.copy(at).add(new THREE.Vector3(0,70,38));camera.lookAt(at);controls.update();camera.updateMatrixWorld(true);
        groundDraw();tutorialRender();
      });
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const file=path.join(ROOT,'test-results',`bridge-nogo-${device.name}.png`);
      await p.screenshot({path:file,timeout:120000});
      if(errors.length)throw new Error(errors.join('\n'));
      console.log(file);
      await p.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
