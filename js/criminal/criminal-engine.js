const CURRENT_DATE='2026-09-24';
const RULES=Object.freeze([
  {id:'egypt-criminal-procedure-legacy',name:'الإجراءات الجنائية السارية قبل 1 أكتوبر 2026',effectiveFrom:'1950-11-14',effectiveTo:'2026-09-30',law:'قانون الإجراءات الجنائية رقم 150 لسنة 1950 وتعديلاته',sourceType:'official',sourceReference:'قانون الإجراءات الجنائية رقم 150 لسنة 1950 — الجريدة الرسمية/منشورات قانونية',sourceUrl:'https://manshurat.org/node/14676',version:'legacy-2026-09-24'},
  {id:'egypt-criminal-procedure-174-2025',name:'قانون الإجراءات الجنائية رقم 174 لسنة 2025',effectiveFrom:'2026-10-01',effectiveTo:null,law:'القانون رقم 174 لسنة 2025 بإصدار قانون الإجراءات الجنائية',sourceType:'official',sourceReference:'الجريدة الرسمية — العدد 45 مكرر (د) في 12 نوفمبر 2025',sourceUrl:'https://moj.gov.eg/backend/api/documents/download/20F3150C-29F1-487E-A0F0-FCCE10CB207B',version:'174-2025-2026-09-24'}
]);
export function listCriminalLawVersions(){return RULES.slice()}
export function getCriminalLawVersion(date=new Date().toISOString().slice(0,10)){
  return RULES.find(r=>date>=r.effectiveFrom&&(!r.effectiveTo||date<=r.effectiveTo))||null;
}
export function getCriminalLawNotice(date=new Date().toISOString().slice(0,10)){
  const r=getCriminalLawVersion(date);
  if(!r)return {rule:null,text:'تعذر تحديد النظام الزمني من التاريخ المدخل.'};
  if(r.id==='egypt-criminal-procedure-174-2025')return {rule:r,text:'من 1 أكتوبر 2026 يبدأ العمل بالقانون رقم 174 لسنة 2025. راجع الأحكام الانتقالية لكل ملف ولا تفترض سريان القانون الجديد على واقعة أو طعن لمجرد تسجيله بعد هذا التاريخ.'};
  return {rule:r,text:'حتى 30 سبتمبر 2026 يظل قانون الإجراءات الجنائية رقم 150 لسنة 1950 وتعديلاته هو المرجع الإجرائي العام، مع مراعاة التعديلات والأحكام الانتقالية الخاصة بكل مسألة.'};
}
