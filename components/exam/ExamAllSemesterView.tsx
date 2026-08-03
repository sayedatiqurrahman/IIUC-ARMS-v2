'use client';

import { ExamSlot } from '@/lib/exam-routine-config';
import { ExamRoutineItem } from './types';
import { ExamAllStep } from './types';
import { useExamAllSemesterState } from './useExamAllSemesterState';
import ExamSetupStep from './ExamSetupStep';
import ExamCoursesStep from './ExamCoursesStep';
import ExamAssignStep from './ExamAssignStep';

interface ExamAllSemesterViewProps {
  examSlots: ExamSlot[];
  publishedRoutines: ExamRoutineItem[];
  examRoutines: ExamRoutineItem[];
  canPublish: boolean;
  profile: { name: string; title?: string };
  email: string;
  onPublish: (items: ExamRoutineItem[]) => Promise<void>;
  onSaveToCloud: (items: ExamRoutineItem[]) => Promise<void>;
  onSaveDraft: (items: ExamRoutineItem[]) => void;
  canSaveToGithub: boolean;
  onAutoSaveDraft: (draft: any) => void;
  editDraftId: string | null;
  editDraftData: any;
  onClearEditDraft: () => void;
  onBack: () => void;
}

export default function ExamAllSemesterView(props: ExamAllSemesterViewProps) {
  const state = useExamAllSemesterState(props);

  const steps: { key: ExamAllStep; label: string; icon: string; num: number }[] = [
    { key: 'setup', label: 'Setup', icon: 'cog', num: 1 },
    { key: 'courses', label: 'Courses', icon: 'book', num: 2 },
    { key: 'assign', label: 'Assign & Publish', icon: 'table', num: 3 },
  ];
  const currentStepIdx = steps.findIndex(s => s.key === state.step);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div>
          <h3 className="text-[1.1rem] font-bold text-dark-text"><i className="fas fa-layer-group text-qsis mr-2"></i>All Semester Exam Routine</h3>
          <p className="text-[0.75rem] text-dark-text2 mt-0.5">3 simple steps — setup, courses, assign & publish</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.canPublish && (
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); state.setShowPublishMenu(!state.showPublishMenu); }} className="routine-btn routine-btn-primary"><i className="fas fa-share-alt mr-1"></i>Publish All ({state.totalSections} semesters) <i className="fas fa-caret-down ml-1"></i></button>
              {state.showPublishMenu && (
                <div className="absolute right-0 top-full mt-1 bg-dark-bg2 border border-dark-border rounded-lg shadow-xl z-50 py-1 min-w-[220px]">
                  <button onClick={(e) => { e.stopPropagation(); state.handleSaveDraftAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-file-alt text-yellow-400"></i>Save as Draft
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Local only</span>
                  </button>
                  <div className="border-t border-dark-border my-0.5"></div>
                  <button onClick={(e) => { e.stopPropagation(); state.handleSaveToCloudAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-cloud text-blue-400"></i>Save to Cloud
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Private</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); state.handlePublishAll(); }} className="w-full text-left px-3 py-2 text-[0.8rem] text-dark-text hover:bg-dark-bg3 flex items-center gap-2">
                    <i className="fas fa-globe text-green-400"></i>Publish
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">Public</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <button onClick={props.onBack} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
        </div>
      </div>

      <div className="routine-builder-steps">
        {steps.map((s, idx) => (
          <div key={s.key} className={`routine-step ${state.step === s.key ? 'active' : ''} ${idx < currentStepIdx ? 'completed' : ''}`}>
            <div className="routine-step-num">{idx < currentStepIdx ? <i className="fas fa-check"></i> : s.num}</div>
            <span className="routine-step-label">{s.label}</span>
            {idx < steps.length - 1 && <div className="routine-step-line"></div>}
          </div>
        ))}
      </div>

      {state.step === 'setup' && (
        <ExamSetupStep
          sessionVal={state.sessionVal} setSessionVal={state.setSessionVal}
          department={state.department} setDepartment={state.setDepartment}
          examType={state.examType} setExamType={state.setExamType}
          draftGender={state.draftGender} setDraftGender={state.setDraftGender}
          rows={state.rows} updateRow={state.updateRow} addRow={state.addRow} removeRow={state.removeRow}
          semesters={state.semesters} toggleSemester={state.toggleSemester}
          onNext={() => state.setStep('courses')}
        />
      )}

      {state.step === 'courses' && (
        <ExamCoursesStep
          enabledSemesters={state.enabledSemesters} semLabels={state.semLabels}
          activeSemTab={state.activeSemTab} setActiveSemTab={state.setActiveSemTab}
          courseSuggestionsIdx={state.courseSuggestionsIdx} setCourseSuggestionsIdx={state.setCourseSuggestionsIdx}
          courseSearch={state.courseSearch} setCourseSearch={state.setCourseSearch}
          courseInputRef={state.courseInputRef}
          filteredCourseSuggestions={state.filteredCourseSuggestions} allCourses={state.allCourses}
          updateSemCourse={state.updateSemCourse} addSemCourse={state.addSemCourse}
          removeSemCourse={state.removeSemCourse} saveCourseToGitHub={state.saveCourseToGitHub}
          setSemesters={state.setSemesters} canSaveToGithub={state.canSaveToGithub}
          onBack={() => state.setStep('setup')} onNext={() => state.setStep('assign')}
        />
      )}

      {state.step === 'assign' && (
        <ExamAssignStep
          rows={state.rows} setRows={state.setRows}
          enabledSlots={state.enabledSlots} enabledSemesters={state.enabledSemesters}
          semLabels={state.semLabels} totalSections={state.totalSections}
          showPublishMenu={state.showPublishMenu} setShowPublishMenu={state.setShowPublishMenu}
          handleSaveDraftAll={state.handleSaveDraftAll} handleSaveToCloudAll={state.handleSaveToCloudAll}
          handlePublishAll={state.handlePublishAll} onBack={() => state.setStep('courses')}
        />
      )}
      {state.confirmDialog}
    </>
  );
}
