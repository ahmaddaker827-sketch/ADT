
(function(){
  'use strict';
  // V285: الجرد مسار مستقل عن مزامنة العضوية. أثناء كتابة صنف لا نعيد رسم
  // الصلاحيات أو نخرج من شاشة الجرد بسبب قراءة سياق مؤقتة.
  const oldCanAudit=window.canAudit;
  window.canAudit=function(){
    const base=oldCanAudit?.apply(this,arguments);
    if(currentTab==='audit' && window.__adtAuditPermissionStable===true) return true;
    return base;
  };
  const oldOpenWholesale=window.openWholesaleAudit;
  if(typeof oldOpenWholesale==='function') window.openWholesaleAudit=function(){
    const result=oldOpenWholesale.apply(this,arguments);
    if(currentTab==='audit' && oldCanAudit?.()) window.__adtAuditPermissionStable=true;
    return result;
  };
  const oldOpenRetail=window.openRetailAudit;
  if(typeof oldOpenRetail==='function') window.openRetailAudit=function(){
    const result=oldOpenRetail.apply(this,arguments);
    if(currentTab==='audit' && oldCanAudit?.()) window.__adtAuditPermissionStable=true;
    return result;
  };
  const oldApplyPermissionVisibility=window.applyPermissionVisibility;
  window.applyPermissionVisibility=function(){
    const auditBusy=Number(window.__adtAuditWriteInProgress||0)>0;
    const wasAudit=currentTab==='audit' && (window.__adtAuditPermissionStable===true || window.canAudit?.());
    try{ if(currentTab==='audit' && window.canAudit?.()) window.__adtAuditPermissionStable=true; }catch(_){}
    const result=oldApplyPermissionVisibility?.apply(this,arguments);
    if(auditBusy && wasAudit && currentTab==='home'){
      try{ window.switchTab('audit',false); window.setAuditMode?.(window.auditMode||'wholesale'); }catch(_){}
    }
    return result;
  };

  const oldRefreshMember=window.refreshMemberContextFromServer;
  if(typeof oldRefreshMember==='function'){
    window.refreshMemberContextFromServer=async function(){
      if(Number(window.__adtAuditWriteInProgress||0)>0) return true;
      return oldRefreshMember.apply(this,arguments);
    };
  }

  const oldValidate=window.validateActiveSession;
  if(typeof oldValidate==='function'){
    window.validateActiveSession=async function(options={}){
      if(Number(window.__adtAuditWriteInProgress||0)>0) return true;
      return oldValidate.apply(this,arguments);
    };
  }

  const oldSync=window.syncAllTeamInterfaces;
  if(typeof oldSync==='function'){
    window.syncAllTeamInterfaces=async function(options={}){
      if(Number(window.__adtAuditWriteInProgress||0)>0) return false;
      return oldSync.apply(this,arguments);
    };
  }

  // لا نسمح بتغيير الشاشة من تطبيق الصلاحيات أثناء الجرد إلا إذا كانت
  // هناك عضوية مفقودة مؤكدة، وليس بسبب استجابة صلاحيات عابرة.
  const oldSwitch=window.switchTab;
  if(typeof oldSwitch==='function'){
    window.switchTab=function(tabName){
      if(tabName==='home' && currentTab==='audit' && Number(window.__adtAuditWriteInProgress||0)>0) return false;
      return oldSwitch.apply(this,arguments);
    };
  }
})();
