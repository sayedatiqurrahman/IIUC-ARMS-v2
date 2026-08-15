import type { FieldSpec, HubTheme } from './types';
import type { Profile } from '@/lib/store/types';

// A4 page in CSS px @ 96dpi = 794 x 1123. The design canvas is ALWAYS rendered
// at the chosen page size — it is only scaled down visually to fit the screen,
// so exports are pixel-perfect A4 regardless of the user's viewport.
export const PAGE_SIZES: Record<string, { label: string; width: number; height: number }> = {
  a4: { label: 'A4', width: 794, height: 1123 },
  'a4-landscape': { label: 'A4 Landscape', width: 1123, height: 794 },
  a3: { label: 'A3', width: 1123, height: 1587 },
  a5: { label: 'A5', width: 559, height: 794 },
  letter: { label: 'Letter', width: 816, height: 1056 },
};

// Human labels for known data-field-type values (used when a community design
// does not ship its own labels).
export const FIELD_LABELS: Record<string, string> = {
  university_name: 'University Name',
  department: 'Department',
  thesis_title: 'Thesis Title',
  degree_name: 'Degree Name',
  assignment_title: 'Assignment Title',
  course_title: 'Course Title',
  course_code: 'Course Code',
  student_name: 'Student Name',
  student_id: 'Student ID',
  supervisor_name: 'Supervisor Name',
  teacher_name: "Teacher's Name",
  semester_year: 'Session / Year',
  submission_date: 'Submission Date',
};

// ─── Default theme HTML (bundled fallback — the same files live in the
// themes repo under themes/<id>/design.html and are fetched when available). ─

