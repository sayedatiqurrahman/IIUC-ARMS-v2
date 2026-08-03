'use client';

import type { RoutineItem } from './types';

export default function RoutineCard({ routine, isPublished, onView, onEdit, onDelete, onDuplicate, onPublish, onUnpublish, currentUserEmail, isAdmin }: {
  routine: RoutineItem;
  isPublished?: boolean;
  onView: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (r: RoutineItem) => void;
  onPublish?: (r: RoutineItem) => void;
  onUnpublish?: (id: string) => void;
  currentUserEmail?: string;
  isAdmin?: boolean;
}) {
  const slotCount = routine.slots.length;
  const daysCount = routine.days.length;
  const courseCount = routine.courses.length;
  const dateStr = routine.createdAt ? new Date(routine.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const isCreator = !!currentUserEmail && !!routine.publishedBy?.email && routine.publishedBy.email === currentUserEmail;
  const canDelete = !isPublished || isCreator || isAdmin;

  return (
    <div className={`routine-card ${isPublished ? 'routine-card-published' : ''}`}>
        <div className="routine-card-header">
        <div className="routine-card-semester">{routine.semester}</div>
        {routine.gender && routine.gender !== 'both' && <span className="routine-card-badge" style={{ background: routine.gender === 'male' ? '#3b82f6' : '#ec4899', color: '#fff' }}>
          <i className={`fas fa-${routine.gender === 'male' ? 'mars' : 'venus'}`} style={{ marginRight: 4 }}></i>
          {routine.gender === 'male' ? 'Male' : 'Female'}
        </span>}
        {routine.gender === 'both' && <span className="routine-card-badge" style={{ background: 'linear-gradient(90deg, #3b82f6 50%, #ec4899 50%)', color: '#fff' }}>
          Male &amp; Female
        </span>}
        {routine.branch && <span className="routine-card-badge">Branch {routine.branch}</span>}
        {isPublished && <span className="routine-card-published-badge"><i className="fas fa-globe"></i> Published</span>}
        {!isPublished && routine.isDraft && <span className="routine-card-draft-badge"><i className="fas fa-pen"></i> Draft</span>}
      </div>
      <div className="routine-card-meta">
        <span><i className="fas fa-book"></i> {courseCount} courses</span>
        <span><i className="fas fa-calendar-day"></i> {daysCount} days</span>
        <span><i className="fas fa-clock"></i> {slotCount} classes</span>
      </div>
      <div className="routine-card-info">
        <span>Session: {routine.session}</span>
        {dateStr && <span>Created: {dateStr}</span>}
        {isPublished && routine.publishedBy && (
          <span><i className="fas fa-user-check"></i> Published by {routine.publishedBy.name}</span>
        )}
      </div>
      <div className="routine-card-actions">
        <button className="routine-card-btn routine-card-btn-view" onClick={() => onView(routine.id)}><i className="fas fa-eye"></i> View</button>
        {onEdit && <button className="routine-card-btn routine-card-btn-edit" onClick={() => onEdit(routine.id)}><i className="fas fa-edit"></i> Edit</button>}
        {onDuplicate && <button className="routine-card-btn routine-card-btn-dup" onClick={() => onDuplicate(routine)}><i className="fas fa-copy"></i> Duplicate</button>}
        {onPublish && !isPublished && <button className="routine-card-btn routine-card-btn-publish" onClick={() => onPublish(routine)}><i className="fas fa-share-alt"></i> Publish</button>}
        {onUnpublish && isPublished && <button className="routine-card-btn routine-card-btn-unpublish" onClick={() => onUnpublish(routine.id)}><i className="fas fa-eye-slash"></i> Unpublish</button>}
        {canDelete && onDelete && <button className="routine-card-btn routine-card-btn-delete" onClick={() => onDelete(routine.id)}><i className="fas fa-trash"></i></button>}
      </div>
    </div>
  );
}
