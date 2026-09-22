// Research outline / structure template generator (English + Arabic).
// Returns a typical academic paper skeleton. Sections are placeholder language;
// researchers adapt the wording to their field.

export interface OutlineSection {
  heading: string;
  headingAr: string;
  bullets: string[];
  bulletsAr: string[];
}

export interface OutlineTemplate {
  title: string;
  titleAr: string;
  sections: OutlineSection[];
}

export const STANDARD_OUTLINE: OutlineTemplate = {
  title: 'Standard Research Outline',
  titleAr: 'خريطة بحث قياسية',
  sections: [
    {
      heading: '1. Introduction',
      headingAr: '1. المقدمة',
      bullets: ['Background and importance of the topic', 'Statement of the problem', 'Research questions', 'Objectives', 'Scope and limitations'],
      bulletsAr: ['خلفية الموضوع وأهميته', 'بيان المشكلة', 'أسئلة البحث', 'أهداف البحث', 'نطاق البحث وحدوده'],
    },
    {
      heading: '2. Literature Review',
      headingAr: '2. الدراسات السابقة',
      bullets: ['Review of prior studies', 'Theoretical framework', 'Conceptual framework', 'Research gap'],
      bulletsAr: ['استعراض الدراسات السابقة', 'الإطار النظري', 'الإطار المفاهيمي', 'الفجوة البحثية'],
    },
    {
      heading: '3. Methodology',
      headingAr: '3. منهجية البحث',
      bullets: ['Research design', 'Population and sample', 'Data collection instruments', 'Data analysis methods', 'Ethical considerations'],
      bulletsAr: ['تصميم البحث', 'المجتمع والعينة', 'أدوات جمع البيانات', 'أساليب تحليل البيانات', 'الاعتبارات الأخلاقية'],
    },
    {
      heading: '4. Results',
      headingAr: '4. النتائج',
      bullets: ['Presentation of findings', 'Tables and figures', 'Answering the research questions'],
      bulletsAr: ['عرض النتائج', 'الجداول والأشكال', 'الإجابة عن أسئلة البحث'],
    },
    {
      heading: '5. Discussion',
      headingAr: '5. المناقشة',
      bullets: ['Interpretation of results', 'Comparison with prior studies', 'Implications'],
      bulletsAr: ['تفسير النتائج', 'المقارنة مع الدراسات السابقة', 'الدلالات والتطبيقات'],
    },
    {
      heading: '6. Conclusion',
      headingAr: '6. الخاتمة',
      bullets: ['Summary of key findings', 'Recommendations', 'Limitations and future research'],
      bulletsAr: ['ملخص النتائج الرئيسة', 'التوصيات', 'حدود الدراسة وبحوث مستقبلية'],
    },
    {
      heading: '7. References & Appendices',
      headingAr: '7. المراجع والملاحق',
      bullets: ['Reference list by chosen citation style', 'Appendices: instruments, tables'],
      bulletsAr: ['قائمة المراجع وفق أسلوب التوثيق المختار', 'الملاحق: الأدوات والجداول'],
    },
  ],
};

export const DISSERTATION_OUTLINE: OutlineTemplate = {
  title: 'Dissertation / Thesis Outline',
  titleAr: 'هيكل الرسالة العلمية',
  sections: [
    {
      heading: 'Front matter',
      headingAr: 'الصفحات التمهيدية',
      bullets: ['Title page', 'Abstract (EN + AR)', 'Dedication & acknowledgments', 'Table of contents', 'List of tables and figures', 'List of abbreviations'],
      bulletsAr: ['صفحة العنوان', 'الملخص (عربي + إنجليزي)', 'الإهداء والشكر', 'فهرس المحتويات', 'قائمة الجداول والأشكال', 'قائمة الاختصارات'],
    },
    ...STANDARD_OUTLINE.sections.map((s, i) => (i === 4 ? { ...s, bullets: [...s.bullets, 'Chapter conclusions'] } : s)).map((s) => ({ ...s })),
  ],
};