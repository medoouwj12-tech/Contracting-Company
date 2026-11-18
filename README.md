# عقار | Aqar Kuwait

نظام عربي RTL لإدارة العقارات والعملاء والطلبات والمتابعات لشركة عقارية في الكويت. قاعدة البيانات والمصادقة المستهدفتان هما Neon Postgres وNeon Auth، مع سياسات وصول داخل PostgreSQL.

## الموجود في النسخة الحالية

- لوحة رئيسية، العقارات والعملاء، المواعيد والمتابعات، الإعلانات، التقارير، الإعدادات والأدوار.
- استيراد Excel وCSV عبر Web Worker، والتحقق من ملف تجريبي يتجاوز 50 ألف صف.
- استيراد دفعات إلى Neon Data API عبر RPC، بسياسات للتكرار وإمكانية التراجع عن الإنشاءات والتحديثات.
- جلسات دخول Neon Auth، إنشاء ملف صلاحيات ابتدائي للمستخدم، وحماية جداول PostgreSQL بسياسات RLS.
- لا يعرض Neon أرقام الهواتف مباشرة؛ يكشفها إجراء مسجل بعد إدخال تعليق، ويحفظ هوية المستخدم ووقت الاطلاع.
- إعدادات النشر على Vercel وملفات ترحيل قاعدة البيانات في `database/migrations`.

هذا ليس بعد نظاماً مكتملاً لكل ما ظهر في فيديو Savvy Realestate. ما زالت تحتاج إلى بناء واختبار التوزيع المشترك للعروض، جلسات العمل والحضور، الرسائل والتعاميم، سلة المحذوفات، مهام الإعلانات والتنبيهات المؤقتة، تقارير سجل الاطلاع، وطباعة بيانات الشركة. كما لم تُختبر قاعدة البيانات على مشروع Neon خاص بالشركة بعد.

## التشغيل المحلي

المتطلبات: Node.js 20 أو أحدث.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

## ربط Neon

1. أنشئ مشروعاً وقاعدة بيانات وفرعاً في Neon.
2. فعّل **Neon Auth** و**Neon Data API** على الفرع وقاعدة البيانات نفسيهما.
3. انسخ عنوان Neon Auth إلى `NEON_AUTH_BASE_URL` و`NEXT_PUBLIC_NEON_AUTH_URL`.
4. انسخ عنوان Data API إلى `NEXT_PUBLIC_NEON_DATA_API_URL`.
5. أنشئ قيمة عشوائية سرية بطول 32 حرفاً أو أكثر وضعها في `NEON_AUTH_COOKIE_SECRET`. هذا متغير خادمي فقط.
6. ضع اتصال Postgres المباشر في `DATABASE_URL` لتطبيق الترحيلات. لا تضف بادئة `NEXT_PUBLIC_` إلى بيانات الاتصال.
7. طبّق بالترتيب `database/migrations/001_neon_initial_schema.sql` ثم `database/migrations/002_video_contact_audit.sql` على قاعدة Neon بعد تفعيل Neon Auth؛ الترحيل يربط `profiles.id` بهوية `neon_auth.user.id` ويستخدم `auth.user_id()` في سياسات RLS.
8. بعد إنشاء المستخدم الأول وتسجيل دخوله، امنحه دور مدير النظام من محرر SQL:

   ```sql
   update public.profiles
   set role_id = (select id from public.roles where name = 'super_admin'),
       phone_visible = true,
       price_visible = true
   where email = 'admin@your-company.com';
   ```

إعداد المصادقة والبريد الإلكتروني، وأصول الصور والمستندات، يتم من خدماتها المخصصة؛ Neon هنا يوفر Postgres وAuth وData API، ولا يحل محل تخزين الملفات.

## الأمان

- لا تضع `DATABASE_URL` أو `NEON_AUTH_COOKIE_SECRET` في متغيرات `NEXT_PUBLIC_*`.
- سياسات الصفوف والصلاحيات موجودة في PostgreSQL، وبيانات المستخدمين في Neon Auth.
- أول دخول ينشئ ملف مستخدم بدور `viewer`؛ يجب ترقية حساب المدير الأول يدوياً كما في الخطوة السابقة.
- لا تستخدم وضع المعاينة المحفوظ في المتصفح لبيانات الشركة.

## أوامر التحقق

- `npm run dev` — تشغيل محلي
- `npm run typecheck` — فحص TypeScript
- `npm run build` — بناء الإنتاج
- `npm run test:import` — اختبار محلل ملف Excel التجريبي

يتطلب اختبار RPC والصلاحيات قاعدة Neon مهيأة، ومتغيرات الاتصال أعلاه؛ نجاح البناء وحده لا يثبت الربط الحي.
