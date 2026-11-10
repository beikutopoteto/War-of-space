/* node tests/ground-scatter.cjs: 実データ・Three.jsを独立VMで使用。ブラウザ不要。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
function createContext(){
  const root=path.join(__dirname,'..'),context=vm.createContext({THREE:require('three'),console});context.window=context;
  const run=code=>vm.runInContext(code,context);
  run(fs.readFileSync(path.join(root,'data/terrain/exercise2.js'),'utf8'));
  // 作戦・部隊globalsがなくてもロードできることも確かめる。
  run(fs.readFileSync(path.join(root,'battle/ground-scatter.js'),'utf8'));
  run(`const GROUND_SCALE=4;var op={ground:'exercise2'};
    const unit=(kind='artillery',x=0,z=0)=>({groundKind:kind,pos:new THREE.Vector3(x,0,z)});
    const point=(km,z=0)=>new THREE.Vector3(km*GROUND_SCALE,0,z*GROUND_SCALE);
    const close=(a,b)=>Math.abs(a-b)<1e-10;
    function groundSeenBy(){throw Error('no fog access');}
    function groundStrikeWeapon(){throw Error('no eligibility lookup');}
    Object.defineProperty(globalThis,'fleets',{get(){throw Error('no live unit lookup');}});
  `);
  return {run,context};
}
function nodeChecks(){
  const {run}=createContext(),rows=[];
  const check=(name,code)=>{try{rows.push({name,ok:!!run(code)});}catch(error){rows.push({name,ok:false,error:error.message});}};
  for(const [i,km] of [10,20,30,40,50].entries())for(const [kind,diameter] of [['artillery',25*2**i],['guidedRocket',30*2**i]]){
    check(kind+' '+km+'kmの最小直径'+diameter+'m',`close(groundScatterRadius(unit('${kind}'),point(${km}))*2000/GROUND_SCALE,${diameter})`);
  }
  check('10kmの直径25mを半径0.05戦闘単位へ変換',`close(groundScatterRadius(unit(),point(10)),.05)`);
  check('10km未満の下限は一定',`[0,1,5,9.999].every(km=>close(groundScatterRadius(unit(),point(km)),.05))&&close(groundScatterRadius(unit('guidedRocket'),point(0)),.06)`);
  check('15kmは直径を滑らかに平方根2倍',`close(groundScatterRadius(unit(),point(15)),.05*Math.SQRT2)&&close(groundScatterRadius(unit('guidedRocket'),point(15)),.06*Math.SQRT2)`);
  check('射手からの水平距離を使い原点・高度に依存しない',`(()=>{const f=unit('artillery',24,32),p=new THREE.Vector3(48,999,64);f.pos.y=-20;return close(groundScatterRadius(f,p),.05);})()`);
  check('現在の射手位置を毎回読み移動に伴い下限が変わる',`(()=>{const f=unit(),p=point(20),a=groundScatterRadius(f,p);f.pos.x=40;return close(a,.1)&&close(groundScatterRadius(f,p),.05);})()`);
  check('従来兵科へ精度下限を追加しない',`['vehicle','was','sea','supportAircraft','infantry','droneHive'].every(kind=>groundScatterRadius(unit(kind),point(50))===0)`);
  check('単一点でも幅0指定の下限を返す',`close(groundAreaRequiredRadius([unit()],[point(20)],0),.1)`);
  check('複数射手は最も厳しい下限を採用',`close(groundAreaRequiredRadius([unit('artillery',-40),unit('guidedRocket')],[point(20)],0),.2)`);
  check('兵科ごとの基準直径も混成の下限へ反映',`close(groundAreaRequiredRadius([unit(),unit('guidedRocket')],[point(20)],0),.12)`);
  check('折れ線の全頂点から最遠点を選ぶ',`close(groundAreaRequiredRadius([unit()],[point(10),point(30),point(20)],0),.2)`);
  check('指定半径を加え遠端の距離を保守的に包む',`close(groundAreaRequiredRadius([unit()],[point(20)],40),.2)`);
  check('面積内の各点の精度下限が領域下限以下',`(()=>{const f=unit('guidedRocket',-12,4),points=[point(12),point(20,3),point(16,5)],radius=8,bound=groundAreaRequiredRadius([f],points,radius);for(let i=0;i<points.length-1;i++)for(let j=0;j<=10;j++)for(let k=0;k<12;k++){const p=points[i].clone().lerp(points[i+1],j/10).add(new THREE.Vector3(Math.cos(k*Math.PI/6)*radius,0,Math.sin(k*Math.PI/6)*radius));if(groundScatterRadius(f,p)>bound+1e-10)return false;}return true;})()`);
  check('領域下限は単一評価で入力半径そのものには引き上げない',`close(groundAreaRequiredRadius([unit()],[point(10)],40),.1)`);
  check('従来兵科だけの領域には下限なし',`groundAreaRequiredRadius([unit('vehicle'),unit('was')],[point(50)],7)===0`);
  check('未観測倍率や旧spreadを変えても物理精度は変わらない',`(()=>{const data=WOS_TERRAIN.exercise2.strike,a=groundScatterRadius(unit(),point(20));data.unseenSpread=99;data.artillery.spread=999;const b=groundScatterRadius(unit(),point(20));data.unseenSpread=2;data.artillery.spread=2;return close(a,b);})()`);
  check('基準直径・爆風を維持しロケットは連射後30秒装填',`(()=>{const s=WOS_TERRAIN.exercise2.strike;return s.artillery.minScatterDiameter10KmM===25&&s.guidedRocket.minScatterDiameter10KmM===30&&s.artillery.reload===8&&s.guidedRocket.reload===30&&s.guidedRocket.rocketsPerVolley===6&&s.guidedRocket.burstInterval===.25&&['artillery','guidedRocket'].every(k=>s[k].delay===5&&s[k].radius===7&&s[k].spread===2);})()`);
  check('面積一様な円盤はsqrt乱数で半径を選ぶ',`(()=>{const save=Math.random,values=[.25,.25];try{Math.random=()=>values.shift();const p=groundScatterOffset(4);return close(p.x,0)&&close(p.z,2)&&p.y===0&&values.length===0;}finally{Math.random=save;}})()`);
  check('円盤の4方位と半径の境界を保持',`(()=>{const save=Math.random;try{for(let i=0;i<4;i++){const values=[i/4,1];Math.random=()=>values.shift();const p=groundScatterOffset(3);if(!close(p.length(),3)||!close(p.x,Math.cos(i*Math.PI/2)*3)||!close(p.z,Math.sin(i*Math.PI/2)*3)||p.y!==0)return false;}return true;}finally{Math.random=save;}})()`);
  check('面積一様性を決定的な半径二乗の分位点で確認',`(()=>{const save=Math.random;try{for(let i=0;i<100;i++){const u=(i+.5)/100,values=[.123,u];Math.random=()=>values.shift();const p=groundScatterOffset(5);if(!close(p.lengthSq()/25,u))return false;}return true;}finally{Math.random=save;}})()`);
  check('入力部隊・頂点・半径を変更しない',`(()=>{const f=unit(),points=[point(10),point(30)],before=JSON.stringify([f,points]);groundAreaRequiredRadius([f],points,4);groundScatterRadius(f,points[0]);return before===JSON.stringify([f,points]);})()`);
  check('空・非有限入力は無効な座標を生成しない',`groundScatterRadius(null,point(10))===0&&groundScatterRadius(unit(),{x:NaN,z:0})===0&&groundAreaRequiredRadius([],[],0)===0&&groundAreaRequiredRadius([unit()],[point(20)],NaN)===0&&[0,-1,Infinity,NaN].every(r=>groundScatterOffset(r).length()===0)`);
  check('地上作戦外では下限なし',`(()=>{const saved=op;op={};try{return groundScatterRadius(unit(),point(20))===0&&groundAreaRequiredRadius([unit()],[point(20)],0)===0;}finally{op=saved;}})()`);
  return rows;
}
module.exports={nodeChecks,createContext};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`地上散布 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
