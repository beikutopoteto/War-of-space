/* 地上編成（docs/spec.md「地上の部隊編成」）。宇宙編成から独立した保存データと、出撃時の中隊への変換。
   中隊は大隊の行としてだけ作る（宇宙の支隊と同じ）。中隊は兵科1つと小隊の数（1〜4）を持つ。大隊は中隊を4つまで、旅団は大隊を4つまで。
   どの大隊にも入っていない中隊（前の中隊のページで作ったもの）は、読み込みのときに新しい大隊へまとめる。 */
window.WOS_GROUND_ORG=(()=>{
  const MAX_COMPANIES=4, MAX_BATTALIONS=4, MAX_PLATOONS=4;
  // 小隊の数を持たない中隊（前の保存・既定の部隊）と新しく加えた中隊は、満員の4小隊（仮、2026-11-18）。
  const NEW_PLATOONS=4;
  const types=()=>window.WOS_GROUND_RULES.unitTypes;
  const platoonCount=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(+n)?Math.min(MAX_PLATOONS,Math.max(1,Math.round(+n))):NEW_PLATOONS;
  const number=name=>{const m=/^第(\d+)/.exec(name||'');return m?+m[1]:null;};
  const freeNumber=list=>{const used=new Set(list.map(x=>number(x.name)));let n=1;while(used.has(n))n++;return n;};
  const freeId=(list,prefix)=>{const used=new Set(list.map(x=>x.id));let n=list.length+1;while(used.has(prefix+n))n++;return prefix+n;};
  // 自動の名前: 第N ＋兵科の名前＋中隊（N は全中隊で空いている番号）。名前を変えていない中隊（auto）は兵科を変えると名前も変わる。
  const companyName=(org,kind,self)=>`第${freeNumber(org.companies.filter(c=>c!==self))} ${types()[kind]?.name||'地上'}中隊`;
  function defaults(){
    const companies=window.WOS_GROUND_DEFAULT_COMPANIES.map((f,i)=>({id:'gc'+(i+1),name:f.name,kind:f.groundKind,platoons:NEW_PLATOONS}));
    return {companies,battalions:[{id:'gb1',name:'第1 大隊',companies:companies.slice(0,3).map(c=>c.id)},
      {id:'gb2',name:'第2 大隊',companies:companies.slice(3).map(c=>c.id)}],brigades:[{id:'gr1',name:'第1 旅団',battalions:['gb1','gb2']}]};
  }
  function normalize(value){
    if(!value||!Array.isArray(value.companies)) return defaults();
    const unique=(items,make)=>{ const seen=new Set(); return (Array.isArray(items)?items:[]).flatMap(x=>{
      if(!x||typeof x.id!=='string'||seen.has(x.id)) return []; seen.add(x.id); return [make(x)]; }); };
    const companies=unique(value.companies,c=>({id:c.id,name:String(c.name||'中隊'),kind:types()[c.kind]?c.kind:'infantry',platoons:platoonCount(c.platoons),...(c.auto?{auto:true}:{})}));
    const usedC=new Set(), usedB=new Set();
    const take=(ids,all,used,max)=>{
      const out=[];for(const id of Array.isArray(ids)?ids:[]){
        if(out.length>=max)break;
        if(!used.has(id)&&all.some(x=>x.id===id)){used.add(id);out.push(id);}
      }return out;
    };
    const battalions=unique(value.battalions,b=>({id:b.id,name:String(b.name||'大隊'),companies:take(b.companies,companies,usedC,MAX_COMPANIES)}));
    // どの大隊にも入っていない中隊は、4つずつ新しい大隊へ（中隊のページを消したので、見えなくならないように）。
    const loose=companies.filter(c=>!usedC.has(c.id));
    for(let i=0;i<loose.length;i+=MAX_COMPANIES){
      const ids=loose.slice(i,i+MAX_COMPANIES).map(c=>c.id);ids.forEach(id=>usedC.add(id));
      battalions.push({id:freeId(battalions,'gb'),name:`第${freeNumber(battalions)} 大隊`,companies:ids});
    }
    const brigades=unique(value.brigades,b=>({id:b.id,name:String(b.name||'旅団'),battalions:take(b.battalions,battalions,usedB,MAX_BATTALIONS)}));
    return {companies,battalions,brigades};
  }
  function assign(org,level,id,parentId){
    const child=level==='companies'?'companies':'battalions', parents=level==='companies'?org.battalions:org.brigades;
    if(!org[child].some(x=>x.id===id)) return false;
    const parent=parents.find(x=>x.id===parentId), max=level==='companies'?MAX_COMPANIES:MAX_BATTALIONS;
    if(parentId&&(!parent||(!parent[child].includes(id)&&parent[child].length>=max))) return false;
    parents.forEach(p=>p[child]=p[child].filter(x=>x!==id)); if(parent) parent[child].push(id); return true;
  }
  // 大隊の行に中隊を加える（満員・兵科が無いなら null）。
  function addCompany(org,battalionId,kind,platoons=NEW_PLATOONS){
    const b=org.battalions.find(x=>x.id===battalionId); if(!b||b.companies.length>=MAX_COMPANIES||!types()[kind]) return null;
    const c={id:freeId(org.companies,'gc'),name:companyName(org,kind),kind,platoons:platoonCount(platoons),auto:true};
    org.companies.push(c); b.companies.push(c.id); return c;
  }
  function setKind(org,id,kind){
    const c=org.companies.find(x=>x.id===id); if(!c||!types()[kind]) return false;
    c.kind=kind; if(c.auto) c.name=companyName(org,kind,c); return true;
  }
  function setPlatoons(org,id,n){ const c=org.companies.find(x=>x.id===id); if(!c) return false; c.platoons=platoonCount(n); return true; }
  // 大隊を消すと中の中隊も消える（宇宙の打撃群と同じ）。旅団を解散しても大隊は残る。
  function remove(org,level,id){
    if(level==='battalions'){ const b=org.battalions.find(x=>x.id===id); if(b) org.companies=org.companies.filter(c=>!b.companies.includes(c.id)); }
    org[level]=org[level].filter(x=>x.id!==id);
    if(level==='companies') org.battalions.forEach(b=>b.companies=b.companies.filter(x=>x!==id));
    if(level==='battalions') org.brigades.forEach(b=>b.battalions=b.battalions.filter(x=>x!==id));
  }
  // 大隊・旅団の中の中隊（並びの順）と、小隊の合計。
  function companiesOf(org,level,id){
    const x=org[level].find(x=>x.id===id); if(!x) return [];
    const ids=level==='brigades'?x.battalions.flatMap(b=>org.battalions.find(y=>y.id===b)?.companies||[]):x.companies;
    return ids.map(c=>org.companies.find(y=>y.id===c)).filter(Boolean);
  }
  const platoonsOf=list=>list.reduce((n,c)=>n+(c.platoons||1),0);
  /* クイック出撃の編成（ユーザーの指示 2026-11-21「大体は 歩兵と自走砲／戦車と補給、重歩兵、APC／それ以外の計三つ」）:
     兵科で3つの大隊に分け（強化歩兵1つは重強化歩兵と入れ替え。下）、1つの旅団に入れる。空の組は大隊を作らない。大隊は中隊4つまでなので、あふれた分は同じ組の次の大隊へ。
     旅団は大隊4つまでで、あふれたら次の旅団へ。companies は {id,kind} の並び（並びの順で大隊に入る） */
  const QUICK_GROUPS=[['infantry','artillery'],['vehicle','supply','heavyInfantry','apc']];
  function quickOrg(companies){
    const group=c=>{const i=QUICK_GROUPS.findIndex(g=>g.includes(c.kind));return i<0?QUICK_GROUPS.length:i;};
    const battalions=[],brigades=[],lists=[...Array(QUICK_GROUPS.length+1)].map((_,g)=>companies.filter(c=>group(c)===g));
    // ユーザーの指示 2026-11-21「第一大隊の歩兵中隊一つを第二大隊の重歩兵中隊を入れ替えて」: 強化歩兵が2つ以上なら、
    // 最後の強化歩兵1つと重強化歩兵1つを入れ替える（強化歩兵が1つだけなら第1 大隊に残す）。
    const [infantry,armor]=lists,light=infantry.filter(c=>c.kind==='infantry'),heavy=armor.find(c=>c.kind==='heavyInfantry');
    if(light.length>=2&&heavy){const moved=light[light.length-1];infantry[infantry.indexOf(moved)]=heavy;armor[armor.indexOf(heavy)]=moved;}
    for(const list of lists){
      const ids=list.map(c=>c.id);
      for(let i=0;i<ids.length;i+=MAX_COMPANIES)
        battalions.push({id:'qb'+(battalions.length+1),name:`第${battalions.length+1} 大隊`,companies:ids.slice(i,i+MAX_COMPANIES)});
    }
    for(let i=0;i<battalions.length;i+=MAX_BATTALIONS)
      brigades.push({id:'qr'+(brigades.length+1),name:`第${brigades.length+1} 旅団`,battalions:battalions.slice(i,i+MAX_BATTALIONS).map(b=>b.id)});
    return {battalions,brigades};
  }
  // 作戦で禁止された兵科は出撃する編成と集計の両方から除く。大隊・旅団の集計では作戦を指定しない。
  function sortieLoad(companies,operation){
    const {supplyWeight,sortieLimits}=window.WOS_GROUND_RULES;
    const config=operation?.groundSortie;
    const banned=config?.bannedKinds||[];
    const allowed=companies.filter(c=>c.kind!=='sea'&&!banned.includes(c.kind));
    const platoons=platoonsOf(allowed);
    const supplyUsed=allowed.reduce((n,c)=>n+(supplyWeight[c.kind]??0)*(c.platoons||1),0);
    const supplyPlatoons=platoonsOf(allowed.filter(c=>c.kind==='supply'));
    const supplyBonus=supplyPlatoons*sortieLimits.supplyPerPlatoon;
    const scale=sortieLimits.scales[operation?.groundScale];
    const scaleOver=!!scale&&platoons>scale.cap;
    const supplyBase=config?.supplyBase;
    const supplyLimit=supplyBase==null?null:supplyBase+supplyBonus;
    const excess=supplyLimit===null?0:Math.max(0,supplyUsed-supplyLimit);
    const penaltyPercent=Math.min(sortieLimits.maxPenalty,sortieLimits.penaltyPerPoint*excess);
    return {companies:allowed,platoons,scale,scaleOver,supplyUsed,supplyPlatoons,supplyBonus,supplyBase,supplyLimit,excess,penaltyPercent};
  }
  function sortie(value,operation){
    let org=normalize(value); if(!org.companies.length) org=defaults();
    const load=sortieLoad(org.companies,operation);
    if(load.companies.length!==org.companies.length) org=normalize({...org,companies:load.companies});
    const fleets=org.companies.map(c=>({name:c.name,groundKind:c.kind,groundPlatoons:c.platoons,companyId:c.id,vis:9,stl:0,
      band:['fighter','supportAircraft'].includes(c.kind)?'high':['attack','droneHive'].includes(c.kind)?'low':'ground'}));
    return {org,fleets,load};
  }
  return {MAX_COMPANIES,MAX_BATTALIONS,MAX_PLATOONS,NEW_PLATOONS,types,defaults,normalize,assign,addCompany,setKind,setPlatoons,remove,companiesOf,platoonsOf,sortieLoad,sortie,QUICK_GROUPS,quickOrg};
})();
