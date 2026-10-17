
(function(){
  const previousHomeStats=window.renderHomeStats;
  if(typeof previousHomeStats==='function')window.renderHomeStats=function(){const result=previousHomeStats.apply(this,arguments);window.refreshPaidFeatureCards?.();if(!window.isFeatureEnabled('audit'))for(const id of ['hubAuditBadge','hubRetailAuditBadge']){const badge=document.getElementById(id);if(badge)badge.textContent='ميزة مدفوعة';}return result;};
  let auditEntitlementCache={teamId:'',value:null,at:0,promise:null};
  async function checkAuditSubscription(){
    if(!currentTeam?.id)return false;
    if(!isGhostMode&&window.isDeveloperAccount())return true;
    const teamId=String(currentTeam.id), now=Date.now();
    if(auditEntitlementCache.teamId===teamId && auditEntitlementCache.value!==null && now-auditEntitlementCache.at<15000)return auditEntitlementCache.value===true;
    if(auditEntitlementCache.promise && auditEntitlementCache.teamId===teamId)return auditEntitlementCache.promise;
    if(!dbClient)window.initSupabaseClient?.();
    if(!dbClient){window.customAlert('الاتصال مطلوب','اتصل بالإنترنت للتحقق من تفعيل ميزة الجرد للمتجر.');return false;}
    auditEntitlementCache.teamId=teamId;
    auditEntitlementCache.promise=(async()=>{
      try{
        const {data,error}=await dbClient.rpc('adt_control_audit_entitlement',{p_team_id:teamId});
        if(error)throw error;
        const allowed=data===true;
        auditEntitlementCache.value=allowed;auditEntitlementCache.at=Date.now();
        currentTeam.features={...(currentTeam.features||{}),audit:allowed};
        window.saveCurrentTeamSnapshot();
        window.applyPermissionVisibility();
        if(!allowed){window.promptFeatureLocked('الجرد');return false;}
        return true;
      }catch(error){auditEntitlementCache.value=null;auditEntitlementCache.at=0;window.customAlert('تعذر التحقق','تعذر التحقق من اشتراك الجرد. تأكد من الاتصال ثم حاول مرة أخرى.');return false;}
      finally{auditEntitlementCache.promise=null;}
    })();
    return auditEntitlementCache.promise;
  }
  for(const name of ['openWholesaleAudit','openRetailAudit','openAuditTypePicker']){
    const original=window[name];
    window[name]=async function(){if(await checkAuditSubscription())return original.apply(this,arguments);};
  }
})();
