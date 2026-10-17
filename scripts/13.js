
(function(){
  const keyOf=value=>window.normalizeArabic(String(value||'').trim()).toLowerCase();
  window.getUnifiedSupplierDirectory=function(){
    const map=new Map();
    const add=(name,phone='',source='directory',id=null)=>{name=String(name||'').trim();const key=keyOf(name);if(!key)return;const old=map.get(key);map.set(key,{...(old||{}),id:old?.id||id||null,name:old?.name||name,phone:old?.phone||String(phone||''),source:old?.source==='directory'?'directory':source});};
    (Array.isArray(suppliers)?suppliers:[]).forEach(x=>add(x?.name,x?.phone,'directory',x?.id));
    (Array.isArray(shortages)?shortages:[]).forEach(x=>add(x?.supplierName||x?.supplier_name,'','shortages'));
    (Array.isArray(products)?products:[]).forEach(x=>add(x?.supplier||x?.supplier_name,'','products'));
    Object.values(productSuppliersMap||{}).forEach(name=>add(name,'','products'));
    (debts?.suppliers||[]).filter(x=>!x?.is_deleted).forEach(x=>add(x?.name,x?.phone,'debts'));
    (Array.isArray(moneyParties)?moneyParties:[]).filter(x=>x?.party_type==='supplier').forEach(x=>add(x?.name,x?.phone,'payments'));
    return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar'));
  };

  window.syncUnifiedSuppliersEverywhere=async function(){
    if(!dbClient||!currentTeam?.id||isGhostMode||!window.canCreateSuppliers?.())return false;
    const team=String(currentTeam.id),all=window.getUnifiedSupplierDirectory();
    const directoryKeys=new Set((suppliers||[]).map(x=>keyOf(x.name)));
    const debtKeys=new Set((debts?.suppliers||[]).filter(x=>!x?.is_deleted).map(x=>keyOf(x.name)));
    const moneyKeys=new Set((moneyParties||[]).filter(x=>x?.party_type==='supplier').map(x=>keyOf(x.name)));
    let changed=false;
    for(const item of all){
      const key=keyOf(item.name);if(!key)continue;
      if(!directoryKeys.has(key)){
        const r=await dbClient.rpc('adt_supplier_directory_add',{p_team_id:team,p_user_id:getDeviceId(),p_name:item.name,p_phone:item.phone||''});
        if(!r.error&&r.data){suppliers.push(r.data);directoryKeys.add(key);changed=true;}
      }
      if(!debtKeys.has(key)){
        const r=await window.developerOfflineRpc('adt_debt_create',{p_team_id:team,p_user_id:getDeviceId(),p_dev_pin:null,p_type:'supplier',p_name:item.name,p_phone:item.phone||''});
        if(!r.error&&r.data){debts.suppliers.unshift({...r.data,transactions:r.data.transactions||[],type:'supplier',is_deleted:false});debtKeys.add(key);changed=true;}
      }
      if(!moneyKeys.has(key)){
        const r=await dbClient.rpc('adt_money_party_add',{p_team_id:team,p_user_id:getDeviceId(),p_party_type:'supplier',p_name:item.name,p_phone:item.phone||''});
        if(!r.error&&r.data){moneyParties.unshift(r.data);moneyKeys.add(key);changed=true;}
      }
    }
    if(changed){window.saveTeamCache('atd_sales_suppliers_v17',suppliers);window.saveTeamCache('atd_sales_debts_v17',debts);window.saveMoneyRecordsCache?.();window.renderShortageSuppliersBar?.();window.renderMoneyParties?.();}
    return changed;
  };

  const oldSync=window.syncSupplierDirectory;
  window.syncSupplierDirectory=async function(){const result=await oldSync.apply(this,arguments);try{await window.syncUnifiedSuppliersEverywhere();}catch(e){console.warn('[Unified Suppliers] deferred',e);}return result;};

  window.renderShortageSuppliersBar=function(){
    const bar=document.getElementById('shortageSuppliersBar');if(!bar)return;
    const label=activeShortageSupplierFilter==='all'?'جميع الموردين':activeShortageSupplierFilter;
    bar.innerHTML=`<div id="shortageSupplierSelectedBtn" onclick="window.openShortageSupplierPicker()"><span>${window.escapeHtml(label)}</span><svg class="svg-icon" style="width:14px;height:14px" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>${window.canCreateSuppliers()?'<button class="btn-filter-pill adt-add-supplier" onclick="window.openNewSupplierModal()">إضافة مورد</button>':''}`;
  };
  window.openShortageSupplierPicker=function(){
    const list=document.getElementById('shortageSupplierPickerList');if(!list)return;
    const rows=[{name:'all',label:'جميع الموردين'},...window.getUnifiedSupplierDirectory().map(s=>({name:s.name,label:s.name}))];
    list.innerHTML=rows.map(x=>`<button class="btn-secondary" style="margin:0;padding:9px 10px;text-align:right;font-size:11px" onclick="window.chooseShortageSupplier('${encodeURIComponent(x.name)}')">${window.escapeHtml(x.label)}</button>`).join('');window.openModalFront('shortageSupplierPickerModal',5100);
  };

  window.shareMoneyPartyStatementPdf=async function(){
    if(!activeMoneyParty)return;const rows=moneyLogs.filter(x=>String(x.party_id)===String(activeMoneyParty.id));
    if(!rows.length){window.customAlert('لا توجد عمليات','لا يوجد كشف لتصديره.');return;}
    const customer=activeMoneyType==='customer',btn=document.getElementById('btnShareMoneyStatement'),old=btn?.textContent||'مشاركة كشف الحساب PDF';if(btn){btn.disabled=true;btn.textContent='جاري تجهيز الكشف...';}
    const root=document.createElement('div');root.dir='rtl';root.style.cssText='position:fixed;left:-10000px;top:0;background:#fff;color:#111;padding:28px;font-family:Cairo,Arial,sans-serif;width:760px';const total=rows.reduce((s,r)=>s+Number(r.amount||0),0);
    root.innerHTML=`<h2 style="text-align:center;margin:0 0 16px">${customer?'كشف استلام أموال':'كشف دفعات مورد'}</h2><h3>${window.escapeHtml(activeMoneyParty.name)}</h3><p>عدد العمليات: ${rows.length} — الإجمالي: ${window.formatMoney(total)}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="border:1px solid #bbb;padding:8px">#</th><th style="border:1px solid #bbb;padding:8px">التاريخ والوقت</th><th style="border:1px solid #bbb;padding:8px">المبلغ</th><th style="border:1px solid #bbb;padding:8px">التفاصيل</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td style="border:1px solid #bbb;padding:8px">${i+1}</td><td style="border:1px solid #bbb;padding:8px">${new Date(r.recorded_at).toLocaleString('ar-LY-u-nu-latn')}</td><td style="border:1px solid #bbb;padding:8px">${window.formatMoney(Number(r.amount||0))}</td><td style="border:1px solid #bbb;padding:8px">${window.escapeHtml(r.note||r.reference||'—')}</td></tr>`).join('')}</tbody></table>`;
    document.body.appendChild(root);
    try{const canvas=await html2canvas(root,{scale:2,backgroundColor:'#ffffff',useCORS:true});const safe=String(activeMoneyParty.name||'كشف').replace(/[\\/:*?"<>|]/g,'_');await sharePdfBlob(createPurePdfBlobFromCanvas(canvas),`ADT_${customer?'استلامات_عميل':'دفعات_مورد'}_${safe}.pdf`);}catch(e){if(e?.name!=='AbortError'){console.error('[Money Statement PDF] failed',e);window.customAlert('تعذر مشاركة الكشف','تعذر إنشاء ملف PDF. حاول مرة أخرى.');}}finally{root.remove();if(btn){btn.disabled=false;btn.textContent=old;}}
  };

  const oldRenderMoney=window.renderMoneyParties;
  window.renderMoneyParties=function(){const add=document.getElementById('addMoneyPartyBtn');if(add)add.textContent=activeMoneyType==='customer'?'إضافة عميل':'إضافة مورد';return oldRenderMoney.apply(this,arguments);};
  document.querySelectorAll('.fab-btn,.fab-btn-search-above,.adt-v200-floating-add').forEach(el=>el.remove());
  setTimeout(()=>window.syncUnifiedSuppliersEverywhere().catch(()=>{}),1800);
})();
