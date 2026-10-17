
(function(){
  window.renderMoneyParties=function(){
    const box=document.getElementById('moneyPartiesList');if(!box)return;
    const customer=activeMoneyType==='customer',query=window.normalizeArabic(document.getElementById('moneyPartySearchInput')?.value||''),parties=moneyParties.filter(x=>x.party_type===activeMoneyType).filter(x=>!query||window.normalizeArabic((x.name||'')+' '+(x.phone||'')).includes(query)),logs=moneyLogs.filter(x=>x.party_type===activeMoneyType),recent=logs.filter(window.__adtV199IsRecent),total=recent.reduce((s,x)=>s+Number(x.amount||0),0);
    document.getElementById('moneyRecordsTitle').textContent=customer?'الأموال المستلمة خلال آخر 3 أيام':'دفعات الموردين خلال آخر 3 أيام';
    document.getElementById('moneyRecordsTotal').textContent=window.formatMoney(total);
    document.getElementById('moneyRecordsCount').textContent=`${recent.length} عملية حديثة • السجل الكامل محفوظ`;
    if(!parties.length){box.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:35px 10px;font-weight:700">لا توجد نتائج</div>';return;}
    box.innerHTML=parties.map(p=>{const rows=logs.filter(x=>String(x.party_id)===String(p.id)),recentRows=rows.filter(window.__adtV199IsRecent),sum=recentRows.reduce((s,x)=>s+Number(x.amount||0),0);return `<div class="debt-account-card" onclick="window.openMoneyParty('${p.id}')"><div class="debt-card-header-row"><div class="debt-account-identity"><div class="debt-user-badge ${customer?'cust':'supp'}">${customer?'ع':'م'}</div><div class="debt-account-details"><b class="debt-account-name">${window.escapeHtml(p.name)}</b><div class="debt-account-phone">${window.escapeHtml(p.phone||'بدون هاتف')} • ${rows.length} عملية محفوظة</div></div></div><div class="debt-balance-badge ${customer?'receivable':'payable'}"><div class="debt-balance-value">${window.formatMoney(sum)}</div><span class="debt-balance-label">آخر 3 أيام</span></div></div></div>`;}).join('');
  };
  window.deleteMoneyParty=async function(id){
    const party=moneyParties.find(x=>String(x.id)===String(id));if(!party)return;
    const customer=party.party_type==='customer',count=moneyLogs.filter(x=>String(x.party_id)===String(id)).length;
    const ok=await window.showAppConfirm({title:`حذف ${customer?'العميل':'المورد'}`,message:`سيتم حذف ${party.name}${count?` وجميع عملياته المسجلة وعددها ${count}`:''} نهائياً. لا يمكن التراجع.`,confirmText:'حذف نهائياً',cancelText:'إلغاء',danger:true});
    if(!ok)return;if(!dbClient||!currentTeam){window.customAlert('الاتصال مطلوب','يلزم الاتصال بالإنترنت لتنفيذ الحذف على جميع الأجهزة.');return;}
    try{const {data,error}=await dbClient.rpc('adt_money_party_delete',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_party_id:String(id)});if(error||data!==true)throw error||new Error('DELETE_FAILED');moneyParties=moneyParties.filter(x=>String(x.id)!==String(id));moneyLogs=moneyLogs.filter(x=>String(x.party_id)!==String(id));if(activeMoneyParty&&String(activeMoneyParty.id)===String(id)){activeMoneyParty=null;window.switchTab('moneyRecords',false);}window.saveMoneyRecordsCache();window.renderMoneyParties();window.showToast(`تم حذف ${customer?'العميل':'المورد'} وسجله`);}catch(e){window.customAlert('تعذر الحذف','شغّل ملف V201_DELETE_MONEY_PARTIES.sql مرة واحدة في Supabase ثم حاول مجدداً.');}
  };
})();
