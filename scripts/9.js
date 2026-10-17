
(function(){
  const grid=document.querySelector('#pageHome .hub-grid');
  if(!grid)return;
  const cards=Array.from(grid.children).filter(el=>el.classList.contains('hub-card'));
  cards.forEach((card,index)=>{card.dataset.homeOrderKey=card.id||'home-card-'+index;});
  const defaultKeys=cards.map(card=>card.dataset.homeOrderKey);
  let draft=[];
  function key(){return 'adt_home_order_v208_'+String(currentTeam?.id||'')+'_'+String(getDeviceId());}
  function saved(){try{const value=JSON.parse(localStorage.getItem(key())||'[]');return Array.isArray(value)?value.filter(id=>defaultKeys.includes(id)):[];}catch(_){return [];}}
  function apply(order){const byId=new Map(cards.map(card=>[card.dataset.homeOrderKey,card]));const sorted=[...new Set([...order,...defaultKeys])];sorted.forEach(id=>{if(byId.has(id))grid.appendChild(byId.get(id));});}
  function visibleKeys(){return Array.from(grid.children).filter(card=>card.classList.contains('hub-card')&&getComputedStyle(card).display!=='none').map(card=>card.dataset.homeOrderKey);}
  function render(){const list=document.getElementById('homeOrderList');list.replaceChildren();draft.forEach((id,i)=>{const card=cards.find(c=>c.dataset.homeOrderKey===id);if(!card)return;const row=document.createElement('div');row.className='adt-home-order-item';const title=document.createElement('span');title.textContent=card.querySelector('.hub-card-title')?.textContent?.trim()||'زر';row.appendChild(title);for(const [direction,symbol,label,disabled] of [[-1,'↑','رفع',i===0],[1,'↓','تنزيل',i===draft.length-1]]){const button=document.createElement('button');button.type='button';button.textContent=symbol;button.setAttribute('aria-label',label+' '+title.textContent);button.disabled=disabled;button.onclick=()=>{const next=i+direction;[draft[i],draft[next]]=[draft[next],draft[i]];render();};row.appendChild(button);}list.appendChild(row);});}
  window.openHomeOrderModal=function(){apply(saved());draft=visibleKeys();render();window.openModalFront('homeOrderModal',19200);};
  window.saveHomeOrder=function(){const all=Array.from(grid.children).filter(el=>el.classList.contains('hub-card')).map(el=>el.dataset.homeOrderKey);let i=0;const order=all.map(id=>draft.includes(id)?draft[i++]:id);try{localStorage.setItem(key(),JSON.stringify(order));}catch(_){window.customAlert('تعذر الحفظ','تعذر حفظ الترتيب على هذا الجهاز.');return;}apply(order);window.closeModal('homeOrderModal');window.showToast('تم حفظ ترتيب الأزرار');};
  window.resetHomeOrder=function(){try{localStorage.removeItem(key());}catch(_){}apply(defaultKeys);draft=visibleKeys();render();window.showToast('عاد ترتيب الأزرار الأصلي');};
  const previousPermissions=window.applyPermissionVisibility;
  window.applyPermissionVisibility=function(){const result=previousPermissions.apply(this,arguments);apply(saved());return result;};
  const previousSwitchTab=window.switchTab;
  window.switchTab=function(tab){const result=previousSwitchTab.apply(this,arguments);if(tab==='home')apply(saved());return result;};
  if(currentTeam?.id)apply(saved());
})();
