/* 地上の台本。判定は plain data だけを読む。適用・描画はこのファイルの後半。 */
function groundScriptCondition(c,s){
  if(!c)return false;
  if(c.all)return c.all.every(x=>groundScriptCondition(x,s));
  if(c.any)return c.any.some(x=>groundScriptCondition(x,s));
  if(c.at!==undefined)return s.time+1e-8>=c.at;
  if(Object.prototype.hasOwnProperty.call(c,'site'))return s.sites.some(x=>x.id===c.site&&x.owner===c.owner);
  if(c.lost!==undefined)return s.sites.some(x=>x.id===c.lost&&x.heldBy.includes(c.team)&&x.owner!==c.team);
  if(c.power){const t=s.teams[c.power.team];return t.initial>0&&t.power/t.initial<c.power.below;}
  if(c.inside){const q=c.inside;return s.units.filter(u=>u.team===q.team&&u.alive&&!u.exited&&!u.embarked&&Math.hypot(u.at[0]-q.at[0],u.at[1]-q.at[1])<=q.radiusKm).length>=(q.count??1);}
  if(c.flag!==undefined)return !!s.flags[c.flag];
  if(c.after){const at=s.done[c.after.event];return at!==undefined&&s.time-at+1e-8>=c.after.sec;}
  if(c.hold)return s.time+1e-8>=c.hold.until&&s.sites.some(x=>x.id===c.hold.site&&x.owner===c.hold.team);
  if(c.exited)return s.teams[c.exited.team].exited>=c.exited.count;
  if(c.wiped!==undefined){const t=s.teams[c.wiped];return t.alive===0&&t.exited===0;}
  return false;
}
function groundScriptMatch(rule,state){
  if(Array.isArray(rule))return rule.find(r=>groundScriptCondition(r.when,state))||null;
  return groundScriptCondition(rule,state)?{}:null;
}
function groundScriptEval(script,state){
  const result={actions:[],end:null,why:null,fired:[]};
  // 勝敗は毎ステップ、負け優先。出来事だけ0.5ゲーム秒ごと。
  for(const side of ['lose','win']){
    const why=groundScriptMatch(script[side],state);
    if(why){result.end=side;result.why=why;return result;}
  }
  if(state.eventsDue===false)return result;
  for(const e of script.events||[]){
    if(e.once!==false&&Object.prototype.hasOwnProperty.call(state.done,e.id))continue;
    if(!groundScriptCondition(e.when,state))continue;
    result.fired.push(e.id);result.actions.push(...(e.do||[]));
  }
  return result;
}

