/* node tests/ground-naval.cjs: 実艦種表・演習地形・三角形補間を独立VMで使用。ブラウザ不要。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
function createContext(){
  const root=path.join(__dirname,'..'),context=vm.createContext({THREE:require('three'),console});context.window=context;
  const run=code=>vm.runInContext(code,context),read=f=>fs.readFileSync(path.join(root,f),'utf8');
  // op、地形、艦種表が存在しない時点でもロードできる。
  run(read('battle/ground-naval.js'));
  for(const f of ['data/ships.js','data/terrain/exercise2.js','battle/terrain.js','battle/ground-sight.js'])run(read(f));
  run(`var op={ground:'exercise2'},navalFixtureMeters=0;
    const navalShipsBefore=JSON.stringify(WOS_DATA.ships),navalRangesBefore=JSON.stringify(WOS_TERRAIN.exercise2.navalFireRangesKm);
    const ship=(type='dd',extra={})=>({groundKind:'sea',type,band:'sea',pos:new THREE.Vector3(),...extra});
    const target=(band='ground',altitudeM=0)=>({groundKind:band==='ground'?'vehicle':'fighter',band,pos:new THREE.Vector3(0,groundHeight(0,0)+altitudeM*GROUND_SCALE/1000,0)});
    function terrain(m,e=18){navalFixtureMeters=m;WOS_TERRAIN.exercise2.meta.elevationExaggeration=e;groundHeight=()=>navalFixtureMeters*GROUND_SCALE*WOS_TERRAIN.exercise2.meta.elevationExaggeration/1000;groundHeightCacheReset();}
    const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-9;
    function groundSeenBy(){throw Error('utility must not read visibility');}
    Object.defineProperty(globalThis,'fleets',{get(){throw Error('utility must not enumerate fleets');}});
  `);
  return {context,run};
}
function nodeChecks(){
  const {run}=createContext(),rows=[];
  const check=(name,code)=>{try{run('terrain(0);');rows.push({name,ok:!!run(code)});}catch(error){rows.push({name,ok:false,error:error.message});}};
  for(const [type,id,model] of [['cv','fastboat','ff'],['ff','fastboat','ff'],['dd','aegis','cl'],['cl','aegis','cl'],['bb','battleship','bb']])
    check(type+'の旧IDを保持して'+id+'・'+model+'モデルへ解決',`(()=>{const f=ship('${type}'),c=groundNavalClass(f);return c.id==='${id}'&&c.model==='${model}'&&groundNavalModel(f)==='${model}'&&f.type==='${type}';})()`);
  check('分類objectは共通の6フィールドを返す',`Object.keys(groundNavalClass(ship())).sort().join(',')==='gunHeightM,id,model,name,rangesKm,targetHeightM'`);
  check('非海軍・未知・母艦を勝手に統合しない',`[null,{},ship('unknown'),ship('cvb'),ship('mas'),ship('masc'),{type:'dd'},ship('dd',{groundKind:'vehicle'})].every(f=>groundNavalClass(f)===null&&groundNavalModel(f)===null)`);
  check('揚陸艦フラグがddのイージス分類に優先',`(()=>{const f=ship('dd',{groundLanding:true}),c=groundNavalClass(f);return c.id==='landing'&&c.model==='dd'&&c.name==='揚陸艦'&&f.type==='dd'&&f.groundLanding;})()`);
  for(const [type,direct,aa] of [['cv',8,3],['ff',8,3],['dd',24,150],['cl',24,150],['bb',40,6]])
    check(type+'の海上専用射程km',`(()=>{const r=groundNavalClass(ship('${type}')).rangesKm;return r.direct===${direct}&&r.indirect.min===0&&r.indirect.max===${direct}&&r.aa===${aa};})()`);
  check('揚陸艦は現行dd射程24/24/150を保持し旧range4.5kmと区別',`(()=>{const c=groundNavalClass(ship('dd',{groundLanding:true})),old=WOS_DATA.ships.find(s=>s.id==='dd');return c.rangesKm.direct===24&&c.rangesKm.indirect.max===24&&c.rangesKm.aa===150&&close((10+old.rng*1.6)/4,4.5);})()`);
  check('揚陸艦は作戦ごとの旧射程表をコピーし未知値は拒否',`(()=>{const d=WOS_TERRAIN.exercise2,old=op;WOS_TERRAIN.navalFixture={navalFireRangesKm:{dd:{direct:3,indirect:{min:1,max:7},aa:2}}};op={ground:'navalFixture'};try{const c=groundNavalClass(ship('dd',{groundLanding:true}));return c.rangesKm.direct===3&&c.rangesKm.indirect.min===1&&c.rangesKm.indirect.max===7&&c.rangesKm.aa===2&&groundNavalClass(ship('bad',{groundLanding:true}))===null;}finally{op=old;delete WOS_TERRAIN.navalFixture;}})()`);
  check('結果の書き換えが共有射程と宇宙艦表へ漏れない',`(()=>{for(const f of [ship('cv'),ship('dd',{groundLanding:true})]){const c=groundNavalClass(f);c.rangesKm.direct=999;c.rangesKm.indirect.max=999;c.gunHeightM=999;}return groundNavalClass(ship('cv')).rangesKm.direct===8&&groundNavalClass(ship('dd',{groundLanding:true})).rangesKm.indirect.max===24&&JSON.stringify(WOS_DATA.ships)===navalShipsBefore&&JSON.stringify(WOS_TERRAIN.exercise2.navalFireRangesKm)===navalRangesBefore;})()`);
  check('m入力をkmへ換算する地平線の単位と両端寄与',`close(groundNavalHorizonFromMeters(1000,0),Math.sqrt(12742))&&close(groundNavalHorizonFromMeters(10,10),2*Math.sqrt(127.42))&&close(groundNavalHorizonFromMeters(9,16),Math.sqrt(12.742)*7)`);
  check('負高を0へ丸め不正値を拒否',`groundNavalHorizonFromMeters(-10,-20)===0&&close(groundNavalHorizonFromMeters(-1,10),groundNavalHorizonFromMeters(0,10))&&[NaN,Infinity,-Infinity,null,undefined,'10'].every(x=>groundNavalHorizonFromMeters(x,4)===null&&groundNavalHorizonFromMeters(4,x)===null)`);
  check('同じ海軍同士は左右対称・地表の誇張に非依存',`(()=>{const a=ship('ff'),b=ship('bb'),first=groundNavalHorizonKm(a,b);terrain(1000,18);return close(first,groundNavalHorizonKm(b,a))&&close(first,groundNavalHorizonKm(a,b));})()`);
  check('艦の砲口高は表示のpos.yや眼高を参照しない',`(()=>{const f=ship('dd'),t=ship('ff'),h=groundNavalHorizonKm(f,t);f.pos.y=100;WOS_TERRAIN.exercise2.sight.eyeHeight=999;try{return groundNavalHeightMeters(f,'gun')===8&&close(h,groundNavalHorizonKm(f,t));}finally{WOS_TERRAIN.exercise2.sight.eyeHeight=.35;}})()`);
  check('地上の18倍表示高を実高へ戻し代表目標高2mを加える',`(()=>{terrain(100,18);const t=target();return close(groundNavalHeightMeters(t),102)&&close(groundNavalHorizonKm(ship('ff'),t),groundNavalHorizonFromMeters(4,102));})()`);
  check('表示倍率1と18で同じ実地表高の地平線は変わらない',`(()=>{terrain(100,1);const a=groundNavalHorizonKm(ship(),target());terrain(100,18);return close(a,groundNavalHorizonKm(ship(),target()));})()`);
  check('航空高度4800mは18で割らず地表実高へ加算',`(()=>{terrain(100,18);const t=target('high',4800);return close(groundNavalHeightMeters(t),4900)&&close(groundNavalHorizonKm(ship(),t),groundNavalHorizonFromMeters(8,4900));})()`);
  check('低空・高度移行中も実pos.yから高度を求める',`(()=>{terrain(100);const t=target('low',1536);return close(groundNavalHeightMeters(t),1636);})()`);
  check('未知海軍・非海軍射手・壊れた座標を拒否',`groundNavalHorizonKm(ship('unknown'),target())===null&&groundNavalHorizonKm(target(),target())===null&&groundNavalHorizonKm(ship(),{pos:{x:0,y:NaN,z:0}})===null&&groundNavalHorizonKm(ship(),ship('unknown'))===null`);
  check('地表高・表示倍率の不正値を拒否',`(()=>{terrain(NaN);if(groundNavalHorizonKm(ship(),target())!==null)return false;terrain(0);WOS_TERRAIN.exercise2.meta.elevationExaggeration=0;return groundNavalHorizonKm(ship(),target())===null;})()`);
  check('海面datumを地表へ二重適用しない',`(()=>{const d=WOS_TERRAIN.exercise2;terrain(10);const first=groundNavalHeightMeters(target()),saved=d.meta.seaLevelM;d.meta.seaLevelM=-100;try{return first===12&&groundNavalHeightMeters(target())===12;}finally{d.meta.seaLevelM=saved;}})()`);
  return rows;
}
module.exports={nodeChecks,createContext};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`地上海軍分類・地平線 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
