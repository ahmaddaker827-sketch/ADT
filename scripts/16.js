
(function(){
  window.openDebtTypePicker=function(){
    if(!window.canEditDebts?.()){window.customAlert('صلاحية مقفلة','ليس لديك صلاحية عرض الديون والمستحقات.');return;}
    window.openModalFront('debtTypePickerModal',40000);
  };
  const originalRecycle=window.openRecycleBinModal;
  window.openRecycleBinModal=async function(){
    const modal=document.getElementById('recycleBinModal');if(modal)window.openModalFront('recycleBinModal',52000);
    return originalRecycle.apply(this,arguments);
  };
})();
