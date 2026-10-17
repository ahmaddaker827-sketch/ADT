
(function(){
  const previousHomeStats=window.renderHomeStats;
  if(typeof previousHomeStats==='function')window.renderHomeStats=function(){const result=previousHomeStats.apply(this,arguments);if(!window.isFeatureEnabled('audit'))for(const id of ['hubAuditBadge','hubRetailAuditBadge']){const badge=document.getElementById(id);if(badge)badge.textContent='ميزة مدفوعة';}return result;};
  async function checkAuditSubscription(){
    if(!currentTeam?.id)return false;
    if(!isGhostMode&&window.isDeveloperAccount())return true;
    if(!dbClient)window.initSupabaseClient?.();
    if(!dbClient){window.customAlert('الاتصال مطلوب','اتصل بالإنترنت للتحقق من تفعيل ميزة الجرد للمتجر.');return false;}
    try{
      const {data,error}=await dbClient.rpc('adt_control_audit_entitlement',{p_team_id:String(currentTeam.id)});
      if(error)throw error;
      currentTeam.features={...(currentTeam.features||{}),audit:data===true};
      window.saveCurrentTeamSnapshot();
      window.applyPermissionVisibility();
      if(data!==true){window.promptFeatureLocked('الجرد');return false;}
      return true;
    }catch(error){window.customAlert('تعذر التحقق','تعذر التحقق من اشتراك الجرد. تأكد من الاتصال وتشغيل ملف V212_DEVELOPER_INSIDE_APP_AFTER_V206.sql.');return false;}
  }
  for(const name of ['openWholesaleAudit','openRetailAudit','openAuditTypePicker']){
    const original=window[name];
    window[name]=async function(){if(await checkAuditSubscription())return original.apply(this,arguments);};
  }
})();
