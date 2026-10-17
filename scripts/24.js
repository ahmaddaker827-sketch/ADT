
/* Core audit persistence, continuity, and member permissions. Consolidated into one core path. */
(function(){
  if(window.__adtWholesalePhoneFileBackupReady)return;
  window.__adtWholesalePhoneFileBackupReady=true;
  window.__adtWholesalePhoneFileQueue=Promise.resolve();
  const SNAPSHOT_INTERVAL=10*60*1000;
  const teamToken=()=>String(currentTeam?.id||'local').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48)||'local';
  const snapshotKey=()=>`adt_wholesale_phone_snapshot_at_${String(currentTeam?.id||'local')}`;
  const rawState=()=>JSON.parse(JSON.stringify(window.wholesaleUnitAuditState&&typeof window.wholesaleUnitAuditState==='object'?window.wholesaleUnitAuditState:{}));
  const rowsFromState=state=>{
    const rows=[];
    for(const [id,e0] of Object.entries(state||{})){
      const e=e0&&typeof e0==='object'?e0:{},p=products.find(x=>String(x.id)===String(id));
      const pack=Number(e.pack||0),piece=Number(e.piece||0),packPrice=Number(e.packPrice||0),piecePrice=Number(e.piecePrice||0);
      if(pack>0)rows.push({productId:String(id),name:String(p?.name||''),unit:'pack',unitName:String(p?.packName||'صندوق'),qty:pack,price:packPrice,packQty:Math.max(1,Number(p?.packQty||1))});
      if(piece>0)rows.push({productId:String(id),name:String(p?.name||''),unit:'piece',unitName:String(p?.pieceName||'قطعة'),qty:piece,price:piecePrice,packQty:Math.max(1,Number(p?.packQty||1))});
    }
    return rows;
  };
  const buildPayload=(state,reason)=>{
    const items=rowsFromState(state),unique=new Set(items.map(x=>x.productId)).size,total=items.reduce((sum,x)=>sum+Number(x.qty||0)*Number(x.price||0),0);
    return {
      format:'ADT_WHOLESALE_AUDIT_RECOVERY',version:1,app_version:'2.75.0',created_at:new Date().toISOString(),reason:String(reason||'auto'),
      team:{id:String(currentTeam?.id||''),name:String(currentTeam?.name||'')},
      summary:{products:unique,units:items.length,total:Number(total.toFixed(2))},
      state,items
    };
  };
  const blobBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const v=String(r.result||''),i=v.indexOf(',');i>=0?resolve(v.slice(i+1)):reject(new Error('INVALID_DATA'));};r.onerror=()=>reject(r.error||new Error('READ_FAILED'));r.readAsDataURL(blob);});
  const writeLatest=async payload=>{
    if(!window.Android)return false;
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),base64=await blobBase64(blob),name=`WholesaleAudit-Latest-${teamToken()}.json`;
    if(typeof window.Android.saveAutomaticLatestFileChecked==='function'){
      try{return window.Android.saveAutomaticLatestFileChecked(base64,name,'application/json','جـرد مـحلـک - مباشر')===true;}catch(e){console.warn('[Wholesale Phone Backup] checked latest failed',e);return false;}
    }
    if(typeof window.Android.saveAutomaticLatestFile==='function'){window.Android.saveAutomaticLatestFile(base64,name,'application/json','جـرد مـحلـک - مباشر');return true;}
    return false;
  };
  window.saveWholesaleAuditPhoneSnapshot=async function(reason='نسخة احتياطية'){
    const state=rawState(),payload=buildPayload(state,reason);
    if(!payload.summary.units)return false;
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const ok=await window.saveAutomaticBlob?.(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`WholesaleAudit_${teamToken()}_${stamp}.json`,'جـرد مـحلـک - نسخ');
    if(ok===true){try{localStorage.setItem(snapshotKey(),String(Date.now()));}catch(_){}}
    return ok===true;
  };
  window.queueWholesaleAuditPhoneFile=function(reason='تحديث الجرد'){
    const state=rawState(),payload=buildPayload(state,reason),now=Date.now();
    window.__adtWholesalePhoneFileQueue=window.__adtWholesalePhoneFileQueue.then(async()=>{
      if(!(await writeLatest(payload)))throw new Error('WHOLESALE_LATEST_FILE_SAVE_FAILED');
      let last=0;try{last=Number(localStorage.getItem(snapshotKey())||0);}catch(_){}
      if(payload.summary.units&&(!last||now-last>=SNAPSHOT_INTERVAL)){
        const stamp=new Date(now).toISOString().replace(/[:.]/g,'-');
        const ok=await window.saveAutomaticBlob?.(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`WholesaleAudit_${teamToken()}_${stamp}.json`,'جـرد مـحلـک - نسخ');
        if(ok===true){try{localStorage.setItem(snapshotKey(),String(now));}catch(_){}}
      }
    }).catch(e=>console.warn('[Wholesale Phone Backup] deferred',e));
    return window.__adtWholesalePhoneFileQueue;
  };
  setTimeout(()=>{try{window.loadWholesaleUnitAudit?.();window.verifyAuditContinuity?.('wholesale','startup');}catch(e){console.warn('[Wholesale Phone Backup] startup check deferred',e);}},1900);
})();