const THEME_HTML: Record<string, string> = {
  'thesis-english': `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0">
<div style="width:794px;height:1123px;background:#ffffff;color:#1f2937;font-family:'Georgia','Times New Roman',serif;position:relative;overflow:hidden;box-sizing:border-box;">
<div style="position:absolute;top:0;left:0;right:0;height:16px;background:linear-gradient(90deg,#0f766e,#059669,#22c55e);"></div>
<div style="position:absolute;top:16px;left:0;right:0;height:6px;background:#14532d;"></div>
<div style="position:absolute;top:64px;left:0;right:0;text-align:center;">
<div style="font-size:22px;font-weight:bold;color:#0f766e;letter-spacing:1px;" data-field-type="university_name">International Islamic University Chittagong</div>
<div style="font-size:13px;color:#374151;margin-top:6px;" data-field-type="department">Department of Qur'anic Sciences and Islamic Studies</div>
<div style="width:180px;height:3px;background:#059669;margin:16px auto;"></div></div>
<div style="position:absolute;top:300px;left:80px;right:80px;text-align:center;">
<div style="font-size:12px;letter-spacing:6px;color:#0f766e;text-transform:uppercase;">Thesis</div>
<div style="font-size:34px;font-weight:bold;color:#14532d;line-height:1.35;margin-top:18px;" data-field-type="thesis_title">A Study on the Preservation of the Holy Qur'an</div>
<div style="font-size:15px;color:#4b5563;margin-top:18px;">Submitted in partial fulfilment of the requirements for the degree of</div>
<div style="font-size:16px;color:#374151;font-weight:600;margin-top:8px;" data-field-type="degree_name">Bachelor of Arts (Hons.)</div></div>
<div style="position:absolute;top:760px;left:120px;right:120px;text-align:center;">
<table style="margin:0 auto;border-collapse:collapse;font-size:15px;color:#1f2937;"><tr><td style="padding:6px 18px;text-align:right;">Candidate</td><td style="padding:6px 18px;text-align:left;font-weight:bold;" data-field-type="student_name">Md. Abdur Rahman</td></tr>
<tr><td style="padding:6px 18px;text-align:right;">ID</td><td style="padding:6px 18px;text-align:left;font-weight:bold;" data-field-type="student_id">Q233099</td></tr>
<tr><td style="padding:6px 18px;text-align:right;">Supervisor</td><td style="padding:6px 18px;text-align:left;font-weight:bold;" data-field-type="supervisor_name">Dr. Aminul Islam</td></tr>
<tr><td style="padding:6px 18px;text-align:right;">Session</td><td style="padding:6px 18px;text-align:left;font-weight:bold;" data-field-type="semester_year">2025-2026</td></tr></table></div>
<div style="position:absolute;bottom:64px;left:0;right:0;text-align:center;"><div style="font-size:14px;color:#374151;" data-field-type="submission_date">December 2026</div><div style="width:180px;height:3px;background:#059669;margin:14px auto;"></div></div>
</div></body></html>`,

  'thesis-arabic': `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0">
<div style="width:794px;height:1123px;background:#ffffff;color:#1f2937;font-family:'Amiri','Traditional Arabic','Times New Roman',serif;position:relative;overflow:hidden;box-sizing:border-box;">
<div style="position:absolute;top:0;left:0;right:0;height:16px;background:linear-gradient(90deg,#0f766e,#059669,#22c55e);"></div>
<div style="position:absolute;top:16px;left:0;right:0;height:6px;background:#14532d;"></div>
<div style="position:absolute;top:64px;left:0;right:0;text-align:center;">
<div style="font-size:24px;font-weight:bold;color:#0f766e;" data-field-type="university_name">الجامعة الإسلامية العالمية تشيتاغونغ</div>
<div style="font-size:15px;color:#374151;margin-top:8px;" data-field-type="department">قسم العلوم القرآنية والدراسات الإسلامية</div>
<div style="width:180px;height:3px;background:#059669;margin:16px auto;"></div></div>
<div style="position:absolute;top:300px;left:80px;right:80px;text-align:center;">
<div style="font-size:14px;letter-spacing:4px;color:#0f766e;">رسالة</div>
<div style="font-size:36px;font-weight:bold;color:#14532d;line-height:1.4;margin-top:18px;" data-field-type="thesis_title">دراسة في حفظ القرآن الكريم</div>
<div style="font-size:16px;color:#4b5563;margin-top:18px;">مقدمة لاستكمال متطلبات الحصول على درجة</div>
<div style="font-size:17px;color:#374151;font-weight:600;margin-top:8px;" data-field-type="degree_name">البكالوريوس في الآداب (مع مرتبة الشرف)</div></div>
<div style="position:absolute;top:760px;left:120px;right:120px;text-align:center;">
<table style="margin:0 auto;border-collapse:collapse;font-size:16px;color:#1f2937;" dir="rtl"><tr><td style="padding:6px 18px;">اسم الطالب</td><td style="padding:6px 18px;font-weight:bold;" data-field-type="student_name">محمد عبد الرحمن</td></tr>
<tr><td style="padding:6px 18px;">الرقم الجامعي</td><td style="padding:6px 18px;font-weight:bold;" data-field-type="student_id">Q233099</td></tr>
<tr><td style="padding:6px 18px;">المشرف</td><td style="padding:6px 18px;font-weight:bold;" data-field-type="supervisor_name">د. أمين الإسلام</td></tr>
<tr><td style="padding:6px 18px;">السنة الدراسية</td><td style="padding:6px 18px;font-weight:bold;" data-field-type="semester_year">2025-2026</td></tr></table></div>
<div style="position:absolute;bottom:64px;left:0;right:0;text-align:center;"><div style="font-size:15px;color:#374151;" data-field-type="submission_date">ديسمبر 2026</div><div style="width:180px;height:3px;background:#059669;margin:14px auto;"></div></div>
</div></body></html>`,

  'assignment-a-english': `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0">
<div style="width:794px;height:1123px;background:#ffffff;color:#1f2937;font-family:'Segoe UI',Arial,sans-serif;position:relative;overflow:hidden;box-sizing:border-box;">
<div style="height:130px;background:linear-gradient(120deg,#1e40af,#2563eb);color:#fff;padding:28px 56px;box-sizing:border-box;">
<div style="font-size:13px;letter-spacing:5px;text-transform:uppercase;opacity:.85;" data-field-type="university_name">International Islamic University Chittagong</div>
<div style="font-size:20px;font-weight:700;margin-top:10px;">Department of <span data-field-type="department">Qur'anic Sciences and Islamic Studies</span></div></div>
<div style="position:absolute;top:130px;left:0;right:0;height:8px;background:#f59e0b;"></div>
<div style="padding:70px 56px 0 56px;">
<div style="display:inline-block;padding:6px 22px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Assignment</div>
<div style="font-size:36px;font-weight:800;color:#111827;line-height:1.3;margin-top:22px;" data-field-type="assignment_title">The Significance of Sunnah in Islamic Jurisprudence</div>
<div style="font-size:14px;color:#6b7280;margin-top:14px;" data-field-type="course_code">CSE-101 | Islamic Studies</div></div>
<div style="margin:70px 56px 0 56px;">
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:24px 30px;">
<div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#2563eb;font-weight:700;margin-bottom:18px;">Submitted By</div>
<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e5e7eb;font-size:16px;"><span style="color:#6b7280;">Name</span><span style="font-weight:700;" data-field-type="student_name">Md. Abdur Rahman</span></div>
<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e5e7eb;font-size:16px;"><span style="color:#6b7280;">ID</span><span style="font-weight:700;" data-field-type="student_id">Q233099</span></div>
<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:16px;"><span style="color:#6b7280;">Submitted to</span><span style="font-weight:700;" data-field-type="teacher_name">Dr. Aminul Islam</span></div></div></div>
<div style="position:absolute;bottom:0;left:0;right:0;background:#111827;color:#fff;padding:22px 56px;display:flex;justify-content:space-between;font-size:13px;box-sizing:border-box;"><span data-field-type="semester_year">Fall 2025</span><span data-field-type="submission_date">December 2026</span></div>
</div></body></html>`,

  'assignment-a-arabic': `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0">
<div style="width:794px;height:1123px;background:#ffffff;color:#1f2937;font-family:'Segoe UI','Traditional Arabic',Arial,sans-serif;position:relative;overflow:hidden;box-sizing:border-box;">
<div style="height:130px;background:linear-gradient(120deg,#1e40af,#2563eb);color:#fff;padding:28px 56px;box-sizing:border-box;">
<div style="font-size:14px;letter-spacing:3px;opacity:.85;" data-field-type="university_name">الجامعة الإسلامية العالمية تشيتاغونغ</div>
<div style="font-size:21px;font-weight:700;margin-top:10px;"><span data-field-type="department">قسم العلوم القرآنية والدراسات الإسلامية</span></div></div>
<div style="position:absolute;top:130px;left:0;right:0;height:8px;background:#f59e0b;"></div>
<div style="padding:70px 56px 0 56px;">
<div style="display:inline-block;padding:6px 22px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:14px;font-weight:700;letter-spacing:2px;">واجب</div>
<div style="font-size:36px;font-weight:800;color:#111827;line-height:1.4;margin-top:22px;" data-field-type="assignment_title">أهمية السنة في الفقه الإسلامي</div>
<div style="font-size:14px;color:#6b7280;margin-top:14px;" data-field-type="course_code">CSE-101 | الدراسات الإسلامية</div></div>
<div style="margin:70px 56px 0 56px;">
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:24px 30px;">
<div style="font-size:13px;letter-spacing:3px;color:#2563eb;font-weight:700;margin-bottom:18px;">مقدّم من</div>
<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e5e7eb;font-size:16px;"><span style="color:#6b7280;">الاسم</span><span style="font-weight:700;" data-field-type="student_name">محمد عبد الرحمن</span></div>
<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e5e7eb;font-size:16px;"><span style="color:#6b7280;">الرقم الجامعي</span><span style="font-weight:700;" data-field-type="student_id">Q233099</span></div>
<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:16px;"><span style="color:#6b7280;">مقدّم إلى</span><span style="font-weight:700;" data-field-type="teacher_name">د. أمين الإسلام</span></div></div></div>
<div style="position:absolute;bottom:0;left:0;right:0;background:#111827;color:#fff;padding:22px 56px;display:flex;justify-content:space-between;font-size:13px;box-sizing:border-box;"><span data-field-type="submission_date">ديسمبر 2026</span><span data-field-type="semester_year">خريف 2025</span></div>
</div></body></html>`,

  'assignment-b-english': `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0">
<div style="width:794px;height:1123px;background:#fdfcfa;color:#1c1917;font-family:'Palatino','Georgia',serif;position:relative;overflow:hidden;box-sizing:border-box;">
<div style="position:absolute;inset:28px;border:2px solid #1c1917;border-radius:2px;"></div>
<div style="position:absolute;inset:38px;border:1px solid #1c1917;border-radius:1px;"></div>
<div style="position:absolute;top:110px;left:70px;right:70px;text-align:center;">
<div style="font-size:13px;letter-spacing:6px;text-transform:uppercase;color:#a16207;" data-field-type="university_name">International Islamic University Chittagong</div>
<div style="width:70px;height:1px;background:#a16207;margin:18px auto;"></div></div>
<div style="position:absolute;top:330px;left:90px;right:90px;text-align:center;">
<div style="font-size:30px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#292524;">Assignment</div>
<div style="font-size:19px;color:#57534e;margin-top:26px;line-height:1.6;" data-field-type="assignment_title">Role of Women in Islamic Civilization</div>
<div style="font-size:13px;color:#a8a29e;margin-top:18px;letter-spacing:2px;" data-field-type="course_code">HST-204</div></div>
<div style="position:absolute;top:620px;left:120px;right:120px;text-align:center;">
<div style="display:inline-block;text-align:left;font-size:16px;line-height:2.2;">
<div><span style="color:#78716c;">Name &nbsp;&nbsp;</span><span style="font-weight:700;border-bottom:1px solid #292524;padding:0 8px 2px;" data-field-type="student_name">Md. Abdur Rahman</span></div>
<div><span style="color:#78716c;">ID &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-weight:700;border-bottom:1px solid #292524;padding:0 8px 2px;" data-field-type="student_id">Q233099</span></div>
<div><span style="color:#78716c;">Course &nbsp;</span><span style="font-weight:700;border-bottom:1px solid #292524;padding:0 8px 2px;" data-field-type="course_title">Islamic Civilization</span></div>
<div><span style="color:#78716c;">Teacher&nbsp;</span><span style="font-weight:700;border-bottom:1px solid #292524;padding:0 8px 2px;" data-field-type="teacher_name">Dr. Aminul Islam</span></div></div></div>
<div style="position:absolute;bottom:110px;left:0;right:0;text-align:center;">
<div style="font-size:14px;color:#78716c;letter-spacing:3px;" data-field-type="semester_year">Fall 2025</div>
<div style="font-size:12px;color:#a8a29e;margin-top:8px;" data-field-type="submission_date">December 2026</div></div>
</div></body></html>`,

  'assignment-b-arabic': `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0">
<div style="width:794px;height:1123px;background:#fdfcfa;color:#1c1917;font-family:'Palatino','Amiri','Traditional Arabic',serif;position:relative;overflow:hidden;box-sizing:border-box;">
<div style="position:absolute;inset:28px;border:2px solid #1c1917;border-radius:2px;"></div>
<div style="position:absolute;inset:38px;border:1px solid #1c1917;border-radius:1px;"></div>
<div style="position:absolute;top:110px;left:70px;right:70px;text-align:center;">
<div style="font-size:14px;letter-spacing:4px;color:#a16207;" data-field-type="university_name">الجامعة الإسلامية العالمية تشيتاغونغ</div>
<div style="width:70px;height:1px;background:#a16207;margin:18px auto;"></div></div>
<div style="position:absolute;top:330px;left:90px;right:90px;text-align:center;">
<div style="font-size:32px;font-weight:bold;letter-spacing:2px;color:#292524;">واجب</div>
<div style="font-size:21px;color:#57534e;margin-top:26px;line-height:1.7;" data-field-type="assignment_title">دور المرأة في الحضارة الإسلامية</div>
<div style="font-size:13px;color:#a8a29e;margin-top:18px;letter-spacing:2px;" data-field-type="course_code">HST-204</div></div>
<div style="position:absolute;top:620px;left:120px;right:120px;text-align:center;">
<div style="display:inline-block;text-align:right;font-size:16px;line-height:2.4;">
<div><span style="color:#78716c;">الاسم &nbsp;&nbsp;</span><span style="font-weight:700;border-bottom:1px solid #292524;padding:0 8px 2px;" data-field-type="student_name">محمد عبد الرحمن</span></div>
<div><span style="color:#78716c;">الرقم &nbsp;&nbsp;</span><span style="font-weight:700;border-bottom:1px solid #292524;padding:0 8px 2px;" data-field-type="student_id">Q233099</span></div>
<div><span style="color:#78716c;">المقرر &nbsp;</span><span style="font-weight:700;border-bottom:1px solid #292524;padding:0 8px 2px;" data-field-type="course_title">الحضارة الإسلامية</span></div>
<div><span style="color:#78716c;">المدرس&nbsp;</span><span style="font-weight:700;border-bottom:1px solid #292524;padding:0 8px 2px;" data-field-type="teacher_name">د. أمين الإسلام</span></div></div></div>
<div style="position:absolute;bottom:110px;left:0;right:0;text-align:center;">
<div style="font-size:14px;color:#78716c;letter-spacing:3px;" data-field-type="semester_year">خريف 2025</div>
<div style="font-size:12px;color:#a8a29e;margin-top:8px;" data-field-type="submission_date">ديسمبر 2026</div></div>
</div></body></html>`,
};

