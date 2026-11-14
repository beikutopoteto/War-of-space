/* 地上編成。宇宙編成から独立した保存データと、出撃時の中隊への変換。 */
window.WOS_GROUND_ORG=(()=>{
  const MAX_COMPANIES=4, MAX_BATTALIONS=3;
  const types=()=>window.WOS_GROUND_RULES.unitTypes;
  function defaults(){
    const companies=window.WOS_GROUND_DEFAULT_COMPANIES.map((f,i)=>({id:'gc'+(i+1),name:f.name,kind:f.groundKind}));
    return {companies,battalions:[{id:'gb1',name:'第1 大隊',companies:companies.slice(0,3).map(c=>c.id)},
      {id:'gb2',name:'第2 大隊',companies:companies.slice(3).map(c=>c.id)}],brigades:[{id:'gr1',name:'第1 旅団',battalions:['gb1','gb2']}]};
  }
  function normalize(value){
    if(!value||!Array.isArray(value.companies)) return defaults();
    const unique=(items,make)=>{ const seen=new Set(); return (Array.isArray(items)?items:[]).flatMap(x=>{
      if(!x||typeof x.id!=='string'||seen.has(x.id)) return []; seen.add(x.id); return [make(x)]; }); };
    const companies=unique(value.companies,c=>({id:c.id,name:String(c.name||'中隊'),kind:types()[c.kind]?c.kind:'infantry'}));
    const usedC=new Set(), usedB=new Set();
    const take=(ids,all,used,max)=>{
      const out=[];for(const id of Array.isArray(ids)?ids:[]){
        if(out.length>=max)break;
        if(!used.has(id)&&all.some(x=>x.id===id)){used.add(id);out.push(id);}
      }return out;
    };
    const battalions=unique(value.battalions,b=>({id:b.id,name:String(b.name||'大隊'),companies:take(b.companies,companies,usedC,MAX_COMPANIES)}));
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
  function remove(org,level,id){
    org[level]=org[level].filter(x=>x.id!==id);
    if(level==='companies') org.battalions.forEach(b=>b.companies=b.companies.filter(x=>x!==id));
    if(level==='battalions') org.brigades.forEach(b=>b.battalions=b.battalions.filter(x=>x!==id));
    // 大隊・旅団の解散で下位の部隊は削除しない。
  }
  function sortie(value){
    let org=normalize(value); if(!org.companies.length) org=defaults();
    const fleets=org.companies.map(c=>({name:c.name,groundKind:c.kind,companyId:c.id,vis:9,stl:0,
      band:['fighter','supportAircraft'].includes(c.kind)?'high':['attack','droneHive'].includes(c.kind)?'low':'ground'}));
    return {org,fleets};
  }
  return {MAX_COMPANIES,MAX_BATTALIONS,types,defaults,normalize,assign,remove,sortie};
})();