(function(){
  if(window.__adtGroceryPhoneFileBackupReady)return;
  window.__adtGroceryPhoneFileBackupReady=true;
  window.__adtGroceryPhoneFileQueue=Promise.resolve();
  const SNAPSHOT_INTERVAL=10*60*1000;
  const cloneRows=()=>JSON.parse(JSON.stringify(Array.isArray(window.groceryAuditEntries)?window.groceryAuditEntries:[]));
  const teamToken=()=>String(currentTeam?.id||'local').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48)||'local';
  const snapshotKey=()=>`adt_grocery_phone_snapshot_at_${String(currentTeam?.id||'local')}`;
  const totalOf=rows=>rows.reduce((sum,x)=>sum+Number(x?.qty||0)*Number(x?.price||0),0);
  const buildPayload=(rows,reason)=>({
    format:'ADT_GROCERY_AUDIT_RECOVERY',version:1,app_version:'2.75.0',created_at:new Date().toISOString(),reason:String(reason||'auto'),
    team:{id:String(currentTeam?.id||''),name:String(currentTeam?.name||'')},
    summary:{count:rows.length,total:Number(totalOf(rows).toFixed(2))},items:rows
  });
  const blobBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const v=String(r.result||''),i=v.indexOf(',');i>=0?resolve(v.slice(i+1)):reject(new Error('INVALID_DATA'));};r.onerror=()=>reject(r.error||new Error('READ_FAILED'));r.readAsDataURL(blob);});
  const writeLatest=async payload=>{
    if(!window.Android)return false;
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),base64=await blobBase64(blob),name=`GroceryAudit-Latest-${teamToken()}.json`;
    if(typeof window.Android.saveAutomaticLatestFileChecked==='function'){
      try{return window.Android.saveAutomaticLatestFileChecked(base64,name,'application/json','جرد سريع - مباشر')===true;}catch(e){console.warn('[Grocery Phone Backup] checked latest failed',e);return false;}
    }
    if(typeof window.Android.saveAutomaticLatestFile==='function'){window.Android.saveAutomaticLatestFile(base64,name,'application/json','جرد سريع - مباشر');return true;}
    return false;
  };
  window.saveGroceryAuditPhoneSnapshot=async function(reason='نسخة احتياطية'){
    const rows=cloneRows();if(!rows.length)return false;
    const payload=buildPayload(rows,reason),stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const ok=await window.saveAutomaticBlob?.(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`GroceryAudit_${teamToken()}_${stamp}.json`,'جرد سريع - نسخ');
    if(ok===true){try{localStorage.setItem(snapshotKey(),String(Date.now()));}catch(_){}}
    return ok===true;
  };
  window.queueGroceryAuditPhoneFile=function(reason='تحديث الجرد'){
    if(window.__adtDisableAuditLocalPersistence)return Promise.resolve(true);
    const rows=cloneRows(),payload=buildPayload(rows,reason),now=Date.now();
    window.__adtGroceryPhoneFileQueue=window.__adtGroceryPhoneFileQueue.then(async()=>{
      if(!(await writeLatest(payload)))throw new Error('GROCERY_LATEST_FILE_SAVE_FAILED');
      let last=0;try{last=Number(localStorage.getItem(snapshotKey())||0);}catch(_){}
      if(rows.length&&(!last||now-last>=SNAPSHOT_INTERVAL)){
        const stamp=new Date(now).toISOString().replace(/[:.]/g,'-');
        const ok=await window.saveAutomaticBlob?.(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`GroceryAudit_${teamToken()}_${stamp}.json`,'جرد سريع - نسخ');
        if(ok===true){try{localStorage.setItem(snapshotKey(),String(now));}catch(_){}}
      }
    }).catch(e=>console.warn('[Grocery Phone Backup] deferred',e));
    return window.__adtGroceryPhoneFileQueue;
  };
  const originalSave=window.saveGroceryAudit;
  if(typeof originalSave==='function')window.saveGroceryAudit=function(){const result=originalSave.apply(this,arguments);window.queueGroceryAuditPhoneFile('تحديث بعد تغيير');return result;};
  const originalLoad=window.loadGroceryAudit;
  if(typeof originalLoad==='function')window.loadGroceryAudit=function(){const result=originalLoad.apply(this,arguments);setTimeout(()=>window.verifyAuditContinuity?.('grocery','load'),0);return result;};
  setTimeout(()=>window.verifyAuditContinuity?.('grocery','startup'),1800);
})();

