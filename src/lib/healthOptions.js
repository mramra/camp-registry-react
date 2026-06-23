/**
 * healthOptions.js — قوائم ثابتة للحالات الصحية التفصيلية
 * مستخدمة في HealthStatusModal لرب الأسرة والأفراد.
 * نُقلت من النسخة القديمة (HTML) بنفس المفاتيح والتسميات لضمان توافق البيانات القديمة.
 */
export const DISABILITY_TYPES = [
  { key:'motor',   label:'حركية',  details:['كرسي متحرك','عكاز','أخرى'] },
  { key:'visual',  label:'بصرية',  details:['كلي','جزئي'] },
  { key:'hearing', label:'سمعية',  details:['كلي','جزئي'] },
  { key:'mental',  label:'ذهنية',  details:[] },
  { key:'speech',  label:'نطقية',  details:[] },
  { key:'multiple',label:'متعددة', details:[] },
]

export const INJURY_TYPES = [
  { key:'amputation', label:'بتر أطراف',  details:['يد يمنى','يد يسرى','ساق يمنى','ساق يسرى','أصابع','متعدد'] },
  { key:'burns',      label:'حروق',        details:['درجة أولى','درجة ثانية','درجة ثالثة'] },
  { key:'shrapnel',   label:'شظايا',       details:[] },
  { key:'spine',      label:'إصابة عمود فقري', details:[] },
  { key:'brain',      label:'إصابة دماغية', details:[] },
  { key:'war_blind',  label:'فقد بصر بالحرب', details:[] },
  { key:'other',      label:'أخرى',         details:[] },
]

export const CHRONIC_DISEASES = [
  { key:'diabetes',   label:'سكري',   details:['نوع 1','نوع 2'] },
  { key:'pressure',   label:'ضغط الدم', details:[] },
  { key:'heart',      label:'قلب',     details:[] },
  { key:'kidney',     label:'كلى',     details:['فشل','غسيل'] },
  { key:'cancer',     label:'سرطان',   details:[] },
  { key:'asthma',     label:'ربو',     details:[] },
  { key:'epilepsy',   label:'صرع',     details:[] },
  { key:'psychiatric',label:'نفسي',    details:[] },
  { key:'other',      label:'أخرى',    details:[] },
]

export const FEMALE_STATUSES = ['حامل']

export const ORPHAN_TYPES = [
  { key:'father', label:'يتيم الأب' },
  { key:'mother', label:'يتيم الأم' },
  { key:'both',   label:'يتيم الأبوين' },
]

export const ORPHAN_CAUSES = ['استشهاد', 'مرض', 'حادث', 'أخرى']

/** يبني قيمة فارغة سليمة لكل الحقول الصحية التفصيلية (لرب الأسرة أو أي فرد) */
export function emptyHealthFields() {
  return {
    orphan_status: null,
    orphan_cause: null,
    disabilities: [],
    injuries: [],
    chronic_diseases: [],
    female_status: [],
  }
}
