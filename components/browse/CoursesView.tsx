'use client';

import { useSession } from 'next-auth/react';

interface CoursesViewProps {
  semesterCourses: any[];
  filteredCourses: any[];
  coursePerms: { canAdd: boolean; canEdit: boolean; canDelete: boolean; canEditLinks: boolean };
  navigateToCourse: (code: string, title: string) => void;
  goBack: () => void;
  setShowAddCourse: (v: boolean) => void;
  setAddCourseCode: (v: string) => void;
  setAddCourseTitle: (v: string) => void;
  setAddCourseError: (v: string) => void;
  setAddCourseSuccess: (v: string) => void;
}

export default function CoursesView({
  semesterCourses, filteredCourses, coursePerms,
  navigateToCourse, goBack,
  setShowAddCourse, setAddCourseCode, setAddCourseTitle, setAddCourseError, setAddCourseSuccess,
}: CoursesViewProps) {
  const { data: session } = useSession();

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
          <i className="fas fa-book"></i> Courses
        </h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goBack}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>
      {semesterCourses.length === 0 && (
        <div className="text-center py-12">
          <i className="fas fa-book-open text-4xl mb-4 block text-qsis opacity-40"></i>
          <p className="text-dark-text font-semibold text-sm mb-1">No courses added yet for this semester.</p>
          <p className="text-dark-text3 text-xs mb-4">Be the first to add a course code and title.</p>
          {session && coursePerms.canAdd && (
            <button onClick={() => {
              setAddCourseCode('');
              setAddCourseTitle('');
              setAddCourseError('');
              setAddCourseSuccess('');
              setShowAddCourse(true);
            }} className="px-5 py-2.5 bg-qsis text-white rounded-xl text-xs font-semibold hover:bg-qsis/90 transition-colors">
              <i className="fas fa-plus mr-1.5"></i>Add Course
            </button>
          )}
        </div>
      )}
      {semesterCourses.length > 0 && filteredCourses.length === 0 && (
        <div className="text-center py-8 text-dark-text2">
          <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
          <p>No courses match your search.</p>
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {filteredCourses.map(course => (
          <div key={course.code} className="p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.3)] transition-all" onClick={() => navigateToCourse(course.code, course.title)}>
            <div className="flex items-center gap-3.5">
              <div className="text-[1.3rem] text-qsis flex-shrink-0"><i className="fas fa-book-open"></i></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[0.95rem]">{course.code} — {course.title}</div>
                <div className="flex gap-2 mt-[5px] flex-wrap">
                  {course.categories.map((cat: any) => (
                    <span key={cat.key} className={`text-[0.68rem] px-2 py-[2px] rounded-full border ${(cat as any).hasLinks ? 'bg-pink-500/15 text-pink-400 border-pink-500/40 font-semibold' : (cat as any).hasMd ? 'bg-blue-500/15 text-blue-400 border-blue-500/40 font-semibold' : 'bg-dark-bg3 text-dark-text2 border-dark-border'}`}>
                      {cat.label}: {cat.count}
                      {(cat as any).hasLinks && <i className="fas fa-link ml-1 text-[0.55rem]"></i>}
                      {!(cat as any).hasLinks && (cat as any).hasMd && <i className="fas fa-file-alt ml-1 text-[0.55rem]"></i>}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[0.75rem] text-dark-text2 flex items-center gap-1.5 justify-end">
                  {(course as any).hasSharedLinks && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 text-[0.6rem] font-bold border border-pink-500/30"><i className="fas fa-link text-[0.55rem]"></i>Links</span>}
                  {(course as any).hasMd && !(course as any).hasSharedLinks && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.6rem] font-bold border border-blue-500/30"><i className="fas fa-file-alt text-[0.55rem]"></i>.md</span>}
                  {course.totalFiles} files
                </div>
                {course.hasMidFinal && (
                  <div className="flex gap-1 mt-1 justify-end">
                    <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400">Mid Term</span>
                    <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-green-400/15 text-green-400">Final Term</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {session && coursePerms.canAdd && (
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setAddCourseCode('');
              setAddCourseTitle('');
              setAddCourseError('');
              setAddCourseSuccess('');
              setShowAddCourse(true);
            }}
            className="px-5 py-2.5 bg-qsis text-white rounded-xl text-xs font-semibold hover:bg-qsis/90 transition-colors"
          >
            <i className="fas fa-plus mr-1.5"></i>Add Course
          </button>
        </div>
      )}
    </section>
  );
}
