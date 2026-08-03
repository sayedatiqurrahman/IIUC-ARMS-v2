'use client';

import { ExamSlot } from '@/lib/exam-routine-config';
import { findDepartment } from '@/lib/departments';
import { ExamRoutineItem } from './types';

interface ExamRoutineCardProps {
  routine: ExamRoutineItem;
  slots: ExamSlot[];
  onView: () => void;
  onEdit?: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onDelete?: () => void;
  canManage: boolean;
  isPublished?: boolean;
  currentUserEmail?: string;
  isAdmin?: boolean;
}

export default function ExamRoutineCard({ routine, slots, onView, onEdit, onPublish, onUnpublish, onDelete, canManage, isPublished, currentUserEmail, isAdmin }: ExamRoutineCardProps) {
  const deptInfo = findDepartment(routine.department);
  const isCreator = !!currentUserEmail && !!routine.publishedBy?.email && routine.publishedBy.email === currentUserEmail;
  const canDelete = isCreator || isAdmin || canManage;

  return (
    <div className={`bg-dark-bg2 border rounded-xl p-4 ${isPublished ? 'border-green-500/30' : 'border-dark-border'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-[0.9rem] font-bold text-dark-text">{routine.examType} Exam</h4>
              {isPublished && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.65rem] font-semibold"><i className="fas fa-globe mr-0.5"></i>Published</span>}
              {!isPublished && routine.status === 'saved' && <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.65rem] font-semibold"><i className="fas fa-cloud mr-0.5"></i>Saved to Cloud</span>}
              {routine.isDraft && <span className="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-[0.65rem] font-semibold">Draft</span>}
            </div>
            <p className="text-[0.75rem] text-dark-text2 mt-0.5">
              {routine.semester} &bull; {routine.session} &bull; {deptInfo?.department.shortName || routine.department}
            </p>
            {routine.publishedBy && (
              <p className="text-[0.68rem] text-dark-text3 mt-0.5">
                <i className="fas fa-user-check mr-1"></i>{isPublished ? 'Published by' : 'Saved by'} {routine.publishedBy.name}{routine.publishedBy.title ? ` (${routine.publishedBy.title})` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
          <button onClick={onView} className="routine-btn"><i className="fas fa-eye mr-1"></i>View</button>
          {onEdit && <button onClick={onEdit} className="routine-btn routine-btn-edit"><i className="fas fa-edit mr-1"></i>Edit</button>}
          {canManage && !isPublished && onPublish && <button onClick={onPublish} className="routine-btn routine-btn-primary"><i className="fas fa-globe mr-1"></i>Publish</button>}
          {canManage && isPublished && onUnpublish && <button onClick={onUnpublish} className="routine-btn text-yellow-400"><i className="fas fa-eye-slash mr-1"></i>Unpublish</button>}
          {canDelete && !isPublished && onDelete && <button onClick={onDelete} className="routine-btn text-red-400"><i className="fas fa-trash"></i></button>}
        </div>
      </div>
    </div>
  );
}
