
(function(){
  const authConfig={
    mgrLogin:{form:'subFormMgrLogin',title:'تسجيل الدخول',subtitle:'مرحباً بك، أدخل بيانات حسابك للمتابعة',focus:'mgrLoginPhoneInput'},
    newTeam:{form:'subFormNewTeam',title:'إنشاء الحساب والمحل',subtitle:'أدخل بيانات المدير والمحل، وكود الاشتراك في آخر خانة',focus:'onboardingUserNameInput'},
    joinTeam:{form:'subFormJoinTeam',title:'الانضمام لـمحـل',subtitle:'أدخل بياناتك وكود المحل لإرسال طلب الانضمام',focus:'memberUserNameInput'}
  };
  window.showSingleAuthView=function(type){
    const config=authConfig[type]||authConfig.mgrLogin,modal=document.getElementById('onboardingModal');if(!modal)return;
    modal.classList.add('adt-single-auth');
    ['subFormMgrLogin','subFormNewTeam','subFormJoinTeam'].forEach(id=>{const form=document.getElementById(id);if(!form)return;form.classList.remove('active','adt-only-auth-form');form.setAttribute('aria-hidden','true');form.style.setProperty('display','none','important');});
    const selected=document.getElementById(config.form);if(selected){selected.classList.add('active','adt-only-auth-form');selected.setAttribute('aria-hidden','false');selected.style.setProperty('display','flex','important');}
    const title=document.getElementById('authLoginTitle'),subtitle=document.getElementById('authLoginSubtitle');if(title)title.textContent=config.title;if(subtitle)subtitle.textContent=config.subtitle;
    modal.style.display='flex';setTimeout(()=>document.getElementById(config.focus)?.focus(),120);
  };
  window.openAuthFromIntro=function(type){localStorage.setItem('adt_intro_completed_v3','1');window.__adtLoginIntroPassed=true;const intro=document.getElementById('adtIntroModal');if(intro)intro.style.display='none';window.showSingleAuthView(type);};
  window.returnToIntroAuthChoice=function(){const auth=document.getElementById('onboardingModal');if(auth){auth.style.display='none';auth.classList.remove('adt-single-auth');}window.adtIntroStage='auth-choice';window.renderMandatoryIntro();};
  window.showAuthAfterMandatoryIntro=function(){
    const completed=localStorage.getItem('adt_intro_completed_v3')==='1';
    const auth=document.getElementById('onboardingModal');
    if(auth){auth.style.display='none';auth.classList.remove('adt-single-auth');}
    if(completed){
      window.__adtLoginIntroPassed=true;
      window.adtIntroStage='auth-choice';
      window.renderMandatoryIntro();
    }else{
      window.__adtLoginIntroPassed=false;
      window.startMandatoryIntro();
    }
    window.releaseStartupSurface?.();
  };
})();
