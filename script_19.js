
(function(){
  const supplierKey=value=>window.normalizeArabic(String(value||'').replace(/\u0640/g,'').replace(/\s+/g,' ').trim()).toLowerCase();
  const findByName=(list,name)=>{
    const wanted=supplierKey(name);
    return (Array.isArray(list)?list:[]).find(item=>!item?.is_deleted&&supplierKey(item?.name)===wanted)||null;
  };

  /* لا تنشئ حساب مورد ديون ثانياً؛ افتح الحساب الموجود بدلاً منه. */
  const oldSaveDebt=window.saveNewAccountRecord;
  if(typeof oldSaveDebt==='function')window.saveNewAccountRecord=async function(){
    const name=String(document.getElementById('newAccountNameInput')?.value||'').trim();
    if(activeDebtSubTab==='supplier'&&name){
      const existing=findByName(debts?.suppliers,name);
      if(existing){
        window.closeModal('newAccountModal');
        window.customAlert('المورد موجود بالفعل','تم فتح حساب المورد الموجود بدلاً من إنشاء حساب مكرر.');
        window.openAccountLedgerDetail(existing.id);
        return;
      }
    }
    return oldSaveDebt.apply(this,arguments);
  };

  /* لا تضف اسم المورد نفسه مرتين إلى سجل الدفعات المحلي. */
  const oldSaveMoney=window.saveMoneyParty;
  if(typeof oldSaveMoney==='function')window.saveMoneyParty=async function(){
    const name=String(document.getElementById('moneyPartyNameInput')?.value||'').trim();
    if(activeMoneyType==='supplier'&&name){
      const existing=findByName((moneyParties||[]).filter(x=>x?.party_type==='supplier'),name);
      if(existing){
        window.closeModal('moneyPartyModal');
        window.customAlert('المورد موجود بالفعل','تم فتح سجل المورد الموجود بدلاً من إضافة اسم مكرر.');
        window.openMoneyParty(existing.id);
        return;
      }
    }
    return oldSaveMoney.apply(this,arguments);
  };
})();
