import { APP_CONFIG } from '../config.js';
import { STORES } from '../core/constants.js';
import { repo } from '../db/repositories.js';
import { newId } from '../core/ids.js';
import { nowISO } from '../core/utils.js';
import { getSetting, putSetting } from '../core/settings.js';
import { buildBackupText, createBackup } from '../backup/backup.js';
import { encryptBackupText, decryptBackupText } from '../backup/crypto.js';
import { validateBackupPayload, restoreBackup, getBackupSummary } from '../backup/restore.js';
import { escapeHtml } from '../core/utils.js';

const DEVICE_KEY = 'sync.deviceId';
const LAST_SYNC_KEY = 'sync.last';
const PACKAGE_FORMAT = 'law-office-sync-package';
const PACKAGE_VERSION = 1;


export async function getDeviceId() {
  const existing = await getSetting(DEVICE_KEY);
  if (existing?.value) return String(existing.value);
  const id = newId('device');
  await putSetting(DEVICE_KEY, id);
  return id;
}

export async function getLastSync() {
  const row = await getSetting(LAST_SYNC_KEY);
  return row?.value || null;
}

function downloadText(text, fileName) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function createSyncPackage(password, { requireHealthy = false } = {}) {
  const deviceId = await getDeviceId();
  const backup = await buildBackupText({ requireHealthy });
  const encrypted = await encryptBackupText(backup.text, password);
  const packageCreatedAt = nowISO();
  const wrapper = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    createdAt: packageCreatedAt,
    deviceId,
    appVersion: APP_CONFIG.version,
    dbVersion: APP_CONFIG.dbVersion,
    mode: 'mirror',
    warning: 'هذه حزمة مزامنة مرآتية: الاستعادة تستبدل بيانات الجهاز المستهدف بعد تأكيد صريح. ليست مزامنة دمج ثنائية الاتجاه.',
    backup: JSON.parse(encrypted)
  };
  const fileName = `law-office-sync-${packageCreatedAt.replace(/[:.]/g, '-')}.losync`;
  downloadText(JSON.stringify(wrapper), fileName);
  await putSetting(LAST_SYNC_KEY, {
    direction: 'export',
    date: packageCreatedAt,
    deviceId,
    fileName,
    dataSha256: backup.dataSha256,
    recordCounts: backup.recordCounts
  });
  return { fileName, deviceId, packageCreatedAt, summary: getBackupSummary(JSON.parse(backup.text)) };
}

export async function parseSyncPackage(file, password) {
  if (!file) throw new Error('لم يتم اختيار حزمة مزامنة.');
  if (file.size > 1024 * 1024 * 1024) throw new Error('الحزمة أكبر من 1 جيجابايت؛ لا يُنصح باستعادتها عبر المتصفح.');
  let wrapper;
  try { wrapper = JSON.parse(await file.text()); }
  catch { throw new Error('حزمة المزامنة ليست JSON صالحًا.'); }
  if (wrapper?.format !== PACKAGE_FORMAT) throw new Error('الملف ليس حزمة مزامنة معتمدة لهذا التطبيق.');
  if (Number(wrapper.version) !== PACKAGE_VERSION) throw new Error('إصدار حزمة المزامنة غير مدعوم.');
  const plain = await decryptBackupText(wrapper.backup, password);
  let payload;
  try { payload = JSON.parse(plain); }
  catch { throw new Error('البيانات بعد فك التشفير غير صالحة.'); }
  const validation = await validateBackupPayload(payload);
  const summary = getBackupSummary(payload);
  return { wrapper, payload, warnings: validation.warnings, summary, fileName: file.name, fileSize: file.size };
}

export async function applySyncPackage(parsed, { confirm = false, onProgress } = {}) {
  if (!confirm) throw new Error('تطبيق المزامنة يتطلب تأكيدًا صريحًا.');
  await createBackup({ requireHealthy: false });
  const result = await restoreBackup(parsed, { confirm: true, onProgress });
  const date = nowISO();
  await putSetting(LAST_SYNC_KEY, {
    direction: 'import',
    date,
    deviceId: await getDeviceId(),
    sourceDeviceId: parsed.wrapper?.deviceId || null,
    fileName: parsed.fileName || '',
    recordCounts: parsed.summary?.counts || null,
    status: result.ok ? 'success' : 'warning'
  });
  return result;
}

