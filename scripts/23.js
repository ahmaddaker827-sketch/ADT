
(function(){
  let viewerMode = 'grocery';
  let onlyUnpriced = false;
  let liveTimer = null;
  let liveBusy = false;
  let liveTick = 0;
  let liveSignature = '';
  const byId = id => document.getElementById(id);
  const money = n => window.formatMoney(Number(n||0));
  const safe = value => window.escapeHtml(value);
  function rowsForViewer(){
    if(viewerMode==='grocery')return (window.groceryAuditEntries||[]).map(x=>({
      name:x.name||'',unitName:x.unitName||(x.unit==='piece'?'قطعة':'صندوق'),
      qty:Number(x.qty||0),price:Number(x.price||0),groceryId:String(x.id),updatedAt:Number(x.updatedAt||0)
    })).sort((a,b)=>b.updatedAt-a.updatedAt);
    window.loadWholesaleUnitAudit();const rows=[];
    products.forEach(p=>{const e=window.getWholesaleUnitEntry(p);
      if(Number(e.pack||0)>0)rows.push({name:p.name||'',unitName:p.packName||'صندوق',qty:Number(e.pack),price:Number(e.packPrice||0),productId:String(p.id),unit:'pack'});
      if(Number(e.piece||0)>0)rows.push({name:p.name||'',unitName:p.pieceName||'قطعة',qty:Number(e.piece),price:Number(e.piecePrice||0),productId:String(p.id),unit:'piece'});
    });return rows.sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0));
  }
  window.openAuditedItemsViewer=function(mode){
    if(mode!=='grocery'&&mode!=='wholesale')return;
    if(mode==='wholesale'&&!window.canAudit())return;
    if(mode==='grocery'&&!window.isDeveloperGroceryAuditAllowed())return;
    viewerMode=mode;
    onlyUnpriced=false;
    byId('adtAuditedViewerPriced').setAttribute('aria-pressed','false');
    byId('adtAuditedViewerTitle').textContent=mode==='grocery'?'أصناف جرد سريع':'أصناف جـرد مـحلـک';
    byId('adtAuditedViewerSearch').value='';byId('adtAuditedViewer').hidden=false;
    window.renderAuditedItemsViewer();
    window.startAuditedViewerLiveSync();
  };
  window.closeAuditedItemsViewer=function(){byId('adtAuditedViewer').hidden=true;window.stopAuditedViewerLiveSync();};
  window.toggleAuditedPricedFilter=function(){
    onlyUnpriced=!onlyUnpriced;
    byId('adtAuditedViewerPriced').setAttribute('aria-pressed',String(onlyUnpriced));
    window.renderAuditedItemsViewer();
  };
  window.renderAuditedItemsViewer=function(){
    const rows=rowsForViewer(),query=window.normalizeArabic(byId('adtAuditedViewerSearch').value);
    const visible=rows.filter(x=>window.normalizeArabic(x.name).includes(query)&&(!onlyUnpriced||(!Number.isFinite(x.price)||x.price<=0)));
    const total=rows.reduce((sum,x)=>sum+x.qty*x.price,0);
    byId('adtAuditedViewerCount').textContent=rows.length+' وحدة مجرودة';
    byId('adtAuditedViewerFilterCount').textContent=(onlyUnpriced||query)?'المعروض '+visible.length+' من '+rows.length:'';
    byId('adtAuditedViewerTotal').textContent='الإجمالي '+money(total);
    byId('adtAuditedViewerList').innerHTML=visible.length?visible.map(x=>window.buildUnifiedAuditCard(x)).join(''):'<div class="adt-audited-viewer-empty">لا توجد أصناف مطابقة للتصفية أو البحث</div>';
    liveSignature=JSON.stringify(rows.map(x=>[x.groceryId||x.productId||'',x.unit||x.unitName||'',Number(x.qty||0),Number(x.price||0),x.name||'']));
  };
  window.stopAuditedViewerLiveSync=function(){liveBusy=false;};
  window.startAuditedViewerLiveSync=function(){
    liveBusy=false;
    window.loadGroceryAudit?.();
    window.__wholesaleUnitAuditLoadedKey='';window.loadWholesaleUnitAudit?.();
    window.renderAuditedItemsViewer?.();
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)window.stopAuditedViewerLiveSync();else if(!byId('adtAuditedViewer')?.hidden)window.startAuditedViewerLiveSync();});
  byId('adtAuditedViewerList')?.addEventListener('click',function(event){
    const button=event.target.closest('button[data-audit-action]');if(!button)return;
    const card=button.closest('[data-audit-origin]');if(!card)return;
    const grocery=card.dataset.auditOrigin==='grocery',id=card.dataset.groceryId;
    const index=grocery?-1:products.findIndex(p=>String(p.id)===card.dataset.productId);
    if(!grocery&&index<0)return;
    const action=button.dataset.auditAction,unit=card.dataset.unit==='piece'?'piece':'pack';
    if(action==='edit'){
      window.closeAuditedItemsViewer();
      if(grocery)window.editGroceryEntry(id);else window.editUnifiedWholesaleAudit(index,unit);
      const form=byId(grocery?'groceryNameInput':'searchAuditBox');
      // The editor lives on the original audit page, not in this viewer.
      if(form){form.scrollIntoView({block:'nearest',behavior:'instant'});}
    }else if(action==='delete'){
      if(grocery)Promise.resolve(window.deleteGroceryEntry(id)).then(()=>{if(!byId('adtAuditedViewer').hidden)window.renderAuditedItemsViewer();});
      else Promise.resolve(window.removeUnifiedWholesaleAudit(index,unit)).then(()=>{if(!byId('adtAuditedViewer').hidden)window.renderAuditedItemsViewer();});
    }
  });
})();
