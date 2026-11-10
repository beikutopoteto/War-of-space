/* 地上作戦の海軍専用。classic script: globalsは関数の呼出し時にだけ参照。
   旧type・宇宙艦表・編成保存を変更しない。性能の換算と射撃への接続は呼出し側。
   射程・砲口高・目標高はゲーム用の仮値。砲口高はマスト高ではない。 */
const GROUND_NAVAL_PROFILES=Object.freeze({
  fastboat:Object.freeze({id:'fastboat',name:'高速艇',model:'ff',direct:8,indirect:8,aa:3,gunHeightM:4,targetHeightM:4}),
  aegis:Object.freeze({id:'aegis',name:'イージス艦',model:'cl',direct:24,indirect:24,aa:150,gunHeightM:8,targetHeightM:8}),
  battleship:Object.freeze({id:'battleship',name:'戦艦',model:'bb',direct:40,indirect:40,aa:6,gunHeightM:12,targetHeightM:12}),
  landing:Object.freeze({id:'landing',name:'揚陸艦',model:'dd',gunHeightM:4,targetHeightM:4})
});
const GROUND_NAVAL_EARTH_RADIUS_KM=6371,GROUND_NAVAL_GROUND_TARGET_HEIGHT_M=2; // 目標の代表高2mは仮。
function groundNavalClass(f){
  if(!f||f.groundKind!=='sea')return null;
  let id;
  if(f.groundLanding===true)id='landing';
  else if(f.type==='cv'||f.type==='ff')id='fastboat';
  else if(f.type==='dd'||f.type==='cl')id='aegis';
  else if(f.type==='bb')id='battleship';
  else return null;
  const profile=GROUND_NAVAL_PROFILES[id];let rangesKm;
  if(id==='landing'){
    // 揚陸艦を旧type:ddだけでイージス艦とみなさない。射程は現在の作戦表をそのまま保持。
    const data=typeof op!=='undefined'&&op.ground&&typeof WOS_TERRAIN!=='undefined'?WOS_TERRAIN[op.ground]:null;
    const legacy=data?.navalFireRangesKm?.[f.type];
    if(!legacy||![legacy.direct,legacy.indirect?.min,legacy.indirect?.max,legacy.aa].every(Number.isFinite)||
      legacy.direct<0||legacy.indirect.min<0||legacy.indirect.max<legacy.indirect.min||legacy.aa<0)return null;
    rangesKm={direct:legacy.direct,indirect:{min:legacy.indirect.min,max:legacy.indirect.max},aa:legacy.aa};
  }else rangesKm={direct:profile.direct,indirect:{min:0,max:profile.indirect},aa:profile.aa};
  // 呼出し側が射程を戦闘単位へ変換しても、共有プロフィールや旧表へ書き戻さない。
  return {id:profile.id,name:profile.name,model:profile.model,rangesKm,gunHeightM:profile.gunHeightM,targetHeightM:profile.targetHeightM};
}
function groundNavalModel(f){return groundNavalClass(f)?.model??null;}
// 入力m、出力km。実装で採用した球面近似（方式は仮）。負の高さは0、型違い・非有限は拒否する。
function groundNavalHorizonFromMeters(sourceHeightM,targetHeightM){
  if(!Number.isFinite(sourceHeightM)||!Number.isFinite(targetHeightM))return null;
  // sqrt(2R*h1/1000)+sqrt(2R*h2/1000)。積のoverflowを避けて等価に評価。
  return Math.sqrt(2*GROUND_NAVAL_EARTH_RADIUS_KM)*(Math.sqrt(Math.max(0,sourceHeightM)/1000)+Math.sqrt(Math.max(0,targetHeightM)/1000));
}
function groundNavalHeightMeters(f,role='target'){
  if(!f?.pos||![f.pos.x,f.pos.y,f.pos.z].every(Number.isFinite)||!['gun','target'].includes(role))return null;
  if(f.groundKind==='sea'){
    const naval=groundNavalClass(f);
    if(naval)return role==='gun'?naval.gunHeightM:naval.targetHeightM;
    // 未統合の旧母艦型も標的にはなる。分類・武装を追加せず代表高4mだけ仮置きする。
    return role==='target'&&['cvb','mas','masc'].includes(f.type)?4:null;
  }
  if(role==='gun')return null;
  if(typeof op==='undefined'||!op.ground||typeof WOS_TERRAIN==='undefined'||typeof groundSightHeight!=='function'||typeof GROUND_SCALE==='undefined')return null;
  const e=WOS_TERRAIN[op.ground]?.meta?.elevationExaggeration,scale=GROUND_SCALE;
  if(!Number.isFinite(e)||e<=0||!Number.isFinite(scale)||scale<=0)return null;
  const displayHeight=groundSightHeight(f.pos.x,f.pos.z);
  if(!Number.isFinite(displayHeight))return null;
  // groundSightHeightは海面を0とする描画高。海抜datum(seaLevelM)を重ねて足し引きしない。
  const terrainM=displayHeight*1000/(scale*e);
  if(['low','high'].includes(f.band)){
    // 地表だけ18倍を戻す。航空高度は実際のpos.yから地表の描画高を引いてmへ換算する。
    const base=typeof groundHeight==='function'?groundHeight(f.pos.x,f.pos.z):displayHeight;
    if(!Number.isFinite(base))return null;
    return Math.max(0,terrainM+Math.max(0,f.pos.y-base)*1000/scale);
  }
  return Math.max(0,terrainM+GROUND_NAVAL_GROUND_TARGET_HEIGHT_M);
}
function groundNavalHorizonKm(f,t){
  if(!groundNavalClass(f))return null;
  const source=groundNavalHeightMeters(f,'gun'),target=groundNavalHeightMeters(t,'target');
  return groundNavalHorizonFromMeters(source,target);
}
