#!/usr/bin/env node
/* Lists the parts of ground models that touch nothing else (docs/models.md 4). A part that floats free of the body shows on the
   sample sheet as a gap, so run this after changing a shape:
     node tools/model-floaters.cjs [key ...] [--tol 0.012]     (no key: every key in GROUND_SHAPES)
   Each part's surface is sampled every 0.008; two parts are joined when samples of both lie within tol of each other. The
   groups other than the biggest are printed with the centre and size of each part. A model whose parts are meant to be apart
   (the drone hive's small drones) is reported too — read the list, it is not a test */
const fs=require('fs'), vm=require('vm'), path=require('path'), ROOT=path.join(__dirname,'..'), THREE=require('three');
const args=process.argv.slice(2), ti=args.indexOf('--tol'), tol=ti>=0?+args[ti+1]:.012, keys=args.filter((a,i)=>!a.startsWith('--')&&(ti<0||i!==ti+1));
const ctx=vm.createContext({THREE,console,location:{search:''},URLSearchParams});
for(const f of ['battle/shapes.js','battle/ground-shapes.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
ctx.TOL=tol;
const check=vm.runInContext(`(KEY=>{ const parts=GROUND_SHAPES[KEY](), S=[], B=[], step=.008;
  parts.forEach(g=>{ g=g.index?g.toNonIndexed():g; const q=g.attributes.position, pts=[], V=i=>new THREE.Vector3(q.getX(i),q.getY(i),q.getZ(i));
    for(let i=0;i<q.count;i+=3){ const a=V(i), b=V(i+1), c=V(i+2), n=Math.max(1,Math.ceil(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))/step));
      for(let u=0;u<=n;u++) for(let v=0;v<=n-u;v++){ const w=n-u-v; pts.push([(a.x*u+b.x*v+c.x*w)/n,(a.y*u+b.y*v+c.y*w)/n,(a.z*u+b.z*v+c.z*w)/n]); } }
    S.push(pts); g.computeBoundingBox(); B.push(g.boundingBox.clone()); });
  const N=parts.length, adj=[...Array(N)].map(()=>new Set()), grid=new Map(), ck=(x,y,z)=>x+','+y+','+z;
  S.forEach((pts,i)=>pts.forEach(a=>{ const k=ck(Math.floor(a[0]/TOL),Math.floor(a[1]/TOL),Math.floor(a[2]/TOL)); let c=grid.get(k); if(!c) grid.set(k,c=[]); c.push([i,a]); }));
  S.forEach((pts,i)=>pts.forEach(a=>{ const gx=Math.floor(a[0]/TOL), gy=Math.floor(a[1]/TOL), gz=Math.floor(a[2]/TOL);
    for(let x=gx-1;x<=gx+1;x++) for(let y=gy-1;y<=gy+1;y++) for(let z=gz-1;z<=gz+1;z++){ const c=grid.get(ck(x,y,z)); if(!c) continue;
      for(const [j,b] of c){ if(j<=i||adj[i].has(j)) continue; const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2]; if(dx*dx+dy*dy+dz*dz<TOL*TOL){ adj[i].add(j); adj[j].add(i); } } } }));
  const comp=Array(N).fill(-1); let nc=0; for(let i=0;i<N;i++){ if(comp[i]>=0) continue; const st=[i]; comp[i]=nc; while(st.length){ const k=st.pop(); for(const m of adj[k]) if(comp[m]<0){ comp[m]=nc; st.push(m); } } nc++; }
  const size=Array(nc).fill(0); comp.forEach(c=>size[c]++); const main=size.indexOf(Math.max(...size)), out=[N+' parts, '+nc+' groups; main has '+size[main]];
  for(let c=0;c<nc;c++){ if(c===main) continue; out.push('group '+c+': '+comp.map((v,i)=>v===c?i:-1).filter(i=>i>=0).map(i=>{ const b=B[i], m=b.getCenter(new THREE.Vector3()), s=b.getSize(new THREE.Vector3()); return '#'+i+' c('+m.x.toFixed(2)+','+m.y.toFixed(2)+','+m.z.toFixed(2)+') s('+s.x.toFixed(2)+','+s.y.toFixed(2)+','+s.z.toFixed(2)+') tone '+(parts[i].userData.tone??1); }).join('; ')); }
  return out.join('\\n'); })`,ctx);
let bad=0;
for(const key of keys.length?keys:vm.runInContext('Object.keys(GROUND_SHAPES)',ctx)){ const r=check(key); if(r.includes('\n')) bad++; console.log(key+': '+r); }
console.log(bad?bad+' model(s) with parts apart':'every part touches its model');