(function(){
  // V288: جرد سريع سحابي فقط. لا نسخ هاتف، لا استرجاع تلقائي، ولا backup محلي يعيد جرداً قديماً.
  window.backupGroceryAuditSnapshot=function(){return false;};
  window.saveGroceryAuditPhoneSnapshot=async function(){return true;};
  window.queueGroceryAuditPhoneFile=function(){return false;};
})();

(function(){
  if(window.__adtAuditContinuityGuardReady)return;
  window.__adtAuditContinuityGuardReady=true;
  const safeTeam=()=>String(currentTeam?.id||'local').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48)||'local';
  const resetKey=kind=>`adt_${kind}_audit_intentional_reset_${String(currentTeam?.id||'local')}`;
  const parse=v=>{try{return JSON.parse(String(v||''));}catch(_){return null;}};
  const groceryMeasure=rows=>Array.isArray(rows)?rows.length:0;
  const wholesaleMeasure=state=>state&&typeof state==='object'&&!Array.isArray(state)?Object.values(state).reduce((n,e)=>n+(Number(e?.pack||0)>0?1:0)+(Number(e?.piece||0)>0?1:0),0):0;
  const currentMeta=kind=>window.readCriticalStateMeta?.(kind==='grocery'?'grocery_audit_v249':'wholesale_unit_audit_v264')||null;
  window.markAuditIntentionalReset=function(kind){try{localStorage.setItem(resetKey(kind),JSON.stringify({at:Date.now()}));}catch(_){}};
  window.clearAuditIntentionalReset=function(kind){try{localStorage.removeItem(resetKey(kind));}catch(_){}};
  const isResetNewerThan=kind=>{try{const meta=currentMeta(kind);if(['reset','delete'].includes(String(meta?.mutationKind||'')))return true;const r=parse(localStorage.getItem(resetKey(kind)));return !!r&&Number(r?.at||0)>0;}catch(_){return false;}};
  const readExternal=kind=>{
    try{
      if(!window.Android||typeof window.Android.readAutomaticLatestText!=='function')return null;
      const file=kind==='grocery'?`GroceryAudit-Latest-${safeTeam()}.json`:`WholesaleAudit-Latest-${safeTeam()}.json`;
      const category=kind==='grocery'?'جرد سريع - مباشر':'جـرد مـحلـک - مباشر';
      return parse(window.Android.readAutomaticLatestText(file,category));
    }catch(e){console.warn('[Audit Continuity] external read failed',kind,e);return null;}
  };
  const latestLocalBackup=stateKey=>{
    try{const raw=parse(localStorage.getItem(window.getCriticalStateBackupKey?.(stateKey)||''));if(!Array.isArray(raw))return null;for(const item of raw){const p=parse(item?.payload);if(window.stateHasContent?.(p))return {value:p,at:Number(item?.at||0)};}return null;}catch(_){return null;}
  };
  const restoreGrocery=(rows,reason)=>{
    if(!Array.isArray(rows)||!rows.length)return false;
    window.__adtAuditContinuityRestoring=true;
    try{window.groceryAuditEntries=JSON.parse(JSON.stringify(rows));window.markNextCriticalMutation?.('grocery_audit_v249','restore');window.clearAuditIntentionalReset('grocery');window.saveGroceryAudit();window.renderGroceryAudit?.();window.queueGroceryAuditPhoneFile?.(reason||'استرجاع حماية تلقائي');return true;}finally{window.__adtAuditContinuityRestoring=false;}
  };
  const restoreWholesale=(state,reason)=>{
    if(!state||typeof state!=='object'||Array.isArray(state)||!wholesaleMeasure(state))return false;
    window.__adtAuditContinuityRestoring=true;
    try{window.wholesaleUnitAuditState=JSON.parse(JSON.stringify(state));window.__wholesaleUnitAuditLoadedKey=window.getWholesaleUnitAuditKey?.()||'';products.forEach(p=>{const e=window.wholesaleUnitAuditState[String(p.id)]||{},packSize=Math.max(1,Number(p.packQty||1));p.auditQty=Number(e.pack||0)+Number(e.piece||0)/packSize;});window.markNextCriticalMutation?.('wholesale_unit_audit_v264','restore');window.clearAuditIntentionalReset('wholesale');window.saveWholesaleUnitAudit();window.renderAudit?.();window.queueWholesaleAuditPhoneFile?.(reason||'استرجاع حماية تلقائي');return true;}finally{window.__adtAuditContinuityRestoring=false;}
  };
  window.verifyAuditContinuity=function(kind,reason='check'){
    // الحفظ المحلي والنسخ الخارجية للجرد ملغاة؛ لا نُعيد أي جرد قديم تلقائياً.
    if(window.__adtDisableAuditLocalPersistence)return true;
    if(window.__adtAuditContinuityRestoring||!currentTeam?.id)return false;
    try{
      if(kind==='grocery'){
        const local=Array.isArray(window.groceryAuditEntries)?window.groceryAuditEntries:[];
        const lm=groceryMeasure(local),meta=currentMeta('grocery');
        if(lm>0){window.clearAuditIntentionalReset('grocery');const ext=readExternal('grocery'),em=groceryMeasure(ext?.items);if(em>lm&&!window.isExplicitDestructiveAuditMutation?.(meta)){window.backupGroceryAuditSnapshot?.(local,'before-auto-continuity-restore');return restoreGrocery(ext.items,'استرجاع من ملف الهاتف');}window.queueGroceryAuditPhoneFile?.('تأكيد سلامة الجرد');return true;}
        if(isResetNewerThan('grocery'))return true;
        const backup=latestLocalBackup('grocery_audit_v249');if(groceryMeasure(backup?.value)>0)return restoreGrocery(backup.value,'استرجاع من نسخة محلية');
        const ext=readExternal('grocery');if(groceryMeasure(ext?.items)>0)return restoreGrocery(ext.items,'استرجاع من ملف الهاتف');
        return true;
      }
      if(kind==='wholesale'){
        const local=window.wholesaleUnitAuditState&&typeof window.wholesaleUnitAuditState==='object'?window.wholesaleUnitAuditState:{};
        const lm=wholesaleMeasure(local),meta=currentMeta('wholesale');
        if(lm>0){window.clearAuditIntentionalReset('wholesale');const ext=readExternal('wholesale'),em=wholesaleMeasure(ext?.state);if(em>lm&&!window.isExplicitDestructiveAuditMutation?.(meta)){window.backupCriticalState?.('wholesale_unit_audit_v264',local,'before-auto-continuity-restore');return restoreWholesale(ext.state,'استرجاع من ملف الهاتف');}window.queueWholesaleAuditPhoneFile?.('تأكيد سلامة الجرد');return true;}
        if(isResetNewerThan('wholesale'))return true;
        const backup=latestLocalBackup('wholesale_unit_audit_v264');if(wholesaleMeasure(backup?.value)>0)return restoreWholesale(backup.value,'استرجاع من نسخة محلية');
        const ext=readExternal('wholesale');if(wholesaleMeasure(ext?.state)>0)return restoreWholesale(ext.state,'استرجاع من ملف الهاتف');
        return true;
      }
    }catch(e){console.warn('[Audit Continuity] check failed',kind,reason,e);}
    return false;
  };
  // أي جرد غير فارغ بعد إضافة/تعديل يعتبر دورة نشطة، لذلك يلغي علامة التصفير القديمة.
  const grocerySave=window.saveGroceryAudit;
  if(typeof grocerySave==='function')window.saveGroceryAudit=function(){
    const rows=Array.isArray(window.groceryAuditEntries)?window.groceryAuditEntries:[],pending=window.__adtNextCriticalMutation;
    if(!rows.length&&!window.__adtAuditContinuityRestoring&&!['delete','reset','restore'].includes(String(pending?.stateKey==='grocery_audit_v249'?pending?.kind:''))){
      const previous=window.readCriticalLocalState?.(window.getGroceryAuditKey?.()||'',[]);
      if(Array.isArray(previous)&&previous.length){console.error('[Audit Continuity] blocked unexpected grocery wipe');window.groceryAuditEntries=JSON.parse(JSON.stringify(previous));window.renderGroceryAudit?.();window.queueGroceryAuditPhoneFile?.('حماية من مسح غير متوقع');return false;}
    }
    const result=grocerySave.apply(this,arguments);if(rows.length&&!window.__adtAuditContinuityRestoring)window.clearAuditIntentionalReset('grocery');return result;
  };
  const wholesaleSave=window.saveWholesaleUnitAudit;
  if(typeof wholesaleSave==='function')window.saveWholesaleUnitAudit=function(){
    const state=window.wholesaleUnitAuditState&&typeof window.wholesaleUnitAuditState==='object'?window.wholesaleUnitAuditState:{},pending=window.__adtNextCriticalMutation;
    if(!wholesaleMeasure(state)&&!window.__adtAuditContinuityRestoring&&!['delete','reset','restore'].includes(String(pending?.stateKey==='wholesale_unit_audit_v264'?pending?.kind:''))){
      const previous=window.readCriticalLocalState?.(window.getWholesaleUnitAuditKey?.()||'',{});
      if(wholesaleMeasure(previous)){console.error('[Audit Continuity] blocked unexpected wholesale wipe');window.wholesaleUnitAuditState=JSON.parse(JSON.stringify(previous));window.__wholesaleUnitAuditLoadedKey=window.getWholesaleUnitAuditKey?.()||'';window.renderAudit?.();window.queueWholesaleAuditPhoneFile?.('حماية من مسح غير متوقع');return false;}
    }
    const result=wholesaleSave.apply(this,arguments);if(wholesaleMeasure(state)&&!window.__adtAuditContinuityRestoring)window.clearAuditIntentionalReset('wholesale');return result;
  };
  const guardedOpenWholesale=window.openWholesaleAudit;
  if(typeof guardedOpenWholesale==='function')window.openWholesaleAudit=function(){const result=guardedOpenWholesale.apply(this,arguments);setTimeout(()=>window.verifyAuditContinuity('wholesale','open'),0);return result;};
  setTimeout(()=>{try{window.loadGroceryAudit?.();window.verifyAuditContinuity('grocery','guard-startup');window.__wholesaleUnitAuditLoadedKey='';window.loadWholesaleUnitAudit?.();window.verifyAuditContinuity('wholesale','guard-startup');}catch(e){console.warn('[Audit Continuity] startup deferred',e);}},2300);
})();

