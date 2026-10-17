
(function(){
  window.groceryAuditEntries=[];
  window.getGroceryAuditKey=()=>`adt_grocery_audit_v249_${String(currentTeam?.id||'local')}`;
  window.loadGroceryAudit=function(){const saved=window.readCriticalLocalState(window.getGroceryAuditKey(),[]);window.groceryAuditEntries=Array.isArray(saved)?saved:[];return window.groceryAuditEntries;};
  window.saveGroceryAudit=function(){const rows=window.groceryAuditEntries||[];window.backupGroceryAuditSnapshot?.(rows,'local-save');window.writeCriticalLocalState('grocery_audit_v249',window.getGroceryAuditKey(),rows);};
  window.populateGrocerySuggestions=function(){window.__grocerySuggestionMatches=[];const list=document.getElementById('groceryProductSuggestions');if(list){list.innerHTML='';list.classList.remove('show');}};
  window.findGroceryProductByName=function(name){const key=window.normalizeArabic(String(name||'').trim());return products.find(p=>window.normalizeArabic(String(p.name||'').trim())===key)||null;};
  window.updateGroceryUnitButtons=function(){const name=document.getElementById('groceryNameInput')?.value||'',p=window.findGroceryProductByName(name),unit=document.getElementById('groceryUnitInput')?.value||'pack',pack=document.getElementById('groceryPackBtn'),piece=document.getElementById('groceryPieceBtn');if(pack){pack.textContent=p?.packName||'صندوق';pack.classList.toggle('active',unit==='pack');}if(piece){piece.textContent=p?.pieceName||'قطعة';piece.classList.toggle('active',unit==='piece');}};
  window.hideGrocerySuggestions=function(){document.getElementById('groceryProductSuggestions')?.classList.remove('show');};
  window.acceptNewGroceryName=function(){const name=String(document.getElementById('groceryNameInput')?.value||'').trim();if(!name)return;window.hideGrocerySuggestions();window.updateGroceryUnitButtons();setTimeout(()=>document.getElementById('groceryQtyInput')?.focus(),40);};
  window.chooseGrocerySuggestion=function(index){const p=(window.__grocerySuggestionMatches||[])[Number(index)];if(!p)return;document.getElementById('groceryNameInput').value=p.name||'';const unit=document.getElementById('groceryUnitInput')?.value||'pack',packQty=Math.max(1,Number(p.packQty||1)),price=unit==='piece'?Number(p.sellPrice||0)/packQty:Number(p.sellPrice||0);document.getElementById('groceryPriceInput').value=price?price.toFixed(2):'';window.hideGrocerySuggestions();window.updateGroceryUnitButtons();setTimeout(()=>document.getElementById('groceryQtyInput')?.focus(),40);};
  window.grocerySuggestProduct=function(){const input=document.getElementById('groceryNameInput'),list=document.getElementById('groceryProductSuggestions'),name=String(input?.value||'').trim(),query=window.normalizeArabic(name);window.updateGroceryUnitButtons();if(!list)return;if(!name){list.innerHTML='<div class="adt-v250-no-match">اكتب اسم الصنف، ويمكنك إضافته حتى لو لم يكن موجودًا.</div>';list.classList.add('show');return;}const matches=products.filter(p=>window.normalizeArabic(String(p.name||'')).includes(query)).slice(0,4);window.__grocerySuggestionMatches=matches;list.innerHTML=`<button type="button" class="adt-v250-use-new" onclick="window.acceptNewGroceryName()"><span>إضافة «${window.escapeHtml(name)}» كصنف جديد</span><small>متابعة للعدد والسعر</small></button>${matches.map((p,i)=>`<button type="button" onclick="window.chooseGrocerySuggestion(${i})"><span>${window.escapeHtml(p.name||'')}</span><small>اختيار من المخزون</small></button>`).join('')}`;list.classList.add('show');};
  window.setGroceryEntryUnit=function(unit){document.getElementById('groceryUnitInput').value=unit==='piece'?'piece':'pack';const price=document.getElementById('groceryPriceInput');if(price)price.value='';window.updateGroceryUnitButtons();window.grocerySuggestProduct();};
  window.clearGroceryQuickForm=function(){for(const id of ['groceryEditId','groceryNameInput','groceryQtyInput','groceryPriceInput']){const el=document.getElementById(id);if(el)el.value='';}const unit=document.getElementById('groceryUnitInput');if(unit)unit.value='pack';document.getElementById('grocerySaveEntryBtn').textContent='إضافة إلى الجرد';document.getElementById('groceryCancelEditBtn').style.display='none';window.hideGrocerySuggestions();window.updateGroceryUnitButtons();};
  window.saveGroceryQuickEntry=function(){const id=document.getElementById('groceryEditId').value,name=String(document.getElementById('groceryNameInput').value||'').trim(),qty=Number(document.getElementById('groceryQtyInput').value),priceRaw=String(document.getElementById('groceryPriceInput').value||'').trim(),price=priceRaw===''?0:Number(priceRaw),unit=document.getElementById('groceryUnitInput').value==='piece'?'piece':'pack',updatedAt=Date.now();if(!name){document.getElementById('groceryNameInput').focus();return;}if(!Number.isFinite(qty)||qty<=0){document.getElementById('groceryQtyInput').focus();return;}if(!Number.isFinite(price)||price<0){document.getElementById('groceryPriceInput').focus();return;}const p=window.findGroceryProductByName(name),unitName=unit==='piece'?(p?.pieceName||'قطعة'):(p?.packName||'صندوق'),row={id:id||`grocery_${updatedAt}_${Math.random().toString(36).slice(2,6)}`,productId:p?String(p.id):null,name,qty,unit,unitName,price,updatedAt};let merged=false;if(id){const i=window.groceryAuditEntries.findIndex(x=>String(x.id)===String(id));if(i>=0)window.groceryAuditEntries[i]=row;}else{const key=window.groceryNameKey(name),i=window.groceryAuditEntries.findIndex(x=>window.groceryNameKey(x?.name)===key&&(x?.unit==='piece'?'piece':'pack')===unit);if(i>=0){const old=window.groceryAuditEntries[i];window.groceryAuditEntries[i]={...old,name:old.name||name,productId:old.productId||row.productId,unitName:row.unitName,qty:Number(old.qty||0)+qty,price:price>0?price:Number(old.price||0),updatedAt};merged=true;}else window.groceryAuditEntries.push(row);}window.saveGroceryAudit();window.clearGroceryQuickForm();window.renderGroceryAudit();window.showToast(id?'تم تعديل الصنف':merged?'تمت إضافة الكمية إلى الصنف الموجود':'تمت إضافة الصنف للجرد');window.broadcastTeamStateChanged?.('grocery_audit_changed');};
  window.editGroceryEntry=function(id){const x=window.groceryAuditEntries.find(r=>String(r.id)===String(id));if(!x)return;document.getElementById('groceryEditId').value=x.id;document.getElementById('groceryNameInput').value=x.name;document.getElementById('groceryQtyInput').value=x.qty;document.getElementById('groceryPriceInput').value=x.price||'';document.getElementById('groceryUnitInput').value=x.unit==='piece'?'piece':'pack';document.getElementById('grocerySaveEntryBtn').textContent='حفظ التعديل';document.getElementById('groceryCancelEditBtn').style.display='block';window.updateGroceryUnitButtons();setTimeout(()=>document.getElementById('groceryNameInput')?.focus(),250);};
  window.deleteGroceryEntry=async function(id){const x=window.groceryAuditEntries.find(r=>String(r.id)===String(id));if(!x)return;const ok=await window.showAppConfirm({title:'حذف الصنف من الجرد؟',message:`سيتم حذف «${x.name}» من جرد سريع.`,confirmText:'حذف',cancelText:'إلغاء',danger:true});if(!ok)return;const backupOk=await window.saveGroceryAuditPhoneSnapshot?.('قبل حذف صنف');if(window.Android&&typeof window.Android.saveAutomaticFileChecked==='function'&&backupOk!==true){window.customAlert('تم إلغاء الحذف','تعذر إنشاء نسخة أمان على الهاتف، لذلك لم يتم حذف الصنف.');return;}window.markNextCriticalMutation?.('grocery_audit_v249','delete');window.groceryAuditEntries=window.groceryAuditEntries.filter(r=>String(r.id)!==String(id));window.saveGroceryAudit();window.renderGroceryAudit();window.broadcastTeamStateChanged?.('grocery_audit_changed');};
  window.renderGroceryAudit=function(){
    const list=document.getElementById('groceryAuditList');if(!list)return;
    const rows=(window.groceryAuditEntries||[]).slice().sort((a,b)=>Number(a?.updatedAt||0)-Number(b?.updatedAt||0)), total=rows.reduce((sum,x)=>sum+Number(x.qty||0)*Number(x.price||0),0);
    document.getElementById('groceryAuditTotal').textContent=window.formatMoney(total);
    document.getElementById('groceryAuditCount').textContent=String(rows.length);
    if(!rows.length){list.innerHTML='<div class="adt-v249-empty"><b>لم تضف أصنافًا بعد</b>اكتب اسم الصنف والعدد والوحدة ثم أضفه فورًا.</div>';return;}
    list.innerHTML=rows.map(x=>window.buildUnifiedAuditCard({
      name:x.name,unitName:x.unitName||(x.unit==='piece'?'قطعة':'صندوق'),
      qty:Number(x.qty||0),price:Number(x.price||0),groceryId:String(x.id)
    })).join('');
  };
  // Reuse the original wholesale audited-product card in both audit screens and the viewer.
  window.buildUnifiedAuditCard=function(x){
    const safe=window.escapeHtml,money=window.formatMoney,qty=Number(x.qty||0),price=Number(x.price||0);
    const grocery=x.groceryId!==undefined,missing=price<=0;
    const id=grocery?safe(String(x.groceryId)):null;
    const actions=grocery?`data-audit-origin="grocery" data-grocery-id="${id}"`:`data-audit-origin="wholesale" data-product-id="${safe(String(x.productId))}" data-unit="${x.unit==='piece'?'piece':'pack'}"`;
    return `<div class="audit-display-card adt-v266-audit-card" ${actions}>
      <div class="adt-v266-audit-info"><div class="adt-v266-name-row"><div class="prod-name-title">${safe(x.name||'')}</div><span>${safe(x.unitName||'وحدة')}</span></div>
      <div class="adt-v266-audit-price"><span>${grocery?'سعر البيع':'سعر الجرد'}</span><strong>${missing&&grocery?'غير محدد':money(price)}</strong></div></div>
      <div class="adt-v266-audit-metrics"><div class="adt-v266-metric"><span>الكمية</span><strong>${qty} ${safe(x.unitName||'وحدة')}</strong></div>
      <div class="adt-v266-metric total"><span>إجمالي المنتج</span><strong>${missing&&grocery?'أضف السعر':money(qty*price)}</strong></div></div>
      <div class="adt-v266-audit-actions"><button type="button" class="adt-v266-edit-btn" data-audit-action="edit" aria-label="تعديل الصنف">تعديل</button>
      <button type="button" class="adt-v266-delete-btn" data-audit-action="delete" aria-label="حذف الصنف">حذف</button></div></div>`;
  };
  // Delegate by stable record id; never interpolate untrusted names into JavaScript handlers.
  document.getElementById('groceryAuditList')?.addEventListener('click',function(event){
    const button=event.target.closest('button[data-audit-action]');if(!button)return;
    const card=button.closest('[data-grocery-id]');if(!card)return;
    const id=card.dataset.groceryId;
    if(button.dataset.auditAction==='edit')window.editGroceryEntry(id);
    else if(button.dataset.auditAction==='delete')window.deleteGroceryEntry(id);
  });
  window.openSaleAudit=function(){
    const scroller=document.querySelector('.app-main-content');if(scroller)scroller.scrollTop=0;
    window.auditMode='selling';window.clearGroceryQuickForm?.();
    window.switchTab('groceryAudit',true,true);
    window.loadGroceryAudit();window.populateGrocerySuggestions();window.renderGroceryAudit();window.prepareAuditProductsFast?.('groceryAudit');
    if(scroller)scroller.scrollTop=0;const bar=document.getElementById('currentPageTitleBar');if(bar)bar.textContent='جرد سريع';
    // فتح فوري؛ التحقق من الفريق/العضو والمزامنة في الخلفية فقط.
    setTimeout(()=>window.ensureAuditAccessReady?.('selling').then(ok=>{
      if(!ok&&currentTab==='groceryAudit')window.switchTab('home',false);
      window.refreshDeveloperGroceryAuditVisibility?.();
    }).catch(()=>{}),0);
    // لا ننتظر مزامنة عامة عند فتح الجرد؛ افتح فورًا واترك Realtime يتولى التحديثات.
  };
  window.makeGrocerySnapshot=function(){return {id:`audit_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,mode:'selling',createdAt:new Date().toISOString(),items:(window.groceryAuditEntries||[]).map(x=>({id:String(x.id),name:String(x.name||''),qty:Number(x.qty||0),buyPrice:Number(x.price||0),unit:x.unit==='piece'?'piece':'pack',unitName:String(x.unitName||'وحدة')}))};};
  window.resetGroceryAudit=async function(){if(!window.groceryAuditEntries.length){window.customAlert('لا يوجد جرد','أضف صنفًا واحدًا على الأقل أولًا.');return;}const missing=window.groceryAuditEntries.filter(x=>Number(x.price||0)<=0).length,message=missing?`يوجد ${missing} صنف بدون سعر وسيُحفظ بقيمة صفر. هل تريد الحفظ والتصفير؟`:'سيتم حفظ الجرد كاملًا في السجل ثم بدء جرد جديد.';const ok=await window.showAppConfirm({title:'حفظ وتصفير جرد سريع',message,confirmText:'حفظ وتصفير',cancelText:'إلغاء',danger:true});if(!ok)return;const backupOk=await window.saveGroceryAuditPhoneSnapshot?.('قبل التصفير');if(window.Android&&typeof window.Android.saveAutomaticFileChecked==='function'&&backupOk!==true){window.customAlert('تم إلغاء التصفير','تعذر إنشاء نسخة أمان على الهاتف، لذلك بقي الجرد كما هو.');return;}window.backupGroceryAuditSnapshot?.(window.groceryAuditEntries,'before-user-reset');const history=window.readAuditHistory();history.unshift(window.makeGrocerySnapshot());window.writeAuditHistory(history);window.markNextCriticalMutation?.('grocery_audit_v249','reset');window.markAuditIntentionalReset?.('grocery');window.groceryAuditEntries=[];window.saveGroceryAudit();window.clearGroceryQuickForm();window.renderGroceryAudit();window.showToast('تم حفظ وتصفير جرد سريع');window.broadcastTeamStateChanged?.('grocery_audit_reset');};
  const previousRestoreV249=window.restorePreviousAuditToCurrent;
  window.restorePreviousAuditToCurrent=async function(){const s=window.readLastAuditSnapshot();if(s?.mode!=='selling')return previousRestoreV249.apply(this,arguments);window.groceryAuditEntries=(s.items||[]).map(x=>({id:`grocery_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,productId:null,name:x.name||'صنف',qty:Number(x.qty||0),price:Number(x.buyPrice||0),unit:x.unit==='piece'?'piece':'pack',unitName:x.unitName||'وحدة'}));window.markNextCriticalMutation?.('grocery_audit_v249','restore');window.saveGroceryAudit();window.closePreviousAuditHistory();window.switchTab('groceryAudit');window.renderGroceryAudit();window.showToast('تم استرجاع جرد سريع');};
  window.exportGroceryAuditPDF=async function(){const rows=window.groceryAuditEntries||[];if(!rows.length){window.customAlert('لا يوجد جرد','أضف أصنافًا إلى الجرد أولًا.');return;}const root=document.createElement('div'),total=rows.reduce((s,x)=>s+Number(x.qty||0)*Number(x.price||0),0);root.dir='rtl';root.style.cssText='background:#fff;color:#111;padding:24px;font-family:Cairo,Arial,sans-serif;width:760px';root.innerHTML=`<h2 style="text-align:center">جرد سريع</h2><p style="text-align:center">${new Date().toLocaleString('ar-LY-u-nu-latn')}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="border:1px solid #aaa;padding:7px">#</th><th style="border:1px solid #aaa;padding:7px">الصنف</th><th style="border:1px solid #aaa;padding:7px">العدد</th><th style="border:1px solid #aaa;padding:7px">الوحدة</th><th style="border:1px solid #aaa;padding:7px">السعر</th><th style="border:1px solid #aaa;padding:7px">الإجمالي</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td style="border:1px solid #aaa;padding:7px">${i+1}</td><td style="border:1px solid #aaa;padding:7px">${window.escapeHtml(x.name)}</td><td style="border:1px solid #aaa;padding:7px">${Number(x.qty||0)}</td><td style="border:1px solid #aaa;padding:7px">${window.escapeHtml(x.unitName||'وحدة')}</td><td style="border:1px solid #aaa;padding:7px">${Number(x.price||0).toFixed(2)}</td><td style="border:1px solid #aaa;padding:7px">${(Number(x.qty||0)*Number(x.price||0)).toFixed(2)}</td></tr>`).join('')}</tbody></table><h3 style="text-align:left">الإجمالي: ${window.formatMoney(total)}</h3>`;document.body.appendChild(root);try{await html2pdf().set({margin:8,filename:`ADT-grocery-audit-${new Date().toISOString().slice(0,10)}.pdf`,html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(root).save();}catch(e){window.customAlert('تعذر التصدير','حدث خطأ أثناء إنشاء ملف PDF.');}finally{root.remove();}};
  window.exportGroceryAuditPDF=async function(){
    const source=window.groceryAuditEntries||[];
    if(!source.length){window.customAlert('لا يوجد جرد','أضف أصنافًا إلى الجرد أولًا.');return;}
    const rows=source.map((x,i)=>({index:i+1,name:String(x.name||''),qty:Number(x.qty||0),unit:String(x.unitName&&x.unitName!=='وحدة'?x.unitName:(x.unit==='piece'?'قطعة':'صندوق')),price:Number(x.price||0),total:Number(x.qty||0)*Number(x.price||0)}));
    const totalSum=rows.reduce((s,x)=>s+x.total,0),store=currentTeam?.name||'متجرنا',date=new Date().toLocaleDateString('ar-LY-u-nu-latn');
    const PAGE_W=1200,PAGE_H=1697,LEFT=45,RIGHT=1155,TABLE_TOP=220,HEADER_H=48,ROW_H=54,FOOTER_Y=1650,rowsPerPage=23,pageCount=Math.ceil(rows.length/rowsPerPage),pages=[];
    const cols=[RIGHT,1090,610,470,340,190,LEFT];
    const fit=(ctx,value,max)=>{let t=String(value||'');if(ctx.measureText(t).width<=max)return t;while(t.length>2&&ctx.measureText(t+'…').width>max)t=t.slice(0,-1);return t+'…';};
    const line=(ctx,y,h)=>{ctx.strokeStyle='#222';ctx.lineWidth=1;ctx.strokeRect(LEFT,y,RIGHT-LEFT,h);ctx.beginPath();cols.slice(1,-1).forEach(x=>{ctx.moveTo(x,y);ctx.lineTo(x,y+h);});ctx.stroke();};
    for(let page=0;page<pageCount;page++){
      const part=rows.slice(page*rowsPerPage,(page+1)*rowsPerPage),pageSum=part.reduce((s,x)=>s+x.total,0),canvas=document.createElement('canvas');canvas.width=PAGE_W;canvas.height=PAGE_H;const ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,PAGE_W,PAGE_H);ctx.direction='rtl';ctx.textAlign='center';ctx.fillStyle='#070A12';ctx.font='bold 34px Cairo,Arial,sans-serif';ctx.fillText(store,PAGE_W/2,56);ctx.font='bold 25px Cairo,Arial,sans-serif';ctx.fillText('كشف جرد سريع',PAGE_W/2,100);
      ctx.fillStyle='#00d2b4';ctx.fillRect(LEFT,120,RIGHT-LEFT,44);ctx.fillStyle='#071019';ctx.font='bold 19px Cairo,Arial,sans-serif';ctx.fillText(`إجمالي الجرد: ${window.formatMoney(totalSum)}   |   عدد الأصناف: ${rows.length}`,PAGE_W/2,149);
      ctx.fillStyle='#555';ctx.font='17px Cairo,Arial,sans-serif';ctx.textAlign='right';ctx.fillText(`التاريخ: ${date}`,RIGHT,198);ctx.textAlign='left';ctx.fillText(`صفحة ${page+1} من ${pageCount}`,LEFT,198);
      ctx.fillStyle='#eee';ctx.fillRect(LEFT,TABLE_TOP,RIGHT-LEFT,HEADER_H);line(ctx,TABLE_TOP,HEADER_H);ctx.fillStyle='#111';ctx.font='bold 17px Cairo,Arial,sans-serif';ctx.textAlign='center';['#','اسم الصنف','العدد','الوحدة','السعر','الإجمالي'].forEach((v,i)=>ctx.fillText(v,(cols[i]+cols[i+1])/2,TABLE_TOP+31));
      let y=TABLE_TOP+HEADER_H;part.forEach((r,j)=>{if(j%2){ctx.fillStyle='#f8f8f8';ctx.fillRect(LEFT,y,RIGHT-LEFT,ROW_H);}line(ctx,y,ROW_H);ctx.fillStyle='#111';ctx.font='17px Cairo,Arial,sans-serif';ctx.textAlign='center';ctx.fillText(String(r.index),(cols[0]+cols[1])/2,y+35);ctx.direction='rtl';ctx.textAlign='right';ctx.font='bold 17px Cairo,Arial,sans-serif';ctx.fillText(fit(ctx,r.name,440),cols[1]-18,y+35);ctx.textAlign='center';ctx.font='17px Cairo,Arial,sans-serif';ctx.fillText(String(r.qty),(cols[2]+cols[3])/2,y+35);ctx.fillText(fit(ctx,r.unit,100),(cols[3]+cols[4])/2,y+35);ctx.fillText(r.price.toFixed(2),(cols[4]+cols[5])/2,y+35);ctx.font='bold 17px Cairo,Arial,sans-serif';ctx.fillText(r.total.toFixed(2),(cols[5]+cols[6])/2,y+35);y+=ROW_H;});
      ctx.fillStyle='#f2fbf8';ctx.strokeStyle='#00d2b4';ctx.fillRect(LEFT,1570,RIGHT-LEFT,42);ctx.strokeRect(LEFT,1570,RIGHT-LEFT,42);ctx.fillStyle='#0b5f56';ctx.font='bold 18px Cairo,Arial,sans-serif';ctx.textAlign='right';ctx.fillText(`إجمالي هذه الصفحة: ${window.formatMoney(pageSum)}`,RIGHT-15,1598);ctx.fillStyle='#777';ctx.font='15px Cairo,Arial,sans-serif';ctx.textAlign='center';ctx.fillText('تم استخراج هذا التقرير عبر منظومة ADT Stock',PAGE_W/2,FOOTER_Y);pages.push(canvas);
    }
    try{window.showToast('جاري تجهيز ملف PDF...');await sharePdfBlob(createPurePdfBlobFromCanvases(pages),`كشف_جرد_البقالة_${new Date().toISOString().slice(0,10)}.pdf`);}catch(e){if(e?.name==='AbortError')return;console.error('[Grocery PDF Export] failed:',e);window.customAlert('تعذر التصدير','حدث خطأ أثناء إنشاء أو مشاركة ملف PDF. حاول مرة أخرى.');}
  };
  window.previewGroceryEntryTotal=function(){const qty=Number(document.getElementById('groceryQtyInput')?.value||0),price=Number(document.getElementById('groceryPriceInput')?.value||0),total=Number.isFinite(qty)&&Number.isFinite(price)?qty*price:0;const box=document.getElementById('groceryEntryPreviewTotal');if(box)box.textContent=window.formatMoney(total);};
  window.setGroceryEntryUnit=function(unit){const selected=unit==='piece'?'piece':'pack',name=document.getElementById('groceryNameInput')?.value||'',p=window.findGroceryProductByName(name);document.getElementById('groceryUnitInput').value=selected;if(p){const packQty=Math.max(1,Number(p.packQty||1)),price=selected==='piece'?Number(p.sellPrice||0)/packQty:Number(p.sellPrice||0),input=document.getElementById('groceryPriceInput');if(input)input.value=price?price.toFixed(2):'';}window.updateGroceryUnitButtons();if(document.getElementById('groceryProductSuggestions')?.classList.contains('show'))window.grocerySuggestProduct();window.previewGroceryEntryTotal();};
  window.grocerySuggestProduct=function(){const list=document.getElementById('groceryProductSuggestions'),name=String(document.getElementById('groceryNameInput')?.value||'').trim(),query=window.normalizeArabic(name);window.updateGroceryUnitButtons();if(!list)return;if(!name){list.innerHTML='';list.classList.remove('show');return;}const exact=products.find(p=>window.normalizeArabic(String(p.name||'').trim())===query),matches=products.filter(p=>window.normalizeArabic(String(p.name||'')).includes(query)).sort((a,b)=>a===exact?-1:b===exact?1:0).slice(0,4);window.__grocerySuggestionMatches=matches;const addNew=exact?'':`<button type="button" class="adt-v250-use-new" onclick="window.acceptNewGroceryName()"><span>إضافة «${window.escapeHtml(name)}» كصنف جديد</span><small>متابعة للعدد والسعر</small></button>`;list.innerHTML=addNew+matches.map((p,i)=>`<button type="button" onclick="window.chooseGrocerySuggestion(${i})"><span>${window.escapeHtml(p.name||'')}</span><small>${p===exact?'الصنف موجود — اختره':'اختيار من المخزون'}</small></button>`).join('');list.classList.toggle('show',!!(addNew||matches.length));};
  const clearGroceryQuickFormV251=window.clearGroceryQuickForm;
  window.clearGroceryQuickForm=function(){const result=clearGroceryQuickFormV251.apply(this,arguments);window.previewGroceryEntryTotal();return result;};
  const chooseGrocerySuggestionV251=window.chooseGrocerySuggestion;
  window.chooseGrocerySuggestion=function(){const result=chooseGrocerySuggestionV251.apply(this,arguments);window.previewGroceryEntryTotal();return result;};
  const editGroceryEntryV251=window.editGroceryEntry;
  window.editGroceryEntry=function(){const result=editGroceryEntryV251.apply(this,arguments);window.previewGroceryEntryTotal();return result;};
  window.groceryNameKey=function(value){return window.getProductIdentityKey(value);};
  window.findGroceryProductByName=function(name){const key=window.groceryNameKey(name);return key?products.find(p=>window.groceryNameKey(p?.name)===key)||null:null;};
  window.grocerySuggestProduct=function(){
    const list=document.getElementById('groceryProductSuggestions');
    const name=String(document.getElementById('groceryNameInput')?.value||'').trim();
    const query=window.groceryNameKey(name);
    window.updateGroceryUnitButtons();
    if(!list)return;
    if(!name){list.innerHTML='';list.classList.remove('show');return;}
    const exact=products.find(p=>window.groceryNameKey(p?.name)===query)||null;
    const matches=products.filter(p=>window.groceryNameKey(p?.name).includes(query))
      .sort((a,b)=>a===exact?-1:b===exact?1:0).slice(0,4);
    window.__grocerySuggestionMatches=matches;
    const addNew=exact?'':`<button type="button" class="adt-v250-use-new" onclick="window.acceptNewGroceryName()"><span>إضافة «${window.escapeHtml(name)}» كصنف جديد</span><small>متابعة للعدد والسعر</small></button>`;
    list.innerHTML=addNew+matches.map((p,i)=>{
      const selectionHint=p===exact?'الصنف موجود — اضغط لاختياره':'اضغط لاختياره';
      return `<button type="button" class="adt-grocery-pick" onclick="window.chooseGrocerySuggestion(${i})"><span class="adt-grocery-pick-name">${window.escapeHtml(p.name||'')}</span><span class="adt-grocery-pick-sub"><small>${selectionHint}</small></span></button>`;
    }).join('');
    list.classList.toggle('show',!!(addNew||matches.length));
  };
  window.openGroceryEntryModal=function(){const name=String(document.getElementById('groceryNameInput')?.value||'').trim();if(!name){document.getElementById('groceryNameInput')?.focus();return;}window.hideGrocerySuggestions();const p=window.findGroceryProductByName(name),unit=document.getElementById('groceryUnitInput')?.value==='piece'?'piece':'pack',price=document.getElementById('groceryPriceInput');if(p&&price&&!String(price.value||'').trim()){const packQty=Math.max(1,Number(p.packQty||1)),value=unit==='piece'?Number(p.sellPrice||0)/packQty:Number(p.sellPrice||0);price.value=value?value.toFixed(2):'';}const title=document.getElementById('groceryModalProductName');if(title)title.textContent=name;window.updateGroceryUnitButtons();window.previewGroceryEntryTotal();document.getElementById('groceryEntryModal')?.classList.add('show');setTimeout(()=>document.getElementById('groceryQtyInput')?.focus(),80);};
  window.closeGroceryEntryModal=function(){document.getElementById('groceryEntryModal')?.classList.remove('show');};
  window.acceptNewGroceryName=function(){window.openGroceryEntryModal();};
  window.chooseGrocerySuggestion=function(index){const p=(window.__grocerySuggestionMatches||[])[Number(index)];if(!p)return;const name=document.getElementById('groceryNameInput'),price=document.getElementById('groceryPriceInput'),unit=document.getElementById('groceryUnitInput')?.value==='piece'?'piece':'pack',packQty=Math.max(1,Number(p.packQty||1)),value=unit==='piece'?Number(p.sellPrice||0)/packQty:Number(p.sellPrice||0);if(name)name.value=p.name||'';if(price)price.value=value?value.toFixed(2):'';window.openGroceryEntryModal();};
  const clearGroceryQuickFormV256=window.clearGroceryQuickForm;
  window.clearGroceryQuickForm=function(){const result=clearGroceryQuickFormV256.apply(this,arguments);window.closeGroceryEntryModal();return result;};
  window.editGroceryEntry=function(id){const x=window.groceryAuditEntries.find(r=>String(r.id)===String(id));if(!x)return;document.getElementById('groceryEditId').value=x.id;document.getElementById('groceryNameInput').value=x.name;document.getElementById('groceryQtyInput').value=x.qty;document.getElementById('groceryPriceInput').value=x.price||'';document.getElementById('groceryUnitInput').value=x.unit==='piece'?'piece':'pack';document.getElementById('grocerySaveEntryBtn').textContent='حفظ التعديل';document.getElementById('groceryCancelEditBtn').style.display='block';window.openGroceryEntryModal();};
  /* V258: إعادة طريقة إدخال جرد سريع الأصلية بعد تصحيح اتجاه طلب التصميم. */
  window.acceptNewGroceryName=function(){const name=String(document.getElementById('groceryNameInput')?.value||'').trim();if(!name)return;window.hideGrocerySuggestions();window.updateGroceryUnitButtons();setTimeout(()=>document.getElementById('groceryQtyInput')?.focus(),40);};
  window.chooseGrocerySuggestion=function(index){const p=(window.__grocerySuggestionMatches||[])[Number(index)];if(!p)return;document.getElementById('groceryNameInput').value=p.name||'';const unit=document.getElementById('groceryUnitInput')?.value||'pack',packQty=Math.max(1,Number(p.packQty||1)),price=unit==='piece'?Number(p.sellPrice||0)/packQty:Number(p.sellPrice||0);document.getElementById('groceryPriceInput').value=price?price.toFixed(2):'';window.hideGrocerySuggestions();window.updateGroceryUnitButtons();window.previewGroceryEntryTotal();setTimeout(()=>document.getElementById('groceryQtyInput')?.focus(),40);};
  window.editGroceryEntry=function(id){const x=window.groceryAuditEntries.find(r=>String(r.id)===String(id));if(!x)return;document.getElementById('groceryEditId').value=x.id;document.getElementById('groceryNameInput').value=x.name;document.getElementById('groceryQtyInput').value=x.qty;document.getElementById('groceryPriceInput').value=x.price||'';document.getElementById('groceryUnitInput').value=x.unit==='piece'?'piece':'pack';document.getElementById('grocerySaveEntryBtn').textContent='حفظ التعديل';document.getElementById('groceryCancelEditBtn').style.display='block';window.updateGroceryUnitButtons();window.previewGroceryEntryTotal();setTimeout(()=>document.getElementById('groceryNameInput')?.focus(),180);};
  window.__wholesaleQuickMatches=[];
  window.hideWholesaleQuickSuggestions=function(){const box=document.getElementById('auditSearchResultsDropdown');if(box){box.style.display='none';box.innerHTML='';}};
  window.previewWholesaleQuickTotal=function(){const qty=Number(document.getElementById('wholesaleQuickQty')?.value||0),price=Number(document.getElementById('wholesaleQuickPrice')?.value||0),total=Number.isFinite(qty)&&Number.isFinite(price)?qty*price:0,box=document.getElementById('wholesaleQuickTotal');if(box)box.textContent=window.formatMoney(total);};
  window.handleAuditSearchInput=function(){const input=document.getElementById('searchAuditBox'),box=document.getElementById('auditSearchResultsDropdown'),hidden=document.getElementById('wholesaleQuickProductId'),name=String(input?.value||'').trim(),query=window.getProductIdentityKey(name);if(!box)return;if(hidden){const selected=products.find(p=>String(p.id)===String(hidden.value||''));if(!selected||window.getProductIdentityKey(selected.name)!==query)hidden.value='';}if(!query){window.hideWholesaleQuickSuggestions();return;}const matches=products.filter(p=>window.getProductIdentityKey(p?.name).includes(query)).slice(0,6);window.__wholesaleQuickMatches=matches;if(!matches.length){box.innerHTML='<div style="padding:10px;text-align:center;color:#8194a7;font-size:9px">الصنف غير موجود في قائمة المنتجات</div>';box.style.display='block';return;}box.innerHTML=matches.map((p,i)=>`<button type="button" class="search-res-item" onclick="window.chooseWholesaleQuickProduct(${i})">${window.escapeHtml(p.name||'')}</button>`).join('');box.style.display='block';};
  window.chooseWholesaleQuickProduct=function(index){const p=(window.__wholesaleQuickMatches||[])[Number(index)];if(!p)return;document.getElementById('wholesaleQuickProductId').value=String(p.id);document.getElementById('searchAuditBox').value=p.name||'';document.getElementById('wholesaleQuickPrice').value=window.getAuditOnlyPrice(p).toFixed(2);window.hideWholesaleQuickSuggestions();window.previewWholesaleQuickTotal();setTimeout(()=>document.getElementById('wholesaleQuickQty')?.focus(),50);};
  window.clearWholesaleQuickAudit=function(){for(const id of ['wholesaleQuickProductId','searchAuditBox','wholesaleQuickQty','wholesaleQuickPrice']){const el=document.getElementById(id);if(el)el.value='';}window.hideWholesaleQuickSuggestions();window.previewWholesaleQuickTotal();};
  window.saveWholesaleQuickAudit=async function(){if(!window.canAudit()){window.customAlert('غير مسموح','لا تملك صلاحية تعديل الجرد.');return;}const id=String(document.getElementById('wholesaleQuickProductId')?.value||''),typed=String(document.getElementById('searchAuditBox')?.value||'').trim(),p=products.find(x=>String(x.id)===id)||products.find(x=>window.getProductIdentityKey(x?.name)===window.getProductIdentityKey(typed));if(!p){window.customAlert('اختر الصنف','اختر الصنف من نتائج البحث أولًا.');document.getElementById('searchAuditBox')?.focus();return;}const qty=Number(document.getElementById('wholesaleQuickQty')?.value),price=Number(document.getElementById('wholesaleQuickPrice')?.value);if(!Number.isFinite(qty)||qty<=0){document.getElementById('wholesaleQuickQty')?.focus();return;}if(!Number.isFinite(price)||price<0){document.getElementById('wholesaleQuickPrice')?.focus();return;}const mode=window.auditMode==='retail'?'retail':'wholesale',base=window.getAuditBasePrice(p),priceKey=mode+':'+String(p.id);if(Math.abs(price-base)<.000001)delete window.auditOnlyPrices[priceKey];else window.auditOnlyPrices[priceKey]=price;window.saveAuditOnlyPrices();if(mode==='retail'){const final=window.getRetailAuditQty(p)+qty;window.retailAuditState[String(p.id)]=final;p.retailAuditQty=final;window.saveRetailAudit();window.clearWholesaleQuickAudit();window.renderAudit();window.showToast('تمت إضافة الكمية إلى جرد القطاعي');window.broadcastTeamStateChanged?.('audit_item');return;}if(!(await window.confirmGhostMutation('إضافة صنف إلى الجرد')))return;if((!dbClient||!currentTeam)&&!window.isDeveloperOffline()){window.customAlert('لا يوجد اتصال بالخادم','تعذر الحفظ لأن الاتصال بالخادم غير متاح.');return;}const previous=Number(p.auditQty||0),final=previous+qty;p.auditQty=final;window.clearWholesaleQuickAudit();window.renderAudit();window.showToast(previous>0?'تمت إضافة الكمية إلى الصنف الموجود':'تم إدخال الصنف في الجرد');window.queueWholesaleAuditSave(p,previous,final);};
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.adt-v250-grocery-name-wrap'))window.hideGrocerySuggestions();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.adt-v259-wholesale-name-wrap'))window.hideWholesaleQuickSuggestions();});

  /* V263: بطاقة إجمالي جـرد مـحلـک تستخدم نفس تركيب وتصميم بطاقة البقالة. */
  const renderAuditV263=window.renderAudit;
  window.renderAudit=function(){
    const result=renderAuditV263.apply(this,arguments),mode=window.auditMode,
      count=products.filter(p=>window.getCurrentAuditQty(p)>0).length,
      title=document.getElementById('auditValueTitle'),countBox=document.getElementById('auditStatCountSub');
    if(title)title.textContent='الإجمالي';
    if(countBox)countBox.innerHTML=`<b>${count}</b> صنف`;
    return result;
  };

  /* V264: دمج جرد القطعة والصندوق داخل جـرد مـحلـک. */
  window.wholesaleUnitAuditState={};
  window.getWholesaleUnitAuditKey=()=>`adt_wholesale_unit_audit_v264_${String(currentTeam?.id||'local')}`;
  window.loadWholesaleUnitAudit=function(){
    const key=window.getWholesaleUnitAuditKey();
    if(window.__wholesaleUnitAuditLoadedKey===key)return window.wholesaleUnitAuditState;
    const hasUnified=(window.__adtCriticalMemoryState?.[key]!==undefined);let saved=window.readCriticalLocalState(key,{});if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
    window.wholesaleUnitAuditState=saved;
    let migrated=false,legacyRetail={}; // لا نُرحّل أي جرد قديم من localStorage بعد إلغاء الحفظ المحلي.
    products.forEach(p=>{const id=String(p.id),pack=Number(p.auditQty||0),piece=Number(legacyRetail[id]||0),packSize=Math.max(1,Number(p.packQty||1));if(!saved[id]&&(pack>0||piece>0)){saved[id]={pack,piece,packPrice:Number(window.getAuditOnlyPrice(p)||p.buyPrice||0),piecePrice:Number(p.buyPrice||0)/packSize};migrated=true;}if(saved[id])p.auditQty=Number(saved[id].pack||0)+Number(saved[id].piece||0)/packSize;});
    window.__wholesaleUnitAuditLoadedKey=key;if(migrated)window.saveWholesaleUnitAudit({skipPhoneBackup:true});return saved;
  };
  window.saveWholesaleUnitAudit=function(options={}){
    window.writeCriticalLocalState('wholesale_unit_audit_v264',window.getWholesaleUnitAuditKey(),window.wholesaleUnitAuditState||{});
    if(options?.skipPhoneBackup!==true)window.queueWholesaleAuditPhoneFile?.('تحديث بعد تغيير');
  };
  window.getWholesaleUnitEntry=function(p){window.loadWholesaleUnitAudit();return window.wholesaleUnitAuditState[String(p?.id)]||{pack:0,piece:0,packPrice:Number(p?.buyPrice||0),piecePrice:Number(p?.buyPrice||0)/Math.max(1,Number(p?.packQty||1))};};
  window.getWholesaleUnitTotalQty=function(p){const e=window.getWholesaleUnitEntry(p);return Number(e.pack||0)+Number(e.piece||0);};
  window.getWholesaleEquivalentQty=function(p,e=window.getWholesaleUnitEntry(p)){return Number(e.pack||0)+(Number(e.piece||0)/Math.max(1,Number(p?.packQty||1)));};
  window.setWholesaleAuditUnit=function(unit){
    const selected=unit==='piece'?'piece':'pack',p=products.find(x=>String(x.id)===String(document.getElementById('wholesaleQuickProductId')?.value||'')),hidden=document.getElementById('wholesaleQuickUnit');if(hidden)hidden.value=selected;
    const pack=document.getElementById('wholesalePackBtn'),piece=document.getElementById('wholesalePieceBtn');if(pack){pack.textContent=p?.packName||'صندوق';pack.classList.toggle('active',selected==='pack');}if(piece){piece.textContent=p?.pieceName||'قطعة';piece.classList.toggle('active',selected==='piece');}
    const price=document.getElementById('wholesaleQuickPrice');if(price&&p){const e=window.getWholesaleUnitEntry(p),value=selected==='piece'?Number(e.piecePrice??(Number(p.buyPrice||0)/Math.max(1,Number(p.packQty||1)))):Number(e.packPrice??Number(p.buyPrice||0));price.value=value.toFixed(2);}window.previewWholesaleQuickTotal();
  };
  window.handleAuditSearchInput=function(){
    const input=document.getElementById('searchAuditBox'),box=document.getElementById('auditSearchResultsDropdown'),hidden=document.getElementById('wholesaleQuickProductId'),query=window.getProductIdentityKey(input?.value||'');if(!box)return;if(hidden)hidden.value='';if(!query){window.hideWholesaleQuickSuggestions();return;}
    const matches=products.filter(p=>window.getProductIdentityKey(p?.name).includes(query)).slice(0,6);window.__wholesaleQuickMatches=matches;
    box.innerHTML=matches.length?matches.map((p,i)=>{const audited=window.getWholesaleUnitTotalQty(p)>0||Number(p.auditQty||0)>0;return `<div class="adt-v264-search-row"><span class="adt-v264-search-info"><b>${window.escapeHtml(p.name||'')}</b><small>${window.escapeHtml(p.packName||'صندوق')} / ${window.escapeHtml(p.pieceName||'قطعة')}</small></span><button type="button" class="adt-v264-search-action ${audited?'add':''}" onclick="event.preventDefault();event.stopPropagation();window.chooseWholesaleQuickProduct(${i})">${audited?'زيادة عدد':'جرد'}</button></div>`;}).join(''):'<div style="padding:10px;text-align:center;color:#8194a7;font-size:9px">الصنف غير موجود في قائمة المنتجات</div>';box.style.display='block';
  };
  window.chooseWholesaleQuickProduct=function(index){
    const p=(window.__wholesaleQuickMatches||[])[Number(index)];if(!p)return;document.getElementById('wholesaleQuickProductId').value=String(p.id);document.getElementById('searchAuditBox').value=p.name||'';document.getElementById('wholesaleQuickEditMode').value='add';const audited=window.getWholesaleUnitTotalQty(p)>0||Number(p.auditQty||0)>0;document.getElementById('wholesaleQuickSaveBtn').textContent=audited?'زيادة العدد':'إضافة إلى الجرد';window.hideWholesaleQuickSuggestions();window.setWholesaleAuditUnit(document.getElementById('wholesaleQuickUnit')?.value||'pack');setTimeout(()=>document.getElementById('wholesaleQuickQty')?.focus(),50);
  };
  window.clearWholesaleQuickAudit=function(){for(const id of ['wholesaleQuickProductId','searchAuditBox','wholesaleQuickQty','wholesaleQuickPrice']){const el=document.getElementById(id);if(el)el.value='';}document.getElementById('wholesaleQuickEditMode').value='add';document.getElementById('wholesaleQuickSaveBtn').textContent='إضافة إلى الجرد';window.hideWholesaleQuickSuggestions();window.setWholesaleAuditUnit('pack');window.previewWholesaleQuickTotal();};
  window.saveWholesaleQuickAudit=async function(){
    if(!window.canAudit()){window.customAlert('غير مسموح','لا تملك صلاحية تعديل الجرد.');return;}const id=String(document.getElementById('wholesaleQuickProductId')?.value||''),p=products.find(x=>String(x.id)===id);if(!p){window.customAlert('اختر الصنف','اختر الصنف من نتائج البحث أولًا.');return;}const qty=Number(document.getElementById('wholesaleQuickQty')?.value),price=Number(document.getElementById('wholesaleQuickPrice')?.value),unit=document.getElementById('wholesaleQuickUnit')?.value==='piece'?'piece':'pack',edit=document.getElementById('wholesaleQuickEditMode')?.value==='edit';if(!Number.isFinite(qty)||qty<=0){document.getElementById('wholesaleQuickQty')?.focus();return;}if(!Number.isFinite(price)||price<0){document.getElementById('wholesaleQuickPrice')?.focus();return;}if(!(await window.confirmGhostMutation(edit?'تعديل صنف الجرد':'إضافة صنف إلى الجرد')))return;if((!dbClient||!currentTeam)&&!window.isDeveloperOffline()){window.customAlert('لا يوجد اتصال بالخادم','تعذر الحفظ لأن الاتصال بالخادم غير متاح.');return;}
    const previous=Number(p.auditQty||0),old=window.getWholesaleUnitEntry(p),entry={...old,updatedAt:Date.now()};entry[unit]=(edit?0:Number(entry[unit]||0))+qty;entry[unit+'Price']=price;entry.updatedAt=Date.now();window.wholesaleUnitAuditState[String(p.id)]=entry;const equivalent=window.getWholesaleEquivalentQty(p,entry),total=Number(entry.pack||0)*Number(entry.packPrice||0)+Number(entry.piece||0)*Number(entry.piecePrice||0),weighted=equivalent>0?total/equivalent:Number(p.buyPrice||0);p.auditQty=equivalent;window.auditOnlyPrices['wholesale:'+String(p.id)]=weighted;window.saveAuditOnlyPrices();window.saveWholesaleUnitAudit();window.clearWholesaleQuickAudit();window.renderAudit();window.queueWholesaleAuditSave(p,previous,equivalent);window.showToast(edit?'تم تعديل الصنف':previous>0?'تمت زيادة عدد الصنف':'تم جرد الصنف');window.broadcastTeamStateChanged?.('audit_item');
  };
  window.editUnifiedWholesaleAudit=function(index,unit){const p=products[index],e=window.getWholesaleUnitEntry(p);if(!p)return;document.getElementById('wholesaleQuickProductId').value=String(p.id);document.getElementById('searchAuditBox').value=p.name||'';document.getElementById('wholesaleQuickEditMode').value='edit';document.getElementById('wholesaleQuickSaveBtn').textContent='حفظ التعديل';window.setWholesaleAuditUnit(unit);document.getElementById('wholesaleQuickQty').value=Number(e[unit]||0);window.previewWholesaleQuickTotal();document.getElementById('wholesaleQuickQty').focus();};
  window.removeUnifiedWholesaleAudit=async function(index){const p=products[index];if(!p)return;const ok=await window.showAppConfirm({title:'حذف الصنف من الجرد؟',message:`سيتم حذف «${p.name}» بالصندوق والقطعة.`,confirmText:'حذف',cancelText:'إلغاء',danger:true});if(!ok)return;const previous=Number(p.auditQty||0);delete window.wholesaleUnitAuditState[String(p.id)];p.auditQty=0;delete window.auditOnlyPrices['wholesale:'+String(p.id)];window.saveAuditOnlyPrices();window.saveWholesaleUnitAudit();window.renderAudit();window.queueWholesaleAuditSave(p,previous,0);window.broadcastTeamStateChanged?.('audit_item_delete');};
  const renderAuditV264=window.renderAudit;
  window.renderAudit=function(){if(window.auditMode==='retail')window.auditMode='wholesale';if(window.auditMode!=='wholesale')return renderAuditV264.apply(this,arguments);window.loadWholesaleUnitAudit();const rows=products.filter(p=>window.getWholesaleUnitTotalQty(p)>0).sort((a,b)=>Number(window.getWholesaleUnitEntry(b)?.updatedAt||0)-Number(window.getWholesaleUnitEntry(a)?.updatedAt||0)),total=rows.reduce((s,p)=>{const e=window.getWholesaleUnitEntry(p);return s+Number(e.pack||0)*Number(e.packPrice||0)+Number(e.piece||0)*Number(e.piecePrice||0);},0),box=document.getElementById('auditList');document.getElementById('auditValueTitle').textContent='الإجمالي';document.getElementById('auditStatSum').textContent=window.formatMoney(total);document.getElementById('auditStatCountSub').innerHTML=`<b>${rows.length}</b> صنف`;const hub=document.getElementById('hubAuditBadge');if(hub)hub.textContent=`${rows.length} صنف مجرود`;if(!rows.length){box.innerHTML='<div class="adt-v245-audit-empty"><strong>لم تبدأ الجرد بعد</strong>ابحث عن صنف واختر جرده بالصندوق أو القطعة.</div>';return;}box.innerHTML=rows.map(p=>{const i=products.indexOf(p),e=window.getWholesaleUnitEntry(p),pack=Number(e.pack||0),piece=Number(e.piece||0),sum=pack*Number(e.packPrice||0)+piece*Number(e.piecePrice||0),lines=`${pack?`<span><b>${pack}</b> ${window.escapeHtml(p.packName||'صندوق')}</span>`:''}${piece?`<span><b>${piece}</b> ${window.escapeHtml(p.pieceName||'قطعة')}</span>`:''}`,editUnit=piece&&!pack?'piece':'pack';return `<div class="audit-display-card adt-v245-audit-card"><div class="audit-prod-main"><div class="prod-name-title">${window.escapeHtml(p.name)}</div><div class="adt-v264-unit-lines">${lines}</div></div><div class="audit-total-col"><span>الإجمالي</span><strong>${window.formatMoney(sum)}</strong></div><div class="adt-v245-card-actions"><button class="adt-v245-icon-btn edit" onclick="window.editUnifiedWholesaleAudit(${i},'${editUnit}')" aria-label="تعديل">✎</button><button class="adt-v245-icon-btn delete" onclick="window.removeUnifiedWholesaleAudit(${i})" aria-label="حذف">×</button></div></div>`;}).join('');};
  const openWholesaleAuditV264=window.openWholesaleAudit;
  window.openWholesaleAudit=function(){window.auditMode='wholesale';window.__wholesaleUnitAuditLoadedKey='';window.loadWholesaleUnitAudit();return openWholesaleAuditV264.apply(this,arguments);};
  window.openRetailAudit=function(){return window.openWholesaleAudit();};window.openAuditTypePicker=function(){return window.openWholesaleAudit();};window.chooseAuditType=function(){window.closeModal('auditTypePickerModal');return window.openWholesaleAudit();};
  const confirmResetAuditV264=window.confirmResetAudit;
  window.confirmResetAudit=async function(){
    const wholesale=window.auditMode!=='selling';
    const hasWholesale=wholesale&&Object.values(window.wholesaleUnitAuditState||{}).some(e=>Number(e?.pack||0)>0||Number(e?.piece||0)>0);
    if(hasWholesale){
      const backupOk=await window.saveWholesaleAuditPhoneSnapshot?.('قبل محاولة تصفير جـرد مـحلـک');
      if(window.Android&&typeof window.Android.saveAutomaticFileChecked==='function'&&backupOk!==true){window.customAlert('تم إلغاء التصفير','تعذر إنشاء نسخة أمان على الهاتف، لذلك بقي جـرد مـحلـک كما هو.');return false;}
    }
    const hadWholesale=hasWholesale,teamId=String(currentTeam?.id||'');
    if(hadWholesale&&teamId){window.__adtAuditResetEpoch[teamId]=Date.now();window.cancelPendingAuditSaves(teamId);}
    const result=await confirmResetAuditV264.apply(this,arguments);
    if(hadWholesale&&products.every(p=>Number(p.auditQty||0)<=0)){window.markNextCriticalMutation?.('wholesale_unit_audit_v264','reset');window.markAuditIntentionalReset?.('wholesale');window.wholesaleUnitAuditState={};window.saveWholesaleUnitAudit();try{await window.flushCriticalCloudStateKey?.('wholesale_unit_audit_v264');}catch(_){}window.__wholesaleUnitAuditLoadedKey=window.getWholesaleUnitAuditKey?.()||'';window.renderAudit();window.broadcastTeamStateChanged?.('audit_reset');}
    return result;
  };

  /* V266: فصل الصندوق والقطعة في العرض والحفظ والتعديل. */
  window.syncWholesaleUnitEntry=function(p,previous){
    const id=String(p.id),entry=window.wholesaleUnitAuditState[id]||{},pack=Number(entry.pack||0),piece=Number(entry.piece||0),equivalent=pack+piece/Math.max(1,Number(p.packQty||1));
    if(equivalent<=0){delete window.wholesaleUnitAuditState[id];delete window.auditOnlyPrices['wholesale:'+id];p.auditQty=0;}else{const total=pack*Number(entry.packPrice||0)+piece*Number(entry.piecePrice||0);p.auditQty=equivalent;window.auditOnlyPrices['wholesale:'+id]=total/equivalent;}
    entry.updatedAt=Date.now();window.saveAuditOnlyPrices();window.saveWholesaleUnitAudit();window.renderAudit();window.queueWholesaleAuditSave(p,Number(previous||0),Number(p.auditQty||0));window.broadcastTeamStateChanged?.('audit_item');
  };
  window.removeUnifiedWholesaleAudit=async function(index,unit){
    const p=products[index],selected=unit==='piece'?'piece':'pack';if(!p)return;const unitName=selected==='piece'?(p.pieceName||'قطعة'):(p.packName||'صندوق'),ok=await window.showAppConfirm({title:`حذف ${unitName} من الجرد؟`,message:`سيتم حذف جرد «${p.name}» بوحدة ${unitName} فقط.`,confirmText:'حذف',cancelText:'إلغاء',danger:true});if(!ok)return;
    const backupOk=await window.saveWholesaleAuditPhoneSnapshot?.(`قبل حذف ${unitName} من ${String(p.name||'الصنف')}`);
    if(window.Android&&typeof window.Android.saveAutomaticFileChecked==='function'&&backupOk!==true){window.customAlert('تم إلغاء الحذف','تعذر إنشاء نسخة أمان على الهاتف، لذلك لم يتم حذف الصنف من الجرد.');return;}
    window.markNextCriticalMutation?.('wholesale_unit_audit_v264','delete');
    const previous=Number(p.auditQty||0),entry=window.getWholesaleUnitEntry(p);entry.updatedAt=Date.now();entry[selected]=0;window.wholesaleUnitAuditState[String(p.id)]=entry;window.syncWholesaleUnitEntry(p,previous);window.broadcastTeamStateChanged?.('audit_item_delete');
  };
  window.renderAudit=function(){
    if(window.auditMode==='retail')window.auditMode='wholesale';if(window.auditMode!=='wholesale')return renderAuditV264.apply(this,arguments);window.loadWholesaleUnitAudit();
    const lines=[];products.slice().sort((a,b)=>Number(window.getWholesaleUnitEntry(b)?.updatedAt||0)-Number(window.getWholesaleUnitEntry(a)?.updatedAt||0)).forEach(p=>{const e=window.getWholesaleUnitEntry(p),i=products.indexOf(p);if(Number(e.pack||0)>0)lines.push({p,i,unit:'pack',qty:Number(e.pack),price:Number(e.packPrice||0),unitName:p.packName||'صندوق'});if(Number(e.piece||0)>0)lines.push({p,i,unit:'piece',qty:Number(e.piece),price:Number(e.piecePrice||0),unitName:p.pieceName||'قطعة'});});
    const total=lines.reduce((s,x)=>s+x.qty*x.price,0),unique=new Set(lines.map(x=>String(x.p.id))).size,box=document.getElementById('auditList');document.getElementById('auditValueTitle').textContent='الإجمالي';document.getElementById('auditStatSum').textContent=window.formatMoney(total);document.getElementById('auditStatCountSub').innerHTML=`<b>${unique}</b> صنف`;const hub=document.getElementById('hubAuditBadge');if(hub)hub.textContent=`${unique} صنف مجرود`;if(!lines.length){box.innerHTML='<div class="adt-v245-audit-empty"><strong>لم تبدأ الجرد بعد</strong>ابحث عن صنف واختر جرده بالصندوق أو القطعة.</div>';return;}
    box.innerHTML=lines.map(x=>window.buildUnifiedAuditCard({name:x.p.name,unitName:x.unitName,qty:x.qty,price:x.price,productId:String(x.p.id),unit:x.unit})).join('');
  };
  document.getElementById('auditList')?.addEventListener('click',function(event){
    const button=event.target.closest('button[data-audit-action]');if(!button)return;
    const card=button.closest('[data-audit-origin="wholesale"]');if(!card)return;
    const index=products.findIndex(p=>String(p.id)===card.dataset.productId);if(index<0)return;
    const unit=card.dataset.unit==='piece'?'piece':'pack';
    if(button.dataset.auditAction==='edit')window.editUnifiedWholesaleAudit(index,unit);
    else if(button.dataset.auditAction==='delete')window.removeUnifiedWholesaleAudit(index,unit);
  });
  const saveLastAuditSnapshotV266=window.saveLastAuditSnapshot;
  window.saveLastAuditSnapshot=function(){if(window.auditMode!=='wholesale')return saveLastAuditSnapshotV266.apply(this,arguments);window.loadWholesaleUnitAudit();const items=[];products.forEach(p=>{const e=window.getWholesaleUnitEntry(p);if(Number(e.pack||0)>0)items.push({id:String(p.id),name:String(p.name||''),qty:Number(e.pack),buyPrice:Number(e.packPrice||0),unit:'pack',unitName:p.packName||'صندوق'});if(Number(e.piece||0)>0)items.push({id:String(p.id),name:String(p.name||''),qty:Number(e.piece),buyPrice:Number(e.piecePrice||0),unit:'piece',unitName:p.pieceName||'قطعة'});});const snapshot={id:`audit_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,mode:'wholesale',createdAt:new Date().toISOString(),items},history=window.readAuditHistory();history.unshift(snapshot);window.writeAuditHistory(history);window.writeCriticalLocalState('last_wholesale_audit',window.getLastAuditSnapshotKey(),snapshot);return snapshot;};
  const restorePreviousAuditV266=window.restorePreviousAuditToCurrent;
  window.restorePreviousAuditToCurrent=async function(){const snap=window.readLastAuditSnapshot();if(snap?.mode!=='wholesale')return restorePreviousAuditV266.apply(this,arguments);window.wholesaleUnitAuditState={};for(const it of snap.items||[]){const p=products.find(x=>String(x.id)===String(it.id));if(!p)continue;const id=String(p.id),unit=it.unit==='piece'?'piece':'pack',entry=window.wholesaleUnitAuditState[id]||{pack:0,piece:0,packPrice:Number(p.buyPrice||0),piecePrice:Number(p.buyPrice||0)/Math.max(1,Number(p.packQty||1))};entry[unit]+=Number(it.qty||0);entry[unit+'Price']=Number(it.buyPrice||0);window.wholesaleUnitAuditState[id]=entry;}products.forEach(p=>{const e=window.wholesaleUnitAuditState[String(p.id)]||{},equivalent=Number(e.pack||0)+Number(e.piece||0)/Math.max(1,Number(p.packQty||1));p.auditQty=equivalent;});window.markNextCriticalMutation?.('wholesale_unit_audit_v264','restore');window.saveWholesaleUnitAudit();window.closePreviousAuditHistory();window.renderAudit();window.showToast('تم استرجاع الجرد المحفوظ');window.broadcastTeamStateChanged?.('audit_restore');};
  window.askDeletePreviousAuditSnapshot=async function(){const id=String(window.__adtSelectedAuditSnapshotId||'');if(!id)return;const ok=await window.showAppConfirm({title:'حذف هذا الجرد؟',message:'سيتم حذف الجرد المحدد من السجل نهائيًا ولن يظهر مرة أخرى.',confirmText:'حذف نهائي',cancelText:'إلغاء',danger:true});if(!ok)return;const remaining=window.readAuditHistory().filter(x=>String(x.id)!==id);window.writeAuditHistory(remaining);for(const item of [{local:window.getLastAuditSnapshotKey(),state:'last_wholesale_audit'},{local:'adt_last_retail_audit_snapshot_'+String(currentTeam?.id||'local'),state:'last_retail_audit'}]){try{const snap=JSON.parse(localStorage.getItem(item.local)||'null');if(String(snap?.id||'')===id){window.backupCriticalState?.(item.state,snap,'before-user-delete');localStorage.removeItem(item.local);window.saveCriticalCloudState?.(item.state,{deleted:true});}}catch(_){}}window.__adtSelectedAuditSnapshotId=null;window.showAuditHistoryList();window.showToast('تم حذف الجرد المحفوظ نهائيًا');};window.deletePreviousAuditSnapshot=window.askDeletePreviousAuditSnapshot;

  /* V273 Data Safety: محرك مزامنة متسلسل مع رقم مراجعة جانبي ونسخ استرجاع لكل حالة حرجة. */
  window.__adtCloudPending=new Map();window.__adtCloudWriteVersion=0;window.__adtCloudInFlight=new Set();window.__adtLastSyncedAuditState=window.__adtLastSyncedAuditState||{};window.__adtAuditWriteConflictVersion=0;
  window.__adtCriticalStateBackupLimit=30;
  window.__adtGroceryBackupKey=()=>`adt_grocery_audit_backups_${String(currentTeam?.id||'local')}`;
  // لا نكرر 30 نسخة إضافية لجرد سريع داخل localStorage؛ نستخدم مخزن الحالات الحرجة نفسه حتى لا تمتلئ المساحة المحلية.
  window.backupGroceryAuditSnapshot=function(rows,reason='auto'){if(!Array.isArray(rows)||!rows.length)return false;return window.backupCriticalState?.('grocery_audit_v249',rows,reason)===true;};
  window.getCriticalStateMetaLocalKey=stateKey=>`adt_cloud_meta_${String(currentTeam?.id||'local')}__${String(stateKey)}`;
  window.getCriticalStateMetaCloudKey=stateKey=>`${String(stateKey)}__adt_meta_v273`;
  window.getCriticalStateBackupKey=stateKey=>`adt_state_backups_${String(currentTeam?.id||'local')}__${String(stateKey)}`;
  window.cloneCriticalState=value=>{try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}};
  window.criticalStateHash=value=>{try{return window.adtQuickSignature?.(value)||JSON.stringify(value);}catch(_){return String(Date.now());}};
  window.stateHasContent=function(value){if(value===null||value===undefined)return false;if(Array.isArray(value))return value.length>0;if(typeof value==='object')return Object.keys(value).length>0;return true;};
  window.__adtAuditMemoryMeta=window.__adtAuditMemoryMeta||{};
  window.backupCriticalState=function(stateKey,value,reason='auto'){
    if(window.isAuditLocalStateKey?.(stateKey,''))return false;
    try{if(value===undefined)return false;const key=window.getCriticalStateBackupKey(stateKey),raw=JSON.parse(localStorage.getItem(key)||'[]'),list=Array.isArray(raw)?raw:[],payload=JSON.stringify(value);if(list[0]?.payload===payload)return true;list.unshift({at:Date.now(),reason,payload});localStorage.setItem(key,JSON.stringify(list.slice(0,window.__adtCriticalStateBackupLimit)));return true;}catch(e){console.warn('[State Backup] deferred',stateKey,e);return false;}
  };
  window.readCriticalStateMeta=function(stateKey){
    if(window.isAuditLocalStateKey?.(stateKey,''))return window.__adtAuditMemoryMeta[String(stateKey)]||null;
    try{const x=JSON.parse(localStorage.getItem(window.getCriticalStateMetaLocalKey(stateKey))||'null');return x&&Number.isFinite(Number(x.updatedAt))?x:null;}catch(_){return null;}
  };
  window.writeCriticalStateMeta=function(stateKey,meta){
    if(window.isAuditLocalStateKey?.(stateKey,'')){window.__adtAuditMemoryMeta[String(stateKey)]=window.cloneCriticalState?.(meta)||meta;return true;}
    try{localStorage.setItem(window.getCriticalStateMetaLocalKey(stateKey),JSON.stringify(meta));return true;}catch(_){return false;}
  };
  window.markNextCriticalMutation=function(stateKey,kind='normal'){window.__adtNextCriticalMutation={stateKey:String(stateKey),kind:String(kind||'normal'),at:Date.now()};};
  window.makeCriticalStateMeta=function(stateKey,value){const pending=window.__adtNextCriticalMutation&&window.__adtNextCriticalMutation.stateKey===String(stateKey)?window.__adtNextCriticalMutation:null;if(pending)window.__adtNextCriticalMutation=null;return {updatedAt:Date.now(),deviceId:String(getDeviceId?.()||''),hash:window.criticalStateHash(value),stateKey:String(stateKey),mutationKind:String(pending?.kind||'normal'),schema:2};};
  window.mergeLegacyCriticalState=function(stateKey,local,remote){
    if(stateKey==='invoice_history'||stateKey==='audit_history'||stateKey==='grocery_audit_v249'){
      const out=[],seen=new Set();const add=row=>{if(!row||typeof row!=='object')return;const id=String(row.id||window.criticalStateHash(row));if(seen.has(id))return;seen.add(id);out.push(row);};
      (Array.isArray(local)?local:[]).forEach(add);(Array.isArray(remote)?remote:[]).forEach(add);
      if(stateKey==='invoice_history')return out.slice(0,150);if(stateKey==='audit_history')return out.slice(0,30);return out;
    }
    if(['audit_only_prices','retail_audit','sale_audit','wholesale_unit_audit_v264'].includes(stateKey))return {...(remote&&typeof remote==='object'&&!Array.isArray(remote)?remote:{}),...(local&&typeof local==='object'&&!Array.isArray(local)?local:{})};
    if(stateKey==='last_wholesale_audit'||stateKey==='last_retail_audit'){
      if(!local)return remote;if(!remote)return local;const lt=new Date(local.createdAt||0).getTime()||0,rt=new Date(remote.createdAt||0).getTime()||0;return lt>=rt?local:remote;
    }
    return window.stateHasContent(local)?local:remote;
  };
  window.__adtCloudPairRpcSupported=null;
  window.isMissingCloudPairRpcError=function(error){const msg=String(error?.message||error?.details||error?.hint||error||'').toLowerCase();return msg.includes('adt_cloud_state_set_pair')&&(msg.includes('not found')||msg.includes('does not exist')||msg.includes('schema cache')||msg.includes('pgrst202'));};window.isMissingV285PairRpcError=function(error){const msg=String(error?.message||error?.details||error?.hint||error||'').toLowerCase();return msg.includes('adt_cloud_state_set_pair_v285')&&(msg.includes('not found')||msg.includes('does not exist')||msg.includes('schema cache')||msg.includes('pgrst202'));};window.__adtAuditDeltaHasContent=function(stateKey,v){return stateKey==='grocery_audit_v249'?Array.isArray(v)&&v.length>0:stateKey==='wholesale_unit_audit_v264'&&v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>0;};
  window.isUnsupportedCloudMetaError=function(error){const msg=String(error?.message||error?.details||error?.hint||error||'').toLowerCase();return msg.includes('not_allowed')||msg.includes('check constraint')||msg.includes('__adt_meta_v273');};
  window.__adtIsAuditCloudKey=function(stateKey){return stateKey==='grocery_audit_v249'||stateKey==='wholesale_unit_audit_v264';};
  window.__adtAuditDelta=function(stateKey,base,payload){
    try{
      if(stateKey==='grocery_audit_v249'){
        const b=Array.isArray(base)?base:[], p=Array.isArray(payload)?payload:[], bm=new Map(b.map(x=>[String(x?.id||''),x])), out=[];
        for(const row of p){const id=String(row?.id||'');const old=bm.get(id);if(!old||window.criticalStateHash(old)!==window.criticalStateHash(row))out.push(row);}
        return out;
      }
      if(stateKey==='wholesale_unit_audit_v264'){
        const b=base&&typeof base==='object'&&!Array.isArray(base)?base:{}, p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{}, out={};
        for(const [id,row] of Object.entries(p)){if(!Object.prototype.hasOwnProperty.call(b,id)||window.criticalStateHash(b[id])!==window.criticalStateHash(row))out[id]=row;}
        return out;
      }
    }catch(_){}
    return payload;
  };
  window.__adtMergeAuditDelta=function(stateKey,remote,delta){
    if(stateKey==='grocery_audit_v249'){const r=Array.isArray(remote)?remote:[], d=Array.isArray(delta)?delta:[], map=new Map(r.map(x=>[String(x?.id||''),x]));d.forEach(x=>map.set(String(x?.id||''),x));return [...map.values()].sort((a,b)=>Number(b?.updatedAt||0)-Number(a?.updatedAt||0));}
    if(stateKey==='wholesale_unit_audit_v264')return {...(remote&&typeof remote==='object'&&!Array.isArray(remote)?remote:{}),...(delta&&typeof delta==='object'&&!Array.isArray(delta)?delta:{})};
    return remote;
  };
  window.flushCriticalCloudStateKey=async function(stateKey){
    if(window.__adtCloudInFlight.has(stateKey))return false;
    const job=window.__adtCloudPending.get(stateKey);if(!job||!dbClient||!currentTeam||String(currentTeam.id)!==job.teamId||isGhostMode)return false;
    window.__adtCloudInFlight.add(stateKey);let failed=false;
    try{
      // V273 safety SQL provides one atomic RPC for state + revision metadata.
      if(window.__adtCloudPairRpcSupported!==false){
        const rpcName=window.__adtCloudPairRpcV285Supported===false?'adt_cloud_state_set_pair':'adt_cloud_state_set_pair_v285';
        const pair=await dbClient.rpc(rpcName,{p_team_id:job.teamId,p_user_id:getDeviceId(),p_state_key:stateKey,p_state_value:job.payload,p_meta_value:job.meta,p_expected_updated_at:job.expectedUpdatedAt??null});
        if(!pair.error&&pair.data===true){window.__adtCloudPairRpcSupported=true;window.__adtCloudPairRpcV285Supported=true;if(window.__adtCloudPending.get(stateKey)?.version===job.version)window.__adtCloudPending.delete(stateKey);if(window.__adtIsAuditCloudKey(stateKey))window.__adtLastSyncedAuditState[stateKey]=window.cloneCriticalState(job.payload);return true;}
        if(window.__adtIsAuditCloudKey(stateKey)&&!pair.error&&pair.data===false){
          const base=job.basePayload,delta=window.__adtAuditDelta(stateKey,base,job.payload);
          if(window.__adtCloudPending.get(stateKey)?.version===job.version)window.__adtCloudPending.delete(stateKey);
          try{await window.syncCriticalCloudState?.();}catch(_){}
          if(window.__adtIsAuditCloudKey(stateKey)){
            const remote=window.readCriticalLocalState(window.getFullCloudStateDefinitions()[stateKey].local,window.getFullCloudStateDefinitions()[stateKey].fallback);
            const merged=window.__adtMergeAuditDelta(stateKey,remote,delta);
            const remoteMeta=window.readCriticalStateMeta(stateKey);
            if(window.__adtAuditDeltaHasContent?.(stateKey,delta)){window.saveCriticalCloudState(stateKey,merged);if(window.__adtCloudPending.get(stateKey)){window.__adtCloudPending.get(stateKey).expectedUpdatedAt=Number(remoteMeta?.updatedAt||0)||null;}}
          }
          return false;
        }
        if(window.isMissingV285PairRpcError?.(pair.error)){
          window.__adtCloudPairRpcV285Supported=false;
          if(window.__adtIsAuditCloudKey(stateKey))throw new Error('V285_AUDIT_CAS_SQL_REQUIRED');
          console.warn('[Cloud State] V285 CAS RPC not installed; non-audit state may use compatibility mode');
        }else if(window.isMissingCloudPairRpcError(pair.error)){window.__adtCloudPairRpcSupported=false;console.warn('[Cloud State] V273 pair RPC not installed; using compatibility mode');}
        else throw pair.error||new Error('CLOUD_PAIR_SAVE_FAILED');
      }
      // Compatibility mode for databases that have not run V273_DATA_SAFETY_META.sql yet.
      // Once the base value has been written, a metadata retry must never rewrite that older base value over a newer device update.
      if(job.baseSaved!==true){
        const base=await dbClient.rpc('adt_cloud_state_set',{p_team_id:job.teamId,p_user_id:getDeviceId(),p_state_key:stateKey,p_state_value:job.payload});
        if(base.error||base.data!==true)throw base.error||new Error('CLOUD_STATE_SAVE_FAILED');
        job.baseSaved=true;
      }
      const meta=await dbClient.rpc('adt_cloud_state_set',{p_team_id:job.teamId,p_user_id:getDeviceId(),p_state_key:window.getCriticalStateMetaCloudKey(stateKey),p_state_value:job.meta});
      if(meta.error||meta.data!==true){
        if(window.isUnsupportedCloudMetaError(meta.error)){console.warn('[Cloud State] metadata unsupported; base state saved in legacy-safe mode',stateKey);if(window.__adtCloudPending.get(stateKey)?.version===job.version)window.__adtCloudPending.delete(stateKey);return true;}
        throw meta.error||new Error('CLOUD_META_SAVE_FAILED');
      }
      if(window.__adtCloudPending.get(stateKey)?.version===job.version)window.__adtCloudPending.delete(stateKey);return true;
    }catch(e){
      failed=true;
      const current=window.__adtCloudPending.get(stateKey);
      // Never let an older failed request replace a newer pending save.
      if(current&&current.version!==job.version){console.warn('[Cloud State] older failed job discarded',stateKey,job.version,'<',current.version);setTimeout(()=>window.flushCriticalCloudStateKey(stateKey),0);return false;}
      job.attempt=Number(job.attempt||0)+1;window.__adtCloudPending.set(stateKey,job);clearTimeout(job.retryTimer);job.retryTimer=setTimeout(()=>window.flushCriticalCloudStateKey(stateKey),Math.min(30000,1200*Math.pow(2,Math.min(job.attempt,4))));console.warn('[Cloud State] retry queued',stateKey,e);return false;
    }
    finally{window.__adtCloudInFlight.delete(stateKey);const next=window.__adtCloudPending.get(stateKey);if(!failed&&next&&next.version!==job.version)setTimeout(()=>window.flushCriticalCloudStateKey(stateKey),0);}
  };
  window.saveCriticalCloudState=function(stateKey,value){
    if(!stateKey||!currentTeam?.id||isGhostMode)return false;
    const teamId=String(currentTeam.id),version=++window.__adtCloudWriteVersion,payload=window.cloneCriticalState(value),meta=window.makeCriticalStateMeta(stateKey,payload),previous=window.__adtCloudPending.get(stateKey);
    const localMetaBefore=window.readCriticalStateMeta(stateKey),basePayload=window.__adtIsAuditCloudKey?.(stateKey)?window.cloneCriticalState(window.__adtLastSyncedAuditState?.[stateKey]??window.readCriticalLocalState(window.getFullCloudStateDefinitions?.()[stateKey]?.local||'',window.getFullCloudStateDefinitions?.()[stateKey]?.fallback)):null;
    const expectedUpdatedAt=window.__adtIsAuditCloudKey?.(stateKey)?(Number(localMetaBefore?.updatedAt||0)||null):null;
    window.backupCriticalState(stateKey,payload,'local-save');if(stateKey==='grocery_audit_v249'&&Array.isArray(payload))window.backupGroceryAuditSnapshot(payload,'local-save');window.writeCriticalStateMeta(stateKey,meta);window.scheduleAutomaticTeamBackup?.();
    if(previous?.retryTimer)clearTimeout(previous.retryTimer);window.__adtCloudPending.set(stateKey,{teamId,payload,meta,version,attempt:0,baseSaved:false,expectedUpdatedAt,basePayload});clearTimeout(window.__adtCloudStateTimers?.[stateKey]);window.__adtCloudStateTimers=window.__adtCloudStateTimers||{};window.__adtCloudStateTimers[stateKey]=setTimeout(()=>window.flushCriticalCloudStateKey(stateKey),120);return true;
  };
  window.getActiveAuditMeasure=function(stateKey,value){
    if(stateKey==='grocery_audit_v249')return Array.isArray(value)?value.length:0;
    if(stateKey==='wholesale_unit_audit_v264'&&value&&typeof value==='object'&&!Array.isArray(value))return Object.values(value).reduce((n,e)=>n+(Number(e?.pack||0)>0?1:0)+(Number(e?.piece||0)>0?1:0),0);
    return 0;
  };
  window.isExplicitDestructiveAuditMutation=function(meta){return ['delete','reset','restore'].includes(String(meta?.mutationKind||''));};
  window.getFullCloudStateDefinitions=function(){const team=String(currentTeam?.id||'local');return {
    invoice_history:{local:`adt_invoice_history_v104_${team}`,fallback:[]},audit_only_prices:{local:`adt_audit_only_prices_${team}`,fallback:{}},audit_history:{local:window.getAuditHistoryKey?.()||`adt_audit_history_${team}`,fallback:[]},retail_audit:{local:window.getRetailAuditKey?.()||`adt_retail_audit_${team}`,fallback:{}},sale_audit:{local:window.getSaleAuditKey?.()||`adt_sale_audit_v247_${team}`,fallback:{}},grocery_audit_v249:{local:window.getGroceryAuditKey?.()||`adt_grocery_audit_v249_${team}`,fallback:[]},wholesale_unit_audit_v264:{local:window.getWholesaleUnitAuditKey?.()||`adt_wholesale_unit_audit_v264_${team}`,fallback:{}},last_wholesale_audit:{local:`adt_last_audit_snapshot_${team}`,fallback:null},last_retail_audit:{local:`adt_last_retail_audit_snapshot_${team}`,fallback:null}};};
  window.syncCriticalCloudState=async function(){
    if(!currentTeam?.id||!dbClient||isGhostMode)return false;
    const teamId=String(currentTeam.id),defs=window.getFullCloudStateDefinitions(),keys=Object.keys(defs),requestKeys=keys.flatMap(key=>[key,window.getCriticalStateMetaCloudKey(key)]);
    try{
      const {data,error}=await dbClient.rpc('adt_cloud_state_get',{p_team_id:teamId,p_user_id:getDeviceId(),p_state_keys:requestKeys});if(error||!data||typeof data!=='object'||Array.isArray(data))throw error||new Error('INVALID_CLOUD_STATE');
      for(const key of keys){
        if(window.__adtCloudPending.has(key)||window.__adtCloudInFlight?.has(key))continue;
        const def=defs[key],hasRemote=Object.prototype.hasOwnProperty.call(data,key),metaKey=window.getCriticalStateMetaCloudKey(key),remoteMeta=(data[metaKey]&&typeof data[metaKey]==='object')?data[metaKey]:null,localMeta=window.readCriticalStateMeta(key);let local=window.readCriticalLocalState?.(def.local,def.fallback);
        if(local===undefined)local=def.fallback;
        if(!hasRemote){if(localMeta||window.stateHasContent(local))window.saveCriticalCloudState(key,local);continue;}
        const remote=data[key];
        if(remoteMeta&&localMeta&&Number(localMeta.updatedAt||0)>Number(remoteMeta.updatedAt||0)){window.saveCriticalCloudState(key,local);continue;}
        if(remote?.deleted===true){
          const activeAuditDelete=key==='grocery_audit_v249'||key==='wholesale_unit_audit_v264';
          const trustedDelete=!!remoteMeta&&Number(remoteMeta.schema||0)>=2&&window.isExplicitDestructiveAuditMutation(remoteMeta);
          if(activeAuditDelete&&window.stateHasContent(local)&&!trustedDelete){window.backupCriticalState(key,remote,'rejected-untrusted-cloud-delete');window.saveCriticalCloudState(key,local);continue;}
          window.backupCriticalState(key,local,'before-cloud-delete');delete window.__adtCriticalMemoryState?.[def.local];if(remoteMeta)window.writeCriticalStateMeta(key,remoteMeta);continue;
        }
        if(remoteMeta){
          const activeAudit=key==='grocery_audit_v249'||key==='wholesale_unit_audit_v264';
          const localMeasure=activeAudit?window.getActiveAuditMeasure(key,local):0,remoteMeasure=activeAudit?window.getActiveAuditMeasure(key,remote):0;
          const remoteKnownSchema=Number(remoteMeta.schema||0)>=2,explicitDestructive=window.isExplicitDestructiveAuditMutation(remoteMeta);
          if(activeAudit&&window.stateHasContent(local)&&window.criticalStateHash(local)!==window.criticalStateHash(remote)){
            // حماية الجرد: لا نستبدل جرداً محلياً موجوداً بنسخة سحابية ناقصة أو مجهولة المصدر.
            // النقص أو الاستبدال الكامل لا يُسمح به إلا بحذف/تصفير صريح وموثّق.
            if((remoteMeasure<localMeasure&&!explicitDestructive)||(!remoteKnownSchema&&String(remoteMeta.deviceId||'')!==String(getDeviceId?.()||''))){
              window.backupCriticalState(key,remote,'rejected-cloud-shrink');window.saveCriticalCloudState(key,local);continue;
            }
          }
          if(window.criticalStateHash(local)!==window.criticalStateHash(remote))window.backupCriticalState(key,local,'before-newer-cloud-replace');
          if(window.isAuditLocalStateKey?.(key,def.local)){window.__adtCriticalMemoryState[def.local]=JSON.stringify(remote);}else{try{localStorage.setItem(def.local,JSON.stringify(remote));delete window.__adtCriticalMemoryState?.[def.local];}catch(e){window.__adtCriticalMemoryState[def.local]=JSON.stringify(remote);}}
          window.writeCriticalStateMeta(key,remoteMeta);if(window.__adtIsAuditCloudKey?.(key))window.__adtLastSyncedAuditState[key]=window.cloneCriticalState(remote);continue;
        }
        // Migration from older builds without sidecar revision: preserve the union/max-information state instead of blindly overwriting.
        const merged=window.mergeLegacyCriticalState(key,local,remote);window.backupCriticalState(key,local,'legacy-local-before-merge');window.backupCriticalState(key,remote,'legacy-cloud-before-merge');
        if(window.isAuditLocalStateKey?.(key,def.local)){window.__adtCriticalMemoryState[def.local]=JSON.stringify(merged);}else{try{localStorage.setItem(def.local,JSON.stringify(merged));delete window.__adtCriticalMemoryState?.[def.local];}catch(e){window.__adtCriticalMemoryState[def.local]=JSON.stringify(merged);}}
        window.saveCriticalCloudState(key,merged);
      }
      if(String(currentTeam?.id)!==teamId)return false;
      window.loadAuditOnlyPrices?.();window.loadRetailAudit?.();window.loadGroceryAudit?.();window.__wholesaleUnitAuditLoadedKey='';window.loadWholesaleUnitAudit?.();window.renderGroceryAudit?.();window.renderAudit?.();window.renderSavedInvoices?.();return true;
    }catch(e){console.warn('[Full Cloud State] sync deferred; local data retained',e);return false;}
  };
  window.refreshActiveTeamInterface=function(){window.renderHomeStats?.();if(currentTab==='products')window.renderProducts?.();else if(currentTab==='shortages')window.renderShortagesView?.();else if(currentTab==='audit')window.renderAudit?.();else if(currentTab==='groceryAudit')window.renderGroceryAudit?.();else if(currentTab==='damagedGoods')window.renderDamagedGoods?.();else if(currentTab==='moneyRecords')window.renderMoneyParties?.();else if(currentTab==='dailySales')window.renderDailySales?.();else if(currentTab==='debts')window.renderDebtsView?.();};
  window.__adtUnifiedSyncBusy=false;window.__adtUnifiedSyncAgain=false;window.__adtUnifiedLastProducts=0;window.__adtUnifiedLastMembers=0;window.__adtUnifiedLastSuppliers=0;
  window.syncAllTeamInterfaces=async function(options={}){if(window.__adtUnifiedSyncBusy){window.__adtUnifiedSyncAgain=true;return false;}if(!dbClient||!currentTeam||document.hidden)return false;window.__adtUnifiedSyncBusy=true;const teamId=String(currentTeam.id),force=options.force===true,quiet=options.quiet!==false;window.__adtSuppressTransientSyncAlerts=quiet;try{const now=Date.now(),tasks=[];for(const [key,job] of window.__adtCloudPending.entries())if(job.teamId===teamId)tasks.push(window.flushCriticalCloudStateKey(key));if(force){tasks.push(window.fetchProductsFromSupabase());window.__adtUnifiedLastProducts=now;}tasks.push(window.fetchShortagesFromSupabase(),window.fetchDebtsFromSupabase(),window.fetchDamagedGoods?.(false),window.fetchMoneyRecords?.(false),window.syncCriticalCloudState());
      // صلاحيات وميزات العضو تُحدّث من نفس دورة مزامنة المنتجات؛ لا نستخدم مساراً مستقلاً.
      // بهذه الطريقة يصل تغيير باقة الجرد السريع وسماح العضو في نفس دورة البيانات، وبدون أي تدخل في الجلسة.
      tasks.push(window.refreshMemberContextFromServer?.());
if(window.canManageDailySales?.())tasks.push(window.fetchDailySales?.(false));if(force||now-window.__adtUnifiedLastSuppliers>20000){tasks.push(window.syncSupplierDirectory?.(false));window.__adtUnifiedLastSuppliers=now;}const settled=await Promise.allSettled(tasks);if(!currentTeam||String(currentTeam.id)!==teamId)return false;const ok=settled.every(x=>x.status==='fulfilled'&&x.value!==false);window.refreshActiveTeamInterface();window.refreshDeveloperGroceryAuditVisibility?.();window.updateSyncBadge();return ok;}catch(e){console.warn('[Unified Team Sync] deferred',e);window.updateSyncBadge();return false;}finally{window.__adtSuppressTransientSyncAlerts=false;window.__adtUnifiedSyncBusy=false;if(window.__adtUnifiedSyncAgain){window.__adtUnifiedSyncAgain=false;setTimeout(()=>window.syncAllTeamInterfaces({quiet:true}),250);}}};
  window.setupRealtimeSubscription=function(options={}){
    const force = options?.force === true;
    if(!dbClient||!currentTeam||document.hidden)return false;
    const teamId=String(currentTeam.id);
    const socketConnected = ()=>{
      try { return dbClient?.realtime?.isConnected?.() === true; } catch(_) { return false; }
    };
    const channelHealthy = ()=>{
      const state=String(realtimeChannel?.state||'').toLowerCase();
      return !!realtimeChannel && state==='joined' && socketConnected();
    };
    // Idempotent: a healthy channel is reused. A reconnect is serialized.
    if(!force && window.__adtRealtimeTeamId===teamId && channelHealthy()){
      window.__adtRealtimeLastConnected=true;
      window.updateSyncBadge(true);
      return true;
    }
    if(window.__adtRealtimeSetupPromise && window.__adtRealtimeSetupTeamId===teamId) return window.__adtRealtimeSetupPromise;
    window.__adtRealtimeSetupTeamId=teamId;
    const generation=++window.__adtRealtimeGeneration;
    const scheduleReconnect=(reason)=>{
      window.__adtRealtimeLastConnected=false;
      window.updateSyncBadge(false);
      if(window.__adtRealtimeReconnectTimer || document.hidden || !dbClient || !currentTeam || String(currentTeam.id)!==teamId)return;
      const attempt=Math.min(8,Number(window.__adtRealtimeRetryCount||0)+1);
      window.__adtRealtimeRetryCount=attempt;
      window.__adtRealtimeReconnectTimer=setTimeout(()=>{
        window.__adtRealtimeReconnectTimer=null;
        if(!document.hidden && dbClient && currentTeam && String(currentTeam.id)===teamId){
          window.setupRealtimeSubscription({force:true,reason});
        }
      },Math.min(15000,1000*Math.pow(2,attempt-1)));
    };
    window.__adtRealtimeSetupPromise=(async()=>{
      try{
        if(realtimeChannel){
          try{ if(typeof dbClient.removeChannel==='function') await dbClient.removeChannel(realtimeChannel); else await realtimeChannel.unsubscribe?.(); }catch(_){}
          realtimeChannel=null;
        }
        clearTimeout(window.__adtRealtimeReconnectTimer);
        clearInterval(window.__adtRealtimeWatchdog);
        window.__adtRealtimeReconnectTimer=null;
        window.__adtRealtimeWatchdog=null;
        window.__adtRealtimeTeamId='';
        if(!dbClient||!currentTeam||document.hidden||String(currentTeam.id)!==teamId)return false;
        try{ dbClient.realtime?.connect?.(); }catch(_){}
        const refreshAudit=async(payload=null)=>{
          if(document.hidden||!currentTeam||String(currentTeam.id)!==teamId)return;
          try{
            const row=payload?.new||payload?.record||{}; const old=payload?.old||{};
            const key=String(row.state_key||old.state_key||'');
            if(!key)return;
            const defs=window.getFullCloudStateDefinitions?.()||{}; const def=defs[key];
            if(!def)return;
            const value=window.cloneCriticalState?.(row.state_value) ?? row.state_value;
            if(window.__adtCriticalMemoryState)window.__adtCriticalMemoryState[def.local]=JSON.stringify(value);
            if(key==='grocery_audit_v249'){window.groceryAuditEntries=Array.isArray(value)?value:[];window.renderGroceryAudit?.();}
            else if(key==='wholesale_unit_audit_v264'){window.__wholesaleUnitAuditLoadedKey='';window.loadWholesaleUnitAudit?.();window.renderAudit?.();}
            else {window.loadAuditOnlyPrices?.();window.loadRetailAudit?.();window.loadSaleAudit?.();window.renderAudit?.();}
            window.renderAuditedItemsViewer?.();
          }catch(e){console.warn('[Team Realtime] audit apply deferred',e);}
        };
        const refreshPermission=async(payload=null)=>{
          if(document.hidden||!currentTeam||String(currentTeam.id)!==teamId)return;
          try{
            if(window.isDeveloperAccount?.()===true) myPermissions.can_grocery_audit=true;
            else if(payload){
              const row=payload.new||payload.record||{}, old=payload.old||{};
              const own=String(getDeviceId()); const rid=String(row.user_id||row.device_id||row.member_user_id||''); const oid=String(old.user_id||old.device_id||old.member_user_id||'');
              if(rid===own||oid===own) myPermissions.can_grocery_audit=payload.eventType==='DELETE'?false:(row.role==='manager'||(row.status==='approved'&&row.can_grocery_audit===true));
            } else {
              const members=await window.loadTeamMembers?.(); const me=(Array.isArray(members)?members:[]).find(m=>String(m.user_id||m.device_id||'')===String(getDeviceId()));
              if(me) myPermissions.can_grocery_audit=me.role==='manager'||(me.status==='approved'&&me.can_grocery_audit===true);
            }
            window.refreshPaidFeatureCards?.();window.refreshDeveloperGroceryAuditVisibility?.();
            if(currentTab==='groceryAudit'&&!window.isDeveloperGroceryAuditAllowed?.()&&window.userRole!=='manager')window.switchTab?.('home',false);
          }catch(e){console.warn('[Team Realtime] permission apply deferred',e);}
        };
        const refreshTeamFeatures=async(payload)=>{
          if(document.hidden||!currentTeam||String(currentTeam.id)!==teamId)return;
          try{const row=payload?.new||payload?.record||{};if(row.id!=null&&String(row.id)!==teamId)return;if(row.features&&typeof row.features==='object')currentTeam.features={...(currentTeam.features||{}),...row.features};await refreshPermission();window.refreshPaidFeatureCards?.();window.refreshDeveloperGroceryAuditVisibility?.();window.renderHomeStats?.();}catch(e){console.warn('[Team Realtime] feature apply deferred',e);}
        };
        const applyProductRealtimeState=(payload)=>{
          try{
            const event=String(payload?.eventType||payload?.event||'').toUpperCase(), row=payload?.new||payload?.record||{}, old=payload?.old||{};
            const id=String(row.id||old.id||''), eventTeamId=String(row.team_id||old.team_id||'');
            if(!id||(eventTeamId&&eventTeamId!==teamId))return false;
            const receivedAt=Date.now();
            const rawVersion=row.updated_at||old.updated_at||'';
            const parsedVersion=rawVersion?new Date(rawVersion).getTime():0;
            const version=Number.isFinite(parsedVersion)&&parsedVersion>0?parsedVersion:0;
            const marks=window.__adtProductRealtimeWatermarks[teamId]||(window.__adtProductRealtimeWatermarks[teamId]={});
            const index=Array.isArray(products)?products.findIndex(p=>String(p.id)===id):-1;
            const current=index>=0?products[index]:null;
            const currentVersion=Number(current?.updatedAt||0);

            // Realtime messages can arrive after an HTTP response that already contains a newer row.
            // Never allow an older server version to roll a product backwards. If a mutation has no
            // server timestamp while the local row has one, reconcile through HTTP instead of guessing.
            if(current && currentVersion>0 && ((version>0 && version<currentVersion) || (version===0))){
              console.debug('[Team Realtime] ignored stale/untimestamped product event',id,{event,version,currentVersion});
              if(version===0) setTimeout(()=>window.fetchProductsFromSupabase?.(),250);
              return false;
            }
            const previousMark=marks[id];
            if(previousMark&&Number(previousMark.version||0)>0&&version>0&&version<Number(previousMark.version)){
              console.debug('[Team Realtime] ignored out-of-order product event',id,{event,version,previousVersion:previousMark.version});
              return false;
            }

            if(event==='DELETE'){
              if(index>=0)products.splice(index,1);
            }else{
              const base=current||{};
              const item={id:row.id||base.id,name:row.name??base.name,buyPrice:row.buy_price!=null?Number(row.buy_price):Number(base.buyPrice||0),sellPrice:row.sell_price!=null?Number(row.sell_price):Number(base.sellPrice||0),supplier:row.supplier_name!=null?String(row.supplier_name||''):String(base.supplier||productSuppliersMap[row.name||base.name]||''),updatedAt:version||currentVersion||receivedAt,priceUpdatedAt:row.price_updated_at?new Date(row.price_updated_at).getTime():Number(base.priceUpdatedAt||0),auditQty:row.audit_qty!=null?Number(row.audit_qty):Number(base.auditQty||0),packQty:row.pack_qty!=null?Math.max(1,Number(row.pack_qty||1)):Math.max(1,Number(base.packQty||1)),packName:row.pack_name!=null?String(row.pack_name||'صندوق'):String(base.packName||'صندوق'),pieceName:row.piece_name!=null?String(row.piece_name||'قطعة'):String(base.pieceName||'قطعة')};
              if(!item.id||!item.name)return false;if(index>=0)products[index]={...products[index],...item};else products.push(item);
            }
            marks[id]={receivedAt,version:version||currentVersion||receivedAt,deleted:event==='DELETE'};
            void window.writeProductsCache?.(products,teamId);
            window.renderProducts?.();window.renderHomeStats?.();window.renderAudit?.();window.renderGroceryAudit?.();window.renderAuditedItemsViewer?.();
            return true;
          }catch(e){console.warn('[Team Realtime] product apply deferred',e);return false;}
        };
        const token=await window.getRealtimeAuthToken?.();
        if(!token) throw new Error('REALTIME_AUTH_REQUIRED');
        realtimeChannel=dbClient.channel('adt:team:'+teamId,{config:{private:true}});
        const handleBroadcast=(payload)=>{
          if(!payload || document.hidden || !currentTeam || String(currentTeam.id)!==teamId)return;
          const body=payload?.payload||payload?.data||{},table=String(body?.table||'');
          const operation=String(body?.operation||payload?.event||'').toUpperCase();
          const record=body?.record||body?.new_record||{},oldRecord=body?.old_record||body?.old||{};
          if(table==='products'){applyProductRealtimeState({eventType:operation,new:record,old:oldRecord});return;}
          if(table==='adt_team_cloud_state'){const key=String(record?.state_key||oldRecord?.state_key||'');if(key.includes('audit')||key.includes('grocery_audit')||key.includes('wholesale_unit_audit'))void refreshAudit({eventType:operation,new:record,old:oldRecord});return;}
          if(table==='team_members'){void refreshPermission({eventType:operation,new:record,old:oldRecord});return;}
          if(table==='teams'){void refreshTeamFeatures({eventType:operation,new:record,old:oldRecord});}
        };
        realtimeChannel.on('broadcast',{event:'INSERT'},handleBroadcast);
        realtimeChannel.on('broadcast',{event:'UPDATE'},handleBroadcast);
        realtimeChannel.on('broadcast',{event:'DELETE'},handleBroadcast);
        realtimeChannel.subscribe(status=>{
          window.__adtRealtimeLastStatus=status;
          const connected=status==='SUBSCRIBED' && socketConnected();
          window.__adtRealtimeLastConnected=connected;
          if(connected){window.__adtRealtimeRetryCount=0;window.__adtRealtimeTeamId=teamId;window.updateSyncBadge(true);}
          else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')scheduleReconnect(status);
          else window.updateSyncBadge(false);
        });
        window.__adtRealtimeWatchdog=setInterval(()=>{
          if(document.hidden||!dbClient||!currentTeam||String(currentTeam.id)!==teamId)return;
          const socket=socketConnected(), state=String(realtimeChannel?.state||'').toLowerCase();
          if(!socket || state!=='joined' || window.__adtRealtimeLastStatus!=='SUBSCRIBED')scheduleReconnect('watchdog');
          else {window.__adtRealtimeLastConnected=true;window.updateSyncBadge(true);}
        },5000);
        window.__adtRealtimeTeamId=teamId;
        window.__adtRealtimeLastConnected=socketConnected();
        window.updateSyncBadge(window.__adtRealtimeLastConnected && String(realtimeChannel?.state||'').toLowerCase()==='joined');
        return true;
      }catch(e){console.warn('[Team Realtime] setup failed',e);realtimeChannel=null;window.__adtRealtimeTeamId='';scheduleReconnect('setup-error');return false;}
      finally{window.__adtRealtimeSetupPromise=null;window.__adtRealtimeSetupTeamId='';}
    })();
    return window.__adtRealtimeSetupPromise;
  };
  window.broadcastTeamStateChanged=async function(reason='data'){
    try{
      if(!currentTeam)return false;
      const r=String(reason||'');
      // قاعدة البيانات هي مصدر الحدث؛ Trigger السيرفر يرسل Broadcast بعد نجاح الكتابة.
      if(r.startsWith('grocery_audit'))await Promise.allSettled([window.flushCriticalCloudStateKey?.('grocery_audit_v249')]);
      else if(r.startsWith('audit'))await Promise.allSettled([window.flushCriticalCloudStateKey?.('wholesale_unit_audit_v264'),window.flushCriticalCloudStateKey?.('audit_only_prices'),window.flushCriticalCloudStateKey?.('retail_audit')]);
      return true;
    }catch(_){return false;}
  };
  window.manualForceSync=async function(){const icon=document.getElementById('manualSyncIcon');if(icon)icon.style.transform='rotate(360deg)';const ok=await window.syncAllTeamInterfaces({force:true,quiet:false});if(ok)window.showToast('تمت مزامنة جميع واجهات الفريق');else window.customAlert('مزامنة جزئية','تعذر تحديث قسم أو أكثر الآن، وسيعيد التطبيق المحاولة تلقائيًا.');setTimeout(()=>{if(icon)icon.style.transform='rotate(0deg)';},600);};
  // الشبكة تعيد فتح Realtime أولاً؛ HTTP reconciliation يتم فقط عند الحاجة ولا يعيد إنشاء الـChannel.
  window.addEventListener('offline',()=>{window.__adtRealtimeLastConnected=false;window.updateSyncBadge(false);});
  window.addEventListener('online',()=>{window.setupRealtimeSubscription?.({reason:'online'});setTimeout(()=>window.syncAllTeamInterfaces({force:true,quiet:true}),700);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){window.setupRealtimeSubscription?.({reason:'visibility'});setTimeout(()=>window.syncAllTeamInterfaces({force:true,quiet:true}),700);}});
  window.addEventListener('focus',()=>{if(document.hidden)return;window.setupRealtimeSubscription?.();});

})();