const THEME_FIELDS: Record<string, FieldSpec[]> = {
  'thesis-english': [
    { type: 'university_name', label: 'University Name' },
    { type: 'department', label: 'Department' },
    { type: 'thesis_title', label: 'Thesis Title' },
    { type: 'degree_name', label: 'Degree Name' },
    { type: 'student_name', label: 'Student Name' },
    { type: 'student_id', label: 'Student ID' },
    { type: 'supervisor_name', label: 'Supervisor Name' },
    { type: 'semester_year', label: 'Session / Year' },
    { type: 'submission_date', label: 'Submission Date' },
  ],
  'thesis-arabic': [
    { type: 'university_name', label: 'اسم الجامعة' },
    { type: 'department', label: 'القسم' },
    { type: 'thesis_title', label: 'عنوان الرسالة' },
    { type: 'degree_name', label: 'الدرجة العلمية' },
    { type: 'student_name', label: 'اسم الطالب' },
    { type: 'student_id', label: 'الرقم الجامعي' },
    { type: 'supervisor_name', label: 'اسم المشرف' },
    { type: 'semester_year', label: 'السنة الدراسية' },
    { type: 'submission_date', label: 'تاريخ التسليم' },
  ],
  'assignment-a-english': [
    { type: 'university_name', label: 'University Name' },
    { type: 'department', label: 'Department' },
    { type: 'assignment_title', label: 'Assignment Title' },
    { type: 'course_code', label: 'Course Code' },
    { type: 'student_name', label: 'Student Name' },
    { type: 'student_id', label: 'Student ID' },
    { type: 'teacher_name', label: "Teacher's Name" },
    { type: 'semester_year', label: 'Semester / Year' },
    { type: 'submission_date', label: 'Submission Date' },
  ],
  'assignment-a-arabic': [
    { type: 'university_name', label: 'اسم الجامعة' },
    { type: 'department', label: 'القسم' },
    { type: 'assignment_title', label: 'عنوان الواجب' },
    { type: 'course_code', label: 'رمز المقرر' },
    { type: 'student_name', label: 'اسم الطالب' },
    { type: 'student_id', label: 'الرقم الجامعي' },
    { type: 'teacher_name', label: 'اسم المدرس' },
    { type: 'semester_year', label: 'الفصل / السنة' },
    { type: 'submission_date', label: 'تاريخ التسليم' },
  ],
  'assignment-b-english': [
    { type: 'university_name', label: 'University Name' },
    { type: 'assignment_title', label: 'Assignment Title' },
    { type: 'course_code', label: 'Course Code' },
    { type: 'student_name', label: 'Student Name' },
    { type: 'student_id', label: 'Student ID' },
    { type: 'course_title', label: 'Course Title' },
    { type: 'teacher_name', label: "Teacher's Name" },
    { type: 'semester_year', label: 'Semester / Year' },
    { type: 'submission_date', label: 'Submission Date' },
  ],
  'assignment-b-arabic': [
    { type: 'university_name', label: 'اسم الجامعة' },
    { type: 'assignment_title', label: 'عنوان الواجب' },
    { type: 'course_code', label: 'رمز المقرر' },
    { type: 'student_name', label: 'اسم الطالب' },
    { type: 'student_id', label: 'الرقم الجامعي' },
    { type: 'course_title', label: 'اسم المقرر' },
    { type: 'teacher_name', label: 'اسم المدرس' },
    { type: 'semester_year', label: 'الفصل / السنة' },
    { type: 'submission_date', label: 'تاريخ التسليم' },
  ],
};

