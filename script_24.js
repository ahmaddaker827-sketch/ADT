
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
    if(!window.Android||typeof window.Android.saveAutomaticLatestFile!=='function')return false;
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),base64=await blobBase64(blob);
    window.Android.saveAutomaticLatestFile(base64,`GroceryAudit-Latest-${teamToken()}.json`,'application/json','جرد البقالة - مباشر');
    return true;
  };
  window.saveGroceryAuditPhoneSnapshot=async function(reason='نسخة احتياطية'){
    const rows=cloneRows();if(!rows.length)return false;
    const payload=buildPayload(rows,reason),stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const ok=await window.saveAutomaticBlob?.(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`GroceryAudit_${teamToken()}_${stamp}.json`,'جرد البقالة - نسخ');
    if(ok===true){try{localStorage.setItem(snapshotKey(),String(Date.now()));}catch(_){}}
    return ok===true;
  };
  window.queueGroceryAuditPhoneFile=function(reason='تحديث الجرد'){
    const rows=cloneRows(),payload=buildPayload(rows,reason),now=Date.now();
    window.__adtGroceryPhoneFileQueue=window.__adtGroceryPhoneFileQueue.then(async()=>{
      await writeLatest(payload);
      let last=0;try{last=Number(localStorage.getItem(snapshotKey())||0);}catch(_){}
      if(rows.length&&(!last||now-last>=SNAPSHOT_INTERVAL)){
        const stamp=new Date(now).toISOString().replace(/[:.]/g,'-');
        const ok=await window.saveAutomaticBlob?.(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`GroceryAudit_${teamToken()}_${stamp}.json`,'جرد البقالة - نسخ');
        if(ok===true){try{localStorage.setItem(snapshotKey(),String(now));}catch(_){}}
      }
    }).catch(e=>console.warn('[Grocery Phone Backup] deferred',e));
    return window.__adtGroceryPhoneFileQueue;
  };
  const originalSave=window.saveGroceryAudit;
  if(typeof originalSave==='function')window.saveGroceryAudit=function(){const result=originalSave.apply(this,arguments);window.queueGroceryAuditPhoneFile('تحديث بعد تغيير');return result;};
  const originalLoad=window.loadGroceryAudit;
  if(typeof originalLoad==='function')window.loadGroceryAudit=function(){const result=originalLoad.apply(this,arguments);if((window.groceryAuditEntries||[]).length)window.queueGroceryAuditPhoneFile('تأكيد النسخة الحالية عند الفتح');return result;};
  setTimeout(()=>{if((window.groceryAuditEntries||[]).length)window.queueGroceryAuditPhoneFile('تشغيل التطبيق');},1800);
})();
