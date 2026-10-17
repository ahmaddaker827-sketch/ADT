
(function(){
  const list=document.getElementById('homeOrderList');
  const enhanceOrderRows=()=>{if(!list)return;const rows=[...list.querySelectorAll('.adt-home-order-item')];rows.forEach((row,index)=>{row.dataset.orderNumber=String(index+1).padStart(2,'0');const buttons=row.querySelectorAll('button');if(buttons[0])buttons[0].title='تحريك لأعلى';if(buttons[1])buttons[1].title='تحريك لأسفل';});};
  if(list){new MutationObserver(enhanceOrderRows).observe(list,{childList:true,subtree:true});enhanceOrderRows();}
  const oldOpenOrder=window.openHomeOrderModal;window.openHomeOrderModal=function(){const result=oldOpenOrder.apply(this,arguments);enhanceOrderRows();return result;};
  const oldOpenAdmin=window.openSuperAdminModal;
  if(typeof oldOpenAdmin==='function')window.openSuperAdminModal=function(){const result=oldOpenAdmin.apply(this,arguments);setTimeout(()=>document.querySelector('#superAdminModal .modal-box')?.scrollTo({top:0,behavior:'smooth'}),50);return result;};
  window.chooseInvoiceAction=function(action){window.closeModal('invoiceTypePickerModal');if(action==='saved')window.openSavedInvoices();else window.openInvoiceModal();};
})();
