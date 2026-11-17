/* 総当たり（1隊 対 1隊、0.7 km、守りは攻めの方を向く）。node matrix.cjs params.json model cover(dug|none) */
const fs=require('fs'),cp=require('child_process');
const kinds=['infantry','heavyInfantry','mechanicalAssault','vehicle','apc','was'];
const [pf,model,cover]=process.argv.slice(2);
const cases=[];
for(const a of kinds)for(const b of kinds){const km=(a==='vehicle'&&b==='vehicle'||a==='was'&&b==='vehicle'||a==='vehicle'&&b==='was')?2:.7;
  cases.push({name:a+'>'+b,models:[model],units:[{k:a,team:0,x:0},{k:b,team:1,x:km,h:[-1,0],cover:cover==='dug'?'town':undefined,dug:cover==='dug'}],T:300});}
fs.writeFileSync('mx.json',JSON.stringify(cases));
cp.execFileSync('node',['battle.cjs',pf,'mx.json','3'],{stdio:['ignore','ignore','inherit']});
const out=JSON.parse(fs.readFileSync('mx.out.json','utf8'));
const short={infantry:'歩兵',heavyInfantry:'重歩兵',mechanicalAssault:'機械化',vehicle:'戦車',apc:'輸送車',was:'WAS'};
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log('攻め＼守り | '+kinds.map(k=>short[k]).join(' | '));
for(const a of kinds){const row=[short[a]];
  for(const b of kinds){const runs=out.find(o=>o.name===a+'>'+b).res[model];
    const A=runs.map(r=>r.u[0]),B=runs.map(r=>r.u[1]);
    const aOut=A.filter(u=>u.rout!=null||u.dead).length,bOut=B.filter(u=>u.rout!=null||u.dead).length,t=avg(runs.map(r=>r.t));
    const w=bOut>aOut?'攻':aOut>bOut?'守':'=';
    row.push(`${w} ${t.toFixed(0)}s ${avg(A.map(u=>u.hpLost)).toFixed(0)}/${avg(B.map(u=>u.hpLost)).toFixed(0)}`);}
  console.log(row.join(' | '));}
