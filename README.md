# ⚖️ مكتب المحاماة — نظام إدارة المكتب

النسخة الحالية: Stage 20

تطبيق ويب عربي RTL لإدارة مكتب المحاماة، يعمل محليًا عبر IndexedDB ويدعم GitHub Pages.

## المرحلة 13
أضيف مركز النفقات الأسرية وحساب المتجمد:
- familyDetails
- familyMaintenancePeriods
- familyPayments
- محرك قواعد النفقة
- حساب المتجمد من فترات الاستحقاق والسداد
- حفظ سجل الحسابات
- ربط بالقضية والعميل

## تشغيل محلي
يمكن فتح `index.html` عبر خادم HTTP محلي، مثل:

`python3 -m http.server 8000`

ثم فتح:

`http://127.0.0.1:8000/`

لا يوجد Backend أو Firebase أو Supabase أو API خارجي للتشغيل الأساسي.

## المرحلة 15
أضيف مركز القضايا الجنائية وسجل الإجراءات الجنائية، مع محرك لتحديد النسخة الزمنية لقانون الإجراءات الجنائية بين القانون 150 لسنة 1950 والقانون 174 لسنة 2025. يبدأ القانون 174 لسنة 2025 في 1 أكتوبر 2026، وتبقى الأحكام الانتقالية واجبة المراجعة لكل ملف.

## Stage 16
Added the Courts & Authorities center (`#/courts`) with hierarchical authority management, search/filtering, integrity checks, and DB migration v8 indexes.


## Stage 18
أضيف مركز صحة البيانات والأرشيف مع استعادة آمنة للسجلات المؤرشفة وتقرير فحص JSON محلي.

## Stage 20
أضيف مركز القوالب (`#/templates`) لحفظ وإدارة نصوص تشغيلية قابلة لإعادة الاستخدام، مع تصنيف، بحث، حالة نشط/غير نشط، اكتشاف المتغيرات بصيغة `{{variable}}`، ونسخ النص. لا توجد ملفات مرفقة ولا استبدال تلقائي للمتغيرات في هذه المرحلة.
- DB_VERSION 10
- store: `templates`

## Stage 21 — Performance & Scalability
- IndexedDB cursor pagination and indexed prefix search.
- Chunked bulk writes/restores.
- Streamed backup serialization.
- Dashboard/attention/date queries use indexes instead of full-table reads.
- Client and case lists are paginated.
- `#/performance` provides a local performance check.
- Target: remain responsive with very large datasets; legacy specialized screens still require staged pagination conversion before claiming every screen is optimized for hundreds of thousands of rows.


## Stage 25
اختبار حمل مستقل في `performance-load-test.html` يستخدم قاعدة `LawOfficeLoadTestDB` منفصلة، ويولد بيانات اصطناعية ثم يحذف قاعدة الاختبار بعد القياس. لا يتم إدخال بيانات اختبار في قاعدة المكتب. تم أيضًا منع القراءة غير المحدودة عبر `repo.byIndex()` بجعلها محدودة افتراضيًا وإضافة `byIndexPage()` للصفحات.


## Stage 26
- Search 2.0: indexed-first global search, bounded fallback scan, store filter, pagination, direct navigation.
- Async smart selects for high-cardinality client/court lookups in case forms and client lookup in power-of-attorney forms.
- No DB migration; DB_VERSION remains 13.
- App version 1.6.0.


## Stage 27 — Daily Center + Notifications 2.0
- مركز يومي فعلي يستخدم فهارس IndexedDB وحدود قراءة واضحة.
- فلترة زمنية مرتبطة بمركز اليوم.
- تنبيهات تُحدّث تلقائيًا كل 60 ثانية وعند فتح المركز.
- تصنيف التنبيهات حسب مستوى المتابعة دون استنتاج قانوني.
- لا توجد Migration جديدة؛ DB_VERSION يبقى 13.

## Stage 28 — الخط الزمني الموحد وخريطة علاقات القضايا
- توحيد العرض الزمني للقضية من عدة مخازن تشغيلية.
- إضافة `js/cases/case-graph.js` لبناء خريطة علاقات محدودة وآمنة الأداء.
- التوسع في خريطة العلاقات حتى مستويين فقط وبحد أقصى 80 عقدة و120 علاقة.
- منع المسح الشامل لقاعدة البيانات عند بناء الرسم.
- الخط الزمني الموحد محدود إلى 120 عنصرًا في عرض 360 للقضية، مع حدود قراءة لكل مخزن.
- لا توجد Migration جديدة؛ `DB_VERSION` يظل 13.
- إصدار التطبيق 1.8.0.


## Stage 29 — Reports/Statistics 2.0
- رفع كفاءة التقارير والإحصائيات للبيانات الكبيرة.
- التجميع عبر Cursor وفهارس التاريخ بدل تحميل المخازن كاملة إلى الذاكرة.
- إضافة فهرس `cases.filingDate` عبر Migration 14.
- تصدير CSV للقضايا والجلسات والمهام والحركات المالية بصفحات 500 سجل.
- إضافة إعدادات تقارير محفوظة محليًا عبر `localStorage` مع حد أقصى 10 إعدادات.
- لا يتم استخدام `getAll()` في مسار التقارير.
- إصدار التطبيق: 1.9.0 — DB_VERSION: 14.

## Stage 30 — PDF Printing / Save
- Added browser-native print workflow for reports and statistics.
- Reports can be printed directly or saved as PDF through the browser/system print dialog.
- A4 print CSS, Arabic RTL layout, page-break controls, and removal of operational controls from printed output.
- The PDF file is saved by the user through the operating system/browser print dialog, so it can be stored on the phone or computer.
- No external PDF service, API, backend, or paid dependency is used.
- The app does not claim to store a PDF inside IndexedDB; the generated PDF is an external file selected by the user through the browser/system print flow.

## Stage 31
اختبار الحمل وقابلية التوسع 2.0: Web Worker، أحجام اختبار Small/Medium/Large/XLarge، قياسات Cursor/Index، إيقاف الاختبار، وحفظ نتائج JSON. قاعدة الاختبار منفصلة عن LawOfficeDB.

## Stage 32 — اسم المكتب + مزامنة مرآتية آمنة + تحسينات الاستعداد للأداء
- الاسم الرسمي للواجهة: **مكتب الأستاذ / أحمد محمد خضير المحامى**.
- إصدار التطبيق: 2.2.0.
- لا توجد Migration جديدة؛ DB_VERSION يبقى 14.
- إضافة مركز `#/sync` لمزامنة الهاتف والكمبيوتر عبر حزمة مشفرة `.losync`.
- المزامنة الحالية مرآتية وليست دمجًا ثنائي الاتجاه؛ يتم الاستيراد بعد المعاينة والتأكيد الصريح.
- لا توجد خدمة سحابية أو API أو اشتراك مدفوع.
- سبب عدم تفعيل الدمج الثنائي تلقائيًا: المفاتيح الأساسية الحالية رقمية `autoIncrement` والعلاقات تعتمد عليها؛ الدمج الآمن يحتاج ترقية إلى معرفات عالمية ثابتة وسجل تغييرات وحل تعارضات قبل تفعيله.
