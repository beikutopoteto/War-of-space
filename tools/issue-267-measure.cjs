/* #267: 行だけ表示。FEINT_BASELINE=1 は HEAD の戦艦経路だけをページ内で復元する。 */
const {spawn} = require('child_process');
const readline = require('readline');
const strat=process.argv[2], runs=process.argv[3]||'runs=3';
if(!['idle','auto'].includes(strat)) throw Error('idle または auto を指定');
const child=spawn(process.execPath,['tools/feint-sim.cjs',strat,runs],{env:process.env,stdio:['ignore','pipe','inherit']});
const data=new Map();
readline.createInterface({input:child.stdout}).on('line',line=>{
 const r=JSON.parse(line); if(!r.run) return;
 const d=data.get(r.run)||{samples:[]}; data.set(r.run,d);
 if(r.type==='sample') d.samples.push(r);
 if(r.type==='summary'){
  const ends={distance:0,time:0,sunk:0}; for(const e of r.chaseEnds) if(e.opMin>=60 && e.opMin<=150) ends[e.reason]++;
  const samples=[]; for(let t=60;t<=150;t+=10){ const candidates=d.samples.filter(s=>s.opMin>=60 && Math.abs(s.opMin-t)<2.4); const s=candidates.sort((a,b)=>Math.abs(a.opMin-t)-Math.abs(b.opMin-t))[0]; samples.push(s?[t,s.clock,...s.screens.map(x=>x.outside)]:[t,null]); }
  const sides={}; for(const side of ['左上','右下']){ const own=r.units.filter(u=>u.feint===side), names=new Set(own.map(u=>u.name)), pack=side==='左上'?'西上守備隊':'東下守備隊', dist=[];
   for(const s of d.samples.filter(s=>s.opMin>=60&&s.opMin<=150)){ const enemies=s.units.filter(u=>u.alive&&u.pack===pack); for(const f of s.units.filter(u=>u.alive&&names.has(u.name)&&u.mode==='feint')) if(enemies.length) dist.push(Math.min(...enemies.map(e=>Math.hypot(...f.pos.map((v,i)=>v-e.pos[i]))))); }
   const edge=[]; for(const s of d.samples.filter(s=>s.opMin>=60&&s.opMin<=150)) for(const f of s.units.filter(u=>u.alive&&names.has(u.name)&&u.mode==='feint')) if(s.guns.length) edge.push(Math.min(...s.guns.map(g=>Math.hypot(...f.pos.map((v,i)=>v-g.pos[i]))-g.range)));
   edge.sort((a,b)=>a-b); dist.sort((a,b)=>a-b); sides[side]={median:dist.length?Math.round(dist[Math.floor(dist.length/2)]*10)/10:null,edgeMedian:edge.length?Math.round(edge[Math.floor(edge.length/2)]*10)/10:null,loss:own.map(u=>[u.name,u.lost]),damage:own.reduce((a,u)=>{ for(const [k,v] of Object.entries(u.damageSources||{})) a[k]=(a[k]||0)+Math.round(v); return a; },{})}; }
  const umbrella=r.units.filter(u=>['西上守備隊','東下守備隊','北守備隊'].includes(u.pack)).map(u=>[u.name,Math.round(u.umbrellaOutSec*10)/10]);
  console.log(JSON.stringify({strat,run:r.run,samples,lure:r.lure,sides,umbrella}));
 }
});
child.on('exit',code=>{process.exitCode=code||0;});
