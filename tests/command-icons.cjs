/* 確定SVGをそのまま使用し、命令・アクセシビリティ・展開状態を保つ。 */
function commandIconCases(){

   reset({op:'baikonur',fleets:OPS.find(o=>o.id==='baikonur').quick});setSpeed(0);if(talking)endTalk();endDeploy();
   const buttons=[...document.querySelectorAll('[data-command-icon]')];
   const identical=buttons.every(b=>{const doc=new DOMParser().parseFromString(WOS_COMMAND_ICONS[b.dataset.commandIcon].svg,'text/html');return b.firstElementChild.isEqualNode(doc.body.firstElementChild);});
   const b=document.getElementById('groundBoard');
   const title=b.title;
   const troop=fleets.find(f=>f.team===0&&f.groundKind==='infantry');select(troop);
   b.click();const board=groundWorkAiming==='board';b.click();
   document.getElementById('groundMove').click();const move=groundWorkAiming==='move';
   groundWorkAiming=null;const dest=troop.pos.clone().add(new THREE.Vector3(1,0,0));groupOrder({type:'move',dest});
   document.getElementById('groundHold').click();const hold=!troop.order&&troop.queue.length===0;
   const modes=[()=>{groundWorkAiming='board';},()=>{groundWorkAiming='bridge';},()=>{groundWorkAiming='move';},()=>{groundStrikeAiming=true;},()=>{groundSupplyAiming=true;}];
   const cleared=modes.every(arm=>{arm();select(troop);return !groundWorkAiming&&!groundStrikeAiming&&!groundSupplyAiming;});
   const carrier=fleets.find(f=>f.team===0&&f.groundKind==='apc');
   select(troop);tap(0,0,false,false,carrier);
   const friendSelect=selected===carrier&&!troop.order;
   select(troop);document.getElementById('groundBoard').click();
   dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true}));
   const cancelled=!groundWorkAiming&&!groundStrikeAiming&&!groundSupplyAiming&&!paused;
   const base=op.quick[0];
   const extras=['artillery','engineer','supply','apc'].map((kind,i)=>makeFleet(0,{...base,name:'確認用'+kind,groundKind:kind,pos:[-60+i*3,0,30]}));
   fleets.push(...extras);extras.forEach(f=>f.band='ground');setSel([troop,...extras]);
   const expand=document.getElementById('groundCommandExpand');expand.click();
   const expanded=expand.getAttribute('aria-expanded')==='true'&&getComputedStyle(expand.firstElementChild).transform==='matrix(-1, 0, 0, -1, 0, 0)';
   expand.click();const collapsed=expand.getAttribute('aria-expanded')==='false'&&getComputedStyle(expand.firstElementChild).transform==='none';
   select(extras[0]);camAnim=null;controls.target.copy(extras[0].pos);camera.position.copy(extras[0].pos).add(new THREE.Vector3(0,65,80));camera.lookAt(controls.target);controls.update();groundDraw();renderer.render(scene,camera);
   const svg=document.querySelector('#groundStrike svg'),r=svg.getBoundingClientRect();
   const shared=['deploy','plan','execute'].every(id=>document.querySelector(`[data-command-icon="${id}"]`).disabled);
   const left=!!document.querySelector('#groundView button')&&!document.getElementById('groundAlt').hidden;
   return {cleared,friendSelect,cancelled,buttonSize:[document.getElementById('groundMove').getBoundingClientRect().width,document.getElementById('groundMove').getBoundingClientRect().height],identical,board,move,hold,expanded,collapsed,shared,left,ratio:r.width/r.height,size:[r.width,r.height],title,bar:!document.getElementById('groundCommandBar').hidden};

}
async function checkCommandIcons(page,check){
 const r=await page.evaluate(commandIconCases);
 for(const k of ['cleared','friendSelect','cancelled','identical','board','move','hold','expanded','collapsed','shared','left','bar'])check(r[k],'命令アイコン: '+k);
 check(r.ratio===1.6&&r.size.join(',')==='36,22.5','命令アイコン: 実寸36×22.5・縦横比維持');
 check(r.title==='輸送車に乗車・岸の揚陸艦に乗艦','命令アイコン: 既存titleを保持');
}
module.exports={commandIconCases,checkCommandIcons};
