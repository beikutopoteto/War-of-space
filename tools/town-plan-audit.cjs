/* Audit the actual generated plans, rendered instances, oriented footprints and cover boxes. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {openGame,ROOT}=require('./browser.cjs');
const approved=fs.readFileSync(path.join(ROOT,'test-results/town-plan/approved-terrain.js'),'utf8'),approvedPlanSource=approved.slice(approved.indexOf('function townRng('),approved.indexOf('let groundBackground='));
(async()=>{const {browser,page,errors}=await openGame();try{
 const maps=[];
 for(const id of ['exercise2','baikonur2','field150','field300']){
 const result=await page.evaluate(({id,approvedPlanSource})=>{
  const approvedPlan=new Function(approvedPlanSource+';return townPlan;')();
  const original=townPlan,plans=new Map();townPlan=o=>{const t=original(o);plans.set(o.seed,{o,t});return t;};
  try{reset({op:id==='baikonur2'?'baikonur':id==='exercise2'?'groundExercise2':'ground'+id});setSpeed(0);}finally{townPlan=original;}
  const d=groundData(),overlap=(p,q)=>[p.u,p.v,q.u,q.v].every(ax=>{
   const gap=Math.abs((q.x-p.x)*ax[0]+(q.y-p.y)*ax[1]),radius=b=>b.hw*Math.abs(b.u[0]*ax[0]+b.u[1]*ax[1])+b.hd*Math.abs(b.v[0]*ax[0]+b.v[1]*ax[1]);return gap<radius(p)+radius(q)-1e-9;});
  const corners=b=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[b.x+b.u[0]*b.hw*i+b.v[0]*b.hd*j,b.y+b.u[1]*b.hw*i+b.v[1]*b.hd*j]);
  // Segment versus oriented rectangle expanded by the road radius, then exact distance to its edges.
  const distToBox=(a,b,box)=>{
   const local=p=>[(p[0]-box.x)*box.u[0]+(p[1]-box.y)*box.u[1],(p[0]-box.x)*box.v[0]+(p[1]-box.y)*box.v[1]],p=local(a),q=local(b),delta=[q[0]-p[0],q[1]-p[1]];let lo=0,hi=1;
   for(let k=0;k<2;k++){const h=k?box.hd:box.hw;if(Math.abs(delta[k])<1e-12){if(Math.abs(p[k])>h){hi=-1;break;}}else{const u=(-h-p[k])/delta[k],v=(h-p[k])/delta[k];lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}}
   if(lo<=hi)return 0;
   const cs=corners(box),pointDist=p=>Math.hypot(Math.max(0,Math.abs(p[0])-box.hw),Math.max(0,Math.abs(p[1])-box.hd));return Math.min(pointDist(p),pointDist(q),...cs.map(c=>townSegDist(...c,a,b)));
  };
  const rows=[],issues=[];
  for(const spec of d.objects.settlements){const sid=spec.site||spec.id,seed=d.meta.seed+Array.from(sid).reduce((n,c)=>n+c.charCodeAt(0),0),{o,t}=plans.get(seed),items=[...t.buildings,...t.facilities],meshes=groundBoard.children.filter(m=>m.userData.settlement===sid),actual=kind=>meshes.filter(m=>m.userData.groundObject===kind).reduce((n,m)=>n+m.count,0);
   let overlaps=0;for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(overlap(items[i].b,items[j].b)){overlaps++;issues.push({sid,kind:'overlap',i,j,keys:[items[i].key,items[j].key]});}
   const wetExact=(x,y)=>!groundPass(x,y,'vehicle')||d.water.rivers.some(r=>{const q=groundRiverAt(x,y,r);return q.dist<q.width/2+.1;});
   let water=0,roads=0;
   for(let i=0;i<items.length;i++){const b=items[i].b,cs=corners(b),samples=[[b.x,b.y]];
    for(let j=0;j<4;j++){const a=cs[j],q=cs[(j+1)%4],n=Math.ceil(Math.hypot(q[0]-a[0],q[1]-a[1])/.005);for(let k=0;k<=n;k++)samples.push([a[0]+(q[0]-a[0])*k/n,a[1]+(q[1]-a[1])*k/n]);}
    if(samples.some(p=>wetExact(...p))){water++;issues.push({sid,kind:'water',i,key:items[i].key});}
    if(t.roads.some(r=>r.pts.slice(1).some((p,k)=>distToBox(r.pts[k],p,b)<t.W[r.cls]/2-1e-8))||d.objects.roads.some(r=>r.points.slice(1).some((p,k)=>distToBox(r.points[k],p,b)<.19/2-1e-8))){roads++;issues.push({sid,kind:'road',i,key:items[i].key});}
   }
   const old=approvedPlan({...o,wet:wetExact}),planKeys=['c','R0','Redge','grow','roads','blocks','facilities','buildings'],planUnchanged=planKeys.every(k=>JSON.stringify(old[k])===JSON.stringify(t[k]));
   const boxes=groundBuildings.filter(b=>b.settlement===sid);let bounds=true;
   for(const mesh of meshes.filter(m=>['buildings','hqFacilities'].includes(m.userData.groundObject))){const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),v=mesh.geometry.attributes.position;
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const center=new THREE.Vector3().setFromMatrixPosition(matrix).multiplyScalar(GROUND_SCALE),box=boxes.find(b=>Math.hypot(b.x-center.x,b.z-center.z)<1e-4);
     if(!box){bounds=false;continue;}for(let j=0;j<v.count;j++){p.fromBufferAttribute(v,j).applyMatrix4(matrix).multiplyScalar(GROUND_SCALE);if(p.x<box.minX-1e-4||p.x>box.maxX+1e-4||p.z<box.minZ-1e-4||p.z>box.maxZ+1e-4||p.y<box.bottom-1e-4||p.y>box.top+1e-4)bounds=false;}
    }
   }
   rows.push({id:sid,layout:o.layout,tier:o.tier,buildings:actual('buildings'),expected:groundTownCount(spec),facilities:actual('hqFacilities'),overlaps,roads,water,coverBounds:bounds,planUnchanged,tee:t.tee,dead:t.dead});
  }
  return {id,rows,issues};
 },{id,approvedPlanSource});maps.push(result);console.log(JSON.stringify(result));
 }
 if(errors.length)throw new Error(errors.join('\n'));
 fs.writeFileSync(path.join(ROOT,'test-results/town-plan/audit.json'),JSON.stringify(maps,null,2)+'\n');
 assert(maps.every(m=>m.rows.every(r=>r.buildings===r.expected&&!r.overlaps&&!r.roads&&!r.water&&r.coverBounds&&r.planUnchanged)),'Town footprint audit failed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