// Fallback preview URLs (kept for backward-compat; the repo's SVG previews are
// used when reachable).
const THEME_PREVIEWS: Record<string, string> = {
  'thesis-english': 'https://i.postimg.cc/qM3j54Xn/IMG-20250125-WA0004.jpg',
  'thesis-arabic': 'https://i.postimg.cc/q7SjGfXn/IMG-20250125-WA0005.jpg',
  'assignment-a-english': 'https://i.postimg.cc/KckX3HqL/image.png',
  'assignment-a-arabic': 'https://i.postimg.cc/KckX3HqL/image.png',
  'assignment-b-english': 'https://i.postimg.cc/Kj5h9Z60/image.png',
  'assignment-b-arabic': 'https://i.postimg.cc/Kj5h9Z60/image.png',
};

export const BUNDLED_THEMES: HubTheme[] = [
  { id: 'thesis-english', name: 'Thesis English', subtitle: 'Classic academic thesis cover', description: 'A formal English thesis cover page with the IIUC identity, title, candidate, supervisor and year.', language: 'english', categories: ['thesis'], preview: THEME_PREVIEWS['thesis-english'], html: THEME_HTML['thesis-english'], pageSize: 'a4', dir: 'ltr', source: 'fallback', fields: THEME_FIELDS['thesis-english'] },
  { id: 'thesis-arabic', name: 'Thesis Arabic', subtitle: 'غلاف رسالة أكاديمية', description: 'Arabic RTL thesis cover page with university identity, thesis title, candidate and supervisor.', language: 'arabic', categories: ['thesis'], preview: THEME_PREVIEWS['thesis-arabic'], html: THEME_HTML['thesis-arabic'], pageSize: 'a4', dir: 'rtl', source: 'fallback', fields: THEME_FIELDS['thesis-arabic'] },
  { id: 'assignment-a-english', name: 'Assignment Design A (English)', subtitle: 'Modern header-bar assignment cover', description: 'English assignment cover with a bold header band, course info and a clean field grid.', language: 'english', categories: ['assignment'], preview: THEME_PREVIEWS['assignment-a-english'], html: THEME_HTML['assignment-a-english'], pageSize: 'a4', dir: 'ltr', source: 'fallback', fields: THEME_FIELDS['assignment-a-english'] },
  { id: 'assignment-a-arabic', name: 'Assignment Design A (Arabic)', subtitle: 'غلاف واجب عربي', description: 'Arabic RTL assignment cover with a bold header band, course info and a clean field grid.', language: 'arabic', categories: ['assignment'], preview: THEME_PREVIEWS['assignment-a-arabic'], html: THEME_HTML['assignment-a-arabic'], pageSize: 'a4', dir: 'rtl', source: 'fallback', fields: THEME_FIELDS['assignment-a-arabic'] },
  { id: 'assignment-b-english', name: 'Assignment Design B (English)', subtitle: 'Minimal framed assignment cover', description: 'Minimal English assignment cover framed by a double border, centred typography.', language: 'english', categories: ['assignment'], preview: THEME_PREVIEWS['assignment-b-english'], html: THEME_HTML['assignment-b-english'], pageSize: 'a4', dir: 'ltr', source: 'fallback', fields: THEME_FIELDS['assignment-b-english'] },
  { id: 'assignment-b-arabic', name: 'Assignment Design B (Arabic)', subtitle: 'غلاف واجب بسيط', description: 'Minimal Arabic RTL assignment cover framed by a double border, centred typography.', language: 'arabic', categories: ['assignment'], preview: THEME_PREVIEWS['assignment-b-arabic'], html: THEME_HTML['assignment-b-arabic'], pageSize: 'a4', dir: 'rtl', source: 'fallback', fields: THEME_FIELDS['assignment-b-arabic'] },
];

