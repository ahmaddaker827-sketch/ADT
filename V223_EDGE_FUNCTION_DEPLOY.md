# تفعيل إشعارات العمليات في V223

تعديل APK وحده لا يحدّث دالة Supabase الموجودة على الخادم. بعد رفع المشروع وبناء النسخة، انشر الدالة الموجودة في:

`supabase/functions/adt-send-price-push/index.ts`

مرة واحدة باسم:

`adt-send-price-push`

## الأسرار المطلوبة داخل Supabase Edge Functions

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

يمكن استخدام الاسم القديم `FIREBASE_SERVICE_ACCOUNT` بدل الاسم الأخير؛ الكود يدعم الاثنين.

الدالة الجديدة تقبل الأنواع التالية دون تغيير مسار Firebase الحالي:

- `sell_price` — تغيير سعر البيع.
- `customer_receipt` — استلام أموال من عميل.
- `supplier_payment` — دفعة مورد.
- `daily_sale` — تسجيل مبيعات.
- `damaged_goods` — بضاعة تالفة أو منتهية.

بعد نشر الدالة لا يلزم تشغيل SQL جديد. الأجهزة المسجلة في جدول رموز Firebase الخاص بالمشروع ستستقبل الأنواع الجديدة، مع استبعاد جهاز منفذ العملية.