let groundScriptState=null;
function groundScriptReset(){
  groundScriptClearMarks();
  groundScriptState=null;
  if(!op.ground)return;
  groundScriptState={op,initial:[0,0],registered:new Set(),held:new Map(),done:Object.create(null),flags:Object.create(null),
    intents:{},marks:[],exits:[],pending:[],spawned:[],objective:op.groundScript?.objective??op.win?.text??'',
    overrides:{},result:null,nextEvent:0};
  groundScriptSnapshot();
}
function groundScriptLegacy(){
  let win;
  if(!op.groundDrill&&op.win?.type==='groundHQ')win={any:[{site:op.groundHQ?.[1],owner:0},{wiped:1}]};
  else if((!op.groundDrill||typeof tutorial!=='undefined'&&tutorial?.skipped)&&groundSites.length){
    win={all:(op.groundDrill?groundSites.filter(s=>s.id==='A'):groundSites.filter(s=>!(op.groundSupportSites||[]).includes(s.id))).map(s=>({site:s.id??groundSites.indexOf(s),owner:0}))};
  }
  return {win,lose:{wiped:0}};
}
function groundScriptCurrent(){
  const r=groundScriptState,base=groundScriptLegacy();
  return {...base,...op.groundScript,...r.overrides};
}
function groundScriptSnapshot(){
  const r=groundScriptState,teams=[0,1].map(()=>({initial:0,power:0,alive:0,exited:0}));
  const units=fleets.map(f=>{
    if(!r.registered.has(f)){r.registered.add(f);r.initial[f.team]+=Math.max(0,f.hpPool);}
    const t=teams[f.team];
    if(f.groundExited){t.exited++;t.power+=f.groundExitHp;}
    else if(f.alive&&f.hpPool>0){t.alive++;t.power+=f.hpPool;}
    return {team:f.team,alive:f.alive&&f.hpPool>0,exited:!!f.groundExited,embarked:!!f.embarked,at:[groundMapX(f.pos.x),groundMapY(f.pos.z)]};
  });
  teams.forEach((t,i)=>t.initial=r.initial[i]);
  const sites=groundSites.map((s,i)=>{
    const id=s.id??i;
    if(!r.held.has(id))r.held.set(id,new Set());
    if(s.owner!=null)r.held.get(id).add(s.owner);
    return {id,owner:s.owner,heldBy:[...r.held.get(id)]};
  });
  return {time:typeof gameSec==='undefined'?0:gameSec,sites,teams,units,flags:r.flags,done:r.done};
}
function groundScriptIntent(team){return groundScriptState?.intents[team];}
function groundScriptDescending(f){return (f.groundDescentUntil??-Infinity)>(typeof gameSec==='undefined'?0:gameSec)+1e-8;}
function groundScriptSpawn(spec){
  const r=groundScriptState;
  for(const unit of spec.units){
    const f=makeFleet(spec.team,groundUnitSpec(unit));fleets.push(f);groundInitUnit(f);
    if(spec.team===1&&op.npc?.[1])f.stance='engage';
    if(spec.via==='air'){f.groundDescentUntil=gameSec+(spec.descentSec??0);groundClearOrders(f);}
    r.spawned.push(f.id);
    if(spec.team===0){f.companyId='unit'+f.id;groundOrg.companies.push({id:f.companyId,name:f.name,kind:f.groundKind});}
  }
  groundScriptSnapshot();groundUpdateSight();buildRoster();updateRoster();
}
function groundScriptAddMark(spec){
  const m={...spec,at:[...spec.at],expires:spec.sec===undefined?null:gameSec+spec.sec,visual:null};
  groundScriptState.marks.push(m);return m;
}
function groundScriptApply(a){
  const r=groundScriptState;
  if(a.spawn){
    if(a.spawn.via==='air'){
      const spec=a.spawn,due=gameSec+(spec.warnSec??0);
      const marks=spec.units.map(u=>groundScriptAddMark({label:'降下予告',at:u.at,sec:spec.warnSec??0,radiusKm:groundRuleSet().capture.radiusKm,warning:true}));
      r.pending.push({spec,due,marks});
    }else groundScriptSpawn(a.spawn);
  }
  if(a.say)logEvent(...a.say);
  if(a.objective!==undefined)r.objective=a.objective;
  if(a.setWin!==undefined)r.overrides.win=a.setWin;
  if(a.setLose!==undefined)r.overrides.lose=a.setLose;
  if(a.intent)r.intents[a.intent.team]={...a.intent,zones:a.intent.zones&&[...a.intent.zones]};
  if(a.owner){const s=groundSites.find(s=>s.id===a.owner.site);if(s){s.owner=a.owner.team;s.progress=[0,0];s.contested=false;s.capturingTeam=null;groundScriptSnapshot();}}
  if(a.flag!==undefined)r.flags[a.flag]=true;
  if(a.mark)groundScriptAddMark(a.mark);
  if(a.exit){const ex={...a.exit,at:[...a.exit.at]};r.exits.push(ex);groundScriptAddMark({...ex,label:'出口 '+ex.id});}
  if(a.end)return a.end;
  return null;
}
function groundScriptExitStep(){
  const r=groundScriptState;
  let changed=false;
  for(const ex of r.exits)for(const f of fleets){
    if(f.team!==ex.team||!f.alive||f.hpPool<=0||f.embarked||groundAbsent(f)||f.band!=='ground'||groundScriptDescending(f))continue;
    if(Math.hypot(groundMapX(f.pos.x)-ex.at[0],groundMapY(f.pos.z)-ex.at[1])>ex.radiusKm)continue;
    changed=true;f.groundExited=ex.id;f.groundExitHp=f.hpPool;groundCancelWork(f);groundClearOrders(f);unselect(f);
    f.groundVisible=[false,false];f.groundContacts=[null,null];f.el.style.visibility='hidden';
    if(f.groundModel)f.groundModel.visible=false;groundSelectionDraw(f,false);
  }
  if(changed){buildRoster();updateRoster();}
}
function groundScriptFinish(side,why){
  groundScriptState.result=why?{side,text:why.text,log:why.log}:null;
  end(side==='win');
}
function groundScriptResult(win){
  const r=groundScriptState?.result,side=win?'win':'lose';
  if(!r||r.side!==side)return {};
  return {...(r.text!==undefined?{[side]:r.text}:{}),...(r.log?{[side+'Log']:r.log}:{})};
}
function groundScriptStep(dt){
  if(over)return;
  if(!groundScriptState||groundScriptState.op!==op)groundScriptReset();
  const r=groundScriptState;
  for(const p of [...r.pending])if(gameSec+1e-8>=p.due){groundScriptSpawn(p.spec);r.pending.splice(r.pending.indexOf(p),1);}
  groundScriptExitStep();
  const state=groundScriptSnapshot();state.eventsDue=state.time+1e-8>=r.nextEvent;
  const script=groundScriptCurrent(),answer=groundScriptEval(script,state);
  if(answer.end){groundScriptFinish(answer.end,answer.why);return;}
  if(state.eventsDue)r.nextEvent=(Math.floor((state.time+1e-8)/.5)+1)*.5;
  for(const id of answer.fired)r.done[id]=state.time;
  for(const a of answer.actions){const side=groundScriptApply(a);if(side){groundScriptFinish(side,null);return;}}
  // owner / setWin / setLose / flag / exit は同じステップの勝敗に反映する。
  groundScriptExitStep();
  if(answer.actions.length){const next=groundScriptEval(groundScriptCurrent(),{...groundScriptSnapshot(),eventsDue:false});if(next.end)groundScriptFinish(next.end,next.why);}
  for(const m of [...r.marks])if(m.expires!==null&&gameSec+1e-8>=m.expires){groundScriptDropMark(m);r.marks.splice(r.marks.indexOf(m),1);}
}
function groundMissionHud(){
  const n=groundSites.filter(s=>s.owner===0).length,p=groundSites.length?n/groundSites.length:0;
  if(!op.groundScript)return {text:op.groundDrill?'西方集落を占拠せよ':op.win.text,p,label:`拠点 ${n}/${groundSites.length}　自軍全滅で敗北`};
  const rule=groundScriptCurrent().win,holds=[];
  const visit=c=>{if(!c)return;if(Array.isArray(c)){c.forEach(r=>visit(r.when));return;}if(c.hold)holds.push(c.hold);(c.all||c.any||[]).forEach(visit);};visit(rule);
  return {text:groundScriptState.objective,p,label:[...holds.map(h=>`あと ${Math.max(0,Math.ceil(h.until-gameSec-1e-8))} 秒`),op.groundScript.loseText||''].filter(Boolean).join('　')};
}
function groundScriptDropMark(m){
  if(!m.visual)return;
  const {ring,el}=m.visual;ring.parent?.remove(ring);ring.geometry.dispose();ring.material.dispose();el.remove();m.visual=null;
}
function groundScriptClearMarks(){if(groundScriptState)groundScriptState.marks.forEach(groundScriptDropMark);}
function groundScriptDraw(){
  if(!groundScriptState||!groundVisuals)return;
  for(const m of groundScriptState.marks){
    if(!m.visual){
      const points=[],p=groundPoint(...m.at),radius=(m.radiusKm??groundRuleSet().capture.radiusKm)*GROUND_SCALE;
      for(let i=0;i<96;i++){const a=i/96*Math.PI*2,x=p.x+Math.cos(a)*radius,z=p.z+Math.sin(a)*radius;points.push(new THREE.Vector3(x,groundSurfaceHeight(x,z)+.3,z));}
      const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:m.warning?0xff554b:TEAM_COL[m.team??0],transparent:true,opacity:.9,depthWrite:false}));
      groundVisuals.add(ring);const el=document.createElement('div');el.className='ground-strike-label ground-script-mark';el.style.color=m.warning?'#ff554b':'#d5f8ff';labelsEl.appendChild(el);m.visual={ring,el};
    }
    const p=proj(groundPoint(...m.at)),el=m.visual.el;el.hidden=p.z>1;
    el.textContent=m.label+(m.warning?` あと ${Math.max(0,Math.ceil(m.expires-gameSec-1e-8))} 秒`:'');
    el.style.transform=`translate(${p.x}px,${p.y-18}px) translate(-50%,-100%)`;
  }
}
