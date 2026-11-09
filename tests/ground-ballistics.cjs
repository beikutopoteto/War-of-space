/* ブラウザ不要。実Three.js・演習データ・三角形補間・LOSを独立VMへロード。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
function createContext(){
  const root=path.join(__dirname,'..'),context=vm.createContext({THREE:require('three'),console});
  context.window=context;
  const run=code=>vm.runInContext(code,context);
  for(const file of ['data/terrain/exercise2.js','battle/terrain.js','battle/ground-sight.js'])run(fs.readFileSync(path.join(root,file),'utf8'));
  run(`var op={ground:'exercise2'};
    function groundStrikeRules(){return WOS_TERRAIN[op.ground].strike;}
    function groundRules(){return WOS_TERRAIN[op.ground].bands;}
    function groundStrikeRange(f){
      if(f.rangeOverride)return f.rangeOverride;
      const r=WOS_TERRAIN[op.ground].unitTypes[f.groundKind]?.fireRangesKm;
      return f.groundKind==='vehicle'?{min:0,max:r.direct*GROUND_SCALE,direct:true}:
        f.groundKind==='supportAircraft'?{min:0,max:r.ground*GROUND_SCALE}:r?.indirect?{min:r.indirect.min*GROUND_SCALE,max:r.indirect.max*GROUND_SCALE}:null;
    }
    function groundStrikeInRange(){throw Error('recursive firing eligibility');}
    function groundSeenBy(){throw Error('ballistics must not read fog');}
    function unit(kind='artillery',x=-4,z=0){return {alive:true,groundKind:kind,band:kind==='supportAircraft'?'high':'ground',pos:new THREE.Vector3(x,groundHeight(x,z),z)};}
    function point(x=4,z=0){return new THREE.Vector3(x,0,z);}
    function flat(){groundHeight=()=>0;groundBuildings=[];groundSightReset();groundBallisticReset();}
    function relief(fn){groundHeight=(x,z)=>fn(x,z)*GROUND_SCALE*WOS_TERRAIN.exercise2.meta.elevationExaggeration/1000;groundSightReset();groundBallisticReset();}
    function box(x,width,bottomM,topM){return {minX:x-width/2,maxX:x+width/2,minZ:-1,maxZ:1,bottom:bottomM*GROUND_SCALE/1000,top:topM*GROUND_SCALE/1000};}
    function close(a,b,e=1e-7){return Math.abs(a-b)<=e;}
  `);
  run(fs.readFileSync(path.join(root,'battle/ground-ballistics.js'),'utf8'));
  return {run,context};
}
// deterministicな処理量の測定。時間の閾値では落とさず、キャッシュ再照会がtraceしないことを測る。
function nodePerformance(){
  const {run}=createContext();
  return run(`flat();let calls=0;const baseHeight=groundSightHeight;groundSightHeight=(x,z)=>{calls++;return baseHeight(x,z);};
    const gun=unit(),p=point();const first=groundBallisticPoint(gun,p),coldHeightCalls=calls;
    for(let i=0;i<1000;i++)groundBallisticPoint(gun,p);
    ({coldHeightCalls,warmHeightCalls:calls-coldHeightCalls,queries:1000,clear:first.clear});`);
}
function nodeChecks(){
  const {run}=createContext(),rows=[];
  const check=(name,code)=>{try{rows.push({name,ok:!!run(code)});}catch(error){rows.push({name,ok:false,error:error.message});}};
  check('実演習の三角形地表で間接弾道を計算',`(()=>{const p=groundPoint(28,25),f=unit('artillery',groundPoint(8,25).x,groundPoint(8,25).z);const s=groundBallisticSolution(f,p);return s.clear&&s.duration>0;})()`);
  run('flat();');
  check('平地の45度可変装薬が始点・終点へ一致',`(()=>{const s=groundBallisticSolution(unit(),point());return s.clear&&groundBallisticAt(s,0).equals(s.origin)&&groundBallisticAt(s,s.duration).equals(s.target)&&close(s.velocityMeters.x,s.velocityMeters.y);})()`);
  check('物理秒とゲーム秒・方程式の終点が一致',`(()=>{const s=groundBallisticSolution(unit(),point()),end=groundFreeFall(s.originMeters,s.velocityMeters,s.physicalDuration);return close(s.duration*10,s.physicalDuration)&&end.distanceTo(s.targetMeters)<1e-7;})()`);
  check('描画の弧の高さは18倍せず実クリアランス',`(()=>{const s=groundBallisticSolution(unit(),point()),p=groundBallisticAt(s,s.duration/2),m=groundFreeFall(s.originMeters,s.velocityMeters,s.physicalDuration/2);return close(p.y,m.y*4/1000)&&p.y<3;})()`);
  check('既存眼高なら低い壁越しの戦車直射を維持',`(()=>{groundBuildings=[box(0,.2,0,50)];const f=unit('vehicle'),p=point(),s=groundBallisticSolution(f,p);return s.clear&&close(s.origin.y,groundEye(f).y)&&close(s.target.y,groundSightRules().eyeHeight)&&close(s.physicalDuration,2000/1500)&&groundClearLine(s.origin,s.target);})()`);
  check('高い壁は戦車直射を拒否・間接弾は上を通過',`(()=>{groundBuildings=[box(0,.2,0,150)];const direct=groundBallisticSolution(unit('vehicle'),point()),arc=groundBallisticSolution(unit(),point());return !direct.clear&&direct.collision&&direct.impact.x<.2&&arc.clear;})()`);
  check('45度弾道を塞ぐ山は勝手に高く飛ばず拒否',`(()=>{relief((x,z)=>x===0?1000:0);const s=groundBallisticSolution(unit(),point());return !s.clear&&s.reason==='terrain'&&s.hitTime<s.duration&&s.collision.point.equals(s.impact);})()`);
  check('三角形境界で幅の狭い尾根も検出',`(()=>{relief((x,z)=>x===1&&z===0?2000:0);const s=groundBallisticSolution(unit(),point());return !s.clear&&s.reason==='terrain'&&s.impact.x<1;})()`);
  run('flat();');
  check('極薄建物は放物線と時間slabの厳密交差で拒否',`(()=>{const s=groundBallisticSolution(unit(),point()),u=.371234,p=groundBallisticAt(s,s.duration*u),h=p.y*250;groundBuildings=[box(p.x,1e-8,h-.1,h+.1)];const hit=groundBallisticSolution(unit(),point());return !hit.clear&&hit.reason==='building'&&Math.abs(hit.hitTime/s.duration-u)<1e-7;})()`);
  check('slab両端の外でも放物線が箱へ入る時刻を検出',`(()=>{flat();const s=groundBallisticSolution(unit(),point()),apex=s.velocityMeters.y/9.81,top=groundFreeFall(s.originMeters,s.velocityMeters,apex).y;groundBuildings=[box(0,5,top-.1,top+.1)];const hit=groundBallisticSolution(unit(),point());return !hit.clear&&hit.reason==='building'&&hit.hitTime<s.duration/2;})()`);
  check('衝突後の表示は障害物のimpactで停止',`(()=>{const s=groundBallisticSolution(unit(),point());return !s.clear&&groundBallisticAt(s,s.duration).equals(s.impact)&&close(s.collision.time,s.hitTime);})()`);
  check('地表ちょうどの終点を途中衝突と誤認しない',`(()=>{flat();const s=groundBallisticSolution(unit(),point());return s.clear&&s.targetMeters.y===0&&s.collision===null;})()`);
  check('同位置のロケットは垂直落下を有限時間で評価',`(()=>{const f=unit('guidedRocket'),s=groundBallisticSolution(f,point(-4));return s.clear&&s.duration>0&&s.velocityMeters.length()===0&&groundBallisticAt(s,s.duration).equals(s.target);})()`);
  check('高い目標・初速上限超過は解なし',`(()=>{flat();const f=unit();f.rangeOverride={min:0,max:1000};const far=groundBallisticSolution(f,point(396));relief(x=>x>=4?3000:0);const high=groundBallisticSolution(unit(),point());return !far.clear&&far.reason==='unreachable'&&!high.clear&&high.reason==='unreachable';})()`);
  check('射程の最小・最大を適用',`(()=>{flat();return groundBallisticSolution(unit(),point(3.99)).reason==='range'&&groundBallisticSolution(unit(),point(117)).reason==='range';})()`);
  check('30kmの有効狙点と30.4kmの外向き散布を区別',`(()=>{flat();const f=unit('artillery',-60),aim=point(60),scatter=point(61.6),nominal=groundBallisticSolution(f,aim),rejected=groundBallisticSolution(f,scatter),actual=groundBallisticSolution(f,scatter,{ignoreRange:true});return nominal.clear&&!rejected.clear&&rejected.reason==='range'&&actual.clear&&groundFreeFall(actual.originMeters,actual.velocityMeters,actual.physicalDuration).distanceTo(actual.targetMeters)<1e-7;})()`);
  check('最小2kmの内側1.8kmは散布オプションでだけ許可',`(()=>{flat();const f=unit(),p=point(3.2);return groundBallisticSolution(f,point()).clear&&groundBallisticSolution(f,p).reason==='range'&&groundBallisticSolution(f,p,{ignoreRange:true}).clear;})()`);
  check('通常照準と散布先のキャッシュは双方向に独立',`(()=>{flat();const f=unit('artillery',-60),p=point(61.6),normal=groundBallisticPoint(f,p),scatter=groundBallisticPoint(f,p,{ignoreRange:true}),q=point(60),scatterFirst=groundBallisticPoint(f,q,{ignoreRange:true}),normalSecond=groundBallisticPoint(f,q);return !normal.clear&&scatter.clear&&normal!==scatter&&normal===groundBallisticPoint(f,p,{ignoreRange:false})&&scatter===groundBallisticPoint(f,p,{ignoreRange:true})&&scatterFirst!==normalSecond&&scatterFirst.clear&&normalSecond.clear&&normalSecond===groundBallisticPoint(f,q);})()`);
  check('散布オプションも武器なし・初速上限超過・障害物を拒否',`(()=>{flat();const f=unit(),p=point(),o={ignoreRange:true};const missing=groundBallisticPoint({...f,groundKind:'infantry'},p,o),zero=groundBallisticPoint({...f,rangeOverride:{min:0,max:0}},p,o),invalid=groundBallisticPoint({...f,rangeOverride:{min:0,max:Infinity}},p,o),fast=groundBallisticPoint(f,point(796),o);groundBuildings=[box(0,.01,0,2000)];const blocked=groundBallisticPoint(f,p,o);return !missing.clear&&!zero.clear&&!invalid.clear&&!fast.clear&&fast.reason==='unreachable'&&!blocked.clear&&blocked.reason==='building';})()`);
  check('18倍表示へ変えても物理高度・所要時間は同じ',`(()=>{flat();const d=WOS_TERRAIN.exercise2;d.meta.elevationExaggeration=1;relief(x=>10+x/100);const a=groundBallisticSolution(unit(),point());d.meta.elevationExaggeration=18;groundSightReset();groundBallisticReset();const b=groundBallisticSolution(unit(),point());return a.clear&&b.clear&&close(a.physicalDuration,b.physicalDuration)&&a.velocityMeters.distanceTo(b.velocityMeters)<1e-7&&close(a.originMeters.y,b.originMeters.y);})()`);
  check('航空高度は18で割らず支援機の旧7秒を維持',`(()=>{flat();const f=unit('supportAircraft');f.pos.y=19.2;const s=groundBallisticSolution(f,point());return s.clear&&s.mode==='legacy-support'&&s.duration===7&&close(s.originMeters.y,4802)&&close(s.origin.y,19.208);})()`);
  check('非誘導自由落下は水平速度を保持',`(()=>{const a=new THREE.Vector3(1,100,3),v=new THREE.Vector3(20,5,-2),p=groundFreeFall(a,v,2);return close(p.x,41)&&close(p.z,-1)&&close(p.y,90.38)&&a.y===100&&v.x===20;})()`);
  check('欠落・非有限入力・不在部隊を拒否',`(()=>{const f=unit(),p=point();return !groundBallisticSolution(null,p).clear&&!groundBallisticSolution(f,null).clear&&!groundBallisticSolution(f,{x:Infinity,y:0,z:0}).clear&&!groundBallisticSolution(f,{x:4,y:NaN,z:0}).clear&&!groundBallisticSolution({...f,alive:false},p).clear&&!groundBallisticSolution({...f,groundAirState:'base'},p).clear&&groundFreeFall(p,p,NaN)===null;})()`);
  check('発射後に射手が移動・高度変更・撃破されても解を維持',`(()=>{const f=unit(),p=point(),s=groundBallisticSolution(f,p),before=groundBallisticAt(s,s.duration/3);f.pos.set(80,100,20);f.band='high';f.alive=false;p.set(9,9,9);return groundBallisticAt(s,s.duration/3).equals(before)&&s.target.x===4&&s.origin.x===-4;})()`);
  check('同一射手・狙点は同じ解をキャッシュ',`(()=>{flat();const f=unit(),p=point();return groundBallisticPoint(f,p)===groundBallisticPoint(f,p);})()`);
  check('移動・高度・地形・建物の参照変更で無効化',`(()=>{flat();const f=unit(),p=point();let a=groundBallisticPoint(f,p);f.pos.x-=1;let b=groundBallisticPoint(f,p);f.band='low';let c=groundBallisticPoint(f,p);groundBuildings=[];let d=groundBallisticPoint(f,p);WOS_TERRAIN.exercise2.terrain={...WOS_TERRAIN.exercise2.terrain};let e=groundBallisticPoint(f,p);groundSightReset();let g=groundBallisticPoint(f,p);return a!==b&&b!==c&&c!==d&&d!==e&&e!==g;})()`);
  check('64件を超えた射手キャッシュは古い狙点を破棄',`(()=>{flat();const f=unit(),p=point(),first=groundBallisticPoint(f,p);for(let i=1;i<=64;i++)groundBallisticPoint(f,point(4+i*.01));return groundBallisticPoint(f,p)!==first;})()`);
  check('resetで射手キャッシュを破棄',`(()=>{flat();const f=unit(),p=point(),a=groundBallisticPoint(f,p);groundBallisticReset();return a!==groundBallisticPoint(f,p);})()`);
  check('同じ建物配列の変更は明示resetで反映',`(()=>{flat();const f=unit(),p=point(),a=groundBallisticPoint(f,p);groundBuildings.push(box(0,.01,0,2000));groundBallisticReset();return a.clear&&!groundBallisticPoint(f,p).clear;})()`);
  const performance=nodePerformance();rows.push({name:'1000回の再照会で高さ探索を繰り返さない',ok:performance.clear&&performance.coldHeightCalls>0&&performance.warmHeightCalls===0});
  return rows;
}
module.exports={nodeChecks,nodePerformance,createContext};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`地上弾道 ${rows.length-bad.length}/${rows.length}`);console.log(JSON.stringify(nodePerformance()));assert.equal(bad.length,0,JSON.stringify(bad));}
