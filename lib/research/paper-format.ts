// Bilingual (EN/AR) theses & research-paper formatting guide: section roadmap,
// style rules and a copyable outline. Pure data — rendered by PaperFormatter.

export interface FormatSection {
  en: string;
  ar: string;
  notes: string[];
}

export interface FormatRule {
  en: string;
  ar: string;
}

export interface PaperFormatGuide {
  id: string;
  name: string;
  nameAr: string;
  sections: FormatSection[];
  rules: FormatRule[];
}

const ENGLISH_SECTIONS: FormatSection[] = [
  { en: '1. Title Page', ar: '1. صفحة العنوان', notes: ['Concise, descriptive title (≤ 12 words).', 'Your name, department, university, supervisor, year.', 'For APA: running head + page number.'] },
  { en: '2. Abstract + Keywords', ar: '2. الملخص والكلمات المفتاحية', notes: ['150–250 words in one paragraph.', 'State: background, aim, method, key findings, implication.', '3–6 keywords below the abstract.'] },
  { en: '3. Introduction', ar: '3. المقدمة', notes: ['Hook → background → research gap → aim & objectives.', 'End with: research question(s) and thesis statement.', 'Cite sources for every claim.'] },
  { en: '4. Literature Review', ar: '4. مراجعة الأدبيات', notes: ['Organize by theme (not by author) or chronologically.', 'Synthesize — compare and connect studies.', 'End by showing how your study fills the gap.'] },
  { en: '5. Methodology', ar: '5. منهجية البحث', notes: ['Design, sample & population, instruments, procedure.', 'Data analysis plan (statistical/textual).', 'Ethical considerations / limitations.'] },
  { en: '6. Results (Findings)', ar: '6. النتائج', notes: ['Report only what the data shows — no interpretation yet.', 'Use tables/figures with captions; refer to them in text.', 'Follow the order of your objectives.'] },
  { en: '7. Discussion', ar: '7. المناقشة', notes: ['Interpret results vs. your research questions.', 'Compare with prior studies (lit review).', 'Explain unexpected findings; acknowledge limitations.'] },
  { en: '8. Conclusion', ar: '8. الخاتمة', notes: ['Summarize the answer to your research question.', 'State contributions (theoretical/practical).', 'Give future research directions — do NOT add new data.'] },
  { en: '9. References / Bibliography', ar: '9. المراجع', notes: ['Alphabetical order (APA/Chicago) or numbered [1] (IEEE).', 'Only sources you actually cited.', 'Check DOIs and page ranges.'] },
  { en: '10. Appendices', ar: '10. الملاحق', notes: ['Questionnaires, transcripts, raw tables.', 'Each appendix labelled: Appendix A, B…', 'Reference each appendix in the text.'] },
];

const ARABIC_SECTIONS: FormatSection[] = ENGLISH_SECTIONS.map((s) => ({ ...s }));

