// Client-side .docx report export using the docx package (dynamically loaded so
// the research toolkit's initial bundle stays small). Builds a fully formatted
// report — stats, coloured sentence scan, rewrite suggestions, repeated phrases
// and the full analysed text — then triggers a download.

interface SentenceHit {
  phrase: string;
  suggestion?: string;
}

interface ReportSentence {
  text: string;
  score: number;
  color: string;
  label: string;
  hits: SentenceHit[];
}

interface ReportRewrite {
  original?: string;
  alternatives: string[];
}

interface ReportRepeatHit {
  phrase: string;
  occurrences: number;
}

export interface DocxReportInput {
  fileName: string;
  aiScore: number;
  aiLabel: string;
  aiColor: string;
  overview: Array<{ label: string; value: string }>;
  sentences: ReportSentence[];
  rewrites: ReportRewrite[];
  repeats: {
    percent: number;
    totalRepeatWords: number;
    totalWords: number;
    hits: ReportRepeatHit[];
  };
  text: string;
  lang: 'en' | 'ar';
}

const STR = {
  en: {
    title: 'AI & Readability Report',
    file: 'File',
    overview: '1. Overview',
    scan: '2. Sentence-by-sentence AI scan',
    rewrites: '3. Rewrite suggestions',
    repeats: '4. In-document repeated phrases',
    fullText: '5. Full text',
    alt: 'alternative',
    generated: 'Generated',
    onDevice: 'Analysed locally in the browser — nothing uploaded.',
    score: 'AI-generated likelihood',
  },
  ar: {
    title: 'تقرير فحص الذكاء الاصطناعي وجودة الصياغة',
    file: 'الملف',
    overview: '1. نظرة عامة',
    scan: '2. فحص الجمل جملةً جملة (ذكاء اصطناعي)',
    rewrites: '3. اقتراحات إعادة الصياغة',
    repeats: '4. العبارات المتكررة داخل المستند',
    fullText: '5. النص الكامل',
    alt: 'بديل',
    generated: 'أُنشئ',
    onDevice: 'حُلّل محليا في المتصفح — لم يُرفع أي شيء.',
    score: 'احتمال أن يكون النص مولدا بالذكاء الاصطناعي',
  },
};

export async function downloadDocxReport(input: DocxReportInput): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = await import('docx');
  const L = STR[input.lang];

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text, bold: true, size: 22, color: '7C3AED' })],
    });

  const children: any[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: L.title, bold: true, size: 36, color: '1F2937' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: `${L.generated} ${new Date().toLocaleString()} · ${input.fileName}`, size: 18, color: '6B7280' })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `${L.score}: `, bold: true, size: 24 }),
        new TextRun({ text: `${input.aiScore}% — ${input.aiLabel}`, bold: true, size: 28, color: input.aiColor.replace('#', '') }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: L.onDevice, italics: true, size: 16, color: '6B7280' }),
      ],
    }),
  ];

  children.push(heading(L.overview));
  for (const o of input.overview) {
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: `${o.label}: `, bold: true, size: 20 }), new TextRun({ text: o.value, size: 20 })],
      })
    );
  }

  children.push(heading(L.scan));
  for (const s of input.sentences) {
    children.push(
      new Paragraph({
        spacing: { before: 120 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: s.color.replace('#', '') } },
        indent: { left: 240 },
        children: [
          new TextRun({ text: `[${s.score}% ${s.label}] `, bold: true, color: s.color.replace('#', ''), size: 18 }),
          new TextRun({ text: s.text, size: 20 }),
        ],
      })
    );
    for (const h of s.hits) {
      children.push(
        new Paragraph({
          bullet: { level: 1 },
          children: [
            new TextRun({ text: `“${h.phrase}” → `, color: 'DC2626', size: 18 }),
            new TextRun({ text: h.suggestion || '', color: '059669', size: 18 }),
          ],
        })
      );
    }
  }
  if (input.sentences.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: '-', size: 20 })] }));
  }

  children.push(heading(L.rewrites));
  input.rewrites
    .filter((r) => r.original && r.alternatives.length > 0)
    .forEach((r) => {
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ text: r.original!, color: 'DC2626', size: 20 })],
        })
      );
      r.alternatives.forEach((a, i) => {
        children.push(
          new Paragraph({
            bullet: { level: 1 },
            children: [new TextRun({ text: `${L.alt} ${i + 1}: `, italics: true, size: 18 }), new TextRun({ text: a, color: '059669', size: 20 })],
          })
        );
      });
    });

  children.push(heading(L.repeats));
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `${input.repeats.percent.toFixed(1)}% `, bold: true, size: 20 }),
        new TextRun({ text: `(${input.repeats.totalRepeatWords}/${input.repeats.totalWords})`, size: 18 }),
      ],
    })
  );
  for (const h of input.repeats.hits.slice(0, 25)) {
    children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: `${h.occurrences}×  “${h.phrase}”`, size: 18 })] }));
  }

  children.push(heading(L.fullText));
  for (const para of input.text.split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: para.trim(), size: 20 })] }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  const base = input.fileName.replace(/\.(pdf|docx|txt|md)$/i, '') || 'report';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}-${input.lang === 'ar' ? 'تقرير' : 'report'}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}