/* 友軍がどの敵を狙っているかを時刻ごとの表にする（目標の分散の確かめ。2026-10-13）。2〜4分かかる。
   node tools/ally-targets.cjs <nile|denali|februaria>[B] [回数]（B: 駐屯隊は何もしない。デナリの B でもユーコンは港と離脱点へ動かす）
   TECH=1 で全研究のあと（第3節は研究なしだと駐屯隊が先に全滅しやすい）。EVERY=<歩数> で表の間隔（既定 400 歩 = 20秒）。
   行の読み方: 時刻 段階 見える敵（うち砲台） 狙える敵（見えている艦と場所の分かっている砲台、区画の外） 最多=1つの敵を狙う隊の数/狙っている隊の数
   届く=狙っている隊の leash の中の敵 | 隊→狙う相手（? は見えていない砲台へ向かう途中、守(…) は protect で撃っている相手、待機・移動・離脱）。
   ★ 届く敵が2つ以上あるのに、狙っている隊がみな同じ敵（他= ほかの敵と各隊の持ち場からの距離/leash）。★★ 見える敵が2つ以上あるのに全隊（待機も含む）が同じ敵。
   最後に、それぞれが起きた回数（1秒ごとに数える）と勝ち負け */
const { openGame } = require('./browser.cjs');
const opId=process.argv[2]||'nile', runs=+(process.argv[3]||1);
(async()=>{
 for(let r=0;r<runs;r++){
  const { browser, page, errors } = await openGame();
  await page.click('#dbgT'); await page.click('#dbgB [data-dbga="all"]');
  if(process.env.TECH) await page.click('#dbgB [data-dbga="tech"]');
  const real=opId.replace(/B$/,'');
  await page.click('[data-go="sortie"]'); await page.click(`[data-op="${real}"]`); await page.click('#goBattle'); await page.waitForTimeout(800);
  await page.click('#talkSkip').catch(()=>{}); await page.waitForTimeout(300);
  await page.click('#deployGo').catch(()=>{});
  const res=await page.evaluate(([opId,EV])=>{
    const idle=/B$/.test(opId), real=opId.replace(/B$/,'');
    const mine=()=>fleets.filter(f=>f.team===0&&!f.ward&&f.alive&&!f.isCarrier&&!f.ally);
    const P=op.body&&op.body.port, port=P?new THREE.Vector3(P.pos[0],0,P.pos[1]):null;
    let n=0, sent=false, flee=false; const rows=[]; let allSame=0, multi=0, badRows=0, sAll=0, sMulti=0; const EVERY=EV;
    while(!over&&n++<80000){ step(.05);
      if(n%10) continue;
      const en=fleets.filter(x=>x.team===1&&x.alive&&x.seen);
      if(n%20===0){
        if(!idle&&real==='nile'){ for(const f of mine()){ const e=en.filter(e=>e.pos.length()<60).sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0]; if(e){ if(!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); } } }
        if(!idle&&real==='februaria') fleets.filter(f=>f.team===0&&!f.ward&&f.alive).forEach(f=>{ const spot=fieldC.clone(), back=spot.clone().add(new THREE.Vector3(0,0,25));   /* tools/februaria-sim g */
          if(en.some(e=>e.type==='mas'&&e.pos.distanceTo(f.pos)<36)){ if(!(f.order&&f.order.type==='move'&&f.order.dest.distanceTo(back)<3)) order(f,{type:'move',dest:back}); return; }
          const e=en.filter(e=>e.type!=='mas'&&e.pos.distanceTo(spot)<60).sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0];
          if(e){ if(!(f.order&&f.order.target===e)) order(f,{type:'attack',target:e}); } else if(f.pos.distanceTo(spot)>8&&!(f.order&&f.order.type==='move')) order(f,{type:'move',dest:spot}); });
        if(real==='denali'){
          if(phaseName==='奪還'||phaseName==='交戦'){
            const tgt=en.filter(e=>e.name.includes('第14')||e.name==='第5 デナリ対空砲台'||e.name==='第6 デナリ対空砲台');
            if(!idle) for(const f of mine()) if(!f.order){ const e=tgt.sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0]; if(e) order(f,{type:'attack',target:e}); }
            if(!sent&&portOpen()&&!fleets.some(x=>x.alive&&(x.name.includes('第14')||x.name==='第5 デナリ対空砲台'||x.name==='第6 デナリ対空砲台'))){ sent=true; order(opCarrier,{type:'move',dest:port.clone()}); }
            if(n>8000&&!sent&&portOpen()){ sent=true; order(opCarrier,{type:'move',dest:port.clone()}); }
          } else if(phaseName==='収容'||phaseName==='占領'){ if(!idle){ const raid=en.filter(e=>!e.fixed); for(const f of mine()) if(!f.order||n%200===0){ const e=raid.sort((a,b)=>a.pos.distanceTo(f.pos)-b.pos.distanceTo(f.pos))[0]; if(e) order(f,{type:'attack',target:e}); } } }
          else if(phaseName==='撤退'){ if(!opCarrier.order) order(opCarrier,{type:'move',dest:opCarrier.cs.exit.clone()}); if(!flee){ flee=true; for(const f of mine()) order(f,{type:'move',dest:opCarrier.cs.exit.clone()}); } }
        }
      }
      if(typeof talking!=='undefined'&&talking) endTalk();
      if(n%20) continue;
      const al=fleets.filter(f=>f.ally&&f.alive&&!f.fixed&&!f.isCarrier);
      const nm=t=>t?t.name.replace(/ (戦闘隊|エスカドラ|支隊|打撃群)/g,'').replace(/デナリ/,'').replace(/^第/,'').slice(0,7):'-';
      const tgtOf=f=>{ if(f.mode==='protect') return null; if(f.order&&f.order.type==='attack') return f.order.target; if(f.aim&&f.aim.alive) return f.aim; return null; };
      const cells=al.map(f=>{ const t=tgtOf(f); return `${nm(f)}→${f.mode==='protect'?'守('+nm(f.fireTarget)+')':f.mode==='leave'?'離脱':t?nm(t)+(t.seen?'':'?'):(f.order?'移動':'待機')}`; });
      const seen=fleets.filter(f=>f.team===1&&f.alive&&f.seen), bat=seen.filter(f=>f.fixed).length;
      const ts=al.filter(f=>f.mode==='guard').map(tgtOf).filter(Boolean), same=ts.length>=2&&ts.every(t=>t===ts[0]);
      const cand=fleets.filter(f=>f.team===1&&f.alive&&(f.fixed||f.seen&&!(op.civil&&inZone(f)))).length;
      /* reach: foes the engaged allies could pick instead (within the leash of the post of one of them) */
      const eng=al.filter(f=>f.mode==='guard'&&tgtOf(f)), reach=fleets.filter(p=>p.team===1&&p.alive&&(p.fixed||p.seen&&!(op.civil&&inZone(p)))&&eng.some(f=>p.pos.distanceTo(f.post)<f.leash)).length;
      const bad=reach>=2&&same; const why=bad?' 他='+fleets.filter(p=>p.team===1&&p.alive&&p!==ts[0]&&(p.fixed||p.seen&&!(op.civil&&inZone(p)))).map(p=>nm(p)+':'+eng.map(f=>Math.round(p.pos.distanceTo(f.post))+'/'+f.leash).join(',')).join(' ')+' force='+al.filter(x=>x.mode!=='leave').length:'';
      if(bad) allSame++;
      /* strict: every allied unit able to fight (guard, not protect / leave) goes for the same one, with 2+ foes in sight */
      const gu=al.filter(f=>f.mode==='guard'), strict=seen.length>=2&&gu.length>=2&&gu.every(f=>tgtOf(f)&&tgtOf(f)===tgtOf(gu[0]));
      if(seen.length>=2&&gu.length>=2) sMulti++; if(strict) sAll++;
      if(reach>=2&&ts.length>=2) multi++;
      const byT=new Map(); ts.forEach(t=>byT.set(t,(byT.get(t)||0)+1));
      if(n%EVERY===0||bad&&badRows++<12) rows.push(`${clockStr()} ${phaseName} 見える敵=${seen.length}(砲台${bat}) 狙える=${cand} 最多=${Math.max(0,...byT.values())}/${ts.length} 届く=${reach}${bad?' ★狙う隊がみな同じ'+why:''}${strict?' ★★全隊同じ':''} | ${cells.join(' / ')}`);
    }
    return {rows, allSame, multi, sAll, sMulti, outcome, clock:clockStr()};
  },[opId,+(process.env.EVERY||200)]);
  console.log(`## ${opId} run ${r}`); console.log(res.rows.join('\n')); console.log(`end ${res.clock} win=${res.outcome} 届く敵2以上で狙う隊がみな同じ=${res.allSame}/${res.multi} 見える敵2以上で全隊（待機も含む）同じ=${res.sAll}/${res.sMulti}`, errors.slice(0,2));
  await browser.close();
 }
})();
