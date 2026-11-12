/* 模型の見本を1枚のHTMLにまとめる。--shots は Chromium が使える環境だけで指定する。 */
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const ROOT=path.resolve(__dirname,'..'),CDN='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
function options(args){
  const out={};for(let i=0;i<args.length;i+=2){const k=args[i];if(!['--config','--out','--shots'].includes(k)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: node tools/model-sheet.cjs --config <json> --out <html> [--shots <dir>]');out[k.slice(2)]=args[i+1];}
  if(!out.config||!out.out)throw new Error('--config and --out are required');return out;
}
function validate(config){
  if(!config||typeof config.title!=='string'||!Array.isArray(config.groups))throw new Error('config needs title and groups');
  if(config.pageTitle!=null&&typeof config.pageTitle!=='string')throw new Error('pageTitle must be a string');
  for(const g of config.groups){if(typeof g.title!=='string'||(g.items!=null&&!Array.isArray(g.items))||(g.images!=null&&!Array.isArray(g.images))||(!Array.isArray(g.items)&&!Array.isArray(g.images)))throw new Error('group needs title and items or images');
    for(const image of g.images||[])if(!image||typeof image.src!=='string'||typeof image.caption!=='string')throw new Error('image needs src and caption strings');
    for(const i of g.items||[])if(!i||typeof i.key!=='string'||typeof i.label!=='string'||!['ground','ship','craft'].includes(i.table)||(i.form!=null&&typeof i.form!=='string')||(i.side!=null&&!['earth','mars'].includes(i.side)))throw new Error('item needs label, key, table (ground/ship/craft), form name and optional side (earth/mars)');}
}
/* This function is inlined as a classic script; it needs only THREE, the shape scripts and SHEET_CONFIG. */
function sheetPage(){
  const config=SHEET_CONFIG,root=document.getElementById('groups'),cards=[],teams=['#4aa3ff','#ff5a4a'];let faction=0,raf=0,frozen=false,last=0;
  const text=(tag,value,parent,cls)=>{const e=document.createElement(tag);e.textContent=value||'';if(cls)e.className=cls;parent.appendChild(e);return e;};
  document.getElementById('heading').textContent=config.title;document.getElementById('intro').textContent=config.intro||'';
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  function material(table,side){
    let c=new THREE.Color(teams[side?side==='mars'?1:0:faction]);
    if(table==='craft'){c=c.clone().lerp(new THREE.Color(1,1,1),.35);return new THREE.MeshStandardMaterial({color:c.clone().multiplyScalar(.55),emissive:c,emissiveIntensity:.35,metalness:.2,roughness:.5});}
    return new THREE.MeshStandardMaterial({color:c.clone().multiplyScalar(.5),emissive:c,emissiveIntensity:.22,metalness:.35,roughness:.5,vertexColors:table==='ground'});
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(draw);}
  function addView(parent,label,kind){const wrap=document.createElement('div');parent.appendChild(wrap);const canvas=document.createElement('canvas');canvas.className=kind==='large'?'large':'small';canvas.setAttribute('aria-label',label);wrap.appendChild(canvas);if(label)text('p',label,wrap,'caption');return {canvas,kind};}
  config.groups.forEach((g,index)=>{
    const section=document.createElement('section');section.dataset.group=index;root.appendChild(section);text('h2',g.title,section);text('p',g.note,section,'note');
    if(g.images&&g.images.length){const images=document.createElement('div');images.className='images';section.appendChild(images);
      for(const image of g.images){const figure=document.createElement('figure');images.appendChild(figure);const img=document.createElement('img');img.src=image.src;img.alt=image.caption;figure.appendChild(img);text('figcaption',image.caption,figure,'caption');}}
    const grid=document.createElement('div');grid.className='cards';section.appendChild(grid);
    (g.items||[]).forEach(item=>{
      const el=document.createElement('article');grid.appendChild(el);const label=text('h3',item.label,el);if(item.side)text('span',item.side==='earth'?'地球連合':'惑星共和国',label,'side-tag');text('p',item.note,el,'note');
      const table=item.table==='ground'?GROUND_SHAPES:item.table==='ship'?SHAPES:CRAFT_SHAPES;
      if(!Object.prototype.hasOwnProperty.call(table,item.key)){text('p','missing: '+item.key,el,'missing');return;}
      const geo=item.table==='ground'?groundShapeGeo(item.key,!!item.mono):item.table==='ship'?shapeGeo(item.key):craftGeo(item.key);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#172330');scene.add(new THREE.AmbientLight(0x3a4a66,.9));
      const sun=new THREE.DirectionalLight(0xffe2c0,1.6);sun.position.set(120,80,40);scene.add(sun);const rim=new THREE.DirectionalLight(0x6fa8ff,.7);rim.position.set(-100,30,-120);scene.add(rim);
      const group=new THREE.Group(),mat=material(item.table,item.side);scene.add(group);
      const form=item.form??'one';
      if(!Object.prototype.hasOwnProperty.call(GROUND_FORMS,form))throw new Error('Unknown form: '+form);
      for(const [x,z] of GROUND_FORMS[form]){const body=new THREE.Mesh(geo,mat);body.position.set(x,0,z);group.add(body);}
      const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3());
      group.position.sub(center);const radius=Math.max(.1,extent.length()/2);
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(radius*100,radius*100),new THREE.MeshStandardMaterial({color:'#7f8758',roughness:1}));
      plane.rotation.x=-Math.PI/2;plane.position.y=bounds.min.y-center.y-.015;plane.visible=false;scene.add(plane);
      const views=[addView(el,'斜め上・ドラッグで回転','large')],fixed=document.createElement('div');fixed.className='views';el.appendChild(fixed);
      for(const [label,kind] of [['真横','side'],['真上','top'],['正面','front']])views.push(addView(fixed,label,kind));
      text('p','ゲームでの大きさ',el,'strip-title');const strip=document.createElement('div');strip.className='views';el.appendChild(strip);
      for(const px of [16,32,64])views.push({...addView(strip,px+' px','size'),px});
      const card={el,scene,group,mat,plane,views,item,radius,extent,visible:false,dirty:true,yaw:0,pitch:0,dragged:false,angle:0};cards.push(card);
      const canvas=views[0].canvas;let drag=null;
      canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag=[e.clientX,e.clientY];card.dragged=true;schedule();});
      canvas.addEventListener('pointermove',e=>{if(!drag)return;card.yaw+=(e.clientX-drag[0])*.01;card.pitch=Math.max(-.7,Math.min(.7,card.pitch+(e.clientY-drag[1])*.01));drag=[e.clientX,e.clientY];card.mainDirty=true;schedule();});
      const release=()=>{drag=null;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
    });
  });
  function render(card,view){
    const canvas=view.canvas,w=Math.max(1,Math.round(canvas.clientWidth)),h=Math.max(1,Math.round(canvas.clientHeight)),dpr=window.devicePixelRatio||1;
    const pw=Math.round(w*dpr),ph=Math.round(h*dpr);if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);
    const aspect=w/h,r=card.radius;let span=r*2.3;
    const camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.01,r*400);
    let direction=new THREE.Vector3(1,1.25,1.6);
    if(view.kind==='large'){
      const pitch=Math.max(.1,Math.min(1.5,.65+card.pitch)),yaw=.65+card.yaw+card.angle;
      direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    }else if(view.kind==='side')direction.set(1,0,0);else if(view.kind==='top'){direction.set(0,1,0);camera.up.set(0,0,-1);}else if(view.kind==='front')direction.set(0,0,1);
    camera.position.copy(direction.normalize().multiplyScalar(r*10));camera.lookAt(0,0,0);camera.updateMatrixWorld();
    {
      // Project the centred geometry bounds, including every body in a formation.
      const bounds=new THREE.Box2(),e=card.extent;
      for(const x of [-e.x/2,e.x/2])for(const y of [-e.y/2,e.y/2])for(const z of [-e.z/2,e.z/2]){
        const p=new THREE.Vector3(x,y,z).project(camera);bounds.expandByPoint(new THREE.Vector2(p.x*w/2,p.y*h/2));
      }
      const size=bounds.getSize(new THREE.Vector2());
      if(view.kind==='size')span*=Math.max(size.x,size.y,.01)/view.px;
      else span*=Math.max(size.x/w,size.y/h,.0001)/.7;
    }
    camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
    card.plane.visible=view.kind==='size';renderer.render(card.scene,camera);canvas.getContext('2d').drawImage(renderer.domElement,0,0,pw,ph);
  }
  function draw(now){
    raf=0;const dt=Math.min(.1,(now-(last||now))/1000);last=now;let active=false;
    for(const c of cards){if(!c.visible)continue;const auto=!frozen&&!c.dragged&&!document.hidden;
      if(auto){c.angle+=dt*.12;active=true;}
      if(c.dirty){for(const v of c.views)render(c,v);c.dirty=false;c.mainDirty=false;}
      else if(auto||c.mainDirty){render(c,c.views[0]);c.mainDirty=false;}
    }
    if(active)schedule();
  }
  const observer=new IntersectionObserver(entries=>{for(const e of entries){const c=cards.find(c=>c.el===e.target);c.visible=e.isIntersecting;if(c.visible)c.dirty=true;}schedule();});cards.forEach(c=>observer.observe(c.el));
  const resize=new ResizeObserver(()=>{cards.forEach(c=>c.dirty=true);schedule();});cards.forEach(c=>resize.observe(c.el));
  function setFaction(n){faction=n;document.querySelectorAll('[data-faction]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.faction===n)));for(const c of cards){const m=material(c.item.table,c.item.side);c.mat.copy(m);m.dispose();c.dirty=true;}schedule();}
  document.querySelectorAll('[data-faction]').forEach(b=>b.addEventListener('click',()=>setFaction(+b.dataset.faction)));
  document.addEventListener('visibilitychange',schedule);
  window.MODEL_SHEET={setFaction,freeze(){frozen=true;cards.forEach(c=>{c.angle=c.yaw=c.pitch=0;c.dirty=true;});schedule();},async settle(){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));for(const c of cards){const b=c.el.getBoundingClientRect();c.visible=b.bottom>0&&b.top<innerHeight;if(c.visible)c.dirty=true;}draw(performance.now());}};
  window.MODEL_SHEET_READY=true;schedule();
}
function build(config,configDir=ROOT){
  validate(config);const inline=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/<\/script/gi,'<\\/script');
  const embedded={...config,groups:config.groups.map(g=>({...g,images:(g.images||[]).map(image=>{
    const file=path.resolve(configDir,image.src),ext=path.extname(file).toLowerCase(),mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'}[ext];
    if(!mime)throw new Error('Unsupported image extension: '+file);
    let data;try{data=fs.readFileSync(file);}catch(e){throw new Error('Cannot read group image "'+image.src+'" ('+file+'): '+e.message);}
    return {...image,src:'data:'+mime+';base64,'+data.toString('base64')};
  })}))};
  const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `<title>${escape(config.pageTitle??'地上モデル見本')}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{color-scheme:light;--bg:#f4f5f2;--panel:#fff;--text:#222a31;--muted:#56616a;--border:#ccd2d3;--selected:#e1ebf4;--missing:#a52c27;--view:#172330;--blue:#4aa3ff;--red:#ff5a4a}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#11171b;--panel:#1b2329;--text:#e2e8ec;--muted:#aebac4;--border:#3c4851;--selected:#304654;--missing:#ff9b90}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#11171b;--panel:#1b2329;--text:#e2e8ec;--muted:#aebac4;--border:#3c4851;--selected:#304654;--missing:#ff9b90}
*{box-sizing:border-box}body{background:var(--bg);color:var(--text);font:14px/1.6 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding-block:28px;padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px))}h1{font-size:24px;margin:0}h2{font-size:20px;margin:0}h3{font-size:16px;margin:0}.side-tag{font-size:11px;font-weight:400;color:var(--muted);margin-left:8px}.note,#intro{color:var(--muted);white-space:pre-wrap;margin:6px 0 14px;overflow-wrap:anywhere}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:20px 0 28px}button{font:inherit;font-size:13px;color:var(--text);background:var(--panel);border:1px solid var(--border);padding:4px 10px;cursor:pointer}button[aria-pressed="true"]{background:var(--selected);outline:1px solid var(--text)}button[data-faction="0"]{border-left:4px solid var(--blue)}button[data-faction="1"]{border-left:4px solid var(--red)}section{margin-bottom:36px}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,max(420px,calc(50% - 8px))),1fr));gap:16px;margin-bottom:16px}.images figure{min-width:0;margin:0}.images img{max-width:100%;height:auto;display:block;border:1px solid var(--border)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:16px}article{min-width:0;border:1px solid var(--border);background:var(--panel);padding:12px}canvas{display:block;width:100%;background:var(--view)}canvas.large{aspect-ratio:1.5;touch-action:none;cursor:grab}canvas.small{aspect-ratio:1.15}.views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.caption{font-size:12px;color:var(--muted);margin:3px 0 0}.strip-title{font-size:12px;margin:14px 0 0}.missing{padding:40px 8px;color:var(--missing);border:1px solid var(--border);overflow-wrap:anywhere}
</style><main><h1 id="heading"></h1><p id="intro"></p><div class="controls"><span>陣営</span><button data-faction="0" aria-pressed="true">地球連合</button><button data-faction="1" aria-pressed="false">惑星共和国</button></div><div id="groups"></div></main>
<script src="${CDN}"></script><script>${inline('battle/shapes.js')}</script><script>${inline('battle/ground-shapes.js')}</script>
<script>const SHEET_CONFIG=${JSON.stringify(embedded).replace(/</g,'\\u003c')};(${sheetPage.toString()})();</script>\n`;
}
async function shots(file,out,config){
  const {chromium}=require('playwright'),wrapped=file+'.'+process.pid+'.'+Date.now()+'.wrapped.html';let browser;
  try{
    fs.writeFileSync(wrapped,'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+fs.readFileSync(file,'utf8')+'</body></html>');
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/*',route=>route.request().url()===CDN?route.fulfill({path:require.resolve('three/build/three.min.js'),contentType:'application/javascript'}):route.request().url().startsWith('file:')?route.continue():route.abort());
    await page.goto(pathToFileURL(wrapped).href);await page.waitForFunction(()=>window.MODEL_SHEET_READY);await page.evaluate(async()=>{
      MODEL_SHEET.freeze();
      // Leave room below the final heading so every group can align with the viewport top.
      document.body.style.paddingBottom=innerHeight+'px';document.documentElement.style.scrollBehavior='auto';
      await Promise.all(Array.from(document.images,img=>img.decode()));
    });fs.mkdirSync(out,{recursive:true});
    for(let i=0;i<config.groups.length;i++)for(const [team,name] of [[0,'earth'],[1,'republic']]){
      await page.evaluate(async({i,team})=>{
        MODEL_SHEET.setFaction(team);const heading=document.querySelector('[data-group="'+i+'"] h2');
        window.scrollTo({top:window.scrollY+heading.getBoundingClientRect().top,behavior:'instant'});
        await MODEL_SHEET.settle();
      },{i,team});
      const dest=path.join(out,`${i+1}-${name}.png`);await page.screenshot({path:dest});console.log(dest);
    }
    if(errors.length)throw new Error(errors.join('\n'));
  }finally{try{if(browser)await browser.close();}finally{fs.rmSync(wrapped,{force:true});}}
}
async function main(){const opt=options(process.argv.slice(2)),config=JSON.parse(fs.readFileSync(opt.config,'utf8')),out=path.resolve(opt.out);const html=build(config,path.dirname(path.resolve(opt.config)));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html);console.log(out);if(opt.shots)await shots(out,path.resolve(opt.shots),config);}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={build,validate};
