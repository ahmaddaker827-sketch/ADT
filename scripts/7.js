
(function(){
  const card=document.getElementById('hubFridayCollectionsCard');
  if(card){card.onclick=()=>window.openMoneyRecordsTypePicker();const title=card.querySelector('.hub-card-title'),sub=card.querySelector('.hub-card-sub'),badge=card.querySelector('.hub-card-badge'),icon=card.querySelector('.hub-icon-box');if(title)title.textContent='الدفعات والاستلامات';if(sub)sub.textContent='تسجيل استلامات العملاء ودفعات الموردين';if(badge)badge.textContent='فتح السجلات';if(icon)icon.innerHTML='<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7V7zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11v2z"/></svg>';}
  window.openMoneyRecordsTypePicker=function(){if(!window.canManageMoneyRecords()){window.customAlert('غير مسموح','لا تملك صلاحية الدفعات والاستلامات.');return;}window.openModalFront('moneyRecordsTypePickerModal',19000);};
  window.chooseMoneyRecordsType=function(type){window.closeModal('moneyRecordsTypePickerModal');window.openMoneyRecords(type);};
})();
