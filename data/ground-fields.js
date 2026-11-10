/* 第二章の作戦ではない、広い戦場の寸法・射程・補給を確認する隠し検証場。 */
(function(){
 for(const [ground,W,H,hq,enemyHQ] of [['field150',150,100,[20,78],[130,80]],['field300',300,200,[35,150],[260,160]]]){
  const point=(x,y)=>[(x-W/2)*4,(H/2-y)*4],unit=(name,kind,x,y,band='ground')=>({name,groundKind:kind,type:'cv',n:1,scale:.3,pos:point(x,y),band,stance:'evade'});
  const kinds=[['強化歩兵','infantry'],['主力戦車','vehicle'],['重強化歩兵','heavyInfantry'],['斥候','scout'],['自走砲','artillery'],['ロケット車両','guidedRocket'],['自走対空砲','mobileAA'],['工兵','engineer'],['補給','supply'],['装甲兵員輸送車','apc'],['陸戦型 W.A.S.','was'],['戦闘航空隊','fighter'],['広域戦略支援航空隊','supportAircraft']];
  const quick=kinds.map(([name,kind],i)=>unit('第'+(i+1)+' '+name,kind,hq[0]+(i%4-1.5)*.6,hq[1]+(Math.floor(i/4)-1)*.6,kind==='fighter'||kind==='supportAircraft'?'high':'ground'));
  const target=ground==='field150'?[60,79]:[95,145],ids=ground==='field150'?['A','B','C','D','E','F']:['A','B','C','D','E','F','G','H'],enemySite=ground==='field150'?'C':'D';
  WOS_DATA.operations.push({id:'ground'+ground,hidden:true,ground,forces:'fixed',groundStaticEnemies:true,name:W+'×'+H+'km 射程検証場',summary:'広域の射程・移動・補給・描画を確認する隠しフィールド。',brief:'通常の演習とは別の検証用配備です。本営から道路をたどり、前線へ進出してください。敵は固定です。第二章の作戦や新しい物語は含みません。',date:'A.E. 45.08.20',start:'08:00',phase:'広域検証',reward:0,
   groundHQ:{0:'A',1:enemySite},groundSupportSites:['A',enemySite],groundSites:ids.map(site=>({site,owner:site==='A'?0:site===enemySite?1:null})),quick,
   groundSea:[{...unit('高速艇 検証隊','sea',W*.18,H*.12,'sea'),type:'ff',team:0},{...unit('イージス艦 検証隊','sea',W*.78,H*.1,'sea'),type:'cl',team:0}],
   enemies:[unit('固定戦車目標','vehicle',...target),unit('固定歩兵目標','infantry',target[0]+1,target[1]-1),unit('固定航空目標','fighter',enemyHQ[0]-2,enemyHQ[1],'low')],
   view:{target:point(...hq),dist:140,dir:[0,1,.65],max:Math.max(W,H)*4*2.5},win:{type:'ground',text:'検証用の中立拠点を占拠せよ'},result:{win:'広域検証を終了した。',lose:'検証部隊は全滅した。',winLog:['検証終了','地上の検証を終了。'],loseLog:['検証終了','検証を終了。']}});
 }
})();
