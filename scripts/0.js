
    const DEFAULT_SB_URL = "https://ufvsxvifbmqsqcugbtlf.supabase.co";
    const DEFAULT_SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdnN4dmlmYm1xc3FjdWdidGxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDU3NjksImV4cCI6MjEwMjI4MTc2OX0.1KL6y2gH3galMeJC2bUGnIl_flKA7pLZY5C6KYTQ_L0";

    // أسرار التطبيق والمطور لا يتم تضمينها في ملف HTML. يتم التحقق منها داخل Supabase فقط.
    let developerSessionPin = '';
    const DEFAULT_MANAGER_NAME = "ATD";

    let sbUrl = DEFAULT_SB_URL;
    let sbKey = DEFAULT_SB_KEY;

    let dbClient = null;
    let realtimeChannel = null;
    // V316 hardening: one Realtime manager per team. These guards prevent
    // lifecycle/focus/resume handlers from tearing down a healthy socket.
    window.__adtRealtimeTeamId = '';
    window.__adtRealtimeSetupPromise = null;
    window.__adtRealtimeReconnectTimer = null;
    window.__adtRealtimeWatchdog = null;
    window.__adtRealtimeLastConnected = false;
    window.__adtRealtimeLastStatus = 'CLOSED';
    window.__adtRealtimeLastSocketCheck = 0;
    window.__adtRealtimeGeneration = 0;
    window.__adtProductRealtimeWatermarks = Object.create(null);
    window.__adtProductCacheWriteQueues = Object.create(null);

    let currentTeam = null;
    let currentTeamMembers = [];
    let userRole = 'member';
    let myPermissions = { can_edit_products:false, can_manage_shortages:false, can_edit_debts:false, can_manage_money_records:false, can_audit:false, can_grocery_audit:false, can_view_cost:false, can_create_invoices:false, can_manage_daily_sales:false, can_audit_add:false, can_audit_edit_qty:false, can_audit_edit_price:false, can_audit_delete:false, can_audit_export:false, can_audit_reset:false, can_audit_restore:false, can_audit_delete_history:false};
    let isGhostMode = false;
    let activeMemberForPerms = null;
    let activeDevTeamForFeatures = null;
    let pendingTeamDeleteId = null;
    let pendingNoticeTeamId = null;
    let pendingDebtDeleteId = null;

    let products = [];
    let debts = { customers: [], suppliers: [] };
    let suppliers = [];
    let damagedGoods = [];
    let moneyParties = [];
    let moneyLogs = [];
    let activeMoneyType = 'supplier';
    let activeMoneyParty = null;
    let shortages = [];
    let productSuppliersMap = {};
    let teamFeaturesMap = (() => {
        try {
            const stored = JSON.parse(localStorage.getItem('atd_team_features_map_v17') || '{}');
            return Object.fromEntries(Object.entries(stored).map(([teamId, features]) => [teamId, {
                shortages: features?.shortages === true,
                invoices: features?.invoices === true,
                audit: features?.audit === true,
                grocery_audit: features?.grocery_audit === true
            }]));
        } catch (_) {
            return {};
        }
    })();
    let activeShortageSupplierFilter = 'all';

    let activeLedgerAccount = null;
    let activeTxForDetail = null;
    let pendingTxDeleteId = null;
    let currentTxType = 'debit';
    
    let activityLogs = JSON.parse(localStorage.getItem('atd_activity_logs_v1') || '[]');
    let currentSelectedSupplier = '';

    let editingIndex = null;
    let auditEditingIndex = null;
    let pendingDeleteType = null;
    let pendingDeleteIndex = null;
    let pendingDeleteProductId = null;
    let productDeleteInProgress = false;
    let lastGeneratedKey = '';
    let isLoggingIn = false;
    let isPrimaryManagerVerified = false;

    window.isPrimaryManager = function() {
        if (isGhostMode || userRole !== 'manager') return false;
        if (isPrimaryManagerVerified) return true;
        try {
            const teamId = String(currentTeam?.id || localStorage.getItem('atd_sales_team_id') || '');
            const deviceId = String(getDeviceId());
            return localStorage.getItem('adt_primary_manager_verified_v141') === `${teamId}:${deviceId}`;
        } catch (_) { return false; }
    };

    window.refreshPrimaryManagerStatus = async function() {
        isPrimaryManagerVerified = false;
        try {
            if (!dbClient || !currentTeam?.id || userRole !== 'manager' || isGhostMode) return false;
            const { data, error } = await dbClient.rpc('adt_is_primary_manager', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId()
            });
            if (error) throw error;
            isPrimaryManagerVerified = data === true;
            const key = 'adt_primary_manager_verified_v141';
            if (isPrimaryManagerVerified) localStorage.setItem(key, `${String(currentTeam.id)}:${String(getDeviceId())}`);
            else localStorage.removeItem(key);
            return isPrimaryManagerVerified;
        } catch (e) {
            console.warn('[Primary Manager] verification failed:', e);
            return window.isPrimaryManager();
        }
    };

    let activeDebtSubTab = 'customer';
    let activeFilter = 'all';
    let currentTab = 'home';

    // فحص صلاحيات المستخدم بدقة (بما فيها صلاحية النواقص الجديدة)
    window.canAudit = function() {
        if(isGhostMode)return false;
        const permission=window.isDeveloperAccount() || userRole === 'manager' || !!myPermissions.can_audit || isGhostMode;
        return permission && window.isFeatureEnabled('audit');
    };
    window.canEditProducts = function() {
        if(isGhostMode)return false;
        // في واجهة المنتجات: غير المدير الرئيسي لا يرى زر التعديل إلا عند تفعيل صلاحية تغيير سعر البيع.
        return window.isDeveloperAccount() || window.isPrimaryManager() || !!myPermissions.can_edit_products || isGhostMode;
    };
    window.canManageShortages = function() {
        if(isGhostMode)return false;
        return window.isDeveloperAccount() || userRole === 'manager' || !!myPermissions.can_manage_shortages || isGhostMode;
    };
    window.canEditDebts = function() {
        if(isGhostMode)return false;
        return window.isDeveloperAccount() || userRole === 'manager' || !!myPermissions.can_edit_debts || isGhostMode;
    };
    window.canManageMoneyRecords = function() {
        if(isGhostMode)return false;
        return window.isDeveloperAccount() || userRole === 'manager' || !!myPermissions.can_manage_money_records || isGhostMode;
    };
    window.canViewCost = function() {
        return window.isDeveloperAccount() || userRole === 'manager' || !!myPermissions.can_view_cost || isGhostMode;
    };
    // سعر الشراء من البيانات الحساسة: تعديله محصور في مدير الفريق الرئيسي فقط.
    // المدير المساعد والمطور في وضع التصفح يستطيعان رؤية السعر حسب صلاحياتهما دون تغييره.
    window.canEditBuyPrice = function() {
        if(isGhostMode)return false;
        return window.isPrimaryManager();
    };
    window.applyBuyPriceEditState = function() {
        const input = document.getElementById('pBuyPrice');
        const group = document.getElementById('pBuyPriceGroup');
        const hint = document.getElementById('pBuyPriceLockHint');
        if (!input) return;
        const canEdit = window.canEditBuyPrice();
        const canView = window.canViewCost();
        input.readOnly = !canEdit;
        input.setAttribute('aria-readonly', canEdit ? 'false' : 'true');
        input.style.opacity = canEdit ? '1' : '.62';
        input.style.cursor = canEdit ? 'text' : 'not-allowed';
        input.title = canEdit ? '' : 'تعديل سعر الشراء متاح لمدير الفريق الرئيسي فقط';
        if (group) group.style.display = (canEdit || canView) ? '' : 'none';
        if (hint) hint.style.display = (!canEdit && canView) ? 'block' : 'none';
    };

    // المدير الرئيسي يرى نموذج الصنف كاملاً. العضو/المدير المساعد المسموح له يرى سعر البيع فقط.
    window.applyProductEditScope = function() {
        const primary = window.canEditBuyPrice();
        const editing = editingIndex !== null;
        const sellOnly = editing && !primary;
        const setDisplay = (id, show, displayValue='') => { const el=document.getElementById(id); if(el) el.style.display=show?displayValue:'none'; };
        setDisplay('pNameGroup', !sellOnly);
        setDisplay('pBuyPriceGroup', !sellOnly);
        setDisplay('pPackagingGroup', !sellOnly);
        setDisplay('pSupplierGroup', !sellOnly);
        const grid=document.getElementById('pPricesGrid');
        if(grid) grid.style.gridTemplateColumns = sellOnly ? '1fr' : '1fr 1fr';
        const title=document.getElementById('modalTitle');
        if(title && sellOnly) title.innerText='تعديل سعر البيع';
    };

    window.isDeveloperAccount = function() {
        try {
            const originalId = String(localStorage.getItem('atd_original_team_id') || '');
            const activeId = String(currentTeam?.id || localStorage.getItem('atd_sales_team_id') || '');
            const teamId = (isGhostMode && originalId) ? originalId : activeId;
            const originRole = isGhostMode ? String(sessionStorage.getItem('adt_ghost_origin_role_v2')||'') : String(userRole||'');
            const activeCode = String(currentTeam?.code || '').trim().toUpperCase();
            const canonicalDevTeam = !isGhostMode && activeCode === '086' && originRole === 'manager';

            let ids = [];
            try { ids = JSON.parse(localStorage.getItem('atd_developer_team_ids') || '[]'); } catch(_) { ids = []; }
            const entitled = localStorage.getItem('atd_dev_device_authorized') === '1';

            // فريق المطور الرسمي هو الفريق ذو الكود 086، بشرط أن يكون الحساب مديراً.
            // مع الاحتفاظ بقائمة المعرفات للتوافق مع الجلسات القديمة والتصفح السري.
            return !!teamId && originRole === 'manager' && (
                canonicalDevTeam ||
                (entitled && Array.isArray(ids) && ids.map(String).includes(teamId))
            );
        } catch(_) { return false; }
    };
    window.isProtectedDeveloperTeamId = function(teamId) {
        try {
            const id = String(teamId || '');
            if (!id) return false;
            const originalId = String(localStorage.getItem('atd_original_team_id') || '');
            const ghostId = isGhostMode ? String(currentTeam?.id || '') : '';
            if (ghostId && id === ghostId && originalId && id !== originalId) return false;
            let developerIds = [];
            try { developerIds = JSON.parse(localStorage.getItem('atd_developer_team_ids') || '[]').map(String); } catch(_) {}
            if (isGhostMode && ghostId) developerIds = developerIds.filter(x => x !== ghostId || x === originalId);
            if (developerIds.includes(id)) return true;
            const activeId = String(currentTeam?.id || localStorage.getItem('atd_sales_team_id') || '');
            return !!(window.isDeveloperAccount() && !isGhostMode && id === activeId);
        } catch(_) { return false; }
    };
    // V174: البلد يحدد العملة تلقائياً، مع الاحتفاظ بإمكانية تغيير العملة لاحقاً من الإعدادات.
    window.ADT_COUNTRY_CURRENCIES = [
      {iso:"LY",country:"ليبيا",countryEn:"Libya",code:"LYD",symbol:"د.ل"},
      {iso:"EG",country:"مصر",countryEn:"Egypt",code:"EGP",symbol:"ج.م"},
      {iso:"SA",country:"المملكة العربية السعودية",countryEn:"Saudi Arabia",code:"SAR",symbol:"ر.س"},
      {iso:"AE",country:"الإمارات العربية المتحدة",countryEn:"United Arab Emirates",code:"AED",symbol:"د.إ"},
      {iso:"KW",country:"الكويت",countryEn:"Kuwait",code:"KWD",symbol:"د.ك"},
      {iso:"QA",country:"قطر",countryEn:"Qatar",code:"QAR",symbol:"ر.ق"},
      {iso:"BH",country:"البحرين",countryEn:"Bahrain",code:"BHD",symbol:"د.ب"},
      {iso:"OM",country:"عُمان",countryEn:"Oman",code:"OMR",symbol:"ر.ع"},
      {iso:"JO",country:"الأردن",countryEn:"Jordan",code:"JOD",symbol:"د.أ"},
      {iso:"IQ",country:"العراق",countryEn:"Iraq",code:"IQD",symbol:"د.ع"},
      {iso:"SY",country:"سوريا",countryEn:"Syria",code:"SYP",symbol:"ل.س"},
      {iso:"LB",country:"لبنان",countryEn:"Lebanon",code:"LBP",symbol:"ل.ل"},
      {iso:"SD",country:"السودان",countryEn:"Sudan",code:"SDG",symbol:"ج.س"},
      {iso:"TN",country:"تونس",countryEn:"Tunisia",code:"TND",symbol:"د.ت"},
      {iso:"DZ",country:"الجزائر",countryEn:"Algeria",code:"DZD",symbol:"د.ج"},
      {iso:"MA",country:"المغرب",countryEn:"Morocco",code:"MAD",symbol:"د.م"},
      {iso:"YE",country:"اليمن",countryEn:"Yemen",code:"YER",symbol:"ر.ي"},
      {iso:"MR",country:"موريتانيا",countryEn:"Mauritania",code:"MRU",symbol:"أ.م"},
      {iso:"DJ",country:"جيبوتي",countryEn:"Djibouti",code:"DJF",symbol:"ف.ج"},
      {iso:"KM",country:"جزر القمر",countryEn:"Comoros",code:"KMF",symbol:"ف.ق"},
      {iso:"SO",country:"الصومال",countryEn:"Somalia",code:"SOS",symbol:"ش.ص"},
      {iso:"PS",country:"الأراضي الفلسطينية",countryEn:"Palestinian Territories",code:"ILS",symbol:"₪"},
      {iso:"TR",country:"تركيا",countryEn:"Türkiye",code:"TRY",symbol:"₺"},
      {iso:"US",country:"الولايات المتحدة",countryEn:"United States",code:"USD",symbol:"$"},
      {iso:"GB",country:"المملكة المتحدة",countryEn:"United Kingdom",code:"GBP",symbol:"£"},
      {iso:"IS",country:"آيسلندا",countryEn:"Iceland",code:"ISK",symbol:"ISK"},
      {iso:"AZ",country:"أذربيجان",countryEn:"Azerbaijan",code:"AZN",symbol:"AZN"},
      {iso:"AM",country:"أرمينيا",countryEn:"Armenia",code:"AMD",symbol:"AMD"},
      {iso:"AW",country:"أروبا",countryEn:"Aruba",code:"AWG",symbol:"AWG"},
      {iso:"AU",country:"أستراليا",countryEn:"Australia",code:"AUD",symbol:"A$"},
      {iso:"AF",country:"أفغانستان",countryEn:"Afghanistan",code:"AFN",symbol:"AFN"},
      {iso:"AL",country:"ألبانيا",countryEn:"Albania",code:"ALL",symbol:"ALL"},
      {iso:"DE",country:"ألمانيا",countryEn:"Germany",code:"EUR",symbol:"€"},
      {iso:"AG",country:"أنتيغوا وبربودا",countryEn:"Antigua & Barbuda",code:"XCD",symbol:"EC$"},
      {iso:"AD",country:"أندورا",countryEn:"Andorra",code:"EUR",symbol:"€"},
      {iso:"AO",country:"أنغولا",countryEn:"Angola",code:"AOA",symbol:"AOA"},
      {iso:"AI",country:"أنغويلا",countryEn:"Anguilla",code:"XCD",symbol:"EC$"},
      {iso:"UY",country:"أورغواي",countryEn:"Uruguay",code:"UYU",symbol:"UYU"},
      {iso:"UZ",country:"أوزبكستان",countryEn:"Uzbekistan",code:"UZS",symbol:"UZS"},
      {iso:"UG",country:"أوغندا",countryEn:"Uganda",code:"UGX",symbol:"UGX"},
      {iso:"UA",country:"أوكرانيا",countryEn:"Ukraine",code:"UAH",symbol:"₴"},
      {iso:"IE",country:"أيرلندا",countryEn:"Ireland",code:"EUR",symbol:"€"},
      {iso:"ET",country:"إثيوبيا",countryEn:"Ethiopia",code:"ETB",symbol:"Br"},
      {iso:"ER",country:"إريتريا",countryEn:"Eritrea",code:"ERN",symbol:"ERN"},
      {iso:"ES",country:"إسبانيا",countryEn:"Spain",code:"EUR",symbol:"€"},
      {iso:"EE",country:"إستونيا",countryEn:"Estonia",code:"EUR",symbol:"€"},
      {iso:"IL",country:"إسرائيل",countryEn:"Israel",code:"ILS",symbol:"₪"},
      {iso:"SZ",country:"إسواتيني",countryEn:"Eswatini",code:"SZL",symbol:"SZL"},
      {iso:"ID",country:"إندونيسيا",countryEn:"Indonesia",code:"IDR",symbol:"Rp"},
      {iso:"IR",country:"إيران",countryEn:"Iran",code:"IRR",symbol:"IRR"},
      {iso:"IT",country:"إيطاليا",countryEn:"Italy",code:"EUR",symbol:"€"},
      {iso:"AR",country:"الأرجنتين",countryEn:"Argentina",code:"ARS",symbol:"AR$"},
      {iso:"TF",country:"الأقاليم الجنوبية الفرنسية",countryEn:"French Southern Territories",code:"EUR",symbol:"€"},
      {iso:"IO",country:"الإقليم البريطاني في المحيط الهندي",countryEn:"British Indian Ocean Territory",code:"USD",symbol:"$"},
      {iso:"EC",country:"الإكوادور",countryEn:"Ecuador",code:"USD",symbol:"$"},
      {iso:"BR",country:"البرازيل",countryEn:"Brazil",code:"BRL",symbol:"R$"},
      {iso:"PT",country:"البرتغال",countryEn:"Portugal",code:"EUR",symbol:"€"},
      {iso:"BA",country:"البوسنة والهرسك",countryEn:"Bosnia & Herzegovina",code:"BAM",symbol:"BAM"},
      {iso:"CZ",country:"التشيك",countryEn:"Czechia",code:"CZK",symbol:"Kč"},
      {iso:"ME",country:"الجبل الأسود",countryEn:"Montenegro",code:"EUR",symbol:"€"},
      {iso:"DK",country:"الدانمرك",countryEn:"Denmark",code:"DKK",symbol:"kr"},
      {iso:"CV",country:"الرأس الأخضر",countryEn:"Cape Verde",code:"CVE",symbol:"CVE"},
      {iso:"SV",country:"السلفادور",countryEn:"El Salvador",code:"USD",symbol:"$"},
      {iso:"SN",country:"السنغال",countryEn:"Senegal",code:"XOF",symbol:"F CFA"},
      {iso:"SE",country:"السويد",countryEn:"Sweden",code:"SEK",symbol:"kr"},
      {iso:"EH",country:"الصحراء الغربية",countryEn:"Western Sahara",code:"MAD",symbol:"د.م"},
      {iso:"CN",country:"الصين",countryEn:"China",code:"CNY",symbol:"¥"},
      {iso:"GA",country:"الغابون",countryEn:"Gabon",code:"XAF",symbol:"FCFA"},
      {iso:"VA",country:"الفاتيكان",countryEn:"Vatican City",code:"EUR",symbol:"€"},
      {iso:"PH",country:"الفلبين",countryEn:"Philippines",code:"PHP",symbol:"₱"},
      {iso:"CM",country:"الكاميرون",countryEn:"Cameroon",code:"XAF",symbol:"FCFA"},
      {iso:"CG",country:"الكونغو - برازافيل",countryEn:"Congo - Brazzaville",code:"XAF",symbol:"FCFA"},
      {iso:"CD",country:"الكونغو - كينشاسا",countryEn:"Congo - Kinshasa",code:"CDF",symbol:"CDF"},
      {iso:"MX",country:"المكسيك",countryEn:"Mexico",code:"MXN",symbol:"MX$"},
      {iso:"NO",country:"النرويج",countryEn:"Norway",code:"NOK",symbol:"kr"},
      {iso:"AT",country:"النمسا",countryEn:"Austria",code:"EUR",symbol:"€"},
      {iso:"NE",country:"النيجر",countryEn:"Niger",code:"XOF",symbol:"F CFA"},
      {iso:"IN",country:"الهند",countryEn:"India",code:"INR",symbol:"₹"},
      {iso:"JP",country:"اليابان",countryEn:"Japan",code:"JPY",symbol:"¥"},
      {iso:"GR",country:"اليونان",countryEn:"Greece",code:"EUR",symbol:"€"},
      {iso:"PG",country:"بابوا غينيا الجديدة",countryEn:"Papua New Guinea",code:"PGK",symbol:"PGK"},
      {iso:"PY",country:"باراغواي",countryEn:"Paraguay",code:"PYG",symbol:"PYG"},
      {iso:"PK",country:"باكستان",countryEn:"Pakistan",code:"PKR",symbol:"₨"},
      {iso:"PW",country:"بالاو",countryEn:"Palau",code:"USD",symbol:"$"},
      {iso:"BB",country:"بربادوس",countryEn:"Barbados",code:"BBD",symbol:"BBD"},
      {iso:"BM",country:"برمودا",countryEn:"Bermuda",code:"BMD",symbol:"BMD"},
      {iso:"BN",country:"بروناي",countryEn:"Brunei",code:"BND",symbol:"BND"},
      {iso:"BE",country:"بلجيكا",countryEn:"Belgium",code:"EUR",symbol:"€"},
      {iso:"BG",country:"بلغاريا",countryEn:"Bulgaria",code:"BGN",symbol:"BGN"},
      {iso:"BZ",country:"بليز",countryEn:"Belize",code:"BZD",symbol:"BZD"},
      {iso:"BD",country:"بنغلاديش",countryEn:"Bangladesh",code:"BDT",symbol:"৳"},
      {iso:"PA",country:"بنما",countryEn:"Panama",code:"PAB",symbol:"PAB"},
      {iso:"BJ",country:"بنين",countryEn:"Benin",code:"XOF",symbol:"F CFA"},
      {iso:"BT",country:"بوتان",countryEn:"Bhutan",code:"INR",symbol:"₹"},
      {iso:"BW",country:"بوتسوانا",countryEn:"Botswana",code:"BWP",symbol:"BWP"},
      {iso:"PR",country:"بورتوريكو",countryEn:"Puerto Rico",code:"USD",symbol:"$"},
      {iso:"BF",country:"بوركينا فاسو",countryEn:"Burkina Faso",code:"XOF",symbol:"F CFA"},
      {iso:"BI",country:"بوروندي",countryEn:"Burundi",code:"BIF",symbol:"BIF"},
      {iso:"PL",country:"بولندا",countryEn:"Poland",code:"PLN",symbol:"zł"},
      {iso:"BO",country:"بوليفيا",countryEn:"Bolivia",code:"BOB",symbol:"BOB"},
      {iso:"PF",country:"بولينيزيا الفرنسية",countryEn:"French Polynesia",code:"XPF",symbol:"CFPF"},
      {iso:"PE",country:"بيرو",countryEn:"Peru",code:"PEN",symbol:"PEN"},
      {iso:"BY",country:"بيلاروس",countryEn:"Belarus",code:"BYN",symbol:"BYN"},
      {iso:"TH",country:"تايلاند",countryEn:"Thailand",code:"THB",symbol:"฿"},
      {iso:"TW",country:"تايوان",countryEn:"Taiwan",code:"TWD",symbol:"NT$"},
      {iso:"TM",country:"تركمانستان",countryEn:"Turkmenistan",code:"TMT",symbol:"TMT"},
      {iso:"TT",country:"ترينيداد وتوباغو",countryEn:"Trinidad & Tobago",code:"TTD",symbol:"TTD"},
      {iso:"TD",country:"تشاد",countryEn:"Chad",code:"XAF",symbol:"FCFA"},
      {iso:"CL",country:"تشيلي",countryEn:"Chile",code:"CLP",symbol:"CLP"},
      {iso:"TZ",country:"تنزانيا",countryEn:"Tanzania",code:"TZS",symbol:"TZS"},
      {iso:"TG",country:"توغو",countryEn:"Togo",code:"XOF",symbol:"F CFA"},
      {iso:"TV",country:"توفالو",countryEn:"Tuvalu",code:"AUD",symbol:"A$"},
      {iso:"TK",country:"توكيلاو",countryEn:"Tokelau",code:"NZD",symbol:"NZ$"},
      {iso:"TO",country:"تونغا",countryEn:"Tonga",code:"TOP",symbol:"TOP"},
      {iso:"TL",country:"تيمور - ليشتي",countryEn:"Timor-Leste",code:"USD",symbol:"$"},
      {iso:"JM",country:"جامايكا",countryEn:"Jamaica",code:"JMD",symbol:"JMD"},
      {iso:"GI",country:"جبل طارق",countryEn:"Gibraltar",code:"GIP",symbol:"GIP"},
      {iso:"AX",country:"جزر آلاند",countryEn:"Åland Islands",code:"EUR",symbol:"€"},
      {iso:"BS",country:"جزر البهاما",countryEn:"Bahamas",code:"BSD",symbol:"BSD"},
      {iso:"MQ",country:"جزر المارتينيك",countryEn:"Martinique",code:"EUR",symbol:"€"},
      {iso:"MV",country:"جزر المالديف",countryEn:"Maldives",code:"MVR",symbol:"MVR"},
      {iso:"UM",country:"جزر الولايات المتحدة النائية",countryEn:"U.S. Outlying Islands",code:"USD",symbol:"$"},
      {iso:"PN",country:"جزر بيتكيرن",countryEn:"Pitcairn Islands",code:"NZD",symbol:"NZ$"},
      {iso:"TC",country:"جزر توركس وكايكوس",countryEn:"Turks & Caicos Islands",code:"USD",symbol:"$"},
      {iso:"SB",country:"جزر سليمان",countryEn:"Solomon Islands",code:"SBD",symbol:"SBD"},
      {iso:"FO",country:"جزر فارو",countryEn:"Faroe Islands",code:"DKK",symbol:"kr"},
      {iso:"FK",country:"جزر فوكلاند",countryEn:"Falkland Islands",code:"FKP",symbol:"FKP"},
      {iso:"VI",country:"جزر فيرجن الأمريكية",countryEn:"U.S. Virgin Islands",code:"USD",symbol:"$"},
      {iso:"VG",country:"جزر فيرجن البريطانية",countryEn:"British Virgin Islands",code:"USD",symbol:"$"},
      {iso:"KY",country:"جزر كايمان",countryEn:"Cayman Islands",code:"KYD",symbol:"KYD"},
      {iso:"CK",country:"جزر كوك",countryEn:"Cook Islands",code:"NZD",symbol:"NZ$"},
      {iso:"CC",country:"جزر كوكوس (كيلينغ)",countryEn:"Cocos (Keeling) Islands",code:"AUD",symbol:"A$"},
      {iso:"MH",country:"جزر مارشال",countryEn:"Marshall Islands",code:"USD",symbol:"$"},
      {iso:"MP",country:"جزر ماريانا الشمالية",countryEn:"Northern Mariana Islands",code:"USD",symbol:"$"},
      {iso:"WF",country:"جزر والس وفوتونا",countryEn:"Wallis & Futuna",code:"XPF",symbol:"CFPF"},
      {iso:"BV",country:"جزيرة بوفيه",countryEn:"Bouvet Island",code:"NOK",symbol:"kr"},
      {iso:"CX",country:"جزيرة كريسماس",countryEn:"Christmas Island",code:"AUD",symbol:"A$"},
      {iso:"IM",country:"جزيرة مان",countryEn:"Isle of Man",code:"GBP",symbol:"£"},
      {iso:"NF",country:"جزيرة نورفولك",countryEn:"Norfolk Island",code:"AUD",symbol:"A$"},
      {iso:"HM",country:"جزيرة هيرد وجزر ماكدونالد",countryEn:"Heard & McDonald Islands",code:"AUD",symbol:"A$"},
      {iso:"CF",country:"جمهورية أفريقيا الوسطى",countryEn:"Central African Republic",code:"XAF",symbol:"FCFA"},
      {iso:"DO",country:"جمهورية الدومينيكان",countryEn:"Dominican Republic",code:"DOP",symbol:"DOP"},
      {iso:"ZA",country:"جنوب أفريقيا",countryEn:"South Africa",code:"ZAR",symbol:"R"},
      {iso:"SS",country:"جنوب السودان",countryEn:"South Sudan",code:"SSP",symbol:"SSP"},
      {iso:"GE",country:"جورجيا",countryEn:"Georgia",code:"GEL",symbol:"GEL"},
      {iso:"GS",country:"جورجيا الجنوبية وجزر ساندويتش الجنوبية",countryEn:"South Georgia & South Sandwich Islands",code:"GBP",symbol:"£"},
      {iso:"JE",country:"جيرسي",countryEn:"Jersey",code:"GBP",symbol:"£"},
      {iso:"DM",country:"دومينيكا",countryEn:"Dominica",code:"XCD",symbol:"EC$"},
      {iso:"RW",country:"رواندا",countryEn:"Rwanda",code:"RWF",symbol:"RWF"},
      {iso:"RU",country:"روسيا",countryEn:"Russia",code:"RUB",symbol:"₽"},
      {iso:"RO",country:"رومانيا",countryEn:"Romania",code:"RON",symbol:"lei"},
      {iso:"RE",country:"روينيون",countryEn:"Réunion",code:"EUR",symbol:"€"},
      {iso:"ZM",country:"زامبيا",countryEn:"Zambia",code:"ZMW",symbol:"ZMW"},
      {iso:"ZW",country:"زيمبابوي",countryEn:"Zimbabwe",code:"USD",symbol:"$"},
      {iso:"CI",country:"ساحل العاج",countryEn:"Côte d’Ivoire",code:"XOF",symbol:"F CFA"},
      {iso:"WS",country:"ساموا",countryEn:"Samoa",code:"WST",symbol:"WST"},
      {iso:"AS",country:"ساموا الأمريكية",countryEn:"American Samoa",code:"USD",symbol:"$"},
      {iso:"BL",country:"سان بارتليمي",countryEn:"St. Barthélemy",code:"EUR",symbol:"€"},
      {iso:"PM",country:"سان بيير ومكويلون",countryEn:"St. Pierre & Miquelon",code:"EUR",symbol:"€"},
      {iso:"MF",country:"سان مارتن",countryEn:"St. Martin",code:"EUR",symbol:"€"},
      {iso:"SM",country:"سان مارينو",countryEn:"San Marino",code:"EUR",symbol:"€"},
      {iso:"VC",country:"سانت فنسنت وجزر غرينادين",countryEn:"St. Vincent & Grenadines",code:"XCD",symbol:"EC$"},
      {iso:"KN",country:"سانت كيتس ونيفيس",countryEn:"St. Kitts & Nevis",code:"XCD",symbol:"EC$"},
      {iso:"LC",country:"سانت لوسيا",countryEn:"St. Lucia",code:"XCD",symbol:"EC$"},
      {iso:"SX",country:"سانت مارتن",countryEn:"Sint Maarten",code:"XCG",symbol:"Cg."},
      {iso:"SH",country:"سانت هيلينا",countryEn:"St. Helena",code:"SHP",symbol:"SHP"},
      {iso:"ST",country:"ساو تومي وبرينسيبي",countryEn:"São Tomé & Príncipe",code:"STN",symbol:"STN"},
      {iso:"LK",country:"سريلانكا",countryEn:"Sri Lanka",code:"LKR",symbol:"LKR"},
      {iso:"SJ",country:"سفالبارد وجان ماين",countryEn:"Svalbard & Jan Mayen",code:"NOK",symbol:"kr"},
      {iso:"SK",country:"سلوفاكيا",countryEn:"Slovakia",code:"EUR",symbol:"€"},
      {iso:"SI",country:"سلوفينيا",countryEn:"Slovenia",code:"EUR",symbol:"€"},
      {iso:"SG",country:"سنغافورة",countryEn:"Singapore",code:"SGD",symbol:"S$"},
      {iso:"SR",country:"سورينام",countryEn:"Suriname",code:"SRD",symbol:"SRD"},
      {iso:"CH",country:"سويسرا",countryEn:"Switzerland",code:"CHF",symbol:"CHF"},
      {iso:"SL",country:"سيراليون",countryEn:"Sierra Leone",code:"SLE",symbol:"SLE"},
      {iso:"SC",country:"سيشل",countryEn:"Seychelles",code:"SCR",symbol:"SCR"},
      {iso:"RS",country:"صربيا",countryEn:"Serbia",code:"RSD",symbol:"RSD"},
      {iso:"TJ",country:"طاجيكستان",countryEn:"Tajikistan",code:"TJS",symbol:"TJS"},
      {iso:"GM",country:"غامبيا",countryEn:"Gambia",code:"GMD",symbol:"GMD"},
      {iso:"GH",country:"غانا",countryEn:"Ghana",code:"GHS",symbol:"GHS"},
      {iso:"GD",country:"غرينادا",countryEn:"Grenada",code:"XCD",symbol:"EC$"},
      {iso:"GL",country:"غرينلاند",countryEn:"Greenland",code:"DKK",symbol:"kr"},
      {iso:"GT",country:"غواتيمالا",countryEn:"Guatemala",code:"GTQ",symbol:"GTQ"},
      {iso:"GP",country:"غوادلوب",countryEn:"Guadeloupe",code:"EUR",symbol:"€"},
      {iso:"GU",country:"غوام",countryEn:"Guam",code:"USD",symbol:"$"},
      {iso:"GF",country:"غويانا الفرنسية",countryEn:"French Guiana",code:"EUR",symbol:"€"},
      {iso:"GY",country:"غيانا",countryEn:"Guyana",code:"GYD",symbol:"GYD"},
      {iso:"GG",country:"غيرنزي",countryEn:"Guernsey",code:"GBP",symbol:"£"},
      {iso:"GN",country:"غينيا",countryEn:"Guinea",code:"GNF",symbol:"GNF"},
      {iso:"GQ",country:"غينيا الاستوائية",countryEn:"Equatorial Guinea",code:"XAF",symbol:"FCFA"},
      {iso:"GW",country:"غينيا بيساو",countryEn:"Guinea-Bissau",code:"XOF",symbol:"F CFA"},
      {iso:"VU",country:"فانواتو",countryEn:"Vanuatu",code:"VUV",symbol:"VUV"},
      {iso:"FR",country:"فرنسا",countryEn:"France",code:"EUR",symbol:"€"},
      {iso:"VE",country:"فنزويلا",countryEn:"Venezuela",code:"VES",symbol:"VES"},
      {iso:"FI",country:"فنلندا",countryEn:"Finland",code:"EUR",symbol:"€"},
      {iso:"VN",country:"فيتنام",countryEn:"Vietnam",code:"VND",symbol:"₫"},
      {iso:"FJ",country:"فيجي",countryEn:"Fiji",code:"FJD",symbol:"FJD"},
      {iso:"CY",country:"قبرص",countryEn:"Cyprus",code:"EUR",symbol:"€"},
      {iso:"KG",country:"قيرغيزستان",countryEn:"Kyrgyzstan",code:"KGS",symbol:"KGS"},
      {iso:"KZ",country:"كازاخستان",countryEn:"Kazakhstan",code:"KZT",symbol:"KZT"},
      {iso:"NC",country:"كاليدونيا الجديدة",countryEn:"New Caledonia",code:"XPF",symbol:"CFPF"},
      {iso:"HR",country:"كرواتيا",countryEn:"Croatia",code:"EUR",symbol:"€"},
      {iso:"KH",country:"كمبوديا",countryEn:"Cambodia",code:"KHR",symbol:"KHR"},
      {iso:"CA",country:"كندا",countryEn:"Canada",code:"CAD",symbol:"C$"},
      {iso:"CU",country:"كوبا",countryEn:"Cuba",code:"CUP",symbol:"CUP"},
      {iso:"CW",country:"كوراساو",countryEn:"Curaçao",code:"XCG",symbol:"Cg."},
      {iso:"KR",country:"كوريا الجنوبية",countryEn:"South Korea",code:"KRW",symbol:"₩"},
      {iso:"KP",country:"كوريا الشمالية",countryEn:"North Korea",code:"KPW",symbol:"KPW"},
      {iso:"CR",country:"كوستاريكا",countryEn:"Costa Rica",code:"CRC",symbol:"CRC"},
      {iso:"CO",country:"كولومبيا",countryEn:"Colombia",code:"COP",symbol:"COP"},
      {iso:"KI",country:"كيريباتي",countryEn:"Kiribati",code:"AUD",symbol:"A$"},
      {iso:"KE",country:"كينيا",countryEn:"Kenya",code:"KES",symbol:"KSh"},
      {iso:"LV",country:"لاتفيا",countryEn:"Latvia",code:"EUR",symbol:"€"},
      {iso:"LA",country:"لاوس",countryEn:"Laos",code:"LAK",symbol:"LAK"},
      {iso:"LU",country:"لوكسمبورغ",countryEn:"Luxembourg",code:"EUR",symbol:"€"},
      {iso:"LR",country:"ليبيريا",countryEn:"Liberia",code:"LRD",symbol:"LRD"},
      {iso:"LT",country:"ليتوانيا",countryEn:"Lithuania",code:"EUR",symbol:"€"},
      {iso:"LI",country:"ليختنشتاين",countryEn:"Liechtenstein",code:"CHF",symbol:"CHF"},
      {iso:"LS",country:"ليسوتو",countryEn:"Lesotho",code:"ZAR",symbol:"R"},
      {iso:"MT",country:"مالطا",countryEn:"Malta",code:"EUR",symbol:"€"},
      {iso:"ML",country:"مالي",countryEn:"Mali",code:"XOF",symbol:"F CFA"},
      {iso:"MY",country:"ماليزيا",countryEn:"Malaysia",code:"MYR",symbol:"RM"},
      {iso:"YT",country:"مايوت",countryEn:"Mayotte",code:"EUR",symbol:"€"},
      {iso:"MG",country:"مدغشقر",countryEn:"Madagascar",code:"MGA",symbol:"MGA"},
      {iso:"MK",country:"مقدونيا الشمالية",countryEn:"North Macedonia",code:"MKD",symbol:"MKD"},
      {iso:"MW",country:"ملاوي",countryEn:"Malawi",code:"MWK",symbol:"MWK"},
      {iso:"MO",country:"منطقة ماكاو الإدارية الخاصة",countryEn:"Macao SAR China",code:"MOP",symbol:"MOP"},
      {iso:"MN",country:"منغوليا",countryEn:"Mongolia",code:"MNT",symbol:"MNT"},
      {iso:"MU",country:"موريشيوس",countryEn:"Mauritius",code:"MUR",symbol:"MUR"},
      {iso:"MZ",country:"موزمبيق",countryEn:"Mozambique",code:"MZN",symbol:"MZN"},
      {iso:"MD",country:"مولدوفا",countryEn:"Moldova",code:"MDL",symbol:"MDL"},
      {iso:"MC",country:"موناكو",countryEn:"Monaco",code:"EUR",symbol:"€"},
      {iso:"MS",country:"مونتسرات",countryEn:"Montserrat",code:"XCD",symbol:"EC$"},
      {iso:"MM",country:"ميانمار (بورما)",countryEn:"Myanmar (Burma)",code:"MMK",symbol:"MMK"},
      {iso:"FM",country:"ميكرونيزيا",countryEn:"Micronesia",code:"USD",symbol:"$"},
      {iso:"NA",country:"ناميبيا",countryEn:"Namibia",code:"ZAR",symbol:"R"},
      {iso:"NR",country:"ناورو",countryEn:"Nauru",code:"AUD",symbol:"A$"},
      {iso:"NP",country:"نيبال",countryEn:"Nepal",code:"NPR",symbol:"NPR"},
      {iso:"NG",country:"نيجيريا",countryEn:"Nigeria",code:"NGN",symbol:"₦"},
      {iso:"NI",country:"نيكاراغوا",countryEn:"Nicaragua",code:"NIO",symbol:"NIO"},
      {iso:"NZ",country:"نيوزيلندا",countryEn:"New Zealand",code:"NZD",symbol:"NZ$"},
      {iso:"NU",country:"نيوي",countryEn:"Niue",code:"NZD",symbol:"NZ$"},
      {iso:"HT",country:"هايتي",countryEn:"Haiti",code:"HTG",symbol:"HTG"},
      {iso:"HN",country:"هندوراس",countryEn:"Honduras",code:"HNL",symbol:"HNL"},
      {iso:"HU",country:"هنغاريا",countryEn:"Hungary",code:"HUF",symbol:"HUF"},
      {iso:"NL",country:"هولندا",countryEn:"Netherlands",code:"EUR",symbol:"€"},
      {iso:"BQ",country:"هولندا الكاريبية",countryEn:"Caribbean Netherlands",code:"USD",symbol:"$"},
      {iso:"HK",country:"هونغ كونغ الصينية (منطقة إدارية خاصة)",countryEn:"Hong Kong SAR China",code:"HKD",symbol:"HK$"}
    ];
    window.ADT_ARAB_CURRENCIES = window.ADT_COUNTRY_CURRENCIES;
    window.getAppCountry = function(){
      const iso=localStorage.getItem('adt_app_country_iso')||'LY';
      return window.ADT_COUNTRY_CURRENCIES.find(x=>x.iso===iso)||window.ADT_COUNTRY_CURRENCIES[0];
    };
    window.getAppCurrency = function(){
      const code=localStorage.getItem('adt_app_currency_code')||window.getAppCountry().code||'LYD';
      const savedIso=localStorage.getItem('adt_app_country_iso')||'';
      const byCountry=window.ADT_COUNTRY_CURRENCIES.find(x=>x.iso===savedIso && x.code===code);
      return byCountry||window.ADT_COUNTRY_CURRENCIES.find(x=>x.code===code)||window.ADT_COUNTRY_CURRENCIES[0];
    };
    window.getCurrencySymbol = function(){ return window.getAppCurrency().symbol; };
    window.formatMoney = function(value){ return Number(value||0).toFixed(2)+' '+window.getCurrencySymbol(); };
    window.applyAppCurrency = function(){
      const symbol=window.getCurrencySymbol();
      document.querySelectorAll('.app-currency-symbol').forEach(el=>el.textContent=symbol);
      const daily=document.getElementById('dailySalesCurrentTotal'); if(daily && /^\s*0(?:\.0+)?/.test(daily.textContent||'')) daily.textContent='0.00 '+symbol;
      window.renderProducts?.(); window.renderHomeStats?.(); window.renderAudit?.(); window.renderInvoiceItems?.(); window.renderSavedInvoices?.(); window.renderDailySales?.();
    };
    window.openCurrencyModal = function(){
      const box=document.getElementById('appCurrencyOptions'); if(!box)return;
      const current=window.getAppCurrency().code;
      window.pendingAppCurrencyCode=current;
      const seen=new Set();
      const choices=window.ADT_COUNTRY_CURRENCIES.filter(x=>{const k=x.code+'|'+x.symbol;if(seen.has(k))return false;seen.add(k);return true;});
      box.innerHTML=choices.map(x=>`<button type="button" class="adt-currency-option ${x.code===current?'active':''}" data-code="${x.code}" onclick="window.selectAppCurrency('${x.code}',this)"><span><b>${x.country}</b><small>${x.code}</small></span><strong>${x.symbol}</strong></button>`).join('');
      window.openModalFront?.('currencyModal',10040) || (document.getElementById('currencyModal').style.display='flex');
    };
    window.selectAppCurrency=function(code,button){
      window.pendingAppCurrencyCode=code;
      document.querySelectorAll('#appCurrencyOptions .adt-currency-option').forEach(x=>x.classList.toggle('active',x===button));
    };
    window.saveAppCurrency = function(){
      const code=window.pendingAppCurrencyCode||window.getAppCurrency().code||'LYD';
      localStorage.setItem('adt_app_currency_code',code); window.closeModal('currencyModal'); window.applyAppCurrency(); window.showToast?.('تم تغيير عملة التطبيق','success');
    };

    window.canCreateInvoices = function() { return window.isDeveloperAccount() || userRole==='manager' || userRole==='sub_manager' || !!myPermissions.can_create_invoices || isGhostMode; };
    window.canManageDailySales = function() { return window.isDeveloperAccount() || userRole==='manager' || !!myPermissions.can_manage_daily_sales || isGhostMode; };
    window.canSettleDailySales = function() { return window.isDeveloperAccount() || userRole==='manager' || isGhostMode; };
    window.canRemoveShortages = function() { return window.isDeveloperAccount() || userRole==='manager' || isGhostMode; };
    window.canEditSellPrice = function() { return window.isDeveloperAccount() || window.isPrimaryManager() || !!myPermissions.can_edit_products || isGhostMode; };
    window.canCreateSuppliers = function() { return window.isDeveloperAccount() || userRole==='manager' || userRole==='sub_manager' || isGhostMode; };
    window.useManagerProductQuickSearch = function() {
        return userRole === 'manager' || window.isDeveloperAccount() || isGhostMode;
    };

    window.getPermissionsFromMember = function(member) {
        const m = member || {};
        return {
            can_edit_products: !!m.can_edit_products,
            can_manage_shortages: !!m.can_manage_shortages,
            can_edit_debts: !!m.can_edit_debts,
            can_manage_money_records: !!m.can_manage_money_records,
            can_audit: !!m.can_audit,
            can_grocery_audit: !!m.can_grocery_audit,
            can_view_cost: !!m.can_view_cost,
            can_create_invoices: !!m.can_create_invoices,
            can_manage_daily_sales: !!m.can_manage_daily_sales,
            can_audit_add: !!m.can_audit_add,
            can_audit_edit_qty: !!m.can_audit_edit_qty,
            can_audit_edit_price: !!m.can_audit_edit_price,
            can_audit_delete: !!m.can_audit_delete,
            can_audit_export: !!m.can_audit_export,
            can_audit_reset: !!m.can_audit_reset,
            can_audit_restore: !!m.can_audit_restore,
            can_audit_delete_history: !!m.can_audit_delete_history
        };
    };

    // جرد سريع: مصدر القرار واضح ومستقل عن جرد محلك.
    // الفريق يحدد هل الميزة متاحة، وصلاحية العضو تحدد هل العضو يراها ويستخدمها.
    window.isDeveloperGroceryAuditAllowed = function() {
        if (isGhostMode || !currentTeam) return false;
        if (!window.isFeatureEnabled('grocery_audit')) return false;
        if (window.isDeveloperAccount() || userRole === 'manager') return true;
        return myPermissions.can_grocery_audit === true;
    };
    window.refreshDeveloperGroceryAuditVisibility = function() {
        const card = document.getElementById('hubGroceryAuditCard');
        if (card) card.style.display = window.isDeveloperGroceryAuditAllowed() ? '' : 'none';
    };

    window.applyPermissionVisibility = function() {
        document.body.classList.toggle('adt-member-home', userRole === 'member' && !isGhostMode);
        const auditAllowed = window.isDeveloperAccount() || userRole === 'manager' || !!myPermissions.can_audit || isGhostMode;
        const debtsAllowed = window.canEditDebts();
        const shortagesAllowed = window.canManageShortages();
        const dailySalesAllowed = window.canManageDailySales();
        const setCardVisible = (id, allowed) => {
            const el = document.getElementById(id);
            if (el) el.style.display = allowed ? '' : 'none';
        };
        setCardVisible('hubWholesaleAuditCard', auditAllowed);
        setCardVisible('hubRetailAuditCard', auditAllowed);
        setCardVisible('hubDebtsCard', debtsAllowed);
        const primaryFinanceAllowed = window.canEditBuyPrice();
        const moneyRecordsAllowed = window.canManageMoneyRecords();
        setCardVisible('hubSupplierPaymentsCard', moneyRecordsAllowed);
        setCardVisible('hubFridayCollectionsCard', moneyRecordsAllowed);
        setCardVisible('hubDamagedGoodsCard', primaryFinanceAllowed);
        setCardVisible('hubShortagesCard', shortagesAllowed);
        // زر المبيعات اليومية يظل ظاهراً للجميع؛ الدخول يحتاج صلاحية مفعلة.
        setCardVisible('hubDailySalesCard', true);
        // إدارة الفريق متاحة من قائمة الثلاث شرط فقط لتخفيف الشاشة الرئيسية.
        const dailyBadge=document.getElementById('hubDailySalesBadge');
        if (dailyBadge && !dailySalesAllowed) dailyBadge.textContent='تحتاج صلاحية';

        const deniedCurrentPage =
            (currentTab === 'audit' && !window.canAudit()) ||
            (currentTab === 'debts' && !debtsAllowed) ||
            ((currentTab === 'moneyRecords' || currentTab === 'moneyPartyDetail') && !moneyRecordsAllowed) ||
            (currentTab === 'damagedGoods' && !primaryFinanceAllowed) ||
            (currentTab === 'shortages' && !shortagesAllowed) ||
            (currentTab === 'dailySales' && !dailySalesAllowed);
        if (deniedCurrentPage && typeof window.switchTab === 'function') {
            window.switchTab('home', false);
        }
    };

    window.applyCurrentMemberContext = function(member, teamData) {
        if (!member || typeof member !== 'object') return false;
        // سياق صالح من الخادم يثبت أن العضوية موجودة.
        window.clearDeletedTeamNotice?.();
        if (teamData && typeof teamData === 'object') currentTeam = { ...(currentTeam || {}), ...teamData };
        userRole = member.role || userRole || 'member';
        myPermissions = window.getPermissionsFromMember(member);
        localStorage.setItem('atd_sales_user_role', userRole);

        const serverName = String(member.user_name || '').trim();
        if (!isGhostMode && serverName) {
            localStorage.setItem('atd_sales_user_name', serverName);
            window.currentUserName = serverName;
            if (userRole === 'manager' && currentTeam) currentTeam.manager_name = serverName;
            window.updateUserProfileUI?.(serverName);
        }

        try {
            if (currentTeam?.id) {
                localStorage.setItem(`adt_member_permissions__${String(currentTeam.id)}`, JSON.stringify(myPermissions));
                window.saveCurrentTeamSnapshot?.();
            }
        } catch (_) {}
        window.applyPermissionVisibility();
        // مزامنة دليل الموردين بعد ثبوت هوية العضو والفريق، مع إبقاء الكاش عند فشل الشبكة.
        setTimeout(() => window.syncSupplierDirectory?.(false), 250);
        setTimeout(() => window.syncCriticalCloudState?.(), 450);
        // بيانات الفريق القادمة من الخادم تشمل انتهاء/تجميد الاشتراك؛ طبّق القفل فوراً لكل الأدوار.
        window.checkTeamLockState?.();
        return true;
    };

    window.refreshMemberContextFromServer = async function() {
        if (!dbClient || !currentTeam?.id || isGhostMode) return true;
        const teamId = String(currentTeam.id);
        try {
            const { data: ctx, error } = await dbClient.rpc('adt_get_my_context', {
                p_team_id: teamId,
                p_user_id: getDeviceId()
            });
            if (error) throw error;
            if (!ctx?.team || !ctx?.member || String(currentTeam?.id) !== teamId) return false;
            if (ctx.member.status !== 'approved' && ctx.member.role !== 'manager') return false;
            window.applyCurrentMemberContext(ctx.member, ctx.team);
            return true;
        } catch (error) {
            console.warn('[Member Profile Sync] deferred:', error);
            return false;
        }
    };

    // نافذة اختيار المورد الداكنة المخصصة (تمنع القائمة البيضاء نهائياً)
    window.openSupplierPickerModal = function() {
        const listContainer = document.getElementById('supplierPickerOptionsList');
        if (!listContainer) return;

        let html = `
            <div class="custom-picker-item ${currentSelectedSupplier === '' ? 'selected' : ''}" onclick="window.selectSupplierFromPicker('')">
                <span>-- بدون مورد محدد --</span>
                ${currentSelectedSupplier === '' ? '<svg class="svg-icon" style="width:16px; height:16px; color:var(--primary);" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
            </div>
        `;

        suppliers.forEach(s => {
            let isSel = (currentSelectedSupplier === s.name);
            const safeArg = window.safeUrlArg(s.name);
            html += `
                <div class="custom-picker-item ${isSel ? 'selected' : ''}" onclick="window.selectSupplierFromPicker(decodeURIComponent('${safeArg}'))">
                    <span>${window.escapeHtml(s.name)}</span>
                    ${isSel ? '<svg class="svg-icon" style="width:16px; height:16px; color:var(--primary);" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
                </div>
            `;
        });

        listContainer.innerHTML = html;
        document.getElementById('supplierPickerModal').style.display = 'flex';
    };

    window.selectSupplierFromPicker = function(suppName) {
        currentSelectedSupplier = suppName;
        const textSpan = document.getElementById('pSupplierSelectedText');
        if (textSpan) {
            textSpan.innerText = suppName ? suppName : '-- بدون مورد محدد --';
        }
        window.closeModal('supplierPickerModal');
    };

    // دوال الحفظ والمساعدة
    window.__adtEmergencyMemoryCache = window.__adtEmergencyMemoryCache || {};
    window.saveStoredData = function(key, val) {
        const payload = JSON.stringify(val);
        try {
            localStorage.setItem(key, payload);
            delete window.__adtEmergencyMemoryCache[key];
            return true;
        } catch(e) {
            window.__adtEmergencyMemoryCache[key] = payload;
            console.error('[Storage] local save failed:', key, e);
            window.scheduleAutomaticTeamBackup?.();
            if (!window.__adtStorageWarningShown) {
                window.__adtStorageWarningShown = true;
                window.showToast?.('مساحة الحفظ المحلية ممتلئة؛ تم الاحتفاظ بالبيانات في الذاكرة وسيحاول التطبيق حفظ نسخة احتياطية');
            }
            return false;
        }
    };

    // كاش محلي منفصل لكل فريق حتى لا تختلط بيانات متجر بمتجر آخر.
    window.teamCacheKey = function(base, teamId) {
        const id = String(teamId || currentTeam?.id || localStorage.getItem('atd_sales_team_id') || 'local');
        return `${base}__${id}`;
    };

    window.readTeamCache = function(base, fallback, teamId) {
        try {
            const cacheKey = window.teamCacheKey(base, teamId);
            const emergency = window.__adtEmergencyMemoryCache?.[cacheKey];
            if (emergency !== undefined) return JSON.parse(emergency);
            const raw = localStorage.getItem(cacheKey);
            if (raw !== null) return JSON.parse(raw);
            // ترحيل هادئ من الكاش القديم مرة واحدة للفريق المحفوظ حالياً فقط.
            const savedId = localStorage.getItem('atd_sales_team_id');
            if (savedId && String(savedId) === String(teamId || savedId)) {
                const legacy = localStorage.getItem(base);
                if (legacy !== null) {
                    const parsed = JSON.parse(legacy);
                    localStorage.setItem(window.teamCacheKey(base, teamId), JSON.stringify(parsed));
                    return parsed;
                }
            }
        } catch(e) { console.warn('[Cache] read failed:', base, e); }
        return fallback;
    };

    const PRODUCT_CACHE_BASE = 'atd_sales_products_v17';
    const PRODUCT_CACHE_DB_NAME = 'adt_stock_products_cache_v1';
    const PRODUCT_CACHE_DB_VERSION = 1;
    const PRODUCT_CACHE_STORE = 'products_by_team';

    // المنتجات الكبيرة تحفظ في IndexedDB بدلاً من localStorage محدود المساحة.
    window.openProductsCacheDatabase = function() {
        if (window.__adtProductsCacheDbPromise) return window.__adtProductsCacheDbPromise;
        window.__adtProductsCacheDbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('INDEXED_DB_UNAVAILABLE'));
                return;
            }
            let settled = false;
            const request = window.indexedDB.open(PRODUCT_CACHE_DB_NAME, PRODUCT_CACHE_DB_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(PRODUCT_CACHE_STORE)) {
                    database.createObjectStore(PRODUCT_CACHE_STORE, { keyPath: 'teamId' });
                }
            };
            request.onsuccess = () => {
                const database = request.result;
                if (settled) { database.close(); return; }
                settled = true;
                database.onversionchange = () => database.close();
                resolve(database);
            };
            request.onerror = () => {
                if (settled) return;
                settled = true;
                reject(request.error || new Error('INDEXED_DB_OPEN_FAILED'));
            };
            request.onblocked = () => {
                if (settled) return;
                settled = true;
                reject(new Error('INDEXED_DB_OPEN_BLOCKED'));
            };
        }).catch(error => {
            window.__adtProductsCacheDbPromise = null;
            throw error;
        });
        return window.__adtProductsCacheDbPromise;
    };

    // نخزن حقول المنتج المستخدمة فعلياً فقط حتى يظل الكاش خفيفاً ونظيفاً.
    window.normalizeProductForCache = function(product) {
        const p = product || {};
        return {
            id: String(p.id || ''),
            name: String(p.name || ''),
            buyPrice: Number(p.buyPrice || 0),
            sellPrice: Number(p.sellPrice || 0),
            supplier: String(p.supplier || ''),
            updatedAt: Number(p.updatedAt || 0),
            priceUpdatedAt: Number(p.priceUpdatedAt || 0),
            auditQty: Number(p.auditQty || 0),
            packQty: Math.max(1, Number(p.packQty || 1)),
            packName: String(p.packName || 'صندوق'),
            pieceName: String(p.pieceName || 'قطعة')
        };
    };

    window.normalizeProductsForCache = function(list) {
        return (Array.isArray(list) ? list : [])
            .map(window.normalizeProductForCache)
            .filter(product => product.id && product.name);
    };

    window.readProductsCache = async function(teamId) {
        const id = String(teamId || currentTeam?.id || localStorage.getItem('atd_sales_team_id') || 'local');
        try {
            const database = await window.openProductsCacheDatabase();
            const record = await new Promise((resolve, reject) => {
                const transaction = database.transaction(PRODUCT_CACHE_STORE, 'readonly');
                const request = transaction.objectStore(PRODUCT_CACHE_STORE).get(id);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error('INDEXED_DB_READ_FAILED'));
            });
            if (record && Array.isArray(record.products)) {
                return window.normalizeProductsForCache(record.products);
            }
        } catch (error) {
            console.warn('[Products Cache] IndexedDB read deferred:', error);
        }

        // ترحيل النسخة القديمة مرة واحدة، ثم حذفها بعد نجاح الحفظ في IndexedDB.
        const legacyProducts = window.readTeamCache(PRODUCT_CACHE_BASE, [], id);
        const normalized = window.normalizeProductsForCache(legacyProducts);
        if (normalized.length) await window.writeProductsCache(normalized, id);
        return normalized;
    };

    window.writeProductsCache = async function(value, teamId) {
        const id = String(teamId || currentTeam?.id || localStorage.getItem('atd_sales_team_id') || 'local');
        const normalized = window.normalizeProductsForCache(value);
        window.scheduleAutomaticTeamBackup?.();
        const previous = window.__adtProductCacheWriteQueues[id] || Promise.resolve();
        const operation = previous.catch(() => {}).then(async () => {
            try {
                const database = await window.openProductsCacheDatabase();
                await new Promise((resolve, reject) => {
                    const transaction = database.transaction(PRODUCT_CACHE_STORE, 'readwrite');
                    transaction.objectStore(PRODUCT_CACHE_STORE).put({
                        teamId: id,
                        products: normalized,
                        updatedAt: Date.now()
                    });
                    transaction.oncomplete = () => resolve(true);
                    transaction.onerror = () => reject(transaction.error || new Error('INDEXED_DB_WRITE_FAILED'));
                    transaction.onabort = () => reject(transaction.error || new Error('INDEXED_DB_WRITE_ABORTED'));
                });
                try {
                    localStorage.removeItem(window.teamCacheKey(PRODUCT_CACHE_BASE, id));
                    if (String(localStorage.getItem('atd_sales_team_id') || '') === id) {
                        localStorage.removeItem(PRODUCT_CACHE_BASE);
                    }
                } catch (_) {}
                return true;
            } catch (error) {
                console.warn('[Products Cache] IndexedDB write failed; using local fallback:', error);
                try {
                    localStorage.setItem(window.teamCacheKey(PRODUCT_CACHE_BASE, id), JSON.stringify(normalized));
                    return true;
                } catch (fallbackError) {
                    console.error('[Products Cache] local fallback is full:', fallbackError);
                    if (!window.__adtProductsCacheWarningShown) {
                        window.__adtProductsCacheWarningShown = true;
                        window.showToast?.('تعذر حفظ النسخة الأوفلاين الكاملة؛ بيانات الخادم ما زالت آمنة');
                    }
                    return false;
                }
            }
        });
        window.__adtProductCacheWriteQueues[id] = operation.finally(() => {
            if (window.__adtProductCacheWriteQueues[id] === operation) delete window.__adtProductCacheWriteQueues[id];
        });
        return operation;
    };

    window.saveTeamCache = function(base, value, teamId) {
        if (base === PRODUCT_CACHE_BASE) return window.writeProductsCache(value, teamId);
        const stored = window.saveStoredData(window.teamCacheKey(base, teamId), value);
        window.scheduleAutomaticTeamBackup?.();
        if (base === 'atd_sales_debts_v17') window.scheduleAutomaticFinancialPdfExport?.('debts');
        if (base === 'adt_money_records_v195') window.scheduleAutomaticFinancialPdfExport?.('money');
        return stored;
    };

    // حفظ البيانات التجارية الصغيرة التي كانت محلية فقط في حساب المتجر.
    window.__adtCloudStateTimers={};
    window.saveCriticalCloudState=function(stateKey,value){
        if(!stateKey||!currentTeam?.id||!dbClient||isGhostMode)return false;
        clearTimeout(window.__adtCloudStateTimers[stateKey]);
        const teamId=String(currentTeam.id),payload=JSON.parse(JSON.stringify(value));
        window.__adtCloudStateTimers[stateKey]=setTimeout(async()=>{
            try{const {data,error}=await dbClient.rpc('adt_cloud_state_set',{p_team_id:teamId,p_user_id:getDeviceId(),p_state_key:stateKey,p_state_value:payload});if(error||data!==true)throw error||new Error('CLOUD_STATE_SAVE_FAILED');}
            catch(e){console.warn('[Cloud State] save deferred',stateKey,e);}
        },120);
        return true;
    };
    window.syncCriticalCloudState=async function(){
        if(!currentTeam?.id||!dbClient||isGhostMode)return false;
        const teamId=String(currentTeam.id),keys=['invoice_history','retail_audit','audit_only_prices','last_retail_audit','last_wholesale_audit'];
        try{
            const {data,error}=await dbClient.rpc('adt_cloud_state_get',{p_team_id:teamId,p_user_id:getDeviceId(),p_state_keys:keys});
            if(error||!data||typeof data!=='object'||Array.isArray(data))throw error||new Error('INVALID_CLOUD_STATE');
            const has=k=>Object.prototype.hasOwnProperty.call(data,k);
            const migrate=(cloudKey,localKey,fallback)=>{
                let local=fallback;try{local=JSON.parse(localStorage.getItem(localKey)||JSON.stringify(fallback));}catch(_){}
                if(has(cloudKey)){
                    const remote=data[cloudKey];
                    if(remote&&remote.deleted===true)localStorage.removeItem(localKey);else localStorage.setItem(localKey,JSON.stringify(remote));
                }else if(local!==null&&((Array.isArray(local)&&local.length)||(!Array.isArray(local)&&typeof local==='object'&&Object.keys(local||{}).length))){window.saveCriticalCloudState(cloudKey,local);}
            };
            migrate('invoice_history','adt_invoice_history_v104_'+teamId,[]);
            migrate('retail_audit','adt_retail_audit_'+teamId,{});
            migrate('audit_only_prices','adt_audit_only_prices_'+teamId,{});
            migrate('last_retail_audit','adt_last_retail_audit_snapshot_'+teamId,null);
            migrate('last_wholesale_audit','adt_last_audit_snapshot_'+teamId,null);
            if(window.auditMode==='retail')window.loadRetailAudit?.();
            window.loadAuditOnlyPrices?.();window.renderAudit?.();window.renderSavedInvoices?.();return true;
        }catch(e){console.warn('[Cloud State] sync deferred; local data retained',e);return false;}
    };

    window.loadTeamLocalCaches = async function(teamId) {
        const requestedTeamId = String(teamId || currentTeam?.id || localStorage.getItem('atd_sales_team_id') || 'local');
        const visibleTeamId = String(window.__adtVisibleProductsTeamId || requestedTeamId);
        if (visibleTeamId !== requestedTeamId) products = [];
        shortages = window.readTeamCache('atd_sales_shortages_v17', [], teamId) || [];
        suppliers = window.readTeamCache('atd_sales_suppliers_v17', [], teamId) || [];
        productSuppliersMap = window.readTeamCache('atd_product_suppliers_map_v17', {}, teamId) || {};
        const d = window.readTeamCache('atd_sales_debts_v17', { customers: [], suppliers: [] }, teamId);
        debts = (d && Array.isArray(d.customers) && Array.isArray(d.suppliers)) ? d : { customers: [], suppliers: [] };
        damagedGoods = window.readTeamCache('adt_damaged_goods_v194', [], teamId) || [];
        const moneyBundle = window.readTeamCache('adt_money_records_v195', {parties:[],logs:[]}, teamId) || {};
        moneyParties = Array.isArray(moneyBundle.parties) ? moneyBundle.parties : [];
        moneyLogs = Array.isArray(moneyBundle.logs) ? moneyBundle.logs : [];
        const cachedProducts = await window.readProductsCache(requestedTeamId);
        const activeTeamId = String(currentTeam?.id || localStorage.getItem('atd_sales_team_id') || 'local');
        if (activeTeamId === requestedTeamId) {
            if (cachedProducts.length || products.length === 0) products = cachedProducts;
            window.__adtVisibleProductsTeamId = requestedTeamId;
        }
        return products;
    };

    window.saveCurrentTeamSnapshot = function() {
        if (!currentTeam?.id) return;
        const features = (currentTeam.features && typeof currentTeam.features === 'object') ? currentTeam.features : {};
        currentTeam.features = {
            shortages: features.shortages === true,
            invoices: features.invoices === true,
            audit: features.audit === true,
            grocery_audit: features.grocery_audit === true
        };
        try { localStorage.setItem(`atd_team_snapshot__${currentTeam.id}`, JSON.stringify(currentTeam)); } catch(e) {}
        [250, 1500, 4500].forEach(delay => setTimeout(() => window.adtEnsurePushBoundToCurrentTeam?.(), delay));
    };

    const PRODUCTS_BACKUP_FORMAT = 'ADT_PRO_PRODUCTS_BACKUP';
    const PRODUCTS_BACKUP_VERSION = 1;
    const PRODUCTS_BACKUP_MAX_FILE_BYTES = 50 * 1024 * 1024;
    const PRODUCTS_BACKUP_MAX_ITEMS = 100000;
    window.__adtProductBackupBusy = false;

    // مسار موحد لحفظ الملفات: يستخدم واجهة Android الأصلية داخل الـAPK،
    // ويحافظ على تنزيل المتصفح المعتاد عند تشغيل ملف HTML بشكل مستقل.
    window.saveGeneratedFile = async function(blob, fileName, mimeType) {
        const safeName = String(fileName || 'ADT_Stock_File').trim() || 'ADT_Stock_File';
        const safeMime = String(mimeType || blob?.type || 'application/octet-stream').split(';')[0];
        if (window.Android && typeof window.Android.saveBase64File === 'function') {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = String(reader.result || '');
                    const separator = dataUrl.indexOf(',');
                    if (separator < 0) reject(new Error('INVALID_FILE_DATA'));
                    else resolve(dataUrl.slice(separator + 1));
                };
                reader.onerror = () => reject(reader.error || new Error('FILE_READ_FAILED'));
                reader.readAsDataURL(blob);
            });
            window.Android.saveBase64File(base64, safeName, safeMime);
            return 'native';
        }

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = safeName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
        return 'browser';
    };

    window.canManageProductBackups = function() {
        return window.isDeveloperAccount() || userRole === 'manager' || userRole === 'sub_manager' || isGhostMode;
    };

    window.setProductBackupBusy = function(busy) {
        window.__adtProductBackupBusy = !!busy;
        ['btnExportProductsBackup', 'btnChooseProductsBackup', 'btnCloseProductBackupModal'].forEach(id => {
            const button = document.getElementById(id);
            if (button) button.disabled = !!busy;
        });
    };

    window.updateProductBackupProgress = function(done, total, text, resultText) {
        const panel = document.getElementById('productBackupProgressPanel');
        const label = document.getElementById('productBackupProgressText');
        const count = document.getElementById('productBackupProgressCount');
        const fill = document.getElementById('productBackupProgressFill');
        const result = document.getElementById('productBackupResultText');
        const safeTotal = Math.max(0, Number(total || 0));
        const safeDone = Math.max(0, Math.min(safeTotal || 0, Number(done || 0)));
        const percent = safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0;
        if (panel) panel.classList.add('active');
        if (label) label.textContent = String(text || 'جاري تجهيز العملية...');
        if (count) count.textContent = percent + '%';
        if (fill) fill.style.width = percent + '%';
        if (result) result.textContent = String(resultText || '');
    };

    window.resetProductBackupProgress = function() {
        const panel = document.getElementById('productBackupProgressPanel');
        const fill = document.getElementById('productBackupProgressFill');
        const result = document.getElementById('productBackupResultText');
        if (panel) panel.classList.remove('active');
        if (fill) fill.style.width = '0%';
        if (result) result.textContent = '';
    };

    window.openProductBackupModal = function() {
        if (!window.canManageProductBackups()) {
            window.customAlert('غير مسموح', 'تنزيل أو استيراد نسخة المنتجات متاح لمدير الفريق فقط.');
            return;
        }
        if (!window.__adtProductBackupBusy) window.resetProductBackupProgress();
        window.openModalFront?.('productBackupModal', 10070) || (document.getElementById('productBackupModal').style.display = 'flex');
    };

    window.closeProductBackupModal = function() {
        if (window.__adtProductBackupBusy) {
            window.showToast('انتظر حتى يكتمل استيراد المنتجات');
            return;
        }
        window.closeModal('productBackupModal');
    };

    window.productToBackupRecord = function(product) {
        const p = product || {};
        return {
            name: String(p.name || '').trim(),
            buyPrice: Number(p.buyPrice || 0),
            sellPrice: Number(p.sellPrice || 0),
            supplier: String(p.supplier || '').trim(),
            packQty: Math.max(1, Number(p.packQty || 1)),
            packName: String(p.packName || 'صندوق').trim() || 'صندوق',
            pieceName: String(p.pieceName || 'قطعة').trim() || 'قطعة'
        };
    };

    window.exportProductsBackupFile = async function() {
        if (!window.canManageProductBackups() || window.__adtProductBackupBusy) return;
        window.setProductBackupBusy(true);
        window.updateProductBackupProgress(0, 1, 'جاري جمع جميع المنتجات...', '');
        try {
            let syncedFromServer = false;
            if (dbClient && currentTeam && typeof window.fetchProductsIfDue === 'function') {
                syncedFromServer = (await window.fetchProductsIfDue(true)) !== false;
            }

            const backupProducts = (Array.isArray(products) ? products : [])
                .map(window.productToBackupRecord)
                .filter(product => product.name);
            if (!backupProducts.length) {
                window.resetProductBackupProgress();
                window.customAlert('لا توجد منتجات', 'لا توجد منتجات حالياً لإنشاء نسخة احتياطية منها.');
                return;
            }

            const currency = window.getAppCurrency?.() || { code: 'LYD', symbol: 'د.ل' };
            const exportedAt = new Date().toISOString();
            const payload = {
                format: PRODUCTS_BACKUP_FORMAT,
                version: PRODUCTS_BACKUP_VERSION,
                app: 'ADT Stock',
                exportedAt,
                storeName: String(currentTeam?.name || 'المحل'),
                currencyCode: String(currency.code || 'LYD'),
                currencySymbol: String(currency.symbol || 'د.ل'),
                productCount: backupProducts.length,
                products: backupProducts
            };

            const fileBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
            const safeStoreName = String(currentTeam?.name || 'Store')
                .replace(/[\\/:*?"<>|]/g, '_')
                .replace(/\s+/g, '_')
                .slice(0, 40) || 'Store';
            const fileName = 'ADT_Stockducts_Backup_' + safeStoreName + '_' + exportedAt.slice(0, 10) + '.json';
            const saveMode = await window.saveGeneratedFile(fileBlob, fileName, 'application/json');

            const sourceText = syncedFromServer ? 'من أحدث بيانات الخادم' : 'من آخر بيانات محفوظة على الجهاز';
            window.updateProductBackupProgress(1, 1, saveMode === 'native' ? 'تم تجهيز النسخة للحفظ' : 'اكتمل تنزيل النسخة', backupProducts.length + ' منتج — ' + sourceText);
            window.showToast(saveMode === 'native' ? 'اختر مكان حفظ نسخة المنتجات والأسعار' : 'تم تنزيل نسخة جميع المنتجات والأسعار');
        } catch (error) {
            console.error('[Products Backup] export failed:', error);
            window.resetProductBackupProgress();
            window.customAlert('تعذر تنزيل النسخة', 'حدث خطأ أثناء إنشاء ملف المنتجات. حاول مرة أخرى.');
        } finally {
            window.setProductBackupBusy(false);
        }
    };

    window.chooseProductsBackupFile = function() {
        if (!window.canManageProductBackups() || window.__adtProductBackupBusy) return;
        if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) {
            window.customAlert('لا يوجد اتصال بالخادم', 'استيراد المنتجات يحتاج اتصالاً بالخادم حتى تُحفظ المنتجات في الحساب وتظهر على جميع الأجهزة.');
            return;
        }
        const input = document.getElementById('productsBackupFileInput');
        if (!input) return;
        input.value = '';
        input.click();
    };

    window.readProductsBackupText = async function(file) {
        if (file && typeof file.text === 'function') return file.text();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('FILE_READ_FAILED'));
            reader.readAsText(file, 'utf-8');
        });
    };

    window.parseProductsBackupPayload = function(rawText) {
        let payload;
        try {
            payload = JSON.parse(String(rawText || '').replace(/^\uFEFF/, ''));
        } catch (_) {
            throw new Error('الملف غير صالح أو ليس ملف منتجات بصيغة JSON.');
        }
        if (!payload || payload.format !== PRODUCTS_BACKUP_FORMAT || !Array.isArray(payload.products)) {
            throw new Error('هذا الملف ليس نسخة منتجات صادرة من ADT Stock.');
        }
        const version = Number(payload.version || 0);
        if (!Number.isInteger(version) || version < 1 || version > PRODUCTS_BACKUP_VERSION) {
            throw new Error('إصدار ملف المنتجات غير مدعوم في هذه النسخة من التطبيق.');
        }
        if (payload.products.length > PRODUCTS_BACKUP_MAX_ITEMS) {
            throw new Error('الملف يحتوي عدداً أكبر من الحد المسموح للاستيراد دفعة واحدة.');
        }

        const uniqueProducts = new Map();
        let invalidCount = 0;
        let duplicateCount = 0;
        payload.products.forEach(row => {
            const name = String(row?.name || '').trim().slice(0, 200);
            const buyPrice = Number(row?.buyPrice ?? row?.buy_price);
            const sellPrice = Number(row?.sellPrice ?? row?.sell_price);
            const packQtyValue = Number(row?.packQty ?? row?.pack_qty ?? 1);
            const key = window.getProductIdentityKey(name);
            if (!key || !Number.isFinite(buyPrice) || buyPrice < 0 || !Number.isFinite(sellPrice) || sellPrice < 0 || !Number.isFinite(packQtyValue) || packQtyValue < 1) {
                invalidCount++;
                return;
            }
            const record = {
                name,
                buyPrice,
                sellPrice,
                supplier: String(row?.supplier ?? row?.supplier_name ?? '').trim().slice(0, 160),
                packQty: Math.max(1, Math.min(1000000, Math.round(packQtyValue))),
                packName: String(row?.packName ?? row?.pack_name ?? 'صندوق').trim().slice(0, 40) || 'صندوق',
                pieceName: String(row?.pieceName ?? row?.piece_name ?? 'قطعة').trim().slice(0, 40) || 'قطعة'
            };
            if (uniqueProducts.has(key)) duplicateCount++;
            uniqueProducts.set(key, record);
        });
        const parsedProducts = Array.from(uniqueProducts.values());
        if (!parsedProducts.length) throw new Error('لم نجد أي منتج صالح داخل الملف.');
        return { payload, products: parsedProducts, invalidCount, duplicateCount };
    };

    window.handleProductsBackupFile = async function(event) {
        const input = event?.target;
        const file = input?.files?.[0];
        if (!file || window.__adtProductBackupBusy) return;
        try {
            if (!window.canManageProductBackups()) throw new Error('ليست لديك صلاحية استيراد المنتجات.');
            if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) throw new Error('لا يوجد اتصال بالخادم لحفظ المنتجات المستوردة.');
            if (Number(file.size || 0) > PRODUCTS_BACKUP_MAX_FILE_BYTES) throw new Error('حجم الملف أكبر من الحد المسموح وهو 50 ميجابايت.');

            const parsed = window.parseProductsBackupPayload(await window.readProductsBackupText(file));
            const existingByName = new Map((products || []).map(product => [window.getProductIdentityKey(product.name), product]));
            const importPlan = parsed.products.map(record => ({
                record,
                existing: existingByName.get(window.getProductIdentityKey(record.name)) || null
            }));
            const addCount = importPlan.filter(item => !item.existing).length;
            const updateCount = importPlan.length - addCount;
            const canImportBuyPrice = window.canEditBuyPrice();
            const skippedText = (parsed.invalidCount || parsed.duplicateCount)
                ? `\nسيتم تجاهل ${parsed.invalidCount} سجل غير صالح و${parsed.duplicateCount} اسم مكرر داخل الملف.`
                : '';
            const protectedPriceText = canImportBuyPrice
                ? ''
                : '\nأسعار الشراء الحالية لن تتغير؛ تعديلها متاح لمدير الفريق الرئيسي فقط.';
            const confirmed = await window.showAppConfirm({
                title: 'استيراد نسخة المنتجات',
                message: `سيتم إضافة ${addCount} منتج وتحديث ${updateCount} منتج موجود. لن يتم حذف أي منتج من الحساب.${skippedText}${protectedPriceText}`,
                confirmText: 'بدء الاستيراد',
                cancelText: 'إلغاء'
            });
            if (!confirmed) return;
            if (!(await window.confirmGhostMutation('استيراد نسخة المنتجات'))) return;

            const teamIdAtStart = String(currentTeam.id);
            let nextIndex = 0;
            let completed = 0;
            const succeeded = [];
            const failures = [];
            window.setProductBackupBusy(true);
            window.updateProductBackupProgress(0, importPlan.length, 'جاري استيراد المنتجات...', 'لا تغلق التطبيق حتى تكتمل العملية');

            const importWorker = async function() {
                while (nextIndex < importPlan.length) {
                    const itemIndex = nextIndex++;
                    const item = importPlan[itemIndex];
                    if (!currentTeam || String(currentTeam.id) !== teamIdAtStart) {
                        failures.push({ name: item.record.name, message: 'تم تغيير الفريق أثناء الاستيراد' });
                        completed++;
                        continue;
                    }
                    const productId = item.existing?.id ? String(item.existing.id) : window.makeSafeId();
                    const savedBuyPrice = canImportBuyPrice
                        ? Number(item.record.buyPrice || 0)
                        : Number(item.existing?.buyPrice || 0);
                    const productPayload = {
                        id: productId,
                        name: item.record.name,
                        buy_price: savedBuyPrice,
                        sell_price: item.record.sellPrice,
                        supplier_name: item.record.supplier,
                        team_id: teamIdAtStart,
                        updated_at: new Date().toISOString(),
                        is_deleted: false,
                        pack_qty: item.record.packQty,
                        pack_name: item.record.packName,
                        piece_name: item.record.pieceName
                    };
                    try {
                        const { data: saveOk, error } = await (window.isDeveloperOffline()
                            ? Promise.resolve(window.queueDeveloperOfflineProductPayload(productPayload,item.existing?.name||null))
                            : dbClient.rpc('adt_product_save_v131', {
                            p_team_id: teamIdAtStart,
                            p_user_id: getDeviceId(),
                            p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null),
                            p_product: productPayload,
                            p_old_name: item.existing?.name || null
                        }));
                        if (error || saveOk !== true) throw error || new Error('رفض الخادم حفظ المنتج');
                        if (!window.isDeveloperOffline() && canImportBuyPrice && (!item.existing || Number(item.existing.buyPrice || 0) !== Number(savedBuyPrice || 0))) {
                            await window.recordBuyPriceHistory({ id:productId, name:item.record.name, supplier_name:item.record.supplier }, item.existing ? Number(item.existing.buyPrice || 0) : null, Number(savedBuyPrice || 0));
                        }
                        succeeded.push({ ...item, productId, savedBuyPrice });
                    } catch (error) {
                        failures.push({ name: item.record.name, message: error?.message || 'تعذر الحفظ' });
                    } finally {
                        completed++;
                        if (completed === importPlan.length || completed % 3 === 0) {
                            window.updateProductBackupProgress(completed, importPlan.length, 'جاري استيراد المنتجات...', `تم حفظ ${succeeded.length} من ${completed}`);
                        }
                    }
                }
            };

            const workerCount = window.isDeveloperOffline()?1:Math.min(4, importPlan.length);
            await Promise.all(Array.from({ length: workerCount }, () => importWorker()));

            const now = Date.now();
            succeeded.forEach(item => {
                const oldName = String(item.existing?.name || '');
                const localProduct = {
                    id: item.productId,
                    name: item.record.name,
                    buyPrice: item.savedBuyPrice,
                    sellPrice: item.record.sellPrice,
                    supplier: item.record.supplier,
                    updatedAt: now,
                    priceUpdatedAt: now,
                    auditQty: Number(item.existing?.auditQty || 0),
                    packQty: item.record.packQty,
                    packName: item.record.packName,
                    pieceName: item.record.pieceName
                };
                const currentIndex = products.findIndex(product => String(product.id) === String(item.productId));
                if (currentIndex >= 0) products[currentIndex] = { ...products[currentIndex], ...localProduct };
                else products.push(localProduct);
                if (oldName && oldName !== item.record.name) delete productSuppliersMap[oldName];
                if (item.record.supplier) productSuppliersMap[item.record.name] = item.record.supplier;
                else delete productSuppliersMap[item.record.name];
            });
            await window.writeProductsCache(products, teamIdAtStart);
            window.saveTeamCache('atd_product_suppliers_map_v17', productSuppliersMap, teamIdAtStart);
            window.renderProducts?.();
            window.renderHomeStats?.();
            if (succeeded.length && !window.isDeveloperOffline()) await window.fetchProductsFromSupabase?.();

            const addedSucceeded = succeeded.filter(item => !item.existing).length;
            const updatedSucceeded = succeeded.length - addedSucceeded;
            const resultMessage = `تمت إضافة ${addedSucceeded} وتحديث ${updatedSucceeded}${failures.length ? ` — تعذر ${failures.length}` : ''}`;
            window.updateProductBackupProgress(importPlan.length, importPlan.length, failures.length ? 'اكتمل الاستيراد جزئياً' : 'اكتمل الاستيراد بنجاح', resultMessage);
            if (failures.length) {
                const failedNames = failures.slice(0, 5).map(item => item.name).join('، ');
                window.customAlert('اكتمل الاستيراد جزئياً', `${resultMessage}. يمكنك إعادة اختيار الملف لاستكمال المنتجات التي تعذر حفظها.${failedNames ? `\n\nأمثلة: ${failedNames}` : ''}`);
            } else {
                window.customAlert('تم استيراد المنتجات', `${resultMessage}. أصبحت المنتجات محفوظة في الحساب وتظهر على أجهزة الفريق.`);
            }
        } catch (error) {
            console.error('[Products Backup] import failed:', error);
            window.resetProductBackupProgress();
            window.customAlert('تعذر استيراد الملف', error?.message || 'حدث خطأ غير معروف أثناء قراءة الملف.');
        } finally {
            if (input) input.value = '';
            window.setProductBackupBusy(false);
        }
    };

    window.normalizeArabic = function(text) {
        if (!text) return '';
        return String(text).trim().toLowerCase()
            .replace(/ى/g, 'ي').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه')
            .replace(/[\u064B-\u0652]/g, '').replace(/\s+/g, ' ');
    };

    // وزن العبوة والحجم والعدد جزء من هوية الصنف: «سكر 1 كجم» غير «سكر 2 كجم».
    // توحيد شكل الأرقام والعلامات والمسافات فقط دون حذف أي رقم أو علامة تعبئة.
    window.getProductIdentityKey = function(value) {
        return window.normalizeArabic(String(value || ''))
            .replace(/\u0640/g, '')
            .replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
            .replace(/[＊✱✳★☆×]/g, '*')
            .replace(/\s+/g, '');
    };

    window.escapeHtml = function(value) {
        return String(value ?? '').replace(/[&<>'"]/g, ch => ({
            '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'
        })[ch]);
    };

    // UUID-safe id: works whether the database id column is UUID or TEXT.
    window.makeSafeId = function() {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
            if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
                const b = new Uint8Array(16); window.crypto.getRandomValues(b);
                b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
                const x = [...b].map(v => v.toString(16).padStart(2,'0')).join('');
                return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
            }
        } catch (_) {}
        // Last-resort UUID-shaped value (still valid for UUID columns).
        const r = () => Math.floor(Math.random()*0x10000).toString(16).padStart(4,'0');
        return `${r()}${r()}-${r()}-4${r().slice(1)}-${((8+Math.floor(Math.random()*4)).toString(16))}${r().slice(1)}-${r()}${r()}${r()}`;
    };


    window.safeUrlArg = function(value) {
        return encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
    };

    window.showToast = function(msg) {
        const box = document.getElementById('toastBox');
        if (!box) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = msg;
        box.appendChild(toast);
        setTimeout(() => toast.remove(), 2800);
    };

    // تنبيه مرتبط بواجهة محددة فقط. يمنع عمليات المزامنة الخلفية من إظهار
    // أخطاء تخص واجهة أخرى فوق الشاشة الحالية. التنبيهات الناتجة عن إجراء
    // المستخدم نفسه تستمر باستخدام customAlert مباشرة.
    window.interfaceAlert = function(tabName, title, message, isError = true, withWhatsApp = false) {
        if (String(currentTab || 'home') !== String(tabName || 'home')) return false;
        if (window.__adtSuppressTransientSyncAlerts) return false;
        if (document.hidden) return false;
        window.customAlert(title, message, isError, withWhatsApp);
        return true;
    };

    window.customAlert = function(title, message, isError = true, withWhatsApp = false) {
        // وضع العرض للمطور مخصص للمشاهدة فقط؛ لا نعرض نوافذ تنبيه ناتجة عن
        // عمليات الحفظ/المزامنة الممنوعة أو أخطاء التحميل الثانوية أثناء التصفح.
        if (isGhostMode) return;
        const alertText = `${title || ''} ${message || ''}`.replace(/\s+/g, ' ');
        if (/عدد أكبر من صفر|الكمية.*أكبر من صفر|إدخال عدد|أقل من الصفر|اقل من الصفر/i.test(alertText)) {
            const input = document.getElementById('auditModalQtyInput') || document.getElementById('invoiceItemQtyInput');
            if (input) {
                input.focus();
                input.classList.add('adt-invalid-qty');
                setTimeout(() => input.classList.remove('adt-invalid-qty'), 700);
            }
            return;
        }
        document.getElementById('customAlertTitleText').innerText = title;
        document.getElementById('customAlertMsgText').innerText = message;
        
        const iconBox = document.getElementById('customAlertIconBox');
        if (iconBox) {
            iconBox.innerHTML = isError 
                ? `<svg class="svg-icon" style="width:40px; height:40px; color:var(--red);" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`
                : `<svg class="svg-icon" style="width:40px; height:40px; color:var(--primary);" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
        }

        const waBox = document.getElementById('customAlertWhatsAppBtnBox');
        if (waBox) waBox.style.display = withWhatsApp ? 'block' : 'none';

        const alertModal = document.getElementById('customAppAlertModal');
        const highestVisibleModalLayer = Array.from(document.querySelectorAll('.modal')).reduce((highest, item) => {
            if (item === alertModal || window.getComputedStyle(item).display === 'none') return highest;
            const layer = Number.parseInt(window.getComputedStyle(item).zIndex, 10);
            return Number.isFinite(layer) ? Math.max(highest, layer) : highest;
        }, 0);
        window.openModalFront('customAppAlertModal', Math.max(25000, highestVisibleModalLayer + 20));
    };

    window.closeCustomAlert = function() {
        document.getElementById('customAppAlertModal').style.display = 'none';
    };

    window.closeModal = function(id) {
        if (id === 'adtUpdateModal' && window.__adtRequiredRelease?.code > window.getInstalledAppVersionCode?.()) return;
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.style.removeProperty('--adt-modal-z');
        }
        if (id === 'productModal') {
            requestAnimationFrame(() => window.handleProductSearchInput?.());
        }
    };

    // نظام موحّد لترتيب النوافذ: أي نافذة فرعية تظهر فوق الواجهة الحالية فوراً.
    window.openModalFront = function(id, z = 4200) {
        const el = document.getElementById(id);
        if (!el) return false;
        el.style.setProperty('--adt-modal-z', String(z));
        el.style.display = 'flex';
        const box = el.querySelector('.modal-box');
        if (box) box.scrollTop = 0;
        return true;
    };

    window.toggleSideMenu = function() {
        const manageProductsItem = document.getElementById('drawerManageProductsItem');
        if (manageProductsItem) manageProductsItem.style.display = window.canEditBuyPrice() ? 'flex' : 'none';
        const backupItem = document.getElementById('drawerProductBackupItem');
        if (backupItem) backupItem.style.display = window.canManageProductBackups?.() ? 'flex' : 'none';
        window.updateSavedInvoicesDrawerCard?.();
        document.getElementById('menuOverlay')?.classList.toggle('active');
        document.getElementById('sidebarDrawer')?.classList.toggle('active');
    };

    window.closeSideMenu = function() {
        document.getElementById('menuOverlay')?.classList.remove('active');
        document.getElementById('sidebarDrawer')?.classList.remove('active');
    };

    function getDeviceId() {
        let id = localStorage.getItem('atd_sales_device_id');
        if (!id) {
            id = 'sales_dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
            localStorage.setItem('atd_sales_device_id', id);
        }
        return id;
    }


    window.__adtSessionToken = '';
    window.migrateLegacySessionToken = function(){
        try {
            const legacy = String(localStorage.getItem('adt_session_token_v146') || '');
            if (legacy && window.Android?.saveSessionToken?.(legacy)) {
                window.__adtSessionToken = legacy; localStorage.removeItem('adt_session_token_v146'); return legacy;
            }
        } catch (_) {}
        return String(window.__adtSessionToken || '');
    };
    window.getSessionToken = function(){ if (window.__adtSessionToken) return String(window.__adtSessionToken); return window.migrateLegacySessionToken(); };
    window.setSessionToken = function(token){
        token=String(token||''); if(!token) return false;
        try { const ok=!!window.Android?.saveSessionToken?.(token); if(!ok)return false; window.__adtSessionToken=token; localStorage.removeItem('adt_session_token_v146'); return true; } catch(_){return false;}
    };
    window.clearSessionToken = function(){ window.__adtSessionToken=''; try{window.Android?.clearSessionToken?.();}catch(_){} try{localStorage.removeItem('adt_session_token_v146');}catch(_){} };
    window.migrateLegacySessionToken();


    // =========================================================
    // Push Notifications bridge (FCM)
    // يقوم الـ APK/Wrapper بتمرير FCM token إلى ADT_registerPushToken(token).
    // لا نضع أي أسرار Firebase داخل HTML.
    // =========================================================
    window.ADT_registerPushToken = async function(token) {
        try {
            token = String(token || '').trim();
            if (!token || token.length < 20) return false;

            window.__adtFcmToken = token;

            // اربط أحدث Token بالفريق الحالي فوراً. لو الجلسة لم تجهز بعد،
            // syncStoredPushToken سيعيد المحاولة بعد اكتمال تسجيل الدخول.
            return await window.syncStoredPushToken();
        } catch (e) {
            console.warn('[Push] register token failed:', e);
            return false;
        }
    };
    // أسماء بديلة شائعة لتسهيل الربط من الـ WebView builder.
    window.onFCMToken = window.ADT_registerPushToken;
    window.onFirebaseToken = window.ADT_registerPushToken;
    window.receiveFCMToken = window.ADT_registerPushToken;

    window.openNativeNotificationSettings = function() {
        try {
            if (window.Android?.openNotificationSettings) {
                window.Android.openNotificationSettings();
                return;
            }
        } catch (_) {}
        window.customAlert('إشعارات الهاتف', 'افتح إعدادات الهاتف ثم فعّل إشعارات ADT Stock.');
    };

    window.syncStoredPushToken = async function() {
        if (!dbClient || !currentTeam || isGhostMode) return false;
        const teamId = String(currentTeam.id);
        const userId = getDeviceId();
        const token = String(window.__adtFcmToken || window.Android?.getFcmToken?.() || '').trim();
        if (!token) return false;
        try {
            const { data, error } = await dbClient.rpc('adt_register_push_token', {
                p_team_id: teamId,
                p_user_id: userId,
                p_token: token,
                p_platform: 'android'
            });
            if (error || data !== true) throw error || new Error('TOKEN_REGISTER_REJECTED');
            localStorage.setItem('atd_push_bound_team_id', teamId);
            localStorage.setItem('atd_push_bound_user_id', userId);
                        localStorage.setItem('atd_push_last_sync_at', String(Date.now()));
            return true;
        } catch (e) {
            console.warn('[Push] token sync deferred:', e);
            return false;
        }
    };

    window.tryCaptureNativePushToken = async function() {
        try {
            const params = new URLSearchParams(location.search);
            const qToken = params.get('fcm_token') || params.get('fcmToken') || params.get('push_token');
            if (qToken) return window.ADT_registerPushToken(qToken);

            const candidates = [
                () => window.Android?.getFcmToken?.(),
                () => window.Android?.getFirebaseToken?.(),
                () => window.WebViewBridge?.getFCMToken?.(),
                () => window.WebViewBridge?.getFirebaseToken?.()
            ];
            for (const getter of candidates) {
                try {
                    const value = getter();
                    const token = value && typeof value.then === 'function' ? await value : value;
                    if (token && String(token).length > 20) return window.ADT_registerPushToken(token);
                } catch (_) {}
            }

            // دعم Cordova Firebase plugin إن كان الـ builder يستخدمه.
            if (window.FirebasePlugin?.getToken) {
                window.FirebasePlugin.getToken(
                    t => window.ADT_registerPushToken(t),
                    e => console.warn('[Push] FirebasePlugin token:', e)
                );
            }

            // لو Firebase غيّر الـ Token أثناء عمر التطبيق، سجّل الجديد فوراً.
            if (!window.__adtPushRefreshHookInstalled && window.FirebasePlugin?.onTokenRefresh) {
                window.__adtPushRefreshHookInstalled = true;
                window.FirebasePlugin.onTokenRefresh(
                    t => window.ADT_registerPushToken(t),
                    e => console.warn('[Push] FirebasePlugin refresh:', e)
                );
            }
        } catch (e) {
            console.warn('[Push] native token capture skipped:', e);
        }
        return false;
    };

    // استخدم مسار Firebase الأصلي الشغال داخل تطبيق Android.
    window.triggerPendingPricePush = async function(teamId, details = {}) {
        try {
            const actorUserId = String(getDeviceId?.() || '');
            const safeTeamId = String(teamId || '');
            const actorName = String(details.actorName || localStorage.getItem('atd_sales_user_name') || window.currentUserName || document.getElementById('drawerUserName')?.textContent || currentTeam?.manager_name || 'مستخدم').trim() || 'مستخدم';
            const productName = String(details.productName || '').trim();
            const oldSellPrice = String(details.oldSellPrice ?? '');
            const newSellPrice = String(details.newSellPrice ?? '');
            const changeType = String(details.changeType || 'price_change');
            if (!safeTeamId || !actorUserId) return { ok:false, reason:'missing_identity' };
            const currencySymbol = String(window.getCurrencySymbol?.() || 'د.ل');
            if (window.Android && typeof window.Android.triggerPricePushV174 === 'function') {
                window.Android.triggerPricePushV174(safeTeamId, actorUserId, actorName, productName, oldSellPrice, newSellPrice, changeType, currencySymbol);
                return { ok:true, native:true, rich:true, currency:true };
            }
            if (window.Android && typeof window.Android.triggerPricePushV172 === 'function') {
                window.Android.triggerPricePushV172(safeTeamId, actorUserId, actorName, productName, oldSellPrice, newSellPrice, changeType);
                return { ok:true, native:true, rich:true };
            }
            if (window.Android && typeof window.Android.triggerPricePush === 'function') {
                window.Android.triggerPricePush(safeTeamId, actorUserId);
                return { ok:true, native:true, rich:false };
            }
            return { ok:false, reason:'native_bridge_unavailable' };
        } catch (error) {
            console.warn('[Push] native dispatch failed:', error);
            return { ok:false, reason:'native_dispatch_failed' };
        }
    };

    // نافذة تأكيد موحدة متناسقة مع تصميم التطبيق
    window.showAppConfirm = function(options = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('appConfirmModal');
            const title = document.getElementById('appConfirmTitle');
            const msg = document.getElementById('appConfirmMessage');
            const yes = document.getElementById('appConfirmYesBtn');
            const no = document.getElementById('appConfirmNoBtn');
            const icon = document.getElementById('appConfirmIcon');
            if (!modal || !yes || !no) { resolve(false); return; }
            title.innerText = options.title || 'تأكيد العملية';
            msg.innerText = options.message || 'هل تريد المتابعة؟';
            yes.innerText = options.confirmText || 'تأكيد';
            no.innerText = options.cancelText || 'إلغاء';
            yes.style.background = options.danger ? 'linear-gradient(135deg,#ff5b5b,#d63031)' : 'var(--primary-grad)';
            yes.style.color = options.danger ? '#fff' : '#070A12';
            icon.style.color = options.danger ? 'var(--red)' : 'var(--primary)';
            icon.style.borderColor = options.danger ? 'rgba(255,77,77,.35)' : 'rgba(0,210,180,.28)';
            icon.style.background = options.danger ? 'rgba(255,77,77,.10)' : 'rgba(0,210,180,.10)';
            const highestVisibleModalLayer = Array.from(document.querySelectorAll('.modal, .adt-audited-viewer, [role="dialog"]')).reduce((highest, item) => {
                if (item === modal) return highest;
                const style = window.getComputedStyle(item);
                if (style.display === 'none' || style.visibility === 'hidden') return highest;
                const layer = Number.parseInt(style.zIndex, 10);
                return Number.isFinite(layer) ? Math.max(highest, layer) : highest;
            }, 0);
            modal.style.setProperty('--adt-modal-z', String(Math.max(120000, highestVisibleModalLayer + 20)));
            modal.style.display = 'flex';
            let done = false;
            const finish = (value) => {
                if (done) return;
                done = true;
                modal.style.display = 'none';
                yes.onclick = null; no.onclick = null;
                resolve(value);
            };
            yes.onclick = () => finish(true);
            no.onclick = () => finish(false);
        });
    };

    // تحذير قبل أي تعديل أثناء تصفح فريق آخر
    window.confirmGhostMutation = async function(actionLabel) {
        if (currentTeam && !dbClient && !window.isDeveloperOffline?.()) {
            window.customAlert('الاتصال مطلوب', 'لا يمكن حفظ تعديلات الفريق بدون اتصال بالخادم حتى لا تضيع البيانات أو تختلف بين الأجهزة.');
            return false;
        }
        if (!isGhostMode) return true;
        window.customAlert('عرض', 'وضع عرض المتجر يمنع حفظ أي تعديل. ارجع لمتجرك لإجراء التعديلات.');
        return false;
    };

    // فحص الميزات المدفوعة للمتجر
    window.isFeatureEnabled = function(featureKey) {
        if (!currentTeam) return false;
        if (isGhostMode && featureKey !== 'audit') return true;

        // فريق المطور الرسمي (كود 086): الجردان متاحان دائماً من ناحية الباقة.
        // التحكم في من يرى/يستخدم الجرد يظل من صلاحيات أعضاء الفريق فقط.
        const isDeveloperTeam = !isGhostMode && String(currentTeam?.code || '').trim().toUpperCase() === '086';
        if (isDeveloperTeam) return true;
        if (!isGhostMode && window.isDeveloperAccount && window.isDeveloperAccount()) return true;

        // باقي الفرق تعتمد على حالة الخادم.
        const teamFeats = (currentTeam.features && typeof currentTeam.features === 'object') ? currentTeam.features : {};
        return teamFeats[featureKey] === true;
    };

    window.promptFeatureLocked = function(featureName) {
        let store = currentTeam ? currentTeam.name : 'متجرنا';
        let mgr = currentTeam ? currentTeam.manager_name : 'المدير';
        document.getElementById('featureLockedTitle').innerText = `ميزة (${featureName}) مدفوعة`;
        document.getElementById('featureLockedMsg').innerText = `عفواً، ميزة (${featureName}) غير مفعلة في باقة متجرك حالياً.\nيمكنك طلب تفعيلها من المطور مباشرة:`;
        
        let msg = `مرحباً أحمد داكر، أود طلب تفعيل ميزة (${featureName}) لمتجرنا (${store}) - المدير: (${mgr}).`;
        document.getElementById('btnRequestFeatureWhatsApp').href = `https://wa.me/218943102554?text=${encodeURIComponent(msg)}`;
        document.getElementById('featureLockedModal').style.display = 'flex';
    };

    window.tryOpenShortages = function() {
        if (!window.canManageShortages()) {
            window.customAlert('صلاحية مقفلة', 'واجهة النواقص مخفية عن هذا الحساب. اطلب تفعيل صلاحيتها من المدير.');
            return;
        }
        if (window.isFeatureEnabled('shortages')) {
            window.switchTab('shortages');
        } else {
            window.promptFeatureLocked('النواقص وطلبيات الموردين');
        }
    };

    window.refreshPaidFeatureCards = function() {
        const invoiceCard = document.getElementById('hubInvoicesCard');
        if (invoiceCard) invoiceCard.style.display = (currentTeam && window.isFeatureEnabled('invoices')) ? '' : 'none';
        const groceryCard = document.getElementById('hubGroceryAuditCard');
        if (groceryCard) groceryCard.style.display = window.isDeveloperGroceryAuditAllowed?.() ? '' : 'none';
    };

    window.tryOpenInvoices = function() {
        if (!window.isFeatureEnabled('invoices')) { window.promptFeatureLocked('إنشاء الفواتير الاحتياطية'); return; }
        if (!window.canCreateInvoices()) { window.customAlert('غير مسموح','المدير لم يسمح لهذا العضو بإنشاء الفواتير.'); return; }
        window.openModalFront('invoiceTypePickerModal',19000);
    };

    let __adtSilentSyncBusy=false;
    window.silentAutoSync=async function(){
        if(__adtSilentSyncBusy||window.__adtSecureSyncTimer||!navigator.onLine||!currentTeam)return;__adtSilentSyncBusy=true;
        try{await Promise.all([window.fetchShortagesFromSupabase(),window.fetchDebtsFromSupabase(),window.fetchDeveloperNotices()]);if(currentTab==='shortages')window.renderShortagesView();}catch(e){console.warn('[Sync] silent',e)}finally{__adtSilentSyncBusy=false}
    };
    setInterval(()=>window.silentAutoSync(),15000);

    // حساب الوقت المنقضي
    window.timeAgo = function(timestamp) {
        if (!timestamp) return 'الآن';
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (minutes < 2) return 'الآن';
        if (minutes < 60) return `منذ ${minutes} دقيقة`;
        if (hours === 1) return 'منذ ساعة';
        if (hours === 2) return 'منذ ساعتين';
        if (hours < 24) return `منذ ${hours} ساعات`;
        if (days === 1) return 'منذ يوم';
        if (days === 2) return 'منذ يومين';
        return `منذ ${days} أيام`;
    };

    // زر التحديث السريع اللحظي
    window.manualForceSync = async function() {
        const syncIcon = document.getElementById('manualSyncIcon');
        if (syncIcon) syncIcon.style.transform = 'rotate(360deg)';

        try {
            const results = await Promise.all([
                window.fetchProductsFromSupabase(),
                window.fetchShortagesFromSupabase(),
                window.fetchDebtsFromSupabase(),
                window.loadTeamMembers(),
                window.fetchDeveloperNotices()
            ]);
            if (results.some(v => v === false)) throw new Error('PARTIAL_SYNC_FAILED');
            if (currentTab === 'shortages') window.renderShortagesView();
            if (currentTab === 'audit') window.renderAudit();
            window.updateSyncBadge(true);
            window.showToast('تم تحديث ومزامنة البيانات بنجاح');
        } catch(e) {
            console.error('[Sync] manual sync failed:', e);
            window.updateSyncBadge(false);
            window.customAlert('فشل المزامنة', 'تعذر مزامنة بعض البيانات. تأكد من اتصال الإنترنت ثم حاول مرة أخرى.');
        } finally {
            setTimeout(() => {
                if (syncIcon) syncIcon.style.transform = 'rotate(0deg)';
            }, 600);
        }
    };

    window.getStoreProfileCacheKey = function(teamId) {
        return 'adt_store_profile_v128_' + String(teamId || currentTeam?.id || 'local');
    };

    window.getStoreProfile = function() {
        let cached = {};
        try {
            cached = JSON.parse(localStorage.getItem(window.getStoreProfileCacheKey()) || '{}') || {};
        } catch (_) {}
        const storeName = String(
            currentTeam?.invoice_store_name || cached.storeName || currentTeam?.name || 'المحل'
        ).trim() || 'المحل';
        const storeAddress = String(
            currentTeam?.store_address ?? cached.storeAddress ?? ''
        ).trim();
        return { storeName, storeAddress };
    };

    window.applyStoreProfile = function(profile) {
        if (!currentTeam?.id || !profile) return window.getStoreProfile();
        const storeName = String(profile.store_name || profile.storeName || currentTeam.name || 'المحل').trim() || 'المحل';
        const storeAddress = String(profile.store_address ?? profile.storeAddress ?? '').trim();
        const changed = currentTeam.invoice_store_name !== storeName || currentTeam.store_address !== storeAddress;
        currentTeam.invoice_store_name = storeName;
        currentTeam.store_address = storeAddress;
        try {
            localStorage.setItem(window.getStoreProfileCacheKey(), JSON.stringify({ storeName, storeAddress }));
        } catch (_) {}
        window.__adtStoreProfileLoadedTeam = String(currentTeam.id);
        if (changed) window.saveCurrentTeamSnapshot();
        return { storeName, storeAddress };
    };

    window.loadStoreProfile = async function() {
        const fallback = window.getStoreProfile();
        if (!currentTeam?.id || !dbClient || isGhostMode) return fallback;
        try {
            const teamId = String(currentTeam.id);
            const { data, error } = await dbClient.rpc('adt_read_store_profile', {
                p_team_id: teamId,
                p_user_id: getDeviceId()
            });
            if (error) throw error;
            const profile = Array.isArray(data) ? data[0] : data;
            if (!profile || typeof profile !== 'object' || String(currentTeam?.id) !== teamId) return fallback;
            const applied = window.applyStoreProfile(profile);
            window.updateUserProfileUI(localStorage.getItem('atd_sales_user_name') || '');
            return applied;
        } catch (error) {
            console.warn('[Store Profile] read deferred:', error);
            return fallback;
        }
    };

    window.updateUserProfileUI = function(customName) {
        let name = customName || localStorage.getItem('atd_sales_user_name') || (currentTeam ? currentTeam.manager_name : 'مستخدم');
        window.currentUserName = name;
        const storeProfile = window.getStoreProfile();
        let store = currentTeam ? storeProfile.storeName : 'اسم المحل: اضغط لتحديده';

        const dUser = document.getElementById('drawerUserName');
        const dStore = document.getElementById('drawerStoreName');
        const sText = document.getElementById('storeNameText');

        if (dUser) dUser.innerText = name;
        if (dStore) dStore.innerText = store;
        const headerStore = document.getElementById('adtHeaderTagline');
        const headerStoreMini = document.getElementById('headerStoreNameMini');
        const cleanStoreName = (currentTeam && storeProfile.storeName)
            ? storeProfile.storeName
            : 'اسم المحل';
        const ghostActive = !!isGhostMode || !!localStorage.getItem('atd_original_team_id');
        if (headerStore) {
            headerStore.innerHTML = '';
            if (ghostActive) {
                const exitBtn = document.createElement('button');
                exitBtn.type = 'button';
                exitBtn.className = 'btn-header-ghost-badge';
                exitBtn.textContent = 'إنهاء العرض';
                exitBtn.style.display = 'inline-flex';
                exitBtn.onclick = function(){ window.promptExitGhostMode(); };
                headerStore.appendChild(exitBtn);
            } else {
                headerStore.textContent = cleanStoreName;
            }
        }
        if (headerStoreMini) headerStoreMini.textContent = ghostActive ? '' : cleanStoreName;
        if (sText) {
            const hasStoreName = !!(currentTeam && storeProfile.storeName);
            sText.className = hasStoreName ? 'store-name-value' : 'store-name-placeholder';
            sText.textContent = hasStoreName ? storeProfile.storeName : 'اسم المحل: اضغط لتحديده';
        }
    };

    window.playNotificationChime = function() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.setValueAtTime(880.00, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.4);
        } catch(e) {}
        if (navigator.vibrate) { try { navigator.vibrate([120, 80, 120]); } catch(e) {} }
    };

    window.sendPushNotification = function(title, message, isBroadcast = false) {
        window.playNotificationChime();
        const banner = document.getElementById('appTopPushBanner');
        const bTitle = document.getElementById('pushBannerTitle');
        const bMsg = document.getElementById('pushBannerMsg');

        if (banner && bTitle && bMsg) {
            bTitle.innerText = title;
            bMsg.innerText = message;
            banner.style.top = "16px";
            setTimeout(() => { banner.style.top = "-100px"; }, 4500);
        }

        window.recordActivityLog(title, message, isBroadcast);
    };

    window.recordActivityLog = function(title, message, isBroadcast = false) {
        title = String(title || '').trim();
        message = String(message || '').trim();

        // لا نكرر نفس الإشعار داخل السجل.
        const sameIndex = activityLogs.findIndex(l =>
            String(l?.title || '').trim() === title &&
            String(l?.msg || '').trim() === message &&
            !!l?.isBroadcast === !!isBroadcast
        );

        if (sameIndex >= 0) {
            // نخلي نفس الإشعار مرة واحدة فقط، ونحدث توقيته بدل إضافة نسخة ثانية.
            const old = activityLogs.splice(sameIndex, 1)[0] || {};
            old.id = Date.now();
            old.time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            activityLogs.unshift(old);
            localStorage.setItem('atd_activity_logs_v1', JSON.stringify(activityLogs));
            const dot = document.getElementById('badgeNotificationDot');
            if (dot) dot.style.display = 'block';
            return;
        }

        const newLog = {
            id: Date.now(),
            title: title,
            msg: message,
            isBroadcast: !!isBroadcast,
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        };
        activityLogs.unshift(newLog);
        if (activityLogs.length > 200) activityLogs.length = 200;
        localStorage.setItem('atd_activity_logs_v1', JSON.stringify(activityLogs));

        // حفظ نسخة سحابية عبر RPC مقيد.
        if (dbClient && currentTeam && currentTeam.id) {
            dbClient.rpc('adt_add_activity_log', {
                p_team_id: String(currentTeam.id),
                p_user_id: getDeviceId(),
                p_title: title,
                p_message: message,
                p_is_broadcast: !!isBroadcast,
                p_user_name: localStorage.getItem('atd_sales_user_name') || null
            }).then(({ error }) => {
                if (error) console.warn('[Activity Log] cloud save skipped:', error.message);
            }).catch(err => console.warn('[Activity Log] cloud save skipped:', err));
        }

        const dot = document.getElementById('badgeNotificationDot');
        if (dot) dot.style.display = 'block';
    };
    window.openActivityCenterModal = function() {
        const dot = document.getElementById('badgeNotificationDot');
        if (dot) dot.style.display = 'none';
        window.renderActivityLogs();
        document.getElementById('activityCenterModal').style.display = 'flex';
    };

    window.renderActivityLogs = function() {
        const container = document.getElementById('activityLogsListContainer');
        if (!container) return;
        if (activityLogs.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:30px 10px; font-weight:700;">لا توجد إشعارات أو أنشطة حديثة</div>';
            return;
        }
        container.innerHTML = activityLogs.map(l => `
            <div style="background:var(--input-bg); border-right:3px solid ${l.isBroadcast ? 'var(--accent-gold)' : 'var(--primary)'}; border-radius:8px; padding:8px 10px; font-size:11px; text-align:right;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                    <b style="color:${l.isBroadcast ? 'var(--accent-gold)' : '#FFF'};">${window.escapeHtml(l.title)}</b>
                    <span style="font-size:9px; color:var(--text-muted);">${window.escapeHtml(l.time)}</span>
                </div>
                <div style="color:var(--text-muted); font-size:10px; line-height:1.4;">${window.escapeHtml(l.msg)}</div>
            </div>
        `).join('');
    };

    window.clearLocalActivityLogs = function() {
        activityLogs = [];
        localStorage.removeItem('atd_activity_logs_v1');
        window.renderActivityLogs();
        window.showToast('تم مسح سجل الإشعارات');
    };
    // تم إلغاء قفل التطبيق المحلي بالكامل
    
    // الاتصال بسوبابيز
    window.initSupabaseClient = function() {
        try {
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                dbClient = window.supabase.createClient(sbUrl, sbKey, {
                    realtime: {
                        heartbeatIntervalMs: 15000,
                        heartbeatCallback: (status) => {
                            const s = String(status || '').toLowerCase();
                            if (s === 'ok') {
                                window.__adtRealtimeLastConnected = true;
                                window.updateSyncBadge?.();
                            } else if (s === 'timeout' || s === 'disconnected' || s === 'error') {
                                window.__adtRealtimeLastConnected = false;
                                window.updateSyncBadge?.(false);
                                try { dbClient?.realtime?.connect?.(); } catch (_) {}
                                if (!document.hidden && currentTeam) window.setupRealtimeSubscription?.({force:true, reason:'heartbeat-'+s});
                            }
                        }
                    }
                });
                window.updateSyncBadge();
            } else {
                window.updateSyncBadge(false);
            }
        } catch(e) {
            window.updateSyncBadge(false);
        }
    };

    window.updateSyncBadge = function(forceState) {
        const badge = document.getElementById('syncStatusBadge');
        if (!badge) return;
        let connected = false;
        try {
            connected = forceState === true || (!forceState && !!dbClient &&
                window.__adtRealtimeLastConnected === true &&
                String(realtimeChannel?.state || '').toLowerCase() === 'joined' &&
                dbClient.realtime?.isConnected?.() === true);
        } catch (_) {}
        badge.className = 'sync-status-badge ' + (connected ? 'sync-status-online' : 'sync-status-offline');
        badge.innerHTML = '<span aria-hidden="true"></span>' + (connected ? 'متصل' : 'غير متصل');
    };

    // A release is announced from the database; WebView reload cannot install a new APK.
    const ADT_FALLBACK_VERSION_CODE = 319;
    window.getInstalledAppVersionCode = function() {
        try { return Number(window.Android?.getAppVersionCode?.()) || ADT_FALLBACK_VERSION_CODE; }
        catch (_) { return ADT_FALLBACK_VERSION_CODE; }
    };
    window.formatAdtReleaseVersion = function(code, label) {
        const n=Number(code);
        if (Number.isInteger(n) && n>=100 && n<10000)
            return `${Math.floor(n/100)}.${n%100}.0`;
        return String(label||code);
    };
    window.normalizeAdtUpdatePageUrl = function(raw) {
        const text=String(raw||'').trim();
        if(!/^https:\/\//i.test(text))return text;
        try{
            const parsed=new URL(text);
            // توافق مع الإصدارات التي كانت تنشر رابط تنزيل Netlify المباشر.
            // للمستخدم نفتح صفحة المتجر/الموقع، ومنها يضغط تثبيت آخر APK.
            if(parsed.pathname==='/ .netlify/functions/download-release'.replace(' ',''))return parsed.origin+'/';
            return text;
        }catch(_){return text;}
    };
    window.showRequiredAppRelease = function(code,url,versionName,notes) {
        const release={code:Number(code),url:window.normalizeAdtUpdatePageUrl(url),required:true};
        if(!Number.isInteger(release.code)||release.code<=window.getInstalledAppVersionCode()||!/^https:\/\//i.test(release.url))return false;
        window.__adtRequiredRelease=release;
        window.__adtLatestRelease=release;
        try{localStorage.setItem('adt_required_app_release',JSON.stringify(release));}catch(_){}
        const description=document.getElementById('adtUpdateDescription');
        if(description)description.textContent=window.formatAdtReleaseVersion(release.code,versionName);
        window.openModalFront('adtUpdateModal',50000);
        return true;
    };
    try{
        const cached=JSON.parse(localStorage.getItem('adt_required_app_release')||'null');
        if(cached?.code>window.getInstalledAppVersionCode())window.showRequiredAppRelease(cached.code,cached.url);
        else localStorage.removeItem('adt_required_app_release');
    }catch(_){try{localStorage.removeItem('adt_required_app_release');}catch(__){}}
    window.checkLatestAppRelease = async function() {
        if (!dbClient || !window.getNativeNetworkState()) return;
        try {
            const {data, error} = await dbClient.from('adt_app_releases')
                .select('version_code,version_name,download_url,notes,required')
                .eq('id',1).maybeSingle();
            if (error || !data) return;
            const code = Number(data.version_code);
            const url = String(data.download_url || '').trim();
            if (!Number.isInteger(code) || code <= window.getInstalledAppVersionCode() || !/^https:\/\//i.test(url)) return;
            window.showRequiredAppRelease(code,url,data.version_name,data.notes);
        } catch (error) { console.warn('[Update] release check unavailable:', error); }
    };
    window.closeLatestAppReleaseNotice = function() {
        if (window.__adtRequiredRelease?.code > window.getInstalledAppVersionCode()) return;
    };
    setInterval(() => { if (!document.hidden && window.getNativeNetworkState()) window.checkLatestAppRelease(); }, 10*60*1000);
    window.openLatestAppRelease = function() {
        const url=window.normalizeAdtUpdatePageUrl(window.__adtLatestRelease?.url);
        if (!url || !/^https:\/\//i.test(url)) return;
        if (window.Android?.openExternal) window.Android.openExternal(url);
        else window.open(url,'_blank','noopener');
    };

    window.setNetworkConnectionState = function(isOnline, message) {
        const online = isOnline === true || isOnline === 'true' || isOnline === 1 || isOnline === '1';
        window.__adtNetworkOnline = online;
        const modal = document.getElementById('offlineConnectionModal');
        const messageBox = document.getElementById('offlineConnectionMessage');
        if (!modal) return online;
        // The signed-in developer can open the locally cached app while offline.
        if (!online && localStorage.getItem('atd_sales_signed_out')!=='true' && window.isDeveloperAccount() && !isGhostMode) {
            modal.style.display='none';
            window.updateSyncBadge(false);
            return false;
        }
        if (!online) {
            if (messageBox) messageBox.textContent = message || 'تحقق من بيانات الهاتف أو شبكة Wi‑Fi، ثم اضغط إعادة المحاولة. ستبقى بياناتك المحفوظة آمنة على الجهاز.';
            window.openModalFront('offlineConnectionModal', 30000);
            window.updateSyncBadge(false);
        } else {
            modal.style.display = 'none';
            modal.style.removeProperty('--adt-modal-z');
            if (dbClient) window.updateSyncBadge(true);
        }
        return online;
    };

    window.getNativeNetworkState = function() {
        try {
            if (window.Android && typeof window.Android.isNetworkAvailable === 'function') {
                return !!window.Android.isNetworkAvailable();
            }
        } catch (_) {}
        return navigator.onLine !== false;
    };

    window.loadDeferredFont = function() {
        if (document.getElementById('adtDeferredFont')) return;
        const link = document.createElement('link');
        link.id = 'adtDeferredFont';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap';
        document.head.appendChild(link);
    };

    window.loadSupabaseSdkDeferred = function() {
        if (dbClient) return Promise.resolve(dbClient);
        if (window.supabase?.createClient) {
            window.initSupabaseClient();
            return Promise.resolve(dbClient);
        }
        if (window.__adtSupabaseSdkPromise) return window.__adtSupabaseSdkPromise;
        if (!window.getNativeNetworkState()) {
            window.setNetworkConnectionState(false);
            return Promise.reject(new Error('OFFLINE'));
        }
        window.__adtSupabaseSdkPromise = new Promise((resolve, reject) => {
            let script = document.getElementById('adtSupabaseSdk');
            if (script) script.remove();
            script = document.createElement('script');
            script.id = 'adtSupabaseSdk';
            script.async = true;
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0';
            script.onload = () => {
                window.initSupabaseClient();
                if (dbClient) resolve(dbClient);
                else reject(new Error('SUPABASE_INIT_FAILED'));
            };
            script.onerror = () => {
                script.remove();
                reject(new Error('SUPABASE_SDK_UNAVAILABLE'));
            };
            document.head.appendChild(script);
        }).catch(error => {
            window.__adtSupabaseSdkPromise = null;
            window.setNetworkConnectionState(false, 'تعذر الوصول إلى خادم التطبيق. تأكد من الإنترنت ثم أعد المحاولة.');
            throw error;
        });
        return window.__adtSupabaseSdkPromise;
    };

    window.startBackgroundCloudSync = async function() {
        try {
            await window.loadSupabaseSdkDeferred();
            window.setNetworkConnectionState(true);
            window.tryCaptureNativePushToken().catch(()=>{});
            // V175: المزامنة الخلفية لا تغيّر الصفحة التي فتحها المستخدم.
            // كان الاستدعاء بدون preserveCurrentTab يعيد المستخدم للرئيسية بعد اكتمال التحديث.
            await window.flushDeveloperOfflineProducts(currentTeam?.id);
            await window.flushDeveloperOfflineMutations(currentTeam?.id);
            await window.checkAuthAndTeamServer({ preserveCurrentTab:true });
            await window.checkLatestAppRelease();
        } catch (error) {
            console.warn('[Startup] cloud sync deferred:', error?.message || error);
        }
    };

    window.retryInternetConnection = async function() {
        const button = document.getElementById('offlineRetryButton');
        if (button) { button.disabled = true; button.textContent = 'جاري التحقق...'; }
        try {
            try { window.Android?.retryInternetConnection?.(); } catch (_) {}
            const online = window.getNativeNetworkState();
            window.setNetworkConnectionState(online);
            if (!online) return;
            await window.startBackgroundCloudSync();
        } finally {
            if (button) { button.disabled = false; button.textContent = 'إعادة المحاولة'; }
        }
    };

    window.addEventListener('offline', () => window.setNetworkConnectionState(false));
    window.addEventListener('online', () => {
        window.setNetworkConnectionState(true);
        setTimeout(() => window.startBackgroundCloudSync(), 250);
        setTimeout(() => window.checkLatestAppRelease(), 1250);
    });

    window.fetchDeveloperNotices = async function() {
        if (!dbClient || !currentTeam) return true;
        const lastSeen = localStorage.getItem('atd_last_dev_notice_at') || new Date(Date.now() - 24*60*60*1000).toISOString();
        try {
            const { data, error } = await dbClient.rpc('adt_fetch_notices', { p_team_id: String(currentTeam.id), p_user_id: getDeviceId(), p_since: lastSeen });
            if (error) throw error;
            const rows = Array.isArray(data) ? data : [];
            const seenKey='atd_seen_developer_notice_ids_v2';
            let seen=[]; try{seen=JSON.parse(localStorage.getItem(seenKey)||'[]'); if(!Array.isArray(seen))seen=[];}catch(_){seen=[];}
            const seenSet=new Set(seen.map(String));
            for (const n of rows) {
                const noticeId=String(n.id || (String(n.created_at||'')+'|'+String(n.notice_type||'')+'|'+String(n.message||'')));
                if (seenSet.has(noticeId)) { if (n.created_at) localStorage.setItem('atd_last_dev_notice_at', n.created_at); continue; }
                seenSet.add(noticeId);
                if (window.isDeveloperAccount()) { if (n.created_at) localStorage.setItem('atd_last_dev_notice_at', n.created_at); continue; }
                if (n.notice_type === 'force_reload') { localStorage.setItem(seenKey,JSON.stringify(Array.from(seenSet).slice(-300))); localStorage.setItem('atd_last_dev_notice_at', n.created_at || new Date().toISOString()); location.reload(); return true; }
                if (n.notice_type === 'message') window.sendPushNotification('إشعار من المطور', String(n.message || ''), true);
                if (n.created_at) localStorage.setItem('atd_last_dev_notice_at', n.created_at);
            }
            localStorage.setItem(seenKey,JSON.stringify(Array.from(seenSet).slice(-300)));
            return true;
        } catch(e) {
            console.warn('[Developer Notices] fetch failed:', e);
            return false;
        }
    };


    let developerNoticePollTimer = null;
    window.startDeveloperNoticePolling = function() {
        if (developerNoticePollTimer) clearInterval(developerNoticePollTimer);
        developerNoticePollTimer = null;
        if (!dbClient || !currentTeam) return;
        window.fetchDeveloperNotices();
        developerNoticePollTimer = setInterval(() => {
            if (dbClient && currentTeam) window.fetchDeveloperNotices();
        }, 30000);
    };

    // مزامنة آمنة عند بقاء التطبيق مفتوحاً أو رجوعه من الخلفية.
    // نوقف المؤقتات أثناء الخلفية، ثم نتحقق من هوية الفريق قبل أول مزامنة عند الرجوع.
    window.__adtResumeSyncing = false;
    window.__adtSuppressTransientSyncAlerts = false;

    window.stopSecureBackgroundPolling = function() {
        if (window.__adtSecureSyncTimer) clearInterval(window.__adtSecureSyncTimer);
        window.__adtSecureSyncTimer = null;
        if (developerNoticePollTimer) clearInterval(developerNoticePollTimer);
        developerNoticePollTimer = null;
    };

    window.validateActiveSession = async function(options={}) {
        const allowLogout = options.allowLogout !== false;
        const token = String(window.getSessionToken?.() || '');
        if (!token || !dbClient || isGhostMode) return true;
        const { data, error } = await dbClient.rpc('adt_validate_session', {
            p_session_token: token,
            p_device_id: getDeviceId()
        });
        if (error) throw error;

        // تحقق مستقل من الفريق/العضوية في كل دورة، لأن صلاحية session قد تبقى
        // صحيحة حتى بعد حذف الفريق. لا نعتمد على adt_validate_session وحدها.
        const teamId=String(currentTeam?.id||localStorage.getItem('atd_sales_team_id')||'');
        if(teamId && !isGhostMode){
            try{
                const check=await dbClient.rpc('adt_get_my_context',{p_team_id:teamId,p_user_id:getDeviceId()});
                if(!check.error && (!check.data || !check.data.team || !check.data.member)){
                    // لا نخرج العضو بسبب استجابة ناقصة عابرة من الشبكة/Supabase.
                    // أثناء تعديل الصلاحيات قد تتأخر قراءة سياق العضو؛ ننتظر 6 فحوصات مؤكدة قبل الخروج.
                    window.__adtMissingTeamContextChecks=(window.__adtMissingTeamContextChecks||0)+1;
                    if(window.__adtMissingTeamContextChecks>=6){
                        if(allowLogout){
                            window.forceRemoteSessionLogout('session_ended');
                            return false;
                        }
                        return true;
                    }
                    return true;
                }
                window.__adtMissingTeamContextChecks=0;
            }catch(e){
                // فشل الاتصال لا يعني حذف الفريق؛ اترك الجلسة كما هي مؤقتاً.
                console.warn('[Team Access Check] deferred:', e);
                return true;
            }
        }

        // لا نخرج المستخدم من التطبيق بسبب استجابة عابرة أو اختلاف شكل نتيجة RPC.
        // بعض نسخ الدالة تعيد boolean، وبعضها قد يعيد كائنًا يحتوي على valid/ok.
        const sessionIsValid = data === true || data?.valid === true || data?.ok === true || data?.authenticated === true;
        if (sessionIsValid) {
            window.__adtInvalidSessionChecks = 0;
            return true;
        }

        // انتهاء الجلسة فعليًا يحتاج 3 نتائج فشل متتالية؛ الضغط على الجرد أو
        // تأخر Supabase/WebView لا يجب أن يخرج العضو من الفريق.
        window.__adtInvalidSessionChecks = (window.__adtInvalidSessionChecks || 0) + 1;
        if (window.__adtInvalidSessionChecks < 3) {
            console.warn('[Session Check] deferred invalid session result:', data);
            return true;
        }
        if(!allowLogout){
            console.warn('[Session Check] sync result ignored for logout; dedicated session check will decide.', data);
            return true;
        }
        window.forceRemoteSessionLogout('session_ended');
        return false;
    };

    window.clearDeletedTeamNotice = function(){
        localStorage.removeItem('adt_team_deleted_notice_v194');
        localStorage.removeItem('adt_team_deleted_notice_v225');
        const modal=document.getElementById('teamDeletedModal');
        if(modal) modal.style.display='none';
    };

    window.hasMandatoryAccessOverlay = function(){
        return ['adtStockControlLock','teamSuspendedModal','subscriptionExpiredModal','adtUpdateModal']
            .some(id => document.getElementById(id)?.style.display === 'flex');
    };

    window.showDeletedTeamNoticeIfAllowed = function(){
        let notice=null;
        try { notice=JSON.parse(localStorage.getItem('adt_team_deleted_notice_v225')||'null'); } catch(_) {}
        if(!notice || !notice.team_id || !notice.user_id){ window.clearDeletedTeamNotice(); return false; }
        if(Date.now()-Number(notice.created_at||0) > 7*24*60*60*1000){ window.clearDeletedTeamNotice(); return false; }
        if(window.hasMandatoryAccessOverlay()) return false;
        const modal=document.getElementById('teamDeletedModal');
        if(modal) modal.style.display='flex';
        window.releaseStartupSurface?.();
        return true;
    };

    window.forceRemoteSessionLogout = function(reason) {
        localStorage.setItem('adt_intro_completed_v3','1');
        if(reason==='access_removed') {
            localStorage.setItem('adt_team_deleted_notice_v225', JSON.stringify({
                team_id:String(currentTeam?.id||localStorage.getItem('atd_sales_team_id')||''),
                user_id:String(getDeviceId()||''),
                created_at:Date.now()
            }));
            localStorage.removeItem('adt_signed_out_notice_v146');
        } else {
            window.clearDeletedTeamNotice();
            localStorage.setItem('adt_signed_out_notice_v146', '1');
        }
        localStorage.setItem('atd_sales_signed_out', 'true');
        ['atd_sales_team_id','atd_sales_user_role','atd_sales_user_name'].forEach(k => localStorage.removeItem(k)); window.clearSessionToken?.();
        currentTeam = null;
        window.stopSecureBackgroundPolling?.();
        location.reload();
    };

    window.acknowledgeDeletedTeam = function(){
        window.clearDeletedTeamNotice();
        window.showAuthAfterMandatoryIntro?.();
    };

    window.resumeSecureSessionAndSync = async function() {
        if (window.__adtResumeSyncing || document.hidden || !dbClient || !currentTeam) return;
        window.__adtResumeSyncing = true;
        window.__adtSuppressTransientSyncAlerts = true;
        try {
            const teamId = String(currentTeam.id);
            // المزامنة لا تملك صلاحية إخراج المستخدم من الفريق.
            // قرار الخروج يترك فقط لفحص الجلسة/العضوية المخصص.
            if (!(await window.validateActiveSession({allowLogout:false}))) return;

            // في وضع التصفح صلاحية المطور هي التي تسمح بالقراءة، فلا نستبدل الفريق المتصفح.
            if (!isGhostMode) {
                const { data: ctx, error } = await dbClient.rpc('adt_get_my_context', {
                    p_team_id: teamId,
                    p_user_id: getDeviceId()
                });
                if (error) throw error;
                if (!ctx || !ctx.team || !ctx.member) {
                    console.warn('[Resume Sync] team context unavailable; keeping local session and cached data.');
                    return;
                }

                const m = ctx.member;
                if (m.status !== 'approved' && m.role !== 'manager') throw new Error('SESSION_NOT_APPROVED');

                window.applyCurrentMemberContext(m, ctx.team);
            }

            // مهلة قصيرة للـWebView/الشبكة بعد الرجوع من الخلفية.
            await new Promise(resolve => setTimeout(resolve, 350));
            if (document.hidden || !currentTeam || String(currentTeam.id) !== teamId) return;

            const results = await Promise.all([
                window.fetchProductsIfDue(true),
                window.fetchShortagesFromSupabase(),
                window.fetchDebtsFromSupabase(),
                window.fetchDamagedGoods(false),
                window.fetchMoneyRecords(false)
            ]);
            window.updateSyncBadge(results.every(v => v !== false));
        } catch (e) {
            console.warn('[Resume Sync] deferred:', e);
            window.updateSyncBadge(false);
            // لا نظهر نافذة مزعجة عند الرجوع من الخلفية؛ البيانات المحلية تبقى كما هي.
        } finally {
            window.__adtSuppressTransientSyncAlerts = false;
            window.__adtResumeSyncing = false;
            if (!document.hidden && dbClient && currentTeam) window.setupRealtimeSubscription();
        }
    };

    window.adtEnsurePushBoundToCurrentTeam = async function() {
        if (isGhostMode || !currentTeam) return false;
        try {
            const teamId = String(currentTeam.id);
            const userId = getDeviceId();
                await window.tryCaptureNativePushToken?.();
            const token = String(window.__adtFcmToken || window.Android?.getFcmToken?.() || '').trim();
            if (!token || !dbClient || !currentTeam) return false;
            const { data, error } = await dbClient.rpc('adt_register_push_token', {
                p_team_id: teamId, p_user_id: userId, p_token: token, p_platform: 'android'
            });
            if (error || data !== true) throw error || new Error('TOKEN_REBIND_REJECTED');
            localStorage.setItem('atd_push_bound_team_id', teamId);
            localStorage.setItem('atd_push_bound_user_id', userId);
                        localStorage.setItem('atd_push_last_sync_at', String(Date.now()));
            return true;
        } catch(e) {
            console.warn('[Push] team rebind deferred:', e);
            return false;
        }
    };

    window.adtHandleNativeResume = function(){
        if(document.hidden || !dbClient || !currentTeam) return;
        // Rejoin Realtime immediately; this is a connection recovery path, not
        // an application-data polling loop.
        try{ window.setupRealtimeSubscription?.(); }catch(_){}
        setTimeout(()=>window.resumeSecureSessionAndSync(),180);
        setTimeout(()=>window.adtEnsurePushBoundToCurrentTeam(),350);
        setTimeout(()=>window.checkLatestAppRelease(),800);
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            window.stopSecureBackgroundPolling();
        } else {
            window.adtHandleNativeResume?.();
        }
    });

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) setTimeout(() => window.resumeSecureSessionAndSync(), 250);
    });

    window.focusProductsSearch = function() {
        const box = document.getElementById('searchBox');
        if (!box) return;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => box.focus(), 220);
    };

    window.syncBottomMask = function() {
        const nav = document.querySelector('.bottom-nav.adt-bottom-nav.adt-home-only-nav');
        const mask = document.getElementById('adtBottomOcclusionMask');
        if (!nav || !mask) return;
        const top = Math.max(0, Math.round(nav.getBoundingClientRect().top) - 3);
        document.documentElement.style.setProperty('--adt-nav-top', `${top}px`);
        mask.style.top = `${top}px`;
    };

    // التنقل والتحكم بالأزرار العائمة لكل صفحة
    window.switchTab = function(tabName, pushState = true, skipAccessCheck = false) {
        // عند مغادرة واجهة الجرد امسح عبارة البحث ونتائجها بالكامل.
        if (typeof currentTab !== 'undefined' && currentTab === 'audit' && tabName !== 'audit' && typeof window.clearAuditSearch === 'function') {
            window.clearAuditSearch();
        }
        if (!skipAccessCheck && tabName === 'audit' && !window.canAudit()) {
            // الجرد ينتظر تثبيت حالة الباقة/الصلاحية بصمت؛ لا تعرض تنبيه اشتراك مؤقت.
            tabName = 'home';
        } else if (!skipAccessCheck && tabName === 'groceryAudit' && !window.isDeveloperGroceryAuditAllowed?.()) {
            // الجرد السريع يستخدم نفس سياسة جرد محلك: لا تنبيه اشتراك عابر.
            tabName = 'home';
        } else if (tabName === 'debts' && !window.canEditDebts()) {
            window.customAlert('صلاحية مقفلة', 'واجهة الديون مخفية عن هذا الحساب. اطلب تفعيل صلاحيتها من المدير.');
            tabName = 'home';
        } else if (tabName === 'shortages' && !window.canManageShortages()) {
            window.customAlert('صلاحية مقفلة', 'واجهة النواقص مخفية عن هذا الحساب. اطلب تفعيل صلاحيتها من المدير.');
            tabName = 'home';
        } else if (tabName === 'dailySales' && !window.canManageDailySales()) {
            window.customAlert('صلاحية مقفلة', 'المبيعات اليومية تحتاج تفعيل صلاحيتها من مدير الفريق.');
            tabName = 'home';
        }
        currentTab = tabName;
        document.body.setAttribute('data-adt-tab', String(tabName || 'home'));
        const bottomNav = document.querySelector('.bottom-nav.adt-bottom-nav.adt-home-only-nav');
        if (bottomNav) bottomNav.style.display = 'flex';
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        
        const targetPage = document.getElementById(`page${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
        if (targetPage) targetPage.classList.add('active');

        const fabAdd = document.getElementById('fabAddBtn');
        const inlineAddProduct = document.getElementById('btnInlineAddProduct');
        const fabDebt = document.getElementById('fabAddDebtBtn');
        const fabSupp = document.getElementById('fabAddSupplierBtn');
        const fabSearch = document.getElementById('fabSearchShortageBtn');
        const fabAuditSearch = document.getElementById('fabSearchAuditBtn');
        const fabProdSearch = document.getElementById('fabSearchProductsBtn');
        const storeBar = document.getElementById('storeSubBarContainer');
        const pageTitleBar = document.getElementById('currentPageTitleBar');
        const pageTitles = {
            home: 'الشاشة الرئيسية',
            products: 'واجهة المنتجات',
            shortages: 'واجهة النواقص',
            recent: 'التعديلات الأخيرة',
            audit: window.auditMode === 'retail' ? 'واجهة جرد القطاعي' : 'واجهة جـرد مـحلـک',
            groceryAudit: 'جرد سريع',
            debts: 'الحسابات والديون',
            damagedGoods: 'البضاعة التالفة والمنتهية',
            moneyRecords: activeMoneyType==='customer'?'استلام أموال من العملاء':'دفعات الموردين',
            moneyPartyDetail: activeMoneyType==='customer'?'سجل استلام العميل':'سجل دفعات المورد',
            dailySales: 'المبيعات اليومية'
        };
        if (storeBar) storeBar.style.display = (tabName === 'home') ? 'flex' : 'none';
        const headerStoreName = document.getElementById('adtHeaderTagline');
        if (headerStoreName) headerStoreName.style.setProperty('display', (tabName === 'home') ? 'flex' : 'none', 'important');
        if (pageTitleBar) {
            pageTitleBar.style.display = (tabName === 'home') ? 'none' : 'block';
            pageTitleBar.textContent = pageTitles[tabName] || 'الواجهة';
        }

        if (fabAdd) fabAdd.style.display = 'none';
        if (inlineAddProduct) inlineAddProduct.style.display = (tabName === 'products' && window.canEditBuyPrice()) ? 'inline-flex' : 'none';
        if (fabDebt) fabDebt.style.display = (tabName === 'debts') ? 'flex' : 'none';
        if (fabSupp) fabSupp.style.display = (tabName === 'shortages') ? 'flex' : 'none';
        if (fabSearch) fabSearch.style.display = (tabName === 'shortages') ? 'flex' : 'none';
        if (fabAuditSearch) fabAuditSearch.style.display = (tabName === 'audit') ? 'flex' : 'none';
        if (fabProdSearch) fabProdSearch.style.display = 'none';

        if (tabName === 'home') {
            window.renderHomeStats();
        } else if (tabName === 'products') {
            window.renderProducts();
        } else if (tabName === 'shortages') {
            window.renderShortagesView();
        } else if (tabName === 'recent') {
            window.renderRecentProducts();
        } else if (tabName === 'audit') {
            window.renderAudit();
        } else if (tabName === 'groceryAudit') {
            window.loadGroceryAudit?.();
            window.populateGrocerySuggestions?.();
            window.renderGroceryAudit?.();
        } else if (tabName === 'debts') {
            window.renderDebts();
        } else if (tabName === 'damagedGoods') {
            window.fetchDamagedGoods();
        } else if (tabName === 'moneyRecords') {
            window.renderMoneyParties();
        } else if (tabName === 'moneyPartyDetail') {
            window.renderMoneyPartyDetail();
        } else if (tabName === 'dailySales') {
            window.fetchDailySales(false);
        }

        if (pushState) {
            history.pushState({ tab: tabName }, '', location.href);
        }
        requestAnimationFrame(window.syncBottomMask);
    };

    window.focusShortageSearch = function() {
        const inp = document.getElementById('shortageQuickSearchInput');
        if (inp) {
            inp.focus();
            const mainContent = document.querySelector('.app-main-content');
            if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    window.focusAuditSearch = function() {
        const inp = document.getElementById('searchAuditBox');
        if (inp) {
            inp.focus();
            const mainContent = document.querySelector('.app-main-content');
            if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // فحص مدة الاشتراك وشريط التنبيه قبل يومين
    window.checkTeamLockState = function() {
        let isTeamLocked = (currentTeam && currentTeam.is_locked);
        let isTeamFrozen = (currentTeam && currentTeam.is_frozen);

        // أغلق أي نافذة قديمة أولاً؛ سيعاد فتحها أدناه إذا كانت الحالة ما زالت تمنع الاستخدام.
        const expiredModal = document.getElementById('subscriptionExpiredModal');
        const suspendedModal = document.getElementById('teamSuspendedModal');
        if (expiredModal) expiredModal.style.display = 'none';
        if (suspendedModal) suspendedModal.style.display = 'none';

        const warnBanner = document.getElementById('expiryWarningBanner');
        const daysText = document.getElementById('daysRemainingText');
        const dExpiry = document.getElementById('drawerExpiryTag');
        const currentTeamId = String(currentTeam?.id || '');
        const isDevPermanentTeam = !!(
            currentTeamId && (
                (window.isProtectedDeveloperTeamId && window.isProtectedDeveloperTeamId(currentTeamId)) ||
                (window.isDeveloperAccount && window.isDeveloperAccount())
            )
        );

        if (isDevPermanentTeam) {
            if (dExpiry) { dExpiry.style.display=(userRole==='member'||userRole==='sub_manager')?'none':'block'; dExpiry.innerText=(userRole==='member'||userRole==='sub_manager')?'':'الاشتراك: دائم'; }
            if (warnBanner) warnBanner.style.display = 'none';
        } else if (currentTeam && currentTeam.expires_at) {
            let expiry = new Date(currentTeam.expires_at).getTime();
            let diffDays = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));

            if (dExpiry) {
                if (userRole==='member' || userRole==='sub_manager') { dExpiry.style.display='none'; dExpiry.innerText=''; }
                else { dExpiry.style.display='block'; dExpiry.innerText = diffDays > 0 ? `الاشتراك: متبقي ${diffDays} أيام` : 'الاشتراك: منتهي'; }
            }

            if (diffDays > 0 && diffDays <= 2) {
                if (warnBanner && daysText) {
                    daysText.innerText = diffDays;
                    warnBanner.style.display = 'flex';
                }
            } else if (warnBanner) {
                warnBanner.style.display = 'none';
            }

            if (Date.now() > expiry && !isDevPermanentTeam && !window.isDeveloperAccount()) {
                if (expiredModal) expiredModal.style.display = 'flex';
                return;
            }
        } else {
            if (dExpiry) { dExpiry.style.display=(userRole==='member'||userRole==='sub_manager')?'none':'block'; dExpiry.innerText=(userRole==='member'||userRole==='sub_manager')?'':'الاشتراك: دائم'; }
            if (warnBanner) warnBanner.style.display = 'none';
        }

        if (isTeamFrozen && !isDevPermanentTeam && !window.isDeveloperAccount()) {
            const deleted=document.getElementById('teamDeletedModal');if(deleted)deleted.style.display='none';
            document.getElementById('suspendedTitleText').innerText = "المتجر مجمد حالياً";
            document.getElementById('suspendedMsgText').innerText = "تم تجميد المتجر من قبل المطور. يرجى التواصل للمتابعة.";
            document.getElementById('teamSuspendedModal').style.display = 'flex';
            return;
        }

        if (isTeamLocked && !isDevPermanentTeam && !window.isDeveloperAccount()) {
            const deleted=document.getElementById('teamDeletedModal');if(deleted)deleted.style.display='none';
            document.getElementById('suspendedTitleText').innerText = "المتجر متوقف حالياً";
            document.getElementById('suspendedMsgText').innerText = "تم إيقاف التطبيق مؤقتاً لوضع الصيانة.";
            document.getElementById('teamSuspendedModal').style.display = 'flex';
        } else {
            document.getElementById('teamSuspendedModal').style.display = 'none';
        }
    };

    // V176: حرر Splash النظام فقط بعد تجهيز شاشة البداية الصحيحة فعلياً.
    window.__adtStartupSurfaceReleased = false;
    window.releaseStartupSurface = function(){
        const finish = () => {
            try { document.documentElement.classList.remove('adt-startup-lock'); } catch(_) {}
            if (window.__adtStartupSurfaceReleased) return;
            window.__adtStartupSurfaceReleased = true;
            try {
                if (window.Android && typeof window.Android.markStartupReady === 'function') {
                    window.Android.markStartupReady();
                }
            } catch(_) {}
        };
        try { requestAnimationFrame(() => requestAnimationFrame(finish)); }
        catch(_) { setTimeout(finish, 0); }
    };

    // V174: اختيار اللغة أولاً، ثم البلد/العملة، ثم التعريف الإجباري قبل تسجيل الدخول.
    window.adtAuthLanguage = localStorage.getItem('adt_app_language_v173') || 'ar';
    window.adtIntroStage = 'language';
    window.adtIntroIndex = 0;
    window.__adtProductViewIndex = null;
    window.__adtLoginIntroPassed = false;
    window.adtIntroCopy = {
        ar: [
            {title:'إدارة المخزون بسهولة', text:'أضف أصنافك وتابع الكميات وأسعار البيع والشراء من واجهة واحدة سريعة وواضحة.'},
            {title:'جرد أسرع وأكثر دقة', text:'استخدم جـرد مـحلـک بالصندوق أو القطعة، واحفظ النتائج وتابع قيمة المخزون بدون خطوات معقدة.'},
            {title:'إدارة نشاطك من مكان واحد', text:'تابع الديون والفواتير والمبيعات اليومية والفريق والصلاحيات داخل ADT Stock.'}
        ],
        en: [
            {title:'Simple inventory management', text:'Add products and keep track of quantities, purchase prices and selling prices from one clear workspace.'},
            {title:'Faster, more accurate stocktaking', text:'Use wholesale and retail stocktaking, save results and follow inventory value with fewer steps.'},
            {title:'Run your business in one place', text:'Manage debts, invoices, daily sales, team members and permissions inside ADT Stock.'}
        ]
    };
    window.applyAuthLanguage = function(lang){
        lang = lang === 'en' ? 'en' : 'ar';
        window.adtAuthLanguage = lang;
        localStorage.setItem('adt_app_language_v173', lang);
        const en = lang === 'en';
        const shell=document.getElementById('adtIntroShell'); if(shell) shell.dir=en?'ltr':'rtl';
        const authBox=document.querySelector('#onboardingModal .adt-auth-box'); if(authBox){ authBox.dir=en?'ltr':'rtl'; authBox.style.textAlign=en?'left':'right'; }
        const set=(id,a,b)=>{const el=document.getElementById(id);if(el)el.textContent=en?b:a;};
        set('adtIntroLanguageTitle','اختر اللغة','Choose language');
        set('adtIntroLanguageSub','اختر لغة البداية قبل الدخول إلى التطبيق','Choose your language before entering the app');
        set('adtIntroCountryTitle','اختر البلد','Choose country');
        set('adtIntroCountrySub','سيتم ضبط عملة التطبيق تلقائياً حسب البلد','The app currency will be set automatically for your country');
        set('adtCountryConfirmBtn','تأكيد اختيار البلد','Confirm country');
        const cs=document.getElementById('adtCountrySearch'); if(cs)cs.placeholder=en?'Search country':'ابحث عن البلد';
        set('authLoginTitle','تسجيل الدخول','Sign in');
        set('authLoginSubtitle','مرحباً بك، يرجى تسجيل الدخول للمتابعة','Welcome back. Sign in to continue');
        const t1=document.getElementById('tabBtnMgrLogin'); if(t1)t1.textContent=en?'Sign in':'تسجيل الدخول';
        const t2=document.getElementById('tabBtnNewTeam'); if(t2)t2.textContent=en?'Create store':'إنشاء حساب';
        const t3=document.getElementById('tabBtnJoinTeam'); if(t3)t3.textContent=en?'Join':'انضمام';
        set('authPhoneLabel','رقم الهاتف','Phone number');
        set('authPasswordLabel','كلمة المرور','Password');
        set('authRememberLabel','تذكرني','Remember me');
        set('authLoginHint','اكتب رقم الهاتف وكلمة مرور حسابك فقط.','Enter your phone number and account password only.');
        set('authLoginSubmit','تسجيل الدخول','Sign in');
        set('authCreateLink','إنشاء حساب جديد','Create a new store');
        set('authJoinLink','الانضمام لـمحـل','Join a team');
        set('adtAuthChoiceKicker','اختر طريقة المتابعة','Choose how to continue');
        set('adtAuthChoiceTitle','ابدأ مع ADT Stock','Start with ADT Stock');
        set('adtAuthChoiceText','اختر العملية التي تريدها للمتابعة','Choose an option to continue');
        set('adtChoiceLogin','تسجيل الدخول','Sign in');
        set('adtChoiceCreate','إنشاء حساب جديد','Create a new account');
        set('adtChoiceJoin','الانضمام لـمحـل','Join a store');
        set('adtAuthChoiceNote','إنشاء الحساب يتضمن تسجيل المحل، ويمكنك الانضمام لـمحـل موجود من زر الانضمام','Only first-time joining needs the store code and password');
    };
    window.renderIntroCountries = function(query=''){
        const box=document.getElementById('adtCountryList'); if(!box)return;
        const en=window.adtAuthLanguage==='en';
        const q=String(query||'').trim().toLocaleLowerCase();
        const currentIso=window.__adtPendingCountryIso||'';
        const rows=window.ADT_COUNTRY_CURRENCIES.filter(x=>{
            if(!q)return true;
            return [x.country,x.countryEn,x.iso,x.code].some(v=>String(v||'').toLocaleLowerCase().includes(q));
        });
        box.innerHTML=rows.length?rows.map(x=>`<button type="button" class="adt-country-card ${x.iso===currentIso?'active':''}" onclick="window.selectIntroCountry('${x.iso}')"><span><b>${en?x.countryEn:x.country}</b><small>${x.code}</small></span><strong>${x.symbol}</strong></button>`).join(''):`<div class="adt-country-empty">${en?'No matching country':'لا توجد دولة مطابقة'}</div>`;
    };
    window.selectIntroCountry = function(iso){
        const row=window.ADT_COUNTRY_CURRENCIES.find(x=>x.iso===String(iso||''));
        if(!row)return;
        window.__adtPendingCountryIso=row.iso;
        const search=document.getElementById('adtCountrySearch');
        window.renderIntroCountries(search?.value||'');
        const btn=document.getElementById('adtCountryConfirmBtn'); if(btn)btn.disabled=false;
    };
    window.confirmIntroCountry = function(){
        const row=window.ADT_COUNTRY_CURRENCIES.find(x=>x.iso===String(window.__adtPendingCountryIso||''));
        if(!row){ window.customAlert?.(window.adtAuthLanguage==='en'?'Choose country':'اختر البلد',window.adtAuthLanguage==='en'?'Select a country first.':'حدد البلد أولاً ثم اضغط تأكيد.'); return; }
        localStorage.setItem('adt_app_country_iso',row.iso);
        localStorage.setItem('adt_app_currency_code',row.code);
        window.applyAppCurrency?.();
        window.adtIntroStage='slides'; window.adtIntroIndex=0;
        window.renderMandatoryIntro();
    };
    window.renderMandatoryIntro = function(){
        const modal=document.getElementById('adtIntroModal'); if(!modal)return;
        modal.style.display='flex';
        document.getElementById('onboardingModal')?.style.setProperty('display','none');
        const steps=[...modal.querySelectorAll('.adt-intro-step')]; steps.forEach(x=>x.classList.remove('active'));
        const foot=document.getElementById('adtIntroFooter');
        if(window.adtIntroStage==='language'){
            modal.querySelector('[data-intro-step="language"]')?.classList.add('active');
            if(foot)foot.style.display='none'; window.releaseStartupSurface?.(); return;
        }
        if(window.adtIntroStage==='country'){
            modal.querySelector('[data-intro-step="country"]')?.classList.add('active');
            if(foot)foot.style.display='none';
            const search=document.getElementById('adtCountrySearch'); if(search)search.value='';
            window.__adtPendingCountryIso='';
            const confirmBtn=document.getElementById('adtCountryConfirmBtn'); if(confirmBtn)confirmBtn.disabled=true;
            window.renderIntroCountries(''); window.releaseStartupSurface?.(); return;
        }
        if(window.adtIntroStage==='auth-choice'){
            modal.querySelector('[data-intro-step="auth-choice"]')?.classList.add('active');
            if(foot)foot.style.display='none';window.releaseStartupSurface?.();return;
        }
        const target=modal.querySelector(`[data-intro-step="${window.adtIntroIndex}"]`); if(target)target.classList.add('active');
        const copy=(window.adtIntroCopy[window.adtAuthLanguage]||window.adtIntroCopy.ar)[window.adtIntroIndex]||window.adtIntroCopy.ar[0];
        const title=target?.querySelector('[data-intro-title]'); if(title)title.textContent=copy.title;
        const text=target?.querySelector('[data-intro-text]'); if(text)text.textContent=copy.text;
        if(foot)foot.style.display='block';
        modal.querySelectorAll('.adt-intro-dots span').forEach((d,i)=>d.classList.toggle('active',i===window.adtIntroIndex));
        const btn=document.getElementById('adtIntroNextBtn'); if(btn)btn.textContent=(window.adtIntroIndex===2)?(window.adtAuthLanguage==='en'?'Get started':'ابدأ الآن'):(window.adtAuthLanguage==='en'?'Next':'التالي');
        window.releaseStartupSurface?.();
    };
    window.startMandatoryIntro = function(){
        window.__adtLoginIntroPassed=false;
        window.adtIntroStage='language'; window.adtIntroIndex=0;
        window.applyAuthLanguage(window.adtAuthLanguage);
        window.renderMandatoryIntro();
    };
    window.selectIntroLanguage = function(lang){
        window.applyAuthLanguage(lang);
        window.adtIntroStage='country'; window.adtIntroIndex=0;
        window.renderMandatoryIntro();
    };
    window.nextMandatoryIntro = function(){
        if(window.adtIntroStage!=='slides')return;
        if(window.adtIntroIndex < 2){ window.adtIntroIndex += 1; window.renderMandatoryIntro(); return; }
        localStorage.setItem('adt_intro_completed_v3','1');
        window.adtIntroStage='auth-choice';window.renderMandatoryIntro();
    };
    window.__adtLegacyOpenAuthFromIntro = window.openAuthFromIntro;
    window.returnToIntroAuthChoice=function(){const auth=document.getElementById('onboardingModal');if(auth)auth.style.display='none';window.adtIntroStage='auth-choice';window.renderMandatoryIntro();};
    window.showAuthAfterMandatoryIntro = function(){
        if(localStorage.getItem('adt_intro_completed_v3')==='1'){
            const intro=document.getElementById('adtIntroModal');if(intro)intro.style.display='none';
            const auth=document.getElementById('onboardingModal');if(auth)auth.style.display='flex';
            const tabs=document.getElementById('onboardingTabsRow');if(tabs)tabs.style.display='flex';
            window.showOnboardingSubTab?.('mgrLogin');
            window.releaseStartupSurface?.();
            return;
        }
        if(window.__adtLoginIntroPassed){ window.adtIntroStage='auth-choice';window.renderMandatoryIntro();return; }
        window.startMandatoryIntro();
    };

    // V173: سجل سعر الشراء محفوظ في Supabase ويظهر للمدير الرئيسي فقط.
    window.recordBuyPriceHistory = async function(product, oldPrice, newPrice){
        if(!dbClient || !currentTeam || !window.canEditBuyPrice() || !product?.id) return false;
        try{
            const {data,error}=await dbClient.rpc('adt_buy_price_history_record',{
                p_team_id:String(currentTeam.id), p_user_id:getDeviceId(), p_product_id:String(product.id),
                p_product_name:String(product.name||''), p_old_price:(oldPrice===null||oldPrice===undefined)?null:Number(oldPrice),
                p_new_price:Number(newPrice||0), p_actor_name:String(localStorage.getItem('atd_sales_user_name')||window.currentUserName||'مدير'),
                p_supplier_name:String(product.supplier_name||product.supplier||'')
            });
            if(error) throw error;
            return data===true;
        }catch(e){ console.warn('[Buy Price History] record failed:',e); return false; }
    };
    window.openBuyPriceHistoryFromView = function(){
        const idx=Number(window.__adtProductViewIndex); if(!Number.isInteger(idx))return;
        window.openBuyPriceHistory(idx);
    };
    window.openBuyPriceHistory = async function(index){
        if(!window.canEditBuyPrice()){window.customAlert('غير مسموح','سجل سعر الشراء متاح لمدير الفريق الرئيسي فقط.');return;}
        const p=products[index]; if(!p)return;
        const modal=document.getElementById('buyPriceHistoryModal'), list=document.getElementById('buyPriceHistoryList');
        document.getElementById('buyPriceHistoryProductName').textContent=p.name||'الصنف';
        if(list)list.innerHTML='<div style="padding:24px 8px;text-align:center;color:var(--text-muted);font-size:10px;font-weight:800">جاري تحميل السجل...</div>';
        window.openModalFront('buyPriceHistoryModal',18000);
        if(!dbClient||!currentTeam){if(list)list.innerHTML='<div style="padding:24px 8px;text-align:center;color:#ffbf00;font-size:10px;font-weight:800">يلزم الاتصال بالإنترنت لعرض السجل.</div>';return;}
        try{
            const {data,error}=await dbClient.rpc('adt_buy_price_history_fetch',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_product_id:String(p.id)});
            if(error)throw error;
            const rows=Array.isArray(data)?data:[];
            if(!rows.length){list.innerHTML='<div style="padding:24px 8px;text-align:center;color:var(--text-muted);font-size:10px;font-weight:800">لا توجد تغييرات مسجلة لسعر الشراء حتى الآن.</div>';return;}
            list.innerHTML=rows.map(r=>{
                const initial=r.old_price===null||r.old_price===undefined;
                const oldTxt=initial?'السعر الأولي':window.formatMoney(Number(r.old_price||0));
                const newTxt=window.formatMoney(Number(r.new_price||0));
                const dt=new Date(r.changed_at); const when=Number.isNaN(dt.getTime())?'':dt.toLocaleString('ar-LY-u-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
                const supplier=String(r.supplier_name||'').trim();
                return `<div class="adt-buy-history-row"><div class="adt-buy-history-prices"><strong>${window.escapeHtml(oldTxt)}</strong><span class="arrow">←</span><strong>${window.escapeHtml(newTxt)}</strong></div><div class="adt-buy-history-meta"><span>${window.escapeHtml(String(r.changed_by||'مدير'))}${supplier?' • '+window.escapeHtml(supplier):''}</span><span>${window.escapeHtml(when)}</span></div></div>`;
            }).join('');
        }catch(e){console.error('[Buy Price History] fetch failed:',e);list.innerHTML='<div style="padding:20px 8px;text-align:center;color:#ffbf00;font-size:10px;font-weight:800">تعذر تحميل السجل. تأكد من تشغيل SQL الخاص بالإصدار V173 في Supabase.</div>';}
    };

    // التحقق من الفريق وتسجيل الدخول وشاشة الانتظار
    window.checkAuthAndTeamServer = async function(options = {}) {
        const preserveCurrentTab = options.preserveCurrentTab !== false;
        if (localStorage.getItem('atd_sales_signed_out') === 'true') { window.showAuthAfterMandatoryIntro(); return; }
        const savedTeamId=localStorage.getItem('atd_sales_team_id');
        const savedRole=localStorage.getItem('atd_sales_user_role');
        const savedName=localStorage.getItem('atd_sales_user_name');
        if (!dbClient) {
            if (savedTeamId) {
                try { const snap=JSON.parse(localStorage.getItem(`atd_team_snapshot__${savedTeamId}`)||'null'); currentTeam=snap&&snap.id?snap:{id:savedTeamId,name:'الفريق المحفوظ',manager_name:savedName||'مستخدم'}; } catch(_){ currentTeam={id:savedTeamId,name:'الفريق المحفوظ',manager_name:savedName||'مستخدم'}; }
                userRole=savedRole||'member'; await window.loadTeamLocalCaches(savedTeamId); document.getElementById('onboardingModal').style.display='none'; window.updateUserProfileUI(savedName); window.renderProducts(); window.renderShortagesView(); window.renderDebts(); window.renderHomeStats(); if (!preserveCurrentTab) window.switchTab('home',false); window.releaseStartupSurface?.();
            } else window.showAuthAfterMandatoryIntro();
            return;
        }
        if (!savedTeamId) { window.showAuthAfterMandatoryIntro(); return; }
        try {
            if (!(await window.validateActiveSession())) return;
            const {data:ctx,error}=await dbClient.rpc('adt_get_my_context',{p_team_id:String(savedTeamId),p_user_id:getDeviceId()});
            if (error) throw error;
            if (!ctx || !ctx.team || !ctx.member) {
                // غياب سياق العضو قد يعني تسجيل الدخول من جهاز آخر؛ لا نعرض تنبيه حذف الفريق.
                window.forceRemoteSessionLogout('session_ended');
                return;
            }
            const m=ctx.member;
            if (m.status==='pending' && m.role!=='manager') { document.getElementById('onboardingModal').style.display='none'; document.getElementById('pendingApprovalModal').style.display='flex'; window.releaseStartupSurface?.(); return; }
            if (m.status!=='approved' && m.role!=='manager') { window.showAuthAfterMandatoryIntro(); return; }
            document.getElementById('pendingApprovalModal').style.display='none';
            currentTeam=ctx.team; userRole=m.role||savedRole||'member';
            window.applyCurrentMemberContext(m, ctx.team);
            await window.refreshPrimaryManagerStatus();
            if (userRole !== 'manager') {
                try { const ids=JSON.parse(localStorage.getItem('atd_developer_team_ids')||'[]'); localStorage.setItem('atd_developer_team_ids',JSON.stringify((Array.isArray(ids)?ids:[]).map(String).filter(id=>id!==String(currentTeam.id)))); } catch(_){}
                localStorage.removeItem('atd_dev_device_authorized'); developerSessionPin='';
            } else {
                try {
                    const code = String(currentTeam?.code || '').trim().toUpperCase();
                    if (code === '086') {
                        localStorage.setItem('atd_developer_team_ids', JSON.stringify([String(currentTeam.id)]));
                        localStorage.setItem('atd_dev_device_authorized','1');
                        currentTeam.features = { shortages:true, invoices:true };
                    } else {
                        const ids=JSON.parse(localStorage.getItem('atd_developer_team_ids')||'[]').map(String);
                        if(ids.includes(String(currentTeam.id))) localStorage.setItem('atd_dev_device_authorized','1');
                    }
                } catch(_){}
            }
            await window.loadTeamLocalCaches(currentTeam.id); window.saveCurrentTeamSnapshot(); localStorage.setItem('atd_sales_user_role',userRole); document.getElementById('onboardingModal').style.display='none';
            const leaveBtnItem=document.getElementById('drawerLeaveTeamItem'), memberLeaveBox=document.getElementById('memberLeaveBox');
            const canLeave=(userRole==='member'||userRole==='sub_manager'); if(leaveBtnItem) leaveBtnItem.style.display=canLeave?'flex':'none'; if(memberLeaveBox) memberLeaveBox.style.display=canLeave?'block':'none';
            window.checkTeamLockState(); window.updateUserProfileUI(localStorage.getItem('atd_sales_user_name')||(currentTeam.manager_name||'عضو'));
            await Promise.all([window.loadTeamMembers(),window.fetchProductsFromSupabase(),window.fetchShortagesFromSupabase(),window.fetchDebtsFromSupabase(),window.fetchDamagedGoods(false),window.fetchMoneyRecords(false)]);
            window.checkWeeklyDebtReminder();
            window.setupRealtimeSubscription(); try{await dbClient.rpc('adt_touch_team',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId()});}catch(_){} try{await window.fetchDeveloperNotices();}catch(_){} if (!preserveCurrentTab) window.switchTab('home',false); window.releaseStartupSurface?.();
        } catch(e) {
            console.error('[Auth] secure context failed:',e);
            // فشل الإنترنت/الخادم لا يعني تسجيل خروج. استخدم الجلسة المحلية المحفوظة.
            if (savedTeamId) {
                try {
                    const snap=JSON.parse(localStorage.getItem(`atd_team_snapshot__${savedTeamId}`)||'null');
                    currentTeam=(snap&&snap.id)?snap:{id:savedTeamId,name:'الفريق المحفوظ',manager_name:savedName||'مستخدم'};
                } catch(_) {
                    currentTeam={id:savedTeamId,name:'الفريق المحفوظ',manager_name:savedName||'مستخدم'};
                }
                userRole=savedRole||'member';
                await window.loadTeamLocalCaches(savedTeamId);
                document.getElementById('onboardingModal').style.display='none';
                window.updateUserProfileUI(savedName);
                window.renderProducts(); window.renderShortagesView(); window.renderDebts(); window.renderHomeStats();
                if (!preserveCurrentTab) window.switchTab('home',false);
                window.releaseStartupSurface?.();
            } else {
                window.showAuthAfterMandatoryIntro();
            }
        }
    };


    // V144: استعادة الجلسة المحلية فوراً عند فتح التطبيق.
    // لا ننتظر Supabase حتى نتذكر اسم المدير/الفريق والواجهة؛ التحقق والتحديث يتمان بالخلفية.
    window.checkAuthAndTeam = async function() {
        const signedOut = localStorage.getItem('atd_sales_signed_out') === 'true';
        const savedTeamId = String(localStorage.getItem('atd_sales_team_id') || '');
        const savedRole = localStorage.getItem('atd_sales_user_role') || 'member';
        const savedName = localStorage.getItem('atd_sales_user_name') || '';

        if (signedOut || !savedTeamId) {
            return window.checkAuthAndTeamServer();
        }

        // 1) أظهر هوية الجلسة والواجهة فوراً من آخر Snapshot محفوظ.
        try {
            const snap = JSON.parse(localStorage.getItem(`atd_team_snapshot__${savedTeamId}`) || 'null');
            currentTeam = (snap && snap.id) ? snap : {
                id: savedTeamId,
                name: 'الفريق المحفوظ',
                manager_name: savedName || 'مستخدم'
            };
        } catch (_) {
            currentTeam = { id: savedTeamId, name: 'الفريق المحفوظ', manager_name: savedName || 'مستخدم' };
        }
        userRole = savedRole;
        document.getElementById('onboardingModal').style.display = 'none';
        window.updateUserProfileUI(savedName || currentTeam?.manager_name || 'مستخدم');
        window.checkTeamLockState();
        window.switchTab('home', false);
        window.releaseStartupSurface?.();

        // 2) حمّل آخر بيانات محلية بدون تعطيل ظهور الاسم/الفريق والواجهة.
        void window.loadTeamLocalCaches(savedTeamId).then(() => {
            try { window.renderProducts(); } catch (_) {}
            try { window.renderShortagesView(); } catch (_) {}
            try { window.renderDebts(); } catch (_) {}
            try { window.renderHomeStats(); } catch (_) {}
        }).catch(e => console.warn('[Fast Restore] local cache failed:', e));

        // 3) تحقق من Supabase وحدّث الصلاحيات والبيانات في الخلفية.
        // الدالة الأصلية محفوظة كما هي حتى لا نفقد أي حماية أو مزامنة.
        void window.checkAuthAndTeamServer({ preserveCurrentTab:true }).catch(e => console.warn('[Fast Restore] server refresh failed:', e));
    };

    window.showOnboardingSubTab = function(type) {
        const forms = {
            mgrLogin: document.getElementById('subFormMgrLogin'),
            newTeam: document.getElementById('subFormNewTeam'),
            joinTeam: document.getElementById('subFormJoinTeam')
        };
        const tabs = {
            mgrLogin: document.getElementById('tabBtnMgrLogin'),
            newTeam: document.getElementById('tabBtnNewTeam'),
            joinTeam: document.getElementById('tabBtnJoinTeam')
        };

        Object.values(forms).forEach(el => {
            if (!el) return;
            el.classList.remove('active');
            el.setAttribute('aria-hidden', 'true');
        });
        Object.values(tabs).forEach(el => el?.classList.remove('active'));

        const form = forms[type] || forms.mgrLogin;
        const tab = tabs[type] || tabs.mgrLogin;
        if (form) {
            form.classList.add('active');
            form.setAttribute('aria-hidden', 'false');
        }
        tab?.classList.add('active');
    };

    window.handleManagerLogin = async function() {
        if (isLoggingIn) return;
        developerSessionPin = '';
        isGhostMode = false;
        document.body.classList.remove('adt-ghost-mode');
        localStorage.removeItem('atd_original_team_id');
        const phone = document.getElementById('mgrLoginPhoneInput').value.trim();
        const password = document.getElementById('mgrLoginPassInput').value.trim();

        if (!phone || !password) {
            window.customAlert('بيانات ناقصة', 'يرجى كتابة رقم الهاتف وكلمة المرور.');
            return;
        }

        isLoggingIn = true;
        const loginBtn = document.querySelector('#subFormMgrLogin .adt-auth-submit');
        const loginBtnOriginalText = loginBtn?.textContent || 'تسجيل الدخول';
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = 'جارٍ تسجيل الدخول…';
            loginBtn.setAttribute('aria-busy', 'true');
        }
        if (!dbClient) window.initSupabaseClient();

        try {
            const loginArgs = {
                p_phone: phone,
                p_password: password,
                p_device_id: getDeviceId()
            };
            const { data, error } = await dbClient.rpc('adt_account_login_v198', loginArgs);
            if (error) throw error;
            const loginResult = Array.isArray(data) ? data[0] : data;
            let teamData = loginResult?.team || null;
            const memberData = loginResult?.member || null;

            if (!teamData || !teamData.id) {
                window.customAlert('فشل الدخول', 'رقم الهاتف أو كلمة السر غير صحيحة.');
                return;
            }

            const accountRole = String(memberData?.role || loginResult?.role || 'member');
            let mgrName = memberData?.user_name || teamData.manager_name || DEFAULT_MANAGER_NAME;
            const sessionToken = String(loginResult?.session_token || '');
            // V198 member login intentionally returns an empty session_token; member identity
            // is checked against team_members.user_id. Require native token storage only when
            // the server actually issues a token (normally manager login).
            if (sessionToken) {
                if (!window.setSessionToken?.(sessionToken)) throw new Error('SECURE_SESSION_STORAGE_UNAVAILABLE');
            } else if (accountRole === 'manager') {
                throw new Error('SECURE_SESSION_TOKEN_MISSING');
            } else {
                window.clearSessionToken?.();
            }
            // Persist the selected team only after authentication storage is handled, so a failed
            // login cannot make startup silently reopen a stale cached team.
            localStorage.removeItem('atd_sales_signed_out');
            localStorage.setItem('atd_sales_team_id', teamData.id);
            localStorage.setItem('atd_sales_user_role', accountRole);
            localStorage.setItem('atd_sales_user_name', mgrName);
            currentTeam = teamData;
            const realtimeProvisioned = await window.provisionRealtimeDeviceCredential?.(phone,password);
            if (!realtimeProvisioned) console.warn('[Realtime] device credential provisioning failed; live updates will retry after the next successful login.');
            await window.loadTeamLocalCaches(currentTeam.id);
            window.saveCurrentTeamSnapshot();
            userRole = accountRole;
            if (memberData) window.applyCurrentMemberContext(memberData, teamData);
            // لا نؤخر تسجيل الدخول بطلب شبكة ثانٍ للتحقق من المدير الرئيسي.
            // يبدأ التحقق بعد فتح الواجهة، ثم يعاد رسم المنتجات لتطبيق الصلاحيات الصحيحة.
            const primaryManagerRefreshTask = window.refreshPrimaryManagerStatus()
                .then(() => { try { window.renderProducts(); } catch (_) {} })
                .catch(e => console.warn('[Primary Manager] background verification failed:', e));
            try {
                const code=String(currentTeam?.code||'').trim().toUpperCase();
                if(accountRole === 'manager' && code==='086'){
                    localStorage.setItem('atd_developer_team_ids',JSON.stringify([String(currentTeam.id)]));
                    localStorage.setItem('atd_dev_device_authorized','1');
                    currentTeam.features={shortages:true,invoices:true};
                    window.saveCurrentTeamSnapshot();
                }else{
                    const ids=JSON.parse(localStorage.getItem('atd_developer_team_ids')||'[]');
                    const known=accountRole === 'manager' && Array.isArray(ids)&&ids.map(String).includes(String(currentTeam.id));
                    if(known) localStorage.setItem('atd_dev_device_authorized','1');
                    else localStorage.removeItem('atd_dev_device_authorized');
                }
            } catch(_){ localStorage.removeItem('atd_dev_device_authorized'); }

            document.getElementById('onboardingModal').style.display = 'none';
            window.showToast(`أهلاً بك ${mgrName} (${teamData.name})`);
            window.updateUserProfileUI(mgrName);
            window.updateTeamMenuLabel?.();
            window.checkTeamLockState();
            window.switchTab('home', false);
            window.setupRealtimeSubscription();

            // لا نؤخر فتح الواجهة بسبب مزامنة البيانات؛ كل المهام الأصلية تستمر في الخلفية.
            void Promise.allSettled([
                window.loadTeamMembers(),
                window.fetchProductsFromSupabase(),
                window.fetchShortagesFromSupabase(),
                window.fetchDebtsFromSupabase(),
                window.fetchDeveloperNotices()
            ]).then(results => {
                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        console.warn('[Manager Login] background sync task failed:', index, result.reason);
                    }
                });
            });
        } catch(e) {
            console.error('[Manager Login] failed:', e);
            const rawLoginError = String(e?.message || '');
            const loginError = rawLoginError.toUpperCase();
            if (loginError.includes('SECURE_SESSION_STORAGE_UNAVAILABLE') || loginError.includes('SECURE_SESSION_TOKEN_MISSING')) {
                // Do not let a previous cached team reopen after a rejected login attempt.
                ['atd_sales_team_id','atd_sales_user_role','atd_sales_user_name'].forEach(k => localStorage.removeItem(k));
                localStorage.setItem('atd_sales_signed_out', 'true');
                currentTeam = null;
                window.clearSessionToken?.();
                window.clearRealtimeAuthToken?.();
                window.clearRealtimeDeviceCredential?.();
            }
            if (loginError.includes('MEMBER_NOT_APPROVED')) {
                window.customAlert('الحساب غير معتمد', 'هذا الرقم موجود في الفريق لكن طلب الانضمام لم تتم الموافقة عليه بعد.');
            } else if (loginError.includes('PASSWORD_SETUP_REQUIRED')) {
                window.customAlert('أنشئ كلمة مرورك أولاً', 'هذا حساب عضو قديم. افتح «الانضمام لـمحـل» مرة واحدة، واكتب كود المحل وكلمة سره ثم أنشئ كلمة مرور خاصة بك.');
            } else if (loginError.includes('MEMBER_NOT_FOUND')) {
                window.customAlert('الحساب غير موجود', 'هذا الرقم غير مسجل. استخدم «الانضمام لـمحـل» أول مرة فقط.');
            } else if (loginError.includes('INVALID_TEAM_CREDENTIALS') || loginError.includes('INVALID_LOGIN')) {
                window.customAlert('فشل الدخول', 'رقم الهاتف أو كلمة المرور غير صحيحة.');
            } else if (loginError.includes('PGRST202') || loginError.includes('COULD NOT FIND THE FUNCTION') || loginError.includes('SCHEMA CACHE')) {
                window.customAlert('تحديث قاعدة البيانات مطلوب', 'دخول الأعضاء من شاشة تسجيل الدخول يحتاج تشغيل ملف SQL المرفق مرة واحدة في Supabase.');
            } else {
                window.customAlert('تعذر الاتصال', 'لم يتم تغيير الحساب. تحقق من الإنترنت ثم حاول مرة أخرى.\n\nالسبب: ' + (e?.message || 'خطأ غير معروف'));
            }
        } finally {
            isLoggingIn = false;
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = loginBtnOriginalText;
                loginBtn.removeAttribute('aria-busy');
            }
        }
    };

    // إنشاء الحساب والمحل في واجهة واحدة. كود الاشتراك هو آخر خانة.
    window.handleCreateAccountOnly = async function() {
        const phone = String(document.getElementById('newTeamMgrPhoneInput')?.value || '').trim();
        const managerPassword = String(document.getElementById('newManagerPasswordInput')?.value || '').trim();
        const userName = String(document.getElementById('onboardingUserNameInput')?.value || '').trim();
        const teamName = String(document.getElementById('newTeamNameInput')?.value || '').trim();
        const teamCode = String(document.getElementById('newTeamCodeInput')?.value || '').trim().toUpperCase();
        const teamPassword = String(document.getElementById('newTeamPasswordInput')?.value || '').trim();
        const pin = String(document.getElementById('masterAuthPinInput')?.value || '').trim();
        if (!phone || !managerPassword || !userName || !teamName || !teamCode || !teamPassword || !pin) {
            window.customAlert('بيانات ناقصة','أكمل جميع الخانات، وكود الاشتراك هو آخر خانة.');
            return;
        }
        if (managerPassword.length < 6 || teamPassword.length < 6) {
            window.customAlert('كلمة المرور قصيرة','كلمة مرور المدير وكلمة مرور المحل يجب أن تكونا 6 خانات على الأقل.');
            return;
        }
        const activation = window.parseActivationKey?.(pin);
        if (!activation) {
            window.customAlert('كود اشتراك غير صحيح','كود الاشتراك غير صحيح أو مكتوب بصيغة غير معتمدة.', true, true);
            return;
        }
        // لا نخزن كلمات المرور في localStorage. أسرار إنشاء الحساب تظل في الذاكرة فقط.
        localStorage.setItem('atd_sales_user_name', userName);
        await window.handleCreateTeam();
    };

    window.handleCreateTeam = async function() {
        developerSessionPin = '';
        isGhostMode = false;
        document.body.classList.remove('adt-ghost-mode');
        localStorage.removeItem('atd_original_team_id');
        const pin = document.getElementById('masterAuthPinInput').value.trim();
        const userName = document.getElementById('onboardingUserNameInput').value.trim();
        const mgrPhone = document.getElementById('newTeamMgrPhoneInput').value.trim();
        const teamName = document.getElementById('newTeamNameInput').value.trim();
        const teamCode = document.getElementById('newTeamCodeInput').value.trim().toUpperCase();
        const managerPassword = document.getElementById('newManagerPasswordInput').value.trim();
        const password = document.getElementById('newTeamPasswordInput').value.trim();

        if (!pin || !userName || !mgrPhone || !managerPassword || !teamName || !teamCode || !password) {
            window.customAlert('بيانات ناقصة', 'يرجى ملء جميع الحقول لتأسيس الفريق.');
            return;
        }

        if (!dbClient) window.initSupabaseClient();
        if (!dbClient) {
            window.customAlert('الاتصال غير متاح', 'تعذر الاتصال بقاعدة البيانات.');
            return;
        }

        // التحقق من رمز المطور يتم داخل Supabase؛ لا يوجد رمز سري ثابت داخل HTML.
        let isMaster = false;
        try {
            const { data: masterOk, error: masterErr } = await dbClient.rpc('adt_verify_dev_pin', { p_pin: pin, p_device_id: getDeviceId() });
            if (!masterErr && masterOk === true) { isMaster = true; developerSessionPin = pin; }
        } catch (_) {}
        const activation = isMaster ? { duration: 'lifetime', normalized: pin } : window.parseActivationKey(pin);

        if (!activation) {
            window.customAlert('كود تصريح غير صحيح', 'التصريح غير صحيح أو مكتوب بصيغة غير معتمدة. استخدم الكود الذي ولّده المطور بالكامل.', true, true);
            return;
        }

        try {
            let newTeam = null;
            const deviceId = getDeviceId();

            if (!isMaster) {
                // إنشاء الفريق + استهلاك التصريح في Transaction واحدة على Supabase.
                const { data, error } = await dbClient.rpc('create_team_with_activation_v276', {
                    p_activation_key: activation.normalized,
                    p_team_name: teamName,
                    p_team_code: teamCode,
                    p_team_password: password,
                    p_manager_password: managerPassword,
                    p_manager_name: userName,
                    p_manager_phone: mgrPhone,
                    p_device_id: deviceId
                });

                if (error) {
                    console.error('[Activation] redeem failed:', error);
                    const rawMsg = String(error.message || '');
                    const msg = rawMsg.toUpperCase();
                    if (msg.includes('PHONE_ALREADY_USED') || msg.includes('رقم الهاتف مستخدم بالفعل')) {
                        window.customAlert('رقم الهاتف مستخدم بالفعل', 'رقم الهاتف مستخدم بالفعل');
                    } else if (msg.includes('ACTIVATION_ALREADY_USED')) {
                        window.customAlert('التصريح مستخدم', 'هذا التصريح تم استخدامه من قبل ولا يمكن استخدامه لإنشاء حساب آخر.', true, true);
                    } else if (msg.includes('INVALID_ACTIVATION')) {
                        window.customAlert('تصريح غير صحيح', 'التصريح غير موجود أو غير صالح. تأكد من نسخ الكود بالكامل كما ظهر من لوحة المطور.', true, true);
                    } else if (msg.includes('TEAM_CODE_ALREADY_EXISTS') || msg.includes('DUPLICATE') || msg.includes('UNIQUE')) {
                        window.customAlert('كود الفريق مستخدم', 'كود الفريق الذي اخترته مستخدم مسبقاً. اختر كوداً آخر.');
                    } else {
                        window.customAlert('تعذر إنشاء الفريق', error.message || 'حدث خطأ أثناء إنشاء الفريق.');
                    }
                    return;
                }

                newTeam = Array.isArray(data) ? data[0] : data;
                if (newTeam && newTeam.team) newTeam = newTeam.team;
                if (!newTeam || !newTeam.id) {
                    window.customAlert('تعذر إنشاء الفريق', 'لم تُرجع قاعدة البيانات بيانات الفريق بعد استهلاك التصريح.');
                    return;
                }
            } else {
                // مسار المطور: إنشاء الفريق بالكامل داخل Supabase بعد التحقق من جلسة المطور.
                if (!developerSessionPin) {
                    window.customAlert('جلسة المطور منتهية', 'افتح وضع المطور وأدخل الرمز السري مرة أخرى.');
                    return;
                }
                const { data, error } = await dbClient.rpc('adt_admin_create_team', {
                    p_dev_pin: developerSessionPin,
                    p_team_name: teamName,
                    p_team_code: teamCode,
                    p_team_password: password,
                    p_manager_name: userName,
                    p_manager_phone: mgrPhone,
                    p_device_id: deviceId
                });
                if (error) {
                    console.error('[Team] admin create failed:', error);
                    if (String(error.message || '').toUpperCase().includes('PHONE_ALREADY_USED')) window.customAlert('رقم الهاتف مستخدم بالفعل', 'رقم الهاتف مستخدم بالفعل');
                    else window.customAlert('تعذر إنشاء الفريق', error.message || 'حدث خطأ أثناء إنشاء الفريق.');
                    return;
                }
                newTeam = Array.isArray(data) ? data[0] : data;
                if (newTeam && newTeam.team) newTeam = newTeam.team;
                if (!newTeam || !newTeam.id) {
                    window.customAlert('تعذر إنشاء الفريق', 'لم يرجع الخادم بيانات الفريق بعد الإنشاء.');
                    return;
                }
            }

            // لا نحتفظ بأي قيمة لكلمة السر/الهاش في ذاكرة الواجهة حتى لو أعادها INSERT/RPC.
            if (newTeam && Object.prototype.hasOwnProperty.call(newTeam, 'password')) delete newTeam.password;

            localStorage.removeItem('atd_sales_signed_out');
            localStorage.setItem('atd_sales_team_id', newTeam.id);
            localStorage.setItem('atd_sales_user_role', 'manager');
            localStorage.setItem('atd_sales_user_name', userName);
            // اكتملت خطوة الحساب والفريق؛ امسح بيانات الحساب المعلّقة حتى لا تعاد خطوة الإنشاء عند الفتح لاحقاً.
            localStorage.removeItem('adt_pending_account_v275');

            currentTeam = newTeam;
            if (isMaster) {
                try {
                    // احتفظ بمعرفات فرق المطور القديمة قبل استبدالها، ثم احذفها من الخادم.
                    let previousDeveloperIds = [];
                    try {
                        previousDeveloperIds = JSON.parse(localStorage.getItem('atd_developer_team_ids') || '[]');
                        previousDeveloperIds = Array.isArray(previousDeveloperIds) ? previousDeveloperIds.map(String) : [];
                    } catch(_) { previousDeveloperIds = []; }

                    for (const oldId of previousDeveloperIds) {
                        if (!oldId || oldId === String(newTeam.id)) continue;
                        try {
                            await dbClient.rpc('adt_admin_delete_team', {
                                p_dev_pin: developerSessionPin,
                                p_team_id: String(oldId),
                                p_device_id: getDeviceId()
                            });
                        } catch(e) {
                            console.warn('[Developer Team] old developer team delete failed:', oldId, e);
                        }
                    }

                    // الفريق الجديد المنشأ بعد تحقق كود المطور يصبح فريق المطور الوحيد محلياً.
                    localStorage.setItem('atd_developer_team_ids', JSON.stringify([String(newTeam.id)]));
                    localStorage.setItem('atd_dev_device_authorized','1');

                    // تفعيل جميع الميزات المدفوعة على الخادم للفريق المنشأ بكود المطور.
                    const { error: featureErr } = await dbClient.rpc('adt_admin_set_features_v2', {
                        p_dev_pin: developerSessionPin,
                        p_team_id: String(newTeam.id),
                        p_catalog: false,
                        p_shortages: true,
                        p_invoices: true,
                        p_device_id: getDeviceId()
                    });
                    if (featureErr) throw featureErr;
                    newTeam.features = { shortages:true, invoices:true };
                } catch(e) {
                    console.warn('[Developer Team] setup sync failed:', e);
                }
            }
            await window.loadTeamLocalCaches(currentTeam.id);
            window.saveCurrentTeamSnapshot();
            userRole = 'manager';
            await window.refreshPrimaryManagerStatus();

            document.getElementById('onboardingModal').style.display = 'none';
            window.showToast('تم إنشاء الفريق بنجاح');
            window.updateTeamMenuLabel?.();
            window.updateUserProfileUI(userName);
            window.switchTab('home', false);
            // تحرير قفل شاشة البداية بعد نجاح إنشاء الحساب والفريق.
            window.releaseStartupSurface?.();
            window.loadTeamMembers();
            window.fetchProductsFromSupabase();
            window.fetchShortagesFromSupabase();
            window.fetchDebtsFromSupabase();
            window.setupRealtimeSubscription();

        } catch(e) {
            console.error('[Team Creation] unexpected error:', e);
            window.customAlert('خطأ', e?.message || 'تعذر إنشاء الفريق.');
        }
    };

    window.refreshPendingApprovalStatus = async function() {
        const btn = document.getElementById('btnRefreshPendingApproval');
        if (btn) { btn.disabled = true; btn.textContent = 'جاري التحديث...'; }
        try {
            if (!dbClient) window.initSupabaseClient();
            const teamId = String(localStorage.getItem('atd_sales_team_id') || currentTeam?.id || '');
            if (!dbClient || !teamId) { window.customAlert('تعذر التحديث','لا توجد بيانات فريق محفوظة لإعادة فحص حالة الانضمام.'); return; }
            const {data:ctx,error}=await dbClient.rpc('adt_get_my_context',{p_team_id:teamId,p_user_id:getDeviceId()});
            if (error) throw error;
            const m=ctx?.member;
            if (!ctx?.team || !m) {
                window.customAlert('الطلب غير موجود','لم يعد طلب الانضمام موجوداً. يمكنك العودة لشاشة الدخول وإرسال طلب جديد.');
                document.getElementById('pendingApprovalModal').style.display='none';
                window.showAuthAfterMandatoryIntro();
                return;
            }
            if (m.status === 'approved' || m.role === 'manager') {
                currentTeam=ctx.team; userRole=m.role||'member';
                window.applyCurrentMemberContext(m, ctx.team);
                await window.refreshPrimaryManagerStatus();
                document.getElementById('pendingApprovalModal').style.display='none';
                document.getElementById('onboardingModal').style.display='none';
                await window.loadTeamLocalCaches(currentTeam.id); window.saveCurrentTeamSnapshot(); window.checkTeamLockState();
                window.updateUserProfileUI(localStorage.getItem('atd_sales_user_name')||'عضو');
                await Promise.all([window.loadTeamMembers(),window.fetchProductsFromSupabase(),window.fetchShortagesFromSupabase(),window.fetchDebtsFromSupabase(),window.fetchDamagedGoods(false),window.fetchMoneyRecords(false)]);
                window.setupRealtimeSubscription(); window.switchTab('home',false); window.showToast('تم قبول انضمامك للفريق');
            } else window.showToast('الطلب مازال بانتظار موافقة المدير');
        } catch(e) {
            console.error('[Join Status] refresh failed:',e);
            window.customAlert('تعذر تحديث الحالة','تحقق من اتصال الإنترنت ثم حاول مرة أخرى.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'تحديث الحالة'; }
        }
    };

    // إرسال طلب الانضمام المعلق المرن
    window.handleJoinTeam = async function() {
        developerSessionPin = '';
        isGhostMode = false;
        document.body.classList.remove('adt-ghost-mode');
        localStorage.removeItem('atd_original_team_id');
        const userName = document.getElementById('memberUserNameInput').value.trim();
        const memberPhone = document.getElementById('memberPhoneInput').value.trim();
        const teamCode = document.getElementById('joinTeamCodeInput').value.trim().toUpperCase();
        const password = document.getElementById('joinTeamPasswordInput').value.trim();
        const memberPassword = document.getElementById('joinMemberPasswordInput').value;
        const memberPasswordConfirm = document.getElementById('joinMemberPasswordConfirmInput').value;

        if (!userName || !memberPhone || !teamCode || !password || !memberPassword || !memberPasswordConfirm) {
            window.customAlert('بيانات ناقصة', 'يرجى إكمال جميع البيانات وكود المحل وكلمتي المرور.');
            return;
        }
        if (memberPassword.length < 6) {
            window.customAlert('كلمة المرور قصيرة', 'كلمة مرور العضو يجب أن تكون 6 خانات على الأقل.');
            return;
        }
        if (memberPassword !== memberPasswordConfirm) {
            window.customAlert('كلمتا المرور مختلفتان', 'أعد كتابة كلمة مرور العضو بنفس الشكل.');
            return;
        }

        if (!dbClient) window.initSupabaseClient();
        if (!dbClient) {
            window.customAlert('الاتصال غير متاح', 'تعذر الاتصال بقاعدة البيانات.');
            return;
        }

        try {
            const deviceId = getDeviceId();
            const { data, error } = await dbClient.rpc('adt_request_join_team_v198', {
                p_team_code: teamCode,
                p_team_password: password,
                p_member_password: memberPassword,
                p_user_id: deviceId,
                p_user_name: userName,
                p_member_phone: memberPhone
            });

            if (error) throw error;
            const result = Array.isArray(data) ? data[0] : data;
            const team = result && result.team ? result.team : null;
            if (!team || !team.id) {
                window.customAlert('خطأ', 'كود المحل أو كلمة سر المحل غير صحيحة.');
                return;
            }

            localStorage.removeItem('atd_sales_signed_out');
            localStorage.setItem('atd_sales_team_id', team.id);
            localStorage.setItem('atd_sales_user_role', result.role || 'member');
            localStorage.setItem('atd_sales_user_name', userName);

            currentTeam = team;
            await window.loadTeamLocalCaches(currentTeam.id);
            window.saveCurrentTeamSnapshot();
            userRole = result.role || 'member';
            myPermissions={can_edit_products:false,can_manage_shortages:false,can_edit_debts:false,can_manage_money_records:false,can_audit:false,can_grocery_audit:false,can_view_cost:false,can_create_invoices:false,can_manage_daily_sales:false, can_audit_add:false, can_audit_edit_qty:false, can_audit_edit_price:false, can_audit_delete:false, can_audit_export:false, can_audit_reset:false, can_audit_restore:false, can_audit_delete_history:false};

            document.getElementById('onboardingModal').style.display = 'none';
            if ((result.status || 'pending') === 'approved') {
                window.showToast('تم تسجيل الدخول للفريق بنجاح');
                window.checkAuthAndTeam();
            } else {
                document.getElementById('pendingApprovalModal').style.display = 'flex';
                window.showToast('تم إرسال طلب الانضمام لمدير المحل');
            }
        } catch(e) {
            console.error('[Team Join] Failed:', e);
            const msg = String(e?.message || '').toUpperCase();
            if (msg.includes('INVALID_TEAM_CREDENTIALS')) {
                window.customAlert('خطأ', 'كود المحل أو كلمة سر المحل غير صحيحة.');
            } else if (msg.includes('ACCOUNT_ALREADY_EXISTS')) {
                window.customAlert('الحساب موجود بالفعل', 'هذا الرقم لديه حساب وكلمة مرور خاصة. ارجع إلى تسجيل الدخول.');
            } else if (msg.includes('PHONE_ALREADY_USED')) {
                window.customAlert('رقم الهاتف مستخدم بالفعل', 'رقم الهاتف مستخدم بالفعل');
            } else {
                window.customAlert('تعذر إرسال طلب الانضمام', 'لم يتم إرسال الطلب. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.\n\nالسبب: ' + (e?.message || 'خطأ غير معروف'));
            }
        }
    };
    // إدارة الفريق وقبول ورفض الطلبات وتعديل الصلاحيات
    // زر الفريق: إذا كان الحساب بلا فريق يفتح سجل محلک، وإلا يفتح الفريق مباشرة.
    window.updateTeamMenuLabel = function() {
        const el=document.getElementById('adtTeamMenuLabel');
        if(!el) return;
        const hasTeam=!!(currentTeam&&currentTeam.id)||!!localStorage.getItem('atd_sales_team_id');
        el.textContent=hasTeam?'الفريق':'إنشاء فريق';
    };
    window.openTeamOrCreate = function() {
        const hasTeam = !!(currentTeam && currentTeam.id) || !!localStorage.getItem('atd_sales_team_id');
        window.updateTeamMenuLabel();
        if (hasTeam) { window.openTeamModal(); return; }
        window.showSingleAuthView?.('newTeam');
    };

    window.createStoreFromAccountV275 = async function(){
        // توافق مع أي استدعاء قديم: التسجيل أصبح في واجهة واحدة.
        return window.handleCreateAccountOnly();
    };

    window.openTeamModal = function() {
        const pwdBox = document.getElementById('managerPasswordChangeBox');
        if (pwdBox) pwdBox.style.display = (userRole === 'manager' || isGhostMode) ? 'block' : 'none';

        // اعرض بيانات الفريق فوراً حتى لو تأخر تحميل الأعضاء أو حصل خطأ بالشبكة.
        const nameEl = document.getElementById('teamModalNameDisplay');
        const managerEl = document.getElementById('teamModalManagerDisplay');
        const codeEl = document.getElementById('teamModalCodeDisplay');
        if (nameEl) nameEl.innerText = currentTeam?.name || '-';
        if (managerEl) managerEl.innerText = currentTeam?.manager_name || DEFAULT_MANAGER_NAME;
        if (codeEl) codeEl.innerText = currentTeam?.code || '------';

        document.getElementById('teamModal').style.display = 'flex';
        if(userRole==='manager'){window.refreshPrimaryManagerStatus().finally(()=>window.loadTeamMembers());}else window.loadTeamMembers();
    };

    window.loadTeamMembers = async function() {
        if (!dbClient || !currentTeam) return;
        try {
            const { data: members, error } = await dbClient.rpc('adt_read_team_members', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId(),
                p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null)
            });

            if (error) {
                console.error('[Team Members] load failed:', error);
                return false;
            }

            currentTeamMembers = members || [];
            const managerMember = currentTeamMembers.find(m => m.role === 'manager' && String(m.user_name || '').trim());
            if (managerMember && currentTeam) {
                currentTeam.manager_name = String(managerMember.user_name).trim();
                window.saveCurrentTeamSnapshot();
            }
            const ownDeviceId = String(getDeviceId());
            const ownMember = currentTeamMembers.find(m =>
                String(m.user_id || m.device_id || m.member_user_id || '') === ownDeviceId
            ) || (userRole === 'manager' ? managerMember : null);
            if (ownMember && !isGhostMode) {
                const syncedName = String(ownMember.user_name || '').trim();
                if (syncedName) {
                    localStorage.setItem('atd_sales_user_name', syncedName);
                    window.currentUserName = syncedName;
                    window.updateUserProfileUI(syncedName);
                }
            }
            
            const approvedMembers = currentTeamMembers.filter(m => m.status === 'approved' || m.role === 'manager');
            const pendingMembers = currentTeamMembers.filter(m => m.status === 'pending' && m.role !== 'manager');

            const countText = document.getElementById('memberCountText');
            if (countText) countText.innerText = approvedMembers.length;

            const pendingSec = document.getElementById('pendingRequestsSection');
            const pendingCont = document.getElementById('pendingRequestsContainer');
            if (pendingSec && pendingCont) {
                if (userRole === 'manager' && pendingMembers.length > 0) {
                    pendingSec.style.display = 'block';
                    pendingCont.innerHTML = pendingMembers.map(m => `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); border:1px solid var(--primary); padding:8px 10px; border-radius:8px; margin-bottom:6px;">
                            <div>
                                <b style="color:#FFF; font-size:13px;">${window.escapeHtml(m.user_name)}</b>
                                <div style="font-size:10px; color:var(--accent-teal); font-weight:800;">طلب انضمام جديد</div>
                            </div>
                            <div style="display:flex; gap:6px;">
                                <button onclick="window.approveMemberRequest('${m.id}')" style="background:var(--green); color:#070A12; border:none; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:900; cursor:pointer;">قبول</button>
                                <button onclick="window.rejectMemberRequest('${m.id}')" style="background:rgba(255,77,77,0.2); border:1px solid var(--red); color:var(--red); border-radius:6px; padding:6px 10px; font-size:11px; font-weight:800; cursor:pointer;">رفض</button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    pendingSec.style.display = 'none';
                }
            }

            const container = document.getElementById('teamMembersListContainer');
            if (container) {
                container.innerHTML = approvedMembers.map(m => `
                    <div style="background:var(--input-bg); border:1px solid var(--border); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <b style="color:#FFF; font-size:13px;">${window.escapeHtml(m.user_name)}</b>
                            <span style="font-size:10px; color:var(--accent-teal); margin-right:4px;">(${m.role === 'manager' ? 'المدير' : (m.role === 'sub_manager' ? 'مدير مساعد' : 'عضو')})</span>
                        </div>
                        <div style="display:flex; gap:6px;">
                            ${(userRole === 'manager' && window.isPrimaryManager() && m.role !== 'manager') ? `
                                <button onclick="window.openMemberPermissionsModal('${m.id}')" style="background:rgba(0,210,180,0.15); border:1px solid var(--primary); color:var(--primary); border-radius:6px; padding:4px 8px; font-size:10px; font-weight:800; cursor:pointer;">الصلاحيات</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('');
            }

            document.getElementById('teamModalNameDisplay').innerText = currentTeam.name || '-';
            document.getElementById('teamModalManagerDisplay').innerText = currentTeam.manager_name || DEFAULT_MANAGER_NAME;
            document.getElementById('teamModalCodeDisplay').innerText = currentTeam.code || '------';
            
            const pwdBox = document.getElementById('managerPasswordChangeBox');
            if (pwdBox) pwdBox.style.display = (userRole === 'manager' || isGhostMode) ? 'block' : 'none';

        } catch(e) {
            console.error('[Team Members] unexpected load error:', e);
            return false;
        }
        return true;
    };

    window.approveMemberRequest = async function(memberId) {
        if (!dbClient || !currentTeam) { window.customAlert('تعذر التنفيذ', 'لا يوجد اتصال بقاعدة البيانات.'); return; }
        try {
            const { data, error } = await dbClient.rpc('adt_manager_member_action', {
                p_team_id: String(currentTeam.id), p_manager_user_id: getDeviceId(), p_member_id: String(memberId),
                p_action: 'approve', p_payload: {}
            });
            if (error || data !== true) throw error || new Error('ACTION_REJECTED');
            window.showToast('تم قبول انضمام العضو للفريق');
            await window.loadTeamMembers();
        } catch(e) {
            console.error('[Team Members] Approve failed:', e);
            window.customAlert('تعذر قبول العضو', 'لم يتم حفظ الموافقة على الخادم.');
        }
    };

    window.rejectMemberRequest = async function(memberId) {
        if (!dbClient || !currentTeam) { window.customAlert('تعذر التنفيذ', 'لا يوجد اتصال بقاعدة البيانات.'); return; }
        try {
            const { data, error } = await dbClient.rpc('adt_manager_member_action', {
                p_team_id: String(currentTeam.id), p_manager_user_id: getDeviceId(), p_member_id: String(memberId),
                p_action: 'reject', p_payload: {}
            });
            if (error || data !== true) throw error || new Error('ACTION_REJECTED');
            window.showToast('تم رفض طلب الانضمام');
            await window.loadTeamMembers();
        } catch(e) {
            console.error('[Team Members] Reject failed:', e);
            window.customAlert('تعذر رفض الطلب', 'لم يتم حذف طلب الانضمام من الخادم.');
        }
    };

    window.refreshTeamMembersNow = async function() {
        const btn=document.getElementById('btnRefreshTeamMembers'); if(btn){btn.disabled=true;btn.innerText='جارٍ التحديث...';}
        try { await window.loadTeamMembers(); window.showToast('تم تحديث طلبات وأعضاء الفريق'); }
        catch(e){ window.customAlert('تعذر التحديث','تحقق من الإنترنت ثم حاول مرة أخرى.'); }
        finally { if(btn){btn.disabled=false;btn.innerText='↻ تحديث';} }
    };

    // V92: اقرأ صلاحيات العضو الحقيقية من الخادم قبل عرض المفاتيح.
    // هذا يمنع ظهور الصلاحية مقفولة بينما هي مفعلة فعلياً في team_members.
    window.openMemberPermissionsModal = async function(memberId) {
        if(userRole !== 'manager'){window.customAlert('للمدير الرئيسي فقط','التحكم في صلاحيات الأعضاء متاح للمدير الرئيسي فقط.');return;}
        activeMemberForPerms = currentTeamMembers.find(m => String(m.id) === String(memberId));
        if (!activeMemberForPerms || !dbClient || !currentTeam) return;

        const fillPermissions = (m) => {
            document.getElementById('permModalMemberName').innerText = `صلاحيات: ${m.user_name || 'العضو'}`;
            const setPerm=(id,value)=>{const el=document.getElementById(id);if(el)el.checked=!!value;};
            setPerm('permSubManager', m.role === 'sub_manager');
            setPerm('permEditProducts', m.can_edit_products === true);
            setPerm('permManageShortages', m.can_manage_shortages === true);
            setPerm('permEditDebts', m.can_edit_debts === true);
            setPerm('permManageMoneyRecords', m.can_manage_money_records === true);
            setPerm('permAudit', m.can_audit === true);
            setPerm('permGroceryAudit', m.can_grocery_audit === true);
            setPerm('permAuditAdd', m.can_audit_add === true);
            setPerm('permAuditEditQty', m.can_audit_edit_qty === true);
            setPerm('permAuditEditPrice', m.can_audit_edit_price === true);
            setPerm('permAuditDelete', m.can_audit_delete === true);
            setPerm('permAuditExport', m.can_audit_export === true);
            setPerm('permAuditReset', m.can_audit_reset === true);
            setPerm('permAuditRestore', m.can_audit_restore === true);
            setPerm('permAuditDeleteHistory', m.can_audit_delete_history === true);
            setPerm('permViewCost', m.can_view_cost === true);
            setPerm('permCreateInvoices', m.can_create_invoices === true);
            setPerm('permManageDailySales', m.can_manage_daily_sales === true);
        };

        // افتح النافذة فوراً من البيانات الموجودة؛ لا تجعل RPC بطيئاً يعلّق زر الصلاحيات.
        fillPermissions(activeMemberForPerms);
        window.openModalFront('memberPermissionsModal',10050);
        const modal=document.getElementById('memberPermissionsModal');
        const list=modal?.querySelector('.member-permissions-list');
        if(modal)modal.scrollTop=0;
        if(list)list.scrollTop=0;

        // تحقق المدير الرئيسي في الخلفية، ثم اقرأ آخر صلاحيات العضو بمهلة قصيرة.
        try {
            const primaryOk = await Promise.race([
                window.refreshPrimaryManagerStatus(),
                new Promise(resolve=>setTimeout(()=>resolve(window.isPrimaryManager()),3500))
            ]);
            if(primaryOk !== true){ window.closeModal('memberPermissionsModal'); window.customAlert('للمدير الرئيسي فقط','لا يمكن تعديل صلاحيات الأعضاء إلا من حساب المدير الرئيسي.'); return; }
            const fresh = await Promise.race([
                dbClient.rpc('adt_read_member_permissions', {p_team_id:String(currentTeam.id),p_manager_user_id:getDeviceId(),p_member_id:String(memberId)}),
                new Promise(resolve=>setTimeout(()=>resolve(null),3500))
            ]);
            if(fresh?.data && typeof fresh.data==='object'){
                activeMemberForPerms={...activeMemberForPerms,...fresh.data};
                fillPermissions(activeMemberForPerms);
            }
        } catch(e){ console.warn('[Permissions] background refresh skipped:',e); }
    };

    window.saveMemberPermissionsAction = async function() {
        if(userRole !== 'manager' || !(await window.refreshPrimaryManagerStatus())){window.customAlert('للمدير الرئيسي فقط','لا يمكن تعديل صلاحيات الأعضاء إلا من حساب المدير الرئيسي.');return;}
        if (!(await window.confirmGhostMutation('تعديل صلاحيات عضو'))) return;
        if (!activeMemberForPerms || !dbClient || !currentTeam) return;
        const payload = {
            sub_manager: !!document.getElementById('permSubManager').checked,
            can_edit_products: !!document.getElementById('permEditProducts').checked,
            can_manage_shortages: !!document.getElementById('permManageShortages').checked,
            can_edit_debts: !!document.getElementById('permEditDebts').checked,
            can_manage_money_records: !!document.getElementById('permManageMoneyRecords').checked,
            can_audit: !!document.getElementById('permAudit').checked,
            can_grocery_audit: !!document.getElementById('permGroceryAudit').checked,
            can_audit_add: !!document.getElementById('permAuditAdd').checked,
            can_audit_edit_qty: !!document.getElementById('permAuditEditQty').checked,
            can_audit_edit_price: !!document.getElementById('permAuditEditPrice').checked,
            can_audit_delete: !!document.getElementById('permAuditDelete').checked,
            can_audit_export: !!document.getElementById('permAuditExport').checked,
            can_audit_reset: !!document.getElementById('permAuditReset').checked,
            can_audit_restore: !!document.getElementById('permAuditRestore').checked,
            can_audit_delete_history: !!document.getElementById('permAuditDeleteHistory').checked,
            can_view_cost: !!document.getElementById('permViewCost').checked,
            can_create_invoices: !!document.getElementById('permCreateInvoices').checked,
            can_manage_daily_sales: !!document.getElementById('permManageDailySales').checked
        };
        try {
            const { data, error } = await dbClient.rpc('adt_manager_member_action', {
                p_team_id: String(currentTeam.id), p_manager_user_id: getDeviceId(), p_member_id: String(activeMemberForPerms.id),
                p_action: 'permissions', p_payload: payload
            });
            if (error || data !== true) throw error || new Error('ACTION_REJECTED');
            window.closeModal('memberPermissionsModal');
            window.showToast('تم حفظ وتحديث صلاحيات العضو');
            await window.loadTeamMembers();
            window.broadcastTeamStateChanged?.('grocery_permission_changed');
        } catch(e) {
            console.error('[Team Members] Permissions update failed:', e);
            window.customAlert('تعذر حفظ الصلاحيات', 'لم يتم حفظ الصلاحيات على الخادم.');
        }
    };

    window.kickCurrentMemberAction = async function() {
        if (!(await window.confirmGhostMutation('إزالة عضو من الفريق'))) return;
        if (!activeMemberForPerms || !dbClient || !currentTeam) return;

        const memberName = String(activeMemberForPerms.user_name || 'هذا العضو');
        const confirmed = await window.showAppConfirm({
            title: 'تأكيد طرد العضو',
            message: `هل أنت متأكد من طرد «${memberName}» من الفريق؟\nلن يتمكن من الوصول إلى بيانات الفريق بعد الطرد.`,
            confirmText: 'طرد العضو',
            cancelText: 'إلغاء',
            danger: true
        });
        if (!confirmed) return;

        try {
            const { data, error } = await dbClient.rpc('adt_manager_member_action', {
                p_team_id: String(currentTeam.id), p_manager_user_id: getDeviceId(), p_member_id: String(activeMemberForPerms.id),
                p_action: 'remove', p_payload: {}
            });
            if (error || data !== true) throw error || new Error('ACTION_REJECTED');
            window.closeModal('memberPermissionsModal');
            window.showToast('تمت إزالة العضو من الفريق');
            activeMemberForPerms = null;
            await window.loadTeamMembers();
        } catch(e) {
            console.error('[Team Members] Remove failed:', e);
            window.customAlert('تعذر إزالة العضو', 'لم يتم حذف العضو من الخادم.');
        }
    };

    window.copyTeamCode = async function() {
        if (!currentTeam?.code) return;
        const ok = await window.copyTextRobust(currentTeam.code);
        if (ok) window.showToast('تم نسخ كود الفريق');
        else window.customAlert('تعذر النسخ', 'اضغط مطولاً على الكود ثم اختر نسخ.');
    };

    window.promptEditTeamName = function() {
        window.customAlert('اسم المحل ثابت', 'اسم المحل يتم تحديده عند إنشاء الفريق ولا يمكن تغييره بعد ذلك.');
    };

    window.saveNewTeamNameAction = async function() {
        window.closeModal('editTeamNameModal');
        window.customAlert('اسم المحل ثابت', 'اسم المحل يتم تحديده عند إنشاء الفريق ولا يمكن تغييره بعد ذلك.');
    };

    window.promptChangeTeamPassword = function() {
        if (userRole !== 'manager' || !currentTeam) return;
        const cur = document.getElementById('inputCurrentTeamPassVal');
        const next = document.getElementById('inputNewTeamPassVal');
        if (cur) cur.value = '';
        if (next) next.value = '';
        document.getElementById('changeTeamPassModal').style.display = 'flex';
        setTimeout(() => document.getElementById('inputCurrentTeamPassVal')?.focus(), 150);
    };

    window.saveNewTeamPassAction = async function() {
        if (!(await window.confirmGhostMutation('تغيير كلمة سر الفريق'))) return;
        const currentPass = document.getElementById('inputCurrentTeamPassVal')?.value.trim() || '';
        const newPass = document.getElementById('inputNewTeamPassVal')?.value.trim() || '';
        if (!currentPass) { window.customAlert('تنبيه', 'أدخل كلمة السر الحالية أولاً.'); return; }
        if (!newPass) { window.customAlert('تنبيه', 'أدخل كلمة السر الجديدة.'); return; }
        if (newPass.length < 6) { window.customAlert('كلمة سر ضعيفة', 'استخدم 6 أحرف أو أرقام على الأقل.'); return; }
        if (currentPass === newPass) { window.customAlert('تنبيه', 'كلمة السر الجديدة مطابقة للحالية. اختر كلمة مختلفة.'); return; }
        if (!dbClient || !currentTeam) {
            window.customAlert('تعذر التحديث', 'لا يوجد اتصال بقاعدة البيانات حالياً.');
            return;
        }

        const { data, error } = await dbClient.rpc('adt_change_team_password', {
            p_team_id: String(currentTeam.id),
            p_manager_phone: currentTeam.manager_phone || '',
            p_current_password: currentPass,
            p_new_password: newPass
        });
        if (error) {
            console.error('[Team Password] secure update failed:', error);
            window.customAlert('تعذر تغيير كلمة السر', 'حدث خطأ أثناء التحقق من كلمة السر على الخادم.');
            return;
        }
        if (data !== true) {
            window.customAlert('كلمة السر الحالية غير صحيحة', 'لم يتم تغيير كلمة السر. تأكد من كتابة كلمة السر الحالية بشكل صحيح.');
            return;
        }

        delete currentTeam.password;
        document.getElementById('inputCurrentTeamPassVal').value = '';
        document.getElementById('inputNewTeamPassVal').value = '';
        window.closeModal('changeTeamPassModal');
        window.showToast('تم تغيير كلمة سر الفريق بنجاح');
    };

    window.openUserProfileModal = async function() {
        await window.loadStoreProfile();
        const profile = window.getStoreProfile();
        document.getElementById('userNameInput').value = localStorage.getItem('atd_sales_user_name') || '';
        let roleLabel = userRole === 'manager' ? 'المدير الرئيسي' : (userRole === 'sub_manager' ? 'مدير مساعد' : 'عضو فريق');
        document.getElementById('userRoleDisplay').value = roleLabel;
        const storeNameInput = document.getElementById('storeProfileNameInput');
        const storeAddressInput = document.getElementById('storeAddressInput');
        const hint = document.getElementById('storeProfileEditHint');
        const canEditStore = userRole === 'manager' && !isGhostMode;
        if (storeNameInput) {
            storeNameInput.value = profile.storeName;
            storeNameInput.disabled = !canEditStore;
            storeNameInput.style.opacity = canEditStore ? '1' : '.65';
        }
        if (storeAddressInput) {
            storeAddressInput.value = profile.storeAddress;
            storeAddressInput.disabled = !canEditStore;
            storeAddressInput.style.opacity = canEditStore ? '1' : '.65';
        }
        if (hint) hint.textContent = canEditStore
            ? 'العنوان سيظهر في فاتورة المبيعات فقط أسفل اسم المحل.'
            : 'تعديل اسم المحل وعنوانه متاح للمدير الرئيسي فقط.';
        document.getElementById('userProfileModal').style.display = 'flex';
    };

    window.saveUserProfile = async function() {
        const saveBtn = document.getElementById('userProfileSaveBtn');
        const newName = document.getElementById('userNameInput')?.value.trim() || '';
        const canEditStore = userRole === 'manager' && !isGhostMode && !!currentTeam?.id;
        const nextStoreName = document.getElementById('storeProfileNameInput')?.value.trim() || '';
        const nextStoreAddress = document.getElementById('storeAddressInput')?.value.trim() || '';
        const currentProfile = window.getStoreProfile();

        if (!newName) {
            window.customAlert('بيانات ناقصة', 'اكتب اسم المستخدم أولاً.');
            return;
        }
        if (isGhostMode) {
            window.customAlert('غير مسموح', 'اخرج من وضع التصفح السري قبل تعديل اسم المستخدم.');
            return;
        }
        if (canEditStore && !nextStoreName) {
            window.customAlert('بيانات ناقصة', 'اكتب اسم المحل كما تريد أن يظهر في الفاتورة.');
            return;
        }

        const storeChanged = canEditStore && (
            nextStoreName !== currentProfile.storeName || nextStoreAddress !== currentProfile.storeAddress
        );
        let userNameSynced = false;
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'جارٍ الحفظ والمزامنة...'; }
        try {
            if (!dbClient || !currentTeam?.id) throw new Error('USER_NAME_SYNC_OFFLINE');
            const { data: nameSaved, error: nameError } = await dbClient.rpc('adt_update_my_user_name', {
                p_team_id: String(currentTeam.id),
                p_user_id: getDeviceId(),
                p_user_name: newName
            });
            if (nameError || nameSaved !== true) throw nameError || new Error('USER_NAME_SYNC_REJECTED');
            userNameSynced = true;
            localStorage.setItem('atd_sales_user_name', newName);
            window.currentUserName = newName;
            if (userRole === 'manager' && currentTeam) currentTeam.manager_name = newName;
            window.updateUserProfileUI(newName);
            window.saveCurrentTeamSnapshot();

            if (storeChanged) {
                const { data, error } = await dbClient.rpc('adt_update_store_profile', {
                    p_team_id: String(currentTeam.id),
                    p_user_id: getDeviceId(),
                    p_store_name: nextStoreName,
                    p_store_address: nextStoreAddress
                });
                if (error || data !== true) throw error || new Error('STORE_PROFILE_REJECTED');
                window.applyStoreProfile({ storeName: nextStoreName, storeAddress: nextStoreAddress });
            }

            await window.loadTeamMembers();
            window.closeModal('userProfileModal');
            window.showToast(storeChanged ? 'تم حفظ ومزامنة بيانات المستخدم والمتجر' : 'تم تحديث الاسم عند جميع أعضاء الفريق');
        } catch (error) {
            console.error('[User Profile Sync] save failed:', error);
            const message = userNameSynced
                ? 'تم تحديث اسم المستخدم، لكن تعذر حفظ بيانات المتجر. تحقق من الإنترنت ثم حاول مرة أخرى.'
                : (error?.message === 'USER_NAME_SYNC_OFFLINE'
                    ? 'يلزم الاتصال بالإنترنت لتحديث الاسم عند جميع أعضاء الفريق.'
                    : 'لم تتم مزامنة الاسم على الخادم. شغّل تحديث قاعدة البيانات V130 مرة واحدة ثم حاول مجدداً.');
            window.customAlert(userNameSynced ? 'تعذر إكمال التحديث' : 'تعذر مزامنة الاسم', message);
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'حفظ التحديثات'; }
        }
    };

    window.requestLeaveTeam = async function() {
        if (!currentTeam) return;
        const ok = await window.showAppConfirm({
            title: 'مغادرة الفريق',
            message: `هل تريد مغادرة فريق (${currentTeam.name || 'الفريق'})؟`,
            confirmText: 'مغادرة', cancelText: 'إلغاء', danger: true
        });
        if (!ok) return;
        if (dbClient) {
            try {
                const { data, error } = await dbClient.rpc('adt_leave_team', {
                    p_team_id: String(currentTeam.id), p_user_id: getDeviceId()
                });
                if (error || data !== true) throw error || new Error('LEAVE_REJECTED');
            } catch(e) {
                console.error('[Team] leave failed:', e);
                window.customAlert('تعذر المغادرة', 'لم يتم حذف عضويتك من الفريق على الخادم.');
                return;
            }
        }
        localStorage.removeItem('atd_sales_team_id');
        localStorage.removeItem('atd_sales_user_role');
        localStorage.setItem('adt_intro_completed_v3','1');
        localStorage.setItem('atd_sales_signed_out', 'true');
        location.reload();
    };

    window.handleSignOut = function() {
        try {
                developerSessionPin = '';
            isGhostMode = false;
            document.body.classList.remove('adt-ghost-mode');
            localStorage.removeItem('atd_original_team_id');
            if (realtimeChannel && dbClient) {
                try { dbClient.removeChannel(realtimeChannel); } catch(_) {}
            }
            realtimeChannel = null;
            window.stopSecureBackgroundPolling?.();
            localStorage.setItem('adt_intro_completed_v3','1');
            localStorage.setItem('atd_sales_signed_out','true');
            ['atd_sales_team_id','atd_sales_user_role','atd_sales_user_name','atd_sales_app_unlocked'].forEach(k=>localStorage.removeItem(k)); window.clearSessionToken?.();
        }
        finally {
            currentTeam=null;
            currentTeamMembers=[];
            products=[];
            shortages=[];
            debts={customers:[],suppliers:[]};
            myPermissions={can_edit_products:false,can_manage_shortages:false,can_edit_debts:false,can_manage_money_records:false,can_audit:false,can_grocery_audit:false,can_view_cost:false,can_create_invoices:false,can_manage_daily_sales:false, can_audit_add:false, can_audit_edit_qty:false, can_audit_edit_price:false, can_audit_delete:false, can_audit_export:false, can_audit_reset:false, can_audit_restore:false, can_audit_delete_history:false};
            sessionStorage.removeItem('adt_ghost_origin_session_v2'); sessionStorage.removeItem('adt_ghost_origin_role_v2');
            try { if(window.Android&&typeof window.Android.reloadApp==='function') window.Android.reloadApp(); else location.href='index.html?logout='+Date.now(); } catch(_){ location.reload(); }
        }
    };

    // لوحة تحكم المطور العام
    window.openAboutDevModal = function() {
        document.getElementById('aboutDevModal').style.display = 'flex';
    };

    window.openSuperAdminAuthModal = function() {
        const input = document.getElementById('inputSuperAdminAuthPin');
        if (input) input.value = '';
        window.openModalFront('superAdminAuthModal', 9997);
        setTimeout(() => input?.focus(), 150);
    };

    // مدخل المطور المخفي: ضغط مطول على شعار ADT في الهيدر لمدة 1.2 ثانية.
    window.setupHiddenDeveloperLongPress = function() {
        const logo = document.getElementById('adtHeaderLogoV45') || document.querySelector('.header-logo-container.adt-logo-only');
        const trigger = logo?.closest?.('.header-logo-container.adt-logo-only') || document.querySelector('.header-logo-container.adt-logo-only') || logo;
        if (!trigger || trigger.dataset.longPressReady === '1') return;
        trigger.dataset.longPressReady = '1';

        let timer = null;
        let opened = false;
        const start = function(e) {
            if (typeof e?.button === 'number' && e.button !== 0) return;
            opened = false;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                if (!window.isDeveloperAccount()) return;
                opened = true;
                try { if (navigator.vibrate) navigator.vibrate(60); } catch(e) {}
                window.openSuperAdminAuthModal();
            }, 1200);
        };
        const cancel = function() {
            if (timer) clearTimeout(timer);
            timer = null;
        };

        if (window.PointerEvent) {
            trigger.addEventListener('pointerdown', start);
            trigger.addEventListener('pointerup', cancel);
            trigger.addEventListener('pointercancel', cancel);
            trigger.addEventListener('pointerleave', cancel);
        } else {
            trigger.addEventListener('touchstart', start, {passive:true});
            trigger.addEventListener('touchend', cancel);
            trigger.addEventListener('touchcancel', cancel);
        }
        trigger.addEventListener('contextmenu', function(e) { e.preventDefault(); });
        trigger.addEventListener('click', function(e) {
            if (opened) {
                e.preventDefault();
                e.stopPropagation();
                opened = false;
            }
        }, true);
    };

    window.verifySuperAdminAuthPin = async function() {
        const input = document.getElementById('inputSuperAdminAuthPin');
        const pin = input?.value.trim() || '';
        if (!pin) return;
        if (!dbClient) window.initSupabaseClient();
        if (!dbClient) { window.customAlert('الاتصال غير متاح', 'تعذر التحقق من رمز المطور.'); return; }
        try {
            const { data, error } = await dbClient.rpc('adt_verify_dev_pin', { p_pin: pin, p_device_id: getDeviceId() });
            if (error) throw error;
            if (data === true) {
                const activeId=String(currentTeam?.id||localStorage.getItem('atd_sales_team_id')||''); let knownIds=[]; try{knownIds=JSON.parse(localStorage.getItem('atd_developer_team_ids')||'[]').map(String);}catch(_){}
                if(userRole!=='manager' || !activeId || !knownIds.includes(activeId) || localStorage.getItem('atd_dev_device_authorized')!=='1'){ developerSessionPin=''; window.customAlert('غير مصرح','وضع المطور غير متاح لهذا الحساب.'); return; }
                developerSessionPin = pin;
                try {
                    const originalId = String(localStorage.getItem('atd_original_team_id') || '');
                    const activeId = String(currentTeam?.id || localStorage.getItem('atd_sales_team_id') || '');
                    const developerTeamId = (isGhostMode && originalId) ? originalId : activeId;
                    const currentCode = String(currentTeam?.code || '').trim().toUpperCase();

                    if (developerTeamId) {
                        let ids = [];
                        try { ids = JSON.parse(localStorage.getItem('atd_developer_team_ids') || '[]'); } catch(_) { ids = []; }
                        ids = Array.isArray(ids) ? ids.map(String) : [];

                        if (!isGhostMode && currentCode === '086') {
                            // الفريق 086 هو فريق المطور الوحيد.
                            const oldDeveloperIds = ids.filter(id => id && id !== String(developerTeamId));

                            // حذف الفريق/الفرق القديمة التي كانت مسجلة سابقاً كفريق مطور.
                            for (const oldId of oldDeveloperIds) {
                                try {
                                    await dbClient.rpc('adt_admin_delete_team', {
                                        p_dev_pin: developerSessionPin,
                                        p_team_id: String(oldId),
                                        p_device_id: getDeviceId()
                                    });
                                } catch(e) {
                                    console.warn('[Developer Team] old team delete deferred:', oldId, e);
                                }
                            }

                            localStorage.setItem('atd_developer_team_ids', JSON.stringify([String(developerTeamId)]));
                            localStorage.setItem('atd_dev_device_authorized','1');

                            try {
                                await dbClient.rpc('adt_admin_set_features_v2', {
                                    p_dev_pin: developerSessionPin,
                                    p_team_id: String(developerTeamId),
                                    p_catalog: false,
                                    p_shortages: true,
                                    p_invoices: true,
                                    p_device_id: getDeviceId()
                                });
                                if (currentTeam) {
                                    currentTeam.features = { shortages:true, invoices:true };
                                    window.saveCurrentTeamSnapshot();
                                }
                            } catch(e) {
                                console.warn('[Developer Team] feature sync deferred:', e);
                            }
                        } else {
                            const next = [...new Set([...ids, String(developerTeamId)])];
                            localStorage.setItem('atd_developer_team_ids', JSON.stringify(next));
                        }
                    }
                } catch(_) {}
                if (input) input.value = '';
                document.getElementById('superAdminAuthModal').style.display = 'none';
                document.getElementById('superAdminModal').style.display = 'flex';
                window.loadSuperAdminStats();
            } else {
                window.customAlert('خطأ في الرمز', 'الرمز السري غير صحيح.');
                if (input) { input.value = ''; input.focus(); }
            }
        } catch (e) {
            console.error('[Developer Auth] failed:', e);
            window.customAlert('تعذر التحقق', 'حدث خطأ أثناء التحقق من رمز المطور.');
        }
    };

    window.switchDevSubTab = function(tab) {
        ['teams', 'stats', 'notify', 'security'].forEach(t => {
            const btn = document.getElementById(`devTabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
            const div = document.getElementById(`devSubTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
            if (btn) btn.classList.remove('active');
            if (div) div.style.display = 'none';
        });
        document.getElementById(`devTabBtn${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
        document.getElementById(`devSubTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).style.display = 'block';
    };

    window.loadSuperAdminStats = async function() {
        if (!dbClient || !developerSessionPin) return;
        try {
            const { data, error } = await dbClient.rpc('adt_admin_stats', { p_dev_pin: developerSessionPin, p_device_id: getDeviceId() });
            if (error) throw error;
            const stats = data || {};
            document.getElementById('devStatTotalStores').innerText = Number(stats.total_teams || 0);
            document.getElementById('devStatTotalProducts').innerText = Number(stats.total_products || 0);
            document.getElementById('devStatActiveToday').innerText = Number(stats.active_today || 0);
            const radarBox = document.getElementById('devLiveRadarContainer');
            const teamsList = Array.isArray(stats.recent_teams) ? stats.recent_teams : [];
            if (radarBox) {
                radarBox.innerHTML = teamsList.length ? teamsList.map(t => `
                    <div style="background:var(--card-dark); padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                        <span>${window.escapeHtml(t.name || 'متجر')}</span>
                        <span style="color:${t.active ? 'var(--green)' : 'var(--text-muted)'}; font-size:10px; font-weight:800;">${t.active ? 'نشط اليوم' : 'غير نشط اليوم'}</span>
                    </div>
                `).join('') : '<div style="text-align:center; color:var(--text-muted); padding:10px;">لا توجد بيانات متاجر</div>';
            }
        } catch(e) {
            console.error('[Admin Stats] failed:', e);
        }
    };

    // التحقق من تصريح إنشاء الفريق: الشكل + رقم التحقق + المدة.
    // الاستهلاك الحقيقي يتم داخل قاعدة البيانات.

    window.parseActivationKey = function(key) {
        if (typeof key !== 'string') return null;
        const value = key.trim().replace(/\s+/g, '').toUpperCase();
        const m = value.match(/^ATD-(\d{4})-(\d)-(LIFETIME|1YEAR|6MONTHS|6MONTH|1MONTH)$/);
        if (!m) return null;
        const numberPart = Number(m[1]);
        const checkDigit = Number(m[2]);
        if (((numberPart * 7) % 9) !== checkDigit) return null;
        return { normalized: value, numberPart, checkDigit, duration: m[3].toLowerCase() };
    };

    window.isValidActivationKey = function(key) {
        return !!window.parseActivationKey(key);
    };

    window.subscriptionDurationMeta = {
        lifetime: { label:'تفعيل دائم', hint:'بدون تاريخ انتهاء' },
        '1year': { label:'اشتراك سنة', hint:'365 يومًا' },
        '6months': { label:'اشتراك 6 أشهر', hint:'180 يومًا' },
        '1month': { label:'اشتراك شهر', hint:'30 يومًا' }
    };

    window.openSubscriptionDurationPicker = function() {
        const selected = document.getElementById('keyDurationSelect')?.value || 'lifetime';
        document.querySelectorAll('#subscriptionDurationOptions .adt-duration-option').forEach(button => {
            button.classList.toggle('active', button.dataset.duration === selected);
        });
        window.openModalFront('subscriptionDurationPickerModal', 16000);
    };

    window.selectSubscriptionDuration = function(duration) {
        const meta = window.subscriptionDurationMeta[duration] || window.subscriptionDurationMeta.lifetime;
        const input = document.getElementById('keyDurationSelect');
        if (input) input.value = duration in window.subscriptionDurationMeta ? duration : 'lifetime';
        const label = document.getElementById('keyDurationPickerLabel');
        const hint = document.getElementById('keyDurationPickerHint');
        if (label) label.textContent = meta.label;
        if (hint) hint.textContent = meta.hint;
        document.querySelectorAll('#subscriptionDurationOptions .adt-duration-option').forEach(button => {
            button.classList.toggle('active', button.dataset.duration === (input?.value || 'lifetime'));
        });
        window.closeModal('subscriptionDurationPickerModal');
    };

    window.generateSingleUseActivationKey = async function() {
        let duration = document.getElementById('keyDurationSelect')?.value || 'lifetime';
        const durationAllowed = ['lifetime', '1year', '6months', '1month'];
        if (!durationAllowed.includes(duration)) duration = 'lifetime';
        if (!dbClient) window.initSupabaseClient();
        if (!dbClient) {
            window.customAlert('الاتصال غير متاح', 'تعذر الاتصال بقاعدة البيانات لتسجيل التصريح.');
            return;
        }

        if (!developerSessionPin) {
            window.customAlert('جلسة المطور منتهية', 'افتح وضع المطور وأدخل الرمز السري مرة أخرى.');
            return;
        }

        let newKey = '';
        let registered = false;
        for (let attempts = 0; attempts < 10 && !registered; attempts++) {
            const r = Math.floor(1000 + Math.random() * 9000);
            const checkDigit = (r * 7) % 9;
            newKey = 'ATD-' + r + '-' + checkDigit + '-' + duration.toUpperCase();

            const { data, error } = await dbClient.rpc('register_activation_key', {
                p_admin_pin: developerSessionPin,
                p_key: newKey,
                p_duration: duration,
                p_device_id: getDeviceId()
            });

            if (!error && data === true) {
                registered = true;
                break;
            }
            console.warn('[Activation] registration attempt failed:', error?.message || 'رفض الخادم تسجيل التصريح');
        }

        if (!registered) {
            window.customAlert('تعذر توليد التصريح', 'لم يتم تسجيل التصريح في قاعدة البيانات. لا تعطِ أي كود للعميل إلا إذا ظهرت رسالة نجاح التوليد.');
            return;
        }

        lastGeneratedKey = newKey;
        localStorage.setItem('atd_last_generated_activation', newKey);

        const durationTextMap = {
            'lifetime': 'تفعيل دائم (Lifetime)',
            '1year': 'اشتراك سنة (1 Year)',
            '6months': 'اشتراك 6 أشهر',
            '1month': 'اشتراك شهر (1 Month)'
        };

        // محاولة نسخ تلقائية بدون تعطيل توليد التصريح لو منع المتصفح الحافظة.
        try { await window.copyTextRobust(newKey); } catch(e) {}

        document.getElementById('displayGeneratedCodeValue').innerText = newKey;
        document.getElementById('displayKeyDurationTag').innerText = 'المدة: ' + (durationTextMap[duration] || 'دائم');
        document.getElementById('generatedKeyModal').style.display = 'flex';
    };

    window.copyTextRobust = async function(text) {
        const value = String(text || '');
        if (!value) return false;

        // الطريقة الحديثة - تعمل عند توفر صلاحية Clipboard.
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(value);
                return true;
            } catch (e) {}
        }

        // طريقة احتياطية للملفات المحلية content:// و file:// وبعض WebView على أندرويد.
        try {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.pointerEvents = 'none';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            const ok = document.execCommand && document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) return true;
        } catch (e) {}

        return false;
    };

    window.copyGeneratedKeyAgain = async function() {
        if (!lastGeneratedKey) {
            lastGeneratedKey = localStorage.getItem('atd_last_generated_activation') || '';
        }
        if (!lastGeneratedKey) {
            window.customAlert('لا يوجد تصريح', 'قم بتوليد تصريح أولاً ثم اضغط نسخ.');
            return;
        }
        const copied = await window.copyTextRobust(lastGeneratedKey);
        if (copied) {
            window.showToast('تم نسخ التصريح للحافظة');
        } else {
            window.customAlert('تعذر النسخ تلقائياً', 'اضغط مطولاً على الكود الظاهر ثم اختر نسخ.');
        }
    };

    window.openBrowseAllTeamsModal = async function() {
        if (!dbClient) window.initSupabaseClient();
        const container = document.getElementById('allTeamsListContainer');
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">جاري تحميل بيانات المتاجر...</div>';
        window.openModalFront('browseAllTeamsModal', 3600);
        if (!developerSessionPin) {
            container.innerHTML = '<div style="text-align:center; color:var(--red); padding:20px;">جلسة المطور منتهية. افتح وضع المطور من جديد.</div>';
            return;
        }
        try {
            const { data, error } = await dbClient.rpc('adt_admin_list_teams', { p_dev_pin: developerSessionPin, p_device_id: getDeviceId() });
            if (error) throw error;
            const allTeams = Array.isArray(data) ? data : [];
            // السيرفر هو المصدر الوحيد لحالة الميزات؛ لا نعتمد على نسخة محلية قديمة.
            allTeams.forEach(t => {
                teamFeaturesMap[String(t.id)] = (t.features && typeof t.features === 'object')
                    ? { shortages: t.features.shortages === true, invoices: t.features.invoices === true, audit: t.features.audit === true, grocery_audit: t.features.grocery_audit === true }
                    : { shortages: false, invoices: false, audit: false, grocery_audit: false };
            });
            if (!allTeams.length) {
                container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد متاجر حالياً</div>';
                return;
            }
            let protectedDevIds=[];
            try { protectedDevIds=JSON.parse(localStorage.getItem('atd_developer_team_ids')||'[]').map(String); } catch(_) { protectedDevIds=[]; }

            // في التصفح السري، الفريق المفتوح فريق مشترك عادي وليس فريق المطور.
            // نحمي فقط الفريق الأصلي للمطور.
            const originalDevId = String(localStorage.getItem('atd_original_team_id') || '');
            if (isGhostMode && originalDevId) {
                protectedDevIds = protectedDevIds.filter(id => String(id) !== String(currentTeam?.id || ''));
                if (!protectedDevIds.includes(originalDevId)) protectedDevIds.push(originalDevId);
            } else if (window.isDeveloperAccount && window.isDeveloperAccount() && currentTeam?.id) {
                const cid=String(currentTeam.id);
                if(!protectedDevIds.includes(cid)) protectedDevIds.push(cid);
            }
            container.innerHTML = allTeams.map(t => {
                const isThisActive = currentTeam && String(currentTeam.id) === String(t.id);
                const isDevTeam = String(t.code || '').trim().toUpperCase() === '086';
                const isFrozen = isDevTeam ? false : !!t.is_frozen;
                const expStr = isDevTeam ? 'دائم' : (t.expires_at ? new Date(t.expires_at).toLocaleDateString('ar-EG') : 'دائم');
                const diffDays = isDevTeam ? 999999 : (t.expires_at ? Math.ceil((new Date(t.expires_at).getTime() - Date.now()) / 86400000) : 999);
                const isExpired = isDevTeam ? false : diffDays <= 0;
                const remainingText = isDevTeam ? 'فريق المطور • دائم' : (!t.expires_at ? 'اشتراك دائم' : (isExpired ? 'منتهي' : `متبقي ${diffDays} يوم`));
                if(isDevTeam) teamFeaturesMap[String(t.id)]={shortages:true,invoices:true,audit:true,grocery_audit:true};
                const idArg = window.safeUrlArg(t.id);
                const phoneArg = window.safeUrlArg(t.manager_phone || '');
                const nameArg = window.safeUrlArg(t.name || 'المتجر');
                const expArg = window.safeUrlArg(expStr);
                return `
                    <div data-team-id="${window.escapeHtml(String(t.id))}" data-current-days="${isDevTeam ? 0 : Math.max(0,diffDays)}" class="${isDevTeam?'adt-protected-dev-team':''}" style="background:var(--input-bg); border:1px solid ${(isThisActive||isDevTeam) ? 'var(--primary)' : 'var(--border)'}; border-radius:10px; padding:10px; display:flex; flex-direction:column; gap:6px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <b style="color:#FFF; font-size:13px;">${window.escapeHtml(t.name || 'محل بدون اسم')}</b>
                            <span style="font-size:10px; color:var(--primary); font-family:monospace; font-weight:800; background:rgba(0,210,180,0.1); padding:2px 6px; border-radius:4px;">${window.escapeHtml(t.code || '')}</span>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                            <span>المدير: <strong style="color:var(--accent-teal);">${window.escapeHtml(t.manager_name || 'غير معروف')}</strong></span>
                            <span>المدة: <strong style="color:${isExpired ? 'var(--red)' : 'var(--accent-gold)'};">${window.escapeHtml(remainingText)}</strong></span>
                            <span>الانتهاء: <strong style="color:${isExpired ? 'var(--red)' : 'var(--accent-gold)'};">${window.escapeHtml(isExpired ? 'منتهي' : expStr)}</strong></span>
                        </div>
                        ${isDevTeam ? `
                        <div class="adt-dev-team-lock">فريق المطور • دائم • جميع المميزات مفعلة</div>
                        ` : `
                        <div style="display:grid;grid-template-columns:minmax(0,1fr) 88px;gap:5px;margin-top:2px;">
                            <input class="input-field adt-custom-sub-value" type="number" min="1" step="1" inputmode="numeric" placeholder="الأيام المتبقية" style="min-width:0;height:36px;padding:5px 8px;font-size:10.5px;text-align:center;">
                            <button onclick="window.setTeamRemainingDays(decodeURIComponent('${idArg}'),this)" class="btn-accent" style="height:36px;padding:5px 7px;font-size:10px;">تعيين الأيام</button>
                        </div>
                        <div style="display:flex; gap:4px; margin-top:2px;">
                            <button onclick="window.openDevTeamFeaturesModal(decodeURIComponent('${idArg}'),decodeURIComponent('${nameArg}'))" style="flex:1;background:rgba(255,165,2,.15);border:1px solid var(--orange);color:var(--orange);border-radius:6px;padding:6px;font-size:10px;font-weight:800;">الباقات والميزات</button>
                            <button onclick="window.sendDirectTeamWhatsAppReceipt(decodeURIComponent('${phoneArg}'),decodeURIComponent('${nameArg}'),decodeURIComponent('${expArg}'))" style="flex:1;background:rgba(37,211,102,.15);border:1px solid #25D366;color:#25D366;border-radius:6px;padding:6px;font-size:10px;font-weight:800;">تأكيد التجديد</button>
                        </div>`}
                        <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">
                            <button onclick="window.enterTeamGhostMode(decodeURIComponent('${idArg}'))" style="flex:1;background:linear-gradient(135deg,#00E5FF,#00B894);color:#070A12;border:none;padding:6px 8px;border-radius:6px;font-weight:900;font-size:11px;">عرض</button>
                            <button onclick="window.openDirectStoreNoticeModal(decodeURIComponent('${idArg}'),decodeURIComponent('${nameArg}'))" style="background:rgba(0,229,255,.15);border:1px solid var(--accent-cyan);color:var(--accent-cyan);border-radius:6px;padding:6px 8px;font-size:10px;font-weight:800;">إشعار خاص</button>
                            ${isDevTeam ? '' : `<button onclick="window.toggleFreezeStore(decodeURIComponent('${idArg}'),${isFrozen})" style="background:${isFrozen ? 'rgba(46,213,115,.15)' : 'rgba(255,165,2,.15)'};border:1px solid ${isFrozen ? 'var(--green)' : 'var(--orange)'};color:${isFrozen ? 'var(--green)' : 'var(--orange)'};border-radius:6px;padding:6px 8px;font-size:10px;font-weight:800;">${isFrozen ? 'استئناف الاشتراك' : 'إيقاف الاشتراك'}</button>
                            <button onclick="window.cancelTeamSubscription(decodeURIComponent('${idArg}'))" class="adt-dev-cancel-sub-btn">إلغاء الاشتراك</button>
                            <button onclick="window.openDeleteTeamModal(decodeURIComponent('${idArg}'),decodeURIComponent('${nameArg}'))" class="adt-admin-delete-btn">حذف نهائي</button>`}
                        </div>
                    </div>`;
            }).join('');
        } catch(e) {
            console.error('[Admin Teams] failed:', e);
            container.innerHTML = '<div style="text-align:center; color:var(--red); padding:20px;">تعذر جلب البيانات</div>';
        }
    };

    window.openDevTeamFeaturesModal = function(teamId, teamName) {
        activeDevTeamForFeatures = teamId;
        document.getElementById('devTeamFeaturesTitle').innerText = `ميزات متجر: ${teamName}`;
        
        let feats = teamFeaturesMap[teamId] || {};
        document.getElementById('devFeatureShortagesToggle').checked = !!feats.shortages;
        document.getElementById('devFeatureInvoicesToggle').checked = !!feats.invoices;
        document.getElementById('devFeatureAuditToggle').checked = !!feats.audit;
        document.getElementById('devFeatureGroceryAuditToggle').checked = !!feats.grocery_audit;

        window.openModalFront('devTeamFeaturesModal', 4700);
    };

    window.saveDevTeamFeaturesAction = async function() {
        if (!activeDevTeamForFeatures || !developerSessionPin || !dbClient) return;
        const shortVal = !!document.getElementById('devFeatureShortagesToggle').checked;
        const invoiceVal = !!document.getElementById('devFeatureInvoicesToggle').checked;
        const auditVal = !!document.getElementById('devFeatureAuditToggle').checked;
        const groceryAuditVal = !!document.getElementById('devFeatureGroceryAuditToggle').checked;
        try {
            const { data, error } = await dbClient.rpc('adt_admin_set_features_v2', {
                p_dev_pin: developerSessionPin,
                p_team_id: String(activeDevTeamForFeatures),
                p_catalog: false,
                p_shortages: shortVal,
                p_invoices: invoiceVal,
                p_device_id: getDeviceId()
            });
            if (error || data !== true) throw error || new Error('UPDATE_REJECTED');
            const auditResult = await dbClient.rpc('adt_stock_dev_set_audit_feature', {p_dev_pin:developerSessionPin,p_device_id:getDeviceId(),p_team_id:String(activeDevTeamForFeatures),p_enabled:auditVal});
            if(auditResult.error || auditResult.data!==true) throw auditResult.error || new Error('AUDIT_UPDATE_REJECTED');
            const groceryAuditResult = await dbClient.rpc('adt_stock_dev_set_grocery_audit_feature', {p_dev_pin:developerSessionPin,p_device_id:getDeviceId(),p_team_id:String(activeDevTeamForFeatures),p_enabled:groceryAuditVal});
            if(groceryAuditResult.error || groceryAuditResult.data!==true) throw groceryAuditResult.error || new Error('GROCERY_AUDIT_UPDATE_REJECTED');
            teamFeaturesMap[String(activeDevTeamForFeatures)] = { shortages: shortVal, invoices: invoiceVal, audit:auditVal, grocery_audit:groceryAuditVal };
            if (currentTeam && String(currentTeam.id) === String(activeDevTeamForFeatures)) {
                currentTeam.features = { shortages: shortVal, invoices: invoiceVal, audit:auditVal, grocery_audit:groceryAuditVal };
                window.saveCurrentTeamSnapshot();
            }
            // للتوافق فقط مع النسخ القديمة؛ قرار الفتح نفسه يعتمد على currentTeam.features القادم من السيرفر.
            window.saveStoredData('atd_team_features_map_v17', teamFeaturesMap);
            window.refreshPaidFeatureCards?.();
            window.closeModal('devTeamFeaturesModal');
            window.broadcastTeamStateChanged?.('grocery_feature_changed');
            window.showToast('تم حفظ وتحديث ميزات وباقات المتجر بنجاح');
            activeDevTeamForFeatures = null;
        } catch(e) {
            console.error('[Team Features] update failed:', e);
            window.customAlert('تعذر حفظ الميزات', 'لم يتم تحديث الباقة على الخادم.');
        }
    };

    window.extendTeamSubscription = async function(teamId, days) {
        if (!dbClient || !developerSessionPin) return;
        if (window.isProtectedDeveloperTeamId(teamId)) { window.showToast('فريق المطور دائم ولا يمكن تعديله'); return; }
        try {
            const { data, error } = await dbClient.rpc('adt_admin_extend_subscription', {
                p_dev_pin: developerSessionPin, p_team_id: String(teamId), p_days: Number(days),
                p_device_id: getDeviceId()
            });
            if (error || !data) throw error || new Error('UPDATE_REJECTED');
            window.showToast(Number(days) >= 0 ? `تم تعديل الاشتراك (+${days} يوم)` : `تم تعديل الاشتراك (${days} يوم)`);
            await window.openBrowseAllTeamsModal();
        } catch(e) {
            console.error('[Subscription] extend failed:', e);
            window.customAlert('خطأ', 'تعذر تمديد الاشتراك.');
        }
    };
    window.setTeamRemainingDays = async function(teamId, button) {
        if (!teamId || !button || !dbClient || !developerSessionPin) return;
        if (window.isProtectedDeveloperTeamId?.(teamId)) {
            window.showToast?.('فريق المطور اشتراكه دائم ولا يتم تحديد أيام له');
            return;
        }

        const card = button.closest('[data-team-id]');
        const input = card?.querySelector('.adt-custom-sub-value');
        const desiredDays = Math.floor(Number(input?.value || 0));

        if (!Number.isFinite(desiredDays) || desiredDays < 1) {
            window.customAlert('عدد أيام غير صحيح', 'اكتب عدد الأيام المتبقية الذي تريده، مثل 1 أو 2 أو 30.');
            input?.focus();
            return;
        }

        const currentDays = Math.max(0, Math.floor(Number(card?.dataset?.currentDays || 0)));
        const deltaDays = desiredDays - currentDays;

        if (deltaDays === 0) {
            window.showToast(`الاشتراك بالفعل متبقي له ${desiredDays} يوم`);
            return;
        }

        const ok = await window.showAppConfirm({
            title:'تعديل الأيام المتبقية',
            message:`تغيير الاشتراك من ${currentDays} يوم متبقي إلى ${desiredDays} يوم متبقي؟`,
            confirmText:'تعيين الأيام',
            cancelText:'إلغاء'
        });
        if (!ok) return;

        try {
            const {data,error} = await dbClient.rpc('adt_admin_extend_subscription', {
                p_dev_pin: developerSessionPin,
                p_team_id: String(teamId),
                p_days: Number(deltaDays),
                p_device_id: getDeviceId()
            });
            if (error || !data) throw error || new Error('SET_REMAINING_REJECTED');

            window.showToast(`تم ضبط الاشتراك على ${desiredDays} يوم متبقي`);
            await window.openBrowseAllTeamsModal();
        } catch(e) {
            console.error('[Subscription] set remaining days failed:', e);
            window.customAlert('تعذر تعديل الأيام', 'الخادم رفض تعديل فرق الأيام. يلزم أن يدعم adt_admin_extend_subscription القيم الموجبة والسالبة.');
        }
    };

    window.sendDirectTeamWhatsAppReceipt = function(phone, teamName, expiryDate) {
        if (!phone) { window.customAlert('تنبيه', 'لا يوجد رقم هاتف مسجل للمدير.'); return; }
        let clean = phone.replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '218' + clean.substring(1);
        let msg = `تم بنجاح تأكيد سداد وتجديد اشتراك متجرك (${teamName}) في منظومة ADT Stock حتى تاريخ: (${expiryDate}). نتمنى لك دوام التوفيق والبركة في تجارتك!`;
        window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    window.sendDirectTeamWhatsAppReminder = function(phone, teamName, daysRemaining) {
        if (!phone) { window.customAlert('تنبيه', 'لا يوجد رقم هاتف مسجل للمدير.'); return; }
        let clean = phone.replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '218' + clean.substring(1);
        let msg = daysRemaining <= 0
            ? `مرحباً بك، نود إعلامك بانتهاء فترة اشتراك متجرك (${teamName}) في منظومة ADT Stock. يرجى التواصل معنا للتجديد وإعادة التفعيل فوراً.`
            : `مرحباً بك، نود تذكيرك بأنه متبقي على انتهاء اشتراك متجرك (${teamName}) في منظومة ADT Stock (${daysRemaining}) أيام. يرجى التواصل للتجديد قبل انتهاء المدة.`;
        window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    window.openDirectStoreNoticeModal = function(teamId, teamName) {
        pendingNoticeTeamId = teamId;
        document.getElementById('directStoreNoticeTargetName').innerText = "المتجر: " + teamName;
        document.getElementById('directStoreNoticeInput').value = '';
        // افتح نافذة الإشعار فوق نافذة إدارة المتاجر، لا خلفها.
        window.openModalFront('directStoreNoticeModal', 5200);
    };

    window.executeSendDirectStoreNotice = async function() {
        const msg = document.getElementById('directStoreNoticeInput').value.trim();
        if (!msg || !pendingNoticeTeamId || !developerSessionPin || !dbClient) return;
        try {
            const { data, error } = await dbClient.rpc('adt_admin_send_notice', {
                p_dev_pin: developerSessionPin, p_target_team_id: String(pendingNoticeTeamId),
                p_notice_type: 'message', p_message: msg,
                p_device_id: getDeviceId()
            });
            if (error || data !== true) throw error || new Error('NOTICE_REJECTED');
            window.closeModal('directStoreNoticeModal');
            window.showToast('تم إرسال الإشعار الموجه للمتجر');
            pendingNoticeTeamId = null;
        } catch(e) {
            console.error('[Notice] direct send failed:', e);
            window.customAlert('تعذر الإرسال', 'لم يتم إرسال الإشعار على الخادم.');
        }
    };


    window.getDeveloperWebsiteUrl = function() {
        const field=document.getElementById('devWebsiteBaseUrl');
        const raw=String(field?.value||localStorage.getItem('adt_dev_website_base_url')||'').trim().replace(/\/+$/,'');
        return /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(raw)?raw:'';
    };

    window.saveDeveloperWebsiteUrl = function() {
        const raw=String(document.getElementById('devWebsiteBaseUrl')?.value||'').trim().replace(/\/+$/,'');
        if(!raw)return;
        if(!/^https:\/\/[^\s]+$/i.test(raw)) { window.customAlert('رابط الموقع','اكتب رابط الموقع الأساسي فقط مثل https://adt-stock.netlify.app'); return; }
        localStorage.setItem('adt_dev_website_base_url',raw);
    };

    window.pickApkForWebsiteUpload = function() {
        if(!window.isDeveloperAccount() || !developerSessionPin){ window.customAlert('وضع المطور','افتح لوحة المطور وأدخل الرمز السري أولاً.'); return; }
        const base=window.getDeveloperWebsiteUrl();
        if(!base){ window.customAlert('رابط الموقع','ضع رابط موقع ADT Stock في الحقل أولاً، وسيتم حفظه على جهازك.'); document.getElementById('devWebsiteBaseUrl')?.focus(); return; }
        window.saveDeveloperWebsiteUrl();
        const input=document.getElementById('devReleaseApkFile');
        if(input){ input.value=''; input.click(); }
    };

    window.uploadSelectedApkToWebsite = async function(file) {
        if(!file)return;
        if(!window.isDeveloperAccount() || !developerSessionPin){ window.customAlert('جلسة المطور','أعد فتح وضع المطور ثم حاول مرة أخرى.'); return; }
        if(!/\.apk$/i.test(String(file.name||''))){ window.customAlert('ملف غير صحيح','اختر ملف APK فقط.'); return; }
        const base=window.getDeveloperWebsiteUrl();
        if(!base){ window.customAlert('رابط الموقع','ضع رابط موقع ADT Stock أولاً.'); return; }
        const versionField=document.getElementById('devReleaseVersion');
        const nameVersion=String(file.name||'').match(/v?(\d+\.\d+(?:\.\d+)?)/i)?.[1];
        if(nameVersion&&versionField)versionField.value=nameVersion;
        const version=String(versionField?.value||window.Android?.getAppVersionName?.()||'').trim();
        const notes=String(document.getElementById('devReleaseNotes')?.value||'').trim();
        if(!version){ window.customAlert('رقم الإصدار','اكتب رقم الإصدار قبل الرفع.'); return; }
        const btn=document.getElementById('devUploadApkBtn'),wrap=document.getElementById('devUploadProgressWrap'),bar=document.getElementById('devUploadProgressBar'),status=document.getElementById('devUploadStatus');
        const chunkSize=2*1024*1024,chunkCount=Math.ceil(file.size/chunkSize),uploadId='adt_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9),deviceId=String(getDeviceId?.()||'');
        if(!deviceId){ window.customAlert('تعذر الرفع','تعذر قراءة رقم الجهاز.'); return; }
        try{
            if(btn){btn.disabled=true;btn.textContent='جاري رفع APK…';} if(wrap)wrap.style.display='block'; if(bar)bar.style.width='0%'; if(status)status.textContent='بدء الرفع…';
            let finalData=null;
            for(let i=0;i<chunkCount;i++){
                const part=file.slice(i*chunkSize,Math.min(file.size,(i+1)*chunkSize));
                const response=await fetch(base+'/.netlify/functions/upload-release',{
                    method:'POST',
                    headers:{
                        'X-Developer-Pin':developerSessionPin,'X-Device-Id':deviceId,'X-Upload-Id':uploadId,
                        'X-Chunk-Index':String(i),'X-Chunk-Count':String(chunkCount),'X-File-Name':String(file.name||'ADT-Stock.apk'),
                        'X-App-Version':version,'X-App-Notes':notes,'X-Total-Size':String(file.size)
                    },
                    body:part
                });
                const data=await response.json().catch(()=>({}));
                if(!response.ok||data.ok!==true)throw new Error(data.error||('UPLOAD_PART_'+(i+1)+'_FAILED'));
                finalData=data;
                const percent=Math.round((i+1)/chunkCount*100); if(bar)bar.style.width=percent+'%'; if(status)status.textContent=`جاري الرفع… ${percent}%`;
            }
            // رابط التحديث الذي يُنشر للمستخدمين هو صفحة موقع ADT Stock نفسها،
            // وليس رابط تنزيل APK المباشر. الموقع يتولى عرض آخر إصدار وزر التثبيت.
            const updatePageUrl=base;
            const link=document.getElementById('devReleaseLink'); if(link)link.value=updatePageUrl;
            localStorage.setItem('adt_dev_website_base_url',base);
            if(status)status.textContent='تم رفع APK للموقع بنجاح. رابط التحديث سيُفتح على صفحة ADT Stock ثم يختار المستخدم تثبيت النسخة.';
            window.showToast('تم رفع الإصدار للموقع بنجاح');
        }catch(error){
            console.warn('[Website APK Upload] failed:',error);
            if(status)status.textContent='فشل الرفع: '+String(error?.message||error);
            window.customAlert('تعذر رفع APK','تأكد من أن الموقع مرفوع على Netlify وأن جلسة المطور مازالت صالحة، ثم حاول مرة أخرى.');
        }finally{
            if(btn){btn.disabled=false;btn.textContent='اختيار APK ورفعه للموقع';}
        }
    };

    window.publishLatestAppRelease = async function() {
        if (!window.isDeveloperAccount() || !developerSessionPin || !dbClient) {
            window.customAlert('وضع المطور','افتح وضع المطور واتصل بالإنترنت أولاً.'); return;
        }
        const code=Number(window.Android?.getAppVersionCode?.());
        const versionName=String(window.Android?.getAppVersionName?.()||'').trim();
        const url=window.normalizeAdtUpdatePageUrl(document.getElementById('devReleaseLink')?.value||'');
        const notes=String(document.getElementById('devReleaseNotes')?.value||'').trim();
        if (!Number.isInteger(code)||code<1||!versionName) { window.customAlert('إصدار التطبيق','افتح لوحة المطور من APK المثبّت على هاتفك؛ لا يمكن نشر إصدار من تجربة HTML وحدها.'); return; }
        if (!/^https:\/\/[^\s]+$/i.test(url)) { window.customAlert('رابط التحديث','ضع رابط موقع ADT Stock الذي يبدأ بـ https://، ثم جرّب فتحه للتأكد أنه يعمل.'); return; }
        const confirmed=await window.showAppConfirm({
            title:'نشر تحديث إجباري',
            message:`سيُنشر الإصدار ${versionName} (رقم البناء ${code}) المثبّت على جهازك. تأكد أن رابط التحديث يفتح صفحة ADT Stock التي تحتوي على النسخة الصحيحة قبل النشر.`,
            confirmText:'نشر التحديث',cancelText:'إلغاء'
        });
        if(!confirmed)return;
        try {
            const {data,error}=await dbClient.rpc('adt_admin_publish_app_release',{
                p_dev_pin:developerSessionPin,p_device_id:getDeviceId(),
                p_version_code:code,p_download_url:url,p_notes:notes
            });
            if (error || data!==true) throw error||new Error('RELEASE_REJECTED');
            window.showToast('تم نشر الإصدار الجديد؛ زر التحديث سيفتح صفحة موقع ADT Stock');
            window.checkLatestAppRelease();
        } catch(error) {
            console.warn('[Update] publish failed:',error);
            window.customAlert('تعذر نشر التحديث','تأكد من تشغيل ملف SQL الخاص بالإصدار 216، وأن نسخة جهازك ليست أقدم من آخر إصدار نُشر على الخادم.');
        }
    };

    const previousSwitchDevSubTab=window.switchDevSubTab;
    window.switchDevSubTab=function(tab) {
        const result=previousSwitchDevSubTab.apply(this,arguments);
        if(tab==='notify') {
            const code=Number(window.Android?.getAppVersionCode?.());
            const name=String(window.Android?.getAppVersionName?.()||'').trim();
            const hint=document.getElementById('devReleaseVersionHint');
            const field=document.getElementById('devReleaseVersion');
            if(field&&!field.value)field.value=Number.isInteger(code)&&code>0&&name?name:'';
            const siteField=document.getElementById('devWebsiteBaseUrl');
            if(siteField&&!siteField.value)siteField.value=String(localStorage.getItem('adt_dev_website_base_url')||'');
            if(hint)hint.textContent=Number.isInteger(code)&&code>0&&name
                ? `الإصدار المثبّت حالياً ${name} (بناء ${code}). يمكنك تعديل رقم الإصدار قبل رفع APK أحدث.`
                : 'اكتب رقم الإصدار المراد رفعه، ثم اختر ملف APK.';
        }
        return result;
    };

    window.triggerForceReloadAll = async function() {
        if (!dbClient || !developerSessionPin) return;
        try {
            const { data, error } = await dbClient.rpc('adt_admin_send_notice', {
                p_dev_pin: developerSessionPin, p_target_team_id: null,
                p_notice_type: 'force_reload', p_message: 'تحديث إجباري من المطور',
                p_device_id: getDeviceId()
            });
            if (error || data !== true) throw error || new Error('NOTICE_REJECTED');
            window.showToast('تم إرسال أمر التحديث لجميع الأجهزة');
        } catch(e) {
            window.customAlert('تعذر الإرسال', 'لم يتم إرسال أمر التحديث.');
        }
    };

    window.sendGlobalDeveloperBroadcast = async function() {
        const text = document.getElementById('devBroadcastInput')?.value.trim();
        if (!text) { window.customAlert('بيانات ناقصة', 'اكتب نص الإشعار أولاً.'); return; }
        if (!dbClient || !developerSessionPin) { window.customAlert('جلسة المطور منتهية', 'افتح وضع المطور من جديد.'); return; }
        try {
            const { data, error } = await dbClient.rpc('adt_admin_send_notice', {
                p_dev_pin: developerSessionPin, p_target_team_id: null,
                p_notice_type: 'message', p_message: text,
                p_device_id: getDeviceId()
            });
            if (error || data !== true) throw error || new Error('NOTICE_REJECTED');
            document.getElementById('devBroadcastInput').value = '';
            window.showToast('تم إرسال الإشعار لجميع الأجهزة بنجاح');
        } catch(e) {
            console.error('[Notice] global send failed:', e);
            window.customAlert('تعذر الإرسال', 'لم يتم إرسال الإشعار العام.');
        }
    };

    window.toggleFreezeStore = async function(teamId, currentlyFrozen) {
        if (!dbClient || !developerSessionPin) return;
        try {
            const { data, error } = await dbClient.rpc('adt_admin_set_frozen', {
                p_dev_pin: developerSessionPin, p_team_id: String(teamId), p_frozen: !currentlyFrozen,
                p_device_id: getDeviceId()
            });
            if (error || data !== true) throw error || new Error('UPDATE_REJECTED');
            window.showToast(!currentlyFrozen ? 'تم تجميد المتجر' : 'تم إلغاء تجميد المتجر');
            await window.openBrowseAllTeamsModal();
        } catch(e) {
            console.error('[Freeze] failed:', e);
            window.customAlert('تعذر التنفيذ', 'لم يتم تحديث حالة المتجر.');
        }
    };

    window.cancelTeamSubscription = async function(teamId) {
        if (!dbClient || !developerSessionPin) return;
        if (window.isProtectedDeveloperTeamId?.(teamId)) { window.showToast?.('فريق المطور دائم ولا يمكن إلغاء اشتراكه'); return; }
        const ok = await window.showAppConfirm({title:'إلغاء الاشتراك؟',message:'سيتم إيقاف اشتراك هذا الفريق مع الاحتفاظ بجميع بياناته.',confirmText:'إلغاء الاشتراك',cancelText:'رجوع',danger:true});
        if (!ok) return;
        try {
            const {data,error}=await dbClient.rpc('adt_admin_set_subscription_status',{p_dev_pin:developerSessionPin,p_team_id:String(teamId),p_status:'cancelled',p_device_id:getDeviceId()});
            if(error||data!==true) throw error||new Error('CANCEL_REJECTED');
            window.showToast('تم إلغاء الاشتراك مع الاحتفاظ بالبيانات');
            await window.openBrowseAllTeamsModal();
        } catch(e) { window.customAlert('يحتاج تحديث الخادم','زر إلغاء الاشتراك جاهز في التطبيق، لكن يلزم إضافة RPC adt_admin_set_subscription_status في Supabase قبل استخدامه.'); }
    };

    window.openDeleteTeamModal = async function(teamId, teamName) {
        if (window.isProtectedDeveloperTeamId?.(teamId)) { window.showToast?.('فريق المطور محمي ولا يمكن حذفه'); return; }
        const ok = await window.showAppConfirm({title:'حذف الفريق نهائياً؟',message:`سيتم حذف فريق (${teamName}) نهائياً من السيرفر. لا يمكن التراجع عن الحذف.`,confirmText:'حذف نهائي',cancelText:'إلغاء',danger:true});
        if (!ok) return;
        pendingTeamDeleteId = teamId;
        await window.executeConfirmedTeamDelete();
    };

    window.executeConfirmedTeamDelete = async function() {
        if (!pendingTeamDeleteId) { window.customAlert('تنبيه','لم يتم تحديد الفريق المطلوب حذفه.'); return; }
        if (!dbClient || !developerSessionPin) { window.customAlert('جلسة المطور','أعد فتح وضع المطور ثم حاول مرة أخرى.'); return; }
        const deletingId = String(pendingTeamDeleteId);
        try {
            const { data, error } = await dbClient.rpc('adt_admin_delete_team', {
                p_dev_pin: developerSessionPin, p_team_id: deletingId,
                p_device_id: getDeviceId()
            });
            if (error) throw error;
            if (data === false || (data && typeof data === 'object' && (data.ok === false || data.success === false))) throw new Error('DELETE_REJECTED');
            window.closeModal('deleteTeamCustomModal');
            window.showToast('تم حذف الفريق بنجاح');
            pendingTeamDeleteId = null;
            await window.openBrowseAllTeamsModal();
        } catch(e) {
            console.error('[Admin Delete Team] failed:', e);
            window.customAlert('تعذر حذف الفريق','لم يكتمل الحذف من الخادم. تأكد من صلاحية RPC adt_admin_delete_team ثم حاول مرة أخرى.');
        }
    };

    window.enterTeamGhostMode = async function(teamId) {
        if (!dbClient) window.initSupabaseClient();
        if (!developerSessionPin) { window.customAlert('جلسة المطور منتهية', 'افتح وضع المطور من جديد.'); return; }
        try {
            const { data: targetTeam, error } = await dbClient.rpc('adt_admin_get_team', {
                p_dev_pin: developerSessionPin, p_team_id: String(teamId),
                p_device_id: getDeviceId()
            });
            if (error || !targetTeam || !targetTeam.id) throw error || new Error('TEAM_NOT_FOUND');
            if (!currentTeam || !window.isDeveloperAccount()) { window.customAlert('غير مصرح','وضع العرض متاح لحساب المطور المصرح فقط.'); return; }
            const originSession={teamId:String(currentTeam.id),role:String(userRole||'member'),permissions:{...myPermissions},userName:String(localStorage.getItem('atd_sales_user_name')||''),teamSnapshot:currentTeam};
            sessionStorage.setItem('adt_ghost_origin_session_v2',JSON.stringify(originSession)); sessionStorage.setItem('adt_ghost_origin_role_v2',originSession.role); localStorage.setItem('atd_original_team_id',originSession.teamId);

            currentTeam = targetTeam;
            await window.loadTeamLocalCaches(currentTeam.id);
            userRole = 'member';
            myPermissions={can_edit_products:false,can_manage_shortages:false,can_edit_debts:false,can_manage_money_records:false,can_audit:false,can_grocery_audit:false,can_view_cost:true,can_create_invoices:false,can_manage_daily_sales:false, can_audit_add:false, can_audit_edit_qty:false, can_audit_edit_price:false, can_audit_delete:false, can_audit_export:false, can_audit_reset:false, can_audit_restore:false, can_audit_delete_history:false};
            isGhostMode = true;
            if(!window.__adtReadOnlyOriginalRpc){
                window.__adtReadOnlyOriginalRpc=dbClient.rpc.bind(dbClient);
                dbClient.rpc=function(name,...args){
                    if(isGhostMode && !/^adt_(?:fetch|read|get|list|admin_get|admin_list|admin_stats|control_get|control_audit_entitlement|is_primary_manager)/.test(String(name)))
                        return Promise.resolve({data:null,error:new Error('READ_ONLY_MODE')});
                    return window.__adtReadOnlyOriginalRpc(name,...args);
                };
            }
            document.body.classList.add('adt-ghost-mode');
            window.updateUserProfileUI(targetTeam.manager_name);
            window.closeModal('browseAllTeamsModal');
            window.closeModal('superAdminModal');
            window.showToast(`عرض لمتجر (${targetTeam.name})`);
            
            await Promise.all([window.fetchProductsFromSupabase(), window.fetchShortagesFromSupabase(), window.fetchDebtsFromSupabase()]);
            window.setupRealtimeSubscription();
            window.switchTab('home', false);
        } catch(e) {
            console.error('[Ghost Mode] failed:', e);
            window.customAlert('تعذر فتح وضع التصفح', 'فشل تحميل بيانات الفريق المحدد.');
        }
    };

    window.promptExitGhostMode = function() {
        document.getElementById('exitGhostCustomModal').style.display = 'flex';
    };

    window.executeExitGhostMode = async function() {
        window.closeModal('exitGhostCustomModal');
        let saved=null; try{saved=JSON.parse(sessionStorage.getItem('adt_ghost_origin_session_v2')||'null');}catch(_){}
        const originalId=String(saved?.teamId||localStorage.getItem('atd_original_team_id')||'');
        isGhostMode=false; document.body.classList.remove('adt-ghost-mode');
        if(window.__adtReadOnlyOriginalRpc && dbClient){dbClient.rpc=window.__adtReadOnlyOriginalRpc;window.__adtReadOnlyOriginalRpc=null;}
        if(!originalId){
            developerSessionPin=''; sessionStorage.removeItem('adt_ghost_origin_session_v2'); sessionStorage.removeItem('adt_ghost_origin_role_v2'); localStorage.removeItem('atd_original_team_id');
            window.customAlert('تعذر العودة','لم نجد بيانات الجلسة الأصلية. سيتم تسجيل الخروج لحماية الحساب.'); window.handleSignOut(); return;
        }
        try{
            if(!dbClient) window.initSupabaseClient(); if(!dbClient) throw new Error('NO_DB');
            const {data:origCtx,error}=await dbClient.rpc('adt_get_my_context',{p_team_id:originalId,p_user_id:getDeviceId()});
            if(error||!origCtx?.team||!origCtx?.member) throw error||new Error('ORIGINAL_CONTEXT_NOT_FOUND');
            const member=origCtx.member; currentTeam=origCtx.team; userRole=member.role||saved?.role||'member';
            myPermissions={can_edit_products:!!member.can_edit_products,can_manage_shortages:!!member.can_manage_shortages,can_edit_debts:!!member.can_edit_debts,can_manage_money_records:!!member.can_manage_money_records,can_audit:!!member.can_audit,can_grocery_audit:!!member.can_grocery_audit,can_view_cost:!!member.can_view_cost,can_create_invoices:!!member.can_create_invoices,can_manage_daily_sales:!!member.can_manage_daily_sales,can_audit_add:!!member.can_audit_add,can_audit_edit_qty:!!member.can_audit_edit_qty,can_audit_edit_price:!!member.can_audit_edit_price,can_audit_delete:!!member.can_audit_delete,can_audit_export:!!member.can_audit_export,can_audit_reset:!!member.can_audit_reset,can_audit_restore:!!member.can_audit_restore,can_audit_delete_history:!!member.can_audit_delete_history};
            const restoredName=String(saved?.userName||localStorage.getItem('atd_sales_user_name')||'عضو');
            localStorage.setItem('atd_sales_team_id',String(currentTeam.id)); localStorage.setItem('atd_sales_user_role',userRole); localStorage.setItem('atd_sales_user_name',restoredName);
            localStorage.removeItem('atd_original_team_id'); sessionStorage.removeItem('adt_ghost_origin_session_v2'); sessionStorage.removeItem('adt_ghost_origin_role_v2');
            await window.loadTeamLocalCaches(currentTeam.id); window.saveCurrentTeamSnapshot(); window.updateUserProfileUI(restoredName); window.checkTeamLockState();
            await Promise.all([window.loadTeamMembers(),window.fetchProductsFromSupabase(),window.fetchShortagesFromSupabase(),window.fetchDebtsFromSupabase(),window.fetchDamagedGoods(false),window.fetchMoneyRecords(false)]);
            window.setupRealtimeSubscription(); window.switchTab('home',false); window.showToast('تمت العودة للحساب الأصلي بأمان');
            if(window.isDeveloperAccount()){const devModal=document.getElementById('superAdminModal');if(devModal){devModal.style.display='flex';window.switchDevSubTab?.('teams');window.loadSuperAdminStats?.();}} else developerSessionPin='';
        }catch(err){
            console.error('[Ghost Exit] restore failed:',err); developerSessionPin=''; sessionStorage.removeItem('adt_ghost_origin_session_v2'); sessionStorage.removeItem('adt_ghost_origin_role_v2'); localStorage.removeItem('atd_original_team_id');
            window.customAlert('تعذر استعادة الحساب','سيتم تسجيل الخروج لحماية صلاحيات الحساب وعدم نقل صلاحيات المطور لأي مستخدم.'); window.handleSignOut();
        }
    };

    // سلة المهملات السحابية مع التنظيف التلقائي لكل 48 ساعة
    window.openRecycleBinModal = async function() {
        if (!dbClient) window.initSupabaseClient();
        const container = document.getElementById('recycleBinListContainer');
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">جاري جلب المحذوفات...</div>';
        document.getElementById('recycleBinModal').style.display = 'flex';
        if (!developerSessionPin) { container.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px">جلسة المطور منتهية</div>'; return; }
        try {
            await dbClient.rpc('adt_admin_recycle_cleanup', { p_dev_pin: developerSessionPin, p_device_id: getDeviceId() });
            const { data, error } = await dbClient.rpc('adt_admin_recycle_list', { p_dev_pin: developerSessionPin, p_device_id: getDeviceId() });
            if (error) throw error;
            const deletedProds = Array.isArray(data) ? data : [];
            if (!deletedProds.length) {
                container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:30px 10px;">لا توجد عناصر محذوفة (يتم التنظيف تلقائياً كل يومين)</div>';
                return;
            }
            container.innerHTML = deletedProds.map(p => {
                const idArg = window.safeUrlArg(p.id);
                return `<div style="background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">
                    <div><b style="color:#FFF;font-size:12px;">${window.escapeHtml(p.name)}</b><div style="font-size:10px;color:var(--text-muted);">سعر البيع: ${Number(p.sell_price||0).toFixed(2)}</div></div>
                    <button onclick="window.restoreRecycledProduct(decodeURIComponent('${idArg}'))" style="background:rgba(0,210,180,.15);border:1px solid var(--primary);color:var(--primary);border-radius:6px;padding:4px 8px;font-size:10px;font-weight:800;">استرجاع</button>
                </div>`;
            }).join('');
        } catch(e) {
            console.error('[Recycle Bin] list failed:', e);
            container.innerHTML = '<div style="text-align:center;color:var(--red);">فشل جلب سلة المهملات</div>';
        }
    };

    window.restoreRecycledProduct = async function(prodId) {
        if (!dbClient || !developerSessionPin) { window.customAlert('تعذر الاسترجاع', 'جلسة المطور أو الاتصال غير متاح.'); return; }
        const confirmed = await window.showAppConfirm({
            title:'استرجاع الصنف؟',
            message:'سيتم إعادة الصنف المحذوف إلى قائمة منتجات فريقه بنفس بياناته وأسعاره السابقة.',
            confirmText:'استرجاع الآن',
            cancelText:'إلغاء'
        });
        if (!confirmed) return;
        try {
            const { data, error } = await dbClient.rpc('adt_admin_recycle_restore', {
                p_dev_pin: developerSessionPin, p_product_id: String(prodId),
                p_device_id: getDeviceId()
            });
            if (error || data !== true) throw error || new Error('RESTORE_REJECTED');
            window.showToast('تم استرجاع الصنف بنجاح');
            await window.openRecycleBinModal();
            await window.fetchProductsFromSupabase();
        } catch(e) {
            console.error('[Recycle Bin] restore failed:', e);
            window.customAlert('تعذر الاسترجاع', 'لم يتم استرجاع الصنف من الخادم.');
        }
    };

    window.openEmergencyLockModal = function() {
        document.getElementById('inputLockPinValue').value = '';
        document.getElementById('promptLockModal').style.display = 'flex';
        setTimeout(() => document.getElementById('inputLockPinValue')?.focus(), 150);
    };

    window.executeEmergencyLock = async function() {
        const pin = document.getElementById('inputLockPinValue').value.trim();
        if (!pin) { window.customAlert('بيانات ناقصة', 'أدخل الرمز السري للقفل.'); return; }
        if (!developerSessionPin) { window.customAlert('جلسة المطور منتهية', 'افتح وضع المطور وأدخل الرمز السري مرة أخرى.'); return; }
        if (!dbClient) { window.customAlert('تعذر القفل', 'لا يوجد اتصال بقاعدة البيانات.'); return; }
        try {
            const { data, error } = await dbClient.rpc('adt_emergency_lock_all', {
                p_dev_pin: developerSessionPin,
                p_lock_pin: pin,
                p_device_id: getDeviceId()
            });
            if (error || data !== true) throw error || new Error('LOCK_REJECTED');
        } catch (e) {
            console.error('[Emergency Lock] failed:', e);
            window.customAlert('تعذر القفل', 'لم يتم قفل المتاجر على الخادم. حاول مرة أخرى.');
            return;
        }
        document.getElementById('inputLockPinValue').value = '';
        window.closeModal('promptLockModal');
        window.closeModal('superAdminModal');
        if (currentTeam) currentTeam.is_locked = true;
        window.checkTeamLockState();
        window.showToast('تم قفل التطبيق عن الجميع');
    };

    window.handleEmergencyUnlock = async function() {
        const input = document.getElementById('emergencyUnlockPinInput');
        const pin = input?.value.trim() || '';
        if (!pin) { window.customAlert('تنبيه', 'أدخل الرمز السري.'); return; }
        if (!dbClient || !currentTeam) { window.customAlert('تعذر التحقق', 'لا يوجد اتصال بقاعدة البيانات أو فريق نشط.'); return; }
        try {
            const { data, error } = await dbClient.rpc('adt_emergency_unlock_team', {
                p_team_id: String(currentTeam.id),
                p_pin: pin,
                p_device_id: getDeviceId()
            });
            if (error) throw error;
            if (data === true) {
                currentTeam.is_locked = false;
                if (input) input.value = '';
                document.getElementById('teamSuspendedModal').style.display = 'none';
                window.showToast('تم التحقق بنجاح وفتح التطبيق');
            } else {
                window.customAlert('خطأ في الرمز', 'الرمز السري غير صحيح.');
            }
        } catch (e) {
            console.error('[Emergency Unlock] failed:', e);
            window.customAlert('تعذر التحقق', 'حدث خطأ أثناء التحقق من رمز فك القفل.');
        }
    };

    window.exportFullDatabaseBackup = async function() {
        if (!dbClient || !developerSessionPin) { window.customAlert('جلسة المطور منتهية', 'افتح وضع المطور من جديد.'); return; }
        try {
            window.showToast('جاري تجهيز النسخة الاحتياطية...');
            const { data, error } = await dbClient.rpc('adt_admin_backup', { p_dev_pin: developerSessionPin, p_device_id: getDeviceId() });
            if (error || !data) throw error || new Error('BACKUP_FAILED');
            const backupObj = { ...data, backup_version: 11, export_date: new Date().toISOString(), activity_logs_local_device: activityLogs || [] };
            const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json;charset=utf-8' });
            const fileName = `ADT_Stock_Full_Backup_${new Date().toISOString().slice(0,10)}.json`;
            const saveMode = await window.saveGeneratedFile(blob, fileName, 'application/json');
            window.showToast(saveMode === 'native' ? 'اختر مكان حفظ النسخة الاحتياطية' : 'تم تحميل النسخة الاحتياطية بنجاح');
        } catch(e) {
            console.error('[Backup] failed:', e);
            window.customAlert('خطأ', 'تعذر تحميل النسخة الاحتياطية.');
        }
    };

    // محرك بناء ملف الـ PDF الداخلي المباشر بدون أخطاء أذونات
    function createPurePdfBlobFromCanvas(canvas) {
        const jpegBytes = canvasToJpegBytes(canvas);

        const widthPt = 595.28;
        const imgHeightPt = (canvas.height * widthPt) / canvas.width;
        const heightPt = Math.max(841.89, imgHeightPt + 20);
        const yOffset = heightPt - imgHeightPt;

        const contentStream = `q\n${widthPt.toFixed(2)} 0 0 ${imgHeightPt.toFixed(2)} 0 ${yOffset.toFixed(2)} cm\n/Im1 Do\nQ\n`;
        const encoder = new TextEncoder();

        const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
        const obj2 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
        const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n`;
        const obj4 = `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`;
        const obj5Head = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`;
        const obj5Tail = "\nendstream\nendobj\n";

        const headerBytes = encoder.encode(header);
        const obj1Bytes = encoder.encode(obj1);
        const obj2Bytes = encoder.encode(obj2);
        const obj3Bytes = encoder.encode(obj3);
        const obj4Bytes = encoder.encode(obj4);
        const obj5HeadBytes = encoder.encode(obj5Head);
        const obj5TailBytes = encoder.encode(obj5Tail);

        let offset = headerBytes.length;
        const offsets = [0];
        offsets.push(offset); offset += obj1Bytes.length;
        offsets.push(offset); offset += obj2Bytes.length;
        offsets.push(offset); offset += obj3Bytes.length;
        offsets.push(offset); offset += obj4Bytes.length;
        offsets.push(offset); offset += obj5HeadBytes.length + jpegBytes.length + obj5TailBytes.length;

        let xref = "xref\n0 6\n0000000000 65535 f \n";
        for (let i = 1; i <= 5; i++) {
            xref += String(offsets[i]).padStart(10, '0') + " 00000 n \n";
        }

        const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
        const xrefBytes = encoder.encode(xref);
        const trailerBytes = encoder.encode(trailer);

        return new Blob([
            headerBytes, obj1Bytes, obj2Bytes, obj3Bytes, obj4Bytes, obj5HeadBytes,
            jpegBytes, obj5TailBytes, xrefBytes, trailerBytes
        ], { type: 'application/pdf' });
    }

    function canvasToJpegBytes(canvas) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const jpegBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) jpegBytes[i] = binary.charCodeAt(i);
        return jpegBytes;
    }

    function concatPdfBytes(chunks) {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        chunks.forEach(chunk => {
            result.set(chunk, offset);
            offset += chunk.length;
        });
        return result;
    }

    // يبني تقريراً حقيقياً متعدد الصفحات بدلاً من تمديد صفحة واحدة عند كثرة السجلات.
    function createPurePdfBlobFromCanvases(canvases) {
        const pages = (Array.isArray(canvases) ? canvases : []).filter(Boolean);
        if (!pages.length) throw new Error('PDF_PAGES_REQUIRED');

        const encoder = new TextEncoder();
        const nl = String.fromCharCode(10);
        const widthPt = 595.28;
        const heightPt = 841.89;
        const objectCount = 2 + (pages.length * 3);
        const objects = new Array(objectCount + 1);
        const pageObjectNumbers = pages.map((_, index) => 3 + (index * 3));

        objects[1] = encoder.encode([
            '1 0 obj',
            '<< /Type /Catalog /Pages 2 0 R >>',
            'endobj',
            ''
        ].join(nl));
        objects[2] = encoder.encode([
            '2 0 obj',
            '<< /Type /Pages /Kids [' + pageObjectNumbers.map(number => number + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>',
            'endobj',
            ''
        ].join(nl));

        pages.forEach((canvas, index) => {
            const pageObject = 3 + (index * 3);
            const contentObject = pageObject + 1;
            const imageObject = pageObject + 2;
            const jpegBytes = canvasToJpegBytes(canvas);
            const content = [
                'q',
                widthPt.toFixed(2) + ' 0 0 ' + heightPt.toFixed(2) + ' 0 0 cm',
                '/Im1 Do',
                'Q',
                ''
            ].join(nl);

            objects[pageObject] = encoder.encode([
                pageObject + ' 0 obj',
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + widthPt.toFixed(2) + ' ' + heightPt.toFixed(2) + '] /Contents ' + contentObject + ' 0 R /Resources << /XObject << /Im1 ' + imageObject + ' 0 R >> >> >>',
                'endobj',
                ''
            ].join(nl));
            objects[contentObject] = encoder.encode([
                contentObject + ' 0 obj',
                '<< /Length ' + encoder.encode(content).length + ' >>',
                'stream',
                content + 'endstream',
                'endobj',
                ''
            ].join(nl));
            objects[imageObject] = concatPdfBytes([
                encoder.encode([
                    imageObject + ' 0 obj',
                    '<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegBytes.length + ' >>',
                    'stream',
                    ''
                ].join(nl)),
                jpegBytes,
                encoder.encode([
                    '',
                    'endstream',
                    'endobj',
                    ''
                ].join(nl))
            ]);
        });

        const headerBytes = encoder.encode(['%PDF-1.4', '%ADT-PDF', ''].join(nl));
        const parts = [headerBytes];
        const offsets = new Array(objectCount + 1).fill(0);
        let offset = headerBytes.length;

        for (let objectNumber = 1; objectNumber <= objectCount; objectNumber++) {
            offsets[objectNumber] = offset;
            parts.push(objects[objectNumber]);
            offset += objects[objectNumber].length;
        }

        const xrefOffset = offset;
        let xref = 'xref' + nl + '0 ' + (objectCount + 1) + nl + '0000000000 65535 f ' + nl;
        for (let objectNumber = 1; objectNumber <= objectCount; objectNumber++) {
            xref += String(offsets[objectNumber]).padStart(10, '0') + ' 00000 n ' + nl;
        }
        const trailer = [
            'trailer',
            '<< /Size ' + (objectCount + 1) + ' /Root 1 0 R >>',
            'startxref',
            String(xrefOffset),
            '%%EOF',
            ''
        ].join(nl);
        parts.push(encoder.encode(xref), encoder.encode(trailer));
        return new Blob(parts, { type: 'application/pdf' });
    }

    function downloadPdfBlob(pdfBlob, fileName) {
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    }

    async function sharePdfBlob(pdfBlob, fileName) {
        if (window.Android && typeof window.Android.sharePdfBase64 === 'function') {
            const reader = new FileReader();
            const base64 = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(String(reader.result).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(pdfBlob);
            });
            window.Android.sharePdfBase64(base64, fileName);
            window.showToast('تم إنشاء PDF — اختر التطبيق للمشاركة');
            return;
        }

        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({ files: [pdfFile], title: fileName });
            return;
        }

        downloadPdfBlob(pdfBlob, fileName);
    }

    async function renderCanvasToPdfAndShare(canvas, fileName) {
        try {
            await sharePdfBlob(createPurePdfBlobFromCanvas(canvas), fileName);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('[PDF Export] failed:', err);
            window.customAlert('تعذر تصدير التقرير', 'حدث خطأ أثناء إنشاء أو مشاركة ملف PDF. حاول مرة أخرى.');
        }
    }

    // إدارة المنتجات والأسعار بدون صور، مع قراءة جميع الصفحات بدلاً من أول 1000 صف فقط.
    const PRODUCT_SYNC_PAGE_SIZE = 1000;
    const PRODUCT_SYNC_MAX_PAGES = 200;
    const PRODUCT_BACKGROUND_SYNC_INTERVAL = 60 * 1000;

    window.updateProductsLoadingProgress = function(loadedCount) {
        // المزامنة صامتة: لا نغيّر القائمة أو العدد أو الإحصائيات أثناء الجلب.
        window.__adtProductsBackgroundLoadedCount = Number(loadedCount || 0);
    };

    window.fetchAllProductRowsSecure = async function(teamIdAtStart) {
        const requestArgs = {
            p_team_id: String(teamIdAtStart),
            p_user_id: getDeviceId(),
            p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null)
        };
        const allRows = [];
        const seenIds = new Set();
        const seenPageSignatures = new Set();

        for (let page = 0; page < PRODUCT_SYNC_MAX_PAGES; page++) {
            if (!currentTeam || String(currentTeam.id) !== String(teamIdAtStart)) {
                throw new Error('PRODUCT_SYNC_TEAM_CHANGED');
            }
            const from = page * PRODUCT_SYNC_PAGE_SIZE;
            const to = from + PRODUCT_SYNC_PAGE_SIZE - 1;
            let request = dbClient.rpc('adt_read_products', requestArgs);
            const supportsRange = !!request && typeof request.range === 'function';
            if (supportsRange) request = request.range(from, to);

            const { data, error } = await request;
            if (error) throw error;
            if (data === null) throw new Error('READ_NOT_AUTHORIZED');
            const pageRows = Array.isArray(data) ? data : [];

            // بعض إصدارات الدالة قد تعيد مصفوفة JSON كاملة؛ عندها لا نكرر نفس الطلب.
            if (!supportsRange || pageRows.length > PRODUCT_SYNC_PAGE_SIZE) return pageRows;

            const firstId = String(pageRows[0]?.id || '');
            const lastId = String(pageRows[pageRows.length - 1]?.id || '');
            const pageSignature = `${pageRows.length}|${firstId}|${lastId}`;
            if (seenPageSignatures.has(pageSignature)) {
                console.warn('[Products Sync] RPC returned the same page twice; using the complete unique result received.');
                return allRows;
            }
            seenPageSignatures.add(pageSignature);

            let addedThisPage = 0;
            pageRows.forEach((row, index) => {
                const key = String(row?.id || `${row?.name || ''}|${row?.updated_at || ''}|${page}|${index}`);
                if (seenIds.has(key)) return;
                seenIds.add(key);
                allRows.push(row);
                addedThisPage++;
            });
            window.updateProductsLoadingProgress(allRows.length);

            if (pageRows.length < PRODUCT_SYNC_PAGE_SIZE) return allRows;
            if (addedThisPage === 0) return allRows;
        }
        throw new Error('PRODUCT_SYNC_PAGE_LIMIT_REACHED');
    };

    // V285: مصدر أساسي واحد لحالة الجرد المحلية أثناء المزامنة.
    // لا تسمح مزامنة المنتجات بإرجاع قيمة أقدم من آخر تعديل محلي أو آخر تصفير.
    window.__adtAuditMutationMeta = window.__adtAuditMutationMeta || {};
    window.getAuditMutationMetaKey = function(teamId){ return 'adt_audit_mutation_meta__'+String(teamId||currentTeam?.id||'local'); };
    window.readAuditMutationMeta = function(teamId){
        const key=String(teamId||currentTeam?.id||'local');
        const v=window.__adtAuditMutationMeta?.[key];
        return v&&typeof v==='object'?v:{resetAt:0,items:{}};
    };
    window.writeAuditMutationMeta = function(teamId,meta){
        const key=String(teamId||currentTeam?.id||'local');
        window.__adtAuditMutationMeta[key]=window.cloneCriticalState?.(meta||{resetAt:0,items:{}})||meta||{resetAt:0,items:{}};
    };
    window.markLocalAuditMutation = function(productId,qty){
        const teamId=String(currentTeam?.id||''); if(!teamId||!productId)return;
        const meta=window.readAuditMutationMeta(teamId); meta.items=meta.items||{};
        meta.items[String(productId)]={qty:Number(qty||0),at:Date.now()};
        window.writeAuditMutationMeta(teamId,meta);
    };
    window.markLocalAuditReset = function(){
        const teamId=String(currentTeam?.id||''); if(!teamId)return;
        const meta=window.readAuditMutationMeta(teamId); meta.resetAt=Date.now(); meta.items={};
        window.writeAuditMutationMeta(teamId,meta);
    };

    window.performProductsSync = async function() {
        if (!dbClient || !currentTeam) {
            try {
                products = await window.readProductsCache(currentTeam?.id);
            } catch (error) {
                console.error('[Products Sync] Failed to read offline cache:', error);
            }
            window.renderProducts();
            window.renderHomeStats();
            return true;
        }

        const teamIdAtStart = String(currentTeam.id);
        const syncStartedAt = Date.now();
        const syncGeneration = Number(window.__adtProductsSyncGeneration || 0) + 1;
        window.__adtProductsSyncGeneration = syncGeneration;
        try {
            window.updateProductsLoadingProgress(0);
            const allProds = await window.fetchAllProductRowsSecure(teamIdAtStart);

            if (!currentTeam || String(currentTeam.id) !== teamIdAtStart) return false;

            const oldPriceMap = new Map((products || []).map(product => [
                String(product.id),
                { buy:Number(product.buyPrice || 0), sell:Number(product.sellPrice || 0), name:product.name }
            ]));
            const nextProducts = allProds.map(product => ({
                id: product.id,
                name: product.name,
                buyPrice: product.buy_price || 0,
                sellPrice: product.sell_price || 0,
                supplier: product.supplier_name || productSuppliersMap[product.name] || '',
                updatedAt: product.updated_at ? new Date(product.updated_at).getTime() : Date.now(),
                priceUpdatedAt: product.price_updated_at ? new Date(product.price_updated_at).getTime() : 0,
                auditQty: product.audit_qty || 0,
                packQty: Math.max(1, Number(product.pack_qty || 1)),
                packName: String(product.pack_name || 'صندوق'),
                pieceName: String(product.piece_name || 'قطعة')
            })).filter(product => product.id && product.name);

            let ownEdit = null;
            try { ownEdit = JSON.parse(localStorage.getItem('adt_last_own_price_edit_' + teamIdAtStart) || 'null'); } catch (_) {}
            const changedNames = [];
            for (const product of nextProducts) {
                const previous = oldPriceMap.get(String(product.id));
                if (!previous || (previous.buy === Number(product.buyPrice || 0) && previous.sell === Number(product.sellPrice || 0))) continue;
                const ownChange = ownEdit && String(ownEdit.id) === String(product.id) && (Date.now() - Number(ownEdit.at || 0) < 120000);
                const sellPriceChanged = previous.sell !== Number(product.sellPrice || 0);
                if (!ownChange && sellPriceChanged) changedNames.push(product.name);
            }
            if (ownEdit && Date.now() - Number(ownEdit.at || 0) >= 120000) {
                localStorage.removeItem('adt_last_own_price_edit_' + teamIdAtStart);
            }

            // Preserve developer edits until the server accepts them.
            const pending=window.getDeveloperOfflineProductQueue(teamIdAtStart);
            for (const entry of pending) {
                const local=products.find(p=>String(p.id)===String(entry.product?.id));
                if (!local) continue;
                const i=nextProducts.findIndex(p=>String(p.id)===String(local.id));
                if (i>=0) nextProducts[i]=local; else nextProducts.unshift(local);
            }
            const pendingAudit=window.getDeveloperOfflineMutationQueue(teamIdAtStart)
                .filter(entry=>entry.name==='adt_audit_set_qty'||entry.name==='adt_audit_reset');
            for (const entry of pendingAudit) {
                if(entry.name==='adt_audit_reset')nextProducts.forEach(item=>item.auditQty=0);
                else {
                    const item=nextProducts.find(item=>String(item.id)===String(entry.args?.p_product_id));
                    if(item)item.auditQty=Number(entry.args?.p_qty||0);
                }
            }
            const pendingDeletes=window.getDeveloperOfflineMutationQueue(teamIdAtStart)
                .filter(entry=>entry.name==='adt_product_delete')
                .map(entry=>String(entry.args?.p_product_id));
            for (const id of pendingDeletes) {
                const index=nextProducts.findIndex(item=>String(item.id)===id);
                if(index>=0)nextProducts.splice(index,1);
            }
            // لا نسمح لقراءة قديمة من الخادم أن تعيد جرداً تم تعديله محلياً للتو.
            const auditMeta=window.readAuditMutationMeta(teamIdAtStart), auditNow=Date.now();
            for(const item of nextProducts){
                const localMeta=auditMeta.items?.[String(item.id)];
                const serverAt=Number(item.updatedAt||0);
                if(localMeta && Number(localMeta.at||0) > serverAt && auditNow-Number(localMeta.at||0) < 15*60*1000){
                    item.auditQty=Number(localMeta.qty||0);
                }else if(Number(auditMeta.resetAt||0)>serverAt && auditNow-Number(auditMeta.resetAt||0) < 24*60*60*1000){
                    item.auditQty=0;
                }
            }
            // V316: لا تسمح لنتيجة HTTP بدأت قبل حدث Realtime أن تدوس على
            // نسخة أحدث وصلت أثناء الطلب. نستخدم updated_at من الخادم، مع وقت
            // استقبال الحدث كشبكة أمان عندما تكون النسخة غير موجودة/متساوية.
            const watermarks = window.__adtProductRealtimeWatermarks[teamIdAtStart] || {};
            const nextById = new Map(nextProducts.map(item => [String(item.id), item]));
            const currentById = new Map((Array.isArray(products) ? products : []).map(item => [String(item.id), item]));
            for (const [id, mark] of Object.entries(watermarks)) {
                const local = currentById.get(id);
                const server = nextById.get(id);
                const serverVersion = Number(server?.updatedAt || 0);
                const markVersion = Number(mark?.version || 0);
                const eventAfterSyncStarted = Number(mark?.receivedAt || 0) > syncStartedAt;
                const eventIsNewer = markVersion > 0 && serverVersion > 0 && markVersion >= serverVersion;
                if (mark?.deleted) {
                    if (eventAfterSyncStarted || markVersion >= serverVersion || !server) nextById.delete(id);
                } else if (local && (eventAfterSyncStarted || eventIsNewer || (!server && markVersion > 0))) {
                    nextById.set(id, local);
                }
                // بمجرد أن أكد الخادم نفس النسخة أو نسخة أحدث بعد دورة بدأت بعد الحدث،
                // لا نحتاج للاحتفاظ بالـwatermark.
                if (server && serverVersion >= markVersion && !eventAfterSyncStarted) delete watermarks[id];
                if (mark?.deleted && !server && !eventAfterSyncStarted) delete watermarks[id];
            }
            if (window.__adtProductsSyncGeneration !== syncGeneration || !currentTeam || String(currentTeam.id) !== teamIdAtStart) return false;
            products = Array.from(nextById.values());
            await window.writeProductsCache(products, teamIdAtStart);
            window.__adtLastProductsSyncAt = Date.now();

            if (changedNames.length) {
                const changedSet = new Set(changedNames);
                const latestChange = products.reduce((latest, product) => changedSet.has(product.name) ? Math.max(latest, Number(product.updatedAt || 0)) : latest, 0);
                const signature = teamIdAtStart + '|' + changedNames.slice().sort().join('|') + '|' + latestChange;
                const seenKey = 'adt_seen_price_change_signature_' + teamIdAtStart;
                if (localStorage.getItem(seenKey) !== signature) {
                    localStorage.setItem(seenKey, signature);
                    const shown = changedNames.slice(0, 3);
                    const more = changedNames.length - shown.length;
                    const body = changedNames.length === 1
                        ? `تم تغيير سعر بيع الصنف: ${shown[0]}. يمكنك مراجعة السعر الجديد من قائمة المنتجات.`
                        : `تم تغيير سعر بيع ${changedNames.length} أصناف: ${shown.join('، ')}${more > 0 ? `، و${more} أخرى` : ''}. راجع قائمة المنتجات للاطلاع على الأسعار الجديدة.`;
                    window.sendPushNotification('تغيير سعر البيع', body, false);
                }
            }
            window.renderProducts();
            window.renderHomeStats();
            return true;
        } catch (error) {
            if (error?.message === 'PRODUCT_SYNC_TEAM_CHANGED') return false;
            console.error('[Products Sync] Supabase read failed:', error);

            if (!products || products.length === 0) {
                try {
                    const cached = await window.readProductsCache(teamIdAtStart);
                    if (cached.length > 0) products = cached;
                } catch (_) {}
            }
            window.renderProducts();
            window.renderHomeStats();

            const reason = error?.message || error?.details || 'خطأ غير معروف';
            const badge = document.getElementById('prodStatCount');
            if (badge && (!products || products.length === 0)) badge.innerText = 'تعذر المزامنة';
            window.interfaceAlert(
                'products',
                'تعذر مزامنة المنتجات',
                'تعذر تحميل أحدث قائمة من الخادم، لذلك احتفظ التطبيق بآخر نسخة موجودة على الجهاز ولم يحذف أي صنف.\n\nالسبب: ' + reason
            );
            return false;
        }
    };

    window.fetchProductsFromSupabase = function() {
        const teamKey = String(currentTeam?.id || 'offline');
        if (window.__adtProductsSyncPromise && window.__adtProductsSyncTeamKey === teamKey) {
            return window.__adtProductsSyncPromise;
        }
        window.__adtProductsSyncTeamKey = teamKey;
        const basePromise = window.performProductsSync();
        let trackedPromise;
        trackedPromise = basePromise.finally(() => {
            if (window.__adtProductsSyncPromise === trackedPromise) {
                window.__adtProductsSyncPromise = null;
                window.__adtProductsSyncTeamKey = '';
            }
        });
        window.__adtProductsSyncPromise = trackedPromise;
        return trackedPromise;
    };

    window.fetchProductsIfDue = function(force) {
        const elapsed = Date.now() - Number(window.__adtLastProductsSyncAt || 0);
        if (!force && elapsed < PRODUCT_BACKGROUND_SYNC_INTERVAL) return Promise.resolve(true);
        return window.fetchProductsFromSupabase();
    };

    window.filterProducts = function(type) {
        activeFilter = type;
        ['All', 'Alpha', 'Cost'].forEach(t => {
            const el = document.getElementById('btnFilter' + t);
            if (el) el.classList.remove('active');
        });
        const currentBtn = document.getElementById('btnFilter' + type.charAt(0).toUpperCase() + type.slice(1));
        if (currentBtn) currentBtn.classList.add('active');
        window.renderProducts();
    };

    window.keepProductFieldAboveKeyboard = function(el) {
        if (!el || !document.getElementById('productModal')?.contains(el)) return;
        setTimeout(() => { try { el.scrollIntoView({behavior:'smooth', block:'center', inline:'nearest'}); } catch (_) { el.scrollIntoView(false); } }, 180);
    };
    document.addEventListener('focusin', function(e){ if (e.target?.matches?.('#productModal input, #productModal select, #productModal textarea')) window.keepProductFieldAboveKeyboard(e.target); });

    window.openAddModal = function() {
        // إضافة صنف جديد محصورة في مدير الفريق الرئيسي لأن سعر الشراء إلزامي عند الإنشاء.
        if (!window.canEditBuyPrice()) {
            window.customAlert('غير مسموح', 'إضافة صنف جديد متاحة لمدير الفريق الرئيسي فقط.');
            return;
        }
        editingIndex = null;
        window.__adtPendingNewProductId = null;
        currentSelectedSupplier = '';

        document.getElementById('modalTitle').innerText = 'إضافة صنف جديد';
        document.getElementById('pName').value = '';
        document.getElementById('pBuyPrice').value = window.canEditBuyPrice() ? '' : '0';
        document.getElementById('pSellPrice').value = '';
        document.getElementById('pPackName').value = 'صندوق';
        document.getElementById('pPieceName').value = 'قطعة';
        document.getElementById('pPackQty').value = '';
        window.updatePiecePricePreview?.();
        window.applyBuyPriceEditState();
        window.applyProductEditScope();
        const packQtyInput=document.getElementById('pPackQty'); if (packQtyInput) { const canEditPackQty=window.canEditBuyPrice(); packQtyInput.readOnly=!canEditPackQty; packQtyInput.style.opacity=canEditPackQty?'1':'.62'; packQtyInput.style.cursor=canEditPackQty?'text':'not-allowed'; packQtyInput.title=canEditPackQty?'':'تعديل عدد القطع متاح لمدير الفريق الرئيسي فقط'; }
        const sellInput=document.getElementById('pSellPrice'); if (sellInput) { sellInput.disabled=!window.canEditSellPrice(); sellInput.style.opacity=sellInput.disabled?'.55':'1'; }
        document.getElementById('pSupplierSelectedText').innerText = '-- بدون مورد محدد --';

        document.getElementById('productModal').style.display = 'flex';
        setTimeout(() => document.getElementById('pName')?.focus(), 150);
    };

    window.openEditProductModal = async function(idx) {
        if (!window.canEditProducts()) {
            window.customAlert('تنبيه', 'لا تملك صلاحية تعديل المنتجات.');
            return false;
        }
        const p = products[idx];
        if (!p) return false;
        const confirmed = await window.showAppConfirm({
            title: 'تعديل المنتج',
            message: `هل تريد تعديل المنتج «${p.name}»؟`,
            confirmText: 'تعديل المنتج',
            cancelText: 'إلغاء'
        });
        if (!confirmed) return false;

        editingIndex = idx;
        currentSelectedSupplier = p.supplier || '';

        document.getElementById('modalTitle').innerText = 'تعديل بيانات الصنف';
        document.getElementById('pName').value = p.name;
        document.getElementById('pBuyPrice').value = p.buyPrice;
        document.getElementById('pSellPrice').value = p.sellPrice;
        document.getElementById('pPackName').value = p.packName || 'صندوق';
        document.getElementById('pPieceName').value = p.pieceName || 'قطعة';
        document.getElementById('pPackQty').value = Math.max(1, Number(p.packQty || 1));
        window.updatePiecePricePreview?.();
        window.applyBuyPriceEditState();
        window.applyProductEditScope();
        const packQtyInput=document.getElementById('pPackQty'); if (packQtyInput) { const canEditPackQty=window.canEditBuyPrice(); packQtyInput.readOnly=!canEditPackQty; packQtyInput.style.opacity=canEditPackQty?'1':'.62'; packQtyInput.style.cursor=canEditPackQty?'text':'not-allowed'; packQtyInput.title=canEditPackQty?'':'تعديل عدد القطع متاح لمدير الفريق الرئيسي فقط'; }
        const sellInput=document.getElementById('pSellPrice'); if (sellInput) { sellInput.disabled=!window.canEditSellPrice(); sellInput.style.opacity=sellInput.disabled?'.55':'1'; sellInput.title=sellInput.disabled?'المدير لم يسمح لك بتغيير سعر البيع':''; }
        document.getElementById('pSupplierSelectedText').innerText = currentSelectedSupplier ? currentSelectedSupplier : '-- بدون مورد محدد --';

        document.getElementById('productModal').style.display = 'flex';
        setTimeout(() => document.getElementById('pSellPrice')?.focus(), 150);
        return true;
    };

    window.isDeveloperOffline = function() {
        return localStorage.getItem('atd_sales_signed_out')!=='true' &&
            !window.getNativeNetworkState() && !!currentTeam?.id && !isGhostMode && window.isDeveloperAccount();
    };
    window.getDeveloperOfflineMutationQueue = function(teamId) {
        try { const rows=JSON.parse(localStorage.getItem('adt_dev_pending_mutations_'+teamId)||'[]'); return Array.isArray(rows)?rows:[]; }
        catch (_) { return []; }
    };
    window.developerOfflineRpc = async function(name,args,mockData=true) {
        if (!window.isDeveloperOffline()) return dbClient.rpc(name,args);
        const teamId=String(currentTeam.id),key='adt_dev_pending_mutations_'+teamId;
        if (mockData===true && (name==='adt_debt_create' || name==='adt_shortage_add')) mockData={id:'offline_'+window.makeSafeId()};
        const queue=window.getDeveloperOfflineMutationQueue(teamId);
        queue.push({id:window.makeSafeId(),name,args,mockData});
        // If storage fails, no UI change may be committed.
        try { localStorage.setItem(key,JSON.stringify(queue)); }
        catch (error) { return {data:null,error,offline:true}; }
        return {data:mockData,error:null,offline:true};
    };
    window.hasPendingDeveloperMutations = function(domain) {
        if (!currentTeam?.id) return false;
        const names={debts:['adt_debt_'],shortages:['adt_shortage_'],audit:['adt_audit_'],sales:['adt_daily_sales_']};
        return window.getDeveloperOfflineMutationQueue(String(currentTeam.id))
            .some(entry=>(names[domain]||[]).some(prefix=>entry.name.startsWith(prefix)));
    };
    window.flushDeveloperOfflineMutations = async function(teamId) {
        if (!dbClient || !window.getNativeNetworkState() || !window.isDeveloperAccount() || isGhostMode || !teamId) return;
        if (window.__adtDevMutationFlushBusy) return;
        window.__adtDevMutationFlushBusy=true;
        try {
        const key='adt_dev_pending_mutations_'+teamId;
        let queue=window.getDeveloperOfflineMutationQueue(teamId);
        let idMap={};
        try { idMap=JSON.parse(localStorage.getItem('adt_dev_pending_id_map_'+teamId)||'{}')||{}; } catch (_) {}
        for (const entry of queue.slice()) {
            if (String(currentTeam?.id)!==String(teamId)) break;
            const args={...entry.args};
            for (const field of ['p_debt_id','p_settlement_id']) {
                if (idMap[String(args[field])]) args[field]=idMap[String(args[field])];
            }
            try {
                const {data,error}=await dbClient.rpc(entry.name,args);
                if (error || data===false || (['adt_debt_create','adt_shortage_add','adt_daily_sales_settle'].includes(entry.name)&&!data?.id)) throw error||new Error('OFFLINE_MUTATION_REJECTED');
                if (entry.name==='adt_debt_create' && entry.mockData?.id && data?.id) {
                    idMap[String(entry.mockData.id)]=String(data.id);
                    const all=[...(debts.customers||[]),...(debts.suppliers||[])];
                    const local=all.find(a=>String(a.id)===String(entry.mockData.id));
                    if(local)local.id=String(data.id);
                    if(activeLedgerAccount && String(activeLedgerAccount.id)===String(entry.mockData.id))activeLedgerAccount.id=String(data.id);
                    window.saveTeamCache('atd_sales_debts_v17',debts);
                }
                if (entry.name==='adt_daily_sales_settle' && entry.mockData?.id && data?.id) {
                    idMap[String(entry.mockData.id)]=String(data.id);
                }
                localStorage.setItem('adt_dev_pending_id_map_'+teamId,JSON.stringify(idMap));
                queue=queue.filter(item=>item.id!==entry.id);
                localStorage.setItem(key,JSON.stringify(queue));
            } catch(error) {
                console.warn('[Developer Offline] pending mutation:',entry.name,error);
                window.showToast('بعض التعديلات المحلية لم تُزامن بعد؛ ستتم إعادة المحاولة');
                break;
            }
        }
        } finally { window.__adtDevMutationFlushBusy=false; }
    };

    // Developer-only local edits are queued for server reconciliation after reconnection.
    window.getDeveloperOfflineProductQueue = function(teamId) {
        try { const rows=JSON.parse(localStorage.getItem('adt_dev_pending_products_'+teamId)||'[]'); return Array.isArray(rows)?rows:[]; }
        catch (_) { return []; }
    };
    window.flushDeveloperOfflineProducts = async function(teamId) {
        if (!dbClient || !window.getNativeNetworkState() || !window.isDeveloperAccount() || isGhostMode || !teamId) return;
        if (window.__adtDevProductFlushBusy) return;
        window.__adtDevProductFlushBusy=true;
        try {
        const key='adt_dev_pending_products_'+teamId;
        let queue=window.getDeveloperOfflineProductQueue(teamId);
        for (const entry of queue.slice()) {
            if (String(currentTeam?.id)!==String(teamId)) break;
            try {
                const {data,error}=await dbClient.rpc('adt_product_save_v131',{
                    p_team_id:String(teamId),p_user_id:getDeviceId(),p_dev_pin:null,
                    p_product:entry.product,p_old_name:entry.oldName||null
                });
                if (error || data!==true) throw error||new Error('PRODUCT_REJECTED');
                queue=queue.filter(row=>row.localId!==entry.localId);
                localStorage.setItem(key,JSON.stringify(queue));
            } catch(error) {
                console.warn('[Developer Offline] product awaits sync:',error);
                window.showToast('بعض تعديلات المطور المحلية لم تُزامن بعد');
                break;
            }
        }
        } finally { window.__adtDevProductFlushBusy=false; }
    };

    window.queueDeveloperOfflineProductPayload = function(product,oldName) {
        const teamId=String(currentTeam.id),key='adt_dev_pending_products_'+teamId;
        const existing=window.getDeveloperOfflineProductQueue(teamId);
        const first=existing.find(row=>String(row.product?.id)===String(product.id));
        const queue=existing.filter(row=>String(row.product?.id)!==String(product.id));
        queue.push({localId:window.makeSafeId(),product,oldName:first?.oldName||oldName||null});
        try { localStorage.setItem(key,JSON.stringify(queue)); return {data:true,error:null}; }
        catch(error) { return {data:null,error}; }
    };

    window.saveProduct = async function() {
        if (window.__adtProductSaveBusy) return;
        window.__adtProductSaveBusy = true;
        const saveButton = document.getElementById('btnSaveProduct');
        if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'جاري حفظ الصنف...'; }
        try {
        if (!(await window.confirmGhostMutation('إضافة أو تعديل منتج'))) return;
        const offlineDeveloper = !window.getNativeNetworkState() && window.isDeveloperAccount() && !isGhostMode && !!currentTeam;
        if ((!dbClient || !currentTeam) && !offlineDeveloper) {
            window.customAlert('لا يوجد اتصال بالخادم', 'تعذر الحفظ لأن الاتصال بالخادم غير متاح. يمكنك مشاهدة آخر نسخة محفوظة، لكن التعديل يحتاج اتصالاً حتى لا تضيع البيانات.');
            return;
        }
        const teamIdAtStart=String(currentTeam.id);

        const oldProduct = (editingIndex !== null && products[editingIndex]) ? products[editingIndex] : null;
        const name = document.getElementById('pName').value.trim();
        const requestedBuyPrice = parseFloat(document.getElementById('pBuyPrice').value) || 0;
        const buyPrice = window.canEditBuyPrice()
            ? requestedBuyPrice
            : (oldProduct ? Number(oldProduct.buyPrice || 0) : 0);
        const sellPrice = parseFloat(document.getElementById('pSellPrice').value) || 0;
        const packQtyRaw = String(document.getElementById('pPackQty')?.value ?? '').trim();
        const requestedPackQty = Number(packQtyRaw);
        const packQty = window.canEditBuyPrice()
            ? requestedPackQty
            : (oldProduct ? Math.max(1, Number(oldProduct.packQty || 1)) : 1);
        const packName = (document.getElementById('pPackName')?.value || 'صندوق').trim() || 'صندوق';
        const pieceName = (document.getElementById('pPieceName')?.value || 'قطعة').trim() || 'قطعة';
        const supplier = currentSelectedSupplier || '';
        const oldName = (editingIndex !== null && products[editingIndex]) ? String(products[editingIndex].name || '') : '';
        if (editingIndex !== null && products[editingIndex] && !window.canEditSellPrice() && Number(sellPrice)!==Number(products[editingIndex].sellPrice||0)) { window.customAlert('غير مسموح','المدير لم يسمح لك بتغيير سعر البيع.'); return; }

        if (!name) { window.customAlert('بيانات ناقصة', 'يرجى إدخال اسم المنتج.'); return; }
        if (editingIndex === null && !window.canEditBuyPrice()) { window.customAlert('غير مسموح', 'إضافة صنف جديد متاحة لمدير الفريق الرئيسي فقط.'); return; }
        if (editingIndex === null && requestedBuyPrice <= 0) { window.customAlert('بيانات ناقصة', 'يرجى إدخال سعر الشراء والتكلفة.'); document.getElementById('pBuyPrice')?.focus(); return; }
        if (window.canEditBuyPrice() && (!packQtyRaw || !Number.isInteger(requestedPackQty) || requestedPackQty < 1)) { window.customAlert('بيانات ناقصة', 'يرجى إدخال عدد القطع بالصندوق كعدد صحيح أكبر من صفر.'); document.getElementById('pPackQty')?.focus(); return; }
        if (sellPrice <= 0) { window.customAlert('بيانات ناقصة', 'يرجى إدخال سعر البيع للزبون.'); return; }
        if (sellPrice <= buyPrice) { window.customAlert('سعر غير صحيح', 'يجب أن يكون سعر البيع أكبر من سعر الشراء'); document.getElementById('pSellPrice')?.focus(); return; }

        // منع تكرار الاسم الكامل فقط، بما فيه الوزن أو العدد في نهاية الاسم.
        const normalizedInput = window.getProductIdentityKey(name);
        const duplicateProduct = products.find((p, index) => {
            if (editingIndex !== null && index === editingIndex) return false;
            return window.getProductIdentityKey(p?.name) === normalizedInput;
        });

        if (duplicateProduct) {
            window.customAlert('الصنف موجود بالفعل', `الاسم والوزن أو العدد مطابق للصنف المسجل: «${duplicateProduct.name}». يمكنك إضافة نفس الاسم بوزن أو عدد مختلف.`);
            return;
        }

        if (editingIndex !== null) {
            const confirmed = await window.showAppConfirm({
                title: 'تأكيد تعديل المنتج',
                message: `هل أنت متأكد من إجراء هذا التعديل على المنتج «${name}»؟`,
                confirmText: 'نعم، حفظ التعديل',
                cancelText: 'رجوع'
            });
            if (!confirmed) return;
        }

        const buyPriceChanged = !!oldProduct && Number(oldProduct.buyPrice||0)!==Number(buyPrice);
        const sellPriceChanged = !!oldProduct && Number(oldProduct.sellPrice||0)!==Number(sellPrice);
        const priceChanged = buyPriceChanged || sellPriceChanged;
        const editedProductId = oldProduct ? String(oldProduct.id||'') : '';
        if(priceChanged&&editedProductId){try{localStorage.setItem('adt_last_own_price_edit_'+String(currentTeam.id),JSON.stringify({id:editedProductId,at:Date.now()}));}catch(_){}}
        const prodObj = {
            id: (editingIndex !== null && products[editingIndex]?.id)
                ? String(products[editingIndex].id)
                : (window.__adtPendingNewProductId ||= window.makeSafeId()),
            name: name,
            buy_price: buyPrice,
            sell_price: sellPrice,
            supplier_name: supplier,
            team_id: teamIdAtStart,
            updated_at: new Date().toISOString(),
            is_deleted: false,
            pack_qty: packQty,
            pack_name: packName,
            piece_name: pieceName
        };

        // احفظ المنتج على الخادم أولاً. لا نغير أي cache محلي قبل نجاح الحفظ.
        if (offlineDeveloper) {
            const {error}=window.queueDeveloperOfflineProductPayload(prodObj,oldName);
            if(error){window.customAlert('التخزين ممتلئ','لم يتم حفظ تعديل الصنف محلياً.');return;}
        } else if (dbClient && currentTeam) {
            const { data: saveOk, error: productError } = await dbClient.rpc('adt_product_save_v131', {
                p_team_id: teamIdAtStart,
                p_user_id: getDeviceId(),
                p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null),
                p_product: prodObj,
                p_old_name: oldName || null
            });
            if (productError || saveOk !== true) {
                console.error('[Products Sync] Save failed:', productError);
                if (String(productError?.message || '').includes('SELL_PRICE_MUST_BE_GREATER_THAN_BUY_PRICE')) {
                    window.customAlert('سعر غير صحيح', 'يجب أن يكون سعر البيع أكبر من سعر الشراء');
                } else {
                    window.customAlert('تعذر حفظ الصنف', 'لم يتم حفظ الصنف على الخادم. لم يتم تغيير القائمة المحلية حتى لا يحدث اختلاف بين الأجهزة.\n\nالسبب: ' + (productError?.message || 'رفض الخادم العملية'));
                }
                return;
            }
            if ((editingIndex === null || buyPriceChanged) && window.canEditBuyPrice()) {
                const historyProduct = { id: prodObj.id, name: name, supplier_name: supplier };
                const historyOk = await window.recordBuyPriceHistory(historyProduct, oldProduct ? Number(oldProduct.buyPrice || 0) : null, Number(buyPrice || 0));
                if (!historyOk) console.warn('[Buy Price History] product saved but history was not recorded');
            }
            if (priceChanged) {
                const pushResult = await window.triggerPendingPricePush(teamIdAtStart, {
                    actorName: localStorage.getItem('atd_sales_user_name') || window.currentUserName || 'مستخدم',
                    productName: name,
                    oldSellPrice: Number(oldProduct?.sellPrice || 0).toFixed(2),
                    newSellPrice: Number(sellPrice || 0).toFixed(2),
                    changeType: sellPriceChanged ? 'sell_price' : (buyPriceChanged ? 'buy_price' : 'price_change')
                });
                if (!pushResult?.ok) console.warn('[Push] price notification was not dispatched:', pushResult);
            }
        }

        if(!currentTeam||String(currentTeam.id)!==teamIdAtStart){window.showToast('تم حفظ الصنف في المتجر الذي بدأت منه العملية؛ لم نخلط بياناته بالمتجر الحالي');return;}

        // تحديث خريطة المورد بعد نجاح الحفظ فقط.
        if (oldName && oldName !== name) delete productSuppliersMap[oldName];
        if (supplier) productSuppliersMap[name] = supplier;
        else delete productSuppliersMap[name];
        window.saveTeamCache('atd_product_suppliers_map_v17', productSuppliersMap);

        // إزالة النقص تتم داخل نفس RPC على الخادم؛ حدّث النسخة المحلية فقط بعد نجاح الحفظ.
        shortages = shortages.filter(s => s.productName !== name && (!oldName || s.productName !== oldName));
        window.saveTeamCache('atd_sales_shortages_v17', shortages);

        if (editingIndex !== null) {
            products[editingIndex] = {
                id: prodObj.id,
                name: name,
                buyPrice: buyPrice,
                sellPrice: sellPrice,
                supplier: supplier,
                    updatedAt: Date.now(),
                auditQty: products[editingIndex].auditQty || 0,
                packQty, packName, pieceName
            };
            window.showToast(offlineDeveloper ? 'تم حفظ تعديل الصنف محلياً، وسيزامن عند الاتصال' : 'تم تحديث بيانات الصنف بنجاح');
        } else {
            products.unshift({
                id: prodObj.id,
                name: name,
                buyPrice: buyPrice,
                sellPrice: sellPrice,
                supplier: supplier,
                    updatedAt: Date.now(),
                auditQty: 0,
                packQty, packName, pieceName
            });
            window.showToast(offlineDeveloper ? 'تم حفظ الصنف محلياً، وسيزامن عند الاتصال' : 'تمت إضافة الصنف للقائمة');
        }

        window.__adtPendingNewProductId = null;
        await window.writeProductsCache(products, teamIdAtStart);
        window.closeModal('productModal');
        window.renderProducts();
        window.renderHomeStats();
        if (document.getElementById('manageProductsModal')?.style.display === 'flex') window.renderManageProducts();
        window.broadcastTeamStateChanged?.('product_changed');
        } finally {
            window.__adtProductSaveBusy = false;
            if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'حفظ الصنف'; }
        }
    };

    window.promptDeleteProduct = function(idx) {
        if (!window.canEditBuyPrice()) {
            window.customAlert('غير مسموح', 'حذف الأصناف متاح لمدير الفريق الرئيسي فقط.');
            return;
        }
        if (productDeleteInProgress) return;
        const p = products[idx];
        if (!p || !p.id) { window.customAlert('تعذر التحديد', 'يرجى تحديث قائمة المنتجات أولاً.'); return; }
        pendingDeleteIndex = idx;
        pendingDeleteProductId = String(p.id);
        const siblings = products.filter(x => window.normalizeArabic(x.name) === window.normalizeArabic(p.name));
        const shortId = String(p.id).slice(-8);
        document.getElementById('deleteConfirmPromptText').innerText = `هل تريد حذف «${p.name}» (معرف ${shortId})؟\n${siblings.length > 1 ? `يوجد ${siblings.length} أصناف بهذا الاسم. ` : ''}تأكد أن هذه هي النسخة الزائدة. لا يتم حذف أي نسخة أخرى.`;
        window.openModalFront('deleteConfirmModal', 9900);
    };

    window.executeConfirmedDelete = async function() {
        if (productDeleteInProgress || !window.canEditBuyPrice() || !pendingDeleteProductId) return;
        productDeleteInProgress = true;
        const deleteButton = document.getElementById('btnConfirmDeleteAction');
        if (deleteButton) { deleteButton.disabled = true; deleteButton.textContent = 'جاري الحذف...'; }
        const productId = pendingDeleteProductId;
        const teamId = String(currentTeam?.id || '');
        try {
            if (!(await window.confirmGhostMutation('حذف منتج'))) return;
            if (!currentTeam || (!dbClient && !window.isDeveloperOffline())) {
                window.customAlert('لا يوجد اتصال بالخادم', 'الحذف يحتاج اتصالاً حتى لا تختلف بيانات الأجهزة.');
                return;
            }
            const selected = products.find(x => String(x.id) === productId);
            if (!selected || String(currentTeam.id) !== teamId) {
                window.customAlert('تغيرت القائمة', 'الصنف المحدد لم يعد موجودًا أو تغير المتجر. افتح الإدارة وحدده من جديد.');
                return;
            }
            const { data: deleteOk, error: deleteError } = await window.developerOfflineRpc('adt_product_delete', {
                p_team_id: teamId, p_user_id: getDeviceId(), p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null), p_product_id: productId
            });
            if (deleteError || deleteOk !== true) {
                console.error('[Products Sync] Delete failed:', deleteError);
                window.customAlert('تعذر حذف الصنف', 'لم يتم الحذف من الخادم، لذلك أبقينا الصنف في القائمة.\n\nالسبب: ' + (deleteError?.message || 'خطأ غير معروف'));
                return;
            }
            if (String(currentTeam?.id || '') === teamId) {
                const row = products.findIndex(x => String(x.id) === productId);
                if (row !== -1) products.splice(row, 1);
                await window.writeProductsCache(products, currentTeam.id);
            }
            window.closeModal('deleteConfirmModal');
            window.showToast('تم حذف الصنف المحدد بنجاح');
            pendingDeleteIndex = null;
            pendingDeleteProductId = null;
            window.renderProducts();
            window.renderHomeStats();
            window.renderManageProducts?.();
            window.broadcastTeamStateChanged?.('product_changed');
        } finally {
            productDeleteInProgress = false;
            if (deleteButton) { deleteButton.disabled = false; deleteButton.textContent = 'تأكيد الحذف'; }
        }
    };

    // نافذة الإدارة تعرض كل نسخة بمعرفها، وتتيح حذف نسخة واحدة فقط بعد التأكيد.
    window.openManageProductsModal = async function() {
        if (!window.canEditBuyPrice()) { window.customAlert('غير مسموح', 'إدارة وحذف المنتجات متاحة للمدير الرئيسي فقط.'); return; }
        document.getElementById('manageProductsSearch').value = '';
        document.getElementById('manageProductsDuplicatesOnly').checked = false;
        window.openModalFront('manageProductsModal', 8500);
        window.renderManageProducts();
        // التحديث من الخادم قبل الاختيار يقلل فرص الاعتماد على قائمة قديمة.
        if (dbClient && currentTeam && window.getNativeNetworkState()) {
            try { await window.fetchProductsFromSupabase(); }
            catch (error) { console.warn('[Product management] sync failed:', error); }
            if (document.getElementById('manageProductsModal')?.style.display === 'flex') window.renderManageProducts();
        }
    };
    window.renderManageProducts = function() {
        const list=document.getElementById('manageProductsList');
        const count=document.getElementById('manageProductsCount');
        if(!list||!count||!window.canEditBuyPrice())return;
        const query=window.normalizeArabic(document.getElementById('manageProductsSearch')?.value||'');
        const onlyDuplicates=!!document.getElementById('manageProductsDuplicatesOnly')?.checked;
        const counts=new Map();products.forEach(p=>{const k=window.getProductIdentityKey(p.name||'');counts.set(k,(counts.get(k)||0)+1);});
        const groups=[...counts.values()].filter(n=>n>1).length;
        const matches=products.map((p,index)=>({p,index,n:counts.get(window.getProductIdentityKey(p.name||''))||1}))
          .filter(({p,n})=>(!onlyDuplicates||n>1)&&(window.normalizeArabic(p.name||'').includes(query)||window.normalizeArabic(String(p.id||'')).includes(query)));
        count.textContent=`${products.length} صنف · ${groups} مجموعة مكررة · المعروض ${matches.length}`;
        if(!matches.length){list.innerHTML='<div class="adt-manage-products-empty">لا توجد أصناف مطابقة للبحث.</div>';return;}
        list.innerHTML=matches.map(({p,index,n})=>{
          const safe=window.escapeHtml,name=safe(p.name||'صنف بدون اسم'),id=safe(String(p.id||''));
          const supplier=safe(p.supplier||'بدون مورد'),price=window.formatMoney(Number(p.sellPrice||0));
          const packQty=Math.max(1,Number(p.packQty||1));
          return `<div class="adt-manage-product-card" data-product-id="${id}">
            <div class="adt-manage-product-card-head"><div class="adt-manage-product-name">${name}</div>${n>1?`<span class="adt-manage-product-duplicate">مكرر · ${n} نسخ</span>`:''}</div>
            <div class="adt-manage-product-details"><div class="adt-manage-product-detail highlight"><span>سعر البيع</span><strong>${price}</strong></div><div class="adt-manage-product-detail"><span>عدد القطع بالصندوق</span><strong>${packQty}</strong></div><div class="adt-manage-product-detail" style="grid-column:1/-1"><span>المورد</span><strong>${supplier}</strong></div></div>
            <div class="adt-manage-product-id">معرّف هذه النسخة: <strong dir="ltr">${id}</strong></div>
            <div class="adt-manage-product-actions"><button type="button" class="btn-secondary" data-action="edit" data-index="${index}">تعديل الصنف</button><button type="button" class="btn-danger adt-manage-delete" data-action="delete" data-index="${index}">حذف هذه النسخة</button></div>
          </div>`;
        }).join('');
    };
    document.getElementById('manageProductsList')?.addEventListener('click',function(event){
        const button=event.target.closest('button[data-action]');
        if (!button || !window.canEditBuyPrice()) return;
        const index=Number(button.dataset.index);
        const row=button.closest('[data-product-id]');
        if (!Number.isSafeInteger(index) || String(products[index]?.id)!==String(row?.dataset.productId)) {
            window.customAlert('تغيرت القائمة', 'حدّث القائمة واختر الصنف من جديد.');
            window.renderManageProducts();return;
        }
        if (button.dataset.action==='delete') window.promptDeleteProduct(index);
        if (button.dataset.action==='edit') window.openEditProductModal(index);
    });

    // عرض آمن لبيانات الصنف للعضو بدون منحه صلاحية تعديل.
    window.openProductViewModal = function(index) {
        const product = products[index];
        if (!product) return;
        window.__adtProductViewIndex = index;
        const historyBtn=document.getElementById('productViewBuyHistoryBtn'); if(historyBtn)historyBtn.style.display=window.canEditBuyPrice()?'block':'none';
        const packQty = Math.max(1, Number(product.packQty || product.pack_qty || 1));
        const sellPrice = Number(product.sellPrice || product.sell_price || 0);
        const buyPrice = Number(product.buyPrice || product.buy_price || 0);
        const setText = (id, value) => { const el=document.getElementById(id); if (el) el.textContent=value; };
        setText('productViewName', product.name || 'صنف');
        setText('productViewSellPrice', window.formatMoney(sellPrice));
        setText('productViewBuyPrice', window.formatMoney(buyPrice));
        setText('productViewPackQty', String(packQty));
        setText('productViewPiecePrice', window.formatMoney(sellPrice / packQty));
        const costCell = document.getElementById('productViewBuyPriceCell');
        if (costCell) costCell.style.display = window.canViewCost() ? 'flex' : 'none';
        const supplier = document.getElementById('productViewSupplier');
        if (supplier) supplier.textContent = `المورد: ${String(product.supplier || product.supplier_name || 'بدون مورد')}`;
        window.openModalFront('productViewModal', 15000);
    };

    // بحث المنتجات: فلترة البطاقات داخل القائمة نفسها لكل الأدوار بدون واجهة نتائج منفصلة.
    window.handleProductSearchInput = function() {
        const dropdown = document.getElementById('productSearchResultsDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
        }
        window.renderProducts();
    };

    window.selectProductForEdit = async function(idx) {
        const dropdown = document.getElementById('productSearchResultsDropdown');
        if (dropdown) dropdown.style.display = 'none';
        const opened = await window.openEditProductModal(idx);
        if (!opened) window.handleProductSearchInput();
    };

    const PRODUCT_RENDER_BATCH = 120;
    const PRODUCT_SEARCH_CACHE = new WeakMap();
    window.__adtProductRenderLimit = PRODUCT_RENDER_BATCH;
    window.__adtProductRenderQuery = '';
    window.__adtProductRenderTeamKey = '';
    window.getProductSearchValue = function(product) {
        const source = String(product?.name || '');
        if (!product || typeof product !== 'object') return window.normalizeArabic(source);
        const cached = PRODUCT_SEARCH_CACHE.get(product);
        if (cached?.source === source) return cached.value;
        const value = window.normalizeArabic(source);
        PRODUCT_SEARCH_CACHE.set(product, { source, value });
        return value;
    };
    window.loadMoreProducts = function() {
        window.__adtProductRenderLimit += PRODUCT_RENDER_BATCH;
        window.renderProducts();
    };

    window.renderProducts = function() {
        const container = document.getElementById('productsList'); if (!container) return;
        const search = window.normalizeArabic(document.getElementById('searchBox')?.value || '');
        container.style.display = '';
        const teamKey = String(currentTeam?.id || 'local');
        if (window.__adtProductRenderQuery !== search || window.__adtProductRenderTeamKey !== teamKey) {
            window.__adtProductRenderQuery = search;
            window.__adtProductRenderTeamKey = teamKey;
            window.__adtProductRenderLimit = PRODUCT_RENDER_BATCH;
        }
        const list = [];
        products.forEach((product, index) => {
            if (window.getProductSearchValue(product).includes(search)) list.push({ product, index });
        });
        const count = document.getElementById('prodStatCount'); if (count) count.textContent = String(products.length);
        const hub = document.getElementById('hubProdBadge'); if (hub) hub.textContent = `${products.length} صنف مسجل`;
        if (!list.length) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px 8px;font-weight:700">لا توجد أصناف مطابقة للبحث</div>';
            return;
        }
        const canEdit = window.canEditProducts();
        const visible = list.slice(0, window.__adtProductRenderLimit);
        const cards = visible.map(({ product:p, index }) => {
            return `<div class="product-card-classic adt-v12-product adt-v180-product"><div class="prod-info-center">
                <div class="prod-name-title">${window.escapeHtml(p.name)}</div>
                <div class="adt-v180-sell-row"><span>سعر البيع</span><strong>${Number(p.sellPrice || 0).toFixed(2)}</strong></div>
                <div class="adt-v12-meta">${window.escapeHtml(p.supplier || 'بدون مورد')}</div>
            </div><div class="adt-product-actions">
                <button onclick="window.openProductViewModal(${index})" class="adt-product-action-btn" aria-label="عرض الصنف" title="عرض الصنف"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 5c-5 0-9.3 3-11 7 1.7 4 6 7 11 7s9.3-3 11-7c-1.7-4-6-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg></button>
                ${canEdit ? `<button onclick="window.openEditProductModal(${index})" class="adt-product-action-btn" aria-label="تعديل"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>` : ''}
            </div></div>`;
        }).join('');
        const remaining = list.length - visible.length;
        const moreButton = remaining > 0 ? `<button type="button" class="btn-secondary" onclick="window.loadMoreProducts()" style="margin:10px 0 2px;padding:11px;font-weight:900;color:var(--accent-teal);border-color:rgba(0,210,180,.45)">عرض المزيد — متبقي ${remaining} صنف</button>` : '';
        container.innerHTML = cards + moreButton;
    };

    // التعديلات الأخيرة (48 ساعة) تعرض على دفعات حتى تظل سريعة مع القوائم الكبيرة.
    const RECENT_PRODUCTS_RENDER_BATCH = 120;
    window.__adtRecentProductsRenderLimit = RECENT_PRODUCTS_RENDER_BATCH;
    window.__adtRecentProductsTeamKey = '';
    window.loadMoreRecentProducts = function() {
        window.__adtRecentProductsRenderLimit += RECENT_PRODUCTS_RENDER_BATCH;
        window.renderRecentProducts();
    };
    window.renderRecentProducts = function() {
        const container = document.getElementById('recentProductsList'); if (!container) return;
        const teamKey = String(currentTeam?.id || 'local');
        if (window.__adtRecentProductsTeamKey !== teamKey) {
            window.__adtRecentProductsTeamKey = teamKey;
            window.__adtRecentProductsRenderLimit = RECENT_PRODUCTS_RENDER_BATCH;
        }
        const threshold = 48 * 60 * 60 * 1000;
        const recent = products.filter(p => p.priceUpdatedAt && Date.now() - p.priceUpdatedAt <= threshold).sort((a,b) => b.priceUpdatedAt - a.priceUpdatedAt);
        const stat = document.getElementById('recentStatCount'); if (stat) stat.textContent = String(recent.length);
        const hub = document.getElementById('hubRecentBadge'); if (hub) hub.textContent = `${recent.length} أصناف محدثة`;
        if (!recent.length) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:28px 10px;font-weight:700">لا توجد تعديلات أسعار خلال آخر 48 ساعة</div>';
            return;
        }
        const showCost = window.canViewCost();
        const visible = recent.slice(0, window.__adtRecentProductsRenderLimit);
        const cards = visible.map(p => `<div class="recent-card-classic"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="min-width:0;flex:1"><div class="prod-name-title">${window.escapeHtml(p.name)}</div><div style="font-size:9px;color:var(--accent-teal);font-weight:800">${window.timeAgo(p.priceUpdatedAt)}</div></div>
            <div style="display:flex;gap:10px;align-items:center;white-space:nowrap">${showCost ? `<span style="font-size:9px;color:var(--accent-cyan);font-weight:800">شراء ${Number(p.buyPrice || 0).toFixed(2)}</span>` : ''}<span style="font-size:10px;color:var(--primary);font-weight:900">بيع ${Number(p.sellPrice || 0).toFixed(2)}</span></div>
        </div></div>`).join('');
        const remaining = recent.length - visible.length;
        const moreButton = remaining > 0 ? `<button type="button" class="btn-secondary" onclick="window.loadMoreRecentProducts()" style="margin:10px 0 2px;padding:11px;font-weight:900;color:var(--accent-teal);border-color:rgba(0,210,180,.45)">عرض المزيد — متبقي ${remaining} صنف</button>` : '';
        container.innerHTML = cards + moreButton;
    };

    // النواقص وطلبيات الموردين مع المزامنة اللحظية السحابية وقفل الصلاحية
    window.fetchShortagesFromSupabase = async function() {
        if (!window.canManageShortages()) {
            shortages = [];
            window.renderShortagesView();
            return true;
        }
        if (window.hasPendingDeveloperMutations('shortages')) {
            window.renderShortagesView();
            return true;
        }
        if (!dbClient || !currentTeam) {
            try {
                const cached = window.readTeamCache('atd_sales_shortages_v17', [], currentTeam?.id);
                if (Array.isArray(cached)) shortages = cached;
            } catch(e) { console.error('[Shortages Sync] Local cache read failed:', e); }
            window.renderShortagesView();
            return true;
        }
        const teamIdAtStart = currentTeam.id;
        try {
            const { data: sList, error } = await dbClient.rpc('adt_read_shortages', {
                p_team_id: String(teamIdAtStart), p_user_id: getDeviceId(),
                p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null)
            });
            if (error) throw error;
            if(!Array.isArray(sList))throw new Error('INVALID_SHORTAGES_PAYLOAD');
            if (!currentTeam || currentTeam.id !== teamIdAtStart) return;
            const serverShortages = (sList || []).map(s => ({
                id: s.id,
                productName: s.product_name,
                supplierName: s.supplier_name || '',
                createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now()
            }));
            const cachedShortages = window.readTeamCache('atd_sales_shortages_v17', [], teamIdAtStart);
            const merged = new Map();
            (Array.isArray(cachedShortages)?cachedShortages:[]).forEach(x=>{if(x?.productName)merged.set(String(x.productName),x);});
            serverShortages.forEach(x=>{if(x?.productName)merged.set(String(x.productName),x);});
            shortages = Array.from(merged.values()).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
            window.saveTeamCache('atd_sales_shortages_v17', shortages);
            window.renderShortagesView();
            return true;
        } catch(e) {
            console.error('[Shortages Sync] Fetch failed:', e);
            window.renderShortagesView();
            window.interfaceAlert('shortages', 'تعذر مزامنة النواقص', 'احتفظ التطبيق بآخر قائمة موجودة على الجهاز ولم يحذفها.\n\nالسبب: ' + (e?.message || 'خطأ غير معروف'));
            return false;
        }
    };

    window.renderShortagesView = function() {
        window.renderShortageSuppliersBar();
        const container = document.getElementById('shortagesListContainer');
        if (!container) return;
        if (!window.canManageShortages()) {
            container.innerHTML = '';
            return;
        }

        let list = (activeShortageSupplierFilter === 'all')
            ? shortages
            : shortages.filter(s => s.supplierName === activeShortageSupplierFilter);

        const countBadge = document.getElementById('shortagesStatCount');
        if (countBadge) countBadge.innerText = `${list.length} صنف`;

        if (list.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:35px 10px; font-weight:700;">لا توجد أصناف ناقصة مسجلة في هذا التبويب</div>';
            return;
        }

        const canShort = window.canRemoveShortages();

        container.innerHTML = list.map(s => `
            <div class="shortage-item-row">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="prod-box-badge" style="border-color:var(--orange); color:var(--orange);">
                        <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>
                    </div>
                    <div>
                        <b style="color:#FFF; font-size:13px;">${window.escapeHtml(s.productName)}</b>
                        <div style="font-size:10px; color:var(--text-muted);">المورد: <span style="color:var(--accent-teal);">${window.escapeHtml(s.supplierName || 'بدون مورد')}</span></div>
                    </div>
                </div>
                ${canShort ? `
                    <button onclick="window.removeShortageItem(decodeURIComponent('${window.safeUrlArg(s.productName)}'))" style="background:rgba(255,77,77,0.15); border:1px solid var(--red); color:var(--red); border-radius:8px; padding:4px 8px; font-size:11px; font-weight:800; cursor:pointer;">
                        تم التوفير 
                    </button>
                ` : ''}
            </div>
        `).join('');
    };

    window.handleShortageSearchInput = function() {
        if (!window.canManageShortages()) {
            window.customAlert('صلاحية مقفلة', 'ليس لديك صلاحية لتسجيل النواقص. يرجى طلب الإذن من مدير المحل.');
            document.getElementById('shortageQuickSearchInput').value = '';
            return;
        }

        const input = document.getElementById('shortageQuickSearchInput');
        const dropdown = document.getElementById('shortageSearchResultsDropdown');
        if (!input || !dropdown) return;

        const val = window.normalizeArabic(input.value);
        if (!val) { dropdown.style.display = 'none'; return; }

        const matchedProds = products.filter(p => window.getProductSearchValue(p).includes(val)).slice(0, 6);

        if (matchedProds.length === 0) {
            dropdown.innerHTML = '<div class="search-res-item" style="color:var(--text-muted);">لا توجد نتائج مطابقة في أصناف المحل المسجلة</div>';
            dropdown.style.display = 'flex';
            return;
        }

        dropdown.innerHTML = matchedProds.map(p => `
            <div class="search-res-item" onclick="window.addShortageItem(decodeURIComponent('${window.safeUrlArg(p.name)}'))">
                <span>${window.escapeHtml(p.name)} <small style="color:var(--accent-teal);">(المورد: ${window.escapeHtml(p.supplier || 'بدون')})</small></span>
                <button class="btn-primary" style="width:auto; padding:4px 8px; font-size:10px; background:var(--orange); color:#070A12;">+ إضافة للنواقص</button>
            </div>
        `).join('');
        dropdown.style.display = 'flex';
    };

    window.addShortageItem = async function(prodName) {
        if (!(await window.confirmGhostMutation('إضافة صنف إلى النواقص'))) return;
        if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) {
            window.customAlert('لا يوجد اتصال بالخادم', 'تعذر الحفظ لأن الاتصال بالخادم غير متاح. يمكنك مشاهدة آخر نسخة محفوظة، لكن التعديل يحتاج اتصالاً حتى لا تضيع البيانات.');
            return;
        }

        if (!window.canManageShortages()) {
            window.customAlert('صلاحية مقفلة', 'ليس لديك صلاحية لتسجيل النواقص.');
            return;
        }

        document.getElementById('shortageSearchResultsDropdown').style.display = 'none';
        document.getElementById('shortageQuickSearchInput').value = '';

        if (shortages.some(s => s.productName === prodName)) {
            window.showToast('الصنف مسجل بالنواقص مسبقاً');
            return;
        }

        const prod = products.find(p => p.name === prodName);
        const supp = (prod && prod.supplier) || productSuppliersMap[prodName] || '';
        const newShortObj = {
            id: 'short_' + Date.now(),
            productName: prodName,
            supplierName: supp,
            createdAt: Date.now()
        };

        if ((dbClient || window.isDeveloperOffline()) && currentTeam) {
            const { data: savedRow, error } = await window.developerOfflineRpc('adt_shortage_add', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId(), p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null), p_product_name: prodName, p_supplier_name: supp
            });
            if (error || !savedRow) {
                console.error('[Shortages Sync] Insert failed:', error);
                window.customAlert('تعذر إضافة النقص', 'لم يتم حفظ الصنف في النواقص على الخادم، لذلك لم تتغير القائمة المحلية.\n\nالسبب: ' + (error?.message || 'لم يرجع الخادم بيانات الحفظ.'));
                return;
            }
            newShortObj.id = savedRow.id;
        }

        shortages.unshift(newShortObj);
        window.saveTeamCache('atd_sales_shortages_v17', shortages);
        window.showToast('تمت إضافة الصنف إلى النواقص');
        window.renderShortagesView();
    };

    window.removeShortageItem = async function(prodName) {
        if (!(await window.confirmGhostMutation('حذف صنف من النواقص'))) return;
        if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) {
            window.customAlert('لا يوجد اتصال بالخادم', 'تعذر الحفظ لأن الاتصال بالخادم غير متاح. يمكنك مشاهدة آخر نسخة محفوظة، لكن التعديل يحتاج اتصالاً حتى لا تضيع البيانات.');
            return;
        }

        if (!window.canRemoveShortages()) {
            window.customAlert('غير مسموح', 'حذف الأصناف من النواقص متاح للمدير فقط.');
            return;
        }

        if ((dbClient || window.isDeveloperOffline()) && currentTeam) {
            const { data: removeOk, error } = await window.developerOfflineRpc('adt_shortage_remove', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId(), p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null), p_product_name: prodName
            });
            if (error || removeOk !== true) {
                console.error('[Shortages Sync] Delete failed:', error);
                window.customAlert('تعذر حذف النقص', 'لم يتم الحذف من الخادم، لذلك أبقينا الصنف في القائمة.\n\nالسبب: ' + (error.message || 'خطأ غير معروف'));
                return;
            }
        }

        shortages = shortages.filter(s => s.productName !== prodName);
        window.saveTeamCache('atd_sales_shortages_v17', shortages);
        window.showToast('تم حذف الصنف من النواقص');
        window.renderShortagesView();
    };

    window.renderShortageSuppliersBar = function() {
        const bar = document.getElementById('shortageSuppliersBar'); if (!bar) return;
        const label = activeShortageSupplierFilter === 'all' ? 'جميع الموردين' : activeShortageSupplierFilter;
        bar.innerHTML = `<div id="shortageSupplierSelectedBtn" onclick="window.openShortageSupplierPicker()"><span>${window.escapeHtml(label)}</span><svg class="svg-icon" style="width:14px;height:14px" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>${window.canCreateSuppliers() ? '<button class="btn-filter-pill adt-add-supplier" onclick="window.openNewSupplierModal()">إضافة مورد</button>' : ''}`;
    };

    window.openShortageSupplierPicker = function() {
        const list = document.getElementById('shortageSupplierPickerList'); if (!list) return;
        const rows = [{name:'all',label:'جميع الموردين'}].concat(suppliers.map(s => ({name:s.name,label:s.name})));
        list.innerHTML = rows.map(x => `<button class="btn-secondary" style="margin:0;padding:9px 10px;text-align:right;font-size:11px" onclick="window.chooseShortageSupplier('${encodeURIComponent(x.name)}')">${window.escapeHtml(x.label)}</button>`).join('');
        window.openModalFront('shortageSupplierPickerModal', 5100);
    };

    window.chooseShortageSupplier = function(encodedName) {
        window.closeModal('shortageSupplierPickerModal');
        window.filterShortagesBySupplier(decodeURIComponent(encodedName));
    };

    window.filterShortagesBySupplier = function(suppName) {
        activeShortageSupplierFilter = suppName;
        window.renderShortagesView();
    };

    window.openNewSupplierModal = function() {
        if (!window.canCreateSuppliers()) { window.customAlert('غير مسموح','إضافة الموردين متاحة للمدير فقط.'); return; }
        document.getElementById('newSupplierNameInput').value = '';
        document.getElementById('newSupplierPhoneInput').value = '';
        document.getElementById('newSupplierModal').style.display = 'flex';
        setTimeout(() => document.getElementById('newSupplierNameInput')?.focus(), 150);
    };

    window.saveNewSupplierAction = async function() {
        if (!window.canCreateSuppliers()) { window.customAlert('غير مسموح','إضافة الموردين متاحة للمدير فقط.'); return; }
        if (!(await window.confirmGhostMutation('إضافة مورد'))) return;
        const name = document.getElementById('newSupplierNameInput').value.trim();
        const phone = document.getElementById('newSupplierPhoneInput').value.trim();

        if (!name) { window.customAlert('بيانات ناقصة', 'أدخل اسم المورد.'); return; }
        if (suppliers.some(s => s.name === name)) { window.customAlert('تنبيه', 'المورد مسجل مسبقاً.'); return; }

        if(!dbClient||!currentTeam){window.customAlert('الاتصال مطلوب','يلزم الاتصال بالإنترنت لحفظ المورد في حساب المتجر وعدم فقده.');return;}
        const btn=document.querySelector('#newSupplierModal .btn-primary');if(btn)btn.disabled=true;
        try{
            const {data,error}=await dbClient.rpc('adt_supplier_directory_add',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_name:name,p_phone:phone});
            if(error||!data)throw error||new Error('SUPPLIER_SAVE_FAILED');
            suppliers=suppliers.filter(x=>String(x.name||'').trim().toLowerCase()!==name.toLowerCase());
            suppliers.unshift(data);window.saveTeamCache('atd_sales_suppliers_v17',suppliers);
            window.closeModal('newSupplierModal');window.showToast('تم حفظ المورد في حساب المتجر');window.renderShortageSuppliersBar();
        }catch(e){console.error('[Supplier Directory] add failed',e);window.customAlert('تعذر حفظ المورد','شغّل ملف V226_CLOUD_SUPPLIER_DIRECTORY.sql مرة واحدة وتأكد من الاتصال.');}
        finally{if(btn)btn.disabled=false;}
    };

    window.openManageSuppliersModal=function(){
        if(!window.canCreateSuppliers()){window.customAlert('غير مسموح','إدارة الموردين متاحة للمدير فقط.');return;}
        window.renderManageSuppliers();document.getElementById('manageSuppliersModal').style.display='flex';
    };
    window.renderManageSuppliers=function(){
        const box=document.getElementById('manageSuppliersList');if(!box)return;
        box.innerHTML=suppliers.length?suppliers.map((sp,i)=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center;background:#0b1522;border:1px solid #203248;border-radius:10px;padding:9px"><div><b style="font-size:12px">${window.escapeHtml(sp.name)}</b><div style="font-size:9px;color:var(--text-muted)">${window.escapeHtml(sp.phone||'بدون رقم')}</div></div><button class="btn-secondary" style="min-height:32px;padding:5px 9px;font-size:10px" onclick="window.editSupplierName(${i})">تعديل</button><button class="btn-danger" style="min-height:32px;padding:5px 9px;font-size:10px" onclick="window.deleteSupplierName(${i})">حذف</button></div>`).join(''):'<div style="text-align:center;color:var(--text-muted);padding:20px">لا يوجد موردون مضافون.</div>';
    };
    let activeSupplierEditIndex=null;
    window.editSupplierName=function(i){
        const sp=suppliers[i];if(!sp)return;activeSupplierEditIndex=i;
        document.getElementById('editSupplierNameInput').value=sp.name||'';
        document.getElementById('editSupplierPhoneInput').value=sp.phone||'';
        window.openModalFront('editSupplierModal',10060);
        setTimeout(()=>document.getElementById('editSupplierNameInput')?.focus(),120);
    };
    window.saveSupplierEditAction=async function(){
        const i=activeSupplierEditIndex,sp=suppliers[i];if(!sp)return;
        const n=String(document.getElementById('editSupplierNameInput')?.value||'').trim();
        const phone=String(document.getElementById('editSupplierPhoneInput')?.value||'').trim();
        if(!n){window.customAlert('بيانات ناقصة','أدخل اسم المورد.');return;}
        if(suppliers.some((x,idx)=>idx!==i&&String(x.name).trim()===n)){window.customAlert('اسم مكرر','يوجد مورد بهذا الاسم بالفعل.');return;}
        if(!dbClient||!currentTeam){window.customAlert('الاتصال مطلوب','يلزم الاتصال بالإنترنت لحفظ تعديل المورد.');return;}
        const old=sp.name;
        try{
        const {data,error}=await dbClient.rpc('adt_supplier_directory_update',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_supplier_id:String(sp.id),p_name:n,p_phone:phone});
        if(error||!data)throw error||new Error('SUPPLIER_UPDATE_FAILED');
        sp={...sp,...data};suppliers[i]=sp;
        shortages.forEach(x=>{if(x.supplierName===old)x.supplierName=n;});products.forEach(x=>{if(x.supplier===old)x.supplier=n;});
        if(typeof productSuppliersMap==='object'){Object.keys(productSuppliersMap).forEach(k=>{if(productSuppliersMap[k]===old)productSuppliersMap[k]=n;});window.saveTeamCache('atd_product_suppliers_map_v17',productSuppliersMap);}
        window.saveTeamCache('atd_sales_suppliers_v17',suppliers);window.saveTeamCache('atd_sales_shortages_v17',shortages);
        activeSupplierEditIndex=null;window.closeModal('editSupplierModal');window.renderManageSuppliers();window.renderShortageSuppliersBar();window.showToast('تم تعديل المورد');
        }catch(e){console.error('[Supplier Directory] update failed',e);window.customAlert('تعذر التعديل','لم يتم تعديل المورد على الخادم، لذلك احتفظ التطبيق بالبيانات القديمة.');}
    };
    window.deleteSupplierName=async function(i){
        const sp=suppliers[i];if(!sp)return;const ok=await window.showAppConfirm({title:'حذف المورد',message:`هل تريد حذف «${sp.name}» من قائمة الموردين؟`,confirmText:'حذف',cancelText:'إلغاء',danger:true});if(!ok)return;
        if(!dbClient||!currentTeam){window.customAlert('الاتصال مطلوب','يلزم الاتصال بالإنترنت لحذف المورد من جميع الأجهزة.');return;}
        try{const {data,error}=await dbClient.rpc('adt_supplier_directory_delete',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_supplier_id:String(sp.id)});if(error||data!==true)throw error||new Error('SUPPLIER_DELETE_FAILED');suppliers.splice(i,1);window.saveTeamCache('atd_sales_suppliers_v17',suppliers);if(activeShortageSupplierFilter===sp.name)activeShortageSupplierFilter='all';window.renderManageSuppliers();window.renderShortageSuppliersBar();window.showToast('تم حذف المورد من حساب المتجر');}
        catch(e){console.error('[Supplier Directory] delete failed',e);window.customAlert('تعذر الحذف','لم يتم حذف المورد من الخادم، لذلك بقي في القائمة.');}
    };

    window.syncSupplierDirectory=async function(showError=false){
        if(!dbClient||!currentTeam?.id||isGhostMode)return false;
        const teamId=String(currentTeam.id),local=Array.isArray(suppliers)?suppliers.map(x=>({...x})):[];
        try{
            let response=await dbClient.rpc('adt_supplier_directory_fetch',{p_team_id:teamId,p_user_id:getDeviceId()});
            if(response.error)throw response.error;
            if(!Array.isArray(response.data))throw new Error('INVALID_SUPPLIER_PAYLOAD');
            let remote=response.data;
            // ترحيل القائمة القديمة مرة واحدة فقط عندما يكون دليل الخادم جديداً وفارغاً.
            if(!remote.length&&local.length&&window.canCreateSuppliers()){
                for(const item of local){
                    const name=String(item?.name||'').trim();if(!name)continue;
                    const added=await dbClient.rpc('adt_supplier_directory_add',{p_team_id:teamId,p_user_id:getDeviceId(),p_name:name,p_phone:String(item?.phone||'')});
                    if(added.error)throw added.error;
                }
                response=await dbClient.rpc('adt_supplier_directory_fetch',{p_team_id:teamId,p_user_id:getDeviceId()});
                if(response.error||!Array.isArray(response.data))throw response.error||new Error('INVALID_SUPPLIER_PAYLOAD');
                remote=response.data;
            }
            if(!currentTeam||String(currentTeam.id)!==teamId)return false;
            // لا تستبدل كاشاً سليماً بقائمة فارغة إذا لم يكن للمستخدم حق ترحيلها.
            if(remote.length||!local.length){suppliers=remote;window.saveTeamCache('atd_sales_suppliers_v17',suppliers,teamId);}
            window.renderShortageSuppliersBar?.();window.renderManageSuppliers?.();return true;
        }catch(e){console.warn('[Supplier Directory] sync deferred',e);suppliers=local;if(showError)window.interfaceAlert('shortages','تعذر مزامنة الموردين','احتفظ التطبيق بآخر قائمة موجودة ولم يحذفها. تأكد من تشغيل SQL الإصدار V226.');return false;}
    };

    // تصدير PDF النواقص
    window.exportShortagesPDF = async function() {
        if (!window.canManageShortages()) { window.customAlert('صلاحية مقفلة', 'لا تملك صلاحية عرض أو تصدير النواقص.'); return; }
        let list = (activeShortageSupplierFilter === 'all') ? shortages : shortages.filter(s => s.supplierName === activeShortageSupplierFilter);
        if (list.length === 0) { window.customAlert('تنبيه', 'لا توجد بضائع ناقصة لتصديرها.'); return; }

        let store = currentTeam ? currentTeam.name : 'متجرنا';
        let suppTitle = (activeShortageSupplierFilter === 'all') ? 'جميع الموردين' : activeShortageSupplierFilter;
        let fileName = `طلبية_نواقص_${suppTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;

        window.showToast('جاري تجهيز تقرير النواقص...');

        const rowHeight = 60;
        const headerHeight = 220;
        const footerHeight = 100;
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = headerHeight + (list.length * rowHeight) + footerHeight;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.direction = 'rtl';
        ctx.textAlign = 'center';

        ctx.fillStyle = '#070A12';
        ctx.font = 'bold 36px Cairo, sans-serif';
        ctx.fillText(store, 600, 60);

        ctx.fillStyle = '#333333';
        ctx.font = 'bold 24px Cairo, sans-serif';
        ctx.fillText('طلبية بضائع ناقصة - المورد: ' + suppTitle, 600, 110);

        ctx.fillStyle = '#666666';
        ctx.font = '18px Cairo, sans-serif';
        ctx.fillText('تاريخ التصدير: ' + new Date().toLocaleDateString('ar-EG'), 600, 150);

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(80, 175);
        ctx.lineTo(1120, 175);
        ctx.stroke();

        const tableTop = 195;
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(80, tableTop, 1040, 50);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(80, tableTop, 1040, 50);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 22px Cairo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('#', 1085, tableTop + 33);
        ctx.textAlign = 'right';
        ctx.fillText('اسم الصنف المطلوب', 1000, tableTop + 33);
        ctx.fillText('المورد المسجل', 400, tableTop + 33);

        ctx.beginPath();
        ctx.moveTo(1050, tableTop); ctx.lineTo(1050, tableTop + 50);
        ctx.moveTo(450, tableTop); ctx.lineTo(450, tableTop + 50);
        ctx.stroke();

        let curY = tableTop + 50;
        list.forEach((s, idx) => {
            if (idx % 2 === 1) {
                ctx.fillStyle = '#f9f9f9';
                ctx.fillRect(80, curY, 1040, rowHeight);
            }
            ctx.strokeStyle = '#000000';
            ctx.strokeRect(80, curY, 1040, rowHeight);

            ctx.beginPath();
            ctx.moveTo(1050, curY); ctx.lineTo(1050, curY + rowHeight);
            ctx.moveTo(450, curY); ctx.lineTo(450, curY + rowHeight);
            ctx.stroke();

            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.font = 'bold 20px Cairo, sans-serif';
            ctx.fillText(String(idx + 1), 1085, curY + 38);

            ctx.textAlign = 'right';
            ctx.font = 'bold 22px Cairo, sans-serif';
            ctx.fillText(s.productName || '', 1000, curY + 38);

            ctx.font = '20px Cairo, sans-serif';
            ctx.fillStyle = '#444444';
            ctx.fillText(s.supplierName || 'بدون مورد', 400, curY + 38);

            curY += rowHeight;
        });

        ctx.fillStyle = '#666666';
        ctx.font = '18px Cairo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('تم استخراج هذا التقرير عبر منظومة ADT Stock', 600, curY + 50);

        await renderCanvasToPdfAndShare(canvas, fileName);
    };

    // إرسال طلبية النواقص عبر واتساب بالصيغة المخصصة المطلوبة
    window.sendShortagesViaWhatsApp = function() {
        if (!window.canManageShortages()) { window.customAlert('صلاحية مقفلة', 'لا تملك صلاحية عرض أو إرسال النواقص.'); return; }
        let suppObj = suppliers.find(s => s.name === activeShortageSupplierFilter);
        let phone = suppObj ? suppObj.phone : '';
        let list = (activeShortageSupplierFilter === 'all') ? shortages : shortages.filter(s => s.supplierName === activeShortageSupplierFilter);

        if (list.length === 0) { window.customAlert('تنبيه', 'لا توجد أصناف ناقصة لإرسالها.'); return; }

        let store = currentTeam ? currentTeam.name : 'متجرنا';
        let suppNameDisplay = (activeShortageSupplierFilter !== 'all') ? activeShortageSupplierFilter : (list[0]?.supplierName || 'المورد المحترم');
        let lines = list.map((s, i) => `${i+1}. ${s.productName}`);
        
        let msg = `نواقص لدي (${store}):\nبرجاء توفيرها من (${suppNameDisplay}):\n--------------------\n${lines.join('\n')}\n--------------------\nيرجى التجهيز شاكرين حسن تعاونكم!`;

        let cleanPhone = (phone || '').replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '218' + cleanPhone.substring(1);

        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };
    // الجرد: وضعان مستقلان داخل نفس محرك البيانات.
    window.auditMode='wholesale';
    window.__adtCriticalMemoryState = window.__adtCriticalMemoryState || {};
    // الجرد لا يُحفظ محلياً نهائياً. المصدر الوحيد الدائم للجرد هو Cloud State؛
    // الذاكرة الحالية داخل الجلسة تُستخدم فقط لتشغيل الواجهة قبل/أثناء المزامنة.
    window.__adtDisableAuditLocalPersistence=true;
    window.isAuditLocalStateKey=function(stateKey,localKey){
        const s=String(stateKey||''), k=String(localKey||'');
        return /audit/i.test(s)||/audit/i.test(k)||s==='grocery_audit_v249'||s==='wholesale_unit_audit_v264'||s==='retail_audit'||s==='sale_audit'||s==='audit_history'||s==='audit_only_prices'||s==='last_wholesale_audit'||s==='last_retail_audit';
    };
    window.writeCriticalLocalState=function(stateKey,localKey,value){
        const payload=JSON.stringify(value);
        let previous;
        try{const raw=window.__adtCriticalMemoryState?.[localKey];if(raw!==null&&raw!==undefined)previous=JSON.parse(raw);}catch(_){previous=undefined;}
        if(previous!==undefined&&JSON.stringify(previous)!==payload)window.backupCriticalState?.(stateKey,previous,'before-memory-write');
        window.__adtCriticalMemoryState[localKey]=payload;
        // ممنوع localStorage للجرد: لا نكتب ولا نقرأ منه، ولا ننشئ نسخة محلية احتياطية.
        window.saveCriticalCloudState?.(stateKey,value);
        return true;
    };
    window.readCriticalLocalState=function(localKey,fallback){try{const emergency=window.__adtCriticalMemoryState?.[localKey];if(emergency!==undefined)return JSON.parse(emergency);return fallback;}catch(_){return fallback;}};
    window.retailAuditState={};
    window.auditOnlyPrices={};
    window.pendingAuditOnlyPrice=null;
    window.auditAddMode=false;
    window.getRetailAuditKey=function(){ return 'adt_retail_audit_'+String(currentTeam?.id||'local'); };
    window.getAuditPriceKey=function(){return 'adt_audit_only_prices_'+String(currentTeam?.id||'local');};
    window.loadAuditOnlyPrices=function(){const saved=window.readCriticalLocalState(window.getAuditPriceKey(),{});window.auditOnlyPrices=(saved&&typeof saved==='object'&&!Array.isArray(saved))?saved:{};return window.auditOnlyPrices;};
    window.saveAuditOnlyPrices=function(){window.writeCriticalLocalState('audit_only_prices',window.getAuditPriceKey(),window.auditOnlyPrices||{});};
    window.getAuditBasePrice=function(p){
        return window.auditMode==='retail'?(Number(p?.buyPrice||0)/Math.max(1,Number(p?.packQty||1))):Number(p?.buyPrice||0);
    };
    window.getAuditOnlyPrice=function(p){
        const key=(window.auditMode==='retail'?'retail:':'wholesale:')+String(p?.id);
        const saved=Number((window.auditOnlyPrices||{})[key]);
        if(Number.isFinite(saved)&&saved>=0)return saved;
        return window.getAuditBasePrice(p);
    };
    window.commitAuditOnlyPrice=function(p){
        const key=(window.auditMode==='retail'?'retail:':'wholesale:')+String(p?.id);
        const base=window.getAuditBasePrice(p);
        const chosen=Number.isFinite(window.pendingAuditOnlyPrice)?Number(window.pendingAuditOnlyPrice):base;
        if(Math.abs(chosen-base)<0.000001)delete window.auditOnlyPrices[key];else window.auditOnlyPrices[key]=chosen;
        window.saveAuditOnlyPrices();
        return chosen;
    };
    window.clearAuditOnlyPrice=function(p,mode=window.auditMode){
        const key=(mode==='retail'?'retail:':'wholesale:')+String(p?.id);
        if(Object.prototype.hasOwnProperty.call(window.auditOnlyPrices||{},key)){
            delete window.auditOnlyPrices[key];window.saveAuditOnlyPrices();
        }
    };
    window.clearAuditOnlyPricesForMode=function(mode=window.auditMode){
        const prefix=mode==='retail'?'retail:':'wholesale:';
        Object.keys(window.auditOnlyPrices||{}).forEach(key=>{if(key.startsWith(prefix))delete window.auditOnlyPrices[key];});
        window.saveAuditOnlyPrices();
    };
    window.loadRetailAudit=function(){
        let saved=window.readCriticalLocalState(window.getRetailAuditKey(),{});if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
        window.retailAuditState={};
        Object.keys(saved).forEach(id=>{ const q=Number(saved[id]||0); if(q>0) window.retailAuditState[String(id)]=q; });
        products.forEach(p=>p.retailAuditQty=Number(window.retailAuditState[String(p.id)]||0));
        return window.retailAuditState;
    };
    window.saveRetailAudit=function(){
        window.writeCriticalLocalState('retail_audit',window.getRetailAuditKey(),window.retailAuditState||{});
        products.forEach(p=>p.retailAuditQty=Number((window.retailAuditState||{})[String(p.id)]||0));
    };
    window.getRetailAuditQty=function(product){ return Number((window.retailAuditState||{})[String(product?.id)]||0); };
    window.getAuditModeTitle=function(){return window.auditMode==='retail'?'واجهة جرد القطاعي':'واجهة جـرد مـحلـک';};
    // كل واجهة جرد تبدأ ببحث نظيف حتى لا ينتقل بحث واجهة إلى الأخرى.
    window.clearAuditSearch=function(){
        const input=document.getElementById('searchAuditBox');
        const dropdown=document.getElementById('auditSearchResultsDropdown');
        if(input) input.value='';
        if(dropdown){
            dropdown.innerHTML='';
            dropdown.style.display='none';
        }
    };
    window.setAuditMode=function(mode){
        window.clearAuditSearch();
        window.auditMode=mode==='retail'?'retail':'wholesale';
        window.loadAuditOnlyPrices();
        if(window.auditMode==='retail') window.loadRetailAudit();
        const modeTitle=window.getAuditModeTitle();
        const title=document.getElementById('auditScreenTitle');
        if(title) title.textContent=modeTitle;
        const pageTitle=document.getElementById('currentPageTitleBar');
        if(currentTab==='audit'&&pageTitle)pageTitle.textContent=modeTitle;
        const prev=document.getElementById('previousAuditBtn');
        if(prev) prev.style.display=window.auditMode==='retail'?'none':'';
        const input=document.getElementById('searchAuditBox');
        if(input) input.placeholder=window.auditMode==='retail'?'ابحث عن صنف لإدخال عدد القطع...':'ابحث عن صنف لإدخال كمية جرده...';
        if(currentTab==='audit')window.renderAudit();
    };
    window.prepareAuditProductsFast=function(kind='audit'){
        const teamId=String(currentTeam?.id||'');
        if(!teamId)return;
        const render=()=>{
            if(kind==='groceryAudit')window.renderGroceryAudit?.();
            else window.renderAudit?.();
        };
        // اعرض النسخة الموجودة على الجهاز فوراً، ولا تجعل فتح الجرد ينتظر الشبكة.
        try{
            const cachedPromise=window.readProductsCache?.(teamId);
            if(cachedPromise&&typeof cachedPromise.then==='function'){
                cachedPromise.then(cached=>{
                    if(!currentTeam||String(currentTeam.id)!==teamId||!Array.isArray(cached)||!cached.length)return;
                    if(!Array.isArray(products)||products.length===0){products=cached;window.loadAuditOnlyPrices?.();window.loadRetailAudit?.();window.loadGroceryAudit?.();render();}
                }).catch(()=>{});
            }
        }catch(_){}
        // المزامنة الحقيقية تعمل في الخلفية؛ ظهور الجرد لا ينتظرها.
        try{
            const sync=window.fetchProductsIfDue?.(false);
            if(sync&&typeof sync.then==='function')sync.then(()=>{
                if(!currentTeam||String(currentTeam.id)!==teamId)return;
                window.loadAuditOnlyPrices?.();window.loadRetailAudit?.();window.loadGroceryAudit?.();render();
            }).catch(()=>{});
        }catch(_){}
    };
    // فتح الجرد فوري مثل المنتجات: لا ينتظر الشبكة ولا RPC. التحقق والمزامنة في الخلفية.
    window.ensureAuditAccessReady=async function(kind='wholesale'){
        const allowed=()=>kind==='selling'?window.isDeveloperGroceryAuditAllowed?.()===true:window.canAudit?.()===true;
        if(allowed())return true;
        if(isGhostMode||!currentTeam?.id||navigator.onLine===false||!dbClient)return false;
        try{ await window.refreshMemberContextFromServer?.(); }catch(_){}
        return allowed();
    };
    window.openWholesaleAudit=function(){
        window.setAuditMode('wholesale');
        window.switchTab('audit',true,true);
        window.prepareAuditProductsFast?.('audit');
        setTimeout(()=>window.ensureAuditAccessReady('wholesale').then(ok=>{
            if(!ok&&currentTab==='audit')window.switchTab('home',false);
        }).catch(()=>{}),0);
    };
    window.openRetailAudit=function(){
        window.setAuditMode('retail');
        window.switchTab('audit',true,true);
        window.prepareAuditProductsFast?.('audit');
        setTimeout(()=>window.ensureAuditAccessReady('wholesale').then(ok=>{
            if(!ok&&currentTab==='audit')window.switchTab('home',false);
        }).catch(()=>{}),0);
    };
    window.openAuditTypePicker=function(){
        if(!window.isFeatureEnabled('audit')){window.promptFeatureLocked('جـرد مـحلـک');return;}
        if(!window.canAudit()){window.customAlert('صلاحية مقفلة','واجهة الجرد متاحة للمدير أو للعضو المسموح له فقط.');return;}
        window.openModalFront('auditTypePickerModal',19000);
    };
    window.chooseAuditType=function(type){
        window.closeModal('auditTypePickerModal');
        if(type==='retail')window.openRetailAudit();else window.openWholesaleAudit();
    };

    window.renderAudit=function(){
        const container=document.getElementById('auditList'); if(!container)return;
        if(!window.canAudit()){container.innerHTML='';return;}
        const retail=window.auditMode==='retail';
        const qtyOf=p=>Number(retail?window.getRetailAuditQty(p):p.auditQty||0);
        const priceOf=p=>window.getAuditOnlyPrice(p);
        const audited=products.filter(p=>qtyOf(p)>0);
        const sum=audited.reduce((a,p)=>a+qtyOf(p)*priceOf(p),0);
        const statSum=document.getElementById('auditStatSum');
        const statCount=document.getElementById('auditStatCountSub');
        const hub=document.getElementById('hubAuditBadge');
        const valueTitle=document.getElementById('auditValueTitle');
        if(valueTitle)valueTitle.textContent=retail?'قيمة جرد القطاعي (سعر القطعة)':'قيمة الجرد (سعر الشراء)';
        if(statSum)statSum.textContent=sum.toFixed(2);
        if(statCount)statCount.textContent=`عدد الأصناف المجرودة: ${audited.length} صنف`;
        if(hub){const wholesaleCount=products.filter(p=>Number(p.auditQty||0)>0).length;const retailCount=products.filter(p=>Number(window.getRetailAuditQty(p)||0)>0).length;hub.textContent=`${wholesaleCount} جملة • ${retailCount} قطاعي`;}
        if(!audited.length){
            container.innerHTML=`<div style="text-align:center;color:var(--text-muted);padding:35px 10px;font-weight:700">لم يتم جرد أي صنف بعد.<br>استخدم البحث لإدخال ${retail?'عدد القطع':'الكمية'}.</div>`;
            return;
        }
        container.innerHTML=audited.map(p=>{
            const q=qtyOf(p),price=priceOf(p),total=q*price;
            return `<div class="audit-display-card">
                <div class="audit-prod-main"><div class="prod-name-title">${window.escapeHtml(p.name)}</div><div class="audit-buy-inline"><span>${retail?'سعر القطعة':'سعر الشراء'}</span> <strong>${price.toFixed(2)}</strong></div></div>
                <div class="audit-qty-col"><span>${retail?'العدد':'الكمية'}</span><strong>${q}</strong></div>
                <div class="audit-total-col"><span>إجمالي السعر</span><strong>${total.toFixed(2)}</strong></div>
                <button type="button" class="audit-delete-btn" onclick="event.preventDefault();event.stopPropagation();window.removeAuditItemFromAudit(${products.indexOf(p)});return false;" title="حذف من الجرد"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 7h12l-1 14H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2zm1 6v9h2V9h-2zm4 0v9h2V9h-2z"/></svg><span>حذف</span></button>
            </div>`;
        }).join('');
    };

    window.handleAuditSearchInput=function(){
        if(!window.canAudit()){
            window.customAlert('صلاحية مقفلة','ليس لديك صلاحية لإجراء الجرد.');
            const x=document.getElementById('searchAuditBox');if(x)x.value='';
            return;
        }
        const input=document.getElementById('searchAuditBox'),dropdown=document.getElementById('auditSearchResultsDropdown');
        if(!input||!dropdown)return;
        const val=window.normalizeArabic(input.value);
        if(!val){dropdown.style.display='none';return;}
        const retail=window.auditMode==='retail';
        const matched=products.filter(p=>window.getProductSearchValue(p).includes(val)).slice(0,6);
        dropdown.innerHTML=matched.length?matched.map(p=>{
            const idx=products.indexOf(p);
            const price=window.getAuditBasePrice(p);
            return `<div class="search-res-item audit-search-passive"><span>${window.escapeHtml(p.name)} <small style="color:var(--accent-teal)">(${retail?'سعر القطعة':'سعر الشراء'}: ${price.toFixed(2)})</small></span><button type="button" class="btn-primary" onclick="event.preventDefault();event.stopPropagation();window.selectProductForAudit(${idx});return false;" style="width:auto;padding:4px 8px;font-size:10px">إدخال الجرد</button></div>`;
        }).join(''):'<div class="search-res-item" style="color:var(--text-muted)">لا توجد نتائج مطابقة</div>';
        dropdown.style.display='flex';
    };
    window.selectProductForAudit=async function(idx){
        const d=document.getElementById('auditSearchResultsDropdown');if(d)d.style.display='none';
        const q=document.getElementById('searchAuditBox');if(q)q.value='';
        const p=products[idx],existing=Number(window.auditMode==='retail'?window.getRetailAuditQty(p):p?.auditQty||0);
        if(existing>0){
            const add=await window.showAppConfirm({title:'المنتج مجرود بالفعل',message:`تم جرد «${p.name}» بعدد ${existing}. هل تريد زيادة عدد جديد عليه؟`,confirmText:'زيادة العدد',cancelText:'إغلاق'});
            if(!add)return;
            window.auditAddMode=true;
        }else window.auditAddMode=false;
        window.openAuditModal(idx);
    };
    window.openAuditModal=function(idx){
        if(!window.canAudit()){window.customAlert('تنبيه','لا تملك صلاحية إدخال كميات الجرد.');return;}
        auditEditingIndex=idx;
        const p=products[idx],retail=window.auditMode==='retail';
        window.pendingAuditOnlyPrice=null;
        const price=window.getAuditBasePrice(p);
        document.getElementById('auditModalProdName').innerText=p.name;
        document.getElementById('auditModalQtyInput').value='';
        document.getElementById('auditModalTitle').innerText=window.auditAddMode?'زيادة عدد جرد المنتج':(retail?'إدخال جرد القطاعي':'إدخال جـرد مـحلـک');
        document.getElementById('auditQtyLabel').innerText=retail?'عدد القطع المجرودة:':'العدد المجرود فعلياً:';
        document.getElementById('auditPriceLabel').innerText=retail?'سعر القطعة':'سعر الشراء';
        document.getElementById('auditModalBuyPriceText').innerText=price.toFixed(2);
        const panel=document.getElementById('auditPriceEditPanel');if(panel)panel.style.display='none';
        window.calcAuditModalTotal();
        window.openModalFront('auditItemModal',4300);
        setTimeout(()=>document.getElementById('auditModalQtyInput')?.focus(),150);
    };
    window.calcAuditModalTotal=function(){
        if(auditEditingIndex===null)return;
        const p=products[auditEditingIndex],q=Number(document.getElementById('auditModalQtyInput')?.value||0);
        const price=Number.isFinite(window.pendingAuditOnlyPrice)?Number(window.pendingAuditOnlyPrice):window.getAuditBasePrice(p);
        document.getElementById('auditModalLineTotal').innerText=(q*price).toFixed(2);
    };
    window.requestAuditPriceEdit=async function(){
        if(auditEditingIndex===null)return;
        const ok=await window.showAppConfirm({title:'تعديل سعر الجرد',message:'هل تريد تعديل سعر هذا المنتج داخل الجرد فقط؟ لن يتغير سعره في قائمة المنتجات.',confirmText:'تعديل السعر',cancelText:'إغلاق'});
        if(!ok)return;
        const p=products[auditEditingIndex],panel=document.getElementById('auditPriceEditPanel'),input=document.getElementById('auditModalPriceInput');
        const shownPrice=Number.isFinite(window.pendingAuditOnlyPrice)?Number(window.pendingAuditOnlyPrice):window.getAuditBasePrice(p);
        if(input)input.value=shownPrice.toFixed(2);
        if(panel)panel.style.display='block';
        setTimeout(()=>input?.focus(),80);
    };
    window.cancelAuditPriceEdit=function(){const panel=document.getElementById('auditPriceEditPanel');if(panel)panel.style.display='none';};
    window.saveAuditOnlyPrice=function(){
        if(auditEditingIndex===null)return;
        const input=document.getElementById('auditModalPriceInput'),price=Number(input?.value);
        if(!Number.isFinite(price)||price<0){input?.focus();return;}
        window.pendingAuditOnlyPrice=price;
        document.getElementById('auditModalBuyPriceText').innerText=price.toFixed(2);
        window.cancelAuditPriceEdit();window.calcAuditModalTotal();window.showToast('سيُستخدم السعر عند حفظ كمية الجرد');
    };
    window.closeAuditItemModal=function(){auditEditingIndex=null;window.auditAddMode=false;window.pendingAuditOnlyPrice=null;window.cancelAuditPriceEdit();window.closeModal('auditItemModal');};
    window.removeAuditItemFromAudit=async function(index){
        if(!window.canAudit()){window.customAlert('غير مسموح','ليس لديك صلاحية تعديل الجرد.');return;}
        const p=products[index];if(!p)return;
        const retail=window.auditMode==='retail';
        const currentQty=Number(retail?window.getRetailAuditQty(p):p.auditQty||0);
        if(currentQty<=0)return;
        const ok=await window.showAppConfirm({
            title:'حذف الصنف من الجرد',
            message:`هل تريد حذف «${p.name}» من الجرد؟ لن يتم حذف الصنف من قائمة المنتجات.`,
            confirmText:'حذف من الجرد',
            cancelText:'إلغاء',
            danger:true
        });
        if(!ok)return;
        if(retail){
            window.retailAuditState[String(p.id)]=0;
            p.retailAuditQty=0;
            window.clearAuditOnlyPrice(p,'retail');
            window.saveRetailAudit();
            window.renderAudit();
            window.showToast('تم حذف الصنف من جرد القطاعي');
            return;
        }
        if(!(await window.confirmGhostMutation('حذف صنف من الجرد')))return;
        if((!dbClient||!currentTeam)&&!window.isDeveloperOffline()){window.customAlert('لا يوجد اتصال بالخادم','تعذر حذف الصنف من الجرد لأن الاتصال بالخادم غير متاح.');return;}
        const previousQty=Number(p.auditQty||0);
        p.auditQty=0;
        window.clearAuditOnlyPrice(p,'wholesale');
        window.renderAudit();
        window.showToast('تم حذف الصنف من الجرد');
        window.queueWholesaleAuditSave(p,previousQty,0);
    };
    // حفظ جرد المخزون الفعلي بشكل سريع: الواجهة تتحدث فوراً، والحفظ بالخادم يتم في الخلفية.
    // يتم تسلسل طلبات الصنف نفسه حتى لا تتعارض الزيادات السريعة مع بعضها.
    window.__adtAuditSaveChains=window.__adtAuditSaveChains||{};
    window.__adtAuditSaveState=window.__adtAuditSaveState||{};
    window.__adtAuditResetEpoch=window.__adtAuditResetEpoch||{};
    window.cancelPendingAuditSaves=function(teamId){const prefix=String(teamId)+':';Object.keys(window.__adtAuditSaveState||{}).forEach(k=>{if(k.startsWith(prefix))window.__adtAuditSaveState[k].version=Number(window.__adtAuditSaveState[k].version||0)+1;});Object.keys(window.__adtAuditSaveChains||{}).forEach(k=>{if(k.startsWith(prefix))delete window.__adtAuditSaveChains[k];});};
    window.queueWholesaleAuditSave=function(product,previousQty,finalQty){
      if(!product||!currentTeam||(!dbClient&&!window.isDeveloperOffline()))return;
      const productId=String(product.id),teamId=String(currentTeam.id),stateKey=teamId+':'+productId,resetEpoch=Number(window.__adtAuditResetEpoch[teamId]||0);
      let state=window.__adtAuditSaveState[stateKey]||{confirmedQty:Number(previousQty||0),version:0};window.__adtAuditSaveState[stateKey]=state;const version=++state.version;
      const run=async()=>{if(Number(window.__adtAuditResetEpoch[teamId]||0)!==resetEpoch)return;try{const {data,error}=await window.developerOfflineRpc('adt_audit_set_qty',{p_team_id:teamId,p_user_id:getDeviceId(),p_dev_pin:(isGhostMode?(developerSessionPin||null):null),p_product_id:productId,p_qty:finalQty});if(error)throw error;if(data===false)throw new Error('رفض الخادم تعديل الجرد');if(Number(window.__adtAuditResetEpoch[teamId]||0)!==resetEpoch||state.version!==version)return;state.confirmedQty=Number(finalQty||0);window.broadcastTeamStateChanged?.('audit_item');}catch(e){console.warn('[Audit] save deferred',e);if(state.version===version&&Number(window.__adtAuditResetEpoch[teamId]||0)===resetEpoch){const live=products.find(x=>String(x.id)===productId);if(live)live.auditQty=Number(state.confirmedQty||0);window.renderAudit();}}};
      const prev=window.__adtAuditSaveChains[stateKey]||Promise.resolve();window.__adtAuditSaveChains[stateKey]=prev.catch(()=>{}).then(run);
    };

    window.confirmAuditItemQty=async function(){
        if(auditEditingIndex===null)return;
        const inp=document.getElementById('auditModalQtyInput'),raw=String(inp?.value??'').trim(),q=Number(raw);
        if(raw===''||!Number.isFinite(q)||q<=0){if(inp){inp.classList.add('adt-invalid-qty');inp.focus();setTimeout(()=>inp.classList.remove('adt-invalid-qty'),650);}return;}
        if(window.auditMode==='retail'){
            const retailProduct=products[auditEditingIndex];
            const finalQty=(window.auditAddMode?window.getRetailAuditQty(retailProduct):0)+q;
            window.commitAuditOnlyPrice(retailProduct);
            window.retailAuditState[String(retailProduct.id)]=finalQty;
            retailProduct.retailAuditQty=finalQty;
            window.saveRetailAudit();
            auditEditingIndex=null;window.auditAddMode=false;window.pendingAuditOnlyPrice=null;window.closeModal('auditItemModal');window.renderAudit();window.showToast('تم حفظ جرد القطاعي');return;
        }
        if(!(await window.confirmGhostMutation('تعديل كمية الجرد')))return;
        if((!dbClient||!currentTeam)&&!window.isDeveloperOffline()){window.customAlert('لا يوجد اتصال بالخادم','تعذر الحفظ لأن الاتصال بالخادم غير متاح.');return;}

        const p=products[auditEditingIndex];
        const previousQty=Number(p.auditQty||0);
        const finalQty=(window.auditAddMode?previousQty:0)+q;
        window.commitAuditOnlyPrice(p);

        // تحديث فوري للمستخدم بدون انتظار الشبكة أو IndexedDB.
        p.auditQty=finalQty;
        auditEditingIndex=null;
        window.auditAddMode=false;
        window.pendingAuditOnlyPrice=null;
        window.closeModal('auditItemModal');
        window.renderAudit();
        window.showToast('تم إدخال الصنف في الجرد');

        // الحفظ الحقيقي يتم في الخلفية، مع حماية من تعارض التعديلات المتتالية للصنف نفسه.
        window.queueWholesaleAuditSave(p,previousQty,finalQty);
    };

    window.getLastAuditSnapshotKey=function(){return 'adt_last_audit_snapshot_'+String(currentTeam?.id||'local');};
    window.saveLastAuditSnapshot=function(){
        const snapshot={createdAt:new Date().toISOString(),items:products.filter(p=>Number(p.auditQty||0)>0).map(p=>({id:String(p.id),name:String(p.name||''),qty:Number(p.auditQty||0),buyPrice:Number(p.buyPrice||0)}))};
        window.writeCriticalLocalState('last_wholesale_audit',window.getLastAuditSnapshotKey(),snapshot);return snapshot;
    };
    window.readLastAuditSnapshot=function(){return window.readCriticalLocalState(window.getLastAuditSnapshotKey(),null);};
    window.openPreviousAuditModal=function(){
        if(!window.canAudit()){window.customAlert('صلاحية مقفلة','لا تملك صلاحية عرض أو تصدير الجرد.');return;}
        const snap=window.readLastAuditSnapshot(),modal=document.getElementById('previousAuditModal'),meta=document.getElementById('previousAuditMeta'),box=document.getElementById('previousAuditItems');
        if(!modal||!meta||!box)return;
        if(!snap?.items?.length){meta.textContent='';box.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:24px 8px">لا يوجد جرد محفوظ قبل التصفير.</div>';}
        else{meta.textContent='تاريخ الحفظ: '+new Date(snap.createdAt).toLocaleString('ar-LY');box.innerHTML=snap.items.map((it,i)=>`<div class="previous-audit-item"><div><div style="font-weight:900;color:#fff">${window.escapeHtml(it.name)}</div></div><input class="input-field" type="number" min="0" step="0.01" value="${Number(it.qty||0)}" onchange="window.updatePreviousAuditQty(${i},this.value)"></div>`).join('');}
        modal.style.display='flex';
    };
    window.updatePreviousAuditQty=function(i,value){const snap=window.readLastAuditSnapshot();if(!snap?.items?.[i])return;snap.items[i].qty=Math.max(0,Number(value||0));window.writeCriticalLocalState(window.auditMode==='retail'?'last_retail_audit':'last_wholesale_audit',window.getLastAuditSnapshotKey(),snap);};
    window.exportPreviousAuditPDF=async function(){
        if(!window.canAudit()){window.customAlert('صلاحية مقفلة','لا تملك صلاحية تصدير الجرد.');return;}
        const snap=window.readLastAuditSnapshot();
        if(!snap?.items?.length){window.customAlert('لا يوجد جرد','لا يوجد جرد سابق محفوظ لتصديره.');return;}
        const retail=snap.mode==='retail';
        const selling=snap.mode==='selling';
        const root=document.createElement('div');
        root.dir='rtl';
        root.style.cssText='background:#fff;color:#111;padding:24px;font-family:Cairo,Arial,sans-serif;width:760px';
        const total=snap.items.reduce((sum,it)=>sum+Number(it.qty||0)*Number(it.buyPrice||0),0);
        const savedUnitName=it=>String(it.unitName||(it.unit==='piece'?'قطعة':it.unit==='pack'?'صندوق':retail?'قطعة':'غير محددة'));
        root.innerHTML=`<h2 style="text-align:center;margin:0 0 8px">${selling?'جرد سريع المحفوظ':retail?'جرد القطاعي المحفوظ':'جـرد مـحلـک المحفوظ'}</h2><p style="text-align:center;color:#555">${new Date(snap.createdAt).toLocaleString('ar-LY-u-nu-latn')}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="border:1px solid #bbb;padding:8px">#</th><th style="border:1px solid #bbb;padding:8px">الصنف</th><th style="border:1px solid #bbb;padding:8px">الكمية</th><th style="border:1px solid #bbb;padding:8px">الوحدة</th><th style="border:1px solid #bbb;padding:8px">السعر</th><th style="border:1px solid #bbb;padding:8px">الإجمالي</th></tr></thead><tbody>${snap.items.map((it,i)=>`<tr><td style="border:1px solid #bbb;padding:8px">${i+1}</td><td style="border:1px solid #bbb;padding:8px">${window.escapeHtml(it.name||'')}</td><td style="border:1px solid #bbb;padding:8px">${Number(it.qty||0)}</td><td style="border:1px solid #bbb;padding:8px">${window.escapeHtml(savedUnitName(it))}</td><td style="border:1px solid #bbb;padding:8px">${window.formatMoney(Number(it.buyPrice||0))}</td><td style="border:1px solid #bbb;padding:8px">${window.formatMoney(Number(it.qty||0)*Number(it.buyPrice||0))}</td></tr>`).join('')}</tbody></table><h3 style="text-align:left">الإجمالي: ${window.formatMoney(total)}</h3>`;
        document.body.appendChild(root);
        try{await html2pdf().set({margin:8,filename:`ADT-${selling?'grocery':retail?'retail':'wholesale'}-saved-audit.pdf`,html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(root).save();}
        catch(error){console.error('[Previous Audit PDF] failed:',error);window.customAlert('تعذر التصدير','حدث خطأ أثناء إنشاء ملف PDF.');}
        finally{root.remove();}
    };
    window.askDeletePreviousAuditSnapshot=async function(){
        const ok=await window.showAppConfirm({title:'حذف الجرد المحفوظ؟',message:'سيتم حذف آخر جرد محفوظ من هذا الجهاز فقط. لا يمكن التراجع بعد الحذف.',confirmText:'حذف',cancelText:'إلغاء',danger:true});
        if(!ok)return;
        delete window.__adtCriticalMemoryState?.[window.getLastAuditSnapshotKey()];
        window.saveCriticalCloudState?.(window.auditMode==='retail'?'last_retail_audit':'last_wholesale_audit',{deleted:true});
        window.closeModal('previousAuditModal');
        window.showToast('تم حذف الجرد المحفوظ');
    };
    window.confirmDeletePreviousAuditSnapshot=function(){
        delete window.__adtCriticalMemoryState?.[window.getLastAuditSnapshotKey()];
        window.saveCriticalCloudState?.(window.auditMode==='retail'?'last_retail_audit':'last_wholesale_audit',{deleted:true});
        window.closeModal('deletePreviousAuditConfirmModal');
        window.closeModal('previousAuditModal');
        window.showToast('تم حذف الجرد المحفوظ');
    };
    window.deletePreviousAuditSnapshot=window.askDeletePreviousAuditSnapshot;
    window.restorePreviousAuditToCurrent=async function(){
        if(!window.canAudit()){window.customAlert('صلاحية مقفلة','لا تملك صلاحية استرجاع الجرد.');return;}
        const snap=window.readLastAuditSnapshot();if(!snap?.items?.length){window.customAlert('تنبيه','لا يوجد جرد سابق محفوظ.');return;}
        if((!dbClient||!currentTeam)&&!window.isDeveloperOffline()){window.customAlert('لا يوجد اتصال بالخادم','استرجاع الجرد يحتاج اتصالاً بالخادم.');return;}
        try{for(const it of snap.items){const {error}=await window.developerOfflineRpc('adt_audit_set_qty',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_dev_pin:(isGhostMode?(developerSessionPin||null):null),p_product_id:String(it.id),p_qty:Number(it.qty||0)});if(error)throw error;const p=products.find(x=>String(x.id)===String(it.id));if(p){p.auditQty=Number(it.qty||0);const base=Number(p.buyPrice||0),saved=Number(it.buyPrice);const key='wholesale:'+String(p.id);if(Number.isFinite(saved)&&Math.abs(saved-base)>=0.000001)window.auditOnlyPrices[key]=saved;else delete window.auditOnlyPrices[key];}}
        window.saveAuditOnlyPrices();
        await window.writeProductsCache(products,currentTeam.id);window.closeModal('previousAuditModal');window.renderAudit();window.showToast('تم استرجاع آخر جرد');}
        catch(e){window.customAlert('تعذر الاسترجاع',e?.message||'حدث خطأ أثناء الاسترجاع.');}
    };
    window.confirmResetAudit=async function(){
        if(!window.canAudit()){window.customAlert('تنبيه','لا تملك صلاحية تصفير الجرد.');return;}
        if(window.auditMode==='retail'){
            const ok=await window.showAppConfirm({title:'تصفير جرد القطاعي',message:'هل تريد تصفير جميع كميات جرد القطاعي؟',confirmText:'تصفير الجرد',cancelText:'إلغاء',danger:true});
            if(!ok)return;window.retailAuditState={};products.forEach(p=>p.retailAuditQty=0);window.retailAuditState={};window.writeCriticalLocalState('retail_audit',window.getRetailAuditKey(),{});window.clearAuditOnlyPricesForMode('retail');window.renderAudit();window.showToast('تم تصفير جرد القطاعي');return;
        }
        if(!(await window.confirmGhostMutation('تصفير جميع كميات الجرد')))return;
        if((!dbClient||!currentTeam)&&!window.isDeveloperOffline()){window.customAlert('لا يوجد اتصال بالخادم','تصفير جـرد مـحلـک يحتاج اتصالاً بالخادم.');return;}
        const ok=await window.showAppConfirm({title:'تصفير الجرد',message:'سيتم حفظ الجرد الحالي كآخر جرد ثم تصفير جميع الكميات.',confirmText:'تصفير الجرد',cancelText:'إلغاء',danger:true});
        if(!ok)return;
        window.saveLastAuditSnapshot();
        try{
            const {data,error}=await window.developerOfflineRpc('adt_audit_reset',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_dev_pin:(isGhostMode?(developerSessionPin||null):null)});
            if(error||data!==true)throw error||new Error('رفض الخادم تصفير الجرد');
            window.markLocalAuditReset?.();
            products.forEach(p=>p.auditQty=0);window.clearAuditOnlyPricesForMode('wholesale');await window.writeProductsCache(products,currentTeam.id);window.renderAudit();window.showToast('تم تصفير الجرد');
        }catch(e){window.customAlert('تعذر تصفير الجرد',e?.message||'لم يتم التصفير على الخادم.');}
    };

    // تصدير PDF الجرد على صفحات A4 فعلية بدل ضغط كل الأصناف داخل ورقة واحدة.
    // ترتيب الأعمدة من اليمين: رقم، اسم المنتج، الكمية المجرودة، سعر الشراء، الإجمالي.
    window.exportAuditPDF = async function() {
        if(!window.canAudit()){
            window.customAlert('صلاحية مقفلة','تصدير الجرد متاح للمدير أو للعضو المسموح له فقط.');
            return;
        }

        const retail = window.auditMode === 'retail';
        const selling = window.auditMode === 'selling';
        const wholesale = !retail && !selling && typeof window.getWholesaleUnitEntry === 'function';
        if (retail) window.loadRetailAudit();
        if (wholesale) window.loadWholesaleUnitAudit();

        const auditedList = wholesale
            ? products.filter(p => window.getWholesaleUnitTotalQty(p) > 0)
            : products.filter(p => window.getCurrentAuditQty(p) > 0);

        if (!auditedList.length) {
            window.customAlert('تنبيه', retail ? 'لا توجد أصناف في جرد القطاعي لتصديرها.' : 'لا توجد أصناف مجرودة لتصديرها.');
            return;
        }

        const store = currentTeam ? currentTeam.name : 'متجرنا';
        const title = selling ? 'كشف جرد سريع' : retail ? 'كشف جرد القطاعي' : 'كشف جـرد مـحلـک';
        const qtyLabel = retail ? 'عدد القطع' : 'العدد';
        const reportDate = new Date().toLocaleDateString('ar-LY');
        const fileName = selling
            ? `كشف_جرد_البقالة_${new Date().toISOString().slice(0,10)}.pdf`
            : retail
            ? `كشف_الجرد_القطاعي_${new Date().toISOString().slice(0,10)}.pdf`
            : `كشف_الجرد_${new Date().toISOString().slice(0,10)}.pdf`;

        // A product audited by the box and by the piece occupies two separate PDF rows.
        // Use each unit's stored price rather than its box-equivalent total quantity.
        const rows = [];
        for (const p of auditedList) {
            if (wholesale) {
                const entry = window.getWholesaleUnitEntry(p);
                for (const unit of ['pack', 'piece']) {
                    const qty = Number(entry[unit] || 0);
                    if (qty <= 0) continue;
                    const price = Number(entry[unit + 'Price'] || 0);
                    rows.push({index: rows.length + 1, productId: String(p.id), name: String(p.name || ''),
                        qty, unitName: String(unit === 'piece' ? (p.pieceName || 'قطعة') : (p.packName || 'صندوق')),
                        price, total: qty * price});
                }
            } else {
                const qty = Number(window.getCurrentAuditQty(p) || 0);
                const price = Number(window.getAuditOnlyPrice(p) || 0);
                const unitName = retail ? (p.pieceName || 'قطعة') : selling
                    ? window.getSaleAuditUnitName(p, window.getSaleAuditUnit(p)) : (p.packName || 'صندوق');
                rows.push({index: rows.length + 1, productId: String(p.id), name: String(p.name || ''),
                    qty, unitName: String(unitName), price, total: qty * price});
            }
        }

        const totalSum = rows.reduce((sum, row) => sum + row.total, 0);
        const productCount = auditedList.length;
        window.showToast('جاري تجهيز كشف الجرد على صفحات A4...');

        // دقة عالية بنسبة A4 portrait تقريباً 210 × 297 مم.
        const PAGE_W = 1200;
        const PAGE_H = 1697;
        const LEFT = 60;
        const RIGHT = 1140;
        const TABLE_W = RIGHT - LEFT;
        const ROW_H = 52;
        const TABLE_HEADER_H = 50;
        const TABLE_TOP = 220;
        const FOOTER_Y = PAGE_H - 45;
        const PAGE_SUMMARY_H = 40;
        const PAGE_SUMMARY_GAP = 36;
        const usableRowsHeight = FOOTER_Y - TABLE_TOP - TABLE_HEADER_H - PAGE_SUMMARY_H - PAGE_SUMMARY_GAP - 20;
        const rowsPerPage = Math.max(1, Math.floor(usableRowsHeight / ROW_H));
        const pageCount = Math.ceil(rows.length / rowsPerPage);
        const pages = [];

        // حدود الأعمدة: # | الصنف | العدد | الوحدة | السعر | الإجمالي (من اليمين).
        const X_RIGHT = RIGHT;
        const X_AFTER_NO = 1070;
        const X_AFTER_NAME = 610;
        const X_AFTER_QTY = 488;
        const X_AFTER_UNIT = 356;
        const X_AFTER_PRICE = 212;
        const X_LEFT = LEFT;

        function fitText(ctx, value, maxWidth) {
            const original = String(value || '');
            if (ctx.measureText(original).width <= maxWidth) return original;
            let text = original;
            while (text.length > 2 && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
            return text + '…';
        }

        function drawPage(pageRows, pageIndex) {
            const pageSum = pageRows.reduce((sum, row) => sum + row.total, 0);
            const canvas = document.createElement('canvas');
            canvas.width = PAGE_W;
            canvas.height = PAGE_H;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, PAGE_W, PAGE_H);
            ctx.direction = 'rtl';

            // رأس التقرير؛ أكبر وأقرب لحواف الصفحة ليستفيد من مساحة الورقة.
            ctx.textAlign = 'center';
            ctx.fillStyle = '#070A12';
            ctx.font = 'bold 34px Cairo, sans-serif';
            ctx.fillText(store, PAGE_W / 2, 54);
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 24px Cairo, sans-serif';
            ctx.fillText(title, PAGE_W / 2, 96);

            ctx.fillStyle = '#00D2B4';
            ctx.fillRect(LEFT, 116, TABLE_W, 44);
            ctx.fillStyle = '#070A12';
            ctx.font = 'bold 20px Cairo, sans-serif';
            ctx.fillText(`إجمالي قيمة الجرد: ${window.formatMoney(totalSum)}   |   عدد الأصناف: ${productCount}`, PAGE_W / 2, 146);

            ctx.fillStyle = '#666666';
            ctx.font = '17px Cairo, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`التاريخ: ${reportDate}`, RIGHT, 192);
            ctx.textAlign = 'left';
            ctx.fillText(`صفحة ${pageIndex + 1} من ${pageCount}`, LEFT, 192);

            // رأس الجدول.
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(LEFT, TABLE_TOP, TABLE_W, TABLE_HEADER_H);
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 1.4;
            ctx.strokeRect(LEFT, TABLE_TOP, TABLE_W, TABLE_HEADER_H);

            const drawVerticals = (top, height) => {
                ctx.beginPath();
                [X_AFTER_NO, X_AFTER_NAME, X_AFTER_QTY, X_AFTER_UNIT, X_AFTER_PRICE].forEach(x => {
                    ctx.moveTo(x, top);
                    ctx.lineTo(x, top + height);
                });
                ctx.stroke();
            };
            drawVerticals(TABLE_TOP, TABLE_HEADER_H);

            ctx.fillStyle = '#000000';
            ctx.font = 'bold 19px Cairo, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('#', (X_RIGHT + X_AFTER_NO) / 2, TABLE_TOP + 33);
            ctx.textAlign = 'right';
            ctx.fillText('اسم المنتج', X_AFTER_NO - 22, TABLE_TOP + 33);
            ctx.textAlign = 'center';
            ctx.fillText(qtyLabel, (X_AFTER_NAME + X_AFTER_QTY) / 2, TABLE_TOP + 33);
            ctx.fillText('الوحدة', (X_AFTER_QTY + X_AFTER_UNIT) / 2, TABLE_TOP + 33);
            ctx.fillText(retail ? 'سعر القطعة' : 'سعر الشراء', (X_AFTER_UNIT + X_AFTER_PRICE) / 2, TABLE_TOP + 33);
            ctx.fillText('الإجمالي', (X_AFTER_PRICE + X_LEFT) / 2, TABLE_TOP + 33);

            let y = TABLE_TOP + TABLE_HEADER_H;
            pageRows.forEach((row, localIndex) => {
                if ((row.index - 1) % 2 === 1) {
                    ctx.fillStyle = '#f9f9f9';
                    ctx.fillRect(LEFT, y, TABLE_W, ROW_H);
                }
                ctx.strokeStyle = '#222222';
                ctx.lineWidth = 1;
                ctx.strokeRect(LEFT, y, TABLE_W, ROW_H);
                drawVerticals(y, ROW_H);

                const baseline = y + 34;
                ctx.fillStyle = '#111111';
                ctx.font = '18px Cairo, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(row.index), (X_RIGHT + X_AFTER_NO) / 2, baseline);

                ctx.direction = 'rtl';
                ctx.textAlign = 'right';
                ctx.font = 'bold 18px Cairo, sans-serif';
                ctx.fillText(fitText(ctx, row.name, 420), X_AFTER_NO - 22, baseline);

                ctx.textAlign = 'center';
                ctx.font = 'bold 18px Cairo, sans-serif';
                ctx.fillText(String(row.qty), (X_AFTER_NAME + X_AFTER_QTY) / 2, baseline);
                ctx.font = '17px Cairo, sans-serif';
                ctx.fillText(fitText(ctx, row.unitName, 116), (X_AFTER_QTY + X_AFTER_UNIT) / 2, baseline);

                ctx.font = '18px Cairo, sans-serif';
                ctx.fillText(row.price.toFixed(2), (X_AFTER_UNIT + X_AFTER_PRICE) / 2, baseline);

                ctx.font = 'bold 18px Cairo, sans-serif';
                ctx.fillText(row.total.toFixed(2), (X_AFTER_PRICE + X_LEFT) / 2, baseline);
                y += ROW_H;
            });

            // إجمالي الصفحة الحالية.
            const summaryY = FOOTER_Y - PAGE_SUMMARY_H - 34;
            ctx.fillStyle = '#f6fbfa';
            ctx.strokeStyle = '#00D2B4';
            ctx.lineWidth = 1.5;
            ctx.fillRect(LEFT, summaryY, TABLE_W, PAGE_SUMMARY_H);
            ctx.strokeRect(LEFT, summaryY, TABLE_W, PAGE_SUMMARY_H);
            ctx.fillStyle = '#0b5f56';
            ctx.font = 'bold 17px Cairo, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`إجمالي هذه الصفحة: ${window.formatMoney(pageSum)}`, RIGHT - 16, summaryY + 27);

            // يظل باقي الصفحة أبيضاً بدلاً من تصغير الجدول كله ليناسب صفحة واحدة.
            ctx.fillStyle = '#6d7781';
            ctx.font = '16px Cairo, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('تم استخراج هذا التقرير عبر منظومة ADT Stock', PAGE_W / 2, FOOTER_Y);
            return canvas;
        }

        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
            const from = pageIndex * rowsPerPage;
            const to = from + rowsPerPage;
            pages.push(drawPage(rows.slice(from, to), pageIndex));
        }

        try {
            await sharePdfBlob(createPurePdfBlobFromCanvases(pages), fileName);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('[Audit PDF Export] failed:', err);
            window.customAlert('تعذر تصدير الجرد','حدث خطأ أثناء إنشاء أو مشاركة ملف PDF. حاول مرة أخرى.');
        }
    };

    // الفواتير الاحتياطية - تعمل محلياً عند تعطل المنظومة
    let invoiceItems = [];
    let pendingInvoiceProductIndex = null;
    let editingInvoiceItemIndex = null;
    let currentInvoiceHistoryId = null;

    window.setInvoiceProductResultsOpen = function(open, clearContent = false) {
        const box = document.getElementById('invoiceProductResults');
        const input = document.getElementById('invoiceProductSearch');
        if (!box) return;
        if (clearContent) box.innerHTML = '';
        box.hidden = !open;
        box.classList.toggle('is-open', !!open);
        if (open) box.scrollTop = 0;
        if (input) input.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    window.openInvoiceModal = function(){
        invoiceItems=[];
        currentInvoiceHistoryId=null;
        const c=document.getElementById('invoiceCustomerName'); if(c)c.value='';
        const q=document.getElementById('invoiceProductSearch'); if(q)q.value='';
        window.setInvoiceProductResultsOpen(false, true);
        window.renderInvoiceItems();
        document.getElementById('invoiceModal').style.display='flex';
    };
    window.handleInvoiceProductSearch=function(){
        const input=document.getElementById('invoiceProductSearch');
        const box=document.getElementById('invoiceProductResults');
        if(!input||!box)return;
        const q=window.normalizeArabic(input.value||'');
        if(!q){window.setInvoiceProductResultsOpen(false, true);return;}
        const found=products.filter(p=>window.getProductSearchValue(p).includes(q)).slice(0,8);
        if(!found.length){
            box.innerHTML='<div class="search-res-item" role="status" style="color:var(--text-muted);font-size:10px;padding:10px">لا توجد نتائج مطابقة</div>';
            window.setInvoiceProductResultsOpen(true);
            return;
        }
        box.innerHTML=found.map(p=>{
            const idx=products.indexOf(p);
            return `<div class="adt-invoice-search-choice" role="option">
                <div class="prod-info-center">
                    <div class="prod-name-title">${window.escapeHtml(p.name)}</div>
                    <div class="invoice-search-price">${window.formatMoney(Number(p.sellPrice||0))}</div>
                </div>
                <button type="button" class="adt-invoice-choose-btn" onclick="event.preventDefault();event.stopPropagation();window.addInvoiceProductByIndex(${idx});return false;">اختيار</button>
            </div>`;
        }).join('');
        window.setInvoiceProductResultsOpen(true);
    };
    let pendingInvoiceUnit='pack';
    window.updatePiecePricePreview=function(){
        const sell=Number(document.getElementById('pSellPrice')?.value||0),qty=Math.max(1,Number(document.getElementById('pPackQty')?.value||1));
        const piece=(document.getElementById('pPieceName')?.value||'قطعة').trim()||'قطعة',el=document.getElementById('pPiecePricePreview');
        if(el)el.textContent=sell>0&&qty>1?`سعر ${piece} تلقائياً: ${window.formatMoney(sell/qty)}`:'';
    };
    document.addEventListener('input',e=>{if(['pSellPrice','pPackQty','pPieceName'].includes(e.target?.id))window.updatePiecePricePreview();});
    window.setInvoiceItemUnit=function(unit){
        pendingInvoiceUnit=unit==='piece'?'piece':'pack';
        const p=editingInvoiceItemIndex!==null?products.find(z=>String(z.id)===String(invoiceItems[editingInvoiceItemIndex]?.id)):products[pendingInvoiceProductIndex];if(!p)return;
        const pq=Math.max(1,Number(p.packQty||1));if(pq<=1)pendingInvoiceUnit='pack';
        const a=document.getElementById('invoiceUnitPackBtn'),b=document.getElementById('invoiceUnitPieceBtn');
        if(a){a.textContent=p.packName||'صندوق';a.classList.toggle('active',pendingInvoiceUnit==='pack');}
        if(b){b.textContent=p.pieceName||'قطعة';b.classList.toggle('active',pendingInvoiceUnit==='piece');b.disabled=pq<=1;b.style.opacity=pq<=1?'.45':'1';}
        const sell=document.getElementById('invoiceItemSellPriceInput'),base=Number(p.sellPrice||0);
        if(sell)sell.value=(pendingInvoiceUnit==='piece'?base/pq:base).toFixed(2);
        const h=document.getElementById('invoiceItemPriceHint');if(h)h.textContent=pendingInvoiceUnit==='piece'?`${pq} ${p.pieceName||'قطعة'} = 1 ${p.packName||'صندوق'}`:`سعر ${p.packName||'صندوق'} الكامل`;
    };
    window.addInvoiceProductByIndex=function(idx){
        const p=products[idx]; if(!p)return;
        pendingInvoiceProductIndex=idx; editingInvoiceItemIndex=null;
        const title=document.getElementById('invoiceItemEditTitle'); if(title)title.innerText=p.name;
        const qty=document.getElementById('invoiceItemQtyInput'); if(qty)qty.value='0';
        pendingInvoiceUnit='pack';
        const sell=document.getElementById('invoiceItemSellPriceInput');
        if(sell){sell.value=Number(p.sellPrice||0).toFixed(2);sell.disabled=!window.canEditSellPrice();sell.style.opacity=sell.disabled?'.65':'1';}
        const hint=document.getElementById('invoiceItemPriceHint');
        if(hint)hint.innerHTML='';
        const note=document.getElementById('invoiceItemNoteInput'); if(note)note.value='';
        window.setInvoiceItemUnit('pack');
        document.getElementById('invoiceItemEditModal').style.display='flex'; setTimeout(()=>qty?.focus(),120);
    };
    window.editInvoiceItem=function(i){
        const x=invoiceItems[i]; if(!x)return;
        const p=products.find(p=>String(p.id)===String(x.id));
        editingInvoiceItemIndex=i; pendingInvoiceProductIndex=null;
        const title=document.getElementById('invoiceItemEditTitle'); if(title)title.innerText=x.name;
        const qty=document.getElementById('invoiceItemQtyInput'); if(qty)qty.value=String(x.qty||1);
        pendingInvoiceUnit=x.unit||'pack';
        const sell=document.getElementById('invoiceItemSellPriceInput');
        if(sell){sell.value=Number(x.price||0).toFixed(2);sell.disabled=!window.canEditSellPrice();sell.style.opacity=sell.disabled?'.65':'1';}
        const hint=document.getElementById('invoiceItemPriceHint');
        if(hint)hint.innerHTML='';
        const note=document.getElementById('invoiceItemNoteInput'); if(note)note.value=x.note||'';
        window.setInvoiceItemUnit(pendingInvoiceUnit); if(sell)sell.value=Number(x.price||0).toFixed(2);
        document.getElementById('invoiceItemEditModal').style.display='flex';
    };
    window.confirmInvoiceItemEdit=function(){
        const qty=parseFloat(document.getElementById('invoiceItemQtyInput')?.value||'0')||0;
        if(qty<=0){const q=document.getElementById('invoiceItemQtyInput');if(q){q.classList.add('adt-invalid-qty');q.focus();setTimeout(()=>q.classList.remove('adt-invalid-qty'),700);}return;}
        const p = editingInvoiceItemIndex!==null ? products.find(z=>String(z.id)===String(invoiceItems[editingInvoiceItemIndex]?.id)) : products[pendingInvoiceProductIndex];
        if(!p)return;
        const sellEl=document.getElementById('invoiceItemSellPriceInput');
        let sellPrice=Number(sellEl?.value||p.sellPrice||0);
        if(!Number.isFinite(sellPrice)||sellPrice<=0){sellEl?.classList.add('adt-invalid-qty');sellEl?.focus();setTimeout(()=>sellEl?.classList.remove('adt-invalid-qty'),700);return;}
        const packQty=Math.max(1,Number(p.packQty||1));
        const unit=(pendingInvoiceUnit==='piece'&&packQty>1)?'piece':'pack';
        const buyPrice=Number(p.buyPrice||0)/(unit==='piece'?packQty:1);
        if(sellPrice<buyPrice){
            if(sellEl){sellEl.classList.add('adt-invalid-price');sellEl.focus();setTimeout(()=>sellEl.classList.remove('adt-invalid-price'),1200);}
            const hint=document.getElementById('invoiceItemPriceHint');
            if(hint){hint.innerHTML='<span class="adt-price-error">سعر البيع أقل من الحد المسموح لهذا الصنف</span>';}
            return;
        }
        if(!window.canEditSellPrice()) sellPrice=Number(p.sellPrice||0)/(unit==='piece'?packQty:1);
        const note=(document.getElementById('invoiceItemNoteInput')?.value||'').trim();
        if(editingInvoiceItemIndex!==null){
            const x=invoiceItems[editingInvoiceItemIndex]; x.qty=qty;x.note=note;x.price=sellPrice;x.buyPrice=buyPrice;x.unit=unit;x.unitName=unit==='piece'?(p.pieceName||'قطعة'):(p.packName||'صندوق');
        } else {
            const existing=invoiceItems.find(x=>String(x.id)===String(p.id)&&String(x.unit||'pack')===unit);
            if(existing){existing.qty=Number(existing.qty||0)+qty;if(note)existing.note=existing.note?(existing.note+' | '+note):note;existing.price=sellPrice;existing.buyPrice=buyPrice;existing.unitName=unit==='piece'?(p.pieceName||'قطعة'):(p.packName||'صندوق');}
            else invoiceItems.push({id:p.id,name:p.name,qty,price:sellPrice,buyPrice,note,unit,unitName:unit==='piece'?(p.pieceName||'قطعة'):(p.packName||'صندوق')});
        }
        pendingInvoiceProductIndex=null;editingInvoiceItemIndex=null;
        const input=document.getElementById('invoiceProductSearch');if(input)input.value='';
        window.setInvoiceProductResultsOpen(false, true);
        window.closeModal('invoiceItemEditModal');window.renderInvoiceItems();
    };
    window.addInvoiceItem=function(){window.handleInvoiceProductSearch();};
    window.changeInvoiceQty=function(i,d){invoiceItems[i].qty=Math.max(0.01,Number(invoiceItems[i].qty||0)+Number(d||0));window.renderInvoiceItems();};
    window.setInvoicePrice=function(i,v){
        const x=invoiceItems[i],p=products.find(p=>String(p.id)===String(x.id));const buy=Number(p?.buyPrice||x.buyPrice||0),nv=Number(v||0);
        if(nv<buy)return false;x.price=nv;window.renderInvoiceItems(false);return true;
    };
    window.removeInvoiceItem=async function(i){
        const item=invoiceItems[i]; if(!item)return;
        const ok=await window.showAppConfirm({title:'حذف صنف من الفاتورة',message:`هل تريد حذف «${item.name}» من الفاتورة؟`,confirmText:'حذف',cancelText:'إغلاق',danger:true});
        if(!ok)return; invoiceItems.splice(i,1);window.renderInvoiceItems();
    };
    window.renderInvoiceItems=function(){
        const box=document.getElementById('invoiceItemsContainer');if(!box)return;
        const hasItems=invoiceItems.length>0;
        box.classList.toggle('is-empty',!hasItems);
        box.innerHTML=hasItems?invoiceItems.map((x,i)=>{
          const total=Number(x.qty||0)*Number(x.price||0);
          const note=String(x.note||'').trim();
          return `<div class="adt-invoice-line adt-invoice-line-compact${note?' has-note':''}" onclick="window.editInvoiceItem(${i})">
            <div class="adt-invoice-line-main"><div class="adt-invoice-line-name">${window.escapeHtml(x.name)}</div>${note?`<div class="adt-invoice-item-note">ملاحظة: ${window.escapeHtml(note)}</div>`:''}</div>
            <div class="adt-invoice-mini-meta"><span>${x.qty} ${window.escapeHtml(x.unitName||'صندوق')}</span><span>سعر القطعة: ${window.formatMoney((()=>{const p=products.find(z=>String(z.id)===String(x.id));const pack=Math.max(1,Number(p?.packQty||1));return x.unit==='piece'?Number(x.price||0):Number(p?.sellPrice||0)/pack;})())}</span><b>${window.formatMoney(Number(x.price||0))}</b></div>
            <button class="adt-invoice-delete" onclick="event.stopPropagation();window.removeInvoiceItem(${i})" aria-label="حذف">×</button>
          </div>`
        }).join(''):`<div class="adt-invoice-empty-state adt-invoice-empty-inline">
            <div class="adt-invoice-empty-icon">▤</div>
            <b>لم يتم إضافة أي أصناف بعد</b>
            <span>ابحث عن صنف واضغط عليه لبدء الفاتورة</span>
          </div>`;
        const total=invoiceItems.reduce((a,x)=>a+(Number(x.qty||0)*Number(x.price||0)),0);const t=document.getElementById('invoiceTotalText');if(t)t.innerText=window.formatMoney(total); const cnt=document.getElementById('invoiceItemsCountText');if(cnt)cnt.textContent=String(invoiceItems.length);
    };
    window.getInvoiceHistoryKey=function(){ return 'adt_invoice_history_v104_'+String(currentTeam?.id||'local'); };
    window.readInvoiceHistory=function(){const value=window.readCriticalLocalState(window.getInvoiceHistoryKey(),[]);return Array.isArray(value)?value:[];};
    window.updateSavedInvoicesDrawerCard=function(){
      const card=document.getElementById('drawerSavedInvoicesCard');if(!card)return;
      const allowed=!!window.canCreateInvoices?.();card.style.display=allowed?'grid':'none';if(!allowed)return;
      const list=window.readInvoiceHistory();
      const count=document.getElementById('drawerSavedInvoicesCount');if(count)count.textContent=list.length>99?'99+':String(list.length);
      const latest=document.getElementById('drawerSavedInvoicesLatest');if(!latest)return;
      if(!list.length){latest.textContent='لا توجد فواتير محفوظة بعد';return;}
      const when=new Date(list[0]?.createdAt||0);
      latest.textContent=Number.isNaN(when.getTime())?'آخر فاتورة محفوظة جاهزة للعرض':`آخر حفظ: ${when.toLocaleDateString('ar-LY',{day:'numeric',month:'short'})}، ${when.toLocaleTimeString('ar-LY',{hour:'2-digit',minute:'2-digit'})}`;
    };
    window.openSavedInvoicesFromDrawer=function(){
      if(!window.canCreateInvoices?.()){window.customAlert?.('غير مسموح','المدير لم يسمح لهذا العضو بإنشاء الفواتير.');return;}
      window.closeSideMenu();setTimeout(()=>window.openSavedInvoices(),120);
    };
    window.saveInvoiceDraftToHistory=function(){
      if(!invoiceItems.length)return null;
      const now=new Date();
      const customer=(document.getElementById('invoiceCustomerName')?.value||'').trim()||'بدون اسم';
      const creator=String(localStorage.getItem('atd_sales_user_name')||window.currentUserName||window.userName||window.currentUser?.name||window.currentUser?.user_name||currentTeam?.manager_name||'—').trim()||'—';
      const total=invoiceItems.reduce((a,x)=>a+Number(x.qty||0)*Number(x.price||0),0);
      const list=window.readInvoiceHistory();
      const existingIndex=currentInvoiceHistoryId?list.findIndex(x=>String(x.id)===String(currentInvoiceHistoryId)):-1;
      let row;
      if(existingIndex>=0){
        const old=list[existingIndex];
        row={...old,customer,creator,total,items:invoiceItems.map(x=>({...x})),updatedAt:now.toISOString()};
        list.splice(existingIndex,1);
      }else{
        const stamp=Date.now();
        row={id:'inv_'+stamp,invoiceNo:String(stamp).slice(-7),customer,creator,createdAt:now.toISOString(),updatedAt:now.toISOString(),total,items:invoiceItems.map(x=>({...x}))};
        currentInvoiceHistoryId=row.id;
      }
      list.unshift(row);
      const saved=list.slice(0,150);window.writeCriticalLocalState('invoice_history',window.getInvoiceHistoryKey(),saved);window.updateSavedInvoicesDrawerCard?.();return row;
    };
    window.openSavedInvoices=function(){ if(!window.canCreateInvoices?.())return; window.renderSavedInvoices(); document.getElementById('savedInvoicesModal').style.display='flex'; };
    window.renderSavedInvoices=function(){
      const box=document.getElementById('savedInvoicesList'); if(!box)return; const all=window.readInvoiceHistory();
      const q=String(document.getElementById('savedInvoicesSearch')?.value||'').trim().toLowerCase();
      const list=all.map((r,index)=>({r,index})).filter(x=>!q||String(x.r.invoiceNo||'').toLowerCase().includes(q)||String(x.r.customer||'').toLowerCase().includes(q));
      const total=list.reduce((s,x)=>s+Number(x.r.total||0),0);
      const countStat=document.getElementById('savedInvoicesCountStat');if(countStat)countStat.textContent=`${list.length} فاتورة`;
      const totalStat=document.getElementById('savedInvoicesTotalStat');if(totalStat)totalStat.textContent=window.formatMoney(total);
      box.innerHTML=list.length?list.map(({r,index})=>{
        const when=new Date(r.updatedAt||r.createdAt||0);const dateText=Number.isNaN(when.getTime())?'بدون تاريخ':`${when.toLocaleDateString('ar-LY')} • ${when.toLocaleTimeString('ar-LY',{hour:'2-digit',minute:'2-digit'})}`;
        const itemCount=Array.isArray(r.items)?r.items.length:0;
        return `<article class="adt-saved-invoice-row">
          <div class="adt-saved-invoice-top"><div class="adt-saved-invoice-person"><span class="adt-saved-invoice-avatar"><svg viewbox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"></path></svg></span><span class="adt-saved-invoice-copy"><b>${window.escapeHtml(r.customer||'بدون اسم')}</b><small>فاتورة #${window.escapeHtml(r.invoiceNo||'—')} • ${window.escapeHtml(dateText)}</small></span></div><span class="adt-saved-invoice-total"><strong>${window.formatMoney(Number(r.total||0))}</strong><small>${itemCount} ${itemCount===1?'صنف':'أصناف'}</small></span></div>
          <div class="adt-saved-invoice-actions"><button class="adt-saved-action open" onclick="window.loadSavedInvoice(${index})"><svg viewbox="0 0 24 24"><path d="M12 5c-5.5 0-9.5 5.2-10 6l-.3.5.3.5c.5.8 4.5 6 10 6s9.5-5.2 10-6l.3-.5-.3-.5c-.5-.8-4.5-6-10-6zm0 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"></path></svg>فتح الفاتورة</button><button class="adt-saved-action share" onclick="window.shareSavedInvoice(${index})"><svg viewbox="0 0 24 24"><path d="M18 16a3 3 0 0 0-2.4 1.2l-7-4.1a3.3 3.3 0 0 0 0-2.2l7-4.1A3 3 0 1 0 15 5a2.8 2.8 0 0 0 .1.8l-7 4.1a3 3 0 1 0 0 4.2l7 4.1A2.8 2.8 0 0 0 15 19a3 3 0 1 0 3-3z"></path></svg>مشاركة PDF</button><button class="adt-saved-action delete" aria-label="حذف الفاتورة" onclick="window.deleteSavedInvoice(${index})"><svg viewbox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm3 2v7h2v-7H9zm4 0v7h2v-7h-2z"></path></svg></button></div>
        </article>`;
      }).join(''):'<div class="adt-no-saved-invoices"><div class="adt-no-saved-invoices-icon">▤</div><b>لا توجد فواتير مطابقة</b><div style="margin-top:4px;font-size:9px">ستظهر الفواتير هنا بعد إصدارها</div></div>';
    };
    window.deleteSavedInvoice=async function(i){
      const list=window.readInvoiceHistory(),row=list[i];if(!row)return;
      const ok=await window.showAppConfirm({title:'حذف الفاتورة',message:`هل تريد حذف فاتورة «${row.customer||'بدون اسم'}» نهائياً؟`,confirmText:'حذف',cancelText:'إلغاء',danger:true});if(!ok)return;
      list.splice(i,1);if(String(currentInvoiceHistoryId||'')===String(row.id||''))currentInvoiceHistoryId=null;
      window.writeCriticalLocalState('invoice_history',window.getInvoiceHistoryKey(),list);window.renderSavedInvoices();window.updateSavedInvoicesDrawerCard?.();window.showToast('تم حذف الفاتورة');
    };
    window.shareSavedInvoice=async function(i){
      const row=window.readInvoiceHistory()[i];if(!row)return;
      const previous={items:invoiceItems.map(x=>({...x})),historyId:currentInvoiceHistoryId,customer:document.getElementById('invoiceCustomerName')?.value||''};
      try{
        currentInvoiceHistoryId=row.id||null;invoiceItems=(row.items||[]).map(x=>({...x}));const field=document.getElementById('invoiceCustomerName');if(field)field.value=row.customer==='بدون اسم'?'':(row.customer||'');window.renderInvoiceItems();await window.exportInvoicePDF();window.renderSavedInvoices();
      }finally{
        invoiceItems=previous.items;currentInvoiceHistoryId=previous.historyId;const field=document.getElementById('invoiceCustomerName');if(field)field.value=previous.customer;window.renderInvoiceItems();
      }
    };
    window.clearAllSavedInvoices=async function(){
      const list=window.readInvoiceHistory();if(!list.length){window.showToast('لا توجد فواتير محفوظة');return;}
      const ok=await window.showAppConfirm({title:'مسح الفواتير المحفوظة',message:'سيتم حذف جميع الفواتير المحفوظة على هذا الجهاز نهائياً.',confirmText:'مسح الكل',cancelText:'إلغاء',danger:true});
      if(!ok)return;window.writeCriticalLocalState('invoice_history',window.getInvoiceHistoryKey(),[]);currentInvoiceHistoryId=null;window.renderSavedInvoices();window.updateSavedInvoicesDrawerCard?.();window.showToast('تم مسح الفواتير المحفوظة');
    };
    window.loadSavedInvoice=function(i){ const r=window.readInvoiceHistory()[i]; if(!r)return; currentInvoiceHistoryId=r.id||null;invoiceItems=(r.items||[]).map(x=>({...x})); const c=document.getElementById('invoiceCustomerName');if(c)c.value=r.customer==='بدون اسم'?'':(r.customer||''); window.renderInvoiceItems(); window.closeModal('savedInvoicesModal'); document.getElementById('invoiceModal').style.display='flex'; };
    window.adtNumberToArabicWords=function(value){
      const n=Math.floor(Number(value)||0), frac=Math.round(((Number(value)||0)-n)*1000);
      const ones=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
      const tens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
      const hundreds=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
      function under1000(x){let a=[];if(x>=100){a.push(hundreds[Math.floor(x/100)]);x%=100;}if(x){if(x<20)a.push(ones[x]);else{let o=x%10,t=Math.floor(x/10);if(o)a.push(ones[o]);a.push(tens[t]);}}return a.join(' و');}
      function words(x){if(x===0)return 'صفر';let a=[];if(x>=1000000){let m=Math.floor(x/1000000);a.push((m===1?'مليون':m===2?'مليونان':under1000(m)+' مليون'));x%=1000000;}if(x>=1000){let k=Math.floor(x/1000);a.push(k===1?'ألف':k===2?'ألفان':k>=3&&k<=10?under1000(k)+' آلاف':under1000(k)+' ألف');x%=1000;}if(x)a.push(under1000(x));return a.join(' و');}
      let out=words(n)+' '+window.getCurrencySymbol();if(frac)out+=' و'+words(frac)+' جزء من مائة';return out+' فقط لا غير';
    };
    window.exportInvoicePDF=async function(){
        if(!invoiceItems.length){window.customAlert('الفاتورة فارغة','أضف صنفاً واحداً على الأقل.');return;}
        await window.loadStoreProfile();
        const storeProfile=window.getStoreProfile(),store=storeProfile.storeName,storeAddress=storeProfile.storeAddress,customer=(document.getElementById('invoiceCustomerName')?.value||'').trim()||'بدون اسم';
        const userName=String(localStorage.getItem('atd_sales_user_name')||window.currentUserName||currentTeam?.manager_name||'—').trim()||'—';
        try{if(document.fonts?.ready)await document.fonts.ready;}catch(_){}
        const now=new Date(),invoiceNo=String(now.getTime()).slice(-7),W=1240,M=65,rowH=62,noteRowH=86;
        const invoiceRowsHeight=invoiceItems.reduce((sum,it)=>sum+(String(it.note||'').trim()?noteRowH:rowH),0);
        const H=Math.max(1754,560+invoiceRowsHeight+360);
        const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.direction='rtl';
        ctx.fillStyle='#07131f';ctx.fillRect(0,0,W,185);
        const fitInvoiceHeaderLine=(text,maxWidth,startSize,minSize,weight)=>{let size=startSize;ctx.font=`${weight} ${size}px Cairo`;while(size>minSize&&ctx.measureText(text).width>maxWidth){size--;ctx.font=`${weight} ${size}px Cairo`;}return size;};
        ctx.textAlign='center';ctx.direction='rtl';ctx.fillStyle='#ffffff';ctx.font='900 40px Cairo';ctx.fillText('فاتورة مبيعات',W/2,76);
        ctx.strokeStyle='#16cdb4';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(W/2-92,99);ctx.lineTo(W/2+92,99);ctx.stroke();ctx.lineCap='butt';
        ctx.textAlign='right';ctx.fillStyle='#16cdb4';ctx.font='800 15px Cairo';ctx.fillText(`رقم الفاتورة: ${invoiceNo}`,W-M,112);
        const logo=document.getElementById('adtHeaderLogoV45');if(logo?.complete&&logo.naturalWidth){const r=Math.min(270/logo.naturalWidth,92/logo.naturalHeight);ctx.drawImage(logo,M,45,logo.naturalWidth*r,logo.naturalHeight*r);}
        let y=215;ctx.fillStyle='#f4f6f8';ctx.fillRect(M,y,W-M*2,105);
        ctx.strokeStyle='#d6dde5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W/2-250,y+18);ctx.lineTo(W/2-250,y+87);ctx.moveTo(W/2+250,y+18);ctx.lineTo(W/2+250,y+87);ctx.stroke();
        ctx.fillStyle='#111827';ctx.textAlign='right';ctx.font='800 16px Cairo';ctx.fillText(`العميل: ${customer}`,W-M-18,y+34);ctx.fillText(`المستخدم: ${userName}`,W-M-18,y+70);
        ctx.textAlign='left';ctx.font='700 14px Cairo';ctx.fillText(now.toLocaleDateString('ar-LY'),M+18,y+34);ctx.fillText(now.toLocaleTimeString('ar-LY',{hour:'2-digit',minute:'2-digit'}),M+18,y+70);
        ctx.textAlign='center';ctx.direction='rtl';ctx.fillStyle='#0f766e';const storeFontSize=fitInvoiceHeaderLine(store,440,25,14,900);ctx.font=`900 ${storeFontSize}px Cairo`;ctx.fillText(store,W/2,storeAddress?y+40:y+61);
        if(storeAddress){ctx.fillStyle='#475569';const addressFontSize=fitInvoiceHeaderLine(storeAddress,440,14,10,700);ctx.font=`700 ${addressFontSize}px Cairo`;ctx.fillText(storeAddress,W/2,y+72);}
        y+=135;const cols=[180,170,180,150,170,260],labels=['الإجمالي','السعر','سعر القطعة','عدد القطع','الكمية','الصنف'];
        ctx.fillStyle='#d7d7d7';ctx.fillRect(M,y,1110,70);ctx.strokeStyle='#222';ctx.lineWidth=2;ctx.strokeRect(M,y,1110,70);let x=M;ctx.fillStyle='#111';ctx.textAlign='center';ctx.font='900 16px Cairo';labels.forEach((l,i)=>{ctx.fillText(l,x+cols[i]/2,y+42);x+=cols[i];if(i<labels.length-1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+70+invoiceRowsHeight);ctx.stroke();}});y+=70;
        const fitName=(name,max)=>{ctx.font='800 16px Cairo';let t=String(name||'');while(t.length>2&&ctx.measureText(t).width>max)t=t.slice(0,-1);return t===String(name||'')?t:t+'…';};
        let grand=0,totalPieces=0;invoiceItems.forEach(it=>{const note=String(it.note||'').trim(),currentRowH=note?noteRowH:rowH,q=Number(it.qty||0),sum=q*Number(it.price||0),p=products.find(z=>String(z.id)===String(it.id)),packQty=Math.max(1,Number(p?.packQty||1)),pieces=(it.unit==='piece'?q:q*packQty);grand+=sum;totalPieces+=pieces;ctx.strokeStyle='#333';ctx.strokeRect(M,y,1110,currentRowH);let xx=M;const centerY=y+currentRowH/2+5;ctx.fillStyle='#111';ctx.direction='ltr';ctx.textAlign='center';ctx.font='700 15px Cairo';ctx.fillText(sum.toFixed(2),xx+90,centerY);xx+=180;ctx.fillText(Number(it.price||0).toFixed(2),xx+85,centerY);xx+=170;const piecePrice=(it.unit==='piece'?Number(it.price||0):Number(p?.sellPrice||0)/packQty);ctx.fillText(piecePrice.toFixed(2),xx+90,centerY);xx+=180;ctx.fillText(String(Number.isInteger(pieces)?pieces:pieces.toFixed(2)),xx+75,centerY);xx+=150;ctx.fillText(String(Number.isInteger(q)?q:q.toFixed(2)),xx+85,centerY);xx+=170;ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#111';ctx.font='800 16px Cairo';ctx.fillText(fitName(it.name,235),xx+245,note?y+31:centerY);if(note){ctx.fillStyle='#475569';ctx.font='700 12px Cairo';ctx.fillText(fitName('ملاحظة: '+note,235),xx+245,y+58);}y+=currentRowH;});
        y+=18;ctx.fillStyle='#f3f3f3';ctx.fillRect(M,y,1110,58);ctx.fillStyle='#111';ctx.font='800 16px Cairo';ctx.textAlign='right';ctx.fillText(window.adtNumberToArabicWords(grand),W-M-18,y+36);ctx.textAlign='left';ctx.fillText(`إجمالي عدد القطع: ${Number.isInteger(totalPieces)?totalPieces:totalPieces.toFixed(2)}`,M+18,y+36);y+=58;
        [['إجمالي الفاتورة',grand]].forEach((r,i)=>{ctx.strokeStyle='#222';ctx.strokeRect(M,y+i*52,430,52);ctx.fillStyle='#111';ctx.textAlign='right';ctx.font='800 15px Cairo';ctx.fillText(r[0],M+412,y+i*52+33);ctx.textAlign='left';ctx.font='900 18px Cairo';ctx.fillText(window.formatMoney(r[1]),M+18,y+i*52+33);});
        ctx.fillStyle='#9aa4ae';ctx.textAlign='center';ctx.font='700 13px Cairo';ctx.fillText('تم إنشاء هذه الفاتورة بواسطة منظومة ADT Stock',W/2,H-70);window.saveInvoiceDraftToHistory();await renderCanvasToPdfAndShare(canvas,`ADT_Invoice_${invoiceNo}.pdf`);
    };

    // كشوفات الديون وسندات القبض وحذف الحسابات
    window.fetchDebtsFromSupabase = async function() {
        if (!window.canEditDebts()) {
            debts = { customers: [], suppliers: [] };
            window.renderDebts();
            return true;
        }
        if (window.hasPendingDeveloperMutations('debts')) {
            window.renderDebts();
            return true;
        }
        if (!dbClient || !currentTeam) {
            try {
                const cached = window.readTeamCache('atd_sales_debts_v17', { customers: [], suppliers: [] }, currentTeam?.id);
                if (cached && Array.isArray(cached.customers) && Array.isArray(cached.suppliers)) debts = cached;
            } catch(e) { console.error('[Debts Sync] Local cache read failed:', e); }
            window.renderDebts();
            return true;
        }
        const teamIdAtStart = currentTeam.id;
        try {
            const { data: debtList, error } = await dbClient.rpc('adt_read_debts', {
                p_team_id: String(teamIdAtStart), p_user_id: getDeviceId(),
                p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null)
            });
            if (error) throw error;
            if (!currentTeam || currentTeam.id !== teamIdAtStart) return;
            if(!Array.isArray(debtList))throw new Error('INVALID_DEBTS_PAYLOAD');
            const fresh = { customers: [], suppliers: [] };
            debtList.forEach(d => {
                const acc = {
                    id: d.id,
                    name: d.name,
                    phone: d.phone,
                    amount: d.amount || 0,
                    transactions: Array.isArray(d.transactions) ? d.transactions : [],
                    is_deleted: false
                };
                if (d.type === 'supplier') fresh.suppliers.push(acc);
                else fresh.customers.push(acc);
            });
            debts = fresh;
            window.saveTeamCache('atd_sales_debts_v17', debts);
            window.renderDebts();
            return true;
        } catch(e) {
            console.error('[Debts Sync] Fetch failed:', e);
            window.renderDebts();
            window.interfaceAlert('debts', 'تعذر مزامنة الحسابات', 'احتفظ التطبيق بآخر نسخة موجودة على الجهاز ولم يحذف بيانات الديون.\n\nالسبب: ' + (e?.message || 'خطأ غير معروف'));
            return false;
        }
    };

    window.switchDebtSubTab = function(type) {
        activeDebtSubTab = type;
        document.getElementById('btnDebtCust').className = `debt-toggle-btn ${type==='customer'?'active cust':''}`;
        document.getElementById('btnDebtSupp').className = `debt-toggle-btn ${type==='supplier'?'active supp':''}`;
        window.renderDebts();
    };

    window.openAddNewAccountModal = function() {
        if (!window.canEditDebts()) {
            window.customAlert('صلاحية مقفلة', 'ليس لديك صلاحية لإضافة حسابات ديون. اطلب الإذن من المدير.');
            return;
        }
        document.getElementById('newAccountNameInput').value = '';
        document.getElementById('newAccountPhoneInput').value = '';
        document.getElementById('newAccountModalTitle').innerText = (activeDebtSubTab === 'customer') ? 'إضافة حساب زبون جديد' : 'إضافة حساب مورد جديد';
        document.getElementById('newAccountModal').style.display = 'flex';
        setTimeout(() => document.getElementById('newAccountNameInput')?.focus(), 150);
    };

    window.saveNewAccountRecord = async function() {
        if (!(await window.confirmGhostMutation('إنشاء حساب ديون'))) return;
        if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) {
            window.customAlert('لا يوجد اتصال بالخادم', 'تعذر الحفظ لأن الاتصال بالخادم غير متاح. يمكنك مشاهدة آخر نسخة محفوظة، لكن التعديل يحتاج اتصالاً حتى لا تضيع البيانات.');
            return;
        }

        const name = document.getElementById('newAccountNameInput').value.trim();
        const phone = document.getElementById('newAccountPhoneInput').value.trim();
        if (!name) { window.customAlert('بيانات ناقصة', 'أدخل اسم الحساب.'); return; }

        let newAcc = {
            id: 'acc_' + Date.now(),
            team_id: currentTeam ? currentTeam.id : 'local',
            type: activeDebtSubTab,
            name,
            phone,
            transactions: [],
            is_deleted: false,
            amount: 0
        };

        if ((dbClient || window.isDeveloperOffline()) && currentTeam) {
            const { data: savedRow, error } = await window.developerOfflineRpc('adt_debt_create', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId(), p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null), p_type: newAcc.type, p_name: newAcc.name, p_phone: newAcc.phone
            });
            if (error || !savedRow) {
                console.error('[Debts Sync] Account insert failed:', error);
                window.customAlert('تعذر إنشاء الحساب', 'لم يتم حفظ الحساب على الخادم، لذلك لم تتم إضافته محلياً.\n\nالسبب: ' + (error?.message || 'لم يرجع الخادم بيانات الحفظ.'));
                return;
            }
            newAcc.id = savedRow.id;
        }

        if (activeDebtSubTab === 'customer') debts.customers.unshift(newAcc);
        else debts.suppliers.unshift(newAcc);
        window.saveTeamCache('atd_sales_debts_v17', debts);
        window.closeModal('newAccountModal');
        window.showToast('تم إنشاء الحساب بنجاح');
        window.openAccountLedgerDetail(newAcc.id);
    };

    window.promptDeleteDebtAccount = function(accId, accName) {
        if (!window.canEditDebts()) {
            window.customAlert('صلاحية مقفلة', 'ليس لديك صلاحية لحذف الحسابات.');
            return;
        }
        pendingDebtDeleteId = accId;
        document.getElementById('debtAccountDeletePromptText').innerText = `تأكيد حذف حساب (${accName}) وسجل عملياته بالكامل.`;
        document.getElementById('debtAccountDeleteConfirmModal').style.display = 'flex';
    };

    window.executeConfirmedDebtAccountDelete = async function() {
        if (!(await window.confirmGhostMutation('حذف حساب ديون'))) return;
        if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) {
            window.customAlert('لا يوجد اتصال بالخادم', 'تعذر الحفظ لأن الاتصال بالخادم غير متاح. يمكنك مشاهدة آخر نسخة محفوظة، لكن التعديل يحتاج اتصالاً حتى لا تضيع البيانات.');
            return;
        }

        if (!pendingDebtDeleteId) return;

        if ((dbClient || window.isDeveloperOffline()) && currentTeam) {
            const { data: debtDeleteOk, error } = await window.developerOfflineRpc('adt_debt_delete', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId(), p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null), p_debt_id: String(pendingDebtDeleteId)
            });
            if (error || debtDeleteOk !== true) {
                console.error('[Debts Sync] Account delete failed:', error);
                window.customAlert('تعذر حذف الحساب', 'لم يتم الحذف من الخادم، لذلك أبقينا الحساب في القائمة.\n\nالسبب: ' + (error.message || 'خطأ غير معروف'));
                return;
            }
        }

        const deletedDebtId = String(pendingDebtDeleteId);
        debts.customers = debts.customers.filter(c => String(c.id) !== deletedDebtId);
        debts.suppliers = debts.suppliers.filter(s => String(s.id) !== deletedDebtId);
        window.saveTeamCache('atd_sales_debts_v17', debts);
        window.closeModal('debtAccountDeleteConfirmModal');
        window.showToast('تم حذف الحساب بنجاح');
        pendingDebtDeleteId = null;
        if (activeLedgerAccount && String(activeLedgerAccount.id) === deletedDebtId) {
            activeLedgerAccount = null;
            window.switchTab('debts', false);
        }
        window.renderDebts();
    };

    window.openAccountLedgerDetail = function(accId) {
        let all = [...(debts.customers || []), ...(debts.suppliers || [])];
        activeLedgerAccount = all.find(a => a.id === accId);
        if (!activeLedgerAccount) return;
        window.switchTab('accountLedgerDetail', true);
        window.renderLedgerDetailView();
    };

    window.calcAccountBalances = function(acc) {
        let totalDebit = 0, totalCredit = 0;
        (acc.transactions || []).forEach(tx => {
            let a = parseFloat(tx.amount) || 0;
            if (tx.type === 'debit') totalDebit += a;
            else if (tx.type === 'credit' || tx.type === 'settle') totalCredit += a;
        });
        return { totalDebit, totalCredit, net: totalDebit - totalCredit };
    };

    window.isSupplierDebtAccount = function(acc) {
        if (!acc) return false;
        if (acc.type === 'supplier') return true;
        const accountId = String(acc.id || '');
        return (debts.suppliers || []).some(item => String(item?.id || '') === accountId);
    };

    window.renderLedgerDetailView = function() {
        if (!activeLedgerAccount) return;
        const acc = activeLedgerAccount;
        const b = window.calcAccountBalances(acc);
        const isSupplier = window.isSupplierDebtAccount(acc);

        document.getElementById('ledgerDetailAccountName').innerText = acc.name;
        document.getElementById('ledgerDetailAccountPhone').innerText = acc.phone || 'بدون هاتف';
        document.getElementById('ledgerLabelTotalDebit').innerText = isSupplier ? 'إجمالي له (دين)' : 'إجمالي عليه (دين)';
        document.getElementById('ledgerLabelTotalCredit').innerText = isSupplier ? 'إجمالي لنا (مسدد)' : 'إجمالي له (مسدد)';
        document.getElementById('btnLedgerAddDebit').innerText = isSupplier ? '+ تسجيل دين جديد (له)' : '+ إضافة دين (عليه)';
        document.getElementById('btnLedgerAddCredit').innerText = isSupplier ? 'تسجيل سداد (لنا)' : 'تسجيل استلام من العميل';
        document.getElementById('ledgerValTotalDebit').innerText = b.totalDebit.toFixed(2);
        document.getElementById('ledgerValTotalCredit').innerText = b.totalCredit.toFixed(2);
        document.getElementById('ledgerValNetBalance').innerText = b.net.toFixed(2);

        const container = document.getElementById('accountTransactionsTimelineContainer');
        const txs = acc.transactions || [];

        if (txs.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:35px; font-weight:700;">لا توجد حركات مسجلة بعد في هذا الحساب</div>';
            return;
        }

        container.innerHTML = txs.map(tx => {
            let isDebit = tx.type === 'debit';
            let isSettle = tx.type === 'settle';
            let dateStr = new Date(tx.created_at || Date.now()).toLocaleString('ar-LY-u-nu-latn', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
            return `
                <div class="debt-tx-item" onclick="window.openTxDetailModal('${tx.id}')">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div class="prod-box-badge" style="width:28px; height:28px; border-color:${isDebit ? 'var(--red)' : 'var(--green)'}; color:${isDebit ? 'var(--red)' : 'var(--green)'}; font-size:10px; font-weight:900;">
                            ${isDebit ? 'دين' : (isSupplier ? 'سداد' : 'قبض')}
                        </div>
                        <div>
                            <b style="color:#FFF; font-size:12px;">${isDebit ? (isSupplier ? 'دين له' : 'دين عليه') : (isSettle ? 'تصفية كاملة' : (isSupplier ? 'سداد لنا' : 'سند قبض (دفعة)'))}</b>
                            <div style="font-size:10px; color:var(--text-muted);">${window.escapeHtml(tx.notes || (tx.invoiceCode || 'حركة نقدية'))} (${window.escapeHtml(dateStr)})</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <strong style="color:${isDebit ? 'var(--red)' : 'var(--green)'}; font-size:13px;">${isDebit ? '+' : '-'}${Number(tx.amount).toFixed(2)}</strong>
                        <span style="color:var(--text-muted); font-size:12px;">‹</span>
                    </div>
                </div>
            `;
        }).join('');
    };

    // نافذة تفاصيل الحركة وإرسال إيصال واتساب مع حساب المتبقي أو الحذف
    window.openTxDetailModal = function(txId) {
        if (!activeLedgerAccount) return;
        const tx = (activeLedgerAccount.transactions || []).find(t => t.id === txId);
        if (!tx) return;

        activeTxForDetail = tx;
        const b = window.calcAccountBalances(activeLedgerAccount);
        const isDebit = tx.type === 'debit';
        const isSettle = tx.type === 'settle';
        const isSupplier = window.isSupplierDebtAccount(activeLedgerAccount);
        const dateStr = new Date(tx.created_at || Date.now()).toLocaleString('ar-LY-u-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

        document.getElementById('txDetailModalTitle').innerText = isDebit ? 'تفاصيل قيد الدين' : 'تفاصيل سند القبض والسداد';
        document.getElementById('txDetailModalBody').innerHTML = `
            <div style="margin-bottom:6px;"><b>الطرف:</b> <span style="color:var(--accent-teal);">${window.escapeHtml(activeLedgerAccount.name)}</span></div>
            <div style="margin-bottom:6px;"><b>نوع الحركة:</b> <span style="color:${isDebit ? 'var(--red)' : 'var(--green)'}; font-weight:800;">${isDebit ? (isSupplier ? 'دين جديد (له)' : 'دين جديد (عليه)') : (isSettle ? 'تصفية حساب كاملة' : (isSupplier ? 'سداد (لنا)' : 'سند قبض / سداد (له)'))}</span></div>
            <div style="margin-bottom:6px;"><b>المبلغ:</b> <span style="color:#FFF; font-weight:900; font-size:14px;">${Number(tx.amount).toFixed(2)}</span></div>
            <div style="margin-bottom:6px;"><b>التاريخ والساعة:</b> <span>${dateStr}</span></div>
            <div style="margin-bottom:6px;"><b>ملاحظات / السند:</b> <span>${window.escapeHtml(tx.notes || (tx.invoiceCode || 'بدون ملاحظات'))}</span></div>
            <div style="border-top:1px dashed var(--border); padding-top:6px; margin-top:6px; color:var(--primary); font-weight:800;">
                <b>${isDebit ? (isSupplier ? 'إجمالي الدين الحالي له:' : 'إجمالي الدين الحالي:') : (isSupplier ? 'الرصيد المتبقي له:' : 'الرصيد المتبقي عليه:')}</b> <span>${b.net.toFixed(2)}</span>
            </div>
        `;

        document.getElementById('txDetailModal').style.display = 'flex';
    };

    // V178: بناء نص موحد ورسمي للحركة، مع رصيد الحركة وقت تسجيلها لا الرصيد الحالي بعد حركات لاحقة.
    window.getDebtBalanceAfterTransaction = function(acc, targetTx) {
        const targetId = String(targetTx?.id || '');
        const rows = [...(acc?.transactions || [])].sort((a, b) => {
            const da = new Date(a?.created_at || 0).getTime();
            const db = new Date(b?.created_at || 0).getTime();
            if (da !== db) return da - db;
            return String(a?.id || '').localeCompare(String(b?.id || ''));
        });
        let balance = 0;
        let found = false;
        for (const row of rows) {
            const amount = Math.max(0, Number(row?.amount || 0));
            if (row?.type === 'debit') balance += amount;
            else if (row?.type === 'credit' || row?.type === 'settle') balance -= amount;
            if (String(row?.id || '') === targetId) { found = true; break; }
        }
        if (!found) balance = Number(window.calcAccountBalances(acc)?.net || 0);
        return Math.max(0, balance);
    };

    window.formatDebtShareMoney = function(value) {
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, Number(value || 0)));
    };

    window.formatDebtShareDateTime = function(value) {
        const d = new Date(value || Date.now());
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const time = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
        return { date: `${dd}-${mm}-${yyyy}`, time };
    };

    window.buildDebtTransactionShareData = function(tx, acc) {
        if (!tx || !acc) return null;
        const isDebit = tx.type === 'debit';
        const isSettle = tx.type === 'settle';
        const isSupplier = window.isSupplierDebtAccount(acc);
        const currency = String(window.getCurrencySymbol?.() || 'د.ل');
        const amountNumber = Math.max(0, Number(tx.amount || 0));
        const balanceNumber = window.getDebtBalanceAfterTransaction(acc, tx);
        const amountText = `${window.formatDebtShareMoney(amountNumber)} ${currency}`;
        const balanceText = `${window.formatDebtShareMoney(balanceNumber)} ${currency}`;
        const dt = window.formatDebtShareDateTime(tx.created_at);
        const detailsText = String(tx.notes || tx.invoiceCode || 'بدون بيان').trim() || 'بدون بيان';
        const profile = (typeof window.getStoreProfile === 'function') ? window.getStoreProfile() : {};
        const storeName = String(profile?.storeName || currentTeam?.name || 'ADT Stock').trim() || 'ADT Stock';
        const customerName = String(acc.name || 'العميل').trim() || 'العميل';
        const isPaidOff = !isDebit && balanceNumber <= 0.005;
        let title = '';
        let intro = '';
        let balanceLabel = '';
        let text = '';

        if (!isSupplier && isDebit) {
            title = 'إشعار دين جديد';
            intro = `تم تسجيل دين جديد بقيمة ${amountText}.`;
            balanceLabel = 'إجمالي المبلغ عليك';
            text = `مرحباً ${customerName}\n\n${intro}\n\n• التاريخ: ${dt.date} | ${dt.time}\n• التفاصيل: ${detailsText}\n• ${balanceLabel}: ${balanceText}\n\nشكراً لتعاملك معنا!`;
        } else if (!isSupplier) {
            title = isPaidOff ? 'سند قبض - الحساب خالص' : 'سند قبض';
            intro = isPaidOff
                ? `تم استلام مبلغ ${amountText} والحساب خالص.`
                : `تم استلام مبلغ ${amountText} وسداد جزء من الدين السابق.`;
            balanceLabel = 'المتبقي عليك';
            text = `مرحباً ${customerName}\n\n${intro}\n\n• التاريخ: ${dt.date} | ${dt.time}\n• التفاصيل: ${detailsText}\n• ${balanceLabel}: ${balanceText}\n\nشكراً لتعاملك معنا!`;
        } else if (isDebit) {
            title = 'إشعار دين للمورد';
            intro = `تم تسجيل دين جديد للمورد بقيمة ${amountText}.`;
            balanceLabel = 'إجمالي الدين الحالي له';
            text = `مرحباً ${customerName}\n\n${intro}\n\n• التاريخ: ${dt.date} | ${dt.time}\n• التفاصيل: ${detailsText}\n• ${balanceLabel}: ${balanceText}\n\nشكراً لتعاملك معنا!`;
        } else {
            title = isPaidOff ? 'سداد للمورد - الحساب خالص' : 'سداد للمورد';
            intro = isPaidOff
                ? `تم تسجيل سداد بقيمة ${amountText} والحساب خالص.`
                : `تم تسجيل سداد بقيمة ${amountText}.`;
            balanceLabel = 'الرصيد المتبقي له';
            text = `مرحباً ${customerName}\n\n${intro}\n\n• التاريخ: ${dt.date} | ${dt.time}\n• التفاصيل: ${detailsText}\n• ${balanceLabel}: ${balanceText}\n\nشكراً لتعاملك معنا!`;
        }

        return {
            tx, acc, isDebit, isSettle, isSupplier, isPaidOff, currency,
            amountNumber, balanceNumber, amountText, balanceText,
            date: dt.date, time: dt.time, detailsText, storeName, customerName,
            title, intro, balanceLabel, text
        };
    };

    window.sharePlainTextFromApp = async function(text, title) {
        if (window.Android && typeof window.Android.shareText === 'function') {
            window.Android.shareText(String(text || ''), String(title || 'ADT Stock'));
            return;
        }
        if (navigator.share) {
            try { await navigator.share({ title: String(title || 'ADT Stock'), text: String(text || '') }); return; }
            catch (e) { if (e?.name === 'AbortError') return; }
        }
        try {
            await navigator.clipboard.writeText(String(text || ''));
            window.showToast('تم نسخ الرسالة — الصقها في التطبيق المطلوب');
        } catch (_) {
            window.customAlert('تعذر فتح المشاركة', 'تعذر فتح نافذة المشاركة على هذا الجهاز.');
        }
    };

    window.executeShareTxTextFromDetail = async function() {
        if (!activeTxForDetail || !activeLedgerAccount) return;
        const data = window.buildDebtTransactionShareData(activeTxForDetail, activeLedgerAccount);
        if (!data) return;
        await window.sharePlainTextFromApp(data.text, data.title);
    };

    window.__adtReceiptRoundRect = function(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    };

    window.__adtReceiptWrapRtl = function(ctx, text, rightX, startY, maxWidth, lineHeight, maxLines) {
        const words = String(text || '').split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width <= maxWidth || !line) line = test;
            else { lines.push(line); line = word; }
        }
        if (line) lines.push(line);
        const limited = lines.slice(0, Math.max(1, maxLines || 4));
        if (lines.length > limited.length && limited.length) limited[limited.length - 1] += '…';
        limited.forEach((ln, idx) => ctx.fillText(ln, rightX, startY + idx * lineHeight));
        return startY + limited.length * lineHeight;
    };

    window.createDebtReceiptCanvas = function(data) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1420;
        const ctx = canvas.getContext('2d');
        const teal = '#009d8b';
        const dark = '#10202b';
        const muted = '#687781';
        const border = '#d9e2e7';
        const soft = '#f5f8f9';
        const amountBg = data.isDebit ? '#fff4f3' : '#eefbf7';
        const amountBorder = data.isDebit ? '#e96d63' : '#38aa8d';
        const balanceBg = data.isPaidOff ? '#edf9f1' : '#fff8e8';
        const balanceBorder = data.isPaidOff ? '#5aaa70' : '#d5a344';
        const margin = 74;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';

        // هوية ADT Stock / المحل
        ctx.fillStyle = teal;
        ctx.font = '900 34px Cairo, Arial, sans-serif';
        ctx.fillText('ADT Stock', canvas.width - margin, 82);
        ctx.fillStyle = dark;
        ctx.font = '800 29px Cairo, Arial, sans-serif';
        ctx.fillText(data.storeName, canvas.width - margin, 128);
        ctx.fillStyle = muted;
        ctx.font = '500 21px Cairo, Arial, sans-serif';
        ctx.fillText(`${data.date}  ${data.time}`, canvas.width - margin, 164);

        ctx.strokeStyle = teal;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(margin, 198);
        ctx.lineTo(canvas.width - margin, 198);
        ctx.stroke();

        // رقم مرجعي مبسط من رقم الحركة
        const ref = String(data.tx?.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase() || 'ADT';
        ctx.fillStyle = muted;
        ctx.font = '600 20px Cairo, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`الرقم: ${ref}`, margin, 250);
        ctx.textAlign = 'right';
        ctx.fillText(`التاريخ والوقت: ${data.date} | ${data.time}`, canvas.width - margin, 250);

        // عنوان السند
        const titleW = 420, titleH = 86, titleX = (canvas.width - titleW) / 2, titleY = 305;
        window.__adtReceiptRoundRect(ctx, titleX, titleY, titleW, titleH, 24);
        ctx.fillStyle = soft;
        ctx.fill();
        ctx.strokeStyle = border;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = dark;
        ctx.font = '900 38px Cairo, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(data.title, canvas.width / 2, titleY + 56);

        // العميل
        ctx.textAlign = 'right';
        ctx.fillStyle = muted;
        ctx.font = '600 24px Cairo, Arial, sans-serif';
        ctx.fillText(data.isSupplier ? 'المورد' : 'العميل', canvas.width - margin, 455);
        ctx.fillStyle = dark;
        ctx.font = '900 36px Cairo, Arial, sans-serif';
        window.__adtReceiptWrapRtl(ctx, data.customerName, canvas.width - margin, 503, 700, 46, 2);

        // المبلغ
        window.__adtReceiptRoundRect(ctx, margin, 575, canvas.width - margin * 2, 180, 28);
        ctx.fillStyle = amountBg;
        ctx.fill();
        ctx.strokeStyle = amountBorder;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = muted;
        ctx.font = '700 24px Cairo, Arial, sans-serif';
        ctx.fillText(data.isDebit ? 'قيمة الدين الجديد' : 'المبلغ المستلم', canvas.width - margin - 32, 625);
        ctx.fillStyle = dark;
        ctx.font = '900 56px Cairo, Arial, sans-serif';
        ctx.fillText(data.amountText, canvas.width - margin - 32, 704);

        // وصف الحركة
        ctx.fillStyle = dark;
        ctx.font = '700 28px Cairo, Arial, sans-serif';
        window.__adtReceiptWrapRtl(ctx, data.intro, canvas.width - margin, 825, canvas.width - margin * 2, 45, 3);

        // التفاصيل
        ctx.fillStyle = muted;
        ctx.font = '700 23px Cairo, Arial, sans-serif';
        ctx.fillText('التفاصيل:', canvas.width - margin, 940);
        ctx.fillStyle = dark;
        ctx.font = '600 25px Cairo, Arial, sans-serif';
        window.__adtReceiptWrapRtl(ctx, data.detailsText, canvas.width - margin, 980, canvas.width - margin * 2, 40, 3);

        // الرصيد
        window.__adtReceiptRoundRect(ctx, margin, 1080, canvas.width - margin * 2, 105, 22);
        ctx.fillStyle = balanceBg;
        ctx.fill();
        ctx.strokeStyle = balanceBorder;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = dark;
        ctx.font = '800 25px Cairo, Arial, sans-serif';
        ctx.fillText(`${data.balanceLabel}:`, canvas.width - margin - 24, 1145);
        ctx.fillStyle = data.isPaidOff ? '#2f8b54' : '#a67519';
        ctx.font = '900 29px Cairo, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(data.balanceText, margin + 24, 1145);

        // التوقيع
        ctx.textAlign = 'right';
        ctx.fillStyle = dark;
        ctx.font = '800 24px Cairo, Arial, sans-serif';
        ctx.fillText('توقيع المحاسب / المؤسسة', canvas.width - margin, 1260);
        ctx.strokeStyle = '#8b969d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvas.width - margin - 310, 1302);
        ctx.lineTo(canvas.width - margin, 1302);
        ctx.stroke();

        ctx.fillStyle = muted;
        ctx.font = '500 18px Cairo, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('تم إنشاء هذا الإشعار عبر ADT Stock', canvas.width / 2, 1375);
        return canvas;
    };

    window.shareDebtReceiptImage = async function(data) {
        const canvas = window.createDebtReceiptCanvas(data);
        const fileName = `ADT_Stock_${data.isDebit ? 'Debt' : 'Receipt'}_${String(data.tx?.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g,'_')}.png`;
        const dataUrl = canvas.toDataURL('image/png', 1);
        const base64 = String(dataUrl).split(',')[1] || '';

        if (window.Android && typeof window.Android.shareImageBase64 === 'function') {
            window.Android.shareImageBase64(base64, fileName);
            window.showToast('تم تجهيز الصورة — اختر التطبيق للمشاركة');
            return;
        }

        const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('IMAGE_BLOB_FAILED')), 'image/png', 1));
        const file = new File([blob], fileName, { type:'image/png' });
        if (navigator.canShare && navigator.canShare({ files:[file] })) {
            await navigator.share({ files:[file], title:data.title, text:data.storeName });
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        window.showToast('تم إنشاء صورة الإشعار');
    };

    window.executeShareTxImageFromDetail = async function() {
        if (!activeTxForDetail || !activeLedgerAccount || window.__adtDebtReceiptShareBusy) return;
        const data = window.buildDebtTransactionShareData(activeTxForDetail, activeLedgerAccount);
        if (!data) return;
        window.__adtDebtReceiptShareBusy = true;
        try {
            window.showToast('جاري تجهيز صورة الإشعار...');
            await window.shareDebtReceiptImage(data);
        } catch (e) {
            if (e?.name !== 'AbortError') {
                console.error('[Debt Receipt Image] failed:', e);
                window.customAlert('تعذر مشاركة الصورة', 'حدث خطأ أثناء تجهيز صورة الإشعار. حاول مرة أخرى.');
            }
        } finally {
            window.__adtDebtReceiptShareBusy = false;
        }
    };

    // توافق مع أي زر قديم بقي في نسخة مخزنة: بدلاً من واتساب افتح المشاركة العامة للنص.
    window.executeShareTxWhatsAppFromDetail = window.executeShareTxTextFromDetail;

    window.promptDeleteTransactionFromDetail = function() {
        if (!window.canEditDebts()) {
            window.customAlert('صلاحية مقفلة', 'ليس لديك صلاحية لحذف الحركات.');
            return;
        }
        if (!activeTxForDetail) return;
        pendingTxDeleteId = activeTxForDetail.id;
        window.closeModal('txDetailModal');
        document.getElementById('txDeleteConfirmModal').style.display = 'flex';
    };

    window.openAddTransactionModal = function(type) {
        if (!window.canEditDebts()) {
            window.customAlert('صلاحية مقفلة', 'ليس لديك صلاحية لإضافة حركات مالية.');
            return;
        }
        currentTxType = type;
        const isSupplier = window.isSupplierDebtAccount(activeLedgerAccount);
        document.getElementById('txAmountInput').value = '';
        document.getElementById('txInvoiceCodeInput').value = '';
        document.getElementById('txNotesInput').value = '';
        document.getElementById('addTransactionModalTitle').innerText = (type === 'debit')
            ? (isSupplier ? 'تسجيل دين جديد (له)' : 'تسجيل دين جديد (عليه)')
            : (isSupplier ? 'تسجيل سداد (لنا)' : 'تسجيل سند قبض / دفعة (له)');
        document.getElementById('addTransactionModal').style.display = 'flex';
        setTimeout(() => document.getElementById('txAmountInput')?.focus(), 150);
    };

    window.saveAccountTransaction = async function() {
        if (!(await window.confirmGhostMutation('إضافة حركة مالية'))) return;
        if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) {
            window.customAlert('لا يوجد اتصال بالخادم', 'تعذر الحفظ لأن الاتصال بالخادم غير متاح. يمكنك مشاهدة آخر نسخة محفوظة، لكن التعديل يحتاج اتصالاً حتى لا تضيع البيانات.');
            return;
        }

        if (!activeLedgerAccount) return;
        const amount = parseFloat(document.getElementById('txAmountInput').value) || 0;
        const invoiceCode = document.getElementById('txInvoiceCodeInput').value.trim();
        const notes = document.getElementById('txNotesInput').value.trim();
        if (amount <= 0) { window.customAlert('بيانات ناقصة', 'أدخل المبلغ.'); return; }

        const newTx = { id: 'tx_' + Date.now(), type: currentTxType, amount, invoiceCode, notes, created_at: new Date().toISOString() };
        const nextTransactions = [newTx, ...(activeLedgerAccount.transactions || [])];
        const previewAccount = { ...activeLedgerAccount, transactions: nextTransactions };
        const b = window.calcAccountBalances(previewAccount);

        if ((dbClient || window.isDeveloperOffline()) && currentTeam) {
            const { data: debtUpdateOk, error } = await window.developerOfflineRpc('adt_debt_update_ledger', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId(), p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null), p_debt_id: String(activeLedgerAccount.id), p_amount: b.net, p_transactions: nextTransactions
            });
            if (error || debtUpdateOk !== true) {
                console.error('[Debts Sync] Transaction save failed:', error);
                window.customAlert('تعذر تسجيل الحركة', 'لم يتم حفظ الحركة على الخادم، لذلك لم تتغير البيانات المحلية.\n\nالسبب: ' + (error.message || 'خطأ غير معروف'));
                return;
            }
        }

        activeLedgerAccount.transactions = nextTransactions;
        activeLedgerAccount.amount = b.net;
        window.saveTeamCache('atd_sales_debts_v17', debts);
        window.closeModal('addTransactionModal');
        window.showToast('تم تسجيل الحركة بنجاح');
        window.renderLedgerDetailView();
    };

    window.promptSettleAccountAction = function() {
        if (!window.canEditDebts()) {
            window.customAlert('صلاحية مقفلة', 'ليس لديك صلاحية لتصفية الحساب.');
            return;
        }
        if (!activeLedgerAccount) return;
        let b = window.calcAccountBalances(activeLedgerAccount);
        if (b.net <= 0) { window.customAlert('الحساب خالص', 'الرصيد خالص بالفعل.'); return; }
        document.getElementById('settleAccountPromptMsg').innerText = `سيتم تسجيل سداد للمبلغ بالكامل (${b.net.toFixed(2)}) وتصفير الحساب.`;
        document.getElementById('settleAccountCustomModal').style.display = 'flex';
    };

    window.executeConfirmedAccountSettle = async function() {
        if (!(await window.confirmGhostMutation('تصفية الحساب بالكامل'))) return;
        if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) {
            window.customAlert('لا يوجد اتصال بالخادم', 'تعذر الحفظ لأن الاتصال بالخادم غير متاح. يمكنك مشاهدة آخر نسخة محفوظة، لكن التعديل يحتاج اتصالاً حتى لا تضيع البيانات.');
            return;
        }

        if (!activeLedgerAccount) return;
        const b = window.calcAccountBalances(activeLedgerAccount);
        const settleTx = { id: 'tx_settle_' + Date.now(), type: 'settle', amount: b.net, notes: 'تصفية الحساب بالكامل', created_at: new Date().toISOString() };
        const nextTransactions = [settleTx, ...(activeLedgerAccount.transactions || [])];

        if ((dbClient || window.isDeveloperOffline()) && currentTeam) {
            const { data: debtSettleOk, error } = await window.developerOfflineRpc('adt_debt_update_ledger', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId(), p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null), p_debt_id: String(activeLedgerAccount.id), p_amount: 0, p_transactions: nextTransactions
            });
            if (error || debtSettleOk !== true) {
                console.error('[Debts Sync] Settle failed:', error);
                window.customAlert('تعذر تصفية الحساب', 'لم يتم حفظ التصفية على الخادم، لذلك لم تتغير البيانات المحلية.\n\nالسبب: ' + (error.message || 'خطأ غير معروف'));
                return;
            }
        }
        activeLedgerAccount.transactions = nextTransactions;
        activeLedgerAccount.amount = 0;
        window.saveTeamCache('atd_sales_debts_v17', debts);
        window.closeModal('settleAccountCustomModal');
        window.showToast('تمت تصفية الحساب بنجاح');
        window.renderLedgerDetailView();
    };

    window.promptDeleteTransaction = function(txId) {
        pendingTxDeleteId = txId;
        document.getElementById('txDeleteConfirmModal').style.display = 'flex';
    };

    window.executeDeleteTransactionConfirmed = async function() {
        if (!(await window.confirmGhostMutation('حذف حركة مالية'))) return;
        if ((!dbClient || !currentTeam) && !window.isDeveloperOffline()) {
            window.customAlert('لا يوجد اتصال بالخادم', 'تعذر الحفظ لأن الاتصال بالخادم غير متاح. يمكنك مشاهدة آخر نسخة محفوظة، لكن التعديل يحتاج اتصالاً حتى لا تضيع البيانات.');
            return;
        }

        if (!activeLedgerAccount || !pendingTxDeleteId) return;
        const nextTransactions = (activeLedgerAccount.transactions || []).filter(t => t.id !== pendingTxDeleteId);
        const previewAccount = { ...activeLedgerAccount, transactions: nextTransactions };
        const b = window.calcAccountBalances(previewAccount);

        if ((dbClient || window.isDeveloperOffline()) && currentTeam) {
            const { data: debtUpdateOk, error } = await window.developerOfflineRpc('adt_debt_update_ledger', {
                p_team_id: String(currentTeam.id), p_user_id: getDeviceId(), p_dev_pin: (isGhostMode ? (developerSessionPin || null) : null), p_debt_id: String(activeLedgerAccount.id), p_amount: b.net, p_transactions: nextTransactions
            });
            if (error || debtUpdateOk !== true) {
                console.error('[Debts Sync] Transaction delete failed:', error);
                window.customAlert('تعذر حذف الحركة', 'لم يتم حذف الحركة من الخادم، لذلك أبقيناها محلياً.\n\nالسبب: ' + (error.message || 'خطأ غير معروف'));
                return;
            }
        }
        activeLedgerAccount.transactions = nextTransactions;
        activeLedgerAccount.amount = b.net;
        window.saveTeamCache('atd_sales_debts_v17', debts);
        window.closeModal('txDeleteConfirmModal');
        window.showToast('تم حذف الحركة');
        pendingTxDeleteId = null;
        window.renderLedgerDetailView();
    };

    window.createLedgerStatementPdf = function(acc) {
        if (!acc) throw new Error('LEDGER_ACCOUNT_REQUIRED');

        const balances = window.calcAccountBalances(acc);
        const isSupplier = window.isSupplierDebtAccount(acc);
        const storeName = String(currentTeam?.name || 'المحل');
        const currency = String(window.getCurrencySymbol?.() || 'د.ل');
        const sourceTransactions = Array.isArray(acc.transactions) ? acc.transactions : [];
        let runningBalance = 0;

        const transactions = sourceTransactions
            .map((tx, sourceIndex) => ({
                ...tx,
                sourceIndex,
                timestamp: new Date(tx.created_at || 0).getTime() || 0
            }))
            .sort((first, second) => (first.timestamp - second.timestamp) || (first.sourceIndex - second.sourceIndex))
            .map((tx, index) => {
                const amount = Number(tx.amount || 0);
                const isDebit = tx.type === 'debit';
                const isSettle = tx.type === 'settle';
                const debit = isDebit ? amount : 0;
                const credit = isDebit ? 0 : amount;
                runningBalance += debit - credit;

                const typeLabel = isDebit ? (isSupplier ? 'دين له' : 'دين عليه') : (isSettle ? 'تصفية الحساب' : (isSupplier ? 'سداد لنا' : 'سند قبض'));
                const detailParts = [typeLabel];
                if (tx.invoiceCode) detailParts.push('المرجع: ' + tx.invoiceCode);
                if (tx.notes) detailParts.push(tx.notes);
                const txDate = new Date(tx.created_at || Date.now());

                return {
                    number: index + 1,
                    debit,
                    credit,
                    balance: runningBalance,
                    details: detailParts.join(' — '),
                    date: txDate.toLocaleDateString('ar-LY'),
                    time: txDate.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })
                };
            });

        const pageWidth = 1240;
        const pageHeight = 1754;
        const margin = 65;
        const rowsPerPage = 13;
        const rowHeight = 88;
        const tableTop = 440;
        const tableHeaderHeight = 65;
        const columns = [160, 145, 145, 360, 205, 95];
        const columnLabels = ['الرصيد', 'المسدد', 'الدين', 'البيان', 'التاريخ', '#'];
        const pageCount = Math.max(1, Math.ceil(transactions.length / rowsPerPage));
        const pages = [];

        const fitText = function(ctx, value, maxWidth) {
            const original = String(value || '');
            if (ctx.measureText(original).width <= maxWidth) return original;
            let text = original;
            while (text.length > 2 && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
            return text + '…';
        };

        const wrapText = function(ctx, value, maxWidth, maxLines) {
            const words = String(value || '').split(' ').filter(Boolean);
            const lines = [];
            let line = '';
            while (words.length && lines.length < maxLines) {
                const word = words.shift();
                const candidate = line ? line + ' ' + word : word;
                if (ctx.measureText(candidate).width <= maxWidth) {
                    line = candidate;
                } else {
                    if (line) lines.push(line);
                    line = word;
                }
            }
            if (line && lines.length < maxLines) lines.push(line);
            if (words.length && lines.length) lines[lines.length - 1] = fitText(ctx, lines[lines.length - 1] + ' ' + words.join(' '), maxWidth);
            return lines.length ? lines : ['—'];
        };

        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
            const canvas = document.createElement('canvas');
            canvas.width = pageWidth;
            canvas.height = pageHeight;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pageWidth, pageHeight);
            ctx.direction = 'rtl';

            ctx.fillStyle = '#07131f';
            ctx.fillRect(0, 0, pageWidth, 180);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 40px Cairo, sans-serif';
            ctx.fillText('كشف حساب تفصيلي', pageWidth - margin, 65);
            ctx.fillStyle = '#d2d9df';
            ctx.font = '700 20px Cairo, sans-serif';
            ctx.fillText(storeName, pageWidth - margin, 108);
            ctx.fillStyle = '#16cdb4';
            ctx.font = '800 17px Cairo, sans-serif';
            ctx.fillText('جميع الحركات المالية المسجلة', pageWidth - margin, 145);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#d2d9df';
            ctx.font = '700 16px Cairo, sans-serif';
            ctx.fillText('صفحة ' + (pageIndex + 1) + ' من ' + pageCount, margin, 75);
            ctx.fillText('تاريخ الإصدار: ' + new Date().toLocaleString('ar-LY'), margin, 112);

            ctx.fillStyle = '#f4f6f8';
            ctx.fillRect(margin, 205, pageWidth - (margin * 2), 100);
            ctx.fillStyle = '#111827';
            ctx.textAlign = 'right';
            ctx.font = '900 22px Cairo, sans-serif';
            ctx.fillText('الحساب: ' + String(acc.name || 'بدون اسم'), pageWidth - margin - 20, 245);
            ctx.font = '700 17px Cairo, sans-serif';
            ctx.fillStyle = '#4b5563';
            ctx.fillText('الهاتف: ' + String(acc.phone || 'غير مسجل'), pageWidth - margin - 20, 278);
            ctx.textAlign = 'left';
            ctx.fillText('عدد الحركات: ' + transactions.length, margin + 20, 245);
            ctx.fillText('العملة: ' + currency, margin + 20, 278);

            const summaryTop = 325;
            const summaryWidth = (pageWidth - (margin * 2) - 20) / 3;
            const summaryItems = [
                { label: 'إجمالي الدين', value: balances.totalDebit, color: '#dc3545' },
                { label: 'إجمالي المسدد', value: balances.totalCredit, color: '#198754' },
                { label: 'الرصيد المتبقي', value: balances.net, color: '#0aa58f' }
            ];
            summaryItems.forEach((item, index) => {
                const x = margin + (index * (summaryWidth + 10));
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(x, summaryTop, summaryWidth, 85);
                ctx.strokeStyle = '#d9e1e8';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, summaryTop, summaryWidth, 85);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#4b5563';
                ctx.font = '800 15px Cairo, sans-serif';
                ctx.fillText(item.label, x + (summaryWidth / 2), summaryTop + 29);
                ctx.fillStyle = item.color;
                ctx.font = '900 22px Cairo, sans-serif';
                ctx.fillText(Number(item.value || 0).toFixed(2) + ' ' + currency, x + (summaryWidth / 2), summaryTop + 63);
            });

            ctx.fillStyle = '#dfe5ea';
            ctx.fillRect(margin, tableTop, pageWidth - (margin * 2), tableHeaderHeight);
            ctx.strokeStyle = '#20262d';
            ctx.lineWidth = 2;
            ctx.strokeRect(margin, tableTop, pageWidth - (margin * 2), tableHeaderHeight);
            let headerX = margin;
            ctx.fillStyle = '#111827';
            ctx.textAlign = 'center';
            ctx.font = '900 17px Cairo, sans-serif';
            columnLabels.forEach((label, columnIndex) => {
                ctx.fillText(label, headerX + (columns[columnIndex] / 2), tableTop + 41);
                headerX += columns[columnIndex];
                if (columnIndex < columns.length - 1) {
                    ctx.beginPath();
                    ctx.moveTo(headerX, tableTop);
                    ctx.lineTo(headerX, tableTop + tableHeaderHeight);
                    ctx.stroke();
                }
            });

            const pageRows = transactions.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
            if (!pageRows.length) {
                ctx.textAlign = 'center';
                ctx.fillStyle = '#6b7280';
                ctx.font = '800 24px Cairo, sans-serif';
                ctx.fillText('لا توجد حركات مالية مسجلة في هذا الحساب', pageWidth / 2, tableTop + 180);
            }

            pageRows.forEach((row, rowIndex) => {
                const rowY = tableTop + tableHeaderHeight + (rowIndex * rowHeight);
                if (rowIndex % 2 === 1) {
                    ctx.fillStyle = '#f8fafc';
                    ctx.fillRect(margin, rowY, pageWidth - (margin * 2), rowHeight);
                }
                ctx.strokeStyle = '#c7cfd8';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(margin, rowY, pageWidth - (margin * 2), rowHeight);

                let x = margin;
                const centers = [];
                columns.forEach((width, columnIndex) => {
                    centers.push(x + (width / 2));
                    x += width;
                    if (columnIndex < columns.length - 1) {
                        ctx.beginPath();
                        ctx.moveTo(x, rowY);
                        ctx.lineTo(x, rowY + rowHeight);
                        ctx.stroke();
                    }
                });

                ctx.textAlign = 'center';
                ctx.font = '800 16px Cairo, sans-serif';
                ctx.fillStyle = row.balance > 0 ? '#0a8f7c' : (row.balance < 0 ? '#7c3aed' : '#374151');
                ctx.fillText(row.balance.toFixed(2), centers[0], rowY + 53);
                ctx.fillStyle = '#198754';
                ctx.fillText(row.credit ? row.credit.toFixed(2) : '—', centers[1], rowY + 53);
                ctx.fillStyle = '#dc3545';
                ctx.fillText(row.debit ? row.debit.toFixed(2) : '—', centers[2], rowY + 53);

                ctx.direction = 'rtl';
                ctx.textAlign = 'right';
                ctx.fillStyle = '#111827';
                ctx.font = '700 15px Cairo, sans-serif';
                const detailLines = wrapText(ctx, row.details, columns[3] - 24, 2);
                detailLines.forEach((line, lineIndex) => ctx.fillText(line, margin + columns[0] + columns[1] + columns[2] + columns[3] - 12, rowY + 33 + (lineIndex * 25)));

                ctx.textAlign = 'center';
                ctx.fillStyle = '#374151';
                ctx.font = '700 15px Cairo, sans-serif';
                ctx.fillText(row.date, centers[4], rowY + 34);
                ctx.font = '600 13px Cairo, sans-serif';
                ctx.fillStyle = '#6b7280';
                ctx.fillText(row.time, centers[4], rowY + 61);
                ctx.fillStyle = '#111827';
                ctx.font = '900 16px Cairo, sans-serif';
                ctx.fillText(String(row.number), centers[5], rowY + 53);
            });

            ctx.strokeStyle = '#d1d5db';
            ctx.beginPath();
            ctx.moveTo(margin, pageHeight - 92);
            ctx.lineTo(pageWidth - margin, pageHeight - 92);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#8a949e';
            ctx.font = '700 14px Cairo, sans-serif';
            ctx.fillText('كشف صادر من منظومة ADT Stock — يحتوي على جميع الحركات المسجلة حتى وقت الإصدار', pageWidth / 2, pageHeight - 52);
            pages.push(canvas);
        }

        const safeAccountName = String(acc.name || 'حساب')
            .split(' ').join('_')
            .replace(/[\/:*?"<>|]/g, '_')
            .slice(0, 45);
        const fileName = 'كشف_حساب_' + safeAccountName + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
        return {
            pdfBlob: createPurePdfBlobFromCanvases(pages),
            fileName,
            balances,
            transactionCount: transactions.length
        };
    };

    window.shareLedgerStatementPdf = async function() {
        if (!activeLedgerAccount || window.__adtLedgerPdfBusy) return;
        window.__adtLedgerPdfBusy = true;
        const acc = activeLedgerAccount;
        const shareButton = document.getElementById('btnShareLedgerStatement');
        const buttonLabel = shareButton?.querySelector('span');
        const originalLabel = buttonLabel?.textContent || 'مشاركة كشف PDF';
        if (shareButton) shareButton.disabled = true;
        if (buttonLabel) buttonLabel.textContent = 'جاري تجهيز PDF...';

        try {
            window.showToast('جاري تجهيز كشف PDF بكل الحركات...');
            const report = window.createLedgerStatementPdf(acc);
            await sharePdfBlob(report.pdfBlob, report.fileName);
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('[Ledger PDF] failed:', error);
            window.customAlert('تعذر مشاركة كشف الحساب', 'حدث خطأ أثناء إنشاء أو مشاركة ملف PDF. حاول مرة أخرى.');
        } finally {
            window.__adtLedgerPdfBusy = false;
            if (shareButton) shareButton.disabled = false;
            if (buttonLabel) buttonLabel.textContent = originalLabel;
        }
    };

    // V197: أرشفة صامتة داخل Download/ADT Stock مع الاحتفاظ بآخر 30 ملفاً من كل نوع.
    window.saveAutomaticBlob = async function(blob, fileName, category) {
        if (!window.Android) return false;
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => { const value=String(reader.result||''), comma=value.indexOf(','); comma<0?reject(new Error('INVALID_DATA')):resolve(value.slice(comma+1)); };
            reader.onerror = () => reject(reader.error || new Error('READ_FAILED'));
            reader.readAsDataURL(blob);
        });
        const mime=blob.type || 'application/octet-stream';
        if(typeof window.Android.saveAutomaticFileChecked==='function'){
            try{return window.Android.saveAutomaticFileChecked(base64,fileName,mime,category)===true;}catch(e){console.warn('[Auto Backup] checked save failed',e);return false;}
        }
        if(typeof window.Android.saveAutomaticFile==='function'){
            window.Android.saveAutomaticFile(base64,fileName,mime,category);
            return true;
        }
        return false;
    };

    window.buildAutomaticFinancialPdf = function(title, rows) {
        const data = Array.isArray(rows) ? rows : [];
        const pageWidth=1240,pageHeight=1754,margin=58,headerTop=250,rowHeight=72,rowsPerPage=18;
        const pages=[],count=Math.max(1,Math.ceil(data.length/rowsPerPage));
        const fit=(ctx,value,width)=>{let text=String(value??'—');while(text.length>2&&ctx.measureText(text).width>width)text=text.slice(0,-1);return text===String(value??'—')?text:text+'…';};
        for(let pageIndex=0;pageIndex<count;pageIndex++){
            const canvas=document.createElement('canvas');canvas.width=pageWidth;canvas.height=pageHeight;const ctx=canvas.getContext('2d');ctx.direction='rtl';ctx.fillStyle='#fff';ctx.fillRect(0,0,pageWidth,pageHeight);
            ctx.fillStyle='#07131f';ctx.fillRect(0,0,pageWidth,190);ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='900 38px Cairo, sans-serif';ctx.fillText(title,pageWidth-margin,68);ctx.fillStyle='#16cdb4';ctx.font='800 20px Cairo, sans-serif';ctx.fillText(String(currentTeam?.name||'ADT Stock'),pageWidth-margin,112);ctx.fillStyle='#cbd5df';ctx.font='700 16px Cairo, sans-serif';ctx.fillText('تصدير تلقائي: '+new Date().toLocaleString('ar-LY-u-nu-latn'),pageWidth-margin,150);ctx.textAlign='left';ctx.fillText('صفحة '+(pageIndex+1)+' من '+count,margin,110);
            const widths=[240,245,155,235,249],labels=['الاسم','العملية','المبلغ','التاريخ والوقت','البيان'];let x=margin;
            ctx.fillStyle='#dce5eb';ctx.fillRect(margin,headerTop,pageWidth-margin*2,62);ctx.strokeStyle='#9ba8b3';ctx.strokeRect(margin,headerTop,pageWidth-margin*2,62);ctx.fillStyle='#111827';ctx.textAlign='center';ctx.font='900 17px Cairo, sans-serif';labels.forEach((label,i)=>{ctx.fillText(label,x+widths[i]/2,headerTop+40);x+=widths[i];});
            const pageRows=data.slice(pageIndex*rowsPerPage,(pageIndex+1)*rowsPerPage);
            if(!pageRows.length){ctx.fillStyle='#6b7280';ctx.font='800 25px Cairo, sans-serif';ctx.fillText('لا توجد بيانات مسجلة',pageWidth/2,headerTop+180);}
            pageRows.forEach((row,i)=>{const y=headerTop+62+i*rowHeight;if(i%2){ctx.fillStyle='#f5f7f9';ctx.fillRect(margin,y,pageWidth-margin*2,rowHeight);}ctx.strokeStyle='#d0d7de';ctx.strokeRect(margin,y,pageWidth-margin*2,rowHeight);let cx=margin;ctx.font='700 15px Cairo, sans-serif';[row.name,row.action,Number(row.amount||0).toFixed(2)+' '+String(window.getCurrencySymbol?.()||'د.ل'),row.date,row.details||'—'].forEach((value,col)=>{ctx.fillStyle=col===2?'#087f6d':'#111827';ctx.textAlign='center';ctx.fillText(fit(ctx,value,widths[col]-18),cx+widths[col]/2,y+44);cx+=widths[col];});});
            ctx.fillStyle='#8a949e';ctx.textAlign='center';ctx.font='700 14px Cairo, sans-serif';ctx.fillText('ملف محفوظ تلقائياً بواسطة ADT Stock — آخر 30 نسخة فقط',pageWidth/2,pageHeight-48);pages.push(canvas);
        }
        return createPurePdfBlobFromCanvases(pages);
    };

    window.autoExportFinancialPdfGroup = async function(group) {
        if(!currentTeam?.id)return;
        const stamp=new Date().toISOString().replace(/[:.]/g,'-');
        if(group==='debts'){
            for(const config of [{key:'customers',title:'ديون العملاء',category:'PDF - ديون العملاء'},{key:'suppliers',title:'حسابات الموردين',category:'PDF - حسابات الموردين'}]){
                const rows=[];(debts[config.key]||[]).forEach(acc=>{const txs=Array.isArray(acc.transactions)?acc.transactions:[];if(!txs.length){const b=window.calcAccountBalances(acc);rows.push({name:acc.name,action:'رصيد الحساب',amount:b.net,date:'—',details:acc.phone||'بدون هاتف'});}else txs.forEach(tx=>{const dt=new Date(tx.created_at||Date.now());rows.push({name:acc.name,action:tx.type==='debit'?'دين':(tx.type==='settle'?'تصفية':'سداد'),amount:tx.amount,date:dt.toLocaleString('ar-LY-u-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}),details:tx.notes||tx.invoiceCode||'—'});});});
                await window.saveAutomaticBlob(window.buildAutomaticFinancialPdf(config.title,rows),config.title.replace(/ /g,'_')+'_'+stamp+'.pdf',config.category);
            }
        }
        if(group==='money'){
            for(const config of [{type:'supplier',title:'دفعات الموردين',category:'PDF - دفعات الموردين'},{type:'customer',title:'استلام أموال من العملاء',category:'PDF - استلام أموال العملاء'}]){
                const partyMap=new Map(moneyParties.map(p=>[String(p.id),p]));const rows=moneyLogs.filter(x=>x.party_type===config.type).map(x=>{const dt=new Date(x.recorded_at||Date.now());return{name:partyMap.get(String(x.party_id))?.name||'بدون اسم',action:config.type==='customer'?'استلام أموال':'دفعة محولة',amount:x.amount,date:dt.toLocaleString('ar-LY-u-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}),details:x.note||x.reference||'—'};});
                await window.saveAutomaticBlob(window.buildAutomaticFinancialPdf(config.title,rows),config.title.replace(/ /g,'_')+'_'+stamp+'.pdf',config.category);
            }
        }
    };

    window.scheduleAutomaticFinancialPdfExport = function(group) {
        clearTimeout(window.__adtAutoPdfTimers?.[group]);window.__adtAutoPdfTimers=window.__adtAutoPdfTimers||{};
        window.__adtAutoPdfTimers[group]=setTimeout(async()=>{try{const source=group==='debts'?debts:{parties:moneyParties,logs:moneyLogs};const signature=window.adtQuickSignature(source);const key='adt_auto_pdf_signature_'+group+'_'+String(currentTeam?.id||'local');if(localStorage.getItem(key)===signature)return;await window.autoExportFinancialPdfGroup(group);localStorage.setItem(key,signature);}catch(e){console.warn('[Auto PDF] deferred',e);}},1800);
    };

    window.adtQuickSignature = function(value) { const text=JSON.stringify(value),step=Math.max(1,Math.floor(text.length/4096));let hash=2166136261;for(let i=0;i<text.length;i+=step){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return text.length+'_'+(hash>>>0).toString(16); };

    window.scheduleAutomaticTeamBackup = function() {
        clearTimeout(window.__adtAutoBackupTimer);window.__adtAutoBackupTimer=setTimeout(async()=>{try{
            if(!currentTeam?.id)return;
            const teamId=String(currentTeam.id);
            const critical={};
            const defs=window.getFullCloudStateDefinitions?.()||{};
            for(const [stateKey,def] of Object.entries(defs)){
                try{critical[stateKey]=window.readCriticalLocalState?window.readCriticalLocalState(def.local,def.fallback):JSON.parse(localStorage.getItem(def.local)||JSON.stringify(def.fallback));}
                catch(_){critical[stateKey]=def.fallback;}
            }
            const payload={format:'ADT_STOCK_AUTO_BACKUP',version:273,created_at:new Date().toISOString(),team:{id:currentTeam.id,name:currentTeam.name||''},products,shortages,suppliers,productSuppliersMap,debts,damagedGoods,moneyParties,moneyLogs,dailySales:window.__adtDailySalesData||null,criticalState:critical,activityLogs:activityLogs||[]};
            const signature=window.adtQuickSignature({...payload,created_at:''});
            const storageKey='adt_auto_backup_signature_'+teamId;
            if(localStorage.getItem(storageKey)===signature)return;
            const stamp=new Date().toISOString().replace(/[:.]/g,'-');
            const saved=await window.saveAutomaticBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'ADT_Stock_Backup_'+stamp+'.json','نسخ احتياطية تلقائية');
            if(saved===true)localStorage.setItem(storageKey,signature);
        }catch(e){console.warn('[Auto Backup] deferred',e);}},2600);
    };

    window.checkWeeklyDebtReminder=function(){ if(!currentTeam || window.isDeveloperAccount()) return; const key='adt_weekly_debt_reminder_'+String(currentTeam.id); const last=Number(localStorage.getItem(key)||0),week=7*24*60*60*1000; if(Date.now()-last<week)return; const owing=(debts.customers||[]).filter(c=>{try{return window.calcAccountBalances(c).net>0}catch(_){return false}}); localStorage.setItem(key,String(Date.now())); if(owing.length){ const total=owing.reduce((a,c)=>a+Math.max(0,window.calcAccountBalances(c).net),0); window.sendPushNotification('تذكير أسبوعي بالديون',`عندك ${owing.length} عملاء عليهم ديون بقيمة ${total.toFixed(2)} — راجعهم وأرسل تذكير بالسداد.`,false); } };

    // V195: سجل إثبات مستقل تماماً عن حسابات الديون.
    window.saveMoneyRecordsCache=function(){window.saveTeamCache('adt_money_records_v195',{parties:moneyParties,logs:moneyLogs});};
    window.fetchMoneyRecords=async function(showError=true){
        if(!currentTeam)return false;if(!dbClient){window.renderMoneyParties();return true;}const teamIdAtStart=String(currentTeam.id);
        try{const {data,error}=await dbClient.rpc('adt_money_records_fetch',{p_team_id:teamIdAtStart,p_user_id:getDeviceId()});if(error)throw error;if(!data||!Array.isArray(data.parties)||!Array.isArray(data.logs))throw new Error('INVALID_MONEY_RECORDS_PAYLOAD');if(!currentTeam||String(currentTeam.id)!==teamIdAtStart)return false;moneyParties=data.parties;moneyLogs=data.logs;window.saveMoneyRecordsCache();window.renderMoneyParties();if(activeMoneyParty){activeMoneyParty=moneyParties.find(x=>String(x.id)===String(activeMoneyParty.id))||null;window.renderMoneyPartyDetail();}return true;}
        catch(e){console.warn('[Money Records] fetch failed',e);if(showError)window.interfaceAlert('moneyRecords','تعذر تحميل السجل','تأكد من تشغيل ملف V195_MONEY_RECORDS.sql مرة واحدة في Supabase.');return false;}
    };
    window.openMoneyRecords=async function(type){
        if(!window.canManageMoneyRecords()){window.customAlert('غير مسموح','لا تملك صلاحية الدفعات والاستلامات.');return;}
        activeMoneyType=type==='customer'?'customer':'supplier';activeMoneyParty=null;window.switchTab('moneyRecords');window.renderMoneyParties();await window.fetchMoneyRecords(false);
    };
    window.openMoneyPartyModal=function(){const customer=activeMoneyType==='customer';document.getElementById('moneyPartyModalTitle').textContent=customer?'إضافة عميل لسجل الاستلام':'إضافة مورد لسجل التحويلات';document.getElementById('moneyPartyNameLabel').textContent=customer?'اسم العميل':'اسم المورد';document.getElementById('moneyPartyNameInput').value='';document.getElementById('moneyPartyPhoneInput').value='';window.openModalFront('moneyPartyModal',19000);};
    window.saveMoneyParty=async function(){
        const name=String(document.getElementById('moneyPartyNameInput').value||'').trim(),phone=String(document.getElementById('moneyPartyPhoneInput').value||'').trim();if(!name){window.customAlert('بيانات ناقصة','أدخل الاسم.');return;}if(!dbClient||!currentTeam){window.customAlert('الاتصال مطلوب','يلزم الاتصال لحفظ الاسم لجميع أجهزة الفريق.');return;}
        try{const {data,error}=await dbClient.rpc('adt_money_party_add',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_party_type:activeMoneyType,p_name:name,p_phone:phone});if(error||!data)throw error||new Error('SAVE_FAILED');moneyParties.unshift(data);window.saveMoneyRecordsCache();window.closeModal('moneyPartyModal');window.renderMoneyParties();window.showToast('تم حفظ الاسم');}catch(e){window.customAlert('تعذر الحفظ','لم يتم حفظ الاسم. تأكد من تشغيل SQL الخاص بالإصدار V195.');}
    };
    window.renderMoneyParties=function(){
        const box=document.getElementById('moneyPartiesList');if(!box)return;const customer=activeMoneyType==='customer',parties=moneyParties.filter(x=>x.party_type===activeMoneyType),logs=moneyLogs.filter(x=>x.party_type===activeMoneyType),total=logs.reduce((s,x)=>s+Number(x.amount||0),0);
        document.getElementById('moneyRecordsTitle').textContent=customer?'إجمالي الأموال المستلمة من العملاء':'إجمالي الدفعات المحولة للموردين';document.getElementById('moneyRecordsTotal').textContent=window.formatMoney(total);document.getElementById('moneyRecordsCount').textContent=`${logs.length} عملية إثبات مستقلة`;document.getElementById('addMoneyPartyBtn').textContent=customer?'+ إضافة اسم عميل':'+ إضافة اسم مورد';
        if(!parties.length){box.innerHTML=`<div style="text-align:center;color:var(--text-muted);padding:35px 10px;font-weight:700">لا توجد أسماء بعد<br><small>أضف ${customer?'عميلاً':'مورداً'} لبدء تسجيل العمليات</small></div>`;return;}
        box.innerHTML=parties.map(p=>{const rows=logs.filter(x=>String(x.party_id)===String(p.id)),sum=rows.reduce((s,x)=>s+Number(x.amount||0),0);return `<div class="debt-account-card" onclick="window.openMoneyParty('${p.id}')"><div class="debt-card-header-row"><div class="debt-account-identity"><div class="debt-user-badge ${customer?'cust':'supp'}">${customer?'ع':'م'}</div><div class="debt-account-details"><b class="debt-account-name">${window.escapeHtml(p.name)}</b><div class="debt-account-phone">${window.escapeHtml(p.phone||'بدون هاتف')} • ${rows.length} عملية</div></div></div><div class="debt-balance-badge ${customer?'receivable':'payable'}"><div class="debt-balance-value">${window.formatMoney(sum)}</div><span class="debt-balance-label">إجمالي الإثبات</span></div></div></div>`;}).join('');
    };
    window.openMoneyParty=function(id){activeMoneyParty=moneyParties.find(x=>String(x.id)===String(id));if(!activeMoneyParty)return;activeMoneyType=activeMoneyParty.party_type;window.switchTab('moneyPartyDetail');window.renderMoneyPartyDetail();};
    window.renderMoneyPartyDetail=function(){if(!activeMoneyParty)return;const customer=activeMoneyType==='customer',rows=moneyLogs.filter(x=>String(x.party_id)===String(activeMoneyParty.id));document.getElementById('moneyPartyDetailName').textContent=activeMoneyParty.name;document.getElementById('moneyPartyDetailType').textContent=customer?'سجل استلام أموال مستقل — لا يؤثر على الديون':'سجل تحويلات مستقل — لا يؤثر على الديون';document.getElementById('addMoneyRecordBtn').textContent=customer?'+ تسجيل استلام أموال':'+ تسجيل دفعة محولة';const box=document.getElementById('moneyPartyLogsList');if(!rows.length){box.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:36px 10px;font-weight:700">لا توجد عمليات مسجلة لهذا الاسم</div>';return;}box.innerHTML=rows.map(r=>{const dt=new Date(r.recorded_at||Date.now()).toLocaleString('ar-LY-u-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});return `<div class="debt-tx-item"><div><b style="color:#fff;font-size:12px">${customer?'استلام أموال':'دفعة محولة'}</b><div style="font-size:10px;color:var(--text-muted)">${window.escapeHtml(dt)}${r.reference?' • '+window.escapeHtml(r.reference):''}</div>${r.note?`<div style="font-size:10px;color:var(--text-muted)">${window.escapeHtml(r.note)}</div>`:''}</div><div style="display:flex;align-items:center;gap:6px"><strong style="color:${customer?'var(--green)':'var(--orange)'}">${window.formatMoney(Number(r.amount||0))}</strong><button type="button" class="btn-icon-action btn-icon-delete" onclick="window.deleteMoneyRecord('${r.id}')"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"></path></svg></button></div></div>`;}).join('');};
    window.openMoneyRecordModal=function(){if(!activeMoneyParty)return;const customer=activeMoneyType==='customer';document.getElementById('moneyRecordModalTitle').textContent=customer?'تسجيل استلام أموال':'تسجيل دفعة محولة للمورد';document.getElementById('moneyRecordPartyName').textContent=activeMoneyParty.name;document.getElementById('moneyRecordAmountInput').value='';document.getElementById('moneyRecordReferenceInput').value='';document.getElementById('moneyRecordNoteInput').value='';window.openModalFront('moneyRecordModal',19000);};
    window.saveMoneyRecord=async function(){const amount=Number(document.getElementById('moneyRecordAmountInput').value||0);if(!activeMoneyParty||amount<=0){window.customAlert('بيانات ناقصة','أدخل مبلغاً صحيحاً.');return;}const btn=document.getElementById('saveMoneyRecordBtn');btn.disabled=true;try{const {data,error}=await dbClient.rpc('adt_money_record_add',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_party_id:String(activeMoneyParty.id),p_amount:amount,p_reference:String(document.getElementById('moneyRecordReferenceInput').value||''),p_note:String(document.getElementById('moneyRecordNoteInput').value||'')});if(error||!data)throw error||new Error('SAVE_FAILED');moneyLogs.unshift(data);window.saveMoneyRecordsCache();window.closeModal('moneyRecordModal');window.renderMoneyPartyDetail();window.showToast('تم حفظ العملية كإثبات مستقل');}catch(e){window.customAlert('تعذر الحفظ','لم يتم تسجيل العملية على الخادم.');}finally{btn.disabled=false;}};
    window.deleteMoneyRecord=async function(id){const ok=await window.showAppConfirm({title:'حذف عملية الإثبات',message:'سيتم حذف العملية من السجل فقط، ولا توجد أي علاقة بحسابات الديون.',confirmText:'حذف',cancelText:'إلغاء',danger:true});if(!ok)return;try{const {data,error}=await dbClient.rpc('adt_money_record_delete',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_record_id:String(id)});if(error||data!==true)throw error||new Error('DELETE_FAILED');moneyLogs=moneyLogs.filter(x=>String(x.id)!==String(id));window.saveMoneyRecordsCache();window.renderMoneyPartyDetail();window.showToast('تم حذف العملية');}catch(e){window.customAlert('تعذر الحذف','لم يتم حذف العملية من الخادم.');}};

    window.fetchDamagedGoods = async function(showErrors = true) {
        if (!currentTeam) return false;
        if (!dbClient) { window.renderDamagedGoods(); return true; }
        const teamIdAtStart=String(currentTeam.id);
        try {
            const {data,error}=await dbClient.rpc('adt_damaged_goods_fetch',{p_team_id:teamIdAtStart,p_user_id:getDeviceId()});
            if(error)throw error;
            if(!Array.isArray(data))throw new Error('INVALID_DAMAGED_GOODS_PAYLOAD');
            if(!currentTeam||String(currentTeam.id)!==teamIdAtStart)return false;
            damagedGoods=data;
            window.saveTeamCache('adt_damaged_goods_v194',damagedGoods,teamIdAtStart);
            window.renderDamagedGoods();
            return true;
        } catch(e) {
            console.warn('[Damaged Goods] fetch failed:',e);
            window.renderDamagedGoods();
            if(showErrors && currentTab==='damagedGoods') window.customAlert('تعذر تحميل سجل التالف','تأكد من تشغيل ملف V194_DAMAGED_GOODS.sql مرة واحدة في Supabase.');
            return false;
        }
    };

    window.openDamagedGoodsModal = function() {
        if (!window.canEditBuyPrice()) { window.customAlert('غير مسموح','تسجيل التالف متاح لمدير الفريق الرئيسي حتى تبقى أسعار الشراء محمية.'); return; }
        if (!products.length) { window.customAlert('لا توجد أصناف','أضف المنتجات أولاً ثم سجل البضاعة التالفة.'); return; }
        document.getElementById('damagedProductSearchInput').value='';
        document.getElementById('damagedProductIndex').value='';
        document.getElementById('damagedProductSearchResults').style.display='none';
        document.getElementById('damagedQtyInput').value='';
        window.setDamagedUnit('pack');
        window.setDamagedReason('expired');
        document.getElementById('damagedNoteInput').value='';
        window.previewDamagedGoodsTotal();
        window.openModalFront('damagedGoodsModal',19000);
    };

    window.searchDamagedProduct = function(){
        const input=document.getElementById('damagedProductSearchInput'),box=document.getElementById('damagedProductSearchResults');
        const q=window.normalizeArabic(input?.value||'');document.getElementById('damagedProductIndex').value='';window.previewDamagedGoodsTotal();
        if(!q){box.style.display='none';box.innerHTML='';return;}
        const found=products.map((p,i)=>({p,i})).filter(x=>window.normalizeArabic(x.p.name).includes(q)).slice(0,12);
        box.innerHTML=found.length?found.map(x=>`<button type="button" onclick="window.selectDamagedProduct(${x.i})" style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:10px;border:0;border-bottom:1px solid var(--border);background:transparent;color:#fff;text-align:right;font-family:inherit"><b>${window.escapeHtml(x.p.name)}</b><small style="color:var(--accent-teal)">${window.formatMoney(Number(x.p.buyPrice||0))}</small></button>`).join(''):'<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:11px">لا يوجد صنف بهذا الاسم</div>';
        box.style.display='block';
    };
    window.selectDamagedProduct=function(index){const p=products[index];if(!p)return;document.getElementById('damagedProductIndex').value=String(index);document.getElementById('damagedProductSearchInput').value=p.name;document.getElementById('damagedProductSearchResults').style.display='none';window.previewDamagedGoodsTotal();};
    window.setDamagedUnit=function(value){document.getElementById('damagedUnitSelect').value=value;document.getElementById('damagedUnitPackBtn').classList.toggle('active',value==='pack');document.getElementById('damagedUnitPieceBtn').classList.toggle('active',value==='piece');window.previewDamagedGoodsTotal();};
    window.setDamagedReason=function(value){document.getElementById('damagedReasonSelect').value=value;document.querySelectorAll('[data-damaged-reason]').forEach(b=>b.classList.toggle('active',b.dataset.damagedReason===value));};

    window.previewDamagedGoodsTotal = function() {
        const raw=document.getElementById('damagedProductIndex')?.value;
        const idx=Number(raw);
        const p=raw===''?null:products[idx];
        const qty=Math.max(0,Number(document.getElementById('damagedQtyInput')?.value||0));
        const unit=document.getElementById('damagedUnitSelect')?.value||'pack';
        const unitPrice=p?(unit==='piece'?Number(p.buyPrice||0)/Math.max(1,Number(p.packQty||1)):Number(p.buyPrice||0)):0;
        const unitName=p?(unit==='piece'?(p.pieceName||'قطعة'):(p.packName||'وحدة')):'وحدة';
        document.getElementById('damagedPricePreview').innerHTML=p
          ? `سعر الشراء المحفوظ الآن: <b style="color:#fff">${window.formatMoney(unitPrice)}</b> لكل ${window.escapeHtml(unitName)}<br>إجمالي الخسارة: <b style="color:#ff7a89">${window.formatMoney(qty*unitPrice)}</b>`
          : 'اختر الصنف وأدخل الكمية';
    };

    window.saveDamagedGoods = async function() {
        if (!dbClient || !currentTeam) { window.customAlert('الاتصال مطلوب','يلزم الاتصال بالخادم لحفظ عملية التالف لجميع أجهزة الفريق.'); return; }
        const raw=document.getElementById('damagedProductIndex')?.value;
        const p=raw===''?null:products[Number(raw)];
        const qty=Number(document.getElementById('damagedQtyInput')?.value||0);
        if(!p||qty<=0){window.customAlert('بيانات ناقصة','اختر الصنف وأدخل كمية صحيحة.');return;}
        const unit=document.getElementById('damagedUnitSelect').value;
        const packQty=Math.max(1,Number(p.packQty||1));
        const unitPrice=unit==='piece'?Number(p.buyPrice||0)/packQty:Number(p.buyPrice||0);
        const unitName=unit==='piece'?(p.pieceName||'قطعة'):(p.packName||'وحدة');
        const btn=document.getElementById('saveDamagedGoodsBtn');btn.disabled=true;
        try{
            const {data,error}=await dbClient.rpc('adt_damaged_goods_add',{
              p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_product_id:String(p.id),p_product_name:String(p.name||''),
              p_quantity:qty,p_unit_type:unit,p_unit_name:String(unitName),p_buy_price:Number(unitPrice),
              p_reason:String(document.getElementById('damagedReasonSelect').value),p_note:String(document.getElementById('damagedNoteInput').value||'')
            });
            if(error||!data)throw error||new Error('SAVE_FAILED');
            damagedGoods.unshift(data);window.saveTeamCache('adt_damaged_goods_v194',damagedGoods);
            window.closeModal('damagedGoodsModal');window.renderDamagedGoods();window.showToast('تم حفظ التالف بسعر الشراء والتاريخ والوقت');
        }catch(e){console.error('[Damaged Goods] save failed:',e);window.customAlert('تعذر حفظ العملية','تأكد من تشغيل ملف V194_DAMAGED_GOODS.sql ثم حاول مرة أخرى.');}
        finally{btn.disabled=false;}
    };

    window.deleteDamagedGoods = async function(id) {
        const ok=await window.showAppConfirm({title:'حذف عملية التالف',message:'هل تريد حذف هذه العملية من السجل؟',confirmText:'حذف',cancelText:'إلغاء',danger:true});
        if(!ok||!dbClient||!currentTeam)return;
        try{const {data,error}=await dbClient.rpc('adt_damaged_goods_delete',{p_team_id:String(currentTeam.id),p_user_id:getDeviceId(),p_record_id:String(id)});if(error||data!==true)throw error||new Error('DELETE_FAILED');damagedGoods=damagedGoods.filter(x=>String(x.id)!==String(id));window.saveTeamCache('adt_damaged_goods_v194',damagedGoods);window.renderDamagedGoods();window.showToast('تم حذف العملية');}
        catch(e){window.customAlert('تعذر الحذف','لم يتم حذف العملية من الخادم.');}
    };

    window.renderDamagedGoods = function() {
        const list=document.getElementById('damagedGoodsList');if(!list)return;
        const total=(damagedGoods||[]).reduce((s,x)=>s+Number(x.total_cost||0),0);
        const totalEl=document.getElementById('damagedGoodsTotal'),countEl=document.getElementById('damagedGoodsCount'),badge=document.getElementById('hubDamagedGoodsBadge');
        if(totalEl)totalEl.textContent=window.formatMoney(total);if(countEl)countEl.textContent=`${damagedGoods.length} عملية مسجلة`;if(badge)badge.textContent=`${damagedGoods.length} عملية`;
        if(!damagedGoods.length){list.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:36px 10px;font-weight:700">لا توجد بضاعة تالفة مسجلة</div>';return;}
        list.innerHTML=damagedGoods.map(r=>{const d=new Date(r.recorded_at||r.created_at||Date.now());const when=d.toLocaleString('ar-LY-u-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});const reason=r.reason==='expired'?'منتهية الصلاحية':r.reason==='damaged'?'تالفة':'سبب آخر';return `<div class="debt-account-card" style="margin-bottom:8px"><div class="debt-card-header-row"><div class="debt-account-details"><b class="debt-account-name">${window.escapeHtml(r.product_name||'صنف')}</b><div class="debt-account-phone">${window.escapeHtml(reason)} • ${window.escapeHtml(when)}</div><div class="debt-account-phone">${Number(r.quantity||0)} ${window.escapeHtml(r.unit_name||'وحدة')} × ${window.formatMoney(Number(r.buy_price||0))}</div>${r.note?`<div class="debt-account-phone">${window.escapeHtml(r.note)}</div>`:''}</div><div class="debt-balance-badge payable"><div class="debt-balance-value">${window.formatMoney(Number(r.total_cost||0))}</div><span class="debt-balance-label">قيمة الخسارة</span></div><button type="button" onclick="window.deleteDamagedGoods('${String(r.id)}')" class="btn-icon-action btn-icon-delete" title="حذف"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"></path></svg></button></div></div>`;}).join('');
    };

    window.renderDebts = function() {
        const container = document.getElementById('debtsListContainer');
        if (!container) return;
        if (!window.canEditDebts()) {
            container.innerHTML = '';
            return;
        }
        const search = window.normalizeArabic(document.getElementById('searchDebtAccountBox')?.value || '');
        let list = (activeDebtSubTab === 'customer') ? (debts.customers || []) : (debts.suppliers || []);
        let filtered = list.filter(d => !d.is_deleted && (window.normalizeArabic(d.name).includes(search) || (d.phone && d.phone.includes(search))));

        let grandRec = 0, grandPay = 0;
        (debts.customers || []).forEach(c => { let b = window.calcAccountBalances(c); if (b.net > 0) grandRec += b.net; });
        (debts.suppliers || []).forEach(s => { let b = window.calcAccountBalances(s); if (b.net > 0) grandPay += b.net; });

        document.getElementById('debtTotalReceivableSum').innerText = grandRec.toFixed(2);
        document.getElementById('debtTotalPayableSum').innerText = grandPay.toFixed(2);
        document.getElementById('debtNetBalanceSum').innerText = (grandRec - grandPay).toFixed(2);

        if (filtered.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:35px; font-weight:700;">لا توجد حسابات مسجلة في هذا القسم</div>';
            return;
        }

        container.innerHTML = filtered.map(acc => {
            let b = window.calcAccountBalances(acc);
            let isCust = activeDebtSubTab === 'customer';
            let balanceState = b.net > 0 ? (isCust ? 'receivable' : 'payable') : 'settled';
            let balanceLabel = b.net > 0 ? (isCust ? 'عليه (مدين)' : 'له (دائن)') : 'الحساب خالص';
            return `
                <div class="debt-account-card" onclick="window.openAccountLedgerDetail('${acc.id}')">
                    <div class="debt-card-header-row">
                        <div class="debt-account-identity">
                            <div class="debt-user-badge ${isCust ? 'cust' : 'supp'}">
                                ${isCust ? `
                                    <svg class="svg-icon" style="width:16px; height:16px;" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                                ` : `
                                    <svg class="svg-icon" style="width:16px; height:16px;" viewBox="0 0 24 24"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>
                                `}
                            </div>
                            <div class="debt-account-details">
                                <b class="debt-account-name">${window.escapeHtml(acc.name)}</b>
                                <div class="debt-account-phone">${window.escapeHtml(acc.phone || 'بدون هاتف')}</div>
                            </div>
                        </div>
                        <div class="debt-balance-badge ${balanceState}">
                            <div class="debt-balance-value">${window.escapeHtml(window.formatMoney(b.net))}</div>
                            <span class="debt-balance-label">${balanceLabel}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    window.renderHomeStats = function() {
        window.refreshPaidFeatureCards?.();
        const prodBadge = document.getElementById('hubProdBadge');
        if (prodBadge) prodBadge.innerText = `${products.length} صنف مسجل`;
        window.applyPermissionVisibility();
    };

    window.toggleAuthPassword = function(id, button) {
        const input = document.getElementById(id); if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        if (button) button.textContent = input.type === 'password' ? '◉' : '◎';
    };

    window.confirmCloseInvoice = async function() {
        const hasItems = Array.isArray(invoiceItems) && invoiceItems.length > 0;
        const customer = String(document.getElementById('invoiceCustomerName')?.value || '').trim();
        const note = String(document.getElementById('invoiceGeneralNote')?.value || '').trim();
        const ok = await window.showAppConfirm({
            title:'إغلاق الفاتورة؟',
            message:(hasItems || customer || note)
                ? 'سيتم إغلاق الفاتورة الحالية وفقد البيانات التي لم يتم إصدارها. هل تريد المتابعة؟'
                : 'هل تريد إغلاق واجهة الفاتورة؟',
            confirmText:'إغلاق', cancelText:'رجوع', danger:!!(hasItems || customer || note)
        });
        if (!ok) return;
        if (hasItems) window.saveInvoiceDraftToHistory();
        window.closeModal('invoiceModal');
    };

    window.dedupeStoredActivityLogs = function() {
        try {
            const raw = JSON.parse(localStorage.getItem('atd_activity_logs_v1') || '[]');
            if (!Array.isArray(raw)) return;
            const seen = new Set(), clean = [];
            for (const log of raw) {
                const key = `${String(log?.title || '').trim()}||${String(log?.msg || '').trim()}||${log?.isBroadcast ? '1' : '0'}`;
                if (seen.has(key)) continue;
                seen.add(key); clean.push(log);
            }
            if (clean.length !== raw.length) {
                activityLogs = clean.slice(0, 200);
                localStorage.setItem('atd_activity_logs_v1', JSON.stringify(activityLogs));
            }
        } catch(_) {}
    };

    window.syncBrandLogoToAuth = function() {
        const logo = document.getElementById('adtHeaderLogoV45');
        if (!logo) return;
        ['adtAuthLogoHost','adtIntroLogoHost'].forEach(id => {
            const host = document.getElementById(id);
            if (!host) return;
            host.replaceChildren(logo.cloneNode(true));
            host.firstElementChild?.removeAttribute('id');
        });
    };

    window.fitFocusedModalToKeyboard = function() {
        const active = document.activeElement;
        const fieldModal = active?.closest?.('.modal');
        const isField = !!(active && /INPUT|TEXTAREA/.test(active.tagName) && fieldModal);
        const viewportHeight = window.visualViewport ? Math.max(250, window.visualViewport.height - 10) : Math.max(250,window.innerHeight-10);
        document.querySelectorAll('.modal').forEach(modal => {
            const ownsField=!!(isField&&modal===fieldModal);
            modal.classList.toggle('keyboard-open',ownsField);
            if(ownsField)modal.style.setProperty('--adt-keyboard-modal-height',`${viewportHeight}px`);
            else modal.style.removeProperty('--adt-keyboard-modal-height');
        });
        if (isField) setTimeout(() => {
            if (document.activeElement === active && fieldModal?.contains(active)) {
                const box=fieldModal.querySelector('.modal-box');
                if(!box)return;
                const fieldRect=active.getBoundingClientRect(),boxRect=box.getBoundingClientRect();
                if(fieldRect.bottom>boxRect.bottom-10)box.scrollTop+=fieldRect.bottom-boxRect.bottom+18;
                else if(fieldRect.top<boxRect.top+8)box.scrollTop-=boxRect.top-fieldRect.top+14;
            }
        }, 100);
    };

    // ثبّت موضع واجهة المنتجات عند فتح/إغلاق لوحة المفاتيح داخل بحث المنتجات.
    window.installProductsSearchScrollLock = function(){
        if(window.__adtProductsSearchScrollLockReady)return;
        window.__adtProductsSearchScrollLockReady=true;
        const input=document.getElementById('searchBox');
        const scroller=document.querySelector('.app-main-content');
        if(!input||!scroller)return;
        let lockedTop=0, closingUntil=0, restoreTimer=0;
        const restore=()=>{
            if((document.activeElement===input||Date.now()<closingUntil) && currentTab==='products'){
                scroller.scrollTop=lockedTop;
            }
        };
        input.addEventListener('focus',()=>{
            lockedTop=scroller.scrollTop;
            closingUntil=0;
            requestAnimationFrame(restore);
        });
        input.addEventListener('blur',()=>{
            closingUntil=Date.now()+650;
            clearTimeout(restoreTimer);
            restoreTimer=setTimeout(()=>{restore();closingUntil=0;},420);
        });
        window.visualViewport?.addEventListener('resize',()=>{
            requestAnimationFrame(restore);
            setTimeout(restore,120);
        },{passive:true});
        window.visualViewport?.addEventListener('scroll',()=>requestAnimationFrame(restore),{passive:true});
    };

    // اترك المتصفح يغيّر حالة المفتاح طبيعيًا، وثبّت موضع القائمة بعد التغيير.
    // منع click هنا كان يلغي القيمة في بعض إصدارات Android WebView.
    window.installMemberPermissionsStableToggles = function(){
        if(window.__adtPermissionsStableTogglesReady)return;
        const modal=document.getElementById('memberPermissionsModal');
        if(!modal)return;
        window.__adtPermissionsStableTogglesReady=true;
        let savedListTop=0;
        const remember=()=>{
            const list=modal.querySelector('.member-permissions-list');
            savedListTop=list?.scrollTop||0;
        };
        const restore=()=>{
            const list=modal.querySelector('.member-permissions-list');
            modal.scrollTop=0;
            if(list)list.scrollTop=savedListTop;
        };
        modal.addEventListener('pointerdown',event=>{
            if(!event.target?.closest?.('input[type="checkbox"],label[for]'))return;
            remember();
        },true);
        modal.addEventListener('change',event=>{
            const input=event.target;
            if(!input?.matches?.('input[type="checkbox"]'))return;
            input.blur();
            restore();
            requestAnimationFrame(restore);
            setTimeout(restore,80);
            setTimeout(restore,220);
        },true);
    };

    window.initIntegratedUi = function() {
        // V331: clear the old generic team-deleted popup once. Older builds could create it
        // when a member signed in on another phone, even though the team still existed.
        if (localStorage.getItem('adt_v331_team_notice_migration') !== '1') {
            localStorage.removeItem('adt_team_deleted_notice_v225');
            localStorage.removeItem('adt_team_deleted_notice_v194');
            localStorage.setItem('adt_v331_team_notice_migration', '1');
        }
        window.dedupeStoredActivityLogs();
        window.syncBrandLogoToAuth();
        window.applyAuthLanguage?.(window.adtAuthLanguage || 'ar');
        window.applyAppCurrency?.();
        window.syncBottomMask();
        window.installProductsSearchScrollLock?.();
        window.installMemberPermissionsStableToggles?.();
        window.showOnboardingSubTab?.('mgrLogin');
        document.querySelectorAll('button[onclick*="closeModal("]').forEach(button => {
            if (!(button.textContent || '').trim()) button.textContent = '×';
        });
        if (!window.__adtIntegratedEventsReady) {
            window.__adtIntegratedEventsReady = true;
            document.addEventListener('focusin', () => setTimeout(window.fitFocusedModalToKeyboard, 30));
            document.addEventListener('focusout', () => setTimeout(window.fitFocusedModalToKeyboard, 180));
            window.visualViewport?.addEventListener('resize', window.fitFocusedModalToKeyboard);
            window.visualViewport?.addEventListener('scroll', window.fitFocusedModalToKeyboard);
            window.addEventListener('resize', window.syncBottomMask, {passive:true});
            window.addEventListener('focus', () => setTimeout(() => window.adtEnsurePushBoundToCurrentTeam(), 500));
            window.addEventListener('online', () => setTimeout(() => window.adtEnsurePushBoundToCurrentTeam(), 700));
            window.__adtPushSelfHealTimer = setInterval(() => {
                if (!document.hidden) window.adtEnsurePushBoundToCurrentTeam().catch(()=>{});
            }, 30 * 60 * 1000);
        }
        [400, 1800, 5000].forEach(delay => setTimeout(() => window.adtEnsurePushBoundToCurrentTeam(), delay));
        if (localStorage.getItem('adt_signed_out_notice_v146') === '1') {
            localStorage.removeItem('adt_signed_out_notice_v146');
            setTimeout(() => window.customAlert('تم تسجيل الخروج', 'تم تسجيل الخروج'), 120);
        }
        // العلامة القديمة كانت عامة وغير مرتبطة بحساب، لذلك لا نعرضها.
        localStorage.removeItem('adt_team_deleted_notice_v194');
        if (localStorage.getItem('adt_team_deleted_notice_v225')) {
            setTimeout(() => window.showDeletedTeamNoticeIfAllowed?.(), 1300);
        }
    };

    // إدارة التراجع بزر المتصفح
    window.addEventListener('popstate', function() {
        if(window.__adtRequiredRelease?.code > window.getInstalledAppVersionCode?.()){
            window.openModalFront('adtUpdateModal',50000);
            return;
        }
        const drawer = document.getElementById('sidebarDrawer');
        if (drawer && drawer.classList.contains('active')) {
            window.closeSideMenu();
            return;
        }
        const modals = document.querySelectorAll('.modal');
        let closed = false;
        modals.forEach(m => {
            if (m.style.display === 'flex' && m.id !== 'appLockModal' && m.id !== 'teamSuspendedModal' && m.id !== 'teamDeletedModal' && m.id !== 'onboardingModal' && m.id !== 'subscriptionExpiredModal') {
                m.style.display = 'none';
                closed = true;
            }
        });
        if (closed) return;
        if (currentTab !== 'home') window.switchTab('home', false);
    });

    // V145 Fast Start: ارسم واجهة التطبيق وبيانات الجلسة المحلية أولاً، ثم ابدأ الشبكة بالخلفية.
    document.addEventListener('DOMContentLoaded', function() {
        try {
            window.initIntegratedUi();
            history.replaceState({ tab: 'home' }, '', location.href);
            window.setupHiddenDeveloperLongPress();
            window.switchTab('home', false);
            void window.checkAuthAndTeam();

            const initiallyOnline = window.getNativeNetworkState();
            window.setNetworkConnectionState(initiallyOnline);
            requestAnimationFrame(() => setTimeout(() => {
                window.loadDeferredFont();
                if (initiallyOnline) window.startBackgroundCloudSync();
            }, 0));
        } catch(e) {
            window.switchTab('home', false);
            window.releaseStartupSurface?.();
        }
    });
    window.addEventListener('load',()=>{const x=document.getElementById('adtSplashScreen');if(x)x.remove();});