
(function(){
  window.__adtDebtListFilter='all';
  window.setDebtListFilter=function(filter){
    window.__adtDebtListFilter=['all','open','settled'].includes(filter)?filter:'all';
    document.querySelectorAll('.adt-debt-filter').forEach(btn=>btn.classList.toggle('active',btn.dataset.filter===window.__adtDebtListFilter));
    window.renderDebts();
  };
  const iconCustomer='<svg class="svg-icon" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  const iconSupplier='<svg class="svg-icon" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M3 6h18v12H3V6zm2 2v8h14V8H5zm2 2h6v2H7v-2zm9 0h2v4h-2v-4z"/></svg>';
  window.renderDebts=function(){
    const container=document.getElementById('debtsListContainer');if(!container)return;
    if(!window.canEditDebts()){container.innerHTML='';return;}
    const search=window.normalizeArabic(document.getElementById('searchDebtAccountBox')?.value||''),isCust=activeDebtSubTab==='customer';
    let list=(isCust?debts.customers:debts.suppliers)||[];
    let grandRec=0,grandPay=0;(debts.customers||[]).forEach(x=>{const n=window.calcAccountBalances(x).net;if(n>0)grandRec+=n;});(debts.suppliers||[]).forEach(x=>{const n=window.calcAccountBalances(x).net;if(n>0)grandPay+=n;});
    document.getElementById('debtTotalReceivableSum').textContent=window.formatMoney(grandRec);document.getElementById('debtTotalPayableSum').textContent=window.formatMoney(grandPay);document.getElementById('debtNetBalanceSum').textContent=window.formatMoney(grandRec-grandPay);
    const filter=window.__adtDebtListFilter||'all';
    list=list.filter(x=>!x.is_deleted).filter(x=>!search||window.normalizeArabic((x.name||'')+' '+(x.phone||'')).includes(search)).filter(x=>{const n=window.calcAccountBalances(x).net;return filter==='open'?n>0:filter==='settled'?n<=0:true;}).sort((a,b)=>{const ba=window.calcAccountBalances(a).net,bb=window.calcAccountBalances(b).net;if((bb>0)!==(ba>0))return bb>0?-1:1;const da=Math.max(0,...(a.transactions||[]).map(t=>new Date(t.created_at||0).getTime()||0)),db=Math.max(0,...(b.transactions||[]).map(t=>new Date(t.created_at||0).getTime()||0));return db-da;});
    document.querySelectorAll('.adt-debt-filter').forEach(btn=>btn.classList.toggle('active',btn.dataset.filter===filter));
    if(!list.length){container.innerHTML=`<div style="text-align:center;color:var(--text-muted);padding:38px 12px;font-weight:800">${search?'لا توجد نتائج مطابقة':filter==='settled'?'لا توجد حسابات خالصة':'لا توجد حسابات في هذا القسم'}</div>`;return;}
    container.innerHTML=list.map(acc=>{const b=window.calcAccountBalances(acc),balanceState=b.net>0?(isCust?'receivable':'payable'):'settled',balanceLabel=b.net>0?(isCust?'عليه':'له'):'بدون رصيد';return `<div class="debt-account-card adt-debt-card-v237" onclick="window.openAccountLedgerDetail('${acc.id}')"><div class="debt-card-header-row"><div class="debt-account-identity"><div class="debt-user-badge ${isCust?'cust':'supp'}">${isCust?iconCustomer:iconSupplier}</div><div class="debt-account-details"><b class="debt-account-name">${window.escapeHtml(acc.name)}</b><div class="debt-account-phone">${window.escapeHtml(acc.phone||'بدون هاتف')}</div></div></div><div class="debt-balance-badge ${balanceState}"><div class="debt-balance-value">${window.escapeHtml(window.formatMoney(Math.max(0,b.net)))}</div><span class="debt-balance-label">${balanceLabel}</span></div></div></div>`;}).join('');
  };
  const oldSwitch=window.switchDebtSubTab;window.switchDebtSubTab=function(){window.__adtDebtListFilter='all';const result=oldSwitch.apply(this,arguments);document.querySelectorAll('.adt-debt-filter').forEach(btn=>btn.classList.toggle('active',btn.dataset.filter==='all'));return result;};
})();
