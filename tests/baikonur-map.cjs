/* 広域演習の設計条件。実データ・経路・補給グラフを通して確かめる。 */
const assert=require('node:assert/strict');
function nodeChecks(){
 const {run}=require('./ground-drill.cjs').createDrillContext(false);
 return run(`(()=>{
  const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok}),d=groundData(),original=WOS_TERRAIN.exercise2;
  check('演習は96×72km・240×180セル、チュートリアルは48×36km',op.ground==='baikonur2'&&d.meta.widthKm===96&&d.meta.heightKm===72&&d.terrain.cols===240&&d.terrain.rows===180&&original.meta.widthKm===48&&original.meta.heightKm===36);
  check('地形は旧演習の座標倍率コピーでない',JSON.stringify(d.water.rivers[0].points)!==JSON.stringify(original.water.rivers[0].points.map(p=>p.map(v=>v*2))));
  check('兵科性能・規範は従来の戦闘表を維持',JSON.stringify(d.unitTypes)===JSON.stringify(original.unitTypes)&&JSON.stringify(d.supply)===JSON.stringify(original.supply)&&JSON.stringify(op.npc)==='{"1":{"doctrine":"mars","level":"standard"}}');
  check('9拠点・中立3・西本営A／東本営F',groundSites.length===9&&groundSites.filter(s=>s.owner===null).length===3&&op.groundHQ[0]==='A'&&op.groundHQ[1]==='F');
  check('全拠点は道路の結節で車両が通れる',d.sites.every(s=>d.objects.roads.some(r=>groundDistance(s.x,s.y,r.points)<1e-6)&&groundPass(s.x,s.y,'vehicle')));
  check('地上11隊に補給1・歩兵2、敵は指定の10隊',op.quick.length===11&&op.quick.filter(f=>f.groundKind==='infantry').length===2&&op.quick.filter(f=>f.groundKind==='supply').length===1&&op.enemies.length===10&&['infantry','vehicle','artillery','mobileAA','scout','fighter'].every((k,i)=>op.enemies.filter(f=>f.groundKind===k).length===[4,2,1,1,1,1][i]));
  check('自軍地上は西本営の4km内、初期配置は地形に適合',op.quick.every(f=>Math.hypot(f.pos[0]/4+48-10,36-f.pos[1]/4-56)<=4)&&fleets.every(f=>f.embarked||groundPass(groundMapX(f.pos.x),groundMapY(f.pos.z),groundMoveKind(f))));
  check('開始時23隊（搭載を含め24隊）',fleets.filter(f=>!f.embarked).length===23&&fleets.length===24);
  check('橋3か所と浅瀬1か所は本流上',d.objects.bridges.length===3&&d.objects.fords.length===1&&[...d.objects.bridges,...d.objects.fords].every(b=>groundRiverAt(b.x,b.y,d.water.rivers.find(r=>r.id===b.river)).dist<1e-6));
  for(const bridge of [...d.objects.bridges,...d.objects.fords]){
   const a=groundPoint(bridge.x-2,bridge.y),b=groundPoint(bridge.x+2,bridge.y),p=groundPath(a,b,'vehicle');
   check(bridge.id+'で重車両が渡河',p&&p.points.at(-1).distanceTo(b)<1e-7&&p.points.every(p=>groundPass(groundMapX(p.x),groundMapY(p.z),'vehicle')));
  }
  check('橋も浅瀬もない本流は重車両が通れない',!groundPass(50,53,'vehicle')&&groundPass(50,53,'infantry'));
  let roadsPass=true;
  for(const road of d.objects.roads)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],n=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.1);
   for(let j=0;j<=n;j++)if(!groundPass(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n,'vehicle'))roadsPass=false;
  }
  check('全道路は海・無橋の川・湖を通らない',roadsPass);
  const land=d.terrain.cells.filter(Boolean),swamp=land.filter(t=>t==='沼地').length;
  check('沼地は局在し地表の畑は平地',swamp>0&&swamp/land.length<.15&&d.surface.filter(s=>s.type==='field').every(s=>s.as==='平地'));
  const objects=kind=>groundBoard.children.filter(m=>m.userData.groundObject===kind),actual=kind=>objects(kind).reduce((n,m)=>n+m.count,0);
  check('森林6000枠・実モデル3300本、防風林と島状林を実生成',d.objects.forest.count>=5000&&actual('forest')>=3000&&groundForests.length===actual('forest')&&['bank','windbreak','island'].every(zone=>groundForests.filter(p=>p.zone===zone).length>=600));
  check('樹冠も道路幅を避け、北幹線と浅瀬の迂回路は開ける',groundForests.every(p=>{const x=groundMapX(p.x),y=groundMapY(p.z);return y<=61&&groundPass(x,y,'vehicle')&&d.objects.roads.every(r=>groundDistance(x,y,r.points)>=(p.r/GROUND_SCALE+.095));}));
  check('低木3000枠・代表2600群、葦1000束を実生成',d.objects.shrubs.count>=2500&&actual('shrubs')>=2500&&d.objects.reeds.count>=800&&actual('reeds')>=800);
  check('既存集落を1.5倍以上にし沿道の村8か所を実生成',d.objects.settlements.filter(s=>!s.site).length===8&&d.objects.settlements.filter(s=>s.site).every(s=>s.count>=({A:55,B:35,C:24,D:24,E:35,F:55,G:24,H:24,I:24}[s.site])*1.5)&&actual('buildings')===d.objects.settlements.reduce((n,s)=>n+s.count,0));
  check('建物は川・海・湖を避ける',groundBuildings.every(b=>{const x=groundMapX((b.minX+b.maxX)/2),y=groundMapY((b.minZ+b.maxZ)/2);return groundPass(x,y,'vehicle')&&d.water.rivers.every(r=>{const at=groundRiverAt(x,y,r);return at.dist>at.width/2+.09;});}));
  check('畑は集落・村の周囲10区画、地形は平地を維持',d.surface.filter(s=>s.type==='field').length===10&&d.surface.filter(s=>s.type==='field').every(s=>s.as==='平地'));
  let peak=0;for(let y=18;y<70;y+=.25)for(let x=4;x<92;x+=.5)if(groundPass(x,y,'vehicle'))peak=Math.max(peak,groundElevation(x,y));
  check('最高点は5m×18倍以上、誇張倍率18を維持',peak>=5*18/1000*GROUND_SCALE&&d.meta.elevationExaggeration===18);
  rows.push({name:'最高点（地面の基準高から）',ok:true,detail:(peak/GROUND_SCALE*1000/18).toFixed(2)+'m / 表示 '+(peak/GROUND_SCALE*1000).toFixed(1)+'m'});
  check('北西・北東に東西に長い砂丘列8本と低い溝',d.height.ridges.length===8&&d.height.ridges.every(p=>p.y>=64&&p.heightM>=5&&p.heightM<=15&&p.widthXKm>=p.widthYKm*2&&groundElevation(p.x,p.y)>groundElevation(p.x,p.y-1.5)+4*18/1000*GROUND_SCALE));
  check('段丘y61の縁で実高度差3m以上',groundElevation(30,62)-groundElevation(30,60)>3*18/1000*GROUND_SCALE);
  check('観測高地4か所を前進拠点B/Eから5km以上離して配置',d.height.observationHills.length===4&&d.height.observationHills.every(p=>['B','E'].every(id=>{const s=d.sites.find(s=>s.id===id);return Math.hypot(p.x-s.x,p.y-s.y)>5;})&&groundElevation(p.x,p.y)>groundElevation(p.x,p.y-3)+4*18/1000*GROUND_SCALE));
  check('旧河道と塩性窪地を追加し水系は既存のまま',d.height.depressions.length===6&&d.water.ponds.length===1&&d.water.rivers.length===3);
  rows.push({name:'実配置モデル数',ok:true,detail:JSON.stringify({forest:actual('forest'),forestZones:Object.fromEntries(['bank','windbreak','island'].map(z=>[z,groundForests.filter(p=>p.zone===z).length])),shrubs:actual('shrubs'),shrubLobes:actual('shrubLobes'),reeds:actual('reeds'),buildings:actual('buildings')})});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),site=id=>groundSites.find(s=>s.id===id);
  check('中間点で30km自走砲・50kmロケットの距離帯を使える',distance(site('D'),site('E'))<=30&&distance(site('C'),site('H'))>30&&distance(site('C'),site('H'))<=50&&distance(site('A'),site('F'))>50);
  check('港と河口橋に海上から24km艦砲が届く',[['G',23,14],['H',46,12],['I',76,15]].every(([id,x,y])=>groundPass(x,y,'sea')&&distance(site(id),{x,y})<=d.navalFireRangesKm.cl.indirect.max));
  const net=groundSupplyNet,start=net.sites.get(site('A')),end=net.sites.get(site('F'));
  const lengths=Array(net.nodes.length).fill(Infinity),done=new Set();lengths[start]=0;
  while(true){let at=-1;for(let i=0;i<lengths.length;i++)if(!done.has(i)&&(at<0||lengths[i]<lengths[at]))at=i;if(at<0||!Number.isFinite(lengths[at])||at===end)break;done.add(at);for(const i of net.nodes[at].edges){const e=net.edges[i],next=e.a===at?e.b:e.a;if(e.open)lengths[next]=Math.min(lengths[next],lengths[at]+e.path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-e.path[i][0],p[1]-e.path[i][1]),0));}}
  check('実補給グラフの本営間最短路は60km以上',lengths[end]>=60&&Number.isFinite(lengths[end]));
  rows.push({name:'本営間の最短道路距離',ok:true,detail:lengths[end].toFixed(3)+'km'});
  groundSites.forEach(s=>s.owner=0);net.edges.forEach(e=>e.owner=0);groundSupplyRefresh();
  check('道路と橋を通じ西本営から東本営へ実補給',groundSupplyAt({team:0,pos:site('F').pos}).rate===1);
  for(const [name,p] of [['西の共通幹線',[19,53]],['東の共通幹線',[77,48]]]){
   const changed=net.edges.filter(e=>groundDistance(...p,e.path)<1e-6);changed.forEach(e=>e.owner=1);groundSupplyRefresh();
   check(name+'の占領で補給を切断',changed.length>0&&groundSupplyAt({team:0,pos:site('F').pos}).rate===0);
   changed.forEach(e=>e.owner=0);groundSupplyRefresh();
  }
  return rows;
 })()`);
}
module.exports={nodeChecks};
if(require.main===module){const rows=nodeChecks();for(const r of rows)console.log((r.ok?'✓ ':'✗ ')+r.name+(r.detail?' '+r.detail:''));assert(rows.every(r=>r.ok));}
