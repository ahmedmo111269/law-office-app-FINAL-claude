import { repo } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { toISODate, addDays } from '../core/dates.js';

const VERSION = '2026-09-24-verified';
const SOURCE_1920 = 'https://manshurat.org/node/879';
const SOURCE_1929 = 'https://manshurat.org/node/12369';
const SOURCE_MOSS = 'https://www.moss.gov.eg/';
const NOW = () => new Date().toISOString();

export const FAMILY_RULES = Object.freeze([
  { ruleId:'egypt-family-wife-past-maintenance-limit', name:'عدم سماع دعوى نفقة الزوجة عن مدة ماضية تزيد على سنة', category:'family-maintenance', jurisdiction:'Egypt', effectiveFrom:'1985-07-04', effectiveTo:null, duration:1, unit:'year', startRule:'filing-date', firstDayRule:'rule-specific', lastDayRule:'rule-specific', holidayRule:'not-applicable', weekendRule:'not-applicable', sourceType:'legislation', sourceReference:'القانون رقم 25 لسنة 1920 المعدل بالقانون 100 لسنة 1985 — المادة 1', sourceUrl:SOURCE_1920, notes:'هذه قاعدة لسماع دعوى النفقة الزوجية عن مدة ماضية وليست قاعدة تلقائية لتحديد كل متجمد نفقة في كل ملف. يجب فحص نوع النفقة وتاريخ رفع الدعوى والوقائع والأحكام ذات الصلة.', active:true, version:VERSION, verificationDate:'2026-09-24' },
  { ruleId:'egypt-family-idda-maintenance-one-year', name:'نفقة العدة — حد سنة لسماع الدعوى', category:'family-maintenance', jurisdiction:'Egypt', effectiveFrom:'1929-03-25', effectiveTo:null, duration:1, unit:'year', startRule:'divorce-date', firstDayRule:'rule-specific', lastDayRule:'rule-specific', holidayRule:'not-applicable', weekendRule:'not-applicable', sourceType:'legislation', sourceReference:'القانون رقم 25 لسنة 1929 — المادة 17', sourceUrl:SOURCE_1929, notes:'القاعدة تتعلق بسماع دعوى نفقة العدة لأكثر من سنة من تاريخ الطلاق. لا يستخدمها البرنامج وحده لتقرير استحقاق أو سقوط أي مبلغ.', active:true, version:VERSION, verificationDate:'2026-09-24' },
  { ruleId:'egypt-family-execution-fund', name:'صندوق نظام تأمين الأسرة — بيانات تنفيذ الحكم', category:'family-execution-support', jurisdiction:'Egypt', effectiveFrom:'2004-01-01', effectiveTo:null, duration:null, unit:null, startRule:'court-judgment', firstDayRule:'not-applicable', lastDayRule:'not-applicable', holidayRule:'not-applicable', weekendRule:'not-applicable', sourceType:'official', sourceReference:'وزارة التضامن الاجتماعي — صندوق نظام تأمين الأسرة', sourceUrl:SOURCE_MOSS, notes:'معلومة إجرائية عامة عن الصندوق وليست حاسبة لاستحقاق الصرف أو قيمته.', active:true, version:VERSION, verificationDate:'2026-09-24' }
]);

function dateOnly(v){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))) return null;
  const [y,m,d]=String(v).split('-').map(Number); const x=new Date(y,m-1,d);
  return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d?x:null;
}
function money(v){const n=Number(v);return Number.isFinite(n)?Math.round(n*100):0}
function displayMoneyMinor(n){return (Number(n||0)/100).toFixed(2)}
function monthsInclusive(from,to){
  const a=dateOnly(from), b=dateOnly(to); if(!a||!b||b<a) return 0;
  return (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth()) + 1;
}
function monthStart(v){const d=dateOnly(v); return d?new Date(d.getFullYear(),d.getMonth(),1):null}
function monthKey(v){const d=dateOnly(v); return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:''}
function nextMonth(v){const d=monthStart(v); return d?toISODate(new Date(d.getFullYear(),d.getMonth()+1,1)):null}

export async function ensureFamilyRules(){
  const r=repo(STORES.legalRules), rows=await r.all({ limit: 500 }), ids=new Set(rows.map(x=>x.ruleId));
  for(const rule of FAMILY_RULES) if(!ids.has(rule.ruleId)) await r.add({...rule,createdAt:NOW(),updatedAt:NOW()});
}
export async function listFamilyRules(){
  return (await repo(STORES.legalRules).all({ limit: 500 })).filter(x=>x.active!==false&&String(x.ruleId||'').startsWith('egypt-family-')).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar'));
}

export function validatePeriod(period){
  const from=dateOnly(period.fromDate), to=dateOnly(period.toDate); if(!from||!to) throw new Error('يجب إدخال تاريخ بداية ونهاية صحيحين للفترة.');
  if(to<from) throw new Error('تاريخ نهاية الفترة لا يجوز أن يسبق تاريخ بدايتها.');
  const amount=period.monthlyAmountMinor!=null?Number(period.monthlyAmountMinor):money(period.monthlyAmount); if(!Number.isInteger(amount)||amount<0) throw new Error('قيمة النفقة الشهرية غير صحيحة.');
  return {fromDate:toISODate(from),toDate:toISODate(to),monthlyAmountMinor:amount,category:String(period.category||'نفقة')};
}