(function(){
  if(window.__adtGranularAuditPermissionsReady)return;window.__adtGranularAuditPermissionsReady=true;
  const permMap={add:'can_audit_add',editQty:'can_audit_edit_qty',editPrice:'can_audit_edit_price',delete:'can_audit_delete',export:'can_audit_export',reset:'can_audit_reset',restore:'can_audit_restore',deleteHistory:'can_audit_delete_history'};
  window.canAuditAction=function(action){
    if(window.isDeveloperAccount?.()===true||userRole==='manager'||isGhostMode)return true;
    const key=permMap[action];return !!(key&&myPermissions&&myPermissions[key]);
  };
  window.isAuditViewerOnly=function(){return window.canAudit?.()&&!Object.keys(permMap).some(k=>window.canAuditAction(k));};
  window.isGroceryAuditViewerOnly=function(){return window.isDeveloperGroceryAuditAllowed?.()&&!Object.keys(permMap).some(k=>window.canAuditAction(k));};
  const deny=(msg='هذه العملية غير مفعلة لحسابك.')=>window.customAlert('عرض',msg);
  function sameNum(a,b){return Math.abs(Number(a||0)-Number(b||0))<0.000001;}
  window.applyAuditGranularUI=function(){
    const add=window.canAuditAction('add'),editQty=window.canAuditAction('editQty'),editPrice=window.canAuditAction('editPrice'),del=window.canAuditAction('delete'),exp=window.canAuditAction('export'),reset=window.canAuditAction('reset');
    document.body.classList.toggle('adt-audit-view-only',window.isAuditViewerOnly());
    document.body.classList.toggle('adt-grocery-view-only',window.isGroceryAuditViewerOnly());
    const wSave=document.getElementById('wholesaleQuickSaveBtn'),wQty=document.getElementById('wholesaleQuickQty'),wPrice=document.getElementById('wholesaleQuickPrice'),wSearch=document.getElementById('searchAuditBox'),wPack=document.getElementById('wholesalePackBtn'),wPiece=document.getElementById('wholesalePieceBtn'),wQuick=document.querySelector('#pageAudit .adt-v259-wholesale-quick-card');
    const wEdit=String(document.getElementById('wholesaleQuickEditMode')?.value||'add')==='edit';
    if(wQuick)wQuick.style.display=(window.canAudit?.()===true)?'':'none';
    if(wSave){const allow=wEdit?(editQty||editPrice):add;wSave.style.display=allow?'':'none';wSave.disabled=!allow;}
    if(wQty){wQty.readOnly=wEdit?!editQty:!add;wQty.style.opacity=wQty.readOnly?'.62':'1';}
    if(wPrice){wPrice.readOnly=!editPrice;wPrice.style.opacity=wPrice.readOnly?'.62':'1';}
    for(const el of [wSearch,wPack,wPiece])if(el){const lock=wEdit?!(editQty||editPrice):!add;el.disabled=lock;el.style.opacity=lock?'.62':'1';}
    const wActions=document.querySelectorAll('#pageAudit .adt-v245-audit-actions button');wActions.forEach(btn=>{const t=btn.textContent||'';if(t.includes('PDF'))btn.style.display=exp?'':'none';else if(t.includes('تصفير'))btn.style.display=reset?'':'none';});
    const gEdit=!!String(document.getElementById('groceryEditId')?.value||''),gSave=document.getElementById('grocerySaveEntryBtn'),gQty=document.getElementById('groceryQtyInput'),gPrice=document.getElementById('groceryPriceInput'),gName=document.getElementById('groceryNameInput'),gPack=document.getElementById('groceryPackBtn'),gPiece=document.getElementById('groceryPieceBtn'),gQuick=document.querySelector('#pageGroceryAudit .adt-v249-quick-card');
    if(gQuick)gQuick.style.display=(window.canAudit?.()===true)?'':'none';
    if(gSave){const allow=gEdit?(editQty||editPrice):add;gSave.style.display=allow?'':'none';gSave.disabled=!allow;}
    if(gQty){gQty.readOnly=gEdit?!editQty:!add;gQty.style.opacity=gQty.readOnly?'.62':'1';}
    if(gPrice){gPrice.readOnly=!editPrice;gPrice.style.opacity=gPrice.readOnly?'.62':'1';}
    if(gName){gName.readOnly=gEdit?true:!add;gName.style.opacity=gName.readOnly?'.62':'1';}
    for(const el of [gPack,gPiece])if(el){const lock=gEdit||!add;el.disabled=lock;el.style.opacity=lock?'.62':'1';}
    document.querySelectorAll('#pageGroceryAudit .adt-v249-grocery-actions button').forEach(btn=>{const t=btn.textContent||'';if(t.includes('PDF'))btn.style.display=exp?'':'none';else if(t.includes('تصفير'))btn.style.display=reset?'':'none';});
    document.querySelectorAll('[data-audit-action="edit"]').forEach(b=>b.style.display=(editQty||editPrice)?'':'none');
    document.querySelectorAll('[data-audit-action="delete"]').forEach(b=>b.style.display=del?'':'none');
    const restoreBtn=document.getElementById('previousAuditRestoreActionBtn'),deleteHistoryBtn=document.getElementById('previousAuditDeleteActionBtn');
    if(restoreBtn)restoreBtn.style.display=window.canAuditAction('restore')?'':'none';
    if(deleteHistoryBtn)deleteHistoryBtn.style.display=window.canAuditAction('deleteHistory')?'':'none';
  };

  const buildCard=window.buildUnifiedAuditCard;
  if(typeof buildCard==='function')window.buildUnifiedAuditCard=function(x){
    let html=buildCard.apply(this,arguments);
    if(!window.canAuditAction('editQty')&&!window.canAuditAction('editPrice'))html=html.replace(/<button[^>]*data-audit-action="edit"[\s\S]*?<\/button>/,'');
    if(!window.canAuditAction('delete'))html=html.replace(/<button[^>]*data-audit-action="delete"[\s\S]*?<\/button>/,'');
    return html;
  };

  const saveW=window.saveWholesaleQuickAudit;
  window.saveWholesaleQuickAudit=async function(){
    const edit=String(document.getElementById('wholesaleQuickEditMode')?.value||'add')==='edit';
    if(!edit&&!window.canAuditAction('add'))return deny('المدير الرئيسي لم يفعّل لك إضافة أصناف إلى الجرد.');
    if(edit){
      const id=String(document.getElementById('wholesaleQuickProductId')?.value||''),p=products.find(x=>String(x.id)===id),unit=document.getElementById('wholesaleQuickUnit')?.value==='piece'?'piece':'pack',e=p?window.getWholesaleUnitEntry(p):null;
      const nq=Number(document.getElementById('wholesaleQuickQty')?.value),np=Number(document.getElementById('wholesaleQuickPrice')?.value);
      if(e&&!sameNum(nq,e[unit])&&!window.canAuditAction('editQty'))return deny('تعديل العدد غير مفعّل لحسابك.');
      if(e&&!sameNum(np,e[unit+'Price'])&&!window.canAuditAction('editPrice'))return deny('تعديل سعر الجرد غير مفعّل لحسابك.');
      if(!window.canAuditAction('editQty')&&!window.canAuditAction('editPrice'))return deny();
    }else if(!window.canAuditAction('editPrice')){
      const id=String(document.getElementById('wholesaleQuickProductId')?.value||''),p=products.find(x=>String(x.id)===id),unit=document.getElementById('wholesaleQuickUnit')?.value==='piece'?'piece':'pack',e=p?window.getWholesaleUnitEntry(p):null,price=document.getElementById('wholesaleQuickPrice');if(e&&price)price.value=Number(e[unit+'Price']||0).toFixed(2);
    }
    return saveW.apply(this,arguments);
  };
  const editW=window.editUnifiedWholesaleAudit;window.editUnifiedWholesaleAudit=function(){if(!window.canAuditAction('editQty')&&!window.canAuditAction('editPrice'))return deny('تعديل الجرد غير مفعّل لحسابك.');const r=editW.apply(this,arguments);setTimeout(window.applyAuditGranularUI,0);return r;};
  const delW=window.removeUnifiedWholesaleAudit;window.removeUnifiedWholesaleAudit=function(){if(!window.canAuditAction('delete'))return deny('حذف الأصناف من الجرد غير مفعّل لحسابك.');return delW.apply(this,arguments);};
  const resetW=window.confirmResetAudit;window.confirmResetAudit=function(){if(!window.canAuditAction('reset'))return deny('حفظ وتصفير الجرد غير مفعّل لحسابك.');return resetW.apply(this,arguments);};
  const exportW=window.exportAuditPDF;window.exportAuditPDF=function(){if(!window.canAuditAction('export'))return deny('تصدير الجرد PDF غير مفعّل لحسابك.');return exportW.apply(this,arguments);};

  const saveG=window.saveGroceryQuickEntry;window.saveGroceryQuickEntry=function(){
    const id=String(document.getElementById('groceryEditId')?.value||''),old=id?(window.groceryAuditEntries||[]).find(x=>String(x.id)===id):null;
    if(!id&&!window.canAuditAction('add'))return deny('المدير الرئيسي لم يفعّل لك إضافة أصناف إلى الجرد.');
    if(id&&old){const nq=Number(document.getElementById('groceryQtyInput')?.value),np=Number(String(document.getElementById('groceryPriceInput')?.value||'').trim()||0);if(!sameNum(nq,old.qty)&&!window.canAuditAction('editQty'))return deny('تعديل العدد غير مفعّل لحسابك.');if(!sameNum(np,old.price)&&!window.canAuditAction('editPrice'))return deny('تعديل سعر الجرد غير مفعّل لحسابك.');if(!window.canAuditAction('editQty')&&!window.canAuditAction('editPrice'))return deny();}
    if(!id&&!window.canAuditAction('editPrice')){const p=window.findGroceryProductByName?.(document.getElementById('groceryNameInput')?.value||''),unit=document.getElementById('groceryUnitInput')?.value==='piece'?'piece':'pack',price=document.getElementById('groceryPriceInput');if(p&&price){const q=Math.max(1,Number(p.packQty||1)),v=unit==='piece'?Number(p.sellPrice||0)/q:Number(p.sellPrice||0);price.value=v?v.toFixed(2):'';}else if(price)price.value='';}
    const r=saveG.apply(this,arguments);setTimeout(window.applyAuditGranularUI,0);return r;
  };
  const editG=window.editGroceryEntry;window.editGroceryEntry=function(){if(!window.canAuditAction('editQty')&&!window.canAuditAction('editPrice'))return deny('تعديل الجرد غير مفعّل لحسابك.');const r=editG.apply(this,arguments);setTimeout(window.applyAuditGranularUI,0);return r;};
  const delG=window.deleteGroceryEntry;window.deleteGroceryEntry=function(){if(!window.canAuditAction('delete'))return deny('حذف الأصناف من الجرد غير مفعّل لحسابك.');return delG.apply(this,arguments);};
  const resetG=window.resetGroceryAudit;window.resetGroceryAudit=function(){if(!window.canAuditAction('reset'))return deny('حفظ وتصفير الجرد غير مفعّل لحسابك.');return resetG.apply(this,arguments);};
  const exportG=window.exportGroceryAuditPDF;window.exportGroceryAuditPDF=function(){if(!window.canAuditAction('export'))return deny('تصدير الجرد PDF غير مفعّل لحسابك.');return exportG.apply(this,arguments);};
  const restore=window.restorePreviousAuditToCurrent;window.restorePreviousAuditToCurrent=function(){if(!window.canAuditAction('restore'))return deny('استرجاع الجرد المحفوظ غير مفعّل لحسابك.');return restore.apply(this,arguments);};
  const delHistory=window.askDeletePreviousAuditSnapshot||window.deletePreviousAuditSnapshot;if(typeof delHistory==='function'){window.askDeletePreviousAuditSnapshot=function(){if(!window.canAuditAction('deleteHistory'))return deny('حذف الجردات المحفوظة غير مفعّل لحسابك.');return delHistory.apply(this,arguments);};window.deletePreviousAuditSnapshot=window.askDeletePreviousAuditSnapshot;}

  const renderA=window.renderAudit;window.renderAudit=function(){const r=renderA.apply(this,arguments);setTimeout(window.applyAuditGranularUI,0);return r;};
  const renderG=window.renderGroceryAudit;window.renderGroceryAudit=function(){const r=renderG.apply(this,arguments);setTimeout(window.applyAuditGranularUI,0);return r;};
  const clearW=window.clearWholesaleQuickAudit;if(typeof clearW==='function')window.clearWholesaleQuickAudit=function(){const r=clearW.apply(this,arguments);setTimeout(window.applyAuditGranularUI,0);return r;};
  const clearG=window.clearGroceryQuickForm;if(typeof clearG==='function')window.clearGroceryQuickForm=function(){const r=clearG.apply(this,arguments);setTimeout(window.applyAuditGranularUI,0);return r;};
  const memberContext=window.applyCurrentMemberContext;if(typeof memberContext==='function')window.applyCurrentMemberContext=function(){const r=memberContext.apply(this,arguments);setTimeout(window.applyAuditGranularUI,0);return r;};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(window.applyAuditGranularUI,250));
})();
