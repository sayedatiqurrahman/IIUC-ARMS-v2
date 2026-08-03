'use client';

import { useState, useEffect, useMemo } from 'react';
import type { RoutineCourse } from './types';

export default function TeacherContacts({ courses }: { courses: RoutineCourse[] }) {
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);

  const uniqueTeachers = useMemo(() => {
    const names = new Set<string>();
    for (const c of courses) {
      if (c.teacher?.trim()) names.add(c.teacher.trim());
    }
    return Array.from(names);
  }, [courses]);

  useEffect(() => {
    if (!expanded || uniqueTeachers.length === 0) return;
    fetch('/api/faculty').then(r => r.json()).then(data => {
      setFacultyList(data.members || []);
    }).catch(() => {});
  }, [expanded, uniqueTeachers.length]);

  if (uniqueTeachers.length === 0) return null;

  const matchedTeachers = uniqueTeachers.map(name => {
    const member = facultyList.find(f => f.name?.toLowerCase() === name.toLowerCase() || f.shortForm?.toUpperCase() === name.toUpperCase());
    return { name, member };
  });

  return (
    <div className="mt-4 no-print">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-dark-bg2 border border-dark-border rounded-xl cursor-pointer hover:border-qsis/30 transition-colors text-left"
      >
        <i className="fas fa-address-card text-qsis"></i>
        <span className="text-[0.82rem] font-semibold text-dark-text flex-1">Teacher Contacts ({uniqueTeachers.length})</span>
        <span className="text-[0.68rem] text-dark-text3">Click to {expanded ? 'hide' : 'show'} contact info</span>
        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-dark-text3 text-[0.6rem]`}></i>
      </button>
      {expanded && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {matchedTeachers.map(({ name, member }) => (
            <div key={name} className="flex items-center gap-3 p-3 bg-dark-bg2 border border-dark-border rounded-xl">
              {member?.memberType === 'staff' ? (
                <div className="w-9 h-9 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-user-tie text-orange-400 text-sm"></i>
                </div>
              ) : (
                <div className="w-9 h-9 rounded-full bg-qsis/15 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-chalkboard-teacher text-qsis text-sm"></i>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[0.78rem] font-semibold text-dark-text truncate">{member?.name || name}</div>
                {member?.title && <div className="text-[0.65rem] text-dark-text3 truncate">{member.title}</div>}
                <div className="flex items-center gap-3 mt-1">
                  {member?.phone && (
                    <a href={`tel:${member.phone}`} className="text-[0.65rem] text-dark-text3 hover:text-qsis flex items-center gap-1 no-underline">
                      <i className="fas fa-phone text-[0.55rem]"></i>{member.phone}
                    </a>
                  )}
                  {member?.email && (
                    <a href={`mailto:${member.email}`} className="text-[0.65rem] text-dark-text3 hover:text-qsis flex items-center gap-1 no-underline truncate">
                      <i className="fas fa-envelope text-[0.55rem]"></i>{member.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
