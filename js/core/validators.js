import { normalizeText } from './utils.js';

export function required(value, label) {
  if (!normalizeText(value)) throw new Error(`${label} مطلوب.`);
  return value;
}

export function validateEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

export function validatePhone(value) {
  if (!value) return true;
  return /^[0-9+\-()\s]{7,25}$/.test(String(value));
}

export function validateNationalId(value) {
  if (!value) return true;
  return /^\d{14}$/.test(String(value));
}

export function validateClient(input) {
  required(input.fullName, 'اسم العميل');
  if (input.email && !validateEmail(input.email)) throw new Error('البريد الإلكتروني غير صحيح.');
  if (input.phone1 && !validatePhone(input.phone1)) throw new Error('رقم الهاتف الأول غير صحيح.');
  if (input.phone2 && !validatePhone(input.phone2)) throw new Error('رقم الهاتف الثاني غير صحيح.');
  if (input.nationalId && !validateNationalId(input.nationalId)) throw new Error('الرقم القومي يجب أن يتكون من 14 رقمًا عند إدخاله.');
  return true;
}

export function validateOpponent(input) {
  required(input.name, 'اسم الخصم/الطرف');
  if (input.email && !validateEmail(input.email)) throw new Error('البريد الإلكتروني غير صحيح.');
  if (input.phone && !validatePhone(input.phone)) throw new Error('رقم الهاتف غير صحيح.');
  if (input.nationalId && !validateNationalId(input.nationalId)) throw new Error('الرقم القومي يجب أن يتكون من 14 رقمًا عند إدخاله.');
  return true;
}

export function validatePowerOfAttorney(input) {
  required(input.clientId, 'العميل');
  required(input.number, 'رقم التوكيل');
  if (!Number.isInteger(Number(input.year)) || Number(input.year) < 1900 || Number(input.year) > 2200) {
    throw new Error('سنة التوكيل غير صحيحة.');
  }
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('تاريخ التوكيل غير صحيح.');
  if (input.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate)) throw new Error('تاريخ الانتهاء غير صحيح.');
  if (input.cancellationDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.cancellationDate)) throw new Error('تاريخ الإلغاء غير صحيح.');
  return true;
}

export function validateId(value, label = 'المعرف') {
  if (value == null || value === '' || !Number.isFinite(Number(value))) throw new Error(`${label} غير صحيح.`);
  return true;
}

export function validateCase(input) {
  required(input.caseNumber, 'رقم القضية');
  if (!Number.isInteger(Number(input.caseYear)) || Number(input.caseYear) < 1900 || Number(input.caseYear) > 2200) {
    throw new Error('سنة القضية غير صحيحة.');
  }
  required(input.caseType, 'نوع القضية');
  if (input.filingDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.filingDate)) throw new Error('تاريخ قيد القضية غير صحيح.');
  if (input.caseValue && String(input.caseValue).length > 100) throw new Error('قيمة القضية طويلة بصورة غير متوقعة.');
  if (input.subject && String(input.subject).length > 5000) throw new Error('موضوع القضية يتجاوز الحد المسموح.');
  if (input.notes && String(input.notes).length > 10000) throw new Error('ملاحظات القضية تتجاوز الحد المسموح.');
  return true;
}
