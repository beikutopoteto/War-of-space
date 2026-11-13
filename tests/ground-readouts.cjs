const assert=require('assert/strict');
function readoutCases(){
 const rows=[],check=(name,ok)=>rows.push({name,ok:!!ok});
 op={ground:'exercise2',groundHQ:{0:'B',1:'F'}};groundSites=[];groundForests=[];groundBuildings=[];
 const make=(kind,team=0)=>{const p=groundPoint(15,29);return makeFleet(team,{name:kind,type:'cv',groundKind:kind,n:1,scale:.3,pos:[p.x,p.z],band:groundBands({groundKind:kind})[0]});};
 for(const kind of Object.keys(groundRuleSet().unitTypes)){
  const f=make(kind),ground=groundBands(f).includes('ground');f.band=ground?'ground':groundBands(f)[0];
  check(kind+'の道路占領は地上対応だけ',groundCanCaptureRoad(f)===ground);
 }
 const tank=make('vehicle'),enemy=make('infantry',1),edge={path:[[14,29],[16,29]],x:15,y:29,owner:1,contested:false,progress:[0,0]};
 fleets=[tank];groundSupplyNet={edges:[edge],revision:0};
 groundSupplyRoadCapture(4.9);check('敵道路は5秒直前まで敵のまま',edge.owner===1&&Math.abs(edge.progress[0]-4.9)<1e-6);
 groundSupplyRoadCapture(.1);check('戦車も道路を5秒で占領',edge.owner===0&&edge.progress[0]===0);
 edge.owner=1;edge.progress=[0,0];groundSupplyRoadCapture(2);groundRememberTerritory();
 check('静止中も観測した進捗を保持',edge.knownProgress[0]===2&&edge.knownCapturingTeam===0);
 groundSupplyRoadCapture(1);groundRememberTerritory();check('静止中の道路カウントダウンも更新',edge.knownProgress[0]===3&&groundCaptureReadout(edge,5).includes('あと2秒'));
 fleets.push(enemy);groundSupplyRoadCapture(2);groundRememberTerritory();check('競合中は進捗を止め表示',edge.progress[0]===3&&groundCaptureReadout(edge,5).includes('競合中'));
 fleets=[tank];tank.embarked={};check('搭乗中は道路占領しない',!groundCanCaptureRoad(tank));tank.embarked=null;tank.groundRout='routing';check('敗走中は道路占領しない',!groundCanCaptureRoad(tank));tank.groundRout=null;
 const s={knownOwner:1,knownContested:false,knownProgress:[12,0],knownCapturingTeam:0,observed:true};
 check('拠点は30秒の残り時間',groundCaptureReadout(s,30).includes('あと18秒'));
 s.knownCapturingTeam=null;check('部隊が離れた進捗は中断表示',groundCaptureReadout(s,30).includes('中断'));
 s.observed=false;s.progress=[29,0];check('視界外は最終確認の18秒を維持',groundCaptureReadout(s,30).includes('最終確認')&&groundCaptureReadout(s,30).includes('18秒'));
 check('双方の進捗が残っても現在占領中の軍を優先',groundCaptureReadout({knownOwner:null,knownProgress:[20,5],knownCapturingTeam:1},30).includes('赤 あと25秒'));
 check('未発見の拠点は敵情報を表示しない',groundCaptureReadout({knownOwner:null},30)==='未占領');
 check('戦車は直接射撃の射程',groundRangeInfo(tank).text==='直接射撃');
 const gun=make('artillery'),info=groundRangeInfo(gun);check('自走砲は間接砲撃を主表示',info.text==='間接砲撃');
 check('自走砲は直射2kmと間接2〜30kmを別枠で表示',info.entries.length===2&&info.entries.some(e=>e.id==='direct'&&e.range===2*GROUND_SCALE)&&info.entries.some(e=>e.id==='indirect'&&e.min===2*GROUND_SCALE&&e.range===30*GROUND_SCALE));
 check('補給部隊に射程は出さない',groundRangeInfo(make('supply'))===null);
 check('拠点占領時間は30秒を維持',groundRuleSet().capture.seconds===30);
 return rows;
}
function nodeChecks(){const {run}=require('./ground-landing.cjs').createGroundContext();return run(`(${readoutCases.toString()})()`);}
module.exports={readoutCases,nodeChecks};
if(require.main===module){const rows=nodeChecks(),bad=rows.filter(r=>!r.ok);console.log(`射程・占領表示 ${rows.length-bad.length}/${rows.length}`);assert.equal(bad.length,0,JSON.stringify(bad));}
