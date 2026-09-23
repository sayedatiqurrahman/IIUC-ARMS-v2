// Demo/sample inputs for the AI-likeness tools. Clearly marked as sample data
// so users can try the tool before pasting their own text.

export const DEMO_TEXT_EN = `In today's fast-paced world, technology plays a vital role in education, and it is important to note that classrooms are changing rapidly. Moreover, digital tools allow teachers to leverage a comprehensive range of resources, which enhances the learning experience for students.

Furthermore, the landscape of academic writing has shifted, and many students now utilize artificial intelligence to draft their essays. In conclusion, educators must understand these tools, because they play a crucial role in modern learning, while also fostering honest academic habits.`;

export const DEMO_TEXT_AR = `في عالم اليوم المتسارع، تلعب التكنولوجيا دوراً محورياً في التعليم، ومن المهم الإشارة إلى أن الفصول الدراسية تتغير بسرعة. علاوة على ذلك، تتيح الأدوات الرقمية للمعلمين الاستفادة من موارد شاملة تسهم في تحسين تجربة التعلّم لدى الطلاب.

وفي الختام، فإن على المربّين أن يفهموا هذه الأدوات، لأنها تلعب دوراً حاسماً في التعلّم الحديث، مع ضرورة تعزيز العادات الأكاديمية الصادقة.`;

export function demoResult(fileName = 'demo.txt'): {
  fileName: string;
  kind: 'text';
  text: string;
  paragraphs: number;
  words: number;
  chars: number;
} {
  return {
    fileName,
    kind: 'text',
    text: DEMO_TEXT_EN,
    paragraphs: 2,
    words: DEMO_TEXT_EN.trim().split(/\s+/).length,
    chars: DEMO_TEXT_EN.trim().length,
  };
}