export function getBundledTheme(id: string): HubTheme | undefined {
  return BUNDLED_THEMES.find((t) => t.id === id);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Extract the unique data-field-type values present in a design's HTML.
// This is the "mapping parser" that powers Form Fill-up for any design.
export function extractFieldTypes(html: string): string[] {
  const set = new Set<string>();
  const re = /data-field-type\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) set.add(m[1]);
  }
  return Array.from(set);
}

export function fieldLabel(type: string, known?: FieldSpec[]): string {
  const f = known?.find((k) => k.type === type);
  return f?.label || FIELD_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Auto-Fill: map dashboard profile fields to design placeholders.
export interface AutoFillRule {
  type: string;
  label: string;
  get: (p: Profile) => string;
}

export const AUTO_FILL_RULES: AutoFillRule[] = [
  { type: 'student_name', label: 'Student Name', get: (p) => p.name || '' },
  { type: 'student_id', label: 'Student ID', get: (p) => p.universityId || '' },
  { type: 'department', label: 'Department', get: (p) => p.department || '' },
  { type: 'university_name', label: 'University Name', get: () => 'International Islamic University Chittagong' },
  { type: 'semester_year', label: 'Session / Year', get: (p) => p.semester || '' },
  { type: 'email', label: 'Email', get: (p) => p.email || '' },
];

// Apply field values to an HTML string and return the re-serialized markup.
// Falls back to a plain string replace when DOMParser is unavailable.
export function applyFieldValuesToString(html: string, values: Record<string, string>): string {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    let out = html;
    for (const [type, value] of Object.entries(values)) {
      const re = new RegExp(`(data-field-type\\s*=\\s*["']${type}["'][^>]*>)[^<]*(<)`, 'g');
      out = out.replace(re, `$1${escapeXml(value)}$2`);
    }
    return out;
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const [type, value] of Object.entries(values)) {
      const els = doc.querySelectorAll(`[data-field-type="${type}"]`);
      els.forEach((el) => {
        el.textContent = value;
      });
    }
    const body = doc.body;
    return body.innerHTML;
  } catch {
    return html;
  }
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Snake-case the folder-name parts of a publish target:
// full_name-metric_id@email_design_sn
export function snakeCasePart(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9_.@]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildCommunityFolder(name: string, email: string, universityId: string, designSn: number): string {
  const fullName = snakeCasePart(name);
  const metric = snakeCasePart(universityId || email.split('@')[0] || 'student');
  const sn = String(designSn).padStart(2, '0');
  return `${fullName}-${metric}@${snakeCasePart(email)}_design_${sn}`;
}