export async function renderSyncPage(page) {
  const [deviceId, lastSync] = await Promise.all([getDeviceId(), getLastSync()]);
  page.innerHTML = `
    <section class="card">
      <div class="section-title"><div><span class="eyebrow">المزامنة</span><h2>مزامنة الهاتف والكمبيوتر</h2><p class="muted">مزامنة محلية آمنة عبر ملف مشفر، دون خدمة سحابية أو حساب خارجي.</p></div></div>
      <div class="notice"><strong>تنبيه معماري مهم:</strong> هذه النسخة تستخدم مزامنة مرآتية آمنة. الجهاز المصدر يصدر حزمة مشفرة، والجهاز المستهدف يستوردها بعد المعاينة والتأكيد. لا يوجد دمج تلقائي ثنائي الاتجاه في هذه المرحلة.</div>
      <div class="detail-grid">
        <div><span>معرّف الجهاز</span><strong>${escapeHtml(deviceId)}</strong></div>
        <div><span>إصدار التطبيق</span><strong>${escapeHtml(APP_CONFIG.version)}</strong></div>
        <div><span>قاعدة البيانات</span><strong>${escapeHtml(String(APP_CONFIG.dbVersion))}</strong></div>
        <div><span>آخر مزامنة</span><strong>${escapeHtml(lastSync?.date || 'لا توجد')}</strong></div>
      </div>
    </section>

    <section class="card">
      <h2>1 — إرسال بيانات الجهاز</h2>
      <p class="muted">على الكمبيوتر: أنشئ الحزمة ثم انقل الملف إلى الهاتف. أو العكس إذا كان الهاتف هو مصدر البيانات.</p>
      <div class="form-grid">
        <label>كلمة مرور الحزمة*<input id="syncExportPassword" class="input" type="password" autocomplete="new-password" required></label>
      </div>
      <button id="syncExport" class="primary-button">🔐 إنشاء حزمة مزامنة مشفرة</button>
      <div id="syncExportResult" class="notice hidden"></div>
    </section>

    <section class="card">
      <h2>2 — استقبال بيانات الجهاز الآخر</h2>
      <input id="syncFile" class="input" type="file" accept=".losync,application/json">
      <div class="form-grid" style="margin-top:12px">
        <label>كلمة مرور الحزمة*<input id="syncImportPassword" class="input" type="password" autocomplete="current-password"></label>
      </div>
      <div class="row-actions" style="margin-top:12px"><button id="syncPreview" class="secondary-button">🔎 معاينة</button><button id="syncApply" class="danger-button" disabled>⚠️ استبدال بيانات هذا الجهاز</button></div>
      <div id="syncPreviewBox" class="notice" style="margin-top:12px">اختر الحزمة ثم اضغط «معاينة».</div>
      <div id="syncProgress" class="muted" style="margin-top:8px"></div>
    </section>

    <section class="card">
      <h2>طريقة العمل الموصى بها</h2>
      <ol class="simple-list">
        <li>اجعل الكمبيوتر هو النسخة الرئيسية للبيانات.</li>
        <li>قبل مغادرة المكتب، أنشئ حزمة مزامنة مشفرة من الكمبيوتر.</li>
        <li>انقل الملف إلى الهاتف واستورده بعد المعاينة.</li>
        <li>إذا سجلت بيانات جديدة على الهاتف، لا تنشئ حزمة من الجهازين بالتوازي؛ اختر جهازًا مصدرًا واحدًا ثم انقل آخر نسخة إلى الجهاز الآخر.</li>
      </ol>
      <p class="muted">السبب: قاعدة البيانات الحالية تستخدم مفاتيح رقمية محلية autoIncrement وعلاقات داخلية رقمية. بناء مزامنة ثنائية الاتجاه حقيقية يتطلب ترقية لاحقة إلى معرفات عالمية ثابتة لكل سجل مع سجل تغييرات وحل تعارضات.</p>
    </section>`;

  let parsed = null;
  page.querySelector('#syncExport').addEventListener('click', async () => {
    const password = page.querySelector('#syncExportPassword').value;
    const resultBox = page.querySelector('#syncExportResult');
    resultBox.classList.remove('hidden');
    resultBox.textContent = 'جاري إنشاء الحزمة…';
    try {
      const result = await createSyncPackage(password);
      resultBox.textContent = `تم إنشاء ${result.fileName} بنجاح. انقل الملف إلى الجهاز الآخر.`;
    } catch (error) { resultBox.textContent = error.message || 'تعذر إنشاء الحزمة.'; }
  });

  page.querySelector('#syncPreview').addEventListener('click', async () => {
    const file = page.querySelector('#syncFile').files[0];
    const password = page.querySelector('#syncImportPassword').value;
    const box = page.querySelector('#syncPreviewBox');
    try {
      parsed = await parseSyncPackage(file, password);
      const source = parsed.wrapper?.deviceId || 'غير معروف';
      box.innerHTML = `<strong>معاينة الحزمة:</strong><br>الجهاز المصدر: ${escapeHtml(source)}<br>تاريخ الإنشاء: ${escapeHtml(parsed.wrapper?.createdAt || '—')}<br>عدد السجلات: ${escapeHtml(String(parsed.summary.totalRecords))}<br>${parsed.warnings.length ? `<span class="danger">تحذيرات: ${escapeHtml(parsed.warnings.join(' | '))}</span>` : 'التحقق الأساسي ناجح.'}<br><strong>الاستعادة ستستبدل بيانات هذا الجهاز بعد التأكيد.</strong>`;
      page.querySelector('#syncApply').disabled = false;
    } catch (error) {
      parsed = null;
      page.querySelector('#syncApply').disabled = true;
      box.textContent = error.message || 'تعذر قراءة الحزمة.';
    }
  });

  page.querySelector('#syncApply').addEventListener('click', async () => {
    if (!parsed) return;
    const ok = confirm('سيتم استبدال بيانات هذا الجهاز ببيانات حزمة المزامنة بعد إنشاء نسخة طوارئ. هل تريد المتابعة؟');
    if (!ok) return;
    const progress = page.querySelector('#syncProgress');
    progress.textContent = 'جاري الاستعادة…';
    try {
      const result = await applySyncPackage(parsed, { confirm: true, onProgress: p => { progress.textContent = `استعادة ${p.index}/${p.total}: ${p.store} — ${p.records.toLocaleString()} سجل`; } });
      progress.textContent = result.ok ? 'تمت المزامنة بنجاح. أعد تحميل التطبيق.' : `تمت المزامنة مع ${result.issues.length} مشكلة؛ راجع صحة البيانات.`;
      page.querySelector('#syncApply').disabled = true;
    } catch (error) { progress.textContent = error.message || 'فشلت المزامنة.'; }
  });
  return () => {};
}
