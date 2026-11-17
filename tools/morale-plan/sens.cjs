const fs=require('fs'),cp=require('child_process');
const base=require('./p6.json');
const D=(a,b,o={})=>({name:o.tag,models:['new'],units:[{k:a,team:0,x:0},{k:b,team:1,x:o.km||.7,h:[-1,0],cover:o.cover,dug:o.dug}],T:300});
const B=(g,b,o={})=>({name:o.tag,models:['new'],units:[{k:g,team:0,x:0,gun:true,target:1},{k:b,team:1,x:20,h:[-1,0],cover:o.cover,dug:o.dug}],T:180});
const cases=[D('infantry','infantry',{tag:'歩兵どうし'}),D('vehicle','infantry',{tag:'戦車→歩兵'}),D('infantry','infantry',{cover:'town',dug:true,tag:'歩兵→町の歩兵'}),B('artillery','infantry',{tag:'砲→歩兵'}),B('artillery','infantry',{cover:'town',dug:true,tag:'砲→町の歩兵'}),D('vehicle','vehicle',{km:2,tag:'戦車どうし'})];
fs.writeFileSync('sc.json',JSON.stringify(cases));
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log('C | r | '+cases.map(c=>c.name+'（敗走秒/敗走側の損害%）').join(' | '));
for(const [C,r] of [[.4,2],[.5,1.5],[.5,2],[.5,2.5],[.6,2]]){
  const p=JSON.parse(JSON.stringify(base));p.C=C;p.r=r;fs.writeFileSync('ps.json',JSON.stringify(p));
  cp.execFileSync('node',['battle.cjs','ps.json','sc.json','3'],{stdio:['ignore','ignore','inherit']});
  const out=JSON.parse(fs.readFileSync('sc.out.json','utf8'));
  const cells=out.map(o=>{const runs=o.res.new;const loser=runs.map(r=>r.u.filter(u=>u.rout!=null||u.dead).sort((a,b)=>(a.rout??1e9)-(b.rout??1e9))[0]).filter(Boolean);
    return loser.length?`${avg(loser.map(u=>u.rout??0)).toFixed(0)}s/${avg(loser.map(u=>u.hpLost)).toFixed(0)}%`:'決着なし';});
  console.log(`${C} | ${r} | `+cells.join(' | '));
}
