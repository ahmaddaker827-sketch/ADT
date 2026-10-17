
(function(){
  window.__adtDailySalesData = { current_total:0, current:[], settlements:[] };
  window.__adtDailySalesBusy = false;
  window.dailySalesLocalKey=function(){return 'adt_dev_sales_cache_'+String(currentTeam?.id||localStorage.getItem('atd_sales_team_id')||'local');};
  window.saveDailySalesLocal=function(){localStorage.setItem(window.dailySalesLocalKey(),JSON.stringify(window.__adtDailySalesData));window.scheduleAutomaticTeamBackup?.();};
  window.loadDailySalesLocal=function(){
    try { const saved=JSON.parse(localStorage.getItem(window.dailySalesLocalKey())||'null');
      if(saved&&Array.isArray(saved.current)&&Array.isArray(saved.settlements))window.__adtDailySalesData=saved;
    }catch(_){}
    window.renderDailySales();
  };

  window.formatDailySaleDateTime = function(value){
    const d = new Date(value || Date.now());
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true});
  };

  window.renderDailySales = function(){
    const data = window.__adtDailySalesData || {current_total:0,current:[],settlements:[]};
    const current = Array.isArray(data.current) ? data.current : [];
    const settlements = Array.isArray(data.settlements) ? data.settlements : [];
    const total = Number(data.current_total || 0);
    const totalEl = document.getElementById('dailySalesCurrentTotal');
    const countEl = document.getElementById('dailySalesEntriesCount');
    const lastSettlementEl = document.getElementById('dailySalesLastSettlement');
    const currentList = document.getElementById('dailySalesCurrentList');
    const settlementList = document.getElementById('dailySalesSettlementsList');
    const badge = document.getElementById('hubDailySalesBadge');
    const settleBtn = document.getElementById('btnSettleDailySales');
    if (settleBtn) settleBtn.style.display = window.canSettleDailySales?.() ? '' : 'none';
    if (totalEl) totalEl.textContent = window.formatMoney ? window.formatMoney(total) : total.toFixed(2);
    if (countEl) countEl.textContent = current.length + (current.length === 1 ? ' عملية' : ' عمليات');
    if (lastSettlementEl) lastSettlementEl.textContent = settlements.length ? window.formatDailySaleDateTime(settlements[0].settled_at) : 'لا توجد بعد';
    if (badge) badge.textContent = window.canManageDailySales?.() ? (total > 0 ? (window.formatMoney ? window.formatMoney(total) : total.toFixed(2)) : 'فتح المبيعات') : 'تحتاج صلاحية';
    if (currentList) {
      currentList.innerHTML = current.length ? current.map(row => {
        const note = String(row.note || '').trim();
        return `<div class="daily-sale-item"><div class="daily-sale-main"><div class="daily-sale-note-text">${window.escapeHtml ? window.escapeHtml(note || 'مبيعات مسجلة') : (note || 'مبيعات مسجلة')}</div><div class="daily-sale-time">${window.formatDailySaleDateTime(row.sale_at || row.created_at)}</div></div><div class="daily-sale-amount">${window.formatMoney ? window.formatMoney(row.amount) : Number(row.amount||0).toFixed(2)}</div></div>`;
      }).join('') : '<div class="daily-sales-empty">لا توجد مبيعات مسجلة حالياً</div>';
    }
    if (settlementList) {
      settlementList.innerHTML = settlements.length ? settlements.map(row => {
        const count = Number(row.entries_count || 0);
        const deleteBtn=window.canSettleDailySales?.()?`<button type="button" class="daily-sales-delete-settlement" onclick="window.deleteDailySalesSettlement('${String(row.id||'')}')">حذف التصفية</button>`:'';
        return `<div class="daily-settlement-item"><div class="daily-sale-main"><div class="daily-sale-note-text">تصفية ${count} عملية</div><div class="daily-sale-time">${window.formatDailySaleDateTime(row.settled_at)}</div></div><div class="daily-sale-amount">${window.formatMoney ? window.formatMoney(row.total_amount) : Number(row.total_amount||0).toFixed(2)}</div>${deleteBtn}</div>`;
      }).join('') : '<div class="daily-sales-empty">لا توجد تصفيات سابقة</div>';
    }
  };

  window.fetchDailySales = async function(showToast){
    if (!window.canManageDailySales?.()) return false;
    const teamIdAtStart=String(currentTeam?.id||'');
    if(window.isDeveloperOffline() || window.hasPendingDeveloperMutations('sales')) {
      window.loadDailySalesLocal(); return true;
    }
    if (!dbClient) window.initSupabaseClient?.();
    if (!dbClient || !currentTeam?.id) {
      window.interfaceAlert?.('dailySales','لا يوجد اتصال بالخادم','تعذر تحميل المبيعات اليومية. تحقق من الإنترنت وحاول مرة أخرى.');
      return false;
    }
    try {
      const {data,error} = await dbClient.rpc('adt_daily_sales_fetch',{
        p_team_id:String(currentTeam.id),
        p_user_id:getDeviceId()
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if(!result||typeof result!=='object'||!Array.isArray(result.current)||!Array.isArray(result.settlements))throw new Error('INVALID_DAILY_SALES_PAYLOAD');
      if(!currentTeam||String(currentTeam.id)!==teamIdAtStart)return false;
      window.__adtDailySalesData = result;
      window.renderDailySales();
      window.saveDailySalesLocal();
      if (showToast) window.showToast?.('تم تحديث المبيعات اليومية');
      return true;
    } catch(e) {
      console.error('[Daily Sales] fetch failed:',e);
      const msg=String(e?.message||'');
      if (msg.includes('NOT_ALLOWED')) window.interfaceAlert?.('dailySales','غير مسموح','صلاحية المبيعات اليومية غير مفعلة لهذا الحساب.');
      else if (msg.toLowerCase().includes('adt_daily_sales_fetch')) window.interfaceAlert?.('dailySales','يلزم تحديث قاعدة البيانات','شغّل ملف SQL الخاص بميزة المبيعات اليومية مرة واحدة في Supabase.');
      else window.interfaceAlert?.('dailySales','تعذر تحميل المبيعات','حدث خطأ أثناء تحميل سجل المبيعات اليومية.');
      return false;
    }
  };

  window.addDailySale = async function(){
    if (window.__adtDailySalesBusy) return;
    if (!window.canManageDailySales?.()) { window.customAlert?.('غير مسموح','صلاحية المبيعات اليومية غير مفعلة لهذا الحساب.'); return; }
    const amountInput=document.getElementById('dailySalesAmountInput');
    const noteInput=document.getElementById('dailySalesNoteInput');
    const amount=Number(amountInput?.value||0);
    const note=String(noteInput?.value||'').trim();
    if (!Number.isFinite(amount) || amount<=0) { window.customAlert?.('قيمة غير صحيحة','اكتب قيمة المبيعات أكبر من صفر.'); return; }
    if (!dbClient) window.initSupabaseClient?.();
    if ((!dbClient || !currentTeam?.id) && !window.isDeveloperOffline()) { window.customAlert?.('لا يوجد اتصال بالخادم','إضافة المبيعات تحتاج اتصالاً بالخادم حتى لا تضيع البيانات.'); return; }
    window.__adtDailySalesBusy=true;
    const btn=document.getElementById('btnAddDailySale');
    if(btn){btn.disabled=true;btn.textContent='جارٍ الحفظ…';}
    try{
      const {data,error}=await window.developerOfflineRpc('adt_daily_sales_add',{
        p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_amount:amount,p_note:note||null
      });
      if(error) throw error;
      if(amountInput) amountInput.value='';
      if(noteInput) noteInput.value='';
      if(window.isDeveloperOffline()) {
        const state=window.__adtDailySalesData;
        state.current.unshift({id:'offline_'+window.makeSafeId(),amount,note,created_at:new Date().toISOString()});
        state.current_total=Number(state.current_total||0)+amount;
        window.saveDailySalesLocal();window.renderDailySales();
        window.showToast?.('تم حفظ المبيعات محلياً؛ ستُزامن بعد الاتصال');
      } else {await window.fetchDailySales(false);window.showToast?.('تم تسجيل المبيعات بنجاح');}
    }catch(e){
      console.error('[Daily Sales] add failed:',e);
      const msg=String(e?.message||'');
      if(msg.includes('NOT_ALLOWED')) window.customAlert?.('غير مسموح','صلاحية المبيعات اليومية غير مفعلة لهذا الحساب.');
      else window.customAlert?.('تعذر تسجيل المبيعات','لم يتم حفظ العملية. تحقق من الاتصال أو من تشغيل ملف SQL.');
    }finally{
      window.__adtDailySalesBusy=false;
      if(btn){btn.disabled=false;btn.textContent='إضافة';}
    }
  };

  window.settleDailySales = async function(){
    if (window.__adtDailySalesBusy) return;
    if (!window.canSettleDailySales?.()) { window.customAlert?.('غير مسموح','تصفية المبيعات متاحة للمدير الرئيسي فقط.'); return; }
    const total=Number(window.__adtDailySalesData?.current_total||0);
    if(total<=0){window.customAlert?.('لا توجد مبيعات','لا يوجد إجمالي حالي لتصفيته.');return;}
    const ok=await window.showAppConfirm?.({
      title:'تصفية المبيعات',
      message:`سيتم إغلاق إجمالي ${window.formatMoney ? window.formatMoney(total) : total.toFixed(2)} وبدء إجمالي جديد من الصفر. ستبقى التصفية محفوظة في السجل.`,
      confirmText:'تأكيد التصفية',cancelText:'إلغاء'
    });
    if(!ok)return;
    if(!dbClient) window.initSupabaseClient?.();
    if((!dbClient || !currentTeam?.id)&&!window.isDeveloperOffline()){window.customAlert?.('لا يوجد اتصال بالخادم','التصفية تحتاج اتصالاً بالخادم.');return;}
    window.__adtDailySalesBusy=true;
    const btn=document.getElementById('btnSettleDailySales');
    if(btn){btn.disabled=true;btn.textContent='جارٍ التصفية…';}
    try{
      const localSettlementId='offline_'+window.makeSafeId();
      const {data,error}=await window.developerOfflineRpc('adt_daily_sales_settle',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId()},{id:localSettlementId});
      if(error)throw error;
      if(window.isDeveloperOffline()) {
        const state=window.__adtDailySalesData;
        state.settlements.unshift({id:localSettlementId,total_amount:total,entries_count:state.current.length,settled_at:new Date().toISOString()});
        state.current=[];state.current_total=0;
        window.saveDailySalesLocal();window.renderDailySales();
        window.showToast?.('تمت التصفية محلياً؛ ستُزامن بعد الاتصال');
      } else {await window.fetchDailySales(false);window.showToast?.('تمت تصفية المبيعات وبدأ إجمالي جديد');}
    }catch(e){
      console.error('[Daily Sales] settle failed:',e);
      const msg=String(e?.message||'');
      if(msg.includes('NO_OPEN_SALES')) window.customAlert?.('لا توجد مبيعات','لا توجد عمليات حالية تحتاج تصفية.');
      else window.customAlert?.('تعذر التصفية','لم تتم التصفية. تحقق من الاتصال وحاول مرة أخرى.');
    }finally{
      window.__adtDailySalesBusy=false;
      if(btn){btn.disabled=false;btn.textContent='تصفية الدورة الحالية';}
    }
  };

  window.deleteDailySalesSettlement = async function(settlementId){
    if(window.__adtDailySalesBusy)return;
    if(!window.canSettleDailySales?.()){window.customAlert?.('غير مسموح','حذف تصفية المبيعات متاح للمدير الرئيسي فقط.');return;}
    const id=String(settlementId||'').trim(); if(!id)return;
    const ok=await window.showAppConfirm?.({title:'حذف تصفية المبيعات',message:'سيتم حذف هذه التصفية وعمليات المبيعات التابعة لها نهائياً.',confirmText:'حذف التصفية',cancelText:'إلغاء'});
    if(!ok)return;
    if(!dbClient)window.initSupabaseClient?.();
    if((!dbClient||!currentTeam?.id)&&!window.isDeveloperOffline()){window.customAlert?.('لا يوجد اتصال بالخادم','الحذف يحتاج اتصالاً بالخادم.');return;}
    window.__adtDailySalesBusy=true;
    try{
      const {error}=await window.developerOfflineRpc('adt_daily_sales_delete_settlement',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_settlement_id:id});
      if(error)throw error;
      if(window.isDeveloperOffline()) {
        window.__adtDailySalesData.settlements=window.__adtDailySalesData.settlements.filter(row=>String(row.id)!==id);
        window.saveDailySalesLocal();window.renderDailySales();
        window.showToast?.('تم حذف التصفية محلياً؛ ستُزامن بعد الاتصال');
      } else {await window.fetchDailySales(false);window.showToast?.('تم حذف تصفية المبيعات');}
    }catch(e){
      console.error('[Daily Sales] delete settlement failed:',e);
      const msg=String(e?.message||'');
      if(msg.includes('NOT_ALLOWED'))window.customAlert?.('غير مسموح','حذف التصفية متاح للمدير الرئيسي فقط.');
      else if(msg.toLowerCase().includes('adt_daily_sales_delete_settlement'))window.customAlert?.('يلزم تحديث قاعدة البيانات','شغّل ملف V186_DAILY_SALES_DELETE_SETTLEMENT.sql في Supabase مرة واحدة.');
      else window.customAlert?.('تعذر الحذف','لم يتم حذف التصفية. تحقق من الاتصال وحاول مرة أخرى.');
    }finally{window.__adtDailySalesBusy=false;}
  };

  const oldApplyCurrency=window.applyAppCurrency;
  window.applyAppCurrency=function(){
    const result=oldApplyCurrency?.apply(this,arguments);
    try{window.renderDailySales();}catch(_){ }
    return result;
  };
})();