export const PAPER_GUIDES: PaperFormatGuide[] = [
  {
    id: 'apa',
    name: 'Research Paper — APA 7',
    nameAr: 'بحث علمي — APA',
    sections: ENGLISH_SECTIONS,
    rules: [
      { en: 'Margins 1" (2.54 cm) on all sides.', ar: 'الهوامش 2.54 سم من جميع الجهات.' },
      { en: 'Font Times New Roman 12 pt, double-spaced.', ar: 'الخط Times New Roman مقاس 12، تباعد مزدوج.' },
      { en: 'In-text citation: (Author, Year, p. X).', ar: 'الاستشهاد داخل النص: (المؤلف، السنة، ص X).' },
      { en: 'References list alphabetized; journal titles & volumes in italics.', ar: 'قائمة المراجع أبجدية؛ اسم المجلة والمجلد بخط مائل.' },
    ],
  },
  {
    id: 'ieee',
    name: 'Research Paper — IEEE',
    nameAr: 'بحث علمي — IEEE',
    sections: ENGLISH_SECTIONS,
    rules: [
      { en: 'Numbered references in square brackets [1].', ar: 'المراجع مرقّمة بأقواس مربعة [1].' },
      { en: 'In-text citation by number: “as shown in [2]”.', ar: 'الاستشهاد داخل النص برقم المرجع: «كما في [2]».' },
      { en: 'Single column (draft) or two-column (IEEE format).', ar: 'عمود واحد، أو عمودان وفق صيغة IEEE.' },
      { en: 'Figures & tables numbered separately with captions.', ar: 'ترقيم الأشكال والجداول منفصلا مع عناوين توضيحية.' },
    ],
  },
  {
    id: 'mla',
    name: 'Research Paper — MLA 9',
    nameAr: 'بحث علمي — MLA',
    sections: ENGLISH_SECTIONS,
    rules: [
      { en: 'Margins 1", Times New Roman 12 pt.', ar: 'هوامش 2.54 سم، خط 12.' },
      { en: 'Works Cited page: author, "title." container, year.', ar: 'صفحة المصادر: المؤلف، «العنوان». المجلة، السنة.' },
      { en: 'In-text: (Author page) e.g. (Smith 24).', ar: 'داخل النص: (المؤلف الصفحة).' },
    ],
  },
  {
    id: 'chicago',
    name: 'Research Paper — Chicago',
    nameAr: 'بحث علمي — شيكاغو',
    sections: ENGLISH_SECTIONS,
    rules: [
      { en: 'Two systems: Notes-Bibliography (humanities) or Author-Date (sciences).', ar: 'نظامان: الحواشي وقائمة المصادر، أو المؤلف-التاريخ.' },
      { en: 'Footnotes/endnotes numbered with superscript; full citation on first use.', ar: 'حواشي سفلية مرقمة؛ توثيق كامل عند أول ورود.' },
      { en: 'Bibliography entries are single-spaced with hanging indent.', ar: 'قائمة المصادر بتباعد مفرد مع تعليق السطر الأول.' },
      { en: 'Title page style follows your department (no running head in Chicago).', ar: 'صفحة العنوان حسب قسمك (بلا ترويسة في شيكاغو).' },
    ],
  },
  {
    id: 'thesis',
    name: 'Thesis / Dissertation',
    nameAr: 'رسالة علمية',
    sections: [
      { en: 'Front matter: Title, Declaration, Approval, Dedication, Acknowledgements, Abstract, Table of Contents, List of Tables/Figures, Abbreviations.', ar: 'المقدمة: صفحة العنوان، التعهد، الموافقة، الإهداء، الشكر، الملخص، الفهرس، قائمة الجداول والأشكال، الاختصارات.', notes: ENGLISH_SECTIONS[0].notes },
      { en: 'Main body: Introduction → Literature → Methodology → Results → Discussion → Conclusion.', ar: 'المتن: المقدمة → الأدبيات → المنهجية → النتائج → المناقشة → الخاتمة.', notes: ENGLISH_SECTIONS[2].notes },
      { en: 'Back matter: References, Appendices, Index (optional).', ar: 'الخاتمة: المراجع، الملاحق، الفهرس.', notes: ENGLISH_SECTIONS[8].notes },
    ],
    rules: [
      { en: 'Follow your university template exactly (margins, fonts, numbering).', ar: 'اتبع قالب جامعتك بدقة (الهوامش، الخطوط، الترقيم).' },
      { en: 'Number chapters and headings consistently (1, 1.1, 1.1.1).', ar: 'رقّم الفصول والعناوين بانتظام (1، 1.1، 1.1.1).' },
      { en: 'Every section must be cited and referenced.', ar: 'يجب توثيق كل مقطع بالإشارة إلى مصادره.' },
    ],
  },
  {
    id: 'ar',
    name: 'بحث عربي / رسالة عربية',
    nameAr: 'دراسة بحثية بالعربية',
    sections: [
      { en: '1. صفحة العنوان', ar: '1. صفحة العنوان', notes: ['عنوان موجز وواضح.', 'الاسم والقسم والجامعة والمشرف والسنة.'] },
      { en: '2. الملخص والكلمات المفتاحية', ar: '2. الملخص والكلمات المفتاحية', notes: ['200-300 كلمة / فقرة واحدة.', 'الخلفية، الهدف، المنهج، أهم النتائج، التوصية.', '3-6 كلمات مفتاحية.'] },
      { en: '3. المقدمة', ar: '3. المقدمة', notes: ['التمهيد، الإطار، مشكلة البحث، أهدافه وأسئلته.', 'تنتهي بفرضية أو أسئلة البحث.'] },
      { en: '4. الإطار النظري / الدراسات السابقة', ar: '4. الإطار النظري / الدراسات السابقة', notes: ['تنظيم حسب الموضوع أو التسلسل الزمني.', 'خلاصة موضحا مكان الدراسة من هذه الجهود.'] },
      { en: '5. منهجية الدراسة', ar: '5. منهجية الدراسة', notes: ['التصميم، المجتمع والعينة، الأدوات، الإجراءات.', 'أساليب التحليل وحدود الدراسة.'] },
      { en: '6. نتائج الدراسة', ar: '6. نتائج الدراسة', notes: ['عرض النتائج فقط مرتبة حسب الأهداف.', 'جداول وأشكال مرقمة.'] },
      { en: '7. مناقشة النتائج', ar: '7. مناقشة النتائج', notes: ['تفسير النتائج في ضوء الأهداف والدراسات السابقة.'] },
      { en: '8. الخلاصة والتوصيات', ar: '8. الخلاصة والتوصيات', notes: ['إجابة موجزة عن أسئلة البحث.', 'توصيات ومقترحات أبحاث مستقبلية.'] },
      { en: '9. قائمة المراجع', ar: '9. قائمة المراجع', notes: ['مرتبة أبجديا حسب نظام التوثيق المعتمد.', 'أسماء المراجع العربية ثم الأجنبية أو كاملة.'] },
      { en: '10. الملاحق', ar: '10. الملاحق', notes: ['الاستبيانات، النصوص، الجداول الأولية.'] },
    ],
    rules: [
      { en: 'Right-to-left layout throughout; margins mirrored.', ar: 'الاتجاه من اليمين إلى اليسار، والهوامش معكوسة.' },
      { en: 'Fonts: Traditional Arabic / Amiri / Sakkal Majalla 14–16 pt, 1.5 line spacing.', ar: 'الخطوط: Traditional Arabic / Amiri / Sakkal Majalla بحجم 14-16، تباعد 1.5.' },
      { en: 'Diacritics (تشكيل) where required; numbers follow the university preference.', ar: 'اضبط التشكيل حيث يلزم، واتبع نظام الأرقام المعتمد في الجامعة.' },
    ],
  },
];

export function guideSectionsCopy(guide: PaperFormatGuide): string {
  return guide.sections
    .map((s, i) => `${s.en}\n${s.notes.map((n) => `  • ${n}`).join('\n')}`)
    .join('\n\n');
}