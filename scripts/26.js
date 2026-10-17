
(function(){
  const key='adt_screen_orientation_preference';
  const hasNative=()=>!!(window.Android&&typeof window.Android.setScreenOrientation==='function');
  const pref=()=>{try{return localStorage.getItem(key)||'auto';}catch(_){return 'auto';}};
  const current=()=>{try{return hasNative()&&typeof window.Android.getScreenOrientation==='function'?String(window.Android.getScreenOrientation()||''):((innerWidth>innerHeight)?'landscape':'portrait');}catch(_){return innerWidth>innerHeight?'landscape':'portrait';}};
  window.updateADTOrientationUI=function(){
    const p=pref(),labels={auto:'تلقائي',portrait:'طولي',landscape:'عرضي'},cur=current();
    const state=document.getElementById('adtOrientationDrawerState');if(state)state.textContent=labels[p]||'تلقائي';
    const info=document.getElementById('adtOrientationCurrent');if(info)info.textContent='اتجاه الجهاز الحالي: '+(cur==='landscape'?'عرضي':'طولي');
    document.querySelectorAll('[data-orientation-mode]').forEach(b=>b.classList.toggle('active',b.dataset.orientationMode===p));
    const item=document.getElementById('drawerOrientationItem');if(item)item.style.display=hasNative()?'flex':'none';
  };
  window.openADTOrientationModal=function(){if(!hasNative())return;window.updateADTOrientationUI();if(window.openModalFront)window.openModalFront('adtOrientationModal',5200);else document.getElementById('adtOrientationModal').style.display='flex';};
  window.setADTScreenOrientation=function(mode){
    if(!['auto','portrait','landscape'].includes(mode))mode='auto';
    try{localStorage.setItem(key,mode);}catch(_){}
    try{window.Android?.setScreenOrientation?.(mode);}catch(e){console.warn('[Orientation] native switch failed',e);}
    window.updateADTOrientationUI();setTimeout(window.updateADTOrientationUI,450);
  };
  window.addEventListener('resize',()=>setTimeout(window.updateADTOrientationUI,80));
  window.addEventListener('orientationchange',()=>setTimeout(window.updateADTOrientationUI,160));
  setTimeout(()=>{try{const p=pref();if(hasNative())window.Android.setScreenOrientation(p);}catch(_){}window.updateADTOrientationUI();},900);
})();
