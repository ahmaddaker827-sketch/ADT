
(function(){
  let lastCheck=0,busy=false;
  window.checkStockControlConfig=async function(){
    if(busy||!currentTeam?.id||!window.getNativeNetworkState())return;
    if(!dbClient)window.initSupabaseClient?.();
    if(!dbClient)return;
    busy=true;lastCheck=Date.now();
    try{
      const {data,error}=await dbClient.rpc('adt_control_get_app_config',{p_app_id:'adt-stock',p_installed_version:window.getInstalledAppVersionCode()});
      if(error||!data)return;
      if(!isGhostMode&&window.isDeveloperAccount?.()){document.getElementById('adtStockControlLock').style.display='none';setTimeout(()=>window.showDeletedTeamNoticeIfAllowed?.(),0);return;}
      const overlay=document.getElementById('adtStockControlLock');
      const locked=data.status==='maintenance'||data.status==='disabled';
      if(overlay){document.getElementById('adtStockControlLockText').textContent=data.maintenance_message||(data.status==='disabled'?'التطبيق متوقف مؤقتاً. تواصل مع المطور.':'التطبيق قيد الصيانة. حاول لاحقاً.');overlay.style.display=locked?'flex':'none';}
      if(locked){const deleted=document.getElementById('teamDeletedModal');if(deleted)deleted.style.display='none';return;}
      setTimeout(()=>window.showDeletedTeamNoticeIfAllowed?.(),0);
      const code=Number(data.version_code),url=String(data.update_url||'').trim();
      if(Number.isInteger(code)&&code>window.getInstalledAppVersionCode()&&/^https:\/\//i.test(url)&&code>Number(window.__adtLatestRelease?.code||0))
        window.showRequiredAppRelease(code,url,data.version_name);
      const notice=data.notice;
      if(notice?.id&&localStorage.getItem('adt_control_notice_seen_'+notice.id)!=='1'){
        localStorage.setItem('adt_control_notice_seen_'+notice.id,'1');
        window.customAlert(notice.title||'رسالة من المطور',notice.message||'');
      }
    }catch(err){console.warn('[ADT Control] config unavailable',err);}finally{busy=false;}
  };
  const previous=window.switchTab;
  window.switchTab=function(name){const result=previous.apply(this,arguments);if(name==='home'&&Date.now()-lastCheck>60000)setTimeout(()=>window.checkStockControlConfig(),500);return result;};
  setInterval(()=>{if(!document.hidden)window.checkStockControlConfig();},3*60*1000);
})();