export function calculateArrears({periods=[], payments=[], fromDate, toDate, includeOnlyFullMonths=false}){
  const start=dateOnly(fromDate), end=dateOnly(toDate); if(!start||!end) throw new Error('أدخل تاريخ بداية ونهاية الحساب.');
  if(end<start) throw new Error('نهاية الحساب لا يجوز أن تسبق بدايته.');
  const normalized=periods.map(validatePeriod).filter(p=>p.toDate>=toISODate(start)&&p.fromDate<=toISODate(end));
  const warnings=[
    'هذه حاسبة مالية للمبالغ المدخلة، وليست حكماً باستحقاق النفقة أو بسريانها أو بصحة الحكم أو الإعلان.',
    'لا يفترض البرنامج من تلقاء نفسه تاريخ بدء الاستحقاق أو تاريخ انتهاء الاستحقاق؛ يجب إدخالهما وفق السند القانوني والحكم والوقائع.',
    'لا تُفرض تلقائياً قاعدة السنة الواحدة أو أي مدة سماع على نتيجة المتجمد؛ لأن ذلك يتوقف على نوع النفقة وطلبات الدعوى وتواريخها والوقائع والسند القانوني.'
  ];
  const paymentRows=payments.map(p=>({date:p.paymentDate,amountMinor:Math.max(0,money(p.amount)),category:p.category||'سداد',reference:p.reference||''})).filter(p=>dateOnly(p.date)&&dateOnly(p.date)>=start&&dateOnly(p.date)<=end);
  let totalDue=0; const details=[];
  for(const p of normalized){
    const a=dateOnly(p.fromDate)<start?start:dateOnly(p.fromDate), b=dateOnly(p.toDate)>end?end:dateOnly(p.toDate);
    if(!a||!b||b<a) continue;
    const monthCount=monthsInclusive(toISODate(a),toISODate(b));
    const amount=p.monthlyAmountMinor*monthCount;
    totalDue+=amount;
    details.push({category:p.category,fromDate:toISODate(a),toDate:toISODate(b),months:monthCount,monthlyAmountMinor:p.monthlyAmountMinor,dueMinor:amount});
  }
  const totalPaid=paymentRows.reduce((s,p)=>s+p.amountMinor,0);
  const remaining=Math.max(0,totalDue-totalPaid);
  if(totalPaid>totalDue) warnings.push('إجمالي المدفوعات المدخلة يتجاوز إجمالي المبالغ المحسوبة للفترة؛ تم إظهار المتبقي بصفر، والفارق يحتاج مراجعة مستقلة.');
  return {calculatorType:'family-maintenance-arrears',fromDate:toISODate(start),toDate:toISODate(end),details,totalDueMinor:totalDue,totalPaidMinor:totalPaid,remainingMinor:remaining,overpaymentMinor:Math.max(0,totalPaid-totalDue),currency:'EGP',calculatedAt:NOW(),warnings,assumptions:[includeOnlyFullMonths?'تم الحساب بوحدات شهرية كاملة وفق الفترة المدخلة.':'تم احتساب كل شهر يقع داخل الفترة باعتباره شهراً كاملاً؛ الفترات الجزئية تحتاج إدخالاً خاصاً ومراجعة قانونية/حسابية.']};
}

export async function saveArrearsCalculation(result,caseId=null){
  return repo(STORES.calculationHistory).add({calculatorType:'family-maintenance-arrears',caseId:caseId?Number(caseId):null,ruleId:'family-maintenance-calculation-bundle',ruleVersion:VERSION,inputs:{fromDate:result.fromDate,toDate:result.toDate},result:{details:result.details,totalDueMinor:result.totalDueMinor,totalPaidMinor:result.totalPaidMinor,remainingMinor:result.remainingMinor,overpaymentMinor:result.overpaymentMinor,currency:result.currency},warnings:result.warnings,assumptions:result.assumptions,calculatedAt:result.calculatedAt,notes:''});
}

export async function listFamilyDetails(){return (await repo(STORES.familyDetails).all({ limit: 500 })).filter(x=>!x.archived).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
export async function listFamilyPeriods(familyDetailsId){return (await repo(STORES.familyMaintenancePeriods).all({ limit: 500 })).filter(x=>String(x.familyDetailsId)===String(familyDetailsId)).sort((a,b)=>String(a.fromDate).localeCompare(String(b.fromDate)));}
export async function listFamilyPayments(familyDetailsId){return (await repo(STORES.familyPayments).all({ limit: 500 })).filter(x=>String(x.familyDetailsId)===String(familyDetailsId)).sort((a,b)=>String(a.paymentDate).localeCompare(String(b.paymentDate)));}
export async function addFamilyPeriod(input){const p=validatePeriod(input); return repo(STORES.familyMaintenancePeriods).add({...p,caseId:input.caseId?Number(input.caseId):null,familyDetailsId:Number(input.familyDetailsId),currency:'EGP',notes:String(input.notes||''),createdAt:NOW(),updatedAt:NOW()});}
export async function addFamilyPayment(input){const amount=money(input.amount); if(amount<0)throw new Error('قيمة السداد غير صحيحة.'); const d=dateOnly(input.paymentDate); if(!d)throw new Error('تاريخ السداد غير صحيح.'); return repo(STORES.familyPayments).add({caseId:input.caseId?Number(input.caseId):null,familyDetailsId:Number(input.familyDetailsId),paymentDate:toISODate(d),amountMinor:amount,currency:'EGP',method:String(input.method||''),reference:String(input.reference||''),notes:String(input.notes||''),createdAt:NOW(),updatedAt:NOW()});}
export {displayMoneyMinor,monthKey,nextMonth};
