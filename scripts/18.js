
(function(){
  const supplierKey=value=>window.normalizeArabic(String(value||'').replace(/\u0640/g,'').replace(/\s+/g,' ').trim()).toLowerCase();
  const uniqueByName=list=>{
    const map=new Map();
    (Array.isArray(list)?list:[]).forEach(item=>{
      const key=supplierKey(item?.name);if(!key)return;
      const old=map.get(key);
      if(!old){map.set(key,item);return;}
      /* احتفظ بالسجل الأوضح من دون حذف أي سجل من الخادم. */
      if(!old.phone&&item.phone)old.phone=item.phone;
      if(!old.id&&item.id)old.id=item.id;
    });
    return [...map.values()];
  };
  window.adtDeduplicateSupplierCaches=function(){
    if(Array.isArray(suppliers)){
      const clean=uniqueByName(suppliers);
      if(clean.length!==suppliers.length){suppliers=clean;window.saveTeamCache?.('atd_sales_suppliers_v17',suppliers);}
    }
    return suppliers;
  };
  const oldDirectory=window.getUnifiedSupplierDirectory;
  if(typeof oldDirectory==='function')window.getUnifiedSupplierDirectory=function(){window.adtDeduplicateSupplierCaches();return uniqueByName(oldDirectory.apply(this,arguments));};
  const oldSync=window.syncSupplierDirectory;
  if(typeof oldSync==='function')window.syncSupplierDirectory=async function(){const result=await oldSync.apply(this,arguments);window.adtDeduplicateSupplierCaches();return result;};
  const oldManage=window.renderManageSuppliers;
  if(typeof oldManage==='function')window.renderManageSuppliers=function(){window.adtDeduplicateSupplierCaches();return oldManage.apply(this,arguments);};

  /* منع تكرار نفس الاسم بصرياً في دفعات الموردين حتى قبل تشغيل ملف SQL V243. */
  const oldMoney=window.renderMoneyParties;
  if(typeof oldMoney==='function')window.renderMoneyParties=function(){
    if(activeMoneyType==='supplier'&&Array.isArray(moneyParties)){
      const customers=moneyParties.filter(x=>x?.party_type!=='supplier');
      const supplierRows=uniqueByName(moneyParties.filter(x=>x?.party_type==='supplier'));
      moneyParties=[...customers,...supplierRows];
    }
    return oldMoney.apply(this,arguments);
  };
  window.adtDeduplicateSupplierCaches();
  window.renderMoneyParties?.();
})();
