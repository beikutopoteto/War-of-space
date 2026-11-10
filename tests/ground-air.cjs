/* 独立VMの実Three.js・既存弾道/三角形/建物処理を使うNode専用確認。 */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
function createContext(){
  const {run,context}=require('./ground-ballistics.cjs').createContext();
  run(fs.readFileSync(path.join(__dirname,'../battle/ground-air.js'),'utf8'));
  run(`var speedOf;
    function plane(x=-20,heightM=4800,speed=5,heading=new THREE.Vector3(1,0,0)){return {alive:true,groundKind:'supportAircraft',band:'high',pos:new THREE.Vector3(x,groundHeight(x,0)+heightM*GROUND_SCALE/1000,0),heading,speed};}
    function resetAir(m=0,e=18){speedOf=undefined;WOS_TERRAIN.exercise2.meta.elevationExaggeration=e;groundHeight=()=>m*GROUND_SCALE*e/1000;groundSightReset();groundBuildings=[];groundBallisticReset();}
    const bombTarget=(x=0,z=0)=>new THREE.Vector3(x,groundHeight(x,z),z);
  `);
  return {run,context};
}
function nodeChecks(){
  const {run}=createContext(),rows=[];
  const check=(name,code)=>{try{run('resetAir();');rows.push({name,ok:!!run(code)});}catch(error){rows.push({name,ok:false,error:error.message});}};
  check('4800mの落下時間とworld/game秒から物理m/秒の換算',`(()=>{const f=plane(),s=groundBombSolution(f),T=Math.sqrt(9600/9.81);return s&&s.clear&&close(s.physicalDuration,T)&&close(s.duration,T/10)&&s.timeScale===10&&s.originMeters.y===4800&&s.velocityMeters.x===125&&s.velocityMeters.y===0&&close(s.impact.x,f.pos.x+5*T/10)&&close(s.impact.y,0);})()`);
  check('groundBallisticAtで始点・途中・着弾後を評価できる',`(()=>{const f=plane(),s=groundBombSolution(f),t=s.duration/2,p=groundBallisticAt(s,t),meters=groundFreeFall(s.originMeters,s.velocityMeters,t*10);return groundBallisticAt(s,0).equals(f.pos)&&close(p.x,meters.x/250)&&close(p.y,meters.y/250)&&groundBallisticAt(s,s.duration).equals(s.impact)&&groundBallisticAt(s,s.duration+10).equals(s.impact)&&close(s.collision.time,s.duration)&&s.collision.point.equals(s.impact);})()`);
  check('機首の向きを変えると水平慣性もその向きへ変わる',`(()=>{const f=plane(-20,4800,5,new THREE.Vector3(0,0,-3)),s=groundBombSolution(f);return s&&close(s.impact.x,-20)&&s.impact.z<0&&close(s.velocityMeters.z,-125)&&s.velocityMeters.x===0;})()`);
  check('攻撃目標や未観測の敵の状態を読まない',`(()=>{const f=plane();Object.defineProperty(f,'order',{get(){throw Error('no steering target read');}});Object.defineProperty(globalThis,'fleets',{configurable:true,get(){throw Error('no live unit read');}});try{return groundBombSolution(f)!==null;}finally{delete globalThis.fleets;}})()`);
  check('発射後の機体位置・速度・機首変更から独立',`(()=>{const f=plane(),s=groundBombSolution(f),p=groundBallisticAt(s,s.duration/2),v=s.velocityMeters.clone();f.pos.set(90,90,90);f.heading.set(-1,0,0);f.speed=100;f.alive=false;return s.origin.x===-20&&s.velocityMeters.equals(v)&&groundBallisticAt(s,s.duration/2).equals(p);})()`);
  check('地表18倍でも実高度・落下時間は変わらない',`(()=>{resetAir(100,1);const a=groundBombSolution(plane());resetAir(100,18);const f=plane(),b=groundBombSolution(f);return a&&b&&close(a.physicalDuration,b.physicalDuration)&&close(b.originMeters.y,4900)&&close(a.impact.x,b.impact.x)&&close(b.origin.y,f.pos.y)&&close(b.impact.y,7.2);})()`);
  check('上昇中の鉛直速度も引き継いで放物運動する',`(()=>{const f=plane(-20,4800,5,new THREE.Vector3(1,.2,0)),s=groundBombSolution(f),T=s.physicalDuration;return s&&s.velocityMeters.y>0&&T>Math.sqrt(9600/9.81)&&Math.abs(groundFreeFall(s.originMeters,s.velocityMeters,T).y)<1e-7;})()`);
  check('有効速度speedOfを使い補給や同期による減速を反映',`(()=>{const f=plane(),a=groundBombSolution(f);speedOf=unit=>unit.speed*.5;try{const b=groundBombSolution(f);return b.velocityMeters.x===62.5&&close(a.physicalDuration,b.physicalDuration)&&close(b.impact.x-f.pos.x,(a.impact.x-f.pos.x)/2);}finally{speedOf=undefined;}})()`);
  check('狙点の手前に一定高度の投下位置を逆算',`(()=>{const f=plane(),p=bombTarget(),r=groundBombRelease(f,p);return r&&r.heading.x===1&&r.heading.y===0&&r.heading.z===0&&close(r.releasePos.x,p.x-r.speedWorld*r.fallSeconds)&&close(r.releasePos.y,f.pos.y)&&close(r.fallSeconds*10,r.physicalFallSeconds)&&r.altitudeMeters===4800;})()`);
  check('実機が設計投下位置・向きなら平地の指定地点へ落下',`(()=>{const f=plane(),p=bombTarget(),r=groundBombRelease(f,p);f.pos.copy(r.releasePos);f.heading.copy(r.heading);f.speed=r.speedWorld;const s=groundBombSolution(f);return s&&s.impact.distanceTo(p)<1e-7&&close(s.duration,r.fallSeconds);})()`);
  check('進入計画を作っただけでは実機の落下先を操舵しない',`(()=>{const f=plane(),p=bombTarget(-40),before=JSON.stringify(f),a=groundBombSolution(f),r=groundBombRelease(f,p),b=groundBombSolution(f);return r.heading.x===-1&&a.impact.equals(b.impact)&&b.impact.distanceTo(p)>1&&JSON.stringify(f)===before;})()`);
  check('目標地表との差から落下時間を求め海面基準高度を維持',`(()=>{relief((x,z)=>x>0?200:0);const f=plane(),r=groundBombRelease(f,bombTarget(4));return r&&close(r.physicalFallSeconds,Math.sqrt(2*4600/9.81))&&close(r.altitudeMeters,4800)&&close(r.releasePos.y,19.2);})()`);
  check('狭い三角形の尾根へ最初に衝突する',`(()=>{relief((x,z)=>x===0&&z===0?6000:0);const f=plane(-4),s=groundBombSolution(f);return s&&s.reason==='terrain'&&s.impact.x>-4&&s.impact.x<0&&s.physicalDuration<8&&close(s.impact.y,groundSightHeight(s.impact.x,s.impact.z),1e-6);})()`);
  check('極薄の建物もslabと二次方程式で検出',`(()=>{const f=plane(),x=-18.12345678;groundBuildings=[box(x,1e-8,0,5000)];const s=groundBombSolution(f);return s&&s.reason==='building'&&Math.abs(s.impact.x-x)<1e-6&&s.impact.y>18&&s.physicalDuration<4;})()`);
  check('屋根への着弾を地表への瞬間移動にしない',`(()=>{const f=plane();groundBuildings=[box(0,50,0,50)];const s=groundBombSolution(f);return s&&s.reason==='building'&&close(s.impact.y,.2)&&close(s.physicalDuration,Math.sqrt(2*4750/9.81));})()`);
  check('探索120物理秒以内に接触しない場合は解なし',`groundBombSolution(plane(-20,1000000))===null&&groundBombRelease(plane(-20,1000000),bombTarget())===null`);
  check('無効座標・機首・速度・不在部隊を拒否',`(()=>{const f=plane();return groundBombSolution(null)===null&&groundBombSolution({...f,pos:new THREE.Vector3(NaN,0,0)})===null&&groundBombSolution({...f,heading:new THREE.Vector3(Infinity,0,0)})===null&&groundBombSolution({...f,speed:-1})===null&&groundBombSolution({...f,alive:false})===null&&groundBombSolution({...f,embarked:{}})===null&&groundBombSolution({...f,groundAirState:'base'})===null&&groundBombRelease(f,{x:0,y:NaN,z:0})===null;})()`);
  check('地表以下・投下高度より高い狙点を拒否',`(()=>{if(groundBombSolution(plane(-20,0))!==null)return false;relief((x,z)=>x>=0?6000:0);return groundBombRelease(plane(),bombTarget(4))===null;})()`);
  check('無速度の垂直落下は計算できるが遠方への進入は捏造しない',`(()=>{const f=plane(-20,4800,0,new THREE.Vector3()),s=groundBombSolution(f);return s&&close(s.impact.x,-20)&&groundBombRelease(f,bombTarget())===null&&groundBombRelease(f,bombTarget(-20))!==null&&groundBombSolution(plane(-20,4800,5,new THREE.Vector3()))===null;})()`);
  check('進入解と落下解が入力機体・目標を変更しない',`(()=>{const f=plane(),p=bombTarget(),saved=JSON.stringify([f,p]);groundBombRelease(f,p);groundBombSolution(f);return JSON.stringify([f,p])===saved;})()`);
  const real=createContext();
  try{const ok=real.run(`(()=>{const p=groundPoint(10,25),f=plane(p.x);f.pos.z=p.z;f.pos.y=groundHeight(p.x,p.z)+19.2;const s=groundBombSolution(f);return !!s&&s.impact.y>=0&&Math.abs(s.impact.y-groundSightHeight(s.impact.x,s.impact.z))<1e-6;})()`);rows.push({name:'実演習の高さ補間面へ着弾する',ok:!!ok});}catch(error){rows.push({name:'実演習の高さ補間面へ着弾する',ok:false,error:error.message});}
  return rows;
}
module.exports={nodeChecks,createContext};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`非誘導爆弾 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
